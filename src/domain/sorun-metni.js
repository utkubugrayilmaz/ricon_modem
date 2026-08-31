// Sorun metinleri — kod -> OPERATORE gosterilecek TURKCE.
//
// problems[].message / .check gelistirici metnidir ve INGILIZCE. Ekrana onlar
// BASILMAZ; teknisyene PowerShell komutu yazmak yardim degil gurultu.
//
// Neden report.js'ten ayri: report.js'in isi CIKTI YAZMAK (JSON, insan-okunur
// ozet, sir temizleme). Bu dosyanin isi SOZLUK. Ikisi bir arada dururken
// report.js'in "ne yapan dosya" cevabi iki cumleye cikiyordu.

// Sozlesme problems.js'in basinda yazili: "Turkce isteyen taraf sabit `kod`
// uzerinden anahtarlar." Iste o sozluk burasi — TEK yer.
//
// Bicim: { baslik, neYap }
//   baslik : NE oldu — tek satir, teknik terim yok
//   neYap  : SIRADA NE YAPACAK — elle yapilabilir tek bir eylem
const SORUN_TR = {
  // --- Ag / erisim ---
  NO_SOURCE_IP: { baslik: "Modeme giden ağ yok",
    neYap: "LAN kablosunu tak, modemi aç. Kablo takılıysa ikincil IP tanımlı değil." },
  DEVICE_UNREACHABLE: { baslik: "Modem cevap vermiyor",
    neYap: "Kablo LAN portunda mı, modem açık mı?" },
  DEVICE_BUSY: { baslik: "Modem meşgul",
    neYap: "Süren okuma bitene kadar bekle." },
  REQUEST_FAILED: { baslik: "Bağlantı yarıda kaldı",
    neYap: "Araç tekrar deniyor. Sürerse kabloyu kontrol et." },
  // --- Kimlik ---
  AUTH_REQUIRED: { baslik: "Modem parolası gerekiyor", neYap: "Bilgi işleme haber ver." },
  AUTH_REJECTED: { baslik: "Modem parolası kabul edilmedi", neYap: "Bilgi işleme haber ver." },
  CONSOLE_KIMLIK_YOK: { baslik: "Modem parolası tanımlı değil", neYap: "Bilgi işleme haber ver." },
  HTTP_ERROR: { baslik: "Modem beklenmeyen cevap verdi", neYap: "Kapat-aç ve tekrar dene." },
  EMPTY_BODY: { baslik: "Modem boş cevap verdi", neYap: "Bilgi amaçlı, akışı durdurmaz." },
  KILIT_DURUMU_OKUNAMADI: { baslik: "SIM kilidi okunamadı",
    neYap: "PIN gönderilmedi. Tekrar dene; sürerse modemi kapat-aç." },
  PROFIL_YOK: { baslik: "Profil tanımlı değil", neYap: "Bilgi işleme haber ver." },
  NVRAM_BAD_HEADER: { baslik: "Yedek dosyası tanınmadı", neYap: "Bilgi işleme haber ver." },
  WRITE_BLOCKED_READONLY: { baslik: "Yazma izni yok", neYap: "Modemde hiçbir şey değişmedi." },
  // --- SIM ---
  SIM_MISSING: { baslik: "SIM takılı değil", neYap: "Modemi kapat, SIM'i tak, aç." },
  SIM_PIN_LOCKED: { baslik: "SIM PIN kilitli", neYap: "PIN'i yaz ve kilidi kaldır." },
  SIM_PUK_LOCKED: { baslik: "SIM PUK kilitli", neYap: "Telefondan PUK ile aç." },
  INTERNET_YOK: { baslik: "İnternet gelmedi", neYap: "Hattın açık ve kotalı olduğunu kontrol et." },
  AT_PORT_YOK: { baslik: "SIM birimine ulaşılamadı", neYap: "Kapat-aç ve tekrar dene." },
  // --- Telefon numarasi ---
  MSISDN_REQUIRED: { baslik: "Telefon numarası gerekiyor", neYap: "11 hane olarak elle gir." },
  MSISDN_INVALID: { baslik: "Numara geçersiz", neYap: "11 hane, 05 ile başlamalı." },
  MSISDN_CIHAZDA_YOK: { baslik: "Numara SIM'de yok", neYap: "Elle gir." },
  MSISDN_UYUSMAZLIK: { baslik: "Girilen numara SIM'dekinden farklı",
    neYap: "SIM'in numarası daha güvenilir. Hattı kontrol et." },
  // --- PIN kararlari ---
  PIN_INVALID: { baslik: "PIN biçimi hatalı", neYap: "4-8 hane, sadece rakam." },
  PIN_REQUIRED: { baslik: "SIM PIN istiyor", neYap: "PIN'i gir." },
  PIN_REJECTED: { baslik: "PIN kabul edilmedi",
    neYap: "Bir hak yandı, tekrar denenmeyecek. PIN'i doğrula." },
  PIN_LAST_ATTEMPT: { baslik: "Son hak — denenmedi",
    neYap: "Yanlış PIN SIM'i PUK'a kilitler. Telefonda aç." },
  PIN_HAK_YANMIS: { baslik: "Daha önce bir hak yanmış",
    neYap: "PIN'den emin olmadan deneme. Operatör kaydından doğrula." },
  PIN_KALAN_BILINMIYOR: { baslik: "Kalan hak okunamadı", neYap: "PIN'den emin ol." },
  PIN_STORED_WRONG: { baslik: "Saklı PIN bu SIM'e uymuyor",
    neYap: "Saklı PIN temizlendi. Doğru PIN'i gir." },
  PIN_STALE_CLEARED: { baslik: "Eski PIN silindi", neYap: "Bilgi amaçlı." },
  PIN_LOCK_NOT_ENABLED: { baslik: "PIN kilidi açılamadı", neYap: "Tekrar dene ya da telefondan aç." },
  PIN_LOCK_NOT_DISABLED: { baslik: "Kilit kalıcı kaldırılamadı",
    neYap: "SIM açık, kurulum devam edebilir." },
};

// Bir sorunun OPERATORE gosterilecek Turkce halini verir.
//
// Bilinmeyen kod PATLAMAZ ve ham Ingilizce metni SIZDIRMAZ: kodu gosterip
// ne yapilacagini soyler. Yeni bir kod ceviri almadan eklenirse test yakalar
// (bkz. tests/sorun-metni.test.js) — ama uretimde ekran yine anlamli kalir.
export function sorunTr(kod) {
  const t = SORUN_TR[kod];
  if (t) return { kod, ...t };
  return { kod,
    baslik: "Beklenmeyen bir sorun oluştu",
    neYap: `Bilgi işleme şu kodu bildir: ${kod ?? "bilinmiyor"}` };
}

// problems[] dizisine Turkce karsiligini EKLER (message/check korunur — onlar
// gelistirici/günlük tarafi). Tuketiciye giden tek yer burasi olsun diye var:
// sunucu bunu cagirir, arayuz `tr` alanini basar, ham metne hic dokunmaz.
export function problemleriTurkcelestir(problems = []) {
  return problems.map((p) => ({ ...p, tr: sorunTr(p.kod) }));
}

export { SORUN_TR };
