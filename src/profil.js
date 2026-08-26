// Hazırlama profili — "istenen durum" (desired state). Veri, kod değil.
//
// Provizyon motoru bunu okur: cihazın nvram'ını bununla karşılaştırır,
// SADECE farklı olan anahtarları yazar (idempotent). Buraya YALNIZCA diff ya
// da canlı ölçümle DOĞRULANMIŞ anahtarlar konur — tahmin konmaz.
//
// Kaynak: docs/hazirlama-profili.md (sahadaki teyitli kontrol listesi).
// Durum: EKSIK — Modem/WAN sayfasının nvram anahtarları toplu diff ile
// eklenecek (Connection Type, SIM Backup, Auth, Connect Fail, Keep Alive,
// Backup Link, Link Fail, SIM user/pass). Aşağıdakiler DOĞRULANMIŞ olanlar.

// LAN IP'yi etkileyen anahtarlar — bunlar yazılınca yönetim bağlantısı yeni
// adrese taşınır; motor bunları EN SONA alır ve reboot/yeni-adres akışıyla
// ele alır.
export const LAN_IP_ANAHTARLARI = ["lan_ipaddr", "lan_ipaddr1"];

export const SAHA_PROFILI = {
  ad: "saha",
  aciklama: "ACO RVM saha profili — Ricon S9922M44",

  // nvram anahtar -> hedef değer (hepsi string; nvram string tutar).
  nvram: {
    // WLAN kapalı (diff ile doğrulandı)
    wl0_net_mode: "disabled",
    wl_net_mode: "disabled",

    // APN (diff ile doğrulandı) — aktif hat m1, SIM1
    m1s1wanapn: "internet",

    // LAN (Faz1 canlı + ekran kıyası + nvram ile doğrulandı)
    lan_ipaddr: "5.5.5.1",
    lan_ipaddr_ex1: "0.0.0.0", // fabrika ikincil IP'sini sil (nvram: 192.168.8.1)
    // NOT: lan_cclass ("192.168.1.") LAN IP degisince "5.5.5." olmali mi?
    // LAN sayfasi diff'inde teyit edilecek (UI otomatik yaziyor olabilir).

    // --- AŞAĞISI Modem/WAN toplu diff'i sonrası DOLDURULACAK ---
    // Connection Type M1-PPP, SIM Backup Disable, Link Fail 0,
    // Authentication 4'lü, Connect Fail 0, Keep Alive None,
    // Backup Link Disabled, SIM1/2 user+pass temizle.
  },

  // Profildeki hangi anahtarların henüz eksik olduğunu takip için (bilgi).
  eksik_haritalanacak: [
    "Connection Type (M1-PPP)", "SIM Backup Disable", "Link Fail to Restart 0",
    "Authentication (4'lü)", "Connect Fail 0", "Keep Alive None",
    "Backup Link Disabled", "SIM1/2 user+pass temizle",
  ],
};
