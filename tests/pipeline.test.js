// Pipeline (tak-çalıştır) testleri — saf karar mantığı + guard'lar.
// Cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sonrakiEylem, pcOnKontrol, hazirlaModem } from "../src/pipeline.js";

test("sonrakiEylem: saha adresinde + istenen durumda -> zaten_hazir", () => {
  assert.equal(sonrakiEylem(false, true, "zaten_istenen_durumda"), "zaten_hazir");
});

test("sonrakiEylem: saha adresinde ama eksik -> provizyon_saha", () => {
  assert.equal(sonrakiEylem(false, true, "kuru_calisma"), "provizyon_saha");
});

test("sonrakiEylem: fabrika adresinde -> provizyon_fabrika", () => {
  assert.equal(sonrakiEylem(true, false, null), "provizyon_fabrika");
});

test("sonrakiEylem: hicbiri -> modem_yok", () => {
  assert.equal(sonrakiEylem(false, false, null), "modem_yok");
});

test("pcOnKontrol: kaynak IP yoksa NO_SOURCE_IP problemi", () => {
  // Var olmayan onekler -> ikisi de bulunamaz
  const r = pcOnKontrol("203.0.113.", "198.51.100.");
  assert.equal(r.hazir, false);
  assert.equal(r.problems.length, 2);
  assert.equal(r.problems[0].kod, "NO_SOURCE_IP");
});

test("hazirlaModem: kimliksiz -> kimlik_yok (cihaza gitmez)", async () => {
  const r = await hazirlaModem({ kimlik: null, profil: { nvram: {} } });
  assert.equal(r.ok, false);
  assert.equal(r.durum, "kimlik_yok");
  assert.equal(r.problems[0].kod, "AUTH_REQUIRED");
});
