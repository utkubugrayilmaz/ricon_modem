// SIM PIN karar tablosu — HER SATIR test altinda.
// Neden onemli: yanlis bir PIN yazmak SIM'in 3 hakkindan birini yakar ve
// ucu bitince SIM PUK'a kilitlenir. Bu kararlarin hepsi burada kanitlanir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { simPinTarget } from "../src/index.js";

const lock = (ek = {}) => ({ lock: "pin", pinRemaining: 3, pinTotal: 3,
  pukRemaining: 10, pukTotal: 10, ...ek });
const codes = (r) => r.problems.map((p) => p.code);

test("1-2) KILIT YOK -> DOKUNMA (sakli PIN SIM'i aciyor olabilir)", () => {
  for (const s of [null, undefined, { lock: null }, { lock: null, pinRemaining: 3 }]) {
    const r = simPinTarget(s, "1234");
    assert.equal(r.target, undefined, "kilit yokken PIN alanina DOKUNULMAZ");
    assert.deepEqual(r.problems, []);
  }
});

test("3) PIN kilitli + gecerli PIN -> YAZ", () => {
  const r = simPinTarget(lock(), "0270");
  assert.equal(r.target, "0270");
  assert.deepEqual(codes(r), []);
});

test("4) PIN kilitli + BOZUK bicim -> DOKUNMA, deneme yakilmaz", () => {
  for (const kotu of ["12", "123456789", "abcd", "12a4"]) {
    const r = simPinTarget(lock(), kotu);
    assert.equal(r.target, undefined, `"${kotu}" yazilmamali`);
    assert.deepEqual(codes(r), ["PIN_INVALID"]);
  }
});

test("5) SON HAK (kalan<=1) -> otomatik YAZMA YOK, karar insanda", () => {
  for (const remaining of [1, 0]) {
    const r = simPinTarget(lock({ pinRemaining: remaining }), "0270");
    assert.notEqual(r.target, "0270", "son hak otomatik yakilmaz");
    assert.ok(codes(r).includes("PIN_LAST_ATTEMPT"));
  }
});

test("5b) son hakta hak zaten yakilmissa sakli PIN BOSALTILIR", () => {
  // kalan 1 < toplam 3 -> birileri yanlis PIN gonderiyor; kanamayi durdur.
  const r = simPinTarget(lock({ pinRemaining: 1 }), "0270");
  assert.equal(r.target, "", "sakli yanlis PIN silinir");
  assert.deepEqual(codes(r), ["PIN_LAST_ATTEMPT", "PIN_STALE_CLEARED"]);
});

test("6) PIN kilitli + PIN YOK + hak YAKILMIS -> BOSALT", () => {
  const r = simPinTarget(lock({ pinRemaining: 2 }), null);
  assert.equal(r.target, "", "her boot bir hak yakan sakli PIN silinir");
  assert.deepEqual(codes(r), ["PIN_STALE_CLEARED"]);
});

test("6b) PIN kilitli + PIN YOK + hak yakilmamis (3/3) -> DOKUNMA", () => {
  // Kanit yok: modem PIN'i henuz gondermemis olabilir. DOGRU bir PIN'i
  // silmek zarar verir, o yuzden dokunmuyoruz.
  const r = simPinTarget(lock({ pinRemaining: 3 }), null);
  assert.equal(r.target, undefined);
  assert.deepEqual(codes(r), []);
});

test("7) PUK kilitli -> PIN yazilmaz, sakli PIN BOSALTILIR", () => {
  const r = simPinTarget({ lock: "puk", pinRemaining: 0, pinTotal: 3,
    pukRemaining: 9, pukTotal: 10 }, "0270");
  assert.equal(r.target, "", "PUK'ta PIN yazmak ise yaramaz");
  assert.deepEqual(codes(r), ["PIN_STALE_CLEARED"]);
});

test("sayac bilgisi YOKSA (eski firmware) kanit da yok -> DOKUNMA", () => {
  const r = simPinTarget({ lock: "pin", pinRemaining: null, pinTotal: null }, null);
  assert.equal(r.target, undefined, "sayac okunamiyorsa korlemesine silmeyiz");
});

// --- "BIR KEZ DENEDIYSEN BIR DAHA DENEME" (kullanici istegi) ---

test("5c) hak YAKILMIS + otomatik yol -> IKINCI DENEME YOK", () => {
  const r = simPinTarget(lock({ pinRemaining: 2 }), "0270");
  assert.notEqual(r.target, "0270", "otomatik ikinci deneme yapilmaz");
  assert.ok(codes(r).includes("PIN_ATTEMPT_BURNED"),
    "ayni kosul tek kod: PIN_ALREADY_TRIED ile birlestirildi");
  // Ayrica sakli yanlis PIN temizlenir: kanama devam etmesin.
  assert.equal(r.target, "");
});

test("5c) hak yakilmamis (3/3) + otomatik yol -> TEK deneme YAPILIR", () => {
  const r = simPinTarget(lock({ pinRemaining: 3 }), "0270");
  assert.equal(r.target, "0270");
  assert.deepEqual(codes(r), []);
});

test("5c) ELLE ONAY: insan bilincli onaylarsa 2. deneme yapilabilir", () => {
  const r = simPinTarget(lock({ pinRemaining: 2 }), "0270", { humanApproved: true });
  assert.equal(r.target, "0270", "insan karari otomasyondan farkli");
  assert.deepEqual(codes(r), []);
});

test("5c) ELLE ONAY bile SON HAKKI yakamaz", () => {
  const r = simPinTarget(lock({ pinRemaining: 1 }), "0270", { humanApproved: true });
  assert.notEqual(r.target, "0270", "son hak elle onayla da yakilmaz");
  assert.ok(codes(r).includes("PIN_LAST_ATTEMPT"));
});

test("sayac okunamiyorsa (baska firmware) otomatik deneme ENGELLENMEZ", () => {
  // Kanit yok; katı davranmak ozelligi tumden olduruyordu. Belgelenmis tercih.
  const r = simPinTarget({ lock: "pin", pinRemaining: null, pinTotal: null }, "0270");
  assert.equal(r.target, "0270");
});
