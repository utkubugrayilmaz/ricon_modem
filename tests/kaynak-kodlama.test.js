// Kaynak dosyalar GECERLI UTF-8 mi? Cihaz gerektirmez.
//
// Neden var: src/izleme.js ve src/okuma.js'e tek baytlik cp1252 karakterleri
// (— ve ·) sizmisti. Node .js'i UTF-8 okur, o baytlar bozuk karaktere
// donuyordu. Ikisi YORUM degil EKRANA BASILAN metnin icindeydi (`izle`
// komutunun ilerleme satiri), yani gorunur bir kusurdu. Testler gecmeye
// devam ediyordu cunku hicbir test ciktinin karakterlerine bakmiyor.
//
// Sebep: dosyalari kabuk uzerinden yazdirirken konsol kodlamasi araya girdi.
// Bu test o kaziyi tekrarlanamaz yapiyor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KOK = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function metinDosyalari() {
  const cikti = [];
  // ALT KLASORLERE INER: src/ 2026-08-31'de katmanlara bolundu
  // (domain/transport/parse/device/flow/report). Duz readdir yapan eski surum
  // tasima sonrasi hicbir src dosyasini denetlemiyordu — sessiz kapsam kaybi.
  const yuru = (dizin) => {
    for (const ad of readdirSync(join(KOK, dizin), { withFileTypes: true })) {
      if (ad.isDirectory()) {
        if (ad.name === "node_modules" || ad.name.startsWith(".")) continue;
        if (dizin === ".") continue;              // kokte YALNIZCA dosyalar
        yuru(`${dizin}/${ad.name}`);
        continue;
      }
      if (!/\.(js|json|md|html|css)$/.test(ad.name)) continue;
      cikti.push({ ad: `${dizin}/${ad.name}`, bayt: readFileSync(join(KOK, dizin, ad.name)) });
    }
  };
  for (const dizin of ["src", "bin", "tests", "examples", "."]) yuru(dizin);
  return cikti;
}

test("tum kaynak dosyalar GECERLI UTF-8", () => {
  const kotu = [];
  for (const { ad, bayt } of metinDosyalari()) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bayt);
    } catch {
      kotu.push(ad);
    }
  }
  assert.deepEqual(kotu, [], `gecersiz UTF-8: ${kotu.join(", ")}`);
});

test("kaynakta BOZUK KARAKTER (U+FFFD) yok", () => {
  // Gecerli UTF-8 olup icinde zaten degistirme karakteri tasiyan dosya da
  // kusurludur: bir yerde donusum kaybi yasanmis demektir.
  //
  // Karakteri KOD NOKTASINDAN uretiyoruz. Dosyaya harfi harfine yazmak
  // testin KENDISINI kusurlu yapiyor — ilk yazimda tam bu oldu ve test
  // kendi dosyasini isaretledi.
  const DEGISTIRME = String.fromCharCode(0xFFFD);
  const kotu = metinDosyalari()
    .filter(({ bayt }) => new TextDecoder().decode(bayt).includes(DEGISTIRME))
    .map(({ ad }) => ad);
  assert.deepEqual(kotu, []);
});

test("taramanin kendisi calisiyor (dosya buluyor)", () => {
  assert.ok(metinDosyalari().length > 30, "dosya taramasi bozuk olabilir");
});
