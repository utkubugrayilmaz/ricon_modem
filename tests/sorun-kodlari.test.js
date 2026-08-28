// Kodda GECEN her sorun kodu KATALOGDA var mi? Cihaz gerektirmez.
//
// Iki gercek kusuru yakalamak icin var:
//   1) YAZIM HATASI. problem("SIM_MISSNG") sessizce catalog fallback'ine
//      dusuyor ("Internal error: ... could not describe") — calisir gorunur,
//      ekranda anlamsiz metin cikar.
//   2) UYDURMA KOD. server.js bir ara 5 kodu katalog disinda uretiyordu
//      (MESGUL/MODEM_YOK/MSISDN/PC_HAZIR_DEGIL/PROFILE_UNKNOWN) ve Turkce
//      cumlelerini kendi icinde elle yaziyordu. Dordunun katalogda zaten
//      karsiligi vardi; ayni durumun metni iki yerde durunca biri eskiyor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROBLEM_CODES } from "../src/problems.js";
import { PROBLEM_TEXT_TR } from "../src/sorun-metni.js";

const SRC = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function kaynaklar() {
  return readdirSync(SRC)
    .filter((f) => f.endsWith(".js") && f !== "problems.js" && f !== "sorun-metni.js")
    .map((f) => ({ name: f, text: readFileSync(join(SRC, f), "utf8") }));
}

// Kod URETEN cagrilar: dogrudan problem(), karar modullerindeki red(),
// gosterim tarafindaki sorunTr()/hataYolla().
const CAGRILAR = /(?:problem|deny|problemText|sendError)\(\s*(?:send,\s*)?"([A-Z_0-9]+)"/g;

test("kodda gecen HER sorun kodu katalogda var", () => {
  const bilinen = new Set(PROBLEM_CODES);
  const kusurlu = [];
  for (const { name, text } of kaynaklar()) {
    for (const m of text.matchAll(CAGRILAR)) {
      if (!bilinen.has(m[1])) kusurlu.push(`${name}: ${m[1]}`);
    }
  }
  assert.deepEqual(kusurlu, [], `katalogda olmayan kodlar: ${kusurlu.join(", ")}`);
});

test("taramanin kendisi CALISIYOR (bos regex yanlis yesil vermesin)", () => {
  let count = 0;
  for (const { text } of kaynaklar()) count += [...text.matchAll(CAGRILAR)].length;
  assert.ok(count > 30, `yalniz ${count} kod uretimi bulundu — tarama bozuk olabilir`);
});

test("katalogdaki her kodun TURKCE karsiligi var (ters yon)", () => {
  const missing = PROBLEM_CODES.filter((k) => !PROBLEM_TEXT_TR[k]);
  assert.deepEqual(missing, []);
});
