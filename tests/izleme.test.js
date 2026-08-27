// Izleme (izle) testleri — kesinti tespiti ve sistem gorunumu. PURE, cihazsiz.

import { test } from "node:test";
import assert from "node:assert/strict";
import { kesintileriBul, systemView } from "../src/index.js";

// Ornek: erisim var ama internet yok -> "internet" kesintisi;
// erisim yok -> "yonetim" kesintisi (reboot penceresi).
const o = (an_sn, erisim, internet) => ({ an_sn, erisim, internet });

test("kesintileriBul: internet kesintisi baslangic/bitis/sure ile bulunur", () => {
  const k = kesintileriBul([
    o(0, true, false), o(5, true, false), o(10, true, true), o(15, true, true),
  ]);
  assert.equal(k.length, 1);
  assert.deepEqual(k[0], { tur: "internet", basla_sn: 0, bitis_sn: 10,
    sure_sn: 10, hala_suruyor: false });
});

test("kesintileriBul: yonetim kesintisi (cihaz cevap vermiyor) AYRI raporlanir", () => {
  const k = kesintileriBul([
    o(0, true, true), o(5, false, false), o(10, false, false), o(15, true, true),
  ]);
  const yonetim = k.filter((x) => x.tur === "yonetim");
  assert.equal(yonetim.length, 1);
  assert.equal(yonetim[0].basla_sn, 5);
  assert.equal(yonetim[0].sure_sn, 10);
  // Erisim YOKKEN "internet yok" ayri bir kesinti SAYILMAZ — cihaz kapali,
  // internet hakkinda bilgi yok. Yoksa her reboot iki kesinti gorunurdu.
  assert.equal(k.filter((x) => x.tur === "internet").length, 0);
});

test("kesintileriBul: sonuna kadar suren kesinti hala_suruyor:true", () => {
  const k = kesintileriBul([o(0, true, false), o(5, true, false)]);
  assert.equal(k[0].hala_suruyor, true);
  assert.equal(k[0].sure_sn, 5);
});

test("kesintileriBul: kesinti yoksa bos dizi", () => {
  assert.deepEqual(kesintileriBul([o(0, true, true), o(5, true, true)]), []);
  assert.deepEqual(kesintileriBul([]), []);
});

test("kesintileriBul: birden fazla kesinti zamana gore sirali doner", () => {
  const k = kesintileriBul([
    o(0, true, true), o(5, true, false), o(10, true, true),
    o(15, false, false), o(20, true, true),
  ]);
  assert.deepEqual(k.map((x) => x.basla_sn), [5, 15]);
});

test("systemView: ham alanlardan okunabilir gorunum, bos alan undefined", () => {
  const g = systemView({
    lan_ip: "5.5.5.1", lan_mac: "00:0C:43:43:5F:4E", wl_radio: "0",
    uptime_spe: "12:00 up 3 Min.", lan_proto: "static", mem_info: "  ",
  });
  assert.equal(g.lan_ip, "5.5.5.1");
  assert.equal(g.lan_mac_uretici, "Ralink/MediaTek", "OUI'den uretici turetiliyor");
  assert.equal(g.uptime, "12:00 up 3 Min.");
  assert.equal(g.bellek, undefined, "sadece bosluk olan alan undefined");
  assert.equal(g.wifi_kanal, undefined, "hic olmayan alan undefined");
});
