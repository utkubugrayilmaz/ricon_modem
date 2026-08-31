// Terminal ilerleme gorunumu testleri — PURE, cihazsiz, saat sabitlenmis.
//
// Bu katman "operator ne goruyor" sorusunun cevabi. Iki iddiasi test edilir:
//   1) ADIM satirlari damgalanir ve sureleri dogru hesaplanir
//   2) TEKRARLAYAN olaylar akisa satir EKLEMEZ (terminal gurultuye bogulmaz)
//
// Saat disaridan veriliyor (`simdi`), yani sureler uydurma degil sabit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ilerlemeIzleyici, bicimliTelefon } from "../src/report/ilerleme.js";

// Kontrollu saat: her `ilerlet(ms)` cagrisi zamani ileri alir.
function sahteSaat(baslangic = 1_000_000) {
  let t = baslangic;
  return { simdi: () => t, ilerlet: (ms) => { t += ms; } };
}

// Akisa EKLENEN satirlar (duz string). Durum satirlari ({yenile}) haric.
const akisSatirlari = (satirlar) => satirlar.filter((s) => typeof s === "string");
// Ayni satirda GUNCELLENEN durum satirlari.
const durumSatirlari = (satirlar) => satirlar.filter((s) => s && s.yenile === true);

test("adim olaylari damgalanir, sira numarasi ve sure tasir", () => {
  const saat = sahteSaat();
  const iz = ilerlemeIzleyici({ simdi: saat.simdi });

  saat.ilerlet(400);
  const a = akisSatirlari(iz.olay({ tur: "algilandi", eylem: "provizyon_fabrika",
    konum: "192.168.1.1" }));
  assert.equal(a.length, 1);
  assert.match(a[0], /^\[1\/7\] modem algilandi/);
  assert.match(a[0], /192\.168\.1\.1/);
  assert.match(a[0], /0\.4 sn/);

  saat.ilerlet(1700);
  const p = akisSatirlari(iz.olay({ tur: "plan",
    plan: { degisecek_sayisi: 14, ayni_sayisi: 3 } }));
  assert.match(p[0], /^\[2\/7\]/);
  assert.match(p[0], /14 ayar degisecek, 3 ayar zaten dogru/);
  assert.match(p[0], /2\.1 sn/, "kumulatif an yazilir");
});

test("AYNI adim ikinci kez damgalanmaz — ikinci yazma grubu DURUM satiri olur", () => {
  // Provizyon ayarlari grup grup yaziyor (Modem/WAN, DHCP, LAN). Her grup icin
  // bir ADIM satiri basmak, 3 grupta "[3/7] yazma basladi"yi uc kez yazardi.
  const iz = ilerlemeIzleyici({ simdi: sahteSaat().simdi });
  const ilk = iz.olay({ tur: "yaziliyor", grup: "Modem/WAN", anahtarlar: ["a", "b"] });
  assert.equal(akisSatirlari(ilk).length, 1, "ilk grup adimi damgalar");

  const ikinci = iz.olay({ tur: "yaziliyor", grup: "LAN", anahtarlar: ["lan_ipaddr"] });
  assert.equal(akisSatirlari(ikinci).length, 0, "ikinci grup akisa satir EKLEMEZ");
  const d = durumSatirlari(ikinci);
  assert.equal(d.length, 1);
  assert.match(d[0].metin, /LAN \(1 ayar\)/);
});

test("TEKRARLAYAN olaylar akisa satir eklemez (dogrulama, internet beklemesi)", () => {
  // Gercek kurulumda dogrulama saniyede bir, internet beklemesi iki saniyede
  // bir olay uretiyor: ~60 olay. Hepsi akisa girse terminal okunmaz olurdu.
  const iz = ilerlemeIzleyici({ simdi: sahteSaat().simdi });
  let akisToplam = 0;
  let durumToplam = 0;
  for (let i = 0; i < 40; i += 1) {
    const s = iz.olay({ tur: "dogrulama", deneme: i, durum: "cihaz_bekleniyor" });
    akisToplam += akisSatirlari(s).length;
    durumToplam += durumSatirlari(s).length;
  }
  for (let i = 0; i < 30; i += 1) {
    const s = iz.olay({ tur: "internet_bekleniyor", gecen_sn: i * 2, max_sn: 150 });
    akisToplam += akisSatirlari(s).length;
    durumToplam += durumSatirlari(s).length;
  }
  assert.equal(akisToplam, 0, "70 tekrarlayan olay AKISA hic satir eklemedi");
  assert.equal(durumToplam, 70, "hepsi guncellenen durum satiri olarak geldi");
});

test("duz metin ilerleme de DURUM satiridir (akisa birikmez)", () => {
  const iz = ilerlemeIzleyici({ simdi: sahteSaat().simdi });
  const s = iz.ilerleme("nvram okunuyor");
  assert.equal(akisSatirlari(s).length, 0);
  assert.equal(durumSatirlari(s).length, 1);
  assert.match(durumSatirlari(s)[0].metin, /nvram okunuyor/);
});

test("telefon olayi numarayi OKUNABILIR bicimde ve KAYNAGIYLA basar", () => {
  const iz = ilerlemeIzleyici({ simdi: sahteSaat().simdi });
  const s = akisSatirlari(iz.olay({ tur: "telefon", numara: "5350634747",
    kaynak: "cihaz" }));
  assert.equal(s.length, 1);
  assert.match(s[0], /0535 063 47 47/, "haneler gruplanir: gozle dogrulanacak");
  assert.match(s[0], /SIM'den okundu/, "kaynak yazilir: SIM'den okunan daha guvenilir");
});

test("SIM kilidi ve internet YOK durumu AKISA yazilir (gozden kacmamali)", () => {
  const iz = ilerlemeIzleyici({ simdi: sahteSaat().simdi });
  const kilit = akisSatirlari(iz.olay({ tur: "sim_kilit", kilit: "pin",
    pin_kalan: 3, puk_kalan: 10 }));
  assert.match(kilit[0], /SIM PIN KILITLI/);
  assert.match(kilit[0], /PIN 3/);

  const net = akisSatirlari(iz.olay({ tur: "internet", var: false, sure_sn: 150,
    sim_durumu: "Invalid" }));
  assert.match(net[0], /internet GELMEDI/);
  assert.match(net[0], /Invalid/);
});

test("bilinmeyen olay TURU sessizce yok sayilir (patlamaz)", () => {
  const iz = ilerlemeIzleyici({ simdi: sahteSaat().simdi });
  assert.deepEqual(iz.olay({ tur: "bilmedigim_olay" }), []);
  assert.deepEqual(iz.olay({}), []);
  assert.deepEqual(iz.olay(null), []);
  assert.deepEqual(iz.ilerleme(""), []);
});

test("ozet: adim kirilimi + toplam + DARBOGAZ isareti", () => {
  const saat = sahteSaat();
  const iz = ilerlemeIzleyici({ simdi: saat.simdi });
  saat.ilerlet(500);
  iz.olay({ tur: "algilandi", eylem: "provizyon_fabrika", konum: "192.168.1.1" });
  saat.ilerlet(1600);
  iz.olay({ tur: "plan", plan: { degisecek_sayisi: 14, ayni_sayisi: 3 } });
  saat.ilerlet(30000);        // EN UZUN adim: internet dogrulamasi
  iz.olay({ tur: "internet", var: true, wan_ip: "10.1.2.3", sure_sn: 30 });

  const o = iz.ozet().join("\n");
  assert.match(o, /ADIM SURELERI/);
  assert.match(o, /modem algilandi\s+0\.5 sn/);
  assert.match(o, /ayarlar okundu.*\s+1\.6 sn/);
  assert.match(o, /TOPLAM\s+32\.1 sn/);
  // Darbogaz: en uzun adimin satirinda ▲ olmali, digerlerinde OLMAMALI.
  const internetSatiri = iz.ozet().find((x) => /internet dogrulandi/.test(x));
  assert.match(internetSatiri, /▲/, "en uzun adim darbogaz isaretli");
  const algiSatiri = iz.ozet().find((x) => /modem algilandi/.test(x));
  assert.ok(!algiSatiri.includes("▲"), "kisa adim isaretsiz");
});

test("ozet: bulunan numara ve uyarilar sonda TEKRAR gorunur", () => {
  // Operator 90 saniyelik akisin basini kaydirmis olabilir; kritik iki bilgi
  // (hangi hat kaydedildi, ne uyari vardi) ozetle birlikte tekrar yazilir.
  const iz = ilerlemeIzleyici({ simdi: sahteSaat().simdi });
  iz.olay({ tur: "algilandi", eylem: "provizyon_saha", konum: "5.5.5.1" });
  iz.olay({ tur: "telefon", numara: "5350634747", kaynak: "cihaz" });
  iz.olay({ tur: "sim_kilit", kilit: "pin", pin_kalan: 2, puk_kalan: 10 });
  const o = iz.ozet().join("\n");
  assert.match(o, /kaydedilen hat\s+0535 063 47 47/);
  assert.match(o, /! SIM PIN kilitli/);
});

test("ozet: hic adim damgalanmadiysa yalniz sure yazar (patlamaz)", () => {
  const saat = sahteSaat();
  const iz = ilerlemeIzleyici({ simdi: saat.simdi });
  saat.ilerlet(2500);
  const o = iz.ozet();
  assert.equal(o.length, 1);
  assert.match(o[0], /2\.5 sn/);
  assert.match(o[0], /adim damgalanmadi/);
});

// --- Telefon bicimi ---

test("bicimliTelefon: 10 ve 11 haneli girdi ayni gorunume duser", () => {
  assert.equal(bicimliTelefon("5350634747"), "0535 063 47 47");
  assert.equal(bicimliTelefon("05350634747"), "0535 063 47 47");
});

test("bicimliTelefon: beklenmeyen girdi BOZULMADAN gecer (uydurma yapmaz)", () => {
  assert.equal(bicimliTelefon("123"), "123");
  assert.equal(bicimliTelefon(null), "—");
  assert.equal(bicimliTelefon(undefined), "—");
});
