#!/usr/bin/env node
// Ricon S9922M44 — INCE CLI sarmalayici. Cekirdek is src/index.js'te;
// bu dosya sadece: argv ayristir + .env oku + index'i cagir + yazdir.
// Ayni cekirdek HTTP endpoint / npm paketi olarak da tuketilebilir.
//
//   node ricon.js dogrula        Ortam teshisi
//   node ricon.js oku            HER SEYI cek (sistem + SIM + ayar + nvram)
//   node ricon.js konsol         Telnet root shell kesfi (--nvram = tam nvram)
//   node ricon.js sim            SIM/hucresel ozet (--telefon 05xx = MSISDN girisi)
//   node ricon.js fark A.json B.json   Iki nvram anlik goruntusunu karsilastir
//   node ricon.js uygula         Provizyon (KURU varsayilan; gercek yazma --uygula)
//                                --profil saha|fabrika · --yeni-host · --yeni-kaynak
//                                --reboot-yok
//   node ricon.js calistir <fn>  Cekirdegin HERHANGI bir fonksiyonunu cagir
//                                adsiz cagrilirsa tum yuzeyi listeler
//   node ricon.js hazirla        Tak-calistir: algila->provizyon->dogrula
//                                Numara SIM'den okunur; --telefon 05xx EZER
//                                --dongu (cok modem: tak -> hazir -> cikar)
//                                --profil · --saha-host · --deneme N · --max N
//                                --kayit <dosya> (varsayilan data/hazirlanan.jsonl)
//
// Ortak: --json <dosya> (ciktiyi yaz) · --kaynak <dosya> (kayittan goster)
// Ortam: MODEM_HOST, MODEM_KULLANICI, MODEM_SIFRE, MODEM_KAYNAK_IP
//
// Sozlesme: stdout HER ZAMAN saf JSON; ilerleme/ozet stderr'a; cikis kodu ok'tan.

import { writeFileSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { DEFAULT_HOST } from "./src/domain/constants.js";
import { findSourceIp } from "./src/transport/network.js";
import {
  checkDevice, readDevice, readConsole, computeNvramDiff,
  applyProvisioning, PROFILES, provisionModem, provisionLoop, pcPreflight, readSim,
  normalizePhone, summarizeMetrics, assessDevice, degerlendirmeyiIzle,
  readMsisdn, readSimLock, simPinKaldir,
  simPinKilitle, atKomut, parseClck,
} from "./src/index.js";
import { writeJson, summaryText, planRows, planMetni } from "./src/report/report.js";
import { isOk } from "./src/domain/problems.js";
import * as cekirdek from "./src/index.js";
import { cagir, argvAyikla, listeMetni } from "./src/cli/cagirici.js";

const argv = process.argv.slice(2);
const komut = argv[0];
const bayrak = (ad) => {
  const i = argv.indexOf(ad);
  return i === -1 ? undefined : argv[i + 1];
};
const ilerle = (m) => process.stderr.write(`[${komut}] ${m}\n`);

// .env -> opts. Cekirdek (src/) process.env OKUMAZ; okuma burada.
function ortamOpts() {
  // --host / --kaynak-ip .env'i EZER: modem o an nerede oldugunu soyleyebilmek
  // gerekir (fabrika 192.168.1.1 <-> saha 5.5.5.1 arasinda gidip gelirken).
  const hostBayrak = bayrak("--host");
  const host = (hostBayrak || process.env.MODEM_HOST || "").trim() || DEFAULT_HOST;
  const onek = host.split(".").slice(0, 3).join(".") + ".";
  // --host verildiyse .env'deki KAYNAK_IP baska alt aga ait olabilir; yok say
  // ve dogru kaynagi onekten bul (yanlis arayuzden cikip cihazi kaybetmeyelim).
  const kaynakSecim = bayrak("--kaynak-ip") || (hostBayrak ? "" : process.env.MODEM_KAYNAK_IP);
  const kaynakIp = (kaynakSecim || "").trim() || findSourceIp(onek) || undefined;
  const kullanici = (process.env.MODEM_KULLANICI || "").trim();
  const sifre = process.env.MODEM_SIFRE || "";
  const kimlik = kullanici ? { kullanici, sifre } : null;
  return { host, kaynakIp, kimlik, ilerle };
}

// --- Hazirlama kaydi (JSONL) ---
// Kalici rollout defteri: her hazirlanan modem icin BIR satir. Cekirdek
// dosyaya yazmaz; yazma karari burada. Dosya `data/` altinda ve .gitignore'da
// — icinde telefon/ICCID/IMEI (kisisel/abonelik verisi) var, commit EDILMEZ.
const KAYIT_DOSYA = "data/hazirlanan.jsonl";
// Sure olcumleri ayri dosyada: defter "hangi modem sahaya cikti" sorusunun
// kaydi, olcum dosyasi "surec ne kadar suruyor" sorusunun kaydi. Karistirmak
// ikisini de bulaniklastirir.
const OLCUM_DOSYA = "data/olcumler.jsonl";

function kayitYazici(dosya, etiket = "kayit") {
  return (satir) => {
    try {
      mkdirSync(dirname(dosya), { recursive: true });
      appendFileSync(dosya, JSON.stringify(satir) + "\n", "utf8");
      const ek = satir.toplam_sn != null ? `${satir.toplam_sn} sn` : (satir.iccid || "");
      process.stderr.write(`[${etiket}] ${dosya} <- ${satir.durum} `
        + `${satir.telefon || "—"} ${ek}\n`);
    } catch (e) {
      process.stderr.write(`[${etiket}] YAZILAMADI (${dosya}): ${e.message}\n`);
    }
  };
}

// Operatorun numarayi girerken gecirdigi sure — INSANIN MESGUL OLDUGU TEK AN.
// Olcum ozetinin en anlamli sayisi bu (gerisi gozetimsiz geciyor), o yuzden
// ayri tutuluyor. Satir yazilinca sifirlanir: her modem kendi suresini alsin.
let girisSn = null;

// Telefon numarasini sorar (stderr'a; stdout saf JSON kalir). Gecerli olana
// kadar ya da bos girise kadar sorar. Doner: 5xxxxxxxxx | null
function telefonSor(sira) {
  // Etkilesimli degilsek (boru/servis/cron) SORMA — cekirdek MSISDN_REQUIRED
  // der ve is duzgun basarisiz olur; kapanmis stdin'de beklemek kilitlenmedir.
  if (!process.stdin.isTTY) {
    process.stderr.write("[hazirla] etkilesimli terminal yok: --telefon zorunlu\n");
    return Promise.resolve(null);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const sor = (soru) => new Promise((c) => rl.question(soru, c));
  const basladi = Date.now();
  return (async () => {
    try {
      for (let i = 0; i < 3; i += 1) {
        const ham = (await sor(`\n[${sira}. modem] SIM telefon numarasi (05xxxxxxxxx): `)).trim();
        if (!ham) break;
        const n = normalizePhone(ham);
        if (n) return n;
        process.stderr.write("  gecersiz — TR mobil bekleniyor (05xxxxxxxxx / +905xxxxxxxxx)\n");
      }
      return null;
    } finally {
      rl.close();
      girisSn = Number(((Date.now() - basladi) / 1000).toFixed(1));
    }
  })();
}

// Cekirdegin olay akisini TERMINALE cevirir ve adim surelerini olcer.
//
// Iki isi birden yapiyor cunku ikisi de ayni akisi dinliyor:
//   1) `plan` olayinda ONCE -> SONRA tablosunu basar. Teknisyen ham nvram
//      anahtari gormez; ad/sayfa/deger sozlukten gelir (planRows).
//   2) Olaylar arasi gecen sureyi toplar -> data/olcumler.jsonl'in `adimlar`
//      alani. Etiketler SABIT tutulur, yoksa metrics.js'in kovalari dagilir.
//
// Doner: `olay` dinleyicisi; uzerinde .adimlar() ile kirilim alinir.
function akisIzleyici() {
  const adimlar = [];
  // Ilk olaya kadar gecen sure de bir adimdir (modem aranmasi/algilanmasi);
  // etiketsiz baslarsak o sure sessizce kaybolurdu.
  let sonAd = "algilama";
  let sonAn = Date.now();
  const damgala = (ad) => {
    const simdi = Date.now();
    if (sonAd) adimlar.push({ ad: sonAd, sure_sn: Number(((simdi - sonAn) / 1000).toFixed(1)) });
    sonAd = ad;
    sonAn = simdi;
  };

  const olay = (o) => {
    switch (o.tur) {
      // Yeni cihaz/deneme basladi: onceki kirilimi at, sifirdan olc. Dongude
      // her modem KENDI adim surelerini alsin diye gerekli.
      case "algilandi":
        adimlar.length = 0;
        sonAd = "algilama";
        sonAn = Date.now();
        break;
      case "plan":
        damgala("plan");
        process.stderr.write("\n  PLAN — once -> sonra (* = degisecek)\n"
          + planMetni(planRows(o.plan)) + "\n\n");
        break;
      case "yaziliyor": damgala(`yazma:${o.grup}`); break;
      case "reboot": damgala("reboot"); break;
      case "dogrulama": damgala("dogrulama"); break;
      case "pin_deneniyor": damgala("pin_denemesi"); break;
      case "internet_bekleniyor": damgala("internet_bekleme"); break;
      case "internet":
      case "bitti":
      case "sonuc": damgala(null); break;
      default: break;
    }
  };
  olay.adimlar = () => { damgala(null); return adimlar; };
  return olay;
}

// provisionModem sonucunu OLCUM satirina cevirir (data/olcumler.jsonl).
// Sema: src/report/metrics.js — summarizeMetrics'in bekledigi alanlar.
//
// Bu is neden CEKIRDEKTE DEGIL: olcum bir rapor kaygisi, provizyonun degil.
// Cekirdek yalnizca `toplam_sn`'i bildiriyor; satiri kuran, dosyaya yazan ve
// "bu kosuyu kaydet" diyen tuketici.
function olcumSatiri(r, adimlar) {
  const k = r.kayit || {};
  const satir = {
    zaman: new Date().toISOString(),
    tur: "kurulum",
    kaynak: "cli",
    durum: r.durum ?? null,
    ok: Boolean(r.ok),
    deneme: r.deneme ?? 1,
    lan_mac: k.lan_mac ?? null,
    iccid: k.iccid ?? null,
    telefon: k.telefon ?? null,
    toplam_sn: r.toplam_sn ?? null,
    giris_sn: girisSn,
    adimlar,
  };
  girisSn = null;   // sonraki modem kendi suresini olcsun
  return satir;
}

// Tek modem: hazirla + olcum satirini yaz. Dongude ayni isi cekirdegin
// olcumKayit geri cagrisi yapiyor (her modemden sonra).
async function olculerekHazirla(hOpts, ek, olcumYaz) {
  const r = await provisionModem({ ...hOpts, ...ek });
  olcumYaz(olcumSatiri(r, hOpts.olay?.adimlar?.() ?? []));
  return r;
}

// Cekirdek cagrisinin sonucuna `ok`'u PROBLEMLERDEN turetir. Bazi salt-okuma
// fonksiyonlari (readMsisdn/readSimLock) `ok` alani DONDURMUYOR: kismi sonuc
// da gecerli bir sonuc. Ama CLI sozlesmesi "cikis kodu ok'tan" diyor, yani
// burada hesaplanmali. Sabit `ok: true` yazmak, erisilemeyen bir modemde
// kabuga 0 dondurup betikleri yaniltiyordu.
async function sonucOk(vaat) {
  const r = await vaat;
  return { ...r, ok: r.ok ?? isOk(r.problems ?? []) };
}

// nvram JSON dosyasindan nvram nesnesini alir ({nvram:{...}} ya da ham {...}).
function farkNvramAl(dosya) {
  const j = JSON.parse(readFileSync(dosya, "utf8"));
  return j.nvram || j;
}

async function komutuCalistir() {
  const opts = ortamOpts();
  switch (komut) {
    case "dogrula": return checkDevice(opts);
    case "oku": return readDevice(opts);
    case "konsol": return readConsole({ ...opts, nvram: argv.includes("--nvram") });
    case "sim": return readSim({ ...opts, telefon: bayrak("--telefon") });
    // Cihazin O ANKI durumu + ne eksik. Sunucudaki /api/degerlendir ile AYNI
    // cekirdek cagrisi — endpoint bir tuketici, burasi digeri.
    case "degerlendir": {
      const dOpts = {
        ...opts,
        fabrikaHost: bayrak("--host") || undefined,
        sahaHost: bayrak("--saha-host") || undefined,
        telefon: bayrak("--telefon") || null,
        pin: bayrak("--pin") || null,
      };
      // --izle: cekirdek KENDI KENDINE tekrar bakar. Ne zaman tekrar
      // bakilacagina yenidenDenemeKarari karar veriyor — burada politika YOK.
      // Ayni yetenegi arayuz de kullaniyor; kural: her yetenek her tuketiciden.
      if (!argv.includes("--izle")) return assessDevice(dOpts);
      return degerlendirmeyiIzle({
        ...dOpts,
        enFazlaTur: Number(bayrak("--tur")) || Infinity,
        olay: (o) => ilerle(`modem=${o.modem.konum ?? "yok"}`
          + ` telefon=${o.telefon.numara ?? "-"} eksik=[${o.eksik}]`
          + ` tekrar=${o.tekrar.tekrar ? `${o.tekrar.sonra_sn} sn (${o.tekrar.sebep})` : "yok"}`),
      });
    }
    // SADECE telefon numarasi. "Bu araci sadece numara okumak icin kullanmak
    // istiyorum" diyen icin tek komut; provizyon/degerlendirme gerekmez.
    case "numara": return { zaman: new Date().toISOString(), komut: "numara",
      modem_ip: opts.host, ...(await sonucOk(readMsisdn(opts))) };
    // SADECE SIM kilidi (salt okunur): durum + KALAN HAK. Hicbir sey harcamaz.
    case "sim-kilit": return { zaman: new Date().toISOString(), komut: "sim-kilit",
      modem_ip: opts.host, ...(await sonucOk(readSimLock(opts))) };
    // SIM PIN kilidini KALICI kaldir. `uygula` ile ayni sozlesme: bayraksiz
    // KURU calisir (yalniz durumu bildirir), gercek deneme --uygula ister.
    // Sebep: yanlis PIN bir hak yakar, uc yanlis PUK demek.
    case "sim-pin-kaldir": {
      const pin = bayrak("--pin");
      const gercek = argv.includes("--uygula");
      if (!gercek) {
        const k = await sonucOk(readSimLock(opts));
        const kaldirKilitAcik = k.at_port
          ? parseClck((await atKomut({ ...opts, atPort: k.at_port }, 'AT+CLCK="SC",2')).cevap)
          : null;
        return { zaman: new Date().toISOString(), komut: "sim-pin-kaldir",
          kuru: true, modem_ip: opts.host, ...k, kilit_acik: kaldirKilitAcik,
          yapilacak: k.kilit === "pin"
            ? "PIN kilidi kaldirilacak (TEK deneme) — onaylamak icin --uygula ekle"
            : kaldirKilitAcik === false
              ? "PIN kilidi ZATEN KAPALI — yapilacak is yok"
              : k.hazir ? "SIM acik; --uygula kilit sorgusunu KALICI kapatir"
              : `kilit durumu: ${k.durum} — mudahale edilmez`,
        };
      }
      // --zorla: "bu SIM'de daha once bir hak yanmis ama PIN'den eminim".
      // SON hakki zorla bile yakamaz (karar cekirdekte).
      return { zaman: new Date().toISOString(), komut: "sim-pin-kaldir",
        kuru: false, modem_ip: opts.host,
        ...(await simPinKaldir(opts, pin, { elleOnay: argv.includes("--zorla") })) };
    }
    // SADECE TEST ICIN: PIN kilidini ACAR. Uretim akisinda yeri yok — kilit
    // KALDIRMA yolunu gercek bir kilitli SIM'de sinamak icin var. Ayni
    // sozlesme: bayraksiz KURU, gercek deneme --uygula ister.
    case "sim-pin-kilitle": {
      const pin = bayrak("--pin");
      if (!argv.includes("--uygula")) {
        const k = await sonucOk(readSimLock(opts));
        // Kilit ZATEN acik mi? Sorgu (AT+CLCK="SC",2) hak HARCAMAZ. Bunu
        // sormadan "ACILACAK" demek yaniltiyordu: kilit acikken de ayni
        // cumle yaziliyordu (2026-08-28 canli goruldu).
        const acikMi = k.at_port
          ? parseClck((await atKomut({ ...opts, atPort: k.at_port }, 'AT+CLCK="SC",2')).cevap)
          : null;
        return { zaman: new Date().toISOString(), komut: "sim-pin-kilitle",
          kuru: true, modem_ip: opts.host, ...k, kilit_acik: acikMi,
          yapilacak: k.kilit === "pin"
            ? "SIM zaten kilitli — yapilacak is yok"
            : acikMi === true
              ? "PIN kilidi ZATEN ACIK — yapilacak is yok (etkisi sonraki acilista)"
              : k.hazir ? "PIN kilidi ACILACAK (TEK deneme). Etkisi SONRAKI ACILISTA:"
                + " modemi kapat-ac, SIM PIN soracak. Onaylamak icin --uygula ekle"
                : `kilit durumu: ${k.durum} — mudahale edilmez`,
        };
      }
      return { zaman: new Date().toISOString(), komut: "sim-pin-kilitle",
        kuru: false, modem_ip: opts.host,
        ...(await simPinKilitle(opts, pin, { elleOnay: argv.includes("--zorla") })) };
    }
    case "fark": {
      const [, once, sonra] = argv;
      if (!once || !sonra) {
        return { zaman: new Date().toISOString(), komut: "fark", ok: false,
          problems: [{ kod: "ARGS", severity: "error",
            message: "fark <once.json> <sonra.json> gerekli", check: "Iki nvram JSON dosyasi ver." }] };
      }
      return computeNvramDiff(farkNvramAl(once), farkNvramAl(sonra));
    }
    case "uygula": {
      const profilAd = bayrak("--profil") || "saha";
      const profil = PROFILES[profilAd];
      if (!profil) {
        return { zaman: new Date().toISOString(), komut: "uygula", ok: false,
          problems: [{ kod: "ARGS", severity: "error",
            message: `Bilinmeyen profil: ${profilAd}`,
            check: `Gecerli: ${Object.keys(PROFILES).join(", ")}` }] };
      }
      return applyProvisioning({
        ...opts,
        uygula: argv.includes("--uygula"),   // yoksa DRY-RUN (kuru)
        reboot: !argv.includes("--reboot-yok"),
        yeniHost: bayrak("--yeni-host"),
        yeniKaynakIp: bayrak("--yeni-kaynak"),
        olay: akisIzleyici(),
      }, profil);
    }
    case "olcum-elle": {
      // ELLE surecin kronometre sonucunu kaydeder — otomatik olcumlerle AYNI
      // dosyaya, tur:"elle" ile. Karsilastirma tabani boylece kayitli bir
      // olcum olur; komut satirinda tasinan bir sayi degil.
      const dk = Number(bayrak("--dk"));
      const snBayrak = Number(bayrak("--sn"));
      const toplamSn = Number.isFinite(snBayrak) && snBayrak > 0
        ? snBayrak
        : (Number.isFinite(dk) && dk > 0 ? Math.round(dk * 60) : null);
      if (!toplamSn) {
        return { zaman: new Date().toISOString(), komut: "olcum-elle", ok: false,
          problems: [{ kod: "ARGS", severity: "error",
            message: "Manual duration is required.",
            check: "Give it as --dk 15.5 (minutes) or --sn 930 (seconds)." }] };
      }
      const satir = {
        zaman: new Date().toISOString(),
        tur: "elle",
        durum: "elle_kurulum",
        ok: true,
        toplam_sn: toplamSn,
        kim: bayrak("--kim") || null,
        not: bayrak("--not") || null,
        // --beyan: bu sayi OLCULMEDI, soylendi. Rapor bunu BEYAN diye
        // etiketler; olculmus bir medyan gibi sunulmaz.
        beyan: argv.includes("--beyan"),
      };
      kayitYazici(bayrak("--kayit") || OLCUM_DOSYA, "olcum-elle")(satir);
      return { ...satir, komut: "olcum-elle", problems: [] };
    }
    case "olcum": {
      // Kaydedilmis calistirmalardan savunulabilir sayi uretir. Cihaza GITMEZ.
      // --elle-dk: elle surecin suresi (KARSILASTIRMA TABANI). Bu bir olcum ya
      // da beyandir; hangisi oldugunu --elle-kaynak ile ACIKCA soyle.
      const dosya = bayrak("--kayit") || OLCUM_DOSYA;
      let satirlar = [];
      try {
        satirlar = readFileSync(dosya, "utf8").split("\n")
          .filter((s) => s.trim())
          .map((s) => JSON.parse(s));
      } catch {
        return { zaman: new Date().toISOString(), komut: "olcum", ok: false,
          problems: [{ kod: "OLCUM_DOSYA_YOK", severity: "error",
            message: `Metric file not found or unreadable: ${dosya}`,
            check: "Run `npm start` (or `ricon.js hazirla`) a few times first;"
              + " each finished run appends one line." }] };
      }
      const elleDk = Number(bayrak("--elle-dk"));
      return summarizeMetrics(satirlar, {
        elleSn: Number.isFinite(elleDk) && elleDk > 0 ? elleDk * 60 : undefined,
        elleKaynak: bayrak("--elle-kaynak"),
        elleN: Number(bayrak("--elle-n")) || undefined,
        modemSayisi: Number(bayrak("--modem-sayisi")) || undefined,
      });
    }
    // Cekirdegin HERHANGI bir export'unu adiyla cagirir. Yeni bir yetenek
    // eklendiginde buraya `case` yazmak GEREKMEZ — src/index.js'e eklenen her
    // sey aninda terminalden erisilebilir olur. Karar/ayristirma saf ve
    // test edilebilir: src/cli/cagirici.js.
    case "calistir": {
      const ad = argv[1] && !argv[1].startsWith("-") ? argv[1] : null;
      const { bayraklar, konumsallar } = argvAyikla(argv.slice(ad ? 2 : 1));
      // opts'a karismayan CLI bayraklari: fonksiyona gitmemeli.
      const { saf, json, kaynak, ...fonksiyonBayraklari } = bayraklar;
      return cagir(cekirdek, ad, {
        opts: { host: opts.host, kaynakIp: opts.kaynakIp, kimlik: opts.kimlik,
          ilerle },
        bayraklar: fonksiyonBayraklari,
        konumsallar,
        saf: saf === true,
      });
    }
    case "hazirla": {
      const profilAd = bayrak("--profil") || "saha";
      const profil = PROFILES[profilAd];
      if (!profil) {
        return { zaman: new Date().toISOString(), komut: "hazirla", ok: false,
          problems: [{ kod: "ARGS", severity: "error",
            message: `Bilinmeyen profil: ${profilAd}`, check: `Gecerli: ${Object.keys(PROFILES).join(", ")}` }] };
      }
      const sahaHost = bayrak("--saha-host") || profil.nvram.lan_ipaddr || "5.5.5.1";
      const onek = (ip) => ip.split(".").slice(0, 3).join(".") + ".";
      // Fabrika oneki .env'deki MODEM_HOST'tan turer (varsayilan 192.168.1.1);
      // boylece host degistirilince on-kontrol de dogru alt agi arar.
      const on = pcPreflight(onek(opts.host), onek(sahaHost));
      if (!on.hazir) {
        return { zaman: new Date().toISOString(), komut: "hazirla", ok: false,
          durum: "pc_hazir_degil", problems: on.problems };
      }
      const hOpts = {
        fabrikaHost: opts.host, fabrikaKaynak: on.fabrikaKaynak,
        sahaHost, sahaKaynak: on.sahaKaynak,
        kimlik: opts.kimlik, profil,
        denemeler: Number(bayrak("--deneme")) || 3,
        // Internet dogrulamasi (SIM calisiyor mu). 0 = kapat.
        internetBekle: bayrak("--internet-bekle") !== undefined
          ? Number(bayrak("--internet-bekle")) : 150,
        kayit: kayitYazici(bayrak("--kayit") || KAYIT_DOSYA),
        telefonSor,          // dongu: her modem icin sorar
        ilerle,
        olay: akisIzleyici(),   // plan tablosu + adim sureleri
      };
      const olcumYaz = kayitYazici(bayrak("--olcum") || OLCUM_DOSYA, "olcum");
      const dongu = argv.includes("--dongu");
      if (dongu) {
        // Sabit --telefon dongude ANLAMSIZ (her cihazin SIM'i farkli);
        // numara her modemde o modemin SIM'inden okunuyor.
        return provisionLoop({
          ...hOpts,
          olcumKayit: (r) => olcumYaz(olcumSatiri(r, hOpts.olay.adimlar())),
          maxModem: Number(bayrak("--max")) || Infinity,
        });
      }
      // Tek modem: --telefon VERMEK ARTIK ZORUNLU DEGIL. Cekirdek numarayi
      // SIM'den okuyor (AT+CNUM); okuyamazsa telefonSor ile burayi cagirip
      // operatore soruyor. Verilirse operator bilerek eziyor; gecersizse
      // cekirdek MSISDN_INVALID der (sessizce yeniden sormaz).
      return olculerekHazirla(hOpts, { telefon: bayrak("--telefon") }, olcumYaz);
    }
    default: return null;
  }
}

const KOMUTLAR = new Set(["dogrula", "oku", "konsol", "sim",
  "degerlendir", "numara", "sim-kilit", "sim-pin-kaldir", "sim-pin-kilitle",
  "fark", "uygula", "hazirla", "calistir", "olcum", "olcum-elle"]);

async function main() {
  if (!komut || komut === "-h" || komut === "--help" || !KOMUTLAR.has(komut)) {
    process.stderr.write(
      "Kullanim: node --env-file=.env ricon.js <komut> [bayraklar]\n\n"
      + "  dogrula                      ortam/erisim teshisi\n"
      + "  oku                          HER SEYI cek (sistem+SIM+ayar+nvram)\n"
      + "  konsol [--nvram]             telnet root shell / tam nvram\n"
      + "  sim [--telefon 05xxxxxxxxx]  SIM/hucresel ozet (+MSISDN girisi)\n"
      + "  degerlendir                  cihaz durumu + NE EKSIK (numara dahil, ~5 sn)\n"
      + "         [--izle] [--tur N]    eksik giderilene kadar KENDI KENDINE tekrar bak\n"
      + "  numara                       SADECE SIM telefon numarasi (AT+CNUM)\n"
      + "  sim-kilit                    SADECE kilit durumu + KALAN HAK (hak harcamaz)\n"
      + "  sim-pin-kaldir --pin 1234    SIM PIN kilidini KALICI kaldir\n"
      + "         [--uygula]            bayraksiz KURU: yalniz durumu bildirir\n"
      + "         [--zorla]             hak yanmis SIM'de yine dene (PIN'den eminsen)\n"
      + "  sim-pin-kilitle --pin 1234   SADECE TEST: PIN kilidini AC (kilitli SIM uret)\n"
      + "         [--uygula]            bayraksiz KURU; etkisi sonraki acilista\n"
      + "  fark <A.json> <B.json>       iki nvram anlik goruntusu diff\n"
      + "  uygula [--uygula]            provizyon (bayraksiz KURU/dry-run)\n"
      + "         [--profil saha|fabrika] [--yeni-host ip] [--yeni-kaynak ip]\n"
      + "         [--reboot-yok]\n"
      + "  hazirla                      tak-calistir: algila->provizyon->dogrula\n"
      + "         [--telefon 05xx]      numara SIM'den okunur; bu bayrak EZER\n"
      + "         [--dongu]             cok modem: tak -> hazir -> cikar -> sonraki\n"
      + "         [--profil ad] [--saha-host ip] [--deneme N] [--max N]\n"
      + "         [--kayit <dosya>]     hazirlama defteri (data/hazirlanan.jsonl)\n"
      + "  calistir [<fonksiyon>]       cekirdegin HERHANGI bir fonksiyonunu cagir\n"
      + "         (adsiz)               cagrilabilir tum yuzeyi listeler\n"
      + "         [-- arg1 arg2]        `--` sonrasi konumsal arguman\n"
      + "         [--saf]               opts enjeksiyonunu kapat\n"
      + "  olcum-elle --dk 15.5         ELLE surecin kronometresini kaydet\n"
      + "         [--kim \"teknisyen A\"] [--not \"...\"]\n"
      + "  olcum                        kaydedilmis surelerden metrik ozeti (cihazsiz)\n"
      + "         [--modem-sayisi 400] [--kayit data/olcumler.jsonl]\n"
      + "         [--elle-dk 15] sadece kayitli elle olcum YOKSA (beyan tabani)\n\n"
      + "Ortak: --json <dosya> (ciktiyi kaydet) · --kaynak <dosya> (cihazsiz tekrar oynat)\n"
      + "       --host <ip> · --kaynak-ip <ip>  (.env'i ezer; modem o an neredeyse)\n",
    );
    // Yardim ISTEMEK hata degil -> 0. BILINMEYEN komut hatadir -> 1.
    // Eskiden `--help` de 1 donuyordu: betikte `ricon.js --help && ...`
    // zinciri sessizce kiriliyordu.
    const yardimIstendi = !komut || komut === "-h" || komut === "--help";
    return yardimIstendi ? 0 : 1;
  }

  const kaynak = bayrak("--kaynak");
  const rapor = kaynak
    ? JSON.parse(readFileSync(kaynak, "utf8"))
    : await komutuCalistir();

  const json = writeJson(rapor);
  process.stdout.write(json + "\n");
  process.stderr.write("\n" + summaryText(rapor) + "\n");

  const cikti = bayrak("--json");
  if (cikti) {
    writeFileSync(cikti, json, "utf8");
    process.stderr.write(`\nJSON yazildi: ${cikti}\n`);
  }
  return rapor.ok ? 0 : 1;
}

main().then((kod) => { if (kod !== null) process.exit(kod); }).catch((e) => {
  process.stderr.write(`Beklenmeyen hata: ${e?.stack || e}\n`);
  process.exit(1);
});
