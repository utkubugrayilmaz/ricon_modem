// MIMARI BEKCISI — bagimlilik yonu TEK YON kalsin.
//
// Neden var: src/ 2026-08-31'de katmanlara bolundu. Klasor yapisi tek basina
// hicbir sey garanti etmez; ilk "sadece su fonksiyonu cagirayim" aninda
// domain bir flow modulunu import eder ve dosyalar yerinde dururken mimari
// coker. Bu test o yonu KODLA sabitliyor.
//
// Izin verilen yon:  cli → flow → device → transport/parse → domain
// domain hicbir seye bagli degildir. transport cihaza gider ama KARAR VERMEZ.
// Giris noktasi (index.js) her katmani cagirabilir — isi bu.
//
// cli/ 2026-08-31'de eklendi (genel cagirici). En ustte durur: kimse onu
// import ETMEZ, kendisi de bugun hicbir sey import etmiyor — cekirdek modul
// namespace'i ona PARAMETRE olarak veriliyor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Her katman KENDISINI ve altindakileri cagirabilir.
const IZIN = {
  domain: ["domain"],
  parse: ["domain", "parse"],
  transport: ["domain", "parse", "transport"],
  device: ["domain", "parse", "transport", "device"],
  flow: ["domain", "parse", "transport", "device", "flow"],
  report: ["domain", "report"],
  cli: ["domain", "parse", "transport", "device", "flow", "report", "cli"],
};
const KATMANLAR = Object.keys(IZIN);

function moduller() {
  const cikti = [];
  for (const katman of KATMANLAR) {
    for (const ad of readdirSync(join(SRC, katman))) {
      if (!ad.endsWith(".js")) continue;
      const yol = join(SRC, katman, ad);
      cikti.push({ katman, ad, yol, metin: readFileSync(yol, "utf8") });
    }
  }
  return cikti;
}

const ithaller = (metin) =>
  [...metin.matchAll(/(?:from\s*"|import\(\s*")(\.[^"]+)"/g)].map((m) => m[1]);

test("her katman YALNIZCA izin verilen katmanlari import eder", () => {
  const ihlal = [];
  for (const m of moduller()) {
    for (const spec of ithaller(m.metin)) {
      const hedef = resolve(dirname(m.yol), spec);
      const parca = relative(SRC, hedef).split(sep);
      const hedefKatman = parca.length > 1 ? parca[0] : "(src koku)";
      if (!IZIN[m.katman].includes(hedefKatman)) {
        ihlal.push(`${m.katman}/${m.ad} -> ${hedefKatman} (${spec})`);
      }
    }
  }
  assert.deepEqual(ihlal, [], `yon ihlali:\n  ${ihlal.join("\n  ")}`);
});

test("katman klasorleri bos degil ve src kokunde yalnizca giris dosyalari var", () => {
  for (const katman of KATMANLAR) {
    const sayi = readdirSync(join(SRC, katman)).filter((f) => f.endsWith(".js")).length;
    assert.ok(sayi > 0, `${katman}/ bos`);
  }
  const kokte = readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".js"))
    .map((e) => e.name)
    .sort();
  // Kokte uygulama kodu BIRIKMESIN: yeni dosya bir katmana ait olmali.
  // server.js 2026-08-31'de main'den cikti (ui dalinda duruyor); kokte artik
  // yalnizca PUBLIC API kapisi var.
  assert.deepEqual(kokte, ["index.js"]);
});

// cli/ en ust katman: hicbir src modulu onu import ETMEMELI. Ederse cekirdek
// bir CLI kaygisina baglanmis olur ve "paket olarak import" yolu kirilir.
test("hicbir katman cli/'yi import etmiyor", () => {
  const ihlal = moduller()
    .filter((m) => m.katman !== "cli")
    .filter((m) => ithaller(m.metin).some((s) => s.includes("cli/")))
    .map((m) => `${m.katman}/${m.ad}`);
  assert.deepEqual(ihlal, []);
});
