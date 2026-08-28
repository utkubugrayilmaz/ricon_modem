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
// `method: "none"` dondurup ICCID bildiriyoruz (operator elle girer — bugun
// zaten oyle yapiyor). Ihtiyac cikarsa kardes calismadan alinir.

import { runConsole } from "./console.js";
import { normalizePhone } from "./sim.js";
import { problem } from "./problems.js";
import { canSpendPinAttempt, attemptBudget, PIN_TOTAL_DEFAULT } from "./pin-karar.js";

export { PIN_TOTAL_DEFAULT };

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
const AT_CLCK_QUERY = /^AT\+CLCK=\s*"?[A-Z]+"?\s*,\s*2\s*$/i;
const AT_WRITE_PATTERN = /^AT\+(CPIN|CLCK|CPWD|CFUN|CGDCONT|CMGS|CMGW)=|^AT&W|^ATZ|^AT\+CUSD=/i;

// Bu komut cihazda bir sey DEGISTIRIR mi (ya da PIN hakki harcar mi)?
// PURE: cihaz gerektirmez, test edilebilir.
export function isAtWriteCommand(command) {
  const k = String(command ?? "").trim();
  if (AT_CLCK_QUERY.test(k)) return false;
  return AT_WRITE_PATTERN.test(k);
}

// --- Saf ayristiricilar (cihaz GEREKTIRMEZ, test edilebilir) ---

// +CNUM: SIM'e yazili abone numarasi.
// Bicim: +CNUM: "alpha","+905350634756",145
// Doner: bizim kanonik bicimimizde (5xxxxxxxxx) ya da null. AYRI bir
// normalize fonksiyonu YAZMIYORUZ — normalizePhone tek dogru kaynak.
export function parseCnum(response) {
  if (!response) return null;
  const re = /\+CNUM:\s*(?:"[^"]*")?\s*,\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(response)) !== null) {
    const n = normalizePhone(m[1]);
    if (n) return n;
  }
  return null;
}

// +CPIN? : SIM kilit durumu. "READY" | "SIM PIN" | "SIM PUK" | ... | "UNKNOWN"
export function parseCpin(response) {
  if (!response) return "UNKNOWN";
  const m = response.match(/\+CPIN:\s*([A-Za-z0-9 ]+)/);
  return m ? m[1].trim().toUpperCase() : "UNKNOWN";
}

// +QPINC / +CPINC : kalan PIN/PUK deneme sayisi. Doner: {pin, puk} | null
// Quectel modulu (Q200AF) +QPINC kullaniyor; +CPINC standart yedek.
export function parsePinCounter(response) {
  if (!response) return null;
  const q = response.match(/\+QPINC:\s*"?SC"?\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (q) return { pin: Number(q[1]), puk: Number(q[2]) };
  const c = response.match(/\+CPINC:\s*(\d+),(\d+),(\d+),(\d+)/);
  if (c) return { pin: Number(c[1]), puk: Number(c[3]) };
  return null;
}

// +CLCK: PIN sorgusu ACIK mi? true=acik, false=kapali, null=okunamadi
export function parseClck(response) {
  if (!response) return null;
  const m = response.match(/\+CLCK:\s*([01])/);
  return m ? m[1] === "1" : null;
}

// +CCID / +ICCID : SIM seri numarasi. Sondaki dolgu F atilir.
export function parseCcid(response) {
  if (!response) return null;
  const m = response.match(/\+(?:C?CID|ICCID):\s*"?([0-9A-Fa-f]+)"?/)
    || response.match(/\b(\d{18,20}F?)\b/);
  return m ? m[1].replace(/[Ff]$/, "") : null;
}

// AT cevabi basarili mi? Modul komut sonunda OK ya da ERROR basar.
export const atOk = (response) => /\bOK\b/.test(response || "") && !/\bERROR\b/i.test(response || "");

// Portu ACIK TUTAN kabuk komutunu uretir. Saf: test edilebilir.
export function atShellCommand(port, command, readSec = 3) {
  return `exec 3<>${port}; printf '${command}\\r' >&3; `
    + `while read -t ${readSec} l <&3; do echo "ATL:$l"; done; exec 3<&-`;
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
export function isAtResponseMixed(response) {
  const terminator = String(response || "").match(/^\s*(OK|ERROR|\+CME ERROR.*)\s*$/gm) || [];
  return terminator.length > 1;
}

// Kabuk ciktisindan yalnizca modul cevabini ayiklar (ATL: onekli satirlar).
export function extractAtResponse(raw) {
  return String(raw || "").split(/\r?\n/)
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
export async function atCommand(options, command, { readSec = 3, allowWrite = false,
  attempts, timeoutMs } = {}) {
  if (!allowWrite && isAtWriteCommand(command)) {
    return { ok: false, response: "", problems: [problem("WRITE_BLOCKED_READONLY", `AT: ${command}`)] };
  }
  const port = options.atPort || AT_PORT;
  const shell = atShellCommand(port, command, readSec);
  const r = await runConsole(
    { ...options, allowWrite: true, attempts,
      timeoutMs: timeoutMs ?? (20000 + readSec * 1000) },
    ["stty -echo 2>/dev/null", shell],
  );
  if (!r.ok) return { ok: false, response: "", problems: r.problems };
  return { ok: true, response: extractAtResponse(r.outputs?.[shell]), problems: [] };
}

// AT portu cevap veriyor mu? Doner: { port, problems }
export async function findAtPort(options) {
  const port = options.atPort || AT_PORT;
  const r = await atCommand({ ...options, atPort: port }, "AT", { readSec: 2 });
  if (r.ok && atOk(r.response)) return { port, problems: [] };
  return { port: null, problems: r.problems.length ? r.problems : [problem("AT_PORT_NOT_FOUND", port)] };
}

// SIM'in TELEFON NUMARASINI okur. Bugune kadar operator elle giriyordu;
// numara SIM'de yaziliysa (EF_MSISDN) buradan okunabiliyor.
// Doner: { telefon, method: "cnum"|"none", iccid, atPort, problems }
export async function readMsisdn(options) {
  let port = options.atPort ?? null;
  let cnum = null;
  // Olculmus porta DOGRUDAN gercek komutu gonderiyoruz — ayrica bir yoklama
  // turu yapmiyoruz. Cevap hic AT gibi degilse (ne OK ne +CNUM) portu bir kez
  // dogrulayip net bir hata veriyoruz.
  if (!port) {
    port = AT_PORT;
    cnum = await atCommand({ ...options, atPort: port }, "AT+CNUM");
    if (!atOk(cnum.response) && !/\+CNUM/.test(cnum.response)) {
      const found = await findAtPort(options);
      if (!found.port) {
        return { phone: null, method: "none", iccid: null, atPort: null,
          problems: found.problems };
      }
      port = found.port;
      cnum = null;
    }
  }
  const atOptions = { ...options, atPort: port };
  if (!cnum) cnum = await atCommand(atOptions, "AT+CNUM");
  const phone = parseCnum(cnum.response);
  if (phone) {
    return { phone, method: "cnum", iccid: null, atPort: port, problems: [] };
  }
  // CNUM bos: numara SIM'e yazilmamis. ICCID'yi bildirip operatore birakiyoruz.
  const ccid = await atCommand(atOptions, "AT+CCID");
  return {
    phone: null, method: "none", iccid: parseCcid(ccid.response), atPort: port,
    problems: [problem("MSISDN_NOT_ON_SIM")],
  };
}

// PURE: bu SIM'de PIN kilidi kaldirmaya izin var mi? Kural PAYLASILAN
// modulde (pin-karar.js) — nvram yolu ve internet-sonrasi deneme yolu da
// ayni yere soruyor. Burada yalniz YOLA OZGU kapi var: SIM takili mi.
//
// Doner: { izin, sebep: kod|null, problems: [] }
export function simUnlockDecision(lock = {}, pin, { humanApproved = false } = {}) {
  const path = simPathOpen(lock);
  if (path) return { allow: false, reason: path.reason, problems: path.problems };
  const k = canSpendPinAttempt(lock, pin, { humanApproved });
  return { allow: k.eligible, reason: k.reason, problems: k.problems };
}

// PURE: PIN'i BILMEDEN "bu SIM uygun mu?" — arayuz dugmeyi buna gore acar.
export function isSimLockEligible(lock = {}, { humanApproved = false } = {}) {
  return simPathOpen(lock) ?? attemptBudget(lock, { humanApproved });
}

// YOLA OZGU kapi: AT ile kilide dokunmak icin SIM ya kilitli ya hazir olmali.
// Uygunsa null doner (kapi acik), degilse red nesnesi.
function simPathOpen(lock) {
  if (lock.lock === "puk") {
    return { eligible: false, reason: "SIM_PUK_LOCKED",
      problems: [problem("SIM_PUK_LOCKED", lock.pukRemaining)] };
  }
  if (lock.lock !== "pin" && !lock.ready) {
    return { eligible: false, reason: "SIM_MISSING",
      problems: [problem("SIM_MISSING", lock.status)] };
  }
  return null;
}

// SALT OKUNUR sorgu — cevap KARISMISSA bir kez yeniden okur.
//
// Okuma bedava ve PIN harcamaz; kararin girdisi olan bir sorguda karisik
// veriyle devam etmektense tekrar sormak dogru. Karisma sebebi: onceki
// komutun cevabi gec gelip bizim okuma penceremize dusuyor.
async function atQuery(atOptions, command, options = {}) {
  const first = await atCommand(atOptions, command, options);
  if (!isAtResponseMixed(first.response)) return first;
  return atCommand(atOptions, command, options);
}

// Kilit sorgusu (AT+CLCK="SC",2). Parola istemez, hak HARCAMAZ.
// Doner: true (acik) | false (kapali) | null (BILMIYORUZ)
//
// null iki halde doner: cevap okunamadi ya da cevap KARISMIS. Ikisinde de
// "bilmiyoruz" demek dogru cevap — cagiran buna gore PIN gondermemeyi secer.
async function readLockState(atOptions) {
  const r = await atQuery(atOptions, 'AT+CLCK="SC",2');
  if (isAtResponseMixed(r.response)) return null;   // tekrar okundu, hala karisik
  return parseClck(r.response);
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
export async function disableSimPin(options, pin, { humanApproved = false, kaliciKapat = true } = {}) {
  const report = { ok: false, opened: false, lockRemoved: false,
    status: null, pinRemaining: null, problems: [] };
  // (1) Bicim — bozuk PIN garantili bosa harcanmis deneme. Cihaza HIC gitmez.
  if (!/^\d{4,8}$/.test(String(pin ?? ""))) {
    report.problems.push(problem("PIN_INVALID"));
    return report;
  }
  const lock = await readSimLock(options);
  report.status = lock.status;
  report.pinRemaining = lock.pinRemaining;
  const atOptions = { ...options, atPort: lock.atPort };

  // (2) SIM ZATEN ACIK: kilit gercekten hala acikta mi? Bunu SORGUYLA
  // ogreniyoruz (AT+CLCK="SC",2 — parola istemez, hak harcamaz). Kilit
  // zaten kapaliysa YAPILACAK IS YOK: PIN'i hic gondermiyoruz. Onceki hal
  // her cagriyi bir parola sunumuna ceviriyordu; PIN'siz SIM'de bu bedava
  // bir risk ve gereksiz bir tur.
  if (lock.ready) {
    report.ok = true;
    report.opened = true;
    if (!kaliciKapat) return report;
    const isEnabled = await readLockState(atOptions);
    if (isEnabled === false) {
      report.lockRemoved = true;   // istenen durum: kilit kapali
      return report;
    }
    // SORGU OKUNAMADI (null): kilidin acik mi kapali mi oldugunu BILMIYORUZ.
    // Bilmeden devam etmek PIN gondermek demek ve yanlis PIN bir hak yakar.
    // Bilmedigimiz icin harcamayiz — elleOnay ile gecilebilir.
    if (isEnabled === null && !humanApproved) {
      report.problems.push(problem("LOCK_STATE_UNKNOWN"));
      return report;
    }
  }

  // (3) KARAR — PURE, test edilmis, tek yer (bkz. simKilitKaldirmaKarari):
  // PUK / SIM yok / yanmis hak / son hak burada reddedilir. Arayuz de CLI de
  // ayni cevaba bakar; burasi gecilmeden cihazda PIN denenmez.
  const karar = simUnlockDecision(lock, pin, { humanApproved });
  if (!karar.allow) {
    report.problems.push(...karar.problems);
    return report;
  }
  report.problems.push(...karar.problems);   // izin verildi; varsa UYARI tasinir

  // (4) TEK deneme — SIM kilitliyse ac.
  if (!lock.ready) {
    await atCommand(atOptions, "AT+CMEE=2", { allowWrite: true });   // hatalar metin gelsin
    const r = await atCommand(atOptions, `AT+CPIN="${pin}"`, { allowWrite: true, readSec: 5 });
    if (!atOk(r.response)) {
      report.problems.push(problem("PIN_REJECTED", lock.pinRemaining));
      return report;   // TEKRAR DENEMEZ
    }
    report.ok = true;
    report.opened = true;
  }

  if (!kaliciKapat) return report;

  // (5) Kilidi KALICI kapat + dogrula. Bu adim basarisiz olsa da SIM acik kaldi.
  const close = await atCommand(atOptions, `AT+CLCK="SC",0,"${pin}"`, { allowWrite: true, readSec: 5 });
  if (!atOk(close.response)) {
    report.problems.push(problem("PIN_LOCK_NOT_DISABLED"));
    return report;
  }
  const verify = await readLockState(atOptions);
  report.lockRemoved = verify === false;
  if (!report.lockRemoved) report.problems.push(problem("PIN_LOCK_NOT_DISABLED"));
  return report;
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
export async function enableSimPin(options, pin, { humanApproved = false } = {}) {
  const report = { ok: false, lockEnabled: false, zaten: false,
    status: null, pinRemaining: null, problems: [] };
  if (!/^\d{4,8}$/.test(String(pin ?? ""))) {
    report.problems.push(problem("PIN_INVALID"));
    return report;
  }
  const lock = await readSimLock(options);
  report.status = lock.status;
  report.pinRemaining = lock.pinRemaining;
  const atOptions = { ...options, atPort: lock.atPort };

  // SIM su an KILITLI ise kilit zaten kurulu — yapacak is yok, PIN gonderilmez.
  if (lock.lock === "pin") {
    report.ok = true;
    report.lockEnabled = true;
    report.zaten = true;
    return report;
  }
  // Acik SIM: kilit sorgusu ZATEN 1 mi? (sorgu hak harcamaz)
  if (lock.ready) {
    const isEnabled = await readLockState(atOptions);
    if (isEnabled === true) {
      report.ok = true;
      report.lockEnabled = true;
      report.zaten = true;
      return report;
    }
    // SORGU OKUNAMADI: durumu bilmeden PIN gondermek bir hak riske atmaktir.
    if (isEnabled === null && !humanApproved) {
      report.problems.push(problem("LOCK_STATE_UNKNOWN"));
      return report;
    }
  }

  const karar = isSimLockEligible(lock, { humanApproved });
  report.problems.push(...karar.problems);
  if (!karar.eligible) return report;

  await atCommand(atOptions, "AT+CMEE=2", { allowWrite: true });
  const ac = await atCommand(atOptions, `AT+CLCK="SC",1,"${pin}"`, { allowWrite: true, readSec: 5 });
  if (!atOk(ac.response)) {
    report.problems.push(problem("PIN_REJECTED", lock.pinRemaining));
    return report;   // TEKRAR DENEMEZ
  }
  report.ok = true;
  report.lockEnabled = (await readLockState(atOptions)) === true;
  if (!report.lockEnabled) report.problems.push(problem("PIN_LOCK_NOT_ENABLED"));
  return report;
}

// SIM kilit durumunu MODULDEN okur (web sayfasindan degil): kalan PIN/PUK
// hakkini da verir. Doner: { durum, hazir, pin_kalan, puk_kalan, problems }
export async function readSimLock(options) {
  const { port, problems: portProblems } = options.atPort
    ? { port: options.atPort, problems: [] } : await findAtPort(options);
  if (!port) return { status: "UNKNOWN", ready: false, pinRemaining: null, pukRemaining: null, problems: portProblems };

  const atOptions = { ...options, atPort: port };
  // Kilit durumu ve kalan hak, PIN harcama kararinin GIRDISI — temiz portta
  // okunur, karisan cevaptan karar cikarilmaz.
  const status = parseCpin((await atQuery(atOptions, "AT+CPIN?")).response);
  let counter = null;
  for (const command of ['AT+QPINC="SC"', "AT+CPINC"]) {
    counter = parsePinCounter((await atQuery(atOptions, command)).response);
    if (counter) break;
  }
  return {
    status,
    ready: status === "READY",
    lock: status === "SIM PIN" ? "pin" : status.includes("PUK") ? "puk" : null,
    pinRemaining: counter?.pin ?? null,
    pukRemaining: counter?.puk ?? null,
    atPort: port,
    problems: [],
  };
}
