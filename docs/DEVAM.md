# Kaldığımız yer — 2026-08-27 akşamı

Yarın buradan devam. Sıradaki iş **1 numaralı açık hata**.

## Cihazın şu anki fiziksel durumu

| | |
|---|---|
| Modem | `192.168.1.1` (fabrika ayarlarında) |
| SIM | **PIN'li olan** takılı, ICCID `8990011626160054386` |
| SIM kilidi | **açık** — PIN arayüzden girildi, `m1s1simpin` nvram'da duruyor |
| Numara | `5350634747` (SIM'den okundu) |
| İnternet | çalışıyor (son görülen WAN IP `213.43.114.122`) |
| PC | `192.168.1.50` + `5.5.5.100` ikincil IP'ler kalıcı |

Test: **148/148**. Çalışma ağacı temiz, her şey commit'li.

---

## 1) AÇIK HATA — `assessDevice` içinde numara okuma başarısız

**Belirti:** `readMsisdn` tek başına çağrılınca **3.1 saniyede** numarayı okuyor
(`5350634747`). Ama `assessDevice` içinden çağrılınca **başarısız** oluyor:
`telefon: null`, `at_port: null`, toplam süre **144 saniye**.

**En güçlü hipotez:** modem **tek bağlantılı**. `assessDevice` sırayla şunu
yapıyor:

1. `isReachable` × 2 (TCP yoklama)
2. `readIdentity` → **HTTP** (2 uç, aralarında 1.5 sn bekleme)
3. `readMsisdn` → **telnet 5123**

HTTP okuması bittikten hemen sonra telnet açmak muhtemelen cihazın tek
bağlantısına çarpıyor; telnet login başarısız oluyor, `runConsole` 3 kez
deniyor (~66 sn), sonra `atPortBul` bir kez daha deniyor (~66 sn) → 144 sn ve
başarısız.

**Yarın yapılacak (sırayla):**

1. Hipotezi **ölç**: `readIdentity` → (bekleme yok) → `readMsisdn` sırasını
   elle çalıştır, sonra araya 2-3 sn bekleme koyup tekrar çalıştır. Fark varsa
   hipotez doğrulanır.
2. Doğrulanırsa: `assessDevice` içinde HTTP ile telnet arasına kısa bir bekleme
   koy — ya da **sırayı ters çevir** (önce telnet/AT, sonra HTTP). Hangisi daha
   hızlıysa o.
3. Doğrulanmazsa: `runConsole`'un başarısızlık sebebini yazdır
   (`problems[].message`) ve oradan git.

**Not:** bu, tek bağlantılı cihazda iki farklı kanalı (HTTP + telnet) arka
arkaya kullanan İLK yer. Aynı sorun ileride başka yerde de çıkabilir; çözüm
tek yerde (`assessDevice`) değil, genel bir kural olarak düşünülmeli.

---

## 2) Bugün bitenler (özet)

- **Telefon numarası cihazdan okunuyor:** `AT+CNUM` → `5350634747`.
  Zorunlu sıra keşfedildi: **PIN kilitli SIM abone verisini açmıyor**, yani
  önce PIN, sonra numara.
- **AT katmanı** (`src/at.js`): saf ayrıştırıcılar + telnet üzerinden AT.
  Kritik tuzak koda yazıldı (`exec 3<>PORT`, komut sonu `\r`, `stty -echo`).
- **`simPinKaldir`**: `AT+CLCK="SC",0,"<pin>"` ile PIN sorgusunu **kalıcı**
  kapatıyor — nvram'a PIN yazmaktan iyi (saklanacak sır kalmıyor, SIM her
  cihazda açık geliyor). **HENÜZ CANLI DENENMEDİ.**
- **`assessDevice` + `provisionEksikleri`**: "ne eksik, hangi ekran" kararı
  çekirdekte. `eksik: ["modem"|"sim"|"telefon"|"pin"]`, boşsa başlanabilir.
- **PIN durumları tek tek** karara bağlandı (`simPinHedefi`, 9 test):
  son hak asla otomatik yakılmıyor; **bir hak yakılmışsa araç bir daha
  denemiyor** (kullanıcı isteği); eski/yanlış saklı PIN kanıt varsa temizleniyor.
- **Fabrika profili saklanan PIN'i siliyor** — yoksa modeme takılan yeni SIM'in
  hakları yanardı.
- **`sahaya_hazir`** alanı deftere eklendi (üç değerli): `ok` tek başına
  yanıltıcıydı.
- **Yapı düzeltmesi:** arayüz `examples/test-ui/` altına taşındı, ürün
  çekirdek + API. Sunucu `staticDir` verilmezse **salt API**.
- **nvram ayrıştırıcı kusuru** düzeltildi: çok satırlı değerler sessizce
  kırpılıyordu (1585+2=1587 ile hesap kapandı).

---

## 3) Sıradaki işler (1 numaradan sonra)

| # | İş | Not |
|---|---|---|
| 2 | `simPinKaldir` canlı testi | PIN'i **kullanıcı** girmeli. Çalışırsa SIM kalıcı PIN'siz olur, telefona gerek kalmaz |
| 3 | `assessDevice`'ı endpoint + UI'a bağlamak | `/api/degerlendir`; UI: modem algılanınca **bir kez** çağır (pahalı, sürekli yoklama için değil) |
| 4 | UI akışı: numara otomatik dolsun | okunamazsa operatör yazar (fallback duruyor) |
| 5 | `sahaya_hazir` alanını ekranda göster | defterde var, UI'da yok |
| 6 | Çok modemli seri akış (`--dongu`) | hiç denenmedi, sahada |
| 7 | Authentication 4'lü diff | değerler doğru, sadece kanıt eksik |
| 8 | Metrik hesabı | en sona; elle taban kayıtlı (12 dk, **beyan**) |
| 9 | Turkcell'den PIN kapalı SIM talebi | kullanıcı tarafında |

## Süreç kuralı (kodla çözülmedi, bilinmesi gerek)

**SIM'i değişen modem önce fabrikaya döndürülmeli.** Sebep: modem sakladığı
PIN'i her açılışta SIM'e gönderiyor; yeni SIM'de yanlış PIN 1 hak yakar.
Zarar 1 hakla sınırlı (araç `kalan < toplam` görünce saklı PIN'i temizliyor,
PUK'a gitmiyor) ama fabrika reset'i bunu tamamen önler.

## Faydalı komutlar

```bash
npm test                                      # 148 test, cihaz gerektirmez
node --env-file=.env ricon.js sunucu          # test arayüzü :8080
node --env-file=.env ricon.js hazirla --telefon 05... [--pin 1234]
node --env-file=.env ricon.js uygula --profil fabrika --uygula \
     --yeni-host 192.168.1.1 --yeni-kaynak 192.168.1.50   # fabrikaya döndür
node ricon.js olcum --modem-sayisi 400        # metrik özeti
node examples/paket-kullanimi.js 192.168.1.1 192.168.1.50 riconadmin PAROLA
```
