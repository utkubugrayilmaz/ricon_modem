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
// bannerSn: baglandiktan sonra banner icin beklenecek ms. 0 verilirse
// baglanti kurulur kurulmaz "acik" denir ve soket kapanir — CANLILIK sorusu
// icin dogrusu bu. Olculdu (canli): banner beklemesi her yoklamaya 600 ms
// ekliyordu ve arayuz bunu 3 saniyede bir cagiriyor. Banner yalnizca `kesif`
// icin degerli (hangi servis oturuyor), orada varsayilan korunuyor.
export function probePort(host, kapi, kaynakIp, zamanAsimi = TCP_PROBE_MS, bannerMs = 600) {
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
      if (bannerMs <= 0) { kapat(true); return; }
      // Bazi servisler (SSH/telnet) baglaninca banner yollar; kisa bekle.
      soket.setTimeout(bannerMs);
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
//
// ⚠ KAYNAK IP VERMEK SART. Olculdu (2026-08-28, kurumsal ag): kaynak IP
// BAGLANMADAN yapilan connect bu makinede HER adrese aninda "basarili"
// donuyor (guvenlik ajani/proxy yerelde kabul ediyor) — TEST-NET dahil.
// Yani kaynaksiz cagri "her cihaz ayakta" der ve teshis coker.
//   isReachable("192.0.2.1")                -> true   (YANLIS)
//   isReachable("192.0.2.1", "192.168.1.50") -> false  (dogru, 1.5 sn timeout)
// Kaynak IP baglandiginda cekirdek yol dogru: rota yoksa connect timeout'a
// dusuyor. Bu yuzden cagiranlar kaynagi pcPreflight'tan alir; alamiyorsa
// yoklama YAPMAZ (bkz. provisionModem).
// YALNIZCA KULLANDIGIMIZ IKI PORT yoklanir, SIRAYLA, ilki cevap verirse ikinci
// hic denenmez:
//   80   — modemin web arayuzu. Aracin ANA kanali (kimlik, SIM, ayar, nvram
//          yedegi hepsi buradan): "cihaz ayakta mi" sorusunun en dogru olcusu.
//   5123 — telnet konsolu. 80 bir an doymussa ikinci kanit.
//
// Eskiden [80, 443, 22, 8080, 23] yoklaniyordu. Kesif OLCTU (bkz.
// docs/BULGULAR.md): 443/22/8080/23 KAPALI — yani `true` donmesinin sebebi
// her zaman 80'di, digerleri her cagride bosa acilan soketti. Arayuz bunu
// 3 saniyede bir cagiriyor.
// PARALEL: iki port ayni anda yoklanir. Sirayla denemek CIHAZ YOKKEN maliyeti
// IKIYE katliyor (iki zaman asimi ust uste) — olculdu: modem saha'dayken
// assessDevice once fabrika'yi yokluyor ve bu 3 sn'ye cikiyordu. Paralelde
// iskalama TEK zaman asimi kadar, cevap varsa aninda doner.
export async function isReachable(host, kaynakIp) {
  // banner beklemesi YOK: soru "ayakta mi", "hangi servis" degil.
  const sonuc = await Promise.all(
    [80, 5123].map((kapi) => probePort(host, kapi, kaynakIp, TCP_PROBE_MS, 0)),
  );
  return sonuc.some((x) => x.acik);
}
