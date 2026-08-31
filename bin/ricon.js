#!/usr/bin/env node
// Ricon S9922M44 — INCE CLI sarmalayici. Cekirdek is src/index.js'te;
// bu dosya sadece: argv ayristir + .env oku + index'i cagir + yazdir.
// Ayni cekirdek HTTP endpoint / npm paketi olarak da tuketilebilir.
//
//   node ricon.js dogrula        Ortam teshisi
//   node ricon.js oku            HER SEYI cek (sistem + SIM + ayar + nvram)
//   node ricon.js konsol         Telnet root shell kesfi (--nvram = tam nvram)
//   node ricon.js sim            SIM/hucresel ozet (--telefon 05xx = MSISDN girisi)
//   node ricon.js fark A.json B.json   Iki nvram anlik goruntusunu karsilastir
//   node ricon.js uygula         Provizyon (KURU varsayilan; gercek yazma --uygula)
//                                --profil saha|fabrika · --yeni-host · --yeni-kaynak
//                                --reboot-yok
//   node ricon.js calistir <fn>  Cekirdegin HERHANGI bir fonksiyonunu cagir
//                                adsiz cagrilirsa tum yuzeyi listeler
//   node ricon.js hazirla        Tak-calistir: algila->provizyon->dogrula
//                                Numara SIM'den okunur; --telefon 05xx EZER
//                                --dongu (cok modem: tak -> hazir -> cikar)
//                                --profil · --saha-host · --deneme N · --max N
//                                --kayit <dosya> (varsayilan data/hazirlanan.jsonl)
//
// Ortak: --json <dosya> (ciktiyi yaz) · --kaynak <dosya> (kayittan goster)
// Ortam: MODEM_HOST, MODEM_KULLANICI, MODEM_SIFRE, MODEM_KAYNAK_IP
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
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const progress = (m) => process.stderr.write(`[${command}] ${m}\n`);

// .env -> opts. Cekirdek (src/) process.env OKUMAZ; okuma burada.
function optionsFromEnv() {
  // --host / --kaynak-ip .env'i EZER: modem o an nerede oldugunu soyleyebilmek
  // gerekir (fabrika 192.168.1.1 <-> saha 5.5.5.1 arasinda gidip gelirken).
  const hostFlag = flag("--host");
  const host = (hostFlag || process.env.MODEM_HOST || "").trim() || DEFAULT_HOST;
  const prefix = host.split(".").slice(0, 3).join(".") + ".";
  // --host verildiyse .env'deki KAYNAK_IP baska alt aga ait olabilir; yok say
  // ve dogru kaynagi onekten bul (yanlis arayuzden cikip cihazi kaybetmeyelim).
  const sourcePick = flag("--kaynak-ip") || (hostFlag ? "" : process.env.MODEM_KAYNAK_IP);
  const sourceIp = (sourcePick || "").trim() || findSourceIp(prefix) || undefined;
  const user = (process.env.MODEM_KULLANICI || "").trim();
  const password = process.env.MODEM_SIFRE || "";
  const credentials = user ? { user, password } : null;
  return { host, sourceIp, credentials, progress };
}

// --- Hazirlama kaydi (JSONL) ---
// Kalici rollout defteri: her hazirlanan modem icin BIR satir. Cekirdek
// dosyaya yazmaz; yazma karari burada. Dosya `data/` altinda ve .gitignore'da
// — icinde telefon/ICCID/IMEI (kisisel/abonelik verisi) var, commit EDILMEZ.
const LEDGER_FILE = "data/hazirlanan.jsonl";
// Sure olcumleri ayri dosyada: defter "hangi modem sahaya cikti" sorusunun
// kaydi, olcum dosyasi "surec ne kadar suruyor" sorusunun kaydi. Karistirmak
// ikisini de bulaniklastirir.
const METRICS_FILE = "data/olcumler.jsonl";

function lineWriter(file, label = "kayit") {
  return (line) => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, JSON.stringify(line) + "\n", "utf8");
      const extra = line.totalSec != null ? `${line.totalSec} sn` : (line.iccid || "");
      process.stderr.write(`[${label}] ${file} <- ${line.status} `
        + `${line.phone || "—"} ${extra}\n`);
    } catch (e) {
      process.stderr.write(`[${label}] YAZILAMADI (${file}): ${e.message}\n`);
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
    process.stderr.write("[hazirla] etkilesimli terminal yok: --telefon zorunlu\n");
    return Promise.resolve(null);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const ask = (question) => new Promise((c) => rl.question(question, c));
  const startedAt = Date.now();
  return (async () => {
    try {
      for (let i = 0; i < 3; i += 1) {
        const raw = (await ask(`\n[${index}. modem] SIM telefon numarasi (05xxxxxxxxx): `)).trim();
        if (!raw) break;
        const n = normalizePhone(raw);
        if (n) return n;
        process.stderr.write("  gecersiz — TR mobil bekleniyor (05xxxxxxxxx / +905xxxxxxxxx)\n");
      }
      return null;
    } finally {
      rl.close();
      entrySeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
    }
  })();
}

// Cekirdegin olay akisini TERMINALE cevirir ve adim surelerini olcer.
//
// Iki isi birden yapiyor cunku ikisi de ayni akisi dinliyor:
//   1) `plan` olayinda ONCE -> SONRA tablosunu basar. Teknisyen ham nvram
//      anahtari gormez; ad/sayfa/deger sozlukten gelir (planRows).
//   2) Olaylar arasi gecen sureyi toplar -> data/olcumler.jsonl'in `adimlar`
//      alani. Etiketler SABIT tutulur, yoksa metrics.js'in kovalari dagilir.
//
// ADIM ETIKETLERI TARIHSEL SATIRLARLA BIREBIR AYNI. data/olcumler.jsonl'de
// 2026-08-27'den beri bu etiketler yaziyor ve stepSummary kovalari ADA gore
// topluyor. Yeni bir etiket uydurmak kovayi ikiye boler; medyan
// karsilastirmasi da o anda anlamini yitirir. Etiketler TURKCE ve OPERATORE
// gosterilen metin — dil kuralinda cevrilmeyenler tarafinda.
const ADIM = Object.freeze({
  algilandi: "modem algılandı",
  kimlik: "kimlik okundu (ICCID/IMEI)",
  plan: "ayarlar okundu (plan hazır)",
  reboot: "reboot gönderildi",
  dogrulandi: "cihaz geri geldi, doğrulandı",
  internet: "internet doğrulandı (SIM çalışıyor)",
});

// Doner: `event` dinleyicisi; uzerinde .steps() ile kirilim alinir.
function streamWatcher() {
  const steps = [];
  // Ilk olaya kadar gecen sure de bir adimdir (modem aranmasi/algilanmasi);
  // etiketsiz baslarsak o sure sessizce kaybolurdu.
  let lastName = ADIM.algilandi;
  let lastAt = Date.now();
  const stamp = (name) => {
    const nowMs = Date.now();
    if (lastName) {
      steps.push({ name: lastName, durationSec: Number(((nowMs - lastAt) / 1000).toFixed(1)) });
    }
    lastName = name;
    lastAt = nowMs;
  };

  const event = (o) => {
    switch (o.kind) {
      // Yeni cihaz/deneme basladi: onceki kirilimi at, sifirdan olc. Dongude
      // her modem KENDI adim surelerini alsin diye gerekli.
      case "algilandi":
        steps.length = 0;
        lastName = ADIM.algilandi;
        lastAt = Date.now();
        break;
      case "kimlik": stamp(ADIM.kimlik); break;
      case "plan":
        stamp(ADIM.plan);
        // Arayuzdeki iki panelin (once/sonra) terminal karsiligi: ham nvram
        // anahtari degil, sozlukten gelen ad/sayfa/deger.
        process.stderr.write("\n  PLAN — once -> sonra (* = degisecek)\n"
          + planText(planRows(o.planObj)) + "\n\n");
        break;
      case "yaziliyor": stamp(`yazma başladı — ${o.keys?.length ?? 0} ayar`); break;
      case "yazildi": stamp(`yazma bitti — ${o.keys?.length ?? 0} ayar`); break;
      case "reboot": stamp(ADIM.reboot); break;
      case "dogrulandi": stamp(ADIM.dogrulandi); break;
      case "internet": stamp(o.up ? ADIM.internet : null); break;
      case "bitti":
      case "sonuc": stamp(null); break;
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
    // "run" — INGILIZCE yazim kanonik. Eski satirlarda tur:"kurulum" var ve
    // summarizeMetrics ikisini de okuyor (bkz. TUR_ESLERI); tarihsel taban
    // korunuyor ama yeni veri tek yazimda birikiyor.
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
    case "dogrula": return checkDevice(opts);
    case "oku": return readDevice(opts);
    case "konsol": return readConsole({ ...opts, nvram: argv.includes("--nvram") });
    case "sim": return readSim({ ...opts, phone: flag("--telefon") });
    // Cihazin O ANKI durumu + ne eksik. Sunucudaki /api/degerlendir ile AYNI
    // cekirdek cagrisi — endpoint bir tuketici, burasi digeri.
    case "degerlendir": {
      const assessOptions = {
        ...opts,
        factoryHost: flag("--host") || undefined,
        fieldHost: flag("--saha-host") || undefined,
        phone: flag("--telefon") || null,
        pin: flag("--pin") || null,
      };
      // --izle: cekirdek KENDI KENDINE tekrar bakar. Ne zaman tekrar
      // bakilacagina retryDecision karar veriyor — burada politika YOK.
      // Ayni yetenegi arayuz de kullaniyor; kural: her yetenek her tuketiciden.
      if (!argv.includes("--izle")) return assessDevice(assessOptions);
      return watchAssessment({
        ...assessOptions,
        maxRounds: Number(flag("--tur")) || Infinity,
        event: (o) => progress(`modem=${o.modem.location ?? "yok"}`
          + ` telefon=${o.phone.number ?? "-"} eksik=[${o.missing}]`
          + ` tekrar=${o.retry.retry ? `${o.retry.afterSec} sn (${o.retry.reason})` : "yok"}`),
      });
    }
    // SADECE telefon numarasi. "Bu araci sadece numara okumak icin kullanmak
    // istiyorum" diyen icin tek komut; provizyon/degerlendirme gerekmez.
    case "numara": return { timestamp: new Date().toISOString(), command: "numara",
      modemIp: opts.host, ...(await withDerivedOk(readMsisdn(opts))) };
    // SADECE SIM kilidi (salt okunur): durum + KALAN HAK. Hicbir sey harcamaz.
    case "sim-kilit": return { timestamp: new Date().toISOString(), command: "sim-kilit",
      modemIp: opts.host, ...(await withDerivedOk(readSimLock(opts))) };
    // SIM PIN kilidini KALICI kaldir. `uygula` ile ayni sozlesme: bayraksiz
    // KURU calisir (yalniz durumu bildirir), gercek deneme --uygula ister.
    // Sebep: yanlis PIN bir hak yakar, uc yanlis PUK demek.
    case "sim-pin-kaldir": {
      const pin = flag("--pin");
      const real = argv.includes("--uygula");
      if (!real) {
        const k = await withDerivedOk(readSimLock(opts));
        const removeLockOpen = k.atPort
          ? parseClck((await atCommand({ ...opts, atPort: k.atPort }, 'AT+CLCK="SC",2')).answer)
          : null;
        return { timestamp: new Date().toISOString(), command: "sim-pin-kaldir",
          dryRun: true, modemIp: opts.host, ...k, lockOpen: removeLockOpen,
          todo: k.lock === "pin"
            ? "PIN kilidi kaldirilacak (TEK deneme) — onaylamak icin --uygula ekle"
            : removeLockOpen === false
              ? "PIN kilidi ZATEN KAPALI — yapilacak is yok"
              : k.ready ? "SIM acik; --uygula kilit sorgusunu KALICI kapatir"
              : `kilit durumu: ${k.status} — mudahale edilmez`,
        };
      }
      // --zorla: "bu SIM'de daha once bir hak yanmis ama PIN'den eminim".
      // SON hakki zorla bile yakamaz (karar cekirdekte).
      return { timestamp: new Date().toISOString(), command: "sim-pin-kaldir",
        dryRun: false, modemIp: opts.host,
        ...(await disableSimPin(opts, pin, { manualConsent: argv.includes("--zorla") })) };
    }
    // SADECE TEST ICIN: PIN kilidini ACAR. Uretim akisinda yeri yok — kilit
    // KALDIRMA yolunu gercek bir kilitli SIM'de sinamak icin var. Ayni
    // sozlesme: bayraksiz KURU, gercek deneme --uygula ister.
    case "sim-pin-kilitle": {
      const pin = flag("--pin");
      if (!argv.includes("--uygula")) {
        const k = await withDerivedOk(readSimLock(opts));
        // Kilit ZATEN acik mi? Sorgu (AT+CLCK="SC",2) hak HARCAMAZ. Bunu
        // sormadan "ACILACAK" demek yaniltiyordu: kilit acikken de ayni
        // cumle yaziliyordu (2026-08-28 canli goruldu).
        const isOpen = k.atPort
          ? parseClck((await atCommand({ ...opts, atPort: k.atPort }, 'AT+CLCK="SC",2')).answer)
          : null;
        return { timestamp: new Date().toISOString(), command: "sim-pin-kilitle",
          dryRun: true, modemIp: opts.host, ...k, lockOpen: isOpen,
          todo: k.lock === "pin"
            ? "SIM zaten kilitli — yapilacak is yok"
            : isOpen === true
              ? "PIN kilidi ZATEN ACIK — yapilacak is yok (etkisi sonraki acilista)"
              : k.ready ? "PIN kilidi ACILACAK (TEK deneme). Etkisi SONRAKI ACILISTA:"
                + " modemi kapat-ac, SIM PIN soracak. Onaylamak icin --uygula ekle"
                : `kilit durumu: ${k.status} — mudahale edilmez`,
        };
      }
      return { timestamp: new Date().toISOString(), command: "sim-pin-kilitle",
        dryRun: false, modemIp: opts.host,
        ...(await enableSimPin(opts, pin, { manualConsent: argv.includes("--zorla") })) };
    }
    case "fark": {
      const [, before, after] = argv;
      if (!before || !after) {
        return { timestamp: new Date().toISOString(), command: "fark", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: "fark <once.json> <sonra.json> gerekli", check: "Iki nvram JSON dosyasi ver." }] };
      }
      return computeNvramDiff(nvramFromFile(before), nvramFromFile(after));
    }
    case "uygula": {
      const profileName = flag("--profil") || "saha";
      const profile = PROFILES[profileName];
      if (!profile) {
        return { timestamp: new Date().toISOString(), command: "uygula", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: `Bilinmeyen profil: ${profileName}`,
            check: `Gecerli: ${Object.keys(PROFILES).join(", ")}` }] };
      }
      return applyProvisioning({
        ...opts,
        apply: argv.includes("--uygula"),   // yoksa DRY-RUN (kuru)
        reboot: !argv.includes("--reboot-yok"),
        newHost: flag("--yeni-host"),
        newSourceIp: flag("--yeni-kaynak"),
        event: streamWatcher(),
      }, profile);
    }
    case "olcum-elle": {
      // ELLE surecin kronometre sonucunu kaydeder — otomatik olcumlerle AYNI
      // dosyaya, tur:"elle" ile. Karsilastirma tabani boylece kayitli bir
      // olcum olur; komut satirinda tasinan bir sayi degil.
      const dk = Number(flag("--dk"));
      const secFlag = Number(flag("--sn"));
      const totalSeconds = Number.isFinite(secFlag) && secFlag > 0
        ? secFlag
        : (Number.isFinite(dk) && dk > 0 ? Math.round(dk * 60) : null);
      if (!totalSeconds) {
        return { timestamp: new Date().toISOString(), command: "olcum-elle", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: "Manual duration is required.",
            check: "Give it as --dk 15.5 (minutes) or --sn 930 (seconds)." }] };
      }
      const line = {
        timestamp: new Date().toISOString(),
        kind: "manual",   // eski satirlarda tur:"elle" — okuma ikisini de kabul eder
        status: "elle_kurulum",
        ok: true,
        totalSec: totalSeconds,
        who: flag("--kim") || null,
        note: flag("--not") || null,
        // --beyan: bu sayi OLCULMEDI, soylendi. Rapor bunu BEYAN diye
        // etiketler; olculmus bir medyan gibi sunulmaz.
        declared: argv.includes("--beyan"),
      };
      lineWriter(flag("--kayit") || METRICS_FILE, "olcum-elle")(line);
      return { ...line, command: "olcum-elle", problems: [] };
    }
    case "olcum": {
      // Kaydedilmis calistirmalardan savunulabilir sayi uretir. Cihaza GITMEZ.
      // --elle-dk: elle surecin suresi (KARSILASTIRMA TABANI). Bu bir olcum ya
      // da beyandir; hangisi oldugunu --elle-kaynak ile ACIKCA soyle.
      const file = flag("--kayit") || METRICS_FILE;
      let lines = [];
      try {
        lines = readFileSync(file, "utf8").split("\n")
          .filter((s) => s.trim())
          .map((s) => JSON.parse(s));
      } catch {
        return { timestamp: new Date().toISOString(), command: "olcum", ok: false,
          problems: [{ code: "METRICS_FILE_MISSING", severity: "error",
            message: `Metric file not found or unreadable: ${file}`,
            check: "Run `npm start` (or `ricon.js hazirla`) a few times first;"
              + " each finished run appends one line." }] };
      }
      const manualMin = Number(flag("--elle-dk"));
      return summarizeMetrics(lines, {
        manualSec: Number.isFinite(manualMin) && manualMin > 0 ? manualMin * 60 : undefined,
        manualSource: flag("--elle-kaynak"),
        manualN: Number(flag("--elle-n")) || undefined,
        modemCount: Number(flag("--modem-sayisi")) || undefined,
      });
    }
    // Cekirdegin HERHANGI bir export'unu adiyla cagirir. Yeni bir yetenek
    // eklendiginde buraya `case` yazmak GEREKMEZ — src/index.js'e eklenen her
    // sey aninda terminalden erisilebilir olur. Karar/ayristirma saf ve
    // test edilebilir: src/cli/cagirici.js.
    case "calistir": {
      const name = argv[1] && !argv[1].startsWith("-") ? argv[1] : null;
      const { flags, positionals } = parseArgv(argv.slice(name ? 2 : 1));
      // opts'a karismayan CLI bayraklari: fonksiyona gitmemeli.
      const { pure, jsonText, source, ...fnFlags } = flags;
      return callByName(core, name, {
        opts: { host: opts.host, sourceIp: opts.sourceIp, credentials: opts.credentials,
          progress },
        flags: fnFlags,
        positionals,
        pure: pure === true,
      });
    }
    case "hazirla": {
      const profileName = flag("--profil") || "saha";
      const profile = PROFILES[profileName];
      if (!profile) {
        return { timestamp: new Date().toISOString(), command: "hazirla", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: `Bilinmeyen profil: ${profileName}`, check: `Gecerli: ${Object.keys(PROFILES).join(", ")}` }] };
      }
      const fieldHost = flag("--saha-host") || profile.nvram.lan_ipaddr || "5.5.5.1";
      const prefix = (ip) => ip.split(".").slice(0, 3).join(".") + ".";
      // Fabrika oneki .env'deki MODEM_HOST'tan turer (varsayilan 192.168.1.1);
      // boylece host degistirilince on-kontrol de dogru alt agi arar.
      const on = pcPreflight(prefix(opts.host), prefix(fieldHost));
      if (!on.ready) {
        return { timestamp: new Date().toISOString(), command: "hazirla", ok: false,
          status: "pc_hazir_degil", problems: on.problems };
      }
      const provisionOptions = {
        factoryHost: opts.host, factorySource: on.factorySource,
        fieldHost, fieldSource: on.fieldSource,
        credentials: opts.credentials, profile,
        attempts: Number(flag("--deneme")) || 3,
        // Internet dogrulamasi (SIM calisiyor mu). 0 = kapat.
        internetWaitSec: flag("--internet-bekle") !== undefined
          ? Number(flag("--internet-bekle")) : 150,
        record: lineWriter(flag("--kayit") || LEDGER_FILE),
        askPhone,          // dongu: her modem icin sorar
        progress,
        event: streamWatcher(),   // plan tablosu + adim sureleri
      };
      const writeMetrics = lineWriter(flag("--olcum") || METRICS_FILE, "olcum");
      const cycle = argv.includes("--dongu");
      if (cycle) {
        // Sabit --telefon dongude ANLAMSIZ (her cihazin SIM'i farkli);
        // numara her modemde o modemin SIM'inden okunuyor.
        return provisionLoop({
          ...provisionOptions,
          metricsRecord: (r) => writeMetrics(metricsRow(r, provisionOptions.event.steps())),
          maxModems: Number(flag("--max")) || Infinity,
        });
      }
      // Tek modem: --telefon VERMEK ARTIK ZORUNLU DEGIL. Cekirdek numarayi
      // SIM'den okuyor (AT+CNUM); okuyamazsa askPhone ile burayi cagirip
      // operatore soruyor. Verilirse operator bilerek eziyor; gecersizse
      // cekirdek MSISDN_INVALID der (sessizce yeniden sormaz).
      return provisionAndMeasure(provisionOptions, { phone: flag("--telefon") }, writeMetrics);
    }
    default: return null;
  }
}

const COMMANDS = new Set(["dogrula", "oku", "konsol", "sim",
  "degerlendir", "numara", "sim-kilit", "sim-pin-kaldir", "sim-pin-kilitle",
  "fark", "uygula", "hazirla", "calistir", "olcum", "olcum-elle"]);

async function main() {
  if (!command || command === "-h" || command === "--help" || !COMMANDS.has(command)) {
    process.stderr.write(
      "Kullanim: node --env-file=.env ricon.js <komut> [bayraklar]\n\n"
      + "  dogrula                      ortam/erisim teshisi\n"
      + "  oku                          HER SEYI cek (sistem+SIM+ayar+nvram)\n"
      + "  konsol [--nvram]             telnet root shell / tam nvram\n"
      + "  sim [--telefon 05xxxxxxxxx]  SIM/hucresel ozet (+MSISDN girisi)\n"
      + "  degerlendir                  cihaz durumu + NE EKSIK (numara dahil, ~5 sn)\n"
      + "         [--izle] [--tur N]    eksik giderilene kadar KENDI KENDINE tekrar bak\n"
      + "  numara                       SADECE SIM telefon numarasi (AT+CNUM)\n"
      + "  sim-kilit                    SADECE kilit durumu + KALAN HAK (hak harcamaz)\n"
      + "  sim-pin-kaldir --pin 1234    SIM PIN kilidini KALICI kaldir\n"
      + "         [--uygula]            bayraksiz KURU: yalniz durumu bildirir\n"
      + "         [--zorla]             hak yanmis SIM'de yine dene (PIN'den eminsen)\n"
      + "  sim-pin-kilitle --pin 1234   SADECE TEST: PIN kilidini AC (kilitli SIM uret)\n"
      + "         [--uygula]            bayraksiz KURU; etkisi sonraki acilista\n"
      + "  fark <A.json> <B.json>       iki nvram anlik goruntusu diff\n"
      + "  uygula [--uygula]            provizyon (bayraksiz KURU/dry-run)\n"
      + "         [--profil saha|fabrika] [--yeni-host ip] [--yeni-kaynak ip]\n"
      + "         [--reboot-yok]\n"
      + "  hazirla                      tak-calistir: algila->provizyon->dogrula\n"
      + "         [--telefon 05xx]      numara SIM'den okunur; bu bayrak EZER\n"
      + "         [--dongu]             cok modem: tak -> hazir -> cikar -> sonraki\n"
      + "         [--profil ad] [--saha-host ip] [--deneme N] [--max N]\n"
      + "         [--kayit <dosya>]     hazirlama defteri (data/hazirlanan.jsonl)\n"
      + "  calistir [<fonksiyon>]       cekirdegin HERHANGI bir fonksiyonunu cagir\n"
      + "         (adsiz)               cagrilabilir tum yuzeyi listeler\n"
      + "         [-- arg1 arg2]        `--` sonrasi konumsal arguman\n"
      + "         [--saf]               opts enjeksiyonunu kapat\n"
      + "  olcum-elle --dk 15.5         ELLE surecin kronometresini kaydet\n"
      + "         [--kim \"teknisyen A\"] [--not \"...\"]\n"
      + "  olcum                        kaydedilmis surelerden metrik ozeti (cihazsiz)\n"
      + "         [--modem-sayisi 400] [--kayit data/olcumler.jsonl]\n"
      + "         [--elle-dk 15] sadece kayitli elle olcum YOKSA (beyan tabani)\n\n"
      + "Ortak: --json <dosya> (ciktiyi kaydet) · --kaynak <dosya> (cihazsiz tekrar oynat)\n"
      + "       --host <ip> · --kaynak-ip <ip>  (.env'i ezer; modem o an neredeyse)\n",
    );
    // Yardim ISTEMEK hata degil -> 0. BILINMEYEN komut hatadir -> 1.
    // Eskiden `--help` de 1 donuyordu: betikte `ricon.js --help && ...`
    // zinciri sessizce kiriliyordu.
    const helpAsked = !command || command === "-h" || command === "--help";
    return helpAsked ? 0 : 1;
  }

  const source = flag("--kaynak");
  const report = source
    ? JSON.parse(readFileSync(source, "utf8"))
    : await runCommand();

  const jsonText = writeJson(report);
  process.stdout.write(jsonText + "\n");
  process.stderr.write("\n" + summaryText(report) + "\n");

  const out = flag("--json");
  if (out) {
    writeFileSync(out, jsonText, "utf8");
    process.stderr.write(`\nJSON yazildi: ${out}\n`);
  }
  return report.ok ? 0 : 1;
}

main().then((code) => { if (code !== null) process.exit(code); }).catch((e) => {
  process.stderr.write(`Beklenmeyen hata: ${e?.stack || e}\n`);
  process.exit(1);
});
