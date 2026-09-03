# Ağ Notları — Ricon Çalışmasında Öğrenilen Her Şey

Bu belge, Ricon modem otomasyonu üzerinde çalışırken adım adım açıklığa
kavuşturduğumuz **tüm ağ kavramlarının** toparlanmış hâlidir. Her bölüm önce
sade bir dille anlatır, sonra kendi cihazlarımızdan alınmış **gerçek
ölçümlerle** kanıtlar. Akış belgesi ayrıdır: `NPM-START-AKISI.md` aracın ne
yaptığını anlatır; bu belge **altta yatan ağ dünyasını** anlatır.

---

## 1. IP Adresi Temelleri

### 1.1 İki özel adres: `0.0.0.0` ve `255.255.255.255`

**`0.0.0.0` = "adres yok / henüz yok / hepsi"** — bağlama göre üç anlam:

| Bağlam | Anlamı |
|---|---|
| Cihaz adresi olarak | "Adresim yok" — DHCP isteyen makine kaynağa bunu yazar |
| Dinleme adresi olarak | "Her arayüzden kabul et" — sunucu `0.0.0.0:80` dinlerse her IP'den erişilir |
| Rota olarak (`0.0.0.0/0`) | "Her adres" = varsayılan rota (default gateway'in tanımı) |

Projede "boş/temizlenmiş" işareti olarak kullanılır: `lan_ipaddr_ex1: 0.0.0.0`
= ikinci LAN adresi silindi; `wan_ip: 0.0.0.0` = internet yok.

**`255.255.255.255` = "buradaki herkes"** — sınırlı yayın (limited broadcast).
Bu adrese giden paket yerel ağdaki herkese ulaşır ama **router'dan asla
geçmez**. Klasik kullanım DHCP: adresi olmayan makine `0.0.0.0`'dan
`255.255.255.255`'e bağırır — "kimse beni tanımıyor ama biri bana adres
versin."

İkisi de bir **makineye atanamaz**: işletim sistemi kapıda çevirir. Zorla
atansaydı ilki seni sağır ederdi (cevabın döneceği adres yok), ikincisi ağı
sağır ederdi (sana özel trafik diye bir şey kalmaz).

### 1.2 Subnet mask: "mahalle" ile "ev numarası" ayrımı

Maske, IP'nin hangi kısmının ağı (mahalleyi), hangi kısmının cihazı (evi)
gösterdiğini söyler. `255.255.255.0` (/24) = ilk üç blok mahalle, son blok ev
— `5.5.5.1` ile `5.5.5.100` komşudur, router'sız konuşurlar.

- **Maske `0.0.0.0` (/0):** "tüm dünya mahallem" — makine her adresi yerel
  sanır, gateway'i hiç kullanmaz, pratikte routing çöker. (Rota olarak
  yazıldığında ise meşrudur: default route.)
- **Maske `255.255.255.255` (/32):** "mahallem yalnız benim" — kimse yerel
  değildir, gateway'e bile ulaşılamaz. Meşru kullanımı tek cihaza özel host
  rotalarıdır; adaptör maskesi olarak verilirse makine ağdan kopar.
- Bitişik olmayan maske (örn. `255.0.255.0`) geçersizdir — "mahalle" parçalı
  olamaz; aracımızın `prefixFromMask`'ı bunu reddeder.

**Tuzak adresler:** /24 bir ağda son okteti `.0` (ağ adresi) ve `.255`
(broadcast) olan adresler cihaza verilmemelidir — bazı sistemler kabul eder
ama karşı taraflar trafiği düşürür. Aracın `findFreeSecondaryIp`'inin
`.100-.250` aralığında gezmesi bu tuzaklardan uzak durur.

---

## 2. MAC Adresi — "Bilgisayarın MAC'i" Diye Bir Şey Yoktur

MAC, **arayüz başına** fabrikada yazılmış donanım kimliğidir. Bir bilgisayarın
tek MAC'i yoktur; **arayüz sayısı kadar** MAC'i vardır (Ethernet, Wi-Fi,
Bluetooth — her biri ayrı). İlk 3 bayt üreticiyi söyler (OUI): `00:0C:43` =
Ralink/MediaTek (modemimiz), `84:BA:59` = Intel.

İki tür MAC gördük:

- **Fabrika MAC'i:** donanıma yazılı. Modemde LAN `...5f:4e`, WiFi `...5f:50`
  — aynı üretici bloğundan ardışık iki adres.
- **Türetilmiş/uydurma MAC:** `02` ile başlar ("locally administered" biti).
  Modemin hücresel arayüzü `usb0 = 02:0c:29:...` ve AP-Client arayüzü
  `apcli0 = 02:0c:43:...` böyle — donanımda karşılığı olmayan arayüzler
  MAC'ini ya miras alır ya uydurur.

DHCP paketi de belirli bir arayüzden çıkar ve **o arayüzün** MAC'ini iki
yerde taşır: Ethernet çerçevesinin kaynak alanında ve DHCP mesajının `chaddr`
alanında — sunucu kirayı bu MAC'e yazar.

---

## 3. Ağ Kartı, Adaptör ve GUID — Windows Modeli

Üç ayrı şeyi birbirinden ayırmak her şeyin anahtarı:

| Kavram | Ne | Örnek (ölçtüğümüz) |
|---|---|---|
| **Ağ kartı (NIC)** | Fiziksel çip; MAC seviyesinde çerçeve alıp verir. IP'den habersizdir | Intel I219-V |
| **Adaptör** | İşletim sisteminin o kart için yarattığı **yazılım nesnesi**; tüm yapılandırma (IP, DHCP, DNS) bunun üzerindedir | "Ethernet" |
| **GUID** | Adaptör örneğine kurulumda bir kez verilen rastgele ama kalıcı etiket; ayarların kayıt defterindeki anahtarı | `{DFC4E5A8-...}` |
| **Donanım kimliği (PnPDeviceID)** | Kartın "ne ve nerede" kimliği: üretici+model+takılı yuva | `PCI\VEN_8086&DEV_550B...` |

Zincir: **çip (MAC) → PnP kimliği → cihaz örneği → GUID → kayıt defterindeki
IP ayarları.** "Ethernet'e statik IP verdim" demek, bu zincirin ucundaki
`HKLM\...\Tcpip\Parameters\Interfaces\{GUID}` anahtarına satır yazmak demek.

Önemli sonuçlar (hepsi tek tek doğrulandı):

- **Statik IP diske yazılır, GUID'e bağlanır.** Kablo/karşı cihaz önemsizdir.
- **Kart değişirse IP'ler taşınmaz:** yeni kart → yeni PnP kimliği → yeni
  cihaz örneği → yeni GUID → eski ayarlar öksüz kalır; yeni adaptör sıfır
  (DHCP) doğar. Eşleme anahtarı **MAC değil, GUID'dir** (MAC değiştirsen
  ayarlar bozulmaz).
- **Adaptör silinip yeniden kurulabilir:** Aygıt Yöneticisi'nde kaldır + tara
  → yeni GUID → ayarlar sıfırlanır. Windows "Ağ sıfırlama" bunu topluca yapar
  → **tüm statik IP'ler kaybolur**.
- **Öksüz kayıtlar temizlenmez:** eski GUID anahtarları kayıt defterinde
  zararsızca birikir; yalnız bilinçli sıfırlama süpürür.
- **2 ethernet girişi = 2 ayrı kart, 2 MAC, 2 adaptör** (PC'lerde). Tek
  fiziksel karta birden çok mantıksal adaptör de kurulabilir: VLAN
  alt-adaptörleri, Hyper-V switch üzerine vNIC'ler; tersi de var (teaming:
  çok kart → tek adaptör).
- Kavram Windows'a özgü değil: Linux'ta adı **interface**'tir; fark, Linux'un
  kimlik (çekirdekteki arayüz) ile yapılandırmayı (NM profili) **ayrı**
  tutmasıdır.

---

## 4. Sanal Adaptörler

Adaptör gerçek donanıma muhtaç değildir — bunu iki dünyada da gördük:

- **Windows — vEthernet:** Hyper-V/WSL2 etkinleştirilince oluşur; sanal
  makinelerin yaşadığı iç ağa açılan kapıdır. `PnPDeviceID`'si boştur, MAC'i
  uydurmadır (`00-15-5D-...`). Gerçek kartın işini devralmaz (istisna:
  Hyper-V *External Switch* kurulursa host'un IP'leri vEthernet'e taşınır,
  fiziksel kart salt L2 limanı olur). Sanal switch başına bir tane olmak
  üzere birden çok yaratılabilir. Aracımızın `detectAdapter`'ı
  `Get-NetAdapter -Physical` kullandığı için sanal adaptörler otomatik
  seçime hiç giremez.
- **Linux — çok daha yaygın:** `br0` köprüleri, `veth` çiftleri (container),
  `tun/tap` (VPN), `vlan` alt-arayüzleri, `macvlan`... Ricon modemin kendisi
  IP'sini sanal bir köprüde (`br0`) taşır.

---

## 5. IP'ler Nerede Yaşar: RAM ve Disk

Her IP yapılandırmasının iki olası katmanı vardır:

| Katman | Nerede | Ömrü |
|---|---|---|
| Çalışma anı | Çekirdeğin RAM'deki arayüz durumu | Oturum; koşullara göre silinir |
| Kalıcı | Windows: kayıt defteri · Linux: NM profili (`/etc/NetworkManager/system-connections/*.nmconnection`) | Diskte, reboot'a dayanır |

**Kablo çıkınca ne olur?** (En çok kafa karıştıran soru — cevap platforma göre)

| | RAM'deki adres | Diskteki kayıt |
|---|---|---|
| Windows | **Silinmez** — "media disconnected" olur, kablo dönünce anında iş görür | Dokunulmaz |
| Linux + NM | **Silinir** — NM "bağlantı öldü" deyip çekirdekten süpürür; kablo dönünce **yalnız profilde yazılı olanları** geri uygular | Dokunulmaz |
| Linux, NM'siz | **Silinmez** — çekirdek carrier kaybında adresi tutar; silen çekirdek değil NM'nin politikasıdır | Zaten kayıt yok (reboot'ta gider) |

Bu tablo bir canlı kesintiyle ölçüldü: `nmcli device modify` ile (yalnız
RAM'e) eklenen adresler kablo çıkınca gitti ve geri gelmedi; çözüm son adres
kümesini profile de yazmak oldu.

**Linux komut referansı:**

| İş | Uçucu (RAM) | Kalıcı (profil) |
|---|---|---|
| Ekle | `ip addr add X/24 dev IF` · `nmcli device modify IF +ipv4.addresses X/24` | `nmcli connection modify "PROFIL" +ipv4.addresses X/24` (+ `connection up`) |
| Gör | `ip -4 addr show dev IF` | `nmcli -g ipv4.addresses connection show "PROFIL"` |
| Sil | `ip addr del X/24 dev IF` | `nmcli connection modify "PROFIL" -ipv4.addresses X/24` |

Tuzaklar: `nmcli device ...` uçucu, `nmcli connection ...` kalıcıdır (çok
benzerler!); öneksiz `ipv4.addresses` ekleme değil **tüm listeyi değiştirme**
demektir. `ip addr`'da olup profilde olmayan adres = kablo çıkınca gidecek.

**Aracımız neden önce uçucu ekleyip sonra persist ediyor?** (1) kalıcı yazım
anında etkili değildir, profil yeniden yüklenmeli — o da bağlantıyı söker;
adreslere aynı koşuda ihtiyaç var. (2) keşif sırasındaki geçici hâller RAM'de
kalırsa hata kendini onarır; profile yazılsaydı yapışırdı. (3) kalıcılık
bonustur: yetki reddi tüm hazırlığı çökertmemeli. (4) profile yalnız son,
doğrulanmış küme, yalnız `+ipv4.addresses` olarak gider — `method/gateway/
dns`'e dokunulmaz. Windows'ta ikilem yok: `New-NetIPAddress` tek çağrıda hem
anlık hem kalıcıdır.

**DHCP ile bulunan adresin kaderi:** araç adaptörü DHCP modunda bırakmaz —
kiranın verdiği adres statiğe **çevrilir** (o adres modemin havuzundan
geldiği için boşluğu kanıtlıdır). Kira süresi o andan itibaren anlamsızdır;
adres süresiz kalır. Yan etki: başta DHCP modunda olan makine kalıcı statiğe
geçmiş olur ("adaptör DHCP modundaydı" bilgisi geri getirilmez).

---

## 6. Kaynak IP Seçimi ve SkipAsSource

Bir makinede birden çok adres varsa, dışarı giden her bağlantı için Windows
bir **kaynak adres** seçer. `-SkipAsSource $true` ile eklenen ikincil adresler
bu otomatik seçime **girmez** — makinenin normal trafiği bozulmasın diye.

Bunun iki yüzü var:

- **Aracımız etkilenmez:** her bağlantıyı `localAddress` ile **elle** doğru
  kaynağa bağlar (SkipAsSource yalnız otomatik seçimi engeller). `fetch`
  yerine `node:http` kullanmamızın sebebi tam bu — `fetch` kaynak
  bağlayamaz.
- **Tarayıcı etkilenir:** `5.5.5.1`'i açmak isteyen tarayıcının paketi yanlış
  kaynaktan (örn. `192.168.1.x`) çıkar; modem cevabı geri yollayamaz
  (kendi LAN'ına yabancı adres → cevap WAN'a gider, kaybolur). Canlı
  yaşandı: Windows'ta tarayıcı açılmadı, aynı modem Linux makinede anında
  açıldı (Linux'ta SkipAsSource kavramı yok, kaynak rotadan doğal seçilir).
  Çözüm: `Set-NetIPAddress -IPAddress 5.5.5.100 -SkipAsSource $false`.

İlgili ölçülmüş kural: **kaynak IP bağlamadan yoklama yapılmaz** — kurumsal
ağda kaynaksız TCP connect her adrese "başarılı" dönüyor (güvenlik
ajanı/proxy yerelde kabul ediyor); kaynaksız tarama "her cihaz ayakta" der ve
teşhis çöker.

---

## 7. DHCP Nasıl Çalışır ve Biz Nasıl Kullanıyoruz

Adressiz makine `0.0.0.0` kaynağından `255.255.255.255`'e DISCOVER yayını
yapar; MAC'i pakette taşınır; DHCP sunucusu (modemin içindeki) havuzundan bir
adres ayırıp kira (lease) olarak önerir — kirayla birlikte gateway
(`routers`), maske ve sunucu kimliği (`dhcp_server_identifier`) de gelir.

Aracımız DHCP'yi alışılmışın tersine **keşif aracı** olarak kullanır: modemin
adresi bilinmiyorsa adaptör geçici olarak DHCP istemcisi yapılır; gelen
kiradan **modemin kendisi** öğrenilir (kanıt sırası: `routers` seçeneği →
kirayı veren sunucu → alt ağın `.1` geleneği — sonuncusu kanıt değil aday
olduğu için yoklanarak doğrulanır). Makinenin kendi statik gateway'i kira
sanılmamalıdır (route `proto static` reddedilir) ve `169.254.*` (APIPA —
DHCP bulamayan makinenin kendine uydurduğu adres) kira sayılmaz.

---

## 8. Switch Nasıl Çalışır

PC portu ile switch portu arasındaki fark her şeyi özetler:

| | PC'nin ethernet girişi | Switch/modem LAN girişi |
|---|---|---|
| Rolü | **Uç nokta** — trafik burada biter | **Geçit** — trafik içinden geçer |
| MAC | Var (port başına) | **Yok**; cihazın beyninde 1 tane |
| Ağ kartı/adaptör | Var | Yok — portlar tek denetleyiciyi paylaşır |
| IP | Adaptöre yazılır | Köprüye/yönetim arayüzüne yazılır |

**MAC öğrenme:** switch, her porttan gelen çerçevenin *kaynak* MAC'ini not
eder ("bu MAC şu portta oturuyor"), sonraki çerçevelerde *hedef* MAC'i
tablodan bulup yalnız o porta iletir. Bilinmeyen hedef ve broadcast
(`FF:FF:FF:FF:FF:FF`) tüm portlara sellenir. ~5 dk sessiz kalan kayıt
tablodan silinir (ageing).

- **Yönetilmeyen switch** (RVM'lerdeki tipik): IP'si, konsolu, MAC'i yoktur —
  ağda görünmezdir. Onu ancak davranışından tanırsın: `arp -a` (kim hangi
  MAC'te), bağlantı hızı (`Get-NetAdapter` → LinkSpeed), Wireshark'ta
  broadcast trafiği. **Yönetilen** switch'in tek yönetim MAC'i/IP'si vardır
  ve kendini LLDP çerçeveleriyle tanıtabilir.
- **Modemin içinden switch'i izlemek:** `brctl showmacs br0` köprünün
  öğrenme tablosunu döker — `is local? no` satırları trafikten öğrenilen
  komşular, `ageing timer` son görülme süresi. `cat /proc/net/arp` IP↔MAC
  eşlemesini verir. Port link durumları switch çipinden okunur (`switch phy`
  ya da `mii_mgr` ile PHY yazmaçları).
- ICMP (ping) kapalı cihazlar bile **ARP'a cevap vermek zorundadır** — bu
  yüzden başarısız bir ping taraması bile `arp -a` tablosunu doldurur.

---

## 9. Modemin İçi — Telnet'le Doğrulanmış Gerçek Harita

Modem küçük bir Linux bilgisayarıdır (OpenWrt soyu, MIPS). `/sys/class/net`
ve `ifconfig` ile içini kendimiz döktük; sonuç:

```
[LAN1..4 portları] → dahili switch (etiket basar) → eth2 → vlan1 → br0
                                                    (gerçek   (VLAN   (sanal köprü)
                                                     kart)    dilimi)
   eth2 : MAC 00:0c:43:43:5f:4e · IP YOK   ← donanımın kimliği
   vlan1: aynı MAC · IP yok · up           ← eth2'nin "1 etiketli" dilimi
   br0  : aynı MAC (miras) · IP 192.168.1.1/5.5.5.1 ← IP'nin evi
   ra0  : MAC ...5f:50 (fabrika, ayrı) · IP yok      ← WiFi radyosu
   usb0 : MAC 02:... (uydurma) · IP operatörden      ← hücresel WAN
   apcli0: MAC 02:... (türetilmiş) · down            ← AP-Client kalıbı
```

Bu haritadan çıkan kurallar:

1. **LAN portlarının MAC'i/kartı/adaptörü yoktur** — dahili switch'in
   bacaklarıdır; hangi porta takarsan tak aynı yere çıkarsın. 4 portlu
   modemde port başına değil **arayüz başına** MAC vardır (toplam 2-3).
2. **`vlan1` = VLAN etiketiyle ayrılmış mantıksal dilim.** Switch ile CPU
   arasında tek iç hat vardır; birden çok ağ taşıyabilmek için çerçeveler
   etiketlenir. `vlan0` (klasik kablolu-WAN dilimi) bu cihazda atıldır —
   WAN hücreseldir.
3. **IP her zaman bir yapılandırma nesnesindedir:** modem bunu sanal köprüde
   (`br0`) tutar, çünkü birden çok fiziksel yolu (kablo + WiFi) tek ağ olarak
   sunması gerekir. WiFi açılınca `ra0` doğar ve `br0`'ın üye listesine
   katılır (`ra0 vlan1`) — kapatılınca arayüz tamamen silinir.
4. **IP'li arayüz MAC'siz olamaz:** IP'ye ulaşmak ARP ister ("5.5.5.1 kimde?"
   sorusuna "bende, MAC'im şu" diyebilmek). br0 MAC'ini eth2'den miras alır —
   web arayüzünde görünen `lan_mac` aslında br0'ınkidir. MAC'siz arayüz
   olabilir (switch portları) ama onların IP'si de yoktur.

---

## 10. LAN ve WAN

- **LAN** = cihazın iç tarafı; senin kurduğun, adreslerini senin seçtiğin
  mahalle (modem + switch + RVM cihazları). Modemde `br0`, nvram'da `lan_*`
  anahtarları, adres `5.5.5.1` (bizim seçimimiz).
- **WAN** = dış taraf; operatörün ağı. Modemde `usb0`, nvram'da `w1_wan_*`,
  adresi Turkcell verir (dinamik). Router ikisinin sınırındaki gümrüktür:
  **NAT** ile mahalledeki herkesin trafiğini kendi WAN adresiyle postalar;
  internetten bakan yalnız o tek adresi görür.
- **WAN girişine kablo takarsan roller tersine döner:** modem o kapıda
  hizmet vermez, hizmet **bekler** (DHCP istemcisi olur — kablolu WAN/Backup
  Link, "SIM yerine kablodan çık" içindir); yönetim kapıları o yönden
  firewall'ludur. Pratikte "modem yok" gibi görünür — provizyon her zaman
  LAN portundan yapılır. Saha profilimiz Backup Link'i bilerek kapatır
  (`w2_wan_proto=disabled`).
- İnternet doğrulamamız bir WAN sorusudur: `w1_wan_ip` doldu mu = operatör
  adres verdi mi = SIM gerçekten çalışıyor mu.

---

## 11. Veri Modemin İçinden Nasıl Akar — "İçeride TCP mi UDP mi?"

Düzeltilmesi gereken sezgi: **içeride TCP/UDP "olmaz"** — onlar iletişimin iki
*ucuna* ait kavramlardır; aradaki cihazlar valizi açmaz, etiketine bakıp
taşır. Katmanlar:

| Katman | Kim işler | Neye bakar |
|---|---|---|
| Sinyal/bit | Port devresi (PHY) | Voltaj |
| Çerçeve | Switch çipi (donanım) | **Hedef MAC** |
| IP paketi | Linux çekirdeği | **Hedef IP** (rota + NAT) |
| TCP/UDP | Yalnız uç noktalar | **Port** |

LAN'dan gelen bir çerçevenin üç olası yolculuğu:

1. **LAN → LAN** (RVM içi trafik): switch çipi hedef MAC'e bakıp doğru
   porttan çıkarır — donanımda, nanosaniyede biter. İşlemci ve Linux bu
   trafiği **görmez bile**; TCP/UDP hiç açılmaz.
2. **LAN → modemin kendisi** (bizim aracın istekleri): hedef MAC = br0 →
   çerçeve merdiveni tırmanır (eth2→vlan1→br0), IP katmanı "bana" der, TCP
   açılır, port bakılır (80 web / 5123 telnet — ikisi de TCP; DHCP ise UDP
   67/68). **TCP'nin gerçekten açıldığı tek yer burası** — modem burada aracı
   değil uç noktadır.
3. **LAN → internet**: hedef IP yabancı → çekirdek rota tablosuna bakar
   (çıkış `usb0`) ve **NAT** yapar: kaynak `5.5.5.x` yerine kendi WAN
   adresini yazar, eşlemeyi bağlantı tablosunda tutar, cevabı geri çevirir.
   NAT'ın TCP/UDP'ye dokunuşu port numaralarını okuyup gerekirse yeniden
   yazmaktan ibarettir — içeriğe bakmaz.

Ezber: **TCP/UDP kablolarda akmaz, uçlarda yaşar; switch MAC'e, router IP'ye
bakar, valizi yalnız alıcı açar.** Modem üç rolü tek kutuda oynar: LAN içinde
switch, dışarı çıkarken router+NAT, araç bağlandığında sunucu.

---

## 12. Modemin Gizli Durum Yayını (Bulut / M2M)

Keşif günlüğünün en önemli router bulgusu: modem fabrika hâlinde **üç ayrı
dış sunucuya** kendiliğinden bağlanıp kalp atışı (heartbeat) göndermeye
çalışır — "içeriden dışarıya bağlan" modeliyle çalışan hazır bir uzaktan
izleme altyapısı:

| Hedef | Adres | Aralık |
|---|---|---|
| Ricon bulut | `78.186.62.169:7001` (TR) | `cloud_heart_tm=8` |
| M2M sunucu | `58.215.16.142:15695` (**Çin**) | her 30 sn |
| Alotcer (başka marka!) | `server.alotcer.com:28035` | her 60 sn |

Bunu router'daki ayrı servisler yürütür (`m2mcloud`, `m2mgps`,
`checksignal`). Canlı kanıt: `netstat -tn`'de buluta `SYN_SENT` (bağlanmaya
çalışıyor, sunucu cevapsız), `/tmp/.cloudst = Closed`. Yani cihaz 30-60 sn
aralıklarla **boşuna** üç sunucuya bağlanmayı dener.

İki yönlü sonuç: **Fırsat** — sunucu adresleri kendi sunumuza çevrilirse tüm
filo 30 sn'de bir otomatik rapor verir (NAT engelini aşan hazır izleme).
**Risk** — kontrol dışı yurt içi/dışı sunuculara sürekli bağlantı denemesi
(KVKK/güvenlik); saha profili bu anahtarlara şu an **dokunmuyor** — kapatma
ya da yönlendirme, alınmayı bekleyen bir karar.

Ayrıca hücresel modülün kendi seri portuna kendiliğinden bastığı durum
mesajları vardır (URC, örn. `+QENG` hücre raporu: baz istasyonu, bant,
sinyal) — bir izleme yazılımı için tasarlanmış bu akış, AT komut cevaplarına
karışabildiği için aracımız cevapları sonlandırıcıda (`OK/ERROR`) keser ve
karışık cevabı yeniden okur.

---

## 13. Ricon'a Özgü Ölçülmüş Ağ Tuzakları

Hepsi canlıda ölçülüp koda/teste bağlanmış kurallar:

1. **Web sunucusu tek bağlantılıdır** (HTTP/1.0, `Connection: close`) — hızlı
   ardışık istek zaman aşımına düşürür; tüm HTTP tek sıralı kuyruktan geçer
   (istekler arası ~1.5 sn).
2. **ICMP kapalıdır** — modem ping'e cevap vermez; "ayakta mı" sorusu 80 ve
   5123 portlarına **paralel TCP connect** ile sorulur (diğer portlar zaten
   hep kapalı, yoklamak boşa soketti).
3. **Kaynak IP'siz yoklama yasak** (bkz. §6) — kaynaksız connect kurumsal
   ağda her adrese "başarılı" döner.
4. **Yazma HTTP değil telnet+nvram'dandır**; HTTP istemcisi POST'u yapısal
   olarak reddeder — modemi yalnızca tek kanal değiştirebilir.
5. **Uzaktan root telnet riski:** portlar `0.0.0.0` dinler ve
   `remote_mgt_telnet=1` — WAN public IP alırsa root konsol internete açık
   olabilir; sahaya çıkmadan teyit edilmeli.
6. Modem **her gece ~03:00'te kendini yeniden başlatır**
   (`reboot_enable=1`) — sahada gece kısa bağlantı kaybı normaldir.

---

## Ezber Kartı

- IP **adaptöre/arayüze** yazılır — kabloya değil, karta değil, "bilgisayara"
  değil.
- **MAC donanımın, IP yapılandırmanın**; IP'li arayüz MAC'siz olamaz (ARP).
- Windows: ayarlar kayıt defterinde **GUID**'e bağlı; kart değişirse taşınmaz.
- Linux: RAM (uçucu) ve NM profili (kalıcı) ayrıdır; kabloyu çıkaran NM
  RAM'i süpürür, dönüşte yalnız profildekini geri takar.
- Switch portu kapıdır (MAC'siz), PC portu ağızdır (MAC'li); switch MAC
  öğrenerek çalışır.
- TCP/UDP uçlarda yaşar; arada switch MAC'e, router IP'ye bakar; NAT kaynağı
  değiştirir.
- LAN senin mahallen, WAN operatörün kapısı; provizyon hep LAN'dan.
- Modem = küçük Linux: portlar → switch → eth2 → vlan1 → br0(IP) zinciri;
  WiFi açılınca köprüye katılır; hücresel WAN ayrı arayüzdür (usb0).
