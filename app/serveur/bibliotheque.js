// Rembobine — lecture des dossiers de médias (le « scan »).
// Rangement attendu dans chaque dossier racine (noms français ou anglais, majuscules indifférentes) :
//   Films/      un fichier vidéo par film (éventuellement dans son propre dossier « Titre (2019)/ »)
//   Series/     un dossier par série, épisodes nommés S01E02 (ou 1x02), sous-dossiers de saisons acceptés
//   Jeux/       les ROM, rangées ou non par console (« SNES/ », « Game Boy Advance/ »…)
//   Musique/    un dossier par album (« Artiste - Album/ » ou « Artiste/Album/ »)
//   Photos/     un dossier par album photo
//   Livres/     epub, pdf, cbz
// Jaquettes : une image du même nom que le fichier (« Film.jpg »), ou poster / cover / folder / front .jpg/.png dans le dossier.
"use strict";
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const CS = require("./consoles");
const BP = require("./bibliotheque_plus");   // bandes-annonces et bonus : ce ne sont ni des films ni des épisodes
const J = require("./jeux");

const VIDEO = new Set(["mp4", "m4v", "mkv", "avi", "mov", "webm", "wmv", "ts", "m2ts", "mpg", "mpeg", "ogv"]);
const AUDIO = new Set(["mp3", "flac", "ogg", "opus", "m4a", "aac", "wav"]);
const IMAGE = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const BOOK = new Set(["epub", "pdf", "cbz"]);
// extension de ROM → console
const ROM = { nes: "nes", fds: "nes", sfc: "snes", smc: "snes", gba: "gba", gb: "gb", gbc: "gbc", md: "md", gen: "md", smd: "md", sms: "sms", gg: "gg", n64: "n64", z64: "n64", v64: "n64", nds: "nds", pce: "pce", a26: "a26", chd: "psx", pbp: "psx",
  a78: "a78", vb: "vb", vboy: "vb", ngp: "ngp", ngc: "ngp", ws: "ws", wsc: "ws", "32x": "32x", d64: "c64", t64: "c64", prg: "c64", crt: "c64", tzx: "zx", tap: "zx", z80: "zx", cdt: "cpc" };
const SYS_NAME = { nes: "NES", snes: "Super Nintendo", gba: "Game Boy Advance", gb: "Game Boy", gbc: "Game Boy Color", md: "Mega Drive", sms: "Master System", gg: "Game Gear", n64: "Nintendo 64", nds: "Nintendo DS", pce: "PC Engine", a26: "Atari 2600", psx: "PlayStation",
  a78: "Atari 7800", vb: "Virtual Boy", ngp: "Neo Geo Pocket", ws: "WonderSwan", "32x": "Sega 32X", c64: "Commodore 64", zx: "ZX Spectrum", cpc: "Amstrad CPC", segacd: "Mega-CD", arcade: "Arcade", mame: "MAME" };
// nom de dossier → console (pour les .zip, .bin, .iso rangés par console)
const SYS_DIR = [[/mega.?cd|sega.?cd/i, "segacd"], [/mame/i, "mame"], [/arcade|fbneo|neo ?geo(?! ?pocket)|cps/i, "arcade"], [/virtual ?boy/i, "vb"], [/neo ?geo ?pocket|ngpc?/i, "ngp"], [/wonder ?swan/i, "ws"], [/32x/i, "32x"],
  [/atari ?7800/i, "a78"], [/commodore|c64/i, "c64"], [/spectrum|zx/i, "zx"], [/amstrad|cpc/i, "cpc"], [/snes|super ?nintendo|super ?famicom/i, "snes"], [/game ?boy ?advance|gba/i, "gba"], [/game ?boy ?color|gbc/i, "gbc"], [/game ?boy|^gb$/i, "gb"],
  [/nintendo ?64|n64/i, "n64"], [/nintendo ?ds|nds/i, "nds"], [/nes|famicom|nintendo/i, "nes"], [/mega ?drive|genesis/i, "md"], [/master ?system/i, "sms"], [/game ?gear/i, "gg"],
  [/playstation|psx|ps1/i, "psx"], [/pc ?engine|turbografx/i, "pce"], [/atari/i, "a26"]];
const MIME = { mp4: "video/mp4", m4v: "video/mp4", mkv: "video/x-matroska", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo", ogv: "video/ogg", ts: "video/mp2t",
  mp3: "audio/mpeg", flac: "audio/flac", ogg: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
  wasm: "application/wasm", data: "application/octet-stream", epub: "application/epub+zip", pdf: "application/pdf", cbz: "application/vnd.comicbook+zip",
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json", srt: "text/plain; charset=utf-8", vtt: "text/vtt" };

const DIRS = {
  film: /^(films?|movies?)$/i, serie: /^(s[ée]ries?|tv|shows?|tv ?shows?)$/i, game: /^(jeux|games?|roms?)$/i,
  album: /^(musiques?|music)$/i, photos: /^(photos?|pictures?|images?)$/i, book: /^(livres?|books?|bd|comics?)$/i
};
const COVER_NAMES = ["poster", "cover", "folder", "front", "jaquette", "boxart"];

const ext = (f) => path.extname(f).slice(1).toLowerCase();
const idOf = (kind, rel) => kind[0] + crypto.createHash("sha1").update(kind + ":" + rel).digest("hex").slice(0, 14);
const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

// « Le.Grand.Bleu.1988.1080p.BluRay » → { title: "Le Grand Bleu", year: 1988 }
// (aussi « [YTS] Jurassic Park (1993) [1080p] », « Breaking.Bad » — un dossier, pas une extension —, « 1917.2019.1080p »)
const KNOWN_EXT = new Set([...VIDEO, ...AUDIO, ...BOOK, ...Object.keys(ROM), ...Object.values(CS.CONSOLES || {}).flatMap((c) => c.ext || []), "iso", "bin", "cue", "zip", "7z", "chd", "nfo", "rar", "m3u"]);
// mots techniques d'un nom de fichier (qualité, source, codec) : tout ce qui suit est retiré
const RELEASE = /\b(2160p|1080p|1080i|720p|576p|480p|4k|uhd|hdr10?|bluray|blu ray|bdrip|brrip|bd ?remux|remux|webrip|web ?dl|hdtv|hdlight|mhd|dvdrip|dvdscr|hdrip|tvrip|x264|x265|h ?264|h ?265|hevc|xvid|divx|10 ?bits?|ac3|eac3|dts(?: ?hd)?|truehd|atmos)\b.*$/i;
// langue et édition, seulement en fin de nom (« The French Dispatch » garde son titre)
const TAIL = /(\s+-)?\s+(multi|vf2?|vff|vfq|vfi|vo|vost|vostfr|french|truefrench|subfrench|extended|unrated|uncut|remastered|imax|proper|repack|limited|internal|complete|integrale|dvd|web|hdr|dv|aac)$/i;
function cleanTitle(name) {
  let s = String(name), year = 0;
  const xm = /\.([a-z0-9]{2,4})$/i.exec(s); if (xm && KNOWN_EXT.has(xm[1].toLowerCase())) s = s.slice(0, -xm[0].length);
  s = s.replace(/^\s*(\[[^\]]*\]\s*)+/, "").replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ");
  s = s.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  // l'année : la dernière plausible (« 1917 2019 » → 2019 ; « 2001 l'Odyssée de l'espace » reste un titre)
  const ys = [...s.matchAll(/(^|[\s(\[-])((?:19|20)\d\d)(?=[\s)\]-]|$)/g)].filter((m) => m.index + m[1].length > 0);   // pas au tout début : « 1917 », « 2001 … » sont des titres
  const y = ys.find((m) => Number(m[2]) <= new Date().getFullYear() + 1);
  if (y) { year = Number(y[2]); s = s.slice(0, y.index + y[1].length); }
  if (!year) { s = s.replace(RELEASE, "").trim(); let k = 0; while (TAIL.test(s) && k++ < 8) s = s.replace(TAIL, ""); }
  s = s.replace(/[\s(\[-]+$/g, "").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return { title: s || String(name).replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[._]+/g, " ").trim(), year };
}

// ---------- vue des dossiers pendant une analyse ----------
// Chaque dossier n'est lu qu'une fois et chaque fichier n'est examiné (taille, date) qu'une fois par analyse : jaquettes,
// bandes-annonces, bonus, .nfo sont cherchés dans ces listes déjà lues, sans retourner sur le disque (un disque dur
// externe répond lentement). Les « souvenirs » (analyse précédente, gardée sur le disque du serveur) évitent de refaire
// ce qui coûte : console lue dans l'en-tête d'un disque, infos d'un jeu, .nfo. Tant qu'un fichier garde le même chemin,
// la même taille et la même date (et son dossier les mêmes noms), on reprend le souvenir au lieu de relire.
//   memo : Map clé → { s: signature, v: valeur } de l'analyse précédente ; o.full : tout relire (analyse demandée à la main)
function createVue(memo, o = {}) {
  const lists = new Map(), pend = new Map(), index = new Map(), imgs = new Map(), stats = new Map(), trees = new Map(), next = new Map();
  const low = process.platform === "win32" || process.platform === "darwin" ? (n) => n.toLowerCase() : (n) => n;
  // bad : dossiers illisibles (droits, erreur du disque) — leurs titres ne sont pas « supprimés », seulement hors ligne
  const V = { bad: new Set(), memo: next, n: { dossiers: 0, fichiers: 0, souvenirs: 0, relus: 0 } };
  const fail = (d, e) => { if (e && e.code !== "ENOENT" && e.code !== "ENOTDIR") V.bad.add(d); };
  // quelques demandes au disque à la fois, jamais bloquantes : le serveur continue de répondre pendant l'analyse
  let busy = 0; const waiting = [];
  const slot = async (job) => { if (busy >= (o.parallel || 8)) await new Promise((r) => waiting.push(r)); busy++; try { return await job(); } finally { busy--; const w = waiting.shift(); if (w) w(); } };
  // un dossier qui ne répond pas (partage réseau figé, sans erreur) ne bloque pas toute l'analyse : passé ce délai, il
  // compte comme illisible (V.bad) — ses titres restent, hors ligne — et l'analyse continue avec les autres dossiers
  const listMs = o.listMs || 20000;
  const late = (p, d) => { let t; return Promise.race([p, new Promise((_, ko) => { t = setTimeout(() => ko(Object.assign(new Error("pas de réponse : " + d), { code: "ETIMEDOUT" })), listMs); if (t.unref) t.unref(); })]).finally(() => clearTimeout(t)); };
  V.list = async (d) => {
    if (lists.has(d)) return lists.get(d) || [];
    let p = pend.get(d);
    if (!p) { V.n.dossiers++; p = slot(() => late(fsp.readdir(d, { withFileTypes: true }), d)).catch((e) => { fail(d, e); return null; }); pend.set(d, p); }
    const l = await p; lists.set(d, l); pend.delete(d); return l || [];
  };
  // taille et date des fichiers qu'on va regarder, demandées d'avance (en parallèle) plutôt qu'une à une en bloquant
  V.statAll = (files) => Promise.all(files.filter((f) => !stats.has(f)).map((f) => { stats.set(f, null); V.n.fichiers++; return slot(() => late(fsp.stat(f), f)).then((s) => { stats.set(f, s); }, () => {}); }));
  V.listSync = (d) => {
    if (lists.has(d)) return lists.get(d) || [];
    V.n.dossiers++; let l = null; try { l = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { fail(d, e); }
    lists.set(d, l); return l || [];
  };
  // le dossier a-t-il été lu ? true : oui ; false : absent ou illisible ; undefined : pas encore regardé
  V.seen = (d) => (lists.has(d) ? lists.get(d) !== null : undefined);
  const entry = (f) => { const d = path.dirname(f); let m = index.get(d); if (!m) { m = new Map(V.listSync(d).map((e) => [low(e.name), e])); index.set(d, m); } return m.get(low(path.basename(f))) || null; };
  // (un vrai fichier : pas un lien symbolique, comme lstat().isFile())
  V.isFile = (f) => { const e = entry(f); return !!(e && e.isFile()); };
  V.exists = (f) => !!entry(f);
  V.images = async (d) => {
    if (!imgs.has(d)) imgs.set(d, V.list(d).then((l) => new Map(l.filter((e) => e.isFile() && IMAGE.has(ext(e.name))).map((e) => [e.name.toLowerCase(), path.join(d, e.name)]))));
    return imgs.get(d);
  };
  V.stat = (f) => { if (stats.has(f)) return stats.get(f); V.n.fichiers++; let s = null; try { s = fs.statSync(f); } catch (_) {} stats.set(f, s); return s; };
  V.size = (f) => { const s = V.stat(f); return s ? s.size : 0; };
  V.sig = (f) => { const s = V.stat(f); return s ? `${s.size}:${Math.round(s.mtimeMs)}` : "-"; };
  // les noms d'un dossier et de ses sous-dossiers (profondeur donnée) : change dès qu'un fichier y est ajouté, retiré, renommé
  V.tree = (d, depth = 0) => {
    const k = depth + "|" + d; if (trees.has(k)) return trees.get(k);
    const h = crypto.createHash("sha1");
    const add = (x, n) => { for (const e of V.listSync(x).slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) { h.update(e.name + (e.isDirectory() ? "/" : "") + "\n"); if (n > 0 && e.isDirectory()) add(path.join(x, e.name), n - 1); } };
    add(d, depth); const v = h.digest("hex").slice(0, 16); trees.set(k, v); return v;
  };
  V.recall = (k, sig, make) => {
    const m = !o.full && memo && memo.get(k);
    if (m && m.s === sig) { V.n.souvenirs++; next.set(k, m); return m.v !== null && typeof m.v === "object" ? structuredClone(m.v) : m.v; }
    V.n.relus++; const v = make(); next.set(k, { s: sig, v }); return v !== null && typeof v === "object" ? structuredClone(v) : v;
  };
  return V;
}

// parcours d'un dossier et de ses sous-dossiers (plusieurs à la fois) ; les fichiers sont rendus triés (toujours le même ordre)
async function walk(d, out, count, V, depth = 0) {
  const found = []; await walkIn(d, found, count, V, depth);
  found.sort(); out.push(...found);
}
async function walkIn(d, out, count, V, depth) {
  if (depth > 6) return;
  const subs = [];
  for (const e of await V.list(d)) {
    if (e.name.startsWith(".")) continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) subs.push(walkIn(f, out, count, V, depth + 1));
    else if (e.isFile()) { out.push(f); count(); }
  }
  await Promise.all(subs);
}
// le serveur respire pendant une longue analyse (une page qui demande la bibliothèque n'attend pas la fin)
const breathe = () => new Promise((r) => setImmediate(r));
const STATS = (f) => VIDEO.has(ext(f)) || ext(f) === "nfo";
// ce qui, dans un dossier de jeux, n'est pas un jeu (sauvegardes, notices, listes de contrôle…)
const NOT_GAME = new Set(["txt", "srm", "sav", "state", "cht", "pdf", "sfo", "pup", "md5", "sha1", "dat", "xml", "json"]);
// images de chaque dossier : lues une seule fois pendant un scan (un dossier de 2 000 jeux était relu 2 000 fois),
// dans la liste déjà lue par le parcours des dossiers
async function coverFor(file, dir, alone, V) {
  const base = file ? file.replace(/\.[^.]+$/, "") : null;
  const names = await V.images(dir);
  if (base) for (const x of IMAGE) { const n = path.basename(base).toLowerCase() + "." + x; if (names.has(n)) return names.get(n); }
  if (alone || !file) for (const c of COVER_NAMES) for (const x of IMAGE) { const n = c + "." + x; if (names.has(n)) return names.get(n); }
  return "";
}
function sysOf(file, root) {
  // un .chd peut être un disque de PlayStation, de PC Engine CD ou de Mega-CD : le dossier décide d'abord
  const e = ext(file); if (ROM[e] && e !== "chd") return ROM[e];
  const rel = path.relative(root, path.dirname(file));
  for (const part of rel.split(path.sep).reverse()) for (const [re, s] of SYS_DIR) if (re.test(part)) return s;
  return ROM[e] || "";
}

// o.memo : souvenirs de l'analyse précédente ; o.full : tout relire. Rend aussi la vue de l'analyse (lib.vue) : BP.enrich
// et applyNfo s'en servent pour ne pas relire les dossiers, memoire.js pour reconnaître un disque absent ou illisible.
async function scanLibrary(roots, onCount = () => {}, o = {}) {
  let n = 0; const count = () => { n++; if (n % 200 === 0) onCount(n); };
  const items = [], byId = new Map(), V = createVue(o.memo, o);
  let root = "";
  // le dossier d'un titre, relatif à sa racine et toujours avec des « / » (« Films/Science-fiction ») : la page s'en sert
  // pour « Un dossier » (Personnaliser l'accueil) ; jamais le chemin complet du disque
  const relDir = (d) => path.relative(root, d).split(path.sep).filter(Boolean).join("/");
  // chaque titre retient son dossier racine (disque débranché : ses titres restent, hors ligne)
  const add = (it) => { if (byId.has(it.id)) return; it.root = root; byId.set(it.id, it); items.push(it); };
  if (J.resetDirCache) J.resetDirCache();   // dossiers relus à neuf à chaque scan
  let jeuxSig = null; const sigJeux = () => (jeuxSig === null ? (jeuxSig = J.sigJeux ? J.sigJeux(roots) : "") : jeuxSig);

  for (root of roots) {
    for (const top of await V.list(root)) {
      if (!top.isDirectory()) continue;
      const kind = Object.keys(DIRS).find((k) => DIRS[k].test(top.name)); if (!kind) continue;
      const base = path.join(root, top.name);

      if (kind === "film") {
        const files = []; await walk(base, files, count, V); await V.statAll(files.filter(STATS));
        const vids = files.filter((f) => VIDEO.has(ext(f)) && !/sample|trailer|bande[- ]annonce/i.test(path.basename(f)) && !BP.extraKind(f, base));
        const perDir = new Map(); for (const f of vids) { const d = path.dirname(f); perDir.set(d, (perDir.get(d) || 0) + 1); }   // (comptés une fois au lieu de pour chaque film)
        let k = 0;
        for (const f of vids) {
          if (++k % 200 === 0) await breathe();
          const dir = path.dirname(f), alone = dir !== base && perDir.get(dir) === 1;
          const t = cleanTitle(alone ? path.basename(dir) : path.basename(f));
          const rel = path.relative(root, f), id = idOf("film", rel), cov = await coverFor(f, dir, alone, V);
          add({ id, kind: "film", title: t.title, file: f, coverFile: cov,
            pub: { id, kind: "film", title: t.title, year: t.year || "", ext: ext(f), cover: cov ? coverUrl(id) : "", size: V.size(f), dir: relDir(dir) } });
        }
      }

      if (kind === "serie") {
        for (const sd of await V.list(base)) {
          if (!sd.isDirectory() || sd.name.startsWith(".")) continue;
          const dir = path.join(base, sd.name), files = []; await walk(dir, files, count, V); await V.statAll(files.filter(STATS));
          const vids = files.filter((f) => VIDEO.has(ext(f)) && !BP.extraKind(f, dir)).sort(collator.compare); if (!vids.length) continue;
          const t = cleanTitle(sd.name), rel = path.relative(root, dir), id = idOf("serie", rel);
          let auto = 0; const eps = [];
          for (const f of vids) {
            const nm = path.basename(f);
            let s = 1, e = 0; const m = /s(\d{1,2})\s*e(\d{1,3})/i.exec(nm) || /\b(\d{1,2})x(\d{1,3})\b/i.exec(nm);
            if (m) { s = Number(m[1]); e = Number(m[2]); } else { const sm = /(?:saison|season|s)\s*(\d{1,2})/i.exec(path.relative(dir, path.dirname(f))); if (sm) s = Number(sm[1]); e = ++auto; }
            const eid = idOf("episode", path.relative(root, f));
            eps.push({ id: eid, kind: "episode", title: `${t.title} · S${s}E${e}`, s, e, file: f });
          }
          eps.sort((a, b) => a.s - b.s || a.e - b.e);
          const cov = await coverFor(null, dir, true, V);
          const it = { id, kind: "serie", title: t.title, dir, coverFile: cov, episodes: eps,
            pub: { id, kind: "serie", title: t.title, year: t.year || "", cover: cov ? coverUrl(id) : "", dir: relDir(dir), episodes: eps.map((x) => ({ id: x.id, s: x.s, e: x.e, ext: ext(x.file) })) } };
          add(it); for (const x of eps) byId.set(x.id, x);
        }
      }

      if (kind === "game") {
        // les jeux PS3 (et Xbox 360) rangés en dossier comptent pour UN jeu : on ne descend pas dedans
        const files = [], gameDirs = [];
        const walkGames = async (d, depth = 0) => {
          if (depth > 6) return;
          const list = await V.list(d);
          if (list.some((x) => x.isDirectory() && /^PS3_GAME$/i.test(x.name)) || list.some((x) => x.isFile() && /^PS3_DISC\.SFB$/i.test(x.name))) { gameDirs.push([d, "ps3"]); count(); return; }
          const subs = [];
          for (const x of list) { if (x.name.startsWith(".")) continue; const f = path.join(d, x.name); if (x.isDirectory()) subs.push(walkGames(f, depth + 1)); else if (x.isFile()) { files.push(f); count(); } }
          await Promise.all(subs);
        };
        await walkGames(base); files.sort(); gameDirs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        await V.statAll(files.filter((f) => { const x = ext(f); return x === "nfo" || !(IMAGE.has(x) || VIDEO.has(x) || NOT_GAME.has(x)); }));
        // une piste .bin accompagnée de son .cue : on ne garde que le .cue
        const cues = new Set(files.filter((f) => ext(f) === "cue").map((f) => path.dirname(f)));
        const entries = files.map((f) => [f, ""]).concat(gameDirs);
        for (const [f, forced] of entries) {
          const e = forced ? "" : ext(f);
          if (!forced && (IMAGE.has(e) || VIDEO.has(e) || e === "nfo" || NOT_GAME.has(e))) continue;
          if (e === "bin" && cues.has(path.dirname(f))) continue;
          // une image de disque (.iso…) est reconnue en lisant son en-tête : souvenir tant que le fichier ne change pas
          const sys = forced || (["iso", "rvz", "img"].includes(e) ? V.recall("sys|" + f, V.sig(f) + "|" + base, () => CS.consoleOf(f, base) || sysOf(f, base)) : CS.consoleOf(f, base) || sysOf(f, base)); if (!sys) continue;
          const name = path.basename(f), region = CS.regionOf(name);
          const t = cleanTitle(name.replace(/\s*[([][^)\]]*[)\]]/g, " ")), rel = path.relative(root, f), id = idOf("game", rel);
          const cov = forced ? await coverFor(null, f, true, V) : await coverFor(f, path.dirname(f), false, V);
          const heavy = !!CS.CONSOLES[sys];
          // année, joueurs, hack, traduction, disque, BIOS, aperçu vidéo, codes de triche (voir jeux.js) : souvenir tant que
          // le jeu, son dossier (aperçus, triche posés à côté) et les dossiers BIOS / Triche / Bases ne changent pas
          const jx = forced ? { pub: {} } : { pub: V.recall("jeu|" + f, [V.sig(f), V.tree(path.dirname(f), 2), sigJeux(), sys, base, t.title].join("|"), () => J.infoJeu(f, name, sys, base, roots, t.title).pub) };
          add({ id, kind: "game", title: t.title, file: f, sys, heavy, coverFile: cov,
            pub: { id, kind: "game", title: t.title, platform: heavy ? CS.CONSOLES[sys].nom : SYS_NAME[sys] || sys, sys, ext: e, region, heavy, cover: cov ? coverUrl(id) : "", dir: relDir(path.dirname(f)), ...jx.pub } });
        }
      }

      if (kind === "album" || kind === "photos") {
        const dirs = new Map(); const files = []; await walk(base, files, count, V);
        for (const f of files) { const ok = kind === "album" ? AUDIO.has(ext(f)) : IMAGE.has(ext(f)); if (!ok) continue; const d = path.dirname(f); if (!dirs.has(d)) dirs.set(d, []); dirs.get(d).push(f); }
        for (const [d, list] of dirs) {
          list.sort(collator.compare);
          const rel = path.relative(root, d), id = idOf(kind, rel), name = path.basename(d);
          if (kind === "album") {
            let artist = "", title = name; const am = /^(.+?)\s+-\s+(.+)$/.exec(name);
            if (am) { artist = am[1]; title = am[2]; } else if (path.dirname(d) !== base) artist = path.basename(path.dirname(d));
            const cov = await coverFor(null, d, true, V);
            add({ id, kind: "album", title, files: list, coverFile: cov,
              pub: { id, kind: "album", title, artist, cover: cov ? coverUrl(id) : "", tracks: list.map((f, i) => ({ n: i, title: cleanTrack(path.basename(f)) })) } });
          } else {
            const shots = list.filter((f) => !COVER_NAMES.includes(path.basename(f).replace(/\.[^.]+$/, "").toLowerCase()) || list.length === 1);
            add({ id, kind: "photos", title: name, files: shots, coverFile: shots[0],
              pub: { id, kind: "photos", title: name, count: shots.length, names: shots.map((f) => path.basename(f)), cover: coverUrl(id) } });
          }
        }
      }

      if (kind === "book") {
        const files = []; await walk(base, files, count, V); await V.statAll(files.filter((f) => BOOK.has(ext(f))));
        for (const f of files) {
          if (!BOOK.has(ext(f))) continue;
          const nm = path.basename(f).replace(/\.[^.]+$/, ""); let author = "", title = nm; const am = /^(.+?)\s+-\s+(.+)$/.exec(nm); if (am) { author = am[1]; title = am[2]; }
          const rel = path.relative(root, f), id = idOf("book", rel), cov = await coverFor(f, path.dirname(f), false, V);
          add({ id, kind: "book", title, file: f, coverFile: cov, pub: { id, kind: "book", title, author, ext: ext(f), size: V.size(f), cover: cov ? coverUrl(id) : "" } });
        }
      }
    }
  }
  onCount(n);
  // jeux à plusieurs disques : un seul jeu, avec la liste de ses disques
  const kept = J.regrouper(items, byId, coverUrl); items.length = 0; items.push(...kept);
  items.sort((a, b) => collator.compare(a.title, b.title));
  return { items, byId, vue: V };
}

// les jaquettes sont servies avec une signature (l'appli les affiche sans ajouter la clé d'appairage)
let SECRET = crypto.randomBytes(16).toString("hex");
function setSecret(s) { if (s) SECRET = s; }
function coverSig(id) { return crypto.createHmac("sha256", SECRET).update("cover:" + id).digest("hex").slice(0, 20); }
function coverUrl(id) { return `/cover/${id}?k=${coverSig(id)}`; }
function cleanTrack(n) { return n.replace(/\.[^.]+$/, "").replace(/^\s*(\d{1,3})[\s.\-_]+/, "").replace(/_/g, " ").trim(); }

module.exports = { scanLibrary, createVue, idOf, cleanTitle, MIME, coverSig, coverUrl, setSecret };
