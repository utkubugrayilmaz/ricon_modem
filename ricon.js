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
//                                TELEFON ZORUNLU: --telefon 05xx (yoksa sorar)
//                                --dongu (cok modem; her modemde ayri sorar)
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
  telefonNormalize,
} from "./src/index.js";
import { writeJson, summaryText } from "./src/report.js";

const argv = process.argv.slice(2);
const komut = argv[0];
const bayrak = (ad) => {
  const i = argv.indexOf(ad);
  return i === -1 ? undefined : argv[i + 1];
};
const ilerle = (m) => process.stderr.write(`[${komut}] ${m}\n`);

// .env -> opts. Cekirdek (src/) process.env OKUMAZ; okuma burada.
function ortamOpts() {
  // --host / --kaynak-ip .env'i EZER: modem o an nerede oldugunu soyleyebilmek
  // gerekir (fabrika 192.168.1.1 <-> saha 5.5.5.1 arasinda gidip gelirken).
  const hostBayrak = bayrak("--host");
  const host = (hostBayrak || process.env.MODEM_HOST || "").trim() || DEFAULT_HOST;
  const onek = host.split(".").slice(0, 3).join(".") + ".";
  // --host verildiyse .env'deki KAYNAK_IP baska alt aga ait olabilir; yok say
  // ve dogru kaynagi onekten bul (yanlis arayuzden cikip cihazi kaybetmeyelim).
  const kaynakSecim = bayrak("--kaynak-ip") || (hostBayrak ? "" : process.env.MODEM_KAYNAK_IP);
  const kaynakIp = (kaynakSecim || "").trim() || findSourceIp(onek) || undefined;
  const kullanici = (process.env.MODEM_KULLANICI || "").trim();
  const sifre = process.env.MODEM_SIFRE || "";
  const kimlik = kullanici ? { kullanici, sifre } : null;
  const community = (process.env.MODEM_SNMP_COMMUNITY || "public").trim();
  return { host, kaynakIp, kimlik, community, ilerle };
}

// --- Hazirlama kaydi (JSONL) ---
// Kalici rollout defteri: her hazirlanan modem icin BIR satir. Cekirdek
// dosyaya yazmaz; yazma karari burada. Dosya `data/` altinda ve .gitignore'da
// — icinde telefon/ICCID/IMEI (kisisel/abonelik verisi) var, commit EDILMEZ.
const KAYIT_DOSYA = "data/hazirlanan.jsonl";

function kayitYazici(dosya) {
  return (satir) => {
    try {
      mkdirSync(dirname(dosya), { recursive: true });
      appendFileSync(dosya, JSON.stringify(satir) + "\n", "utf8");
      process.stderr.write(`[kayit] ${dosya} <- ${satir.durum} ${satir.telefon || "—"}`
        + ` ${satir.iccid || ""}\n`);
    } catch (e) {
      process.stderr.write(`[kayit] YAZILAMADI (${dosya}): ${e.message}\n`);
    }
  };
}

// Telefon numarasini sorar (stderr'a; stdout saf JSON kalir). Gecerli olana
// kadar ya da bos girise kadar sorar. Doner: 5xxxxxxxxx | null
function telefonSor(sira) {
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
      const ham = (await sor(`\n[${sira}. modem] SIM telefon numarasi (05xxxxxxxxx): `)).trim();
      if (!ham) break;
      const n = telefonNormalize(ham);
      if (n) { rl.close(); return n; }
      process.stderr.write("  gecersiz — TR mobil bekleniyor (05xxxxxxxxx / +905xxxxxxxxx)\n");
    }
    rl.close();
    return null;
  })();
}

// nvram JSON dosyasindan nvram nesnesini alir ({nvram:{...}} ya da ham {...}).
function farkNvramAl(dosya) {
  const j = JSON.parse(readFileSync(dosya, "utf8"));
  return j.nvram || j;
}

async function komutuCalistir() {
  const opts = ortamOpts();
  switch (komut) {
    case "dogrula": return checkDevice(opts);
    case "kesif": return discoverDevice(opts);
    case "oku": return readDevice(opts);
    case "izle": return watchDevice({ ...opts, sureSn: Number(bayrak("--sure")) || 30 });
    case "konsol": return readConsole({ ...opts, nvram: argv.includes("--nvram") });
    case "sim": return readSim({ ...opts, telefon: bayrak("--telefon") });
    case "fark": {
      const [, once, sonra] = argv;
      if (!once || !sonra) {
        return { zaman: new Date().toISOString(), komut: "fark", ok: false,
          problems: [{ kod: "ARGS", severity: "error",
            message: "fark <once.json> <sonra.json> gerekli", check: "Iki nvram JSON dosyasi ver." }] };
      }
      return computeNvramDiff(farkNvramAl(once), farkNvramAl(sonra));
    }
    case "uygula": {
      const profilAd = bayrak("--profil") || "saha";
      const profil = PROFILES[profilAd];
      if (!profil) {
        return { zaman: new Date().toISOString(), komut: "uygula", ok: false,
          problems: [{ kod: "ARGS", severity: "error",
            message: `Bilinmeyen profil: ${profilAd}`,
            check: `Gecerli: ${Object.keys(PROFILES).join(", ")}` }] };
      }
      return applyProvisioning({
        ...opts,
        uygula: argv.includes("--uygula"),   // yoksa DRY-RUN (kuru)
        reboot: !argv.includes("--reboot-yok"),
        yeniHost: bayrak("--yeni-host"),
        yeniKaynakIp: bayrak("--yeni-kaynak"),
      }, profil);
    }
    case "sunucu": {
      // UI/HTTP katmani: cekirdegi TUKETIR. Kural eklemez — telefon
      // zorunlulugu ve defter kaydi zaten cekirdekte.
      const profilAd = bayrak("--profil") || "saha";
      const profil = PROFILES[profilAd];
      if (!profil) {
        return { zaman: new Date().toISOString(), komut: "sunucu", ok: false,
          problems: [{ kod: "ARGS", severity: "error",
            message: `Bilinmeyen profil: ${profilAd}`,
            check: `Gecerli: ${Object.keys(PROFILES).join(", ")}` }] };
      }
      const { createServer } = await import("./src/server.js");
      const port = Number(bayrak("--port")) || 8080;
      // Varsayilan YALNIZCA 127.0.0.1: bu servis cihaza YAZAR, agda
      // yayinlanmasi acik bir karar olmali.
      const adres = bayrak("--dinle") || "127.0.0.1";
      const sunucu = createServer({
        fabrikaHost: opts.host,
        sahaHost: bayrak("--saha-host") || profil.nvram.lan_ipaddr || "5.5.5.1",
        kimlik: opts.kimlik,
        profil,
        kayit: kayitYazici(bayrak("--kayit") || KAYIT_DOSYA),
        ilerle,
      });
      await new Promise((c) => sunucu.listen(port, adres, c));
      process.stderr.write(`\nModem kurulum arayuzu: http://${adres}:${port}\n`
        + `  profil: ${profil.ad} · fabrika: ${opts.host}\n`
        + "  Ctrl+C ile kapat.\n\n");
      return null;   // sunucu calisir; JSON ciktisi/cikis yok
    }
    case "hazirla": {
      const profilAd = bayrak("--profil") || "saha";
      const profil = PROFILES[profilAd];
      if (!profil) {
        return { zaman: new Date().toISOString(), komut: "hazirla", ok: false,
          problems: [{ kod: "ARGS", severity: "error",
            message: `Bilinmeyen profil: ${profilAd}`, check: `Gecerli: ${Object.keys(PROFILES).join(", ")}` }] };
      }
      const sahaHost = bayrak("--saha-host") || profil.nvram.lan_ipaddr || "5.5.5.1";
      const onek = (ip) => ip.split(".").slice(0, 3).join(".") + ".";
      // Fabrika oneki .env'deki MODEM_HOST'tan turer (varsayilan 192.168.1.1);
      // boylece host degistirilince on-kontrol de dogru alt agi arar.
      const on = pcPreflight(onek(opts.host), onek(sahaHost));
      if (!on.hazir) {
        return { zaman: new Date().toISOString(), komut: "hazirla", ok: false,
          durum: "pc_hazir_degil", problems: on.problems };
      }
      const hOpts = {
        fabrikaHost: opts.host, fabrikaKaynak: on.fabrikaKaynak,
        sahaHost, sahaKaynak: on.sahaKaynak,
        kimlik: opts.kimlik, profil,
        denemeler: Number(bayrak("--deneme")) || 3,
        kayit: kayitYazici(bayrak("--kayit") || KAYIT_DOSYA),
        telefonSor,          // dongu: her modem icin sorar
        ilerle,
      };
      const dongu = argv.includes("--dongu");
      if (dongu) {
        // Sabit --telefon dongude ANLAMSIZ (her cihazin SIM'i farkli) — verilse
        // bile yok sayilir, modem basina sorulur.
        return provisionLoop({ ...hOpts, maxModem: Number(bayrak("--max")) || Infinity });
      }
      // Tek modem: --telefon verilmediyse sor. Verildiyse HAM gecer — gecersizse
      // cekirdek MSISDN_INVALID der (sessizce yeniden sormaz).
      const telBayrak = bayrak("--telefon");
      const telefon = telBayrak !== undefined ? telBayrak : await telefonSor(1);
      return provisionModem({ ...hOpts, telefon });
    }
    default: return null;
  }
}

const KOMUTLAR = new Set(["dogrula", "kesif", "oku", "izle", "konsol", "sim",
  "fark", "uygula", "hazirla", "sunucu"]);

async function main() {
  if (!komut || komut === "-h" || komut === "--help" || !KOMUTLAR.has(komut)) {
    process.stderr.write(
      "Kullanim: node --env-file=.env ricon.js <komut> [bayraklar]\n\n"
      + "  dogrula                      ortam/erisim teshisi\n"
      + "  kesif                        port + parmak izi + SNMP (salt okunur)\n"
      + "  oku                          HER SEYI cek (sistem+SIM+ayar+nvram)\n"
      + "  izle --sure <sn>             fark tabanli canli alan tespiti\n"
      + "  konsol [--nvram]             telnet root shell / tam nvram\n"
      + "  sim [--telefon 05xxxxxxxxx]  SIM/hucresel ozet (+MSISDN girisi)\n"
      + "  fark <A.json> <B.json>       iki nvram anlik goruntusu diff\n"
      + "  uygula [--uygula]            provizyon (bayraksiz KURU/dry-run)\n"
      + "         [--profil saha|fabrika] [--yeni-host ip] [--yeni-kaynak ip]\n"
      + "         [--reboot-yok]\n"
      + "  hazirla --telefon 05xx       tak-calistir: algila->provizyon->dogrula\n"
      + "         [--dongu]             cok modem (her modemde telefon sorar)\n"
      + "         [--profil ad] [--saha-host ip] [--deneme N] [--max N]\n"
      + "         [--kayit <dosya>]     hazirlama defteri (data/hazirlanan.jsonl)\n"
      + "  sunucu                       tarayici arayuzu (UI) — cekirdegi tuketir\n"
      + "         [--port 8080] [--dinle 127.0.0.1] [--profil ad] [--kayit <dosya>]\n\n"
      + "Ortak: --json <dosya> (ciktiyi kaydet) · --kaynak <dosya> (cihazsiz tekrar oynat)\n"
      + "       --host <ip> · --kaynak-ip <ip>  (.env'i ezer; modem o an neredeyse)\n",
    );
    return komut && !KOMUTLAR.has(komut) ? 1 : 0;
  }

  // sunucu: surekli calisir — JSON basmaz, cikmaz. Dinleyen sunucu olay
  // dongusunu acik tutar; asagidaki process.exit'e DUSMEMESI gerekir.
  if (komut === "sunucu") { await komutuCalistir(); return null; }

  const kaynak = bayrak("--kaynak");
  const rapor = kaynak
    ? JSON.parse(readFileSync(kaynak, "utf8"))
    : await komutuCalistir();

  const json = writeJson(rapor);
  process.stdout.write(json + "\n");
  process.stderr.write("\n" + summaryText(rapor) + "\n");

  const cikti = bayrak("--json");
  if (cikti) {
    writeFileSync(cikti, json, "utf8");
    process.stderr.write(`\nJSON yazildi: ${cikti}\n`);
  }
  return rapor.ok ? 0 : 1;
}

main().then((kod) => { if (kod !== null) process.exit(kod); }).catch((e) => {
  process.stderr.write(`Beklenmeyen hata: ${e?.stack || e}\n`);
  process.exit(1);
});
