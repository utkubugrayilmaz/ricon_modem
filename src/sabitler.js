// Tum sabitler burada — deger degisikligi icin TEK duzenlenecek yer.
// Veri koddur felsefesi: uc listesi, alan haritasi, port listesi hep tablo;
// genisletmek = satir eklemek.
//
// Bu dosyadaki uc adresleri ve alan adlari 2026-08-26'da CANLI cihazda
// (Ricon S9922M44-DOA, firmware V7.3.0_SE) dogrulandi. Onceki Python
// calismasindaki (.live.asp) yollarin bir kismi bu firmware'de (.live.htm)
// oldu; bu yuzden uc listesi sabit degil, ucbulucu.js sayfadan da cikarir.

// Modemin fabrika IP'si.
export const VARSAYILAN_HOST = "192.168.1.1";

// Kesifte bakilan TCP kapilari. Hepsi salt-okunur yoklama (connect denemesi).
// Endustriyel router'da RMS/DTU/VPN olabilir; liste Python'daki 6 kapidan genis.
export const TCP_KAPILARI = Object.freeze([
  { kapi: 22, ad: "SSH" },
  { kapi: 23, ad: "telnet" },
  { kapi: 53, ad: "DNS" },
  { kapi: 80, ad: "HTTP (web arayuzu)" },
  { kapi: 443, ad: "HTTPS" },
  { kapi: 502, ad: "Modbus TCP" },
  { kapi: 1723, ad: "PPTP VPN" },
  { kapi: 5000, ad: "HTTP (alternatif)" },
  { kapi: 8080, ad: "HTTP (alternatif)" },
  { kapi: 8443, ad: "HTTPS (alternatif)" },
  { kapi: 9999, ad: "DTU / ham TCP" },
]);

// UDP kapilari — ayri (dgram) kontrol edilir.
export const UDP_KAPILARI = Object.freeze([
  { kapi: 161, ad: "SNMP" },
  { kapi: 162, ad: "SNMP trap" },
  { kapi: 500, ad: "IPSec IKE" },
  { kapi: 4500, ad: "IPSec NAT-T" },
]);

// HTTP uclari. tur: "sistem" = kimliksiz erisilebilir (2026-08-26 dogrulandi),
// "kimlik" = HTTP Basic gerekli, "config" = tam yapilandirma yedegi.
// Not: bu firmware'de canli veri .live.htm (sistem) ve .live.asp (kimlikli).
export const UCLAR = Object.freeze([
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
export const SIM_ALAN_HARITASI = Object.freeze({
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
export const SIM2_ALAN_HARITASI = Object.freeze(
  Object.fromEntries(
    Object.entries(SIM_ALAN_HARITASI).map(([k, v]) => [
      k.replace(/^m1/, "m2").replace(/^w1_/, "w2_"),
      v,
    ]),
  ),
);

// IMSI onekinden operator (MCC 286 = Turkiye). Turk Telekom eski Avea
// bloklarini da isletir.
export const OPERATORLER = Object.freeze({
  28601: "Turkcell",
  28602: "Vodafone",
  28603: "Turk Telekom (Avea)",
  28604: "Turk Telekom",
});

// MAC uretici onekleri (OUI). Cihazi adresini bilmeden komsu tablosunda
// tanimak icin. 00:0C:43 = bu unitede olculen chipset (Ralink/MediaTek).
export const OUI_URETICI = Object.freeze({
  "00:0c:43": "Ralink/MediaTek",
  "00:88:6a": "Ricon",
});

// Modemin web sunucusu TEK BAGLANTILI (Server: WEB-ROUTER, HTTP/1.0,
// Connection: close). Hizli ardisik istek zaman asimina dusuruyor —
// istekler sirali, aralikli ve tekrar denemeli olmali. Bu degerler
// Python calismasindaki sahada dogrulanmis degerlerle uyumlu.
export const ISTEK_ARASI_MS = 1500; // ardisik istekler arasi bekleme
export const ISTEK_ZAMAN_ASIMI_MS = 25000; // tek istegin ust siniri
export const ISTEK_DENEME = 3; // basarisiz istekte tekrar sayisi
export const DENEME_ARASI_MS = 3000; // tekrar denemeden once bekleme
export const TCP_YOKLAMA_MS = 1500; // port connect denemesi zaman asimi

// setTimeout gecikmeyi 32 bitte tutar; cok buyuk deger sessizce 1 ms'ye
// coker. Zaman asimi degerleri I/O'dan ONCE bununla dogrulanir.
export const MAX_ZAMANLAYICI_MS = 2 ** 31 - 1;
