# Hazırlama Profili — sahadaki gerçek kontrol listesi

Kaynak: default ↔ düzeltilmiş ekran görüntüsü kıyası (docs/1..4), kullanıcı
2026-08-26'da **teyit etti**. Faz 3 provizyon motoru **tam bu listeyi**
uygular; fazlasına dokunmaz.

## Pipeline hedefi (uçtan uca)
modem takılır → işlem başlar → **başarıya kadar** sürer (idempotent + retry;
yarıda kalırsa tekrar tamamlar) → biter → çıkar → sıradaki.

## Değiştirilen ayarlar (teyitli)

### Modem/WAN → Main Link
1. Connection Type: `M1-DHCP` → **`M1-PPP`**
2. SIM Backup: `Enable` → **`Disable`**
3. Link Fail to Restart: `30` → **`0`** dk
4. SIM1 User Name & Password → **temizle (boş)**
5. SIM2 User Name & Password → **temizle (boş)**
   (APN her ikisinde de `internet` — zaten öyle, değişmiyor)

### Modem/WAN → Others
6. Authentication → **PAP + CHAP + MS-CHAP + MS-CHAPv2** (4'ü de)
7. Connect Fail: `10` → **`0`**
8. Keep Alive: `ICMP+` → **`None`**

### Modem/WAN → Backup Link
9. Connection Type: `Automatic Configuration - DHCP` → **`Disabled`**

### LAN
10. Local IP: `192.168.1.1` → **`5.5.5.1`**  (EN SON — bağlantı kopar)
11. Local IP Address1 (ikincil): `192.168.8.1` → **`0.0.0.0`** (sil)

### PC tarafı (modem ayarı değil, pipeline adımı)
12. LAN 5.5.5.1 olduktan sonra PC'ye 5.5.5.x ikincil IP eklenir ki doğrulama
    yapılabilsin.

## Değişmeyenler (fabrikada zaten doğru)
Device Name (Industrial Cellular Router), MTU (Auto/1500), Main SIM (SIM1),
Network Mode (Auto), Register Band (Auto BAND), IP type (IPV4), IMS (Disable).

## WLAN
Bu ünitede WLAN fabrikada **kapalı** geldi; teknisyenin ekran kıyaslarında
WLAN sayfası yok. Yine de hedef durum WLAN=kapalı; motor bunu **idempotent**
uygular (zaten kapalıysa dokunmaz). Anahtar: `wl0_net_mode`+`wl_net_mode`
= `disabled` (diff ile doğrulandı).

## nvram anahtar eşlemesi (durum)
| Ayar | nvram anahtarı | Durum |
|---|---|---|
| WLAN kapalı | `wl0_net_mode`, `wl_net_mode` = disabled | 🟢 diff |
| APN | `m1s1wanapn` = internet | 🟢 diff |
| LAN IP | `lan_ipaddr` = 5.5.5.1 | 🟢 Faz1 + ekran |
| LAN ikincil IP | `lan_ipaddr1` (aday) = 0.0.0.0 | ⏳ diff'lenecek |
| Connection Type M1-PPP | ⏳ | ⏳ |
| SIM Backup Disable | ⏳ | ⏳ |
| Link Fail to Restart 0 | ⏳ | ⏳ |
| SIM1/2 user/pass temizle | ⏳ | ⏳ |
| Authentication 4'lü | ⏳ | ⏳ |
| Connect Fail 0 | ⏳ | ⏳ |
| Keep Alive None | ⏳ | ⏳ |
| Backup Link Disabled | ⏳ | ⏳ |

⏳ olanlar: Modem/WAN sayfasının tüm değişiklikleri tek Save ile yapılıp
nvram diff'i alınarak toplu ve kesin eşlenecek (aşağıki adım).
