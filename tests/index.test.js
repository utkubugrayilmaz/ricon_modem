// Public API (src/index.js) testleri — paket olarak tuketildiginde calisan
// yuzey. Cihaz gerektirmez (saf fonksiyon + kapali-port yolu).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeNvramDiff, checkDevice, readDevice, readConsole,
} from "../src/index.js";

test("index: computeNvramDiff saf calisir", () => {
  const r = computeNvramDiff({ a: "1", b: "2" }, { a: "1", b: "X", c: "3" });
  assert.equal(r.command, "fark");
  assert.equal(r.summary.changed, 1);
  assert.equal(r.summary.eklenen, 1);
  assert.equal(r.changed.b.next, "X");
});

test("index: readConsole kimliksiz AUTH_REQUIRED (I/O yok)", async () => {
  const r = await readConsole({ host: "127.0.0.1", credentials: null });
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].code, "AUTH_REQUIRED");
});

test("index: checkDevice erisilemez cihazda sonuc nesnesi doner (throw yok)", async () => {
  // kapali port -> erisilemez; hizli.
  const r = await checkDevice({ host: "127.0.0.1", sourceIp: undefined, credentials: null });
  assert.equal(r.command, "dogrula");
  assert.equal(typeof r.ok, "boolean");
  assert.ok(Array.isArray(r.problems));
});

test("index: readDevice process.env okumadan opts ile calisir (erisilemez)", async () => {
  const r = await readDevice({ host: "127.0.0.1", sourceIp: undefined, credentials: null });
  assert.equal(r.command, "oku");
  assert.ok(Array.isArray(r.problems));
});
