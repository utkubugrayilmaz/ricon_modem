// SIM PIN kilidini kaldirmaya IZIN VAR MI? — PURE karar, cihaz gerektirmez.
//
// Neden ayri ve saf: bu karar bir SIM'in PUK'a kilitlenmesini onleyen son
// kapi. Cihazla konusan koda gomulu olsa test edilemezdi; burada her durum
// tek tek yazili. CLI, endpoint ve arayuz ayni karari kullanir — arayuzde
// dugmeyi gizlemek KORUMA DEGIL, sadece gorgudur.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  simKilitKaldirmaKarari, simKilidiUygunMu, PIN_TOPLAM_VARSAYILAN,
} from "../src/at.js";

const kilitli = (pin_kalan, ek = {}) => ({
  durum: "SIM PIN", kilit: "pin", hazir: false, pin_kalan, puk_kalan: 10, ...ek,
});

test("kilitli SIM, hak EL DEGMEMIS (3/3) -> izin", () => {
  const k = simKilitKaldirmaKarari(kilitli(3), "1234");
  assert.equal(k.izin, true);
  assert.equal(k.sebep, null);
});

test("KULLANICI KURALI: bir hak yanmis (2/3) -> DENEMEZ, sadece bildirir", () => {
  const k = simKilitKaldirmaKarari(kilitli(2), "1234");
  assert.equal(k.izin, false);
  assert.equal(k.sebep, "PIN_HAK_YANMIS");
  assert.equal(k.problems[0].kod, "PIN_HAK_YANMIS");
});

test("son hak (1/3) -> DENEMEZ; zorla bile yakamaz", () => {
  assert.equal(simKilitKaldirmaKarari(kilitli(1), "1234").izin, false);
  assert.equal(simKilitKaldirmaKarari(kilitli(1), "1234", { zorla: true }).izin, false,
    "son hak asla otomatik yakilmaz");
  assert.equal(simKilitKaldirmaKarari(kilitli(0), "1234").izin, false);
});

test("zorla: yanmis hak kuralini gecer (bilincli insan karari)", () => {
  const k = simKilitKaldirmaKarari(kilitli(2), "1234", { zorla: true });
  assert.equal(k.izin, true);
});

test("kalan hak OKUNAMADI (null) -> izin, ama uyari tasir", () => {
  const k = simKilitKaldirmaKarari(kilitli(null), "1234");
  assert.equal(k.izin, true, "sayaci bildirmeyen modul her seyi kilitlememeli");
  assert.equal(k.problems[0].kod, "PIN_KALAN_BILINMIYOR");
  assert.equal(k.problems[0].severity, "warning", "uyari ok'u bozmaz");
});

test("PUK kilidi -> asla denenmez (insan mudahalesi)", () => {
  const k = simKilitKaldirmaKarari(
    { durum: "SIM PUK", kilit: "puk", hazir: false, pin_kalan: 0, puk_kalan: 9 }, "1234");
  assert.equal(k.izin, false);
  assert.equal(k.sebep, "SIM_PUK_LOCKED");
});

test("SIM yok / durum bilinmiyor -> denenmez", () => {
  for (const d of [{ durum: "UNKNOWN", kilit: null, hazir: false },
    { durum: "NOT INSERTED", kilit: null, hazir: false }]) {
    assert.equal(simKilitKaldirmaKarari(d, "1234").izin, false, d.durum);
  }
});

test("SIM ZATEN ACIK: kilit sorgusunu kapatmak da PIN ister -> ayni hak kurali", () => {
  const acik = (pin_kalan) => ({ durum: "READY", kilit: null, hazir: true,
    pin_kalan, puk_kalan: 10 });
  assert.equal(simKilitKaldirmaKarari(acik(3), "1234").izin, true);
  assert.equal(simKilitKaldirmaKarari(acik(2), "1234").izin, false,
    "acik SIM'de de CLCK parola ister, yanlissa hak yakar");
});

test("gecersiz PIN bicimi -> cihaza HIC gitmez", () => {
  for (const p of ["123", "123456789", "12a4"]) {
    const k = simKilitKaldirmaKarari(kilitli(3), p);
    assert.equal(k.izin, false, `pin: ${p}`);
    assert.equal(k.sebep, "PIN_INVALID");
  }
});

// PIN VERILMEMIS olmak, bicimi BOZUK olmaktan farkli bir durum: ekranda biri
// "PIN'i gir", digeri "4-8 hane" demeli. Eskiden ikisi de PIN_INVALID'di.
test("PIN hic verilmemis -> PIN_REQUIRED (bicim hatasi degil)", () => {
  for (const p of [null, undefined, ""]) {
    const k = simKilitKaldirmaKarari(kilitli(3), p);
    assert.equal(k.izin, false, `pin: ${p}`);
    assert.equal(k.sebep, "PIN_REQUIRED");
  }
});

test("PIN toplami varsayilani 3 (GSM standardi)", () => {
  assert.equal(PIN_TOPLAM_VARSAYILAN, 3);
  // Cihaz toplami BILDIRIYORSA onu kullanir.
  assert.equal(simKilitKaldirmaKarari(kilitli(4, { pin_toplam: 5 }), "1234").izin, false,
    "4/5 de yanmis hak demek");
  assert.equal(simKilitKaldirmaKarari(kilitli(5, { pin_toplam: 5 }), "1234").izin, true);
});

// --- PIN'i BILMEDEN sorulabilen hal: arayuz dugmeyi gosterecek mi? ---
//
// Ayni kurallar, PIN'siz. Arayuz bunu sorar; kural iki yerde YAZILMAZ.
test("simKilidiUygunMu: PIN gerekmez, ayni kurallari uygular", () => {
  assert.equal(simKilidiUygunMu(kilitli(3)).uygun, true);
  assert.equal(simKilidiUygunMu(kilitli(2)).sebep, "PIN_HAK_YANMIS");
  assert.equal(simKilidiUygunMu(kilitli(1)).sebep, "PIN_LAST_ATTEMPT");
  assert.equal(simKilidiUygunMu(kilitli(2), { zorla: true }).uygun, true);
});

test("simKilitKaldirmaKarari uygunluk kararini AYNI yerden alir", () => {
  // Bicim gecerliyse iki fonksiyon ayni sonuca varmali (kural tek yerde).
  for (const kalan of [3, 2, 1, null]) {
    assert.equal(simKilitKaldirmaKarari(kilitli(kalan), "1234").izin,
      simKilidiUygunMu(kilitli(kalan)).uygun, `kalan: ${kalan}`);
  }
});
