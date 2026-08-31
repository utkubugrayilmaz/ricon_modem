# Ricon S9922M44-DOA — Keşif Bulguları

Tarih: 2026-08-26 · Cihaz: S/N M44DOA2603280958, IMEI 8671910XXXXXXXX ·
Firmware V7.3.0_SE_2510091051 / HW V4.5 · Test PC: Windows, Ethernet
ikincil IP 192.168.1.50/24, kaynak-IP bağlama ile.

Bu belgedeki her satır **canlı cihazda ölçüldü** (varsayım değil).

## Erişim

| Konu | Bulgu |
|---|---|
| Fabrika IP | 192.168.1.1 (etiket + doğrulandı) |
| ICMP (ping) | **Kapalı** — ping timeout. Canlılık TCP ile ölçülmeli |
| Erişim yöntemi | PC'de aynı alt ağda ikincil IP + giden isteklerde o adresi kaynak seçmek (Windows `-SkipAsSource` sorunu; araç `localAddress` ile aşıyor) |
| Cevap süresi | ~11 ms (yerel, hızlı) |

## Açık portlar (tarandı)

| Port | Servis | Durum |
|---|---|---|
| 53 | DNS | **AÇIK** |
| 80 | HTTP (web arayüzü) | **AÇIK** — tek yönetim yüzeyi |
| **5123** | **telnet konsolu** | **AÇIK** — root shell (`nvram` erişimi) |
| 22 (SSH), 23 (telnet std), 443 (HTTPS), 502, 1723, 5000, 8080, 8443, 9999 | — | Kapalı |
| 161/udp (SNMP) | — | Cevap yok (`public`) — daemon kapalı, nvram'da community tanımlı olsa da |

**Sonuç:** veri çekme **HTTP:80** üzerinden; ama ayar/otomasyon için asıl
güçlü kanal **telnet konsolu (5123)** — root shell, `nvram get/set/commit`.
Alttaki OS OpenWrt/Linux (`Release: 21.05.4-ricon`, kernel 2.6.36 mips).
Standart telnet 23 ve SSH kapalı; console 5123'te. Otomasyon (Faz 2/3) bu
telnet+nvram kanalı üzerine kurulacak (bkz. YETENEKLER.md).

## Web sunucu parmak izi

| Konu | Değer |
|---|---|
| Server başlığı | `WEB-ROUTER` |
| Protokol | `HTTP/1.0`, `Connection: close` → **tek bağlantılı** |
| Sayfa başlığı | `Industrial Cellular Router` |
| Soy | DD-WRT (`prototype.js`, `effects.js`, `share.umts` dil anahtarları) |
| Ana sayfa | frameset: `fm_head.htm` + `fm_menu.htm` + `status/Info.htm` |
| Kimlik | HTTP Basic, `realm="Industrial Cellular Router"`. Ayrı POST login YOK |
| Kimlik (bu ünite) | `riconadmin` / `<parola: .env>` |

**Tek-bağlantı kısıtı:** hızlı ardışık istek zaman aşımına düşürüyor.
Araç tüm HTTP'yi tek sıralı kuyruktan geçiriyor (istekler arası ~1.5 sn,
`Connection: close`, 3 deneme).

## Uç (endpoint) haritası

| Uç | Kimlik | İçerik |
|---|---|---|
| `/asp/status/Info.htm` | Yok | Sistem bilgi sayfası (HTML, ~17 KB) |
| `/asp/status/Info.live.htm` | Yok | Canlı sistem/LAN/bellek/WiFi (`{anahtar::değer}`) |
| `/asp/status/Status_Internet.live.asp` | **Gerekli** | SIM/hücresel canlı veri |
| `/asp/status/Status_Wireless.live.asp` | **Gerekli** | WLAN durumu |
| `/asp/setup/index.asp` | **Gerekli** | Modem/WAN ayar formu (~25 KB) — Faz 2 |
| `/nvrambak.bin` | **Gerekli** | **Tam yapılandırma yedeği** (ikili, ~28 KB, 1560 anahtar) |

Not: bu firmware'de canlı veri `.live.htm` (kimliksiz sistem) ve `.live.asp`
(kimlikli). Önceki Python çalışmasındaki `.live.asp` sistem yolları
değişmiş — bu yüzden uç listesi sabit değil, gerekirse sayfa JS'inden
(`new StatusUpdate("...")`) de çıkarılır.

## Çekilen canlı veri (SIM takılı, 2026-08-26)

- **SIM1:** ICCID `8990XXXXXXXXXXXXXXX` (ham sonda `F` dolgu), IMSI
  `28601XXXXXXXXXX` → **Turkcell**, IMEI `8671910XXXXXXXX`, durum **OK**,
  FDD LTE B7, sinyal, hücre ID `70D02C`, **WAN IP <WAN-IP>** (Turkcell'den
  gerçek public IP — modem çevirdi ve bağlandı).
- **SIM2:** yuva boş (`Invalid`).
- **Sistem:** LAN 192.168.1.1, MAC `00:0C:43:43:5F:4E` (OUI 00:0C:43 =
  Ralink/MediaTek), WiFi radyosu **kapalı** (fabrika), 60 MB RAM, uptime.
- **nvram:** 1560 anahtar — WiFi (`wl_*`), IP Modem/DTU (`dtu_*`), DDNS,
  IPSec, OpenVPN, SNMP config, MAC'ler, hepsi.

## MSISDN (telefon numarası)

Cihazda **yayınlanmıyor** (Python çalışmasında 38 alan + ayar + SMS + nvram
tarandı, yok). Numara operatörün HLR'ında ICCID'ye bağlı. Gerekirse
Turkcell'den ICCID→msisdn eşlemesi istenir.
