// Public API (src/index.js) testleri — paket olarak tuketildiginde calisan
// yuzey. Cihaz gerektirmez (saf fonksiyon + kapali-port yolu).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nvramFarkHesapla, modemDogrula, modemOku, modemKonsol,
} from "../src/index.js";

test("index: nvramFarkHesapla saf calisir", () => {
  const r = nvramFarkHesapla({ a: "1", b: "2" }, { a: "1", b: "X", c: "3" });
  assert.equal(r.komut, "fark");
  assert.equal(r.ozet.degisen, 1);
  assert.equal(r.ozet.eklenen, 1);
  assert.equal(r.degisen.b.yeni, "X");
});

test("index: modemKonsol kimliksiz AUTH_REQUIRED (I/O yok)", async () => {
  const r = await modemKonsol({ host: "127.0.0.1", kimlik: null });
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].kod, "AUTH_REQUIRED");
});

test("index: modemDogrula erisilemez cihazda sonuc nesnesi doner (throw yok)", async () => {
  // kapali port -> erisilemez; hizli.
  const r = await modemDogrula({ host: "127.0.0.1", kaynakIp: undefined, kimlik: null });
  assert.equal(r.komut, "dogrula");
  assert.equal(typeof r.ok, "boolean");
  assert.ok(Array.isArray(r.problems));
});

test("index: modemOku process.env okumadan opts ile calisir (erisilemez)", async () => {
  const r = await modemOku({ host: "127.0.0.1", kaynakIp: undefined, kimlik: null });
  assert.equal(r.komut, "oku");
  assert.ok(Array.isArray(r.problems));
});
