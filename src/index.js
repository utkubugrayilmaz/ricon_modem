// Public API — cekirdek islemler. redbox-device kalibi: tum orkestrasyon
// burada, importlanabilir saf fonksiyonlar halinde. Ic durum: yok.
//
// KURAL: bu dosya process.env OKUMAZ, argv OKUMAZ, stdout'a YAZMAZ. Girdi
// acikca `opts` ile gelir, cikti bir sonuc nesnesidir (throw yok, problems[]).
// Uzerine oturan tuketiciler: ricon.js (CLI), ileride HTTP endpoint, ya da
// baska bir Node projesi (paket olarak import).
//
// opts (ortak): { host, kaynakIp, kimlik:{kullanici,sifre}|null }
// Ilerleme bildirimi istersen opts.ilerle(mesaj) verilebilir (varsayilan: yok).

import { ENDPOINTS, TCP_PORTS } from "./constants.js";
import {
  Client, isHostBusy, lockHost, unlockHost,
} from "./client.js";
import { parsePairs, simView } from "./ddwrt.js";
import { parseNvram, diffNvram } from "./nvram.js";
import {
  localInterfaces, arpTable, guessVendor,
} from "./network.js";
import { scanPorts, isReachable } from "./scanner.js";
import { snmpIdentity } from "./snmp.js";
import { consoleRecon, consoleNvram } from "./console.js";
import { problem, isOk } from "./problems.js";

// Provizyon (Faz 3) — çekirdek dışa aktarımı (paket/CLI/endpoint aynı API).
export { applyProvisioning, planProvisioning, splitPlan } from "./provisioning.js";
export { FIELD_PROFILE, FACTORY_PROFILE, PROFILES } from "./profile.js";
export { provisionModem, provisionLoop, pcPreflight, nextAction } from "./pipeline.js";

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

  const c = new Client({ host, kaynakIp, kimlik: null });
  bildir(opts, "HTTP parmak izi");
  const kok = await c.get("/");
  rapor.http = {
    kod: kok.kod,
    baslik: (kok.govde.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || "").trim() || null,
    ddwrt_izi: /prototype\.js|WEB-ROUTER|Industrial Cellular Router/i.test(kok.govde),
  };
  bildir(opts, "SNMP");
  rapor.snmp = await snmpIdentity(host, community);
  rapor.ok = isOk(rapor.problems);
  return rapor;
}

// --- izle: fark tabanli ornekleme ---
export async function watchDevice(opts) {
  const { host, kaynakIp, kimlik, sureSn = 30 } = opts;
  const c = new Client({ host, kaynakIp, kimlik });
  const ornekle = async () => {
    const a = await c.get("/asp/status/Info.live.htm");
    const b = await c.get("/asp/status/Status_Internet.live.asp");
    return { ...parsePairs(a.govde), ...parsePairs(b.govde) };
  };
  bildir(opts, "ilk ornek");
  const ilk = await ornekle();
  bildir(opts, `${sureSn} sn bekleniyor (anten/SIM oynatabilirsin)`);
  await new Promise((r) => setTimeout(r, Math.min(sureSn * 1000, 300000)));
  bildir(opts, "ikinci ornek");
  const son = await ornekle();
  const degisenler = {};
  for (const k of new Set([...Object.keys(ilk), ...Object.keys(son)])) {
    if (ilk[k] !== son[k]) degisenler[k] = { onceki: ilk[k], sonraki: son[k] };
  }
  return {
    zaman: now(), komut: "izle", modem_ip: host, sure_sn: sureSn,
    degisen_alan_sayisi: Object.keys(degisenler).length,
    degisenler, ok: true, problems: [],
  };
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

// --- fark: iki nvram nesnesini karsilastir (saf, cihaza gitmez) ---
export function computeNvramDiff(once, sonra) {
  const f = diffNvram(once, sonra);
  return {
    zaman: now(), komut: "fark",
    degisen: f.degisen, eklenen: f.eklenen, silinen: f.silinen,
    ozet: {
      degisen: Object.keys(f.degisen).length,
      eklenen: Object.keys(f.eklenen).length,
      silinen: Object.keys(f.silinen).length,
    },
    ok: true, problems: [],
  };
}
