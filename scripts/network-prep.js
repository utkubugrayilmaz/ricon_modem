// Ag hazirligi — TEK dosya, iki platform (win32 + linux).
//
// prepare-modem-network.ps1'in JS'e tasinmis hali. Neden tasindi: karar
// mantigi ("hangi IP'ler eklenmeli") PowerShell'in icinde gomuluydu — cihazsiz
// test edilemiyordu ve Linux destegi icin ayni mantigin bash'te IKINCI kez
// yazilmasi gerekecekti. Simdi:
//
//   saf karar katmani   computeDesiredAddresses / findFreeSecondaryIp
//                       — platformdan bagimsiz, tests/network-prep.test.js
//   platform ilkelleri  windowsOps / linuxOps — 6 kucuk komut sarmalayicisi;
//                       process.platform dallanmasi YALNIZCA burada yasar
//   orkestrasyon        prepareNetwork — ps1 ile ayni akis, ayni sonuc semasi
//
// Bu dosya bilerek src/ DISINDA: alt surec calistirmak, makine ayarina
// dokunmak cekirdegin "src/ hicbirini yapmaz" sozlesmesine aykiri (bkz.
// network-setup.js basindaki ayni not).
//
// Sonuc semasi (ps1'in tek satir JSON ciktisiyla birebir):
//   basari: { ok:true, adapter, leaseAcquired, discoveredHost, fallbackUsed,
//             directHit, secondariesAdded, restoredAddresses, warnings, timestamp }
//   hata:   { ok:false, reason, adapter, message, recoveryAttempted?,
//             recoveryError?, restoredAddresses? }
//   reason kodlari src/problems.js katalogunda: NOT_ELEVATED,
//   ADAPTER_NOT_FOUND, NETWORK_PREP_FAILED.

import { execFileSync } from "node:child_process";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const prefixOf = (ip) => ip.split(".").slice(0, 3).join(".") + ".";

// ======================================================================
// Saf karar katmani — cihaza da makineye de DOKUNMAZ
// ======================================================================

// Prefix uzunlugunu (24) noktali maskeye (255.255.255.0) cevirir — netsh'in
// "static" alt komutu PrefixLength degil dotted mask ister.
export function maskFromPrefix(prefixLength) {
  const bits = "1".repeat(prefixLength).padEnd(32, "0");
  const octets = [];
  for (let i = 0; i < 32; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2));
  return octets.join(".");
}

// Alt agda, `taken` listesinde OLMAYAN bos bir adres bulur (.100'den baslar),
// modemin kendisiyle (`avoid`) cakismaz. ps1'deki Find-FreeSecondaryIp'in
// portu; canli sorgu yerine liste alir ki hem henuz-uygulanmamis (bellekteki)
// hedef listesiyle hem canli adres listesiyle calisabilsin.
export function findFreeSecondaryIp(subnetPrefix, avoid, taken = []) {
  for (let i = 100; i <= 250; i += 1) {
    const candidate = `${subnetPrefix}${i}`;
    if (candidate === avoid) continue;
    if (taken.includes(candidate)) continue;
    return candidate;
  }
  throw new Error(`could not find a free secondary IP in ${subnetPrefix}x`);
}

// Hedef son durum: yedek + (kira geldiyse) kesfedilen alt agda bir ikincil +
// HER ZAMAN saha ikincili (5.5.5.100) + (kira gelmediyse) fabrika yedegi
// 192.168.1.100. ps1'in ADIM 4'unun birebir portu. Ilk eleman "birincil"
// olur: statige donerken DHCP'yi kapatan atama odur.
export function computeDesiredAddresses({ backup = [], discoveredIp = null,
  fieldSecondaryIp = "5.5.5.100", prefixLength = 24,
  factoryFallbackIp = "192.168.1.100" } = {}) {
  const desired = backup.map((b) => ({ ip: b.ip, prefixLength: b.prefixLength, isNew: false }));
  if (discoveredIp) {
    const subnetPrefix = prefixOf(discoveredIp);
    const hasSubnetSecondary = desired.some(
      (d) => d.ip.startsWith(subnetPrefix) && d.ip !== discoveredIp,
    );
    if (!hasSubnetSecondary) {
      desired.push({
        ip: findFreeSecondaryIp(subnetPrefix, discoveredIp, desired.map((d) => d.ip)),
        prefixLength, isNew: true,
      });
    }
  }
  if (!desired.some((d) => d.ip === fieldSecondaryIp)) {
    desired.push({ ip: fieldSecondaryIp, prefixLength, isNew: true });
  }
  if (!discoveredIp && !desired.some((d) => d.ip === factoryFallbackIp)) {
    desired.push({ ip: factoryFallbackIp, prefixLength, isNew: true });
  }
  return desired;
}

// ======================================================================
// Platform ilkelleri — process.platform dallanmasi YALNIZCA burada
// ======================================================================
//
// Ortak arayuz (ops):
//   isElevated()                       -> boolean
//   adapterExists(adapter)             -> boolean
//   listIpv4(adapter)                  -> [{ ip, prefixLength, origin }]
//                                         origin: "manual" | "dhcp" | diger
//   switchToDhcp(adapter)              -> string (komut ciktisi; hata: throw)
//   readGateway(adapter)               -> string | null
//   setStatic(adapter, ip, prefixLen)  -> void   (DHCP'yi kapatir + ilk adres)
//   addIp(adapter, ip, prefixLen, {skipAsSource}) -> "added" | "exists"

// PowerShell cagrisi. -NoProfile/-NonInteractive: profil betigi araya girmesin,
// prompt'ta kilitlenmesin (bin/ricon.js'teki isElevated ile ayni tercih).
function ps(command) {
  return execFileSync("powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8" });
}
// PowerShell tek tirnak kacisi: ' -> ''
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
      // NETSH TUHAFLIGI (ps1'den tasinan olcum): adaptor zaten DHCP'deyse
      // netsh "DHCP is already enabled" deyip exit 1 donuyor — gercek hata
      // DEGIL. Cikti metnine bakip yalniz gercek hatada duruyoruz.
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
    readGateway(adapter) {
      try {
        const out = ps(`(Get-NetIPConfiguration -InterfaceAlias '${psq(adapter)}'`
          + " -ErrorAction SilentlyContinue).IPv4DefaultGateway.NextHop").trim();
        return out ? out.split("\n")[0].trim() : null;
      } catch { return null; }
    },
    setStatic(adapter, ip, prefixLength) {
      // Set-NetIPInterface -Dhcp Disabled canli olarak "Inconsistent
      // parameters" hatasi veriyor (ps1'de olculmus bilinen kusur); netsh'in
      // "static" alt komutu DHCP'yi kapatmakla ilk adresi atamayi tek adimda
      // yapar, guvenilir.
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
    addIp(adapter, ip, prefixLength, { skipAsSource = false } = {}) {
      // -SkipAsSource: ikincil IP varsayilan cikis adresi OLMASIN; arac zaten
      // localAddress ile bilincli secim yapiyor (bkz. src/net.js). Geri
      // yuklenen eski adresler ise makinenin kendi adresi — onlara konmaz.
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
  // NetworkManager arayuzu yonetiyorsa elle atilan `ip` komutlarini bir
  // sonraki olayda EZEBILIR — o durumda islemler nmcli uzerinden gider.
  // Tespit bir kez yapilir (memoize).
  let nmManaged = null;
  const isNmManaged = (adapter) => {
    if (nmManaged !== null) return nmManaged;
    try {
      const out = run("nmcli", ["-t", "-f", "DEVICE,STATE", "device", "status"]);
      const line = out.split("\n").find((l) => l.startsWith(`${adapter}:`));
      nmManaged = Boolean(line) && !/unmanaged/.test(line);
    } catch { nmManaged = false; }   // nmcli yoksa NM de yok say
    return nmManaged;
  };
  return {
    isElevated() {
      return typeof process.getuid === "function" && process.getuid() === 0;
    },
    adapterExists(adapter) {
      try { run("ip", ["link", "show", "dev", adapter]); return true; }
      catch { return false; }
    },
    listIpv4(adapter) {
      const raw = JSON.parse(run("ip", ["-j", "addr", "show", "dev", adapter]));
      const out = [];
      for (const link of raw) {
        for (const a of link.addr_info || []) {
          if (a.family !== "inet") continue;
          // `dynamic` bayragi DHCP kirasini isaretler; olmayan adres elle
          // atanmis demektir (Windows'taki PrefixOrigin=Manual karsiligi).
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
      // -nw: kirayi BEKLEMEDEN don; kira gelisini prepareNetwork'un gateway
      // yoklama dongusu izliyor (iki platformda ayni bekleme mantigi).
      return run("dhclient", ["-nw", adapter]).trim();
    },
    readGateway(adapter) {
      try {
        const raw = JSON.parse(run("ip", ["-j", "route", "show", "default", "dev", adapter]));
        return raw[0]?.gateway ?? null;
      } catch { return null; }
    },
    setStatic(adapter, ip, prefixLength) {
      if (isNmManaged(adapter)) {
        run("nmcli", ["device", "modify", adapter,
          "ipv4.method", "manual", "ipv4.addresses", `${ip}/${prefixLength}`]);
        return;
      }
      // dhclient'i birak (calismiyorsa hata verir — onemli degil), sonra
      // temiz baslangic: v4 adresleri sil, ilk adresi ata. Silinen eski
      // adresler kaybolmaz — computeDesiredAddresses yedegi listeye koydu,
      // arkadan addIp ile geri yazilirlar (netsh "static"in davranisiyla ayni).
      try { run("dhclient", ["-r", adapter]); } catch { /* zaten kapali */ }
      run("ip", ["-4", "addr", "flush", "dev", adapter, "scope", "global"]);
      run("ip", ["addr", "add", `${ip}/${prefixLength}`, "dev", adapter]);
    },
    addIp(adapter, ip, prefixLength, _sourceOpts = {}) {
      // Linux'ta -SkipAsSource karsiligi GEREKMIYOR: cekirdek zaten
      // localAddress ile baglaniyor ve Linux kaynak secimini rotaya gore
      // yapiyor; ikinci adres varsayilani bozmuyor.
      try {
        if (isNmManaged(adapter)) {
          run("nmcli", ["device", "modify", adapter, "+ipv4.addresses", `${ip}/${prefixLength}`]);
        } else {
          run("ip", ["addr", "add", `${ip}/${prefixLength}`, "dev", adapter]);
        }
        return "added";
      } catch (e) {
        const text = `${e.stdout || ""}${e.stderr || ""}${e.message || ""}`;
        if (/File exists|already/i.test(text)) return "exists";
        throw new Error(`could not add ${ip}/${prefixLength}: ${text.trim()}`);
      }
    },
  };
}

export function defaultOps() {
  if (process.platform === "win32") return windowsOps();
  if (process.platform === "linux") return linuxOps();
  return null;
}

// Yukselme kontrolu network-setup.js'in de isine yariyor (yeniden baslatma
// karari orada); ayni gercegi iki yerde tutmamak icin buradan verilir.
export function isElevated(ops = defaultOps()) {
  return ops ? ops.isElevated() : false;
}

// ======================================================================
// Orkestrasyon — ps1'in akisiyla birebir
// ======================================================================

// options: { adapter, dhcpTimeoutSec=15, knownHost="", fieldSecondaryIp,
//            prefixLength=24, log, ops }
// `ops` disaridan verilebilir — testler sahte ops ile TUM akisi cihazsiz ve
// makineye dokunmadan kosuyor (tests/network-prep.test.js).
export async function prepareNetwork(options = {}) {
  const {
    adapter, dhcpTimeoutSec = 15, knownHost = "",
    fieldSecondaryIp = "5.5.5.100", prefixLength = 24,
    log = () => {}, ops = defaultOps(),
  } = options;

  if (!ops) {
    return { ok: false, reason: "NETWORK_PREP_FAILED", adapter,
      message: `unsupported platform: ${process.platform} (win32 and linux only)` };
  }
  // Ikinci savunma hatti: normal kullanimda network-setup.js yukselmeyi
  // zaten garanti ediyor; bu yalniz dogrudan cagrilirsa devreye girer.
  if (!ops.isElevated()) {
    return { ok: false, reason: "NOT_ELEVATED", adapter,
      message: "Administrator/root privileges are required to modify network adapter settings." };
  }
  if (!ops.adapterExists(adapter)) {
    return { ok: false, reason: "ADAPTER_NOT_FOUND", adapter,
      message: `No adapter named '${adapter}' was found. Set MODEM_ADAPTER_NAME.` };
  }

  const warnings = [];
  const secondariesAdded = [];
  // Idempotent ekleme: zaten varsa hata SAYMAZ (ust uste calistirmak guvenli).
  const ensureIp = (ip, len, skipAsSource) => {
    if (ops.addIp(adapter, ip, len, { skipAsSource }) === "exists") {
      warnings.push(`${ip} already present, skipped`);
    } else {
      secondariesAdded.push(ip);
      log(`+ ${ip} added to '${adapter}'`);
    }
  };

  // HIZLI YOL: modem zaten bulunmus (network-setup.js'in dogrudan yoklamasi).
  // DHCP'ye HIC GECILMEZ, adaptore dokunulmaz; yalniz eksik ikinciller eklenir.
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
      return { ok: true, adapter, leaseAcquired: false, discoveredHost: knownHost,
        fallbackUsed: false, directHit: true, secondariesAdded,
        restoredAddresses: [], warnings, timestamp: new Date().toISOString() };
    } catch (e) {
      return { ok: false, reason: "NETWORK_PREP_FAILED", adapter, message: e.message,
        recoveryAttempted: false, restoredAddresses: [] };
    }
  }

  // TAM YOL — ADIM 1: mevcut STATIK adresleri yedekle. DHCP kirasi ASLA
  // yedeklenmez; makineye ozel baska IP'ler kaybolmasin kurali.
  const backup = ops.listIpv4(adapter)
    .filter((a) => a.origin === "manual")
    .map((a) => ({ ip: a.ip, prefixLength: a.prefixLength }));
  log(`step 1/3 — backed up ${backup.length} static address(es)`
    + (backup.length ? `: ${backup.map((b) => b.ip).join(", ")}` : "")
    + " (they will be restored)");

  try {
    // ADIM 2 — DHCP'ye gec.
    log(`step 2/3 — asking the modem for its address over DHCP (max ${dhcpTimeoutSec}s)...`);
    const dhcpOut = ops.switchToDhcp(adapter);
    if (dhcpOut) log(`dhcp: ${dhcpOut}`);

    // ADIM 3 — kirayi bekle. Gateway = modemin gercek IP'si.
    // 169.254.* (APIPA) gercek kira SAYILMAZ.
    let discoveredIp = null;
    const deadline = Date.now() + dhcpTimeoutSec * 1000;
    let waited = 0;
    while (Date.now() < deadline) {
      const gw = ops.readGateway(adapter);
      if (gw && !gw.startsWith("169.254.")) { discoveredIp = gw; break; }
      await wait(500);
      waited += 1;
      if (waited % 4 === 0) log(`waiting for lease (${Math.floor(waited / 2)}/${dhcpTimeoutSec}s)...`);
    }
    const leaseAcquired = Boolean(discoveredIp);
    log(leaseAcquired ? `modem found at ${discoveredIp}`
      : `no DHCP answer in ${dhcpTimeoutSec}s — either no modem is plugged in or its DHCP is off;`
        + " continuing with the known addresses (192.168.1.1 / 5.5.5.1)");

    // ADIM 4 — hedefi SAF fonksiyonla hesapla; ADIM 5/6 — uygula.
    const desired = computeDesiredAddresses({ backup, discoveredIp, fieldSecondaryIp, prefixLength });
    log(`step 3/3 — setting '${adapter}' back to static (primary: ${desired[0].ip})`);
    const primary = desired[0];
    ops.setStatic(adapter, primary.ip, primary.prefixLength);
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

    return { ok: true, adapter, leaseAcquired, discoveredHost: discoveredIp,
      fallbackUsed: !leaseAcquired, directHit: false, secondariesAdded,
      restoredAddresses: backup, warnings, timestamp: new Date().toISOString() };
  } catch (e) {
    // Ne olursa olsun adaptoru YARIM birakma: statige don, yedegi geri yukle,
    // sonra hatayi bildir. Yedek YOKSA adaptore dokunma: uyduruk bir adres
    // atamaktansa DHCP modunda birakmak daha guvenli (ps1 ile ayni karar).
    log(`FAILED: ${e.message}`
      + (backup.length ? ` — restoring the ${backup.length} backed-up address(es)` : ""));
    let recoveryError = null;
    try {
      if (backup.length > 0) {
        ops.setStatic(adapter, backup[0].ip, backup[0].prefixLength);
        for (const b of backup.slice(1)) {
          try { ops.addIp(adapter, b.ip, b.prefixLength, { skipAsSource: false }); }
          catch { /* kurtarmada tek adres kaybi tum kurtarmayi durdurmasin */ }
        }
      }
    } catch (e2) {
      recoveryError = e2.message;
    }
    return { ok: false, reason: "NETWORK_PREP_FAILED", adapter, message: e.message,
      recoveryAttempted: true, recoveryError, restoredAddresses: backup };
  }
}
