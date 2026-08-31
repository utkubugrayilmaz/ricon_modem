# Kaldığımız yer — 2026-08-31

## Bugün ne oldu

Repo **redbox-device kalıbına** indirildi. Üç iş yapıldı, her biri ayrı commit:

1. **UI ve HTTP katmanı `main`'den çıktı** → `ui` dalında donduruldu.
   Tarayıcı arayüzü (`examples/test-ui/`) ve `src/server.js` orada.
2. **`kesif` ve `izle` silindi** — Faz 1 araçlarıydı, cihazı *tanımak* içindi.
   Ölçüldü: `hazirla` bunların hiçbirine dokunmuyordu. `snmp.js`, `izleme.js`,
   `scanPorts`, ARP/IPv6 okuyucuları da düştü.
3. **`src/` düzleştirildi ve İngilizceleşti** — 24 dosya + 6 katman klasörü →
   **13 dosya, klasör yok**. `ricon.js` → `bin/ricon.js`.

Test: **216/216**, sıfır bağımlılık.

Ayrıca yolda iki **gerçek hata** bulundu ve düzeltildi:

- `provisionLoop` ilk adımda `ReferenceError: kFabrika is not defined` ile
  patlıyordu (`modemBekle`/`modemCikarmaBekle` `provisionModem`'in iç
  değişkenini kullanıyordu). Yani `hazirla --dongu` hiç çalışmıyordu.
- `summarizeMetrics` `data/olcumler.jsonl`'deki 22 satırdan birini **sessizce**
  saymıyordu: o satır İngilizce şemadan (`kind`/`totalSec`), filtre ise
  yalnızca `tur`'a bakıyordu. Artık iki şema da okunuyor.

## Cihazın şu anki fiziksel durumu

| | |
|---|---|
| Modem | `192.168.1.1` (fabrika ayarlarında) |
| SIM | PIN kilidi **KAPALI** (araçla kaldırıldı) |
| Kalan hak | PIN **3/3**, PUK 10 — el değmemiş |
| PC | `192.168.1.50` + `5.5.5.100` ikincil IP'ler kalıcı |
| Not | Kablo çıkarken bu IP'ler "Deprecated" olur ve araç göremez — hata değil |

## Sıradaki iş

- [ ] **Cihazlı doğrulama.** Şu ana kadarki her şey cihazsız test edildi.
      Gerçek bir modemle koşulması gerekenler:
      - `npm start` → tak-çalıştır döngüsü (ReferenceError düzeltmesi canlı
        doğrulanmadı)
      - `hazirla`'nın bastığı **plan tablosu** (önce → sonra, insan-okunur)
      - CLI'ın yazdığı **ölçüm satırı** — adım etiketleri tarihsel satırlarla
        aynı kovaya düşmeli
- [ ] `docs/` içindeki Faz 1–2 bulguları gözden geçirilmedi; hâlâ doğru ama
      dili eski komutlara (`kesif`, `izle`) atıfta bulunabilir.

## Nerede ne var

Çalışma kuralları, dil sınırı ve bilinen tuzaklar: [`../CLAUDE.md`](../CLAUDE.md).
Kullanım ve mimari: [`../README.md`](../README.md).

```bash
npm test                            # cihaz gerekmez
npm start                           # tak -> hazir -> cikar -> sonraki
node bin/ricon.js calistir          # cagrilabilir tum yuzey
git switch ui                       # arayuzlu surum (dondurulmus)
```
