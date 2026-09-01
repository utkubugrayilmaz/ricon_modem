// DIL BEKCISI — yorum satirlari DISINDA Turkce kalmasin.
//
// NEDEN VAR: bu kural bu repoda daha once IKI KEZ yazili bir vaat olarak
// duruldu ve iki kez sessizce cignendi (ac36919 -> geri alindi 18bbd63;
// 2026-08-31 sabahi ayni kusur tekrar). Yazili kurali test yakalayamaz;
// bu dosya kurali KIRMIZI YANAN bir seye ceviriyor.
//
// KAPSAM: src/ ve bin/ icindeki KOD ve METIN bolgeleri. Yorumlar atlanir —
// kararin NEDENI orada ve projenin en degerli kismi o.
//
// Tokenizer tests/undefined-names.test.js'ten geliyor (kod/yorum/metin/regex
// bolgelerini ayirir). Regex ayrimi sart: `/'/g` gibi tirnak iceren bir regex
// naif tokenizer'i metin moduna sokar ve dosyanin kalani sessizce islenmez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const BIN = new URL("../bin/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Kodu birakir, YORUMLARI siler. Metin sabitleri KORUNUR (onlar da denetlenir);
// yalnizca yorum bolgeleri bosluga cevrilir.
function stripComments(text) {
  let mode = "code";
  let quote = "";
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const d = text[i + 1];
    if (mode === "code") {
      if (c === "/" && d === "/") { mode = "line"; i += 1; continue; }
      if (c === "/" && d === "*") { mode = "block"; i += 1; continue; }
      if (c === "/") {
        // Bolme mi regex mi: `/`den onceki anlamli karaktere bak.
        let j = i - 1;
        while (j >= 0 && " \t\r\n".includes(text[j])) j -= 1;
        if (!/[A-Za-z0-9_$)\]]/.test(j >= 0 ? text[j] : "")) { mode = "regex"; continue; }
      }
      if (c === "'" || c === '"' || c === "`") { mode = "string"; quote = c; }
      out += c;
      continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += c; } continue; }
    if (mode === "block") { if (c === "*" && d === "/") { mode = "code"; i += 1; } continue; }
    if (mode === "regex") {
      if (c === "\\") { i += 1; continue; }
      if (c === "[") {
        i += 1;
        while (i < text.length && text[i] !== "]") { if (text[i] === "\\") i += 1; i += 1; }
        continue;
      }
      if (c === "/") { while (i + 1 < text.length && /[a-z]/.test(text[i + 1])) i += 1; mode = "code"; }
      else if (c === "\n") { mode = "code"; }
      continue;
    }
    // string
    out += c;
    if (c === "\\") { out += text[i + 1] ?? ""; i += 1; continue; }
    if (c === quote) mode = "code";
  }
  return out;
}

// Turkce'ye ozgu harfler. ASCII'ye katlanmis Turkce ("hazirla") bunlarla
// yakalanmaz; ikinci kontrol onun icin.
const TURKISH_LETTERS = /[çğıİöşüÇĞÖŞÜ]/;

// ASCII'ye katlanmis Turkce sozcukler. Liste, bu repoda GERCEKTEN gecmis
// olan adlardan turetildi — uydurma degil.
const TURKISH_WORDS = new RegExp("\\b(" + [
  "hazirla", "hazirlanan", "dogrula", "degerlendir", "calistir", "konsol",
  "uygula", "olcum", "olcumler", "kaynak", "telefon", "kilit", "kilidi",
  "deneme", "dongu", "saha", "fabrika", "numara", "zorla", "profil",
  "kayit", "beyan", "aralik", "adim", "adimlar", "zaman", "durum",
  // NOT: "sure" listede YOK — Ingilizce bir sozcuk ("be sure of the PIN").
  // Bekci ilk kosuda tam bunu yanlis isaretledi.
  "eksik", "tekrar", "gecersiz", "bekleniyor", "okunuyor", "yaziliyor",
  "yazildi", "bitti", "basladi", "gonderildi", "algilandi", "kurulum",
  "basarili", "basarisiz", "sorun", "sorunlar", "sistem", "cihaz", "ayar",
  "elle", "sifirlama", "sifre", "kullanici", "yapilacak", "gerekli",
  "bilinmeyen", "gecerli", "yazilamadi", "belirtilmedi", "sayfasiz",
  // 2026-08-31 denetiminde bekciden GECMIS uc gercek Turkce metin vardi;
  // uculu de operatore gidiyordu. Eksik olan sozcukler:
  //   bin/ricon.js  "PLAN — once -> sonra (* = degisecek)"
  //   settings.js   FACTORY_PROFILE.description (JSON ciktisina giden VERI)
  //   problems.js   "...start the server with a sifirlamaProfil..."
  "sonra", "degisecek", "degerleri", "anahtarlarinin", "sifirlamaprofil",
  // DIKKAT — "once" LISTEYE EKLENEMEZ: Ingilizce bir sozcuk ("read once").
  // Dosyanin yukarisindaki "sure" tuzaginin aynisi. Bu yuzden ASCII sozcuk
  // listesi tek basina yeterli bir bekci DEGIL; Turkce metni asil engelleyen
  // sey, operatore giden her dizenin katalogdan (problems.js) gelmesi.
].join("|") + ")(?![a-z])", "i");

// NOT: sag sinir \b DEGIL, (?![a-z]). Sebep olculdu (2026-08-31):
// "MODEM_KULLANICI" icinde ALT CIZGI bir kelime karakteri oldugu icin
// \bkullanici\b hic eslesmiyordu; problems.js'te uc bayat degisken adi
// bekciden GECTI ve operatore hala "Set MODEM_KULLANICI / MODEM_SIFRE"
// deniyordu — oysa o adlar v0.2.0'da degismisti.
//
// AYNI SINIRIN IKINCI DELIGI (2026-08-31): regex `i` bayrakli oldugu icin
// (?![a-z]) BUYUK harfi de reddediyor; yani camelCase icindeki Turkce
// sozcuk ("sifirlamaProfil") sag sinira takilip ESLESMIYORDU. Bu yuzden
// listeye kucuk harfli tam hali ("sifirlamaprofil") ayrica eklendi.

// --- ALLOWLIST: bilerek Turkce kalan, GEREKCELI uc bolge ------------------
//
// 1) report.js SECRET_FIELDS — bu bir dil tercihi degil, SIR SUZGECI.
//    Listenin, alanin BUGUN degil HIC tasidigi her adi kapsamasi gerekir;
//    daraltmak sizinti uretir ve tam bu bir kez oldu (rename `kimlik` ->
//    `credentials` yapti, suzgec guncellenmedi, kimlik nesnesi suzulmez oldu).
// 2) src/legacy.js — eski defter satirlarini okumak icin VAR. Turkce
//    anahtarlari ve degerleri tasimasi onun isi.
// 3) bin/ricon.js ENV_FALLBACK + LEGACY_FILES — teknisyenlerin .env'i ve
//    data/ dosyalari gitignore'da; repo guncellemesiyle yeniden adlanmiyor.
const ALLOWED = [
  { file: "report.js", pattern: /const SECRET_FIELDS = new Set\(\[[\s\S]*?\]\);/ },
  { file: "legacy.js", pattern: /[\s\S]*/ },
  { file: "ricon.js", pattern: /const ENV_FALLBACK = Object\.freeze\(\{[\s\S]*?\}\);/ },
  { file: "ricon.js", pattern: /const LEGACY_FILES = Object\.freeze\(\{[\s\S]*?\}\);/ },
  { file: "ricon.js", pattern: /const RENAMED_IN_0_2_0 = Object\.freeze\(\{[\s\S]*?\}\);/ },
  { file: "ricon.js", pattern: /"renamed in v0\.2\.0[\s\S]*?--from-file[^;]*;/ },
];

function blank(text, name) {
  let out = text;
  for (const a of ALLOWED) {
    if (name !== a.file) continue;
    out = out.replace(a.pattern, (m) => " ".repeat(m.length));
  }
  return out;
}

function sources() {
  const out = [];
  for (const dir of [SRC, BIN]) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".js")) continue;
      out.push({ name, code: blank(stripComments(readFileSync(dir + name, "utf8")), name) });
    }
  }
  return out;
}

test("kod ve metinlerde TURKCE HARF yok (yorumlar haric)", () => {
  const bad = [];
  for (const f of sources()) {
    f.code.split("\n").forEach((line, i) => {
      if (TURKISH_LETTERS.test(line)) bad.push(`${f.name}:${i + 1}  ${line.trim().slice(0, 70)}`);
    });
  }
  assert.deepEqual(bad, [], `Turkce harf:\n  ${bad.join("\n  ")}`);
});

test("kod ve metinlerde ASCII'ye katlanmis TURKCE SOZCUK yok", () => {
  const bad = [];
  for (const f of sources()) {
    f.code.split("\n").forEach((line, i) => {
      const m = line.match(TURKISH_WORDS);
      if (m) bad.push(`${f.name}:${i + 1}  [${m[1]}]  ${line.trim().slice(0, 60)}`);
    });
  }
  assert.deepEqual(bad, [], `Turkce sozcuk:\n  ${bad.join("\n  ")}`);
});

test("bekci UYDURMA ihlali yakalar (yanlis yesil vermesin)", () => {
  // Yorumdaki Turkce GECMELI, koddaki GECMEMELI. Ikisi de sinaniyor,
  // cunku bekcinin asil riski "her seyi yorum sanmak".
  const comment = stripComments('// hazirla dongusu calisiyor\nconst x = 1;\n');
  assert.ok(!TURKISH_WORDS.test(comment), "yorumdaki Turkce yakalanmamali");
  const code = stripComments('const durum = "kilit acildi";\n');
  assert.ok(TURKISH_WORDS.test(code), "koddaki Turkce YAKALANMALI");
  const str = stripComments('notify(opts, "modem bekleniyor");\n');
  assert.ok(TURKISH_WORDS.test(str), "metin sabitindeki Turkce YAKALANMALI");
  const letters = stripComments('const s = "algılandı";\n');
  assert.ok(TURKISH_LETTERS.test(letters), "Turkce harf YAKALANMALI");
});

test("tarama gercekten is goruyor (dosya buluyor, hepsini bosaltmiyor)", () => {
  const files = sources();
  assert.ok(files.length >= 14, `beklenenden az dosya: ${files.length}`);
  const report = files.find((f) => f.name === "report.js");
  assert.ok(report.code.length > 5000, "stripComments dosyayi yutmus olabilir");
  // legacy.js tamamen allowlist'te: bos gelmeli, digerleri gelmemeli.
  assert.equal(sources().find((f) => f.name === "legacy.js").code.trim(), "");
});
