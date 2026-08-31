// DD-WRT canli sayfa ayristiricisi.
//
// Bu firmware'in canli uclari {anahtar::deger} ciftleri dondurur. Ornek
// (2026-08-26 canli cihazdan):
//   {lan_mac::00:0C:43:43:5F:4E}
//   {m1imei::860000000000000}
//   {m1signal::<table ...>...</table>}   <- bazi alanlar HTML tasir
//
// Bazi alanlar (sinyal cubugu) HTML blogu tasir; etiketler temizlenir ki
// ham deger kullanilabilir olsun.

import { SIM_FIELD_MAP, SIM2_FIELD_MAP, OPERATORS } from "../domain/constants.js";

// Ham metinden {anahtar::deger} ciftlerini cikarir.
// Prototip kirlenmesine karsi Object.create(null): cihazdan __proto__ adli
// bir alan gelirse prototipi bozup ciktidan kaybolmasin.
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
