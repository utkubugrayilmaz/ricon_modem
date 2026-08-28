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
} from "./provisioning.js";
export {
  FIELD_PROFILE, FACTORY_PROFILE, PROFILES, DEVICE_NAME_KEY, SIM_PIN_KEY,
} from "./profile.js";
export {
  provisionModem, provisionLoop, pcPreflight, nextAction, provisionRecord,
  readIdentity, simTakiliMi, waitForInternet, simPinHedefi,
  assessDevice, provisionEksikleri,
} from "./pipeline.js";
export { readSim, normalizePhone, telefonGirdiBicimi, parseSimStatus } from "./sim.js";
// PIN denemesi kararlari — PURE, TEK YER. nvram yolu, AT yolu ve
// internet-sonrasi deneme yolu ucu de buraya soruyor.
export {
  pinDenemesiUygunMu, hakDurumu, hakYakilmisMi, PIN_TOPLAM_VARSAYILAN,
} from "./pin-karar.js";
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
export { sorunTr, problemleriTurkcelestir, SORUN_TR } from "./sorun-metni.js";
export { PROBLEM_CODES } from "./problems.js";
// Cihaz OKUMA islemleri (dogrula/oku/kesif/konsol) ve IZLEME. Govdeleri ayri
// modullerde: bu dosya KAPI, uygulama degil.
export {
  checkDevice, readDevice, systemView, discoverDevice, readConsole,
} from "./okuma.js";
export { watchDevice, kesintileriBul } from "./izleme.js";
// nvram: ikili tam yedek cozumleyici + saf diff.
export { parseNvram, diffNvram, computeNvramDiff } from "./nvram.js";
// Olcum ozeti — PURE, kaydedilmis calistirma satirlarindan istatistik.
export { summarizeMetrics, dagilim } from "./metrics.js";
export { SETTING_LABELS } from "./constants.js";
