// Sorun katalogu — hata KOD'u, onem derecesi, mesaj ve "sirada neye bak".
//
// Tasarim: kutuphane ASLA throw etmez. Her yol bir sonuc nesnesiyle biter,
// icinde problems[] dizisi. Kismi okuma gercek bir sonuctur; exception gelen
// yariyi tasiyamaz. Bilinmeyen bir kod istenirse patlamaz, kendini tarif eder.
//
// message/check runtime metni oldugu icin (log'a, gelistiriciye gider,
// icinde Node/uretici Ingilizce hata metni gomulu olabilir) INGILIZCE yazilir;
// cumle tek dilde kalsin. Turkce isteyen taraf sabit `code` uzerinden anahtarlar.

const KATALOG = {
  // --- Ag / erisim ---
  NO_SOURCE_IP: (ip) => ({
    message: `The source IP ${ip} is not usable on this machine, so requests`
      + " cannot leave from the modem's subnet.",
    check: "Add a secondary IP in the modem subnet, e.g. (admin PowerShell):"
      + " New-NetIPAddress -InterfaceAlias Ethernet -IPAddress 192.168.1.50"
      + " -PrefixLength 24 ; then set MODEM_KAYNAK_IP to it.",
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
  AUTH_REQUIRED: (yol) => ({
    message: `${yol} needs credentials (HTTP 401) but none were supplied.`,
    check: "Set MODEM_KULLANICI and MODEM_SIFRE in .env. Unauthenticated"
      + " access only returns system info; SIM, settings and the nvram backup"
      + " are behind Basic auth.",
  }),
  AUTH_REJECTED: (yol) => ({
    message: `The credentials were rejected by ${yol} (HTTP 401).`,
    check: "Check MODEM_KULLANICI / MODEM_SIFRE. The default is on the label"
      + " under the device. Avoid many rapid attempts — some builds lock out.",
  }),
  HTTP_ERROR: (yol, kod) => ({
    message: `${yol} returned an unexpected HTTP status ${kod}.`,
    check: "The endpoint path may differ on this firmware. Compare with the"
      + " verified list in constants.js (ENDPOINTS).",
  }),
  REQUEST_FAILED: (yol, sebep) => ({
    message: `The request to ${yol} could not be completed: ${sebep}`,
    check: "Transient single-connection timeout is common on this modem; the"
      + " client already retries. If it persists, check the cable and source IP.",
  }),
  EMPTY_BODY: (yol) => ({
    message: `${yol} answered but the body was empty.`,
    check: "Some .live.htm endpoints return empty without auth; the .live.asp"
      + " variant carries the data. This is informational, not always an error.",
  }),

  // --- Icerik / ayristirma ---
  PARSE_EMPTY: (yol) => ({
    message: `No {key::value} pairs were found in ${yol}.`,
    check: "The page format may have changed, or the body was truncated. The"
      + " raw body is kept in the result for inspection.",
  }),
  NVRAM_BAD_HEADER: () => ({
    message: "The nvram backup did not start with the expected ROUTER header.",
    check: "The download may be truncated or auth-gated. Re-fetch /nvrambak.bin"
      + " with valid credentials.",
  }),

  INTERNET_YOK: (maxSn, simDurumu) => ({
    message: `The modem did not get a WAN IP within ${maxSn}s (SIM status: ${simDurumu || "unknown"}).`
      + " Settings are written and verified, but the SIM could not be proven working.",
    check: "Most common cause in the field: the SIM is PIN-locked. Also possible:"
      + " no data plan, no coverage in the workshop, or antennas not connected."
      + " Measured baseline: a healthy SIM came online 89s after reboot.",
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
    check: "If this SIM is PIN-locked, enter the PIN on the result screen — only"
      + " the PIN is written, the verified settings are left alone. If the SIM has"
      + " no PIN, check coverage, antennas and the data plan instead.",
  }),
  SIM_MISSING: (durum) => ({
    message: `No SIM is readable in the modem (status: ${durum || "unknown"}), so`
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
  WRITE_BLOCKED_READONLY: (yol) => ({
    message: `A write to ${yol} was blocked: this command is read-only.`,
    check: "Writing is only allowed in the 'uygula' command with --uygula."
      + " Discovery and read commands never modify the device.",
  }),
};

// severity: varsayilan "error". Bazi durumlar (bos govde, kimliksiz erisim
// beklentisi) yalnizca "warning" — sonucu ok:false yapmaz.
// INTERNET_YOK bilerek UYARI: ayarlar dogru yazilmis, provizyon basarili.
// Internetin gelmemesi ayri bir sorun (PIN/kapsama/paket) ve retry cozmez —
// sonucu ok:false yapmak yanlis alarm ve gereksiz tekrar uretir.
const UYARI_KODLARI = new Set(["EMPTY_BODY", "AUTH_REQUIRED", "PARSE_EMPTY", "INTERNET_YOK"]);

export const PROBLEM_CODES = Object.freeze(Object.keys(KATALOG));

// Bir problem nesnesi uretir. Bilinmeyen kod patlamaz — kendini tarif eder.
export function problem(kod, ...args) {
  const severity = UYARI_KODLARI.has(kod) ? "warning" : "error";
  try {
    return { kod, severity, ...KATALOG[kod](...args) };
  } catch {
    return {
      kod,
      severity: "error",
      message: `Internal error: the problem catalog could not describe "${kod}".`,
      check: "This is a bug in problems.js — the code is missing or its"
        + " arguments did not match.",
    };
  }
}

// Sonuc "ok" mu? Hicbir error yoksa evet (warning'ler ok'u bozmaz).
export function isOk(problems) {
  return problems.every((p) => p.severity !== "error");
}
