// Gosterim katmani testleri — ayar sozlugu + UI satirlari.
// Cihaz GEREKTIRMEZ, sunucu DINLEMEZ (createServer cagrilmiyor).

import { test } from "node:test";
import assert from "node:assert/strict";
import { settingLabel } from "../src/report.js";
import { SETTING_LABELS } from "../src/constants.js";
import { FIELD_PROFILE, FACTORY_PROFILE } from "../src/profile.js";
import { planProvisioning } from "../src/provisioning.js";
import { planRows } from "../src/server.js";

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

test("planRows: satirlar ARAYUZ sirasinda gelir (profil sirasi degil)", () => {
  // Profil sirasi WLAN'i basa koyar; ekran arayuz sirasini ister.
  const plan = planProvisioning({}, FIELD_PROFILE);
  const satirlar = planRows(plan);
  const sayfalar = [...new Set(satirlar.map((s) => s.sayfa))];
  assert.deepEqual(sayfalar, [
    "Modem/WAN → Main Link", "Modem/WAN → Others",
    "Modem/WAN → Backup Link", "Wireless", "LAN",
  ]);
});

test("planRows: her satir ekrana hazir (ad + once + sonra + degisecek)", () => {
  const profil = { ad: "t", nvram: { w1_kponm: "1" } };
  const [satir] = planRows(planProvisioning({ w1_kponm: "7" }, profil));
  assert.deepEqual(satir, {
    anahtar: "w1_kponm",
    ad: "Keep Alive",
    sayfa: "Modem/WAN → Others",
    once: "ICMP+",
    sonra: "None",
    degisecek: true,
  });
});
