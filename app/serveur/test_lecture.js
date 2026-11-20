// Test des extras de la lecture vidéo : node app/serveur/test_lecture.js (demande ffmpeg)
// Fabrique une petite série (3 épisodes qui partagent le même générique, placé à des moments différents),
// un film avec chapitres, un film « 4K HDR », puis vérifie : générique repéré à l'oreille et par les chapitres,
// position choisie à la main retenue pour la saison, vignettes, version préparée et version légère (hors-ligne),
// décalage du son et conversion HDR → SDR, et, sur la TV (faux mpv) : vitesse, décalages, mode nuit, capture,
// minuteur, compte à rebours de l'épisode suivant.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const { spawnSync } = require("child_process");
const V = require("./video");
const { createServer } = require("./serveur");
const { fingerprint, match } = require("./lecture");

if (!V.bins().ffmpeg) { console.log("ffmpeg absent : test impossible ici"); process.exit(0); }
const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal);
if (!lan) { console.log("PAS D'ADRESSE RÉSEAU : test impossible ici"); process.exit(1); }
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-lecture-"));
const M = path.join(T, "media");
const ff = (args) => { const r = spawnSync(V.bins().ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" }); if (r.status !== 0) throw new Error(r.stderr); };
const mk = (rel) => { const f = path.join(M, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; };

// le « générique » : une mélodie qui change tout le temps ; autour, des bruits différents à chaque épisode
const MELODIE = "aevalsrc=0.4*sin(2*PI*t*(300+200*sin(t*1.3)))+0.3*sin(2*PI*t*(900+400*sin(t*0.7)))+0.2*sin(2*PI*t*(2000+600*sin(t*2.1))):s=48000:d=20";
[[5, 1], [12, 2], [8, 3]].forEach(([avant, n]) => ff(["-f", "lavfi", "-i", `anoisesrc=d=${avant}:c=pink:seed=${n}:a=0.3:r=48000`, "-f", "lavfi", "-i", MELODIE,
  "-f", "lavfi", "-i", `anoisesrc=d=${45 - avant}:c=brown:seed=${n * 7}:a=0.3:r=48000`, "-f", "lavfi", "-i", "testsrc2=size=96x54:rate=5:d=65",
  "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]", "-map", "3:v", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", mk(`Series/Les Phares/Saison 1/Les.Phares.S01E0${n}.mkv`)]));
// film avec chapitres « Intro » et « Générique de fin »
const meta = path.join(T, "chap.txt");
fs.writeFileSync(meta, ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=8000\ntitle=Intro\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=8000\nEND=40000\ntitle=Le film\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=40000\nEND=50000\ntitle=Générique de fin\n");
ff(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:d=50", "-f", "lavfi", "-i", "sine=frequency=440:duration=50", "-i", meta, "-map_metadata", "2", "-map_chapters", "2", "-map", "0:v", "-map", "1:a",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", mk("Films/Le Phare (2020)/Le.Phare.2020.mkv")]);
ff(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:d=12", "-f", "lavfi", "-i", "sine=frequency=330:duration=12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", mk("Films/La.Mer.2019.mp4")]);
let hdrOk = true;
try { ff(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=10:d=3", "-f", "lavfi", "-i", "sine=duration=3", "-c:v", "libx265", "-pix_fmt", "yuv420p10le", "-x265-params", "log-level=error",
  "-color_trc", "smpte2084", "-color_primaries", "bt2020", "-colorspace", "bt2020nc", "-c:a", "aac", mk("Films/Aurore.HDR.2022.mkv")]); } catch (_) { hdrOk = false; }

// faux mpv : garde les réglages demandés, écrit les captures, film de 30 s
const fake = path.join(T, "mpv");
fs.writeFileSync(fake, `#!/usr/bin/env node
const net=require("net"),fs=require("fs");const a=process.argv.slice(2);const sock=(a.find(x=>x.startsWith("--input-ipc-server="))||"").split("=")[1];
const P={"time-pos":Number((a.find(x=>x.startsWith("--start="))||"=0").split("=")[1]),duration:30,pause:false,speed:1,"sub-delay":0,"audio-delay":0,chapter:0};
fs.writeFileSync(${JSON.stringify(path.join(T, "mpv.args"))},JSON.stringify(a));const log=${JSON.stringify(path.join(T, "mpv.log"))};
setInterval(()=>{if(!P.pause)P["time-pos"]=Math.min(29.5,P["time-pos"]+1)},200);try{fs.unlinkSync(sock)}catch(_){}
net.createServer(c=>{let b="";c.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))>=0){const l=b.slice(0,i);b=b.slice(i+1);const j=JSON.parse(l),cmd=j.command;let data=null;fs.appendFileSync(log,JSON.stringify(cmd)+"\\n");
if(cmd[0]==="get_property")data=P[cmd[1]];if(cmd[0]==="set_property")P[cmd[1]]=cmd[2];if(cmd[0]==="add")P[cmd[1]]=Math.round(((P[cmd[1]]||0)+cmd[2])*100)/100;
if(cmd[0]==="cycle"&&cmd[1]==="pause")P.pause=!P.pause;if(cmd[0]==="seek")P["time-pos"]=cmd[2]==="absolute"?cmd[1]:P["time-pos"]+cmd[1];
if(cmd[0]==="screenshot-to-file")fs.writeFileSync(cmd[1],"JPG");
c.write(JSON.stringify({request_id:j.request_id,error:"success",data})+"\\n");if(cmd[0]==="quit")setTimeout(()=>process.exit(0),50)}})}).listen(sock);
`);
fs.chmodSync(fake, 0o755);

const PORT = 19000 + Math.floor(Math.random() * 900);
let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) ok++; else { ko++; console.log("ÉCHEC :", what); } };
function req(p, { body, tok, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const h = { ...headers }; if (tok) h.Authorization = "Bearer " + tok; if (body) h["Content-Type"] = "application/json";
    const r = http.request({ host: lan.address, port: PORT, path: p, method: body ? "POST" : "GET", headers: h }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => { const buf = Buffer.concat(ch); let json = null; try { json = JSON.parse(buf); } catch (_) {} resolve({ status: res.statusCode, headers: res.headers, buf, json }); });
    });
    r.on("error", reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await wait(300); } return null; };

(async () => {
  // l'empreinte seule : deux sons identiques décalés se retrouvent
  const pcm = new Int16Array(8000 * 40); let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
  for (let i = 0; i < pcm.length; i++) pcm[i] = rnd() * 8000;
  for (let i = 8000 * 10; i < 8000 * 30; i++) { const t = i / 8000; pcm[i] = 9000 * Math.sin(2 * Math.PI * t * (300 + 200 * Math.sin(t * 1.3))); }
  const pcm2 = new Int16Array(8000 * 40); for (let i = 0; i < pcm2.length; i++) pcm2[i] = rnd() * 8000; pcm2.set(pcm.subarray(8000 * 10, 8000 * 30), 8000 * 3);
  const mm = match(fingerprint(pcm), fingerprint(pcm2));
  check(mm && Math.abs(mm.ia * 0.2 - 10) < 1.5 && Math.abs(mm.ib * 0.2 - 3) < 1.5 && mm.len * 0.2 > 16, "empreinte : le passage commun est retrouvé " + JSON.stringify(mm));

  const S = createServer({ port: PORT, webDir: path.join(__dirname, "..", "..", "web"), dataDir: path.join(T, "data"), mediaRoots: [M], mpv: fake, version: "test" });
  const events = [];
  await S.start(); await wait(300);
  const es = http.get({ host: "127.0.0.1", port: PORT, path: "/api/stream" }, (res) => { res.on("data", (d) => { for (const l of String(d).split("\n")) if (l.startsWith("data: ")) events.push(JSON.parse(l.slice(6))); }); });
  await wait(200);
  await req("/api/pair/request", { body: { name: "Test" } }); await wait(200);
  const tok = (await req("/api/pair", { body: { code: events.find((e) => e.type === "pair").code, name: "Test" } })).json.token;
  const lib = (await until(async () => { const l = (await req("/api/library", { tok })).json; return l && l.items.length >= 4 ? l : null; })) || { items: [] };
  const serie = lib.items.find((x) => x.kind === "serie"), film = lib.items.find((x) => x.title === "Le Phare"), mer = lib.items.find((x) => x.title === "La Mer"), hdr = lib.items.find((x) => /Aurore/.test(x.title));
  check(serie && serie.episodes.length === 3 && film && mer, "bibliothèque de test");

  // 26. générique de début repéré à l'oreille (empreinte audio commune aux épisodes de la saison)
  const e2 = serie.episodes[1];
  const first = (await req(`/api/intro/${e2.id}`, { tok })).json;
  check(first.ok && first.pending === true, "empreinte en cours de calcul au premier appel");
  const got = await until(async () => { const r = (await req(`/api/intro/${e2.id}`, { tok })).json; return r && !r.pending ? r : null; }, 90000);
  check(got && got.src === "empreinte" && Math.abs(got.start - 12) < 2 && Math.abs(got.end - 32) < 2.5, "générique de l'épisode 2 repéré vers 12 s → 32 s : " + JSON.stringify(got));
  const g1 = await until(async () => { const r = (await req(`/api/intro/${serie.episodes[0].id}`, { tok })).json; return r && !r.pending ? r : null; }, 90000);
  check(g1 && Math.abs(g1.start - 5) < 2, "et celui de l'épisode 1 vers 5 s : " + JSON.stringify(g1));
  // chapitres nommés
  const gf = (await req(`/api/intro/${film.id}`, { tok })).json;
  check(gf.src === "chapitres" && gf.start === 0 && gf.end === 8 && gf.credits === 40, "film : intro et générique de fin lus dans les chapitres " + JSON.stringify(gf));
  // position choisie à la main : pour toute la saison
  await req(`/api/intro/${e2.id}`, { tok, body: { intro: [60, 90] } });
  const gm = (await req(`/api/intro/${serie.episodes[2].id}`, { tok })).json;
  check(gm.src === "main" && gm.start === 60 && gm.end === 90, "position choisie à la main retenue pour les autres épisodes de la saison");
  await req(`/api/intro/${e2.id}`, { tok, body: { clear: true } });

  // 33. chapitres ; 35. HDR repéré
  const pr = (await req(`/api/probe/${film.id}?can=h264,aac,mkv`, { tok })).json;
  check(pr.chapters && pr.chapters.length === 3 && pr.chapters[2].title === "Générique de fin" && pr.chapters[1].start === 8, "chapitres du film");
  if (hdrOk) { const ph = (await req(`/api/probe/${hdr.id}?can=h264,aac,mkv,hevc`, { tok })).json; check(ph.hdr === true && ph.video.bits === 10, "film HDR reconnu"); }

  // 27. vignettes
  const th = await req(`/thumb/${film.id}?t=22&tok=${tok}`);
  check(th.status === 200 && th.headers["content-type"] === "image/jpeg" && th.buf[0] === 0xff && th.buf[1] === 0xd8, "vignette de la barre de lecture (JPEG)");
  check(fs.existsSync(path.join(T, "data", "vignettes", film.id, "20.jpg")), "vignette gardée (arrondie à 10 s)");
  check((await req(`/thumb/${film.id}?t=22`)).status === 401, "vignette refusée sans clé");

  // 29. décalage du son par le serveur ; 35. conversion HDR → SDR
  const grab = async (u) => { const r = await req(u); const f = path.join(T, "out" + Math.random() + ".mp4"); fs.writeFileSync(f, r.buf); return V.probe(f); };
  const ad = await grab(`/media/${mer.id}?tok=${tok}&mode=auto&can=h264,aac&ad=0.5`);
  check(ad && ad.video && ad.video.codec === "h264" && ad.audio.length === 1, "son décalé : vidéo gardée, son présent");
  if (hdrOk) { const sd = await grab(`/media/${hdr.id}?tok=${tok}&mode=auto&can=h264,aac,hevc,h264_10&sdr=1`); check(sd && sd.video && sd.video.codec === "h264" && sd.video.bits === 8 && !sd.video.hdr, "HDR → SDR (H.264 8 bits)"); }

  // 36. version préparée à l'avance ; 37. version légère pour le téléphone
  check((await req("/api/prepare", { tok, body: { id: film.id, profil: "salon" } })).json.ok, "préparation demandée");
  check((await req("/api/prepare", { tok, body: { id: film.id, profil: "leger" } })).json.ok, "version légère demandée");
  const done = await until(async () => { const j = (await req("/api/prepare", { tok })).json.jobs; return j.filter((x) => x.id === film.id && x.state === "prête").length === 2 ? j : null; }, 120000);
  check(done, "les deux versions sont prêtes");
  check(events.some((e) => e.type === "prepare" && e.done && e.ok), "la page est prévenue quand une version est prête");
  const off = await req(`/offline/${film.id}?tok=${tok}`);
  check(off.status === 200 && /attachment/.test(off.headers["content-disposition"] || "") && off.buf.length > 1000, "téléchargement de la version légère");
  const pf = path.join(T, "leger.mp4"); fs.writeFileSync(pf, off.buf); const pi = await V.probe(pf);
  check(pi && pi.video.codec === "h264" && pi.video.h <= 720 && pi.audio[0].codec === "aac" && pi.audio[0].ch === 2, "version légère : H.264, 720p au plus, son stéréo");
  const pp = await req(`/media/${film.id}?tok=${tok}&prep=1`, { headers: { Range: "bytes=0-99" } });
  check(pp.status === 206 && pp.headers["content-type"] === "video/mp4", "la version préparée se lit par morceaux (on avance librement)");
  check((await req("/api/probe/" + film.id + "?can=h264", { tok })).json.prepared.salon === true, "la fiche sait qu'une version est prête");
  await req("/api/prepare", { tok, body: { id: film.id, profil: "salon", del: true } });
  check((await req("/api/probe/" + film.id + "?can=h264", { tok })).json.prepared.salon === false, "version préparée effacée");

  // sur la TV (faux mpv) : 30 vitesse, 28 sous-titres, 29 son, 32 mode nuit, 33 chapitre, 34 capture, 31 minuteur
  const cmd = async (b) => (await req("/api/play/cmd", { tok, body: b })).json;
  // générique de fin choisi à la main à 20 s (le faux mpv ne dépasse pas 30 s)
  check((await req(`/api/intro/${film.id}`, { tok, body: { credits: 20 } })).json.credits - 20 < 0.5, "début du générique de fin choisi à la main");
  check((await req("/api/play", { tok, body: { id: film.id } })).json.ok, "film lancé sur la TV"); await wait(400);
  check((await cmd({ cmd: "speed", value: 1.5 })).speed === 1.5, "vitesse ×1,5 sur la TV");
  check((await cmd({ cmd: "subdelay", sec: 0.1 })).value === 0.1 && (await cmd({ cmd: "subdelay", sec: 0.1 })).value === 0.2, "sous-titres décalés de +0,1 s par appui");
  check((await cmd({ cmd: "audiodelay", sec: -0.1 })).value === -0.1, "son décalé de −0,1 s");
  check((await cmd({ cmd: "night", on: true })).night === true, "mode nuit allumé");
  const logm = () => fs.readFileSync(path.join(T, "mpv.log"), "utf8");
  check(/"af","add","@nuit:lavfi=\[acompressor/.test(logm()), "mpv : compresseur ajouté (sons forts adoucis)");
  check((await cmd({ cmd: "chapter", n: 2 })).ok && /"set_property","chapter",2/.test(logm()), "aller au chapitre 3");
  const cap = await cmd({ cmd: "screenshot" });
  check(cap.ok && (await req(`/api/captures/${film.id}`, { tok })).json.captures.length === 1, "capture d'écran du film rangée");
  const cl = (await req(`/api/captures/${film.id}`, { tok })).json.captures[0];
  check((await req(`${cl.url}?tok=${tok}`)).status === 200 && (await req(`/capture/${film.id}/..%2F..%2Fserveur.json?tok=${tok}`)).status === 404, "capture lisible, chemin protégé");
  const sl = await cmd({ cmd: "sleep", min: 15 }); await wait(200);
  check(sl.ok && sl.sleep && sl.sleep.min === 15 && events.some((e) => e.type === "sleep" && e.min === 15), "minuteur : arrêt dans 15 min");
  await cmd({ cmd: "sleep", off: true });
  await wait(3300);
  check(await until(async () => events.some((e) => e.type === "credits" && e.film), 8000), "film : la télécommande propose « Passer le générique » au début du générique de fin");
  await cmd({ cmd: "stop" }); await wait(900);
  const args2 = (await req("/api/play", { tok, body: { id: mer.id } }), await wait(500), JSON.parse(fs.readFileSync(path.join(T, "mpv.args"), "utf8")));
  check(args2.some((a) => a.startsWith("--af=@nuit")), "le mode nuit reste pour le film suivant");
  await cmd({ cmd: "night", on: false }); await cmd({ cmd: "stop" }); await wait(900);

  // 25. épisode suivant avec compte à rebours (faux mpv : épisodes de 30 s)
  events.length = 0;
  check((await req("/api/play", { tok, body: { id: serie.id, ep: serie.episodes[0].id } })).json.ok, "épisode 1 lancé sur la TV");
  const cd = await until(async () => events.find((e) => e.type === "credits" && e.left > 0), 15000);
  check(cd && cd.next === "S1E2", "compte à rebours de l'épisode suivant " + JSON.stringify(cd));
  const nx = await until(async () => events.find((e) => e.type === "playing" && e.key === serie.episodes[1].id), 20000);
  check(nx, "l'épisode 2 démarre tout seul à la fin du compte à rebours");
  // « Rester » : on regarde le générique
  const cd2 = await until(async () => events.find((e) => e.type === "credits" && e.left > 0 && e.key === serie.episodes[1].id), 15000);
  check(cd2 && (await cmd({ cmd: "stay" })).ok, "rester pour regarder le générique");
  await wait(12000);
  check(!events.some((e) => e.type === "playing" && e.key === serie.episodes[2].id), "pas d'épisode suivant quand on reste");
  await cmd({ cmd: "stop" }); await wait(600);

  es.destroy(); await S.stop();
  fs.rmSync(T, { recursive: true, force: true });
  console.log(`Lecture vidéo : ${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.log("ERREUR", e); process.exit(1); });
