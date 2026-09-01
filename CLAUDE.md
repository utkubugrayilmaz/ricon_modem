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

`src/` **DÜZ**, klasör yok, 14 dosya. Her dosya tek konu:

| Dosya | Konu |
|---|---|
| `index.js` | Public API — **tek kapı**. Uygulama yok, sadece re-export |
| `problems.js` | Problem kataloğu: kod + geliştirici `message`/`check` + `OPERATOR_TEXT` |
| `settings.js` | nvram sözlüğü (`SETTING_LABELS`), profiller, zaman aşımı sabitleri |
| `net.js` | HTTP istemci (sıralı kuyruk) + kaynak IP + `isReachable` |
| `console.js` | telnet root shell (5123) |
| `at.js` | AT komutları + PIN denemesi politikası |
| `device.js` | kimlik / SIM / internet okumaları + dd-wrt ayrıştırma |
| `read.js` | `verify` / `read` / `console` raporları |
| `nvram.js` | ikili nvram yedeği çözümleyici + diff |
| `legacy.js` | **eski defter şemalarını bugünküne çeviren tek okuma sınırı** |
| `provision.js` | plan → yaz → doğrula |
| `pipeline.js` | tak-çalıştır akışı (tek modem + döngü) |
| `assess.js` | "ne durumda, ne eksik, tekrar bakmalı mıyım?" |
| `report.js` | JSON + insan-okunur metin + ölçüm özeti + genel çağırıcı |

`tests/surface.test.js` bunu **kodla sabitliyor**: `src/` altında klasör
olamaz, dosya listesi açık yazılı, `index.js` her modülü dışa açmalı.

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

## Dil kuralı — v0.2.0'da TERSİNE ÇEVRİLDİ

**Yorum satırları dışında hiçbir şey Türkçe değil.** Komutlar, bayraklar, npm
script'leri, durum/olay/sebep değerleri, operatöre gösterilen metin, problem
kataloğu, `.env` adları, profil adları — hepsi İngilizce.

**Yorumlar Türkçe kalır.** Kararın NEDENİ orada; projenin en değerli kısmı.

Bu kural artık yazılı bir vaat değil, **kırmızı yanan bir test**:
`tests/no-turkish.test.js`. Doğrulanmış bir tokenizer ile `src/` + `bin/`
içindeki kod ve metin bölgelerini tarar, yorumları atlar. İki kontrol: Türkçe
harf ve ASCII'ye katlanmış Türkçe sözcük.

> **Neden test:** aynı iş iki kez yazılı kural olarak konuldu ve iki kez
> sessizce çiğnendi. `ac36919` geri alındı (`18bbd63`); 2026-08-31'de aynı
> kusur tekrarlandı ve `npm start` "Bilinmeyen profil: saha" deyip durdu —
> 216 testin hiçbiri yakalamadı. Kuralı test tutmuyorsa kural yoktur.

### Allowlist — bilerek Türkçe kalan üç bölge

| Yer | Neden |
|---|---|
| `report.js` `SECRET_FIELDS` | Sır süzgeci. Alanın *bugün* değil *hiç* taşıdığı her adı kapsamalı; daraltmak sızıntı üretir ve bir kez üretti (`kimlik`→`credentials` yapıldı, süzgeç güncellenmedi) |
| `src/legacy.js` | Eski defter satırlarını okumak için **var**. Türkçe anahtar ve değerleri taşıması onun işi |
| `bin/ricon.js` `ENV_FALLBACK`, `LEGACY_FILES`, `RENAMED_IN_0_2_0` | `.env` ve `data/` gitignore'da — her makinede ayrı durur, repo güncellemesiyle yeniden adlanmaz |

### Yeniden adlandırma yapacaksan

Düz regex yorumları ve metinleri bozar. Kod / yorum / metin / **regex**
bölgelerini ayıran bir tokenizer kullan (`tests/no-turkish.test.js` ve
`tests/undefined-names.test.js` içinde çalışan bir tane var) ve önce tüm
dosyalarda **birebir roundtrip** doğrula. Regex ayrımı şart: `/'/g` gibi
tırnak içeren bir regex naif tokenizer'ı metin moduna sokar ve dosyanın kalanı
sessizce işlenmeden kalır.

**Bayrak köprüsü:** `report.js` → `FLAG_TO_OPTION`. Tablo yalnızca CLI bayrağı
ile çekirdek alanının **ayrıştığı** yerleri tutar (`--force`→`manualConsent`);
gerisi camelCase kuralıyla geçer. Anahtarlar **tırnaklı** — çıplak anahtarlar
bir yeniden adlandırma turunda koda benzeyip çevrildi ve köprü sessizce koptu.

**TEK AYRIŞTIRICI:** `bin/ricon.js` argv'ye doğrudan bakmaz. `parseArgv` bir
kez çağrılır; `flags` (köprüden geçmiş), `positionals` (`--` sonrası) ve
`bare` (çıplak sözcükler) döner. Bekçi: `cli-contract.test.js` dosyada
`argv.includes(` ya da `flag("--` kalmadığını doğrular.

## `data/` — dokunulmaz veri

`data/provisioned.jsonl` (rollout defteri) ve `data/metrics.jsonl` (süre
ölçümleri) **gitignore'da**: telefon/ICCID/IMEI abonelik verisidir.

Bu dosyalar **dört şema birden** taşıyor. Sayıldı (2026-08-31, 23 satır):
20 Türkçe anahtar+değer · 1 Türkçe beyan · 1 İngilizce+`lanMac` ·
1 İngilizce+`lan_mac`.

**Tümü `src/legacy.js`'te, tek sınırda çözülür.** Bu iş eskiden `report.js`
içine dağılmış dokuz ayrı `alan(r, "yeni", "eski")` çağrısıyla yapılıyordu;
üçüncü kuşak gelince dokuz noktayı aynı anda doğru tutmak imkânsızlaştı.

**Kural: tanımadığın satırı ASLA DÜŞÜRME.** Sayım kaybı sessizdir ve tam bu
bir kez yaşandı — 22 satırdan 1'i filtreye takılmadığı için hiç sayılmadı.

**Adım etiketleri artık yapılandırılmış:** `{step:"write_done", count:12}`.
Eskiden etiket ayar sayısını içine gömüyordu (`"yazma bitti — 12 ayar"`) ve
kova etikete göre açıldığı için **tek mantıksal adım altı kovaya bölünüyordu**
— 23 satırlık defterde 16 kovanın 10'u aynı yazma adımıydı. Eski etiketler
`legacy.js`'te aynı kanonik adıma iniyor, iki dönem aynı kovada buluşuyor.

## `ui` dalı — dondurulmuş

Tarayıcı arayüzü (`examples/test-ui/`) ve HTTP/SSE sunucusu (`src/server.js`)
`ui` dalında **olduğu gibi** duruyor. `main` UI'sız devam ediyor. `kesif` ve
`izle` komutlarının kodu da orada.

```bash
git show ui:src/server.js          # bakmak icin
git switch ui                      # calistirmak icin
```

Bu dal **bakım almaz**; `main` geliştikçe geride kalır. Dikkat: `ui` dalı
v0.2.0 öncesi Türkçe yüzeyi kullanır.

## Silinenler ve nedeni

`kesif` (port tarama + SNMP parmak izi) ve `izle` (dönemsel örnekleme) **Faz 1
araçlarıydı** — cihazı tanımak içindi. Modem artık tanınıyor, profil çıkarıldı;
ikisi de `ui` dalında. Ölçüldü: `provision` bu dosyaların hiçbirine dokunmuyordu.

`diff` + `nvram.js` **duruyor**: arayüz→nvram eşlemesi kenarda dursun ki yeni
bir ayar eklenmek istendiğinde yeniden keşif gerekmesin.

## Yeni yetenek eklerken

1. Çekirdeğe ekle (`src/`), `src/index.js`'ten dışa aç.
2. Üç tüketiciden de erişilebilir olur: CLI · npm paketi · `call`.
3. `tests/surface.test.js`'teki dosya listesini güncelle (yeni dosya açtıysan).

> Yalnız bir tüketiciden ulaşılan bir yetenek, çekirdeğin parçası değil o
> katmanın gizli mantığıdır.

## Çalıştırma

```bash
npm test                              # cihaz gerektirmez
npm start                             # provision --loop (tak -> hazir -> cikar)
node bin/ricon.js call                # cagrilabilir tum yuzeyi listeler
node bin/ricon.js call readSimLock --host 5.5.5.1
node bin/ricon.js sim-lock-status     # salt okunur kilit durumu (hak harcamaz)
node bin/ricon.js call normalizePhone -- 05321234567
node bin/ricon.js metrics             # kaydedilmis surelerden metrik ozeti
```

`call` ile `src/index.js`'ten export edilen **her şey** adıyla çağrılır.
`--` ayracından önce opts'a karışan bayrak, sonrası konumsal argüman. Fonksiyon
`opts` alıyor mu, imzasının ilk parametresinden anlaşılır; `--pure` bunu ezer.

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
- **`sim-lock` = KİLİTLEME. Geri çevirme.** `npm run sim-lock` bilerek
  `sim-pin-enable --apply` çağırır ve gerçekten kilit koyar — sahibi bu komutu
  sunumda böyle kullandı, beklenti "sim-lock dediğimde kilitlemeli". Bir dönem
  CLI'da **aynı adla salt okunur** bir komut vardı; iki yerde tam ters anlam,
  tezgahta okuma sanıp yazma almak demekti. Çözüm karşı taraftan geldi: salt
  okunur sorgu artık **`sim-lock-status`**, çıplak `sim-lock` ise belirsizlik
  uyarısı verip 1 ile çıkar. `cli-contract.test.js` iki şeyi birden tutuyor —
  bir npm script'i CLI'daki *başka* bir komutun adını taşıyamaz, ve
  `sim-lock` CLI komutu olarak geri eklenemez. (Karar 2026-08-31.)
- **`catch` cihaz hatasını yutar, KOD hatasını yutmaz.** `isProgrammerError`
  (`problems.js`) ile ayrılır; `ReferenceError`/`TypeError` `INTERNAL_ERROR`
  olarak `problems`'a yazılır. Sebep ölçülmüş: `readIdentity` her çağrıda
  `ReferenceError` atıyordu ve iki çağrı yerindeki `catch {}` bunu sakladı,
  223 testin hiçbiri görmedi (`b3ab4ce`).
- **Operatöre giden her metin katalogdan gelir** (`problems.js`). `bin/` bir
  dönem `{ code: "ARGS", ... }` nesnelerini elle kuruyordu; katalogda
  karşılığı olmadığı için operatör sıradan bir kullanım hatası için
  *"Something unexpected happened — Report this code to IT"* görüyordu.
  `problem-codes.test.js` artık `bin/`'i de tarıyor.
- **Dosyaları kabuk yönlendirmesiyle (`>`) yazma.** Konsol kodlaması araya
  girip cp1252 baytı sızdırıyor; `tests/encoding.test.js` tam bunun için var
  ve bu kazı bir kez yaşandı.
