// Rembobine — les profils de la famille, côté serveur de la maison.
// 1) « Continuer à regarder » partagé entre les appareils : pour chaque profil (reconnu par son nom) et chaque titre,
//    on garde où il en est (pourcentage, épisode, appareil, heure). Quand deux appareils ne sont pas d'accord,
//    le plus récent gagne. Un titre retiré de l'historique laisse une « pierre tombale » datée, pour que les autres
//    appareils l'oublient aussi. Un titre seulement retiré de « Reprendre » (le « × » de sa jaquette) laisse une pierre
//    tombale marquée « drop » : les autres appareils le retirent de « Reprendre » mais gardent leur historique. Une
//    position plus ancienne ne le fait pas revenir ; une plus récente (titre relancé, ou « Annuler ») le remet.
// 2) L'âge conseillé d'un film, d'une série ou d'un jeu, lu dans le .nfo posé à côté (balises Kodi <mpaa>, <certification>).
// Aucune dépendance, rien sur internet.
"use strict";
const fs = require("fs");
const path = require("path");

const MAX_PAR_PROFIL = 1500;

function readJson(f, def) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (_) { return def; } }
function writeJson(f, v) { try { fs.writeFileSync(f + ".tmp", JSON.stringify(v)); fs.renameSync(f + ".tmp", f); } catch (_) {} }
// le profil est reconnu par son nom (« Léa » sur la TV = « léa » sur le téléphone)
const keyOf = (name) => String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
const cut = (v, n) => String(v == null ? "" : v).slice(0, n);
const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : undefined);

function clean(e) {
  if (!e || typeof e !== "object") return null;
  const at = Number(e.at); if (!Number.isFinite(at) || at <= 0) return null;
  if (e.gone) return e.drop ? { at, gone: true, drop: true } : { at, gone: true };   // drop : retiré de « Reprendre » seulement
  const x = { at, pct: Math.max(0, Math.min(100, Number(e.pct) || 0)) };
  if (e.dev) x.dev = cut(e.dev, 40);
  if (e.title) x.title = cut(e.title, 120);
  if (e.kind) x.kind = cut(e.kind, 12);
  if (int(e.s) !== undefined) x.s = int(e.s);
  if (int(e.e) !== undefined) x.e = int(e.e);
  if (e.done) x.done = true;
  if (e.seen) x.seen = true;
  return x;
}

function createProfils({ dataDir, emit = () => {} }) {
  const file = path.join(dataDir, "reprise.json");
  const db = readJson(file, {});
  const save = () => writeJson(file, db);

  function get(name) { return db[keyOf(name)] || {}; }
  // fusion : pour chaque titre, la version la plus récente gagne
  function merge(name, entries) {
    const k = keyOf(name); if (!k || !entries || typeof entries !== "object") return null;
    const P = db[k] || (db[k] = {}); let changed = 0;
    for (const [id, e] of Object.entries(entries).slice(0, 3000)) {
      const sid = cut(id, 300), x = clean(e); if (!sid || !x) continue;
      if (!P[sid] || x.at > P[sid].at) { P[sid] = x; changed++; }
    }
    const ids = Object.keys(P);
    if (ids.length > MAX_PAR_PROFIL) ids.sort((a, b) => P[a].at - P[b].at).slice(0, ids.length - MAX_PAR_PROFIL).forEach((id) => delete P[id]);
    if (changed) save();
    return { changed, entries: P };
  }

  // GET /api/resume?p=<nom du profil> ; POST /api/resume { p, dev, entries: { id: { pct, at, s, e, dev, done, seen } | { at, gone, drop? } } }
  async function route(p, req, res, W, { body, send, url }) {
    if (p !== "/api/resume") return false;
    if (W && W.guest) { send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." }); return true; }
    if (req.method !== "POST") { send(res, 200, { ok: true, p: keyOf(url.searchParams.get("p")), entries: get(url.searchParams.get("p")) }); return true; }
    const b = await body(req), r = merge(b.p, b.entries);
    if (!r) { send(res, 200, { ok: false, err: "Profil manquant." }); return true; }
    if (r.changed) emit({ type: "resume", p: keyOf(b.p), dev: cut(b.dev, 40) });
    send(res, 200, { ok: true, changed: r.changed, entries: r.entries });
    return true;
  }
  return { get, merge, route, keyOf };
}

// ---------- âge conseillé lu dans les .nfo ----------
function nfoCert(file) {
  try {
    const st = fs.statSync(file); if (!st.isFile() || st.size > 512 * 1024) return "";
    const txt = fs.readFileSync(file, "utf8");
    const m = /<(certification|mpaa|contentrating)>\s*([^<]{1,60}?)\s*<\//i.exec(txt);
    return m ? m[2].replace(/&amp;/g, "&").trim() : "";
  } catch (_) { return ""; }
}
function nfoFor(it, V) {
  const c = [], noExt = (f) => f.replace(/\.[^./\\]+$/, "");
  if (it.kind === "film" && it.file) c.push(noExt(it.file) + ".nfo", path.join(path.dirname(it.file), "movie.nfo"));
  if (it.kind === "serie") { const d = it.dir || (it.episodes && it.episodes[0] ? path.dirname(it.episodes[0].file) : ""); if (d) c.push(path.join(d, "tvshow.nfo"), path.join(path.dirname(d), "tvshow.nfo")); }
  if (it.kind === "game" && it.file) c.push(noExt(it.file) + ".nfo");
  return c.find((f) => { if (V) return V.isFile(f); try { return fs.existsSync(f); } catch (_) { return false; } }) || "";
}
// ajoute « cert » (ex. « -12 », « PG-13 », « PEGI 7 ») aux fiches publiques ; le .nfo passe devant internet
// (V : la vue de l'analyse en cours — les .nfo sont cherchés dans les dossiers déjà lus, et pas relus tant qu'ils ne changent pas)
function applyNfo(items, V) {
  let n = 0;
  for (const it of items || []) {
    if (!it || !it.pub) continue;
    const f = nfoFor(it, V); if (!f) continue;
    const c = V ? V.recall("nfo|" + f, V.sig(f), () => nfoCert(f)) : nfoCert(f); if (c) { it.pub.cert = c; n++; }
  }
  return n;
}

module.exports = { createProfils, nfoCert, applyNfo, keyOf };
