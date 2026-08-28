// HTTP endpoint — cekirdegi TUKETEN katman (ucuncu tuketici: terminal, npm
// paketi, ve bu).
//
// KURAL: burada IS MANTIGI YOK. Telefon zorunlulugu, idempotency, LAN IP'nin
// en sona yazilmasi, defter kaydi — hepsi cekirdekte (provisionModem). Bu
// dosya yalnizca: HTTP istegini `opts`a cevir, cekirdegi cagir, olaylari
// akit. Cekirdek burayi TANIMAZ.
//
// ARAYUZ BURAYA GOMULU DEGIL: `staticDir` verilmezse bu sunucu SALT API'dir.
// Bizim test arayuzu `examples/test-ui/` altinda ve oraya bir ORNEK olarak
// bakilmali — urun cekirdek + bu API. Baska bir tuketici kendi arayuzunu
// (ya da hic arayuz) verebilir.
//
// Neden SSE (Server-Sent Events): provizyon ~60-90 sn suren, tek yonlu olay
// ureten bir is. WebSocket cift yonlu ve fazla; SSE tarayicida yerlesik
// (EventSource), sifir bagimlilik, otomatik yeniden baglanma. Tek yon yeterli.
//
// GUVENLIK: varsayilan olarak YALNIZCA 127.0.0.1'e baglanir. Bu servis cihaza
// YAZAR; ag uzerine acilmasi acik bir karar olmali (--dinle 0.0.0.0).

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  provisionModem, applyProvisioning, applyPin, provisionRecord, pcPreflight,
  readIdentity, waitForInternet, normalizePhone, settingLabel, SETTING_LABELS,
  simPinTarget, assessDevice, retryDecision,
  phoneInputFormat, disableSimPin, readSimLock,
  withProblemText, problemText,
} from "./index.js";
import { isReachable } from "./scanner.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Plan olayini EKRANA HAZIR satirlara cevirir: tarayici sozluk bilmez, sadece
// basar. once = kurulum oncesi (sol panel), sonra = hedef (sag panel).
//
// Sira: profil sirasi DEGIL, sozluk sirasi. Profil "motorun yazma sirasi"na
// gore dizili (WLAN basta, LAN sonda); teknisyen ise ekrani cihazin ARAYUZ
// sirasiyla okur (Main Link -> Others -> Backup Link -> Wireless -> LAN).
// SETTING_LABELS tam o sirada yazildi.
export function planRows(plan) {
  const sozlukSirasi = Object.keys(SETTING_LABELS);
  const keys = Object.keys(plan.target || {}).sort((a, b) => {
    const ia = sozlukSirasi.indexOf(a);
    const ib = sozlukSirasi.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return keys.map((k) => {
    const before = settingLabel(k, plan.onceki?.[k]);
    const after = settingLabel(k, plan.target[k]);
    return {
      key: k,
      name: before.name,
      page: before.page,
      before: before.gosterim,
      after: after.gosterim,
      willChange: Boolean(plan.willChange && k in plan.willChange),
    };
  });
}

// SSE "error" olayi — metin KATALOGDAN gelir, sunucu kendi cumlesini YAZMAZ.
// Eskiden burada 5 uydurma kod ve 9 ayri elle yazilmis Turkce cumle vardi
// (MESGUL/MODEM_YOK/MSISDN/PC_HAZIR_DEGIL/PROFILE_UNKNOWN). Dordunun katalogda
// zaten karsiligi vardi; ayni durumun metni iki yerde durunca biri eskiyor.
const sendError = (send, code) => {
  const t = problemText(code);
  send("error", { code, message: t.baslik, fix: t.neYap });
};

// Ayni anda tek provizyon — cihaz tek baglantili, ikinci akis zarar verir.
let busy = false;
// Degerlendirme de cihaza gider (HTTP + telnet). Provizyondan ayri bir bayrak:
// "mesgul" provizyon demek ve arayuzde dugmeleri kapatiyor; degerlendirme
// 5 saniyelik salt-okunur bir istir, onu ayni bayrakla isaretlemek arayuze
// yanlis sey soylerdi.
let assessing = false;

export function createServer(options = {}) {
  const {
    factoryHost = "192.168.1.1", fieldHost = "5.5.5.1",
    kimlik, profile, resetProfile, record, metricRecord, onProgress,
    // Internet dogrulamasi ust siniri (sn) — 0 kapatir.
    internetWaitSec = 150,
    // Arayuz dizini. VERILMEZSE sunucu SALT API olur; arayuz urunun parcasi
    // degil (bizim test arayuzu examples/test-ui altinda bir ORNEKTIR).
    staticDir = null,
  } = options;

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://yerel");
    try {
      if (url.pathname === "/api/durum") return await serveStatus(response);
      if (url.pathname === "/api/degerlendir") return await serveAssessment(response);
      if (url.pathname === "/api/hazirla") return await streamProvision(url, request, response);
      if (url.pathname === "/api/fabrikaya-dondur") return await streamFactoryReset(request, response);
      if (url.pathname === "/api/pin") return await streamPinAttempt(url, request, response);
      if (url.pathname === "/api/pin-kaldir") return await streamPinDisable(url, request, response);
      if (url.pathname === "/api/olcum") return await receiveMetric(request, response);
      return await serveStatic(url.pathname, response);
    } catch (e) {
      // Beklenmeyen istisna: TEKNIK metin gunluge (stderr), ekrana TURKCE.
      // Tarayiciya `${e.name}: ${e.message}` basmak operatore hicbir sey
      // anlatmiyor; sunucu gunlugunde ise tam metin gerekli.
      process.stderr.write(`[sunucu] ${url.pathname} ${e.name}: ${e.message}
`);
      sendJson(response, 500, { ok: false,
        error: "Araçta beklenmeyen bir hata oluştu",
        fix: "Sayfayı yenile ve tekrar dene. Sürerse bilgi işleme haber ver." });
    }
  });

  // --- GET /api/durum : modem nerede, PC hazir mi (salt okunur) ---
  async function serveStatus(response) {
    const { location, name, on } = await findModem();
    sendJson(response, 200, {
      ok: true,
      pc: { ready: on.ready, factorySource: on.factorySource,
        fieldSource: on.fieldSource, problems: withProblemText(on.problems) },
      modem: { location: name, host: location?.host ?? null },
      profile: profile?.name ?? null,
      canReset: Boolean(resetProfile),
      busy,
    });
  }

  // --- GET /api/degerlendir : cihazin O ANKI durumu + ne eksik (salt okunur) ---
  //
  // PAHALI (~5 sn): HTTP kimlik okumasi + telnet uzerinden AT+CNUM. /api/durum
  // gibi surekli yoklanmaz — tuketici modemi ALGILADIGINDA BIR KEZ cagirir.
  // Cihaz tek baglantili; bu yuzden hem provizyonla (mesgul) hem KENDISIYLE
  // cakismasi engelleniyor.
  //
  // Karar burada URETILMEZ: eksik/baslatilabilir dahil her sey assessDevice'ten
  // gelir. Tek eklenen sey `telefon.girdi` — kanonik numaranin ekran bicimi,
  // o da cekirdekteki telefonGirdiBicimi ile.
  async function serveAssessment(response) {
    if (busy || assessing) {
      return sendJson(response, 409, { ok: false, error: "Cihazla baska bir islem surüyor." });
    }
    assessing = true;
    try {
      const r = await assessDevice({ factoryHost, fieldHost, kimlik });
      sendJson(response, 200, {
        ok: r.ok,
        // TEKRAR KARARI CEKIRDEKTEN. Arayuz "ne zaman yeniden bakayim?"
        // sorusunu kendi cevaplamiyor — yoksa politika iki yerde olurdu.
        retry: retryDecision(r),
        modem: r.modem,
        sim: r.sim,
        phone: { ...r.phone, input: phoneInputFormat(r.phone.number) },
        atPort: r.atPort ?? null,
        // Kilit kaldirmaya uygun mu (PIN girilmeden once bilinir). Yalnizca
        // kilitli SIM'de dolu; karar cekirdekten geliyor, burada uretilmiyor.
        pinRemovable: r.pinRemovable ?? null,
        internet: r.internet,
        missing: r.missing,
        canStart: r.canStart,
        problems: withProblemText(r.problems),
      });
    } finally {
      assessing = false;
    }
  }

  // --- POST /api/olcum : bir calistirmanin sure olcumunu kalici kaydet ---
  //
  // Adim sureleri TARAYICIDA olculur (olayin ekrana geldigi an = operatorun
  // gercekten bekledigi sure), o yuzden veri tarayicidan gelir. Sunucu
  // yalnizca zamani damgalar ve satiri yazar; yorum yapmaz.
  async function receiveMetric(request, response) {
    if (request.method !== "POST") return sendJson(response, 405, { ok: false, error: "POST bekleniyor" });
    if (typeof metricRecord !== "function") {
      return sendJson(response, 200, { ok: true, written: false, not: "olcum kaydi kapali" });
    }
    const parcalar = [];
    let boyut = 0;
    for await (const p of request) {
      boyut += p.length;
      if (boyut > 64 * 1024) return sendJson(response, 413, { ok: false, error: "govde cok buyuk" });
      parcalar.push(p);
    }
    let gelen;
    try {
      gelen = JSON.parse(Buffer.concat(parcalar).toString("utf8"));
    } catch {
      return sendJson(response, 400, { ok: false, error: "gecersiz JSON" });
    }
    const line = { timestamp: new Date().toISOString(), ...gelen };
    metricRecord(line);
    sendJson(response, 200, { ok: true, written: true });
  }

  // SSE akisini acar. Doner: { gonder, kopukMu, bitir }
  //
  // Tarayici sekmeyi kapatirsa cihaza YAZMA YARIDA KESILMEZ (kesmek nvram'i
  // yarim birakir). Akis susar, is cekirdekte tamamlanir, defter yine yazilir.
  function openSse(request, response) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    let kopuk = false;
    request.on("close", () => { kopuk = true; });
    return {
      send: (kind, veri) => {
        if (response.writableEnded) return;
        response.write(`event: ${kind}\ndata: ${JSON.stringify(veri)}\n\n`);
      },
      isClosed: () => kopuk,
      finish: () => { if (!kopuk) response.end(); },
    };
  }

  // Modem nerede? Doner: { konum:{host,kaynakIp}|null, ad, on }
  async function findModem() {
    const on = pcPreflight(prefix(factoryHost), prefix(fieldHost));
    if (!on.ready) return { location: null, name: null, on };
    const factoryReachable = await isReachable(factoryHost, on.factorySource);
    const fieldReachable = factoryReachable ? false : await isReachable(fieldHost, on.fieldSource);
    if (factoryReachable) return { location: { host: factoryHost, sourceIp: on.factorySource }, name: "factory", on };
    if (fieldReachable) return { location: { host: fieldHost, sourceIp: on.fieldSource }, name: "field", on };
    return { location: null, name: null, on };
  }

  // --- GET /api/fabrikaya-dondur : SSE ile fabrika profiline geri al ---
  //
  // Provizyonun AYNASI: cihaz neredeyse oradan okur, fabrika profilini yazar,
  // reboot eder, 192.168.1.1'de dogrular. Telefon ISTEMEZ — hat kaydetmiyoruz,
  // geri aliyoruz. DIKKAT: bu GERCEK factory reset DEGIL, bizim dokundugumuz
  // anahtarlari default'a dondurur (bkz. profile.js FACTORY_PROFILE).
  async function streamFactoryReset(request, response) {
    const { send, isClosed, finish } = openSse(request, response);
    if (busy) {
      sendError(send, "DEVICE_BUSY");
      return finish();
    }
    if (!resetProfile) {
      sendError(send, "PROFILE_UNKNOWN");
      return finish();
    }
    busy = true;
    try {
      send("progress", { message: "modem araniyor" });
      const { location, name, on } = await findModem();
      if (!on.ready) {
        // Ekrana TURKCE gider; message/check gunluge/gelistiriciye ait.
        sendError(send, on.problems[0]?.code);
        return finish();
      }
      if (!location) {
        sendError(send, "DEVICE_UNREACHABLE");
        return finish();
      }
      send("detected", { kind: "detected", action: `sifirlama_${name}`, location: location.host });
      send("identityBefore", await readIdentity({ ...location, kimlik }));

      const r = await applyProvisioning({
        ...location, kimlik, apply: true,
        newHost: factoryHost, newSourceIp: on.factorySource,
        onProgress: (m) => { if (onProgress) onProgress(m); send("progress", { message: m }); },
        event: (o) => {
          if (o.kind === "plan") send("plan", { lines: planRows(o.plan) });
          else if (o.kind !== "result") send(o.kind, o);
        },
      }, resetProfile);

      // Defter: sifirlama da kayda gecer — yoksa defter "hazir" derken cihaz
      // fabrikada olur, kayit YALAN SOYLER.
      const newLocation = r.status === "success"
        ? { host: factoryHost, sourceIp: on.factorySource } : location;
      const identity = kimlik ? await readIdentity({ ...newLocation, kimlik }) : {};
      const line = provisionRecord({
        result: { ...r, status: r.ok ? "fabrikaya_dondu" : `sifirlama_${r.status}` },
        phone: null, identity,
        profileName: resetProfile.name, host: newLocation.host,
      });
      if (typeof record === "function") { try { record(line); } catch { /* akisi bozmaz */ } }
      send("result", { status: line.status, ok: r.ok, attempt: null,
        record: line, problems: withProblemText(r.problems) });
    } finally {
      busy = false;
      finish();
    }
  }

  // --- GET /api/pin?pin=1234 : SADECE PIN dene + interneti tekrar kontrol ---
  //
  // AYRI BIR IS: provizyon bitmis ve dogrulanmis, tekrarlanmaz. Burada yalnizca
  // SIM PIN yazilir, cihaz reboot edilir ve internet bir daha beklenir.
  // Operatoru ana ekrana geri atmamak icin var: modem hala takili, ayarlar
  // dogru, eksik olan tek sey PIN.
  //
  // ⚠ TEK DENEME: applyPin bicim kontrolu yapar, ayni PIN yaziliysa denemez
  // (3 yanlis deneme SIM'i PUK'a kilitler).
  // --- GET /api/pin-kaldir : SIM PIN kilidini KALICI kaldir (SSE) ---
  //
  // /api/pin'in ALTERNATIFI DEGIL, TERSI. /api/pin PIN'i cihaza yazar; SIM
  // PIN'li kalir, parola sahadaki cihazda duz metin durur ve numara hicbir
  // zaman okunamaz. Bu uc PIN'i SIM'in KENDISINDEN kaldirir: saklanacak sir
  // kalmaz, SIM her cihazda acik gelir ve numara okunabilir hale gelir —
  // akisin tam otomatik olmasinin sarti bu.
  //
  // TEHLIKE: yanlis PIN bir deneme yakar, uc yanlis -> PUK. Korumalarin
  // TAMAMI cekirdekte (simPinKaldir): bicim kontrolu, kalan hak <= 1 ise
  // zorlama olmadan DENEMEZ, TEK deneme, yanlissa TEKRAR DENEMEZ. Burada
  // yeni bir karar URETILMIYOR; PIN yalnizca gecip gidiyor, hicbir yere
  // (log, olay, defter) yazilmiyor.
  async function streamPinDisable(url, request, response) {
    const { send, isClosed, finish } = openSse(request, response);
    if (busy || assessing) {
      sendError(send, "DEVICE_BUSY");
      return finish();
    }
    const pin = url.searchParams.get("pin");
    busy = true;
    try {
      const { location, on } = await findModem();
      if (!on.ready || !location) {
        sendError(send, "DEVICE_UNREACHABLE");
        return;
      }
      const atOptions = { ...location, kimlik,
        onProgress: (m) => { if (onProgress) onProgress(m); send("progress", { message: m }); } };

      // Kalan hakki ONCE bildir: operator ne riske girdigini denemeden gorsun.
      send("progress", { message: "SIM kilidi modulden okunuyor (kalan hak)" });
      const lock = await readSimLock(atOptions);
      send("simLock", { status: lock.status, lock: lock.lock,
        pinRemaining: lock.pinRemaining, pukRemaining: lock.pukRemaining });
      if (!lock.atPort) {
        sendError(send, "AT_PORT_NOT_FOUND");
        return;
      }

      // Bulunmus portu GECIRIYORUZ: cekirdek kendi icinde durumu yeniden
      // okuyacak (kararini taze veriye dayandirmali), ama port TARAMASINI
      // bir daha yapmasin — cihaz tek baglantili, her tur pahali.
      send("progress", { message: "PIN kilidi kaldiriliyor (TEK deneme)" });
      // elleOnay:true — bu uca yalniz OPERATOR PIN yazip dugmeye basinca
      // gelinir. "Bir hak yakildiysa bir daha deneme" OTOMATIK yolun kurali;
      // insani engellemez. SON HAK korumasi elleOnay'a bakmadan calisir.
      const r = await disableSimPin({ ...atOptions, atPort: lock.atPort }, pin,
        { humanApproved: true });
      send("pinDisableResult", {
        ok: r.ok, opened: r.opened, lockRemoved: r.lockRemoved,
        status: r.status, pinRemaining: r.pinRemaining,
        problems: withProblemText(r.problems),
      });
    } finally {
      busy = false;
      if (!isClosed()) response.end();
    }
  }

  async function streamPinAttempt(url, request, response) {
    const { send, isClosed, finish } = openSse(request, response);
    if (busy) {
      sendError(send, "DEVICE_BUSY");
      return finish();
    }
    const pin = url.searchParams.get("pin");
    busy = true;
    try {
      const { location, on } = await findModem();
      if (!on.ready || !location) {
        sendError(send, "DEVICE_UNREACHABLE");
        return;
      }
      // KARAR TEK YERDE: elle denemede de simPinHedefi'ne soruyoruz. Fark
      // yalnizca elleOnay:true — insan kalan hakki gorup bilincli onayladi.
      // Son hakki elle onay bile yakamaz (bkz. simPinHedefi).
      send("progress", { message: "SIM durumu okunuyor (kalan hak)" });
      const identity = await readIdentity({ ...location, kimlik });
      const { target, problems } = simPinTarget(identity.sim, pin, { humanApproved: true });
      if (typeof target !== "string" || target === "") {
        send("pinResult", { attempted: false,
          skipped: problems[0]?.code ?? "noDecision",
          problems: withProblemText(problems) });
        return;
      }
      const p = await applyPin({ ...location, kimlik,
        onProgress: (m) => { if (onProgress) onProgress(m); send("progress", { message: m }); },
        event: (o) => send(o.kind, o) }, target);

      if (!p.attempted) {
        send("pinResult", { attempted: false, skipped: p.skipped,
          problems: withProblemText(p.problems) });
        return;
      }
      // PIN yazildi + reboot edildi: cihaz yeni bastan gelecek, interneti bekle.
      const net = await waitForInternet({ ...location, kimlik }, internetWaitSec, {
        onProgress: (m) => { if (onProgress) onProgress(m); send("progress", { message: m }); },
        event: (o) => send(o.kind, o),
      });
      send("pinResult", { attempted: true, internet: net,
        problems: withProblemText(p.problems) });
    } finally {
      busy = false;
      if (!isClosed()) response.end();
    }
  }

  // --- GET /api/hazirla?telefon=05xx : SSE ile canli provizyon ---
  async function streamProvision(url, request, response) {
    const phone = url.searchParams.get("phone");
    const { send, isClosed } = openSse(request, response);

    if (busy) {
      sendError(send, "DEVICE_BUSY");
      return response.end();
    }
    const n = normalizePhone(phone);
    if (!n) {
      // Cekirdek de reddeder; burada erken donuyoruz ki cihaza hic gidilmesin.
      sendError(send, phone ? "MSISDN_INVALID" : "MSISDN_REQUIRED");
      return response.end();
    }
    busy = true;
    try {
      send("progress", { message: "modem araniyor" });
      // Kurulum ONCESI kimlik: sol panel modemin o anki halini gostersin.
      const { location, on } = await findModem();
      if (!on.ready) {
        // Ekrana TURKCE gider; message/check gunluge/gelistiriciye ait.
        sendError(send, on.problems[0]?.code);
        return;
      }
      // Kimligi BURADA okuyoruz (sol panel + SIM durumu). Ayni okumayi
      // cekirdege GECIYORUZ ki cihaza iki kez gidilmesin — tek baglantili
      // cihazda bu ~4 sn demek.
      let identity = null;
      if (location && kimlik) {
        send("progress", { message: `modem ${location.host} — kimlik/SIM okunuyor` });
        identity = await readIdentity({ ...location, kimlik });
        send("identityBefore", identity);
      }

      const r = await provisionModem({
        factoryHost, factorySource: on.factorySource,
        fieldHost, fieldSource: on.fieldSource,
        kimlik, profile, phone: n, record, identity,
        internetWaitSec,
        // PIN OPSIYONEL: yalnizca internet gelmezse denenir (cekirdek karari).
        pin: url.searchParams.get("pin") || null,
        onProgress: (m) => { if (onProgress) onProgress(m); send("progress", { message: m }); },
        event: (o) => {
          if (o.kind === "plan") send("plan", { lines: planRows(o.plan) });
          // Cekirdegin "result" olayini gecmiyoruz: nihai sonucu asagida BIR
          // kez biz yolluyoruz (yoksa tarayici bitisi iki kez isler).
          else if (o.kind !== "result") send(o.kind, o);
        },
      });
      send("result", { status: r.status, ok: r.ok, attempt: r.attempt ?? null,
        record: r.record, problems: withProblemText(r.problems) });
    } finally {
      busy = false;
      if (!isClosed()) response.end();
    }
  }

  // --- Statik dosyalar — YALNIZCA staticDir verilmisse ---
  // staticDir yoksa bu sunucu salt API'dir: arayuz urunun parcasi degil.
  async function serveStatic(path, response) {
    if (!staticDir) {
      return sendJson(response, 404, { ok: false,
        error: "arayuz sunulmuyor (salt API)",
        fix: "createServer({ staticDir }) ver ya da /api/* uclarini kullan" });
    }
    const name = path === "/" ? "index.html" : path.replace(/^\/+/, "");
    // Dizin kacisi yok: yalnizca verilen dizindeki duz dosya adlari.
    if (name.includes("..") || name.includes("/") || name.includes("\\")) {
      return sendJson(response, 400, { ok: false, error: "gecersiz yol" });
    }
    const kind = MIME[extname(name).toLowerCase()];
    if (!kind) return sendJson(response, 404, { ok: false, error: "bulunamadi" });
    try {
      const body = await readFile(join(staticDir, name));
      response.writeHead(200, { "Content-Type": kind, "Cache-Control": "no-store" });
      response.end(body);
    } catch {
      sendJson(response, 404, { ok: false, error: `bulunamadi: ${name}` });
    }
  }
}

function sendJson(response, code, nesne) {
  const body = JSON.stringify(nesne);
  response.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  response.end(body);
}

const prefix = (ip) => ip.split(".").slice(0, 3).join(".") + ".";
