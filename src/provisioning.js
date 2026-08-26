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
import { LAN_IP_KEYS } from "./profile.js";
import { problem, isOk } from "./problems.js";

const now = () => new Date().toISOString();
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const bildir = (opts, m) => { if (typeof opts.ilerle === "function") opts.ilerle(m); };

// PURE: mevcut nvram + profil -> plan. Cihaza gitmez, test edilebilir.
// Doner: { degisecek:{k:{mevcut,hedef}}, ayni:[k], eksik:[k] }
export function planProvisioning(mevcut, profil) {
  const degisecek = {};
  const ayni = [];
  const eksik = [];
  for (const [k, hedefRaw] of Object.entries(profil.nvram)) {
    const hedef = String(hedefRaw);
    if (!(k in mevcut)) { eksik.push(k); degisecek[k] = { mevcut: null, hedef }; continue; }
    if (mevcut[k] === hedef) ayni.push(k);
    else degisecek[k] = { mevcut: mevcut[k], hedef };
  }
  return { degisecek, ayni, eksik };
}

// Planı LAN-IP ve LAN-IP-olmayan diye ayırır (yazma sırası için).
export function splitPlan(degisecek) {
  const lanIp = {};
  const digerleri = {};
  for (const [k, v] of Object.entries(degisecek)) {
    if (LAN_IP_KEYS.includes(k)) lanIp[k] = v; else digerleri[k] = v;
  }
  return { lanIp, digerleri };
}

// Provizyon: oku → planla → (uygula ise) yaz → reboot → doğrula.
// opts: { host, kaynakIp, kimlik, uygula:false, reboot:true,
//         yeniHost, yeniKaynakIp, ilerle }
// uygula=false (varsayılan): DRY-RUN — sadece plan döner, cihaza YAZMAZ.
export async function applyProvisioning(opts, profil) {
  const { host, kaynakIp, kimlik, uygula = false, reboot = true } = opts;
  const rapor = { zaman: now(), komut: "uygula", modem_ip: host, profil: profil.ad,
    uygula, problems: [] };

  if (!kimlik) {
    rapor.problems.push(problem("AUTH_REQUIRED", "telnet 5123"));
    rapor.ok = false;
    return rapor;
  }
  const kOpts = { host, kaynakIp, kullanici: kimlik.kullanici, sifre: kimlik.sifre };

  // 1) Oku
  bildir(opts, "nvram okunuyor");
  const { degerler, sayi, problems: okumaSorun } = await consoleNvram(kOpts);
  rapor.problems.push(...okumaSorun);
  if (sayi === 0) { rapor.ok = false; return rapor; }

  // 2) Planla
  const plan = planProvisioning(degerler, profil);
  const { lanIp, digerleri } = splitPlan(plan.degisecek);
  rapor.plan = {
    degisecek_sayisi: Object.keys(plan.degisecek).length,
    ayni_sayisi: plan.ayni.length,
    degisecek: plan.degisecek,
    lan_ip_degisecek: Object.keys(lanIp),
  };
  if (plan.eksik.length) {
    // Profilde olup cihazda hiç olmayan anahtar — beklenmedik, uyar (yazılır
    // ama dikkat).
    rapor.plan.eksik_anahtarlar = plan.eksik;
  }

  // Değişecek bir şey yoksa: zaten istenen durumda (idempotent başarı).
  if (Object.keys(plan.degisecek).length === 0) {
    rapor.durum = "zaten_istenen_durumda";
    rapor.ok = isOk(rapor.problems);
    return rapor;
  }

  // 3) DRY-RUN ise burada dur.
  if (!uygula) {
    rapor.durum = "kuru_calisma";
    rapor.not = "Hicbir sey yazilmadi. Gercek uygulama icin uygula:true (CLI: --uygula).";
    rapor.ok = isOk(rapor.problems);
    return rapor;
  }

  // 4) YAZ — önce LAN-IP olmayanlar (bağlantı kopmaz).
  if (Object.keys(digerleri).length) {
    bildir(opts, `${Object.keys(digerleri).length} ayar yaziliyor (LAN IP haric)`);
    const y = await consoleWrite(kOpts, esle(digerleri));
    rapor.problems.push(...y.problems);
    rapor.yazilan_diger = y.yazilan;
    if (!y.ok) { rapor.durum = "yazma_hatasi"; rapor.ok = false; return rapor; }
  }

  // 5) LAN IP anahtarları (bağlantı bundan sonra yeni adrese taşınır).
  if (Object.keys(lanIp).length) {
    bildir(opts, `LAN IP yaziliyor: ${Object.entries(lanIp).map(([k, v]) => `${k}=${v.hedef}`).join(", ")}`);
    const y = await consoleWrite(kOpts, esle(lanIp));
    rapor.problems.push(...y.problems);
    rapor.yazilan_lan = y.yazilan;
    if (!y.ok) { rapor.durum = "lan_yazma_hatasi"; rapor.ok = false; return rapor; }
  }

  // 6) Reboot (config'i temiz uygula). Fire-and-forget: reboot bağlantıyı
  // koparır, cevap beklemeyiz.
  if (reboot) {
    bildir(opts, "reboot (config uygulaniyor)");
    await rebootFireForget(kOpts);
    rapor.reboot_gonderildi = true;
  }

  // 7) Doğrulama: LAN IP değiştiyse cihaz yeni adreste; doğrulama için yeni
  // host/kaynak gerekir. Yoksa kullanıcıya bırak.
  const dogrulamaHost = opts.yeniHost || (Object.keys(lanIp).length ? profil.nvram.lan_ipaddr : host);
  const dogrulamaKaynak = opts.yeniKaynakIp || kaynakIp;
  if (opts.yeniHost || !Object.keys(lanIp).length) {
    bildir(opts, `dogrulama: ${dogrulamaHost} bekleniyor`);
    const dog = await dogrula(
      { host: dogrulamaHost, kaynakIp: dogrulamaKaynak, kimlik }, profil, opts,
    );
    rapor.dogrulama = dog;
    rapor.durum = dog.tamam ? "basarili" : "dogrulama_bekliyor";
    rapor.ok = dog.tamam && isOk(rapor.problems);
  } else {
    // LAN IP değişti ama yeni adres verilmedi -> PC'yi 5.5.5.x'e alıp doğrula.
    rapor.durum = "reboot_sonrasi_dogrulama_gerek";
    rapor.not = `LAN IP ${profil.nvram.lan_ipaddr} yapildi + reboot edildi. `
      + `Dogrulama icin PC'ye 5.5.5.x ekleyip: uygula --yeni-host ${profil.nvram.lan_ipaddr} --kuru`;
    rapor.ok = isOk(rapor.problems);
  }
  return rapor;
}

// degisecek {k:{mevcut,hedef}} -> consoleWrite icin {k:hedef}
function esle(degisecek) {
  const out = {};
  for (const [k, v] of Object.entries(degisecek)) out[k] = v.hedef;
  return out;
}

// Reboot gönder, cevap bekleme (bağlantı kopar). Hata yutulur.
async function rebootFireForget(kOpts) {
  try {
    await runConsole({ ...kOpts, yazmaIzni: true, zamanAsimiMs: 4000 }, ["reboot"]);
  } catch { /* reboot baglantiyi koparir; beklenen */ }
}

// Reboot sonrası cihazın gelmesini bekler + nvram'ı yeniden okuyup planın
// boşaldığını doğrular. Doner: { tamam, kalan_degisecek, bekleme_sn }
async function dogrula(opts, profil, anaOpts) {
  const kOpts = { host: opts.host, kaynakIp: opts.kaynakIp,
    kullanici: opts.kimlik.kullanici, sifre: opts.kimlik.sifre };
  const maxDeneme = 20; // ~ reboot suresi
  for (let i = 0; i < maxDeneme; i += 1) {
    await bekle(5000);
    bildir(anaOpts, `dogrulama denemesi ${i + 1}/${maxDeneme}`);
    const { degerler, sayi } = await consoleNvram(kOpts);
    if (sayi === 0) continue; // henuz gelmedi
    const plan = planProvisioning(degerler, profil);
    const kalan = Object.keys(plan.degisecek);
    return { tamam: kalan.length === 0, kalan_degisecek: kalan, bekleme_sn: (i + 1) * 5 };
  }
  return { tamam: false, kalan_degisecek: ["(cihaz reboot sonrasi gelmedi)"], bekleme_sn: maxDeneme * 5 };
}
