// TCP port tarayicisi — connect denemesi (veri gonderilmez).
//
// Modemin web sunucusu tek-baglantili olsa da PORT TARAMASI farkli portlara
// oldugu icin paralel yapilabilir (her port ayri hedef). Iş basina dogru arac:
// modem HTTP'si sirali (client.js), tarama paralel (burada). Paralellik yine
// de sinirli tutulur ki cihazi bogmayalim.
//
// ICMP kapali oldugu icin (ping timeout) canlilik TCP ile olculur.

import net from "node:net";
import { TCP_PORTS, TCP_PROBE_MS } from "./constants.js";

// Tek portun acik olup olmadigina bakar; acilsa banner'i (ilk baytlar) alir.
// Throw etmez. Doner: { kapi, acik, banner|null }
export function probePort(host, port, sourceIp, timeout = TCP_PROBE_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let banner = "";
    let done = false;
    const close = (isOpen) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ port, isOpen, banner: banner.trim() || null });
    };
    socket.setTimeout(timeout);
    const connectOptions = { host, port: port };
    if (sourceIp) connectOptions.localAddress = sourceIp;
    socket.connect(connectOptions, () => {
      // Bazi servisler (SSH/telnet) baglaninca banner yollar; kisa bekle.
      socket.setTimeout(600);
    });
    socket.on("data", (d) => {
      banner += d.toString("latin1").slice(0, 200);
      close(true);
    });
    socket.on("timeout", () => close(banner ? true : socket.connecting ? false : true));
    socket.on("error", () => close(false));
  });
}

// Bir hedefte kapi listesini tarar (sinirli es zamanlilik). Doner: [{kapi,acik,banner}]
export async function scanPorts(host, sourceIp, ports = TCP_PORTS, concurrency = 6) {
  const list = ports.map((k) => (typeof k === "number" ? k : k.port));
  const result = [];
  for (let i = 0; i < list.length; i += concurrency) {
    const slice = list.slice(i, i + concurrency);
    const parca = await Promise.all(
      slice.map((port) => probePort(host, port, sourceIp)),
    );
    result.push(...parca);
  }
  return result;
}

// Cihaz ayakta mi? Yaygin kapilara TCP connect (ICMP yerine).
//
// ⚠ KAYNAK IP VERMEK SART. Olculdu (2026-08-28, kurumsal ag): kaynak IP
// BAGLANMADAN yapilan connect bu makinede HER adrese aninda "success"
// donuyor (guvenlik ajani/proxy yerelde kabul ediyor) — TEST-NET dahil.
// Yani kaynaksiz cagri "her cihaz ayakta" der ve teshis coker.
//   isReachable("192.0.2.1")                -> true   (YANLIS)
//   isReachable("192.0.2.1", "192.168.1.50") -> false  (dogru, 1.5 sn timeout)
// Kaynak IP baglandiginda cekirdek yol dogru: rota yoksa connect timeout'a
// dusuyor. Bu yuzden cagiranlar kaynagi pcPreflight'tan alir; alamiyorsa
// yoklama YAPMAZ (bkz. provisionModem).
export async function isReachable(host, sourceIp) {
  const priority = [80, 443, 22, 8080, 23];
  const r = await scanPorts(host, sourceIp, priority, 5);
  return r.some((x) => x.isOpen);
}
