# ricon_modem

Ricon **S9922M44-DOA** endüstriyel hücresel router için **keşif + tam veri
çekme + otomatik hazırlama (provizyon)** aracı. Node.js, **sıfır bağımlılık**.

RVM makinelerindeki bu modem sahada elle hazırlanıyor (web arayüzünden APN,
WLAN, LAN IP, Backup Link... ~13 ayar). Amaç: (1) cihazdan alınabilecek her
şeyi çekmek, (2) bu hazırlama sürecini **tek komuta** indirmek.

Ürün iki yüzeyden tüketilir ve ikisi de **aynı** çekirdek fonksiyonları çağırır:

| Biçim | Nasıl |
|---|---|
| Terminal | `node ricon.js hazirla` |
| npm paketi | `import { provisionModem } from "ricon-modem"` |

**238 test** (`npm test`), sıfır bağımlılık.

## Kurulum

Gereksinim: **Node.js >= 24** (yalnızca yerleşik modüller).

```bash
cp .env.example .env   # doldur: MODEM_HOST/KULLANICI/SIFRE/KAYNAK_IP
```

PC'de modemle aynı alt ağda ikincil IP gerekir. Provizyon için hem fabrika
(192.168.1.x) hem saha (5.5.5.x) adresini **kalıcı** tut — ağ değiştirmeye
gerek kalmaz:

```powershell
# yönetici PowerShell (tek sefer)
New-NetIPAddress -InterfaceAlias Ethernet -IPAddress 192.168.1.50 -PrefixLength 24
New-NetIPAddress -InterfaceAlias Ethernet -IPAddress 5.5.5.100   -PrefixLength 24
```

## Kullanım (CLI komutları Türkçe, kod İngilizce)

```bash
node --env-file=.env ricon.js dogrula     # ortam/erişim teşhisi
node --env-file=.env ricon.js kesif       # port + parmak izi + SNMP (salt okunur)
node --env-file=.env ricon.js oku         # HER ŞEYİ çek (sistem+SIM+ayar+nvram)
node --env-file=.env ricon.js konsol --nvram   # telnet root: tam nvram
node --env-file=.env ricon.js sim              # SIM/hücresel özet
node --env-file=.env ricon.js sim --telefon 05xxxxxxxxx   # MSISDN'i dışarıdan ver

# TEK İŞ YAPAN komutlar — aracın tamamına girmeden tek bilgi
node --env-file=.env ricon.js degerlendir      # durum + NE EKSİK (numara dahil, ~5 sn)
node --env-file=.env ricon.js numara           # SADECE telefon numarası (AT+CNUM, ~3 sn)
node --env-file=.env ricon.js sim-kilit        # SADECE kilit + KALAN HAK (hak harcamaz)

# SIM PIN kilidini KALICI kaldır — nvram'a PIN yazmanın yerine geçen yol.
# Varsayılan KURU: ne yapılacağını söyler, hiçbir şey denemez.
node --env-file=.env ricon.js sim-pin-kaldir --pin 1234
node --env-file=.env ricon.js sim-pin-kaldir --pin 1234 --uygula   # TEK deneme

# Provizyon (yazma) — varsayılan KURU (dry-run); gerçek yazma --uygula ister
node --env-file=.env ricon.js uygula                # ne değişecek (yazmaz)
node --env-file=.env ricon.js uygula --uygula --yeni-host 5.5.5.1 --yeni-kaynak 5.5.5.100

# Tak-çalıştır: algıla → provizyon → doğrula → başarıya kadar
node --env-file=.env ricon.js hazirla           # numarayı SIM'den kendisi okur
node --env-file=.env ricon.js hazirla --telefon 05321234567   # numarayı EZER
node --env-file=.env ricon.js hazirla --dongu   # çok modem: tak → hazır → çıkar
node --env-file=.env ricon.js hazirla --internet-bekle 0      # SIM doğrulamasını atla

# ortak: --json <dosya> · --kaynak <dosya> (kayıttan, cihazsız)
#        --host <ip> · --kaynak-ip <ip> (.env'i ezer; modem o an neredeyse)
```

stdout **her zaman saf JSON**; ilerleme/özet stderr'a; çıkış kodu 0 (ok)/1.

## Terminalde ne görünür

`hazirla` ve `uygula` adım adım ilerlemeyi ve süreleri basar — operatör 60-90
saniye boyunca aracın ne yaptığını görür:

```
[1/7] modem algilandi — 192.168.1.1 (provizyon_fabrika)      0.4 sn
  → telefon: 0535 063 47 47  (SIM'den okundu)
[2/7] ayarlar okundu (plan hazir) — 14 ayar degisecek        5.7 sn
[3/7] yazma basladi — Modem/WAN (8 ayar)                     6.0 sn
[5/7] reboot gonderildi                                      8.4 sn
[6/7] cihaz geri geldi, dogrulandi — 31 sn bekledi          38.4 sn
[7/7] internet dogrulandi (SIM calisiyor) — WAN 178.245...  49.4 sn

  ADIM SURELERI
     modem algilandi                      0.4 sn  (0.4 sn'de)
   ▲ cihaz geri geldi, dogrulandi        30.0 sn  (38.4 sn'de)
     TOPLAM                              49.4 sn
     kaydedilen hat                    0535 063 47 47
```

Numara **bulunduğu anda** yazılır: yanlış SIM takılmışsa operatör kurulumun
bitmesini beklemeden anlar. Tekrarlayan olaylar (reboot beklemesi, internet
yoklaması — gerçek kurulumda ~70 olay) akışa satır **eklemez**, aynı satırda
güncellenir; `▲` en uzun adımı işaretler.

SIM PIN kilitliyse akış durup **PIN'i sorar** ve kilidi SIM'den kalıcı kaldırır:

```
  ⏸ SIM PIN KILITLI — devam etmek icin PIN gerekiyor (kalan hak: 3)
     PIN girilince kilit SIM'den KALICI kaldirilir; bir daha sorulmaz.
  SIM PIN (4-8 hane, kalan hak 3): ____
  ✓ PIN kilidi KALICI kaldirildi — numara artik okunabilir
```

Kilidi **nvram'a PIN yazarak** değil SIM'in kendisinden kaldırıyoruz: sahadaki
cihazda saklanacak parola kalmaz ve SIM her cihazda açık gelir. Kilit
kalkmadan telefon numarası okunamıyor (kilitli SIM abone verisini açmıyor), o
yüzden zincirin sırası budur.

## İş kuralları çekirdekte

Telefon zorunluluğu, SIM yoksa reddetme, PIN/PUK kilidi teşhisi ve son PIN
hakkının korunması, idempotency, LAN IP'nin en sona yazılması, yazma sırası,
defter kaydının üretilmesi — hepsi `src/` altında. Yeni bir tüketici yazan
kişi bunları yeniden yazmaz; yanlışlıkla atlaması da mümkün değil.

**Kural:** bir yetenek eklendiğinde çekirdeğe eklenir ve **her tüketiciden**
erişilebilir olur. Yalnız CLI'dan ulaşılan bir yetenek, çekirdeğin bir parçası
değil o katmanın gizli mantığıdır.

Çekirdek **ne zaman** soracağına karar verir, tüketici **nasıl** soracağına:
`provisionModem` telefon numarası ya da SIM PIN gerektiğinde `opts.telefonSor`
/ `opts.pinSor` çağırır. CLI bunları terminalden sorar; başka bir tüketici
başka bir yerden alır. İkisi de opsiyonel — verilmezse çekirdek sormaz ve
eksiği `problems[]` ile bildirip düzgün başarısız olur.

**PIN kuralı — otomatik yol / insan yolu:** "bir hak yakıldıysa bir daha
deneme" kuralı **aracın kendi kendine tekrarlamasına** karşıdır. Operatör
başka bir PIN denemek isterse önü kesilmez — doğru PIN'i bilen odur. İnsanın
da geçemediği tek kural **son hak**: orada yanlış PIN SIM'i PUK'a kilitler.
Çağrılarda bu ayrım `elleOnay` seçeneğiyle taşınır (CLI'da `--zorla`).

Tek iş yapan çağrılar (aracın tamamını kullanmaya gerek yok):

| Sadece şunu istiyorum | Çağrı | CLI |
|---|---|---|
| Telefon numarası | `readMsisdn(opts)` | `ricon.js numara` |
| SIM kilidi + kalan hak | `readSimLock(opts)` | `ricon.js sim-kilit` |
| PIN kilidini kalıcı kaldır | `simPinKaldir(opts, pin)` | `ricon.js sim-pin-kaldir --uygula` |
| Ne eksik, başlanabilir mi | `assessDevice(opts)` | `ricon.js degerlendir` |
| "Ne eksik" kararı (SAF, cihazsız) | `provisionEksikleri({...})` | — |
| Kendi kabuk komutum | `runConsole(opts, ["uname -a"])` | `ricon.js konsol` |

Paket **tek kapıdan** gelir — `src/index.js`. Her fonksiyon `opts` alır, sonuç
nesnesi döner, throw etmez:

```js
import { assessDevice, readMsisdn, provisionModem } from "ricon-modem";
```

## Hazırlama defteri (rollout kaydı)

`hazirla` her modem için **bir satır** JSONL yazar (`data/hazirlanan.jsonl`,
`--kayit` ile değiştirilebilir):

```json
{"zaman":"...","durum":"hazir","ok":true,"deneme":1,"profil":"saha",
 "modem_ip":"5.5.5.1","telefon":"5321234567","lan_mac":"00:0c:43:...",
 "iccid":"8990...","imsi":"28601...","imei":"867...","operator":"Turkcell"}
```

Sahada "bu modem hazırlanmış mıydı, hangi hat takılıydı" sorusunun tek kanıtı.
Cihazın **etiket seri numarası ne HTTP'de ne nvram'da yok** (arandı) — kalıcı
kimlik `lan_mac` + `imei` + `iccid`. Dosya `data/` altında ve **gitignore'da**:
telefon/ICCID/IMEI abonelik verisidir, commit edilmez.

## Mimari

| Modül | İş |
|---|---|
| **Giris** | *hangi kapidan girilirse ayni cekirdek* |
| `ricon.js` | İnce CLI — argv + .env + `index` çağrısı + terminale yazma |
| `src/index.js` | **Public API — TEK KAPI.** Uygulama yok, yalnız ne dışa açıldığı |
| **domain/** | *IO YOK — saf kural, sabit, karar* |
| `src/domain/constants.js` | Tüm sabitler (port/uç/alan/**ayar sözlüğü** haritaları) |
| `src/domain/profile.js` | `FIELD_PROFILE` (saha) + `FACTORY_PROFILE` (fabrika) |
| `src/domain/problems.js` | Sorun kataloğu `{kod, severity, message, check}` |
| `src/domain/sorun-metni.js` | Sorun kodu → **operatöre gösterilecek Türkçe**. Tek sözlük; `message`/`check` geliştirici tarafı |
| `src/domain/pin-karar.js` | ⭐ PIN denemesi kararları — **PURE, TEK YER**. Üç yol (nvram / AT / internet sonrası) da buraya sorar |
| **transport/** | *cihazla ve agla konusan kanallar* |
| `src/transport/client.js` | ⭐ Sıralı HTTP kuyruğu — modemin **tek bağlantılı** sunucusu; kaynak IP, retry, yarım-gövde toleransı |
| `src/transport/console.js` | Telnet root shell (5123): nvram get/show + yazma (kapılı) + retry |
| `src/transport/scanner.js` | Paralel TCP port taraması |
| `src/transport/network.js` | Arayüz/kaynak IP, ARP + IPv6 komşu |
| `src/transport/snmp.js` | Saf Node SNMPv2c GET |
| **parse/** | *ham veri → nesne (saf)* |
| `src/parse/ddwrt.js` | `{anahtar::değer}` ayrıştırıcı + SIM görünümü |
| `src/parse/nvram.js` | `/nvrambak.bin` ikili tam yedek çözümleyici + diff |
| **device/** | *cihazdan okuma* |
| `src/device/at.js` | ⭐ AT komut katmanı — telefon numarası (`AT+CNUM`), SIM kilidi, PIN kaldırma |
| `src/device/sim.js` | SIM/hücresel okuma (HTTP) + `Status of SIM` çözümleyici |
| `src/device/cihaz.js` | ⭐ **En alt katman:** `readIdentity`, `simTakiliMi`, `waitForInternet`, `pcPreflight`. Okuma yolu da yazma yolu da buna bakar |
| `src/device/okuma.js` | Cihaz okuma işlemleri: `dogrula` / `oku` / `kesif` / `konsol` |
| **flow/** | *akis / orkestrasyon* |
| `src/flow/degerlendirme.js` | ⭐ "Ne durumda, ne eksik, **tekrar bakmalı mıyım**?" — tekrar politikası PURE ve çekirdekte |
| `src/flow/provisioning.js` | Provizyon motoru (oku→planla→yaz→doğrula, idempotent) |
| `src/flow/pipeline.js` | Tak-çalıştır orkestrasyon (algıla→provizyon→retry, döngü). Numarayı **SIM'den kendisi okur**, PIN'i tüketiciden ister |
| **report/** | *cikti ve gorunum* |
| `src/report/report.js` | JSON + insan-okunur çıktı, sır temizleme, `settingLabel` |
| `src/report/ilerleme.js` | Terminal ilerleme görünümü (PURE) — adım damgalama, süre, gürültü kuralı |

Bagimlilik yonu TEK YON: `flow` → `device` → `transport`/`parse` → `domain`.
`domain` hicbir seye bagli degil, `transport` cihaza gider ama karar vermez.
Dongu yok — `tests/mimari.test.js` bu yonu kodla sabitliyor.

`arsiv/` repoda değil (gitignore): eski yakalamalar, ekran görüntüleri, ham
dökümler.

## Değişmeyen kurallar

- **Okuma komutları salt okunur** (oku/kesif/dogrula/konsol): yalnızca
  GET / nvram okuma; yazma reddedilir. Yazma **yalnızca** `uygula`/`hazirla`
  içinde ve gerçek yazma için açık `--uygula` şart.
- Kütüphane **throw etmez** — her sonuç `problems[]` taşır; kısmi sonuç geçerli.
- Çekirdek **`process.env`/argv OKUMAZ, stdout'a YAZMAZ.** Girdi `opts` ile
  gelir, çıktı bir sonuç nesnesidir. Ortamı okuyan ve yazan taraf `ricon.js`.
- Çıktı **ham/geçirgen** — cihazın alan adları korunur; eşlenmiş görünüm ek.
- **Sır çıktıya yazılmaz** — parola/kimlik/SIM PIN/PPP parolası rapordan
  temizlenir, ekranda maskelenir.
- **Kayıtsız modem sahaya çıkmaz** — `hazirla` telefon numarası (MSISDN)
  olmadan başlamaz; kural **çekirdekte** (`provisionModem`), yalnız CLI'da değil.
- **SIM'siz modem onaylanmaz** — kimlik en başta okunur, ICCID yoksa hiçbir şey
  yazılmadan reddedilir. SIM'siz provizyon "başarılı" görünür ama cihaz
  şebekeye kaydolamaz (canlı doğrulandı).
- **Saf girdi doğrulaması ortam kontrolünden önce gelir** — bozuk bir telefon
  numarası, makinenin ağ yapılandırmasına bakılmadan reddedilir. Aksi hâlde
  aynı girdi farklı makinelerde farklı teşhis alır.
- **İki ayrı soru, iki ayrı cevap:** *"ayarlar doğru mu"* (nvram geri-okuma,
  ~45 sn) ve *"SIM çalışıyor mu"* (WAN IP geldi mi). İkincisi teknisyenin elle
  yaptığı kontrolün otomatiği — **PIN kilitli SIM'i yakalayan tek şey bu.**
  İnternetin gelmemesi provizyonu başarısız yapmaz (uyarı), çünkü ayarlar
  doğrudur ve tekrar denemek hiçbir şeyi çözmez.
- **Kod adları İngilizce, yorumlar Türkçe**; CLI komutları ve `.env`
  değişkenleri Türkçe (kullanıcı yüzeyi); JSON çıktı anahtarları Türkçe (veri
  sözlüğü). Bkz. `docs/`.

## Kapsam dışı
Ham paket yakalama · tarayıcı arayüzü · DB/entegrasyon · zaman serisi saklama.

---

# ricon_modem (English)

Zero-dependency Node.js tool to **discover, fully read, and automatically
provision** the Ricon **S9922M44-DOA** industrial cellular router.

Verified end to end on the live device: read-everything (system + SIM/cellular
+ full nvram), UI→nvram mapping (every setting matched via nvram diff), and
one-command provisioning (fresh device → fully provisioned → verified at
5.5.5.1, idempotent). The phone number is read from the SIM itself
(`AT+CNUM`), and a PIN-locked SIM is unlocked **permanently on the SIM** rather
than by storing the PIN in nvram. 238 tests, zero deps.

Core logic lives in importable `opts`-taking functions behind a single door,
`src/index.js` (`readDevice`, `applyProvisioning`, `provisionModem`...),
consumed as a CLI or as an npm package. The core never reads `process.env` or
argv, never writes to stdout, and never throws — results carry `problems[]`.
Read commands are read-only; writing happens only in `uygula`/`hazirla` and
requires an explicit `--uygula` flag. Identifiers are English; comments, CLI
command names, `.env` vars and JSON output keys are Turkish (the team's
surface/domain vocabulary).

```
node --env-file=.env ricon.js hazirla   # detect → provision → verify
```
