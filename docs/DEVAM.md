# Kaldığımız yer — 2026-08-28

Sıradaki iş: **3 numaralı satır** — `assessDevice`'ı endpoint + UI'a bağlamak.

## Cihazın şu anki fiziksel durumu

| | |
|---|---|
| Modem | `192.168.1.1` (fabrika ayarlarında) |
| SIM | **PIN'li olan** takılı, ICCID `8990011626160054386` |
| SIM kilidi | **açık** — PIN arayüzden girildi, `m1s1simpin` nvram'da duruyor |
| Numara | `5350634747` (SIM'den okundu) |
| İnternet | çalışıyor (son görülen WAN IP `213.43.107.143`) |
| PC | `192.168.1.50` + `5.5.5.100` ikincil IP'ler kalıcı |

Test: **153/153**. Çalışma ağacı temiz, her şey commit'li.

---

## 1) ÇÖZÜLDÜ — `assessDevice` içinde numara okuma (2026-08-28)

**Hipotez YANLIŞ çıktı.** "Tek bağlantılı cihaz, HTTP'den hemen sonra telnet
çarpışıyor" değilmiş. Üç ölçüm:

| Test | Süre | Sonuç |
|---|---|---|
| Pipeline'ın yaptığı çağrı (iç içe `kimlik`) | 143.1 sn | başarısız, `aşama 2` |
| Aynı çağrı, düz `kullanici`/`sifre` | 3.2 sn | `5350634747` ✓ |
| HTTP okumasından HEMEN SONRA telnet | 5.8 sn | `5350634747` ✓ |

Üçüncü satır tek-bağlantı hipotezini çürüttü. Gerçek sebep hata mesajındaki
**`aşama 2`**: "login: gördüm, parolayı gönderdim, kabuk prompt'u gelmedi" —
yani kimlik bilgisi boş gidiyordu.

**Kök neden — iki katmanın SÖZLEŞMESİ farklıydı.** HTTP katmanı (`Client`)
kimliği iç içe taşıyor (`{kimlik:{kullanici,sifre}}`), konsol katmanı ise düz
bekliyordu (`{kullanici,sifre}`). `pipeline.js` `readMsisdn`'e HTTP biçimini
veriyordu; telnet login'ine `undefined` gidiyor, 3 deneme + port doğrulaması
= 143 saniye ve "telefon okunamadı". Kimse yanlış kod yazmamıştı.

**Yapılanlar:**
1. `konsolKimligi(opts)` — sınırda tek yerde normalize eder, iki biçimi de
   kabul eder. Çağıranın doğru şekli hatırlamasını beklemekten sağlam.
2. **Kimliksiz deneme YOK** — kimlik yoksa `runConsole` ağa hiç çıkmadan
   `CONSOLE_KIMLIK_YOK` döner. 143 saniyeyi yiyen şey, hatanın kendisi kadar
   hatanın SESSİZ olmasıydı: sebep "zaman aşımı" diye görünüyordu.
3. `assessDevice` "ne eksik" kararını artık **çözülmüş** numaraya soruyor,
   ham girdiye değil (cihazdan numara okunduğu halde `eksik:["telefon"]`
   kalıyordu).

**Canlı doğrulama:** `assessDevice` 143 sn → **4.9 sn**, `telefon:
{numara:"5350634747", kaynak:"cihaz"}`, `eksik: []`, `baslatilabilir: true`.

**Ders (kodla çözülmedi):** katmanlar arası veri BİÇİMİ sessizce uyuşmazsa,
hata mesajı doğru yeri göstermez. Aşama numarası (`aşama 2`) burada teşhisi
tek başına verdi — bu tür "nerede takıldım" bilgisini korumak lazım.

---

## 2) Bugüne kadar bitenler (özet)

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

## 3) Sıradaki işler

| # | İş | Not |
|---|---|---|
| 2 | `simPinKaldir` canlı testi | PIN'i **kullanıcı** girmeli. Çalışırsa SIM kalıcı PIN'siz olur, telefona gerek kalmaz |
| 3 | **SIRADAKİ** — `assessDevice`'ı endpoint + UI'a bağlamak | `/api/degerlendir`; UI: modem algılanınca **bir kez** çağır (pahalı, sürekli yoklama için değil) |
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
npm test                                      # 153 test, cihaz gerektirmez
node --env-file=.env ricon.js sunucu          # test arayüzü :8080
node --env-file=.env ricon.js hazirla --telefon 05... [--pin 1234]
node --env-file=.env ricon.js uygula --profil fabrika --uygula \
     --yeni-host 192.168.1.1 --yeni-kaynak 192.168.1.50   # fabrikaya döndür
node ricon.js olcum --modem-sayisi 400        # metrik özeti
node examples/paket-kullanimi.js 192.168.1.1 192.168.1.50 riconadmin PAROLA
```
