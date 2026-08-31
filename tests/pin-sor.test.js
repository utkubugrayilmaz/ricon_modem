// SIM PIN kilidinin AKIS ICINDE sorulup kaldirilmasi — provisionModem.pinSor.
//
// NE DEGISTI: eskiden PIN kilitli SIM'de `hazirla` "SIM_PIN_LOCKED" deyip
// duruyordu ve operator ayri bir komut (sim-pin-kaldir) calistirmak zorundaydi.
// Simdi cekirdek tuketiciye PIN'i SORUYOR, kilidi SIM'den KALICI kaldiriyor ve
// akisi surduruyor. Zincirin sebebi: kilitli SIM abone verisini acmiyor, yani
// kilit kalkmadan telefon numarasi OKUNAMIYOR.
//
// BU DOSYANIN ASIL ISI GUVENLIK: uc yanlis PIN denemesi SIM'i PUK'a kilitler
// ve geri donusu yoktur. Yeni yol bir kapiyi bile gevsetmemis olmali.
//
// CIHAZ YOK, ama modem ALGILANMIS olmali: PIN sorma yolu ancak cihaz bir
// adreste cevap verirken isler. Bu yuzden 127.0.0.1:5123'te sahte bir
// dinleyici acilir — baglantiyi kabul edip ANINDA kapatir:
//   · isReachable "cihaz ayakta" der (connect basarili), yani konum olusur
//   · telnet/AT katmani ANINDA basarisiz olur, 20 sn zaman asimi beklenmez
// Kimlik `kimlikBilgi` ile disaridan veriliyor, yani HTTP'ye de gidilmiyor.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { provisionModem } from "../src/flow/pipeline.js";
import { simKilitKaldirmaKarari, simKilidiUygunMu } from "../src/device/at.js";
import { hakDurumu } from "../src/domain/pin-karar.js";

// isReachable YALNIZCA 80 ve 5123'e bakiyor; 5123 ayricalik gerektirmez.
const SAHTE_KAPI = 5123;
let sahteSunucu = null;

before(async () => {
  sahteSunucu = net.createServer((s) => s.destroy());
  await new Promise((c, r) => {
    sahteSunucu.once("error", r);
    sahteSunucu.listen(SAHTE_KAPI, "127.0.0.1", c);
  });
});

after(async () => {
  if (sahteSunucu) await new Promise((c) => sahteSunucu.close(c));
});

// PIN kilitli bir SIM'in kimlik okumasi (readIdentity'nin dondurdugu bicim).
const KILITLI_KIMLIK = (pinKalan = 3) => ({
  lan_mac: "00:0c:43:43:5f:4e", iccid: "8990011626160064930",
  imsi: "28601", imei: "867", operator: "Turkcell",
  sim_durumu: `Need verification PIN code (PIN: ${pinKalan}/3, PUK: 10/10)`,
  wan_ip: null,
  sim: { ham: `Need verification PIN code (PIN: ${pinKalan}/3, PUK: 10/10)`,
    kilit: "pin", hazir: false,
    pin_kalan: pinKalan, pin_toplam: 3, puk_kalan: 10, puk_toplam: 10 },
});

const TEMEL = {
  kimlik: { kullanici: "u", sifre: "p" },
  profil: { ad: "saha", nvram: {} },
  // Fabrika adresi = sahte dinleyici -> modem "fabrikada algilandi" sayilir.
  fabrikaHost: "127.0.0.1", fabrikaKaynak: "127.0.0.1",
  // Saha adresi erisilemez kalsin: yoklama sirasi fabrikayi zaten kazandirir.
  sahaHost: "198.51.100.1", sahaKaynak: "198.51.100.50",
  denemeler: 1,
  internetBekle: 0,
};

test("pinSor: SIM PIN kilitliyse cekirdek PIN'i SORAR ve kalan hakki bildirir", async () => {
  const sorulan = [];
  await provisionModem({
    ...TEMEL,
    kimlikBilgi: KILITLI_KIMLIK(3),
    pinSor: (bilgi) => { sorulan.push(bilgi); return null; },
  });
  assert.equal(sorulan.length, 1, "PIN tam bir kez sorulur");
  assert.equal(sorulan[0].pin_kalan, 3, "operator neyi riske attigini gorur");
  assert.equal(sorulan[0].puk_kalan, 10);
  assert.match(sorulan[0].durum, /Need verification PIN/);
});

// BEKCI: PIN, RETRY DONGUSUNE RAGMEN calistirma basina TEK KEZ sorulur.
//
// NEDEN VAR — olculmus gercek kusur: sorma blogu retry dongusunun icinde ve
// bayrak yoktu. `denemeler` VARSAYILANI 3 (bkz. ricon.js) oldugu icin sahada
// operatore ayni prompt UC KEZ cikiyordu; her turda AYNI, BAYAT "kalan hak"
// yaziliyordu (kimlik yalnizca kilit ACILINCA tazeleniyor) ve her tur bir hak
// daha yakabiliyordu. Testler o sirada `denemeler: 1` ile kosuyordu, yani
// gecerken CLI'nin gercek varsayilanini hic sinamiyorlardi.
//
// Retry dongusu GECICI hatalar icin var; yanlis PIN gecici degil, insan girdi
// hatasi. Aracin kendi kendine deneme tekrarlamasi projenin acik kurali.
test("pinSor: denemeler=3 (CLI varsayilani) olsa da TEK KEZ sorulur", async () => {
  const sorulan = [];
  await provisionModem({
    ...TEMEL,
    denemeler: 3,                        // CLI varsayilani — TEMEL'i EZIYOR
    kimlikBilgi: KILITLI_KIMLIK(3),
    // PIN veriliyor ki gercekten kaldirma denenip BASARISIZ olsun; kusurlu
    // surumde tam bu yol her turda yeniden soruyordu.
    pinSor: (bilgi) => { sorulan.push(bilgi.pin_kalan); return "9999"; },
  });
  assert.equal(sorulan.length, 1,
    `PIN ${sorulan.length} kez soruldu — retry dongusu operatoru tekrar tekrar`
    + " PIN girmeye zorluyor ve her tur bir hak yakabilir");
});

test("pinSor: kaldirma basarisizsa kalan hak TAZE deger ile duzeltilir", async () => {
  // Kaldirma basarisiz olunca elimizdeki kimlik okumasi bayatliyor: cihazdaki
  // kalan hak degismis olabilir. simPinKaldir kendi TAZE okumasini yapiyor ve
  // sayiyi donduruyor; rapor onu tasimali, eski sayiyi DEGIL.
  const r = await provisionModem({
    ...TEMEL,
    kimlikBilgi: KILITLI_KIMLIK(3),
    pinSor: () => "9999",
  });
  assert.ok(r.pin_kaldirma, "kaldirma denendi, kayit uretildi");
  assert.equal(r.pin_kaldirma.kilit_kaldirildi, false);
  // Cihaza ulasilamadigi icin taze okuma da null doner; onemli olan raporun
  // simPinKaldir'in DONDURDUGU degeri tasimasi, kendi eski kopyasini degil.
  assert.equal(r.pin_kaldirma.pin_kalan, null);
});

test("pinSor: kilit YOKSA hic sorulmaz (PIN'siz akis hedefi)", async () => {
  let soruldu = false;
  await provisionModem({
    ...TEMEL,
    // Kilit YOK. `hazir:false` bilerek: boylece cekirdek numarayi cihazdan
    // okumaya kalkmaz ve test telnet zaman asimlarini odemez. Sinanan sey
    // kilidin YOKLUGU — SIM'in hazir olup olmamasi bu karari ilgilendirmiyor.
    kimlikBilgi: { iccid: "8990", sim_durumu: "Invalid",
      sim: { kilit: null, hazir: false, pin_kalan: null } },
    pinSor: () => { soruldu = true; return "1234"; },
  });
  assert.equal(soruldu, false, "kilit bildirilmeyen SIM'de PIN sorulmaz");
});

test("pinSor: --pin VERILMISSE sorulmaz (eski yol: ayni yazma pasi)", async () => {
  // Iki yol birbirinin yerine gecmiyor: --pin verildiyse PIN ayarlarla ayni
  // pasa girer ve tek reboot olur. Ustune bir de sormak ikinci bir deneme
  // riski demekti.
  let soruldu = false;
  await provisionModem({
    ...TEMEL,
    kimlikBilgi: KILITLI_KIMLIK(3),
    pin: "1234",
    pinSor: () => { soruldu = true; return "5678"; },
  });
  assert.equal(soruldu, false);
});

test("pinSor: tuketici PIN VERMEZSE hicbir sey denenmez", async () => {
  const r = await provisionModem({
    ...TEMEL,
    kimlikBilgi: KILITLI_KIMLIK(3),
    pinSor: () => null,
  });
  assert.equal(r.pin_kaldirma, undefined, "denenmedi, kayit da uretilmedi");
  assert.ok(!JSON.stringify(r).includes("PIN_REJECTED"), "hak yakildigi iddiasi yok");
});

test("pinSor: tuketici YOKSA davranis ESKISI GIBI (geriye uyumlu)", async () => {
  // pinSor opsiyonel. Verilmezse cekirdek sormaz; kilit problems ile bildirilir
  // ve is duzgun basarisiz olur — eski sozlesme.
  const r = await provisionModem({
    ...TEMEL,
    kimlikBilgi: KILITLI_KIMLIK(3),
  });
  assert.equal(r.pin_kaldirma, undefined);
  assert.equal(typeof r.ok, "boolean", "throw etmez, sonuc nesnesi doner");
});

test("pinSor: PIN hicbir yere SIZMAZ (rapor, kayit, olaylar)", async () => {
  const PIN = "4271";
  const olaylar = [];
  const kayitlar = [];
  const r = await provisionModem({
    ...TEMEL,
    kimlikBilgi: KILITLI_KIMLIK(3),
    pinSor: () => PIN,
    olay: (o) => olaylar.push(o),
    kayit: (satir) => kayitlar.push(satir),
  });
  // Cihaza ulasilamadigi icin kaldirma basarisiz olacak — onemli olan PIN'in
  // hicbir ciktida GORUNMEMESI.
  assert.ok(!JSON.stringify(r).includes(PIN), "rapor PIN tasimaz");
  assert.ok(!JSON.stringify(olaylar).includes(PIN), "olaylar PIN tasimaz");
  assert.ok(!JSON.stringify(kayitlar).includes(PIN), "defter PIN tasimaz");
});

test("pinSor: kilit istegi OLAY olarak bildirilir (ekran haber verebilsin)", async () => {
  const olaylar = [];
  await provisionModem({
    ...TEMEL,
    kimlikBilgi: KILITLI_KIMLIK(2),
    pinSor: () => null,
    olay: (o) => olaylar.push(o),
  });
  const istek = olaylar.find((o) => o.tur === "pin_isteniyor");
  assert.ok(istek, "pin_isteniyor olayi yollanir");
  assert.equal(istek.pin_kalan, 2);
});

// --- GUVENLIK KAPILARI: yeni yol hicbirini gevsetmemis olmali ---

test("guvenlik: SON HAK elleOnay ile bile gecilemez", () => {
  // Bu, akisin en kritik kurali: 1 hak kalmisken yanlis PIN = PUK.
  for (const kalan of [1, 0]) {
    const k = hakDurumu({ kilit: "pin", pin_kalan: kalan, pin_toplam: 3 },
      { elleOnay: true });
    assert.equal(k.uygun, false, `kalan ${kalan} icin insan onayi da gecmez`);
    assert.equal(k.sebep, "PIN_LAST_ATTEMPT");
  }
});

test("guvenlik: PUK kilidinde PIN yolu KAPALI", () => {
  const k = simKilidiUygunMu({ kilit: "puk", puk_kalan: 10 }, { elleOnay: true });
  assert.equal(k.uygun, false);
  assert.equal(k.sebep, "SIM_PUK_LOCKED");
  // Karar PIN ile de ayni: PIN yazmak PUK kilidinde ISE YARAMAZ.
  const kk = simKilitKaldirmaKarari({ kilit: "puk", puk_kalan: 10 }, "1234",
    { elleOnay: true });
  assert.equal(kk.izin, false);
  assert.equal(kk.sebep, "SIM_PUK_LOCKED");
});

test("guvenlik: YANMIS hak otomatik yolda RED, insan onayiyla GECER", () => {
  const kilit = { kilit: "pin", pin_kalan: 2, pin_toplam: 3 };
  // Otomatik: arac kendi kendine ayni isi tekrarlamasin.
  assert.equal(hakDurumu(kilit).uygun, false);
  assert.equal(hakDurumu(kilit).sebep, "PIN_HAK_YANMIS");
  // Insan: dogru PIN'i bilen operator. pinSor yolu elleOnay:true kullaniyor.
  assert.equal(hakDurumu(kilit, { elleOnay: true }).uygun, true);
});

test("guvenlik: bozuk bicim, hak durumuna BAKILMADAN reddedilir", () => {
  // Bicim kontrolu ONCE gelir; bozuk PIN garantili bosa harcanmis denemedir.
  const k = simKilitKaldirmaKarari({ kilit: "pin", pin_kalan: 3, pin_toplam: 3 },
    "12ab", { elleOnay: true });
  assert.equal(k.izin, false);
  assert.equal(k.sebep, "PIN_INVALID");
});
