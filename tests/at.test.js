// AT katmani — SAF ayristiricilar. Cihaz/ag GEREKTIRMEZ.
// Ornek cevaplar kardes calisma RVM-Modem'de canli cihazdan alinmis bicimlerle
// ayni (Ricon S9922M44 + Quectel Q200AF + Turkcell).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCnum, parseCpin, parsePinCounter, parseClck, parseCcid,
  atTamam, atKabukKomutu, atCevabiAyikla,
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
  assert.equal(atTamam("+CNUM: ...\nOK"), true);
  assert.equal(atTamam("OK\n+CME ERROR: 10"), false, "ERROR varsa basarisiz");
  assert.equal(atTamam("ERROR"), false);
  assert.equal(atTamam(""), false);
});

test("atKabukKomutu: portu ACIK TUTAN bicim (DTR dusmesin)", () => {
  const k = atKabukKomutu("/dev/ttyUSB0", "AT+CNUM", 3);
  assert.match(k, /exec 3<>\/dev\/ttyUSB0/, "port tek fd ile acik tutulur");
  // String.raw: kacis karisikligi olmasin. Kabuga giden metin TAM olarak bu.
  assert.ok(k.includes(String.raw`printf 'AT+CNUM\r' >&3`),
    "komut sonu CR (\\r) SART — \\n yetmiyor");
  assert.match(k, /read -t 3 l <&3/, "okuma ayni fd'den");
  assert.match(k, /exec 3<&-/, "fd kapatilir");
});

test("atCevabiAyikla: kabuk gurultusunu atar, yalniz ATL: satirlarini alir", () => {
  const ham = [
    "exec 3<>/dev/ttyUSB0; printf ...",   // kabuk yankisi
    "ATL:",
    "ATL:+CNUM: \"\",\"+905350634756\",145",
    "ATL:",
    "ATL:OK",
    "root@Router:/#",                      // prompt
  ].join("\n");
  const c = atCevabiAyikla(ham);
  assert.equal(parseCnum(c), "5350634756");
  assert.ok(!c.includes("exec 3<>"), "kabuk yankisi ciktiya karismaz");
  assert.ok(!c.includes("root@"), "prompt ciktiya karismaz");
});

test("atCevabiAyikla: bos girdi patlamaz", () => {
  assert.equal(atCevabiAyikla(null), "");
  assert.equal(atCevabiAyikla(""), "");
});
