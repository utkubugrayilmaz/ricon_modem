// Ag hazirligi (scripts/network-prep.js) — cihaz da makine de GEREKMEZ.
//
// Karar mantigi ("hangi IP'ler eklenmeli") eskiden prepare-modem-network.ps1
// icinde gomuluydu ve HIC test edilemiyordu; JS'e tasininca saf fonksiyon
// oldu. Orkestrasyon (prepareNetwork) da sahte `ops` ile kosuyor: adaptore
// tek dokunus yok, tum platform ilkelleri kayit altina alinan taklitler.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDesiredAddresses, findFreeSecondaryIp, maskFromPrefix, prepareNetwork,
  detectAdapter,
} from "../scripts/network-prep.js";

// ----------------------------------------------------------------------
// Saf fonksiyonlar
// ----------------------------------------------------------------------

test("maskFromPrefix: yaygin onekler dogru maskeye cevriliyor", () => {
  assert.equal(maskFromPrefix(24), "255.255.255.0");
  assert.equal(maskFromPrefix(16), "255.255.0.0");
  assert.equal(maskFromPrefix(8), "255.0.0.0");
  assert.equal(maskFromPrefix(32), "255.255.255.255");
});

test("findFreeSecondaryIp: .100'den baslar, modemi ve dolulari atlar", () => {
  assert.equal(findFreeSecondaryIp("192.168.3.", "192.168.3.1", []), "192.168.3.100");
  // Modemin KENDISI .100'de olabilir (sahada gorulen bir dizilim) — atlanir.
  assert.equal(findFreeSecondaryIp("192.168.3.", "192.168.3.100", []), "192.168.3.101");
  assert.equal(
    findFreeSecondaryIp("192.168.3.", "192.168.3.1", ["192.168.3.100", "192.168.3.101"]),
    "192.168.3.102",
  );
});

test("findFreeSecondaryIp: aralik tukenirse acikca durur", () => {
  const taken = [];
  for (let i = 100; i <= 250; i += 1) taken.push(`10.0.0.${i}`);
  assert.throws(() => findFreeSecondaryIp("10.0.0.", "10.0.0.1", taken),
    /could not find a free secondary IP/);
});

test("computeDesiredAddresses: kira geldiyse yedek + alt ag ikincili + saha ikincili", () => {
  const desired = computeDesiredAddresses({
    backup: [{ ip: "10.0.0.5", prefixLength: 24 }],
    discoveredIp: "192.168.3.1",
  });
  assert.deepEqual(desired, [
    { ip: "10.0.0.5", prefixLength: 24, isNew: false },
    { ip: "192.168.3.100", prefixLength: 24, isNew: true },
    { ip: "5.5.5.100", prefixLength: 24, isNew: true },
  ]);
});

test("computeDesiredAddresses: kira YOKSA fabrika yedegi 192.168.1.100 da eklenir", () => {
  const desired = computeDesiredAddresses({ backup: [], discoveredIp: null });
  assert.deepEqual(desired.map((d) => d.ip), ["5.5.5.100", "192.168.1.100"]);
  assert.ok(desired.every((d) => d.isNew));
});

test("computeDesiredAddresses: yedekte zaten olan alanlar IKINCI kez eklenmez", () => {
  // Alt agda yedekten gelen bir ikincil VARSA yenisi uretilmez; saha
  // ikincili de yedekteyse tekrar eklenmez (idempotent ust uste kosu).
  const desired = computeDesiredAddresses({
    backup: [
      { ip: "192.168.3.50", prefixLength: 24 },
      { ip: "5.5.5.100", prefixLength: 24 },
    ],
    discoveredIp: "192.168.3.1",
  });
  assert.deepEqual(desired.map((d) => d.ip), ["192.168.3.50", "5.5.5.100"]);
  assert.ok(desired.every((d) => !d.isNew));
});

test("computeDesiredAddresses: modemin kendi IP'si alt ag ikincili SAYILMAZ", () => {
  // Yedekte modemin adresi durabilir (onceki kosudan). O bir "bizim ikincil"
  // degil — alt aga yine de yeni bir ikincil uretilmeli.
  const desired = computeDesiredAddresses({
    backup: [{ ip: "192.168.3.1", prefixLength: 24 }],
    discoveredIp: "192.168.3.1",
  });
  assert.ok(desired.some((d) => d.ip === "192.168.3.100" && d.isNew));
});

// ----------------------------------------------------------------------
// Orkestrasyon — sahte ops ile
// ----------------------------------------------------------------------

// Kayit tutan taklit ilkeller. `addresses` canli adres listesini taklit eder;
// setStatic/addIp onu gunceller ki idempotency gercekci sinansin.
function fakeOps({ addresses = [], gateway = null, elevated = true,
  adapterOk = true, failOnAdd = null, adapters = ["Ethernet"] } = {}) {
  let current = addresses.map((a) => ({ ...a }));
  const calls = [];
  return {
    calls,
    current: () => current,
    isElevated: () => elevated,
    adapterExists: (name) => adapterOk && adapters.includes(name),
    listAdapters: () => adapters,
    listIpv4: () => current.map((a) => ({ ...a })),
    switchToDhcp: (adapter) => { calls.push(["dhcp", adapter]); return ""; },
    readGateway: () => gateway,
    setStatic: (adapter, ip, prefixLength) => {
      calls.push(["static", ip]);
      current = [{ ip, prefixLength, origin: "manual" }];
    },
    addIp: (adapter, ip, prefixLength, { skipAsSource = false } = {}) => {
      calls.push(["add", ip, skipAsSource]);
      if (failOnAdd === ip) throw new Error(`add ${ip} refused (test)`);
      if (current.some((c) => c.ip === ip)) return "exists";
      current.push({ ip, prefixLength, origin: "manual" });
      return "added";
    },
  };
}

test("prepareNetwork: yukselme yoksa NOT_ELEVATED, adaptor yoksa ADAPTER_NOT_FOUND", async () => {
  const r1 = await prepareNetwork({ adapter: "eth0", ops: fakeOps({ elevated: false }) });
  assert.equal(r1.ok, false);
  assert.equal(r1.reason, "NOT_ELEVATED");

  const r2 = await prepareNetwork({ adapter: "yok", ops: fakeOps({ adapterOk: false }) });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, "ADAPTER_NOT_FOUND");
});

test("ADAPTER_NOT_FOUND mesaji MEVCUT adaptorleri sayar (tahmin biter, secim baslar)", async () => {
  const ops = fakeOps({ adapters: ["enp3s0", "wlan0"] });
  const r = await prepareNetwork({ adapter: "eth0", ops });
  assert.equal(r.reason, "ADAPTER_NOT_FOUND");
  assert.match(r.message, /enp3s0, wlan0/);
});

test("detectAdapter: kablolu gorunumlu ad (en*/eth*) oncelikli, yoksa ilk arayuz", () => {
  assert.equal(detectAdapter(fakeOps({ adapters: ["wlan0", "enp3s0"] })), "enp3s0");
  assert.equal(detectAdapter(fakeOps({ adapters: ["Ethernet", "Wi-Fi"] })), "Ethernet");
  assert.equal(detectAdapter(fakeOps({ adapters: ["wlan0"] })), "wlan0");
  assert.equal(detectAdapter(fakeOps({ adapters: [] })), null);
});

test("prepareNetwork: adaptor VERILMEDIYSE otomatik secilir ve akis calisir", async () => {
  // Linux ilk canli denemesinin senaryosu: makinede eth0 YOK, enp3s0 var.
  const ops = fakeOps({ adapters: ["enp3s0"], gateway: "192.168.3.1" });
  const r = await prepareNetwork({ dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, true);
  assert.equal(r.adapter, "enp3s0");
  assert.equal(r.discoveredHost, "192.168.3.1");
});

test("prepareNetwork hizli yol: knownHost verilince DHCP'ye HIC gecilmez", async () => {
  const ops = fakeOps({ addresses: [] });
  const r = await prepareNetwork({ adapter: "Ethernet", knownHost: "192.168.1.1", ops });
  assert.equal(r.ok, true);
  assert.equal(r.directHit, true);
  assert.equal(r.discoveredHost, "192.168.1.1");
  // dhcp/static cagrisi YOK; yalniz iki ikincil eklendi, ikisi de SkipAsSource.
  assert.ok(!ops.calls.some(([kind]) => kind === "dhcp" || kind === "static"));
  assert.deepEqual(r.secondariesAdded, ["192.168.1.100", "5.5.5.100"]);
  assert.ok(ops.calls.filter(([kind]) => kind === "add").every(([, , skip]) => skip === true));
});

test("prepareNetwork hizli yol: modem zaten 5.5.5.x'teyse saha ikincili tekrarlanmaz", async () => {
  const ops = fakeOps({ addresses: [] });
  const r = await prepareNetwork({ adapter: "Ethernet", knownHost: "5.5.5.1", ops });
  assert.equal(r.ok, true);
  // Alt ag ikincili 5.5.5.100 zaten eklendi; ikinci bir 5.5.5.100 denemesi yok.
  assert.deepEqual(r.secondariesAdded, ["5.5.5.100"]);
});

test("prepareNetwork hizli yol: alt agda ikincil ZATEN varsa dokunulmaz", async () => {
  const ops = fakeOps({ addresses: [{ ip: "192.168.1.77", prefixLength: 24, origin: "manual" }] });
  const r = await prepareNetwork({ adapter: "Ethernet", knownHost: "192.168.1.1", ops });
  assert.equal(r.ok, true);
  assert.deepEqual(r.secondariesAdded, ["5.5.5.100"]);
  assert.ok(r.warnings.some((w) => w.includes("192.168.1.77")));
});

test("prepareNetwork tam yol: kira geldi — yedek korunur, ikinciller eklenir", async () => {
  const ops = fakeOps({
    addresses: [
      { ip: "10.0.0.5", prefixLength: 24, origin: "manual" },
      { ip: "172.16.0.9", prefixLength: 16, origin: "dhcp" },   // kira: yedeklenmez
    ],
    gateway: "192.168.3.1",
  });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, true);
  assert.equal(r.leaseAcquired, true);
  assert.equal(r.discoveredHost, "192.168.3.1");
  assert.equal(r.fallbackUsed, false);
  // Yedege yalniz MANUAL girdi girdi; DHCP kirasi disarida kaldi.
  assert.deepEqual(r.restoredAddresses, [{ ip: "10.0.0.5", prefixLength: 24 }]);
  // Birincil = yedegin ilki (statige donus onunla yapilir); yeniler ardindan.
  assert.deepEqual(ops.calls.find(([kind]) => kind === "static"), ["static", "10.0.0.5"]);
  assert.deepEqual(r.secondariesAdded, ["192.168.3.100", "5.5.5.100"]);
});

test("prepareNetwork tam yol: kira gelmedi — bilinen gelenek yedekleri", async () => {
  const ops = fakeOps({ addresses: [], gateway: null });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 0, ops });
  assert.equal(r.ok, true);
  assert.equal(r.leaseAcquired, false);
  assert.equal(r.fallbackUsed, true);
  assert.equal(r.discoveredHost, null);
  // Yedek bos: birincil 5.5.5.100 olur, fabrika yedegi ikincil gelir.
  assert.deepEqual(ops.calls.find(([kind]) => kind === "static"), ["static", "5.5.5.100"]);
  assert.deepEqual(r.secondariesAdded, ["5.5.5.100", "192.168.1.100"]);
});

test("prepareNetwork tam yol: APIPA (169.254.*) gercek kira SAYILMAZ", async () => {
  const ops = fakeOps({ addresses: [], gateway: "169.254.7.7" });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 0.6, ops });
  assert.equal(r.ok, true);
  assert.equal(r.leaseAcquired, false);
});

test("prepareNetwork: uygulama yarida kirilirsa yedek GERI yuklenir", async () => {
  const ops = fakeOps({
    addresses: [
      { ip: "10.0.0.5", prefixLength: 24, origin: "manual" },
      { ip: "10.0.0.6", prefixLength: 24, origin: "manual" },
    ],
    gateway: "192.168.3.1",
    failOnAdd: "5.5.5.100",   // ikinciller yazilirken patlasin
  });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "NETWORK_PREP_FAILED");
  assert.equal(r.recoveryAttempted, true);
  assert.deepEqual(r.restoredAddresses,
    [{ ip: "10.0.0.5", prefixLength: 24 }, { ip: "10.0.0.6", prefixLength: 24 }]);
  // Kurtarma statige YEDEGIN ilkiyle dondu (ikinci "static" cagrisi).
  const statics = ops.calls.filter(([kind]) => kind === "static");
  assert.equal(statics.length, 2);
  assert.deepEqual(statics[1], ["static", "10.0.0.5"]);
  // Kurtarma sonrasi canli adresler = yedegin tamami.
  assert.deepEqual(ops.current().map((a) => a.ip), ["10.0.0.5", "10.0.0.6"]);
});

test("prepareNetwork: ust uste kosu idempotent — ikinci tur YENI adres uretmez", async () => {
  const ops = fakeOps({ addresses: [], gateway: "192.168.3.1" });
  const first = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(first.ok, true);
  assert.deepEqual(first.secondariesAdded, ["192.168.3.100", "5.5.5.100"]);
  // Ikinci kosu: ilkinin ekledigi adresler artik yedekte — hepsi "geri
  // yukleme" sayilir, YENI ikincil uretilmez ve sonuc yine ok'tur.
  const second = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(second.ok, true);
  assert.deepEqual(second.secondariesAdded, []);
  assert.deepEqual(second.restoredAddresses.map((a) => a.ip),
    ["192.168.3.100", "5.5.5.100"]);
});
