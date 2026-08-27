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

// Yapilandirilmis olay bildirimi (UI canli guncellemesi icin). `ilerle` insana
// okunur METIN yollar; `olay` makineye NESNE yollar. Ikisi de OPSIYONEL ve
// tuketicinin isi — cekirdek hicbir yere yazmaz, sadece haber verir. Tuketici
// patlarsa provizyon akisi bozulmaz.
const olayla = (opts, olay) => {
  if (typeof opts.olay !== "function") return;
  try { opts.olay(olay); } catch { /* dinleyici hatasi akisi kesmez */ }
};

// PURE: mevcut nvram + profil -> plan. Cihaza gitmez, test edilebilir.
// Doner: { degisecek:{k:{mevcut,hedef}}, ayni:[k], eksik:[k], onceki:{k:v}, hedef:{k:v} }
// `onceki`/`hedef`: profildeki TUM anahtarlarin oncesi/hedefi — degismeyenler
// dahil. Gosterim tarafi (UI'in "kurulum oncesi" paneli) tam liste ister;
// motorun kendisi yalnizca `degisecek`i kullanir.
export function planProvisioning(mevcut, profil) {
  const degisecek = {};
  const ayni = [];
  const eksik = [];
  const onceki = {};
  const hedefler = {};
  for (const [k, hedefRaw] of Object.entries(profil.nvram)) {
    const hedef = String(hedefRaw);
    hedefler[k] = hedef;
    onceki[k] = k in mevcut ? mevcut[k] : null;
    if (!(k in mevcut)) { eksik.push(k); degisecek[k] = { mevcut: null, hedef }; continue; }
    if (mevcut[k] === hedef) ayni.push(k);
    else degisecek[k] = { mevcut: mevcut[k], hedef };
  }
  return { degisecek, ayni, eksik, onceki, hedef: hedefler };
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
    onceki: plan.onceki,
    hedef: plan.hedef,
  };
  olayla(opts, { tur: "plan", plan: rapor.plan });
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
    olayla(opts, { tur: "yaziliyor", anahtarlar: Object.keys(digerleri) });
    const y = await consoleWrite(kOpts, esle(digerleri));
    rapor.problems.push(...y.problems);
    rapor.yazilan_diger = y.yazilan;
    if (!y.ok) {
      rapor.durum = "yazma_hatasi"; rapor.ok = false;
      olayla(opts, { tur: "yazma_hatasi", anahtarlar: Object.keys(digerleri) });
      return rapor;
    }
    olayla(opts, { tur: "yazildi", anahtarlar: y.yazilan });
  }

  // 5) LAN IP anahtarları (bağlantı bundan sonra yeni adrese taşınır).
  if (Object.keys(lanIp).length) {
    bildir(opts, `LAN IP yaziliyor: ${Object.entries(lanIp).map(([k, v]) => `${k}=${v.hedef}`).join(", ")}`);
    olayla(opts, { tur: "yaziliyor", anahtarlar: Object.keys(lanIp) });
    const y = await consoleWrite(kOpts, esle(lanIp));
    rapor.problems.push(...y.problems);
    rapor.yazilan_lan = y.yazilan;
    if (!y.ok) {
      rapor.durum = "lan_yazma_hatasi"; rapor.ok = false;
      olayla(opts, { tur: "yazma_hatasi", anahtarlar: Object.keys(lanIp) });
      return rapor;
    }
    olayla(opts, { tur: "yazildi", anahtarlar: y.yazilan });
  }

  // 6) Reboot (config'i temiz uygula). Fire-and-forget: reboot bağlantıyı
  // koparır, cevap beklemeyiz.
  if (reboot) {
    bildir(opts, "reboot (config uygulaniyor)");
    olayla(opts, { tur: "reboot" });
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
    olayla(opts, { tur: "bitti", durum: rapor.durum, ok: rapor.ok, dogrulama: dog });
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
// boşaldığını doğrular.
//
// Üç durumu AYIRIR (eskiden ilk okunabilen nvram'da karar verilirdi):
//   1) nvram okunamıyor        -> cihaz henüz gelmedi, beklemeye devam
//   2) okunuyor, eksik var     -> boot sırasında değer henüz oturmamış olabilir,
//                                 tekrar bak (aynı eksik ÜST ÜSTE 3 kez
//                                 görülürse artık oturmuştur: gerçek uyuşmazlık)
//   3) okunuyor, eksik yok     -> TAMAM
// Doner: { tamam, kalan_degisecek, bekleme_sn, sebep }
async function dogrula(opts, profil, anaOpts) {
  const kOpts = { host: opts.host, kaynakIp: opts.kaynakIp,
    kullanici: opts.kimlik.kullanici, sifre: opts.kimlik.sifre };
  const maxDeneme = 20;      // ~100 sn: reboot suresinden rahat uzun
  const KARARLI_SINIR = 3;   // ayni eksik kac kez ust uste = oturmus
  let oncekiImza = null;
  let ayniSayac = 0;
  let sonKalan = null;

  for (let i = 0; i < maxDeneme; i += 1) {
    await bekle(5000);
    bildir(anaOpts, `dogrulama denemesi ${i + 1}/${maxDeneme}`);
    const { degerler, sayi } = await consoleNvram(kOpts);
    if (sayi === 0) {                                           // (1) gelmedi
      olayla(anaOpts, { tur: "dogrulama", deneme: i + 1, durum: "cihaz_bekleniyor" });
      continue;
    }

    const kalan = Object.keys(planProvisioning(degerler, profil).degisecek);
    if (kalan.length === 0) {                                   // (3) TAMAM
      olayla(anaOpts, { tur: "dogrulandi", bekleme_sn: (i + 1) * 5 });
      return { tamam: true, kalan_degisecek: [], bekleme_sn: (i + 1) * 5 };
    }
    olayla(anaOpts, { tur: "dogrulama", deneme: i + 1, durum: "oturmadi", kalan });

    sonKalan = kalan;                                           // (2) oturmadi
    const imza = kalan.slice().sort().join(",");
    ayniSayac = imza === oncekiImza ? ayniSayac + 1 : 0;
    oncekiImza = imza;
    bildir(anaOpts, `dogrulama: ${kalan.length} anahtar henuz oturmadi (${kalan.join(", ")})`);
    if (ayniSayac + 1 >= KARARLI_SINIR) {
      return { tamam: false, kalan_degisecek: kalan, bekleme_sn: (i + 1) * 5,
        sebep: `ayni eksik ${KARARLI_SINIR} kez ust uste: cihaz bu degeri kabul etmiyor` };
    }
  }
  return {
    tamam: false,
    kalan_degisecek: sonKalan ?? ["(cihaz reboot sonrasi gelmedi)"],
    bekleme_sn: maxDeneme * 5,
    sebep: sonKalan ? "sure doldu, eksikler oturmadi" : "cihaz reboot sonrasi gelmedi",
  };
}
