// SIM modulu testleri — cihaz gerektirmez.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSim, normalizePhone, telefonGirdiBicimi } from "../src/device.js";

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

// --- Ekran bicimi ---
//
// Cekirdek numarayi KANONIK tutar (5xxxxxxxxx, 10 hane); ekran 11 haneli
// 05xxxxxxxxx bekliyor. Donusum bir KARAR sayilir ve cekirdekte durur:
// arayuz "basina 0 ekle" gibi bir kural TASIMAZ, hazir degeri gosterir.
test("telefonGirdiBicimi: kanonik numara ekranin bekledigi 11 haneye cevrilir", () => {
  assert.equal(telefonGirdiBicimi("5350634747"), "05350634747");
});

test("telefonGirdiBicimi: her girdi bicimi once normalize edilir", () => {
  for (const ham of ["+905350634747", "0535 063 47 47", "0535-063-4747", "05350634747"]) {
    assert.equal(telefonGirdiBicimi(ham), "05350634747", `girdi: ${ham}`);
  }
});

test("telefonGirdiBicimi: gecersiz/bos -> bos string (ekran alani temiz kalir)", () => {
  for (const ham of [null, undefined, "", "1234", "0535063474"]) {
    assert.equal(telefonGirdiBicimi(ham), "", `girdi: ${ham}`);
  }
});
