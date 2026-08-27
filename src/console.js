// Telnet konsol katmani — modemin 5123 portundaki root shell'i.
//
// Cihazin altinda OpenWrt/Linux var (Release 21.05.4-ricon, kernel 2.6.36
// mips). Port 5123'te telnet ile root shell'e giriliyor; `nvram get/set/
// commit` calisiyor. Bu, HTML form taklidinden cok daha kesin bir otomasyon
// kanali: tek anahtara dokunur, digerlerini ezmez.
//
// GUVENLIK: varsayilan SALT OKUNUR. `nvram set/unset/commit`, `reboot`, `rm`,
// `>` gibi yazan komutlar yazmaIzni acikca verilmeden reddedilir; yazma iznini
// yalnizca provizyon motoru verir. Telnet DUZ METIN'dir — parola sifresiz
// gider; sadece yerel hazirlama agi icin uygundur, sahaya/WAN'a acilmamali.
//
// Tasarim: komut CALISTIRMA (soket) ile CIKTI AYRISTIRMA (saf fonksiyonlar)
// ayri; ayristirma cihaz olmadan test edilebilir. Katman throw etmez.

import net from "node:net";
import { MAX_TIMER_MS } from "./constants.js";
import { problem } from "./problems.js";

const CONSOLE_PORT = 5123;
const BASLA = "__RCN_BASLA__";
const BIT = "__RCN_BIT__";

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
      const komut = buf[i + 1];
      const opsiyon = buf[i + 2];
      if (komut === 253) out.push(255, 252, opsiyon);      // DO  -> WONT
      else if (komut === 251) out.push(255, 254, opsiyon); // WILL-> DONT
      i += 2;
    }
  }
  return Buffer.from(out);
}

// Komut ciktisini iki marker ARASINDAN ayiklar. Marker'lar KENDI SATIRINDA
// aranir; boylece komutun terminal ekosu (ayni satirda "echo BASLA; ...")
// yanlislikla yakalanmaz.
export function extractOutput(ham, basla = BASLA, bit = BIT) {
  const t = (ham || "").replace(/\r/g, "");
  const b = t.match(new RegExp(`^${basla}\\s*$`, "m"));
  const e = t.match(new RegExp(`^${bit}\\s*$`, "m"));
  if (!b || !e || e.index < b.index) return null;
  return t.slice(b.index + b[0].length, e.index).replace(/^\n+|\n+$/g, "");
}

// `nvram show` ciktisini {anahtar: deger} nesnesine cevirir. Ilk '=' ile
// bolunur (deger '=' icerebilir). Prototip guvenligi icin null-prototip.
export function parseNvramShow(metin) {
  const cikti = Object.create(null);
  for (const satir of (metin || "").split("\n")) {
    const s = satir.replace(/\r$/, "");
    if (!s) continue;
    const i = s.indexOf("=");
    if (i === -1) continue;
    cikti[s.slice(0, i)] = s.slice(i + 1);
  }
  return cikti;
}

// --- Soket surucusu ---

const CONSOLE_RETRIES = 3;       // tek-baglantili modemde gecici timeout olur
const CONSOLE_RETRY_GAP = 2000;
const beklet = (ms) => new Promise((r) => setTimeout(r, ms));

// Telnet oturumu: giris yapar, komutlari SIRAYLA calistirir. GECICI hatada
// (timeout/baglanti) yeniden giris yapip TEKRAR dener (tek-baglantili modem
// ara sira dusuyor). Yazma korumasi retry'dan once, bir kez.
// Doner: { ok, ciktilar, problems }  (throw etmez)
export async function runConsole(opts, komutlar) {
  if (!opts.yazmaIzni) {
    const yazan = komutlar.find((k) => WRITE_PATTERN.test(k));
    if (yazan) {
      return { ok: false, ciktilar: {},
        problems: [problem("WRITE_BLOCKED_READONLY", `konsol: "${yazan}"`)] };
    }
  }
  let son;
  for (let deneme = 0; deneme < CONSOLE_RETRIES; deneme += 1) {
    son = await _trySession(opts, komutlar);   // her deneme = taze soket + login
    if (son.ok) return son;
    if (deneme < CONSOLE_RETRIES - 1) await beklet(CONSOLE_RETRY_GAP);
  }
  return son;   // tum denemeler basarisiz — son sonuc (problems ile)
}

// Tek telnet oturumu denemesi (bir soket, bir login, komutlar).
function _trySession(opts, komutlar) {
  const {
    host, kaynakIp, port = CONSOLE_PORT,
    kullanici, sifre,
    zamanAsimiMs = 20000,
  } = opts;
  const ust = Math.min(zamanAsimiMs, MAX_TIMER_MS);

  return new Promise((resolve) => {
    const s = new net.Socket();
    let buf = "";
    const tumu = [];
    let asama = 0; // 0=login bekle 1=parola bekle 2=prompt bekle 3=komut gonderildi 4=bitti
    let cozuldu = false;

    const bitir = (sonuc) => {
      if (cozuldu) return;
      cozuldu = true;
      try { s.destroy(); } catch { /* zaten kapali */ }
      resolve(sonuc);
    };

    // Tek satirda calistirilacak toplu komut: her komut markerlar arasinda.
    const toplu = komutlar
      .map((k) => `echo ${BASLA}; ${k}; echo ${BIT}`)
      .join("; ") + "\r\n";
    const beklenenBit = komutlar.length;

    const zaman = setTimeout(() => bitir({
      ok: false, ciktilar: {},
      problems: [problem("REQUEST_FAILED", `konsol ${host}:${port}`, `login/komut zaman asimi (asama ${asama})`)],
    }), ust);

    s.setTimeout(ust);
    const baglanti = { host, port };
    if (kaynakIp) baglanti.localAddress = kaynakIp;

    s.connect(baglanti);
    s.on("data", (d) => {
      const yanit = iacReply(d);
      if (yanit.length) s.write(yanit);
      const metin = d.toString("latin1");
      buf += metin;
      tumu.push(metin);

      if (asama === 0 && /login:/i.test(buf)) {
        asama = 1; buf = ""; s.write(`${kullanici}\r\n`);
      } else if (asama === 1 && /password:/i.test(buf)) {
        asama = 2; buf = ""; s.write(`${sifre}\r\n`);
      } else if (asama === 2 && /[#$]\s*$|@.*:.*[#$]/.test(buf)) {
        asama = 3; buf = ""; s.write(toplu);
      } else if (asama === 3) {
        // Tamamlanma sinyali eko'dan BAGIMSIZ: BIT marker'i KENDI SATIRINDA
        // (gercek `echo BIT` ciktisi) kac kez gorundu? Eko satirinda marker
        // satir-ortasindadir, ^BIT$ ile eslesmez. Hepsi gelince biter.
        const t = tumu.join("").replace(/\r/g, "");
        const tamam = (t.match(new RegExp(`^${BIT}\\s*$`, "mg")) || []).length;
        if (tamam >= beklenenBit) { asama = 4; clearTimeout(zaman); s.write("exit\r\n"); bitir(sonucCoz()); }
      }
    });
    s.on("timeout", () => bitir({
      ok: false, ciktilar: {},
      problems: [problem("REQUEST_FAILED", `konsol ${host}:${port}`, "soket zaman asimi")],
    }));
    s.on("error", (e) => { clearTimeout(zaman); bitir({
      ok: false, ciktilar: {},
      problems: [problem("REQUEST_FAILED", `konsol ${host}:${port}`, `${e.code || e.name}: ${e.message}`)],
    }); });
    s.on("close", () => {
      if (asama >= 3) bitir(sonucCoz());
      else bitir({ ok: false, ciktilar: {}, problems: [problem("REQUEST_FAILED", `konsol ${host}:${port}`, `baglanti kapandi (asama ${asama})`)] });
    });

    // Toplu ciktidan her komutun ciktisini sirayla ayiklar.
    function sonucCoz() {
      const tam = tumu.join("");
      const parcalar = tam.split(BIT);
      const ciktilar = Object.create(null);
      // Her komut icin: ilgili BASLA...BIT blogunu bul. Basit ve saglam yol:
      // gercek ciktilar eko'dan SONRA gelir; komut sirasina gore son
      // 'komutlar.length' adet BASLA...BIT blogunu al.
      const bloklar = [];
      const re = new RegExp(`^${BASLA}\\s*$([\\s\\S]*?)^${BIT}\\s*$`, "mg");
      let m;
      const t = tam.replace(/\r/g, "");
      while ((m = re.exec(t)) !== null) bloklar.push(m[1].replace(/^\n+|\n+$/g, ""));
      // Son N blok gercek ciktilar (ilk N eko olabilir; eko'da komut metni var
      // ama BASLA/BIT kendi satirinda degil, o yuzden re zaten sadece gercekleri
      // yakalar). Yine de guvenli olsun diye son N'i aliyoruz.
      const gercek = bloklar.slice(-komutlar.length);
      komutlar.forEach((k, i) => { ciktilar[k] = gercek[i] ?? null; });
      return { ok: true, ciktilar, problems: [] };
    }
  });
}

// Kolaylik: tam nvram'i CLI'den cekip {anahtar:deger} olarak dondurur.
export async function consoleNvram(opts) {
  const r = await runConsole(opts, ["nvram show 2>/dev/null"]);
  if (!r.ok) return { degerler: {}, sayi: 0, problems: r.problems };
  const degerler = parseNvramShow(r.ciktilar["nvram show 2>/dev/null"]);
  return { degerler, sayi: Object.keys(degerler).length, problems: [] };
}

// Kolaylik: kimlik/sistem kesfi (salt okunur).
export async function consoleRecon(opts) {
  const komutlar = ["uname -a", "id", "cat /proc/uptime", "nvram show 2>/dev/null | wc -l"];
  const r = await runConsole(opts, komutlar);
  return { ...r, komutlar };
}

// nvram degeri icin guvenli tirnak (tek tirnak icinde, tek tirnaklari kacir).
export function shQuote(deger) {
  return `'${String(deger).replace(/'/g, "'\\''")}'`;
}

// YAZMA: verilen {anahtar: deger} ciftlerini nvram'a yazar + commit eder.
// SADECE yazmaIzni:true ile calisir (cagiran acikca yazma niyetini belirtir).
// Reboot BURADA YAPILMAZ (reboot baglantiyi koparir, marker tamamlanmaz);
// reboot ayri bir fire-and-forget adimdir (provizyon motoru yonetir).
// Doner: { ok, problems, yazilan:[anahtarlar] }
export async function consoleWrite(opts, ciftler) {
  const anahtarlar = Object.keys(ciftler);
  if (anahtarlar.length === 0) return { ok: true, problems: [], yazilan: [] };
  const komutlar = anahtarlar.map((k) => `nvram set ${k}=${shQuote(ciftler[k])}`);
  komutlar.push("nvram commit && echo NVRAM_COMMIT_OK");
  const r = await runConsole({ ...opts, yazmaIzni: true }, komutlar);
  const commitOk = Object.values(r.ciktilar || {}).some((v) => (v || "").includes("NVRAM_COMMIT_OK"));
  return { ok: r.ok && commitOk, problems: r.problems, yazilan: anahtarlar };
}
