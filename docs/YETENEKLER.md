# Ricon S9922M44 — Ne Alabiliyoruz, Ne Yapabiliyoruz?

Teknik olmayan özet. Ayrıntı: [BULGULAR.md](BULGULAR.md),
[veri-sozlugu.md](veri-sozlugu.md).

## Kısaca

Modemden **her şeyi çekebiliyoruz** — cihaz kimliği, hücresel/SIM
telemetrisi ve **tüm yapılandırmanın tam yedeği** dahil. Tek koşul: web
paneli parolası (`riconadmin` / `<parola: .env>`). Parolasız yalnızca sistem
bilgisi geliyor.

Veri çekme HTTP:80 üzerinden. Ayar/otomasyon için ise **telnet konsolu
(port 5123)** açık ve **root shell** veriyor — `nvram get/set/commit` ile.
Standart SSH/telnet/SNMP kapalı. Alttaki OS OpenWrt/Linux. Otomasyon (Faz
2/3) bu telnet+nvram kanalı üzerine kurulacak; web formu taklidi yedek yol.

## Okuyabildiklerimiz ✅

- **Cihaz kimliği:** model, seri, firmware/HW sürümü, MAC'ler, cihaz saati,
  uptime, CPU/RAM.
- **SIM/hücresel:** ICCID, IMSI, IMEI, operatör (IMSI'den), SIM durumu,
  şebeke tipi (LTE), band, sinyal (dBm), sinyal/gürültü, hücre ID, aktif SIM
  yuvası (SIM1/SIM2).
- **Bağlantı:** WAN IP (gerçek public IP), ağ geçidi, DNS, bağlı süre,
  bağlantı protokolü.
- **LAN/WLAN:** IP, MAC, WiFi radyo durumu (fabrikada kapalı), kanal, SSID.
- **Tam yapılandırma:** `/nvrambak.bin` — 1560 anahtar. Cihazın "her şeyi"
  tek dosyada; her ayarın kalıcı değeri burada.

## Yapabildiklerimiz (araç) ✅

- `dogrula` — ortam/erişim teşhisi, sorun varsa çözümüyle.
- `kesif` — port/servis/parmak izi taraması (salt okunur).
- `oku` — yukarıdaki her şeyi tek komutta çeker, JSON + insan-okunur.
- `izle` — bir alanın gerçekten canlı mı statik mi olduğunu, uyarım altında
  fark alarak kanıtlar (örn. anten çıkar/tak → sinyal değişiyor mu).
- Hepsi kaydedilmiş JSON'dan **cihazsız tekrar oynatılabilir** (`--kaynak`).

## Okuyamadıklarımız / sınırlar (dürüstlük bölümü) ⚠️

- **Telefon numarası (MSISDN):** cihazda yok. Operatörün kaydında, ICCID'ye
  bağlı. Turkcell'den ICCID→numara istenmeli.
- **SNMP telemetrisi:** daemon kapalı; `public` cevap vermedi. nvram'da
  community tanımlı olsa da açık değil. (Açılırsa ek OID telemetrisi gelebilir
  ama gerek yok — HTTP zaten her şeyi veriyor.)
- **Standart SSH/telnet (22/23):** kapalı. Ama **telnet konsolu 5123'te açık**
  ve root veriyor (yukarı bkz.) — otomasyonun asıl kanalı bu.
- **Parolasız SIM/ayar:** alınamaz (401). Sistem bilgisi parolasız gelir.

## Sıradaki (Faz 2/3 — henüz yapılmadı)

- **Faz 2:** telnet+nvram kanalını sağlam bir modüle (`console.js`) oturtmak;
  sonra web arayüzünde bir ayar (WLAN, APN, LAN IP, ...) değiştirilirken
  **nvram öncesi/sonrası farkını** alıp "bu ayar hangi nvram anahtarını
  değiştiriyor + ne apply gerekiyor" haritasını çıkarmak.
- **Faz 3:** "istenen durum" profili (LAN 5.5.5.1, WLAN kapalı, APN internet,
  ...) → `nvram get/set/commit` ile oku/karşılaştır/yaz/doğrula: fikir-sabit
  otomatik hazırlama.

Bu iki faz için elimizdeki temel hazır: erişim, protokol, tam nvram, uç
listesi, web formu ve **root telnet konsolu** doğrulandı.
