// BEKCI: package.json'daki yollar GERCEKTEN var mi?
//
// NEDEN VAR — olculmus gercek kusur: src/ katmanlara bolundugunde (domain/
// transport/parse/device/flow/report) `exports` haritasi guncellenmedi ve
// 15 girdinin 14'u OLMAYAN dosyalara isaret etmeye basladi
// (./src/okuma.js, ./src/at.js, ...). Bu paketi import eden herhangi bir
// program ERR_MODULE_NOT_FOUND aliyordu. Hicbir test paket yuzeyine
// bakmadigi icin kusur sessizce durdu.
//
// Alt yollar KALDIRILDI: index.js zaten "TEK KAPI" olmak uzere yazilmis
// (bkz. dosyanin basindaki not). Tek giris hem dosya tasimasina dayanikli
// hem de "bu paket ne yapabiliyor?" sorusunun cevabini tek yerde tutuyor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const KOK = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const paket = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

// "./src/index.js" -> mutlak dosya yolu
const coz = (rel) => KOK + String(rel).replace(/^\.\//, "");

test("paket: exports haritasindaki HER yol diskte var", () => {
  const kayip = [];
  for (const [alt, hedef] of Object.entries(paket.exports ?? {})) {
    if (!existsSync(coz(hedef))) kayip.push(`${alt} -> ${hedef}`);
  }
  assert.deepEqual(kayip, [], `olmayan dosyaya isaret eden exports: ${kayip.join(", ")}`);
});

test("paket: main ve bin yollari diskte var", () => {
  assert.ok(existsSync(coz(paket.main)), `main yok: ${paket.main}`);
  for (const [ad, yol] of Object.entries(paket.bin ?? {})) {
    assert.ok(existsSync(coz(yol)), `bin ${ad} yok: ${yol}`);
  }
});

test("paket: exports GERCEKTEN import edilebilir (yol var demek yetmez)", async () => {
  for (const hedef of Object.values(paket.exports ?? {})) {
    const m = await import(new URL(hedef, new URL("../", import.meta.url)));
    assert.ok(Object.keys(m).length > 0, `${hedef} hicbir sey disa acmiyor`);
  }
});

test("paket: files listesindeki her giris diskte var", () => {
  // `files` npm'e neyin paketlenecegini soyluyor; olmayan bir giris sessizce
  // yok sayilir ve eksik paket yayinlanir.
  const kayip = (paket.files ?? []).filter((f) => !existsSync(coz(f)));
  assert.deepEqual(kayip, [], `files'ta olmayan giris: ${kayip.join(", ")}`);
});

test("paket: CLI komutu yardim metnini basip 0 ile cikar", async () => {
  // Paketin tek yurutulebilir yuzeyi. `--help` hata DEGIL: betiklerde
  // `ricon.js --help && ...` zinciri kirilmamali.
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [coz(paket.bin.ricon), "--help"],
    { encoding: "utf8" });
  assert.equal(r.status, 0, "yardim istemek hata degil");
  assert.match(r.stderr, /Kullanim:/);
  // Kaldirilan komutlar yardimda GORUNMEMELI (dokuman yalan soylemesin).
  for (const gitmis of ["sunucu", "olcum", "izle --sure", "sim-pin-kilitle", "fark <"]) {
    assert.ok(!r.stderr.includes(gitmis), `kaldirilan komut yardimda: ${gitmis}`);
  }
});
