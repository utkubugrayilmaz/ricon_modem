#!/usr/bin/env node
// npm start icin ince sarmalayici: once bilgisayarin ag ayarini hazirlar
// (prepare-modem-network.ps1 — modemin gercek IP'sini DHCP ile bulur,
// bilgisayarin eski statik IP'lerini geri yukler, gerekli ikincil IP'leri
// ekler), sonra normal provizyon akisini (bin/ricon.js provision) baslatir.
//
// Bu dosya bilerek src/ DISINDA: process.env/argv okumak, throw etmek, alt
// surec calistirmak — hepsi cekirdegin "src/ hicbirini yapmaz" sozlesmesine
// aykiri. Burasi makine hazirligi, modemle konusma degil.

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_HOST } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const log = (m) => process.stderr.write(`[network-setup] ${m}\n`);

function isElevated() {
  try {
    const out = execFileSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-Command",
      "(New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()))"
        + ".IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)",
    ], { encoding: "utf8" });
    return out.trim() === "True";
  } catch {
    return false;
  }
}

// TEK seferlik yukselme: yeni bir Yonetici penceresinde AYNI komutu yeniden
// baslatir, kendisi hemen cikar. UAC penceresi burada bir kez cikar, akisin
// ORTASINDA bir daha cikmaz (adaptor mutasyonu henuz BASLAMADI).
function relaunchElevated(argv) {
  const envFile = path.join(repoRoot, ".env");
  const args = [`--env-file-if-exists=${envFile}`, __filename, ...argv];
  const psArgs = args.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(",");
  const psCommand = `Start-Process -FilePath '${process.execPath.replace(/'/g, "''")}' `
    + `-ArgumentList @(${psArgs}) -Verb RunAs -WorkingDirectory '${repoRoot.replace(/'/g, "''")}'`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { stdio: "inherit" });
}

function runPrepareScript(adapter, timeoutSec) {
  const psPath = path.join(__dirname, "prepare-modem-network.ps1");
  const res = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", psPath,
    "-AdapterName", adapter,
    "-DhcpTimeoutSec", String(timeoutSec),
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

  if (res.error) {
    log(`could not start PowerShell: ${res.error.message}`);
    process.exit(1);
  }
  const lines = (res.stdout || "").trim().split("\n").filter(Boolean);
  const lastLine = lines[lines.length - 1];
  try {
    return JSON.parse(lastLine);
  } catch (e) {
    log(`could not parse result JSON (${e.message}); raw output:\n${res.stdout}`);
    process.exit(1);
  }
}

const FAILURE_HINTS = {
  NOT_ELEVATED: "Re-run as Administrator.",
  ADAPTER_NOT_FOUND: "Set MODEM_ADAPTER_NAME to the correct adapter name (see `Get-NetAdapter`).",
  SEQUENCE_ERROR: "Check the adapter by hand: Get-NetIPAddress -InterfaceAlias <adapter>",
};

function main() {
  if (process.platform !== "win32") {
    log("this script is Windows-only.");
    process.exit(1);
  }

  const argv = process.argv.slice(2);

  if (!isElevated()) {
    log("not elevated — relaunching as Administrator (accept the UAC prompt in the new window)...");
    relaunchElevated(argv);
    process.exit(0);
  }

  const adapter = process.env.MODEM_ADAPTER_NAME || "Ethernet";
  const timeoutSec = Number(process.env.MODEM_DHCP_TIMEOUT_SEC) || 15;

  const result = runPrepareScript(adapter, timeoutSec);
  if (!result.ok) {
    log(`FAILED (${result.reason}): ${result.message}`);
    if (FAILURE_HINTS[result.reason]) log(FAILURE_HINTS[result.reason]);
    process.exit(1);
  }
  log(`adapter ready — ${result.leaseAcquired ? `modem found at ${result.discoveredHost}` : "no lease, using known-convention fallback"}`);
  if (result.warnings?.length) result.warnings.forEach((w) => log(`warning: ${w}`));

  const hostIdx = argv.indexOf("--host");
  const explicitHost = hostIdx !== -1 ? argv[hostIdx + 1] : null;
  const host = explicitHost || (result.leaseAcquired ? result.discoveredHost : DEFAULT_HOST);
  log(`using host ${host} (${explicitHost ? "explicit --host" : result.leaseAcquired ? "discovered via DHCP" : "fallback default"})`);

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

main();
