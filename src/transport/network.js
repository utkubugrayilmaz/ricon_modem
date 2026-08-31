// Ag katmani — yerel arayuz/kaynak IP secimi, ARP ve IPv6 komsu tablosu.
//
// Komut CALISTIRMA ile CIKTI AYRISTIRMA bilerek ayri tutulur: ayristirma
// fonksiyonlari saf metin alir, boylece yakalanmis ciktiyla cihaz olmadan
// test edilebilir (ups_detection'da kanitlanmis disiplin).

import os from "node:os";
import { execFile } from "node:child_process";
import { OUI_VENDORS } from "../domain/constants.js";

// Verilen alt agda (or. "192.168.1.") tanimli yerel IPv4 adresini bulur.
// Kaynak IP olarak kullanilir. Doner: ip | null
export function findSourceIp(onek) {
  for (const [ad, adresler] of Object.entries(os.networkInterfaces())) {
    for (const a of adresler || []) {
      if (a.family === "IPv4" && !a.internal && a.address.startsWith(onek)) {
        return a.address;
      }
    }
  }
  return null;
}

// Tum yerel IPv4 arayuzleri (teshis icin). Doner: [{arayuz, ip, mask}]
export function localInterfaces() {
  const cikti = [];
  for (const [ad, adresler] of Object.entries(os.networkInterfaces())) {
    for (const a of adresler || []) {
      if (a.family === "IPv4" && !a.internal) {
        cikti.push({ arayuz: ad, ip: a.address, mask: a.netmask });
      }
    }
  }
  return cikti;
}

// MAC onekinden (OUI) uretici tahmini.
export function guessVendor(mac) {
  if (!mac) return null;
  const onek = mac.toLowerCase().replace(/-/g, ":").split(":").slice(0, 3).join(":");
  return OUI_VENDORS[onek] ?? null;
}

// --- Komut calistirma (throw etmez, bos metin doner) ---

function kabuk(komut, args) {
  return new Promise((resolve) => {
    execFile(komut, args, { timeout: 6000, windowsHide: true }, (err, stdout) => {
      resolve(stdout || "");
    });
  });
}

// ARP tablosunu okur ve ayristirir. Doner: { ip: mac }
export async function arpTable(onek = "") {
  const metin = await kabuk("arp", ["-a"]);
  return parseArp(metin, onek);
}

// Windows `arp -a` ciktisini ayristirir. Satir orn:
//   "  192.168.1.1           00-0c-43-43-5f-4e     dynamic"
export function parseArp(metin, onek = "") {
  const bulunan = Object.create(null);
  const desen = /(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f]{2}(?:[-:][0-9a-f]{2}){5})/gi;
  let m;
  while ((m = desen.exec(metin || "")) !== null) {
    const ip = m[1];
    if (!onek || ip.startsWith(onek)) {
      bulunan[ip] = m[2].toLowerCase().replace(/-/g, ":");
    }
  }
  return bulunan;
}

// IPv6 komsu tablosu (netsh). Cihazi IPv4 adresi olmadan da OUI ile bulmak
// icin. Doner: [{adres, mac}]
export async function ipv6Neighbors() {
  const metin = await kabuk("netsh", [
    "interface", "ipv6", "show", "neighbors",
  ]);
  return parseIpv6Neighbors(metin);
}

// netsh ipv6 komsu ciktisini ayristirir. Satir orn:
//   "fe80::1              00-0c-43-43-5f-4e   Reachable"
export function parseIpv6Neighbors(metin) {
  const cikti = [];
  const desen = /([0-9a-f:]+::[0-9a-f:]*|[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){7})\s+([0-9a-f]{2}(?:-[0-9a-f]{2}){5})/gi;
  let m;
  while ((m = desen.exec(metin || "")) !== null) {
    cikti.push({ adres: m[1], mac: m[2].toLowerCase().replace(/-/g, ":") });
  }
  return cikti;
}
