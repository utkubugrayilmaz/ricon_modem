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
import { problemText, localizeProblems, PROBLEM_TEXT_TR } from "../src/problems.js";

test("her sorun kodunun TURKCE karsiligi var", () => {
  const missing = PROBLEM_CODES.filter((k) => !PROBLEM_TEXT_TR[k]);
  assert.deepEqual(missing, [], `cevirisi olmayan kodlar: ${missing.join(", ")}`);
});

// KISA OLACAK. Tezgahtaki teknisyen paragraf okumaz; uzun metin ekranda
// gercek bilgiyi (kalan hak, numara) asagi itiyor. Ust sinirlar bilincli:
// baslik bir ETIKET, whatToDo TEK eylem.
const BASLIK_UST = 40;
const NEYAP_UST = 90;

test("Turkce metinler KISA: baslik <= 40, neYap <= 90 karakter", () => {
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

test("Turkce metinler TEKNIK KOMUT icermez (asil kusur buydu)", () => {
  // Ekrana PowerShell/AT/nvram komutu, dosya yolu ya da Ingilizce yonerge
  // basmak yardim degil gurultu. Tek istisna: 05xxxxxxxxx gibi ORNEK deger.
  const yasakli = /New-NetIPAddress|PowerShell|nvram |AT\+|\/dev\/|--env-file|http:\/\//i;
  for (const code of PROBLEM_CODES) {
    const t = problemText(code);
    assert.ok(!yasakli.test(t.title), `${code}: baslikta teknik komut var`);
    assert.ok(!yasakli.test(t.whatToDo), `${code}: neYap'ta teknik komut var`);
  }
});

test("bilinmeyen kod PATLAMAZ ve ham Ingilizce SIZDIRMAZ", () => {
  const t = problemText("BOYLE_BIR_KOD_YOK");
  assert.ok(t.title.length > 3);
  assert.match(t.whatToDo, /BOYLE_BIR_KOD_YOK/, "kodu bildirmeli ki takip edilebilsin");
  const bos = problemText(undefined);
  assert.ok(bos.title.length > 3, "kodsuz cagri da anlamli metin dondurmeli");
});

test("problemleriTurkcelestir: tr EKLER, gelistirici metnini KORUR", () => {
  const p = [problem("NO_SOURCE_IP", "192.168.1.50"), problem("SIM_PIN_LOCKED", 3)];
  const c = localizeProblems(p);
  assert.equal(c.length, 2);
  assert.equal(c[0].tr.code, "NO_SOURCE_IP");
  assert.match(c[0].tr.title, /ağ/i);
  assert.ok(c[0].message.length > 0, "message korunur (gunluk/gelistirici tarafi)");
  assert.equal(c[1].tr.title, "SIM PIN kilitli");
  assert.deepEqual(localizeProblems(), [], "bos girdi patlamaz");
});
