// Olcum ozetleyici testleri — PURE, dosya/cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { distribution, summarizeMetrics } from "../src/metrics.js";

test("dagilim: tek sayida medyan ortadaki, cift sayida ortalamasi", () => {
  assert.equal(distribution([5, 1, 3]).median, 3);
  assert.equal(distribution([1, 2, 3, 4]).median, 2.5);
});

test("dagilim: bos girdi -> null (0 DEGIL; 0 bir olcumdur)", () => {
  assert.deepEqual(distribution([]), { n: 0, median: null, average: null, min: null, max: null });
  assert.equal(distribution([0, 0]).median, 0, "gercek 0 olcumu 0 kalir");
});

test("dagilim: sayi olmayanlari atar", () => {
  assert.equal(distribution([2, null, undefined, NaN, "x", 4]).n, 2);
});

const line = (ek = {}) => ({
  kind: "kurulum", ok: true, attempt: 1, totalSec: 40, entrySec: 10,
  lanMac: "00:0c:43:43:5f:4e",
  steps: [{ name: "write", durationSec: 6 }, { name: "reboot->geri", durationSec: 20 }],
  ...ek,
});

test("summarizeMetrics: basari orani ve ilk deneme sayisi", () => {
  const o = summarizeMetrics([
    line(), line({ attempt: 2 }), line({ ok: false }),
    { kind: "sifirlama", ok: true, totalSec: 30 },
  ]);
  assert.equal(o.run.attempted, 3);
  assert.equal(o.run.succeeded, 2);
  assert.equal(o.run.successRate, 66.7);
  assert.equal(o.run.onFirstAttempt, 1);
  assert.equal(o.reset.attempted, 1, "sifirlama kurulum sayilmaz");
});

test("summarizeMetrics: farkli cihaz sayisi MAC ile sayilir", () => {
  const o = summarizeMetrics([line(), line(), line({ lanMac: "aa:bb:cc:dd:ee:ff" })]);
  assert.equal(o.run.differentDevice, 2);
});

test("summarizeMetrics: en yavas adim darbogaz isaretlenir", () => {
  const o = summarizeMetrics([line(), line()]);
  const bottleneck = o.steps.find((a) => a.bottleneck);
  assert.equal(bottleneck.name, "reboot->geri");
});

test("summarizeMetrics: karsilastirma iki AYRI iddia uretir", () => {
  const o = summarizeMetrics(Array.from({ length: 6 }, () => line()),
    { manualSec: 900, manualSource: "3 olcum", manualCount: 3, modemCount: 100 });
  // dongu = giris(10) + arac(40) = 50 sn; 900 -> 50 = %94.4, 18x
  assert.equal(o.cycleSec, 50);
  assert.equal(o.karsilastirma.dongu.reductionPct, 94.4);
  assert.equal(o.karsilastirma.dongu.speedup, 18);
  // insan mesgul = 10 sn; 900 -> 10 = %98.9
  assert.equal(o.karsilastirma.humanBusy.reductionPct, 98.9);
  assert.equal(o.karsilastirma.olcek.kazanilan_saat, 23.6);
  assert.equal(o.karsilastirma.uyari, undefined, "6 calistirma yeterli, uyari yok");
});

test("summarizeMetrics: az ornek ve beyan tabani UYARI uretir", () => {
  const o = summarizeMetrics([line(), line()], { manualSec: 900, manualCount: 1 });
  assert.match(o.karsilastirma.uyari, /en az 5/);
  assert.match(o.karsilastirma.manualWarning, /BEYAN/);
});

test("summarizeMetrics: hic basarili kayit yoksa ok:false + OLCUM_YOK", () => {
  const o = summarizeMetrics([]);
  assert.equal(o.ok, false);
  assert.equal(o.problems[0].code, "OLCUM_YOK");
});

test("summarizeMetrics: KAYITLI elle olcum, komut satiri beyanini EZER", () => {
  const rows = [
    line(), line(), line(), line(), line(),
    { kind: "manual", ok: true, totalSec: 780 },
    { kind: "manual", ok: true, totalSec: 900 },
    { kind: "manual", ok: true, totalSec: 840 },
  ];
  const o = summarizeMetrics(rows, { manualSec: 60, manualSource: "beyan" });
  assert.equal(o.manualSec.n, 3);
  assert.equal(o.manualSec.median, 840);
  assert.equal(o.karsilastirma.manualSec, 840, "kayitli medyan kullanilir, 60 degil");
  assert.match(o.karsilastirma.manualSource, /3 olcum/);
  assert.equal(o.karsilastirma.manualWarning, undefined, "n=3 yeterli, uyari yok");
});

test("summarizeMetrics: kayitli elle olcum yoksa beyan tabani BEYAN diye etiketlenir", () => {
  const o = summarizeMetrics([line(), line()], { manualSec: 900 });
  assert.match(o.karsilastirma.manualSource, /BEYAN/);
});

test("summarizeMetrics: elle olcumler kurulum sayilmaz", () => {
  const o = summarizeMetrics([line(), { kind: "manual", ok: true, totalSec: 900 }]);
  assert.equal(o.run.attempted, 1);
});

test("summarizeMetrics: BEYAN satiri olculmus gibi sunulmaz", () => {
  const rows = [
    line(), line(), line(), line(), line(),
    { kind: "manual", ok: true, totalSec: 720, kim: "operasyon beyani", beyan: true },
  ];
  const o = summarizeMetrics(rows);
  assert.equal(o.karsilastirma.manualSec, 720, "taban yine kayitli satirdan gelir");
  assert.match(o.karsilastirma.manualSource, /BEYAN/, "kaynak BEYAN diye etiketli");
  assert.match(o.karsilastirma.manualSource, /operasyon beyani/, "kim bilgisi tasinir");
  assert.ok(o.karsilastirma.manualWarning, "beyan -> uyari uretir (olculmus sayilmaz)");
});

test("summarizeMetrics: gercek OLCUM satirlari beyan diye etiketlenmez", () => {
  const rows = [
    line(), line(), line(), line(), line(),
    { kind: "manual", ok: true, totalSec: 780, kim: "teknisyen A" },
    { kind: "manual", ok: true, totalSec: 900, kim: "teknisyen A" },
    { kind: "manual", ok: true, totalSec: 840, kim: "teknisyen A" },
  ];
  const o = summarizeMetrics(rows);
  assert.match(o.karsilastirma.manualSource, /3 olcum/);
  assert.equal(o.karsilastirma.manualWarning, undefined);
});
