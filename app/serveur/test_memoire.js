// Test de la bibliothèque gardée en mémoire : node app/serveur/test_memoire.js
// Fausse bibliothèque (films, série, jeux sur image disque, .nfo) avec une seconde racine « disque externe », sans internet :
//   gardée sur le disque puis relue après un redémarrage (mêmes identifiants, jaquettes servies), réponse immédiate pendant
//   une analyse lente, seconde analyse qui reprend ce qui n'a pas changé, disque débranché (racine absente, disque démonté,
//   dossier illisible) → titres gardés hors ligne, puis de retour ; fichier supprimé sur un disque présent → retiré.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant cet essai
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const { createServer } = require("./serveur");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-memoire-"));
const M = path.join(T, "maison"), X = path.join(T, "externe"), D = path.join(T, "donnees");
const put = (base, rel, d = "x") => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, d); return f; };
const JPG = (n) => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF]), Buffer.alloc(300, n)]);
put(M, "Films/Le Grand Bleu (1988)/Le Grand Bleu (1988).mkv", Buffer.alloc(3000));
put(M, "Films/Le Grand Bleu (1988)/poster.jpg", JPG(1));
put(M, "Films/Le Grand Bleu (1988)/Le Grand Bleu (1988)-trailer.mp4");
put(M, "Films/Le Grand Bleu (1988)/movie.nfo", "<movie><certification>-12</certification></movie>");
put(M, "Films/Horizon Rouge (2021)/Horizon Rouge (2021).mkv", Buffer.alloc(900));
put(M, "Séries/Les Veilleurs/folder.jpg", JPG(2));
put(M, "Séries/Les Veilleurs/Saison 1/Les.Veilleurs.S01E01.mkv");
put(M, "Séries/Les Veilleurs/Saison 1/Les.Veilleurs.S01E02.mkv"); put(M, "Séries/Les Veilleurs/Saison 1/Les.Veilleurs.S01E02.nfo", "<episodedetails><title>La Tempête</title></episodedetails>");
// une image de disque de PlayStation : sa console se lit dans son en-tête (lecture coûteuse sur un disque externe)
const iso = Buffer.alloc(0x8000 + 0x30); iso[0x8001] = 0x43; Buffer.from("CD001").copy(iso, 0x8001); Buffer.from("PLAYSTATION").copy(iso, 0x8008);
put(M, "Jeux/Disques/Course Folle (Europe).iso", iso);
// le « disque externe » : une seconde racine
put(X, "Films/Le Disque Externe (2001)/Le Disque Externe (2001).mkv", Buffer.alloc(1500));
put(X, "Films/Le Disque Externe (2001)/poster.jpg", JPG(3));
put(X, "Films/Autre Rive (1999)/Autre Rive (1999).mkv", Buffer.alloc(700));
put(X, "Séries/Grand Large/Saison 1/Grand.Large.S01E01.mkv");

let ok = 0, ko = 0;
const check = (c, w) => { if (c) ok++; else { ko++; console.log("ÉCHEC :", w); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await wait(40); } return false; };
let PORT = 0;
const get = (p) => new Promise((res, rej) => { const t0 = Date.now(); const r = http.request({ host: "127.0.0.1", port: PORT, path: p }, (x) => { const ch = []; x.on("data", (d) => ch.push(d)); x.on("end", () => { const b = Buffer.concat(ch); let j = null; try { j = JSON.parse(b); } catch (_) {} res({ status: x.statusCode, json: j, buf: b, ms: Date.now() - t0 }); }); }); r.on("error", rej); r.end(); });
let mounts = [];   // faux tableau des disques montés (Linux : /proc/self/mounts)
const start = async (o = {}) => {
  PORT = 21000 + Math.floor(Math.random() * 900);
  const S = createServer({ port: PORT, dataDir: D, mediaRoots: [M, X], version: "test", mounts: () => mounts, rootsPoll: 150, ...o });
  await S.start(); return S;
};
const lib = async () => (await get("/api/library")).json;
const by = (L, t) => L.items.find((x) => x.title === t);

(async () => {
  // ---------- 1. première analyse, bibliothèque gardée sur le disque ----------
  let S = await start();
  let L = await lib();
  check(L && L.items.length === 7, "première analyse : 7 titres (" + (L && L.items.map((x) => x.title).join(", ")) + ")");
  check(L && L.date > 0 && L.stored === false, "la réponse donne la date de l'analyse");
  await S.memoire.flush();
  const file = path.join(D, "bibliotheque.json");
  check(fs.existsSync(file), "bibliothèque écrite dans le dossier du serveur");
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  check(saved.v === 1 && saved.items.length === 7 && saved.items.every((x) => x.root && x.pub && x.id), "fichier lisible : chemins, racines, fiches publiques");
  check(!fs.existsSync(file + ".tmp"), "écriture atomique (pas de .tmp qui traîne)");
  const gb = by(L, "Le Grand Bleu"), ve = by(L, "Les Veilleurs"), cf = by(L, "Course Folle"), ext = by(L, "Le Disque Externe");
  check(gb && gb.cert === "-12" && gb.trailer && gb.cover, "film : jaquette, bande-annonce, âge conseillé (.nfo)");
  check(ve && ve.episodes.length === 2 && ve.episodes[1].name === "La Tempête", "série : épisodes et titre lu dans le .nfo");
  check(cf && cf.sys === "psx", "jeu : console lue dans l'en-tête de l'image disque");
  const first = JSON.stringify(L.items.map((x) => ({ ...x, progress: undefined })));
  await S.stop();
  fs.writeFileSync(path.join(D, "progression.json"), JSON.stringify({ [gb.id]: { pos: 600, dur: 6000, t: 1 } }));   // un film commencé sur la TV

  // ---------- 2. redémarrage : la bibliothèque gardée répond tout de suite, même pendant une analyse lente ----------
  const fsp = fs.promises, readdir0 = fsp.readdir;
  let slow = true;   // disque externe très lent : chaque dossier met 120 ms à répondre
  fsp.readdir = async function (d, ...a) { if (slow && String(d).startsWith(X)) await wait(120); return readdir0.call(this, d, ...a); };
  const t0 = Date.now();
  S = await start();
  const r = await get("/api/library");
  check(r.json && r.json.items.length === 7 && r.json.stored === true && r.json.scanning === true, "redémarrage : la bibliothèque gardée répond pendant l'analyse (" + (r.json && r.json.items.length) + " titres, analyse en cours : " + (r.json && r.json.scanning) + ")");
  check(Date.now() - t0 < 400 && r.ms < 150, `réponse immédiate (${r.ms} ms ; serveur prêt et réponse en ${Date.now() - t0} ms)`);
  const ids0 = JSON.parse(first).map((x) => x.id).sort().join(), ids1 = r.json.items.map((x) => x.id).sort().join();
  check(ids0 === ids1, "mêmes identifiants d'un lancement à l'autre");
  check(r.json.items.find((x) => x.id === gb.id).progress.pos === 600, "la progression reste attachée au même titre");
  const cov = await get(gb.cover);
  check(cov.status === 200 && cov.buf.equals(JPG(1)), "jaquette gardée servie tout de suite");
  check((await get(by(r.json, "Les Veilleurs").cover)).status === 200, "jaquette de la série servie");
  check(await until(() => !S.scan.running && S.scan.t > t0, 8000), "l'analyse en arrière-plan se termine");
  slow = false;
  // ---------- 3. seconde analyse : ce qui n'a pas changé n'est pas relu ----------
  check(S.scan.disque && S.scan.disque.souvenirs >= 4 && S.scan.disque.relus === 0, "analyse au redémarrage : souvenirs repris, rien relu (" + JSON.stringify(S.scan.disque) + ")");
  L = await lib();
  check(JSON.stringify(L.items.map((x) => ({ ...x, progress: undefined }))) === first, "même résultat qu'une analyse complète");
  put(M, "Séries/Les Veilleurs/Saison 1/Les.Veilleurs.S01E02.nfo", "<episodedetails><title>La Grande Tempête</title></episodedetails>");
  await S.rescan();
  check(S.scan.disque.relus === 1, "un seul .nfo changé : un seul fichier relu (" + JSON.stringify(S.scan.disque) + ")");
  check(by(await lib(), "Les Veilleurs").episodes[1].name === "La Grande Tempête", "et son nouveau titre est pris");
  await S.rescan({ full: true });
  check(S.scan.full && S.scan.disque.souvenirs === 0 && S.scan.disque.relus >= 4, "analyse complète à la demande : tout est relu");

  // ---------- 4. disque externe débranché : ses titres restent, hors ligne ----------
  const ev = [];
  const sse = http.get({ host: "127.0.0.1", port: PORT, path: "/api/stream" }, (res) => { res.on("data", (d) => String(d).split("\n").forEach((l) => { if (l.startsWith("data: ")) try { ev.push(JSON.parse(l.slice(6))); } catch (_) {} })); });
  await wait(150);
  fs.renameSync(X, X + "-debranche");
  check(await until(async () => { const l = await lib(); return l.items.length === 7 && by(l, "Le Disque Externe").unplugged === true; }, 4000), "racine absente : titres gardés, marqués hors ligne (coup d'œil régulier aux dossiers)");
  L = await lib();
  const off = L.items.filter((x) => x.unplugged);
  check(off.length === 3 && off.every((x) => x.disk === "externe") && !by(L, "Le Grand Bleu").unplugged, "les 3 titres du disque externe hors ligne (nom du disque : « externe »), les autres non");
  check(by(L, "Le Disque Externe").id === ext.id && by(L, "Grand Large").episodes.length === 1, "même identifiant, épisodes gardés");
  check(ev.some((e) => e.type === "scan" && /Disque « externe » débranché/.test(e.msg || "")), "la page est prévenue : « Disque « externe » débranché »");
  check((await get(by(L, "Le Disque Externe").cover)).status === 404, "jaquette d'un disque absent : rien de servi (pas d'erreur)");
  // les génériques : une série d'un disque débranché n'est ni analysée ni marquée « sans générique » (pour toujours)
  const glEp = S.lib.items.find((x) => x.title === "Grand Large").episodes[0].id;
  S.lecture.warm();
  check(!S.lecture._queue.list.some((j) => j.id === glEp) && !(S.lecture._queue.cur && S.lecture._queue.cur.id === glEp), "génériques : la série d'un disque débranché n'est pas mise en file");
  await S.lecture.lookup(glEp);   // (un épisode demandé quand même : son fichier ne se lit pas)
  await until(() => !S.lecture._queue.cur && !S.lecture._queue.list.length, 8000);
  const e0 = S.lecture._db.eps[glEp] || {};
  check(!e0.none && !e0.t, "génériques : fichier d'un disque débranché → rien de noté (" + JSON.stringify(e0) + "), on réessaiera à son retour");
  // lancer un titre débranché : refusé avec le nom du disque à brancher (TV, télécommande, jeu, préparation)
  const pj = (route, o) => new Promise((res, rej) => { const d = JSON.stringify(o); const r = http.request({ host: "127.0.0.1", port: PORT, path: route, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } }, (x) => { const ch = []; x.on("data", (c) => ch.push(c)); x.on("end", () => { try { res(JSON.parse(Buffer.concat(ch))); } catch (e) { res(null); } }); }); r.on("error", rej); r.end(d); });
  const pl = await pj("/api/play", { id: ext.id }), pe = await pj("/api/play", { id: glEp }), pp = await pj("/api/prepare", { id: ext.id, profil: "salon" });
  check(pl && pl.ok === false && pl.unplugged && /Branche le disque « externe » pour regarder ce titre/.test(pl.err), "/api/play d'un titre débranché : refusé, « Branche le disque « externe »… » (" + (pl && pl.err) + ")");
  check(pe && pe.ok === false && pe.unplugged, "/api/play d'un épisode d'une série débranchée : refusé aussi");
  check(pp && pp.ok === false && pp.unplugged && /Branche le disque/.test(pp.err), "« Préparer à l'avance » d'un titre débranché : refusé avec le même message");
  await S.memoire.flush();
  await S.stop();
  // redémarrage disque toujours absent : hors ligne dès la relecture
  S = await start();
  L = (await get("/api/library")).json;
  check(L.stored && by(L, "Le Disque Externe").unplugged === true && L.items.length === 7, "redémarrage sans le disque : titres hors ligne dès la première réponse");
  await until(() => !S.scan.running && S.scan.t > 0, 4000);
  L = await lib();
  check(L.items.length === 7 && by(L, "Autre Rive").unplugged, "après l'analyse : toujours là, hors ligne");
  // le disque revient
  fs.renameSync(X + "-debranche", X);
  check(await until(async () => { const l = await lib(); return !l.items.some((x) => x.unplugged); }, 4000), "disque rebranché : de nouveau en ligne");
  L = await lib();
  check(L.items.length === 7 && by(L, "Le Disque Externe").id === ext.id && (await get(by(L, "Le Disque Externe").cover)).status === 200, "mêmes identifiants, jaquette de nouveau servie");

  // ---------- 5. disque démonté (son dossier vide reste) ≠ fichier supprimé ----------
  await S.stop();
  mounts = ["/", fs.realpathSync(X)];   // le dossier externe est le point de montage d'un disque
  S = await start(); await until(() => !S.scan.running && S.scan.t > 0, 4000);
  fs.renameSync(path.join(X, "Films"), path.join(T, "Films-du-disque")); fs.renameSync(path.join(X, "Séries"), path.join(T, "Series-du-disque"));
  mounts = ["/"];   // démonté : le dossier est là, mais vide
  await S.rescan();
  L = await lib();
  check(L.items.length === 7 && by(L, "Le Disque Externe").unplugged && by(L, "Grand Large").unplugged, "disque démonté (dossier vide resté là) : titres gardés, hors ligne");
  fs.renameSync(path.join(T, "Films-du-disque"), path.join(X, "Films")); fs.renameSync(path.join(T, "Series-du-disque"), path.join(X, "Séries"));
  mounts = ["/", fs.realpathSync(X)];
  await S.rescan();
  check(!(await lib()).items.some((x) => x.unplugged), "disque remonté : en ligne");
  // fichier vraiment supprimé, disque présent
  fs.rmSync(path.join(X, "Films", "Autre Rive (1999)"), { recursive: true });
  await S.rescan();
  L = await lib();
  check(L.items.length === 6 && !by(L, "Autre Rive"), "fichier supprimé sur un disque présent : retiré de la bibliothèque");
  // dossier illisible (erreur du disque) : gardé hors ligne, pas supprimé
  const bad = path.join(M, "Films", "Horizon Rouge (2021)");
  fsp.readdir = async function (d, ...a) { if (String(d) === bad) { const e = new Error("EIO"); e.code = "EIO"; throw e; } return readdir0.call(this, d, ...a); };
  await S.rescan();
  L = await lib();
  check(by(L, "Horizon Rouge") && by(L, "Horizon Rouge").unplugged === true && by(L, "Horizon Rouge").disk === "maison", "dossier illisible : titre gardé, hors ligne");
  fsp.readdir = readdir0;
  await S.rescan();
  check(by(await lib(), "Horizon Rouge").unplugged !== true, "dossier de nouveau lisible : en ligne");
  // le dossier d'une série (son propre dossier) illisible : gardée hors ligne, pas retirée
  const badS = path.join(M, "Séries", "Les Veilleurs");
  fsp.readdir = async function (d, ...a) { if (String(d) === badS) { const e = new Error("EIO"); e.code = "EIO"; throw e; } return readdir0.call(this, d, ...a); };
  await S.rescan();
  L = await lib();
  check(by(L, "Les Veilleurs") && by(L, "Les Veilleurs").unplugged === true && by(L, "Les Veilleurs").episodes.length === 2, "dossier d'une série illisible : série gardée, hors ligne, avec ses épisodes");
  fsp.readdir = readdir0;
  await S.rescan();
  check(by(await lib(), "Les Veilleurs").unplugged !== true, "dossier de la série de nouveau lisible : en ligne");

  // ---------- 6. demandes pendant une analyse : rien n'est perdu ----------
  slow = true; fsp.readdir = async function (d, ...a) { if (slow && String(d).startsWith(X)) await wait(60); return readdir0.call(this, d, ...a); };
  const a = S.rescan(); put(X, "Films/Nouveau Venu (2024)/Nouveau Venu (2024).mkv", Buffer.alloc(800)); const b = S.rescan();
  await Promise.all([a, b]); slow = false; fsp.readdir = readdir0;
  check(!!by(await lib(), "Nouveau Venu"), "une analyse demandée pendant une autre est faite juste après (fichier ajouté pris)");

  // ---------- 7. disque USB débranché au démarrage : gardé dans la liste ----------
  sse.destroy(); await S.memoire.flush(); await S.stop();
  const usb = path.join(T, "usb-absent");
  const cfg = JSON.parse(fs.readFileSync(path.join(D, "serveur.json"), "utf8")); cfg.usbRoots = [usb]; fs.writeFileSync(path.join(D, "serveur.json"), JSON.stringify(cfg));
  S = await start({ usbBases: [path.join(T, "pas-de-disques")] });
  check(S.roots.includes(usb), "disque USB absent au démarrage : gardé dans les dossiers de la bibliothèque (ses titres restent, hors ligne)");
  await until(() => !S.scan.running && S.scan.t > 0, 4000);
  await S.memoire.flush(); await S.stop();

  // ---------- 8. fichier gardé abîmé : analyse complète, rien de cassé ----------
  fs.writeFileSync(file, "{ pas du json");
  S = await start();
  L = (await get("/api/library")).json;
  check(L.items.length === 7 && !L.stored, "bibliothèque gardée abîmée : analyse complète, comme un premier lancement");
  await S.memoire.flush(); await S.stop(); await S.memoire.flush();
  check(JSON.parse(fs.readFileSync(file, "utf8")).items.length === 7, "et elle est réécrite, lisible");

  // ---------- 9. partage réseau figé : une seule demande à la fois par dossier (les fils de Node restent libres) ----------
  const { _dirState } = require("./memoire"), stat0 = fsp.stat, fige = path.join(T, "partage-fige");
  let appels = 0, libere = null;
  fsp.stat = function (d, ...a) { if (String(d) === fige) { appels++; return new Promise((r) => { libere = () => r({ isDirectory: () => true }); }); } return stat0.call(this, d, ...a); };
  const rep9 = []; for (let i = 0; i < 6; i++) rep9.push(await _dirState(fige, 30));
  check(appels === 1 && rep9.every((x) => x === "?"), `partage figé : 6 coups d'œil, une seule demande en cours (${appels}), réponse « ? »`);
  const pend9 = _dirState(fige, 500); libere();
  check((await pend9) === "oui" && appels === 1, "le partage répond : la demande en cours donne la réponse (pas de nouvelle demande)");
  check((await _dirState(fige + "-absent", 200)) === "non", "dossier absent : « non » (réponse certaine)");
  fsp.stat = stat0;

  // ---------- 10. au démarrage, un disque lent à répondre n'est pas pris pour débranché ----------
  fsp.stat = function (d, ...a) { if (String(d) === X) return new Promise((r, j) => setTimeout(() => stat0.call(fs.promises, d, ...a).then(r, j), 2500)); return stat0.call(this, d, ...a); };
  const ev10 = [];
  const t10 = Date.now(); S = await start({ emit: undefined }); const prêt = Date.now() - t10;
  const sse10 = http.get({ host: "127.0.0.1", port: PORT, path: "/api/stream" }, (res) => { res.on("data", (d) => String(d).split("\n").forEach((l) => { if (l.startsWith("data: ")) try { ev10.push(JSON.parse(l.slice(6))); } catch (_) {} })); });
  L = (await get("/api/library")).json;
  check(prêt < 1200 && L.stored && !L.items.some((x) => x.unplugged), `disque lent au démarrage (2,5 s) : rien n'est marqué débranché, serveur prêt en ${prêt} ms`);
  await until(() => !S.scan.running && S.scan.t > t10, 8000);
  await wait(200);
  check(!ev10.some((e) => /de retour/.test(e.msg || "")) && !(await lib()).items.some((x) => x.unplugged), "après l'analyse : aucun faux « disque de retour »");
  fsp.stat = stat0; sse10.destroy();
  await S.memoire.flush(); await S.stop();

  // ---------- 11. un partage figé (il ne répond plus, sans erreur) ne bloque pas toute l'analyse ----------
  const { scanLibrary } = require("./bibliotheque"), rd0 = fsp.readdir;
  fs.mkdirSync(fige, { recursive: true });
  fsp.readdir = function (d, ...a) { if (String(d) === fige) return new Promise(() => {}); return rd0.call(this, d, ...a); };
  const t11 = Date.now(), lib11 = await Promise.race([scanLibrary([fige, M], () => {}, { listMs: 300 }), wait(5000).then(() => null)]);
  fsp.readdir = rd0;
  check(lib11 && lib11.items.length >= 3 && lib11.items.every((x) => x.root === M) && Date.now() - t11 < 4000, `partage figé + disque normal : l'analyse finit (${lib11 ? lib11.items.length : "jamais"} titres du disque normal)`);
  check(lib11 && lib11.vue.seen(fige) === false && lib11.vue.bad.has(fige), "le partage figé compte comme illisible (ses titres resteront, hors ligne)");

  // ---------- 12. bonus et morceaux d'un film d'un disque débranché : « branche le disque », pas une erreur de lecture ----------
  const lib0 = S.lib;
  S.lib = { items: [], byId: new Map([["f1", { id: "f1", kind: "film", pub: { unplugged: true, disk: "Films_2" } }]]) };
  const b12 = S.debranche({ id: "f1x", kind: "extra", owner: "f1", pub: {} }), p12 = S.debranche({ id: "f1p", kind: "film", partOf: "f1", pub: {} });
  check(b12 && b12.unplugged && /Films_2/.test(b12.err) && p12 && p12.unplugged, "bonus et second morceau d'un film débranché : « Branche le disque « Films_2 » »");
  S.lib = lib0;
  fs.rmSync(T, { recursive: true, force: true });
  console.log(`Bibliothèque gardée : ${ok} OK, ${ko} échec(s)`);
  setTimeout(() => process.exit(ko ? 1 : 0), 100);
})().catch((e) => { console.log("ÉCHEC :", e.stack || e); process.exit(1); });
