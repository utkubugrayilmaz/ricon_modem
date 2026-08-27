// Pipeline (tak-çalıştır) testleri — saf karar mantığı + guard'lar.
// Cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextAction, pcPreflight, provisionModem, provisionRecord, simTakiliMi,
} from "../src/pipeline.js";
import { problem, isOk } from "../src/problems.js";
import { applyPin } from "../src/provisioning.js";
import { stripSecrets } from "../src/report.js";

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
    "lan_mac", "iccid", "imsi", "imei", "operator", "sim_durumu", "wan_ip",
    "internet_sure_sn", "pin_denendi",
  ]);
  assert.equal(k.telefon, "5321234567");
  assert.equal(k.imsi, null, "verilmeyen alan null (0 ya da bos degil)");
});

test("simTakiliMi: ICCID varsa takili, yoksa degil", () => {
  assert.equal(simTakiliMi({ iccid: "8990011626160064930" }), true);
  assert.equal(simTakiliMi({ iccid: null, sim_durumu: "Not Insert" }), false);
  assert.equal(simTakiliMi({}), false);
  assert.equal(simTakiliMi(), false);
});

test("provisionModem: SIM YOKSA cihaza hic gitmeden reddeder", async () => {
  const yazilan = [];
  const r = await provisionModem({
    kimlik: { kullanici: "u", sifre: "p" }, profil: { ad: "saha", nvram: {} },
    telefon: "05350641858",
    kimlikBilgi: { iccid: null, sim_durumu: "Not Insert", imei: "867", lan_mac: "aa" },
    kayit: (satir) => yazilan.push(satir),
  });
  assert.equal(r.ok, false);
  assert.equal(r.durum, "sim_yok");
  assert.equal(r.problems[0].kod, "SIM_MISSING");
  assert.match(r.problems[0].message, /Not Insert/, "teshis metni operatore gider");
  // Kayit yine tutulur: "bu modem SIM'siz geldi" sahada gercek bir bilgi.
  assert.equal(yazilan.length, 1);
  assert.equal(yazilan[0].durum, "sim_yok");
  assert.equal(yazilan[0].iccid, null);
  assert.equal(yazilan[0].telefon, "5350641858");
});


test("provisionRecord: wan_ip yoksa null (kurulum HATASI degil, sadece kayit)", () => {
  const yok = provisionRecord({ kimlikBilgi: { iccid: "899", sim_durumu: "OK" } });
  assert.equal(yok.wan_ip, null, "o an internet yoktu -> null");
  assert.equal(yok.sim_durumu, "OK");
  const var_ = provisionRecord({ kimlikBilgi: { wan_ip: "178.245.239.236" } });
  assert.equal(var_.wan_ip, "178.245.239.236");
});

test("provisionRecord: internet sonucu wan_ip ve sureyi TASIR", () => {
  const k = provisionRecord({
    kimlikBilgi: { iccid: "899", wan_ip: null },
    internet: { var: true, sure_sn: 88.9, wan_ip: "178.245.239.236" },
  });
  assert.equal(k.wan_ip, "178.245.239.236", "internet sonucu kimlikteki null'i EZER");
  assert.equal(k.internet_sure_sn, 88.9);
});

test("INTERNET_YOK bir UYARIDIR — sonucu ok:false yapmaz", () => {
  const p = problem("INTERNET_YOK", 150, "OK");
  assert.equal(p.severity, "warning");
  assert.match(p.check, /PIN-locked/, "PIN ilk suphe olarak yazili");
  assert.equal(isOk([p]), true, "ayarlar dogru; retry hicbir seyi cozmez");
});

// --- SIM PIN korumalari (3 yanlis deneme SIM'i PUK'a kilitler) ---

test("applyPin: BOZUK bicim cihaza HIC GITMEDEN reddedilir", async () => {
  for (const kotu of ["", "12", "123456789", "abcd", "12a4", null, undefined]) {
    const r = await applyPin({ host: "203.0.113.9", kimlik: { kullanici: "u", sifre: "p" } }, kotu);
    assert.equal(r.denendi, false, `"${kotu}" denenmemeli`);
    assert.equal(r.atlandi, "gecersiz_bicim");
    assert.equal(r.problems[0].kod, "PIN_INVALID");
  }
});

test("applyPin: kimliksiz denemez", async () => {
  const r = await applyPin({ host: "203.0.113.9", kimlik: null }, "1234");
  assert.equal(r.denendi, false);
  assert.equal(r.atlandi, "kimlik_yok");
});

test("PIN_INVALID ve PIN_REQUIRED PUK riskini ACIKCA soyluyor", () => {
  assert.match(problem("PIN_INVALID").check, /PUK-lock/);
  assert.match(problem("PIN_REQUIRED").check, /PIN-locked/);
});

test("provisionRecord: PIN'in KENDISI kayda GIRMEZ, sadece denendi mi", () => {
  const k = provisionRecord({ sonuc: { pin_denemesi: { denendi: true } } });
  assert.equal(k.pin_denendi, true);
  const duz = JSON.stringify(k);
  assert.ok(!duz.includes("pin_deger") && !/"\d{4,8}"/.test(duz.replace(/"zaman":"[^"]*"/, "")),
    "kayitta PIN degeri gorunmemeli");
});

test("stripSecrets: PIN alanlari ciktidan silinir", () => {
  const temiz = stripSecrets({ m1s1simpin: "1234", pin: "5678", telefon: "5350641858" });
  assert.equal(temiz.m1s1simpin, undefined);
  assert.equal(temiz.pin, undefined);
  assert.equal(temiz.telefon, "5350641858", "telefon sir DEGIL, kalir");
});
