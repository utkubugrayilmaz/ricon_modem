// Gosterim katmani testleri — ayar sozlugu + plan gorunumu.
// Cihaz GEREKTIRMEZ.
//
// Sozluk (settingLabel) neden hala urunun parcasi: terminal ozeti ham nvram
// anahtari basmaz, "Connection Type: M1-PPP" basar ve parola alanlarini
// maskeler. Eskiden tuketicisi tarayici arayuzuydu; arayuz kalkti, tuketici
// report.js'in kendi ozeti oldu.

import { test } from "node:test";
import assert from "node:assert/strict";
import { settingLabel, summaryText, stripSecrets } from "../src/report/report.js";
import { SETTING_LABELS } from "../src/domain/constants.js";
import { FIELD_PROFILE, FACTORY_PROFILE } from "../src/domain/profile.js";
import { planProvisioning } from "../src/flow/provisioning.js";

test("settingLabel: ham deger okunabilir etikete cevrilir", () => {
  const r = settingLabel("w1_wan_proto", "m13g");
  assert.equal(r.ad, "Connection Type");
  assert.equal(r.sayfa, "Modem/WAN → Main Link");
  assert.equal(r.gosterim, "M1-PPP");
  assert.equal(r.ham, "m13g", "ham deger korunur (gecirgenlik)");
});

test("settingLabel: birim eklenir, bos deger '(bos)' olur", () => {
  assert.equal(settingLabel("mullinkfail", "0").gosterim, "0 dk");
  assert.equal(settingLabel("m1s1pppuser", "").gosterim, "(bos)");
});

test("settingLabel: parola alani MASKELENIR (ekrana sizmaz)", () => {
  assert.equal(settingLabel("m1s1ppppwd", "card").gosterim, "••••");
  assert.equal(settingLabel("m1s1ppppwd", "").gosterim, "(bos)");
});

test("settingLabel: sozlukte olmayan anahtar patlamaz, kendini gosterir", () => {
  const r = settingLabel("bilinmeyen_anahtar", "42");
  assert.equal(r.ad, "bilinmeyen_anahtar");
  assert.equal(r.sayfa, null);
  assert.equal(r.gosterim, "42");
});

test("settingLabel: deger yoksa '—' (0 ile karistirilmaz)", () => {
  assert.equal(settingLabel("lan_ipaddr", null).gosterim, "—");
  assert.equal(settingLabel("w1_connfailsw", "0").gosterim, "0");
});

// BEKCI: profile yeni ayar eklenip sozluge eklenmezse UI'da ham nvram
// anahtari gorunur. Bu test o unutmayi yakalar.
test("sozluk: her profil anahtarinin insan-okunur karsiligi VAR", () => {
  for (const profil of [FIELD_PROFILE, FACTORY_PROFILE]) {
    for (const k of Object.keys(profil.nvram)) {
      assert.ok(SETTING_LABELS[k], `${profil.ad} profilindeki ${k} sozlukte yok`);
      assert.ok(SETTING_LABELS[k].ad, `${k} icin 'ad' bos`);
    }
  }
});

test("planProvisioning: onceki/hedef DEGISMEYENLERI de tasir (sol panel tam liste)", () => {
  const profil = { ad: "t", nvram: { a: "1", b: "2", yok: "3" } };
  const plan = planProvisioning({ a: "1", b: "9" }, profil);
  assert.deepEqual(plan.onceki, { a: "1", b: "9", yok: null });
  assert.deepEqual(plan.hedef, { a: "1", b: "2", yok: "3" });
  assert.deepEqual(plan.ayni, ["a"], "degismeyen yine ayni listesinde");
  assert.deepEqual(Object.keys(plan.degisecek), ["b", "yok"]);
});

test("settingLabel: profildeki her anahtar cihazin ARAYUZ sayfasini soyler", () => {
  // Teknisyen ayari modemin web arayuzunde hangi sayfada gorurse, sozluk de
  // onu yazar. Bu bilgi terminal ozetinde "hangi ekrandaki ayar degisti"
  // sorusunu cevapliyor.
  const sayfalar = [...new Set(
    Object.keys(FIELD_PROFILE.nvram).map((k) => settingLabel(k, null).sayfa),
  )];
  for (const s of sayfalar) assert.ok(s, "profil anahtarinin sayfasi bos olamaz");
  assert.ok(sayfalar.includes("Modem/WAN → Main Link"));
  assert.ok(sayfalar.includes("LAN"));
});

// --- Terminal plan dokumu: sozlukten basar, parolayi maskeler ---

test("summaryText: plan HAM NVRAM ANAHTARI degil ARAYUZ ADI basar", () => {
  const r = {
    komut: "uygula", profil: "saha", uygula: false, modem_ip: "192.168.1.1",
    plan: { degisecek_sayisi: 2, ayni_sayisi: 0, degisecek: {
      w1_wan_proto: { mevcut: "dhcp", hedef: "m13g" },
      lan_ipaddr: { mevcut: "192.168.1.1", hedef: "5.5.5.1" },
    } },
    problems: [],
  };
  const metin = summaryText(r);
  assert.match(metin, /Connection Type/, "sozlukteki arayuz adi yazilir");
  assert.match(metin, /M1-PPP/, "ham 'm13g' degil okunabilir deger");
  assert.ok(!metin.includes("w1_wan_proto"), "ham nvram anahtari ekrana basilmaz");
  assert.match(metin, /5\.5\.5\.1/, "IP degeri oldugu gibi kalir");
});

test("summaryText: PPP PAROLASI plan dokumunde MASKELENIR", () => {
  // Sozlukte gizli:true idi ama terminal ozeti degeri duz metin basiyordu.
  const metin = summaryText({
    komut: "uygula", profil: "saha", uygula: true,
    plan: { degisecek_sayisi: 1, ayni_sayisi: 0, degisecek: {
      m1s1ppppwd: { mevcut: "eskiparola", hedef: "yeniparola" },
    } },
    problems: [],
  });
  assert.ok(!metin.includes("eskiparola"), "eski parola ekrana sizmaz");
  assert.ok(!metin.includes("yeniparola"), "yeni parola ekrana sizmaz");
  assert.match(metin, /••••/, "yerine maske yazilir");
});

test("stripSecrets: PPP parolalari JSON ciktisindan da silinir", () => {
  const temiz = stripSecrets({
    m1s1ppppwd: "card", m1s2ppppwd: "card",
    m1s1simpin: "1234", m1s1wanapn: "internet", telefon: "5350634747",
  });
  assert.equal(temiz.m1s1ppppwd, undefined);
  assert.equal(temiz.m1s2ppppwd, undefined);
  assert.equal(temiz.m1s1simpin, undefined);
  assert.equal(temiz.m1s1wanapn, "internet", "APN sir DEGIL, kalir");
  assert.equal(temiz.telefon, "5350634747");
});

test("summaryText: plan satirlari ARAYUZ sirasinda dizilir", () => {
  // Motorun yazma sirasi LAN'i en sona koyar; operator ekrani cihazin arayuz
  // sirasiyla okur. Girdi TERS verilip siranin duzeltildigi dogrulaniyor.
  const metin = summaryText({
    komut: "uygula", profil: "saha", uygula: false,
    plan: { degisecek_sayisi: 2, ayni_sayisi: 0, degisecek: {
      lan_ipaddr: { mevcut: "192.168.1.1", hedef: "5.5.5.1" },
      w1_wan_proto: { mevcut: "dhcp", hedef: "m13g" },
    } },
    problems: [],
  });
  assert.ok(metin.indexOf("Connection Type") < metin.indexOf("5.5.5.1"),
    "Main Link ayari LAN'dan ONCE gorunur");
});

test("summaryText: sozlukte OLMAYAN anahtar kaybolmaz, sona duser", () => {
  const metin = summaryText({
    komut: "uygula", profil: "saha", uygula: false,
    plan: { degisecek_sayisi: 2, ayni_sayisi: 0, degisecek: {
      bilinmeyen_anahtar: { mevcut: "1", hedef: "2" },
      w1_wan_proto: { mevcut: "dhcp", hedef: "m13g" },
    } },
    problems: [],
  });
  assert.match(metin, /bilinmeyen_anahtar/, "sozlukte yoksa adi kendisi olur");
  assert.ok(metin.indexOf("Connection Type") < metin.indexOf("bilinmeyen_anahtar"),
    "bilinen ayarlar once, bilinmeyen sonda");
});

test("summaryText: CAKISAN ayar adlari sayfayla ayirt edilir", () => {
  // Cihazin arayuzunde "Connection Type" iki yerde var (Main Link ve Backup
  // Link). Ham anahtar ekrandan kaldirildigi icin iki satir ayni gorunurdu.
  const metin = summaryText({
    komut: "uygula", profil: "saha", uygula: false,
    plan: { degisecek_sayisi: 2, ayni_sayisi: 0, degisecek: {
      w1_wan_proto: { mevcut: "dhcp", hedef: "m13g" },
      w2_wan_proto: { mevcut: null, hedef: "disable" },
    } },
    problems: [],
  });
  assert.match(metin, /Connection Type \(Main Link\)/);
  assert.match(metin, /Connection Type \(Backup Link\)/);
});

test("summaryText: CAKISMAYAN adlara sayfa EKLENMEZ (ekran sismesin)", () => {
  const metin = summaryText({
    komut: "uygula", profil: "saha", uygula: false,
    plan: { degisecek_sayisi: 1, ayni_sayisi: 0, degisecek: {
      lan_ipaddr: { mevcut: "192.168.1.1", hedef: "5.5.5.1" },
    } },
    problems: [],
  });
  assert.match(metin, /Local IP\s+192\.168\.1\.1/);
  assert.ok(!metin.includes("Local IP (LAN)"), "tek basina olan ada sayfa eklenmez");
});
