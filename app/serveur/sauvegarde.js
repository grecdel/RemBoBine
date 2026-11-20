// Rembobine — sauvegarde complète de la maison, et restauration.
// Un seul fichier « Rembobine-sauvegarde-AAAA-MM-JJ_HHMM.json.gz » contient :
//   - la page (réglages, profils, cartouches, positions de lecture, progression : envoyée par l'écran, voir index.html) ;
//   - le serveur (serveur.json : nom, appareils reliés, cartouches ; progression.json : positions de lecture sur la TV) ;
//   - les sauvegardes de jeux des émulateurs de cette machine (RetroArch, PCSX2, PPSSPP, Dolphin, RPCS3) et Rembobine/Sauvegardes.
// Rangé dans le dossier du serveur, ou sur la clé USB branchée (dossier « Rembobine-sauvegardes »). Rien ne part sur internet.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const zlib = require("zlib");

const MAX_FILE = 64 * 1048576, MAX_TOTAL = 512 * 1048576;

// les dossiers de sauvegardes de jeux connus, sur cette machine
function zones(o) {
  const H = o.home || os.homedir(), WIN = (o.platform || process.platform) === "win32", D = path.join(H, "Documents");
  const z = [["serveur", "Serveur Rembobine", o.data]];
  const add = (id, label, ...dirs) => dirs.forEach((d, i) => z.push([dirs.length > 1 ? `${id}${i ? "-" + i : ""}` : id, label, d]));
  if ((o.roots || [])[0]) add("rembobine", "Rembobine/Sauvegardes", path.join(o.roots[0], "Sauvegardes"));
  if (WIN) {
    const AD = process.env.APPDATA || path.join(H, "AppData", "Roaming");
    add("retroarch", "RetroArch", path.join(AD, "RetroArch", "saves"), path.join(AD, "RetroArch", "states"));
    add("pcsx2", "PCSX2 (PS2)", path.join(D, "PCSX2", "memcards"));
    add("ppsspp", "PPSSPP (PSP)", path.join(D, "PPSSPP", "PSP", "SAVEDATA"));
    add("dolphin", "Dolphin (GameCube, Wii)", path.join(D, "Dolphin Emulator", "GC"), path.join(D, "Dolphin Emulator", "Wii", "title", "00010000"));
    add("rpcs3", "RPCS3 (PS3)", path.join(o.roots && o.roots[0] ? o.roots[0] : H, "Emulateurs", "rpcs3", "dev_hdd0", "home", "00000001", "savedata"));
  } else {
    const C = path.join(H, ".config"), S = path.join(H, ".local", "share"), V = path.join(H, ".var", "app");
    add("retroarch", "RetroArch", path.join(C, "retroarch", "saves"), path.join(C, "retroarch", "states"));
    add("pcsx2", "PCSX2 (PS2)", path.join(C, "PCSX2", "memcards"), path.join(V, "net.pcsx2.PCSX2", "config", "PCSX2", "memcards"));
    add("ppsspp", "PPSSPP (PSP)", path.join(C, "ppsspp", "PSP", "SAVEDATA"), path.join(V, "org.ppsspp.PPSSPP", "config", "ppsspp", "PSP", "SAVEDATA"));
    add("dolphin", "Dolphin (GameCube, Wii)", path.join(S, "dolphin-emu", "GC"), path.join(S, "dolphin-emu", "Wii", "title", "00010000"), path.join(V, "org.DolphinEmu.dolphin-emu", "data", "dolphin-emu", "GC"));
    add("rpcs3", "RPCS3 (PS3)", path.join(C, "rpcs3", "dev_hdd0", "home", "00000001", "savedata"));
  }
  return z.map(([id, label, dir]) => ({ id, label, dir }));
}
// ce qu'on garde du dossier du serveur : ses réglages, pas les caches (fiches, mises à jour, sauvegardes elles-mêmes)
const SERVER_FILES = /^(serveur|progression|page)\.json$/;

function walk(dir, rel = "", out = [], acc = { n: 0 }) {
  let list = []; try { list = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of list) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) walk(dir, r, out, acc);
    else if (e.isFile()) { let s; try { s = fs.statSync(path.join(dir, r)); } catch (_) { continue; } if (s.size > MAX_FILE || acc.n + s.size > MAX_TOTAL) continue; acc.n += s.size; out.push({ rel: r, size: s.size, m: s.mtimeMs }); }
  }
  return out;
}

function createSauvegarde(o) {
  const log = o.log || (() => {}), emit = o.emit || (() => {});
  const localDir = () => path.join(o.data, "sauvegardes");
  const pageFile = () => path.join(o.data, "page.json");
  // clés USB : ce qui est monté sous /media, /run/media ou /mnt
  function usbDirs() {
    if (o.usbDirs) return o.usbDirs;
    let m = ""; try { m = fs.readFileSync("/proc/mounts", "utf8"); } catch (_) { return []; }
    return [...new Set(m.split("\n").map((l) => (l.split(" ")[1] || "").replace(/\\040/g, " ")).filter((p) => /^\/(media|run\/media|mnt)\//.test(p)))]
      .filter((p) => { try { fs.accessSync(p, fs.constants.W_OK); return true; } catch (_) { return false; } });
  }
  const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;

  // la page envoie régulièrement son état (pour que la copie automatique de la semaine le contienne)
  function setPage(page) { if (!page || typeof page !== "object") return { ok: false, err: "Rien à garder." }; fs.writeFileSync(pageFile(), JSON.stringify({ t: Date.now(), page })); return { ok: true }; }

  function build(page) {
    if (!page) { try { page = JSON.parse(fs.readFileSync(pageFile(), "utf8")).page; } catch (_) { page = null; } }
    const files = [], acc = { n: 0 }, counts = {};
    for (const z of zones(o)) {
      if (!fs.existsSync(z.dir)) continue;
      const list = z.id === "serveur" ? ["serveur.json", "progression.json"].filter((n) => fs.existsSync(path.join(z.dir, n))).map((n) => ({ rel: n, m: fs.statSync(path.join(z.dir, n)).mtimeMs })) : walk(z.dir, "", [], acc);
      for (const f of list) { files.push({ z: z.id, rel: f.rel.split(path.sep).join("/"), m: f.m, b64: fs.readFileSync(path.join(z.dir, f.rel)).toString("base64") }); }
      if (list.length) counts[z.label] = list.length;
    }
    return { obj: { rembobineSauvegarde: 1, t: Date.now(), name: o.name ? o.name() : os.hostname(), version: o.version || "", platform: process.platform, page, files }, counts };
  }
  function create(target = "local", page) {
    let dir = localDir();
    if (target === "usb") { const u = usbDirs()[0]; if (!u) return { ok: false, err: "Aucune clé USB trouvée : branche-la, puis réessaie." }; dir = path.join(u, "Rembobine-sauvegardes"); }
    const { obj, counts } = build(page);
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 6 });
    fs.mkdirSync(dir, { recursive: true });
    const name = `Rembobine-sauvegarde-${stamp()}.json.gz`, f = path.join(dir, name);
    fs.writeFileSync(f + ".part", gz); fs.renameSync(f + ".part", f);
    if (target !== "usb") prune();
    log("info", `sauvegarde ${target === "usb" ? "sur la clé USB" : "locale"} : ${name} (${Math.round(gz.length / 1024)} Ko)`);
    return { ok: true, file: (target === "usb" ? "usb:" : "local:") + name, size: gz.length, counts, page: !!obj.page };
  }
  function prune(keep = 8) { const l = list().filter((x) => x.file.startsWith("local:")); for (const x of l.slice(keep)) { try { fs.unlinkSync(resolve(x.file)); } catch (_) {} } }
  function list() {
    const out = [], scan = (dir, kind, where) => { let l = []; try { l = fs.readdirSync(dir); } catch (_) { return; }
      for (const n of l) if (/^Rembobine-sauvegarde-.*\.json\.gz$/.test(n)) { try { const s = fs.statSync(path.join(dir, n)); out.push({ file: `${kind}:${n}`, where, t: s.mtimeMs, size: s.size }); } catch (_) {} } };
    scan(localDir(), "local", "sur Rembobine");
    for (const u of usbDirs()) scan(path.join(u, "Rembobine-sauvegardes"), "usb", "clé USB");
    return out.sort((a, b) => b.t - a.t);
  }
  // un identifiant de la liste → le vrai fichier (jamais d'autre chemin)
  function resolve(id) {
    const m = /^(local|usb):(Rembobine-sauvegarde-[\w.-]+\.json\.gz)$/.exec(String(id || "")); if (!m) return "";
    if (m[1] === "local") { const f = path.join(localDir(), m[2]); return fs.existsSync(f) ? f : ""; }
    for (const u of usbDirs()) { const f = path.join(u, "Rembobine-sauvegardes", m[2]); if (fs.existsSync(f)) return f; }
    return "";
  }
  function restoreBuffer(buf) {
    let obj; try { obj = JSON.parse(zlib.gunzipSync(buf).toString("utf8")); } catch (_) { try { obj = JSON.parse(buf.toString("utf8")); } catch (_) { return { ok: false, err: "Ce fichier n'est pas une sauvegarde de Rembobine." }; } }
    if (!obj || obj.rembobineSauvegarde !== 1 || !Array.isArray(obj.files)) return { ok: false, err: "Ce fichier n'est pas une sauvegarde de Rembobine." };
    const Z = new Map(zones(o).map((z) => [z.id, z])); let n = 0, skipped = 0;
    for (const f of obj.files) {
      const z = Z.get(f.z); if (!z || typeof f.rel !== "string" || typeof f.b64 !== "string") { skipped++; continue; }
      if (z.id === "serveur" && !SERVER_FILES.test(f.rel)) { skipped++; continue; }
      const dest = path.resolve(z.dir, ...f.rel.split("/"));
      if (!dest.startsWith(path.resolve(z.dir) + path.sep)) { skipped++; continue; }   // jamais en dehors du dossier prévu
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest + ".rbbtmp", Buffer.from(f.b64, "base64")); fs.renameSync(dest + ".rbbtmp", dest); n++;
    }
    if (o.reload) o.reload();
    log("info", `restauration : ${n} fichiers remis${skipped ? `, ${skipped} ignorés` : ""}`);
    emit({ type: "backup", msg: "Sauvegarde restaurée." });
    return { ok: true, files: n, page: obj.page || null, t: obj.t, from: obj.name || "" };
  }
  function restore(id) { const f = resolve(id); if (!f) return { ok: false, err: "Sauvegarde introuvable." }; return restoreBuffer(fs.readFileSync(f)); }
  // une copie automatique par semaine (dans le dossier du serveur)
  function weekly(now = Date.now()) {
    const l = list().filter((x) => x.file.startsWith("local:"));
    if (l.length && now - l[0].t < 7 * 86400000) return null;
    try { return create("local"); } catch (e) { log("error", "sauvegarde automatique : " + e.message); return null; }
  }
  const timer = setInterval(() => weekly(), 6 * 3600 * 1000); if (timer.unref) timer.unref();
  return { create, list, resolve, restore, restoreBuffer, setPage, weekly, usbDirs, zones: () => zones(o), stop: () => clearInterval(timer) };
}

module.exports = { createSauvegarde, zones };
