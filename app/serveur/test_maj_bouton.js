// Test du bouton « Nouvelle version détectée » (mises à jour depuis l'appli) : node app/serveur/test_maj_bouton.js
// Linux, sans internet (faux GitHub) :
//  - le dépôt où chercher est lu dans build.json (champ « depot ») ; un nom mal formé retombe sur grecdel/Rembobine ;
//  - dépôt privé (GitHub répond 404) → message clair, pas d'erreur répétée ; une vérification discrète récente suffit ;
//  - téléchargements seulement depuis GitHub (adresse ou redirection ailleurs : refusé) ; fichier abîmé refusé ;
//  - progression (téléchargement → vérification → installation → redémarrage) par évènements « maj » ;
//  - PC Linux, appli simplement décompressée → installée dans ~/.local/share/rembobine (comme installer.sh),
//    raccourci du menu des applications, relancée depuis là ; si elle ne démarre pas : retour à l'appli décompressée ;
//  - Windows : nouvelle version décompressée et vérifiée à côté, script PowerShell produit (contenu vérifié),
//    signature vérifiée avant, résultat du script relu au démarrage ;
//  - Android : choix de Rembobine.apk et de son empreinte ; l'appli Android (Java) et le manifeste suivent le même contrat ;
//  - un invité (séance à distance) ne voit ni ne lance aucune mise à jour (routes et évènements).
"use strict";
process.env.REMBOBINE_FICHES = "0";
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http"), crypto = require("crypto");
const { spawnSync, spawn } = require("child_process");
const { createServer } = require("./serveur");
const { createMaj, archiveName, scriptWindows, readBuild, FERME, REPO } = require("./maj");
const SIG = require("./maj-signature");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-majb-"));
const R = path.join(__dirname, "..", "..");
let ok = 0, ko = 0;
const check = (c, w) => { if (c) ok++; else { ko++; console.log("ÉCHEC :", w); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = (f, data, mode) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); if (mode) fs.chmodSync(f, mode); };
const until = async (f, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (await f()) return true; await wait(200); } return false; };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

// ---------- une « version » de Rembobine : son lanceur démarre un faux serveur qui répond /api/info avec son numéro ----------
const FAKEAPP = path.join(T, "fakeapp.js");
mk(FAKEAPP, `const http=require("http");const [label,port,mode]=process.argv.slice(2);
if(mode==="casse")process.exit(1);
http.createServer((q,r)=>{r.writeHead(200,{"Content-Type":"application/json"});r.end(JSON.stringify({api:1,build:label}))}).listen(Number(port),"127.0.0.1");
setTimeout(()=>process.exit(0),20000);`);
function linuxVersion(dir, label, port, mode = "") {
  mk(path.join(dir, "rembobine-bin"), "#!/bin/sh\nexit 0\n", 0o755);
  mk(path.join(dir, "rembobine"), `#!/bin/sh\nexec "${process.execPath}" "${FAKEAPP}" "${label}" ${port} ${mode}\n`, 0o755);
  mk(path.join(dir, "rembobine.png"), "PNG");
  mk(path.join(dir, "resources", "app", "main.js"), "// faux");
  mk(path.join(dir, "resources", "app", "build.json"), JSON.stringify({ version: "1.0.0", build: Number(label.split("+")[1]), label, date: "2026-11-14", depot: REPO }));
}
function linuxArchive(label, port, mode) {
  const src = path.join(T, "src-" + label, "Rembobine-Linux-x64"); linuxVersion(src, label, port, mode);
  const out = path.join(T, `arch-${label}.tar.gz`); spawnSync("tar", ["czf", out, "-C", path.dirname(src), "Rembobine-Linux-x64"]);
  return fs.readFileSync(out);
}
function winVersion(dir, label) {
  mk(path.join(dir, "Rembobine.exe"), "MZ faux");
  mk(path.join(dir, "resources", "app", "main.js"), "// faux");
  mk(path.join(dir, "resources", "app", "build.json"), JSON.stringify({ version: "1.0.0", build: Number(label.split("+")[1]), label }));
}
async function winZip(label, opts = {}) {
  const par = path.join(T, "wsrc-" + label + (opts.tag || "")), src = path.join(par, "Rembobine-Windows"); winVersion(src, label);
  if (opts.signer) await SIG.signDir(src, opts.signer);
  if (opts.modifier) fs.appendFileSync(path.join(src, "resources", "app", "main.js"), "// modifié après la signature");
  const out = path.join(T, `w-${label}${opts.tag || ""}.zip`); spawnSync("zip", ["-qr", out, "Rembobine-Windows"], { cwd: par });
  return fs.readFileSync(out);
}

// ---------- faux GitHub : dépôt réglable, dépôt privé, redirections, fichier abîmé ----------
const GH = { depot: REPO, prive: false, abime: false, trop: false, sansBj: false, files: {}, body: "Nouveautés de test", hits: [], build: 0 };
const gh = http.createServer((q, r) => {
  const p = new URL(q.url, "http://x").pathname, N = `http://127.0.0.1:${gh.address().port}`; GH.hits.push(p);
  const json = (o, code = 200) => { r.writeHead(code, { "Content-Type": "application/json" }); r.end(JSON.stringify(o)); };
  if (GH.prive && p.startsWith("/gh/")) return json({ message: "Not Found" }, 404);
  if (p === `/gh/repos/${GH.depot}/releases/latest` || p === `/gh/repos/${GH.depot}/releases/tags/v1.0.0`)
    return json({ tag_name: "v1.0.0", body: GH.body, assets: [...(GH.sansListe ? [] : [{ name: "build.json", size: 100, browser_download_url: N + "/dl/build.json" }]),
      ...Object.keys(GH.files).map((n) => ({ name: n, size: GH.files[n].length, browser_download_url: N + "/redir/" + n }))] });
  if (p.startsWith("/gh/")) return json({ message: "Not Found" }, 404);
  if (p === "/dl/build.json" && GH.sansBj) return json({ message: "Not Found" }, 404);
  if (p === "/dl/build.json") return json({ version: "1.0.0", build: GH.build, label: `1.0.0+${GH.build}`, date: "2026-11-14T08:00:00Z", depot: GH.depot,
    files: Object.keys(GH.files).map((n) => ({ name: n, size: GH.files[n].length, sha256: sha(GH.files[n]) })) });
  if (p.startsWith("/redir/")) { r.writeHead(302, { Location: "/dl/" + p.slice(7) }); return r.end(); }   // (comme github.com → serveur de fichiers)
  const n = p.slice(4);
  if (p.startsWith("/dl/") && GH.files[n]) {
    let b = GH.files[n]; if (GH.abime) { b = Buffer.from(b); b[b.length >> 1] ^= 0xff; } if (GH.trop) b = Buffer.concat([b, Buffer.alloc(5000)]);
    r.writeHead(200, { "Content-Type": "application/octet-stream" }); return r.end(b);
  }
  r.writeHead(404); r.end();
});
const publish = (build, files) => { GH.build = build; GH.files = files; GH.abime = false; GH.trop = false; GH.prive = false; GH.sansBj = false; };
const dummy = () => spawn(process.execPath, ["-e", "setTimeout(()=>{},300)"]).pid;   // « l'ancienne appli » qui se ferme
const kill = () => { spawnSync("pkill", ["-f", FAKEAPP]); };

(async () => {
  await new Promise((r) => gh.listen(0, "127.0.0.1", r));
  const API = `http://127.0.0.1:${gh.address().port}/gh`;
  const PORT = 19100 + Math.floor(Math.random() * 800);
  const base = (extra) => ({ data: fs.mkdtempSync(path.join(T, "data-")), cfg: () => ({}), api: API, quitDelay: 0, gardeTimeout: 6000, node: process.execPath, port: PORT, platform: "linux", arch: "x64", mountsFile: "/nonexistent", ...extra });

  // ================= 1. quel fichier pour quel appareil =================
  check(archiveName("linux", "x64") === "Rembobine-Linux-PC.tar.gz" && archiveName("linux", "arm64") === "Rembobine-RaspberryPi.tar.gz" && archiveName("win32", "x64") === "Rembobine-Windows.zip" && archiveName("android") === "Rembobine.apk", "un fichier par appareil (PC, Raspberry, Windows, Android)");

  // ================= 2. le dépôt est lu dans build.json =================
  mk(path.join(T, "bj1.json"), JSON.stringify({ version: "1.0.0", build: 3, label: "1.0.0+3", depot: "fan-club/Rembobine-versions" }));
  mk(path.join(T, "bj2.json"), JSON.stringify({ version: "1.0.0", build: 3, label: "1.0.0+3", depot: "../../etc/passwd" }));
  mk(path.join(T, "bj3.json"), JSON.stringify({ version: "1.0.0", build: 3, label: "1.0.0+3" }));
  check(readBuild(path.join(T, "bj1.json")).depot === "fan-club/Rembobine-versions" && readBuild(path.join(T, "bj2.json")).depot === REPO && readBuild(path.join(T, "bj3.json")).depot === REPO, "build.json : champ « depot » lu ; absent ou mal formé → grecdel/Rembobine");
  GH.depot = "fan-club/Rembobine-versions"; publish(4, { "Rembobine-Linux-PC.tar.gz": Buffer.from("x") }); GH.hits = [];
  let M = createMaj(base({ build: readBuild(path.join(T, "bj1.json")) }));
  let c = await M.check();
  check(c.available && c.latest === "1.0.0+4" && c.depot === "fan-club/Rembobine-versions" && M.status().depot === "fan-club/Rembobine-versions", "la nouvelle version est cherchée dans le dépôt écrit par la fabrication");
  check(GH.hits.length > 0 && GH.hits.every((h) => !h.includes("grecdel/Rembobine")), "aucune requête vers un autre dépôt");
  check(c.notes === "Nouveautés de test" && c.date.startsWith("2026-11-14") && c.asset.sha256.length === 64, "nouveautés, date et empreinte transmises à la page");
  M.stop(); GH.depot = REPO;

  // ================= 3. dépôt privé (GitHub répond 404 sans identifiant) =================
  publish(4, { "Rembobine-Linux-PC.tar.gz": Buffer.from("x") }); GH.prive = true;
  const ev3 = []; M = createMaj(base({ build: { label: "1.0.0+3", build: 3 }, emit: (e) => ev3.push(e) }));
  c = await M.check();
  check(c.closed === true && c.available === false && c.err === FERME && /pas encore ouvertes/.test(c.err) && /rendre publiques/.test(c.err), "dépôt privé : message clair (« il faut rendre publiques les versions »)");
  check(ev3.length === 0, "dépôt privé : la vérification n'envoie aucune bulle d'erreur");
  GH.hits = []; await M.check({ auto: true });
  check(GH.hits.length > 0, "dépôt fermé : la vérification discrète suivante redemande (pour voir s'il a été ouvert)");
  const a3 = await M.apply();
  check(a3.ok === false && a3.err === FERME, "« Mettre à jour » sur un dépôt fermé : le même message, rien d'autre");
  GH.prive = false; c = await M.check();
  check(c.available && !c.closed, "dépôt rendu public : la nouvelle version apparaît");
  GH.hits = []; await M.check({ auto: true }); await M.check({ auto: true });
  check(GH.hits.length === 0, "vérification discrète : une réponse récente suffit (pas de requête en plus)");
  // build.json momentanément absent (la version est en train d'être remplacée) : pas « fermé », la pastille reste
  GH.sansBj = true; c = await M.check();
  check(!c.closed && c.available && /en train d'être remplacée/.test(c.errNet || ""), "build.json momentanément absent : on réessaiera, la nouvelle version reste annoncée");
  GH.sansBj = false;
  const assets0 = GH.files; GH.sansListe = true; c = await M.check();
  check(!c.closed && c.available && /en train d'être remplacée/.test(c.errNet || "") && c.latest === "1.0.0+4", "build.json absent de la liste (version en train d'être recopiée) : passager, la pastille reste");
  GH.sansListe = false; GH.files = assets0;
  // « Mettre à jour maintenant » pendant une vérification discrète : la mise à jour attend la fin, au lieu de « Patiente »
  const v3 = M.check({}), s3 = M.start();
  check(s3.ok && s3.started, "« Mettre à jour » pendant une vérification : accepté (la mise à jour part juste après)");
  await v3; await until(() => !M.status().busy, 20000);
  check(!/vérification en cours/.test(M.status().prog.err || ""), "pas de « Patiente : vérification en cours » montré comme un échec");
  M.stop();

  // ================= 4. adresses permises (GitHub seulement), redirections vérifiées =================
  const fakeFetch = (routes) => async (u) => { const f = routes[u]; if (!f) return new Response("absent", { status: 404 }); return f(); };
  const jsonR = (o) => () => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
  const redir = (loc) => () => new Response(null, { status: 302, headers: { location: loc } });
  const corps = Buffer.from("archive de test");
  const relGH = (url) => jsonR({ body: "", assets: [{ name: "build.json", size: 10, browser_download_url: "https://github.com/grecdel/Rembobine/releases/download/v1.0.0/build.json" }, { name: "Rembobine-Linux-PC.tar.gz", size: corps.length, browser_download_url: url }] });
  const bjGH = jsonR({ version: "1.0.0", build: 9, label: "1.0.0+9", files: [{ name: "Rembobine-Linux-PC.tar.gz", size: corps.length, sha256: sha(corps) }] });
  const routesBase = (url) => ({ "https://api.github.com/repos/grecdel/Rembobine/releases/latest": relGH(url), "https://github.com/grecdel/Rembobine/releases/download/v1.0.0/build.json": redir("https://objects.githubusercontent.com/github-production-release-asset/1/bj?sig=1"),
    "https://objects.githubusercontent.com/github-production-release-asset/1/bj?sig=1": bjGH });
  // a) l'archive est ailleurs que sur GitHub
  let ev4 = []; M = createMaj({ ...base({ api: undefined, build: { label: "1.0.0+8", build: 8 }, emit: (e) => ev4.push(e) }), fetch: fakeFetch(routesBase("https://exemple-pirate.com/Rembobine-Linux-PC.tar.gz")) });
  c = await M.check();
  check(c.available && c.latest === "1.0.0+9", "build.json suivi à travers la redirection de GitHub vers son serveur de fichiers");
  let a4 = await M.apply();
  check(!a4.ok && /refusée/.test(a4.err) && ev4.some((e) => e.type === "maj" && e.etape === "echec"), "archive hors de GitHub : refusée, rien n'est téléchargé");
  M.stop();
  // b) GitHub redirige vers un autre site
  const rb = routesBase("https://github.com/grecdel/Rembobine/releases/download/v1.0.0/Rembobine-Linux-PC.tar.gz");
  rb["https://github.com/grecdel/Rembobine/releases/download/v1.0.0/Rembobine-Linux-PC.tar.gz"] = redir("https://exemple-pirate.com/a.tar.gz");
  M = createMaj({ ...base({ api: undefined, build: { label: "1.0.0+8", build: 8 } }), fetch: fakeFetch(rb) });
  a4 = await M.apply();
  check(!a4.ok && /refusée/.test(a4.err), "redirection vers un autre site que GitHub : refusée");
  M.stop();
  // c) fichier d'un autre dépôt GitHub
  M = createMaj({ ...base({ api: undefined, build: { label: "1.0.0+8", build: 8 } }), fetch: fakeFetch(routesBase("https://github.com/quelquun/autre/releases/download/v1/Rembobine-Linux-PC.tar.gz")) });
  a4 = await M.apply();
  check(!a4.ok && /refusée/.test(a4.err), "fichier d'un autre dépôt GitHub : refusé");
  M.stop();
  // d) le bon chemin : github.com → objects.githubusercontent.com (appli simplement décompressée sans dossier : téléchargement seul)
  const rd = routesBase("https://github.com/grecdel/Rembobine/releases/download/v1.0.0/Rembobine-Linux-PC.tar.gz");
  rd["https://github.com/grecdel/Rembobine/releases/download/v1.0.0/Rembobine-Linux-PC.tar.gz"] = redir("https://release-assets.githubusercontent.com/github-production-release-asset/1/a?sig=2");
  rd["https://release-assets.githubusercontent.com/github-production-release-asset/1/a?sig=2"] = () => new Response(corps, { status: 200 });
  const media = path.join(T, "media"); fs.mkdirSync(media, { recursive: true });
  ev4 = []; M = createMaj({ ...base({ api: undefined, build: { label: "1.0.0+8", build: 8 }, roots: [media], emit: (e) => ev4.push(e) }), fetch: fakeFetch(rd) });
  check(M.mode() === "manuel", "sans dossier d'appli connu : téléchargement seul (« manuel »)");
  a4 = await M.apply();
  check(a4.ok && a4.downloaded === path.join(media, "MisesAJour", "Rembobine-Linux-PC.tar.gz") && fs.readFileSync(a4.downloaded).equals(corps), "téléchargé depuis les serveurs de fichiers de GitHub, rangé dans Rembobine/MisesAJour");
  check(ev4.some((e) => e.type === "maj" && e.etape === "fini" && /MisesAJour/.test(e.msg)), "la page reçoit « fini » avec la marche à suivre");
  M.stop();

  // ================= 5. fichier abîmé, trop gros, sans empreinte : refusés, rien ne change =================
  const B5 = path.join(T, "opt5"), V5 = path.join(B5, "versions", "1.0.0+1");
  linuxVersion(V5, "1.0.0+1", PORT); fs.symlinkSync(path.join("versions", "1.0.0+1"), path.join(B5, "actuelle"));
  const ev5 = []; M = createMaj(base({ build: { label: "1.0.0+1", build: 1 }, appDir: V5, emit: (e) => ev5.push(e), pid: dummy(), quit: () => {} }));
  check(M.mode() === "versionne", "installation versionnée reconnue");
  publish(2, { "Rembobine-Linux-PC.tar.gz": linuxArchive("1.0.0+2", PORT) }); GH.abime = true;
  let a5 = await M.apply();
  check(!a5.ok && /abîmé/.test(a5.err) && fs.readlinkSync(path.join(B5, "actuelle")) === "versions/1.0.0+1" && !fs.existsSync(path.join(B5, "versions", "1.0.0+2")), "fichier abîmé (empreinte) : refusé, rien ne change");
  check(ev5.some((e) => e.etape === "echec" && /abîmé/.test(e.err)) && M.status().prog.etape === "echec", "la page voit l'échec, en clair");
  GH.abime = false; GH.trop = true;
  a5 = await M.apply();
  check(!a5.ok && /abîmé/.test(a5.err) && !fs.existsSync(path.join(B5, "versions", "1.0.0+2")), "fichier plus gros que prévu : arrêté et refusé");
  M.stop();

  // le gardien ne peut pas démarrer (son journal est inutilisable) : pas de bascule, rien ne change
  publish(2, { "Rembobine-Linux-PC.tar.gz": linuxArchive("1.0.0+2", PORT) });
  fs.mkdirSync(path.join(B5, "maj-garde.log"));
  let quit5 = 0; M = createMaj(base({ build: { label: "1.0.0+1", build: 1 }, appDir: V5, pid: dummy(), quit: () => quit5++ }));
  a5 = await M.apply(); await wait(100);
  check(!a5.ok && /n'a pas pu démarrer/.test(a5.err) && fs.readlinkSync(path.join(B5, "actuelle")) === "versions/1.0.0+1" && !fs.existsSync(path.join(B5, "maj-essai.json")) && quit5 === 0, "le gardien ne démarre pas : la version actuelle reste, Rembobine ne se ferme pas");
  M.stop(); fs.rmdirSync(path.join(B5, "maj-garde.log")); fs.rmSync(path.join(B5, "versions", "1.0.0+2"), { recursive: true, force: true });

  // ================= 6. « Mettre à jour maintenant » : progression puis redémarrage =================
  publish(2, { "Rembobine-Linux-PC.tar.gz": linuxArchive("1.0.0+2", PORT) });
  const ev6 = []; let quit6 = 0;
  M = createMaj(base({ build: { label: "1.0.0+1", build: 1 }, appDir: V5, emit: (e) => ev6.push(e), pid: dummy(), quit: () => quit6++ }));
  const s6 = M.start();
  check(s6.ok && s6.started, "« start » répond tout de suite (la page suit la progression)");
  check(M.start().ok === false, "une seule mise à jour à la fois");
  check(await until(() => quit6 > 0), "l'appli se ferme pour redémarrer");
  const et = ev6.filter((e) => e.type === "maj").map((e) => e.etape).filter((x, i, a) => x !== a[i - 1]);
  check(JSON.stringify(et) === JSON.stringify(["telechargement", "verification", "installation", "redemarrage"]), "étapes dans l'ordre : " + et.join(" → "));
  check(ev6.some((e) => e.type === "maj" && e.etape === "telechargement" && e.pct === 100) && ev6.find((e) => e.etape === "redemarrage").version === "1.0.0+2", "téléchargement jusqu'à 100 %, puis redémarrage sur 1.0.0+2");
  check(await until(() => !fs.existsSync(path.join(B5, "maj-essai.json")), 20000) && fs.readlinkSync(path.join(B5, "actuelle")) === "versions/1.0.0+2", "le gardien confirme : la nouvelle version répond");
  M.stop(); await wait(300); kill(); await wait(300);
  const M6 = createMaj(base({ build: { label: "1.0.0+2", build: 2 }, appDir: path.join(B5, "versions", "1.0.0+2") }));
  check(M6.status().recent && M6.status().recent.ok && M6.status().recent.version === "1.0.0+2", "au redémarrage, la page apprend que la mise à jour a réussi (« Rembobine est à jour »)");
  M6.stop();
  // la version 2 relit la réponse écrite par la version 1 (« 1.0.0+2 disponible ») : elle ne se propose pas elle-même
  const D6 = fs.mkdtempSync(path.join(T, "data6-"));
  const M61 = createMaj(base({ data: D6, build: { label: "1.0.0+1", build: 1 } })); const c61 = await M61.check(); M61.stop();
  check(c61.available && c61.latest === "1.0.0+2" && JSON.parse(fs.readFileSync(path.join(D6, "maj-derniere.json"), "utf8")).available === true, "(la version 1 a noté « 1.0.0+2 disponible »)");
  const M62 = createMaj(base({ data: D6, build: { label: "1.0.0+2", build: 2 } }));
  GH.hits = []; const c62 = await M62.check({ auto: true });
  check(M62.status().last && M62.status().last.available === false && c62.available === false && GH.hits.length === 0, "après la mise à jour, la version 2 relit la réponse de la version 1 : rien n'est proposé (ni pastille, ni « 1.0.0+2 → 1.0.0+2 »)");
  M62.stop();

  // ================= 7. PC Linux, appli simplement décompressée → installée comme installer.sh =================
  const H7 = path.join(T, "home7"), D7 = path.join(T, "Telechargements", "Rembobine-Linux-x64"); fs.mkdirSync(H7, { recursive: true });
  linuxVersion(D7, "1.0.0+5", PORT);
  const avant = fs.readdirSync(D7).sort().join(",");
  publish(6, { "Rembobine-Linux-PC.tar.gz": linuxArchive("1.0.0+6", PORT) });
  let quit7 = 0;
  M = createMaj(base({ build: { label: "1.0.0+5", build: 5 }, appDir: D7, home: H7, pid: dummy(), quit: () => quit7++ }));
  const IB = path.join(H7, ".local", "share", "rembobine");
  check(M.mode() === "installation" && M.status().installDir === "~/.local/share/rembobine", "appli décompressée : la première mise à jour l'installe dans ~/.local/share/rembobine");
  const a7 = await M.apply(); await wait(100);
  check(a7.ok && a7.restart && a7.mode === "installation" && quit7 === 1, "installée, puis l'appli se ferme pour redémarrer");
  check(fs.existsSync(path.join(IB, "versions", "1.0.0+6", "rembobine-bin")) && fs.readlinkSync(path.join(IB, "actuelle")) === "versions/1.0.0+6" && fs.readlinkSync(path.join(IB, "rembobine")) === "actuelle/rembobine", "disposition de installer.sh : versions/1.0.0+6, actuelle, rembobine");
  const desk = fs.readFileSync(path.join(H7, ".local", "share", "applications", "rembobine.desktop"), "utf8");
  check(desk.includes(`Exec=${path.join(IB, "rembobine")} %U`) && desk.includes(`Icon=${path.join(IB, "rembobine.png")}`) && fs.readlinkSync(path.join(H7, ".local", "bin", "rembobine")) === path.join(IB, "rembobine"), "raccourci du menu des applications et commande « rembobine » mis à jour");
  check(fs.readdirSync(D7).sort().join(",") === avant && fs.readFileSync(path.join(D7, "resources", "app", "build.json"), "utf8").includes("1.0.0+5"), "le dossier décompressé n'est pas touché");
  check(await until(async () => { try { const j = await (await fetch(`http://127.0.0.1:${PORT}/api/info`)).json(); return j.build === "1.0.0+6"; } catch (_) { return false; } }, 15000), "relancée depuis ~/.local/share/rembobine : c'est la nouvelle version qui répond");
  check(await until(() => !fs.existsSync(path.join(IB, "maj-essai.json")), 20000), "le gardien a fini");
  const e7 = JSON.parse(fs.readFileSync(path.join(IB, "maj-etat.json"), "utf8"));
  check(e7.history[0].ok && e7.history[0].version === "1.0.0+6" && e7.history[0].note === "installation", "réussite notée (la page le dit une fois)");
  M.stop(); await wait(300); kill(); await wait(300);
  const M7 = createMaj(base({ build: { label: "1.0.0+6", build: 6 }, appDir: path.join(IB, "versions", "1.0.0+6"), home: H7 }));
  check(M7.mode() === "versionne" && M7.status().recent && M7.status().recent.note === "installation", "relancée, elle se sait installée : les mises à jour suivantes se font à côté");
  M7.stop();
  // l'utilisateur relance l'ancienne copie décompressée (raccourci perso, terminal) : 1.0.0+6 est déjà installée
  const M7b = createMaj(base({ build: { label: "1.0.0+5", build: 5 }, appDir: D7, home: H7 }));
  const c7b = await M7b.check();
  check(M7b.mode() === "installation" && !c7b.available && c7b.installed === "1.0.0+6" && !c7b.err && M7b.status().last.installed === "1.0.0+6", "copie décompressée relancée : « déjà installé (1.0.0+6) », rien à retélécharger ni à réinstaller");
  const a7b = await M7b.apply();
  check(!a7b.ok && !fs.readdirSync(path.join(IB, "versions")).some((n) => n.startsWith(".nouvelle")) && fs.readlinkSync(path.join(IB, "actuelle")) === "versions/1.0.0+6", "« Mettre à jour » n'y réinstalle rien");
  M7b.stop();
  // la nouvelle version ne démarre pas : retour à l'appli décompressée, ce que l'installation a créé est enlevé
  const H8 = path.join(T, "home8"); fs.mkdirSync(H8, { recursive: true });
  publish(7, { "Rembobine-Linux-PC.tar.gz": linuxArchive("1.0.0+7", PORT, "casse") });
  M = createMaj(base({ build: { label: "1.0.0+5", build: 5 }, appDir: D7, home: H8, pid: dummy(), quit: () => {} }));
  const a8 = await M.apply();
  const IB8 = path.join(H8, ".local", "share", "rembobine");
  check(a8.ok && fs.readlinkSync(path.join(IB8, "actuelle")) === "versions/1.0.0+7", "version cassée installée et essayée");
  check(await until(() => !fs.existsSync(path.join(IB8, "maj-essai.json")), 25000), "le gardien a fini (60 s en vrai, 6 s ici)");
  check(await until(async () => { try { const j = await (await fetch(`http://127.0.0.1:${PORT}/api/info`)).json(); return j.build === "1.0.0+5"; } catch (_) { return false; } }, 15000), "elle ne démarre pas : l'appli décompressée est relancée, rien n'est perdu");
  check(!fs.existsSync(path.join(IB8, "actuelle")) && !fs.existsSync(path.join(H8, ".local", "share", "applications", "rembobine.desktop")) && !fs.existsSync(path.join(IB8, "versions", "1.0.0+7")), "le raccourci du menu ne mène pas à une version qui ne démarre pas");
  M.stop(); await wait(300); kill(); await wait(300);
  M = createMaj(base({ build: { label: "1.0.0+5", build: 5 }, appDir: D7, home: H8 }));
  c = await M.check();
  check(!c.available && /n'a pas démarré/.test(c.err || "") && M.status().recent && M.status().recent.ok === false, "la version cassée n'est plus proposée, et la page dit que l'ancienne a été remise");
  M.stop();

  // ================= 8. Windows : décompressée à côté, vérifiée, script PowerShell =================
  // (la fausse archive Windows est un vrai .zip : il faut zip et unzip sur la machine d'essai)
  const avecZip = spawnSync("zip", ["-v"]).status === 0 && spawnSync("unzip", ["-v"]).status === 0;
  if (!avecZip) console.log("(zip ou unzip absent : essai Windows sauté)");
  if (avecZip) {
  const WP = path.join(T, "Mes Programmes d'O'Brien"), WA = path.join(WP, "Rembobine-Windows"); winVersion(WA, "1.0.0+3");
  const { privateKey } = crypto.generateKeyPairSync("ed25519"), pem = privateKey.export({ format: "pem", type: "pkcs8" }), pub = SIG.rawPublic(pem);
  publish(4, { "Rembobine-Windows.zip": await winZip("1.0.0+4", { signer: pem }) });
  const scripts = []; let quit8 = 0;
  const wbase = (extra) => base({ platform: "win32", arch: "x64", appDir: WA, build: { label: "1.0.0+3", build: 3 }, pid: 4242, publicKey: pub, quit: () => quit8++, spawnWin: async (sc) => { scripts.push(sc); return ""; }, ...extra });
  M = createMaj(wbase());
  check(M.mode() === "windows" && (await M.check()).asset.name === "Rembobine-Windows.zip", "Windows : bon fichier, installation par échange de dossiers");
  const a9 = await M.apply(); await wait(100);
  check(a9.ok && a9.restart && a9.mode === "windows" && quit8 === 1 && scripts.length === 1, "décompressée, vérifiée, script lancé, Rembobine se ferme");
  const sc = fs.readFileSync(scripts[0], "utf8"), neuf = ((/^\$neuf = '(.*)'\r$/m.exec(sc) || [])[1] || "").replace(/''/g, "'");
  check(sc.startsWith("\uFEFF") && sc.includes("\r\n"), "script en UTF-8 avec BOM, lignes Windows (accents des chemins bien lus)");
  check(sc.includes("$pidRbb = 4242") && sc.includes(`$app = '${WA.replace(/'/g, "''")}'`) && sc.includes(`$port = ${PORT}`) && sc.includes("$version = '1.0.0+4'") && sc.includes("$ancienne = '1.0.0+3'"), "script : bon processus, bon dossier (apostrophe doublée), port, versions");
  check(/Get-Process -Id \$pidRbb/.test(sc) && /Deplacer \$app \$cote/.test(sc) && /Deplacer \$neuf \$app/.test(sc) && /Lancer \$app/.test(sc), "script : attend la fermeture, met l'ancien dossier de côté, met la nouvelle version, relance");
  check(/Invoke-RestMethod -Uri \('http:\/\/127\.0\.0\.1:' \+ \$port \+ '\/api\/info'\)/.test(sc) && /\$r\.build -eq \$version/.test(sc), "script : vérifie que la nouvelle version répond (/api/info)");
  check(/Deplacer \$app \$echec/.test(sc) && /Deplacer \$cote \$app/.test(sc) && /Resultat \$false 'ne démarre pas : ancienne version remise'/.test(sc), "script : revient à l'ancienne si la nouvelle ne démarre pas");
  check(neuf.startsWith(WP) && fs.existsSync(path.join(neuf, "Rembobine.exe")) && JSON.parse(fs.readFileSync(path.join(neuf, "resources", "app", "build.json"), "utf8")).label === "1.0.0+4", "la nouvelle version attend à côté (même disque)");
  check(fs.readFileSync(path.join(WA, "resources", "app", "build.json"), "utf8").includes("1.0.0+3"), "le dossier actuel n'est pas touché avant la fermeture");
  check(!/(token|jeton|ghp_|github_pat)/i.test(sc), "aucun jeton dans le script");
  check(/^\$demarre = '.*maj-windows-demarre\.txt'\r$/m.test(sc) && sc.indexOf("Set-Content -LiteralPath $demarre") > 0 && sc.indexOf("Set-Content -LiteralPath $demarre") < sc.indexOf("Get-Process -Id $pidRbb"), "script : écrit « démarré » avant d'attendre la fermeture (un PowerShell arrêté tout de suite est vu)");
  M.stop();
  // (ménage de cet essai : seulement le dossier de la nouvelle version, à côté de l'appli de test)
  if (neuf && path.isAbsolute(neuf) && path.dirname(path.dirname(neuf)) === WP) fs.rmSync(path.dirname(neuf), { recursive: true, force: true });
  check(scriptWindows({ app: "C:\\Users\\O'Brien\\Rembobine", neuf: "x", version: "1", de: "0", journal: "j", resultat: "r", pid: 1, port: 8080 }).includes("$app = 'C:\\Users\\O''Brien\\Rembobine'"), "chemin avec apostrophe correctement écrit");
  // signature : une archive modifiée après la signature est refusée AVANT tout échange
  publish(5, { "Rembobine-Windows.zip": await winZip("1.0.0+5", { signer: pem, modifier: true, tag: "m" }) }); scripts.length = 0;
  M = createMaj(wbase());
  let a10 = await M.apply();
  check(!a10.ok && /modifiés/.test(a10.err) && scripts.length === 0 && !fs.readdirSync(WP).some((n) => n.startsWith(".rembobine-nouvelle")), "archive modifiée après la signature : refusée, rien de lancé, rien qui traîne");
  M.stop();
  // PowerShell bloqué : rien ne change et Rembobine ne se ferme pas
  publish(5, { "Rembobine-Windows.zip": await winZip("1.0.0+5", { signer: pem, tag: "b" }) }); quit8 = 0;
  M = createMaj(wbase({ spawnWin: async () => "spawn powershell.exe ENOENT" }));
  a10 = await M.apply();
  check(!a10.ok && /PowerShell/.test(a10.err) && quit8 === 0 && !fs.readdirSync(WP).some((n) => n.startsWith(".rembobine-nouvelle")), "PowerShell bloqué : message clair, Rembobine reste ouvert, rien ne traîne");
  M.stop();
  // au redémarrage : le résultat du script (écrit par PowerShell, avec BOM) est relu
  const dataW = fs.mkdtempSync(path.join(T, "dataw-"));
  mk(path.join(dataW, "maj", "maj-windows-resultat.json"), "\uFEFF" + JSON.stringify({ from: "1.0.0+3", to: "1.0.0+5", ok: false, err: "ne démarre pas : ancienne version remise", t: Date.now() }));
  M = createMaj(wbase({ data: dataW }));
  const st10 = M.status();
  check(st10.recent && st10.recent.ok === false && st10.recent.version === "1.0.0+5" && st10.bad.includes("1.0.0+5") && !fs.existsSync(path.join(dataW, "maj", "maj-windows-resultat.json")), "résultat du script relu : version ignorée, la page dit que l'ancienne a été remise");
  M.stop();
  }

  // ================= 9. Android : Rembobine.apk et son empreinte ; même contrat côté Java =================
  const apk = Buffer.from("PK faux apk");
  publish(12, { "Rembobine.apk": apk, "Rembobine-Linux-PC.tar.gz": Buffer.from("autre"), "Rembobine-Windows.zip": Buffer.from("autre") });
  M = createMaj(base({ platform: "android", arch: "arm64", build: { label: "1.0.0+11", build: 11 } }));
  c = await M.check();
  check(c.available && c.asset.name === "Rembobine.apk" && c.asset.sha256 === sha(apk) && c.asset.fsize === apk.length, "Android : Rembobine.apk choisi, avec sa taille et son empreinte");
  M.stop();
  const J = fs.readFileSync(path.join(R, "android", "src", "fr", "rembobine", "app", "MiseAJour.java"), "utf8");
  const A = fs.readFileSync(path.join(R, "android", "src", "fr", "rembobine", "app", "RembobineActivity.java"), "utf8");
  check(/"Rembobine\.apk"/.test(J) && /"build\.json"/.test(J) && /releases\/latest/.test(J) && /SHA-256/.test(J) && /objects\.githubusercontent\.com/.test(J) && /release-assets\.githubusercontent\.com/.test(J), "MiseAJour.java : même fichier, même build.json, empreinte vérifiée, mêmes serveurs permis");
  check(/getPackageArchiveInfo/.test(J) && /GET_SIGNING_CERTIFICATES/.test(J) && /getPackageName\(\)\.equals\(neuf\.packageName\)/.test(J), "MiseAJour.java : c'est bien Rembobine, signé par la même clé");
  check(/static JSONObject pourCetteVersion\(JSONObject l, int monBuild\)/.test(J) && /optInt\("build", 0\) <= monBuild/.test(J) && /pourCetteVersion\(new JSONObject\(d\)/.test(fs.readFileSync(path.join(R, "android", "src", "fr", "rembobine", "app", "RembobineActivity.java"), "utf8")), "Android : la réponse gardée par la version d'avant est recalculée au démarrage");
  check(/code == 404 && fichier\) throw new Erreur\(REMPLACEE, false, true\)/.test(J) && /if \(bj == null\) throw new Erreur\(REMPLACEE, false, true\)/.test(J) && /json\(bj\.optString\("browser_download_url", ""\), depot, true\)/.test(J), "Android : build.json absent ou 404 = version en train d'être remplacée (pas « fermé »)");
  check(/ACTION_INSTALL_PACKAGE/.test(A) && /FileProvider\.getUriForFile\(this, getPackageName\(\) \+ "\.maj"/.test(A) && /canRequestPackageInstalls/.test(A) && /majEtat|majVerifier|majInstaller/.test(A), "RembobineActivity : installateur d'Android par le FileProvider, autorisation demandée");
  const man = fs.readFileSync(path.join(R, "android", "release", "AndroidManifest.xml"), "utf8"), chem = fs.readFileSync(path.join(R, "android", "res", "xml", "rbb_maj_chemins.xml"), "utf8");
  // le provider des mises à jour : NOTRE classe (MajFichiers, un FileProvider d'AndroidX). La bibliothèque de Godot
  // (godot-lib) déclare déjà « androidx.core.content.FileProvider » (autorité …fileprovider) : deux éléments du même nom
  // sont pris pour le même par la fusion des manifestes de Gradle, qui s'arrête (plus d'APK, plus de version publiée).
  const provs = [...man.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<provider\b[\s\S]*?<\/provider>/g)].map(m => m[0]);
  const majProv = provs.find(p => /android:authorities="fr\.rembobine\.app\.maj"/.test(p)) || "";
  check(/android\.permission\.REQUEST_INSTALL_PACKAGES/.test(man) && /android:name="fr\.rembobine\.app\.MajFichiers"/.test(majProv) && /android:exported="false"/.test(majProv) && /android:grantUriPermissions="true"/.test(majProv) && /@xml\/rbb_maj_chemins/.test(majProv), "manifeste : permission d'installer et FileProvider à nous (MajFichiers, non exporté)");
  const MF = path.join(R, "android", "src", "fr", "rembobine", "app", "MajFichiers.java");
  check(fs.existsSync(MF) && /public class MajFichiers extends androidx\.core\.content\.FileProvider/.test(fs.readFileSync(MF, "utf8")), "MajFichiers.java : un FileProvider d'AndroidX sous notre nom");
  // aucun élément de notre manifeste ne reprend le nom d'un élément de la bibliothèque de Godot 4.3 (sinon la fusion échoue)
  const GODOT_LIB = ["androidx.core.content.FileProvider", "org.godotengine.godot.utils.ProcessPhoenix", "org.godotengine.godot.GodotDownloaderService"];
  const noms = [...man.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<(?:provider|activity|service|receiver)\b[^>]*?android:name="([^"]+)"/g)].map(m => m[1]);
  check(!noms.some(n => GODOT_LIB.includes(n)), "manifeste : aucun nom déjà déclaré par la bibliothèque de Godot (fusion de Gradle possible)");
  check(/<cache-path name="maj" path="maj\/" \/>/.test(chem), "FileProvider : seulement le dossier cache/maj");
  const prep = fs.readFileSync(path.join(R, "ci", "prepare_android.py"), "utf8");
  check(/rbb_build\.json/.test(prep) && /RBB_DEPOT/.test(prep) && /100000/.test(prep), "fabrication Android : numéro et dépôt écrits dans l'APK, numéro de version qui grandit");

  // ================= 10. la fabrication : dépôt des versions, jamais de jeton dans l'appli =================
  const yml = fs.readFileSync(path.join(R, ".github", "workflows", "build.yml"), "utf8");
  check(/RBB_DEPOT_VERSIONS/.test(yml) && /secrets\.RBB_VERSIONS_TOKEN/.test(yml) && /RBB_DEPOT: \$\{\{ needs\.preparer\.outputs\.depot \}\}/.test(yml), "build.yml : dépôt des versions (variable + secret), transmis à la fabrication");
  check(/"depot":"%s"/.test(fs.readFileSync(path.join(R, "ci", "build_desktop.sh"), "utf8")) && /"depot": depot/.test(fs.readFileSync(path.join(R, "ci", "build_json.py"), "utf8")), "build.json de l'appli et de la version publiée : champ « depot »");
  const appFiles = [...fs.readdirSync(__dirname).filter((n) => n.endsWith(".js") && !n.startsWith("test_")).map((n) => path.join(__dirname, n)), path.join(R, "app", "main.js"), path.join(R, "android", "src", "fr", "rembobine", "app", "MiseAJour.java")];
  check(!appFiles.some((f) => /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|RBB_VERSIONS_TOKEN/.test(fs.readFileSync(f, "utf8"))), "aucun jeton dans l'appli (serveur, Electron, Android)");

  // ================= 11. le serveur : routes et évènements, l'invité ne voit rien =================
  const lan = Object.values(os.networkInterfaces()).flat().find((x) => x && x.family === "IPv4" && !x.internal);
  const SP = 18000 + Math.floor(Math.random() * 900);
  mk(path.join(T, "srv-build.json"), JSON.stringify({ version: "1.0.0", build: 1, label: "1.0.0+1", date: "2026-11-02" }));
  publish(2, { "Rembobine-Linux-PC.tar.gz": Buffer.from("x") }); GH.abime = true;
  const S = createServer({ port: SP, dataDir: path.join(T, "srv"), mediaRoots: [media], webDir: T,
    os: { buildFile: path.join(T, "srv-build.json"), isOs: false, run: () => ({ status: 0, stdout: "" }), which: () => "", updateApi: API, home: path.join(T, "homeS"), quit: () => {} } });
  await S.start();
  const req = (p, { body, tok, host = "127.0.0.1" } = {}) => new Promise((res) => {
    const r = http.request({ host, port: SP, path: p, method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) } }, (x) => { let d = ""; x.on("data", (k) => d += k); x.on("end", () => { let j = null; try { j = JSON.parse(d); } catch (_) {} res({ status: x.statusCode, json: j }); }); });
    r.end(body ? JSON.stringify(body) : undefined);
  });
  const sse = (tok, host = "127.0.0.1") => { const got = []; const r = http.get({ host, port: SP, path: "/api/stream" + (tok ? "?tok=" + encodeURIComponent(tok) : "") }, (x) => { x.setEncoding("utf8"); x.on("data", (d) => { for (const l of d.split("\n")) if (l.startsWith("data: ")) { try { got.push(JSON.parse(l.slice(6))); } catch (_) {} } }); }); return { got, close: () => r.destroy() }; };
  const u0 = (await req("/api/update")).json;
  check(u0.current === "1.0.0+1" && u0.depot === REPO && u0.mode === "manuel" && u0.prog && "etape" in u0.prog, "/api/update : version, dépôt, façon de se mettre à jour, progression");
  const cc = (await req("/api/update", { body: { action: "check", auto: true } })).json;
  check(cc.ok && cc.available && cc.latest === "1.0.0+2", "/api/update check (vérification discrète de la page)");
  const home = sse("");
  let guest = null;
  if (lan) {
    S.cfg.invites = [{ code: "MAJINV", until: Date.now() + 1e6 }];
    const g = (await req("/api/pair", { host: lan.address, body: { invite: "MAJINV", name: "Léa" } })).json;
    guest = sse(g.token, lan.address);
    check((await req("/api/update", { host: lan.address, tok: g.token })).status === 403 && (await req("/api/update", { host: lan.address, tok: g.token, body: { action: "start" } })).status === 403
      && (await req("/api/update", { host: lan.address, tok: g.token, body: { action: "check" } })).status === 403, "un invité ne voit ni ne lance aucune mise à jour (403)");
  } else console.log("(pas d'adresse réseau : essai de l'invité sauté)");
  await wait(300);
  const st = (await req("/api/update", { body: { action: "start" } })).json;
  check(st.ok && st.started, "/api/update start : la mise à jour part (elle échouera : fichier abîmé)");
  check(await until(async () => (await req("/api/update")).json.prog.etape === "echec"), "l'échec est visible dans /api/update (pour la page)");
  await wait(400);
  check(home.got.some((e) => e.type === "maj" && e.etape === "telechargement") && home.got.some((e) => e.type === "maj" && e.etape === "echec"), "l'écran de la maison reçoit la progression (évènements « maj »)");
  if (guest) check(guest.got.length > 0 && !guest.got.some((e) => e.type === "maj" || e.type === "update"), "l'invité ne reçoit aucune nouvelle des mises à jour");
  home.close(); if (guest) guest.close();
  await S.stop(); gh.close(); kill();
  fs.rmSync(T, { recursive: true, force: true });
  console.log(`Bouton « Nouvelle version détectée » : ${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.log("ERREUR", e); kill(); process.exit(1); });
