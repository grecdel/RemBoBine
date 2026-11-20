// Rembobine — téléphone, télécommande et séances entre amis (côté serveur de la maison).
//  - Voisins : chaque Rembobine de la maison s'annonce sur le réseau local (petit message UDP), et répond
//    quand un téléphone demande « qui est là ? ». La liste des autres Rembobine est servie par /api/voisins.
//    Rien ne sort de la maison : les annonces restent sur le réseau local (adresse de diffusion).
//  - Volume : les boutons de volume du téléphone règlent le lecteur de la TV ; sans film en cours,
//    le volume de la télé elle-même (HDMI-CEC), sinon celui de la machine (PipeWire / ALSA).
//  - Séances programmées : date, heure, film ; rappel envoyé à la TV et aux téléphones 10 minutes avant.
"use strict";
const dgram = require("dgram");
const os = require("os");
const crypto = require("crypto");
const fs = require("fs");

const UDP_PORT = 41380;
const RAPPEL_MS = 10 * 60 * 1000;

// adresses de la maison (10.x, 172.16-31.x, 192.168.x, 169.254.x), de Tailscale (100.64-127.x) ou de la machine elle-même
function privateIp(a) {
  const m = /^(?:::ffff:)?(\d+)\.(\d+)\.\d+\.\d+$/.exec(String(a)); if (!m) return false;
  const x = Number(m[1]), y = Number(m[2]);
  return x === 10 || x === 127 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254) || (x === 100 && y >= 64 && y <= 127);
}

function createTelephone(o) {
  const S = o.S, log = o.log || (() => {}), emit = o.emit || (() => {});
  const spawnSync = o.spawnSync || require("child_process").spawnSync, which = o.which || (() => "");
  const T = { id: crypto.randomBytes(6).toString("hex"), voisins: new Map(), sock: null, timers: [] };

  // ---------- voisins (plusieurs Rembobine dans la maison) ----------
  const me = () => ({ rbb: 1, id: T.id, name: String(S.cfg.name || "Rembobine").slice(0, 40), port: S.port, v: S.version });
  function targets() {
    if (o.udpTargets) return o.udpTargets;   // tests : adresses fixes
    const out = new Set([`255.255.255.255:${UDP_PORT}`]);
    for (const a of Object.values(os.networkInterfaces()).flat()) {
      if (!a || a.family !== "IPv4" || a.internal || !a.netmask) continue;
      const ip = a.address.split(".").map(Number), m = a.netmask.split(".").map(Number);
      out.add(ip.map((x, i) => (x & m[i]) | (~m[i] & 255)).join(".") + ":" + UDP_PORT);
    }
    return [...out];
  }
  function sendTo(msg, hostPort) {
    if (!T.sock) return; const i = hostPort.lastIndexOf(":"), buf = Buffer.from(JSON.stringify(msg));
    try { T.sock.send(buf, Number(hostPort.slice(i + 1)), hostPort.slice(0, i), () => {}); } catch (_) {}
  }
  function announce() { for (const t of targets()) sendTo({ ...me(), a: 1 }, t); }
  function onMsg(buf, rinfo) {
    let m; try { m = JSON.parse(String(buf).slice(0, 2000)); } catch (_) { return; }
    if (!m || m.rbb !== 1) return;
    // (seulement depuis le réseau de la maison ou Tailscale, et pas plus de 20 réponses par seconde : pas de réflexion vers internet)
    if (!privateIp(rinfo.address)) return;
    if (m.q) { const now = Date.now(); if (now - (T.qT || 0) > 1000) { T.qT = now; T.qN = 0; } if (++T.qN > 20) return; return sendTo(me(), `${rinfo.address}:${rinfo.port}`); }   // « qui est là ? » d'un téléphone : on répond à lui seul
    if (!m.id || m.id === T.id || !(Number(m.port) > 0 && Number(m.port) < 65536)) return;
    const known = T.voisins.has(m.id);
    if (!known && T.voisins.size >= 32) return;   // pas d'inondation de faux voisins
    T.voisins.set(m.id, { id: String(m.id).slice(0, 20), name: String(m.name || "Rembobine").slice(0, 40), url: `http://${rinfo.address}:${Number(m.port)}`, seen: Date.now() });
    if (!known && m.a) sendTo({ ...me(), a: 0 }, `${rinfo.address}:${rinfo.port}`);   // un nouveau voisin : on se présente tout de suite
  }
  function startUdp() {
    if (o.udp === false) return;
    try {
      const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
      s.on("error", (e) => { log("warn", "voisins (UDP) : " + e.message); try { s.close(); } catch (_) {} if (T.sock === s) T.sock = null; });
      s.on("message", onMsg);
      s.bind(o.udpPort || UDP_PORT, () => { try { s.setBroadcast(true); } catch (_) {} T.sock = s; announce(); });
      const t = setInterval(() => { announce(); const old = Date.now() - 95000; for (const [k, v] of T.voisins) if (v.seen < old) T.voisins.delete(k); }, o.announceMs || 30000);
      if (t.unref) t.unref(); T.timers.push(t);
    } catch (e) { log("warn", "voisins (UDP) indisponibles : " + e.message); }
  }
  const voisins = () => [...T.voisins.values()].sort((a, b) => a.name.localeCompare(b.name, "fr")).map(({ id, name, url }) => ({ id, name, url }));

  // ---------- volume ----------
  function run(bin, args) { try { return spawnSync(bin, args, { timeout: 6000, encoding: "utf8" }).status === 0; } catch (_) { return false; } }
  async function volume(dir) {
    if (!["up", "down", "mute"].includes(dir)) return { ok: false, err: "Sens inconnu." };
    if (S.player && o.playerCmd) { const r = await o.playerCmd({ cmd: dir === "mute" ? "mute" : "vol" + dir }); return { ...r, via: "lecteur" }; }
    // la télé elle-même, par le câble HDMI (si elle accepte les ordres de volume)
    const ctl = which("cec-ctl");
    if (ctl) for (const dev of ["/dev/cec0", "/dev/cec1"]) {
      if (!(o.exists || fs.existsSync)(dev)) continue;
      const cmd = { up: "volume-up", down: "volume-down", mute: "mute" }[dir];
      if (run(ctl, ["-d", dev, "--to", "5", "--user-control-pressed", `ui-cmd=${cmd}`]) || run(ctl, ["-d", dev, "--to", "0", "--user-control-pressed", `ui-cmd=${cmd}`])) {
        run(ctl, ["-d", dev, "--to", "5", "--user-control-released"]); return { ok: true, via: "tv" };
      }
    }
    // sinon le son de la machine (PipeWire, puis ALSA)
    const wp = which("wpctl");
    if (wp && run(wp, dir === "mute" ? ["set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"] : ["set-volume", "-l", "1.2", "@DEFAULT_AUDIO_SINK@", dir === "up" ? "5%+" : "5%-"])) return { ok: true, via: "systeme" };
    const am = which("amixer");
    if (am && run(am, ["-q", "sset", "Master", dir === "mute" ? "toggle" : dir === "up" ? "5%+" : "5%-"])) return { ok: true, via: "systeme" };
    return { ok: false, err: "Impossible de régler le volume ici." };
  }

  // ---------- séances programmées ----------
  const list = () => { const now = Date.now(); S.cfg.seances = (S.cfg.seances || []).filter((x) => x.at > now - 3 * 3600000); return S.cfg.seances; };
  function tick() {
    const now = Date.now(); let ch = false;
    for (const x of list()) if (!x.rappel && x.at - now <= RAPPEL_MS && x.at > now - 60000) {
      x.rappel = true; ch = true;
      const min = Math.max(0, Math.round((x.at - now) / 60000));
      emit({ type: "seance-rappel", seance: x, msg: `🎬 Séance « ${x.title} »${min ? ` dans ${min} min` : " maintenant"}${x.code ? ` · code ${x.code}` : ""}.` });
    }
    if (ch && o.saveCfg) o.saveCfg();
  }
  const tk = setInterval(tick, o.tickMs || 30000); if (tk.unref) tk.unref(); T.timers.push(tk);

  // routes ouvertes (avant l'appairage) : la liste des Rembobine de la maison
  function openRoute(p, req, res, send) {
    if (p !== "/api/voisins") return false;
    send(res, 200, { self: { id: T.id, name: me().name }, voisins: voisins() });
    return true;
  }
  // routes pour les appareils appairés
  async function route(p, req, res, W, { body, send }) {
    if (p === "/api/tel/volume" && req.method === "POST") {
      if (W.guest) { send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." }); return true; }
      const b = await body(req); send(res, 200, await volume(String(b.dir || ""))); return true;
    }
    if (p === "/api/seances") {
      if (req.method !== "POST") { send(res, 200, { seances: list() }); return true; }
      if (W.guest) { send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." }); return true; }
      const b = await body(req), L = list(), cut = (v, n) => String(v == null ? "" : v).slice(0, n);
      if (b.del) { S.cfg.seances = L.filter((x) => x.id !== String(b.del)); }
      else if (b.add) {
        const a = b.add, at = Number(a.at);
        if (!(at > Date.now() - 60000) || at > Date.now() + 366 * 86400000) { send(res, 200, { ok: false, err: "Date invalide." }); return true; }
        if (L.length >= 50) { send(res, 200, { ok: false, err: "Trop de séances programmées." }); return true; }
        const x = { id: crypto.randomBytes(5).toString("hex"), at, title: cut(a.title, 200) || "Séance", item: cut(a.item, 80), code: cut(a.code, 8).toUpperCase().replace(/[^A-Z0-9]/g, ""), who: cut(a.who || W.name, 40), rappel: false };
        L.push(x); L.sort((p1, p2) => p1.at - p2.at); S.cfg.seances = L;
        if (o.saveCfg) o.saveCfg(); emit({ type: "seances" }); tick(); send(res, 200, { ok: true, seance: x }); return true;
      } else { send(res, 200, { ok: false, err: "Demande incomplète." }); return true; }
      if (o.saveCfg) o.saveCfg(); emit({ type: "seances" }); send(res, 200, { ok: true }); return true;
    }
    return false;
  }

  startUdp();
  return { openRoute, route, volume, voisins, tick, id: T.id, announce,
    stop() { T.timers.forEach(clearInterval); if (T.sock) { try { T.sock.close(); } catch (_) {} T.sock = null; } } };
}

module.exports = { createTelephone, UDP_PORT };
