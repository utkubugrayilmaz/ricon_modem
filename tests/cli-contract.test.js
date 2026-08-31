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
  "verify", "read", "console", "sim", "assess", "msisdn", "sim-lock",
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

test(".env adlari: yeni ad okunur, ESKISI yedek olarak okunur", () => {
  for (const v of ["MODEM_HOST", "MODEM_USER", "MODEM_PASSWORD", "MODEM_SOURCE_IP"]) {
    assert.ok(CLI.includes(v), `${v} CLI'da gecmiyor`);
  }
  // Yedek gerekli: .env gitignore'da, her makinede ayri durur ve repo
  // guncellemesiyle yeniden adlanmaz.
  const m = CLI.match(/const ENV_FALLBACK = Object\.freeze\(\{([\s\S]*?)\}\)/);
  assert.ok(m, "ENV_FALLBACK bulunamadi");
  for (const old of ["MODEM_KULLANICI", "MODEM_SIFRE", "MODEM_KAYNAK_IP"]) {
    assert.ok(m[1].includes(old), `${old} yedegi yok`);
  }
});

test("defter dosya yollari + eski adlarin yedegi", () => {
  assert.ok(CLI.includes("data/provisioned.jsonl"));
  assert.ok(CLI.includes("data/metrics.jsonl"));
  assert.ok(CLI.includes("data/hazirlanan.jsonl"), "eski defter adi yedekte olmali");
  assert.ok(CLI.includes("data/olcumler.jsonl"), "eski olcum adi yedekte olmali");
});

test("npm script'leri GERCEK komutlari cagiriyor", () => {
  for (const [name, line] of Object.entries(PKG.scripts)) {
    if (name === "test") continue;
    const m = line.match(/bin\/ricon\.js\s+([a-z-]+)/);
    assert.ok(m, `${name}: script bir komut cagirmiyor`);
    assert.ok(COMMANDS.includes(m[1]), `npm run ${name} -> "${m[1]}" diye bir komut yok`);
  }
  assert.match(PKG.scripts.start, /provision --loop/);
});
