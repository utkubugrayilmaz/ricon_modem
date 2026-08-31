// Terminal ilerleme gorunumu — cekirdegin olay akisini OKUNABILIR SATIRA cevirir.
//
// NEDEN VAR: hazirlama 60-90 saniye suren, cihazi reboot eden bir is. Operator
// bu sure boyunca "arac calisiyor mu, donmus mu, ne yapiyor?" sorusunun
// cevabini gormek zorunda. Eskiden bu bilgi tarayici arayuzundeydi (adim
// izgarasi + kronometre); arayuz kalkti, bilgi kalmali.
//
// SINIR — bu dosya HICBIR SEY YAZMAZ ve HICBIR KARAR VERMEZ:
//   · stdout/stderr'a dokunmaz (cekirdek kurali: yazma isi tuketicinin)
//   · saati disaridan alir (`simdi`), yani testte sure sabitlenebilir
//   · hangi olayin ne anlama geldigini bilir; olayin OLUP OLMAYACAGINA
//     karar vermez
// Yazan taraf ricon.js. Boylece ayni izleyici baska bir tuketiciden de
// (log dosyasi, baska bir Node projesi) kullanilabilir.
//
// GURULTU KURALI: iki tur satir var.
//   ADIM   — bir kez olur, damgalanir, akisa yeni satir olarak eklenir
//   DURUM  — tekrarlanir (internet beklemesi, dogrulama turlari); AYNI satirin
//            guncellenmesi gerekir, akisa 40 satir birikmemeli. Izleyici bunu
//            `yenile: true` ile soyler, satiri nasil guncelleyecegi yazan
//            tarafin isi (TTY ise \r, degilse hic basmaz).

// Damgalanan ADIMLAR ve ekrandaki adlari. SIRA = beklenen akis sirasi; ekranda
// "[3/7]" gibi bir konum gostermek icin kullanilir.
//
// Etiketler tarayici arayuzundeki olcum etiketlerinden geliyor — orada canli
// kurulumlarda okunup dogrulanmislardi, yeniden uydurmuyoruz.
const ADIMLAR = [
  ["algilandi", "modem algilandi"],
  ["plan", "ayarlar okundu (plan hazir)"],
  ["yaziliyor", "yazma basladi"],
  ["yazildi", "yazma bitti"],
  ["reboot", "reboot gonderildi"],
  ["dogrulandi", "cihaz geri geldi, dogrulandi"],
  // Internet dogrulamasi AYRI adim: "ayarlar dogru mu" ile "SIM calisiyor mu"
  // iki farkli soru, metrikte de ayri gorunmeleri lazim.
  ["internet", "internet dogrulandi (SIM calisiyor)"],
];
const ADIM_ADI = new Map(ADIMLAR);

const bir = (n) => n.toFixed(1);

// Saniyeyi hizalanmis "12.3 sn" olarak yazar (sutunlar kaymasin).
const sure = (sn) => `${bir(sn).padStart(6)} sn`;

// PURE: bir hazirlama/provizyon calistirmasini izler.
//
// simdi: milisaniye veren fonksiyon (varsayilan Date.now). Testte sabitlenir.
// Doner: { olay, ilerleme, ozet, gecenSn }
//   olay(o)      -> satir dizisi (bos olabilir). Cekirdegin `olay` cagrisi.
//   ilerleme(m)  -> satir dizisi. Cekirdegin `ilerle` cagrisi (duz metin).
//   ozet()       -> calistirma sonu tablosu (satir dizisi).
export function ilerlemeIzleyici({ simdi = Date.now } = {}) {
  const baslangic = simdi();
  const gecenSn = () => (simdi() - baslangic) / 1000;
  // Damgalanan adimlar: [{ ad, anSn }]. Ayni adim tur'u ikinci kez gelirse
  // (or. iki yazma grubu) TEKRAR damgalanmaz — adim "yazma basladi", grup
  // sayisi degil.
  const damgalar = [];
  const gorulen = new Set();
  let telefon = null;
  let uyarilar = [];

  const damgala = (tur, ek = "") => {
    const ad = ADIM_ADI.get(tur);
    if (!ad || gorulen.has(tur)) return [];
    gorulen.add(tur);
    damgalar.push({ ad, anSn: gecenSn() });
    const sira = `[${damgalar.length}/${ADIMLAR.length}]`;
    return [`${sira} ${ad}${ek ? ` — ${ek}` : ""}${sure(gecenSn()).padStart(12)}`];
  };

  return {
    gecenSn,

    // Cekirdegin yapilandirilmis olayi -> ekran satirlari.
    olay(o) {
      if (!o || typeof o.tur !== "string") return [];
      switch (o.tur) {
        case "algilandi":
          return damgala("algilandi", o.konum ? `${o.konum} (${o.eylem})` : o.eylem);

        case "plan": {
          const d = o.plan?.degisecek_sayisi ?? 0;
          const a = o.plan?.ayni_sayisi ?? 0;
          return damgala("plan", `${d} ayar degisecek, ${a} ayar zaten dogru`);
        }

        case "yaziliyor":
          // Ilk grup adimi damgalar; sonraki gruplar DURUM satiri olur —
          // yoksa her grup icin bir adim satiri birikirdi.
          return gorulen.has("yaziliyor")
            ? [{ metin: `      yaziliyor: ${o.grup} (${o.anahtarlar?.length ?? 0} ayar)`,
              yenile: true }]
            : damgala("yaziliyor", `${o.grup} (${o.anahtarlar?.length ?? 0} ayar)`);

        case "yazildi":
          return damgala("yazildi");

        case "yazma_hatasi":
          uyarilar.push(`${o.grup} grubunda ${o.anahtarlar?.length ?? 0} ayar YAZILAMADI`);
          return [`  ✗ ${o.grup}: yazma hatasi (${o.anahtarlar?.length ?? 0} ayar)`];

        case "reboot":
          return damgala("reboot");

        case "dogrulama":
          // Reboot penceresi: saniyede bir gelir. TEK satirda guncellenir.
          return [{ metin: o.durum === "oturmadi"
            ? `      dogrulama: ${o.kalan?.length ?? 0} ayar henuz oturmadi`
            : `      modem bekleniyor (${bir(gecenSn())} sn)`, yenile: true }];

        case "dogrulandi":
          return damgala("dogrulandi", `${o.bekleme_sn} sn bekledi`);

        case "internet_bekleniyor":
          return [{ metin: `      internet bekleniyor — SIM dogrulaniyor`
            + ` (${o.gecen_sn}/${o.max_sn} sn)`, yenile: true }];

        case "internet":
          return o.var
            ? damgala("internet", `WAN ${o.wan_ip} · ${o.sure_sn} sn`)
            : [`  ! internet GELMEDI (${o.sure_sn} sn bekledi)`
              + ` — SIM durumu: ${o.sim_durumu || "?"}`];

        case "sim_kilit": {
          const t = String(o.kilit || "").toUpperCase();
          uyarilar.push(`SIM ${t} kilitli`);
          return [`  ! SIM ${t} KILITLI — kalan hak: PIN ${o.pin_kalan ?? "?"}`
            + `, PUK ${o.puk_kalan ?? "?"}`];
        }

        case "pin_deneniyor":
          return ["      SIM PIN yaziliyor (TEK deneme)"];

        // Numara okunur okunmaz ekrana: operator hangi hattin kaydedildigini
        // kurulum bitmeden gormeli.
        case "telefon":
          telefon = o.numara;
          return [`  → telefon: ${bicimliTelefon(o.numara)}  (${telefonKaynak(o.kaynak)})`];

        default:
          return [];
      }
    },

    // Duz metin ilerleme. Cekirdek bunlari cok siklikla uretiyor (her nvram
    // okumasi, her dogrulama denemesi); hepsini akisa basmak terminali
    // kullanissiz yapardi — DURUM satiri olarak tek yerde guncelleniyor.
    ilerleme(m) {
      if (!m) return [];
      return [{ metin: `      ${m}`, yenile: true }];
    },

    // Calistirma sonu: adim kirilimi + toplam + darbogaz.
    ozet() {
      const s = [];
      const toplam = gecenSn();
      if (!damgalar.length) {
        return [`  Sure: ${bir(toplam)} sn (adim damgalanmadi)`];
      }
      const satirlar = damgalar.map((d, i) => ({
        ad: d.ad,
        kendi: d.anSn - (i === 0 ? 0 : damgalar[i - 1].anSn),
        an: d.anSn,
      }));
      const enUzun = Math.max(...satirlar.map((x) => x.kendi));

      s.push("");
      s.push("  ADIM SURELERI");
      for (const x of satirlar) {
        // Darbogaz isaretlenir: hangi adim zamani yiyor, tek bakista gorunsun.
        const im = x.kendi === enUzun && satirlar.length > 1 ? "▲" : " ";
        s.push(`   ${im} ${x.ad.padEnd(34)}${sure(x.kendi)}  (${bir(x.an)} sn'de)`);
      }
      s.push(`     ${"TOPLAM".padEnd(34)}${sure(toplam)}`);
      if (telefon) s.push(`     ${"kaydedilen hat".padEnd(34)}${bicimliTelefon(telefon)}`);
      for (const u of uyarilar) s.push(`   ! ${u}`);
      return s;
    },
  };
}

// 5350634747 -> 0535 063 47 47. Okunabilirlik icin: operator numarayi
// ekranda GOZLE dogrulayacak, 11 haneli tek blok bunu zorlastiriyor.
export function bicimliTelefon(numara) {
  const d = String(numara ?? "").replace(/\D/g, "");
  if (d.length !== 10 && d.length !== 11) return String(numara ?? "—");
  const on = d.length === 11 ? d : `0${d}`;
  return `${on.slice(0, 4)} ${on.slice(4, 7)} ${on.slice(7, 9)} ${on.slice(9)}`;
}

// Numara NEREDEN geldi? Operator buna gore guvenir: SIM'den okunan numara
// elle yazilandan daha guvenilir.
function telefonKaynak(kaynak) {
  return {
    cihaz: "SIM'den okundu",
    girdi: "--telefon ile verildi",
    operator: "elle girildi",
  }[kaynak] ?? (kaynak || "kaynak bilinmiyor");
}
