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

    // Modem/WAN Main Link (2026-08-26 diff ile doğrulandı)
    w1_wan_proto: "m13g",     // Connection Type M1-PPP (default m13gdhcp=M1-DHCP)
    m1simswtch: "0",          // SIM Backup Disable (default 1=Enable)
    mullinkfail: "0",         // Link Fail to Restart 0 dk (default 30)
    m1s1wanapn: "internet",   // APN SIM1 (diff ile doğrulandı)
    m1s1pppuser: "",          // SIM1 User Name temizle (default "card")
    m1s1ppppwd: "",           // SIM1 Password temizle
    m1s2pppuser: "",          // SIM2 User Name temizle
    m1s2ppppwd: "",           // SIM2 Password temizle

    // Modem/WAN Others (diff ile doğrulandı)
    w1_connfailsw: "0",       // Connect Fail 0 (default 10)
    w1_kponm: "1",            // Keep Alive None (default 7=ICMP+; None yapinca 1)

    // Authentication 4'lü. NOT: bu ünitede nvram'da zaten hepsi "1"; diff'le
    // DEĞİL, isim+değer+foto ile teyitli. Gelecekteki ünitelerde de garanti
    // olsun diye profile konuldu (idempotent — zaten 1 ise dokunmaz).
    m1_pap_allowed: "1",
    m1_chap_allowed: "1",
    m1_chapms_allowed: "1",
    m1_chapms_v2_allowed: "1",

    // Modem/WAN Backup Link (diff ile doğrulandı)
    w2_wan_proto: "disabled", // Backup Link Disabled (default dhcp)

    // LAN (Faz1 canlı + ekran kıyası + nvram ile doğrulandı)
    lan_ipaddr: "5.5.5.1",
    lan_ipaddr_ex1: "0.0.0.0", // fabrika ikincil IP'sini sil (nvram: 192.168.8.1)
  },

  // Henüz profile EKLENMEMİŞ, apply anında doğrulanacak:
  bekleyen: [
    "lan_cclass (LAN IP ile birlikte) — LAN IP degistiginde UI bunu da '5.5.5.' "
    + "yaziyor olabilir; gercek apply aninda (reboot sonrasi) dogrulanacak.",
  ],
};

// FABRIKA profili — cihazi default duruma dondurur. Degerler saha diff'lerinden
// olculdu (her degisen anahtarin DEFAULT hali). Temiz uctan-uca testte once
// bununla default'a donulur, sonra SAHA_PROFILI ileri uygulanir.
export const FABRIKA_PROFILI = {
  ad: "fabrika",
  aciklama: "Ricon S9922M44 fabrika/default degerleri (saha diff'lerinden olculdu)",
  nvram: {
    // Modem/WAN Main Link defaults
    w1_wan_proto: "m13gdhcp",  // Connection Type M1-DHCP
    m1simswtch: "1",           // SIM Backup Enable
    mullinkfail: "30",         // Link Fail to Restart 30
    m1s1pppuser: "card", m1s1ppppwd: "card",  // SIM1 default user/pass
    m1s2pppuser: "card", m1s2ppppwd: "card",  // SIM2 default user/pass
    m1s1wanapn: "internet",    // APN (default zaten internet)
    // Others defaults
    w1_connfailsw: "10",       // Connect Fail 10
    w1_kponm: "7",             // Keep Alive ICMP+
    // Backup Link default
    w2_wan_proto: "dhcp",      // Automatic Configuration - DHCP
    // LAN defaults
    lan_ipaddr: "192.168.1.1",
    lan_ipaddr_ex1: "192.168.8.1",
    // WLAN default (zaten kapali)
    wl0_net_mode: "disabled", wl_net_mode: "disabled",
  },
};

// Ad -> profil. CLI `--profil <ad>` ile secilir.
export const PROFILLER = { saha: SAHA_PROFILI, fabrika: FABRIKA_PROFILI };
