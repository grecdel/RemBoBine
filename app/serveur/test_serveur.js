// Test du serveur Rembobine : node app/serveur/test_serveur.js
// Crée une fausse bibliothèque et un faux lecteur mpv dans un dossier temporaire, démarre le serveur,
// puis vérifie : appairage, refus sans clé, bibliothèque, jaquettes signées, streaming par morceaux,
// événements en direct, lecture sur la TV (reprise, pause, avance) et arrêt.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const { createServer } = require("./serveur");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-test-"));
const M = path.join(T, "media");
const put = (rel, data) => { const f = path.join(M, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const blob = (n) => Buffer.alloc(n, 7);
put("Films/Horizon Rouge (2021)/horizon.rouge.2021.1080p.mkv", blob(300000)); put("Films/Horizon Rouge (2021)/poster.jpg", "JPG");
put("Films/Le.Grand.Bleu.1988.BluRay.mp4", Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256))); put("Films/Le.Grand.Bleu.1988.BluRay.jpg", "JPG2");
for (const e of ["01", "02", "03"]) put(`Series/Les Veilleurs/Saison 1/Les.Veilleurs.S01E${e}.mkv`, blob(1000));
put("Series/Les Veilleurs/folder.jpg", "X");
put("Jeux/SNES/Turbo Kart (France).zip", blob(2000)); put("Jeux/Sky Pirates.sfc", blob(2000));
put("Musique/Radio Fantôme - Vertiges/01 - Ouverture.mp3", blob(800)); put("Musique/Radio Fantôme - Vertiges/02 - Nuit.mp3", blob(800)); put("Musique/Radio Fantôme - Vertiges/cover.jpg", "C");
for (const i of [1, 2, 3]) put(`Photos/Été à la mer/IMG_${i}.jpg`, "P");
put("Livres/Jules Verne - Vingt mille lieues.epub", "B");
// faux mpv : répond sur le socket IPC comme le vrai
const fake = path.join(T, "mpv");
fs.writeFileSync(fake, `#!/usr/bin/env node
const net=require("net"),fs=require("fs");const a=process.argv.slice(2);const sock=(a.find(x=>x.startsWith("--input-ipc-server="))||"").split("=")[1];
let pos=Number((a.find(x=>x.startsWith("--start="))||"=0").split("=")[1]),pause=false;fs.writeFileSync(${JSON.stringify(path.join(T, "mpv.args"))},JSON.stringify(a));
setInterval(()=>{if(!pause)pos+=1},200);try{fs.unlinkSync(sock)}catch(_){}
net.createServer(c=>{let b="";c.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))>=0){const l=b.slice(0,i);b=b.slice(i+1);const j=JSON.parse(l),cmd=j.command;let data=null;
if(cmd[0]==="get_property")data={"time-pos":pos,duration:6000,pause}[cmd[1]];if(cmd[0]==="cycle"&&cmd[1]==="pause")pause=!pause;if(cmd[0]==="seek")pos+=cmd[1];
c.write(JSON.stringify({request_id:j.request_id,error:"success",data})+"\\n");if(cmd[0]==="quit")setTimeout(()=>process.exit(0),50)}})}).listen(sock);
`);
fs.chmodSync(fake, 0o755);

// on appelle le serveur par l'adresse réseau de la machine (pas 127.0.0.1, qui compte comme « la TV elle-même »)
const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal);
if (!lan) { console.log("PAS D'ADRESSE RÉSEAU : test impossible ici"); process.exit(1); }
const PORT = 18000 + Math.floor(Math.random() * 1000);
let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) ok++; else { ko++; console.log("ÉCHEC :", what); } };
function req(p, { body, tok, host = lan.address, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const h = { ...headers }; if (tok) h.Authorization = "Bearer " + tok; if (body) h["Content-Type"] = "application/json";
    const r = http.request({ host, port: PORT, path: p, method: body ? "POST" : "GET", headers: h }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => { const buf = Buffer.concat(ch); let json = null; try { json = JSON.parse(buf); } catch (_) {} resolve({ status: res.statusCode, headers: res.headers, buf, json }); });
    });
    r.on("error", reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const S = createServer({ port: PORT, webDir: path.join(__dirname, "..", "..", "web"), dataDir: path.join(T, "data"), mediaRoots: [M], mpv: fake, version: "test" });
  const events = []; const realEmit = S.emit; // on écoute aussi les événements côté serveur
  await S.start();
  await wait(300);

  const info = await req("/api/info");
  check(info.json && info.json.api === 1 && info.json.paired === false, "/api/info répond, appareil non appairé");
  check((await req("/api/library")).status === 401, "bibliothèque refusée sans clé");
  check((await req("/")).status === 200, "la page Rembobine est servie");

  // appairage : la TV reçoit le code par les événements
  const es = http.get({ host: "127.0.0.1", port: PORT, path: "/api/stream" }, (res) => { res.on("data", (d) => { for (const l of String(d).split("\n")) if (l.startsWith("data: ")) events.push(JSON.parse(l.slice(6))); }); });
  await wait(200);
  await req("/api/pair/request", { body: { name: "Téléphone de test" } });
  await wait(200);
  const pe = events.find((e) => e.type === "pair");
  check(pe && /^\d{4}$/.test(pe.code), "le code s'affiche sur la TV");
  const wrong = await req("/api/pair", { body: { code: pe.code === "0000" ? "1111" : "0000", name: "x" } });
  check(wrong.json && wrong.json.ok === false, "mauvais code refusé");
  const good = await req("/api/pair", { body: { code: pe.code, name: "Téléphone de test" } });
  check(good.json && good.json.ok && good.json.token, "bon code accepté, clé reçue");
  const tok = good.json.token;
  check((await req("/api/pair", { body: { code: pe.code } })).json.ok === false, "un code ne sert qu'une fois");

  // bibliothèque
  const lib = (await req("/api/library", { tok })).json;
  const by = (k, t) => lib.items.find((x) => x.kind === k && (!t || x.title === t));
  check(by("film", "Horizon Rouge") && by("film", "Horizon Rouge").year === 2021, "film rangé dans son dossier : titre et année");
  check(by("film", "Le Grand Bleu") && by("film", "Le Grand Bleu").year === 1988, "film au nom de fichier technique nettoyé");
  const serie = by("serie", "Les Veilleurs");
  check(serie && serie.episodes.length === 3 && serie.episodes[2].e === 3, "série avec 3 épisodes numérotés");
  check(by("game", "Turbo Kart") && by("game", "Turbo Kart").platform === "Super Nintendo", "jeu .zip reconnu par son dossier de console");
  check(by("game", "Sky Pirates") && by("game", "Sky Pirates").sys === "snes", "jeu reconnu par son extension");
  const album = by("album", "Vertiges");
  check(album && album.artist === "Radio Fantôme" && album.tracks.length === 2 && album.tracks[0].title === "Ouverture", "album, artiste et pistes");
  check(by("photos", "Été à la mer") && by("photos", "Été à la mer").count === 3, "album photo");
  check(by("book") && by("book").author === "Jules Verne", "livre et auteur");

  // jaquettes : signature
  const film = by("film", "Horizon Rouge");
  check((await req(film.cover)).status === 200, "jaquette visible avec sa signature");
  check((await req(film.cover.replace(/k=.*/, "k=faux"))).status === 401, "jaquette refusée avec une fausse signature");

  // streaming par morceaux (pour avancer dans un film)
  const gb = by("film", "Le Grand Bleu");
  const part = await req(`/media/${gb.id}?tok=${tok}`, { headers: { Range: "bytes=100-199" } });
  check(part.status === 206 && part.buf.length === 100 && part.buf[0] === 100 && part.headers["content-range"] === "bytes 100-199/5000", "lecture d'un morceau du fichier");
  check((await req(`/media/${gb.id}`)).status === 401, "fichier refusé sans clé");

  // lecture sur la TV
  const pl = await req("/api/play", { tok, body: { id: film.id } });
  check(pl.json && pl.json.ok && pl.json.start === 0, "film lancé sur la TV");
  await wait(3600);
  const now = (await req("/api/now", { tok })).json;
  check(now.playing && now.pos > 0 && now.dur === 6000, "la TV dit où en est le film");
  check((await req("/api/play/cmd", { tok, body: { cmd: "toggle" } })).json.ok, "pause depuis le téléphone");
  check((await req("/api/play/cmd", { tok, body: { cmd: "seek", sec: 600 } })).json.ok, "avance de 10 minutes");
  await wait(3300);
  check(events.some((e) => e.type === "playing" && e.paused === true && e.pos >= 600), "la télécommande est prévenue (pause, position)");
  check((await req("/api/play/cmd", { tok, body: { cmd: "osd", text: "Message sur la TV" } })).json.ok, "message affiché par-dessus le film");
  check((await req("/api/play/cmd", { tok, body: { cmd: "stop" } })).json.ok, "arrêt");
  await wait(1200);
  check(events.some((e) => e.type === "stopped"), "fin de lecture annoncée");
  // reprise : la position a été gardée
  const pl2 = await req("/api/play", { tok, body: { id: film.id } });
  check(pl2.json && pl2.json.start >= 600, `reprise au bon endroit (${pl2.json && pl2.json.start} s)`);
  await wait(700);
  const args = JSON.parse(fs.readFileSync(path.join(T, "mpv.args"), "utf8"));
  check(args.includes("--fs") && args.some((a) => a.startsWith("--start=")), "mpv lancé en plein écran, à la bonne position");
  check(args.some((a) => a.startsWith("--input-conf=")), "chiffres du lecteur de cartouches neutralisés dans mpv");
  await req("/api/play/cmd", { tok, body: { cmd: "stop" } });
  // télécommande : touches pendant la lecture (le lecteur obéit), album et diaporama sur la TV
  await req("/api/play", { tok, body: { id: film.id } }); await wait(500);
  check((await req("/api/key", { tok, body: { key: "right" } })).json.ok, "touche → avance de 10 s pendant la lecture");
  check((await req("/api/key", { tok, body: { key: "back" } })).json.ok, "touche retour → arrêt de la lecture");
  await wait(900);
  const pk = await req("/api/key", { tok, body: { key: "ok" } }); await wait(200);
  check(pk.json.ok && events.some((e) => e.type === "key" && e.key === "ok"), "hors lecture, la touche OK va à l'écran de la TV " + JSON.stringify(pk.json));
  const pt = await req("/api/key", { tok, body: { text: "horizon" } }); await wait(200);
  check(pt.json.ok && events.some((e) => e.type === "key" && e.text === "horizon"), "clavier du téléphone → texte sur la TV");
  const pa = await req("/api/play", { tok, body: { id: album.id } });
  check(pa.json.ok, "album lancé sur la TV");
  await wait(700);
  const argsA = JSON.parse(fs.readFileSync(path.join(T, "mpv.args"), "utf8"));
  check(argsA.filter((a) => a.endsWith(".mp3")).length === 2, "toutes les pistes de l'album passent au lecteur");
  check((await req("/api/now", { tok })).json.kind === "album", "la télécommande sait qu'un album passe");
  const pp = await req("/api/play", { tok, body: { id: by("photos").id } });
  await wait(700);
  const argsP = JSON.parse(fs.readFileSync(path.join(T, "mpv.args"), "utf8"));
  check(pp.json.ok && argsP.includes("--image-display-duration=6"), "diaporama lancé sur la TV (6 s par photo)");
  await req("/api/play/cmd", { tok, body: { cmd: "stop" } }); await wait(900);
  // jeu sans RetroArch sur la machine : ouvert dans l'émulateur intégré de l'écran de la TV
  const pg = await req("/api/game", { tok, body: { id: by("game", "Sky Pirates").id } }); await wait(200);
  check(pg.json.ok && pg.json.emu === "émulateur intégré" && events.some((e) => e.type === "emu" && e.title === "Sky Pirates"), "jeu sans RetroArch : ouvert dans l'émulateur intégré de la TV");
  // série : sans précision, le premier épisode
  const ps = await req("/api/play", { tok, body: { id: serie.id } });
  check(ps.json.ok, "série lancée sur la TV");
  await req("/api/play/cmd", { tok, body: { cmd: "stop" } });

  // séance avec un ami à distance : invitation, accès invité limité, salon
  const inv = (await req("/api/invite", { tok, body: { code: "ABCD", item: { id: film.id, title: "Horizon Rouge" }, who: "Moi" } })).json;
  check(inv.ok && inv.code === "ABCD", "invitation créée avec le code de la séance");
  check((await req("/api/pair", { body: { invite: "ZZZZ", name: "Intrus" } })).json.ok === false, "faux code d'invitation refusé");
  const g = (await req("/api/pair", { body: { invite: "abcd", name: "Léa" } })).json;
  check(g.ok && g.guest && g.token, "un ami rejoint avec le code d'invitation (accès invité)");
  check((await req("/api/library", { tok: g.token })).status === 200, "l'invité voit la bibliothèque");
  check((await req(`/media/${gb.id}?tok=${g.token}`, { headers: { Range: "bytes=0-9" } })).status === 206, "l'invité peut regarder le film");
  check((await req("/api/play", { tok: g.token, body: { id: film.id } })).status === 403, "l'invité ne pilote pas la TV");
  check((await req("/api/key", { tok: g.token, body: { key: "ok" } })).status === 403, "l'invité n'a pas la télécommande");
  check((await req("/api/invite", { tok: g.token, body: {} })).status === 403, "l'invité ne crée pas d'invitation");
  check((await req("/api/party", { tok })).json.guests.includes("Léa"), "le panneau de la TV voit l'invitée");
  await req("/api/room", { tok, body: { room: "seance-abcd", peer: "hote", presence: { se: 1, host: 1, title: "Horizon Rouge", t: 42, p: false } } });
  await req("/api/room", { tok: g.token, body: { room: "seance-abcd", peer: "lea", presence: { se: 1, n: "Léa" } } });
  await wait(200);
  const rev = events.filter((e) => e.type === "room" && e.room === "seance-abcd").pop();
  check(rev && rev.peers.length === 2 && rev.peers.some((x) => x.presence.t === 42), "salon de la séance : l'hôte et l'invitée se voient");
  await req("/api/room", { tok: g.token, body: { room: "seance-abcd", peer: "lea", leave: true } }); await wait(150);
  check(events.filter((e) => e.type === "room").pop().peers.length === 1, "départ de l'invitée annoncé");
  check((await req("/api/party", { tok, body: { action: "end" } })).json.ok && (await req("/api/library", { tok: g.token })).status === 401, "fin de séance : l'accès invité est retiré");
  // cartouches NFC
  check((await req("/api/cards", { tok, body: { set: { uid: "04A1B2C3D4E580", id: "x", title: "Horizon Rouge", kind: "film", alias: ["123456789"] } } })).json.ok, "cartouche enregistrée");
  await wait(150);
  check(events.some((e) => e.type === "cards"), "les écrans sont prévenus d'une nouvelle cartouche");
  check((await req("/api/cards", { tok })).json.cards["04A1B2C3D4E580"].title === "Horizon Rouge", "liste des cartouches");
  check((await req("/api/cards/tap", { tok, body: { uid: "04A1B2C3D4E580", id: "x" } })).json.ok, "cartouche touchée au téléphone : la TV est prévenue");
  await wait(150);
  check(events.some((e) => e.type === "card" && e.id === "x"), "la TV reçoit la cartouche");
  check((await req("/api/cards", { tok, body: { del: "04A1B2C3D4E580" } })).json.ok && !(await req("/api/cards", { tok })).json.cards["04A1B2C3D4E580"], "cartouche effacée");
  es.destroy(); await wait(150);
  check((await req("/api/cards/tap", { tok, body: { uid: "1", id: "x" } })).json.err === "La TV n'est pas allumée.", "TV éteinte : le téléphone est prévenu");
  await S.stop();
  fs.rmSync(T, { recursive: true, force: true });
  console.log(`Serveur : ${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.log("ERREUR", e); process.exit(1); });
