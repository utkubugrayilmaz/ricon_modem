// Telnet konsol katmani — modemin 5123 portundaki root shell'i.
//
// Cihazin altinda OpenWrt/Linux var (Release 21.05.4-ricon, kernel 2.6.36
// mips). Port 5123'te telnet ile root shell'e giriliyor; `nvram get/set/
// commit` calisiyor. Bu, HTML form taklidinden cok daha kesin bir otomasyon
// kanali: tek anahtara dokunur, digerlerini ezmez.
//
// GUVENLIK: varsayilan SALT OKUNUR. `nvram set/unset/commit`, `reboot`, `rm`,
// `>` gibi yazan komutlar writeAllowed acikca verilmeden reddedilir; yazma iznini
// yalnizca provizyon motoru verir. Telnet DUZ METIN'dir — parola sifresiz
// gider; sadece yerel hazirlama agi icin uygundur, sahaya/WAN'a acilmamali.
//
// Tasarim: komut CALISTIRMA (soket) ile CIKTI AYRISTIRMA (saf functions)
// ayri; ayristirma cihaz olmadan test edilebilir. Katman throw etmez.

import net from "node:net";
import { MAX_TIMER_MS } from "./settings.js";
import { problem } from "./problems.js";

const CONSOLE_PORT = 5123;
const START_MARK = "__RCN_BASLA__";
const END_MARK = "__RCN_BIT__";

// Yazan/tehlikeli komut deseni — salt-okunur modda reddedilir.
// Not: dosyaya yonlendirme (`> dosya`, `>> dosya`) yazmadir; ama `2>/dev/null`
// ve `2>&1` masum yonlendirmelerdir, onlar SERBEST — yoksa okuma komutlarimiz
// (nvram show 2>/dev/null) yanlislikla reddedilir.
const WRITE_PATTERN = /\bnvram\s+(set|unset|commit|restore)\b|\b(reboot|halt|poweroff|mtd|fw_setenv|mkfs|dd|tee|sysupgrade)\b|\brm\s|\bmv\s|\bkill\b|>\s*(?!\/dev\/null\b)[^\s&]/;

// --- Saf yardimcilar (test edilebilir) ---

// Gelen IAC (telnet) pazarligina cevap uretir: DO->WONT, WILL->DONT.
// Doner: gonderilecek bayt dizisi (Buffer) ya da bos.
export function iacReply(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 255) { // IAC
      const command = buf[i + 1];
      const option = buf[i + 2];
      if (command === 253) out.push(255, 252, option);      // DO  -> WONT
      else if (command === 251) out.push(255, 254, option); // WILL-> DONT
      i += 2;
    }
  }
  return Buffer.from(out);
}

// Komut ciktisini iki marker ARASINDAN ayiklar. Marker'lar KENDI SATIRINDA
// aranir; boylece komutun terminal ekosu (ayni satirda "echo START_MARK; ...")
// yanlislikla yakalanmaz.
export function extractOutput(raw, begin = START_MARK, endMark = END_MARK) {
  const t = (raw || "").replace(/\r/g, "");
  const b = t.match(new RegExp(`^${begin}\\s*$`, "m"));
  const e = t.match(new RegExp(`^${endMark}\\s*$`, "m"));
  if (!b || !e || e.index < b.index) return null;
  return t.slice(b.index + b[0].length, e.index).replace(/^\n+|\n+$/g, "");
}

// `nvram show` ciktisini {anahtar: deger} nesnesine cevirir. Ilk '=' ile
// bolunur (deger '=' icerebilir). Prototip guvenligi icin null-prototip.
//
// COK SATIRLI DEGERLER: bazi nvram degerleri icinde SATIR SONU tasir (kural
// listeleri, sertifika benzeri bloklar). `nvram show` bunlari oldugu gibi
// basar, yani '=' icermeyen satirlar ONCEKI anahtarin degerinin devamidir.
// Eskiden bu satirlar SESSIZCE ATILIYORDU: deger ilk satirina kirpiliyor ve
// diff "degismedi" diyebiliyordu. Bu, tum Faz 2 yontemini (diff ile anahtar
// bulma) sessizce yanlislayabilecek bir kusurdu.
//
// Dogrulama: cihazda `nvram show | wc -l` = 1587 iken biz 1585 anahtar
// ayristiriyorduk — fark tam olarak bu devam satirlariydi.
export function parseNvramShow(text) {
  const out = Object.create(null);
  let lastKey = null;
  for (const line of (text || "").split("\n")) {
    const s = line.replace(/\r$/, "");
    const i = s.indexOf("=");
    // Anahtar adi bosluk/= icermez; icermiyorsa bu bir DEVAM satiridir.
    if (i > 0 && !/[\s=]/.test(s.slice(0, i))) {
      lastKey = s.slice(0, i);
      out[lastKey] = s.slice(i + 1);
    } else if (lastKey !== null && s !== "") {
      out[lastKey] += `\n${s}`;
    }
  }
  return out;
}

// Konsol kimligini NORMALIZE eder. Iki bicim de gecerli:
//   { kullanici, sifre }              <- konsol katmaninin kendi bicimi
//   { kimlik: { kullanici, sifre } }  <- HTTP katmaninin (Client) bicimi
//
// NEDEN VAR (2026-08-28, canli olculdu): pipeline HTTP bicimini konsol
// katmanina veriyordu; login'e "undefined" gidiyor, oturum asama 2'de
// takiliyor ve 143 saniye sonra "telefon okunamadi" deniyordu. Kimse yanlis
// kod yazmamisti — iki katmanin SOZLESMESI farkliydi. Sinirda tek yerde
// normalize etmek, her cagiranin dogru sekli hatirlamasini beklemekten
// saglam: bir sonraki cagiran da yanlis sekli verse calisir.
export function consoleCredentials(opts = {}) {
  return {
    user: opts.user ?? opts.credentials?.user ?? null,
    password: opts.password ?? opts.credentials?.password ?? "",
  };
}

// --- Soket surucusu ---

const CONSOLE_RETRIES = 3;       // tek-baglantili modemde gecici timeout olur
const CONSOLE_RETRY_GAP = 2000;
const idle = (ms) => new Promise((r) => setTimeout(r, ms));

// Telnet oturumu: giris yapar, komutlari SIRAYLA calistirir. GECICI hatada
// (timeout/baglanti) yeniden giris yapip TEKRAR dener (tek-baglantili modem
// ara sira dusuyor). Yazma korumasi retry'dan once, bir kez.
// Doner: { ok, ciktilar, problems }  (throw etmez)
export async function runConsole(opts, commands) {
  // Deneme sayisi CAGRIYA GORE degisebilir. Sebep: port TARAMASI gibi "olu
  // olabilir, hizli vazgec" isleri 3x22 sn beklememeli — 5 adayla carpilinca
  // 5.5 dakika ediyordu (olculdu). Gercek komutlar varsayilan 3 denemede kalir.
  const attemptCount = Number.isInteger(opts.attempts) && opts.attempts > 0
    ? opts.attempts : CONSOLE_RETRIES;
  if (!opts.writeAllowed) {
    const writer = commands.find((k) => WRITE_PATTERN.test(k));
    if (writer) {
      return { ok: false, outs: {},
        problems: [problem("WRITE_BLOCKED_READONLY", `konsol: "${writer}"`)] };
    }
  }
  // KIMLIKSIZ DENEME YOK. Kimlik yoksa login'in tek olasi sonucu zaman
  // asimidir; 3 deneme x ~22 sn bunu degistirmez, sadece 2 dakika yer ve
  // sebebi "zaman asimi" diye gosterip GERCEK sebebi (kimlik yok) gizler.
  // Bu tam olarak 2026-08-28'de 143 saniye kaybettiren sessizlikti.
  if (!consoleCredentials(opts).user) {
    return { ok: false, outs: {},
      problems: [problem("CONSOLE_AUTH_REQUIRED", opts.host)] };
  }
  let last;
  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    last = await _trySession(opts, commands);   // her deneme = taze soket + login
    if (last.ok) return last;
    if (attempt < attemptCount - 1) await idle(CONSOLE_RETRY_GAP);
  }
  return last;   // tum denemeler basarisiz — son sonuc (problems ile)
}

// Tek telnet oturumu denemesi (bir soket, bir login, komutlar).
function _trySession(opts, commands) {
  const {
    host, sourceIp, port = CONSOLE_PORT,
    timeoutMs = 20000,
  } = opts;
  const { user, password } = consoleCredentials(opts);
  const top = Math.min(timeoutMs, MAX_TIMER_MS);

  return new Promise((resolve) => {
    const s = new net.Socket();
    let buf = "";
    const all = [];
    let stage = 0; // 0=login bekle 1=parola bekle 2=prompt bekle 3=komut gonderildi 4=bitti
    let resolved = false;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      try { s.destroy(); } catch { /* zaten kapali */ }
      resolve(result);
    };

    // Tek satirda calistirilacak toplu komut: her komut markerlar arasinda.
    const batched = commands
      .map((k) => `echo ${START_MARK}; ${k}; echo ${END_MARK}`)
      .join("; ") + "\r\n";
    const expectedEnd = commands.length;

    const timestamp = setTimeout(() => finish({
      ok: false, outs: {},
      problems: [problem("REQUEST_FAILED", `konsol ${host}:${port}`, `login/komut zaman asimi (asama ${stage})`)],
    }), top);

    s.setTimeout(top);
    const connection = { host, port };
    if (sourceIp) connection.localAddress = sourceIp;

    s.connect(connection);
    s.on("data", (d) => {
      const response = iacReply(d);
      if (response.length) s.write(response);
      const text = d.toString("latin1");
      buf += text;
      all.push(text);

      if (stage === 0 && /login:/i.test(buf)) {
        stage = 1; buf = ""; s.write(`${user}\r\n`);
      } else if (stage === 1 && /password:/i.test(buf)) {
        stage = 2; buf = ""; s.write(`${password}\r\n`);
      } else if (stage === 2 && /[#$]\s*$|@.*:.*[#$]/.test(buf)) {
        stage = 3; buf = ""; s.write(batched);
      } else if (stage === 3) {
        // Tamamlanma sinyali eko'dan BAGIMSIZ: END_MARK marker'i KENDI SATIRINDA
        // (gercek `echo END_MARK` ciktisi) kac kez gorundu? Eko satirinda marker
        // satir-ortasindadir, ^END_MARK$ ile eslesmez. Hepsi gelince biter.
        const t = all.join("").replace(/\r/g, "");
        const done = (t.match(new RegExp(`^${END_MARK}\\s*$`, "mg")) || []).length;
        if (done >= expectedEnd) { stage = 4; clearTimeout(timestamp); s.write("exit\r\n"); finish(resolveResult()); }
      }
    });
    s.on("timeout", () => finish({
      ok: false, outs: {},
      problems: [problem("REQUEST_FAILED", `konsol ${host}:${port}`, "soket zaman asimi")],
    }));
    s.on("error", (e) => { clearTimeout(timestamp); finish({
      ok: false, outs: {},
      problems: [problem("REQUEST_FAILED", `konsol ${host}:${port}`, `${e.code || e.name}: ${e.message}`)],
    }); });
    s.on("close", () => {
      if (stage >= 3) finish(resolveResult());
      else finish({ ok: false, outs: {}, problems: [problem("REQUEST_FAILED", `konsol ${host}:${port}`, `baglanti kapandi (asama ${stage})`)] });
    });

    // Toplu ciktidan her komutun ciktisini sirayla ayiklar.
    function resolveResult() {
      const full = all.join("");
      const chunks = full.split(END_MARK);
      const outs = Object.create(null);
      // Her komut icin: ilgili START_MARK...END_MARK blogunu bul. Basit ve saglam yol:
      // gercek ciktilar eko'dan SONRA gelir; komut sirasina gore son
      // 'komutlar.length' adet START_MARK...END_MARK blogunu al.
      const blocks = [];
      const re = new RegExp(`^${START_MARK}\\s*$([\\s\\S]*?)^${END_MARK}\\s*$`, "mg");
      let m;
      const t = full.replace(/\r/g, "");
      while ((m = re.exec(t)) !== null) blocks.push(m[1].replace(/^\n+|\n+$/g, ""));
      // Son N blok gercek ciktilar (ilk N eko olabilir; eko'da komut metni var
      // ama START_MARK/END_MARK kendi satirinda degil, o yuzden re zaten sadece gercekleri
      // yakalar). Yine de guvenli olsun diye son N'i aliyoruz.
      const real = blocks.slice(-commands.length);
      commands.forEach((k, i) => { outs[k] = real[i] ?? null; });
      return { ok: true, outs, problems: [] };
    }
  });
}

// Kolaylik: tam nvram'i CLI'den cekip {anahtar:deger} olarak dondurur.
export async function consoleNvram(opts) {
  const r = await runConsole(opts, ["nvram show 2>/dev/null"]);
  if (!r.ok) return { values: {}, count: 0, problems: r.problems };
  const values = parseNvramShow(r.outs["nvram show 2>/dev/null"]);
  return { values, count: Object.keys(values).length, problems: [] };
}

// Kolaylik: kimlik/sistem kesfi (salt okunur).
export async function consoleSystem(opts) {
  const commands = ["uname -a", "id", "cat /proc/uptime", "nvram show 2>/dev/null | wc -l"];
  const r = await runConsole(opts, commands);
  return { ...r, commands };
}

// nvram degeri icin guvenli tirnak (tek tirnak icinde, tek tirnaklari kacir).
export function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

// YAZMA: verilen {anahtar: deger} ciftlerini nvram'a yazar + commit eder.
// SADECE writeAllowed:true ile calisir (cagiran acikca yazma niyetini belirtir).
// Reboot BURADA YAPILMAZ (reboot baglantiyi koparir, marker tamamlanmaz);
// reboot ayri bir fire-and-forget adimdir (provizyon motoru yonetir).
// Doner: { ok, problems, yazilan:[keys_] }
export async function consoleWrite(opts, pairs) {
  const keys = Object.keys(pairs);
  if (keys.length === 0) return { ok: true, problems: [], written: [] };
  const commands = keys.map((k) => `nvram set ${k}=${shQuote(pairs[k])}`);
  commands.push("nvram commit && echo NVRAM_COMMIT_OK");
  const r = await runConsole({ ...opts, writeAllowed: true }, commands);
  const commitOk = Object.values(r.outs || {}).some((v) => (v || "").includes("NVRAM_COMMIT_OK"));
  return { ok: r.ok && commitOk, problems: r.problems, written: keys };
}
