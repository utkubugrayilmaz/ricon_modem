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

// HTTP uclari. tur: "sistem" = kimliksiz erisilebilir (2026-08-26 dogrulandi),
// "kimlik" = HTTP Basic gerekli, "config" = tam yapilandirma yedegi.
// Not: bu firmware'de canli veri .live.htm (sistem) ve .live.asp (kimlikli).
export const ENDPOINTS = Object.freeze([
  { ad: "info", yol: "/asp/status/Info.htm", tur: "sistem", bicim: "html" },
  { ad: "info_live", yol: "/asp/status/Info.live.htm", tur: "sistem", bicim: "ddwrt" },
  { ad: "internet_live", yol: "/asp/status/Status_Internet.live.asp", tur: "kimlik", bicim: "ddwrt" },
  { ad: "wireless_live", yol: "/asp/status/Status_Wireless.live.asp", tur: "kimlik", bicim: "ddwrt" },
  { ad: "setup_index", yol: "/asp/setup/index.asp", tur: "kimlik", bicim: "html" },
  { ad: "nvram_yedek", yol: "/nvrambak.bin", tur: "config", bicim: "nvram" },
]);

// DD-WRT canli sayfa alan adi -> bizim okunabilir adimiz. m1 = birincil modul,
// m2 = ikincil. w1_/w2_ = WAN baglantisi. Ham alanlar HER ZAMAN korunur;
// bu esleme yalnizca EK bir okunabilir gorunum uretir.
export const SIM_FIELD_MAP = Object.freeze({
  m1simiccid: "iccid",
  m1simimsi: "imsi",
  m1imei: "imei",
  m1sim: "aktif_sim_yuvasi",
  m1simst: "sim_durumu",
  m1network: "sebeke_tipi",
  m1bandinfo: "band",
  m13gname: "modul_adi",
  m1dbm: "sinyal_dbm",
  m1cellid: "hucre_id",
  m1noiseratio: "sinyal_gurultu",
  w1_wan_ip: "wan_ip",
  w1_wan_gw: "wan_ag_gecidi",
  w1_wan_dns: "wan_dns",
  w1_wanup: "bagli_sure",
  w1_wan_shortproto: "wan_protokol",
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
  router_name: { ad: "Device Name (telefon no)", sayfa: "Cihaz" },
  // SIM PIN — degeri EKRANDA MASKELENIR, log/deftere hic yazilmaz.
  m1s1simpin: { ad: "SIM1 PIN", sayfa: "Modem/WAN → Main Link", gizli: true },

  w1_wan_proto: { ad: "Connection Type", sayfa: "Modem/WAN → Main Link",
    degerler: { m13gdhcp: "M1-DHCP", m13g: "M1-PPP" } },
  m1simswtch: { ad: "SIM Backup", sayfa: "Modem/WAN → Main Link",
    degerler: { 0: "Disable", 1: "Enable" } },
  mullinkfail: { ad: "Link Fail to Restart", sayfa: "Modem/WAN → Main Link", birim: "dk" },
  m1s1wanapn: { ad: "APN (SIM1)", sayfa: "Modem/WAN → Main Link" },
  m1s1pppuser: { ad: "SIM1 User Name", sayfa: "Modem/WAN → Main Link" },
  m1s1ppppwd: { ad: "SIM1 Password", sayfa: "Modem/WAN → Main Link", gizli: true },
  m1s2pppuser: { ad: "SIM2 User Name", sayfa: "Modem/WAN → Main Link" },
  m1s2ppppwd: { ad: "SIM2 Password", sayfa: "Modem/WAN → Main Link", gizli: true },

  w1_connfailsw: { ad: "Connect Fail", sayfa: "Modem/WAN → Others" },
  w1_kponm: { ad: "Keep Alive", sayfa: "Modem/WAN → Others",
    degerler: { 1: "None", 7: "ICMP+" } },
  m1_pap_allowed: { ad: "Authentication · PAP", sayfa: "Modem/WAN → Others",
    degerler: { 0: "kapali", 1: "acik" } },
  m1_chap_allowed: { ad: "Authentication · CHAP", sayfa: "Modem/WAN → Others",
    degerler: { 0: "kapali", 1: "acik" } },
  m1_chapms_allowed: { ad: "Authentication · MS-CHAP", sayfa: "Modem/WAN → Others",
    degerler: { 0: "kapali", 1: "acik" } },
  m1_chapms_v2_allowed: { ad: "Authentication · MS-CHAPv2", sayfa: "Modem/WAN → Others",
    degerler: { 0: "kapali", 1: "acik" } },

  w2_wan_proto: { ad: "Connection Type", sayfa: "Modem/WAN → Backup Link",
    degerler: { disabled: "Disabled", dhcp: "Automatic Configuration - DHCP" } },

  wl0_net_mode: { ad: "WLAN radyo", sayfa: "Wireless",
    degerler: { disabled: "kapali" } },
  wl_net_mode: { ad: "WLAN radyo (genel)", sayfa: "Wireless",
    degerler: { disabled: "kapali" } },

  // DHCP sunucusu. Bonus: bu anahtar KIMLIKSIZ sayfada da (Info.live.htm)
  // goruldugu icin parolasiz dogrulanabiliyor.
  lan_proto: { ad: "DHCP Server", sayfa: "DHCP Server",
    degerler: { dhcp: "Enabled", static: "Disabled" } },

  lan_ipaddr: { ad: "Local IP", sayfa: "LAN" },
  lan_ipaddr_ex1: { ad: "Local IP Address1", sayfa: "LAN",
    degerler: { "0.0.0.0": "yok (silinmis)" } },
  lan_netmask_ex1: { ad: "Subnet Mask1", sayfa: "LAN",
    degerler: { "0.0.0.0": "yok (silinmis)" } },
  lan_ipaddr_ex2: { ad: "Local IP Address2", sayfa: "LAN",
    degerler: { "0.0.0.0": "yok (silinmis)" } },
  lan_netmask_ex2: { ad: "Subnet Mask2", sayfa: "LAN",
    degerler: { "0.0.0.0": "yok (silinmis)" } },
  lan_ipaddr_ex3: { ad: "Local IP Address3", sayfa: "LAN",
    degerler: { "0.0.0.0": "yok (silinmis)" } },
  lan_netmask_ex3: { ad: "Subnet Mask3", sayfa: "LAN",
    degerler: { "0.0.0.0": "yok (silinmis)" } },
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
