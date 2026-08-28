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
  simPinHedefi, assessDevice, telefonGirdiBicimi, simPinKaldir, readSimLock,
  problemleriTurkcelestir, sorunTr,
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
  const anahtarlar = Object.keys(plan.hedef || {}).sort((a, b) => {
    const ia = sozlukSirasi.indexOf(a);
    const ib = sozlukSirasi.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return anahtarlar.map((k) => {
    const once = settingLabel(k, plan.onceki?.[k]);
    const sonra = settingLabel(k, plan.hedef[k]);
    return {
      anahtar: k,
      ad: once.ad,
      sayfa: once.sayfa,
      once: once.gosterim,
      sonra: sonra.gosterim,
      degisecek: Boolean(plan.degisecek && k in plan.degisecek),
    };
  });
}

// SSE "hata" olayi — metin KATALOGDAN gelir, sunucu kendi cumlesini YAZMAZ.
// Eskiden burada 5 uydurma kod ve 9 ayri elle yazilmis Turkce cumle vardi
// (MESGUL/MODEM_YOK/MSISDN/PC_HAZIR_DEGIL/PROFIL_YOK). Dordunun katalogda
// zaten karsiligi vardi; ayni durumun metni iki yerde durunca biri eskiyor.
const hataYolla = (gonder, kod) => {
  const t = sorunTr(kod);
  gonder("hata", { kod, mesaj: t.baslik, cozum: t.neYap });
};

// Ayni anda tek provizyon — cihaz tek baglantili, ikinci akis zarar verir.
let mesgul = false;
// Degerlendirme de cihaza gider (HTTP + telnet). Provizyondan ayri bir bayrak:
// "mesgul" provizyon demek ve arayuzde dugmeleri kapatiyor; degerlendirme
// 5 saniyelik salt-okunur bir istir, onu ayni bayrakla isaretlemek arayuze
// yanlis sey soylerdi.
let degerlendiriliyor = false;

export function createServer(opts = {}) {
  const {
    fabrikaHost = "192.168.1.1", sahaHost = "5.5.5.1",
    kimlik, profil, sifirlamaProfil, kayit, olcumKayit, ilerle,
    // Internet dogrulamasi ust siniri (sn) — 0 kapatir.
    internetBekle = 150,
    // Arayuz dizini. VERILMEZSE sunucu SALT API olur; arayuz urunun parcasi
    // degil (bizim test arayuzu examples/test-ui altinda bir ORNEKTIR).
    staticDir = null,
  } = opts;

  return http.createServer(async (istek, yanit) => {
    const url = new URL(istek.url, "http://yerel");
    try {
      if (url.pathname === "/api/durum") return await durumVer(yanit);
      if (url.pathname === "/api/degerlendir") return await degerlendirVer(yanit);
      if (url.pathname === "/api/hazirla") return await hazirlaAkit(url, istek, yanit);
      if (url.pathname === "/api/fabrikaya-dondur") return await sifirlaAkit(istek, yanit);
      if (url.pathname === "/api/pin") return await pinAkit(url, istek, yanit);
      if (url.pathname === "/api/pin-kaldir") return await pinKaldirAkit(url, istek, yanit);
      if (url.pathname === "/api/olcum") return await olcumAl(istek, yanit);
      return await statikVer(url.pathname, yanit);
    } catch (e) {
      // Beklenmeyen istisna: TEKNIK metin gunluge (stderr), ekrana TURKCE.
      // Tarayiciya `${e.name}: ${e.message}` basmak operatore hicbir sey
      // anlatmiyor; sunucu gunlugunde ise tam metin gerekli.
      process.stderr.write(`[sunucu] ${url.pathname} ${e.name}: ${e.message}
`);
      jsonVer(yanit, 500, { ok: false,
        hata: "Araçta beklenmeyen bir hata oluştu",
        cozum: "Sayfayı yenile ve tekrar dene. Sürerse bilgi işleme haber ver." });
    }
  });

  // --- GET /api/durum : modem nerede, PC hazir mi (salt okunur) ---
  async function durumVer(yanit) {
    const { konum, ad, on } = await modemiBul();
    jsonVer(yanit, 200, {
      ok: true,
      pc: { hazir: on.hazir, fabrika_kaynak: on.fabrikaKaynak,
        saha_kaynak: on.sahaKaynak, problems: problemleriTurkcelestir(on.problems) },
      modem: { konum: ad, host: konum?.host ?? null },
      profil: profil?.ad ?? null,
      sifirlanabilir: Boolean(sifirlamaProfil),
      mesgul,
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
  async function degerlendirVer(yanit) {
    if (mesgul || degerlendiriliyor) {
      return jsonVer(yanit, 409, { ok: false, hata: "Cihazla baska bir islem surüyor." });
    }
    degerlendiriliyor = true;
    try {
      const r = await assessDevice({ fabrikaHost, sahaHost, kimlik });
      jsonVer(yanit, 200, {
        ok: r.ok,
        modem: r.modem,
        sim: r.sim,
        telefon: { ...r.telefon, girdi: telefonGirdiBicimi(r.telefon.numara) },
        at_port: r.at_port ?? null,
        // Kilit kaldirmaya uygun mu (PIN girilmeden once bilinir). Yalnizca
        // kilitli SIM'de dolu; karar cekirdekten geliyor, burada uretilmiyor.
        pin_kaldirilabilir: r.pin_kaldirilabilir ?? null,
        internet: r.internet,
        eksik: r.eksik,
        baslatilabilir: r.baslatilabilir,
        problems: problemleriTurkcelestir(r.problems),
      });
    } finally {
      degerlendiriliyor = false;
    }
  }

  // --- POST /api/olcum : bir calistirmanin sure olcumunu kalici kaydet ---
  //
  // Adim sureleri TARAYICIDA olculur (olayin ekrana geldigi an = operatorun
  // gercekten bekledigi sure), o yuzden veri tarayicidan gelir. Sunucu
  // yalnizca zamani damgalar ve satiri yazar; yorum yapmaz.
  async function olcumAl(istek, yanit) {
    if (istek.method !== "POST") return jsonVer(yanit, 405, { ok: false, hata: "POST bekleniyor" });
    if (typeof olcumKayit !== "function") {
      return jsonVer(yanit, 200, { ok: true, yazildi: false, not: "olcum kaydi kapali" });
    }
    const parcalar = [];
    let boyut = 0;
    for await (const p of istek) {
      boyut += p.length;
      if (boyut > 64 * 1024) return jsonVer(yanit, 413, { ok: false, hata: "govde cok buyuk" });
      parcalar.push(p);
    }
    let gelen;
    try {
      gelen = JSON.parse(Buffer.concat(parcalar).toString("utf8"));
    } catch {
      return jsonVer(yanit, 400, { ok: false, hata: "gecersiz JSON" });
    }
    const satir = { zaman: new Date().toISOString(), ...gelen };
    olcumKayit(satir);
    jsonVer(yanit, 200, { ok: true, yazildi: true });
  }

  // SSE akisini acar. Doner: { gonder, kopukMu, bitir }
  //
  // Tarayici sekmeyi kapatirsa cihaza YAZMA YARIDA KESILMEZ (kesmek nvram'i
  // yarim birakir). Akis susar, is cekirdekte tamamlanir, defter yine yazilir.
  function sseAc(istek, yanit) {
    yanit.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    let kopuk = false;
    istek.on("close", () => { kopuk = true; });
    return {
      gonder: (tur, veri) => {
        if (yanit.writableEnded) return;
        yanit.write(`event: ${tur}\ndata: ${JSON.stringify(veri)}\n\n`);
      },
      kopukMu: () => kopuk,
      bitir: () => { if (!kopuk) yanit.end(); },
    };
  }

  // Modem nerede? Doner: { konum:{host,kaynakIp}|null, ad, on }
  async function modemiBul() {
    const on = pcPreflight(onek(fabrikaHost), onek(sahaHost));
    if (!on.hazir) return { konum: null, ad: null, on };
    const fabrikaVar = await isReachable(fabrikaHost, on.fabrikaKaynak);
    const sahaVar = fabrikaVar ? false : await isReachable(sahaHost, on.sahaKaynak);
    if (fabrikaVar) return { konum: { host: fabrikaHost, kaynakIp: on.fabrikaKaynak }, ad: "fabrika", on };
    if (sahaVar) return { konum: { host: sahaHost, kaynakIp: on.sahaKaynak }, ad: "saha", on };
    return { konum: null, ad: null, on };
  }

  // --- GET /api/fabrikaya-dondur : SSE ile fabrika profiline geri al ---
  //
  // Provizyonun AYNASI: cihaz neredeyse oradan okur, fabrika profilini yazar,
  // reboot eder, 192.168.1.1'de dogrular. Telefon ISTEMEZ — hat kaydetmiyoruz,
  // geri aliyoruz. DIKKAT: bu GERCEK factory reset DEGIL, bizim dokundugumuz
  // anahtarlari default'a dondurur (bkz. profile.js FACTORY_PROFILE).
  async function sifirlaAkit(istek, yanit) {
    const { gonder, kopukMu, bitir } = sseAc(istek, yanit);
    if (mesgul) {
      hataYolla(gonder, "DEVICE_BUSY");
      return bitir();
    }
    if (!sifirlamaProfil) {
      hataYolla(gonder, "PROFIL_YOK");
      return bitir();
    }
    mesgul = true;
    try {
      gonder("ilerleme", { mesaj: "modem araniyor" });
      const { konum, ad, on } = await modemiBul();
      if (!on.hazir) {
        // Ekrana TURKCE gider; message/check gunluge/gelistiriciye ait.
        hataYolla(gonder, on.problems[0]?.kod);
        return bitir();
      }
      if (!konum) {
        hataYolla(gonder, "DEVICE_UNREACHABLE");
        return bitir();
      }
      gonder("algilandi", { tur: "algilandi", eylem: `sifirlama_${ad}`, konum: konum.host });
      gonder("kimlik_once", await readIdentity({ ...konum, kimlik }));

      const r = await applyProvisioning({
        ...konum, kimlik, uygula: true,
        yeniHost: fabrikaHost, yeniKaynakIp: on.fabrikaKaynak,
        ilerle: (m) => { if (ilerle) ilerle(m); gonder("ilerleme", { mesaj: m }); },
        olay: (o) => {
          if (o.tur === "plan") gonder("plan", { satirlar: planRows(o.plan) });
          else if (o.tur !== "sonuc") gonder(o.tur, o);
        },
      }, sifirlamaProfil);

      // Defter: sifirlama da kayda gecer — yoksa defter "hazir" derken cihaz
      // fabrikada olur, kayit YALAN SOYLER.
      const yeniKonum = r.durum === "basarili"
        ? { host: fabrikaHost, kaynakIp: on.fabrikaKaynak } : konum;
      const kimlikBilgi = kimlik ? await readIdentity({ ...yeniKonum, kimlik }) : {};
      const satir = provisionRecord({
        sonuc: { ...r, durum: r.ok ? "fabrikaya_dondu" : `sifirlama_${r.durum}` },
        telefon: null, kimlikBilgi,
        profilAd: sifirlamaProfil.ad, host: yeniKonum.host,
      });
      if (typeof kayit === "function") { try { kayit(satir); } catch { /* akisi bozmaz */ } }
      gonder("sonuc", { durum: satir.durum, ok: r.ok, deneme: null,
        kayit: satir, problems: problemleriTurkcelestir(r.problems) });
    } finally {
      mesgul = false;
      bitir();
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
  async function pinKaldirAkit(url, istek, yanit) {
    const { gonder, kopukMu, bitir } = sseAc(istek, yanit);
    if (mesgul || degerlendiriliyor) {
      hataYolla(gonder, "DEVICE_BUSY");
      return bitir();
    }
    const pin = url.searchParams.get("pin");
    mesgul = true;
    try {
      const { konum, on } = await modemiBul();
      if (!on.hazir || !konum) {
        hataYolla(gonder, "DEVICE_UNREACHABLE");
        return;
      }
      const atOpts = { ...konum, kimlik,
        ilerle: (m) => { if (ilerle) ilerle(m); gonder("ilerleme", { mesaj: m }); } };

      // Kalan hakki ONCE bildir: operator ne riske girdigini denemeden gorsun.
      gonder("ilerleme", { mesaj: "SIM kilidi modulden okunuyor (kalan hak)" });
      const kilit = await readSimLock(atOpts);
      gonder("sim_kilit", { durum: kilit.durum, kilit: kilit.kilit,
        pin_kalan: kilit.pin_kalan, puk_kalan: kilit.puk_kalan });
      if (!kilit.at_port) {
        hataYolla(gonder, "AT_PORT_YOK");
        return;
      }

      // Bulunmus portu GECIRIYORUZ: cekirdek kendi icinde durumu yeniden
      // okuyacak (kararini taze veriye dayandirmali), ama port TARAMASINI
      // bir daha yapmasin — cihaz tek baglantili, her tur pahali.
      gonder("ilerleme", { mesaj: "PIN kilidi kaldiriliyor (TEK deneme)" });
      const r = await simPinKaldir({ ...atOpts, atPort: kilit.at_port }, pin);
      gonder("pin_kaldir_sonuc", {
        ok: r.ok, acildi: r.acildi, kilit_kaldirildi: r.kilit_kaldirildi,
        durum: r.durum, pin_kalan: r.pin_kalan,
        problems: problemleriTurkcelestir(r.problems),
      });
    } finally {
      mesgul = false;
      if (!kopukMu()) yanit.end();
    }
  }

  async function pinAkit(url, istek, yanit) {
    const { gonder, kopukMu, bitir } = sseAc(istek, yanit);
    if (mesgul) {
      hataYolla(gonder, "DEVICE_BUSY");
      return bitir();
    }
    const pin = url.searchParams.get("pin");
    mesgul = true;
    try {
      const { konum, on } = await modemiBul();
      if (!on.hazir || !konum) {
        hataYolla(gonder, "DEVICE_UNREACHABLE");
        return;
      }
      // KARAR TEK YERDE: elle denemede de simPinHedefi'ne soruyoruz. Fark
      // yalnizca elleOnay:true — insan kalan hakki gorup bilincli onayladi.
      // Son hakki elle onay bile yakamaz (bkz. simPinHedefi).
      gonder("ilerleme", { mesaj: "SIM durumu okunuyor (kalan hak)" });
      const kimlikBilgi = await readIdentity({ ...konum, kimlik });
      const { hedef, problems } = simPinHedefi(kimlikBilgi.sim, pin, { elleOnay: true });
      if (typeof hedef !== "string" || hedef === "") {
        gonder("pin_sonuc", { denendi: false,
          atlandi: problems[0]?.kod ?? "karar_yok",
          problems: problemleriTurkcelestir(problems) });
        return;
      }
      const p = await applyPin({ ...konum, kimlik,
        ilerle: (m) => { if (ilerle) ilerle(m); gonder("ilerleme", { mesaj: m }); },
        olay: (o) => gonder(o.tur, o) }, hedef);

      if (!p.denendi) {
        gonder("pin_sonuc", { denendi: false, atlandi: p.atlandi,
          problems: problemleriTurkcelestir(p.problems) });
        return;
      }
      // PIN yazildi + reboot edildi: cihaz yeni bastan gelecek, interneti bekle.
      const net = await waitForInternet({ ...konum, kimlik }, internetBekle, {
        ilerle: (m) => { if (ilerle) ilerle(m); gonder("ilerleme", { mesaj: m }); },
        olay: (o) => gonder(o.tur, o),
      });
      gonder("pin_sonuc", { denendi: true, internet: net,
        problems: problemleriTurkcelestir(p.problems) });
    } finally {
      mesgul = false;
      if (!kopukMu()) yanit.end();
    }
  }

  // --- GET /api/hazirla?telefon=05xx : SSE ile canli provizyon ---
  async function hazirlaAkit(url, istek, yanit) {
    const telefon = url.searchParams.get("telefon");
    const { gonder, kopukMu } = sseAc(istek, yanit);

    if (mesgul) {
      hataYolla(gonder, "DEVICE_BUSY");
      return yanit.end();
    }
    const n = normalizePhone(telefon);
    if (!n) {
      // Cekirdek de reddeder; burada erken donuyoruz ki cihaza hic gidilmesin.
      hataYolla(gonder, telefon ? "MSISDN_INVALID" : "MSISDN_REQUIRED");
      return yanit.end();
    }
    mesgul = true;
    try {
      gonder("ilerleme", { mesaj: "modem araniyor" });
      // Kurulum ONCESI kimlik: sol panel modemin o anki halini gostersin.
      const { konum, on } = await modemiBul();
      if (!on.hazir) {
        // Ekrana TURKCE gider; message/check gunluge/gelistiriciye ait.
        hataYolla(gonder, on.problems[0]?.kod);
        return;
      }
      // Kimligi BURADA okuyoruz (sol panel + SIM durumu). Ayni okumayi
      // cekirdege GECIYORUZ ki cihaza iki kez gidilmesin — tek baglantili
      // cihazda bu ~4 sn demek.
      let kimlikBilgi = null;
      if (konum && kimlik) {
        gonder("ilerleme", { mesaj: `modem ${konum.host} — kimlik/SIM okunuyor` });
        kimlikBilgi = await readIdentity({ ...konum, kimlik });
        gonder("kimlik_once", kimlikBilgi);
      }

      const r = await provisionModem({
        fabrikaHost, fabrikaKaynak: on.fabrikaKaynak,
        sahaHost, sahaKaynak: on.sahaKaynak,
        kimlik, profil, telefon: n, kayit, kimlikBilgi,
        internetBekle,
        // PIN OPSIYONEL: yalnizca internet gelmezse denenir (cekirdek karari).
        pin: url.searchParams.get("pin") || null,
        ilerle: (m) => { if (ilerle) ilerle(m); gonder("ilerleme", { mesaj: m }); },
        olay: (o) => {
          if (o.tur === "plan") gonder("plan", { satirlar: planRows(o.plan) });
          // Cekirdegin "sonuc" olayini gecmiyoruz: nihai sonucu asagida BIR
          // kez biz yolluyoruz (yoksa tarayici bitisi iki kez isler).
          else if (o.tur !== "sonuc") gonder(o.tur, o);
        },
      });
      gonder("sonuc", { durum: r.durum, ok: r.ok, deneme: r.deneme ?? null,
        kayit: r.kayit, problems: problemleriTurkcelestir(r.problems) });
    } finally {
      mesgul = false;
      if (!kopukMu()) yanit.end();
    }
  }

  // --- Statik dosyalar — YALNIZCA staticDir verilmisse ---
  // staticDir yoksa bu sunucu salt API'dir: arayuz urunun parcasi degil.
  async function statikVer(yol, yanit) {
    if (!staticDir) {
      return jsonVer(yanit, 404, { ok: false,
        hata: "arayuz sunulmuyor (salt API)",
        cozum: "createServer({ staticDir }) ver ya da /api/* uclarini kullan" });
    }
    const ad = yol === "/" ? "index.html" : yol.replace(/^\/+/, "");
    // Dizin kacisi yok: yalnizca verilen dizindeki duz dosya adlari.
    if (ad.includes("..") || ad.includes("/") || ad.includes("\\")) {
      return jsonVer(yanit, 400, { ok: false, hata: "gecersiz yol" });
    }
    const tur = MIME[extname(ad).toLowerCase()];
    if (!tur) return jsonVer(yanit, 404, { ok: false, hata: "bulunamadi" });
    try {
      const govde = await readFile(join(staticDir, ad));
      yanit.writeHead(200, { "Content-Type": tur, "Cache-Control": "no-store" });
      yanit.end(govde);
    } catch {
      jsonVer(yanit, 404, { ok: false, hata: `bulunamadi: ${ad}` });
    }
  }
}

function jsonVer(yanit, kod, nesne) {
  const govde = JSON.stringify(nesne);
  yanit.writeHead(kod, { "Content-Type": "application/json; charset=utf-8" });
  yanit.end(govde);
}

const onek = (ip) => ip.split(".").slice(0, 3).join(".") + ".";
