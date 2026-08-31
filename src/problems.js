// Sorun katalogu — hata KOD'u, onem derecesi, mesaj ve "sirada neye bak".
//
// Tasarim: kutuphane ASLA throw etmez. Her yol bir sonuc nesnesiyle biter,
// icinde problems[] dizisi. Kismi okuma gercek bir sonuctur; exception gelen
// yariyi tasiyamaz. Bilinmeyen bir kod istenirse patlamaz, kendini tarif eder.
//
// message/check runtime metni oldugu icin (log'a, gelistiriciye gider,
// icinde Node/uretici Ingilizce hata metni gomulu olabilir) INGILIZCE yazilir;
// cumle tek dilde kalsin. Turkce isteyen taraf sabit `code` uzerinden keyList.

const CATALOG = {
  // --- Ag / erisim ---
  NO_SOURCE_IP: (ip) => ({
    message: `No usable local address was found in ${ip}'s subnet right now,`
      + " so requests cannot leave from the modem's subnet.",
    // SIRA BILINCLI: gunluk kullanimda bunun sebebi neredeyse her zaman kablo,
    // yapilandirma degil. Kablo cikinca Windows adresi "Deprecated" yapar ve
    // adaptor Node'un arayuz listesinde HIC gorunmez (2026-08-28 olculdu) —
    // yani arac iki durumu ayirt edemez. Once ucuz ve olasi olani soyluyoruz;
    // "IP ekle" tavsiyesi kablo takiliyken hala hata varsa gecerli.
    check: "First check the cable and power: is the modem's LAN cable plugged"
      + " in and the modem switched on? With the cable out, Windows marks the"
      + " secondary IP 'Deprecated' and the adapter disappears from the"
      + " interface list, which looks exactly like a missing IP. If the cable"
      + " IS in and this persists, the address may genuinely not be configured"
      + " — add it (admin PowerShell): New-NetIPAddress -InterfaceAlias"
      + " Ethernet -IPAddress 192.168.1.50 -PrefixLength 24 ; then set"
      + " MODEM_KAYNAK_IP to it.",
  }),
  DEVICE_UNREACHABLE: (host) => ({
    message: `No TCP port answered on ${host}; the modem looks unreachable.`,
    check: "Is the cable in a LAN port? Is there a secondary IP in the same"
      + " subnet? Note: this modem ignores ICMP (ping), so ping failing is"
      + " normal — we probe TCP instead.",
  }),
  DEVICE_BUSY: (host) => ({
    message: `Another read of ${host} is already in flight in this process,`
      + " so this one was refused before touching the network.",
    check: "The modem's web server accepts one connection at a time. Wait for"
      + " the running read to finish, then try again.",
  }),

  // --- HTTP / kimlik ---
  // Eskiden PIN_ALREADY_TRIED diye IKINCI bir kod vardi ve kosulu birebir
  // ayniydi (kalan < toplam). Iki ad tek durumu anlatiyordu; birlestirildi.
  PIN_ATTEMPT_BURNED: (remaining, total) => ({
    message: `This SIM has ${remaining} of ${total} PIN attempts left, so an`
      + " attempt was already burned; no further attempt was made.",
    check: "By design the tool spends a PIN attempt AT MOST ONCE. A second"
      + " automatic try would only push the SIM closer to a PUK lock. Confirm"
      + " the PIN from the carrier's paperwork, then override with"
      + " zorla/--zorla. The last attempt is never burned, override or not.",
  }),
  PIN_REMAINING_UNKNOWN: () => ({
    message: "The module did not report the remaining PIN attempt counter,"
      + " so the tool cannot tell whether an attempt was already burned.",
    check: "The unlock still proceeds — a module that hides the counter should"
      + " not block every SIM. But be sure of the PIN: an unknown counter"
      + " could already be at 2.",
  }),
  PIN_LOCK_NOT_ENABLED: () => ({
    message: "The module accepted the PIN but the SC lock still reads as"
      + " disabled, so the PIN prompt was not switched on.",
    check: "This path exists only to build a locked SIM for testing. Re-run"
      + " the command; if it keeps reading disabled, enable the PIN from a"
      + " phone instead.",
  }),
  CONSOLE_AUTH_REQUIRED: (host) => ({
    message: `No console credentials were supplied for ${host}, so the telnet`
      + " login could not even be attempted.",
    check: "Set MODEM_KULLANICI / MODEM_SIFRE, or pass {user, password}"
      + " (or {credentials:{...}}) to the console layer. Failing fast here is"
      + " deliberate: without credentials the login can only time out, and"
      + " retries would burn ~2 minutes to reach the same answer.",
  }),
  AUTH_REQUIRED: (path) => ({
    message: `${path} needs credentials (HTTP 401) but none were supplied.`,
    check: "Set MODEM_KULLANICI and MODEM_SIFRE in .env. Unauthenticated"
      + " access only returns system info; SIM, settings and the nvram backup"
      + " are behind Basic auth.",
  }),
  AUTH_REJECTED: (path) => ({
    message: `The credentials were rejected by ${path} (HTTP 401).`,
    check: "Check MODEM_KULLANICI / MODEM_SIFRE. The default is on the label"
      + " under the device. Avoid many rapid attempts — some builds lock out.",
  }),
  HTTP_ERROR: (path, code) => ({
    message: `${path} returned an unexpected HTTP status ${code}.`,
    check: "The endpoint path may differ on this firmware. Compare with the"
      + " verified list in settings.js (ENDPOINTS).",
  }),
  REQUEST_FAILED: (path, reason) => ({
    message: `The request to ${path} could not be completed: ${reason}`,
    check: "Transient single-connection timeout is common on this modem; the"
      + " client already retries. If it persists, check the cable and source IP.",
  }),
  EMPTY_BODY: (path) => ({
    message: `${path} answered but the body was empty.`,
    check: "Some .live.htm endpoints return empty without auth; the .live.asp"
      + " variant carries the data. This is informational, not always an error.",
  }),

  // --- Icerik / ayristirma ---
  LOCK_STATE_UNKNOWN: () => ({
    message: "The SIM lock state could not be read, so the tool does not know"
      + " whether the PIN prompt is on or off; no PIN was sent.",
    check: "Sending a PIN blind risks one of the SIM's attempts. Retry — the"
      + " read is usually transient. If it persists, power-cycle the modem."
      + " Override with zorla/--zorla only if you are sure of the PIN.",
  }),
  PROFILE_MISSING: (name) => ({
    message: `No profile named "${name}" is configured, so there is nothing to apply.`,
    check: "Pass --profil with a known name (see settings.js PROFILES), or start"
      + " the server with a sifirlamaProfil so the reset button has a target.",
  }),
  NVRAM_BAD_HEADER: () => ({
    message: "The nvram backup did not start with the expected ROUTER header.",
    check: "The download may be truncated or auth-gated. Re-fetch /nvrambak.bin"
      + " with valid credentials.",
  }),

  INTERNET_DOWN: (maxSec, simStatusText) => ({
    message: `The modem did not get a WAN IP within ${maxSec}s (SIM status: ${simStatusText || "unknown"}).`
      + " Settings are written and verified, but the SIM could not be proven working.",
    check: "Most common cause in the field: the SIM is PIN-locked. Also possible:"
      + " no data plan, no coverage in the workshop, or antennas not connected."
      + " Measured baseline: a healthy SIM came online 89s after reboot.",
  }),
  SIM_PIN_LOCKED: (remaining) => ({
    message: "The SIM is PIN-locked, so the modem cannot register on the network"
      + ` (PIN attempts left: ${remaining ?? "?"}).`,
    check: "Preferred fix, and the decision taken on this project: take the SIM"
      + " out, put it in a phone and TURN THE PIN OFF, then put it back. That"
      + " removes the problem permanently instead of storing PINs anywhere. Also"
      + " ask the operator to ship SIMs with the PIN already disabled.",
  }),
  SIM_PUK_LOCKED: (remaining) => ({
    message: `The SIM is PUK-locked (PUK attempts left: ${remaining ?? "?"}).`
      + " Entering a PIN cannot help, so nothing was written.",
    check: "Unlock it with the PUK printed on the SIM card holder, using a phone."
      + " Do not guess: running out of PUK attempts destroys the SIM for good.",
  }),
  PIN_LAST_ATTEMPT: (remaining) => ({
    message: `Only ${remaining} PIN attempt(s) remain, so no automatic attempt was made.`,
    check: "A wrong PIN here would PUK-lock the SIM. This is left to a human on"
      + " purpose: read the PIN off the card holder and verify it, or simply turn"
      + " the PIN off from a phone.",
  }),
  PIN_STALE_CLEARED: (remaining) => ({
    message: "A stored SIM PIN was found while the SIM was still locked"
      + ` (attempts left: ${remaining ?? "?"}), so it was CLEARED.`,
    check: "The modem sends its stored PIN to the SIM on every boot. A wrong"
      + " stored PIN therefore burns one attempt per boot and would eventually"
      + " PUK-lock the SIM. Clearing it stops the bleeding. Enter the correct"
      + " PIN, or turn the PIN off from a phone.",
  }),
  PIN_STORED_WRONG: () => ({
    message: "The same PIN is already stored in the modem, yet the SIM was still"
      + " PIN-locked. Nothing was written, so no attempt was burned.",
    check: "The stored PIN is therefore wrong. Read the PIN off the SIM card"
      + " holder and check it, or turn the PIN off from a phone. Retyping the"
      + " same value will not help.",
  }),
  PIN_INVALID: () => ({
    message: "The supplied SIM PIN is not 4-8 digits, so it was refused before"
      + " reaching the device.",
    check: "A malformed PIN would waste one of the SIM's three attempts. Three"
      + " wrong attempts PUK-lock the SIM permanently. Re-enter the PIN.",
  }),
  PIN_REQUIRED: () => ({
    message: "The modem has no internet and no SIM PIN was supplied, so nothing"
      + " further was attempted.",
    check: "The settings are written and verified. If the modem did not report a"
      + " PIN lock, look at coverage, antennas and the data plan first. If it is"
      + " PIN-locked, the fix is to turn the PIN off from a phone (project"
      + " decision) — a PIN can still be entered on the result screen if needed.",
  }),
  PIN_REJECTED: (remaining) => ({
    message: `The SIM rejected the PIN (attempts left before this try: ${remaining ?? "?"}).`
      + " It was NOT retried.",
    check: "One attempt is now spent. Read the PIN off the SIM card holder and"
      + " verify it before trying again — three wrong attempts PUK-lock the SIM."
      + " The tool never retries a rejected PIN on its own.",
  }),
  PIN_LOCK_NOT_DISABLED: () => ({
    message: "The SIM was unlocked but the PIN requirement could not be turned"
      + " off permanently.",
    check: "The SIM works now but will ask for the PIN again after a power cycle."
      + " Turn the PIN off from a phone, or retry; the SIM is not at risk.",
  }),
  AT_PORT_NOT_FOUND: (candidates) => ({
    message: `None of the candidate AT ports answered AT with OK (${candidates}).`,
    check: "The device exposes many /dev/ttyUSB* nodes and most are dead, so we"
      + " probe instead of assuming. Widen AT_PORT in at.js, or run"
      + " 'ls -la /dev/ttyUSB*' on the device to find the live node.",
  }),
  MSISDN_MISMATCH: (manual, deviceInfo) => ({
    message: `The number typed by the operator (${manual}) differs from the one`
      + ` written on the SIM (${deviceInfo}). The SIM's own value was used.`,
    check: "Most likely a typo in the manual entry. The SIM's EF_MSISDN is the"
      + " authoritative source, so that value goes into the record and the device"
      + " name. If the SIM value looks wrong instead, check with the operator.",
  }),
  MSISDN_NOT_ON_SIM: () => ({
    message: "AT+CNUM returned no number: the phone number is not written on"
      + " this SIM (EF_MSISDN is empty).",
    check: "Enter the number by hand this time. To avoid it in future, ask the"
      + " operator to deliver SIMs with the MSISDN written on the card, or match"
      + " the reported ICCID against the operator's list.",
  }),
  SIM_MISSING: (status) => ({
    message: `No SIM is readable in the modem (status: ${status || "unknown"}), so`
      + " provisioning was refused before touching the device.",
    check: "Insert the SIM, wait a few seconds and retry. Provisioning a modem"
      + " without a SIM succeeds on paper but the device cannot register on the"
      + " network, and the record would carry no ICCID.",
  }),
  MSISDN_REQUIRED: () => ({
    message: "Provisioning needs the SIM's phone number (MSISDN) and none was"
      + " supplied, so the device would go to the field with no record of its line.",
    check: "Pass it as 05xxxxxxxxx (CLI: --telefon, or answer the prompt). It"
      + " cannot be read from the device — it is known at install time only.",
  }),
  MSISDN_INVALID: (v) => ({
    message: `The supplied phone number "${v}" is not a valid TR mobile number.`,
    check: "Provide it as 05xxxxxxxxx / +905xxxxxxxxx. MSISDN cannot be read from"
      + " the device; it is operator/UI input.",
  }),

  // --- Yazma (Faz 3) ---
  WRITE_BLOCKED_READONLY: (path) => ({
    message: `A write to ${path} was blocked: this command is read-only.`,
    check: "Writing is only allowed in the 'uygula' command with --uygula."
      + " Discovery and read commands never modify the device.",
  }),
};

// severity: varsayilan "error". Bazi durumlar (bos govde, kimliksiz erisim
// beklentisi) yalnizca "warning" — sonucu ok:false yapmaz.
// INTERNET_DOWN bilerek UYARI: ayarlar dogru yazilmis, provizyon basarili.
// Internetin gelmemesi ayri bir sorun (PIN/kapsama/paket) ve retry cozmez —
// sonucu ok:false yapmak yanlis alarm ve gereksiz tekrar uretir.
const WARNING_CODES = new Set(["EMPTY_BODY", "AUTH_REQUIRED",
  "PIN_REMAINING_UNKNOWN",
  "INTERNET_DOWN", "SIM_PIN_LOCKED", "SIM_PUK_LOCKED", "PIN_LAST_ATTEMPT",
  // PIN_REQUIRED de UYARI: ayarlar dogru yazilmis, provizyon basarili. PIN'in
  // bilinmemesi bizim hatamiz degil ve tekrar denemek cozmez. Error yapmak
  // durum ("ready") ile problems'i celiskiye dusuruyordu.
  "PIN_REQUIRED", "PIN_STORED_WRONG", "PIN_STALE_CLEARED", "PIN_ATTEMPT_BURNED",
  // Numara SIM'de yazili degilse bu bir ARIZA degil: operator elle girer.
  "MSISDN_NOT_ON_SIM", "PIN_LOCK_NOT_DISABLED", "MSISDN_MISMATCH"]);

export const PROBLEM_CODES = Object.freeze(Object.keys(CATALOG));

// Bir problem nesnesi uretir. Bilinmeyen kod patlamaz — kendini tarif eder.
export function problem(code, ...args) {
  const severity = WARNING_CODES.has(code) ? "warning" : "error";
  try {
    return { code, severity, ...CATALOG[code](...args) };
  } catch {
    return {
      code,
      severity: "error",
      message: `Internal error: the problem catalog could not describe "${code}".`,
      check: "This is a bug in problems.js — the code is missing or its"
        + " arguments did not match.",
    };
  }
}

// Sonuc "ok" mu? Hicbir error yoksa evet (warning'ler ok'u bozmaz).
export function isOk(problems) {
  return problems.every((p) => p.severity !== "error");
}

// ======================================================================
// Problem kodu -> operatore gosterilecek TURKCE metin
// ======================================================================

const PROBLEM_TEXT_TR = {
  // --- Ag / erisim ---
  NO_SOURCE_IP: { title: "Modeme giden ağ yok",
    whatToDo: "LAN kablosunu tak, modemi aç. Kablo takılıysa ikincil IP tanımlı değil." },
  DEVICE_UNREACHABLE: { title: "Modem cevap vermiyor",
    whatToDo: "Kablo LAN portunda mı, modem açık mı?" },
  DEVICE_BUSY: { title: "Modem meşgul",
    whatToDo: "Süren okuma bitene kadar bekle." },
  REQUEST_FAILED: { title: "Bağlantı yarıda kaldı",
    whatToDo: "Araç tekrar deniyor. Sürerse kabloyu kontrol et." },
  // --- Kimlik ---
  AUTH_REQUIRED: { title: "Modem parolası gerekiyor", whatToDo: "Bilgi işleme haber ver." },
  AUTH_REJECTED: { title: "Modem parolası kabul edilmedi", whatToDo: "Bilgi işleme haber ver." },
  CONSOLE_AUTH_REQUIRED: { title: "Modem parolası tanımlı değil", whatToDo: "Bilgi işleme haber ver." },
  HTTP_ERROR: { title: "Modem beklenmeyen cevap verdi", whatToDo: "Kapat-aç ve tekrar dene." },
  EMPTY_BODY: { title: "Modem boş cevap verdi", whatToDo: "Bilgi amaçlı, akışı durdurmaz." },
  LOCK_STATE_UNKNOWN: { title: "SIM kilidi okunamadı",
    whatToDo: "PIN gönderilmedi. Tekrar dene; sürerse modemi kapat-aç." },
  PROFILE_MISSING: { title: "Profil tanımlı değil", whatToDo: "Bilgi işleme haber ver." },
  NVRAM_BAD_HEADER: { title: "Yedek dosyası tanınmadı", whatToDo: "Bilgi işleme haber ver." },
  WRITE_BLOCKED_READONLY: { title: "Yazma izni yok", whatToDo: "Modemde hiçbir şey değişmedi." },
  // --- SIM ---
  SIM_MISSING: { title: "SIM takılı değil", whatToDo: "Modemi kapat, SIM'i tak, aç." },
  SIM_PIN_LOCKED: { title: "SIM PIN kilitli", whatToDo: "PIN'i yaz ve kilidi kaldır." },
  SIM_PUK_LOCKED: { title: "SIM PUK kilitli", whatToDo: "Telefondan PUK ile aç." },
  INTERNET_DOWN: { title: "İnternet gelmedi", whatToDo: "Hattın açık ve kotalı olduğunu kontrol et." },
  AT_PORT_NOT_FOUND: { title: "SIM birimine ulaşılamadı", whatToDo: "Kapat-aç ve tekrar dene." },
  // --- Telefon numarasi ---
  MSISDN_REQUIRED: { title: "Telefon numarası gerekiyor", whatToDo: "11 hane olarak elle gir." },
  MSISDN_INVALID: { title: "Numara geçersiz", whatToDo: "11 hane, 05 ile başlamalı." },
  MSISDN_NOT_ON_SIM: { title: "Numara SIM'de yok", whatToDo: "Elle gir." },
  MSISDN_MISMATCH: { title: "Girilen numara SIM'dekinden farklı",
    whatToDo: "SIM'in numarası daha güvenilir. Hattı kontrol et." },
  // --- PIN kararlari ---
  PIN_INVALID: { title: "PIN biçimi hatalı", whatToDo: "4-8 hane, sadece rakam." },
  PIN_REQUIRED: { title: "SIM PIN istiyor", whatToDo: "PIN'i gir." },
  PIN_REJECTED: { title: "PIN kabul edilmedi",
    whatToDo: "Bir hak yandı, tekrar denenmeyecek. PIN'i doğrula." },
  PIN_LAST_ATTEMPT: { title: "Son hak — denenmedi",
    whatToDo: "Yanlış PIN SIM'i PUK'a kilitler. Telefonda aç." },
  PIN_ATTEMPT_BURNED: { title: "Daha önce bir hak yanmış",
    whatToDo: "PIN'den emin olmadan deneme. Operatör kaydından doğrula." },
  PIN_REMAINING_UNKNOWN: { title: "Kalan hak okunamadı", whatToDo: "PIN'den emin ol." },
  PIN_STORED_WRONG: { title: "Saklı PIN bu SIM'e uymuyor",
    whatToDo: "Saklı PIN temizlendi. Doğru PIN'i gir." },
  PIN_STALE_CLEARED: { title: "Eski PIN silindi", whatToDo: "Bilgi amaçlı." },
  PIN_LOCK_NOT_ENABLED: { title: "PIN kilidi açılamadı", whatToDo: "Tekrar dene ya da telefondan aç." },
  PIN_LOCK_NOT_DISABLED: { title: "Kilit kalıcı kaldırılamadı",
    whatToDo: "SIM açık, kurulum devam edebilir." },
};

// Bir sorunun OPERATORE gosterilecek Turkce halini verir.
//
// Bilinmeyen kod PATLAMAZ ve ham Ingilizce metni SIZDIRMAZ: kodu gosterip
// ne yapilacagini soyler. Yeni bir kod ceviri almadan eklenirse test yakalar
// (bkz. tests/sorun-metni.test.js) — ama uretimde ekran yine anlamli kalir.
export function problemText(code) {
  const t = PROBLEM_TEXT_TR[code];
  if (t) return { code, ...t };
  return { code,
    title: "Beklenmeyen bir sorun oluştu",
    whatToDo: `Bilgi işleme şu kodu bildir: ${code ?? "bilinmiyor"}` };
}

// problems[] dizisine Turkce karsiligini EKLER (message/check korunur — onlar
// gelistirici/günlük tarafi). Tuketiciye giden tek yer burasi olsun diye var:
// sunucu bunu cagirir, arayuz `tr` alanini basar, ham metne hic dokunmaz.
export function localizeProblems(problems = []) {
  return problems.map((p) => ({ ...p, tr: problemText(p.code) }));
}

export { PROBLEM_TEXT_TR };
