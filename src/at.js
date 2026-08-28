// AT komut katmani — modulun kendisiyle konusma (telefon numarasi, SIM kilidi).
//
// nvram cihazin AYARLARINI tutar; SIM'in KENDI bilgisi (abone numarasi, PIN
// kilidi) orada yok. Ona ancak hucresel modulun AT arayuzunden ulasilir.
// Kanal ayni: telnet 5123 -> BusyBox kabuk -> /dev/ttyUSB* uzerinden AT.
//
// KRITIK TUZAK (kardes calisma RVM-Modem'de olculmus, biz de dogruladik):
// `echo "AT+CNUM" > /dev/ttyUSB0` + ayri `cat /dev/ttyUSB0` bu modemde
// CALISMAZ. Port her acilip kapandiginda DTR sinyali duser ve modul cevabi
// port kapanmadan yetistiremez. Cozum: portu TEK dosya tanimlayicisiyla
// okuma+yazma acik tutmak:
//     exec 3<>PORT; printf 'AT+CNUM\r' >&3; while read -t 3 l <&3; ...; exec 3<&-
// Komut sonu `\r` SART (`\n` yetmez). `ATL:` oneki gercek modul cevabini
// kabuk gurultusunden ayirir.
//
// AT PORTU: /dev/ttyUSB0 olculdu ve sabit. Cok portlu TARAMA bilerek YOK —
// gerekcesi AT_PORT tanimindaki notta.
//
// KAPSAM KARARI — USSD (*101#) yolu BILEREK YOK. Kardes calismada var ama
// GSM7 paketleme + UCS2 cozme ~150 satir ve bizim SIM'lerde CNUM zaten
// doluyor. Kanitlanmamis bir yedek icin o hacmi tasimiyoruz; CNUM bos gelirse
// `yontem: "yok"` dondurup ICCID bildiriyoruz (operator elle girer — bugun
// zaten oyle yapiyor). Ihtiyac cikarsa kardes calismadan alinir.

import { runConsole } from "./console.js";
import { normalizePhone } from "./sim.js";
import { problem } from "./problems.js";
import { pinDenemesiUygunMu, hakDurumu, PIN_TOPLAM_VARSAYILAN } from "./pin-karar.js";

export { PIN_TOPLAM_VARSAYILAN };

// AT portu. OLCULDU (2026-08-27 canli, Ricon S9922M44 + Quectel Q200AF):
// /dev/ttyUSB0 AT komutlarina OK donuyor ve numara 3 saniyede geliyor.
//
// TARAMA YOK — BILEREK. Once 5 aday portu yoklayan bir tarama yazdim; cihaz
// ara sira takildigi icin ya calisan portu olu saydi ya da 109 saniye yiyip
// basarisiz oldu. Spekulatif bir yetenek icin gercek yolu yavaslatmak ve
// kirilganlastirmak yanlisti. Farkli bir cihazda port farkliysa: cihazda
// `ls -la /dev/ttyUSB*` bakilir ve BURASI degistirilir (ya da opts.atPort
// verilir). Insan bir kez bakar, arac her seferinde 100 saniye harcamaz.
export const AT_PORT = "/dev/ttyUSB0";

// SIM/modul uzerinde DEGISIKLIK yapan AT komutlari. Salt-okunur modda
// reddedilir — nvram tarafindaki yazma kapisinin AT karsiligi.
// AT+CPIN= ve AT+CLCK= PIN denemesi harcar (3 yanlis -> PUK), o yuzden burada.
//
// CLCK ISTISNASI: bu komutun SORGU formu da `=` iceriyor ama masum —
//   AT+CLCK="SC",2         mode 2 = SORGU: "kilit acik mi?" Hicbir sey harcamaz.
//   AT+CLCK="SC",0,"1234"  mode 0 = kilidi KAPAT: parola ister, hak yakar.
// Ayrimi yapmayinca simPinKaldir'in DOGRULAMA adimi kendi kapisina takiliyor,
// bos cevap aliyor ve kilit gercekten kalksa bile "kaldirilamadi" diyordu.
const AT_CLCK_SORGU = /^AT\+CLCK=\s*"?[A-Z]+"?\s*,\s*2\s*$/i;
const AT_YAZAN = /^AT\+(CPIN|CLCK|CPWD|CFUN|CGDCONT|CMGS|CMGW)=|^AT&W|^ATZ|^AT\+CUSD=/i;

// Bu komut cihazda bir sey DEGISTIRIR mi (ya da PIN hakki harcar mi)?
// PURE: cihaz gerektirmez, test edilebilir.
export function atYazanMi(komut) {
  const k = String(komut ?? "").trim();
  if (AT_CLCK_SORGU.test(k)) return false;
  return AT_YAZAN.test(k);
}

// --- Saf ayristiricilar (cihaz GEREKTIRMEZ, test edilebilir) ---

// +CNUM: SIM'e yazili abone numarasi.
// Bicim: +CNUM: "alpha","+905350634756",145
// Doner: bizim kanonik bicimimizde (5xxxxxxxxx) ya da null. AYRI bir
// normalize fonksiyonu YAZMIYORUZ — normalizePhone tek dogru kaynak.
export function parseCnum(cevap) {
  if (!cevap) return null;
  const re = /\+CNUM:\s*(?:"[^"]*")?\s*,\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(cevap)) !== null) {
    const n = normalizePhone(m[1]);
    if (n) return n;
  }
  return null;
}

// +CPIN? : SIM kilit durumu. "READY" | "SIM PIN" | "SIM PUK" | ... | "UNKNOWN"
export function parseCpin(cevap) {
  if (!cevap) return "UNKNOWN";
  const m = cevap.match(/\+CPIN:\s*([A-Za-z0-9 ]+)/);
  return m ? m[1].trim().toUpperCase() : "UNKNOWN";
}

// +QPINC / +CPINC : kalan PIN/PUK deneme sayisi. Doner: {pin, puk} | null
// Quectel modulu (Q200AF) +QPINC kullaniyor; +CPINC standart yedek.
export function parsePinCounter(cevap) {
  if (!cevap) return null;
  const q = cevap.match(/\+QPINC:\s*"?SC"?\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (q) return { pin: Number(q[1]), puk: Number(q[2]) };
  const c = cevap.match(/\+CPINC:\s*(\d+),(\d+),(\d+),(\d+)/);
  if (c) return { pin: Number(c[1]), puk: Number(c[3]) };
  return null;
}

// +CLCK: PIN sorgusu ACIK mi? true=acik, false=kapali, null=okunamadi
export function parseClck(cevap) {
  if (!cevap) return null;
  const m = cevap.match(/\+CLCK:\s*([01])/);
  return m ? m[1] === "1" : null;
}

// +CCID / +ICCID : SIM seri numarasi. Sondaki dolgu F atilir.
export function parseCcid(cevap) {
  if (!cevap) return null;
  const m = cevap.match(/\+(?:C?CID|ICCID):\s*"?([0-9A-Fa-f]+)"?/)
    || cevap.match(/\b(\d{18,20}F?)\b/);
  return m ? m[1].replace(/[Ff]$/, "") : null;
}

// AT cevabi basarili mi? Modul komut sonunda OK ya da ERROR basar.
export const atTamam = (cevap) => /\bOK\b/.test(cevap || "") && !/\bERROR\b/i.test(cevap || "");

// Portu ACIK TUTAN kabuk komutunu uretir. Saf: test edilebilir.
export function atKabukKomutu(port, komut, okumaSn = 3) {
  return `exec 3<>${port}; printf '${komut}\\r' >&3; `
    + `while read -t ${okumaSn} l <&3; do echo "ATL:$l"; done; exec 3<&-`;
}

// DENENDI VE VAZGECILDI — portu komuttan once bosaltmak (`read -t 1` dongusu).
//
// Fikir: bayat cevap portta bekliyorsa gondermeden once yutulsun. OLCUM
// (2026-08-28, ayni sorgu 8'er kez) fayda GOSTERMEDI:
//     temizlemesiz 0/8 karisik · 24.9 sn
//     temizlemeli  1/8 karisik · 35.1 sn   (komut basina +1.3 sn)
// Sebebi de anlasilir: bayat cevap portu ACARKEN orada degil, biz OKURKEN
// geliyor — acilista bosaltmak onu yakalayamaz. Olculmus maliyeti olan,
// olculmemis faydasi olan mekanizmayi tasimiyoruz. Yerine gecen cozum:
// karismayi TESPIT edip yeniden okumak (atKarismisMi + atSorgu).

// Cevap KARISMIS mi? Tek komut TEK sonlandirici doner (OK ya da ERROR).
// Birden fazlasi, portta baska bir komutun cevabinin kaldigini gosterir —
// yani elimizdeki metin hangi komuta ait, emin olamayiz.
export function atKarismisMi(cevap) {
  const sonlandirici = String(cevap || "").match(/^\s*(OK|ERROR|\+CME ERROR.*)\s*$/gm) || [];
  return sonlandirici.length > 1;
}

// Kabuk ciktisindan yalnizca modul cevabini ayiklar (ATL: onekli satirlar).
export function atCevabiAyikla(ham) {
  return String(ham || "").split(/\r?\n/)
    .filter((s) => s.includes("ATL:"))
    .map((s) => s.slice(s.indexOf("ATL:") + 4).trim())
    .join("\n");
}

// --- Konsol uzerinden AT (I/O) ---

// Tek AT komutu gonderir. Doner: { ok, cevap, problems } (throw ETMEZ)
//
// NOT: kabuk komutu `3<>/dev/ttyUSB0` icerdigi icin console.js'in yazma
// kapisina takilir (dosyaya yonlendirme gorunuyor). Cihaz dugumunu ACMAK
// icin bu kacinilmaz, o yuzden yazmaIzni veriliyor — ama AT SEVIYESINDE
// kendi kapimiz var (AT_YAZAN): PIN harcayan komutlar acik izin olmadan
// gecmiyor.
export async function atKomut(opts, komut, { okumaSn = 3, yazmaIzni = false,
  denemeler, zamanAsimiMs } = {}) {
  if (!yazmaIzni && atYazanMi(komut)) {
    return { ok: false, cevap: "", problems: [problem("WRITE_BLOCKED_READONLY", `AT: ${komut}`)] };
  }
  const port = opts.atPort || AT_PORT;
  const kabuk = atKabukKomutu(port, komut, okumaSn);
  const r = await runConsole(
    { ...opts, yazmaIzni: true, denemeler,
      zamanAsimiMs: zamanAsimiMs ?? (20000 + okumaSn * 1000) },
    ["stty -echo 2>/dev/null", kabuk],
  );
  if (!r.ok) return { ok: false, cevap: "", problems: r.problems };
  return { ok: true, cevap: atCevabiAyikla(r.ciktilar?.[kabuk]), problems: [] };
}

// AT portu cevap veriyor mu? Doner: { port, problems }
export async function atPortBul(opts) {
  const port = opts.atPort || AT_PORT;
  const r = await atKomut({ ...opts, atPort: port }, "AT", { okumaSn: 2 });
  if (r.ok && atTamam(r.cevap)) return { port, problems: [] };
  return { port: null, problems: r.problems.length ? r.problems : [problem("AT_PORT_YOK", port)] };
}

// SIM'in TELEFON NUMARASINI okur. Bugune kadar operator elle giriyordu;
// numara SIM'de yaziliysa (EF_MSISDN) buradan okunabiliyor.
// Doner: { telefon, yontem: "cnum"|"yok", iccid, at_port, problems }
export async function readMsisdn(opts) {
  let port = opts.atPort ?? null;
  let cnum = null;
  // Olculmus porta DOGRUDAN gercek komutu gonderiyoruz — ayrica bir yoklama
  // turu yapmiyoruz. Cevap hic AT gibi degilse (ne OK ne +CNUM) portu bir kez
  // dogrulayip net bir hata veriyoruz.
  if (!port) {
    port = AT_PORT;
    cnum = await atKomut({ ...opts, atPort: port }, "AT+CNUM");
    if (!atTamam(cnum.cevap) && !/\+CNUM/.test(cnum.cevap)) {
      const bulunan = await atPortBul(opts);
      if (!bulunan.port) {
        return { telefon: null, yontem: "yok", iccid: null, at_port: null,
          problems: bulunan.problems };
      }
      port = bulunan.port;
      cnum = null;
    }
  }
  const atOpts = { ...opts, atPort: port };
  if (!cnum) cnum = await atKomut(atOpts, "AT+CNUM");
  const telefon = parseCnum(cnum.cevap);
  if (telefon) {
    return { telefon, yontem: "cnum", iccid: null, at_port: port, problems: [] };
  }
  // CNUM bos: numara SIM'e yazilmamis. ICCID'yi bildirip operatore birakiyoruz.
  const ccid = await atKomut(atOpts, "AT+CCID");
  return {
    telefon: null, yontem: "yok", iccid: parseCcid(ccid.cevap), at_port: port,
    problems: [problem("MSISDN_CIHAZDA_YOK")],
  };
}

// PURE: bu SIM'de PIN kilidi kaldirmaya izin var mi? Kural PAYLASILAN
// modulde (pin-karar.js) — nvram yolu ve internet-sonrasi deneme yolu da
// ayni yere soruyor. Burada yalniz YOLA OZGU kapi var: SIM takili mi.
//
// Doner: { izin, sebep: kod|null, problems: [] }
export function simKilitKaldirmaKarari(kilit = {}, pin, { elleOnay = false } = {}) {
  const yol = simYoluAcik(kilit);
  if (yol) return { izin: false, sebep: yol.sebep, problems: yol.problems };
  const k = pinDenemesiUygunMu(kilit, pin, { elleOnay });
  return { izin: k.uygun, sebep: k.sebep, problems: k.problems };
}

// PURE: PIN'i BILMEDEN "bu SIM uygun mu?" — arayuz dugmeyi buna gore acar.
export function simKilidiUygunMu(kilit = {}, { elleOnay = false } = {}) {
  return simYoluAcik(kilit) ?? hakDurumu(kilit, { elleOnay });
}

// YOLA OZGU kapi: AT ile kilide dokunmak icin SIM ya kilitli ya hazir olmali.
// Uygunsa null doner (kapi acik), degilse red nesnesi.
function simYoluAcik(kilit) {
  if (kilit.kilit === "puk") {
    return { uygun: false, sebep: "SIM_PUK_LOCKED",
      problems: [problem("SIM_PUK_LOCKED", kilit.puk_kalan)] };
  }
  if (kilit.kilit !== "pin" && !kilit.hazir) {
    return { uygun: false, sebep: "SIM_MISSING",
      problems: [problem("SIM_MISSING", kilit.durum)] };
  }
  return null;
}

// SALT OKUNUR sorgu — cevap KARISMISSA bir kez yeniden okur.
//
// Okuma bedava ve PIN harcamaz; kararin girdisi olan bir sorguda karisik
// veriyle devam etmektense tekrar sormak dogru. Karisma sebebi: onceki
// komutun cevabi gec gelip bizim okuma penceremize dusuyor.
async function atSorgu(atOpts, komut, secenek = {}) {
  const ilk = await atKomut(atOpts, komut, secenek);
  if (!atKarismisMi(ilk.cevap)) return ilk;
  return atKomut(atOpts, komut, secenek);
}

// Kilit sorgusu (AT+CLCK="SC",2). Parola istemez, hak HARCAMAZ.
// Doner: true (acik) | false (kapali) | null (BILMIYORUZ)
//
// null iki halde doner: cevap okunamadi ya da cevap KARISMIS. Ikisinde de
// "bilmiyoruz" demek dogru cevap — cagiran buna gore PIN gondermemeyi secer.
async function kilitSorgusu(atOpts) {
  const r = await atSorgu(atOpts, 'AT+CLCK="SC",2');
  if (atKarismisMi(r.cevap)) return null;   // tekrar okundu, hala karisik
  return parseClck(r.cevap);
}

// SIM PIN KILIDINI KALICI OLARAK KALDIRIR — projenin hedefi tam bu.
//
// NEDEN NVRAM'A PIN YAZMAKTAN IYI: nvram yolu SIM'i PIN'li BIRAKIR ve parolayi
// sahadaki cihazda DUZ METIN tutar; SIM baska cihaza takilinca yine kilitli.
// Bu yol SIM'in KENDISINDEN kilidi kaldirir: saklanacak sir kalmaz, sizacak
// sey kalmaz ve SIM her cihazda acik gelir. Telefona da gerek yok.
//
// ⚠ TEHLIKE: yanlis PIN bir deneme yakar; UC yanlis -> SIM PUK'a kilitlenir.
// Korumalar (nvram yolundakilerin AYNISI, tek yerde):
//   1) bicim: 4-8 hane rakam, degilse cihaza HIC GITMEZ
//   2) once KALAN HAK okunur; SON HAK asla otomatik yakilmaz
//   3) TEK deneme; yanlissa TEKRAR DENEMEZ
//   4) PIN hicbir yere yazilmaz (log/olay/defter) — yalniz bellekte gecer
//
// Doner: { ok, acildi, kilit_kaldirildi, durum, pin_kalan, problems }
export async function simPinKaldir(opts, pin, { elleOnay = false, kaliciKapat = true } = {}) {
  const rapor = { ok: false, acildi: false, kilit_kaldirildi: false,
    durum: null, pin_kalan: null, problems: [] };
  // (1) Bicim — bozuk PIN garantili bosa harcanmis deneme. Cihaza HIC gitmez.
  if (!/^\d{4,8}$/.test(String(pin ?? ""))) {
    rapor.problems.push(problem("PIN_INVALID"));
    return rapor;
  }
  const kilit = await readSimLock(opts);
  rapor.durum = kilit.durum;
  rapor.pin_kalan = kilit.pin_kalan;
  const atOpts = { ...opts, atPort: kilit.at_port };

  // (2) SIM ZATEN ACIK: kilit gercekten hala acikta mi? Bunu SORGUYLA
  // ogreniyoruz (AT+CLCK="SC",2 — parola istemez, hak harcamaz). Kilit
  // zaten kapaliysa YAPILACAK IS YOK: PIN'i hic gondermiyoruz. Onceki hal
  // her cagriyi bir parola sunumuna ceviriyordu; PIN'siz SIM'de bu bedava
  // bir risk ve gereksiz bir tur.
  if (kilit.hazir) {
    rapor.ok = true;
    rapor.acildi = true;
    if (!kaliciKapat) return rapor;
    const acikMi = await kilitSorgusu(atOpts);
    if (acikMi === false) {
      rapor.kilit_kaldirildi = true;   // istenen durum: kilit kapali
      return rapor;
    }
    // SORGU OKUNAMADI (null): kilidin acik mi kapali mi oldugunu BILMIYORUZ.
    // Bilmeden devam etmek PIN gondermek demek ve yanlis PIN bir hak yakar.
    // Bilmedigimiz icin harcamayiz — elleOnay ile gecilebilir.
    if (acikMi === null && !elleOnay) {
      rapor.problems.push(problem("KILIT_DURUMU_OKUNAMADI"));
      return rapor;
    }
  }

  // (3) KARAR — PURE, test edilmis, tek yer (bkz. simKilitKaldirmaKarari):
  // PUK / SIM yok / yanmis hak / son hak burada reddedilir. Arayuz de CLI de
  // ayni cevaba bakar; burasi gecilmeden cihazda PIN denenmez.
  const karar = simKilitKaldirmaKarari(kilit, pin, { elleOnay });
  if (!karar.izin) {
    rapor.problems.push(...karar.problems);
    return rapor;
  }
  rapor.problems.push(...karar.problems);   // izin verildi; varsa UYARI tasinir

  // (4) TEK deneme — SIM kilitliyse ac.
  if (!kilit.hazir) {
    await atKomut(atOpts, "AT+CMEE=2", { yazmaIzni: true });   // hatalar metin gelsin
    const r = await atKomut(atOpts, `AT+CPIN="${pin}"`, { yazmaIzni: true, okumaSn: 5 });
    if (!atTamam(r.cevap)) {
      rapor.problems.push(problem("PIN_REJECTED", kilit.pin_kalan));
      return rapor;   // TEKRAR DENEMEZ
    }
    rapor.ok = true;
    rapor.acildi = true;
  }

  if (!kaliciKapat) return rapor;

  // (5) Kilidi KALICI kapat + dogrula. Bu adim basarisiz olsa da SIM acik kaldi.
  const kapat = await atKomut(atOpts, `AT+CLCK="SC",0,"${pin}"`, { yazmaIzni: true, okumaSn: 5 });
  if (!atTamam(kapat.cevap)) {
    rapor.problems.push(problem("PIN_LOCK_NOT_DISABLED"));
    return rapor;
  }
  const dogrula = await kilitSorgusu(atOpts);
  rapor.kilit_kaldirildi = dogrula === false;
  if (!rapor.kilit_kaldirildi) rapor.problems.push(problem("PIN_LOCK_NOT_DISABLED"));
  return rapor;
}

// SIM PIN KILIDINI ACAR (kurar) — simPinKaldir'in TERSI.
//
// NEDEN VAR: uretimde istenen sey PIN'siz SIM. Bu fonksiyon urunun akisinda
// KULLANILMAZ; kilit KALDIRMA yolunu gercek bir kilitli SIM'de sinamak icin
// var. Elimizdeki SIM'ler PIN'siz geliyor, yani test durumunu kendimiz
// uretmek zorundayiz.
//
// ⚠ AYNI RISK: AT+CLCK="SC",1,"<pin>" PIN'i DOGRULAR. Yanlis PIN bir deneme
// yakar, uc yanlis PUK demek. Bu yuzden korumalar birebir ayni ve AYNI PURE
// karardan geliyor (simKilidiUygunMu): son hak yakilmaz, daha once hak
// yanmissa OTOMATIK yol denemez (insan yine deneyebilir).
//
// NOT: kilit SONRAKI ACILISTA sorulur. Etkisini gormek icin modem kapat-ac.
// Doner: { ok, kilit_acik, zaten, durum, pin_kalan, problems }
export async function simPinKilitle(opts, pin, { elleOnay = false } = {}) {
  const rapor = { ok: false, kilit_acik: false, zaten: false,
    durum: null, pin_kalan: null, problems: [] };
  if (!/^\d{4,8}$/.test(String(pin ?? ""))) {
    rapor.problems.push(problem("PIN_INVALID"));
    return rapor;
  }
  const kilit = await readSimLock(opts);
  rapor.durum = kilit.durum;
  rapor.pin_kalan = kilit.pin_kalan;
  const atOpts = { ...opts, atPort: kilit.at_port };

  // SIM su an KILITLI ise kilit zaten kurulu — yapacak is yok, PIN gonderilmez.
  if (kilit.kilit === "pin") {
    rapor.ok = true;
    rapor.kilit_acik = true;
    rapor.zaten = true;
    return rapor;
  }
  // Acik SIM: kilit sorgusu ZATEN 1 mi? (sorgu hak harcamaz)
  if (kilit.hazir) {
    const acikMi = await kilitSorgusu(atOpts);
    if (acikMi === true) {
      rapor.ok = true;
      rapor.kilit_acik = true;
      rapor.zaten = true;
      return rapor;
    }
    // SORGU OKUNAMADI: durumu bilmeden PIN gondermek bir hak riske atmaktir.
    if (acikMi === null && !elleOnay) {
      rapor.problems.push(problem("KILIT_DURUMU_OKUNAMADI"));
      return rapor;
    }
  }

  const karar = simKilidiUygunMu(kilit, { elleOnay });
  rapor.problems.push(...karar.problems);
  if (!karar.uygun) return rapor;

  await atKomut(atOpts, "AT+CMEE=2", { yazmaIzni: true });
  const ac = await atKomut(atOpts, `AT+CLCK="SC",1,"${pin}"`, { yazmaIzni: true, okumaSn: 5 });
  if (!atTamam(ac.cevap)) {
    rapor.problems.push(problem("PIN_REJECTED", kilit.pin_kalan));
    return rapor;   // TEKRAR DENEMEZ
  }
  rapor.ok = true;
  rapor.kilit_acik = (await kilitSorgusu(atOpts)) === true;
  if (!rapor.kilit_acik) rapor.problems.push(problem("PIN_LOCK_NOT_ENABLED"));
  return rapor;
}

// SIM kilit durumunu MODULDEN okur (web sayfasindan degil): kalan PIN/PUK
// hakkini da verir. Doner: { durum, hazir, pin_kalan, puk_kalan, problems }
export async function readSimLock(opts) {
  const { port, problems: portSorun } = opts.atPort
    ? { port: opts.atPort, problems: [] } : await atPortBul(opts);
  if (!port) return { durum: "UNKNOWN", hazir: false, pin_kalan: null, puk_kalan: null, problems: portSorun };

  const atOpts = { ...opts, atPort: port };
  // Kilit durumu ve kalan hak, PIN harcama kararinin GIRDISI — temiz portta
  // okunur, karisan cevaptan karar cikarilmaz.
  const durum = parseCpin((await atSorgu(atOpts, "AT+CPIN?")).cevap);
  let sayac = null;
  for (const komut of ['AT+QPINC="SC"', "AT+CPINC"]) {
    sayac = parsePinCounter((await atSorgu(atOpts, komut)).cevap);
    if (sayac) break;
  }
  return {
    durum,
    hazir: durum === "READY",
    kilit: durum === "SIM PIN" ? "pin" : durum.includes("PUK") ? "puk" : null,
    pin_kalan: sayac?.pin ?? null,
    puk_kalan: sayac?.puk ?? null,
    at_port: port,
    problems: [],
  };
}
