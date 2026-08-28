// Rapor katmani — sonucu JSON'a ve insan-okunur metne cevirir.
//
// Sir hijyeni: JSON'a kimlik (kullanici/sifre) ASLA yazilmaz. Cikti nesnesi
// zaten kimlik tasimaz; yine de guvenlik agi olarak temizle() ile ozyinelemeli
// alan-adi + regex suzgeci uygulanir. Rapor paylasilabilir olmali.

import { SETTING_LABELS } from "./constants.js";

// Cikti nesnesinden sir tasiyabilecek alanlari ozyinelemeli siler.
// SIM PIN de sir: nvram anahtar adiyla da gelebilir, alan adiyla da.
const SIR_ALANLARI = new Set(["sifre", "password", "kimlik", "auth", "authorization",
  "pin", "m1s1simpin", "m1s2simpin"]);
const SIR_DESENI = /Basic\s+[A-Za-z0-9+/=]+/g;

export function stripSecrets(deger) {
  if (Array.isArray(deger)) return deger.map(stripSecrets);
  if (deger && typeof deger === "object") {
    const cikti = {};
    for (const [k, v] of Object.entries(deger)) {
      if (SIR_ALANLARI.has(k.toLowerCase())) continue;
      cikti[k] = stripSecrets(v);
    }
    return cikti;
  }
  if (typeof deger === "string") return deger.replace(SIR_DESENI, "Basic <gizli>");
  return deger;
}

export function writeJson(nesne) {
  return JSON.stringify(stripSecrets(nesne), null, 2);
}

// Bilinmeyen deger 0 degil "—" gosterilir.
const g = (v) => (v == null || v === "" ? "—" : v);

// PURE: bir nvram anahtar/deger ciftini gosterime cevirir (UI + rapor ortak).
// Sozlukte olmayan anahtar da calisir — adi anahtarin kendisi olur (gecirgen).
// Doner: { anahtar, ad, sayfa, gosterim, ham }
export function settingLabel(anahtar, deger) {
  const t = SETTING_LABELS[anahtar];
  const ham = deger == null ? null : String(deger);
  let gosterim;
  if (ham === null) gosterim = "—";
  else if (t?.gizli) gosterim = ham === "" ? "(bos)" : "••••";
  else if (t?.degerler && ham in t.degerler) gosterim = t.degerler[ham];
  else if (ham === "") gosterim = "(bos)";
  else gosterim = t?.birim ? `${ham} ${t.birim}` : ham;
  return { anahtar, ad: t?.ad || anahtar, sayfa: t?.sayfa || null, gosterim, ham };
}

// Olcum ozeti metni. Dagilimi saklamaz: medyanin yaninda min-maks da yazar,
// cunku tek sayi soylemek kucuk orneklemde yanlis guven verir.
function olcumMetni(r) {
  const s = [];
  const d = (x) => (x.medyan == null ? "—"
    : `${x.medyan} sn  (n=${x.n}, ${x.min}–${x.maks}, ort ${x.ortalama})`);
  s.push("\n  OLCUM OZETI");
  s.push(`    kayit                 : ${r.kayit_sayisi} satir`);
  s.push(`    kurulum               : ${r.kurulum.basarili}/${r.kurulum.denenen} basarili`
    + `${r.kurulum.basari_orani != null ? ` (%${r.kurulum.basari_orani})` : ""}`
    + ` · ilk denemede ${r.kurulum.ilk_denemede}`
    + ` · ${r.kurulum.farkli_cihaz} farkli cihaz`);
  if (r.elle_sn?.n) {
    s.push(`    ELLE surec (medyan)   : ${d(r.elle_sn)}`
      + `  = ${(r.elle_sn.medyan / 60).toFixed(1)} dk`);
  }
  s.push(`    arac suresi (medyan)  : ${d(r.arac_sn)}`);
  s.push(`    numara girisi (medyan): ${d(r.giris_sn)}`);
  s.push(`    dongu (giris + arac)  : ${r.dongu_sn ?? "—"} sn`);

  if (r.adimlar?.length) {
    s.push("\n    Adim kirilimi (medyan):");
    for (const a of r.adimlar) {
      s.push(`      ${a.darbogaz ? "▲" : " "} ${String(a.ad).padEnd(34)}`
        + `${String(a.medyan).padStart(6)} sn  (${a.min}–${a.maks})`);
    }
  }

  const k = r.karsilastirma;
  if (k) {
    s.push(`\n    ELLE SUREC: ${k.elle_sn} sn (${(k.elle_sn / 60).toFixed(1)} dk)`
      + ` · kaynak: ${k.elle_kaynak}${k.elle_n ? ` (n=${k.elle_n})` : ""}`);
    if (k.dongu) {
      s.push(`      dongu suresi      : %${k.dongu.azalma_yuzde} azalma`
        + ` · ${k.dongu.kat}x hizli · modem basina ${k.dongu.kazanilan_sn} sn kazanc`);
    }
    if (k.insan_mesgul) {
      s.push(`      insan mesgul suresi: %${k.insan_mesgul.azalma_yuzde} azalma`
        + ` · ${k.insan_mesgul.kat}x · gerisi GOZETIMSIZ geciyor`);
    }
    if (k.olcek) {
      s.push(`      ${k.olcek.modem} modemde toplam kazanc: ${k.olcek.kazanilan_saat} saat`);
    }
    if (k.uyari) s.push(`      ! ${k.uyari}`);
    if (k.uyari_elle) s.push(`      ! ${k.uyari_elle}`);
  } else {
    s.push("\n    (Elle sureci karsilastirmak icin: --elle-dk 15 --elle-kaynak \"...\")");
  }
  return s;
}

// Insan-okunur ozet (stderr'a; stdout saf JSON kalir).
export function summaryText(rapor) {
  const s = [];
  s.push(`Ricon modem — ${rapor.modem_ip || "?"}  (${rapor.zaman || ""})`);
  if (rapor.sistem) {
    s.push("\n  Sistem:");
    for (const [k, v] of Object.entries(rapor.sistem)) s.push(`    ${k.padEnd(16)}: ${g(v)}`);
  }
  for (const etiket of ["sim1", "sim2"]) {
    const sim = rapor[etiket];
    if (sim && Object.keys(sim).length) {
      s.push(`\n  ${etiket.toUpperCase()}:`);
      for (const [k, v] of Object.entries(sim)) s.push(`    ${k.padEnd(16)}: ${g(v)}`);
    }
  }
  if (rapor.kapilar) {
    s.push("\n  Acik kapilar:");
    for (const p of rapor.kapilar.filter((x) => x.acik)) {
      s.push(`    ${String(p.kapi).padEnd(6)} ${p.ad || ""}${p.banner ? "  banner: " + p.banner.slice(0, 40) : ""}`);
    }
  }
  if (rapor.nvram_anahtar_sayisi != null) {
    s.push(`\n  nvram: ${rapor.nvram_anahtar_sayisi} anahtar cekildi`);
  }
  if (rapor.komut === "fark") {
    s.push(`\n  nvram farki: ${rapor.ozet?.degisen || 0} degisen, `
      + `${rapor.ozet?.eklenen || 0} eklenen, ${rapor.ozet?.silinen || 0} silinen`);
    for (const [k, v] of Object.entries(rapor.degisen || {})) {
      s.push(`    ~ ${k}: ${g(v.eski)}  ->  ${g(v.yeni)}`);
    }
    for (const [k, v] of Object.entries(rapor.eklenen || {})) s.push(`    + ${k} = ${g(v)}`);
    for (const [k, v] of Object.entries(rapor.silinen || {})) s.push(`    - ${k} (idi: ${g(v)})`);
  }
  if (rapor.komut === "sim") {
    const s1 = rapor.sim1 || {};
    s.push("\n  SIM1:");
    for (const k of ["iccid_temiz", "imsi", "imei", "operator", "sim_durumu", "sebeke_tipi", "band", "sinyal_dbm", "hucre_id"]) {
      if (s1[k]) s.push(`    ${k.padEnd(14)}: ${s1[k]}`);
    }
    s.push(`    ${"msisdn".padEnd(14)}: ${g(rapor.msisdn)}${rapor.msisdn_kaynak ? " (" + rapor.msisdn_kaynak + ")" : ""}`);
    if (rapor.msisdn_not) s.push(`    -> ${rapor.msisdn_not}`);
  }
  if (rapor.komut === "hazirla" || rapor.komut === "hazirla-dongu") {
    s.push(`
  Hazirla — durum: ${g(rapor.durum)}${rapor.deneme ? " (deneme " + rapor.deneme + ")" : ""}`);
    if (rapor.son_eylem) s.push(`  Eylem: ${rapor.son_eylem}`);
    if (rapor.internet) {
      s.push(`  Internet: ${rapor.internet.var
        ? `VAR ${rapor.internet.wan_ip} (${rapor.internet.sure_sn} sn) — SIM calisiyor`
        : `YOK (${rapor.internet.sure_sn} sn bekledi) — SIM durumu `
          + `${g(rapor.internet.sim_durumu)} · PIN kilidi olabilir`}`);
    }
    if (rapor.kayit) {
      const k = rapor.kayit;
      s.push(`  Kayit: tel ${g(k.telefon)} · ICCID ${g(k.iccid)} · IMEI ${g(k.imei)}`
        + ` · MAC ${g(k.lan_mac)} · ${g(k.operator)}`
        + `${k.wan_ip ? ` · WAN ${k.wan_ip}` : ""}`);
    }
    if (rapor.hazirlanan) {
      s.push(`  Hazirlanan modem: ${rapor.hazirlanan.length}`);
      for (const h of rapor.hazirlanan) {
        s.push(`    ${h.ok ? "✓" : "✗"} ${g(h.durum)} · tel ${g(h.telefon)} · ICCID ${g(h.iccid)}`);
      }
    }
  }
  if (rapor.komut === "uygula") {
    s.push(`\n  Provizyon (${rapor.profil}) — ${rapor.uygula ? "GERCEK YAZMA" : "KURU (dry-run)"}`);
    s.push(`  Durum: ${g(rapor.durum)}`);
    if (rapor.plan) {
      s.push(`  Degisecek: ${rapor.plan.degisecek_sayisi}, ayni: ${rapor.plan.ayni_sayisi}`);
      for (const [k, v] of Object.entries(rapor.plan.degisecek || {})) {
        s.push(`    ~ ${k}: ${g(v.mevcut)}  ->  ${g(v.hedef)}`);
      }
      if (rapor.plan.eksik_anahtarlar?.length) {
        s.push(`    ⚠ cihazda olmayan (yeni yazilacak): ${rapor.plan.eksik_anahtarlar.join(", ")}`);
      }
    }
    if (rapor.dogrulama) {
      s.push(`  Dogrulama: ${rapor.dogrulama.tamam
        ? `TAMAM (${rapor.dogrulama.bekleme_sn} sn)`
        : "kalan: " + (rapor.dogrulama.kalan_degisecek || []).join(", ")}`);
      if (!rapor.dogrulama.tamam && rapor.dogrulama.sebep) {
        s.push(`        → ${rapor.dogrulama.sebep}`);
      }
    }
    if (rapor.not) s.push(`  Not: ${rapor.not}`);
  }
  if (rapor.komut === "izle") {
    s.push(`\n  Izleme: ${rapor.ornek_sayisi} ornek · ${rapor.aralik_sn} sn aralik`
      + ` · ${rapor.sure_sn} sn`);
    for (const o of rapor.ornekler || []) {
      s.push(`    ${String(o.an_sn).padStart(6)} sn  erisim ${o.erisim ? "var" : "YOK"}`
        + `  internet ${o.internet ? g(o.wan_ip) : "YOK"}`
        + `  sinyal ${g(o.sinyal_dbm)}  degisen ${o.degisen_alan}`);
    }
    if (rapor.kesintiler?.length) {
      s.push("\n  KESINTILER:");
      for (const k of rapor.kesintiler) {
        s.push(`    ${k.tur.padEnd(9)} ${k.basla_sn} sn -> ${k.bitis_sn} sn`
          + `  = ${k.sure_sn} sn${k.hala_suruyor ? "  (HALA SURUYOR)" : ""}`);
      }
    } else {
      s.push("  KESINTI YOK (ne internet ne yonetim erisimi dustu)");
    }
  }
  if (rapor.komut === "olcum") s.push(...olcumMetni(rapor));
  if (rapor.problems?.length) {
    s.push("\n  Sorunlar:");
    for (const p of rapor.problems) {
      const im = p.severity === "error" ? "✗" : "!";
      s.push(`    ${im} [${p.kod}] ${p.message}`);
      if (p.check) s.push(`        → ${p.check}`);
    }
  }
  return s.join("\n");
}
