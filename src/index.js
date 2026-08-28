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

import { ENDPOINTS, TCP_PORTS, SETTING_LABELS } from "./constants.js";
import {
  Client, isHostBusy, lockHost, unlockHost,
} from "./client.js";
import { parsePairs, simView } from "./ddwrt.js";
import { parseNvram, diffNvram } from "./nvram.js";
import {
  localInterfaces, arpTable, ipv6Neighbors, guessVendor,
} from "./network.js";
import { scanPorts, isReachable } from "./scanner.js";
import { snmpIdentity } from "./snmp.js";
import { consoleRecon, consoleNvram } from "./console.js";
import { problem, isOk } from "./problems.js";

// Provizyon (Faz 3) — çekirdek dışa aktarımı (paket/CLI/endpoint aynı API).
export {
  applyProvisioning, planProvisioning, groupPlan, applyPin,
} from "./provisioning.js";
export {
  FIELD_PROFILE, FACTORY_PROFILE, PROFILES, DEVICE_NAME_KEY, SIM_PIN_KEY,
} from "./profile.js";
export {
  provisionModem, provisionLoop, pcPreflight, nextAction, provisionRecord,
  readIdentity, simTakiliMi, waitForInternet, simPinHedefi,
  assessDevice, provisionEksikleri,
} from "./pipeline.js";
export { readSim, normalizePhone, telefonGirdiBicimi, parseSimStatus } from "./sim.js";
// AT katmani — modulun kendisiyle konusma (telefon numarasi, SIM kilidi).
export {
  readMsisdn, readSimLock, simPinKaldir, simPinKilitle,
  simKilitKaldirmaKarari, simKilidiUygunMu,
  atPortBul, atKomut, atYazanMi, AT_PORT, PIN_TOPLAM_VARSAYILAN,
  parseCnum, parseCpin, parsePinCounter, parseClck, parseCcid,
} from "./at.js";
// Konsol katmani — telnet root shell. Kendi komutunu calistirmak isteyen
// tuketici icin acik: runConsole(opts, ["uname -a"]).
export {
  runConsole, consoleNvram, consoleRecon, konsolKimligi, parseNvramShow,
} from "./console.js";
// Gosterim sozlugu — UI/rapor icin (motor kullanmaz).
export { settingLabel, sorunTr, problemleriTurkcelestir, SORUN_TR } from "./report.js";
export { PROBLEM_CODES } from "./problems.js";
// Olcum ozeti — PURE, kaydedilmis calistirma satirlarindan istatistik.
export { summarizeMetrics, dagilim } from "./metrics.js";
export { SETTING_LABELS };

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

// --- izle: DONEMSEL ornekleme + zaman cizelgesi ---
//
// Iki isi birden yapar:
//   1) Alan degisimi tespiti (bir alan gercekten canli mi?) — ardisik
//      ornekler arasindaki farklar.
//   2) INTERNET KESINTISI gozlemi — WAN IP'nin gidip geldigi anlar. Provizyon
//      sirasinda "internet kesiliyor mu, ne kadar" sorusunun olculmus cevabi.
//
// Cihaz cevap vermezse ornek KAYBEDILMEZ: `erisim:false` olarak kaydedilir —
// reboot penceresi de veridir (yonetim erisiminin kesildigi sure).
//
// Not: modem TEK BAGLANTILI ve her ornek 2 GET (aralarinda bekleme) demek;
// bu yuzden 5 sn'nin altinda aralik pratikte anlamsiz.
export async function watchDevice(opts) {
  const { host, kaynakIp, kimlik, sureSn = 60, aralikSn = 5 } = opts;
  const c = new Client({ host, kaynakIp, kimlik });
  const baslangic = Date.now();
  const bitis = baslangic + Math.min(sureSn * 1000, 3600000);
  const aralik = Math.max(aralikSn, 1) * 1000;

  const ornekle = async () => {
    const a = await c.get("/asp/status/Info.live.htm");
    const b = await c.get("/asp/status/Status_Internet.live.asp");
    const erisim = Boolean(a.ok || b.ok);
    return { erisim, alanlar: { ...parsePairs(a.govde || ""), ...parsePairs(b.govde || "") } };
  };

  const ornekler = [];
  let oncekiAlanlar = null;
  while (Date.now() < bitis) {
    const anSn = Math.round((Date.now() - baslangic) / 100) / 10;
    const { erisim, alanlar } = await ornekle();
    const degisen = {};
    if (oncekiAlanlar) {
      for (const k of new Set([...Object.keys(oncekiAlanlar), ...Object.keys(alanlar)])) {
        if (oncekiAlanlar[k] !== alanlar[k]) degisen[k] = { onceki: oncekiAlanlar[k], sonraki: alanlar[k] };
      }
    }
    const wanIp = (alanlar.w1_wan_ip || "").trim();
    ornekler.push({
      an_sn: anSn,
      erisim,
      internet: internetVarMi(wanIp),
      wan_ip: wanIp || null,
      bagli_sure: alanlar.w1_wanup || null,
      sebeke: alanlar.m1network || null,
      sinyal_dbm: alanlar.m1dbm || null,
      degisen_alan: Object.keys(degisen).length,
      degisen: oncekiAlanlar ? degisen : undefined,
    });
    bildir(opts, `${anSn} sn · erisim ${erisim ? "var" : "YOK"}`
      + ` · internet ${internetVarMi(wanIp) ? wanIp : "YOK"}`);
    if (erisim) oncekiAlanlar = alanlar;
    const kalan = aralik - (Date.now() - baslangic - anSn * 1000);
    if (Date.now() + Math.max(kalan, 0) >= bitis) break;
    await new Promise((r) => setTimeout(r, Math.max(kalan, 0)));
  }

  return {
    zaman: now(), komut: "izle", modem_ip: host,
    sure_sn: sureSn, aralik_sn: aralikSn,
    ornek_sayisi: ornekler.length,
    kesintiler: kesintileriBul(ornekler),
    ornekler,
    ok: true, problems: [],
  };
}

const internetVarMi = (wanIp) => Boolean(wanIp && wanIp !== "0.0.0.0");

// Ardisik orneklerden kesinti pencereleri cikarir. Iki AYRI kesinti turu:
//   "internet" = WAN IP yok (hucresel baglanti dusmus)
//   "yonetim"  = cihaz HTTP'ye cevap vermiyor (reboot / kilitlenme)
// Doner: [{ tur, basla_sn, bitis_sn, sure_sn, hala_suruyor }]
export function kesintileriBul(ornekler) {
  const cikti = [];
  for (const tur of ["internet", "yonetim"]) {
    let acik = null;
    for (const o of ornekler) {
      const kotu = tur === "internet" ? (o.erisim && !o.internet) : !o.erisim;
      if (kotu && acik === null) acik = o.an_sn;
      if (!kotu && acik !== null) {
        cikti.push({ tur, basla_sn: acik, bitis_sn: o.an_sn,
          sure_sn: Math.round((o.an_sn - acik) * 10) / 10, hala_suruyor: false });
        acik = null;
      }
    }
    if (acik !== null) {
      const son = ornekler[ornekler.length - 1];
      cikti.push({ tur, basla_sn: acik, bitis_sn: son.an_sn,
        sure_sn: Math.round((son.an_sn - acik) * 10) / 10, hala_suruyor: true });
    }
  }
  return cikti.sort((a, b) => a.basla_sn - b.basla_sn);
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
