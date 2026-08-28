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

import { isReachable } from "./scanner.js";
import { readSim, normalizePhone, parseSimStatus } from "./sim.js";
import { readMsisdn, readSimLock, isSimLockEligible } from "./at.js";
import { problem, isOk } from "./problems.js";
// Alt katman: OKUMA yolu da YAZMA yolu da buraya bakiyor (bkz. cihaz.js).
import { readIdentity, isSimPresent, pcPreflight } from "./cihaz.js";

const now = () => new Date().toISOString();
const subnetPrefix = (ip) => ip.split(".").slice(0, 3).join(".") + ".";
const notify = (options, m) => { if (typeof options.onProgress === "function") options.onProgress(m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// PURE: hazırlamaya başlamak için NE EKSİK? Tüketici (UI/endpoint/terminal)
// buna bakıp hangi ekranı göstereceğine karar verir — karar mantığı burada,
// arayüzde değil. Sıra ÖNEMLİ: en temel eksik başta.
//
// Doner: ["modem"] | ["sim"] | ["phone"] | ["pin"] | []  (boş = başlanabilir)
export function provisioningGaps({ modemPresent, simPresent, simLock, phone, pin } = {}) {
  const missing = [];
  if (!modemPresent) missing.push("modem");
  else if (!simPresent) missing.push("sim");
  if (!normalizePhone(phone)) missing.push("phone");
  // PIN yalnızca cihaz KİLİT BİLDİRDİYSE ve elimizde PIN yoksa eksiktir.
  // Kilit yoksa PIN sorulmaz — proje hedefi PIN'siz akış.
  if (simLock?.lock === "pin" && !pin) missing.push("pin");
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
export async function assessDevice(options) {
  const {
    factoryHost = "192.168.1.1", fieldHost = "5.5.5.1",
    kimlik, phone = null, pin = null,
  } = options;
  const on = pcPreflight(subnetPrefix(factoryHost), subnetPrefix(fieldHost));
  const report = {
    timestamp: now(), command: "degerlendir",
    pc: { ready: on.ready, problems: on.problems },
    modem: { location: null, host: null },
    kimlik: null, sim: null,
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

  const factoryReachable = await isReachable(factoryHost, on.factorySource);
  const fieldReachable = factoryReachable ? false : await isReachable(fieldHost, on.fieldSource);
  const location = factoryReachable
    ? { host: factoryHost, sourceIp: on.factorySource, name: "factory" }
    : fieldReachable ? { host: fieldHost, sourceIp: on.fieldSource, name: "field" } : null;
  report.modem = { location: location?.name ?? null, host: location?.host ?? null };

  if (location && kimlik) {
    let k = null;
    try { k = await readIdentity({ ...location, kimlik }); } catch { /* kismi sonuc gecerli */ }
    if (k) {
      report.kimlik = { iccid: k.iccid, imei: k.imei, imsi: k.imsi,
        lanMac: k.lanMac, operator: k.operator };
      report.sim = { present: isSimPresent(k), ...k.sim };
      report.internet = { online: Boolean(k.wanIp), wanIp: k.wanIp };
      if (!isSimPresent(k)) report.problems.push(problem("SIM_MISSING", k.simStatus));
      else if (k.sim?.lock === "pin") report.problems.push(problem("SIM_PIN_LOCKED", k.sim.pinRemaining));
      else if (k.sim?.lock === "puk") report.problems.push(problem("SIM_PUK_LOCKED", k.sim.pukRemaining));
    }
  }
  if (!location) report.problems.push(problem("DEVICE_UNREACHABLE", `${factoryHost}/${fieldHost}`));

  // SIM PIN KILITLI: kalan hakki MODULDEN oku. Web sayfasi bu sayiyi her zaman
  // vermiyor (2026-08-28: `pin_kalan: null` geldi), AT tarafi veriyor
  // (`+QPINC: "SC",3,10`). Bu sayi bir GUVENLIK kararinin girdisi — "daha once
  // hak yanmis mi?" — o yuzden tahmine birakilmaz, ~3 sn'ye deger. Yalnizca
  // KILITLI durumda okunuyor: acik SIM'de gereksiz bir tur olurdu.
  if (location && kimlik && report.sim?.lock === "pin") {
    notify(options, "SIM kilidi modulden okunuyor (kalan hak)");
    const k = await readSimLock({ ...location, kimlik });
    report.atPort = k.atPort;
    if (k.atPort) {
      report.sim = { ...report.sim,
        statusFromModule: k.status,
        pinRemaining: k.pinRemaining ?? report.sim.pinRemaining,
        pukRemaining: k.pukRemaining ?? report.sim.pukRemaining };
    }
    // Kilit kaldirmaya UYGUN MU? Karar cekirdekte (simKilidiUygunMu); tuketici
    // yalnizca gosterir.
    //
    // elleOnay:true — cunku bu bilgi INSANA gosterilecek bir dugme icin.
    // "Bir hak yakildiysa bir daha deneme" kurali OTOMATIK yol icindir: arac
    // kendi kendine ayni isi tekrarlamasin. Operatorun baska bir PIN denemesini
    // engellemek yanlis olur — dogru PIN'i bilen odur. Insanin da gecemedigi
    // tek kural SON HAK; onu hakDurumu zaten elleOnay'a bakmadan reddediyor.
    const u = isSimLockEligible(report.sim, { humanApproved: true });
    report.pinRemovable = { eligible: u.eligible, reason: u.reason };
    report.problems.push(...u.problems.filter((p) => p.severity === "warning"));
  }

  // TELEFON NUMARASINI CIHAZDAN OKU — artik elle girmeye gerek yok.
  // Yalnizca SIM HAZIRSA denenir: kilitli SIM abone verisini (EF_MSISDN)
  // acmiyor, canli olculdu (2026-08-27). Kilitliyse once PIN, sonra numara.
  if (location && kimlik && report.sim?.ready) {
    notify(options, "telefon numarasi cihazdan okunuyor (AT+CNUM)");
    const n = await readMsisdn({ ...location, kimlik });
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
  // başarıyla okunduğu halde eksik ["phone"] kalıyor, başlatılabilir
  // yanlışlıkla false oluyordu (2026-08-28 canlı görüldü). Numaranın NEREDEN
  // geldiği kararı ilgilendirmez — elimizde geçerli numara var mı, o yeter.
  report.missing = provisioningGaps({
    modemPresent: Boolean(location),
    simPresent: report.sim?.present ?? false,
    simLock: report.sim ?? null,
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
// Doner: { tekrar, sonra_sn, sebep }
export function retryDecision(report = {}) {
  const codes = new Set((report.problems || []).map((p) => p.code));
  const hayir = (reason) => ({ retry: false, delaySec: null, reason });
  const evet = (delaySec, reason) => ({ retry: true, delaySec, reason });

  // Is bitti: operator baslatacak.
  if (report.canStart) return hayir("canStart");

  // PC agi yok -> kablo/modem bekleniyor. Ucuz kontrol, sik bak.
  if (report.pc && report.pc.ready === false) return evet(3, "pcNotReady");

  // Modem yok -> takilmasi bekleniyor. Sik bak, ucuz (TCP yoklama).
  if (!report.modem?.host) return evet(3, "noModem");

  // Insan mudahalesi bekleniyor: tekrar bakmak ayni cevabi verir.
  if (codes.has("SIM_PUK_LOCKED")) return hayir("waitingForHumanPuk");
  if (report.sim?.lock === "pin") return hayir("waitingForPin");
  if (codes.has("MSISDN_NOT_ON_SIM")) return hayir("numberNotOnSim");
  if (codes.has("MSISDN_MISMATCH")) return hayir("operatorDecision");

  // SIM present degil -> FIZIKSEL is: modem kapatilip SIM takilacak. Bakmaya
  // devam ama seyrek; operator bu arada modemi kapatacak.
  if (report.sim && report.sim.present === false) return evet(10, "waitingForSim");

  // GECICI aksilik: telnet dustu / AT portu cevap vermedi / istek yarida
  // kaldi. Tam olarak tarayici yenileyince duzelen durum bu.
  for (const k of ["REQUEST_FAILED", "AT_PORT_NOT_FOUND", "DEVICE_BUSY", "EMPTY_BODY"]) {
    if (codes.has(k)) return evet(5, "transient");
  }

  // Eksik var ama sebebini tanimadik: seyrek tekrar, sessiz kalmaktan iyi.
  if ((report.missing || []).length) return evet(10, "hasGaps");
  return hayir("noRetryNeeded");
}

// Degerlendirmeyi TEKRARLAYARAK izler. Karar yukaridaki saf fonksiyondan
// gelir; burada yalniz bekleme ve olay var.
//
// opts: assessDevice opts + { olay(rapor), dur() }
//   olay : her degerlendirme sonucunda cagrilir (tuketici ekrani gunceller)
//   dur  : true donerse dongu biter (tuketici iptal edebilir)
// Doner: son rapor.
export async function watchAssessment(options = {}) {
  const enFazla = options.enFazlaTur ?? Infinity;
  let report = null;
  for (let kind = 0; kind < enFazla; kind += 1) {
    report = await assessDevice(options);
    report.retry = retryDecision(report);
    if (typeof options.event === "function") {
      try { options.event(report); } catch { /* dinleyici hatasi donguyu kesmez */ }
    }
    if (!report.retry.retry) return report;
    if (typeof options.dur === "function" && options.dur()) return report;
    await wait(report.retry.delaySec * 1000);
  }
  return report;
}
