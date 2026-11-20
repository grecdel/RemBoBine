// Test de la musique du serveur : node app/serveur/test_musique.js
// Paroles (.lrc posé à côté, paroles dans les étiquettes via un faux ffprobe), égaliseur (filtre mpv),
// et passage de l'égaliseur au faux mpv quand la TV lit un album. Rien sur internet.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const MU = require("./musique");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-musique-"));
const M = path.join(T, "media");
const put = (rel, data) => { const f = path.join(M, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const t1 = put("Musique/Les Phares - Marées/01 - Ouverture.mp3", Buffer.alloc(900, 7));
put("Musique/Les Phares - Marées/01 - OUVERTURE.lrc", "[ar:Les Phares]\n[00:01.50]Première ligne\n[00:04.00]Deuxième ligne\n");
const t2 = put("Musique/Les Phares - Marées/02 - Nuit.mp3", Buffer.alloc(900, 7));
const t3 = put("Musique/Les Phares - Marées/03 - Fin.mp3", Buffer.alloc(900, 7));
// faux ffprobe : des paroles dans les étiquettes pour « Nuit », rien pour « Fin »
const fakeProbe = path.join(T, "ffprobe");
fs.writeFileSync(fakeProbe, `#!/usr/bin/env node
const f=process.argv[process.argv.length-1];
const tags=/Nuit/.test(f)?{title:"Nuit",LYRICS:"Paroles sans minutage\\nSur deux lignes"}:{title:"Fin"};
process.stdout.write(JSON.stringify({format:{tags},streams:[{codec_type:"audio"}]}));
`);
fs.chmodSync(fakeProbe, 0o755);
// faux mpv : note ses arguments et répond sur le socket IPC
const fake = path.join(T, "mpv"), argsFile = path.join(T, "mpv.args"), cmdsFile = path.join(T, "mpv.cmds");
fs.writeFileSync(fake, `#!/usr/bin/env node
const net=require("net"),fs=require("fs");const a=process.argv.slice(2);const sock=(a.find(x=>x.startsWith("--input-ipc-server="))||"").split("=")[1];
fs.writeFileSync(${JSON.stringify(argsFile)},JSON.stringify(a));try{fs.unlinkSync(sock)}catch(_){}
net.createServer(c=>{let b="";c.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))>=0){const l=b.slice(0,i);b=b.slice(i+1);const j=JSON.parse(l),cmd=j.command;
fs.appendFileSync(${JSON.stringify(cmdsFile)},JSON.stringify(cmd)+"\\n");let data=null;if(cmd[0]==="get_property")data={"time-pos":1,duration:200,pause:false}[cmd[1]];
c.write(JSON.stringify({request_id:j.request_id,error:"success",data})+"\\n");if(cmd[0]==="quit")setTimeout(()=>process.exit(0),50)}})}).listen(sock);
`);
fs.chmodSync(fake, 0o755);

let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) ok++; else { ko++; console.log("ÉCHEC :", what); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 19000 + Math.floor(Math.random() * 1000);
// 127.0.0.1 = l'écran de la TV elle-même : pas besoin d'appairage
function req(p, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PORT, path: p, method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {} }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => { let json = null; try { json = JSON.parse(Buffer.concat(ch)); } catch (_) {} resolve({ status: res.statusCode, json }); });
    });
    r.on("error", reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}

(async () => {
  // --- fonctions seules ---
  check(MU.eqFilter({ bass: 0, mid: 0, treble: 0 }) === "", "égaliseur à plat : aucun filtre");
  const f = MU.eqFilter({ bass: 4, mid: -2, treble: 30 });
  check(/^lavfi=\[bass=g=4:f=110,equalizer=f=1000:t=q:w=0.9:g=-2,treble=g=12:f=4500\]$/.test(f), "filtre mpv des graves, médiums, aigus (limité à ±12 dB) : " + f);
  check(MU.isSynced("[01:02.30]x") && !MU.isSynced("juste du texte"), "reconnaît les paroles minutées");
  const l1 = await MU.lyricsFor(t1, fakeProbe);
  check(l1.ok && l1.from === "fichier" && l1.synced && /Deuxième ligne/.test(l1.text), "paroles du .lrc posé à côté (majuscules ignorées)");
  const l2 = await MU.lyricsFor(t2, fakeProbe);
  check(l2.ok && l2.from === "étiquettes" && !l2.synced && /deux lignes/.test(l2.text), "paroles lues dans les étiquettes par ffprobe");
  const l3 = await MU.lyricsFor(t3, fakeProbe);
  check(!l3.ok, "pas de paroles : réponse claire");
  const l4 = await MU.lyricsFor(t2, "");
  check(!l4.ok, "sans ffprobe : pas de plantage");

  // --- par le serveur ---
  const { createServer } = require("./serveur");
  const S = createServer({ port: PORT, webDir: path.join(__dirname, "..", "..", "web"), dataDir: path.join(T, "data"), mediaRoots: [M], mpv: fake, version: "test" });
  await S.start(); await wait(300);
  const lib = await req("/api/library");
  const al = lib.json && lib.json.items.find((x) => x.kind === "album");
  check(al && al.tracks.length === 3, "l'album est dans la bibliothèque");
  const ly = await req(`/api/lyrics/${encodeURIComponent(al.id)}/0`);
  check(ly.json && ly.json.ok && ly.json.synced, "/api/lyrics renvoie les paroles minutées du premier titre");
  check((await req(`/api/lyrics/${encodeURIComponent(al.id)}/9`)).status === 404, "/api/lyrics : titre inconnu → 404");
  const e0 = await req("/api/eq");
  check(e0.json && e0.json.eq && e0.json.eq.bass === 0, "/api/eq : à plat au départ");
  const e1 = await req("/api/eq", { bass: 6, mid: 0, treble: -3 });
  check(e1.json && e1.json.ok && e1.json.eq.bass === 6 && e1.json.eq.treble === -3, "/api/eq enregistre le réglage");
  const cfg = JSON.parse(fs.readFileSync(path.join(T, "data", "serveur.json"), "utf8"));
  check(cfg.eq && cfg.eq.bass === 6, "réglage gardé dans serveur.json");
  const pl = await req("/api/play", { id: al.id, track: 1 });
  check(pl.json && pl.json.ok, "lecture de l'album sur la TV");
  await wait(500);
  const args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  check(args.some((a) => a === "--af=lavfi=[bass=g=6:f=110,treble=g=-3:f=4500]"), "mpv reçoit l'égaliseur au lancement de l'album");
  const e2 = await req("/api/eq", { bass: 0, mid: 3, treble: 0 });
  await wait(200);
  const cmds = fs.existsSync(cmdsFile) ? fs.readFileSync(cmdsFile, "utf8") : "";
  check(e2.json && e2.json.live && /\["af","set","lavfi=\[equalizer=f=1000:t=q:w=0.9:g=3\]"\]/.test(cmds), "égaliseur changé en direct pendant la musique");
  await req("/api/play/cmd", { cmd: "stop" }); await wait(400);
  await S.stop?.();
  console.log(`${ok} vérifications réussies, ${ko} échec${ko > 1 ? "s" : ""}.`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
