// AT katmani — SAF ayristiricilar. Cihaz/ag GEREKTIRMEZ.
// Ornek cevaplar kardes calisma RVM-Modem'de canli cihazdan alinmis bicimlerle
// ayni (Ricon S9922M44 + Quectel Q200AF + Turkcell).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCnum, parseCpin, parsePinCounter, parseClck, parseCcid,
  isAtOk, atShellCommand, extractAtAnswer, isAtWrite, isAtGarbled,
} from "../src/at.js";

test("parseCnum: SIM'e yazili numarayi BIZIM kanonik bicime cevirir", () => {
  // Cihazdan gelen gercek bicim
  assert.equal(parseCnum('+CNUM: "","+905321234567",145\nOK'), "5321234567");
  // Alpha alani dolu olabilir
  assert.equal(parseCnum('+CNUM: "Hat","+905321234567",145'), "5321234567");
  // 0 ile baslayan yerel bicim
  assert.equal(parseCnum('+CNUM: "","05321234567",129'), "5321234567");
});

test("parseCnum: bos/gecersiz -> null (uydurmaz)", () => {
  assert.equal(parseCnum("OK"), null, "CNUM satiri yoksa null");
  assert.equal(parseCnum('+CNUM: "","",145'), null, "bos numara null");
  assert.equal(parseCnum('+CNUM: "","+4915112345678",145'), null,
    "TR mobil olmayan numara kabul EDILMEZ");
  assert.equal(parseCnum(null), null);
});

test("parseCnum: birden fazla satirdan ILK GECERLI olani alir", () => {
  const c = '+CNUM: "","",145\n+CNUM: "","+905321234567",145\nOK';
  assert.equal(parseCnum(c), "5321234567");
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
  assert.equal(parseCcid("+CCID: 8990011626160000001F\nOK"), "8990011626160000001");
  assert.equal(parseCcid("+ICCID: 8990011626160000001\nOK"), "8990011626160000001");
  assert.equal(parseCcid("8990011626160000001F"), "8990011626160000001");
  assert.equal(parseCcid("OK"), null);
});

test("atTamam: OK varsa ve ERROR yoksa basarili", () => {
  assert.equal(isAtOk("+CNUM: ...\nOK"), true);
  assert.equal(isAtOk("OK\n+CME ERROR: 10"), false, "ERROR varsa basarisiz");
  assert.equal(isAtOk("ERROR"), false);
  assert.equal(isAtOk(""), false);
});

test("atKabukKomutu: portu ACIK TUTAN bicim (DTR dusmesin)", () => {
  const k = atShellCommand("/dev/ttyUSB0", "AT+CNUM", 3);
  assert.match(k, /exec 3<>\/dev\/ttyUSB0/, "port tek fd ile acik tutulur");
  // String.raw: kacis karisikligi olmasin. Kabuga giden metin TAM olarak bu.
  // Komut printf'in BICIM dizesi degil ARGUMANI: bicim sabit '%s\r'.
  assert.ok(k.includes(String.raw`printf '%s\r' 'AT+CNUM' >&3`),
    "komut sonu CR (\\r) SART — \\n yetmiyor");
  assert.match(k, /read -t 3 l <&3/, "okuma ayni fd'den");
  assert.match(k, /exec 3<&-/, "fd kapatilir");
});

// Komut printf'e BICIM DIZESI olarak verilirse iki sekilde bozulur; ikisi de
// gercek AT komutlarinda olabilecek karakterler.
test("atKabukKomutu: % iceren komut BICIM BELIRTECI sanilmaz", () => {
  // `printf 'AT+QCFG="%band"\r'` -> printf %b'yi donusum belirteci sayar ve
  // komut cihaza BOZUK gider. Sessiz: AT hata dondurur, sebebi gorunmez.
  const k = atShellCommand("/dev/ttyUSB0", 'AT+QCFG="%band"', 3);
  assert.ok(k.includes(String.raw`printf '%s\r' 'AT+QCFG="%band"'`),
    "% komutun ICINDE kalmali, bicim dizesinde degil");
});

test("atKabukKomutu: tek tirnak iceren komut tirnagi KAPATMAZ", () => {
  // Eskiden `printf 'AT+X='tirnak''` olurdu: tirnak kapanir, satirin geri
  // kalani kabuga bambaska bir anlamda giderdi.
  const k = atShellCommand("/dev/ttyUSB0", "AT+X='q'", 3);
  assert.ok(k.includes(String.raw`'AT+X='\''q'\'''`), `kacirilmamis tirnak: ${k}`);
  // Kabuk acisindan tirnak sayisi DENGELI olmali.
  assert.equal((k.match(/'/g) || []).length % 2, 0, "tek tirnaklar dengeli degil");
});

test("atCevabiAyikla: kabuk gurultusunu atar, yalniz ATL: satirlarini alir", () => {
  const raw = [
    "exec 3<>/dev/ttyUSB0; printf ...",   // kabuk yankisi
    "ATL:",
    "ATL:+CNUM: \"\",\"+905321234567\",145",
    "ATL:",
    "ATL:OK",
    "root@Router:/#",                      // prompt
  ].join("\n");
  const c = extractAtAnswer(raw);
  assert.equal(parseCnum(c), "5321234567");
  assert.ok(!c.includes("exec 3<>"), "kabuk yankisi ciktiya karismaz");
  assert.ok(!c.includes("root@"), "prompt ciktiya karismaz");
});

test("atCevabiAyikla: bos girdi patlamaz", () => {
  assert.equal(extractAtAnswer(null), "");
  assert.equal(extractAtAnswer(""), "");
});

// --- Yazma filtresi: SORGU ile YAZMA ayrimi ---
//
// KUSUR (2026-08-28, canli denemeden ONCE yakalandi): filtre `^AT+CLCK=`
// diye bakiyordu, ama CLCK'in SORGU formu da `=` iceriyor:
//   AT+CLCK="SC",2          -> mode 2 = SORGU. PIN harcamaz, bir sey degistirmez.
//   AT+CLCK="SC",0,"1234"   -> mode 0 = kilidi KAPAT. Parola ister, hak yakar.
// Sorgu engellenince disableSimPin'in DOGRULAMA adimi bos cevap aliyor ve
// kilit gercekten kalksa bile "kaldirilamadi" deniyordu.
test("atYazanMi: CLCK SORGUSU (mode 2) yazma DEGIL", () => {
  assert.equal(isAtWrite('AT+CLCK="SC",2'), false);
  assert.equal(isAtWrite('AT+CLCK="SC",2 '), false);
});

test("atYazanMi: CLCK kilit acma/kapama (mode 0/1) YAZMA", () => {
  assert.equal(isAtWrite('AT+CLCK="SC",0,"1234"'), true);
  assert.equal(isAtWrite('AT+CLCK="SC",1,"1234"'), true);
});

test("atYazanMi: PIN harcayan ve cihazi degistiren komutlar YAZMA", () => {
  for (const k of ['AT+CPIN="1234"', "AT+CFUN=1", "AT&W", "ATZ", 'AT+CUSD=1,"*101#"']) {
    assert.equal(isAtWrite(k), true, k);
  }
});

test("atYazanMi: salt okunur sorgular serbest", () => {
  for (const k of ["AT", "AT+CNUM", "AT+CPIN?", 'AT+QPINC="SC"', "AT+CPINC", "AT+CCID"]) {
    assert.equal(isAtWrite(k), false, k);
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
  assert.equal(isAtGarbled("\n+CLCK: 0\n\nOK"), false);
  assert.equal(isAtGarbled("\n+CLCK: 0\n\nOK\n\nOK"), true, "canli gorulen bicim");
  assert.equal(isAtGarbled("\n+CPIN: READY\n\nOK\n\nOK"), true, "canli gorulen bicim");
  assert.equal(isAtGarbled("ERROR"), false);
  assert.equal(isAtGarbled("OK\nERROR"), true, "iki farkli sonlandirici da karisiktir");
  assert.equal(isAtGarbled(""), false);
  assert.equal(isAtGarbled(null), false);
});

test("atKarismisMi: OK gecen METIN sonlandirici sayilmaz", () => {
  // "+CNUM: \"OK hat\",..." gibi bir deger yanlislikla terminator olmasin.
  assert.equal(isAtGarbled('+CNUM: "OK hat","+905321234567",145\n\nOK'), false);
});
