// BEKCI: operatorun girdigi degerlerin kontrolu CEKIRDEKTE olmali.
//
// NEDEN VAR: bu kurallar bir ara iki yerde duruyordu — tarayici arayuzu
// telefonu 11 haneye ve PIN'i 4-8 rakama kendi suzuyor, cekirdek de ayrica
// reddediyordu. Arayuz kalkti. Eger kurallar GERCEKTEN cekirdekte degil de
// yalnizca ekranda yasiyor olsaydi, arayuzun kalkmasi onlari SESSIZCE
// kaldiracakti: bozuk numara deftere yazilir, bozuk PIN cihazda bir deneme
// yakardi.
//
// Bu dosya o sessiz kaybi imkansiz yapiyor. Iddiasi tek: her girdi kontrolu
// cekirdekte VE cihaza gitmeden yapiliyor.
//
// Cihaz GEREKTIRMEZ: hepsi ya saf fonksiyon ya da erisilemez adres uzerinden
// "cihaza hic gidilmedigi" kaniti.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, telefonGirdiBicimi } from "../src/device/sim.js";
import { provisionEksikleri } from "../src/flow/degerlendirme.js";
import { provisionModem, simPinHedefi } from "../src/flow/pipeline.js";
import { applyPin } from "../src/flow/provisioning.js";
import { pinDenemesiUygunMu } from "../src/domain/pin-karar.js";
import { simPinKaldir } from "../src/device/at.js";

// Erisilemez ama kaynak IP'si turetilebilir OLMAYAN adres: cagri cihaza
// gitmeye kalksa testin suresi patlar, bu da bir kanit.
const ULASILMAZ = { host: "192.0.2.9", kimlik: { kullanici: "u", sifre: "p" } };

// --- TELEFON: "11 hane, 05 ile baslar" kurali ---

test("telefon: gecerli TR mobil bicimleri KABUL edilir", () => {
  // Operatorun yazabilecegi her bicim ayni kanonik numaraya duser.
  for (const ham of ["05350634747", "+905350634747", "+90 535 063 47 47",
    "0535 063 47 47", "535-063-47-47", "5350634747"]) {
    assert.equal(normalizePhone(ham), "5350634747", `girdi: ${ham}`);
  }
});

test("telefon: HANE SAYISI kurali cekirdekte — eksik/fazla hane REDDEDILIR", () => {
  // Arayuzdeki "Eksik: N hane kaldi" uyarisinin altindaki gercek kural.
  for (const kotu of ["0535063474", "053506347477", "5", "535063474", "53506347477"]) {
    assert.equal(normalizePhone(kotu), null, `${kotu} kabul edilmemeli`);
  }
});

test("telefon: MOBIL OLMAYAN numara reddedilir (05 kurali)", () => {
  // Arayuz "Numara 05 ile baslamali" yaziyordu; kural burada.
  for (const kotu of ["02121234567", "04441234567", "01234567890", "0035350634747"]) {
    assert.equal(normalizePhone(kotu), null, `${kotu} mobil degil`);
  }
});

test("telefon: harf/simge iceren girdi reddedilir", () => {
  for (const kotu of ["0535abc4747", "535_063_4747", "0535 063 47 4x", "abcdefghijk"]) {
    assert.equal(normalizePhone(kotu), null, `${kotu} kabul edilmemeli`);
  }
});

test("telefon: bos/tanimsiz girdi reddedilir (patlamaz)", () => {
  for (const bos of ["", null, undefined, 0, false, "   "]) {
    assert.equal(normalizePhone(bos), null);
  }
});

test("telefon: EKRAN BICIMI de cekirdekten gelir (basina 0 kurali)", () => {
  // Arayuz "basina 0 ekle" kuralini TASIMIYORDU, cekirdekten hazir aliyordu.
  // Terminal de ayni yerden alacak.
  assert.equal(telefonGirdiBicimi("5350634747"), "05350634747");
  assert.equal(telefonGirdiBicimi("+905350634747"), "05350634747");
  assert.equal(telefonGirdiBicimi("gecersiz"), "", "gecersizde alan TEMIZ kalir");
});

test("telefon: gecersiz numara CIHAZA GITMEDEN reddedilir", async () => {
  const t = Date.now();
  const r = await provisionModem({
    ...ULASILMAZ, profil: { ad: "saha", nvram: {} },
    fabrikaHost: "192.0.2.1", sahaHost: "192.0.2.2",
    telefon: "0535063474",          // 10 hane — bir hane eksik
  });
  assert.equal(r.durum, "telefon_yok");
  assert.equal(r.problems[0].kod, "MSISDN_INVALID");
  assert.ok(Date.now() - t < 500, "aga cikmadan donmeli");
});

test("telefon: numara yoksa 'eksik' listesinde telefon var (baslatilamaz)", () => {
  // Arayuzdeki `baslatBtn.disabled` kapisinin cekirdekteki karsiligi.
  const eksik = provisionEksikleri({ modemVar: true, simTakili: true, telefon: null });
  assert.ok(eksik.includes("telefon"));
  const tamam = provisionEksikleri({
    modemVar: true, simTakili: true, telefon: "05350634747",
  });
  assert.deepEqual(tamam, [], "gecerli numarayla eksik kalmaz");
});

// --- PIN: "4-8 rakam" kurali, HER cagri yolunda ---
//
// Bu kural DORT ayri yolda gecerli olmali. Bozuk PIN cihazda garantili bosa
// harcanmis bir denemedir ve uc yanlis deneme SIM'i PUK'a kilitler; o yuzden
// her yol kendi kapisinda reddetmeli, "bir ustteki katman suzer" varsayimi
// yapmamali.

// BICIMI BOZUK olanlar: bir deger verilmis ama 4-8 rakam degil.
const BICIMI_BOZUK = ["1", "12", "123", "123456789", "1234567890",
  "abcd", "12a4", "12 34", "-123", "1.23"];
// HIC VERILMEMIS olanlar: cekirdek bunlari AYIRIYOR, cunku operatore
// soylenecek cumle farkli ("PIN'i gir" vs "PIN bicimi hatali").
const VERILMEMIS = ["", null, undefined];
const BOZUK_PINLER = [...BICIMI_BOZUK, ...VERILMEMIS];

test("PIN: bicim kurali SAF KARARDA — bozuk PIN izin almaz", () => {
  const kilit = { kilit: "pin", pin_kalan: 3, pin_toplam: 3 };
  for (const kotu of BICIMI_BOZUK) {
    const k = pinDenemesiUygunMu(kilit, kotu);
    assert.equal(k.uygun, false, `"${kotu}" izin almamali`);
    assert.ok(k.problems.some((p) => p.kod === "PIN_INVALID"), `"${kotu}" -> PIN_INVALID`);
  }
});

test("PIN: VERILMEMIS ile BICIMI BOZUK ayri raporlanir (ayri cumle)", () => {
  // Ikisi de reddedilir; fark ekranda: "PIN'i gir" ile "PIN bicimi hatali"
  // ayni sey degil. Bu ayrim cekirdegin kararidir, ekranin degil.
  const kilit = { kilit: "pin", pin_kalan: 3, pin_toplam: 3 };
  for (const yok of VERILMEMIS) {
    const k = pinDenemesiUygunMu(kilit, yok);
    assert.equal(k.uygun, false, `"${yok}" izin almamali`);
    assert.equal(k.sebep, "PIN_REQUIRED", `"${yok}" -> PIN_REQUIRED`);
  }
});

test("PIN: nvram yolu (simPinHedefi) bozuk PIN'e DOKUNMAZ", () => {
  const kilit = { kilit: "pin", pin_kalan: 3, pin_toplam: 3 };
  for (const kotu of BOZUK_PINLER.filter((p) => p)) {
    const { hedef, problems } = simPinHedefi(kilit, kotu);
    assert.equal(hedef, undefined, `"${kotu}" icin nvram'a yazilacak hedef olmamali`);
    assert.ok(problems.some((p) => p.kod === "PIN_INVALID"));
  }
});

test("PIN: yazma yolu (applyPin) bozuk PIN'de CIHAZA GITMEZ", async () => {
  const t = Date.now();
  for (const kotu of BOZUK_PINLER) {
    const r = await applyPin(ULASILMAZ, kotu);
    assert.equal(r.denendi, false, `"${kotu}" denenmemeli`);
    assert.equal(r.atlandi, "gecersiz_bicim");
    assert.equal(r.problems[0].kod, "PIN_INVALID");
  }
  assert.ok(Date.now() - t < 1000, "hicbiri aga cikmamali");
});

test("PIN: AT yolu (simPinKaldir) bozuk PIN'de CIHAZA GITMEZ", async () => {
  const t = Date.now();
  for (const kotu of BOZUK_PINLER) {
    const r = await simPinKaldir(ULASILMAZ, kotu);
    assert.equal(r.ok, false, `"${kotu}" icin ok:false`);
    assert.equal(r.problems[0].kod, "PIN_INVALID");
    assert.equal(r.pin_kalan, null, "kalan hak bile OKUNMADI: cihaza gidilmedi");
  }
  assert.ok(Date.now() - t < 1000, "hicbiri aga cikmamali");
});

test("PIN: gecerli bicim (4-8 rakam) TUM yollarda kabul edilir", () => {
  const kilit = { kilit: "pin", pin_kalan: 3, pin_toplam: 3 };
  for (const iyi of ["1234", "12345", "123456", "1234567", "12345678", "0000"]) {
    assert.equal(pinDenemesiUygunMu(kilit, iyi).uygun, true, `${iyi} kabul edilmeli`);
    assert.equal(simPinHedefi(kilit, iyi).hedef, iyi, `${iyi} nvram hedefi olmali`);
  }
});

test("PIN: kilit YOKSA PIN eksik sayilmaz (PIN'siz akis hedefi)", () => {
  const eksik = provisionEksikleri({
    modemVar: true, simTakili: true, telefon: "05350634747",
    simKilit: { kilit: null }, pin: null,
  });
  assert.deepEqual(eksik, [], "kilit yoksa PIN sorulmaz");
  const kilitli = provisionEksikleri({
    modemVar: true, simTakili: true, telefon: "05350634747",
    simKilit: { kilit: "pin" }, pin: null,
  });
  assert.ok(kilitli.includes("pin"), "kilit varsa PIN eksiktir");
});
