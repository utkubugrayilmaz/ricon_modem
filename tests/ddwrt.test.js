// ddwrt + nvram ayristirici testleri.
// Fixture'lar SIRLARI TEMIZLENMIS ornekler (sahte kimlik/hash), ama biçim
// gercek cihazdan birebir (format-dogru). Gercek yakalamalar git disinda
// (data/gercek-yakalamalar). Cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parsePairs, cleanIccid, guessOperator, simView,
} from "../src/ddwrt.js";
import { parseNvram, diffNvram } from "../src/nvram.js";

const fx = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const oku = (name) => readFileSync(fx(name), "latin1");

test("parsePairs: sistem canli ucundaki alanlari cikarir", () => {
  const c = parsePairs(oku("info_live.sample"));
  assert.equal(c.lan_ip, "192.168.1.1");
  assert.equal(c.lan_mac, "00:11:22:33:44:55");  // CIHAZIN anahtari, cevrilmez
  assert.ok(c.uptime_spe.includes("load average"));
});

test("parsePairs: HTML tasiyan alanlardaki etiketleri temizler", () => {
  const c = parsePairs(oku("internet_live.sample"));
  // m1signal HTML tablo tasir; etiketler atilmali, icinde < kalmamali
  assert.ok(!(c.m1signal || "").includes("<"));
  assert.equal(c.m1imei, "860000000000000");
});

test("parsePairs: __proto__ alani prototipi kirletmez", () => {
  const c = parsePairs("{__proto__::kotu}{x::1}");
  assert.equal(c.x, "1");
  assert.equal(({}).kotu, undefined); // prototip bozulmadi
});

test("cleanIccid: sondaki F dolgusu atilir", () => {
  assert.equal(cleanIccid("8990010000000009999F"), "8990010000000009999");
  assert.equal(cleanIccid("8990010000000009999"), "8990010000000009999");
  assert.equal(cleanIccid(""), null);
});

test("guessOperator: IMSI onekinden operator", () => {
  assert.equal(guessOperator("28601123456789"), "Turkcell");
  assert.equal(guessOperator("28602000000000"), "Vodafone");
  assert.equal(guessOperator("999"), null);
});

test("simView: ham alanlar okunabilir gorunume eslenir", () => {
  const raw = parsePairs(oku("internet_live.sample"));
  const { sim1 } = simView(raw);
  assert.equal(sim1.imei, "860000000000000");
  assert.equal(sim1.networkType, "FDD LTE");
  // ICCID sonundaki F temizlenmeli, IMSI'den operator turemeli
  assert.equal(sim1.iccidClean, "8991000000000000000");
});

test("parseNvram: yedegi anahtar/deger olarak cozer (gercek format basligi)", () => {
  const buf = readFileSync(fx("nvram.sample.bin"));
  const { values, count, problems } = parseNvram(buf);
  assert.equal(problems.length, 0);
  assert.ok(count >= 10, `beklenen >=10 anahtar, gelen ${count}`);
  assert.equal(values.et0macaddr, "00:11:22:33:44:55");
  assert.equal(values.snmpd_rocommunity, "public");
  assert.equal(values.telnet_lanport, "5123");
});

test("parseNvram: bozuk basluk NVRAM_BAD_HEADER verir, throw etmez", () => {
  const { problems, count } = parseNvram(Buffer.from("COPUK123"));
  assert.equal(count, 0);
  assert.equal(problems[0].code, "NVRAM_BAD_HEADER");
});

test("diffNvram: degisen/eklenen/silinen ayrimi", () => {
  const f = diffNvram(
    { a: "1", b: "2", c: "3" },
    { a: "1", b: "X", d: "4" },
  );
  // diffNvram null-prototip nesne doner (prototip guvenligi); icerik kontrol.
  assert.deepEqual({ ...f.changed.b }, { previous: "2", next: "X" });
  assert.equal(f.eklenen.d, "4");
  assert.equal(f.silinen.c, "3");
  assert.equal(Object.keys(f.changed).length, 1);
});
