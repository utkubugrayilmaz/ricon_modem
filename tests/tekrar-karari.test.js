// "Tekrar bakmali miyim, ne kadar sonra?" — PURE karar, cihaz gerektirmez.
//
// Neden var: numara okumasi gecici olarak basarisiz oldugunda arac vazgeciyor
// ve operator TARAYICIYI YENILEMEK zorunda kaliyordu. Asil ayrim su:
// INSAN mi bekleniyor, GECICI bir aksilik mi oldu? Ikisini karistirmak ya
// bosa yoklama (tek baglantili cihazi mesgul eder) ya da takilip kalma
// (operator elle yenilesin) demek.

import { test } from "node:test";
import assert from "node:assert/strict";
import { yenidenDenemeKarari } from "../src/index.js";

const p = (...kodlar) => kodlar.map((kod) => ({ kod, severity: "error" }));
const temel = { pc: { hazir: true }, modem: { host: "192.168.1.1" },
  sim: { takili: true, kilit: null }, eksik: [], problems: [], baslatilabilir: false };

test("baslatilabilir -> tekrar YOK (is bitti, operator baslatacak)", () => {
  const k = yenidenDenemeKarari({ ...temel, baslatilabilir: true });
  assert.equal(k.tekrar, false);
  assert.equal(k.sebep, "baslatilabilir");
});

test("modem yok -> SIK tekrar (kablo takilinca hemen gorulsun)", () => {
  const k = yenidenDenemeKarari({ ...temel, modem: { host: null } });
  assert.equal(k.tekrar, true);
  assert.equal(k.sonra_sn, 3);
});

test("PC agi yok -> SIK tekrar (kablo takilacak)", () => {
  const k = yenidenDenemeKarari({ ...temel, pc: { hazir: false } });
  assert.equal(k.tekrar, true);
  assert.equal(k.sonra_sn, 3);
});

// GECICI: tarayici yenileyince duzelen durum tam olarak bu.
test("gecici hata (telnet dustu / AT portu) -> tekrar, 5 sn", () => {
  for (const kod of ["REQUEST_FAILED", "AT_PORT_YOK", "DEVICE_BUSY", "EMPTY_BODY"]) {
    const k = yenidenDenemeKarari({ ...temel, eksik: ["telefon"], problems: p(kod) });
    assert.equal(k.tekrar, true, kod);
    assert.equal(k.sonra_sn, 5, kod);
    assert.equal(k.sebep, "gecici_hata", kod);
  }
});

// INSAN bekleniyor: tekrar bakmak AYNI cevabi verir, bosa yoklama olur.
test("PIN kilitli -> tekrar YOK (operator PIN girecek)", () => {
  const k = yenidenDenemeKarari({ ...temel, sim: { takili: true, kilit: "pin" },
    eksik: ["pin"], problems: p("SIM_PIN_LOCKED") });
  assert.equal(k.tekrar, false);
  assert.equal(k.sebep, "pin_bekleniyor");
});

test("PUK kilitli -> tekrar YOK (insan mudahalesi)", () => {
  const k = yenidenDenemeKarari({ ...temel, problems: p("SIM_PUK_LOCKED") });
  assert.equal(k.tekrar, false);
  assert.equal(k.sebep, "puk_insan_bekliyor");
});

test("numara SIM'de yazili degil -> tekrar YOK (tekrar okumak ayni sonuc)", () => {
  const k = yenidenDenemeKarari({ ...temel, eksik: ["telefon"],
    problems: p("MSISDN_CIHAZDA_YOK") });
  assert.equal(k.tekrar, false);
  assert.equal(k.sebep, "numara_simde_yok");
});

test("numara uyusmazligi -> tekrar YOK (operator karar verecek)", () => {
  const k = yenidenDenemeKarari({ ...temel, problems: p("MSISDN_UYUSMAZLIK") });
  assert.equal(k.tekrar, false);
});

// FIZIKSEL is: modem kapatilip SIM takilacak — bak ama seyrek.
test("SIM takili degil -> SEYREK tekrar (10 sn)", () => {
  const k = yenidenDenemeKarari({ ...temel, sim: { takili: false },
    eksik: ["sim"], problems: p("SIM_MISSING") });
  assert.equal(k.tekrar, true);
  assert.equal(k.sonra_sn, 10);
  assert.equal(k.sebep, "sim_bekleniyor");
});

test("sebebi tanimadigimiz eksik -> seyrek tekrar (sessiz kalmaktan iyi)", () => {
  const k = yenidenDenemeKarari({ ...temel, eksik: ["telefon"] });
  assert.equal(k.tekrar, true);
  assert.equal(k.sonra_sn, 10);
  assert.equal(k.sebep, "eksik_var");
});

test("bos/eksiksiz rapor patlamaz", () => {
  assert.equal(typeof yenidenDenemeKarari().tekrar, "boolean");
  assert.equal(typeof yenidenDenemeKarari({}).tekrar, "boolean");
});

// SIRA onemli: PIN kilitliyken SIM takili ve modem var; "gecici hata"
// dalina dusmemeli, cunku SIM_PIN_LOCKED problemi de error seviyesinde.
test("SIRA: PIN kilidi + gecici hata birlikte -> INSAN kazanir", () => {
  const k = yenidenDenemeKarari({ ...temel, sim: { takili: true, kilit: "pin" },
    problems: p("SIM_PIN_LOCKED", "REQUEST_FAILED") });
  assert.equal(k.tekrar, false, "PIN bekleniyorsa bosa yoklama yapilmaz");
});
