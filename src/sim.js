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
const SIM_UC = "/asp/status/Status_Internet.live.asp";

// Turkiye mobil numarasini 5xxxxxxxxx (10 hane) olarak normalize eder.
// Gecersizse null. (+90 / 0 / bosluk-tire kabul.)
export function telefonNormalize(ham) {
  if (!ham) return null;
  const d = String(ham).replace(/[\s.\-()]/g, "").replace(/^\+?90/, "").replace(/^0/, "");
  return /^5\d{9}$/.test(d) ? d : null;
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
  const norm = telefonNormalize(telefon);
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
