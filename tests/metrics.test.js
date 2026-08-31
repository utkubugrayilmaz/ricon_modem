// Olcum ozetleyici testleri — PURE, dosya/cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { distribution, summarizeMetrics } from "../src/report.js";

test("dagilim: tek sayida medyan ortadaki, cift sayida ortalamasi", () => {
  assert.equal(distribution([5, 1, 3]).median, 3);
  assert.equal(distribution([1, 2, 3, 4]).median, 2.5);
});

test("dagilim: bos girdi -> null (0 DEGIL; 0 bir olcumdur)", () => {
  assert.deepEqual(distribution([]), { n: 0, median: null, mean: null, min: null, max: null });
  assert.equal(distribution([0, 0]).median, 0, "gercek 0 olcumu 0 kalir");
});

test("dagilim: sayi olmayanlari atar", () => {
  assert.equal(distribution([2, null, undefined, NaN, "x", 4]).n, 2);
});

const line = (extra = {}) => ({
  kind: "kurulum", ok: true, attempt: 1, totalSec: 40, entrySec: 10,
  lan_mac: "00:0c:43:43:5f:4e",
  steps: [{ name: "yazma", durationSec: 6 }, { name: "reboot->geri", durationSec: 20 }],
  ...extra,
});

test("summarizeMetrics: basari orani ve ilk deneme sayisi", () => {
  const o = summarizeMetrics([
    line(), line({ attempt: 2 }), line({ ok: false }),
    { kind: "sifirlama", ok: true, totalSec: 30 },
  ]);
  assert.equal(o.run.attemptedCount, 3);
  assert.equal(o.run.successful, 2);
  assert.equal(o.run.successRate, 66.7);
  assert.equal(o.run.firstTry, 1);
  assert.equal(o.reset.attemptedCount, 1, "sifirlama kurulum sayilmaz");
});

test("summarizeMetrics: farkli cihaz sayisi MAC ile sayilir", () => {
  const o = summarizeMetrics([line(), line(), line({ lan_mac: "aa:bb:cc:dd:ee:ff" })]);
  assert.equal(o.run.distinctDevices, 2);
});

test("summarizeMetrics: en yavas adim darbogaz isaretlenir", () => {
  const o = summarizeMetrics([line(), line()]);
  const bottleneck = o.steps.find((a) => a.bottleneck);
  assert.equal(bottleneck.name, "reboot->geri");
});

test("summarizeMetrics: karsilastirma iki AYRI iddia uretir", () => {
  const o = summarizeMetrics(Array.from({ length: 6 }, () => line()),
    { manualSec: 900, manualSource: "3 olcum", manualN: 3, modemCount: 100 });
  // dongu = giris(10) + arac(40) = 50 sn; 900 -> 50 = %94.4, 18x
  assert.equal(o.cycleSec, 50);
  assert.equal(o.comparison.cycle.reductionPercent, 94.4);
  assert.equal(o.comparison.cycle.factor, 18);
  // insan mesgul = 10 sn; 900 -> 10 = %98.9
  assert.equal(o.comparison.humanBusy.reductionPercent, 98.9);
  assert.equal(o.comparison.scale.savedHours, 23.6);
  assert.equal(o.comparison.warning, undefined, "6 calistirma yeterli, uyari yok");
});

test("summarizeMetrics: az ornek ve beyan tabani UYARI uretir", () => {
  const o = summarizeMetrics([line(), line()], { manualSec: 900, manualN: 1 });
  assert.match(o.comparison.warning, /en az 5/);
  assert.match(o.comparison.manualWarning, /BEYAN/);
});

test("summarizeMetrics: hic basarili kayit yoksa ok:false + OLCUM_YOK", () => {
  const o = summarizeMetrics([]);
  assert.equal(o.ok, false);
  assert.equal(o.problems[0].code, "METRICS_EMPTY");
});

test("summarizeMetrics: KAYITLI elle olcum, komut satiri beyanini EZER", () => {
  const rows = [
    line(), line(), line(), line(), line(),
    { kind: "elle", ok: true, totalSec: 780 },
    { kind: "elle", ok: true, totalSec: 900 },
    { kind: "elle", ok: true, totalSec: 840 },
  ];
  const o = summarizeMetrics(rows, { manualSec: 60, manualSource: "beyan" });
  assert.equal(o.manualSec.n, 3);
  assert.equal(o.manualSec.median, 840);
  assert.equal(o.comparison.manualSec, 840, "kayitli medyan kullanilir, 60 degil");
  assert.match(o.comparison.manualSource, /3 olcum/);
  assert.equal(o.comparison.manualWarning, undefined, "n=3 yeterli, uyari yok");
});

test("summarizeMetrics: kayitli elle olcum yoksa beyan tabani BEYAN diye etiketlenir", () => {
  const o = summarizeMetrics([line(), line()], { manualSec: 900 });
  assert.match(o.comparison.manualSource, /BEYAN/);
});

test("summarizeMetrics: elle olcumler kurulum sayilmaz", () => {
  const o = summarizeMetrics([line(), { kind: "elle", ok: true, totalSec: 900 }]);
  assert.equal(o.run.attemptedCount, 1);
});

test("summarizeMetrics: BEYAN satiri olculmus gibi sunulmaz", () => {
  const rows = [
    line(), line(), line(), line(), line(),
    { kind: "elle", ok: true, totalSec: 720, who: "operasyon beyani", declared: true },
  ];
  const o = summarizeMetrics(rows);
  assert.equal(o.comparison.manualSec, 720, "taban yine kayitli satirdan gelir");
  assert.match(o.comparison.manualSource, /BEYAN/, "kaynak BEYAN diye etiketli");
  assert.match(o.comparison.manualSource, /operasyon beyani/, "kim bilgisi tasinir");
  assert.ok(o.comparison.manualWarning, "beyan -> uyari uretir (olculmus sayilmaz)");
});

test("summarizeMetrics: gercek OLCUM satirlari beyan diye etiketlenmez", () => {
  const rows = [
    line(), line(), line(), line(), line(),
    { kind: "elle", ok: true, totalSec: 780, who: "teknisyen A" },
    { kind: "elle", ok: true, totalSec: 900, who: "teknisyen A" },
    { kind: "elle", ok: true, totalSec: 840, who: "teknisyen A" },
  ];
  const o = summarizeMetrics(rows);
  assert.match(o.comparison.manualSource, /3 olcum/);
  assert.equal(o.comparison.manualWarning, undefined);
});

// --- Cift sema: defter iki donemden geliyor ---
//
// NEDEN VAR — olculmus gercek bir kayip: 2026-08-31'de data/olcumler.jsonl'de
// 22 satirdan 21'i Turkce anahtarli (zaman/tur/toplam_sn), 1'i Ingilizce
// donemden kalmaydi (timestamp/kind/totalSec). `r.tur === "kurulum"` filtresi
// o satiri SESSIZCE disarida birakiyordu; kurulum sayisi 10 yerine 9
// gorunuyordu. Asagidaki iki satir dosyadan ALINMIS gercek bicimlerdir.

const ESKI_SATIR = {
  zaman: "2026-08-27T10:17:32.748Z", tur: "kurulum", durum: "hazir", ok: true,
  deneme: 1, toplam_sn: 41.3, giris_sn: 9.8, lan_mac: "00:0C:43:43:5F:4E",
  adimlar: [{ ad: "modem algılandı", sure_sn: 3.3 }],
};
const YENI_SATIR = {
  timestamp: "2026-08-28T13:13:34.279Z", kind: "run", status: "hazir", ok: true,
  attempt: 1, totalSec: 50.0, entrySec: 8.0, lan_mac: "00:0C:43:43:5F:5A",
  steps: [{ name: "modem algılandı", durationSec: 4.1 }],
};

test("cift sema: ESKI (Turkce) ve YENI (Ingilizce) satirlarin IKISI de sayilir", () => {
  const r = summarizeMetrics([ESKI_SATIR, YENI_SATIR]);
  assert.equal(r.run.attemptedCount, 2, "iki satir da kurulum sayilmali");
  assert.equal(r.run.successful, 2);
  assert.equal(r.run.distinctDevices, 2, "lan_mac iki satirdan da okunmali");
  assert.equal(r.toolSec.n, 2, "toplam_sn ve totalSec ayni kovaya girmeli");
  assert.equal(r.toolSec.median, 45.6);
  assert.equal(r.entrySec.n, 2, "giris_sn ve entrySec ayni kovaya girmeli");
});

test("cift sema: adim ETIKETLERI ayni oldugu icin kova BOLUNMEZ", () => {
  // Etiket cevrilseydi "modem algılandı" ve "modem detected" iki ayri kova
  // olur, medyan karsilastirmasi anlamini yitirirdi.
  const r = summarizeMetrics([ESKI_SATIR, YENI_SATIR]);
  assert.equal(r.steps.length, 1, "tek kova olmali");
  assert.equal(r.steps[0].name, "modem algılandı");
  assert.equal(r.steps[0].n, 2);
});

test("cift sema: elle olcum iki yazimda da taban olur", () => {
  const eski = { tur: "elle", toplam_sn: 900, ok: true };
  const yeni = { kind: "manual", totalSec: 900, ok: true };
  assert.equal(summarizeMetrics([eski]).manualSec.n, 1);
  assert.equal(summarizeMetrics([yeni]).manualSec.n, 1);
  assert.equal(summarizeMetrics([eski, yeni]).manualSec.n, 2);
});
