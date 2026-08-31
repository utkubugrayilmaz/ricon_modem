// TANIMSIZ ISIM BEKCISI — cagrilan ama tanimli/import edilmemis fonksiyon var mi?
//
// NEDEN VAR — gonderilmis GERCEK bir hata (2026-08-31):
// src/ duzlestirilirken cihaz.js + sim.js + ddwrt.js `device.js`te birlestirildi
// ve `isOk` importu yolda dustu. `readIdentity` her cagrilisinda
// "ReferenceError: isOk is not defined" atiyordu.
//
// HICBIR TEST YAKALAMADI, cunku iki cagri yeri de hatayi YUTUYOR:
//     try { k = await readIdentity(...); } catch { /* kismi sonuc gecerli */ }
// Sonuc: `degerlendir` sessizce "SIM yok, telefon yok" diyordu ve `npm start`
// hicbir sey yazmadan cikiyordu. Kusur cihaz baglanana kadar gorunmedi.
//
// `node --check` bunu gormez (sozdizimi degil, calisma-ani hatasi). Bu test
// CAGRI konumundaki isimlere bakiyor: `ad(` seklinde cagrilan bir isim ya
// dosyada tanimli, ya import edilmis, ya da bilinen bir kuresel olmali.
//
// Tam kapsam analizi DEGIL — beni isiran bicim tam buydu ve onu yakaliyor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const BIN = new URL("../bin/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const AD = "[A-Za-z_$][A-Za-z0-9_$]*";

const KURESEL = new Set([
  "console", "process", "JSON", "Math", "Number", "String", "Boolean", "Object",
  "Array", "Date", "Promise", "Set", "Map", "WeakMap", "Error", "TypeError",
  "RangeError", "isNaN", "parseInt", "parseFloat", "Buffer", "URL",
  "URLSearchParams", "setTimeout", "clearTimeout", "setInterval",
  "clearInterval", "AbortController", "RegExp", "Symbol", "BigInt",
  "structuredClone", "TextEncoder", "TextDecoder", "queueMicrotask", "require",
  // anahtar kelimeler `ad(` desenine benziyor
  "if", "for", "while", "switch", "catch", "return", "typeof", "function",
  "new", "delete", "void", "await", "async", "yield", "super", "this",
  "import", "export", "class", "of", "in", "do", "else", "try", "finally",
  "throw", "case", "default", "constructor",
]);

// Yorumlari ve metin sabitlerini siler; sablon icindeki ${...} KOD oldugu icin
// korunur. Karakter karakter yurumek sart: tek bir regex sablon eslesmesi
// dosyanin buyuk parcasini yutup TANIMLARI da siler ve tarama onlari
// "tanimsiz" sayar.
// REGEX SABITLERI de atilir. Sart: `/\b(\d+)\b/` gibi bir regex icindeki
// `b(` cagri sanilip "tanimsiz b()" diye bildiriliyordu — testin kendisi
// yanlis alarm uretiyordu. Bolme (`a / b`) ile regex ayrimi, `/`den onceki
// anlamli karaktere bakarak yapiliyor.
function kodIskeleti(text) {
  const stack = [];
  let mode = "kod";
  let quote = "";
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const d = text[i + 1];
    if (mode === "kod") {
      if (c === "/" && d === "/") { mode = "satirYorum"; i += 1; continue; }
      if (c === "/" && d === "*") { mode = "blokYorum"; i += 1; continue; }
      if (c === "/") {
        let j = i - 1;
        while (j >= 0 && " \t\r\n".includes(text[j])) j -= 1;
        const prev = j >= 0 ? text[j] : "";
        const bolme = /[A-Za-z0-9_$)\]]/.test(prev);
        if (!bolme) { mode = "regex"; out += " "; continue; }
      }
      if (c === "'" || c === '"') { mode = "metin"; quote = c; out += " "; continue; }
      if (c === "`") { mode = "sablon"; out += " "; continue; }
      if (c === "}" && stack.length) { stack.pop(); mode = "sablon"; out += " "; continue; }
      out += c;
      continue;
    }
    if (mode === "satirYorum") { if (c === "\n") { mode = "kod"; out += c; } continue; }
    if (mode === "blokYorum") { if (c === "*" && d === "/") { mode = "kod"; i += 1; } continue; }
    if (mode === "regex") {
      if (c === "\\") { i += 1; continue; }
      if (c === "[") {                       // karakter sinifi: icindeki / bitirmez
        i += 1;
        while (i < text.length && text[i] !== "]") { if (text[i] === "\\") i += 1; i += 1; }
        continue;
      }
      if (c === "/") { while (i + 1 < text.length && /[a-z]/.test(text[i + 1])) i += 1; mode = "kod"; }
      else if (c === "\n") { mode = "kod"; }  // regex satir asmaz -> bolmeymis
      continue;
    }
    if (mode === "metin") {
      if (c === "\\") { i += 1; continue; }
      if (c === quote) mode = "kod";
      continue;
    }
    if (c === "\\") { i += 1; continue; }
    if (c === "$" && d === "{") { stack.push(1); mode = "kod"; i += 1; out += " "; continue; }
    if (c === "`") { mode = "kod"; continue; }
  }
  return out;
}

function tanimlar(kod) {
  const t = new Set();
  const ekle = (raw) => {
    const name = String(raw || "").replace(/\.\.\./g, "").trim();
    if (name && new RegExp(`^${AD}$`).test(name)) t.add(name);
  };
  for (const pat of [
    new RegExp(`function\\s+(${AD})`, "g"),
    new RegExp(`(?:const|let|var)\\s+(${AD})`, "g"),
    new RegExp(`class\\s+(${AD})`, "g"),
    new RegExp(`import\\s+(?:\\*\\s+as\\s+)?(${AD})\\s+from`, "g"),
    // sinif metotlari:  metodAdi(...) {   — cagrilarindan ayirt etmek icin
    // satir basinda ve govde acan bicim araniyor
    new RegExp(`^\\s{2,}(?:async\\s+)?(${AD})\\s*\\([^)]*\\)\\s*\\{`, "gm"),
    new RegExp(`(${AD})\\s*=>`, "g"),
  ]) {
    for (const m of kod.matchAll(pat)) ekle(m[1]);
  }
  for (const m of kod.matchAll(/import\s*\{([^}]*)\}/g)) {
    for (const p of m[1].split(",")) ekle(p.trim().split(/\s+as\s+/).pop());
  }
  const temizle = (p) => p.replace(/\.\.\./g, "").split(":").pop().split("=")[0]
    .replace(/[{}[\]]/g, "").trim();
  for (const m of kod.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) {
    for (const p of m[1].split(",")) ekle(temizle(p));
  }
  for (const m of kod.matchAll(/(?:function[^(]*|catch\s*)\(([^)]*)\)/g)) {
    for (const p of m[1].split(",")) ekle(temizle(p));
  }
  for (const m of kod.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const p of m[1].split(",")) ekle(temizle(p));
  }
  return t;
}

function dosyalar() {
  const out = [];
  for (const [dir, ad] of [[SRC, readdirSync(SRC)], [BIN, readdirSync(BIN)]]) {
    for (const name of ad) {
      if (name.endsWith(".js")) out.push({ name, kod: kodIskeleti(readFileSync(dir + name, "utf8")) });
    }
  }
  return out;
}

test("cagrilan her isim tanimli ya da import edilmis", () => {
  const missing = [];
  for (const f of dosyalar()) {
    const known = tanimlar(f.kod);
    const seen = new Set();
    for (const m of f.kod.matchAll(new RegExp(`(?:^|[^.\\w$])(${AD})\\s*\\(`, "g"))) {
      const name = m[1];
      if (KURESEL.has(name) || known.has(name) || seen.has(name)) continue;
      seen.add(name);
      missing.push(`${f.name}: ${name}()`);
    }
  }
  assert.deepEqual(missing, [], `tanimsiz cagri:\n  ${missing.join("\n  ")}`);
});

test("bekci UYDURMA eksik importu yakalar (yanlis yesil vermesin)", () => {
  const bozuk = kodIskeleti(`
import { problem } from "./problems.js";
export function f() { return isOk([]) && problem("X"); }
`);
  const known = tanimlar(bozuk);
  assert.ok(known.has("problem"), "import edilen ad TANIMLI sayilmali");
  assert.ok(!known.has("isOk"), "import EDILMEYEN ad tanimli sayilmamali");
  const calls = [...bozuk.matchAll(new RegExp(`(?:^|[^.\\w$])(${AD})\\s*\\(`, "g"))]
    .map((m) => m[1]);
  assert.ok(calls.includes("isOk"), "cagri toplama bozuk olabilir");
});

test("tarama gercekten is goruyor (dosya ve tanim buluyor)", () => {
  const files = dosyalar();
  assert.ok(files.length >= 14, `beklenenden az dosya: ${files.length}`);
  const device = files.find((f) => f.name === "device.js");
  assert.ok(tanimlar(device.kod).size > 20, "tanim toplama bozuk olabilir");
});
