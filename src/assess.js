// Cihaz DEGERLENDIRME — "su an ne durumda, ne eksik, tekrar bakmali miyim?"
//
// Provizyon orkestrasyonundan (pipeline.js) ayri: orasi CIHAZI DEGISTIRIYOR,
// burasi yalniz OKUYOR ve karar veriyor. Ayni dosyada dururken pipeline.js
// 726 satirdi ve iki isi vardi.
//
// TEKRAR KARARI DA BURADA. Sebebi somut: numara okumasi gecici olarak
// basarisiz oldugunda arac vazgeciyordu ve operator tarayiciyi yenilemek
// zorunda kaliyordu. "Tekrar bakalim mi, ne kadar sonra?" bir KARAR'dir —
// arayuze gomulmez, cekirdekte durur ve CLI/endpoint/UI ayni cevaba bakar.

import { isReachable } from "./net.js";
import { normalizePhone } from "./device.js";
import { readMsisdn, readSimLock, isSimLockEligible } from "./at.js";
import { problem, isOk } from "./problems.js";
// Alt katman: OKUMA yolu da YAZMA yolu da buraya bakiyor (bkz. cihaz.js).
import { readIdentity, isSimPresent, pcPreflight } from "./device.js";

const now = () => new Date().toISOString();
const prefixOf = (ip) => ip.split(".").slice(0, 3).join(".") + ".";
const notify = (opts, m) => { if (typeof opts.progress === "function") opts.progress(m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// PURE: hazırlamaya başlamak için NE EKSİK? Tüketici (UI/endpoint/terminal)
// buna bakıp hangi ekranı göstereceğine karar verir — karar mantığı burada,
// arayüzde değil. Sıra ÖNEMLİ: en temel eksik başta.
//
// Doner: ["modem"] | ["sim"] | ["phone"] | ["pin"] | []  (boş = başlanabilir)
export function provisioningGaps({ modemUp, simPresent, simLockInfo, phone, pin } = {}) {
  const missing = [];
  if (!modemUp) missing.push("modem");
  else if (!simPresent) missing.push("sim");
  if (!normalizePhone(phone)) missing.push("phone");
  // PIN yalnızca cihaz KİLİT BİLDİRDİYSE ve elimizde PIN yoksa eksiktir.
  // Kilit yoksa PIN sorulmaz — proje hedefi PIN'siz akış.
  if (simLockInfo?.lock === "pin" && !pin) missing.push("pin");
  // PUK kilidi "eksik girdi" değil, insan müdahalesi gerektiren bir arıza:
  // eksik listesine koymuyoruz, problems ile bildiriliyor.
  return missing;
}

// Cihazın O ANKI durumu ve ne eksik — TEK ÇAĞRI.
//
// Neden ayrı fonksiyon: "modem bağlandı → numarayı çek → PIN gerekiyor mu bak
// → gerekiyorsa iste, gerekmiyorsa başlat" kararı TÜKETİCİDE tekrarlanmasın.
// UI, endpoint ve terminal aynı cevaba bakar.
//
// PAHALI: kimlik okuması (~4 sn) yapar. Sürekli yoklama için DEĞİL — modem
// algılandığında BİR KEZ çağrılmalı (tek bağlantılı cihazı boğmayalım).
export async function assessDevice(opts) {
  const {
    factoryHost = "192.168.1.1", fieldHost = "5.5.5.1",
    credentials, phone = null, pin = null,
  } = opts;
  const on = pcPreflight(prefixOf(factoryHost), prefixOf(fieldHost));
  const report = {
    timestamp: now(), command: "assess",
    pc: { ready: on.ready, problems: on.problems },
    modem: { location: null, host: null },
    identity: null, sim: null,
    phone: { number: normalizePhone(phone), source: phone ? "input" : "none" },
    internet: null,
    problems: [...on.problems],
  };
  if (!on.ready) {
    report.missing = ["pc"];
    report.canStart = false;
    report.ok = false;
    return report;
  }

  // IKI ADRES AYNI ANDA yoklanir. Sirayla yoklamak, modem SAHA adresindeyken
  // once fabrika zaman asimini odemek demekti (olculdu: assessDevice'in
  // 3.4 sn'sinin 3 sn'si buydu). Farkli hostlar, cakisma yok.
  // Oncelik korunuyor: ikisi de cevap verirse FABRIKA kazanir.
  const [factoryUp, fieldAnswer] = await Promise.all([
    isReachable(factoryHost, on.factorySource),
    isReachable(fieldHost, on.fieldSource),
  ]);
  const fieldUp = factoryUp ? false : fieldAnswer;
  const location = factoryUp
    ? { host: factoryHost, sourceIp: on.factorySource, name: "factory" }
    : fieldUp ? { host: fieldHost, sourceIp: on.fieldSource, name: "field" } : null;
  report.modem = { location: location?.name ?? null, host: location?.host ?? null };

  if (location && credentials) {
    let k = null;
    try { k = await readIdentity({ ...location, credentials }); } catch { /* kismi sonuc gecerli */ }
    if (k) {
      report.identity = { iccid: k.iccid, imei: k.imei, imsi: k.imsi,
        lan_mac: k.lan_mac, operator: k.operator };
      report.identityRead = k.readOk !== false;
      report.sim = { present: isSimPresent(k), ...k.sim };
      report.internet = { up: Boolean(k.wan_ip), wan_ip: k.wan_ip };
      // Okuma olmadiysa "SIM yok" DEME — o bir teshis degil tahmin olurdu.
      // Cihazin okunamamasi zaten bir sorun ve retryDecision onu gecici
      // sayip tekrar bakiyor; SIM_MISSING ise insan mudahalesi isteyen
      // kalici bir teshis. Ikisini karistirmak yanlis yonlendirir.
      if (k.readOk === false) report.problems.push(...k.problems);
      else if (!isSimPresent(k)) report.problems.push(problem("SIM_MISSING", k.simStatus));
      else if (k.sim?.lock === "pin") report.problems.push(problem("SIM_PIN_LOCKED", k.sim.pinRemaining));
      else if (k.sim?.lock === "puk") report.problems.push(problem("SIM_PUK_LOCKED", k.sim.pukRemaining));
    }
  }
  if (!location) report.problems.push(problem("DEVICE_UNREACHABLE", `${factoryHost}/${fieldHost}`));

  // SIM PIN KILITLI: kalan hakki MODULDEN oku. Web sayfasi bu sayiyi her zaman
  // vermiyor (2026-08-28: `pinRemaining: null` geldi), AT tarafi veriyor
  // (`+QPINC: "SC",3,10`). Bu sayi bir GUVENLIK kararinin girdisi — "daha once
  // hak yanmis mi?" — o yuzden tahmine birakilmaz, ~3 sn'ye deger. Yalnizca
  // KILITLI durumda okunuyor: acik SIM'de gereksiz bir tur olurdu.
  if (location && credentials && report.sim?.lock === "pin") {
    notify(opts, "reading the SIM lock from the module (attempts left)");
    const k = await readSimLock({ ...location, credentials });
    report.atPort = k.atPort;
    if (k.atPort) {
      report.sim = { ...report.sim,
        statusModule: k.status,
        pinRemaining: k.pinRemaining ?? report.sim.pinRemaining,
        pukRemaining: k.pukRemaining ?? report.sim.pukRemaining };
    }
    // Kilit kaldirmaya UYGUN MU? Karar cekirdekte (isSimLockEligible); tuketici
    // yalnizca gosterir.
    //
    // manualConsent:true — cunku bu bilgi INSANA gosterilecek bir dugme icin.
    // "Bir hak yakildiysa bir daha deneme" kurali OTOMATIK yol icindir: arac
    // kendi kendine ayni isi tekrarlamasin. Operatorun baska bir PIN denemesini
    // engellemek yanlis olur — dogru PIN'i bilen odur. Insanin da gecemedigi
    // tek kural SON HAK; onu attemptState zaten manualConsent'a bakmadan reddediyor.
    const u = isSimLockEligible(report.sim, { manualConsent: true });
    report.pinRemovable = { eligible: u.eligible, reason: u.reason };
    report.problems.push(...u.problems.filter((p) => p.severity === "warning"));
  }

  // TELEFON NUMARASINI CIHAZDAN OKU — artik elle girmeye gerek yok.
  // Yalnizca SIM HAZIRSA denenir: kilitli SIM abone verisini (EF_MSISDN)
  // acmiyor, canli olculdu (2026-08-27). Kilitliyse once PIN, sonra numara.
  if (location && credentials && report.sim?.ready) {
    notify(opts, "reading the phone number from the device (AT+CNUM)");
    const n = await readMsisdn({ ...location, credentials });
    report.atPort = n.atPort;
    if (n.phone) {
      const manual = normalizePhone(phone);
      if (manual && manual !== n.phone) {
        // Cihazdaki numara SIM'in KENDISINDEN geliyor; elle girilen yanlis
        // olabilir. Sessizce birini secmek yerine ikisini de bildiriyoruz.
        report.problems.push(problem("MSISDN_MISMATCH", manual, n.phone));
      }
      report.phone = { number: n.phone, source: "device" };
    } else {
      report.problems.push(...n.problems);
    }
  }

  // "Ne eksik" kararı ÇÖZÜLMÜŞ numaraya bakar, ham girdiye DEĞİL. Eskiden
  // buraya `telefon` (operatörün yazdığı) geçiliyordu: cihazdan numara
  // başarıyla okunduğu halde eksik ["telefon"] kalıyor, başlatılabilir
  // yanlışlıkla false oluyordu (2026-08-28 canlı görüldü). Numaranın NEREDEN
  // geldiği kararı ilgilendirmez — elimizde geçerli numara var mı, o yeter.
  report.missing = provisioningGaps({
    modemUp: Boolean(location),
    simPresent: report.sim?.present ?? false,
    simLockInfo: report.sim ?? null,
    phone: report.phone.number, pin,
  });
  report.canStart = report.missing.length === 0;
  report.ok = isOk(report.problems);
  return report;
}
// --- TEKRAR KARARI (PURE) ---
//
// Ayrim su: INSAN mi bekleniyor, yoksa GECICI bir aksilik mi oldu?
//   - Gecici aksilik (telnet dustu, port cevap vermedi, modem yok) -> tekrar
//     bakmak durumu duzeltir. Arac kendisi baksin; kimse tarayici yenilemesin.
//   - Insan bekleniyor (PIN girilecek, numara elle yazilacak, PUK acilacak)
//     -> tekrar bakmak AYNI cevabi verir. Bosa yoklama, tek baglantili cihazi
//     mesgul eder ve ekrani titretir.
//
// Süreler cihazin hizina gore: degerlendirme ~5 sn suruyor, bu yuzden en
// sik tekrar 3 sn (yoklama degil, "kablo takildi mi" bakisi).
//
// Doner: { tekrar, afterSec, sebep }
export function retryDecision(report = {}) {
  const codes = new Set((report.problems || []).map((p) => p.code));
  const no = (reason) => ({ retry: false, afterSec: null, reason });
  const yes = (afterSec, reason) => ({ retry: true, afterSec, reason });

  // Is bitti: operator baslatacak.
  if (report.canStart) return no("can_start");

  // PC agi yok -> kablo/modem bekleniyor. Ucuz kontrol, sik bak.
  if (report.pc && report.pc.ready === false) return yes(3, "pc_not_ready");

  // Modem yok -> takilmasi bekleniyor. Sik bak, ucuz (TCP yoklama).
  if (!report.modem?.host) return yes(3, "no_modem");

  // Insan mudahalesi bekleniyor: tekrar bakmak ayni cevabi verir.
  if (codes.has("SIM_PUK_LOCKED")) return no("puk_needs_human");
  if (report.sim?.lock === "pin") return no("pin_pending");
  if (codes.has("MSISDN_NOT_ON_SIM")) return no("msisdn_not_on_sim");
  if (codes.has("MSISDN_MISMATCH")) return no("operator_decision");

  // SIM takili degil -> FIZIKSEL is: modem kapatilip SIM takilacak. Bakmaya
  // devam ama seyrek; operator bu arada modemi kapatacak.
  if (report.sim && report.sim.present === false) return yes(10, "waiting_sim");

  // GECICI aksilik: telnet dustu / AT portu cevap vermedi / istek yarida
  // kaldi. Tam olarak tarayici yenileyince duzelen durum bu.
  for (const k of ["REQUEST_FAILED", "AT_PORT_NOT_FOUND", "DEVICE_BUSY", "EMPTY_BODY"]) {
    if (codes.has(k)) return yes(5, "temporary_error");
  }

  // Eksik var ama sebebini tanimadik: seyrek tekrar, sessiz kalmaktan iyi.
  if ((report.missing || []).length) return yes(10, "gaps_remain");
  return no("no_retry_needed");
}

// Degerlendirmeyi TEKRARLAYARAK izler. Karar yukaridaki saf fonksiyondan
// gelir; burada yalniz bekleme ve olay var.
//
// opts: assessDevice opts + { olay(rapor), dur() }
//   olay : her degerlendirme sonucunda cagrilir (tuketici ekrani gunceller)
//   dur  : true donerse dongu biter (tuketici iptal edebilir)
// Doner: son rapor.
export async function watchAssessment(opts = {}) {
  const atMost = opts.maxRounds ?? Infinity;
  let report = null;
  for (let round = 0; round < atMost; round += 1) {
    report = await assessDevice(opts);
    report.retry = retryDecision(report);
    if (typeof opts.event === "function") {
      try { opts.event(report); } catch { /* dinleyici hatasi donguyu kesmez */ }
    }
    if (!report.retry.retry) return report;
    if (typeof opts.halt === "function" && opts.halt()) return report;
    await wait(report.retry.afterSec * 1000);
  }
  return report;
}
