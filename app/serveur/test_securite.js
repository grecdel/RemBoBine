// Tests de sécurité du serveur de la maison : node app/serveur/test_securite.js
//  1. « la TV elle-même » : une page web étrangère (même PC) ou un « DNS rebinding » ne passent pas pour l'écran ;
//  2. le code d'appairage n'est envoyé qu'à l'écran de la TV (jamais aux téléphones ni aux invités) ;
//  3. force brute : 3 essais par code, blocage après 10 erreurs (codes et invitations) ;
//  4. invités : liste fermée d'adresses, sauvegardes de jeux séparées de celles de la famille ;
//  5. fichiers piégés : liste .m3u vers /etc, liens symboliques (sous-titres, paroles, aperçus) ;
//  6. sauvegarde piégée : elle ne peut pas ajouter d'appareil relié ;
//  7. mises à jour : signature Ed25519 obligatoire dès qu'une clé publique est configurée ;
//  8. déni de service simple : corps énorme, trop de conversions vidéo en même temps ; voisins UDP ;
//  9. un téléphone relié ne lit pas le mot de passe de Rembobine OS et n'allume pas SSH (seulement la TV) ;
// 10. réseaux : seulement la maison (réseaux privés, Tailscale) ; appairage en JSON seulement ; blocage par adresse ;
//     appareils oubliés après 90 jours sans nouvelles.
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
const PASSF = path.join(T, "mot-de-passe"); fs.writeFileSync(PASSF, "MDP-DE-REMBOBINE-OS");
const sysRuns = [];   // commandes système demandées (faux systemctl/sudo : rien n'est vraiment lancé)
const fakeRun = (cmd, args) => { sysRuns.push([cmd, ...(args || [])].join(" ")); return { status: 0, stdout: "inactive\n" }; };
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
  const S = createServer({ port: PORT, webDir: path.join(__dirname, "..", "..", "web"), dataDir: path.join(T, "data"), mediaRoots: [M], mpv: "/nonexistent", retroarch: "/nonexistent", version: "test", voisins: false, kioskKey: "cle-de-l-ecran",
    os: { passFile: PASSF, run: fakeRun, which: (x) => (x === "smbd" ? "/usr/sbin/smbd" : "") } });
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

  // ---------- liens de lecture signés (« ?lk= » à la place de la clé dans les adresses des fichiers) ----------
  const L1 = (await req("/api/lien", { tok })).json, LG = (await req("/api/lien", { tok: gt })).json;
  check(L1 && /^[0-9a-f]{16}\.\d+\.[0-9a-f]{32}$/.test(L1.lien) && L1.until > Date.now() + 6 * 86400000, "lien de lecture : donné à un appareil relié, valable 7 jours");
  check(LG && LG.lien && LG.until <= Date.now() + 2 * 86400000 + 5000, "lien d'un invité : jamais plus long que son invitation");
  check(!new RegExp(tok).test(L1.lien), "le lien ne contient pas la clé d'appairage");
  check((await req(`/media/${film.id}?lk=${L1.lien}`)).status === 200, "lien de lecture : ouvre la vidéo");
  check((await req(`/media/${film.id}?lk=${L1.lien}`, { method: "HEAD" })).status === 200, "lien de lecture : HEAD accepté (lecteurs vidéo)");
  check((await req(`/api/library?lk=${L1.lien}`)).status === 401 && (await req(`/api/config?lk=${L1.lien}`)).status === 401, "lien de lecture : n'ouvre pas l'API (bibliothèque, réglages)");
  check((await req(`/media/${film.id}?lk=${L1.lien}`, { body: {} })).status === 401, "lien de lecture : lecture seule (pas de POST)");
  const [li, le, ls] = L1.lien.split(".");
  check((await req(`/media/${film.id}?lk=${li}.${Number(le) + 999}.${ls}`)).status === 401, "lien de lecture : date de fin changée = refusé");
  const oldExp = Math.floor(Date.now() / 1000) - 10, oldSig = crypto.createHmac("sha256", S.cfg.secret).update(`lien:${li}.${oldExp}`).digest("hex").slice(0, 32);
  check((await req(`/media/${film.id}?lk=${li}.${oldExp}.${oldSig}`)).status === 401, "lien de lecture expiré : refusé");
  check((await req(`/media/${film.id}?lk=${"0".repeat(16)}.${le}.${ls}`)).status === 401, "lien de lecture d'un autre appareil : refusé");
  await req(`/api/saves/${game.id}/srm/0?profil=Tom&at=10`, { raw: Buffer.from("SAUVE-DE-TOM"), tok });
  check((await req(`/api/saves/${game.id}/srm/0?profil=Tom`, { tok: gt })).status === 404, "invité : ne lit pas la sauvegarde de Tom");
  await req(`/api/saves/${game.id}/srm/0?profil=Tom&del=1`, { tok: gt, method: "POST" });
  check((await req(`/api/saves/${game.id}/srm/0?profil=Tom`, { tok })).buf.toString() === "SAUVE-DE-TOM", "invité : n'efface pas la sauvegarde de Tom");
  check((await req(`/api/saves/${game.id}/srm/0?profil=Tom&at=20`, { raw: Buffer.from("A MOI"), tok: gt })).json.ok, "invité : garde ses propres sauvegardes");
  check((await req(`/api/saves/${game.id}/srm/0?profil=Tom`, { tok })).buf.toString() === "SAUVE-DE-TOM", "… à part : celle de Tom n'est pas écrasée");
  check(!gs.ev.some((e) => e.type === "pair" || e.type === "key"), "invité : ne reçoit ni code d'appairage ni texte tapé");
  check(await refused(`/api/jeux/bios/${game.id}/scph5501.bin`) && await refused(`/api/jeux/bios/${game.id}`), "invité : ne télécharge pas les BIOS des consoles de la maison");
  check((await req(`/api/jeux/bios/${game.id}/scph5501.bin`, { tok })).status === 404, "… la famille, si (ici : pas de BIOS pour ce jeu → 404, pas 403)");
  check((await req(`/api/jeux/cht/${game.id}`, { tok: gt })).status === 200, "invité : les codes de triche restent permis (jouer)");

  // ---------- 9. Rembobine OS : mot de passe et SSH seulement sur la TV ----------
  const shPhone = (await req("/api/share", { tok })).json;
  check(shPhone && shPhone.installed && !shPhone.pass && shPhone.passTv && !JSON.stringify(shPhone).includes("MDP-DE-REMBOBINE-OS"), "téléphone relié : le mot de passe de Rembobine OS n'est PAS envoyé");
  check((await local("/api/share")).json.pass === "MDP-DE-REMBOBINE-OS", "écran de la TV : le mot de passe est affiché");
  sysRuns.length = 0;
  const sshPhone = (await req("/api/dev", { body: { action: "ssh", on: true }, tok })).json;
  check(sshPhone && sshPhone.ok === false && sshPhone.tv && !sysRuns.some((c) => /ssh/.test(c)), "téléphone relié : n'allume pas SSH (rien n'est lancé)");
  const shareOn = (await req("/api/share", { body: { on: true }, tok })).json;
  check(shareOn && shareOn.ok === false && !sysRuns.some((c) => /smbd/.test(c)), "téléphone relié : n'allume pas le partage réseau");
  check((await local("/api/dev", { body: { action: "ssh", on: true } })).json.ok === true && sysRuns.some((c) => /enable --now ssh/.test(c)), "écran de la TV : SSH s'allume");
  check(await refused("/api/share") && await refused("/api/dev"), "invité : ni partage ni SSH");
  // partage réseau (Samba) : allumé par défaut, se coupe et se rallume sur l'écran de la TV, choix gardé au redémarrage
  sysRuns.length = 0;
  const shareOff = (await local("/api/share", { body: { on: false } })).json;
  const sudoOff = sysRuns.filter((c) => c.startsWith("sudo "));
  check(shareOff && shareOff.ok === true && ["smbd", "nmbd", "wsdd", "rembobine-partage-annonce"].every((x) => sudoOff.includes("sudo -n /usr/bin/systemctl disable --now " + x)), "écran de la TV : le partage se coupe (smbd, nmbd, wsdd, annonce Bonjour)");
  check(!sysRuns.some((c) => / stop /.test(c + " ")) && sudoOff.every((c) => / disable --now /.test(c)), "… avec « disable » : il reste coupé après un redémarrage");
  sysRuns.length = 0;
  const shareBack = (await local("/api/share", { body: { on: true } })).json;
  const sudoOn = sysRuns.filter((c) => c.startsWith("sudo "));
  check(shareBack && shareBack.ok === true && ["smbd", "nmbd", "wsdd", "rembobine-partage-annonce"].every((x) => sudoOn.includes("sudo -n /usr/bin/systemctl enable --now " + x)), "écran de la TV : le partage se rallume (et reste allumé au redémarrage)");
  // chaque commande lancée avec sudo est écrite telle quelle dans les sudoers de Rembobine OS (aucune commande large)
  {
    const bos = fs.readFileSync(path.join(__dirname, "..", "..", "ci", "build_os.sh"), "utf8");
    const blk = (bos.match(/rembobine-systeme" >\/dev\/null <<'EOF'\n([\s\S]*?)\nEOF/) || [])[1] || "";
    const permis = new Set(blk.split("\n").flatMap((l) => (l.split("NOPASSWD:")[1] || "").split(",").map((x) => x.trim())).filter(Boolean));
    await local("/api/dev", { body: { action: "ssh", on: false } });
    const lances = [...new Set([...sudoOff, ...sudoOn, ...sysRuns.filter((c) => c.startsWith("sudo "))].map((c) => c.replace(/^sudo -n /, "")))];
    check(permis.size >= 6 && lances.length >= 6 && lances.every((c) => permis.has(c)), "sudoers : partage et SSH n'utilisent que des commandes exactes permises (" + lances.filter((c) => !permis.has(c)).join(" | ") + ")");
    check(![...permis].some((c) => /\*|ALL$|^\/usr\/bin\/systemctl$/.test(c)), "sudoers : aucune commande large (ni *, ni ALL, ni systemctl seul)");
    check(/systemctl enable smbd nmbd/.test(bos), "Rembobine OS : le partage est allumé par défaut");
    check(permis.has("/usr/bin/systemctl disable --now rembobine-partage-annonce") && permis.has("/usr/bin/systemctl enable --now rembobine-partage-annonce"), "sudoers : l'annonce Bonjour se coupe et se rallume par une règle exacte");
    check(/systemctl enable rembobine-partage-annonce/.test(bos) && /ExecStop=\/usr\/bin\/rm -f \/etc\/avahi\/services\/rembobine-partage\.service/.test(bos) && !/tee "\$R\/etc\/avahi\/services\//.test(bos), "Rembobine OS : l'annonce Bonjour est posée et retirée par son unité (allumée par défaut, pas de fichier fixe)");
  }
  // mises à jour pas encore signées (pas de clé publique) : un fichier ne s'installe que depuis l'écran de la TV
  const upPhone = (await req("/api/update/upload", { body: { x: 1 }, tok })).json, filePhone = (await req("/api/update", { body: { action: "file", file: "/media/usb/Rembobine-Linux-PC.tar.gz" }, tok })).json;
  // avec la clé publique de maj-cle.js, le téléphone peut envoyer un fichier : il ne s'installe que bien signé (vérifié plus bas)
  const avecCle = !!require("./maj-cle").PUBLIC_KEY;
  check(upPhone && upPhone.ok === false && filePhone && filePhone.ok === false && (avecCle ? !upPhone.tv && !filePhone.tv : upPhone.tv && filePhone.tv),
    avecCle ? "téléphone relié, mises à jour signées : un fichier non signé n'est pas installé" : "téléphone relié, mises à jour non signées : ni envoi ni installation d'un fichier");

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
  const pg = await req("/");
  check(pg.status === 200 && /frame-ancestors 'self'/.test(pg.headers["content-security-policy"] || "") && pg.headers["x-frame-options"] === "SAMEORIGIN", "la page ne s'affiche pas dans le cadre d'un autre site");
  check((await req("/media/%E0%A4%A")).status === 400, "adresse mal formée : réponse 400 (pas d'« erreur interne » dans le journal)");
  S.transcodes = 4;
  check((await req(`/media/${film.id}?mode=transcode`, { tok })).status === 503, "trop de conversions vidéo en même temps : refusé poliment");
  S.transcodes = 0;

  // brute force : après 10 erreurs, tout est bloqué (même un bon code), et la TV est prévenue
  await local("/api/pair/request", { body: { name: "X" } });
  for (let i = 0; i < 12; i++) { if (!S.pairing) { S.guard.lastReq = 0; await local("/api/pair/request", { body: { name: "X" } }); } await req("/api/pair", { body: { code: S.pairing && S.pairing.code === "0000" ? "1111" : "0000" } }); }
  const gl = S.guard.ips.get(lan.address);
  check(gl && gl.until > Date.now(), "10 erreurs : appairage bloqué pour cette adresse");
  check(/Trop d'essais/.test((await req("/api/pair/request", { body: {} })).json.err || "") && /Trop d'essais/.test((await req("/api/pair", { body: { invite: "AB12CD" } })).json.err || ""), "bloqué aussi pour les invitations, même avec le bon code");
  check(tv.ev.some((e) => e.type === "alert" && /essayé beaucoup de codes/.test(e.msg)), "la TV prévient qu'on a essayé beaucoup de codes");
  S.guard.lastReq = 0; await local("/api/pair/request", { body: { name: "Tablette" } });
  const tab = await local("/api/pair", { body: { code: S.pairing && S.pairing.code, name: "Tablette" } });
  check(tab.json && tab.json.ok && tab.json.token, "… les AUTRES appareils de la maison peuvent toujours se relier (blocage par adresse, plus global)");

  // ---------- 10. réseaux, format des demandes, appareils oubliés ----------
  const { localNet } = require("./serveur");
  check(["192.168.1.20", "10.0.0.5", "172.20.1.1", "100.101.102.103", "127.0.0.1", "::1", "fe80::1", "::ffff:192.168.0.9"].every(localNet), "réseaux de la maison, cette machine et Tailscale : acceptés");
  check(!["8.8.8.8", "172.32.0.1", "100.128.0.1", "1.2.3.4", "2001:4860::8888", "::ffff:8.8.8.8", ""].some(localNet), "adresses d'internet : refusées");
  S.guard.lastReq = 0; S.guard.ips.clear(); await local("/api/pair/request", { body: { name: "X" } });
  const form = await req("/api/pair", { raw: "code=" + (S.pairing && S.pairing.code), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const txt = await req("/api/pair", { raw: JSON.stringify({ code: S.pairing && S.pairing.code }), headers: { "Content-Type": "text/plain" } });
  check(form.status === 415 && txt.status === 415 && !!S.pairing, "appairage : formulaire ou texte d'un site web refusés (JSON seulement), sans compter d'erreur");
  check((await req("/api/pair/request", { raw: "{}", headers: { "Content-Type": "text/plain" } })).status === 415, "demande de code : JSON seulement");
  const oldTok = "jeton-tres-ancien", sha2 = (x) => crypto.createHash("sha256").update(x).digest("hex");
  S.cfg.tokens.push({ hash: sha2(oldTok), name: "Vieux téléphone", t: Date.now() - 200 * 86400000, seen: Date.now() - 100 * 86400000 });
  check((await req("/api/library", { tok: oldTok })).status === 401 && !S.cfg.tokens.some((x) => x.name === "Vieux téléphone"), "appareil pas vu depuis 90 jours : oublié (à relier de nouveau)");
  check((await req("/api/library", { tok })).status === 200, "… un appareil vu récemment reste relié");
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
  // l'appli livrée : aucune option « publicKey » → la clé de maj-cle.js (la vraie), qui refuse la clé jetable de l'essai
  const VRAIE = require("./maj-cle").PUBLIC_KEY;
  let lisible = false; try { SIG.publicKeyOf(VRAIE); lisible = true; } catch (_) {}
  check(lisible && VRAIE !== pub, "maj-cle.js : une vraie clé publique Ed25519, différente de la clé d'essai");
  MJ = mkMaj(undefined);
  f = await archive("1.0.0+3", "signed"); r = await MJ.fromFile(f);
  check(!r.ok && /fausse/.test(r.err) && link() === "versions/1.0.0+2", "appli livrée (clé de maj-cle.js) : version signée par une clé d'essai refusée");
  f = await archive("1.0.0+3", "unsigned"); r = await MJ.fromFile(f);
  check(!r.ok && /pas signée/.test(r.err) && link() === "versions/1.0.0+2", "appli livrée (clé de maj-cle.js) : version non signée refusée");
  MJ.stop();
  // la clé d'essai ne passe que par le code des essais : ni variable d'environnement, ni réglage, ni option de l'appli livrée
  const src = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
  check(/publicKey: opt\.updateKey,/.test(src("os.js")) && !/process\.env\.[A-Z_]*(CLE|KEY|SIGN)/i.test(src("maj.js") + src("os.js") + src("maj-signature.js") + src("maj-cle.js")),
    "la clé de vérification ne se lit dans aucune variable d'environnement (maj.js, os.js, maj-signature.js, maj-cle.js)");
  const mainJs = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8"), srvJs = src("serveur.js");
  check(!/updateKey|publicKey/.test(mainJs) && !/updateKey|publicKey/.test(srvJs), "l'appli (main.js, serveur.js) ne donne jamais d'autre clé : celle de maj-cle.js s'applique");
  MJ = mkMaj("");
  // sans signature : le dossier Rembobine (partagé en écriture par Samba) n'est pas une source de mises à jour
  fs.mkdirSync(path.join(M, "MisesAJour"), { recursive: true });
  fs.writeFileSync(path.join(M, "Rembobine-Linux-PC.tar.gz"), "x"); fs.writeFileSync(path.join(M, "MisesAJour", "Rembobine-Linux-PC.tar.gz"), "x");
  check(!MJ.usbArchives().some((x) => x.file.startsWith(M)) && !(await MJ.fromFile(path.join(M, "MisesAJour", "Rembobine-Linux-PC.tar.gz"))).ok, "sans clé publique : rien n'est pris dans le dossier partagé (Samba), seulement sur une clé USB");
  MJ.stop(); MJ = mkMaj(pub);
  check(MJ.usbArchives().some((x) => x.file === path.join(M, "MisesAJour", "Rembobine-Linux-PC.tar.gz")), "avec la clé publique : le dossier partagé redevient une source (tout est vérifié par la signature)");
  MJ.stop(); MJ = mkMaj("");
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
