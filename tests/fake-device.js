// SAHTE MODEM (telnet) — cihazsiz soket testi icin.
//
// NEDEN VAR: console.js'in soket surucusu (login -> parola -> prompt ->
// toplu komut -> marker) bugune kadar YALNIZCA gercek cihazla elle
// dogrulaniyordu; tests/console.test.js bunu basinda acikca yaziyordu.
// Yani telnet yolunun otomatik kapsamasi SIFIRDI — ve en riskli
// duzeltmeler (zamanlayici sizintisi, reboot'un kac kez gonderildigi)
// tam oraya iniyor.
//
// Uretim kodunda hicbir degisiklik gerekmedi: runConsole zaten portu
// `opts`'tan aliyor (console.js), tests/net.test.js'teki HTTP sahte
// modemiyle ayni dikis.
//
// EN ONEMLI YETENEK: `connections` dizisi her TCP baglantisini ayri
// kaydeder. Yeniden deneme sayisi = baglanti sayisi. "reboot uc kez
// gonderiliyor" kusurunun baska turlu testi yok.

import net from "node:net";

const START_MARK = "__RCN_BASLA__";
const END_MARK = "__RCN_BIT__";

// Toplu satirdan tek tek komutlari cikarir.
// Bicim: `echo BASLA; komut; echo BIT; echo BASLA; komut2; echo BIT`
// Isteksiz (non-greedy) eslesme her komutu kendi marker ciftiyle alir.
function parseBatch(line) {
  const re = new RegExp(`echo ${START_MARK}; ([\\s\\S]*?); echo ${END_MARK}`, "g");
  const out = [];
  let m;
  while ((m = re.exec(line)) !== null) out.push(m[1]);
  return out;
}

// Sahte cihazi baslatir. Doner: { port, connections, close }
//
// `handle(command)` her komut icin cagrilir:
//   - string    -> komutun ciktisi
//   - null      -> BAGLANTI DUSURULUR (reboot'un hatti TEMIZ kopmasi)
//   - undefined -> CEVAP YOK, hat ACIK kalir (modem ASILI kalmasi)
// Bu iki basarisizlik AYNI SEY DEGIL ve farkli kod yollarina giriyor:
// temiz kopma "close" olayina, asili kalma "timeout" olayina dusuyor —
// ve yalnizca ikincisi yeniden denemeyi tetikliyor. Ayrimi taklit
// edemeyen bir sahte cihaz yanlis sonuc verirdi.
export function startFakeDevice({
  handle = () => "",
  user = "riconadmin",
  password = "sifre",
  prompt = "riconadmin@router:~# ",
} = {}) {
  const connections = [];

  const server = net.createServer((socket) => {
    // Her baglanti kendi kaydini tutar: hangi komutlar geldi, tamamlandi mi.
    const record = { commands: [], completed: false, user: null };
    connections.push(record);

    let stage = 0;   // 0=login bekleniyor 1=parola bekleniyor 2=komut bekleniyor
    let buf = "";

    socket.on("error", () => { /* test kapatirken RST olabilir; onemsiz */ });
    socket.write("router login: ");

    socket.on("data", (chunk) => {
      buf += chunk.toString("latin1");
      // Satir satir isle: istemci bir seferde birden fazla satir gonderebilir.
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).replace(/\r/g, "");
        buf = buf.slice(nl + 1);

        if (stage === 0) { record.user = line; stage = 1; socket.write("Password: "); continue; }
        if (stage === 1) { stage = 2; socket.write(`\r\n${prompt}`); continue; }

        if (line.trim() === "exit") { socket.end(); continue; }

        const commands = parseBatch(line);
        if (commands.length === 0) { socket.write(prompt); continue; }

        // Gercek terminal once satiri EKO'lar. Onemli: eko satirinda
        // marker'lar satir ORTASINDA kalir, bu yuzden istemcinin
        // `^MARK$` regex'i onlari yakalamaz. Ekoyu gondermek bu ayrimin
        // gercekten calistigini da sinar.
        socket.write(`${line}\r\n`);

        let ending = null;   // "drop" | "hang" | null
        for (const command of commands) {
          record.commands.push(command);
          const answer = handle(command);
          if (answer === null) { ending = "drop"; break; }
          if (answer === undefined) { ending = "hang"; break; }
          socket.write(`${START_MARK}\r\n${answer}\r\n${END_MARK}\r\n`);
        }
        if (ending === "drop") { socket.destroy(); return; }
        if (ending === "hang") return;   // sessiz kal, hatti kapatma

        record.completed = true;
        socket.write(prompt);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        connections,
        // Bu cihaza baglanmak icin hazir opts (kimlik dahil — runConsole
        // kimliksiz HIC denemez, bkz. console.js CONSOLE_AUTH_REQUIRED).
        opts: { host: "127.0.0.1", port: server.address().port, user, password },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
