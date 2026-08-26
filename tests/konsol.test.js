// konsol.js saf fonksiyon testleri — cihaz gerektirmez.
// Soket akisi (login/telnet) ayrica, gercek cihazla elle dogrulanir; burada
// ayristirma/koruma mantigini test ediyoruz.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  iacYanit, komutCiktisiAyikla, nvramShowCoz, konsolCalistir,
} from "../src/konsol.js";

test("iacYanit: DO->WONT, WILL->DONT", () => {
  // IAC DO ECHO(1), IAC WILL SGA(3)
  const gelen = Buffer.from([255, 253, 1, 255, 251, 3]);
  const y = iacYanit(gelen);
  // WONT ECHO (255 252 1), DONT SGA (255 254 3)
  assert.deepEqual([...y], [255, 252, 1, 255, 254, 3]);
});

test("iacYanit: IAC yoksa bos", () => {
  assert.equal(iacYanit(Buffer.from("merhaba")).length, 0);
});

test("komutCiktisiAyikla: markerlar arasindan ciktiyi alir, ekoyu atlar", () => {
  // Terminal once komutu eko'lar (ayni satirda), sonra gercek ciktiyi basar.
  const ham =
    "echo __RCN_BASLA__; uname; echo __RCN_BIT__\r\n" + // eko satiri
    "__RCN_BASLA__\r\n" +
    "Linux router 2.6.36\r\n" +
    "__RCN_BIT__\r\n" +
    "riconadmin@router:~# ";
  const c = komutCiktisiAyikla(ham);
  assert.equal(c, "Linux router 2.6.36");
});

test("komutCiktisiAyikla: marker yoksa null", () => {
  assert.equal(komutCiktisiAyikla("hicbir sey"), null);
});

test("nvramShowCoz: key=value satirlarini cozer, ilk = ile boler", () => {
  const m = "lan_ipaddr=192.168.1.1\nwl_ssid=Ricon-WiFi\nbos=\nesit=a=b=c\n";
  const d = nvramShowCoz(m);
  assert.equal(d.lan_ipaddr, "192.168.1.1");
  assert.equal(d.wl_ssid, "Ricon-WiFi");
  assert.equal(d.bos, "");
  assert.equal(d.esit, "a=b=c"); // ilk = ile bolundu
});

test("nvramShowCoz: __proto__ prototipi kirletmez", () => {
  const d = nvramShowCoz("__proto__=kotu\nx=1");
  assert.equal(d.x, "1");
  assert.equal(({}).kotu, undefined);
});

test("konsolCalistir: salt-okunurda yazan komut reddedilir (I/O yok)", async () => {
  const r = await konsolCalistir(
    { host: "127.0.0.1", kullanici: "a", sifre: "b" },
    ["nvram set lan_ipaddr=5.5.5.1", "nvram commit"],
  );
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].kod, "WRITE_BLOCKED_READONLY");
});

test("konsolCalistir: reboot/rm/> gibi tehlikeli komutlar da reddedilir", async () => {
  for (const komut of ["reboot", "rm -rf /", "echo x > /etc/config", "cat a >> b", "sysupgrade x"]) {
    const r = await konsolCalistir(
      { host: "127.0.0.1", kullanici: "a", sifre: "b" }, [komut],
    );
    assert.equal(r.problems[0].kod, "WRITE_BLOCKED_READONLY", `reddedilmeliydi: ${komut}`);
  }
});

test("konsolCalistir: masum yonlendirmeler (2>/dev/null, 2>&1) SERBEST", async () => {
  // Bu komutlar yazma-korumasina TAKILMAMALI (I/O baslamadan, kapali port ->
  // baglanti hatasi bekleriz; yani WRITE_BLOCKED olmamali).
  for (const komut of ["nvram show 2>/dev/null", "dmesg 2>&1 | tail"]) {
    const r = await konsolCalistir(
      { host: "127.0.0.1", port: 1, kullanici: "a", sifre: "b", zamanAsimiMs: 800 },
      [komut],
    );
    assert.notEqual(r.problems[0]?.kod, "WRITE_BLOCKED_READONLY", `serbest olmaliydi: ${komut}`);
  }
});
