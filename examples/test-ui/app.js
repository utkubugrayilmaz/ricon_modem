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
    // Yanlis PIN'den sonra dugme KAPANMAZ. "Bir hak yandiysa bir daha deneme"
    // kurali ARACIN kendi kendine tekrarlamasina karsi; operator baska bir PIN
    // yazmak isterse onu kesmek yanlis — dogru PIN'i bilen o. Tek sert durak
    // SON HAK, onu cekirdek reddediyor.
    if (g === pinGiris) pinKaldirBtn.disabled = !/^\d{4,8}$/.test(g.value);
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
let locked = false;
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
function isValid(d) {
  return d.length === HANE_SAYISI && d.startsWith("05");
}

function haneleriBoya() {
  const d = gizliGiris.value;
  haneKutulari.forEach((kutu, i) => {
    kutu.textContent = d[i] ?? "";
    kutu.classList.toggle("dolu", i < d.length);
    kutu.classList.toggle("imlec",
      !locked && i === d.length && document.activeElement === gizliGiris);
  });

  const tamam = isValid(d);
  haneler.classList.toggle("hatali", d.length === HANE_SAYISI && !tamam);
  haneler.classList.toggle("kilitli", locked);
  baslatBtn.disabled = !tamam || okunuyor;

  // Kilitliyse numara CIHAZDAN geldi: "eksik hane" uyarisi anlamsiz, alt
  // satirda zaten nereden geldigi yaziyor.
  if (locked) {
    uyari.textContent = " ";
    uyari.removeAttribute("data-state");
    return;
  }
  if (d.length === 0) {
    uyari.textContent = " ";
    uyari.removeAttribute("data-state");
  } else if (d.length < HANE_SAYISI) {
    const remaining = HANE_SAYISI - d.length;
    uyari.textContent = `Eksik: ${remaining} hane kaldı`;
    uyari.removeAttribute("data-state");
  } else if (!d.startsWith("05")) {
    uyari.textContent = "Numara 05 ile başlamalı";
    uyari.removeAttribute("data-state");
  } else {
    uyari.textContent = "Numara tam";
    uyari.dataset.state = "ok";
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
haneler.addEventListener("click", () => { if (!locked) gizliGiris.focus(); });

degistirBtn.addEventListener("click", () => {
  kilidiAc();
  gizliGiris.focus();
  gizliGiris.setSelectionRange(gizliGiris.value.length, gizliGiris.value.length);
});

function kilidiAc() {
  locked = false;
  gizliGiris.readOnly = false;
  kaynakMetin.textContent = "elle giriliyor";
  degistirBtn.hidden = true;
  haneleriBoya();
}

function numarayiYerlestir(input) {
  gizliGiris.value = input;
  locked = true;
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
  locked = false;
  gizliGiris.readOnly = false;
  kaynakMetin.textContent = "";
  degistirBtn.hidden = true;   // alan zaten yazilabilir, kapiya gerek yok
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
    if (!d.pc?.ready) {
      // EN OLASI SEBEP KABLO. Kablo çıkınca modem alt ağındaki ikincil IP
      // görünmez oluyor ve bu, "IP hiç tanımlı değil" ile birebir aynı
      // görünüyor — araç ikisini ayırt edemiyor (bkz. NO_SOURCE_IP).
      // O yüzden ekranda önce ucuz ve olası olan yazıyor; yapılandırma
      // tavsiyesi ikinci satırda, kablo takılıyken hâlâ sorun varsa diye.
      ustDurum.dataset.state = "waiting";
      ustDurum.textContent = "ağ yok — kablo/modem?";
      sifirlaBtn.disabled = true;
      ipucu.dataset.state = "error";
      const t = d.pc.problems?.[0]?.tr;
      ustDurum.textContent = t?.baslik ?? "ağ yok — kablo/modem?";
      ipucu.textContent = t?.neYap ?? "Modemin LAN kablosunu tak ve modemi aç.";
      return;
    }
    ipucu.removeAttribute("data-state");
    // Sıfırlanacak bir şey yoksa (modem yok / başka iş sürüyor) düğme kapalı.
    sifirlaBtn.disabled = !d.modem.location || d.busy || !d.canReset;
    if (d.modem.location) {
      ustDurum.dataset.state = d.modem.location;
      ustDurum.textContent = `modem ${d.modem.host} (${d.modem.location})`;
      if (!okunuyor && !degerlendirmeSonucu) {
        ipucu.textContent = d.modem.location === "field" ? "Zaten kurulmuş." : "Modem hazır.";
      }
      degerlendirmeyiTetikle(d);
    } else {
      ustDurum.dataset.state = "waiting";
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
    ustDurum.dataset.state = "error";
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
  if (!o?.retry?.retry) return;
  tekrarZamani = setTimeout(() => {
    degerlendirilenHost = null;    // aynı modem için yeniden bakılacak
    sonDenemeZamani = 0;
    durumuTazele();
  }, o.retry.delaySec * 1000);
}

function degerlendirmeyiTetikle(d) {
  if (okunuyor || d.busy) return;
  if (degerlendirilenHost === d.modem.host) return;      // bu modem okundu
  if (Date.now() - sonDenemeZamani < DENEME_ARASI_MS) return;
  degerlendir(d.modem.host);
}

async function degerlendir(host) {
  okunuyor = true;
  sonDenemeZamani = Date.now();
  ipucu.removeAttribute("data-state");
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
    ipucu.dataset.state = "error";
    ipucu.textContent = "Sunucuya ulaşılamadı.";
    tekrariAyarla({ retry: { retry: true, delaySec: 5 } });
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
  if (o.phone?.input) {
    numarayiYerlestir(o.phone.input);
    pinAlaniniGizle();
    ipucu.removeAttribute("data-state");
    ipucu.textContent = o.canStart ? "" : `eksik: ${o.missing.join(", ")}`;
    return;
  }
  // Numara gelmedi — sebebe göre ayrılıyoruz.
  numarayiSifirla();
  ipucu.dataset.state = "error";
  if (o.missing?.includes("sim")) {
    ipucu.textContent = "SIM takılı değil.";
    return;
  }
  if (o.missing?.includes("pin")) {
    // KİLİTLİ SIM: numara okunamaz, çünkü PIN kilidi abone verisini açmıyor.
    // Çözüm elle numara yazmak DEĞİL — kilidi SIM'den kaldırmak. Kaldırınca
    // numara zaten kendiliğinden gelir ve SIM her cihazda açık olur.
    pinKilidiIste(o.sim, o.pinRemovable);
    return;
  }
  ipucu.textContent = "Numara SIM'de yok — elle gir.";
  gizliGiris.focus();
}

// SIM kilitli: PIN alanini ACAR. Kalan hak yaziyor — operator neyi riske
// attigini denemeden gorsun.
function pinKilidiIste(sim, uygunluk) {
  const remaining = sim?.pinRemaining;
  pinAlan.hidden = false;
  ipucu.textContent = "SIM PIN kilitli";
  pinEtiketNot.textContent = remaining === null || remaining === undefined
    ? "— kalan hak okunamadı" : `— kalan hak: ${remaining}`;

  // KARAR ÇEKİRDEKTEN: burada yeniden hesaplanmıyor. Uygun değilse düğme
  // hiç görünmez — "yanlışlıkla basılabilecek" bir kapı bırakmıyoruz.
  // Uygun degilse dugme yok: yanlislikla basilacak kapi birakmiyoruz.
  if (uygunluk && uygunluk.eligible === false) {
    pinKaldirBtn.hidden = true;
    pinGiris.disabled = true;
    pinNot.textContent = {
      PIN_LAST_ATTEMPT: "Son hak — araç denemez. SIM'i telefonda aç.",
      SIM_PUK_LOCKED: "PUK kilitli. Telefondan PUK ile aç.",
    }[uygunluk.reason] ?? "Denenmeyecek.";
    return;
  }

  pinGiris.disabled = false;
  // Hak yanmissa SOYLE ama ENGELLEME: dogru PIN'i bilen operator.
  const total = sim?.pinTotal ?? 3;
  pinNot.textContent = (remaining != null && remaining < total)
    ? `Daha önce bir deneme yanmış. Kalan ${remaining}. PIN'den emin ol.`
    : "Tek deneme. Kilit SIM'den kalıcı kalkar.";
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
  pinAkis.removeAttribute("data-state");
  pinAkis.textContent = "başlıyor…";
  okunuyor = true;                 // BAŞLAT kapalı kalsın, durum yoklaması araya girmesin
  haneleriBoya();

  const yaz = (m) => { pinAkis.textContent = m; };
  pinAkim = new EventSource(`/api/pin-kaldir?pin=${encodeURIComponent(p)}`);
  pinAkim.addEventListener("progress", (e) => yaz(JSON.parse(e.data).message));
  pinAkim.addEventListener("simLock", (e) => {
    const o = JSON.parse(e.data);
    if (o.lock === "puk") {
      yaz(`SIM PUK kilitli (kalan ${o.pukRemaining ?? "?"}) — telefondan PUK ile aç.`);
    } else {
      yaz(`${o.status} · kalan hak: ${o.pinRemaining ?? "?"}`);
    }
  });
  pinAkim.addEventListener("pinDisableResult", (e) => {
    const o = JSON.parse(e.data);
    pinBitir(o.lockRemoved, o);
  });
  pinAkim.addEventListener("error", (e) => {
    const o = JSON.parse(e.data);
    pinBitir(false, { problems: [{ message: o.message, check: o.fix }] });
  });
  pinAkim.onerror = () => {
    if (pinAkim && pinAkim.readyState === EventSource.CLOSED) pinBitir(false, null);
  };
}

function pinBitir(succeeded, o) {
  if (pinAkim) { pinAkim.close(); pinAkim = null; }
  okunuyor = false;
  pinGiris.value = "";             // PIN hiçbir yerde durmaz, ekranda da
  if (succeeded) {
    pinAkis.dataset.state = "ok";
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
  pinAkis.dataset.state = "error";
  // SADECE tr: ham problems[].message/check GELISTIRICI metni ve Ingilizce,
  // ekrana asla basilmaz (sozluk src/report.js'te, tek yer).
  const first = o?.problems?.[0]?.tr;
  // Deneme GERÇEKTEN harcandı mı? Yalnızca PIN_REJECTED bir hak yakar.
  // Biçim hatası, "son hak" reddi ya da port sorunu hak yakmaz — onlarda
  // tekrar denemeyi kapatmak operatörü boşuna kilitler.
  const yandi = (o?.problems || []).some((p) => p.code === "PIN_REJECTED");
  pinAkis.textContent = o?.opened
    ? "SIM açıldı, kilit kalıcı kalkmadı."
    : (first?.baslik || "PIN kilidi kaldırılamadı")
      + (first?.neYap ? `\n${first.neYap}` : "");
  // Dugme ACIK kalir; PIN alani temizlendigi icin zaten yeni PIN bekliyor.
  pinKaldirBtn.disabled = true;
  pinGiris.focus();
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

const lines = new Map();   // nvram anahtarı -> { sol, sag, halKutu }

function izgaraKur(rows) {
  izgara.textContent = "";
  lines.clear();
  let sonSayfa = null;

  for (const s of rows) {
    if (s.page && s.page !== sonSayfa) {
      sonSayfa = s.page;
      const group = document.createElement("div");
      group.className = "grup";
      const a = document.createElement("span");
      a.textContent = s.page;
      const b = document.createElement("span");
      b.textContent = s.page;
      group.append(a, b);
      izgara.appendChild(group);
    }

    const sol = makeCell(s.name, s.before, false, s.willChange);
    const sag = makeCell(s.name, s.after, true, s.willChange);
    sag.dataset.state = s.willChange ? "pending" : "unchanged";
    const halKutu = document.createElement("span");
    halKutu.className = "h-hal";
    halKutu.textContent = s.willChange ? "bekliyor" : "değişmedi";
    sag.appendChild(halKutu);

    izgara.append(sol, sag);
    lines.set(s.key, { sol, sag, halKutu });
  }
}

function makeCell(name, value, sagMi, willChange) {
  const h = document.createElement("div");
  h.className = "hucre" + (sagMi ? " hucre-sonra" : "") + (willChange ? "" : " sabit");
  const a = document.createElement("span");
  a.className = "h-ad";
  a.textContent = name;
  const d = document.createElement("span");
  d.className = "h-deger";
  d.textContent = value;
  h.append(a, d);
  return h;
}

function halYaz(keys, state, label) {
  for (const k of keys || []) {
    const s = lines.get(k);
    if (!s || s.sag.dataset.state === "sabit") continue;
    s.sag.dataset.state = state;
    s.halKutu.textContent = label;
  }
}

const akisSatirlari = [];
function akisaYaz(message) {
  akisSatirlari.push(message);
  const last = akisSatirlari.slice(-4);
  akis.textContent = "";
  last.forEach((m, i) => {
    const p = document.createElement("span");
    p.textContent = m;
    if (i < last.length - 1) p.className = "akis-gecmis";
    akis.append(p, document.createElement("br"));
  });
}

function kimlikBas(target, k) {
  const fields = [
    ["Telefon", k.phone], ["ICCID", k.iccid], ["IMEI", k.imei],
    ["IMSI", k.imsi], ["MAC", k.lanMac], ["Operatör", k.operator],
  ].filter(([, v]) => v);
  const dl = document.createElement("dl");
  dl.className = "kimlik-liste";
  for (const [name, value] of fields) {
    const sar = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = name;
    const dd = document.createElement("dd");
    dd.textContent = value;
    sar.append(dt, dd);
    dl.appendChild(sar);
  }
  target.textContent = "";
  target.appendChild(dl);
}

let akim = null;
let akisTuru = null;   // "kurulum" | "sifirlama" — bitişte ne yapılacağını belirler
let simLock = null;   // cihazın bildirdiği PIN/PUK kilidi (varsa)

// --- Süre ölçümü (TEST) ---
// "Başlat"a bastığımdan bitişe kadar kaç saniye? Ölçüm noktası olayın EKRANA
// GELDİĞİ an — yani teknisyenin gerçekten beklediği süre. Tamamen tarayıcıda:
// sunucuya ve çekirdeğe hiç dokunmuyor.
const OLCUM_ETIKET = {
  algilandi: "modem algılandı",
  plan: "ayarlar okundu (plan hazır)",
  yaziliyor: "yazma başladı",
  written: "yazma bitti",
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

const elapsedSec = () => (performance.now() - baslangicMs) / 1000;
const sec = (x) => x.toFixed(1);

let girisSn = null;

function olcumBasla() {
  girisSn = Number(((performance.now() - girisHazirMs) / 1000).toFixed(1));
  baslangicMs = performance.now();
  olcumler.length = 0;
  olcumBolum.hidden = true;
  olcumTablo.textContent = "";
  altSure.textContent = "0.0 sn";
  clearInterval(sayacZamani);
  sayacZamani = setInterval(() => { altSure.textContent = `${sec(elapsedSec())} sn`; }, 250);
}

// Olay geldiğinde damgala. `ek` varsa etikete eklenir (örn. kaç ayar yazıldı).
function olcumKaydet(kind, ek = "") {
  const label = OLCUM_ETIKET[kind];
  if (!label) return;
  olcumler.push({ label: ek ? `${label} — ${ek}` : label, elapsedSec: elapsedSec() });
}

// Ölçüm tablosunu basar: her adımın kendi süresi + kümülatif + toplam.
// En uzun adım kırmızı — darboğaz tek bakışta görünsün.
function olcumBitir() {
  clearInterval(sayacZamani);
  sayacZamani = null;
  const total = elapsedSec();
  altSure.textContent = `${sec(total)} sn`;

  const satirDizi = olcumler.map((o, i) => ({
    label: o.label,
    duration: o.elapsedSec - (i === 0 ? 0 : olcumler[i - 1].elapsedSec),
    an: o.elapsedSec,
  }));
  const enUzun = Math.max(0, ...satirDizi.map((s) => s.duration));

  olcumTablo.textContent = "";
  const cell = (text, sinif) => {
    const s = document.createElement("span");
    s.textContent = text;
    if (sinif) s.className = sinif;
    return s;
  };
  olcumTablo.append(
    cell("adım", "olcum-baslik"), cell("süre", "olcum-baslik"), cell("an", "olcum-baslik"),
  );
  for (const s of satirDizi) {
    const uzunMu = s.duration === enUzun && satirDizi.length > 1 ? "olcum-uzun" : "";
    olcumTablo.append(
      cell(s.label, uzunMu), cell(`${sec(s.duration)} sn`, uzunMu), cell(`${sec(s.an)} sn`),
    );
  }
  olcumTablo.append(
    cell("TOPLAM (başlat → bitiş)", "olcum-toplam"),
    cell(`${sec(total)} sn`, "olcum-toplam"),
    cell("", "olcum-toplam"),
  );
  olcumBolum.hidden = false;
  return { total, satirDizi };
}

// Ölçümü sunucuya yolla (data/olcumler.jsonl). Metrik iddiası için süreler
// ekranda kaybolmamalı. Başarısız gönderim akışı bozmaz — ölçüm, işin kendisi
// değil.
function olcumGonder(body) {
  fetch("/api/olcum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => { /* olcum kaydi kritik degil */ });
}

// Karşılaştırma ekranını KOMPLE boşaltır. Tek yerde toplandı: temizliği alan
// alan yapmak, bir alanı unutup önceki modemin bilgisini gösterme hatasının
// kaynağıydı. Yeni alan eklenirse SADECE buraya eklenir.
function panelleriTemizle() {
  izgara.textContent = "";
  lines.clear();
  akisSatirlari.length = 0;
  akis.textContent = "";
  simLock = null;
  el("kimlikOnce").textContent = "";
  el("konumOnce").textContent = "—";
  el("konumSonra").textContent = "—";
  onayBtn.hidden = true;
  altBar.removeAttribute("data-state");
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
function akisiBaslat({ path, kind, phone = null, onceEtiket, sonraEtiket, calisirkenMetin }) {
  if (akim) { akim.close(); akim = null; }   // çift başlatmaya karşı
  durumuIzle(false);
  onayiKapat();
  akisTuru = kind;
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
  akim = new EventSource(path);

  // Ölçüm: her damgalanan olay için ayrı dinleyici — mevcut işleyicilere
  // dokunmaz, biri eklenip çıkarılınca ölçüm bozulmaz.
  for (const kind of Object.keys(OLCUM_ETIKET)) {
    akim.addEventListener(kind, (e) => {
      const o = JSON.parse(e.data);
      olcumKaydet(kind, o.keys ? `${o.keys.length} ayar` : "");
    });
  }

  akim.addEventListener("progress", (e) => akisaYaz(JSON.parse(e.data).message));

  akim.addEventListener("identityBefore", (e) => {
    kimlikBas(el("kimlikOnce"), { ...JSON.parse(e.data), phone });
  });

  akim.addEventListener("plan", (e) => {
    izgaraKur(JSON.parse(e.data).lines);
  });

  akim.addEventListener("detected", (e) => {
    const o = JSON.parse(e.data);
    el("konumOnce").textContent = o.location || "modem yok";
    ustDurum.dataset.state = o.action === "provisionFromFactory" ? "factory" : "field";
    ustDurum.textContent = o.action.replace(/_/g, " ");
  });

  akim.addEventListener("yaziliyor", (e) => halYaz(JSON.parse(e.data).keys, "yaziliyor", "yazılıyor"));
  akim.addEventListener("yazildi", (e) => halYaz(JSON.parse(e.data).keys, "written", "yazıldı"));

  akim.addEventListener("writeFailed", (e) => {
    const a = JSON.parse(e.data).keys || [];
    halYaz(a, "error", "yazılamadı");
    akisaYaz(`yazılamadı: ${a.length} ayar`);
  });

  akim.addEventListener("reboot", () => akisaYaz("modem yeniden başlatılıyor"));

  // İnternet doğrulaması — operatör beklemiyor, araç bekliyor. Ekranda ne
  // olduğu net yazsın, donmuş gibi görünmesin.
  akim.addEventListener("internet_bekleniyor", (e) => {
    const o = JSON.parse(e.data);
    altDurum.textContent = "SIM doğrulanıyor — internet bekleniyor "
      + `(${o.elapsedSec}/${o.maxSec} sn)`;
  });

  akim.addEventListener("internet", (e) => {
    const o = JSON.parse(e.data);
    akisaYaz(o.online
      ? `internet VAR: ${o.wanIp} (${o.durationSec} sn) — SIM çalışıyor`
      : `internet YOK (${o.durationSec} sn) — SIM durumu: ${o.simStatus || "?"}`);
  });

  // Kurulum akışında PIN otomatik denenirse (baştan girilmişse) haber ver.
  akim.addEventListener("pinAttempting", () => akisaYaz("SIM PIN yazılıyor (tek deneme)"));

  // Cihaz PIN/PUK kilidini kendisi söylüyor ("Need verification PIN code
  // (PIN: 3/3, PUK: 10/10)") — internet beklemeye gerek yok, anında bildir.
  akim.addEventListener("simLock", (e) => {
    const o = JSON.parse(e.data);
    simLock = o;
    akisaYaz(`SIM ${o.lock.toUpperCase()} KİLİTLİ — kalan hak: PIN ${o.pinRemaining ?? "?"}`
      + `, PUK ${o.pukRemaining ?? "?"}`);
  });

  // Provizyon adımının bitişi (nihai sonuç değil — o `sonuc`). Yalnız
  // başarısızlıkta bilgi taşır: doğrulama neden tamamlanmadı.
  akim.addEventListener("bitti", (e) => {
    const o = JSON.parse(e.data);
    if (!o.ok && o.verification?.reason) akisaYaz(o.verification.reason);
  });

  akim.addEventListener("verification", (e) => {
    const o = JSON.parse(e.data);
    akisaYaz(o.status === "waitingForDevice"
      ? `modem bekleniyor (${o.attempt})`
      : `oturmayan ayar: ${o.remaining.length}`);
  });

  akim.addEventListener("dogrulandi", (e) => {
    const o = JSON.parse(e.data);
    halYaz([...lines.keys()], "verified", "doğrulandı");
    akisaYaz(`doğrulandı (${o.waitSec} sn)`);
  });

  akim.addEventListener("kimlik", (e) => {
    const k = JSON.parse(e.data).kimlik_bilgi || {};
    if (k.iccid) kimlikBas(el("kimlikOnce"), { ...k, phone });
  });

  akim.addEventListener("result", (e) => {
    const o = JSON.parse(e.data);
    finish(o.ok, o);
  });

  akim.addEventListener("error", (e) => {
    const o = JSON.parse(e.data);
    finish(false, { status: o.message, fix: o.fix });
  });

  // Akış kapanırsa EventSource kendiliğinden YENİDEN BAĞLANIR — kurulumu
  // ikinci kez başlatmasın diye biz kapatıyoruz (bitir() kapatır).
  akim.onerror = () => {
    if (akim && akim.readyState === EventSource.CLOSED) return;
    akisaYaz("bağlantı koptu");
  };
}

baslatBtn.addEventListener("click", () => {
  const phone = gizliGiris.value;
  if (!isValid(phone)) return;
  const pin = pinGiris.value.trim();
  akisiBaslat({
    path: `/api/hazirla?telefon=${encodeURIComponent(phone)}`
      + (pin ? `&pin=${encodeURIComponent(pin)}` : ""),
    kind: "kurulum",
    phone,
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
    path: "/api/fabrikaya-dondur",
    kind: "sifirlama",
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

function finish(ok, o) {
  if (akim) { akim.close(); akim = null; }
  const { total, satirDizi } = olcumBitir();

  olcumGonder({
    kind: akisTuru,
    status: o.status ?? null,
    ok: Boolean(ok),
    attempt: o.attempt ?? null,
    totalSec: Number(sec(total)),
    entrySec: girisSn,
    steps: satirDizi.map((s) => ({ name: s.label, durationSec: Number(sec(s.duration)),
      an_sn: Number(sec(s.an)) })),
    changedSettings: [...lines.values()].filter((s) => s.sag.dataset.state !== "sabit").length,
    unchangedSettings: [...lines.values()].filter((s) => s.sag.dataset.state === "sabit").length,
    phone: o.record?.phone ?? null,
    iccid: o.record?.iccid ?? null,
    imei: o.record?.imei ?? null,
    lanMac: o.record?.lanMac ?? null,
    modemIp: o.record?.modemIp ?? null,
  });

  // Sıfırlama BAŞARILIYSA oturum burada biter: modem sıfırlandı, ekran da
  // sıfırdan başlamalı. Sonuç ekranında bekletip fazladan tıklama istemek
  // yanlıştı — sonuç ana ekranda duyuru olarak görünür.
  if (ok && akisTuru === "sifirlama") {
    anaEkrana(`Modem fabrikaya döndürüldü · ${o.record?.modemIp || "192.168.1.1"}`
      + ` · ${sec(total)} sn — sıradaki kurulum için hazır.`);
    return;
  }

  const record = o.record;
  if (record) {
    el("konumSonra").textContent = record.modemIp || "—";
    kimlikBas(el("kimlikOnce"), record);
  }
  altBar.dataset.state = ok ? "ready" : "error";
  const net = o.record?.wanIp
    ? ` · internet ${o.record.wanIp}`
    : (o.status || "").includes("noInternet") ? " · ⚠ İNTERNET YOK (SIM/PIN kontrol et)" : "";
  altDurum.textContent = ok
    ? `HAZIR — ${o.status}${o.attempt ? ` (deneme ${o.attempt})` : ""} · ${sec(total)} sn`
      + `${net} · deftere yazıldı`
    : `BAŞARISIZ — ${o.status || "bilinmeyen"}${o.fix ? ` · ${o.fix}` : ""}`;
  // Internet yoksa alt bar UYARI rengine gecsin: gozden kacmasin.
  if (ok && (o.status || "").includes("noInternet")) altBar.dataset.state = "warning";
  if (!ok && o.problems?.length) {
    akisaYaz(o.problems.map((p) => (p.tr?.baslik ?? p.code)).join(" · "));
  }
  // SIM kilidi cihazdan geldiyse BİRİNCİL çözümü söyle: PIN'i telefondan kapat.
  // Proje kararı PIN saklamak değil, PIN'i ortadan kaldırmak.
  const code = (k) => (o.problems || []).some((p) => p.code === k);
  if (simLock?.lock === "puk") {
    altBar.dataset.state = "error";
    altDurum.textContent = `SIM PUK KİLİTLİ (kalan ${simLock.pukRemaining ?? "?"})`
      + " — telefonla PUK ile aç; PIN yazmak işe yaramaz";
  } else if (simLock?.lock === "pin") {
    altBar.dataset.state = "warning";
    altDurum.textContent = `SIM PIN KİLİTLİ (kalan ${simLock.pinRemaining ?? "?"} hak)`
      + " — SIM'i telefona takıp PIN'i KAPAT, sonra geri tak";
  }

  // PIN kilidi VE PIN denenmedi -> operatörü ana ekrana atmadan burada sor.
  // Kurtarma yolu: provizyon tekrarlanmaz, yalnızca PIN yazılır (ayrı iş).
  // Son hak korumasına takıldıysa da sor: kararı insan verecek.
  const pinGerekli = (code("PIN_REQUIRED") || code("SIM_PIN_LOCKED")
    || code("PIN_LAST_ATTEMPT")) && simLock?.lock !== "puk";
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
  altBar.removeAttribute("data-state");
  altDurum.textContent = "SIM PIN deneniyor…";
  akisaYaz("PIN deneniyor");
  if (akim) { akim.close(); akim = null; }
  akim = new EventSource(`/api/pin?pin=${encodeURIComponent(p)}`);
  for (const kind of ["progress", "internet_bekleniyor", "internet", "reboot",
    "pinAttempting", "pinResult", "error"]) {
    akim.addEventListener(kind, (e) => pinOlayi(kind, JSON.parse(e.data)));
  }
});

function pinOlayi(kind, o) {
  if (kind === "progress") return akisaYaz(o.message);
  if (kind === "reboot") return akisaYaz("modem yeniden başlatılıyor");
  if (kind === "pinAttempting") return akisaYaz("SIM PIN yazılıyor");
  if (kind === "internet_bekleniyor") {
    altDurum.textContent = `PIN sonrası internet bekleniyor (${o.elapsedSec}/${o.maxSec} sn)`;
    return undefined;
  }
  if (kind === "internet") {
    return akisaYaz(o.online ? `internet VAR: ${o.wanIp} (${o.durationSec} sn)`
      : `internet YOK (${o.durationSec} sn)`);
  }
  if (kind === "error") {
    if (akim) { akim.close(); akim = null; }
    altBar.dataset.state = "error";
    altDurum.textContent = `PIN denenemedi — ${o.message}`;
    pinDeneBtn.disabled = false;
    return undefined;
  }
  // pin_sonuc
  if (akim) { akim.close(); akim = null; }
  if (!o.attempted) {
    akisaYaz(`PIN denenmedi (${o.skipped})`);
    const t = o.problems?.[0]?.tr;
    altDurum.textContent = `PIN DENENMEDİ — ${t ? `${t.baslik}. ${t.neYap}` : o.skipped}`;
    pinDeneBtn.disabled = false;
    return undefined;
  }
  pinIstek.hidden = true;
  altBar.dataset.state = o.internet?.online ? "ready" : "warning";
  altDurum.textContent = o.internet?.online
    ? `PIN KABUL EDİLDİ — internet ${o.internet.wanIp} (${o.internet.durationSec} sn)`
    : `PIN yazıldı ama internet gelmedi (${o.internet?.durationSec} sn) — kapsama/data paketi?`;
  onayBtn.hidden = false;
  onayBtn.focus();
  return undefined;
}

onayBtn.addEventListener("click", () => anaEkrana());
