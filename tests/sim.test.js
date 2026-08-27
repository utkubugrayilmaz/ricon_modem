// SIM modulu testleri — cihaz gerektirmez.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSim, normalizePhone } from "../src/sim.js";

test("normalizePhone: TR mobil formatlarini 5xxxxxxxxx yapar", () => {
  assert.equal(normalizePhone("05551234567"), "5551234567");
  assert.equal(normalizePhone("+90 555 123 45 67"), "5551234567");
  assert.equal(normalizePhone("555-123-45-67"), "5551234567");
  assert.equal(normalizePhone("5551234567"), "5551234567");
});

test("normalizePhone: gecersiz -> null", () => {
  assert.equal(normalizePhone("1234"), null);
  assert.equal(normalizePhone("02121234567"), null); // sabit hat
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
});

test("readSim: kimliksiz AUTH_REQUIRED (cihaza gitmez)", async () => {
  const r = await readSim({ host: "127.0.0.1", kimlik: null });
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].kod, "AUTH_REQUIRED");
});
