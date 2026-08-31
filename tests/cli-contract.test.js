// CLI SOZLESMESI BEKCISI — Turkce kalmasi gereken yuzey.
//
// NEDEN VAR — iki kez isirdi, ikisi de ayni sekilde:
//   2026-08-28 (af9ccf8): `--profil` varsayilani "saha" iken profil adlari
//     "field"e cevrildi. PROFILES["saha"] undefined dondu, sunucu HIC
//     acilmadi ve surec hicbir sey yazmadan 0 ile cikti. Yeniden adlandirma
//     bu yuzden geri alindi (18bbd63).
//   2026-08-31: ayni kusur tekrarlandi. `npm start` "Bilinmeyen profil: saha"
//     deyip durdu. 216 testin hicbiri yakalamadi — cunku hepsi cekirdegi
//     dogrudan cagiriyor, CLI'in gordugu ADLARA bakan yoktu.
//
// Bu test o adlari KODLA sabitliyor. Ingilizceye cevirme turlerinde once
// burasi kirmizi yanar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROFILES } from "../src/settings.js";
import { FLAG_TO_OPTION, parseArgv } from "../src/report.js";

const CLI = readFileSync(new URL("../bin/ricon.js", import.meta.url), "utf8");

test("profil adlari TURKCE: --profil saha / fabrika calisir", () => {
  // Defterdeki gecmis satirlarda da "saha" yaziyor; bu bir VERI sozlesmesi.
  assert.deepEqual(Object.keys(PROFILES).sort(), ["fabrika", "saha"]);
  assert.ok(PROFILES.saha?.nvram, "saha profili nvram tasimali");
  assert.ok(PROFILES.fabrika?.nvram, "fabrika profili nvram tasimali");
  assert.equal(PROFILES.saha.name, "saha");
  assert.equal(PROFILES.fabrika.name, "fabrika");
});

test("CLI'in varsayilan profili PROFILES'ta GERCEKTEN var", () => {
  // Kusur tam buradaydi: varsayilan "saha", anahtar "field".
  const defaults = [...CLI.matchAll(/flag\("--profil"\)\s*\|\|\s*"([^"]+)"/g)]
    .map((m) => m[1]);
  assert.ok(defaults.length > 0, "CLI'da --profil varsayilani bulunamadi");
  for (const name of defaults) {
    assert.ok(PROFILES[name], `CLI varsayilani "${name}" PROFILES'ta yok`);
  }
});

// Teknisyenin ezberi. Bir tanesi sessizce degisirse sahadaki betikler ve
// aliskanliklar kirilir.
const KOMUTLAR = [
  "dogrula", "oku", "konsol", "sim", "degerlendir", "numara", "sim-kilit",
  "sim-pin-kaldir", "sim-pin-kilitle", "fark", "uygula", "hazirla",
  "calistir", "olcum", "olcum-elle",
];

test("komut adlari TURKCE ve tam liste", () => {
  const m = CLI.match(/const COMMANDS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(m, "COMMANDS listesi bulunamadi");
  const found = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(found.sort(), [...KOMUTLAR].sort());
});

test("her komut yardim metninde geciyor", () => {
  for (const c of KOMUTLAR) {
    assert.ok(CLI.includes(`"  ${c}`) || CLI.includes(`  ${c} `),
      `${c} yardim metninde yok`);
  }
});

test("bayrak adlari TURKCE kalir; koprude Ingilizce alana cevrilir", () => {
  // Tablonun anahtarlari CLI yuzeyi (Turkce), degerleri cekirdek alani.
  assert.equal(FLAG_TO_OPTION["kaynak-ip"], "sourceIp");
  assert.equal(FLAG_TO_OPTION["saha-host"], "fieldHost");
  assert.equal(FLAG_TO_OPTION.profil, "profile");
  assert.equal(FLAG_TO_OPTION.telefon, "phone");
  assert.equal(FLAG_TO_OPTION.zorla, "manualConsent");
  assert.equal(FLAG_TO_OPTION.uygula, "apply");
  // Kopru gercekten kuruluyor mu?
  assert.deepEqual(parseArgv(["--kaynak-ip", "5.5.5.100"]).flags,
    { sourceIp: "5.5.5.100" });
});

test(".env degisken adlari degismez", () => {
  for (const v of ["MODEM_HOST", "MODEM_KULLANICI", "MODEM_SIFRE", "MODEM_KAYNAK_IP"]) {
    assert.ok(CLI.includes(`process.env.${v}`), `${v} CLI'da okunmuyor`);
  }
});

test("defter dosya yollari degismez (gecmis veri orada)", () => {
  assert.ok(CLI.includes("data/hazirlanan.jsonl"));
  assert.ok(CLI.includes("data/olcumler.jsonl"));
});
