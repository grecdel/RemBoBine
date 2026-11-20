// Rembobine — vidéos lisibles partout : analyse (ffprobe), choix du mode, conversion à la volée (ffmpeg), sous-titres.
// Le téléphone ou le PC dit ce qu'il sait lire (« can ») ; le serveur choisit :
//   direct     : le fichier tel quel (lecture par morceaux, on peut avancer librement) ;
//   remux      : l'image est gardée telle quelle, seul le son et/ou l'emballage changent (très léger) ;
//   transcode  : image et son convertis en H.264 + AAC (pour HEVC sur un appareil qui ne le lit pas, avi, wmv, mpeg-2…).
// En remux/transcode, avancer = relancer la conversion au bon moment (paramètre ss, en secondes).
"use strict";
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

function which(p) { try { const r = spawnSync(process.platform === "win32" ? "where" : "which", [p], { encoding: "utf8" }); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : ""; } catch (_) { return ""; } }
const OUT = require("./outils");
const BIN = { ffmpeg: "", ffprobe: "" };
// ffmpeg livré avec l'application d'abord (rien à installer), sinon celui de la machine
function bins() { if (!BIN.ffmpeg) { BIN.ffmpeg = OUT.tool("ffmpeg"); BIN.ffprobe = OUT.tool("ffprobe"); } return BIN; }

const cache = new Map();   // fichier → { mtime, info }
function probe(file) {
  return new Promise((resolve) => {
    let st; try { st = fs.statSync(file); } catch (_) { return resolve(null); }
    const c = cache.get(file); if (c && c.mtime === st.mtimeMs) return resolve(c.info);
    const fp = bins().ffprobe; if (!fp) return resolve(null);
    const p = spawn(fp, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-show_chapters", file]);
    let out = ""; p.stdout.on("data", (d) => { out += d; }); p.on("error", () => resolve(null));
    const t = setTimeout(() => { try { p.kill(); } catch (_) {} }, 20000);
    p.on("close", () => {
      clearTimeout(t);
      let j; try { j = JSON.parse(out); } catch (_) { return resolve(null); }
      const st2 = j.streams || [];
      const lang = (s) => ((s.tags && (s.tags.language || s.tags.LANGUAGE)) || "").toLowerCase();
      const v = st2.find((s) => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
      const audio = st2.filter((s) => s.codec_type === "audio").map((s, i) => ({ i, codec: s.codec_name, ch: s.channels || 2, lang: lang(s), title: (s.tags && s.tags.title) || "", def: !!(s.disposition && s.disposition.default) }));
      const subs = st2.filter((s) => s.codec_type === "subtitle").map((s, i) => ({ i, codec: s.codec_name, lang: lang(s), title: (s.tags && s.tags.title) || "", text: !/pgs|hdmv|dvd_sub|dvb_sub|xsub/i.test(s.codec_name || "") }));
      const info = {
        format: (j.format && j.format.format_name) || "", dur: Number(j.format && j.format.duration) || 0,
        video: v ? { codec: v.codec_name, profile: v.profile || "", pix: v.pix_fmt || "", w: v.width, h: v.height, bits: /10le|10be|p010|12le/.test(v.pix_fmt || "") ? 10 : 8,
          hdr: /smpte2084|arib-std-b67/.test(v.color_transfer || "") } : null,
        audio, subs,
        // chapitres du fichier (mkv, mp4) : début, fin, titre
        chapters: (j.chapters || []).map((c) => ({ start: Number(c.start_time) || 0, end: Number(c.end_time) || 0, title: String((c.tags && (c.tags.title || c.tags.TITLE)) || "").slice(0, 120) }))
      };
      cache.set(file, { mtime: st.mtimeMs, info }); resolve(info);
    });
  });
}

// ce que l'appareil sait lire, envoyé par la page : "h264,h264_10,hevc,vp9,av1,aac,mp3,opus,flac,vorbis,ac3,eac3,mkv"
function parseCan(s) { const c = new Set(String(s || "").split(",").map((x) => x.trim()).filter(Boolean)); if (!c.size) ["h264", "vp9", "aac", "mp3", "opus", "vorbis", "flac", "mkv"].forEach((x) => c.add(x)); return c; }
const VCODEC = { h264: "h264", hevc: "hevc", vp9: "vp9", av1: "av1" };
const ACODEC = { aac: "aac", mp3: "mp3", opus: "opus", flac: "flac", vorbis: "vorbis", ac3: "ac3", eac3: "eac3" };

// choisit la piste audio : celle demandée, sinon la française, sinon celle « par défaut », sinon la première
function pickAudio(info, want) {
  if (!info.audio.length) return null;
  if (want != null && info.audio[want]) return info.audio[want];
  return info.audio.find((a) => /^(fr|fre|fra|french)$/.test(a.lang)) || info.audio.find((a) => a.def) || info.audio[0];
}
function decide(info, file, can, want) {
  if (!info) return { mode: "direct", why: "analyse impossible (ffprobe absent ?)" };
  const ext = path.extname(file).slice(1).toLowerCase();
  const v = info.video, a = pickAudio(info, want);
  const vOk = !v || (VCODEC[v.codec] && can.has(VCODEC[v.codec]) && (v.codec !== "h264" || v.bits === 8 || can.has("h264_10")));
  const aOk = !a || (ACODEC[a.codec] && can.has(ACODEC[a.codec]));
  const contOk = ["mp4", "m4v", "webm", "mov"].includes(ext) || (ext === "mkv" && can.has("mkv"));
  // en lecture directe, le navigateur joue la piste « par défaut » (ou la première) : si on en veut une autre, il faut convertir
  const browserTrack = info.audio.find((x) => x.def) || info.audio[0];
  if (vOk && aOk && contOk && (!a || a.i === browserTrack.i)) return { mode: "direct", audio: a };
  if (vOk) return { mode: "remux", audio: a, copyAudio: aOk, why: !aOk ? `son ${a.codec} non lu par cet appareil` : !contOk ? `fichier ${ext} non lu par cet appareil` : "piste audio choisie" };
  return { mode: "transcode", audio: a, copyAudio: false, why: `image ${v ? v.codec : "?"} non lue par cet appareil` };
}

// filtres présents dans le ffmpeg de la machine (zscale + tonemap : conversion HDR → SDR)
let FILTERS = null;
function filters() {
  if (!FILTERS) { FILTERS = new Set(); try { for (const l of String(spawnSync(bins().ffmpeg, ["-hide_banner", "-filters"], { encoding: "utf8", timeout: 10000 }).stdout || "").split("\n")) { const m = /^\s*\S+\s+(\w+)\s/.exec(l); if (m) FILTERS.add(m[1]); } } catch (_) {} }
  return FILTERS;
}
const canTonemap = () => filters().has("zscale") && filters().has("tonemap");
// HDR (couleurs des films 4K « 10 bits ») → SDR : sans cette étape, l'image convertie paraît délavée
const TONEMAP = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,";
// encodeur matériel du Raspberry présent ? (demandé une seule fois : avant, ffmpeg était relancé — en bloquant le serveur — à chaque conversion ou saut dans le film)
let HWENC = null;
function hwEnc() { if (HWENC === null) { try { HWENC = /h264_v4l2m2m/.test(spawnSync(bins().ffmpeg, ["-hide_banner", "-encoders"], { encoding: "utf8", timeout: 10000 }).stdout || ""); } catch (_) { HWENC = false; } } return HWENC; }
// encodeur H.264 : matériel sur Raspberry Pi 4 (v4l2m2m), sinon logiciel (rapide), image limitée à 720p sur ARM
// o.sdr : HDR → SDR ; o.maxh : hauteur maximale ; o.crf / o.preset : qualité (versions préparées à l'avance)
function h264Args(o = {}) {
  // qualité réduite (connexion lente d'un ami à distance) : 480p, plus compressé
  if (o.low) return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-maxrate", "900k", "-bufsize", "1800k", "-pix_fmt", "yuv420p", "-vf", "scale=-2:'min(480,ih)'", "-g", "48"];
  const arm = process.arch === "arm64" || process.arch === "arm";
  const tm = o.sdr && canTonemap() ? TONEMAP : "";
  if (!o.crf && arm && fs.existsSync("/dev/video11") && hwEnc()) return ["-c:v", "h264_v4l2m2m", "-b:v", "4M", "-pix_fmt", "yuv420p", "-vf", `${tm}scale=-2:'min(${o.maxh || 1080},ih)'`];
  const maxh = o.maxh || (arm ? 720 : 1080);
  return ["-c:v", "libx264", "-preset", o.preset || (arm ? "ultrafast" : "veryfast"), "-crf", String(o.crf || 23), "-pix_fmt", "yuv420p", "-vf", `${tm}scale=-2:'min(${maxh},ih)'`, "-g", "48"];
}

const ACTIVE = new Set();
const active = () => ACTIVE.size;
// lance ffmpeg et envoie un MP4 « fragmenté » (lisible pendant qu'il se fabrique)
function stream(req, res, file, plan, ss) {
  const ff = bins().ffmpeg; if (!ff) { res.writeHead(501, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("ffmpeg n'est pas installé sur le serveur."); }
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin"];
  if (ss > 0) args.push("-ss", String(ss));
  args.push("-i", file);
  // décalage du son (plan.ad, en secondes ; + = le son arrive plus tard) : le son vient d'une 2e lecture du fichier, décalée
  const ad = Math.max(-10, Math.min(10, Number(plan.ad) || 0)), aIn = ad ? 1 : 0, aSs = ss - ad;
  if (ad) { if (aSs > 0) args.push("-ss", String(aSs)); args.push("-i", file); }
  args.push("-map", "0:v:0?");
  if (plan.audio) args.push("-map", `${aIn}:a:${plan.audio.i}`);
  if (plan.mode === "transcode") args.push(...h264Args({ sdr: plan.sdr, maxh: plan.maxh, low: plan.low })); else args.push("-c:v", "copy");
  const pad = ad && aSs < 0 ? Math.round(-aSs * 1000) : 0;   // tout début du film : un petit silence avant le son
  if (plan.audio) args.push(...(plan.copyAudio && !pad ? ["-c:a", "copy", ...(plan.audio.codec === "aac" ? ["-bsf:a", "aac_adtstoasc"] : [])] : [...(pad ? ["-af", `adelay=${pad}:all=1`] : []), "-c:a", "aac", "-b:a", plan.low ? "96k" : plan.audio.ch > 2 ? "256k" : "160k", "-ac", plan.low ? "2" : plan.audio.ch > 2 ? "6" : "2"]));
  args.push("-sn", "-dn", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1");
  const p = spawn(ff, args, { stdio: ["ignore", "pipe", "pipe"] });
  // conversions en cours (le travail de fond du serveur attend qu'elles soient finies, voir lecture.js)
  if (plan.mode === "transcode") { ACTIVE.add(p); p.on("close", () => ACTIVE.delete(p)); p.on("error", () => ACTIVE.delete(p)); }
  let err = ""; p.stderr.on("data", (d) => { if (err.length < 2000) err += d; });
  res.writeHead(200, { "Content-Type": "video/mp4", "Cache-Control": "no-store", "X-Rembobine-Mode": plan.mode });
  p.stdout.pipe(res);
  const stop = () => { try { p.kill("SIGKILL"); } catch (_) {} };
  req.on("close", stop); res.on("close", stop);
  p.on("close", (code) => { if (code && err && !res.writableEnded) { try { res.end(); } catch (_) {} } });
  return p;
}

// sous-titres en WebVTT (ce que lit le navigateur) : intégrés au fichier (n), ou fichier à côté (file)
function subtitles(req, res, { file, stream: n, sidecar, ss }) {
  const ff = bins().ffmpeg;
  if (!ff) { res.writeHead(501); return res.end(); }
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin"];
  if (ss > 0) args.push("-ss", String(ss));
  if (sidecar) args.push("-sub_charenc", "UTF-8", "-i", sidecar, "-map", "0:s:0"); else args.push("-i", file, "-map", `0:s:${n}`);
  args.push("-f", "webvtt", "pipe:1");
  const p = spawn(ff, args, { stdio: ["ignore", "pipe", "pipe"] });
  let out = Buffer.alloc(0), err = "";
  p.stdout.on("data", (d) => { out = Buffer.concat([out, d]); });
  p.stderr.on("data", (d) => { err += d; });
  p.on("close", (code) => {
    if (code && sidecar && /Invalid UTF-8|invalid/i.test(err)) {   // vieux fichiers .srt en Latin-1 : on réessaie
      const q = spawn(ff, ["-hide_banner", "-loglevel", "error", "-nostdin", ...(ss > 0 ? ["-ss", String(ss)] : []), "-sub_charenc", "CP1252", "-i", sidecar, "-map", "0:s:0", "-f", "webvtt", "pipe:1"]);
      let o2 = Buffer.alloc(0); q.stdout.on("data", (d) => { o2 = Buffer.concat([o2, d]); });
      return q.on("close", () => { res.writeHead(200, { "Content-Type": "text/vtt; charset=utf-8" }); res.end(o2); });
    }
    res.writeHead(code ? 500 : 200, { "Content-Type": "text/vtt; charset=utf-8" }); res.end(code ? "WEBVTT\n" : out);
  });
  req.on("close", () => { try { p.kill(); } catch (_) {} });
}

// sous-titres posés à côté du film : « Film.srt », « Film.fr.srt », « Film.français.ass »…
const LANGS = { fr: "fr", fre: "fr", fra: "fr", french: "fr", francais: "fr", "français": "fr", en: "en", eng: "en", english: "en", anglais: "en", es: "es", spa: "es", de: "de", ger: "de", deu: "de", it: "it", ita: "it" };
function sidecars(file) {
  const dir = path.dirname(file), base = path.basename(file).replace(/\.[^.]+$/, "");
  // (vrais fichiers seulement : un lien symbolique « Film.srt » vers un fichier de la machine est ignoré)
  let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name); } catch (_) { return []; }
  return names.filter((n) => /\.(srt|vtt|ass|ssa)$/i.test(n) && n.toLowerCase().startsWith(base.toLowerCase()))
    .map((n) => { const mid = n.slice(base.length).replace(/\.(srt|vtt|ass|ssa)$/i, "").replace(/^[._ -]+/, "").toLowerCase(); const lang = LANGS[mid.split(/[._ -]/)[0]] || mid.slice(0, 3) || ""; return { file: path.join(dir, n), lang, forced: /forc/.test(mid) }; });
}

module.exports = { probe, decide, parseCan, stream, subtitles, sidecars, bins, pickAudio, h264Args, filters, canTonemap, active };
