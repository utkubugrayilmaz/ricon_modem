// Kodda GECEN her sorun kodu KATALOGDA var mi? Cihaz gerektirmez.
//
// Iki gercek kusuru yakalamak icin var:
//   1) YAZIM HATASI. problem("SIM_MISSNG") sessizce catalog fallback'ine
//      dusuyor ("Internal error: ... could not describe") — calisir gorunur,
//      ekranda anlamsiz metin cikar.
//   2) UYDURMA KOD. server.js bir ara 5 kodu katalog disinda uretiyordu
//      (MESGUL/MODEM_YOK/MSISDN/PC_HAZIR_DEGIL/PROFILE_MISSING) ve Turkce
//      cumlelerini kendi icinde elle yaziyordu. Dordunun katalogda zaten
//      karsiligi vardi; ayni durumun metni iki yerde durunca biri eskiyor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROBLEM_CODES } from "../src/problems.js";
import { PROBLEM_TEXT_TR } from "../src/problems.js";

const SRC = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// ALT KLASORLERE INER: src/ katmanlara bolundu (domain/transport/parse/
// device/flow/report). Duz readdir yapan eski surum tasimadan sonra tek bir
// kaynak dosyasi bile taramiyordu ve test BOS KUMEYLE gecerdi.
function kaynaklar() {
  const out = [];
  const yuru = (dizin) => {
    for (const name of readdirSync(dizin, { withFileTypes: true })) {
      if (name.isDirectory()) { yuru(join(dizin, name.name)); continue; }
      if (!name.name.endsWith(".js")) continue;
      if (name.name === "problems.js" || name.name === "sorun-metni.js") continue;
      out.push({ name: name.name, text: readFileSync(join(dizin, name.name), "utf8") });
    }
  };
  yuru(SRC);
  return out;
}

// Kod URETEN cagrilar: dogrudan problem(), karar modullerindeki red(),
// gosterim tarafindaki problemText()/hataYolla().
const CAGRILAR = /(?:problem|red|sorunTr|hataYolla)\(\s*(?:gonder,\s*)?"([A-Z_0-9]+)"/g;

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
  let finiteOrNull = 0;
  for (const { text } of kaynaklar()) finiteOrNull += [...text.matchAll(CAGRILAR)].length;
  assert.ok(finiteOrNull > 30, `yalniz ${finiteOrNull} kod uretimi bulundu — tarama bozuk olabilir`);
});

test("katalogdaki her kodun TURKCE karsiligi var (ters yon)", () => {
  const missing = PROBLEM_CODES.filter((k) => !PROBLEM_TEXT_TR[k]);
  assert.deepEqual(missing, []);
});
