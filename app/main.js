// Rembobine — application de bureau (Linux, Raspberry Pi, Windows).
// Affiche le logiciel Rembobine et, s'il est installé, le module 3D facultatif (Godot) quand la page le demande.
// Linux : thème sombre pour ce que dessine la fenêtre elle-même (avant que la page soit dessinée, par exemple au
// retour de la 3D) ; sans lui, on voit un instant le fond clair du système. Avant tout le reste (GTK le lit au démarrage).
if (process.platform === "linux" && !process.env.GTK_THEME) process.env.GTK_THEME = "Adwaita:dark";
const { app, BrowserWindow, ipcMain, protocol } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const kiosk = process.argv.includes("--kiosk") || process.env.REMBOBINE_KIOSK === "1";
// numéro de fabrication gravé par ci/build_desktop.sh (ex. 1.0.0+57) : affiché dans « À propos », comparé par les mises à jour
const BUILD_FILE = path.join(__dirname, "build.json");
const BUILD = (() => { try { return JSON.parse(fs.readFileSync(BUILD_FILE, "utf8")); } catch (_) { return null; } })();
let win = null;

// « Lecteur seul » : Rembobine ouvert avec un fichier (« Ouvrir avec », double-clic) → seulement le lecteur, sans la
// médiathèque (démarrage rapide : pas de serveur, pas de salon). Voir seul.js (logique) et seul_main.js (fenêtre).
const SEUL = require("./seul");
const fichierSeul = kiosk ? "" : SEUL.fichierDesArgs(process.argv, process.cwd());
// l'adresse rbbseul:// (la page du lecteur seul et les fichiers ouverts) : à déclarer avant le démarrage d'Electron
protocol.registerSchemesAsPrivileged([{ scheme: "rbbseul", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

// Une seule Rembobine à la fois : un fichier ouvert pendant qu'elle tourne arrive dans la fenêtre déjà ouverte.
const premiere = app.requestSingleInstanceLock({ fichier: fichierSeul });
if (!premiere) app.quit();
let pret = false, aOuvrir = "";
app.on("second-instance", (e, argv, cwd, data) => {
  const f = (data && typeof data.fichier === "string" && data.fichier && SEUL.genre(data.fichier) && fs.existsSync(data.fichier) ? data.fichier : "") || (kiosk ? "" : SEUL.fichierDesArgs(argv, cwd));
  if (!pret) { aOuvrir = f || aOuvrir; return; }
  ouvrirFichier(f);
});
// macOS : un fichier glissé sur l'icône, ou « Ouvrir avec »
app.on("open-file", (e, f) => { e.preventDefault(); if (!SEUL.genre(f)) return; if (!pret) aOuvrir = f; else ouvrirFichier(f); });
function ouvrirFichier(f) {
  const r = SEUL.routeOuverture({ complet: !!win, seul: LS.ouvert() }, f);
  if (r === "par-dessus") return LS.ouvrir(f, "dessus");
  if (r === "remplacer" || r === "nouveau") return LS.ouvrir(f, "fenetre");
  if (r === "ouvrir-complet") return demarrerComplet();
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 860, minWidth: 800, minHeight: 480,
    backgroundColor: "#0d0e12", title: "Rembobine", show: false,
    fullscreen: kiosk, autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      // le jingle de démarrage (et le son du néon) se joue sans attendre un clic : la page n'est que celle de Rembobine
      autoplayPolicy: "no-user-gesture-required" }
  });
  win.removeMenu();
  win.once("ready-to-show", () => { win.show(); if (!kiosk) win.maximize(); });
  // F11 : plein écran
  win.webContents.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); } });
  // les liens externes s'ouvrent dans le navigateur, jamais dans l'application
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: "deny" }; });
  // la fenêtre ne quitte jamais la page de Rembobine : un site externe n'aurait pas le droit d'utiliser le « pont » (window.gamebox)
  const stay = (e, url) => { if (!/^file:/i.test(url)) { e.preventDefault(); openOutside(url); } };
  win.webContents.on("will-navigate", stay);
  win.webContents.on("will-redirect", stay);
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());
  // l'écran de Rembobine se présente à son propre serveur avec une clé (en-tête X-Rembobine-Ecran) : c'est elle qui
  // en fait « la TV elle-même » (sans code) ; une page web ouverte dans un navigateur de la même machine ne l'a pas
  if (serveur && serveur.kioskKey) {
    const own = new RegExp(`^http://(127\\.0\\.0\\.1|localhost):${serveur.port}/`), wid = win.webContents.id;
    win.webContents.session.webRequest.onBeforeSendHeaders((d, cb) => {
      if ((d.webContentsId === wid || d.webContentsId === M3DW.viewId()) && own.test(d.url)) d.requestHeaders["X-Rembobine-Ecran"] = serveur.kioskKey;
      cb({ requestHeaders: d.requestHeaders });
    });
  }
  win.loadFile(path.join(__dirname, "web", "index.html"), kiosk ? { query: { kiosk: "1" } } : undefined);
}

// Ouvrir une adresse dans le navigateur de l'ordinateur : https partout ; http seulement pour les appareils
// de la maison (Rembobine, Raspberry, adresses locales ou Tailscale). Jamais file:, javascript:, ni autre programme.
function openOutside(url) {
  let u; try { u = new URL(String(url)); } catch (_) { return; }
  const h = u.hostname.replace(/^\[|\]$/g, "");
  const home = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i.test(h) || /\.(local|lan|home|ts\.net)$/i.test(h);
  if (u.protocol === "https:" || (u.protocol === "http:" && home)) require("electron").shell.openExternal(u.href).catch(() => {});
}

// où se trouve le module 3D (Godot), selon la machine
function godotBin() {
  const base = app.isPackaged || fs.existsSync(path.join(process.resourcesPath, "gamebox3d")) ? path.join(process.resourcesPath, "gamebox3d") : path.join(__dirname, "gamebox3d");
  const name = process.platform === "win32" ? "Rembobine-3D.exe" : process.arch === "arm64" ? "Rembobine-3D.arm64" : "Rembobine-3D.x86_64";
  return path.join(base, name);
}

// la version Web du module 3D (export « Web » de Godot), affichée dans la fenêtre même du logiciel
function godotWebDir() {
  return app.isPackaged || fs.existsSync(path.join(process.resourcesPath, "gamebox3d-web")) ? path.join(process.resourcesPath, "gamebox3d-web") : path.join(__dirname, "gamebox3d-web");
}

function which(prog) {
  try { const r = spawnSync(process.platform === "win32" ? "where" : "which", [prog], { encoding: "utf8" }); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : ""; } catch (_) { return ""; }
}

// Le serveur de la maison (bibliothèque, lecture sur la TV, télécommande du téléphone), sur le port 8080.
let serveur = null;
const mediaRoots = () => [path.join(os.homedir(), "Rembobine")].concat((process.env.REMBOBINE_MEDIAS || "").split(path.delimiter).filter(Boolean));
async function startServer() {
  try {
    const { createServer } = require("./serveur/serveur");
    const home = os.homedir();
    const roots = mediaRoots().concat(LS.dossiers().filter((d) => !mediaRoots().includes(d)));
    serveur = createServer({ port: Number(process.env.REMBOBINE_PORT) || 8080, webDir: path.join(__dirname, "web"), dataDir: path.join(app.getPath("userData"), "serveur"),
      mediaRoots: roots, version: app.getVersion(), watch: true,
      // Rembobine OS : mises à jour (dossier versionné à côté de l'exécutable), sauvegardes, licences livrées
      // (REMBOBINE_MAJ_API : un faux GitHub, pour les essais sans internet). Après une mise à jour, Rembobine est
      // relancé avec les mêmes options (plein écran « --kiosk ») ; home : où s'installe une appli simplement décompressée.
      os: { buildFile: BUILD_FILE, appDir: path.dirname(process.execPath), kiosk, quit: () => app.quit(), updateApi: process.env.REMBOBINE_MAJ_API || undefined,
        args: process.argv.includes("--kiosk") ? ["--kiosk"] : [], home: os.homedir(),
        licencesDir: app.isPackaged ? path.join(path.dirname(process.execPath), "licences") : path.join(__dirname, "..", "licences") },
      // les vrais émulateurs des consoles récentes, livrés avec l'appli (ci/emulateurs_natifs.sh)
      web3dDir: godotWebDir(),
      emusDir: app.isPackaged ? path.join(process.resourcesPath, "emulateurs") : path.join(__dirname, "emulateurs") });
    await serveur.start();
  } catch (e) { console.error("serveur Rembobine :", e.message); serveur = null; }
}

ipcMain.handle("gbx:info", () => ({ platform: process.platform, arch: process.arch, home: os.homedir(), version: app.getVersion(), build: BUILD ? BUILD.label : "", kiosk, server: serveur ? serveur.port : 0 }));

// Le module 3D (Godot) : préparé à l'avance, caché, puis montré par un fondu (voir monde3d.js).
// La page demande la préparation quand le logiciel est au repos (gbx:prepare3d), jamais pendant un film.
let mpvBusy = 0;
const M3D = require("./monde3d")({ app, win: () => win, bin: godotBin, serveur: () => serveur, kiosk, quit: () => app.quit(),
  busy: () => mpvBusy > 0 || !!(serveur && serveur.player) });
// Sur PC (Windows, Linux avec un bureau) : la 3D DANS la fenêtre du logiciel (version Web du jeu, monde3d_web.js) ;
// Raspberry, Rembobine OS (plein écran sans bureau) ou si elle ne peut pas marcher ici : le jeu séparé ci-dessus.
// REMBOBINE_3D=natif force le jeu séparé.
const M3DW = require("./monde3d_web")({ app, win: () => win, serveur: () => serveur, webDir: godotWebDir, quit: () => app.quit(), dir3d: () => M3D.dir3d(),
  busy: () => mpvBusy > 0 || !!(serveur && serveur.player) });
const web3d = () => process.env.REMBOBINE_3D !== "natif" && !kiosk && process.arch !== "arm64" && M3DW.available();
// La page demande la préparation dès son ouverture. La 3D intégrée (une vue de la fenêtre, avec son propre processus)
// démarre tout de suite ; le jeu séparé (Raspberry, Rembobine OS) attend que le logiciel ait fini de démarrer, il a
// besoin de toute la machine : « tot » = redemander dans « dans » millisecondes.
const T_APPLI = Date.now();
ipcMain.handle("gbx:prepare3d", (e, args) => {
  if (web3d()) return M3DW.prepare(args);
  const dans = 15000 - (Date.now() - T_APPLI);
  if (dans > 0) return { ok: false, why: "tot", dans: dans + 200 };
  return M3D.prepare(args);
});
// « Réessayer en mode simplifié » après un plantage : rendu compatible et qualité économie, retenus pour la suite
ipcMain.handle("gbx:simple3d", (e, on) => M3D.simple(on));
ipcMain.handle("gbx:launch3d", async (e, args, maison) => {
  if (!web3d()) return M3D.launch(args, maison);
  const r = await M3DW.launch(args, maison);
  // la version intégrée ne peut pas démarrer ici (pas de WebGL 2…) : le jeu séparé, sans rien demander
  if (!r.ok && r.quick && M3DW.broken()) return M3D.launch(args, maison);
  return r;
});
// « Quitter Rembobine » (menu du logiciel, ou menu de la 3D)
ipcMain.handle("gbx:quit", () => { setTimeout(() => app.quit(), 50); return true; });

// mpv se pilote par un petit « tuyau » : afficher un message à l'écran, s'arrêter.
const net = require("net");
const MPV_SOCK = process.platform === "win32" ? `\\\\.\\pipe\\rembobine-mpv-${process.pid}` : path.join(os.tmpdir(), `rembobine-mpv-${process.pid}.sock`);
// Le lecteur de cartouches tape des chiffres : dans mpv, ils changeraient le volume ou les couleurs. On les neutralise.
function mpvInputConf() {
  const f = path.join(os.tmpdir(), "rembobine-mpv-input.conf");
  try { if (!fs.existsSync(f)) fs.writeFileSync(f, [..."0123456789"].map(d => `${d} ignore\nKP${d} ignore`).join("\n") + "\nENTER ignore\nKP_ENTER ignore\n"); } catch (_) {}
  return f;
}
// L'interface de lecture de Rembobine (app/lecteur/rembobine_lecteur.lua), à la place de la petite barre d'origine de
// mpv : vrai titre, gros boutons, « Langue » et « Sous-titres » en clair, écran de pause. Les valeurs passent en
// « %longueur%texte » (un titre peut contenir des virgules).
function mpvUi(o, prefsDir) {
  const lua = path.join(__dirname, "lecteur", "rembobine_lecteur.lua");
  if (!fs.existsSync(lua)) return [];
  const q = (v) => { v = String(v == null ? "" : v).replace(/[\r\n]+/g, " ").slice(0, 200); return `%${Buffer.byteLength(v)}%${v}`; };
  const g = /^(film|serie|album)$/.test(String(o && o.genre)) ? o.genre : "film";
  return ["--osc=no", "--osd-bar=no", "--osd-on-seek=no", `--script=${lua}`,
    `--script-opts=rembobine-titre=${q(o && o.titre)},rembobine-sous=${q(o && o.sous)},rembobine-genre=${g},rembobine-prefs=${q(path.join(prefsDir, "lecteur-prefs.json"))}${o && o.seul ? ",rembobine-seul=1" : ""}`];
}
let mpvAvecUi = false;
function mpvSend(cmd) {
  // (un message par-dessus le film s'affiche dans le style de Rembobine quand son interface est là)
  if (mpvAvecUi && Array.isArray(cmd) && cmd[0] === "show-text") cmd = ["script-message-to", "rembobine_lecteur", "rembobine-message", String(cmd[1]), String(cmd[2] || 2500)];
  return new Promise((resolve) => {
    const c = net.connect(MPV_SOCK); const t = setTimeout(() => { c.destroy(); resolve(false); }, 1500);
    c.on("connect", () => { c.end(JSON.stringify({ command: cmd }) + "\n"); clearTimeout(t); resolve(true); });
    c.on("error", () => { clearTimeout(t); resolve(false); });
  });
}
ipcMain.handle("gbx:mpvCmd", (e, a) => {
  if (!a || typeof a !== "object") return false;
  if (a.cmd === "osd" && typeof a.text === "string") return mpvSend(["show-text", a.text.slice(0, 300), 8000]);
  if (a.cmd === "quit") return mpvSend(["quit"]);
  return false;
});

// Le lecteur de cartouches lu directement (Linux, groupe « input ») : il marche même quand mpv est devant.
// Un lecteur « clavier » tape le numéro de la puce puis Entrée, en quelques millisecondes.
// Vie privée : /dev/input n'est lu QUE si la page le demande (gbx:nfcLecture), c.-à-d. quand au moins une cartouche
// est enregistrée ou que « Créer une cartouche » est ouvert ; sinon aucun clavier n'est ouvert. Seules les rafales
// de chiffres trop rapides pour une main (< 80 ms entre deux touches, puis Entrée) sont transmises, rien d'autre.
// Avec le vrai lecteur : une règle udev peut réserver ce seul appareil à Rembobine (voir CLAUDE.md, Cartouches NFC).
const KEYS = { 2: "1", 3: "2", 4: "3", 5: "4", 6: "5", 7: "6", 8: "7", 9: "8", 10: "9", 11: "0", 79: "1", 80: "2", 81: "3", 75: "4", 76: "5", 77: "6", 71: "7", 72: "8", 73: "9", 82: "0", 30: "A", 48: "B", 46: "C", 32: "D", 18: "E", 33: "F" };
const evOpen = new Map();
let evScan = null;
function stopCardReaders() {
  if (evScan) { clearInterval(evScan); evScan = null; }
  for (const rs of evOpen.values()) { try { if (rs) rs.destroy(); } catch (_) {} }
  evOpen.clear();
}
function watchCardReaders() {
  if (process.platform !== "linux" || evScan) return;
  const size = process.arch === "arm" || process.arch === "ia32" ? 16 : 24, at = size - 8;
  const scan = () => {
    let list = []; try { list = fs.readdirSync("/dev/input").filter(n => /^event\d+$/.test(n)); } catch (_) { return; }
    for (const n of list) {
      if (evOpen.has(n)) continue;
      const st = { buf: "", last: 0, rest: Buffer.alloc(0) }; let rs;
      try { fs.accessSync("/dev/input/" + n, fs.constants.R_OK); rs = fs.createReadStream("/dev/input/" + n); } catch (_) { evOpen.set(n, null); continue; }
      evOpen.set(n, rs);
      rs.on("error", () => { evOpen.delete(n); });
      rs.on("close", () => { evOpen.delete(n); });
      rs.on("data", (chunk) => {
        let b = st.rest.length ? Buffer.concat([st.rest, chunk]) : chunk, i = 0;
        for (; i + size <= b.length; i += size) {
          const type = b.readUInt16LE(i + at), code = b.readUInt16LE(i + at + 2), value = b.readInt32LE(i + at + 4);
          if (type !== 1 || value !== 1) continue;
          const t = Date.now(), fast = t - st.last < 80;
          if (code === 28 || code === 96) { const uid = st.buf; st.buf = ""; if (fast && uid.length >= 6 && win) win.webContents.send("nfc:card", uid); continue; }
          const ch = KEYS[code]; if (!ch) { st.buf = ""; continue; }
          if (!fast) st.buf = ""; st.buf += ch; st.last = t;
        }
        st.rest = b.subarray(i);
      });
    }
  };
  scan(); evScan = setInterval(scan, 4000);
}
ipcMain.handle("gbx:nfcLecture", (e, on) => { if (on === true) watchCardReaders(); else stopCardReaders(); return !!evScan; });

// Les vidéos que Chromium ne sait pas lire (mkv, avi…) partent dans mpv, en plein écran.
// lire une valeur de mpv (position, durée) par le même tuyau : la jauge de reprise suit la vraie position
function mpvGet(prop) {
  return new Promise((resolve) => {
    const c = net.connect(MPV_SOCK); let buf = ""; const t = setTimeout(() => { c.destroy(); resolve(null); }, 1200);
    c.on("connect", () => c.write(JSON.stringify({ command: ["get_property", prop], request_id: 7 }) + "\n"));
    c.on("data", (d) => { buf += d; for (const line of buf.split("\n")) { try { const j = JSON.parse(line); if (j.request_id === 7) { clearTimeout(t); c.destroy(); return resolve(j.error === "success" ? j.data : null); } } catch (_) {} } });
    c.on("error", () => { clearTimeout(t); resolve(null); });
  });
}
function mpvBin() {
  try { const O = require("./serveur/outils"); O.setDir(app.isPackaged ? path.join(process.resourcesPath, "emulateurs") : path.join(__dirname, "emulateurs")); return O.tool("mpv"); } catch (_) { return which("mpv"); }
}
// lancer mpv en plein écran avec l'interface de Rembobine ; .fin : promesse résolue à sa fermeture (position, durée)
// o.startPct (en %) ou o.start (en secondes) : où reprendre ; o.seul : lecteur seul (bouton « Ouvrir Rembobine »,
// sous-titres posés à côté reconnus même avec la langue dans le nom)
function mpvJouer(file, o) {
  const mpv = mpvBin();
  if (!mpv) return { fin: Promise.resolve({ ok: false, err: "mpv" }), kill() {} };
  M3D.film();
  // reprise connue de la page (un autre appareil, par exemple) : mpv part de là ; sinon il reprend où il s'était arrêté
  const pct = o && Number(o.startPct), sec = o && Number(o.start);
  const start = pct >= 2 && pct < 95 ? [`--start=${pct.toFixed(1)}%`] : sec > 0 ? [`--start=${sec.toFixed(1)}`] : [];
  const seul = o && o.seul ? ["--sub-auto=fuzzy", "--force-window=immediate"] : [];
  const ui = mpvUi(o, app.getPath("userData")); mpvAvecUi = ui.length > 0;
  let p;
  const fin = new Promise((resolve) => {
    try { p = spawn(mpv, ["--fs", "--save-position-on-quit", ...start, ...seul, `--input-ipc-server=${MPV_SOCK}`, `--input-conf=${mpvInputConf()}`, ...ui, "--", file], { stdio: "ignore", env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1" } }); }
    catch (err) { return resolve({ ok: false, err: String(err) }); }
    mpvBusy++; let done = false; const end = () => { if (!done) { done = true; mpvBusy--; } };
    // position et durée relevées toutes les 2 s, et rendues à la page à la fermeture de mpv (jauge « Reprendre » juste)
    const seen = { pos: 0, dur: 0 };
    const poll = setInterval(async () => { const pos = await mpvGet("time-pos"), dur = await mpvGet("duration"); if (Number(pos) >= 0) seen.pos = Number(pos); if (Number(dur) > 0) seen.dur = Number(dur);
      if (seen.dur && win && !(o && o.seul)) { try { win.webContents.send("mpv:pos", seen); } catch (_) {} } }, 2000);
    p.on("exit", (code) => { clearInterval(poll); end(); resolve({ ok: true, code, pos: seen.pos, dur: seen.dur, eof: !!(seen.dur && seen.pos > seen.dur - 20) }); });
    p.on("error", (err) => { clearInterval(poll); end(); resolve({ ok: false, err: String(err) }); });
  });
  return { fin, kill: () => { try { p && p.kill(); } catch (_) {} } };
}
ipcMain.handle("gbx:mpv", (e, file, o) => {
  if (typeof file !== "string" || !file || !fs.existsSync(file)) return { ok: false, err: "fichier" };
  return mpvJouer(file, o).fin;
});

// ---------- le lecteur seul (seul_main.js) ----------
const emusDir = () => (app.isPackaged ? path.join(process.resourcesPath, "emulateurs") : path.join(__dirname, "emulateurs"));
const LS = require("./seul_main")({ app, electron: require("electron"),
  mainWin: () => win, roots: () => mediaRoots(), mpvBin, mpvJouer, mpvSend, emusDir,
  // l'émulateur intégré embarqué (dans l'appli fabriquée : web/ejs ; dans le dépôt : build/ejs de ci/emulateurs.sh)
  ejsDir: () => [path.join(__dirname, "web", "ejs"), path.join(__dirname, "..", "build", "ejs")].find((d) => fs.existsSync(path.join(d, "data", "loader.js"))) || "",
  ouvrirComplet: () => demarrerComplet(),
  // « Ajouter ce dossier à ta bibliothèque » : retenu (lecteur-seul.json, lu au démarrage) et, si la médiathèque tourne, tout de suite
  ajouterRacine: (d) => { if (serveur && Array.isArray(serveur.roots) && !serveur.roots.includes(d)) { serveur.roots.push(d); try { serveur.rescan(); } catch (_) {} } } });

// ---------- « Ouvrir avec » et lecteur par défaut (Paramètres → Système → Lecteur par défaut) ----------
const runSync = (cmd, args) => { try { return spawnSync(cmd, args, { encoding: "utf8", timeout: 8000 }); } catch (_) { return { status: 1, stdout: "" }; } };
const desktopFile = () => path.join(os.homedir(), ".local", "share", "applications", SEUL.DESKTOP);
// à chaque démarrage normal, sans rien changer aux choix de l'utilisateur : Windows → Rembobine inscrit dans « Ouvrir
// avec » (HKEY_CURRENT_USER) ; Linux → le raccourci du menu annonce les types qu'il sait ouvrir (installations d'avant)
function inscrireOuvrirAvec() {
  if (kiosk || process.env.REMBOBINE_OUVRIR_AVEC === "0") return;
  try {
    if (process.platform === "win32" && app.isPackaged) {
      const d = LS.mem.data(); if (d.inscrit === process.execPath) return;
      const f = path.join(os.tmpdir(), `rembobine-ouvrir-avec-${process.pid}.reg`);
      fs.writeFileSync(f, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(SEUL.regWindows(process.execPath), "utf16le")]));
      const p = spawn("reg", ["import", f], { stdio: "ignore", windowsHide: true });
      p.on("exit", (code) => { try { fs.unlinkSync(f); } catch (_) {} if (code === 0) LS.mem.regler("inscrit", process.execPath); });
      p.on("error", () => {});
    }
    if (process.platform === "linux") {
      const f = desktopFile();
      if (fs.existsSync(f)) {
        const t = fs.readFileSync(f, "utf8");
        if (!/^MimeType=/m.test(t) || !t.includes("application/x-rembobine-jeu")) fs.writeFileSync(f, t.replace(/^MimeType=.*\n?/m, "").replace(/\n*$/, "\n") + SEUL.ligneMime() + "\n");
        const x = path.join(os.homedir(), ".local", "share", "mime", "packages", "rembobine.xml");
        if (!fs.existsSync(x)) { fs.mkdirSync(path.dirname(x), { recursive: true }); fs.writeFileSync(x, SEUL.mimeXml());
          for (const [c, a] of [["update-mime-database", [path.join(os.homedir(), ".local", "share", "mime")]], ["update-desktop-database", [path.dirname(f)]]]) { try { spawn(c, a, { stdio: "ignore" }).on("error", () => {}); } catch (_) {} } }
      }
    }
  } catch (e) { console.error("ouvrir avec :", e.message); }
}
ipcMain.handle("gbx:defaut", () => {
  const plat = process.platform, arm = process.arch === "arm64" || process.arch === "arm";
  if (kiosk) return { possible: false, why: "kiosque" };
  if (plat === "linux") {
    if (arm) return { possible: false, why: "raspberry" };
    if (!fs.existsSync(desktopFile())) return { possible: false, why: "installer", plat };
    if (!which("xdg-mime")) return { possible: false, why: "xdg", plat };
    return { possible: true, plat, etat: SEUL.etatLinux(runSync, LS.mem) };
  }
  if (plat === "win32") return { possible: true, plat, windows: true };
  return { possible: false, plat };
});
ipcMain.handle("gbx:defautFaire", (e, genre, actif) => {
  if (kiosk || !SEUL.MIME[genre]) return { ok: false };
  if (process.platform === "win32") {
    inscrireOuvrirAvec();
    // depuis Windows 10, seul l'utilisateur choisit : on lui ouvre la bonne page des Paramètres de Windows
    require("electron").shell.openExternal(SEUL.PAGE_DEFAUT_WINDOWS).catch(() => require("electron").shell.openExternal("ms-settings:defaultapps").catch(() => {}));
    return { ok: true, windows: true };
  }
  if (process.platform !== "linux") return { ok: false };
  inscrireOuvrirAvec();
  const r = SEUL.defautLinux(genre, !!actif, { run: runSync, memoire: LS.mem, mimeapps: path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "mimeapps.list") });
  return { ...r, etat: SEUL.etatLinux(runSync, LS.mem) };
});

// Cartouche NFC posée : on allume la télé et on la met sur Rembobine (HDMI-CEC, Raspberry Pi et PC Linux).
// Sans outil CEC installé ou sans télé compatible, rien ne se passe.
let tvBusy = false;
ipcMain.handle("gbx:tvOn", () => new Promise((resolve) => {
  if (process.platform !== "linux" || tvBusy) return resolve({ ok: false });
  const run = (bin, args, input) => new Promise((done) => {
    const p = spawn(bin, args, { stdio: [input ? "pipe" : "ignore", "ignore", "ignore"] });
    const t = setTimeout(() => { try { p.kill(); } catch (_) {} done(false); }, 8000);
    p.on("exit", (code) => { clearTimeout(t); done(code === 0); });
    p.on("error", () => { clearTimeout(t); done(false); });
    if (input) { p.stdin.on("error", () => {}); p.stdin.end(input); }
  });
  tvBusy = true;
  (async () => {
    let ok = false;
    const ctl = which("cec-ctl");
    if (ctl) for (const dev of ["/dev/cec0", "/dev/cec1"]) {
      if (!fs.existsSync(dev)) continue;
      await run(ctl, ["-d", dev, "--playback"]);
      ok = await run(ctl, ["-d", dev, "--to", "0", "--image-view-on"]);
      await run(ctl, ["-d", dev, "--to", "0", "--active-source", "phys-addr=1.0.0.0"]);
      if (ok) break;
    }
    const cli = !ok && which("cec-client");
    if (cli) ok = await run(cli, ["-s", "-d", "1"], "on 0\nas\n");
    tvBusy = false; resolve({ ok });
  })();
}));

app.whenReady().then(async () => {
  // thème sombre pour ce que dessine l'appli elle-même (fond de fenêtre, boîtes de dialogue) : sans lui, l'espace d'un
  // instant au retour de la 3D, la fenêtre montre le fond clair du système avant que la page soit redessinée
  try { require("electron").nativeTheme.themeSource = "dark"; } catch (_) {}
  // permissions demandées par la page (micro pour la voix, plein écran, manettes…) : seulement pour la page de Rembobine elle-même
  const { session } = require("electron");
  const ours = (u) => /^file:/i.test(String(u || "")) || /^rbbseul:\/\/app\//i.test(String(u || "")) || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(String(u || ""));
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb(ours((details && details.requestingUrl) || (wc && wc.getURL()))));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => ours(origin || (wc && wc.getURL())) || origin === "file://");
  if (!premiere) return;   // une deuxième Rembobine : elle a passé son fichier à la première et s'en va
  LS.protocole();
  // ouvert avec un fichier : le lecteur seul, tout de suite (rien d'autre ne démarre) ; sinon Rembobine comme toujours
  const f = fichierSeul || aOuvrir; aOuvrir = "";
  if (f) { LS.ouvrir(f, "fenetre"); pret = true; return; }
  await demarrerComplet();
  pret = true;
  if (aOuvrir) { const g = aOuvrir; aOuvrir = ""; ouvrirFichier(g); }
});
// la médiathèque complète (démarrage normal, ou « Ouvrir Rembobine » depuis le lecteur seul)
let complet = null;
function demarrerComplet() {
  if (complet) { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } return complet; }
  complet = (async () => { await startServer(); createWindow(); setTimeout(inscrireOuvrirAvec, 15000); })();
  return complet;
}
app.on("before-quit", () => { LS.stop(); M3D.stop(); M3DW.stop(); if (serveur) serveur.stop().catch(() => {}); });
app.on("window-all-closed", () => app.quit());
