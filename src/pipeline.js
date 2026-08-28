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

import { isReachable } from "./scanner.js";
import { findSourceIp } from "./network.js";
import { applyProvisioning, applyPin } from "./provisioning.js";
import { DEVICE_NAME_KEY, SIM_PIN_KEY } from "./profile.js";
import { Client } from "./client.js";
import { parsePairs } from "./ddwrt.js";
import { readSim, normalizePhone, parseSimStatus } from "./sim.js";
import { problem, isOk } from "./problems.js";
import { readMsisdn, readSimLock, simKilidiUygunMu } from "./at.js";
import { pinDenemesiUygunMu, hakYakilmisMi } from "./pin-karar.js";

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

// Cihaz kimliği — "bu hangi modemdi" sorusunun kalıcı cevabı.
// NOT: cihazın ETİKET seri numarası ne HTTP'de ne nvram'da YOK (2026-08-27
// arandı; BULGULAR'daki S/N fiziksel etiketten okundu). Bu yüzden kalıcı
// kimlik: LAN MAC (cihaza ait, kimliksiz okunur) + IMEI (modül) + ICCID (SIM).
export async function readIdentity({ host, kaynakIp, kimlik }) {
  const sonuc = { lan_mac: null, iccid: null, imsi: null, imei: null,
    operator: null, sim_durumu: null, wan_ip: null };
  const c = new Client({ host, kaynakIp, kimlik });
  const bilgi = await c.get("/asp/status/Info.live.htm");
  sonuc.lan_mac = parsePairs(bilgi.govde || "").lan_mac || null;
  const s = await readSim({ host, kaynakIp, kimlik });
  const s1 = s.sim1 || {};
  sonuc.iccid = s1.iccid_temiz || s1.iccid || null;
  sonuc.imsi = s1.imsi || null;
  sonuc.imei = s1.imei || null;
  sonuc.operator = s1.operator || null;
  sonuc.sim_durumu = s1.sim_durumu || null;
  // Durum metnini çöz: kilit var mı, kaç deneme kaldı. PIN kilidini 150 sn
  // internet bekleyerek anlamak yerine BURADA, ~4 sn'de anlıyoruz.
  sonuc.sim = parseSimStatus(s1.sim_durumu);
  // WAN IP zaten bu okumada geliyor — BEDAVA kanıt: "bu SIM o an çevrimiçiydi".
  // Beklemiyoruz, yoksa yok yazıyoruz; kurulum süresine tek saniye eklemiyor.
  const wan = (s1.wan_ip || "").trim();
  sonuc.wan_ip = wan && wan !== "0.0.0.0" ? wan : null;
  return sonuc;
}

// SIM gerçekten takılı mı? ICCID yalnızca SIM varken okunabiliyor, o yüzden
// tek güvenilir ölçüt o. `sim_durumu` ("Not Insert" / "Invalid") teşhis metni
// olarak taşınır — operatöre ne olduğunu söylemek için.
//
// NEDEN ÖNEMLİ (2026-08-27 canlı gözlem): SIM'siz bir modemde provizyon
// SORUNSUZ tamamlanıyor — 14 ayar yazılıyor, doğrulama TAMAM diyor. Ama cihaz
// şebekeye kaydolamıyor, ~110 sn'de bir deneyip düşüyor ve deftere ICCID'siz
// bir satır düşüyor. Yani "hazır" denen modem sahada çalışmaz. Bu yüzden SIM
// kontrolü EN BASA alındı: 45 saniye harcayıp sonunda anlamak yerine
// ilk saniyede söylüyoruz.
export function simTakiliMi(kimlikBilgi = {}) {
  return Boolean(kimlikBilgi.iccid);
}

// İNTERNET DOĞRULAMASI — "bu SIM gerçekten çalışıyor mu?"
//
// Teknisyen elle süreçte tam bunu yapıyor: işlemden sonra internetin gelmesini
// bekliyor. O bekleme boş bir duruş DEĞİL, bir kalite kontrolü — bu yüzden
// kaldırmıyoruz, otomatikleştirip ÖLÇÜYORUZ. Fark: operatör beklemiyor, araç
// bekliyor.
//
// Ölçüm (2026-08-27): provizyon reboot'undan sonra WAN IP ~89 sn'de geldi,
// sonrasında kesintisiz. Bu yüzden varsayılan üst sınır 150 sn — normalin
// rahat üstünde ama sonsuza kadar beklemiyor.
//
// İnternet gelmemesi provizyonun BAŞARISIZLIĞI değildir: ayarlar doğrulanmış
// olabilir ama atölyede kapsama olmayabilir, SIM'in data paketi bitmiş olabilir.
// Bu yüzden AYRI bir sonuç alanı olarak taşınır; operatör kararı verir.
// Doner: { var, sure_sn, wan_ip, sim_durumu }
export async function waitForInternet({ host, kaynakIp, kimlik }, maxSn = 150, opts = {}) {
  const baslangic = Date.now();
  const gecen = () => Math.round((Date.now() - baslangic) / 100) / 10;
  // Yoklamada readIdentity DEĞİL readSim kullanıyoruz: readIdentity ayrıca
  // Info.live.htm'i de çekiyor (yalnızca lan_mac için) ve burada lan_mac'e
  // ihtiyaç yok. Tek uç = yoklama başına ~2 sn tasarruf, tek bağlantılı
  // cihazda da yarı yük.
  const bak = async () => {
    const s = await readSim({ host, kaynakIp, kimlik });
    const s1 = s.sim1 || {};
    const wan = (s1.wan_ip || "").trim();
    return { wan_ip: wan && wan !== "0.0.0.0" ? wan : null,
      sim_durumu: s1.sim_durumu || null };
  };
  for (;;) {
    let k = null;
    try { k = await bak(); } catch { /* cihaz reboot'ta olabilir; yeniden dene */ }
    if (k?.wan_ip) {
      const sure = gecen();
      olayla(opts, { tur: "internet", var: true, sure_sn: sure, wan_ip: k.wan_ip });
      return { var: true, sure_sn: sure, wan_ip: k.wan_ip, sim_durumu: k.sim_durumu };
    }
    if (gecen() >= maxSn) {
      olayla(opts, { tur: "internet", var: false, sure_sn: gecen(),
        sim_durumu: k?.sim_durumu ?? null });
      return { var: false, sure_sn: gecen(), wan_ip: null, sim_durumu: k?.sim_durumu ?? null };
    }
    bildir(opts, `internet bekleniyor (${gecen()} sn / ${maxSn} sn)`);
    olayla(opts, { tur: "internet_bekleniyor", gecen_sn: gecen(), max_sn: maxSn });
    await bekle(5000);
  }
}

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

// PURE: hazırlamaya başlamak için NE EKSİK? Tüketici (UI/endpoint/terminal)
// buna bakıp hangi ekranı göstereceğine karar verir — karar mantığı burada,
// arayüzde değil. Sıra ÖNEMLİ: en temel eksik başta.
//
// Doner: ["modem"] | ["sim"] | ["telefon"] | ["pin"] | []  (boş = başlanabilir)
export function provisionEksikleri({ modemVar, simTakili, simKilit, telefon, pin } = {}) {
  const eksik = [];
  if (!modemVar) eksik.push("modem");
  else if (!simTakili) eksik.push("sim");
  if (!normalizePhone(telefon)) eksik.push("telefon");
  // PIN yalnızca cihaz KİLİT BİLDİRDİYSE ve elimizde PIN yoksa eksiktir.
  // Kilit yoksa PIN sorulmaz — proje hedefi PIN'siz akış.
  if (simKilit?.kilit === "pin" && !pin) eksik.push("pin");
  // PUK kilidi "eksik girdi" değil, insan müdahalesi gerektiren bir arıza:
  // eksik listesine koymuyoruz, problems ile bildiriliyor.
  return eksik;
}

// Cihazın O ANKI durumu ve ne eksik — TEK ÇAĞRI.
//
// Neden ayrı fonksiyon: "modem bağlandı → numarayı çek → PIN gerekiyor mu bak
// → gerekiyorsa iste, gerekmiyorsa başlat" kararı TÜKETİCİDE tekrarlanmasın.
// UI, endpoint ve terminal aynı cevaba bakar.
//
// PAHALI: kimlik okuması (~4 sn) yapar. Sürekli yoklama için DEĞİL — modem
// algılandığında BİR KEZ çağrılmalı (tek bağlantılı cihazı boğmayalım).
export async function assessDevice(opts) {
  const {
    fabrikaHost = "192.168.1.1", sahaHost = "5.5.5.1",
    kimlik, telefon = null, pin = null,
  } = opts;
  const on = pcPreflight(onekAl(fabrikaHost), onekAl(sahaHost));
  const rapor = {
    zaman: now(), komut: "degerlendir",
    pc: { hazir: on.hazir, problems: on.problems },
    modem: { konum: null, host: null },
    kimlik: null, sim: null,
    telefon: { numara: normalizePhone(telefon), kaynak: telefon ? "girdi" : "yok" },
    internet: null,
    problems: [...on.problems],
  };
  if (!on.hazir) {
    rapor.eksik = ["pc"];
    rapor.baslatilabilir = false;
    rapor.ok = false;
    return rapor;
  }

  const fabrikaVar = await isReachable(fabrikaHost, on.fabrikaKaynak);
  const sahaVar = fabrikaVar ? false : await isReachable(sahaHost, on.sahaKaynak);
  const konum = fabrikaVar
    ? { host: fabrikaHost, kaynakIp: on.fabrikaKaynak, ad: "fabrika" }
    : sahaVar ? { host: sahaHost, kaynakIp: on.sahaKaynak, ad: "saha" } : null;
  rapor.modem = { konum: konum?.ad ?? null, host: konum?.host ?? null };

  if (konum && kimlik) {
    let k = null;
    try { k = await readIdentity({ ...konum, kimlik }); } catch { /* kismi sonuc gecerli */ }
    if (k) {
      rapor.kimlik = { iccid: k.iccid, imei: k.imei, imsi: k.imsi,
        lan_mac: k.lan_mac, operator: k.operator };
      rapor.sim = { takili: simTakiliMi(k), ...k.sim };
      rapor.internet = { var: Boolean(k.wan_ip), wan_ip: k.wan_ip };
      if (!simTakiliMi(k)) rapor.problems.push(problem("SIM_MISSING", k.sim_durumu));
      else if (k.sim?.kilit === "pin") rapor.problems.push(problem("SIM_PIN_LOCKED", k.sim.pin_kalan));
      else if (k.sim?.kilit === "puk") rapor.problems.push(problem("SIM_PUK_LOCKED", k.sim.puk_kalan));
    }
  }
  if (!konum) rapor.problems.push(problem("DEVICE_UNREACHABLE", `${fabrikaHost}/${sahaHost}`));

  // SIM PIN KILITLI: kalan hakki MODULDEN oku. Web sayfasi bu sayiyi her zaman
  // vermiyor (2026-08-28: `pin_kalan: null` geldi), AT tarafi veriyor
  // (`+QPINC: "SC",3,10`). Bu sayi bir GUVENLIK kararinin girdisi — "daha once
  // hak yanmis mi?" — o yuzden tahmine birakilmaz, ~3 sn'ye deger. Yalnizca
  // KILITLI durumda okunuyor: acik SIM'de gereksiz bir tur olurdu.
  if (konum && kimlik && rapor.sim?.kilit === "pin") {
    bildir(opts, "SIM kilidi modulden okunuyor (kalan hak)");
    const k = await readSimLock({ ...konum, kimlik });
    rapor.at_port = k.at_port;
    if (k.at_port) {
      rapor.sim = { ...rapor.sim,
        durum_modul: k.durum,
        pin_kalan: k.pin_kalan ?? rapor.sim.pin_kalan,
        puk_kalan: k.puk_kalan ?? rapor.sim.puk_kalan };
    }
    // Kilit kaldirmaya UYGUN MU? Karar cekirdekte (simKilidiUygunMu); tuketici
    // yalnizca gosterir. Arayuz dugmeyi buna gore acar, CLI ayni cevaba bakar.
    const u = simKilidiUygunMu(rapor.sim);
    rapor.pin_kaldirilabilir = { uygun: u.uygun, sebep: u.sebep };
    rapor.problems.push(...u.problems.filter((p) => p.severity === "warning"));
  }

  // TELEFON NUMARASINI CIHAZDAN OKU — artik elle girmeye gerek yok.
  // Yalnizca SIM HAZIRSA denenir: kilitli SIM abone verisini (EF_MSISDN)
  // acmiyor, canli olculdu (2026-08-27). Kilitliyse once PIN, sonra numara.
  if (konum && kimlik && rapor.sim?.hazir) {
    bildir(opts, "telefon numarasi cihazdan okunuyor (AT+CNUM)");
    const n = await readMsisdn({ ...konum, kimlik });
    rapor.at_port = n.at_port;
    if (n.telefon) {
      const elle = normalizePhone(telefon);
      if (elle && elle !== n.telefon) {
        // Cihazdaki numara SIM'in KENDISINDEN geliyor; elle girilen yanlis
        // olabilir. Sessizce birini secmek yerine ikisini de bildiriyoruz.
        rapor.problems.push(problem("MSISDN_UYUSMAZLIK", elle, n.telefon));
      }
      rapor.telefon = { numara: n.telefon, kaynak: "cihaz" };
    } else {
      rapor.problems.push(...n.problems);
    }
  }

  // "Ne eksik" kararı ÇÖZÜLMÜŞ numaraya bakar, ham girdiye DEĞİL. Eskiden
  // buraya `telefon` (operatörün yazdığı) geçiliyordu: cihazdan numara
  // başarıyla okunduğu halde eksik ["telefon"] kalıyor, başlatılabilir
  // yanlışlıkla false oluyordu (2026-08-28 canlı görüldü). Numaranın NEREDEN
  // geldiği kararı ilgilendirmez — elimizde geçerli numara var mı, o yeter.
  rapor.eksik = provisionEksikleri({
    modemVar: Boolean(konum),
    simTakili: rapor.sim?.takili ?? false,
    simKilit: rapor.sim ?? null,
    telefon: rapor.telefon.numara, pin,
  });
  rapor.baslatilabilir = rapor.eksik.length === 0;
  rapor.ok = isOk(rapor.problems);
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

  // Ince sarmalayicilar: govdeler yukarida modul seviyesinde (internetVePin,
  // kaydiTamamla). Cagri yerleri degismedi.
  const internetiDogrula = (konum, simDurum, pinPlanlandi) =>
    internetVePin({ konum, kimlik, pin, internetBekle, rapor, opts,
      simDurum, pinPlanlandi });


  const bitir = (konum, hazirKimlik = null, internet = null) =>
    kaydiTamamla({ rapor, konum, hazirKimlik, kimlik, telefon, profil, internet, opts });


  if (!kimlik) {
    rapor.problems.push(problem("AUTH_REQUIRED", "modem"));
    rapor.durum = "kimlik_yok"; rapor.ok = false; return bitir(null);
  }
  // Telefon (MSISDN) hazirlamanin ZORUNLU girdisi: kurulum aninda biliniyor,
  // sonradan cihazdan OKUNAMIYOR (bkz. sim.js). Kayitsiz modem sahaya cikmasin.
  if (!normalizePhone(telefon)) {
    rapor.problems.push(problem(telefon ? "MSISDN_INVALID" : "MSISDN_REQUIRED", telefon || "—"));
    rapor.durum = "telefon_yok"; rapor.ok = false; return bitir(null);
  }

  // ETKİN PROFİL = profil + ÇALIŞMA ANINA ÖZEL anahtarlar. İkisi de profilde
  // sabit olamaz, çünkü her modemde/SIM'de farklıdır:
  //   · cihaz adı = telefon numarası (modeme bağlanan hangi hat olduğunu görsün;
  //     not: bu alan yalnızca parolayla girince okunur, defter hâlâ tek kaynak)
  //   · SIM PIN — YALNIZCA kilit varsa ve güvenlik kapıları geçilirse
  const telefonNorm = normalizePhone(telefon);
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
    const fabrikaVar = await isReachable(fabrikaHost, fabrikaKaynak);
    const sahaVar = fabrikaVar ? false : await isReachable(sahaHost, sahaKaynak);
    const konum = fabrikaVar
      ? { host: fabrikaHost, kaynakIp: fabrikaKaynak }
      : sahaVar ? { host: sahaHost, kaynakIp: sahaKaynak } : null;

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
        { host: sahaHost, kaynakIp: sahaKaynak, kimlik, uygula: false, olay: opts.olay },
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
      const konumSaha = { host: sahaHost, kaynakIp: sahaKaynak };
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
      kaynakIp: fabrikada ? fabrikaKaynak : sahaKaynak,
      kimlik, uygula: true,
      yeniHost: sahaHost, yeniKaynakIp: sahaKaynak,
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
      const konumSaha = { host: sahaHost, kaynakIp: sahaKaynak };
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
  const sahada = await isReachable(sahaHost, sahaKaynak);
  const fabrikada = sahada ? false : await isReachable(fabrikaHost, fabrikaKaynak);
  return bitir(
    sahada ? { host: sahaHost, kaynakIp: sahaKaynak }
      : fabrikada ? { host: fabrikaHost, kaynakIp: fabrikaKaynak } : null,
  );
}

// PC ön-kontrol: gerekli ikincil kaynak IP'ler var mı?
// Doner: { hazir, problems, fabrikaKaynak, sahaKaynak }
export function pcPreflight(fabrikaOnek = "192.168.1.", sahaOnek = "5.5.5.") {
  const fabrikaKaynak = findSourceIp(fabrikaOnek);
  const sahaKaynak = findSourceIp(sahaOnek);
  const problems = [];
  if (!fabrikaKaynak) problems.push(problem("NO_SOURCE_IP", `${fabrikaOnek}50`));
  if (!sahaKaynak) problems.push(problem("NO_SOURCE_IP", `${sahaOnek}100`));
  return { hazir: problems.length === 0, problems, fabrikaKaynak, sahaKaynak };
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
    // Telefon her modemde FARKLI (her cihazin SIM'i kendi hatti) — sabit
    // opts.telefon yoksa tuketiciden modem basina sorulur.
    const telefon = opts.telefon
      ?? (typeof opts.telefonSor === "function" ? await opts.telefonSor(sayac + 1) : null);
    const r = await provisionModem({ ...modemOpts, telefon });
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
  sahaHost = "5.5.5.1", sahaKaynak, ilerle } = {}) {
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
