// Cihaz TEMEL OKUMALARI ve PC on-kontrolu — en alt orkestrasyon katmani.
//
// Neden ayri: bunlar hem OKUMA yolunun (degerlendirme.js) hem YAZMA yolunun
// (pipeline.js) ihtiyaci. Ikisi de pipeline.js'te dururken degerlendirme.js
// pipeline.js'i import etmek zorunda kaliyordu — yani "yalniz okuyan" modul
// "cihazi degistiren" module bagimliydi. Katman yonu tersti; simdi ikisi de
// buraya bakiyor ve aralarinda bagimlilik yok.
//
// KURAL (tum cekirdek): process.env/argv okunmaz, stdout'a yazilmaz.

import { Client, findSourceIp } from "./net.js";
import {
  SIM_FIELD_MAP, SIM2_FIELD_MAP, OPERATORS,
} from "./settings.js";
import { problem } from "./problems.js";

const bildir = (opts, m) => { if (typeof opts.ilerle === "function") opts.ilerle(m); };
const olayla = (opts, olay) => {
  if (typeof opts.olay !== "function") return;
  try { opts.olay(olay); } catch { /* dinleyici hatasi akisi kesmez */ }
};
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

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
    // Yoklama araligi. Olculdu (2026-08-31, enstrumanli reboot): tek readSim
    // 0.10-0.19 sn suruyor, yani yoklamanin MALIYETI yok — kayip tamamen
    // GRANULASYONDAN geliyordu. Ayni olcumde WAN IP, nvram okunabilir hale
    // geldikten 2.6 sn sonra gelmisti; 5 sn'lik aralik boyle bir ani 5 sn'ye
    // kadar gec goruyor (canli kurulum kaydinda: gercek 6.3-11.2 arasi, biz
    // 11.2 dedik). 2 sn hem bu kaybi ~1 sn'ye indiriyor hem de tek baglantili
    // cihazi zorlamiyor (2 sn'de bir 0.1 sn'lik istek).
    await bekle(2000);
  }
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

// ======================================================================
// SIM / hucresel ozet
// ======================================================================

const now = () => new Date().toISOString();
const SIM_UC = "/asp/status/Status_Internet.live.asp";

// PURE: "Status of SIM" metnini çözer. Cihazın verdiği metin (2026-08-27
// canlı, PIN kilitli SIM):
//
//   "OK"
//   "Not Insert"
//   "Invalid"
//   "Need verification PIN code (PIN: 3/3, PUK: 10/10)"
//
// Son satır ALTIN DEĞERİNDE: yalnızca "PIN gerekli" demiyor, KALAN DENEME
// sayısını da veriyor. Bu yüzden PIN yazmadan önce kaç hak kaldığını
// biliyoruz — 3 yanlış deneme SIM'i PUK'a kilitler, son hakkı kör körüne
// harcamak zorunda değiliz.
//
// Doner: { ham, kilit: "pin"|"puk"|null, hazir, pin_kalan, pin_toplam,
//          puk_kalan, puk_toplam }
export function parseSimStatus(ham) {
  const metin = String(ham ?? "").trim();
  const sayac = (ad) => {
    const m = metin.match(new RegExp(`${ad}:\\s*(\\d+)\\s*/\\s*(\\d+)`, "i"));
    return m ? { kalan: Number(m[1]), toplam: Number(m[2]) } : { kalan: null, toplam: null };
  };
  const pin = sayac("PIN");
  const puk = sayac("PUK");
  let kilit = null;
  if (/verification\s+puk|puk\s+(code\s+)?required|puk\s+lock/i.test(metin)) kilit = "puk";
  else if (/verification\s+pin|pin\s+(code\s+)?required|pin\s+lock/i.test(metin)) kilit = "pin";
  return {
    ham: metin || null,
    kilit,
    // "hazir": SIM kullanıma hazır. Kilit varsa ya da metin boş/OK değilse hayır.
    hazir: kilit === null && /^ok$/i.test(metin),
    pin_kalan: pin.kalan, pin_toplam: pin.toplam,
    puk_kalan: puk.kalan, puk_toplam: puk.toplam,
  };
}

// Turkiye mobil numarasini 5xxxxxxxxx (10 hane) olarak normalize eder.
// Gecersizse null. (+90 / 0 / bosluk-tire kabul.)
export function normalizePhone(ham) {
  if (!ham) return null;
  const d = String(ham).replace(/[\s.\-()]/g, "").replace(/^\+?90/, "").replace(/^0/, "");
  return /^5\d{9}$/.test(d) ? d : null;
}

// Kanonik numarayi EKRANIN bekledigi bicime cevirir: 5xxxxxxxxx -> 05xxxxxxxxx.
// Gecersizse bos string (alan temiz kalir, "null" yazmaz).
//
// NEDEN CEKIRDEKTE: arayuz "basina 0 ekle" kuralini TASIMAMALI. Numaranin
// nasil gosterilecegi bir karardir; karar cekirdekte, arayuz hazir degeri
// basar. Ayni sebeple bir tane daha normalize fonksiyonu yazmiyoruz —
// normalizePhone tek dogru kaynak, bu onun ustunde ince bir katman.
export function telefonGirdiBicimi(ham) {
  const n = normalizePhone(ham);
  return n ? `0${n}` : "";
}

// SIM/hucresel bilgisini okur. opts: { host, kaynakIp, kimlik, telefon? }
// Doner: sonuc nesnesi (throw etmez).
export async function readSim(opts) {
  const { host, kaynakIp, kimlik, telefon } = opts;
  const rapor = { zaman: now(), komut: "sim", modem_ip: host, problems: [] };
  if (!kimlik) {
    rapor.problems.push(problem("AUTH_REQUIRED", SIM_UC));
    rapor.ok = false;
    return rapor;
  }
  const c = new Client({ host, kaynakIp, kimlik });
  const r = await c.get(SIM_UC);
  rapor.problems.push(...r.problems.filter((p) => p.severity === "error"));
  const { sim1, sim2 } = simView(parsePairs(r.govde || ""));
  rapor.sim1 = sim1;
  rapor.sim2 = sim2;

  // MSISDN: cihazdan gelmez; operator/UI girdisi (opts.telefon).
  const norm = normalizePhone(telefon);
  if (telefon && !norm) rapor.problems.push(problem("MSISDN_INVALID", telefon));
  rapor.msisdn = norm;
  rapor.msisdn_kaynak = norm ? "operator_girisi" : null;
  if (!norm) {
    rapor.msisdn_not = "Telefon no cihazdan alinamaz; operator/UI girisi gerekir "
      + "(--telefon 05xxxxxxxxx) ya da operatorden ICCID->numara listesi.";
  }
  rapor.ok = isOk(rapor.problems);
  return rapor;
}

// ======================================================================
// dd-wrt ciktisi ayristirma
// ======================================================================

export function parsePairs(metin) {
  const ciftler = Object.create(null);
  const desen = /\{(\w+)::([^}]*)\}/g;
  let m;
  while ((m = desen.exec(metin || "")) !== null) {
    ciftler[m[1]] = temizle(m[2]);
  }
  return ciftler;
}

// Tek bir degeri temizler: kenar bosluklari + tirnak; HTML varsa etiket at.
function temizle(deger) {
  let t = deger.trim().replace(/^['"]|['"]$/g, "");
  if (t.includes("<")) {
    t = t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return t;
}

// ICCID sonundaki dolgu 'F' gercek hane degildir, atilir.
export function cleanIccid(ham) {
  if (!ham) return null;
  const t = ham.trim().toUpperCase().replace(/F+$/, "");
  return t || null;
}

// IMSI onekinden (MCC+MNC, ilk 5 hane) operator adi.
export function guessOperator(imsi) {
  if (!imsi || imsi.length < 5) return null;
  return OPERATORS[imsi.slice(0, 5)] ?? null;
}

// Ham ciftlerden okunabilir SIM/hucresel gorunum uretir. HAM alanlar
// silinmez — bu yalnizca EK bir gorunum. Bos degerler atlanir (bilinmeyen
// deger 0 degil, yok demektir).
export function simView(ham) {
  const cikar = (harita) => {
    const cikti = Object.create(null);
    for (const [modemAlani, bizimAd] of Object.entries(harita)) {
      const deger = (ham[modemAlani] ?? "").trim();
      if (deger) cikti[bizimAd] = deger;
    }
    return cikti;
  };

  const sim1 = cikar(SIM_FIELD_MAP);
  const sim2 = cikar(SIM2_FIELD_MAP);

  for (const sim of [sim1, sim2]) {
    if (sim.iccid) sim.iccid_temiz = cleanIccid(sim.iccid);
    if (sim.imsi) sim.operator = guessOperator(sim.imsi);
  }

  return { sim1, sim2 };
}
