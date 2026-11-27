// Rembobine — le module DANS la fenêtre du logiciel (PC Windows et Linux avec un bureau).
//
// Demande du propriétaire (impérative) : passer du logiciel au module par un simple fondu, dans la MÊME application,
// sans fenêtre qui se ferme ni une autre qui s'ouvre. Ici, il n'y a qu'une fenêtre :
//  1. peu après le démarrage (logiciel au repos), la version Web du module (rembobine-module.html)
//     est chargée dans une VUE de la fenêtre (WebContentsView), « garée » (voir fit), puis cachée ; elle construit tout
//     derrière un voile noir, puis se met en pause (mode « web » du module) ;
//  2. à l'ouverture : la page fond au noir, la vue passe devant (encore noire), le jeu apparaît en fondu ;
//  3. « Retour au logiciel » : le jeu fond au noir, la vue repasse dessous (le jeu en pause, PAS fermé), la page
//     fond depuis le noir. La barre de titre, la taille de la fenêtre, l'icône dans la barre des tâches ne bougent pas.
// La vue a son propre processus (la page du logiciel reste fluide pendant la construction).
// Les fichiers du module sont servis par le serveur de la maison (/module/, seulement pour cette machine) : même origine
// que la bibliothèque, que le module lit aussi.
// Si quelque chose manque (pas de serveur, pas de WebGL 2, plantage), app/main.js garde l'ancien chemin (module_natif.js).
// Même interface que module_natif.js : prepare, launch, simple, film, state, stop, dossier.
"use strict";
const path = require("path");
const fs = require("fs");

module.exports = function moduleWeb(o) {
  // o : { app, win(), serveur(), webDir(), busy(), log(), quit(), dossier() }
  const { WebContentsView, ipcMain } = require("electron");
  // journal : la sortie de l'appli, et aussi un fichier (<dossier de l'appli>/module/journal-integre.txt, refait à
  // chaque démarrage) que l'on peut envoyer quand la préparation n'aboutit pas sur une machine
  let jf = "";
  const log = (t) => {
    (o.log || ((x) => console.log("[module] " + x)))(t);
    try {
      if (!jf) { jf = path.join(o.dossier(), "journal-integre.txt"); fs.writeFileSync(jf, ""); }
      if (fs.statSync(jf).size < 1000000) fs.appendFileSync(jf, new Date().toISOString() + " " + t + "\n");
    } catch (_) {}
  };
  let V = null;            // { view, key, args, state, t0, wait: {ev: [fn]}, lines }
  let broken = "";         // raison pour laquelle la version intégrée ne marche pas ici (on passe alors à l'autre)
  let quitting = false;
  let fails = 0;
  let libRelance = 0;      // dernière nouvelle préparation due à la bibliothèque (ms)

  function day() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function keyOf(args) { return day() + "|" + args.filter(a => !/^--(meteo|ville)=/.test(a)).sort().join(" "); }
  function hot(args) { const g = (k) => { const a = args.find(x => x.startsWith("--" + k + "=")); return a ? a.slice(k.length + 3) : ""; }; return { meteo: g("meteo"), ville: g("ville") }; }
  function clean(args) { return (Array.isArray(args) ? args : []).filter(a => typeof a === "string" && a.length <= 400 && /^--[a-z]+=[\p{L}\p{N}_:,' \-]*$/iu.test(a) && !/^--(veille|manette|serveur)=/.test(a)); }

  // prête à servir ici ? (fichiers livrés, serveur de la maison démarré)
  function available() {
    if (broken || quitting) return false;
    const S = o.serveur(), d = o.webDir();
    return !!(S && S.port && d && fs.existsSync(path.join(d, "rembobine-module.wasm")) && fs.existsSync(path.join(d, "rembobine-module.pck")));
  }

  // La vue a toujours la taille de la zone de la fenêtre (sous la barre de titre), et suit ses changements de taille.
  // PENDANT LA PRÉPARATION, elle est « garée » : décalée en bas à droite, il n'en reste qu'UN pixel dans la fenêtre,
  // rendu transparent. Surtout pas setVisible(false) ni une vue entièrement hors de la fenêtre à ce moment-là : la page
  // de la vue passe alors « hidden », de taille 0, et Chromium n'appelle plus requestAnimationFrame — le module, qui
  // avance image par image, s'arrête juste après « moteur démarré » (barre figée vers 8 %, abandon au bout de 3 minutes).
  // (Les essais pilotés par Playwright ne le voyaient pas : Playwright fait passer chaque page pour visible.)
  function fit() {
    const w = o.win(); if (!w || !V) return;
    const b = w.getContentBounds();
    V.view.setBounds({ x: V.gare ? b.width - 1 : 0, y: V.gare ? b.height - 1 : 0, width: b.width, height: b.height });
  }
  const OPACITE = (x) => `document.documentElement && (document.documentElement.style.opacity = "${x}")`;
  function park(v, on) {
    v.gare = !!on;
    // garée : transparente (on voit la page du logiciel dessous) ; devant : noire et opaque comme avant
    try { v.view.setBackgroundColor(on ? "#00000000" : "#000000"); } catch (_) {}
    if (!v.exited) v.view.webContents.executeJavaScript(OPACITE(on ? 0 : 1), true).catch(() => {});
  }
  // Une fois prête (sons compris), la vue garée est « endormie » : vraiment cachée (setVisible(false)) et remise à sa
  // place normale, opaque — comme avant. Le jeu a déjà coupé ses images : il reste figé, sans rien coûter, jusqu'au
  // clic ; montrée, elle repart aussitôt. Au retour du jeu : cachée tout de suite, pareil.
  // (La laisser garée-visible après « prêt » faisait tourner le module : il coupait son rendu, et le rallumer au clic
  //  suivant coûtait une très longue image avant « visible » — 15 s sans carte graphique, essai de la fabrication dépassé.)
  function dort(v) {
    if (v.exited || v.inUse || v.state !== "pret" || !v.calme || !v.gare) return;
    try { v.view.setVisible(false); } catch (_) {}
    park(v, false);
    if (V === v) fit();
  }
  // devant la page du logiciel, ou cachée (après un passage dans le jeu : endormie aussitôt)
  function front(on) {
    if (!V) return;
    if (on && V.gare) park(V, false);   // (cliqué pendant la préparation : encore garée)
    if (on) fit();
    V.view.setVisible(!!on);
  }
  // relevé de la page du module (visibilité, taille, images) quand la préparation n'avance pas
  function releve(v) {
    if (v.exited) return Promise.resolve("");
    return v.view.webContents.executeJavaScript("JSON.stringify({vis: document.visibilityState, l: innerWidth, h: innerHeight})", true).catch((e) => "relevé impossible : " + e.message);
  }

  // dire à la page du logiciel où en est le module (« visible », ou l'avancement de la préparation quand on l'attend)
  function tell(t) { try { const w = o.win(); if (w && !w.isDestroyed()) w.webContents.send("gbx:module-etat", t); } catch (_) {} }
  // l'empreinte de la bibliothèque du serveur (lue aussi par le module) : si elle change, on re-prépare
  function libSig() {
    try {
      const S = o.serveur(), L = S && S.lib; if (!L || !L.t) return "";
      const h = require("crypto").createHash("sha1");
      // (titres et nombre de photos, pas les jaquettes : celles trouvées sur internet arrivent une à une)
      for (const x of L.items) h.update(String(x.id) + "\n" + String((x.pub && (x.pub.title + "\n" + (x.pub.count || ""))) || "") + "\n");
      return L.items.length + ":" + h.digest("hex").slice(0, 16);
    } catch (_) { return ""; }
  }

  function event(v, j) {
    if (!j || typeof j !== "object") return;
    if (j.ev === "pret") { v.state = "pret"; v.calme = j.calme !== false; fails = 0; log(`module intégré prêt en ${((Date.now() - v.t0) / 1000).toFixed(1)} s` + (v.calme ? "" : " (des sons restent à fabriquer)")); dort(v); }
    if (j.ev === "calme") { if (!v.calme) log(`module intégré : sons prêts à ${((Date.now() - v.t0) / 1000).toFixed(1)} s`); v.calme = true; dort(v); }
    // avancement de la préparation : montré par la page seulement si quelqu'un attend (ouverture demandée avant la fin)
    if (j.ev === "etape") { const p = Number(j.p); if (p > 0 && p <= 1 && p > (v.p || 0)) { v.p = p; v.tp = Date.now(); if (v.inUse && v.state !== "montre") tell("progres:" + p.toFixed(3)); } return; }
    // la bibliothèque que le jeu vient de lire (au moment où il démarre) : on retient son empreinte
    // (t = 0 : le jeu a démarré sans bibliothèque — analyse des dossiers pas finie — : dès qu'il y en a une, on re-prépare)
    if (j.ev === "biblio") { v.lib = Number(j.t) > 0 ? libSig() : ""; return; }
    if (j.ev === "erreur_js") { log("module intégré, erreur de la page : " + String(j.msg || "").slice(0, 200)); return; }
    if (j.ev === "erreur") { log("module intégré : " + String(j.msg || "").slice(0, 200)); if (/WebGL/.test(String(j.msg))) broken = "webgl"; end(v, "erreur"); return; }
    if (j.ev === "quitter") { quitting = true; try { o.quit(); } catch (_) {} return; }
    const l = v.wait[j.ev]; if (l) { delete v.wait[j.ev]; l.forEach(f => f(j)); }
  }
  function end(v, why) {
    if (v.exited) return;
    v.exited = true; v.state = "fin"; v.why = why;
    try { const S = o.serveur(); if (v.tap && S && S.tvTaps) S.tvTaps.delete(v.tap); } catch (_) {}
    try { const w = o.win(); if (w && v.resize) w.removeListener("resize", v.resize); } catch (_) {}
    const l = Object.values(v.wait).flat(); v.wait = {}; l.forEach(f => f({ ev: "fin" }));
    const w = o.win();
    try { if (w) w.contentView.removeChildView(v.view); } catch (_) {}
    try { v.view.webContents.close(); } catch (_) {}
    if (V === v) V = null;
  }
  function waitFor(v, evs, ms) {
    return new Promise((resolve) => {
      let done = false; const fin = (x) => { if (done) return; done = true; clearTimeout(t); resolve(x); };
      const t = ms ? setTimeout(() => fin({ ev: "delai" }), ms) : null;
      if (v.exited) return fin({ ev: "fin" });
      for (const e of evs.concat(["fin"])) (v.wait[e] = v.wait[e] || []).push(fin);
    });
  }
  function send(v, cmd) {
    if (!v || v.exited) return;
    v.view.webContents.executeJavaScript(`window.rbbVeilleCmd && window.rbbVeilleCmd(${JSON.stringify(JSON.stringify(cmd))})`, true).catch(() => {});
  }

  ipcMain.on("gbx:module-web", (e, s) => {
    const v = V; if (!v || e.sender !== v.view.webContents) return;
    let j = null; try { j = JSON.parse(String(s)); } catch (_) {}
    event(v, j);
  });

  function start(args) {
    const S = o.serveur(), w = o.win();
    const view = new WebContentsView({ webPreferences: {
      preload: path.join(__dirname, "preload_module.js"), contextIsolation: true, sandbox: true, nodeIntegration: false,
      backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required", spellcheck: false } });
    view.setBackgroundColor("#000000");
    const v = { view, key: keyOf(args), args, state: "demarrage", t0: Date.now(), wait: {}, exited: false };
    V = v;
    const wc = view.webContents;
    // le jeu ne quitte jamais sa page ; aucune fenêtre ne s'ouvre depuis lui
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("will-navigate", (e) => e.preventDefault());
    wc.on("render-process-gone", (e, d) => { log("module intégré : processus perdu (" + (d && d.reason) + ")"); v.crash = d && d.reason; end(v, "plantage"); });
    wc.on("did-fail-load", (e, code, desc) => { log("module intégré : chargement impossible (" + desc + ")"); end(v, "chargement"); });
    wc.on("console-message", (e, level, msg) => {
      if (/\[(veille|démarrage)\]/.test(msg) && process.env.REMBOBINE_MODULE_JOURNAL) log("godot " + msg);
      else if (level >= 3 && (v.erreurs = (v.erreurs || 0) + 1) <= 20) log("module intégré, console : " + String(msg).slice(0, 300));
    });
    wc.on("dom-ready", () => { if (v.gare) wc.executeJavaScript(OPACITE(0), true).catch(() => {}); });
    // Échap, F11 : comme dans la page du logiciel
    wc.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "F11" && w) { w.setFullScreen(!w.isFullScreen()); e.preventDefault(); } });
    park(v, true);
    w.contentView.addChildView(view);
    fit();
    if (!v.resize) { v.resize = () => fit(); w.on("resize", v.resize); }
    // le téléphone comme manette : ses touches (reçues par le serveur) passent au jeu, seulement quand il est à l'écran
    if (S.tvTaps) {
      v.tap = (ev) => { if (v.state === "montre" && ev && (ev.type === "padin" || ev.type === "pads")) send(v, { cmd: "manette", type: ev.type, e: ev.e, seats: ev.seats }); };
      S.tvTaps.add(v.tap);
    }
    const a = ["--", "--embarque", ...args, `--serveur=${S.port}`, "--veille=web"];
    wc.loadURL(`http://127.0.0.1:${S.port}/module/rembobine-module.html#${encodeURIComponent(JSON.stringify(a))}`);
    // pas de nouvelles au bout de 3 minutes : on abandonne cette préparation
    waitFor(v, ["pret"], 180000).then(async (j) => {
      if (j.ev === "delai" && v.state !== "pret" && v.state !== "montre") {
        log(`module intégré : trop lent à se préparer (bloqué à ${Math.round((v.p || 0) * 100)} %${v.tp ? " depuis " + Math.round((Date.now() - v.tp) / 1000) + " s" : ""} ; page ${await releve(v)})`);
        fails++; end(v, "delai");
        // deux fois de suite : la version intégrée ne marche pas sur cette machine, on passe au programme séparé
        if (fails >= 2) { broken = "lent"; log("module intégré abandonné sur cette machine : programme séparé à la place"); }
      }
    });
    log("module intégré : préparation");
    return v;
  }

  async function prepare(args) {
    args = clean(args);
    if (!available() || fails >= 3) return { ok: false, why: "off" };
    const k = keyOf(args);
    if (V && !V.exited) {
      if (V.state === "montre" || V.inUse) return { ok: true, state: V.state };
      // la bibliothèque du serveur a changé depuis que le jeu l'a lue (analyse finie après coup, films ajoutés) :
      // ses étagères ne seraient plus les bonnes
      let why = V.key !== k ? "réglages changés" : "";
      // (au plus une fois toutes les 5 minutes : une bibliothèque qui bouge sans cesse ne doit pas relancer le module en boucle)
      if (!why && V.state === "pret" && V.lib !== undefined && Date.now() - libRelance > 300000) { const sig = libSig(); if (sig && sig !== V.lib) { why = "bibliothèque changée"; libRelance = Date.now(); } }
      if (!why) return { ok: true, state: V.state };
      if (o.busy && o.busy()) return { ok: true, state: V.state };   // pendant un film : on ne touche à rien, on verra après
      // (tout de suite, même si l'ancienne préparation n'était pas finie : avant, il fallait attendre deux tours de 45 s)
      log(why + " : nouvelle préparation (module intégré)"); end(V, "relance");
    }
    if (o.busy && o.busy()) return { ok: false, why: "film" };
    start(args);
    return { ok: true, state: "demarrage" };
  }

  async function launch(args, maison) {
    args = clean(args);
    const tClick = Date.now(), k = keyOf(args);
    let v = V;
    if (v && (v.exited || (v.key !== k && v.state !== "montre"))) { if (!v.exited) end(v, "relance"); v = V = null; }
    if (v && v.state === "montre") return { ok: false, err: "deja" };
    if (!v) v = start(args);
    v.inUse = true;
    if (v.state !== "pret") {
      tell("progres:" + (v.p || 0.02).toFixed(3));   // pas encore prête : la page montre où elle en est
      const j = await waitFor(v, ["pret"], 0);
      if (j.ev !== "pret") return finish(v, { tClick });
    }
    // des sons restent à fabriquer (première ouverture sans sons livrés) : on les attend, pour entrer sans saccade
    if (!v.calme) {
      tell("progres:" + (v.p || 0.99).toFixed(3));
      await waitFor(v, ["calme"], 90000);
      if (v.exited) return finish(v, { tClick });
      v.calme = true;   // (jamais annoncé au bout de 90 s : on n'attendra pas de nouveau au clic suivant)
    }
    const tReady = Date.now();
    let m = "";
    try { m = maison && typeof maison === "object" && !Array.isArray(maison) ? JSON.stringify(maison) : ""; if (m.length > 1500000) m = ""; } catch (_) { m = ""; }
    const h = hot(args);
    // la vue passe devant (le jeu est encore tout noir), prend le clavier, et le jeu apparaît en fondu
    front(true);
    try { v.view.webContents.focus(); } catch (_) {}
    send(v, { cmd: "montre", meteo: h.meteo, ville: h.ville, maison: m, essai_retour: process.env.REMBOBINE_MODULE_ESSAI_RETOUR || "" });
    const vis = await waitFor(v, ["visible"], 15000);
    if (vis.ev === "fin") return finish(v, { tClick });
    v.state = "montre";
    const tVisible = Date.now();
    const w = o.win();
    tell("visible");
    log(`clic → module visible (intégré) : ${tVisible - tClick} ms (dont attente de la préparation ${tReady - tClick} ms)`);
    const r = await waitFor(v, ["retour"], 0);
    if (r.ev === "fin") return finish(v, { tClick, tVisible });
    // la progression (rangée par le jeu dans sa page) rejoint celle de la version séparée
    if (typeof r.progres === "string" && r.progres.length < 2000000) { try { fs.writeFileSync(path.join(o.dossier(), "module.json"), r.progres); } catch (_) {} }
    v.state = "pret"; v.inUse = false;
    front(false);
    try { w.webContents.focus(); } catch (_) {}
    send(v, { cmd: "cache" });
    const res = { ok: true, integre: true, preloaded: tReady - tClick < 50, ms: { visible: tVisible - tClick } };
    readProgress(res);
    log(`retour au logiciel (${Math.round((Date.now() - tVisible) / 1000)} s dans le module), module gardé en pause`);
    return res;
  }
  function readProgress(r) {
    try { const f = path.join(o.dossier(), "module.json"); if (fs.statSync(f).size < 2000000) { const j = JSON.parse(fs.readFileSync(f, "utf8")); if (j && typeof j === "object") r.progres = j; } } catch (_) {}
  }
  function finish(v, t) {
    const w = o.win();
    try { if (w) w.webContents.focus(); } catch (_) {}
    const r = { ok: !v.crash && v.why !== "erreur", quick: !t.tVisible, integre: true };
    if (v.crash) r.crash = { file: "", lines: ["Le module intégré s'est arrêté (" + v.crash + ")."] };
    readProgress(r);
    if (!v.exited) end(v, "fin");
    return r;
  }

  return {
    available, prepare, launch,
    simple() { return { ok: true }; },
    film() {},
    state() { return V ? V.state : "absent"; },
    broken: () => broken,
    viewId: () => (V && !V.exited ? V.view.webContents.id : -1),
    stop() { quitting = true; if (V) end(V, "stop"); }
  };
};
