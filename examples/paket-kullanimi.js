// ÖRNEK: çekirdeği npm paketi gibi import edip kullanmak.
//
// Gösterdiği şey: hiçbir CLI, hiçbir HTTP, hiçbir .env yok. Çekirdek
// fonksiyonlar `opts` alır ve sonuç nesnesi döner. Kendi projenize
// gömerken tam olarak böyle çağırırsınız.
//
// Çalıştırmak için (cihaz gerekir):
//   node examples/paket-kullanimi.js 5.5.5.1 5.5.5.100 riconadmin PAROLA
//
// Cihaz olmadan da çalışır: erişilemez sonuç döner, throw ETMEZ.

import {
  checkDevice, readIdentity, applyProvisioning, planProvisioning,
  parseSimStatus, FIELD_PROFILE, settingLabel,
} from "../src/index.js";

const [host = "5.5.5.1", kaynakIp = "5.5.5.100", kullanici, sifre] = process.argv.slice(2);
const kimlik = kullanici ? { kullanici, sifre } : null;
const opts = { host, kaynakIp, kimlik };

// 1) Erişim teşhisi. Throw etmez; sorun varsa problems[] içinde çözümüyle gelir.
const teshis = await checkDevice(opts);
console.log("erisilebilir :", teshis.erisilebilir);
for (const p of teshis.problems) console.log(`  [${p.kod}] ${p.message}`);
if (!teshis.erisilebilir || !kimlik) {
  console.log("\n(cihaz/kimlik yok — kalan adimlar atlandi)");
  process.exit(0);
}

// 2) Cihaz kimliği + SIM durumu. PIN kilidi cihazın kendi metninden çözülür.
const kim = await readIdentity(opts);
console.log("\nICCID        :", kim.iccid);
console.log("IMEI         :", kim.imei);
console.log("SIM durumu   :", kim.sim_durumu);
const durum = parseSimStatus(kim.sim_durumu);
console.log("kilit        :", durum.kilit ?? "yok",
  durum.kilit ? `(kalan PIN hakki: ${durum.pin_kalan})` : "");

// 3) KURU provizyon: ne değişecek? Hiçbir şey YAZILMAZ (uygula verilmedi).
const kuru = await applyProvisioning(opts, FIELD_PROFILE);
console.log("\ndurum        :", kuru.durum);
console.log("degisecek    :", kuru.plan?.degisecek_sayisi ?? 0);
for (const [anahtar, v] of Object.entries(kuru.plan?.degisecek ?? {})) {
  // settingLabel ham nvram degerini insan-okunur hale getirir (parola maskeli).
  const once = settingLabel(anahtar, v.mevcut);
  const sonra = settingLabel(anahtar, v.hedef);
  console.log(`  ${once.ad}: ${once.gosterim} -> ${sonra.gosterim}`);
}

// 4) planProvisioning tamamen SAF: cihaz olmadan da çalışır.
//    "Bu nvram bu profile uyuyor mu?" sorusunu offline sorabilirsiniz.
const saf = planProvisioning({ lan_ipaddr: "192.168.1.1" }, { nvram: { lan_ipaddr: "5.5.5.1" } });
console.log("\nsaf plan (cihazsiz):", Object.keys(saf.degisecek));

// GERÇEK yazma için: applyProvisioning({ ...opts, uygula: true, ... })
// Tam akış (SIM kontrolu + telefon zorunlulugu + defter) için: provisionModem()
