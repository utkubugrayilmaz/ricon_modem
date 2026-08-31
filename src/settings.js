// Tum sabitler burada — deger degisikligi icin TEK duzenlenecek yer.
// Veri koddur felsefesi: uc listesi, alan haritasi, port listesi hep tablo;
// genisletmek = satir eklemek.
//
// Bu dosyadaki uc adresleri ve alan adlari 2026-08-26'da CANLI cihazda
// (Ricon S9922M44-DOA, firmware V7.3.0_SE) dogrulandi. Onceki Python
// calismasindaki (.live.asp) yollarin bir kismi bu firmware'de (.live.htm)
// oldu — firmware degisirse ilk bakilacak yer bu liste.

// Modemin fabrika IP'si.
export const DEFAULT_HOST = "192.168.1.1";

// HTTP uclari. tur: "system" = kimliksiz erisilebilir (2026-08-26 dogrulandi),
// "identity" = HTTP Basic gerekli, "config" = tam yapilandirma yedegi.
// Not: bu firmware'de canli veri .live.htm (sistem) ve .live.asp (kimlikli).
export const ENDPOINTS = Object.freeze([
  { name: "info", path: "/asp/status/Info.htm", kind: "system", format: "html" },
  { name: "info_live", path: "/asp/status/Info.live.htm", kind: "system", format: "ddwrt" },
  { name: "internet_live", path: "/asp/status/Status_Internet.live.asp", kind: "identity", format: "ddwrt" },
  { name: "wireless_live", path: "/asp/status/Status_Wireless.live.asp", kind: "identity", format: "ddwrt" },
  { name: "setup_index", path: "/asp/setup/index.asp", kind: "identity", format: "html" },
  { name: "nvram_backup", path: "/nvrambak.bin", kind: "config", format: "nvram" },
]);

// DD-WRT canli sayfa alan adi -> bizim okunabilir adimiz. m1 = birincil modul,
// m2 = ikincil. w1_/w2_ = WAN baglantisi. Ham alanlar HER ZAMAN korunur;
// bu esleme yalnizca EK bir okunabilir gorunum uretir.
export const SIM_FIELD_MAP = Object.freeze({
  m1simiccid: "iccid",
  m1simimsi: "imsi",
  m1imei: "imei",
  m1sim: "activeSimSlot",
  m1simst: "simStatus",
  m1network: "networkType",
  m1bandinfo: "band",
  m13gname: "moduleName",
  m1dbm: "signalDbm",
  m1cellid: "cellId",
  m1noiseratio: "signalNoise",
  w1_wan_ip: "wan_ip",
  w1_wan_gw: "wanGateway",
  w1_wan_dns: "wan_dns",
  w1_wanup: "connectedFor",
  w1_wan_shortproto: "wanProtocol",
});

// SIM2 haritasi birincilden turetilir (m1->m2, w1_->w2_).
export const SIM2_FIELD_MAP = Object.freeze(
  Object.fromEntries(
    Object.entries(SIM_FIELD_MAP).map(([k, v]) => [
      k.replace(/^m1/, "m2").replace(/^w1_/, "w2_"),
      v,
    ]),
  ),
);

// IMSI onekinden operator (MCC 286 = Turkiye). Turk Telekom eski Avea
// bloklarini da isletir.
export const OPERATORS = Object.freeze({
  28601: "Turkcell",
  28602: "Vodafone",
  28603: "Turk Telekom (Avea)",
  28604: "Turk Telekom",
});

// Ayar sozlugu — nvram anahtari -> insan-okunur ayar (arayuzdeki adiyla).
// SIM_FIELD_MAP ile ayni fikir: cihazin dili -> bizim dilimiz. Kaynak:
// docs/hazirlama-profili.md (default/duzeltilmis ekran kiyasiyla teyitli).
//
// Motor bunu KULLANMAZ — motor yalnizca anahtar/deger bilir. Bu tablo sadece
// GOSTERIM icin (UI, rapor). Yeni ayar = yeni satir.
//   ad      : arayuzdeki alan adi
//   sayfa   : arayuzde hangi sayfada
//   degerler: ham deger -> okunabilir etiket (yoksa ham deger gosterilir)
//   birim   : sayisal degerin birimi
//   gizli   : degeri ekranda maskele (parola alani)
export const SETTING_LABELS = Object.freeze({
  // Cihaz adi = SIM'in telefon numarasi (arayuzde Device Name).
  router_name: { name: "Device Name (phone number)", page: "Device" },
  // SIM PIN — degeri EKRANDA MASKELENIR, log/deftere hic yazilmaz.
  m1s1simpin: { name: "SIM1 PIN", page: "Modem/WAN → Main Link", secret: true },

  w1_wan_proto: { name: "Connection Type", page: "Modem/WAN → Main Link",
    values: { m13gdhcp: "M1-DHCP", m13g: "M1-PPP" } },
  m1simswtch: { name: "SIM Backup", page: "Modem/WAN → Main Link",
    values: { 0: "Disable", 1: "Enable" } },
  mullinkfail: { name: "Link Fail to Restart", page: "Modem/WAN → Main Link", unit: "min" },
  m1s1wanapn: { name: "APN (SIM1)", page: "Modem/WAN → Main Link" },
  m1s1pppuser: { name: "SIM1 User Name", page: "Modem/WAN → Main Link" },
  m1s1ppppwd: { name: "SIM1 Password", page: "Modem/WAN → Main Link", secret: true },
  m1s2pppuser: { name: "SIM2 User Name", page: "Modem/WAN → Main Link" },
  m1s2ppppwd: { name: "SIM2 Password", page: "Modem/WAN → Main Link", secret: true },

  w1_connfailsw: { name: "Connect Fail", page: "Modem/WAN → Others" },
  w1_kponm: { name: "Keep Alive", page: "Modem/WAN → Others",
    values: { 1: "None", 7: "ICMP+" } },
  m1_pap_allowed: { name: "Authentication · PAP", page: "Modem/WAN → Others",
    values: { 0: "off", 1: "on" } },
  m1_chap_allowed: { name: "Authentication · CHAP", page: "Modem/WAN → Others",
    values: { 0: "off", 1: "on" } },
  m1_chapms_allowed: { name: "Authentication · MS-CHAP", page: "Modem/WAN → Others",
    values: { 0: "off", 1: "on" } },
  m1_chapms_v2_allowed: { name: "Authentication · MS-CHAPv2", page: "Modem/WAN → Others",
    values: { 0: "off", 1: "on" } },

  w2_wan_proto: { name: "Connection Type", page: "Modem/WAN → Backup Link",
    values: { disabled: "Disabled", dhcp: "Automatic Configuration - DHCP" } },

  wl0_net_mode: { name: "WLAN radio", page: "Wireless",
    values: { disabled: "off" } },
  wl_net_mode: { name: "WLAN radio (global)", page: "Wireless",
    values: { disabled: "off" } },

  // DHCP sunucusu. Bonus: bu anahtar KIMLIKSIZ sayfada da (Info.live.htm)
  // goruldugu icin parolasiz dogrulanabiliyor.
  lan_proto: { name: "DHCP Server", page: "DHCP Server",
    values: { dhcp: "Enabled", static: "Disabled" } },

  lan_ipaddr: { name: "Local IP", page: "LAN" },
  lan_ipaddr_ex1: { name: "Local IP Address1", page: "LAN",
    values: { "0.0.0.0": "none (cleared)" } },
  lan_netmask_ex1: { name: "Subnet Mask1", page: "LAN",
    values: { "0.0.0.0": "none (cleared)" } },
  lan_ipaddr_ex2: { name: "Local IP Address2", page: "LAN",
    values: { "0.0.0.0": "none (cleared)" } },
  lan_netmask_ex2: { name: "Subnet Mask2", page: "LAN",
    values: { "0.0.0.0": "none (cleared)" } },
  lan_ipaddr_ex3: { name: "Local IP Address3", page: "LAN",
    values: { "0.0.0.0": "none (cleared)" } },
  lan_netmask_ex3: { name: "Subnet Mask3", page: "LAN",
    values: { "0.0.0.0": "none (cleared)" } },
});

// MAC uretici onekleri (OUI). Cihazi adresini bilmeden komsu tablosunda
// tanimak icin. 00:0C:43 = bu unitede olculen chipset (Ralink/MediaTek).
export const OUI_VENDORS = Object.freeze({
  "00:0c:43": "Ralink/MediaTek",
  "00:88:6a": "Ricon",
});

// Modemin web sunucusu TEK BAGLANTILI (Server: WEB-ROUTER, HTTP/1.0,
// Connection: close). Hizli ardisik istek zaman asimina dusuruyor —
// istekler sirali, aralikli ve tekrar denemeli olmali. Bu degerler
// Python calismasindaki sahada dogrulanmis degerlerle uyumlu.
export const REQUEST_GAP_MS = 1500; // ardisik istekler arasi bekleme
export const REQUEST_TIMEOUT_MS = 25000; // tek istegin ust siniri
export const REQUEST_RETRIES = 3; // basarisiz istekte tekrar sayisi
export const RETRY_GAP_MS = 3000; // tekrar denemeden once bekleme
export const TCP_PROBE_MS = 1500; // port connect denemesi zaman asimi

// setTimeout gecikmeyi 32 bitte tutar; cok buyuk deger sessizce 1 ms'ye
// coker. Zaman asimi degerleri I/O'dan ONCE bununla dogrulanir.
export const MAX_TIMER_MS = 2 ** 31 - 1;

// ======================================================================
// Provizyon profilleri
// ======================================================================

export const LAN_IP_KEYS = ["lan_ipaddr"];

// SIM1 PIN anahtarı. DİKKAT — bu anahtar diff ile DEĞİL, isimden çıkarıldı
// (`m1s1simpin`, arayüzdeki Modem/WAN → SIM1 → PIN alanı). Elimizde PIN
// kilitli SIM olmadığı için diff'lenemedi; çalışan bir SIM'e PIN yazarak
// deney yapmak da doğru değil.
//
// Yanındaki `m1s1simpinpro` ("PIN protection"?) BİLEREK dokunulmuyor: anlamı
// belirsiz ve SIM üzerinde işlem yapıyor olabilir. Tek seferde tek değişken.
// PIN yazmak interneti getirmezse denenecek İLK şey o.
export const SIM_PIN_KEY = "m1s1simpin";

// Telefon numarasının yazıldığı alan (arayüzde Device Name). Değeri profilde
// SABİT DEĞİL — her modemde farklı, o yüzden çalışma anında ekleniyor
// (bkz. pipeline.js). Fabrika profilinde default değeri var ki
// "fabrikaya döndür" bunu da geri alsın.
export const DEVICE_NAME_KEY = "router_name";
const DEVICE_NAME_DEFAULT = "Industrial Cellular Router";

// YAZMA SIRASI — teknisyenin arayuzde izledigi sira: Modem/WAN -> DHCP -> LAN.
//
// DURUST NOT: nvram'a yazma teknik olarak SIRASIZ'dir; hicbir deger `nvram
// commit` + reboot'a kadar yururluge girmez. Yani bu sira SONUCU DEGISTIRMEZ.
// Yine de bu sirayla yaziyoruz, iki gercek sebep var:
//   1) Yazma yarida kalirsa (baglanti dustu, konsol koptu) yonetim adresi EN
//      SON degistigi icin cihaz hala eski adreste bulunabilir — kurtarilabilir.
//   2) Plan/ilerleme ekrani teknisyenin kafasindaki sirayla akar.
// Listede olmayan anahtar "Other" grubuna duser ve LAN'dan ONCE yazilir.
export const WRITE_GROUPS = [
  {
    // Cihaz adı = telefon numarası. En başta: en zararsız yazma, sorun çıkarsa
    // gerisi hiç denenmemiş olur.
    name: "Device",
    keys: ["router_name"],
  },
  {
    name: "Modem/WAN",
    keys: [
      "w1_wan_proto", "m1simswtch", "mullinkfail",
      "m1s1wanapn", "m1s1pppuser", "m1s1ppppwd", "m1s2pppuser", "m1s2ppppwd",
      "m1s1simpin",
      "w1_connfailsw", "w1_kponm",
      "m1_pap_allowed", "m1_chap_allowed", "m1_chapms_allowed", "m1_chapms_v2_allowed",
      "w2_wan_proto",
      "wl0_net_mode", "wl_net_mode",
    ],
  },
  {
    name: "DHCP",
    // lan_proto: dhcp = DHCP sunucusu acik, static = kapali (diff ile teyitli).
    keys: ["lan_proto"],
  },
  {
    name: "LAN",
    keys: [
      "lan_ipaddr_ex1", "lan_netmask_ex1",
      "lan_ipaddr_ex2", "lan_netmask_ex2",
      "lan_ipaddr_ex3", "lan_netmask_ex3",
      "lan_ipaddr",     // yonetim adresi — grubun ve tum yazmanin EN SONU
    ],
  },
];

export const FIELD_PROFILE = {
  name: "field",
  description: "ACO RVM field profile — Ricon S9922M44",

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
  name: "factory",
  description: "FIELD_PROFILE anahtarlarinin default degerleri (GERCEK factory reset DEGIL)",
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
    // Cihaz adi default — "fabrikaya dondur" telefon numarasini da geri alir.
    router_name: DEVICE_NAME_DEFAULT,
    // SAKLANAN SIM PIN'INI SIL. Bu bir temizlik degil, GUVENLIK:
    // modem sakladigi PIN'i her acilista SIM'e gonderiyor (2026-08-27 olculdu).
    // Eski SIM'in PIN'i icerde kalirsa ve modeme BASKA bir PIN'li SIM takilirsa
    // modem yanlis PIN gonderir ve YENI SIM'in denemelerini yakar — 3 boot
    // sonra PUK kilidi. Fabrikaya donen modem "temiz" olmali.
    m1s1simpin: "",
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

// Ad -> profil. CLI `--profile <ad>` ile secilir.
//
// DIKKAT: anahtarlar TIRNAKLI. Bunlar JS tanimlayicisi degil, CLI SOZLESMESI.
// Iki kez ciplak birakildilar ve iki kez bir yeniden adlandirma turunda koda
// benzeyip cevrildiler; PROFILES[varsayilan] undefined donunce arac hicbir
// sey yazmadan cikti (2026-08-28 af9ccf8, 2026-08-31). Tirnak onu engelliyor.
//
// Defterdeki gecmis satirlarda hala "saha"/"fabrika" yaziyor — o degerler
// src/legacy.js'te (LEGACY_PROFILE) okuma aninda esleniyor. Yani veri
// sozlesmesi burada DEGIL, orada tutuluyor; burasi yalnizca bugunku CLI.
export const PROFILES = { "field": FIELD_PROFILE, "factory": FACTORY_PROFILE };
