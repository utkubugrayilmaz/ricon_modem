// HTTP endpoint — cekirdegi TUKETEN katman (ucuncu tuketici: terminal, npm
// paketi, ve bu).
//
// KURAL: burada IS MANTIGI YOK. Telefon zorunlulugu, idempotency, LAN IP'nin
// en sona yazilmasi, defter kaydi — hepsi cekirdekte (provisionModem). Bu
// dosya yalnizca: HTTP istegini `opts`a cevir, cekirdegi cagir, olaylari
// tarayiciya akit, statik dosyayi ver. Cekirdek burayi TANIMAZ.
//
// Neden SSE (Server-Sent Events): provizyon ~60-90 sn suren, tek yonlu olay
// ureten bir is. WebSocket cift yonlu ve fazla; SSE tarayicida yerlesik
// (EventSource), sifir bagimlilik, otomatik yeniden baglanma. Tek yon yeterli.
//
// GUVENLIK: varsayilan olarak YALNIZCA 127.0.0.1'e baglanir. Bu servis cihaza
// YAZAR; ag uzerine acilmasi acik bir karar olmali (--dinle 0.0.0.0).

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  provisionModem, applyProvisioning, provisionRecord, pcPreflight, readIdentity,
  telefonNormalize, settingLabel, SETTING_LABELS,
} from "./index.js";
import { isReachable } from "./scanner.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
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

// Ayni anda tek provizyon — cihaz tek baglantili, ikinci akis zarar verir.
let mesgul = false;

export function createServer(opts = {}) {
  const {
    fabrikaHost = "192.168.1.1", sahaHost = "5.5.5.1",
    kimlik, profil, sifirlamaProfil, kayit, ilerle,
  } = opts;

  return http.createServer(async (istek, yanit) => {
    const url = new URL(istek.url, "http://yerel");
    try {
      if (url.pathname === "/api/durum") return await durumVer(yanit);
      if (url.pathname === "/api/hazirla") return await hazirlaAkit(url, istek, yanit);
      if (url.pathname === "/api/fabrikaya-dondur") return await sifirlaAkit(istek, yanit);
      return await statikVer(url.pathname, yanit);
    } catch (e) {
      jsonVer(yanit, 500, { ok: false, hata: `${e.name}: ${e.message}` });
    }
  });

  // --- GET /api/durum : modem nerede, PC hazir mi (salt okunur) ---
  async function durumVer(yanit) {
    const { konum, ad, on } = await modemiBul();
    jsonVer(yanit, 200, {
      ok: true,
      pc: { hazir: on.hazir, fabrika_kaynak: on.fabrikaKaynak,
        saha_kaynak: on.sahaKaynak, problems: on.problems },
      modem: { konum: ad, host: konum?.host ?? null },
      profil: profil?.ad ?? null,
      sifirlanabilir: Boolean(sifirlamaProfil),
      mesgul,
    });
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
      gonder("hata", { kod: "MESGUL", mesaj: "Baska bir islem surüyor. Bitmesini bekle." });
      return bitir();
    }
    if (!sifirlamaProfil) {
      gonder("hata", { kod: "PROFIL_YOK", mesaj: "Sifirlama profili tanimli degil." });
      return bitir();
    }
    mesgul = true;
    try {
      gonder("ilerleme", { mesaj: "modem araniyor" });
      const { konum, ad, on } = await modemiBul();
      if (!on.hazir) {
        gonder("hata", { kod: "PC_HAZIR_DEGIL", mesaj: on.problems[0]?.message,
          cozum: on.problems[0]?.check });
        return bitir();
      }
      if (!konum) {
        gonder("hata", { kod: "MODEM_YOK",
          mesaj: `Modem ne ${fabrikaHost} ne ${sahaHost} adresinde cevap veriyor.`,
          cozum: "Kabloyu LAN portuna tak ve tekrar dene." });
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
        kayit: satir, problems: r.problems });
    } finally {
      mesgul = false;
      bitir();
    }
  }

  // --- GET /api/hazirla?telefon=05xx : SSE ile canli provizyon ---
  async function hazirlaAkit(url, istek, yanit) {
    const telefon = url.searchParams.get("telefon");
    const { gonder, kopukMu } = sseAc(istek, yanit);

    if (mesgul) {
      gonder("hata", { kod: "MESGUL",
        mesaj: "Baska bir kurulum surüyor. Bitmesini bekle." });
      return yanit.end();
    }
    const n = telefonNormalize(telefon);
    if (!n) {
      // Cekirdek de reddeder; burada erken donuyoruz ki cihaza hic gidilmesin.
      gonder("hata", { kod: "MSISDN", mesaj: "Gecerli telefon numarasi gerekli (05xxxxxxxxx)." });
      return yanit.end();
    }
    mesgul = true;
    try {
      gonder("ilerleme", { mesaj: "modem araniyor" });
      // Kurulum ONCESI kimlik: sol panel modemin o anki halini gostersin.
      const { konum, on } = await modemiBul();
      if (!on.hazir) {
        gonder("hata", { kod: "PC_HAZIR_DEGIL", mesaj: on.problems[0]?.message,
          cozum: on.problems[0]?.check });
        return;
      }
      if (konum && kimlik) {
        gonder("ilerleme", { mesaj: `modem ${konum.host} — kimlik okunuyor` });
        gonder("kimlik_once", await readIdentity({ ...konum, kimlik }));
      }

      const r = await provisionModem({
        fabrikaHost, fabrikaKaynak: on.fabrikaKaynak,
        sahaHost, sahaKaynak: on.sahaKaynak,
        kimlik, profil, telefon: n, kayit,
        ilerle: (m) => { if (ilerle) ilerle(m); gonder("ilerleme", { mesaj: m }); },
        olay: (o) => {
          if (o.tur === "plan") gonder("plan", { satirlar: planRows(o.plan) });
          // Cekirdegin "sonuc" olayini gecmiyoruz: nihai sonucu asagida BIR
          // kez biz yolluyoruz (yoksa tarayici bitisi iki kez isler).
          else if (o.tur !== "sonuc") gonder(o.tur, o);
        },
      });
      gonder("sonuc", { durum: r.durum, ok: r.ok, deneme: r.deneme ?? null,
        kayit: r.kayit, problems: r.problems });
    } finally {
      mesgul = false;
      if (!kopukMu()) yanit.end();
    }
  }

  // --- Statik dosyalar (public/) ---
  async function statikVer(yol, yanit) {
    const ad = yol === "/" ? "index.html" : yol.replace(/^\/+/, "");
    // Dizin kacisi yok: yalnizca public/ altindaki duz dosya adlari.
    if (ad.includes("..") || ad.includes("/") || ad.includes("\\")) {
      return jsonVer(yanit, 400, { ok: false, hata: "gecersiz yol" });
    }
    const tur = MIME[extname(ad).toLowerCase()];
    if (!tur) return jsonVer(yanit, 404, { ok: false, hata: "bulunamadi" });
    try {
      const govde = await readFile(PUBLIC_DIR + ad);
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
