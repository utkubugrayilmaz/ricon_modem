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

import { isReachable } from "../transport/scanner.js";
import { normalizePhone } from "../device/sim.js";
import { readMsisdn, readSimLock, simKilidiUygunMu } from "../device/at.js";
import { problem, isOk } from "../domain/problems.js";
// Alt katman: OKUMA yolu da YAZMA yolu da buraya bakiyor (bkz. cihaz.js).
import { readIdentity, simTakiliMi, pcPreflight } from "../device/cihaz.js";

const now = () => new Date().toISOString();
const onekAl = (ip) => ip.split(".").slice(0, 3).join(".") + ".";
const bildir = (opts, m) => { if (typeof opts.ilerle === "function") opts.ilerle(m); };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

// PURE: hazırlamaya başlamak için NE EKSİK? Tüketici (UI/endpoint/terminal)
// buna bakıp hangi ekranı göstereceğine karar verir — karar mantığı burada,
// arayüzde değil. Sıra ÖNEMLİ: en temel eksik başta.
//
// Doner: ["modem"] | ["sim"] | ["telefon"] | ["pin"] | []  (boş = başlanabilir)
export function provisionEksikleri({ modemVar, simTakili, simKilit, telefon, pin } = {}) {
  const eksik = [];
  if (!modemVar) eksik.push("modem");
  else if (!simTakili) eksik.push("sim");
  if (!normalizePhone(telefon)) eksik.push("telefon");
  // PIN yalnızca cihaz KİLİT BİLDİRDİYSE ve elimizde PIN yoksa eksiktir.
  // Kilit yoksa PIN sorulmaz — proje hedefi PIN'siz akış.
  if (simKilit?.kilit === "pin" && !pin) eksik.push("pin");
  // PUK kilidi "eksik girdi" değil, insan müdahalesi gerektiren bir arıza:
  // eksik listesine koymuyoruz, problems ile bildiriliyor.
  return eksik;
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
    fabrikaHost = "192.168.1.1", sahaHost = "5.5.5.1",
    kimlik, telefon = null, pin = null,
  } = opts;
  const on = pcPreflight(onekAl(fabrikaHost), onekAl(sahaHost));
  const rapor = {
    zaman: now(), komut: "degerlendir",
    pc: { hazir: on.hazir, problems: on.problems },
    modem: { konum: null, host: null },
    kimlik: null, sim: null,
    telefon: { numara: normalizePhone(telefon), kaynak: telefon ? "girdi" : "yok" },
    internet: null,
    problems: [...on.problems],
  };
  if (!on.hazir) {
    rapor.eksik = ["pc"];
    rapor.baslatilabilir = false;
    rapor.ok = false;
    return rapor;
  }

  // IKI ADRES AYNI ANDA yoklanir. Sirayla yoklamak, modem SAHA adresindeyken
  // once fabrika zaman asimini odemek demekti (olculdu: assessDevice'in
  // 3.4 sn'sinin 3 sn'si buydu). Farkli hostlar, cakisma yok.
  // Oncelik korunuyor: ikisi de cevap verirse FABRIKA kazanir.
  const [fabrikaVar, sahaCevap] = await Promise.all([
    isReachable(fabrikaHost, on.fabrikaKaynak),
    isReachable(sahaHost, on.sahaKaynak),
  ]);
  const sahaVar = fabrikaVar ? false : sahaCevap;
  const konum = fabrikaVar
    ? { host: fabrikaHost, kaynakIp: on.fabrikaKaynak, ad: "fabrika" }
    : sahaVar ? { host: sahaHost, kaynakIp: on.sahaKaynak, ad: "saha" } : null;
  rapor.modem = { konum: konum?.ad ?? null, host: konum?.host ?? null };

  if (konum && kimlik) {
    let k = null;
    try { k = await readIdentity({ ...konum, kimlik }); } catch { /* kismi sonuc gecerli */ }
    if (k) {
      rapor.kimlik = { iccid: k.iccid, imei: k.imei, imsi: k.imsi,
        lan_mac: k.lan_mac, operator: k.operator };
      rapor.sim = { takili: simTakiliMi(k), ...k.sim };
      rapor.internet = { var: Boolean(k.wan_ip), wan_ip: k.wan_ip };
      if (!simTakiliMi(k)) rapor.problems.push(problem("SIM_MISSING", k.sim_durumu));
      else if (k.sim?.kilit === "pin") rapor.problems.push(problem("SIM_PIN_LOCKED", k.sim.pin_kalan));
      else if (k.sim?.kilit === "puk") rapor.problems.push(problem("SIM_PUK_LOCKED", k.sim.puk_kalan));
    }
  }
  if (!konum) rapor.problems.push(problem("DEVICE_UNREACHABLE", `${fabrikaHost}/${sahaHost}`));

  // SIM PIN KILITLI: kalan hakki MODULDEN oku. Web sayfasi bu sayiyi her zaman
  // vermiyor (2026-08-28: `pin_kalan: null` geldi), AT tarafi veriyor
  // (`+QPINC: "SC",3,10`). Bu sayi bir GUVENLIK kararinin girdisi — "daha once
  // hak yanmis mi?" — o yuzden tahmine birakilmaz, ~3 sn'ye deger. Yalnizca
  // KILITLI durumda okunuyor: acik SIM'de gereksiz bir tur olurdu.
  if (konum && kimlik && rapor.sim?.kilit === "pin") {
    bildir(opts, "SIM kilidi modulden okunuyor (kalan hak)");
    const k = await readSimLock({ ...konum, kimlik });
    rapor.at_port = k.at_port;
    if (k.at_port) {
      rapor.sim = { ...rapor.sim,
        durum_modul: k.durum,
        pin_kalan: k.pin_kalan ?? rapor.sim.pin_kalan,
        puk_kalan: k.puk_kalan ?? rapor.sim.puk_kalan };
    }
    // Kilit kaldirmaya UYGUN MU? Karar cekirdekte (simKilidiUygunMu); tuketici
    // yalnizca gosterir.
    //
    // elleOnay:true — cunku bu bilgi INSANA gosterilecek bir dugme icin.
    // "Bir hak yakildiysa bir daha deneme" kurali OTOMATIK yol icindir: arac
    // kendi kendine ayni isi tekrarlamasin. Operatorun baska bir PIN denemesini
    // engellemek yanlis olur — dogru PIN'i bilen odur. Insanin da gecemedigi
    // tek kural SON HAK; onu hakDurumu zaten elleOnay'a bakmadan reddediyor.
    const u = simKilidiUygunMu(rapor.sim, { elleOnay: true });
    rapor.pin_kaldirilabilir = { uygun: u.uygun, sebep: u.sebep };
    rapor.problems.push(...u.problems.filter((p) => p.severity === "warning"));
  }

  // TELEFON NUMARASINI CIHAZDAN OKU — artik elle girmeye gerek yok.
  // Yalnizca SIM HAZIRSA denenir: kilitli SIM abone verisini (EF_MSISDN)
  // acmiyor, canli olculdu (2026-08-27). Kilitliyse once PIN, sonra numara.
  if (konum && kimlik && rapor.sim?.hazir) {
    bildir(opts, "telefon numarasi cihazdan okunuyor (AT+CNUM)");
    const n = await readMsisdn({ ...konum, kimlik });
    rapor.at_port = n.at_port;
    if (n.telefon) {
      const elle = normalizePhone(telefon);
      if (elle && elle !== n.telefon) {
        // Cihazdaki numara SIM'in KENDISINDEN geliyor; elle girilen yanlis
        // olabilir. Sessizce birini secmek yerine ikisini de bildiriyoruz.
        rapor.problems.push(problem("MSISDN_UYUSMAZLIK", elle, n.telefon));
      }
      rapor.telefon = { numara: n.telefon, kaynak: "cihaz" };
    } else {
      rapor.problems.push(...n.problems);
    }
  }

  // "Ne eksik" kararı ÇÖZÜLMÜŞ numaraya bakar, ham girdiye DEĞİL. Eskiden
  // buraya `telefon` (operatörün yazdığı) geçiliyordu: cihazdan numara
  // başarıyla okunduğu halde eksik ["telefon"] kalıyor, başlatılabilir
  // yanlışlıkla false oluyordu (2026-08-28 canlı görüldü). Numaranın NEREDEN
  // geldiği kararı ilgilendirmez — elimizde geçerli numara var mı, o yeter.
  rapor.eksik = provisionEksikleri({
    modemVar: Boolean(konum),
    simTakili: rapor.sim?.takili ?? false,
    simKilit: rapor.sim ?? null,
    telefon: rapor.telefon.numara, pin,
  });
  rapor.baslatilabilir = rapor.eksik.length === 0;
  rapor.ok = isOk(rapor.problems);
  return rapor;
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
export function yenidenDenemeKarari(rapor = {}) {
  const kodlar = new Set((rapor.problems || []).map((p) => p.kod));
  const hayir = (sebep) => ({ tekrar: false, sonra_sn: null, sebep });
  const evet = (sonra_sn, sebep) => ({ tekrar: true, sonra_sn, sebep });

  // Is bitti: operator baslatacak.
  if (rapor.baslatilabilir) return hayir("baslatilabilir");

  // PC agi yok -> kablo/modem bekleniyor. Ucuz kontrol, sik bak.
  if (rapor.pc && rapor.pc.hazir === false) return evet(3, "pc_hazir_degil");

  // Modem yok -> takilmasi bekleniyor. Sik bak, ucuz (TCP yoklama).
  if (!rapor.modem?.host) return evet(3, "modem_yok");

  // Insan mudahalesi bekleniyor: tekrar bakmak ayni cevabi verir.
  if (kodlar.has("SIM_PUK_LOCKED")) return hayir("puk_insan_bekliyor");
  if (rapor.sim?.kilit === "pin") return hayir("pin_bekleniyor");
  if (kodlar.has("MSISDN_CIHAZDA_YOK")) return hayir("numara_simde_yok");
  if (kodlar.has("MSISDN_UYUSMAZLIK")) return hayir("operator_karari");

  // SIM takili degil -> FIZIKSEL is: modem kapatilip SIM takilacak. Bakmaya
  // devam ama seyrek; operator bu arada modemi kapatacak.
  if (rapor.sim && rapor.sim.takili === false) return evet(10, "sim_bekleniyor");

  // GECICI aksilik: telnet dustu / AT portu cevap vermedi / istek yarida
  // kaldi. Tam olarak tarayici yenileyince duzelen durum bu.
  for (const k of ["REQUEST_FAILED", "AT_PORT_YOK", "DEVICE_BUSY", "EMPTY_BODY"]) {
    if (kodlar.has(k)) return evet(5, "gecici_hata");
  }

  // Eksik var ama sebebini tanimadik: seyrek tekrar, sessiz kalmaktan iyi.
  if ((rapor.eksik || []).length) return evet(10, "eksik_var");
  return hayir("tekrar_gerekmiyor");
}

// Degerlendirmeyi TEKRARLAYARAK izler. Karar yukaridaki saf fonksiyondan
// gelir; burada yalniz bekleme ve olay var.
//
// opts: assessDevice opts + { olay(rapor), dur() }
//   olay : her degerlendirme sonucunda cagrilir (tuketici ekrani gunceller)
//   dur  : true donerse dongu biter (tuketici iptal edebilir)
// Doner: son rapor.
export async function degerlendirmeyiIzle(opts = {}) {
  const enFazla = opts.enFazlaTur ?? Infinity;
  let rapor = null;
  for (let tur = 0; tur < enFazla; tur += 1) {
    rapor = await assessDevice(opts);
    rapor.tekrar = yenidenDenemeKarari(rapor);
    if (typeof opts.olay === "function") {
      try { opts.olay(rapor); } catch { /* dinleyici hatasi donguyu kesmez */ }
    }
    if (!rapor.tekrar.tekrar) return rapor;
    if (typeof opts.dur === "function" && opts.dur()) return rapor;
    await bekle(rapor.tekrar.sonra_sn * 1000);
  }
  return rapor;
}
