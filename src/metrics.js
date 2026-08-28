// Ölçüm özetleyici — PURE. Kaydedilmiş çalıştırma satırlarından savunulabilir
// sayı üretir. Dosya okumaz, cihaza gitmez, throw etmez.
//
// Neden medyan öne çıkıyor: örneklem küçük (5-15 çalıştırma) ve tek bir
// yavaş boot ortalamayı çeker. Medyan "tipik çalıştırma" için doğru cevap;
// ortalama, min ve maks yine raporlanır ki dağılım saklanmasın.
//
// DÜRÜSTLÜK KURALI: elle süre bir ÖLÇÜM ya da BEYAN'dır — hangisi olduğunu
// bu modül bilmez, çağıran söyler (`elleKaynak`). Özet, kaynağını taşır.

const count = (x) => (Number.isFinite(x) ? x : null);
const round1 = (x, basamak = 1) => (x == null ? null : Number(x.toFixed(basamak)));

// Sayı dizisinden dağılım. Boş dizi -> hepsi null (0 DEĞİL: 0 bir ölçümdür,
// "ölçüm yok" değildir).
export function distribution(values) {
  const d = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (d.length === 0) return { n: 0, median: null, average: null, min: null, max: null };
  const mid = Math.floor(d.length / 2);
  return {
    n: d.length,
    median: round1(d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2),
    average: round1(d.reduce((a, b) => a + b, 0) / d.length),
    min: round1(d[0]),
    max: round1(d[d.length - 1]),
  };
}

// Çalıştırma satırlarını özetler.
// rows: data/olcumler.jsonl satırları (nesne olarak)
// opts: { elleSn?, elleKaynak?, elleN?, modemSayisi? }
// ESKI SATIR UYUMU. 2026-08-28'de alan adlari Ingilizceye cevrildi; defterdeki
// ESKI satirlar Turkce adlarla yazilmisti (tur/durum/toplam_sn/giris_sn/
// lanMac/deneme ve tur degeri "kurulum"/"manual"/"sifirlama"). O satirlar
// metrik iddiasinin TABANI — silmedik, ikisini de okuyoruz. Yeni ad once.
const KIND_TR = { kurulum: "run", elle: "manual", sifirlama: "reset" };
const field = (row, current, legacy) => row[current] ?? row[legacy] ?? null;
const kindOf = (row) => {
  const k = row.kind ?? row.tur ?? null;
  return KIND_TR[k] ?? k;
};

export function summarizeMetrics(rows = [], options = {}) {
  const runs = rows.filter((r) => kindOf(r) === "run");
  const succeeded = runs.filter((r) => r.ok);
  // Elle olcumler AYNI dosyada, tur:"manual" ile. Boylece comparison tabani
  // da kayitli bir OLCUM olur — komut satirinda tasinan bir sayi degil.
  const manualRows = rows.filter((r) => kindOf(r) === "manual");

  const summary = {
    timestamp: new Date().toISOString(),
    command: "olcum",
    recordCount: rows.length,
    run: {
      attempted: runs.length,
      succeeded: succeeded.length,
      successRate: runs.length
        ? round1((succeeded.length / runs.length) * 100) : null,
      // İlk denemede biten kurulum oranı — retry'a ne sıklıkla düştüğümüz.
      onFirstAttempt: succeeded.filter((r) => (field(r, "attempt", "deneme") ?? 1) === 1).length,
      differentDevice: new Set(succeeded.map((r) => field(r, "lanMac", "lan_mac")).filter(Boolean)).size,
    },
    reset: {
      attempted: rows.filter((r) => r.kind === "sifirlama").length,
    },
    // Araç süresi: "başlat"a bastıktan bitişe kadar (cihaz işi).
    toolSec: distribution(succeeded.map((r) => count(field(r, "totalSec", "toplam_sn")))),
    // Operatörün numarayı girme süresi = insanın MEŞGUL olduğu tek an.
    entrySec: distribution(succeeded.map((r) => count(field(r, "entrySec", "giris_sn")))),
    steps: stepSummary(succeeded),
    manualSec: distribution(manualRows.map((r) => count(field(r, "totalSec", "toplam_sn")))),
    problems: [],
  };

  summary.humanBusySec = summary.entrySec.median;
  summary.cycleSec = summary.toolSec.median != null && summary.entrySec.median != null
    ? round1(summary.toolSec.median + summary.entrySec.median) : summary.toolSec.median;

  // Taban secimi: KAYITLI olcum her zaman kazanir; yoksa disaridan verilen
  // sayi (beyan) kullanilir. Ozet hangisi oldugunu acikca tasir.
  const recordedBaseline = summary.manualSec.median != null;
  const baseline = recordedBaseline ? summary.manualSec.median : options.manualSec;
  // Kayitli satirlarin HEPSI beyan mi? Beyan bir OLCUM DEGILDIR; rapor bunu
  // acikca soylemeli, yoksa "3 kayitli olcum" gibi hak etmedigimiz bir guven
  // uretir.
  const hepsiBeyan = manualRows.length > 0 && manualRows.every((r) => r.beyan);
  const sourceText = () => {
    if (!recordedBaseline) return options.manualSource || "BEYAN — kayitli olcum yok";
    const kim = manualRows.map((r) => r.kim).filter(Boolean)[0];
    const label = hepsiBeyan ? "BEYAN" : "olcum";
    return `${summary.manualSec.n} ${label}${kim ? ` · ${kim}` : ""}`;
  };
  if (baseline) {
    summary.comparison = karsilastir(summary, {
      ...options,
      manualSec: baseline,
      manualSource: sourceText(),
      // Beyan, kac satir olsa da "olculmus" sayilmaz -> uyari uretsin.
      manualCount: recordedBaseline && !hepsiBeyan ? summary.manualSec.n : (options.manualCount ?? 0),
    });
  }
  summary.ok = succeeded.length > 0;
  if (succeeded.length === 0) {
    summary.problems.push({ code: "OLCUM_YOK", severity: "warning",
      message: "No successful provisioning runs were recorded yet.",
      check: "Run the UI flow at least a few times; each finished run appends"
        + " one line to data/olcumler.jsonl." });
  }
  return summary;
}

// Adım adı -> süre dağılımı. En yavaş adım ayrıca işaretlenir (darboğaz).
function stepSummary(lines) {
  const buckets = new Map();
  for (const r of lines) {
    for (const a of (r.steps ?? r.adimlar) || []) {
      if (!buckets.has(a.name)) buckets.set(a.name, []);
      buckets.get(a.name).push(count(a.durationSec));
    }
  }
  const list = [...buckets].map(([name, values]) => ({ name, ...distribution(values) }));
  const slowest = list.reduce((e, a) => (a.median > (e?.median ?? -1) ? a : e), null);
  return list.map((a) => ({ ...a, bottleneck: a.name === slowest?.name }));
}

// Elle sürece göre kazanç. İki AYRI iddia üretir, çünkü ikisi farklı şey:
//   cycle  = toplam geçen süre (modem başına)
//   mesgul = insanın ekranda/klavyede olduğu süre
// İkincisi asıl kazanç: kalan süre gözetimsiz geçiyor.
function karsilastir(summary, options) {
  const manual = options.manualSec;
  const ratio = (next) => (next == null || !manual ? null : {
    reductionPct: round1(((manual - next) / manual) * 100),
    speedup: round1(manual / next),
    savedSec: round1(manual - next),
  });
  const k = {
    manualSec: manual,
    manualSource: options.manualSource || "belirtilmedi",
    manualCount: options.manualCount ?? null,
    cycle: ratio(summary.cycleSec),
    humanBusy: ratio(summary.humanBusySec),
  };
  if (options.modemCount && k.cycle) {
    k.scale = {
      modem: options.modemCount,
      savedHours: round1((k.cycle.savedSec * options.modemCount) / 3600),
    };
  }
  // Küçük örneklemde "%94 azalttık" demek abartı olur; eşiği açıkça söyle.
  if (summary.toolSec.n < 5) {
    k.uyari = `Yalnizca ${summary.toolSec.n} basarili calistirma var; en az 5`
      + " (yeglenen 10) olmadan yuzde iddiasi zayif kalir.";
  }
  if ((k.manualCount ?? 0) < 3) {
    k.manualWarning = "Elle sure icin en az 3 olcum onerilir; tek sayi ya da beyan"
      + " ise raporda BEYAN olarak etiketlenmeli.";
  }
  return k;
}
