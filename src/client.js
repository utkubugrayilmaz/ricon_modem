// HTTP istemcisi — bu projenin KALBI.
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
import {
  REQUEST_GAP_MS,
  REQUEST_TIMEOUT_MS,
  REQUEST_RETRIES,
  RETRY_GAP_MS,
  MAX_TIMER_MS,
} from "./constants.js";
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
