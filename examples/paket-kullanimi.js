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
  readMsisdn, readSimLock, assessDevice, provisioningGaps, runConsole,
} from "../src/index.js";

const [host = "5.5.5.1", sourceIp = "5.5.5.100", username, password] = process.argv.slice(2);
const credentials = username ? { username, password } : null;
const options = { host, sourceIp, credentials };

// 1) Erişim teşhisi. Throw etmez; sorun varsa problems[] içinde çözümüyle gelir.
const teshis = await checkDevice(options);
console.log("erisilebilir :", teshis.erisilebilir);
for (const p of teshis.problems) console.log(`  [${p.code}] ${p.message}`);
if (!teshis.erisilebilir || !credentials) {
  console.log("\n(cihaz/kimlik yok — kalan adimlar atlandi)");
  process.exit(0);
}

// 2) Cihaz kimliği + SIM durumu. PIN kilidi cihazın kendi metninden çözülür.
const kim = await readIdentity(options);
console.log("\nICCID        :", kim.iccid);
console.log("IMEI         :", kim.imei);
console.log("SIM durumu   :", kim.simStatus);
const status = parseSimStatus(kim.simStatus);
console.log("kilit        :", status.lock ?? "none",
  status.lock ? `(kalan PIN hakki: ${status.pinRemaining})` : "");

// 3) KURU provizyon: ne değişecek? Hiçbir şey YAZILMAZ (uygula verilmedi).
const dryRun = await applyProvisioning(options, FIELD_PROFILE);
console.log("\ndurum        :", dryRun.status);
console.log("degisecek    :", dryRun.plan?.willChangeCount ?? 0);
for (const [key, v] of Object.entries(dryRun.plan?.willChange ?? {})) {
  // settingLabel ham nvram degerini insan-okunur hale getirir (parola maskeli).
  const before = settingLabel(key, v.mevcut);
  const after = settingLabel(key, v.target);
  console.log(`  ${before.name}: ${before.gosterim} -> ${after.gosterim}`);
}

// 4) planProvisioning tamamen SAF: cihaz olmadan da çalışır.
//    "Bu nvram bu profile uyuyor mu?" sorusunu offline sorabilirsiniz.
const saf = planProvisioning({ lan_ipaddr: "192.168.1.1" }, { nvram: { lan_ipaddr: "5.5.5.1" } });
console.log("\nsaf plan (cihazsiz):", Object.keys(saf.willChange));

// 5) TEK İŞ YAPAN çağrılar. Aracın tamamını değil, sadece istediğiniz parçayı
//    kullanabilirsiniz — provizyon motoruna, sunucuya, arayüze hiç girmeden.

// 5a) "Bana sadece SIM'in telefon numarasını ver." (AT+CNUM, ~3 sn)
const number = await readMsisdn(options);
console.log("\ntelefon      :", number.phone ?? `okunamadi (${number.method})`);

// 5b) "Bana sadece SIM kilidini ve KALAN HAKKI ver." Hiçbir hak harcamaz.
const lock = await readSimLock(options);
console.log("kilit durumu :", lock.status, `· kalan PIN hakki: ${lock.pinRemaining ?? "?"}`);

// 5c) "Cihaz kurulmaya hazır mı, değilse NE eksik?" Tek çağrı, tek cevap.
//     UI ve HTTP endpoint de tam olarak bunu çağırıyor — üçü aynı karara bakar.
const durumRaporu = await assessDevice({ ...options, factoryHost: host });
console.log("eksik        :", durumRaporu.missing.length ? durumRaporu.missing.join(", ") : "none");
console.log("baslatilabilir:", durumRaporu.canStart);

// 5d) provisionEksikleri TAMAMEN SAF: cihaz olmadan da karar verir.
console.log("saf karar    :", provisioningGaps({
  modemPresent: true, simPresent: true, simLock: { lock: "pin" }, phone: null, pin: null,
}));

// 5e) "Kendi komutumu çalıştırmak istiyorum." Konsol katmanı da dışa açık;
//     yazan komutlar yazmaIzni olmadan reddedilir (salt-okunur varsayılan).
const shell = await runConsole(options, ["uname -a"]);
console.log("uname        :", (shell.outputs?.["uname -a"] ?? "").trim() || "okunamadi");

// GERÇEK yazma için: applyProvisioning({ ...opts, uygula: true, ... })
// SIM PIN kilidini KALICI kaldırmak için: simPinKaldir(opts, "1234")
//   ⚠ yanlış PIN bir deneme yakar; korumalar fonksiyonun içinde.
// Tam akış (SIM kontrolu + telefon zorunlulugu + defter) için: provisionModem()
