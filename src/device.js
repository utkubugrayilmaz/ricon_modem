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
import { problem, isOk } from "./problems.js";

const notify = (opts, m) => { if (typeof opts.progress === "function") opts.progress(m); };
const emitEvent = (opts, event) => {
  if (typeof opts.event !== "function") return;
  try { opts.event(event); } catch { /* dinleyici hatasi akisi kesmez */ }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Cihaz kimliği — "bu hangi modemdi" sorusunun kalıcı cevabı.
// NOT: cihazın ETİKET seri numarası ne HTTP'de ne nvram'da YOK (2026-08-27
// arandı; BULGULAR'daki S/N fiziksel etiketten okundu). Bu yüzden kalıcı
// kimlik: LAN MAC (cihaza ait, kimliksiz okunur) + IMEI (modül) + ICCID (SIM).
export async function readIdentity({ host, sourceIp, credentials }) {
  const result = { lan_mac: null, iccid: null, imsi: null, imei: null,
    operator: null, simStatus: null, wan_ip: null };
  const c = new Client({ host, sourceIp, credentials });
  const info = await c.get("/asp/status/Info.live.htm");
  result.lan_mac = parsePairs(info.body || "").lan_mac || null;
  const s = await readSim({ host, sourceIp, credentials });
  const s1 = s.sim1 || {};
  result.iccid = s1.iccidClean || s1.iccid || null;
  result.imsi = s1.imsi || null;
  result.imei = s1.imei || null;
  result.operator = s1.operator || null;
  result.simStatus = s1.simStatus || null;
  // Durum metnini çöz: kilit var mı, kaç deneme kaldı. PIN kilidini 150 sn
  // internet bekleyerek anlamak yerine BURADA, ~4 sn'de anlıyoruz.
  result.sim = parseSimStatus(s1.simStatus);
  // WAN IP zaten bu okumada geliyor — BEDAVA kanıt: "bu SIM o an çevrimiçiydi".
  // Beklemiyoruz, yoksa yok yazıyoruz; kurulum süresine tek saniye eklemiyor.
  const wanFields = (s1.wan_ip || "").trim();
  result.wan_ip = wanFields && wanFields !== "0.0.0.0" ? wanFields : null;
  return result;
}

// SIM gerçekten takılı mı? ICCID yalnızca SIM varken okunabiliyor, o yüzden
// tek güvenilir ölçüt o. `simStatus` ("Not Insert" / "Invalid") teşhis metni
// olarak taşınır — operatöre ne olduğunu söylemek için.
//
// NEDEN ÖNEMLİ (2026-08-27 canlı gözlem): SIM'siz bir modemde provizyon
// SORUNSUZ tamamlanıyor — 14 ayar yazılıyor, doğrulama TAMAM diyor. Ama cihaz
// şebekeye kaydolamıyor, ~110 sn'de bir deneyip düşüyor ve deftere ICCID'siz
// bir satır düşüyor. Yani "hazır" denen modem sahada çalışmaz. Bu yüzden SIM
// kontrolü EN BASA alındı: 45 saniye harcayıp sonunda anlamak yerine
// ilk saniyede söylüyoruz.
export function isSimPresent(identity = {}) {
  return Boolean(identity.iccid);
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
// Doner: { var, durationSec, wan_ip, simStatus }
export async function waitForInternet({ host, sourceIp, credentials }, maxSec = 150, opts = {}) {
  const startAt = Date.now();
  const elapsed = () => Math.round((Date.now() - startAt) / 100) / 10;
  // Yoklamada readIdentity DEĞİL readSim kullanıyoruz: readIdentity ayrıca
  // Info.live.htm'i de çekiyor (yalnızca lan_mac için) ve burada lan_mac'e
  // ihtiyaç yok. Tek uç = yoklama başına ~2 sn tasarruf, tek bağlantılı
  // cihazda da yarı yük.
  const probe = async () => {
    const s = await readSim({ host, sourceIp, credentials });
    const s1 = s.sim1 || {};
    const wanFields = (s1.wan_ip || "").trim();
    return { wan_ip: wanFields && wanFields !== "0.0.0.0" ? wanFields : null,
      simStatus: s1.simStatus || null };
  };
  for (;;) {
    let k = null;
    try { k = await probe(); } catch { /* cihaz reboot'ta olabilir; yeniden dene */ }
    if (k?.wan_ip) {
      const duration = elapsed();
      emitEvent(opts, { kind: "internet", up: true, durationSec: duration, wan_ip: k.wan_ip });
      return { up: true, durationSec: duration, wan_ip: k.wan_ip, simStatus: k.simStatus };
    }
    if (elapsed() >= maxSec) {
      emitEvent(opts, { kind: "internet", up: false, durationSec: elapsed(),
        simStatus: k?.simStatus ?? null });
      return { up: false, durationSec: elapsed(), wan_ip: null, simStatus: k?.simStatus ?? null };
    }
    notify(opts, `waiting for internet (${elapsed()} s / ${maxSec} s)`);
    emitEvent(opts, { kind: "waiting_internet", elapsedSec: elapsed(), maxSec: maxSec });
    // Yoklama araligi. Olculdu (2026-08-31, enstrumanli reboot): tek readSim
    // 0.10-0.19 sn suruyor, yani yoklamanin MALIYETI yok — kayip tamamen
    // GRANULASYONDAN geliyordu. Ayni olcumde WAN IP, nvram okunabilir hale
    // geldikten 2.6 sn sonra gelmisti; 5 sn'lik aralik boyle bir ani 5 sn'ye
    // kadar gec goruyor (canli kurulum kaydinda: gercek 6.3-11.2 arasi, biz
    // 11.2 dedik). 2 sn hem bu kaybi ~1 sn'ye indiriyor hem de tek baglantili
    // cihazi zorlamiyor (2 sn'de bir 0.1 sn'lik istek).
    await wait(2000);
  }
}

// PC ön-kontrol: gerekli ikincil kaynak IP'ler var mı?
// Doner: { hazir, problems, factorySource, fieldSource }
export function pcPreflight(factoryPrefix = "192.168.1.", fieldPrefix = "5.5.5.") {
  const factorySource = findSourceIp(factoryPrefix);
  const fieldSource = findSourceIp(fieldPrefix);
  const problems = [];
  if (!factorySource) problems.push(problem("NO_SOURCE_IP", `${factoryPrefix}50`));
  if (!fieldSource) problems.push(problem("NO_SOURCE_IP", `${fieldPrefix}100`));
  return { ready: problems.length === 0, problems, factorySource, fieldSource };
}

// ======================================================================
// SIM / hucresel ozet
// ======================================================================

const now = () => new Date().toISOString();
const SIM_ENDPOINT = "/asp/status/Status_Internet.live.asp";

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
// Doner: { ham, kilit: "pin"|"puk"|null, hazir, pinRemaining, pinTotal,
//          pukRemaining, pukTotal }
export function parseSimStatus(raw) {
  const text = String(raw ?? "").trim();
  const counter = (name) => {
    const m = text.match(new RegExp(`${name}:\\s*(\\d+)\\s*/\\s*(\\d+)`, "i"));
    return m ? { remaining: Number(m[1]), total: Number(m[2]) } : { remaining: null, total: null };
  };
  const pin = counter("PIN");
  const puk = counter("PUK");
  let lock = null;
  if (/verification\s+puk|puk\s+(code\s+)?required|puk\s+lock/i.test(text)) lock = "puk";
  else if (/verification\s+pin|pin\s+(code\s+)?required|pin\s+lock/i.test(text)) lock = "pin";
  return {
    raw: text || null,
    lock,
    // "ready": SIM kullanıma hazır. Kilit varsa ya da metin boş/OK değilse hayır.
    ready: lock === null && /^ok$/i.test(text),
    pinRemaining: pin.remaining, pinTotal: pin.total,
    pukRemaining: puk.remaining, pukTotal: puk.total,
  };
}

// Turkiye mobil numarasini 5xxxxxxxxx (10 hane) olarak normalize eder.
// Gecersizse null. (+90 / 0 / bosluk-tire kabul.)
export function normalizePhone(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/[\s.\-()]/g, "").replace(/^\+?90/, "").replace(/^0/, "");
  return /^5\d{9}$/.test(d) ? d : null;
}

// Kanonik numarayi EKRANIN bekledigi bicime cevirir: 5xxxxxxxxx -> 05xxxxxxxxx.
// Gecersizse bos string (alan temiz kalir, "null" yazmaz).
//
// NEDEN CEKIRDEKTE: arayuz "basina 0 ekle" kuralini TASIMAMALI. Numaranin
// nasil gosterilecegi bir karardir; karar cekirdekte, arayuz hazir degeri
// basar. Ayni sebeple bir tane daha normalize fonksiyonu yazmiyoruz —
// normalizePhone tek dogru kaynak, bu onun ustunde ince bir katman.
export function phoneInputFormat(raw) {
  const n = normalizePhone(raw);
  return n ? `0${n}` : "";
}

// SIM/hucresel bilgisini okur. opts: { host, sourceIp, kimlik, telefon? }
// Doner: sonuc nesnesi (throw etmez).
export async function readSim(opts) {
  const { host, sourceIp, credentials, phone } = opts;
  const report = { timestamp: now(), command: "sim", modemIp: host, problems: [] };
  if (!credentials) {
    report.problems.push(problem("AUTH_REQUIRED", SIM_ENDPOINT));
    report.ok = false;
    return report;
  }
  const c = new Client({ host, sourceIp, credentials });
  const r = await c.get(SIM_ENDPOINT);
  report.problems.push(...r.problems.filter((p) => p.severity === "error"));
  const { sim1, sim2 } = simView(parsePairs(r.body || ""));
  report.sim1 = sim1;
  report.sim2 = sim2;

  // MSISDN: cihazdan gelmez; operator/UI girdisi (opts.telefon).
  const normalized = normalizePhone(phone);
  if (phone && !normalized) report.problems.push(problem("MSISDN_INVALID", phone));
  report.msisdn = normalized;
  report.msisdnSource = normalized ? "operator_input" : null;
  if (!normalized) {
    report.msisdnNote = "The phone number cannot be read from the device; operator input is required "
      + "(--phone 05xxxxxxxxx), or an ICCID->number list from the carrier.";
  }
  report.ok = isOk(report.problems);
  return report;
}

// ======================================================================
// dd-wrt ciktisi ayristirma
// ======================================================================

export function parsePairs(text) {
  const pairs = Object.create(null);
  const pattern = /\{(\w+)::([^}]*)\}/g;
  let m;
  while ((m = pattern.exec(text || "")) !== null) {
    pairs[m[1]] = clean(m[2]);
  }
  return pairs;
}

// Tek bir degeri temizler: kenar bosluklari + tirnak; HTML varsa etiket at.
function clean(value) {
  let t = value.trim().replace(/^['"]|['"]$/g, "");
  if (t.includes("<")) {
    t = t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return t;
}

// ICCID sonundaki dolgu 'F' gercek hane degildir, atilir.
export function cleanIccid(raw) {
  if (!raw) return null;
  const t = raw.trim().toUpperCase().replace(/F+$/, "");
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
export function simView(raw) {
  const strip = (table) => {
    const out = Object.create(null);
    for (const [modemField, ourName] of Object.entries(table)) {
      const value = (raw[modemField] ?? "").trim();
      if (value) out[ourName] = value;
    }
    return out;
  };

  const sim1 = strip(SIM_FIELD_MAP);
  const sim2 = strip(SIM2_FIELD_MAP);

  for (const sim of [sim1, sim2]) {
    if (sim.iccid) sim.iccidClean = cleanIccid(sim.iccid);
    if (sim.imsi) sim.operator = guessOperator(sim.imsi);
  }

  return { sim1, sim2 };
}
