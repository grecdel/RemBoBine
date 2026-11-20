// Tests de sécurité du serveur de la maison : node app/serveur/test_securite.js
//  1. « la TV elle-même » : une page web étrangère (même PC) ou un « DNS rebinding » ne passent pas pour l'écran ;
//  2. le code d'appairage n'est envoyé qu'à l'écran de la TV (jamais aux téléphones ni aux invités) ;
//  3. force brute : 3 essais par code, blocage après 10 erreurs (codes et invitations) ;
//  4. invités : liste fermée d'adresses, sauvegardes de jeux séparées de celles de la famille ;
//  5. fichiers piégés : liste .m3u vers /etc, liens symboliques (sous-titres, paroles, aperçus) ;
//  6. sauvegarde piégée : elle ne peut pas ajouter d'appareil relié ;
//  7. mises à jour : signature Ed25519 obligatoire dès qu'une clé publique est configurée ;
//  8. déni de service simple : corps énorme, trop de conversions vidéo en même temps ; voisins UDP.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http"), crypto = require("crypto"), zlib = require("zlib");
const { spawnSync } = require("child_process");
const { createServer } = require("./serveur");
const { createMaj } = require("./maj");
const SIG = require("./maj-signature");
const J = require("./jeux");
const V = require("./video");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-secu-"));
const M = path.join(T, "media");
const put = (rel, data) => { const f = path.join(M, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const SECRET = path.join(T, "secret.txt"); fs.writeFileSync(SECRET, "MOT-DE-PASSE-SECRET");
put("Films/Le Phare (2020)/Le Phare.mp4", Buffer.alloc(3000, 1));
fs.symlinkSync(SECRET, path.join(M, "Films", "Le Phare (2020)", "Le Phare.fr.srt"));          // sous-titre piégé
put("Jeux/PSX/Aventure (Disc 1).cue", "FILE x"); put("Jeux/PSX/Aventure (Disc 2).cue", "FILE y");
put("Jeux/PSX/Aventure.m3u", `Aventure (Disc 1).cue\n${SECRET}\n../../../secret.txt\nAventure (Disc 2).cue\n`);   // liste piégée
put("Jeux/NES/Duel.nes", Buffer.alloc(2000, 2));
fs.mkdirSync(path.join(M, "Jeux", "NES", "snaps"), { recursive: true }); fs.symlinkSync(SECRET, path.join(M, "Jeux", "NES", "snaps", "Duel.mp4"));   // aperçu piégé
put("Musique/Groupe - Album/01 - Titre.mp3", Buffer.alloc(800, 3)); fs.symlinkSync(SECRET, path.join(M, "Musique", "Groupe - Album", "01 - Titre.lrc"));

const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal);
if (!lan) { console.log("PAS D'ADRESSE RÉSEAU : test impossible ici"); process.exit(1); }
const PORT = 21000 + Math.floor(Math.random() * 900);
let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) ok++; else { ko++; console.log("ÉCHEC :", what); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function req(p, { body, raw, tok, host = lan.address, method, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const h = { ...headers }; if (tok) h.Authorization = "Bearer " + tok; if (body) h["Content-Type"] = "application/json";
    const r = http.request({ host, port: PORT, path: p, method: method || (body || raw ? "POST" : "GET"), headers: h }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => { const buf = Buffer.concat(ch); let json = null; try { json = JSON.parse(buf); } catch (_) {} resolve({ status: res.statusCode, headers: res.headers, buf, json }); });
    });
    r.on("error", reject); if (body) r.write(JSON.stringify(body)); if (raw) r.write(raw); r.end();
  });
}
const local = (p, o = {}) => req(p, { ...o, host: "127.0.0.1" });
function stream(host, tok) {
  const ev = []; const r = http.get({ host, port: PORT, path: "/api/stream" + (tok ? "?tok=" + tok : "") }, (res) => { res.on("data", (d) => { for (const l of String(d).split("\n")) if (l.startsWith("data: ")) ev.push(JSON.parse(l.slice(6))); }); });
  return { ev, close: () => r.destroy() };
}

(async () => {
  const S = createServer({ port: PORT, webDir: path.join(__dirname, "..", "..", "web"), dataDir: path.join(T, "data"), mediaRoots: [M], mpv: "/nonexistent", retroarch: "/nonexistent", version: "test", voisins: false, kioskKey: "cle-de-l-ecran" });
  await S.start(); await wait(300);
  for (let i = 0; i < 50 && !S.lib.t; i++) await wait(100);

  // ---------- 1. « la TV elle-même » ----------
  check((await local("/api/library")).status === 200, "programme de la machine (sans Origin) : écran de la TV");
  check((await local("/api/library", { headers: { Origin: "https://site-piege.example" } })).status === 401, "page d'un autre site sur le même PC (Origin) : refusée");
  check((await local("/api/library", { headers: { "Sec-Fetch-Site": "cross-site" } })).status === 401, "image ou lien d'un autre site (Sec-Fetch-Site) : refusé");
  check((await local("/api/library", { headers: { Host: "piege.example:" + PORT } })).status === 401, "DNS rebinding (nom étranger qui pointe sur 127.0.0.1) : refusé");
  check((await local("/api/library", { headers: { Origin: "null", "Sec-Fetch-Site": "cross-site", "X-Rembobine-Ecran": "cle-de-l-ecran" } })).status === 200, "l'application de bureau (page file://) avec la clé de l'écran : acceptée");
  check((await local("/api/library", { headers: { Origin: "null", "X-Rembobine-Ecran": "mauvaise" } })).status === 401, "mauvaise clé d'écran : refusée");
  check((await local("/api/library", { headers: { Origin: `http://127.0.0.1:${PORT}`, "Sec-Fetch-Site": "same-origin" } })).status === 200, "la page servie par le serveur lui-même, ouverte sur la machine : acceptée");
  check((await local("/api/info", { headers: { Origin: "https://site-piege.example" } })).json.kiosk === false, "/api/info ne dit pas « écran » à une page étrangère");

  // ---------- 2. le code d'appairage ne va qu'à l'écran ----------
  const tv = stream("127.0.0.1");
  await local("/api/pair/request", { body: { name: "Téléphone" } }); await wait(150);
  const tok = (await req("/api/pair", { body: { code: S.pairing.code, name: "Téléphone" } })).json.token;
  check(!!tok, "appairage normal");
  const phone = stream(lan.address, tok); await wait(200);
  check((await req("/api/pair/request", { body: { name: "Autre" } })).json.ok, "nouveau code demandé");
  await wait(250);
  check(tv.ev.some((e) => e.type === "pair" && e.code), "l'écran de la TV reçoit le code");
  check(!phone.ev.some((e) => e.type === "pair"), "un téléphone relié ne reçoit PAS le code (il pourrait relier un autre appareil)");
  await req("/api/key", { body: { text: "motdepassewifi" }, tok }); await wait(150);
  check(!phone.ev.some((e) => e.type === "key"), "le texte tapé à la télécommande ne part qu'à l'écran");

  // ---------- 3. force brute ----------
  const code = S.pairing.code, bad = code === "0000" ? "1111" : "0000";
  check((await req("/api/pair/request", { body: { name: "Encore" } })).json.again === true && S.pairing.code === code, "redemander un code aussitôt garde le code affiché (pas de tirage illimité)");
  for (let i = 0; i < 3; i++) await req("/api/pair", { body: { code: bad } });
  check(S.pairing === null && (await req("/api/pair", { body: { code } })).json.ok === false, "3 erreurs : le code ne vaut plus rien, même le bon");

  // ---------- 4. invités ----------
  S.cfg.invites = [{ code: "AB12CD", until: Date.now() + 3600000 }];
  const g = (await req("/api/pair", { body: { invite: "AB12CD", name: "Ami" } })).json;
  check(g.ok && g.guest && g.token, "invité relié avec le code d'invitation");
  const gt = g.token, gs = stream(lan.address, gt);
  const lib = (await req("/api/library", { tok: gt })).json;
  check(lib && lib.items && lib.items.length >= 2, "un invité voit la bibliothèque");
  const game = lib.items.find((x) => x.kind === "game" && /Duel/.test(x.title)), film = lib.items.find((x) => x.kind === "film");
  const refused = async (p, o = {}) => (await req(p, { ...o, tok: gt })).status === 403;
  check(await refused("/api/game", { body: { id: game.id } }), "invité : ne lance pas un jeu sur la TV");
  check(await refused("/api/cards/tap", { body: { uid: "04AA" } }), "invité : ne pose pas de cartouche (lancement sur la TV)");
  check(await refused("/api/config"), "invité : ne lit pas les réglages");
  check(await refused("/api/rename"), "invité : ne voit pas les noms de fichiers à renommer");
  check(await refused("/api/sante") && await refused("/api/usb") && await refused("/api/remote") && await refused("/api/tailscale"), "invité : pas d'état de la maison, des disques ni des adresses");
  check(await refused(`/api/fiche/${film.id}/posters`, { body: { query: "x" } }), "invité : pas de recherche d'affiches");
  check(await refused("/api/devices") && await refused("/api/logs") && await refused("/api/power", { body: { action: "shutdown" } }), "invité : ni appareils, ni journal, ni extinction");
  check(await refused("/api/route-future-inconnue", { body: {} }), "invité : une adresse inconnue est refusée (liste fermée)");
  const sys = (await req("/api/system", { tok: gt })).json;
  check(sys && sys.net && !sys.net.ip && !sys.net.tailscale, "invité : /api/system sans les adresses de la maison");
  check((await req(`/media/${film.id}`, { tok: gt })).status === 200, "invité : regarde un film");
  await req(`/api/saves/${game.id}/srm/0?profil=Tom&at=10`, { raw: Buffer.from("SAUVE-DE-TOM"), tok });
  check((await req(`/api/saves/${game.id}/srm/0?profil=Tom`, { tok: gt })).status === 404, "invité : ne lit pas la sauvegarde de Tom");
  await req(`/api/saves/${game.id}/srm/0?profil=Tom&del=1`, { tok: gt, method: "POST" });
  check((await req(`/api/saves/${game.id}/srm/0?profil=Tom`, { tok })).buf.toString() === "SAUVE-DE-TOM", "invité : n'efface pas la sauvegarde de Tom");
  check((await req(`/api/saves/${game.id}/srm/0?profil=Tom&at=20`, { raw: Buffer.from("A MOI"), tok: gt })).json.ok, "invité : garde ses propres sauvegardes");
  check((await req(`/api/saves/${game.id}/srm/0?profil=Tom`, { tok })).buf.toString() === "SAUVE-DE-TOM", "… à part : celle de Tom n'est pas écrasée");
  check(!gs.ev.some((e) => e.type === "pair" || e.type === "key"), "invité : ne reçoit ni code d'appairage ni texte tapé");

  // ---------- 5. fichiers piégés ----------
  const adv = lib.items.find((x) => x.kind === "game" && /Aventure/.test(x.title));
  check(adv && adv.discs && adv.discs.length === 2 && adv.discs.every((d) => /Aventure \(Disc/.test(d.name)), "liste .m3u : seuls les disques du dossier sont gardés");
  let leak = false; for (let n = 1; n <= 4; n++) { const r = await req(`/media/${adv.id}~${n}`, { tok }); if (/MOT-DE-PASSE/.test(r.buf.toString())) leak = true; }
  check(!leak, "liste .m3u piégée : aucun fichier hors de la bibliothèque téléchargeable");
  check(!S.libFile(SECRET) && !S.libFile("/etc/hostname") && !S.libFile(path.join(T, "data", "serveur.json")) && S.libFile(path.join(M, "Jeux", "NES", "Duel.nes")), "libFile : seulement les fichiers des dossiers de médias");
  check(!V.sidecars(path.join(M, "Films", "Le Phare (2020)", "Le Phare.mp4")).length, "sous-titre en lien symbolique ignoré");
  check(J.apercu(path.join(M, "Jeux", "NES", "Duel.nes")) === "", "aperçu en lien symbolique ignoré");
  const alb = lib.items.find((x) => x.kind === "album");
  const ly = alb ? (await req(`/api/lyrics/${alb.id}/0`, { tok })).buf.toString() : "";
  check(alb && !/MOT-DE-PASSE/.test(ly), "paroles (.lrc) en lien symbolique ignorées");
  // une jaquette repérée qui pointerait hors des dossiers n'est pas servie
  const it = S.lib.byId.get(film.id), keepCover = it.coverFile; it.coverFile = SECRET;
  check((await req(it.pub.cover || `/cover/${film.id}`, { tok })).status === 404, "jaquette hors des dossiers : refusée");
  it.coverFile = keepCover;

  // ---------- 6. sauvegarde piégée ----------
  const attacker = "jeton-de-pirate", sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
  const evil = zlib.gzipSync(Buffer.from(JSON.stringify({ rembobineSauvegarde: 1, files: [{ z: "serveur", rel: "serveur.json", b64: Buffer.from(JSON.stringify({ name: "Piège", tokens: [{ hash: sha(attacker), name: "pirate" }], invites: [{ code: "PIRATE", until: Date.now() + 1e9 }], secret: "abc" })).toString("base64") }] })));
  const rr = S.sauvegarde.restoreBuffer(evil);
  check(rr.ok && S.cfg.name === "Piège", "sauvegarde restaurée (réglages repris)");
  check((await req("/api/library", { tok: attacker })).status === 401, "… mais elle n'ajoute aucun appareil relié");
  check((await req("/api/library", { tok })).status === 200 && !S.cfg.invites.some((x) => x.code === "PIRATE") && S.cfg.secret !== "abc", "… les appareils, invitations et la clé secrète de la maison restent les siens");

  // ---------- 8. déni de service simple ----------
  const big = await req("/api/cards", { raw: Buffer.alloc(3 * 1024 * 1024, 32), tok }).catch(() => ({ status: 0 }));
  check(big.status === 0 || big.status === 200, "corps de 3 Mo : coupé sans bloquer le serveur");
  check((await req("/api/info")).status === 200, "le serveur répond toujours");
  S.transcodes = 4;
  check((await req(`/media/${film.id}?mode=transcode`, { tok })).status === 503, "trop de conversions vidéo en même temps : refusé poliment");
  S.transcodes = 0;

  // brute force : après 10 erreurs, tout est bloqué (même un bon code), et la TV est prévenue
  await local("/api/pair/request", { body: { name: "X" } });
  for (let i = 0; i < 12; i++) { if (!S.pairing) { S.guard.lastReq = 0; await local("/api/pair/request", { body: { name: "X" } }); } await req("/api/pair", { body: { code: S.pairing && S.pairing.code === "0000" ? "1111" : "0000" } }); }
  check(S.guard.until > Date.now(), "10 erreurs : appairage bloqué");
  check(/Trop d'essais/.test((await req("/api/pair/request", { body: {} })).json.err || "") && /Trop d'essais/.test((await req("/api/pair", { body: { invite: "AB12CD" } })).json.err || ""), "bloqué aussi pour les invitations, même avec le bon code");
  check(tv.ev.some((e) => e.type === "alert" && /essayé beaucoup de codes/.test(e.msg)), "la TV prévient qu'on a essayé beaucoup de codes");
  tv.close(); phone.close(); gs.close();
  await S.stop();

  // ---------- 7. mises à jour signées ----------
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }), pub = SIG.rawPublic(pem);
  const mk = (f, d, mode) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, d); if (mode) fs.chmodSync(f, mode); };
  function version(dir, label) {
    mk(path.join(dir, "rembobine-bin"), "#!/bin/sh\nexit 0\n", 0o755); mk(path.join(dir, "rembobine"), "#!/bin/sh\nexit 0\n", 0o755);
    mk(path.join(dir, "resources", "app", "main.js"), "// " + label); mk(path.join(dir, "resources", "app", "build.json"), JSON.stringify({ version: "1.0.0", build: Number(label.split("+")[1]), label }));
  }
  const USB = path.join(T, "usb"); fs.mkdirSync(USB, { recursive: true });
  async function archive(label, how) {
    const src = path.join(T, "src-" + label + how, "Rembobine-Linux-x64"); version(src, label);
    if (how !== "unsigned") await SIG.signDir(src, pem);
    if (how === "tampered") fs.writeFileSync(path.join(src, "resources", "app", "main.js"), "require('child_process').exec('pirate')");
    if (how === "extra") fs.writeFileSync(path.join(src, "resources", "app", "porte-derobee.js"), "x");
    spawnSync("tar", ["czf", path.join(USB, "Rembobine-Linux-PC.tar.gz"), "-C", path.dirname(src), "Rembobine-Linux-x64"]);
    return path.join(USB, "Rembobine-Linux-PC.tar.gz");
  }
  const B = path.join(T, "opt"); version(path.join(B, "versions", "1.0.0+1"), "1.0.0+1"); fs.symlinkSync(path.join("versions", "1.0.0+1"), path.join(B, "actuelle"));
  const link = () => fs.readlinkSync(path.join(B, "actuelle"));
  const mkMaj = (publicKey) => createMaj({ data: path.join(T, "data-maj"), build: { version: "1.0.0", build: 1, label: "1.0.0+1" }, appDir: path.join(B, "versions", "1.0.0+1"), roots: [M], port: 1, kiosk: true,
    cfg: () => ({ update: { auto: false } }), quit: () => {}, node: process.execPath, pid: 0, gardeTimeout: 500, quitDelay: 0, platform: "linux", arch: "x64", usbDirs: [USB], mountsFile: "/nonexistent", publicKey, fetch: async () => { throw new Error("pas d'internet"); } });
  fs.mkdirSync(path.join(T, "data-maj"), { recursive: true });
  let MJ = mkMaj(pub);
  let f = await archive("1.0.0+2", "unsigned"), r = await MJ.fromFile(f);
  check(!r.ok && /pas signée/.test(r.err) && link() === "versions/1.0.0+1", "mise à jour sans signature : refusée, rien ne change");
  f = await archive("1.0.0+2", "tampered"); r = await MJ.fromFile(f);
  check(!r.ok && /modifiés/.test(r.err) && link() === "versions/1.0.0+1", "mise à jour signée puis modifiée : refusée");
  f = await archive("1.0.0+2", "extra"); r = await MJ.fromFile(f);
  check(!r.ok && /modifiés/.test(r.err), "fichier ajouté après la signature : refusé");
  const other = crypto.generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" });
  MJ.stop(); MJ = mkMaj(SIG.rawPublic(other));
  f = await archive("1.0.0+2", "signed"); r = await MJ.fromFile(f);
  check(!r.ok && /signature/.test(r.err), "signée avec une autre clé : refusée");
  MJ.stop(); MJ = mkMaj(pub);
  r = await MJ.fromFile(f);
  check(r.ok && link() === "versions/1.0.0+2", "mise à jour signée par la bonne clé : installée");
  MJ.stop();
  MJ = mkMaj("");
  check((await SIG.verifyDir(path.join(B, "versions", "1.0.0+1"), "")).unsigned === true, "sans clé publique configurée : repli (vérification par empreinte seulement)");
  MJ.stop();
  await wait(1500);   // (le gardien des mises à jour, lancé en arrière-plan, se termine)

  // ---------- voisins UDP ----------
  const { createTelephone } = require("./telephone");
  const TEL = createTelephone({ S: { cfg: { name: "x" }, port: 1 }, udp: false });
  check(TEL.voisins().length === 0, "voisins : rien au départ");
  TEL.stop();

  console.log(`Sécurité : ${ok} OK, ${ko} échec(s)`);
  try { fs.rmSync(T, { recursive: true, force: true }); } catch (_) {}
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.log("ERREUR", e); process.exit(1); });
