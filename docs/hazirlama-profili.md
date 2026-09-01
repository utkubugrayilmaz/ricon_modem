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
| LAN class | `lan_cclass` = `5.5.5.` | 🟢 ÇÖZÜLDÜ — **cihaz kendi türetiyor**, profile konmadı |

Tüm bu eşlemeler `src/settings.js` içindeki `FIELD_PROFILE`'a işlendi ve motor
(`node bin/ricon.js apply`) bunları uyguluyor. `lan_cclass` bilerek DIŞARIDA:
LAN IP değişince cihaz onu reboot'ta kendisi güncelliyor (aşağıdaki uçtan uca
testte gözlemle kesinleşti) — yazmak gereksiz risk.

## Uçtan uca test sonucu (2026-08-26)

Sıfır (fabrikaya döndürülmüş) cihazda tek komutla tam provizyon **başarıyla
çalıştı ve doğrulandı**:

```
node bin/ricon.js apply --profile field --apply --new-host 5.5.5.1 --new-source-ip 5.5.5.100
```

- Motor 12 anahtarı yazdı → reboot → cihaz **5.5.5.1**'de geldi → geri-oku
  doğrulama **TAMAM** (~30 sn).
- **Tam before/after diff: 13 değişen, 0 eklenen, 0 silinen.** 12'si profildeki
  anahtarlar; +1 `lan_cclass` (192.168.1.→5.5.5.) **cihazın kendi türettiği**
  (biz yazmadık). Başka hiçbir şeye dokunulmadı — **yan etki yok**.
- **`lan_cclass` bulgusu:** LAN IP değişince cihaz `lan_cclass`'ı reboot'ta
  otomatik günceller. Profile EKLENMESİNE GEREK YOK (gözlemle kesinleşti).
- **Idempotency:** 5.5.5.1'de tekrar `apply` → "zaten istenen durumda",
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
node bin/ricon.js provision
```

- Algıla (192.168.1.1) → 11 ayar + LAN IP yaz → reboot → 5.5.5.1'de doğrula →
  **durum: hazir (deneme 1)**. Elle müdahale yok.
- Tekrar `provision` → **zaten_hazir** (idempotent).
- Motor iki yönde de çalışıyor (saha ↔ fabrika), LAN IP + reboot + yeni-adres
  doğrulama dahil.

Çoklu modem: aynı ağda **tek modem** olmalı (hepsi 192.168.1.1'de gelir →
çakışma). `provision --loop` sıralı akış için: tak → otomatik → çıkar → sıradaki.

## İki yönlü tam test — 2026-08-27

Aynı ünitede, tek oturumda, **iki yönde** uçtan uca çalıştırıldı:

1. **Saha → fabrika** (`apply --host 5.5.5.1 --profile factory --apply
   --new-host 192.168.1.1 --new-source-ip 192.168.1.50`)
   12 anahtar default'a alındı → reboot → `192.168.1.1`'de doğrulama
   **TAMAM (15 sn)**. Kullanıcı arayüzden default hali **gözle teyit etti**.
2. **Fabrika → saha** (`provision --phone 5321234567`)
   11 ayar + LAN IP → reboot → `5.5.5.1`'de doğrulama **TAMAM**, durum
   **hazir (deneme 1)**, elle müdahale yok.
3. **Idempotency:** aynı komut tekrar → `zaten_hazir`, cihaza yazma yok.

### Bu testte ilk kez doğrulanan yenilikler
- **Hazırlama defteri:** her çalıştırma `data/provisioned.jsonl`'e bir satır
  yazdı; kimlik alanları cihazdan **canlı** geldi:
  `ICCID 8990XXXXXXXXXXXXXXX · IMEI 8671910XXXXXXXX ·
  MAC 00:0C:43:43:5F:4E · IMSI 28601XXXXXXXXXX · Turkcell`.
- **Telefon zorunluluğu:** `provision` numarasız başlamıyor (çekirdek kuralı);
  msisdn deftere işlendi.
- **`verify()` üç durum ayrımı:** 1. ve 2. denemede nvram okunamadı (cihaz
  boot ediyor → "gelmedi, bekle"), 3. denemede eksik sıfır → TAMAM. Eskiden
  ilk okunabilen nvram'da karar veriliyordu.
- **`--host` / `--source-ip`:** iki yönlü test `.env` dosyasına dokunmadan
  yapıldı.

### Hâlâ kanıtlanmayan tek şey
Seri (tak → çıkar → sıradaki) akış: `provision --loop` tek modemde çalışıyor,
**birkaç modemin ard arda** hazırlanması sahada denenmedi. İzlenecekler:
ARP önbelleği tazeliği, kablo çıkınca PC'deki ikincil IP'lerin geri gelmesi,
"çıkarıldı" tespitinin gecikmesi.

## DHCP Server + LAN ikincil alanlar (2026-08-27 eklendi)

Teknisyen iki eksik ayar bildirdi; ikisi de eklendi.

### DHCP Server → Disabled
Anahtar **diff ile teyit edildi**: arayüzde yalnızca "DHCP Server: Disabled"
+ Save yapıldı, nvram farkı **tek anahtar** gösterdi:

| Ayar (UI) | nvram | değer |
|---|---|---|
| DHCP Server Enabled | `lan_proto` | `dhcp` |
| DHCP Server **Disabled** | `lan_proto` | **`static`** |

(Diff'te ikinci satır `lan_cclass` çıktı — cihaz onu LAN IP'den kendi türetiyor,
önceki bulguyu doğruladı. Profile girmiyor.) Bonus: `lan_proto` kimliksiz
sayfada da görünüyor, yani parolasız doğrulanabilir.

### LAN → ikincil adreslerin tamamı sıfır
nvram adları arayüz etiketleriyle birebir:

| Arayüz | nvram | hedef |
|---|---|---|
| Local IP Address1 / Subnet Mask1 | `lan_ipaddr_ex1` / `lan_netmask_ex1` | `0.0.0.0` |
| Local IP Address2 / Subnet Mask2 | `lan_ipaddr_ex2` / `lan_netmask_ex2` | `0.0.0.0` |
| Local IP Address3 / Subnet Mask3 | `lan_ipaddr_ex3` / `lan_netmask_ex3` | `0.0.0.0` |

**DOKUNULMAYANLAR:** `lan_ipaddr` (5.5.5.1), `lan_netmask` (255.255.255.0),
Local DNS, Loopback IP + Mask — bunlar profile hiç girmiyor.

### Yazma sırası
`Modem/WAN → DHCP → LAN`, `lan_ipaddr` en sonda (`src/settings.js`
`WRITE_GROUPS`). **Dürüst not:** nvram yazımı sırasızdır, hiçbir değer
`commit` + reboot olmadan yürürlüğe girmez — sıra sonucu değiştirmez. Yine de
uygulanıyor çünkü (a) yazma yarıda kesilirse yönetim adresi en son değiştiği
için cihaz eski adreste bulunabilir, (b) plan ekranı teknisyenin sırasıyla akar.

Canlı sonuç: **14 ayar** (10 Modem/WAN + 1 DHCP + 3 LAN), doğrulama TAMAM 15 sn.

## SIM yokluğu — sessiz başarısızlık ve çözümü (2026-08-27)

**Gözlem:** SIM takılı OLMAYAN bir modemde provizyon sorunsuz tamamlandı,
doğrulama "TAMAM" dedi. Ama cihaz şebekeye kaydolamıyordu. 4 dakika izleme:

- WAN IP hiç gelmedi
- `m1simst`: `Invalid` → `Not Insert`
- `m1network`: `FDD LTE` → `N-NONE`, `m1bandinfo`: `BAND NONE`
- Modem ~110 saniyede bir kaydolmayı deneyip düşüyordu

Yani "hazır" denen modem sahada çalışmaz ve deftere **ICCID'siz** satır düşer.

**Çözüm:** `provisionModem` artık cihaz kimliğini **en başta** okuyor; ICCID
yoksa hiçbir şey yazmadan reddediyor (`durum: "sim_yok"`, `SIM_MISSING`).
Kural çekirdekte, yani UI/CLI/endpoint devralıyor. 45 saniye harcayıp sonunda
anlamak yerine ilk saniyede söylüyor.

**İkinci bulgu — reboot şartı:** SIM sonradan takılınca modem kendi kendine
toparlamıyor; `w1_wan_shortproto` `disabled` kalıyor. PPP oturumu ancak
**açılışta SIM takılıyken** kuruluyor. Operasyonel kural: **SIM'i tak, sonra
kurulumu başlat.** (Kurulum akışında zaten reboot var, o yüzden baştan takılı
SIM'de sorun çıkmıyor.)

## İnternet ne zaman geliyor? (2026-08-27 ölçüldü)

SIM + antenler takılı, provizyonlu cihaz, reboot sonrası:

```
  0 – 89 sn    internet YOK  (boot + şebekeye kaydolma + PPP)
 88.9 sn       internet VAR  178.245.239.236 (gerçek public Turkcell IP)
 89 – 259 sn   kesintisiz stabil, tek düşme yok
```

**Karar: kurulum interneti BEKLEMEZ.** Kurulum 45 sn; interneti beklemek onu
3 katına çıkarır ve o 89 saniye bizim kontrolümüzde değil (şebeke/anten/
kapsama). Doğrulama nvram geri-okumasıyla yapılıyor — hızlı ve deterministik.
İnternet kanıtı isteyen için ayrı/opsiyonel bir kontrol uygun olur.

Ayrıca: antensiz ölçümde sinyal `m1dbm` 81-85 iken antenler takılınca **69**
oldu; `9999` değeri "okuma yok" demek.

## SIM PIN — nasıl çalıştığı ÖLÇÜLDÜ (2026-08-27)

PIN kilitli bir SIM takıldı ve arayüzden (Modem/WAN → SIM1 → PIN) PIN girildi.
Ölçüm sonuçları:

| Gözlem | Sonuç |
|---|---|
| `Status of SIM` (kilitliyken) | `Need verification PIN code (PIN: 3/3, PUK: 10/10)` |
| PIN girildikten sonra | `OK`, IMSI okunabilir oldu, WAN IP geldi |
| **Reboot sonrası** | **`OK` kaldı**, internet 34.5 sn'de geldi |
| Reboot sonrası `nvram get m1s1simpin` | **PIN nvram'da DURUYOR** |
| `m1s1simpinpro` | `"0"` → `""` (anlamı belirsiz, biz DOKUNMUYORUZ) |

**Sonuç:** modem PIN'i nvram'a kaydediyor ve her açılışta SIM'e gönderiyor.
SIM hâlâ PIN'li ama operatör bir daha uğraşmıyor. Yani `applyPin`in yaptığı
şey (`nvram set m1s1simpin` + commit + reboot) **arayüzün yaptığının aynısı** —
mekanizma doğrulandı.

İki yol da geçerli:
- **PIN'i SIM'den kaldırmak** (telefonla): SIM her cihazda PIN'siz olur. En
  temiz son durum, CEO kararı da bu.
- **PIN'i modeme yazmak** (otomatik): telefon gerekmez, tek seferlik. SIM başka
  cihaza taşınırsa orada yine kilitli olur.

Araç PIN kilidini **~4 saniyede** tespit ettiği için PIN yalnızca gerçekten
kilitli SIM'lerde soruluyor; PIN'siz SIM'lerde hiç sorulmuyor.

### Açık kalan küçük belirsizlik
Reboot ÖNCESİ alınan tam nvram dökümünde `m1s1simpin` görünmüyordu, ama
`nvram get` aynı anda değeri veriyordu. Muhtemel açıklama: web arayüzü değeri
RAM'e yazıyor, commit reboot/apply anında oluyor. Kesinleştirilmedi; pratikte
sonucu etkilemiyor (reboot sonrası değer kalıcı).

## Araç kusuru bulundu ve düzeltildi: çok satırlı nvram değerleri

`nvram show` bazı değerleri **satır sonu içerecek şekilde** basıyor. Eski
ayrıştırıcı `=` içermeyen satırları **sessizce atıyordu**, yani böyle bir
değer ilk satırına kırpılıyordu — ve diff "değişmedi" diyebilirdi. Faz 2'nin
tamamı diff yöntemine dayandığı için bu sessiz bir yanlışlama riskiydi.

Kanıt: cihazda `nvram show | wc -l` = **1587**, bizim ayrıştırdığımız **1585**
anahtar. Düzeltmeden sonra: 1585 anahtar + 2 devam satırı = **1587**, hesap
tam kapanıyor. Tek çok satırlı değer `pptpd_client_mru` (3 satır).
