# nvram Notları — Ricon S9922M44 (kesin bulgular + adaylar)

Kaynak: canlı cihazdan `nvram show` (2026-08-26, 1560 anahtar).

**Okuma kuralı — çok önemli:**
- 🟢 **KESİN** = anahtar adı + değeri, bağımsız bir canlı ölçüm ya da
  fotoğrafla **çapraz doğrulandı**. Güvenle kullanılabilir.
- 🟡 **ADAY** = mantıklı görünüyor ama **HENÜZ DOĞRULANMADI**. Faz 2'de
  "web'de değiştir → nvram diff" ile teyit edilecek. **Otomasyonda kesin
  gibi kullanma.**

Sırlar (parola hash'i, WiFi PSK değeri) bu dosyaya **yazılmadı**; sadece
varlıkları not edildi.

---

## 🟢 KESİN bulgular (çapraz doğrulanmış)

### Kimlik / LAN
| nvram anahtarı | Değer | Neyle doğrulandı |
|---|---|---|
| `lan_ipaddr` | `192.168.1.1` | canlı `Info.live.htm` lan_ip |
| `lan_netmask` | `255.255.255.0` | canlı ölçüm |
| `et0macaddr` | `00:0C:43:43:5F:4E` | canlı lan_mac |
| `router_name` | `Industrial Cellular Router` | fotoğraftaki "Device Name" alanı + sayfa başlığı |

### Sıcaklık eşiği
| `m1_tempture` / `m2_tempture` | `75` | fotoğraftaki "Temperature Threshold Alarm 75°C" |

### Zaman
| `time_zone` | `+03` | Türkiye | 
| `ntp_enable` | `1` | NTP açık |
| `ntp_server` | `0.tr.pool.ntp.org` | — |

### Zamanlanmış reboot (ÖNEMLİ)
| `reboot_enable` | `1` | **açık** |
| `reboot_tm_h` | `3` | saat 03 |
| `reboot_tm_m` | `00` | dakika 00 |

→ Cihaz **her gün ~03:00'te kendini yeniden başlatıyor.** RVM için önemli:
sahadaki makine her gece kısa süre bağlantı kaybeder. (Anahtarlar kesin;
"günlük 03:00" yorumu bu üç anahtarın standart anlamı.)

### Yönetim portları
| `http_lanport` | `80` | canlı: web bu portta |
| `telnet_lanport` | `5123` | canlı: konsola bu porttan girdik |
| `telnet_wanport` | `5123` | — |
| `http_wanport` | `8088` | — |
| `http_redirect_port` | `3128` | — |
| `sshd_enable` | `0` | SSH daemon kapalı (canlı: 22 kapalı ✓) |
| `sshd_wanport` | `22` | (daemon kapalı olduğundan etkisiz) |

### WLAN
- `wl0_net_mode = disabled` → **WiFi fiilen kapalı** (canlı `wl_radio::Radio
  is Off` ile uyumlu). KESİN: şu an WiFi yayını yok.
- WiFi WPA-PSK kayıtlarda **zayıf bir varsayılan** taşıyor (değer güvenlik
  için buraya yazılmadı). WiFi kapalı olduğu için etki düşük.

### SNMP
- `snmpd_rocommunity=public`, `snmpd_rwcommunity=private` (varsayılanlar).
  Ama daemon canlıda cevap vermedi → **SNMP fiilen kapalı/erişilemez.**

---

## 🔒 Güvenlik bulguları (KESİN — sahadaki cihazlar için önemli)

1. **Uzaktan root telnet açık.** `remote_mgt_telnet=1`, `remote_ip_any=1`,
   `telnet_wanport=5123`. Konsolda **root** olduğumuzu doğruladık. Sahadaki
   bir cihaz public WAN IP alıyorsa (bizimki `31.140.x` aldı), **root telnet
   konsolu internetten herhangi bir IP'ye açık** olabilir. Firewall'ın 5123'ü
   WAN'da gerçekten açıp açmadığı cihazda teyit edilmeli; açıksa ciddi risk.
2. `remote_mgt_ssh=1` ama `sshd_enable=0` → SSH dinlemiyor (şimdilik risk yok).
3. Web paneli parola **hash'i** nvram yedeğinde duruyor → config yedeğini ele
   geçiren hash'i alır (offline kırma; parola ortak varsayılansa kolay).
4. WiFi WPA-PSK zayıf varsayılan (WiFi kapalı olduğundan düşük etki).

---

## 🟡 ADAY anahtarlar (Faz 2 diff ile DOĞRULANACAK — şu an kesin DEĞİL)

Bunları otomasyonda kesin kabul etme; her biri "web'de değiştir → nvram
diff" ile teyit edilecek. İsimlendirme: `m1/m2`=modül, `s1/s2`=SIM yuvası.
Aktif hat: modül m1, SIM1.

| Ayar (UI) | Aday nvram anahtar(lar)ı | Şu anki değer | Not |
|---|---|---|---|
| APN (SIM1) | `m1s1wanapn`, `m1s1wanapn_cst` | `internet` | s1/s2 ve _cst ayrımı belirsiz |
| WLAN aç/kapa | `wl0_net_mode` (ya da `wl_radio`) | `disabled` / `1` | iki anahtar çelişkili görünüyor; hangisini UI yazıyor? |
| DHCP havuzu | `dhcp_start=100`, `dhcp_num=2`, `dhcp_lease=1440` | — | değerler kesin, "hangi anahtarı UI yazıyor" doğrulanacak |
| Ana SIM / Connection Type (M1-PPP) / SIM Backup / Backup Link | net tek anahtar bulunamadı | — | tamamen Faz 2'ye bırakıldı |

---

## 🧩 Yetenekler (mevcudiyeti KESİN; çoğu şu an kapalı)

- **DTU (IP Modem / seri↔TCP köprüsü):** `dtu_ser1en=0` (seri port kapalı),
  `dtu_servport1=6002`, `dtu_servmode=5`, `dtu_conn_mode=1`. Cihaz bir seri
  cihazı TCP üzerinden köprüleyebiliyor — **"cihaza/cihazdan veri yollama"
  sorusunun donanım cevabı bu.** Şu an kapalı.
- **VPN istemcileri:** OpenVPN (`openvpn_enable=0`, `openvpncl_enable=0`),
  PPTP (`pptpd_client_enable=0`), L2TP (`l2tp_client_enable=0`) — hepsi
  mevcut, kapalı.
- **DDNS:** `ddns_enable=0` — mevcut, kapalı.
- **Python çalıştırma:** `python_enable=0` — cihaz Python script koşabiliyor,
  kapalı.

---

## Not: Faz 2 neden hâlâ gerekli?
Yukarıdaki 🟡 adaylar için nvram'a bakıp "APN şu anahtar" demek **tahmin**
olur. Web arayüzünde ayarı değiştirip nvram farkını almak, hangi anahtarın
(ve gerekiyorsa hangi "apply/servis restart"ın) değiştiğini **kesin**
söyler. Otomasyon (Faz 3) ancak bu doğrulamadan sonra güvenli yazar.
