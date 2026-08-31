// SIM/hucresel okuma cekirdegi — redbox-device kalibi (opts alir, throw etmez).
//
// Cihazdan ALINABILEN her sey: ICCID, IMSI, IMEI, operator (IMSI'den), SIM
// durumu, sebeke, band, sinyal, hucre ID. Kaynak: HTTP canli uc (kimlikli).
//
// MSISDN (telefon no) CIHAZDAN ALINAMAZ (arastirma 2026-08-26: nvram'da yok;
// AT/USSD araci `at`/`at ctrl` interaktif+daemon-bagimli, telnet uzerinden
// guvenli scriptlenemiyor + modulu koparma riski). Bu yuzden MSISDN operator/
// tuketici tarafindan GIRDI olarak verilebilir (opts.telefon) — YEDEK yol;
// birincil yol AT+CNUM ile SIM.den okumak (bkz. at.js readMsisdn).
// Kesin numara icin: operatorden (Turkcell) ICCID->numara listesi.

import { Client } from "../transport/client.js";
import { parsePairs, simView } from "../parse/ddwrt.js";
import { problem, isOk } from "../domain/problems.js";

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

  // MSISDN: bu HTTP ucundan gelmez; cagirinin girdisi (opts.telefon).
  const norm = normalizePhone(telefon);
  if (telefon && !norm) rapor.problems.push(problem("MSISDN_INVALID", telefon));
  rapor.msisdn = norm;
  rapor.msisdn_kaynak = norm ? "operator_girisi" : null;
  if (!norm) {
    rapor.msisdn_not = "Telefon no bu uctan alinamaz; --telefon ile ver ya da `numara` komutunu kullan "
      + "(--telefon 05xxxxxxxxx) ya da operatorden ICCID->numara listesi.";
  }
  rapor.ok = isOk(rapor.problems);
  return rapor;
}
