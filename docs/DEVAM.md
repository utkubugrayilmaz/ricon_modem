# Kaldığımız yer — 2026-08-31 (v0.2.0)

## Bugün ne oldu

**Sabah:** repo `redbox-device` kalıbına indirildi — düz `src/`, tek kapı
`index.js`, ince `bin/ricon.js`. UI ve HTTP sunucusu `ui` dalında donduruldu.

**Öğleden sonra:** sessizce ölen `npm start` bulundu. `readIdentity` her
çağrıda `ReferenceError: isOk is not defined` atıyordu; iki çağrı yerinde de
`try/catch` bunu yutuyordu. 223 testin hiçbiri yakalamamıştı çünkü hiçbiri
`readIdentity`'yi gerçekten çağırmıyordu → `tests/undefined-names.test.js`.

Ardından PIN akışı arayüzdeki haline getirildi: kilitli SIM'de artık numara
değil **PIN** soruluyor, kilit kalkınca numara kendiliğinden geliyor.

**Akşam (v0.2.0):** dil sınırı **tersine çevrildi** — yorumlar dışında hiçbir
şey Türkçe değil. Bu tur çeviriden ibaret değildi; taramada çıkan gerçek
kusurlar da düzeltildi.

## v0.2.0'da neler değişti

| Alan | Değişiklik |
|---|---|
| Komutlar | `hazirla`→`provision`, `degerlendir`→`assess`, `oku`→`read`, `dogrula`→`verify`, `uygula`→`apply`, `calistir`→`call`, `olcum`→`metrics`, `fark`→`diff`, `numara`→`msisdn`, `konsol`→`console`, `sim-kilit`→`sim-lock`, `sim-pin-kaldir/kilitle`→`sim-pin-disable/enable`, `olcum-elle`→`metrics-manual` |
| Bayraklar | `--dongu`→`--loop`, `--profil`→`--profile`, `--telefon`→`--phone`, `--zorla`→`--force`, `--kaynak-ip`→`--source-ip`, `--kaynak`→`--from-file`, `--tur`→`--rounds`, … |
| Profiller | `saha`/`fabrika` → `field`/`factory` |
| `.env` | `MODEM_USER` / `MODEM_PASSWORD` / `MODEM_SOURCE_IP` (eskisi yedekte) |
| `data/` | `provisioned.jsonl` / `metrics.jsonl` (eskisi yedekte) |
| Değerler | status/olay/sebep/kaynak enum'ları İngilizce |
| Metin | operatöre gösterilen her şey İngilizce |

**Eski komutlar takma ad DEĞİL:** `ricon hazirla` → `unknown command` + öneri +
eşleme tablosu, çıkış 1.

## Denetimde çıkan gerçek kusurlar (çeviri değil)

- **Adım kovaları parçalıydı.** Etiket ayar sayısını içine gömüyordu
  (`"yazma bitti — 12 ayar"`), kova etikete göre açılıyordu → 23 satırlık
  defterde 16 kovanın 10'u aynı yazma adımıydı, medyan anlamsızdı. Adımlar
  yapılandırıldı: `{step:"write_done", count:12}`. Kova 16→8, ölçüm kaybı 0.
- **`--saf` ölü bayraktı** — yardım tanıtıyor, kod `pure` okuyordu.
- **`--json` / `--kaynak` `calistir`'da fonksiyona sızıyordu** — destructure
  hiç üretilmeyen adları arıyordu.
- **`FLAG_TO_OPTION` "köprü" adını taşıyıp yalnız `calistir`'ı etkiliyordu**;
  diğer 14 komut argv'ye doğrudan bakıyordu → TEK AYRIŞTIRICI.
- **`problem-codes` bekçisi sessizce daralmıştı** — regex `red`/`sorunTr`/
  `hataYolla` arıyordu, üçü de yeniden adlandırılmıştı. 57 yerine 62 kod
  üretimi var; 5'i denetim dışındaydı.
- **`kim` alanı hiç okunmuyordu** — normalize edilince ölçüm kaynağı
  "1 BEYAN" yerine "1 declared · operasyon beyanı" oldu.
- Yanlış adlar: `verifyPin()` PIN değil planı doğruluyordu · `finiteOrNull`
  alan adı olarak kullanılmış · `pukText` sayaç tutuyordu · döngü sayacı
  `kind` adındaydı.

## Yeni bekçiler

| Test | Neyi tutuyor |
|---|---|
| `no-turkish.test.js` | Yorum dışında Türkçe yok. Gerekçeli 3 allowlist bölgesi |
| `cli-contract.test.js` | Komut/bayrak/profil/env adları + dispatch ile COMMANDS aynı kümede + npm script'leri gerçek komut çağırıyor + TEK AYRIŞTIRICI |
| `undefined-names.test.js` | Çağrılan her isim tanımlı/import edilmiş |
| `surface.test.js` | `src/` düz, 14 dosya, `index.js` hepsini dışa açıyor |

Dördü de bilerek bozulup **kırmızı yandığı doğrulandı**.

## Cihazın şu anki fiziksel durumu

- Konum: **192.168.1.1** (fabrika), SIM takılı, **PIN kilidi yok**
- Telefon: `5350634830` (AT+CNUM ile cihazdan okundu)
- İnternet: geliyor · `canStart: true`

## Sıradaki iş

1. **Canlı `provision` koşusu.** Yeni ölçüm satırının yapılandırılmış
   adımlarla yazıldığını ve `metrics` özetinde geçmiş satırlarla **aynı
   kovada** birleştiğini görmek. Cihazsız doğrulanamayan tek şey bu.
2. **PIN kilitli yol hâlâ canlı doğrulanmadı.** Elde kilitli SIM yok;
   `sim-pin-enable` ile kilitlemek bir hak yakma riski taşıyor. Birim
   testleri var, canlı kanıt yok — operatör onayı olmadan denenmemeli.
3. **Çok modemli seri deneme** (`provision --loop`) sahada denenmedi.

## Nerede ne var

- Ürün: `src/` (14 dosya, düz) · sarmalayıcı: `bin/ricon.js`
- Kalıcı kararlar: `CLAUDE.md` — her oturumda okunur
- Arayüzlü sürüm: `ui` dalı (dondurulmuş, v0.2.0 öncesi **Türkçe** yüzey)
- Defterler: `data/provisioned.jsonl` (38 satır) · `data/metrics.jsonl` (23)
