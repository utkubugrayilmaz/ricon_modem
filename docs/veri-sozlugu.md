# Veri Sözlüğü — Ricon S9922M44 canlı uç alanları

Güven işareti: 🟢 canlı cihazda doğrulandı (2026-08-26) · 🟡 desenden/isimden
çıkarıldı · 🔴 tahmin, doğrulanmalı.

Kaynak uçlar: `Info.live.htm` (kimliksiz sistem), `Status_Internet.live.asp`
(kimlikli SIM/hücresel). Format: `{anahtar::değer}`.

## Sistem (`Info.live.htm`, kimliksiz)

| Alan | Anlam | Örnek | Güven |
|---|---|---|---|
| `lan_ip` | LAN IP | `192.168.1.1` | 🟢 |
| `lan_mac` | LAN MAC | `00:0C:43:43:5F:4E` | 🟢 |
| `wan_mac1` | WAN MAC (modül 1) | `02:0C:29:...` | 🟢 |
| `wl_radio` | WiFi radyo durumu | `Radio is Off` | 🟢 |
| `wl_channel` | WiFi kanal | `Unknown` | 🟢 |
| `uptime_spe` | Uptime + load average | `... up 8 Min., load average: 0.19...` | 🟢 |
| `mem_info` | Bellek (Total/Free/Buffers/Cached...) kB | `,'MemTotal:','60408',...` | 🟢 |
| `lan_proto` | LAN protokolü | `dhcp` | 🟢 |
| `ip_conntrack` | Aktif bağlantı sayısı | `7` | 🟡 |
| `wan_uptime` | WAN bağlı süresi | `Not available` / süre | 🟢 |

## SIM / hücresel (`Status_Internet.live.asp`, kimlikli)

m1 = birincil modül/SIM, m2 = ikincil. w1_/w2_ = ilgili WAN.

| Alan | Anlam | Örnek | Güven |
|---|---|---|---|
| `m1simiccid` | SIM ICCID (sonda `F` dolgu olabilir) | `8990XXXXXXXXXXXXXXXF` | 🟢 |
| `m1simimsi` | IMSI (ilk 5 = MCC+MNC → operatör) | `28601XXXXXXXXXX` | 🟢 |
| `m1imei` | Modül IMEI | `8671910XXXXXXXX` | 🟢 |
| `m1sim` | Aktif SIM yuvası | `SIM1` | 🟢 |
| `m1simst` | SIM durumu | `OK` / `Invalid` | 🟢 |
| `m1network` | Şebeke tipi | `FDD LTE` | 🟢 |
| `m1bandinfo` | Band | `LTE-FDD B7` | 🟢 |
| `m13gname` | Modül adı | `Q200AF` | 🟢 |
| `m1dbm` | Sinyal (dBm — pozitif sunuluyor) | `71` | 🟡 |
| `m1cellid` | Hücre ID (hex) | `70D02C` | 🟢 |
| `m1noiseratio` | Sinyal/gürültü | `12` | 🟡 |
| `m1signal` | Sinyal çubuğu (HTML — temizlenir) | `<table>...` | 🟢 |
| `w1_wan_ip` | WAN public IP | `<WAN-IP>` | 🟢 |
| `w1_wan_gw` | WAN ağ geçidi | `<WAN-GW>` | 🟢 |
| `w1_wan_dns` | WAN DNS | `213.74.0.4 213.74.1.4` | 🟢 |
| `w1_wanup` | Bağlı süre | `0:08:05` | 🟢 |
| `w1_wan_shortproto` | WAN protokolü | `m13gdhcp` (hücresel) / `dhcp` | 🟢 |

## Notlar / doğrulanacaklar

- 🟡 `m1dbm` **pozitif** geliyor (`71`). Gerçek RSSI/RSRP negatif dBm'dir
  (örn. -71). Muhtemelen işaretsiz sunum; RSRP/SINR ile ilişkisi Faz 1
  `izle` ile (anten çıkar/tak) doğrulanmalı.
- 🟡 `m1noiseratio` biriminin SINR mi ham oran mı olduğu netleşmeli.
- MSISDN alanı **yok** (bkz. BULGULAR.md).
- `iccid_temiz` ve `operator` alanlarını **araç türetir** (cihaz vermez):
  ICCID sondaki `F` atılır, operatör IMSI ilk 5 hanesinden.
