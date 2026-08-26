// SIM modulu testleri — cihaz gerektirmez.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSim, telefonNormalize } from "../src/sim.js";

test("telefonNormalize: TR mobil formatlarini 5xxxxxxxxx yapar", () => {
  assert.equal(telefonNormalize("05551234567"), "5551234567");
  assert.equal(telefonNormalize("+90 555 123 45 67"), "5551234567");
  assert.equal(telefonNormalize("555-123-45-67"), "5551234567");
  assert.equal(telefonNormalize("5551234567"), "5551234567");
});

test("telefonNormalize: gecersiz -> null", () => {
  assert.equal(telefonNormalize("1234"), null);
  assert.equal(telefonNormalize("02121234567"), null); // sabit hat
  assert.equal(telefonNormalize(""), null);
  assert.equal(telefonNormalize(null), null);
});

test("readSim: kimliksiz AUTH_REQUIRED (cihaza gitmez)", async () => {
  const r = await readSim({ host: "127.0.0.1", kimlik: null });
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].kod, "AUTH_REQUIRED");
});
