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

// Kesifte bakilan TCP kapilari. Hepsi salt-okunur yoklama (connect denemesi).
// Endustriyel router'da RMS/DTU/VPN olabilir; liste Python'daki 6 kapidan genis.
export const TCP_PORTS = Object.freeze([
  { port: 22, name: "SSH" },
  { port: 23, name: "telnet" },
  { port: 53, name: "DNS" },
  { port: 80, name: "HTTP (web arayuzu)" },
  { port: 443, name: "HTTPS" },
  { port: 502, name: "Modbus TCP" },
  { port: 1723, name: "PPTP VPN" },
  { port: 5000, name: "HTTP (alternatif)" },
  { port: 8080, name: "HTTP (alternatif)" },
  { port: 8443, name: "HTTPS (alternatif)" },
  { port: 9999, name: "DTU / ham TCP" },
]);

// Not: UDP kapi listesi YOK — UDP'de "kapali" ile "cevapsiz" ayirt edilemez,
// tarama yanlis guven verir. Tek gereken UDP servisi SNMP; o snmp.js'te
// dogrudan gercek bir GET ile yoklanir (kesin cevap).

// HTTP uclari. tur: "sistem" = kimliksiz erisilebilir (2026-08-26 dogrulandi),
// "kimlik" = HTTP Basic gerekli, "config" = tam yapilandirma yedegi.
// Not: bu firmware'de canli veri .live.htm (sistem) ve .live.asp (kimlikli).
export const ENDPOINTS = Object.freeze([
  { name: "info", path: "/asp/status/Info.htm", kind: "sistem", bicim: "html" },
  { name: "info_live", path: "/asp/status/Info.live.htm", kind: "sistem", bicim: "ddwrt" },
  { name: "internet_live", path: "/asp/status/Status_Internet.live.asp", kind: "kimlik", bicim: "ddwrt" },
  { name: "wireless_live", path: "/asp/status/Status_Wireless.live.asp", kind: "kimlik", bicim: "ddwrt" },
  { name: "setup_index", path: "/asp/setup/index.asp", kind: "kimlik", bicim: "html" },
  { name: "nvram_yedek", path: "/nvrambak.bin", kind: "config", bicim: "nvram" },
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
  w1_wan_ip: "wanIp",
  w1_wan_gw: "wanGateway",
  w1_wan_dns: "wanDns",
  w1_wanup: "uptimeSec",
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
  router_name: { name: "Device Name (telefon no)", page: "Cihaz" },
  // SIM PIN — degeri EKRANDA MASKELENIR, log/deftere hic yazilmaz.
  m1s1simpin: { name: "SIM1 PIN", page: "Modem/WAN → Main Link", gizli: true },

  w1_wan_proto: { name: "Connection Type", page: "Modem/WAN → Main Link",
    values: { m13gdhcp: "M1-DHCP", m13g: "M1-PPP" } },
  m1simswtch: { name: "SIM Backup", page: "Modem/WAN → Main Link",
    values: { 0: "Disable", 1: "Enable" } },
  mullinkfail: { name: "Link Fail to Restart", page: "Modem/WAN → Main Link", birim: "dk" },
  m1s1wanapn: { name: "APN (SIM1)", page: "Modem/WAN → Main Link" },
  m1s1pppuser: { name: "SIM1 User Name", page: "Modem/WAN → Main Link" },
  m1s1ppppwd: { name: "SIM1 Password", page: "Modem/WAN → Main Link", gizli: true },
  m1s2pppuser: { name: "SIM2 User Name", page: "Modem/WAN → Main Link" },
  m1s2ppppwd: { name: "SIM2 Password", page: "Modem/WAN → Main Link", gizli: true },

  w1_connfailsw: { name: "Connect Fail", page: "Modem/WAN → Others" },
  w1_kponm: { name: "Keep Alive", page: "Modem/WAN → Others",
    values: { 1: "None", 7: "ICMP+" } },
  m1_pap_allowed: { name: "Authentication · PAP", page: "Modem/WAN → Others",
    values: { 0: "kapali", 1: "acik" } },
  m1_chap_allowed: { name: "Authentication · CHAP", page: "Modem/WAN → Others",
    values: { 0: "kapali", 1: "acik" } },
  m1_chapms_allowed: { name: "Authentication · MS-CHAP", page: "Modem/WAN → Others",
    values: { 0: "kapali", 1: "acik" } },
  m1_chapms_v2_allowed: { name: "Authentication · MS-CHAPv2", page: "Modem/WAN → Others",
    values: { 0: "kapali", 1: "acik" } },

  w2_wan_proto: { name: "Connection Type", page: "Modem/WAN → Backup Link",
    values: { disabled: "Disabled", dhcp: "Automatic Configuration - DHCP" } },

  wl0_net_mode: { name: "WLAN radyo", page: "Wireless",
    values: { disabled: "kapali" } },
  wl_net_mode: { name: "WLAN radyo (genel)", page: "Wireless",
    values: { disabled: "kapali" } },

  // DHCP sunucusu. Bonus: bu anahtar KIMLIKSIZ sayfada da (Info.live.htm)
  // goruldugu icin parolasiz dogrulanabiliyor.
  lan_proto: { name: "DHCP Server", page: "DHCP Server",
    values: { dhcp: "Enabled", static: "Disabled" } },

  lan_ipaddr: { name: "Local IP", page: "LAN" },
  lan_ipaddr_ex1: { name: "Local IP Address1", page: "LAN",
    values: { "0.0.0.0": "yok (silinmis)" } },
  lan_netmask_ex1: { name: "Subnet Mask1", page: "LAN",
    values: { "0.0.0.0": "yok (silinmis)" } },
  lan_ipaddr_ex2: { name: "Local IP Address2", page: "LAN",
    values: { "0.0.0.0": "yok (silinmis)" } },
  lan_netmask_ex2: { name: "Subnet Mask2", page: "LAN",
    values: { "0.0.0.0": "yok (silinmis)" } },
  lan_ipaddr_ex3: { name: "Local IP Address3", page: "LAN",
    values: { "0.0.0.0": "yok (silinmis)" } },
  lan_netmask_ex3: { name: "Subnet Mask3", page: "LAN",
    values: { "0.0.0.0": "yok (silinmis)" } },
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
