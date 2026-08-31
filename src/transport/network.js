// Ag katmani — yerel arayuz listesi, kaynak IP secimi, MAC uretici tahmini.
//
// ARP ve IPv6 komsu tablosu okuyuculari buradaydi; onlari yalnizca `kesif`
// komutu kullaniyordu ve kesif fazi bitince ikisi de dustu. Kalan uc
// fonksiyon saf: disari komut CALISTIRMIYORLAR, yalnizca Node'un kendi
// arayuz listesine ve OUI sozlugune bakiyorlar.

import os from "node:os";
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
