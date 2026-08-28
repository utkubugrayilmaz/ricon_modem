// SIM/hucresel okuma cekirdegi — redbox-device kalibi (opts alir, throw etmez).
//
// Cihazdan ALINABILEN her sey: ICCID, IMSI, IMEI, operator (IMSI'den), SIM
// durumu, sebeke, band, sinyal, hucre ID. Kaynak: HTTP canli uc (kimlikli).
//
// MSISDN (telefon no) CIHAZDAN ALINAMAZ (arastirma 2026-08-26: nvram'da yok;
// AT/USSD araci `at`/`at ctrl` interaktif+daemon-bagimli, telnet uzerinden
// guvenli scriptlenemiyor + modulu koparma riski). Bu yuzden MSISDN operator/
// UI tarafindan GIRDI olarak verilir (opts.telefon) — fallback tasarim.
// Kesin numara icin: operatorden (Turkcell) ICCID->numara listesi.

import { Client } from "./client.js";
import { parsePairs, simView } from "./ddwrt.js";
import { problem, isOk } from "./problems.js";

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
// Doner: { ham, kilit: "pin"|"puk"|null, hazir, pin_kalan, pin_toplam,
//          puk_kalan, puk_toplam }
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
    // "hazir": SIM kullanıma hazır. Kilit varsa ya da metin boş/OK değilse hayır.
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

// SIM/hucresel bilgisini okur. opts: { host, kaynakIp, kimlik, telefon? }
// Doner: sonuc nesnesi (throw etmez).
export async function readSim(options) {
  const { host, sourceIp, credentials, phone } = options;
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
  const norm = normalizePhone(phone);
  if (phone && !norm) report.problems.push(problem("MSISDN_INVALID", phone));
  report.msisdn = norm;
  report.msisdnSource = norm ? "operator_girisi" : null;
  if (!norm) {
    report.msisdn_not = "Telefon no cihazdan alinamaz; operator/UI girisi gerekir "
      + "(--telefon 05xxxxxxxxx) ya da operatorden ICCID->numara listesi.";
  }
  report.ok = isOk(report.problems);
  return report;
}
