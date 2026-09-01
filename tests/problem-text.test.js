// Sorun metinleri — HER kodun operatore gosterilecek TURKCE karsiligi VAR MI?
//
// Bu testin sebebi somut: arayuz bir ara problems[].check'i oldugu gibi
// basiyordu ve tezgahtaki teknisyene "New-NetIPAddress -InterfaceAlias
// Ethernet -IPAddress ..." yaziyordu. message/check GELISTIRICI metni ve
// Ingilizce; ekrana asla basilmaz. Yeni bir kod cevirisiz eklenirse burada
// yakalanir — uretimde ekrana Ingilizce sizmasin.

import { test } from "node:test";
import assert from "node:assert/strict";
import { PROBLEM_CODES, problem } from "../src/problems.js";
import { problemText, localizeProblems, OPERATOR_TEXT, isProgrammerError } from "../src/problems.js";

test("her sorun kodunun TURKCE karsiligi var", () => {
  const missing = PROBLEM_CODES.filter((k) => !OPERATOR_TEXT[k]);
  assert.deepEqual(missing, [], `cevirisi olmayan kodlar: ${missing.join(", ")}`);
});

// KISA OLACAK. Tezgahtaki teknisyen paragraf okumaz; uzun metin ekranda
// gercek bilgiyi (kalan hak, numara) asagi itiyor. Ust sinirlar bilincli:
// baslik bir ETIKET, whatToDo TEK eylem.
const BASLIK_UST = 40;
const NEYAP_UST = 90;

test("operator metinleri KISA: baslik <= 40, neYap <= 90 karakter", () => {
  for (const code of PROBLEM_CODES) {
    const t = problemText(code);
    assert.ok(t.title?.length > 3, `${code}: baslik yok`);
    assert.ok(t.whatToDo?.length > 3, `${code}: neYap yok`);
    assert.ok(!t.title.includes("\n"), `${code}: baslik tek satir olmali`);
    assert.ok(t.title.length <= BASLIK_UST,
      `${code}: baslik ${t.title.length} karakter, ust sinir ${BASLIK_UST}`);
    assert.ok(t.whatToDo.length <= NEYAP_UST,
      `${code}: neYap ${t.whatToDo.length} karakter, ust sinir ${NEYAP_UST}`);
  }
});

test("operator metinleri TEKNIK KOMUT icermez (asil kusur buydu)", () => {
  // Ekrana PowerShell/AT/nvram komutu, dosya yolu ya da Ingilizce yonerge
  // basmak yardim degil gurultu. Tek istisna: 05xxxxxxxxx gibi ORNEK deger.
  const yasakli = /New-NetIPAddress|PowerShell|nvram |AT\+|\/dev\/|--env-file|http:\/\//i;
  for (const code of PROBLEM_CODES) {
    const t = problemText(code);
    assert.ok(!yasakli.test(t.title), `${code}: baslikta teknik komut var`);
    assert.ok(!yasakli.test(t.whatToDo), `${code}: neYap'ta teknik komut var`);
  }
});

test("bilinmeyen kod PATLAMAZ ve ham gelistirici metnini SIZDIRMAZ", () => {
  const t = problemText("BOYLE_BIR_KOD_YOK");
  assert.ok(t.title.length > 3);
  assert.match(t.whatToDo, /BOYLE_BIR_KOD_YOK/, "kodu bildirmeli ki takip edilebilsin");
  const bos = problemText(undefined);
  assert.ok(bos.title.length > 3, "kodsuz cagri da anlamli metin dondurmeli");
});

test("localizeProblems: operator metnini EKLER, gelistirici metnini KORUR", () => {
  const p = [problem("NO_SOURCE_IP", "192.168.1.50"), problem("SIM_PIN_LOCKED", 3)];
  const c = localizeProblems(p);
  assert.equal(c.length, 2);
  assert.equal(c[0].operator.code, "NO_SOURCE_IP");
  assert.match(c[0].operator.title, /network/i);
  assert.ok(c[0].message.length > 0, "message korunur (gunluk/gelistirici tarafi)");
  assert.equal(c[1].operator.title, "SIM is PIN locked");
  assert.deepEqual(localizeProblems(), [], "bos girdi patlamaz");
});

// KOD HATASI SESSIZ KALMAZ.
//
// Cekirdekteki `catch {}` bloklari CIHAZ hatasini yutmak icin var. Ama ayni
// yutma ReferenceError'i da yok ediyordu: readIdentity bir donem her cagrida
// `ReferenceError: isOk is not defined` atiyordu, iki cagri yerinde de
// try/catch bunu sessizce yutuyordu ve 223 testin hicbiri yakalamadi
// (commit b3ab4ce). Ayrim artik kodda ve burada sabitleniyor.
test("isProgrammerError: kod hatasini cihaz hatasindan AYIRIR", () => {
  for (const e of [new ReferenceError("x"), new TypeError("y"), new SyntaxError("z")]) {
    assert.equal(isProgrammerError(e), true, `${e.name} kod hatasi sayilmali`);
  }
  for (const e of [new Error("ETIMEDOUT"), Object.assign(new Error("x"), { code: "ECONNRESET" })]) {
    assert.equal(isProgrammerError(e), false, "cihaz/ag hatasi yutulmaya devam etmeli");
  }
});

test("INTERNAL_ERROR katalogda ve operator metni var", () => {
  const p = problem("INTERNAL_ERROR", "isOk is not defined");
  assert.equal(p.code, "INTERNAL_ERROR");
  assert.match(p.message, /isOk is not defined/);
  assert.equal(p.severity, "error");
  assert.ok(OPERATOR_TEXT.INTERNAL_ERROR, "operator metni olmali");
});
