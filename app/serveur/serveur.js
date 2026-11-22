// Rembobine — le serveur de la maison (Raspberry « Rembobine OS », ou PC).
// Il sert la bibliothèque aux autres appareils (téléphone, tablette, PC), lit les films sur la TV,
// et reçoit les ordres de la télécommande. Aucune dépendance : seulement Node (fourni par Electron).
//
// Sécurité : un appareil doit être APPAIRÉ (code à 4 chiffres affiché sur la TV) pour accéder aux médias
// et aux commandes ; il reçoit alors une clé (jeton) gardée sur cet appareil. L'écran de la TV lui-même
// (même machine) n'a pas besoin de code. Rien n'est ouvert sur internet : c'est le réseau de la maison,
// ou Tailscale pour les amis.
"use strict";
const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const net = require("net");
const crypto = require("crypto");
const zlib = require("zlib");
const GZ = new Map();   // page et scripts déjà compressés (gzip), par fichier
const { spawn, spawnSync } = require("child_process");
const { scanLibrary, MIME, coverSig, coverUrl, setSecret } = require("./bibliotheque");
const { createFiches } = require("./fiches");
const BP = require("./bibliotheque_plus");
const { createInstaller } = require("./installer");
const V = require("./video");
const CS = require("./consoles");
const PF = require("./profils");
const { createMusique } = require("./musique");
const { createJeux, biosFind } = require("./jeux");
const { createLecture } = require("./lecture");
const { createOs } = require("./os");
const { createTelephone } = require("./telephone");
const { createMaison } = require("./maison");
const { createModuleProgres } = require("./module_progres");
const { createCollection } = require("./collection");
const { createFichePlus } = require("./fiche_plus");
const { createMemoire } = require("./memoire");

const API = 1;

function createServer(opt = {}) {
  const S = {
    port: opt.port || 8080,
    web: opt.webDir,                                   // dossier de la page Rembobine (index.html)
    data: opt.dataDir || path.join(os.homedir(), ".config", "rembobine", "serveur"),
    roots: opt.mediaRoots || [path.join(os.homedir(), "Rembobine")],
    version: opt.version || "1.0.0",
    log: [], clients: new Set(), pairing: null, lib: { items: [], byId: new Map(), t: 0 }, scan: { running: false, files: 0, t: 0 },
    player: null, cfg: null, rooms: new Map(),
    // clé de l'écran de cette machine : l'application de bureau l'ajoute à ses propres demandes (main.js),
    // pour qu'une page web ouverte dans un navigateur du même PC ne passe pas pour « la TV elle-même »
    kioskKey: opt.kioskKey || crypto.randomBytes(24).toString("hex"),
    // essais de codes (appairage, invitations) : chaque adresse est bloquée de plus en plus longtemps après trop
    // d'erreurs (ips : adresse → { fails, locks, until }) ; les autres appareils de la maison ne sont pas gênés
    guard: { ips: new Map(), lastReq: 0 },
    transcodes: 0
  };
  // ménage des salons : sans nouvelles depuis 20 s, on considère la personne partie
  const roomSweep = setInterval(() => { const now = Date.now(); for (const [room, R] of S.rooms) { let ch = false; for (const [peer, x] of R) if (now - x.t > 20000) { R.delete(peer); ch = true; } if (!R.size) S.rooms.delete(room); if (ch) emitRoom(room); } }, 5000);
  if (roomSweep.unref) roomSweep.unref();
  fs.mkdirSync(S.data, { recursive: true });
  const cfgFile = path.join(S.data, "serveur.json");
  const progFile = path.join(S.data, "progression.json");
  CS.setBundled(opt.emusDir);   // émulateurs livrés avec l'application
  require("./outils").setDir(opt.emusDir);   // ffmpeg, ffprobe, mpv livrés avec l'application
  S.cfg = readJson(cfgFile, { name: os.hostname() || "Rembobine", tokens: [], idleMin: 20, tmdbKey: "", cards: {} });
  S.prog = readJson(progFile, {});
  const saveCfg = () => writeJson(cfgFile, S.cfg);
  // clé secrète de la maison (signature des jaquettes), gardée d'un démarrage à l'autre
  if (!S.cfg.secret) { S.cfg.secret = crypto.randomBytes(16).toString("hex"); saveCfg(); }
  setSecret(S.cfg.secret);
  const saveProg = () => writeJson(progFile, S.prog);

  // fiches et jaquettes cherchées sur internet (quand le serveur est connecté)
  const FI = createFiches({ dataDir: S.data, log: (l, m) => log(l, m), bases: opt.ficheBases, fetch: opt.fetch, delay: opt.ficheDelay, mbDelay: opt.mbDelay, version: S.version });
  S.fiches = FI;
  // activée par défaut (le propriétaire l'a demandé : connecté à internet, Rembobine va chercher les infos et les jaquettes
  // d'après le titre) ; on la coupe dans Paramètres → Métadonnées. REMBOBINE_FICHES=0 : jamais (essais sans internet).
  const fichesOn = () => process.env.REMBOBINE_FICHES !== "0" && S.cfg.fiches !== false;
  S.fichesOn = fichesOn;
  let ficheRetry = null;
  function ficheSearch() {
    // « Corriger la fiche » reste un geste volontaire, même option coupée
    if (!fichesOn()) return;
    const refresh = (n) => { FI.apply(S.lib.items, coverUrl, S.lib.byId); S.lib.t = Date.now(); emit({ type: "fiches", n }); };
    return FI.enrich(S.lib.items, S.cfg.tmdbKey || "", (n) => { refresh(n);
      if (n) emit({ type: "scan", running: false, msg: `Fiches et jaquettes : ${n} trouvée${n > 1 ? "s" : ""} sur internet.` });
      // un site encombré a demandé d'attendre : on repasse dans un quart d'heure pour ce qui manque
      if (FI.pending(S.lib.items) && !ficheRetry) { ficheRetry = setTimeout(() => { ficheRetry = null; ficheSearch(); }, 15 * 60000); if (ficheRetry.unref) ficheRetry.unref(); } }, refresh)
      .then(async () => { if (S.cfg.tmdbKey && await BPR.saisons.fetchAll(S.lib.items, S.cfg.tmdbKey)) { BPR.saisons.apply(S.lib, coverUrl); S.lib.t = Date.now(); } }).catch(() => {});
  }
  S.ficheSearch = ficheSearch;
  // bibliothèque, suite : affiches proposées, renommage annulable, saisons (bibliotheque_plus.js)
  const BPR = BP.createRoutes(S, { send: (...a) => send(...a), body: (r) => body(r), coverUrl, saveProg: () => saveProg(), fetch: opt.fetch, bases: opt.ficheBases });
  // installation automatique des émulateurs officiels et du système de la PS3 (site de Sony)
  const IN = createInstaller({ roots: S.roots, emit: (ev) => emit(ev), log: (l, m) => log(l, m), bases: opt.installBases, fetch: opt.fetch });
  S.installer = IN;
  // profils de la famille : « Continuer à regarder » partagé entre appareils
  const PR = PF.createProfils({ dataDir: S.data, emit: (ev) => emit(ev) });
  S.profils = PR;
  // paroles des chansons et égaliseur de la musique sur la TV
  const MU = createMusique({ cfg: () => S.cfg, saveCfg: () => saveCfg(), lib: () => S.lib, player: () => S.player, mpvSend: (c) => mpvSend(c), ffprobe: () => V.bins().ffprobe });
  const ficheTimer = setInterval(() => { ficheSearch(); }, 6 * 3600 * 1000); if (ficheTimer.unref) ficheTimer.unref();
  // lecture vidéo : génériques repérés, vignettes, versions préparées, captures, réglages de mpv (lecture.js)
  const LX = createLecture({ S, mpvSend: (c) => mpvSend(c), log: (l, m) => log(l, m), next: () => playerCmd({ cmd: "next" }), stop: () => stopPlayer(), saveProg: () => saveProg() });
  S.lecture = LX;
  function log(level, msg) { S.log.push({ t: Date.now(), level, msg: String(msg).slice(0, 500) }); if (S.log.length > 400) S.log.splice(0, S.log.length - 400); }
  function emitRoom(room) { const R = S.rooms.get(room); emit({ type: "room", room, peers: R ? [...R.entries()].map(([peer, x]) => ({ peer, presence: x.presence, name: x.name })) : [] }); }
  function emit(ev) { const line = `data: ${JSON.stringify(ev)}\n\n`; for (const c of S.clients) { try { c.write(line); } catch (_) {} } }
  S.emit = emit;
  // seulement l'écran de la TV elle-même (manette virtuelle du téléphone : le moins de trafic possible)
  // (S.tvTaps : l'application de bureau y écoute la manette du téléphone pour la relayer au module, sur la même machine)
  S.tvTaps = new Set();
  function emitTv(ev) { const line = `data: ${JSON.stringify(ev)}\n\n`; for (const c of S.clients) if (c.rbbTv) { try { c.write(line); } catch (_) {} } for (const f of S.tvTaps) { try { f(ev); } catch (_) {} } }
  // les jeux : sauvegardes synchronisées, manette du téléphone, BIOS, triche, aperçus, tournoi (voir jeux.js)
  const JX = createJeux({ dataDir: S.data, roots: S.roots, emit, emitTv, lib: () => S.lib, tvOn: () => [...S.clients].some((c) => c.rbbTv) });
  // téléphone : les autres Rembobine de la maison, le volume de la télé, les séances programmées (voir telephone.js)
  const TEL = createTelephone({ S, emit, log: (l, m) => log(l, m), saveCfg: () => saveCfg(), playerCmd: (b) => playerCmd(b), which: (x) => which(x), udp: opt.voisins, udpPort: opt.voisinsPort, udpTargets: opt.voisinsTargets, announceMs: opt.voisinsMs });
  S.tel = TEL;

  // ---------- bibliothèque ----------
  // gardée sur le disque du serveur (memoire.js) : relue au démarrage avant d'écouter, réécrite après chaque analyse ;
  // l'analyse tourne en arrière-plan, ne relit pas ce qui n'a pas changé, et garde (hors ligne) les titres d'un disque débranché
  const MEM = createMemoire({ dataDir: S.data, log: (l, m) => log(l, m), mounts: opt.mounts });
  S.memoire = MEM;
  const memCheck = () => coverSig("bibliotheque-gardee");   // (autre clé secrète : les adresses des jaquettes ne vaudraient plus rien)
  // empreinte de ce que voient les appareils : rien n'a changé → pas besoin que la page se remette à jour
  const pubSigOf = (items) => require("crypto").createHash("sha1").update(JSON.stringify(items.map((x) => x.pub))).digest("hex");
  let scanRun = null, scanNext = null, scanNextOpt = null;
  // une analyse à la fois ; une demande pendant qu'elle tourne en lance UNE autre juste après (rien n'est perdu :
  // disque rebranché pendant l'analyse du démarrage, renommage…). o.full : tout relire ; o.quiet : pas de message si rien n'a changé
  function rescan(o = {}) {
    if (scanRun) {
      scanNextOpt = { full: !!(o.full || (scanNextOpt && scanNextOpt.full)), quiet: !!(o.quiet && (!scanNextOpt || scanNextOpt.quiet)) };
      return scanNext || (scanNext = scanRun.then(() => { const x = scanNextOpt; scanNext = scanNextOpt = null; return rescan(x); }));
    }
    return (scanRun = scanOnce(o).finally(() => { scanRun = null; }));
  }
  async function scanOnce(o) {
    S.scan = { running: true, files: 0, t: Date.now() };
    emit({ type: "scan", running: true });
    try {
      const t0 = Date.now(), prev = S.lib;
      const lib = await scanLibrary(S.roots, (n) => { S.scan.files = n; }, { memo: MEM.memo, full: !!o.full });
      BP.enrich(lib, { cleanTitle: require("./bibliotheque").cleanTitle, coverUrl, vue: lib.vue }); BPR.saisons.apply(lib, coverUrl);
      FI.apply(lib.items, coverUrl, lib.byId);
      PF.applyNfo(lib.items, lib.vue);   // âge conseillé lu dans les .nfo (passe devant internet)
      const ch = MEM.merge(lib, prev, S.roots);   // disque débranché : ses titres restent, hors ligne
      const V = lib.vue; MEM.memo = V.memo;
      const pubSig = pubSigOf(lib.items);
      const changed = pubSig !== S.lib.pubSig;
      S.lib = { items: lib.items, byId: lib.byId, t: changed || !S.lib.t ? Date.now() : S.lib.t, at: Date.now(), pubSig };
      MEM.save(S.lib, memCheck());
      setTimeout(() => { try { ficheSearch(); } catch (_) {} }, 1000);
      const warm = setTimeout(() => { try { LX.warm(); } catch (_) {} }, 60000); if (warm.unref) warm.unref();
      S.scan = { running: false, files: S.scan.files, t: Date.now(), found: lib.items.length, ms: Date.now() - t0, offline: ch.kept, full: !!o.full, disque: { ...V.n } };
      const n = lib.items.length, pl = (k, a, b = a + "s") => (k > 1 ? b : a), names = (s) => [...s].map((d) => `« ${d} »`).join(", ");
      log("info", `analyse : ${n} éléments en ${Date.now() - t0} ms (dossiers lus : ${V.n.dossiers}, fichiers examinés : ${V.n.fichiers}, souvenirs repris : ${V.n.souvenirs}, relus : ${V.n.relus}${ch.kept ? `, hors ligne : ${ch.kept}` : ""})`);
      // le message à la page : comme avant (« Bibliothèque à jour »), plus le disque parti ou revenu ; rien au démarrage
      // ni au coup d'œil régulier si rien n'a bougé (la page se met quand même à jour en silence si une fiche a changé)
      let msg = `Bibliothèque à jour : ${n} élément${pl(n, "")}.`;
      if (ch.off) msg += ` Disque ${names(ch.offDisks)} débranché : ${pl(ch.off, "son titre reste", `ses ${ch.off} titres restent`)} dans la bibliothèque, hors ligne.`;
      if (ch.back) msg += ` Disque ${names(ch.backDisks)} de retour : ${ch.back} titre${pl(ch.back, "")} de nouveau disponible${pl(ch.back, "")}.`;
      const seen = ch.added || ch.removed || ch.off || ch.back;
      emit({ type: "scan", running: false, changed, ...(o.quiet && !seen ? {} : { msg }) });
    } catch (e) { S.scan = { ...S.scan, running: false }; log("error", "analyse : " + e.message); }
  }
  S.rescan = rescan;

  // ---------- appairage ----------
  // « la TV elle-même » : une demande venue de cette machine, adressée à un nom local (pas de « DNS rebinding »),
  // et qui ne vient pas d'une page web étrangère (navigateur du même PC : en-têtes Origin / Sec-Fetch-Site).
  // L'écran de Rembobine (application de bureau, page file://) se reconnaît à sa clé (en-tête ajouté par main.js).
  const loopback = (req) => { const a = req.socket.remoteAddress || ""; return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1"; };
  const isLocal = (req) => {
    if (req.rbbLocal === undefined) req.rbbLocal = loopback(req) && localHost(req.headers.host) && (safeEq(req.headers["x-rembobine-ecran"] || "", S.kioskKey) || sameMachinePage(req, S.port));
    return req.rbbLocal;
  };
  function tokenOf(req, url) {
    const h = req.headers.authorization || ""; if (h.startsWith("Bearer ")) return h.slice(7).trim();
    return url.searchParams.get("tok") || "";
  }
  // Liens de lecture signés (« ?lk= ») : dans les adresses des médias (vidéo, sous-titres, vignettes, musique, photos,
  // copie hors ligne…), à la place de la clé d'appairage. Ils ne servent qu'à LIRE ces fichiers (GET/HEAD, liste
  // LIEN_PATHS), expirent au bout de 7 jours et cessent de marcher dès que l'appareil est oublié. Une adresse qui
  // traîne dans un journal (mpv, ffmpeg), l'historique ou un téléchargement ne donne donc ni la télécommande, ni
  // les réglages, ni un accès durable. Forme : <16 premiers chiffres de l'empreinte de l'appareil>.<fin>.<signature>.
  const lienSig = (id, exp) => crypto.createHmac("sha256", String(S.cfg.secret || "")).update(`lien:${id}.${exp}`).digest("hex").slice(0, 32);
  function lienPour(rec) {
    const id = String(rec.hash || "").slice(0, 16); if (!/^[0-9a-f]{16}$/.test(id)) return null;
    let exp = Math.floor(Date.now() / 1000) + LIEN_DUREE; if (rec.until) exp = Math.min(exp, Math.floor(rec.until / 1000));
    return { lien: `${id}.${exp}.${lienSig(id, exp)}`, until: exp * 1000 };
  }
  function lienRec(req, url) {
    const k = url.searchParams.get("lk"); if (!k || (req.method !== "GET" && req.method !== "HEAD") || !LIEN_PATHS.test(url.pathname)) return null;
    const m = /^([0-9a-f]{16})\.(\d{9,11})\.([0-9a-f]{32})$/.exec(k); if (!m) return null;
    if (Number(m[2]) * 1000 < Date.now() || !safeEq(m[3], lienSig(m[1], m[2]))) return null;
    const rec = S.cfg.tokens.find((x) => String(x.hash || "").startsWith(m[1]));
    if (!rec || (rec.until && rec.until < Date.now())) return null;
    return rec;
  }
  function who(req, url) {
    if (isLocal(req)) return { local: true };
    const t = tokenOf(req, url); if (!t) return lienRec(req, url);
    const hash = sha(t);
    const rec = S.cfg.tokens.find((x) => safeEq(x.hash, hash));
    if (rec && rec.until && rec.until < Date.now()) return null;   // invitation expirée
    if (!rec) return null;
    // un appareil relié qui ne s'est pas montré depuis 90 jours (téléphone perdu, vendu, oublié) est oublié :
    // il faudra le relier de nouveau avec le code affiché sur la TV
    const now = Date.now(), last = rec.seen || rec.t || 0;
    if (!rec.until && last && now - last > DEVICE_TTL) { S.cfg.tokens = S.cfg.tokens.filter((x) => x !== rec); saveCfg(); log("info", `appareil oublié (pas vu depuis 90 jours) : ${rec.name || "?"}`); return null; }
    const old = rec.seen || 0; rec.seen = now; if (now - old > 86400000) saveCfg();   // « vu » gardé au plus une fois par jour
    return rec;
  }
  const authed = (req, url) => !!who(req, url);
  // force brute : 3 essais par code, un nouveau code toutes les 10 s au plus, et après 10 erreurs (codes ou invitations)
  // L'ADRESSE qui se trompe est bloquée 5 min, puis 10, 20, 40… (24 h au plus) ; la TV est prévenue. Les autres
  // appareils de la maison peuvent toujours se relier (avant : un seul site piégé bloquait tout le monde 24 h).
  const G = S.guard;
  const ipOf = (req) => String((req.socket && req.socket.remoteAddress) || "?").replace(/^::ffff:/i, "");
  const guardOf = (req) => { const k = ipOf(req); let g = G.ips.get(k); if (!g) { if (G.ips.size > 500) G.ips.clear(); g = { fails: 0, locks: 0, until: 0 }; G.ips.set(k, g); } return g; };
  const locked = (req) => { const g = G.ips.get(ipOf(req)); return g && Date.now() < g.until ? Math.ceil((g.until - Date.now()) / 60000) : 0; };
  function failed(what, req) {
    const g = guardOf(req);
    if (++g.fails < 10) return;
    g.fails = 0; g.locks++; g.until = Date.now() + Math.min(24 * 3600000, 5 * 60000 * 2 ** (g.locks - 1)); S.pairing = null;
    const min = Math.round((g.until - Date.now()) / 60000);
    log("warn", `trop d'essais (${what}) depuis ${ipOf(req)} : appairage et invitations bloqués ${min} min pour cette adresse`);
    emitTv({ type: "alert", msg: `Quelqu'un a essayé beaucoup de codes (${what}) depuis l'adresse ${ipOf(req)}. Par sécurité, cette adresse ne peut plus se relier pendant ${min} min.` });
  }
  const succeeded = (req) => { G.ips.delete(ipOf(req)); };
  // les demandes d'appairage arrivent en JSON (comme l'envoie la page Rembobine) : un formulaire ou un texte envoyé
  // par un autre site web (sans autorisation préalable du navigateur) est refusé
  const isJson = (req) => /^application\/json\b/i.test(String(req.headers["content-type"] || ""));
  function newPairCode(who) {
    const code = String(crypto.randomInt(0, 10000)).padStart(4, "0");
    S.pairing = { code, who: String(who || "un appareil").slice(0, 40), until: Date.now() + 120000, tries: 0 };
    emitTv({ type: "pair", code, who: S.pairing.who });   // seulement l'écran de la TV : jamais aux téléphones ni aux invités
    log("info", `code d'appairage demandé par ${S.pairing.who}`);
    return code;
  }

  // ---------- lecture sur la TV (mpv) ----------
  const sockPath = process.platform === "win32" ? "\\\\.\\pipe\\rembobine-mpv" : path.join(os.tmpdir(), `rembobine-mpv-${process.pid}.sock`);
  function mpvBin() { return opt.mpv || require("./outils").tool("mpv"); }
  function mpvSend(cmd) {
    // (un message par-dessus le film s'affiche dans le style de Rembobine quand son interface de lecture est là)
    if (S.player && S.player.ui && Array.isArray(cmd) && cmd[0] === "show-text") cmd = ["script-message-to", "rembobine_lecteur", "rembobine-message", String(cmd[1]), String(cmd[2] || 2500)];
    return new Promise((resolve) => {
      if (!S.player) return resolve(null);
      const c = net.connect(sockPath); let buf = ""; const id = Math.floor(Math.random() * 1e9);
      const done = (v) => { try { c.destroy(); } catch (_) {} resolve(v); };
      c.on("connect", () => c.write(JSON.stringify({ command: cmd, request_id: id }) + "\n"));
      c.on("data", (d) => { buf += d; for (const line of buf.split("\n")) { try { const j = JSON.parse(line); if (j.request_id === id) return done(j); } catch (_) {} } });
      c.on("error", () => done(null));
      setTimeout(() => done(null), 1500);
    });
  }
  async function stopPlayer() {
    if (!S.player) return;
    const p = S.player; await mpvSend(["quit"]);
    setTimeout(() => { try { p.proc.kill(); } catch (_) {} }, 800);
  }
  // files : un fichier (film, épisode) ou une liste (album : les pistes ; diaporama : les photos)
  async function playOnTv(files, key, title, o = {}) {
    const bin = mpvBin(); if (!bin) return { ok: false, err: "Le lecteur mpv n'est pas installé sur cet appareil." };
    await stopPlayer();
    const list = Array.isArray(files) ? files : [files], single = list.length === 1 && !o.photos;
    const start = single && (S.prog[key] && S.prog[key].pos > 30 && S.prog[key].pos < (S.prog[key].dur || Infinity) - 60) ? Math.floor(S.prog[key].pos) : 0;
    // le lecteur de cartouches tape des chiffres comme un clavier : dans mpv, ils changeraient le volume ou les couleurs
    const conf = path.join(S.data, "mpv-input.conf");
    try { if (!fs.existsSync(conf)) fs.writeFileSync(conf, [..."0123456789"].map((d) => `${d} ignore\nKP${d} ignore`).join("\n") + "\nENTER ignore\nKP_ENTER ignore\n"); } catch (_) {}
    const args = ["--fs", "--force-window=yes", `--input-ipc-server=${sockPath}`, `--input-conf=${conf}`, "--osd-level=1", `--title=${title}`];
    if (start) args.push(`--start=${start}`);
    if (o.photos) args.push("--image-display-duration=6", "--loop-playlist=inf");
    if (o.track) args.push(`--playlist-start=${o.track}`);
    if (o.kind === "album") args.push(...MU.mpvArgs());   // égaliseur choisi dans Rembobine
    if (single) args.push(...LX.mpvArgs());   // mode nuit gardé d'un film à l'autre
    if (o.args) args.push(...o.args);   // CD audio, DVD : le lecteur de disques à utiliser
    // l'interface de lecture de Rembobine (app/lecteur/rembobine_lecteur.lua) à la place de la barre d'origine de mpv :
    // vrai titre, gros boutons, « Langue » et « Sous-titres » en clair, écran de pause (pas pour un diaporama de photos)
    const lua = path.join(__dirname, "..", "lecteur", "rembobine_lecteur.lua"), ui = !o.photos && fs.existsSync(lua);
    if (ui) {
      const q = (v) => { v = String(v == null ? "" : v).replace(/[\r\n]+/g, " ").slice(0, 200); return `%${Buffer.byteLength(v)}%${v}`; };
      const genre = o.kind === "album" ? "album" : o.kind === "serie" ? "serie" : "film";
      args.push("--osc=no", "--osd-bar=no", "--osd-on-seek=no", `--script=${lua}`,
        `--script-opts=rembobine-titre=${q(title)},rembobine-sous=${q(genre === "serie" ? "Série" : genre === "album" ? "" : "Film")},rembobine-genre=${genre},rembobine-prefs=${q(path.join(S.data, "lecteur-prefs.json"))}`);
    }
    args.push("--", ...list);
    let proc; try { proc = spawn(bin, args, { stdio: "ignore", env: require("./outils").env() }); } catch (e) { return { ok: false, err: String(e) }; }
    const pl = { proc, key, title, start, pos: start, dur: 0, paused: false, id: o.id || key, kind: o.kind || "film", ui };
    S.player = pl;
    // la position est relevée régulièrement : reprise au bon endroit la prochaine fois
    pl.timer = setInterval(async () => {
      if (S.player !== pl) return;
      const [p, d, pa] = await Promise.all([mpvSend(["get_property", "time-pos"]), mpvSend(["get_property", "duration"]), mpvSend(["get_property", "pause"])]);
      if (p && typeof p.data === "number") pl.pos = p.data;
      if (d && typeof d.data === "number") pl.dur = d.data;
      if (pa && typeof pa.data === "boolean") pl.paused = pa.data;
      // position gardée en mémoire toutes les 3 s, écrite sur la carte SD toutes les 15 s (et à la fin) : moins d'usure, moins d'attente du disque
      if (single) { S.prog[key] = { pos: pl.pos, dur: pl.dur, t: Date.now() }; if (Date.now() - (pl.savedAt || 0) >= 15000) { pl.savedAt = Date.now(); saveProg(); } }
      emit({ type: "playing", key, id: pl.id, kind: pl.kind, title, pos: pl.pos, dur: pl.dur, paused: pl.paused });
      if (single) LX.tick(pl);   // générique (début, fin, épisode suivant), minuteur
    }, 3000);
    if (single) LX.started(pl);
    proc.on("exit", () => {
      clearInterval(pl.timer); LX.stopped(pl);
      if (S.player === pl) { S.player = null; emit({ type: "stopped", key, id: pl.id, title }); }
      if (pl.dur && pl.pos > pl.dur - 90) { S.prog[key] = { pos: 0, dur: pl.dur, t: Date.now(), seen: true }; saveProg(); }
      else if (single && pl.savedAt) saveProg();   // dernière position relevée
    });
    proc.on("error", (e) => { log("error", "mpv : " + e.message); if (S.player === pl) S.player = null; });
    log("info", `lecture sur la TV : ${title}`);
    emit({ type: "playing", key, id: pl.id, kind: pl.kind, title, pos: start, dur: 0, paused: false });
    return { ok: true, start };
  }
  async function playerCmd(b) {
    if (!S.player) return { ok: false, err: "Rien n'est en lecture sur la TV." };
    const c = String(b.cmd || "");
    const lx = await LX.cmd(c, b, S.player); if (lx) return lx;   // vitesse, décalages, mode nuit, chapitres, capture, minuteur, génériques
    const map = {
      pause: ["set_property", "pause", true], resume: ["set_property", "pause", false], toggle: ["cycle", "pause"],
      stop: ["quit"], mute: ["cycle", "mute"],
      volup: ["add", "volume", 5], voldown: ["add", "volume", -5],
      subs: ["cycle", "sub"], audio: ["cycle", "audio"]
    };
    let cmd = map[c];
    if (c === "seek") cmd = ["seek", Number(b.sec) || 0, "relative"];
    if (c === "goto") cmd = ["seek", Math.max(0, Number(b.sec) || 0), "absolute"];
    if (c === "volume") cmd = ["set_property", "volume", Math.max(0, Math.min(130, Number(b.value) || 0))];
    if (c === "osd") cmd = ["show-text", String(b.text || "").slice(0, 300), 8000];   // message par-dessus le film
    if (c === "prev" || c === "next") {
      // album, diaporama : piste précédente/suivante ; série : épisode suivant
      const serie = S.lib.items.find((x) => x.kind === "serie" && (x.episodes || []).some((e) => e.id === S.player.key));
      if (serie && c === "next") { const eps = serie.episodes, i = eps.findIndex((e) => e.id === S.player.key), ep = eps[i + 1]; if (!ep) return { ok: false, err: "C'était le dernier épisode." };
        return playOnTv(ep.file, ep.id, `${serie.title} · S${ep.s}E${ep.e}`, { id: serie.id, kind: "serie" }); }
      cmd = [c === "next" ? "playlist-next" : "playlist-prev"];
    }
    if (!cmd) return { ok: false, err: "Commande inconnue." };
    const r = await mpvSend(cmd);
    return { ok: !!r && r.error === "success" };
  }

  // ---------- jeux (RetroArch, si installé) ----------
  // plusieurs cœurs possibles par console : le premier installé gagne (Debian/Raspberry Pi OS n'a pas toujours les mêmes)
  const CORES = { nes: ["fceumm", "nestopia", "mesen"], snes: ["snes9x", "bsnes_mercury_balanced", "bsnes"], gba: ["mgba", "vba_next"], gb: ["gambatte", "mgba", "sameboy"], gbc: ["gambatte", "mgba", "sameboy"],
    md: ["genesis_plus_gx", "picodrive"], sms: ["genesis_plus_gx", "picodrive"], gg: ["genesis_plus_gx"], n64: ["mupen64plus_next", "parallel_n64"], psx: ["pcsx_rearmed", "mednafen_psx"],
    pce: ["mednafen_pce_fast", "beetle_pce_fast"], a26: ["stella", "stella2014"], nds: ["melonds", "desmume"],
    a78: ["prosystem"], vb: ["mednafen_vb"], ngp: ["mednafen_ngp"], ws: ["mednafen_wswan"], "32x": ["picodrive"], c64: ["vice_x64sc", "vice_x64"], zx: ["fuse"], cpc: ["cap32"],
    arcade: ["fbneo", "mame2003_plus"], mame: ["mame2003_plus", "mame2003"] };
  // un titre d'un disque débranché (bibliothèque gardée : hors ligne) ne se lance pas — ni la TV, ni un jeu, ni une
  // préparation : on dit quel disque brancher (et pas « lecture impossible »). Un épisode suit sa série.
  function debranche(it) {
    let t = it;
    if (t && t.kind === "episode") t = S.lib.items.find((x) => x.kind === "serie" && (x.episodes || []).some((e) => e.id === it.id)) || t;
    // un bonus, une bande-annonce posée à côté, un morceau d'un film : ils suivent le titre auquel ils appartiennent
    for (let n = 0; t && n < 3 && !(t.pub && t.pub.unplugged); n++) {
      const up = t.kind === "extra" && t.owner ? S.lib.byId.get(t.owner) : t.partOf ? S.lib.byId.get(t.partOf) : null;
      if (!up || up === t) break; t = up;
    }
    if (!t || !t.pub || !t.pub.unplugged) return null;
    const pour = t.kind === "game" ? "y jouer" : t.kind === "album" ? "l'écouter" : t.kind === "photos" ? "voir ces photos" : "regarder ce titre";
    return { ok: false, unplugged: true, disk: String(t.pub.disk || ""), err: `Branche le disque « ${t.pub.disk || "externe"} » pour ${pour}.` };
  }
  S.debranche = debranche;
  function playGame(it) {
    // BIOS indispensable absent (PC Engine CD, Mega-CD, Famicom Disk System, Neo Geo) : un message clair plutôt qu'un écran noir
    const bi = it.pub && it.pub.bios;
    if (bi) { bi.ok = !!biosFind(bi.key, S.roots, it.file); if (bi.requis && !bi.ok) return { ok: false, err: `BIOS manquant : ${bi.txt}. Dépose-le dans le dossier BIOS (il vient de ta console).` }; }
    // consoles lourdes (PSP → PS3, GameCube, Wii, Xbox) : les vrais émulateurs installés sur cette machine
    if (it.heavy) { const r = CS.launch(it.sys, it.file, S.roots, log); if (r.ok) emit({ type: "game", title: it.title }); return r; }
    const ra = opt.retroarch || which("retroarch");
    const dirs = ["/usr/lib/libretro", "/usr/lib/aarch64-linux-gnu/libretro", "/usr/lib/x86_64-linux-gnu/libretro", path.join(os.homedir(), ".config/retroarch/cores")];
    const lib = ra && (CORES[it.sys] || []).flatMap((c) => dirs.map((d) => path.join(d, `${c}_libretro.so`))).find((f) => fs.existsSync(f));
    if (!lib) {
      // pas de RetroArch (ou pas pour cette console) : l'émulateur intégré de Rembobine, sur l'écran de cette machine
      if (![...S.clients].some((c) => c.rbbTv)) return { ok: false, err: "L'écran de Rembobine n'est pas ouvert sur cette machine." };
      emit({ type: "emu", id: it.id, title: it.title });
      log("info", `jeu ouvert dans l'émulateur intégré : ${it.title}`);
      return { ok: true, emu: "émulateur intégré" };
    }
    try { spawn(ra, ["-f", "-L", lib, it.file], { stdio: "ignore", detached: false }); } catch (e) { return { ok: false, err: String(e) }; }
    log("info", `jeu lancé sur la TV : ${it.title}`);
    emit({ type: "game", title: it.title });
    return { ok: true };
  }

  // disques USB branchés, CD/DVD dans le lecteur, « Tout va bien ? » (voir maison.js)
  // la progression du module, partagée entre le PC et le Raspberry : la plus récente gagne (voir module_progres.js)
  const MP = createModuleProgres({ dataDir: S.data, emit });
  const MA = createMaison({ S, emit, log, playOnTv, rescan, saveCfg, opt: { usbBases: opt.usbBases, usbPoll: opt.usbPoll, discProbe: opt.discProbe, discPoll: opt.discPoll, discDevice: opt.discDevice, discCheckMs: opt.discCheckMs, mpv: opt.mpv, retroarch: opt.retroarch, lookup: opt.lookup } });
  S.maison = MA;

  // ---------- état de la machine ----------
  function ip() { for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === "IPv4" && !a.internal && !/^100\./.test(a.address)) return a.address; return "127.0.0.1"; }
  function tailscaleIp() { for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === "IPv4" && /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address)) return a.address; return ""; }
  // (température, disques, mémoire, Wi-Fi : voir systeme.js)

  // ---------- réponses HTTP ----------
  const send = (res, code, obj, hdr = {}) => { const b = JSON.stringify(obj); res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...hdr }); res.end(b); };
  function cors(req, res) {
    // la page Rembobine peut être ouverte depuis un autre appareil (appli Android, PC) : on autorise les appels,
    // la protection vient du jeton d'appairage, pas de l'origine
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    // (les demandes sans clé ne valent rien : ouvrir le CORS ne donne pas accès aux routes protégées ;
    //  « la TV elle-même » ne compte que pour une demande sans Origin étrangère, ou avec la clé de l'écran)
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Range, X-Rembobine-Ecran");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
    res.setHeader("Vary", "Origin");
  }
  async function peekBody(req) { if (req.rbbBody === undefined) req.rbbBody = await readBody(req); return req.rbbBody; }
  async function body(req) { return peekBody(req); }
  async function readBody(req) {
    // 1 Mo au plus (au-delà : demande coupée, corps vide) ; les gros fichiers passent par leurs propres routes
    return new Promise((resolve) => { const ch = []; let n = 0, over = false;
      req.on("data", (d) => { if (over) return; n += d.length; if (n > 1e6) { over = true; ch.length = 0; resolve({}); req.destroy(); } else ch.push(d); });
      req.on("end", () => { if (over) return; try { const t = Buffer.concat(ch).toString("utf8"); resolve(t ? JSON.parse(t) : {}); } catch (_) { resolve({}); } });
      req.on("error", () => { if (!over) { over = true; resolve({}); } }); });
  }
  async function sendFile(req, res, file, mime) {
    let st; try { st = await fsp.stat(file); } catch (_) { return send(res, 404, { ok: false, err: "introuvable" }); }
    const type = mime || MIME[path.extname(file).slice(1).toLowerCase()] || "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range && (range[1] || range[2])) {
      let a = range[1] ? Number(range[1]) : st.size - Number(range[2]), z = range[1] && range[2] ? Number(range[2]) : st.size - 1;
      if (isNaN(a) || a < 0) a = 0; if (z >= st.size) z = st.size - 1;
      if (a > z || a >= st.size) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { "Content-Type": type, "Content-Length": z - a + 1, "Content-Range": `bytes ${a}-${z}/${st.size}`, "Accept-Ranges": "bytes" });
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(file, { start: a, end: z }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  }
  // un fichier de la bibliothèque n'est servi que s'il est VRAIMENT dans un dossier de médias (lien symbolique ou
  // liste .m3u piégés vers /etc, les réglages du serveur… : refusés) ; les jaquettes peuvent aussi venir du cache des fiches
  function libFile(f, cover) {
    let r; try { r = fs.realpathSync(String(f)); } catch (_) { return false; }
    const dirs = S.roots.concat(cover ? [path.join(S.data, "fiches")] : []);
    return dirs.some((d) => { let x; try { x = fs.realpathSync(d); } catch (_) { return false; } return r.startsWith(x + path.sep); });
  }
  S.libFile = libFile;
  // la collection d'un jeu : boîte, manuel, cartouche posés à côté, et ajouts depuis la fiche (collection.js)
  const COL = createCollection({ dataDir: S.data, lib: () => S.lib, libFile, emit: (ev) => emit(ev) });
  // « Plus d'infos » d'un film ou d'une série : casting et voix françaises avec photos, musique, notes… (fiche_plus.js)
  const FP = createFichePlus({ dataDir: S.data, fiches: FI, lib: () => S.lib, on: () => fichesOn(), tmdbKey: () => S.cfg.tmdbKey || "", log: (l, m) => log(l, m) });
  S.fichePlus = FP;
  async function serveStatic(res, req, rel) {
    if (!S.web) return send(res, 404, { ok: false });
    const f = path.normalize(path.join(S.web, rel));
    if (!f.startsWith(path.normalize(S.web + path.sep))) return send(res, 403, { ok: false });
    // la page (4,4 Mo) part compressée vers les téléphones (~1,4 Mo) ; compressée une seule fois, gardée tant que le fichier ne change pas
    if (/\.(html|js|css|json|svg|txt)$/i.test(f) && !req.headers.range && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
      let st; try { st = await fsp.stat(f); } catch (_) { return send(res, 404, { ok: false, err: "introuvable" }); }
      if (st.isFile() && st.size < 32e6) {
        const tag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
        let c = GZ.get(f);
        if (!c || c.tag !== tag) { const raw = await fsp.readFile(f).catch(() => null), gz = raw && await new Promise((ok) => zlib.gzip(raw, { level: 6 }, (e, b) => ok(e ? null : b))); if (!gz) return sendFile(req, res, f); c = { tag, gz }; GZ.set(f, c); if (GZ.size > 20) GZ.delete(GZ.keys().next().value); }
        const h = { "Content-Type": MIME[path.extname(f).slice(1).toLowerCase()] || "application/octet-stream", "Content-Encoding": "gzip", "Vary": "Accept-Encoding", "ETag": tag }; if (!res.getHeader("Cache-Control")) h["Cache-Control"] = "no-cache";
        if (req.headers["if-none-match"] === tag) { res.writeHead(304, h); return res.end(); }
        res.writeHead(200, { ...h, "Content-Length": c.gz.length }); return res.end(req.method === "HEAD" ? undefined : c.gz);
      }
    }
    return sendFile(req, res, f);
  }

  // ---------- Rembobine OS : état, extinction, partage, mises à jour, sauvegardes, licences (os.js) ----------
  function cecSet(on) {
    const ctl = which("cec-ctl"), cli = which("cec-client"); let ok = false;
    if (ctl) for (const dev of ["/dev/cec0", "/dev/cec1"]) { if (!fs.existsSync(dev)) continue; spawnSync(ctl, ["-d", dev, "--playback"], { timeout: 8000 });
      ok = spawnSync(ctl, ["-d", dev, "--to", "0", on ? "--image-view-on" : "--standby"], { timeout: 8000 }).status === 0; if (ok) break; }
    if (!ok && cli) ok = spawnSync(cli, ["-s", "-d", "1"], { input: on ? "on 0\nas\n" : "standby 0\n", timeout: 10000 }).status === 0;
    return ok;
  }
  const OSR = createOs(S, { send, body, sendFile, ip, tailscaleIp, log, cec: cecSet,
    beforePower: async () => { await stopPlayer(); saveCfg(); saveProg(); },
    // après une restauration : réglages et positions relus. Les appareils reliés, les invitations et la clé secrète
    // restent ceux de CETTE machine : un fichier de sauvegarde (qui a pu être modifié) ne peut pas ajouter d'appareil
    // ni d'invité (après une réinstallation, on relie de nouveau les téléphones avec le code de la TV)
    reload: () => { const keep = { tokens: S.cfg.tokens || [], invites: S.cfg.invites || [], secret: S.cfg.secret };
      S.cfg = { ...readJson(cfgFile, S.cfg), ...keep }; setSecret(S.cfg.secret); saveCfg(); S.prog = readJson(progFile, {}); emit({ type: "cards" }); } }, opt.os || {});

  async function route(req, res) {
    const url = new URL(req.url, "http://x");
    let p; try { p = decodeURIComponent(url.pathname); } catch (_) { return send(res, 400, { ok: false, err: "adresse mal formée" }); }
    cors(req, res);
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    // --- ouvert à tous (sur le réseau de la maison) : la page elle-même, l'identité, la demande de code ---
    // la page ne peut pas être affichée dans le cadre d'un autre site (« clickjacking » : faux boutons posés par-dessus)
    if (p === "/" || p === "/index.html") { res.setHeader("Content-Security-Policy", "frame-ancestors 'self'"); res.setHeader("X-Frame-Options", "SAMEORIGIN"); return serveStatic(res, req, "index.html"); }
    if (p === "/remote" || p === "/manette") { res.writeHead(302, { Location: p === "/remote" ? "/?telecommande=1" : "/?manette=1" }); return res.end(); }
    if (p === "/api/info") { const w = who(req, url), bi = OSR.info(); return send(res, 200, { api: API, name: S.cfg.name, version: S.version, build: bi.build, date: bi.date, os: bi.os, firstboot: !S.cfg.setupDone, paired: !!w, guest: !!(w && w.guest), kiosk: isLocal(req) }); }
    // textes des licences des logiciels livrés avec Rembobine (page « Crédits et licences »)
    if (p === "/api/licences" || p.startsWith("/licences/")) { const r = OSR.licences(req, res, p); if (r !== false) return r; }
    if (TEL.openRoute(p, req, res, send)) return;
    if ((p === "/api/pair/request" || p === "/api/pair") && req.method === "POST" && !isJson(req)) return send(res, 415, { ok: false, err: "Demande refusée (format)." });
    if (p === "/api/pair/request" && req.method === "POST") {
      const b = await body(req), L = locked(req); if (L) return send(res, 200, { ok: false, err: `Trop d'essais : réessaie dans ${L} min.` });
      if (Date.now() - G.lastReq < 10000 && S.pairing && Date.now() < S.pairing.until) return send(res, 200, { ok: true, again: true });   // le code affiché reste valable
      G.lastReq = Date.now(); newPairCode(b.name); return send(res, 200, { ok: true });
    }
    if (p === "/api/pair" && req.method === "POST" && (await peekBody(req)).invite) {
      // un ami à distance, avec le code d'invitation d'une séance : accès « invité » (regarder, jouer), pendant 2 jours
      const L = locked(req); if (L) return send(res, 200, { ok: false, err: `Trop d'essais : réessaie dans ${L} min.` });
      const b = await body(req), code = String(b.invite || "").trim().toUpperCase(), inv = (S.cfg.invites || []).find((x) => safeEq(x.code, code) && x.until > Date.now());
      if (!inv) { S.badInvite = (S.badInvite || 0) + 1; failed("invitation", req); await new Promise((r) => setTimeout(r, 400)); return send(res, 200, { ok: false, err: "Code d'invitation inconnu ou expiré." }); }
      succeeded(req);
      const token = crypto.randomBytes(24).toString("base64url"), name = String(b.name || "Invité").slice(0, 40);
      S.cfg.tokens.push({ hash: sha(token), name, t: Date.now(), guest: true, until: inv.until, invite: code }); saveCfg();
      emit({ type: "party", msg: `${name} a rejoint la séance.` });
      return send(res, 200, { ok: true, token, guest: true });
    }
    if (p === "/api/pair" && req.method === "POST") {
      const L = locked(req); if (L) return send(res, 200, { ok: false, err: `Trop d'essais : réessaie dans ${L} min.` });
      const b = await body(req), P = S.pairing;
      if (!P || Date.now() > P.until) return send(res, 200, { ok: false, err: "Demande un nouveau code sur la TV." });
      if (!safeEq(String(b.code || "").trim(), P.code)) {
        failed("code d'appairage", req);
        if (++P.tries >= 3 && S.pairing === P) S.pairing = null;   // 3 essais par code
        return send(res, 200, { ok: false, err: S.pairing ? "Code incorrect." : "Code incorrect. Trop d'essais : demande un nouveau code." });
      }
      succeeded(req);
      const token = crypto.randomBytes(24).toString("base64url");
      S.cfg.tokens.push({ hash: sha(token), name: String(b.name || P.who).slice(0, 40), t: Date.now() }); saveCfg(); S.pairing = null;
      emit({ type: "paired", who: String(b.name || P.who).slice(0, 40), msg: `Nouvel appareil relié : ${String(b.name || P.who).slice(0, 40)}.` });
      return send(res, 200, { ok: true, token });
    }

    // l'émulateur intégré (code public, sans données personnelles) : servi à tous, comme la page
    if (p.startsWith("/ejs/")) { res.setHeader("Cache-Control", "public, max-age=604800"); return serveStatic(res, req, p.slice(1)); }
    // le lecteur de manuels PDF (pdf.js, code public) : pareil, pour les téléphones qui ouvrent la page du serveur
    if (p.startsWith("/pdfjs/")) { if (p.includes("..") || p.includes("\0")) return send(res, 403, { ok: false }); res.setHeader("Cache-Control", "public, max-age=604800"); return serveStatic(res, req, p.slice(1)); }
    // le module DANS la fenêtre du logiciel (sa version Web, app/module_web.js) : seulement pour l'écran de
    // cette machine (127.0.0.1), jamais pour les autres appareils de la maison
    if (p.startsWith("/module/") && opt.moduleWebDir) {
      if (!loopback(req)) return send(res, 403, { ok: false });
      const rel = p.slice(8);
      if (!/^[\w.-]+$/.test(rel)) return send(res, 404, { ok: false });
      const T = { html: "text/html; charset=utf-8", js: "text/javascript", wasm: "application/wasm", pck: "application/octet-stream", png: "image/png" };
      const ext = path.extname(rel).slice(1).toLowerCase(); if (!T[ext]) return send(res, 404, { ok: false });
      res.setHeader("Cache-Control", "no-cache");
      return sendFile(req, res, path.join(opt.moduleWebDir, rel), T[ext]);
    }
    // bande-annonce d'internet (YouTube, Dailymotion ou Vimeo, trouvée par les fiches) : la page de l'application est un
    // fichier local, les lecteurs veulent une vraie page web qui les intègre → cette petite page, rien d'autre (aucune
    // donnée de la maison). Son petit script, autorisé par son empreinte (CSP), parle au lecteur (« listening » pour
    // YouTube) et redit à la page de Rembobine ce qui se passe : la lecture démarre, ou une erreur (limite d'âge,
    // intégration interdite, vidéo retirée…) ; la page passe alors toute seule à une autre version.
    if (p === "/bande-annonce") {
      const SITES = {
        youtube: { re: /^[\w-]{11}$/, frames: "https://www.youtube-nocookie.com", src: (v, o) => `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&amp;rel=0&amp;playsinline=1&amp;enablejsapi=1${o ? "&amp;origin=" + encodeURIComponent(o) : ""}` },
        dailymotion: { re: /^x[0-9a-zA-Z]{2,15}$/, frames: "https://www.dailymotion.com https://geo.dailymotion.com", src: (v) => `https://www.dailymotion.com/embed/video/${v}?autoplay=1&amp;api=postMessage&amp;id=rbb` },
        vimeo: { re: /^\d{3,12}$/, frames: "https://player.vimeo.com", src: (v) => `https://player.vimeo.com/video/${v}?autoplay=1&amp;dnt=1` }
      };
      const site = String(url.searchParams.get("site") || "youtube"), v = String(url.searchParams.get("v") || "");
      const B = Object.prototype.hasOwnProperty.call(SITES, site) ? SITES[site] : null;
      if (!B || !B.re.test(v)) return send(res, 400, { ok: false });
      if (!fichesOn()) return send(res, 403, { ok: false, err: "Recherche sur internet coupée." });
      // l'adresse de cette page (le lecteur YouTube ne répond qu'à elle) : seulement un nom d'hôte et un port bien formés
      const host = String(req.headers.host || ""), origin = /^(?:[\w-]+\.)*[\w-]+(?::\d{1,5})?$|^\[[0-9a-fA-F:.]+\](?::\d{1,5})?$/.test(host) ? `http://${host}` : "";
      const CSS = "html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}";
      const JS = `(function () {
  "use strict";
  var f = document.getElementById("ba"), site = f.getAttribute("data-site");
  var FROM = { youtube: /^https:\\/\\/www\\.youtube(-nocookie)?\\.com$/, dailymotion: /^https:\\/\\/(www|geo)\\.dailymotion\\.com$/, vimeo: /^https:\\/\\/player\\.vimeo\\.com$/ }[site];
  var alive = false, tries = 0, hello = 0;
  // vers la page de Rembobine (un fichier local : son origine ne peut pas être visée, d'où « * » ; rien de secret ne part)
  function up(m) { m.rbb = "ba"; m.site = site; try { parent.postMessage(m, "*"); } catch (e) {} }
  // vers le lecteur
  function say(m) { try { f.contentWindow.postMessage(typeof m === "string" ? m : JSON.stringify(m), "*"); } catch (e) {} }
  function sub() {
    if (site === "youtube") ["onReady", "onStateChange", "onError"].forEach(function (n) { say({ event: "command", func: "addEventListener", args: [n], id: 1, channel: "widget" }); });
    if (site === "vimeo") ["play", "playProgress", "error"].forEach(function (n) { say({ method: "addEventListener", value: n }); });
  }
  function parse(d) {
    if (typeof d === "string") {
      if (d.charAt(0) === "{") { try { d = JSON.parse(d); } catch (e) { return null; } }
      else { try { var o = {}; new URLSearchParams(d).forEach(function (x, k) { o[k] = x; }); d = o; } catch (e) { return null; } }
    }
    if (!d || typeof d !== "object") return null;
    var ev = String(d.event || d.method || "");
    if (site === "youtube") {
      if (ev === "onError") return { ev: "error", code: Number(d.info) || 0 };
      if (ev === "onStateChange") return { ev: "state", state: Number(d.info) };
      if (ev === "infoDelivery" && d.info && typeof d.info.playerState === "number") return { ev: "state", state: d.info.playerState };
      if (ev === "onReady" || ev === "initialDelivery" || ev === "apiInfoDelivery") return { ev: "ready" };
      return null;
    }
    if (ev === "apiready" || ev === "ready") return { ev: "ready" };
    if (/^(play|playing|start|video_start|ad_start|ad_play|timeupdate|playProgress)$/.test(ev)) return { ev: "state", state: 1 };
    if (ev === "error") return { ev: "error", code: Number(d.code) || 0 };
    return null;
  }
  f.addEventListener("load", function () {
    up({ ev: "loaded" });
    if (site === "youtube") { clearInterval(hello); hello = setInterval(function () { if (alive || ++tries > 40) { clearInterval(hello); return; } say({ event: "listening", id: 1, channel: "widget" }); }, 250); }
  });
  addEventListener("message", function (e) {
    if (e.source === f.contentWindow) {
      if (!FROM || !FROM.test(e.origin)) return;
      var m = parse(e.data); if (!m) return;
      if (!alive) { alive = true; up({ ev: "api" }); sub(); }
      up(m);
    } else if (e.source === parent && parent !== window) {
      // la page de Rembobine (fichier local, ou cette même adresse) : relancer la lecture, rien d'autre
      if (e.origin !== "null" && e.origin !== "file://" && e.origin !== location.origin) return;
      var c = e.data; if (!c || c.rbb !== "ba" || c.cmd !== "play") return;
      if (site === "youtube") say({ event: "command", func: "playVideo", args: [], id: 1, channel: "widget" });
      else if (site === "vimeo") say({ method: "play" });
      else say("play");
    }
  });
})();`;
      const h = (t) => `'sha256-${crypto.createHash("sha256").update(t, "utf8").digest("base64")}'`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'none'; script-src ${h(JS)}; style-src ${h(CSS)}; frame-src ${B.frames}; base-uri 'none'; form-action 'none'` });
      return res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bande-annonce</title><style>${CSS}</style></head>`
        + `<body><iframe id="ba" data-site="${site}" src="${B.src(v, origin)}" title="Bande-annonce" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><script>${JS}</script></body></html>`);
    }
    // les jaquettes : ouvertes si la signature est bonne (l'appli les affiche sans ajouter la clé d'appairage)
    let cm;
    if ((cm = /^\/cover\/([^/]+)$/.exec(p))) {
      const it = S.lib.byId.get(cm[1]) || FI.virtual(cm[1]);
      if (!safeEq(url.searchParams.get("k") || "", coverSig(cm[1])) && !authed(req, url)) return send(res, 401, { ok: false, err: "appairage" });
      if (!it || !it.coverFile) return send(res, 404, { ok: false });
      if (!libFile(it.coverFile, true)) return send(res, 404, { ok: false });
      res.setHeader("Cache-Control", "private, max-age=86400");
      return sendFile(req, res, it.coverFile);
    }
    // photos des acteurs et des voix françaises (« Plus d'infos ») : signées comme les jaquettes, seulement fiches/gens/<qid>.jpg
    if (p.startsWith("/fiche-photo/")) return FP.photo(req, res, p, url, { send, sendFile, authed });

    // --- tout le reste demande un appareil appairé ---
    const W = who(req, url);
    if (!W) return send(res, 401, { ok: false, err: "appairage" });
    // un invité regarde et joue, mais ne pilote pas la TV et ne change pas les réglages de la maison
    // un invité regarde et joue : une liste fermée d'adresses (tout le reste est refusé, même ce qui sera ajouté plus tard)
    if (W.guest && !guestAllowed(p, req.method)) return send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." });
    if ((await OSR.route(req, res, p, url, W)) !== false) return;
    if (await PR.route(p, req, res, W, { body, send, url })) return;
    if (await TEL.route(p, req, res, W, { body, send, url })) return;
    if (await BPR.route(p, req, res, url, W)) return;
    // lien de lecture signé pour cet appareil (voir lienPour) ; l'écran de la TV n'en a pas besoin
    if (p === "/api/lien") return send(res, 200, W.local ? { ok: true, lien: "" } : { ok: true, ...(lienPour(W) || { lien: "" }) });

    if (p === "/api/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write(`data: ${JSON.stringify({ type: "hello", name: S.cfg.name })}\n\n`);
      S.clients.add(res); res.rbbTv = isLocal(req); res.rbbGuest = !!W.guest;   // l'écran de la TV elle-même (kiosque) ; un invité (pas les nouvelles des mises à jour)
      try { req.socket.setNoDelay(true); } catch (_) {}   // manette du téléphone : chaque touche part tout de suite
      const ka = setInterval(() => { try { res.write(": ping\n\n"); } catch (_) {} }, 25000);
      req.on("close", () => { clearInterval(ka); S.clients.delete(res); });
      return;
    }
    if (p === "/api/library") {
      // bibliothèque gardée : réponse tout de suite (avec la date de son analyse), même pendant une nouvelle analyse ;
      // tout premier lancement (rien de gardé) : on attend la fin de l'analyse (10 s au plus) plutôt qu'une liste vide
      if (!S.lib.t) { let tm; await Promise.race([scanRun || rescan(), new Promise((r) => { tm = setTimeout(r, 10000); })]); clearTimeout(tm); }
      return send(res, 200, { t: S.lib.t, date: S.lib.at || 0, stored: !!S.lib.stored, scanning: !!S.scan.running,
        items: S.lib.items.map((x) => ({ ...x.pub, progress: S.prog[x.id] || null })) });
    }
    if (p === "/api/scan") { if (req.method === "POST") { rescan(); return send(res, 200, { ok: true }); } return send(res, 200, S.scan); }
    let m;
    if ((m = /^\/media\/([^/]+)$/.exec(p))) {
      const it = S.lib.byId.get(m[1]); if (!it || !it.file || !libFile(it.file)) return send(res, 404, { ok: false, err: "introuvable" });
      // ?mode=auto (le serveur choisit selon ce que l'appareil sait lire), remux, transcode ; ?ss= reprise en secondes ; ?a= piste audio
      const mode = url.searchParams.get("mode");
      // version « salon » préparée à l'avance (?prep=1) : un vrai fichier, on avance librement dedans
      const prep = url.searchParams.get("prep") === "1" && LX.prepared(it.id, "salon"); if (prep) return sendFile(req, res, prep, "video/mp4");
      if (!mode || mode === "direct" || !["film", "episode"].includes(it.kind)) return sendFile(req, res, it.file);
      const info = await V.probe(it.file), want = url.searchParams.has("a") ? Number(url.searchParams.get("a")) : null;
      let plan = V.decide(info, it.file, V.parseCan(url.searchParams.get("can")), want);
      if (mode === "remux" && plan.mode === "direct") plan = { mode: "remux", audio: plan.audio, copyAudio: true };
      if (mode === "transcode") plan = { mode: "transcode", audio: V.pickAudio(info || { audio: [] }, want), copyAudio: false, low: url.searchParams.get("q") === "low" };
      // ?sdr=1 : 4K/HDR → 1080p SDR ; ?ad= : décalage du son en secondes
      if (url.searchParams.get("sdr") === "1") plan = { ...plan, mode: "transcode", sdr: true, maxh: 1080 };
      const ad = Number(url.searchParams.get("ad")) || 0; if (ad) plan = { ...plan, mode: plan.mode === "direct" ? "remux" : plan.mode, copyAudio: plan.mode === "direct" ? true : plan.copyAudio, ad };
      if (plan.mode === "direct") return sendFile(req, res, it.file);
      // conversions en même temps : limitées (un appareil ne peut pas saturer la machine) ; un invité, une seule à la fois
      const maxT = opt.maxTranscodes || 4;
      if (S.transcodes >= maxT || (W.guest && [...(S.transGuests || [])].includes(W.hash))) return send(res, 503, { ok: false, err: "Trop de vidéos converties en même temps : réessaie dans un instant." });
      const pr = V.stream(req, res, it.file, plan, Math.max(0, Number(url.searchParams.get("ss")) || 0));
      if (pr && pr.on) { S.transcodes++; const g = W.guest ? W.hash : null; if (g) (S.transGuests || (S.transGuests = new Set())).add(g);
        let done = false; pr.on("close", () => { if (done) return; done = true; S.transcodes--; if (g) S.transGuests.delete(g); }); }
      return;
    }
    if ((m = /^\/api\/probe\/([^/]+)$/.exec(p))) {
      const it = S.lib.byId.get(m[1]); if (!it || !it.file) return send(res, 404, { ok: false, err: "introuvable" });
      const info = await V.probe(it.file), want = url.searchParams.has("a") ? Number(url.searchParams.get("a")) : null;
      const plan = V.decide(info, it.file, V.parseCan(url.searchParams.get("can")), want);
      const NAMES = { fr: "Français", fre: "Français", fra: "Français", en: "Anglais", eng: "Anglais", es: "Espagnol", spa: "Espagnol", de: "Allemand", ger: "Allemand", deu: "Allemand", it: "Italien", ita: "Italien", ja: "Japonais", jpn: "Japonais" };
      const label = (l, t, i) => t || NAMES[l] || (l ? l.toUpperCase() : `Piste ${i + 1}`);
      const emb = info ? info.subs.filter((x) => x.text) : [];
      const subs = emb.map((x, n) => ({ n, lang: x.lang, label: label(x.lang, x.title, n) })).concat(V.sidecars(it.file).map((x, k) => ({ n: emb.length + k, lang: x.lang, label: (NAMES[x.lang] || x.lang.toUpperCase() || "Sous-titres") + (x.forced ? " (forcés)" : "") + " · fichier" })));
      return send(res, 200, { mode: plan.mode, why: plan.why || "", dur: info ? info.dur : 0, ffmpeg: !!V.bins().ffmpeg,
        video: info && info.video ? { codec: info.video.codec, w: info.video.w, h: info.video.h, bits: info.video.bits } : null,
        audio: info ? info.audio.map((a) => ({ i: a.i, lang: a.lang, codec: a.codec, ch: a.ch, label: label(a.lang, a.title, a.i) + (a.ch > 2 ? ` ${a.ch === 6 ? "5.1" : a.ch === 8 ? "7.1" : a.ch + " canaux"}` : "") })) : [],
        audioPicked: plan.audio ? plan.audio.i : null, subs,
        // lecture vidéo : chapitres, HDR, versions préparées, génériques
        chapters: info ? info.chapters : [], hdr: !!(info && info.video && info.video.hdr), tonemap: !!V.bins().ffmpeg && V.canTonemap(),
        prepared: { salon: !!LX.prepared(it.id, "salon"), leger: !!LX.prepared(it.id, "leger") } });
    }
    // ---------- lecture vidéo : génériques, vignettes, versions préparées, hors-ligne, captures (lecture.js) ----------
    if ((m = /^\/api\/intro\/([^/]+)$/.exec(p))) {
      if (req.method === "POST") { if (W.guest) return send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." }); return send(res, 200, await LX.mark(m[1], await body(req))); }
      return send(res, 200, await LX.lookup(m[1]));
    }
    if ((m = /^\/thumb\/([^/]+)$/.exec(p))) {
      const f = await LX.thumb(m[1], url.searchParams.get("t")); if (!f) return send(res, 404, { ok: false });
      res.setHeader("Cache-Control", "private, max-age=86400"); return sendFile(req, res, f, "image/jpeg");
    }
    if (p === "/api/prepare") {
      if (req.method !== "POST") return send(res, 200, { jobs: LX.prepList() });
      const b = await body(req), id = String(b.id || ""), profil = b.profil === "leger" ? "leger" : "salon";
      // un invité peut emporter une version légère, mais pas occuper le serveur avec le reste
      if (W.guest && (profil !== "leger" || b.del)) return send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." });
      return send(res, 200, b.del ? LX.unprepare(id, profil) : LX.prepare(id, profil));
    }
    if ((m = /^\/offline\/([^/]+)$/.exec(p))) {
      const it = S.lib.byId.get(m[1]), f = it && LX.prepared(it.id, "leger"); if (!f) return send(res, 404, { ok: false, err: "Version légère pas encore prête." });
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent((it.title || "film").replace(/[\\/:*?"<>|]/g, " ") + ".mp4")}`);
      return sendFile(req, res, f, "video/mp4");
    }
    if ((m = /^\/api\/captures\/([^/]+)$/.exec(p))) return send(res, 200, { captures: LX.captures(m[1]).map((x) => ({ ...x, url: `/capture/${m[1]}/${x.name}` })) });
    if ((m = /^\/capture\/([^/]+)\/([^/]+)$/.exec(p))) { const f = LX.captureFile(m[1], m[2]); if (!f) return send(res, 404, { ok: false }); return sendFile(req, res, f, "image/jpeg"); }
    if ((m = /^\/subs\/([^/]+)\/(\d+)$/.exec(p))) {
      const it = S.lib.byId.get(m[1]); if (!it || !it.file || !libFile(it.file)) return send(res, 404, { ok: false });
      const info = await V.probe(it.file), emb = info ? info.subs.filter((x) => x.text) : [], n = Number(m[2]), ss = Math.max(0, Number(url.searchParams.get("ss")) || 0);
      if (n < emb.length) return V.subtitles(req, res, { file: it.file, stream: emb[n].i, ss });
      const sc = V.sidecars(it.file)[n - emb.length]; if (!sc) return send(res, 404, { ok: false });
      return V.subtitles(req, res, { sidecar: sc.file, ss });
    }
    if ((m = /^\/photo\/([^/]+)\/(\d+)$/.exec(p))) { const it = S.lib.byId.get(m[1]); const f = it && it.files && it.files[Number(m[2])]; if (!f || !libFile(f)) return send(res, 404, { ok: false }); return sendFile(req, res, f); }
    if ((m = /^\/track\/([^/]+)\/(\d+)$/.exec(p))) { const it = S.lib.byId.get(m[1]); const f = it && it.files && it.files[Number(m[2])]; if (!f || !libFile(f)) return send(res, 404, { ok: false }); return sendFile(req, res, f); }

    if (p === "/api/play" && req.method === "POST") {
      const b = await body(req), it = S.lib.byId.get(String(b.id || "")); if (!it) return send(res, 200, { ok: false, err: "Introuvable dans la bibliothèque." });
      { const off = debranche(it); if (off) return send(res, 200, off); }
      let file = it.parts || it.file, key = it.id, title = it.title;   // film en plusieurs morceaux : lus à la suite
      if (it.kind === "serie") {
        const ep = (b.ep && S.lib.byId.get(String(b.ep))) || nextEpisode(it); if (!ep) return send(res, 200, { ok: false, err: "Aucun épisode." });
        file = ep.file; key = ep.id; title = `${it.title} · S${ep.s}E${ep.e}`;
      }
      if (it.kind === "episode") { file = it.file; title = it.title; }
      if (it.kind === "album") return send(res, 200, await playOnTv(it.files, it.id, it.title, { kind: "album", track: Math.max(0, Number(b.track) || 0) }));
      if (it.kind === "photos") return send(res, 200, await playOnTv(it.files, it.id, it.title, { kind: "photos", photos: true }));
      if (it.kind === "game") return send(res, 200, playGame(it));
      if (!file) return send(res, 200, { ok: false, err: "Ce contenu ne se lit pas sur la TV." });
      return send(res, 200, await playOnTv(file, key, title, { id: it.id, kind: it.kind }));
    }
    if (p === "/api/eq" || p.startsWith("/api/lyrics/")) return MU.handle(req, res, p, W, send, body);
    if (p === "/api/play/cmd" && req.method === "POST") return send(res, 200, await playerCmd(await body(req)));
    if (p === "/api/now") { const pl = S.player; return send(res, 200, pl ? { playing: true, key: pl.key, id: pl.id, kind: pl.kind, title: pl.title, pos: pl.pos, dur: pl.dur, paused: pl.paused } : { playing: false }); }
    // touches de la télécommande : pendant une lecture, elles pilotent le lecteur ; sinon elles vont à l'écran de la TV
    if (p === "/api/key" && req.method === "POST") {
      const b = await body(req), k = String(b.key || "");
      if (b.text != null) { emitTv({ type: "key", text: String(b.text).slice(0, 200) }); return send(res, 200, { ok: true }); }
      const toPlayer = { left: { cmd: "seek", sec: -10 }, right: { cmd: "seek", sec: 10 }, ok: { cmd: "toggle" }, back: { cmd: "stop" }, up: { cmd: "volup" }, down: { cmd: "voldown" }, playpause: { cmd: "toggle" } };
      if (S.player && toPlayer[k]) return send(res, 200, await playerCmd(toPlayer[k]));
      if (!["up", "down", "left", "right", "ok", "back", "home", "playpause"].includes(k)) return send(res, 200, { ok: false, err: "Touche inconnue." });
      if (![...S.clients].some((c) => c.rbbTv)) return send(res, 200, { ok: false, err: "La TV n'est pas allumée." });
      emitTv({ type: "key", key: k }); return send(res, 200, { ok: true });
    }
    // allumer / éteindre la TV par le câble HDMI (CEC), si la TV le permet
    if (p === "/api/cec" && req.method === "POST") {
      const b = await body(req), ok = cecSet(b.action === "tvon");
      return send(res, 200, ok ? { ok: true } : { ok: false, err: "La TV ne répond pas (HDMI-CEC)." });
    }
    if (p === "/api/game" && req.method === "POST") { const b = await body(req), it = S.lib.byId.get(String(b.id || "")); if (!it || it.kind !== "game") return send(res, 200, { ok: false, err: "Jeu introuvable." }); const off = debranche(it); if (off) return send(res, 200, off); return send(res, 200, playGame(it)); }
    if (p === "/api/remote") { const port = S.port; return send(res, 200, { url: `http://${ip()}:${port}/remote`, local: `http://${os.hostname()}.local:${port}/remote`, tailscale: tailscaleIp() ? `http://${tailscaleIp()}:${port}/remote` : "" }); }
    // cartouches NFC : la liste est partagée entre la TV et les téléphones (cahier des charges dans le module)
    if (p === "/api/cards") {
      if (req.method !== "POST") return send(res, 200, { cards: S.cfg.cards || {} });
      const b = await body(req), cards = S.cfg.cards || (S.cfg.cards = {}), cut = (v) => String(v == null ? "" : v).slice(0, 200);
      if (b.del) { delete cards[cut(b.del)]; }
      else if (b.set && b.set.uid) {
        const c = b.set, uid = cut(c.uid);
        if (!cards[uid] && Object.keys(cards).length >= 500) return send(res, 200, { ok: false, err: "Trop de cartouches (500 au maximum)." });
        cards[uid] = { id: cut(c.id), title: cut(c.title), kind: cut(c.kind), pid: cut(c.pid), look: cut(c.look),
          alias: (Array.isArray(c.alias) ? c.alias : []).slice(0, 12).map(cut), ...(c.gbxId ? { gbxId: cut(c.gbxId) } : {}), at: Number(c.at) || Date.now() };
      } else return send(res, 200, { ok: false, err: "Demande incomplète." });
      saveCfg(); emit({ type: "cards" });
      return send(res, 200, { ok: true });
    }
    if (p === "/api/cards/tap" && req.method === "POST") {
      const b = await body(req);
      if (![...S.clients].some((c) => c.rbbTv)) return send(res, 200, { ok: false, err: "La TV n'est pas allumée." });
      emit({ type: "card", uid: String(b.uid || "").slice(0, 200), id: String(b.id || "").slice(0, 200) });
      return send(res, 200, { ok: true });
    }
    // salons (séances de film à plusieurs, duels, visites) : chacun annonce sa présence, tous reçoivent la liste
    if (p === "/api/room" && req.method === "POST") {
      const b = await body(req), room = String(b.room || "").slice(0, 80), peer = String(b.peer || "").slice(0, 40);
      if (!room || !peer) return send(res, 200, { ok: false });
      const R = S.rooms.get(room) || new Map(); S.rooms.set(room, R);
      if (b.leave) R.delete(peer); else { const pres = JSON.stringify(b.presence || {}); if (pres.length > 8000) return send(res, 200, { ok: false, err: "trop gros" }); R.set(peer, { presence: JSON.parse(pres), t: Date.now(), name: W.name || "TV" }); }
      if (!R.size) S.rooms.delete(room);
      emitRoom(room); return send(res, 200, { ok: true });
    }
    // invitation pour un ami à distance (séance) : un code valable 2 jours
    if (p === "/api/invite" && req.method === "POST") {
      const b = await body(req); S.cfg.invites = (S.cfg.invites || []).filter((x) => x.until > Date.now());
      let code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      if (code.length < 4 || S.cfg.invites.some((x) => x.code === code)) code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[crypto.randomInt(0, 32)]).join("");
      const inv = { code, until: Math.max(Date.now() + 2 * 86400000, Math.min(Date.now() + 30 * 86400000, (Number(b.at) || 0) + 86400000)), item: b.item ? { id: String(b.item.id || "").slice(0, 80), title: String(b.item.title || "").slice(0, 200) } : null, host: String(b.who || "").slice(0, 40) };
      S.cfg.invites.push(inv); saveCfg();
      return send(res, 200, { ok: true, code, until: inv.until, url: tailscaleIp() ? `http://${tailscaleIp()}:${S.port}` : "" });
    }
    if (p === "/api/party") {
      // la séance en cours, vue du panneau Rembobine OS (une invitation = une séance)
      S.cfg.invites = (S.cfg.invites || []).filter((x) => x.until > Date.now());
      if (req.method === "POST") {
        const b = await body(req);
        if (b.action === "end") { const last = S.cfg.invites.pop(); if (last) S.cfg.tokens = S.cfg.tokens.filter((t) => t.invite !== last.code); saveCfg(); return send(res, 200, { ok: true }); }
        if (b.action === "create") { const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[crypto.randomInt(0, 32)]).join("");
          S.cfg.invites.push({ code, until: Date.now() + 2 * 86400000, item: b.item || null, host: String(b.who || "").slice(0, 40) }); saveCfg(); return send(res, 200, { ok: true, id: code }); }
      }
      const inv = S.cfg.invites[S.cfg.invites.length - 1];
      return send(res, 200, inv ? { id: inv.code, item: inv.item, guests: S.cfg.tokens.filter((t) => t.invite === inv.code).map((t) => t.name) } : {});
    }
    // Tailscale : réseau privé pour les amis à distance
    if (p === "/api/tailscale") {
      const ts = which("tailscale"); if (!ts) return send(res, 200, { installed: false, up: false });
      if (req.method === "POST") {
        const b = await body(req);
        if (b.action === "down") { spawnSync("sudo", ["-n", ts, "down"], { timeout: 15000 }); return send(res, 200, { ok: true }); }
        // connexion : Tailscale donne une adresse à ouvrir pour se connecter à son compte (affichée en QR code sur la TV)
        const pr = spawn("sudo", ["-n", ts, "up", "--timeout=25s", "--hostname=rembobine"], { stdio: ["ignore", "pipe", "pipe"] });
        let out = ""; const grab = (d) => { out += d; };
        pr.stdout.on("data", grab); pr.stderr.on("data", grab);
        const url2 = await new Promise((resolve) => { const t = setInterval(() => { const m = /https:\/\/login\.tailscale\.com\/\S+/.exec(out); if (m) { clearInterval(t); resolve(m[0]); } }, 300); setTimeout(() => { clearInterval(t); resolve(""); }, 20000); });
        return send(res, 200, url2 ? { ok: true, login: url2 } : { ok: /Success|already/i.test(out) || !!tailscaleIp(), err: out.trim().slice(0, 300) });
      }
      let st = {}; try { st = JSON.parse(spawnSync(ts, ["status", "--json"], { encoding: "utf8", timeout: 8000 }).stdout || "{}"); } catch (_) {}
      const up = st.BackendState === "Running", ipt = (st.Self && st.Self.TailscaleIPs || []).find((x) => /^100\./.test(x)) || tailscaleIp();
      return send(res, 200, { installed: true, up, state: st.BackendState || "", url: up && ipt ? `http://${ipt}:${S.port}` : "", name: st.Self ? String(st.Self.DNSName || "").replace(/\.$/, "") : "" });
    }
    // consoles et émulateurs de cette machine (page « Consoles et émulateurs »)
    if (p === "/api/emulators" && req.method !== "POST") {
      const cs = CS.status(S.roots); for (const c of cs) for (const e of c.emus) e.auto = IN.can(e.id);
      return send(res, 200, { arch: process.arch, platform: process.platform, consoles: cs, bios: CS.biosFiles(S.roots).map((f) => path.basename(f)), jobs: IN.jobs() });
    }
    if (p === "/api/emulators/install" && req.method === "POST") {
      if (W.guest) return send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." });
      const b = await body(req), id = String(b.id || "");
      if (id !== "ps3sys" && !IN.can(id)) return send(res, 200, { ok: false, err: "Cet émulateur ne s'installe pas tout seul sur cette machine." });
      return send(res, 200, IN.start(id));
    }
    // fiche d'un fichier trouvé par la page elle-même (dossier choisi sur l'appareil) : même recherche, même cache
    if (p === "/api/fiche-titre" && req.method === "POST") {
      if (W.guest) return send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." });
      if (!fichesOn()) return send(res, 200, { ok: false, off: true, err: "Recherche sur internet coupée (Paramètres → Métadonnées)." });
      const b = await body(req); const r = await FI.lookup(b || {}, S.cfg.tmdbKey || "", coverUrl).catch(() => null);
      return send(res, 200, r && !r.none ? { ok: true, item: r } : { ok: false, err: "Rien trouvé sur internet pour ce titre." });
    }
    // corriger une fiche : nouvelle recherche sur internet avec un autre titre
    if ((m = /^\/api\/fiche\/([^/]+)$/.exec(p)) && req.method === "POST") {
      if (W.guest) return send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." });
      const it = S.lib.byId.get(m[1]); if (!it) return send(res, 404, { ok: false, err: "introuvable" });
      const b = await body(req); const r = await FI.research(it, String(b.query || "").slice(0, 200), S.cfg.tmdbKey || "");
      if (r.ok && b.replace) { delete it.pub.syn; if (it.coverFile && it.coverFile.startsWith(path.join(S.data, "fiches"))) it.coverFile = ""; }
      FI.apply([it], coverUrl, S.lib.byId); S.lib.t = Date.now(); emit({ type: "fiches", n: 1 });
      return send(res, 200, r.ok ? { ok: true, item: it.pub } : { ok: false, err: "Rien trouvé sur internet pour ce titre." });
    }
    // « Plus d'infos » : vraies informations d'un film ou d'une série, cherchées à la première ouverture puis gardées
    if (p.startsWith("/api/fiche-plus/")) return FP.route(req, res, p, url, W, { send });
    if (p === "/api/devices") return send(res, 200, { devices: S.cfg.tokens.map((t) => ({ name: t.name, t: t.t, seen: t.seen || 0 })) });
    if (p === "/api/config") {
      if (req.method === "POST") { const b = await body(req); const key0 = S.cfg.tmdbKey; for (const k of ["name", "idleMin", "tmdbKey", "fiches", "autoNext", "introScan"]) if (b[k] !== undefined) S.cfg[k] = k === "name" ? String(b[k]).slice(0, 40) : k === "tmdbKey" ? String(b[k]).slice(0, 300) : k === "idleMin" ? Math.max(0, Math.min(1440, Number(b[k]) || 0)) : !!b[k];
        if (b.update && typeof b.update === "object" && typeof b.update.auto === "boolean") S.cfg.update = { ...(S.cfg.update || {}), auto: b.update.auto };   // mises à jour automatiques la nuit
        saveCfg();
        if ((b.tmdbKey && b.tmdbKey !== key0) || b.fiches === true) setTimeout(() => ficheSearch(), 200);   // nouvelle clé TMDB ou recherche rallumée : on cherche ce qui manque   // nouvelle clé TMDB : on cherche les fiches qui manquent
        return send(res, 200, { ok: true }); }
      return send(res, 200, { name: S.cfg.name, idleMin: S.cfg.idleMin, tmdbKey: S.cfg.tmdbKey ? "••••" : "", fiches: fichesOn(), update: S.maj.status().config });
    }
    if (p === "/api/setup" && req.method === "POST") { const b = await body(req); if (b.name) S.cfg.name = String(b.name).slice(0, 40); if (typeof b.fiches === "boolean") S.cfg.fiches = b.fiches; if (b.tmdbKey) S.cfg.tmdbKey = String(b.tmdbKey); S.cfg.setupDone = true; saveCfg(); return send(res, 200, { ok: true }); }
    if (p === "/api/setup/wifi") {
      // Wi-Fi par NetworkManager (Raspberry Pi OS) ; ailleurs, la liste est vide
      const nm = which("nmcli");
      if (req.method === "POST") {
        const b = await body(req); if (!nm) return send(res, 200, { ok: false, err: "Wi-Fi non géré sur cet appareil." });
        const r = spawnSync(nm, ["device", "wifi", "connect", String(b.ssid || ""), "password", String(b.pass || "")], { encoding: "utf8", timeout: 45000 });
        return send(res, 200, r.status === 0 ? { ok: true } : { ok: false, err: "Connexion impossible : vérifie le mot de passe." });
      }
      if (!nm) return send(res, 200, []);
      const r = spawnSync(nm, ["-t", "-f", "ACTIVE,SSID,SIGNAL", "device", "wifi", "list"], { encoding: "utf8", timeout: 15000 });
      const seen = new Set();
      return send(res, 200, String(r.stdout || "").split("\n").map((l) => l.split(":")).filter((x) => x[1] && !seen.has(x[1]) && seen.add(x[1]))
        .map((x) => ({ active: x[0] === "yes", ssid: x[1], signal: Number(x[2]) || 0 })));
    }
    if (/^\/api\/(usb|disque|sante)(\/|$)/.test(p) && (await MA.route(req, res, p, url, W, { send, body })) !== false) return;
    if (p === "/api/module") return MP.route(req, res, p, url, W, { send, body });
    if (p.startsWith("/api/jeux/collection/")) { const r = await COL.route(req, res, p, url, W, { send, sendFile, body }); if (r !== false) return; }
    if (/^\/api\/(jeux|saves|pad)(\/|$)/.test(p)) { const r = await JX.route(req, res, p, url, W, { send, sendFile, body }); if (r !== false) return; }
    if (p === "/api/poke" || p === "/api/health/ui") return send(res, 200, { ok: true });
    if (p === "/api/crash" && req.method === "POST") { const b = await body(req); log("error", `page : ${b.msg || ""} (${b.where || ""})`); return send(res, 200, { ok: true }); }
    if (p === "/api/logs") { const n = Math.min(400, Number(url.searchParams.get("n")) || 150); return send(res, 200, { text: S.log.slice(-n).map((l) => `${new Date(l.t).toISOString()} ${l.level} ${l.msg}`).join("\n") }); }
    if (p.startsWith("/api/")) return send(res, 200, { ok: false, err: "Pas encore disponible sur ce Rembobine." });
    // le reste : fichiers de la page (scripts, images)
    return serveStatic(res, req, p.slice(1));
  }

  function nextEpisode(serie) {
    const eps = serie.episodes || [];
    const started = eps.filter((e) => S.prog[e.id]).sort((a, b) => S.prog[b.id].t - S.prog[a.id].t)[0];
    if (!started) return eps[0];
    const pr = S.prog[started.id];
    if (pr.seen) { const i = eps.indexOf(started); return eps[i + 1] || eps[0]; }
    return started;
  }

  // le serveur ne répond qu'aux appareils de la maison : réseaux privés, cette machine, Tailscale (amis invités)
  // et le réseau local de chacune de ses cartes réseau ; tout le reste (internet) est coupé tout de suite
  const server = http.createServer((req, res) => { if (!localNet(req.socket.remoteAddress)) { res.writeHead(403); return res.end(); } route(req, res).catch((e) => { log("error", e.stack || e.message); try { send(res, 500, { ok: false, err: "erreur interne" }); } catch (_) {} }); });
  S.server = server;
  S.start = async () => {
    // la bibliothèque gardée, relue AVANT d'écouter : la page l'a tout de suite, l'analyse suit en arrière-plan
    try {
      const t0 = Date.now(), kept = await MEM.load(S.roots, memCheck());
      if (kept && kept.items.length) {
        FI.apply(kept.items, coverUrl, kept.byId); BPR.saisons.apply(kept, coverUrl);   // fiches trouvées depuis (gardées à part)
        S.lib = { items: kept.items, byId: kept.byId, t: kept.at || Date.now(), at: kept.at, stored: true, pubSig: pubSigOf(kept.items) };
        log("info", `bibliothèque gardée relue : ${kept.items.length} éléments en ${Date.now() - t0} ms (analyse du ${new Date(kept.at).toLocaleString("fr-FR")})`);
      }
    } catch (e) { log("error", "bibliothèque gardée : " + e.message); }
    return listen();
  };
  const listen = () => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(S.port, opt.host || "0.0.0.0", () => {
      log("info", `serveur prêt sur le port ${S.port}`); rescan({ quiet: S.lib.stored }); watchRoots();
      MEM.watch(S, () => rescan({ quiet: true }), opt.rootsPoll);   // disque parti ou revenu
      resolve(S);
    });
  });
  // un fichier ajouté dans un dossier de médias (Films, Livres, Musique, Jeux…) : nouvelle analyse quelques secondes
  // plus tard (le temps que la copie finisse), puis la recherche de sa fiche sur internet
  const watchers = []; let watchT = null;
  function watchRoots() {
    if (opt.watch !== true) return;   // l’application de bureau le demande (main.js) ; pas pendant les essais
    for (const r of S.roots) {
      try { const w = fs.watch(r, { recursive: true }, (ev, name) => { if (name && /(^|[\\/])\./.test(String(name))) return; clearTimeout(watchT); watchT = setTimeout(() => { if (S.scan.running) { watchT = setTimeout(() => rescan(), 15000); return; } rescan(); }, opt.watchDelay || 8000); if (watchT.unref) watchT.unref(); });
        w.on("error", () => {}); watchers.push(w); } catch (_) {}
    }
  }
  S.stop = async () => { clearTimeout(watchT); watchers.forEach((w) => { try { w.close(); } catch (_) {} }); if (ficheRetry) clearTimeout(ficheRetry); MA.stop(); clearInterval(roomSweep); clearInterval(ficheTimer); OSR.stop(); TEL.stop(); await stopPlayer(); for (const c of S.clients) { try { c.end(); } catch (_) {} } await new Promise((r) => server.close(r)); };
  return S;
}

// ---------- petits outils ----------
function readJson(f, def) { try { return { ...def, ...JSON.parse(fs.readFileSync(f, "utf8")) }; } catch (_) { return def; } }
function writeJson(f, v) { try { fs.writeFileSync(f + ".tmp", JSON.stringify(v, null, 1)); fs.renameSync(f + ".tmp", f); } catch (_) {} }
function sha(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
// ce qu'un invité (ami d'une séance, accès 2 jours) a le droit de faire : regarder, écouter, jouer, être dans la séance
// (jamais les BIOS des consoles : ils viennent des consoles de la maison et ne doivent pas en sortir)
const GUEST_READ = /^\/api\/(lien|stream|library|scan|now|probe\/[^/]+|intro\/[^/]+|prepare|captures\/[^/]+|seances|pad|jeux\/(?!bios\/).+|saves\/.+|lyrics\/.+|eq|cards|party|poke|health\/ui|emulators|posters\/.+|system|storage|smart|fiche-plus\/[^/]+)$/;
const GUEST_WRITE = /^\/api\/(room|pad|pad\/in|prepare|saves\/.+|jeux\/scores\/[^/]+|crash|poke)$/;
function guestAllowed(p, method) {
  if (!p.startsWith("/api/")) return true;   // médias, sous-titres, vignettes, page : comme tout appareil relié
  if (method === "GET" || method === "HEAD") return GUEST_READ.test(p);
  if (method === "POST" || method === "PUT" || method === "DELETE") return GUEST_WRITE.test(p);
  return false;
}
// liens de lecture signés : durée, et seules adresses qu'ils ouvrent (fichiers à lire, jamais /api/…)
const LIEN_DUREE = 7 * 86400;
const LIEN_PATHS = /^\/(media|subs|thumb|track|photo|offline|capture|extra)\//;
// ---------- réseaux acceptés ----------
const DEVICE_TTL = 90 * 86400000;   // appareils reliés oubliés après 90 jours sans nouvelles
const ip4n = (a) => { const p = String(a).split(".").map(Number); return p.length === 4 && p.every((x) => Number.isInteger(x) && x >= 0 && x < 256) ? ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3] : -1; };
const in4 = (n, base, bits) => bits === 0 || (n >>> (32 - bits)) === (ip4n(base) >>> (32 - bits));
// réseaux privés (RFC 1918), cette machine, « lien local », Tailscale (100.64.0.0/10)
const NETS4 = [["127.0.0.0", 8], ["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16], ["169.254.0.0", 16], ["100.64.0.0", 10]];
let ifCache = { t: 0, nets: [] };
function ownNets() {   // le réseau de chaque carte de cette machine (adresse + masque), relu toutes les 30 s
  if (Date.now() - ifCache.t > 30000) {
    const nets = [];
    try { for (const a of Object.values(os.networkInterfaces()).flat()) if (a && a.family === "IPv4" && a.netmask) { const m = ip4n(a.netmask); if (m >= 0) nets.push([ip4n(a.address), m]); } } catch (_) {}
    ifCache = { t: Date.now(), nets };
  }
  return ifCache.nets;
}
function localNet(addr) {
  let a = String(addr || "").toLowerCase(); if (!a) return false;
  if (a.startsWith("::ffff:") && a.includes(".")) a = a.slice(7);
  const n = ip4n(a);
  if (n >= 0) return NETS4.some(([b, bits]) => in4(n, b, bits)) || ownNets().some(([x, m]) => ((n & m) >>> 0) === ((x & m) >>> 0));
  // IPv6 : cette machine, lien local (fe80::/10), adresses privées (fc00::/7), Tailscale (fd7a:115c:a1e0::/48)
  return a === "::1" || /^fe[89ab]/.test(a) || /^f[cd]/.test(a);
}
// demande adressée à un nom de cette machine (une page piégée qui fait pointer son propre nom sur 127.0.0.1 est refusée)
function localHost(host) { return !host || /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(host)); }
// pas une page web d'un autre site : les navigateurs disent d'où vient la demande (Origin, Sec-Fetch-Site) ;
// les programmes de la machine (gardien des mises à jour, essais) n'envoient ni l'un ni l'autre
function sameMachinePage(req, port) {
  const o = req.headers.origin, sf = req.headers["sec-fetch-site"];
  if (o && !new RegExp(`^http://(localhost|127\\.0\\.0\\.1|\\[::1\\]):${port}$`, "i").test(o)) return false;
  if (sf && sf !== "same-origin" && sf !== "none") return false;
  return true;
}
function safeEq(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function which(prog) { try { const r = spawnSync(process.platform === "win32" ? "where" : "which", [prog], { encoding: "utf8" }); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : ""; } catch (_) { return ""; } }

module.exports = { createServer, localNet };
