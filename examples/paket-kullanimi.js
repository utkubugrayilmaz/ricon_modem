// ÖRNEK: çekirdeği npm paketi gibi import edip kullanmak.
//
// Gösterdiği şey: hiçbir CLI, hiçbir HTTP, hiçbir .env yok. Çekirdek
// functions `opts` alır ve sonuç nesnesi döner. Kendi projenize
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

const [host = "5.5.5.1", sourceIp = "5.5.5.100", user, password] = process.argv.slice(2);
const credentials = user ? { user, password } : null;
const opts = { host, sourceIp, credentials };

// 1) Erişim teşhisi. Throw etmez; sorun varsa problems[] içinde çözümüyle gelir.
const teshis = await checkDevice(opts);
console.log("erisilebilir :", teshis.reachable);
for (const p of teshis.problems) console.log(`  [${p.code}] ${p.message}`);
if (!teshis.reachable || !credentials) {
  console.log("\n(cihaz/kimlik yok — kalan adimlar atlandi)");
  process.exit(0);
}

// 2) Cihaz kimliği + SIM durumu. PIN kilidi cihazın kendi metninden çözülür.
const who = await readIdentity(opts);
console.log("\nICCID        :", who.iccid);
console.log("IMEI         :", who.imei);
console.log("SIM durumu   :", who.simStatus);
const status = parseSimStatus(who.simStatus);
console.log("kilit        :", status.lock ?? "yok",
  status.lock ? `(kalan PIN hakki: ${status.pinRemaining})` : "");

// 3) KURU provizyon: ne değişecek? Hiçbir şey YAZILMAZ (uygula verilmedi).
const dryRun = await applyProvisioning(opts, FIELD_PROFILE);
console.log("\ndurum        :", dryRun.status);
console.log("degisecek    :", dryRun.planObj?.changingCount ?? 0);
for (const [key, v] of Object.entries(dryRun.planObj?.changing ?? {})) {
  // settingLabel ham nvram degerini insan-okunur hale getirir (parola maskeli).
  const before = settingLabel(key, v.current);
  const after = settingLabel(key, v.target);
  console.log(`  ${before.name}: ${before.display} -> ${after.display}`);
}

// 4) planProvisioning tamamen SAF: cihaz olmadan da çalışır.
//    "Bu nvram bu profile uyuyor mu?" sorusunu offline sorabilirsiniz.
const pure = planProvisioning({ lan_ipaddr: "192.168.1.1" }, { nvram: { lan_ipaddr: "5.5.5.1" } });
console.log("\nsaf plan (cihazsiz):", Object.keys(pure.changing));

// 5) TEK İŞ YAPAN çağrılar. Aracın tamamını değil, sadece istediğiniz parçayı
//    kullanabilirsiniz — provizyon motoruna, sunucuya, arayüze hiç girmeden.

// 5a) "Bana sadece SIM'in telefon numarasını ver." (AT+CNUM, ~3 sn)
const number = await readMsisdn(opts);
console.log("\ntelefon      :", number.phone ?? `okunamadi (${number.method})`);

// 5b) "Bana sadece SIM kilidini ve KALAN HAKKI ver." Hiçbir hak harcamaz.
const lock = await readSimLock(opts);
console.log("kilit durumu :", lock.status, `· kalan PIN hakki: ${lock.pinRemaining ?? "?"}`);

// 5c) "Cihaz kurulmaya hazır mı, değilse NE eksik?" Tek çağrı, tek cevap.
//     UI ve HTTP endpoint de tam olarak bunu çağırıyor — üçü aynı karara bakar.
const durumRaporu = await assessDevice({ ...opts, factoryHost: host });
console.log("eksik        :", durumRaporu.missing.length ? durumRaporu.missing.join(", ") : "yok");
console.log("baslatilabilir:", durumRaporu.canStart);

// 5d) provisioningGaps TAMAMEN SAF: cihaz olmadan da karar verir.
console.log("saf karar    :", provisioningGaps({
  modemUp: true, simPresent: true, simLockInfo: { lock: "pin" }, phone: null, pin: null,
}));

// 5e) "Kendi komutumu çalıştırmak istiyorum." Konsol katmanı da dışa açık;
//     yazan komutlar writeAllowed olmadan reddedilir (salt-okunur varsayılan).
const shell = await runConsole(opts, ["uname -a"]);
console.log("uname        :", (shell.outs?.["uname -a"] ?? "").trim() || "okunamadi");

// GERÇEK yazma için: applyProvisioning({ ...opts, uygula: true, ... })
// SIM PIN kilidini KALICI kaldırmak için: disableSimPin(opts, "1234")
//   ⚠ yanlış PIN bir deneme yakar; korumalar fonksiyonun içinde.
// Tam akış (SIM kontrolu + telefon zorunlulugu + defter) için: provisionModem()
