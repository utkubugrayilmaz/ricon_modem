// Arayuz kodunda TANIMSIZ isim var mi? Tarayici gerektirmez.
//
// NEDEN VAR — gonderilmis GERCEK bir hata: `tekrariAyarla` cagriliyordu ama
// HIC TANIMLI DEGILDI; `tekrarZamani` de oyle. Sonuc: numara ekrana geliyor,
// hemen ardindan ReferenceError atiliyor, catch da onu yakalayip "sunucuya
// ulasilamadi" diye YANLIS teshis basiyordu. `node --check` bunu gormez
// (sozdizimi degil, calisma-ani hatasi) ve app.js'in otomatik kapsamasi yoktu.
//
// Tam scope analizi DEGIL: cagri yerlerini (`ad(`) ve arguman olarak gecen
// ciplak isimleri (`f(ad)`) toplar, hicbir yerde tanimlanmamis olani bildirir.
// Beni isiran iki bicim tam bunlardi.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const KAYNAK = new URL("../examples/test-ui/app.js", import.meta.url);

const TIRNAK = String.fromCharCode(39);      // '
const CIFT = String.fromCharCode(34);        // "
const SABLON = String.fromCharCode(96);      // `
const KACIS = String.fromCharCode(92);       // \
const SATIRSONU = String.fromCharCode(10);

// Yorumlari ve metin sabitlerini SILER; sablon icindeki ${...} KOD oldugu icin
// KORUNUR. Regex ile denedim, tutmadi: tek bir sablon eslesmesi dosyanin buyuk
// parcasini yutuyor, TANIMLAR da siliniyor ve tarama onlari "tanimsiz"
// sayiyordu. Karakter karakter yurumek tek dogru yol.
function kodIskeleti(text) {
  const yigin = [];        // sablon icindeki ${} yuvalanmasi
  let state = "kod";         // kod | satirYorum | blokYorum | tek | cift | sablon
  let output = "";
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const s = text[i + 1];
    if (state === "kod") {
      if (c === "/" && s === "/") { state = "satirYorum"; i += 1; continue; }
      if (c === "/" && s === "*") { state = "blokYorum"; i += 1; continue; }
      if (c === TIRNAK) { state = "tek"; output += " "; continue; }
      if (c === CIFT) { state = "cift"; output += " "; continue; }
      if (c === SABLON) { state = "sablon"; output += " "; continue; }
      if (c === "}" && yigin.length) { yigin.pop(); state = "sablon"; output += " "; continue; }
      output += c;
      continue;
    }
    if (state === "satirYorum") {
      if (c === SATIRSONU) { state = "kod"; output += c; }
      continue;
    }
    if (state === "blokYorum") {
      if (c === "*" && s === "/") { state = "kod"; i += 1; }
      continue;
    }
    if (state === "tek" || state === "cift") {
      if (c === KACIS) { i += 1; continue; }
      if ((state === "tek" && c === TIRNAK) || (state === "cift" && c === CIFT)) state = "kod";
      continue;
    }
    // sablon: duz metin atilir, ${...} icerigi KOD olarak devam eder
    if (c === KACIS) { i += 1; continue; }
    if (c === "$" && s === "{") { yigin.push(1); state = "kod"; i += 1; output += " "; continue; }
    if (c === SABLON) { state = "kod"; continue; }
  }
  return output;
}

const ANAHTAR = new Set(["if", "else", "for", "while", "do", "switch", "case",
  "default", "break", "continue", "return", "function", "const", "let", "var",
  "new", "delete", "typeof", "instanceof", "in", "of", "this", "null", "true",
  "false", "undefined", "try", "catch", "finally", "throw", "class", "extends",
  "super", "await", "async", "yield", "void", "arguments"]);

const KURESEL = new Set(["document", "window", "console", "fetch", "setTimeout",
  "clearTimeout", "setInterval", "clearInterval", "EventSource", "performance",
  "JSON", "Math", "Number", "String", "Boolean", "Object", "Array", "Date",
  "Promise", "Set", "Map", "Error", "isNaN", "parseInt", "parseFloat",
  "encodeURIComponent", "decodeURIComponent", "URL", "AbortController",
  "requestAnimationFrame", "navigator", "location", "localStorage", "Intl"]);

const AD = "[A-Za-z_$][A-Za-z0-9_$]*";

function tanimlananlar(code) {
  const t = new Set();
  const ekle = (raw) => {
    const name = String(raw || "").trim();
    if (name && new RegExp(`^${AD}$`).test(name) && !ANAHTAR.has(name)) t.add(name);
  };
  const clear = (p) => p.replace(/=[^,]*/g, "").replace(/[{}[\]]/g, "")
    .split(":").pop();

  for (const m of code.matchAll(new RegExp(`function\\s+(${AD})`, "g"))) ekle(m[1]);
  for (const m of code.matchAll(new RegExp(`(?:const|let|var)\\s+(${AD})`, "g"))) ekle(m[1]);
  // yikim: const { a, b } = ...  /  const [a, b] = ...
  for (const m of code.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) {
    for (const p of m[1].split(",")) ekle(clear(p));
  }
  // parametre listeleri: function f(a, b) / catch (e) / (a, b) => / a =>
  for (const m of code.matchAll(/(?:function[^(]*|catch\s*)\(([^)]*)\)/g)) {
    for (const p of m[1].split(",")) ekle(clear(p));
  }
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const p of m[1].split(",")) ekle(clear(p));
  }
  for (const m of code.matchAll(new RegExp(`(${AD})\\s*=>`, "g"))) ekle(m[1]);
  // for (const x of ...) / for (const [a, b] of ...)
  for (const m of code.matchAll(/for\s*\(\s*(?:const|let|var)\s+([^;)]*?)\s+(?:of|in)\s/g)) {
    for (const p of m[1].replace(/[{}[\]]/g, "").split(",")) ekle(p);
  }
  return t;
}

function kullanilanlar(code) {
  const k = new Map();
  const cagri = new RegExp(`(^|[^.A-Za-z0-9_$])(${AD})\\s*\\(`, "g");
  const arguman = new RegExp(`[(,]\\s*(${AD})\\s*[,)]`, "g");
  code.split(SATIRSONU).forEach((line, i) => {
    for (const m of line.matchAll(cagri)) if (!k.has(m[2])) k.set(m[2], i + 1);
    for (const m of line.matchAll(arguman)) if (!k.has(m[1])) k.set(m[1], i + 1);
  });
  return k;
}

test("arayuz kodunda TANIMSIZ isim yok", () => {
  const code = kodIskeleti(readFileSync(KAYNAK, "utf8"));
  const tanim = tanimlananlar(code);
  const kusurlu = [];
  for (const [name, line] of kullanilanlar(code)) {
    if (ANAHTAR.has(name) || KURESEL.has(name) || tanim.has(name)) continue;
    kusurlu.push(`${name} (satir ${line})`);
  }
  assert.deepEqual(kusurlu, [], `tanimsiz isimler: ${kusurlu.join(", ")}`);
});

test("yorum/metin ayiklama TANIMLARI silmiyor", () => {
  const tanim = tanimlananlar(kodIskeleti(readFileSync(KAYNAK, "utf8")));
  for (const name of ["el", "scheduleRetry", "clearNumber", "refreshStatus",
    "applyAssessment", "askPinUnlock", "paintDigits"]) {
    assert.ok(tanim.has(name), `${name} tanimi ayiklamada kayboldu`);
  }
});

test("tarama UYDURMA cagriyi yakalar (yanlis yesil vermesin)", () => {
  const code = kodIskeleti(readFileSync(KAYNAK, "utf8"));
  assert.ok(tanimlananlar(code).size > 60, "tanim toplama bozuk olabilir");
  assert.ok(kullanilanlar(code).size > 40, "kullanim toplama bozuk olabilir");
  const bozuk = `${code}${SATIRSONU}boyleBirSeyYok(1);`;
  assert.ok(!tanimlananlar(bozuk).has("boyleBirSeyYok"));
  assert.ok(kullanilanlar(bozuk).has("boyleBirSeyYok"));
});
