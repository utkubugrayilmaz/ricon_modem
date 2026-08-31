# Hücresel Modül — Quectel EC200A

Ricon S9922M44 içindeki hücresel modül (revizyon EC200AEUHAR01A30M16, EU).
Data-only; ses ve GNSS/GPS donanımı **yok**. Modemin kendisi için bkz.
[modem.md](modem.md).

## Erişim

```
telnet <host> 5123          # riconadmin → BusyBox root shell
dmesg | grep "attached to ttyUSB" | tail -1   # canlı AT portunu bul
exec 3<>/dev/ttyUSB0        # portu R/W açık tut (varsayılan port ttyUSB0)
printf "AT+KOMUT\r" >&3     # \r şart
while read -t 3 l <&3; do echo "$l"; done      # cevabı oku
exec 3<&-
```

AT portu genelde `/dev/ttyUSB0`; reset sonrası değişebilir. Yalnızca `c`
(character device) satırı ve güncel tarihli port canlıdır. Başarılı cevap
sonda `OK`, hata `ERROR` basar.

## Kimlik

| Komut | Döndürdüğü | Şebeke gerekir |
|---|---|---|
| `ATI` | Üretici + model + revizyon | Hayır |
| `AT+CGMI` | Üretici (Quectel) | Hayır |
| `AT+CGMM` | Model (EC200A) | Hayır |
| `AT+CGMR` | Firmware sürümü | Hayır |
| `AT+CGSN` | Modül IMEI | Hayır |
| `AT+CIMI` | IMSI (286=TR, 01=Turkcell) | Hayır |
| `AT+QCCID` / `AT+CCID` | SIM ICCID (her zaman okunur) | Hayır |
| `AT+CNUM` | Telefon numarası (MSISDN) | Bazı SIM'lerde Evet |

## Şebeke ve sinyal

| Komut | Döndürdüğü |
|---|---|
| `AT+CSQ` | Sinyal gücü (0-31; 99=bilinmiyor) |
| `AT+CESQ` | Detaylı LTE sinyali (RSRQ, RSRP) |
| `AT+COPS?` | Bağlı operatör + erişim teknolojisi |
| `AT+QSPN` | Şebeke adı + MCC/MNC |
| `AT+QNWINFO` | Teknoloji + band + kanal |
| `AT+CREG?` | Şebeke kaydı (1=ev, 5=roaming, 0=yok, 2=arıyor) |
| `AT+CEREG?` | LTE şebeke kaydı |
| `AT+CGREG?` | Paket (GPRS) şebeke kaydı |
| `AT+CGATT?` | Pakete bağlı mı (1=evet) |
| `AT+QENG="servingcell"` | Baz istasyonu detayı (hücre ID, band, RSRP) |

## Konfigürasyon ve sistem

| Komut | Döndürdüğü |
|---|---|
| `AT+CGDCONT?` | APN tanımları |
| `AT+CGACT?` | Veri bağlamı aktif mi |
| `AT+CGPADDR` | Operatörün verdiği IP |
| `AT+CGCONTRDP` | IP + DNS |
| `AT+CFUN?` | Çalışma modu (1=tam, 0=minimum, 4=uçuş) |
| `AT+QTEMP` | Modül sıcaklığı (°C) |
| `AT+CCLK?` | Şebeke saati (kayıt sonrası doğru) |
| `AT+QCFG="band"` | Etkin frekans bantları (hex maske) |
| `AT+QCFG="nwscanmode"` | Şebeke tarama modu (0=otomatik) |

## SMS

| Komut | Döndürdüğü |
|---|---|
| `AT+CSMS?` | SMS servisi destekleniyor mu |
| `AT+CMGF?` | SMS modu (0=PDU, 1=metin) |
| `AT+CPMS?` | SMS deposu doluluğu |
| `AT+CSCA?` | SMS servis merkezi (SMSC) |
| `AT+CMGF=1` | Metin moduna geç (yazma) |
| `AT+CMGS="+90..."` | SMS gönder (yazma; hat SMS'e açıksa) |

## SIM PIN ve kilit

Sorgu hak harcamaz; yazma komutları yanlış PIN'de deneme hakkı yakar
(3 yanlış PIN → PUK).

| Komut | İş | Hak |
|---|---|---|
| `AT+CPIN?` | Kilit durumu (`READY` / `SIM PIN` / `SIM PUK`) | — |
| `AT+QPINC="SC"` | Kalan PIN/PUK deneme sayısı | — |
| `AT+CPINC` | Kalan hak (standart yedek) | — |
| `AT+CLCK="SC",2` | Kilit sorgusu (açık mı) | — |
| `AT+CMEE=2` | Hata mesajlarını metin yap | — |
| `AT+CPIN="<pin>"` | PIN gönder (kilidi aç) | Harcar |
| `AT+CLCK="SC",0,"<pin>"` | PIN kilidini kalıcı kaldır | Harcar |
| `AT+CLCK="SC",1,"<pin>"` | PIN kilidi kur | Harcar |
| `AT+CPWD="SC","<eski>","<yeni>"` | PIN değiştir | Harcar |

## Desteklenmeyen / yok

| Komut | Sonuç |
|---|---|
| `AT+QGPS?` / `AT+QGPSCFG` / `AT+CGPS?` / `AT+QGPSLOC?` | ERROR (GNSS/GPS yok) |
| `AT+CLAC` | ERROR (komut listesi dökülmez) |

## Telefon numarası kuralı

MSISDN her SIM çipine yazılı değildir. Yazılı değilse modül numarayı ancak
şebekeye kayıtlıyken öğrenir. Sıra:

1. `AT+CPIN?` → `READY`
2. `AT+CEREG?` → `0,1` veya `0,5` olana kadar bekle
3. `AT+CNUM` sor
4. Boş dönerse `AT+QCCID` (ICCID) benzersiz kimlik verir
