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
// (MODEM_SOURCE_IP) verilince oradan cikariz.
//
// Guvenlik: bu istemci YALNIZCA GET yapar; post() kosulsuz reddeder ve baska
// bir metot yolu yoktur. Provizyon HTTP formu DEGIL telnet+nvram uzerinden
// yazar (console.js), yani istemcinin yazma yetenegine hic ihtiyaci yok.

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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Ayni host'a es zamanli iki okumayi engelleyen surec-ici kilit. Tek-baglantili
// sunucuda hayati — anahtar yalniz host (port degil).
const busyHosts = new Set();

export class Client {
  // opts: { host, sourceIp, credentials:{user,password}|null,
  //         requestGapMs, timeoutMs }
  constructor(opts = {}) {
    this.host = opts.host;
    this.port = opts.port || 80;
    this.sourceIp = opts.sourceIp || undefined;
    this.credentials = opts.credentials || null;
    this.requestGapMs = validMs(opts.requestGapMs, REQUEST_GAP_MS);
    this.timeoutMs = validMs(opts.timeoutMs, REQUEST_TIMEOUT_MS);
    this._queue = Promise.resolve(); // sirali zincir
    this._lastRequestEndedAt = 0;
  }

  // GET — sirali kuyruga eklenir. Doner: { ok, kod, govde, problems, yol }
  get(path) {
    return this._enqueue(path);
  }

  // POST — HER ZAMAN reddedilir. Bu bir mod degil, YAPISAL bir garanti.
  //
  // Eskiden `readOnly` bayragina bagliydi ve false olsaydi gercek bir POST
  // atacakti — ama `readOnly:false` HICBIR cagirici tarafindan verilmiyordu.
  // Yani POST boru hatti (gövde, Content-Type, Content-Length, httpMethod
  // parametresi) bastan sona ULASILAMAZ koddu: tek bir olu giris dort katman
  // olu konfigurasyon tasiyordu.
  //
  // Kosulu kaldirmak garantiyi guclendiriyor: bu istemci modeme POST EDEMEZ.
  // Yazma zaten HTTP formuyla degil telnet + nvram ile yapiliyor
  // (bkz. console.js) — CLAUDE.md'deki "bilinen tuzaklar" maddesi.
  post(path) {
    return Promise.resolve({
      ok: false, code: null, body: null, path,
      problems: [problem("WRITE_BLOCKED_READONLY", path)],
    });
  }

  // Istegi kuyruga ekler; onceki istek bittikten sonra, aralik bekleyerek calisir.
  // Yalnizca GET: yukaridaki POST kapisi hicbir zaman buraya inmiyor.
  _enqueue(path) {
    const job = async () => {
      const elapsed = Date.now() - this._lastRequestEndedAt;
      if (this._lastRequestEndedAt && elapsed < this.requestGapMs) {
        await wait(this.requestGapMs - elapsed);
      }
      try {
        return await this._requestWithRetry(path);
      } finally {
        this._lastRequestEndedAt = Date.now();
      }
    };
    // Zinciri ilerlet; bir istegin hatasi zinciri kirmasin.
    const result = this._queue.then(job, job);
    this._queue = result.then(() => {}, () => {});
    return result;
  }

  async _requestWithRetry(path) {
    let lastError = null;
    for (let attempt = 0; attempt < REQUEST_RETRIES; attempt += 1) {
      const r = await this._request(path);
      if (r.transportError) {
        lastError = r.transportError;
        if (attempt < REQUEST_RETRIES - 1) await wait(RETRY_GAP_MS);
        continue;
      }
      return this._toResult(path, r);
    }
    return {
      ok: false, code: null, body: null, path,
      problems: [problem("REQUEST_FAILED", path, lastError)],
    };
  }

  // Tek HTTP istegi (node:http, Connection: close, localAddress, Basic auth).
  // Throw etmez — { kod, govde, transportError } doner.
  _request(path) {
    return new Promise((resolve) => {
      const headers = { Connection: "close" };
      if (this.credentials) {
        const t = Buffer.from(
          `${this.credentials.user}:${this.credentials.password}`,
        ).toString("base64");
        headers.Authorization = `Basic ${t}`;
      }

      const request = http.request(
        {
          host: this.host,
          port: this.port,
          path: path,
          method: "GET",
          headers: headers,
          localAddress: this.sourceIp,
          timeout: this.timeoutMs,
        },
        (response) => {
          const chunks = [];
          response.on("data", (p) => chunks.push(p));
          response.on("end", () =>
            resolve({ code: response.statusCode, body: Buffer.concat(chunks) }),
          );
          // Gomulu sunucular chunked cevabi duzgun kapatmaz; kopmada eldeki
          // kismi govdeyi kullan (yarim-govde toleransi).
          response.on("aborted", () =>
            resolve({ code: response.statusCode, body: Buffer.concat(chunks) }),
          );
        },
      );
      request.on("timeout", () => request.destroy(new Error("timeout")));
      request.on("error", (e) => resolve({ transportError: `${e.code || e.name}: ${e.message}` }));
      request.end();
    });
  }

  // Ham istek sonucunu proje sonuc nesnesine cevirir + auth/durum sorunlari.
  _toResult(path, r) {
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
      bodyBuffer: r.body,
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

function validMs(value, fallback) {
  if (value == null) return fallback;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMER_MS) {
    return fallback;
  }
  return value;
}

// ======================================================================
// Yerel arayuz / kaynak IP / MAC uretici
// ======================================================================

export function findSourceIp(prefix) {
  // `name` KULLANILMIYOR: yalniz adresler geziliyor.
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const a of addresses || []) {
      if (a.family === "IPv4" && !a.internal && a.address.startsWith(prefix)) {
        return a.address;
      }
    }
  }
  return null;
}

// Tum yerel IPv4 arayuzleri (teshis icin). Doner: [{arayuz, ip, mask}]
export function localInterfaces() {
  const out = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const a of addresses || []) {
      if (a.family === "IPv4" && !a.internal) {
        out.push({ iface: name, ip: a.address, mask: a.netmask });
      }
    }
  }
  return out;
}

// MAC onekinden (OUI) uretici tahmini.
export function guessVendor(mac) {
  if (!mac) return null;
  const prefix = mac.toLowerCase().replace(/-/g, ":").split(":").slice(0, 3).join(":");
  return OUI_VENDORS[prefix] ?? null;
}

// ======================================================================
// Cihaz ayakta mi? — TCP connect yoklamasi
// ======================================================================


// Tek portun acik olup olmadigi. Throw etmez. Baglanti kurulur kurulmaz
// karar verilir — banner BEKLENMEZ. Olculdu (canli): banner beklemesi her
// yoklamaya 600 ms ekliyordu ve "hangi servis oturuyor" sorusu artik
// sorulmuyor.
function isPortOpen(host, port, sourceIp, timeout = TCP_PROBE_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;
    const finishWith = (open) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeout);
    const connectOptions = { host, port: port };
    if (sourceIp) connectOptions.localAddress = sourceIp;
    socket.connect(connectOptions, () => finishWith(true));
    // Baglanti kurulmadan zaman asimi = kapali; kurulduysa zaten kapat(true)
    // calismisti ve bu dinleyici etkisiz.
    socket.on("timeout", () => finishWith(!socket.connecting));
    socket.on("error", () => finishWith(false));
  });
}

// Cihaz ayakta mi? Kullandigimiz iki kapiya TCP connect (ICMP yerine).
//
// ⚠ KAYNAK IP VERMEK SART. Olculdu (2026-08-28, kurumsal ag): kaynak IP
// BAGLANMADAN yapilan connect bu makinede HER adrese aninda "success"
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
export async function isReachable(host, sourceIp) {
  const result = await Promise.all(
    [80, 5123].map((port) => isPortOpen(host, port, sourceIp)),
  );
  return result.some(Boolean);
}
