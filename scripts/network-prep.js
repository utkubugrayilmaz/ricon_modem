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
// Sonuc semasi:
//   basari: { ok:true, adapter, leaseAcquired, discoveredHost, fallbackUsed,
//             directHit, secondariesAdded, restoredAddresses, warnings, timestamp,
//             hostCandidates, lease, persistence }
//   hata:   { ok:false, reason, adapter, message, recoveryAttempted?,
//             recoveryError?, restoredAddresses? }
//   reason kodlari src/problems.js katalogunda: NOT_ELEVATED,
//   ADAPTER_NOT_FOUND, NETWORK_PREP_FAILED, NETWORK_PERMISSION_DENIED.
//
// `hostCandidates` : modem icin SIRALI adaylar (kiradan gelenler once). Cagiran
//   bunlari YOKLAYARAK dogrular — `discoveredHost` korlemesine kullanilmaz.
// `lease`          : ham kira nesnesi (tesnis/log icin; null olabilir).
// `persistence`    : { persisted, target, added } — adresler kablo cikinca ve
//   makine kapanip acilinca da duruyor mu.

import { execFileSync } from "node:child_process";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Profilde bu kadar adres birikince operatore soylenir (bkz. persistNow).
const PROFILE_ADDRESS_WARN = 8;
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

// `ip -j route show default dev X` ciktisindan KIRA ile gelmis gateway'i secer.
//
// STATIK bir default route kira DEGILDIR. Makinenin kendi NetworkManager
// profilinde bir gateway varsa (or. ipv4.gateway=7.7.7.1) o route DHCP'ye
// gecildikten sonra da bir sure ayakta kalir; protokole bakmayan bir okuma
// onu "modem bulundu" sanar. OLCULDU (2026-09-02, enp12s0): adim 2'den 50 ms
// sonra 7.7.7.1 dondu, akis o adrese kitlendi ve orada HICBIR cihaz yoktu —
// DHCP hic beklenmedi, gercek modem hic aranmadi.
//
// Kirayla gelen route NetworkManager'da `proto dhcp`, klasik dhclient'ta
// `proto boot`; makinenin kendi profilinden geleni ise HER ZAMAN `proto
// static`. Reddedilen tek deger o.
export function pickLeaseGateway(routes = []) {
  const lease = routes.find((r) => r?.gateway && r.protocol !== "static");
  return lease?.gateway ?? null;
}

// Noktali maskeyi (255.255.255.0) prefix uzunluguna (24) cevirir —
// maskFromPrefix'in tersi. DHCP `subnet_mask` secenegi noktali gelir.
// Bitisik olmayan maske (255.0.255.0) gecersizdir: null doner.
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
// GERCEK bicim (canli olcum, wlp0s20f3):
//   DHCP4.OPTION[24]:routers = 192.168.2.1
//   DHCP4.OPTION[3]:domain_name_servers = 8.8.8.8 8.8.4.4
//
// Iki tuzak: (a) DEGERIN kendisinde bosluk var, o yuzden ilk "=" ile bolunur,
// bosluktan degil; (b) nmcli terse modda deger icindeki ":" ve "\" karakterini
// "\:" / "\\" diye kacirir — alan ayiracini ararken kacirilmis ":" atlanmali,
// yoksa "private_224 = 46:47:..." gibi bir satir yanlis yerden bolunur.
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

// Secenek sozlugunden kira nesnesi. Adlar RFC 2132 adlari — nmcli oyle veriyor.
// Adres YOKSA kira da yoktur: NM, DHCP islemi hic olmamis arayuzde bu listeyi
// bos dondurur, yani "bos sozluk = kira yok" guvenilir bir isarettir.
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

// Kiradan "modem nerede" adaylari — SIRA = KANITIN GUCU, tekrarsiz.
//
// Tek bir gateway degeri yerine liste, cunku modemin DHCP sunucusu `routers`
// secenegini HIC vermeyebilir. O durumda kirayi VEREN kutu (secenek 54) zaten
// modemin kendisidir: kablo noktadan noktaya. Ucuncu ve EN ZAYIF aday, alt
// agin .1'i — bir gelenek, kanit degil; bu yuzden network-setup.js adaylari
// yoklayarak DOGRULAR, korlemesine kullanmaz.
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

// Kira TAZE mi — yani modemden mi geldi, makinenin kendi ayarindan mi?
//
// Karar KAYNAGA gore verilir:
//   dhcp-options / dynamic-address : DOGASI GEREGI taze. Bu iki kanit ancak
//     gercek bir DHCP islemi olduysa vardir; makinenin statik yapilandirmasi
//     bunlari URETEMEZ.
//   route : BELIRSIZ. Makinenin kendi profilindeki gateway de burada gorunur
//     (7.7.7.1 kusuru). Yalniz burada onceki goruntuyle karsilastirilir.
export function isFreshLease(lease, before = null) {
  if (!lease) return false;
  // Kullanilabilir tek bir aday bile cikmiyorsa kira DEGILDIR. APIPA
  // (169.254.*) elemesi buradan geliyor: kablo takili ama DHCP sunucusu yoksa
  // isletim sistemi kendine link-local bir adres uydurur — bu "modem cevap
  // verdi" demek DEGIL.
  if (leaseHostCandidates(lease).length === 0) return false;
  if (lease.source !== "route") return true;
  return Boolean(lease.gateway) && lease.gateway !== before?.gateway;
}

// Dogrudan yoklanacak adaylar — SIRA = GUVEN, tekrarsiz.
//
// Eskiden bu liste network-setup.js'te ["192.168.1.1","192.168.8.1"] diye
// SABIT duruyordu ve .env'deki MODEM_HOST'u HIC gormuyordu: operator adresi
// degistirse bile arac eski adrese bakiyordu. Ayrica saha adresi (5.5.5.1)
// listede hic yoktu, oysa pipeline.js tam o ikisini yokluyor.
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

// Hedef son durum: yedek + (kira geldiyse) kesfedilen alt agda bir ikincil +
// HER ZAMAN saha ikincili (5.5.5.100) + (kira gelmediyse) fabrika yedegi
// 192.168.1.100. ps1'in ADIM 4'unun birebir portu. Ilk eleman "birincil"
// olur: statige donerken DHCP'yi kapatan atama odur.
export function computeDesiredAddresses({ backup = [], discoveredIp = null,
  leasedIp = null, leasedPrefixLength = null, coverHosts = [],
  fieldSecondaryIp = "5.5.5.100", prefixLength = 24,
  factoryFallbackIp = "192.168.1.100" } = {}) {
  const desired = backup.map((b) => ({ ip: b.ip, prefixLength: b.prefixLength, isNew: false }));

  // Bir alt agda BIR kaynak adres yeter; "zaten var mi" kontrolu ortak.
  const coverSubnet = (host, preferred = null, len = prefixLength) => {
    const subnetPrefix = prefixOf(host);
    if (desired.some((d) => d.ip.startsWith(subnetPrefix) && d.ip !== host)) return;
    // TERCIH EDILEN adres KIRANIN BIZE VERDIGI adrestir: modem onu kendi
    // havuzundan ayirdi, yani serbest oldugu KANITLI ve maskesi de kiradan
    // geliyor. Uydurma .100 hem havuzla cakisabilir (siradaki cihaza dagitilir)
    // hem de /24 varsayar.
    const ip = preferred && preferred !== host && preferred.startsWith(subnetPrefix)
      ? preferred
      : findFreeSecondaryIp(subnetPrefix, host, desired.map((d) => d.ip));
    desired.push({ ip, prefixLength: len, isNew: true });
  };

  if (discoveredIp || leasedIp) {
    coverSubnet(discoveredIp ?? leasedIp, leasedIp, leasedPrefixLength ?? prefixLength);
  }
  if (!desired.some((d) => d.ip === fieldSecondaryIp)) {
    desired.push({ ip: fieldSecondaryIp, prefixLength, isNew: true });
  }
  if (!discoveredIp && !leasedIp && !desired.some((d) => d.ip === factoryFallbackIp)) {
    desired.push({ ip: factoryFallbackIp, prefixLength, isNew: true });
  }
  // EK ADAYLAR (MODEM_HOST, 192.168.8.1 ...): yoklayabilmek icin her adayin
  // alt aginda bir kaynak adres gerek — kaynaksiz yoklama YAPILMAZ (net.js).
  // Varsayilan bos liste, yani mevcut cagirilar icin akis DEGISMEZ.
  for (const host of coverHosts) coverSubnet(host);
  return desired;
}

// ======================================================================
// Platform ilkelleri — process.platform dallanmasi YALNIZCA burada
// ======================================================================
//
// Ortak arayuz (ops):
//   isElevated()                       -> boolean
//   adapterExists(adapter)             -> boolean
//   listAdapters()                     -> [string] (fiziksel/agdaki arayuz adlari)
//   listIpv4(adapter)                  -> [{ ip, prefixLength, origin }]
//                                         origin: "manual" | "dhcp" | diger
//   switchToDhcp(adapter)              -> string (komut ciktisi; hata: throw)
//   readLease(adapter)                 -> lease | null
//   setStatic(adapter, ip, prefixLen)  -> void   (DHCP'yi kapatir + ilk adres)
//   addIp(adapter, ip, prefixLen, {skipAsSource}) -> "added" | "exists"
//   requiresElevation(adapter)         -> boolean (root/Yonetici SART mi?)
//   persistAddresses(adapter, [{ip,prefixLength}]) -> { persisted, target, added }
//
// lease: { address, prefixLength, gateway, server, source }
//   address  : kiranin BIZE verdigi IP           (yoksa null)
//   gateway  : kiranin bildirdigi router         (DHCP secenegi 3; yoksa null)
//   server   : kirayi VEREN kutu                 (secenek 54; yoksa null)
//   prefixLength : kiranin maskesi               (secenek 1; yoksa null)
//   source   : "dhcp-options" | "dynamic-address" | "route"
// Hicbir kira kaniti yoksa null.
//
// `readGateway` KALDIRILDI. Tek bir gateway string'i kirayi modelleyemiyordu ve
// gercek kusur tam o bosluga sigindi: route BOSKEN kira VARDI (bkz. readLease).

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
    // Windows'ta route OLCUTU CALISIYOR: DHCP'nin verdigi default route her
    // zaman kuruluyor, o yuzden gateway ANA kanit olarak kalir. Kiranin adresi
    // (PrefixOrigin=Dhcp) yalniz alt agi ve maskeyi netlestirmek icin eklenir —
    // ve `source`u guclendirdigi icin Windows'u da bos yere beklemekten kurtarir.
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
    // Windows'ta New-NetIPAddress ZATEN kalicidir (kayit defterine yazar) —
    // yapacak ayri bir is yok.
    requiresElevation() { return true; },
    persistAddresses(adapter) {
      return { persisted: true, target: adapter, added: [] };
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
  // nmcli sarmalayicisi: YETKI reddini sirandan bir hatadan ayirir.
  // polkit'in `allow_active` izni AKTIF YEREL oturum ister; SSH uzerinden ya
  // da oturumsuz calistirmada reddedilir ve bu, kullaniciya "IT'ye haber ver"
  // demekten cok "bu ekranda calistir" demeyi gerektiren AYRI bir durumdur.
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
  // Adaptorde SU AN etkin olan NM profilinin adi. Kalici yazma buraya gider:
  // ayri bir profil acmak yerine etkin olani guncelliyoruz, cunku bir cihazda
  // iki `autoconnect` profili NM'de birbiriyle yarisir ve hangisinin secildigi
  // ongorulemez olur.
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
    // Yukselme GERCEKTEN gerekli mi? Cevap platforma DEGIL, adaptoru kimin
    // yonettigine bagli. NM yonetiyorsa HAYIR: polkit'te
    // org.freedesktop.NetworkManager.network-control -> allow_active=yes, ve
    // dagitimin kurali settings.modify.system'i de `sudo`/`netdev` grubundaki
    // aktif yerel oturuma aciyor (/usr/share/polkit-1/rules.d/
    // org.freedesktop.NetworkManager.rules). NM yoksa ciplak `ip`/`dhclient`
    // CAP_NET_ADMIN ister — o zaman EVET.
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
    // UC KANIT, guclu olandan zayifa. Route EN SONDA — cunku Linux'ta route
    // kiranin guvenilir bir gostergesi DEGIL:
    //
    // OLCULDU (2026-09-02, enp12s0): aktif NM profili `ipv4.ignore-auto-routes
    // = yes` tasiyordu; NM, DHCP'nin verdigi default route'u ATTI. Kira 3
    // saniyede geldi (`dhcp4: new lease, address=2.2.2.101`) ama route tablosu
    // bos kaldi, arac 15 saniye bekleyip "cevap yok" dedi ve modem 2.2.2.1'de
    // dururken 192.168.1.1'e dustu. Windows'ta ayni olcut calisiyordu cunku
    // Windows route'u HER ZAMAN kuruyor.
    readLease(adapter) {
      // 1) KIRANIN KENDISI. Route politikasindan tamamen bagimsiz; NM bu
      //    listeyi DHCP islemi hic olmamis arayuzde BOS dondurur.
      if (isNmManaged(adapter)) {
        try {
          const lease = leaseFromDhcp4Options(parseDhcp4Options(
            run("nmcli", ["-t", "-f", "DHCP4.OPTION", "device", "show", adapter])));
          if (lease) return lease;
        } catch { /* nmcli patlarsa asagidaki kanitlara dus */ }
      }
      // 2) Kiranin BIRAKTIGI IZ: `dynamic` bayrakli adres. NM de dhclient de
      //    koyar, route'a bagli degil. Router'i bilmez ama alt agi bilir.
      try {
        const dynamic = this.listIpv4(adapter).find((a) => a.origin === "dhcp");
        if (dynamic) {
          return { address: dynamic.ip, prefixLength: dynamic.prefixLength,
            gateway: null, server: null, source: "dynamic-address" };
        }
      } catch { /* adres okunamiyorsa son kaniti dene */ }
      // 3) SON CARE: route. NM'siz klasik dhclient kurulumlarinda TEK kanit bu.
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
        // Makinenin KENDI varsayilan rotasini dusurmeyelim: gateway ayni alt
        // agdaysa geri yazilir. (Baska alt agdaki gateway'i NM zaten reddeder.)
        if (gateway && gateway.startsWith(prefixOf(ip))) args.push("ipv4.gateway", gateway);
        nm(args);
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
    // KALICILIK. Buraya kadarki her sey `nmcli device modify` ile yapildi ve o
    // UCUCUDUR: profil dosyasina yazmaz. OLCULDU (2026-09-02 10:05:46): kablo
    // cikinca (carrier-changed -> unavailable) eklenen TUM adresler silindi ve
    // kablo geri takilinca NM yalnizca kayitli profili (7.7.7.77) geri getirdi;
    // 5.5.5.100 ile 192.168.1.100 geri GELMEDI. Bu, tak-cikar dongusunu de
    // yeniden baslatmayi da kiriyor.
    //
    // Cozum: son adres kumesini ETKIN PROFILE yaz. `/etc/NetworkManager/
    // system-connections/<profil>.nmconnection` dosyasina gider, yani makine
    // kapanip acilsa da durur ve kablo takilinca `autoconnect` geri getirir.
    //
    // YALNIZCA `ipv4.addresses`'e EKLEME yapilir: `method`, `gateway`, `dns`
    // dokunulmaz. Ozellikle `method`: profil `auto` ise NM ek statik adresleri
    // DHCP'nin yaninda zaten uygular; `manual`a cevirmek operatorun kurumsal
    // baglantisini koparirdi.
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
        // Ayni IP profilde BASKA bir maskeyle durabilir; adres bazinda bakilir
        // ki ust uste kosu profili sisirmesin.
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

// Yukselme kontrolu network-setup.js'in de isine yariyor (yeniden baslatma
// karari orada); ayni gercegi iki yerde tutmamak icin buradan verilir.
export function isElevated(ops = defaultOps()) {
  return ops ? ops.isElevated() : false;
}

// Yukselme GEREKLI mi? `isElevated`'in sordugu "root muyum" degil, "root
// OLMAM SART MI" sorusu — ve cevap adaptoru kimin yonettigine bagli.
//
// NM yonetimindeki bir arayuzde HAYIR: polkit `network-control` icin
// allow_active=yes veriyor, dagitimin kurali da settings.modify.system'i
// `sudo`/`netdev` grubundaki aktif YEREL oturuma aciyor. Yani sifresiz.
// Bu yuzden network-setup.js artik kosulsuz sudo ile yeniden baslamiyor.
export function needsElevation(adapter = null, ops = defaultOps()) {
  if (!ops || ops.isElevated()) return false;
  return ops.requiresElevation(adapter || detectAdapter(ops));
}

// Adaptor VERILMEDIYSE makinedekilerden birini sec. Sabit varsayilan
// ("eth0") Linux'ta neredeyse hicbir makinede tutmuyor — modern dagitimlar
// enp3s0/eno1 gibi adlar uretiyor ve ilk canli denemede tam bu yasandi
// (2026-09-02). Kablolu gorunumlu adlar (en*/eth*/Ethernet) once; hicbiri
// yoksa lo-disi ilk arayuz. Bulamazsa null: cagiran acik hata versin.
export function detectAdapter(ops = defaultOps()) {
  if (!ops) return null;
  const names = ops.listAdapters();
  return names.find((n) => /^(en|eth)/i.test(n)) ?? names[0] ?? null;
}

// ======================================================================
// Orkestrasyon — ps1'in akisiyla birebir
// ======================================================================

// options: { adapter, dhcpTimeoutSec=15, knownHost="", hostCandidates=[],
//            fieldSecondaryIp, prefixLength=24, persist=true, log, ops }
// `ops` disaridan verilebilir — testler sahte ops ile TUM akisi cihazsiz ve
// makineye dokunmadan kosuyor (tests/network-prep.test.js).
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
  // Adaptor verilmediyse OTOMATIK sec (bkz. detectAdapter). Verildiyse
  // dokunma: kullanicinin acik tercihi tahminle EZILMEZ.
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
  // Yukselme kapisi ADAPTOR COZULDUKTEN SONRA: "root sart mi" sorusunun cevabi
  // adaptoru kimin yonettigine bagli (bkz. needsElevation), o yuzden adaptoru
  // bilmeden sorulamaz. detectAdapter/adapterExists yetkisiz calisir.
  if (ops.requiresElevation(adapter) && !ops.isElevated()) {
    return { ok: false, reason: "NOT_ELEVATED", adapter,
      message: "Administrator/root privileges are required to modify network adapter settings." };
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
  // KALICI KILMA. Buraya kadarki her sey CANLI adaptore yazildi; Linux'ta
  // NM yonetimindeki arayuzde bu UCUCU (kablo cikinca silinir). Son adres
  // kumesi profile de yazilir ki makine kapanip acilsa da dursun.
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
      // BIRIKME. Kalicilik tanim geregi TEK YONLU: profile yalniz EKLENIR,
      // hicbir yerde silinmez (kullanicinin kendi adresini kaybetmeyelim
      // diye). Bedeli, farkli alt agdaki her yeni modemin profile kalici bir
      // adres birakmasi. Sessizce buyumesin diye esik asilinca soylenir.
      if (r.persisted && (r.total ?? 0) > PROFILE_ADDRESS_WARN) {
        warnings.push(`profile '${r.target}' now holds ${r.total} addresses;`
          + " old modem subnets can be removed by hand if they are no longer used");
      }
      if (!r.persisted) {
        warnings.push(`addresses are NOT persistent: ${r.reason}`);
      }
      return r;
    } catch (e) {
      // Kalicilik BONUS'tur: canli adresler zaten yazildi ve modem su an
      // erisilebilir. Burada patlayip tum hazirligi cope atmak, calisan bir
      // isi calismaz yapmak olurdu.
      warnings.push(`could not persist addresses: ${e.message}`);
      return { persisted: false, target: null, added: [], reason: e.message };
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
      // Hizli yolda da kalicilik SART: adresler burada da `device modify` ile
      // yazildi, yani ayni sekilde ucucu.
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

  // TAM YOL — ADIM 1: mevcut STATIK adresleri yedekle. DHCP kirasi ASLA
  // yedeklenmez; makineye ozel baska IP'ler kaybolmasin kurali.
  const backup = ops.listIpv4(adapter)
    .filter((a) => a.origin === "manual")
    .map((a) => ({ ip: a.ip, prefixLength: a.prefixLength }));
  log(`step 1/3 — backed up ${backup.length} static address(es)`
    + (backup.length ? `: ${backup.map((b) => b.ip).join(", ")}` : "")
    + " (they will be restored)");

  try {
    // Kiradan ONCEKI goruntu. Route kaynakli bir kanit burada gorunuyorsa o
    // modemden GELMEMISTIR — makinenin kendi yapilandirmasindan kalmadir ve
    // DHCP'ye gecisin hemen ardindan hala durur. `isFreshLease` bunu KAYNAGA
    // gore ayirir; karsilastirma yalnizca "route" kaynagi icin gerekiyor.
    const before = ops.readLease(adapter);
    if (before) {
      log(`note: '${adapter}' already reports ${before.gateway ?? before.address}`
        + ` (evidence: ${before.source}) — not treated as the modem yet`);
    }

    // ADIM 2 — DHCP'ye gec.
    log(`step 2/3 — asking the modem for its address over DHCP (max ${dhcpTimeoutSec}s)...`);
    const dhcpOut = ops.switchToDhcp(adapter);
    if (dhcpOut) log(`dhcp: ${dhcpOut}`);

    // ADIM 3 — kirayi bekle. 169.254.* (APIPA) kira SAYILMAZ; eleme
    // leaseHostCandidates icinde.
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

    // ADIM 4 — hedefi SAF fonksiyonla hesapla; ADIM 5/6 — uygula.
    const desired = computeDesiredAddresses({
      backup, discoveredIp, leasedIp,
      leasedPrefixLength: lease?.prefixLength ?? null,
      coverHosts: hostCandidates, fieldSecondaryIp, prefixLength,
    });
    log(`step 3/3 — setting '${adapter}' back to static (primary: ${desired[0].ip})`);
    const primary = desired[0];
    // Yedegin gateway'i (varsa) geri yazilsin: makinenin kendi varsayilan
    // rotasini dusurmeyelim. Ayni alt agda degilse ops zaten yok sayar.
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
    // Yetki reddi AYRI bir teshis: "IT'ye haber ver" degil "bu makinenin
    // kendi ekraninda calistir" demeyi gerektiriyor (polkit allow_active
    // aktif YEREL oturum ister — SSH'ta reddedilir).
    return { ok: false, reason: e.reason ?? "NETWORK_PREP_FAILED", adapter, message: e.message,
      recoveryAttempted: true, recoveryError, restoredAddresses: backup };
  }
}
