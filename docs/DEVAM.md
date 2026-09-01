# Kaldığımız yer — 2026-08-31 akşamı (denetim turu)

> **Bu tur cihazsız yapıldı.** Modem takılı değildi. Aşağıdaki değişiklikler
> `npm test` (280 test, hepsi yeşil) ve **sahte telnet modem** ile
> doğrulandı. **Gerçek modemle sınanacaklar en altta listeli.**

## Ne yapıldı

Repo baştan sona denetlendi (ölü kod, yanlış kullanım, kullanılmayan
script). Çıkan kusurlar düzeltildi. Test sayısı **243 → 280**.

Ayrıntılı bulgu listesi (satır numaralı, gerekçeli):
`C:\Users\utku\.claude\plans\abi-imdi-repoyu-bi-federated-neumann.md`

### A · Abone verisi maskelendi

`docs/enes-bulgular/`, `docs/hazirlama-profili.md`, `src/at.js` ve **5 test
dosyasında** gerçek IMEI / ICCID / IMSI / telefon numarası vardı. Hepsi
reponun kendi kalıbıyla maskelendi (`8671910XXXXXXXX`,
`8990XXXXXXXXXXXXXXXF`, `28601XXXXXXXXXX`, `+90535XXXXXXX`); testlerdeki
numaralar `05321234567` örneğine çevrildi.

> ⚠ **YARIM İŞ — bilerek.** Maskeleme yalnızca çalışma ağacını temizler.
> Değerler `2bd15a0` commit'inde ve **`origin/main` + `origin/enes`
> üzerinde durmaya devam ediyor.** Geçmişi temizlemek `git filter-repo` +
> force-push ister; `enes` dalı paylaşıldığı için Enes Talay'ın klonu
> bozulur. **Ayrıca karar verilecek.** Ayrıca: depo public mi, hâlâ
> bilinmiyor — public ise maskeleme geçmişi geri almaz.

### B · `sim-lock` ad çakışması (senin kararınla)

`npm run sim-lock` **kilitlemeye devam ediyor** — sunumdaki kullanım korundu.
Çakışma karşı taraftan çözüldü:

| | Önce | Şimdi |
|---|---|---|
| `npm run sim-lock` | kilitler | **aynı** ✓ |
| CLI `sim-lock` | salt okunur (TERSİ!) | **`sim-lock-status`** |
| `npm run sim-state` | CLI `sim-lock` | CLI `sim-lock-status` |

Çıplak `node bin/ricon.js sim-lock` artık çalışmıyor; belirsiz olduğu için
iki seçeneği söyleyip 1 ile çıkıyor. Yeni bekçi: bir npm script'i, CLI'da
var olan **başka** bir komutun adını taşıyamaz (`cli-contract.test.js`).

### C · Davranış düzeltmeleri

| Ne | Nerede | Neydi |
|---|---|---|
| Boolean bayrak artık sonraki sözcüğü yutmuyor | `report.js` `BOOLEAN_FLAGS` | `call --pure normalizePhone` fonksiyon adını yiyordu |
| `--no-reboot` ters mantığı düzeldi | `bin/ricon.js` | yutulan bayrak reboot'u **açıyordu** |
| Eksik çıktı artık başarı değil | `console.js` `resolveResult` | hat düşünce `ok:true` + boş çıktı dönüyordu (**sessiz yanlış cevap**) |
| Zamanlayıcı `finish()` içinde temizleniyor | `console.js` | timeout/close yollarında kalıyordu → paket tüketicisi ~20 sn asılı |
| `reboot` tek denemede | `provision.js` | `attempts:1` yoktu, asılı kalırsa 3 kez gidiyordu |
| PUK kararı saf fonksiyona çıktı | `at.js` `pukUnblockDecision` | dört kapı I/O içindeydi, **hiç testi yoktu** |
| PIN döngüsüne tavan | `pipeline.js` | kalan hak okunamazsa sonsuz sorabiliyordu |
| `printf '%s\r' 'komut'` | `at.js` | `%` ve `'` içeren AT komutu bozuluyordu |
| nvram anahtarı doğrulanıyor | `console.js` | değer tırnaklıydı, **anahtar çıplaktı** |
| `--rounds abc` / `--max 0` artık hata | `bin/ricon.js` | sessizce **sonsuz** döngüye dönüyordu |
| `SECRET_FIELDS` += `puk`, `newPin` | `report.js` | sim-puk eklenince süzgeç güncellenmemişti |

### D · Bekçi delikleri kapandı

- `problem-codes.test.js` artık **`bin/`'i de tarıyor**. `bin/` katalog dışı
  `ARGS` ve `METRICS_FILE_MISSING` kodları üretiyordu; operatör sıradan bir
  kullanım hatası için *"Something unexpected happened — Report this code to
  IT"* görüyordu. İkisi de katalogda artık.
- `no-turkish.test.js` sözcük listesi genişledi. Üç Türkçe metin bekçiden
  geçmişti (`bin/ricon.js` PLAN başlığı, `settings.js` profil açıklaması —
  bu bir **veri değeri**, `problems.js` içindeki `sifirlamaProfil`).
  Not: `once` listeye **eklenemez**, İngilizce bir sözcük.
- Kod hatası artık yutulmuyor: `isProgrammerError` + `INTERNAL_ERROR`.
  `ReferenceError`/`TypeError` `problems`'a yazılıyor, cihaz hatası eskisi
  gibi yutuluyor.
- **CI eklendi** (`.github/workflows/test.yml`). Bugüne kadar testleri koşan
  hiçbir şey yoktu; kuralları tutan tek şey "npm test yazmayı hatırlayan
  kişi"ydi.

### E · Ölü kod ve temizlik

- `net.js` POST boru hattı kaldırıldı (`post()` artık **koşulsuz** reddediyor
  → "bu istemci POST edemez" yapısal garanti).
- `bin/ricon.js` ulaşılamaz `default: return null` + eşi kaldırıldı.
- `report.js` köprüsünden `duration`/`interval` (donmuş `ui` dalından kalma).
- 14 yorum var olmayan dosyaları gösteriyordu (`cihaz.js`, `pin-karar.js`,
  `scanner.js`, `src/server.js` …) — hepsi düzeltildi.
- `npm test` artık `"tests/**/*.test.js"`; eskiden `arsiv/` ve `data/` de
  taranıyordu.
- Belgeler: `sim-puk` README'ye eklendi, yazan npm script'leri belgelendi,
  `kesif`/`izle` yetenek listesinden çıkarıldı, `node ricon.js` → `bin/`.

## Bilerek YAPILMAYANLAR

| Ne | Neden |
|---|---|
| Git geçmişi temizliği | Force-push + paylaşılan `enes` dalı. Senin kararın. |
| Commit / push | İstenmedi. 29 push'lanmamış commit zaten vardı. |
| `src/util.js` (tekrar eden `now`/`wait`/`notify`/`emitEvent`/`prefixOf`) | CLAUDE.md `src/`'i "her dosya tek konu" diye kilitliyor; bir util grab-bag'i o kuralın karşısına düşer. Ölü ya da yanlış değil, sadece tekrar. **Karar senin.** |
| `legacy.js` `normalizeLedgerRow` + `LEGACY_LEDGER_KEYS` + `LEGACY_PROFILE` | Sıfır tüketici, ama CLAUDE.md orayı "eski defteri okuyan tek sınır" ilan ediyor. Gelecek bir okuyucu için mi duruyor? **Sorulmadan silinmedi.** |
| `disableSimPin`'in `persistOff` seçeneği | Hiç kullanılmıyor ama public API'de tutarlı bir seçenek — kazara ölü kod değil. |
| `--env-file-if-exists` (11 script'te no-op) | `bin/` `.env`'i zaten kendi yüklüyor, ama Node'un öncelik semantiğini cihazsız doğrulayamadım. Zararsız. |
| `waitForModem` sınırsız döngüsü | Denetimde "sınırsız" diye işaretlemiştim; **yanlıştı** — sonsuz bekleme ürünün asıl döngüsü ("tak → hazır → çıkar"). Sınırlamak işi bozardı. |

---

# 🔧 YARIN TEZGAHTA — modemle sınanacaklar

Sırayla. Her adım bir öncekini varsayıyor.

### 1. Duman testi (yazma yok)
```bash
npm run verify                  # erisim + kaynak IP
npm run read                    # sistem + SIM + ayar + nvram
npm run sim-state               # YENI AD — salt okunur, hak harcamaz
node bin/ricon.js sim-lock      # BELIRSIZLIK uyarisi vermeli, exit 1
```
- [ ] `sim-state` kilit durumu ve **kalan hakkı** doğru gösteriyor mu?
- [ ] `read` eskisi gibi tam mı? (nvram anahtar sayısı ~1560)

### 2. Konsol / AT yolu — tırnaklama değişti
`printf '%s\r' 'komut'` biçimi **canlı modemde ilk kez** koşacak.
```bash
node bin/ricon.js console
node bin/ricon.js call atCommand -- "AT+CNUM"
node bin/ricon.js call atCommand -- "AT+CPIN?"
```
- [ ] AT cevapları geliyor mu? (sahte cihazda geçti ama gerçek BusyBox `printf` farklı olabilir)
- [ ] `ATL:` satırları düzgün ayıklanıyor mu?

### 3. Eksik çıktı artık `ok:false`
`consoleNvram` hat koparsa artık **hata** dönüyor (eskiden "0 anahtar" + başarı).
- [ ] Normal okuma hâlâ `ok:true` mu? (yanlış pozitif üretmediğinden emin ol)

### 4. Provizyon — kuru, sonra gerçek
```bash
npm run reset:dry               # once KURU
node bin/ricon.js provision --host 192.168.1.1   # tek modem, kuru
npm start                       # gercek dongu
```
- [ ] Plan tablosu başlığı artık İngilizce: `PLAN — before -> after (* = will change)`
- [ ] **`reboot` KAÇ KEZ gidiyor?** `attempts:1` eklendi; modem loglarından ya da süreden bak. Eskiden asılı kalırsa ~16 sn sürüyordu.
- [ ] Reboot sonrası doğrulama eskisi gibi geçiyor mu?

### 5. PIN yolu (PIN kilitli test SIM'i varsa)
- [ ] Kilitli SIM'de **PIN** soruluyor mu (numara değil)?
- [ ] Yanlış PIN sonrası kalan hak **cihazdan taze** okunuyor mu?
- [ ] Son hak korunuyor mu?
- [ ] Yeni deneme tavanı devreye giriyor mu? (en fazla `pinTotal` kez sorar)

### 6. `npm run sim-lock` — SENİN SUNUM KOMUTUN
- [ ] Hâlâ SIM'e kilit koyuyor mu? (davranışa dokunulmadı, ama doğrula)
- [ ] `npm run sim-unlock` kilidi kaldırıyor mu?

### 7. PUK — ⚠ EN DİKKATLİ ADIM
Yanlış PUK SIM'i **kalıcı öldürür**. Karar mantığı saf fonksiyona çıkarıldı
ve 14 testle kaplandı, ama canlıda ilk kez koşacak.
- [ ] **Önce `--apply` OLMADAN** koş: ne yapacağını söylemeli.
- [ ] Kilitli olmayan SIM'de "PUK gerekmez" deyip **hiçbir şey göndermemeli**.
- [ ] Son hakta `--force` ile bile geçmemeli.
- [ ] Gerçek PUK denemesi ancak elden çıkarılabilir bir test SIM'iyle.

### 8. Ölçüm
```bash
npm run metrics
```
- [ ] Eski `data/metrics.jsonl` satırları hâlâ okunuyor mu? (`legacy.js` sınırı)

---

**Bir şey ters giderse:** değişikliklerin hepsi çalışma ağacında, commit
edilmedi. `git diff` tam listeyi verir, `git checkout -- <dosya>` tek tek
geri alır.
