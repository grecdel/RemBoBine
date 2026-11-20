// Rembobine — le module 3D (Godot) préparé À L'AVANCE et montré par un simple fondu (PC Linux, Windows, Raspberry).
//
// Avant : l'ouverture lançait le jeu comme un autre programme ; la fenêtre du logiciel disparaissait
// et la 3D s'ouvrait longtemps après (construction, sons, shaders). Maintenant :
//  1. peu après le démarrage du logiciel (quand il est au repos, pas pendant un film, et s'il y a assez de mémoire),
//     le jeu est lancé EN ARRIÈRE-PLAN (--veille=PORT:JETON, voir le module) : fenêtre hors de l'écran,
//     tout construit derrière un voile noir, puis en pause, sans son, sans image dessinée, priorité basse ;
//  2. à l'ouverture, la page fond au noir, on dit « montre » au jeu : il passe devant (encore noir), répond
//     « visible », la fenêtre du logiciel se cache, et l'image 3D apparaît en fondu ;
//  3. « Retour au logiciel » dans la 3D : le jeu fond au noir et répond « retour » ; la fenêtre du logiciel revient
//     devant (sa page est noire), on dit « cache » au jeu (il se remet hors de l'écran, en pause, SANS quitter),
//     et la page fond depuis le noir, au même endroit du salon (rbb3dRestore).
// Si le jeu n'est pas encore prêt au moment du clic (premier lancement, mémoire faible), la page reste noire avec
// une petite cassette qui tourne, puis le fondu se fait dès qu'il est prêt : aucune fenêtre ne disparaît.
//
// Canal de commande : TCP sur 127.0.0.1 seulement, port tiré par le système, jeton neuf à chaque lancement ; le jeu
// se présente avec le jeton (sinon la connexion est coupée) et chaque message porte le jeton. Le jeu se ferme tout
// seul si la connexion disparaît (jamais de processus orphelin). Même principe que le relais de la manette du
// téléphone (UDP 127.0.0.1 + jeton), gardé ici pour toute la vie du jeu et actif seulement quand il est à l'écran.
//
// Gardés comme avant : mode compatible (OpenGL) essayé tout seul si Vulkan échoue au démarrage, puis retenu ;
// mode simplifié après un plantage ; rapport de plantage (monde3d/dernier-plantage.txt) ; progression monde3d.json.
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const crypto = require("crypto");
const { spawn } = require("child_process");

module.exports = function monde3d(o) {
  // o : { app, win(), bin(), serveur(), kiosk, busy() (film en cours ?), log(texte) }
  const { app } = o;
  const log = o.log || ((t) => console.log("[monde3d] " + t));
  const dbg = (t) => { if (process.env.REMBOBINE_3D_JOURNAL) log(t); };   // détails (essais : outils du module)
  const COMPAT_FILE = () => path.join(app.getPath("userData"), "monde3d-compat");
  const SIMPLE_FILE = () => path.join(app.getPath("userData"), "monde3d-simple");
  let forceCompat = process.arch === "arm64" || process.env.REMBOBINE_GL === "compat";
  let forceSimple = false;
  try { if (fs.existsSync(COMPAT_FILE())) forceCompat = true; } catch (_) {}
  try { if (fs.existsSync(SIMPLE_FILE())) forceSimple = true; } catch (_) {}
  // REMBOBINE_3D_PRECHARGE=0 : jamais de préparation à l'avance (lancement au clic, avec la même transition)
  const allowPreload = process.env.REMBOBINE_3D_PRECHARGE !== "0";

  let G = null;            // le jeu lancé : { p, key, compat, state, lines, t0, sock, pad, wait: {ev: [fn]}, ... }
  let fails = 0;           // préparations ratées de suite (au bout de 3 : plus de préparation pendant cette session)
  let startP = null;       // lancement en cours (le clic attend la préparation déjà commencée)
  let compatNotice = false; // Vulkan a échoué pendant une préparation : à dire au logiciel au prochain retour
  let quitting = false;

  // la progression du module (monde3d.json) : le jeu l'écrit ici ; on y dépose aussi la copie du serveur de la maison
  function dir3d() { const d = path.join(app.getPath("userData"), "monde3d"); try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} return d; }

  // ---------- mémoire : préparer seulement s'il y a de la place (Raspberry 2-4 Go) ----------
  function memAvailable() {
    try { const m = /MemAvailable:\s+(\d+)/.exec(fs.readFileSync("/proc/meminfo", "utf8")); if (m) return Number(m[1]) * 1024; } catch (_) {}
    return os.freemem();
  }
  // le jeu préparé occupe environ 0,6 à 1 Go ; on garde de la marge pour le logiciel, le serveur et un film
  function memOk() {
    const tot = os.totalmem(), av = memAvailable();
    if (tot < 3.2 * 1073741824) return false;            // Raspberry 2 Go : toujours à la demande
    return av > (tot < 6 * 1073741824 ? 1.8 : 1.5) * 1073741824;
  }

  // la clé de ce qui a été préparé : les arguments du jour (sauf la météo, appliquée à chaud) et la date
  function day() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function keyOf(args) { return day() + "|" + (forceCompat ? "gl" : "vk") + (forceSimple ? "s" : "") + "|" + args.filter(a => !/^--(meteo|ville)=/.test(a)).sort().join(" "); }
  function hot(args) { const g = (k) => { const a = args.find(x => x.startsWith("--" + k + "=")); return a ? a.slice(k.length + 3) : ""; }; return { meteo: g("meteo"), ville: g("ville") }; }
  function clean(args) { return (Array.isArray(args) ? args : []).filter(a => typeof a === "string" && a.length <= 400 && /^--[a-z]+=[\p{L}\p{N}_:,' \-]*$/iu.test(a) && !/^--(veille|manette)=/.test(a)); }

  // ---------- journal de Godot (rapport de plantage) ----------
  function godotLogFile() {
    const base = process.platform === "win32" ? path.join(process.env.APPDATA || "", "Godot")
      : process.platform === "darwin" ? path.join(os.homedir(), "Library/Application Support/Godot")
      : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local/share"), "godot");
    return path.join(base, "app_userdata", "Rembobine 3D", "logs", "godot.log");
  }
  function tailFile(f, n) {
    try {
      const st = fs.statSync(f); const len = Math.min(st.size, 64000); const b = Buffer.alloc(len);
      const fd = fs.openSync(f, "r"); fs.readSync(fd, b, 0, len, st.size - len); fs.closeSync(fd);
      return b.toString("utf8").split(/\r?\n/).filter(Boolean).slice(-n);
    } catch (_) { return []; }
  }
  function crashReport(r, g) {
    const glog = godotLogFile(), gl = tailFile(glog, 60), lines = g.lines;
    const txt = ["Rapport de plantage du module 3D de Rembobine", "Date : " + new Date().toISOString(), "Durée : " + Math.round((Date.now() - g.t0) / 1000) + " s",
      "Code de sortie : " + r.code + (r.signal ? " (signal " + r.signal + ")" : ""), "État : " + g.state + (g.preload ? " (préparé à l'avance)" : ""), "Arguments : " + g.a.join(" ").replace(/--veille=\S+|--manette=\S+/g, (x) => x.split("=")[0] + "=…"),
      "Machine : " + process.platform + " " + process.arch + ", " + os.cpus().length + " cœurs, " + Math.round(os.totalmem() / 1073741824) + " Go",
      "", "--- Dernières lignes affichées par la 3D ---", ...lines.slice(-80), "", "--- Fin du journal de Godot (" + glog + ") ---", ...gl].join("\n");
    const file = path.join(dir3d(), "dernier-plantage.txt");
    try { fs.writeFileSync(file, txt); } catch (_) {}
    const all = lines.concat(gl);
    const errs = all.filter(l => /ERROR|SCRIPT|[Ee]rror|signal|crash|Segmentation|Vulkan|OpenGL/.test(l));
    return { file, lines: (errs.length ? errs : all).slice(-8).map(l => l.slice(0, 200)) };
  }

  // ---------- manette du téléphone : touches reçues par le serveur → UDP 127.0.0.1 + jeton (seulement quand le jeu est à l'écran) ----------
  function padRelay(g) {
    const S = o.serveur();
    if (!S || !S.tvTaps) return Promise.resolve(null);
    const dgram = require("dgram");
    return new Promise((resolve) => {
      const probe = dgram.createSocket("udp4");
      probe.on("error", () => { try { probe.close(); } catch (_) {} resolve(null); });
      probe.bind(0, "127.0.0.1", () => {
        const port = probe.address().port; probe.close();
        const token = crypto.randomBytes(12).toString("hex"), out = dgram.createSocket("udp4");
        out.on("error", () => {});
        const tap = (ev) => { if (g.state === "montre" && ev && (ev.type === "padin" || ev.type === "pads")) { const m = Buffer.from(JSON.stringify({ k: token, ...ev })); out.send(m, port, "127.0.0.1"); } };
        S.tvTaps.add(tap);
        resolve({ port, token, stop: () => { S.tvTaps.delete(tap); try { out.close(); } catch (_) {} } });
      });
    });
  }

  // ---------- lancer le jeu (caché) ----------
  async function start(args, compat, preload) {
    const bin = o.bin();
    try { if (process.platform !== "win32") fs.chmodSync(bin, 0o755); } catch (_) {}
    const g = { key: keyOf(args), args, compat, preload, state: "demarrage", lines: [], rest: "", t0: Date.now(), wait: {}, sock: null, exited: false, hello: false };
    const token = crypto.randomBytes(18).toString("hex");
    // le canal : on écoute, le jeu se connecte et se présente avec le jeton
    const srv = net.createServer((s) => {
      if (g.sock) { s.destroy(); return; }
      let buf = ""; s.setNoDelay(true);
      const t = setTimeout(() => { if (!g.sock) s.destroy(); }, 20000);
      s.on("data", (d) => {
        buf += d.toString("utf8"); if (buf.length > 100000) { s.destroy(); return; }
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          let j = null; try { j = JSON.parse(line); } catch (_) {}
          if (!j || typeof j !== "object") continue;
          if (!g.sock) {
            if (j.ev === "bonjour" && typeof j.k === "string" && j.k.length === token.length && crypto.timingSafeEqual(Buffer.from(j.k), Buffer.from(token))) {
              clearTimeout(t); g.sock = s; g.hello = true; try { srv.close(); } catch (_) {}
              event(g, { ev: "bonjour" });
            } else { s.destroy(); return; }
          } else event(g, j);
        }
      });
      s.on("error", () => {});
      s.on("close", () => { clearTimeout(t); if (g.sock === s) g.sock = null; });
    });
    srv.on("error", () => {});
    const port = await new Promise((res) => srv.listen(0, "127.0.0.1", () => res(srv.address().port)));
    g.srv = srv; g.token = token;
    g.pad = await padRelay(g);
    const a = ["--resolution", "64x64", "--position", "20000,20000"];
    if (compat) a.push("--rendering-method", "gl_compatibility");
    a.push("--", "--embarque", ...args, `--veille=${port}:${token}`);
    if (g.pad) a.push(`--manette=${g.pad.port}:${g.pad.token}`);
    if ((compat && process.arch !== "arm64") || forceSimple) a.push("--simplifie=1");
    g.a = a;
    const keep = (d) => {
      g.rest += d.toString("utf8"); const parts = g.rest.split(/\r?\n/); g.rest = parts.pop();
      for (const l of parts) if (l.trim()) { g.lines.push(l); if (/^\[(veille|démarrage)\]/.test(l) && process.env.REMBOBINE_3D_JOURNAL) log("godot " + l); }
      if (g.lines.length > 400) g.lines.splice(0, g.lines.length - 300);
      if (g.rest.length > 4000) g.rest = g.rest.slice(-4000);
    };
    try { g.p = spawn(bin, a, { stdio: ["ignore", "pipe", "pipe"], cwd: path.dirname(bin), env: { ...process.env, REMBOBINE_3D_DIR: dir3d() } }); }
    catch (err) { cleanup(g); g.exited = true; g.state = "fin"; g.err = String(err); return g; }
    g.p.stdout.on("data", keep); g.p.stderr.on("data", keep);
    // préparation à l'avance : priorité basse (le logiciel reste fluide pendant la construction)
    if (preload) g.p.on("spawn", () => { try { os.setPriority(g.p.pid, 10); } catch (_) {} });
    // avec un gestionnaire de fenêtres, la fenêtre du logiciel reste devant pendant que celle du jeu s'ouvre
    const w = o.win(); if (w && w.isVisible()) { try { w.setAlwaysOnTop(true); } catch (_) {} }
    g.p.on("exit", (code, signal) => { g.code = code; g.signal = signal; g.exited = true; const was = g.state; g.state = "fin"; cleanup(g); event(g, { ev: "fin", was }); });
    g.p.on("error", (err) => { g.err = String(err); if (!g.exited) { g.exited = true; g.state = "fin"; cleanup(g); event(g, { ev: "fin", was: "demarrage" }); } });
    log(`lancé (${preload ? "préparation à l'avance" : "à la demande"}, ${compat ? "compatible" : "Vulkan"})`);
    return g;
  }
  function cleanup(g) {
    try { g.srv && g.srv.close(); } catch (_) {}
    if (g.pad) { g.pad.stop(); g.pad = null; }
    if (g.sock) { try { g.sock.destroy(); } catch (_) {} g.sock = null; }
    unpin();
  }
  function unpin() { const w = o.win(); if (w) { try { w.setAlwaysOnTop(false); } catch (_) {} } }
  function send(g, cmd) { if (g && g.sock) { try { g.sock.write(JSON.stringify({ k: g.token, ...cmd }) + "\n"); return true; } catch (_) {} } return false; }
  function event(g, j) {
    if (j.ev === "pret") {
      g.state = "pret"; g.tPret = Date.now(); log(`prêt en ${((Date.now() - g.t0) / 1000).toFixed(1)} s`); unpin(); fails = 0;
      if (g.compat && compatNotice) { try { fs.writeFileSync(COMPAT_FILE(), "OpenGL\n"); } catch (_) {} }
    }
    else if (j.ev === "quitter") { quitting = true; if (o.quit) o.quit(); return; }
    else if (j.ev === "bonjour") { const w = o.win(); if (w && w.isVisible() && g.state !== "montre") { try { w.moveTop(); } catch (_) {} } }
    const l = g.wait[j.ev]; if (l) { delete g.wait[j.ev]; l.forEach(f => f(j)); }
    const any = g.wait["*"]; if (any) any.forEach(f => f(j));
    if (j.ev === "fin" && G === g) { G = null; if (j.was !== "montre" && g.preload && !quitting) fails++; }
  }
  function waitFor(g, evs, ms) {
    return new Promise((resolve) => {
      let done = false; const fin = (v) => { if (done) return; done = true; clearTimeout(t); resolve(v); };
      const t = ms ? setTimeout(() => fin({ ev: "delai" }), ms) : null;
      if (g.exited) return fin({ ev: "fin" });
      for (const e of evs.concat(["fin"])) (g.wait[e] = g.wait[e] || []).push(fin);
    });
  }
  function kill(g) {
    if (!g || g.exited) return;
    send(g, { cmd: "quitte" });
    setTimeout(() => { if (!g.exited) { try { g.p.kill(); } catch (_) {} } }, 1500);
    setTimeout(() => { if (!g.exited) { try { g.p.kill("SIGKILL"); } catch (_) {} } }, 5000);
  }

  // ---------- préparation à l'avance (appelée par la page quand le logiciel est au repos) ----------
  async function prepare(args) {
    args = clean(args);
    if (!allowPreload || quitting || startP || fails >= 3) return { ok: false, why: "off" };
    if (!fs.existsSync(o.bin())) return { ok: false, why: "absent" };
    const k = keyOf(args);
    if (G && !G.exited) {
      if (G.key === k || G.state === "montre" || G.inUse) return { ok: true, state: G.state };
      // les réglages ou le jour ont changé pendant que le jeu attendait caché : on le relance (progression sauvegardée)
      if (G.state !== "pret") return { ok: true, state: G.state };
      log("réglages changés : nouvelle préparation"); kill(G); G = null;
      return { ok: true, state: "relance" };
    }
    if ((o.busy && o.busy()) || !memOk()) return { ok: false, why: o.busy && o.busy() ? "film" : "memoire" };
    startP = start(args, forceCompat, true);
    let g; try { g = G = await startP; } finally { startP = null; }
    if (g.exited) { if (G === g) G = null; return { ok: false, why: "lancement" }; }
    // Vulkan qui échoue tout de suite : on passe au mode compatible (retenu dès qu'il marche)
    waitFor(g, ["pret"], 0).then((j) => {
      if (j.ev === "fin" && !g.hello && Date.now() - g.t0 < 20000 && !g.compat && !quitting && !g.inUse) { forceCompat = true; compatNotice = true; fails = 0; log("Vulkan indisponible : préparation en mode compatible"); setTimeout(() => prepare(g.args), 500); }
    });
    return { ok: true, state: G ? G.state : "fin" };
  }

  // ---------- l'ouverture ----------
  async function launch(args, maison) {
    const bin = o.bin();
    if (!fs.existsSync(bin)) return { ok: false, err: "absent" };
    try { const t = maison && typeof maison === "object" && !Array.isArray(maison) ? JSON.stringify(maison) : ""; if (t && t.length < 1500000) fs.writeFileSync(path.join(dir3d(), "monde3d_maison.json"), t); } catch (_) {}
    args = clean(args);
    const tClick = Date.now(), k = keyOf(args);
    if (startP) { try { await startP; } catch (_) {} }
    let g = G, compat1 = false;
    if (g && (g.exited || (g.key !== k && g.state !== "montre"))) { if (!g.exited) kill(g); g = G = null; }
    if (g && g.state === "montre") return { ok: false, err: "deja" };
    if (!g) { G = g = await start(args, forceCompat, false); }
    g.inUse = true;
    try { if (g.p && g.p.pid) os.setPriority(g.p.pid, 0); } catch (_) {}   // (sous Linux, la priorité ne remonte pas sans droits : sans gravité)
    // pas encore prêt : la page reste noire avec sa petite cassette
    if (g.state !== "pret") {
      const j = await waitFor(g, ["pret"], 0);
      if (j.ev === "fin") {
        // Vulkan refusé au démarrage : on réessaie aussitôt en mode compatible, et on s'en souvient
        if (!g.hello && Date.now() - g.t0 < 20000 && !g.compat) {
          forceCompat = true; G = g = await start(args, true, false); g.inUse = true;
          const j2 = await waitFor(g, ["pret"], 0);
          if (j2.ev === "pret") { compat1 = true; compatNotice = false; try { fs.writeFileSync(COMPAT_FILE(), "OpenGL\n"); } catch (_) {} }
        }
        if (g.state !== "pret") return finish(g, { tClick });
      }
    }
    if (compatNotice && g.compat) { compat1 = true; compatNotice = false; }
    const tReady = Date.now();
    const h = hot(args);
    send(g, { cmd: "montre", meteo: h.meteo, ville: h.ville });
    const v = await waitFor(g, ["visible"], 10000);
    if (v.ev === "fin") return finish(g, { tClick });
    const tVisible = Date.now();
    g.state = "montre";
    const w = o.win();
    unpin();
    try { w.webContents.send("m3d:etat", "visible"); } catch (_) {}
    hideWin();
    log(`clic → jeu visible : ${tVisible - tClick} ms (dont attente de la préparation ${tReady - tClick} ms)`);
    // et maintenant : « retour » (le jeu reste ouvert, caché) ou fin du jeu (fermé, ou plantage)
    const r = await waitFor(g, ["retour"], 0);
    if (r.ev === "fin") return finish(g, { tClick, tVisible, compat1 });
    const tBack = Date.now();
    g.state = "pret"; g.inUse = false;
    // le logiciel revient devant (sa page est noire), puis le jeu peut se cacher
    showWin(() => { send(g, { cmd: "cache" }); dbg("« cache » envoyé au jeu"); });
    try { if (g.p && g.p.pid) os.setPriority(g.p.pid, 10); } catch (_) {}
    const res = { ok: true, compat1, preloaded: tReady - tClick < 50, ms: { visible: tVisible - tClick } };
    readProgress(res);
    log(`retour au logiciel (${Math.round((tBack - tVisible) / 1000)} s dans la 3D), jeu gardé en veille`);
    return res;
  }
  // Cacher / remontrer la fenêtre du logiciel.
  // Avec un gestionnaire de fenêtres (PC Linux, Windows) : hide() puis show(), comme avant.
  // Sans gestionnaire de fenêtres (Rembobine OS, --kiosk ; REMBOBINE_SANS_WM=1/0 pour forcer) : la fenêtre part HORS de
  // l'écran et y reste affichée (un instant cachée : le clavier passe au jeu, X le donne à la fenêtre sous la souris) ;
  // au retour elle revient à sa place telle quelle, déjà dessinée (cachée puis remontrée, Chromium montrerait d'abord
  // une image blanche le temps de tout redessiner). Essayé sous Xvfb sans gestionnaire de fenêtres (essai du module).
  const sansWM = process.platform === "linux" && (process.env.REMBOBINE_SANS_WM ? process.env.REMBOBINE_SANS_WM === "1" : !!o.kiosk);
  let place = null;
  function hideWin() {
    const w = o.win(); if (!w) return;
    if (sansWM) { place = w.getBounds(); w.setPosition(place.x - 30000, place.y); w.hide(); w.showInactive(); }
    else w.hide();
  }
  // cacher : ce qui fait partir le jeu (« cache »), appelé quand la fenêtre du logiciel est prête derrière lui
  function showWin(cacher) {
    const w = o.win();
    const front = (fs) => { if (fs && o.kiosk) w.setFullScreen(true); try { w.moveTop(); } catch (_) {} w.focus(); dbg("fenêtre du logiciel devant"); };
    if (!w) { if (cacher) cacher(); return; }
    if (place) {
      // sans gestionnaire de fenêtres : elle revient à sa place SOUS le jeu (encore noir, plein écran), se redessine,
      // puis le jeu s'en va et elle apparaît telle quelle (pas de setFullScreen : un changement de taille la ferait
      // redessiner, avec d'abord le fond clair du système)
      const b = place; place = null;
      if (!w.isVisible()) w.showInactive();
      try { w.blur(); } catch (_) {}
      w.setBounds(b);
      const painted = w.webContents.executeJavaScript("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))", true).catch(() => 0);
      Promise.race([painted, new Promise((r) => setTimeout(r, 1500))]).then(() => setTimeout(() => {
        dbg("page redessinée sous le jeu");
        if (cacher) cacher();
        setTimeout(() => front(false), 150);
      }, 150));
      return;
    }
    if (!w.isVisible()) w.show();
    front(true);
    if (cacher) setTimeout(cacher, 80);
  }
  function readProgress(r) {
    try { const f = path.join(dir3d(), "monde3d.json"); if (fs.statSync(f).size < 2000000) { const j = JSON.parse(fs.readFileSync(f, "utf8")); if (j && typeof j === "object") r.monde3d = j; } } catch (_) {}
  }
  // le jeu s'est fermé (quitté depuis la 3D, plantage, ou démarrage impossible)
  function finish(g, t) {
    showWin();
    const r = { ok: !g.err && (g.code === 0 || (g.code === null && !g.signal)), code: g.code, signal: g.signal, quick: !t.tVisible || Date.now() - t.tVisible < 8000 };
    if (g.err) r.err = g.err;
    if (t.compat1) r.compat1 = true;
    if (!r.ok) { if (g.rest.trim()) g.lines.push(g.rest); r.crash = crashReport(r, g); r.simple = forceSimple; }
    // un démarrage impossible (aucune image montrée) : comme avant, « quick » et pas de rapport effrayant
    if (!t.tVisible) r.quick = true;
    readProgress(r);
    if (G === g) G = null;
    return r;
  }

  return {
    prepare, launch,
    // « Réessayer en mode simplifié » après un plantage : rendu compatible et qualité économie, retenus pour la suite
    simple(on) {
      forceSimple = !!on; if (on) forceCompat = true;
      try { if (on) { fs.writeFileSync(SIMPLE_FILE(), "simplifie\n"); fs.writeFileSync(COMPAT_FILE(), "OpenGL\n"); } else fs.rmSync(SIMPLE_FILE(), { force: true }); } catch (_) {}
      if (G && G.state === "pret") { kill(G); G = null; }
      return { ok: true, simple: forceSimple };
    },
    // un film commence (mpv) : le jeu préparé reste en pause ; s'il se préparait encore, on le laisse finir sans rester devant
    film() { unpin(); },
    state() { return G ? G.state : "absent"; },
    stop() { quitting = true; if (G) { kill(G); } },
    dir3d
  };
};
