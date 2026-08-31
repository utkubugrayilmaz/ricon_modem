// "Tekrar bakmali miyim, ne kadar sonra?" — PURE karar, cihaz gerektirmez.
//
// Neden var: numara okumasi gecici olarak basarisiz oldugunda arac vazgeciyor
// ve operator TARAYICIYI YENILEMEK zorunda kaliyordu. Asil ayrim su:
// INSAN mi bekleniyor, GECICI bir aksilik mi oldu? Ikisini karistirmak ya
// bosa yoklama (tek baglantili cihazi mesgul eder) ya da takilip kalma
// (operator elle yenilesin) demek.

import { test } from "node:test";
import assert from "node:assert/strict";
import { retryDecision } from "../src/index.js";

const p = (...codes) => codes.map((code) => ({ code, severity: "error" }));
const temel = { pc: { ready: true }, modem: { host: "192.168.1.1" },
  sim: { present: true, lock: null }, missing: [], problems: [], canStart: false };

test("baslatilabilir -> tekrar YOK (is bitti, operator baslatacak)", () => {
  const k = retryDecision({ ...temel, canStart: true });
  assert.equal(k.retry, false);
  assert.equal(k.reason, "can_start");
});

test("modem yok -> SIK tekrar (kablo takilinca hemen gorulsun)", () => {
  const k = retryDecision({ ...temel, modem: { host: null } });
  assert.equal(k.retry, true);
  assert.equal(k.afterSec, 3);
});

test("PC agi yok -> SIK tekrar (kablo takilacak)", () => {
  const k = retryDecision({ ...temel, pc: { ready: false } });
  assert.equal(k.retry, true);
  assert.equal(k.afterSec, 3);
});

// GECICI: tarayici yenileyince duzelen durum tam olarak bu.
test("gecici hata (telnet dustu / AT portu) -> tekrar, 5 sn", () => {
  for (const code of ["REQUEST_FAILED", "AT_PORT_NOT_FOUND", "DEVICE_BUSY", "EMPTY_BODY"]) {
    const k = retryDecision({ ...temel, missing: ["phone"], problems: p(code) });
    assert.equal(k.retry, true, code);
    assert.equal(k.afterSec, 5, code);
    assert.equal(k.reason, "temporary_error", code);
  }
});

// INSAN bekleniyor: tekrar bakmak AYNI cevabi verir, bosa yoklama olur.
test("PIN kilitli -> tekrar YOK (operator PIN girecek)", () => {
  const k = retryDecision({ ...temel, sim: { present: true, lock: "pin" },
    missing: ["pin"], problems: p("SIM_PIN_LOCKED") });
  assert.equal(k.retry, false);
  assert.equal(k.reason, "pin_pending");
});

test("PUK kilitli -> tekrar YOK (insan mudahalesi)", () => {
  const k = retryDecision({ ...temel, problems: p("SIM_PUK_LOCKED") });
  assert.equal(k.retry, false);
  assert.equal(k.reason, "puk_needs_human");
});

test("numara SIM'de yazili degil -> tekrar YOK (tekrar okumak ayni sonuc)", () => {
  const k = retryDecision({ ...temel, missing: ["phone"],
    problems: p("MSISDN_NOT_ON_SIM") });
  assert.equal(k.retry, false);
  assert.equal(k.reason, "msisdn_not_on_sim");
});

test("numara uyusmazligi -> tekrar YOK (operator karar verecek)", () => {
  const k = retryDecision({ ...temel, problems: p("MSISDN_MISMATCH") });
  assert.equal(k.retry, false);
});

// FIZIKSEL is: modem kapatilip SIM takilacak — bak ama seyrek.
test("SIM takili degil -> SEYREK tekrar (10 sn)", () => {
  const k = retryDecision({ ...temel, sim: { present: false },
    missing: ["sim"], problems: p("SIM_MISSING") });
  assert.equal(k.retry, true);
  assert.equal(k.afterSec, 10);
  assert.equal(k.reason, "waiting_sim");
});

test("sebebi tanimadigimiz eksik -> seyrek tekrar (sessiz kalmaktan iyi)", () => {
  const k = retryDecision({ ...temel, missing: ["phone"] });
  assert.equal(k.retry, true);
  assert.equal(k.afterSec, 10);
  assert.equal(k.reason, "gaps_remain");
});

test("bos/eksiksiz rapor patlamaz", () => {
  assert.equal(typeof retryDecision().retry, "boolean");
  assert.equal(typeof retryDecision({}).retry, "boolean");
});

// SIRA onemli: PIN kilitliyken SIM takili ve modem var; "gecici hata"
// dalina dusmemeli, cunku SIM_PIN_LOCKED problemi de error seviyesinde.
test("SIRA: PIN kilidi + gecici hata birlikte -> INSAN kazanir", () => {
  const k = retryDecision({ ...temel, sim: { present: true, lock: "pin" },
    problems: p("SIM_PIN_LOCKED", "REQUEST_FAILED") });
  assert.equal(k.retry, false, "PIN bekleniyorsa bosa yoklama yapilmaz");
});
