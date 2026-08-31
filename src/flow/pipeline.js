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

import { isReachable } from "../transport/scanner.js";
import { applyProvisioning, applyPin } from "./provisioning.js";
import { DEVICE_NAME_KEY, SIM_PIN_KEY } from "../domain/profile.js";
import { normalizePhone } from "../device/sim.js";
import { readIdentity, simTakiliMi, waitForInternet, pcPreflight } from "../device/cihaz.js";
import { problem } from "../domain/problems.js";
import { readMsisdn } from "../device/at.js";
import { pinDenemesiUygunMu, hakYakilmisMi } from "../domain/pin-karar.js";

const now = () => new Date().toISOString();
const onekAl = (ip) => ip.split(".").slice(0, 3).join(".") + ".";
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const bildir = (opts, m) => { if (typeof opts.ilerle === "function") opts.ilerle(m); };
// Yapilandirilmis olay (UI canli guncellemesi) — provisioning.js'teki ile ayni
// sozlesme: opsiyonel, tuketicinin isi, dinleyici hatasi akisi kesmez.
const olayla = (opts, olay) => {
  if (typeof opts.olay !== "function") return;
  try { opts.olay(olay); } catch { /* dinleyici hatasi akisi kesmez */ }
};

// PURE: bir hazırlamanın kalıcı kayıt satırı (JSONL). Cihaza gitmez.
// Bu satır sahada "bu modem hazırlanmış mıydı, hangi hat takılıydı"
// sorusunun tek kanıtı — şema DAR ve SABİT tutulur.
export function provisionRecord({ sonuc = {}, telefon = null, kimlikBilgi = {},
  profilAd = null, host = null, internet = null } = {}) {
  return {
    zaman: sonuc.zaman || now(),
    durum: sonuc.durum ?? null,
    ok: Boolean(sonuc.ok),
    deneme: sonuc.deneme ?? null,
    profil: profilAd,
    modem_ip: host,
    telefon,
    lan_mac: kimlikBilgi.lan_mac ?? null,
    iccid: kimlikBilgi.iccid ?? null,
    imsi: kimlikBilgi.imsi ?? null,
    imei: kimlikBilgi.imei ?? null,
    operator: kimlikBilgi.operator ?? null,
    // SIM durum metni. PIN kilitli SIM'de bu alanın ne yazdığını HENÜZ
    // bilmiyoruz (görülenler: OK / Invalid / Not Insert) — kaydediyoruz ki ilk
    // PIN'li SIM'de tam değeri elimizde olsun ve 89 sn beklemek yerine anında
    // yakalayalım.
    sim_durumu: kimlikBilgi.sim_durumu ?? null,
    // İnternet doğrulaması: "bu SIM gerçekten çalışıyor mu" sorusunun kanıtı.
    // PIN kilitli SIM'i yakalayan şey bu (ICCID PIN'li SIM'de de okunabiliyor).
    wan_ip: internet?.wan_ip ?? kimlikBilgi.wan_ip ?? null,
    internet_sure_sn: internet?.sure_sn ?? null,
    // PIN DENENDİ Mİ — yalnızca boolean. PIN'in KENDİSİ hiçbir zaman deftere,
    // log'a, olaya ya da rapora yazılmaz.
    pin_denendi: Boolean(sonuc.pin_denemesi?.denendi),
    // SAHAYA HAZIR MI — tek soruyla cevap. `ok` tek başına YANILTICI: ayarlar
    // doğru olsa da SIM çalışmıyorsa o modem sahada iş yapmaz. Üç değer:
    //   true  = ayarlar doğrulandı VE internet geldi
    //   false = ayarlar doğrulandı ama SIM çalışmıyor (PIN/kapsama/paket)
    //   null  = internet doğrulaması yapılmadı (kapatılmış) → BİLİNMİYOR
    sahaya_hazir: internet === null ? null : Boolean(sonuc.ok) && Boolean(internet.var),
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
export function simPinHedefi(simKilit, pin, { elleOnay = false } = {}) {
  const problems = [];
  if (!simKilit?.kilit) return { hedef: undefined, problems };          // 1, 2

  if (simKilit.kilit === "pin" && pin) {
    // DENEME KARARI PAYLASILAN MODULDE (pin-karar.js): bicim, son hak, yanmis
    // hak. AT yolu ve internet-sonrasi deneme yolu da ayni yere soruyor.
    const k = pinDenemesiUygunMu(simKilit, pin, { elleOnay });
    if (k.uygun) return { hedef: String(pin), problems: k.problems };   // 3
    problems.push(...k.problems);                                       // 4, 5, 5c
  }

  // Denenmeyecek. Saklanan PIN bu SIM'e ait DEGILSE temizlenir: yoksa modem
  // her acilista yanlis PIN gonderip hak yakar.
  if (hakYakilmisMi(simKilit) || simKilit.kilit === "puk") {
    problems.push(problem("PIN_STALE_CLEARED", simKilit.pin_kalan));
    return { hedef: "", problems };                                     // 6, 7
  }
  return { hedef: undefined, problems };
}

// PIN denemesi kararı — TEK YER. `rapor.pin_denemesi`yi doldurur.
//
// EN ÖNEMLİ KURAL: SON HAK OTOMATİK YAKILMAZ. Cihaz kalan deneme sayısını
// söylüyor ("PIN: 3/3"); 1 hak kalmışsa yanlış bir PIN SIM'i PUK'a kilitler ve
// bunu bir otomasyonun kendi başına riske atması kabul edilemez. O durumda
// karar insana bırakılır.
async function pinDene({ konum, kimlik, pin, rapor, opts, simDurum }) {
  const kalan = simDurum?.pin_kalan ?? null;
  // KARAR PAYLASILAN MODULDE. Burada eskiden yalniz "son hak" kontrolu vardi;
  // "daha once hak yanmis" korumasi YOKTU — nvram yolunda vardi, burada
  // yoktu (2026-08-28 denetimi). Ayni yere sorunca fark kapandi.
  const k = pinDenemesiUygunMu(simDurum ?? {}, pin);
  if (!k.uygun) {
    rapor.problems.push(...k.problems);
    rapor.pin_denemesi = { denendi: false, atlandi: k.sebep, pin_kalan: kalan };
    return;
  }
  rapor.problems.push(...k.problems);   // izin verildi; varsa UYARI tasinir
  bildir(opts, `SIM PIN denenecek (kalan hak: ${kalan ?? "?"})`);
  const p = await applyPin(
    { ...konum, kimlik, ilerle: opts.ilerle, olay: opts.olay }, pin,
  );
  rapor.pin_denemesi = { denendi: p.denendi, atlandi: p.atlandi, pin_kalan: kalan };
  rapor.problems.push(...p.problems);
}

// İnternet doğrulaması + gerekirse TEK PIN denemesi. `rapor`u günceller.
// provisionModem'in içinde closure olarak duruyordu; tek işi olan ayrı bir
// fonksiyon olarak daha okunur (ve provisionModem 75 satır kısaldı).
//
// Sıra önemli: önce internet beklenir. Gelirse PIN'e HİÇ dokunulmaz — kilitli
// olmayan SIM'e PIN yazmak 3 denemeden birini yakmak demek (bkz. applyPin).
async function internetVePin({ konum, kimlik, pin, internetBekle, rapor, opts,
  simDurum = null, pinPlanlandi = false }) {
  if (!(internetBekle > 0)) return null;

  // HIZLI YOL — cihaz "Need verification PIN code (PIN: 3/3, PUK: 10/10)"
  // diyorsa interneti beklemenin ANLAMI YOK: cevabı zaten biliyoruz. 150 sn
  // yerine 0 sn. (2026-08-27 canlı: bu metin PIN kilitli SIM'de görüldü.)
  if (simDurum?.kilit) {
    bildir(opts, `SIM ${simDurum.kilit.toUpperCase()} kilitli — internet beklenmiyor`);
    olayla(opts, { tur: "sim_kilit", kilit: simDurum.kilit,
      pin_kalan: simDurum.pin_kalan, puk_kalan: simDurum.puk_kalan, ham: simDurum.ham });
    rapor.sim_kilit = simDurum;
    const sonuc = { var: false, sure_sn: 0, wan_ip: null, sim_durumu: simDurum.ham };

    // PUK kilidi: PIN yazmak İŞE YARAMAZ, dokunmayız. Operatör PUK'la açacak.
    if (simDurum.kilit === "puk") {
      rapor.problems.push(problem("SIM_PUK_LOCKED", simDurum.puk_kalan));
      rapor.internet = sonuc;
      return sonuc;
    }
    rapor.problems.push(problem("SIM_PIN_LOCKED", simDurum.pin_kalan));
    // PIN ANA PASTA YAZILDIYSA burada tekrar yazmıyoruz — ikinci bir deneme
    // yakmak olurdu. Kilit metni provizyon ÖNCESİNDEN kalma; reboot sonrası
    // gerçek durumu internet kontrolü söyleyecek.
    if (pinPlanlandi) {
      bildir(opts, "PIN ana yazma pasinda gonderildi — internet kontrol ediliyor");
      const yeni = await waitForInternet({ ...konum, kimlik }, internetBekle, opts);
      rapor.internet = yeni;
      if (!yeni.var) rapor.problems.push(problem("INTERNET_YOK", internetBekle, yeni.sim_durumu));
      return yeni;
    }
    // PIN verilmediyse burada PIN_REQUIRED EKLEMİYORUZ: SIM_PIN_LOCKED zaten
    // durumu ve doğru çözümü söylüyor. İkinci bir mesaj hem tekrar hem de ters
    // yönü ("PIN gir") öneriyor olurdu.
    if (pin) await pinDene({ konum, kimlik, pin, rapor, opts, simDurum });
    else rapor.pin_denemesi = { denendi: false, atlandi: "pin_verilmedi",
      pin_kalan: simDurum.pin_kalan };
    if (rapor.pin_denemesi?.denendi) {
      const yeni = await waitForInternet({ ...konum, kimlik }, internetBekle, opts);
      rapor.pin_denemesi.sonuc = yeni.var ? "internet_geldi" : "internet_gelmedi";
      rapor.internet = yeni;
      if (!yeni.var) rapor.problems.push(problem("INTERNET_YOK", internetBekle, yeni.sim_durumu));
      return yeni;
    }
    rapor.internet = sonuc;
    return sonuc;
  }

  bildir(opts, "internet dogrulamasi (SIM calisiyor mu)");
  let sonuc = await waitForInternet({ ...konum, kimlik }, internetBekle, opts);

  if (!sonuc.var) {
    // İnternet gelmedi ama cihaz PIN kilidi de DEMEDİ. Yine de PIN verilmişse
    // deneriz (kilit metni her firmwarede aynı olmayabilir); son hak koruması
    // pinDene içinde.
    await pinDene({ konum, kimlik, pin, rapor, opts, simDurum });
    if (rapor.pin_denemesi?.denendi) {
      sonuc = await waitForInternet({ ...konum, kimlik }, internetBekle, opts);
      rapor.pin_denemesi.sonuc = sonuc.var ? "internet_geldi" : "internet_gelmedi";
    }
  }

  rapor.internet = sonuc;
  if (!sonuc.var) {
    rapor.problems.push(problem("INTERNET_YOK", internetBekle, sonuc.sim_durumu));
  }
  return sonuc;
}

// Her çıkışta çalışır: kimliği tamamla, kalıcı kayıt satırını üret, dışarıya
// bildir. Çekirdek DOSYAYA YAZMAZ — nereye yazılacağı tüketicinin kararı.
async function kaydiTamamla({ rapor, konum, hazirKimlik, kimlik, telefon,
  profil, internet, opts }) {
  let kimlikBilgi = hazirKimlik || {};
  if (!hazirKimlik && konum && kimlik) {
    try {
      bildir(opts, "cihaz kimligi okunuyor (kayit icin)");
      kimlikBilgi = await readIdentity({ ...konum, kimlik });
    } catch { /* kimlik okunamadi: kayit yine tutulur, alanlar null */ }
  }
  rapor.kimlik_bilgi = kimlikBilgi;
  if (konum && kimlik) olayla(opts, { tur: "kimlik", kimlik_bilgi: kimlikBilgi });
  rapor.kayit = provisionRecord({
    sonuc: rapor, telefon: normalizePhone(telefon), kimlikBilgi,
    profilAd: profil?.ad, host: konum?.host ?? null, internet,
  });
  if (typeof opts.kayit === "function") {
    try { opts.kayit(rapor.kayit); } catch { /* kayit yazimi akisi bozmaz */ }
  }
  olayla(opts, { tur: "sonuc", durum: rapor.durum, ok: rapor.ok,
    deneme: rapor.deneme ?? null, kayit: rapor.kayit, problems: rapor.problems });
  return rapor;
}

// PURE: konum + dry-run durumuna göre sıradaki eylem. Test edilebilir.
// Doner: "zaten_hazir" | "provizyon_fabrika" | "provizyon_saha" | "modem_yok"
export function nextAction(fabrikaVar, sahaVar, sahaDryRunDurum) {
  if (sahaVar && sahaDryRunDurum === "zaten_istenen_durumda") return "zaten_hazir";
  if (sahaVar) return "provizyon_saha";   // saha adresinde ama eksik provizyon
  if (fabrikaVar) return "provizyon_fabrika";
  return "modem_yok";
}

// Bir modemi hazırlar (algıla → provizyon → doğrula → retry).
// opts: { fabrikaHost, fabrikaKaynak, sahaHost, sahaKaynak, kimlik, profil,
//         denemeler=3, ilerle }
export async function provisionModem(opts) {
  const {
    fabrikaHost = "192.168.1.1", fabrikaKaynak,
    sahaHost = "5.5.5.1", sahaKaynak,
    kimlik, profil, denemeler = 3, telefon,
    // SIM PIN — OPSIYONEL. Yalnizca internet dogrulamasi BASARISIZ olursa ve
    // burada bir deger varsa denenir. Kilitli olmayan SIM'e ASLA yazilmaz.
    pin = null,
    // Internet dogrulamasi ust siniri (sn). 0 = kapat. Varsayilan ACIK:
    // teknisyenin elle yaptigi kaliteyi kaybetmeyelim (PIN kilitli SIM yakalar).
    internetBekle = 150,
    // Tuketici kimligi ZATEN okuduysa (or. UI sol paneli icin) tekrar okumayiz
    // — tek baglantili cihazda gereksiz ~4 sn demek.
    kimlikBilgi: hazirKimlikBilgi = null,
  } = opts;
  const rapor = { zaman: now(), komut: "hazirla", problems: [] };
  // Numara CAGRIDAN gelebilir ya da CIHAZDAN okunur (asagida, SIM hazirsa).
  // `let` cunku cozum algilamadan sonra olusuyor; bitir()/etkinProfilYap()
  // cagri aninda gecerli degeri goruyor.
  let telefonNorm = normalizePhone(telefon);
  let telefonKaynak = telefonNorm ? "girdi" : null;

  // Ince sarmalayicilar: govdeler yukarida modul seviyesinde (internetVePin,
  // kaydiTamamla). Cagri yerleri degismedi.
  const internetiDogrula = (konum, simDurum, pinPlanlandi) =>
    internetVePin({ konum, kimlik, pin, internetBekle, rapor, opts,
      simDurum, pinPlanlandi });


  const bitir = (konum, hazirKimlik = null, internet = null) => {
    rapor.telefon = { numara: telefonNorm, kaynak: telefonKaynak };
    return kaydiTamamla({ rapor, konum, hazirKimlik, kimlik,
      telefon: telefonNorm, profil, internet, opts });
  };


  if (!kimlik) {
    rapor.problems.push(problem("AUTH_REQUIRED", "modem"));
    rapor.durum = "kimlik_yok"; rapor.ok = false; return bitir(null);
  }

  // KAYNAK IP OLMADAN YOKLAMA YAPILMAZ. Sebebi olculdu: kaynak baglanmadan
  // yapilan TCP connect bazi aglarda HER adrese basarili donuyor, yani
  // "modem var" diyip olmayan cihazdan kimlik okumaya calisiyor ve sonunda
  // "SIM yok" gibi YANLIS TESHIS uretiyor (bkz. scanner.js isReachable).
  // Cagiran kaynagi vermediyse burada turetiyoruz; turetemiyorsak durup
  // gercek sebebi soyluyoruz.
  let kFabrika = fabrikaKaynak;
  let kSaha = sahaKaynak;
  if (!kFabrika || !kSaha) {
    const on = pcPreflight(onekAl(fabrikaHost), onekAl(sahaHost));
    kFabrika = kFabrika || on.fabrikaKaynak;
    kSaha = kSaha || on.sahaKaynak;
    if (!kFabrika && !kSaha) {
      rapor.problems.push(...on.problems);
      rapor.durum = "pc_hazir_degil"; rapor.ok = false; return bitir(null);
    }
  }
  // Telefon (MSISDN) hazirlamanin ZORUNLU girdisi — kayitsiz modem sahaya
  // cikmasin. AMA artik cihazdan OKUNABILIYOR (AT+CNUM, ~3 sn): verilmediyse
  // asagida SIM'den okunuyor, okunamazsa orada reddediliyor.
  //
  // Burada yalniz VERILMIS ama GECERSIZ numara reddediliyor: bu bir GIRDI
  // hatasi, cihaza gitmeye gerek yok.
  if (telefon && !telefonNorm) {
    rapor.problems.push(problem("MSISDN_INVALID", telefon));
    rapor.durum = "telefon_yok"; rapor.ok = false; return bitir(null);
  }

  // ETKİN PROFİL = profil + ÇALIŞMA ANINA ÖZEL anahtarlar. İkisi de profilde
  // sabit olamaz, çünkü her modemde/SIM'de farklıdır:
  //   · cihaz adı = telefon numarası (modeme bağlanan hangi hat olduğunu görsün;
  //     not: bu alan yalnızca parolayla girince okunur, defter hâlâ tek kaynak)
  //   · SIM PIN — YALNIZCA kilit varsa ve güvenlik kapıları geçilirse
  const etkinProfilYap = (pinHedef) => {
    const ek = {};
    if (telefonNorm) ek[DEVICE_NAME_KEY] = `0${telefonNorm}`;
    if (pinHedef !== undefined) ek[SIM_PIN_KEY] = pinHedef;
    return Object.keys(ek).length
      ? { ...profil, nvram: { ...profil.nvram, ...ek } } : profil;
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
  const pinHedefi = (simKilit) => {
    const { hedef, problems } = simPinHedefi(simKilit, pin);
    rapor.problems.push(...problems);
    return hedef;
  };

  // Kimlik bir kez okunur: hem SIM kontrolu hem defter kaydi ayni okumayi
  // kullanir (cihaza iki kez gitmeyiz).
  let kimlikBilgiOnce = hazirKimlikBilgi;

  // Tuketici kimligi zaten okuduysa ve SIM yoksa: cihaza HIC GITMEDEN reddet.
  // (Ayni kontrol asagida, kimligi kendimiz okudugumuz yolda da var.)
  if (hazirKimlikBilgi && !simTakiliMi(hazirKimlikBilgi)) {
    rapor.problems.push(problem("SIM_MISSING", hazirKimlikBilgi.sim_durumu));
    rapor.durum = "sim_yok"; rapor.ok = false;
    return bitir(null, hazirKimlikBilgi);
  }

  for (let deneme = 1; deneme <= denemeler; deneme += 1) {
    bildir(opts, `deneme ${deneme}/${denemeler}: modem algilaniyor`);
    const fabrikaVar = kFabrika ? await isReachable(fabrikaHost, kFabrika) : false;
    const sahaVar = fabrikaVar || !kSaha ? false : await isReachable(sahaHost, kSaha);
    const konum = fabrikaVar
      ? { host: fabrikaHost, kaynakIp: kFabrika }
      : sahaVar ? { host: sahaHost, kaynakIp: kSaha } : null;

    // SIM KONTROLU — nvram'a bakmadan, HICBIR SEY yazmadan, EN BASTA.
    // Sebep: SIM'siz modemde provizyon "basarili" gorunur ama cihaz sebekeye
    // kaydolamaz; defterde ICCID'siz satir kalir. 45 sn harcayip sonunda
    // anlamak yerine ilk saniyede soyluyoruz (2026-08-27 canli gozlem).
    if (konum && !kimlikBilgiOnce) {
      bildir(opts, `kimlik/SIM kontrolu (${konum.host})`);
      try {
        kimlikBilgiOnce = await readIdentity({ ...konum, kimlik });
      } catch { kimlikBilgiOnce = null; }
    }
    if (konum && kimlikBilgiOnce && !simTakiliMi(kimlikBilgiOnce)) {
      rapor.problems.push(problem("SIM_MISSING", kimlikBilgiOnce.sim_durumu));
      rapor.durum = "sim_yok"; rapor.deneme = deneme; rapor.ok = false;
      return bitir(konum, kimlikBilgiOnce);
    }

    // NUMARAYI CIHAZDAN OKU — verilmediyse. SIM KONTROLUNDEN SONRA: SIM yoksa
    // gercek sorun "SIM yok"tur, "telefon yok" demek yanlis teshis olur
    // (projenin kurali: en temel eksik en basta soylenir).
    //
    // Bu adim provisionModem'in ICINDE, arayuzde degil: CLI, HTTP ucu ve
    // baska bir Node projesi de otomatik numara aliyor.
    if (konum && !telefonNorm && kimlikBilgiOnce?.sim?.hazir) {
      bildir(opts, "telefon numarasi SIM'den okunuyor (AT+CNUM)");
      const n = await readMsisdn({ ...konum, kimlik });
      if (n.telefon) {
        telefonNorm = n.telefon;
        telefonKaynak = "cihaz";
      } else {
        rapor.problems.push(...n.problems);
      }
    }
    // YEDEK: tuketiciye sor (CLI operatore sorar, arayuz alani acar).
    // `deneme` gecilir ki dongude "3. modem" yazsin — sabit 1 yaziyordu.
    if (konum && !telefonNorm && typeof opts.telefonSor === "function") {
      const elle = normalizePhone(await opts.telefonSor(deneme));
      if (elle) { telefonNorm = elle; telefonKaynak = "operator"; }
    }
    // Numara YOK. Son denemede vazgec; oncesinde DEVAM ET — okuma gecici
    // olarak da basarisiz olabiliyor (telnet dusmesi olculdu) ve
    // `denemeler` tam bunun icin var. Ilk turda return etmek retry'i
    // isletmiyordu.
    if (konum && !telefonNorm) {
      if (deneme < denemeler) {
        bildir(opts, "numara okunamadi, yeniden denenecek");
        await bekle(2000);
        continue;
      }
      rapor.problems.push(problem("MSISDN_REQUIRED", "—"));
      rapor.durum = "telefon_yok"; rapor.ok = false;
      return bitir(konum, kimlikBilgiOnce);
    }


    // Kimlik okundu; PIN karari ve etkin profil BURADA kuruluyor (once
    // kuramazdik: kilit bilgisi kimlik okumasindan geliyor).
    const simKilit = kimlikBilgiOnce?.sim ?? null;
    const pinHedef = pinHedefi(simKilit);
    const pinPlanlandi = typeof pinHedef === "string" && pinHedef !== "";
    const etkinProfil = etkinProfilYap(pinHedef);

    // Saha adresinde mi? Zaten hazir mi diye dry-run.
    let sahaDry = null;
    if (sahaVar) {
      const d = await applyProvisioning(
        { host: sahaHost, kaynakIp: kSaha, kimlik, uygula: false, olay: opts.olay },
        etkinProfil,
      );
      sahaDry = d.durum;
    }

    const eylem = nextAction(fabrikaVar, sahaVar, sahaDry);
    rapor.son_eylem = eylem;
    olayla(opts, { tur: "algilandi", eylem, deneme,
      konum: fabrikaVar ? fabrikaHost : sahaVar ? sahaHost : null });

    if (eylem === "zaten_hazir") {
      rapor.deneme = deneme; rapor.ok = true;
      const konumSaha = { host: sahaHost, kaynakIp: kSaha };
      const net = await internetiDogrula(konumSaha, simKilit, pinPlanlandi);
      rapor.durum = !net || net.var ? "zaten_hazir"
        : (rapor.sim_kilit?.kilit ? "zaten_hazir_sim_kilitli" : "zaten_hazir_internet_yok");
      return bitir(konumSaha, kimlikBilgiOnce, net);
    }
    if (eylem === "modem_yok") {
      rapor.problems.push(problem("DEVICE_UNREACHABLE", `${fabrikaHost}/${sahaHost}`));
      if (deneme < denemeler) { await bekle(3000); continue; }
      rapor.durum = "modem_yok"; rapor.ok = false; return bitir(null);
    }

    // Provizyon: fabrikadaysa fabrikaHost'tan (LAN degisecek+reboot+yeni adres
    // dogrulama); sahadaysa sahaHost'tan (LAN degismez, eksikleri tamamla).
    const fabrikada = eylem === "provizyon_fabrika";
    const r = await applyProvisioning({
      host: fabrikada ? fabrikaHost : sahaHost,
      kaynakIp: fabrikada ? kFabrika : kSaha,
      kimlik, uygula: true,
      yeniHost: sahaHost, yeniKaynakIp: kSaha,
      ilerle: opts.ilerle, olay: opts.olay,
    }, etkinProfil);
    rapor.deneme = deneme;
    rapor.detay = { durum: r.durum, plan: r.plan?.degisecek_sayisi, dogrulama: r.dogrulama };

    // PIN ana pasta gercekten yazildi mi? Yazilmadiysa (plan onu "ayni" gordu)
    // demek ki AYNI PIN nvram'da zaten duruyordu ama SIM yine kilitliydi:
    // yani KAYITLI PIN YANLIS. Operatore bunu soylemek, ayni PIN'i tekrar
    // tekrar yazdirmaktan iyidir.
    if (pinPlanlandi) {
      const yazilanlar = Object.values(r.yazilan ?? {}).flat();
      const yazildi = yazilanlar.includes(SIM_PIN_KEY);
      rapor.pin_denemesi = { denendi: yazildi, pin_kalan: simKilit?.pin_kalan ?? null,
        atlandi: yazildi ? null : "ayni_pin_zaten_yazili" };
      if (!yazildi) rapor.problems.push(problem("PIN_STORED_WRONG"));
    }
    if (r.ok && (r.durum === "basarili" || r.durum === "zaten_istenen_durumda")) {
      rapor.ok = true;
      const konumSaha = { host: sahaHost, kaynakIp: kSaha };
      const net = await internetiDogrula(konumSaha, simKilit, pinPlanlandi);
      rapor.durum = !net || net.var ? "hazir"
        : (rapor.sim_kilit?.kilit ? "hazir_sim_kilitli" : "hazir_internet_yok");
      return bitir(konumSaha, kimlikBilgiOnce, net);
    }
    rapor.problems.push(...r.problems);
    bildir(opts, `deneme ${deneme} basarisiz (${r.durum}); tekrar denenecek`);
    if (deneme < denemeler) await bekle(5000);
  }
  rapor.durum = "basarisiz"; rapor.ok = false;
  // Basarisiz kayit da KIMLIKLI olsun: cihaz hangi adreste cevap veriyorsa
  // oradan oku (LAN IP yazilmis ama dogrulama tamamlanmamis olabilir).
  const sahada = await isReachable(sahaHost, kSaha);
  const fabrikada = sahada ? false : await isReachable(fabrikaHost, kFabrika);
  return bitir(
    sahada ? { host: sahaHost, kaynakIp: kSaha }
      : fabrikada ? { host: fabrikaHost, kaynakIp: kFabrika } : null,
  );
}

// Döngü: çok modem için. Bir modem hazırlanınca çıkarılmasını (link/erisim
// kaybı) bekler, sonra sıradakine geçer. maxModem ile sınırlanabilir.
// opts: provisionModem opts + { maxModem=Infinity, cikarmaBekle=true }
export async function provisionLoop(opts) {
  const on = pcPreflight(
    (opts.fabrikaHost || "192.168.1.1").split(".").slice(0, 3).join(".") + ".",
    (opts.sahaHost || "5.5.5.1").split(".").slice(0, 3).join(".") + ".",
  );
  const sonuc = { zaman: now(), komut: "hazirla-dongu", hazirlanan: [], problems: [] };
  if (!on.hazir) {
    sonuc.problems.push(...on.problems);
    sonuc.ok = false;
    return sonuc;
  }
  const modemOpts = { ...opts, fabrikaKaynak: on.fabrikaKaynak, sahaKaynak: on.sahaKaynak };
  const maxModem = opts.maxModem ?? Infinity;

  let sayac = 0;
  while (sayac < maxModem) {
    bildir(opts, "modem takilmasi bekleniyor...");
    await modemBekle(modemOpts);
    bildir(opts, "modem algilandi, hazirlaniyor");
    // Numarayi SORMUYORUZ: provisionModem onu SIM'den okuyor. Okuyamazsa
    // yine opts.telefonSor'a dusuyor — yani yedek yol duruyor, ama artik
    // her modemde operatoru bekletmiyor. Dongunun amaci tam bu: tak, cikar.
    const r = await provisionModem({ ...modemOpts, telefon: opts.telefon });
    sonuc.hazirlanan.push({
      durum: r.durum, ok: r.ok, deneme: r.deneme,
      telefon: r.kayit?.telefon ?? null, iccid: r.kayit?.iccid ?? null,
    });
    sayac += 1;
    bildir(opts, r.ok ? `HAZIR (${r.durum}) — cihazi cikarabilirsin` : `BASARISIZ (${r.durum})`);
    if (opts.cikarmaBekle !== false) await modemCikarmaBekle(modemOpts);
  }
  sonuc.ok = sonuc.hazirlanan.every((h) => h.ok);
  return sonuc;
}

// Modem takılana kadar bekler (fabrika ya da saha adresinde cevap).
async function modemBekle({ fabrikaHost = "192.168.1.1", fabrikaKaynak,
  sahaHost = "5.5.5.1", sahaKaynak } = {}) {
  for (;;) {
    if (await isReachable(fabrikaHost, fabrikaKaynak)) return;
    if (await isReachable(sahaHost, sahaKaynak)) return;
    await bekle(3000);
  }
}

// Modem çıkarılana kadar bekler (her iki adreste de erişim kaybolunca).
async function modemCikarmaBekle({ fabrikaHost = "192.168.1.1", fabrikaKaynak,
  sahaHost = "5.5.5.1", sahaKaynak } = {}) {
  for (;;) {
    const f = await isReachable(fabrikaHost, fabrikaKaynak);
    const s = f ? true : await isReachable(sahaHost, sahaKaynak);
    if (!f && !s) return;
    await bekle(3000);
  }
}
