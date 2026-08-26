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
export function probePort(host, kapi, kaynakIp, zamanAsimi = TCP_PROBE_MS) {
  return new Promise((resolve) => {
    const soket = new net.Socket();
    let banner = "";
    let bitti = false;
    const kapat = (acik) => {
      if (bitti) return;
      bitti = true;
      soket.destroy();
      resolve({ kapi, acik, banner: banner.trim() || null });
    };
    soket.setTimeout(zamanAsimi);
    const baglantiSecenek = { host, port: kapi };
    if (kaynakIp) baglantiSecenek.localAddress = kaynakIp;
    soket.connect(baglantiSecenek, () => {
      // Bazi servisler (SSH/telnet) baglaninca banner yollar; kisa bekle.
      soket.setTimeout(600);
    });
    soket.on("data", (d) => {
      banner += d.toString("latin1").slice(0, 200);
      kapat(true);
    });
    soket.on("timeout", () => kapat(banner ? true : soket.connecting ? false : true));
    soket.on("error", () => kapat(false));
  });
}

// Bir hedefte kapi listesini tarar (sinirli es zamanlilik). Doner: [{kapi,acik,banner}]
export async function scanPorts(host, kaynakIp, kapilar = TCP_PORTS, esZaman = 6) {
  const liste = kapilar.map((k) => (typeof k === "number" ? k : k.kapi));
  const sonuc = [];
  for (let i = 0; i < liste.length; i += esZaman) {
    const dilim = liste.slice(i, i + esZaman);
    const parca = await Promise.all(
      dilim.map((kapi) => probePort(host, kapi, kaynakIp)),
    );
    sonuc.push(...parca);
  }
  return sonuc;
}

// Cihaz ayakta mi? Yaygin kapilara TCP connect (ICMP yerine).
export async function isReachable(host, kaynakIp) {
  const oncelikli = [80, 443, 22, 8080, 23];
  const r = await scanPorts(host, kaynakIp, oncelikli, 5);
  return r.some((x) => x.acik);
}
