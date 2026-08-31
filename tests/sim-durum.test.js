// "Status of SIM" cozumleyici — canli cihazdan gorulen GERCEK metinlerle.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSimStatus } from "../src/device/sim.js";
import { problem } from "../src/domain/problems.js";

test("parseSimStatus: PIN kilidi + KALAN DENEME sayilari (canli metin)", () => {
  const d = parseSimStatus("Need verification PIN code (PIN: 3/3, PUK: 10/10)");
  assert.equal(d.kilit, "pin");
  assert.equal(d.hazir, false);
  assert.equal(d.pin_kalan, 3);
  assert.equal(d.pin_toplam, 3);
  assert.equal(d.puk_kalan, 10);
  assert.equal(d.puk_toplam, 10);
});

test("parseSimStatus: deneme yakildikca kalan DUSER", () => {
  const d = parseSimStatus("Need verification PIN code (PIN: 1/3, PUK: 10/10)");
  assert.equal(d.pin_kalan, 1, "son hak — otomatik deneme YAPILMAMALI");
});

test("parseSimStatus: PUK kilidi PIN kilidiyle KARISTIRILMAZ", () => {
  const d = parseSimStatus("Need verification PUK code (PIN: 0/3, PUK: 9/10)");
  assert.equal(d.kilit, "puk", "PIN degil PUK — PIN yazmak ise yaramaz");
  assert.equal(d.pin_kalan, 0);
  assert.equal(d.puk_kalan, 9);
});

test("parseSimStatus: OK -> kilit yok, hazir", () => {
  const d = parseSimStatus("OK");
  assert.equal(d.kilit, null);
  assert.equal(d.hazir, true);
  assert.equal(d.pin_kalan, null, "sayac yoksa null (0 DEGIL)");
});

test("parseSimStatus: SIM yok / gecersiz -> kilit yok ama hazir da degil", () => {
  for (const m of ["Not Insert", "Invalid"]) {
    const d = parseSimStatus(m);
    assert.equal(d.kilit, null);
    assert.equal(d.hazir, false, `"${m}" hazir sayilmamali`);
    assert.equal(d.ham, m, "ham metin korunur (teshis icin)");
  }
});

test("parseSimStatus: bos/undefined patlamaz", () => {
  for (const m of [null, undefined, "", "   "]) {
    const d = parseSimStatus(m);
    assert.equal(d.kilit, null);
    assert.equal(d.hazir, false);
    assert.equal(d.ham, null);
  }
});

// --- Kilit -> problem eslesmesi ve mesajlarin DOGRU seyi soylemesi ---

test("SIM_PIN_LOCKED birincil cozum olarak 'PIN'i KAPAT' diyor (proje karari)", () => {
  const p = problem("SIM_PIN_LOCKED", 3);
  assert.equal(p.severity, "warning", "ayarlar dogru; provizyon basarisiz degil");
  assert.match(p.message, /attempts left: 3/);
  assert.match(p.check, /TURN THE PIN OFF/, "PIN sakla degil, PIN'i kaldir");
});

test("SIM_PUK_LOCKED: PIN yazmanin ise yaramadigini soyluyor", () => {
  const p = problem("SIM_PUK_LOCKED", 9);
  assert.match(p.message, /PIN cannot help|Entering a PIN cannot help/);
  assert.match(p.check, /destroys the SIM/, "PUK tukenirse SIM biter uyarisi");
});

test("PIN_LAST_ATTEMPT: son hakta otomatik deneme YOK, karar insanda", () => {
  const p = problem("PIN_LAST_ATTEMPT", 1);
  assert.match(p.message, /Only 1 PIN attempt/);
  assert.match(p.check, /left to a human/);
  assert.equal(p.severity, "warning");
});

test("PIN_REQUIRED de UYARI — durum 'hazir' derken problems error tasimasin", () => {
  const p = problem("PIN_REQUIRED");
  assert.equal(p.severity, "warning");
  assert.match(p.check, /turn the PIN off/, "birincil cozum PIN'i kaldirmak");
});

test("PIN_STORED_WRONG: ayni PIN zaten yaziliysa deneme YAKILMADIGINI soyler", () => {
  const p = problem("PIN_STORED_WRONG");
  assert.equal(p.severity, "warning");
  assert.match(p.message, /no attempt was burned/);
  assert.match(p.check, /stored PIN is therefore wrong/);
});
