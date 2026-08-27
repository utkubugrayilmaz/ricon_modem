// SIM PIN karar tablosu — HER SATIR test altinda.
// Neden onemli: yanlis bir PIN yazmak SIM'in 3 hakkindan birini yakar ve
// ucu bitince SIM PUK'a kilitlenir. Bu kararlarin hepsi burada kanitlanir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { simPinHedefi } from "../src/index.js";

const kilit = (ek = {}) => ({ kilit: "pin", pin_kalan: 3, pin_toplam: 3,
  puk_kalan: 10, puk_toplam: 10, ...ek });
const kodlar = (r) => r.problems.map((p) => p.kod);

test("1-2) KILIT YOK -> DOKUNMA (sakli PIN SIM'i aciyor olabilir)", () => {
  for (const s of [null, undefined, { kilit: null }, { kilit: null, pin_kalan: 3 }]) {
    const r = simPinHedefi(s, "1234");
    assert.equal(r.hedef, undefined, "kilit yokken PIN alanina DOKUNULMAZ");
    assert.deepEqual(r.problems, []);
  }
});

test("3) PIN kilitli + gecerli PIN -> YAZ", () => {
  const r = simPinHedefi(kilit(), "0270");
  assert.equal(r.hedef, "0270");
  assert.deepEqual(kodlar(r), []);
});

test("4) PIN kilitli + BOZUK bicim -> DOKUNMA, deneme yakilmaz", () => {
  for (const kotu of ["12", "123456789", "abcd", "12a4"]) {
    const r = simPinHedefi(kilit(), kotu);
    assert.equal(r.hedef, undefined, `"${kotu}" yazilmamali`);
    assert.deepEqual(kodlar(r), ["PIN_INVALID"]);
  }
});

test("5) SON HAK (kalan<=1) -> otomatik YAZMA YOK, karar insanda", () => {
  for (const kalan of [1, 0]) {
    const r = simPinHedefi(kilit({ pin_kalan: kalan }), "0270");
    assert.notEqual(r.hedef, "0270", "son hak otomatik yakilmaz");
    assert.ok(kodlar(r).includes("PIN_LAST_ATTEMPT"));
  }
});

test("5b) son hakta hak zaten yakilmissa sakli PIN BOSALTILIR", () => {
  // kalan 1 < toplam 3 -> birileri yanlis PIN gonderiyor; kanamayi durdur.
  const r = simPinHedefi(kilit({ pin_kalan: 1 }), "0270");
  assert.equal(r.hedef, "", "sakli yanlis PIN silinir");
  assert.deepEqual(kodlar(r), ["PIN_LAST_ATTEMPT", "PIN_STALE_CLEARED"]);
});

test("6) PIN kilitli + PIN YOK + hak YAKILMIS -> BOSALT", () => {
  const r = simPinHedefi(kilit({ pin_kalan: 2 }), null);
  assert.equal(r.hedef, "", "her boot bir hak yakan sakli PIN silinir");
  assert.deepEqual(kodlar(r), ["PIN_STALE_CLEARED"]);
});

test("6b) PIN kilitli + PIN YOK + hak yakilmamis (3/3) -> DOKUNMA", () => {
  // Kanit yok: modem PIN'i henuz gondermemis olabilir. DOGRU bir PIN'i
  // silmek zarar verir, o yuzden dokunmuyoruz.
  const r = simPinHedefi(kilit({ pin_kalan: 3 }), null);
  assert.equal(r.hedef, undefined);
  assert.deepEqual(kodlar(r), []);
});

test("7) PUK kilitli -> PIN yazilmaz, sakli PIN BOSALTILIR", () => {
  const r = simPinHedefi({ kilit: "puk", pin_kalan: 0, pin_toplam: 3,
    puk_kalan: 9, puk_toplam: 10 }, "0270");
  assert.equal(r.hedef, "", "PUK'ta PIN yazmak ise yaramaz");
  assert.deepEqual(kodlar(r), ["PIN_STALE_CLEARED"]);
});

test("sayac bilgisi YOKSA (eski firmware) kanit da yok -> DOKUNMA", () => {
  const r = simPinHedefi({ kilit: "pin", pin_kalan: null, pin_toplam: null }, null);
  assert.equal(r.hedef, undefined, "sayac okunamiyorsa korlemesine silmeyiz");
});

// --- "BIR KEZ DENEDIYSEN BIR DAHA DENEME" (kullanici istegi) ---

test("5c) hak YAKILMIS + otomatik yol -> IKINCI DENEME YOK", () => {
  const r = simPinHedefi(kilit({ pin_kalan: 2 }), "0270");
  assert.notEqual(r.hedef, "0270", "otomatik ikinci deneme yapilmaz");
  assert.ok(kodlar(r).includes("PIN_ALREADY_TRIED"));
  // Ayrica sakli yanlis PIN temizlenir: kanama devam etmesin.
  assert.equal(r.hedef, "");
});

test("5c) hak yakilmamis (3/3) + otomatik yol -> TEK deneme YAPILIR", () => {
  const r = simPinHedefi(kilit({ pin_kalan: 3 }), "0270");
  assert.equal(r.hedef, "0270");
  assert.deepEqual(kodlar(r), []);
});

test("5c) ELLE ONAY: insan bilincli onaylarsa 2. deneme yapilabilir", () => {
  const r = simPinHedefi(kilit({ pin_kalan: 2 }), "0270", { elleOnay: true });
  assert.equal(r.hedef, "0270", "insan karari otomasyondan farkli");
  assert.deepEqual(kodlar(r), []);
});

test("5c) ELLE ONAY bile SON HAKKI yakamaz", () => {
  const r = simPinHedefi(kilit({ pin_kalan: 1 }), "0270", { elleOnay: true });
  assert.notEqual(r.hedef, "0270", "son hak elle onayla da yakilmaz");
  assert.ok(kodlar(r).includes("PIN_LAST_ATTEMPT"));
});

test("sayac okunamiyorsa (baska firmware) otomatik deneme ENGELLENMEZ", () => {
  // Kanit yok; katı davranmak ozelligi tumden olduruyordu. Belgelenmis tercih.
  const r = simPinHedefi({ kilit: "pin", pin_kalan: null, pin_toplam: null }, "0270");
  assert.equal(r.hedef, "0270");
});
