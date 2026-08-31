#!/usr/bin/env node
// Ricon S9922M44 — INCE CLI sarmalayici. Cekirdek is src/index.js'te;
// bu dosya sadece: argv ayristir + .env oku + index'i cagir + yazdir.
// Ayni cekirdek HTTP endpoint / npm paketi olarak da tuketilebilir.
//
// KOMUT LISTESI BURADA TEKRARLANMIYOR — tek kaynak asagidaki HELP sabiti.
// Bu blok bir donem komutlari da sayiyordu ve on besten SEKIZINI listeliyordu;
// yardim metni ile ayri ayri guncellenmesi gereken iki liste, birbirinden
// sessizce ayrisiyordu. Gormek icin:  node bin/ricon.js --help
//
// Sozlesme: stdout HER ZAMAN saf JSON; ilerleme/ozet stderr'a; cikis kodu ok'tan.

import { writeFileSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import {
  checkDevice, readDevice, readConsole, computeNvramDiff, DEFAULT_HOST, findSourceIp,
  applyProvisioning, PROFILES, provisionModem, provisionLoop, pcPreflight, readSim,
  normalizePhone, summarizeMetrics, assessDevice, watchAssessment,
  readMsisdn, readSimLock, disableSimPin,
  enableSimPin, atCommand, parseClck,
} from "../src/index.js";
import * as core from "../src/index.js";
// Cikti/cagirma tesisati: bunlar TUKETICI API'si degil, CLI'in kendi araclari
// — index.js'i CLI ayrintisiyla doldurmamak icin dogrudan aliniyor. bin/ zaten
// paketin ICINDE; disaridan import eden biri yalnizca index.js'i gorur.
import {
  writeJson, summaryText, planRows, planText, callByName, parseArgv,
} from "../src/report.js";
import { isOk } from "../src/problems.js";

const argv = process.argv.slice(2);
const command = argv[0];
// TEK AYRISTIRICI. Argv bir kez ayristirilir; her komut ayni tablodan gecer.
//
// Eskiden iki ayristirici vardi: `calistir` parseArgv+FLAG_TO_OPTION
// kullaniyordu, diger on dort komut ise kendi `flag("--xxx")` sabitleriyle
// argv'ye dogrudan bakiyordu. Yani "kopru" adini tasiyan tablo yuzeyin
// ondorttebirini kapsiyordu ve bir bayrak adi degistiginde geri kalan
// on dort komutta hicbir sey kirmizi yanmiyordu.
//
// `bare`: bayrak olmayan konumsal sozcukler (`diff A.json B.json`).
const { flags, positionals, bare } = parseArgv(argv.slice(1));
const progress = (m) => process.stderr.write(`[${command}] ${m}\n`);

// v0.2.0'da yeniden adlandirilan .env degiskenleri. Eski ad hala OKUNUR:
// tezgahtaki ve teknisyenlerdeki .env dosyalari repo ile birlikte
// guncellenmiyor (gitignore'da, herkesin kendi makinesinde). Sessizce
// calismamak icin bir kez uyariyoruz.
const ENV_FALLBACK = Object.freeze({
  MODEM_USER: "MODEM_KULLANICI",
  MODEM_PASSWORD: "MODEM_SIFRE",
  MODEM_SOURCE_IP: "MODEM_KAYNAK_IP",
});
const envWarned = new Set();
function envVar(name) {
  const value = process.env[name];
  if (value !== undefined && value !== "") return value;
  const old = ENV_FALLBACK[name];
  const legacy = old ? process.env[old] : undefined;
  if (legacy !== undefined && legacy !== "" && !envWarned.has(old)) {
    envWarned.add(old);
    process.stderr.write(`[env] ${old} is deprecated, rename it to ${name} in .env\n`);
  }
  return legacy;
}

// .env -> opts. Cekirdek (src/) process.env OKUMAZ; okuma burada.
function optionsFromEnv() {
  // --host / --kaynak-ip .env'i EZER: modem o an nerede oldugunu soyleyebilmek
  // gerekir (fabrika 192.168.1.1 <-> saha 5.5.5.1 arasinda gidip gelirken).
  const hostFlag = flags.host;
  const host = (hostFlag || process.env.MODEM_HOST || "").trim() || DEFAULT_HOST;
  const prefix = host.split(".").slice(0, 3).join(".") + ".";
  // --host verildiyse .env'deki KAYNAK_IP baska alt aga ait olabilir; yok say
  // ve dogru kaynagi onekten bul (yanlis arayuzden cikip cihazi kaybetmeyelim).
  const sourcePick = flags.sourceIp || (hostFlag ? "" : envVar("MODEM_SOURCE_IP"));
  const sourceIp = (sourcePick || "").trim() || findSourceIp(prefix) || undefined;
  const user = (envVar("MODEM_USER") || "").trim();
  const password = envVar("MODEM_PASSWORD") || "";
  const credentials = user ? { user, password } : null;
  return { host, sourceIp, credentials, progress };
}

// --- Hazirlama kaydi (JSONL) ---
// Kalici rollout defteri: her hazirlanan modem icin BIR satir. Cekirdek
// dosyaya yazmaz; yazma karari burada. Dosya `data/` altinda ve .gitignore'da
// — icinde telefon/ICCID/IMEI (kisisel/abonelik verisi) var, commit EDILMEZ.
const LEDGER_FILE = "data/provisioned.jsonl";
// Sure olcumleri ayri dosyada: defter "hangi modem sahaya cikti" sorusunun
// kaydi, olcum dosyasi "surec ne kadar suruyor" sorusunun kaydi. Karistirmak
// ikisini de bulaniklastirir.
const METRICS_FILE = "data/metrics.jsonl";
// v0.2.0 oncesi adlar. data/ gitignore'da, yani her makinede AYRI duruyor ve
// repo guncellemesiyle yeniden adlandirilmiyor. Yeni ad yoksa eskisini oku:
// yoksa 23 satirlik olcum tabani bir surum atlamasinda sessizce sifirlanirdi.
const LEGACY_FILES = Object.freeze({
  "data/provisioned.jsonl": "data/hazirlanan.jsonl",
  "data/metrics.jsonl": "data/olcumler.jsonl",
});

// JSONL oku. Yeni ad yoksa v0.2.0 oncesi adi dener (bkz. LEGACY_FILES).
function readJsonl(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    const old = LEGACY_FILES[file];
    if (!old) throw e;
    text = readFileSync(old, "utf8");
    process.stderr.write(`[data] reading ${old}; rename it to ${file}\n`);
  }
  return text.split("\n").filter((s) => s.trim()).map((s) => JSON.parse(s));
}

function lineWriter(file, label = "record") {
  return (line) => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, JSON.stringify(line) + "\n", "utf8");
      const extra = line.totalSec != null ? `${line.totalSec} s` : (line.iccid || "");
      process.stderr.write(`[${label}] ${file} <- ${line.status} `
        + `${line.phone || "—"} ${extra}\n`);
    } catch (e) {
      process.stderr.write(`[${label}] COULD NOT WRITE (${file}): ${e.message}\n`);
    }
  };
}

// Operatorun numarayi girerken gecirdigi sure — INSANIN MESGUL OLDUGU TEK AN.
// Olcum ozetinin en anlamli sayisi bu (gerisi gozetimsiz geciyor), o yuzden
// ayri tutuluyor. Satir yazilinca sifirlanir: her modem kendi suresini alsin.
let entrySeconds = null;

// Telefon numarasini sorar (stderr'a; stdout saf JSON kalir). Gecerli olana
// kadar ya da bos girise kadar sorar. Doner: 5xxxxxxxxx | null
function askPhone(index) {
  // Etkilesimli degilsek (boru/servis/cron) SORMA — cekirdek MSISDN_REQUIRED
  // der ve is duzgun basarisiz olur; kapanmis stdin'de beklemek kilitlenmedir.
  if (!process.stdin.isTTY) {
    process.stderr.write("[provision] no interactive terminal: --phone is required\n");
    return Promise.resolve(null);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const ask = (question) => new Promise((c) => rl.question(question, c));
  const startedAt = Date.now();
  return (async () => {
    try {
      for (let i = 0; i < 3; i += 1) {
        const raw = (await ask(`\n[modem ${index}] SIM phone number (05xxxxxxxxx): `)).trim();
        if (!raw) break;
        const n = normalizePhone(raw);
        if (n) return n;
        process.stderr.write("  invalid — a TR mobile number is expected (05xxxxxxxxx / +905xxxxxxxxx)\n");
      }
      return null;
    } finally {
      rl.close();
      entrySeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
    }
  })();
}

// SIM PIN kilitliyse operatore PIN sorar. Cekirdek (provisionModem) kilidi
// gorunce burayi cagirir; kaldirma isini de kendisi yapar.
//
// NEDEN NUMARA DEGIL PIN SORULUYOR: kilitli SIM abone verisini acmaz, yani
// AT+CNUM bos doner. Numarayi elle yazdirmak kilidi cozmez — bir sonraki
// cihazda ayni sorun. Kilidi SIM'den kaldirinca numara zaten kendiliginden
// gelir ve SIM her cihazda acik acilir. Arayuzun akisi da buydu.
//
// PIN EKRANA YAZILMAZ, hicbir yere kaydedilmez; yalnizca cekirdege gecer.
function askPin({ pinRemaining, pinTotal }) {
  if (!process.stdin.isTTY) {
    process.stderr.write("[provision] the SIM is PIN locked but there is no interactive terminal\n");
    return Promise.resolve(null);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const ask = (question) => new Promise((c) => rl.question(question, c));
  return (async () => {
    try {
      const total = pinTotal ?? 3;
      process.stderr.write(
        `\n  SIM IS PIN LOCKED — attempts left: ${pinRemaining ?? "?"}/${total}\n`
        + (pinRemaining != null && pinRemaining < total
          ? "  ! An attempt was already burnt. BE SURE of the PIN.\n" : "")
        + "  A SINGLE attempt is made; the lock is removed PERMANENTLY.\n"
        + "  Leave it empty and press Enter to skip.\n");
      const raw = (await ask("  SIM PIN (4-8 digits): ")).trim();
      if (!raw) return null;
      if (!/^\d{4,8}$/.test(raw)) {
        // Bicim kontrolu cekirdekte de var (disableSimPin cihaza HIC gitmez),
        // ama burada durmak operatore aninda soyluyor ve bir tur kazandiriyor.
        process.stderr.write("  invalid format — 4-8 digits expected, skipping\n");
        return null;
      }
      return raw;
    } finally {
      rl.close();
    }
  })();
}

// ADIM ADLARI ARTIK YAPILANDIRILMIS: {step, count}.
//
// Eskiden serbest metin etiketti ve ayar sayisini ICINE gomuyordu
// ("yazma bitti — 12 ayar"). stepSummary kovayi etikete gore actigi icin TEK
// mantiksal adim ALTI kovaya bolunuyordu: 23 satirlik gercek defterde 16
// kovanin 10'u ayni yazma adimiydi ve medyan karsilastirmasi anlamini
// yitirmisti. Sayi artik ayri bir alanda (`count`), kova `step`e gore.
//
// Tarihsel satirlarin Turkce etiketleri KAYBOLMUYOR: src/legacy.js onlari
// ayni kanonik adima indiriyor, iki donem ayni kovada bulusuyor.
const STEP = Object.freeze({
  detected: "detected",
  identity: "identity",
  plan: "plan",
  reboot: "reboot",
  verified: "verified",
  internet: "internet",
});

// Cekirdegin olay akisini TERMINALE cevirir ve adim surelerini olcer.
//
// Iki isi birden yapiyor cunku ikisi de ayni akisi dinliyor:
//   1) `plan` olayinda ONCE -> SONRA tablosunu basar. Teknisyen ham nvram
//      anahtari gormez; ad/sayfa/deger sozlukten gelir (planRows).
//   2) Olaylar arasi gecen sureyi toplar -> data/olcumler.jsonl'in `adimlar`
//      alani. Etiketler SABIT tutulur, yoksa metrics.js'in kovalari dagilir.
//
// Doner: `event` dinleyicisi; uzerinde .steps() ile kirilim alinir.
function streamWatcher() {
  const steps = [];
  // Ilk olaya kadar gecen sure de bir adimdir (modem aranmasi/algilanmasi);
  // adsiz baslarsak o sure sessizce kaybolurdu.
  let last = { step: STEP.detected };
  let lastAt = Date.now();
  const stamp = (next) => {
    const nowMs = Date.now();
    if (last) {
      steps.push({ ...last, durationSec: Number(((nowMs - lastAt) / 1000).toFixed(1)) });
    }
    last = next;
    lastAt = nowMs;
  };

  const event = (o) => {
    switch (o.kind) {
      // Yeni cihaz/deneme basladi: onceki kirilimi at, sifirdan olc. Dongude
      // her modem KENDI adim surelerini alsin diye gerekli.
      case "detected":
        steps.length = 0;
        last = { step: STEP.detected };
        lastAt = Date.now();
        break;
      case "identity": stamp({ step: STEP.identity }); break;
      case "plan":
        stamp({ step: STEP.plan });
        // Arayuzdeki iki panelin (once/sonra) terminal karsiligi: ham nvram
        // anahtari degil, sozlukten gelen ad/sayfa/deger.
        process.stderr.write("\n  PLAN — once -> sonra (* = degisecek)\n"
          + planText(planRows(o.planObj)) + "\n\n");
        break;
      case "writing": stamp({ step: "write_start", count: o.keys?.length ?? 0 }); break;
      case "written": stamp({ step: "write_done", count: o.keys?.length ?? 0 }); break;
      case "reboot": stamp({ step: STEP.reboot }); break;
      case "verified": stamp({ step: STEP.verified }); break;
      case "internet": stamp(o.up ? { step: STEP.internet } : null); break;
      case "done":
      case "result": stamp(null); break;
      default: break;
    }
  };
  event.steps = () => { stamp(null); return steps; };
  return event;
}

// provisionModem sonucunu OLCUM satirina cevirir (data/olcumler.jsonl).
// Sema: src/report/metrics.js — summarizeMetrics'in bekledigi alanlar.
//
// Bu is neden CEKIRDEKTE DEGIL: olcum bir rapor kaygisi, provizyonun degil.
// Cekirdek yalnizca `totalSec`'i bildiriyor; satiri kuran, dosyaya yazan ve
// "bu kosuyu kaydet" diyen tuketici.
function metricsRow(r, steps) {
  const k = r.record || {};
  const line = {
    timestamp: new Date().toISOString(),
    // "run" — kanonik yazim. Eski satirlarda tur:"kurulum" var; src/legacy.js
    // ikisini ayni kovaya indiriyor, tarihsel taban korunuyor.
    kind: "run",
    source: "cli",
    status: r.status ?? null,
    ok: Boolean(r.ok),
    attempt: r.attempt ?? 1,
    lan_mac: k.lan_mac ?? null,
    iccid: k.iccid ?? null,
    phone: k.phone ?? null,
    totalSec: r.totalSec ?? null,
    entrySec: entrySeconds,
    steps,
  };
  entrySeconds = null;   // sonraki modem kendi suresini olcsun
  return line;
}

// Tek modem: hazirla + olcum satirini yaz. Dongude ayni isi cekirdegin
// metricsRecord geri cagrisi yapiyor (her modemden sonra).
async function provisionAndMeasure(provisionOptions, extra, writeMetrics) {
  const r = await provisionModem({ ...provisionOptions, ...extra });
  writeMetrics(metricsRow(r, provisionOptions.event?.steps?.() ?? []));
  return r;
}

// Cekirdek cagrisinin sonucuna `ok`'u PROBLEMLERDEN turetir. Bazi salt-okuma
// fonksiyonlari (readMsisdn/readSimLock) `ok` alani DONDURMUYOR: kismi sonuc
// da gecerli bir sonuc. Ama CLI sozlesmesi "cikis kodu ok'tan" diyor, yani
// burada hesaplanmali. Sabit `ok: true` yazmak, erisilemeyen bir modemde
// kabuga 0 dondurup betikleri yaniltiyordu.
async function withDerivedOk(promise) {
  const r = await promise;
  return { ...r, ok: r.ok ?? isOk(r.problems ?? []) };
}

// nvram JSON dosyasindan nvram nesnesini alir ({nvram:{...}} ya da ham {...}).
function nvramFromFile(file) {
  const j = JSON.parse(readFileSync(file, "utf8"));
  return j.nvram || j;
}

async function runCommand() {
  const opts = optionsFromEnv();
  switch (command) {
    case "verify": return checkDevice(opts);
    case "read": return readDevice(opts);
    case "console": return readConsole({ ...opts, nvram: flags.nvram === true });
    case "sim": return readSim({ ...opts, phone: flags.phone });
    // Cihazin O ANKI durumu + ne eksik. Sunucudaki /api/degerlendir ile AYNI
    // cekirdek cagrisi — endpoint bir tuketici, burasi digeri.
    case "assess": {
      const assessOptions = {
        ...opts,
        factoryHost: flags.host || undefined,
        fieldHost: flags.fieldHost || undefined,
        phone: flags.phone || null,
        pin: flags.pin || null,
      };
      // --izle: cekirdek KENDI KENDINE tekrar bakar. Ne zaman tekrar
      // bakilacagina retryDecision karar veriyor — burada politika YOK.
      // Ayni yetenegi arayuz de kullaniyor; kural: her yetenek her tuketiciden.
      if (flags.watch !== true) return assessDevice(assessOptions);
      return watchAssessment({
        ...assessOptions,
        maxRounds: Number(flags.maxRounds) || Infinity,
        event: (o) => progress(`modem=${o.modem.location ?? "none"}`
          + ` phone=${o.phone.number ?? "-"} missing=[${o.missing}]`
          + ` retry=${o.retry.retry ? `${o.retry.afterSec} s (${o.retry.reason})` : "no"}`),
      });
    }
    // SADECE telefon numarasi. "Bu araci sadece numara okumak icin kullanmak
    // istiyorum" diyen icin tek komut; provizyon/degerlendirme gerekmez.
    case "msisdn": return { timestamp: new Date().toISOString(), command: "msisdn",
      modemIp: opts.host, ...(await withDerivedOk(readMsisdn(opts))) };
    // SADECE SIM kilidi (salt okunur): durum + KALAN HAK. Hicbir sey harcamaz.
    case "sim-lock": return { timestamp: new Date().toISOString(), command: "sim-lock",
      modemIp: opts.host, ...(await withDerivedOk(readSimLock(opts))) };
    // SIM PIN kilidini KALICI kaldir. `uygula` ile ayni sozlesme: bayraksiz
    // KURU calisir (yalniz durumu bildirir), gercek deneme --uygula ister.
    // Sebep: yanlis PIN bir hak yakar, uc yanlis PUK demek.
    case "sim-pin-disable": {
      const pin = flags.pin;
      const real = flags.apply === true;
      if (!real) {
        const k = await withDerivedOk(readSimLock(opts));
        const removeLockOpen = k.atPort
          ? parseClck((await atCommand({ ...opts, atPort: k.atPort }, 'AT+CLCK="SC",2')).answer)
          : null;
        return { timestamp: new Date().toISOString(), command: "sim-pin-disable",
          dryRun: true, modemIp: opts.host, ...k, lockOpen: removeLockOpen,
          todo: k.lock === "pin"
            ? "the PIN lock will be removed (SINGLE attempt) — add --apply to confirm"
            : removeLockOpen === false
              ? "the PIN lock is ALREADY OFF — nothing to do"
              : k.ready ? "the SIM is open; --apply turns the lock query off PERMANENTLY"
              : `lock state: ${k.status} — not touched`,
        };
      }
      // --zorla: "bu SIM'de daha once bir hak yanmis ama PIN'den eminim".
      // SON hakki zorla bile yakamaz (karar cekirdekte).
      return { timestamp: new Date().toISOString(), command: "sim-pin-disable",
        dryRun: false, modemIp: opts.host,
        ...(await disableSimPin(opts, pin, { manualConsent: flags.manualConsent === true })) };
    }
    // SADECE TEST ICIN: PIN kilidini ACAR. Uretim akisinda yeri yok — kilit
    // KALDIRMA yolunu gercek bir kilitli SIM'de sinamak icin var. Ayni
    // sozlesme: bayraksiz KURU, gercek deneme --uygula ister.
    case "sim-pin-enable": {
      const pin = flags.pin;
      if (flags.apply !== true) {
        const k = await withDerivedOk(readSimLock(opts));
        // Kilit ZATEN acik mi? Sorgu (AT+CLCK="SC",2) hak HARCAMAZ. Bunu
        // sormadan "ACILACAK" demek yaniltiyordu: kilit acikken de ayni
        // cumle yaziliyordu (2026-08-28 canli goruldu).
        const isOpen = k.atPort
          ? parseClck((await atCommand({ ...opts, atPort: k.atPort }, 'AT+CLCK="SC",2')).answer)
          : null;
        return { timestamp: new Date().toISOString(), command: "sim-pin-enable",
          dryRun: true, modemIp: opts.host, ...k, lockOpen: isOpen,
          todo: k.lock === "pin"
            ? "the SIM is already locked — nothing to do"
            : isOpen === true
              ? "the PIN lock is ALREADY ON — nothing to do (takes effect on next power-up)"
              : k.ready ? "the PIN lock WILL BE TURNED ON (SINGLE attempt). Effect on NEXT POWER-UP:"
                + " power cycle the modem and it will ask for the SIM PIN. Add --apply to confirm"
                : `lock state: ${k.status} — not touched`,
        };
      }
      return { timestamp: new Date().toISOString(), command: "sim-pin-enable",
        dryRun: false, modemIp: opts.host,
        ...(await enableSimPin(opts, pin, { manualConsent: flags.manualConsent === true })) };
    }
    case "diff": {
      const [before, after] = bare;
      if (!before || !after) {
        return { timestamp: new Date().toISOString(), command: "diff", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: "diff <before.json> <after.json> is required",
            check: "Give two nvram JSON files." }] };
      }
      return computeNvramDiff(nvramFromFile(before), nvramFromFile(after));
    }
    case "apply": {
      const profileName = flags.profile || "field";
      const profile = PROFILES[profileName];
      if (!profile) {
        return { timestamp: new Date().toISOString(), command: "apply", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: `Unknown profile: ${profileName}`,
            check: `Valid: ${Object.keys(PROFILES).join(", ")}` }] };
      }
      return applyProvisioning({
        ...opts,
        apply: flags.apply === true,   // yoksa DRY-RUN (kuru)
        reboot: flags.noReboot !== true,
        newHost: flags.newHost,
        newSourceIp: flags.newSourceIp,
        event: streamWatcher(),
      }, profile);
    }
    case "metrics-manual": {
      // ELLE surecin kronometre sonucunu kaydeder — otomatik olcumlerle AYNI
      // dosyaya, tur:"elle" ile. Karsilastirma tabani boylece kayitli bir
      // olcum olur; komut satirinda tasinan bir sayi degil.
      const dk = Number(flags.minutes);
      const secFlag = Number(flags.seconds);
      const totalSeconds = Number.isFinite(secFlag) && secFlag > 0
        ? secFlag
        : (Number.isFinite(dk) && dk > 0 ? Math.round(dk * 60) : null);
      if (!totalSeconds) {
        return { timestamp: new Date().toISOString(), command: "metrics-manual", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: "Manual duration is required.",
            check: "Give it as --dk 15.5 (minutes) or --sn 930 (seconds)." }] };
      }
      const line = {
        timestamp: new Date().toISOString(),
        kind: "manual",   // eski satirlarda tur:"elle" — okuma ikisini de kabul eder
        status: "manual_run",
        ok: true,
        totalSec: totalSeconds,
        who: flags.who || null,
        note: flags.note || null,
        // --beyan: bu sayi OLCULMEDI, soylendi. Rapor bunu BEYAN diye
        // etiketler; olculmus bir medyan gibi sunulmaz.
        declared: flags.declared === true,
      };
      lineWriter(flags.record || METRICS_FILE, "metrics-manual")(line);
      return { ...line, command: "metrics-manual", problems: [] };
    }
    case "metrics": {
      // Kaydedilmis calistirmalardan savunulabilir sayi uretir. Cihaza GITMEZ.
      // --elle-dk: elle surecin suresi (KARSILASTIRMA TABANI). Bu bir olcum ya
      // da beyandir; hangisi oldugunu --elle-kaynak ile ACIKCA soyle.
      const file = flags.record || METRICS_FILE;
      let lines = [];
      try {
        lines = readJsonl(file);
      } catch {
        return { timestamp: new Date().toISOString(), command: "metrics", ok: false,
          problems: [{ code: "METRICS_FILE_MISSING", severity: "error",
            message: `Metric file not found or unreadable: ${file}`,
            check: "Run `npm start` (or `ricon provision`) a few times first;"
              + " each finished run appends one line." }] };
      }
      const manualMin = Number(flags.manualMinutes);
      return summarizeMetrics(lines, {
        manualSec: Number.isFinite(manualMin) && manualMin > 0 ? manualMin * 60 : undefined,
        manualSource: flags.manualSource,
        manualN: Number(flags.manualN) || undefined,
        modemCount: Number(flags.modemCount) || undefined,
      });
    }
    // Cekirdegin HERHANGI bir export'unu adiyla cagirir. Yeni bir yetenek
    // eklendiginde buraya `case` yazmak GEREKMEZ — src/index.js'e eklenen her
    // sey aninda terminalden erisilebilir olur. Karar/ayristirma saf ve
    // test edilebilir: src/cli/cagirici.js.
    case "call": {
      const name = bare[0] ?? null;
      // opts'a karismayan CLI bayraklari: fonksiyona gitmemeli.
      const { pure, json, fromFile, ...fnFlags } = flags;
      delete fnFlags.host; delete fnFlags.sourceIp;
      return callByName(core, name, {
        opts: { host: opts.host, sourceIp: opts.sourceIp, credentials: opts.credentials,
          progress },
        flags: fnFlags,
        positionals,
        pure: pure === true,
      });
    }
    case "provision": {
      const profileName = flags.profile || "field";
      const profile = PROFILES[profileName];
      if (!profile) {
        return { timestamp: new Date().toISOString(), command: "provision", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: `Unknown profile: ${profileName}`, check: `Valid: ${Object.keys(PROFILES).join(", ")}` }] };
      }
      const fieldHost = flags.fieldHost || profile.nvram.lan_ipaddr || "5.5.5.1";
      const prefix = (ip) => ip.split(".").slice(0, 3).join(".") + ".";
      // Fabrika oneki .env'deki MODEM_HOST'tan turer (varsayilan 192.168.1.1);
      // boylece host degistirilince on-kontrol de dogru alt agi arar.
      const on = pcPreflight(prefix(opts.host), prefix(fieldHost));
      if (!on.ready) {
        return { timestamp: new Date().toISOString(), command: "provision", ok: false,
          status: "pc_not_ready", problems: on.problems };
      }
      const provisionOptions = {
        factoryHost: opts.host, factorySource: on.factorySource,
        fieldHost, fieldSource: on.fieldSource,
        credentials: opts.credentials, profile,
        attempts: Number(flags.attempts) || 3,
        // Internet dogrulamasi (SIM calisiyor mu). 0 = kapat.
        internetWaitSec: flags.internetWaitSec !== undefined
          ? Number(flags.internetWaitSec) : 150,
        record: lineWriter(flags.record || LEDGER_FILE),
        askPhone,          // dongu: her modem icin sorar
        askPin,            // SIM kilitliyse PIN sorar, cekirdek kaldirir
        progress,
        event: streamWatcher(),   // plan tablosu + adim sureleri
      };
      const writeMetrics = lineWriter(flags.metrics || METRICS_FILE, "metrics");
      const cycle = flags.loop === true;
      if (cycle) {
        // Sabit --telefon dongude ANLAMSIZ (her cihazin SIM'i farkli);
        // numara her modemde o modemin SIM'inden okunuyor.
        return provisionLoop({
          ...provisionOptions,
          metricsRecord: (r) => writeMetrics(metricsRow(r, provisionOptions.event.steps())),
          maxModems: Number(flags.maxModems) || Infinity,
        });
      }
      // Tek modem: --telefon VERMEK ARTIK ZORUNLU DEGIL. Cekirdek numarayi
      // SIM'den okuyor (AT+CNUM); okuyamazsa askPhone ile burayi cagirip
      // operatore soruyor. Verilirse operator bilerek eziyor; gecersizse
      // cekirdek MSISDN_INVALID der (sessizce yeniden sormaz).
      return provisionAndMeasure(provisionOptions, { phone: flags.phone }, writeMetrics);
    }
    default: return null;
  }
}

const COMMANDS = new Set(["verify", "read", "console", "sim",
  "assess", "msisdn", "sim-lock", "sim-pin-disable", "sim-pin-enable",
  "diff", "apply", "provision", "call", "metrics", "metrics-manual"]);

// v0.2.0'da yeniden adlandirilan komutlar. Takma ad DEGIL: eski adi yazana
// dogrusunu soyleyip 1 ile cikiyoruz. Sessizce calistirmak, tezgahtaki
// ezberin yanlis kalmasini uzatirdi.
const RENAMED_IN_0_2_0 = Object.freeze({
  dogrula: "verify", oku: "read", konsol: "console", degerlendir: "assess",
  numara: "msisdn", "sim-kilit": "sim-lock",
  "sim-pin-kaldir": "sim-pin-disable", "sim-pin-kilitle": "sim-pin-enable",
  fark: "diff", uygula: "apply", hazirla: "provision", calistir: "call",
  olcum: "metrics", "olcum-elle": "metrics-manual",
});

const HELP = "Usage: node --env-file=.env bin/ricon.js <command>   (or: npm start / npm run <script>) [flags]\n\n"
  + "  verify                       environment / reachability diagnosis\n"
  + "  read                         pull EVERYTHING (system + SIM + settings + nvram)\n"
  + "  console [--nvram]            telnet root shell / full nvram\n"
  + "  sim [--phone 05xxxxxxxxx]    SIM / cellular summary (+MSISDN input)\n"
  + "  assess                       device state + WHAT IS MISSING (phone included, ~5 s)\n"
  + "         [--watch] [--rounds N]  keep re-checking BY ITSELF until nothing is missing\n"
  + "  msisdn                       the SIM phone number ONLY (AT+CNUM)\n"
  + "  sim-lock                     lock state + ATTEMPTS LEFT only (burns nothing)\n"
  + "  sim-pin-disable --pin 1234   remove the SIM PIN lock PERMANENTLY\n"
  + "         [--apply]             without it DRY: reports the state only\n"
  + "         [--force]             try even on a SIM with a burnt attempt (if sure)\n"
  + "  sim-pin-enable --pin 1234    TEST ONLY: turn the PIN lock ON (make a locked SIM)\n"
  + "         [--apply]             without it DRY; takes effect on next power-up\n"
  + "  diff <A.json> <B.json>       diff two nvram snapshots\n"
  + "  apply [--apply]              provisioning (DRY/dry-run without the flag)\n"
  + "         [--profile field|factory] [--new-host ip] [--new-source-ip ip]\n"
  + "         [--no-reboot]\n"
  + "  provision                    plug-and-go: detect -> provision -> verify\n"
  + "         [--phone 05xx]        number is read from the SIM; this flag OVERRIDES\n"
  + "         [--loop]              many modems: plug -> ready -> unplug -> next\n"
  + "         [--profile name] [--field-host ip] [--attempts N] [--max N]\n"
  + "         [--internet-wait N]   internet check seconds (0 = off, default 150)\n"
  + "         [--record <file>]     provisioning ledger (data/provisioned.jsonl)\n"
  + "         [--metrics <file>]    timing ledger (data/metrics.jsonl)\n"
  + "  call [<function>]            call ANY function of the core by name\n"
  + "         (no name)             lists the whole callable surface\n"
  + "         [-- arg1 arg2]        positional arguments after `--`\n"
  + "         [--pure]              turn off opts injection\n"
  + "  metrics-manual --minutes 15.5  record a stopwatch reading of the MANUAL process\n"
  + "         [--seconds 930] [--who \"technician A\"] [--note \"...\"]\n"
  + "         [--declared]          this number was STATED, not measured\n"
  + "  metrics                      summary from recorded durations (no device)\n"
  + "         [--modem-count 400] [--record data/metrics.jsonl]\n"
  + "         [--manual-minutes 15] only if no manual measurement is recorded\n"
  + "         [--manual-source \"...\"] [--manual-n N]\n\n"
  + "Common: --json <file> (save output) · --from-file <file> (replay a saved report)\n"
  + "        --host <ip> · --source-ip <ip>  (overrides .env; wherever the modem is now)\n"
  + "Env:    MODEM_HOST, MODEM_USER, MODEM_PASSWORD, MODEM_SOURCE_IP\n"
  + "Contract: stdout is ALWAYS pure JSON; progress/summary go to stderr; exit code from ok.\n";

async function main() {
  const helpAsked = !command || command === "-h" || command === "--help";
  if (helpAsked) { process.stderr.write(HELP); return 0; }
  if (!COMMANDS.has(command)) {
    // Eski Turkce adi yazdiysa DOGRUSUNU soyle. Sessiz bir "unknown command"
    // teknisyeni yazim hatasi aramaya gonderirdi; sorun yazim degil, surum.
    const renamed = RENAMED_IN_0_2_0[command];
    process.stderr.write(`unknown command: ${command}\n`);
    if (renamed) {
      process.stderr.write(`  did you mean: ${renamed}\n\n`
        + "renamed in v0.2.0:\n"
        + Object.entries(RENAMED_IN_0_2_0)
          .map(([o, n]) => `  ${o.padEnd(16)} -> ${n}\n`).join("")
        + "  --dongu          -> --loop\n"
        + "  --profil         -> --profile\n"
        + "  --telefon        -> --phone\n"
        + "  --uygula         -> --apply\n"
        + "  --zorla          -> --force\n"
        + "  --kaynak-ip      -> --source-ip\n"
        + "  --kaynak         -> --from-file\n\n");
    }
    process.stderr.write(HELP);
    return 1;
  }

  const source = flags.fromFile;
  const report = source
    ? JSON.parse(readFileSync(source, "utf8"))
    : await runCommand();

  const jsonText = writeJson(report);
  process.stdout.write(jsonText + "\n");
  process.stderr.write("\n" + summaryText(report) + "\n");

  const out = flags.json;
  if (out) {
    writeFileSync(out, jsonText, "utf8");
    process.stderr.write(`\nJSON written: ${out}\n`);
  }
  return report.ok ? 0 : 1;
}

main().then((code) => { if (code !== null) process.exit(code); }).catch((e) => {
  process.stderr.write(`Unexpected error: ${e?.stack || e}\n`);
  process.exit(1);
});
