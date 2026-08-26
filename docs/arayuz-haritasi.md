# Arayüz → nvram Haritası (Faz 2)

Her satır **web arayüzünde ayar değiştir → nvram öncesi/sonrası diff** ile
**kanıtlandı**. Yöntem: nvram kararlı (hiç değişmeden iki görüntü = 0 fark),
o yüzden bir ayar değişince çıkan fark %100 o ayarın karşılığı.

Kaynak araç: `node ricon.js konsol --nvram --json ...` (önce/sonra) +
`node ricon.js fark once.json sonra.json`.

Durum işareti: 🟢 diff ile doğrulandı · ⏳ henüz haritalanmadı.

---

## 🟢 WLAN aç/kapa  (2026-08-26 diff ile doğrulandı)

**Operatif anahtar:** `wl0_net_mode`
- `disabled` = WLAN kapalı
- `mixed` (ya da başka bir mod) = WLAN açık

**Kanıt (disabled → enabled diff'i):**
```
wl0_net_mode: disabled -> mixed        <-- ASIL TOGGLE
```
Yan etki (UI açınca dolan radyo parametreleri, toggle değil):
`wl0_frameburst`, `wl0_afterburner`, `wl0_auth_mode`, `wl0_authmode`,
`wl0_wep`, `wl0_wchannel`, `wl_channel`, `wl_gmode`, `wl_nband`, `wl_nmode`,
`wl_nreqd`, `wl_frameburst`, `wl_afterburner`, `wl0_wep_buf`, `wl0_nctrlsb`.

**ÖNEMLİ:** `wl_radio` DEĞİŞMEDİ (baştan beri `1`). Yani WLAN toggle'ı
`wl_radio` DEĞİL — `wl0_net_mode`. (Faz 1 notlarındaki "aday" belirsizliği
böylece kapandı.)

**Ters yön de doğrulandı (enabled → disabled diff'i):**
```
wl0_net_mode: mixed -> disabled
wl_net_mode:  mixed -> disabled        <-- UI ikisini birden yaziyor
wl0_gmode/wl_gmode: 1 -> -1  (yan)
```

**Faz 3 için:** "WLAN kapalı" hedefi → **`wl0_net_mode=disabled` VE
`wl_net_mode=disabled`** (UI ikisini birden set ediyor; birebir uyum için
ikisi de yazılmalı). Set sonrası geri-okuma ile doğrulanacak.

**Apply davranışı:** Save+Apply yapıldı; nvram değişikliği kalıcı görüldü.
Reboot gözlenmedi (telnet/nvram erişimi kesintisiz). İki yön de test edildi.

---

## 🟢 APN (SIM1)  (2026-08-26 diff ile doğrulandı)

**Operatif anahtar:** `m1s1wanapn`
- Kanıt: `m1s1wanapn: internet -> test`.
- **`m1s1wanapn_cst` DEĞİŞMEDİ** (hâlâ "internet") → operatif olan bu DEĞİL.
- Yan etki (Modem/WAN sayfası Save'inde yazılan diğer alanlar, APN değil):
  `m1_wan_netmask`, `m1s1simpin`, `m1s1simpinpro`, `m1s2simpin`,
  `w1_recon_h/m`, `w2_recon_h/m`, `w1_lnkpip`, `w2_lnkpip`,
  `browser_method=USE_LAN`.

**Faz 3 için:** APN hedefi → `nvram set m1s1wanapn=internet` (aktif hat
modül m1, SIM1). nvram'dan doğrudan set edince web formunun yan-alan
yazımları oluşmaz — daha temiz.

---

## ⏳ Haritalanacaklar (saha profili adımları)

| Ayar (UI) | Durum | Aday anahtar (Faz 1 nvram'dan, DOĞRULANMADI) |
|---|---|---|
| Device Name | ⏳ | `router_name` |
| DHCP havuzu | ⏳ | `dhcp_start` / `dhcp_num` / `dhcp_lease` |
| Ana SIM / Connection Type / SIM Backup / Backup Link | ⏳ | belirsiz |
| LAN IP (EN SON — bağlantı kopar) | ⏳ | `lan_ipaddr` (Faz 1'de canlı ile doğrulandı ama UI'ın yazdığı teyit edilecek) |

Her biri sırayla, tek tek diff'lenerek kesinleştirilecek. LAN IP en sonda:
değişince yönetim bağlantısı yeni adrese taşınır.
