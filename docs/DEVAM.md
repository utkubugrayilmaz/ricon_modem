# Kaldığımız yer — 2026-08-28

Bugün **tam zincir canlı çalıştı**: modem takıldı → numara SIM'den okundu →
kurulum → doğrulama. PIN'li SIM kolu da gerçek bir kilitli SIM'de sınandı ve
**tek bir deneme hakkı yanmadan** kilit kaldırıldı.

Test: **196/196**. Sıradaki iş: **çok modemli seri akış (`--dongu`)**.

## Cihazın şu anki fiziksel durumu

| | |
|---|---|
| Modem | `192.168.1.1` (fabrika ayarlarında) |
| SIM | PIN kilidi **KAPALI** (araçla kaldırıldı), numara `5350634830` |
| Kalan hak | PIN **3/3**, PUK 10 — el değmemiş |
| İnternet | çalışıyor (son görülen WAN IP `178.245.229.178`) |
| PC | `192.168.1.50` + `5.5.5.100` ikincil IP'ler kalıcı |
| Not | Kablo çıkarken bu IP'ler "Deprecated" olur ve araç göremez — hata değil |

---

## 1) Bugün canlı doğrulanan akış

```
modem takıldı
   ↓  /api/degerlendir → assessDevice()     [~5 sn, modem başına BİR KEZ]
   ├─ SIM yok        → "SIM takılı değil"
   ├─ PIN kilitli    → ekranda kalan hak + [Kilidi kaldır ve numarayı oku]
   │                     ↓ /api/pin-kaldir → simPinKaldir()   ✅ CANLI
   │                     ↓ kilit kalktı → değerlendirme KENDİLİĞİNDEN tekrar
   │                     ↓ numara ekrana geldi
   └─ PIN yok        → numara direkt okundu → alan doldu + kilitlendi   ✅ CANLI
   ↓
numara hiç okunamazsa → operatör yazar (yedek yol, duruyor)
   ↓
[Kurulumu başlat] → provizyon → numara `router_name` → doğrula   ✅ CANLI
```

6 SIM alındı, **hepsi PIN'siz geldi**. Yani PIN kolu ana yol değil, emniyet
ağı. Turkcell'den "PIN kapalı SIM" talebi maddesi bu yüzden kapandı.

## 2) Bugün çözülen hatalar

**a) Numara okuma 143 sn'de başarısız oluyordu.** Hipotez (tek bağlantılı
cihaz, HTTP'den sonra telnet çarpışıyor) ölçüldü ve **çürüdü** — HTTP'den hemen
sonra telnet 5.8 sn'de okuyor. Gerçek sebep hata mesajındaki `aşama 2`: kimlik
boş gidiyordu. HTTP katmanı kimliği iç içe taşıyor (`{kimlik:{...}}`), konsol
katmanı düz bekliyordu. Çözüm: `konsolKimligi()` sınırda normalize eder + **kimliksiz
deneme yok** (`CONSOLE_KIMLIK_YOK`, ağa hiç çıkmaz). 143 sn → **4.9 sn**.

**b) `eksik: ["telefon"]` numara okunduğu halde kalıyordu.** `assessDevice`
kararı ham girdiye soruyordu, çözülmüş numaraya değil.

**c) `AT+CLCK="SC",2` (sorgu) yazma sanılıp engelleniyordu.** Filtre
`^AT+CLCK=` diye bakıyordu; sorgu formu da `=` içeriyor. Sonuç: `simPinKaldir`
doğrulama adımı boş cevap alıyor, kilit gerçekten kalksa bile "kaldırılamadı"
diyordu. Canlı denemeden ÖNCE yakalandı. `atYazanMi()` mode 2'yi ayırıyor.

**d) Arayüz ham İngilizce geliştirici metni basıyordu** — teknisyene
`New-NetIPAddress -InterfaceAlias Ethernet ...` yazıyordu. 31 sorun kodunun
Türkçe karşılığı çekirdeğe (`src/report.js` `SORUN_TR`) yazıldı; arayüz artık
yalnızca `tr` basıyor. Nöbetçi test: çevirisi olmayan kod VE Türkçe metinde
teknik komut geçmesi kırmızı yapar.

**e) Yeni CLI komutları `ok`'u sabit `true` yazıyordu** — erişilemeyen modemde
kabuğa 0 dönüyordu. `problems`'tan türetiliyor.

## 3) Modülerlik denetimi (redbox kalıbı)

Mantık doğru modüllerdeydi ama **CLI'dan erişilemiyordu**: `assessDevice`,
`readMsisdn`, `simPinKaldir` yalnız HTTP/import ile çağrılabiliyordu.

**Kural (README'ye yazıldı):** bir yetenek çekirdeğe eklenir ve **her üç
tüketiciden de** erişilebilir olur. Yalnız endpoint'ten ulaşılan bir yetenek,
çekirdeğin parçası değil o katmanın gizli mantığıdır.

| Sadece şunu istiyorum | Çağrı | CLI |
|---|---|---|
| Telefon numarası | `readMsisdn` | `ricon.js numara` |
| SIM kilidi + kalan hak | `readSimLock` | `ricon.js sim-kilit` |
| PIN kilidini kaldır | `simPinKaldir` | `ricon.js sim-pin-kaldir --uygula` |
| PIN kilidini AÇ (SADECE TEST) | `simPinKilitle` | `ricon.js sim-pin-kilitle --uygula` |
| Ne eksik, başlanabilir mi | `assessDevice` | `ricon.js degerlendir` |
| Karar (SAF, cihazsız) | `provisionEksikleri`, `simKilidiUygunMu` | — |
| Kendi kabuk komutum | `runConsole` | `ricon.js konsol` |

`package.json`'a `files: ["src","ricon.js","README.md"]` — `examples/` ve
`data/` pakete girmez.

## 4) PIN korumaları (hepsi çekirdekte, PURE + test edilmiş)

`simKilidiUygunMu` / `simKilitKaldirmaKarari` (12 test). Sıra önemli:

1. PIN biçimi bozuksa cihaza **hiç gitmez**
2. PUK kilidi → insan müdahalesi, denenmez
3. SIM yok / durum okunamadı → dokunulmaz
4. **kalan < toplam → DENENMEZ** (kullanıcı kuralı: birileri daha önce yanlış
   PIN girmiş, emin olmadan devam etmek ikinci hakkı da yakar). `zorla` geçer.
5. **SON hak asla yakılmaz** — `zorla` bile geçemez
6. Kalan sayaç okunamadıysa iş durmaz, `PIN_KALAN_BILINMIYOR` uyarısı taşınır

Arayüz bu kararı **yeniden hesaplamıyor**; uygun değilse düğmeyi hiç
göstermiyor. `assessDevice` kilitli SIM'de kalan hakkı **modülden** okuyor
(`AT+QPINC`) — web sayfası bu sayıyı vermiyor (`null` geliyor).

Ayrıca `simPinKaldir` artık SIM açıksa **önce kilit sorgusu** yapıyor; kilit
zaten kapalıysa PIN'i hiç göndermiyor.

## 5) Adversaryal denetim (2026-08-28) — kendi işime karşı tez

Kanıtla sınandı, savunulamayan düzeltildi.

| Karşı tez | Sonuç |
|---|---|
| `isReachable` kaynak IP olmadan güvenilir değil | **DOĞRU.** Bu ağda kaynak IP bağlanmadan yapılan TCP connect **her adrese** başarılı dönüyor (TEST-NET dahil). `provisionModem` kör yokluyor, olmayan cihazdan kimlik okuyup "SIM yok" diyordu. Artık kaynak türetilemiyorsa yoklama yapmıyor, `pc_hazir_degil` + `NO_SOURCE_IP` diyor |
| Kaynak dosyalarda kodlama bozulması | **DOĞRU.** `okuma.js`/`izleme.js`'e tek baytlık cp1252 karakterleri sızmış; ikisi **ekrana basılan metnin içindeydi**. Onarıldı + nöbetçi test (`kaynak-kodlama.test.js`) |
| Arayüz "elle gir" diyor ama alan kilitli | **DOĞRU.** `readOnly` alana yazılamaz; operatöre yaz deyip yazdırmıyorduk. Kilit artık yalnız **cihazdan gelen** numarayı koruyor |
| Numara kontrolü SIM kontrolünden önce | **DOĞRU.** SIM'siz modem "telefon yok" diyordu — yanlış teşhis. Sıra düzeltildi |
| Geçici okuma hatası `denemeler=3`'ü işletmiyor | **DOĞRU.** İlk turda `return` ediyordu; artık son turda vazgeçiyor |
| Katman yönü ters: okuyan modül yazana bağımlı | **DOĞRU.** `degerlendirme.js` → `pipeline.js` bağımlılığı vardı. `cihaz.js` (en alt katman) çıkarıldı; ikisi de ona bakıyor, birbirlerine bakmıyor. Döngüsel bağımlılık yok |
| `degerlendirmeyiIzle` yalnız import'tan erişilebilir | **DOĞRU** (kendi kuralımızın ihlali). `ricon.js degerlendir --izle` eklendi |
| Yeni komutların insan-okunur özeti yok | **DOĞRU.** `summaryText`'e eklendi, canlı doğrulandı |
| `telefonSor(1)` sabit → döngüde "1. modem" | **DOĞRU.** `deneme` geçiliyor |
| 66 dışa aktarım = API değil çöplük | **SAVUNULDU.** Katmanlara göre yorumlanmış + alt yollarla odaklı görünüm (`ricon-modem/at` gibi). Her ad ayrı bir yetenek |
| `pin-karar.js` 63 satır = aşırı parçalanma | **SAVUNULDU.** Ölçüt satır değil tek-sorumluluk; o dosya gerçek bir PUK riskini kapattı |
| Çekirdekte Türkçe = dil bağımlılığı | **SAVUNULDU.** Alternatif her tüketicide sözlük = sızıntının kaynağı. İkinci dil ikinci sözlük modülü olur, çekirdek değişmez |
| Arayüzde PIN alanı gizli → provizyon PIN'i verilemez | **SAVUNULDU.** Kilitli SIM'de alan açılıyor; kilitsiz SIM'e PIN yazılmaması **istenen** davranış. İnternet gelmezse ekran 2'deki yerinde PIN isteği duruyor |
| Arayüzde zamanlayıcılar çakışır | **SAVUNULDU.** `tekrariAyarla` önce `clearTimeout` yapıyor; JS tek iş parçacıklı olduğu için iki geri çağırma iç içe girmiyor, `okunuyor` bayrağı zaten kapıyor |

## 5) Sıradaki işler

| # | İş | Not |
|---|---|---|
| 1 | `--dongu` canlı test | Artık operatöre sormuyor (numara SIM'den). UI ile aynı işi yapıyor; UI kullanılıyorsa ikincil |
| 2 | `sahaya_hazir` alanını ekranda göster | Defterde var, UI'da yok. Küçük iş |
| 3 | Metrik hesabı | En sona; elle taban kayıtlı (12 dk, **beyan**) |
| ~~4~~ | ~~Authentication 4'lü diff~~ | **Kapandı:** 4 anahtara da aynı değer (`1`) yazılıyor, yani eşleme belirsizliği sonucu değiştirmiyor; ekranda 4'ünün tikli olduğu gözle doğrulandı |
| ~~5~~ | ~~Turkcell'den PIN kapalı SIM talebi~~ | **Kapandı:** SIM'ler zaten PIN'siz geliyor |

## Süreç kuralı (kodla çözülmedi, bilinmesi gerek)

**SIM'i değişen modem önce fabrikaya döndürülmeli.** Sebep: modem sakladığı
PIN'i her açılışta SIM'e gönderiyor; yeni SIM'de yanlış PIN 1 hak yakar.
Zarar 1 hakla sınırlı (araç `kalan < toplam` görünce saklı PIN'i temizliyor,
PUK'a gitmiyor) ama fabrika reset'i bunu tamamen önler.

Yalnızca **okuma** yapıyorsan (numara/kilit sorgusu, `degerlendir`) reset
gerekmez: o yol nvram'a hiçbir şey yazmıyor — 2026-08-28'de `m1s1simpin` boş,
`router_name` fabrika değerinde kalarak kanıtlandı.

## Faydalı komutlar

```bash
npm test                                      # 196 test, cihaz gerektirmez
node --env-file=.env ricon.js sunucu          # test arayüzü :8080
node --env-file=.env ricon.js degerlendir     # durum + ne eksik (~5 sn)
node --env-file=.env ricon.js numara          # SADECE telefon numarası
node --env-file=.env ricon.js sim-kilit       # SADECE kilit + kalan hak
node --env-file=.env ricon.js sim-pin-kaldir --pin 1234 [--uygula]
node --env-file=.env ricon.js sim-pin-kilitle --pin 1234 [--uygula]   # SADECE TEST
node --env-file=.env ricon.js hazirla --telefon 05... [--pin 1234]
node --env-file=.env ricon.js uygula --profil fabrika --uygula \
     --yeni-host 192.168.1.1 --yeni-kaynak 192.168.1.50   # fabrikaya döndür
node ricon.js olcum --modem-sayisi 400        # metrik özeti
node examples/paket-kullanimi.js 192.168.1.1 192.168.1.50 riconadmin PAROLA
```
