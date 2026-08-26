// Provizyon motoru testleri — planlama saf/idempotent mantik + dry-run.
// Cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { provizyonPlanla, planiAyir, provizyonUygula } from "../src/provizyon.js";
import { SAHA_PROFILI, LAN_IP_ANAHTARLARI } from "../src/profil.js";
import { konsolYaz, shKacis } from "../src/konsol.js";

test("provizyonPlanla: sadece farkli anahtarlari degisecek isaretler", () => {
  const mevcut = { wl0_net_mode: "mixed", m1s1wanapn: "internet", lan_ipaddr: "192.168.1.1" };
  const profil = { nvram: { wl0_net_mode: "disabled", m1s1wanapn: "internet", lan_ipaddr: "5.5.5.1" } };
  const p = provizyonPlanla(mevcut, profil);
  assert.deepEqual(Object.keys(p.degisecek).sort(), ["lan_ipaddr", "wl0_net_mode"]);
  assert.equal(p.degisecek.wl0_net_mode.hedef, "disabled");
  assert.deepEqual(p.ayni, ["m1s1wanapn"]);
});

test("provizyonPlanla: IDEMPOTENT — istenen durumda hicbir sey degismez", () => {
  const mevcut = { wl0_net_mode: "disabled", m1s1wanapn: "internet", lan_ipaddr: "5.5.5.1" };
  const profil = { nvram: { wl0_net_mode: "disabled", m1s1wanapn: "internet", lan_ipaddr: "5.5.5.1" } };
  const p = provizyonPlanla(mevcut, profil);
  assert.equal(Object.keys(p.degisecek).length, 0);
  assert.equal(p.ayni.length, 3);
});

test("provizyonPlanla: cihazda olmayan anahtar eksik listesine girer", () => {
  const p = provizyonPlanla({}, { nvram: { yeni_anahtar: "1" } });
  assert.deepEqual(p.eksik, ["yeni_anahtar"]);
  assert.equal(p.degisecek.yeni_anahtar.mevcut, null);
});

test("planiAyir: LAN IP anahtarlarini ayirir (en sona yazilir)", () => {
  const degisecek = {
    lan_ipaddr: { mevcut: "192.168.1.1", hedef: "5.5.5.1" },
    wl0_net_mode: { mevcut: "mixed", hedef: "disabled" },
  };
  const { lanIp, digerleri } = planiAyir(degisecek);
  assert.ok("lan_ipaddr" in lanIp);
  assert.ok("wl0_net_mode" in digerleri);
  assert.ok(!("lan_ipaddr" in digerleri));
});

test("SAHA_PROFILI: doğrulanmis anahtarlari tasir, hedefler string", () => {
  assert.equal(SAHA_PROFILI.nvram.wl0_net_mode, "disabled");
  assert.equal(SAHA_PROFILI.nvram.lan_ipaddr, "5.5.5.1");
  assert.equal(SAHA_PROFILI.nvram.m1s1wanapn, "internet");
  assert.ok(LAN_IP_ANAHTARLARI.includes("lan_ipaddr"));
});

test("provizyonUygula: kimliksiz AUTH_REQUIRED (cihaza gitmez)", async () => {
  const r = await provizyonUygula({ host: "127.0.0.1", kimlik: null }, SAHA_PROFILI);
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].kod, "AUTH_REQUIRED");
});

test("shKacis: tek tirnaklari guvenli kacirir (komut enjeksiyonu yok)", () => {
  assert.equal(shKacis("internet"), "'internet'");
  assert.equal(shKacis("a'b"), "'a'\\''b'");
});

test("konsolYaz: bos cift kumesi -> yazma yok, ok", async () => {
  const r = await konsolYaz({ host: "127.0.0.1", kullanici: "a", sifre: "b" }, {});
  assert.equal(r.ok, true);
  assert.equal(r.yazilan.length, 0);
});
