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
import { DEVICE_NAME_KEY } from "./profile.js";
import { Client } from "./client.js";
import { parsePairs } from "./ddwrt.js";
import { readSim, normalizePhone } from "./sim.js";
import { problem } from "./problems.js";

const now = () => new Date().toISOString();
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
  };
}

// İnternet doğrulaması + gerekirse TEK PIN denemesi. `rapor`u günceller.
// provisionModem'in içinde closure olarak duruyordu; tek işi olan ayrı bir
// fonksiyon olarak daha okunur (ve provisionModem 75 satır kısaldı).
//
// Sıra önemli: önce internet beklenir. Gelirse PIN'e HİÇ dokunulmaz — kilitli
// olmayan SIM'e PIN yazmak 3 denemeden birini yakmak demek (bkz. applyPin).
async function internetVePin({ konum, kimlik, pin, internetBekle, rapor, opts }) {
  if (!(internetBekle > 0)) return null;
  bildir(opts, "internet dogrulamasi (SIM calisiyor mu)");
  let sonuc = await waitForInternet({ ...konum, kimlik }, internetBekle, opts);

  if (!sonuc.var && pin) {
    bildir(opts, "internet yok — SIM PIN denenecek (tek deneme)");
    const p = await applyPin(
      { ...konum, kimlik, ilerle: opts.ilerle, olay: opts.olay }, pin,
    );
    rapor.pin_denemesi = { denendi: p.denendi, atlandi: p.atlandi };
    rapor.problems.push(...p.problems);
    if (p.denendi) {
      sonuc = await waitForInternet({ ...konum, kimlik }, internetBekle, opts);
      rapor.pin_denemesi.sonuc = sonuc.var ? "internet_geldi" : "internet_gelmedi";
    }
  } else if (!sonuc.var && !pin) {
    // PIN girilmemiş: ne yapılacağını söyle, kendi başına deneme yapma.
    rapor.problems.push(problem("PIN_REQUIRED"));
    rapor.pin_denemesi = { denendi: false, atlandi: "pin_verilmedi" };
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

  // Ince sarmalayicilar: govdeler yukarida modul seviyesinde (internetVePin,
  // kaydiTamamla). Cagri yerleri degismedi.
  const internetiDogrula = (konum) =>
    internetVePin({ konum, kimlik, pin, internetBekle, rapor, opts });


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

  // ETKİN PROFİL = profil + telefon numarası cihaz adı olarak.
  // Cihaz adı her modemde farklı olduğu için profilde sabit olamaz; çalışma
  // anında ekleniyor. Böylece modeme bağlanan herkes hangi hattın takılı
  // olduğunu Device Name alanında görüyor. Not: bu alan yalnızca PAROLAYLA
  // girince görünür (kimliksiz sayfada yok) — defter hâlâ tek doğru kaynak.
  const telefonNorm = normalizePhone(telefon);
  const etkinProfil = telefonNorm
    ? { ...profil, nvram: { ...profil.nvram, [DEVICE_NAME_KEY]: `0${telefonNorm}` } }
    : profil;

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
      const net = await internetiDogrula(konumSaha);
      rapor.durum = net && !net.var ? "zaten_hazir_internet_yok" : "zaten_hazir";
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

    if (r.ok && (r.durum === "basarili" || r.durum === "zaten_istenen_durumda")) {
      rapor.ok = true;
      const konumSaha = { host: sahaHost, kaynakIp: sahaKaynak };
      const net = await internetiDogrula(konumSaha);
      rapor.durum = net && !net.var ? "hazir_internet_yok" : "hazir";
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
