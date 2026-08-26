// Tak-çalıştır pipeline — tam otomatik hazırlama orkestrasyonu.
// redbox-device felsefesi: çekirdek, opts alır, throw etmez, sonuç + problems[].
//
// Akış (bir modem): algıla (fabrika 192.168.1.1 mi, saha 5.5.5.1 mi, yok mu)
// → gerekirse provizyon (idempotent, LAN sonda, reboot, yeni adreste doğrula)
// → BAŞARIYA KADAR tekrar (retry) → net sonuç.
//
// Döngü (çok modem): PC ön-kontrol → [modem bekle → hazırla → sinyal →
// çıkarılmasını bekle] tekrar. Operatör için "tak → hazır → çıkar → sıradaki".
//
// PC ağ notu: PC'de 192.168.1.x VE 5.5.5.x ikincil IP'leri KALICI dururken
// ağ değiştirmeye gerek yok — araç öncesi/sonrası doğru kaynaktan gider.

import { isReachable } from "./scanner.js";
import { findSourceIp } from "./network.js";
import { applyProvisioning } from "./provisioning.js";
import { problem } from "./problems.js";

const now = () => new Date().toISOString();
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const bildir = (opts, m) => { if (typeof opts.ilerle === "function") opts.ilerle(m); };

// PURE: konum + dry-run durumuna göre sıradaki eylem. Test edilebilir.
// Doner: "zaten_hazir" | "provizyon_fabrika" | "provizyon_saha" | "modem_yok"
export function nextAction(fabrikaVar, sahaVar, sahaDryRunDurum) {
  if (sahaVar && sahaDryRunDurum === "zaten_istenen_durumda") return "zaten_hazir";
  if (sahaVar) return "provizyon_saha";   // saha adresinde ama eksik provizyon
  if (fabrikaVar) return "provizyon_fabrika";
  return "modem_yok";
}

// Bir modemi hazırlar (algıla → provizyon → doğrula → retry).
// opts: { fabrikaHost, fabrikaKaynak, sahaHost, sahaKaynak, kimlik, profil,
//         denemeler=3, ilerle }
export async function provisionModem(opts) {
  const {
    fabrikaHost = "192.168.1.1", fabrikaKaynak,
    sahaHost = "5.5.5.1", sahaKaynak,
    kimlik, profil, denemeler = 3,
  } = opts;
  const rapor = { zaman: now(), komut: "hazirla", problems: [] };

  if (!kimlik) {
    rapor.problems.push(problem("AUTH_REQUIRED", "modem"));
    rapor.durum = "kimlik_yok"; rapor.ok = false; return rapor;
  }

  for (let deneme = 1; deneme <= denemeler; deneme += 1) {
    bildir(opts, `deneme ${deneme}/${denemeler}: modem algilaniyor`);
    const fabrikaVar = await isReachable(fabrikaHost, fabrikaKaynak);
    const sahaVar = fabrikaVar ? false : await isReachable(sahaHost, sahaKaynak);

    // Saha adresinde mi? Zaten hazir mi diye dry-run.
    let sahaDry = null;
    if (sahaVar) {
      const d = await applyProvisioning(
        { host: sahaHost, kaynakIp: sahaKaynak, kimlik, uygula: false }, profil,
      );
      sahaDry = d.durum;
    }

    const eylem = nextAction(fabrikaVar, sahaVar, sahaDry);
    rapor.son_eylem = eylem;

    if (eylem === "zaten_hazir") {
      rapor.durum = "zaten_hazir"; rapor.deneme = deneme; rapor.ok = true; return rapor;
    }
    if (eylem === "modem_yok") {
      rapor.problems.push(problem("DEVICE_UNREACHABLE", `${fabrikaHost}/${sahaHost}`));
      if (deneme < denemeler) { await bekle(3000); continue; }
      rapor.durum = "modem_yok"; rapor.ok = false; return rapor;
    }

    // Provizyon: fabrikadaysa fabrikaHost'tan (LAN degisecek+reboot+yeni adres
    // dogrulama); sahadaysa sahaHost'tan (LAN degismez, eksikleri tamamla).
    const fabrikada = eylem === "provizyon_fabrika";
    const r = await applyProvisioning({
      host: fabrikada ? fabrikaHost : sahaHost,
      kaynakIp: fabrikada ? fabrikaKaynak : sahaKaynak,
      kimlik, uygula: true,
      yeniHost: sahaHost, yeniKaynakIp: sahaKaynak,
      ilerle: opts.ilerle,
    }, profil);
    rapor.deneme = deneme;
    rapor.detay = { durum: r.durum, plan: r.plan?.degisecek_sayisi, dogrulama: r.dogrulama };

    if (r.ok && (r.durum === "basarili" || r.durum === "zaten_istenen_durumda")) {
      rapor.durum = "hazir"; rapor.ok = true; return rapor;
    }
    rapor.problems.push(...r.problems);
    bildir(opts, `deneme ${deneme} basarisiz (${r.durum}); tekrar denenecek`);
    if (deneme < denemeler) await bekle(5000);
  }
  rapor.durum = "basarisiz"; rapor.ok = false;
  return rapor;
}

// PC ön-kontrol: gerekli ikincil kaynak IP'ler var mı?
// Doner: { hazir, problems, fabrikaKaynak, sahaKaynak }
export function pcPreflight(fabrikaOnek = "192.168.1.", sahaOnek = "5.5.5.") {
  const fabrikaKaynak = findSourceIp(fabrikaOnek);
  const sahaKaynak = findSourceIp(sahaOnek);
  const problems = [];
  if (!fabrikaKaynak) problems.push(problem("NO_SOURCE_IP", `${fabrikaOnek}50`));
  if (!sahaKaynak) problems.push(problem("NO_SOURCE_IP", `${sahaOnek}100`));
  return { hazir: problems.length === 0, problems, fabrikaKaynak, sahaKaynak };
}

// Döngü: çok modem için. Bir modem hazırlanınca çıkarılmasını (link/erisim
// kaybı) bekler, sonra sıradakine geçer. maxModem ile sınırlanabilir.
// opts: provisionModem opts + { maxModem=Infinity, cikarmaBekle=true }
export async function provisionLoop(opts) {
  const on = pcPreflight(
    (opts.fabrikaHost || "192.168.1.1").split(".").slice(0, 3).join(".") + ".",
    (opts.sahaHost || "5.5.5.1").split(".").slice(0, 3).join(".") + ".",
  );
  const sonuc = { zaman: now(), komut: "hazirla-dongu", hazirlanan: [], problems: [] };
  if (!on.hazir) {
    sonuc.problems.push(...on.problems);
    sonuc.ok = false;
    return sonuc;
  }
  const modemOpts = { ...opts, fabrikaKaynak: on.fabrikaKaynak, sahaKaynak: on.sahaKaynak };
  const maxModem = opts.maxModem ?? Infinity;

  let sayac = 0;
  while (sayac < maxModem) {
    bildir(opts, "modem takilmasi bekleniyor...");
    await modemBekle(modemOpts);
    bildir(opts, "modem algilandi, hazirlaniyor");
    const r = await provisionModem(modemOpts);
    sonuc.hazirlanan.push({ durum: r.durum, ok: r.ok, deneme: r.deneme });
    sayac += 1;
    bildir(opts, r.ok ? `HAZIR (${r.durum}) — cihazi cikarabilirsin` : `BASARISIZ (${r.durum})`);
    if (opts.cikarmaBekle !== false) await modemCikarmaBekle(modemOpts);
  }
  sonuc.ok = sonuc.hazirlanan.every((h) => h.ok);
  return sonuc;
}

// Modem takılana kadar bekler (fabrika ya da saha adresinde cevap).
async function modemBekle({ fabrikaHost = "192.168.1.1", fabrikaKaynak,
  sahaHost = "5.5.5.1", sahaKaynak, ilerle } = {}) {
  for (;;) {
    if (await isReachable(fabrikaHost, fabrikaKaynak)) return;
    if (await isReachable(sahaHost, sahaKaynak)) return;
    await bekle(3000);
  }
}

// Modem çıkarılana kadar bekler (her iki adreste de erişim kaybolunca).
async function modemCikarmaBekle({ fabrikaHost = "192.168.1.1", fabrikaKaynak,
  sahaHost = "5.5.5.1", sahaKaynak } = {}) {
  for (;;) {
    const f = await isReachable(fabrikaHost, fabrikaKaynak);
    const s = f ? true : await isReachable(sahaHost, sahaKaynak);
    if (!f && !s) return;
    await bekle(3000);
  }
}
