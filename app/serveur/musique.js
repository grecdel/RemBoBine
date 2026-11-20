// Rembobine — la musique côté serveur : paroles (fichier .lrc posé à côté, ou paroles rangées dans les
// étiquettes du fichier, lues par ffprobe) et égaliseur (graves, médiums, aigus) appliqué par mpv sur la TV.
// Aucune dépendance, rien sur internet.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// ---------- paroles ----------
// le fichier .lrc (ou .txt) qui porte le même nom que la piste, dans le même dossier (majuscules ignorées)
function sidecarLyrics(file) {
  const dir = path.dirname(file), base = path.basename(file, path.extname(file)).toLowerCase();
  let names = []; try { names = fs.readdirSync(dir); } catch (_) { return null; }
  for (const ext of [".lrc", ".txt"]) {
    const n = names.find((x) => x.toLowerCase() === base + ext);
    if (!n) continue;
    // (lstat : un lien symbolique vers un autre fichier de la machine n'est pas lu)
    try { const st = fs.lstatSync(path.join(dir, n)); if (!st.isFile() || st.size > 512 * 1024) continue; } catch (_) { continue; }
    try { return decode(fs.readFileSync(path.join(dir, n))); } catch (_) {}
  }
  return null;
}
// UTF-8 le plus souvent ; sinon Windows-1252 (vieux fichiers .lrc)
function decode(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.slice(3);
  const s = buf.toString("utf8");
  return s.includes("�") ? buf.toString("latin1") : s;
}
// les paroles rangées dans les étiquettes (ID3 USLT, Vorbis LYRICS, iTunes ©lyr…) : ffprobe les montre dans « tags »
function tagLyrics(info) {
  if (!info) return null;
  const bags = [info.format && info.format.tags].concat((info.streams || []).map((s) => s.tags)).filter(Boolean);
  for (const t of bags) for (const k of Object.keys(t)) if (/^(lyrics|unsyncedlyrics|unsynced lyrics|uslt|©lyr|lyrics-.*|syncedlyrics)$/i.test(k) && String(t[k]).trim()) return String(t[k]);
  return null;
}
function probeTags(ffprobe, file) {
  return new Promise((resolve) => {
    if (!ffprobe) return resolve(null);
    let out = "", p;
    try { p = spawn(ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]); } catch (_) { return resolve(null); }
    const tm = setTimeout(() => { try { p.kill(); } catch (_) {} resolve(null); }, 8000);
    p.stdout.on("data", (d) => { out += d; if (out.length > 4e6) p.kill(); });
    p.on("error", () => { clearTimeout(tm); resolve(null); });
    p.on("close", () => { clearTimeout(tm); try { resolve(JSON.parse(out)); } catch (_) { resolve(null); } });
  });
}
const isSynced = (t) => /\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/.test(t || "");
async function lyricsFor(file, ffprobe) {
  const side = sidecarLyrics(file);
  if (side && side.trim()) return { ok: true, from: "fichier", synced: isSynced(side), text: side.slice(0, 200000) };
  const tag = tagLyrics(await probeTags(ffprobe, file));
  if (tag) return { ok: true, from: "étiquettes", synced: isSynced(tag), text: tag.slice(0, 200000) };
  return { ok: false, err: "Pas de paroles pour ce titre." };
}

// ---------- égaliseur ----------
const clampDb = (v) => Math.max(-12, Math.min(12, Math.round(Number(v) || 0)));
function normEq(e) { e = e || {}; return { bass: clampDb(e.bass), mid: clampDb(e.mid), treble: clampDb(e.treble) }; }
// filtre audio de mpv (filtres de ffmpeg : bass, equalizer, treble) ; vide si tout est à plat
function eqFilter(e) {
  const q = normEq(e); if (!q.bass && !q.mid && !q.treble) return "";
  const f = [];
  if (q.bass) f.push(`bass=g=${q.bass}:f=110`);
  if (q.mid) f.push(`equalizer=f=1000:t=q:w=0.9:g=${q.mid}`);
  if (q.treble) f.push(`treble=g=${q.treble}:f=4500`);
  return `lavfi=[${f.join(",")}]`;
}

// o : { cfg, saveCfg, lib(), player(), mpvSend, ffprobe() }
function createMusique(o) {
  const eq = () => normEq(o.cfg().eq);
  // arguments à ajouter à mpv quand la TV lit un album
  function mpvArgs() { const f = eqFilter(eq()); return f ? [`--af=${f}`] : []; }
  async function handle(req, res, p, W, send, body) {
    let m;
    if ((m = /^\/api\/lyrics\/([^/]+)\/(\d+)$/.exec(p))) {
      const it = o.lib().byId.get(m[1]); const f = it && it.kind === "album" && it.files && it.files[Number(m[2])];
      if (!f) return send(res, 404, { ok: false, err: "introuvable" });
      return send(res, 200, await lyricsFor(f, o.ffprobe()));
    }
    if (p === "/api/eq") {
      if (req.method !== "POST") return send(res, 200, { ok: true, eq: eq() });
      if (W && W.guest) return send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." });
      const b = await body(req), cfg = o.cfg(); cfg.eq = normEq(b); o.saveCfg();
      // changement en direct si la TV joue de la musique
      const pl = o.player(); let live = false;
      if (pl && pl.kind === "album") { const r = await o.mpvSend(["af", "set", eqFilter(cfg.eq)]); live = !!r && r.error === "success"; }
      return send(res, 200, { ok: true, eq: cfg.eq, live });
    }
    return false;
  }
  return { handle, mpvArgs, eq };
}

module.exports = { createMusique, lyricsFor, eqFilter, normEq, tagLyrics, isSynced };
