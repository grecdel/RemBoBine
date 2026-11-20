// Rembobine — les outils livrés DANS l'application (ci/emulateurs_natifs.sh) : ffmpeg, ffprobe, mpv.
// Cherchés d'abord dans resources/emulateurs, sinon sur la machine (s'ils y sont installés).
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const WIN = process.platform === "win32";
let ROOT = "";
function setDir(d) { ROOT = d && fs.existsSync(d) ? d : ""; }
function which(p) { try { const r = spawnSync(WIN ? "where" : "which", [p], { encoding: "utf8" }); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : ""; } catch (_) { return ""; } }
// cherche un exécutable par son nom dans un dossier (3 niveaux au plus)
function find(dir, names, depth = 0) {
  if (depth > 5) return ""; let l = []; try { l = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return ""; }
  for (const x of l) if ((x.isFile() || x.isSymbolicLink()) && names.includes(x.name.toLowerCase())) return path.join(dir, x.name);
  for (const x of l) if (x.isDirectory()) { const r = find(path.join(dir, x.name), names, depth + 1); if (r) return r; }
  return "";
}
const cache = {};
// tool("ffmpeg") → chemin ; pour mpv sur Linux : l'AppImage décompressée (AppRun) ou l'AppImage elle-même
function tool(name) {
  if (cache[name] !== undefined) return cache[name];
  let p = "";
  if (ROOT) {
    const d = path.join(ROOT, name === "ffprobe" ? "ffmpeg" : name);
    if (name === "mpv" && !WIN) p = fs.existsSync(path.join(d, "AppRun")) ? path.join(d, "AppRun") : fs.existsSync(path.join(d, "mpv.AppImage")) ? path.join(d, "mpv.AppImage") : "";
    if (!p) p = find(d, [WIN ? name + ".exe" : name]);
  }
  if (!p) p = which(name);
  return (cache[name] = p);
}
// variables d'environnement pour lancer une AppImage sans FUSE
const env = () => ({ ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1" });
module.exports = { setDir, tool, find, env };
