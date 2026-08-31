// Cihaz ayakta mi? — TCP connect denemesi (veri gonderilmez).
//
// ICMP kapali oldugu icin (ping timeout) canlilik TCP ile olculur.
//
// Eskiden burada bir PORT TARAYICISI vardi (scanPorts + banner okuma). Onu
// yalnizca `kesif` komutu kullaniyordu; kesif fazi bitince ikisi de dustu.
// Geriye tek soru kaldi: "cihaz orada mi?"

import net from "node:net";
import { TCP_PROBE_MS } from "../domain/constants.js";

// Tek portun acik olup olmadigi. Throw etmez. Baglanti kurulur kurulmaz
// karar verilir — banner BEKLENMEZ. Olculdu (canli): banner beklemesi her
// yoklamaya 600 ms ekliyordu ve "hangi servis oturuyor" sorusu artik
// sorulmuyor.
function portAcikMi(host, kapi, kaynakIp, zamanAsimi = TCP_PROBE_MS) {
  return new Promise((resolve) => {
    const soket = new net.Socket();
    let bitti = false;
    const kapat = (acik) => {
      if (bitti) return;
      bitti = true;
      soket.destroy();
      resolve(acik);
    };
    soket.setTimeout(zamanAsimi);
    const baglantiSecenek = { host, port: kapi };
    if (kaynakIp) baglantiSecenek.localAddress = kaynakIp;
    soket.connect(baglantiSecenek, () => kapat(true));
    // Baglanti kurulmadan zaman asimi = kapali; kurulduysa zaten kapat(true)
    // calismisti ve bu dinleyici etkisiz.
    soket.on("timeout", () => kapat(!soket.connecting));
    soket.on("error", () => kapat(false));
  });
}

// Cihaz ayakta mi? Kullandigimiz iki kapiya TCP connect (ICMP yerine).
//
// ⚠ KAYNAK IP VERMEK SART. Olculdu (2026-08-28, kurumsal ag): kaynak IP
// BAGLANMADAN yapilan connect bu makinede HER adrese aninda "basarili"
// donuyor (guvenlik ajani/proxy yerelde kabul ediyor) — TEST-NET dahil.
// Yani kaynaksiz cagri "her cihaz ayakta" der ve teshis coker.
//   isReachable("192.0.2.1")                 -> true   (YANLIS)
//   isReachable("192.0.2.1", "192.168.1.50") -> false  (dogru, 1.5 sn timeout)
// Kaynak IP baglandiginda cekirdek yol dogru: rota yoksa connect timeout'a
// dusuyor. Bu yuzden cagiranlar kaynagi pcPreflight'tan alir; alamiyorsa
// yoklama YAPMAZ (bkz. provisionModem).
//
// YALNIZCA KULLANDIGIMIZ IKI KAPI yoklanir:
//   80   — modemin web arayuzu. Aracin ANA kanali (kimlik, SIM, ayar, nvram
//          yedegi hepsi buradan): "cihaz ayakta mi" sorusunun en dogru olcusu.
//   5123 — telnet konsolu. 80 bir an doymussa ikinci kanit.
// Eskiden [80, 443, 22, 8080, 23] yoklaniyordu. Kesif OLCTU (bkz.
// docs/BULGULAR.md): 443/22/8080/23 KAPALI — yani `true` donmesinin sebebi
// her zaman 80'di, digerleri her cagride bosa acilan soketti.
//
// PARALEL: iki kapi ayni anda yoklanir. Sirayla denemek CIHAZ YOKKEN maliyeti
// IKIYE katliyor (iki zaman asimi ust uste) — olculdu: modem saha'dayken
// assessDevice once fabrika'yi yokluyor ve bu 3 sn'ye cikiyordu. Paralelde
// iskalama TEK zaman asimi kadar, cevap varsa aninda doner.
export async function isReachable(host, kaynakIp) {
  const sonuc = await Promise.all(
    [80, 5123].map((kapi) => portAcikMi(host, kapi, kaynakIp)),
  );
  return sonuc.some(Boolean);
}
