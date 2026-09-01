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
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_HOST, findSourceIp, isReachable } from "../src/index.js";
// `problem`/`problemText` dogrudan problems.js'den: index.js'in genel
// API'si degil, bin/ricon.js'in de yaptigi gibi CLI/arac katmaninin kendi
// araci (bkz. bin/ricon.js'in ayni importu).
import { problem, problemText } from "../src/problems.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

// KALICI LOG: yukseltilmis pencere is bitince (ya da coker) hemen kapanip
// gidiyor — ekranda ne oldugunu okumaya firsat kalmiyor. Her satir aninda
// diske de yazilir ki pencere kapansa bile `data/network-setup.log`'dan
// geriye donup bakilabilsin.
const LOG_FILE = path.join(repoRoot, "data", "network-setup.log");
function log(m) {
  const line = `[network-setup] ${m}`;
  process.stderr.write(line + "\n");
  try {
    mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch { /* log yazilamiyorsa akisi durdurmaya deger degil */ }
}

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

// Bilinen fabrika adresleri: .1 = DEFAULT_HOST (birincil LAN IP), .8.1 =
// FACTORY_PROFILE.nvram.lan_ipaddr_ex1 (src/settings.js) — modemin fabrika
// durumunda zaten tasidigi IKINCI bir LAN IP, uydurma bir deger degil.
// Once bunlar dogrudan yoklanir; DHCP kesfi sadece ikisi de cevap vermezse
// devreye giren bir GUVENLIK AGI'dir (bkz. plan: tiered fast path).
const FACTORY_CANDIDATES = ["192.168.1.1", "192.168.8.1"];
const prefixOf = (ip) => ip.split(".").slice(0, 3).join(".") + ".";

// Bilgisayarda ZATEN o alt agda bir ikincil IP varsa (onceki bir
// calistirmadan kalmis olabilir) modemi doğrudan yoklar — DHCP'ye hic
// GEREK KALMAZ. Kaynak IP yoksa o adayi ATLAR (hata degil, sadece "henuz
// test edecek bir şeyimiz yok" — src/net.js'in "kaynak IP olmadan yoklama
// YAPMA" kuraliyla ayni sebep).
async function findDirectHost() {
  for (const candidate of FACTORY_CANDIDATES) {
    const sourceIp = findSourceIp(prefixOf(candidate));
    if (!sourceIp) continue;
    if (await isReachable(candidate, sourceIp)) return candidate;
  }
  return null;
}

function runPrepareScript(adapter, timeoutSec, knownHost) {
  const psPath = path.join(__dirname, "prepare-modem-network.ps1");
  const args = [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", psPath,
    "-AdapterName", adapter,
    "-DhcpTimeoutSec", String(timeoutSec),
  ];
  if (knownHost) args.push("-KnownHost", knownHost);
  // stderr'i de YAKALA (inherit degil) — pencere anlik kapansa bile
  // prepare-modem-network.ps1'in ilerleme satirlari kalici log'a yazilsin.
  const res = spawnSync("powershell.exe", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  for (const line of (res.stderr || "").split("\n")) {
    if (line.trim()) log(`ps1: ${line.trim()}`);
  }

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

// Basarisizligi OPERATOR METNIYLE bildirir — src/problems.js KATALOGUNDAN
// (bin/ricon.js'in streamWatcher/localizeProblems ile yaptigi ayni sey).
// Boylece bu betiğin ürettiği hata da projenin geri kalanıyla AYNI
// tek kaynaktan gelir, ad-hoc bir string tablosundan degil.
function reportFailure(reason, detail, adapter) {
  const p = reason === "ADAPTER_NOT_FOUND" ? problem(reason, adapter)
    : reason === "NETWORK_PREP_FAILED" ? problem(reason, detail)
    : problem(reason);
  const t = problemText(p.code);
  log(`FAILED: ${p.message}`);
  log(`${t.title} — ${t.whatToDo}`);
}

async function main() {
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

  const directHost = await findDirectHost();
  if (directHost) log(`direct check hit: modem answers at ${directHost} already — skipping the DHCP dance`);

  const result = runPrepareScript(adapter, timeoutSec, directHost);
  if (!result.ok) {
    reportFailure(result.reason, result.message, adapter);
    process.exit(1);
  }
  log(`adapter ready — ${result.directHit ? `modem found directly at ${result.discoveredHost}`
    : result.leaseAcquired ? `modem found at ${result.discoveredHost}` : "no lease, using known-convention fallback"}`);
  if (result.warnings?.length) result.warnings.forEach((w) => log(`warning: ${w}`));

  const hostIdx = argv.indexOf("--host");
  const explicitHost = hostIdx !== -1 ? argv[hostIdx + 1] : null;
  const host = explicitHost || (result.leaseAcquired || result.directHit ? result.discoveredHost : DEFAULT_HOST);
  const hostSource = explicitHost ? "explicit --host"
    : result.directHit ? "direct check" : result.leaseAcquired ? "discovered via DHCP" : "fallback default";
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
