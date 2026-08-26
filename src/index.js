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

import { UCLAR, TCP_KAPILARI } from "./sabitler.js";
import {
  Istemci, hostMesgulMu, hostuKilitle, hostuSerbestBirak,
} from "./istemci.js";
import { ciftleriAyikla, simGorunumu } from "./ddwrt.js";
import { nvramAyikla, nvramFark } from "./nvram.js";
import {
  yerelArayuzler, arpTablosu, ureticiTahmin,
} from "./ag.js";
import { portTara, erisilebilirMi } from "./tarayici.js";
import { snmpKimlik } from "./snmp.js";
import { konsolKesif, konsolNvram } from "./konsol.js";
import { sorun, sonucOk } from "./sorunlar.js";

// Provizyon (Faz 3) — çekirdek dışa aktarımı (paket/CLI/endpoint aynı API).
export { provizyonUygula, provizyonPlanla, planiAyir } from "./provizyon.js";
export { SAHA_PROFILI, FABRIKA_PROFILI, PROFILLER } from "./profil.js";

const now = () => new Date().toISOString();
const onekAl = (host) => host.split(".").slice(0, 3).join(".") + ".";
const bildir = (opts, mesaj) => { if (typeof opts.ilerle === "function") opts.ilerle(mesaj); };

// --- dogrula: ortam/erisim teshisi ---
export async function modemDogrula(opts) {
  const { host, kaynakIp, kimlik } = opts;
  const rapor = { zaman: now(), komut: "dogrula", modem_ip: host, problems: [] };
  rapor.yerel_arayuzler = yerelArayuzler();
  rapor.kaynak_ip = kaynakIp || null;
  if (!kaynakIp) rapor.problems.push(sorun("NO_SOURCE_IP", `${onekAl(host)}50`));

  rapor.erisilebilir = await erisilebilirMi(host, kaynakIp);
  if (!rapor.erisilebilir) rapor.problems.push(sorun("DEVICE_UNREACHABLE", host));

  if (rapor.erisilebilir) {
    const c = new Istemci({ host, kaynakIp, kimlik });
    const sistem = await c.get("/asp/status/Info.live.htm");
    rapor.sistem_ucu = { kod: sistem.kod, boyut: sistem.govde?.length ?? 0 };
    const korumali = await c.get("/asp/status/Status_Internet.live.asp");
    rapor.kimlikli_uc = { kod: korumali.kod };
    rapor.problems.push(...korumali.problems);
  }
  rapor.kimlik_hazir = Boolean(kimlik);
  rapor.ok = sonucOk(rapor.problems);
  return rapor;
}

// --- oku: HER SEYI cek (sistem + SIM + ayar + nvram) ---
export async function modemOku(opts) {
  const { host, kaynakIp, kimlik } = opts;
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
      bildir(opts, `oku ${uc.yol}`);
      const r = await c.get(uc.yol);
      rapor.uclar[uc.ad] = { yol: uc.yol, kod: r.kod, boyut: r.govde?.length ?? 0, tur: uc.tur };
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
        rapor.uclar[uc.ad].ham_html_boyut = r.govde.length;
      }
    }
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
export function sistemGorunumu(ham) {
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

// --- kesif: salt-okunur port/parmak-izi/SNMP ---
export async function modemKesif(opts) {
  const { host, kaynakIp, community = "public" } = opts;
  const rapor = { zaman: now(), komut: "kesif", modem_ip: host, problems: [] };
  bildir(opts, "port taramasi");
  rapor.kapilar = (await portTara(host, kaynakIp, TCP_KAPILARI)).map((p) => {
    const tanim = TCP_KAPILARI.find((k) => k.kapi === p.kapi);
    return { ...p, ad: tanim?.ad };
  });
  rapor.arp = await arpTablosu(onekAl(host));
  rapor.mac = rapor.arp[host] || null;
  rapor.mac_uretici = ureticiTahmin(rapor.mac);

  const c = new Istemci({ host, kaynakIp, kimlik: null });
  bildir(opts, "HTTP parmak izi");
  const kok = await c.get("/");
  rapor.http = {
    kod: kok.kod,
    baslik: (kok.govde.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || "").trim() || null,
    ddwrt_izi: /prototype\.js|WEB-ROUTER|Industrial Cellular Router/i.test(kok.govde),
  };
  bildir(opts, "SNMP");
  rapor.snmp = await snmpKimlik(host, community);
  rapor.ok = sonucOk(rapor.problems);
  return rapor;
}

// --- izle: fark tabanli ornekleme ---
export async function modemIzle(opts) {
  const { host, kaynakIp, kimlik, sureSn = 30 } = opts;
  const c = new Istemci({ host, kaynakIp, kimlik });
  const ornekle = async () => {
    const a = await c.get("/asp/status/Info.live.htm");
    const b = await c.get("/asp/status/Status_Internet.live.asp");
    return { ...ciftleriAyikla(a.govde), ...ciftleriAyikla(b.govde) };
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
export async function modemKonsol(opts) {
  const { host, kaynakIp, kimlik, nvram = false } = opts;
  if (!kimlik) {
    return { zaman: now(), komut: "konsol", modem_ip: host, ok: false,
      problems: [sorun("AUTH_REQUIRED", "telnet 5123")] };
  }
  const kOpts = { host, kaynakIp, kullanici: kimlik.kullanici, sifre: kimlik.sifre };
  const rapor = { zaman: now(), komut: "konsol", modem_ip: host, problems: [] };
  if (nvram) {
    bildir(opts, "nvram tam dokumu (CLI)");
    const { degerler, sayi, problems } = await konsolNvram(kOpts);
    rapor.nvram = degerler;
    rapor.nvram_anahtar_sayisi = sayi;
    rapor.problems.push(...problems);
  } else {
    bildir(opts, "sistem kesfi");
    const { ciktilar, problems } = await konsolKesif(kOpts);
    rapor.komutlar = ciktilar;
    rapor.problems.push(...problems);
  }
  rapor.ok = sonucOk(rapor.problems);
  return rapor;
}

// --- fark: iki nvram nesnesini karsilastir (saf, cihaza gitmez) ---
export function nvramFarkHesapla(once, sonra) {
  const f = nvramFark(once, sonra);
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
