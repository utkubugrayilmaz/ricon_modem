# ricon-modem

Ricon **S9922M44-DOA** endüstriyel hücresel router'ı okur ve **sahaya hazırlar**.
Node.js, **sıfır bağımlılık**, arayüz yok, veritabanı yok.

RVM makinelerindeki bu modem sahada elle hazırlanıyordu — web arayüzünden APN,
WLAN, LAN IP, Backup Link… ~13 ayar. Araç bunu tek komuta indiriyor.

```js
import { provisionModem } from "ricon-modem";

const result = await provisionModem({ credentials, profile, phone: "5321234567" });
```

```bash
$ npm start                     # tak → hazır → çıkar → sıradaki
$ node bin/ricon.js read         # her şeyi çek, saf JSON
$ echo $?
0
```

Node 24 veya üstü. Başka hiçbir şey gerekmiyor — test koşucusu da `--env-file`
de yerleşik.

## Kurulum

```bash
cp .env.example .env   # doldur: MODEM_HOST / USER / PASSWORD / SOURCE_IP
npm test               # cihaz gerekmez
```

PC'de modemle aynı alt ağda **ikincil IP** gerekir. Provizyon fabrika
(192.168.1.x) ile saha (5.5.5.x) arasında gidip geldiği için ikisini de
**kalıcı** tut — ağ değiştirmeye gerek kalmaz:

```powershell
# yönetici PowerShell (tek sefer)
New-NetIPAddress -InterfaceAlias Ethernet -IPAddress 192.168.1.50 -PrefixLength 24
New-NetIPAddress -InterfaceAlias Ethernet -IPAddress 5.5.5.100   -PrefixLength 24
```

## Kullanım

Yorum satırları dışında her şey **İngilizce**: komutlar, bayraklar, npm
script'leri, durum değerleri, operatöre gösterilen metin. Yorumlar Türkçe
kalır — kararın nedeni orada.

v0.2.0'da tüm adlar değişti. Eski adı yazarsanız araç doğrusunu söyler:
`ricon hazirla` → `unknown command: hazirla — did you mean: provision`.

```bash
npm start                              # provision --loop
npm run provision                     # tek modem
npm run assess                        # durum + NE EKSİK (~5 sn, salt okunur)
npm run read                          # sistem + SIM + ayar + nvram
npm run verify                        # ortam/erişim teşhisi
npm run metrics                       # kaydedilmiş sürelerden metrik özeti
```

Tam liste:

```bash
node bin/ricon.js --help
```

```
verify · read · console [--nvram] · sim · assess [--watch]
msisdn · sim-lock · sim-pin-disable · sim-pin-enable
diff <A.json> <B.json> · apply [--apply] · provision [--loop]
call [<fonksiyon>] · metrics · metrics-manual
```

**Yazma varsayılan olarak KAPALI.** `apply`, `sim-pin-disable` ve
`sim-pin-enable` bayraksız **kuru** çalışır: ne yapacağını söyler, hiçbir şey
denemez. Gerçek yazma açık `--apply` ister.

**Sözleşme:** stdout **her zaman** saf JSON; ilerleme/özet stderr'a; çıkış kodu
`ok`'tan (0/1). Ortak bayraklar: `--json <dosya>` · `--from-file <dosya>`
(cihazsız tekrar oynatma) · `--host` / `--source-ip` (.env'i ezer).

## `call` — her fonksiyonu adıyla çağır

`src/index.js`'ten export edilen **her şey** terminalden çağrılabilir. Yeni bir
yetenek eklendiğinde CLI'a `case` yazmak gerekmez.

```bash
node bin/ricon.js call                                  # yüzeyi listele
node bin/ricon.js call readSimLock                      # readSimLock(opts)
node bin/ricon.js call atCommand -- "AT+CNUM"           # atCommand(opts, "AT+CNUM")
node bin/ricon.js call normalizePhone -- 05321234567    # saf fonksiyon
node bin/ricon.js call settingLabel -- w1_wan_proto m13g
```

`--` ayracından **önce** opts'a karışan bayrak, **sonra** konumsal argüman.
Fonksiyonun `opts` alıp almadığı imzasının ilk parametresinden anlaşılır;
`--pure` bunu ezer.

## Paket olarak

```js
import {
  provisionModem, assessDevice, readIdentity, readMsisdn, readSimLock,
  applyProvisioning, runConsole, FIELD_PROFILE,
} from "ricon-modem";
```

Her fonksiyon `opts` alır, sonuç nesnesi döner, **throw etmez** — sorun varsa
`problems[]` içinde çözümüyle gelir. Çalışan örnek:
[`examples/package-usage.js`](examples/package-usage.js).

Tek iş yapan çağrılar — aracın tamamını kullanmaya gerek yok:

| Sadece şunu istiyorum | Çağrı | CLI |
|---|---|---|
| Telefon numarası | `readMsisdn(opts)` | `msisdn` |
| SIM kilidi + kalan hak | `readSimLock(opts)` | `sim-lock` |
| PIN kilidini kalıcı kaldır | `disableSimPin(opts, pin)` | `sim-pin-disable --apply` |
| Ne eksik, başlanabilir mi | `assessDevice(opts)` | `assess` |
| "Ne eksik" kararı (saf, cihazsız) | `provisioningGaps({...})` | — |
| Kendi kabuk komutum | `runConsole(opts, ["uname -a"])` | `console` |

## Mimari

`src/` **düz**, klasör yok. Her dosya tek konu:

| Dosya | İş |
|---|---|
| `index.js` | **Public API — tek kapı.** Uygulama yok, yalnız ne dışa açıldığı |
| `problems.js` | Sorun kataloğu: kod + geliştirici `message`/`check` + `OPERATOR_TEXT` |
| `settings.js` | nvram sözlüğü, profiller (`field` / `factory`), zaman aşımı sabitleri |
| `net.js` | ⭐ Sıralı HTTP kuyruğu — modemin **tek bağlantılı** sunucusu; kaynak IP, retry |
| `console.js` | Telnet root shell (5123): nvram get/show + yazma (kapılı) |
| `at.js` | ⭐ AT komut katmanı (`AT+CNUM`, SIM kilidi) + **PIN denemesi politikası** |
| `device.js` | ⭐ En alt katman: `readIdentity`, `isSimPresent`, `waitForInternet`, `pcPreflight` |
| `read.js` | `verify` / `read` / `console` raporları |
| `nvram.js` | `/nvrambak.bin` ikili tam yedek çözümleyici + saf diff |
| `legacy.js` | ⭐ Eski defter şemalarını bugünküne çeviren **tek okuma sınırı** |
| `provision.js` | Provizyon motoru: oku → planla → yaz → doğrula (idempotent) |
| `pipeline.js` | Tak-çalıştır orkestrasyon. Numarayı **SIM'den kendisi okur** |
| `assess.js` | ⭐ "Ne durumda, ne eksik, **tekrar bakmalı mıyım**?" — tekrar politikası saf |
| `report.js` | JSON + insan-okunur çıktı, sır temizleme, ölçüm özeti, `call` |

`bin/ricon.js` ince bir sarmalayıcı: argv + `.env` + çekirdek çağrısı + yazdır.

`tests/surface.test.js` bunu kodla sabitliyor: `src/` altında klasör olamaz,
dosya listesi açık yazılı, `index.js` her modülü dışa açmalı.

## Çekirdek sözleşmesi

`src/` içindeki hiçbir şey **`process.env` okumaz, `argv` okumaz, stdout'a
yazmaz, `throw` etmez.** Girdi açıkça `opts` ile gelir, çıktı bir sonuç
nesnesidir. Bu yüzden aynı kod terminalden de, bir HTTP isteğinden de, başka
bir Node projesinden de çağrılabiliyor.

İş kuralları **çekirdektedir, tüketicide değil**:

- telefon numarası zorunluluğu, SIM yoksa reddetme
- PIN/PUK kilidi teşhisi ve **son PIN hakkını koruma**
- idempotency, LAN IP'nin en sona yazılması, yazma sırası
- defter satırının üretilmesi (nereye yazılacağı tüketicinin kararı)

Yeni bir arayüz yazan kişi bunları yeniden yazmaz; yanlışlıkla atlaması da
mümkün değil.

## Değişmeyen kurallar

- **Okuma komutları salt okunur.** Yazma yalnızca `apply`/`provision` içinde ve
  açık `--apply` ile.
- **Kütüphane throw etmez** — kısmi sonuç geçerli bir sonuçtur.
- **Çıktı ham/geçirgen** — cihazın alan adları korunur; eşlenmiş görünüm ek.
- **Sır çıktıya yazılmaz** — parola/PIN rapordan temizlenir.
- **Kayıtsız modem sahaya çıkmaz** — `provision` MSISDN olmadan başlamaz.
- **SIM'siz modem onaylanmaz** — ICCID yoksa hiçbir şey yazılmadan reddedilir.
  SIM'siz provizyon "başarılı" görünür ama cihaz şebekeye kaydolamaz (canlı
  doğrulandı).
- **İki ayrı soru, iki ayrı cevap:** *"ayarlar doğru mu"* (nvram geri-okuma) ve
  *"SIM çalışıyor mu"* (WAN IP geldi mi). İkincisi **PIN kilitli SIM'i yakalayan
  tek şey.** İnternetin gelmemesi provizyonu başarısız yapmaz (uyarı) — ayarlar
  doğrudur ve tekrar denemek bir şeyi çözmez.
- **PIN: son hakkı insan bile yakamaz.** "Bir hak yakıldıysa bir daha deneme"
  kuralı *aracın kendi kendine tekrarlamasına* karşıdır; operatör başka bir PIN
  denemek isterse önü kesilmez (`--force`). Geçilemeyen tek kural son hak.

## Hazırlama defteri

`provision` her modem için `data/provisioned.jsonl`'a **bir satır** yazar; süre
ölçümleri `data/metrics.jsonl`'a gider. Sahada "bu modem hazırlanmış mıydı,
hangi hat takılıydı" sorusunun tek kanıtı. Cihazın etiket seri numarası ne
HTTP'de ne nvram'da var (arandı) — kalıcı kimlik `lan_mac` + `imei` + `iccid`.

Her iki dosya da **gitignore'da**: telefon/ICCID/IMEI abonelik verisidir.

## Arayüzlü sürüm: `ui` dalı

Tarayıcı arayüzü ve HTTP/SSE sunucusu `ui` dalında **dondurulmuş** duruyor.
`main` UI'sız devam ediyor — repoya bakan biri ürünün ne olduğunu tek bakışta
görsün diye.

```bash
git switch ui && node bin/ricon.js sunucu   # http://127.0.0.1:8080
```

Bu dal bakım almaz. `kesif` (port tarama + SNMP) ve `izle` (dönemsel örnekleme)
komutları da orada: ikisi de cihazı **tanımak** için yazılmıştı, modem artık
tanınıyor.

## Kapsam dışı

Ham paket yakalama · UI/DB/entegrasyon · zaman serisi saklama.

## Ayrıntı

- [`CLAUDE.md`](CLAUDE.md) — çalışma kuralları, dil sınırı, bilinen tuzaklar
- [`docs/`](docs/) — arayüz→nvram haritası, hazırlama profili, nvram notları,
  veri sözlüğü, bulgular
