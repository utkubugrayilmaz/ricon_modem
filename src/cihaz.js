// Cihaz TEMEL OKUMALARI ve PC on-kontrolu — en alt orkestrasyon katmani.
//
// Neden ayri: bunlar hem OKUMA yolunun (degerlendirme.js) hem YAZMA yolunun
// (pipeline.js) ihtiyaci. Ikisi de pipeline.js'te dururken degerlendirme.js
// pipeline.js'i import etmek zorunda kaliyordu — yani "yalniz okuyan" modul
// "cihazi degistiren" module bagimliydi. Katman yonu tersti; simdi ikisi de
// buraya bakiyor ve aralarinda bagimlilik yok.
//
// KURAL (tum cekirdek): process.env/argv okunmaz, stdout'a yazilmaz.

import { Client } from "./client.js";
import { parsePairs } from "./ddwrt.js";
import { readSim, parseSimStatus } from "./sim.js";
import { findSourceIp } from "./network.js";
import { problem } from "./problems.js";

const notify = (options, m) => { if (typeof options.onProgress === "function") options.onProgress(m); };
const emit = (options, event) => {
  if (typeof options.event !== "function") return;
  try { options.event(event); } catch { /* dinleyici hatasi akisi kesmez */ }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Cihaz kimliği — "bu hangi modemdi" sorusunun kalıcı cevabı.
// NOT: cihazın ETİKET seri numarası ne HTTP'de ne nvram'da YOK (2026-08-27
// arandı; BULGULAR'daki S/N fiziksel etiketten okundu). Bu yüzden kalıcı
// kimlik: LAN MAC (cihaza ait, kimliksiz okunur) + IMEI (modül) + ICCID (SIM).
export async function readIdentity({ host, sourceIp, credentials }) {
  const result = { lanMac: null, iccid: null, imsi: null, imei: null,
    operator: null, simStatus: null, wanIp: null };
  const c = new Client({ host, sourceIp, credentials });
  const bilgi = await c.get("/asp/status/Info.live.htm");
  result.lanMac = parsePairs(bilgi.body || "").lanMac || null;
  const s = await readSim({ host, sourceIp, credentials });
  const s1 = s.sim1 || {};
  result.iccid = s1.iccidClean || s1.iccid || null;
  result.imsi = s1.imsi || null;
  result.imei = s1.imei || null;
  result.operator = s1.operator || null;
  result.simStatus = s1.simStatus || null;
  // Durum metnini çöz: kilit var mı, kaç deneme kaldı. PIN kilidini 150 sn
  // internet bekleyerek anlamak yerine BURADA, ~4 sn'de anlıyoruz.
  result.sim = parseSimStatus(s1.simStatus);
  // WAN IP zaten bu okumada geliyor — BEDAVA kanıt: "bu SIM o an çevrimiçiydi".
  // Beklemiyoruz, yoksa yok yazıyoruz; kurulum süresine tek saniye eklemiyor.
  const wan = (s1.wanIp || "").trim();
  result.wanIp = wan && wan !== "0.0.0.0" ? wan : null;
  return result;
}

// SIM gerçekten takılı mı? ICCID yalnızca SIM varken okunabiliyor, o yüzden
// tek güvenilir ölçüt o. `simStatus` ("Not Insert" / "Invalid") teşhis metni
// olarak taşınır — operatöre ne olduğunu söylemek için.
//
// NEDEN ÖNEMLİ (2026-08-27 canlı gözlem): SIM'siz bir modemde provizyon
// SORUNSUZ tamamlanıyor — 14 ayar yazılıyor, doğrulama TAMAM diyor. Ama cihaz
// şebekeye kaydolamıyor, ~110 sn'de bir deneyip düşüyor ve deftere ICCID'siz
// bir satır düşüyor. Yani "hazır" denen modem sahada çalışmaz. Bu yüzden SIM
// kontrolü EN BASA alındı: 45 saniye harcayıp sonunda anlamak yerine
// ilk saniyede söylüyoruz.
export function isSimPresent(identity = {}) {
  return Boolean(identity.iccid);
}

// İNTERNET DOĞRULAMASI — "bu SIM gerçekten çalışıyor mu?"
//
// Teknisyen elle süreçte tam bunu yapıyor: işlemden sonra internetin gelmesini
// bekliyor. O bekleme boş bir duruş DEĞİL, bir kalite kontrolü — bu yüzden
// kaldırmıyoruz, otomatikleştirip ÖLÇÜYORUZ. Fark: operatör beklemiyor, araç
// bekliyor.
//
// Ölçüm (2026-08-27): provizyon reboot'undan sonra WAN IP ~89 sn'de geldi,
// sonrasında kesintisiz. Bu yüzden varsayılan üst sınır 150 sn — normalin
// rahat üstünde ama sonsuza kadar beklemiyor.
//
// İnternet gelmemesi provizyonun BAŞARISIZLIĞI değildir: ayarlar doğrulanmış
// olabilir ama atölyede kapsama olmayabilir, SIM'in data paketi bitmiş olabilir.
// Bu yüzden AYRI bir sonuç alanı olarak taşınır; operatör kararı verir.
// Doner: { var, sure_sn, wanIp, simStatus }
export async function waitForInternet({ host, sourceIp, credentials }, maxSec = 150, options = {}) {
  const baslangic = Date.now();
  const elapsed = () => Math.round((Date.now() - baslangic) / 100) / 10;
  // Yoklamada readIdentity DEĞİL readSim kullanıyoruz: readIdentity ayrıca
  // Info.live.htm'i de çekiyor (yalnızca lanMac için) ve burada lanMac'e
  // ihtiyaç yok. Tek uç = yoklama başına ~2 sn tasarruf, tek bağlantılı
  // cihazda da yarı yük.
  const bak = async () => {
    const s = await readSim({ host, sourceIp, credentials });
    const s1 = s.sim1 || {};
    const wan = (s1.wanIp || "").trim();
    return { wanIp: wan && wan !== "0.0.0.0" ? wan : null,
      simStatus: s1.simStatus || null };
  };
  for (;;) {
    let k = null;
    try { k = await bak(); } catch { /* cihaz reboot'ta olabilir; yeniden dene */ }
    if (k?.wanIp) {
      const duration = elapsed();
      emit(options, { kind: "internet", online: true, durationSec: duration, wanIp: k.wanIp });
      return { online: true, durationSec: duration, wanIp: k.wanIp, simStatus: k.simStatus };
    }
    if (elapsed() >= maxSec) {
      emit(options, { kind: "internet", online: false, durationSec: elapsed(),
        simStatus: k?.simStatus ?? null });
      return { online: false, durationSec: elapsed(), wanIp: null, simStatus: k?.simStatus ?? null };
    }
    notify(options, `internet bekleniyor (${elapsed()} sn / ${maxSec} sn)`);
    emit(options, { kind: "internet_bekleniyor", elapsedSec: elapsed(), maxSec: maxSec });
    await wait(5000);
  }
}

// PC ön-kontrol: gerekli ikincil kaynak IP'ler var mı?
// Doner: { hazir, problems, fabrikaKaynak, sahaKaynak }
export function pcPreflight(fabrikaOnek = "192.168.1.", sahaOnek = "5.5.5.") {
  const factorySource = findSourceIp(fabrikaOnek);
  const fieldSource = findSourceIp(sahaOnek);
  const problems = [];
  if (!factorySource) problems.push(problem("NO_SOURCE_IP", `${fabrikaOnek}50`));
  if (!fieldSource) problems.push(problem("NO_SOURCE_IP", `${sahaOnek}100`));
  return { ready: problems.length === 0, problems, factorySource, fieldSource };
}
