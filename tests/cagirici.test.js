// Genel cagirici testleri — `ricon.js calistir <fn>`in karar veren kismi.
// Cihaz GEREKTIRMEZ: cagirici saf, cekirdek modulu parametre olarak aliyor.
//
// Neden bu test onemli: cagirici, index.js'ten export edilen HER SEYI
// cagrilabilir yapiyor. Yanlis siniflandirdigi bir fonksiyona yanlis ilk
// arguman gecer — or. saf bir ayristiriciya opts nesnesi. Asagidaki
// "58 export'un tamami" testi o hatayi sessiz kalmaktan cikariyor.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as cekirdek from "../src/index.js";
import {
  ilkParametre, optsAlirMi, argvAyikla, fonksiyonlariListele, listeMetni, cagir,
} from "../src/cli/cagirici.js";

// --- imza cikarma ---

test("ilkParametre: yalin, varsayilanli, yikilmis ve parametresiz bicimler", () => {
  assert.equal(ilkParametre((opts) => opts), "opts");
  assert.equal(ilkParametre((opts = {}) => opts), "opts = {}");
  assert.equal(ilkParametre(({ host, kaynakIp }) => host + kaynakIp), "{ host, kaynakIp }");
  assert.equal(ilkParametre(() => 1), "");
  assert.equal(ilkParametre((ham, ikinci) => ham + ikinci), "ham");
});

test("ilkParametre: yikma icindeki virgul parametre siniri SAYILMAZ", () => {
  // `{ a = 1, b }` TEK parametredir; naif split(\",\") burayi bolerdi.
  assert.equal(ilkParametre(({ a = 1, b } = {}) => a + b), "{ a = 1, b } = {}");
});

test("optsAlirMi: opts adi ve opts'a ozgu anahtarlar", () => {
  assert.equal(optsAlirMi((opts) => opts), true);
  assert.equal(optsAlirMi((opts = {}) => opts), true);
  assert.equal(optsAlirMi(({ host, kimlik }) => host + kimlik), true);
  assert.equal(optsAlirMi((ham) => ham), false);
  // Yikma TEK BASINA yetmez: opts'a ozgu anahtar yoksa saf sayilir.
  assert.equal(optsAlirMi(({ modemVar, simTakili }) => modemVar + simTakili), false);
  // `kimlikBilgi` `kimlik` DEGILDIR (kelime siniri).
  assert.equal(optsAlirMi(({ sonuc, kimlikBilgi }) => sonuc + kimlikBilgi), false);
});

// BEKCI: cekirdekteki her fonksiyonun siniflandirmasi elle dogrulandi
// (2026-08-31). Sayilar degisirse yeni bir export gelmis demektir — o zaman
// siniflandirmasinin dogru oldugu GOZLE kontrol edilmeli, sayi guncellenmeli.
test("cekirdegin tamami siniflandirilabiliyor ve dagilim beklendigi gibi", () => {
  const liste = fonksiyonlariListele(cekirdek);
  const fonksiyonlar = liste.filter((x) => x.tur === "fonksiyon");
  assert.ok(fonksiyonlar.length > 50, `beklenenden az export: ${fonksiyonlar.length}`);
  const opts = fonksiyonlar.filter((x) => x.optsAlir).map((x) => x.ad);
  const saf = fonksiyonlar.filter((x) => !x.optsAlir).map((x) => x.ad);

  // Cihaza giden birkac ornek OPTS tarafinda olmali.
  for (const ad of ["checkDevice", "readDevice", "provisionModem", "readIdentity",
    "waitForInternet", "simPinKaldir", "runConsole"]) {
    assert.ok(opts.includes(ad), `${ad} opts tarafinda olmaliydi`);
  }
  // Saf ayristirici/karar fonksiyonlari SAF tarafta olmali.
  for (const ad of ["normalizePhone", "parseCnum", "settingLabel", "parseSimStatus",
    "pinDenemesiUygunMu", "summarizeMetrics", "provisionEksikleri", "nextAction"]) {
    assert.ok(saf.includes(ad), `${ad} saf tarafinda olmaliydi`);
  }
});

test("liste sabitleri fonksiyonlardan ayirir", () => {
  const liste = fonksiyonlariListele(cekirdek);
  const sabit = liste.find((x) => x.ad === "SIM_PIN_KEY");
  assert.equal(sabit.tur, "sabit");
  assert.equal(liste.find((x) => x.ad === "checkDevice").tur, "fonksiyon");
  const metin = listeMetni(liste);
  assert.match(metin, /CIHAZA GIDEN/);
  assert.match(metin, /SABITLER/);
});

// --- argv ayristirma ---

test("argvAyikla: `--` ayraci bayrakla konumsali ayirir", () => {
  const r = argvAyikla(["--host", "5.5.5.1", "--", "AT+CNUM"]);
  assert.deepEqual(r.bayraklar, { host: "5.5.5.1" });
  assert.deepEqual(r.konumsallar, ["AT+CNUM"]);
});

test("argvAyikla: tireli bayrak adi camelCase olur", () => {
  assert.deepEqual(argvAyikla(["--kaynak-ip", "5.5.5.100"]).bayraklar,
    { kaynakIp: "5.5.5.100" });
});

test("argvAyikla: degersiz bayrak true, ayrac yoksa konumsal yok", () => {
  const r = argvAyikla(["--zorla", "--pin", "1234"]);
  assert.deepEqual(r.bayraklar, { zorla: true, pin: "1234" });
  assert.deepEqual(r.konumsallar, []);
});

test("argvAyikla: `--` sonrasi bayrak GIBI gorunen sey konumsaldir", () => {
  // AT komutlari ve nvram degerleri tire ile baslayabilir; ayrac sonrasi
  // hicbir sey bayrak olarak yorumlanmamali.
  const r = argvAyikla(["--", "--tuhaf-deger"]);
  assert.deepEqual(r.bayraklar, {});
  assert.deepEqual(r.konumsallar, ["--tuhaf-deger"]);
});

// --- cagirma ---

test("cagir: adsiz cagri tum yuzeyi listeler", async () => {
  const r = await cagir(cekirdek, null);
  assert.equal(r.ok, true);
  assert.ok(r.liste.length > 50);
  assert.match(r.listeMetni, /CAGRILABILIR|CIHAZA GIDEN/);
});

test("cagir: saf fonksiyona konumsallar gecer, opts GECMEZ", async () => {
  const r = await cagir(cekirdek, "normalizePhone", {
    opts: { host: "5.5.5.1" }, konumsallar: ["05321234567"],
  });
  assert.equal(r.deger, "5321234567");
  assert.equal(r.ok, true);
});

test("cagir: opts alan fonksiyona bayraklar opts'un UZERINE yazilir", async () => {
  // Cagriyi cihaza gondermeden gozlemek icin sahte bir modul.
  const sahte = { yakala: (opts) => ({ gorulen: opts, problems: [] }) };
  const r = await cagir(sahte, "yakala", {
    opts: { host: "192.168.1.1", kimlik: null },
    bayraklar: { host: "5.5.5.1" },
  });
  assert.equal(r.gorulen.host, "5.5.5.1", "bayrak ortami ezmeli");
  assert.equal(r.gorulen.kimlik, null, "ortamin geri kalani korunmali");
});

test("cagir: --saf otomatik tespiti ezer (opts enjekte edilmez)", async () => {
  const sahte = { yakala: (opts) => ({ gorulen: opts ?? "yok", problems: [] }) };
  const r = await cagir(sahte, "yakala", { opts: { host: "5.5.5.1" }, saf: true });
  assert.equal(r.gorulen, "yok");
});

test("cagir: bilinmeyen ad THROW ETMEZ, problems[] doner ve oneri verir", async () => {
  const r = await cagir(cekirdek, "normalizePhon");
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].kod, "ARGS");
  assert.match(r.problems[0].check, /normalizePhone/);
});

test("cagir: fonksiyon PATLARSA stack degil sonuc nesnesi doner", async () => {
  const sahte = { patla: () => { throw new TypeError("bilerek"); } };
  const r = await cagir(sahte, "patla");
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].kod, "CALISTIR_HATASI");
  assert.match(r.problems[0].message, /TypeError: bilerek/);
});

test("cagir: sabit yazdirilir, cagrilmaz", async () => {
  const r = await cagir(cekirdek, "SIM_PIN_KEY");
  assert.equal(r.tur, "sabit");
  assert.equal(r.deger, "m1s1simpin");
  assert.equal(r.ok, true);
});

test("cagir: sonuc nesnesinin `ad` alani fonksiyon adiyla CAKISMAZ", async () => {
  // settingLabel kendi `ad` alanini dondurur; cagirici fonksiyon adini
  // `fonksiyon` altinda tutmali, yoksa cikti sessizce ezilir.
  const r = await cagir(cekirdek, "settingLabel", { konumsallar: ["w1_wan_proto", "m13g"] });
  assert.equal(r.fonksiyon, "settingLabel");
  assert.equal(r.ad, "Connection Type");
});
