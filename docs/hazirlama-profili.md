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

## nvram anahtar eşlemesi (2026-08-26 diff ile TAMAMLANDI)
| Ayar (UI) | nvram anahtarı = hedef | Durum |
|---|---|---|
| Connection Type M1-PPP | `w1_wan_proto` = `m13g` | 🟢 diff (default m13gdhcp) |
| SIM Backup Disable | `m1simswtch` = `0` | 🟢 diff (default 1) |
| Link Fail to Restart 0 | `mullinkfail` = `0` | 🟢 diff (default 30) |
| APN (SIM1) | `m1s1wanapn` = `internet` | 🟢 diff |
| SIM1 user/pass temizle | `m1s1pppuser`=`""`, `m1s1ppppwd`=`""` | 🟢 diff (default "card") |
| SIM2 user/pass temizle | `m1s2pppuser`=`""`, `m1s2ppppwd`=`""` | 🟢 diff (default "card") |
| Connect Fail 0 | `w1_connfailsw` = `0` | 🟢 diff (default 10) |
| Keep Alive None | `w1_kponm` = `1` | 🟢 diff (default 7=ICMP+) |
| Authentication 4'lü | `m1_pap_allowed`/`m1_chap_allowed`/`m1_chapms_allowed`/`m1_chapms_v2_allowed` = `1` | 🟡 isim+değer+foto (nvram'da zaten 1; diff'lenemedi) |
| Backup Link Disabled | `w2_wan_proto` = `disabled` | 🟢 diff (default dhcp) |
| WLAN kapalı | `wl0_net_mode`/`wl_net_mode` = `disabled` | 🟢 diff |
| LAN IP | `lan_ipaddr` = `5.5.5.1` | 🟢 Faz1 canlı + ekran + nvram |
| LAN ikincil IP sil | `lan_ipaddr_ex1` = `0.0.0.0` | 🟢 nvram (default 192.168.8.1) |
| LAN class (belki) | `lan_cclass` = `5.5.5.` (?) | ⏳ apply anında doğrulanacak |

Tüm bu eşlemeler `src/profil.js` içindeki `SAHA_PROFILI`'ne işlendi. Motor
(`node ricon.js uygula`) bunları uygular; `lan_cclass` gerçek apply anında
(LAN IP değişince) doğrulanacak.

## Uçtan uca test sonucu (2026-08-26)

Sıfır (fabrikaya döndürülmüş) cihazda tek komutla tam provizyon **başarıyla
çalıştı ve doğrulandı**:

```
node ricon.js uygula --profil saha --uygula --yeni-host 5.5.5.1 --yeni-kaynak 5.5.5.100
```

- Motor 12 anahtarı yazdı → reboot → cihaz **5.5.5.1**'de geldi → geri-oku
  doğrulama **TAMAM** (~30 sn).
- **Tam before/after diff: 13 değişen, 0 eklenen, 0 silinen.** 12'si profildeki
  anahtarlar; +1 `lan_cclass` (192.168.1.→5.5.5.) **cihazın kendi türettiği**
  (biz yazmadık). Başka hiçbir şeye dokunulmadı — **yan etki yok**.
- **`lan_cclass` bulgusu:** LAN IP değişince cihaz `lan_cclass`'ı reboot'ta
  otomatik günceller. Profile EKLENMESİNE GEREK YOK (gözlemle kesinleşti).
- **Idempotency:** 5.5.5.1'de tekrar `uygula` → "zaten istenen durumda",
  0 değişiklik.
- **Erişim/kimlik:** provizyon + reboot sonrası 5.5.5.1'de erişim ve
  `riconadmin` / `<parola .env>` çalışmaya devam ediyor.

Sonuç: **Faz 3 çekirdeği kanıtlandı** — elle yapılan hazırlama süreci tek
komuta indi. Kalan: "tak-çalıştır" sarmalayıcı (link algıla → otomatik başlat),
retry/fallback cilası, PC-subnet adımını pipeline içine alma.

## Dress rehearsal — tam otomatik pipeline (2026-08-26)

Cihaz araçla fabrikaya döndürüldü (5.5.5.1→192.168.1.1, doğrulama TAMAM), sonra
**tek komut** ile sıfırdan tam otomatik provizyon:

```
node ricon.js hazirla
```

- Algıla (192.168.1.1) → 11 ayar + LAN IP yaz → reboot → 5.5.5.1'de doğrula →
  **durum: hazir (deneme 1)**. Elle müdahale yok.
- Tekrar `hazirla` → **zaten_hazir** (idempotent).
- Motor iki yönde de çalışıyor (saha ↔ fabrika), LAN IP + reboot + yeni-adres
  doğrulama dahil.

Çoklu modem: aynı ağda **tek modem** olmalı (hepsi 192.168.1.1'de gelir →
çakışma). `hazirla --dongu` sıralı akış için: tak → otomatik → çıkar → sıradaki.
