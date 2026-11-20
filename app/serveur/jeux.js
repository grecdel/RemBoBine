// Rembobine — les jeux, côté serveur de la maison :
//   • fiche tirée du nom de fichier (année, hack, traduction, numéro de disque) et des bases locales libretro (.dat : joueurs, année) ;
//   • jeux à plusieurs disques regroupés (liste .m3u ou « (Disc 1) », « (Disc 2) »…) ;
//   • BIOS manquants repérés avant le lancement (PlayStation, PC Engine CD, Mega-CD, Famicom Disk System, Neo Geo) ;
//   • codes de triche .cht (format RetroArch) posés à côté du jeu ou dans un dossier « Triche » / « Cheats » ;
//   • vidéo d'aperçu posée à côté du jeu (« Jeu-preview.mp4 », dossier « snaps » ou « videos ») ;
//   • sauvegardes synchronisées entre appareils (par jeu et par profil : la plus récente gagne, l'ancienne est gardée) ;
//   • manette virtuelle du téléphone (joueur 1 à 4), relayée à l'écran de la TV qui fait tourner l'émulateur intégré ;
//   • tableau du « mode tournoi » (meilleurs scores et temps des profils de la maison).
// Rien ici n'appelle internet.
"use strict";
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const CS = require("./consoles");

const ext = (f) => path.extname(f).slice(1).toLowerCase();
// un vrai fichier (pas un lien symbolique, qui pourrait pointer n'importe où sur la machine)
const isRealFile = (f) => { try { return fs.lstatSync(f).isFile(); } catch (_) { return false; } };
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s*[([][^)\]]*[)\]]/g, " ").replace(/^(the|le|la|les)\s+/, "").replace(/[^a-z0-9]+/g, "");

// ---------- ce que dit le nom du fichier ----------
const LANGS = { fr: "français", fre: "français", fra: "français", en: "anglais", eng: "anglais", es: "espagnol", spa: "espagnol", de: "allemand", ger: "allemand", it: "italien", ita: "italien", pt: "portugais", por: "portugais" };
const RE_DISC = /[([]\s*(?:dis[ck]|disque|cd)\s*(\d+)(?:\s*(?:of|sur|\/)\s*(\d+))?\s*[)\]]/i;
function infoNom(name, relDir = "") {
  const o = { year: 0, hack: false, trad: false, tradLang: "", disc: 0 };
  const y = /[([]((?:19[7-9]|20[0-3])\d)[)\]]/.exec(name); if (y) o.year = Number(y[1]);
  const t = /\[T[-+]?([A-Za-z]{2,3})\b[^\]]*\]/.exec(name);
  if (t) { o.trad = true; o.tradLang = LANGS[t[1].toLowerCase()] || t[1]; }
  else if (/[([](?:traduction|traduit|translat(?:ion|ed)|trad)\b[^)\]]*[)\]]/i.test(name)) o.trad = true;
  if (/\[h\d*[^\]]*\]|[([](?:rom ?)?hack\b[^)\]]*[)\]]/i.test(name)) o.hack = true;
  const dirs = String(relDir).split(/[\\/]/);
  if (dirs.some((d) => /^(hacks?|rom ?hacks?)$/i.test(d))) o.hack = true;
  if (dirs.some((d) => /^(traductions?|translations?|trad)$/i.test(d))) o.trad = true;
  if (o.trad && !o.tradLang && /fr/i.test(name)) o.tradLang = "français";
  const d = RE_DISC.exec(name); if (d) o.disc = Number(d[1]);
  return o;
}

// ---------- bases locales libretro (fichiers .dat au format clrmamepro, sans internet) ----------
// À poser dans « Rembobine/Bases » (ou « Jeux/Bases ») : par exemple les fichiers du dossier metadat/maxusers et metadat/releaseyear
// de libretro-database. On y lit, pour chaque jeu : nombre de joueurs (users) et année (releaseyear).
let BASES = { sig: "", map: new Map(), t: 0 };
function datFiles(roots) {
  const out = [];
  const look = (d, depth) => { let l; try { l = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of l) { const f = path.join(d, e.name); if (e.isDirectory() && depth < 3) look(f, depth + 1); else if (e.isFile() && /\.dat$/i.test(e.name)) out.push(f); } };
  for (const r of roots) for (const d of ["Bases", "bases", path.join("Jeux", "Bases"), "libretro-database"]) look(path.join(r, d), 0);
  return out;
}
function parseDat(text, map) {
  const re = /game\s*\(([\s\S]*?)\n\)/g; let m;
  while ((m = re.exec(text))) {
    const b = m[1], name = /\bname\s+"([^"]+)"/.exec(b); if (!name) continue;
    const k = norm(name[1]); if (!k) continue;
    const rec = map.get(k) || {};
    const u = /\b(?:users|players)\s+"?(\d+)"?/.exec(b); if (u) rec.players = Number(u[1]);
    const y = /\b(?:releaseyear|year)\s+"?(\d{4})"?/.exec(b); if (y) rec.year = Number(y[1]);
    map.set(k, rec);
  }
}
function bases(roots) {
  if (Date.now() - BASES.t < 10000) return BASES.map;
  BASES.t = Date.now();
  const files = datFiles(roots), sig = files.map((f) => { try { return f + fs.statSync(f).mtimeMs; } catch (_) { return f; } }).join("|");
  if (sig === BASES.sig) return BASES.map;
  const map = new Map(); for (const f of files) { try { parseDat(fs.readFileSync(f, "utf8"), map); } catch (_) {} }
  BASES = { sig, map, t: Date.now() }; return map;
}

// ---------- BIOS à fournir (jamais téléchargés : ils viennent de la console du propriétaire) ----------
const BIOS = {
  psx: { noms: ["scph5501.bin", "scph5500.bin", "scph5502.bin", "scph1001.bin", "scph7001.bin", "scph101.bin", "ps1_rom.bin"], requis: false,
    txt: "BIOS de la PlayStation (ex. scph5501.bin)", sans: "Sans lui, Rembobine utilise un BIOS de remplacement : la plupart des jeux marchent, certains non (et pas de carte mémoire du menu)." },
  pcecd: { noms: ["syscard3.pce", "syscard2.pce", "syscard1.pce"], requis: true, txt: "carte système du PC Engine CD (syscard3.pce)", sans: "Les jeux sur CD du PC Engine ne démarrent pas sans elle." },
  segacd: { noms: ["bios_cd_e.bin", "bios_cd_u.bin", "bios_cd_j.bin"], requis: true, txt: "BIOS du Mega-CD (bios_CD_E.bin, _U ou _J)", sans: "Les jeux du Mega-CD ne démarrent pas sans lui." },
  fds: { noms: ["disksys.rom"], requis: true, txt: "BIOS du Famicom Disk System (disksys.rom)", sans: "Les disquettes Famicom ne démarrent pas sans lui." },
  neogeo: { noms: ["neogeo.zip"], requis: true, txt: "BIOS Neo Geo (neogeo.zip)", sans: "Les jeux Neo Geo ne démarrent pas sans lui (à poser dans BIOS ou à côté du jeu)." }
};
function biosKey(sys, file, base) {
  const e = ext(file), rel = path.relative(base || path.dirname(file), path.dirname(file));
  if (/mega.?cd|sega.?cd/i.test(rel)) return "segacd";
  if (e === "fds") return "fds";
  if (sys === "psx") return "psx";
  if (sys === "pce" && (["cue", "chd", "ccd", "iso", "m3u"].includes(e) || /cd/i.test(rel))) return "pcecd";
  if ((sys === "arcade" || sys === "mame") && /neo ?geo(?! ?pocket)/i.test(rel)) return "neogeo";
  return "";
}
function biosFind(key, roots, file) {
  const B = BIOS[key]; if (!B) return "";
  const cands = CS.biosFiles(roots); try { if (file) for (const f of fs.readdirSync(path.dirname(file))) cands.push(path.join(path.dirname(file), f)); } catch (_) {}
  for (const n of B.noms) { const f = cands.find((x) => path.basename(x).toLowerCase() === n); if (f) return f; }
  return "";
}
function biosEtat(sys, file, base, roots) {
  const key = biosKey(sys, file, base); if (!key) return null;
  const B = BIOS[key], found = biosFind(key, roots, file);
  return { key, txt: B.txt, requis: B.requis, ok: !!found, sans: B.sans, ...(found ? { fichier: path.basename(found) } : {}) };
}

// ---------- codes de triche (.cht de RetroArch) ----------
function parseCht(text) {
  const v = {}; for (const l of String(text).split(/\r?\n/)) { const m = /^\s*(cheat(\d+)_(desc|code|enable))\s*=\s*"?(.*?)"?\s*$/.exec(l); if (m) (v[m[2]] ??= {})[m[3]] = m[4]; }
  return Object.keys(v).sort((a, b) => a - b).map((k) => v[k]).filter((c) => c.code).map((c) => ({ desc: (c.desc || "Code").slice(0, 80), code: c.code.slice(0, 400), on: c.enable === "true" })).slice(0, 300);
}
// contenu des dossiers, gardé quelques secondes : le scan regarde des dizaines de noms possibles pour chaque jeu
// (aperçu, triche) ; lire chaque dossier une seule fois au lieu de milliers de « ce fichier existe ? » (vidé au début de chaque scan)
const DIRS = new Map();
function dirList(d) {
  const c = DIRS.get(d); if (c && Date.now() - c.t < 20000) return c.l;
  let l = null; try { l = fs.readdirSync(d); } catch (_) {}
  const v = { t: Date.now(), l, s: l ? new Set(process.platform === "win32" ? l.map((x) => x.toLowerCase()) : l) : null };
  if (DIRS.size > 5000) DIRS.clear(); DIRS.set(d, v); return l;
}
function has(f) { const d = path.dirname(f); dirList(d); const c = DIRS.get(d); return !!(c && c.s && c.s.has(process.platform === "win32" ? path.basename(f).toLowerCase() : path.basename(f))); }
function resetDirCache() { DIRS.clear(); }
function chtFiles(file, title, platform, roots) {
  const dir = path.dirname(file), base = path.basename(file).replace(/\.[^.]+$/, ""), out = [];
  for (const f of [path.join(dir, base + ".cht"), path.join(dir, "cheats", base + ".cht"), path.join(dir, "triche", base + ".cht")]) if (isRealFile(f)) out.push(f);
  const want = norm(title);
  for (const r of roots) for (const d of ["Triche", "Cheats", path.join("Jeux", "Triche"), path.join("Jeux", "Cheats")]) {
    for (const sub of [path.join(r, d, platform || ""), path.join(r, d)]) { const l = dirList(sub); if (!l) continue;
      for (const n of l) if (/\.cht$/i.test(n) && want && norm(n.replace(/\.cht$/i, "")) === want) out.push(path.join(sub, n)); }
  }
  return [...new Set(out)];
}

// ---------- vidéo d'aperçu ----------
const VID = ["mp4", "webm", "m4v", "mov"];
function apercu(file) {
  const dir = path.dirname(file), base = path.basename(file).replace(/\.[^.]+$/, ""), clean = base.replace(RE_DISC, "").trim();
  const c = [];
  for (const b of new Set([base, clean])) for (const x of VID) {
    c.push(path.join(dir, `${b}-preview.${x}`), path.join(dir, `${b}-video.${x}`), path.join(dir, `${b}-trailer.${x}`));
    for (const d of ["snaps", "snap", "videos", "video", path.join("media", "videos")]) c.push(path.join(dir, d, `${b}.${x}`));
  }
  return c.find(isRealFile) || "";
}

// ---------- appelé par le scan pour chaque jeu ----------
function infoJeu(file, name, sys, gamesBase, roots, title) {
  const n = infoNom(name, path.relative(gamesBase, path.dirname(file)));
  const b = bases(roots).get(norm(name)) || bases(roots).get(norm(title)) || {};
  const pub = {};
  if (n.year || b.year) pub.year = n.year || b.year;
  if (b.players) pub.players = b.players;
  if (n.hack) pub.hack = true;
  if (n.trad) { pub.trad = true; if (n.tradLang) pub.tradLang = n.tradLang; }
  if (n.disc) pub.disc = n.disc;
  const bi = biosEtat(sys, file, gamesBase, roots); if (bi) pub.bios = bi;
  const pv = apercu(file); if (pv) pub.preview = true;
  const ch = chtFiles(file, title, "", roots); if (ch.length) pub.cht = true;
  return { pub, previewFile: pv };
}

// ce qui, hors du dossier d'un jeu, change ses infos (BIOS, codes de triche rangés à part, bases .dat) : l'analyse ne
// reprend les infos gardées d'un jeu inchangé que si cette signature est la même (voir « souvenirs » dans bibliotheque.js)
function sigJeux(roots) {
  const h = require("crypto").createHash("sha1");
  for (const r of roots) for (const d of ["BIOS", "Bios", "bios", "Triche", "Cheats", path.join("Jeux", "Triche"), path.join("Jeux", "Cheats")]) {
    let l = null; try { l = fs.readdirSync(path.join(r, d)); } catch (_) {}
    if (l) h.update(path.join(r, d) + ":" + l.sort().join("/") + "\n");
  }
  for (const f of datFiles(roots)) { let m = 0; try { m = fs.statSync(f).mtimeMs; } catch (_) {} h.update(f + ":" + m + "\n"); }
  return h.digest("hex").slice(0, 16);
}

// ---------- jeux à plusieurs disques ----------
// « Jeu (Disc 1).chd » + « Jeu (Disc 2).chd » → un seul jeu, avec la liste de ses disques ; une liste .m3u cache les disques qu'elle cite.
function regrouper(items, byId, coverUrl) {
  const m3uHide = new Set();
  for (const it of items) {
    if (it.kind !== "game" || ext(it.file || "") !== "m3u") continue;
    let lines = []; try { lines = fs.readFileSync(it.file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")); } catch (_) {}
    // seulement des disques rangés dans le dossier de la liste (ou en dessous) : une liste piégée
    // (« /etc/passwd », « ../../.config/… ») ne doit pas rendre téléchargeable un fichier hors de la bibliothèque
    const here = path.resolve(path.dirname(it.file));
    const files = lines.map((l) => path.resolve(here, l)).filter((f) => f.startsWith(here + path.sep) && isRealFile(f)).slice(0, 32); files.forEach((f) => m3uHide.add(f));
    it.discFiles = files; it.pub.discs = files.map((f, i) => ({ n: i + 1, name: path.basename(f) }));
  }
  const groups = new Map(), out = [];
  for (const it of items) {
    if (it.kind === "game" && m3uHide.has(it.file)) { byId.delete(it.id); continue; }
    if (it.kind === "game" && it.pub.disc) {
      const k = path.dirname(it.file) + "|" + it.sys + "|" + norm(it.title);
      const g = groups.get(k); if (g) { g.push(it); byId.delete(it.id); continue; }
      groups.set(k, [it]);
    }
    out.push(it);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.pub.disc - b.pub.disc);
    const main = list[0];
    main.discFiles = list.map((x) => x.file);
    main.pub.discs = list.map((x) => ({ n: x.pub.disc, name: path.basename(x.file) }));
    if (!main.coverFile) { const c = list.find((x) => x.coverFile); if (c) { main.coverFile = c.coverFile; main.pub.cover = coverUrl ? coverUrl(main.id) : ""; } }
  }
  // chaque disque se télécharge à part (émulateur intégré) : /media/<id du jeu>~<n° du disque>
  for (const it of out) if (it.discFiles) it.discFiles.forEach((f, i) => byId.set(`${it.id}~${i + 1}`, { id: `${it.id}~${i + 1}`, kind: "disc", file: f, pub: {} }));
  return out;
}

// ---------- le module branché sur le serveur ----------
function createJeux(o) {
  const dir = path.join(o.dataDir, "sauvegardes");
  const scoresFile = path.join(o.dataDir, "tournoi.json");
  let scores = {}; try { scores = JSON.parse(fs.readFileSync(scoresFile, "utf8")); } catch (_) {}
  const saveScores = () => { try { fs.writeFileSync(scoresFile + ".tmp", JSON.stringify(scores)); fs.renameSync(scoresFile + ".tmp", scoresFile); } catch (_) {} };
  const seats = new Map();   // joueur (1-4) → { name, dev, t }
  const safe = (s, n = 64) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_.~-]+/g, "_").replace(/^\.+/, "").slice(0, n);
  const lib = () => o.lib();
  const game = (id) => { const it = lib().byId.get(String(id)); return it && it.kind === "game" ? it : null; };
  function seatsList() { const now = Date.now(); for (const [k, s] of seats) if (now - s.t > 120000) seats.delete(k); return [...seats.entries()].map(([seat, s]) => ({ seat, name: s.name })).sort((a, b) => a.seat - b.seat); }
  function readRaw(req, max) {
    // trop gros : on répond tout de suite, le reste est lu et jeté (sans couper la connexion)
    return new Promise((resolve) => { const ch = []; let n = 0, over = false;
      req.on("data", (d) => { n += d.length; if (over) return; if (n > max) { over = true; ch.length = 0; resolve(null); } else ch.push(d); });
      req.on("end", () => { if (!over) resolve(Buffer.concat(ch)); }); req.on("error", () => resolve(null)); });
  }
  const metaOf = (f) => { try { return JSON.parse(fs.readFileSync(f + ".json", "utf8")); } catch (_) { return null; } };

  async function route(req, res, p, url, W, h) {
    let m;
    // --- fiche de jeu : BIOS, triche, aperçu ---
    // l'émulateur intégré nomme le BIOS d'après la fin de l'adresse : /api/jeux/bios/<jeu>/scph5501.bin
    if ((m = /^\/api\/jeux\/bios\/([^/]+)(?:\/[^/]*)?$/.exec(p))) {
      const it = game(m[1]); if (!it || !it.pub.bios) return h.send(res, 404, { ok: false });
      const f = biosFind(it.pub.bios.key, o.roots, it.file); if (!f) return h.send(res, 404, { ok: false, err: "BIOS absent" });
      return h.sendFile(req, res, f, "application/octet-stream");
    }
    if ((m = /^\/api\/jeux\/cht\/([^/]+)$/.exec(p))) {
      const it = game(m[1]); if (!it) return h.send(res, 404, { ok: false });
      const files = chtFiles(it.file, it.title, it.pub.platform, o.roots), cheats = [];
      for (const f of files) { try { cheats.push(...parseCht(await fsp.readFile(f, "utf8"))); } catch (_) {} }
      return h.send(res, 200, { ok: true, files: files.map((f) => path.basename(f)), cheats });
    }
    if ((m = /^\/api\/jeux\/apercu\/([^/]+)$/.exec(p))) {
      const it = game(m[1]), f = it && apercu(it.file); if (!f) return h.send(res, 404, { ok: false });
      return h.sendFile(req, res, f);
    }
    // --- sauvegardes synchronisées : /api/saves/<jeu>?profil=… (liste) ; /api/saves/<jeu>/<srm|state|png>/<emplacement> (fichier) ---
    if ((m = /^\/api\/saves\/([^/]+)(?:\/(srm|state|png)\/(\d{1,2}))?$/.exec(p))) {
      // un invité a ses propres sauvegardes (« invite-<nom> ») : il ne lit, n'écrase ni n'efface celles de la famille
      const gid = safe(m[1]), prof = W.guest ? "invite-" + (safe(W.name || "ami", 30) || "ami") : safe(url.searchParams.get("profil") || "maison", 40) || "maison";
      if (!gid) return h.send(res, 400, { ok: false });
      const gdir = path.join(dir, prof, gid);
      if (!m[2]) {
        let l = []; try { l = fs.readdirSync(gdir).filter((n) => /^(srm|state|png)-\d+\.bin$/.test(n)); } catch (_) {}
        return h.send(res, 200, { ok: true, list: l.map((n) => { const [, kind, slot] = /^(\w+)-(\d+)\.bin$/.exec(n), me = metaOf(path.join(gdir, n)) || {}; return { kind, slot: Number(slot), at: me.at || 0, size: me.size || 0, dev: me.dev || "" }; }) });
      }
      const f = path.join(gdir, `${m[2]}-${Number(m[3])}.bin`);
      if (req.method === "GET") { if (!fs.existsSync(f)) return h.send(res, 404, { ok: false }); res.setHeader("X-Rbb-At", String((metaOf(f) || {}).at || 0)); return h.sendFile(req, res, f, "application/octet-stream"); }
      if (req.method === "DELETE" || url.searchParams.get("del")) { try { fs.unlinkSync(f); fs.unlinkSync(f + ".json"); } catch (_) {} o.emit({ type: "saves", game: gid, profil: prof }); return h.send(res, 200, { ok: true }); }
      if (req.method !== "POST" && req.method !== "PUT") return h.send(res, 405, { ok: false });
      const at = Number(url.searchParams.get("at")) || Date.now(), old = metaOf(f);
      // la plus récente gagne : une copie plus ancienne que celle du serveur est refusée (l'appareil reprend celle du serveur)
      if (old && old.at >= at) { req.resume(); return h.send(res, 200, { ok: false, newer: true, at: old.at, dev: old.dev || "" }); }
      const buf = await readRaw(req, 64 * 1024 * 1024); if (!buf) return h.send(res, 413, { ok: false, err: "Fichier trop gros (64 Mo au plus)." });
      fs.mkdirSync(gdir, { recursive: true });
      if (old && fs.existsSync(f) && m[2] !== "png") {
        // l'ancienne est gardée (5 au plus par emplacement)
        const kd = path.join(gdir, "anciennes"); fs.mkdirSync(kd, { recursive: true });
        try { fs.copyFileSync(f, path.join(kd, `${m[2]}-${Number(m[3])}-${old.at}.bin`)); } catch (_) {}
        const olds = fs.readdirSync(kd).filter((n) => n.startsWith(`${m[2]}-${Number(m[3])}-`)).sort();
        while (olds.length > 5) { try { fs.unlinkSync(path.join(kd, olds.shift())); } catch (_) {} }
      }
      fs.writeFileSync(f + ".tmp", buf); fs.renameSync(f + ".tmp", f);
      fs.writeFileSync(f + ".json", JSON.stringify({ at, size: buf.length, dev: String(url.searchParams.get("dev") || W.name || "TV").slice(0, 40) }));
      o.emit({ type: "saves", game: gid, profil: prof, kind: m[2], slot: Number(m[3]), at });
      return h.send(res, 200, { ok: true, at });
    }
    // --- manette virtuelle : le téléphone prend une place (joueur 1 à 4) puis envoie ses touches ---
    if (p === "/api/pad" && req.method !== "POST") return h.send(res, 200, { seats: seatsList() });
    if (p === "/api/pad" && req.method === "POST") {
      const b = await h.body(req), dev = String(b.dev || "").slice(0, 60), name = String(b.name || W.name || "Manette").slice(0, 30);
      seatsList();
      if (b.leave) { for (const [k, s] of seats) if (s.dev === dev) seats.delete(k); o.emitTv({ type: "pads", seats: seatsList() }); return h.send(res, 200, { ok: true }); }
      let want = Math.max(1, Math.min(4, Number(b.seat) || 1));
      const mine = [...seats.entries()].find(([, s]) => s.dev === dev);
      const taken = seats.get(want);
      if (taken && taken.dev !== dev) { if (!b.seat) { want = [1, 2, 3, 4].find((k) => !seats.has(k)) || 0; } else return h.send(res, 200, { ok: false, err: `La manette ${want} est déjà prise par ${taken.name}.` }); }
      if (!want) return h.send(res, 200, { ok: false, err: "Les 4 manettes sont prises." });
      if (mine && mine[0] !== want) seats.delete(mine[0]);
      seats.set(want, { name, dev, t: Date.now() });
      o.emitTv({ type: "pads", seats: seatsList() });
      return h.send(res, 200, { ok: true, seat: want, tv: o.tvOn() });
    }
    if (p === "/api/pad/in" && req.method === "POST") {
      const b = await h.body(req), seat = Math.max(1, Math.min(4, Number(b.s) || 1)), s = seats.get(seat);
      if (s) s.t = Date.now();
      const e = (Array.isArray(b.e) ? b.e : []).slice(0, 32).map((x) => [Math.max(0, Math.min(29, Number(x[0]) | 0)), x[1] ? 1 : 0]);
      if (e.length) o.emitTv({ type: "padin", s: seat, e });
      return h.send(res, 200, { ok: true });
    }
    // --- mode tournoi : meilleurs scores / temps par jeu, entre les profils de la maison ---
    if ((m = /^\/api\/jeux\/scores\/([^/]+)$/.exec(p))) {
      const gid = safe(m[1]); if (!gid) return h.send(res, 400, { ok: false });
      if (req.method !== "POST") return h.send(res, 200, { list: scores[gid] || [] });
      const b = await h.body(req), v = Number(b.v);
      if (!isFinite(v) || v < 0 || !b.who) return h.send(res, 200, { ok: false });
      const rec = { who: String(b.who).slice(0, 30), v, mode: b.mode === "temps" ? "temps" : "score", at: Number(b.at) || Date.now(), auto: !!b.auto, note: String(b.note || "").slice(0, 60) };
      const l = (scores[gid] ||= []); if (!l.some((x) => x.who === rec.who && x.at === rec.at)) l.push(rec);
      l.sort((a, b) => b.at - a.at); l.length = Math.min(l.length, 200); saveScores();
      o.emit({ type: "scores", game: gid });
      return h.send(res, 200, { ok: true });
    }
    return false;
  }
  return { route, seatsList };
}

module.exports = { createJeux, infoJeu, infoNom, regrouper, parseCht, parseDat, biosEtat, biosFind, BIOS, apercu, RE_DISC, resetDirCache, sigJeux };
