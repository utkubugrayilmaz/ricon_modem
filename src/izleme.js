// IZLEME — donemsel ornekleme ve zaman cizelgesi.
//
// "Hangi alan canli degisiyor?" sorusunun cevabi: ayni uctan araliklarla
// ornek al, farkli olanlari isaretle. Cihaza YAZMAZ.
//
// KURAL (index.js ile ayni): process.env/argv okumaz, stdout'a yazmaz.

import { Client } from "./client.js";
import { parsePairs } from "./ddwrt.js";
import { problem, isOk } from "./problems.js";

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
export async function watchDevice(options) {
  const { host, sourceIp, credentials, durationSec = 60, intervalSec = 5 } = options;
  const c = new Client({ host, sourceIp, credentials });
  const baslangic = Date.now();
  const bitis = baslangic + Math.min(durationSec * 1000, 3600000);
  const aralik = Math.max(intervalSec, 1) * 1000;

  const ornekle = async () => {
    const a = await c.get("/asp/status/Info.live.htm");
    const b = await c.get("/asp/status/Status_Internet.live.asp");
    const reachable = Boolean(a.ok || b.ok);
    return { reachable, fields: { ...parsePairs(a.body || ""), ...parsePairs(b.body || "") } };
  };

  const samples = [];
  let previousFields = null;
  while (Date.now() < bitis) {
    const elapsedSec = Math.round((Date.now() - baslangic) / 100) / 10;
    const { reachable, fields } = await ornekle();
    const changed = {};
    if (previousFields) {
      for (const k of new Set([...Object.keys(previousFields), ...Object.keys(fields)])) {
        if (previousFields[k] !== fields[k]) changed[k] = { onceki: previousFields[k], next: fields[k] };
      }
    }
    const wanIp = (fields.w1_wan_ip || "").trim();
    samples.push({
      an_sn: elapsedSec,
      reachable,
      internet: hasInternet(wanIp),
      wanIp: wanIp || null,
      uptimeSec: fields.w1_wanup || null,
      sebeke: fields.m1network || null,
      signalDbm: fields.m1dbm || null,
      changedFields: Object.keys(changed).length,
      changed: previousFields ? changed : undefined,
    });
    notify(options, `${elapsedSec} sn · erisim ${reachable ? "var" : "YOK"}`
      + ` · internet ${hasInternet(wanIp) ? wanIp : "YOK"}`);
    if (reachable) previousFields = fields;
    const remaining = aralik - (Date.now() - baslangic - elapsedSec * 1000);
    if (Date.now() + Math.max(remaining, 0) >= bitis) break;
    await new Promise((r) => setTimeout(r, Math.max(remaining, 0)));
  }

  return {
    timestamp: now(), command: "izle", modemIp: host,
    durationSec: durationSec, aralik_sn: intervalSec,
    ornek_sayisi: samples.length,
    outages: findOutages(samples),
    samples,
    ok: true, problems: [],
  };
}

const hasInternet = (wanIp) => Boolean(wanIp && wanIp !== "0.0.0.0");

// Ardisik orneklerden kesinti pencereleri cikarir. Iki AYRI kesinti turu:
//   "internet" = WAN IP yok (hucresel baglanti dusmus)
//   "yonetim"  = cihaz HTTP'ye cevap vermiyor (reboot / kilitlenme)
// Doner: [{ tur, basla_sn, bitis_sn, sure_sn, hala_suruyor }]
export function findOutages(samples) {
  const output = [];
  for (const kind of ["internet", "yonetim"]) {
    let isOpen = null;
    for (const o of samples) {
      const kotu = kind === "internet" ? (o.reachable && !o.internet) : !o.reachable;
      if (kotu && isOpen === null) isOpen = o.an_sn;
      if (!kotu && isOpen !== null) {
        output.push({ kind, basla_sn: isOpen, bitis_sn: o.an_sn,
          durationSec: Math.round((o.an_sn - isOpen) * 10) / 10, hala_suruyor: false });
        isOpen = null;
      }
    }
    if (isOpen !== null) {
      const last = samples[samples.length - 1];
      output.push({ kind, basla_sn: isOpen, bitis_sn: last.an_sn,
        durationSec: Math.round((last.an_sn - isOpen) * 10) / 10, hala_suruyor: true });
    }
  }
  return output.sort((a, b) => a.basla_sn - b.basla_sn);
}

