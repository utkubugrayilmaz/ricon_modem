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

