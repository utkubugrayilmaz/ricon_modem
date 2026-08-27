# examples/ — ÖRNEKLER (ürün değil)

Buradaki hiçbir şey ürün değil. **Ürün `src/` altındaki çekirdek** ve onun
HTTP API'si. Bu klasör, çekirdeğin nasıl tüketileceğini gösteren örnekler ve
bizim kendi testimiz için yazdığımız arayüzden oluşur.

Çekirdeğin üç tüketim biçimi var; hepsi **aynı** fonksiyonları çağırır:

| Biçim | Nasıl | Örnek |
|---|---|---|
| **Terminal** | `node ricon.js hazirla --telefon 05...` | `../ricon.js` (ince CLI) |
| **npm paketi** | `import { provisionModem } from "ricon-modem"` | `paket-kullanimi.js` |
| **HTTP endpoint** | `POST/GET /api/*` | `endpoint-kullanimi.md` |

## Neden bu ayrım önemli

Çekirdek kuralı: `src/` içindeki fonksiyonlar **`opts` alır**,
`process.env`/`argv` **okumaz**, stdout'a **yazmaz**, **throw etmez**
(sonuç + `problems[]`). Bu yüzden aynı kod hem terminalden hem bir HTTP
isteğinden hem başka bir Node projesinden çağrılabiliyor.

İş kuralları da çekirdekte durur, tüketicide değil:

- telefon numarası zorunluluğu
- SIM yoksa reddetme, PIN/PUK kilidi teşhisi, son PIN hakkını koruma
- idempotency, LAN IP'nin en sona yazılması, yazma sırası
- defter kaydının **üretilmesi** (nereye yazılacağı tüketicinin kararı)

Yani yeni bir arayüz yazan kişi bu kuralları yeniden yazmak zorunda değil;
yanlışlıkla atlaması da mümkün değil.

## test-ui/

Bizim kendi testimiz için yazılmış tarayıcı arayüzü. Düz HTML/CSS/JS, build
yok, sıfır bağımlılık. Sahaya çıkacak ürün bu değil — çekirdeği çalıştırıp
gözle doğrulamak, süreleri ölçmek ve akışı denemek için var.

```bash
node --env-file=.env ricon.js sunucu              # arayüzle (varsayılan)
node --env-file=.env ricon.js sunucu --arayuz yok # SALT API, arayüz yok
node --env-file=.env ricon.js sunucu --arayuz /baska/dizin
```

Sunucu `staticDir` verilmezse **salt API**'dir: arayüz gömülü değil.
