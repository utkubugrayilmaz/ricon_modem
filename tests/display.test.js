// Gosterim katmani testleri — ayar sozlugu + plan satirlari.
// Cihaz GEREKTIRMEZ, ag DINLENMEZ: hepsi saf fonksiyon.

import { test } from "node:test";
import assert from "node:assert/strict";
import { settingLabel, planRows } from "../src/report.js";
import { SETTING_LABELS } from "../src/settings.js";
import { FIELD_PROFILE, FACTORY_PROFILE } from "../src/settings.js";
import { planProvisioning } from "../src/provision.js";

test("settingLabel: ham deger okunabilir etikete cevrilir", () => {
  const r = settingLabel("w1_wan_proto", "m13g");
  assert.equal(r.name, "Connection Type");
  assert.equal(r.page, "Modem/WAN → Main Link");
  assert.equal(r.display, "M1-PPP");
  assert.equal(r.raw, "m13g", "ham deger korunur (gecirgenlik)");
});

test("settingLabel: birim eklenir, bos deger '(empty)' olur", () => {
  assert.equal(settingLabel("mullinkfail", "0").display, "0 min");
  assert.equal(settingLabel("m1s1pppuser", "").display, "(empty)");
});

test("settingLabel: parola alani MASKELENIR (ekrana sizmaz)", () => {
  assert.equal(settingLabel("m1s1ppppwd", "card").display, "••••");
  assert.equal(settingLabel("m1s1ppppwd", "").display, "(empty)");
});

test("settingLabel: sozlukte olmayan anahtar patlamaz, kendini gosterir", () => {
  const r = settingLabel("bilinmeyen_anahtar", "42");
  assert.equal(r.name, "bilinmeyen_anahtar");
  assert.equal(r.page, null);
  assert.equal(r.display, "42");
});

test("settingLabel: deger yoksa '—' (0 ile karistirilmaz)", () => {
  assert.equal(settingLabel("lan_ipaddr", null).display, "—");
  assert.equal(settingLabel("w1_connfailsw", "0").display, "0");
});

// BEKCI: profile yeni ayar eklenip sozluge eklenmezse UI'da ham nvram
// anahtari gorunur. Bu test o unutmayi yakalar.
test("sozluk: her profil anahtarinin insan-okunur karsiligi VAR", () => {
  for (const profile of [FIELD_PROFILE, FACTORY_PROFILE]) {
    for (const k of Object.keys(profile.nvram)) {
      assert.ok(SETTING_LABELS[k], `${profile.name} profilindeki ${k} sozlukte yok`);
      assert.ok(SETTING_LABELS[k].name, `${k} icin 'ad' bos`);
    }
  }
});

test("planProvisioning: onceki/hedef DEGISMEYENLERI de tasir (sol panel tam liste)", () => {
  const profile = { name: "t", nvram: { a: "1", b: "2", yok: "3" } };
  const planObj = planProvisioning({ a: "1", b: "9" }, profile);
  assert.deepEqual(planObj.before, { a: "1", b: "9", yok: null });
  assert.deepEqual(planObj.target, { a: "1", b: "2", yok: "3" });
  assert.deepEqual(planObj.unchanged, ["a"], "degismeyen yine ayni listesinde");
  assert.deepEqual(Object.keys(planObj.changing), ["b", "yok"]);
});

test("planRows: satirlar ARAYUZ sirasinda gelir (profil sirasi degil)", () => {
  // Profil sirasi WLAN'i basa koyar; ekran arayuz sirasini ister.
  const planObj = planProvisioning({}, FIELD_PROFILE);
  const lines = planRows(planObj);
  const sayfalar = [...new Set(lines.map((s) => s.page))];
  // Teknisyenin arayuzde izledigi sira: Modem/WAN -> DHCP -> LAN.
  assert.deepEqual(sayfalar, [
    "Modem/WAN → Main Link", "Modem/WAN → Others",
    "Modem/WAN → Backup Link", "Wireless", "DHCP Server", "LAN",
  ]);
});

test("planRows: her satir ekrana hazir (ad + once + sonra + degisecek)", () => {
  const profile = { name: "t", nvram: { w1_kponm: "1" } };
  const [line] = planRows(planProvisioning({ w1_kponm: "7" }, profile));
  assert.deepEqual(line, {
    key: "w1_kponm",
    name: "Keep Alive",
    page: "Modem/WAN → Others",
    before: "ICMP+",
    after: "None",
    changing: true,
  });
});
