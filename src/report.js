// Rapor katmani — sonucu JSON'a ve insan-okunur metne cevirir.
//
// Sir hijyeni: JSON'a kimlik (kullanici/sifre) ASLA yazilmaz. Cikti nesnesi
// zaten kimlik tasimaz; yine de guvenlik agi olarak temizle() ile ozyinelemeli
// alan-adi + regex suzgeci uygulanir. Rapor paylasilabilir olmali.

import { SETTING_LABELS } from "./settings.js";

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

// Provizyon planini EKRANA HAZIR satirlara cevirir. once = kurulum oncesi,
// sonra = hedef. Tuketici (terminal ozeti ya da baska bir arayuz) nvram
// anahtari bilmez; satirlar hazir gelir.
//
// Sira: profil sirasi DEGIL, sozluk sirasi. Profil "motorun yazma sirasi"na
// gore dizili (WLAN basta, LAN sonda); teknisyen ise cihazin ARAYUZ sirasiyla
// okur (Main Link -> Others -> Backup Link -> Wireless -> LAN).
// SETTING_LABELS tam o sirada yazildi.
export function planRows(plan) {
  const sozlukSirasi = Object.keys(SETTING_LABELS);
  const anahtarlar = Object.keys(plan.hedef || {}).sort((a, b) => {
    const ia = sozlukSirasi.indexOf(a);
    const ib = sozlukSirasi.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return anahtarlar.map((k) => {
    const once = settingLabel(k, plan.onceki?.[k]);
    const sonra = settingLabel(k, plan.hedef[k]);
    return {
      anahtar: k,
      ad: once.ad,
      sayfa: once.sayfa,
      once: once.gosterim,
      sonra: sonra.gosterim,
      degisecek: Boolean(plan.degisecek && k in plan.degisecek),
    };
  });
}

// Plan satirlarini terminale basilacak metne cevirir. Sayfa basliklariyla
// gruplar; degisecek satiri * ile isaretler. Bu, arayuzdeki iki panelin
// (once/sonra) terminal karsiligi.
export function planMetni(satirlar) {
  const s = [];
  let sonSayfa = null;
  for (const r of satirlar) {
    if (r.sayfa !== sonSayfa) { s.push(`  ${r.sayfa || "(sayfasiz)"}`); sonSayfa = r.sayfa; }
    s.push(`    ${String(r.ad).padEnd(24)}${String(r.once).padEnd(16)}`
      + ` -> ${String(r.sonra).padEnd(16)}${r.degisecek ? " *" : ""}`);
  }
  return s.join("\n");
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
  // modem_ip eski komutlarin alani; degerlendirme raporu konumu
  // `modem.host` icinde tasiyor. Ikisine de bak, yoksa "?" yaz.
  s.push(`Ricon modem — ${rapor.modem_ip || rapor.modem?.host || "?"}`
    + `  (${rapor.zaman || ""})`);
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
  // Yeni tek-is komutlari: kisa ozet. Uzun metin yok — stdout'taki JSON
  // zaten tam veri; buradaki satir "bir bakista ne oldu" icin.
  if (rapor.komut === "degerlendir") {
    s.push(`
  konum        : ${rapor.modem?.konum ?? "modem yok"}`);
    s.push(`  telefon      : ${rapor.telefon?.numara ?? "—"}`
      + (rapor.telefon?.kaynak ? ` (${rapor.telefon.kaynak})` : ""));
    if (rapor.sim) {
      s.push(`  SIM          : ${rapor.sim.takili ? "takili" : "YOK"}`
        + `${rapor.sim.kilit ? ` · ${rapor.sim.kilit.toUpperCase()} kilitli` : ""}`
        + `${rapor.sim.pin_kalan != null ? ` · kalan hak ${rapor.sim.pin_kalan}` : ""}`);
    }
    if (rapor.internet) {
      s.push(`  internet     : ${rapor.internet.var ? rapor.internet.wan_ip : "YOK"}`);
    }
    s.push(`  eksik        : ${rapor.eksik?.length ? rapor.eksik.join(", ") : "yok"}`);
    s.push(`  baslatilabilir: ${rapor.baslatilabilir ? "EVET" : "hayir"}`);
    if (rapor.tekrar) {
      s.push(`  tekrar       : ${rapor.tekrar.tekrar
        ? `${rapor.tekrar.sonra_sn} sn sonra (${rapor.tekrar.sebep})` : `yok (${rapor.tekrar.sebep})`}`);
    }
  }
  if (rapor.komut === "numara") {
    s.push(`
  telefon      : ${rapor.telefon ?? "okunamadi"} (${rapor.yontem})`);
    if (rapor.at_port) s.push(`  AT portu     : ${rapor.at_port}`);
  }
  if (rapor.komut === "sim-kilit" || rapor.komut?.startsWith("sim-pin-")) {
    s.push(`
  SIM durumu   : ${rapor.durum ?? "?"}`);
    s.push(`  kalan hak    : PIN ${rapor.pin_kalan ?? "?"} · PUK ${rapor.puk_kalan ?? "?"}`);
    if (rapor.yapilacak) s.push(`  yapilacak    : ${rapor.yapilacak}`);
    if (rapor.kilit_kaldirildi !== undefined) {
      s.push(`  kilit        : ${rapor.kilit_kaldirildi ? "KALDIRILDI" : "duruyor"}`);
    }
    if (rapor.kilit_acik !== undefined) {
      s.push(`  kilit        : ${rapor.kilit_acik ? "ACIK" : "kapali"}`
        + (rapor.zaten ? " (zaten oyleydi)" : ""));
    }
  }
  if (rapor.komut === "olcum") s.push(...olcumMetni(rapor));
  // `calistir`: ad verilmemisse cagrilabilir yuzeyin listesi, verilmisse
  // fonksiyonun kendi ciktisi. Liste metnini cagirici uretir (saf), rapor
  // katmani onu yalnizca yerlestirir.
  if (rapor.komut === "calistir") {
    if (rapor.listeMetni) s.push("\n  CAGRILABILIR YUZEY\n" + rapor.listeMetni);
    else if (rapor.deger !== undefined) {
      s.push(`\n  ${rapor.fonksiyon} -> ${typeof rapor.deger === "object"
        ? JSON.stringify(rapor.deger) : String(rapor.deger)}`);
    }
  }
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

// ======================================================================
// Olcum ozetleyici — PURE
// ======================================================================

const sayi = (x) => (Number.isFinite(x) ? x : null);
const yuvarla = (x, basamak = 1) => (x == null ? null : Number(x.toFixed(basamak)));

// Sayı dizisinden dağılım. Boş dizi -> hepsi null (0 DEĞİL: 0 bir ölçümdür,
// "ölçüm yok" değildir).
export function dagilim(degerler) {
  const d = degerler.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (d.length === 0) return { n: 0, medyan: null, ortalama: null, min: null, maks: null };
  const orta = Math.floor(d.length / 2);
  return {
    n: d.length,
    medyan: yuvarla(d.length % 2 ? d[orta] : (d[orta - 1] + d[orta]) / 2),
    ortalama: yuvarla(d.reduce((a, b) => a + b, 0) / d.length),
    min: yuvarla(d[0]),
    maks: yuvarla(d[d.length - 1]),
  };
}

// Çalıştırma satırlarını özetler.
// rows: data/olcumler.jsonl satırları (nesne olarak)
// opts: { elleSn?, elleKaynak?, elleN?, modemSayisi? }
export function summarizeMetrics(rows = [], opts = {}) {
  const kurulumlar = rows.filter((r) => r.tur === "kurulum");
  const basarili = kurulumlar.filter((r) => r.ok);
  // Elle olcumler AYNI dosyada, tur:"elle" ile. Boylece karsilastirma tabani
  // da kayitli bir OLCUM olur — komut satirinda tasinan bir sayi degil.
  const elleler = rows.filter((r) => r.tur === "elle");

  const ozet = {
    zaman: new Date().toISOString(),
    komut: "olcum",
    kayit_sayisi: rows.length,
    kurulum: {
      denenen: kurulumlar.length,
      basarili: basarili.length,
      basari_orani: kurulumlar.length
        ? yuvarla((basarili.length / kurulumlar.length) * 100) : null,
      // İlk denemede biten kurulum oranı — retry'a ne sıklıkla düştüğümüz.
      ilk_denemede: basarili.filter((r) => (r.deneme ?? 1) === 1).length,
      farkli_cihaz: new Set(basarili.map((r) => r.lan_mac).filter(Boolean)).size,
    },
    sifirlama: {
      denenen: rows.filter((r) => r.tur === "sifirlama").length,
    },
    // Araç süresi: "başlat"a bastıktan bitişe kadar (cihaz işi).
    arac_sn: dagilim(basarili.map((r) => sayi(r.toplam_sn))),
    // Operatörün numarayı girme süresi = insanın MEŞGUL olduğu tek an.
    giris_sn: dagilim(basarili.map((r) => sayi(r.giris_sn))),
    adimlar: adimOzeti(basarili),
    elle_sn: dagilim(elleler.map((r) => sayi(r.toplam_sn))),
    problems: [],
  };

  ozet.insan_mesgul_sn = ozet.giris_sn.medyan;
  ozet.dongu_sn = ozet.arac_sn.medyan != null && ozet.giris_sn.medyan != null
    ? yuvarla(ozet.arac_sn.medyan + ozet.giris_sn.medyan) : ozet.arac_sn.medyan;

  // Taban secimi: KAYITLI olcum her zaman kazanir; yoksa disaridan verilen
  // sayi (beyan) kullanilir. Ozet hangisi oldugunu acikca tasir.
  const kayitliTaban = ozet.elle_sn.medyan != null;
  const taban = kayitliTaban ? ozet.elle_sn.medyan : opts.elleSn;
  // Kayitli satirlarin HEPSI beyan mi? Beyan bir OLCUM DEGILDIR; rapor bunu
  // acikca soylemeli, yoksa "3 kayitli olcum" gibi hak etmedigimiz bir guven
  // uretir.
  const hepsiBeyan = elleler.length > 0 && elleler.every((r) => r.beyan);
  const kaynakMetni = () => {
    if (!kayitliTaban) return opts.elleKaynak || "BEYAN — kayitli olcum yok";
    const kim = elleler.map((r) => r.kim).filter(Boolean)[0];
    const etiket = hepsiBeyan ? "BEYAN" : "olcum";
    return `${ozet.elle_sn.n} ${etiket}${kim ? ` · ${kim}` : ""}`;
  };
  if (taban) {
    ozet.karsilastirma = karsilastir(ozet, {
      ...opts,
      elleSn: taban,
      elleKaynak: kaynakMetni(),
      // Beyan, kac satir olsa da "olculmus" sayilmaz -> uyari uretsin.
      elleN: kayitliTaban && !hepsiBeyan ? ozet.elle_sn.n : (opts.elleN ?? 0),
    });
  }
  ozet.ok = basarili.length > 0;
  if (basarili.length === 0) {
    ozet.problems.push({ kod: "OLCUM_YOK", severity: "warning",
      message: "No successful provisioning runs were recorded yet.",
      check: "Run the UI flow at least a few times; each finished run appends"
        + " one line to data/olcumler.jsonl." });
  }
  return ozet;
}

// Adım adı -> süre dağılımı. En yavaş adım ayrıca işaretlenir (darboğaz).
function adimOzeti(satirlar) {
  const kova = new Map();
  for (const r of satirlar) {
    for (const a of r.adimlar || []) {
      if (!kova.has(a.ad)) kova.set(a.ad, []);
      kova.get(a.ad).push(sayi(a.sure_sn));
    }
  }
  const liste = [...kova].map(([ad, degerler]) => ({ ad, ...dagilim(degerler) }));
  const enYavas = liste.reduce((e, a) => (a.medyan > (e?.medyan ?? -1) ? a : e), null);
  return liste.map((a) => ({ ...a, darbogaz: a.ad === enYavas?.ad }));
}

// Elle sürece göre kazanç. İki AYRI iddia üretir, çünkü ikisi farklı şey:
//   dongu  = toplam geçen süre (modem başına)
//   mesgul = insanın ekranda/klavyede olduğu süre
// İkincisi asıl kazanç: kalan süre gözetimsiz geçiyor.
function karsilastir(ozet, opts) {
  const elle = opts.elleSn;
  const oran = (yeni) => (yeni == null || !elle ? null : {
    azalma_yuzde: yuvarla(((elle - yeni) / elle) * 100),
    kat: yuvarla(elle / yeni),
    kazanilan_sn: yuvarla(elle - yeni),
  });
  const k = {
    elle_sn: elle,
    elle_kaynak: opts.elleKaynak || "belirtilmedi",
    elle_n: opts.elleN ?? null,
    dongu: oran(ozet.dongu_sn),
    insan_mesgul: oran(ozet.insan_mesgul_sn),
  };
  if (opts.modemSayisi && k.dongu) {
    k.olcek = {
      modem: opts.modemSayisi,
      kazanilan_saat: yuvarla((k.dongu.kazanilan_sn * opts.modemSayisi) / 3600),
    };
  }
  // Küçük örneklemde "%94 azalttık" demek abartı olur; eşiği açıkça söyle.
  if (ozet.arac_sn.n < 5) {
    k.uyari = `Yalnizca ${ozet.arac_sn.n} basarili calistirma var; en az 5`
      + " (yeglenen 10) olmadan yuzde iddiasi zayif kalir.";
  }
  if ((k.elle_n ?? 0) < 3) {
    k.uyari_elle = "Elle sure icin en az 3 olcum onerilir; tek sayi ya da beyan"
      + " ise raporda BEYAN olarak etiketlenmeli.";
  }
  return k;
}

// ======================================================================
// Genel cagirici — fonksiyonu adiyla calistir
// ======================================================================

export function ilkParametre(fn) {
  const s = String(fn);
  const ac = s.indexOf("(");
  if (ac === -1) return "";
  let derinlik = 0;
  let i = ac;
  for (; i < s.length; i += 1) {
    if (s[i] === "(") derinlik += 1;
    else if (s[i] === ")") { derinlik -= 1; if (derinlik === 0) break; }
  }
  const ic = s.slice(ac + 1, i).trim();
  if (!ic) return "";
  // Ilk virgule kadar — ama parantez/suslu/kose icindeki virguller sayilmaz
  // (`{ a = 1, b }` tek parametredir).
  let k = 0;
  let j = 0;
  for (; j < ic.length; j += 1) {
    const c = ic[j];
    if ("({[".includes(c)) k += 1;
    else if (")}]".includes(c)) k -= 1;
    else if (c === "," && k === 0) break;
  }
  return ic.slice(0, j).trim();
}

// Cekirdek sozlesmesi: cihaza giden her fonksiyonun ilk parametresi ya `opts`
// adini tasir ya da { host, kaynakIp, kimlik } gibi yikilmis bir opts'tur.
// Saf fonksiyonlar (parseCnum, normalizePhone, settingLabel...) ham deger alir.
//
// Yikma bicimi TEK BASINA yetmez: provisionEksikleri({ modemVar, simTakili })
// da yikma kullanir ama opts ALMAZ. Bu yuzden opts'a ozgu anahtar araniyor.
const OPTS_ANAHTARI = /\b(host|fabrikaHost|sahaHost|kaynakIp|kimlik)\b/;

export function optsAlirMi(fn) {
  const p = ilkParametre(fn);
  if (/^opts\b/.test(p)) return true;
  return p.startsWith("{") && OPTS_ANAHTARI.test(p);
}

// argv -> { bayraklar, konumsallar }
//
// `--` AYRAC: oncesi opts'a karisan bayrak, sonrasi fonksiyona dogrudan giden
// konumsal arguman. Ayrac olmadan "AT+CNUM" gibi bir degerin bayrak mi
// arguman mi oldugu belirsiz kalirdi.
//
//   ["--host", "5.5.5.1", "--", "AT+CNUM"]
//     -> { bayraklar: { host: "5.5.5.1" }, konumsallar: ["AT+CNUM"] }
//
// Degersiz bayrak `true` olur: ["--zorla"] -> { zorla: true }
export function argvAyikla(argv = []) {
  const ayrac = argv.indexOf("--");
  const oncesi = ayrac === -1 ? argv : argv.slice(0, ayrac);
  const konumsallar = ayrac === -1 ? [] : argv.slice(ayrac + 1);
  const bayraklar = {};
  for (let i = 0; i < oncesi.length; i += 1) {
    const p = oncesi[i];
    if (!p.startsWith("--")) continue;
    // --kaynak-ip -> kaynakIp
    const ad = p.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const sonraki = oncesi[i + 1];
    if (sonraki !== undefined && !sonraki.startsWith("--")) { bayraklar[ad] = sonraki; i += 1; }
    else bayraklar[ad] = true;
  }
  return { bayraklar, konumsallar };
}

// Cagrilabilir yuzeyin tamami. tur: "fonksiyon" | "sabit".
export function fonksiyonlariListele(mod) {
  return Object.entries(mod)
    .map(([ad, deger]) => (typeof deger === "function"
      ? { ad, tur: "fonksiyon", optsAlir: optsAlirMi(deger), imza: ilkParametre(deger) }
      : { ad, tur: "sabit", optsAlir: false, imza: null }))
    .sort((a, b) => a.ad.localeCompare(b.ad));
}

// Listeyi insan-okunur metne cevirir (stderr'a basilacak).
export function listeMetni(liste) {
  const s = [];
  const fonksiyonlar = liste.filter((x) => x.tur === "fonksiyon");
  const sabitler = liste.filter((x) => x.tur === "sabit");
  s.push(`  CIHAZA GIDEN (${fonksiyonlar.filter((x) => x.optsAlir).length})`
    + "  — ortam/bayraklar opts olarak gecer");
  for (const f of fonksiyonlar.filter((x) => x.optsAlir)) s.push(`    ${f.ad}`);
  s.push(`\n  SAF (${fonksiyonlar.filter((x) => !x.optsAlir).length})`
    + "  — argumanlar `--` sonrasi verilir");
  for (const f of fonksiyonlar.filter((x) => !x.optsAlir)) {
    s.push(`    ${f.ad.padEnd(26)}(${f.imza}${f.imza ? ", ..." : ""})`);
  }
  if (sabitler.length) {
    s.push(`\n  SABITLER (${sabitler.length})  — yazdirilir`);
    s.push("    " + sabitler.map((x) => x.ad).join(", "));
  }
  return s.join("\n");
}

// Bilinmeyen ada en yakin adaylari bulur (basit: onek/parca eslesmesi).
function benzerler(ad, liste) {
  const k = ad.toLowerCase();
  return liste.map((x) => x.ad)
    .filter((a) => a.toLowerCase().includes(k) || k.includes(a.toLowerCase()))
    .slice(0, 5);
}

// Fonksiyonu cagirir. THROW ETMEZ — cekirdek sozlesmesi geregi sonuc nesnesi
// doner ve sorun varsa problems[] icinde gelir.
//
// opts        : ortamdan turemis cekirdek opts'u (host, kaynakIp, kimlik...)
// bayraklar   : argvAyikla ciktisi; opts'un uzerine yazilir
// konumsallar : `--` sonrasi argumanlar
// saf         : true ise opts ENJEKTE EDILMEZ (otomatik tespiti ezer)
export async function cagir(mod, ad, { opts = {}, bayraklar = {},
  konumsallar = [], saf = false } = {}) {
  const liste = fonksiyonlariListele(mod);
  const zaman = new Date().toISOString();

  if (!ad) {
    return { zaman, komut: "calistir", ok: true, liste,
      listeMetni: listeMetni(liste), problems: [] };
  }
  if (!(ad in mod)) {
    const yakin = benzerler(ad, liste);
    return { zaman, komut: "calistir", fonksiyon: ad, ok: false, problems: [{
      kod: "ARGS", severity: "error",
      message: `Unknown export: ${ad}`,
      check: yakin.length
        ? `Did you mean: ${yakin.join(", ")}? Full list: ricon.js calistir`
        : "Run `ricon.js calistir` with no name to list everything.",
    }] };
  }

  const deger = mod[ad];
  if (typeof deger !== "function") {
    return { zaman, komut: "calistir", fonksiyon: ad, tur: "sabit", ok: true,
      deger, problems: [] };
  }

  const optsAlir = saf ? false : optsAlirMi(deger);
  const argumanlar = optsAlir
    ? [{ ...opts, ...bayraklar }, ...konumsallar]
    : konumsallar;

  // Cekirdek throw etmez, ama `calistir` KEYFI bir fonksiyonu KEYFI
  // argumanlarla cagirabilir (or. eksik arguman). Burada yakalanmazsa
  // kullanici stack trace gorurdu; sozlesme sonuc nesnesi diyor.
  let sonuc;
  try {
    sonuc = await deger(...argumanlar);
  } catch (e) {
    return { zaman, komut: "calistir", fonksiyon: ad, ok: false, problems: [{
      kod: "CALISTIR_HATASI", severity: "error",
      message: `${ad}(): ${e?.name}: ${e?.message}`,
      check: `Check the argument shape: first parameter is \`${ilkParametre(deger)}\`.`
        + " Positional arguments go after `--`.",
    }] };
  }

  // Sonuc nesne degilse (string/bool/dizi) sarmala — CLI sozlesmesi bir
  // rapor nesnesi bekliyor (writeJson + summaryText + cikis kodu).
  if (sonuc === null || typeof sonuc !== "object" || Array.isArray(sonuc)) {
    return { zaman, komut: "calistir", fonksiyon: ad, ok: true, deger: sonuc, problems: [] };
  }
  return { zaman, komut: "calistir", fonksiyon: ad, ...sonuc,
    problems: sonuc.problems ?? [] };
}
