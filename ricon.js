#!/usr/bin/env node
// Ricon S9922M44 — INCE CLI sarmalayici. Cekirdek is src/index.js'te;
// bu dosya sadece: argv ayristir + .env oku + index'i cagir + yazdir.
// Ayni cekirdek HTTP endpoint / npm paketi olarak da tuketilebilir.
//
//   node ricon.js dogrula        Ortam teshisi
//   node ricon.js kesif          Salt-okunur kesif (port + parmak izi + SNMP)
//   node ricon.js oku            HER SEYI cek (sistem + SIM + ayar + nvram)
//   node ricon.js izle           Fark tabanli ornekleme (--sure sn)
//   node ricon.js konsol         Telnet root shell kesfi (--nvram = tam nvram)
//   node ricon.js sim            SIM/hucresel ozet (--telefon 05xx = MSISDN girisi)
//   node ricon.js fark A.json B.json   Iki nvram anlik goruntusunu karsilastir
//   node ricon.js uygula         Provizyon (KURU varsayilan; gercek yazma --uygula)
//                                --profil saha|fabrika · --yeni-host · --yeni-kaynak
//                                --reboot-yok
//   node ricon.js sunucu         Tarayici arayuzu (UI) — http://127.0.0.1:8080
//   node ricon.js hazirla        Tak-calistir: algila->provizyon->dogrula
//                                Numara SIM'den okunur; --telefon 05xx EZER
//                                --dongu (cok modem: tak -> hazir -> cikar)
//                                --profil · --saha-host · --deneme N · --max N
//                                --kayit <dosya> (varsayilan data/hazirlanan.jsonl)
//
// Ortak: --json <dosya> (ciktiyi yaz) · --kaynak <dosya> (kayittan goster)
// Ortam: MODEM_HOST, MODEM_KULLANICI, MODEM_SIFRE, MODEM_KAYNAK_IP,
//        MODEM_SNMP_COMMUNITY  (node --env-file=.env ricon.js ...)
//
// Sozlesme: stdout HER ZAMAN saf JSON; ilerleme/ozet stderr'a; cikis kodu ok'tan.

import { writeFileSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { DEFAULT_HOST } from "./src/constants.js";
import { findSourceIp } from "./src/network.js";
import {
  checkDevice, discoverDevice, readDevice, watchDevice, readConsole, computeNvramDiff,
  applyProvisioning, PROFILES, provisionModem, provisionLoop, pcPreflight, readSim,
  normalizePhone, summarizeMetrics, assessDevice, watchAssessment,
  readMsisdn, readSimLock, disableSimPin,
  enableSimPin, atCommand, parseClck,
} from "./src/index.js";
import { writeJson, summaryText } from "./src/report.js";
import { isOk } from "./src/problems.js";

const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const onProgress = (m) => process.stderr.write(`[${command}] ${m}\n`);

// .env -> opts. Cekirdek (src/) process.env OKUMAZ; okuma burada.
function envOptions() {
  // --host / --kaynak-ip .env'i EZER: modem o an nerede oldugunu soyleyebilmek
  // gerekir (fabrika 192.168.1.1 <-> saha 5.5.5.1 arasinda gidip gelirken).
  const hostFlag = flag("--host");
  const host = (hostFlag || process.env.MODEM_HOST || "").trim() || DEFAULT_HOST;
  const prefix = host.split(".").slice(0, 3).join(".") + ".";
  // --host verildiyse .env'deki KAYNAK_IP baska alt aga ait olabilir; yok say
  // ve dogru kaynagi onekten bul (yanlis arayuzden cikip cihazi kaybetmeyelim).
  const sourceChoice = flag("--kaynak-ip") || (hostFlag ? "" : process.env.MODEM_KAYNAK_IP);
  const sourceIp = (sourceChoice || "").trim() || findSourceIp(prefix) || undefined;
  const username = (process.env.MODEM_KULLANICI || "").trim();
  const password = process.env.MODEM_SIFRE || "";
  const kimlik = username ? { username, password } : null;
  const community = (process.env.MODEM_SNMP_COMMUNITY || "public").trim();
  return { host, sourceIp, kimlik, community, onProgress };
}

// --- Hazirlama kaydi (JSONL) ---
// Kalici rollout defteri: her hazirlanan modem icin BIR satir. Cekirdek
// dosyaya yazmaz; yazma karari burada. Dosya `data/` altinda ve .gitignore'da
// — icinde telefon/ICCID/IMEI (kisisel/abonelik verisi) var, commit EDILMEZ.
const RECORD_FILE = "data/hazirlanan.jsonl";
// Sure olcumleri ayri dosyada: defter "hangi modem sahaya cikti" sorusunun
// kaydi, olcum dosyasi "surec ne kadar suruyor" sorusunun kaydi. Karistirmak
// ikisini de bulaniklastirir.
const METRIC_FILE = "data/olcumler.jsonl";

function recordWriter(file, label = "record") {
  return (line) => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, JSON.stringify(line) + "\n", "utf8");
      const ek = line.totalSec != null ? `${line.totalSec} sn` : (line.iccid || "");
      process.stderr.write(`[${label}] ${file} <- ${line.status} `
        + `${line.phone || "—"} ${ek}\n`);
    } catch (e) {
      process.stderr.write(`[${label}] YAZILAMADI (${file}): ${e.message}\n`);
    }
  };
}

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
  const sor = (soru) => new Promise((c) => rl.question(soru, c));
  return (async () => {
    for (let i = 0; i < 3; i += 1) {
      const raw = (await sor(`\n[${index}. modem] SIM telefon numarasi (05xxxxxxxxx): `)).trim();
      if (!raw) break;
      const n = normalizePhone(raw);
      if (n) { rl.close(); return n; }
      process.stderr.write("  gecersiz — TR mobil bekleniyor (05xxxxxxxxx / +905xxxxxxxxx)\n");
    }
    rl.close();
    return null;
  })();
}

// Cekirdek cagrisinin sonucuna `ok`'u PROBLEMLERDEN turetir. Bazi salt-okuma
// fonksiyonlari (readMsisdn/readSimLock) `ok` alani DONDURMUYOR: kismi sonuc
// da gecerli bir sonuc. Ama CLI sozlesmesi "cikis kodu ok'tan" diyor, yani
// burada hesaplanmali. Sabit `ok: true` yazmak, erisilemeyen bir modemde
// kabuga 0 dondurup betikleri yaniltiyordu.
async function withOkFlag(vaat) {
  const r = await vaat;
  return { ...r, ok: r.ok ?? isOk(r.problems ?? []) };
}

// nvram JSON dosyasindan nvram nesnesini alir ({nvram:{...}} ya da ham {...}).
function readNvramFile(file) {
  const j = JSON.parse(readFileSync(file, "utf8"));
  return j.nvram || j;
}

async function runCommand() {
  const options = envOptions();
  switch (command) {
    case "dogrula": return checkDevice(options);
    case "kesif": return discoverDevice(options);
    case "oku": return readDevice(options);
    case "izle": return watchDevice({
      ...options,
      durationSec: Number(flag("--sure")) || 60,
      aralikSn: Number(flag("--aralik")) || 5,
    });
    case "konsol": return readConsole({ ...options, nvram: argv.includes("--nvram") });
    case "sim": return readSim({ ...options, phone: flag("--telefon") });
    // Cihazin O ANKI durumu + ne eksik. Sunucudaki /api/degerlendir ile AYNI
    // cekirdek cagrisi — endpoint bir tuketici, burasi digeri.
    case "degerlendir": {
      const assessOptions = {
        ...options,
        factoryHost: flag("--host") || undefined,
        fieldHost: flag("--saha-host") || undefined,
        phone: flag("--telefon") || null,
        pin: flag("--pin") || null,
      };
      // --izle: cekirdek KENDI KENDINE tekrar bakar. Ne zaman tekrar
      // bakilacagina yenidenDenemeKarari karar veriyor — burada politika YOK.
      // Ayni yetenegi arayuz de kullaniyor; kural: her yetenek her tuketiciden.
      if (!argv.includes("--izle")) return assessDevice(assessOptions);
      return watchAssessment({
        ...assessOptions,
        enFazlaTur: Number(flag("--tur")) || Infinity,
        event: (o) => onProgress(`modem=${o.modem.location ?? "none"}`
          + ` telefon=${o.phone.number ?? "-"} eksik=[${o.missing}]`
          + ` tekrar=${o.retry.retry ? `${o.retry.delaySec} sn (${o.retry.reason})` : "none"}`),
      });
    }
    // SADECE telefon numarasi. "Bu araci sadece numara okumak icin kullanmak
    // istiyorum" diyen icin tek komut; provizyon/degerlendirme gerekmez.
    case "numara": return { timestamp: new Date().toISOString(), command: "numara",
      modemIp: options.host, ...(await withOkFlag(readMsisdn(options))) };
    // SADECE SIM kilidi (salt okunur): durum + KALAN HAK. Hicbir sey harcamaz.
    case "sim-kilit": return { timestamp: new Date().toISOString(), command: "sim-kilit",
      modemIp: options.host, ...(await withOkFlag(readSimLock(options))) };
    // SIM PIN kilidini KALICI kaldir. `uygula` ile ayni sozlesme: bayraksiz
    // KURU calisir (yalniz durumu bildirir), gercek deneme --uygula ister.
    // Sebep: yanlis PIN bir hak yakar, uc yanlis PUK demek.
    case "sim-pin-kaldir": {
      const pin = flag("--pin");
      const gercek = argv.includes("--uygula");
      if (!gercek) {
        const k = await withOkFlag(readSimLock(options));
        const disableLockEnabled = k.atPort
          ? parseClck((await atCommand({ ...options, atPort: k.atPort }, 'AT+CLCK="SC",2')).response)
          : null;
        return { timestamp: new Date().toISOString(), command: "sim-pin-kaldir",
          dryRun: true, modemIp: options.host, ...k, lockEnabled: disableLockEnabled,
          plannedAction: k.lock === "pin"
            ? "PIN kilidi kaldirilacak (TEK deneme) — onaylamak icin --uygula ekle"
            : disableLockEnabled === false
              ? "PIN kilidi ZATEN KAPALI — yapilacak is yok"
              : k.ready ? "SIM acik; --uygula kilit sorgusunu KALICI kapatir"
              : `kilit durumu: ${k.status} — mudahale edilmez`,
        };
      }
      // --zorla: "bu SIM'de daha once bir hak yanmis ama PIN'den eminim".
      // SON hakki zorla bile yakamaz (karar cekirdekte).
      return { timestamp: new Date().toISOString(), command: "sim-pin-kaldir",
        dryRun: false, modemIp: options.host,
        ...(await disableSimPin(options, pin, { humanApproved: argv.includes("--zorla") })) };
    }
    // SADECE TEST ICIN: PIN kilidini ACAR. Uretim akisinda yeri yok — kilit
    // KALDIRMA yolunu gercek bir kilitli SIM'de sinamak icin var. Ayni
    // sozlesme: bayraksiz KURU, gercek deneme --uygula ister.
    case "sim-pin-kilitle": {
      const pin = flag("--pin");
      if (!argv.includes("--uygula")) {
        const k = await withOkFlag(readSimLock(options));
        // Kilit ZATEN acik mi? Sorgu (AT+CLCK="SC",2) hak HARCAMAZ. Bunu
        // sormadan "ACILACAK" demek yaniltiyordu: kilit acikken de ayni
        // cumle yaziliyordu (2026-08-28 canli goruldu).
        const isEnabled = k.atPort
          ? parseClck((await atCommand({ ...options, atPort: k.atPort }, 'AT+CLCK="SC",2')).response)
          : null;
        return { timestamp: new Date().toISOString(), command: "sim-pin-kilitle",
          dryRun: true, modemIp: options.host, ...k, lockEnabled: isEnabled,
          plannedAction: k.lock === "pin"
            ? "SIM zaten kilitli — yapilacak is yok"
            : isEnabled === true
              ? "PIN kilidi ZATEN ACIK — yapilacak is yok (etkisi sonraki acilista)"
              : k.ready ? "PIN kilidi ACILACAK (TEK deneme). Etkisi SONRAKI ACILISTA:"
                + " modemi kapat-ac, SIM PIN soracak. Onaylamak icin --uygula ekle"
                : `kilit durumu: ${k.status} — mudahale edilmez`,
        };
      }
      return { timestamp: new Date().toISOString(), command: "sim-pin-kilitle",
        dryRun: false, modemIp: options.host,
        ...(await enableSimPin(options, pin, { humanApproved: argv.includes("--zorla") })) };
    }
    case "fark": {
      const [, before, after] = argv;
      if (!before || !after) {
        return { timestamp: new Date().toISOString(), command: "fark", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: "fark <once.json> <sonra.json> gerekli", check: "Iki nvram JSON dosyasi ver." }] };
      }
      return computeNvramDiff(readNvramFile(before), readNvramFile(after));
    }
    case "uygula": {
      const profileName = flag("--profil") || "field";
      const profile = PROFILES[profileName];
      if (!profile) {
        return { timestamp: new Date().toISOString(), command: "uygula", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: `Bilinmeyen profil: ${profileName}`,
            check: `Gecerli: ${Object.keys(PROFILES).join(", ")}` }] };
      }
      return applyProvisioning({
        ...options,
        apply: argv.includes("--uygula"),   // yoksa DRY-RUN (kuru)
        reboot: !argv.includes("--reboot-yok"),
        newHost: flag("--yeni-host"),
        newSourceIp: flag("--yeni-kaynak"),
      }, profile);
    }
    case "olcum-elle": {
      // ELLE surecin kronometre sonucunu kaydeder — otomatik olcumlerle AYNI
      // dosyaya, tur:"manual" ile. Karsilastirma tabani boylece kayitli bir
      // olcum olur; komut satirinda tasinan bir sayi degil.
      const min = Number(flag("--dk"));
      const secFlag = Number(flag("--sn"));
      const totalSec = Number.isFinite(secFlag) && secFlag > 0
        ? secFlag
        : (Number.isFinite(min) && min > 0 ? Math.round(min * 60) : null);
      if (!totalSec) {
        return { timestamp: new Date().toISOString(), command: "olcum-elle", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: "Manual duration is required.",
            check: "Give it as --dk 15.5 (minutes) or --sn 930 (seconds)." }] };
      }
      const line = {
        timestamp: new Date().toISOString(),
        kind: "manual",
        status: "manualRun",
        ok: true,
        totalSec: totalSec,
        kim: flag("--kim") || null,
        not: flag("--not") || null,
        // --beyan: bu sayi OLCULMEDI, soylendi. Rapor bunu BEYAN diye
        // etiketler; olculmus bir medyan gibi sunulmaz.
        beyan: argv.includes("--beyan"),
      };
      recordWriter(flag("--kayit") || METRIC_FILE, "olcum-elle")(line);
      return { ...line, command: "olcum-elle", problems: [] };
    }
    case "olcum": {
      // Kaydedilmis calistirmalardan savunulabilir sayi uretir. Cihaza GITMEZ.
      // --elle-dk: elle surecin suresi (KARSILASTIRMA TABANI). Bu bir olcum ya
      // da beyandir; hangisi oldugunu --elle-kaynak ile ACIKCA soyle.
      const file = flag("--kayit") || METRIC_FILE;
      let lines = [];
      try {
        lines = readFileSync(file, "utf8").split("\n")
          .filter((s) => s.trim())
          .map((s) => JSON.parse(s));
      } catch {
        return { timestamp: new Date().toISOString(), command: "olcum", ok: false,
          problems: [{ code: "METRIC_FILE_MISSING", severity: "error",
            message: `Metric file not found or unreadable: ${file}`,
            check: "Run the UI flow (node ricon.js sunucu) a few times first;"
              + " each finished run appends one line." }] };
      }
      const manualMin = Number(flag("--elle-dk"));
      return summarizeMetrics(lines, {
        manualSec: Number.isFinite(manualMin) && manualMin > 0 ? manualMin * 60 : undefined,
        manualSource: flag("--elle-kaynak"),
        manualCount: Number(flag("--elle-n")) || undefined,
        modemCount: Number(flag("--modem-sayisi")) || undefined,
      });
    }
    case "sunucu": {
      // UI/HTTP katmani: cekirdegi TUKETIR. Kural eklemez — telefon
      // zorunlulugu ve defter kaydi zaten cekirdekte.
      const profileName = flag("--profil") || "field";
      const profile = PROFILES[profileName];
      if (!profile) {
        return { timestamp: new Date().toISOString(), command: "sunucu", ok: false,
          problems: [{ code: "ARGS", severity: "error",
            message: `Bilinmeyen profil: ${profileName}`,
            check: `Gecerli: ${Object.keys(PROFILES).join(", ")}` }] };
      }
      const { createServer } = await import("./src/server.js");
      const port = Number(flag("--port")) || 8080;
      // Varsayilan YALNIZCA 127.0.0.1: bu servis cihaza YAZAR, agda
      // yayinlanmasi acik bir karar olmali.
      const address = flag("--dinle") || "127.0.0.1";
      const sunucu = createServer({
        factoryHost: options.host,
        fieldHost: flag("--saha-host") || profile.nvram.lan_ipaddr || "5.5.5.1",
        kimlik: options.kimlik,
        profile,
        // Arayuzdeki "Fabrikaya dondur" dugmesi bu profili uygular. DIKKAT:
        // gercek factory reset DEGIL — yalniz bizim dokundugumuz anahtarlari
        // default'a alir (bkz. profile.js).
        resetProfile: PROFILES.fabrika,
        // Test arayuzu bir ORNEK: urun cekirdek + API. Bu yol verilmezse
        // sunucu salt API olarak calisir.
        staticDir: flag("--arayuz") === "none" ? null
          : (flag("--arayuz") || new URL("./examples/test-ui/", import.meta.url).pathname
            .replace(/^\/([A-Za-z]:)/, "$1")),
        record: recordWriter(flag("--kayit") || RECORD_FILE),
        metricRecord: recordWriter(flag("--olcum") || METRIC_FILE, "olcum"),
        onProgress,
      });
      await new Promise((c) => sunucu.listen(port, address, c));
      process.stderr.write(`\nModem kurulum arayuzu: http://${address}:${port}\n`
        + `  profil: ${profile.name} · fabrika: ${options.host}\n`
        + "  Ctrl+C ile kapat.\n\n");
      return null;   // sunucu calisir; JSON ciktisi/cikis yok
    }
    case "hazirla": {
      const profileName = flag("--profil") || "field";
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
      const on = pcPreflight(prefix(options.host), prefix(fieldHost));
      if (!on.ready) {
        return { timestamp: new Date().toISOString(), command: "hazirla", ok: false,
          status: "pcNotReady", problems: on.problems };
      }
      const hOpts = {
        factoryHost: options.host, factorySource: on.factorySource,
        fieldHost, fieldSource: on.fieldSource,
        kimlik: options.kimlik, profile,
        attempts: Number(flag("--deneme")) || 3,
        // Internet dogrulamasi (SIM calisiyor mu). 0 = kapat.
        internetWaitSec: flag("--internet-bekle") !== undefined
          ? Number(flag("--internet-bekle")) : 150,
        record: recordWriter(flag("--kayit") || RECORD_FILE),
        askPhone,          // dongu: her modem icin sorar
        onProgress,
      };
      const dongu = argv.includes("--dongu");
      if (dongu) {
        // Sabit --telefon dongude ANLAMSIZ (her cihazin SIM'i farkli);
        // numara her modemde o modemin SIM'inden okunuyor.
        return provisionLoop({ ...hOpts, maxModems: Number(flag("--max")) || Infinity });
      }
      // Tek modem: --telefon VERMEK ARTIK ZORUNLU DEGIL. Cekirdek numarayi
      // SIM'den okuyor (AT+CNUM); okuyamazsa telefonSor ile burayi cagirip
      // operatore soruyor. Verilirse operator bilerek eziyor; gecersizse
      // cekirdek MSISDN_INVALID der (sessizce yeniden sormaz).
      return provisionModem({ ...hOpts, phone: flag("--telefon") });
    }
    default: return null;
  }
}

const COMMANDS = new Set(["dogrula", "kesif", "oku", "izle", "konsol", "sim",
  "degerlendir", "numara", "sim-kilit", "sim-pin-kaldir", "sim-pin-kilitle",
  "fark", "uygula", "hazirla", "sunucu", "olcum", "olcum-elle"]);

async function main() {
  if (!command || command === "-h" || command === "--help" || !COMMANDS.has(command)) {
    process.stderr.write(
      "Kullanim: node --env-file=.env ricon.js <komut> [bayraklar]\n\n"
      + "  dogrula                      ortam/erisim teshisi\n"
      + "  kesif                        port + parmak izi + SNMP (salt okunur)\n"
      + "  oku                          HER SEYI cek (sistem+SIM+ayar+nvram)\n"
      + "  izle --sure <sn>             fark tabanli canli alan tespiti\n"
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
      + "  sunucu                       tarayici arayuzu (UI) — cekirdegi tuketir\n"
      + "         [--port 8080] [--dinle 127.0.0.1] [--profil ad] [--kayit <dosya>]\n"
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
    const yardimIstendi = !command || command === "-h" || command === "--help";
    return yardimIstendi ? 0 : 1;
  }

  // sunucu: surekli calisir — JSON basmaz, cikmaz. Dinleyen sunucu olay
  // dongusunu acik tutar; asagidaki process.exit'e DUSMEMESI gerekir.
  if (command === "sunucu") { await runCommand(); return null; }

  const source = flag("--kaynak");
  const report = source
    ? JSON.parse(readFileSync(source, "utf8"))
    : await runCommand();

  const json = writeJson(report);
  process.stdout.write(json + "\n");
  process.stderr.write("\n" + summaryText(report) + "\n");

  const output = flag("--json");
  if (output) {
    writeFileSync(output, json, "utf8");
    process.stderr.write(`\nJSON yazildi: ${output}\n`);
  }
  return report.ok ? 0 : 1;
}

main().then((code) => { if (code !== null) process.exit(code); }).catch((e) => {
  process.stderr.write(`Beklenmeyen hata: ${e?.stack || e}\n`);
  process.exit(1);
});
