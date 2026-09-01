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
// `yontem: "none"` dondurup ICCID bildiriyoruz (operator elle girer — bugun
// zaten oyle yapiyor). Ihtiyac cikarsa kardes calismadan alinir.

import { runConsole, shQuote } from "./console.js";
import { normalizePhone } from "./device.js";
import { problem } from "./problems.js";


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
// Ayrimi yapmayinca disableSimPin'in DOGRULAMA adimi kendi kapisina takiliyor,
// bos cevap aliyor ve kilit gercekten kalksa bile "kaldirilamadi" diyordu.
const AT_CLCK_QUERY = /^AT\+CLCK=\s*"?[A-Z]+"?\s*,\s*2\s*$/i;
const AT_WRITE_COMMANDS = /^AT\+(CPIN|CLCK|CPWD|CFUN|CGDCONT|CMGS|CMGW)=|^AT&W|^ATZ|^AT\+CUSD=/i;

// Bu komut cihazda bir sey DEGISTIRIR mi (ya da PIN hakki harcar mi)?
// PURE: cihaz gerektirmez, test edilebilir.
export function isAtWrite(command) {
  const k = String(command ?? "").trim();
  if (AT_CLCK_QUERY.test(k)) return false;
  return AT_WRITE_COMMANDS.test(k);
}

// --- Saf ayristiricilar (cihaz GEREKTIRMEZ, test edilebilir) ---

// +CNUM: SIM'e yazili abone numarasi.
// Bicim: +CNUM: "alpha","+90535XXXXXXX",145
// Doner: bizim kanonik bicimimizde (5xxxxxxxxx) ya da null. AYRI bir
// normalize fonksiyonu YAZMIYORUZ — normalizePhone tek dogru kaynak.
export function parseCnum(answer) {
  if (!answer) return null;
  const re = /\+CNUM:\s*(?:"[^"]*")?\s*,\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(answer)) !== null) {
    const n = normalizePhone(m[1]);
    if (n) return n;
  }
  return null;
}

// +CPIN? : SIM kilit durumu. "READY" | "SIM PIN" | "SIM PUK" | ... | "UNKNOWN"
export function parseCpin(answer) {
  if (!answer) return "UNKNOWN";
  const m = answer.match(/\+CPIN:\s*([A-Za-z0-9 ]+)/);
  return m ? m[1].trim().toUpperCase() : "UNKNOWN";
}

// +QPINC / +CPINC : kalan PIN/PUK deneme sayisi. Doner: {pin, puk} | null
// Quectel modulu (Q200AF) +QPINC kullaniyor; +CPINC standart yedek.
export function parsePinCounter(answer) {
  if (!answer) return null;
  const q = answer.match(/\+QPINC:\s*"?SC"?\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (q) return { pin: Number(q[1]), puk: Number(q[2]) };
  const c = answer.match(/\+CPINC:\s*(\d+),(\d+),(\d+),(\d+)/);
  if (c) return { pin: Number(c[1]), puk: Number(c[3]) };
  return null;
}

// +CLCK: PIN sorgusu ACIK mi? true=acik, false=kapali, null=okunamadi
export function parseClck(answer) {
  if (!answer) return null;
  const m = answer.match(/\+CLCK:\s*([01])/);
  return m ? m[1] === "1" : null;
}

// +CCID / +ICCID : SIM seri numarasi. Sondaki dolgu F atilir.
export function parseCcid(answer) {
  if (!answer) return null;
  const m = answer.match(/\+(?:C?CID|ICCID):\s*"?([0-9A-Fa-f]+)"?/)
    || answer.match(/\b(\d{18,20}F?)\b/);
  return m ? m[1].replace(/[Ff]$/, "") : null;
}

// AT cevabi basarili mi? Modul komut sonunda OK ya da ERROR basar.
export const isAtOk = (answer) => /\bOK\b/.test(answer || "") && !/\bERROR\b/i.test(answer || "");

// Portu ACIK TUTAN kabuk komutunu uretir. Saf: test edilebilir.
export function atShellCommand(port, command, readSec = 3) {
  // OK/ERROR GORUNCE DUR. `read -t` yalnizca UST SINIR; normal yolda cevabin
  // sonlandiricisi dongudan cikarir.
  //
  // Eskiden dongu SADECE sessizlik zaman asimiyla cikiyordu, yani modul
  // aninda cevap verse bile her komut readSec kadar oturuyordu. Olculdu
  // (2026-08-28, canli, ayni uc komut):
  //     sessizlik bekle : 9.34 sn
  //     OK gorunce kes  : 0.12 sn
  //
  // AMA ASIL SEBEP HIZ DEGIL, DOGRULUK: modul kendiliginden mesaj yayinliyor
  // (+QENG hucre durumu gibi). Bekleme penceresi bunlari komutun cevabi gibi
  // okuyordu — ayni olcumde `AT+CPIN?` cevabi olarak `+QENG: "servingcell"...`
  // geldi. Sonlandiricida durmak bu kaymayi kapatiyor.
  //
  // `case` BusyBox ash'de standart; cihazda dogrulandi.
  //
  // TIRNAKLAMA — komut BICIM DIZESI DEGIL, ARGUMAN.
  // Eskiden `printf '${command}\r'` yaziliyordu ve iki sekilde bozuluyordu:
  //   1) komutta ' varsa tek tirnak KAPANIYOR, satirin geri kalani kabuga
  //      baska anlamda gidiyordu;
  //   2) komutta % varsa printf onu DONUSUM BELIRTECI saniyor —
  //      `AT+QCFG="%..."` sessizce bozuluyordu.
  // `printf '%s\r' 'komut'` ikisini de kapatir: bicim sabit, komut arguman.
  // shQuote ile tek tirnaklar da kacirilir.
  return `exec 3<>${port}; printf '%s\\r' ${shQuote(command)} >&3; `
    + `while read -t ${readSec} l <&3; do echo "ATL:$l"; `
    + `case "$l" in *OK*|*ERROR*) break;; esac; done; exec 3<&-`;
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
// karismayi TESPIT edip yeniden okumak (isAtGarbled + atQuery).

// Cevap KARISMIS mi? Tek komut TEK terminator doner (OK ya da ERROR).
// Birden fazlasi, portta baska bir komutun cevabinin kaldigini gosterir —
// yani elimizdeki metin hangi komuta ait, emin olamayiz.
export function isAtGarbled(answer) {
  const terminator = String(answer || "").match(/^\s*(OK|ERROR|\+CME ERROR.*)\s*$/gm) || [];
  return terminator.length > 1;
}

// Kabuk ciktisindan yalnizca modul cevabini ayiklar (ATL: onekli satirlar).
export function extractAtAnswer(raw) {
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
// icin bu kacinilmaz, o yuzden writeAllowed veriliyor — ama AT SEVIYESINDE
// kendi kapimiz var (AT_WRITE_COMMANDS): PIN harcayan komutlar acik izin olmadan
// gecmiyor.
export async function atCommand(opts, command, { readSec = 3, writeAllowed = false,
  attempts, timeoutMs } = {}) {
  if (!writeAllowed && isAtWrite(command)) {
    return { ok: false, answer: "", problems: [problem("WRITE_BLOCKED_READONLY", `AT: ${command}`)] };
  }
  const port = opts.atPort || AT_PORT;
  const shell = atShellCommand(port, command, readSec);
  const r = await runConsole(
    { ...opts, writeAllowed: true, attempts,
      timeoutMs: timeoutMs ?? (20000 + readSec * 1000) },
    ["stty -echo 2>/dev/null", shell],
  );
  if (!r.ok) return { ok: false, answer: "", problems: r.problems };
  return { ok: true, answer: extractAtAnswer(r.outs?.[shell]), problems: [] };
}

// AT portu cevap veriyor mu? Doner: { port, problems }
export async function findAtPort(opts) {
  const port = opts.atPort || AT_PORT;
  const r = await atCommand({ ...opts, atPort: port }, "AT", { readSec: 2 });
  if (r.ok && isAtOk(r.answer)) return { port, problems: [] };
  return { port: null, problems: r.problems.length ? r.problems : [problem("AT_PORT_NOT_FOUND", port)] };
}

// SIM'in TELEFON NUMARASINI okur. Bugune kadar operator elle giriyordu;
// numara SIM'de yaziliysa (EF_MSISDN) buradan okunabiliyor.
// Doner: { telefon, yontem: "cnum"|"none", iccid, atPort, problems }
export async function readMsisdn(opts) {
  let port = opts.atPort ?? null;
  let cnum = null;
  // Olculmus porta DOGRUDAN gercek komutu gonderiyoruz — ayrica bir yoklama
  // turu yapmiyoruz. Cevap hic AT gibi degilse (ne OK ne +CNUM) portu bir kez
  // dogrulayip net bir hata veriyoruz.
  if (!port) {
    port = AT_PORT;
    cnum = await atCommand({ ...opts, atPort: port }, "AT+CNUM");
    if (!isAtOk(cnum.answer) && !/\+CNUM/.test(cnum.answer)) {
      const found = await findAtPort(opts);
      if (!found.port) {
        return { phone: null, method: "none", iccid: null, atPort: null,
          problems: found.problems };
      }
      port = found.port;
      cnum = null;
    }
  }
  const atOptions = { ...opts, atPort: port };
  if (!cnum) cnum = await atCommand(atOptions, "AT+CNUM");
  const phone = parseCnum(cnum.answer);
  if (phone) {
    return { phone, method: "cnum", iccid: null, atPort: port, problems: [] };
  }
  // CNUM bos: numara SIM'e yazilmamis. ICCID'yi bildirip operatore birakiyoruz.
  const ccid = await atCommand(atOptions, "AT+CCID");
  return {
    phone: null, method: "none", iccid: parseCcid(ccid.answer), atPort: port,
    problems: [problem("MSISDN_NOT_ON_SIM")],
  };
}

// PURE: bu SIM'de PIN kilidi kaldirmaya izin var mi? Kural PAYLASILAN
// modulde (bu dosya (at.js)) — nvram yolu ve internet-sonrasi deneme yolu da
// ayni yere soruyor. Burada yalniz YOLA OZGU kapi var: SIM takili mi.
//
// Doner: { izin, sebep: kod|null, problems: [] }
export function simUnlockDecision(lock = {}, pin, { manualConsent = false } = {}) {
  const path = isSimPathOpen(lock);
  if (path) return { allowed: false, reason: path.reason, problems: path.problems };
  const k = canSpendPinAttempt(lock, pin, { manualConsent });
  return { allowed: k.eligible, reason: k.reason, problems: k.problems };
}

// PURE: PIN'i BILMEDEN "bu SIM uygun mu?" — arayuz dugmeyi buna gore acar.
export function isSimLockEligible(lock = {}, { manualConsent = false } = {}) {
  return isSimPathOpen(lock) ?? attemptState(lock, { manualConsent });
}

// YOLA OZGU kapi: AT ile kilide dokunmak icin SIM ya kilitli ya hazir olmali.
// Uygunsa null doner (kapi acik), degilse red nesnesi.
function isSimPathOpen(lock) {
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
async function atQuery(atOptions, command, choice = {}) {
  const first = await atCommand(atOptions, command, choice);
  if (!isAtGarbled(first.answer)) return first;
  return atCommand(atOptions, command, choice);
}

// Birden fazla SALT OKUNUR AT sorgusunu TEK telnet oturumunda calistirir.
//
// NEDEN: her atCommand kendi oturumunu aciyor (baglan + login + kapat). Ayni
// bilgiyi iki komutla soruyorsak bunu iki kez odemek gereksiz — runConsole
// zaten komut DIZISI aliyor. Cevaplar komut SIRASINDA doner.
//
// SINIR: yalniz OKUMA yollarinda kullanilir. PIN HARCAYAN komutlar (CPIN=,
// CLCK=0/1) bilerek tek tek ve kendi oturumunda kalir — orada hiz degil
// izlenebilirlik ve tek-deneme garantisi onemli.
//
// Karismis cevap gelen komut, kendi oturumunda BIR KEZ yeniden okunur.
async function atQueries(opts, commands, readSec = 3) {
  const port = opts.atPort || AT_PORT;
  const shells = commands.map((k) => atShellCommand(port, k, readSec));
  const r = await runConsole(
    { ...opts, writeAllowed: true, timeoutMs: 15000 + commands.length * (readSec + 1) * 1000 },
    ["stty -echo 2>/dev/null", ...shells],
  );
  if (!r.ok) return commands.map(() => ({ ok: false, answer: "", problems: r.problems }));
  const out = [];
  for (let i = 0; i < commands.length; i += 1) {
    const answer = extractAtAnswer(r.outs?.[shells[i]]);
    out.push(isAtGarbled(answer)
      ? await atCommand({ ...opts, atPort: port }, commands[i])
      : { ok: true, answer, problems: [] });
  }
  return out;
}

// Kilit sorgusu (AT+CLCK="SC",2). Parola istemez, hak HARCAMAZ.
// Doner: true (acik) | false (kapali) | null (BILMIYORUZ)
//
// null iki halde doner: cevap okunamadi ya da cevap KARISMIS. Ikisinde de
// "bilmiyoruz" demek dogru cevap — cagiran buna gore PIN gondermemeyi secer.
async function lockQuery(atOptions) {
  const r = await atQuery(atOptions, 'AT+CLCK="SC",2');
  if (isAtGarbled(r.answer)) return null;   // tekrar okundu, hala karisik
  return parseClck(r.answer);
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
// Doner: { ok, acildi, lockRemoved, durum, pinRemaining, problems }
export async function disableSimPin(opts, pin, { manualConsent = false, persistOff = true } = {}) {
  const report = { ok: false, unlocked: false, lockRemoved: false,
    status: null, pinRemaining: null, problems: [] };
  // (1) Bicim — bozuk PIN garantili bosa harcanmis deneme. Cihaza HIC gitmez.
  if (!/^\d{4,8}$/.test(String(pin ?? ""))) {
    report.problems.push(problem("PIN_INVALID"));
    return report;
  }
  const lock = await readSimLock(opts);
  report.status = lock.status;
  report.pinRemaining = lock.pinRemaining;
  const atOptions = { ...opts, atPort: lock.atPort };

  // (2) SIM ZATEN ACIK: kilit gercekten hala acikta mi? Bunu SORGUYLA
  // ogreniyoruz (AT+CLCK="SC",2 — parola istemez, hak harcamaz). Kilit
  // zaten kapaliysa YAPILACAK IS YOK: PIN'i hic gondermiyoruz. Onceki hal
  // her cagriyi bir parola sunumuna ceviriyordu; PIN'siz SIM'de bu bedava
  // bir risk ve gereksiz bir tur.
  if (lock.ready) {
    report.ok = true;
    report.unlocked = true;
    if (!persistOff) return report;
    const isOpen = await lockQuery(atOptions);
    if (isOpen === false) {
      report.lockRemoved = true;   // istenen durum: kilit kapali
      return report;
    }
    // SORGU OKUNAMADI (null): kilidin acik mi kapali mi oldugunu BILMIYORUZ.
    // Bilmeden devam etmek PIN gondermek demek ve yanlis PIN bir hak yakar.
    // Bilmedigimiz icin harcamayiz — manualConsent ile gecilebilir.
    if (isOpen === null && !manualConsent) {
      report.problems.push(problem("LOCK_STATE_UNKNOWN"));
      return report;
    }
  }

  // (3) KARAR — PURE, test edilmis, tek yer (bkz. simUnlockDecision):
  // PUK / SIM yok / yanmis hak / son hak burada reddedilir. Arayuz de CLI de
  // ayni cevaba bakar; burasi gecilmeden cihazda PIN denenmez.
  const decision = simUnlockDecision(lock, pin, { manualConsent });
  if (!decision.allowed) {
    report.problems.push(...decision.problems);
    return report;
  }
  report.problems.push(...decision.problems);   // izin verildi; varsa UYARI tasinir

  // (4) TEK deneme — SIM kilitliyse ac.
  if (!lock.ready) {
    await atCommand(atOptions, "AT+CMEE=2", { writeAllowed: true });   // hatalar metin gelsin
    const r = await atCommand(atOptions, `AT+CPIN="${pin}"`, { writeAllowed: true, readSec: 5 });
    if (!isAtOk(r.answer)) {
      report.problems.push(problem("PIN_REJECTED", lock.pinRemaining));
      return report;   // TEKRAR DENEMEZ
    }
    report.ok = true;
    report.unlocked = true;
  }

  if (!persistOff) return report;

  // (5) Kilidi KALICI kapat + dogrula. Bu adim basarisiz olsa da SIM acik kaldi.
  const finishWith = await atCommand(atOptions, `AT+CLCK="SC",0,"${pin}"`, { writeAllowed: true, readSec: 5 });
  if (!isAtOk(finishWith.answer)) {
    report.problems.push(problem("PIN_LOCK_NOT_DISABLED"));
    return report;
  }
  const lockAfter = await lockQuery(atOptions);
  report.lockRemoved = lockAfter === false;
  if (!report.lockRemoved) report.problems.push(problem("PIN_LOCK_NOT_DISABLED"));
  return report;
}

// SIM PIN KILIDINI ACAR (kurar) — disableSimPin'in TERSI.
//
// NEDEN VAR: uretimde istenen sey PIN'siz SIM. Bu fonksiyon urunun akisinda
// KULLANILMAZ; kilit KALDIRMA yolunu gercek bir kilitli SIM'de sinamak icin
// var. Elimizdeki SIM'ler PIN'siz geliyor, yani test durumunu kendimiz
// uretmek zorundayiz.
//
// ⚠ AYNI RISK: AT+CLCK="SC",1,"<pin>" PIN'i DOGRULAR. Yanlis PIN bir deneme
// yakar, uc yanlis PUK demek. Bu yuzden korumalar birebir ayni ve AYNI PURE
// karardan geliyor (isSimLockEligible): son hak yakilmaz, daha once hak
// yanmissa OTOMATIK yol denemez (insan yine deneyebilir).
//
// NOT: kilit SONRAKI ACILISTA sorulur. Etkisini gormek icin modem kapat-ac.
// Doner: { ok, lockOpen, zaten, durum, pinRemaining, problems }
export async function enableSimPin(opts, pin, { manualConsent = false } = {}) {
  const report = { ok: false, lockOpen: false, already: false,
    status: null, pinRemaining: null, problems: [] };
  if (!/^\d{4,8}$/.test(String(pin ?? ""))) {
    report.problems.push(problem("PIN_INVALID"));
    return report;
  }
  const lock = await readSimLock(opts);
  report.status = lock.status;
  report.pinRemaining = lock.pinRemaining;
  const atOptions = { ...opts, atPort: lock.atPort };

  // SIM su an KILITLI ise kilit zaten kurulu — yapacak is yok, PIN gonderilmez.
  if (lock.lock === "pin") {
    report.ok = true;
    report.lockOpen = true;
    report.already = true;
    return report;
  }
  // Acik SIM: kilit sorgusu ZATEN 1 mi? (sorgu hak harcamaz)
  if (lock.ready) {
    const isOpen = await lockQuery(atOptions);
    if (isOpen === true) {
      report.ok = true;
      report.lockOpen = true;
      report.already = true;
      return report;
    }
    // SORGU OKUNAMADI: durumu bilmeden PIN gondermek bir hak riske atmaktir.
    if (isOpen === null && !manualConsent) {
      report.problems.push(problem("LOCK_STATE_UNKNOWN"));
      return report;
    }
  }

  const decision = isSimLockEligible(lock, { manualConsent });
  report.problems.push(...decision.problems);
  if (!decision.eligible) return report;

  await atCommand(atOptions, "AT+CMEE=2", { writeAllowed: true });
  const ac = await atCommand(atOptions, `AT+CLCK="SC",1,"${pin}"`, { writeAllowed: true, readSec: 5 });
  if (!isAtOk(ac.answer)) {
    report.problems.push(problem("PIN_REJECTED", lock.pinRemaining));
    return report;   // TEKRAR DENEMEZ
  }
  report.ok = true;
  report.lockOpen = (await lockQuery(atOptions)) === true;
  if (!report.lockOpen) report.problems.push(problem("PIN_LOCK_NOT_ENABLED"));
  return report;
}

// SIM kilit durumunu MODULDEN okur (web sayfasindan degil): kalan PIN/PUK
// hakkini da verir. Doner: { durum, hazir, pinRemaining, pukRemaining, problems }
export async function readSimLock(opts) {
  // Port YOKLANMIYOR. Eskiden once findAtPort ile AYRI bir telnet oturumu
  // acilip sadece "AT" yaziliyordu; readMsisdn bunu bilerek yapmiyor
  // (yorumu yukarida). Olculmus porta DOGRUDAN soruyoruz; cevap AT gibi
  // degilse portu BIR KEZ dogrulayip net hata veriyoruz.
  const port = opts.atPort || AT_PORT;
  let atOptions = { ...opts, atPort: port };
  const COMMANDS = ["AT+CPIN?", 'AT+QPINC="SC"'];
  let [cpin, qpinc] = await atQueries(atOptions, COMMANDS);

  if (!/\+CPIN|\bOK\b/.test(cpin.answer)) {
    const found = await findAtPort(opts);
    if (!found.port) {
      // Kilit durumu OKUNAMADI. Bu deger PIN kararinin girdisi; bilmiyorken
      // "ready" ya da "kilit yok" demek YANLIS yonde risk olur. UNKNOWN +
      // hazir:false dondurup kararı reddettiriyoruz (bkz. isSimPathOpen).
      return { status: "UNKNOWN", ready: false, lock: null,
        pinRemaining: null, pukRemaining: null, atPort: null, problems: found.problems };
    }
    atOptions = { ...opts, atPort: found.port };
    [cpin, qpinc] = await atQueries(atOptions, COMMANDS);
  }

  const status = parseCpin(cpin.answer);
  // QPINC Quectel'e ozgu; bos gelirse standart CPINC'e dusuyoruz (nadir, o
  // yuzden ayri bir tur olmasi sorun degil).
  const counter = parsePinCounter(qpinc.answer)
    ?? parsePinCounter((await atQuery(atOptions, "AT+CPINC")).answer);
  return {
    status,
    ready: status === "READY",
    lock: status === "SIM PIN" ? "pin" : status.includes("PUK") ? "puk" : null,
    pinRemaining: counter?.pin ?? null,
    pukRemaining: counter?.puk ?? null,
    atPort: atOptions.atPort,
    problems: [],
  };
}

// ======================================================================
// PIN denemesi karari — PURE, TEK YER
// ======================================================================

export const PIN_ATTEMPTS_DEFAULT = 3;

// Bu SIM'de daha once bir deneme HARCANMIS mi? Tek sinyal, iki farkli karar
// buna bakiyor: (a) yeni bir deneme yapilir mi, (b) modemde saklanan PIN bu
// SIM'e ait olmadigi icin temizlenir mi. Ikisi ayri karar, sinyal ayni —
// tanimi tek yerde tutuyoruz.
export function isAttemptBurned(lock = {}) {
  const { pinRemaining: remaining, pinTotal: total } = lock;
  if (remaining === null || remaining === undefined) return false;
  return remaining < (total ?? PIN_ATTEMPTS_DEFAULT);
}

const refuse = (code, ...args) => ({ eligible: false, reason: code, problems: [problem(code, ...args)] });
const allowed = (problems = []) => ({ eligible: true, reason: null, problems });

// SIM'in HAK DURUMU bir deneme harcamaya uygun mu? PIN'i BILMEDEN sorulabilir
// — arayuz "dugmeyi gosterelim mi?" sorusunu PIN girilmeden once soruyor.
//
// kilit: { kilit: "pin"|"puk"|null, pinRemaining, pinTotal, pukRemaining }
// manualConsent: bu denemeye INSAN karar verdi (PIN'i yazip dugmeye basti, ya da
// CLI'da --zorla dedi). Kural su ayrimda: "bir hak yakildiysa BIR DAHA
// DENEME" OTOMATIK yol icindir — arac kendi kendine ayni isi tekrarlamasin.
// Insani engellemek icin degil: operator baska bir PIN denemek isterse onu
// kesmek yanlis olur, dogru PIN'i bilen odur. Insanin da gecemedigi TEK kural
// SON HAK'tir; orada yanlis PIN SIM'i PUK'a kilitler.
export function attemptState(lock = {}, { manualConsent = false } = {}) {
  if (lock.lock === "puk") return refuse("SIM_PUK_LOCKED", lock.pukRemaining);

  const remaining = lock.pinRemaining;
  // Sayac okunamadi: is durdurulmaz — sayaci bildirmeyen bir modul yuzunden
  // her SIM'i kilitlemek yanlis olurdu — ama karar uyariyla tasinir.
  if (remaining === null || remaining === undefined) return allowed([problem("PIN_REMAINING_UNKNOWN")]);

  // SON HAK: manualConsent bile gecemez. Yanlis PIN burada PUK demek.
  if (remaining <= 1) return refuse("PIN_LAST_ATTEMPT", remaining);

  // Daha once hak yanmis: emin olmadan devam etmek ikinci hakki da yakar.
  if (isAttemptBurned(lock) && !manualConsent) {
    return refuse("PIN_ATTEMPT_BURNED", remaining, lock.pinTotal ?? PIN_ATTEMPTS_DEFAULT);
  }

  return allowed();
}

// PIN dahil TAM karar. Bicim kontrolu once: bozuk PIN garantili bosa
// harcanmis deneme, cihaza HIC gitmemeli.
export function canSpendPinAttempt(lock = {}, pin, { manualConsent = false } = {}) {
  if (pin === null || pin === undefined || pin === "") return refuse("PIN_REQUIRED");
  if (!/^\d{4,8}$/.test(String(pin))) return refuse("PIN_INVALID");
  return attemptState(lock, { manualConsent });
}

// PUK ile SIM'i ac ve YENI PIN belirle. AT+CPIN="PUK","YENIPIN".
//
// NEDEN VAR: uc yanlis PIN'den sonra SIM PUK kilitlenir ve tek cikis yol PUK.
// Bunu telefona takarak yapmak, aracin varlik sebebine aykiri — teknisyen
// tezgahta kalsin diye yazildi.
//
// PUK MANTIGI PIN'DEN FARKLI: PIN 3 hak, PUK 10 hak — ama PUK'un sonu SIM'in
// KALICI OLARAK OLMESI. O yuzden kurallar daha da siki:
//   1) bicim: PUK 8 hane, yeni PIN 4-8 hane. Bozuksa cihaza HIC gitmez.
//   2) SIM gercekten PUK kilitli mi? Degilse gonderme — PUK yalnizca o
//      durumda kabul edilir, baska her durumda bosa harcanmis bir denemedir.
//   3) SON HAK ASLA otomatik harcanmaz (PIN'deki kuralin aynisi). Orada
//      yanlis PUK SIM'i geri donusu olmadan yok eder; karar insanindir.
//      manualConsent bu kurali da GECEMEZ.
// PUK ve yeni PIN hicbir yere (kayit, olay, defter, log) yazilmaz.
// PURE: PUK denemesine IZIN VAR MI? Karar cihazdan AYRI durur.
//
// NEDEN AYRI: PIN tarafinda ayni kararlar saf fonksiyonlara
// (simUnlockDecision, canSpendPinAttempt, simPinTarget) cikarilmis ve
// tests/pin-unlock.test.js gerekcesini birebir yaziyor: "Cihazla konusan
// koda gomulu olsa test edilemezdi." PUK yolu bu kalibi izlemiyordu —
// dort kapinin dordu de I/O fonksiyonunun icindeydi ve HIC testi yoktu.
// Oysa buradaki hata PIN'dekinden agir: yanlis PUK SIM'i KALICI OLDURUR.
//
// Doner: { eligible, reason, problems }  (PIN kapilariyla ayni bicim)
export function pukUnblockDecision(lock = {}, puk, newPin, { manualConsent = false } = {}) {
  // 1) BICIM once: bozuk PUK garantili bosa harcanmis deneme, cihaza HIC gitmemeli.
  if (!/^\d{8}$/.test(String(puk ?? "")) || !/^\d{4,8}$/.test(String(newPin ?? ""))) {
    return refuse("PUK_INVALID");
  }
  // 2) SIM gercekten PUK kilitli mi? Degilse PUK bosa harcanir.
  if (lock.lock !== "puk") return refuse("PUK_NOT_REQUIRED", lock.status ?? "unknown");
  // 3) SON HAK: manualConsent DAHIL hicbir sey gecemez. Burada yanlis PUK
  //    SIM'i geri donusu olmadan yok eder; karar insanindir.
  if (lock.pukRemaining != null && lock.pukRemaining <= 1) {
    return refuse("PUK_LAST_ATTEMPT", lock.pukRemaining);
  }
  // 4) Kalan hak okunamadi: bilmeden PUK harcamayiz.
  if (lock.pukRemaining == null && !manualConsent) return refuse("PIN_REMAINING_UNKNOWN");
  return allowed();
}

export async function unblockSimPuk(opts, puk, newPin, { manualConsent = false } = {}) {
  const report = { ok: false, unblocked: false, status: null,
    pukRemaining: null, pinRemaining: null, problems: [] };
  // Bicim kontrolu cihaza GITMEDEN once: bozuk PUK icin okuma bile yapmayiz.
  const format = pukUnblockDecision({ lock: "puk", pukRemaining: 10 }, puk, newPin);
  if (!format.eligible) { report.problems.push(...format.problems); return report; }

  const lock = await readSimLock(opts);
  report.status = lock.status;
  report.pukRemaining = lock.pukRemaining;
  report.pinRemaining = lock.pinRemaining;

  const gate = pukUnblockDecision(lock, puk, newPin, { manualConsent });
  if (!gate.eligible) { report.problems.push(...gate.problems); return report; }

  const atOptions = { ...opts, atPort: lock.atPort };
  const sent = await atCommand(atOptions, `AT+CPIN="${puk}","${newPin}"`,
    { writeAllowed: true, readSec: 8 });
  if (!isAtOk(sent.answer)) {
    report.problems.push(problem("PUK_REJECTED", lock.pukRemaining ?? "?"));
    const after = await readSimLock(opts);
    report.pukRemaining = after.pukRemaining;
    report.pinRemaining = after.pinRemaining;
    report.status = after.status;
    return report;
  }
  const after = await readSimLock(opts);
  report.status = after.status;
  report.pukRemaining = after.pukRemaining;
  report.pinRemaining = after.pinRemaining;
  report.unblocked = after.lock !== "puk";
  report.ok = report.unblocked;
  return report;
}
