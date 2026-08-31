// Cihaz OKUMA islemleri — dogrula / oku / konsol.
//
// Neden index.js'ten ayrildi: index.js hem PUBLIC API KAPISI hem bu
// islemlerin govdesiydi (316 satirin 250'si govde). API'yi ogrenmek icin
// acilan dosyada uygulama gurultusu vardi. Simdi index.js yalniz kapi.
//
// KURAL (index.js ile ayni): process.env OKUMAZ, argv OKUMAZ, stdout'a
// YAZMAZ. Girdi `opts`, cikti sonuc nesnesi (throw yok, problems[]).

import { ENDPOINTS } from "./settings.js";
import { Client, isHostBusy, lockHost, unlockHost } from "./net.js";
import { parsePairs, simView } from "./device.js";
import { parseNvram } from "./nvram.js";
import { localInterfaces, guessVendor } from "./net.js";
import { isReachable } from "./net.js";
import { consoleSystem, consoleNvram } from "./console.js";
import { problem, isOk } from "./problems.js";

const now = () => new Date().toISOString();
const prefixOf = (host) => host.split(".").slice(0, 3).join(".") + ".";
const notify = (opts, msg) => { if (typeof opts.progress === "function") opts.progress(msg); };

// --- dogrula: ortam/erisim teshisi ---
export async function checkDevice(opts) {
  const { host, sourceIp, credentials } = opts;
  const report = { timestamp: now(), command: "verify", modemIp: host, problems: [] };
  report.localInterfaces = localInterfaces();
  report.sourceIp = sourceIp || null;
  if (!sourceIp) report.problems.push(problem("NO_SOURCE_IP", `${prefixOf(host)}50`));

  report.reachable = await isReachable(host, sourceIp);
  if (!report.reachable) report.problems.push(problem("DEVICE_UNREACHABLE", host));

  if (report.reachable) {
    const c = new Client({ host, sourceIp, credentials });
    const system = await c.get("/asp/status/Info.live.htm");
    report.systemEndpoint = { code: system.code, size: system.body?.length ?? 0 };
    const authed = await c.get("/asp/status/Status_Internet.live.asp");
    report.authEndpoint = { code: authed.code };
    report.problems.push(...authed.problems);
  }
  report.credentialsReady = Boolean(credentials);
  report.ok = isOk(report.problems);
  return report;
}

// --- oku: HER SEYI cek (sistem + SIM + ayar + nvram) ---
export async function readDevice(opts) {
  const { host, sourceIp, credentials } = opts;
  if (isHostBusy(host)) {
    return { timestamp: now(), command: "read", modemIp: host, ok: false,
      problems: [problem("DEVICE_BUSY", host)] };
  }
  lockHost(host);
  try {
    const c = new Client({ host, sourceIp, credentials });
    const report = {
      timestamp: now(), command: "read", modemIp: host, credentialsReady: Boolean(credentials),
      endpoints: {}, rawFields: {}, problems: [],
    };
    for (const uc of ENDPOINTS) {
      notify(opts, `read ${uc.path}`);
      const r = await c.get(uc.path);
      report.endpoints[uc.name] = { path: uc.path, code: r.code, size: r.body?.length ?? 0, kind: uc.kind };
      report.problems.push(...r.problems.filter((p) => p.severity === "error" || p.code === "AUTH_REQUIRED"));
      if (!r.ok || !r.body) continue;
      if (uc.format === "ddwrt") {
        Object.assign(report.rawFields, parsePairs(r.body));
      } else if (uc.format === "nvram") {
        const { values, count, problems } = parseNvram(r.bodyBuffer);
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
    lanIp: al("lan_ip"),
    lan_mac: al("lan_mac"),
    lanMacVendor: guessVendor(al("lan_mac")),
    wan_mac1: al("wan_mac1"),
    wifiStatus: al("wl_radio"),
    wifiChannel: al("wl_channel"),
    uptime: al("uptime_spe") || al("uptime"),
    memory: al("mem_info"),
    lan_proto: al("lan_proto"),
  };
}

// --- konsol: telnet root shell (salt okunur) ---
// opts.nvram=true ise tam nvram; degilse sistem kesfi.
export async function readConsole(opts) {
  const { host, sourceIp, credentials, nvram = false } = opts;
  if (!credentials) {
    return { timestamp: now(), command: "console", modemIp: host, ok: false,
      problems: [problem("AUTH_REQUIRED", "telnet 5123")] };
  }
  const consoleOptions = { host, sourceIp, user: credentials.user, password: credentials.password };
  const report = { timestamp: now(), command: "console", modemIp: host, problems: [] };
  if (nvram) {
    notify(opts, "full nvram dump (CLI)");
    const { values, count, problems } = await consoleNvram(consoleOptions);
    report.nvram = values;
    report.nvramKeyCount = count;
    report.problems.push(...problems);
  } else {
    notify(opts, "system discovery");
    const { outs, problems } = await consoleSystem(consoleOptions);
    report.commands = outs;
    report.problems.push(...problems);
  }
  report.ok = isOk(report.problems);
  return report;
}

