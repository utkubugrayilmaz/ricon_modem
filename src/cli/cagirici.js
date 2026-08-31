// Genel cagirici — cekirdegin HERHANGI bir fonksiyonunu adiyla calistirir.
//
// Neden var: `ricon.js` her yetenek icin elle bir `case` yaziyordu. Yeni bir
// fonksiyon eklendiginde CLI'a dokunmak gerekiyor, dokunulmazsa fonksiyon
// terminalden erisilemez kaliyordu. Bu modul o bagi kesiyor: src/index.js'ten
// export edilen ne varsa `ricon.js calistir <ad>` ile cagrilabilir.
//
// KURAL (tum cekirdek gibi): hicbir sey import ETMEZ, process.env/argv
// OKUMAZ, stdout'a YAZMAZ. Modul namespace'i ve argv PARAMETRE olarak gelir.
// Boylece hem katman bagimliligi sifir, hem de saf olarak test edilebilir.

// Fonksiyonun ILK parametresinin kaynak metnini cikarir.
// Doner: "" (parametresiz) | "opts" | "{ host, kaynakIp }" | "ham" ...
export function ilkParametre(fn) {
  const s = String(fn);
  const ac = s.indexOf("(");
  if (ac === -1) return "";
  let derinlik = 0;
  let i = ac;
  for (; i < s.length; i += 1) {
    if (s[i] === "(") derinlik += 1;
    else if (s[i] === ")") { derinlik -= 1; if (derinlik === 0) break; }
  }
  const ic = s.slice(ac + 1, i).trim();
  if (!ic) return "";
  // Ilk virgule kadar — ama parantez/suslu/kose icindeki virguller sayilmaz
  // (`{ a = 1, b }` tek parametredir).
  let k = 0;
  let j = 0;
  for (; j < ic.length; j += 1) {
    const c = ic[j];
    if ("({[".includes(c)) k += 1;
    else if (")}]".includes(c)) k -= 1;
    else if (c === "," && k === 0) break;
  }
  return ic.slice(0, j).trim();
}

// Cekirdek sozlesmesi: cihaza giden her fonksiyonun ilk parametresi ya `opts`
// adini tasir ya da { host, kaynakIp, kimlik } gibi yikilmis bir opts'tur.
// Saf fonksiyonlar (parseCnum, normalizePhone, settingLabel...) ham deger alir.
//
// Yikma bicimi TEK BASINA yetmez: provisionEksikleri({ modemVar, simTakili })
// da yikma kullanir ama opts ALMAZ. Bu yuzden opts'a ozgu anahtar araniyor.
const OPTS_ANAHTARI = /\b(host|fabrikaHost|sahaHost|kaynakIp|kimlik)\b/;

export function optsAlirMi(fn) {
  const p = ilkParametre(fn);
  if (/^opts\b/.test(p)) return true;
  return p.startsWith("{") && OPTS_ANAHTARI.test(p);
}

// argv -> { bayraklar, konumsallar }
//
// `--` AYRAC: oncesi opts'a karisan bayrak, sonrasi fonksiyona dogrudan giden
// konumsal arguman. Ayrac olmadan "AT+CNUM" gibi bir degerin bayrak mi
// arguman mi oldugu belirsiz kalirdi.
//
//   ["--host", "5.5.5.1", "--", "AT+CNUM"]
//     -> { bayraklar: { host: "5.5.5.1" }, konumsallar: ["AT+CNUM"] }
//
// Degersiz bayrak `true` olur: ["--zorla"] -> { zorla: true }
export function argvAyikla(argv = []) {
  const ayrac = argv.indexOf("--");
  const oncesi = ayrac === -1 ? argv : argv.slice(0, ayrac);
  const konumsallar = ayrac === -1 ? [] : argv.slice(ayrac + 1);
  const bayraklar = {};
  for (let i = 0; i < oncesi.length; i += 1) {
    const p = oncesi[i];
    if (!p.startsWith("--")) continue;
    // --kaynak-ip -> kaynakIp
    const ad = p.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const sonraki = oncesi[i + 1];
    if (sonraki !== undefined && !sonraki.startsWith("--")) { bayraklar[ad] = sonraki; i += 1; }
    else bayraklar[ad] = true;
  }
  return { bayraklar, konumsallar };
}

// Cagrilabilir yuzeyin tamami. tur: "fonksiyon" | "sabit".
export function fonksiyonlariListele(mod) {
  return Object.entries(mod)
    .map(([ad, deger]) => (typeof deger === "function"
      ? { ad, tur: "fonksiyon", optsAlir: optsAlirMi(deger), imza: ilkParametre(deger) }
      : { ad, tur: "sabit", optsAlir: false, imza: null }))
    .sort((a, b) => a.ad.localeCompare(b.ad));
}

// Listeyi insan-okunur metne cevirir (stderr'a basilacak).
export function listeMetni(liste) {
  const s = [];
  const fonksiyonlar = liste.filter((x) => x.tur === "fonksiyon");
  const sabitler = liste.filter((x) => x.tur === "sabit");
  s.push(`  CIHAZA GIDEN (${fonksiyonlar.filter((x) => x.optsAlir).length})`
    + "  — ortam/bayraklar opts olarak gecer");
  for (const f of fonksiyonlar.filter((x) => x.optsAlir)) s.push(`    ${f.ad}`);
  s.push(`\n  SAF (${fonksiyonlar.filter((x) => !x.optsAlir).length})`
    + "  — argumanlar `--` sonrasi verilir");
  for (const f of fonksiyonlar.filter((x) => !x.optsAlir)) {
    s.push(`    ${f.ad.padEnd(26)}(${f.imza}${f.imza ? ", ..." : ""})`);
  }
  if (sabitler.length) {
    s.push(`\n  SABITLER (${sabitler.length})  — yazdirilir`);
    s.push("    " + sabitler.map((x) => x.ad).join(", "));
  }
  return s.join("\n");
}

// Bilinmeyen ada en yakin adaylari bulur (basit: onek/parca eslesmesi).
function benzerler(ad, liste) {
  const k = ad.toLowerCase();
  return liste.map((x) => x.ad)
    .filter((a) => a.toLowerCase().includes(k) || k.includes(a.toLowerCase()))
    .slice(0, 5);
}

// Fonksiyonu cagirir. THROW ETMEZ — cekirdek sozlesmesi geregi sonuc nesnesi
// doner ve sorun varsa problems[] icinde gelir.
//
// opts        : ortamdan turemis cekirdek opts'u (host, kaynakIp, kimlik...)
// bayraklar   : argvAyikla ciktisi; opts'un uzerine yazilir
// konumsallar : `--` sonrasi argumanlar
// saf         : true ise opts ENJEKTE EDILMEZ (otomatik tespiti ezer)
export async function cagir(mod, ad, { opts = {}, bayraklar = {},
  konumsallar = [], saf = false } = {}) {
  const liste = fonksiyonlariListele(mod);
  const zaman = new Date().toISOString();

  if (!ad) {
    return { zaman, komut: "calistir", ok: true, liste,
      listeMetni: listeMetni(liste), problems: [] };
  }
  if (!(ad in mod)) {
    const yakin = benzerler(ad, liste);
    return { zaman, komut: "calistir", fonksiyon: ad, ok: false, problems: [{
      kod: "ARGS", severity: "error",
      message: `Unknown export: ${ad}`,
      check: yakin.length
        ? `Did you mean: ${yakin.join(", ")}? Full list: ricon.js calistir`
        : "Run `ricon.js calistir` with no name to list everything.",
    }] };
  }

  const deger = mod[ad];
  if (typeof deger !== "function") {
    return { zaman, komut: "calistir", fonksiyon: ad, tur: "sabit", ok: true,
      deger, problems: [] };
  }

  const optsAlir = saf ? false : optsAlirMi(deger);
  const argumanlar = optsAlir
    ? [{ ...opts, ...bayraklar }, ...konumsallar]
    : konumsallar;

  // Cekirdek throw etmez, ama `calistir` KEYFI bir fonksiyonu KEYFI
  // argumanlarla cagirabilir (or. eksik arguman). Burada yakalanmazsa
  // kullanici stack trace gorurdu; sozlesme sonuc nesnesi diyor.
  let sonuc;
  try {
    sonuc = await deger(...argumanlar);
  } catch (e) {
    return { zaman, komut: "calistir", fonksiyon: ad, ok: false, problems: [{
      kod: "CALISTIR_HATASI", severity: "error",
      message: `${ad}(): ${e?.name}: ${e?.message}`,
      check: `Check the argument shape: first parameter is \`${ilkParametre(deger)}\`.`
        + " Positional arguments go after `--`.",
    }] };
  }

  // Sonuc nesne degilse (string/bool/dizi) sarmala — CLI sozlesmesi bir
  // rapor nesnesi bekliyor (writeJson + summaryText + cikis kodu).
  if (sonuc === null || typeof sonuc !== "object" || Array.isArray(sonuc)) {
    return { zaman, komut: "calistir", fonksiyon: ad, ok: true, deger: sonuc, problems: [] };
  }
  return { zaman, komut: "calistir", fonksiyon: ad, ...sonuc,
    problems: sonuc.problems ?? [] };
}
