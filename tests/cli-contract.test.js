// CLI SOZLESMESI BEKCISI — CLI'in gordugu ADLAR.
//
// NEDEN VAR — ayni kusur UC KEZ isirdi, ucu de ayni sekilde:
//   2026-08-28 (af9ccf8): `--profil` varsayilani "saha" iken profil adlari
//     "field"e cevrildi. PROFILES["saha"] undefined dondu, sunucu HIC
//     acilmadi ve surec hicbir sey yazmadan 0 ile cikti. Yeniden adlandirma
//     bu yuzden geri alindi (18bbd63).
//   2026-08-31 (once): ayni kusur tekrarlandi. `npm start` "Bilinmeyen
//     profil: saha" deyip durdu. 216 testin hicbiri yakalamadi — hepsi
//     cekirdegi dogrudan cagiriyordu, CLI'in gordugu ADLARA bakan yoktu.
//   2026-08-31 (v0.2.0): yuzeyin TAMAMI Ingilizceye cevrildi. Bu dosya artik
//     "adlar degismesin" demiyor; "CLI'in soyledigi ad ile cekirdegin
//     bekledigi alan AYNI SEYE gitsin" diyor. Asil kural buydu.
//
// Test kaynagi METIN olarak okur. Sebebi: bin/ricon.js'i import etmek komutu
// calistirir. Metin okumak kaba ama tam bu kusur sinifini yakaliyor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROFILES } from "../src/settings.js";
import { FLAG_TO_OPTION, parseArgv } from "../src/report.js";

const CLI = readFileSync(new URL("../bin/ricon.js", import.meta.url), "utf8");
const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("profil adlari: field / factory", () => {
  assert.deepEqual(Object.keys(PROFILES).sort(), ["factory", "field"]);
  assert.ok(PROFILES.field?.nvram, "field profili nvram tasimali");
  assert.ok(PROFILES.factory?.nvram, "factory profili nvram tasimali");
  assert.equal(PROFILES.field.name, "field");
  assert.equal(PROFILES.factory.name, "factory");
});

test("CLI'in varsayilan profili PROFILES'ta GERCEKTEN var", () => {
  // Kusur tam buradaydi: varsayilan bir ad, PROFILES anahtari baska bir ad.
  const defaults = [...CLI.matchAll(/flags\.profile\s*\|\|\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(defaults.length > 0, "CLI'da --profile varsayilani bulunamadi");
  for (const name of defaults) {
    assert.ok(PROFILES[name], `CLI varsayilani "${name}" PROFILES'ta yok`);
  }
});

// Teknisyenin ezberi. Biri sessizce degisirse sahadaki betikler kirilir.
const COMMANDS = [
  "verify", "read", "console", "sim", "assess", "msisdn", "sim-lock-status",
  "sim-pin-disable", "sim-pin-enable", "diff", "apply", "provision",
  "call", "metrics", "metrics-manual", "sim-puk",
];

test("komut adlari tam liste", () => {
  const m = CLI.match(/const COMMANDS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(m, "COMMANDS listesi bulunamadi");
  const found = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(found.sort(), [...COMMANDS].sort());
});

test("her komut yardim metninde geciyor", () => {
  const help = CLI.slice(CLI.indexOf("const HELP ="), CLI.indexOf("async function main"));
  for (const c of COMMANDS) {
    assert.ok(help.includes(`  ${c} `) || help.includes(`  ${c} [`)
      || help.includes(`  ${c} <`) || help.includes(`  ${c} --`),
    `${c} yardim metninde yok`);
  }
});

test("dispatch ile COMMANDS ayni kumede (biri otekini gecmesin)", () => {
  // Dispatch'e case eklenip COMMANDS'a eklenmezse komut "unknown" olur;
  // tersi olursa komut kabul edilir ama null doner. Ikisi de sessiz.
  const body = CLI.slice(CLI.indexOf("async function runCommand"), CLI.indexOf("const COMMANDS"));
  const cases = [...body.matchAll(/case "([a-z-]+)":/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(cases)].sort(), [...COMMANDS].sort());
});

test("eski TURKCE adlar takma ad DEGIL: oneri verip 1 ile cikilir", () => {
  const m = CLI.match(/const RENAMED_IN_0_2_0 = Object\.freeze\(\{([\s\S]*?)\}\)/);
  assert.ok(m, "yeniden adlandirma tablosu bulunamadi");
  const table = [...m[1].matchAll(/"?([a-z-]+)"?\s*:\s*"([a-z-]+)"/g)];
  assert.ok(table.length >= 14, `beklenenden az esleme: ${table.length}`);
  // Tablonun HEDEFLERI gercek komut olmali; yoksa oneri yanlis yere gonderir.
  for (const [, , to] of table) {
    assert.ok(COMMANDS.includes(to), `oneri "${to}" gercek bir komut degil`);
  }
  // Ve eski adlar KABUL EDILMEMELI (takma ad degil, oneri).
  const cmdSet = CLI.match(/const COMMANDS = new Set\(\[([\s\S]*?)\]\)/)[1];
  for (const [, from] of table) {
    assert.ok(!cmdSet.includes(`"${from}"`), `eski ad "${from}" hala kabul ediliyor`);
  }
});

test("bayrak koprusu: CLI bayragi -> cekirdek alani", () => {
  assert.equal(FLAG_TO_OPTION["source-ip"], "sourceIp");
  assert.equal(FLAG_TO_OPTION["field-host"], "fieldHost");
  assert.equal(FLAG_TO_OPTION["internet-wait"], "internetWaitSec");
  assert.equal(FLAG_TO_OPTION.force, "manualConsent");
  assert.equal(FLAG_TO_OPTION.rounds, "maxRounds");
  // Kopru gercekten kuruluyor mu?
  assert.deepEqual(parseArgv(["--source-ip", "5.5.5.100"]).flags, { sourceIp: "5.5.5.100" });
  // Tabloda OLMAYAN bayrak camelCase'e duser (kural, istisna degil).
  assert.deepEqual(parseArgv(["--new-host", "5.5.5.1"]).flags, { newHost: "5.5.5.1" });
});

test("TEK AYRISTIRICI: CLI argv'ye dogrudan bakmiyor", () => {
  // Eskiden 14 komut kendi flag("--xxx") sabitleriyle calisiyordu ve
  // FLAG_TO_OPTION "kopru" adini tasiyip yuzeyin ondorttebirini kapsiyordu.
  // Bir bayrak adi degistiginde geri kalanda hicbir sey kirmizi yanmiyordu.
  const body = CLI.slice(CLI.indexOf("async function runCommand"));
  assert.ok(!/argv\.includes\(/.test(body), "argv.includes( kalmis: ikinci ayristirici");
  assert.ok(!/\bflag\("--/.test(body), 'flag("--...") kalmis: ikinci ayristirici');
});

test(".env adlari: YALNIZCA Ingilizce okunur, eski Turkce adlar kodda YOK", () => {
  for (const v of ["MODEM_HOST", "MODEM_USER", "MODEM_PASSWORD", "MODEM_SOURCE_IP"]) {
    assert.ok(CLI.includes(v), `${v} CLI'da gecmiyor`);
  }
  // Eskiden ENV_FALLBACK ile Turkce adlar yedek olarak okunuyordu; sahibin
  // karariyla kaldirildi (2026-09-02): kod .env adi CEVIRMEZ, .env dosyasini
  // Ingilizce adlarla duzeltmek kullanicinin isi. Geri eklenirse bu test
  // kirmizi yansin — ayni ozellik bir kez sessizce geri gelmisti.
  for (const old of ["MODEM_KULLANICI", "MODEM_SIFRE", "MODEM_KAYNAK_IP", "ENV_FALLBACK"]) {
    assert.ok(!CLI.includes(old), `${old} hala CLI'da: .env adi cevirisi kaldirildi`);
  }
});

test("defter dosya yollari + eski adlarin yedegi", () => {
  assert.ok(CLI.includes("data/provisioned.jsonl"));
  assert.ok(CLI.includes("data/metrics.jsonl"));
  assert.ok(CLI.includes("data/hazirlanan.jsonl"), "eski defter adi yedekte olmali");
  assert.ok(CLI.includes("data/olcumler.jsonl"), "eski olcum adi yedekte olmali");
});

// `start`/`prepare-network` artik bin/ricon.js'i DOGRUDAN degil,
// scripts/network-setup.js uzerinden DOLAYLI cagiriyor (once ag ayarini
// hazirlayip modemin gercek IP'sini bulan bir sarmalayici — bkz.
// scripts/network-setup.js basindaki yorum). Guvenceyi bir katman derinde
// dogruluyoruz: sarmalayicinin GERCEKTEN bin/ricon.js'e "provision" diye
// dispatch ettigini kontrol ediyoruz, aksi halde ayni "isim gercek komuttan
// sessizce ayrisir" kusuru bu sefer bir dolayli katmanda tekrarlanabilirdi.
const NETWORK_SETUP = readFileSync(new URL("../scripts/network-setup.js", import.meta.url), "utf8");

test("npm script'leri GERCEK komutlari cagiriyor", () => {
  for (const [name, line] of Object.entries(PKG.scripts)) {
    if (name === "test") continue;
    if (/scripts\/network-setup\.js/.test(line)) {
      assert.ok(/["'`]provision["'`]/.test(NETWORK_SETUP),
        `${name}: network-setup.js bin/ricon.js'e "provision" diye dispatch etmiyor`);
      continue;
    }
    const m = line.match(/bin\/ricon\.js\s+([a-z-]+)/);
    assert.ok(m, `${name}: script bir komut cagirmiyor`);
    assert.ok(COMMANDS.includes(m[1]), `npm run ${name} -> "${m[1]}" diye bir komut yok`);
  }
  assert.match(PKG.scripts.start, /--loop/);
});

// AD CAKISMASI — bu testin var olma sebebi olculmus bir kusur.
//
// `npm run sim-lock` = `sim-pin-enable --apply` (SIM'e kilit koyar, PIN
// hakki harcar) iken CLI'daki `sim-lock` komutu SALT OKUNURDU ("hicbir sey
// harcamaz"). Ayni ad iki yerde tam TERS anlam tasiyordu: tezgahtaki
// teknisyen bildigi adi yaziyor ve okuma sanip YAZMA aliyordu.
//
// Ustteki test bunu goremiyordu — o yalnizca "script gercek BIR komut
// cagiriyor mu" diye bakiyor, adlarin uyusup uyusmadigina bakmiyor.
//
// Kural: bir script'in adi, CLI'da var olan BASKA bir komutun adiysa hata.
// Kendi adiyla ayni komutu cagiran script serbest (`npm run read` -> `read`).
test("npm script adi, BASKA bir CLI komutunun adini calmiyor", () => {
  // KARAR (2026-08-31): "sim-lock" adi KILITLEME'ye ayrildi ve yalnizca npm
  // script'i olarak yasiyor. CLI'a ayni adla salt-okunur bir komut geri
  // eklenirse cakisma aynen geri gelir — o yuzden burada acikca yasak.
  assert.ok(!COMMANDS.includes("sim-lock"),
    "CLI'a 'sim-lock' komutu eklenmis: `npm run sim-lock` KILITLIYOR, ayni ad "
    + "salt-okunur bir komuta verilemez. Okuma icin 'sim-lock-status' var.");

  for (const [name, line] of Object.entries(PKG.scripts)) {
    if (name === "test") continue;
    const m = line.match(/bin\/ricon\.js\s+([a-z-]+)/);
    if (!COMMANDS.includes(name)) continue;   // script adi bir komut degil: serbest
    assert.equal(m[1], name,
      `npm run ${name} -> "${m[1]}" cagiriyor, ama "${name}" ayni zamanda bir CLI `
      + "komutu. Ayni ad iki farkli sey demek olamaz: ya script'i ya komutu adlandir.");
  }
});
