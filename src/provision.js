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
import { LAN_IP_KEYS, WRITE_GROUPS, SIM_PIN_KEY } from "./settings.js";
import { problem, isOk } from "./problems.js";
import { isReachable } from "./net.js";

const now = () => new Date().toISOString();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const notify = (opts, m) => { if (typeof opts.progress === "function") opts.progress(m); };

// Yapilandirilmis olay bildirimi (UI canli guncellemesi icin). `ilerle` insana
// okunur METIN yollar; `olay` makineye NESNE yollar. Ikisi de OPSIYONEL ve
// tuketicinin isi — cekirdek hicbir yere yazmaz, sadece haber verir. Tuketici
// patlarsa provizyon akisi bozulmaz.
const emitEvent = (opts, event) => {
  if (typeof opts.event !== "function") return;
  try { opts.event(event); } catch { /* dinleyici hatasi akisi kesmez */ }
};

// PURE: mevcut nvram + profil -> plan. Cihaza gitmez, test edilebilir.
// Doner: { degisecek:{k:{mevcut,hedef}}, ayni:[k], eksik:[k], onceki:{k:v}, hedef:{k:v} }
// `onceki`/`hedef`: profildeki TUM anahtarlarin oncesi/hedefi — degismeyenler
// dahil. Gosterim tarafi (UI'in "kurulum oncesi" paneli) tam liste ister;
// motorun kendisi yalnizca `degisecek`i kullanir.
export function planProvisioning(current, profile) {
  const changing = {};
  const unchanged = [];
  const missing = [];
  const before = {};
  const targets = {};
  for (const [k, targetRaw] of Object.entries(profile.nvram)) {
    const target = String(targetRaw);
    targets[k] = target;
    before[k] = k in current ? current[k] : null;
    if (!(k in current)) { missing.push(k); changing[k] = { current: null, target }; continue; }
    if (current[k] === target) unchanged.push(k);
    else changing[k] = { current: current[k], target };
  }
  return { changing, unchanged, missing, before, target: targets };
}

// PURE: planı YAZMA SIRASINA göre gruplar (Modem/WAN -> DHCP -> LAN).
// Gruplanmamış anahtar "Other" grubuna düşer ve LAN'dan ÖNCE yazılır — yönetim
// adresi her zaman en sonda kalsın. Neden sıra: profile.js WRITE_GROUPS notu.
// Doner: [{ ad, ciftler:{k:{mevcut,hedef}} }]  (boş gruplar atlanır)
export function groupPlan(changing) {
  const remaining = new Set(Object.keys(changing));
  const groups = [];
  for (const g of WRITE_GROUPS) {
    const pairs = {};
    for (const k of g.keys) {
      if (remaining.has(k)) { pairs[k] = changing[k]; remaining.delete(k); }
    }
    if (Object.keys(pairs).length) groups.push({ name: g.name, pairs });
  }
  if (remaining.size) {
    const pairs = {};
    for (const k of remaining) pairs[k] = changing[k];
    const group = { name: "Other", pairs };
    const lanOrder = groups.findIndex((g) => g.name === "LAN");
    if (lanOrder === -1) groups.push(group); else groups.splice(lanOrder, 0, group);
  }
  return groups;
}

// Bir grup yönetim adresini (LAN IP) değiştiriyor mu?
const changesManagementAddress = (pairs) =>
  Object.keys(pairs).some((k) => LAN_IP_KEYS.includes(k));

// Provizyon: oku → planla → (uygula ise) yaz → reboot → doğrula.
// opts: { host, sourceIp, kimlik, uygula:false, reboot:true,
//         newHost, newSourceIp, ilerle }
// uygula=false (varsayılan): DRY-RUN — sadece plan döner, cihaza YAZMAZ.
export async function applyProvisioning(opts, profile) {
  const { host, sourceIp, credentials, apply = false, reboot = true } = opts;
  const report = { timestamp: now(), command: "uygula", modemIp: host, profile: profile.name,
    apply, problems: [] };

  if (!credentials) {
    report.problems.push(problem("AUTH_REQUIRED", "telnet 5123"));
    report.ok = false;
    return report;
  }
  const consoleOptions = { host, sourceIp, user: credentials.user, password: credentials.password };

  // 1) Oku
  notify(opts, "nvram okunuyor");
  const { values, count, problems: readProblem } = await consoleNvram(consoleOptions);
  report.problems.push(...readProblem);
  if (count === 0) { report.ok = false; return report; }

  // 2) Planla
  const planObj = planProvisioning(values, profile);
  const groups = groupPlan(planObj.changing);
  const lanChanging = groups.some((g) => changesManagementAddress(g.pairs));
  report.planObj = {
    changingCount: Object.keys(planObj.changing).length,
    unchangedCount: planObj.unchanged.length,
    changing: planObj.changing,
    writeOrder: groups.map((g) => ({ name: g.name, key: Object.keys(g.pairs) })),
    lanIpChanging: lanChanging ? LAN_IP_KEYS.filter((k) => k in planObj.changing) : [],
    before: planObj.before,
    target: planObj.target,
  };
  emitEvent(opts, { kind: "plan", planObj: report.planObj });
  if (planObj.missing.length) {
    // Profilde olup cihazda hiç olmayan anahtar — beklenmedik, uyar (yazılır
    // ama dikkat).
    report.planObj.missingKeys = planObj.missing;
  }

  // Değişecek bir şey yoksa: zaten istenen durumda (idempotent başarı).
  if (Object.keys(planObj.changing).length === 0) {
    report.status = "already_desired";
    report.ok = isOk(report.problems);
    return report;
  }

  // 3) DRY-RUN ise burada dur.
  if (!apply) {
    report.status = "dry_run";
    report.note = "Hicbir sey yazilmadi. Gercek uygulama icin uygula:true (CLI: --uygula).";
    report.ok = isOk(report.problems);
    return report;
  }

  // 4) YAZ — grup grup, SIRAYLA. Yönetim adresi (LAN IP) en son grupta.
  report.written = {};
  for (const group of groups) {
    const keys = Object.keys(group.pairs);
    notify(opts, `${group.name}: ${keys.length} ayar yaziliyor`);
    emitEvent(opts, { kind: "writing", group: group.name, keys });
    const y = await consoleWrite(consoleOptions, match(group.pairs));
    report.problems.push(...y.problems);
    report.written[group.name] = y.written;
    if (!y.ok) {
      // Yönetim adresi grubunda kaldıysa cihaz HALA eski adreste — sıranın
      // sebebi tam bu (bkz. profile.js WRITE_GROUPS).
      report.status = changesManagementAddress(group.pairs)
        ? "lan_write_error" : "write_error";
      report.failedGroup = group.name;
      report.ok = false;
      emitEvent(opts, { kind: "write_error", group: group.name, keys });
      return report;
    }
    emitEvent(opts, { kind: "written", group: group.name, keys: y.written });
  }

  // 6) Reboot (config'i temiz uygula). Fire-and-forget: reboot bağlantıyı
  // koparır, cevap beklemeyiz.
  if (reboot) {
    notify(opts, "reboot (config uygulaniyor)");
    emitEvent(opts, { kind: "reboot" });
    await rebootFireForget(consoleOptions);
    report.rebootSent = true;
  }

  // 7) Doğrulama: LAN IP değiştiyse cihaz yeni adreste; doğrulama için yeni
  // host/kaynak gerekir. Yoksa kullanıcıya bırak.
  const verifyHost = opts.newHost || (lanChanging ? profile.nvram.lan_ipaddr : host);
  const verifySource = opts.newSourceIp || sourceIp;
  if (opts.newHost || !lanChanging) {
    notify(opts, `dogrulama: ${verifyHost} bekleniyor`);
    const verify = await verifyPlanSettled(
      { host: verifyHost, sourceIp: verifySource, credentials }, profile, opts,
      report.rebootSent === true,
    );
    report.verification = verify;
    report.status = verify.done ? "success" : "verify_pending";
    report.ok = verify.done && isOk(report.problems);
    emitEvent(opts, { kind: "done", status: report.status, ok: report.ok, verification: verify });
  } else {
    // LAN IP değişti ama yeni adres verilmedi -> PC'yi 5.5.5.x'e alıp doğrula.
    report.status = "verify_after_reboot";
    report.note = `LAN IP ${profile.nvram.lan_ipaddr} yapildi + reboot edildi. `
      + `Dogrulama icin PC'ye 5.5.5.x ekleyip: uygula --yeni-host ${profile.nvram.lan_ipaddr} --kuru`;
    report.ok = isOk(report.problems);
  }
  return report;
}

// degisecek {k:{mevcut,hedef}} -> consoleWrite icin {k:hedef}
function match(changing) {
  const out = {};
  for (const [k, v] of Object.entries(changing)) out[k] = v.target;
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
export async function applyPin(opts, pin) {
  const { host, sourceIp, credentials, reboot = true } = opts;
  const report = { ok: false, attempted: false, skipped: null, problems: [] };
  if (!credentials) {
    report.problems.push(problem("AUTH_REQUIRED", "telnet 5123"));
    report.skipped = "no_identity";
    return report;
  }
  // (2) Biçim
  if (!/^\d{4,8}$/.test(String(pin ?? ""))) {
    report.problems.push(problem("PIN_INVALID"));
    report.skipped = "invalid_format";
    return report;
  }
  const consoleOptions = { host, sourceIp, user: credentials.user, password: credentials.password };

  // (3) Aynı PIN zaten yazılı mı? Yazılıysa denenmiş; tekrarlamak deneme yakar.
  notify(opts, "PIN kontrolu (ayni PIN daha once denenmis mi)");
  const { values, count } = await consoleNvram(consoleOptions);
  if (count === 0) {
    report.problems.push(problem("REQUEST_FAILED", "nvram", "PIN oncesi okuma basarisiz"));
    report.skipped = "nvram_unreadable";
    return report;
  }
  if (values[SIM_PIN_KEY] === String(pin)) {
    report.skipped = "pin_already_set";
    report.ok = true;   // hata değil: yapılacak bir şey yok
    return report;
  }

  // (4) Tek deneme.
  notify(opts, "SIM PIN yaziliyor (TEK deneme)");
  emitEvent(opts, { kind: "pin_attempt" });
  const y = await consoleWrite(consoleOptions, { [SIM_PIN_KEY]: String(pin) });
  report.problems.push(...y.problems);
  if (!y.ok) { report.skipped = "write_error"; return report; }
  report.attempted = true;

  if (reboot) {
    notify(opts, "reboot (PIN ile SIM yeniden baslatiliyor)");
    emitEvent(opts, { kind: "reboot" });
    await rebootFireForget(consoleOptions);
  }
  report.ok = true;
  return report;
}

// Reboot gönder, cevap bekleme (bağlantı kopar). Hata yutulur.
async function rebootFireForget(consoleOptions) {
  try {
    await runConsole({ ...consoleOptions, writeAllowed: true, timeoutMs: 4000 }, ["reboot"]);
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
// Doner: { tamam, stillChanging, waitedSec, sebep }
async function verifyPlanSettled(opts, profile, mainOptions, rebootWasSent = false) {
  const consoleOptions = { host: opts.host, sourceIp: opts.sourceIp,
    user: opts.credentials.user, password: opts.credentials.password };
  const UPPER_BOUND_MS = 100000;   // reboot suresinden rahat uzun
  const POLL_GAP_MS = 1000;        // canlilik yoklamasi artik bedava (bkz. asagi)
  const STABLE_ROUNDS = 3;       // ayni eksik en az kac kez ust uste
  const STABLE_WINDOW_MS = 10000; // ...VE en az bu kadar surdu = artik oturmaz
  const t0 = Date.now();
  const elapsedSec = () => Math.round((Date.now() - t0) / 1000);
  let previousSignature = null;
  let sameCount = 0;
  let signatureStart = 0;
  let lastRemaining = null;
  let attempt = 0;
  // Reboot gonderildiyse cihazi bir kez DUSMUS gormeden "verified" demeyiz:
  // LAN IP degismeyen (idempotent) durumda cihaz reboot komutundan sonra bir
  // sure daha ayakta kalir ve o oturumdan okunan nvram "yeni durum" sayilirdi.
  // Eskiden bunu dongu basindaki kor 5 sn ortuyordu.
  let wentDown = !rebootWasSent;
  const DROP_TOLERANCE_MS = 12000;   // hic dusmezse (reboot yutulduysa) devam et

  // ONCE UCUZ YOKLAMA, SONRA PAHALI OKUMA.
  //
  // Eskiden dongu her turda 5 sn KOR bekliyor, sonra cihaz gelmemis olsa bile
  // tam nvram dokumu deniyordu; basarisiz telnet retry'leriyle her tur ~4 sn
  // daha yiyordu. Olculen sonuc: 30 sn'de geri gelen cihaz icin 33.8 sn.
  //
  // Artik isReachable neredeyse bedava (2 port, paralel, banner beklemesi yok)
  // — saniyede bir yoklayip cihaz TCP'ye cevap verdigi anda nvram'a gidiyoruz.
  // Reboot suresi cihazin kendi isi; kazanc yoklama granulasyonundan geliyor.
  while (Date.now() - t0 < UPPER_BOUND_MS) {
    // Kaynak IP yoksa yoklama guvenilir degil (bkz. scanner.js uyarisi):
    // o durumda gecidi atla, dogrudan konsola git — eski davranis.
    const up = opts.sourceIp ? await isReachable(opts.host, opts.sourceIp) : true;
    if (!up) {
      wentDown = true;
      emitEvent(mainOptions, { kind: "verifying", attempt: attempt + 1, status: "waiting_device" });
      await wait(POLL_GAP_MS);
      continue;
    }
    if (!wentDown && Date.now() - t0 < DROP_TOLERANCE_MS) {
      emitEvent(mainOptions, { kind: "verifying", attempt: attempt + 1, status: "waiting_reboot" });
      await wait(POLL_GAP_MS);
      continue;
    }
    attempt += 1;
    notify(mainOptions, `dogrulama denemesi ${attempt} (${elapsedSec()} sn)`);
    const { values, count } = await consoleNvram(consoleOptions);
    if (count === 0) {                       // TCP acik ama konsol henuz hazir degil
      emitEvent(mainOptions, { kind: "verifying", attempt, status: "waiting_device" });
      await wait(POLL_GAP_MS);
      continue;
    }

    const remaining = Object.keys(planProvisioning(values, profile).changing);
    if (remaining.length === 0) {                                   // (3) TAMAM
      emitEvent(mainOptions, { kind: "verified", waitedSec: elapsedSec() });
      return { done: true, stillChanging: [], waitedSec: elapsedSec() };
    }
    emitEvent(mainOptions, { kind: "verifying", attempt, status: "not_settled", remaining });

    lastRemaining = remaining;                                           // (2) oturmadi
    const signature = remaining.slice().sort().join(",");
    if (signature === previousSignature) { sameCount += 1; } else { sameCount = 0; signatureStart = Date.now(); }
    previousSignature = signature;
    notify(mainOptions, `dogrulama: ${remaining.length} anahtar henuz oturmadi (${remaining.join(", ")})`);
    if (sameCount + 1 >= STABLE_ROUNDS && Date.now() - signatureStart >= STABLE_WINDOW_MS) {
      return { done: false, stillChanging: remaining, waitedSec: elapsedSec(),
        reason: `ayni eksik ${STABLE_ROUNDS} kez ust uste: cihaz bu degeri kabul etmiyor` };
    }
    await wait(POLL_GAP_MS);   // deger boot sirasinda oturabilir; kisa nefes
  }
  return {
    done: false,
    stillChanging: lastRemaining ?? ["(cihaz reboot sonrasi gelmedi)"],
    waitedSec: elapsedSec(),
    reason: lastRemaining ? "sure doldu, eksikler oturmadi" : "cihaz reboot sonrasi gelmedi",
  };
}
