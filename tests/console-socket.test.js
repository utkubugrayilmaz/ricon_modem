// console.js SOKET SURUCUSU — sahte telnet cihaziyla, gercek modem olmadan.
//
// Bu dosya bir bosluğu kapatiyor: console.test.js yalnizca saf ayristirma
// fonksiyonlarini test ediyordu ve basinda "soket akisi gercek cihazla ELLE
// dogrulanir" yaziyordu. Yani login/marker/retry/zamanlayici yollarinin
// otomatik kapsamasi yoktu.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runConsole, consoleNvram, consoleWrite } from "../src/console.js";
import { startFakeDevice } from "./fake-device.js";

// Timer sizintisi olcumu icin: su an ayakta olan Timeout sayisi.
const timerCount = () =>
  process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;

test("soket: login -> parola -> komut, her komutun ciktisi ayri gelir", async () => {
  const device = await startFakeDevice({
    handle: (command) => (command === "uname -a" ? "Linux router 2.6.36" : "uid=0(root)"),
  });
  try {
    const r = await runConsole(device.opts, ["uname -a", "id"]);
    assert.equal(r.ok, true, `problems: ${JSON.stringify(r.problems)}`);
    assert.equal(r.outs["uname -a"], "Linux router 2.6.36");
    assert.equal(r.outs.id, "uid=0(root)");
    assert.equal(device.connections.length, 1, "tek oturum yetmeliydi");
    assert.equal(device.connections[0].user, "riconadmin");
  } finally { await device.close(); }
});

test("soket: nvram show cozumlenir (consoleNvram ucu uca)", async () => {
  const device = await startFakeDevice({
    handle: () => "lan_ipaddr=192.168.1.1\nwl_ssid=Ricon\nbos=",
  });
  try {
    const r = await consoleNvram(device.opts);
    assert.equal(r.count, 3);
    assert.equal(r.values.lan_ipaddr, "192.168.1.1");
    assert.equal(r.values.bos, "");
  } finally { await device.close(); }
});

test("soket: EKO satiri cikti sanilmaz (marker satir-ortasinda kalir)", async () => {
  // Sahte cihaz once komut satirini oldugu gibi eko'luyor; o satirda
  // START/END marker'lari satir ORTASINDA. Istemcinin `^MARK$` regex'i
  // onlari atlamali, yoksa cikti olarak komutun kendisi okunurdu.
  const device = await startFakeDevice({ handle: () => "GERCEK_CIKTI" });
  try {
    const r = await runConsole(device.opts, ["cat /proc/uptime"]);
    assert.equal(r.outs["cat /proc/uptime"], "GERCEK_CIKTI");
  } finally { await device.close(); }
});

test("soket: BOZUK nvram anahtari cihaza HIC gitmez", async () => {
  // Deger tirnaklaniyordu ama anahtar CIPLAK gidiyordu: icinde `;` olan bir
  // anahtar toplu komut satirini bolerdi. Tek bir kotu anahtar varsa
  // HICBIRI gonderilmez — yarim yazilmis nvram, hic yazilmamistan kotudur.
  const device = await startFakeDevice({ handle: () => "" });
  try {
    const r = await consoleWrite(
      { ...device.opts, writeAllowed: true },
      { "lan_ipaddr; reboot": "5.5.5.1", lan_proto: "static" },
    );
    assert.equal(r.ok, false);
    assert.equal(r.problems[0].code, "ARGS");
    assert.deepEqual(r.written, []);
    assert.equal(device.connections.length, 0, "baglanti bile acilmamali");
  } finally { await device.close(); }
});

test("soket: GECERLI anahtarlar yazilir ve commit dogrulanir", async () => {
  const device = await startFakeDevice({
    handle: (command) => (command.startsWith("nvram commit") ? "NVRAM_COMMIT_OK" : ""),
  });
  try {
    const r = await consoleWrite(
      { ...device.opts, writeAllowed: true },
      { lan_ipaddr: "5.5.5.1", "wl0_net_mode": "disabled" },
    );
    assert.equal(r.ok, true, `problems: ${JSON.stringify(r.problems)}`);
    assert.deepEqual(r.written, ["lan_ipaddr", "wl0_net_mode"]);
    // Deger tirnak icinde gitmeli.
    assert.ok(device.connections[0].commands.includes("nvram set lan_ipaddr='5.5.5.1'"));
  } finally { await device.close(); }
});

test("soket: salt-okunur modda yazan komut CIHAZA HIC GITMEZ", async () => {
  const device = await startFakeDevice({ handle: () => "" });
  try {
    const r = await runConsole(device.opts, ["nvram set x=1"]);
    assert.equal(r.ok, false);
    assert.equal(r.problems[0].code, "WRITE_BLOCKED_READONLY");
    assert.equal(device.connections.length, 0, "reddedilen komut icin baglanti bile acilmamali");
  } finally { await device.close(); }
});

test("soket: hat DUSERSE eksik cikti BASARI SAYILMAZ", async () => {
  // Bu sessiz bir yanlis cevapti: komut satiri gonderildikten sonra hat
  // kopunca "close" yolu resolveResult() cagiriyor ve orasi eskiden
  // KOSULSUZ ok:true donuyordu. Cagiran `outs[komut] === null` ile
  // "basarili" bir sonuc aliyor, consoleNvram bunu "0 anahtar" okuyordu.
  const device = await startFakeDevice({ handle: () => null });
  try {
    const r = await runConsole(
      { ...device.opts, writeAllowed: true, timeoutMs: 3000, attempts: 1 },
      ["reboot"],
    );
    assert.equal(r.ok, false, "eksik cikti ok:true DONMEMELI");
    assert.equal(r.problems[0].code, "REQUEST_FAILED");
    assert.match(r.problems[0].message, /incomplete output: 0\/1/);
  } finally { await device.close(); }
});

test("soket: eksik cikti gorunce YENIDEN DENER (varsayilan 3)", async () => {
  // Eksik cikti artik ok:false oldugu icin retry dongusu de devreye giriyor.
  // Davranis burada SABITLENIYOR ki ileride sessizce degismesin.
  const device = await startFakeDevice({ handle: () => null });
  try {
    const r = await runConsole(
      { ...device.opts, writeAllowed: true, timeoutMs: 3000 },
      ["uname -a"],
    );
    assert.equal(r.ok, false);
    assert.equal(device.connections.length, 3, "varsayilan CONSOLE_RETRIES=3");
  } finally { await device.close(); }
});

test("soket: modem ASILI kalirsa attempts:1 TEK baglanti acar", async () => {
  // handle undefined dondurunce cihaz sessiz kaliyor ve hatti KAPATMIYOR —
  // "close" degil "timeout" yoluna dusuluyor. reboot bu yolda uc kez
  // deneniyordu; provision.js artik attempts:1 veriyor.
  const device = await startFakeDevice({ handle: () => undefined });
  try {
    const r = await runConsole(
      { ...device.opts, writeAllowed: true, timeoutMs: 1200, attempts: 1 },
      ["reboot"],
    );
    assert.equal(r.ok, false);
    assert.equal(device.connections.length, 1,
      `attempts:1 bir baglanti acmaliydi, ${device.connections.length} acildi`);
  } finally { await device.close(); }
});

test("soket: oturum bitince ARKADA ZAMANLAYICI KALMAZ", async () => {
  // Neden onemli: makro setTimeout temizlenmezse Node'un olay dongusu
  // ~20 sn daha acik kalir. CLI process.exit ile kurtuluyor ama npm
  // paketi olarak import eden tuketici ASILI KALIR (README'de belgeli
  // kullanim). Bu testin olctugu tam olarak o.
  const device = await startFakeDevice({ handle: () => "ok" });
  try {
    const taban = timerCount();
    const r = await runConsole({ ...device.opts, timeoutMs: 15000 }, ["uname -a"]);
    assert.equal(r.ok, true);
    assert.equal(timerCount(), taban,
      "runConsole bittikten sonra fazladan Timeout kalmamali");
  } finally { await device.close(); }
});

test("soket: hat DUSERSE de zamanlayici kalmaz", async () => {
  const device = await startFakeDevice({ handle: () => null });
  try {
    const taban = timerCount();
    const r = await runConsole(
      { ...device.opts, writeAllowed: true, timeoutMs: 15000, attempts: 1 },
      ["reboot"],
    );
    assert.equal(r.ok, false);
    assert.equal(timerCount(), taban,
      "dusen baglantidan sonra da Timeout kalmamali");
  } finally { await device.close(); }
});

test("soket: ZAMAN ASIMINDAN sonra da zamanlayici kalmaz", async () => {
  // Dorduncu yol: "timeout". clearTimeout dagitilmis halde YALNIZCA basari
  // ve hata yollarinda vardi; timeout ve close yollarinda zamanlayici
  // ayakta kaliyordu. Simdi temizlik finish()'in icinde, dordu de kapali.
  const device = await startFakeDevice({ handle: () => undefined });
  try {
    const taban = timerCount();
    const r = await runConsole(
      { ...device.opts, timeoutMs: 1200, attempts: 1 },
      ["uname -a"],
    );
    assert.equal(r.ok, false);
    assert.equal(timerCount(), taban,
      "zaman asimindan sonra da Timeout kalmamali");
  } finally { await device.close(); }
});
