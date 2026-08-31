// Rapor katmani — sonucu JSON'a ve insan-okunur metne cevirir.
//
// Sir hijyeni: JSON'a kimlik (kullanici/sifre) ASLA yazilmaz. Cikti nesnesi
// zaten kimlik tasimaz; yine de guvenlik agi olarak stripSecrets() ile ozyinelemeli
// alan-adi + regex suzgeci uygulanir. Rapor paylasilabilir olmali.

import { SETTING_LABELS } from "./settings.js";
import { normalizeMetricRow } from "./legacy.js";

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
  if (typeof value === "string") return value.replace(SECRET_PATTERN, "Basic <redacted>");
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
  else if (t?.secret) display = raw === "" ? "(empty)" : "••••";
  else if (t?.values && raw in t.values) display = t.values[raw];
  else if (raw === "") display = "(empty)";
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
    if (r.page !== lastPage) { s.push(`  ${r.page || "(no page)"}`); lastPage = r.page; }
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
    : `${x.median} s  (n=${x.n}, ${x.min}–${x.max}, mean ${x.mean})`);
  s.push("\n  METRICS SUMMARY");
  s.push(`    rows                   : ${r.rowCount}`);
  s.push(`    runs                   : ${r.run.successful}/${r.run.attemptedCount} succeeded`
    + `${r.run.successRate != null ? ` (${r.run.successRate}%)` : ""}`
    + ` · first try ${r.run.firstTry}`
    + ` · ${r.run.distinctDevices} distinct devices`);
  if (r.manualSec?.n) {
    s.push(`    MANUAL process (median): ${d(r.manualSec)}`
      + `  = ${(r.manualSec.median / 60).toFixed(1)} min`);
  }
  s.push(`    tool time (median)     : ${d(r.toolSec)}`);
  s.push(`    number entry (median)  : ${d(r.entrySec)}`);
  s.push(`    cycle (entry + tool)   : ${r.cycleSec ?? "—"} s`);

  if (r.steps?.length) {
    s.push("\n    Step breakdown (median):");
    for (const a of r.steps) {
      // counts: birlestirilmis kovanin kac ayarlik yazmalari kapsadigi
      const span = a.counts ? ` ×${a.counts.join("/")}` : "";
      s.push(`      ${a.bottleneck ? "▲" : " "} ${String(a.step + span).padEnd(34)}`
        + `${String(a.median).padStart(6)} s  (${a.min}–${a.max}, n=${a.n})`);
    }
  }

  const k = r.comparison;
  if (k) {
    s.push(`\n    MANUAL PROCESS: ${k.manualSec} s (${(k.manualSec / 60).toFixed(1)} min)`
      + ` · source: ${k.manualSource}${k.manualN ? ` (n=${k.manualN})` : ""}`);
    if (k.cycle) {
      s.push(`      cycle time      : ${k.cycle.reductionPercent}% lower`
        + ` · ${k.cycle.factor}x faster · ${k.cycle.savedSec} s saved per modem`);
    }
    if (k.humanBusy) {
      s.push(`      human busy time : ${k.humanBusy.reductionPercent}% lower`
        + ` · ${k.humanBusy.factor}x · the rest runs UNATTENDED`);
    }
    if (k.scale) {
      s.push(`      total over ${k.scale.modem} modems: ${k.scale.savedHours} hours`);
    }
    if (k.warning) s.push(`      ! ${k.warning}`);
    if (k.manualWarning) s.push(`      ! ${k.manualWarning}`);
  } else {
    s.push("\n    (To compare against the manual process: --manual-minutes 15 --manual-source \"...\")");
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
    s.push("\n  System:");
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
    s.push(`\n  nvram: ${report.nvramKeyCount} keys pulled`);
  }
  if (report.command === "diff") {
    s.push(`\n  nvram diff: ${report.summary?.changed || 0} changed, `
      + `${report.summary?.added || 0} added, ${report.summary?.removed || 0} removed`);
    for (const [k, v] of Object.entries(report.changed || {})) {
      s.push(`    ~ ${k}: ${g(v.previous)}  ->  ${g(v.next)}`);
    }
    for (const [k, v] of Object.entries(report.added || {})) s.push(`    + ${k} = ${g(v)}`);
    for (const [k, v] of Object.entries(report.removed || {})) s.push(`    - ${k} (was: ${g(v)})`);
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
  if (report.command === "provision" || report.command === "provision-loop") {
    s.push(`
  Provision — status: ${g(report.status)}${report.attempt ? " (attempt " + report.attempt + ")" : ""}`);
    if (report.lastAction) s.push(`  Action: ${report.lastAction}`);
    if (report.internet) {
      s.push(`  Internet: ${report.internet.up
        ? `UP ${report.internet.wan_ip} (${report.internet.durationSec} s) — the SIM works`
        : `DOWN (waited ${report.internet.durationSec} s) — SIM status `
          + `${g(report.internet.simStatus)} · it may be PIN locked`}`);
    }
    if (report.record) {
      const k = report.record;
      s.push(`  Record: phone ${g(k.phone)} · ICCID ${g(k.iccid)} · IMEI ${g(k.imei)}`
        + ` · MAC ${g(k.lan_mac)} · ${g(k.operator)}`
        + `${k.wan_ip ? ` · WAN ${k.wan_ip}` : ""}`);
    }
    if (report.provisioned) {
      s.push(`  Modems provisioned: ${report.provisioned.length}`);
      for (const h of report.provisioned) {
        s.push(`    ${h.ok ? "✓" : "✗"} ${g(h.status)} · phone ${g(h.phone)} · ICCID ${g(h.iccid)}`);
      }
    }
  }
  if (report.command === "apply") {
    s.push(`\n  Provisioning (${report.profile}) — ${report.apply ? "REAL WRITE" : "DRY RUN"}`);
    s.push(`  Status: ${g(report.status)}`);
    if (report.planObj) {
      s.push(`  Changing: ${report.planObj.changingCount}, unchanged: ${report.planObj.unchangedCount}`);
      for (const [k, v] of Object.entries(report.planObj.changing || {})) {
        s.push(`    ~ ${k}: ${g(v.current)}  ->  ${g(v.target)}`);
      }
      if (report.planObj.missingKeys?.length) {
        s.push(`    ⚠ not on the device (will be created): ${report.planObj.missingKeys.join(", ")}`);
      }
    }
    if (report.verification) {
      s.push(`  Verification: ${report.verification.done
        ? `OK (${report.verification.waitedSec} s)`
        : "still changing: " + (report.verification.stillChanging || []).join(", ")}`);
      if (!report.verification.done && report.verification.reason) {
        s.push(`        → ${report.verification.reason}`);
      }
    }
    if (report.note) s.push(`  Note: ${report.note}`);
  }
  // Yeni tek-is komutlari: kisa ozet. Uzun metin yok — stdout'taki JSON
  // zaten tam veri; buradaki satir "bir bakista ne oldu" icin.
  if (report.command === "assess") {
    s.push(`
  location     : ${report.modem?.location ?? "no modem"}`);
    s.push(`  phone        : ${report.phone?.number ?? "—"}`
      + (report.phone?.source ? ` (${report.phone.source})` : ""));
    if (report.sim) {
      s.push(`  SIM          : ${report.sim.present ? "present" : "MISSING"}`
        + `${report.sim.lock ? ` · ${report.sim.lock.toUpperCase()} locked` : ""}`
        + `${report.sim.pinRemaining != null ? ` · ${report.sim.pinRemaining} attempts left` : ""}`);
    }
    if (report.internet) {
      s.push(`  internet     : ${report.internet.up ? report.internet.wan_ip : "DOWN"}`);
    }
    s.push(`  missing      : ${report.missing?.length ? report.missing.join(", ") : "nothing"}`);
    s.push(`  can start    : ${report.canStart ? "YES" : "no"}`);
    if (report.retry) {
      s.push(`  retry        : ${report.retry.retry
        ? `in ${report.retry.afterSec} s (${report.retry.reason})` : `no (${report.retry.reason})`}`);
    }
  }
  if (report.command === "msisdn") {
    s.push(`
  phone        : ${report.phone ?? "unreadable"} (${report.method})`);
    if (report.atPort) s.push(`  AT port      : ${report.atPort}`);
  }
  if (report.command === "sim-lock" || report.command?.startsWith("sim-pin-")) {
    s.push(`
  SIM status   : ${report.status ?? "?"}`);
    s.push(`  attempts left: PIN ${report.pinRemaining ?? "?"} · PUK ${report.pukRemaining ?? "?"}`);
    if (report.todo) s.push(`  to do        : ${report.todo}`);
    if (report.lockRemoved !== undefined) {
      s.push(`  lock         : ${report.lockRemoved ? "REMOVED" : "still on"}`);
    }
    if (report.lockOpen !== undefined) {
      s.push(`  lock         : ${report.lockOpen ? "ON" : "off"}`
        + (report.already ? " (already was)" : ""));
    }
  }
  if (report.command === "metrics") s.push(...metricsText(report));
  // `calistir`: ad verilmemisse cagrilabilir yuzeyin listesi, verilmisse
  // fonksiyonun kendi ciktisi. Liste metnini cagirici uretir (saf), rapor
  // katmani onu yalnizca yerlestirir.
  if (report.command === "call") {
    if (report.surfaceText) s.push("\n  CALLABLE SURFACE\n" + report.surfaceText);
    else if (report.value !== undefined) {
      s.push(`\n  ${report.fn} -> ${typeof report.value === "object"
        ? JSON.stringify(report.value) : String(report.value)}`);
    }
  }
  if (report.problems?.length) {
    s.push("\n  Problems:");
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

// CIFT SEMA ARTIK BURADA COZULMUYOR: normalizasyon src/legacy.js'te, TEK
// sinirda. Burasi kanonik satir bekler — dort semanin hangisinden geldigini
// bilmek zorunda degil.
//
// Neden tasidik: bu is eskiden asagiya dagilmis alan(r,"yeni","eski")
// ciftleriyle yapiliyordu ve her yeni kusak bir cift daha ekliyordu. Ucuncu
// kusak (Ingilizce DEGERLER) gelince dokuz ayri cagri noktasini ayni anda
// dogru tutmak imkansizlasti.
const kindIs = (rows, kind) => rows.map(normalizeMetricRow).filter((r) => r.kind === kind);

// Çalıştırma satırlarını özetler.
// rows: data/olcumler.jsonl satırları (nesne olarak)
// opts: { manualSec?, manualSource?, manualN?, modemCount? }
export function summarizeMetrics(rows = [], opts = {}) {
  const runs = kindIs(rows, "run");
  const successful = runs.filter((r) => r.ok);
  // Elle olcumler AYNI dosyada, tur:"elle" ile. Boylece comparison tabani
  // da kayitli bir OLCUM olur — komut satirinda tasinan bir sayi degil.
  const manuals = kindIs(rows, "manual");

  const summary = {
    timestamp: new Date().toISOString(),
    command: "metrics",
    rowCount: rows.length,
    run: {
      attemptedCount: runs.length,
      successful: successful.length,
      successRate: runs.length
        ? round1((successful.length / runs.length) * 100) : null,
      // İlk denemede biten kurulum oranı — tekrar'a ne sıklıkla düştüğümüz.
      firstTry: successful.filter((r) => (r.attempt ?? 1) === 1).length,
      distinctDevices: new Set(successful.map((r) => r.lan_mac).filter(Boolean)).size,
    },
    reset: {
      attemptedCount: kindIs(rows, "reset").length,
    },
    // Araç süresi: "başlat"a bastıktan bitişe kadar (cihaz işi).
    toolSec: distribution(successful.map((r) => finiteOrNull(r.totalSec))),
    // Operatörün numarayı girme süresi = insanın MEŞGUL olduğu tek an.
    entrySec: distribution(successful.map((r) => finiteOrNull(r.entrySec))),
    steps: stepSummary(successful),
    manualSec: distribution(manuals.map((r) => finiteOrNull(r.totalSec))),
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
  const allDeclared = manuals.length > 0 && manuals.every((r) => r.declared);
  const sourceText = () => {
    if (!recordedBaseline) return opts.manualSource || "DECLARED — no recorded measurement";
    const who = manuals.map((r) => r.who).filter(Boolean)[0];
    const label = allDeclared ? "declared" : "measured";
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
        + " one line to data/metrics.jsonl." });
  }
  return summary;
}

// Adim -> sure dagilimi. En yavas adim ayrica isaretlenir (darbogaz).
//
// Kova artik ETIKETE degil `step`e gore aciliyor. Etiket ayar sayisini icine
// gomdugu icin ("yazma basladi — 12 ayar") TEK mantiksal adim ALTI kovaya
// bolunuyordu; 23 satirlik defterde 16 kovanin 10'u ayni yazma adimiydi ve
// medyan karsilastirmasi anlamini yitirmisti. Sayi artik `counts` alaninda
// duruyor — birlestirdigimiz kovanin kac ayarlik yazmalari kapsadigi
// GORUNUR kalsin diye; yoksa birlestirme kendi basina bir bilgi kaybi olurdu.
function stepSummary(lines) {
  const bucket = new Map();
  for (const r of lines) {
    for (const a of r.steps || []) {
      if (a.step == null) continue;
      if (!bucket.has(a.step)) bucket.set(a.step, { values: [], counts: new Set() });
      const b = bucket.get(a.step);
      b.values.push(finiteOrNull(a.durationSec));
      if (Number.isFinite(a.count)) b.counts.add(a.count);
    }
  }
  const list = [...bucket].map(([step, b]) => ({
    step,
    ...distribution(b.values),
    counts: b.counts.size ? [...b.counts].sort((x, y) => x - y) : null,
  }));
  const slowest = list.reduce((e, a) => (a.median > (e?.median ?? -1) ? a : e), null);
  return list.map((a) => ({ ...a, bottleneck: a.step === slowest?.step }));
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
    manualSource: opts.manualSource || "unspecified",
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
    k.warning = `Only ${summary.toolSec.n} successful runs recorded; a percentage`
      + " claim stays weak below 5 runs (10 preferred).";
  }
  if ((k.manualN ?? 0) < 3) {
    k.manualWarning = "At least 3 manual measurements are recommended; a single"
      + " number, or a stated one, must be labelled declared in the report.";
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
// KOPRU: CLI bayrak adi -> cekirdek opts alani. Cogu bayrak icin ikisi ayni
// (--phone -> phone) ve camelCase kurali yetiyor; tablo yalnizca AYRISTIKLARI
// yeri tutuyor (--force -> manualConsent, --rounds -> maxRounds gibi).
//
// TEK AYRISTIRICI: bu tablo eskiden SADECE `call` komutunu etkiliyordu, diger
// on dort komut kendi `flag("--xxx")` sabitleriyle calisiyordu. Yani "kopru"
// adini tasiyip yuzeyin ondorttebirini kapsiyordu. Artik argv bir kez burada
// ayristiriliyor ve her komut ayni tablodan geciyor.
//
// DIKKAT: anahtarlar TIRNAKLI. Bunlar JS tanimlayicisi degil, CLI BAYRAK
// ADLARI — bir yeniden adlandirma turunda ciplak anahtarlar koda benzedigi
// icin cevrildi ve kopru sessizce koptu. Tirnak onu engelliyor.
export const FLAG_TO_OPTION = Object.freeze({
  "source-ip": "sourceIp",
  "field-host": "fieldHost",
  "factory-host": "factoryHost",
  "new-host": "newHost",
  "new-source-ip": "newSourceIp",
  "internet-wait": "internetWaitSec",
  "force": "manualConsent",
  "rounds": "maxRounds",
  "max": "maxModems",
  "from-file": "fromFile",
  "manual-minutes": "manualMinutes",
  "manual-source": "manualSource",
  "manual-n": "manualN",
  "modem-count": "modemCount",
  "no-reboot": "noReboot",
  "duration": "durationSec",
  "interval": "intervalSec",
});

export function parseArgv(argv = []) {
  const separator = argv.indexOf("--");
  const beforeSeparator = separator === -1 ? argv : argv.slice(0, separator);
  const positionals = separator === -1 ? [] : argv.slice(separator + 1);
  // `bare`: ayractan ONCE gelen, bayrak olmayan ve bir bayragin degeri de
  // olmayan sozcukler (`diff A.json B.json`). Eskiden bunlar SESSIZCE
  // atiliyordu ve konumsal arguman alan komutlar argv'ye elle bakiyordu —
  // yani ayristirici iki tane vardi. Tek ayristirici icin gerekli.
  const bare = [];
  const flags = {};
  for (let i = 0; i < beforeSeparator.length; i += 1) {
    const p = beforeSeparator[i];
    if (!p.startsWith("--")) { bare.push(p); continue; }
    const rawText = p.slice(2);
    // Once koprude ara; yoksa --iki-kelime -> ikiKelime.
    const name = FLAG_TO_OPTION[rawText]
      ?? rawText.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const nextItem = beforeSeparator[i + 1];
    if (nextItem !== undefined && !nextItem.startsWith("--")) { flags[name] = nextItem; i += 1; }
    else flags[name] = true;
  }
  return { flags, positionals, bare };
}

// Cagrilabilir yuzeyin tamami. tur: "function" | "constant".
export function listSurface(mode) {
  return Object.entries(mode)
    .map(([name, value]) => (typeof value === "function"
      ? { name, kind: "function", takesOpts: takesOptions(value), signature: firstParameter(value) }
      : { name, kind: "constant", takesOpts: false, signature: null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Listeyi insan-okunur metne cevirir (stderr'a basilacak).
export function surfaceText(list) {
  const s = [];
  const functions = list.filter((x) => x.kind === "function");
  const constants = list.filter((x) => x.kind === "constant");
  s.push(`  TOUCHES THE DEVICE (${functions.filter((x) => x.takesOpts).length})`
    + "  — env/flags are passed as opts");
  for (const f of functions.filter((x) => x.takesOpts)) s.push(`    ${f.name}`);
  s.push(`\n  PURE (${functions.filter((x) => !x.takesOpts).length})`
    + "  — arguments go after `--`");
  for (const f of functions.filter((x) => !x.takesOpts)) {
    s.push(`    ${f.name.padEnd(26)}(${f.signature}${f.signature ? ", ..." : ""})`);
  }
  if (constants.length) {
    s.push(`\n  CONSTANTS (${constants.length})  — printed`);
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
    return { timestamp, command: "call", ok: true, list,
      surfaceText: surfaceText(list), problems: [] };
  }
  if (!(name in mode)) {
    const near = nearestNames(name, list);
    return { timestamp, command: "call", fn: name, ok: false, problems: [{
      code: "ARGS", severity: "error",
      message: `Unknown export: ${name}`,
      check: near.length
        ? `Did you mean: ${near.join(", ")}? Full list: ricon call`
        : "Run `ricon call` with no name to list everything.",
    }] };
  }

  const value = mode[name];
  if (typeof value !== "function") {
    return { timestamp, command: "call", fn: name, kind: "constant", ok: true,
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
    return { timestamp, command: "call", fn: name, ok: false, problems: [{
      code: "CALL_FAILED", severity: "error",
      message: `${name}(): ${e?.name}: ${e?.message}`,
      check: `Check the argument shape: first parameter is \`${firstParameter(value)}\`.`
        + " Positional arguments go after `--`.",
    }] };
  }

  // Sonuc nesne degilse (string/bool/dizi) sarmala — CLI sozlesmesi bir
  // rapor nesnesi bekliyor (writeJson + summaryText + cikis kodu).
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    return { timestamp, command: "call", fn: name, ok: true, value: result, problems: [] };
  }
  return { timestamp, command: "call", fn: name, ...result,
    problems: result.problems ?? [] };
}
