// Rapor katmani — sonucu JSON'a ve insan-okunur metne cevirir.
//
// Sir hijyeni: JSON'a kimlik (kullanici/sifre) ASLA yazilmaz. Cikti nesnesi
// zaten kimlik tasimaz; yine de guvenlik agi olarak temizle() ile ozyinelemeli
// alan-adi + regex suzgeci uygulanir. Rapor paylasilabilir olmali.

import { SETTING_LABELS } from "../domain/constants.js";

// Cikti nesnesinden sir tasiyabilecek alanlari ozyinelemeli siler.
// SIM PIN de sir: nvram anahtar adiyla da gelebilir, alan adiyla da.
//
// PPP PAROLALARI DA (m1s1ppppwd/m1s2ppppwd): sozlukte `gizli: true` olarak
// isaretliydiler, yani "ekranda maskele" karari coktan verilmisti — ama bu
// suzgecte YOKLARDI ve `--json` ciktisi ile plan dokumu onlari duz metin
// yaziyordu. Rapor paylasilabilir olmali; sozlukte gizli olan bir alanin
// JSON'da acikta durmasi o sozu tutmamak demekti.
const SIR_ALANLARI = new Set(["sifre", "password", "kimlik", "auth", "authorization",
  "pin", "m1s1simpin", "m1s2simpin", "m1s1ppppwd", "m1s2ppppwd"]);
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

// PURE: bir nvram anahtar/deger ciftini gosterime cevirir (rapor + terminal).
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

// Anahtarlari cihazin ARAYUZ sirasina dizer (profil sirasi degil).
//
// Profil sirasi motorun YAZMA sirasidir (LAN en sonda, cunku baglanti kopar).
// Operator ise ekrani cihazin arayuzunde gordugu sirayla okur: Main Link ->
// Others -> Backup Link -> Wireless -> DHCP -> LAN. SETTING_LABELS tam o
// sirada yazildi, sozlugun anahtar sirasi kullaniliyor.
//
// Sozlukte olmayan anahtar SONA duser (kaybolmaz).
function planSirasi(anahtarlar) {
  const sozluk = Object.keys(SETTING_LABELS);
  return anahtarlar.slice().sort((a, b) => {
    const ia = sozluk.indexOf(a);
    const ib = sozluk.indexOf(b);
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  });
}

// Plan satirlarinin GORUNEN adlarini uretir: anahtar -> ad.
//
// Sozlukte AYNI ad iki ayri ayarda gecebiliyor — cihazin arayuzunde de oyle:
// "Connection Type" hem Main Link'te hem Backup Link'te var. Ham anahtari
// ekrandan kaldirdigimizda bu iki satir ayirt edilemez hale geldi. Cozum:
// yalnizca CAKISAN adlara sayfanin son parcasi ekleniyor
// ("Connection Type (Backup Link)"). Her satira sayfa yazmak ekrani
// gereksiz sisirirdi.
function planAdlari(anahtarlar) {
  const etiketler = anahtarlar.map((k) => ({ k, ...settingLabel(k, null) }));
  const sayim = new Map();
  for (const e of etiketler) sayim.set(e.ad, (sayim.get(e.ad) ?? 0) + 1);
  const cikti = new Map();
  for (const e of etiketler) {
    const sonParca = String(e.sayfa || "").split("→").pop().trim();
    cikti.set(e.k, sayim.get(e.ad) > 1 && sonParca ? `${e.ad} (${sonParca})` : e.ad);
  }
  return cikti;
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
      // SOZLUKTEN BAS: ham nvram anahtari (`w1_wan_proto: m13g`) operatore
      // hicbir sey anlatmiyor; sozluk cihazin ARAYUZUNDEKI adi ve okunabilir
      // degeri veriyor ("Connection Type: M1-PPP"). Ayrica parola alanlarini
      // MASKELIYOR — asagidaki plan dokumu eskiden `m1s1ppppwd` degerini duz
      // metin basiyordu (sozlukte gizli:true olmasina ragmen).
      //
      // Ayni satirda hem arayuz sayfasi hem anahtar tutulmuyor: sayfa bilgisi
      // ekrani sisirir, anahtar zaten stdout'taki JSON'da tam duruyor.
      const anahtarlar = planSirasi(Object.keys(rapor.plan.degisecek || {}));
      const adlar = planAdlari(anahtarlar);
      for (const k of anahtarlar) {
        const v = rapor.plan.degisecek[k];
        const once = settingLabel(k, v.mevcut);
        const sonra = settingLabel(k, v.hedef);
        s.push(`    ~ ${adlar.get(k).padEnd(26)} ${g(once.gosterim)}  ->  ${g(sonra.gosterim)}`);
      }
      if (rapor.plan.eksik_anahtarlar?.length) {
        const adlar = rapor.plan.eksik_anahtarlar.map((k) => settingLabel(k, null).ad);
        s.push(`    ⚠ cihazda olmayan (yeni yazilacak): ${adlar.join(", ")}`);
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
