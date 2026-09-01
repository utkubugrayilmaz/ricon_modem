// PUK karar tablosu — HER SATIR test altinda. Cihaz gerektirmez.
//
// NEDEN AYRI VE SAF: bu karar bir SIM'in KALICI OLARAK OLMESINI onleyen son
// kapi. PIN'de uc hak var ve sonu PUK; PUK'ta on hak var ve sonu HICBIR SEY —
// SIM cope gider. Karar cihazla konusan koda gomulu oldugu surece test
// edilemezdi ve nitekim edilmiyordu: unblockSimPuk eklendiginde dort kapinin
// dordu de I/O fonksiyonunun icindeydi ve tek bir testi yoktu.
//
// tests/pin-unlock.test.js'in basindaki gerekce burada da aynen gecerli.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pukUnblockDecision } from "../src/index.js";

const PUK = "12345678";       // 8 hane
const YENI = "1234";          // 4-8 hane

// PUK kilitli, hak el degmemis.
const kilitli = (pukRemaining = 10, extra = {}) => ({
  status: "SIM PUK", lock: "puk", ready: false, pukRemaining, pinRemaining: 0, ...extra,
});
const kod = (r) => r.problems.map((p) => p.code);

// --- 1) BICIM: bozuk girdi cihaza HIC gitmemeli -------------------------

test("PUK 8 hane DEGILSE reddedilir (bosa harcanmis deneme olurdu)", () => {
  for (const bozuk of ["1234567", "123456789", "abcdefgh", "", null, undefined, "1234 5678"]) {
    const r = pukUnblockDecision(kilitli(), bozuk, YENI);
    assert.equal(r.eligible, false, `kabul edilmemeliydi: ${bozuk}`);
    assert.deepEqual(kod(r), ["PUK_INVALID"]);
  }
});

test("YENI PIN 4-8 hane degilse reddedilir", () => {
  for (const bozuk of ["123", "123456789", "abcd", "", null, undefined]) {
    const r = pukUnblockDecision(kilitli(), PUK, bozuk);
    assert.equal(r.eligible, false, `kabul edilmemeliydi: ${bozuk}`);
    assert.deepEqual(kod(r), ["PUK_INVALID"]);
  }
});

test("gecerli bicim: 8 hane PUK + 4..8 hane PIN", () => {
  for (const pin of ["1234", "12345", "12345678"]) {
    assert.equal(pukUnblockDecision(kilitli(), PUK, pin).eligible, true, `PIN: ${pin}`);
  }
});

// --- 2) SIM gercekten PUK kilitli mi? -----------------------------------

test("SIM PUK KILITLI DEGILSE gonderilmez (PUK bosa harcanirdi)", () => {
  for (const lock of [null, "pin", undefined]) {
    const r = pukUnblockDecision({ lock, status: "READY", pukRemaining: 10 }, PUK, YENI);
    assert.equal(r.eligible, false);
    assert.deepEqual(kod(r), ["PUK_NOT_REQUIRED"]);
  }
});

test("PUK_NOT_REQUIRED mesaji SIM'in o anki durumunu tasir", () => {
  const r = pukUnblockDecision({ lock: null, status: "READY" }, PUK, YENI);
  assert.match(r.problems[0].message, /READY/);
});

test("durum hic okunamamissa da reddedilir (unknown)", () => {
  const r = pukUnblockDecision({}, PUK, YENI);
  assert.equal(r.eligible, false);
  assert.deepEqual(kod(r), ["PUK_NOT_REQUIRED"]);
  assert.match(r.problems[0].message, /unknown/);
});

// --- 3) SON HAK: gecilemez ----------------------------------------------

test("SON HAK (1) -> asla otomatik denenmez", () => {
  const r = pukUnblockDecision(kilitli(1), PUK, YENI);
  assert.equal(r.eligible, false);
  assert.deepEqual(kod(r), ["PUK_LAST_ATTEMPT"]);
});

test("SON HAK'ki manualConsent BILE gecemez (PIN'den farki: geri donus yok)", () => {
  const r = pukUnblockDecision(kilitli(1), PUK, YENI, { manualConsent: true });
  assert.equal(r.eligible, false, "--force son PUK hakkini yakamaz");
  assert.deepEqual(kod(r), ["PUK_LAST_ATTEMPT"]);
});

test("hak 0 ise de reddedilir (SIM zaten olmus olabilir)", () => {
  const r = pukUnblockDecision(kilitli(0), PUK, YENI, { manualConsent: true });
  assert.equal(r.eligible, false);
  assert.deepEqual(kod(r), ["PUK_LAST_ATTEMPT"]);
});

test("hak 2 ve ustu -> izin (son hak DEGIL)", () => {
  for (const kalan of [2, 3, 10]) {
    assert.equal(pukUnblockDecision(kilitli(kalan), PUK, YENI).eligible, true,
      `kalan ${kalan} icin izin verilmeliydi`);
  }
});

// --- 4) Kalan hak OKUNAMADIYSA ------------------------------------------

test("kalan hak okunamadi -> izin YOK (bilmeden PUK harcanmaz)", () => {
  const r = pukUnblockDecision(kilitli(null), PUK, YENI);
  assert.equal(r.eligible, false);
  assert.deepEqual(kod(r), ["PIN_REMAINING_UNKNOWN"]);
});

test("kalan hak okunamadi + manualConsent -> izin (operator sorumlulugu alir)", () => {
  const r = pukUnblockDecision(kilitli(null), PUK, YENI, { manualConsent: true });
  assert.equal(r.eligible, true);
});

// --- Kapi SIRASI: once bicim, sonra durum -------------------------------

test("bozuk PUK, kilitli olmayan SIM'de bile ONCE bicimden reddedilir", () => {
  // Sira onemli: bicim kontrolu cihaza gitmeden yapilabilen tek kontrol.
  // Once durum bakilsaydi, bozuk PUK icin once bir okuma turu atilirdi.
  const r = pukUnblockDecision({ lock: null, status: "READY" }, "kisa", YENI);
  assert.deepEqual(kod(r), ["PUK_INVALID"]);
});

test("izin verilen durumda problems BOS", () => {
  const r = pukUnblockDecision(kilitli(10), PUK, YENI);
  assert.equal(r.eligible, true);
  assert.deepEqual(r.problems, []);
  assert.equal(r.reason, null);
});
