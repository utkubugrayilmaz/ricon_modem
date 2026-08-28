// Ag katmani — yerel arayuz/kaynak IP secimi, ARP ve IPv6 komsu tablosu.
//
// Komut CALISTIRMA ile CIKTI AYRISTIRMA bilerek ayri tutulur: ayristirma
// fonksiyonlari saf metin alir, boylece yakalanmis ciktiyla cihaz olmadan
// test edilebilir (ups_detection'da kanitlanmis disiplin).

import os from "node:os";
import { execFile } from "node:child_process";
import { OUI_VENDORS } from "./constants.js";

// Verilen alt agda (or. "192.168.1.") tanimli yerel IPv4 adresini bulur.
// Kaynak IP olarak kullanilir. Doner: ip | null
export function findSourceIp(prefix) {
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const a of addresses || []) {
      if (a.family === "IPv4" && !a.internal && a.address.startsWith(prefix)) {
        return a.address;
      }
    }
  }
  return null;
}

// Tum yerel IPv4 arayuzleri (teshis icin). Doner: [{arayuz, ip, mask}]
export function localInterfaces() {
  const output = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const a of addresses || []) {
      if (a.family === "IPv4" && !a.internal) {
        output.push({ iface: name, ip: a.address, mask: a.netmask });
      }
    }
  }
  return output;
}

// MAC onekinden (OUI) uretici tahmini.
export function guessVendor(mac) {
  if (!mac) return null;
  const prefix = mac.toLowerCase().replace(/-/g, ":").split(":").slice(0, 3).join(":");
  return OUI_VENDORS[prefix] ?? null;
}

// --- Komut calistirma (throw etmez, bos metin doner) ---

function shell(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 6000, windowsHide: true }, (err, stdout) => {
      resolve(stdout || "");
    });
  });
}

// ARP tablosunu okur ve ayristirir. Doner: { ip: mac }
export async function arpTable(prefix = "") {
  const text = await shell("arp", ["-a"]);
  return parseArp(text, prefix);
}

// Windows `arp -a` ciktisini ayristirir. Satir orn:
//   "  192.168.1.1           00-0c-43-43-5f-4e     dynamic"
export function parseArp(text, prefix = "") {
  const found = Object.create(null);
  const pattern = /(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f]{2}(?:[-:][0-9a-f]{2}){5})/gi;
  let m;
  while ((m = pattern.exec(text || "")) !== null) {
    const ip = m[1];
    if (!prefix || ip.startsWith(prefix)) {
      found[ip] = m[2].toLowerCase().replace(/-/g, ":");
    }
  }
  return found;
}

// IPv6 komsu tablosu (netsh). Cihazi IPv4 adresi olmadan da OUI ile bulmak
// icin. Doner: [{adres, mac}]
export async function ipv6Neighbors() {
  const text = await shell("netsh", [
    "interface", "ipv6", "show", "neighbors",
  ]);
  return parseIpv6Neighbors(text);
}

// netsh ipv6 komsu ciktisini ayristirir. Satir orn:
//   "fe80::1              00-0c-43-43-5f-4e   Reachable"
export function parseIpv6Neighbors(text) {
  const output = [];
  const pattern = /([0-9a-f:]+::[0-9a-f:]*|[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){7})\s+([0-9a-f]{2}(?:-[0-9a-f]{2}){5})/gi;
  let m;
  while ((m = pattern.exec(text || "")) !== null) {
    output.push({ address: m[1], mac: m[2].toLowerCase().replace(/-/g, ":") });
  }
  return output;
}
