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
      ipucu.dataset.hal = "hata";
      ipucu.textContent = d.pc.problems?.[0]?.check || "";
      return;
    }
    ipucu.removeAttribute("data-hal");
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

baslatBtn.addEventListener("click", () => {
  const telefon = gizliGiris.value;
  if (!gecerliMi(telefon)) return;

  durumuIzle(false);
  ekranGiris.hidden = true;
  ekranKurulum.hidden = false;
  izgara.textContent = "";
  satirlar.clear();
  akisSatirlari.length = 0;
  el("kimlikOnce").textContent = "";
  el("konumOnce").textContent = "—";
  el("konumSonra").textContent = "—";
  onayBtn.hidden = true;
  altBar.removeAttribute("data-hal");
  altDurum.textContent = "Kurulum sürüyor…";
  akisaYaz("başlatıldı");

  akim = new EventSource(`/api/hazirla?telefon=${encodeURIComponent(telefon)}`);

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

  akim.addEventListener("reboot", () => akisaYaz("modem yeniden başlatılıyor"));

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
});

function bitir(ok, o) {
  if (akim) { akim.close(); akim = null; }
  const kayit = o.kayit;
  if (kayit) {
    el("konumSonra").textContent = kayit.modem_ip || "—";
    kimlikBas(el("kimlikOnce"), kayit);
  }
  altBar.dataset.hal = ok ? "hazir" : "hata";
  altDurum.textContent = ok
    ? `HAZIR — ${o.durum}${o.deneme ? ` (deneme ${o.deneme})` : ""} · deftere yazıldı`
    : `BAŞARISIZ — ${o.durum || "bilinmeyen"}${o.cozum ? ` · ${o.cozum}` : ""}`;
  if (!ok && o.problems?.length) {
    akisaYaz(o.problems.map((p) => `[${p.kod}] ${p.message}`).join(" "));
  }
  onayBtn.hidden = false;
  onayBtn.textContent = ok ? "Onayla ve sıradaki modem" : "Baştan dene";
  onayBtn.focus();
}

onayBtn.addEventListener("click", () => {
  ekranKurulum.hidden = true;
  ekranGiris.hidden = false;
  gizliGiris.value = "";
  haneleriBoya();
  gizliGiris.focus();
  durumuIzle(true);
});
