# `npm start` — Baştan Sona Akış

Bu belge `npm start`'ın arkasındaki zinciri anlatır. Her adım önce **düz
cümleyle** ("burada şu yapılır"), altında kısa teknik notla verilir.

```
npm start
  ├─ BÖLÜM 1: AĞ HAZIRLIĞI  (scripts/network-setup.js + network-prep.js)
  │    bilgisayarı modeme ulaşabilir hâle getir, modemin adresini bul
  └─ BÖLÜM 2: RICON         (bin/ricon.js → src/pipeline.js → src/provision.js)
       modem takıldıkça: oku → karşılaştır → yaz → doğrula → kaydet
```

---

# BÖLÜM 1 — AĞ HAZIRLIĞI

## Adım 1 — Yetki alınır.

**Burada, ağ ayarı değiştirebilmek için gereken yönetici yetkisi alınır.**
Windows'ta UAC penceresiyle yeni bir Yönetici penceresi açılır (bitince
logları asıl terminale geri basar); Linux'ta adaptörü NetworkManager
yönetiyorsa yetkiye hiç gerek yoktur (polkit izni yeter), yönetmiyorsa
`sudo` istenir.

> Teknik: `network-setup.js` → `needsElevation()` / `relaunchElevated()` /
> `relaunchWithSudo()` / `replayLog()`. Loglar ayrıca `data/network-setup.log`'a.

## Adım 2 — "Modem zaten görünüyor mu?" diye bakılır.

**Burada modemin bilinen adresleri sırayla tıklatılır.** Aday listesi:
`.env`'deki `MODEM_HOST` → `192.168.1.1` (fabrika) → `192.168.8.1`
(fabrikanın 2. adresi) → `5.5.5.1` (saha). Her aday için önce "bilgisayarımda
o alt ağdan bir IP var mı?" diye bakılır — **yoksa o aday atlanır** (kaynaksız
yoklama bu ağlarda sahte "başarılı" veriyor, ölçüldü). Varsa modemin 80 ve
5123 portlarına TCP bağlantısı denenir; kapı açılırsa modem bulunmuştur ve
DHCP'ye hiç girilmez.

> Teknik: `candidateHosts()` → `probeHosts()`; `findDirectHost()` →
> `findSourceIp()` + `isReachable()` (src/net.js).

## Adım 3 — Modem görünmüyorsa DHCP ile aranır.

**Burada bilgisayarın kendi ağ ayarı geçici olarak DHCP istemcisine alınır;
modemin içindeki DHCP sunucusu bize adres verince, o kiradan modemin gerçek
adresi öğrenilir.** Sırası: (1) bilgisayardaki mevcut statik IP'ler
yedeklenir, (2) adaptör DHCP'ye çevrilir ve en çok 15 sn taze kira beklenir,
(3) statiğe geri dönülür. Kira kanıtı üç kaynaktan, güçlüden zayıfa okunur
(kiranın kendisi → dinamik adres → route); makinenin kendi eski gateway'i
modem sanılmaz, APIPA (169.254.*) kira sayılmaz. Hata olursa yedek geri
yüklenir — adaptör asla yarım kalmaz.

> Teknik: `prepareNetwork()` tam yolu (network-prep.js); `switchToDhcp()` →
> Windows `netsh source=dhcp`, Linux `nmcli ipv4.method auto` / `dhclient -nw`;
> `readLease()` + `isFreshLease()`.

## Adım 4 — Bilgisayara gereken IP'ler eklenir.

**Burada, modeme her durumda istek atabilmek için bilgisayara ikincil IP'ler
yazılır.** Eklenenler: eski statik adresler (geri yüklenir) + modemin alt
ağında bir adres (tercihen kiranın verdiği; yoksa `.100`'den ilk boş) + her
zaman `5.5.5.100` (provizyon sonunda modem `5.5.5.1`'e taşınacak) + kira
gelmediyse `192.168.1.100` + diğer aday alt ağlarına birer adres. Linux'ta
bu adresler NM profiline de yazılır ki kablo çıkınca ve reboot'ta kaybolmasın
(ölçüldü: yazılmazsa siliniyor). Windows'ta zaten kalıcıdır.

> Teknik: `computeDesiredAddresses()` (saf, testli) + `addIp()`/`setStatic()`
> + `persistAddresses()`. Windows'ta `-SkipAsSource`: ikincil IP varsayılan
> çıkış olmaz; araç isteği `localAddress` ile bilinçli kaynaktan atar (bu
> yüzden `fetch` değil `node:http`).

## Adım 5 — Adaylar doğrulanır ve adres ricon'a devredilir.

**Burada, yeni eklenen IP'ler sayesinde artık yoklanabilen tüm adaylar bir
kez daha tıklatılır; hangi adreste cevap geldiyse o adres `--host` olarak
asıl araca verilir.** Üç satırlık özet basılır (modem nerede · ne eklendi ·
ne geri yüklendi) ve `bin/ricon.js provision --loop --host <adres>` başlatılır.

> Teknik: `confirmHost()` (ikinci geçiş) → `spawnSync(node, [bin/ricon.js,
> "provision", ...])`, `stdio: "inherit"`, çıkış kodu aynen taşınır.

---

# BÖLÜM 2 — RICON: MODEM HAZIRLAMA

## Adım 0 — Araç açılır, sahne kurulur. (Henüz modeme dokunulmaz.)

**Burada araç kendini hazırlar:** `.env` okunur (kullanıcı adı/şifre buradan
gelir), komut satırı bir kez ayrıştırılır, **"istenen ayarlar listesi" olan
profil seçilir** (varsayılan `field` = sahaya hazır modemin ~13 ayarı),
sonuçların yazılacağı iki dosya ve operatöre soru soran fonksiyonlar
hazırlanır. Ayarlarla ilgili hiçbir karar burada verilmez — bu adım sadece
tesisattır.

> Teknik: bin/ricon.js → `loadDotEnv()`, `parseArgv()`, `PROFILES.field`
> (src/settings.js), `pcPreflight()` (iki alt ağda kaynak IP var mı — Bölüm 1
> eklediği için normalde geçer), defter yazıcısı (`data/provisioned.jsonl`),
> ölçüm yazıcısı (`data/metrics.jsonl`), `askPhone`/`askPin`, `streamWatcher`
> (çekirdek olaylarını terminale çevirir). `--loop` → `provisionLoop()`.

## Adım 1 — Modem takılana kadar beklenir.

**Burada araç 3 saniyede bir iki adresi (fabrika `192.168.1.1` ve saha
`5.5.5.1`) tıklatarak bekler.** Hangisinden cevap gelirse modem takılmış
demektir ve o adres "modemin şu anki yeri" olur.

> Teknik: `waitForModem()` (src/pipeline.js) → `isReachable()`.

## Adım 2 — Modemin kimliği ve SIM durumu okunur. (Web'den)

**Burada modemin web arayüzündeki durum sayfaları çekilir: MAC adresi, SIM
durumu (OK / Invalid / Not Insert), ICCID, IMEI, operatör.** İki önemli
ayrım yapılır:
- **"Okuyamadım" ≠ "SIM yok".** Sayfa okunamadıysa (cihaz reboot'tan yeni
  çıkmış olabilir) SIM yok denmez, 2 sn sonra tekrar denenir.
- **"Invalid" ≠ "boş yuva".** Yeni açılan modem ~30 sn "Invalid" der, sonra
  ICCID gelir. 15 sn beklenip tekrar bakılır; ancak son denemede de ICCID
  yoksa "SIM yok" denir ve modem reddedilir (SIM'siz modem sahaya çıkamaz).

> Teknik: `readIdentity()` (src/device.js) → `GET /asp/status/Info.live.htm`
> (lan_mac) + `GET /asp/status/Status_Internet.live.asp` (SIM alanları).
> En fazla 3 deneme (`attempts`).

## Adım 3 — SIM kilitliyse kilit kaldırılır. (AT komutlarıyla)

**Burada, SIM PIN kilitli görünüyorsa operatöre PIN sorulur ve kilit SIM'den
kalıcı olarak kaldırılır.** Kurallar katıdır çünkü her yanlış deneme bir hak
yakar ve üç yanlış SIM'i PUK'a kilitler:
- Denemeden önce **kalan hak cihazdan taze okunur** (hak harcamayan sorgu).
- **Son hak asla otomatik denenmez** — karar insana bırakılır.
- Yanlış girildiyse tekrar sorulur (her turda taze hak sayısıyla).
- Kilit kalkınca SIM'in ayağa kalkması beklenir ve kimlik yeniden okunur.

> Teknik: pipeline.js PIN döngüsü → `askPin` (operatör) → `disableSimPin()`
> (src/at.js): `AT+CLCK="SC",2` (hak harcamaz, durum sorgusu) →
> `AT+CPIN="..."` + `AT+CLCK="SC",0` (hak harcar, tek deneme). AT kanalı =
> telnet 5123 üzerinden `/dev/ttyUSB0`.

## Adım 4 — Telefon numarası alınır.

**Burada numara önce SIM'in kendisinden okunur; okunamazsa operatöre
sorulur; o da girmezse modem "numarasız" diye reddedilir** — kayıtsız modem
sahaya çıkmaz. Numara aynı zamanda cihaz adı olarak modeme yazılacaktır
(hangi hat takılı, arayüzden görünsün diye).

> Teknik: `readMsisdn()` → `AT+CNUM` (bu bilgi web arayüzünde YOK, yalnız SIM
> bilir); yedek `askPhone` (stderr'dan sorar); ikisi de yoksa `no_phone`.

## Adım 5 — "İstenen ayarlar" son hâlini alır.

**Burada hedef listesi tamamlanır: profildeki ~13 sabit ayar + bu modeme özel
iki değer** (cihaz adı = telefon numarası; gerekiyorsa SIM PIN anahtarı).
Buna "etkin profil" denir — birazdan cihazdakiyle karşılaştırılacak liste
budur.

> Teknik: `buildActiveProfile()` + `simPinTarget()` (PIN yaz / boşalt /
> dokunma kararının tamamı tek saf fonksiyonda).

## Adım 6 — Cihazın MEVCUT ayarları okunur. (nvram)

**Burada telnet konsolundan cihazın tüm ayar defteri çekilir** — nvram, ~1.500
satırlık düz `anahtar=değer` sözlüğüdür (her değer string; JSON/tip yok).

> Teknik: `applyProvisioning()` (src/provision.js) → `consoleNvram()` →
> telnet 5123, `nvram show`.

## Adım 7 — İstenen ile mevcut KARŞILAŞTIRILIR: plan çıkar.

**Burada etkin profildeki her anahtar için tek tek bakılır:**

| Cihazdaki değer | Karar |
|---|---|
| hedefle **aynı** | `unchanged` — dokunulmayacak |
| hedeften **farklı** | `changing` — `{mevcut, hedef}` çifti olarak yazılacak |
| cihazda **hiç yok** | `missing` — yazılacak (+ uyarı) |

Örnek: fabrikadan gelen modemde `lan_ipaddr=192.168.1.1`, profil `5.5.5.1`
istiyor → `changing`'e girer. `wan_apn` zaten `internet` ise → `unchanged`,
ona hiç dokunulmaz.

> Teknik: `planProvisioning(mevcut, profil)` — saf fonksiyon, cihaza gitmez,
> testli.

## Adım 8 — Plan operatöre gösterilir.

**Burada terminale ÖNCE → SONRA tablosu basılır** (`*` = değişecek satır).
Ham nvram anahtarı değil, sözlükten gelen okunur ad/sayfa/değer gösterilir.

> Teknik: çekirdek `plan` olayı yayınlar → `streamWatcher` (bin/ricon.js)
> tabloyu basar; adlar `SETTING_LABELS` (src/settings.js).

## Adım 9 — Karar: zaten hazır mı, yazılacak mı?

- **`changing` boşsa** → cihaz zaten istenen durumda: `already_desired`,
  hiçbir şey yazılmaz. (İdempotentlik: aynı modeme ikinci koşu zararsızdır.)
- **Dry-run ise** (`--apply` yok) → plan raporlanır, yazılmaz, durulur.
- **Gerçek koşuda** → yalnızca `changing`'dekiler yazılır; `unchanged` asla.

## Adım 10 — Fark YAZILIR; yönetim adresi en sona bırakılır.

**Burada değişecek ayarlar telnet üzerinden `nvram set` ile grup grup
yazılır: önce Modem/WAN, sonra DHCP, sonra diğerleri, LAN IP EN SON.**
Neden: LAN IP yazıldığı an cihaz adres değiştirir ve bağlantı kopar — önce
yazılsaydı kalan ayarlar artık var olmayan adrese giderdi. Yazma HTTP formu
ile DEĞİL telnet+nvram ile yapılır; HTTP istemcisi POST'u yapısal olarak
reddeder (yazabilen tek modül console.js).

> Teknik: `groupPlan()` (sıralama) → `consoleWrite()` (telnet, yalnızca
> `writeAllowed:true` ile).

## Adım 11 — Reboot gönderilir.

**Burada cihaza "yeniden başla" denir ve cevap beklenmez** (bağlantı zaten
kopar). Ayarlar reboot'la yürürlüğe girer; SIM PIN yazıldıysa aynı reboot'ta
denenir — ikinci bir reboot'a gerek kalmaz.

> Teknik: `rebootFireForget()` — `attempts:1` zorunlu (retry açık olsaydı
> 2-3. denemeler açılmakta olan modeme gidip ~16 sn boşa bloklardı).

## Adım 12 — Cihaz YENİ adresinde doğrulanır.

**Burada araç, cihazın yeni adresinde (`5.5.5.1`) geri gelmesini bekler,
nvram'ı YENİDEN okur ve Adım 7'deki karşılaştırmayı tekrar yapar.**
`changing` bu kez boş çıkarsa = tüm ayarlar oturmuş → **success**. Saniyede
bir ucuz TCP yoklaması yapılır; reboot gönderildiyse cihaz bir kez "düşmüş"
görülmeden doğrulanmaz (yoksa eski oturumun nvram'ı yeni durum sanılırdı).
Aynı anahtar 3 tur üst üste eksikse: "cihaz bu değeri reddediyor" teşhisi.

> Teknik: `verifyPlanSettled()` — üst sınır 100 sn; `isReachable` +
> `consoleNvram` + `planProvisioning` yeniden.

## Adım 13 — İnternet kontrolü: "bu SIM gerçekten çalışıyor mu?"

**Burada WAN IP'nin gelmesi beklenir (en çok 150 sn)** — teknisyenin elle
süreçte yaptığı son kalite kontrolünün otomatiği. Ayarları doğru ama SIM'i
çalışmayan modem sahada iş yapmaz; onu yakalayan adım budur (PIN kilitli SIM
ICCID verir ama internet vermez). Cihaz "SIM kilitli" diyorsa hiç beklemeden
kısa devre yapılır; internet gelmez ve PIN verilmişse **tek** deneme yapılır.

> Teknik: `waitForInternet()` (src/device.js) → aynı web sayfasından `wan_ip`
> alanı; ölçüm: reboot sonrası ~89 sn'de geliyor, üst sınır bu yüzden 150.

## Adım 14 — Kayıt yazılır, READY denir, sıradaki modeme geçilir.

**Burada modemin tek satırlık kalıcı kaydı deftere işlenir** (telefon, ICCID,
IMEI, MAC, durum ve `fieldReady`: ayarlar doğru VE internet geldi mi), süre
ölçümü ayrı dosyaya yazılır, terminale **`READY — you can unplug the
device`** basılır. Araç modemin çıkarılmasını bekler ve Adım 1'e döner:
sıradaki modem.

> Teknik: `finishRecord()` → `provisionRecord()` → CLI callback'i
> `data/provisioned.jsonl` + `data/metrics.jsonl`'a yazar (çekirdek dosyaya
> kendisi yazmaz). `waitForModemRemoval()` → döngü başa.

---

## Değişmez sözleşmeler (her adımda geçerli)

- stdout **her zaman** saf JSON; ilerleme/özet stderr'a; çıkış kodu `ok`'tan.
- Operatöre giden her metin `problems.js` kataloğundan gelir.
- Çekirdek (`src/`) env/argv okumaz, stdout'a yazmaz, throw etmez, dosyaya
  yazmaz — girdi `opts` ile gelir, çıktı `{ ok, ..., problems: [] }` nesnesidir.

---

## VERİ KAYNAKLARI — hangi bilgi hangi kanaldan, neden?

Modemle üç kanaldan konuşulur. Kural: **okuma çoğunlukla web'den, yazma her
zaman telnet+nvram'dan, SIM'in kendisiyle konuşma AT'den.**

### Kanal 1 — Web arayüzü (HTTP GET, port 80) · src/net.js + src/device.js

Modemin gömülü web sunucusu **tek bağlantılıdır**; tüm istekler sıralı
kuyruğun arkasından, `Connection: close` ve `localAddress` (kaynak IP) ile
gider. İstemci **yalnızca GET yapabilir** — `post()` koşulsuz reddeder; bu
bir ayar değil yapısal garantidir.

| Bilgi | Nereden | Kim okur |
|---|---|---|
| `lan_mac` (cihaz kimliği) | `GET /asp/status/Info.live.htm` | `readIdentity()` |
| SIM durumu (OK/Invalid/Not Insert), ICCID, IMSI, IMEI, operatör | `GET /asp/status/Status_Internet.live.asp` | `readSim()` → `readIdentity()` |
| WAN IP (internet geldi mi) | aynı sayfa | `waitForInternet()` |

**Neden web:** bu bilgiler cihazın hazır durum sayfalarında; okuma hızlı
(~2 sn), kimlik doğrulamalı ve hiçbir şeyi değiştirmez.

### Kanal 2 — Telnet konsolu (port 5123, BusyBox root shell) · src/console.js

dd-wrt tabanlı yazılımın root kabuğu. Varsayılan **salt okunur**: yazan
komutlar yalnızca `writeAllowed: true` ile geçer.

| Bilgi / işlem | Komut | Kim kullanır |
|---|---|---|
| Tam ayar dökümü ("mevcut durum") | `nvram show` | `consoleNvram()` |
| 13 saha ayarının yazılması | `nvram set` + commit | `consoleWrite()` |
| Yeniden başlatma | `reboot` | `rebootFireForget()` |

**Neden telnet+nvram, HTTP formu değil:** (1) form sayfa başına ayrı uç ve
ayrı hata yüzeyi demek, nvram tek tip anahtar=değer; (2) fark-temelli yazma
ancak ham nvram okumasıyla mümkün; (3) yazmayı tek kanala kilitlemek
güvenliği basitleştirir — HTTP istemcisinin POST'u yapısal kapalı.

### Kanal 3 — AT komutları (telnet 5123 → /dev/ttyUSB0) · src/at.js

Taşıma yine telnet konsoludur; kabukta hücresel modülün seri portuna AT
komutu yazılıp cevabı okunur — yani **SIM'in/modülün kendisiyle** konuşma.

| Bilgi / işlem | AT komutu | Hak harcar mı? | Neden AT |
|---|---|---|---|
| Telefon numarası (MSISDN) | `AT+CNUM` | Hayır | Web arayüzünde YOK; yalnız SIM bilir |
| ICCID (yedek yol) | `AT+CCID` | Hayır | Numara okunamazsa kimliklendirme |
| Kilit türü (PIN/PUK) | `AT+CPIN?` | Hayır | Kesin durum modülden |
| Kalan PIN/PUK hakkı | `AT+QPINC="SC"` / `AT+CPINC` | Hayır | Son-hak koruması bu sayıya dayanır |
| Kilit açık mı sorgusu | `AT+CLCK="SC",2` | **Hayır** (mode 2 = sorgu) | Dry-run "zaten açık/kapalı" diyebilsin |
| PIN gönder / kilidi kaldır | `AT+CPIN="..."` + `AT+CLCK="SC",0,"..."` | **EVET — bir deneme** | Kilit ancak SIM'e PIN göndererek kalkar |
| Kilidi koy (test için) | `AT+CLCK="SC",1,"..."` | **EVET** | Kilitli SIM senaryosu üretmek için |

Hak harcayan komutların hepsi ortak kapıdan geçer (`canSpendPinAttempt`):
biçim kontrolü (4-8 hane), **son hak koruması**, yanmış-hak tespiti
(`kalan < toplam`). PIN'in kendisi hiçbir kayda/log'a/olaya yazılmaz —
yalnızca "denendi mi" bilgisi taşınır.

### Özet karar tablosu

| İhtiyaç | Kanal | Sebep |
|---|---|---|
| Cihaz ayakta mı? | TCP connect (80 + 5123, paralel) | En ucuz sinyal |
| Kimlik/SIM/internet durumu | Web GET | Hazır sayfalar, salt okunur, hızlı |
| Ayar okuma/yazma | telnet + nvram | Fark-temelli yazım, tek yazma kanalı |
| Numara, kilit, kalan hak | AT | Bu bilgiler yalnız SIM/modülde |

---

## Tek paragraflık özet

`npm start` önce bilgisayarı hazırlar (yetki + her aday alt ağa ikincil IP +
gerekirse DHCP ile modem keşfi), sonra modem takıldıkça web'den kimliğini ve
SIM durumunu okur, numarayı AT+CNUM ile SIM'den alır, istenen ~13 ayarı
cihazın nvram sözlüğüyle karşılaştırıp yalnızca farkı — LAN IP en sonda —
telnet'ten yazar, reboot edip cihazı yeni adresinde doğrular, WAN IP gelene
kadar bekleyerek SIM'in gerçekten çalıştığını görür ve her modemi tek
satırlık kalıcı deftere işler. Operatörün işi: tak → sorulursa PIN/numara
gir → READY yazınca çıkar → sıradaki.
