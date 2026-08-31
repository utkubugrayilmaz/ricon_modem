// Sorun metinleri — HER kodun operatore gosterilecek TURKCE karsiligi VAR MI?
//
// Bu testin sebebi somut: arayuz bir ara problems[].check'i oldugu gibi
// basiyordu ve tezgahtaki teknisyene "New-NetIPAddress -InterfaceAlias
// Ethernet -IPAddress ..." yaziyordu. message/check GELISTIRICI metni ve
// Ingilizce; ekrana asla basilmaz. Yeni bir kod cevirisiz eklenirse burada
// yakalanir — uretimde ekrana Ingilizce sizmasin.

import { test } from "node:test";
import assert from "node:assert/strict";
import { PROBLEM_CODES, problem } from "../src/domain/problems.js";
import { sorunTr, problemleriTurkcelestir, SORUN_TR } from "../src/domain/sorun-metni.js";

test("her sorun kodunun TURKCE karsiligi var", () => {
  const eksik = PROBLEM_CODES.filter((k) => !SORUN_TR[k]);
  assert.deepEqual(eksik, [], `cevirisi olmayan kodlar: ${eksik.join(", ")}`);
});

// KISA OLACAK. Tezgahtaki teknisyen paragraf okumaz; uzun metin ekranda
// gercek bilgiyi (kalan hak, numara) asagi itiyor. Ust sinirlar bilincli:
// baslik bir ETIKET, neYap TEK eylem.
const BASLIK_UST = 40;
const NEYAP_UST = 90;

test("Turkce metinler KISA: baslik <= 40, neYap <= 90 karakter", () => {
  for (const kod of PROBLEM_CODES) {
    const t = sorunTr(kod);
    assert.ok(t.baslik?.length > 3, `${kod}: baslik yok`);
    assert.ok(t.neYap?.length > 3, `${kod}: neYap yok`);
    assert.ok(!t.baslik.includes("\n"), `${kod}: baslik tek satir olmali`);
    assert.ok(t.baslik.length <= BASLIK_UST,
      `${kod}: baslik ${t.baslik.length} karakter, ust sinir ${BASLIK_UST}`);
    assert.ok(t.neYap.length <= NEYAP_UST,
      `${kod}: neYap ${t.neYap.length} karakter, ust sinir ${NEYAP_UST}`);
  }
});

test("Turkce metinler TEKNIK KOMUT icermez (asil kusur buydu)", () => {
  // Ekrana PowerShell/AT/nvram komutu, dosya yolu ya da Ingilizce yonerge
  // basmak yardim degil gurultu. Tek istisna: 05xxxxxxxxx gibi ORNEK deger.
  const yasakli = /New-NetIPAddress|PowerShell|nvram |AT\+|\/dev\/|--env-file|http:\/\//i;
  for (const kod of PROBLEM_CODES) {
    const t = sorunTr(kod);
    assert.ok(!yasakli.test(t.baslik), `${kod}: baslikta teknik komut var`);
    assert.ok(!yasakli.test(t.neYap), `${kod}: neYap'ta teknik komut var`);
  }
});

test("bilinmeyen kod PATLAMAZ ve ham Ingilizce SIZDIRMAZ", () => {
  const t = sorunTr("BOYLE_BIR_KOD_YOK");
  assert.ok(t.baslik.length > 3);
  assert.match(t.neYap, /BOYLE_BIR_KOD_YOK/, "kodu bildirmeli ki takip edilebilsin");
  const bos = sorunTr(undefined);
  assert.ok(bos.baslik.length > 3, "kodsuz cagri da anlamli metin dondurmeli");
});

test("problemleriTurkcelestir: tr EKLER, gelistirici metnini KORUR", () => {
  const p = [problem("NO_SOURCE_IP", "192.168.1.50"), problem("SIM_PIN_LOCKED", 3)];
  const c = problemleriTurkcelestir(p);
  assert.equal(c.length, 2);
  assert.equal(c[0].tr.kod, "NO_SOURCE_IP");
  assert.match(c[0].tr.baslik, /ağ/i);
  assert.ok(c[0].message.length > 0, "message korunur (gunluk/gelistirici tarafi)");
  assert.equal(c[1].tr.baslik, "SIM PIN kilitli");
  assert.deepEqual(problemleriTurkcelestir(), [], "bos girdi patlamaz");
});
