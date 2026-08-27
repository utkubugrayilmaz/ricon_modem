# ricon_modem

Ricon **S9922M44-DOA** endüstriyel hücresel router için **keşif + tam veri
çekme + otomatik hazırlama (provizyon)** aracı. Node.js, **sıfır bağımlılık**.

RVM makinelerindeki bu modem sahada elle hazırlanıyor (web arayüzünden APN,
WLAN, LAN IP, Backup Link... ~13 ayar). Amaç: (1) cihazdan alınabilecek her
şeyi çekmek, (2) bu hazırlama sürecini **tek komuta** indirmek.

## Durum

> Oturum devri / kaldigimiz yer: **[docs/DEVAM.md](docs/DEVAM.md)**

- **Faz 1 — Her şeyi çek:** ✅ Canlı doğrulandı (sistem + SIM/hücresel + tam nvram).
- **Faz 2 — Arayüz→nvram haritası:** ✅ Tüm ayarlar nvram diff'i ile eşlendi
  (bkz. `docs/arayuz-haritasi.md`, `docs/hazirlama-profili.md`).
- **Faz 3 — Otomatik provizyon:** ✅ Motor + tak-çalıştır pipeline; sıfır
  cihazda tek komutla uçtan uca doğrulandı, idempotent.
- **Faz 4 — Arayüz:** ✅ HTTP endpoint (SSE) + tarayıcı UI; çekirdeğin
  **üçüncü tüketicisi** (terminal · npm paketi · HTTP/UI).
- **148 test** (`npm test`), sıfır bağımlılık.
- **Faz 5 — SIM ile konuşma:** ✅ Telefon numarası **cihazdan** okunuyor
  (`AT+CNUM`), SIM PIN/PUK kilidi ve kalan hak modülden geliyor.
- **Sırada:** bkz. [docs/DEVAM.md](docs/DEVAM.md) — 1 açık hata + iş listesi.

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
node --env-file=.env ricon.js izle --sure 60   # fark tabanlı canlı alan tespiti
node --env-file=.env ricon.js fark A.json B.json   # iki nvram anlık görüntüsü diff

# Provizyon (yazma) — varsayılan KURU (dry-run); gerçek yazma --uygula ister
node --env-file=.env ricon.js uygula                # ne değişecek (yazmaz)
node --env-file=.env ricon.js uygula --uygula --yeni-host 5.5.5.1 --yeni-kaynak 5.5.5.100

# Tak-çalıştır: algıla → provizyon → doğrula → başarıya kadar
# TELEFON ZORUNLU. Cihazdan okunabiliyorsa otomatik gelir; okunamazsa sorar.
node --env-file=.env ricon.js hazirla --telefon 05321234567   # bir modem
#   NOT: numara artık cihazdan okunabiliyor (AT+CNUM); elle giriş FALLBACK
node --env-file=.env ricon.js hazirla --dongu   # çok modem: her modemde sorar
node --env-file=.env ricon.js hazirla --telefon 05321234567 --internet-bekle 0
                                                # SIM doğrulamasını atla

# Tarayıcı arayüzü (UI) — çekirdeği tüketen üçüncü katman
node --env-file=.env ricon.js sunucu          # http://127.0.0.1:8080

# Metrik: süreler kalıcı kaydedilir, tek komutla özetlenir
node ricon.js olcum-elle --dk 15.5 --kim "teknisyen A"   # elle sürecin kronometresi
node ricon.js olcum --modem-sayisi 400                   # özet + karşılaştırma

# ortak: --json <dosya> · --kaynak <dosya> (kayıttan, cihazsız)
#        --host <ip> · --kaynak-ip <ip> (.env'i ezer; modem o an neredeyse)
```

stdout **her zaman saf JSON**; ilerleme/özet stderr'a; çıkış kodu 0 (ok)/1.

## Ne ÜRÜN, ne ÖRNEK

**Ürün:** `src/` altındaki çekirdek + HTTP API. Üç biçimde tüketilir, hepsi
**aynı** fonksiyonları çağırır:

| Biçim | Nasıl |
|---|---|
| Terminal | `node ricon.js hazirla --telefon 05...` |
| npm paketi | `import { provisionModem } from "ricon-modem"` |
| HTTP endpoint | `GET /api/hazirla?telefon=05...` (SSE) |

**Örnek (ürün DEĞİL):** `examples/` — bizim test arayüzümüz ve kullanım
örnekleri. Bkz. [examples/README.md](examples/README.md) ·
[paket-kullanimi.js](examples/paket-kullanimi.js) ·
[endpoint-kullanimi.md](examples/endpoint-kullanimi.md).

İş kuralları **tüketicide değil çekirdektedir**: telefon zorunluluğu, SIM
yoksa reddetme, PIN/PUK kilidi teşhisi ve son PIN hakkının korunması,
idempotency, LAN IP'nin en sona yazılması, yazma sırası, defter kaydının
üretilmesi. Yeni bir arayüz yazan kişi bunları yeniden yazmaz; yanlışlıkla
atlaması da mümkün değil.

## Test arayüzü (examples/test-ui)

```bash
node --env-file=.env ricon.js sunucu              # arayüzle
node --env-file=.env ricon.js sunucu --arayuz yok # SALT API, arayüz yok
```

İki ekran: (1) büyük telefon numarası girişi — 11 hane hücresi, eksik/fazla
giremez; (2) sol **beyaz** panel kurulum öncesi, sağ **yeşil** panel kurulum
sonrası — satırlar geldikçe `yazılıyor → yazıldı → doğrulandı` olarak güncellenir.
Onaylayınca ilk ekrana döner, sıradaki modem takılır.

Arayüz sunucuya **gömülü değil**: `staticDir` verilmezse sunucu salt API'dir.
Tarayıcı nvram anahtarı bile bilmez — satırlar ekrana hazır gelir. Çekirdek
sunucuyu **tanımaz**.

Güvenlik: sunucu varsayılan olarak **yalnız `127.0.0.1`**'i dinler — bu servis
cihaza yazar, ağa açılması açık bir karar olmalı (`--dinle 0.0.0.0`).

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

## Modülerlik düsturu

redbox-device kalıbı: çekirdek `src/index.js`'te importlanabilir fonksiyonlar
(`readDevice`, `checkDevice`, `discoverDevice`, `applyProvisioning`,
`provisionModem`...) — hepsi `opts` alır, `process.env`/argv OKUMAZ, throw
etmez (sonuç + `problems[]`). Aynı çekirdek: **terminal** (ince CLI, .env
okur), **npm paketi** (`import { readDevice } from "ricon-modem"`), ya da
ileride **HTTP endpoint** ile tüketilir.

## Mimari

| Modül | İş |
|---|---|
| `ricon.js` | İnce CLI — argv + .env + `index` çağrısı |
| `src/index.js` | Public API (tüm çekirdek fonksiyonlar) |
| `src/client.js` | ⭐ Sıralı HTTP kuyruğu — modemin **tek bağlantılı** sunucusu; kaynak IP, retry, yarım-gövde toleransı |
| `src/console.js` | Telnet root shell (5123): nvram get/show + yazma (kapılı) + retry |
| `src/ddwrt.js` | `{anahtar::değer}` ayrıştırıcı + SIM görünümü |
| `src/sim.js` | SIM/hücresel okuma (HTTP) + `Status of SIM` çözümleyici |
| `src/at.js` | ⭐ AT komut katmanı — telefon numarası (`AT+CNUM`), SIM kilidi, PIN kaldırma |
| `src/nvram.js` | `/nvrambak.bin` ikili tam yedek çözümleyici + diff |
| `src/network.js` | Arayüz/kaynak IP, ARP + IPv6 komşu |
| `src/scanner.js` | Paralel TCP port taraması |
| `src/snmp.js` | Saf Node SNMPv2c GET |
| `src/provisioning.js` | Provizyon motoru (oku→planla→yaz→doğrula, idempotent) |
| `src/pipeline.js` | Tak-çalıştır orkestrasyon (algıla→provizyon→retry, döngü) |
| `src/profile.js` | `FIELD_PROFILE` (saha) + `FACTORY_PROFILE` (fabrika) |
| `src/problems.js` | Sorun kataloğu `{kod, severity, message, check}` |
| `src/report.js` | JSON + insan-okunur çıktı, sır temizleme, `settingLabel` |
| `src/metrics.js` | Ölçüm özetleyici (PURE) — süre istatistikleri, karşılaştırma |
| `src/constants.js` | Tüm sabitler (port/uç/alan/**ayar sözlüğü** haritaları) |
| `src/server.js` | HTTP endpoint + SSE — çekirdeği **tüketir**, kural eklemez. `staticDir` verilmezse SALT API |
| `examples/` | **ÖRNEKLER — ürün değil:** test arayüzü, paket/endpoint kullanımı |

## Değişmeyen kurallar

- **Okuma komutları salt okunur** (oku/kesif/dogrula/izle/konsol): yalnızca
  GET / nvram okuma; yazma reddedilir. Yazma **yalnızca** `uygula`/`hazirla`
  içinde ve gerçek yazma için açık `--uygula` şart.
- Kütüphane **throw etmez** — her sonuç `problems[]` taşır; kısmi sonuç geçerli.
- Çıktı **ham/geçirgen** — cihazın alan adları korunur; eşlenmiş görünüm ek.
- **Sır çıktıya yazılmaz** — parola/kimlik rapordan temizlenir.
- **Kayıtsız modem sahaya çıkmaz** — `hazirla` telefon numarası (MSISDN)
  olmadan başlamaz; kural **çekirdekte** (`provisionModem`), yalnız CLI'da
  değil — HTTP endpoint/UI aynı kuralı devralır.
- **SIM'siz modem onaylanmaz** — kimlik en başta okunur, ICCID yoksa hiçbir şey
  yazılmadan reddedilir. SIM'siz provizyon "başarılı" görünür ama cihaz
  şebekeye kaydolamaz (canlı doğrulandı).
- **İki ayrı soru, iki ayrı cevap:** *"ayarlar doğru mu"* (nvram geri-okuma,
  ~45 sn) ve *"SIM çalışıyor mu"* (WAN IP geldi mi). İkincisi teknisyenin elle
  yaptığı kontrolün otomatiği — **PIN kilitli SIM'i yakalayan tek şey bu.**
  İnternetin gelmemesi provizyonu başarısız yapmaz (uyarı), çünkü ayarlar
  doğrudur ve tekrar denemek hiçbir şeyi çözmez.
- **Kod adları İngilizce, yorumlar Türkçe**; CLI komutları ve `.env`
  değişkenleri Türkçe (kullanıcı yüzeyi); JSON çıktı anahtarları Türkçe (veri
  sözlüğü). Bkz. `docs/`.

## Kapsam dışı
Ham paket yakalama · UI/DB/entegrasyon · zaman serisi saklama.

---

# ricon_modem (English)

Zero-dependency Node.js tool to **discover, fully read, and automatically
provision** the Ricon **S9922M44-DOA** industrial cellular router.

All three phases are done and verified on the live device: read-everything
(system + SIM/cellular + full nvram), UI→nvram mapping (every setting matched
via nvram diff), and one-command provisioning (fresh device → fully
provisioned → verified at 5.5.5.1, idempotent). 95 tests, zero deps.

Core logic lives in importable `opts`-taking functions in `src/index.js`
(`readDevice`, `applyProvisioning`, `provisionModem`...) consumed as a CLI, an
npm package, or (later) an HTTP endpoint. The library never throws (results
carry `problems[]`). Read commands are read-only; writing happens only in
`uygula`/`hazirla` and requires an explicit `--uygula` flag. Identifiers are
English; comments, CLI command names, `.env` vars and JSON output keys are
Turkish (the team's surface/domain vocabulary).
```
node --env-file=.env ricon.js hazirla   # detect → provision → verify
```
