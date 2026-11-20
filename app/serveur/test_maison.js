// Test du confort de la maison côté serveur : node app/serveur/test_maison.js
// Faux disques USB (dossiers temporaires), faux lecteur de CD/DVD (état simulé), faux mpv : aucun vrai matériel, pas d'internet.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const { createServer } = require("./serveur");
const MA = require("./maison");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-maison-"));
const M = path.join(T, "media"), USB = path.join(T, "usb");
const put = (rel, data, base = M) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
put("Films/Le Grand Voyage (2001).mkv", Buffer.alloc(2000, 1));
fs.mkdirSync(USB, { recursive: true });

// faux mpv : note ses arguments ; s'arrête tout de suite si on lui demande un DVD « protégé »
const fake = path.join(T, "mpv");
fs.writeFileSync(fake, `#!/usr/bin/env node
const net=require("net"),fs=require("fs");const a=process.argv.slice(2);const sock=(a.find(x=>x.startsWith("--input-ipc-server="))||"").split("=")[1];
fs.writeFileSync(${JSON.stringify(path.join(T, "mpv.args"))},JSON.stringify(a));
if(a.includes("dvd://")&&fs.existsSync(${JSON.stringify(path.join(T, "protege"))}))process.exit(2);
try{fs.unlinkSync(sock)}catch(_){}
net.createServer(c=>{let b="";c.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))>=0){const l=b.slice(0,i);b=b.slice(i+1);const j=JSON.parse(l);
c.write(JSON.stringify({request_id:j.request_id,error:"success",data:j.command[0]==="get_property"?0:null})+"\\n");if(j.command[0]==="quit")setTimeout(()=>process.exit(0),50)}})}).listen(sock);
`);
fs.chmodSync(fake, 0o755);

const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal);
if (!lan) { console.log("PAS D'ADRESSE RÉSEAU : test impossible ici"); process.exit(1); }
const PORT = 20000 + Math.floor(Math.random() * 900);
let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) ok++; else { ko++; console.log("ÉCHEC :", what); } };
function req(p, { body, tok, host = lan.address } = {}) {
  return new Promise((resolve, reject) => {
    const h = {}; if (tok) h.Authorization = "Bearer " + tok; if (body) h["Content-Type"] = "application/json";
    const r = http.request({ host, port: PORT, path: p, method: body ? "POST" : "GET", headers: h }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => { const buf = Buffer.concat(ch); let json = null; try { json = JSON.parse(buf); } catch (_) {} resolve({ status: res.statusCode, json }); });
    });
    r.on("error", reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await wait(50); } return false; };

// --- petites fonctions, sans serveur ---
check(MA.discFromProps({}).present === false, "lecteur vide");
check(MA.discFromProps({ ID_CDROM_MEDIA: "1", ID_CDROM_MEDIA_TRACK_COUNT_AUDIO: "12" }).kind === "cd", "CD audio reconnu");
check(MA.discFromProps({ ID_CDROM_MEDIA: "1", ID_CDROM_MEDIA_DVD: "1", ID_FS_LABEL: "FILM" }).kind === "dvd", "DVD reconnu");
check(MA.discFromProps({ ID_CDROM_MEDIA: "1", ID_CDROM_MEDIA_BD: "1" }).kind === "bd", "Blu-ray reconnu");
check(MA.discFromProps({ ID_CDROM_MEDIA: "1", ID_FS_TYPE: "iso9660" }).kind === "data", "disque de données reconnu");
check(MA.probeDisc(path.join(T, "pas-de-lecteur")).drive === false, "pas de lecteur : rien à lire");

(async () => {
  let disc = { drive: true, present: false };
  const S = createServer({ port: PORT, webDir: path.join(__dirname, "..", "..", "web"), dataDir: path.join(T, "data"), mediaRoots: [M], mpv: fake, retroarch: "/nonexistent", version: "test",
    usbBases: [USB], usbPoll: 150, discProbe: () => disc, discPoll: 150, discCheckMs: 600, lookup: (h, cb) => cb(null, "1.2.3.4") });
  await S.start(); await wait(300);
  await req("/api/pair/request", { body: { name: "Téléphone" } });
  const tok = (await req("/api/pair", { body: { code: S.pairing.code, name: "Téléphone" } })).json.token;
  check(!!tok, "appairage");
  const ev = [];
  const sse = http.get({ host: lan.address, port: PORT, path: `/api/stream?tok=${tok}` }, (res) => { res.on("data", (d) => String(d).split("\n").forEach((l) => { if (l.startsWith("data: ")) try { ev.push(JSON.parse(l.slice(6))); } catch (_) {} })); });
  await wait(200);

  // --- disque USB ---
  check((await req("/api/usb")).status === 401, "liste des disques refusée sans appairage");
  put("Films/Vacances (2019).mp4", Buffer.alloc(1500, 2), path.join(USB, "CLE_USB"));
  check(await until(() => ev.some((e) => e.type === "usb" && e.name === "CLE_USB" && !e.gone)), "disque branché → évènement « usb »");
  const L = (await req("/api/usb", { tok })).json;
  check(L.disks.length === 1 && L.disks[0].inLib === false, "le disque est listé, pas encore dans la bibliothèque");
  check((await req("/api/usb/scan", { body: { path: "/etc" }, tok })).json.ok === false, "on ne scanne que les disques repérés");
  check((await req("/api/usb/scan", { body: { path: path.join(USB, "CLE_USB") }, tok })).json.ok, "scanner le disque");
  check(await until(() => S.lib.items.some((x) => x.title.startsWith("Vacances"))), "les films du disque arrivent dans la bibliothèque");
  check(JSON.parse(fs.readFileSync(path.join(T, "data", "serveur.json"), "utf8")).usbRoots.length === 1, "le disque est retenu pour les prochains démarrages");
  fs.rmSync(path.join(USB, "CLE_USB"), { recursive: true, force: true });
  check(await until(() => ev.some((e) => e.type === "usb" && e.gone)), "disque débranché → évènement");

  // --- CD / DVD ---
  check((await req("/api/disque/play", { body: {}, tok })).json.ok === false, "lecteur vide : message clair");
  disc = { drive: true, present: true, kind: "cd", label: "CD audio", tracks: 10 };
  check(await until(() => ev.some((e) => e.type === "disque" && e.present && e.kind === "cd")), "CD inséré → évènement « disque »");
  check((await req("/api/disque", { tok })).json.kind === "cd", "état du lecteur");
  check((await req("/api/disque/play", { body: {}, tok })).json.ok, "lecture du CD sur la TV");
  await wait(300);
  let a = JSON.parse(fs.readFileSync(path.join(T, "mpv.args"), "utf8"));
  check(a.includes("cdda://") && a.includes("--cdrom-device=/dev/sr0"), "mpv lit le CD (cdda://)");
  disc = { drive: true, present: true, kind: "dvd", label: "FILM" };
  fs.writeFileSync(path.join(T, "protege"), "1");
  await until(() => ev.some((e) => e.type === "disque" && e.kind === "dvd"));
  check((await req("/api/disque/play", { body: {}, tok })).json.ok, "lecture du DVD demandée");
  await wait(300);
  a = JSON.parse(fs.readFileSync(path.join(T, "mpv.args"), "utf8"));
  check(a.includes("dvd://") && a.includes("--dvd-device=/dev/sr0"), "mpv lit le DVD (dvd://)");
  check(await until(() => ev.some((e) => e.type === "alert" && /protégé/.test(e.msg || ""))), "DVD protégé : message clair");
  disc = { drive: true, present: true, kind: "data", label: "PHOTOS" };
  await until(() => ev.some((e) => e.type === "disque" && e.kind === "data"));
  check(/fichiers/.test((await req("/api/disque/play", { body: {}, tok })).json.err || ""), "disque de données : pas de lecture, explication");

  // --- invités ---
  S.cfg.invites = [{ code: "AB12", until: Date.now() + 60000 }];
  const g = (await req("/api/pair", { body: { invite: "AB12", name: "Ami" } })).json;
  check((await req("/api/disque/play", { body: {}, tok: g.token })).status === 403, "un invité ne lance pas le disque sur la TV");

  // --- Tout va bien ? ---
  const C1 = (await req("/api/sante", { tok })).json.checks;
  const by = (id) => C1.find((x) => x.id === id);
  check(by("dossiers") && by("dossiers").state === "ok", "dossiers : vert (des médias trouvés)");
  check(by("lecteur") && by("lecteur").state !== "bad", "lecteur vidéo trouvé");
  check(by("espace") && /libres/.test(by("espace").detail), "espace disque mesuré");
  check(!by("internet"), "internet : pas vérifié sans le demander");
  check(C1.every((x) => ["ok", "warn", "bad"].includes(x.state) && x.label && x.detail), "chaque ligne a un état, un nom, une explication");
  const C2 = (await req("/api/sante?internet=1", { tok })).json.checks;
  check(C2.some((x) => x.id === "internet" && x.state === "ok"), "internet vérifié quand on le demande");

  sse.destroy();
  await S.stop();
  fs.rmSync(T, { recursive: true, force: true });
  console.log(`${ok} vérifications réussies, ${ko} échec${ko > 1 ? "s" : ""}`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
