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
//   node ricon.js fark A.json B.json   Iki nvram anlik goruntusunu karsilastir
//
// Ortak: --json <dosya> (ciktiyi yaz) · --kaynak <dosya> (kayittan goster)
// Ortam: MODEM_HOST, MODEM_KULLANICI, MODEM_SIFRE, MODEM_KAYNAK_IP,
//        MODEM_SNMP_COMMUNITY  (node --env-file=.env ricon.js ...)
//
// Sozlesme: stdout HER ZAMAN saf JSON; ilerleme/ozet stderr'a; cikis kodu ok'tan.

import { writeFileSync, readFileSync } from "node:fs";
import { VARSAYILAN_HOST } from "./src/sabitler.js";
import { kaynakIpBul } from "./src/ag.js";
import {
  modemDogrula, modemKesif, modemOku, modemIzle, modemKonsol, nvramFarkHesapla,
} from "./src/index.js";
import { jsonYaz, ozetMetni } from "./src/rapor.js";

const argv = process.argv.slice(2);
const komut = argv[0];
const bayrak = (ad) => {
  const i = argv.indexOf(ad);
  return i === -1 ? undefined : argv[i + 1];
};
const ilerle = (m) => process.stderr.write(`[${komut}] ${m}\n`);

// .env -> opts. Cekirdek (src/) process.env OKUMAZ; okuma burada.
function ortamOpts() {
  const host = (process.env.MODEM_HOST || "").trim() || VARSAYILAN_HOST;
  const onek = host.split(".").slice(0, 3).join(".") + ".";
  const kaynakIp = (process.env.MODEM_KAYNAK_IP || "").trim() || kaynakIpBul(onek) || undefined;
  const kullanici = (process.env.MODEM_KULLANICI || "").trim();
  const sifre = process.env.MODEM_SIFRE || "";
  const kimlik = kullanici ? { kullanici, sifre } : null;
  const community = (process.env.MODEM_SNMP_COMMUNITY || "public").trim();
  return { host, kaynakIp, kimlik, community, ilerle };
}

// nvram JSON dosyasindan nvram nesnesini alir ({nvram:{...}} ya da ham {...}).
function farkNvramAl(dosya) {
  const j = JSON.parse(readFileSync(dosya, "utf8"));
  return j.nvram || j;
}

async function komutuCalistir() {
  const opts = ortamOpts();
  switch (komut) {
    case "dogrula": return modemDogrula(opts);
    case "kesif": return modemKesif(opts);
    case "oku": return modemOku(opts);
    case "izle": return modemIzle({ ...opts, sureSn: Number(bayrak("--sure")) || 30 });
    case "konsol": return modemKonsol({ ...opts, nvram: argv.includes("--nvram") });
    case "fark": {
      const [, once, sonra] = argv;
      if (!once || !sonra) {
        return { zaman: new Date().toISOString(), komut: "fark", ok: false,
          problems: [{ kod: "ARGS", severity: "error",
            message: "fark <once.json> <sonra.json> gerekli", check: "Iki nvram JSON dosyasi ver." }] };
      }
      return nvramFarkHesapla(farkNvramAl(once), farkNvramAl(sonra));
    }
    default: return null;
  }
}

const KOMUTLAR = new Set(["dogrula", "kesif", "oku", "izle", "konsol", "fark"]);

async function main() {
  if (!komut || komut === "-h" || komut === "--help" || !KOMUTLAR.has(komut)) {
    process.stderr.write(
      "Kullanim: node ricon.js <dogrula|kesif|oku|izle|konsol|fark> "
      + "[--json d] [--kaynak d] [--sure sn] [--nvram]\n",
    );
    return komut && !KOMUTLAR.has(komut) ? 1 : 0;
  }

  const kaynak = bayrak("--kaynak");
  const rapor = kaynak
    ? JSON.parse(readFileSync(kaynak, "utf8"))
    : await komutuCalistir();

  const json = jsonYaz(rapor);
  process.stdout.write(json + "\n");
  process.stderr.write("\n" + ozetMetni(rapor) + "\n");

  const cikti = bayrak("--json");
  if (cikti) {
    writeFileSync(cikti, json, "utf8");
    process.stderr.write(`\nJSON yazildi: ${cikti}\n`);
  }
  return rapor.ok ? 0 : 1;
}

main().then((kod) => process.exit(kod)).catch((e) => {
  process.stderr.write(`Beklenmeyen hata: ${e?.stack || e}\n`);
  process.exit(1);
});
