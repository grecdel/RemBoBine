// Test des formats vidéo : node app/serveur/test_codecs.js (demande ffmpeg)
// Fabrique de petites vidéos dans les formats courants et vérifie le mode choisi par le serveur
// pour un appareil « navigateur » (H.264, VP9, AV1, AAC, MP3, Opus, FLAC, mkv), puis que la conversion produit bien une vidéo.
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync } = require("child_process");
const V = require("./video");

if (!V.bins().ffmpeg) { console.log("ffmpeg absent : test impossible ici"); process.exit(0); }
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-codecs-"));
const SRC = ["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=25:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2"];
const CAS = [
  ["h264_aac.mp4", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"], "direct"],
  ["h264_ac3.mkv", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "ac3"], "remux"],
  ["h264_dts.mkv", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "dca", "-strict", "-2", "-ar", "48000"], "remux"],
  ["h264_aac.ts", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"], "remux"],
  ["vp9_opus.webm", ["-c:v", "libvpx-vp9", "-b:v", "200k", "-c:a", "libopus"], "direct"],
  ["hevc_aac.mkv", ["-c:v", "libx265", "-pix_fmt", "yuv420p", "-c:a", "aac", "-x265-params", "log-level=error"], "transcode"],
  ["xvid_mp3.avi", ["-c:v", "mpeg4", "-c:a", "libmp3lame"], "transcode"],
  ["mpeg2.mpg", ["-c:v", "mpeg2video", "-c:a", "mp2"], "transcode"]
];
const can = V.parseCan("h264,h264_10,vp9,av1,aac,mp3,opus,flac,vorbis,mkv");
let ok = 0, ko = 0, skip = 0;
(async () => {
  for (const [name, args, want] of CAS) {
    const f = path.join(T, name);
    const r = spawnSync(V.bins().ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...SRC, ...args, "-shortest", f]);
    if (r.status !== 0) { skip++; console.log("ignoré (encodeur absent) :", name); continue; }
    const info = await V.probe(f), plan = V.decide(info, f, can, null);
    if (plan.mode === want) ok++; else { ko++; console.log(`ÉCHEC ${name} : ${plan.mode} au lieu de ${want}`); }
    if (plan.mode !== "direct") {
      // la conversion produit-elle une vidéo lisible ? (on la relit avec ffprobe)
      const out = path.join(T, name + ".out.mp4"), fake = { on() {}, }, chunks = [];
      await new Promise((resolve) => {
        const res = { writeHead() {}, on() {}, writableEnded: false, write(d) { chunks.push(Buffer.from(d)); return true; }, end() { resolve(); }, once() {}, emit() {}, removeListener() {} };
        const p = V.stream(fake, res, f, plan, 0); p.stdout.unpipe(res); p.stdout.on("data", (d) => chunks.push(d)); p.on("close", resolve);
      });
      fs.writeFileSync(out, Buffer.concat(chunks));
      const back = await V.probe(out);
      const good = back && back.video && back.video.codec === "h264" && back.audio[0] && ["aac", "mp3", "opus", "flac"].includes(back.audio[0].codec);
      if (good) ok++; else { ko++; console.log(`ÉCHEC conversion ${name}`, back && back.video && back.video.codec, back && back.audio[0] && back.audio[0].codec); }
    }
  }
  fs.rmSync(T, { recursive: true, force: true });
  console.log(`Formats vidéo : ${ok} OK, ${ko} échec(s)${skip ? `, ${skip} ignoré(s)` : ""}`);
  process.exit(ko ? 1 : 0);
})();
