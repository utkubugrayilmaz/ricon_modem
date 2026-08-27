// Hazırlama profili — "istenen durum" (desired state). Veri, kod değil.
//
// Provizyon motoru bunu okur: cihazın nvram'ını bununla karşılaştırır,
// SADECE farklı olan anahtarları yazar (idempotent). Buraya YALNIZCA diff ya
// da canlı ölçümle DOĞRULANMIŞ anahtarlar konur — tahmin konmaz.
//
// Kaynak: docs/hazirlama-profili.md (sahadaki teyitli kontrol listesi).
// Durum: TAMAM — sahadaki 11 ayarın tümü + LAN nvram anahtarlarıyla eşlendi
// (2026-08-26 diff) ve uçtan uca canlı doğrulandı.

// YÖNETİM adresini taşıyan anahtarlar — bunlar yazılınca mevcut bağlantı
// kopar; motor bunları EN SONA alır ve reboot/yeni-adres akışıyla ele alır.
// `lan_ipaddr_ex1` (ikincil LAN IP) BİLEREK burada DEĞİL: bağlandığımız adres
// o değil, silinmesi bağlantıyı koparmaz — normal grupta yazılır (uçtan uca
// testte de böyle doğrulandı).
export const LAN_IP_KEYS = ["lan_ipaddr"];

// YAZMA SIRASI — teknisyenin arayuzde izledigi sira: Modem/WAN -> DHCP -> LAN.
//
// DURUST NOT: nvram'a yazma teknik olarak SIRASIZ'dir; hicbir deger `nvram
// commit` + reboot'a kadar yururluge girmez. Yani bu sira SONUCU DEGISTIRMEZ.
// Yine de bu sirayla yaziyoruz, iki gercek sebep var:
//   1) Yazma yarida kalirsa (baglanti dustu, konsol koptu) yonetim adresi EN
//      SON degistigi icin cihaz hala eski adreste bulunabilir — kurtarilabilir.
//   2) Plan/ilerleme ekrani teknisyenin kafasindaki sirayla akar.
// Listede olmayan anahtar "Diger" grubuna duser ve LAN'dan ONCE yazilir.
export const WRITE_GROUPS = [
  {
    ad: "Modem/WAN",
    anahtarlar: [
      "w1_wan_proto", "m1simswtch", "mullinkfail",
      "m1s1wanapn", "m1s1pppuser", "m1s1ppppwd", "m1s2pppuser", "m1s2ppppwd",
      "w1_connfailsw", "w1_kponm",
      "m1_pap_allowed", "m1_chap_allowed", "m1_chapms_allowed", "m1_chapms_v2_allowed",
      "w2_wan_proto",
      "wl0_net_mode", "wl_net_mode",
    ],
  },
  {
    ad: "DHCP",
    // lan_proto: dhcp = DHCP sunucusu acik, static = kapali (diff ile teyitli).
    anahtarlar: ["lan_proto"],
  },
  {
    ad: "LAN",
    anahtarlar: [
      "lan_ipaddr_ex1", "lan_netmask_ex1",
      "lan_ipaddr_ex2", "lan_netmask_ex2",
      "lan_ipaddr_ex3", "lan_netmask_ex3",
      "lan_ipaddr",     // yonetim adresi — grubun ve tum yazmanin EN SONU
    ],
  },
];

export const FIELD_PROFILE = {
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

    // DHCP sunucusu KAPALI (2026-08-27 diff ile doğrulandı: arayüzde
    // "DHCP Server: Disabled" + Save -> lan_proto dhcp'den static'e döndü;
    // başka HİÇBİR anahtar değişmedi).
    lan_proto: "static",

    // LAN (Faz1 canlı + ekran kıyası + nvram ile doğrulandı)
    lan_ipaddr: "5.5.5.1",
    // İkincil LAN adreslerinin TAMAMI sıfırlanır (2026-08-27 teknisyen isteği).
    // Arayüzdeki "Local IP Address1/2/3" ve "Subnet Mask1/2/3" alanları bunlar;
    // nvram adları arayüz etiketleriyle birebir. 2 ve 3 fabrikada zaten 0.0.0.0
    // — idempotent güvence olarak yazılır (dokunmaz, sadece garanti eder).
    // DOKUNULMAYANLAR: lan_ipaddr (5.5.5.1), lan_netmask (255.255.255.0),
    // Local DNS ve Loopback — bunlar profile HİÇ girmiyor.
    lan_ipaddr_ex1: "0.0.0.0",   // fabrikada 192.168.8.1
    lan_netmask_ex1: "0.0.0.0",  // fabrikada 255.255.255.0
    lan_ipaddr_ex2: "0.0.0.0",
    lan_netmask_ex2: "0.0.0.0",
    lan_ipaddr_ex3: "0.0.0.0",
    lan_netmask_ex3: "0.0.0.0",
  },

  // BİLEREK profile KONULMAYAN anahtar: `lan_cclass`. Uçtan uca testte (2026-
  // 08-26) cihazın LAN IP değişince reboot'ta bunu KENDİ türettiği görüldü
  // (192.168.1. -> 5.5.5.). Yazmaya gerek yok; yazmak gereksiz risk.
};

// FABRIKA profili — DIKKAT: bu GERCEK bir factory reset DEGILDIR. Yalnizca
// FIELD_PROFILE'in dokundugu anahtarlari DEFAULT degerlerine geri alir (saha
// diff'lerinden olculdu). Kapsam DISI degistirilen bir ayari geri getirmez.
// Amaci: uctan-uca testte cihazi "bizim yonettigimiz" ayarlar acisindan sifir
// haline dondurmek. GERCEK/tam factory reset icin: fiziksel reset dugmesi, ya
// da bir kez pristine /nvrambak.bin yedegi alip `nvram restore` etmek
// (golden-backup yaklasimi — ileride, pristine yedek gerektirir).
export const FACTORY_PROFILE = {
  ad: "fabrika",
  aciklama: "FIELD_PROFILE anahtarlarinin default degerleri (GERCEK factory reset DEGIL)",
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
    // DHCP sunucusu default: acik
    lan_proto: "dhcp",
    // LAN defaults
    lan_ipaddr: "192.168.1.1",
    lan_ipaddr_ex1: "192.168.8.1",
    lan_netmask_ex1: "255.255.255.0",
    lan_ipaddr_ex2: "0.0.0.0", lan_netmask_ex2: "0.0.0.0",
    lan_ipaddr_ex3: "0.0.0.0", lan_netmask_ex3: "0.0.0.0",
    // WLAN default (zaten kapali)
    wl0_net_mode: "disabled", wl_net_mode: "disabled",
  },
};

// Ad -> profil. CLI `--profil <ad>` ile secilir.
export const PROFILES = { saha: FIELD_PROFILE, fabrika: FACTORY_PROFILE };
