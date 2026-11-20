// Rembobine — la « collection » d'un jeu, côté serveur de la maison : boîte (avant, dos, tranche), manuel, cartouche ou disque.
// Rien sur internet : on regarde seulement les fichiers posés à côté du jeu, et ceux ajoutés à la main depuis la fiche.
//
// Rangement reconnu (noms français ou anglais, majuscules et accents indifférents), pour « Jeu (Japan).sfc » :
//   Jeu (Japan).png                        la jaquette (déjà utilisée par la bibliothèque) = avant de la boîte
//   Jeu (Japan)-dos.png / -back / -verso   le dos de la boîte          Jeu (Japan)-tranche.png / -spine   la tranche
//   Jeu (Japan)-cartouche.png / -disque     le support (cartouche, disque…)
//   Jeu (Japan).pdf / Jeu (Japan)-manuel.pdf, ou Manuels/Jeu (Japan).pdf (ou des images : Manuels/Jeu (Japan) 1.jpg, 2.jpg…)
//   Boites/Jeu (Japan).png, Boites/Jeu (Japan)-dos.png        Cartouches/Jeu (Japan).png (ou Disques/, Supports/)
// Le nom sans la région (« Jeu.pdf », « Manuels/Jeu.pdf ») vaut pour toutes les versions du jeu.
// Ajouts à la main (bouton « + » de la fiche) : <données>/fiches/collection/<id du jeu>/<catégorie>-<date>.<ext>
// Sécurité : images (JPEG, PNG, WebP, GIF) et PDF seulement, reconnus par leur contenu (pas par le nom) ; 25 Mo au plus ;
// 40 fichiers au plus par jeu ; refusé aux invités ; un fichier n'est servi que s'il est vraiment dans un dossier de médias
// ou dans le dossier des ajouts (liens symboliques piégés refusés) ; seuls les ajouts à la main peuvent être retirés.
"use strict";
const fs = require("fs");
const path = require("path");

const IMG = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const CATS = ["front", "back", "spine", "manual", "cart"];
const MAX_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 40;
// suffixe après le nom du jeu (« -dos », « _back », « (verso) », « - manuel 2 »…)
const SUFFIX = [[/^(avant|front|face|recto|boite|box|boxart|cover|jaquette)$/, "front"], [/^(dos|back|arriere|verso|rear)$/, "back"], [/^(tranche|spine|side|cote)$/, "spine"],
  [/^(cartouche|cart|cartridge|disque|disc|cd|dvd|support|media|label)$/, "cart"], [/^(manuel|manual|notice|livret|mode d emploi|booklet)$/, "manual"]];
const DIRS = [[/^(boites?|box(es)?|boxarts?|jaquettes?|covers?)$/, "front"], [/^(manuels?|manuals?|notices?|livrets?)$/, "manual"], [/^(cartouches?|cartridges?|carts?|disques?|discs?|supports?)$/, "cart"]];
const MAGIC = [["jpg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff], ["png", (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["gif", (b) => b.slice(0, 4).toString("latin1") === "GIF8"], ["webp", (b) => b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP"],
  ["pdf", (b) => b.slice(0, 5).toString("latin1") === "%PDF-"]];
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf" };

const ext = (f) => path.extname(f).slice(1).toLowerCase();
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const noTags = (s) => String(s || "").replace(/\s*[([][^)\]]*[)\]]/g, " ");
function ls(d) { try { return fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return []; } }
function kindOf(e) { return e === "pdf" ? "pdf" : IMG.has(e) ? "image" : ""; }

// « Jeu (Japan)-dos » face aux noms du jeu → catégorie (ou "" si le fichier ne parle pas de ce jeu)
// (un simple numéro après le nom, « Jeu 2 », n'est une page que dans un dossier Manuels/… : sinon c'est peut-être « Jeu 2 », un autre jeu)
function match(base, keys, def, inDir) {
  const n = norm(base);
  for (const k of keys) {
    if (!k) continue;
    if (n === k) return { cat: def, page: 0 };
    if (!n.startsWith(k + " ")) continue;
    let rest = n.slice(k.length + 1), page = 0;
    const pm = /^(.*?)\s*(\d{1,3})$/.exec(rest); if (pm) { page = Number(pm[2]); rest = pm[1]; }
    if (!rest) return inDir ? { cat: def, page } : null;
    for (const [re, c] of SUFFIX) if (re.test(rest)) return { cat: def === "cart" && c === "front" ? "cart" : c, page };
  }
  return null;
}

// les fichiers de collection trouvés à côté d'un jeu, puis ceux ajoutés à la main
function findFiles(it, upDir) {
  const out = []; if (!it || !it.file) return out;
  const file = it.file, dir = path.dirname(file), stem = path.basename(file).replace(/\.[^.]+$/, "");
  const keys = [...new Set([norm(stem), norm(noTags(stem)), norm(it.title)])].filter(Boolean);
  const seen = new Set();
  const add = (f, cat, page, mine) => { if (seen.has(f)) return; const k = kindOf(ext(f)); if (!k) return; if (cat !== "manual" && k !== "image") return; seen.add(f); out.push({ f, cat, page, kind: k, mine: !!mine, name: path.basename(f) }); };
  // la jaquette de la bibliothèque compte comme l'avant de la boîte
  if (it.coverFile) add(it.coverFile, "front", 0);
  for (const e of ls(dir)) {
    if (e.name.startsWith(".")) continue;
    const f = path.join(dir, e.name);
    if (e.isFile()) {
      const x = ext(e.name); if (!kindOf(x) || f === file) continue;
      const m = match(e.name.slice(0, -(x.length + 1)), keys, x === "pdf" ? "manual" : "", false);
      if (m && m.cat) add(f, x === "pdf" ? "manual" : m.cat, m.page);
    } else if (e.isDirectory()) {
      const nd = norm(e.name), d = DIRS.find(([re]) => re.test(nd)); if (!d) continue;
      for (const s of ls(f)) {
        if (!s.isFile() || s.name.startsWith(".")) continue;
        const x = ext(s.name); if (!kindOf(x)) continue;
        const m = match(s.name.slice(0, -(x.length + 1)), keys, d[1], true);
        if (m) add(path.join(f, s.name), x === "pdf" ? "manual" : m.cat, m.page);
      }
    }
  }
  const own = upDir ? ls(upDir).filter((e) => e.isFile()).map((e) => e.name).sort() : [];
  for (const n of own) { const c = n.split("-")[0]; if (CATS.includes(c)) add(path.join(upDir, n), c, 0, true); }
  const ord = (a) => CATS.indexOf(a.cat);
  return out.sort((a, b) => ord(a) - ord(b) || (a.mine - b.mine) || a.page - b.page || a.name.localeCompare(b.name, "fr", { numeric: true }));
}

// routes : GET /api/jeux/collection/<id> ; GET /api/jeux/collection/<id>/f/<n> ; POST /api/jeux/collection/<id>/add?cat= (contenu brut) ; POST …/del { n }
function createCollection({ dataDir, lib, libFile, emit = () => {} }) {
  const base = path.join(dataDir, "fiches", "collection");
  const upDir = (id) => path.join(base, id);
  const game = (id) => { const it = lib().byId.get(id); return it && it.kind === "game" && it.file ? it : null; };
  function inside(f, d) { try { const r = fs.realpathSync(f), x = fs.realpathSync(d); return r.startsWith(x + path.sep); } catch (_) { return false; } }
  const servable = (id, x) => x.mine ? inside(x.f, upDir(id)) : libFile(x.f, true);
  function list(id, it) {
    return findFiles(it, upDir(id)).map((x, n) => ({ n, cat: x.cat, kind: x.kind, name: x.name, mine: x.mine, page: x.page, url: `/api/jeux/collection/${encodeURIComponent(id)}/f/${n}` }));
  }
  // lecture du contenu envoyé, coupée au-delà de la taille permise
  function readRaw(req, max) {
    return new Promise((resolve) => {
      const ch = []; let n = 0, over = false;
      req.on("data", (d) => { if (over) return; n += d.length; if (n > max) { over = true; ch.length = 0; resolve(null); req.destroy(); } else ch.push(d); });
      req.on("end", () => { if (!over) resolve(Buffer.concat(ch)); });
      req.on("error", () => { if (!over) { over = true; resolve(null); } });
    });
  }
  async function route(req, res, p, url, W, h) {
    const m = /^\/api\/jeux\/collection\/([A-Za-z0-9~_-]{1,64})(?:\/(f\/\d{1,3}|add|del))?$/.exec(p); if (!m) return false;
    const id = m[1], it = game(id); if (!it) return h.send(res, 404, { ok: false, err: "Jeu introuvable." });
    const act = m[2] || "";
    if (!act) { if (req.method !== "GET") return h.send(res, 405, { ok: false }); return h.send(res, 200, { ok: true, id, title: it.title, region: (it.pub && it.pub.region) || "", files: list(id, it) }); }
    if (act.startsWith("f/")) {
      const x = findFiles(it, upDir(id))[Number(act.slice(2))]; if (!x || !servable(id, x)) return h.send(res, 404, { ok: false });
      res.setHeader("Cache-Control", "private, max-age=3600"); res.setHeader("X-Content-Type-Options", "nosniff");
      // (le type vient du contenu vérifié ou de l'extension, et « nosniff » : le navigateur ne le lit jamais comme une page web)
      return h.sendFile(req, res, x.f, MIME[ext(x.f)] || "application/octet-stream");
    }
    if (req.method !== "POST") return h.send(res, 405, { ok: false });
    if (W && W.guest) return h.send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." });
    if (act === "del") {
      const b = await h.body(req), x = findFiles(it, upDir(id))[Number(b.n)];
      if (!x || !x.mine || !inside(x.f, upDir(id))) return h.send(res, 200, { ok: false, err: "Seuls les fichiers ajoutés depuis la fiche peuvent être retirés." });
      try { fs.unlinkSync(x.f); } catch (_) { return h.send(res, 200, { ok: false, err: "Impossible de retirer ce fichier." }); }
      emit({ type: "collection", id });
      return h.send(res, 200, { ok: true, files: list(id, it) });
    }
    // add : catégorie choisie, contenu vérifié
    const cat = url.searchParams.get("cat") || "";
    if (!CATS.includes(cat)) return h.send(res, 400, { ok: false, err: "Catégorie inconnue." });
    const len = Number(req.headers["content-length"] || 0); if (len > MAX_SIZE) { req.resume(); return h.send(res, 413, { ok: false, err: "Fichier trop gros (25 Mo au plus)." }); }
    const d = upDir(id); fs.mkdirSync(d, { recursive: true });
    if (ls(d).filter((e) => e.isFile()).length >= MAX_FILES) { req.resume(); return h.send(res, 200, { ok: false, err: `Déjà ${MAX_FILES} fichiers pour ce jeu.` }); }
    const buf = await readRaw(req, MAX_SIZE); if (!buf) return h.send(res, 413, { ok: false, err: "Fichier trop gros (25 Mo au plus)." });
    if (buf.length < 8) return h.send(res, 400, { ok: false, err: "Fichier vide." });
    const kind = MAGIC.find(([, t]) => t(buf)); if (!kind) return h.send(res, 415, { ok: false, err: "Seulement des images (JPEG, PNG, WebP, GIF) ou un PDF." });
    if (kind[0] === "pdf" && cat !== "manual") return h.send(res, 415, { ok: false, err: "Un PDF va avec les manuels." });
    const name = `${cat}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${kind[0]}`;
    try { fs.writeFileSync(path.join(d, name), buf, { flag: "wx" }); } catch (_) { return h.send(res, 500, { ok: false, err: "Écriture impossible." }); }
    emit({ type: "collection", id });
    return h.send(res, 200, { ok: true, files: list(id, it) });
  }
  return { route, findFiles: (it) => findFiles(it, it ? upDir(it.id) : "") };
}

module.exports = { createCollection, findFiles, match, MAX_SIZE };
