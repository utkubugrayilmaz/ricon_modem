// "Ne eksik" karari — PURE. UI/endpoint/terminal hepsi ayni cevaba bakar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { provisionEksikleri } from "../src/index.js";

const tam = { modemVar: true, simTakili: true, simKilit: { kilit: null },
  telefon: "05350641858", pin: null };

test("her sey tamam -> eksik YOK, baslatilabilir", () => {
  assert.deepEqual(provisionEksikleri(tam), []);
});

test("modem yok -> once MODEM istenir (SIM/telefon sormanin anlami yok)", () => {
  const e = provisionEksikleri({ ...tam, modemVar: false, simTakili: false });
  assert.equal(e[0], "modem");
  assert.ok(!e.includes("sim"), "modem yokken SIM eksigi raporlanmaz");
});

test("SIM yok -> sim eksik", () => {
  assert.deepEqual(provisionEksikleri({ ...tam, simTakili: false }), ["sim"]);
});

test("telefon yok / gecersiz -> telefon eksik", () => {
  for (const t of [null, "", "1234", "0535064185"]) {
    assert.ok(provisionEksikleri({ ...tam, telefon: t }).includes("telefon"),
      `"${t}" gecersiz sayilmali`);
  }
});

test("PIN kilidi VAR ve PIN yok -> pin eksik", () => {
  const e = provisionEksikleri({ ...tam, simKilit: { kilit: "pin", pin_kalan: 3 } });
  assert.deepEqual(e, ["pin"]);
});

test("PIN kilidi var ama PIN VERILDI -> pin eksik DEGIL", () => {
  const e = provisionEksikleri({ ...tam, simKilit: { kilit: "pin" }, pin: "0270" });
  assert.deepEqual(e, []);
});

test("KILIT YOKSA pin HIC sorulmaz (proje hedefi PIN'siz akis)", () => {
  assert.deepEqual(provisionEksikleri({ ...tam, simKilit: { kilit: null } }), []);
  assert.deepEqual(provisionEksikleri({ ...tam, simKilit: null }), []);
});

test("PUK kilidi 'eksik girdi' DEGIL — insan mudahalesi, problems ile bildirilir", () => {
  const e = provisionEksikleri({ ...tam, simKilit: { kilit: "puk", puk_kalan: 9 } });
  assert.deepEqual(e, [], "PUK icin PIN sorulmaz");
});

test("cok eksik varsa hepsi listelenir, sira en temelden", () => {
  const e = provisionEksikleri({ modemVar: true, simTakili: true,
    simKilit: { kilit: "pin" }, telefon: null, pin: null });
  assert.deepEqual(e, ["telefon", "pin"]);
});
