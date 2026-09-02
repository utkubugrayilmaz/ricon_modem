// Ag hazirligi — tek dosya, iki platform (win32 + linux).
// Uc katman: saf karar fonksiyonlari (test edilir) + platform komut
// sarmalayicilari (windowsOps/linuxOps) + orkestrasyon (prepareNetwork).
// Sonuc semasi: { ok, discoveredHost, hostCandidates, lease, persistence,
// secondariesAdded, restoredAddresses, warnings } / { ok:false, reason, message }.

import { execFileSync } from "node:child_process";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Profilde bu kadar adres birikince operatore soylenir (bkz. persistNow).
const PROFILE_ADDRESS_WARN = 8;
const prefixOf = (ip) => ip.split(".").slice(0, 3).join(".") + ".";

// ======================================================================
// Saf karar katmani — makineye dokunmaz
// ======================================================================

// Prefix uzunlugunu noktali maskeye cevirir (24 -> 255.255.255.0, netsh ister).
export function maskFromPrefix(prefixLength) {
  const bits = "1".repeat(prefixLength).padEnd(32, "0");
  const octets = [];
  for (let i = 0; i < 32; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2));
  return octets.join(".");
}

// Alt agda bos bir adres bulur: .100'den baslar, modemi ve dolulari atlar.
export function findFreeSecondaryIp(subnetPrefix, avoid, taken = []) {
  for (let i = 100; i <= 250; i += 1) {
    const candidate = `${subnetPrefix}${i}`;
    if (candidate === avoid) continue;
    if (taken.includes(candidate)) continue;
    return candidate;
  }
  throw new Error(`could not find a free secondary IP in ${subnetPrefix}x`);
}

// Route listesinden KIRA ile gelmis gateway'i secer. `proto static` reddedilir:
// makinenin kendi profil gateway'i kira degildir (7.7.7.1 kusuru, 2026-09-02).
export function pickLeaseGateway(routes = []) {
  const lease = routes.find((r) => r?.gateway && r.protocol !== "static");
  return lease?.gateway ?? null;
}

// Noktali maskeyi prefix uzunluguna cevirir; bitisik olmayan maske -> null.
export function prefixFromMask(mask) {
  const octets = String(mask ?? "").trim().split(".");
  if (octets.length !== 4) return null;
  let bits = "";
  for (const o of octets) {
    if (!/^\d{1,3}$/.test(o)) return null;
    const n = Number(o);
    if (n > 255) return null;
    bits += n.toString(2).padStart(8, "0");
  }
  if (!/^1*0*$/.test(bits)) return null;
  return bits.indexOf("0") === -1 ? 32 : bits.indexOf("0");
}

// `nmcli -t -f DHCP4.OPTION device show X` ciktisini sozluge cevirir.
// Deger boslukludur (ilk "=" ile bolunur) ve nmcli ":"/"\\" kacirir — atlanir.
export function parseDhcp4Options(text = "") {
  const out = {};
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let colon = -1;
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === "\\") { i += 1; continue; }
      if (line[i] === ":") { colon = i; break; }
    }
    if (colon === -1) continue;
    const body = line.slice(colon + 1).replace(/\\(.)/g, "$1");
    const eq = body.indexOf("=");
    if (eq === -1) continue;
    const key = body.slice(0, eq).trim();
    if (key) out[key] = body.slice(eq + 1).trim();
  }
  return out;
}

// DHCP secenek sozlugunden kira nesnesi; adres yoksa kira da yoktur (null).
export function leaseFromDhcp4Options(options = {}) {
  const address = options.ip_address || null;
  if (!address) return null;
  return {
    address,
    prefixLength: prefixFromMask(options.subnet_mask),
    gateway: String(options.routers || "").trim().split(/\s+/)[0] || null,
    server: options.dhcp_server_identifier || null,
    source: "dhcp-options",
  };
}

// Kiradan "modem nerede" adaylari — sira = kanit gucu: routers > dhcp server
// > alt agin .1'i (gelenek). Cagiran yoklayarak DOGRULAR, korlemesine kullanmaz.
export function leaseHostCandidates(lease) {
  const out = [];
  const add = (ip) => {
    const v = String(ip || "").trim();
    if (!v || v === "0.0.0.0" || v.startsWith("169.254.")) return;
    if (!out.includes(v)) out.push(v);
  };
  add(lease?.gateway);
  add(lease?.server);
  if (lease?.address && !String(lease.address).startsWith("169.254.")) {
    add(prefixOf(lease.address) + "1");
  }
  return out;
}

// Kira TAZE mi (modemden mi geldi)? dhcp-options/dynamic-address dogasi geregi
// taze; "route" belirsizdir ve onceki goruntuyle karsilastirilir. APIPA elenir.
export function isFreshLease(lease, before = null) {
  if (!lease) return false;
  if (leaseHostCandidates(lease).length === 0) return false;
  if (lease.source !== "route") return true;
  return Boolean(lease.gateway) && lease.gateway !== before?.gateway;
}

// Dogrudan yoklanacak adaylar — sira = guven, tekrarsiz, gecersizler elenir.
export function probeHosts({ modemHost = "", defaultHost = "",
  factoryAltHost = "", fieldHost = "", extra = [] } = {}) {
  const valid = (ip) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)
    && ip !== "0.0.0.0" && !ip.startsWith("169.254.")
    && ip.split(".").every((o) => Number(o) <= 255);
  return [...new Set(
    [modemHost, defaultHost, factoryAltHost, fieldHost, ...extra]
      .map((s) => String(s || "").trim())
      .filter(valid),
  )];
}

// Makinenin hedef IP listesi: yedekler + modemin alt aginda bir ikincil +
// saha ikincili (5.5.5.100) + kira yoksa fabrika yedegi (192.168.1.100).
export function computeDesiredAddresses({ backup = [], discoveredIp = null,
  leasedIp = null, leasedPrefixLength = null, coverHosts = [],
  fieldSecondaryIp = "5.5.5.100", prefixLength = 24,
  factoryFallbackIp = "192.168.1.100" } = {}) {
  const desired = backup.map((b) => ({ ip: b.ip, prefixLength: b.prefixLength, isNew: false }));

  // Bir alt agda bir kaynak adres yeter; kiranin verdigi adres tercih edilir
  // (serbest oldugu kanitli, maskesi kiradan geliyor).
  const coverSubnet = (host, preferred = null, len = prefixLength) => {
    const subnetPrefix = prefixOf(host);
    if (desired.some((d) => d.ip.startsWith(subnetPrefix) && d.ip !== host)) return;
    const ip = preferred && preferred !== host && preferred.startsWith(subnetPrefix)
      ? preferred
      : findFreeSecondaryIp(subnetPrefix, host, desired.map((d) => d.ip));
    desired.push({ ip, prefixLength: len, isNew: true });
  };

  if (discoveredIp || leasedIp) {
    coverSubnet(discoveredIp ?? leasedIp, leasedIp, leasedPrefixLength ?? prefixLength);
  }
  // Modem tam 5.5.5.100'de kesfedildiyse ayni adresi makineye yazmak IP
  // cakismasi olur — atla (coverSubnet o alt aga zaten bos bir adres uretti).
  if (fieldSecondaryIp !== discoveredIp
      && !desired.some((d) => d.ip === fieldSecondaryIp)) {
    desired.push({ ip: fieldSecondaryIp, prefixLength, isNew: true });
  }
  if (!discoveredIp && !leasedIp && !desired.some((d) => d.ip === factoryFallbackIp)) {
    desired.push({ ip: factoryFallbackIp, prefixLength, isNew: true });
  }
  // Ek adaylarin (MODEM_HOST, 192.168.8.1 ...) alt aglarina da kaynak adres.
  for (const host of coverHosts) coverSubnet(host);
  return desired;
}

// ======================================================================
// Platform ilkelleri — process.platform dallanmasi yalnizca burada
// ======================================================================
// Ortak arayuz (ops): isElevated, requiresElevation, adapterExists,
// listAdapters, listIpv4, switchToDhcp, readLease, setStatic, addIp,
// persistAddresses. lease = { address, prefixLength, gateway, server, source }.

// PowerShell cagrisi (profilsiz, etkilesimsiz).
function ps(command) {
  return execFileSync("powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8" });
}
const psq = (s) => String(s).replace(/'/g, "''");

function windowsOps() {
  return {
    isElevated() {
      try {
        const out = ps("(New-Object Security.Principal.WindowsPrincipal("
          + "[Security.Principal.WindowsIdentity]::GetCurrent()))"
          + ".IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)");
        return out.trim() === "True";
      } catch { return false; }
    },
    adapterExists(adapter) {
      try {
        ps(`Get-NetAdapter -Name '${psq(adapter)}' -ErrorAction Stop | Out-Null`);
        return true;
      } catch { return false; }
    },
    listAdapters() {
      // -Physical: sanal adaptorler (Hyper-V, VPN) otomatik secime girmesin.
      try {
        return ps("Get-NetAdapter -Physical | Select-Object -ExpandProperty Name")
          .split("\n").map((s) => s.trim()).filter(Boolean);
      } catch { return []; }
    },
    listIpv4(adapter) {
      const out = ps(`Get-NetIPAddress -InterfaceAlias '${psq(adapter)}'`
        + " -AddressFamily IPv4 -ErrorAction SilentlyContinue"
        + " | Select-Object IPAddress,PrefixLength,PrefixOrigin"
        + " | ConvertTo-Json -Compress").trim();
      if (!out) return [];
      const raw = JSON.parse(out);
      const list = Array.isArray(raw) ? raw : [raw];
      return list.map((a) => ({
        ip: a.IPAddress, prefixLength: a.PrefixLength,
        origin: String(a.PrefixOrigin || "").toLowerCase(),
      }));
    },
    switchToDhcp(adapter) {
      // netsh tuhafligi: adaptor zaten DHCP'deyse exit 1 + "already enabled"
      // doner — gercek hata degil, tolere edilir.
      try {
        return execFileSync("netsh",
          ["interface", "ip", "set", "address", `name=${adapter}`, "source=dhcp"],
          { encoding: "utf8" }).trim();
      } catch (e) {
        const text = `${e.stdout || ""}${e.stderr || ""}`.trim();
        if (/already enabled/i.test(text)) return text;
        throw new Error(`netsh source=dhcp failed: ${text || e.message}`);
      }
    },
    // Windows'ta route guvenilir ana kanit (DHCP route'u her zaman kurulur);
    // kira adresi alt agi/maskeyi netlestirmek icin eklenir.
    readLease(adapter) {
      let gateway = null;
      try {
        const out = ps(`(Get-NetIPConfiguration -InterfaceAlias '${psq(adapter)}'`
          + " -ErrorAction SilentlyContinue).IPv4DefaultGateway.NextHop").trim();
        gateway = out ? out.split("\n")[0].trim() : null;
      } catch { /* gateway okunamadi: adres kanitina dus */ }
      let dynamic = null;
      try { dynamic = this.listIpv4(adapter).find((a) => a.origin === "dhcp") ?? null; }
      catch { /* adres de okunamadi */ }
      if (!gateway && !dynamic) return null;
      return { address: dynamic?.ip ?? null, prefixLength: dynamic?.prefixLength ?? null,
        gateway, server: null,
        source: dynamic ? "dynamic-address" : "route" };
    },
    // Windows'ta New-NetIPAddress zaten kalicidir — ayri is yok.
    requiresElevation() { return true; },
    persistAddresses(adapter) {
      return { persisted: true, target: adapter, added: [] };
    },
    // DHCP'yi kapatip ilk adresi atar (Set-NetIPInterface guvenilmez, netsh kullanilir).
    setStatic(adapter, ip, prefixLength) {
      const mask = maskFromPrefix(prefixLength);
      try {
        execFileSync("netsh",
          ["interface", "ip", "set", "address", `name=${adapter}`, "static", ip, mask],
          { encoding: "utf8" });
      } catch (e) {
        const text = `${e.stdout || ""}${e.stderr || ""}`.trim();
        throw new Error(`netsh static set failed: ${text || e.message}`);
      }
    },
    // skipAsSource: ikincil IP varsayilan cikis adresi olmasin (arac localAddress ile secer).
    addIp(adapter, ip, prefixLength, { skipAsSource = false } = {}) {
      const skip = skipAsSource ? " -SkipAsSource $true" : "";
      try {
        ps(`New-NetIPAddress -InterfaceAlias '${psq(adapter)}' -IPAddress ${ip}`
          + ` -PrefixLength ${prefixLength}${skip} -ErrorAction Stop | Out-Null`);
        return "added";
      } catch (e) {
        const text = `${e.stdout || ""}${e.stderr || ""}${e.message || ""}`;
        if (/already exists|Duplicate/i.test(text)) return "exists";
        throw new Error(`could not add ${ip}/${prefixLength}: ${text.trim()}`);
      }
    },
  };
}

function linuxOps() {
  const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" });
  // NM arayuzu yonetiyorsa komutlar nmcli uzerinden gider (elle atilan `ip`
  // ayarini NM ezebilir); tespit bir kez yapilir.
  let nmManaged = null;
  const isNmManaged = (adapter) => {
    if (nmManaged !== null) return nmManaged;
    try {
      const out = run("nmcli", ["-t", "-f", "DEVICE,STATE", "device", "status"]);
      const line = out.split("\n").find((l) => l.startsWith(`${adapter}:`));
      nmManaged = Boolean(line) && !/unmanaged/.test(line);
    } catch { nmManaged = false; }
    return nmManaged;
  };
  // nmcli sarmalayicisi: polkit yetki reddini ayri bir teshise cevirir
  // (allow_active aktif YEREL oturum ister; SSH'ta reddedilir).
  const nm = (args) => {
    try { return run("nmcli", args); }
    catch (e) {
      const text = `${e.stdout || ""}${e.stderr || ""}${e.message || ""}`.trim();
      if (/not authorized|insufficient privilege|permission denied/i.test(text)) {
        throw Object.assign(new Error(text), { reason: "NETWORK_PERMISSION_DENIED" });
      }
      throw e;
    }
  };
  // Adaptorde su an etkin NM profili — kalici yazma oraya gider (ikinci bir
  // autoconnect profili NM'de yaris yaratir).
  const activeProfile = (adapter) => {
    try {
      const name = run("nmcli", ["-g", "GENERAL.CONNECTION", "device", "show", adapter]).trim();
      return name && name !== "--" ? name : null;
    } catch { return null; }
  };
  return {
    isElevated() {
      return typeof process.getuid === "function" && process.getuid() === 0;
    },
    // Root sart mi? NM yonetiyorsa hayir (polkit izni yeter); ciplak
    // ip/dhclient CAP_NET_ADMIN ister — o zaman evet.
    requiresElevation(adapter) { return !isNmManaged(adapter); },
    adapterExists(adapter) {
      try { run("ip", ["link", "show", "dev", adapter]); return true; }
      catch { return false; }
    },
    listAdapters() {
      try {
        const raw = JSON.parse(run("ip", ["-j", "link", "show"]));
        return raw.map((l) => l.ifname).filter((n) => n && n !== "lo");
      } catch { return []; }
    },
    listIpv4(adapter) {
      const raw = JSON.parse(run("ip", ["-j", "addr", "show", "dev", adapter]));
      const out = [];
      for (const link of raw) {
        for (const a of link.addr_info || []) {
          if (a.family !== "inet") continue;
          // `dynamic` bayragi = DHCP kirasi; olmayan adres elle atanmis demek.
          out.push({ ip: a.local, prefixLength: a.prefixlen,
            origin: a.dynamic ? "dhcp" : "manual" });
        }
      }
      return out;
    },
    switchToDhcp(adapter) {
      if (isNmManaged(adapter)) {
        return run("nmcli", ["device", "modify", adapter, "ipv4.method", "auto"]).trim();
      }
      // -nw: kirayi beklemeden don; bekleme isi prepareNetwork'un dongusunde.
      return run("dhclient", ["-nw", adapter]).trim();
    },
    // Uc kanit, gucluden zayifa: kira secenekleri > dynamic adres > route.
    // Route en sonda cunku Linux'ta guvenilmez: NM `ignore-auto-routes` ile
    // DHCP route'unu atabiliyor (olculdu 2026-09-02, enp12s0).
    readLease(adapter) {
      if (isNmManaged(adapter)) {
        try {
          const lease = leaseFromDhcp4Options(parseDhcp4Options(
            run("nmcli", ["-t", "-f", "DHCP4.OPTION", "device", "show", adapter])));
          if (lease) return lease;
        } catch { /* nmcli patlarsa asagidaki kanitlara dus */ }
      }
      try {
        const dynamic = this.listIpv4(adapter).find((a) => a.origin === "dhcp");
        if (dynamic) {
          return { address: dynamic.ip, prefixLength: dynamic.prefixLength,
            gateway: null, server: null, source: "dynamic-address" };
        }
      } catch { /* adres okunamiyorsa son kaniti dene */ }
      try {
        const gateway = pickLeaseGateway(
          JSON.parse(run("ip", ["-j", "route", "show", "default", "dev", adapter])));
        return gateway ? { address: null, prefixLength: null, gateway,
          server: null, source: "route" } : null;
      } catch { return null; }
    },
    setStatic(adapter, ip, prefixLength, { gateway = null } = {}) {
      if (isNmManaged(adapter)) {
        const args = ["device", "modify", adapter,
          "ipv4.method", "manual", "ipv4.addresses", `${ip}/${prefixLength}`];
        // Makinenin kendi varsayilan rotasi dusmesin: ayni alt agdaysa geri yaz.
        if (gateway && gateway.startsWith(prefixOf(ip))) args.push("ipv4.gateway", gateway);
        nm(args);
        return;
      }
      // DHCP'yi birak, v4 adresleri temizle, ilk adresi ata (silinen eskiler
      // yedekten geri yazilir).
      try { run("dhclient", ["-r", adapter]); } catch { /* zaten kapali */ }
      run("ip", ["-4", "addr", "flush", "dev", adapter, "scope", "global"]);
      run("ip", ["addr", "add", `${ip}/${prefixLength}`, "dev", adapter]);
    },
    // Linux'ta SkipAsSource'a gerek yok: kaynak secimini rota belirliyor.
    addIp(adapter, ip, prefixLength, _sourceOpts = {}) {
      try {
        if (isNmManaged(adapter)) {
          nm(["device", "modify", adapter, "+ipv4.addresses", `${ip}/${prefixLength}`]);
        } else {
          run("ip", ["addr", "add", `${ip}/${prefixLength}`, "dev", adapter]);
        }
        return "added";
      } catch (e) {
        const text = `${e.stdout || ""}${e.stderr || ""}${e.message || ""}`;
        if (/File exists|already/i.test(text)) return "exists";
        if (e.reason) throw e;
        throw new Error(`could not add ${ip}/${prefixLength}: ${text.trim()}`);
      }
    },
    // Kalicilik: `device modify` UCUCU (kablo cikinca silinir — olculdu
    // 2026-09-02). Son adres kumesi etkin profile yazilir; yalnizca
    // ipv4.addresses'e EKLENIR, method/gateway/dns'e dokunulmaz.
    persistAddresses(adapter, addresses = []) {
      if (!isNmManaged(adapter)) {
        return { persisted: false, target: null, added: [],
          reason: "no NetworkManager profile (addresses are not persistent)" };
      }
      const profile = activeProfile(adapter);
      if (!profile) {
        return { persisted: false, target: null, added: [],
          reason: "no active connection profile on the adapter" };
      }
      let existing = [];
      try {
        existing = run("nmcli", ["-g", "ipv4.addresses", "connection", "show", profile])
          .trim().split(",").map((s) => s.trim()).filter(Boolean);
      } catch { /* okunamadiysa ekleme yine idempotent: nmcli tekrari yutar */ }
      const added = [];
      for (const { ip, prefixLength } of addresses) {
        const entry = `${ip}/${prefixLength}`;
        // Ayni IP profilde baska maskeyle durabilir; adres bazinda bakilir.
        if (existing.some((e) => e.split("/")[0] === ip)) continue;
        nm(["connection", "modify", profile, "+ipv4.addresses", entry]);
        existing.push(entry);
        added.push(entry);
      }
      return { persisted: true, target: profile, added, total: existing.length };
    },
  };
}

export function defaultOps() {
  if (process.platform === "win32") return windowsOps();
  if (process.platform === "linux") return linuxOps();
  return null;
}

// Yonetici/root muyuz? (network-setup.js yeniden baslatma kararinda kullanir)
export function isElevated(ops = defaultOps()) {
  return ops ? ops.isElevated() : false;
}

// Yukselme SART mi? Cevap adaptoru kimin yonettigine bagli (NM'de polkit
// yeter, sifresiz) — network-setup.js bu yuzden kosulsuz sudo'ya gitmiyor.
export function needsElevation(adapter = null, ops = defaultOps()) {
  if (!ops || ops.isElevated()) return false;
  return ops.requiresElevation(adapter || detectAdapter(ops));
}

// Adaptor verilmediyse birini sec: kablolu gorunumlu adlar (en*/eth*) once.
export function detectAdapter(ops = defaultOps()) {
  if (!ops) return null;
  const names = ops.listAdapters();
  return names.find((n) => /^(en|eth)/i.test(n)) ?? names[0] ?? null;
}

// ======================================================================
// Orkestrasyon
// ======================================================================

// Agi hazirlar; sonuc nesnesi doner, throw etmez. `ops` testlerde sahteyle
// degistirilir (tests/network-prep.test.js).
export async function prepareNetwork(options = {}) {
  const {
    dhcpTimeoutSec = 15, knownHost = "", hostCandidates = [],
    fieldSecondaryIp = "5.5.5.100", prefixLength = 24, persist = true,
    log = () => {}, ops = defaultOps(),
  } = options;
  let { adapter } = options;

  if (!ops) {
    return { ok: false, reason: "NETWORK_PREP_FAILED", adapter,
      message: `unsupported platform: ${process.platform} (win32 and linux only)` };
  }
  // Adaptor verilmediyse otomatik sec; verildiyse tercihi ezme.
  if (!adapter) {
    adapter = detectAdapter(ops);
    if (!adapter) {
      return { ok: false, reason: "ADAPTER_NOT_FOUND", adapter: null,
        message: "No network adapter was found on this machine at all." };
    }
    log(`no adapter name given — auto-detected '${adapter}'`
      + " (override with MODEM_ADAPTER_NAME if wrong)");
  }
  if (!ops.adapterExists(adapter)) {
    const names = ops.listAdapters();
    return { ok: false, reason: "ADAPTER_NOT_FOUND", adapter,
      message: `No adapter named '${adapter}' was found.`
        + (names.length ? ` Available: ${names.join(", ")}.` : "")
        + " Set MODEM_ADAPTER_NAME." };
  }
  // Yukselme kapisi adaptor cozulunce sorulur: "root sart mi" adaptore bagli.
  if (ops.requiresElevation(adapter) && !ops.isElevated()) {
    return { ok: false, reason: "NOT_ELEVATED", adapter,
      message: "Administrator/root privileges are required to modify network adapter settings." };
  }

  const warnings = [];
  const secondariesAdded = [];
  // Idempotent ekleme: adres zaten varsa hata degil, uyari.
  const ensureIp = (ip, len, skipAsSource) => {
    if (ops.addIp(adapter, ip, len, { skipAsSource }) === "exists") {
      warnings.push(`${ip} already present, skipped`);
    } else {
      secondariesAdded.push(ip);
      log(`+ ${ip} added to '${adapter}'`);
    }
  };
  // Kalici kilma: canli adresler Linux/NM'de ucucu — son kume profile yazilir.
  // Kalicilik bonustur: basarisizligi hazirligi cope atmaz, uyariya doner.
  const persistNow = (addresses) => {
    try {
      const r = ops.persistAddresses(adapter,
        addresses.map(({ ip, prefixLength: len }) => ({ ip, prefixLength: len })));
      if (r.persisted && r.added.length) {
        log(`persisted to profile '${r.target}': ${r.added.join(", ")}`
          + " (they survive unplug and reboot)");
      } else if (r.persisted) {
        log(`profile '${r.target}' already carries every address — nothing to persist`);
      }
      // Profil tek yonlu buyur (silinmez); esik asilinca operatore soylenir.
      if (r.persisted && (r.total ?? 0) > PROFILE_ADDRESS_WARN) {
        warnings.push(`profile '${r.target}' now holds ${r.total} addresses;`
          + " old modem subnets can be removed by hand if they are no longer used");
      }
      if (!r.persisted) {
        warnings.push(`addresses are NOT persistent: ${r.reason}`);
      }
      return r;
    } catch (e) {
      warnings.push(`could not persist addresses: ${e.message}`);
      return { persisted: false, target: null, added: [], reason: e.message };
    }
  };

  // HIZLI YOL: modem zaten bulunmus — adaptore dokunma, eksik ikincilleri ekle.
  if (knownHost) {
    try {
      log(`modem already answers at ${knownHost} — no DHCP discovery needed`);
      const subnetPrefix = prefixOf(knownHost);
      const live = ops.listIpv4(adapter);
      const already = live.find((a) => a.ip.startsWith(subnetPrefix) && a.ip !== knownHost);
      if (already) {
        warnings.push(`subnet ${subnetPrefix}x already has a secondary (${already.ip}), skipped`);
      } else {
        ensureIp(findFreeSecondaryIp(subnetPrefix, knownHost, live.map((a) => a.ip)),
          prefixLength, true);
      }
      if (!knownHost.startsWith(prefixOf(fieldSecondaryIp))) {
        if (live.some((a) => a.ip === fieldSecondaryIp)) {
          warnings.push(`${fieldSecondaryIp} already present, skipped`);
        } else {
          ensureIp(fieldSecondaryIp, prefixLength, true);
        }
      }
      // Hizli yolda da adresler ucucu yazildi — kalicilik burada da sart.
      const persistence = persist
        ? persistNow(ops.listIpv4(adapter)
          .map(({ ip, prefixLength: len }) => ({ ip, prefixLength: len })))
        : null;
      return { ok: true, adapter, leaseAcquired: false, discoveredHost: knownHost,
        fallbackUsed: false, directHit: true, secondariesAdded,
        restoredAddresses: [], warnings, timestamp: new Date().toISOString(),
        hostCandidates: [knownHost], lease: null, persistence };
    } catch (e) {
      return { ok: false, reason: "NETWORK_PREP_FAILED", adapter, message: e.message,
        recoveryAttempted: false, restoredAddresses: [] };
    }
  }

  // TAM YOL, adim 1: mevcut statik adresleri yedekle (DHCP kirasi yedeklenmez).
  const backup = ops.listIpv4(adapter)
    .filter((a) => a.origin === "manual")
    .map((a) => ({ ip: a.ip, prefixLength: a.prefixLength }));
  log(`step 1/3 — backed up ${backup.length} static address(es)`
    + (backup.length ? `: ${backup.map((b) => b.ip).join(", ")}` : "")
    + " (they will be restored)");

  try {
    // Kiradan ONCEKI goruntu: makinenin kendi route'u modem sanilmasin
    // (isFreshLease "route" kaynagini bununla karsilastirir).
    const before = ops.readLease(adapter);
    if (before) {
      log(`note: '${adapter}' already reports ${before.gateway ?? before.address}`
        + ` (evidence: ${before.source}) — not treated as the modem yet`);
    }

    // Adim 2: DHCP'ye gec, taze kirayi bekle.
    log(`step 2/3 — asking the modem for its address over DHCP (max ${dhcpTimeoutSec}s)...`);
    const dhcpOut = ops.switchToDhcp(adapter);
    if (dhcpOut) log(`dhcp: ${dhcpOut}`);

    let lease = null;
    const deadline = Date.now() + dhcpTimeoutSec * 1000;
    let waited = 0;
    while (Date.now() < deadline) {
      const now = ops.readLease(adapter);
      if (isFreshLease(now, before)) { lease = now; break; }
      await wait(500);
      waited += 1;
      if (waited % 4 === 0) log(`waiting for lease (${Math.floor(waited / 2)}/${dhcpTimeoutSec}s)...`);
    }
    const leaseHosts = leaseHostCandidates(lease);
    const discoveredIp = leaseHosts[0] ?? null;
    const leasedIp = lease?.address ?? null;
    const leaseAcquired = Boolean(lease);
    log(leaseAcquired
      ? `modem found at ${discoveredIp} (lease ${leasedIp ?? "?"}, evidence: ${lease.source})`
      : `no DHCP answer in ${dhcpTimeoutSec}s — either no modem is plugged in or its DHCP is off;`
        + " continuing with the known addresses");

    // Adim 3: hedef listeyi hesapla, statige don, adresleri yaz.
    const desired = computeDesiredAddresses({
      backup, discoveredIp, leasedIp,
      leasedPrefixLength: lease?.prefixLength ?? null,
      coverHosts: hostCandidates, fieldSecondaryIp, prefixLength,
    });
    log(`step 3/3 — setting '${adapter}' back to static (primary: ${desired[0].ip})`);
    const primary = desired[0];
    // Makinenin kendi varsayilan rotasi (varsa) geri yazilsin.
    ops.setStatic(adapter, primary.ip, primary.prefixLength,
      { gateway: before?.source === "route" ? before.gateway : null });
    if (primary.isNew) secondariesAdded.push(primary.ip);
    for (const item of desired.slice(1)) {
      if (item.isNew) {
        ensureIp(item.ip, item.prefixLength, true);
      } else if (ops.addIp(adapter, item.ip, item.prefixLength, { skipAsSource: false }) === "exists") {
        warnings.push(`restore: ${item.ip}/${item.prefixLength} already present`);
      } else {
        log(`+ ${item.ip} restored`);
      }
    }

    const persistence = persist ? persistNow(desired) : null;
    return { ok: true, adapter, leaseAcquired, discoveredHost: discoveredIp,
      fallbackUsed: !leaseAcquired, directHit: false, secondariesAdded,
      restoredAddresses: backup, warnings, timestamp: new Date().toISOString(),
      hostCandidates: [...new Set([...leaseHosts, ...hostCandidates])],
      lease, persistence };
  } catch (e) {
    // Hata: adaptoru yarim birakma — statige don, yedegi geri yukle, bildir.
    log(`FAILED: ${e.message}`
      + (backup.length ? ` — restoring the ${backup.length} backed-up address(es)` : ""));
    let recoveryError = null;
    try {
      if (backup.length > 0) {
        ops.setStatic(adapter, backup[0].ip, backup[0].prefixLength);
        for (const b of backup.slice(1)) {
          try { ops.addIp(adapter, b.ip, b.prefixLength, { skipAsSource: false }); }
          catch { /* kurtarmada tek adres kaybi tumunu durdurmasin */ }
        }
      }
    } catch (e2) {
      recoveryError = e2.message;
    }
    // Yetki reddi ayri teshis: "IT'ye haber ver" degil "yerel ekranda calistir".
    return { ok: false, reason: e.reason ?? "NETWORK_PREP_FAILED", adapter, message: e.message,
      recoveryAttempted: true, recoveryError, restoredAddresses: backup };
  }
}
