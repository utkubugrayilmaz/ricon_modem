// SIM modulu testleri — cihaz gerektirmez.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSim, normalizePhone, phoneInputFormat } from "../src/device.js";

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
  const r = await readSim({ host: "127.0.0.1", credentials: null });
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].code, "AUTH_REQUIRED");
});

// --- Ekran bicimi ---
//
// Cekirdek numarayi KANONIK tutar (5xxxxxxxxx, 10 hane); ekran 11 haneli
// 05xxxxxxxxx bekliyor. Donusum bir KARAR sayilir ve cekirdekte durur:
// arayuz "basina 0 ekle" gibi bir kural TASIMAZ, hazir degeri gosterir.
test("telefonGirdiBicimi: kanonik numara ekranin bekledigi 11 haneye cevrilir", () => {
  assert.equal(phoneInputFormat("5321234567"), "05321234567");
});

test("telefonGirdiBicimi: her girdi bicimi once normalize edilir", () => {
  for (const raw of ["+905321234567", "0532 123 45 67", "0532-123-4567", "05321234567"]) {
    assert.equal(phoneInputFormat(raw), "05321234567", `girdi: ${raw}`);
  }
});

test("telefonGirdiBicimi: gecersiz/bos -> bos string (ekran alani temiz kalir)", () => {
  for (const raw of [null, undefined, "", "1234", "0532123456"]) {
    assert.equal(phoneInputFormat(raw), "", `girdi: ${raw}`);
  }
});
