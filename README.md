# ricon_modem

Ricon **S9922M44-DOA** endüstriyel hücresel router için **keşif + tam veri
çekme + otomatik hazırlama (provizyon)** aracı. Node.js, **sıfır bağımlılık**.

RVM makinelerindeki bu modem sahada elle hazırlanıyor (web arayüzünden APN,
WLAN, LAN IP, Backup Link... ~13 ayar). Amaç: (1) cihazdan alınabilecek her
şeyi çekmek, (2) bu hazırlama sürecini **tek komuta** indirmek.

## Durum

- **Faz 1 — Her şeyi çek:** ✅ Canlı doğrulandı (sistem + SIM/hücresel + tam nvram).
- **Faz 2 — Arayüz→nvram haritası:** ✅ Tüm ayarlar nvram diff'i ile eşlendi
  (bkz. `docs/arayuz-haritasi.md`, `docs/hazirlama-profili.md`).
- **Faz 3 — Otomatik provizyon:** ✅ Motor + tak-çalıştır pipeline; sıfır
  cihazda tek komutla uçtan uca doğrulandı, idempotent.
- **51 test** (`npm test`), sıfır bağımlılık.
- **Sırada:** çok modemli saha denemesi (`hazirla --dongu` tek modemde
  kanıtlandı, seri akışta henüz denenmedi).

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
node --env-file=.env ricon.js hazirla               # bir modem
node --env-file=.env ricon.js hazirla --dongu       # çok modem (tak/çıkar döngüsü)

# ortak: --json <dosya> · --kaynak <dosya> (kayıttan, cihazsız)
```

stdout **her zaman saf JSON**; ilerleme/özet stderr'a; çıkış kodu 0 (ok)/1.

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
| `src/sim.js` | SIM/hücresel okuma + MSISDN (dış girdi, cihazda yok) |
| `src/nvram.js` | `/nvrambak.bin` ikili tam yedek çözümleyici + diff |
| `src/network.js` | Arayüz/kaynak IP, ARP + IPv6 komşu |
| `src/scanner.js` | Paralel TCP port taraması |
| `src/snmp.js` | Saf Node SNMPv2c GET |
| `src/provisioning.js` | Provizyon motoru (oku→planla→yaz→doğrula, idempotent) |
| `src/pipeline.js` | Tak-çalıştır orkestrasyon (algıla→provizyon→retry, döngü) |
| `src/profile.js` | `FIELD_PROFILE` (saha) + `FACTORY_PROFILE` (fabrika) |
| `src/problems.js` | Sorun kataloğu `{kod, severity, message, check}` |
| `src/report.js` | JSON + insan-okunur çıktı, sır temizleme |
| `src/constants.js` | Tüm sabitler (port/uç/alan haritaları) |

## Değişmeyen kurallar

- **Okuma komutları salt okunur** (oku/kesif/dogrula/izle/konsol): yalnızca
  GET / nvram okuma; yazma reddedilir. Yazma **yalnızca** `uygula`/`hazirla`
  içinde ve gerçek yazma için açık `--uygula` şart.
- Kütüphane **throw etmez** — her sonuç `problems[]` taşır; kısmi sonuç geçerli.
- Çıktı **ham/geçirgen** — cihazın alan adları korunur; eşlenmiş görünüm ek.
- **Sır çıktıya yazılmaz** — parola/kimlik rapordan temizlenir.
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
provisioned → verified at 5.5.5.1, idempotent). 48 tests, zero deps.

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
