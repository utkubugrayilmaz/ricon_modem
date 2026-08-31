# Modem — Ricon S9922M44-DOA

Endüstriyel hücresel router. OS: OpenWrt/Linux (kernel 2.6.36, MIPS MT7628).
Web arayüzü DD-WRT soylu. İçindeki hücresel modül için bkz. [hucresel-modul.md](hucresel-modul.md).

## Erişim

| Kanal | Adres | Kimlik | Not |
|---|---|---|---|
| Web / HTTP | `http://<host>:80` | HTTP Basic `riconadmin` / `<parola>` | Veri çekme kanalı. Tek bağlantılı (HTTP/1.0, Connection: close) |
| Telnet konsol | `telnet <host> 5123` | `riconadmin` / `<parola>` | Root BusyBox shell. Ayar/otomasyon kanalı |
| DNS | `<host>:53` | — | dnsmasq (açık) |

Fabrika IP `192.168.1.1`, saha IP `5.5.5.1`. SSH (22), standart telnet (23),
HTTPS (443), SNMP (161/udp) kapalı.

## HTTP uçları

| İstek | Kimlik | Döndürdüğü veri |
|---|---|---|
| `GET /asp/status/Info.htm` | Yok | Sistem bilgi sayfası (HTML) |
| `GET /asp/status/Info.live.htm` | Yok | Canlı sistem/LAN/bellek/WiFi (`{anahtar::değer}`) |
| `GET /asp/status/Status_Internet.live.asp` | Var | SIM/hücresel canlı veri |
| `GET /asp/status/Status_Wireless.live.asp` | Var | WLAN durumu |
| `GET /asp/setup/index.asp` | Var | Modem/WAN ayar formu (HTML) |
| `GET /nvrambak.bin` | Var | Tam yapılandırma yedeği (ikili, ~1560 anahtar) |

### `Info.live.htm` alanları (kimliksiz)

| Alan | Anlam |
|---|---|
| `lan_ip` | LAN IP |
| `lan_mac` | LAN MAC |
| `wan_mac1` | WAN MAC (modül 1) |
| `wl_radio` | WiFi radyo durumu |
| `wl_channel` | WiFi kanal |
| `lan_proto` | LAN protokolü (`dhcp` / `static`) |
| `uptime_spe` | Uptime + load average |
| `mem_info` | Bellek (Total/Free/Buffers/Cached, kB) |
| `ip_conntrack` | Aktif bağlantı sayısı |
| `wan_uptime` | WAN bağlı süresi |

### `Status_Internet.live.asp` alanları (kimlikli)

m1 = birincil modül/SIM, m2 = ikincil; w1_/w2_ = ilgili WAN.

| Alan | Anlam |
|---|---|
| `m1simiccid` | SIM ICCID (sonda `F` dolgu olabilir) |
| `m1simimsi` | IMSI (ilk 5 = MCC+MNC → operatör) |
| `m1imei` | Modül IMEI |
| `m1sim` | Aktif SIM yuvası (SIM1/SIM2) |
| `m1simst` | SIM durumu (`OK` / `Invalid` / `Not Insert`) |
| `m1network` | Şebeke tipi (`FDD LTE`) |
| `m1bandinfo` | Band (`LTE-FDD B7`) |
| `m13gname` | Modül adı |
| `m1dbm` | Sinyal (dBm, pozitif sunulur; `9999` = okuma yok) |
| `m1cellid` | Hücre ID (hex) |
| `m1noiseratio` | Sinyal/gürültü |
| `m1signal` | Sinyal çubuğu (HTML) |
| `w1_wan_ip` | WAN public IP |
| `w1_wan_gw` | WAN ağ geçidi |
| `w1_wan_dns` | WAN DNS |
| `w1_wanup` | Bağlı süre |
| `w1_wan_shortproto` | WAN protokolü |

Araç türetir (cihaz vermez): `iccid_temiz` (sondaki `F` atılır),
`operator` (IMSI ilk 5 hanesinden). MSISDN/telefon numarası bu uçlarda **yok**.

## Telnet konsol (port 5123)

### nvram
| Komut | İş |
|---|---|
| `nvram show` | Tüm yapılandırma (~1587 satır) |
| `nvram get <anahtar>` | Tek anahtar değeri |
| `nvram set <anahtar>=<değer>` | Değer yaz (RAM) |
| `nvram commit` | Kalıcı yaz |
| `nvram show \| grep -i <desen>` | Filtreli okuma |

### Sistem / teşhis
| Komut | Verdiği |
|---|---|
| `cat /proc/version` | Kernel sürümü |
| `cat /proc/cpuinfo` | SoC / CPU |
| `uptime` | Çalışma süresi + yük |
| `free` | Bellek |
| `df -h` | Disk / yazılabilir alan |
| `ps` | Çalışan servisler |
| `ifconfig` | Arayüzler (br0/usb0/vlan1) |
| `route -n` | Yönlendirme tablosu |
| `netstat -tln` | Dinleyen portlar |
| `netstat -tn` | Kurulu bağlantılar |
| `dmesg` | Çekirdek logu (ttyUSB port tespiti) |

### Önemli nvram anahtarları

Kimlik / LAN:
| Anahtar | Anlam |
|---|---|
| `lan_ipaddr` / `lan_netmask` | LAN IP / maske |
| `lan_ipaddr_ex1..3` / `lan_netmask_ex1..3` | İkincil LAN adresleri |
| `lan_proto` | DHCP Server (`dhcp`=açık, `static`=kapalı) |
| `et0macaddr` | LAN MAC |
| `router_name` | Device Name |
| `dhcp_start` / `dhcp_num` / `dhcp_lease` | DHCP havuzu |

Hücresel / WAN (m1=modül, s1/s2=SIM yuvası):
| Anahtar | Anlam |
|---|---|
| `w1_wan_proto` | Connection Type (`m13gdhcp`=M1-DHCP, `m13g`=M1-PPP) |
| `w2_wan_proto` | Backup Link (`disabled` / `dhcp`) |
| `m1simswtch` | SIM Backup (`0`=Disable, `1`=Enable) |
| `mullinkfail` | Link Fail to Restart (dk) |
| `m1s1wanapn` / `m1s2wanapn` | APN |
| `m1s1pppuser` / `m1s1ppppwd` | SIM1 kullanıcı / parola |
| `m1s2pppuser` / `m1s2ppppwd` | SIM2 kullanıcı / parola |
| `m1s1simpin` / `m1s2simpin` | SIM PIN (nvram'da tutulur) |
| `w1_connfailsw` | Connect Fail |
| `w1_kponm` | Keep Alive (`1`=None, `7`=ICMP+) |
| `m1_pap_allowed` / `m1_chap_allowed` / `m1_chapms_allowed` / `m1_chapms_v2_allowed` | Authentication |
| `m1_tempture` / `m2_tempture` | Sıcaklık eşiği |

WLAN / servisler:
| Anahtar | Anlam |
|---|---|
| `wl0_net_mode` / `wl_net_mode` | WLAN radyo (`disabled`=kapalı, `mixed`=açık) |
| `wl_radio` | WiFi radyo |
| `sshd_enable` | SSH daemon (`0`=kapalı) |
| `http_lanport` / `telnet_lanport` | Yönetim portları (80 / 5123) |
| `time_zone` / `ntp_enable` / `ntp_server` | Saat / NTP |
| `reboot_enable` / `reboot_tm_h` / `reboot_tm_m` | Zamanlanmış reboot (varsayılan 03:00) |

Bulut / M2M (fabrikada açık; kontrol dışı sunuculara bağlanır):
| Anahtar | Anlam |
|---|---|
| `cloud_enable` / `cloud_servip` / `cloud_servport` | Bulut raporlama |
| `m2m_srvip` / `m2m_srvport` / `enable_m2m` | M2M sunucu |
| `encup_link` / `encup_mode` | Encup (alotcer) bağlantısı |
| `snmpd_rocommunity` / `snmpd_rwcommunity` | SNMP (daemon kapalı) |

Kapalı yetenekler (mevcut, `0`): DTU seri↔TCP köprüsü (`dtu_*`), OpenVPN /
PPTP / L2TP istemcileri, DDNS (`ddns_enable`), Python (`python_enable`).

## Araç komutları (CLI)

`node --env-file=.env ricon.js <komut>`

| Komut | İş |
|---|---|
| `dogrula` | Ortam/erişim teşhisi |
| `kesif` | Port + parmak izi + SNMP taraması (salt okunur) |
| `oku` | Her şeyi çek (sistem + SIM + ayar + nvram) |
| `konsol --nvram` | Telnet root: tam nvram |
| `sim` | SIM/hücresel özet (`--telefon 05...` ile MSISDN dışarıdan) |
| `izle --sure 60` | Fark tabanlı canlı alan tespiti |
| `degerlendir` | Durum + ne eksik (numara dahil, ~5 sn) |
| `numara` | Sadece telefon numarası (`AT+CNUM`) |
| `sim-kilit` | Sadece SIM kilidi + kalan hak (hak harcamaz) |
| `sim-pin-kaldir --pin 1234 [--uygula]` | SIM PIN kilidini kalıcı kaldır |
| `sim-pin-kilitle --pin 1234 [--uygula]` | PIN kilidi kur (sadece test) |
| `fark A.json B.json` | İki nvram anlık görüntüsü diff |
| `uygula [--uygula] [--profil saha\|fabrika]` | Provizyon (varsayılan kuru) |
| `hazirla [--telefon 05...] [--dongu]` | Tak-çalıştır: algıla → provizyon → doğrula |
| `sunucu [--port 8080] [--dinle 0.0.0.0] [--arayuz yok]` | HTTP API + UI |
| `olcum-elle --dk 15.5 --kim "..."` | Elle süreç kronometresi |
| `olcum --modem-sayisi 400` | Metrik özeti |

Ortak: `--host <ip>` · `--kaynak-ip <ip>` (.env'i ezer) · `--json <dosya>` ·
`--kaynak <dosya>` (kayıttan, cihazsız). stdout saf JSON; çıkış 0/1.

## HTTP API uçları (`ricon.js sunucu`)

| Uç | İş |
|---|---|
| `GET /api/durum` | Modem nerede, PC hazır mı (salt okunur) |
| `GET /api/degerlendir` | Durum + ne eksik + tekrar kararı (~5 sn) |
| `GET /api/hazirla?telefon=05...&pin=1234` | Provizyon (SSE) |
| `GET /api/fabrikaya-dondur` | Fabrika profiline geri al (SSE) |
| `GET /api/pin-kaldir?pin=1234` | SIM PIN kilidini kalıcı kaldır (SSE) |
| `GET /api/pin?pin=1234` | Sadece PIN dene (SSE) |
| `POST /api/olcum` | Süre ölçümü kaydet (JSON gövde) |

Aynı anda tek iş çalışır (cihaz tek bağlantılı); ikinci istek `MESGUL` alır.
