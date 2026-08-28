// PIN denemesi kararlari — TEK KURAL, TEK YER. Cihaza gitmez, PURE.
//
// NEDEN AYRI MODUL: bir PIN denemesi harcamak geri alinamaz. Uc yol da ayni
// riski tasiyor:
//   1) nvram'a PIN yazma        (provisioning: simPinHedefi)
//   2) AT ile kilit kaldirma/acma (at.js: simPinKaldir / simPinKilitle)
//   3) internet gelmeyince deneme (pipeline: pinDene)
// Kural her birinde ayri yazildiginda birbirinden ayrildi: 2026-08-28'de
// pinDene'de "hak yanmissa bir daha denemez" korumasi YOKTU, digerlerinde
// vardi. Kurali bir yere koyup ucune de sordurmak bunun tek caresi.
//
// Sinir: burada YALNIZCA "deneme harcanabilir mi" karari var. "SIM present mi",
// "nvram'a ne yazilacak" gibi yola ozgu sorular cagiranda kalir.

import { problem } from "./problems.js";

// GSM'de PIN sayaci 3'te baslar. Modul toplami bildirirse o kullanilir.
export const PIN_TOTAL_DEFAULT = 3;

// Bu SIM'de daha once bir deneme HARCANMIS mi? Tek sinyal, iki farkli karar
// buna bakiyor: (a) yeni bir deneme yapilir mi, (b) modemde saklanan PIN bu
// SIM'e ait olmadigi icin temizlenir mi. Ikisi ayri karar, sinyal ayni —
// tanimi tek yerde tutuyoruz.
export function hasBurnedAttempt(lock = {}) {
  const { pinRemaining: remaining, pinTotal: total } = lock;
  if (remaining === null || remaining === undefined) return false;
  return remaining < (total ?? PIN_TOTAL_DEFAULT);
}

const deny = (code, ...args) => ({ eligible: false, reason: code, problems: [problem(code, ...args)] });
const allow = (problems = []) => ({ eligible: true, reason: null, problems });

// SIM'in HAK DURUMU bir deneme harcamaya uygun mu? PIN'i BILMEDEN sorulabilir
// — arayuz "dugmeyi gosterelim mi?" sorusunu PIN girilmeden once soruyor.
//
// kilit: { kilit: "pin"|"puk"|null, pin_kalan, pin_toplam, puk_kalan }
// elleOnay: bu denemeye INSAN karar verdi (PIN'i yazip dugmeye basti, ya da
// CLI'da --zorla dedi). Kural su ayrimda: "bir hak yakildiysa BIR DAHA
// DENEME" OTOMATIK yol icindir — arac kendi kendine ayni isi tekrarlamasin.
// Insani engellemek icin degil: operator baska bir PIN denemek isterse onu
// kesmek yanlis olur, dogru PIN'i bilen odur. Insanin da gecemedigi TEK kural
// SON HAK'tir; orada yanlis PIN SIM'i PUK'a kilitler.
export function attemptBudget(lock = {}, { humanApproved = false } = {}) {
  if (lock.lock === "puk") return deny("SIM_PUK_LOCKED", lock.pukRemaining);

  const remaining = lock.pinRemaining;
  // Sayac okunamadi: is durdurulmaz — sayaci bildirmeyen bir modul yuzunden
  // her SIM'i kilitlemek yanlis olurdu — ama karar uyariyla tasinir.
  if (remaining === null || remaining === undefined) return allow([problem("PIN_REMAINING_UNKNOWN")]);

  // SON HAK: elleOnay bile gecemez. Yanlis PIN burada PUK demek.
  if (remaining <= 1) return deny("PIN_LAST_ATTEMPT", remaining);

  // Daha once hak yanmis: emin olmadan devam etmek ikinci hakki da yakar.
  if (hasBurnedAttempt(lock) && !humanApproved) {
    return deny("PIN_ATTEMPT_BURNED", remaining, lock.pinTotal ?? PIN_TOTAL_DEFAULT);
  }

  return allow();
}

// PIN dahil TAM karar. Bicim kontrolu once: bozuk PIN garantili bosa
// harcanmis deneme, cihaza HIC gitmemeli.
export function canSpendPinAttempt(lock = {}, pin, { humanApproved = false } = {}) {
  if (pin === null || pin === undefined || pin === "") return deny("PIN_REQUIRED");
  if (!/^\d{4,8}$/.test(String(pin))) return deny("PIN_INVALID");
  return attemptBudget(lock, { humanApproved });
}
