#!/usr/bin/env node
// npm start icin ince sarmalayici: once bilgisayarin ag ayarini hazirlar
// (network-prep.js — modemin gercek IP'sini DHCP ile bulur, bilgisayarin
// eski statik IP'lerini geri yukler, gerekli ikincil IP'leri ekler), sonra
// normal provizyon akisini (bin/ricon.js provision) baslatir.
//
// Ag isinin kendisi network-prep.js'te: saf karar mantigi + platform
// ilkelleri (win32/linux) TEK dosyada. Burasi yalnizca surec isleri:
// yukselme (UAC/sudo), loglama, dogrudan yoklama, bin/ricon.js'e devir.
//
// Bu dosya bilerek src/ DISINDA: process.env/argv okumak, throw etmek, alt
// surec calistirmak — hepsi cekirdegin "src/ hicbirini yapmaz" sozlesmesine
// aykiri. Burasi makine hazirligi, modemle konusma degil.

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_HOST, findSourceIp, isReachable } from "../src/index.js";
import { prepareNetwork, isElevated } from "./network-prep.js";
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

// TEK seferlik yukselme (win32): yeni bir Yonetici penceresinde AYNI komutu
// yeniden baslatir ve BITMESINI BEKLER. UAC penceresi burada bir kez cikar,
// akisin ORTASINDA bir daha cikmaz (adaptor mutasyonu henuz BASLAMADI).
// Yukselme KONTROLU network-prep.js'te (isElevated) — platform dallanmasi
// tek dosyada dursun; yeniden BASLATMA ise surec isi, o yuzden burada.
//
// -Wait + -PassThru: yonetici penceresi is bitince kendini kapatiyor ve
// kullanici hicbir sey okuyamiyordu — asil terminal ise "calisti mi?"
// sorusuna cevapsiz kaliyordu (2026-09-02 canli geri bildirim). Artik
// bekliyoruz, cikis kodunu tasiyoruz ve cocugun log satirlarini asil
// terminale geri basiyoruz (bkz. replayLog).
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
    // UAC reddedildiyse Start-Process hata verir; cocuk basarisiz ciktiysa
    // exit kodu buraya duser. Ikisinde de kodu aynen tasi.
    return e.status ?? 1;
  }
}

// Yukseltilmis cocugun log dosyasina yazdigi satirlari asil terminale basar.
// `fromByte`: yeniden baslatmadan ONCEKI dosya boyu — yalniz yeni satirlar.
function logFileSize() {
  try { return statSync(LOG_FILE).size; } catch { return 0; }
}
function replayLog(fromByte) {
  try {
    const text = readFileSync(LOG_FILE).subarray(fromByte).toString("utf8").trimEnd();
    if (text) process.stderr.write(text + "\n");
  } catch { /* log yoksa gosterilecek bir sey de yok */ }
}

// Linux yukselmesi: sudo AYNI terminalde calisir ve bekler — Windows'un
// "yeni pencere ac, kendin cik" akisinin tersine burada cocugun cikis
// kodunu aynen tasiyoruz (kullanici tek surec goruyor).
function relaunchWithSudo(argv) {
  const envFile = path.join(repoRoot, ".env");
  const r = spawnSync("sudo",
    [process.execPath, `--env-file-if-exists=${envFile}`, __filename, ...argv],
    { stdio: "inherit", cwd: repoRoot });
  process.exit(r.status ?? 1);
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

// Platform basina varsayilan adaptor adi. Tablo ayni zamanda desteklenen
// platformlarin listesi: burada olmayan platformda acikca durulur.
const PLATFORM_DEFAULT_ADAPTER = Object.freeze({ win32: "Ethernet", linux: "eth0" });

async function main() {
  const defaultAdapter = PLATFORM_DEFAULT_ADAPTER[process.platform];
  if (!defaultAdapter) {
    log(`unsupported platform: ${process.platform} (win32 and linux only)`);
    process.exit(1);
  }

  const argv = process.argv.slice(2);

  if (!isElevated()) {
    if (process.platform === "win32") {
      log("not elevated — relaunching as Administrator (accept the UAC prompt; the result will be shown HERE when it finishes)...");
      const mark = logFileSize();
      const code = relaunchElevated(argv);
      // Yonetici penceresi kapandi; onun yazdiklarini BU terminalde goster.
      replayLog(mark);
      if (code !== 0) log(`finished with an error (exit ${code}) — details above / in ${LOG_FILE}`);
      process.exit(code);
    }
    log("not root — relaunching with sudo (you may be asked for your password)...");
    relaunchWithSudo(argv);   // cikis kodunu kendi tasir, buraya donmez
  }

  const adapter = process.env.MODEM_ADAPTER_NAME || defaultAdapter;
  const timeoutSec = Number(process.env.MODEM_DHCP_TIMEOUT_SEC) || 15;

  const directHost = await findDirectHost();
  if (directHost) log(`direct check hit: modem answers at ${directHost} already — skipping the DHCP dance`);

  const result = await prepareNetwork({
    adapter, dhcpTimeoutSec: timeoutSec, knownHost: directHost || "",
    log: (m) => log(`prep: ${m}`),
  });
  if (!result.ok) {
    reportFailure(result.reason, result.message, adapter);
    process.exit(1);
  }
  // OZET — operatorun tek bakista gormesi gereken uc sey: modem nerede,
  // makineye ne eklendi, eskiden ne geri geldi. Gerisi ayrinti.
  const added = result.secondariesAdded ?? [];
  const restored = (result.restoredAddresses ?? []).map((a) => a.ip);
  log(`network ready — modem: ${result.directHit
    ? `${result.discoveredHost} (already reachable, adapter untouched)`
    : result.leaseAcquired
      ? `${result.discoveredHost} (discovered via DHCP)`
      : "NOT FOUND — will try the known addresses (192.168.1.1 / 5.5.5.1)"}`);
  log(`PC addresses — added: ${added.length ? added.join(", ") : "none (all already present)"}`
    + (restored.length ? ` · restored: ${restored.join(", ")}` : ""));
  if (result.warnings?.length) result.warnings.forEach((w) => log(`note: ${w}`));

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
