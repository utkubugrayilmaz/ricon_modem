// Provizyon motoru testleri — planlama saf/idempotent mantik + dry-run.
// Cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { planProvisioning, splitPlan, applyProvisioning } from "../src/provisioning.js";
import { FIELD_PROFILE, LAN_IP_KEYS } from "../src/profile.js";
import { consoleWrite, shQuote } from "../src/console.js";

test("planProvisioning: sadece farkli anahtarlari degisecek isaretler", () => {
  const mevcut = { wl0_net_mode: "mixed", m1s1wanapn: "internet", lan_ipaddr: "192.168.1.1" };
  const profil = { nvram: { wl0_net_mode: "disabled", m1s1wanapn: "internet", lan_ipaddr: "5.5.5.1" } };
  const p = planProvisioning(mevcut, profil);
  assert.deepEqual(Object.keys(p.degisecek).sort(), ["lan_ipaddr", "wl0_net_mode"]);
  assert.equal(p.degisecek.wl0_net_mode.hedef, "disabled");
  assert.deepEqual(p.ayni, ["m1s1wanapn"]);
});

test("planProvisioning: IDEMPOTENT — istenen durumda hicbir sey degismez", () => {
  const mevcut = { wl0_net_mode: "disabled", m1s1wanapn: "internet", lan_ipaddr: "5.5.5.1" };
  const profil = { nvram: { wl0_net_mode: "disabled", m1s1wanapn: "internet", lan_ipaddr: "5.5.5.1" } };
  const p = planProvisioning(mevcut, profil);
  assert.equal(Object.keys(p.degisecek).length, 0);
  assert.equal(p.ayni.length, 3);
});

test("planProvisioning: cihazda olmayan anahtar eksik listesine girer", () => {
  const p = planProvisioning({}, { nvram: { yeni_anahtar: "1" } });
  assert.deepEqual(p.eksik, ["yeni_anahtar"]);
  assert.equal(p.degisecek.yeni_anahtar.mevcut, null);
});

test("splitPlan: LAN IP anahtarlarini ayirir (en sona yazilir)", () => {
  const degisecek = {
    lan_ipaddr: { mevcut: "192.168.1.1", hedef: "5.5.5.1" },
    wl0_net_mode: { mevcut: "mixed", hedef: "disabled" },
  };
  const { lanIp, digerleri } = splitPlan(degisecek);
  assert.ok("lan_ipaddr" in lanIp);
  assert.ok("wl0_net_mode" in digerleri);
  assert.ok(!("lan_ipaddr" in digerleri));
});

test("FIELD_PROFILE: doğrulanmis anahtarlari tasir, hedefler string", () => {
  assert.equal(FIELD_PROFILE.nvram.wl0_net_mode, "disabled");
  assert.equal(FIELD_PROFILE.nvram.lan_ipaddr, "5.5.5.1");
  assert.equal(FIELD_PROFILE.nvram.m1s1wanapn, "internet");
  assert.ok(LAN_IP_KEYS.includes("lan_ipaddr"));
});

test("applyProvisioning: kimliksiz AUTH_REQUIRED (cihaza gitmez)", async () => {
  const r = await applyProvisioning({ host: "127.0.0.1", kimlik: null }, FIELD_PROFILE);
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].kod, "AUTH_REQUIRED");
});

test("shQuote: tek tirnaklari guvenli kacirir (komut enjeksiyonu yok)", () => {
  assert.equal(shQuote("internet"), "'internet'");
  assert.equal(shQuote("a'b"), "'a'\\''b'");
});

test("consoleWrite: bos cift kumesi -> yazma yok, ok", async () => {
  const r = await consoleWrite({ host: "127.0.0.1", kullanici: "a", sifre: "b" }, {});
  assert.equal(r.ok, true);
  assert.equal(r.yazilan.length, 0);
});
