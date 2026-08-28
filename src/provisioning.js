// Provizyon motoru — "istenen durum"u uygular. redbox-device felsefesi:
// çekirdek, opts alır, throw etmez, sonuç + problems[].
//
// Akış: oku → karşılaştır (planla) → SADECE farklı olanı yaz → reboot →
// yeni adreste doğrula. Idempotent: ikinci çalıştırma zararsız (fark yoksa
// yazma yok). --kuru (dry-run) varsayılan; gerçek yazma açık `uygula:true`
// ister.
//
// GÜVENLİK: yazma yalnızca uygula:true iken. LAN IP anahtarları en sona
// alınır (bağlantı kopar). Reboot açık bildirilir.

import { consoleNvram, consoleWrite, runConsole } from "./console.js";
import { LAN_IP_KEYS, WRITE_GROUPS, SIM_PIN_KEY } from "./profile.js";
import { problem, isOk } from "./problems.js";

const now = () => new Date().toISOString();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const notify = (options, m) => { if (typeof options.onProgress === "function") options.onProgress(m); };

// Yapilandirilmis olay bildirimi (UI canli guncellemesi icin). `ilerle` insana
// okunur METIN yollar; `olay` makineye NESNE yollar. Ikisi de OPSIYONEL ve
// tuketicinin isi — cekirdek hicbir yere yazmaz, sadece haber verir. Tuketici
// patlarsa provizyon akisi bozulmaz.
const emit = (options, event) => {
  if (typeof options.event !== "function") return;
  try { options.event(event); } catch { /* dinleyici hatasi akisi kesmez */ }
};

// PURE: mevcut nvram + profil -> plan. Cihaza gitmez, test edilebilir.
// Doner: { degisecek:{k:{mevcut,hedef}}, ayni:[k], eksik:[k], onceki:{k:v}, hedef:{k:v} }
// `onceki`/`hedef`: profildeki TUM anahtarlarin oncesi/hedefi — degismeyenler
// dahil. Gosterim tarafi (UI'in "kurulum oncesi" paneli) tam liste ister;
// motorun kendisi yalnizca `degisecek`i kullanir.
export function planProvisioning(mevcut, profile) {
  const willChange = {};
  const ayni = [];
  const missing = [];
  const onceki = {};
  const targets = {};
  for (const [k, targetRaw] of Object.entries(profile.nvram)) {
    const target = String(targetRaw);
    targets[k] = target;
    onceki[k] = k in mevcut ? mevcut[k] : null;
    if (!(k in mevcut)) { missing.push(k); willChange[k] = { mevcut: null, target }; continue; }
    if (mevcut[k] === target) ayni.push(k);
    else willChange[k] = { mevcut: mevcut[k], target };
  }
  return { willChange, ayni, missing, onceki, target: targets };
}

// PURE: planı YAZMA SIRASINA göre gruplar (Modem/WAN -> DHCP -> LAN).
// Gruplanmamış anahtar "Diger" grubuna düşer ve LAN'dan ÖNCE yazılır — yönetim
// adresi her zaman en sonda kalsın. Neden sıra: profile.js WRITE_GROUPS notu.
// Doner: [{ ad, ciftler:{k:{mevcut,hedef}} }]  (boş gruplar atlanır)
export function groupPlan(willChange) {
  const remaining = new Set(Object.keys(willChange));
  const groups = [];
  for (const g of WRITE_GROUPS) {
    const pairs = {};
    for (const k of g.keys) {
      if (remaining.has(k)) { pairs[k] = willChange[k]; remaining.delete(k); }
    }
    if (Object.keys(pairs).length) groups.push({ name: g.name, pairs });
  }
  if (remaining.size) {
    const pairs = {};
    for (const k of remaining) pairs[k] = willChange[k];
    const group = { name: "Diger", pairs };
    const lanSira = groups.findIndex((g) => g.name === "LAN");
    if (lanSira === -1) groups.push(group); else groups.splice(lanSira, 0, group);
  }
  return groups;
}

// Bir grup yönetim adresini (LAN IP) değiştiriyor mu?
const changesManagementAddress = (pairs) =>
  Object.keys(pairs).some((k) => LAN_IP_KEYS.includes(k));

// Provizyon: oku → planla → (uygula ise) yaz → reboot → doğrula.
// opts: { host, kaynakIp, kimlik, uygula:false, reboot:true,
//         yeniHost, yeniKaynakIp, ilerle }
// uygula=false (varsayılan): DRY-RUN — sadece plan döner, cihaza YAZMAZ.
export async function applyProvisioning(options, profile) {
  const { host, sourceIp, kimlik, apply = false, reboot = true } = options;
  const report = { timestamp: now(), command: "uygula", modemIp: host, profile: profile.name,
    apply, problems: [] };

  if (!kimlik) {
    report.problems.push(problem("AUTH_REQUIRED", "telnet 5123"));
    report.ok = false;
    return report;
  }
  const consoleOptions = { host, sourceIp, username: kimlik.username, password: kimlik.password };

  // 1) Oku
  notify(options, "nvram okunuyor");
  const { values, count, problems: readProblems } = await consoleNvram(consoleOptions);
  report.problems.push(...readProblems);
  if (count === 0) { report.ok = false; return report; }

  // 2) Planla
  const plan = planProvisioning(values, profile);
  const groups = groupPlan(plan.willChange);
  const lanAddressChanges = groups.some((g) => changesManagementAddress(g.pairs));
  report.plan = {
    willChangeCount: Object.keys(plan.willChange).length,
    ayni_sayisi: plan.ayni.length,
    willChange: plan.willChange,
    writeOrder: groups.map((g) => ({ name: g.name, key: Object.keys(g.pairs) })),
    lanIpWillChange: lanAddressChanges ? LAN_IP_KEYS.filter((k) => k in plan.willChange) : [],
    onceki: plan.onceki,
    target: plan.target,
  };
  emit(options, { kind: "plan", plan: report.plan });
  if (plan.missing.length) {
    // Profilde olup cihazda hiç olmayan anahtar — beklenmedik, uyar (yazılır
    // ama dikkat).
    report.plan.missingKeys = plan.missing;
  }

  // Değişecek bir şey yoksa: zaten istenen durumda (idempotent başarı).
  if (Object.keys(plan.willChange).length === 0) {
    report.status = "alreadyInDesiredState";
    report.ok = isOk(report.problems);
    return report;
  }

  // 3) DRY-RUN ise burada dur.
  if (!apply) {
    report.status = "kuru_calisma";
    report.not = "Hicbir sey yazilmadi. Gercek uygulama icin uygula:true (CLI: --uygula).";
    report.ok = isOk(report.problems);
    return report;
  }

  // 4) YAZ — grup grup, SIRAYLA. Yönetim adresi (LAN IP) en son grupta.
  report.writtenKeys = {};
  for (const group of groups) {
    const keys = Object.keys(group.pairs);
    notify(options, `${group.name}: ${keys.length} ayar yaziliyor`);
    emit(options, { kind: "yaziliyor", group: group.name, keys });
    const y = await consoleWrite(consoleOptions, esle(group.pairs));
    report.problems.push(...y.problems);
    report.writtenKeys[group.name] = y.writtenKeys;
    if (!y.ok) {
      // Yönetim adresi grubunda kaldıysa cihaz HALA eski adreste — sıranın
      // sebebi tam bu (bkz. profile.js WRITE_GROUPS).
      report.status = changesManagementAddress(group.pairs)
        ? "lan_yazma_hatasi" : "writeFailed";
      report.failedGroup = group.name;
      report.ok = false;
      emit(options, { kind: "writeFailed", group: group.name, keys });
      return report;
    }
    emit(options, { kind: "yazildi", group: group.name, keys: y.writtenKeys });
  }

  // 6) Reboot (config'i temiz uygula). Fire-and-forget: reboot bağlantıyı
  // koparır, cevap beklemeyiz.
  if (reboot) {
    notify(options, "reboot (config uygulaniyor)");
    emit(options, { kind: "reboot" });
    await rebootFireForget(consoleOptions);
    report.reboot_gonderildi = true;
  }

  // 7) Doğrulama: LAN IP değiştiyse cihaz yeni adreste; doğrulama için yeni
  // host/kaynak gerekir. Yoksa kullanıcıya bırak.
  const verifyHost = options.newHost || (lanAddressChanges ? profile.nvram.lan_ipaddr : host);
  const verifySource = options.newSourceIp || sourceIp;
  if (options.newHost || !lanAddressChanges) {
    notify(options, `dogrulama: ${verifyHost} bekleniyor`);
    const dog = await verify(
      { host: verifyHost, sourceIp: verifySource, kimlik }, profile, options,
    );
    report.verification = dog;
    report.status = dog.tamam ? "success" : "dogrulama_bekliyor";
    report.ok = dog.tamam && isOk(report.problems);
    emit(options, { kind: "bitti", status: report.status, ok: report.ok, verification: dog });
  } else {
    // LAN IP değişti ama yeni adres verilmedi -> PC'yi 5.5.5.x'e alıp doğrula.
    report.status = "reboot_sonrasi_dogrulama_gerek";
    report.not = `LAN IP ${profile.nvram.lan_ipaddr} yapildi + reboot edildi. `
      + `Dogrulama icin PC'ye 5.5.5.x ekleyip: uygula --yeni-host ${profile.nvram.lan_ipaddr} --kuru`;
    report.ok = isOk(report.problems);
  }
  return report;
}

// degisecek {k:{mevcut,hedef}} -> consoleWrite icin {k:hedef}
function esle(willChange) {
  const out = {};
  for (const [k, v] of Object.entries(willChange)) out[k] = v.target;
  return out;
}

// SIM PIN yazma — KOŞULLU ve TEK SEFERLİK.
//
// ⚠ TEHLİKE: bu fonksiyon çağrıldığında cihazda bir PIN denemesi harcanır.
// ÜÇ yanlış deneme SIM'i PUK kilidine sokar ve PUK olmadan geri dönüşü YOKTUR.
// Bu yüzden dört ayrı koruma var:
//   1) Yalnızca internet doğrulaması BAŞARISIZ olduysa çağrılır (pipeline
//      kararı) — kilitli olmayan SIM'e asla PIN yazılmaz.
//   2) Biçim kontrolü: 4-8 hane, sadece rakam. Bozuk PIN = garantili boşa
//      harcanmış deneme, o yüzden cihaza hiç gitmeden reddedilir.
//   3) nvram'da AYNI PIN yazılıysa TEKRAR YAZILMAZ — zaten denenmiş demektir,
//      ikinci deneme bedava değil.
//   4) Çalıştırma başına EN FAZLA BİR deneme. Retry döngüsü YOK.
//
// Değer hiçbir yere sızmaz: dönüş nesnesi, log, olay ve defter yalnızca
// "denendi mi" bilgisini taşır.
// Doner: { ok, denendi, atlandi, problems }
export async function applyPin(options, pin) {
  const { host, sourceIp, kimlik, reboot = true } = options;
  const report = { ok: false, attempted: false, skipped: null, problems: [] };
  if (!kimlik) {
    report.problems.push(problem("AUTH_REQUIRED", "telnet 5123"));
    report.skipped = "noCredentials";
    return report;
  }
  // (2) Biçim
  if (!/^\d{4,8}$/.test(String(pin ?? ""))) {
    report.problems.push(problem("PIN_INVALID"));
    report.skipped = "invalidFormat";
    return report;
  }
  const consoleOptions = { host, sourceIp, username: kimlik.username, password: kimlik.password };

  // (3) Aynı PIN zaten yazılı mı? Yazılıysa denenmiş; tekrarlamak deneme yakar.
  notify(options, "PIN kontrolu (ayni PIN daha once denenmis mi)");
  const { values, count } = await consoleNvram(consoleOptions);
  if (count === 0) {
    report.problems.push(problem("REQUEST_FAILED", "nvram", "PIN oncesi okuma basarisiz"));
    report.skipped = "nvramReadFailed";
    return report;
  }
  if (values[SIM_PIN_KEY] === String(pin)) {
    report.skipped = "samePinAlreadyStored";
    report.ok = true;   // hata değil: yapılacak bir şey yok
    return report;
  }

  // (4) Tek deneme.
  notify(options, "SIM PIN yaziliyor (TEK deneme)");
  emit(options, { kind: "pinAttempting" });
  const y = await consoleWrite(consoleOptions, { [SIM_PIN_KEY]: String(pin) });
  report.problems.push(...y.problems);
  if (!y.ok) { report.skipped = "writeFailed"; return report; }
  report.attempted = true;

  if (reboot) {
    notify(options, "reboot (PIN ile SIM yeniden baslatiliyor)");
    emit(options, { kind: "reboot" });
    await rebootFireForget(consoleOptions);
  }
  report.ok = true;
  return report;
}

// Reboot gönder, cevap bekleme (bağlantı kopar). Hata yutulur.
async function rebootFireForget(consoleOptions) {
  try {
    await runConsole({ ...consoleOptions, allowWrite: true, timeoutMs: 4000 }, ["reboot"]);
  } catch { /* reboot baglantiyi koparir; beklenen */ }
}

// Reboot sonrası cihazın gelmesini bekler + nvram'ı yeniden okuyup planın
// boşaldığını doğrular.
//
// Üç durumu AYIRIR (eskiden ilk okunabilen nvram'da karar verilirdi):
//   1) nvram okunamıyor        -> cihaz henüz gelmedi, beklemeye devam
//   2) okunuyor, eksik var     -> boot sırasında değer henüz oturmamış olabilir,
//                                 tekrar bak (aynı eksik ÜST ÜSTE 3 kez
//                                 görülürse artık oturmuştur: gerçek uyuşmazlık)
//   3) okunuyor, eksik yok     -> TAMAM
// Doner: { tamam, kalan_degisecek, bekleme_sn, sebep }
async function verify(options, profile, anaOpts) {
  const consoleOptions = { host: options.host, sourceIp: options.sourceIp,
    username: options.kimlik.username, password: options.kimlik.password };
  const maxAttempts = 20;      // ~100 sn: reboot suresinden rahat uzun
  const KARARLI_SINIR = 3;   // ayni eksik kac kez ust uste = oturmus
  let oncekiImza = null;
  let sameCounter = 0;
  let lastRemaining = null;

  for (let i = 0; i < maxAttempts; i += 1) {
    await wait(5000);
    notify(anaOpts, `dogrulama denemesi ${i + 1}/${maxAttempts}`);
    const { values, count } = await consoleNvram(consoleOptions);
    if (count === 0) {                                           // (1) gelmedi
      emit(anaOpts, { kind: "verification", attempt: i + 1, status: "waitingForDevice" });
      continue;
    }

    const remaining = Object.keys(planProvisioning(values, profile).willChange);
    if (remaining.length === 0) {                                   // (3) TAMAM
      emit(anaOpts, { kind: "dogrulandi", waitSec: (i + 1) * 5 });
      return { tamam: true, remainingChanges: [], waitSec: (i + 1) * 5 };
    }
    emit(anaOpts, { kind: "verification", attempt: i + 1, status: "oturmadi", remaining });

    lastRemaining = remaining;                                           // (2) oturmadi
    const imza = remaining.slice().sort().join(",");
    sameCounter = imza === oncekiImza ? sameCounter + 1 : 0;
    oncekiImza = imza;
    notify(anaOpts, `dogrulama: ${remaining.length} anahtar henuz oturmadi (${remaining.join(", ")})`);
    if (sameCounter + 1 >= KARARLI_SINIR) {
      return { tamam: false, remainingChanges: remaining, waitSec: (i + 1) * 5,
        reason: `ayni eksik ${KARARLI_SINIR} kez ust uste: cihaz bu degeri kabul etmiyor` };
    }
  }
  return {
    tamam: false,
    remainingChanges: lastRemaining ?? ["(cihaz reboot sonrasi gelmedi)"],
    waitSec: maxAttempts * 5,
    reason: lastRemaining ? "sure doldu, eksikler oturmadi" : "cihaz reboot sonrasi gelmedi",
  };
}
