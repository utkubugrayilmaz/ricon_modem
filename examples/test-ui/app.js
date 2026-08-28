// Tarayıcı tarafı — ince katman, tıpkı ricon.js gibi.
//
// Burada İŞ MANTIĞI YOK: telefonun geçerliliğini de, hangi ayarın değişeceğini
// de, kaydın tutulmasını da çekirdek biliyor. Bu dosya sunucunun yolladığı
// olayları ekrana basar. Sözlük de sunucudan hazır geliyor (satırlar ekrana
// hazır: ad, önce, sonra) — tarayıcı nvram anahtarı bilmez.
//
// Sıfır bağımlılık: framework yok, build yok. EventSource tarayıcıda yerleşik.

const HANE_SAYISI = 11;                 // 0 + 10 hane: 0535 064 18 58
const BOSLUKLAR = new Set([3, 6, 8]);   // bu hanelerden SONRA görsel boşluk

const el = (id) => document.getElementById(id);
const ekranGiris = el("ekranGiris");
const ekranKurulum = el("ekranKurulum");
const haneler = el("haneler");
const gizliGiris = el("gizliGiris");
const uyari = el("uyari");
const baslatBtn = el("baslatBtn");
const ipucu = el("ipucu");
const ustDurum = el("ustDurum");
const izgara = el("izgara");
const akis = el("akis");
const altBar = el("alt");
const altDurum = el("altDurum");
const onayBtn = el("onayBtn");
const sifirlaBtn = el("sifirlaBtn");
const sifirlaAlan = document.querySelector(".sifirla-alan");
const onayBalon = el("onayBalon");
const duyuru = el("duyuru");
const olcumBolum = el("olcumBolum");
const olcumTablo = el("olcumTablo");
const altSure = el("altSure");
const pinGiris = el("pinGiris");
const pinIstek = el("pinIstek");
const pinIstekGiris = el("pinIstekGiris");
const pinDeneBtn = el("pinDeneBtn");
const kaynakMetin = el("kaynakMetin");
const degistirBtn = el("degistirBtn");
const pinAlan = el("pinAlan");
const pinKaldirBtn = el("pinKaldirBtn");
const pinEtiketNot = el("pinEtiketNot");
const pinNot = el("pinNot");
const pinAkis = el("pinAkis");

// PIN girişleri: sadece rakam, en fazla 8 hane. Bozuk PIN bir deneme yakar,
// o yüzden kaynağında süzülüyor (çekirdek de ayrıca reddediyor).
for (const g of [pinGiris, pinIstekGiris]) {
  g.addEventListener("input", () => {
    g.value = g.value.replace(/\D/g, "").slice(0, 8);
    if (g === pinIstekGiris) pinDeneBtn.disabled = !/^\d{4,8}$/.test(g.value);
    // pinHakYakildi: bu modemde bir deneme HARCANDI. Kural (kullanıcı isteği):
    // bir hak yandıysa araç bir daha denemez — yeni PIN yazmak da açmaz.
    // Modem çıkarılıp takılınca durum sıfırlanır.
    if (g === pinGiris) {
      pinKaldirBtn.disabled = pinHakYakildi || !/^\d{4,8}$/.test(g.value);
    }
  });
}
pinDeneBtn.disabled = true;

// ---------------- EKRAN 1: telefon numarası ----------------
//
// Numara artık ÖNCE CİHAZDAN okunuyor (SIM'e yazılı MSISDN). Elle giriş
// kalktı değil, YEDEĞE indi: numara SIM'de yazılı olmayabilir ya da SIM
// PIN kilitliyken abone verisi hiç açılmaz. O durumda ekran bugünkü gibi
// çalışır — operatör yazar.
// Numara CIHAZDAN GELDIYSE salt goruntu olur; duzenleme "Degistir"den acilir.
// Alan bossa kilit YOK — yoksa operator hicbir sey yazamaz.
let kilitli = false;
let pinHakYakildi = false;        // bu modemde PIN denemesi harcandı
let okunuyor = false;             // değerlendirme sürüyor
let otomatikDolduruldu = false;   // alandaki numara cihazdan mı geldi

for (let i = 0; i < HANE_SAYISI; i += 1) {
  const h = document.createElement("span");
  h.className = "hane" + (BOSLUKLAR.has(i) ? " bosluk" : "");
  haneler.appendChild(h);
}
const haneKutulari = [...haneler.children];

// Numara geçerli mi? 11 hane ve 05 ile başlamalı (TR mobil).
// Aynı kural çekirdekte de var (telefonNormalize) — burası sadece erken uyarı.
function gecerliMi(d) {
  return d.length === HANE_SAYISI && d.startsWith("05");
}

function haneleriBoya() {
  const d = gizliGiris.value;
  haneKutulari.forEach((kutu, i) => {
    kutu.textContent = d[i] ?? "";
    kutu.classList.toggle("dolu", i < d.length);
    kutu.classList.toggle("imlec",
      !kilitli && i === d.length && document.activeElement === gizliGiris);
  });

  const tamam = gecerliMi(d);
  haneler.classList.toggle("hatali", d.length === HANE_SAYISI && !tamam);
  haneler.classList.toggle("kilitli", kilitli);
  baslatBtn.disabled = !tamam || okunuyor;

  // Kilitliyse numara CIHAZDAN geldi: "eksik hane" uyarisi anlamsiz, alt
  // satirda zaten nereden geldigi yaziyor.
  if (kilitli) {
    uyari.textContent = " ";
    uyari.removeAttribute("data-hal");
    return;
  }
  if (d.length === 0) {
    uyari.textContent = " ";
    uyari.removeAttribute("data-hal");
  } else if (d.length < HANE_SAYISI) {
    const kalan = HANE_SAYISI - d.length;
    uyari.textContent = `Eksik: ${kalan} hane kaldı`;
    uyari.removeAttribute("data-hal");
  } else if (!d.startsWith("05")) {
    uyari.textContent = "Numara 05 ile başlamalı";
    uyari.removeAttribute("data-hal");
  } else {
    uyari.textContent = "Numara tam";
    uyari.dataset.hal = "tamam";
  }
}

// Fazla hane giremez, harf giremez: girişi kaynağında süz.
gizliGiris.addEventListener("input", () => {
  gizliGiris.value = gizliGiris.value.replace(/\D/g, "").slice(0, HANE_SAYISI);
  haneleriBoya();
});
gizliGiris.addEventListener("focus", haneleriBoya);
gizliGiris.addEventListener("blur", haneleriBoya);
gizliGiris.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !baslatBtn.disabled) baslatBtn.click();
});
haneleriBoya();

// Duzenlemenin TEK kapisi. Numarayi SILMEZ — genelde tek hane duzeltilir.
// Alan duzenlemeye acikken hanelere tiklamak odaklar. Kilitliyken HICBIR SEY
// yapmaz — cihazdan gelen numara tiklayarak bozulmasin.
haneler.addEventListener("click", () => { if (!kilitli) gizliGiris.focus(); });

degistirBtn.addEventListener("click", () => {
  kilidiAc();
  gizliGiris.focus();
  gizliGiris.setSelectionRange(gizliGiris.value.length, gizliGiris.value.length);
});

function kilidiAc() {
  kilitli = false;
  gizliGiris.readOnly = false;
  kaynakMetin.textContent = "elle giriliyor";
  degistirBtn.hidden = true;
  haneleriBoya();
}

function numarayiYerlestir(girdi) {
  gizliGiris.value = girdi;
  kilitli = true;
  otomatikDolduruldu = true;
  gizliGiris.readOnly = true;
  kaynakMetin.textContent = "SIM'den okundu";
  degistirBtn.textContent = "Değiştir";
  degistirBtn.hidden = false;
  haneleriBoya();
}

// Cihaz gittiginde: OTOMATIK gelen numara baska bir modeme aittir, silinir.
// Operatorun ELLE yazdigina dokunulmaz.
function numarayiSifirla() {
  if (otomatikDolduruldu) gizliGiris.value = "";
  otomatikDolduruldu = false;
  // KILIT KALKAR. Kilit yalnizca CIHAZDAN GELEN numarayi korumak icin var;
  // buraya gelindiginde ya o numara silindi (yukarida) ya da alandaki deger
  // operatorun kendisinin — ikisinde de kilidin anlami yok.
  //
  // Ilk yazimda burada KILITLENIYORDU ve hemen ardindan "elle gir" yazip
  // focus() cagriliyordu; readOnly alana yazilamaz, yani operatore yaz
  // deyip yazdirmiyorduk.
  kilitli = false;
  gizliGiris.readOnly = false;
  kaynakMetin.textContent = "";
  degistirBtn.hidden = true;   // alan zaten yazilabilir, kapiya gerek yok
  // PIN durumu MODEME OZEL: yeni cihaz yeni SIM, yanmis hak devrolmaz.
  pinHakYakildi = false;
  pinAkis.hidden = true;
  pinAkis.textContent = "";
  pinAlaniniGizle();
  haneleriBoya();
}

// Modem nerede? Giriş ekranında düzenli sor — teknisyen kabloyu takmadan
// "başlat"a basıp beklemesin.
let durumZamani = null;
async function durumuTazele() {
  try {
    const r = await fetch("/api/durum");
    const d = await r.json();
    if (!d.pc?.hazir) {
      // EN OLASI SEBEP KABLO. Kablo çıkınca modem alt ağındaki ikincil IP
      // görünmez oluyor ve bu, "IP hiç tanımlı değil" ile birebir aynı
      // görünüyor — araç ikisini ayırt edemiyor (bkz. NO_SOURCE_IP).
      // O yüzden ekranda önce ucuz ve olası olan yazıyor; yapılandırma
      // tavsiyesi ikinci satırda, kablo takılıyken hâlâ sorun varsa diye.
      ustDurum.dataset.hal = "bekle";
      ustDurum.textContent = "ağ yok — kablo/modem?";
      sifirlaBtn.disabled = true;
      ipucu.dataset.hal = "hata";
      const t = d.pc.problems?.[0]?.tr;
      ustDurum.textContent = t?.baslik ?? "ağ yok — kablo/modem?";
      ipucu.textContent = t?.neYap ?? "Modemin LAN kablosunu tak ve modemi aç.";
      return;
    }
    ipucu.removeAttribute("data-hal");
    // Sıfırlanacak bir şey yoksa (modem yok / başka iş sürüyor) düğme kapalı.
    sifirlaBtn.disabled = !d.modem.konum || d.mesgul || !d.sifirlanabilir;
    if (d.modem.konum) {
      ustDurum.dataset.hal = d.modem.konum;
      ustDurum.textContent = `modem ${d.modem.host} (${d.modem.konum})`;
      if (!okunuyor && !degerlendirmeSonucu) {
        ipucu.textContent = d.modem.konum === "saha" ? "Zaten kurulmuş." : "Modem hazır.";
      }
      degerlendirmeyiTetikle(d);
    } else {
      ustDurum.dataset.hal = "bekle";
      ustDurum.textContent = "modem yok";
      ipucu.textContent = "Modemi tak.";
      // Cihaz gitti: bir sonraki modem KENDI okumasini hak eder.
      if (degerlendirilenHost || degerlendirmeSonucu) {
        degerlendirilenHost = null;
        degerlendirmeSonucu = null;
        sonDenemeZamani = 0;
        numarayiSifirla();
      }
    }
  } catch {
    ustDurum.dataset.hal = "hata";
    ustDurum.textContent = "sunucuya ulaşılamıyor";
  }
}

// --- Numarayı cihazdan oku (PAHALI: ~5 sn, modem başına BİR KEZ) ---
//
// /api/durum saniyede bir yoklanabilir; /api/degerlendir yoklanamaz — HTTP
// kimlik okuması + telnet üzerinden AT komutu demek ve cihaz tek bağlantılı.
// Bu yüzden tetik "modem YOK → VAR" geçişi: host değiştiğinde bir kez.
let degerlendirilenHost = null;   // hangi modem için okuduk
let degerlendirmeSonucu = null;   // son okuma (ipucunu o yazar)
let sonDenemeZamani = 0;
let tekrarZamani = null;          // çekirdeğin istediği yeniden bakış
const DENEME_ARASI_MS = 15000;    // başarısız okumadan sonra bekleme

// Çekirdek "tekrar bak, N sn sonra" diyorsa uy. KARAR BURADA VERİLMİYOR:
// hangi durumun tekrar hak ettiği (geçici hata mı, insan mı bekleniyor)
// yenidenDenemeKarari'nda — sunucu onu cevabın `tekrar` alanında yolluyor.
// Burası yalnızca zamanlayıcı.
function tekrariAyarla(o) {
  clearTimeout(tekrarZamani);
  tekrarZamani = null;
  if (!o?.tekrar?.tekrar) return;
  tekrarZamani = setTimeout(() => {
    degerlendirilenHost = null;    // aynı modem için yeniden bakılacak
    sonDenemeZamani = 0;
    durumuTazele();
  }, o.tekrar.sonra_sn * 1000);
}

function degerlendirmeyiTetikle(d) {
  if (okunuyor || d.mesgul) return;
  if (degerlendirilenHost === d.modem.host) return;      // bu modem okundu
  if (Date.now() - sonDenemeZamani < DENEME_ARASI_MS) return;
  degerlendir(d.modem.host);
}

async function degerlendir(host) {
  okunuyor = true;
  sonDenemeZamani = Date.now();
  ipucu.removeAttribute("data-hal");
  ipucu.textContent = "SIM'den numara okunuyor…";
  haneleriBoya();                 // BAŞLAT'ı okuma bitene kadar kapatır
  // SADECE AĞ/AYRIŞTIRMA bu try'da. Çizim kodu AYRI: ekranı çizen bir hata
  // "sunucuya ulaşılamadı" diye bildirilirse teşhis yanlış olur — tam bu
  // oldu: tanımsız bir fonksiyon yüzünden numara ekrana geldiği halde
  // "numara okunamadı" yazıyordu.
  let o = null;
  try {
    const r = await fetch("/api/degerlendir");
    o = await r.json();
    // 409: cihazla başka bir iş sürüyor. Hata değil, sırasını bekler.
    if (r.status === 409) o = null;
  } catch {
    o = null;
  } finally {
    okunuyor = false;
  }
  if (!o) {
    ipucu.dataset.hal = "hata";
    ipucu.textContent = "Sunucuya ulaşılamadı.";
    tekrariAyarla({ tekrar: { tekrar: true, sonra_sn: 5 } });
    haneleriBoya();
    return;
  }
  degerlendirilenHost = host;
  degerlendirmeSonucu = o;
  okumayiUygula(o);
  tekrariAyarla(o);
  haneleriBoya();
}

// Okuma sonucunu ekrana çevirir. KARAR YOK: `eksik` çekirdekten geliyor,
// burası yalnızca hangi cümlenin yazılacağını seçiyor.
function okumayiUygula(o) {
  if (o.telefon?.girdi) {
    numarayiYerlestir(o.telefon.girdi);
    pinAlaniniGizle();
    ipucu.removeAttribute("data-hal");
    ipucu.textContent = o.baslatilabilir ? "" : `eksik: ${o.eksik.join(", ")}`;
    return;
  }
  // Numara gelmedi — sebebe göre ayrılıyoruz.
  numarayiSifirla();
  ipucu.dataset.hal = "hata";
  if (o.eksik?.includes("sim")) {
    ipucu.textContent = "SIM takılı değil.";
    return;
  }
  if (o.eksik?.includes("pin")) {
    // KİLİTLİ SIM: numara okunamaz, çünkü PIN kilidi abone verisini açmıyor.
    // Çözüm elle numara yazmak DEĞİL — kilidi SIM'den kaldırmak. Kaldırınca
    // numara zaten kendiliğinden gelir ve SIM her cihazda açık olur.
    pinKilidiIste(o.sim, o.pin_kaldirilabilir);
    return;
  }
  ipucu.textContent = "Numara SIM'de yok — elle gir.";
  gizliGiris.focus();
}

// SIM kilitli: PIN alanini ACAR. Kalan hak yaziyor — operator neyi riske
// attigini denemeden gorsun.
function pinKilidiIste(sim, uygunluk) {
  const kalan = sim?.pin_kalan;
  pinAlan.hidden = false;
  ipucu.textContent = "SIM PIN kilitli";
  pinEtiketNot.textContent = kalan === null || kalan === undefined
    ? "— kalan hak okunamadı" : `— kalan hak: ${kalan}`;

  // KARAR ÇEKİRDEKTEN: burada yeniden hesaplanmıyor. Uygun değilse düğme
  // hiç görünmez — "yanlışlıkla basılabilecek" bir kapı bırakmıyoruz.
  // Uygun degilse dugme yok: yanlislikla basilacak kapi birakmiyoruz.
  if (uygunluk && uygunluk.uygun === false) {
    pinKaldirBtn.hidden = true;
    pinGiris.disabled = true;
    pinNot.textContent = {
      PIN_HAK_YANMIS: "Daha önce bir hak yanmış — denenmeyecek.",
      PIN_LAST_ATTEMPT: "Son hak — denenmeyecek. SIM'i telefonda aç.",
      SIM_PUK_LOCKED: "PUK kilitli. Telefondan PUK ile aç.",
    }[uygunluk.sebep] ?? "Denenmeyecek.";
    return;
  }

  pinGiris.disabled = false;
  pinNot.textContent = "Tek deneme. Kilit SIM'den kalıcı kalkar.";
  pinKaldirBtn.hidden = false;
  pinKaldirBtn.disabled = !/^\d{4,8}$/.test(pinGiris.value);
  pinGiris.focus();
}

function pinAlaniniGizle() {
  pinAlan.hidden = true;
  pinKaldirBtn.hidden = true;
  pinGiris.disabled = false;
  pinEtiketNot.textContent = "";
  pinNot.textContent = "";
}

// --- PIN kilidini kaldır: SSE akışı ---
//
// Kurulum akışıyla AYNI kalıp (EventSource + olay adları), ama kendi küçük
// alanına yazıyor: operatör ana ekrandan ayrılmıyor. Bitince numara okuma
// KENDİLİĞİNDEN tekrar çalışır — istenen zincir bu: kilit kalktı → numara geldi.
let pinAkim = null;
function pinKilidiniKaldir() {
  const p = pinGiris.value.trim();
  if (!/^\d{4,8}$/.test(p)) return;
  if (pinAkim) { pinAkim.close(); pinAkim = null; }
  pinKaldirBtn.disabled = true;
  pinAkis.hidden = false;
  pinAkis.removeAttribute("data-hal");
  pinAkis.textContent = "başlıyor…";
  okunuyor = true;                 // BAŞLAT kapalı kalsın, durum yoklaması araya girmesin
  haneleriBoya();

  const yaz = (m) => { pinAkis.textContent = m; };
  pinAkim = new EventSource(`/api/pin-kaldir?pin=${encodeURIComponent(p)}`);
  pinAkim.addEventListener("ilerleme", (e) => yaz(JSON.parse(e.data).mesaj));
  pinAkim.addEventListener("sim_kilit", (e) => {
    const o = JSON.parse(e.data);
    if (o.kilit === "puk") {
      yaz(`SIM PUK kilitli (kalan ${o.puk_kalan ?? "?"}) — telefondan PUK ile aç.`);
    } else {
      yaz(`${o.durum} · kalan hak: ${o.pin_kalan ?? "?"}`);
    }
  });
  pinAkim.addEventListener("pin_kaldir_sonuc", (e) => {
    const o = JSON.parse(e.data);
    pinBitir(o.kilit_kaldirildi, o);
  });
  pinAkim.addEventListener("hata", (e) => {
    const o = JSON.parse(e.data);
    pinBitir(false, { problems: [{ message: o.mesaj, check: o.cozum }] });
  });
  pinAkim.onerror = () => {
    if (pinAkim && pinAkim.readyState === EventSource.CLOSED) pinBitir(false, null);
  };
}

function pinBitir(basarili, o) {
  if (pinAkim) { pinAkim.close(); pinAkim = null; }
  okunuyor = false;
  pinGiris.value = "";             // PIN hiçbir yerde durmaz, ekranda da
  if (basarili) {
    pinAkis.dataset.hal = "tamam";
    pinAkis.textContent = "kilit kaldırıldı · numara okunuyor…";
    pinAlaniniGizle();
    // Zincirin son halkası: kilit kalktı → SIM artık abone verisini veriyor →
    // numarayı ŞİMDİ oku. Aynı modem için tekrar okuyacağız, bayrağı temizle.
    degerlendirilenHost = null;
    degerlendirmeSonucu = null;
    sonDenemeZamani = 0;
    durumuTazele();
    return;
  }
  pinAkis.dataset.hal = "hata";
  // SADECE tr: ham problems[].message/check GELISTIRICI metni ve Ingilizce,
  // ekrana asla basilmaz (sozluk src/report.js'te, tek yer).
  const ilk = o?.problems?.[0]?.tr;
  // Deneme GERÇEKTEN harcandı mı? Yalnızca PIN_REJECTED bir hak yakar.
  // Biçim hatası, "son hak" reddi ya da port sorunu hak yakmaz — onlarda
  // tekrar denemeyi kapatmak operatörü boşuna kilitler.
  pinHakYakildi = (o?.problems || []).some((p) => p.kod === "PIN_REJECTED");
  pinAkis.textContent = o?.acildi
    ? "SIM açıldı, kilit kalıcı kalkmadı."
    : (ilk?.baslik || "PIN kilidi kaldırılamadı")
      + (ilk?.neYap ? `\n${ilk.neYap}` : "");
  pinKaldirBtn.disabled = pinHakYakildi || !/^\d{4,8}$/.test(pinGiris.value);
  haneleriBoya();
}

pinKaldirBtn.addEventListener("click", pinKilidiniKaldir);

function durumuIzle(ac) {
  clearInterval(durumZamani);
  if (!ac) { clearTimeout(tekrarZamani); tekrarZamani = null; }
  if (ac) { durumuTazele(); durumZamani = setInterval(durumuTazele, 3000); }
}
durumuIzle(true);

// ---------------- EKRAN 2: kurulum ----------------

const satirlar = new Map();   // nvram anahtarı -> { sol, sag, halKutu }

function izgaraKur(satirListesi) {
  izgara.textContent = "";
  satirlar.clear();
  let sonSayfa = null;

  for (const s of satirListesi) {
    if (s.sayfa && s.sayfa !== sonSayfa) {
      sonSayfa = s.sayfa;
      const grup = document.createElement("div");
      grup.className = "grup";
      const a = document.createElement("span");
      a.textContent = s.sayfa;
      const b = document.createElement("span");
      b.textContent = s.sayfa;
      grup.append(a, b);
      izgara.appendChild(grup);
    }

    const sol = hucreYap(s.ad, s.once, false, s.degisecek);
    const sag = hucreYap(s.ad, s.sonra, true, s.degisecek);
    sag.dataset.hal = s.degisecek ? "bekliyor" : "sabit";
    const halKutu = document.createElement("span");
    halKutu.className = "h-hal";
    halKutu.textContent = s.degisecek ? "bekliyor" : "değişmedi";
    sag.appendChild(halKutu);

    izgara.append(sol, sag);
    satirlar.set(s.anahtar, { sol, sag, halKutu });
  }
}

function hucreYap(ad, deger, sagMi, degisecek) {
  const h = document.createElement("div");
  h.className = "hucre" + (sagMi ? " hucre-sonra" : "") + (degisecek ? "" : " sabit");
  const a = document.createElement("span");
  a.className = "h-ad";
  a.textContent = ad;
  const d = document.createElement("span");
  d.className = "h-deger";
  d.textContent = deger;
  h.append(a, d);
  return h;
}

function halYaz(anahtarlar, hal, etiket) {
  for (const k of anahtarlar || []) {
    const s = satirlar.get(k);
    if (!s || s.sag.dataset.hal === "sabit") continue;
    s.sag.dataset.hal = hal;
    s.halKutu.textContent = etiket;
  }
}

const akisSatirlari = [];
function akisaYaz(mesaj) {
  akisSatirlari.push(mesaj);
  const son = akisSatirlari.slice(-4);
  akis.textContent = "";
  son.forEach((m, i) => {
    const p = document.createElement("span");
    p.textContent = m;
    if (i < son.length - 1) p.className = "akis-gecmis";
    akis.append(p, document.createElement("br"));
  });
}

function kimlikBas(hedef, k) {
  const alanlar = [
    ["Telefon", k.telefon], ["ICCID", k.iccid], ["IMEI", k.imei],
    ["IMSI", k.imsi], ["MAC", k.lan_mac], ["Operatör", k.operator],
  ].filter(([, v]) => v);
  const dl = document.createElement("dl");
  dl.className = "kimlik-liste";
  for (const [ad, deger] of alanlar) {
    const sar = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = ad;
    const dd = document.createElement("dd");
    dd.textContent = deger;
    sar.append(dt, dd);
    dl.appendChild(sar);
  }
  hedef.textContent = "";
  hedef.appendChild(dl);
}

let akim = null;
let akisTuru = null;   // "kurulum" | "sifirlama" — bitişte ne yapılacağını belirler
let simKilit = null;   // cihazın bildirdiği PIN/PUK kilidi (varsa)

// --- Süre ölçümü (TEST) ---
// "Başlat"a bastığımdan bitişe kadar kaç saniye? Ölçüm noktası olayın EKRANA
// GELDİĞİ an — yani teknisyenin gerçekten beklediği süre. Tamamen tarayıcıda:
// sunucuya ve çekirdeğe hiç dokunmuyor.
const OLCUM_ETIKET = {
  algilandi: "modem algılandı",
  plan: "ayarlar okundu (plan hazır)",
  yaziliyor: "yazma başladı",
  yazildi: "yazma bitti",
  reboot: "reboot gönderildi",
  dogrulandi: "cihaz geri geldi, doğrulandı",
  kimlik: "kimlik okundu (ICCID/IMEI)",
  // İnternet doğrulaması AYRI adım: "ayarlar doğru mu" ile "SIM çalışıyor mu"
  // iki farklı soru; metrikte de ayrı görünmeleri lazım.
  internet: "internet doğrulandı (SIM çalışıyor)",
};
let baslangicMs = 0;
let sayacZamani = null;
const olcumler = [];
// Ana ekranın hazır olduğu an. "Başlat"a basılana kadar geçen süre =
// operatörün numarayı girme süresi = insanın MEŞGUL olduğu tek an. Metrik
// iddiası için araç süresinden ayrı tutulması şart.
let girisHazirMs = performance.now();

const gecenSn = () => (performance.now() - baslangicMs) / 1000;
const sn = (x) => x.toFixed(1);

let girisSn = null;

function olcumBasla() {
  girisSn = Number(((performance.now() - girisHazirMs) / 1000).toFixed(1));
  baslangicMs = performance.now();
  olcumler.length = 0;
  olcumBolum.hidden = true;
  olcumTablo.textContent = "";
  altSure.textContent = "0.0 sn";
  clearInterval(sayacZamani);
  sayacZamani = setInterval(() => { altSure.textContent = `${sn(gecenSn())} sn`; }, 250);
}

// Olay geldiğinde damgala. `ek` varsa etikete eklenir (örn. kaç ayar yazıldı).
function olcumKaydet(tur, ek = "") {
  const etiket = OLCUM_ETIKET[tur];
  if (!etiket) return;
  olcumler.push({ etiket: ek ? `${etiket} — ${ek}` : etiket, anSn: gecenSn() });
}

// Ölçüm tablosunu basar: her adımın kendi süresi + kümülatif + toplam.
// En uzun adım kırmızı — darboğaz tek bakışta görünsün.
function olcumBitir() {
  clearInterval(sayacZamani);
  sayacZamani = null;
  const toplam = gecenSn();
  altSure.textContent = `${sn(toplam)} sn`;

  const satirDizi = olcumler.map((o, i) => ({
    etiket: o.etiket,
    sure: o.anSn - (i === 0 ? 0 : olcumler[i - 1].anSn),
    an: o.anSn,
  }));
  const enUzun = Math.max(0, ...satirDizi.map((s) => s.sure));

  olcumTablo.textContent = "";
  const hucre = (metin, sinif) => {
    const s = document.createElement("span");
    s.textContent = metin;
    if (sinif) s.className = sinif;
    return s;
  };
  olcumTablo.append(
    hucre("adım", "olcum-baslik"), hucre("süre", "olcum-baslik"), hucre("an", "olcum-baslik"),
  );
  for (const s of satirDizi) {
    const uzunMu = s.sure === enUzun && satirDizi.length > 1 ? "olcum-uzun" : "";
    olcumTablo.append(
      hucre(s.etiket, uzunMu), hucre(`${sn(s.sure)} sn`, uzunMu), hucre(`${sn(s.an)} sn`),
    );
  }
  olcumTablo.append(
    hucre("TOPLAM (başlat → bitiş)", "olcum-toplam"),
    hucre(`${sn(toplam)} sn`, "olcum-toplam"),
    hucre("", "olcum-toplam"),
  );
  olcumBolum.hidden = false;
  return { toplam, satirDizi };
}

// Ölçümü sunucuya yolla (data/olcumler.jsonl). Metrik iddiası için süreler
// ekranda kaybolmamalı. Başarısız gönderim akışı bozmaz — ölçüm, işin kendisi
// değil.
function olcumGonder(govde) {
  fetch("/api/olcum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  }).catch(() => { /* olcum kaydi kritik degil */ });
}

// Karşılaştırma ekranını KOMPLE boşaltır. Tek yerde toplandı: temizliği alan
// alan yapmak, bir alanı unutup önceki modemin bilgisini gösterme hatasının
// kaynağıydı. Yeni alan eklenirse SADECE buraya eklenir.
function panelleriTemizle() {
  izgara.textContent = "";
  satirlar.clear();
  akisSatirlari.length = 0;
  akis.textContent = "";
  simKilit = null;
  el("kimlikOnce").textContent = "";
  el("konumOnce").textContent = "—";
  el("konumSonra").textContent = "—";
  onayBtn.hidden = true;
  altBar.removeAttribute("data-hal");
  altDurum.textContent = "";
  pinIstek.hidden = true;
  olcumBolum.hidden = true;
  olcumTablo.textContent = "";
  altSure.textContent = "0.0 sn";
  clearInterval(sayacZamani);
  sayacZamani = null;
}

// Ana ekrana dön ve OTURUMU SIFIRLA: akış kapanır, paneller boşalır, numara
// silinir. duyuru varsa ana ekranda görünür kalır (bir önceki işin sonucu).
function anaEkrana(duyuruMetni = "") {
  if (akim) { akim.close(); akim = null; }
  akisTuru = null;
  panelleriTemizle();
  ekranKurulum.hidden = true;
  ekranGiris.hidden = false;
  sifirlaAlan.hidden = false;
  gizliGiris.value = "";
  pinGiris.value = "";          // PIN modeme özel: sonraki modeme taşınmasın
  // Okuma durumu da modeme özel: bir sonraki modem KENDİ numarasını getirir.
  degerlendirilenHost = null;
  degerlendirmeSonucu = null;
  sonDenemeZamani = 0;
  numarayiSifirla();            // kilidi açar, "SIM'den okundu" satırını gizler
  haneleriBoya();
  duyuru.textContent = duyuruMetni;
  duyuru.hidden = !duyuruMetni;
  girisHazirMs = performance.now();
  gizliGiris.focus();
  durumuIzle(true);            // durum çubuğunu bekletmeden tazeler
}

// Kurulum ve sıfırlama AYNI ekranı kullanır — ikisi de "öncesi → sonrası"
// karşılaştırması. Fark: hangi uca bağlandığı, panel etiketleri ve bitişte
// ne olacağı (kurulum onay bekler, sıfırlama ana ekrana döner).
function akisiBaslat({ yol, tur, telefon = null, onceEtiket, sonraEtiket, calisirkenMetin }) {
  if (akim) { akim.close(); akim = null; }   // çift başlatmaya karşı
  durumuIzle(false);
  onayiKapat();
  akisTuru = tur;
  sifirlaAlan.hidden = true;      // iş sürerken sıfırlama teklif edilmez
  duyuru.hidden = true;           // önceki işin duyurusu yeni işle silinir
  panelleriTemizle();
  el("etiketOnce").textContent = onceEtiket;
  el("etiketSonra").textContent = sonraEtiket;
  ekranGiris.hidden = true;
  ekranKurulum.hidden = false;
  altDurum.textContent = calisirkenMetin;
  akisaYaz("başlatıldı");

  olcumBasla();
  akim = new EventSource(yol);

  // Ölçüm: her damgalanan olay için ayrı dinleyici — mevcut işleyicilere
  // dokunmaz, biri eklenip çıkarılınca ölçüm bozulmaz.
  for (const tur of Object.keys(OLCUM_ETIKET)) {
    akim.addEventListener(tur, (e) => {
      const o = JSON.parse(e.data);
      olcumKaydet(tur, o.anahtarlar ? `${o.anahtarlar.length} ayar` : "");
    });
  }

  akim.addEventListener("ilerleme", (e) => akisaYaz(JSON.parse(e.data).mesaj));

  akim.addEventListener("kimlik_once", (e) => {
    kimlikBas(el("kimlikOnce"), { ...JSON.parse(e.data), telefon });
  });

  akim.addEventListener("plan", (e) => {
    izgaraKur(JSON.parse(e.data).satirlar);
  });

  akim.addEventListener("algilandi", (e) => {
    const o = JSON.parse(e.data);
    el("konumOnce").textContent = o.konum || "modem yok";
    ustDurum.dataset.hal = o.eylem === "provizyon_fabrika" ? "fabrika" : "saha";
    ustDurum.textContent = o.eylem.replace(/_/g, " ");
  });

  akim.addEventListener("yaziliyor", (e) => halYaz(JSON.parse(e.data).anahtarlar, "yaziliyor", "yazılıyor"));
  akim.addEventListener("yazildi", (e) => halYaz(JSON.parse(e.data).anahtarlar, "yazildi", "yazıldı"));

  akim.addEventListener("yazma_hatasi", (e) => {
    const a = JSON.parse(e.data).anahtarlar || [];
    halYaz(a, "hata", "yazılamadı");
    akisaYaz(`yazılamadı: ${a.length} ayar`);
  });

  akim.addEventListener("reboot", () => akisaYaz("modem yeniden başlatılıyor"));

  // İnternet doğrulaması — operatör beklemiyor, araç bekliyor. Ekranda ne
  // olduğu net yazsın, donmuş gibi görünmesin.
  akim.addEventListener("internet_bekleniyor", (e) => {
    const o = JSON.parse(e.data);
    altDurum.textContent = "SIM doğrulanıyor — internet bekleniyor "
      + `(${o.gecen_sn}/${o.max_sn} sn)`;
  });

  akim.addEventListener("internet", (e) => {
    const o = JSON.parse(e.data);
    akisaYaz(o.var
      ? `internet VAR: ${o.wan_ip} (${o.sure_sn} sn) — SIM çalışıyor`
      : `internet YOK (${o.sure_sn} sn) — SIM durumu: ${o.sim_durumu || "?"}`);
  });

  // Kurulum akışında PIN otomatik denenirse (baştan girilmişse) haber ver.
  akim.addEventListener("pin_deneniyor", () => akisaYaz("SIM PIN yazılıyor (tek deneme)"));

  // Cihaz PIN/PUK kilidini kendisi söylüyor ("Need verification PIN code
  // (PIN: 3/3, PUK: 10/10)") — internet beklemeye gerek yok, anında bildir.
  akim.addEventListener("sim_kilit", (e) => {
    const o = JSON.parse(e.data);
    simKilit = o;
    akisaYaz(`SIM ${o.kilit.toUpperCase()} KİLİTLİ — kalan hak: PIN ${o.pin_kalan ?? "?"}`
      + `, PUK ${o.puk_kalan ?? "?"}`);
  });

  // Provizyon adımının bitişi (nihai sonuç değil — o `sonuc`). Yalnız
  // başarısızlıkta bilgi taşır: doğrulama neden tamamlanmadı.
  akim.addEventListener("bitti", (e) => {
    const o = JSON.parse(e.data);
    if (!o.ok && o.dogrulama?.sebep) akisaYaz(o.dogrulama.sebep);
  });

  akim.addEventListener("dogrulama", (e) => {
    const o = JSON.parse(e.data);
    akisaYaz(o.durum === "cihaz_bekleniyor"
      ? `modem bekleniyor (${o.deneme})`
      : `oturmayan ayar: ${o.kalan.length}`);
  });

  akim.addEventListener("dogrulandi", (e) => {
    const o = JSON.parse(e.data);
    halYaz([...satirlar.keys()], "dogrulandi", "doğrulandı");
    akisaYaz(`doğrulandı (${o.bekleme_sn} sn)`);
  });

  akim.addEventListener("kimlik", (e) => {
    const k = JSON.parse(e.data).kimlik_bilgi || {};
    if (k.iccid) kimlikBas(el("kimlikOnce"), { ...k, telefon });
  });

  akim.addEventListener("sonuc", (e) => {
    const o = JSON.parse(e.data);
    bitir(o.ok, o);
  });

  akim.addEventListener("hata", (e) => {
    const o = JSON.parse(e.data);
    bitir(false, { durum: o.mesaj, cozum: o.cozum });
  });

  // Akış kapanırsa EventSource kendiliğinden YENİDEN BAĞLANIR — kurulumu
  // ikinci kez başlatmasın diye biz kapatıyoruz (bitir() kapatır).
  akim.onerror = () => {
    if (akim && akim.readyState === EventSource.CLOSED) return;
    akisaYaz("bağlantı koptu");
  };
}

baslatBtn.addEventListener("click", () => {
  const telefon = gizliGiris.value;
  if (!gecerliMi(telefon)) return;
  const pin = pinGiris.value.trim();
  akisiBaslat({
    yol: `/api/hazirla?telefon=${encodeURIComponent(telefon)}`
      + (pin ? `&pin=${encodeURIComponent(pin)}` : ""),
    tur: "kurulum",
    telefon,
    onceEtiket: "Kurulum öncesi",
    sonraEtiket: "Kurulum sonrası",
    calisirkenMetin: "Kurulum sürüyor…",
  });
});

// --- Fabrikaya döndür (sağ üst) ---
// Yıkıcı işlem: düğme tek başına hiçbir şey yapmaz, onay balonu şart.
function onayiKapat() {
  onayBalon.hidden = true;
  sifirlaBtn.disabled = false;
}

sifirlaBtn.addEventListener("click", () => {
  onayBalon.hidden = false;
  sifirlaBtn.disabled = true;
  el("sifirlaHayir").focus();
});

el("sifirlaHayir").addEventListener("click", () => {
  onayiKapat();
  sifirlaBtn.focus();
});

el("sifirlaEvet").addEventListener("click", () => {
  onayiKapat();
  akisiBaslat({
    yol: "/api/fabrikaya-dondur",
    tur: "sifirlama",
    onceEtiket: "Şimdiki hali",
    sonraEtiket: "Fabrika hali",
    calisirkenMetin: "Fabrikaya döndürülüyor…",
  });
});

// Escape ile vazgeç; dışarı tıklayınca da kapan (kaza tıklaması iş yapmasın).
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !onayBalon.hidden) { onayiKapat(); sifirlaBtn.focus(); }
});
document.addEventListener("click", (e) => {
  if (!onayBalon.hidden && !e.target.closest(".sifirla-alan")) onayiKapat();
});

function bitir(ok, o) {
  if (akim) { akim.close(); akim = null; }
  const { toplam, satirDizi } = olcumBitir();

  olcumGonder({
    tur: akisTuru,
    durum: o.durum ?? null,
    ok: Boolean(ok),
    deneme: o.deneme ?? null,
    toplam_sn: Number(sn(toplam)),
    giris_sn: girisSn,
    adimlar: satirDizi.map((s) => ({ ad: s.etiket, sure_sn: Number(sn(s.sure)),
      an_sn: Number(sn(s.an)) })),
    degisen_ayar: [...satirlar.values()].filter((s) => s.sag.dataset.hal !== "sabit").length,
    ayni_ayar: [...satirlar.values()].filter((s) => s.sag.dataset.hal === "sabit").length,
    telefon: o.kayit?.telefon ?? null,
    iccid: o.kayit?.iccid ?? null,
    imei: o.kayit?.imei ?? null,
    lan_mac: o.kayit?.lan_mac ?? null,
    modem_ip: o.kayit?.modem_ip ?? null,
  });

  // Sıfırlama BAŞARILIYSA oturum burada biter: modem sıfırlandı, ekran da
  // sıfırdan başlamalı. Sonuç ekranında bekletip fazladan tıklama istemek
  // yanlıştı — sonuç ana ekranda duyuru olarak görünür.
  if (ok && akisTuru === "sifirlama") {
    anaEkrana(`Modem fabrikaya döndürüldü · ${o.kayit?.modem_ip || "192.168.1.1"}`
      + ` · ${sn(toplam)} sn — sıradaki kurulum için hazır.`);
    return;
  }

  const kayit = o.kayit;
  if (kayit) {
    el("konumSonra").textContent = kayit.modem_ip || "—";
    kimlikBas(el("kimlikOnce"), kayit);
  }
  altBar.dataset.hal = ok ? "hazir" : "hata";
  const net = o.kayit?.wan_ip
    ? ` · internet ${o.kayit.wan_ip}`
    : (o.durum || "").includes("internet_yok") ? " · ⚠ İNTERNET YOK (SIM/PIN kontrol et)" : "";
  altDurum.textContent = ok
    ? `HAZIR — ${o.durum}${o.deneme ? ` (deneme ${o.deneme})` : ""} · ${sn(toplam)} sn`
      + `${net} · deftere yazıldı`
    : `BAŞARISIZ — ${o.durum || "bilinmeyen"}${o.cozum ? ` · ${o.cozum}` : ""}`;
  // Internet yoksa alt bar UYARI rengine gecsin: gozden kacmasin.
  if (ok && (o.durum || "").includes("internet_yok")) altBar.dataset.hal = "uyari";
  if (!ok && o.problems?.length) {
    akisaYaz(o.problems.map((p) => (p.tr?.baslik ?? p.kod)).join(" · "));
  }
  // SIM kilidi cihazdan geldiyse BİRİNCİL çözümü söyle: PIN'i telefondan kapat.
  // Proje kararı PIN saklamak değil, PIN'i ortadan kaldırmak.
  const kod = (k) => (o.problems || []).some((p) => p.kod === k);
  if (simKilit?.kilit === "puk") {
    altBar.dataset.hal = "hata";
    altDurum.textContent = `SIM PUK KİLİTLİ (kalan ${simKilit.puk_kalan ?? "?"})`
      + " — telefonla PUK ile aç; PIN yazmak işe yaramaz";
  } else if (simKilit?.kilit === "pin") {
    altBar.dataset.hal = "uyari";
    altDurum.textContent = `SIM PIN KİLİTLİ (kalan ${simKilit.pin_kalan ?? "?"} hak)`
      + " — SIM'i telefona takıp PIN'i KAPAT, sonra geri tak";
  }

  // PIN kilidi VE PIN denenmedi -> operatörü ana ekrana atmadan burada sor.
  // Kurtarma yolu: provizyon tekrarlanmaz, yalnızca PIN yazılır (ayrı iş).
  // Son hak korumasına takıldıysa da sor: kararı insan verecek.
  const pinGerekli = (kod("PIN_REQUIRED") || kod("SIM_PIN_LOCKED")
    || kod("PIN_LAST_ATTEMPT")) && simKilit?.kilit !== "puk";
  pinIstek.hidden = !pinGerekli;
  if (pinGerekli) {
    pinIstekGiris.value = "";
    pinDeneBtn.disabled = true;
    pinIstekGiris.focus();
  }

  onayBtn.hidden = false;
  onayBtn.textContent = ok ? "Onayla ve sıradaki modem" : "Baştan dene";
  if (!pinGerekli) onayBtn.focus();
}

// Yerinde PIN denemesi — SADECE PIN yazılır, provizyon tekrarlanmaz.
pinDeneBtn.addEventListener("click", () => {
  const p = pinIstekGiris.value.trim();
  if (!/^\d{4,8}$/.test(p)) return;
  pinDeneBtn.disabled = true;
  altBar.removeAttribute("data-hal");
  altDurum.textContent = "SIM PIN deneniyor…";
  akisaYaz("PIN deneniyor");
  if (akim) { akim.close(); akim = null; }
  akim = new EventSource(`/api/pin?pin=${encodeURIComponent(p)}`);
  for (const tur of ["ilerleme", "internet_bekleniyor", "internet", "reboot",
    "pin_deneniyor", "pin_sonuc", "hata"]) {
    akim.addEventListener(tur, (e) => pinOlayi(tur, JSON.parse(e.data)));
  }
});

function pinOlayi(tur, o) {
  if (tur === "ilerleme") return akisaYaz(o.mesaj);
  if (tur === "reboot") return akisaYaz("modem yeniden başlatılıyor");
  if (tur === "pin_deneniyor") return akisaYaz("SIM PIN yazılıyor");
  if (tur === "internet_bekleniyor") {
    altDurum.textContent = `PIN sonrası internet bekleniyor (${o.gecen_sn}/${o.max_sn} sn)`;
    return undefined;
  }
  if (tur === "internet") {
    return akisaYaz(o.var ? `internet VAR: ${o.wan_ip} (${o.sure_sn} sn)`
      : `internet YOK (${o.sure_sn} sn)`);
  }
  if (tur === "hata") {
    if (akim) { akim.close(); akim = null; }
    altBar.dataset.hal = "hata";
    altDurum.textContent = `PIN denenemedi — ${o.mesaj}`;
    pinDeneBtn.disabled = false;
    return undefined;
  }
  // pin_sonuc
  if (akim) { akim.close(); akim = null; }
  if (!o.denendi) {
    akisaYaz(`PIN denenmedi (${o.atlandi})`);
    const t = o.problems?.[0]?.tr;
    altDurum.textContent = `PIN DENENMEDİ — ${t ? `${t.baslik}. ${t.neYap}` : o.atlandi}`;
    pinDeneBtn.disabled = false;
    return undefined;
  }
  pinIstek.hidden = true;
  altBar.dataset.hal = o.internet?.var ? "hazir" : "uyari";
  altDurum.textContent = o.internet?.var
    ? `PIN KABUL EDİLDİ — internet ${o.internet.wan_ip} (${o.internet.sure_sn} sn)`
    : `PIN yazıldı ama internet gelmedi (${o.internet?.sure_sn} sn) — kapsama/data paketi?`;
  onayBtn.hidden = false;
  onayBtn.focus();
  return undefined;
}

onayBtn.addEventListener("click", () => anaEkrana());
