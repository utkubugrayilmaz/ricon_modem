// Kodda GECEN her sorun kodu KATALOGDA var mi? Cihaz gerektirmez.
//
// Iki gercek kusuru yakalamak icin var:
//   1) YAZIM HATASI. problem("SIM_MISSNG") sessizce catalog fallback'ine
//      dusuyor ("Internal error: ... could not describe") — calisir gorunur,
//      ekranda anlamsiz metin cikar.
//   2) UYDURMA KOD. server.js bir ara 5 kodu katalog disinda uretiyordu
//      (MESGUL/MODEM_YOK/MSISDN/PC_HAZIR_DEGIL/PROFIL_YOK) ve Turkce
//      cumlelerini kendi icinde elle yaziyordu. Dordunun katalogda zaten
//      karsiligi vardi; ayni durumun metni iki yerde durunca biri eskiyor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROBLEM_CODES } from "../src/problems.js";
import { SORUN_TR } from "../src/sorun-metni.js";

const SRC = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function kaynaklar() {
  return readdirSync(SRC)
    .filter((f) => f.endsWith(".js") && f !== "problems.js" && f !== "sorun-metni.js")
    .map((f) => ({ ad: f, metin: readFileSync(join(SRC, f), "utf8") }));
}

// Kod URETEN cagrilar: dogrudan problem(), karar modullerindeki red(),
// gosterim tarafindaki sorunTr()/hataYolla().
const CAGRILAR = /(?:problem|red|sorunTr|hataYolla)\(\s*(?:gonder,\s*)?"([A-Z_0-9]+)"/g;

test("kodda gecen HER sorun kodu katalogda var", () => {
  const bilinen = new Set(PROBLEM_CODES);
  const kusurlu = [];
  for (const { ad, metin } of kaynaklar()) {
    for (const m of metin.matchAll(CAGRILAR)) {
      if (!bilinen.has(m[1])) kusurlu.push(`${ad}: ${m[1]}`);
    }
  }
  assert.deepEqual(kusurlu, [], `katalogda olmayan kodlar: ${kusurlu.join(", ")}`);
});

test("taramanin kendisi CALISIYOR (bos regex yanlis yesil vermesin)", () => {
  let sayi = 0;
  for (const { metin } of kaynaklar()) sayi += [...metin.matchAll(CAGRILAR)].length;
  assert.ok(sayi > 30, `yalniz ${sayi} kod uretimi bulundu — tarama bozuk olabilir`);
});

test("katalogdaki her kodun TURKCE karsiligi var (ters yon)", () => {
  const eksik = PROBLEM_CODES.filter((k) => !SORUN_TR[k]);
  assert.deepEqual(eksik, []);
});
