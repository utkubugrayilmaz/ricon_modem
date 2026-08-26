// Rapor katmani — sonucu JSON'a ve insan-okunur metne cevirir.
//
// Sir hijyeni: JSON'a kimlik (kullanici/sifre) ASLA yazilmaz. Cikti nesnesi
// zaten kimlik tasimaz; yine de guvenlik agi olarak temizle() ile ozyinelemeli
// alan-adi + regex suzgeci uygulanir. Rapor paylasilabilir olmali.

// Cikti nesnesinden sir tasiyabilecek alanlari ozyinelemeli siler.
const SIR_ALANLARI = new Set(["sifre", "password", "kimlik", "auth", "authorization"]);
const SIR_DESENI = /Basic\s+[A-Za-z0-9+/=]+/g;

export function sirlariTemizle(deger) {
  if (Array.isArray(deger)) return deger.map(sirlariTemizle);
  if (deger && typeof deger === "object") {
    const cikti = {};
    for (const [k, v] of Object.entries(deger)) {
      if (SIR_ALANLARI.has(k.toLowerCase())) continue;
      cikti[k] = sirlariTemizle(v);
    }
    return cikti;
  }
  if (typeof deger === "string") return deger.replace(SIR_DESENI, "Basic <gizli>");
  return deger;
}

export function jsonYaz(nesne) {
  return JSON.stringify(sirlariTemizle(nesne), null, 2);
}

// Bilinmeyen deger 0 degil "—" gosterilir.
const g = (v) => (v == null || v === "" ? "—" : v);

// Insan-okunur ozet (stderr'a; stdout saf JSON kalir).
export function ozetMetni(rapor) {
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
    if (rapor.dogrulama) s.push(`  Dogrulama: ${rapor.dogrulama.tamam ? "TAMAM" : "kalan: " + (rapor.dogrulama.kalan_degisecek || []).join(", ")}`);
    if (rapor.not) s.push(`  Not: ${rapor.not}`);
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
