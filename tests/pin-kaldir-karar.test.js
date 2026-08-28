// SIM PIN kilidini kaldirmaya IZIN VAR MI? — PURE karar, cihaz gerektirmez.
//
// Neden ayri ve saf: bu karar bir SIM'in PUK'a kilitlenmesini onleyen son
// kapi. Cihazla konusan koda gomulu olsa test edilemezdi; burada her durum
// tek tek yazili. CLI, endpoint ve arayuz ayni karari kullanir — arayuzde
// dugmeyi gizlemek KORUMA DEGIL, sadece gorgudur.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  simUnlockDecision, isSimLockEligible, PIN_TOTAL_DEFAULT,
} from "../src/at.js";

const locked = (pinRemaining, extra = {}) => ({
  status: "SIM PIN", lock: "pin", ready: false, pinRemaining, pukRemaining: 10, ...extra,
});

test("kilitli SIM, hak EL DEGMEMIS (3/3) -> izin", () => {
  const k = simUnlockDecision(locked(3), "1234");
  assert.equal(k.allow, true);
  assert.equal(k.reason, null);
});

test("KULLANICI KURALI: bir hak yanmis (2/3) -> DENEMEZ, sadece bildirir", () => {
  const k = simUnlockDecision(locked(2), "1234");
  assert.equal(k.allow, false);
  assert.equal(k.reason, "PIN_ATTEMPT_BURNED");
  assert.equal(k.problems[0].code, "PIN_ATTEMPT_BURNED");
});

test("son hak (1/3) -> DENEMEZ; zorla bile yakamaz", () => {
  assert.equal(simUnlockDecision(locked(1), "1234").allow, false);
  assert.equal(simUnlockDecision(locked(1), "1234", { humanApproved: true }).allow, false,
    "SON HAK: insan onayi bile gecemez — yanlis PIN burada PUK demek");
  assert.equal(simUnlockDecision(locked(0), "1234").allow, false);
});

// AYRIM (kullanici netlestirdi): "bir hak yakildiysa BIR DAHA DENEME" kurali
// OTOMATIK yol icindir — arac kendi kendine ayni isi tekrarlamasin. INSAN
// baska bir PIN denemek isterse onun onu kesilmez; dogru PIN'i bilen odur.
test("elleOnay: yanmis hak kuralini gecer (insan baska PIN deneyebilir)", () => {
  assert.equal(simUnlockDecision(locked(2), "1234").allow, false,
    "OTOMATIK yol: hak yanmissa denemez");
  assert.equal(simUnlockDecision(locked(2), "1234", { humanApproved: true }).allow, true,
    "INSAN yolu: engellenmez");
});

test("kalan hak OKUNAMADI (null) -> izin, ama uyari tasir", () => {
  const k = simUnlockDecision(locked(null), "1234");
  assert.equal(k.allow, true, "sayaci bildirmeyen modul her seyi kilitlememeli");
  assert.equal(k.problems[0].code, "PIN_REMAINING_UNKNOWN");
  assert.equal(k.problems[0].severity, "warning", "uyari ok'u bozmaz");
});

test("PUK kilidi -> asla denenmez (insan mudahalesi)", () => {
  const k = simUnlockDecision(
    { status: "SIM PUK", lock: "puk", ready: false, pinRemaining: 0, pukRemaining: 9 }, "1234");
  assert.equal(k.allow, false);
  assert.equal(k.reason, "SIM_PUK_LOCKED");
});

test("SIM yok / durum bilinmiyor -> denenmez", () => {
  for (const d of [{ status: "UNKNOWN", lock: null, ready: false },
    { status: "NOT INSERTED", lock: null, ready: false }]) {
    assert.equal(simUnlockDecision(d, "1234").allow, false, d.status);
  }
});

test("SIM ZATEN ACIK: kilit sorgusunu kapatmak da PIN ister -> ayni hak kurali", () => {
  const isOpen = (pinRemaining) => ({ status: "READY", lock: null, ready: true,
    pinRemaining, pukRemaining: 10 });
  assert.equal(simUnlockDecision(isOpen(3), "1234").allow, true);
  assert.equal(simUnlockDecision(isOpen(2), "1234").allow, false,
    "acik SIM'de de CLCK parola ister, yanlissa hak yakar");
});

test("gecersiz PIN bicimi -> cihaza HIC gitmez", () => {
  for (const p of ["123", "123456789", "12a4"]) {
    const k = simUnlockDecision(locked(3), p);
    assert.equal(k.allow, false, `pin: ${p}`);
    assert.equal(k.reason, "PIN_INVALID");
  }
});

// PIN VERILMEMIS olmak, bicimi BOZUK olmaktan farkli bir durum: ekranda biri
// "PIN'i gir", digeri "4-8 hane" demeli. Eskiden ikisi de PIN_INVALID'di.
test("PIN hic verilmemis -> PIN_REQUIRED (bicim hatasi degil)", () => {
  for (const p of [null, undefined, ""]) {
    const k = simUnlockDecision(locked(3), p);
    assert.equal(k.allow, false, `pin: ${p}`);
    assert.equal(k.reason, "PIN_REQUIRED");
  }
});

test("PIN toplami varsayilani 3 (GSM standardi)", () => {
  assert.equal(PIN_TOTAL_DEFAULT, 3);
  // Cihaz toplami BILDIRIYORSA onu kullanir.
  assert.equal(simUnlockDecision(locked(4, { pinTotal: 5 }), "1234").allow, false,
    "4/5 de yanmis hak demek");
  assert.equal(simUnlockDecision(locked(5, { pinTotal: 5 }), "1234").allow, true);
});

// --- PIN'i BILMEDEN sorulabilen hal: arayuz dugmeyi gosterecek mi? ---
//
// Ayni kurallar, PIN'siz. Arayuz bunu sorar; kural iki yerde YAZILMAZ.
test("simKilidiUygunMu: PIN gerekmez, ayni kurallari uygular", () => {
  assert.equal(isSimLockEligible(locked(3)).eligible, true);
  assert.equal(isSimLockEligible(locked(2)).reason, "PIN_ATTEMPT_BURNED");
  assert.equal(isSimLockEligible(locked(1)).reason, "PIN_LAST_ATTEMPT");
  assert.equal(isSimLockEligible(locked(2), { humanApproved: true }).eligible, true);
});

test("simKilitKaldirmaKarari uygunluk kararini AYNI yerden alir", () => {
  // Bicim gecerliyse iki fonksiyon ayni sonuca varmali (kural tek yerde).
  for (const remaining of [3, 2, 1, null]) {
    assert.equal(simUnlockDecision(locked(remaining), "1234").allow,
      isSimLockEligible(locked(remaining)).eligible, `kalan: ${remaining}`);
  }
});

// --- OTOMATIK yol / INSAN yolu ayrimi (kullanici kurali) ---
//
// "Bir hak yakildiysa arac bir daha denemesin" ISTEGI, aracin KENDI KENDINE
// ayni isi tekrarlamasina karsiydi. Ilk yazimda bunu insana da uyguladim:
// operator yanlis PIN girince dugme KAYBOLUYORDU ve dogru PIN'i deneyemiyordu.
// Yanlis olan buydu — dogru PIN'i bilen operator.
test("hak yanmis SIM: OTOMATIK denemez, INSAN deneyebilir", () => {
  const yanmis = locked(2);
  assert.equal(isSimLockEligible(yanmis).eligible, false, "otomatik yol durur");
  assert.equal(isSimLockEligible(yanmis, { humanApproved: true }).eligible, true, "insan yolu acik");
});

test("SON HAK: iki yol da durur (tek gecilemez kural)", () => {
  const last = locked(1);
  assert.equal(isSimLockEligible(last).eligible, false);
  assert.equal(isSimLockEligible(last, { humanApproved: true }).eligible, false,
    "yanlis PIN burada PUK demek; insan onayi bile gecemez");
});
