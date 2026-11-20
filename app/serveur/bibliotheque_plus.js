// Rembobine — bibliothèque, suite : ce que le « scan » range en plus, et le renommage des fichiers.
//   Bandes-annonces : « Film-trailer.mp4 » ou un dossier « Trailers/ » à côté du film (jamais comptées comme des films).
//   Bonus de DVD : dossiers Extras / Featurettes / Bonus / Behind The Scenes…, ou suffixes -featurette, -behindthescenes…
//   Films en plusieurs morceaux (CD1/CD2, part1/part2) : un seul film, lu d'un seul tenant.
//   Séries : affiche de chaque saison (season01-poster.jpg, ou poster.jpg dans « Saison 1/ ») et titre des épisodes
//            (.nfo de l'épisode, sinon le nom du fichier ; TMDB seulement si l'option internet est active).
//   Date d'ajout, taille, qualité (pour « Ajoutés récemment », le tri par taille, les doublons), dossier « Enfants ».
//   Renommage « Titre (Année).ext » : seulement à la demande, avec confirmation, et annulable (journal des renommages).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VIDEO = new Set(["mp4", "m4v", "mkv", "avi", "mov", "webm", "wmv", "ts", "m2ts", "mpg", "mpeg", "ogv"]);
const IMAGE = new Set(["jpg", "jpeg", "png", "webp"]);
const TRAILER_DIR = /^(trailers?|bandes?[ ._-]?annonces?)$/i;
const EXTRA_DIR = /^(extras?|featurettes?|bonus|behind[ ._-]?the[ ._-]?scenes|deleted[ ._-]?scenes|sc[eè]nes?[ ._-]?coup[ée]es|interviews?|scenes|shorts|making[ ._-]?of|coulisses|others?)$/i;
const TRAILER_SUFFIX = /(?:^|[ ._-])(trailer|bande[ ._-]?annonce)$/i;
const EXTRA_SUFFIX = /[ ._-](featurette|behindthescenes|deleted|deletedscene|interview|scene|short|other|extra|bonus|makingof)$/i;
const EXTRA_LABEL = { featurette: "Reportage", behindthescenes: "Coulisses", deleted: "Scène coupée", deletedscene: "Scène coupée", interview: "Entretien", scene: "Scène",
  short: "Court métrage", other: "Bonus", extra: "Bonus", bonus: "Bonus", makingof: "Making-of" };
const PART = /[ ._-]*[([]?\b(?:cd|dis[ck]|dvd|part|pt|partie)[ ._-]?(\d{1,2})[)\]]?$/i;
const KIDS = /[\\/](enfants?|kids|jeunesse|dessins?[ ._-]?anim[ée]s?)[\\/]/i;

const ext = (f) => path.extname(f).slice(1).toLowerCase();
const stemOf = (f) => path.basename(f).replace(/\.[^.]+$/, "");
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const lsDisk = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return []; } };
const statDisk = (f) => { try { return fs.statSync(f); } catch (_) { return null; } };
const ls = lsDisk;
const xid = (f) => "x" + crypto.createHash("sha1").update("extra:" + f).digest("hex").slice(0, 14);
const quality = (s) => /2160p|\b4k\b|uhd/i.test(s) ? (/hdr|\bdv\b|dolby/i.test(s) ? "4K HDR" : "4K") : /1080p/i.test(s) ? "1080p" : /720p/i.test(s) ? "720p" : /480p|dvdrip|\bdvd\b/i.test(s) ? "480p" : "";

// « bande-annonce », « bonus » ou rien : sert au scan pour ne pas compter ces fichiers comme des films ou des épisodes
function extraKind(file, base) {
  const st = stemOf(file);
  if (TRAILER_SUFFIX.test(st)) return "trailer";
  if (EXTRA_SUFFIX.test(st)) return "extra";
  const parts = path.relative(base || path.dirname(path.dirname(file)), path.dirname(file)).split(path.sep);
  if (parts.some((p) => TRAILER_DIR.test(p))) return "trailer";
  if (parts.some((p) => EXTRA_DIR.test(p))) return "extra";
  return "";
}
// « Film CD2 » → { stem: "Film", n: 2 }
function partOf(file) { const st = stemOf(file), m = PART.exec(st); return m && m.index > 0 ? { stem: st.slice(0, m.index), n: Number(m[1]) } : null; }

function prettyExtra(file, stem) {
  let s = stemOf(file); if (stem && s.toLowerCase().startsWith(stem.toLowerCase())) s = s.slice(stem.length);
  const m = EXTRA_SUFFIX.exec(s); if (m) { const rest = s.slice(0, m.index).replace(/^[ ._-]+/, "").replace(/[._]+/g, " ").trim(); return rest || EXTRA_LABEL[m[1].toLowerCase()] || "Bonus"; }
  return s.replace(/^[ ._-]+/, "").replace(/[._]+/g, " ").trim() || "Bonus";
}

// titre d'un épisode : le .nfo posé à côté (<title>), sinon ce qui suit S01E02 dans le nom du fichier
// (V : la vue de l'analyse en cours — le .nfo n'est lu que s'il existe, et pas relu tant qu'il ne change pas)
function episodeName(file, V) {
  const nfo = file.replace(/\.[^.]+$/, ".nfo");
  const fromNfo = () => { try { const x = fs.readFileSync(nfo, "utf8"), m = /<title>([^<]{1,200})<\/title>/i.exec(x); if (m && m[1].trim()) return m[1].trim().replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'); } catch (_) {} return ""; };
  const t = V ? (V.isFile(nfo) ? V.recall("ep|" + nfo, V.sig(nfo), fromNfo) : "") : fromNfo(); if (t) return t;
  const st = stemOf(file), m = /s\d{1,2}\s*e\d{1,3}(?:[-e]\d{1,3})?|\b\d{1,2}x\d{1,3}\b/i.exec(st); if (!m) return "";
  let rest = st.slice(m.index + m[0].length).replace(/[._]+/g, " ");
  rest = rest.replace(/\b(1080p|720p|2160p|480p|4k|bluray|brrip|webrip|web[ -]?dl|hdtv|x264|x265|h264|h265|hevc|multi|french|vostfr|truefrench|vf|vo)\b.*$/i, "").replace(/^[\s\-–:]+|[\s\-–:]+$/g, "").trim();
  return /[a-zà-ÿ]{2,}/i.test(rest) ? rest : "";
}

// Après le scan : bonus, bandes-annonces, morceaux, saisons, tailles. `cleanTitle` vient de bibliotheque.js.
// o.vue : la vue de l'analyse (dossiers déjà lus, fichiers déjà examinés) — sans elle, on relit le disque
function enrich(lib, o) {
  const { cleanTitle, coverUrl } = o, byId = lib.byId, V = o.vue;
  const ls = V ? V.listSync : lsDisk, stat = V ? V.stat : statDisk;
  const films = lib.items.filter((x) => x.kind === "film" && x.file);
  // 1. films en plusieurs morceaux : même dossier, même nom sans « CD1 / part2 »
  const groups = new Map();
  for (const f of films) { const p = partOf(f.file); if (!p) continue; const k = path.dirname(f.file) + "|" + norm(p.stem); if (!groups.has(k)) groups.set(k, []); groups.get(k).push([p.n, f]); }
  const drop = new Set();
  for (const g of groups.values()) {
    if (g.length < 2 || new Set(g.map((x) => x[0])).size !== g.length) continue;
    g.sort((a, b) => a[0] - b[0]);
    const main = g[0][1], dir = path.dirname(main.file);
    const alone = films.filter((x) => path.dirname(x.file) === dir).length === g.length;
    const t = alone && !/^(films?|movies?)$/i.test(path.basename(dir)) ? cleanTitle(path.basename(dir)) : cleanTitle(partOf(main.file).stem + ".mkv");
    main.title = t.title; main.pub.title = t.title; if (t.year) main.pub.year = t.year;
    main.parts = g.map((x) => x[1].file);
    main.pub.parts = g.map((x) => x[1].id);
    main.pub.size = g.reduce((a, x) => a + (stat(x[1].file) || { size: 0 }).size, 0);
    for (const [, x] of g.slice(1)) { drop.add(x); x.partOf = main.id; }
  }
  if (drop.size) lib.items = lib.items.filter((x) => !drop.has(x));
  // 2. films : date d'ajout, qualité, bandes-annonces et bonus
  const registerExtra = (file, kind, title, owner) => { const id = xid(file); byId.set(id, { id, kind: "extra", title, file, owner }); return id; };
  // films par dossier, comptés une fois (avant : tous les films parcourus pour chacun d'eux, 1,6 million de tours pour 1 300 films)
  const perDir = new Map(); for (const x of lib.items) if (x.kind === "film" && x.file) { const d = path.dirname(x.file); perDir.set(d, (perDir.get(d) || 0) + 1); }
  for (const f of lib.items.filter((x) => x.kind === "film" && x.file)) {
    const st = stat(f.file), dir = path.dirname(f.file), stem = f.parts ? partOf(f.file).stem : stemOf(f.file);
    f.pub.mtime = st ? Math.round(st.mtimeMs) : 0; f.pub.name = path.basename(f.file); f.pub.quality = quality(path.basename(f.file) + " " + path.basename(dir));
    if (KIDS.test(f.file)) f.pub.kids = true;
    const alone = perDir.get(dir) === 1 && !/^(films?|movies?)$/i.test(path.basename(dir));
    const trailers = [], extras = [];
    for (const e of ls(dir)) {
      const full = path.join(dir, e.name);
      if (e.isFile() && VIDEO.has(ext(e.name)) && full !== f.file && !(f.parts || []).includes(full)) {
        const s = stemOf(e.name), mine = s.toLowerCase().startsWith(stem.toLowerCase()) || alone;
        if (!mine) continue;
        if (TRAILER_SUFFIX.test(s)) trailers.push(full); else if (EXTRA_SUFFIX.test(s)) extras.push([full, prettyExtra(full, stem)]);
      } else if (e.isDirectory() && alone && (TRAILER_DIR.test(e.name) || EXTRA_DIR.test(e.name))) {
        for (const x of ls(full)) if (x.isFile() && VIDEO.has(ext(x.name))) { const xf = path.join(full, x.name); if (TRAILER_DIR.test(e.name)) trailers.push(xf); else extras.push([xf, prettyExtra(xf, "")]); }
      }
    }
    if (trailers.length) { trailers.sort(); f.pub.trailer = registerExtra(trailers[0], "trailer", "Bande-annonce", f.id); }
    if (extras.length) f.pub.extras = extras.sort((a, b) => a[1].localeCompare(b[1], "fr")).map(([xf, t]) => ({ id: registerExtra(xf, "extra", t, f.id), title: t }));
  }
  // 3. séries : affiches de saison, titres d'épisodes, taille, date
  for (const s of lib.items.filter((x) => x.kind === "serie")) {
    const dir = s.dir || (s.episodes[0] && path.dirname(s.episodes[0].file)); if (!dir) continue;
    const posters = {};
    const addPoster = (n, file) => { if (posters[n] != null) return; const id = `${s.id}s${n}`; byId.set(id, { id, kind: "seasonimg", coverFile: file }); posters[n] = coverUrl(id); };
    for (const e of ls(dir)) {
      if (e.isFile() && IMAGE.has(ext(e.name))) { const m = /^season[ ._-]?(\d{1,2}|specials)[ ._-]?(?:poster)?$/i.exec(stemOf(e.name)); if (m) addPoster(/specials/i.test(m[1]) ? 0 : Number(m[1]), path.join(dir, e.name)); }
      else if (e.isDirectory()) { const m = /^(?:saison|season|s)[ ._-]*(\d{1,2})$/i.exec(e.name); if (!m) continue;
        const sub = path.join(dir, e.name), img = ls(sub).find((x) => x.isFile() && IMAGE.has(ext(x.name)) && /^(poster|folder|cover|season)$/i.test(stemOf(x.name)));
        if (img) addPoster(Number(m[1]), path.join(sub, img.name)); }
    }
    if (Object.keys(posters).length) s.pub.seasonPosters = posters;
    let size = 0, mt = 0;
    s.episodes.forEach((ep, i) => { const st = stat(ep.file); if (st) { size += st.size; mt = Math.max(mt, st.mtimeMs); } const nm = episodeName(ep.file, V); if (nm) { ep.name = nm; if (s.pub.episodes[i]) s.pub.episodes[i].name = nm; } });
    s.pub.size = size; s.pub.mtime = Math.round(mt); s.pub.quality = quality(s.episodes.map((x) => path.basename(x.file)).join(" "));
    if (KIDS.test(dir + path.sep)) s.pub.kids = true;
  }
  // 4. jeux : taille et date
  for (const g of lib.items.filter((x) => x.kind === "game" && x.file)) { const st = stat(g.file); if (st) { g.pub.size = st.isFile() ? st.size : 0; g.pub.mtime = Math.round(st.mtimeMs); } if (KIDS.test(g.file)) g.pub.kids = true; }
  return lib;
}

// ---------- internet (seulement si l'option des fiches est active et qu'une clé TMDB est réglée) ----------
// titres d'épisodes et affiches de saison sur TMDB, gardés sur le disque
function createSaisons(o) {
  const dir = path.join(o.dataDir, "fiches"); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "saisons.json"), F = o.fetch || fetch, B = { tmdb: "https://api.themoviedb.org", tmdbImg: "https://image.tmdb.org", ...(o.bases || {}) };
  let db = {}; try { db = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) {}
  const save = () => { try { fs.writeFileSync(file + ".tmp", JSON.stringify(db)); fs.renameSync(file + ".tmp", file); } catch (_) {} };
  async function get(url, json = true) { try { const r = await F(url, { headers: { Accept: json ? "application/json" : "*/*" } }); if (!r.ok) return null; return json ? await r.json() : Buffer.from(await r.arrayBuffer()); } catch (_) { return null; } }
  async function fetchAll(items, key) {
    let n = 0;
    for (const s of items.filter((x) => x.kind === "serie" && x.pub.tmdb)) {
      const rec = db[s.id] || (db[s.id] = { t: 0, seasons: {} }); if (Date.now() - rec.t < 7 * 86400000) continue;
      for (const sn of [...new Set(s.episodes.map((e) => e.s))]) {
        const d = await get(`${B.tmdb}/3/tv/${encodeURIComponent(s.pub.tmdb)}/season/${sn}?api_key=${encodeURIComponent(key)}&language=fr-FR`); if (!d) continue;
        const R = rec.seasons[sn] = { names: {} };
        for (const e of d.episodes || []) if (e.name) R.names[e.episode_number] = e.name;
        if (d.poster_path) { const buf = await get(`${B.tmdbImg}/t/p/w342${d.poster_path}`, false); if (buf && buf.length > 200) { const f = path.join(dir, `${s.id}-s${sn}.jpg`); fs.writeFileSync(f, buf); R.poster = f; } }
        n++;
      }
      rec.t = Date.now(); save();
    }
    return n;
  }
  // ce qui vient des fichiers (nfo, nom, image posée à côté) reste prioritaire
  function apply(lib, coverUrl) {
    for (const s of lib.items.filter((x) => x.kind === "serie")) {
      const rec = db[s.id]; if (!rec) continue;
      s.episodes.forEach((ep, i) => { const nm = rec.seasons[ep.s] && rec.seasons[ep.s].names[ep.e]; if (nm && !ep.name) { ep.name = nm; if (s.pub.episodes[i]) s.pub.episodes[i].name = nm; } });
      for (const [sn, R] of Object.entries(rec.seasons)) {
        if (!R.poster || !fs.existsSync(R.poster) || (s.pub.seasonPosters && s.pub.seasonPosters[sn])) continue;
        const id = `${s.id}s${sn}`; lib.byId.set(id, { id, kind: "seasonimg", coverFile: R.poster }); (s.pub.seasonPosters = s.pub.seasonPosters || {})[sn] = coverUrl(id);
      }
    }
  }
  return { fetchAll, apply };
}

// ---------- renommage « Titre (Année).ext », avec journal pour annuler ----------
const BAD = /[\\/:*?"<>|\u0000-\u001f]/g;
const TECH = /(\d{3,4}p|x26[45]|h26[45]|hevc|blu-?ray|brrip|web-?dl|webrip|hdtv|dvdrip|multi|truefrench|vostfr|french|\[[^\]]*\])/i;
function suggestName(it) {
  if (it.kind !== "film" || !it.file || it.parts) return "";
  const year = it.pub.year ? ` (${it.pub.year})` : "", e = ext(it.file);
  let t = String(it.title).replace(BAD, " ").replace(/\s+/g, " ").trim(); t = t.charAt(0).toUpperCase() + t.slice(1);
  const want = `${t}${year}.${e}`;
  const cur = path.basename(it.file);
  if (cur === want) return "";
  // on ne propose que pour les noms « techniques » : points, tirets bas, marques de qualité, année manquante
  if (!/[._]/.test(stemOf(cur)) && !TECH.test(cur) && (!it.pub.year || cur.includes(String(it.pub.year)))) return "";
  return want;
}
function createRenamer(o) {
  const file = path.join(o.dataDir, "renommages.json");
  let J = []; try { J = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) {}
  const save = () => { try { fs.writeFileSync(file + ".tmp", JSON.stringify(J, null, 1)); fs.renameSync(file + ".tmp", file); } catch (_) {} };
  const inRoots = (f) => o.roots().some((r) => { const rel = path.relative(r, f); return rel && !rel.startsWith("..") && !path.isAbsolute(rel); });
  function suggestions(items) { return items.filter((x) => x.kind === "film").map((x) => ({ id: x.id, title: x.title, year: x.pub.year || "", from: path.basename(x.file || ""), to: suggestName(x) })).filter((x) => x.to); }
  // le fichier et ce qui l'accompagne (sous-titres, .nfo, jaquette, -trailer) changent de nom ensemble
  function plan(it, name) {
    name = String(name || "").replace(BAD, " ").replace(/\s+/g, " ").trim();
    if (!name || name === "." || name === ".." || name.startsWith(".")) return { err: "Nom vide ou interdit." };
    const e = ext(it.file); if (ext(name) !== e) name = name.replace(/\.[^.]*$/, (m) => /\.[a-z0-9]{2,4}$/i.test(m) && !/\s/.test(m) ? "" : m) + "." + e;
    const dir = path.dirname(it.file), oldStem = stemOf(it.file), newStem = stemOf(name);
    if (oldStem === newStem) return { err: "C'est déjà ce nom." };
    const moves = [];
    for (const x of ls(dir)) {
      if (!x.isFile()) continue;
      const n = x.name; if (n === path.basename(it.file)) { moves.push([it.file, path.join(dir, name)]); continue; }
      if (n.startsWith(oldStem + ".") || n.startsWith(oldStem + "-")) moves.push([path.join(dir, n), path.join(dir, newStem + n.slice(oldStem.length))]);
    }
    for (const [a, b] of moves) { if (!inRoots(a) || !inRoots(b)) return { err: "Hors des dossiers de la bibliothèque." }; if (fs.existsSync(b)) return { err: `« ${path.basename(b)} » existe déjà.` }; }
    return { moves };
  }
  function doMoves(moves) {
    const done = [];
    try { for (const [a, b] of moves) { fs.renameSync(a, b); done.push([a, b]); } }
    catch (e) { for (const [a, b] of done.reverse()) { try { fs.renameSync(b, a); } catch (_) {} } return { ok: false, err: "Renommage impossible : " + e.code }; }
    return { ok: true };
  }
  function rename(it, name, extra) {
    const p = plan(it, name); if (p.err) return { ok: false, err: p.err };
    const r = doMoves(p.moves); if (!r.ok) return r;
    const n = (J.length ? J[J.length - 1].n : 0) + 1;
    J.push({ n, t: Date.now(), title: it.title, moves: p.moves.map(([a, b]) => [a, b]), ...(extra || {}) }); if (J.length > 300) J = J.slice(-300); save();
    return { ok: true, n, moves: p.moves.length };
  }
  function undo(n) {
    const i = J.findIndex((x) => x.n === Number(n)); if (i < 0) return { ok: false, err: "Introuvable dans le journal." };
    const rec = J[i], back = rec.moves.map(([a, b]) => [b, a]).reverse();
    for (const [a, b] of back) { if (!fs.existsSync(a)) return { ok: false, err: `« ${path.basename(a)} » n'existe plus.` }; if (fs.existsSync(b)) return { ok: false, err: `« ${path.basename(b)} » existe déjà.` }; }
    const r = doMoves(back); if (!r.ok) return r;
    J.splice(i, 1); save(); return { ok: true, rec };
  }
  return { suggestions, rename, undo, journal: () => J.slice().reverse().map((x) => ({ n: x.n, t: x.t, title: x.title, from: path.basename(x.moves[0][0]), to: path.basename(x.moves[0][1]), files: x.moves.length })) };
}

// identifiant d'un film d'après son chemin (même calcul que bibliotheque.js), pour garder la reprise après un renommage
const filmId = (root, f) => "f" + crypto.createHash("sha1").update("film:" + path.relative(root, f)).digest("hex").slice(0, 14);

// ---------- les adresses /api de ce module ----------
function createRoutes(S, h) {
  const R = createRenamer({ dataDir: S.data, roots: () => S.roots });
  const SA = createSaisons({ dataDir: S.data, fetch: h.fetch, bases: h.bases });
  const imgCache = new Map();
  async function route(p, req, res, url, W) {
    let m;
    // affiches proposées pour « Corriger la fiche » (le serveur cherche ; l'appareil choisit)
    if ((m = /^\/api\/fiche\/([^/]+)\/posters$/.exec(p)) && req.method === "POST") {
      const it = S.lib.byId.get(m[1]); if (!it) { h.send(res, 200, { ok: false, err: "Introuvable." }); return true; }
      const b = await h.body(req), list = await S.fiches.posters(it, String(b.query || "").slice(0, 120), S.cfg.tmdbKey || "");
      h.send(res, 200, { ok: true, list: list.map((x, i) => ({ i, label: x.label, url: `/api/posters/${it.id}/${i}` })) }); return true;
    }
    if ((m = /^\/api\/posters\/([^/]+)\/(\d+)$/.exec(p))) {
      const k = m[1] + "/" + m[2]; let buf = imgCache.get(k);
      if (!buf) { const c = S.fiches.candidate(m[1], Number(m[2])); buf = c ? await S.fiches.download(c.url) : null; if (buf) { imgCache.set(k, buf); if (imgCache.size > 60) imgCache.delete(imgCache.keys().next().value); } }
      if (!buf) { h.send(res, 404, { ok: false }); return true; }
      res.writeHead(200, { "Content-Type": buf[0] === 0x89 ? "image/png" : "image/jpeg", "Cache-Control": "private, max-age=3600" }); res.end(buf); return true;
    }
    if ((m = /^\/api\/fiche\/([^/]+)\/poster$/.exec(p)) && req.method === "POST") {
      if (W.guest) { h.send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." }); return true; }
      const it = S.lib.byId.get(m[1]); if (!it) { h.send(res, 200, { ok: false, err: "Introuvable." }); return true; }
      const b = await h.body(req), r = await S.fiches.choosePoster(it, Number(b.i));
      if (r.ok) { it.pub.cover = h.coverUrl(it.id) + "&v=" + Date.now(); S.lib.t = Date.now(); }
      h.send(res, 200, r); return true;
    }
    // renommage : propositions, renommer (confirmation obligatoire), journal et annulation
    if (p === "/api/rename" && req.method !== "POST") { h.send(res, 200, { ok: true, list: R.suggestions(S.lib.items), journal: R.journal() }); return true; }
    if (p === "/api/rename" || p === "/api/rename/undo") {
      if (W.guest) { h.send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." }); return true; }
      const b = await h.body(req);
      if (b.confirm !== true) { h.send(res, 200, { ok: false, err: "Confirmation demandée." }); return true; }
      let r;
      if (p === "/api/rename") {
        const it = S.lib.byId.get(String(b.id || "")); if (!it || it.kind !== "film" || !it.file) { h.send(res, 200, { ok: false, err: "Film introuvable." }); return true; }
        const root = S.roots.find((x) => !path.relative(x, it.file).startsWith("..")) || S.roots[0];
        r = R.rename(it, b.name, { root });
        if (r.ok) { const to = R.journal()[0], nf = path.join(path.dirname(it.file), to.to); carry(it.id, filmId(root, nf)); }
      } else {
        r = R.undo(b.n);
        if (r.ok && r.rec.root) carry(filmId(r.rec.root, r.rec.moves[0][1]), filmId(r.rec.root, r.rec.moves[0][0]));
      }
      if (r.ok) await S.rescan();
      h.send(res, 200, r.rec ? { ok: true } : r); return true;
    }
    return false;
  }
  // la position de lecture et la fiche suivent le fichier renommé
  function carry(a, b) {
    if (S.prog[a]) { S.prog[b] = S.prog[a]; delete S.prog[a]; h.saveProg(); }
    const db = S.fiches.db(); if (db[a]) { db[b] = db[a]; delete db[a]; S.fiches.save(); }
  }
  return { route, saisons: SA };
}

module.exports = { extraKind, partOf, episodeName, enrich, createSaisons, createRenamer, createRoutes, suggestName, quality };
