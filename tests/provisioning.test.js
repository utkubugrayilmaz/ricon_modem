// Provizyon motoru testleri — planlama saf/idempotent mantik + dry-run.
// Cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { planProvisioning, groupPlan, applyProvisioning } from "../src/provisioning.js";
import { FIELD_PROFILE, FACTORY_PROFILE, LAN_IP_KEYS } from "../src/profile.js";
import { consoleWrite, shQuote } from "../src/console.js";

test("planProvisioning: sadece farkli anahtarlari degisecek isaretler", () => {
  const mevcut = { wl0_net_mode: "mixed", m1s1wanapn: "internet", lan_ipaddr: "192.168.1.1" };
  const profile = { nvram: { wl0_net_mode: "disabled", m1s1wanapn: "internet", lan_ipaddr: "5.5.5.1" } };
  const p = planProvisioning(mevcut, profile);
  assert.deepEqual(Object.keys(p.willChange).sort(), ["lan_ipaddr", "wl0_net_mode"]);
  assert.equal(p.willChange.wl0_net_mode.target, "disabled");
  assert.deepEqual(p.ayni, ["m1s1wanapn"]);
});

test("planProvisioning: IDEMPOTENT — istenen durumda hicbir sey degismez", () => {
  const mevcut = { wl0_net_mode: "disabled", m1s1wanapn: "internet", lan_ipaddr: "5.5.5.1" };
  const profile = { nvram: { wl0_net_mode: "disabled", m1s1wanapn: "internet", lan_ipaddr: "5.5.5.1" } };
  const p = planProvisioning(mevcut, profile);
  assert.equal(Object.keys(p.willChange).length, 0);
  assert.equal(p.ayni.length, 3);
});

test("planProvisioning: cihazda olmayan anahtar eksik listesine girer", () => {
  const p = planProvisioning({}, { nvram: { yeni_anahtar: "1" } });
  assert.deepEqual(p.missing, ["yeni_anahtar"]);
  assert.equal(p.willChange.yeni_anahtar.mevcut, null);
});

test("groupPlan: yazma sirasi Modem/WAN -> LAN, LAN EN SONDA", () => {
  const willChange = {
    lan_ipaddr: { mevcut: "192.168.1.1", target: "5.5.5.1" },
    wl0_net_mode: { mevcut: "ap", target: "disabled" },
    w1_wan_proto: { mevcut: "m13gdhcp", target: "m13g" },
    lan_netmask_ex1: { mevcut: "255.255.255.0", target: "0.0.0.0" },
  };
  const groups = groupPlan(willChange);
  assert.deepEqual(groups.map((g) => g.name), ["Modem/WAN", "LAN"]);
  const lan = groups[groups.length - 1];
  const lanAnahtar = Object.keys(lan.pairs);
  assert.equal(lanAnahtar[lanAnahtar.length - 1], "lan_ipaddr",
    "yonetim adresi tum yazmanin EN SONU");
});

test("groupPlan: bilinmeyen anahtar Diger grubuna duser ve LANdan ONCE yazilir", () => {
  const groups = groupPlan({
    lan_ipaddr: { mevcut: "a", target: "b" },
    bilinmeyen_ayar: { mevcut: "1", target: "2" },
  });
  assert.deepEqual(groups.map((g) => g.name), ["Diger", "LAN"]);
});

test("groupPlan: bos plan -> bos grup listesi", () => {
  assert.deepEqual(groupPlan({}), []);
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
  assert.equal(r.problems[0].code, "AUTH_REQUIRED");
});

test("shQuote: tek tirnaklari guvenli kacirir (komut enjeksiyonu yok)", () => {
  assert.equal(shQuote("internet"), "'internet'");
  assert.equal(shQuote("a'b"), "'a'\\''b'");
});

test("consoleWrite: bos cift kumesi -> yazma yok, ok", async () => {
  const r = await consoleWrite({ host: "127.0.0.1", username: "a", password: "b" }, {});
  assert.equal(r.ok, true);
  assert.equal(r.writtenKeys.length, 0);
});

test("FACTORY_PROFILE: saklanan SIM PIN'ini SILER (yeni SIM'in haklarini yakmasin)", () => {
  // Modem sakladigi PIN'i her acilista SIM'e gonderiyor. Fabrikaya donen bir
  // modemde eski PIN kalirsa, takilan YENI PIN'li SIM'in denemeleri yanar.
  assert.equal(FACTORY_PROFILE.nvram.m1s1simpin, "",
    "fabrika profili PIN alanini bosaltmali");
  assert.equal(FIELD_PROFILE.nvram.m1s1simpin, undefined,
    "saha profilinde PIN SABIT DEGIL — calisma aninda, yalnizca kilit varsa eklenir");
});

test("FACTORY_PROFILE: cihaz adini da default'a alir", () => {
  assert.equal(FACTORY_PROFILE.nvram.router_name, "Industrial Cellular Router");
});
