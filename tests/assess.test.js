// "Ne eksik" karari — PURE. UI/endpoint/terminal hepsi ayni cevaba bakar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { provisioningGaps } from "../src/index.js";

const full = { modemUp: true, simPresent: true, simLockInfo: { lock: null },
  phone: "05350641858", pin: null };

test("her sey tamam -> eksik YOK, baslatilabilir", () => {
  assert.deepEqual(provisioningGaps(full), []);
});

test("modem yok -> once MODEM istenir (SIM/telefon sormanin anlami yok)", () => {
  const e = provisioningGaps({ ...full, modemUp: false, simPresent: false });
  assert.equal(e[0], "modem");
  assert.ok(!e.includes("sim"), "modem yokken SIM eksigi raporlanmaz");
});

test("SIM yok -> sim eksik", () => {
  assert.deepEqual(provisioningGaps({ ...full, simPresent: false }), ["sim"]);
});

test("telefon yok / gecersiz -> telefon eksik", () => {
  for (const t of [null, "", "1234", "0535064185"]) {
    assert.ok(provisioningGaps({ ...full, phone: t }).includes("phone"),
      `"${t}" gecersiz sayilmali`);
  }
});

test("PIN kilidi VAR ve PIN yok -> pin eksik", () => {
  const e = provisioningGaps({ ...full, simLockInfo: { lock: "pin", pinRemaining: 3 } });
  assert.deepEqual(e, ["pin"]);
});

test("PIN kilidi var ama PIN VERILDI -> pin eksik DEGIL", () => {
  const e = provisioningGaps({ ...full, simLockInfo: { lock: "pin" }, pin: "0270" });
  assert.deepEqual(e, []);
});

test("KILIT YOKSA pin HIC sorulmaz (proje hedefi PIN'siz akis)", () => {
  assert.deepEqual(provisioningGaps({ ...full, simLockInfo: { lock: null } }), []);
  assert.deepEqual(provisioningGaps({ ...full, simLockInfo: null }), []);
});

test("PUK kilidi 'eksik girdi' DEGIL — insan mudahalesi, problems ile bildirilir", () => {
  const e = provisioningGaps({ ...full, simLockInfo: { lock: "puk", pukRemaining: 9 } });
  assert.deepEqual(e, [], "PUK icin PIN sorulmaz");
});

test("cok eksik varsa hepsi listelenir, sira en temelden", () => {
  const e = provisioningGaps({ modemUp: true, simPresent: true,
    simLockInfo: { lock: "pin" }, phone: null, pin: null });
  assert.deepEqual(e, ["phone", "pin"]);
});
