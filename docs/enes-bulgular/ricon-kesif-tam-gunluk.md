# Ricon S9922M44-DOA / Quectel EC200A — Tam Keşif Günlüğü

> **Bu doküman kimin için:** Başka bir AI ajanı (veya mühendis) bu dokümanı okuyarak,
> sıfırdan başlayıp bizim vardığımız noktaya tekrar varabilmelidir. Bu yüzden sadece
> sonuçlar değil, **verilen her komut, alınan her çıktı, denenip başarısız olan her
> yöntem ve bunlardan çıkarılan dersler** kayıtlıdır. "Şunu yapın" değil, "şunu denedik,
> şu oldu, şu yüzden şuna geçtik" mantığıyla yazılmıştır.

---

## 0. Bağlam ve Nihai Amaç

**Senaryo:** Bir firma, sahadaki DIM'lere (uzak saha noktaları) endüstriyel hücresel
router'lar kuruyor. Her router'a bir Turkcell SIM takılıyor. Kurulum ekibi şu an SIM'in
telefon numarasını kartın plastiğine bakıp elle giriyor. Amaç: bu süreci otonom hale
getirmek — "start" butonuna basmak dışında insan müdahalesi olmasın, operatöre (Turkcell)
bağımlılık olmasın, yıllarca farklı modem modelleriyle çalışsın.

**Mevcut uygulama (Bugra'nın aracı):** Node.js tabanlı bir provizyon aracı. Modemi bilinen
IP'lerde (fabrika: 192.168.1.1, saha: 5.5.5.1) TCP probe ile bulur; MAC/ICCID/IMEI okur;
SIM yoksa/PIN'liyse durur; numarayı SIM'den AT komutuyla okur; nvram ayarlarını istenen
profille karşılaştırıp sadece farkı yazar; reboot; doğrulama; JSONL'e kayıt. Üç kanal:
HTTP (okuma), telnet konsol (nvram yazma), telnet AT (modül). Polling tabanlı, idempotent,
varsayılan dry-run (`--uygula` ile gerçek yazma). NOT: Bu keşifteki cihaz 192.168.8.1'de
çıktı, uygulamanın aradığı IP'lerden farklı — yani IP bile sabit varsayılamıyor.

**Bu keşfin amacı:** Uygulamaya geçmeden önce cihazın TÜM okunabilir verilerini ve
yeteneklerini envanterlemek (fizibilite). "Neyi yapabiliyoruz, neyi yapamıyoruz, neyi
hangi koşulla yapabiliyoruz" sorusuna kanıtlı cevap üretmek.

---

## 1. Cihaz Kimliği (doğrulanmış)

| Parametre        | Değer                             | Nasıl öğrenildi                  |
| ---------------- | ---------------------------------- | ----------------------------------- |
| Router modeli    | S9922M44-DOA                       | Web arayüzü System Info sayfası  |
| Router seri no   | M44DOA2603280929                   | Web arayüzü                       |
| Router firmware  | 21.05.4(8171)-ricon                | Web arayüzü + telnet login banner |
| Router OS        | Linux 2.6.36 (BusyBox), MIPS       | `cat /proc/version`               |
| Router SoC       | MediaTek MT7628, MIPS 24Kc V5.5    | `cat /proc/cpuinfo`               |
| Hücresel modül | Quectel EC200A                     | `AT+CGMI` + `AT+CGMM`           |
| Modül firmware  | EC200AEUHAR01A30M16 (EU varyantı) | `ATI` / `AT+CGMR`               |

**Not — "DOA" vs "LTE" karışıklığı:** Cihaz etiketinde "S9922M44-DOA" yazıyor; üreticinin
web sitesinde aynı ürün "S9922M44-LTE" olarak geçiyor. "LTE" katalog/teknoloji etiketi,
"DOA" ise varyant kodu. Aynı temel cihaz. Modül kimliği tahminle değil `ATI` ile
kesinleştirildi.

**Resmi belgeler:**

- Quectel EC200A AT Commands Manual v1.4: https://edgehax.com/wp-content/uploads/2025/12/Quectel_EC200A_AT_Command_Manual_v1-4.pdf
- EC200x AT Manual v1.2: https://kb.unipi.technology/_media/en:hw:007-patron:quectel_ec200x_eg912y_eg915n_series_at_commands_manual_v1.2.pdf
- Ricon S9922M Series user manual: https://www.manualslib.com/manual/2116988/Ricon-S9922m-Series.html

---

## 2. Erişim: Modemin İçine Girmek

### 2.1 Web arayüzü

- Adres: http://192.168.8.1 (LAN)
- Giriş: riconadmin / (cihaz şifresi)
- System Info, Modem/WAN, Network, System > Management gibi menüler var.
- Modem/WAN sayfası SIM durumunu (PIN, IMSI, sinyal) gösterir ama **telefon numarasını göstermez**.

### 2.2 SSH — DENENDI, BAŞARISIZ

```
ssh root@192.168.8.1     → connect to host 192.168.8.1 port 22: Connection refused
ssh admin@192.168.8.1    → aynı hata
```

**Sebep (sonradan bulundu):** Web arayüzü System > Management sayfasında
"Secure Shell / SSHd: Disable" idi. SSH servisi kapalı. 22. port dinlenmiyor.

### 2.3 Telnet — BAŞARILI (ama standart olmayan port)

İlk denemeler:

```
telnet 192.168.8.1       → Windows PowerShell'de "telnet is not recognized"
```

**Sorun 1:** Windows'ta telnet istemcisi kurulu değil. Çözüm (yönetici PowerShell):

```
dism /online /Enable-Feature /FeatureName:TelnetClient
```

DİKKAT: Bu komut normal PowerShell'de "Error: 740 Elevated permissions required" verir.
Mutlaka **yönetici olarak** açılmış PowerShell gerekir. Alternatif: PuTTY (kurulum gerektirmez).

**Sorun 2:** Telnet standart 23 portunda değil. System > Management sayfasında görüldü:
"Telnet: Enable, Port: 5123 (Default: 23)". Yani port elle 5123'e alınmış.

```
telnet 192.168.8.1 5123
# login: riconadmin
# Password: ****
# → riconadmin@Industrial Cellular Router:~#   (BusyBox Linux shell)
```

Bu prompt = modemin içindeki Linux kabuğu. AT komutları BURADA çalışır, Windows
PowerShell'de DEĞİL. (Bu karışıklık birkaç kez yaşandı: kullanıcı AT komutlarını
yanlışlıkla PowerShell'e yazdı, "exec/printf not recognized" hataları aldı.)

**Ders (otomasyon için):** SSH kapalı olabilir, Telnet portu 23 olmayabilir. Doğru portu
tahmin etmek yerine web arayüzü (her zaman açık 80. port) System > Management sayfasından
okumak en kesin yol. Bu cihazda açık portlar (`netstat -tln`): 5123 (telnet), 80 (http),
53 (dns).

---

## 3. SIM PIN Meselesi

İlk durumda Modem/WAN sayfası: "Status of SIM: Need verification PIN code (PIN: 3/3,
PUK: 10/10)". SIM PIN kilitliydi → IMSI boş, sinyal -9999, modül SIM'i okuyamıyor.

**Çözüm:** Web arayüzü Network > Modem sayfasındaki PIN alanına PIN girildi. Sonra
Status of SIM → "OK", IMSI doldu (286016661025441 → 286=TR, 01=Turkcell).

**PIN okunabilir mi? — HAYIR (araştırıldı, kesin):** SIM PIN'i modülden/karttan OKUNAMAZ.
PIN SIM çipinin güvenli alanında tutulur, dışarı verilmez; SIM sadece "doğru/yanlış" der.
Bu tasarımın güvenlik temelidir. PIN otomasyonu için tek yol: ICCID (PIN'liyken de okunur)
→ ICCID-PIN eşleşme listesi (operatörden) → `AT+CPIN="xxxx"` → `AT+CLCK="SC",0,"xxxx"` ile
PIN'i kalıcı kapat. Ama bu operatör bağımlılığı gerektirir; kullanıcı bunu istemiyor.
Pratik öneri: SIM'ler Turkcell'den PIN'i kapalı (disabled) istenmeli.

---

## 4. AT Portunu Bulmak — EN ÇOK UĞRAŞTIRAN KISIM

### 4.1 Portlar listelenince kafa karışıklığı

```
ls /dev/ttyUSB*
# /dev/ttyUSB0 ... /dev/ttyUSB10  (11 tane!)
```

11 port göründü ama çoğu ÖLÜ. Ayrım `ls -la` ile yapıldı:

```
ls -la /dev/ttyUSB*
# crw-rw----  ... Aug 28 09:33 /dev/ttyUSB0   ← 'c' + güncel tarih = CANLI
# crw-rw----  ... Aug 28 09:33 /dev/ttyUSB1   ← CANLI
# crw-r--r--  ... Jan  1 1970  /dev/ttyUSB2   ← 1970 tarihi = ÖLÜ
# ... (USB3-USB10 hepsi 1970 = ölü)
```

**Ders 1:** Sadece bugünün tarihli portlar canlıdır. 1970 tarihliler eski/ölü düğümlerdir.

### 4.2 "No such device" ve ölü dosya tuzağı

Ölü porta yazma denendi:

```
cat /dev/ttyUSB2 & echo -e "AT+CNUM\r" > /dev/ttyUSB2
# → can't create /dev/ttyUSB2: No such device
```

Daha kötüsü: bir noktada `exec 3<>/dev/ttyUSB1` yazıldığında port o an yoktu ve sistem
oraya BOŞ BİR DOSYA yarattı. Sonraki `ls -la`:

```
-rw-r--r--  ... 2640 Aug 28 09:39 /dev/ttyUSB1   ← '-' ile başlıyor = artık DOSYA, port değil!
```

Bu ölü dosya `AT` komutuna bir kez sahte "OK" bile döndürdü (aslında modülden değil,
dosyaya yazıp okumaktan). **Ders 2:** Porta yazmadan önce `ls -la` çıktısında satırın
`c` (character device) ile başladığı doğrulanmalı. `-` ile başlıyorsa o ölü dosyadır,
silinip (`rm`) gerçek port yeniden tespit edilmeli.

### 4.3 Port sürekli DEĞİŞİYOR

Modül her reset/yeniden bağlanmada farklı ttyUSB'ye taşındı. Farklı oturumlarda AT portu:
ttyUSB0, sonra ttyUSB1, sonra ttyUSB2 oldu. Güncel portu bulmanın kesin yolu:

```
dmesg | grep "attached to ttyUSB" | tail -1
# → usb 1-1: GSM modem (1-port) converter now attached to ttyUSB1
```

dmesg çıktısındaki (option sürücüsü) log ayrıca şunu gösterdi: modül 1.3 ve 1.4
arayüzlerini iki seri porta bağlıyor; 1.0 arayüzü cdc_ether (usb0 = WAN veri).
**Ders 3:** Port sabit YAZILMAMALI. Her işlemde `dmesg`+`ls -la` ile canlı port yeniden
bulunmalı. dmesg "ttyUSB1" dese bile bazen o port sessiz kalıp asıl cevap veren ttyUSB0
oldu → birden fazla canlı port varsa her birine `AT` gönderip `OK` döneni seçmek gerekir.

### 4.4 Doğru okuma tekniği (ÇALIŞAN yöntem)

`echo > port` + ayrı `cat port` yöntemi bu modemde GÜVENİLMEZ (port açılıp kapanınca DTR
düşüyor, cevap kaçıyor). ÇALIŞAN yöntem — portu tek fd ile açık tutmak:

```sh
exec 3<>/dev/ttyUSB1                              # portu R/W aç, açık tut
while read -t 1 x <&3; do :; done                 # eski kalıntıları temizle (ÖNEMLİ)
printf "AT+CNUM\r" >&3                             # komut gönder, \r ŞART
sleep 2                                            # modül cevap hazırlasın
while read -t 3 line <&3; do echo "[$line]"; done  # cevabı oku ([] ile boş/dolu ayırt edilir)
exec 3<&-                                          # portu kapat
```

NOT: `timeout` komutu bu BusyBox'ta YOK (`timeout: not found`). Onun yerine `sleep` +
`read -t` kullanıldı.

**Ders 4:** Toplu komut yapıştırınca (birden fazla komut art arda) terminal satırları
karışıyor, cevaplar iç içe geçiyor. Kritik komutlar TEK TEK gönderilmeli. Ayrıca porta
önceki denemelerden kalıntı birikiyor → her komut öncesi `while read -t 1 x` ile boşaltmak
şart, yoksa eski cevaplar yeni cevaba karışıyor (örn. "Quectel...OK...ATM...OK" gibi
üst üste binmiş çıktılar görüldü).

### 4.5 Modül kararsızlığı / reset döngüsü

Antensizken modül sık sık USB'den kopup yeniden bağlandı (dmesg'de disconnect/reconnect
zinciri; watchdog sayacı "USER WDG(GPIO)" sıfırlanması = cihaz/modül reset göstergesi).
Bu sırada AT komutları boş döndü. **Sebep büyük olasılıkla anten yokluğu:** modül şebeke
bulamayınca watchdog onu resetliyor. Çözüm: 20-30 sn bekle, portu yeniden tespit et, önce
tek `AT` → `OK` doğrula, sonra asıl komuta geç. Anten takılınca kararsızlık kayboldu.

---

## 5. MODÜL VERİLERİ — Komut / Çıktı Kayıtları

Aşağıdaki tüm çıktılar `exec 3<>` yöntemiyle, modül ANTENLİ ve şebekeye kayıtlıyken alındı
(aksi belirtilmedikçe). Port o oturumda ttyUSB1'di.

### 5.1 Kimlik

```
ATI          → Quectel / EC200A / Revision: EC200AEUHAR01A30M16
AT+CGMR      → EC200AEUHAR01A30M16
AT+CGSN      → 867191084842565                (modül IMEI)
AT+CPIN?     → +CPIN: READY                   (SIM kilidi açık)
AT+CNUM      → +CNUM: "","+905350634693",145  (telefon no — ANTENLİYKEN)
AT+QCCID     → +QCCID: 8990011626160054295F   (SIM seri no / ICCID)
AT+CIMI      → 286016661025431                (IMSI: 286=TR, 01=Turkcell)
```

### 5.2 Şebeke / Sinyal (antenli, kayıtlı)

```
AT+CSQ       → +CSQ: 20,99                     (sinyal 20/31 = iyi; 99=bilinmiyor)
AT+CESQ      → +CESQ: 37,99,255,255,21,38      (RSRQ 21, RSRP 38)
AT+COPS?     → +COPS: 0,1,"Tcell",7            (Turkcell, 7=LTE)
AT+QSPN      → +QSPN: "Turkcell","Tcell","Turkcell",0,"28601"
AT+QNWINFO   → +QNWINFO: "FDD LTE","28601","LTE BAND 3",1795
AT+CREG?     → +CREG: 0,1                       (kayıtlı, ev şebekesi)
AT+CEREG?    → +CEREG: 0,1                      (LTE kayıtlı)
AT+CGREG?    → +CGREG: 0,1                      (paket kayıtlı)
AT+CGATT?    → +CGATT: 1                        (pakete bağlı)
AT+QENG="servingcell" → +QENG: "servingcell","NOCONN","LTE","FDD",286,01,70D02B,455,1795,3,3,3,1811,-100,-10,-73,16,23
                       (hücre ID 70D02B, RSRP ~-73 dBm)
```

### 5.3 Konfigürasyon / Sistem (antenli)

```
AT+CGDCONT?  → +CGDCONT: 1,"IP","internet","0.0.0.0"...     (APN: internet)
                +CGDCONT: 8,"IPV4V6","IMS",...              (IMS = VoLTE)
AT+CGACT?    → +CGACT: 1,1 / 8,0                (bağlam 1 aktif)
AT+CGPADDR   → +CGPADDR: 1,"178.245.168.167"    (operatör IP)
AT+CGCONTRDP → ...178.245.168.167...213.74.0.4...213.74.1.4  (IP + Turkcell DNS)
AT+CFUN?     → +CFUN: 1                          (tam fonksiyon modu)
AT+QTEMP     → +QTEMP: 34,255,255               (modül sıcaklığı 34°C)
AT+CCLK?     → +CCLK: "26/08/28,08:06:42+12"    (şebeke saati — kayıt sonrası DOĞRU)
AT+QCFG="band"       → +QCFG: "band",0xd3,0x1a0080800d5
AT+QCFG="nwscanmode" → +QCFG: "nwscanmode",0    (0=otomatik 2G/3G/4G)
```

### 5.4 SMS yeteneği (sadece sorgu; mesaj GÖNDERİLMEDİ)

```
AT+CSMS?     → +CSMS: 0,1,1,1                   (SMS servisi destekleniyor)
AT+CMGF?     → +CMGF: 0                          (PDU modu; metin için =1)
AT+CPMS?     → +CPMS: "SM",0,35                  (SIM'de 0/35 mesaj)
AT+CSCA?     → +CSCA: "+905329010000",145        (Turkcell SMSC)
```

Donanım SMS'e hazır. Fiili gönderim hattın SMS'e açık olmasına bağlı (M2M'de kapalı olabilir).

### 5.5 GPS / Konum — DENENDI, YOK (kesin)

```
AT+QGPS?                      → ERROR
AT+QGPSCFG="gnssconfig"       → ERROR
AT+CGPS?                      → ERROR
AT+QGPSLOC?                   → ERROR
```

Dört komut da ERROR döndü → **EC200A'da GNSS/GPS donanımı YOK.** Kesin, test edilmiş.
Kaba konum yalnızca baz istasyonu ID'sinden (`AT+QENG servingcell`, hücre 70D02B) +
harici bir hücre-konum veritabanıyla mümkün; bölge/mahalle hassasiyeti.

### 5.6 AT+CLAC — DESTEKLENMİYOR

```
AT+CLAC      → ERROR
```

Modül desteklenen komut listesini dökmüyor. Komutlar tek tek test edilerek keşfedildi.

---

## 6. EN KRİTİK BULGU: Numara ↔ Şebeke Kaydı İlişkisi

**Çelişki:** İlk denenen SIM'de `AT+CNUM` → `+CNUM: "","+905350634756",145` (dolu) geldi.
Başka bir SIM'de (ICCID 8990011626160054295F) `AT+CNUM` → `+CNUM:` (BOŞ) döndü. Aynı boş
dönen SIM'e sonradan ANTEN takılınca `AT+CNUM` → `+905350634693` (doldu).

**Açıklama:** Telefon numarası (MSISDN) her SIM çipinde yazılı DEĞİLDİR.

- Numara çipe yazılıysa → `AT+CNUM` doğrudan SIM'den okur, şebeke gerekmez.
- Numara çipe yazılı değilse → modül numarayı ancak ŞEBEKEYE KAYITLIYKEN operatörden
  öğrenir. Antensiz/kayıtsızken (`+CEREG: 0,0`, `+QNWINFO: NO SERVICE`, servingcell
  "SEARCH") numara bilinmez → `+CNUM` boş döner.

**Kanıt zinciri:**

| Durum               | CEREG | QNWINFO        | CNUM          |
| ------------------- | ----- | -------------- | ------------- |
| Antensiz            | 0,0   | NO SERVICE     | boş          |
| Antenli (aynı SIM) | 0,1   | FDD LTE Band 3 | +905350634693 |

**Otomasyon kuralı (ZORUNLU):**

1. `AT+CPIN?` → READY
2. `AT+CEREG?` → `0,1` veya `0,5` olana kadar BEKLE (şebeke kaydı; birkaç sn aralıkla
   sorgula, örn. 60 sn timeout)
3. ANCAK ONDAN SONRA `AT+CNUM` sor
4. Yine boşsa → `AT+QCCID` (ICCID) her zaman benzersiz kimlik verir (yedek)

Sahadaki modemler antenli+kayıtlı olacağı için numara güvenilir gelir. Boş dönme sorunu
esasen antensiz test ortamına özgü.

**AÇIK KALAN DOĞRULAMA:** Bugra'nın uygulamasının numarayı tam olarak hangi komutla
(AT+CNUM mi, AT+CPBR rehber mi, Quectel'e özel mi) okuduğu KOD'dan teyit edilmedi.
Kullanıcı "uygulama bu SIM'den numarayı aldı" dedi ama biz `AT+CNUM`'u antensizken boş
gördük — çelişkiyi netleştirmek için Bugra'nın numara-okuma kod satırı görülmeli.
Ayrıca `AT+CPBS="ON"`/`AT+CPBR=1` (rehber "own number") denendi ama port o an sessiz
olduğu için sonuç alınamadı; antenli+stabil modülde tekrar denenebilir.

---

## 7. ROUTER (Linux) TARAFI — Komut / Çıktı Kayıtları

Modülden bağımsız, router'ın kendisi. Telnet Linux kabuğunda çalıştırıldı.

### 7.1 Sistem sağlığı

```
cat /proc/version → Linux version 2.6.36 ... #1 Mon Mar 23 2026
uptime            → up 1:12, load average: 0.09, 0.06, 0.07
free              → Mem: 60408 total, 25328 used, 35080 free  (RAM ~60MB, rahat)
df -h             → rootfs 9.6M %100 dolu (salt-okunur firmware, NORMAL)
                     /etc/exdisk 3.0M %18 (2.4M boş = asıl yazılabilir alan)
cat /proc/cpuinfo → system type: MT7628, cpu model: MIPS 24Kc V5.5
```

**Not:** Kök %100 dolu paniğe gerek yok (sıkıştırılmış firmware imajı). Yazılabilir alan
çok kısıtlı (birkaç MB) → cihazda log biriktirilemez, saha izleme verisi merkeze
gönderilmeli.

### 7.2 Çalışan servisler (`ps`)

```
telnetd -p 5123     → telnet servisi (port teyidi)
redial              → hücresel dialer (modülü bağlı tutar)
httpd -p 80 (x2)    → web sunucusu
dnsmasq             → DNS+DHCP
udhcpc -i usb0      → WAN IP'yi modülden alan DHCP istemcisi
checksignal         → SİNYAL İZLEME servisi (Ricon zaten sinyali izliyor)
m2mgps              → M2M/GPS servisi (GPS yok ama servis var — kaba konum olabilir)
m2mcloud            → BULUT bağlantı servisi (uzaktan izleme/yönetim)
process_monitor     → çöken servisi yeniden başlatır
wland, cron, resetbutton, ledctl, exboard, ubusd, syslogd, klogd
```

### 7.3 Ağ yapılandırması

```
ifconfig:
  br0:1  → 192.168.8.1   (LAN, yönetim adresi)
  usb0   → 178.245.168.167 mask 255.255.0.0  (WAN, Turkcell'den)
  vlan1/eth2 → fiziksel Ethernet (köprülü)
route -n:
  0.0.0.0 → gateway 178.245.168.88 dev usb0  (internet çıkışı modül üzerinden)
  192.168.1.0 VE 192.168.8.0 ikisi de tanımlı (fabrika+saha arası durum)
netstat -tln (dinleyen portlar):
  0.0.0.0:5123 (telnet), 0.0.0.0:80 (http), 0.0.0.0:53 (dns)
```

**Güvenlik notu:** Portlar 0.0.0.0'da dinliyor = WAN'a da açık olabilir. Telnet şifresiz

+ WAN'a açık = risk. (Pratikte Turkcell IP'si dinamik/NAT arkası olduğu için dışarıdan
  erişim yine kısıtlı, ama sahaya çıkmadan Telnet WAN'dan kapatılmalı ya da SSH'a geçilmeli.)

### 7.4 nvram — BULUT / M2M / İZLEME AYARLARI (en önemli router bulgusu)

```
nvram show | grep -i -E "m2m|cloud|server":
  cloud_enable=1                                    ← BULUT RAPORLAMA AÇIK
  cloud_heartenable=1                               ← kalp atışı açık
  cloud_servip=78.186.62.169   cloud_servport=7001  ← bulut sunucu (Türk Telekom IP aralığı)
  m2m_srvip=58.215.16.142      m2m_srvport=15695    ← M2M sunucu (ÇİN IP aralığı)
  encup_link=server.alotcer.com,28035               ← Alotcer sunucu (başka marka!)
  encup_mode=1  encup_hearttime=60                  ← Alotcer bağlantısı açık, 60sn
  m2m_heartint=30                                    ← M2M her 30sn sinyal
  cloud_heart_tm=8
  m2m_devnum=00EE0000000100000007                   ← cihazın M2M kimliği
  ntp_server=0.tr.pool.ntp.org
```

### 7.5 Fiili bağlantı durumu (CANLI yakalandı)

```
netstat -tn:
  192.168.8.1:5123 → 192.168.8.70:62320  ESTABLISHED   (bizim telnet oturumu)
  178.245.168.167:43460 → 78.186.62.169:7001  SYN_SENT   (buluta bağlanmaya ÇALIŞIYOR)
cat /tmp/.cloudst → Closed                              (bulut bağlantı durumu: KAPALI)
```

**YORUM:** `cloud_enable=1` ama durum "Closed" ve netstat "SYN_SENT" → cihaz bulut
sunucusuna bağlanmaya AKTİF olarak çalışıyor ama sunucu erişilemez (cevap yok). Cihaz
30-60 sn aralıklarla üç ayrı dış sunucuya (TR IP, Çin IP, alotcer.com) boşuna bağlanmayı
deniyor.

**İKİ YÖNLÜ SONUÇ:**

- FIRSAT: Saha izleme altyapısı cihazda HAZIR ve çalışır. `cloud_servip`/`m2m_srvip`
  kendi sunucunuza çevrilirse tüm filo otomatik 30sn'de bir rapor verir. Sıfırdan sistem
  kurmaya gerek yok — bu, NAT/dinamik-IP engelini aşan "içeriden dışarıya bağlan" modeli.
- RİSK: Şu an her modem, kontrol dışı yurt içi/yurt dışı (Çin dahil) sunuculara sürekli
  bağlanmaya çalışıyor. Güvenlik/gizlilik (KVKK, kritik altyapı) açısından üstlere
  bildirilmeli; sahaya çıkmadan kapatılmalı ya da kendi sunucuya yönlendirilmeli.

`m2m_net_proto=1`, `snmp_trap_interval=300` gibi ek ayarlar da var (SNMP ile izleme de
mümkün olabilir — araştırılmadı).

---

## 8. YETENEK ENVANTERİ (fizibilite özeti)

### A) Kanıtlanmış — bugün fiilen yapıldı

- Telnet/CLI erişimi (port 5123)
- Modül kimliği: ICCID, IMSI, IMEI, telefon no (kayıtlıyken), PIN durumu
- Şebeke: operatör, kayıt durumu, teknoloji/bant, baz istasyonu
- Bağlantı sağlığı: WAN IP, paket bağlantısı, DNS
- Anlık teşhis: sinyal gücü/kalitesi, modül sıcaklığı
- SMS donanım desteği (sorgu ile teyit)
- Router: sistem sağlığı, ağ yapılandırması, çalışan servisler, nvram okuma

### B) Mümkün ama koşullu

- SMS gönder/al → hattın SMS'e açık olması gerek (Turkcell)
- Numara okuma (yazılı olmayan SIM'de) → anten + şebeke kaydı gerek
- Kaba konum → baz istasyonu ID + harici konum veritabanı gerek
- Saha izleme (bulut) → nvram sunucu ayarları kendi sunucuya yönlendirilmeli
- Uzaktan erişim → sabit public IP veya VPN veya bulut (dinamik IP ile doğrudan olmaz)

### C) Bu donanımda YAPILAMAZ (kanıtlı sınırlar)

- GPS ile hassas konum → EC200A'da GNSS yok (4 komut ERROR verdi)
- Sesli arama → ses donanımı yok (data-only modül)
- Cihazda büyük log biriktirme → yazılabilir alan birkaç MB

---

## 9. OTOMASYON İÇİN TASARIM DERSLERİ (uygulamaya geçilirse)

1. **IP sabit değil** — cihaz 192.168.8.1'de çıktı; uygulama 192.168.1.1/5.5.5.1 arıyor.
   Erişim keşfi esnek olmalı.
2. **Erişim kanalı zinciri** — SSH (varsa, güvenli) → Telnet (bilinen+alternatif portlar) →
   HTTP (80, her zaman açık, servisi açtır/oku). Telnet tek kanal olmamalı (şifresiz + port
   değişken + kapalı gelebilir).
3. **Port keşfi** — AT portu için: `dmesg | grep "attached to ttyUSB" | tail -1` + canlı
   port doğrulama (`ls -la`, satır `c` ile başlamalı) + her canlı porta `AT` gönderip `OK`
   döneni seç. ASLA sabit port yazma.
4. **Ölü dosya koruması** — porta yazmadan önce character device olduğunu doğrula.
5. **Açık-tut okuma** — `exec 3<>` yöntemi; `echo`/`cat` ayrı ayrı güvenilmez. Her komut
   öncesi portu boşalt. Komutları tek tek gönder (toplu = karışma).
6. **Şebeke kaydı bekle** — numara/saat gibi bilgiler kayıt sonrası gelir. `AT+CEREG?`=0,1
   olmadan `AT+CNUM` sorma.
7. **Kararsızlık/retry** — reset sonrası 20-30sn bekle, `AT`→`OK` doğrula, tek deneyip
   pes etme, yeniden dene. Modül antensizken watchdog resetleyebilir.
8. **ICCID = en sağlam kimlik** — numara bazen yok, ICCID her zaman var; kart takibinde
   numaradan güvenilir.
9. **nvram = router ayar defteri** — asıl yapılandırma (IP, APN, mod) buraya yazılıyor.
   `nvram show` ile tümü okunur. Bugra'nın uygulaması buraya yazıyor.

---

## 10. DEVAM EDEN ARAŞTIRMA — Sıradaki Adımlar (henüz yapılmadı)

- **nvram tam dökümü:** `nvram show` çıktısının tamamı incelenmeli (yüzlerce anahtar).
  Bugra'nın hangi anahtarları yazdığını ve tüm yapılandırma yüzeyini görmek için.
- **m2mcloud protokolü:** Bulut servisinin tam ne raporladığı (sinyal? konum? durum?) ve
  kendi sunucuya yönlendirilip yönlendirilemeyeceği araştırılmalı.
- **checksignal çıktısı:** Sinyal izleme servisinin verisini nereye yazdığı bulunmalı
  (hazır izleme kaynağı olabilir). `/tmp/.logfile` grep denendi, sinyal satırı bulunamadı.
- **m2mgps servisi:** GPS yokken bu servis ne yapıyor? Kaba konum üretiyor mu?
- **SSH açma:** Web arayüzünden SSH açılıp standart güvenli kanal yapılabilir mi test.
- **Bugra'nın kodu:** Numara okuma yöntemi + hangi nvram anahtarlarını yazdığı teyit.
- **AT+CPBR:** Rehber "own number" alanı, antenli+stabil modülde tekrar denenmeli.
- **Farklı modem modeli:** Envanterin başka Ricon/başka marka modellerde de geçerliliği.

## 11. BULUT RAPORLAMA (m2mcloud) — Detaylı İnceleme ve Canlı Yakalama

### 11.1 Web arayüzü karşılığı

nvram'daki bulut ayarlarının web karşılığı: **Monitoring > Cloud Service** sayfası.
Terminal (nvram) ve panel aynı ayarları gösteriyor:

| Web arayüzü alanı | Değer           | nvram karşılığı               |
| -------------------- | ---------------- | ---------------------------------- |
| Cloud Service        | Enable           | `cloud_enable=1`                 |
| Virtual Interface    | Modem            | (WAN/usb0 üzerinden bağlanıyor) |
| Server IP/Domain     | 78.186.62.169    | `cloud_servip=78.186.62.169`     |
| Server Port          | 7001             | `cloud_servport=7001`            |
| Report Status        | Enable, 8 Min    | durum raporlama açık             |
| Status               | **Closed** | `/tmp/.cloudst=Closed`           |

**Ders:** Bu ayarlar terminalden (nvram) riske girmeden web panelinden değiştirilebilir
(Save/Apply). nvram'a elle yazmaktan daha güvenli.

### 11.2 Servis mimarisi (/usr/sbin/ altındaki M2M programları)

m2mcloud   (221 KB)  → bulut sunucusuna bağlanıp raporlama
m2mdtu     (336 KB)  → DTU (Data Transfer Unit), seri veriyi ağa taşıma
m2menc     (342 KB)  → encup servisi (alotcer.com bağlantısı)
m2mgps     (61 KB)   → GPS/konum servisi (harici NMEA bekliyor)
m2mprocon  (86 KB)   → protokol dönüşümü (Modbus/analog/SDI-12 sensör okuma)
m2mpython  (8 KB)    → cihazda Python betiği çalıştırma yeteneği (!)


### 11.3 RTU gateway yeteneği (prodb şablonu)

`procon_cfgfile=/etc/exdisk/m2mprocon/prodb` → boş bir JSON şablonu. İçindeki `rtu_*`
anahtarları cihazın endüstriyel veri toplama yeteneğini gösteriyor:
`rtu_modb`/`rtu_modbc` (Modbus), `rtu_adc` (analog), `rtu_sdi` (SDI-12), `rtu_rain`
(yağmur ölçer), `rtu_gnss`, `rtu_algo` vb.
**Sonuç:** Cihaz sadece internet modemi değil, aynı zamanda bir **endüstriyel veri toplama
gateway'i (RTU)**. Modbus/analog/SDI-12 ile saha sensörü okuyup raporlayabiliyor. Şu an
şablon BOŞ = bu özellik yapılandırılmamış, fiilen sensör okunmuyor.

### 11.4 "Ne raporlanıyor" — CANLI YAKALANAN veri

Cihaz kendi dinleyicimize yönlendirildi ve gönderdiği durum raporu ham olarak alındı:

| Alan              | Değer                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Cihaz seri no     | M44DOA2603280929                                                                          |
| LAN IP            | 192.168.1.1 (DİKKAT: bağlandığımız 192.168.8.1 değil — fabrika/varsayılan adres) |
| Model             | S9922M44-DOA                                                                              |
| Firmware          | 21.05.4(8171)-ricon                                                                       |
| Şebeke           | 4G                                                                                        |
| SIM               | SIM1                                                                                      |
| Operatör         | Turkcell                                                                                  |
| Bağlantı türü | Primary                                                                                   |
| Ping/durum        | Disable                                                                                   |
| Konum             | **0.0,0.0 (GPS yok)**                                                               |

**Raporun özü:** cihaz kimliği (seri no, model, firmware) + şebeke durumu (4G, Turkcell,
SIM1, primary) + konum (GPS olmadığı için 0.0,0.0). Yani bir **cihaz sağlık/durum raporu**.
Bu, saha izleme için istenecek verinin çekirdeği: hangi DIM, hangi operatörle, hangi
teknolojiyle, çalışıyor mu.

### 11.5 Konum bilmecesi — KESİN KAPANDI

m2mcloud "gps_la_lon" gönderiyordu ama modülde GPS yok. Üç kanıt birbirini doğruladı:

1. AT komutları (`AT+QGPS?` vb.) → hepsi ERROR (dahili GPS yok)
2. m2mgps strings → `serial_gps`, `gps_not_connect`, NMEA cümleleri bekliyor (harici GPS
   destekli ama bağlı değil)
3. Canlı rapor → "Konum: 0.0,0.0 (GPS yok)"

**Sonuç — üç katmanlı:**

- Dahili GPS: YOK (EC200A'da GNSS yok)
- Harici GPS: destekleniyor (m2mgps seri/ağ NMEA okuyabiliyor) ama bağlı değil
- Baz istasyonu konumu: cihaz otomatik yapmıyor (hücre ID AT+QENG ile okunabilir ama
  konuma çevrilmiyor)

### 11.6 GÜVENLİK BULGUSU — Kontrol dışı sunuculara raporlama

Cihaz fabrika ayarıyla üç ayrı dış sunucuya bağlanmaya çalışıyor:

- `cloud_servip=78.186.62.169` (Türk Telekom IP aralığı), port 7001
- `m2m_srvip=58.215.16.142` (**ÇİN IP aralığı**), port 15695
- `encup_link=server.alotcer.com` (Alotcer — farklı marka/ODM), port 28035

Log kanıtı (`/tmp/.logfilehigh`): ~30 sn aralıkla sürekli `CLOUD: connect timeout` →
bağlantı kurulamıyor (Status: Closed). Yani ŞU AN veri sızmıyor, ama cihaz aktif olarak
deniyor.

**Risk değerlendirmesi:**

- Bağlantı başarılı olsaydı, cihaz kimlik + konum + şebeke/SIM bilgisini kontrol dışı
  (yurt içi + yurt dışı/Çin) sunuculara gönderecekti.
- m2mcloud sunucudan KOMUT da alabiliyor (`getcmd`, `cmdtab`, FTP yeteneği) → teorik
  uzaktan yönetim riski.
- Muhtemelen kötü niyetli arka kapı değil, üreticinin/ODM'in varsayılan bulut ayarı —
  ama kurumsal/kritik altyapı dağıtımında kabul edilemez.

**ZORUNLU AKSİYON (kurulum otomasyonuna eklenmeli):**
Sahaya çıkan her modemde bu ayarlar ya kapatılmalı (`cloud_enable=0`, `encup_mode=0`,
`enable_m2m=0`) ya da kendi kontrolünüzdeki güvenli sunucuya yönlendirilmeli. Bu bulgu,
kurulum otomasyonunun neden gerekli olduğunun da güçlü bir gerekçesi: her modem elle
değil, tutarlı ve otomatik biçimde güvenli hale getirilmeli.

### 11.7 İKİ YÖNLÜ SONUÇ (fırsat + risk aynı ayarda)

Aynı Cloud Service ayarı hem riski kapatmanın hem fırsatı açmanın anahtarı:

- **Fırsat:** Server IP kendi sunucunuza çevrilirse, tüm DIM filosu otomatik olarak
  düzenli sağlık/durum raporu gönderir. Saha izleme için sıfırdan yazılım gerekmez —
  hazır motor var, sadece hedefi değiştir. Canlı test bunu kanıtladı (rapor alındı).
- **Risk:** Aynı ayar kontrol dışı bırakılırsa yurt dışı sunuculara veri gider.
- Tek kurulum adımı (bulut hedefini kendi sunucuya çevir) her ikisini birden çözer.

### 11.8 Bu bölümde denenen/öğrenilen yöntemler

- `strings /usr/sbin/m2mcloud | grep ...` → ikili programdan raporlama ipuçları çıkarıldı
  (`gps_la_lon`, `gps_dbm`, `getcmd`, `heartbeat`). Yöntem sınırlı: ikili format tam
  çözülemedi, sadece anahtar kelimeler görüldü.
- `/tmp/.logfilehigh`, `.logfilelow` → canlı çalışma logları burada. `connect timeout`
  kanıtı buradan geldi.
- Canlı yakalama → cihazı kendi dinleyiciye yönlendirmek, raporu ham görmenin en kesin
  yolu (bağlantı "Closed"ken strings/log ile ancak dolaylı bilgi alınıyordu).
- **Not:** Raporun düz metin/JSON/ikili ham protokol formatı (kendi izleme sunucusunu
  yazmak için gerekli) henüz tam incelenmedi — sadece biçimlenmiş/çözülmüş hali görüldü.
  Ayrıca m2m (Çin IP) ve encup (alotcer) bağlantılarının ne gönderdiği ayrıca
  incelenmedi. Bunlar sıradaki araştırma maddeleri.

---

## EK: Hızlı Referans Kartı

| Ne                   | Değer                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Web                  | http://192.168.8.1 (riconadmin)                                                                                  |
| Telnet               | `telnet 192.168.8.1 5123` (riconadmin)                                                                         |
| AT portu bul         | `dmesg \| grep "attached to ttyUSB" \| tail -1`                                                                  |
| Canlı port doğrula | `ls -la /dev/ttyUSB*` (satır `c` ile başlamalı, tarih güncel)                                            |
| Port aç/oku         | `exec 3<>/dev/ttyUSBx; printf "AT+CMD\r" >&3; sleep 2; while read -t 3 l <&3; do echo "[$l]"; done; exec 3<&-` |
| Numara               | `AT+CNUM` (önce CEREG=0,1 bekle)                                                                              |
| Yedek kimlik         | `AT+QCCID` (ICCID, her zaman)                                                                                  |
| nvram oku            | `nvram show \| grep -i ANAHTAR`                                                                                 |
| Test SIM             | no +905350634693 / ICCID 8990011626160054295F / IMSI 286016661025431                                             |
| Modül               | Quectel EC200A (EC200AEUHAR01A30M16), GPS YOK                                                                    |
| Bulut ayarı         | cloud_enable=1, cloud_servip=78.186.62.169 (Closed), m2m_srvip=58.215.16.142 (Çin)                              |
