// Rembobine — les consoles « lourdes » (de la PSP à la PS3) : reconnaissance des disques, région, BIOS,
// et lancement des VRAIS émulateurs installés sur la machine (TV Raspberry ou PC).
// Les consoles plus légères (NES → PlayStation, N64, DS…) passent par RetroArch (TV) ou l'émulateur intégré (appli).
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const WIN = process.platform === "win32";
function which(p) { try { const r = spawnSync(WIN ? "where" : "which", [p], { encoding: "utf8" }); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : ""; } catch (_) { return ""; } }
function flatpak(id) { if (WIN || !which("flatpak")) return false; try { return spawnSync("flatpak", ["info", id], { timeout: 8000 }).status === 0; } catch (_) { return false; } }
function appImage(dirs, re) { for (const d of dirs) { try { const f = fs.readdirSync(d).find((n) => re.test(n)); if (f) return path.join(d, f); } catch (_) {} } return ""; }

// Chaque émulateur : comment le trouver (Linux, Flatpak, AppImage, Windows) et comment lancer un jeu en plein écran.
const EMU = {
  ppsspp: { nom: "PPSSPP", bins: ["PPSSPPSDL", "ppsspp", "PPSSPPQt"], flatpak: "org.ppsspp.PPSSPP", appimage: /^ppsspp.*\.appimage$/i, win: ["PPSSPP\\PPSSPPWindows64.exe"],
    args: (f) => ["--fullscreen", f], site: "https://www.ppsspp.org/download/", pi: true },
  dolphin: { nom: "Dolphin", bins: ["dolphin-emu", "dolphin-emu-nogui"], flatpak: "org.DolphinEmu.dolphin-emu", appimage: /^dolphin.*\.appimage$/i, win: ["Dolphin\\Dolphin.exe", "Dolphin-x64\\Dolphin.exe"],
    args: (f) => ["-b", "-C", "Dolphin.Display.Fullscreen=True", "-e", f], site: "https://dolphin-emu.org/download/", pi: "lent" },
  pcsx2: { nom: "PCSX2", bins: ["pcsx2-qt", "pcsx2"], flatpak: "net.pcsx2.PCSX2", appimage: /^pcsx2.*\.appimage$/i, win: ["PCSX2\\pcsx2-qt.exe", "PCSX2 Nightly\\pcsx2-qt.exe"],
    args: (f) => ["-batch", "-fullscreen", "--", f], site: "https://pcsx2.net/downloads/", pi: false },
  rpcs3: { nom: "RPCS3", bins: ["rpcs3"], flatpak: "net.rpcs3.RPCS3", appimage: /^rpcs3.*\.appimage$/i, win: ["RPCS3\\rpcs3.exe"],
    args: (f) => ["--no-gui", "--fullscreen", f], site: "https://rpcs3.net/download", pi: false },
  xemu: { nom: "xemu", bins: ["xemu"], flatpak: "app.xemu.xemu", appimage: /^xemu.*\.appimage$/i, win: ["xemu\\xemu.exe"],
    args: (f) => ["-full-screen", "-dvd_path", f], site: "https://xemu.app/#download", pi: false },
  xenia: { nom: "Xenia Canary", bins: ["xenia_canary"], flatpak: "", appimage: /^xenia.*\.appimage$/i, win: ["xenia_canary\\xenia_canary.exe", "Xenia\\xenia_canary.exe", "xenia\\xenia.exe"],
    args: (f) => [f, "--fullscreen=true"], site: "https://xenia.jp/download/", pi: false }
};

// Les consoles : marque, nom, extensions (en plus des dossiers), émulateurs (dans l'ordre de préférence), BIOS à fournir
const CONSOLES = {
  psp: { marque: "Sony", nom: "PSP", ext: ["cso"], dirs: /^(psp|playstation ?portable)$/i, emus: ["ppsspp"], retro: ["ppsspp"], bios: [] },
  ps2: { marque: "Sony", nom: "PlayStation 2", ext: [], dirs: /^(ps2|playstation ?2)$/i, emus: ["pcsx2"], retro: ["pcsx2"],
    bios: [{ re: /scph.*\.bin$|ps2.*bios.*\.bin$|\.bin$/i, nom: "BIOS de la PS2 (fichier .bin tiré de ta console, ex. SCPH-70004.bin)", requis: true }] },
  ps3: { marque: "Sony", nom: "PlayStation 3", ext: [], dirs: /^(ps3|playstation ?3)$/i, emus: ["rpcs3"], retro: [],
    bios: [{ re: /^ps3updat\.pup$/i, nom: "Système de la PS3 : PS3UPDAT.PUP (gratuit sur le site de Sony)", requis: true }] },
  gc: { marque: "Nintendo", nom: "GameCube", ext: ["gcm", "gcz", "ciso"], dirs: /^(gc|gamecube|game ?cube|ngc)$/i, emus: ["dolphin"], retro: ["dolphin"], bios: [] },
  wii: { marque: "Nintendo", nom: "Wii", ext: ["wbfs", "wad"], dirs: /^(wii)$/i, emus: ["dolphin"], retro: ["dolphin"], bios: [] },
  xbox: { marque: "Microsoft", nom: "Xbox", ext: ["xiso"], dirs: /^(xbox|original ?xbox)$/i, emus: ["xemu"], retro: [],
    bios: [{ re: /^mcpx.*\.bin$/i, nom: "MCPX (mcpx_1.0.bin)", requis: true }, { re: /complex|flash|bios.*\.bin$|^cromwell.*\.bin$/i, nom: "BIOS (ex. Complex_4627.bin)", requis: true },
      { re: /\.qcow2$/i, nom: "Disque dur (xbox_hdd.qcow2, fourni avec xemu)", requis: true }] },
  x360: { marque: "Microsoft", nom: "Xbox 360", ext: ["xex", "god"], dirs: /^(x360|xbox ?360)$/i, emus: ["xenia"], retro: [], bios: [] }
};

// --- reconnaissance d'un disque .iso / .rvz par son contenu (quand le dossier ne dit rien) ---
function readAt(fd, pos, len) { const b = Buffer.alloc(len); try { fs.readSync(fd, b, 0, len, pos); } catch (_) {} return b; }
function sniffDisc(file) {
  let fd; try { fd = fs.openSync(file, "r"); } catch (_) { return ""; }
  try {
    const head = readAt(fd, 0, 0x40);
    if (head.readUInt32BE(0x1C) === 0xC2339F3D) return "gc";
    if (head.readUInt32BE(0x18) === 0x5D1C9EA3) return "wii";
    if (/^(RVZ|WIA)\x01/.test(head.toString("latin1", 0, 4))) { const d = readAt(fd, 0x58, 0x20); if (d.readUInt32BE(0x18) === 0x5D1C9EA3) return "wii"; return "gc"; }
    const x = "MICROSOFT*XBOX*MEDIA";
    if (readAt(fd, 0x10000, 20).toString("latin1") === x) return "xbox";
    for (const off of [0xFDA0000, 0x2080000, 0x18300000]) if (readAt(fd, off + 0x10000, 20).toString("latin1") === x) return "x360";
    const pvd = readAt(fd, 0x8000, 0x30);
    if (pvd.toString("latin1", 1, 6) === "CD001") {
      const sys = pvd.toString("latin1", 8, 40).trim();
      if (/PSP GAME/.test(sys)) return "psp";
      if (/PLAYSTATION/.test(sys)) { let size = 0; try { size = fs.fstatSync(fd).size; } catch (_) {} return size > 900e6 ? "ps2" : "psx"; }
    }
    return "";
  } finally { try { fs.closeSync(fd); } catch (_) {} }
}
// console d'un fichier : dossier d'abord (« PS2/ », « GameCube/ »…), puis extension, puis contenu du disque
function consoleOf(file, base) {
  const rel = path.relative(base, path.dirname(file));
  for (const part of rel.split(path.sep).reverse()) for (const [k, c] of Object.entries(CONSOLES)) if (c.dirs.test(part)) return k;
  const e = path.extname(file).slice(1).toLowerCase();
  for (const [k, c] of Object.entries(CONSOLES)) if (c.ext.includes(e)) return k;
  if (["iso", "rvz", "img"].includes(e)) return sniffDisc(file);
  return "";
}

// --- région d'un jeu, d'après les étiquettes du nom de fichier (No-Intro, Redump, GoodTools) ---
const REGIONS = [[/\b(japan|japon|jpn|jp|j|ntsc-j)\b/i, "Japon"], [/\b(usa|us|u|ntsc-u|ntsc)\b/i, "États-Unis"], [/\b(europe|eur|e|pal|france|fr|germany|de|spain|es|italy|it|uk)\b/i, "Europe"],
  [/\b(world|w|jue|ue|ju|uj)\b/i, "Monde"], [/\b(korea|kor|k)\b/i, "Corée"], [/\b(brazil|bra|b)\b/i, "Brésil"], [/\b(asia|china|chn|hong kong|taiwan)\b/i, "Asie"], [/\b(australia|aus)\b/i, "Australie"]];
function regionOf(name) {
  const tags = [...String(name).matchAll(/[([]([^)\]]+)[)\]]/g)].map((m) => m[1]);
  for (const t of tags) for (const [re, lbl] of REGIONS) if (re.test(t)) return lbl;
  return "";
}

// --- BIOS : dossier « BIOS » à côté des médias (~/Rembobine/BIOS) ---
function biosFiles(roots) {
  const out = [];
  for (const r of roots) for (const n of ["BIOS", "Bios", "bios"]) { const d = path.join(r, n); try { for (const f of fs.readdirSync(d)) out.push(path.join(d, f)); } catch (_) {} }
  return out;
}

// --- où est installé un émulateur ---
// d'abord ceux qui sont livrés DANS l'application (ci/emulateurs_natifs.sh) : rien à installer
let BUNDLED = "";
function setBundled(dir) { BUNDLED = dir && fs.existsSync(dir) ? dir : ""; }
// version du système de base Linux (glibc) : Xenia pour Linux demande 2.38 au moins (Ubuntu 24.04, Debian 13, Fedora 39…)
function glibcOk(maj, min) {
  if (WIN || process.platform !== "linux") return true;
  const v = String((process.report && process.report.getReport().header.glibcVersionRuntime) || "").split(".").map(Number);
  return !v[0] || v[0] > maj || (v[0] === maj && (v[1] || 0) >= min);
}
function findEmu(id, extraDirs) {
  if (id === "xenia" && !WIN && !glibcOk(2, 38)) return null;   // Xenia Linux demande un système récent
  const e = EMU[id]; if (!e) return null;
  if (BUNDLED) {
    const d = path.join(BUNDLED, id);
    if (!WIN && fs.existsSync(path.join(d, "AppRun"))) return { cmd: path.join(d, "AppRun"), pre: [], bundled: true };
    if (!WIN && fs.existsSync(path.join(d, `${id}.AppImage`))) return { cmd: path.join(d, `${id}.AppImage`), pre: [], bundled: true };
    if (!WIN && e.bins.length) { const f = require("./outils").find(d, e.bins.map((b) => b.toLowerCase())); if (f) return { cmd: f, pre: [], bundled: true }; }
    if (WIN) { const exe = e.win.map((w) => w.split("\\").pop().toLowerCase());
      const look = (x, depth) => { if (depth > 3) return ""; let l = []; try { l = fs.readdirSync(x, { withFileTypes: true }); } catch (_) { return ""; }
        for (const y of l) if (y.isFile() && exe.includes(y.name.toLowerCase())) return path.join(x, y.name);
        for (const y of l) if (y.isDirectory()) { const r = look(path.join(x, y.name), depth + 1); if (r) return r; } return ""; };
      const r = look(d, 0); if (r) return { cmd: r, pre: [], bundled: true }; }
  }
  for (const b of e.bins) { const p = which(b); if (p) return { cmd: p, pre: [] }; }
  const ai = e.appimage && appImage(extraDirs.concat([path.join(os.homedir(), "Applications"), path.join(os.homedir(), "Rembobine", "Emulateurs")]), e.appimage);
  if (ai) return { cmd: ai, pre: [] };
  if (e.flatpak && flatpak(e.flatpak)) return { cmd: "flatpak", pre: ["run", e.flatpak] };
  if (WIN) for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA, path.join(os.homedir(), "Rembobine", "Emulateurs")].filter(Boolean))
    for (const w of e.win) { const p = path.join(base, w); if (fs.existsSync(p)) return { cmd: p, pre: [] }; }
  // installé par Rembobine (Windows) : Emulateurs/<id>/…/<programme>.exe
  const exe = e.win.map((w) => w.split("\\").pop().toLowerCase());
  const look = (d, depth) => { if (depth > 3) return ""; let l = []; try { l = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return ""; }
    for (const x of l) if (x.isFile() && exe.includes(x.name.toLowerCase())) return path.join(d, x.name);
    for (const x of l) if (x.isDirectory()) { const r = look(path.join(d, x.name), depth + 1); if (r) return r; } return ""; };
  for (const d of extraDirs) { const r = look(path.join(d, id), 0); if (r) return { cmd: r, pre: [] }; }
  return null;
}
function retroCore(names) {
  const dirs = ["/usr/lib/libretro", "/usr/lib/aarch64-linux-gnu/libretro", "/usr/lib/x86_64-linux-gnu/libretro", path.join(os.homedir(), ".config/retroarch/cores")];
  for (const n of names) for (const d of dirs) { const f = path.join(d, `${n}_libretro.so`); if (fs.existsSync(f)) return f; }
  return "";
}

// --- préparatifs propres à certains émulateurs ---
function prepare(sys, roots, log) {
  const B = biosFiles(roots);
  if (sys === "ps2") {   // PCSX2 cherche ses BIOS dans son propre dossier : on y copie ceux du dossier BIOS
    const bins = B.filter((f) => /\.bin$/i.test(f) && fs.statSync(f).size >= 4 * 1024 * 1024 && fs.statSync(f).size <= 8 * 1024 * 1024);
    const dests = WIN ? [path.join(os.homedir(), "Documents", "PCSX2", "bios")] : [path.join(os.homedir(), ".config", "PCSX2", "bios"), path.join(os.homedir(), ".var", "app", "net.pcsx2.PCSX2", "config", "PCSX2", "bios")];
    for (const d of dests) for (const f of bins) { try { fs.mkdirSync(d, { recursive: true }); const t = path.join(d, path.basename(f)); if (!fs.existsSync(t)) fs.copyFileSync(f, t); } catch (_) {} }
    if (!bins.length) return "Il manque le BIOS de la PS2 : dépose-le dans le dossier BIOS (fichier .bin de 4 Mo, tiré de ta console).";
  }
  if (sys === "xbox") {  // xemu : on lui indique où sont ses fichiers (xemu.toml)
    const mcpx = B.find((f) => /^mcpx/i.test(path.basename(f))), flash = B.find((f) => /complex|cromwell|flash/i.test(path.basename(f)) && /\.bin$/i.test(f)), hdd = B.find((f) => /\.qcow2$/i.test(f));
    if (!mcpx || !flash || !hdd) return "Il manque des fichiers de la Xbox dans le dossier BIOS : mcpx_1.0.bin, le BIOS (ex. Complex_4627.bin) et le disque dur xbox_hdd.qcow2.";
    const tomls = WIN ? [path.join(process.env.APPDATA || os.homedir(), "xemu", "xemu", "xemu.toml")] : [path.join(os.homedir(), ".local", "share", "xemu", "xemu", "xemu.toml"), path.join(os.homedir(), ".var", "app", "app.xemu.xemu", "data", "xemu", "xemu", "xemu.toml")];
    const q = (s) => JSON.stringify(s);
    for (const t of tomls) { try { fs.mkdirSync(path.dirname(t), { recursive: true }); let s = fs.existsSync(t) ? fs.readFileSync(t, "utf8") : "";
      if (!/bootrom_path/.test(s)) { s += `\n[sys.files]\nbootrom_path = ${q(mcpx)}\nflashrom_path = ${q(flash)}\nhdd_path = ${q(hdd)}\n`; fs.writeFileSync(t, s); } } catch (_) {} }
  }
  if (sys === "ps3") {   // RPCS3 : le système de la PS3 s'installe une fois, depuis PS3UPDAT.PUP
    const pup = B.find((f) => /^ps3updat\.pup$/i.test(path.basename(f)));
    const fw = [path.join(os.homedir(), ".config", "rpcs3", "dev_flash", "vsh", "module"), path.join(os.homedir(), ".var", "app", "net.rpcs3.RPCS3", "config", "rpcs3", "dev_flash", "vsh", "module")];
    if (!fw.some((d) => fs.existsSync(d))) {
      if (!pup) return "Il manque le système de la PS3 : télécharge PS3UPDAT.PUP sur le site de Sony et dépose-le dans le dossier BIOS.";
      const r = findEmu("rpcs3", []); if (r) { log && log("info", "installation du système de la PS3 dans RPCS3"); spawnSync(r.cmd, [...r.pre, "--installfw", pup], { timeout: 600000 }); }
    }
  }
  return "";
}

// un jeu PS3 rangé en dossier (PS3_GAME/USRDIR/EBOOT.BIN) : c'est ce fichier qu'on donne à RPCS3
function ps3Target(file) {
  let d = fs.statSync(file).isDirectory() ? file : path.dirname(file);
  for (let i = 0; i < 4; i++) { const e = path.join(d, "PS3_GAME", "USRDIR", "EBOOT.BIN"); if (fs.existsSync(e)) return e; d = path.dirname(d); }
  return file;
}

// environnement de lancement : AppImage sans FUSE ; sous Linux, les bibliothèques livrées à côté du programme
// (ex. SDL2 pour Xenia) sont trouvées en premier
function emuEnv(cmd) {
  const env = { ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1" };
  if (!WIN) { const d = path.dirname(cmd); let libs = []; try { libs = fs.readdirSync(d).filter((n) => /^lib.*\.so(\.|$)/.test(n)); } catch (_) {}
    if (libs.length) env.LD_LIBRARY_PATH = d + (env.LD_LIBRARY_PATH ? ":" + env.LD_LIBRARY_PATH : ""); }
  return env;
}

// le programme lancé, pour savoir quand il se ferme (lecteur seul) ; caché : la réponse du serveur reste du simple JSON
function avecProc(r, p) { Object.defineProperty(r, "proc", { value: p, enumerable: false }); return r; }
function launch(sys, file, roots, log) {
  const c = CONSOLES[sys]; if (!c) return { ok: false, err: "Console inconnue." };
  const arm = process.arch === "arm64" || process.arch === "arm";
  const lourd = { ps2: "la PlayStation 2", ps3: "la PlayStation 3", xbox: "la Xbox", x360: "la Xbox 360" }[sys];
  const miss = prepare(sys, roots, log); if (miss) return { ok: false, err: miss };
  for (const id of c.emus) {
    // seulement le dossier Emulateurs de Rembobine (roots[0]) : jamais celui d'un disque USB branché
    // (une clé piégée avec « Emulateurs/pcsx2.AppImage » ferait lancer son propre programme)
    const e = findEmu(id, roots.slice(0, 1).map((r) => path.join(r, "Emulateurs")));
    if (!e) continue;
    const target = sys === "ps3" ? ps3Target(file) : file;
    let p; try { p = spawn(e.cmd, [...e.pre, ...EMU[id].args(target)], { stdio: "ignore", detached: false, env: emuEnv(e.cmd) }); p.on("error", (er) => log && log("error", `${EMU[id].nom} : ${er.message}`)); }
    catch (er) { return { ok: false, err: String(er) }; }
    log && log("info", `jeu lancé avec ${EMU[id].nom} : ${path.basename(file)}`);
    return avecProc({ ok: true, emu: EMU[id].nom }, p);
  }
  // sinon, un cœur RetroArch quand il existe (PSP, GameCube, Wii)
  const ra = which("retroarch"), core = ra && retroCore(c.retro);
  if (core) { let p; try { p = spawn(ra, ["-f", "-L", core, file], { stdio: "ignore" }); } catch (er) { return { ok: false, err: String(er) }; } return avecProc({ ok: true, emu: "RetroArch" }, p); }
  if (lourd && arm) return { ok: false, err: `${lourd[0].toUpperCase() + lourd.slice(1)} demande un PC puissant : le Raspberry Pi n'est pas assez rapide. Lance ce jeu depuis Rembobine sur un PC.` };
  if (sys === "x360" && arm) return { ok: false, err: "La Xbox 360 demande un PC puissant (émulateur Xenia)." };
  if (sys === "x360" && !WIN && !glibcOk(2, 38)) return { ok: false, err: "La Xbox 360 (Xenia) demande un Linux plus récent : Ubuntu 24.04, Linux Mint 22, Debian 13, Fedora, openSUSE Tumbleweed ou Arch. Sur ce système trop ancien, joue-y depuis Rembobine sur Windows." };
  return { ok: false, err: `Installe ${c.emus.map((id) => EMU[id].nom).join(" ou ")} sur cette machine pour jouer à la ${c.nom} (${c.emus.map((id) => EMU[id].site).join(", ")}).` };
}

// état de chaque console sur CETTE machine (pour la page des émulateurs)
function status(roots) {
  const B = biosFiles(roots).map((f) => path.basename(f));
  const arm = process.arch === "arm64" || process.arch === "arm";
  return Object.entries(CONSOLES).map(([k, c]) => {
    const found = c.emus.map((id) => { const f = findEmu(id, roots.slice(0, 1).map((r) => path.join(r, "Emulateurs"))); return { id, nom: EMU[id].nom, ok: !!f, livre: !!(f && f.bundled), site: EMU[id].site, pi: EMU[id].pi, windows: !!EMU[id].windows }; });
    const core = !!(which("retroarch") && retroCore(c.retro));
    const bios = c.bios.map((b) => ({ nom: b.nom, ok: B.some((n) => b.re.test(n)), requis: b.requis }));
    const possible = !(arm && found.every((f) => f.pi === false));
    return { id: k, marque: c.marque, nom: c.nom, emus: found, retroarch: core, bios, pret: (found.some((f) => f.ok) || core) && bios.every((b) => b.ok || !b.requis), possible };
  });
}

module.exports = { emuEnv, glibcOk, CONSOLES, EMU, consoleOf, sniffDisc, regionOf, launch, status, biosFiles, setBundled, findEmu };
