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
const SECRET_PATTERN = /Basic\s+[A-Za-z0-9+/=]+/g;

export function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    const output = {};
    for (const [k, v] of Object.entries(value)) {
      if (SIR_ALANLARI.has(k.toLowerCase())) continue;
      output[k] = stripSecrets(v);
    }
    return output;
  }
  if (typeof value === "string") return value.replace(SECRET_PATTERN, "Basic <gizli>");
  return value;
}

export function writeJson(nesne) {
  return JSON.stringify(stripSecrets(nesne), null, 2);
}

// Bilinmeyen deger 0 degil "—" gosterilir.
const g = (v) => (v == null || v === "" ? "—" : v);

// PURE: bir nvram anahtar/deger ciftini gosterime cevirir (UI + rapor ortak).
// Sozlukte olmayan anahtar da calisir — adi anahtarin kendisi olur (gecirgen).
// Doner: { anahtar, ad, sayfa, gosterim, ham }
export function settingLabel(key, value) {
  const t = SETTING_LABELS[key];
  const raw = value == null ? null : String(value);
  let gosterim;
  if (raw === null) gosterim = "—";
  else if (t?.gizli) gosterim = raw === "" ? "(bos)" : "••••";
  else if (t?.values && raw in t.values) gosterim = t.values[raw];
  else if (raw === "") gosterim = "(bos)";
  else gosterim = t?.birim ? `${raw} ${t.birim}` : raw;
  return { key, name: t?.name || key, page: t?.page || null, gosterim, raw };
}

// Olcum ozeti metni. Dagilimi saklamaz: medyanin yaninda min-maks da yazar,
// cunku tek sayi soylemek kucuk orneklemde yanlis guven verir.
function metricLines(r) {
  const s = [];
  const d = (x) => (x.median == null ? "—"
    : `${x.median} sn  (n=${x.n}, ${x.min}–${x.max}, ort ${x.average})`);
  s.push("\n  OLCUM OZETI");
  s.push(`    kayit                 : ${r.recordCount} satir`);
  s.push(`    kurulum               : ${r.run.succeeded}/${r.run.attempted} basarili`
    + `${r.run.successRate != null ? ` (%${r.run.successRate})` : ""}`
    + ` · ilk denemede ${r.run.onFirstAttempt}`
    + ` · ${r.run.differentDevice} farkli cihaz`);
  if (r.manualSec?.n) {
    s.push(`    ELLE surec (medyan)   : ${d(r.manualSec)}`
      + `  = ${(r.manualSec.median / 60).toFixed(1)} dk`);
  }
  s.push(`    arac suresi (medyan)  : ${d(r.toolSec)}`);
  s.push(`    numara girisi (medyan): ${d(r.entrySec)}`);
  s.push(`    dongu (giris + arac)  : ${r.cycleSec ?? "—"} sn`);

  if (r.steps?.length) {
    s.push("\n    Adim kirilimi (medyan):");
    for (const a of r.steps) {
      s.push(`      ${a.bottleneck ? "▲" : " "} ${String(a.name).padEnd(34)}`
        + `${String(a.median).padStart(6)} sn  (${a.min}–${a.max})`);
    }
  }

  const k = r.karsilastirma;
  if (k) {
    s.push(`\n    ELLE SUREC: ${k.manualSec} sn (${(k.manualSec / 60).toFixed(1)} dk)`
      + ` · kaynak: ${k.manualSource}${k.manualCount ? ` (n=${k.manualCount})` : ""}`);
    if (k.dongu) {
      s.push(`      dongu suresi      : %${k.dongu.reductionPct} azalma`
        + ` · ${k.dongu.speedup}x hizli · modem basina ${k.dongu.savedSec} sn kazanc`);
    }
    if (k.humanBusy) {
      s.push(`      insan mesgul suresi: %${k.humanBusy.reductionPct} azalma`
        + ` · ${k.humanBusy.speedup}x · gerisi GOZETIMSIZ geciyor`);
    }
    if (k.olcek) {
      s.push(`      ${k.olcek.modem} modemde toplam kazanc: ${k.olcek.kazanilan_saat} saat`);
    }
    if (k.uyari) s.push(`      ! ${k.uyari}`);
    if (k.manualWarning) s.push(`      ! ${k.manualWarning}`);
  } else {
    s.push("\n    (Elle sureci karsilastirmak icin: --elle-dk 15 --elle-kaynak \"...\")");
  }
  return s;
}

// Insan-okunur ozet (stderr'a; stdout saf JSON kalir).
export function summaryText(report) {
  const s = [];
  // modem_ip eski komutlarin alani; degerlendirme raporu konumu
  // `modem.host` icinde tasiyor. Ikisine de bak, yoksa "?" yaz.
  s.push(`Ricon modem — ${report.modemIp || report.modem?.host || "?"}`
    + `  (${report.timestamp || ""})`);
  if (report.sistem) {
    s.push("\n  Sistem:");
    for (const [k, v] of Object.entries(report.sistem)) s.push(`    ${k.padEnd(16)}: ${g(v)}`);
  }
  for (const label of ["sim1", "sim2"]) {
    const sim = report[label];
    if (sim && Object.keys(sim).length) {
      s.push(`\n  ${label.toUpperCase()}:`);
      for (const [k, v] of Object.entries(sim)) s.push(`    ${k.padEnd(16)}: ${g(v)}`);
    }
  }
  if (report.ports) {
    s.push("\n  Acik kapilar:");
    for (const p of report.ports.filter((x) => x.isOpen)) {
      s.push(`    ${String(p.port).padEnd(6)} ${p.name || ""}${p.banner ? "  banner: " + p.banner.slice(0, 40) : ""}`);
    }
  }
  if (report.nvramKeyCount != null) {
    s.push(`\n  nvram: ${report.nvramKeyCount} anahtar cekildi`);
  }
  if (report.command === "fark") {
    s.push(`\n  nvram farki: ${report.summary?.changed || 0} degisen, `
      + `${report.summary?.eklenen || 0} eklenen, ${report.summary?.silinen || 0} silinen`);
    for (const [k, v] of Object.entries(report.changed || {})) {
      s.push(`    ~ ${k}: ${g(v.previous)}  ->  ${g(v.next)}`);
    }
    for (const [k, v] of Object.entries(report.eklenen || {})) s.push(`    + ${k} = ${g(v)}`);
    for (const [k, v] of Object.entries(report.silinen || {})) s.push(`    - ${k} (idi: ${g(v)})`);
  }
  if (report.command === "sim") {
    const s1 = report.sim1 || {};
    s.push("\n  SIM1:");
    for (const k of ["iccidClean", "imsi", "imei", "operator", "simStatus", "networkType", "band", "signalDbm", "cellId"]) {
      if (s1[k]) s.push(`    ${k.padEnd(14)}: ${s1[k]}`);
    }
    s.push(`    ${"msisdn".padEnd(14)}: ${g(report.msisdn)}${report.msisdnSource ? " (" + report.msisdnSource + ")" : ""}`);
    if (report.msisdn_not) s.push(`    -> ${report.msisdn_not}`);
  }
  if (report.command === "hazirla" || report.command === "hazirla-dongu") {
    s.push(`
  Hazirla — durum: ${g(report.status)}${report.attempt ? " (deneme " + report.attempt + ")" : ""}`);
    if (report.lastAction) s.push(`  Eylem: ${report.lastAction}`);
    if (report.internet) {
      s.push(`  Internet: ${report.internet.online
        ? `VAR ${report.internet.wanIp} (${report.internet.durationSec} sn) — SIM calisiyor`
        : `YOK (${report.internet.durationSec} sn bekledi) — SIM durumu `
          + `${g(report.internet.simStatus)} · PIN kilidi olabilir`}`);
    }
    if (report.record) {
      const k = report.record;
      s.push(`  Kayit: tel ${g(k.phone)} · ICCID ${g(k.iccid)} · IMEI ${g(k.imei)}`
        + ` · MAC ${g(k.lanMac)} · ${g(k.operator)}`
        + `${k.wanIp ? ` · WAN ${k.wanIp}` : ""}`);
    }
    if (report.prepared) {
      s.push(`  Hazirlanan modem: ${report.prepared.length}`);
      for (const h of report.prepared) {
        s.push(`    ${h.ok ? "✓" : "✗"} ${g(h.status)} · tel ${g(h.phone)} · ICCID ${g(h.iccid)}`);
      }
    }
  }
  if (report.command === "uygula") {
    s.push(`\n  Provizyon (${report.profile}) — ${report.apply ? "GERCEK YAZMA" : "KURU (dry-run)"}`);
    s.push(`  Durum: ${g(report.status)}`);
    if (report.plan) {
      s.push(`  Degisecek: ${report.plan.willChangeCount}, ayni: ${report.plan.ayni_sayisi}`);
      for (const [k, v] of Object.entries(report.plan.willChange || {})) {
        s.push(`    ~ ${k}: ${g(v.mevcut)}  ->  ${g(v.target)}`);
      }
      if (report.plan.missingKeys?.length) {
        s.push(`    ⚠ cihazda olmayan (yeni yazilacak): ${report.plan.missingKeys.join(", ")}`);
      }
    }
    if (report.verification) {
      s.push(`  Dogrulama: ${report.verification.tamam
        ? `TAMAM (${report.verification.waitSec} sn)`
        : "kalan: " + (report.verification.remainingChanges || []).join(", ")}`);
      if (!report.verification.tamam && report.verification.reason) {
        s.push(`        → ${report.verification.reason}`);
      }
    }
    if (report.not) s.push(`  Not: ${report.not}`);
  }
  if (report.command === "izle") {
    s.push(`\n  Izleme: ${report.ornek_sayisi} ornek · ${report.aralik_sn} sn aralik`
      + ` · ${report.durationSec} sn`);
    for (const o of report.samples || []) {
      s.push(`    ${String(o.an_sn).padStart(6)} sn  erisim ${o.reachable ? "var" : "YOK"}`
        + `  internet ${o.internet ? g(o.wanIp) : "YOK"}`
        + `  sinyal ${g(o.signalDbm)}  degisen ${o.changedFields}`);
    }
    if (report.outages?.length) {
      s.push("\n  KESINTILER:");
      for (const k of report.outages) {
        s.push(`    ${k.kind.padEnd(9)} ${k.basla_sn} sn -> ${k.bitis_sn} sn`
          + `  = ${k.durationSec} sn${k.hala_suruyor ? "  (HALA SURUYOR)" : ""}`);
      }
    } else {
      s.push("  KESINTI YOK (ne internet ne yonetim erisimi dustu)");
    }
  }
  // Yeni tek-is komutlari: kisa ozet. Uzun metin yok — stdout'taki JSON
  // zaten tam veri; buradaki satir "bir bakista ne oldu" icin.
  if (report.command === "degerlendir") {
    s.push(`
  konum        : ${report.modem?.location ?? "modem yok"}`);
    s.push(`  telefon      : ${report.phone?.number ?? "—"}`
      + (report.phone?.source ? ` (${report.phone.source})` : ""));
    if (report.sim) {
      s.push(`  SIM          : ${report.sim.present ? "present" : "YOK"}`
        + `${report.sim.lock ? ` · ${report.sim.lock.toUpperCase()} kilitli` : ""}`
        + `${report.sim.pinRemaining != null ? ` · kalan hak ${report.sim.pinRemaining}` : ""}`);
    }
    if (report.internet) {
      s.push(`  internet     : ${report.internet.online ? report.internet.wanIp : "YOK"}`);
    }
    s.push(`  eksik        : ${report.missing?.length ? report.missing.join(", ") : "none"}`);
    s.push(`  baslatilabilir: ${report.canStart ? "EVET" : "hayir"}`);
    if (report.retry) {
      s.push(`  tekrar       : ${report.retry.retry
        ? `${report.retry.delaySec} sn sonra (${report.retry.reason})` : `yok (${report.retry.reason})`}`);
    }
  }
  if (report.command === "numara") {
    s.push(`
  telefon      : ${report.phone ?? "okunamadi"} (${report.method})`);
    if (report.atPort) s.push(`  AT portu     : ${report.atPort}`);
  }
  if (report.command === "sim-kilit" || report.command?.startsWith("sim-pin-")) {
    s.push(`
  SIM durumu   : ${report.status ?? "?"}`);
    s.push(`  kalan hak    : PIN ${report.pinRemaining ?? "?"} · PUK ${report.pukRemaining ?? "?"}`);
    if (report.plannedAction) s.push(`  yapilacak    : ${report.plannedAction}`);
    if (report.lockRemoved !== undefined) {
      s.push(`  kilit        : ${report.lockRemoved ? "KALDIRILDI" : "duruyor"}`);
    }
    if (report.lockEnabled !== undefined) {
      s.push(`  kilit        : ${report.lockEnabled ? "ACIK" : "kapali"}`
        + (report.zaten ? " (zaten oyleydi)" : ""));
    }
  }
  if (report.command === "olcum") s.push(...metricLines(report));
  if (report.problems?.length) {
    s.push("\n  Sorunlar:");
    for (const p of report.problems) {
      const im = p.severity === "error" ? "✗" : "!";
      s.push(`    ${im} [${p.code}] ${p.message}`);
      if (p.check) s.push(`        → ${p.check}`);
    }
  }
  return s.join("\n");
}
