// Public API — TEK KAPI. Bu dosyada UYGULAMA YOKTUR, yalnizca ne disa
// acildigini soyler; govdeler alanina gore modullerde. Amac: "bu paket ne
// yapabiliyor?" sorusunun cevabi bir ekrana sigsin.
//
// KURAL (tum cekirdek icin): process.env OKUNMAZ, argv OKUNMAZ, stdout'a
// YAZILMAZ. Girdi acikca `opts` ile gelir, cikti bir sonuc nesnesidir —
// throw yok, problems[] var. Tuketiciler: ricon.js (CLI), src/server.js
// (HTTP), ya da baska bir Node projesi (paket olarak import).
//
// opts (ortak): { host, kaynakIp, kimlik:{kullanici,sifre}|null }
// Ilerleme istersen opts.ilerle(mesaj) verilebilir (varsayilan: yok).


// Provizyon (Faz 3) — çekirdek dışa aktarımı (paket/CLI/endpoint aynı API).
export {
  applyProvisioning, planProvisioning, groupPlan, applyPin,
} from "./provision.js";
export {
  FIELD_PROFILE, FACTORY_PROFILE, PROFILES, DEVICE_NAME_KEY, SIM_PIN_KEY,
} from "./settings.js";
export {
  provisionModem, provisionLoop, nextAction, provisionRecord, simPinHedefi,
} from "./pipeline.js";
// Cihaz temel okumalari + PC on-kontrolu — en alt katman. Okuma yolu da
// yazma yolu da buna bakiyor (aralarinda bagimlilik yok).
export {
  readIdentity, simTakiliMi, waitForInternet, pcPreflight,
} from "./device.js";
// Cihaz DEGERLENDIRME — "ne durumda, ne eksik, tekrar bakmali miyim?"
// yenidenDenemeKarari PURE: tekrar politikasi cekirdekte, arayuzde degil.
export {
  assessDevice, provisionEksikleri, yenidenDenemeKarari, degerlendirmeyiIzle,
} from "./assess.js";
export { readSim, normalizePhone, telefonGirdiBicimi, parseSimStatus } from "./device.js";
// PIN denemesi kararlari — PURE, TEK YER. nvram yolu, AT yolu ve
// internet-sonrasi deneme yolu ucu de buraya soruyor.
export {
  pinDenemesiUygunMu, hakDurumu, hakYakilmisMi, PIN_TOPLAM_VARSAYILAN,
} from "./at.js";
// AT katmani — modulun kendisiyle konusma (telefon numarasi, SIM kilidi).
export {
  readMsisdn, readSimLock, simPinKaldir, simPinKilitle,
  simKilitKaldirmaKarari, simKilidiUygunMu,
  atPortBul, atKomut, atYazanMi, AT_PORT,
  parseCnum, parseCpin, parsePinCounter, parseClck, parseCcid,
} from "./at.js";
// Konsol katmani — telnet root shell. Kendi komutunu calistirmak isteyen
// tuketici icin acik: runConsole(opts, ["uname -a"]).
export {
  runConsole, consoleNvram, consoleRecon, konsolKimligi, parseNvramShow,
} from "./console.js";
// Gosterim sozlugu — UI/rapor icin (motor kullanmaz).
export { settingLabel } from "./report.js";
// Sorun metinleri — kod -> operatore gosterilecek TURKCE. TEK sozluk.
export { sorunTr, problemleriTurkcelestir, SORUN_TR } from "./problems.js";
export { PROBLEM_CODES } from "./problems.js";
// Cihaz OKUMA islemleri (dogrula/oku/konsol). Govdeleri ayri modullerde:
// bu dosya KAPI, uygulama degil.
export {
  checkDevice, readDevice, systemView, readConsole,
} from "./read.js";
// nvram: ikili tam yedek cozumleyici + saf diff.
export { parseNvram, diffNvram, computeNvramDiff } from "./nvram.js";
// Ag: "cihaz orada mi", "hangi yerel adresten cikmaliyim". Client BILEREK
// disa acilmiyor — bir sinif, `calistir` ile cagrilamaz ve modemle konusmanin
// dogru yolu zaten yukaridaki fonksiyonlar.
export { isReachable, findSourceIp, localInterfaces, guessVendor } from "./net.js";
// Olcum ozeti — PURE, kaydedilmis calistirma satirlarindan istatistik.
export { summarizeMetrics, dagilim } from "./report.js";
export { SETTING_LABELS, DEFAULT_HOST } from "./settings.js";
