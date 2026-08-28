// Cihaz OKUMA islemleri — dogrula / oku / kesif / konsol.
//
// Neden index.js'ten ayrildi: index.js hem PUBLIC API KAPISI hem bu
// islemlerin govdesiydi (316 satirin 250'si govde). API'yi ogrenmek icin
// acilan dosyada uygulama gurultusu vardi. Simdi index.js yalniz kapi.
//
// KURAL (index.js ile ayni): process.env OKUMAZ, argv OKUMAZ, stdout'a
// YAZMAZ. Girdi `opts`, cikti sonuc nesnesi (throw yok, problems[]).

import { ENDPOINTS, TCP_PORTS } from "./constants.js";
import { Client, isHostBusy, lockHost, unlockHost } from "./client.js";
import { parsePairs, simView } from "./ddwrt.js";
import { parseNvram } from "./nvram.js";
import { localInterfaces, arpTable, ipv6Neighbors, guessVendor } from "./network.js";
import { scanPorts, isReachable } from "./scanner.js";
import { snmpIdentity } from "./snmp.js";
import { consoleRecon, consoleNvram } from "./console.js";
import { problem, isOk } from "./problems.js";

const now = () => new Date().toISOString();
const subnetPrefix = (host) => host.split(".").slice(0, 3).join(".") + ".";
const notify = (options, message) => { if (typeof options.onProgress === "function") options.onProgress(message); };

// --- dogrula: ortam/erisim teshisi ---
export async function checkDevice(options) {
  const { host, sourceIp, credentials } = options;
  const report = { timestamp: now(), command: "dogrula", modemIp: host, problems: [] };
  report.localIfaces = localInterfaces();
  report.sourceIp = sourceIp || null;
  if (!sourceIp) report.problems.push(problem("NO_SOURCE_IP", `${subnetPrefix(host)}50`));

  report.erisilebilir = await isReachable(host, sourceIp);
  if (!report.erisilebilir) report.problems.push(problem("DEVICE_UNREACHABLE", host));

  if (report.erisilebilir) {
    const c = new Client({ host, sourceIp, credentials });
    const system = await c.get("/asp/status/Info.live.htm");
    report.systemEndpoint = { code: system.code, bytes: system.body?.length ?? 0 };
    const guarded = await c.get("/asp/status/Status_Internet.live.asp");
    report.authEndpoint = { code: guarded.code };
    report.problems.push(...guarded.problems);
  }
  report.identityReady = Boolean(credentials);
  report.ok = isOk(report.problems);
  return report;
}

// --- oku: HER SEYI cek (sistem + SIM + ayar + nvram) ---
export async function readDevice(options) {
  const { host, sourceIp, credentials } = options;
  if (isHostBusy(host)) {
    return { timestamp: now(), command: "oku", modemIp: host, ok: false,
      problems: [problem("DEVICE_BUSY", host)] };
  }
  lockHost(host);
  try {
    const c = new Client({ host, sourceIp, credentials });
    const report = {
      timestamp: now(), command: "oku", modemIp: host, identityReady: Boolean(credentials),
      endpoints: {}, rawFields: {}, problems: [],
    };
    for (const uc of ENDPOINTS) {
      notify(options, `oku ${uc.path}`);
      const r = await c.get(uc.path);
      report.endpoints[uc.name] = { path: uc.path, code: r.code, bytes: r.body?.length ?? 0, kind: uc.kind };
      report.problems.push(...r.problems.filter((p) => p.severity === "error" || p.code === "AUTH_REQUIRED"));
      if (!r.ok || !r.body) continue;
      if (uc.bicim === "ddwrt") {
        Object.assign(report.rawFields, parsePairs(r.body));
      } else if (uc.bicim === "nvram") {
        const { values, count, problems } = parseNvram(r.govdeBuf);
        report.nvram = values;
        report.nvramKeyCount = count;
        report.problems.push(...problems);
      } else {
        report.endpoints[uc.name].rawHtmlBytes = r.body.length;
      }
    }
    const { sim1, sim2 } = simView(report.rawFields);
    report.sim1 = sim1;
    report.sim2 = sim2;
    report.system = systemView(report.rawFields);
    report.ok = isOk(report.problems);
    return report;
  } finally {
    unlockHost(host);
  }
}

// Info.live.htm ham alanlarindan okunabilir sistem gorunumu.
export function systemView(raw) {
  const al = (k) => (raw[k] ?? "").trim() || undefined;
  return {
    lan_ip: al("lan_ip"),
    lanMac: al("lanMac"),
    lanMacVendor: guessVendor(al("lanMac")),
    wan_mac1: al("wan_mac1"),
    wifiStatus: al("wl_radio"),
    wifiChannel: al("wl_channel"),
    uptime: al("uptime_spe") || al("uptime"),
    memory: al("mem_info"),
    lan_proto: al("lan_proto"),
  };
}

// --- kesif: salt-okunur port/parmak-izi/SNMP ---
export async function discoverDevice(options) {
  const { host, sourceIp, community = "public" } = options;
  const report = { timestamp: now(), command: "kesif", modemIp: host, problems: [] };
  notify(options, "port taramasi");
  report.ports = (await scanPorts(host, sourceIp, TCP_PORTS)).map((p) => {
    const tanim = TCP_PORTS.find((k) => k.port === p.port);
    return { ...p, name: tanim?.name };
  });
  report.arp = await arpTable(subnetPrefix(host));
  report.mac = report.arp[host] || null;
  report.macVendor = guessVendor(report.mac);
  // IPv6 komsu tablosu: cihazin IPv4'u bilinmiyorsa (yanlis alt ag) OUI'den
  // yine de "orada bir Ricon var" denebilir — yanlis-IP teshisini kolaylastirir.
  report.ipv6_komsular = (await ipv6Neighbors())
    .map((k) => ({ ...k, uretici: guessVendor(k.mac) }))
    .filter((k) => k.uretici);

  const c = new Client({ host, sourceIp, credentials: null });
  notify(options, "HTTP parmak izi");
  const kok = await c.get("/");
  report.http = {
    code: kok.code,
    baslik: (kok.body.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || "").trim() || null,
    ddwrt_izi: /prototype\.js|WEB-ROUTER|Industrial Cellular Router/i.test(kok.body),
  };
  notify(options, "SNMP");
  report.snmp = await snmpIdentity(host, community);
  report.ok = isOk(report.problems);
  return report;
}

// --- konsol: telnet root shell (salt okunur) ---
// opts.nvram=true ise tam nvram; degilse sistem kesfi.
export async function readConsole(options) {
  const { host, sourceIp, credentials, nvram = false } = options;
  if (!credentials) {
    return { timestamp: now(), command: "konsol", modemIp: host, ok: false,
      problems: [problem("AUTH_REQUIRED", "telnet 5123")] };
  }
  const consoleOptions = { host, sourceIp, username: credentials.username, password: credentials.password };
  const report = { timestamp: now(), command: "konsol", modemIp: host, problems: [] };
  if (nvram) {
    notify(options, "nvram tam dokumu (CLI)");
    const { values, count, problems } = await consoleNvram(consoleOptions);
    report.nvram = values;
    report.nvramKeyCount = count;
    report.problems.push(...problems);
  } else {
    notify(options, "sistem kesfi");
    const { outputs, problems } = await consoleRecon(consoleOptions);
    report.commands = outputs;
    report.problems.push(...problems);
  }
  report.ok = isOk(report.problems);
  return report;
}

