// istemci + ag + sorunlar + rapor testleri — cihaz gerektirmez.
// Sahte modem: port 0'da bir node:http sunucusu; Client'ye port secenegi
// verildigi icin hedef temiz sekilde yonlendirilir (test-hack yok).

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Client } from "../src/net.js";
import { guessVendor } from "../src/net.js";
import { problem, isOk, PROBLEM_CODES } from "../src/problems.js";
import { stripSecrets } from "../src/report.js";

function sahteModem(davranis) {
  return new Promise((resolve) => {
    const sunucu = http.createServer(davranis);
    sunucu.listen(0, "127.0.0.1", () => {
      resolve({ port: sunucu.address().port, finishWith: () => sunucu.close() });
    });
  });
}

test("istemci: salt-okunur modda POST reddedilir", async () => {
  const c = new Client({ host: "127.0.0.1" });
  const r = await c.post("/x", "a=1");
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].code, "WRITE_BLOCKED_READONLY");
});

test("istemci: 401'i kimlik durumuna gore siniflar", async () => {
  const m = await sahteModem((req, res) => {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="x"' });
    res.end("no");
  });
  try {
    const c = new Client({ host: "127.0.0.1", port: m.port, timeoutMs: 3000 });
    const r = await c.get("/x");
    assert.equal(r.code, 401);
    assert.equal(r.problems[0].code, "AUTH_REQUIRED");
  } finally {
    m.finishWith();
  }
});

test("istemci: kimlikli 401 AUTH_REJECTED verir", async () => {
  const m = await sahteModem((req, res) => { res.writeHead(401); res.end("no"); });
  try {
    const c = new Client({
      host: "127.0.0.1", port: m.port, timeoutMs: 3000,
      credentials: { user: "a", password: "b" },
    });
    const r = await c.get("/x");
    assert.equal(r.problems[0].code, "AUTH_REJECTED");
  } finally {
    m.finishWith();
  }
});

test("istemci: istekler SIRALI ve arali calisir (tek-baglanti kisiti)", async () => {
  let esZamanli = 0;
  let maxEsZamanli = 0;
  const zamanlar = [];
  const m = await sahteModem((req, res) => {
    esZamanli += 1;
    maxEsZamanli = Math.max(maxEsZamanli, esZamanli);
    zamanlar.push(Date.now());
    setTimeout(() => { esZamanli -= 1; res.end("{x::1}"); }, 30);
  });
  try {
    const c = new Client({ host: "127.0.0.1", port: m.port, requestGapMs: 80, timeoutMs: 3000 });
    await Promise.all([c.get("/a"), c.get("/b"), c.get("/c")]);
    assert.equal(maxEsZamanli, 1, "ayni anda birden fazla istek gitti");
    assert.ok(zamanlar[1] - zamanlar[0] >= 70, "istekler arasi bekleme uygulanmadi");
  } finally {
    m.finishWith();
  }
});

test("istemci: bos govde EMPTY_BODY uyarisi (error degil)", async () => {
  const m = await sahteModem((req, res) => res.end(""));
  try {
    const c = new Client({ host: "127.0.0.1", port: m.port, timeoutMs: 3000 });
    const r = await c.get("/bos");
    assert.equal(r.problems[0].code, "EMPTY_BODY");
    assert.equal(r.ok, true); // warning ok'u bozmaz
  } finally {
    m.finishWith();
  }
});

test("ag: OUI'den uretici tahmini", () => {
  assert.equal(guessVendor("00:0c:43:43:5f:4e"), "Ralink/MediaTek");
  assert.equal(guessVendor("00:88:6a:11:85:23"), "Ricon");
});

test("sorunlar: her kod tarif edilebilir", () => {
  for (const code of PROBLEM_CODES) {
    const p = problem(code, "x", "y");
    assert.ok(p.message && p.check, `${code} eksik`);
  }
});

test("sorunlar: bilinmeyen kod patlamaz", () => {
  const p = problem("YOK_BOYLE_KOD");
  assert.equal(p.severity, "error");
  assert.ok(p.message.includes("could not describe"));
});

test("sorunlar: warning ok'u bozmaz, error bozar", () => {
  assert.equal(isOk([{ severity: "warning" }]), true);
  assert.equal(isOk([{ severity: "error" }]), false);
});

test("rapor: sirlar ciktidan temizlenir", () => {
  const temiz = stripSecrets({ password: "gizli", x: 1, ic: { password: "p", ok: 2 } });
  assert.equal(temiz.password, undefined);
  assert.equal(temiz.ic.password, undefined);
  assert.equal(temiz.ic.ok, 2);
  assert.ok(!JSON.stringify(temiz).includes("gizli"));
});
