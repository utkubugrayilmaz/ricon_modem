// ddwrt + nvram ayristirici testleri.
// Fixture'lar SIRLARI TEMIZLENMIS ornekler (sahte kimlik/hash), ama biçim
// gercek cihazdan birebir (format-dogru). Gercek yakalamalar git disinda
// (data/gercek-yakalamalar). Cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ciftleriAyikla, iccidTemizle, operatorTahmin, simGorunumu,
} from "../src/ddwrt.js";
import { nvramAyikla, nvramFark } from "../src/nvram.js";

const fx = (ad) => fileURLToPath(new URL(`./fixtures/${ad}`, import.meta.url));
const oku = (ad) => readFileSync(fx(ad), "latin1");

test("ciftleriAyikla: sistem canli ucundaki alanlari cikarir", () => {
  const c = ciftleriAyikla(oku("info_live.sample"));
  assert.equal(c.lan_ip, "192.168.1.1");
  assert.equal(c.lan_mac, "00:11:22:33:44:55");
  assert.ok(c.uptime_spe.includes("load average"));
});

test("ciftleriAyikla: HTML tasiyan alanlardaki etiketleri temizler", () => {
  const c = ciftleriAyikla(oku("internet_live.sample"));
  // m1signal HTML tablo tasir; etiketler atilmali, icinde < kalmamali
  assert.ok(!(c.m1signal || "").includes("<"));
  assert.equal(c.m1imei, "860000000000000");
});

test("ciftleriAyikla: __proto__ alani prototipi kirletmez", () => {
  const c = ciftleriAyikla("{__proto__::kotu}{x::1}");
  assert.equal(c.x, "1");
  assert.equal(({}).kotu, undefined); // prototip bozulmadi
});

test("iccidTemizle: sondaki F dolgusu atilir", () => {
  assert.equal(iccidTemizle("8990010000000009999F"), "8990010000000009999");
  assert.equal(iccidTemizle("8990010000000009999"), "8990010000000009999");
  assert.equal(iccidTemizle(""), null);
});

test("operatorTahmin: IMSI onekinden operator", () => {
  assert.equal(operatorTahmin("28601123456789"), "Turkcell");
  assert.equal(operatorTahmin("28602000000000"), "Vodafone");
  assert.equal(operatorTahmin("999"), null);
});

test("simGorunumu: ham alanlar okunabilir gorunume eslenir", () => {
  const ham = ciftleriAyikla(oku("internet_live.sample"));
  const { sim1 } = simGorunumu(ham);
  assert.equal(sim1.imei, "860000000000000");
  assert.equal(sim1.sebeke_tipi, "FDD LTE");
  // ICCID sonundaki F temizlenmeli, IMSI'den operator turemeli
  assert.equal(sim1.iccid_temiz, "8991000000000000000");
});

test("nvramAyikla: yedegi anahtar/deger olarak cozer (gercek format basligi)", () => {
  const buf = readFileSync(fx("nvram.sample.bin"));
  const { degerler, sayi, problems } = nvramAyikla(buf);
  assert.equal(problems.length, 0);
  assert.ok(sayi >= 10, `beklenen >=10 anahtar, gelen ${sayi}`);
  assert.equal(degerler.et0macaddr, "00:11:22:33:44:55");
  assert.equal(degerler.snmpd_rocommunity, "public");
  assert.equal(degerler.telnet_lanport, "5123");
});

test("nvramAyikla: bozuk basluk NVRAM_BAD_HEADER verir, throw etmez", () => {
  const { problems, sayi } = nvramAyikla(Buffer.from("COPUK123"));
  assert.equal(sayi, 0);
  assert.equal(problems[0].kod, "NVRAM_BAD_HEADER");
});

test("nvramFark: degisen/eklenen/silinen ayrimi", () => {
  const f = nvramFark(
    { a: "1", b: "2", c: "3" },
    { a: "1", b: "X", d: "4" },
  );
  // nvramFark null-prototip nesne doner (prototip guvenligi); icerik kontrol.
  assert.deepEqual({ ...f.degisen.b }, { eski: "2", yeni: "X" });
  assert.equal(f.eklenen.d, "4");
  assert.equal(f.silinen.c, "3");
  assert.equal(Object.keys(f.degisen).length, 1);
});
