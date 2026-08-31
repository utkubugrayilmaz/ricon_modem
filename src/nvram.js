// nvram tam yedegi ayristiricisi — cihazin "her seyi".
//
// /nvrambak.bin ikili bir dosya (2026-08-26 canli cihazdan, 28419 bayt,
// 1546 anahtar). Format:
//   "ROUTER" sihirli imza (6 bayt) + 6 bayt basluk (toplam 12)
//   ardindan tekrar eden kayit: [1b anahtar_uzunlugu][anahtar]
//                               [2b deger_uzunlugu LE][deger]
//
// Bu cihazin TUM yapilandirmasi burada: wl_* (WiFi), dtu_* (IP Modem),
// ddns_*, ipsec_*, openvpn*, snmpd_*, et0macaddr, ... Faz 2/3'te "bir ayar
// hangi anahtari degistirir" sorusunun kesin cevabi iki yedegin farkidir.

import { problem } from "./problems.js";

const SIGNATURE = "ROUTER";

// Ikili yedegi {anahtar: deger} nesnesine cevirir.
// Doner: { degerler, sayi, problems }  (throw etmez)
export function parseNvram(buf) {
  const problems = [];
  const values = Object.create(null);

  if (!buf || buf.length < SIGNATURE.length ||
      buf.subarray(0, SIGNATURE.length).toString("latin1") !== SIGNATURE) {
    problems.push(problem("NVRAM_BAD_HEADER"));
    return { values, finiteOrNull: 0, problems };
  }

  // Basluk boyutu firmware'e gore degisebilir; imza sonrasindan itibaren
  // dosya sonuna KADAR temiz ayrisan ilk offset'i bul (6..16 araligi).
  const start = findStart(buf);
  if (start === -1) {
    problems.push(problem("NVRAM_BAD_HEADER"));
    return { values, finiteOrNull: 0, problems };
  }

  let off = start;
  let finiteOrNull = 0;
  while (off < buf.length) {
    const kl = buf.readUInt8(off); off += 1;
    const key = buf.subarray(off, off + kl).toString("latin1"); off += kl;
    const vl = buf.readUInt16LE(off); off += 2;
    const val = buf.subarray(off, off + vl).toString("latin1"); off += vl;
    values[key] = val;
    finiteOrNull += 1;
  }
  return { values, finiteOrNull, problems };
}

// Imzadan sonra, dosya sonuna tam oturan ve anahtarlari ASCII olan offset.
function findStart(buf) {
  for (let start = SIGNATURE.length; start <= SIGNATURE.length + 10; start += 1) {
    if (parsesCleanly(buf, start)) return start;
  }
  return -1;
}

function parsesCleanly(buf, start) {
  let off = start;
  let n = 0;
  while (off < buf.length) {
    if (off + 1 > buf.length) return false;
    const kl = buf.readUInt8(off); off += 1;
    if (off + kl > buf.length) return false;
    const key = buf.subarray(off, off + kl).toString("latin1"); off += kl;
    if (kl > 0 && !/^[\x20-\x7e]+$/.test(key)) return false;
    if (off + 2 > buf.length) return false;
    const vl = buf.readUInt16LE(off); off += 2;
    if (off + vl > buf.length) return false;
    off += vl;
    n += 1;
  }
  return off === buf.length && n > 0;
}

// Iki nvram dokumunun farki — Faz 2/3 icin. Doner:
//   { eklenen:{k:v}, silinen:{k:v}, degisen:{k:{eski,yeni}} }
export function diffNvram(previous, next) {
  const added = Object.create(null);
  const removed = Object.create(null);
  const changed = Object.create(null);
  for (const k of Object.keys(next)) {
    if (!(k in previous)) added[k] = next[k];
    else if (previous[k] !== next[k]) changed[k] = { previous: previous[k], next: next[k] };
  }
  for (const k of Object.keys(previous)) {
    if (!(k in next)) removed[k] = previous[k];
  }
  return { added, removed, changed };
}

// Zaman damgasi — sonuc nesnesi "bu okuma ne zaman yapildi" tasir.
const now = () => new Date().toISOString();

// --- fark: iki nvram nesnesini karsilastir (saf, cihaza gitmez) ---
export function computeNvramDiff(before, after) {
  const f = diffNvram(before, after);
  return {
    timestamp: now(), command: "fark",
    changed: f.changed, added: f.added, removed: f.removed,
    summary: {
      changed: Object.keys(f.changed).length,
      added: Object.keys(f.added).length,
      removed: Object.keys(f.removed).length,
    },
    ok: true, problems: [],
  };
}
