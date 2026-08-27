// Tarayıcı tarafı — ince katman, tıpkı ricon.js gibi.
//
// Burada İŞ MANTIĞI YOK: telefonun geçerliliğini de, hangi ayarın değişeceğini
// de, kaydın tutulmasını da çekirdek biliyor. Bu dosya sunucunun yolladığı
// olayları ekrana basar. Sözlük de sunucudan hazır geliyor (satırlar ekrana
// hazır: ad, önce, sonra) — tarayıcı nvram anahtarı bilmez.
//
// Sıfır bağımlılık: framework yok, build yok. EventSource tarayıcıda yerleşik.

const HANE_SAYISI = 11;                 // 0 + 10 hane: 0535 064 18 58
const BOSLUKLAR = new Set([3, 6, 8]);   // bu hanelerden SONRA görsel boşluk

const el = (id) => document.getElementById(id);
const ekranGiris = el("ekranGiris");
const ekranKurulum = el("ekranKurulum");
const haneler = el("haneler");
const gizliGiris = el("gizliGiris");
const uyari = el("uyari");
const baslatBtn = el("baslatBtn");
const ipucu = el("ipucu");
const ustDurum = el("ustDurum");
const izgara = el("izgara");
const akis = el("akis");
const altBar = el("alt");
const altDurum = el("altDurum");
const onayBtn = el("onayBtn");
const sifirlaBtn = el("sifirlaBtn");
const sifirlaAlan = document.querySelector(".sifirla-alan");
const onayBalon = el("onayBalon");
const duyuru = el("duyuru");
const olcumBolum = el("olcumBolum");
const olcumTablo = el("olcumTablo");
const altSure = el("altSure");
const pinGiris = el("pinGiris");
const pinIstek = el("pinIstek");
const pinIstekGiris = el("pinIstekGiris");
const pinDeneBtn = el("pinDeneBtn");

// PIN girişleri: sadece rakam, en fazla 8 hane. Bozuk PIN bir deneme yakar,
// o yüzden kaynağında süzülüyor (çekirdek de ayrıca reddediyor).
for (const g of [pinGiris, pinIstekGiris]) {
  g.addEventListener("input", () => {
    g.value = g.value.replace(/\D/g, "").slice(0, 8);
    if (g === pinIstekGiris) pinDeneBtn.disabled = !/^\d{4,8}$/.test(g.value);
  });
}
pinDeneBtn.disabled = true;

// ---------------- EKRAN 1: telefon numarası ----------------

for (let i = 0; i < HANE_SAYISI; i += 1) {
  const h = document.createElement("span");
  h.className = "hane" + (BOSLUKLAR.has(i) ? " bosluk" : "");
  haneler.appendChild(h);
}
const haneKutulari = [...haneler.children];

// Numara geçerli mi? 11 hane ve 05 ile başlamalı (TR mobil).
// Aynı kural çekirdekte de var (telefonNormalize) — burası sadece erken uyarı.
function gecerliMi(d) {
  return d.length === HANE_SAYISI && d.startsWith("05");
}

function haneleriBoya() {
  const d = gizliGiris.value;
  haneKutulari.forEach((kutu, i) => {
    kutu.textContent = d[i] ?? "";
    kutu.classList.toggle("dolu", i < d.length);
    kutu.classList.toggle("imlec", i === d.length && document.activeElement === gizliGiris);
  });

  const tamam = gecerliMi(d);
  haneler.classList.toggle("hatali", d.length === HANE_SAYISI && !tamam);
  baslatBtn.disabled = !tamam;

  if (d.length === 0) {
    uyari.textContent = " ";
    uyari.removeAttribute("data-hal");
  } else if (d.length < HANE_SAYISI) {
    const kalan = HANE_SAYISI - d.length;
    uyari.textContent = `Eksik: ${kalan} hane kaldı`;
    uyari.removeAttribute("data-hal");
  } else if (!d.startsWith("05")) {
    uyari.textContent = "Numara 05 ile başlamalı";
    uyari.removeAttribute("data-hal");
  } else {
    uyari.textContent = "Numara tam";
    uyari.dataset.hal = "tamam";
  }
}

// Fazla hane giremez, harf giremez: girişi kaynağında süz.
gizliGiris.addEventListener("input", () => {
  gizliGiris.value = gizliGiris.value.replace(/\D/g, "").slice(0, HANE_SAYISI);
  haneleriBoya();
});
gizliGiris.addEventListener("focus", haneleriBoya);
gizliGiris.addEventListener("blur", haneleriBoya);
gizliGiris.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !baslatBtn.disabled) baslatBtn.click();
});
haneler.addEventListener("click", () => gizliGiris.focus());
gizliGiris.focus();
haneleriBoya();

// Modem nerede? Giriş ekranında düzenli sor — teknisyen kabloyu takmadan
// "başlat"a basıp beklemesin.
let durumZamani = null;
async function durumuTazele() {
  try {
    const r = await fetch("/api/durum");
    const d = await r.json();
    if (!d.pc?.hazir) {
      ustDurum.dataset.hal = "hata";
      ustDurum.textContent = "PC ağı hazır değil";
      sifirlaBtn.disabled = true;
      ipucu.dataset.hal = "hata";
      ipucu.textContent = d.pc.problems?.[0]?.check || "";
      return;
    }
    ipucu.removeAttribute("data-hal");
    // Sıfırlanacak bir şey yoksa (modem yok / başka iş sürüyor) düğme kapalı.
    sifirlaBtn.disabled = !d.modem.konum || d.mesgul || !d.sifirlanabilir;
    if (d.modem.konum) {
      ustDurum.dataset.hal = d.modem.konum;
      ustDurum.textContent = `modem ${d.modem.host} (${d.modem.konum})`;
      ipucu.textContent = d.modem.konum === "saha"
        ? "Bu modem zaten kurulmuş görünüyor; başlatırsan doğrulanır."
        : "Modem hazır. Numarayı gir ve başlat.";
    } else {
      ustDurum.dataset.hal = "bekle";
      ustDurum.textContent = "modem yok";
      ipucu.textContent = "Modemi LAN portundan tak.";
    }
  } catch {
    ustDurum.dataset.hal = "hata";
    ustDurum.textContent = "sunucuya ulaşılamıyor";
  }
}

function durumuIzle(ac) {
  clearInterval(durumZamani);
  if (ac) { durumuTazele(); durumZamani = setInterval(durumuTazele, 3000); }
}
durumuIzle(true);

// ---------------- EKRAN 2: kurulum ----------------

const satirlar = new Map();   // nvram anahtarı -> { sol, sag, halKutu }

function izgaraKur(satirListesi) {
  izgara.textContent = "";
  satirlar.clear();
  let sonSayfa = null;

  for (const s of satirListesi) {
    if (s.sayfa && s.sayfa !== sonSayfa) {
      sonSayfa = s.sayfa;
      const grup = document.createElement("div");
      grup.className = "grup";
      const a = document.createElement("span");
      a.textContent = s.sayfa;
      const b = document.createElement("span");
      b.textContent = s.sayfa;
      grup.append(a, b);
      izgara.appendChild(grup);
    }

    const sol = hucreYap(s.ad, s.once, false, s.degisecek);
    const sag = hucreYap(s.ad, s.sonra, true, s.degisecek);
    sag.dataset.hal = s.degisecek ? "bekliyor" : "sabit";
    const halKutu = document.createElement("span");
    halKutu.className = "h-hal";
    halKutu.textContent = s.degisecek ? "bekliyor" : "değişmedi";
    sag.appendChild(halKutu);

    izgara.append(sol, sag);
    satirlar.set(s.anahtar, { sol, sag, halKutu });
  }
}

function hucreYap(ad, deger, sagMi, degisecek) {
  const h = document.createElement("div");
  h.className = "hucre" + (sagMi ? " hucre-sonra" : "") + (degisecek ? "" : " sabit");
  const a = document.createElement("span");
  a.className = "h-ad";
  a.textContent = ad;
  const d = document.createElement("span");
  d.className = "h-deger";
  d.textContent = deger;
  h.append(a, d);
  return h;
}

function halYaz(anahtarlar, hal, etiket) {
  for (const k of anahtarlar || []) {
    const s = satirlar.get(k);
    if (!s || s.sag.dataset.hal === "sabit") continue;
    s.sag.dataset.hal = hal;
    s.halKutu.textContent = etiket;
  }
}

const akisSatirlari = [];
function akisaYaz(mesaj) {
  akisSatirlari.push(mesaj);
  const son = akisSatirlari.slice(-4);
  akis.textContent = "";
  son.forEach((m, i) => {
    const p = document.createElement("span");
    p.textContent = m;
    if (i < son.length - 1) p.className = "akis-gecmis";
    akis.append(p, document.createElement("br"));
  });
}

function kimlikBas(hedef, k) {
  const alanlar = [
    ["Telefon", k.telefon], ["ICCID", k.iccid], ["IMEI", k.imei],
    ["IMSI", k.imsi], ["MAC", k.lan_mac], ["Operatör", k.operator],
  ].filter(([, v]) => v);
  const dl = document.createElement("dl");
  dl.className = "kimlik-liste";
  for (const [ad, deger] of alanlar) {
    const sar = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = ad;
    const dd = document.createElement("dd");
    dd.textContent = deger;
    sar.append(dt, dd);
    dl.appendChild(sar);
  }
  hedef.textContent = "";
  hedef.appendChild(dl);
}

let akim = null;
let akisTuru = null;   // "kurulum" | "sifirlama" — bitişte ne yapılacağını belirler

// --- Süre ölçümü (TEST) ---
// "Başlat"a bastığımdan bitişe kadar kaç saniye? Ölçüm noktası olayın EKRANA
// GELDİĞİ an — yani teknisyenin gerçekten beklediği süre. Tamamen tarayıcıda:
// sunucuya ve çekirdeğe hiç dokunmuyor.
const OLCUM_ETIKET = {
  algilandi: "modem algılandı",
  plan: "ayarlar okundu (plan hazır)",
  yaziliyor: "yazma başladı",
  yazildi: "yazma bitti",
  reboot: "reboot gönderildi",
  dogrulandi: "cihaz geri geldi, doğrulandı",
  kimlik: "kimlik okundu (ICCID/IMEI)",
  // İnternet doğrulaması AYRI adım: "ayarlar doğru mu" ile "SIM çalışıyor mu"
  // iki farklı soru; metrikte de ayrı görünmeleri lazım.
  internet: "internet doğrulandı (SIM çalışıyor)",
};
let baslangicMs = 0;
let sayacZamani = null;
const olcumler = [];
// Ana ekranın hazır olduğu an. "Başlat"a basılana kadar geçen süre =
// operatörün numarayı girme süresi = insanın MEŞGUL olduğu tek an. Metrik
// iddiası için araç süresinden ayrı tutulması şart.
let girisHazirMs = performance.now();

const gecenSn = () => (performance.now() - baslangicMs) / 1000;
const sn = (x) => x.toFixed(1);

let girisSn = null;

function olcumBasla() {
  girisSn = Number(((performance.now() - girisHazirMs) / 1000).toFixed(1));
  baslangicMs = performance.now();
  olcumler.length = 0;
  olcumBolum.hidden = true;
  olcumTablo.textContent = "";
  altSure.textContent = "0.0 sn";
  clearInterval(sayacZamani);
  sayacZamani = setInterval(() => { altSure.textContent = `${sn(gecenSn())} sn`; }, 250);
}

// Olay geldiğinde damgala. `ek` varsa etikete eklenir (örn. kaç ayar yazıldı).
function olcumKaydet(tur, ek = "") {
  const etiket = OLCUM_ETIKET[tur];
  if (!etiket) return;
  olcumler.push({ etiket: ek ? `${etiket} — ${ek}` : etiket, anSn: gecenSn() });
}

// Ölçüm tablosunu basar: her adımın kendi süresi + kümülatif + toplam.
// En uzun adım kırmızı — darboğaz tek bakışta görünsün.
function olcumBitir() {
  clearInterval(sayacZamani);
  sayacZamani = null;
  const toplam = gecenSn();
  altSure.textContent = `${sn(toplam)} sn`;

  const satirDizi = olcumler.map((o, i) => ({
    etiket: o.etiket,
    sure: o.anSn - (i === 0 ? 0 : olcumler[i - 1].anSn),
    an: o.anSn,
  }));
  const enUzun = Math.max(0, ...satirDizi.map((s) => s.sure));

  olcumTablo.textContent = "";
  const hucre = (metin, sinif) => {
    const s = document.createElement("span");
    s.textContent = metin;
    if (sinif) s.className = sinif;
    return s;
  };
  olcumTablo.append(
    hucre("adım", "olcum-baslik"), hucre("süre", "olcum-baslik"), hucre("an", "olcum-baslik"),
  );
  for (const s of satirDizi) {
    const uzunMu = s.sure === enUzun && satirDizi.length > 1 ? "olcum-uzun" : "";
    olcumTablo.append(
      hucre(s.etiket, uzunMu), hucre(`${sn(s.sure)} sn`, uzunMu), hucre(`${sn(s.an)} sn`),
    );
  }
  olcumTablo.append(
    hucre("TOPLAM (başlat → bitiş)", "olcum-toplam"),
    hucre(`${sn(toplam)} sn`, "olcum-toplam"),
    hucre("", "olcum-toplam"),
  );
  olcumBolum.hidden = false;
  return { toplam, satirDizi };
}

// Ölçümü sunucuya yolla (data/olcumler.jsonl). Metrik iddiası için süreler
// ekranda kaybolmamalı. Başarısız gönderim akışı bozmaz — ölçüm, işin kendisi
// değil.
function olcumGonder(govde) {
  fetch("/api/olcum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  }).catch(() => { /* olcum kaydi kritik degil */ });
}

// Karşılaştırma ekranını KOMPLE boşaltır. Tek yerde toplandı: temizliği alan
// alan yapmak, bir alanı unutup önceki modemin bilgisini gösterme hatasının
// kaynağıydı. Yeni alan eklenirse SADECE buraya eklenir.
function panelleriTemizle() {
  izgara.textContent = "";
  satirlar.clear();
  akisSatirlari.length = 0;
  akis.textContent = "";
  el("kimlikOnce").textContent = "";
  el("konumOnce").textContent = "—";
  el("konumSonra").textContent = "—";
  onayBtn.hidden = true;
  altBar.removeAttribute("data-hal");
  altDurum.textContent = "";
  pinIstek.hidden = true;
  olcumBolum.hidden = true;
  olcumTablo.textContent = "";
  altSure.textContent = "0.0 sn";
  clearInterval(sayacZamani);
  sayacZamani = null;
}

// Ana ekrana dön ve OTURUMU SIFIRLA: akış kapanır, paneller boşalır, numara
// silinir. duyuru varsa ana ekranda görünür kalır (bir önceki işin sonucu).
function anaEkrana(duyuruMetni = "") {
  if (akim) { akim.close(); akim = null; }
  akisTuru = null;
  panelleriTemizle();
  ekranKurulum.hidden = true;
  ekranGiris.hidden = false;
  sifirlaAlan.hidden = false;
  gizliGiris.value = "";
  pinGiris.value = "";          // PIN modeme özel: sonraki modeme taşınmasın
  haneleriBoya();
  duyuru.textContent = duyuruMetni;
  duyuru.hidden = !duyuruMetni;
  girisHazirMs = performance.now();
  gizliGiris.focus();
  durumuIzle(true);            // durum çubuğunu bekletmeden tazeler
}

// Kurulum ve sıfırlama AYNI ekranı kullanır — ikisi de "öncesi → sonrası"
// karşılaştırması. Fark: hangi uca bağlandığı, panel etiketleri ve bitişte
// ne olacağı (kurulum onay bekler, sıfırlama ana ekrana döner).
function akisiBaslat({ yol, tur, telefon = null, onceEtiket, sonraEtiket, calisirkenMetin }) {
  if (akim) { akim.close(); akim = null; }   // çift başlatmaya karşı
  durumuIzle(false);
  onayiKapat();
  akisTuru = tur;
  sifirlaAlan.hidden = true;      // iş sürerken sıfırlama teklif edilmez
  duyuru.hidden = true;           // önceki işin duyurusu yeni işle silinir
  panelleriTemizle();
  el("etiketOnce").textContent = onceEtiket;
  el("etiketSonra").textContent = sonraEtiket;
  ekranGiris.hidden = true;
  ekranKurulum.hidden = false;
  altDurum.textContent = calisirkenMetin;
  akisaYaz("başlatıldı");

  olcumBasla();
  akim = new EventSource(yol);

  // Ölçüm: her damgalanan olay için ayrı dinleyici — mevcut işleyicilere
  // dokunmaz, biri eklenip çıkarılınca ölçüm bozulmaz.
  for (const tur of Object.keys(OLCUM_ETIKET)) {
    akim.addEventListener(tur, (e) => {
      const o = JSON.parse(e.data);
      olcumKaydet(tur, o.anahtarlar ? `${o.anahtarlar.length} ayar` : "");
    });
  }

  akim.addEventListener("ilerleme", (e) => akisaYaz(JSON.parse(e.data).mesaj));

  akim.addEventListener("kimlik_once", (e) => {
    kimlikBas(el("kimlikOnce"), { ...JSON.parse(e.data), telefon });
  });

  akim.addEventListener("plan", (e) => {
    izgaraKur(JSON.parse(e.data).satirlar);
  });

  akim.addEventListener("algilandi", (e) => {
    const o = JSON.parse(e.data);
    el("konumOnce").textContent = o.konum || "modem yok";
    ustDurum.dataset.hal = o.eylem === "provizyon_fabrika" ? "fabrika" : "saha";
    ustDurum.textContent = o.eylem.replace(/_/g, " ");
  });

  akim.addEventListener("yaziliyor", (e) => halYaz(JSON.parse(e.data).anahtarlar, "yaziliyor", "yazılıyor"));
  akim.addEventListener("yazildi", (e) => halYaz(JSON.parse(e.data).anahtarlar, "yazildi", "yazıldı"));

  akim.addEventListener("yazma_hatasi", (e) => {
    const a = JSON.parse(e.data).anahtarlar || [];
    halYaz(a, "hata", "yazılamadı");
    akisaYaz(`yazılamadı: ${a.length} ayar`);
  });

  akim.addEventListener("reboot", () => akisaYaz("modem yeniden başlatılıyor"));

  // İnternet doğrulaması — operatör beklemiyor, araç bekliyor. Ekranda ne
  // olduğu net yazsın, donmuş gibi görünmesin.
  akim.addEventListener("internet_bekleniyor", (e) => {
    const o = JSON.parse(e.data);
    altDurum.textContent = "SIM doğrulanıyor — internet bekleniyor "
      + `(${o.gecen_sn}/${o.max_sn} sn)`;
  });

  akim.addEventListener("internet", (e) => {
    const o = JSON.parse(e.data);
    akisaYaz(o.var
      ? `internet VAR: ${o.wan_ip} (${o.sure_sn} sn) — SIM çalışıyor`
      : `internet YOK (${o.sure_sn} sn) — SIM durumu: ${o.sim_durumu || "?"}`);
  });

  // Kurulum akışında PIN otomatik denenirse (baştan girilmişse) haber ver.
  akim.addEventListener("pin_deneniyor", () => akisaYaz("SIM PIN yazılıyor (tek deneme)"));

  // Provizyon adımının bitişi (nihai sonuç değil — o `sonuc`). Yalnız
  // başarısızlıkta bilgi taşır: doğrulama neden tamamlanmadı.
  akim.addEventListener("bitti", (e) => {
    const o = JSON.parse(e.data);
    if (!o.ok && o.dogrulama?.sebep) akisaYaz(o.dogrulama.sebep);
  });

  akim.addEventListener("dogrulama", (e) => {
    const o = JSON.parse(e.data);
    akisaYaz(o.durum === "cihaz_bekleniyor"
      ? `modem bekleniyor (${o.deneme})`
      : `oturmayan ayar: ${o.kalan.length}`);
  });

  akim.addEventListener("dogrulandi", (e) => {
    const o = JSON.parse(e.data);
    halYaz([...satirlar.keys()], "dogrulandi", "doğrulandı");
    akisaYaz(`doğrulandı (${o.bekleme_sn} sn)`);
  });

  akim.addEventListener("kimlik", (e) => {
    const k = JSON.parse(e.data).kimlik_bilgi || {};
    if (k.iccid) kimlikBas(el("kimlikOnce"), { ...k, telefon });
  });

  akim.addEventListener("sonuc", (e) => {
    const o = JSON.parse(e.data);
    bitir(o.ok, o);
  });

  akim.addEventListener("hata", (e) => {
    const o = JSON.parse(e.data);
    bitir(false, { durum: o.mesaj, cozum: o.cozum });
  });

  // Akış kapanırsa EventSource kendiliğinden YENİDEN BAĞLANIR — kurulumu
  // ikinci kez başlatmasın diye biz kapatıyoruz (bitir() kapatır).
  akim.onerror = () => {
    if (akim && akim.readyState === EventSource.CLOSED) return;
    akisaYaz("bağlantı koptu");
  };
}

baslatBtn.addEventListener("click", () => {
  const telefon = gizliGiris.value;
  if (!gecerliMi(telefon)) return;
  const pin = pinGiris.value.trim();
  akisiBaslat({
    yol: `/api/hazirla?telefon=${encodeURIComponent(telefon)}`
      + (pin ? `&pin=${encodeURIComponent(pin)}` : ""),
    tur: "kurulum",
    telefon,
    onceEtiket: "Kurulum öncesi",
    sonraEtiket: "Kurulum sonrası",
    calisirkenMetin: "Kurulum sürüyor…",
  });
});

// --- Fabrikaya döndür (sağ üst) ---
// Yıkıcı işlem: düğme tek başına hiçbir şey yapmaz, onay balonu şart.
function onayiKapat() {
  onayBalon.hidden = true;
  sifirlaBtn.disabled = false;
}

sifirlaBtn.addEventListener("click", () => {
  onayBalon.hidden = false;
  sifirlaBtn.disabled = true;
  el("sifirlaHayir").focus();
});

el("sifirlaHayir").addEventListener("click", () => {
  onayiKapat();
  sifirlaBtn.focus();
});

el("sifirlaEvet").addEventListener("click", () => {
  onayiKapat();
  akisiBaslat({
    yol: "/api/fabrikaya-dondur",
    tur: "sifirlama",
    onceEtiket: "Şimdiki hali",
    sonraEtiket: "Fabrika hali",
    calisirkenMetin: "Fabrikaya döndürülüyor…",
  });
});

// Escape ile vazgeç; dışarı tıklayınca da kapan (kaza tıklaması iş yapmasın).
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !onayBalon.hidden) { onayiKapat(); sifirlaBtn.focus(); }
});
document.addEventListener("click", (e) => {
  if (!onayBalon.hidden && !e.target.closest(".sifirla-alan")) onayiKapat();
});

function bitir(ok, o) {
  if (akim) { akim.close(); akim = null; }
  const { toplam, satirDizi } = olcumBitir();

  olcumGonder({
    tur: akisTuru,
    durum: o.durum ?? null,
    ok: Boolean(ok),
    deneme: o.deneme ?? null,
    toplam_sn: Number(sn(toplam)),
    giris_sn: girisSn,
    adimlar: satirDizi.map((s) => ({ ad: s.etiket, sure_sn: Number(sn(s.sure)),
      an_sn: Number(sn(s.an)) })),
    degisen_ayar: [...satirlar.values()].filter((s) => s.sag.dataset.hal !== "sabit").length,
    ayni_ayar: [...satirlar.values()].filter((s) => s.sag.dataset.hal === "sabit").length,
    telefon: o.kayit?.telefon ?? null,
    iccid: o.kayit?.iccid ?? null,
    imei: o.kayit?.imei ?? null,
    lan_mac: o.kayit?.lan_mac ?? null,
    modem_ip: o.kayit?.modem_ip ?? null,
  });

  // Sıfırlama BAŞARILIYSA oturum burada biter: modem sıfırlandı, ekran da
  // sıfırdan başlamalı. Sonuç ekranında bekletip fazladan tıklama istemek
  // yanlıştı — sonuç ana ekranda duyuru olarak görünür.
  if (ok && akisTuru === "sifirlama") {
    anaEkrana(`Modem fabrikaya döndürüldü · ${o.kayit?.modem_ip || "192.168.1.1"}`
      + ` · ${sn(toplam)} sn — sıradaki kurulum için hazır.`);
    return;
  }

  const kayit = o.kayit;
  if (kayit) {
    el("konumSonra").textContent = kayit.modem_ip || "—";
    kimlikBas(el("kimlikOnce"), kayit);
  }
  altBar.dataset.hal = ok ? "hazir" : "hata";
  const net = o.kayit?.wan_ip
    ? ` · internet ${o.kayit.wan_ip}`
    : (o.durum || "").includes("internet_yok") ? " · ⚠ İNTERNET YOK (SIM/PIN kontrol et)" : "";
  altDurum.textContent = ok
    ? `HAZIR — ${o.durum}${o.deneme ? ` (deneme ${o.deneme})` : ""} · ${sn(toplam)} sn`
      + `${net} · deftere yazıldı`
    : `BAŞARISIZ — ${o.durum || "bilinmeyen"}${o.cozum ? ` · ${o.cozum}` : ""}`;
  // Internet yoksa alt bar UYARI rengine gecsin: gozden kacmasin.
  if (ok && (o.durum || "").includes("internet_yok")) altBar.dataset.hal = "uyari";
  if (!ok && o.problems?.length) {
    akisaYaz(o.problems.map((p) => `[${p.kod}] ${p.message}`).join(" "));
  }
  // İnternet gelmedi VE PIN denenmedi -> operatörü ana ekrana atmadan burada
  // sor. Provizyon tekrarlanmayacak; yalnızca PIN yazılacak (ayrı iş).
  const pinGerekli = (o.problems || []).some((p) => p.kod === "PIN_REQUIRED");
  pinIstek.hidden = !pinGerekli;
  if (pinGerekli) {
    pinIstekGiris.value = "";
    pinDeneBtn.disabled = true;
    pinIstekGiris.focus();
  }

  onayBtn.hidden = false;
  onayBtn.textContent = ok ? "Onayla ve sıradaki modem" : "Baştan dene";
  if (!pinGerekli) onayBtn.focus();
}

// Yerinde PIN denemesi — SADECE PIN yazılır, provizyon tekrarlanmaz.
pinDeneBtn.addEventListener("click", () => {
  const p = pinIstekGiris.value.trim();
  if (!/^\d{4,8}$/.test(p)) return;
  pinDeneBtn.disabled = true;
  altBar.removeAttribute("data-hal");
  altDurum.textContent = "SIM PIN deneniyor…";
  akisaYaz("PIN denemesi başlatıldı (yalnızca PIN yazılır)");
  if (akim) { akim.close(); akim = null; }
  akim = new EventSource(`/api/pin?pin=${encodeURIComponent(p)}`);
  for (const tur of ["ilerleme", "internet_bekleniyor", "internet", "reboot",
    "pin_deneniyor", "pin_sonuc", "hata"]) {
    akim.addEventListener(tur, (e) => pinOlayi(tur, JSON.parse(e.data)));
  }
});

function pinOlayi(tur, o) {
  if (tur === "ilerleme") return akisaYaz(o.mesaj);
  if (tur === "reboot") return akisaYaz("modem yeniden başlatılıyor");
  if (tur === "pin_deneniyor") return akisaYaz("SIM PIN yazılıyor (tek deneme)");
  if (tur === "internet_bekleniyor") {
    altDurum.textContent = `PIN sonrası internet bekleniyor (${o.gecen_sn}/${o.max_sn} sn)`;
    return undefined;
  }
  if (tur === "internet") {
    return akisaYaz(o.var ? `internet VAR: ${o.wan_ip} (${o.sure_sn} sn)`
      : `internet YOK (${o.sure_sn} sn)`);
  }
  if (tur === "hata") {
    if (akim) { akim.close(); akim = null; }
    altBar.dataset.hal = "hata";
    altDurum.textContent = `PIN denenemedi — ${o.mesaj}`;
    pinDeneBtn.disabled = false;
    return undefined;
  }
  // pin_sonuc
  if (akim) { akim.close(); akim = null; }
  if (!o.denendi) {
    akisaYaz(`PIN denenmedi (${o.atlandi})`);
    altDurum.textContent = `PIN DENENMEDİ — ${o.problems?.[0]?.check || o.atlandi}`;
    pinDeneBtn.disabled = false;
    return undefined;
  }
  pinIstek.hidden = true;
  altBar.dataset.hal = o.internet?.var ? "hazir" : "uyari";
  altDurum.textContent = o.internet?.var
    ? `PIN KABUL EDİLDİ — internet ${o.internet.wan_ip} (${o.internet.sure_sn} sn)`
    : `PIN yazıldı ama internet gelmedi (${o.internet?.sure_sn} sn) — kapsama/data paketi?`;
  onayBtn.hidden = false;
  onayBtn.focus();
  return undefined;
}

onayBtn.addEventListener("click", () => anaEkrana());
