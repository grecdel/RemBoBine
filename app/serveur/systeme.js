// Rembobine — l'état de la machine (écran « Santé » de Rembobine OS), l'alerte « disque presque plein »,
// l'extinction / le redémarrage propres, et le partage du dossier Rembobine sur le réseau (Samba).
// Tout est lu localement (/sys, /proc, statfs) : aucun appel à internet.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const GO = 1e9;
// presque plein : moins de 5 % ou moins de 2 Go de libre
const diskLow = (d) => d.total > 0 && (d.free < 2 * GO || d.free / d.total < 0.05);

function createSysteme(o = {}) {
  const P = { thermal: "/sys/class/thermal", wireless: "/proc/net/wireless", ...(o.paths || {}) };
  const run = o.run || ((cmd, args, opt) => spawnSync(cmd, args, { encoding: "utf8", timeout: 20000, ...(opt || {}) }));
  const which = o.which || ((p) => { try { const r = spawnSync(process.platform === "win32" ? "where" : "which", [p], { encoding: "utf8" }); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : ""; } catch (_) { return ""; } });
  const roots = () => (typeof o.roots === "function" ? o.roots() : o.roots) || [];

  // température du processeur : la zone « cpu / soc » si elle existe, sinon la première
  function temp() {
    let zones = []; try { zones = fs.readdirSync(P.thermal).filter((n) => /^thermal_zone\d+$/.test(n)).sort(); } catch (_) { return null; }
    let first = null;
    for (const z of zones) {
      let v; try { v = Number(fs.readFileSync(path.join(P.thermal, z, "temp"), "utf8")) / 1000; } catch (_) { continue; }
      if (!isFinite(v) || v <= 0) continue;
      let type = ""; try { type = fs.readFileSync(path.join(P.thermal, z, "type"), "utf8").trim(); } catch (_) {}
      if (/cpu|soc|x86_pkg|k10temp|coretemp/i.test(type)) return Math.round(v * 10) / 10;
      if (first === null) first = v;
    }
    return first === null ? null : Math.round(first * 10) / 10;
  }
  // Wi-Fi : force du signal lue dans /proc/net/wireless (qualité sur 70), nom du réseau par nmcli ou iwgetid
  let ssidT = 0, ssidV = "";
  function wifi() {
    let txt = ""; try { txt = fs.readFileSync(P.wireless, "utf8"); } catch (_) { return null; }
    const line = txt.split("\n").slice(2).find((l) => /:/.test(l)); if (!line) return null;
    const [iface, rest] = line.split(":"); const f = rest.trim().split(/\s+/);
    const q = parseFloat(f[1]), dbm = parseFloat(f[2]);
    const w = { iface: iface.trim(), signal: isFinite(q) ? Math.max(0, Math.min(100, Math.round(q / 70 * 100))) : null, dbm: isFinite(dbm) ? dbm : null, ssid: "" };
    if (o.ssid !== undefined) w.ssid = o.ssid;
    else if (Date.now() - ssidT < 60000) w.ssid = ssidV;   // (le nom du réseau change rarement : relu au plus une fois par minute)
    else {
      ssidT = Date.now();
      const nm = which("nmcli"), iw = which("iwgetid");
      if (nm) { const r = run(nm, ["-t", "-f", "ACTIVE,SSID", "device", "wifi"], { timeout: 6000 }); const a = String(r.stdout || "").split("\n").find((l) => l.startsWith("yes:")); if (a) w.ssid = a.slice(4); }
      if (!w.ssid && iw) w.ssid = String(run(iw, ["-r"], { timeout: 4000 }).stdout || "").trim();
      ssidV = w.ssid;
    }
    return w;
  }
  // disques : celui de chaque dossier de médias (sans doublon) et celui du système
  function disks() {
    const out = [], seen = new Set(), list = roots().map((r, i) => [r, i === 0 ? "Rembobine" : path.basename(r) || r]);
    if (process.platform !== "win32") list.push(["/", "Système"]);
    for (const [r, name] of list) {
      try {
        const s = (o.statfs || fs.statfsSync)(r), dev = fs.statSync(r).dev, total = s.blocks * s.bsize, free = s.bavail * s.bsize;
        const k = `${dev}:${total}`; if (seen.has(k)) continue; seen.add(k);
        const d = { name, path: r, total, free, used: total - free }; d.low = diskLow(d); out.push(d);
      } catch (_) {}
    }
    return out;
  }
  function etat() {
    const total = os.totalmem(), free = os.freemem();
    let avail = free; try { const m = /MemAvailable:\s+(\d+)/.exec(fs.readFileSync("/proc/meminfo", "utf8")); if (m) avail = Number(m[1]) * 1024; } catch (_) {}
    const ds = disks();
    return { temp: temp(), cpu: Math.min(1, os.loadavg()[0] / (os.cpus().length || 1)), mem: { total, free: avail, used: total - avail },
      uptime: os.uptime(), disks: ds, wifi: wifi(), low: ds.filter((d) => d.low).map((d) => ({ name: d.name, free: d.free, total: d.total })) };
  }

  // ---------- alerte : disque presque plein (au plus une fois toutes les 6 h par disque) ----------
  const warned = new Map();
  function checkDisks(now = Date.now()) {
    const msgs = [];
    for (const d of disks()) {
      if (!d.low) { warned.delete(d.path); continue; }
      if (now - (warned.get(d.path) || 0) < 6 * 3600 * 1000) continue;
      warned.set(d.path, now);
      const msg = `Disque presque plein (${d.name}) : il reste ${(d.free / GO).toFixed(1).replace(".", ",")} Go. Libère de la place pour que les enregistrements et les sauvegardes continuent.`;
      msgs.push(msg); if (o.emit) o.emit({ type: "alert", msg, disk: d.name });
    }
    return msgs;
  }
  const timer = setInterval(() => { try { checkDisks(); } catch (_) {} }, 10 * 60 * 1000); if (timer.unref) timer.unref();
  setTimeout(() => { try { checkDisks(); } catch (_) {} }, 20000).unref?.();

  // ---------- extinction / redémarrage propres ----------
  // sur Rembobine OS, une règle sudo (build_os.sh) autorise seulement « systemctl poweroff » et « systemctl reboot »
  function power(action) {
    const verb = action === "reboot" ? "reboot" : action === "shutdown" ? "poweroff" : "";
    if (!verb) return { ok: false, err: "Action inconnue." };
    if (process.platform === "win32") { const r = run("shutdown", [verb === "reboot" ? "/r" : "/s", "/t", "5"]); return r.status === 0 ? { ok: true } : { ok: false, err: "Windows a refusé." }; }
    const sc = fs.existsSync("/usr/bin/systemctl") ? "/usr/bin/systemctl" : which("systemctl") || "systemctl";
    let r = run("sudo", ["-n", sc, verb]); if (r.status === 0) return { ok: true };
    r = run(sc, [verb]); if (r.status === 0) return { ok: true };
    return { ok: false, err: "Ce système refuse l'extinction depuis Rembobine." };
  }

  // ---------- partage du dossier Rembobine (Samba, Rembobine OS) ----------
  const SHARE_SVCS = ["smbd", "nmbd", "wsdd", "rembobine-partage-annonce"];
  const smbd = () => fs.existsSync("/usr/sbin/smbd") || !!which("smbd");
  function share() {
    if (process.platform !== "linux" || !smbd()) return { installed: false, on: false };
    const on = String(run("systemctl", ["is-active", "smbd"], { timeout: 5000 }).stdout || "").trim() === "active";
    const host = os.hostname() || "rembobine";
    // mot de passe du partage : tiré au hasard au premier démarrage de Rembobine OS (build_os.sh), lisible par le serveur seulement
    let pass = ""; try { pass = fs.readFileSync(o.passFile || "/etc/rembobine/mot-de-passe", "utf8").trim().slice(0, 64); } catch (_) {}
    return { installed: true, on, name: "Rembobine", user: os.userInfo().username, pass, win: `\\\\${host}\\Rembobine`, mac: `smb://${host}.local/Rembobine` };
  }
  function setShare(on) {
    if (!share().installed) return { ok: false, err: "Le partage réseau (Samba) n'est pas installé sur cet appareil." };
    // « enable/disable --now » : changé tout de suite ET gardé au redémarrage (systemd s'en souvient).
    // wsdd (le dossier visible dans le « Réseau » de Windows) et rembobine-partage-annonce (l'annonce Bonjour pour les Mac,
    // build_os.sh) suivent le partage ; nmbd, wsdd et l'annonce peuvent manquer : seul smbd compte.
    let ok = true;
    for (const svc of SHARE_SVCS) { const r = run("sudo", ["-n", "/usr/bin/systemctl", on ? "enable" : "disable", "--now", svc]); if (r.status !== 0 && svc === "smbd") ok = false; }
    return ok ? { ok: true, ...share() } : { ok: false, err: "Le système a refusé de changer le partage." };
  }
  // SSH (Avancé) : même principe
  function ssh() { return process.platform === "linux" && String(run("systemctl", ["is-active", "ssh"], { timeout: 5000 }).stdout || "").trim() === "active"; }
  function setSsh(on) { const r = run("sudo", ["-n", "/usr/bin/systemctl", on ? "enable" : "disable", "--now", "ssh"]); return r.status === 0 ? { ok: true } : { ok: false, err: "Le système a refusé." }; }

  return { temp, wifi, disks, etat, checkDisks, power, share, setShare, ssh, setSsh, stop: () => clearInterval(timer) };
}

module.exports = { createSysteme, diskLow };
