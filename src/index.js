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
} from "./flow/provisioning.js";
export {
  FIELD_PROFILE, FACTORY_PROFILE, PROFILES, DEVICE_NAME_KEY, SIM_PIN_KEY,
} from "./domain/profile.js";
export {
  provisionModem, provisionLoop, nextAction, provisionRecord, simPinHedefi,
} from "./flow/pipeline.js";
// Cihaz temel okumalari + PC on-kontrolu — en alt katman. Okuma yolu da
// yazma yolu da buna bakiyor (aralarinda bagimlilik yok).
export {
  readIdentity, simTakiliMi, waitForInternet, pcPreflight,
} from "./device/cihaz.js";
// Cihaz DEGERLENDIRME — "ne durumda, ne eksik, tekrar bakmali miyim?"
// yenidenDenemeKarari PURE: tekrar politikasi cekirdekte, arayuzde degil.
export {
  assessDevice, provisionEksikleri, yenidenDenemeKarari, degerlendirmeyiIzle,
} from "./flow/degerlendirme.js";
export { readSim, normalizePhone, telefonGirdiBicimi, parseSimStatus } from "./device/sim.js";
// PIN denemesi kararlari — PURE, TEK YER. nvram yolu, AT yolu ve
// internet-sonrasi deneme yolu ucu de buraya soruyor.
export {
  pinDenemesiUygunMu, hakDurumu, hakYakilmisMi, PIN_TOPLAM_VARSAYILAN,
} from "./domain/pin-karar.js";
// AT katmani — modulun kendisiyle konusma (telefon numarasi, SIM kilidi).
export {
  readMsisdn, readSimLock, simPinKaldir,
  simKilitKaldirmaKarari, simKilidiUygunMu,
  atPortBul, atKomut, atYazanMi, AT_PORT,
  parseCnum, parseCpin, parsePinCounter, parseClck, parseCcid,
} from "./device/at.js";
// Konsol katmani — telnet root shell. Kendi komutunu calistirmak isteyen
// tuketici icin acik: runConsole(opts, ["uname -a"]).
export {
  runConsole, consoleNvram, consoleRecon, konsolKimligi, parseNvramShow,
} from "./transport/console.js";
// Gosterim sozlugu — UI/rapor icin (motor kullanmaz).
export { settingLabel } from "./report/report.js";
// Sorun metinleri — kod -> operatore gosterilecek TURKCE. TEK sozluk.
export { sorunTr, problemleriTurkcelestir, SORUN_TR } from "./domain/sorun-metni.js";
export { PROBLEM_CODES } from "./domain/problems.js";
// Cihaz OKUMA islemleri (dogrula/oku/kesif/konsol) ve IZLEME. Govdeleri ayri
// modullerde: bu dosya KAPI, uygulama degil.
export {
  checkDevice, readDevice, systemView, discoverDevice, readConsole,
} from "./device/okuma.js";
// nvram: ikili tam yedek cozumleyici + saf diff.
export { parseNvram, diffNvram, computeNvramDiff } from "./parse/nvram.js";
export { SETTING_LABELS } from "./domain/constants.js";
