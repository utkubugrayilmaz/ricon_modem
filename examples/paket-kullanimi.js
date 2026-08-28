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
  readMsisdn, readSimLock, assessDevice, provisionEksikleri, runConsole,
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

// 5) TEK İŞ YAPAN çağrılar. Aracın tamamını değil, sadece istediğiniz parçayı
//    kullanabilirsiniz — provizyon motoruna, sunucuya, arayüze hiç girmeden.

// 5a) "Bana sadece SIM'in telefon numarasını ver." (AT+CNUM, ~3 sn)
const numara = await readMsisdn(opts);
console.log("\ntelefon      :", numara.telefon ?? `okunamadi (${numara.yontem})`);

// 5b) "Bana sadece SIM kilidini ve KALAN HAKKI ver." Hiçbir hak harcamaz.
const kilit = await readSimLock(opts);
console.log("kilit durumu :", kilit.durum, `· kalan PIN hakki: ${kilit.pin_kalan ?? "?"}`);

// 5c) "Cihaz kurulmaya hazır mı, değilse NE eksik?" Tek çağrı, tek cevap.
//     UI ve HTTP endpoint de tam olarak bunu çağırıyor — üçü aynı karara bakar.
const durumRaporu = await assessDevice({ ...opts, fabrikaHost: host });
console.log("eksik        :", durumRaporu.eksik.length ? durumRaporu.eksik.join(", ") : "yok");
console.log("baslatilabilir:", durumRaporu.baslatilabilir);

// 5d) provisionEksikleri TAMAMEN SAF: cihaz olmadan da karar verir.
console.log("saf karar    :", provisionEksikleri({
  modemVar: true, simTakili: true, simKilit: { kilit: "pin" }, telefon: null, pin: null,
}));

// 5e) "Kendi komutumu çalıştırmak istiyorum." Konsol katmanı da dışa açık;
//     yazan komutlar yazmaIzni olmadan reddedilir (salt-okunur varsayılan).
const kabuk = await runConsole(opts, ["uname -a"]);
console.log("uname        :", (kabuk.ciktilar?.["uname -a"] ?? "").trim() || "okunamadi");

// GERÇEK yazma için: applyProvisioning({ ...opts, uygula: true, ... })
// SIM PIN kilidini KALICI kaldırmak için: simPinKaldir(opts, "1234")
//   ⚠ yanlış PIN bir deneme yakar; korumalar fonksiyonun içinde.
// Tam akış (SIM kontrolu + telefon zorunlulugu + defter) için: provisionModem()
