# examples/ — ÖRNEK (ürün değil)

Ürün `src/` altındaki çekirdek. Buradaki dosya, çekirdeğin **npm paketi gibi**
nasıl tüketileceğini gösteriyor.

```bash
node examples/paket-kullanimi.js                      # cihazsız da çalışır
node examples/paket-kullanimi.js 5.5.5.1 5.5.5.100 riconadmin PAROLA
```

Cihaz yoksa erişilemez sonuç döner, **throw etmez** — çekirdek sözleşmesi bu.

## Çekirdeğin tüketim biçimleri

| Biçim | Nasıl |
|---|---|
| **Terminal** | `node bin/ricon.js hazirla --telefon 05...` |
| **npm paketi** | `import { provisionModem } from "ricon-modem"` |
| **Herhangi bir fonksiyon** | `node bin/ricon.js calistir readSimLock` |

Üçü de **aynı** fonksiyonları çağırır.

## Neden bu ayrım önemli

Çekirdek kuralı: `src/` içindeki fonksiyonlar `opts` alır, `process.env`/`argv`
okumaz, stdout'a yazmaz, throw etmez (sonuç + `problems[]`). İş kuralları da
çekirdekte durur, tüketicide değil — telefon zorunluluğu, SIM yoksa reddetme,
PIN/PUK teşhisi ve son hakkı koruma, idempotency, LAN IP'nin en sona yazılması,
defter satırının üretilmesi.

Yani yeni bir arayüz yazan kişi bu kuralları yeniden yazmak zorunda değil;
yanlışlıkla atlaması da mümkün değil.

## HTTP endpoint isteyen

`ui` dalında çalışan bir örnek var: `src/server.js` (7 uç + SSE) ve onu
tüketen tarayıcı arayüzü.

```bash
git show ui:src/server.js
git switch ui && node bin/ricon.js sunucu
```
