// PIN denemesi kararlari — TEK KURAL, TEK YER. Cihaza gitmez, PURE.
//
// NEDEN AYRI MODUL: bir PIN denemesi harcamak geri alinamaz. Uc yol da ayni
// riski tasiyor:
//   1) nvram'a PIN yazma        (provisioning: simPinHedefi)
//   2) AT ile kilit kaldirma (at.js: simPinKaldir)
//   3) internet gelmeyince deneme (pipeline: pinDene)
// Kural her birinde ayri yazildiginda birbirinden ayrildi: 2026-08-28'de
// pinDene'de "hak yanmissa bir daha denemez" korumasi YOKTU, digerlerinde
// vardi. Kurali bir yere koyup ucune de sordurmak bunun tek caresi.
//
// Sinir: burada YALNIZCA "deneme harcanabilir mi" karari var. "SIM takili mi",
// "nvram'a ne yazilacak" gibi yola ozgu sorular cagiranda kalir.

import { problem } from "./problems.js";

// GSM'de PIN sayaci 3'te baslar. Modul toplami bildirirse o kullanilir.
export const PIN_TOPLAM_VARSAYILAN = 3;

// Bu SIM'de daha once bir deneme HARCANMIS mi? Tek sinyal, iki farkli karar
// buna bakiyor: (a) yeni bir deneme yapilir mi, (b) modemde saklanan PIN bu
// SIM'e ait olmadigi icin temizlenir mi. Ikisi ayri karar, sinyal ayni —
// tanimi tek yerde tutuyoruz.
export function hakYakilmisMi(kilit = {}) {
  const { pin_kalan: kalan, pin_toplam: toplam } = kilit;
  if (kalan === null || kalan === undefined) return false;
  return kalan < (toplam ?? PIN_TOPLAM_VARSAYILAN);
}

const red = (kod, ...args) => ({ uygun: false, sebep: kod, problems: [problem(kod, ...args)] });
const izin = (problems = []) => ({ uygun: true, sebep: null, problems });

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
export function hakDurumu(kilit = {}, { elleOnay = false } = {}) {
  if (kilit.kilit === "puk") return red("SIM_PUK_LOCKED", kilit.puk_kalan);

  const kalan = kilit.pin_kalan;
  // Sayac okunamadi: is durdurulmaz — sayaci bildirmeyen bir modul yuzunden
  // her SIM'i kilitlemek yanlis olurdu — ama karar uyariyla tasinir.
  if (kalan === null || kalan === undefined) return izin([problem("PIN_KALAN_BILINMIYOR")]);

  // SON HAK: elleOnay bile gecemez. Yanlis PIN burada PUK demek.
  if (kalan <= 1) return red("PIN_LAST_ATTEMPT", kalan);

  // Daha once hak yanmis: emin olmadan devam etmek ikinci hakki da yakar.
  if (hakYakilmisMi(kilit) && !elleOnay) {
    return red("PIN_HAK_YANMIS", kalan, kilit.pin_toplam ?? PIN_TOPLAM_VARSAYILAN);
  }

  return izin();
}

// PIN dahil TAM karar. Bicim kontrolu once: bozuk PIN garantili bosa
// harcanmis deneme, cihaza HIC gitmemeli.
export function pinDenemesiUygunMu(kilit = {}, pin, { elleOnay = false } = {}) {
  if (pin === null || pin === undefined || pin === "") return red("PIN_REQUIRED");
  if (!/^\d{4,8}$/.test(String(pin))) return red("PIN_INVALID");
  return hakDurumu(kilit, { elleOnay });
}
