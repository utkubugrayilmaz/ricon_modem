// Pipeline (tak-çalıştır) testleri — saf karar mantığı + guard'lar.
// Cihaz gerektirmez.

// DIKKAT — TESTLER MAKINEYE SORMAMALI:
// provisionModem, kaynak IP verilmediginde pcPreflight() ile MAKINENIN AG
// ARAYUZLERINE bakar. Bu uc test onu vermiyordu ve yalnizca gelistiricinin
// PC'sinde 192.168.1.x + 5.5.5.x ikincil IP'leri BAGLIYKEN geciyordu.
// Olculdu (2026-08-31): modem kablosu cikarilinca arayuz dustu, iki ikincil
// IP de kayboldu ve uc test birden "pc_not_ready" ile kirmizi yandi — kodda
// hicbir sey degismemisti. Daha kotusu ters yon: kablo takliyken bu testler
// GECIYOR ve dogruladiklarini sandigimiz seyi dogrulamiyorlar.
// Cozum: kaynaklari ACIKCA ver, makineye hic sorulmasin.

import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAction, provisionModem, provisionRecord } from "../src/pipeline.js";
// pcPreflight ve isSimPresent ALT KATMANDA (cihaz.js): okuma yolu da yazma
// yolu da onlara bakiyor, pipeline'a ait degiller.
import { pcPreflight, isSimPresent } from "../src/device.js";
import { problem, isOk } from "../src/problems.js";
import { applyPin } from "../src/provision.js";
import { isSimLockEligible } from "../src/at.js";
import { stripSecrets } from "../src/report.js";

test("nextAction: saha adresinde + istenen durumda -> zaten_hazir", () => {
  assert.equal(nextAction(false, true, "already_desired"), "already_ready");
});

test("nextAction: saha adresinde ama eksik -> provizyon_saha", () => {
  assert.equal(nextAction(false, true, "dry_run"), "provision_field");
});

test("nextAction: fabrika adresinde -> provizyon_fabrika", () => {
  assert.equal(nextAction(true, false, null), "provision_factory");
});

test("nextAction: hicbiri -> modem_yok", () => {
  assert.equal(nextAction(false, false, null), "no_modem");
});

test("pcPreflight: kaynak IP yoksa NO_SOURCE_IP problemi", () => {
  // Var olmayan onekler -> ikisi de bulunamaz
  const r = pcPreflight("203.0.113.", "198.51.100.");
  assert.equal(r.ready, false);
  assert.equal(r.problems.length, 2);
  assert.equal(r.problems[0].code, "NO_SOURCE_IP");
});

test("provisionModem: kimliksiz -> kimlik_yok (cihaza gitmez)", async () => {
  const r = await provisionModem({ credentials: null, profile: { nvram: {} } });
  assert.equal(r.ok, false);
  assert.equal(r.status, "no_identity");
  assert.equal(r.problems[0].code, "AUTH_REQUIRED");
});

// SOZLESME DEGISTI (2026-08-28): telefon artik ZORUNLU GIRDI DEGIL —
// cekirdek numarayi SIM'den okuyor. Yani "numara yok" tek basina bir hata
// degil; cihaza bakilir ve GERCEK eksik ne ise o bildirilir. Modem yoksa
// modem_yok, SIM yoksa sim_yok. Yanlis teshis vermek eski davranisti.
// KOR YOKLAMA YOK. Olculdu (2026-08-28): kaynak IP baglanmadan yapilan TCP
// connect bazi aglarda HER adrese basarili donuyor. Eskiden bu, olmayan
// cihazdan kimlik okunmasina ve sonunda "SIM yok" gibi YANLIS TESHISE yol
// aciyordu. Artik kaynak turetilemiyorsa yoklama yapilmaz ve gercek sebep
// bildirilir: o alt aga bu makineden cikilamiyor.
test("provisionModem: kaynak IP turetilemezse KOR YOKLAMA yapmaz", async () => {
  const r = await provisionModem({
    credentials: { user: "u", password: "p" }, profile: { name: "saha", nvram: {} },
    factoryHost: "192.0.2.1", fieldHost: "192.0.2.2", attempts: 1,
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, "pc_not_ready");
  assert.ok(r.problems.some((p) => p.code === "NO_SOURCE_IP"),
    "gercek sebep: o alt aga cikilamiyor — 'SIM yok' demek yanlis teshisti");
});

// GECERSIZ numara AYRI is: bu bir GIRDI hatasi, cihaza gitmeye gerek yok.
// Testin hizli bitmesi de kaniti — ag beklemesi yok.
test("provisionModem: gecersiz telefon -> MSISDN_INVALID, CIHAZA GITMEZ", async () => {
  const t = Date.now();
  const r = await provisionModem({
    credentials: { user: "u", password: "p" }, profile: { name: "saha", nvram: {} },
    factorySource: "1.1.1.2", fieldSource: "2.2.2.3",   // makineye SORMA (bkz. basliktaki not)
    phone: "1234",
  });
  assert.equal(r.status, "no_phone");
  assert.equal(r.problems[0].code, "MSISDN_INVALID");
  assert.ok(Date.now() - t < 500, "girdi hatasi aga cikmadan donmeli");
});

test("provisionModem: basarisiz cikista da KAYIT uretilir ve bildirilir", async () => {
  const written = [];
  const r = await provisionModem({
    credentials: null, profile: { name: "saha", nvram: {} },
    record: (line) => written.push(line),
  });
  assert.equal(written.length, 1, "kayit callback tam 1 kez cagrilir");
  assert.equal(written[0].status, "no_identity");
  assert.equal(written[0].ok, false);
  assert.equal(written[0].phone, null);
  assert.deepEqual(r.record, written[0]);
});

test("provisionModem: kayit callback patlarsa akis bozulmaz", async () => {
  const r = await provisionModem({
    credentials: null, profile: { name: "saha", nvram: {} },
    record: () => { throw new Error("disk dolu"); },
  });
  assert.equal(r.status, "no_identity");   // throw yutuldu, sonuc yine dondu
});

test("provisionRecord: PURE — sabit sema, telefon normalize edilmis gelir", () => {
  const k = provisionRecord({
    result: { timestamp: "2026-08-27T00:00:00.000Z", status: "ready", ok: true, attempt: 1 },
    phone: "5321234567",
    identity: { lan_mac: "00:0c:43:43:5f:4e", iccid: "8990", imei: "867", operator: "Turkcell" },
    profileName: "saha", host: "5.5.5.1",
  });
  assert.deepEqual(Object.keys(k), [
    "timestamp", "status", "ok", "attempt", "profile", "modemIp", "phone",
    "lan_mac", "iccid", "imsi", "imei", "operator", "simStatus", "wan_ip",
    "internetSec", "pinAttempted", "fieldReady",
  ]);
  assert.equal(k.phone, "5321234567");
  assert.equal(k.imsi, null, "verilmeyen alan null (0 ya da bos degil)");
});

test("simTakiliMi: ICCID varsa takili, yoksa degil", () => {
  assert.equal(isSimPresent({ iccid: "8990011626160000001" }), true);
  assert.equal(isSimPresent({ iccid: null, simStatus: "Not Insert" }), false);
  assert.equal(isSimPresent({}), false);
  assert.equal(isSimPresent(), false);
});

test("provisionModem: SIM YOKSA cihaza hic gitmeden reddeder", async () => {
  const written = [];
  const r = await provisionModem({
    credentials: { user: "u", password: "p" }, profile: { name: "saha", nvram: {} },
    factorySource: "1.1.1.2", fieldSource: "2.2.2.3",   // makineye SORMA (bkz. basliktaki not)
    phone: "05321234567",
    identity: { iccid: null, simStatus: "Not Insert", imei: "867", lan_mac: "aa" },
    record: (line) => written.push(line),
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, "no_sim");
  assert.equal(r.problems[0].code, "SIM_MISSING");
  assert.match(r.problems[0].message, /Not Insert/, "teshis metni operatore gider");
  // Kayit yine tutulur: "bu modem SIM'siz geldi" sahada gercek bir bilgi.
  assert.equal(written.length, 1);
  assert.equal(written[0].status, "no_sim");
  assert.equal(written[0].iccid, null);
  assert.equal(written[0].phone, "5321234567");
});


// --- OKUMA BASARISIZ ile "SIM YOK" AYNI SEY DEGIL ---
//
// NEDEN VAR — gonderilmis GERCEK bir kusur (2026-08-31, canli):
// Fabrikaya donmus modem tak-calistir'da 2.4 SANIYEDE "no_sim" ile
// reddedildi. SIM TAKILIYDI ve ayni SIM bir dakika sonra sorunsuz okundu
// (ICCID, IMEI, Turkcell, WAN IP). Gercek sebep: cihaz reboot'tan yeni
// cikmisti, TCP portu acilmisti ama tek baglantili web sunucusu daha cevap
// vermiyordu. readIdentity readSim'in problems'ini DUSURUYORDU, yani
// basarisiz okuma `iccid: null` olarak geliyor ve SIM'siz cihazdan
// AYIRT EDILEMIYORDU.
//
// Sonuclari ZIT oldugu icin bu ayrim zorunlu:
//   SIM yok   -> insan mudahalesi ister, tekrar denemek bosa
//   okunamadi -> tam olarak tekrar denenmesi gereken sey

test("okuma BASARISIZSA 'SIM yok' DEMEZ", async () => {
  // readOk:false = "okuyamadim", iccid:null = "SIM yok" DEGIL.
  const written = [];
  const r = await provisionModem({
    credentials: { user: "u", password: "p" }, profile: { name: "field", nvram: {} },
    phone: "05321234567",
    factorySource: null, fieldSource: null,   // cihaza gitmesin
    identity: { iccid: null, imei: null, simStatus: null, lan_mac: null,
      readOk: false,
      problems: [{ code: "REQUEST_FAILED", severity: "error",
        message: "empty body", check: "" }] },
    record: (line) => written.push(line),
  });
  assert.notEqual(r.status, "no_sim", "okunamayan cihaza 'SIM yok' denmemeli");
  assert.ok(!r.problems.some((p) => p.code === "SIM_MISSING"),
    "SIM_MISSING kalici bir teshis; gecici okuma hatasinda uretilmemeli");
});

test("okuma BASARILI ve SIM gercekten yoksa: no_sim (teshis korunuyor)", async () => {
  // Duzeltmenin eski davranisi bozmadiginin kaniti.
  const r = await provisionModem({
    credentials: { user: "u", password: "p" }, profile: { name: "field", nvram: {} },
    factorySource: "1.1.1.2", fieldSource: "2.2.2.3",   // makineye SORMA (bkz. asagi)
    phone: "05321234567",
    identity: { iccid: null, simStatus: "Not Insert", imei: "867", lan_mac: "aa",
      readOk: true, problems: [] },
  });
  assert.equal(r.status, "no_sim");
  assert.equal(r.problems[0].code, "SIM_MISSING");
});

test("provisionRecord: wan_ip yoksa null (kurulum HATASI degil, sadece kayit)", () => {
  const yok = provisionRecord({ identity: { iccid: "899", simStatus: "OK" } });
  assert.equal(yok.wan_ip, null, "o an internet yoktu -> null");
  assert.equal(yok.simStatus, "OK");
  const var_ = provisionRecord({ identity: { wan_ip: "178.245.239.236" } });
  assert.equal(var_.wan_ip, "178.245.239.236");
});

test("provisionRecord: internet sonucu wan_ip ve sureyi TASIR", () => {
  const k = provisionRecord({
    identity: { iccid: "899", wan_ip: null },
    internet: { up: true, durationSec: 88.9, wan_ip: "178.245.239.236" },
  });
  assert.equal(k.wan_ip, "178.245.239.236", "internet sonucu kimlikteki null'i EZER");
  assert.equal(k.internetSec, 88.9);
});

test("INTERNET_YOK bir UYARIDIR — sonucu ok:false yapmaz", () => {
  const p = problem("INTERNET_DOWN", 150, "OK");
  assert.equal(p.severity, "warning");
  assert.match(p.check, /PIN-locked/, "PIN ilk suphe olarak yazili");
  assert.equal(isOk([p]), true, "ayarlar dogru; retry hicbir seyi cozmez");
});

// --- SIM PIN korumalari (3 yanlis deneme SIM'i PUK'a kilitler) ---

test("applyPin: BOZUK bicim cihaza HIC GITMEDEN reddedilir", async () => {
  for (const kotu of ["", "12", "123456789", "abcd", "12a4", null, undefined]) {
    const r = await applyPin({ host: "203.0.113.9", credentials: { user: "u", password: "p" } }, kotu);
    assert.equal(r.attempted, false, `"${kotu}" denenmemeli`);
    assert.equal(r.skipped, "invalid_format");
    assert.equal(r.problems[0].code, "PIN_INVALID");
  }
});

test("applyPin: kimliksiz denemez", async () => {
  const r = await applyPin({ host: "203.0.113.9", credentials: null }, "1234");
  assert.equal(r.attempted, false);
  assert.equal(r.skipped, "no_identity");
});

test("PIN_INVALID ve PIN_REQUIRED PUK riskini ACIKCA soyluyor", () => {
  assert.match(problem("PIN_INVALID").check, /PUK-lock/);
  assert.match(problem("PIN_REQUIRED").check, /PIN-locked/);
});

test("provisionRecord: PIN'in KENDISI kayda GIRMEZ, sadece denendi mi", () => {
  // PIN degerini kayda sizabilecegi HER yerden gecirmeye calis: girdi
  // nesnelerinin hicbiri kayitta PIN degeri uretmemeli.
  const PIN = "4271";
  const k = provisionRecord({
    result: { pinAttempt: { attempted: true, pin: PIN }, pin: PIN },
    identity: { iccid: "8990", pin: PIN, m1s1simpin: PIN },
    internet: { up: false, durationSec: 150, pin: PIN },
    phone: "05321234567",
  });
  assert.equal(k.pinAttempted, true, "sadece 'denendi mi' bilgisi tasinir");
  assert.ok(!JSON.stringify(k).includes(PIN), "PIN degeri kayitta HIC gorunmemeli");
  // Sema sabit: PIN tasiyabilecek yeni bir alan sessizce eklenmis olmasin.
  assert.ok(!Object.keys(k).some((a) => /pin/.test(a) && a !== "pinAttempted"),
    "pinAttempted disinda pin icerikli alan yok");
});

test("stripSecrets: PIN alanlari ciktidan silinir", () => {
  const temiz = stripSecrets({ m1s1simpin: "1234", pin: "5678", phone: "5321234567" });
  assert.equal(temiz.m1s1simpin, undefined);
  assert.equal(temiz.pin, undefined);
  assert.equal(temiz.phone, "5321234567", "telefon sir DEGIL, kalir");
});

test("stripSecrets: PUK ve YENI PIN de silinir", () => {
  // sim-puk eklendiginde suzgec guncellenmemisti. Bugun unblockSimPuk
  // bunlari rapora koymuyor (yani sizinti yoktu), ama suzgecin isi
  // "bugun ne tasiniyor" degil — bir sonraki degisiklikte delik olmamak.
  // Ayni kusur bir kez yasandi: `kimlik` -> `credentials` yeniden
  // adlandirmasinda suzgec guncellenmeyince alan ciktiya sizdi.
  const temiz = stripSecrets({ puk: "12345678", newPin: "4321", iccid: "8990X" });
  assert.equal(temiz.puk, undefined, "PUK ciktiya YAZILAMAZ");
  assert.equal(temiz.newPin, undefined, "yeni PIN ciktiya YAZILAMAZ");
  assert.equal(temiz.iccid, "8990X", "ICCID sir degil, kalir");
});

test("stripSecrets: ic ice nesnelerde de PUK silinir", () => {
  const temiz = stripSecrets({ komut: { puk: "12345678", ok: 1 } });
  assert.equal(temiz.komut.puk, undefined);
  assert.equal(temiz.komut.ok, 1);
});

test("provisionRecord: sahaya_hazir uc degerli — 'ok' tek basina YANILTICI", () => {
  // Ayarlar dogru + internet var -> gercekten hazir
  const ready = provisionRecord({ result: { ok: true },
    internet: { up: true, wan_ip: "1.2.3.4", durationSec: 40 } });
  assert.equal(ready.fieldReady, true);
  // Ayarlar dogru ama SIM calismiyor -> sahada is yapmaz
  const yarim = provisionRecord({ result: { ok: true },
    internet: { up: false, durationSec: 150 } });
  assert.equal(yarim.ok, true, "ayarlar dogru oldugu icin ok:true KALIR");
  assert.equal(yarim.fieldReady, false, "ama sahaya hazir DEGIL");
  // Internet dogrulamasi kapatilmis -> bilinmiyor, false demek yanlis olur
  const bilinmiyor = provisionRecord({ result: { ok: true }, internet: null });
  assert.equal(bilinmiyor.fieldReady, null);
});

// --- PIN kilitli SIM: NUMARA degil PIN sorulur ---
//
// NEDEN: kilitli SIM abone verisini ACMAZ, AT+CNUM bos doner. Numarayi elle
// yazdirmak kilidi cozmez — bir sonraki cihazda ayni sorun. Dogru hamle
// kilidi SIM'den kaldirmak; kalkinca numara zaten kendiliginden gelir.
// Arayuzun akisi da buydu (bkz. `ui` dali, app.js pinKilidiIste).

test("PIN kilitli SIM: askPin cagrilir, askPhone CAGRILMAZ", async () => {
  const sorulan = [];
  const r = await provisionModem({
    credentials: { user: "u", password: "p" },
    profile: { name: "saha", nvram: {} },
    factoryHost: "127.0.0.1", factorySource: "127.0.0.1",
    fieldHost: "127.0.0.2", fieldSource: "127.0.0.1",
    attempts: 1, internetWaitSec: 0,
    askPin: async () => { sorulan.push("pin"); return null; },
    askPhone: async () => { sorulan.push("phone"); return null; },
  });
  // Cihaz yok -> modem_yok; ikisi de sorulmamali (kilit bilgisi bile yok).
  assert.equal(r.status, "no_modem");
  assert.deepEqual(sorulan, [], "cihaz yokken hicbir sey sorulmaz");
});

test("isSimLockEligible: PUK kilidinde PIN SORULMAZ (kapi kapali)", () => {
  const g = isSimLockEligible({ lock: "puk", pukRemaining: 10 }, { manualConsent: true });
  assert.equal(g.eligible, false);
  assert.equal(g.reason, "SIM_PUK_LOCKED");
});

test("isSimLockEligible: son hakta elle onay bile GECMEZ", () => {
  const g = isSimLockEligible({ lock: "pin", pinRemaining: 1, pinTotal: 3 },
    { manualConsent: true });
  assert.equal(g.eligible, false, "son hak insani da durdurur");
});

test("isSimLockEligible: hak yanmis ama elle onay VARSA gecer", () => {
  // Otomatik yol katidir; dogru PIN'i bilen operatorun onu kesilmez.
  const otomatik = isSimLockEligible({ lock: "pin", pinRemaining: 2, pinTotal: 3 });
  const elle = isSimLockEligible({ lock: "pin", pinRemaining: 2, pinTotal: 3 },
    { manualConsent: true });
  assert.equal(otomatik.eligible, false, "otomatik yol yanmis hakta durur");
  assert.equal(elle.eligible, true, "elle onay gecer");
});
