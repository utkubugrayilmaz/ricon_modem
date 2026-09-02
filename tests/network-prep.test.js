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
  detectAdapter, pickLeaseGateway, prefixFromMask, parseDhcp4Options,
  leaseFromDhcp4Options, leaseHostCandidates, isFreshLease, probeHosts,
  needsElevation,
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
//
// `lease` / `staleLease`: DHCP'ye gectikten SONRA ve ONCE gorunen kira.
// Onceki taklit tek bir gateway STRING'i donduruyordu ve gercek kusur tam o
// bosluga sigindi: route BOSKEN kira VARDI. Kirayi nesne olarak modelleyince
// "kanit hangi kaynaktan geldi" sorusu da test edilebilir hale geliyor.
function fakeOps({ addresses = [], lease = null, staleLease = null,
  elevated = true, adapterOk = true, failOnAdd = null, failReason = null,
  nmManaged = true, profileAddresses = null,
  adapters = ["Ethernet"] } = {}) {
  let current = addresses.map((a) => ({ ...a }));
  let profile = profileAddresses === null
    ? addresses.map((a) => `${a.ip}/${a.prefixLength}`)
    : [...profileAddresses];
  let switched = false;
  const calls = [];
  return {
    calls,
    current: () => current,
    profile: () => profile,
    isElevated: () => elevated,
    requiresElevation: () => !nmManaged,
    adapterExists: (name) => adapterOk && adapters.includes(name),
    listAdapters: () => adapters,
    listIpv4: () => current.map((a) => ({ ...a })),
    switchToDhcp: (adapter) => { calls.push(["dhcp", adapter]); switched = true; return ""; },
    readLease: () => (switched ? lease : staleLease),
    setStatic: (adapter, ip, prefixLength, { gateway = null } = {}) => {
      calls.push(["static", ip, gateway]);
      // Statige donen adaptorde DHCP kirasi da onun route'u da KALMAZ; ust
      // uste kosuda ikinci tur yine `staleLease` ile baslar.
      switched = false;
      current = [{ ip, prefixLength, origin: "manual" }];
    },
    addIp: (adapter, ip, prefixLength, { skipAsSource = false } = {}) => {
      calls.push(["add", ip, skipAsSource]);
      if (failOnAdd === ip) {
        const e = new Error(`add ${ip} refused (test)`);
        if (failReason) e.reason = failReason;
        throw e;
      }
      if (current.some((c) => c.ip === ip)) return "exists";
      current.push({ ip, prefixLength, origin: "manual" });
      return "added";
    },
    persistAddresses: (adapter, list) => {
      calls.push(["persist", list.map((a) => a.ip).join(",")]);
      if (!nmManaged) {
        return { persisted: false, target: null, added: [],
          reason: "no NetworkManager profile (addresses are not persistent)" };
      }
      const added = [];
      for (const { ip, prefixLength } of list) {
        if (profile.some((e) => e.split("/")[0] === ip)) continue;
        profile.push(`${ip}/${prefixLength}`);
        added.push(`${ip}/${prefixLength}`);
      }
      return { persisted: true, target: "TestProfile", added, total: profile.length };
    },
  };
}

// Route KAYNAKLI kira — eski `gateway`/`staleGateway` testlerinin karsiligi.
// pickLeaseGateway'in ayikladigi ucuncu (en zayif) kanit budur.
const routeLease = (gateway) => (gateway
  ? { address: null, prefixLength: null, gateway, server: null, source: "route" }
  : null);

test("prepareNetwork: yukselme yoksa NOT_ELEVATED, adaptor yoksa ADAPTER_NOT_FOUND", async () => {
  // Adaptor ADI GECERLI olmali: "root sart mi" sorusunun cevabi adaptoru
  // kimin yonettigine bagli, o yuzden kapi adaptor cozuldukten SONRA.
  const r1 = await prepareNetwork({ adapter: "Ethernet",
    ops: fakeOps({ elevated: false, nmManaged: false }) });
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
  const ops = fakeOps({ adapters: ["enp3s0"], lease: routeLease("192.168.3.1") });
  const r = await prepareNetwork({ dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, true);
  assert.equal(r.adapter, "enp3s0");
  assert.equal(r.discoveredHost, "192.168.3.1");
});

// ----------------------------------------------------------------------
// Kira mi, makinenin kendi gateway'i mi? (2026-09-02 canli kusur)
// ----------------------------------------------------------------------

test("pickLeaseGateway: `proto static` default route KIRA SAYILMAZ", () => {
  // Gercek olcum: NM profili ipv4.method=manual + ipv4.gateway=7.7.7.1 olan
  // bir makinede `ip -j route show default dev enp12s0` tam bunu donuyordu.
  assert.equal(pickLeaseGateway(
    [{ dst: "default", gateway: "7.7.7.1", protocol: "static", metric: 20100 }]), null);
  // NM'in kiradan gelen route'u: kabul.
  assert.equal(pickLeaseGateway(
    [{ dst: "default", gateway: "192.168.1.1", protocol: "dhcp" }]), "192.168.1.1");
  // Klasik dhclient `proto boot` yazar: kabul.
  assert.equal(pickLeaseGateway(
    [{ dst: "default", gateway: "192.168.8.1", protocol: "boot" }]), "192.168.8.1");
  // Ikisi bir arada: statik olan atlanir, kira secilir.
  assert.equal(pickLeaseGateway([
    { dst: "default", gateway: "7.7.7.1", protocol: "static" },
    { dst: "default", gateway: "192.168.1.1", protocol: "dhcp" },
  ]), "192.168.1.1");
  assert.equal(pickLeaseGateway([]), null);
  assert.equal(pickLeaseGateway(), null);
});

test("prepareNetwork: ONCEDEN duran gateway kira SANILMAZ, DHCP beklenir", async () => {
  // Kusurun tam senaryosu: makinede 7.7.7.77/24 statik + gateway 7.7.7.1.
  // Modem takili degil, kira hic gelmiyor. Eskiden akis 50 ms'de "modem
  // 7.7.7.1'de bulundu" deyip o adrese kitleniyordu; orada cihaz yoktu.
  const ops = fakeOps({
    addresses: [{ ip: "7.7.7.77", prefixLength: 24, origin: "manual" }],
    staleLease: routeLease("7.7.7.1"), lease: routeLease("7.7.7.1"),
  });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 1, ops });
  assert.equal(r.ok, true);
  assert.equal(r.leaseAcquired, false);
  assert.equal(r.discoveredHost, null);
  assert.equal(r.fallbackUsed, true);
  // Eski statik adres geri geldi, saha ikincili + fabrika yedegi eklendi.
  assert.deepEqual(r.restoredAddresses, [{ ip: "7.7.7.77", prefixLength: 24 }]);
  assert.deepEqual(r.secondariesAdded, ["5.5.5.100", "192.168.1.100"]);
});

test("prepareNetwork: eski gateway varken GERCEK kira yine de yakalanir", async () => {
  const ops = fakeOps({
    addresses: [{ ip: "7.7.7.77", prefixLength: 24, origin: "manual" }],
    staleLease: routeLease("7.7.7.1"), lease: routeLease("192.168.1.1"),
  });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, true);
  assert.equal(r.leaseAcquired, true);
  assert.equal(r.discoveredHost, "192.168.1.1");
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
    lease: routeLease("192.168.3.1"),
  });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, true);
  assert.equal(r.leaseAcquired, true);
  assert.equal(r.discoveredHost, "192.168.3.1");
  assert.equal(r.fallbackUsed, false);
  // Yedege yalniz MANUAL girdi girdi; DHCP kirasi disarida kaldi.
  assert.deepEqual(r.restoredAddresses, [{ ip: "10.0.0.5", prefixLength: 24 }]);
  // Birincil = yedegin ilki (statige donus onunla yapilir); yeniler ardindan.
  assert.equal(ops.calls.find(([kind]) => kind === "static")?.[1], "10.0.0.5");
  assert.deepEqual(r.secondariesAdded, ["192.168.3.100", "5.5.5.100"]);
});

test("prepareNetwork tam yol: kira gelmedi — bilinen gelenek yedekleri", async () => {
  const ops = fakeOps({ addresses: [], lease: null });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 0, ops });
  assert.equal(r.ok, true);
  assert.equal(r.leaseAcquired, false);
  assert.equal(r.fallbackUsed, true);
  assert.equal(r.discoveredHost, null);
  // Yedek bos: birincil 5.5.5.100 olur, fabrika yedegi ikincil gelir.
  assert.equal(ops.calls.find(([kind]) => kind === "static")?.[1], "5.5.5.100");
  assert.deepEqual(r.secondariesAdded, ["5.5.5.100", "192.168.1.100"]);
});

test("prepareNetwork tam yol: APIPA (169.254.*) gercek kira SAYILMAZ", async () => {
  const ops = fakeOps({ addresses: [], lease: routeLease("169.254.7.7") });
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
    lease: routeLease("192.168.3.1"),
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
  assert.equal(statics[1][1], "10.0.0.5");
  // Kurtarma sonrasi canli adresler = yedegin tamami.
  assert.deepEqual(ops.current().map((a) => a.ip), ["10.0.0.5", "10.0.0.6"]);
});

test("prepareNetwork: ust uste kosu idempotent — ikinci tur YENI adres uretmez", async () => {
  const ops = fakeOps({ addresses: [], lease: routeLease("192.168.3.1") });
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

// ----------------------------------------------------------------------
// Kirayi ROUTE'tan degil KIRADAN okumak (2026-09-02 canli kusur)
// ----------------------------------------------------------------------

test("prefixFromMask: maskFromPrefix ile gidis-donus, bozuk maske null", () => {
  for (const len of [8, 16, 24, 25, 30, 32]) {
    assert.equal(prefixFromMask(maskFromPrefix(len)), len, `roundtrip ${len}`);
  }
  // Bitisik OLMAYAN maske gecersizdir — sessizce 24 varsaymak yanlis alt ag
  // uretir, o yuzden acikca null.
  assert.equal(prefixFromMask("255.0.255.0"), null);
  assert.equal(prefixFromMask("255.255.255"), null);
  assert.equal(prefixFromMask("255.255.300.0"), null);
  assert.equal(prefixFromMask(""), null);
  assert.equal(prefixFromMask(undefined), null);
});

test("parseDhcp4Options: CANLI nmcli terse ciktisi dogru ayrisir", () => {
  // Birebir kopya (olculdu 2026-09-02, wlp0s20f3).
  const text = [
    "DHCP4.OPTION[1]:dhcp_lease_time = 86400",
    "DHCP4.OPTION[2]:dhcp_server_identifier = 192.168.2.1",
    "DHCP4.OPTION[3]:domain_name_servers = 8.8.8.8 8.8.4.4",
    "DHCP4.OPTION[5]:ip_address = 192.168.2.209",
    "DHCP4.OPTION[24]:routers = 192.168.2.1",
    "DHCP4.OPTION[25]:subnet_mask = 255.255.255.0",
  ].join("\n");
  const o = parseDhcp4Options(text);
  assert.equal(o.routers, "192.168.2.1");
  assert.equal(o.ip_address, "192.168.2.209");
  assert.equal(o.subnet_mask, "255.255.255.0");
  assert.equal(o.dhcp_server_identifier, "192.168.2.1");
  // DEGERIN kendisinde bosluk var: bosluktan degil ilk "=" ile bolunmeli.
  assert.equal(o.domain_name_servers, "8.8.8.8 8.8.4.4");

  assert.deepEqual(leaseFromDhcp4Options(o), {
    address: "192.168.2.209", prefixLength: 24, gateway: "192.168.2.1",
    server: "192.168.2.1", source: "dhcp-options",
  });
});

test("parseDhcp4Options: terse KACISI ve bos cikti", () => {
  // nmcli terse modda deger icindeki ":" karakterini "\:" diye kacirir.
  // Kacirilmis ayraci alan ayiraci sanmak satiri YANLIS yerden boler.
  assert.equal(parseDhcp4Options("DHCP4.OPTION[6]:private_224 = 46\\:47\\:54").private_224,
    "46:47:54");
  // NM, DHCP islemi hic olmamis arayuzde bu listeyi BOS dondurur — "bos
  // sozluk = kira yok" guvenilir bir isaret.
  assert.deepEqual(parseDhcp4Options(""), {});
  assert.deepEqual(parseDhcp4Options("garbage without a separator"), {});
  assert.equal(leaseFromDhcp4Options({}), null);
  assert.equal(leaseFromDhcp4Options(), null);
});

test("leaseHostCandidates: routers > server > .1 gelenegi, APIPA elenir", () => {
  assert.deepEqual(leaseHostCandidates(
    { address: "2.2.2.101", gateway: "2.2.2.1", server: "2.2.2.1" }), ["2.2.2.1"]);
  // `routers` HIC gelmeyebilir; kirayi VEREN kutu (secenek 54) zaten modemdir.
  assert.deepEqual(leaseHostCandidates(
    { address: "2.2.2.101", gateway: null, server: "2.2.2.5" }), ["2.2.2.5", "2.2.2.1"]);
  // Ikisi de yoksa geriye yalniz gelenek kalir — ve o YOKLANARAK dogrulanir.
  assert.deepEqual(leaseHostCandidates({ address: "2.2.2.101" }), ["2.2.2.1"]);
  assert.deepEqual(leaseHostCandidates({ address: "169.254.7.7", gateway: "169.254.1.1" }), []);
  assert.deepEqual(leaseHostCandidates(null), []);
});

test("isFreshLease: DHCP kaniti dogasi geregi taze, route ise karsilastirilir", () => {
  const stale = routeLease("7.7.7.1");
  // Makinenin KENDI gateway'i — kira degil.
  assert.equal(isFreshLease(routeLease("7.7.7.1"), stale), false);
  assert.equal(isFreshLease(routeLease("192.168.1.1"), stale), true);
  // DHCP secenegi/dynamic adres, ESKI goruntuyle AYNI alt agda olsa bile
  // tazedir: makinenin statik yapilandirmasi bu kaniti URETEMEZ.
  assert.equal(isFreshLease(
    { address: "7.7.7.101", gateway: "7.7.7.1", source: "dhcp-options" }, stale), true);
  assert.equal(isFreshLease(null, stale), false);
});

test("prepareNetwork: route BOSKEN kira DHCP secenegiyle GORULUR (canli kusur)", async () => {
  // 2026-09-02 enp12s0'in birebir senaryosu: aktif NM profili
  // `ipv4.ignore-auto-routes = yes` tasiyordu, NM DHCP'nin verdigi default
  // route'u ATTI. Kira 3 saniyede geldi (address=2.2.2.101) ama route tablosu
  // bos kaldi; arac 15 saniye bekleyip "cevap yok" dedi ve modem 2.2.2.1'de
  // dururken 192.168.1.1'e dustu.
  const ops = fakeOps({
    addresses: [{ ip: "7.7.7.77", prefixLength: 24, origin: "manual" }],
    staleLease: routeLease("7.7.7.1"),
    lease: { address: "2.2.2.101", prefixLength: 24, gateway: null,
      server: "2.2.2.1", source: "dhcp-options" },   // routers YOK, server VAR
  });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, true);
  assert.equal(r.leaseAcquired, true);
  assert.equal(r.discoveredHost, "2.2.2.1");            // secenek 54'ten
  assert.equal(r.fallbackUsed, false);
  // KIRALANAN adres korunur: modem onu kendi havuzundan ayirdi, serbest
  // oldugu KANITLI. Uydurma .100 havuzla cakisabilirdi.
  assert.ok(r.secondariesAdded.includes("2.2.2.101"), "kiralanan adres eklenmeli");
  assert.ok(!r.secondariesAdded.includes("2.2.2.100"), "uydurma adres eklenmemeli");
  assert.deepEqual(r.restoredAddresses, [{ ip: "7.7.7.77", prefixLength: 24 }]);
});

test("prepareNetwork: kiranin maskesi kullanilir, /24 VARSAYILMAZ", async () => {
  const ops = fakeOps({
    lease: { address: "10.1.0.50", prefixLength: 16, gateway: "10.1.0.1",
      server: null, source: "dhcp-options" },
  });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.discoveredHost, "10.1.0.1");
  const leased = ops.current().find((a) => a.ip === "10.1.0.50");
  assert.equal(leased?.prefixLength, 16, "kiranin maskesi korunmali");
});

// ----------------------------------------------------------------------
// Kalicilik — kablo cikinca / makine kapanip acilinca adresler durmali
// ----------------------------------------------------------------------

test("prepareNetwork: son adres kumesi PROFILE yazilir (ucucu kalmaz)", async () => {
  // OLCULDU 2026-09-02 10:05:46: kablo cikinca `device modify` ile eklenen
  // TUM adresler silindi, kablo takilinca NM yalnizca kayitli profili geri
  // getirdi. Kalicilik olmadan tak-cikar dongusu ikinci modemde coker.
  const ops = fakeOps({ lease: routeLease("192.168.3.1"), profileAddresses: [] });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.persistence.persisted, true);
  assert.equal(r.persistence.target, "TestProfile");
  assert.deepEqual(ops.profile(), ["192.168.3.100/24", "5.5.5.100/24"]);
  assert.equal(ops.calls.filter(([kind]) => kind === "persist").length, 1,
    "kalici yazma TAM BIR KEZ");
});

test("prepareNetwork: profile yazma IDEMPOTENT — ikinci kosu sismez", async () => {
  const ops = fakeOps({ lease: routeLease("192.168.3.1"), profileAddresses: [] });
  await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  const before = [...ops.profile()];
  const second = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.deepEqual(ops.profile(), before, "profil buyumemeli");
  assert.deepEqual(second.persistence.added, []);
});

test("prepareNetwork: NM yoksa kalicilik YOK ve bu SESSIZ gecmez", async () => {
  const ops = fakeOps({ nmManaged: false, lease: routeLease("192.168.3.1") });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, true);
  assert.equal(r.persistence.persisted, false);
  assert.ok(r.warnings.some((w) => /not persistent/i.test(w)),
    "kalicilik yoksa uyari SART — sessiz kayip en kotusu");
});

test("prepareNetwork: kalicilik patlarsa hazirlik COPE ATILMAZ", async () => {
  // Canli adresler zaten yazildi ve modem su an erisilebilir. Kalicilik bir
  // BONUS; burada patlayip her seyi basarisiz saymak calisan bir isi
  // calismaz yapardi.
  const ops = fakeOps({ lease: routeLease("192.168.3.1") });
  ops.persistAddresses = () => { throw new Error("profile is read-only (test)"); };
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, true);
  assert.equal(r.persistence.persisted, false);
  assert.ok(r.warnings.some((w) => /could not persist/i.test(w)));
});

// ----------------------------------------------------------------------
// Yukselme — NM yonetimindeki arayuzde root GEREKMEZ
// ----------------------------------------------------------------------

test("needsElevation: NM yonetiyorsa HAYIR, yonetmiyorsa EVET", () => {
  // polkit `network-control` icin allow_active=yes veriyor ve dagitimin
  // kurali settings.modify.system'i de `sudo`/`netdev` grubundaki aktif YEREL
  // oturuma aciyor — yani hem kesif hem kalici yazma parolasiz.
  assert.equal(needsElevation("Ethernet", fakeOps({ elevated: false, nmManaged: true })), false);
  assert.equal(needsElevation("Ethernet", fakeOps({ elevated: false, nmManaged: false })), true);
  // Zaten root ise soru bitmistir.
  assert.equal(needsElevation("Ethernet", fakeOps({ elevated: true, nmManaged: false })), false);
});

test("prepareNetwork: NM yonetiminde root OLMADAN calisir", async () => {
  const ops = fakeOps({ elevated: false, nmManaged: true, lease: routeLease("192.168.3.1") });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, true, "NM yonetimindeki arayuzde sudo gereksiz");
  assert.equal(r.discoveredHost, "192.168.3.1");
});

test("prepareNetwork: yetki reddi AYRI kod (NETWORK_PERMISSION_DENIED)", async () => {
  // "IT'ye haber ver" degil "bu makinenin kendi ekraninda calistir" demeyi
  // gerektiren AYRI bir durum: polkit allow_active aktif YEREL oturum ister.
  const ops = fakeOps({ lease: routeLease("192.168.3.1"),
    failOnAdd: "5.5.5.100", failReason: "NETWORK_PERMISSION_DENIED" });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "NETWORK_PERMISSION_DENIED");
});

// ----------------------------------------------------------------------
// Aday adresler — tavuk-yumurta
// ----------------------------------------------------------------------

test("probeHosts: MODEM_HOST once; 0.0.0.0, APIPA ve tekrarlar elenir", () => {
  assert.deepEqual(probeHosts({ modemHost: "10.0.0.1", defaultHost: "192.168.1.1",
    factoryAltHost: "192.168.8.1", fieldHost: "5.5.5.1" }),
    ["10.0.0.1", "192.168.1.1", "192.168.8.1", "5.5.5.1"]);
  // Saha profilinde lan_ipaddr_ex1 "0.0.0.0"dir — aday olamaz.
  assert.deepEqual(probeHosts({ defaultHost: "192.168.1.1", factoryAltHost: "0.0.0.0",
    fieldHost: "192.168.1.1" }), ["192.168.1.1"]);
  assert.deepEqual(probeHosts({ modemHost: "  ", defaultHost: "999.1.1.1" }), []);
  assert.deepEqual(probeHosts({}), []);
});

test("prepareNetwork: hostCandidates verilen HER alt aga kaynak adres eklenir", () => {
  // TAVUK-YUMURTA: 192.168.8.1'i yoklamak icin PC'de 192.168.8.x gerek, ama o
  // adresi eklemek icin "modem orada mi" bilinmeli. Cozum: once adaylarin alt
  // aglarini kapat, SONRA yokla (ikinci gecis network-setup.js'te).
  const desired = computeDesiredAddresses({
    backup: [], discoveredIp: null,
    coverHosts: ["192.168.1.1", "192.168.8.1", "5.5.5.1"],
  });
  assert.deepEqual(desired.map((d) => d.ip),
    ["5.5.5.100", "192.168.1.100", "192.168.8.100"]);
});

test("prepareNetwork: hostCandidates sonuca DOGRULANMAK uzere tasinir", async () => {
  const ops = fakeOps({ lease: routeLease("192.168.3.1") });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops,
    hostCandidates: ["192.168.1.1", "5.5.5.1"] });
  // Kiradan gelen aday ONCE, sabit liste sonra — sira = kanitin gucu.
  assert.deepEqual(r.hostCandidates, ["192.168.3.1", "192.168.1.1", "5.5.5.1"]);
});

test("prepareNetwork: profil sisince UYARIR (kalicilik tek yonlu)", async () => {
  // Profile yalniz EKLENIR, hicbir yerde silinmez — kullanicinin kendi
  // adresini kaybetmemek icin bilincli. Bedeli birikme; sessiz kalmasin.
  const many = ["1.1.1.1/24", "2.2.2.2/24", "3.3.3.3/24", "4.4.4.4/24",
    "6.6.6.6/24", "7.7.7.7/24", "8.8.8.8/24", "9.9.9.9/24"];
  const ops = fakeOps({ lease: routeLease("192.168.3.1"), profileAddresses: many });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => /now holds \d+ addresses/.test(w)),
    "esik asilinca uyari SART");
});

test("prepareNetwork: esik altinda gereksiz uyari YOK", async () => {
  const ops = fakeOps({ lease: routeLease("192.168.3.1"), profileAddresses: [] });
  const r = await prepareNetwork({ adapter: "Ethernet", dhcpTimeoutSec: 5, ops });
  assert.ok(!r.warnings.some((w) => /now holds/.test(w)));
});
