// console.js saf fonksiyon testleri — cihaz gerektirmez.
// Soket akisi (login/telnet) ayrica, gercek cihazla elle dogrulanir; burada
// ayristirma/koruma mantigini test ediyoruz.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  iacReply, extractOutput, parseNvramShow, runConsole, consoleCredentials,
} from "../src/console.js";

test("iacReply: DO->WONT, WILL->DONT", () => {
  // IAC DO ECHO(1), IAC WILL SGA(3)
  const gelen = Buffer.from([255, 253, 1, 255, 251, 3]);
  const y = iacReply(gelen);
  // WONT ECHO (255 252 1), DONT SGA (255 254 3)
  assert.deepEqual([...y], [255, 252, 1, 255, 254, 3]);
});

test("iacReply: IAC yoksa bos", () => {
  assert.equal(iacReply(Buffer.from("merhaba")).length, 0);
});

test("extractOutput: markerlar arasindan ciktiyi alir, ekoyu atlar", () => {
  // Terminal once komutu eko'lar (ayni satirda), sonra gercek ciktiyi basar.
  const raw =
    "echo __RCN_BASLA__; uname; echo __RCN_BIT__\r\n" + // eko satiri
    "__RCN_BASLA__\r\n" +
    "Linux router 2.6.36\r\n" +
    "__RCN_BIT__\r\n" +
    "riconadmin@router:~# ";
  const c = extractOutput(raw);
  assert.equal(c, "Linux router 2.6.36");
});

test("extractOutput: marker yoksa null", () => {
  assert.equal(extractOutput("hicbir sey"), null);
});

test("parseNvramShow: key=value satirlarini cozer, ilk = ile boler", () => {
  const m = "lan_ipaddr=192.168.1.1\nwl_ssid=Ricon-WiFi\nbos=\nesit=a=b=c\n";
  const d = parseNvramShow(m);
  assert.equal(d.lan_ipaddr, "192.168.1.1");
  assert.equal(d.wl_ssid, "Ricon-WiFi");
  assert.equal(d.bos, "");
  assert.equal(d.esit, "a=b=c"); // ilk = ile bolundu
});

test("parseNvramShow: __proto__ prototipi kirletmez", () => {
  const d = parseNvramShow("__proto__=kotu\nx=1");
  assert.equal(d.x, "1");
  assert.equal(({}).kotu, undefined);
});

test("runConsole: salt-okunurda yazan komut reddedilir (I/O yok)", async () => {
  const r = await runConsole(
    { host: "127.0.0.1", user: "a", password: "b" },
    ["nvram set lan_ipaddr=5.5.5.1", "nvram commit"],
  );
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].code, "WRITE_BLOCKED_READONLY");
});

test("runConsole: reboot/rm/> gibi tehlikeli komutlar da reddedilir", async () => {
  for (const command of ["reboot", "rm -rf /", "echo x > /etc/config", "cat a >> b", "sysupgrade x"]) {
    const r = await runConsole(
      { host: "127.0.0.1", user: "a", password: "b" }, [command],
    );
    assert.equal(r.problems[0].code, "WRITE_BLOCKED_READONLY", `reddedilmeliydi: ${command}`);
  }
});

test("runConsole: masum yonlendirmeler (2>/dev/null, 2>&1) SERBEST", async () => {
  // Bu komutlar yazma-korumasina TAKILMAMALI (I/O baslamadan, kapali port ->
  // baglanti hatasi bekleriz; yani WRITE_BLOCKED olmamali).
  for (const command of ["nvram show 2>/dev/null", "dmesg 2>&1 | tail"]) {
    const r = await runConsole(
      { host: "127.0.0.1", port: 1, user: "a", password: "b", timeoutMs: 800 },
      [command],
    );
    assert.notEqual(r.problems[0]?.code, "WRITE_BLOCKED_READONLY", `serbest olmaliydi: ${command}`);
  }
});

test("parseNvramShow: COK SATIRLI deger kirpilmaz (devam satirlari eklenir)", () => {
  // Gercek dert: bazi nvram degerleri satir sonu tasiyor. Eskiden devam
  // satirlari SESSIZCE atiliyor, deger ilk satirina kirpiliyordu -> diff
  // "degismedi" diyebiliyordu.
  const d = parseNvramShow([
    "lan_ipaddr=5.5.5.1",
    "kural_listesi=birinci satir",
    "ikinci satir devam",
    "ucuncu satir",
    "sonraki_anahtar=deger",
  ].join("\n"));
  assert.equal(d.lan_ipaddr, "5.5.5.1");
  assert.equal(d.kural_listesi, "birinci satir\nikinci satir devam\nucuncu satir");
  assert.equal(d.sonraki_anahtar, "deger");
  assert.equal(Object.keys(d).length, 3, "devam satirlari yeni anahtar URETMEZ");
});

test("parseNvramShow: bosluk iceren sol taraf anahtar sayilmaz", () => {
  // "  bir sey = x" gibi bir satir anahtar DEGIL, devam satiridir.
  const d = parseNvramShow("a=1\n  serbest metin = icinde esittir var\nb=2");
  assert.equal(d.a, "1\n  serbest metin = icinde esittir var");
  assert.equal(d.b, "2");
  assert.equal(Object.keys(d).length, 2);
});

test("parseNvramShow: bastaki devam satiri anahtarsizsa yutulur (patlamaz)", () => {
  const d = parseNvramShow("basibos satir\na=1");
  assert.equal(d.a, "1");
  assert.equal(Object.keys(d).length, 1);
});

// --- Kimlik bicimi (2026-08-28 canli olculdu, 143 sn'lik sessiz basarisizlik) ---
//
// KUSUR: HTTP katmani kimligi IC ICE tasiyor ({kimlik:{kullanici,sifre}}),
// konsol katmani ise DUZ bekliyordu ({kullanici,sifre}). pipeline.js
// readMsisdn'e ic ice sekli veriyordu; telnet login'e "undefined" gidiyor,
// oturum asama 2'de takiliyor, 3 deneme + port dogrulama = 143 saniye ve
// "telefon okunamadi". Yanlis bir sey yapilmiyordu; iki katmanin SOZLESMESI
// farkliydi. Cozum: sinirda tek yerde normalize et.
test("konsolKimligi: duz kullanici/sifre oldugu gibi gelir", () => {
  assert.deepEqual(consoleCredentials({ user: "riconadmin", password: "s3cr3t" }),
    { user: "riconadmin", password: "s3cr3t" });
});

test("konsolKimligi: ic ice {kimlik} bicimini de kabul eder", () => {
  assert.deepEqual(consoleCredentials({ credentials: { user: "riconadmin", password: "s3cr3t" } }),
    { user: "riconadmin", password: "s3cr3t" });
});

test("konsolKimligi: duz bicim ic ice bicimi ezer (acik olan kazanir)", () => {
  assert.deepEqual(consoleCredentials({ user: "acik", password: "a",
    credentials: { user: "gizli", password: "g" } }), { user: "acik", password: "a" });
});

test("konsolKimligi: hicbiri yoksa kullanici null (sifre bos string)", () => {
  assert.deepEqual(consoleCredentials({}), { user: null, password: "" });
});

test("runConsole: kimlik yoksa AGA HIC CIKMAZ, hemen net hata verir", async () => {
  // Erisilemez bir adres veriyoruz: guard calismazsa soket denemesi yapilir
  // ve test saniyelerce surer. Guard calisiyorsa milisaniyede biter.
  const t = Date.now();
  const r = await runConsole({ host: "192.0.2.1" }, ["uname -a"]);
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].code, "CONSOLE_AUTH_REQUIRED");
  assert.ok(Date.now() - t < 500, "kimliksiz cagri aga cikmadan donmeli");
});
