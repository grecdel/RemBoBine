// Rembobine — installation automatique des vrais émulateurs (versions officielles), et du système de la PS3 (site de Sony).
// Les émulateurs s'installent dans Rembobine/Emulateurs (là où consoles.js les cherche) :
//   Linux PC : AppImage officielle (dernière version publiée sur GitHub), ou Flatpak (Flathub) quand l'éditeur ne publie que ça ;
//   Windows  : archive officielle décompressée avec « tar » (fourni avec Windows 10 et 11, sait lire zip et 7z).
// Aucun BIOS n'est téléchargé : ils appartiennent aux fabricants et viennent de ta console. Seule exception légale :
// le système de la PS3 (PS3UPDAT.PUP), distribué gratuitement par Sony sur ses propres serveurs.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const WIN = process.platform === "win32";
const BASES = { github: "https://api.github.com", sony: "https://fus01.ps3.update.playstation.net" };
// d'où vient chaque émulateur (dépôts officiels) et quel fichier prendre
const SOURCES = {
  pcsx2: { nom: "PCSX2", gh: "PCSX2/pcsx2", linux: /linux.*\.appimage$/i, win: /windows.*x64.*\.(7z|zip)$/i, exe: "pcsx2-qt.exe" },
  rpcs3: { nom: "RPCS3", gh: { linux: "RPCS3/rpcs3-binaries-linux", win: "RPCS3/rpcs3-binaries-win" }, linux: /\.appimage$/i, win: /\.(7z|zip)$/i, exe: "rpcs3.exe" },
  xemu: { nom: "xemu", gh: "xemu-project/xemu", linux: /x86_64\.appimage$/i, win: /win.*(x86_64|x64).*\.zip$|xemu-win.*\.zip$/i, exe: "xemu.exe" },
  xenia: { nom: "Xenia Canary", gh: "xenia-canary/xenia-canary-releases", linux: null, win: /windows.*\.zip$|xenia_canary.*\.zip$/i, exe: "xenia_canary.exe" },
  dolphin: { nom: "Dolphin", flatpak: "org.DolphinEmu.dolphin-emu", site: "https://dolphin-emu.org/download/" },
  ppsspp: { nom: "PPSSPP", flatpak: "org.ppsspp.PPSSPP", site: "https://www.ppsspp.org/download/" }
};

function which(p) { try { const r = spawnSync(WIN ? "where" : "which", [p], { encoding: "utf8" }); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : ""; } catch (_) { return ""; } }
const UA = "Rembobine/1.0 (installation des emulateurs)";

function createInstaller(o) {
  const B = { ...BASES, ...(o.bases || {}) }, F = o.fetch || fetch, emit = o.emit || (() => {}), log = o.log || (() => {});
  const jobs = new Map();   // id → { pct, msg, done, ok, err }
  const emuDir = () => path.join(o.roots[0], "Emulateurs"), biosDir = () => path.join(o.roots[0], "BIOS");
  const say = (id, pct, msg, extra = {}) => { const j = { ...(jobs.get(id) || {}), pct, msg, ...extra }; jobs.set(id, j); emit({ type: "install", id, ...j }); };

  async function getJson(url) { const r = await F(url, { headers: { "User-Agent": UA, Accept: "application/vnd.github+json" } }); if (!r.ok) throw new Error(`réponse ${r.status}`); return r.json(); }
  // téléchargement avec progression, écrit à côté puis renommé (jamais de fichier à moitié)
  async function download(url, dest, id, label) {
    const r = await F(url, { headers: { "User-Agent": UA }, redirect: "follow" }); if (!r.ok || !r.body) throw new Error(`téléchargement refusé (${r.status})`);
    const total = Number(r.headers.get("content-length")) || 0; let got = 0, last = 0;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + ".part", out = fs.createWriteStream(tmp);
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      got += value.length; if (!out.write(Buffer.from(value))) await new Promise((res) => out.once("drain", res));
      const pct = total ? Math.floor(got / total * 90) : 0; if (pct - last >= 5) { last = pct; say(id, pct, `${label} : ${Math.round(got / 1048576)} Mo`); }
    }
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
    fs.renameSync(tmp, dest); return got;
  }
  function run(cmd, args, ms = 900000) {
    return new Promise((resolve) => { let err = ""; const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] }); p.stderr.on("data", (d) => { if (err.length < 2000) err += d; });
      const t = setTimeout(() => { try { p.kill(); } catch (_) {} }, ms); p.on("close", (c) => { clearTimeout(t); resolve({ ok: c === 0, err: err.trim() }); }); p.on("error", (e) => { clearTimeout(t); resolve({ ok: false, err: e.message }); }); });
  }

  async function installOne(id) {
    const s = SOURCES[id]; if (!s) throw new Error("Émulateur inconnu.");
    const arm = process.arch === "arm64" || process.arch === "arm";
    if (arm && ["pcsx2", "rpcs3", "xemu", "xenia"].includes(id)) throw new Error(`${s.nom} demande un PC : le Raspberry Pi n'est pas assez puissant pour cette console.`);
    if (s.flatpak) {
      if (WIN) throw new Error(`Sur Windows, ${s.nom} s'installe depuis son site : ${s.site}`);
      if (!which("flatpak")) throw new Error(`Pour installer ${s.nom}, il faut Flatpak (sudo apt install flatpak), ou l'installer depuis ${s.site}`);
      say(id, 5, `${s.nom} : préparation de Flathub`);
      await run("flatpak", ["remote-add", "--user", "--if-not-exists", "flathub", "https://dl.flathub.org/repo/flathub.flatpakrepo"]);
      say(id, 15, `${s.nom} : téléchargement (quelques minutes)`);
      const r = await run("flatpak", ["install", "--user", "-y", "--noninteractive", "flathub", s.flatpak]);
      if (!r.ok) throw new Error(`Flatpak n'a pas pu installer ${s.nom} : ${r.err.slice(0, 200)}`);
      return;
    }
    const want = WIN ? s.win : s.linux; if (!want) throw new Error(`${s.nom} n'existe que pour Windows.`);
    const repo = typeof s.gh === "string" ? s.gh : s.gh[WIN ? "win" : "linux"];
    say(id, 2, `${s.nom} : recherche de la dernière version`);
    const rel = await getJson(`${B.github}/repos/${repo}/releases/latest`);
    const asset = (rel.assets || []).find((a) => want.test(a.name) && !/arm|aarch64|debug|symbols|\.sig$|\.sha/i.test(a.name));
    if (!asset) throw new Error(`Pas de version de ${s.nom} pour cette machine dans la dernière publication (${rel.tag_name || "?"}).`);
    if (!WIN) {   // Linux : l'AppImage, nommée pour que consoles.js la trouve
      const dest = path.join(emuDir(), `${id}.AppImage`);
      await download(asset.browser_download_url, dest, id, s.nom);
      fs.chmodSync(dest, 0o755);
    } else {      // Windows : on décompresse l'archive dans Emulateurs/<id>
      const arc = path.join(emuDir(), asset.name);
      await download(asset.browser_download_url, arc, id, s.nom);
      say(id, 92, `${s.nom} : décompression`);
      const dir = path.join(emuDir(), id); fs.mkdirSync(dir, { recursive: true });
      const r = await run("tar", ["-xf", arc, "-C", dir]); try { fs.unlinkSync(arc); } catch (_) {}
      if (!r.ok) throw new Error(`Décompression impossible : ${r.err.slice(0, 200)}`);
    }
    log("info", `${s.nom} ${rel.tag_name || ""} installé`);
  }

  // le système de la PS3 : liste officielle de Sony → adresse du fichier PS3UPDAT.PUP
  async function installPs3System() {
    const id = "ps3sys";
    say(id, 2, "Système PS3 : recherche de la dernière version chez Sony");
    const r = await F(`${B.sony}/update/ps3/list/eu/ps3-updatelist.txt`, { headers: { "User-Agent": UA } }); if (!r.ok) throw new Error("Le site de Sony ne répond pas.");
    const txt = await r.text(), m = /CDN=(https?:\/\/[^;\s]+PS3UPDAT\.PUP)/i.exec(txt), v = /(?:^|[;\s])SystemSoftwareVersion=([\d.]+)/.exec(txt);
    if (!m) throw new Error("Adresse du système PS3 introuvable dans la liste de Sony.");
    const dest = path.join(biosDir(), "PS3UPDAT.PUP");
    const n = await download(m[1], dest, id, "Système PS3");
    if (n < 1024 * 1024) { try { fs.unlinkSync(dest); } catch (_) {} throw new Error("Fichier reçu trop petit : téléchargement incomplet."); }
    log("info", `système PS3 ${v ? v[1] : ""} téléchargé chez Sony`);
    return v ? v[1] : "";
  }

  function start(id) {
    const j = jobs.get(id); if (j && !j.done) return { ok: true, already: true };
    jobs.set(id, { pct: 0, msg: "", done: false });
    (async () => {
      try { const v = id === "ps3sys" ? await installPs3System() : await installOne(id);
        say(id, 100, id === "ps3sys" ? `Système PS3${v ? " " + v : ""} prêt.` : `${SOURCES[id].nom} est installé.`, { done: true, ok: true }); }
      catch (e) { say(id, 0, e.message, { done: true, ok: false, err: e.message }); log("error", `installation ${id} : ${e.message}`); }
    })();
    return { ok: true };
  }
  // ce que cette machine sait installer toute seule
  function can(id) {
    const s = SOURCES[id]; if (!s) return false;
    const arm = process.arch === "arm64" || process.arch === "arm";
    if (arm && ["pcsx2", "rpcs3", "xemu", "xenia"].includes(id)) return false;
    if (s.flatpak) return !WIN;
    return WIN ? !!s.win : !!s.linux;
  }
  return { start, can, jobs: () => Object.fromEntries(jobs), SOURCES };
}

module.exports = { createInstaller, SOURCES };
