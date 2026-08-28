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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Ayni host'a es zamanli iki okumayi engelleyen surec-ici kilit. Tek-baglantili
// sunucuda hayati — anahtar yalniz host (port degil).
const busyHosts = new Set();

export class Client {
  // opts: { host, kaynakIp, kimlik:{kullanici,sifre}|null, saltOkunur:true,
  //         istekArasiMs, zamanAsimiMs }
  constructor(options = {}) {
    this.host = options.host;
    this.port = options.port || 80;
    this.sourceIp = options.sourceIp || undefined;
    this.credentials = options.credentials || null;
    this.saltOkunur = options.saltOkunur !== false; // varsayilan true
    this.istekArasiMs = verifyMs(options.istekArasiMs, REQUEST_GAP_MS);
    this.timeoutMs = verifyMs(options.timeoutMs, REQUEST_TIMEOUT_MS);
    this._kuyruk = Promise.resolve(); // sirali zincir
    this._lastRequestDone = 0;
  }

  // GET — sirali kuyruga eklenir. Doner: { ok, kod, govde, problems, yol }
  get(path) {
    return this._kuyruğaEkle("GET", path, null);
  }

  // POST — yalnizca yazma modunda. Salt-okunurda reddedilir.
  post(path, body, contentType = "application/x-www-form-urlencoded") {
    if (this.saltOkunur) {
      return Promise.resolve({
        ok: false, code: null, body: null, path,
        problems: [problem("WRITE_BLOCKED_READONLY", path)],
      });
    }
    return this._kuyruğaEkle("POST", path, { body, contentType });
  }

  // Istegi kuyruga ekler; onceki istek bittikten sonra, aralik bekleyerek calisir.
  _kuyruğaEkle(metot, path, ekstra) {
    const isi = async () => {
      const elapsed = Date.now() - this._lastRequestDone;
      if (this._lastRequestDone && elapsed < this.istekArasiMs) {
        await wait(this.istekArasiMs - elapsed);
      }
      try {
        return await this._requestWithRetry(metot, path, ekstra);
      } finally {
        this._lastRequestDone = Date.now();
      }
    };
    // Zinciri ilerlet; bir istegin hatasi zinciri kirmasin.
    const result = this._kuyruk.then(isi, isi);
    this._kuyruk = result.then(() => {}, () => {});
    return result;
  }

  async _requestWithRetry(metot, path, ekstra) {
    let lastError = null;
    for (let attempt = 0; attempt < REQUEST_RETRIES; attempt += 1) {
      const r = await this._istek(metot, path, ekstra);
      if (r.transportError) {
        lastError = r.transportError;
        if (attempt < REQUEST_RETRIES - 1) await wait(RETRY_GAP_MS);
        continue;
      }
      return this._settle(path, r);
    }
    return {
      ok: false, code: null, body: null, path,
      problems: [problem("REQUEST_FAILED", path, lastError)],
    };
  }

  // Tek HTTP istegi (node:http, Connection: close, localAddress, Basic auth).
  // Throw etmez — { kod, govde, aktarimHatasi } doner.
  _istek(metot, path, ekstra) {
    return new Promise((resolve) => {
      const basliklar = { Connection: "close" };
      if (this.credentials) {
        const t = Buffer.from(
          `${this.credentials.username}:${this.credentials.password}`,
        ).toString("base64");
        basliklar.Authorization = `Basic ${t}`;
      }
      let govdeBuf = null;
      if (ekstra && ekstra.body != null) {
        govdeBuf = Buffer.from(ekstra.body);
        basliklar["Content-Type"] = ekstra.contentType;
        basliklar["Content-Length"] = govdeBuf.length;
      }

      const request = http.request(
        {
          host: this.host,
          port: this.port,
          path: path,
          method: metot,
          headers: basliklar,
          localAddress: this.sourceIp,
          timeout: this.timeoutMs,
        },
        (response) => {
          const parcalar = [];
          response.on("data", (p) => parcalar.push(p));
          response.on("end", () =>
            resolve({ code: response.statusCode, body: Buffer.concat(parcalar) }),
          );
          // Gomulu sunucular chunked cevabi duzgun kapatmaz; kopmada eldeki
          // kismi govdeyi kullan (yarim-govde toleransi).
          response.on("aborted", () =>
            resolve({ code: response.statusCode, body: Buffer.concat(parcalar) }),
          );
        },
      );
      request.on("timeout", () => request.destroy(new Error("timeout")));
      request.on("error", (e) => resolve({ transportError: `${e.code || e.name}: ${e.message}` }));
      if (govdeBuf) request.write(govdeBuf);
      request.end();
    });
  }

  // Ham istek sonucunu proje sonuc nesnesine cevirir + auth/durum sorunlari.
  _settle(path, r) {
    const body = r.body ? r.body.toString("latin1") : "";
    const problems = [];
    if (r.code === 401) {
      problems.push(problem(this.credentials ? "AUTH_REJECTED" : "AUTH_REQUIRED", path));
    } else if (r.code >= 400) {
      problems.push(problem("HTTP_ERROR", path, r.code));
    } else if (r.code >= 200 && r.code < 300 && body.length === 0) {
      problems.push(problem("EMPTY_BODY", path));
    }
    return {
      ok: problems.every((p) => p.severity !== "error"),
      code: r.code,
      body,
      govdeBuf: r.body,
      path,
      problems,
    };
  }
}

// Host bazli kilit yardimcilari (index/oku kullanir).
export function isHostBusy(host) {
  return busyHosts.has(host);
}
export function lockHost(host) {
  busyHosts.add(host);
}
export function unlockHost(host) {
  busyHosts.delete(host);
}

function verifyMs(value, fallback) {
  if (value == null) return fallback;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMER_MS) {
    return fallback;
  }
  return value;
}
