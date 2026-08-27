# ÖRNEK: HTTP endpoint kullanımı

Çekirdeğin üçüncü tüketim biçimi. Arayüz gerektirmez — `--arayuz yok` ile
sunucu **salt API** olarak çalışır.

```bash
node --env-file=.env ricon.js sunucu --port 8080 --arayuz yok
```

Güvenlik: varsayılan olarak yalnızca `127.0.0.1` dinlenir. Bu servis cihaza
**yazar**; ağa açmak açık bir karar olmalı (`--dinle 0.0.0.0`).

## Uçlar

### `GET /api/durum` — modem nerede, PC hazır mı (salt okunur)

```bash
curl -s http://127.0.0.1:8080/api/durum
```

```json
{"ok":true,
 "pc":{"hazir":true,"fabrika_kaynak":"192.168.1.50","saha_kaynak":"5.5.5.100","problems":[]},
 "modem":{"konum":"saha","host":"5.5.5.1"},
 "profil":"saha","sifirlanabilir":true,"mesgul":false}
```

### `GET /api/hazirla?telefon=05...&pin=1234` — provizyon (SSE akışı)

`telefon` **zorunlu** (kural çekirdekte). `pin` **opsiyonel** ve yalnızca
internet gelmezse / SIM PIN kilitli çıkarsa denenir.

```bash
curl -s -N "http://127.0.0.1:8080/api/hazirla?telefon=05321234567"
```

Olaylar (`event:` adı + JSON `data:`):

| Olay | Ne zaman | İçerik |
|---|---|---|
| `ilerleme` | her adımda | `{mesaj}` |
| `kimlik_once` | kurulum öncesi | ICCID/IMEI/MAC/SIM durumu |
| `algilandi` | modem bulundu | `{eylem, konum}` |
| `plan` | ayarlar okundu | ekrana hazır satırlar (`ad, once, sonra, degisecek`) |
| `yaziliyor` / `yazildi` | grup grup | `{grup, anahtarlar}` |
| `reboot` | reboot gönderildi | — |
| `dogrulama` / `dogrulandi` | geri okuma | `{deneme, kalan}` / `{bekleme_sn}` |
| `sim_kilit` | PIN/PUK kilidi | `{kilit, pin_kalan, puk_kalan, ham}` |
| `internet_bekleniyor` / `internet` | SIM doğrulaması | `{gecen_sn}` / `{var, wan_ip, sure_sn}` |
| `sonuc` | bitti | `{durum, ok, deneme, kayit, problems}` |
| `hata` | başlamadan reddedildi | `{kod, mesaj, cozum}` |

### `GET /api/fabrikaya-dondur` — fabrika profiline geri al (SSE)

Telefon istemez. Provizyonun aynası: cihaz neredeyse oradan okur, fabrika
değerlerini yazar, reboot eder, `192.168.1.1`'de doğrular.

### `GET /api/pin?pin=1234` — SADECE PIN dene (SSE)

Ayrı iş: provizyon tekrarlanmaz. Yalnızca PIN yazılır, reboot edilir, internet
tekrar beklenir. Korumalar çekirdekte: biçim kontrolü, aynı PIN tekrar
yazılmaz, **son hak otomatik yakılmaz**.

### `POST /api/olcum` — süre ölçümünü kaydet

Gövde JSON (en fazla 64 KB). Sunucu yalnızca zamanı damgalar ve satırı yazar.

## Notlar

- Aynı anda **tek** iş çalışır (cihaz tek bağlantılı) — ikinci istek
  `{"kod":"MESGUL"}` alır.
- Tarayıcı/istemci akıştan kopsa bile cihaza **yazma yarıda kesilmez**;
  iş çekirdekte tamamlanır ve defter yine yazılır.
- `EventSource` akış kapanınca kendiliğinden yeniden bağlanır; istemci
  `sonuc`/`hata` aldığında bağlantıyı **kapatmalı** (yoksa iş ikinci kez başlar).
