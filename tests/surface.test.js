// YUZEY BEKCISI — src/ duz kalsin, index.js tek kapi olsun.
//
// Neden var: src/ once 24 dosya duz dizindeydi, sonra 6 katman klasorune
// bolundu, sonra yeniden duzlestirildi (2026-08-31). Her turda "bu dosya
// nereye ait?" sorusu yeniden soruldu. Bu test cevabi KODLA sabitliyor:
//   - src/ altinda KLASOR YOK. Yeni bir konu = yeni bir dosya, yeni bir
//     katman degil.
//   - Dosya listesi acik yazili. Yeni dosya eklemek bilincli bir karar
//     olmali; testi guncellemek o karari gorunur kiliyor.
//   - index.js her modulu disa aciyor. Bir modul kapiya bagli degilse ne
//     paket olarak import edilebilir ne de `calistir` ile cagrilabilir —
//     yani sessizce erisilemez kalir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as core from "../src/index.js";

const SRC = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Her dosyanin TEK bir konusu var; ad o konuyu soyluyor.
const DOSYALAR = [
  "assess.js",     // "ne durumda, ne eksik, tekrar bakmali miyim?"
  "at.js",         // AT komutlari + PIN denemesi politikasi
  "console.js",    // telnet root shell
  "device.js",     // kimlik / SIM / internet okumalari + dd-wrt ayristirma
  "index.js",      // PUBLIC API — tek kapi
  "legacy.js",     // eski defter semalarini bugunku sekle ceviren TEK sinir
  "net.js",        // HTTP istemcisi + kaynak IP + erisilebilirlik
  "nvram.js",      // ikili nvram yedegi cozumleyici + diff
  "pipeline.js",   // tak-calistir akisi
  "problems.js",   // problem katalogu (EN gelistirici metni + TR operator metni)
  "provision.js",  // plan -> yaz -> dogrula
  "read.js",       // dogrula / oku / konsol raporlari
  "report.js",     // JSON + insan-okunur metin + olcum ozeti + genel cagirici
  "settings.js",   // nvram sozlugu + profiller + sabitler
];

test("src/ DUZ: klasor yok, dosya listesi beklendigi gibi", () => {
  const girdiler = readdirSync(SRC, { withFileTypes: true });
  const klasorler = girdiler.filter((e) => e.isDirectory()).map((e) => e.name);
  assert.deepEqual(klasorler, [], "src/ altinda klasor olmamali");
  const dosyalar = girdiler.filter((e) => e.isFile()).map((e) => e.name).sort();
  assert.deepEqual(dosyalar, DOSYALAR);
});

test("index.js HER modulu disa aciyor (kapiya bagli olmayan modul kalmasin)", () => {
  const port = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const missing = DOSYALAR
    .filter((name) => name !== "index.js")
    .filter((name) => !port.includes(`"./${name}"`));
  assert.deepEqual(missing, [], `index.js'te export edilmeyen modul: ${missing.join(", ")}`);
});

test("public API bos degil ve hepsi cagrilabilir bir sey", () => {
  const girisler = Object.entries(core);
  assert.ok(girisler.length > 50, `beklenenden az export: ${girisler.length}`);
  // Her export ya bir fonksiyon ya bir sabit; undefined export sessiz bir
  // kirik yoldur (yanlis modulden re-export edilmis olabilir).
  const bos = girisler.filter(([, v]) => v === undefined).map(([k]) => k);
  assert.deepEqual(bos, []);
});
