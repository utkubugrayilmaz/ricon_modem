// Genel cagirici testleri — `ricon.js calistir <fn>`in karar veren kismi.
// Cihaz GEREKTIRMEZ: cagirici saf, cekirdek modulu parametre olarak aliyor.
//
// Neden bu test onemli: cagirici, index.js'ten export edilen HER SEYI
// cagrilabilir yapiyor. Yanlis siniflandirdigi bir fonksiyona yanlis ilk
// arguman gecer — or. saf bir ayristiriciya opts nesnesi. Asagidaki
// "58 export'un tamami" testi o hatayi sessiz kalmaktan cikariyor.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/index.js";
import {
  firstParameter, takesOptions, parseArgv, listSurface, surfaceText, callByName,
} from "../src/report.js";

// --- imza cikarma ---

test("ilkParametre: yalin, varsayilanli, yikilmis ve parametresiz bicimler", () => {
  assert.equal(firstParameter((opts) => opts), "opts");
  assert.equal(firstParameter((opts = {}) => opts), "opts = {}");
  assert.equal(firstParameter(({ host, sourceIp }) => host + sourceIp), "{ host, sourceIp }");
  assert.equal(firstParameter(() => 1), "");
  assert.equal(firstParameter((raw, ikinci) => raw + ikinci), "raw");
});

test("ilkParametre: yikma icindeki virgul parametre siniri SAYILMAZ", () => {
  // `{ a = 1, b }` TEK parametredir; naif split(\",\") burayi bolerdi.
  assert.equal(firstParameter(({ a = 1, b } = {}) => a + b), "{ a = 1, b } = {}");
});

test("optsAlirMi: opts adi ve opts'a ozgu anahtarlar", () => {
  assert.equal(takesOptions((opts) => opts), true);
  assert.equal(takesOptions((opts = {}) => opts), true);
  assert.equal(takesOptions(({ host, credentials }) => host + credentials), true);
  assert.equal(takesOptions((raw) => raw), false);
  // Yikma TEK BASINA yetmez: opts'a ozgu anahtar yoksa saf sayilir.
  assert.equal(takesOptions(({ modemUp, simPresent }) => modemUp + simPresent), false);
  // `identity` `kimlik` DEGILDIR (kelime siniri).
  assert.equal(takesOptions(({ result, identity }) => result + identity), false);
});

// BEKCI: cekirdekteki her fonksiyonun siniflandirmasi elle dogrulandi
// (2026-08-31). Sayilar degisirse yeni bir export gelmis demektir — o zaman
// siniflandirmasinin dogru oldugu GOZLE kontrol edilmeli, sayi guncellenmeli.
test("cekirdegin tamami siniflandirilabiliyor ve dagilim beklendigi gibi", () => {
  const list = listSurface(core);
  const functions = list.filter((x) => x.kind === "function");
  assert.ok(functions.length > 50, `beklenenden az export: ${functions.length}`);
  const opts = functions.filter((x) => x.takesOpts).map((x) => x.name);
  const pure = functions.filter((x) => !x.takesOpts).map((x) => x.name);

  // Cihaza giden birkac ornek OPTS tarafinda olmali.
  for (const name of ["checkDevice", "readDevice", "provisionModem", "readIdentity",
    "waitForInternet", "disableSimPin", "runConsole"]) {
    assert.ok(opts.includes(name), `${name} opts tarafinda olmaliydi`);
  }
  // Saf ayristirici/karar fonksiyonlari SAF tarafta olmali.
  for (const name of ["normalizePhone", "parseCnum", "settingLabel", "parseSimStatus",
    "canSpendPinAttempt", "summarizeMetrics", "provisioningGaps", "nextAction"]) {
    assert.ok(pure.includes(name), `${name} saf tarafinda olmaliydi`);
  }
});

test("liste sabitleri fonksiyonlardan ayirir", () => {
  const list = listSurface(core);
  const sabit = list.find((x) => x.name === "SIM_PIN_KEY");
  assert.equal(sabit.kind, "constant");
  assert.equal(list.find((x) => x.name === "checkDevice").kind, "function");
  const text = surfaceText(list);
  assert.match(text, /CIHAZA GIDEN/);
  assert.match(text, /SABITLER/);
});

// --- argv ayristirma ---

test("argvAyikla: `--` ayraci bayrakla konumsali ayirir", () => {
  const r = parseArgv(["--host", "5.5.5.1", "--", "AT+CNUM"]);
  assert.deepEqual(r.flags, { host: "5.5.5.1" });
  assert.deepEqual(r.positionals, ["AT+CNUM"]);
});

test("argvAyikla: tireli bayrak adi camelCase olur", () => {
  assert.deepEqual(parseArgv(["--kaynak-ip", "5.5.5.100"]).flags,
    { sourceIp: "5.5.5.100" });
});

test("argvAyikla: degersiz bayrak true, ayrac yoksa konumsal yok", () => {
  const r = parseArgv(["--zorla", "--pin", "1234"]);
  assert.deepEqual(r.flags, { manualConsent: true, pin: "1234" });
  assert.deepEqual(r.positionals, []);
});

test("argvAyikla: `--` sonrasi bayrak GIBI gorunen sey konumsaldir", () => {
  // AT komutlari ve nvram degerleri tire ile baslayabilir; ayrac sonrasi
  // hicbir sey bayrak olarak yorumlanmamali.
  const r = parseArgv(["--", "--tuhaf-deger"]);
  assert.deepEqual(r.flags, {});
  assert.deepEqual(r.positionals, ["--tuhaf-deger"]);
});

// --- cagirma ---

test("cagir: adsiz cagri tum yuzeyi listeler", async () => {
  const r = await callByName(core, null);
  assert.equal(r.ok, true);
  assert.ok(r.list.length > 50);
  assert.match(r.surfaceText, /CAGRILABILIR|CIHAZA GIDEN/);
});

test("cagir: saf fonksiyona konumsallar gecer, opts GECMEZ", async () => {
  const r = await callByName(core, "normalizePhone", {
    opts: { host: "5.5.5.1" }, positionals: ["05321234567"],
  });
  assert.equal(r.value, "5321234567");
  assert.equal(r.ok, true);
});

test("cagir: opts alan fonksiyona bayraklar opts'un UZERINE yazilir", async () => {
  // Cagriyi cihaza gondermeden gozlemek icin sahte bir modul.
  const sahte = { yakala: (opts) => ({ gorulen: opts, problems: [] }) };
  const r = await callByName(sahte, "yakala", {
    opts: { host: "192.168.1.1", credentials: null },
    flags: { host: "5.5.5.1" },
  });
  assert.equal(r.gorulen.host, "5.5.5.1", "bayrak ortami ezmeli");
  assert.equal(r.gorulen.credentials, null, "ortamin geri kalani korunmali");
});

test("cagir: --saf otomatik tespiti ezer (opts enjekte edilmez)", async () => {
  const sahte = { yakala: (opts) => ({ gorulen: opts ?? "yok", problems: [] }) };
  const r = await callByName(sahte, "yakala", { opts: { host: "5.5.5.1" }, pure: true });
  assert.equal(r.gorulen, "yok");
});

test("cagir: bilinmeyen ad THROW ETMEZ, problems[] doner ve oneri verir", async () => {
  const r = await callByName(core, "normalizePhon");
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].code, "ARGS");
  assert.match(r.problems[0].check, /normalizePhone/);
});

test("cagir: fonksiyon PATLARSA stack degil sonuc nesnesi doner", async () => {
  const sahte = { patla: () => { throw new TypeError("bilerek"); } };
  const r = await callByName(sahte, "patla");
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].code, "CALL_FAILED");
  assert.match(r.problems[0].message, /TypeError: bilerek/);
});

test("cagir: sabit yazdirilir, cagrilmaz", async () => {
  const r = await callByName(core, "SIM_PIN_KEY");
  assert.equal(r.kind, "constant");
  assert.equal(r.value, "m1s1simpin");
  assert.equal(r.ok, true);
});

test("cagir: sonuc nesnesinin `ad` alani fonksiyon adiyla CAKISMAZ", async () => {
  // settingLabel kendi `ad` alanini dondurur; cagirici fonksiyon adini
  // `fonksiyon` altinda tutmali, yoksa cikti sessizce ezilir.
  const r = await callByName(core, "settingLabel", { positionals: ["w1_wan_proto", "m13g"] });
  assert.equal(r.fn, "settingLabel");
  assert.equal(r.name, "Connection Type");
});
