// Rembobine — la bibliothèque gardée en mémoire, sur le disque du serveur (bibliotheque.json).
//   • Après chaque analyse réussie, la bibliothèque est écrite telle que le serveur s'en sert (chemins des fichiers,
//     jaquettes, épisodes, bonus, fiches publiques…), avec les « souvenirs » de l'analyse (ce qui coûte à relire : en-têtes
//     de disques, infos des jeux, .nfo). Écriture atomique : un fichier .tmp, puis renommé.
//   • Au démarrage, elle est relue AVANT que le serveur écoute : /api/library répond tout de suite, avec sa date ; la
//     nouvelle analyse tourne en arrière-plan et ne relit pas ce qui n'a pas changé (même chemin, même taille, même date).
//   • Disque débranché — dossier racine absent ou illisible, disque démonté (son dossier vide reste là), dossier illisible
//     sur le chemin : ses titres NE disparaissent PAS. Ils restent, marqués hors ligne (pub.unplugged, pub.disk = nom du
//     disque à brancher) ; la page les estompe. Quand le disque revient, une analyse les remet en ligne.
//     Dossier racine présent, disque toujours là, mais fichier disparu : vraiment supprimé (il sort de la bibliothèque).
//   • Un coup d'œil régulier aux dossiers racines (et aux disques montés) relance l'analyse quand un disque part ou revient.
// Les identifiants ne changent pas (calculés d'après le chemin du fichier dans son dossier racine) : progression, avis et
// listes de la page restent attachés aux mêmes titres d'un lancement à l'autre.
"use strict";
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const VERSION = 1;
const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
// un dossier racine répond-il ? « oui », « non » (réponse certaine : absent, pas un dossier, erreur du disque) ou « ? »
// (pas de réponse à temps : partage réseau lent ou figé, disque qui se réveille). Sans jamais bloquer le serveur, et
// jamais plus d'une demande à la fois par dossier : sur un partage figé, chaque demande occupe l'un des 4 fils de travail
// de Node jusqu'à son retour ; en relancer une à chaque coup d'œil finirait par les prendre tous (plus aucune jaquette
// ni vidéo servie). Tant que la demande d'avant n'est pas revenue, on la réutilise.
const enCours = new Map();
const dirState = (d, ms = 1500) => {
  let p = enCours.get(d);
  if (!p) { p = fsp.stat(d).then((s) => s.isDirectory(), () => false).finally(() => { if (enCours.get(d) === p) enCours.delete(d); }); enCours.set(d, p); }
  let t; return Promise.race([p.then((x) => (x ? "oui" : "non")), new Promise((r) => { t = setTimeout(() => r("?"), ms); if (t.unref) t.unref(); })]).finally(() => clearTimeout(t));
};
const isDirSoon = async (d, ms = 1500) => (await dirState(d, ms)) === "oui";
const inside = (root, p) => { const r = path.relative(root, p); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };
// l'endroit d'un titre sur le disque : son fichier, ou son dossier (série, album, photos)
const where = (it) => it.file || it.dir || (it.files && it.files[0] ? path.dirname(it.files[0]) : "") || (it.episodes && it.episodes[0] ? path.dirname(it.episodes[0].file) : "");
// le nom du disque à brancher, tel que la personne le voit (« Films_2 » pour /run/media/moi/Films_2)
const label = (d) => path.basename(String(d || "").replace(/[\\/]+$/, "")) || String(d || "");
// ce qui dépend d'un titre dans la table des identifiants : affiches de saison et grandes images (« <id>s1 », « <id>-fond »),
// disques d'un jeu (« <id>~2 »), bonus et bandes-annonces (owner), morceaux d'un film (partOf)
const OWNED = /^(.+?)(?:s\d+|-fond|-titre|~\d+)$/;

function createMemoire(o = {}) {
  const file = path.join(o.dataDir, "bibliotheque.json");
  const log = o.log || (() => {});
  const M = { file, memo: null, saved: 0, bytes: 0 };

  // ---------- disques montés (Linux) ----------
  // un disque démonté laisse souvent son dossier (vide) derrière lui : ce n'est pas « tout a été supprimé »
  function mounts() {
    if (o.mounts) { try { return new Set(o.mounts()); } catch (_) { return null; } }
    if (process.platform !== "linux") return null;
    let t; try { t = fs.readFileSync("/proc/self/mounts", "utf8"); } catch (_) { return null; }
    const out = new Set();
    for (const l of t.split("\n")) { const p = l.split(" ")[1]; if (p) out.add(p.replace(/\\([0-7]{3})/g, (m, x) => String.fromCharCode(parseInt(x, 8)))); }
    return out;
  }
  // le point de montage qui porte un chemin (le plus long qui le contient) ; « / » ne compte pas (toujours là)
  function mountOf(p, set) {
    let best = "";
    for (const m of set) if (m !== "/" && m.length > best.length && (p === m || p.startsWith(m.endsWith("/") ? m : m + "/"))) best = m;
    return best;
  }
  // après une analyse : chaque titre retient le disque monté qui le porte (pour reconnaître, plus tard, un disque démonté)
  function placer(items, set, V) {
    const real = new Map();
    // (seulement les racines que l'analyse a pu lire : elles répondent)
    const realRoot = (r) => { if (!real.has(r)) { let x = ""; if (!V || V.seen(r) === true) try { x = fs.realpathSync(r); } catch (_) {} real.set(r, x); } return real.get(r); };
    for (const it of items) {
      if (!set || !it.root) { delete it.mnt; continue; }
      const p = where(it), rr = realRoot(it.root);
      const m = p && rr ? mountOf(rr + p.slice(it.root.length), set) : "";
      if (m) it.mnt = m; else delete it.mnt;
    }
  }
  function derived(byId) {
    const own = new Map(), put = (k, x) => { if (!k) return; let l = own.get(k); if (!l) own.set(k, (l = [])); l.push(x); };
    for (const [k, x] of byId) {
      if (!x || x.kind === "episode") continue;   // (les épisodes viennent avec leur série)
      if (x.kind === "extra") put(x.owner, x);
      else if (x.partOf) put(x.partOf, x);
      else if (x.kind === "seasonimg" || x.kind === "disc") { const m = OWNED.exec(k); if (m) put(m[1], x); }
    }
    return own;
  }
  function register(byId, it, own) {
    byId.set(it.id, it);
    for (const ep of it.episodes || []) if (!byId.has(ep.id)) byId.set(ep.id, ep);
    for (const x of (own && own.get(it.id)) || []) if (!byId.has(x.id)) byId.set(x.id, x);
  }

  // ---------- après une analyse : disque absent ou fichier supprimé ? ----------
  // lib : la nouvelle analyse (avec sa vue) ; prev : la bibliothèque d'avant (gardée ou analyse précédente).
  // Rend ce qui a changé : titres ajoutés, oubliés, passés hors ligne, revenus (pour le message à la page).
  M.merge = (lib, prev, roots) => {
    const V = lib.vue, set = mounts();
    placer(lib.items, set, V);
    const ch = { added: 0, removed: 0, off: 0, back: 0, offDisks: new Set(), backDisks: new Set(), kept: 0 };
    const before = new Map(((prev && prev.items) || []).map((x) => [x.id, x]));
    for (const it of lib.items) { const p = before.get(it.id); if (!p) ch.added++; else if (p.pub && p.pub.unplugged) { ch.back++; ch.backDisks.add(p.pub.disk || label(it.root)); } }
    if (!before.size) return ch;
    // pourquoi un titre n'a pas été retrouvé : rend le nom du disque à brancher (titre gardé, hors ligne), ou "" (supprimé)
    const absent = (it) => {
      const p = where(it), root = (it.root && roots.includes(it.root)) ? it.root : roots.find((r) => inside(r, p));
      if (!root) return "";   // dossier retiré de la bibliothèque (disque « oublié ») : ses titres partent avec lui
      const seen = V && V.seen(root);
      if (seen !== true || (V && V.bad.has(root))) return label(root);   // racine absente ou illisible
      if (it.mnt && set && !set.has(it.mnt)) return label(it.mnt);   // disque démonté, dossier vide resté à sa place
      // dossier illisible sur le chemin (pour une série, un album : leur propre dossier compris)
      if (V) for (let d = it.file ? path.dirname(p) : p; d && (d === root || inside(root, d)); d = path.dirname(d)) { if (V.bad.has(d)) return label(root); if (d === root) break; }
      return "";
    };
    const own = derived(prev.byId || new Map());
    for (const it of prev.items) {
      if (lib.byId.has(it.id)) continue;
      const disk = absent(it);
      if (!disk) { ch.removed++; continue; }
      const was = !!it.pub.unplugged;
      it.pub.unplugged = true; it.pub.disk = disk;
      lib.items.push(it); register(lib.byId, it, own); ch.kept++;
      if (!was) { ch.off++; ch.offDisks.add(disk); }
    }
    if (ch.kept) lib.items.sort((a, b) => collator.compare(a.title, b.title));
    return ch;
  };

  // ---------- écrire ----------
  let queue = Promise.resolve();
  M.save = (lib, check) => {
    const inItems = new Set(); for (const it of lib.items) { inItems.add(it.id); for (const ep of it.episodes || []) inItems.add(ep.id); }
    const extra = []; for (const [k, x] of lib.byId) if (!inItems.has(k) && x && x.id === k) extra.push(x);
    let txt;
    try { txt = JSON.stringify({ v: VERSION, at: lib.at || Date.now(), check, items: lib.items, extra, memo: M.memo ? [...M.memo] : [] }); }
    catch (e) { log("error", "bibliothèque gardée : " + e.message); return queue; }
    // une écriture à la fois, dans l'ordre (la dernière analyse gagne)
    queue = queue.then(async () => {
      const tmp = file + ".tmp";
      await fsp.writeFile(tmp, txt); await fsp.rename(tmp, file);
      M.saved = Date.now(); M.bytes = Buffer.byteLength(txt);
    }).catch((e) => log("error", "bibliothèque gardée, écriture impossible : " + e.message));
    return queue;
  };
  M.flush = () => queue;

  // ---------- relire (au démarrage, avant d'écouter) ----------
  // check : signature de la clé secrète des jaquettes (une autre clé : les adresses des jaquettes ne vaudraient plus rien)
  M.load = async (roots, check) => {
    let j;
    try { j = JSON.parse(await fsp.readFile(file, "utf8")); }
    catch (e) { if (e.code !== "ENOENT") log("warn", "bibliothèque gardée illisible : analyse complète"); return null; }
    if (!j || j.v !== VERSION || !Array.isArray(j.items) || (check && j.check !== check)) { log("info", "bibliothèque gardée d'une autre version : analyse complète"); return null; }
    const own = derived(new Map((j.extra || []).filter((x) => x && x.id).map((x) => [x.id, x])));
    // (400 ms au plus : un dossier qui ne répond pas à temps — disque qui se réveille, partage lent — n'est PAS pris pour
    //  débranché, on garde ce qui était noté et l'analyse décidera ; le serveur ne démarre pas plus tard pour lui)
    const set = mounts(), up = new Map(await Promise.all(roots.map(async (r) => [r, await dirState(r, 400)]))), byId = new Map(), items = [];
    for (const it of j.items) {
      if (!it || !it.id || !it.pub || !roots.includes(it.root)) continue;   // dossier retiré de la bibliothèque entre-temps
      // disque absent dès maintenant (réponse certaine) : hors ligne tout de suite (l'analyse en arrière-plan confirmera)
      if (up.get(it.root) === "?") { /* pas de réponse à temps : comme la dernière fois */ }
      else if (up.get(it.root) === "non") { it.pub.unplugged = true; it.pub.disk = label(it.root); }
      else if (it.mnt && set && !set.has(it.mnt)) { it.pub.unplugged = true; it.pub.disk = label(it.mnt); }
      items.push(it); register(byId, it, own);
    }
    M.memo = new Map(Array.isArray(j.memo) ? j.memo : []);
    return { items, byId, at: Number(j.at) || 0 };
  };

  // ---------- un disque qui part ou qui revient ----------
  // (disques USB : maison.js le voit aussi ; ici, tout dossier racine, et les disques montés dans un dossier)
  M.watch = (S, rescan, ms) => {
    const sig = async () => {
      const set = mounts(), wanted = new Set(); for (const it of S.lib.items) if (it.mnt) wanted.add(it.mnt);
      // « ? » (pas de réponse à temps : partage lent, disque qui se réveille) n'est pas « débranché » : il garde la valeur
      // d'avant, sinon un partage qui répond tantôt en 1,4 s, tantôt en 1,6 s relancerait une analyse complète à chaque tour
      const up = await Promise.all(S.roots.map((r) => dirState(r)));
      const st = up.map((x, i) => (x === "oui" ? "1" : x === "non" ? "0" : (last && last.split("|")[0][i]) || "?")).join("");
      return st + "|" + (set ? [...wanted].filter((m) => set.has(m)).sort().join(",") : "");
    };
    let last = null, busy = false;
    sig().then((x) => { if (last === null) last = x; }, () => {});
    const t = setInterval(async () => {
      if (!S.server || !S.server.listening) { clearInterval(t); return; }   // serveur arrêté
      if (busy) return; busy = true;
      try { const now = await sig(); if (last !== null && now !== last) { log("info", "un disque est parti ou revenu : nouvelle analyse"); rescan(); } last = now; }
      catch (_) {} finally { busy = false; }
    }, ms || 10000);
    if (t.unref) t.unref();
    return t;
  };
  return M;
}

module.exports = { createMemoire, _dirState: dirState };   // (_dirState : pour les essais)
