# Ricon S9922M44 / Quectel EC200A — Yetenek Haritası ve Veri Okuma Rehberi

**Cihaz:** Ricon S9922M44-DOA Industrial Cellular Router
**Router firmware:** 21.05.4(8171)-ricon
**Hücresel modül:** Quectel EC200A (revizyon EC200AEUHAR01A30M16, EU varyantı)
**Operatör:** Turkcell (M2M/kurumsal hat)
**Erişim:** Telnet (port 5123) → BusyCox Linux kabuğu → canlı ttyUSB portu → AT komutları
**Test tarihi:** 28 Ağustos 2026
**Amaç:** DIM kurulum otomasyonu için modülden okunabilen tüm verileri ve yetenekleri belgelemek.

---

## 0. Erişim ve Okuma Yöntemi (her şeyin ön koşulu)

### Bağlanma
```
telnet 192.168.8.1 5123      # Windows'ta önce: dism /online /Enable-Feature /FeatureName:TelnetClient
                              # kullanıcı: riconadmin
```
Giriş sonrası `riconadmin@Industrial Cellular Router:~#` prompt'u = modemin içindeyiz.

### Canlı AT portunu bulma (KRİTİK — port sabit değil!)
Modül her reset sonrası farklı bir ttyUSB'ye bağlanabiliyor (ttyUSB0/1/2 arasında gezindiği görüldü). Bu yüzden port her seferinde yeniden tespit edilmeli:

```
dmesg | grep "attached to ttyUSB" | tail -1     # modülün o anki portunu söyler
ls -la /dev/ttyUSB* | grep "$(date +'%b %d')"   # canlı (bugün tarihli) portlar; satır 'c' ile başlamalı
```

**Dikkat:** `ls` çıktısında satır `c` ile başlıyorsa (`crw-...`) gerçek donanım portudur. `-` ile başlıyorsa (`-rw-...`) o bir ölü dosyadır (önceki denemelerden kalmış), ona yazmak sahte/boş cevap üretir.

### Doğru okuma tekniği (bu modemde ŞART)
`echo > port` + ayrı `cat port` yöntemi bu modemde çalışmaz (port her açılıp kapandığında cevap kaçar). Portu tek dosya tanıtıcısıyla açık tutmak gerekir:

```sh
exec 3<>/dev/ttyUSB1                              # portu R/W aç, açık tut (USB1'i canlı portla değiştir)
while read -t 1 x <&3; do :; done                 # porttaki eski kalıntıları temizle
printf "AT+KOMUT\r" >&3                           # komutu gönder (\r şart)
sleep 2                                           # modülün cevap hazırlaması için bekle
while read -t 3 line <&3; do echo "$line"; done   # cevabı oku
exec 3<&-                                          # portu kapat
```

### Kararsızlık / boş cevap durumunda
Modül bazen (özellikle antensiz/şebekesizken) resetlenir ve AT'ye geçici cevap vermez. Belirti: düz `AT` bile boş döner. Çözüm: `dmesg | tail` ile reset olup olmadığına bak, 20-30 sn bekle, portu yeniden tespit et, önce tek `AT` ile `OK` aldığını doğrula, sonra asıl komuta geç.

---

## 1. Kimlik Bilgileri (modül + SIM)

| Komut | Örnek Cevap | Ne verir | Şebeke gerekir mi? |
|---|---|---|---|
| `ATI` | Quectel / EC200A / Revision: EC200AEUHAR01A30M16 | Üretici + model + revizyon | Hayır |
| `AT+CGMR` | EC200AEUHAR01A30M16 | Firmware sürümü | Hayır |
| `AT+CGSN` | 8671910XXXXXXXX | **Modül IMEI** (donanım kimliği) | Hayır |
| `AT+CPIN?` | +CPIN: READY | SIM kilit durumu (READY / SIM PIN) | Hayır |
| `AT+CNUM` | +CNUM: "","+90535XXXXXXX",145 | **Telefon numarası (MSISDN)** | **Bazı SIM'lerde EVET** (bkz. §6) |
| `AT+QCCID` | +QCCID: 8990XXXXXXXXXXXXXXXF | **SIM seri no (ICCID)** | Hayır — her zaman çalışır |
| `AT+CIMI` | 28601XXXXXXXXXX | **IMSI** (286=TR, 01=Turkcell) | Hayır |

**Otomasyon notu:** ICCID, IMSI, IMEI şebekeye ihtiyaç duymadan her zaman okunur. Telefon numarası ise özel durum (§6).

---

## 2. Şebeke ve Sinyal Durumu

| Komut | Örnek Cevap | Ne verir |
|---|---|---|
| `AT+CSQ` | +CSQ: 20,99 | Sinyal gücü (0-31; 20≈-73dBm iyi; 99=bilinmiyor) |
| `AT+CESQ` | +CESQ: 37,99,255,255,21,38 | Detaylı LTE sinyali (RSRQ, RSRP) |
| `AT+COPS?` | +COPS: 0,1,"Tcell",7 | Bağlı operatör (7 = LTE erişim tekno.) |
| `AT+QSPN` | +QSPN: "Turkcell","Tcell","Turkcell",0,"28601" | Şebeke adı + MCC/MNC |
| `AT+QNWINFO` | +QNWINFO: "FDD LTE","28601","LTE BAND 3",1795 | Teknoloji + bant + kanal |
| `AT+CREG?` | +CREG: 0,1 | Şebeke kaydı (1=kayıtlı ev, 5=roaming, 0=yok, 2=arıyor) |
| `AT+CEREG?` | +CEREG: 0,1 | LTE şebeke kaydı |
| `AT+CGREG?` | +CGREG: 0,1 | Paket (GPRS) şebeke kaydı |
| `AT+CGATT?` | +CGATT: 1 | Paket servise bağlı mı (1=evet) |
| `AT+QENG="servingcell"` | ...LTE,FDD,286,01,70D02B,455,1795,...,-73... | Baz istasyonu detayı: hücre ID, bant, RSRP |

**Otomasyon notu:** `AT+CEREG?` = `0,1` veya `0,5` → modül şebekeye kayıtlı, veri okumaya hazır. Bu, numara sormadan önce beklenecek koşuldur (bkz. §6).

---

## 3. Konfigürasyon ve Sistem Durumu

| Komut | Örnek Cevap | Ne verir |
|---|---|---|
| `AT+CGDCONT?` | 1,"IP","internet"... / 8,"IPV4V6","IMS"... | APN tanımları ("internet"=Turkcell veri, IMS=VoLTE) |
| `AT+CGACT?` | 1,1 / 8,0 | Veri bağlamı aktif mi (bağlam 1 aktif) |
| `AT+CGPADDR` | 1,"178.245.168.167" | **Operatörün verdiği IP** (public, muhtemelen dinamik) |
| `AT+CGCONTRDP` | ...178.245.168.167...213.74.0.4...213.74.1.4 | IP + DNS (Turkcell DNS: 213.74.0.4 / .1.4) |
| `AT+CFUN?` | +CFUN: 1 | Modül çalışma modu (1=tam, 0=minimum, 4=uçuş) |
| `AT+QTEMP` | +QTEMP: 34,255,255 | Modül sıcaklığı (°C) |
| `AT+CCLK?` | "26/08/28,08:06:42+12" | Şebeke saati (kayıt sonrası doğru gelir) |
| `AT+QCFG="band"` | "band",0xd3,0x1a0080800d5 | Etkin frekans bantları (hex maske) |
| `AT+QCFG="nwscanmode"` | "nwscanmode",0 | Şebeke tarama modu (0=otomatik) |

**Not:** Saat, antensizken 2013'ü gösteriyordu; şebekeye kayıt olunca gerçek tarihe (2026) döndü. Bu, "şebeke kaydı modülün birçok bilgisini tamamlar" ilkesinin bir örneği.

---

## 4. SMS Yeteneği (donanım destekli — sadece sorgu yapıldı, mesaj gönderilmedi)

| Komut | Örnek Cevap | Ne verir |
|---|---|---|
| `AT+CSMS?` | +CSMS: 0,1,1,1 | SMS servisi destekleniyor (gönder+al+broadcast) |
| `AT+CMGF?` | +CMGF: 0 | SMS modu (0=PDU, 1=metin) |
| `AT+CPMS?` | "SM",0,35 | SMS deposu (SIM'de 0/35 mesaj) |
| `AT+CSCA?` | "+905329010000",145 | Turkcell SMS servis merkezi (SMSC) |

**Durum:** Modül donanımsal olarak SMS'e tam hazır. Fiili gönderim, **hattın SMS'e açık olmasına** bağlıdır (M2M tarifelerinde kapalı olabilir). Gerekirse metin modunda gönderim: `AT+CMGF=1` → `AT+CMGS="+90..."`.

---

## 5. Kurulum Otomasyonunda Kullanım Haritası

Bugra'nın provizyon uygulamasının "kimlik ve SIM kontrolü" adımı için önerilen çekirdek:

| Amaç | Komut | Beklenen |
|---|---|---|
| SIM takılı ve kilitsiz mi? | `AT+CPIN?` | READY |
| Şebekeye kayıtlı mı? (numara ön koşulu) | `AT+CEREG?` | 0,1 veya 0,5 |
| SIM benzersiz kimliği | `AT+QCCID` | ICCID (her zaman çalışır) |
| Abone kimliği | `AT+CIMI` | IMSI |
| Modül donanım kimliği | `AT+CGSN` | IMEI |
| Telefon numarası | `AT+CNUM` | +90... (kayıt sonrası) |
| Bağlantı sağlıklı mı? | `AT+CGATT?` + `AT+CGPADDR` | 1 + geçerli IP |
| Sinyal yeterli mi? | `AT+CSQ` | >10 tercih edilir |

---

## 6. KRİTİK BULGU: Telefon Numarası ve Şebeke Kaydı İlişkisi

Bu, test sürecinin en önemli keşfi ve otomasyonun en hassas noktası.

**Gözlem:** `AT+CNUM` bazı SIM'lerde numarayı döndürdü, bazılarında boş döndü — ve aynı SIM, **antensizken boş, antenliyken dolu** cevap verdi.

**Sebep:** Telefon numarası (MSISDN) her SIM'in çipine yazılı DEĞİLDİR.
- **Numara çipe yazılıysa:** `AT+CNUM` doğrudan SIM'den okur, şebeke gerekmez.
- **Numara çipe yazılı değilse:** Modül numarayı ancak **şebekeye kaydolduğunda operatörden öğrenir**. Antensiz/şebekesiz modül numarayı bilemez → `AT+CNUM` boş döner.

**Doğrulanmış senaryo:**
- Antensiz modem: `+CEREG: 0,0` (kayıt yok) → `+CNUM:` boş
- Aynı karta anten takıldı: `+CEREG: 0,1` (kayıtlı) → `+CNUM: "","+90535XXXXXXX",145` doldu

**Otomasyon kuralı (ZORUNLU):**
1. Önce `AT+CPIN?` → READY olmalı.
2. Sonra `AT+CEREG?` → `0,1`/`0,5` olana kadar bekle (şebeke kaydı). Gerekirse birkaç saniye aralıkla tekrar sorgula (timeout ör. 60 sn).
3. **Ancak ondan sonra** `AT+CNUM` sor.
4. `AT+CNUM` yine boş dönerse yedeğe geç: `AT+QCCID` (ICCID) her durumda benzersiz kimlik sağlar.

Sahadaki modemler antenli ve şebekeye bağlı olacağı için gerçek kullanımda numara güvenilir gelir; boş dönme sorunu esasen antensiz test ortamına özgüdür.

---

## 7. Ağ / Uzaktan Erişim Notu

- Operatörün verdiği IP: `178.245.168.167` (Turkcell mobil aralığı, public görünüyor ama muhtemelen **dinamik**).
- Sahadaki modeme merkezden doğrudan erişim isteniyorsa, bu IP'nin sabit+public olması ya da VPN/bulut (Ricon RMS) kullanılması gerekir. Dinamik IP ile dışarıdan içeriye doğrudan bağlantı güvenilir değildir.

---

## 8. Otomasyon İçin Öğrenilen Dersler (özet)

1. **Port sabit değil** — her işlemde `dmesg`+`ls` ile canlı port yeniden bulunmalı; birden fazla canlı port varsa her birine `AT` gönderip `OK` döneni seçmeli.
2. **Ölü dosya tuzağı** — porta yazmadan önce `c` (character device) olduğu doğrulanmalı; yoksa sahte/boş cevap gelir.
3. **Açık-tut tekniği** — `exec 3<>` ile port açık tutulmalı; `echo`/`cat` ayrı ayrı çalışmaz.
4. **Şebeke kaydı bekle** — numara ve saat gibi bilgiler kayıt sonrası gelir; kayıt beklemeden sorma.
5. **Modül kararsızlığı** — reset sonrası 20-30 sn bekleme ve önce `AT`→`OK` doğrulaması gerekebilir; uygulama tek deneyip pes etmemeli, tekrar denemeli.
6. **ICCID = en sağlam kimlik** — numara bazen yoksa da ICCID her zaman okunur; kart takibinde numaradan bile güvenilirdir.

---

## Doğrulanmış Bilgi Kartı

| Parametre | Değer |
|---|---|
| Router | Ricon S9922M44-DOA |
| Modül | Quectel EC200A (EC200AEUHAR01A30M16) |
| Web arayüzü | http://192.168.8.1 |
| Telnet portu | 5123 |
| CLI kullanıcısı | riconadmin |
| Canlı AT portu | Değişken (ttyUSB0/1/2) — her seferinde tespit et |
| Port açma yöntemi | `exec 3<>/dev/ttyUSBX` |
| Numara komutu | `AT+CNUM` (şebeke kaydı sonrası) |
| Yedek kimlik | `AT+QCCID` (ICCID, her zaman) |
| Test SIM numarası | +90535XXXXXXX |
| Test SIM ICCID | 8990XXXXXXXXXXXXXXXF |
| Test SIM IMSI | 28601XXXXXXXXXX |
| Operatör | Turkcell (MCC/MNC 28601), LTE Band 3 |
