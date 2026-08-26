// Public API (src/index.js) testleri — paket olarak tuketildiginde calisan
// yuzey. Cihaz gerektirmez (saf fonksiyon + kapali-port yolu).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeNvramDiff, checkDevice, readDevice, readConsole,
} from "../src/index.js";

test("index: computeNvramDiff saf calisir", () => {
  const r = computeNvramDiff({ a: "1", b: "2" }, { a: "1", b: "X", c: "3" });
  assert.equal(r.komut, "fark");
  assert.equal(r.ozet.degisen, 1);
  assert.equal(r.ozet.eklenen, 1);
  assert.equal(r.degisen.b.yeni, "X");
});

test("index: readConsole kimliksiz AUTH_REQUIRED (I/O yok)", async () => {
  const r = await readConsole({ host: "127.0.0.1", kimlik: null });
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].kod, "AUTH_REQUIRED");
});

test("index: checkDevice erisilemez cihazda sonuc nesnesi doner (throw yok)", async () => {
  // kapali port -> erisilemez; hizli.
  const r = await checkDevice({ host: "127.0.0.1", kaynakIp: undefined, kimlik: null });
  assert.equal(r.komut, "dogrula");
  assert.equal(typeof r.ok, "boolean");
  assert.ok(Array.isArray(r.problems));
});

test("index: readDevice process.env okumadan opts ile calisir (erisilemez)", async () => {
  const r = await readDevice({ host: "127.0.0.1", kaynakIp: undefined, kimlik: null });
  assert.equal(r.komut, "oku");
  assert.ok(Array.isArray(r.problems));
});
