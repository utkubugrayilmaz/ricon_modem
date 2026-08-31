// Tak-çalıştır pipeline — tam otomatik hazırlama orkestrasyonu.
// redbox-device felsefesi: çekirdek, opts alır, throw etmez, sonuç + problems[].
//
// Akış (bir modem): algıla (fabrika 192.168.1.1 mi, saha 5.5.5.1 mi, yok mu)
// → gerekirse provizyon (idempotent, LAN sonda, reboot, yeni adreste doğrula)
// → BAŞARIYA KADAR tekrar (retry) → net sonuç.
//
// Döngü (çok modem): PC ön-kontrol → [modem bekle → hazırla → sinyal →
// çıkarılmasını bekle] tekrar. Operatör için "tak → hazır → çıkar → sıradaki".
//
// PC ağ notu: PC'de 192.168.1.x VE 5.5.5.x ikincil IP'leri KALICI dururken
// ağ değiştirmeye gerek yok — araç öncesi/sonrası doğru kaynaktan gider.

import { isReachable } from "./net.js";
import { applyProvisioning, applyPin } from "./provision.js";
import { DEVICE_NAME_KEY, SIM_PIN_KEY } from "./settings.js";
import { normalizePhone } from "./device.js";
import { readIdentity, isSimPresent, waitForInternet, pcPreflight } from "./device.js";
import { problem } from "./problems.js";
import { readMsisdn } from "./at.js";
import { canSpendPinAttempt, isAttemptBurned } from "./at.js";

const now = () => new Date().toISOString();
const prefixOf = (ip) => ip.split(".").slice(0, 3).join(".") + ".";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const notify = (opts, m) => { if (typeof opts.progress === "function") opts.progress(m); };
// Yapilandirilmis olay (UI canli guncellemesi) — provisioning.js'teki ile ayni
// sozlesme: opsiyonel, tuketicinin isi, dinleyici hatasi akisi kesmez.
const emitEvent = (opts, event) => {
  if (typeof opts.event !== "function") return;
  try { opts.event(event); } catch { /* dinleyici hatasi akisi kesmez */ }
};

// PURE: bir hazırlamanın kalıcı kayıt satırı (JSONL). Cihaza gitmez.
// Bu satır sahada "bu modem hazırlanmış mıydı, hangi hat takılıydı"
// sorusunun tek kanıtı — şema DAR ve SABİT tutulur.
export function provisionRecord({ result = {}, phone = null, identity = {},
  profileName = null, host = null, internet = null } = {}) {
  return {
    timestamp: result.timestamp || now(),
    status: result.status ?? null,
    ok: Boolean(result.ok),
    attempt: result.attempt ?? null,
    profile: profileName,
    modemIp: host,
    phone,
    lan_mac: identity.lan_mac ?? null,
    iccid: identity.iccid ?? null,
    imsi: identity.imsi ?? null,
    imei: identity.imei ?? null,
    operator: identity.operator ?? null,
    // SIM durum metni. PIN kilitli SIM'de bu alanın ne yazdığını HENÜZ
    // bilmiyoruz (görülenler: OK / Invalid / Not Insert) — kaydediyoruz ki ilk
    // PIN'li SIM'de tam değeri elimizde olsun ve 89 sn beklemek yerine anında
    // yakalayalım.
    simStatus: identity.simStatus ?? null,
    // İnternet doğrulaması: "bu SIM gerçekten çalışıyor mu" sorusunun kanıtı.
    // PIN kilitli SIM'i yakalayan şey bu (ICCID PIN'li SIM'de de okunabiliyor).
    wan_ip: internet?.wan_ip ?? identity.wan_ip ?? null,
    internetSec: internet?.durationSec ?? null,
    // PIN DENENDİ Mİ — yalnızca boolean. PIN'in KENDİSİ hiçbir zaman deftere,
    // log'a, olaya ya da rapora yazılmaz.
    pinAttempted: Boolean(result.pinAttempt?.attempted),
    // SAHAYA HAZIR MI — tek soruyla cevap. `ok` tek başına YANILTICI: ayarlar
    // doğru olsa da SIM çalışmıyorsa o modem sahada iş yapmaz. Üç değer:
    //   true  = ayarlar doğrulandı VE internet geldi
    //   false = ayarlar doğrulandı ama SIM çalışmıyor (PIN/kapsama/paket)
    //   null  = internet doğrulaması yapılmadı (kapatılmış) → BİLİNMİYOR
    fieldReady: internet === null ? null : Boolean(result.ok) && Boolean(internet.up),
  };
}

// PURE: SIM PIN alanının HEDEF değeri. Üç sonuç: PIN yaz · BOŞALT · DOKUNMA.
// Tüm PIN durumları TEK YERDE karara bağlanır ve saf olduğu için test edilir:
//
//  # SIM durumu    verilen PIN   karar
//  1 kilit yok     —             DOKUNMA (undefined)
//  2 kilit yok     var           DOKUNMA — saklı PIN SIM'i açıyor olabilir;
//                                silmek bir sonraki boot'ta kilitler
//  3 PIN kilitli   geçerli       YAZ (motor idempotent: aynıysa yazmaz)
//  4 PIN kilitli   biçim bozuk   DOKUNMA + PIN_INVALID (deneme yakılmaz)
//  5 PIN kilitli   son hak (≤1)  DOKUNMA + PIN_LAST_ATTEMPT (karar insanda)
//  6 PIN kilitli   yok           hak yakılmışsa BOŞALT, değilse DOKUNMA
//  7 PUK kilitli   —             BOŞALT (PIN yazmak işe yaramaz)
//
// 6/7'de KÖRLEMESİNE silmiyoruz: SIM kilitli görünürken modem PIN'i henüz
// göndermemiş olabilir ve DOĞRU bir PIN'i silmek zarar verir. KANITA
// bağlıyoruz: cihaz kalan hakkı söylüyor, `kalan < toplam` ise biri yanlış
// PIN göndermiş demektir (modem her boot'ta saklı PIN'i gönderiyor — ölçüldü).
// Kanıt yoksa dokunmuyoruz.
// Doner: { hedef: string|undefined, problems: [] }
export function simPinTarget(simLockInfo, pin, { manualConsent = false } = {}) {
  const problems = [];
  if (!simLockInfo?.lock) return { target: undefined, problems };          // 1, 2

  if (simLockInfo.lock === "pin" && pin) {
    // DENEME KARARI PAYLASILAN MODULDE (pin-karar.js): bicim, son hak, yanmis
    // hak. AT yolu ve internet-sonrasi deneme yolu da ayni yere soruyor.
    const k = canSpendPinAttempt(simLockInfo, pin, { manualConsent });
    if (k.eligible) return { target: String(pin), problems: k.problems };   // 3
    problems.push(...k.problems);                                       // 4, 5, 5c
  }

  // Denenmeyecek. Saklanan PIN bu SIM'e ait DEGILSE temizlenir: yoksa modem
  // her acilista yanlis PIN gonderip hak yakar.
  if (isAttemptBurned(simLockInfo) || simLockInfo.lock === "puk") {
    problems.push(problem("PIN_STALE_CLEARED", simLockInfo.pinRemaining));
    return { target: "", problems };                                     // 6, 7
  }
  return { target: undefined, problems };
}

// PIN denemesi kararı — TEK YER. `rapor.pinAttempt`yi doldurur.
//
// EN ÖNEMLİ KURAL: SON HAK OTOMATİK YAKILMAZ. Cihaz kalan deneme sayısını
// söylüyor ("PIN: 3/3"); 1 hak kalmışsa yanlış bir PIN SIM'i PUK'a kilitler ve
// bunu bir otomasyonun kendi başına riske atması kabul edilemez. O durumda
// karar insana bırakılır.
async function tryPin({ location, credentials, pin, report, opts, simState }) {
  const remaining = simState?.pinRemaining ?? null;
  // KARAR PAYLASILAN MODULDE. Burada eskiden yalniz "son hak" kontrolu vardi;
  // "daha once hak yanmis" korumasi YOKTU — nvram yolunda vardi, burada
  // yoktu (2026-08-28 denetimi). Ayni yere sorunca fark kapandi.
  const k = canSpendPinAttempt(simState ?? {}, pin);
  if (!k.eligible) {
    report.problems.push(...k.problems);
    report.pinAttempt = { attempted: false, skipped: k.reason, pinRemaining: remaining };
    return;
  }
  report.problems.push(...k.problems);   // izin verildi; varsa UYARI tasinir
  notify(opts, `SIM PIN denenecek (kalan hak: ${remaining ?? "?"})`);
  const p = await applyPin(
    { ...location, credentials, progress: opts.progress, event: opts.event }, pin,
  );
  report.pinAttempt = { attempted: p.attempted, skipped: p.skipped, pinRemaining: remaining };
  report.problems.push(...p.problems);
}

// İnternet doğrulaması + gerekirse TEK PIN denemesi. `rapor`u günceller.
// provisionModem'in içinde closure olarak duruyordu; tek işi olan ayrı bir
// fonksiyon olarak daha okunur (ve provisionModem 75 satır kısaldı).
//
// Sıra önemli: önce internet beklenir. Gelirse PIN'e HİÇ dokunulmaz — kilitli
// olmayan SIM'e PIN yazmak 3 denemeden birini yakmak demek (bkz. applyPin).
async function internetAndPin({ location, credentials, pin, internetWaitSec, report, opts,
  simState = null, pinPlanned = false }) {
  if (!(internetWaitSec > 0)) return null;

  // HIZLI YOL — cihaz "Need verification PIN code (PIN: 3/3, PUK: 10/10)"
  // diyorsa interneti beklemenin ANLAMI YOK: cevabı zaten biliyoruz. 150 sn
  // yerine 0 sn. (2026-08-27 canlı: bu metin PIN kilitli SIM'de görüldü.)
  if (simState?.lock) {
    notify(opts, `SIM ${simState.lock.toUpperCase()} kilitli — internet beklenmiyor`);
    emitEvent(opts, { kind: "sim_kilit", lock: simState.lock,
      pinRemaining: simState.pinRemaining, pukRemaining: simState.pukRemaining, raw: simState.raw });
    report.simLock = simState;
    const result = { up: false, durationSec: 0, wan_ip: null, simStatus: simState.raw };

    // PUK kilidi: PIN yazmak İŞE YARAMAZ, dokunmayız. Operatör PUK'la açacak.
    if (simState.lock === "puk") {
      report.problems.push(problem("SIM_PUK_LOCKED", simState.pukRemaining));
      report.internet = result;
      return result;
    }
    report.problems.push(problem("SIM_PIN_LOCKED", simState.pinRemaining));
    // PIN ANA PASTA YAZILDIYSA burada tekrar yazmıyoruz — ikinci bir deneme
    // yakmak olurdu. Kilit metni provizyon ÖNCESİNDEN kalma; reboot sonrası
    // gerçek durumu internet kontrolü söyleyecek.
    if (pinPlanned) {
      notify(opts, "PIN ana yazma pasinda gonderildi — internet kontrol ediliyor");
      const next = await waitForInternet({ ...location, credentials }, internetWaitSec, opts);
      report.internet = next;
      if (!next.up) report.problems.push(problem("INTERNET_DOWN", internetWaitSec, next.simStatus));
      return next;
    }
    // PIN verilmediyse burada PIN_REQUIRED EKLEMİYORUZ: SIM_PIN_LOCKED zaten
    // durumu ve doğru çözümü söylüyor. İkinci bir mesaj hem tekrar hem de ters
    // yönü ("PIN gir") öneriyor olurdu.
    if (pin) await tryPin({ location, credentials, pin, report, opts, simState });
    else report.pinAttempt = { attempted: false, skipped: "pin_verilmedi",
      pinRemaining: simState.pinRemaining };
    if (report.pinAttempt?.attempted) {
      const next = await waitForInternet({ ...location, credentials }, internetWaitSec, opts);
      report.pinAttempt.result = next.up ? "internet_geldi" : "internet_gelmedi";
      report.internet = next;
      if (!next.up) report.problems.push(problem("INTERNET_DOWN", internetWaitSec, next.simStatus));
      return next;
    }
    report.internet = result;
    return result;
  }

  notify(opts, "internet dogrulamasi (SIM calisiyor mu)");
  let result = await waitForInternet({ ...location, credentials }, internetWaitSec, opts);

  if (!result.up) {
    // İnternet gelmedi ama cihaz PIN kilidi de DEMEDİ. Yine de PIN verilmişse
    // deneriz (kilit metni her firmwarede aynı olmayabilir); son hak koruması
    // tryPin içinde.
    await tryPin({ location, credentials, pin, report, opts, simState });
    if (report.pinAttempt?.attempted) {
      result = await waitForInternet({ ...location, credentials }, internetWaitSec, opts);
      report.pinAttempt.result = result.up ? "internet_geldi" : "internet_gelmedi";
    }
  }

  report.internet = result;
  if (!result.up) {
    report.problems.push(problem("INTERNET_DOWN", internetWaitSec, result.simStatus));
  }
  return result;
}

// Her çıkışta çalışır: kimliği tamamla, kalıcı kayıt satırını üret, dışarıya
// bildir. Çekirdek DOSYAYA YAZMAZ — nereye yazılacağı tüketicinin kararı.
async function finishRecord({ report, location, readyIdentity, credentials, phone,
  profile, internet, opts }) {
  let identity = readyIdentity || {};
  if (!readyIdentity && location && credentials) {
    try {
      notify(opts, "cihaz kimligi okunuyor (kayit icin)");
      identity = await readIdentity({ ...location, credentials });
    } catch { /* kimlik okunamadi: kayit yine tutulur, alanlar null */ }
  }
  report.identity = identity;
  if (location && credentials) emitEvent(opts, { kind: "kimlik", identity: identity });
  // Duvar saati: cagrinin basindan buraya. Tuketici bunu bir olcum satirina
  // cevirebilir (bkz. summarizeMetrics). Cekirdek dosyaya YAZMAZ, sadece
  // sureyi bildirir — "ne kadar surdu" sorusunun cevabi cihaz isine ait.
  if (report.startedMs) {
    report.totalSec = Number(((Date.now() - report.startedMs) / 1000).toFixed(1));
    delete report.startedMs;
  }
  report.record = provisionRecord({
    result: report, phone: normalizePhone(phone), identity,
    profileName: profile?.name, host: location?.host ?? null, internet,
  });
  if (typeof opts.record === "function") {
    try { opts.record(report.record); } catch { /* kayit yazimi akisi bozmaz */ }
  }
  emitEvent(opts, { kind: "sonuc", status: report.status, ok: report.ok,
    attempt: report.attempt ?? null, record: report.record, problems: report.problems });
  return report;
}

// PURE: konum + dry-run durumuna göre sıradaki eylem. Test edilebilir.
// Doner: "zaten_hazir" | "provizyon_fabrika" | "provizyon_saha" | "modem_yok"
export function nextAction(factoryUp, fieldUp, fieldDryRunStatus) {
  if (fieldUp && fieldDryRunStatus === "zaten_istenen_durumda") return "zaten_hazir";
  if (fieldUp) return "provizyon_saha";   // saha adresinde ama eksik provizyon
  if (factoryUp) return "provizyon_fabrika";
  return "modem_yok";
}

// Bir modemi hazırlar (algıla → provizyon → doğrula → retry).
// opts: { factoryHost, factorySource, fieldHost, fieldSource, kimlik, profil,
//         denemeler=3, ilerle }
export async function provisionModem(opts) {
  const {
    factoryHost = "192.168.1.1", factorySource,
    fieldHost = "5.5.5.1", fieldSource,
    credentials, profile, attempts = 3, phone,
    // SIM PIN — OPSIYONEL. Yalnizca internet dogrulamasi BASARISIZ olursa ve
    // burada bir deger varsa denenir. Kilitli olmayan SIM'e ASLA yazilmaz.
    pin = null,
    // Internet dogrulamasi ust siniri (sn). 0 = kapat. Varsayilan ACIK:
    // teknisyenin elle yaptigi kaliteyi kaybetmeyelim (PIN kilitli SIM yakalar).
    internetWaitSec = 150,
    // Tuketici kimligi ZATEN okuduysa (or. UI sol paneli icin) tekrar okumayiz
    // — tek baglantili cihazda gereksiz ~4 sn demek.
    identity: readyIdentityInfo = null,
  } = opts;
  const report = { timestamp: now(), command: "hazirla", startedMs: Date.now(), problems: [] };
  // Numara CAGRIDAN gelebilir ya da CIHAZDAN okunur (asagida, SIM hazirsa).
  // `let` cunku cozum algilamadan sonra olusuyor; finish()/buildActiveProfile()
  // cagri aninda gecerli degeri goruyor.
  let phoneNormalized = normalizePhone(phone);
  let phoneSource = phoneNormalized ? "girdi" : null;

  // Ince sarmalayicilar: govdeler yukarida modul seviyesinde (internetAndPin,
  // finishRecord). Cagri yerleri degismedi.
  const verifyInternet = (location, simState, pinPlanned) =>
    internetAndPin({ location, credentials, pin, internetWaitSec, report, opts,
      simState, pinPlanned });


  const finish = (location, readyIdentity = null, internet = null) => {
    report.phone = { number: phoneNormalized, source: phoneSource };
    return finishRecord({ report, location, readyIdentity, credentials,
      phone: phoneNormalized, profile, internet, opts });
  };


  if (!credentials) {
    report.problems.push(problem("AUTH_REQUIRED", "modem"));
    report.status = "kimlik_yok"; report.ok = false; return finish(null);
  }

  // KAYNAK IP OLMADAN YOKLAMA YAPILMAZ. Sebebi olculdu: kaynak baglanmadan
  // yapilan TCP connect bazi aglarda HER adrese basarili donuyor, yani
  // "modem var" diyip olmayan cihazdan kimlik okumaya calisiyor ve sonunda
  // "SIM yok" gibi YANLIS TESHIS uretiyor (bkz. scanner.js isReachable).
  // Cagiran kaynagi vermediyse burada turetiyoruz; turetemiyorsak durup
  // gercek sebebi soyluyoruz.
  let factorySrc = factorySource;
  let fieldSrc = fieldSource;
  if (!factorySrc || !fieldSrc) {
    const on = pcPreflight(prefixOf(factoryHost), prefixOf(fieldHost));
    factorySrc = factorySrc || on.factorySource;
    fieldSrc = fieldSrc || on.fieldSource;
    if (!factorySrc && !fieldSrc) {
      report.problems.push(...on.problems);
      report.status = "pc_hazir_degil"; report.ok = false; return finish(null);
    }
  }
  // Telefon (MSISDN) hazirlamanin ZORUNLU girdisi — kayitsiz modem sahaya
  // cikmasin. AMA artik cihazdan OKUNABILIYOR (AT+CNUM, ~3 sn): verilmediyse
  // asagida SIM'den okunuyor, okunamazsa orada reddediliyor.
  //
  // Burada yalniz VERILMIS ama GECERSIZ numara reddediliyor: bu bir GIRDI
  // hatasi, cihaza gitmeye gerek yok.
  if (phone && !phoneNormalized) {
    report.problems.push(problem("MSISDN_INVALID", phone));
    report.status = "telefon_yok"; report.ok = false; return finish(null);
  }

  // ETKİN PROFİL = profil + ÇALIŞMA ANINA ÖZEL keys_. İkisi de profilde
  // sabit olamaz, çünkü her modemde/SIM'de farklıdır:
  //   · cihaz adı = telefon numarası (modeme bağlanan hangi hat olduğunu görsün;
  //     not: bu alan yalnızca parolayla girince okunur, defter hâlâ tek kaynak)
  //   · SIM PIN — YALNIZCA kilit varsa ve güvenlik kapıları geçilirse
  const buildActiveProfile = (pinTarget) => {
    const extra = {};
    if (phoneNormalized) extra[DEVICE_NAME_KEY] = `0${phoneNormalized}`;
    if (pinTarget !== undefined) extra[SIM_PIN_KEY] = pinTarget;
    return Object.keys(extra).length
      ? { ...profile, nvram: { ...profile.nvram, ...extra } } : profile;
  };

  // PIN'İ AYNI YAZMA PASINA KOYMA KARARI — tek reboot için.
  //
  // PIN nvram'da bir anahtar; ayarlarla birlikte yazılıp AYNI reboot'ta
  // yürürlüğe girebilir. Eskiden provizyon+reboot, sonra PIN+ikinci reboot
  // gerekiyordu (~35-90 sn boşa). Ölçüm (2026-08-27) modemin PIN'i saklayıp
  // her açılışta SIM'e gönderdiğini kanıtladı — mekanizma doğrulandı.
  //
  // "AYNI PIN ZATEN YAZILI" KORUMASI BEDAVA GELİYOR: motor idempotent, değer
  // aynıysa plana hiç girmez → deneme yakılmaz. Ayrı bir kontrol yazmıyoruz.
  const pinTargetOf = (simLockInfo) => {
    const { target, problems } = simPinTarget(simLockInfo, pin);
    report.problems.push(...problems);
    return target;
  };

  // Kimlik bir kez okunur: hem SIM kontrolu hem defter kaydi ayni okumayi
  // kullanir (cihaza iki kez gitmeyiz).
  let identityBefore = readyIdentityInfo;

  // Tuketici kimligi zaten okuduysa ve SIM yoksa: cihaza HIC GITMEDEN reddet.
  // (Ayni kontrol asagida, kimligi kendimiz okudugumuz yolda da var.)
  if (readyIdentityInfo && !isSimPresent(readyIdentityInfo)) {
    report.problems.push(problem("SIM_MISSING", readyIdentityInfo.simStatus));
    report.status = "sim_yok"; report.ok = false;
    return finish(null, readyIdentityInfo);
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    notify(opts, `deneme ${attempt}/${attempts}: modem algilaniyor`);
    const factoryUp = factorySrc ? await isReachable(factoryHost, factorySrc) : false;
    const fieldUp = factoryUp || !fieldSrc ? false : await isReachable(fieldHost, fieldSrc);
    const location = factoryUp
      ? { host: factoryHost, sourceIp: factorySrc }
      : fieldUp ? { host: fieldHost, sourceIp: fieldSrc } : null;

    // SIM KONTROLU — nvram'a bakmadan, HICBIR SEY yazmadan, EN BASTA.
    // Sebep: SIM'siz modemde provizyon "basarili" gorunur ama cihaz sebekeye
    // kaydolamaz; defterde ICCID'siz satir kalir. 45 sn harcayip sonunda
    // anlamak yerine ilk saniyede soyluyoruz (2026-08-27 canli gozlem).
    if (location && !identityBefore) {
      notify(opts, `kimlik/SIM kontrolu (${location.host})`);
      try {
        identityBefore = await readIdentity({ ...location, credentials });
      } catch { identityBefore = null; }
    }
    if (location && identityBefore && !isSimPresent(identityBefore)) {
      report.problems.push(problem("SIM_MISSING", identityBefore.simStatus));
      report.status = "sim_yok"; report.attempt = attempt; report.ok = false;
      return finish(location, identityBefore);
    }

    // NUMARAYI CIHAZDAN OKU — verilmediyse. SIM KONTROLUNDEN SONRA: SIM yoksa
    // gercek sorun "SIM yok"tur, "telefon yok" demek yanlis teshis olur
    // (projenin kurali: en temel eksik en basta soylenir).
    //
    // Bu adim provisionModem'in ICINDE, arayuzde degil: CLI, HTTP ucu ve
    // baska bir Node projesi de otomatik numara aliyor.
    if (location && !phoneNormalized && identityBefore?.sim?.ready) {
      notify(opts, "telefon numarasi SIM'den okunuyor (AT+CNUM)");
      const n = await readMsisdn({ ...location, credentials });
      if (n.phone) {
        phoneNormalized = n.phone;
        phoneSource = "cihaz";
      } else {
        report.problems.push(...n.problems);
      }
    }
    // YEDEK: tuketiciye sor (CLI operatore sorar, arayuz alani acar).
    // `deneme` gecilir ki dongude "3. modem" yazsin — sabit 1 yaziyordu.
    if (location && !phoneNormalized && typeof opts.askPhone === "function") {
      const manual = normalizePhone(await opts.askPhone(attempt));
      if (manual) { phoneNormalized = manual; phoneSource = "operator"; }
    }
    // Numara YOK. Son denemede vazgec; oncesinde DEVAM ET — okuma gecici
    // olarak da basarisiz olabiliyor (telnet dusmesi olculdu) ve
    // `denemeler` tam bunun icin var. Ilk turda return etmek retry'i
    // isletmiyordu.
    if (location && !phoneNormalized) {
      if (attempt < attempts) {
        notify(opts, "numara okunamadi, yeniden denenecek");
        await wait(2000);
        continue;
      }
      report.problems.push(problem("MSISDN_REQUIRED", "—"));
      report.status = "telefon_yok"; report.ok = false;
      return finish(location, identityBefore);
    }


    // Kimlik okundu; PIN karari ve etkin profil BURADA kuruluyor (once
    // kuramazdik: kilit bilgisi kimlik okumasindan geliyor).
    const simLockInfo = identityBefore?.sim ?? null;
    const pinTarget = pinTargetOf(simLockInfo);
    const pinPlanned = typeof pinTarget === "string" && pinTarget !== "";
    const activeProfile = buildActiveProfile(pinTarget);

    // Saha adresinde mi? Zaten hazir mi diye dry-run.
    let fieldDry = null;
    if (fieldUp) {
      const d = await applyProvisioning(
        { host: fieldHost, sourceIp: fieldSrc, credentials, apply: false, event: opts.event },
        activeProfile,
      );
      fieldDry = d.status;
    }

    const action = nextAction(factoryUp, fieldUp, fieldDry);
    report.lastAction = action;
    emitEvent(opts, { kind: "algilandi", action, attempt,
      location: factoryUp ? factoryHost : fieldUp ? fieldHost : null });

    if (action === "zaten_hazir") {
      report.attempt = attempt; report.ok = true;
      const fieldPlace = { host: fieldHost, sourceIp: fieldSrc };
      const net = await verifyInternet(fieldPlace, simLockInfo, pinPlanned);
      report.status = !net || net.up ? "zaten_hazir"
        : (report.simLock?.lock ? "zaten_hazir_sim_kilitli" : "zaten_hazir_internet_yok");
      return finish(fieldPlace, identityBefore, net);
    }
    if (action === "modem_yok") {
      report.problems.push(problem("DEVICE_UNREACHABLE", `${factoryHost}/${fieldHost}`));
      if (attempt < attempts) { await wait(3000); continue; }
      report.status = "modem_yok"; report.ok = false; return finish(null);
    }

    // Provizyon: fabrikadaysa factoryHost'tan (LAN degisecek+reboot+yeni adres
    // dogrulama); sahadaysa fieldHost'tan (LAN degismez, eksikleri tamamla).
    const atFactory = action === "provizyon_fabrika";
    const r = await applyProvisioning({
      host: atFactory ? factoryHost : fieldHost,
      sourceIp: atFactory ? factorySrc : fieldSrc,
      credentials, apply: true,
      newHost: fieldHost, newSourceIp: fieldSrc,
      progress: opts.progress, event: opts.event,
    }, activeProfile);
    report.attempt = attempt;
    report.detail = { status: r.status, planObj: r.planObj?.changingCount, verification: r.verification };

    // PIN ana pasta gercekten yazildi mi? Yazilmadiysa (plan onu "ayni" gordu)
    // demek ki AYNI PIN nvram'da zaten duruyordu ama SIM yine kilitliydi:
    // yani KAYITLI PIN YANLIS. Operatore bunu soylemek, ayni PIN'i tekrar
    // tekrar yazdirmaktan iyidir.
    if (pinPlanned) {
      const writtenKeys = Object.values(r.written ?? {}).flat();
      const wasWritten = writtenKeys.includes(SIM_PIN_KEY);
      report.pinAttempt = { attempted: wasWritten, pinRemaining: simLockInfo?.pinRemaining ?? null,
        skipped: wasWritten ? null : "ayni_pin_zaten_yazili" };
      if (!wasWritten) report.problems.push(problem("PIN_STORED_WRONG"));
    }
    if (r.ok && (r.status === "basarili" || r.status === "zaten_istenen_durumda")) {
      report.ok = true;
      const fieldPlace = { host: fieldHost, sourceIp: fieldSrc };
      const net = await verifyInternet(fieldPlace, simLockInfo, pinPlanned);
      report.status = !net || net.up ? "hazir"
        : (report.simLock?.lock ? "hazir_sim_kilitli" : "hazir_internet_yok");
      return finish(fieldPlace, identityBefore, net);
    }
    report.problems.push(...r.problems);
    notify(opts, `deneme ${attempt} basarisiz (${r.status}); tekrar denenecek`);
    if (attempt < attempts) await wait(5000);
  }
  report.status = "basarisiz"; report.ok = false;
  // Basarisiz kayit da KIMLIKLI olsun: cihaz hangi adreste cevap veriyorsa
  // oradan oku (LAN IP yazilmis ama dogrulama tamamlanmamis olabilir).
  const atField = await isReachable(fieldHost, fieldSrc);
  const atFactory = atField ? false : await isReachable(factoryHost, factorySrc);
  return finish(
    atField ? { host: fieldHost, sourceIp: fieldSrc }
      : atFactory ? { host: factoryHost, sourceIp: factorySrc } : null,
  );
}

// Döngü: çok modem için. Bir modem hazırlanınca çıkarılmasını (link/erisim
// kaybı) bekler, sonra sıradakine geçer. maxModems ile sınırlanabilir.
// opts: provisionModem opts + { maxModems=Infinity, waitForRemoval=true }
export async function provisionLoop(opts) {
  const on = pcPreflight(
    (opts.factoryHost || "192.168.1.1").split(".").slice(0, 3).join(".") + ".",
    (opts.fieldHost || "5.5.5.1").split(".").slice(0, 3).join(".") + ".",
  );
  const result = { timestamp: now(), command: "hazirla-dongu", provisioned: [], problems: [] };
  if (!on.ready) {
    result.problems.push(...on.problems);
    result.ok = false;
    return result;
  }
  const modemOptions = { ...opts, factorySource: on.factorySource, fieldSource: on.fieldSource };
  const maxModems = opts.maxModems ?? Infinity;

  let counter = 0;
  while (counter < maxModems) {
    notify(opts, "modem takilmasi bekleniyor...");
    await waitForModem(modemOptions);
    notify(opts, "modem algilandi, hazirlaniyor");
    // Numarayi SORMUYORUZ: provisionModem onu SIM'den okuyor. Okuyamazsa
    // yine opts.askPhone'a dusuyor — yani yedek yol duruyor, ama artik
    // her modemde operatoru bekletmiyor. Dongunun amaci tam bu: tak, cikar.
    const r = await provisionModem({ ...modemOptions, phone: opts.phone });
    result.provisioned.push({
      status: r.status, ok: r.ok, attempt: r.attempt, totalSec: r.totalSec ?? null,
      phone: r.record?.phone ?? null, iccid: r.record?.iccid ?? null,
    });
    // Dongu SURESIZ calisir; sonuc nesnesi cikista donuyor. Olcum satiri
    // MODEM BASINA yazilmali, yoksa hicbir zaman yazilmaz. Cekirdek yine
    // dosyaya dokunmuyor — tuketicinin geri cagrisini calistiriyor.
    if (typeof opts.metricsRecord === "function") {
      try { opts.metricsRecord(r); } catch { /* olcum yazimi akisi bozmaz */ }
    }
    counter += 1;
    notify(opts, r.ok ? `HAZIR (${r.status}) — cihazi cikarabilirsin` : `BASARISIZ (${r.status})`);
    if (opts.waitForRemoval !== false) await waitForModemRemoval(modemOptions);
  }
  result.ok = result.provisioned.every((h) => h.ok);
  return result;
}

// Modem takılana kadar bekler (fabrika ya da saha adresinde cevap).
async function waitForModem({ factoryHost = "192.168.1.1", factorySource,
  fieldHost = "5.5.5.1", fieldSource } = {}) {
  for (;;) {
    if (await isReachable(factoryHost, factorySource)) return;
    if (await isReachable(fieldHost, fieldSource)) return;
    await wait(3000);
  }
}

// Modem çıkarılana kadar bekler (her iki adreste de erişim kaybolunca).
async function waitForModemRemoval({ factoryHost = "192.168.1.1", factorySource,
  fieldHost = "5.5.5.1", fieldSource } = {}) {
  for (;;) {
    const f = await isReachable(factoryHost, factorySource);
    const s = f ? true : await isReachable(fieldHost, fieldSource);
    if (!f && !s) return;
    await wait(3000);
  }
}
