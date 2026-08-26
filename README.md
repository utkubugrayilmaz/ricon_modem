# ricon_modem

Ricon **S9922M44-DOA** endüstriyel hücresel router için keşif, tam veri
çekme ve (ilerleyen fazlarda) hazırlama otomasyonu aracı. Node.js, **sıfır
bağımlılık**.

RVM makinelerindeki bu modem sahada elle hazırlanıyor (web arayüzünden APN,
WLAN, LAN IP, Backup Link ayarları). Amaç: (1) cihazdan alınabilecek her
şeyi çekmek, (2) bu hazırlama adımlarını otomatikleştirmek.

## Durum

- **Faz 1 — Her şeyi çek: TAMAM.** dogrula/kesif/oku/izle komutları çalışıyor,
  canlı cihazda doğrulandı. 21 test geçiyor.
- Faz 2 (arayüz protokolünü çöz) ve Faz 3 (otomasyon motoru): planlandı,
  henüz başlanmadı. Bkz. `docs/`.

## Kurulum

Gereksinim: **Node.js >= 24** (yalnızca yerleşik modüller kullanılır).

```bash
cp .env.example .env      # doldur (host, kullanıcı, şifre, kaynak IP)
```

Modem 192.168.1.1'de; PC'de aynı alt ağda bir ikincil IP gerekir:

```powershell
# yönetici PowerShell (tek sefer, geri alınabilir)
New-NetIPAddress -InterfaceAlias Ethernet -IPAddress 192.168.1.50 -PrefixLength 24
```

`.env` içinde `MODEM_KAYNAK_IP=192.168.1.50` verildiğinde araç giden
istekleri o adresten çıkarır (Windows `-SkipAsSource` durumunda bile çalışır).

## Kullanım

```bash
node --env-file=.env ricon.js dogrula     # ortam/erişim teşhisi
node --env-file=.env ricon.js kesif       # port + parmak izi + SNMP (salt okunur)
node --env-file=.env ricon.js oku         # HER ŞEYİ çek (sistem+SIM+ayar+nvram)
node --env-file=.env ricon.js izle --sure 60   # fark tabanlı canlı alan tespiti

# ortak: --json <dosya> çıktıyı yaz · --kaynak <dosya> kayıttan tekrar oynat
node ricon.js oku --kaynak data/oku-....json   # cihazsız
```

stdout **her zaman saf JSON**; ilerleme/özet stderr'a gider; çıkış kodu
0 (ok) / 1 (hata).

## Test

```bash
node --test        # cihaz gerektirmez; gerçek yakalanmış gövdelerle
```

## Mimari (kısa)

| Modül | İş |
|---|---|
| `ricon.js` | Tek giriş noktası, alt komutlar |
| `src/istemci.js` | ⭐ Sıralı HTTP kuyruğu — modemin **tek bağlantılı** sunucusu için. Kaynak IP bağlar, tekrar dener, yarım-gövde toleransı |
| `src/ddwrt.js` | `{anahtar::değer}` ayrıştırıcı + SIM görünümü |
| `src/nvram.js` | `/nvrambak.bin` ikili tam yedek çözümleyici + fark |
| `src/ag.js` | Arayüz/kaynak IP, ARP + IPv6 komşu ayrıştırma |
| `src/tarayici.js` | Paralel TCP port taraması |
| `src/snmp.js` | Saf Node SNMPv2c GET |
| `src/sorunlar.js` | Sorun kataloğu `{code, severity, message, check}` |
| `src/rapor.js` | JSON + insan-okunur çıktı, sır temizleme |
| `src/sabitler.js` | Tüm sabitler (port/uç/alan haritaları) |

## Değişmeyen kurallar

- **Faz 1 salt okunur.** oku/kesif/dogrula/izle yalnızca GET yapar; istemci
  bu modda POST'u reddeder. Yanlış bir ayar makineyi internetten koparır.
- Kütüphane **throw etmez** — her sonuç `problems[]` taşır; kısmi okuma
  gerçek sonuçtur.
- Çıktı **ham/geçirgen** — cihazın alan adları korunur; eşlenmiş görünüm ek.
- **Sır çıktıya yazılmaz** — parola/kimlik rapordan temizlenir.
- Yorumlar Türkçe, çalışma zamanı metinleri İngilizce; kod adları ASCII.

## Kapsam dışı

Ham paket yakalama · UI/DB/Slack/Monday · zaman serisi saklama · (Faz 3'e
kadar) yazma/provizyon.

## Cihaz notları

Tüm ölçülmüş protokol bilgisi: `docs/BULGULAR.md`. Yetenek özeti:
`docs/YETENEKLER.md`. Alan sözlüğü: `docs/veri-sozlugu.md`.

---

# ricon_modem (English)

Zero-dependency Node.js tool for discovering, fully reading, and (in later
phases) automating the provisioning of the Ricon **S9922M44-DOA** industrial
cellular router.

**Phase 1 (read everything) is done and verified against the live device**
(dogrula/kesif/oku/izle commands, 21 passing tests). Phases 2 (reverse the
web UI protocol) and 3 (idempotent provisioning engine) are planned; see
`docs/`.

Requires Node >= 24. Configure `.env` from `.env.example`, add a secondary IP
in the modem subnet, then `node --env-file=.env ricon.js oku`. stdout is
always pure JSON; progress goes to stderr; exit code is 0/1 from `ok`.

Rules that do not change: Phase 1 is read-only (GET only; the client refuses
POST in this mode — a wrong setting would cut the machine off the internet);
the library never throws (every result carries `problems[]`); output is
raw/pass-through (device field names preserved); secrets are scrubbed from
output. Comments are Turkish, runtime strings English, identifiers ASCII.
