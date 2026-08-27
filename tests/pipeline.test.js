// Pipeline (tak-çalıştır) testleri — saf karar mantığı + guard'lar.
// Cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextAction, pcPreflight, provisionModem, provisionRecord,
} from "../src/pipeline.js";

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

test("provisionModem: TELEFON ZORUNLU — yoksa telefon_yok (cihaza gitmez)", async () => {
  const r = await provisionModem({
    kimlik: { kullanici: "u", sifre: "p" }, profil: { ad: "saha", nvram: {} },
  });
  assert.equal(r.ok, false);
  assert.equal(r.durum, "telefon_yok");
  assert.equal(r.problems[0].kod, "MSISDN_REQUIRED");
});

test("provisionModem: gecersiz telefon -> MSISDN_INVALID (sessizce gecmez)", async () => {
  const r = await provisionModem({
    kimlik: { kullanici: "u", sifre: "p" }, profil: { ad: "saha", nvram: {} },
    telefon: "1234",
  });
  assert.equal(r.durum, "telefon_yok");
  assert.equal(r.problems[0].kod, "MSISDN_INVALID");
});

test("provisionModem: basarisiz cikista da KAYIT uretilir ve bildirilir", async () => {
  const yazilan = [];
  const r = await provisionModem({
    kimlik: null, profil: { ad: "saha", nvram: {} },
    kayit: (satir) => yazilan.push(satir),
  });
  assert.equal(yazilan.length, 1, "kayit callback tam 1 kez cagrilir");
  assert.equal(yazilan[0].durum, "kimlik_yok");
  assert.equal(yazilan[0].ok, false);
  assert.equal(yazilan[0].telefon, null);
  assert.deepEqual(r.kayit, yazilan[0]);
});

test("provisionModem: kayit callback patlarsa akis bozulmaz", async () => {
  const r = await provisionModem({
    kimlik: null, profil: { ad: "saha", nvram: {} },
    kayit: () => { throw new Error("disk dolu"); },
  });
  assert.equal(r.durum, "kimlik_yok");   // throw yutuldu, sonuc yine dondu
});

test("provisionRecord: PURE — sabit sema, telefon normalize edilmis gelir", () => {
  const k = provisionRecord({
    sonuc: { zaman: "2026-08-27T00:00:00.000Z", durum: "hazir", ok: true, deneme: 1 },
    telefon: "5321234567",
    kimlikBilgi: { lan_mac: "00:0c:43:43:5f:4e", iccid: "8990", imei: "867", operator: "Turkcell" },
    profilAd: "saha", host: "5.5.5.1",
  });
  assert.deepEqual(Object.keys(k), [
    "zaman", "durum", "ok", "deneme", "profil", "modem_ip", "telefon",
    "lan_mac", "iccid", "imsi", "imei", "operator",
  ]);
  assert.equal(k.telefon, "5321234567");
  assert.equal(k.imsi, null, "verilmeyen alan null (0 ya da bos degil)");
});
