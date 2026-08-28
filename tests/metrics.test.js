// Olcum ozetleyici testleri — PURE, dosya/cihaz gerektirmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dagilim, summarizeMetrics } from "../src/metrics.js";

test("dagilim: tek sayida medyan ortadaki, cift sayida ortalamasi", () => {
  assert.equal(dagilim([5, 1, 3]).medyan, 3);
  assert.equal(dagilim([1, 2, 3, 4]).medyan, 2.5);
});

test("dagilim: bos girdi -> null (0 DEGIL; 0 bir olcumdur)", () => {
  assert.deepEqual(dagilim([]), { n: 0, medyan: null, ortalama: null, min: null, maks: null });
  assert.equal(dagilim([0, 0]).medyan, 0, "gercek 0 olcumu 0 kalir");
});

test("dagilim: sayi olmayanlari atar", () => {
  assert.equal(dagilim([2, null, undefined, NaN, "x", 4]).n, 2);
});

const satir = (ek = {}) => ({
  tur: "kurulum", ok: true, deneme: 1, toplam_sn: 40, giris_sn: 10,
  lan_mac: "00:0c:43:43:5f:4e",
  adimlar: [{ ad: "yazma", sure_sn: 6 }, { ad: "reboot->geri", sure_sn: 20 }],
  ...ek,
});

test("summarizeMetrics: basari orani ve ilk deneme sayisi", () => {
  const o = summarizeMetrics([
    satir(), satir({ deneme: 2 }), satir({ ok: false }),
    { tur: "sifirlama", ok: true, toplam_sn: 30 },
  ]);
  assert.equal(o.kurulum.denenen, 3);
  assert.equal(o.kurulum.basarili, 2);
  assert.equal(o.kurulum.basari_orani, 66.7);
  assert.equal(o.kurulum.ilk_denemede, 1);
  assert.equal(o.sifirlama.denenen, 1, "sifirlama kurulum sayilmaz");
});

test("summarizeMetrics: farkli cihaz sayisi MAC ile sayilir", () => {
  const o = summarizeMetrics([satir(), satir(), satir({ lan_mac: "aa:bb:cc:dd:ee:ff" })]);
  assert.equal(o.kurulum.farkli_cihaz, 2);
});

test("summarizeMetrics: en yavas adim darbogaz isaretlenir", () => {
  const o = summarizeMetrics([satir(), satir()]);
  const darbogaz = o.adimlar.find((a) => a.darbogaz);
  assert.equal(darbogaz.ad, "reboot->geri");
});

test("summarizeMetrics: karsilastirma iki AYRI iddia uretir", () => {
  const o = summarizeMetrics(Array.from({ length: 6 }, () => satir()),
    { elleSn: 900, elleKaynak: "3 olcum", elleN: 3, modemSayisi: 100 });
  // dongu = giris(10) + arac(40) = 50 sn; 900 -> 50 = %94.4, 18x
  assert.equal(o.dongu_sn, 50);
  assert.equal(o.karsilastirma.dongu.azalma_yuzde, 94.4);
  assert.equal(o.karsilastirma.dongu.kat, 18);
  // insan mesgul = 10 sn; 900 -> 10 = %98.9
  assert.equal(o.karsilastirma.insan_mesgul.azalma_yuzde, 98.9);
  assert.equal(o.karsilastirma.olcek.kazanilan_saat, 23.6);
  assert.equal(o.karsilastirma.uyari, undefined, "6 calistirma yeterli, uyari yok");
});

test("summarizeMetrics: az ornek ve beyan tabani UYARI uretir", () => {
  const o = summarizeMetrics([satir(), satir()], { elleSn: 900, elleN: 1 });
  assert.match(o.karsilastirma.uyari, /en az 5/);
  assert.match(o.karsilastirma.uyari_elle, /BEYAN/);
});

test("summarizeMetrics: hic basarili kayit yoksa ok:false + OLCUM_YOK", () => {
  const o = summarizeMetrics([]);
  assert.equal(o.ok, false);
  assert.equal(o.problems[0].kod, "OLCUM_YOK");
});

test("summarizeMetrics: KAYITLI elle olcum, komut satiri beyanini EZER", () => {
  const rows = [
    satir(), satir(), satir(), satir(), satir(),
    { tur: "elle", ok: true, toplam_sn: 780 },
    { tur: "elle", ok: true, toplam_sn: 900 },
    { tur: "elle", ok: true, toplam_sn: 840 },
  ];
  const o = summarizeMetrics(rows, { elleSn: 60, elleKaynak: "beyan" });
  assert.equal(o.elle_sn.n, 3);
  assert.equal(o.elle_sn.medyan, 840);
  assert.equal(o.karsilastirma.elle_sn, 840, "kayitli medyan kullanilir, 60 degil");
  assert.match(o.karsilastirma.elle_kaynak, /3 olcum/);
  assert.equal(o.karsilastirma.uyari_elle, undefined, "n=3 yeterli, uyari yok");
});

test("summarizeMetrics: kayitli elle olcum yoksa beyan tabani BEYAN diye etiketlenir", () => {
  const o = summarizeMetrics([satir(), satir()], { elleSn: 900 });
  assert.match(o.karsilastirma.elle_kaynak, /BEYAN/);
});

test("summarizeMetrics: elle olcumler kurulum sayilmaz", () => {
  const o = summarizeMetrics([satir(), { tur: "elle", ok: true, toplam_sn: 900 }]);
  assert.equal(o.kurulum.denenen, 1);
});

test("summarizeMetrics: BEYAN satiri olculmus gibi sunulmaz", () => {
  const rows = [
    satir(), satir(), satir(), satir(), satir(),
    { tur: "elle", ok: true, toplam_sn: 720, kim: "operasyon beyani", beyan: true },
  ];
  const o = summarizeMetrics(rows);
  assert.equal(o.karsilastirma.elle_sn, 720, "taban yine kayitli satirdan gelir");
  assert.match(o.karsilastirma.elle_kaynak, /BEYAN/, "kaynak BEYAN diye etiketli");
  assert.match(o.karsilastirma.elle_kaynak, /operasyon beyani/, "kim bilgisi tasinir");
  assert.ok(o.karsilastirma.uyari_elle, "beyan -> uyari uretir (olculmus sayilmaz)");
});

test("summarizeMetrics: gercek OLCUM satirlari beyan diye etiketlenmez", () => {
  const rows = [
    satir(), satir(), satir(), satir(), satir(),
    { tur: "elle", ok: true, toplam_sn: 780, kim: "teknisyen A" },
    { tur: "elle", ok: true, toplam_sn: 900, kim: "teknisyen A" },
    { tur: "elle", ok: true, toplam_sn: 840, kim: "teknisyen A" },
  ];
  const o = summarizeMetrics(rows);
  assert.match(o.karsilastirma.elle_kaynak, /3 olcum/);
  assert.equal(o.karsilastirma.uyari_elle, undefined);
});
