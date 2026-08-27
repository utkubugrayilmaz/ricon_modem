// Ölçüm özetleyici — PURE. Kaydedilmiş çalıştırma satırlarından savunulabilir
// sayı üretir. Dosya okumaz, cihaza gitmez, throw etmez.
//
// Neden medyan öne çıkıyor: örneklem küçük (5-15 çalıştırma) ve tek bir
// yavaş boot ortalamayı çeker. Medyan "tipik çalıştırma" için doğru cevap;
// ortalama, min ve maks yine raporlanır ki dağılım saklanmasın.
//
// DÜRÜSTLÜK KURALI: elle süre bir ÖLÇÜM ya da BEYAN'dır — hangisi olduğunu
// bu modül bilmez, çağıran söyler (`elleKaynak`). Özet, kaynağını taşır.

const sayi = (x) => (Number.isFinite(x) ? x : null);
const yuvarla = (x, basamak = 1) => (x == null ? null : Number(x.toFixed(basamak)));

// Sayı dizisinden dağılım. Boş dizi -> hepsi null (0 DEĞİL: 0 bir ölçümdür,
// "ölçüm yok" değildir).
export function dagilim(degerler) {
  const d = degerler.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (d.length === 0) return { n: 0, medyan: null, ortalama: null, min: null, maks: null };
  const orta = Math.floor(d.length / 2);
  return {
    n: d.length,
    medyan: yuvarla(d.length % 2 ? d[orta] : (d[orta - 1] + d[orta]) / 2),
    ortalama: yuvarla(d.reduce((a, b) => a + b, 0) / d.length),
    min: yuvarla(d[0]),
    maks: yuvarla(d[d.length - 1]),
  };
}

// Çalıştırma satırlarını özetler.
// rows: data/olcumler.jsonl satırları (nesne olarak)
// opts: { elleSn?, elleKaynak?, elleN?, modemSayisi? }
export function summarizeMetrics(rows = [], opts = {}) {
  const kurulumlar = rows.filter((r) => r.tur === "kurulum");
  const basarili = kurulumlar.filter((r) => r.ok);
  // Elle olcumler AYNI dosyada, tur:"elle" ile. Boylece karsilastirma tabani
  // da kayitli bir OLCUM olur — komut satirinda tasinan bir sayi degil.
  const elleler = rows.filter((r) => r.tur === "elle");

  const ozet = {
    zaman: new Date().toISOString(),
    komut: "olcum",
    kayit_sayisi: rows.length,
    kurulum: {
      denenen: kurulumlar.length,
      basarili: basarili.length,
      basari_orani: kurulumlar.length
        ? yuvarla((basarili.length / kurulumlar.length) * 100) : null,
      // İlk denemede biten kurulum oranı — retry'a ne sıklıkla düştüğümüz.
      ilk_denemede: basarili.filter((r) => (r.deneme ?? 1) === 1).length,
      farkli_cihaz: new Set(basarili.map((r) => r.lan_mac).filter(Boolean)).size,
    },
    sifirlama: {
      denenen: rows.filter((r) => r.tur === "sifirlama").length,
    },
    // Araç süresi: "başlat"a bastıktan bitişe kadar (cihaz işi).
    arac_sn: dagilim(basarili.map((r) => sayi(r.toplam_sn))),
    // Operatörün numarayı girme süresi = insanın MEŞGUL olduğu tek an.
    giris_sn: dagilim(basarili.map((r) => sayi(r.giris_sn))),
    adimlar: adimOzeti(basarili),
    elle_sn: dagilim(elleler.map((r) => sayi(r.toplam_sn))),
    problems: [],
  };

  ozet.insan_mesgul_sn = ozet.giris_sn.medyan;
  ozet.dongu_sn = ozet.arac_sn.medyan != null && ozet.giris_sn.medyan != null
    ? yuvarla(ozet.arac_sn.medyan + ozet.giris_sn.medyan) : ozet.arac_sn.medyan;

  // Taban secimi: KAYITLI olcum her zaman kazanir; yoksa disaridan verilen
  // sayi (beyan) kullanilir. Ozet hangisi oldugunu acikca tasir.
  const kayitliTaban = ozet.elle_sn.medyan != null;
  const taban = kayitliTaban ? ozet.elle_sn.medyan : opts.elleSn;
  if (taban) {
    ozet.karsilastirma = karsilastir(ozet, {
      ...opts,
      elleSn: taban,
      elleKaynak: kayitliTaban
        ? `${ozet.elle_sn.n} kayitli olcum (medyan)`
        : (opts.elleKaynak || "BEYAN — kayitli olcum yok"),
      elleN: kayitliTaban ? ozet.elle_sn.n : opts.elleN,
    });
  }
  ozet.ok = basarili.length > 0;
  if (basarili.length === 0) {
    ozet.problems.push({ kod: "OLCUM_YOK", severity: "warning",
      message: "No successful provisioning runs were recorded yet.",
      check: "Run the UI flow at least a few times; each finished run appends"
        + " one line to data/olcumler.jsonl." });
  }
  return ozet;
}

// Adım adı -> süre dağılımı. En yavaş adım ayrıca işaretlenir (darboğaz).
function adimOzeti(satirlar) {
  const kova = new Map();
  for (const r of satirlar) {
    for (const a of r.adimlar || []) {
      if (!kova.has(a.ad)) kova.set(a.ad, []);
      kova.get(a.ad).push(sayi(a.sure_sn));
    }
  }
  const liste = [...kova].map(([ad, degerler]) => ({ ad, ...dagilim(degerler) }));
  const enYavas = liste.reduce((e, a) => (a.medyan > (e?.medyan ?? -1) ? a : e), null);
  return liste.map((a) => ({ ...a, darbogaz: a.ad === enYavas?.ad }));
}

// Elle sürece göre kazanç. İki AYRI iddia üretir, çünkü ikisi farklı şey:
//   dongu  = toplam geçen süre (modem başına)
//   mesgul = insanın ekranda/klavyede olduğu süre
// İkincisi asıl kazanç: kalan süre gözetimsiz geçiyor.
function karsilastir(ozet, opts) {
  const elle = opts.elleSn;
  const oran = (yeni) => (yeni == null || !elle ? null : {
    azalma_yuzde: yuvarla(((elle - yeni) / elle) * 100),
    kat: yuvarla(elle / yeni),
    kazanilan_sn: yuvarla(elle - yeni),
  });
  const k = {
    elle_sn: elle,
    elle_kaynak: opts.elleKaynak || "belirtilmedi",
    elle_n: opts.elleN ?? null,
    dongu: oran(ozet.dongu_sn),
    insan_mesgul: oran(ozet.insan_mesgul_sn),
  };
  if (opts.modemSayisi && k.dongu) {
    k.olcek = {
      modem: opts.modemSayisi,
      kazanilan_saat: yuvarla((k.dongu.kazanilan_sn * opts.modemSayisi) / 3600),
    };
  }
  // Küçük örneklemde "%94 azalttık" demek abartı olur; eşiği açıkça söyle.
  if (ozet.arac_sn.n < 5) {
    k.uyari = `Yalnizca ${ozet.arac_sn.n} basarili calistirma var; en az 5`
      + " (yeglenen 10) olmadan yuzde iddiasi zayif kalir.";
  }
  if ((k.elle_n ?? 0) < 3) {
    k.uyari_elle = "Elle sure icin en az 3 olcum onerilir; tek sayi ya da beyan"
      + " ise raporda BEYAN olarak etiketlenmeli.";
  }
  return k;
}
