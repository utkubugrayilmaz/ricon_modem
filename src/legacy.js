// ESKI DEFTER SATIRLARINI BUGUNKU SEMAYA CEVIREN TEK OKUMA SINIRI.
//
// NEDEN AYRI BIR DOSYA — olculmus gerekce:
// data/ dosyalari tek sema tasimiyor, DORT tasiyor. 2026-08-31 sayimi:
//   olcumler.jsonl (23 satir): 20 Turkce anahtar+deger · 1 Turkce beyan
//                              · 1 Ingilizce+lanMac · 1 Ingilizce+lan_mac
//   hazirlanan.jsonl (38 satir): 37 Turkce (4 farkli alan kumesi) · 1 Ingilizce
// Bu cevirme isi eskiden report.js icine dagilmis alan() ciftleriyle
// yapiliyordu ve her yeni kusak onu biraz daha karmasiklastiriyordu. Ucuncu
// kusak (Ingilizce DEGERLER) gelince tek sinir sart oldu.
//
// KURAL: tanimadigin satiri ASLA DUSURME. Sayim kaybi sessizdir ve tam bu
// bir kez yasandi — 22 satirdan 1'i filtreye takilmadigi icin hic sayilmadi.
// Tanimadigin degeri oldugu gibi gecir; en fazla "unknown" de, ama sil.

// --- Alan adlari: eski -> yeni ---------------------------------------------

// Olcum satiri (data/metrics.jsonl)
export const LEGACY_METRIC_KEYS = Object.freeze({
  zaman: "timestamp",
  tur: "kind",
  durum: "status",
  deneme: "attempt",
  toplam_sn: "totalSec",
  giris_sn: "entrySec",
  adimlar: "steps",
  beyan: "declared",
  telefon: "phone",
  modem_ip: "modemIp",
  degisen_ayar: "changedSettings",
  ayni_ayar: "unchangedSettings",
  kim: "who",
  not: "note",
  // Ingilizce donemin IKI satiri kendi arasinda tutarsizdi: biri lanMac,
  // digeri lan_mac. Kanonik olan lan_mac — cihazin kendi nvram anahtari.
  lanMac: "lan_mac",
});

// Defter satiri (data/provisioned.jsonl)
export const LEGACY_LEDGER_KEYS = Object.freeze({
  zaman: "timestamp",
  durum: "status",
  deneme: "attempt",
  profil: "profile",
  modem_ip: "modemIp",
  telefon: "phone",
  internet_sure_sn: "internetSec",
  sim_durumu: "simStatus",
  pin_denendi: "pinAttempted",
  sahaya_hazir: "fieldReady",
  lanMac: "lan_mac",
});

// Adim nesnesi
export const LEGACY_STEP_KEYS = Object.freeze({
  ad: "step",
  sure_sn: "durationSec",
  an_sn: "atSec",
  name: "step",
});

// --- Degerler: eski -> yeni ------------------------------------------------

export const LEGACY_KIND = Object.freeze({
  kurulum: "run",
  elle: "manual",
  sifirlama: "reset",
});

export const LEGACY_PROFILE = Object.freeze({
  saha: "field",
  fabrika: "factory",
});

export const LEGACY_STATUS = Object.freeze({
  hazir: "ready",
  zaten_hazir: "already_ready",
  zaten_hazir_sim_kilitli: "already_ready_sim_locked",
  zaten_hazir_internet_yok: "already_ready_no_internet",
  hazir_sim_kilitli: "ready_sim_locked",
  hazir_internet_yok: "ready_no_internet",
  fabrikaya_dondu: "factory_restored",
  elle_kurulum: "manual_run",
  kimlik_yok: "no_identity",
  telefon_yok: "no_phone",
  sim_yok: "no_sim",
  modem_yok: "no_modem",
  pc_hazir_degil: "pc_not_ready",
  basarisiz: "failed",
});

// Adim ETIKETI -> yapilandirilmis adim.
//
// NEDEN YAPILANDIRMA: eski etiket ayar sayisini ICINE gomuyordu
// ("yazma basladi — 12 ayar"). stepSummary kovayi etikete gore actigi icin
// TEK mantiksal adim ALTI ayri kovaya bolunuyordu ve medyan karsilastirmasi
// anlamini yitiriyordu. Olculdu (23 satir): 16 kova, 10'u ayni yazma adimi.
// Sayi artik `count` alaninda; kova `step`e gore aciliyor.
//
// Yazma BASLADI ile BITTI ayri adim olarak kaliyor: "basladi" suresi hep ~0
// (hemen sonra geliyor), "bitti" gercek yazma suresini tasiyor. Ikisini
// birlestirmek medyani sifirlarla seyreltir — yanlis duzeltme olurdu.
const STEP_LABELS = Object.freeze({
  "modem algılandı": "detected",
  "ayarlar okundu (plan hazır)": "plan",
  "reboot gönderildi": "reboot",
  "cihaz geri geldi, doğrulandı": "verified",
  "kimlik okundu (ICCID/IMEI)": "identity",
  "internet doğrulandı (SIM çalışıyor)": "internet",
});
const WRITE_LABEL = /^yazma (başladı|bitti) — (\d+) ayar$/u;

// Doner: { step, count } — tanimadigi etiketi OLDUGU GIBI step yapar.
// "unknown" tek kovasina yigmak, bugun ayri duran kovalari birlestirir:
// bu da bir veri kaybi olurdu. Bilmemek, karistirmaktan iyidir.
export function parseStepLabel(label) {
  if (typeof label !== "string") return { step: null, count: null };
  const known = STEP_LABELS[label];
  if (known) return { step: known, count: null };
  const w = label.match(WRITE_LABEL);
  if (w) return { step: w[1] === "başladı" ? "write_start" : "write_done", count: Number(w[2]) };
  return { step: label, count: null };
}

// --- Normalizasyon ---------------------------------------------------------

function renameKeys(row, table) {
  const out = {};
  for (const [k, v] of Object.entries(row ?? {})) {
    const key = table[k] ?? k;
    // Yeni ad zaten doluysa eski adi EZDIRME: yeni sema kazanir.
    if (out[key] === undefined || out[key] === null) out[key] = v;
  }
  return out;
}

// Olcum satirini kanonik sekle indirir. Cevrilemeyen deger oldugu gibi gecer.
export function normalizeMetricRow(row) {
  const r = renameKeys(row, LEGACY_METRIC_KEYS);
  if (typeof r.kind === "string") r.kind = LEGACY_KIND[r.kind] ?? r.kind;
  if (typeof r.status === "string") r.status = normalizeStatus(r.status);
  if (Array.isArray(r.steps)) r.steps = r.steps.map(normalizeStep);
  return r;
}

export function normalizeStep(step) {
  const s = renameKeys(step, LEGACY_STEP_KEYS);
  // `step` bu noktada ya yeni semanin kendi degeri ya da eski ETIKET.
  const parsed = parseStepLabel(s.step);
  if (parsed.step != null) s.step = parsed.step;
  if (s.count == null && parsed.count != null) s.count = parsed.count;
  return s;
}

// Defter satirini kanonik sekle indirir.
export function normalizeLedgerRow(row) {
  const r = renameKeys(row, LEGACY_LEDGER_KEYS);
  if (typeof r.profile === "string") r.profile = LEGACY_PROFILE[r.profile] ?? r.profile;
  if (typeof r.status === "string") r.status = normalizeStatus(r.status);
  return r;
}

// Durum alani her zaman bir enum DEGILDI: defterde iki satirda alanin icine
// bir HATA CUMLESI yazilmis ("Telefon numarasi gerekiyor"), bir satirda da
// tanimsiz bir degerden uretilmis "sifirlama_undefined" duruyor. Bunlar enum
// degil; "unknown" sayilir ama satir DUSURULMEZ.
export function normalizeStatus(value) {
  if (typeof value !== "string") return value;
  const known = LEGACY_STATUS[value];
  if (known) return known;
  // Bosluk iceren ya da "undefined" tasiyan bir durum: enum degil, arizadir.
  if (/\s/.test(value) || value.includes("undefined")) return "unknown";
  return value;
}
