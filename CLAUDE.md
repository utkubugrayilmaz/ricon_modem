# CLAUDE.md — ricon_modem

Bu dosya her yeni oturumda okunur. Amacı: aynı kararları yeniden tartışmamak,
daha önce bir kez geri alınmış işleri tekrar bozmamak.

## Ürün ne

Ricon **S9922M44-DOA** endüstriyel hücresel router'ı **sahaya hazırlama**
otomasyonu. RVM makinelerindeki bu modem eskiden web arayüzünden elle
hazırlanıyordu (~13 ayar, ~15 dk). Araç bunu tek komuta indiriyor.

**Ürün `src/` çekirdeğidir.** `bin/ricon.js` ince bir sarmalayıcı: argv
ayrıştırır, `.env` okur, çekirdeği çağırır, yazdırır. Aynı çekirdek üç yerden
tüketilir: **terminal CLI** · **npm paketi** (`import { provisionModem } from
"ricon-modem"`) · istenirse **dışarıdan sarılacak bir HTTP katmanı**.

## Yerleşim

`src/` **DÜZ**, klasör yok, 13 dosya. Her dosya tek konu:

| Dosya | Konu |
|---|---|
| `index.js` | Public API — **tek kapı**. Uygulama yok, sadece re-export |
| `problems.js` | Problem kataloğu: kod + İngilizce `message`/`check` + Türkçe operatör metni |
| `settings.js` | nvram sözlüğü (`SETTING_LABELS`), profiller, zaman aşımı sabitleri |
| `net.js` | HTTP istemci (sıralı kuyruk) + kaynak IP + `isReachable` |
| `console.js` | telnet root shell (5123) |
| `at.js` | AT komutları + PIN denemesi politikası |
| `device.js` | kimlik / SIM / internet okumaları + dd-wrt ayrıştırma |
| `read.js` | `dogrula` / `oku` / `konsol` raporları |
| `nvram.js` | ikili nvram yedeği çözümleyici + diff |
| `provision.js` | plan → yaz → doğrula |
| `pipeline.js` | tak-çalıştır akışı (tek modem + döngü) |
| `assess.js` | "ne durumda, ne eksik, tekrar bakmalı mıyım?" |
| `report.js` | JSON + insan-okunur metin + ölçüm özeti + genel çağırıcı |

`tests/surface.test.js` bunu **kodla sabitliyor**: `src/` altında klasör
olamaz, dosya listesi açık yazılı, `index.js` her modülü dışa açmalı. Yeni bir
dosya eklemek bilinçli bir karar olmalı — testi güncellemek o kararı görünür
kılar.

## Çekirdek sözleşmesi

`src/` içindeki hiçbir şey **`process.env` okumaz, `argv` okumaz, stdout'a
yazmaz, `throw` etmez.** Girdi açıkça `opts` ile gelir, çıktı bir sonuç
nesnesidir: `{ ok, ...veri, problems: [] }`. Yarım okuma gerçek bir sonuçtur;
bir exception onu taşıyamaz.

İş kuralları **çekirdektedir, tüketicide değil**: telefon zorunluluğu, SIM
yoksa reddetme, PIN/PUK teşhisi ve son PIN hakkını koruma, idempotency, LAN
IP'nin en sona yazılması, yazma sırası, defter satırının üretilmesi.

**CLI sözleşmesi:** stdout **her zaman** saf JSON; ilerleme/özet stderr'a;
çıkış kodu `ok`'tan. `--help` çıkış kodu 0 (yardım istemek hata değil).

## Dil kuralı — SINIRI AŞMA

**İngilizce:** dosya adları, fonksiyon/değişken adları, JSON çıktı alan
adları, problem kodları.

**Değişmez:**

- **CLI komut ve bayrak adları** — `hazirla`, `oku`, `degerlendir`, `--dongu`,
  `--profil`, `--kaynak-ip`, `--zorla` … Tezgahtaki teknisyenin ezberi.
- **Profil adları** `saha` / `fabrika` — defterdeki geçmiş satırlarda da yazılı.
- **`.env` adları** — `MODEM_HOST`, `MODEM_KULLANICI`, `MODEM_SIFRE`,
  `MODEM_KAYNAK_IP`.
- **Cihazın kendi nvram anahtarları** — `lan_mac`, `wan_ip`, `lan_ipaddr`,
  `m1simiccid`, `w1_wan_proto`, `m1s1simpin` … Modemin verisi, bizim adımız değil.
- **Yorumlar** — kararın NEDENİ orada; projenin en değerli kısmı.
- **Operatöre gösterilen metin** ve **ölçüm adım etiketleri**.

> **Neden bu kadar kesin:** aynı iş bir kez yapıldı (`ac36919`) ve **geri
> alındı** (`18bbd63`). Denetimde (`af9ccf8`) bulunan beş kusurun **dördü** tam
> bu sınırı aşmaktan çıkmıştı: `--dongu` sessizce `--cycle` oldu; profil
> `saha` → `field` olunca `PROFILES["field"]` undefined döndü ve sunucu hiç
> açılmadı; arayüz ID string'leri çevrilmeyince her eleman `null` geldi;
> `lan_mac` → `lanMac` olunca eski defter satırları okunamaz oldu.

**Bayrak köprüsü:** CLI bayrağı Türkçe, çekirdek alanı İngilizce. Çeviri **tek
yerde**: `report.js` → `FLAG_TO_OPTION`. Tablonun anahtarları **tırnaklı** —
çıplak anahtarlar bir yeniden adlandırma turunda koda benzeyip çevrildi ve
köprü sessizce koptu.

**Yeniden adlandırma yapacaksan:** düz regex yorumları ve metinleri bozar. Kod
/ yorum / metin / **regex** bölgelerini ayıran bir tokenizer kullan ve önce
tüm dosyalarda **birebir roundtrip** doğrula. Regex ayrımı şart: `/'/g` gibi
tırnak içeren bir regex naif tokenizer'ı metin moduna sokar ve dosyanın kalanı
sessizce işlenmeden kalır.

## `data/` — dokunulmaz veri

`data/hazirlanan.jsonl` (rollout defteri) ve `data/olcumler.jsonl` (süre
ölçümleri) **gitignore'da**: telefon/ICCID/IMEI abonelik verisidir.

Bu dosyalar **iki şema birden** taşıyor — eski satırlar Türkçe anahtarlı
(`zaman/tur/toplam_sn/adimlar`), yeniler İngilizce
(`timestamp/kind/totalSec/steps`). `summarizeMetrics` **ikisini de okur**
(anahtar *ve* değer: `"kurulum"`/`"run"`). Bu uydurma bir önlem değil: filtre
tek şemaya bakarken 22 satırdan biri sessizce sayılmıyordu.

**Adım etiketleri çevrilmez** (`"modem algılandı"`, `"reboot gönderildi"`).
`stepSummary` kovaları ada göre toplar; etiket değişirse kova ikiye bölünür ve
medyan karşılaştırması anlamını yitirir.

## `ui` dalı — dondurulmuş

Tarayıcı arayüzü (`examples/test-ui/`) ve HTTP/SSE sunucusu (`src/server.js`)
`ui` dalında **olduğu gibi** duruyor. `main` UI'sız devam ediyor. `kesif` ve
`izle` komutlarının kodu da orada.

```bash
git show ui:src/server.js          # bakmak icin
git switch ui                      # calistirmak icin
```

Bu dal **bakım almaz**; `main` geliştikçe geride kalır.

## Silinenler ve nedeni

`kesif` (port tarama + SNMP parmak izi) ve `izle` (dönemsel örnekleme) **Faz 1
araçlarıydı** — cihazı tanımak içindi. Modem artık tanınıyor, profil çıkarıldı;
ikisi de `ui` dalında. Ölçüldü: `hazirla` bu dosyaların hiçbirine dokunmuyordu.

`fark` + `nvram.js` **duruyor**: arayüz→nvram eşlemesi kenarda dursun ki yeni
bir ayar eklenmek istendiğinde yeniden keşif gerekmesin.

## Yeni yetenek eklerken

1. Çekirdeğe ekle (`src/`), `src/index.js`'ten dışa aç.
2. Üç tüketiciden de erişilebilir olur: CLI · npm paketi · `calistir`.
3. `tests/surface.test.js`'teki dosya listesini güncelle (yeni dosya açtıysan).

> Yalnız bir tüketiciden ulaşılan bir yetenek, çekirdeğin parçası değil o
> katmanın gizli mantığıdır.

## Çalıştırma

```bash
npm test                              # cihaz gerektirmez
npm start                             # hazirla --dongu (tak -> hazir -> cikar)
node bin/ricon.js calistir            # cagrilabilir tum yuzeyi listeler
node bin/ricon.js calistir readSimLock --host 5.5.5.1
node bin/ricon.js calistir normalizePhone -- 05321234567
node bin/ricon.js olcum               # kaydedilmis surelerden metrik ozeti
```

`calistir` ile `src/index.js`'ten export edilen **her şey** adıyla çağrılır.
`--` ayracından önce opts'a karışan bayrak, sonrası konumsal argüman. Fonksiyon
`opts` alıyor mu, imzasının ilk parametresinden anlaşılır; `--saf` bunu ezer.

## Bilinen tuzaklar

- **Kaynak IP vermeden yoklama yapma.** Ölçüldü (kurumsal ağ): kaynak IP
  bağlanmadan yapılan connect bu makinede **her** adrese "başarılı" dönüyor.
  Kaynaksız çağrı "her cihaz ayakta" der ve teşhis çöker.
- **Modemin web sunucusu tek bağlantılı.** Tüm HTTP `net.js`'teki sıralı
  kuyruğun arkasından geçer. Başka hiçbir modül doğrudan istek atmaz.
- **PIN: son hakkı insan bile yakamaz.** "Bir hak yakıldıysa bir daha deneme"
  kuralı *aracın kendi kendine tekrarlamasına* karşıdır; operatör başka bir PIN
  denemek isterse önü kesilmez. Geçilemeyen tek kural son hak — orada yanlış
  PIN SIM'i PUK'a kilitler.
- **Provizyon HTTP formu değil, telnet + nvram üzerinden yazar** (`console.js`).
