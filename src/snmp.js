// SNMP v2c GET — saf Node (node:dgram + elle BER kodlama).
//
// Neden ayri arac: SNMP UDP'dir, HTTP degil; dogru arac dgram. nvram yedeginde
// snmpd_rocommunity=public goruldu — sifresiz okuma acik olabilir, en zararsiz
// telemetri yolu. Harici snmpget binari YOK (Windows'ta kurulu degil), bu
// yuzden istek/cevap elle kodlanir.
//
// Kapsam: standart cihaz kimligi OID'leri. Ricon enterprise MIB'i altindaki
// hucresel OID'ler marka MIB'i bulununca eklenir.

import dgram from "node:dgram";

export const SNMP_OIDS = Object.freeze({
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysObjectID: "1.3.6.1.2.1.1.2.0",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
  sysName: "1.3.6.1.2.1.1.5.0",
});

// --- Basit BER kodlama ---

function berUzunluk(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  let x = n;
  while (x > 0) { bytes.unshift(x & 0xff); x >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function berTLV(tag, icerik) {
  return Buffer.concat([Buffer.from([tag]), berUzunluk(icerik.length), icerik]);
}

function berInteger(n) {
  const bytes = [];
  let x = n;
  do { bytes.unshift(x & 0xff); x >>= 8; } while (x > 0);
  if (bytes[0] & 0x80) bytes.unshift(0);
  return berTLV(0x02, Buffer.from(bytes));
}

function berOID(oid) {
  const parts = oid.split(".").map(Number);
  const first = 40 * parts[0] + parts[1];
  const bytes = [first];
  for (const p of parts.slice(2)) {
    if (p < 0x80) { bytes.push(p); continue; }
    const yigin = [];
    let x = p;
    while (x > 0) { yigin.unshift(x & 0x7f); x >>= 7; }
    for (let i = 0; i < yigin.length - 1; i += 1) yigin[i] |= 0x80;
    bytes.push(...yigin);
  }
  return berTLV(0x06, Buffer.from(bytes));
}

// SNMPv2c GET paketi kurar.
function getPaketi(community, oid, reqId) {
  const varbind = berTLV(0x30, Buffer.concat([berOID(oid), berTLV(0x05, Buffer.alloc(0))]));
  const varbindList = berTLV(0x30, varbind);
  const pdu = berTLV(0xa0, Buffer.concat([
    berInteger(reqId), berInteger(0), berInteger(0), varbindList,
  ]));
  return berTLV(0x30, Buffer.concat([
    berInteger(1), // version 2c = 1
    berTLV(0x04, Buffer.from(community, "latin1")),
    pdu,
  ]));
}

// Cevaptan ilk varbind degerini kabaca cikarir (metin/int). Tam BER cozumleyici
// degil — kimlik OID'leri icin yeterli; cozulemezse ham hex doner.
function valueFromResponse(buf) {
  // Son OCTET STRING (0x04) ya da OID/INTEGER'i bul: varbind sonundaki deger.
  // Basit yaklasim: pdu icindeki son TLV degerini oku.
  let i = 0;
  const oku = () => {
    const tag = buf[i]; i += 1;
    let len = buf[i]; i += 1;
    if (len & 0x80) {
      const n = len & 0x7f; len = 0;
      for (let k = 0; k < n; k += 1) { len = (len << 8) | buf[i]; i += 1; }
    }
    return { tag, len, veri: buf.subarray(i, i + len) };
  };
  try {
    oku(); // SEQUENCE
    i += 0;
    // basitlik: tum bufu tara, son OCTET STRING'i dondur
    let lastText = null;
    for (let j = 0; j < buf.length - 2; j += 1) {
      if (buf[j] === 0x04) {
        const l = buf[j + 1];
        if (l < 0x80 && j + 2 + l <= buf.length) {
          const s = buf.subarray(j + 2, j + 2 + l).toString("latin1");
          if (/^[\x20-\x7e]*$/.test(s) && s.length > (lastText?.length || 0)) lastText = s;
        }
      }
    }
    return lastText;
  } catch {
    return null;
  }
}

// Tek OID GET. Doner: { deger|null, hata|null }
export function snmpGet(host, oid, community = "public", timeout = 2500) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const reqId = Math.floor((Date.now() % 100000) + oid.length); // Date.now yasak degil burada
    const paket = getPaketi(community, oid, reqId);
    let done = false;
    const close = (result) => {
      if (done) return;
      done = true;
      try { socket.close(); } catch { /* zaten kapali */ }
      resolve(result);
    };
    const timestamp = setTimeout(() => close({ value: null, error: "timeout" }), timeout);
    socket.on("message", (msg) => {
      clearTimeout(timestamp);
      close({ value: valueFromResponse(msg), error: null });
    });
    socket.on("error", (e) => { clearTimeout(timestamp); close({ value: null, error: e.message }); });
    socket.send(paket, 161, host, (e) => {
      if (e) { clearTimeout(timestamp); close({ value: null, error: e.message }); }
    });
  });
}

// Standart kimlik OID'lerini dener. Doner: { cevapVerdi, degerler:{}, community }
export async function snmpIdentity(host, community = "public") {
  const values = Object.create(null);
  for (const [name, oid] of Object.entries(SNMP_OIDS)) {
    const r = await snmpGet(host, oid, community);
    if (r.value != null) values[name] = r.value;
  }
  return { responded: Object.keys(values).length > 0, values, community };
}
