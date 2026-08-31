// Cihaz OKUMA islemleri — dogrula / oku / kesif / konsol.
//
// Neden index.js'ten ayrildi: index.js hem PUBLIC API KAPISI hem bu
// islemlerin govdesiydi (316 satirin 250'si govde). API'yi ogrenmek icin
// acilan dosyada uygulama gurultusu vardi. Simdi index.js yalniz kapi.
//
// KURAL (index.js ile ayni): process.env OKUMAZ, argv OKUMAZ, stdout'a
// YAZMAZ. Girdi `opts`, cikti sonuc nesnesi (throw yok, problems[]).

import { ENDPOINTS, TCP_PORTS } from "../domain/constants.js";
import { Client, isHostBusy, lockHost, unlockHost } from "../transport/client.js";
import { parsePairs, simView } from "../parse/ddwrt.js";
import { parseNvram } from "../parse/nvram.js";
import { localInterfaces, arpTable, ipv6Neighbors, guessVendor } from "../transport/network.js";
import { scanPorts, isReachable } from "../transport/scanner.js";
import { snmpIdentity } from "../transport/snmp.js";
import { consoleRecon, consoleNvram } from "../transport/console.js";
import { problem, isOk } from "../domain/problems.js";

const now = () => new Date().toISOString();
const onekAl = (host) => host.split(".").slice(0, 3).join(".") + ".";
const bildir = (opts, mesaj) => { if (typeof opts.ilerle === "function") opts.ilerle(mesaj); };

// --- dogrula: ortam/erisim teshisi ---
export async function checkDevice(opts) {
  const { host, kaynakIp, kimlik } = opts;
  const rapor = { zaman: now(), komut: "dogrula", modem_ip: host, problems: [] };
  rapor.yerel_arayuzler = localInterfaces();
  rapor.kaynak_ip = kaynakIp || null;
  if (!kaynakIp) rapor.problems.push(problem("NO_SOURCE_IP", `${onekAl(host)}50`));

  rapor.erisilebilir = await isReachable(host, kaynakIp);
  if (!rapor.erisilebilir) rapor.problems.push(problem("DEVICE_UNREACHABLE", host));

  if (rapor.erisilebilir) {
    const c = new Client({ host, kaynakIp, kimlik });
    const sistem = await c.get("/asp/status/Info.live.htm");
    rapor.sistem_ucu = { kod: sistem.kod, boyut: sistem.govde?.length ?? 0 };
    const korumali = await c.get("/asp/status/Status_Internet.live.asp");
    rapor.kimlikli_uc = { kod: korumali.kod };
    rapor.problems.push(...korumali.problems);
  }
  rapor.kimlik_hazir = Boolean(kimlik);
  rapor.ok = isOk(rapor.problems);
  return rapor;
}

// --- oku: HER SEYI cek (sistem + SIM + ayar + nvram) ---
export async function readDevice(opts) {
  const { host, kaynakIp, kimlik } = opts;
  if (isHostBusy(host)) {
    return { zaman: now(), komut: "oku", modem_ip: host, ok: false,
      problems: [problem("DEVICE_BUSY", host)] };
  }
  lockHost(host);
  try {
    const c = new Client({ host, kaynakIp, kimlik });
    const rapor = {
      zaman: now(), komut: "oku", modem_ip: host, kimlik_hazir: Boolean(kimlik),
      uclar: {}, ham_alanlar: {}, problems: [],
    };
    for (const uc of ENDPOINTS) {
      bildir(opts, `oku ${uc.yol}`);
      const r = await c.get(uc.yol);
      rapor.uclar[uc.ad] = { yol: uc.yol, kod: r.kod, boyut: r.govde?.length ?? 0, tur: uc.tur };
      rapor.problems.push(...r.problems.filter((p) => p.severity === "error" || p.kod === "AUTH_REQUIRED"));
      if (!r.ok || !r.govde) continue;
      if (uc.bicim === "ddwrt") {
        Object.assign(rapor.ham_alanlar, parsePairs(r.govde));
      } else if (uc.bicim === "nvram") {
        const { degerler, sayi, problems } = parseNvram(r.govdeBuf);
        rapor.nvram = degerler;
        rapor.nvram_anahtar_sayisi = sayi;
        rapor.problems.push(...problems);
      } else {
        rapor.uclar[uc.ad].ham_html_boyut = r.govde.length;
      }
    }
    const { sim1, sim2 } = simView(rapor.ham_alanlar);
    rapor.sim1 = sim1;
    rapor.sim2 = sim2;
    rapor.sistem = systemView(rapor.ham_alanlar);
    rapor.ok = isOk(rapor.problems);
    return rapor;
  } finally {
    unlockHost(host);
  }
}

// Info.live.htm ham alanlarindan okunabilir sistem gorunumu.
export function systemView(ham) {
  const al = (k) => (ham[k] ?? "").trim() || undefined;
  return {
    lan_ip: al("lan_ip"),
    lan_mac: al("lan_mac"),
    lan_mac_uretici: guessVendor(al("lan_mac")),
    wan_mac1: al("wan_mac1"),
    wifi_durum: al("wl_radio"),
    wifi_kanal: al("wl_channel"),
    uptime: al("uptime_spe") || al("uptime"),
    bellek: al("mem_info"),
    lan_proto: al("lan_proto"),
  };
}

// --- kesif: salt-okunur port/parmak-izi/SNMP ---
export async function discoverDevice(opts) {
  const { host, kaynakIp, community = "public" } = opts;
  const rapor = { zaman: now(), komut: "kesif", modem_ip: host, problems: [] };
  bildir(opts, "port taramasi");
  rapor.kapilar = (await scanPorts(host, kaynakIp, TCP_PORTS)).map((p) => {
    const tanim = TCP_PORTS.find((k) => k.kapi === p.kapi);
    return { ...p, ad: tanim?.ad };
  });
  rapor.arp = await arpTable(onekAl(host));
  rapor.mac = rapor.arp[host] || null;
  rapor.mac_uretici = guessVendor(rapor.mac);
  // IPv6 komsu tablosu: cihazin IPv4'u bilinmiyorsa (yanlis alt ag) OUI'den
  // yine de "orada bir Ricon var" denebilir — yanlis-IP teshisini kolaylastirir.
  rapor.ipv6_komsular = (await ipv6Neighbors())
    .map((k) => ({ ...k, uretici: guessVendor(k.mac) }))
    .filter((k) => k.uretici);

  const c = new Client({ host, kaynakIp, kimlik: null });
  bildir(opts, "HTTP parmak izi");
  const kok = await c.get("/");
  // GOVDE NULL OLABILIR — cihaz erisilemezse Client istegi tamamlayamaz ve
  // `govde: null` doner. Burada dogrudan .match() cagriliyordu ve komut
  // TypeError ile COKUYORDU: yani kablo takili degilken ya da modem kapaliyken
  // `kesif` hic cikti uretmiyordu (tam da teshis icin cagrilacagi an). Bu
  // kutuphanenin temel sozlesmesini de bozuyordu: throw etmez, problems[] tasir.
  const govde = kok.govde || "";
  rapor.http = {
    kod: kok.kod,
    baslik: (govde.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || "").trim() || null,
    ddwrt_izi: /prototype\.js|WEB-ROUTER|Industrial Cellular Router/i.test(govde),
  };
  // Erisilemedi ise SEBEBI tasi: rapor "parmak izi yok" derken neden
  // olmadigini da soylemeli.
  rapor.problems.push(...kok.problems.filter((p) => p.severity === "error"));
  bildir(opts, "SNMP");
  rapor.snmp = await snmpIdentity(host, community);
  rapor.ok = isOk(rapor.problems);
  return rapor;
}

// --- konsol: telnet root shell (salt okunur) ---
// opts.nvram=true ise tam nvram; degilse sistem kesfi.
export async function readConsole(opts) {
  const { host, kaynakIp, kimlik, nvram = false } = opts;
  if (!kimlik) {
    return { zaman: now(), komut: "konsol", modem_ip: host, ok: false,
      problems: [problem("AUTH_REQUIRED", "telnet 5123")] };
  }
  const kOpts = { host, kaynakIp, kullanici: kimlik.kullanici, sifre: kimlik.sifre };
  const rapor = { zaman: now(), komut: "konsol", modem_ip: host, problems: [] };
  if (nvram) {
    bildir(opts, "nvram tam dokumu (CLI)");
    const { degerler, sayi, problems } = await consoleNvram(kOpts);
    rapor.nvram = degerler;
    rapor.nvram_anahtar_sayisi = sayi;
    rapor.problems.push(...problems);
  } else {
    bildir(opts, "sistem kesfi");
    const { ciktilar, problems } = await consoleRecon(kOpts);
    rapor.komutlar = ciktilar;
    rapor.problems.push(...problems);
  }
  rapor.ok = isOk(rapor.problems);
  return rapor;
}

