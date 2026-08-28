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
function kodIskeleti(metin) {
  const yigin = [];        // sablon icindeki ${} yuvalanmasi
  let hal = "kod";         // kod | satirYorum | blokYorum | tek | cift | sablon
  let cikti = "";
  for (let i = 0; i < metin.length; i += 1) {
    const c = metin[i];
    const s = metin[i + 1];
    if (hal === "kod") {
      if (c === "/" && s === "/") { hal = "satirYorum"; i += 1; continue; }
      if (c === "/" && s === "*") { hal = "blokYorum"; i += 1; continue; }
      if (c === TIRNAK) { hal = "tek"; cikti += " "; continue; }
      if (c === CIFT) { hal = "cift"; cikti += " "; continue; }
      if (c === SABLON) { hal = "sablon"; cikti += " "; continue; }
      if (c === "}" && yigin.length) { yigin.pop(); hal = "sablon"; cikti += " "; continue; }
      cikti += c;
      continue;
    }
    if (hal === "satirYorum") {
      if (c === SATIRSONU) { hal = "kod"; cikti += c; }
      continue;
    }
    if (hal === "blokYorum") {
      if (c === "*" && s === "/") { hal = "kod"; i += 1; }
      continue;
    }
    if (hal === "tek" || hal === "cift") {
      if (c === KACIS) { i += 1; continue; }
      if ((hal === "tek" && c === TIRNAK) || (hal === "cift" && c === CIFT)) hal = "kod";
      continue;
    }
    // sablon: duz metin atilir, ${...} icerigi KOD olarak devam eder
    if (c === KACIS) { i += 1; continue; }
    if (c === "$" && s === "{") { yigin.push(1); hal = "kod"; i += 1; cikti += " "; continue; }
    if (c === SABLON) { hal = "kod"; continue; }
  }
  return cikti;
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

function tanimlananlar(kod) {
  const t = new Set();
  const ekle = (ham) => {
    const ad = String(ham || "").trim();
    if (ad && new RegExp(`^${AD}$`).test(ad) && !ANAHTAR.has(ad)) t.add(ad);
  };
  const temizle = (p) => p.replace(/=[^,]*/g, "").replace(/[{}[\]]/g, "")
    .split(":").pop();

  for (const m of kod.matchAll(new RegExp(`function\\s+(${AD})`, "g"))) ekle(m[1]);
  for (const m of kod.matchAll(new RegExp(`(?:const|let|var)\\s+(${AD})`, "g"))) ekle(m[1]);
  // yikim: const { a, b } = ...  /  const [a, b] = ...
  for (const m of kod.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) {
    for (const p of m[1].split(",")) ekle(temizle(p));
  }
  // parametre listeleri: function f(a, b) / catch (e) / (a, b) => / a =>
  for (const m of kod.matchAll(/(?:function[^(]*|catch\s*)\(([^)]*)\)/g)) {
    for (const p of m[1].split(",")) ekle(temizle(p));
  }
  for (const m of kod.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const p of m[1].split(",")) ekle(temizle(p));
  }
  for (const m of kod.matchAll(new RegExp(`(${AD})\\s*=>`, "g"))) ekle(m[1]);
  // for (const x of ...) / for (const [a, b] of ...)
  for (const m of kod.matchAll(/for\s*\(\s*(?:const|let|var)\s+([^;)]*?)\s+(?:of|in)\s/g)) {
    for (const p of m[1].replace(/[{}[\]]/g, "").split(",")) ekle(p);
  }
  return t;
}

function kullanilanlar(kod) {
  const k = new Map();
  const cagri = new RegExp(`(^|[^.A-Za-z0-9_$])(${AD})\\s*\\(`, "g");
  const arguman = new RegExp(`[(,]\\s*(${AD})\\s*[,)]`, "g");
  kod.split(SATIRSONU).forEach((satir, i) => {
    for (const m of satir.matchAll(cagri)) if (!k.has(m[2])) k.set(m[2], i + 1);
    for (const m of satir.matchAll(arguman)) if (!k.has(m[1])) k.set(m[1], i + 1);
  });
  return k;
}

test("arayuz kodunda TANIMSIZ isim yok", () => {
  const kod = kodIskeleti(readFileSync(KAYNAK, "utf8"));
  const tanim = tanimlananlar(kod);
  const kusurlu = [];
  for (const [ad, satir] of kullanilanlar(kod)) {
    if (ANAHTAR.has(ad) || KURESEL.has(ad) || tanim.has(ad)) continue;
    kusurlu.push(`${ad} (satir ${satir})`);
  }
  assert.deepEqual(kusurlu, [], `tanimsiz isimler: ${kusurlu.join(", ")}`);
});

test("yorum/metin ayiklama TANIMLARI silmiyor", () => {
  const tanim = tanimlananlar(kodIskeleti(readFileSync(KAYNAK, "utf8")));
  for (const ad of ["el", "tekrariAyarla", "numarayiSifirla", "durumuTazele",
    "okumayiUygula", "pinKilidiIste", "haneleriBoya"]) {
    assert.ok(tanim.has(ad), `${ad} tanimi ayiklamada kayboldu`);
  }
});

test("tarama UYDURMA cagriyi yakalar (yanlis yesil vermesin)", () => {
  const kod = kodIskeleti(readFileSync(KAYNAK, "utf8"));
  assert.ok(tanimlananlar(kod).size > 60, "tanim toplama bozuk olabilir");
  assert.ok(kullanilanlar(kod).size > 40, "kullanim toplama bozuk olabilir");
  const bozuk = `${kod}${SATIRSONU}boyleBirSeyYok(1);`;
  assert.ok(!tanimlananlar(bozuk).has("boyleBirSeyYok"));
  assert.ok(kullanilanlar(bozuk).has("boyleBirSeyYok"));
});
