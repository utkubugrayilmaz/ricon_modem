// Pipeline (tak-çalıştır) testleri — saf karar mantığı + guard'lar.
// Cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAction, pcPreflight, provisionModem } from "../src/pipeline.js";

test("nextAction: saha adresinde + istenen durumda -> zaten_hazir", () => {
  assert.equal(nextAction(false, true, "zaten_istenen_durumda"), "zaten_hazir");
});

test("nextAction: saha adresinde ama eksik -> provizyon_saha", () => {
  assert.equal(nextAction(false, true, "kuru_calisma"), "provizyon_saha");
});

test("nextAction: fabrika adresinde -> provizyon_fabrika", () => {
  assert.equal(nextAction(true, false, null), "provizyon_fabrika");
});

test("nextAction: hicbiri -> modem_yok", () => {
  assert.equal(nextAction(false, false, null), "modem_yok");
});

test("pcPreflight: kaynak IP yoksa NO_SOURCE_IP problemi", () => {
  // Var olmayan onekler -> ikisi de bulunamaz
  const r = pcPreflight("203.0.113.", "198.51.100.");
  assert.equal(r.hazir, false);
  assert.equal(r.problems.length, 2);
  assert.equal(r.problems[0].kod, "NO_SOURCE_IP");
});

test("provisionModem: kimliksiz -> kimlik_yok (cihaza gitmez)", async () => {
  const r = await provisionModem({ kimlik: null, profil: { nvram: {} } });
  assert.equal(r.ok, false);
  assert.equal(r.durum, "kimlik_yok");
  assert.equal(r.problems[0].kod, "AUTH_REQUIRED");
});
