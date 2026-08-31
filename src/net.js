// Ag katmani — modemle konusmanin TEK yolu.
//
// Uc is bir arada, cunku ucu de ayni soruyu farkli derinlikte soruyor:
//   Client        — HTTP istekleri (sirali kuyruk, tek-baglantili sunucu icin)
//   findSourceIp  — hangi yerel adresten cikmaliyiz
//   isReachable   — cihaz orada mi (TCP connect; ICMP kapali)
//
// --- Client: bu projenin KALBI ---
//
// Modemin web sunucusu TEK BAGLANTILI (Server: WEB-ROUTER, HTTP/1.0,
// Connection: close). Hizli ardisik istek zaman asimina dusuruyor. Bu yuzden
// TUM HTTP burada tek bir sirali kuyrukun arkasindan gecer: istekler
// birbirini beklemez degil, birbiri ARDINA gider; her istek arasinda bekleme,
// basarisizlikta tekrar deneme vardir. Baska hicbir modul dogrudan istek atmaz.
//
// Neden fetch degil node:http: Windows'ta -SkipAsSource ile eklenen ikincil IP
// varsayilan kaynak secilmez; istek yanlis arayuzden cikip modeme ulasamaz.
// node:http request'e localAddress verebiliyoruz, fetch veremiyor. Kaynak IP
// (MODEM_KAYNAK_IP) verilince oradan cikariz.
//
// Guvenlik: salt-okunur modda (varsayilan) yalnizca GET'e izin verilir;
// POST/PUT/DELETE reddedilir. Not: provizyon HTTP formu DEGIL telnet+nvram
// uzerinden yazar (console.js) — bu istemci pratikte hep salt-okunur kalir.

import http from "node:http";
import net from "node:net";
import os from "node:os";
import {
  REQUEST_GAP_MS,
  REQUEST_TIMEOUT_MS,
  REQUEST_RETRIES,
  RETRY_GAP_MS,
  MAX_TIMER_MS,
  TCP_PROBE_MS,
  OUI_VENDORS,
} from "./settings.js";
import { problem } from "./problems.js";

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

// Ayni host'a es zamanli iki okumayi engelleyen surec-ici kilit. Tek-baglantili
// sunucuda hayati — anahtar yalniz host (port degil).
const mesgulHostlar = new Set();

export class Client {
  // opts: { host, kaynakIp, kimlik:{kullanici,sifre}|null, saltOkunur:true,
  //         istekArasiMs, zamanAsimiMs }
  constructor(opts = {}) {
    this.host = opts.host;
    this.port = opts.port || 80;
    this.kaynakIp = opts.kaynakIp || undefined;
    this.kimlik = opts.kimlik || null;
    this.saltOkunur = opts.saltOkunur !== false; // varsayilan true
    this.istekArasiMs = dogrulaMs(opts.istekArasiMs, REQUEST_GAP_MS);
    this.zamanAsimiMs = dogrulaMs(opts.zamanAsimiMs, REQUEST_TIMEOUT_MS);
    this._kuyruk = Promise.resolve(); // sirali zincir
    this._sonIstekBitti = 0;
  }

  // GET — sirali kuyruga eklenir. Doner: { ok, kod, govde, problems, yol }
  get(yol) {
    return this._kuyruğaEkle("GET", yol, null);
  }

  // POST — yalnizca yazma modunda. Salt-okunurda reddedilir.
  post(yol, govde, contentType = "application/x-www-form-urlencoded") {
    if (this.saltOkunur) {
      return Promise.resolve({
        ok: false, kod: null, govde: null, yol,
        problems: [problem("WRITE_BLOCKED_READONLY", yol)],
      });
    }
    return this._kuyruğaEkle("POST", yol, { govde, contentType });
  }

  // Istegi kuyruga ekler; onceki istek bittikten sonra, aralik bekleyerek calisir.
  _kuyruğaEkle(metot, yol, ekstra) {
    const isi = async () => {
      const gecen = Date.now() - this._sonIstekBitti;
      if (this._sonIstekBitti && gecen < this.istekArasiMs) {
        await bekle(this.istekArasiMs - gecen);
      }
      try {
        return await this._denemeliIstek(metot, yol, ekstra);
      } finally {
        this._sonIstekBitti = Date.now();
      }
    };
    // Zinciri ilerlet; bir istegin hatasi zinciri kirmasin.
    const sonuc = this._kuyruk.then(isi, isi);
    this._kuyruk = sonuc.then(() => {}, () => {});
    return sonuc;
  }

  async _denemeliIstek(metot, yol, ekstra) {
    let sonHata = null;
    for (let deneme = 0; deneme < REQUEST_RETRIES; deneme += 1) {
      const r = await this._istek(metot, yol, ekstra);
      if (r.aktarimHatasi) {
        sonHata = r.aktarimHatasi;
        if (deneme < REQUEST_RETRIES - 1) await bekle(RETRY_GAP_MS);
        continue;
      }
      return this._sonuca(yol, r);
    }
    return {
      ok: false, kod: null, govde: null, yol,
      problems: [problem("REQUEST_FAILED", yol, sonHata)],
    };
  }

  // Tek HTTP istegi (node:http, Connection: close, localAddress, Basic auth).
  // Throw etmez — { kod, govde, aktarimHatasi } doner.
  _istek(metot, yol, ekstra) {
    return new Promise((resolve) => {
      const basliklar = { Connection: "close" };
      if (this.kimlik) {
        const t = Buffer.from(
          `${this.kimlik.kullanici}:${this.kimlik.sifre}`,
        ).toString("base64");
        basliklar.Authorization = `Basic ${t}`;
      }
      let govdeBuf = null;
      if (ekstra && ekstra.govde != null) {
        govdeBuf = Buffer.from(ekstra.govde);
        basliklar["Content-Type"] = ekstra.contentType;
        basliklar["Content-Length"] = govdeBuf.length;
      }

      const istek = http.request(
        {
          host: this.host,
          port: this.port,
          path: yol,
          method: metot,
          headers: basliklar,
          localAddress: this.kaynakIp,
          timeout: this.zamanAsimiMs,
        },
        (yanit) => {
          const parcalar = [];
          yanit.on("data", (p) => parcalar.push(p));
          yanit.on("end", () =>
            resolve({ kod: yanit.statusCode, govde: Buffer.concat(parcalar) }),
          );
          // Gomulu sunucular chunked cevabi duzgun kapatmaz; kopmada eldeki
          // kismi govdeyi kullan (yarim-govde toleransi).
          yanit.on("aborted", () =>
            resolve({ kod: yanit.statusCode, govde: Buffer.concat(parcalar) }),
          );
        },
      );
      istek.on("timeout", () => istek.destroy(new Error("timeout")));
      istek.on("error", (e) => resolve({ aktarimHatasi: `${e.code || e.name}: ${e.message}` }));
      if (govdeBuf) istek.write(govdeBuf);
      istek.end();
    });
  }

  // Ham istek sonucunu proje sonuc nesnesine cevirir + auth/durum sorunlari.
  _sonuca(yol, r) {
    const govde = r.govde ? r.govde.toString("latin1") : "";
    const problems = [];
    if (r.kod === 401) {
      problems.push(problem(this.kimlik ? "AUTH_REJECTED" : "AUTH_REQUIRED", yol));
    } else if (r.kod >= 400) {
      problems.push(problem("HTTP_ERROR", yol, r.kod));
    } else if (r.kod >= 200 && r.kod < 300 && govde.length === 0) {
      problems.push(problem("EMPTY_BODY", yol));
    }
    return {
      ok: problems.every((p) => p.severity !== "error"),
      kod: r.kod,
      govde,
      govdeBuf: r.govde,
      yol,
      problems,
    };
  }
}

// Host bazli kilit yardimcilari (index/oku kullanir).
export function isHostBusy(host) {
  return mesgulHostlar.has(host);
}
export function lockHost(host) {
  mesgulHostlar.add(host);
}
export function unlockHost(host) {
  mesgulHostlar.delete(host);
}

function dogrulaMs(deger, varsayilan) {
  if (deger == null) return varsayilan;
  if (!Number.isFinite(deger) || deger <= 0 || deger > MAX_TIMER_MS) {
    return varsayilan;
  }
  return deger;
}

// ======================================================================
// Yerel arayuz / kaynak IP / MAC uretici
// ======================================================================

export function findSourceIp(onek) {
  for (const [ad, adresler] of Object.entries(os.networkInterfaces())) {
    for (const a of adresler || []) {
      if (a.family === "IPv4" && !a.internal && a.address.startsWith(onek)) {
        return a.address;
      }
    }
  }
  return null;
}

// Tum yerel IPv4 arayuzleri (teshis icin). Doner: [{arayuz, ip, mask}]
export function localInterfaces() {
  const cikti = [];
  for (const [ad, adresler] of Object.entries(os.networkInterfaces())) {
    for (const a of adresler || []) {
      if (a.family === "IPv4" && !a.internal) {
        cikti.push({ arayuz: ad, ip: a.address, mask: a.netmask });
      }
    }
  }
  return cikti;
}

// MAC onekinden (OUI) uretici tahmini.
export function guessVendor(mac) {
  if (!mac) return null;
  const onek = mac.toLowerCase().replace(/-/g, ":").split(":").slice(0, 3).join(":");
  return OUI_VENDORS[onek] ?? null;
}

// ======================================================================
// Cihaz ayakta mi? — TCP connect yoklamasi
// ======================================================================


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
