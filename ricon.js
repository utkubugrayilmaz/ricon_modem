#!/usr/bin/env node
// Ricon S9922M44 — TEK giris noktasi. Alt komutlar:
//
//   node ricon.js dogrula        Ortam teshisi (kablo/kaynak IP/erisim/kimlik)
//   node ricon.js kesif          Salt-okunur kesif (port + parmak izi + SNMP)
//   node ricon.js oku            HER SEYI cek (sistem + SIM + tum ayar + nvram)
//   node ricon.js izle           Fark tabanli ornekleme (hangi alan canli)
//
// Ortak secenekler:
//   --json <dosya>    Raporu JSON dosyasina da yaz
//   --kaynak <dosya>  Cihaza gitme; kaydedilmis JSON'u yeniden goster
//   --sure <sn>       izle icin ornekleme suresi (varsayilan 30)
//
// Ortam (.env, `node --env-file=.env ricon.js ...`):
//   MODEM_HOST, MODEM_KULLANICI, MODEM_SIFRE, MODEM_KAYNAK_IP,
//   MODEM_SNMP_COMMUNITY
//
// Sozlesme: stdout HER ZAMAN saf JSON; ilerleme/ozet stderr'a gider; cikis
// kodu sonucun ok'undan (0 = ok, 1 = hata). Kutuphane katmani throw etmez.

import { writeFileSync, readFileSync } from "node:fs";
import { VARSAYILAN_HOST, UCLAR, TCP_KAPILARI } from "./src/sabitler.js";
import {
  Istemci, hostMesgulMu, hostuKilitle, hostuSerbestBirak,
} from "./src/istemci.js";
import { ciftleriAyikla, simGorunumu } from "./src/ddwrt.js";
import { nvramAyikla } from "./src/nvram.js";
import {
  kaynakIpBul, yerelArayuzler, arpTablosu, ureticiTahmin,
} from "./src/ag.js";
import { portTara, erisilebilirMi } from "./src/tarayici.js";
import { snmpKimlik } from "./src/snmp.js";
import { konsolKesif, konsolNvram } from "./src/konsol.js";
import { sorun, sonucOk } from "./src/sorunlar.js";
import { jsonYaz, ozetMetni } from "./src/rapor.js";

// --- Basit argv ayristirma (kutuphane yok) ---
const argv = process.argv.slice(2);
const komut = argv[0];
const bayrak = (ad) => {
  const i = argv.indexOf(ad);
  return i === -1 ? undefined : argv[i + 1];
};
const now = () => new Date().toISOString();

function ortam() {
  const host = (process.env.MODEM_HOST || "").trim() || VARSAYILAN_HOST;
  const onek = host.split(".").slice(0, 3).join(".") + ".";
  const kaynakIp = (process.env.MODEM_KAYNAK_IP || "").trim() || kaynakIpBul(onek) || undefined;
  const kullanici = (process.env.MODEM_KULLANICI || "").trim();
  const sifre = process.env.MODEM_SIFRE || "";
  const kimlik = kullanici ? { kullanici, sifre } : null;
  const community = (process.env.MODEM_SNMP_COMMUNITY || "public").trim();
  return { host, onek, kaynakIp, kimlik, community };
}

// --- dogrula ---
async function dogrula() {
  const { host, onek, kaynakIp, kimlik } = ortam();
  const rapor = { zaman: now(), komut: "dogrula", modem_ip: host, problems: [] };
  rapor.yerel_arayuzler = yerelArayuzler();
  rapor.kaynak_ip = kaynakIp || null;
  if (!kaynakIp) rapor.problems.push(sorun("NO_SOURCE_IP", `${onek}50`));

  rapor.erisilebilir = await erisilebilirMi(host, kaynakIp);
  if (!rapor.erisilebilir) rapor.problems.push(sorun("DEVICE_UNREACHABLE", host));

  // Kimliksiz bir sistem ucu + kimlik gerektiren bir uc dene.
  if (rapor.erisilebilir) {
    const c = new Istemci({ host, kaynakIp, kimlik });
    const sistem = await c.get("/asp/status/Info.live.htm");
    rapor.sistem_ucu = { kod: sistem.kod, boyut: sistem.govde.length };
    const korumali = await c.get("/asp/status/Status_Internet.live.asp");
    rapor.kimlikli_uc = { kod: korumali.kod };
    rapor.problems.push(...korumali.problems);
  }
  rapor.kimlik_hazir = Boolean(kimlik);
  rapor.ok = sonucOk(rapor.problems);
  return rapor;
}

// --- oku: HER SEYI cek ---
async function oku() {
  const { host, kaynakIp, kimlik, community } = ortam();
  if (hostMesgulMu(host)) {
    return { zaman: now(), komut: "oku", modem_ip: host, ok: false,
      problems: [sorun("DEVICE_BUSY", host)] };
  }
  hostuKilitle(host);
  try {
    const c = new Istemci({ host, kaynakIp, kimlik });
    const rapor = {
      zaman: now(), komut: "oku", modem_ip: host, kimlik_hazir: Boolean(kimlik),
      uclar: {}, ham_alanlar: {}, problems: [],
    };

    for (const uc of UCLAR) {
      process.stderr.write(`[oku] ${uc.yol}\n`);
      const r = await c.get(uc.yol);
      rapor.uclar[uc.ad] = { yol: uc.yol, kod: r.kod, boyut: r.govde.length, tur: uc.tur };
      rapor.problems.push(...r.problems.filter((p) => p.severity === "error" || p.kod === "AUTH_REQUIRED"));
      if (!r.ok || !r.govde) continue;

      if (uc.bicim === "ddwrt") {
        Object.assign(rapor.ham_alanlar, ciftleriAyikla(r.govde));
      } else if (uc.bicim === "nvram") {
        const { degerler, sayi, problems } = nvramAyikla(r.govdeBuf);
        rapor.nvram = degerler;
        rapor.nvram_anahtar_sayisi = sayi;
        rapor.problems.push(...problems);
      } else {
        // html: ham govdeyi ayri sakla (ayristirma Faz 2'de detaylanir)
        rapor.uclar[uc.ad].ham_html_boyut = r.govde.length;
      }
    }

    // Okunabilir gorunum (ham alanlar korunur)
    const { sim1, sim2 } = simGorunumu(rapor.ham_alanlar);
    rapor.sim1 = sim1;
    rapor.sim2 = sim2;
    rapor.sistem = sistemGorunumu(rapor.ham_alanlar);

    rapor.ok = sonucOk(rapor.problems);
    return rapor;
  } finally {
    hostuSerbestBirak(host);
  }
}

// Info.live.htm ham alanlarindan okunabilir sistem gorunumu.
function sistemGorunumu(ham) {
  const al = (k) => (ham[k] ?? "").trim() || undefined;
  return {
    lan_ip: al("lan_ip"),
    lan_mac: al("lan_mac"),
    lan_mac_uretici: ureticiTahmin(al("lan_mac")),
    wan_mac1: al("wan_mac1"),
    wifi_durum: al("wl_radio"),
    wifi_kanal: al("wl_channel"),
    uptime: al("uptime_spe") || al("uptime"),
    bellek: al("mem_info"),
    lan_proto: al("lan_proto"),
  };
}

// --- kesif: salt-okunur ---
async function kesif() {
  const { host, kaynakIp, community } = ortam();
  const rapor = { zaman: now(), komut: "kesif", modem_ip: host, problems: [] };
  process.stderr.write("[kesif] port taramasi...\n");
  rapor.kapilar = (await portTara(host, kaynakIp, TCP_KAPILARI)).map((p) => {
    const tanim = TCP_KAPILARI.find((k) => k.kapi === p.kapi);
    return { ...p, ad: tanim?.ad };
  });
  rapor.arp = await arpTablosu(host.split(".").slice(0, 3).join(".") + ".");
  rapor.mac = rapor.arp[host] || null;
  rapor.mac_uretici = ureticiTahmin(rapor.mac);

  // Parmak izi: kimliksiz kok sayfa
  const c = new Istemci({ host, kaynakIp, kimlik: null });
  process.stderr.write("[kesif] HTTP parmak izi...\n");
  const kok = await c.get("/");
  rapor.http = {
    kod: kok.kod,
    baslik: (kok.govde.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || "").trim() || null,
    ddwrt_izi: /prototype\.js|WEB-ROUTER|Industrial Cellular Router/i.test(kok.govde),
  };

  process.stderr.write("[kesif] SNMP...\n");
  rapor.snmp = await snmpKimlik(host, community);

  rapor.ok = sonucOk(rapor.problems);
  return rapor;
}

// --- izle: fark tabanli ornekleme ---
async function izle() {
  const { host, kaynakIp, kimlik } = ortam();
  const sure = Number(bayrak("--sure")) || 30;
  const c = new Istemci({ host, kaynakIp, kimlik });
  const ornekle = async () => {
    const a = await c.get("/asp/status/Info.live.htm");
    const b = await c.get("/asp/status/Status_Internet.live.asp");
    return { ...ciftleriAyikla(a.govde), ...ciftleriAyikla(b.govde) };
  };
  process.stderr.write(`[izle] ilk ornek...\n`);
  const ilk = await ornekle();
  process.stderr.write(`[izle] ${sure} sn bekleniyor (bu sirada anten/SIM oynatabilirsin)...\n`);
  await new Promise((r) => setTimeout(r, Math.min(sure * 1000, 300000)));
  process.stderr.write(`[izle] ikinci ornek...\n`);
  const son = await ornekle();

  const degisenler = {};
  for (const k of new Set([...Object.keys(ilk), ...Object.keys(son)])) {
    if (ilk[k] !== son[k]) degisenler[k] = { onceki: ilk[k], sonraki: son[k] };
  }
  return {
    zaman: now(), komut: "izle", modem_ip: host, sure_sn: sure,
    degisen_alan_sayisi: Object.keys(degisenler).length,
    degisenler, ok: true, problems: [],
  };
}

// --- konsol: telnet root shell (salt okunur) ---
async function konsol() {
  const { host, kaynakIp, kimlik } = ortam();
  if (!kimlik) {
    return { zaman: now(), komut: "konsol", modem_ip: host, ok: false,
      problems: [sorun("AUTH_REQUIRED", "telnet 5123")] };
  }
  const opts = { host, kaynakIp, kullanici: kimlik.kullanici, sifre: kimlik.sifre };
  const rapor = { zaman: now(), komut: "konsol", modem_ip: host, problems: [] };

  if (argv.includes("--nvram")) {
    process.stderr.write("[konsol] nvram tam dokumu (CLI)...\n");
    const { degerler, sayi, problems } = await konsolNvram(opts);
    rapor.nvram = degerler;
    rapor.nvram_anahtar_sayisi = sayi;
    rapor.problems.push(...problems);
  } else {
    process.stderr.write("[konsol] sistem kesfi (uname/id/nvram sayisi)...\n");
    const { ciktilar, komutlar, problems } = await konsolKesif(opts);
    rapor.komutlar = ciktilar;
    rapor.problems.push(...problems);
  }
  rapor.ok = sonucOk(rapor.problems);
  return rapor;
}

// --- ana akis ---
const KOMUTLAR = { dogrula, kesif, oku, izle, konsol };

async function main() {
  if (!komut || komut === "-h" || komut === "--help" || !KOMUTLAR[komut]) {
    process.stderr.write(
      "Kullanim: node ricon.js <dogrula|kesif|oku|izle|konsol> [--json d] [--kaynak d] [--sure sn] [--nvram]\n",
    );
    return komut && !KOMUTLAR[komut] ? 1 : 0;
  }

  // Kaydedilmis JSON'u yeniden goster (cihaza gitme)
  const kaynak = bayrak("--kaynak");
  let rapor;
  if (kaynak) {
    rapor = JSON.parse(readFileSync(kaynak, "utf8"));
  } else {
    rapor = await KOMUTLAR[komut]();
  }

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
  // Buraya normalde dusmemeli (kutuphane throw etmez); son emniyet.
  process.stderr.write(`Beklenmeyen hata: ${e?.stack || e}\n`);
  process.exit(1);
});
