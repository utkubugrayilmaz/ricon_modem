#!/usr/bin/env node
// npm start'in ilk adimi: bilgisayarin agini hazirlar (network-prep.js),
// modemin IP'sini bulur, sonra asil araci (bin/ricon.js provision) baslatir.

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_HOST, PROFILES, findSourceIp, isReachable } from "../src/index.js";
import { prepareNetwork, needsElevation, probeHosts } from "./network-prep.js";
import { problem, problemText } from "../src/problems.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

// Her log satiri hem ekrana hem data/network-setup.log'a yazilir.
const LOG_FILE = path.join(repoRoot, "data", "network-setup.log");
function log(m) {
  const line = `[network-setup] ${m}`;
  process.stderr.write(line + "\n");
  try {
    mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch { /* log yazilamazsa akis durmasin */ }
}

// Windows: kendini Yonetici penceresinde yeniden baslatir, bitmesini bekler.
function relaunchElevated(argv) {
  const envFile = path.join(repoRoot, ".env");
  const args = [`--env-file-if-exists=${envFile}`, __filename, ...argv];
  const psArgs = args.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(",");
  const psCommand = `$p = Start-Process -FilePath '${process.execPath.replace(/'/g, "''")}' `
    + `-ArgumentList @(${psArgs}) -Verb RunAs -WorkingDirectory '${repoRoot.replace(/'/g, "''")}' `
    + "-PassThru -Wait; exit $p.ExitCode";
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { stdio: "inherit" });
    return 0;
  } catch (e) {
    return e.status ?? 1;   // UAC reddi ya da cocugun hatasi: kodu aynen tasi
  }
}

// Yonetici penceresinin log satirlarini asil terminale geri basar.
function logFileSize() {
  try { return statSync(LOG_FILE).size; } catch { return 0; }
}
function replayLog(fromByte) {
  try {
    const text = readFileSync(LOG_FILE).subarray(fromByte).toString("utf8").trimEnd();
    if (text) process.stderr.write(text + "\n");
  } catch { /* log yoksa gosterilecek bir sey de yok */ }
}

// Linux: sudo ile ayni terminalde yeniden baslatir ve cikis kodunu tasir.
function relaunchWithSudo(argv) {
  const envFile = path.join(repoRoot, ".env");
  const r = spawnSync("sudo",
    [process.execPath, `--env-file-if-exists=${envFile}`, __filename, ...argv],
    { stdio: "inherit", cwd: repoRoot });
  process.exit(r.status ?? 1);
}

// Dogrudan yoklanacak adaylar — hepsi .env'den ya da profillerden turer:
// MODEM_HOST > 192.168.1.1 (fabrika) > 192.168.8.1 (fabrika 2.) > 5.5.5.1 (saha).
function candidateHosts() {
  return probeHosts({
    modemHost: process.env.MODEM_HOST,
    defaultHost: DEFAULT_HOST,
    factoryAltHost: PROFILES.factory.nvram.lan_ipaddr_ex1,
    fieldHost: PROFILES.field.nvram.lan_ipaddr,
  });
}

const prefixOf = (ip) => ip.split(".").slice(0, 3).join(".") + ".";

// Modem adaylardan birinde cevap veriyor mu? (kaynak IP yoksa o aday atlanir)
async function findDirectHost(candidates) {
  for (const candidate of candidates) {
    const sourceIp = findSourceIp(prefixOf(candidate));
    if (!sourceIp) continue;
    if (await isReachable(candidate, sourceIp)) return candidate;
  }
  return null;
}

// NM adresi asenkron uygular: eklenen kaynak IP gorunene kadar kisa bekleme.
async function waitForSourceIp(prefix, maxMs = 3000) {
  const deadline = Date.now() + maxMs;
  for (;;) {
    const ip = findSourceIp(prefix);
    if (ip || Date.now() >= deadline) return ip;
    await new Promise((r) => setTimeout(r, 200));
  }
}

// Ikinci gecis: hazirlik kaynak adresleri ekledi, adaylar artik yoklanabilir.
async function confirmHost(candidates) {
  for (const candidate of candidates) {
    const sourceIp = await waitForSourceIp(prefixOf(candidate));
    if (!sourceIp) continue;
    if (await isReachable(candidate, sourceIp)) return candidate;
  }
  return null;
}

// Hatayi problems.js katalogundaki operator metniyle bildirir.
function reportFailure(reason, detail, adapter) {
  const p = reason === "ADAPTER_NOT_FOUND" ? problem(reason, adapter)
    : reason === "NETWORK_PREP_FAILED" || reason === "NETWORK_PERMISSION_DENIED"
      ? problem(reason, detail)
      : problem(reason);
  const t = problemText(p.code);
  log(`FAILED: ${p.message}`);
  log(`${t.title} — ${t.whatToDo}`);
}

const SUPPORTED_PLATFORMS = new Set(["win32", "linux"]);

async function main() {
  if (!SUPPORTED_PLATFORMS.has(process.platform)) {
    log(`unsupported platform: ${process.platform} (win32 and linux only)`);
    process.exit(1);
  }

  const argv = process.argv.slice(2);

  // Adaptor adi .env'den; verilmediyse prepareNetwork kendisi bulur.
  const adapter = process.env.MODEM_ADAPTER_NAME || undefined;
  const timeoutSec = Number(process.env.MODEM_DHCP_TIMEOUT_SEC) || 15;

  // Yukselme kosulsuz degil: NM yonetimindeki arayuzde root gerekmiyor.
  if (needsElevation(adapter)) {
    if (process.platform === "win32") {
      log("not elevated — relaunching as Administrator (accept the UAC prompt; the result will be shown HERE when it finishes)...");
      const mark = logFileSize();
      const code = relaunchElevated(argv);
      replayLog(mark);
      if (code !== 0) log(`finished with an error (exit ${code}) — details above / in ${LOG_FILE}`);
      process.exit(code);
    }
    log("this adapter is not managed by NetworkManager — root is required;"
      + " relaunching with sudo (you may be asked for your password)...");
    relaunchWithSudo(argv);   // cikis kodunu kendi tasir, buraya donmez
  }

  // 1) Birinci gecis: kaynak IP'si zaten olan adaylari dogrudan yokla.
  const candidates = candidateHosts();
  log(`candidates: ${candidates.join(", ")}`);
  const directHost = await findDirectHost(candidates);
  if (directHost) log(`direct check hit: modem answers at ${directHost} already — skipping the DHCP dance`);

  // 2) Agi hazirla: gerekirse DHCP ile modemi bul, ikincil IP'leri ekle.
  const result = await prepareNetwork({
    adapter, dhcpTimeoutSec: timeoutSec, knownHost: directHost || "",
    hostCandidates: directHost ? [] : candidates,
    log: (m) => log(`prep: ${m}`),
  });
  if (!result.ok) {
    reportFailure(result.reason, result.message, result.adapter ?? adapter);
    process.exit(1);
  }
  // 3) Ikinci gecis: eklenen kaynak adreslerle adaylari dogrula.
  const hostIdx = argv.indexOf("--host");
  const explicitHost = hostIdx !== -1 ? argv[hostIdx + 1] : null;
  let confirmedHost = null;
  if (!explicitHost && !result.directHit) {
    confirmedHost = await confirmHost(result.hostCandidates ?? candidates);
    if (confirmedHost) log(`confirmed: modem answers at ${confirmedHost}`);
    else log("no candidate answered on the second pass");
  }

  // Ozet: modem nerede, makineye ne eklendi, ne geri yuklendi.
  const added = result.secondariesAdded ?? [];
  const restored = (result.restoredAddresses ?? []).map((a) => a.ip);
  log(`network ready — modem: ${result.directHit
    ? `${result.discoveredHost} (already reachable, adapter untouched)`
    : confirmedHost
      ? `${confirmedHost} (confirmed by direct probe)`
      : result.leaseAcquired
        ? `${result.discoveredHost} (DHCP lease, unconfirmed)`
        : `NOT FOUND — will try the known addresses (${candidates.join(" / ")})`}`);
  log(`PC addresses — added: ${added.length ? added.join(", ") : "none (all already present)"}`
    + (restored.length ? ` · restored: ${restored.join(", ")}` : ""));
  if (result.persistence?.persisted === false) {
    log(`WARNING: addresses are NOT persistent — ${result.persistence.reason}`);
  }
  if (result.warnings?.length) result.warnings.forEach((w) => log(`note: ${w}`));

  // 4) Bulunan adresi --host olarak asil araca devret.
  const host = explicitHost || confirmedHost
    || (result.leaseAcquired || result.directHit ? result.discoveredHost : DEFAULT_HOST);
  const hostSource = explicitHost ? "explicit --host"
    : result.directHit ? "direct check"
      : confirmedHost ? "confirmed by direct probe"
        : result.leaseAcquired ? "DHCP lease (unconfirmed)" : "fallback default";
  log(`using host ${host} (${hostSource})`);

  const noProvision = argv.includes("--no-provision");
  const forwardArgs = argv.filter((a) => a !== "--no-provision");
  if (!explicitHost) forwardArgs.push("--host", host);

  if (noProvision) {
    log("--no-provision given, stopping after network setup.");
    process.exit(0);
  }

  const child = spawnSync(process.execPath,
    [path.join(repoRoot, "bin", "ricon.js"), "provision", ...forwardArgs],
    { stdio: "inherit", cwd: repoRoot });
  process.exit(child.status ?? 1);
}

main().catch((e) => {
  log(`unexpected error: ${e?.stack || e}`);
  process.exit(1);
});
