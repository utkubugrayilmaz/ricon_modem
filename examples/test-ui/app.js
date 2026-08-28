// Tarayıcı tarafı — ince katman, tıpkı ricon.js gibi.
//
// Burada İŞ MANTIĞI YOK: telefonun geçerliliğini de, hangi ayarın değişeceğini
// de, kaydın tutulmasını da çekirdek biliyor. Bu dosya sunucunun yolladığı
// olayları ekrana basar. Sözlük de sunucudan hazır geliyor (satırlar ekrana
// hazır: ad, önce, sonra) — tarayıcı nvram anahtarı bilmez.
//
// Sıfır bağımlılık: framework yok, build yok. EventSource tarayıcıda yerleşik.

const DIGIT_COUNT = 11;                 // 0 + 10 hane: 0535 064 18 58
const GAP_AFTER = new Set([3, 6, 8]);   // bu hanelerden SONRA görsel boşluk

const el = (id) => document.getElementById(id);
const entryScreen = el("entryScreen");
const runScreen = el("runScreen");
const digitRow = el("digitRow");
const hiddenInput = el("hiddenInput");
const hint = el("hint");
const startBtn = el("startBtn");
const tip = el("tip");
const topStatus = el("topStatus");
const grid = el("grid");
const stream = el("stream");
const footer = el("footer");
const footerStatus = el("footerStatus");
const confirmBtn = el("confirmBtn");
const resetBtn = el("resetBtn");
const resetArea = document.querySelector(".reset-area");
const confirmPopover = el("confirmPopover");
const notice = el("notice");
const metricSection = el("metricSection");
const metricTable = el("metricTable");
const footerTimer = el("footerTimer");
const pinInput = el("pinInput");
const pinRequest = el("pinRequest");
const pinRequestInput = el("pinRequestInput");
const pinTryBtn = el("pinTryBtn");
const sourceText = el("sourceText");
const editBtn = el("editBtn");
const pinArea = el("pinArea");
const pinDisableBtn = el("pinDisableBtn");
const pinLabelNote = el("pinLabelNote");
const pinNote = el("pinNote");
const pinStream = el("pinStream");

// PIN girişleri: sadece rakam, en fazla 8 hane. Bozuk PIN bir deneme yakar,
// o yüzden kaynağında süzülüyor (çekirdek de ayrıca reddediyor).
for (const g of [pinInput, pinRequestInput]) {
  g.addEventListener("input", () => {
    g.value = g.value.replace(/\D/g, "").slice(0, 8);
    if (g === pinRequestInput) pinTryBtn.disabled = !/^\d{4,8}$/.test(g.value);
    // Yanlis PIN'den sonra dugme KAPANMAZ. "Bir hak yandiysa bir daha deneme"
    // kurali ARACIN kendi kendine tekrarlamasina karsi; operator baska bir PIN
    // yazmak isterse onu kesmek yanlis — dogru PIN'i bilen o. Tek sert durak
    // SON HAK, onu cekirdek reddediyor.
    if (g === pinInput) pinDisableBtn.disabled = !/^\d{4,8}$/.test(g.value);
  });
}
pinTryBtn.disabled = true;

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

for (let i = 0; i < DIGIT_COUNT; i += 1) {
  const h = document.createElement("span");
  h.className = "digit" + (GAP_AFTER.has(i) ? " gap" : "");
  digitRow.appendChild(h);
}
const digitCells = [...digitRow.children];

// Numara geçerli mi? 11 hane ve 05 ile başlamalı (TR mobil).
// Aynı kural çekirdekte de var (telefonNormalize) — burası sadece erken uyarı.
function isValid(d) {
  return d.length === DIGIT_COUNT && d.startsWith("05");
}

function paintDigits() {
  const d = hiddenInput.value;
  digitCells.forEach((cell, i) => {
    cell.textContent = d[i] ?? "";
    cell.classList.toggle("filled", i < d.length);
    cell.classList.toggle("caret",
      !locked && i === d.length && document.activeElement === hiddenInput);
  });

  const tamam = isValid(d);
  digitRow.classList.toggle("invalid", d.length === DIGIT_COUNT && !tamam);
  digitRow.classList.toggle("locked", locked);
  startBtn.disabled = !tamam || okunuyor;

  // Kilitliyse numara CIHAZDAN geldi: "eksik digit" uyarisi anlamsiz, alt
  // satirda zaten nereden geldigi yaziyor.
  if (locked) {
    hint.textContent = " ";
    hint.removeAttribute("data-state");
    return;
  }
  if (d.length === 0) {
    hint.textContent = " ";
    hint.removeAttribute("data-state");
  } else if (d.length < DIGIT_COUNT) {
    const remaining = DIGIT_COUNT - d.length;
    hint.textContent = `Eksik: ${remaining} hane kaldı`;
    hint.removeAttribute("data-state");
  } else if (!d.startsWith("05")) {
    hint.textContent = "Numara 05 ile başlamalı";
    hint.removeAttribute("data-state");
  } else {
    hint.textContent = "Numara tam";
    hint.dataset.state = "ok";
  }
}

// Fazla hane giremez, harf giremez: girişi kaynağında süz.
hiddenInput.addEventListener("input", () => {
  hiddenInput.value = hiddenInput.value.replace(/\D/g, "").slice(0, DIGIT_COUNT);
  paintDigits();
});
hiddenInput.addEventListener("focus", paintDigits);
hiddenInput.addEventListener("blur", paintDigits);
hiddenInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !startBtn.disabled) startBtn.click();
});
paintDigits();

// Duzenlemenin TEK kapisi. Numarayi SILMEZ — genelde tek hane duzeltilir.
// Alan duzenlemeye acikken hanelere tiklamak odaklar. Kilitliyken HICBIR SEY
// yapmaz — cihazdan gelen numara tiklayarak bozulmasin.
digitRow.addEventListener("click", () => { if (!locked) hiddenInput.focus(); });

editBtn.addEventListener("click", () => {
  unlockField();
  hiddenInput.focus();
  hiddenInput.setSelectionRange(hiddenInput.value.length, hiddenInput.value.length);
});

function unlockField() {
  locked = false;
  hiddenInput.readOnly = false;
  sourceText.textContent = "elle giriliyor";
  editBtn.hidden = true;
  paintDigits();
}

function placeNumber(input) {
  hiddenInput.value = input;
  locked = true;
  otomatikDolduruldu = true;
  hiddenInput.readOnly = true;
  sourceText.textContent = "SIM'den okundu";
  editBtn.textContent = "Değiştir";
  editBtn.hidden = false;
  paintDigits();
}

// Cihaz gittiginde: OTOMATIK gelen numara baska bir modeme aittir, silinir.
// Operatorun ELLE yazdigina dokunulmaz.
function clearNumber() {
  if (otomatikDolduruldu) hiddenInput.value = "";
  otomatikDolduruldu = false;
  // KILIT KALKAR. Kilit yalnizca CIHAZDAN GELEN numarayi korumak icin var;
  // buraya gelindiginde ya o numara silindi (yukarida) ya da alandaki deger
  // operatorun kendisinin — ikisinde de kilidin anlami yok.
  //
  // Ilk yazimda burada KILITLENIYORDU ve hemen ardindan "elle gir" yazip
  // focus() cagriliyordu; readOnly alana yazilamaz, yani operatore yaz
  // deyip yazdirmiyorduk.
  locked = false;
  hiddenInput.readOnly = false;
  sourceText.textContent = "";
  editBtn.hidden = true;   // alan zaten yazilabilir, kapiya gerek yok
  pinStream.hidden = true;
  pinStream.textContent = "";
  hidePinArea();
  paintDigits();
}

// Modem nerede? Giriş ekranında düzenli sor — teknisyen kabloyu takmadan
// "başlat"a basıp beklemesin.
let statusTimer = null;
async function refreshStatus() {
  try {
    const r = await fetch("/api/durum");
    const d = await r.json();
    if (!d.pc?.ready) {
      // EN OLASI SEBEP KABLO. Kablo çıkınca modem alt ağındaki ikincil IP
      // görünmez oluyor ve bu, "IP hiç tanımlı değil" ile birebir aynı
      // görünüyor — araç ikisini ayırt edemiyor (bkz. NO_SOURCE_IP).
      // O yüzden ekranda önce ucuz ve olası olan yazıyor; yapılandırma
      // tavsiyesi ikinci satırda, kablo takılıyken hâlâ sorun varsa diye.
      topStatus.dataset.state = "waiting";
      topStatus.textContent = "ağ yok — kablo/modem?";
      resetBtn.disabled = true;
      tip.dataset.state = "error";
      const t = d.pc.problems?.[0]?.tr;
      topStatus.textContent = t?.baslik ?? "ağ yok — kablo/modem?";
      tip.textContent = t?.neYap ?? "Modemin LAN kablosunu tak ve modemi aç.";
      return;
    }
    tip.removeAttribute("data-state");
    // Sıfırlanacak bir şey yoksa (modem yok / başka iş sürüyor) düğme kapalı.
    resetBtn.disabled = !d.modem.location || d.busy || !d.canReset;
    if (d.modem.location) {
      topStatus.dataset.state = d.modem.location;
      topStatus.textContent = `modem ${d.modem.host} (${d.modem.location})`;
      if (!okunuyor && !lastAssessment) {
        tip.textContent = d.modem.location === "field" ? "Zaten kurulmuş." : "Modem hazır.";
      }
      maybeAssess(d);
    } else {
      topStatus.dataset.state = "waiting";
      topStatus.textContent = "modem yok";
      tip.textContent = "Modemi tak.";
      // Cihaz gitti: bir sonraki modem KENDI okumasini hak eder.
      if (assessedHost || lastAssessment) {
        assessedHost = null;
        lastAssessment = null;
        lastAttemptAt = 0;
        clearNumber();
      }
    }
  } catch {
    topStatus.dataset.state = "error";
    topStatus.textContent = "sunucuya ulaşılamıyor";
  }
}

// --- Numarayı cihazdan oku (PAHALI: ~5 sn, modem başına BİR KEZ) ---
//
// /api/durum saniyede bir yoklanabilir; /api/degerlendir yoklanamaz — HTTP
// kimlik okuması + telnet üzerinden AT komutu demek ve cihaz tek bağlantılı.
// Bu yüzden tetik "modem YOK → VAR" geçişi: host değiştiğinde bir kez.
let assessedHost = null;   // hangi modem için okuduk
let lastAssessment = null;   // son okuma (ipucunu o yazar)
let lastAttemptAt = 0;
let retryTimer = null;          // çekirdeğin istediği yeniden bakış
const RETRY_COOLDOWN_MS = 15000;    // başarısız okumadan sonra bekleme

// Çekirdek "tekrar bak, N sn sonra" diyorsa uy. KARAR BURADA VERİLMİYOR:
// hangi durumun tekrar hak ettiği (geçici hata mı, insan mı bekleniyor)
// yenidenDenemeKarari'nda — sunucu onu cevabın `tekrar` alanında yolluyor.
// Burası yalnızca zamanlayıcı.
function scheduleRetry(o) {
  clearTimeout(retryTimer);
  retryTimer = null;
  if (!o?.retry?.retry) return;
  retryTimer = setTimeout(() => {
    assessedHost = null;    // aynı modem için yeniden bakılacak
    lastAttemptAt = 0;
    refreshStatus();
  }, o.retry.delaySec * 1000);
}

function maybeAssess(d) {
  if (okunuyor || d.busy) return;
  if (assessedHost === d.modem.host) return;      // bu modem okundu
  if (Date.now() - lastAttemptAt < RETRY_COOLDOWN_MS) return;
  assess(d.modem.host);
}

async function assess(host) {
  okunuyor = true;
  lastAttemptAt = Date.now();
  tip.removeAttribute("data-state");
  tip.textContent = "SIM'den numara okunuyor…";
  paintDigits();                 // BAŞLAT'ı okuma bitene kadar kapatır
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
    tip.dataset.state = "error";
    tip.textContent = "Sunucuya ulaşılamadı.";
    scheduleRetry({ retry: { retry: true, delaySec: 5 } });
    paintDigits();
    return;
  }
  assessedHost = host;
  lastAssessment = o;
  applyAssessment(o);
  scheduleRetry(o);
  paintDigits();
}

// Okuma sonucunu ekrana çevirir. KARAR YOK: `eksik` çekirdekten geliyor,
// burası yalnızca hangi cümlenin yazılacağını seçiyor.
function applyAssessment(o) {
  if (o.phone?.input) {
    placeNumber(o.phone.input);
    hidePinArea();
    tip.removeAttribute("data-state");
    tip.textContent = o.canStart ? "" : `eksik: ${o.missing.join(", ")}`;
    return;
  }
  // Numara gelmedi — sebebe göre ayrılıyoruz.
  clearNumber();
  tip.dataset.state = "error";
  if (o.missing?.includes("sim")) {
    tip.textContent = "SIM takılı değil.";
    return;
  }
  if (o.missing?.includes("pin")) {
    // KİLİTLİ SIM: numara okunamaz, çünkü PIN kilidi abone verisini açmıyor.
    // Çözüm elle numara yazmak DEĞİL — kilidi SIM'den kaldırmak. Kaldırınca
    // numara zaten kendiliğinden gelir ve SIM her cihazda açık olur.
    askPinUnlock(o.sim, o.pinRemovable);
    return;
  }
  tip.textContent = "Numara SIM'de yok — elle gir.";
  hiddenInput.focus();
}

// SIM kilitli: PIN alanini ACAR. Kalan hak yaziyor — operator neyi riske
// attigini denemeden gorsun.
function askPinUnlock(sim, uygunluk) {
  const remaining = sim?.pinRemaining;
  pinArea.hidden = false;
  tip.textContent = "SIM PIN locked";
  pinLabelNote.textContent = remaining === null || remaining === undefined
    ? "— kalan hak okunamadı" : `— kalan hak: ${remaining}`;

  // KARAR ÇEKİRDEKTEN: burada yeniden hesaplanmıyor. Uygun değilse düğme
  // hiç görünmez — "yanlışlıkla basılabilecek" bir kapı bırakmıyoruz.
  // Uygun degilse dugme yok: yanlislikla basilacak kapi birakmiyoruz.
  if (uygunluk && uygunluk.eligible === false) {
    pinDisableBtn.hidden = true;
    pinInput.disabled = true;
    pinNote.textContent = {
      PIN_LAST_ATTEMPT: "Son hak — araç denemez. SIM'i telefonda aç.",
      SIM_PUK_LOCKED: "PUK kilitli. Telefondan PUK ile aç.",
    }[uygunluk.reason] ?? "Denenmeyecek.";
    return;
  }

  pinInput.disabled = false;
  // Hak yanmissa SOYLE ama ENGELLEME: dogru PIN'i bilen operator.
  const total = sim?.pinTotal ?? 3;
  pinNote.textContent = (remaining != null && remaining < total)
    ? `Daha önce bir deneme yanmış. Kalan ${remaining}. PIN'den emin ol.`
    : "Tek deneme. Kilit SIM'den kalıcı kalkar.";
  pinDisableBtn.hidden = false;
  pinDisableBtn.disabled = !/^\d{4,8}$/.test(pinInput.value);
  pinInput.focus();
}

function hidePinArea() {
  pinArea.hidden = true;
  pinDisableBtn.hidden = true;
  pinInput.disabled = false;
  pinLabelNote.textContent = "";
  pinNote.textContent = "";
}

// --- PIN kilidini kaldır: SSE akışı ---
//
// Kurulum akışıyla AYNI kalıp (EventSource + olay adları), ama kendi küçük
// alanına yazıyor: operatör ana ekrandan ayrılmıyor. Bitince numara okuma
// KENDİLİĞİNDEN tekrar çalışır — istenen zincir bu: kilit kalktı → numara geldi.
let pinStreamSource = null;
function disablePinLock() {
  const p = pinInput.value.trim();
  if (!/^\d{4,8}$/.test(p)) return;
  if (pinStreamSource) { pinStreamSource.close(); pinStreamSource = null; }
  pinDisableBtn.disabled = true;
  pinStream.hidden = false;
  pinStream.removeAttribute("data-state");
  pinStream.textContent = "başlıyor…";
  okunuyor = true;                 // BAŞLAT kapalı kalsın, durum yoklaması araya girmesin
  paintDigits();

  const yaz = (m) => { pinStream.textContent = m; };
  pinStreamSource = new EventSource(`/api/pin-kaldir?pin=${encodeURIComponent(p)}`);
  pinStreamSource.addEventListener("progress", (e) => yaz(JSON.parse(e.data).message));
  pinStreamSource.addEventListener("simLock", (e) => {
    const o = JSON.parse(e.data);
    if (o.lock === "puk") {
      yaz(`SIM PUK kilitli (kalan ${o.pukRemaining ?? "?"}) — telefondan PUK ile aç.`);
    } else {
      yaz(`${o.status} · kalan hak: ${o.pinRemaining ?? "?"}`);
    }
  });
  pinStreamSource.addEventListener("pinDisableResult", (e) => {
    const o = JSON.parse(e.data);
    finishPinFlow(o.lockRemoved, o);
  });
  pinStreamSource.addEventListener("error", (e) => {
    const o = JSON.parse(e.data);
    finishPinFlow(false, { problems: [{ message: o.message, check: o.fix }] });
  });
  pinStreamSource.onerror = () => {
    if (pinStreamSource && pinStreamSource.readyState === EventSource.CLOSED) finishPinFlow(false, null);
  };
}

function finishPinFlow(succeeded, o) {
  if (pinStreamSource) { pinStreamSource.close(); pinStreamSource = null; }
  okunuyor = false;
  pinInput.value = "";             // PIN hiçbir yerde durmaz, ekranda da
  if (succeeded) {
    pinStream.dataset.state = "ok";
    pinStream.textContent = "kilit kaldırıldı · numara okunuyor…";
    hidePinArea();
    // Zincirin son halkası: kilit kalktı → SIM artık abone verisini veriyor →
    // numarayı ŞİMDİ oku. Aynı modem için tekrar okuyacağız, bayrağı temizle.
    assessedHost = null;
    lastAssessment = null;
    lastAttemptAt = 0;
    refreshStatus();
    return;
  }
  pinStream.dataset.state = "error";
  // SADECE tr: ham problems[].message/check GELISTIRICI metni ve Ingilizce,
  // ekrana asla basilmaz (sozluk src/report.js'te, tek yer).
  const first = o?.problems?.[0]?.tr;
  // Deneme GERÇEKTEN harcandı mı? Yalnızca PIN_REJECTED bir hak yakar.
  // Biçim hatası, "son hak" reddi ya da port sorunu hak yakmaz — onlarda
  // tekrar denemeyi kapatmak operatörü boşuna kilitler.
  const yandi = (o?.problems || []).some((p) => p.code === "PIN_REJECTED");
  pinStream.textContent = o?.opened
    ? "SIM açıldı, kilit kalıcı kalkmadı."
    : (first?.baslik || "PIN kilidi kaldırılamadı")
      + (first?.neYap ? `\n${first.neYap}` : "");
  // Dugme ACIK kalir; PIN alani temizlendigi icin zaten yeni PIN bekliyor.
  pinDisableBtn.disabled = true;
  pinInput.focus();
  paintDigits();
}

pinDisableBtn.addEventListener("click", disablePinLock);

function watchStatus(ac) {
  clearInterval(statusTimer);
  if (!ac) { clearTimeout(retryTimer); retryTimer = null; }
  if (ac) { refreshStatus(); statusTimer = setInterval(refreshStatus, 3000); }
}
watchStatus(true);

// ---------------- EKRAN 2: kurulum ----------------

const lines = new Map();   // nvram anahtarı -> { sol, sag, halKutu }

function buildGrid(rows) {
  grid.textContent = "";
  lines.clear();
  let lastPage = null;

  for (const s of rows) {
    if (s.page && s.page !== lastPage) {
      lastPage = s.page;
      const group = document.createElement("div");
      group.className = "group";
      const a = document.createElement("span");
      a.textContent = s.page;
      const b = document.createElement("span");
      b.textContent = s.page;
      group.append(a, b);
      grid.appendChild(group);
    }

    const sol = makeCell(s.name, s.before, false, s.willChange);
    const sag = makeCell(s.name, s.after, true, s.willChange);
    sag.dataset.state = s.willChange ? "pending" : "unchanged";
    const stateCell = document.createElement("span");
    stateCell.className = "r-state";
    stateCell.textContent = s.willChange ? "bekliyor" : "değişmedi";
    sag.appendChild(stateCell);

    grid.append(sol, sag);
    lines.set(s.key, { sol, sag, stateCell });
  }
}

function makeCell(name, value, sagMi, willChange) {
  const h = document.createElement("div");
  h.className = "cell" + (sagMi ? " cell-after" : "") + (willChange ? "" : " sabit");
  const a = document.createElement("span");
  a.className = "r-name";
  a.textContent = name;
  const d = document.createElement("span");
  d.className = "r-value";
  d.textContent = value;
  h.append(a, d);
  return h;
}

function setRowState(keys, state, label) {
  for (const k of keys || []) {
    const s = lines.get(k);
    if (!s || s.sag.dataset.state === "unchanged") continue;
    s.sag.dataset.state = state;
    s.stateCell.textContent = label;
  }
}

const streamLines = [];
function appendStream(message) {
  streamLines.push(message);
  const last = streamLines.slice(-4);
  stream.textContent = "";
  last.forEach((m, i) => {
    const p = document.createElement("span");
    p.textContent = m;
    if (i < last.length - 1) p.className = "stream-past";
    stream.append(p, document.createElement("br"));
  });
}

function renderIdentity(target, k) {
  const fields = [
    ["Telefon", k.phone], ["ICCID", k.iccid], ["IMEI", k.imei],
    ["IMSI", k.imsi], ["MAC", k.lanMac], ["Operatör", k.operator],
  ].filter(([, v]) => v);
  const dl = document.createElement("dl");
  dl.className = "identity-list";
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

let streamSource = null;
let streamKind = null;   // "run" | "reset" — bitişte ne yapılacağını belirler
let simLock = null;   // cihazın bildirdiği PIN/PUK kilidi (varsa)

// --- Süre ölçümü (TEST) ---
// "Başlat"a bastığımdan bitişe kadar kaç saniye? Ölçüm noktası olayın EKRANA
// GELDİĞİ an — yani teknisyenin gerçekten beklediği süre. Tamamen tarayıcıda:
// sunucuya ve çekirdeğe hiç dokunmuyor.
const METRIC_LABELS = {
  algilandi: "modem algılandı",
  plan: "ayarlar okundu (plan hazır)",
  writing: "yazma başladı",
  written: "yazma bitti",
  reboot: "reboot gönderildi",
  verified: "cihaz geri geldi, doğrulandı",
  credentials: "kimlik okundu (ICCID/IMEI)",
  // İnternet doğrulaması AYRI adım: "ayarlar doğru mu" ile "SIM çalışıyor mu"
  // iki farklı soru; metrikte de ayrı görünmeleri lazım.
  internet: "internet doğrulandı (SIM çalışıyor)",
};
let baslangicMs = 0;
let tickTimer = null;
const metricMarks = [];
// Ana ekranın hazır olduğu an. "Başlat"a basılana kadar geçen süre =
// operatörün numarayı girme süresi = insanın MEŞGUL olduğu tek an. Metrik
// iddiası için araç süresinden ayrı tutulması şart.
let entryReadyMs = performance.now();

const elapsedSec = () => (performance.now() - baslangicMs) / 1000;
const sec = (x) => x.toFixed(1);

let entrySec = null;

function metricStart() {
  entrySec = Number(((performance.now() - entryReadyMs) / 1000).toFixed(1));
  baslangicMs = performance.now();
  metricMarks.length = 0;
  metricSection.hidden = true;
  metricTable.textContent = "";
  footerTimer.textContent = "0.0 sn";
  clearInterval(tickTimer);
  tickTimer = setInterval(() => { footerTimer.textContent = `${sec(elapsedSec())} sn`; }, 250);
}

// Olay geldiğinde damgala. `ek` varsa etikete eklenir (örn. kaç ayar yazıldı).
function metricMark(kind, extra = "") {
  const label = METRIC_LABELS[kind];
  if (!label) return;
  metricMarks.push({ label: extra ? `${label} — ${extra}` : label, elapsedSec: elapsedSec() });
}

// Ölçüm tablosunu basar: her adımın kendi süresi + kümülatif + toplam.
// En uzun adım kırmızı — darboğaz tek bakışta görünsün.
function metricFinish() {
  clearInterval(tickTimer);
  tickTimer = null;
  const total = elapsedSec();
  footerTimer.textContent = `${sec(total)} sn`;

  const metricRows = metricMarks.map((o, i) => ({
    label: o.label,
    duration: o.elapsedSec - (i === 0 ? 0 : metricMarks[i - 1].elapsedSec),
    an: o.elapsedSec,
  }));
  const enUzun = Math.max(0, ...metricRows.map((s) => s.duration));

  metricTable.textContent = "";
  const cell = (text, sinif) => {
    const s = document.createElement("span");
    s.textContent = text;
    if (sinif) s.className = sinif;
    return s;
  };
  metricTable.append(
    cell("adım", "metric-title"), cell("süre", "metric-title"), cell("an", "metric-title"),
  );
  for (const s of metricRows) {
    const uzunMu = s.duration === enUzun && metricRows.length > 1 ? "metric-long" : "";
    metricTable.append(
      cell(s.label, uzunMu), cell(`${sec(s.duration)} sn`, uzunMu), cell(`${sec(s.an)} sn`),
    );
  }
  metricTable.append(
    cell("TOPLAM (başlat → bitiş)", "metric-total"),
    cell(`${sec(total)} sn`, "metric-total"),
    cell("", "metric-total"),
  );
  metricSection.hidden = false;
  return { total, metricRows };
}

// Ölçümü sunucuya yolla (data/olcumler.jsonl). Metrik iddiası için süreler
// ekranda kaybolmamalı. Başarısız gönderim akışı bozmaz — ölçüm, işin kendisi
// değil.
function metricPost(body) {
  fetch("/api/olcum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => { /* olcum kaydi kritik degil */ });
}

// Karşılaştırma ekranını KOMPLE boşaltır. Tek yerde toplandı: temizliği alan
// alan yapmak, bir alanı unutup önceki modemin bilgisini gösterme hatasının
// kaynağıydı. Yeni alan eklenirse SADECE buraya eklenir.
function clearPanels() {
  grid.textContent = "";
  lines.clear();
  streamLines.length = 0;
  stream.textContent = "";
  simLock = null;
  el("identityBefore").textContent = "";
  el("locationBefore").textContent = "—";
  el("locationAfter").textContent = "—";
  confirmBtn.hidden = true;
  footer.removeAttribute("data-state");
  footerStatus.textContent = "";
  pinRequest.hidden = true;
  metricSection.hidden = true;
  metricTable.textContent = "";
  footerTimer.textContent = "0.0 sn";
  clearInterval(tickTimer);
  tickTimer = null;
}

// Ana ekrana dön ve OTURUMU SIFIRLA: akış kapanır, paneller boşalır, numara
// silinir. duyuru varsa ana ekranda görünür kalır (bir önceki işin sonucu).
function backToEntry(noticeText = "") {
  if (streamSource) { streamSource.close(); streamSource = null; }
  streamKind = null;
  clearPanels();
  runScreen.hidden = true;
  entryScreen.hidden = false;
  resetArea.hidden = false;
  hiddenInput.value = "";
  pinInput.value = "";          // PIN modeme özel: sonraki modeme taşınmasın
  // Okuma durumu da modeme özel: bir sonraki modem KENDİ numarasını getirir.
  assessedHost = null;
  lastAssessment = null;
  lastAttemptAt = 0;
  clearNumber();            // kilidi açar, "SIM'den okundu" satırını gizler
  paintDigits();
  notice.textContent = noticeText;
  notice.hidden = !noticeText;
  entryReadyMs = performance.now();
  hiddenInput.focus();
  watchStatus(true);            // durum çubuğunu bekletmeden tazeler
}

// Kurulum ve sıfırlama AYNI ekranı kullanır — ikisi de "öncesi → sonrası"
// karşılaştırması. Fark: hangi uca bağlandığı, panel etiketleri ve bitişte
// ne olacağı (kurulum onay bekler, sıfırlama ana ekrana döner).
function startStream({ path, kind, phone = null, onceEtiket, sonraEtiket, calisirkenMetin }) {
  if (streamSource) { streamSource.close(); streamSource = null; }   // çift başlatmaya karşı
  watchStatus(false);
  closeConfirm();
  streamKind = kind;
  resetArea.hidden = true;      // iş sürerken sıfırlama teklif edilmez
  notice.hidden = true;           // önceki işin duyurusu yeni işle silinir
  clearPanels();
  el("labelBefore").textContent = onceEtiket;
  el("labelAfter").textContent = sonraEtiket;
  entryScreen.hidden = true;
  runScreen.hidden = false;
  footerStatus.textContent = calisirkenMetin;
  appendStream("başlatıldı");

  metricStart();
  streamSource = new EventSource(path);

  // Ölçüm: her damgalanan olay için ayrı dinleyici — mevcut işleyicilere
  // dokunmaz, biri eklenip çıkarılınca ölçüm bozulmaz.
  for (const kind of Object.keys(METRIC_LABELS)) {
    streamSource.addEventListener(kind, (e) => {
      const o = JSON.parse(e.data);
      metricMark(kind, o.keys ? `${o.keys.length} ayar` : "");
    });
  }

  streamSource.addEventListener("progress", (e) => appendStream(JSON.parse(e.data).message));

  streamSource.addEventListener("identityBefore", (e) => {
    renderIdentity(el("identityBefore"), { ...JSON.parse(e.data), phone });
  });

  streamSource.addEventListener("plan", (e) => {
    buildGrid(JSON.parse(e.data).lines);
  });

  streamSource.addEventListener("detected", (e) => {
    const o = JSON.parse(e.data);
    el("locationBefore").textContent = o.location || "modem yok";
    topStatus.dataset.state = o.action === "provisionFromFactory" ? "factory" : "field";
    topStatus.textContent = o.action.replace(/_/g, " ");
  });

  streamSource.addEventListener("writing", (e) => setRowState(JSON.parse(e.data).keys, "writing", "yazılıyor"));
  streamSource.addEventListener("yazildi", (e) => setRowState(JSON.parse(e.data).keys, "written", "yazıldı"));

  streamSource.addEventListener("writeFailed", (e) => {
    const a = JSON.parse(e.data).keys || [];
    setRowState(a, "error", "yazılamadı");
    appendStream(`yazılamadı: ${a.length} ayar`);
  });

  streamSource.addEventListener("reboot", () => appendStream("modem yeniden başlatılıyor"));

  // İnternet doğrulaması — operatör beklemiyor, araç bekliyor. Ekranda ne
  // olduğu net yazsın, donmuş gibi görünmesin.
  streamSource.addEventListener("internet_bekleniyor", (e) => {
    const o = JSON.parse(e.data);
    footerStatus.textContent = "SIM doğrulanıyor — internet bekleniyor "
      + `(${o.elapsedSec}/${o.maxSec} sn)`;
  });

  streamSource.addEventListener("internet", (e) => {
    const o = JSON.parse(e.data);
    appendStream(o.online
      ? `internet VAR: ${o.wanIp} (${o.durationSec} sn) — SIM çalışıyor`
      : `internet YOK (${o.durationSec} sn) — SIM durumu: ${o.simStatus || "?"}`);
  });

  // Kurulum akışında PIN otomatik denenirse (baştan girilmişse) haber ver.
  streamSource.addEventListener("pinAttempting", () => appendStream("SIM PIN yazılıyor (tek deneme)"));

  // Cihaz PIN/PUK kilidini kendisi söylüyor ("Need verification PIN code
  // (PIN: 3/3, PUK: 10/10)") — internet beklemeye gerek yok, anında bildir.
  streamSource.addEventListener("simLock", (e) => {
    const o = JSON.parse(e.data);
    simLock = o;
    appendStream(`SIM ${o.lock.toUpperCase()} KİLİTLİ — kalan hak: PIN ${o.pinRemaining ?? "?"}`
      + `, PUK ${o.pukRemaining ?? "?"}`);
  });

  // Provizyon adımının bitişi (nihai sonuç değil — o `sonuc`). Yalnız
  // başarısızlıkta bilgi taşır: doğrulama neden tamamlanmadı.
  streamSource.addEventListener("bitti", (e) => {
    const o = JSON.parse(e.data);
    if (!o.ok && o.verification?.reason) appendStream(o.verification.reason);
  });

  streamSource.addEventListener("verification", (e) => {
    const o = JSON.parse(e.data);
    appendStream(o.status === "waitingForDevice"
      ? `modem bekleniyor (${o.attempt})`
      : `oturmayan ayar: ${o.remaining.length}`);
  });

  streamSource.addEventListener("dogrulandi", (e) => {
    const o = JSON.parse(e.data);
    setRowState([...lines.keys()], "verified", "doğrulandı");
    appendStream(`doğrulandı (${o.waitSec} sn)`);
  });

  streamSource.addEventListener("kimlik", (e) => {
    const k = JSON.parse(e.data).kimlik_bilgi || {};
    if (k.iccid) renderIdentity(el("identityBefore"), { ...k, phone });
  });

  streamSource.addEventListener("result", (e) => {
    const o = JSON.parse(e.data);
    finish(o.ok, o);
  });

  streamSource.addEventListener("error", (e) => {
    const o = JSON.parse(e.data);
    finish(false, { status: o.message, fix: o.fix });
  });

  // Akış kapanırsa EventSource kendiliğinden YENİDEN BAĞLANIR — kurulumu
  // ikinci kez başlatmasın diye biz kapatıyoruz (bitir() kapatır).
  streamSource.onerror = () => {
    if (streamSource && streamSource.readyState === EventSource.CLOSED) return;
    appendStream("bağlantı koptu");
  };
}

startBtn.addEventListener("click", () => {
  const phone = hiddenInput.value;
  if (!isValid(phone)) return;
  const pin = pinInput.value.trim();
  startStream({
    path: `/api/hazirla?telefon=${encodeURIComponent(phone)}`
      + (pin ? `&pin=${encodeURIComponent(pin)}` : ""),
    kind: "run",
    phone,
    onceEtiket: "Kurulum öncesi",
    sonraEtiket: "Kurulum sonrası",
    calisirkenMetin: "Kurulum sürüyor…",
  });
});

// --- Fabrikaya döndür (sağ üst) ---
// Yıkıcı işlem: düğme tek başına hiçbir şey yapmaz, onay balonu şart.
function closeConfirm() {
  confirmPopover.hidden = true;
  resetBtn.disabled = false;
}

resetBtn.addEventListener("click", () => {
  confirmPopover.hidden = false;
  resetBtn.disabled = true;
  el("resetNo").focus();
});

el("resetNo").addEventListener("click", () => {
  closeConfirm();
  resetBtn.focus();
});

el("resetYes").addEventListener("click", () => {
  closeConfirm();
  startStream({
    path: "/api/fabrikaya-dondur",
    kind: "sifirlama",
    onceEtiket: "Şimdiki hali",
    sonraEtiket: "Fabrika hali",
    calisirkenMetin: "Fabrikaya döndürülüyor…",
  });
});

// Escape ile vazgeç; dışarı tıklayınca da kapan (kaza tıklaması iş yapmasın).
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !confirmPopover.hidden) { closeConfirm(); resetBtn.focus(); }
});
document.addEventListener("click", (e) => {
  if (!confirmPopover.hidden && !e.target.closest(".reset-area")) closeConfirm();
});

function finish(ok, o) {
  if (streamSource) { streamSource.close(); streamSource = null; }
  const { total, metricRows } = metricFinish();

  metricPost({
    kind: streamKind,
    status: o.status ?? null,
    ok: Boolean(ok),
    attempt: o.attempt ?? null,
    totalSec: Number(sec(total)),
    entrySec: entrySec,
    steps: metricRows.map((s) => ({ name: s.label, durationSec: Number(sec(s.duration)),
      an_sn: Number(sec(s.an)) })),
    changedSettings: [...lines.values()].filter((s) => s.sag.dataset.state !== "unchanged").length,
    unchangedSettings: [...lines.values()].filter((s) => s.sag.dataset.state === "unchanged").length,
    phone: o.record?.phone ?? null,
    iccid: o.record?.iccid ?? null,
    imei: o.record?.imei ?? null,
    lanMac: o.record?.lanMac ?? null,
    modemIp: o.record?.modemIp ?? null,
  });

  // Sıfırlama BAŞARILIYSA oturum burada biter: modem sıfırlandı, ekran da
  // sıfırdan başlamalı. Sonuç ekranında bekletip fazladan tıklama istemek
  // yanlıştı — sonuç ana ekranda duyuru olarak görünür.
  if (ok && streamKind === "sifirlama") {
    backToEntry(`Modem fabrikaya döndürüldü · ${o.record?.modemIp || "192.168.1.1"}`
      + ` · ${sec(total)} sn — sıradaki kurulum için hazır.`);
    return;
  }

  const record = o.record;
  if (record) {
    el("locationAfter").textContent = record.modemIp || "—";
    renderIdentity(el("identityBefore"), record);
  }
  footer.dataset.state = ok ? "ready" : "error";
  const net = o.record?.wanIp
    ? ` · internet ${o.record.wanIp}`
    : (o.status || "").includes("noInternet") ? " · ⚠ İNTERNET YOK (SIM/PIN kontrol et)" : "";
  footerStatus.textContent = ok
    ? `HAZIR — ${o.status}${o.attempt ? ` (deneme ${o.attempt})` : ""} · ${sec(total)} sn`
      + `${net} · deftere yazıldı`
    : `BAŞARISIZ — ${o.status || "bilinmeyen"}${o.fix ? ` · ${o.fix}` : ""}`;
  // Internet yoksa alt bar UYARI rengine gecsin: gozden kacmasin.
  if (ok && (o.status || "").includes("noInternet")) footer.dataset.state = "warning";
  if (!ok && o.problems?.length) {
    appendStream(o.problems.map((p) => (p.tr?.baslik ?? p.code)).join(" · "));
  }
  // SIM kilidi cihazdan geldiyse BİRİNCİL çözümü söyle: PIN'i telefondan kapat.
  // Proje kararı PIN saklamak değil, PIN'i ortadan kaldırmak.
  const code = (k) => (o.problems || []).some((p) => p.code === k);
  if (simLock?.lock === "puk") {
    footer.dataset.state = "error";
    footerStatus.textContent = `SIM PUK KİLİTLİ (kalan ${simLock.pukRemaining ?? "?"})`
      + " — telefonla PUK ile aç; PIN yazmak işe yaramaz";
  } else if (simLock?.lock === "pin") {
    footer.dataset.state = "warning";
    footerStatus.textContent = `SIM PIN KİLİTLİ (kalan ${simLock.pinRemaining ?? "?"} hak)`
      + " — SIM'i telefona takıp PIN'i KAPAT, sonra geri tak";
  }

  // PIN kilidi VE PIN denenmedi -> operatörü ana ekrana atmadan burada sor.
  // Kurtarma yolu: provizyon tekrarlanmaz, yalnızca PIN yazılır (ayrı iş).
  // Son hak korumasına takıldıysa da sor: kararı insan verecek.
  const pinGerekli = (code("PIN_REQUIRED") || code("SIM_PIN_LOCKED")
    || code("PIN_LAST_ATTEMPT")) && simLock?.lock !== "puk";
  pinRequest.hidden = !pinGerekli;
  if (pinGerekli) {
    pinRequestInput.value = "";
    pinTryBtn.disabled = true;
    pinRequestInput.focus();
  }

  confirmBtn.hidden = false;
  confirmBtn.textContent = ok ? "Onayla ve sıradaki modem" : "Baştan dene";
  if (!pinGerekli) confirmBtn.focus();
}

// Yerinde PIN denemesi — SADECE PIN yazılır, provizyon tekrarlanmaz.
pinTryBtn.addEventListener("click", () => {
  const p = pinRequestInput.value.trim();
  if (!/^\d{4,8}$/.test(p)) return;
  pinTryBtn.disabled = true;
  footer.removeAttribute("data-state");
  footerStatus.textContent = "SIM PIN deneniyor…";
  appendStream("PIN deneniyor");
  if (streamSource) { streamSource.close(); streamSource = null; }
  streamSource = new EventSource(`/api/pin?pin=${encodeURIComponent(p)}`);
  for (const kind of ["progress", "internet_bekleniyor", "internet", "reboot",
    "pinAttempting", "pinResult", "error"]) {
    streamSource.addEventListener(kind, (e) => onPinEvent(kind, JSON.parse(e.data)));
  }
});

function onPinEvent(kind, o) {
  if (kind === "progress") return appendStream(o.message);
  if (kind === "reboot") return appendStream("modem yeniden başlatılıyor");
  if (kind === "pinAttempting") return appendStream("SIM PIN yazılıyor");
  if (kind === "internet_bekleniyor") {
    footerStatus.textContent = `PIN sonrası internet bekleniyor (${o.elapsedSec}/${o.maxSec} sn)`;
    return undefined;
  }
  if (kind === "internet") {
    return appendStream(o.online ? `internet VAR: ${o.wanIp} (${o.durationSec} sn)`
      : `internet YOK (${o.durationSec} sn)`);
  }
  if (kind === "error") {
    if (streamSource) { streamSource.close(); streamSource = null; }
    footer.dataset.state = "error";
    footerStatus.textContent = `PIN denenemedi — ${o.message}`;
    pinTryBtn.disabled = false;
    return undefined;
  }
  // pin_sonuc
  if (streamSource) { streamSource.close(); streamSource = null; }
  if (!o.attempted) {
    appendStream(`PIN denenmedi (${o.skipped})`);
    const t = o.problems?.[0]?.tr;
    footerStatus.textContent = `PIN DENENMEDİ — ${t ? `${t.baslik}. ${t.neYap}` : o.skipped}`;
    pinTryBtn.disabled = false;
    return undefined;
  }
  pinRequest.hidden = true;
  footer.dataset.state = o.internet?.online ? "ready" : "warning";
  footerStatus.textContent = o.internet?.online
    ? `PIN KABUL EDİLDİ — internet ${o.internet.wanIp} (${o.internet.durationSec} sn)`
    : `PIN yazıldı ama internet gelmedi (${o.internet?.durationSec} sn) — kapsama/data paketi?`;
  confirmBtn.hidden = false;
  confirmBtn.focus();
  return undefined;
}

confirmBtn.addEventListener("click", () => backToEntry());
