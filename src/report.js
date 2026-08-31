// Rapor katmani — sonucu JSON'a ve insan-okunur metne cevirir.
//
// Sir hijyeni: JSON'a kimlik (kullanici/sifre) ASLA yazilmaz. Cikti nesnesi
// zaten kimlik tasimaz; yine de guvenlik agi olarak stripSecrets() ile ozyinelemeli
// alan-adi + regex suzgeci uygulanir. Rapor paylasilabilir olmali.

import { SETTING_LABELS } from "./settings.js";

// Cikti nesnesinden sir tasiyabilecek alanlari ozyinelemeli siler.
// SIM PIN de sir: nvram anahtar adiyla da gelebilir, alan adiyla da.
const SECRET_FIELDS = new Set(["credentials", "password", "sifre", "kimlik",
  "auth", "authorization", "pin", "m1s1simpin", "m1s2simpin"]);
const SECRET_PATTERN = /Basic\s+[A-Za-z0-9+/=]+/g;

export function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_FIELDS.has(k.toLowerCase())) continue;
      out[k] = stripSecrets(v);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(SECRET_PATTERN, "Basic <gizli>");
  return value;
}

export function writeJson(obj) {
  return JSON.stringify(stripSecrets(obj), null, 2);
}

// Bilinmeyen deger 0 degil "—" gosterilir.
const g = (v) => (v == null || v === "" ? "—" : v);

// PURE: bir nvram anahtar/deger ciftini gosterime cevirir (UI + rapor ortak).
// Sozlukte olmayan anahtar da calisir — adi anahtarin kendisi olur (gecirgen).
// Doner: { anahtar, ad, sayfa, gosterim, ham }
export function settingLabel(key, value) {
  const t = SETTING_LABELS[key];
  const raw = value == null ? null : String(value);
  let display;
  if (raw === null) display = "—";
  else if (t?.secret) display = raw === "" ? "(bos)" : "••••";
  else if (t?.values && raw in t.values) display = t.values[raw];
  else if (raw === "") display = "(bos)";
  else display = t?.unit ? `${raw} ${t.unit}` : raw;
  return { key, name: t?.name || key, page: t?.page || null, display, raw };
}

// Provizyon planini EKRANA HAZIR satirlara cevirir. once = kurulum oncesi,
// sonra = hedef. Tuketici (terminal ozeti ya da baska bir arayuz) nvram
// anahtari bilmez; satirlar hazir gelir.
//
// Sira: profil sirasi DEGIL, sozluk sirasi. Profil "motorun yazma sirasi"na
// gore dizili (WLAN basta, LAN sonda); teknisyen ise cihazin ARAYUZ sirasiyla
// okur (Main Link -> Others -> Backup Link -> Wireless -> LAN).
// SETTING_LABELS tam o sirada yazildi.
export function planRows(planObj) {
  const dictionaryOrder = Object.keys(SETTING_LABELS);
  const keys = Object.keys(planObj.target || {}).sort((a, b) => {
    const ia = dictionaryOrder.indexOf(a);
    const ib = dictionaryOrder.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return keys.map((k) => {
    const before = settingLabel(k, planObj.before?.[k]);
    const after = settingLabel(k, planObj.target[k]);
    return {
      key: k,
      name: before.name,
      page: before.page,
      before: before.display,
      after: after.display,
      changing: Boolean(planObj.changing && k in planObj.changing),
    };
  });
}

// Plan satirlarini terminale basilacak metne cevirir. Sayfa basliklariyla
// gruplar; degisecek satiri * ile isaretler. Bu, arayuzdeki iki panelin
// (once/sonra) terminal karsiligi.
export function planText(lines) {
  const s = [];
  let lastPage = null;
  for (const r of lines) {
    if (r.page !== lastPage) { s.push(`  ${r.page || "(sayfasiz)"}`); lastPage = r.page; }
    s.push(`    ${String(r.name).padEnd(24)}${String(r.before).padEnd(16)}`
      + ` -> ${String(r.after).padEnd(16)}${r.changing ? " *" : ""}`);
  }
  return s.join("\n");
}

// Olcum ozeti metni. Dagilimi saklamaz: medyanin yaninda min-maks da yazar,
// cunku tek sayi soylemek kucuk orneklemde yanlis guven verir.
function metricsText(r) {
  const s = [];
  const d = (x) => (x.median == null ? "—"
    : `${x.median} sn  (n=${x.n}, ${x.min}–${x.max}, ort ${x.mean})`);
  s.push("\n  OLCUM OZETI");
  s.push(`    kayit                 : ${r.rowCount} satir`);
  s.push(`    kurulum               : ${r.run.successful}/${r.run.attemptedCount} basarili`
    + `${r.run.successRate != null ? ` (%${r.run.successRate})` : ""}`
    + ` · ilk denemede ${r.run.firstTry}`
    + ` · ${r.run.distinctDevices} farkli cihaz`);
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

  const k = r.comparison;
  if (k) {
    s.push(`\n    ELLE SUREC: ${k.manualSec} sn (${(k.manualSec / 60).toFixed(1)} dk)`
      + ` · kaynak: ${k.manualSource}${k.manualN ? ` (n=${k.manualN})` : ""}`);
    if (k.cycle) {
      s.push(`      dongu suresi      : %${k.cycle.reductionPercent} azalma`
        + ` · ${k.cycle.factor}x hizli · modem basina ${k.cycle.savedSec} sn kazanc`);
    }
    if (k.humanBusy) {
      s.push(`      insan mesgul suresi: %${k.humanBusy.reductionPercent} azalma`
        + ` · ${k.humanBusy.factor}x · gerisi GOZETIMSIZ geciyor`);
    }
    if (k.scale) {
      s.push(`      ${k.scale.modem} modemde toplam kazanc: ${k.scale.savedHours} saat`);
    }
    if (k.warning) s.push(`      ! ${k.warning}`);
    if (k.manualWarning) s.push(`      ! ${k.manualWarning}`);
  } else {
    s.push("\n    (Elle sureci karsilastirmak icin: --elle-dk 15 --elle-kaynak \"...\")");
  }
  return s;
}

// Insan-okunur ozet (stderr'a; stdout saf JSON kalir).
export function summaryText(report) {
  const s = [];
  // modemIp eski komutlarin alani; degerlendirme raporu konumu
  // `modem.host` icinde tasiyor. Ikisine de bak, yoksa "?" yaz.
  s.push(`Ricon modem — ${report.modemIp || report.modem?.host || "?"}`
    + `  (${report.timestamp || ""})`);
  if (report.system) {
    s.push("\n  Sistem:");
    for (const [k, v] of Object.entries(report.system)) s.push(`    ${k.padEnd(16)}: ${g(v)}`);
  }
  for (const label of ["sim1", "sim2"]) {
    const sim = report[label];
    if (sim && Object.keys(sim).length) {
      s.push(`\n  ${label.toUpperCase()}:`);
      for (const [k, v] of Object.entries(sim)) s.push(`    ${k.padEnd(16)}: ${g(v)}`);
    }
  }
  if (report.nvramKeyCount != null) {
    s.push(`\n  nvram: ${report.nvramKeyCount} anahtar cekildi`);
  }
  if (report.command === "fark") {
    s.push(`\n  nvram farki: ${report.summary?.changed || 0} degisen, `
      + `${report.summary?.added || 0} eklenen, ${report.summary?.removed || 0} silinen`);
    for (const [k, v] of Object.entries(report.changed || {})) {
      s.push(`    ~ ${k}: ${g(v.previous)}  ->  ${g(v.next)}`);
    }
    for (const [k, v] of Object.entries(report.added || {})) s.push(`    + ${k} = ${g(v)}`);
    for (const [k, v] of Object.entries(report.removed || {})) s.push(`    - ${k} (idi: ${g(v)})`);
  }
  if (report.command === "sim") {
    const s1 = report.sim1 || {};
    s.push("\n  SIM1:");
    for (const k of ["iccidClean", "imsi", "imei", "operator", "simStatus", "networkType", "band", "signalDbm", "cellId"]) {
      if (s1[k]) s.push(`    ${k.padEnd(14)}: ${s1[k]}`);
    }
    s.push(`    ${"msisdn".padEnd(14)}: ${g(report.msisdn)}${report.msisdnSource ? " (" + report.msisdnSource + ")" : ""}`);
    if (report.msisdnNote) s.push(`    -> ${report.msisdnNote}`);
  }
  if (report.command === "hazirla" || report.command === "hazirla-dongu") {
    s.push(`
  Hazirla — durum: ${g(report.status)}${report.attempt ? " (deneme " + report.attempt + ")" : ""}`);
    if (report.lastAction) s.push(`  Eylem: ${report.lastAction}`);
    if (report.internet) {
      s.push(`  Internet: ${report.internet.up
        ? `VAR ${report.internet.wan_ip} (${report.internet.durationSec} sn) — SIM calisiyor`
        : `YOK (${report.internet.durationSec} sn bekledi) — SIM durumu `
          + `${g(report.internet.simStatus)} · PIN kilidi olabilir`}`);
    }
    if (report.record) {
      const k = report.record;
      s.push(`  Kayit: tel ${g(k.phone)} · ICCID ${g(k.iccid)} · IMEI ${g(k.imei)}`
        + ` · MAC ${g(k.lan_mac)} · ${g(k.operator)}`
        + `${k.wan_ip ? ` · WAN ${k.wan_ip}` : ""}`);
    }
    if (report.provisioned) {
      s.push(`  Hazirlanan modem: ${report.provisioned.length}`);
      for (const h of report.provisioned) {
        s.push(`    ${h.ok ? "✓" : "✗"} ${g(h.status)} · tel ${g(h.phone)} · ICCID ${g(h.iccid)}`);
      }
    }
  }
  if (report.command === "uygula") {
    s.push(`\n  Provizyon (${report.profile}) — ${report.apply ? "GERCEK YAZMA" : "KURU (dry-run)"}`);
    s.push(`  Durum: ${g(report.status)}`);
    if (report.planObj) {
      s.push(`  Degisecek: ${report.planObj.changingCount}, ayni: ${report.planObj.unchangedCount}`);
      for (const [k, v] of Object.entries(report.planObj.changing || {})) {
        s.push(`    ~ ${k}: ${g(v.current)}  ->  ${g(v.target)}`);
      }
      if (report.planObj.missingKeys?.length) {
        s.push(`    ⚠ cihazda olmayan (yeni yazilacak): ${report.planObj.missingKeys.join(", ")}`);
      }
    }
    if (report.verification) {
      s.push(`  Dogrulama: ${report.verification.done
        ? `TAMAM (${report.verification.waitedSec} sn)`
        : "kalan: " + (report.verification.stillChanging || []).join(", ")}`);
      if (!report.verification.done && report.verification.reason) {
        s.push(`        → ${report.verification.reason}`);
      }
    }
    if (report.note) s.push(`  Not: ${report.note}`);
  }
  // Yeni tek-is komutlari: kisa ozet. Uzun metin yok — stdout'taki JSON
  // zaten tam veri; buradaki satir "bir bakista ne oldu" icin.
  if (report.command === "degerlendir") {
    s.push(`
  konum        : ${report.modem?.location ?? "modem yok"}`);
    s.push(`  telefon      : ${report.phone?.number ?? "—"}`
      + (report.phone?.source ? ` (${report.phone.source})` : ""));
    if (report.sim) {
      s.push(`  SIM          : ${report.sim.present ? "takili" : "YOK"}`
        + `${report.sim.lock ? ` · ${report.sim.lock.toUpperCase()} kilitli` : ""}`
        + `${report.sim.pinRemaining != null ? ` · kalan hak ${report.sim.pinRemaining}` : ""}`);
    }
    if (report.internet) {
      s.push(`  internet     : ${report.internet.up ? report.internet.wan_ip : "YOK"}`);
    }
    s.push(`  eksik        : ${report.missing?.length ? report.missing.join(", ") : "yok"}`);
    s.push(`  baslatilabilir: ${report.canStart ? "EVET" : "hayir"}`);
    if (report.retry) {
      s.push(`  tekrar       : ${report.retry.retry
        ? `${report.retry.afterSec} sn sonra (${report.retry.reason})` : `yok (${report.retry.reason})`}`);
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
    if (report.todo) s.push(`  yapilacak    : ${report.todo}`);
    if (report.lockRemoved !== undefined) {
      s.push(`  kilit        : ${report.lockRemoved ? "KALDIRILDI" : "duruyor"}`);
    }
    if (report.lockOpen !== undefined) {
      s.push(`  kilit        : ${report.lockOpen ? "ACIK" : "kapali"}`
        + (report.already ? " (zaten oyleydi)" : ""));
    }
  }
  if (report.command === "olcum") s.push(...metricsText(report));
  // `calistir`: ad verilmemisse cagrilabilir yuzeyin listesi, verilmisse
  // fonksiyonun kendi ciktisi. Liste metnini cagirici uretir (saf), rapor
  // katmani onu yalnizca yerlestirir.
  if (report.command === "calistir") {
    if (report.surfaceText) s.push("\n  CAGRILABILIR YUZEY\n" + report.surfaceText);
    else if (report.value !== undefined) {
      s.push(`\n  ${report.fn} -> ${typeof report.value === "object"
        ? JSON.stringify(report.value) : String(report.value)}`);
    }
  }
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

// ======================================================================
// Olcum ozetleyici — PURE
// ======================================================================

const finiteOrNull = (x) => (Number.isFinite(x) ? x : null);
const round1 = (x, digits = 1) => (x == null ? null : Number(x.toFixed(digits)));

// Sayı dizisinden dağılım. Boş dizi -> hepsi null (0 DEĞİL: 0 bir ölçümdür,
// "ölçüm yok" değildir).
export function distribution(values) {
  const d = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (d.length === 0) return { n: 0, median: null, mean: null, min: null, max: null };
  const mid = Math.floor(d.length / 2);
  return {
    n: d.length,
    median: round1(d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2),
    mean: round1(d.reduce((a, b) => a + b, 0) / d.length),
    min: round1(d[0]),
    max: round1(d[d.length - 1]),
  };
}

// CIFT SEMA: defter satirlari iki donemden geliyor. Eski satirlarda alan
// adlari TURKCE (zaman/tur/toplam_sn/giris_sn/adimlar), yenilerde INGILIZCE.
// Ikisini de okumak zorundayiz — metrik iddiasinin TABANI eski satirlarda.
//
// Bu gercek bir kayipti, uydurma bir onlem degil: 2026-08-31'de
// data/olcumler.jsonl'de 22 satirdan 1'i Ingilizce semadaydi ve `r.tur`
// filtresi onu SESSIZCE disarida birakiyordu.
//
// Adim ETIKETLERI cevrilmez ("modem algılandı", "reboot gönderildi"): onlar
// operatore gosterilen metin. Cevrilseydi stepSummary'nin kovalari ikiye
// bolunur ve medyan karsilastirmasi anlamini yitirirdi.
const alan = (r, yeni, eski) => r[yeni] ?? r[eski];
// Satir TURU de iki yazimla geliyor: eski satirlarda tur:"kurulum"/"elle"/
// "sifirlama", Ingilizce donemden kalanlarda kind:"run"/"manual"/"reset".
// Yeni satirlar INGILIZCE yazilir; okuma ucunu de kabul eder.
const TUR_ESLERI = Object.freeze({
  run: ["run", "kurulum"],
  manual: ["manual", "elle"],
  reset: ["reset", "sifirlama"],
});
const turu = (r) => alan(r, "kind", "tur");
const turuOlan = (rows, ad) => rows.filter((r) => TUR_ESLERI[ad].includes(turu(r)));

// Çalıştırma satırlarını özetler.
// rows: data/olcumler.jsonl satırları (nesne olarak)
// opts: { manualSec?, manualSource?, manualN?, modemCount? }
export function summarizeMetrics(rows = [], opts = {}) {
  const runs = turuOlan(rows, "run");
  const successful = runs.filter((r) => r.ok);
  // Elle olcumler AYNI dosyada, tur:"elle" ile. Boylece comparison tabani
  // da kayitli bir OLCUM olur — komut satirinda tasinan bir sayi degil.
  const manuals = turuOlan(rows, "manual");

  const summary = {
    timestamp: new Date().toISOString(),
    command: "olcum",
    rowCount: rows.length,
    run: {
      attemptedCount: runs.length,
      successful: successful.length,
      successRate: runs.length
        ? round1((successful.length / runs.length) * 100) : null,
      // İlk denemede biten kurulum oranı — tekrar'a ne sıklıkla düştüğümüz.
      firstTry: successful.filter((r) => (alan(r, "attempt", "deneme") ?? 1) === 1).length,
      distinctDevices: new Set(successful.map((r) => r.lan_mac).filter(Boolean)).size,
    },
    reset: {
      attemptedCount: turuOlan(rows, "reset").length,
    },
    // Araç süresi: "başlat"a bastıktan bitişe kadar (cihaz işi).
    toolSec: distribution(successful.map((r) => finiteOrNull(alan(r, "totalSec", "toplam_sn")))),
    // Operatörün numarayı girme süresi = insanın MEŞGUL olduğu tek an.
    entrySec: distribution(successful.map((r) => finiteOrNull(alan(r, "entrySec", "giris_sn")))),
    steps: stepSummary(successful),
    manualSec: distribution(manuals.map((r) => finiteOrNull(alan(r, "totalSec", "toplam_sn")))),
    problems: [],
  };

  summary.humanBusySec = summary.entrySec.median;
  summary.cycleSec = summary.toolSec.median != null && summary.entrySec.median != null
    ? round1(summary.toolSec.median + summary.entrySec.median) : summary.toolSec.median;

  // Taban secimi: KAYITLI olcum her zaman kazanir; yoksa disaridan verilen
  // sayi (beyan) kullanilir. Ozet hangisi oldugunu acikca tasir.
  const recordedBaseline = summary.manualSec.median != null;
  const baseline = recordedBaseline ? summary.manualSec.median : opts.manualSec;
  // Kayitli satirlarin HEPSI beyan mi? Beyan bir OLCUM DEGILDIR; rapor bunu
  // acikca soylemeli, yoksa "3 kayitli olcum" gibi hak etmedigimiz bir guven
  // uretir.
  const allDeclared = manuals.length > 0 && manuals.every((r) => alan(r, "declared", "beyan"));
  const sourceText = () => {
    if (!recordedBaseline) return opts.manualSource || "BEYAN — kayitli olcum yok";
    const who = manuals.map((r) => r.who).filter(Boolean)[0];
    const label = allDeclared ? "BEYAN" : "olcum";
    return `${summary.manualSec.n} ${label}${who ? ` · ${who}` : ""}`;
  };
  if (baseline) {
    summary.comparison = compare(summary, {
      ...opts,
      manualSec: baseline,
      manualSource: sourceText(),
      // Beyan, kac satir olsa da "olculmus" sayilmaz -> uyari uretsin.
      manualN: recordedBaseline && !allDeclared ? summary.manualSec.n : (opts.manualN ?? 0),
    });
  }
  summary.ok = successful.length > 0;
  if (successful.length === 0) {
    summary.problems.push({ code: "METRICS_EMPTY", severity: "warning",
      message: "No successful provisioning runs were recorded yet.",
      check: "Run the UI flow at least a few times; each finished run appends"
        + " one line to data/olcumler.jsonl." });
  }
  return summary;
}

// Adım adı -> süre dağılımı. En yavaş adım ayrıca işaretlenir (darboğaz).
function stepSummary(lines) {
  const bucket = new Map();
  for (const r of lines) {
    // Adim nesnesi de iki semali: eski {ad, sure_sn}, yeni {name, durationSec}.
    for (const a of alan(r, "steps", "adimlar") || []) {
      const name = alan(a, "name", "ad");
      if (name == null) continue;
      if (!bucket.has(name)) bucket.set(name, []);
      bucket.get(name).push(finiteOrNull(alan(a, "durationSec", "sure_sn")));
    }
  }
  const list = [...bucket].map(([name, values]) => ({ name, ...distribution(values) }));
  const slowest = list.reduce((e, a) => (a.median > (e?.median ?? -1) ? a : e), null);
  return list.map((a) => ({ ...a, bottleneck: a.name === slowest?.name }));
}

// Elle sürece göre kazanç. İki AYRI iddia üretir, çünkü ikisi farklı şey:
//   dongu  = toplam geçen süre (modem başına)
//   mesgul = insanın ekranda/klavyede olduğu süre
// İkincisi asıl kazanç: kalan süre gözetimsiz geçiyor.
function compare(summary, opts) {
  const manual = opts.manualSec;
  const ratio = (next) => (next == null || !manual ? null : {
    reductionPercent: round1(((manual - next) / manual) * 100),
    factor: round1(manual / next),
    savedSec: round1(manual - next),
  });
  const k = {
    manualSec: manual,
    manualSource: opts.manualSource || "belirtilmedi",
    manualN: opts.manualN ?? null,
    cycle: ratio(summary.cycleSec),
    humanBusy: ratio(summary.humanBusySec),
  };
  if (opts.modemCount && k.cycle) {
    k.scale = {
      modem: opts.modemCount,
      savedHours: round1((k.cycle.savedSec * opts.modemCount) / 3600),
    };
  }
  // Küçük örneklemde "%94 azalttık" demek abartı olur; eşiği açıkça söyle.
  if (summary.toolSec.n < 5) {
    k.warning = `Yalnizca ${summary.toolSec.n} basarili calistirma var; en az 5`
      + " (yeglenen 10) olmadan yuzde iddiasi zayif kalir.";
  }
  if ((k.manualN ?? 0) < 3) {
    k.manualWarning = "Elle sure icin en az 3 olcum onerilir; tek sayi ya da beyan"
      + " ise raporda BEYAN olarak etiketlenmeli.";
  }
  return k;
}

// ======================================================================
// Genel cagirici — fonksiyonu adiyla calistir
// ======================================================================

export function firstParameter(fn) {
  const s = String(fn);
  const ac = s.indexOf("(");
  if (ac === -1) return "";
  let depth = 0;
  let i = ac;
  for (; i < s.length; i += 1) {
    if (s[i] === "(") depth += 1;
    else if (s[i] === ")") { depth -= 1; if (depth === 0) break; }
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
// adini tasir ya da { host, sourceIp, kimlik } gibi yikilmis bir opts'tur.
// Saf functions (parseCnum, normalizePhone, settingLabel...) ham deger alir.
//
// Yikma bicimi TEK BASINA yetmez: provisioningGaps({ modemUp, simPresent })
// da yikma kullanir ama opts ALMAZ. Bu yuzden opts'a ozgu anahtar araniyor.
const OPTS_KEY_PATTERN = /\b(host|factoryHost|fieldHost|sourceIp|credentials)\b/;

export function takesOptions(fn) {
  const p = firstParameter(fn);
  if (/^opts\b/.test(p)) return true;
  return p.startsWith("{") && OPTS_KEY_PATTERN.test(p);
}

// argv -> { bayraklar, positionals }
//
// `--` AYRAC: oncesi opts'a karisan bayrak, sonrasi fonksiyona dogrudan giden
// konumsal arguman. Ayrac olmadan "AT+CNUM" gibi bir degerin bayrak mi
// arguman mi oldugu belirsiz kalirdi.
//
//   ["--host", "5.5.5.1", "--", "AT+CNUM"]
//     -> { bayraklar: { host: "5.5.5.1" }, positionals: ["AT+CNUM"] }
//
// Degersiz bayrak `true` olur: ["--zorla"] -> { manualConsent: true }
//
// KOPRU: CLI bayraklari TURKCE (tezgahtaki teknisyenin ezberi), cekirdek opts
// alanlari INGILIZCE. Ceviri TEK YERDE, asagidaki tabloda. Tabloda olmayan
// bayrak camelCase'e cevrilip oldugu gibi gecer — cekirdekte karsiligi varsa
// calisir, yoksa yok sayilir.
//
// Bu tablo olmadan `--kaynak-ip 5.5.5.100` sessizce `sourceIp` alanini
// dolduruyordu; cekirdek `sourceIp` bekledigi icin KAYNAK IP HIC VERILMEMIS
// gibi davraniyor ve yoklama yanlis arayuzden cikiyordu.
// DIKKAT: keyList TIRNAKLI. Bunlar JS tanimlayicisi degil, CLI BAYRAK
// ADLARI — bir yeniden adlandirma turunda ciplak keyList (zorla, profil...)
// koda benzedigi icin cevrildi ve kopru sessizce koptu. Tirnak onu engelliyor.
export const FLAG_TO_OPTION = Object.freeze({
  "kaynak-ip": "sourceIp",
  "saf": "pure",
  "saha-host": "fieldHost",
  "fabrika-host": "factoryHost",
  "yeni-host": "newHost",
  "yeni-kaynak": "newSourceIp",
  "profil": "profile",
  "telefon": "phone",
  "uygula": "apply",
  "zorla": "manualConsent",
  "deneme": "attempts",
  "internet-bekle": "internetWaitSec",
  "sure": "durationSec",
  "aralik": "intervalSec",
  "tur": "maxRounds",
  "max": "maxModems",
});

export function parseArgv(argv = []) {
  const separator = argv.indexOf("--");
  const beforeSeparator = separator === -1 ? argv : argv.slice(0, separator);
  const positionals = separator === -1 ? [] : argv.slice(separator + 1);
  const flags = {};
  for (let i = 0; i < beforeSeparator.length; i += 1) {
    const p = beforeSeparator[i];
    if (!p.startsWith("--")) continue;
    const rawText = p.slice(2);
    // Once koprude ara; yoksa --iki-kelime -> ikiKelime.
    const name = FLAG_TO_OPTION[rawText]
      ?? rawText.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const nextItem = beforeSeparator[i + 1];
    if (nextItem !== undefined && !nextItem.startsWith("--")) { flags[name] = nextItem; i += 1; }
    else flags[name] = true;
  }
  return { flags, positionals };
}

// Cagrilabilir yuzeyin tamami. tur: "fonksiyon" | "sabit".
export function listSurface(mode) {
  return Object.entries(mode)
    .map(([name, value]) => (typeof value === "function"
      ? { name, kind: "fonksiyon", takesOpts: takesOptions(value), signature: firstParameter(value) }
      : { name, kind: "sabit", takesOpts: false, signature: null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Listeyi insan-okunur metne cevirir (stderr'a basilacak).
export function surfaceText(list) {
  const s = [];
  const functions = list.filter((x) => x.kind === "fonksiyon");
  const constants = list.filter((x) => x.kind === "sabit");
  s.push(`  CIHAZA GIDEN (${functions.filter((x) => x.takesOpts).length})`
    + "  — ortam/bayraklar opts olarak gecer");
  for (const f of functions.filter((x) => x.takesOpts)) s.push(`    ${f.name}`);
  s.push(`\n  SAF (${functions.filter((x) => !x.takesOpts).length})`
    + "  — argumanlar `--` sonrasi verilir");
  for (const f of functions.filter((x) => !x.takesOpts)) {
    s.push(`    ${f.name.padEnd(26)}(${f.signature}${f.signature ? ", ..." : ""})`);
  }
  if (constants.length) {
    s.push(`\n  SABITLER (${constants.length})  — yazdirilir`);
    s.push("    " + constants.map((x) => x.name).join(", "));
  }
  return s.join("\n");
}

// Bilinmeyen ada en yakin adaylari bulur (basit: onek/parca eslesmesi).
function nearestNames(name, list) {
  const k = name.toLowerCase();
  return list.map((x) => x.name)
    .filter((a) => a.toLowerCase().includes(k) || k.includes(a.toLowerCase()))
    .slice(0, 5);
}

// Fonksiyonu cagirir. THROW ETMEZ — cekirdek sozlesmesi geregi sonuc nesnesi
// doner ve sorun varsa problems[] icinde gelir.
//
// opts        : ortamdan turemis cekirdek opts'u (host, sourceIp, kimlik...)
// bayraklar   : parseArgv ciktisi; opts'un uzerine yazilir
// positionals : `--` sonrasi args
// saf         : true ise opts ENJEKTE EDILMEZ (otomatik tespiti ezer)
export async function callByName(mode, name, { opts = {}, flags = {},
  positionals = [], pure = false } = {}) {
  const list = listSurface(mode);
  const timestamp = new Date().toISOString();

  if (!name) {
    return { timestamp, command: "calistir", ok: true, list,
      surfaceText: surfaceText(list), problems: [] };
  }
  if (!(name in mode)) {
    const near = nearestNames(name, list);
    return { timestamp, command: "calistir", fn: name, ok: false, problems: [{
      code: "ARGS", severity: "error",
      message: `Unknown export: ${name}`,
      check: near.length
        ? `Did you mean: ${near.join(", ")}? Full list: ricon.js calistir`
        : "Run `ricon.js calistir` with no name to list everything.",
    }] };
  }

  const value = mode[name];
  if (typeof value !== "function") {
    return { timestamp, command: "calistir", fn: name, kind: "sabit", ok: true,
      value, problems: [] };
  }

  const takesOpts = pure ? false : takesOptions(value);
  const args = takesOpts
    ? [{ ...opts, ...flags }, ...positionals]
    : positionals;

  // Cekirdek throw etmez, ama `calistir` KEYFI bir fonksiyonu KEYFI
  // argumanlarla cagirabilir (or. eksik arguman). Burada yakalanmazsa
  // kullanici stack trace gorurdu; sozlesme sonuc nesnesi diyor.
  let result;
  try {
    result = await value(...args);
  } catch (e) {
    return { timestamp, command: "calistir", fn: name, ok: false, problems: [{
      code: "CALL_FAILED", severity: "error",
      message: `${name}(): ${e?.name}: ${e?.message}`,
      check: `Check the argument shape: first parameter is \`${firstParameter(value)}\`.`
        + " Positional arguments go after `--`.",
    }] };
  }

  // Sonuc nesne degilse (string/bool/dizi) sarmala — CLI sozlesmesi bir
  // rapor nesnesi bekliyor (writeJson + summaryText + cikis kodu).
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    return { timestamp, command: "calistir", fn: name, ok: true, value: result, problems: [] };
  }
  return { timestamp, command: "calistir", fn: name, ...result,
    problems: result.problems ?? [] };
}
