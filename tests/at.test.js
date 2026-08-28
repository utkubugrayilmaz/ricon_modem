// AT katmani — SAF ayristiricilar. Cihaz/ag GEREKTIRMEZ.
// Ornek cevaplar kardes calisma RVM-Modem'de canli cihazdan alinmis bicimlerle
// ayni (Ricon S9922M44 + Quectel Q200AF + Turkcell).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCnum, parseCpin, parsePinCounter, parseClck, parseCcid,
  atOk, atShellCommand, extractAtResponse, isAtWriteCommand, isAtResponseMixed,
} from "../src/at.js";

test("parseCnum: SIM'e yazili numarayi BIZIM kanonik bicime cevirir", () => {
  // Cihazdan gelen gercek bicim
  assert.equal(parseCnum('+CNUM: "","+905350634756",145\nOK'), "5350634756");
  // Alpha alani dolu olabilir
  assert.equal(parseCnum('+CNUM: "Hat","+905350634756",145'), "5350634756");
  // 0 ile baslayan yerel bicim
  assert.equal(parseCnum('+CNUM: "","05350634756",129'), "5350634756");
});

test("parseCnum: bos/gecersiz -> null (uydurmaz)", () => {
  assert.equal(parseCnum("OK"), null, "CNUM satiri yoksa null");
  assert.equal(parseCnum('+CNUM: "","",145'), null, "bos numara null");
  assert.equal(parseCnum('+CNUM: "","+4915112345678",145'), null,
    "TR mobil olmayan numara kabul EDILMEZ");
  assert.equal(parseCnum(null), null);
});

test("parseCnum: birden fazla satirdan ILK GECERLI olani alir", () => {
  const c = '+CNUM: "","",145\n+CNUM: "","+905350634756",145\nOK';
  assert.equal(parseCnum(c), "5350634756");
});

test("parseCpin: kilit durumu", () => {
  assert.equal(parseCpin("+CPIN: READY\nOK"), "READY");
  assert.equal(parseCpin("+CPIN: SIM PIN\nOK"), "SIM PIN");
  assert.equal(parseCpin("+CPIN: SIM PUK\nOK"), "SIM PUK");
  assert.equal(parseCpin("ERROR"), "UNKNOWN", "okunamadi -> UNKNOWN (hazir DEGIL)");
  assert.equal(parseCpin(null), "UNKNOWN");
});

test("parsePinCounter: Quectel (+QPINC) ve standart (+CPINC)", () => {
  assert.deepEqual(parsePinCounter('+QPINC: "SC",3,10\nOK'), { pin: 3, puk: 10 });
  assert.deepEqual(parsePinCounter("+CPINC: 2,3,10,10\nOK"), { pin: 2, puk: 10 });
  assert.equal(parsePinCounter("ERROR"), null, "okunamadi -> null (0 DEGIL)");
});

test("parseClck: PIN sorgusu acik mi", () => {
  assert.equal(parseClck("+CLCK: 1\nOK"), true);
  assert.equal(parseClck("+CLCK: 0\nOK"), false);
  assert.equal(parseClck("ERROR"), null);
});

test("parseCcid: sondaki dolgu F atilir", () => {
  assert.equal(parseCcid("+CCID: 8990011626160064930F\nOK"), "8990011626160064930");
  assert.equal(parseCcid("+ICCID: 8990011626160064930\nOK"), "8990011626160064930");
  assert.equal(parseCcid("8990011626160064930F"), "8990011626160064930");
  assert.equal(parseCcid("OK"), null);
});

test("atTamam: OK varsa ve ERROR yoksa basarili", () => {
  assert.equal(atOk("+CNUM: ...\nOK"), true);
  assert.equal(atOk("OK\n+CME ERROR: 10"), false, "ERROR varsa basarisiz");
  assert.equal(atOk("ERROR"), false);
  assert.equal(atOk(""), false);
});

test("atKabukKomutu: portu ACIK TUTAN bicim (DTR dusmesin)", () => {
  const k = atShellCommand("/dev/ttyUSB0", "AT+CNUM", 3);
  assert.match(k, /exec 3<>\/dev\/ttyUSB0/, "port tek fd ile acik tutulur");
  // String.raw: kacis karisikligi olmasin. Kabuga giden metin TAM olarak bu.
  assert.ok(k.includes(String.raw`printf 'AT+CNUM\r' >&3`),
    "komut sonu CR (\\r) SART — \\n yetmiyor");
  assert.match(k, /read -t 3 l <&3/, "okuma ayni fd'den");
  assert.match(k, /exec 3<&-/, "fd kapatilir");
});

test("atCevabiAyikla: kabuk gurultusunu atar, yalniz ATL: satirlarini alir", () => {
  const raw = [
    "exec 3<>/dev/ttyUSB0; printf ...",   // kabuk yankisi
    "ATL:",
    "ATL:+CNUM: \"\",\"+905350634756\",145",
    "ATL:",
    "ATL:OK",
    "root@Router:/#",                      // prompt
  ].join("\n");
  const c = extractAtResponse(raw);
  assert.equal(parseCnum(c), "5350634756");
  assert.ok(!c.includes("exec 3<>"), "kabuk yankisi ciktiya karismaz");
  assert.ok(!c.includes("root@"), "prompt ciktiya karismaz");
});

test("atCevabiAyikla: bos girdi patlamaz", () => {
  assert.equal(extractAtResponse(null), "");
  assert.equal(extractAtResponse(""), "");
});

// --- Yazma filtresi: SORGU ile YAZMA ayrimi ---
//
// KUSUR (2026-08-28, canli denemeden ONCE yakalandi): filtre `^AT+CLCK=`
// diye bakiyordu, ama CLCK'in SORGU formu da `=` iceriyor:
//   AT+CLCK="SC",2          -> mode 2 = SORGU. PIN harcamaz, bir sey degistirmez.
//   AT+CLCK="SC",0,"1234"   -> mode 0 = kilidi KAPAT. Parola ister, hak yakar.
// Sorgu engellenince simPinKaldir'in DOGRULAMA adimi bos cevap aliyor ve
// kilit gercekten kalksa bile "kaldirilamadi" deniyordu.
test("atYazanMi: CLCK SORGUSU (mode 2) yazma DEGIL", () => {
  assert.equal(isAtWriteCommand('AT+CLCK="SC",2'), false);
  assert.equal(isAtWriteCommand('AT+CLCK="SC",2 '), false);
});

test("atYazanMi: CLCK kilit acma/kapama (mode 0/1) YAZMA", () => {
  assert.equal(isAtWriteCommand('AT+CLCK="SC",0,"1234"'), true);
  assert.equal(isAtWriteCommand('AT+CLCK="SC",1,"1234"'), true);
});

test("atYazanMi: PIN harcayan ve cihazi degistiren komutlar YAZMA", () => {
  for (const k of ['AT+CPIN="1234"', "AT+CFUN=1", "AT&W", "ATZ", 'AT+CUSD=1,"*101#"']) {
    assert.equal(isAtWriteCommand(k), true, k);
  }
});

test("atYazanMi: salt okunur sorgular serbest", () => {
  for (const k of ["AT", "AT+CNUM", "AT+CPIN?", 'AT+QPINC="SC"', "AT+CPINC", "AT+CCID"]) {
    assert.equal(isAtWriteCommand(k), false, k);
  }
});

// --- Port temizleme ve KARISMIS cevap ---
//
// Canli goruldu (2026-08-28, ~10 okumanin 2'sinde): bir komutun cevabi, o
// komutun okuma penceresi kapandiktan SONRA gelirse portta kaliyor ve BIR
// SONRAKI komut onu okuyor. Belirtisi cift OK. Kayma bir cevap kadar olursa
// dogrulama BIR ONCEKININ cevabini okur — PIN yolunda "kilit kalkti" yalanina
// kadar gidebilir.
// Port bosaltma DENENDI VE KALDIRILDI: olcum fayda gostermedi, maliyeti
// gercekti (komut basina +1.3 sn). Kalan koruma karismayi TESPIT etmek.
test("atKabukKomutu: fazladan bekleme YOK (bosaltma kaldirildi)", () => {
  const k = atShellCommand("/dev/ttyUSB0", "AT+CNUM", 3);
  assert.ok(!k.includes("read -t 1"), "olculmemis faydasi olan bekleme tasinmaz");
  assert.equal(k.split("printf").length - 1, 1, "tek gonderim");
});

test("atKarismisMi: tek sonlandirici temiz, ikisi KARISMIS", () => {
  assert.equal(isAtResponseMixed("\n+CLCK: 0\n\nOK"), false);
  assert.equal(isAtResponseMixed("\n+CLCK: 0\n\nOK\n\nOK"), true, "canli gorulen bicim");
  assert.equal(isAtResponseMixed("\n+CPIN: READY\n\nOK\n\nOK"), true, "canli gorulen bicim");
  assert.equal(isAtResponseMixed("ERROR"), false);
  assert.equal(isAtResponseMixed("OK\nERROR"), true, "iki farkli sonlandirici da karisiktir");
  assert.equal(isAtResponseMixed(""), false);
  assert.equal(isAtResponseMixed(null), false);
});

test("atKarismisMi: OK gecen METIN sonlandirici sayilmaz", () => {
  // "+CNUM: \"OK hat\",..." gibi bir deger yanlislikla sonlandirici olmasin.
  assert.equal(isAtResponseMixed('+CNUM: "OK hat","+905350634747",145\n\nOK'), false);
});
