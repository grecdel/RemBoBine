// Rembobine — fiches et jaquettes cherchées sur internet, d'après le titre (quand le serveur est connecté).
//   Films, séries : Wikidata (le bon titre, l'année, le genre, la réalisation, les acteurs, les bandes-annonces YouTube,
//                   l'affiche) + Wikipédia (résumé en français, affiche de l'article anglais si besoin) ;
//                   avec une clé TMDB (gratuite) : TMDB en priorité (affiche, fond, acteurs, bandes-annonces), Wikidata complète.
//   Bandes-annonces : une LISTE de candidates (pub.trailers), en français d'abord, puis en anglais, puis les autres :
//                   Wikidata (YouTube, langue indiquée), TMDB (si clé), et l'API publique de Dailymotion (quand YouTube
//                   refuse une vidéo — limite d'âge, pays —, la page passe à la suivante). Jamais de page YouTube récupérée.
//   Jeux : jaquette, écran titre et capture de la bibliothèque libre de RetroArch (thumbnails.libretro.com, nom « No-Intro »),
//          résumé, année, éditeur, genre sur Wikidata / Wikipédia.
//   Livres : couverture Open Library, résumé (Wikipédia en français, sinon Google Books, sinon Open Library), auteur, année.
//   Albums (CD) : MusicBrainz (artiste, année, genre, liste des pistes) et pochette sur Cover Art Archive.
// Ordre : ce qui se voit d'abord (derniers ajouts, puis films et séries en alternance, comme les rangées de l'accueil),
// ensuite les livres, les jeux, la musique ; « 02 Presto » (numéro d'ordre d'une collection) est cherché « Presto ».
// Politesse : un User-Agent qui dit qui on est, une file d'attente par site (MusicBrainz : une demande par seconde au plus),
// nouvel essai après un « trop de demandes » (429/503, en respectant Retry-After), le site encombré est ralenti, et mis
// de côté le temps qu'il demande (sans bloquer les autres). Rien n'est demandé si l'option est coupée.
// Sécurité : tailles limitées, images vérifiées par leur contenu (JPEG, PNG, WebP, GIF ; jamais de SVG ni de page web),
// téléchargées seulement depuis les sites connus, rangées dans le dossier des fiches sous un nom choisi par le serveur.
// Tout est gardé sur le disque du serveur : une fiche n'est cherchée qu'une fois. Échec passager (site encombré, coupure,
// image pas téléchargée) : nouvel essai dans 15 min, puis de plus en plus espacé ; rien trouvé : nouvel essai dans quelques jours.
// Une image ou un résumé posé à côté du fichier (jaquette, .nfo, bande-annonce « -trailer ») reste prioritaire.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASES = {
  wikiFr: "https://fr.wikipedia.org", wikiEn: "https://en.wikipedia.org", wikidata: "https://www.wikidata.org", commons: "https://commons.wikimedia.org", upload: "https://upload.wikimedia.org",
  mb: "https://musicbrainz.org", caa: "https://coverartarchive.org", libretro: "https://thumbnails.libretro.com",
  tmdb: "https://api.themoviedb.org", tmdbImg: "https://image.tmdb.org",
  ol: "https://openlibrary.org", olCovers: "https://covers.openlibrary.org", gbooks: "https://www.googleapis.com",
  dm: "https://api.dailymotion.com"
};
// essais (faux internet) : un site non fourni est injoignable, pour ne jamais partir sur le vrai internet par erreur
const DEAD = Object.fromEntries(Object.keys(BASES).map((k) => [k, "http://127.0.0.1:9/" + k]));
// sites d'où une image peut venir (les adresses citées par les réponses, et leurs redirections)
const IMG_HOSTS = /(^|\.)(wikipedia\.org|wikimedia\.org|wikidata\.org|coverartarchive\.org|archive\.org|libretro\.com|tmdb\.org|openlibrary\.org|books\.google\.com|googleusercontent\.com|googleapis\.com)$/i;
// dossiers des jaquettes RetroArch, par console
const LIBRETRO = { nes: "Nintendo - Nintendo Entertainment System", snes: "Nintendo - Super Nintendo Entertainment System", gb: "Nintendo - Game Boy", gbc: "Nintendo - Game Boy Color",
  gba: "Nintendo - Game Boy Advance", n64: "Nintendo - Nintendo 64", nds: "Nintendo - Nintendo DS", vb: "Nintendo - Virtual Boy", gc: "Nintendo - GameCube", wii: "Nintendo - Wii",
  md: "Sega - Mega Drive - Genesis", sms: "Sega - Master System - Mark III", gg: "Sega - Game Gear", "32x": "Sega - 32X", pce: "NEC - PC Engine - TurboGrafx 16",
  psx: "Sony - PlayStation", ps2: "Sony - PlayStation 2", psp: "Sony - PlayStation Portable", ps3: "Sony - PlayStation 3", a26: "Atari - 2600", a78: "Atari - 7800",
  ngp: "SNK - Neo Geo Pocket", ws: "Bandai - WonderSwan", c64: "Commodore - 64", zx: "Sinclair - ZX Spectrum", cpc: "Amstrad - CPC", arcade: "FBNeo - Arcade Games", mame: "MAME",
  xbox: "Microsoft - Xbox", x360: "Microsoft - Xbox 360", segacd: "Sega - Mega-CD - Sega CD" };
const KIND_WORD = { film: ["film", "film"], serie: ["série télévisée", "TV series"], game: ["jeu vidéo", "video game"], album: ["album", "album"], book: ["livre", "book"] };
// « nature » Wikidata attendue (P31), et mots de la description en secours
const WD_TYPES = {
  film: new Set(["Q11424", "Q24869", "Q202866", "Q229390", "Q506240", "Q24862", "Q157443", "Q1257444", "Q130232", "Q188473", "Q319221", "Q200092", "Q842256", "Q1054574", "Q17013749", "Q20667187"]),
  serie: new Set(["Q5398426", "Q526877", "Q1259759", "Q117467246", "Q581714", "Q21191270", "Q15416", "Q63952888", "Q1366112", "Q7724161"]),
  game: new Set(["Q7889", "Q4393107", "Q865493", "Q16070115", "Q21125433", "Q64170203"]),
  album: new Set(["Q482994", "Q208569", "Q209939", "Q222910", "Q169930", "Q1242743", "Q108346082"]),
  book: new Set(["Q7725634", "Q571", "Q47461344", "Q8261", "Q1279564", "Q49084", "Q725377", "Q1667921", "Q277759", "Q3297186", "Q1004", "Q14406742", "Q12106333"])
};
const WD_DESC = { album: /\balbum\b/i, film: /\bfilm|movie|long[- ]m[eé]trage/i, serie: /s[eé]rie|series|feuilleton|sitcom|anime/i, game: /jeu vid[eé]o|video game/i, book: /roman|livre|novel|book|conte|nouvelle|r[eé]cit|essai|bande dessin[eé]e/i };
// une série de films, une franchise (« Toy Story » : « série de films d'animation ») n'est ni un film ni une série télévisée
// (vu sur le vrai Wikidata : elle passait devant le film quand la recherche Wikipédia n'avait pas répondu)
const WD_GROUP = new Set(["Q24856", "Q196600"]);
const DESC_GROUP = /s[eé]rie de films|film series|franchise|saga\b|trilogie|trilogy|t[eé]tralogie/i;
const Q_TRAILER = "Q622550";
// langue d'une vidéo (Wikidata P407) et langue originale d'un film (P364)
const Q_LANG = { Q150: "fr", Q1860: "en" };
// « The Office (US) » : le pays d'origine aide à choisir entre deux homonymes (Wikidata P495)
const PAYS = { us: "Q30", usa: "Q30", uk: "Q145", gb: "Q145", fr: "Q142", ca: "Q16", au: "Q408", be: "Q31", de: "Q183", es: "Q29", it: "Q38", jp: "Q17", nz: "Q664", kr: "Q884", dk: "Q35", se: "Q34", no: "Q20" };
// version de la recherche : un titre PAS trouvé par une recherche plus ancienne est recherché une fois de plus
// (3 : numéros d'ordre, séries homonymes) ; les fiches trouvées ne sont pas refaites (rien n'est retéléchargé)
const SV = 3;
// version de la liste des bandes-annonces : recalculée pour les fiches déjà gardées (Wikidata, TMDB, Dailymotion seulement)
const TV = 1;
// console du jeu → plateforme Wikidata (P400)
const WD_PLAT = { md: ["Q10676"], snes: ["Q183259"], nes: ["Q172742"], gb: ["Q186437"], gbc: ["Q203992"], gba: ["Q188642"], n64: ["Q184839"], nds: ["Q170323"], psx: ["Q10677"], ps2: ["Q10680"],
  sms: ["Q209868"], gg: ["Q751719"], pce: ["Q1057377"], a26: ["Q206261"], "32x": ["Q1063978"], psp: ["Q170325"], gc: ["Q182172"], wii: ["Q8079"], vb: ["Q164651"], c64: ["Q99775"], zx: ["Q23882"], segacd: ["Q1047516"] };
// « film ou téléfilm d'aventure » → « Aventure », « cinéma de science-fiction » → « Science-fiction »
const cleanGenre = (x) => String(x || "").replace(/^(film|téléfilm|cinéma|jeu vidéo|jeu|série télévisée|série|genre|roman|musique|album)(\s+(ou|et)\s+(téléfilm|film|série)s?)?(\s+(de|du|des)\s+|\s+d['’]|\s+)/i, "").trim().replace(/^./, (c) => c.toUpperCase());

const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
// pour comparer deux titres : sans article au début (« La Soupe aux choux » = « Soupe aux choux »), sans « (film) »
const core = (t) => norm(String(t || "").replace(/\s*\([^)]*\)\s*$/, "")).replace(/^(le|la|les|l|un|une|des|the|a|an|der|die|das|el|il|lo)\s+/, "");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

// ---------- le titre à chercher : sans le numéro d'ordre d'une collection ----------
// « 02 Presto », « 10 - Mini Buzz » : numéro d'ordre (on cherche « Presto », « Mini Buzz ») ; « 101 Dalmatiens »,
// « 12 hommes en colère », « 28 jours plus tard », « 300 », « 1917 », « 2001… » : de vrais titres, cherchés tels quels.
//   sûr : il commence par 0 (« 02 »), ou le nom du fichier le sépare du titre (« 10 - », « 10. », « 10) ») → sans le numéro ;
//   suite : des films voisins du même dossier se suivent (« 02 … », « 03 … », « 04 … ») → sans le numéro (titre identique
//           exigé, année comprise), puis le titre entier ;
//   sinon (1 ou 2 chiffres) : le titre entier, puis sans le numéro (titre identique exigé).
const LEAD = /^(\d{1,3})\s+(?=\S)/;
// le nom (fichier ou dossier du film) d'où vient le titre
function rawName(it) {
  if (!it.file) return "";
  const f = path.basename(String(it.file)).replace(/\.[a-z0-9]{2,4}$/i, ""), d = path.basename(path.dirname(String(it.file))), m = LEAD.exec(it.title || "");
  return m && !f.startsWith(m[1]) && d.startsWith(m[1]) ? d : f;
}
// les films dont le numéro en tête fait partie d'une suite (dans le même dossier)
function numberedRuns(items) {
  const groups = new Map();
  for (const it of items) {
    if (it.kind !== "film" || !it.file) continue;
    const m = LEAD.exec(it.title || ""); if (!m) continue;
    const f = String(it.file), raw = rawName(it), key = raw === path.basename(path.dirname(f)) ? path.dirname(path.dirname(f)) : path.dirname(f);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: it.id, n: Number(m[1]), zero: /^0\d/.test(m[1]) });
  }
  const out = new Set();
  for (const list of groups.values()) {
    if (list.length < 3) continue;
    const nums = [...new Set(list.map((x) => x.n))].sort((a, b) => a - b);
    let best = [], cur = [];
    for (const n of nums) { if (cur.length && n - cur[cur.length - 1] > 2) cur = []; cur.push(n); if (cur.length > best.length) best = cur.slice(); }
    if (best.length < 3) continue;
    const inRun = list.filter((x) => best.includes(x.n));
    if (best[0] <= 3 || inRun.some((x) => x.zero)) for (const x of inRun) out.add(x.id);
  }
  return out;
}
// les essais de recherche d'un titre : [{ q, strict }] (strict : titre identique et année compatible)
function searchOf(it, runs) {
  const t = String(it.title || ""), m = it.kind === "film" ? LEAD.exec(t) : null;
  let rest = m ? t.slice(m[0].length).trim() : "";
  if (!m || !/[a-zà-ÿ]/i.test(rest)) return [{ q: t }];
  rest = rest.replace(/^[-–—.)\s]+/, "").trim();   // « 10 - Mini Buzz »
  const raw = rawName(it);
  if (/^0\d$/.test(m[1]) || /^\d{1,2}\s*(?:[.)]\s|[-–—]\s)/.test(raw)) return [{ q: rest }];
  if (runs && runs.has(it.id)) return [{ q: rest, strict: true }, { q: t }];
  return m[1].length <= 2 ? [{ q: t }, { q: rest, strict: true }] : [{ q: t }];
}

// type d'une image d'après ses premiers octets (jamais d'après ce que dit le site)
function imageType(buf) {
  if (!buf || buf.length < 200) return "";
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "png";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.slice(0, 4).toString("latin1") === "GIF8") return "gif";
  return "";
}
// Retry-After : des secondes, ou une date
function retryMs(h, k) {
  const v = String(h || "").trim(); if (/^\d+$/.test(v)) return Number(v) * 1000;
  const d = Date.parse(v); if (Number.isFinite(d)) return Math.max(0, d - Date.now());
  return 2000 * Math.pow(2, k);
}

function createFiches(o) {
  const dir = path.join(o.dataDir, "fiches"); fs.mkdirSync(dir, { recursive: true });
  const test = !!o.bases;
  const B = test ? { ...DEAD, ...o.bases } : { ...BASES }, log = o.log || (() => {}), F = o.fetch || fetch;
  const UA = `Rembobine/${String(o.version || "1.0").replace(/[^\w.+-]/g, "").slice(0, 30) || "1.0"} (https://github.com/grecdel/Rembobine)`;
  const file = path.join(dir, "fiches.json");
  let db = {}; try { db = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) {}
  const save = () => { try { fs.writeFileSync(file + ".tmp", JSON.stringify(db)); fs.renameSync(file + ".tmp", file); } catch (_) {} };
  const here = (f) => { if (!f) return ""; const g = path.join(dir, path.basename(f)); return fs.existsSync(g) ? g : fs.existsSync(f) ? f : ""; };
  const listings = new Map();   // console/dossier → noms des images RetroArch (aussi gardés sur le disque une semaine)
  const virt = new Map();       // fiches demandées par la page pour ses propres fichiers (id virtuel → images)
  let busy = false, again = null, cut = false;
  // limited : « trop de demandes » (429/503) ou site mis de côté ; hits : vraies réponses 429/503 ; skip : demandes pas faites
  // (site en pause) ; fail : coupure, délai dépassé ; err : erreur du site (500…) ; ok : réponses reçues
  const stats = { limited: 0, net: 0, fail: 0, hits: 0, skip: 0, err: 0, ok: 0 };

  // ---------- internet, poliment ----------
  const GAP = { "musicbrainz.org": o.mbDelay != null ? o.mbDelay : 1100, "coverartarchive.org": o.mbDelay != null ? o.mbDelay : 300, "www.wikidata.org": 200, "fr.wikipedia.org": 120, "en.wikipedia.org": 120,
    "commons.wikimedia.org": 200, "upload.wikimedia.org": 150, "thumb.wikimedia.org": 150, "www.googleapis.com": 400, "openlibrary.org": 350, "api.dailymotion.com": 300 };
  const nextAt = new Map();
  // un site qui répond « trop de demandes » est ralenti (écart doublé, jusqu'à 15 s), puis réaccéléré peu à peu
  const slow = new Map();
  const gapOf = (host) => test ? 0 : Math.max(GAP[host] != null ? GAP[host] : 100, slow.get(host) || 0);
  const slowDown = (host) => { if (!test) slow.set(host, Math.min(Math.max((slow.get(host) || 0) * 2, 1000), 15000)); };
  const speedUp = (host) => { const g = slow.get(host); if (!g) return; const n = g * 0.9; if (n <= (GAP[host] != null ? GAP[host] : 100)) slow.delete(host); else slow.set(host, n); };
  // pause plus longue que ça (Retry-After d'une demi-heure…) : on ne l'attend pas, la fiche sera reprise plus tard
  const LONG = test ? 3000 : 60000;
  async function slot(host) {
    const now = Date.now(), t = Math.max(now, nextAt.get(host) || 0);
    nextAt.set(host, t + gapOf(host)); if (t > now) await wait(t - now);
  }
  async function get(url, { json = true, ms = 15000, max, tries = 3 } = {}) {
    // (essais : tout le faux internet est sur une seule adresse, chaque « site » y est un dossier)
    let host; try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) return null; host = test ? u.host + "/" + (u.pathname.split("/")[1] || "") : u.host; } catch (_) { return null; }
    const lim = max || (json ? 6e6 : 12e6);
    for (let k = 0; k < tries; k++) {
      // le site a demandé une longue pause : on ne le sollicite pas avant (et on n'attend pas : les autres sites continuent)
      if ((nextAt.get(host) || 0) - Date.now() > LONG) { stats.limited++; stats.skip++; return null; }
      await slot(host);
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
      try {
        const r = await F(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: json ? "application/json" : "image/*,*/*;q=0.5" }, signal: ctl.signal, redirect: "follow" });
        stats.net++;
        if (r.status === 429 || r.status === 503) {
          stats.limited++; stats.hits++; slowDown(host);
          const wms = retryMs(r.headers && r.headers.get && r.headers.get("retry-after"), k);
          // le site demande d'attendre : on attend (jusqu'à une minute), et on ne le sollicite plus avant (jusqu'à une demi-heure)
          nextAt.set(host, Math.max(nextAt.get(host) || 0, Date.now() + Math.min(wms, test ? LONG + 1500 : 30 * 60000)));
          try { await r.arrayBuffer(); } catch (_) {}
          if (k < tries - 1 && wms <= LONG) continue;
          return null;
        }
        // erreur passagère du site (500, 502, 504…) : un nouvel essai un peu plus tard
        if (r.status >= 500) { stats.err++; try { await r.arrayBuffer(); } catch (_) {} if (k < tries - 1) { await wait(test ? 30 : 1500 * (k + 1)); continue; } return null; }
        if (!r.ok) { try { await r.arrayBuffer(); } catch (_) {} return null; }
        stats.ok++; speedUp(host);
        // une image redirigée vers un site inconnu : refusée
        if (!json && !test && r.url) { try { if (!IMG_HOSTS.test(new URL(r.url).hostname)) return null; } catch (_) {} }
        const len = Number(r.headers && r.headers.get && r.headers.get("content-length")) || 0; if (len > lim) return null;
        const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > lim) return null;
        if (!json) return buf;
        try { return JSON.parse(buf.toString("utf8")); } catch (_) { return null; }
      } catch (_) {
        stats.fail++;
        if (k < tries - 1) { await wait(test ? 30 : 800 * (k + 1)); continue; }
        return null;
      } finally { clearTimeout(t); }
    }
    return null;
  }
  // connecté ? n'importe quelle réponse d'un des sites suffit (même « trop de demandes » : internet est bien là)
  async function online() {
    for (const u of [`${B.wikiFr}/w/api.php?action=query&meta=siteinfo&format=json`, `${B.mb}/ws/2/area/?query=france&limit=1&fmt=json`, `${B.ol}/search.json?q=a&limit=1`]) {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
      try { const r = await F(u, { headers: { "User-Agent": UA }, signal: ctl.signal }); try { await r.arrayBuffer(); } catch (_) {} if (r.status) return true; }
      catch (_) {} finally { clearTimeout(t); }
    }
    return false;
  }
  async function download(url) {
    if (!url || /\.svg(\?|$)/i.test(url)) return null;
    if (!test) { try { if (!IMG_HOSTS.test(new URL(url).hostname)) return null; } catch (_) { return null; } }
    const buf = await get(url, { json: false, ms: 30000 }); return imageType(buf) ? buf : null;
  }
  // une image enregistrée dans le dossier des fiches, sous un nom choisi par le serveur ; seulement une vraie image
  async function saveImage(name, url) {
    const buf = await download(url); if (!buf) return "";
    return writeImage(name, buf);
  }
  function writeImage(name, buf) {
    const ext = imageType(buf); if (!ext) return "";
    const safe = String(name).replace(/[^\w-]/g, "").slice(0, 80); if (!safe) return "";
    const f = path.join(dir, `${safe}.${ext}`);
    for (const x of ["jpg", "png", "webp", "gif"]) if (x !== ext) { try { fs.unlinkSync(path.join(dir, `${safe}.${x}`)); } catch (_) {} }
    try { fs.writeFileSync(f + ".tmp", buf); fs.renameSync(f + ".tmp", f); } catch (_) { return ""; }
    return f;
  }

  // ---------- Wikipédia ----------
  const summary = async (base, title) => title ? get(`${base}/api/rest_v1/page/summary/${enc(String(title).replace(/ /g, "_"))}`) : null;
  async function wpSearch(base, q, n = 5) {
    const s = await get(`${base}/w/api.php?action=query&list=search&srsearch=${enc(q)}&srlimit=${n}&format=json`);
    return ((s && s.query && s.query.search) || []).map((h) => h.title);
  }
  // l'élément Wikidata de quelques articles
  async function wpQids(base, titles) {
    if (!titles.length) return [];
    const s = await get(`${base}/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=${enc(titles.slice(0, 20).join("|"))}&format=json`);
    const pages = (s && s.query && s.query.pages) || {}, byT = {};
    for (const pg of Object.values(pages)) if (pg.pageprops && pg.pageprops.wikibase_item) byT[pg.title] = pg.pageprops.wikibase_item;
    const red = {}; for (const r of ((s && s.query && (s.query.redirects || [])) || []).concat((s && s.query && s.query.normalized) || [])) red[r.from] = r.to;
    return titles.map((t) => byT[red[red[t]] || red[t] || t]).filter(Boolean);
  }

  // recherche Wikipédia ET éléments Wikidata des articles trouvés, en UNE demande (Wikimedia limite le nombre de demandes)
  async function wpFind(base, q, n = 5) {
    const s = await get(`${base}/w/api.php?action=query&generator=search&gsrsearch=${enc(q)}&gsrlimit=${n}&gsrnamespace=0&prop=pageprops&ppprop=wikibase_item&format=json`);
    return Object.values((s && s.query && s.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0))
      .map((pg) => pg.pageprops && pg.pageprops.wikibase_item).filter((x) => /^Q\d+$/.test(x || ""));
  }
  // un article par l'API « action » de Wikipédia, en une demande : son début, son image principale (avec sa taille, pour
  // reconnaître une affiche en hauteur), page d'homonymie ou non ; full : tout le texte (pour la section « Synopsis »).
  // (le résumé « REST » est plus vite limité par Wikimedia : il ne sert plus qu'aux affiches proposées de « Corriger la fiche »)
  async function article(base, title, full) {
    if (!title) return null;
    const s = await get(`${base}/w/api.php?action=query&prop=extracts%7Cpageimages%7Cpageprops&explaintext=1${full ? "&exsectionformat=wiki" : "&exintro=1"}&piprop=original%7Cthumbnail&pithumbsize=500&pilicense=any&ppprop=disambiguation%7Cpage_image%7Cpage_image_free&redirects=1&titles=${enc(title)}&format=json&formatversion=2`, { max: 3e6 });
    if (!s) return null;
    const pg = s.query && s.query.pages && s.query.pages[0];
    if (!pg || (pg.missing !== undefined && pg.missing !== false) || (pg.invalid !== undefined && pg.invalid !== false)) return { missing: true };
    const txt = String(pg.extract || ""), lead = txt.split(/\n==[^=]/)[0].replace(/\n{2,}/g, "\n").trim(), pp = pg.pageprops || {};
    // l'image : en vignette de 500 px pour une affiche, 1280 px au plus pour une grande image (une photo libre peut faire
    // 6000 px et plusieurs Mo : jamais l'original quand il est plus grand) ; free : image libre (photo, logo… ; une affiche de
    // film récente n'est jamais libre : elle est « non libre », sur Wikipédia en anglais)
    // (les vignettes viennent de thumb.wikimedia.org depuis 2026 ; l'original, sur upload.wikimedia.org, reste en secours)
    const or = pg.original, th = pg.thumbnail, ow = or ? Number(or.width) || 0 : 0;
    const thumb = th && th.source && /\/thumb\//.test(th.source) ? th.source : "";
    return { title: pg.title || title, intro: shorten(lead, 1200), text: full ? txt : "", disambig: pp.disambiguation !== undefined,
      image: or && or.source ? { url: thumb || or.source, big: ow > 1280 && thumb ? thumb.replace(/\/\d+px-([^/?]+)(\?.*)?$/, "/1280px-$1$2") : or.source,
        alt: thumb ? or.source : "", w: ow, h: Number(or.height) || 0, free: !!pp.page_image_free && !pp.page_image } : null };
  }
  // un texte coupé proprement (à la fin d'une phrase)
  function shorten(s, n) { s = String(s || "").trim(); if (s.length <= n) return s; const cut = s.slice(0, n), end = cut.lastIndexOf(". "); return (end > n * 0.4 ? cut.slice(0, end + 1) : cut) + " …"; }
  // la section « Synopsis » (ou « Résumé », « Intrigue »…) d'un texte d'article
  function synopsisOf(txt) {
    const m = /\n==\s*(Synopsis|Résumé|Intrigue|Histoire|Scénario|Argument|Trame|Synopsis détaillé)\s*==\s*\n([\s\S]*?)(?=\n==[^=]|$)/i.exec(String(txt || "")); if (!m) return "";
    const body = m[2].replace(/^\s*=+[^=\n]+=+\s*$/gm, "").replace(/\n{2,}/g, "\n").trim();
    return body.length < 80 ? "" : shorten(body, 1000);
  }
  // la section « Synopsis » d'un article, en texte simple
  async function synopsis(title) {
    const s = await get(`${B.wikiFr}/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&titles=${enc(title)}&format=json`, { max: 3e6 });
    const pg = s && s.query && s.query.pages && Object.values(s.query.pages)[0], txt = pg && pg.extract; if (!txt) return "";
    return synopsisOf(txt);
  }
  // ---------- Wikidata ----------
  async function wdSearch(q, lang) {
    const s = await get(`${B.wikidata}/w/api.php?action=wbsearchentities&search=${enc(q)}&language=${lang}&uselang=${lang}&type=item&limit=8&format=json`);
    return ((s && s.search) || []).map((x) => x.id).filter((x) => /^Q\d+$/.test(x));
  }
  async function wdEntities(ids, props = "claims|sitelinks|labels|descriptions") {
    const out = {}; ids = [...new Set(ids)].filter((x) => /^Q\d+$/.test(x));
    for (let i = 0; i < ids.length; i += 50) {
      const s = await get(`${B.wikidata}/w/api.php?action=wbgetentities&ids=${ids.slice(i, i + 50).join("|")}&props=${enc(props)}&languages=fr%7Cen&sitefilter=frwiki%7Cenwiki&format=json`);
      Object.assign(out, (s && s.entities) || {});
    }
    return out;
  }
  const snaks = (e, P) => (((e && e.claims) || {})[P] || []).filter((s) => s.rank !== "deprecated" && s.mainsnak && s.mainsnak.datavalue);
  const vals = (e, P) => snaks(e, P).map((s) => s.mainsnak.datavalue.value);
  const qids = (e, P) => vals(e, P).map((v) => v && v.id).filter(Boolean);
  const label = (e) => e ? ((e.labels || {}).fr || (e.labels || {}).en || {}).value || "" : "";
  const desc = (e) => e ? [((e.descriptions || {}).fr || {}).value, ((e.descriptions || {}).en || {}).value].filter(Boolean).join(" · ") : "";
  function wdYear(e) {
    // date de sortie d'abord ; début (séries) ou création seulement à défaut (« écrit à partir de 1990 » n'est pas la sortie)
    for (const P of ["P577", "P580", "P571"]) {
      const ys = vals(e, P).map((v) => Number((/^[+-]?(\d{4})/.exec((v && v.time) || "") || [])[1])).filter((y) => y > 1000);
      if (ys.length) return Math.min(...ys);
    }
    return 0;
  }
  // tailles de vignettes standard de Wikimedia (les autres sont refusées) : 500 pour une affiche, 1280 pour un fond
  const commonsUrls = (name, w) => { if (!name) return []; const n = String(name).replace(/ /g, "_"), h = crypto.createHash("md5").update(n).digest("hex");
    return [`${B.upload}/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${enc(n)}/${w}px-${enc(n)}${/\.(tiff?|pdf|djvu)$/i.test(n) ? ".jpg" : ""}`, `${B.commons}/wiki/Special:FilePath/${enc(n)}`]; };
  // la bonne fiche parmi les candidats : la bonne nature (film, série…), le titre, l'année (et le pays : « The Office (US) »)
  // strict : seulement un titre identique, et la bonne année si on la connaît (titre essayé sans son numéro d'ordre)
  function pickEntity(ents, order, title, year, kind, plat, strict) {
    const want = core(title), wantW = want.split(" ").filter(Boolean);
    const pm = /\(\s*([a-z]{2,3})\s*\)\s*$/i.exec(String(title || "")), pays = pm ? PAYS[pm[1].toLowerCase()] : "";
    let best = null;
    order.forEach((id, i) => {
      const e = ents[id]; if (!e || e.missing !== undefined) return;
      const types = qids(e, "P31"), d = desc(e);
      const group = (kind === "film" || kind === "serie") && (types.some((t) => WD_GROUP.has(t)) || DESC_GROUP.test(d));
      const typed = types.some((t) => WD_TYPES[kind].has(t)) || (!group && WD_DESC[kind].test(d) && !/^(Wikim|page d'homonymie|disambiguation)/i.test(d));
      if (!typed) return;
      const names = [label(e), (e.labels && e.labels.en && e.labels.en.value) || "", ((e.sitelinks || {}).frwiki || {}).title, ((e.sitelinks || {}).enwiki || {}).title].filter(Boolean).map(core);
      let sc = 10 - Math.min(i, 9);
      if (names.includes(want)) sc += 40;
      else if (strict) return;
      else if (names.some((n) => n.startsWith(want + " ") || want.startsWith(n + " ") || n.includes(want))) sc += 18;
      else { const hit = Math.max(0, ...names.map((n) => { const w = new Set(n.split(" ")); return wantW.filter((x) => w.has(x)).length / Math.max(1, wantW.length); })); if (hit < 0.6) return; sc += Math.round(hit * 15); }
      const y = wdYear(e);
      if (year && y) { if (Math.abs(y - year) <= 1) sc += 25; else if (strict) return; else sc -= 25; }
      if (plat && plat.length) sc += qids(e, "P400").some((q) => plat.includes(q)) ? 30 : -10;
      if (pays) { const c = qids(e, "P495"); if (c.length) sc += c.includes(pays) ? 15 : -10; }
      if ((e.sitelinks || {}).frwiki) sc += 6;
      if ((e.sitelinks || {}).enwiki) sc += 3;
      if (!best || sc > best.sc) best = { sc, e };
    });
    return best && best.sc >= 20 ? best.e : null;
  }
  async function wdFind(title, year, kind, extra, plat, strict) {
    const word = KIND_WORD[kind] || ["", ""];
    // cherché sans « (US) », « (Director's cut) » à la fin (le titre complet sert encore à choisir)
    const q = String(title || "").replace(/\s*\([^)]*\)\s*$/, "").trim() || String(title || "");
    // le moins de demandes possible : Wikidata et Wikipédia en français d'abord, l'anglais seulement si rien ne convient
    const [a, b] = await Promise.all([wdSearch(q, "fr"), wpFind(B.wikiFr, `${q} ${year || ""} ${word[0]} ${extra || ""}`.replace(/\s+/g, " ").trim())]);
    const order = [...new Set([...b.slice(0, 3), ...a, ...b.slice(3)])].slice(0, 20);
    const ents = order.length ? await wdEntities(order) : {};
    let e = pickEntity(ents, order, title, year, kind, plat, strict);
    if (!e && year && !strict) e = pickEntity(ents, order, title, 0, kind, plat);   // année du fichier fausse
    if (!e) { // dernier essai : en anglais (titre original : « The Lord of the Rings… »)
      const [c, d] = await Promise.all([wdSearch(q, "en"), wpFind(B.wikiEn, `${q} ${year || ""} ${word[1]}`.trim())]);
      const en = [...new Set([...d.slice(0, 3), ...c, ...d.slice(3)])].slice(0, 20);
      const more = en.filter((x) => !ents[x]); if (more.length) Object.assign(ents, await wdEntities(more));
      e = pickEntity(ents, en, title, year, kind, plat, strict) || (year && !strict ? pickEntity(ents, en, title, 0, kind, plat) : null);
    }
    return e;
  }
  // un album de Wikidata est-il bien de cet artiste ? (P175 interprète, sinon la description « album de Daft Punk »)
  function wdArtistOk(e, artist) { const a = core(artist); return core(desc(e)).includes(a) || false; }
  // les bandes-annonces YouTube d'une fiche Wikidata (P1651) : langue (P407), rôle (P3831), durée (P2047), titre (P1476/P1810).
  // Vu sur le vrai Wikidata : la plupart des vidéos d'un film y sont le FILM ENTIER (YouTube Films, payant : 1 h 30 à 2 h 30,
  // sans rôle) — c'est ce qu'on proposait avant comme « bande-annonce » ; d'autres sont des clips (chanson du même nom).
  // rank : 1 « bande-annonce » (Q622550), 2 « teaser » (Q110996780), 3 courte, sans rôle connu, nommée comme une bande-annonce
  // (pour un jeu, un livre : seulement celles marquées « bande-annonce »)
  const Q_TEASER = "Q110996780", TR_WORDS = /trailer|teaser|bande[- ]?annonce|tr[aá]iler|vorschau/i;
  function wdTrailers(e, kind) {
    const out = [];
    for (const s of snaks(e, "P1651")) {
      const id = String(s.mainsnak.datavalue.value || ""); if (!/^[\w-]{11}$/.test(id)) continue;
      const q = s.qualifiers || {}, qv = (P) => (q[P] || []).map((x) => x && x.datavalue && x.datavalue.value).filter((v) => v != null);
      const roles = qv("P3831").map((v) => v.id).filter(Boolean), tr = roles.includes(Q_TRAILER), teaser = roles.includes(Q_TEASER);
      const d = qv("P2047")[0], n = d && d.amount ? Math.abs(Number(d.amount)) : 0;
      const sec = !n ? 0 : /Q7727$/.test(d.unit || "") ? n * 60 : /Q25235$/.test(d.unit || "") ? n * 3600 : n;   // secondes (Q11574), minutes, heures
      const titre = qv("P1476").map((v) => v.text).concat(qv("P1810")).find((x) => typeof x === "string") || "";
      let rank = 3;
      if (tr) rank = 1;
      else if (!(kind === "film" || kind === "serie")) continue;
      else if (teaser) rank = 2;
      else if (sec > 600) continue;                                    // plus de 10 min : le film entier
      else if (titre && !TR_WORDS.test(titre)) continue;              // un clip, une chanson du même nom…
      else if (roles.length && !(sec && sec <= 300 && titre)) continue;   // un autre rôle (extrait…) : seulement court et nommé « bande-annonce »
      const lang = qv("P407").map((v) => Q_LANG[v.id]).find(Boolean) || "";
      out.push({ site: "youtube", id, lang, titre, source: "Wikidata", rank });
    }
    return out;
  }
  // tout ce qu'une fiche Wikidata (et ses articles Wikipédia) apprend sur un film, une série, un jeu, un livre
  async function wdFiche(e, kind) {
    const rec = { wd: e.id, year: wdYear(e), posters: [], backs: [] };
    const frT = ((e.sitelinks || {}).frwiki || {}).title, enT = ((e.sitelinks || {}).enwiki || {}).title;
    // une demande par article (API « action ») : le début, l'image principale, et tout le texte du français (section « Synopsis »)
    const [fr, en] = await Promise.all([article(B.wikiFr, frT, kind !== "album"), article(B.wikiEn, enT, false)]);
    const ok = (a) => a && !a.missing && !a.disambig && a.intro;
    if (frT && !fr) rec.partial = true;   // l'article français existe mais n'a pas répondu (site encombré) : on réessaiera
    if (ok(fr)) { rec.syn = fr.intro; rec.src = "Wikipédia"; const sy = kind !== "album" ? synopsisOf(fr.text) : ""; if (sy && sy.length > rec.syn.length) rec.syn = sy; }
    else if (ok(en)) { rec.syn = en.intro; rec.src = "Wikipedia (en)"; rec.synLang = "en"; }
    const img = (a) => a && !a.missing && !a.disambig && a.image ? a.image : null;
    const video = kind === "film" || kind === "serie";
    // l'affiche : celle de Wikidata (Commons), sinon celle de l'article anglais (souvent l'affiche du film), sinon du français.
    // Film, série (images vues sur le vrai Wikipédia) : un logo n'est ni une affiche ni une grande image ; une image en hauteur
    // est une affiche (pour une série, seulement si elle n'est pas libre : une image libre y est une photo — studio, acteurs) ;
    // en largeur : affiche « à l'italienne » non libre (jusqu'à 1,5 fois plus large que haute) → affiche faute de mieux,
    // sinon (carton-titre, photo, bandeau) → seulement la grande image de la fiche (coupée en vignette, elle ne ressemble à rien).
    const p = vals(e, "P3383")[0], p18 = vals(e, "P18")[0];
    if (p) commonsUrls(p, 500).forEach((u) => rec.posters.push([u, "Wikimedia Commons"]));
    for (const [im, src] of kind === "book" ? [[img(fr), "Wikipédia"], [img(en), "Wikipédia (en)"]] : [[img(en), "Wikipédia (en)"], [img(fr), "Wikipédia"]]) {
      if (!im) continue;
      let name = im.url.split("?")[0]; try { name = decodeURIComponent(name); } catch (_) {}
      // un logo : son nom, un SVG, ou une image libre en PNG (les « BDL.png », « Fargo_(série_télévisée).png » de Wikipédia en français)
      const ratio = im.w && im.h ? im.w / im.h : 0, logo = /logo|\.svg(\.png)?$/i.test(name) || (im.free && /\.(png|gif)$/i.test(name));
      // la vignette d'abord, l'original en secours (pas un original de plus de 2600 px pour une grande image : plusieurs Mo)
      if (!video || (!logo && ratio <= 1 && !(kind === "serie" && im.free))) { rec.posters.push([im.url, src]); if (im.alt) rec.posters.push([im.alt, src]); }
      else if (logo || ratio <= 1) continue;
      else if (ratio <= 2 || !/\.(png|gif)(\?|$)/i.test(name)) { const tag = !im.free && ratio <= 1.5 ? "" : "fond"; rec.backs.push([im.big || im.url, src, tag]); if (im.alt && im.alt !== im.big && im.w <= 2600) rec.backs.push([im.alt, src, tag]); }
    }
    // P18 : une scène du film (grande image de fond ; pour une série, jamais son affiche : souvent une photo d'acteur, de tournage) ;
    // pour un jeu ou un livre, une image en dernier recours
    if (p18) commonsUrls(p18, video ? 1280 : 500).forEach((u) => (video ? rec.backs.push([u, "Wikimedia Commons", kind === "serie" ? "fond" : ""]) : rec.posters.push([u, "Wikimedia Commons"])));
    // les bandes-annonces : identifiants YouTube (P1651) ; langue originale (P364) et nom, pour chercher ailleurs
    rec.trailers = wdTrailers(e, kind);
    if (!video) { const g = rec.trailers.find((x) => x.rank === 1); if (g) rec.yt = g.id; rec.trailers = []; }   // jeu, livre : celle marquée « bande-annonce »
    rec.olang = Q_LANG[qids(e, "P364")[0]] || "";
    rec.label = (((e.labels || {}).fr || {}).value) || "";
    const dur = vals(e, "P2047")[0]; if (dur && dur.amount) { const n = Math.abs(Number(dur.amount)); rec.runtime = Math.round(/Q11574$/.test(dur.unit || "") ? n / 60 : /Q25235$/.test(dur.unit || "") ? n * 60 : n) || 0; }
    const tm = vals(e, kind === "serie" ? "P4983" : "P4947")[0]; if (tm && /^\d+$/.test(tm)) rec.tmdb = Number(tm);
    // les noms : genre, réalisation / création, acteurs, auteur, éditeur
    const want = { genre: qids(e, "P136").slice(0, 3), director: qids(e, "P57").slice(0, 2), creator: qids(e, "P170").concat(qids(e, "P86")).slice(0, 2), cast: qids(e, "P161").slice(0, 8),
      author: qids(e, "P50").slice(0, 2), publisher: qids(e, "P123").slice(0, 2), developer: qids(e, "P178").slice(0, 2) };
    const all = Object.values(want).flat();
    if (all.length) {
      const L = await wdEntities(all, "labels"), nm = (ids) => ids.map((id) => label(L[id])).filter(Boolean);
      const g = nm(want.genre).map(cleanGenre).filter(Boolean);
      if (g.length) rec.genre = [...new Set(g)].slice(0, 3).join(", ");
      const dname = nm(want.director).concat(kind === "serie" ? nm(want.creator) : []); if (dname.length) rec.director = dname.slice(0, 2).join(", ");
      const cast = nm(want.cast); if (cast.length) rec.cast = cast;
      const au = nm(want.author); if (au.length) rec.author = au.join(", ");
      const pu = nm(want.publisher).concat(nm(want.developer)); if (pu.length) rec.publisher = [...new Set(pu)].slice(0, 2).join(", ");
    }
    return rec;
  }

  // ---------- TMDB (si une clé est réglée) ----------
  // les vidéos d'un titre sur TMDB → bandes-annonces (YouTube, Vimeo), avec leur langue
  function tmdbVideos(list) {
    return (list || []).filter((v) => (v.site === "YouTube" && /^[\w-]{11}$/.test(v.key || "")) || (v.site === "Vimeo" && /^\d{5,12}$/.test(String(v.key || ""))))
      .filter((v) => v.type === "Trailer" || v.type === "Teaser")
      .map((v) => ({ site: v.site === "Vimeo" ? "vimeo" : "youtube", id: String(v.key), lang: v.iso_639_1 === "fr" || v.iso_639_1 === "en" ? v.iso_639_1 : "", titre: String(v.name || ""), source: "TMDB",
        rank: v.type === "Trailer" ? (v.official === false ? 1 : 0) : 2 }));
  }
  async function tmdb(key, title, year, kind, strict) {
    const t = kind === "serie" ? "tv" : "movie";
    const s = await get(`${B.tmdb}/3/search/${t}?api_key=${enc(key)}&language=fr-FR&query=${enc(title)}${year ? `&${t === "movie" ? "year" : "first_air_date_year"}=${year}` : ""}`);
    // le résultat dont le titre est celui cherché (homonymes), sinon le premier s'il lui ressemble
    const res = (s && s.results) || [], want = core(title), wantW = want.split(" ").filter(Boolean);
    const names = (z) => [z.title, z.original_title, z.name, z.original_name].filter(Boolean).map(core);
    const like = (z) => names(z).some((n) => { const w = new Set(n.split(" ")); return wantW.filter((x) => w.has(x)).length / Math.max(1, wantW.length) >= 0.6; });
    const r = res.find((z) => names(z).includes(want)) || (!strict && res[0] && like(res[0]) ? res[0] : null); if (!r) return null;
    const d = await get(`${B.tmdb}/3/${t}/${r.id}?api_key=${enc(key)}&language=fr-FR&include_video_language=fr,en,null&append_to_response=credits,videos,${t === "movie" ? "release_dates" : "content_ratings"}`);
    const x = d || r;
    // âge conseillé : la classification française d'abord, sinon celle des États-Unis
    const certOf = (cc) => { if (!d) return ""; if (t === "movie") { const c = ((d.release_dates || {}).results || []).find((z) => z.iso_3166_1 === cc); return c ? ((c.release_dates || []).map((z) => z.certification).find(Boolean) || "") : ""; }
      const c = ((d.content_ratings || {}).results || []).find((z) => z.iso_3166_1 === cc); return c ? c.rating || "" : ""; };
    const fr = certOf("FR"), cert = fr ? (/^\d+$/.test(fr) ? "-" + fr : fr) : certOf("US");
    // les bandes-annonces (françaises, anglaises et sans langue : include_video_language) ; triées avec les autres plus loin
    const trailers = tmdbVideos(d && d.videos && d.videos.results);
    return { syn: x.overview || "", src: x.overview ? "TMDB" : "", posters: x.poster_path ? [[`${B.tmdbImg}/t/p/w500${x.poster_path}`, "TMDB"]] : [], backs: x.backdrop_path ? [[`${B.tmdbImg}/t/p/w1280${x.backdrop_path}`, "TMDB"]] : [],
      year: Number(String(x.release_date || x.first_air_date || "").slice(0, 4)) || 0,
      genre: (x.genres || []).map((g) => g.name).slice(0, 3).join(", "), cast: d && d.credits ? d.credits.cast.slice(0, 8).map((c) => c.name) : [],
      director: d && d.credits ? (d.credits.crew.find((c) => c.job === "Director") || {}).name || ((x.created_by || [])[0] || {}).name || "" : "", tmdb: r.id, cert, trailers,
      label: x.title || x.name || "", olang: x.original_language === "fr" || x.original_language === "en" ? x.original_language : "",
      runtime: Number(x.runtime) || Number((x.episode_run_time || [])[0]) || 0 };
  }

  // ---------- Dailymotion (API publique officielle) : d'autres bandes-annonces, en français d'abord ----------
  // Recherche « <titre> <année> bande annonce vf » ; gardé seulement ce qui ressemble vraiment à la bande-annonce de CE titre :
  // tous les mots du titre, « bande-annonce / trailer / teaser », 30 s à 5 min, pas une autre année, pas une suite, pas une critique.
  const DM_TR = /\b(bande annonce|bandes annonces|bandeannonce|trailer|teaser)\b/;
  const DM_BAD = /\b(fan ?made|fanmade|fan film|parodie|parody|reaction|review|critique|analyse|explained|explication|making of|featurette|extrait|clip|interview|behind|honest|pitch meeting|concept|soundtrack|ost|musique|music|unboxing|gameplay|resume|recap|bloopers?|betisier|reportage|bonus|scene|spot|jeu video|video game|lego|minecraft|roblox|fortnite)\b/;
  const DM_SKIP = new Set(["bande", "annonce", "bandes", "annonces", "bandeannonce", "trailer", "teaser", "officielle", "officiel", "official", "vf", "vff", "vfq", "vost", "vostfr", "vo", "fr", "francais", "french", "hd", "fhd", "4k", "1080p", "720p",
    "final", "finale", "nouvelle", "new", "international", "film", "movie", "serie", "series", "le", "la", "les", "l", "un", "une", "de", "du", "des", "d", "en", "et", "the", "of", "a", "an", "version", "sub", "subs", "sous", "titre", "titres", "cinema", "au", "sortie", "with", "avec", "par", "by"]);
  // null : pas de réponse (site encombré, injoignable) → refait plus tard ; injoignable 3 fois de suite → laissé de côté 30 min
  let dmFails = 0, dmOff = 0;
  async function dmTrailers(title, year, olang, kind) {
    const t = String(title || "").replace(/\s*\([^)]*\)\s*$/, "").trim(); if (!t || !core(t)) return [];
    if (Date.now() < dmOff) return null;
    const lim0 = stats.limited, f0 = stats.fail, e0 = stats.err;
    const s = await get(`${B.dm}/videos?search=${enc(`${t} ${year || ""} bande annonce vf`.replace(/\s+/g, " ").trim())}&fields=id,title,duration,language&limit=20`);
    if (!s && (stats.limited > lim0 || stats.fail > f0 || stats.err > e0)) { if (++dmFails >= 3) { dmFails = 0; dmOff = Date.now() + 30 * 60000; } return null; }
    dmFails = 0;
    const want = core(t).split(" ").filter(Boolean), wantSet = new Set(want), out = [];
    for (const v of ((s && s.list) || [])) {
      const id = String(v.id || ""), dur = Number(v.duration) || 0, n = norm(String(v.title || ""));
      if (!/^x[0-9a-z]{4,12}$/i.test(id) || dur < 30 || dur > 300) continue;
      const words = n.split(" "), other = words.filter((w) => !wantSet.has(w)).join(" ");   // le titre de la vidéo sans les mots du titre cherché
      if (!want.every((w) => words.includes(w)) || !DM_TR.test(other) || DM_BAD.test(other)) continue;
      // titre d'un seul mot (« Up ») : suivi seulement de « bande-annonce », d'une année… (pas « Up in the Air »)
      if (want.length === 1) { const nx = words[words.indexOf(want[0]) + 1]; if (nx && !DM_SKIP.has(nx) && !/^(19|20)\d\d$/.test(nx)) continue; }
      const years = words.filter((w) => /^(19|20)\d\d$/.test(w) && !wantSet.has(w)).map(Number);
      if (year && years.length && !years.some((y) => Math.abs(y - year) <= 1)) continue;   // « Dune 1984 » pour Dune (2021)
      // ce qui reste du titre de la vidéo : un numéro ou « partie / chapitre » → une suite (sauf saison d'une série)
      const rest = words.filter((w) => !wantSet.has(w) && !DM_SKIP.has(w) && !years.includes(Number(w)));
      if (rest.some((w) => /^(\d{1,2}|ii|iii|iv|vi|part|partie|chapitre|chapter|returns|retour)$/.test(w) && !(kind === "serie" && /^\d{1,2}$/.test(w) && /\b(saison|season) \d/.test(n)))) continue;
      const vf = /\b(vf|vff|vfq|version francaise|en francais)\b/.test(n), vost = /\b(vost|vostfr|vo|sous titres?)\b/.test(n);
      const lang = olang === "fr" || vf ? "fr" : vost ? olang || "" : v.language === "fr" || v.language === "en" ? v.language : olang || "";
      out.push({ site: "dailymotion", id, lang, titre: String(v.title || "").slice(0, 140), source: "Dailymotion", rank: vf || vost ? 2 : 3 });
      if (out.length >= 3) break;
    }
    return out;
  }
  // toutes les candidates rangées : françaises, puis anglaises, puis les autres ; dans une langue, les « vraies » d'abord
  function sortTrailers(list) {
    const LR = { fr: 0, en: 1 }, SR = { TMDB: 0, Wikidata: 1, Dailymotion: 2 }, seen = new Set(), out = [];
    for (const x of (list || []).slice().sort((a, b) => (LR[a.lang] ?? 2) - (LR[b.lang] ?? 2) || (a.rank ?? 3) - (b.rank ?? 3) || (SR[a.source] ?? 3) - (SR[b.source] ?? 3))) {
      const k = x.site + ":" + x.id; if (seen.has(k)) continue; seen.add(k);
      out.push({ site: x.site, id: x.id, lang: x.lang || "", titre: String(x.titre || "").slice(0, 140), source: x.source || "", rank: x.rank ?? 3 });
      if (out.length >= 8) break;
    }
    return out;
  }

  // ---------- RetroArch : jaquette, écran titre, capture ----------
  async function listing(sys, kind) {
    const k = sys + "|" + kind; if (listings.has(k)) return listings.get(k);
    const cf = path.join(dir, `libretro-${crypto.createHash("sha1").update(k).digest("hex").slice(0, 10)}.json`);
    try { const st = fs.statSync(cf); if (Date.now() - st.mtimeMs < 7 * 86400000) { const l = JSON.parse(fs.readFileSync(cf, "utf8")); if (Array.isArray(l) && l.length) { listings.set(k, l); return l; } } } catch (_) {}
    const html = await get(`${B.libretro}/${enc(sys)}/${kind}/`, { json: false, ms: 45000, max: 30e6 });
    const l = html ? [...new Set([...html.toString("utf8").matchAll(/href="([^"?/]+\.png)"/g)].map((m) => { try { return decodeURIComponent(m[1]); } catch (_) { return ""; } }).filter(Boolean))] : [];
    listings.set(k, l); if (l.length) { try { fs.writeFileSync(cf, JSON.stringify(l)); } catch (_) {} }
    return l;
  }
  const lrClean = (n) => n.replace(/[&*/:`<>?\\|"]/g, "_");
  async function libretro(it) {
    const sys = LIBRETRO[it.sys]; if (!sys) return null;
    const stem = path.basename(it.file || it.title).replace(/\.[^.]+$/, "");
    const url = (kind, n) => `${B.libretro}/${enc(sys)}/${kind}/${enc(lrClean(n))}.png`;
    let name = stem, box = await download(url("Named_Boxarts", stem));
    if (!box) {
      const want = core(it.title), region = (/\((Japan|USA|Europe|World|France|Germany|Spain|Italy)/i.exec(stem) || [])[1];
      const list = await listing(sys, "Named_Boxarts");
      const cands = list.filter((n) => core(n.replace(/\.png$/, "").replace(/\s*\(.*$/, "").replace(/,\s*(the|le|la|les)$/i, "")) === want || core(n.replace(/\.png$/, "").replace(/\s*\(.*$/, "")) === core(it.title));
      const score = (n) => (region && n.includes(region) ? 4 : 0) + (/\((Europe|France)/.test(n) ? 2 : 0) + (/\(USA/.test(n) ? 1 : 0) - (/\((Beta|Proto|Demo|Sample|Kiosk)/i.test(n) ? 5 : 0) - (/\(Rev /i.test(n) ? 0.5 : 0);
      const pick = cands.sort((a, b) => score(b) - score(a))[0];
      if (!pick) return null;
      name = pick.replace(/\.png$/, ""); box = await download(url("Named_Boxarts", name));
    }
    if (!box) return null;
    const [title, snap] = await Promise.all([download(url("Named_Titles", name)), download(url("Named_Snaps", name))]);
    return { box, title, snap, name };
  }

  // ---------- MusicBrainz + Cover Art Archive ----------
  async function music(it) {
    const q = `releasegroup:"${it.title.replace(/"/g, "")}"${it.artist ? ` AND artist:"${it.artist.replace(/"/g, "")}"` : ""}`;
    const s = await get(`${B.mb}/ws/2/release-group/?query=${enc(q)}&fmt=json&limit=10`);
    const L = (s && s["release-groups"]) || [], na = core(it.artist || "");
    const art = (r) => core(((r["artist-credit"] || [])[0] || {}).name || "");
    const sc = (r) => (r.score || 0) + (core(r.title) === core(it.title) ? 30 : 0) + (na && art(r) === na ? 20 : 0) + (r["primary-type"] === "Album" ? 10 : 0) - ((r["secondary-types"] || []).length ? 15 : 0);
    const rg = L.filter((r) => (r.score || 0) >= 70 && core(r.title) === core(it.title) && (!na || art(r) === na || (r.score || 0) >= 95)).sort((a, b) => sc(b) - sc(a))[0]
      || (L[0] && L[0].score >= 98 ? L[0] : null);
    if (!rg) return null;
    const rec = { mbid: rg.id, year: Number(String(rg["first-release-date"] || "").slice(0, 4)) || 0, artist: rg["artist-credit"] && rg["artist-credit"][0] ? rg["artist-credit"][0].name : "",
      genre: (rg.tags || []).slice().sort((a, b) => b.count - a.count).slice(0, 2).map((t) => t.name).join(", "), posters: [[`${B.caa}/release-group/${rg.id}/front-500`, "Cover Art Archive"]], src: "MusicBrainz" };
    // la liste des pistes : une édition officielle de l'album
    const rl = await get(`${B.mb}/ws/2/release?release-group=${enc(rg.id)}&status=official&inc=recordings&fmt=json&limit=5`);
    const rels = ((rl && rl.releases) || []).filter((r) => (r.media || []).length);
    const rel = rels.find((r) => /^(FR|XE|XW)$/.test(r.country || "")) || rels[0];
    if (rel) rec.tracks = rel.media.flatMap((m) => m.tracks || []).slice(0, 60).map((t) => ({ title: String(t.title || "").slice(0, 200), len: Math.round((t.length || 0) / 1000) }));
    return rec;
  }

  // ---------- livres : Wikipédia / Wikidata, Google Books, Open Library ----------
  async function book(it) {
    const title = it.title, author = it.author || "", rec = { posters: [], backs: [] };
    const wantOk = (t) => { const a = core(t), b = core(title); return a === b || a.startsWith(b + " ") || b.startsWith(a + " "); };
    const auOk = (list) => !author || (list || []).some((n) => { const x = norm(n), y = norm(author); return x === y || x.split(" ").pop() === y.split(" ").pop(); });
    // Open Library : la couverture, l'auteur, l'année de première publication
    const ol = await get(`${B.ol}/search.json?title=${enc(title)}${author ? `&author=${enc(author)}` : ""}&limit=8&fields=key,title,author_name,first_publish_year,cover_i,edition_count,subject`);
    const od = ((ol && ol.docs) || []).filter((d) => wantOk(d.title) && auOk(d.author_name)).sort((a, b) => (b.cover_i ? 1 : 0) - (a.cover_i ? 1 : 0) || (b.edition_count || 0) - (a.edition_count || 0))[0];
    if (od) {
      rec.src = "Open Library"; if (od.first_publish_year) rec.year = od.first_publish_year; if ((od.author_name || [])[0]) rec.author = od.author_name[0];
      if (od.cover_i) rec.posters.push([`${B.olCovers}/b/id/${od.cover_i}-L.jpg`, "Open Library"]);
      rec.olKey = od.key;
    }
    // Wikipédia en français (résumé), via Wikidata
    const e = await wdFind(title, 0, "book", author);
    if (e) {
      const w = await wdFiche(e, "book");
      if (w.syn && !w.synLang) { rec.syn = w.syn; rec.src = "Wikipédia"; }
      if (w.year) rec.year = w.year; if (w.author) rec.author = w.author; if (w.genre) rec.genre = w.genre;
      rec.posters.push(...w.posters); rec.wd = w.wd;
      if (!rec.syn && w.syn) rec.synEn = w.syn;
    }
    // Google Books : résumé en français, couverture de secours
    if (!rec.syn || !rec.posters.length) {
      const g = await get(`${B.gbooks}/books/v1/volumes?q=${enc(`intitle:${title}${author ? ` inauthor:${author}` : ""}`)}&maxResults=8&printType=books&langRestrict=fr`);
      const v = ((g && g.items) || []).map((x) => x.volumeInfo || {}).filter((x) => wantOk(x.title || "") && auOk(x.authors)).sort((a, b) => (b.description ? 1 : 0) - (a.description ? 1 : 0))[0];
      if (v) {
        if (!rec.syn && v.description) { rec.syn = String(v.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); rec.src = rec.src || "Google Books"; }
        if (!rec.author && (v.authors || [])[0]) rec.author = v.authors[0];
        if (!rec.year) rec.year = Number(String(v.publishedDate || "").slice(0, 4)) || 0;
        if (!rec.genre && (v.categories || [])[0]) rec.genre = v.categories[0];
        const th = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
        if (th) rec.posters.push([String(th).replace(/^http:/, "https:").replace(/&edge=curl/, ""), "Google Books"]);
      }
    }
    // Open Library : la description de l'œuvre (souvent en anglais) en dernier recours
    if (!rec.syn && rec.olKey && /^\/works\/OL\d+W$/.test(rec.olKey)) {
      const w = await get(`${B.ol}${rec.olKey}.json`); const d = w && (typeof w.description === "string" ? w.description : w.description && w.description.value);
      if (d) rec.syn = String(d).replace(/\r/g, "").split(/\n-{3,}|\n\(\[source/)[0].trim().slice(0, 3000);
    }
    if (!rec.syn && rec.synEn) rec.syn = rec.synEn;
    delete rec.synEn; delete rec.olKey;
    return rec.syn || rec.posters.length || rec.year ? rec : null;
  }

  // ---------- une fiche ----------
  // ctx.runs : films dont le numéro en tête est le numéro d'ordre d'une suite (voir numberedRuns)
  async function one(it, tmdbKey, ctx) {
    const t0 = Date.now(), lim0 = stats.limited, f0 = stats.fail, e0 = stats.err, old = db[it.id];
    // un échec passager pendant la recherche (site encombré — 429/503 ou mis de côté —, coupure, erreur du site)
    let passing = false; const searched = () => { passing = passing || stats.limited > lim0 || stats.fail > f0 || stats.err > e0; };
    const p = it.pub || {}, year = Number(p.year) || 0, title = it.title, rec = { t: Date.now(), v: 2, sv: SV };
    const video = it.kind === "film" || it.kind === "serie";
    let posters = [], backs = [], trailers = [];
    const take = (r) => { if (!r) return; for (const k of ["syn", "src", "synLang", "year", "genre", "director", "cast", "runtime", "artist", "author", "publisher", "tmdb", "cert", "yt", "wd", "mbid", "tracks", "partial", "label", "olang"]) {
      const v = r[k]; if (v == null || v === "" || (Array.isArray(v) && !v.length) || v === 0) continue; if (rec[k] == null || rec[k] === "" || (k === "syn" && rec.synLang && !r.synLang)) { rec[k] = v; if (k === "syn") { rec.synLang = r.synLang; if (r.src) rec.src = r.src; } } }
      posters.push(...(r.posters || [])); backs.push(...(r.backs || [])); trailers.push(...(r.trailers || [])); };
    if (video) {
      // « 02 Presto » est cherché « Presto » ; « 12 hommes en colère » tel quel (voir searchOf)
      const tries = searchOf(it, ctx && ctx.runs);
      if (tmdbKey) for (const s of tries) { const tm = await tmdb(tmdbKey, s.q, year, it.kind, s.strict); if (tm) { take(tm); break; } }
      if (!rec.syn || !posters.length || !trailers.length || !backs.length) for (const s of tries) { const e = await wdFind(s.q, year, it.kind, "", null, s.strict); if (e) { take(await wdFiche(e, it.kind)); break; } }
      searched();
      // d'autres bandes-annonces (Dailymotion), seulement pour un titre reconnu : son vrai nom, sa vraie année
      // (pas de réponse : refait plus tard, seul — dm: 0)
      if (rec.wd || rec.tmdb) { const dm = await dmTrailers(rec.label || tries[0].q, Number(rec.year) || year, rec.olang || "", it.kind); if (dm) trailers.push(...dm); else { rec.dm = 0; rec.dmT = Date.now(); } }
      rec.trailers = sortTrailers(trailers); rec.tv = TV;
      const y = rec.trailers.find((x) => x.site === "youtube"); if (y) rec.yt = y.id; else delete rec.yt;   // pub.yt : la 1re YouTube (compatibilité)
    } else if (it.kind === "game") {
      const lr = await libretro(it);
      if (lr) { rec.coverFile = writeImage(it.id, lr.box); if (lr.snap) rec.backFile = writeImage(it.id + "-fond", lr.snap); if (lr.title) rec.titleFile = writeImage(it.id + "-titre", lr.title); if (!rec.backFile && rec.titleFile) rec.backFile = rec.titleFile; rec.lrName = lr.name; }
      const e = await wdFind(title, 0, "game", "", WD_PLAT[it.sys]); if (e) take(await wdFiche(e, "game"));
    } else if (it.kind === "album") {
      const artist = it.artist || p.artist || "";
      take(await music({ ...it, artist }));
      // Wikipédia en plus : un résumé, et la pochette quand Cover Art Archive n'en a pas
      const e = await wdFind(title, 0, "album", artist);
      if (e && (!artist || wdArtistOk(e, artist))) { const w = await wdFiche(e, "album"); delete w.cast; delete w.director; if (rec.year) delete w.year; take(w); }
    } else if (it.kind === "book") {
      take(await book({ ...it, author: it.author || p.author || "" }));
    }
    rec.syn && (rec.syn = String(rec.syn).slice(0, 4000));
    if (!video) searched();
    const li = stats.limited, fi = stats.fail, ei = stats.err;
    const used = new Set(), tried = { p: [], b: [] }; let wide = "";
    // affiche faute de mieux : une affiche « à l'italienne » (en largeur, non libre) ou la scène d'un film (P18) ; jamais un
    // carton-titre, une photo libre ou la photo P18 d'une série (marqués « fond » : seulement la grande image de la fiche)
    if (!rec.coverFile && !it.coverFile) for (const [u, src] of posters.concat(video ? backs.filter((x) => !x[2]) : [])) { if (used.has(u)) continue; used.add(u); tried.p.push([u, src]); const f = await saveImage(it.id, u); if (f) { rec.coverFile = f; rec.coverSrc = src; if (!posters.some((x) => x[0] === u)) wide = f; break; } }
    if (!rec.backFile) for (const [u, src] of backs) { if (used.has(u)) continue; used.add(u); tried.b.push([u, src]); const f = await saveImage(it.id + "-fond", u); if (f) { rec.backFile = f; rec.backSrc = src; break; } }
    // seule image, en largeur (affiche « à l'italienne ») → affiche faute de mieux ET grande image de la fiche (sans la retélécharger)
    if (!rec.backFile && wide) { try { const f = writeImage(it.id + "-fond", fs.readFileSync(wide)); if (f) { rec.backFile = f; rec.backSrc = rec.coverSrc; } } catch (_) {} }
    if (rec.coverFile && !rec.coverSrc) rec.coverSrc = it.kind === "game" ? "RetroArch" : "";
    rec.ok = !!(rec.syn || rec.coverFile || rec.year || rec.tracks);
    rec.ms = Date.now() - t0;
    // pas trouvé à cause d'un échec passager : on réessaiera bientôt (15 min, puis de plus en plus espacé), pas dans des jours
    if (!rec.ok && passing) rec.retry = true;
    // trouvé, mais l'affiche (ou la grande image) n'a pas pu être téléchargée (site d'images encombré, coupure) :
    // on réessaiera ces adresses-là, sans tout rechercher
    const imgPassing = stats.limited > li || stats.fail > fi || stats.err > ei;
    const noCover = !rec.coverFile && !it.coverFile && tried.p.length, noBack = !rec.backFile && tried.b.length;
    if (rec.ok && imgPassing && (noCover || noBack)) { rec.imgs = { p: noCover ? tried.p.slice(0, 4) : [], b: noBack ? tried.b.slice(0, 3) : [] }; rec.imgRetry = true; }
    if (rec.partial && rec.syn && !rec.synLang) delete rec.partial;
    // essais ratés de suite : les suivants sont de plus en plus espacés
    if (!rec.ok || rec.retry || rec.imgRetry || rec.partial) rec.n = old && old.sv === SV && (!old.ok || old.retry || old.imgRetry || old.partial) ? (old.n || 1) + 1 : 1;
    // une fiche déjà trouvée n'est jamais perdue par un nouvel essai qui ne trouve rien (site encombré, coupure…) ;
    // échec passager : nouvel essai plus tard (15 min, puis de plus en plus espacé)
    if (old && old.ok && !rec.ok) {
      old.t = Date.now(); old.sv = SV;
      if (rec.retry) { old.n = old.partial ? (old.n || 1) + 1 : 1; old.partial = true; } else { delete old.partial; delete old.n; }
      db[it.id] = old; save(); return old;
    }
    db[it.id] = rec; save();
    return rec;
  }
  // fiche trouvée dont l'affiche n'a pas pu être téléchargée (site encombré) : seulement ces images, pas toute la recherche
  async function retryImages(it) {
    const r = db[it.id], I = r.imgs || {}, lim0 = stats.limited, f0 = stats.fail, e0 = stats.err; let got = false;
    if (!r.coverFile && !it.coverFile) for (const [u, src] of I.p || []) { const f = await saveImage(it.id, u); if (f) { r.coverFile = f; r.coverSrc = src; got = true; break; } }
    if (!r.backFile) for (const [u, src] of I.b || []) { const f = await saveImage(it.id + "-fond", u); if (f) { r.backFile = f; r.backSrc = src; got = true; break; } }
    const missing = (!r.coverFile && !it.coverFile && (I.p || []).length) || (!r.backFile && (I.b || []).length);
    if (!missing || !(stats.limited > lim0 || stats.fail > f0 || stats.err > e0)) { delete r.imgs; delete r.imgRetry; delete r.n; } else r.n = (r.n || 1) + 1;
    r.t = Date.now(); save();
    return got;
  }
  // les bandes-annonces d'une fiche gardée d'avant la liste : Wikidata (les vidéos seulement), TMDB (si clé), Dailymotion ;
  // rien d'autre n'est redemandé ni retéléchargé
  async function trailersFor(it, tmdbKey) {
    const r = db[it.id]; if (!r || !r.ok) return false;
    const dmArgs = [r.label || it.title, Number(r.year) || Number(it.pub && it.pub.year) || 0, r.olang || "", it.kind];
    // liste déjà faite, seul Dailymotion n'avait pas répondu : lui seul
    if (r.tv === TV) {
      const dm = await dmTrailers(...dmArgs); r.dmT = Date.now(); if (!dm) return false;
      r.trailers = sortTrailers((r.trailers || []).concat(dm)); delete r.dm; delete r.dmT; return true;
    }
    const lim0 = stats.limited, f0 = stats.fail, e0 = stats.err, list = [];
    if (r.wd) { const c = await get(`${B.wikidata}/w/api.php?action=wbgetclaims&entity=${enc(r.wd)}&property=P1651&format=json`); if (c) list.push(...wdTrailers({ claims: c.claims || {} }, it.kind)); }
    if (tmdbKey && r.tmdb) { const v = await get(`${B.tmdb}/3/${it.kind === "serie" ? "tv" : "movie"}/${enc(r.tmdb)}/videos?api_key=${enc(tmdbKey)}&language=fr-FR&include_video_language=fr,en,null`); if (v) list.push(...tmdbVideos(v.results)); }
    else if (!r.wd && r.yt) list.push({ site: "youtube", id: r.yt, lang: "", titre: "", source: "TMDB", rank: 1 });   // trouvée avec une clé TMDB retirée depuis
    if (stats.limited > lim0 || stats.fail > f0 || stats.err > e0) return false;   // Wikidata ou TMDB sans réponse : refait plus tard
    const dm = await dmTrailers(...dmArgs);
    if (dm) { list.push(...dm); delete r.dm; delete r.dmT; } else { r.dm = 0; r.dmT = Date.now(); }
    r.trailers = sortTrailers(list); r.tv = TV;
    const y = r.trailers.find((x) => x.site === "youtube"); if (y) r.yt = y.id; else delete r.yt;
    return true;
  }

  // applique les fiches connues aux éléments de la bibliothèque (sans écraser ce qui vient des fichiers)
  function apply(items, coverUrl, byId) {
    for (const it of items) {
      const r = db[it.id]; if (!r || !r.ok) continue;
      const p = it.pub;
      if (r.syn && !p.syn) p.syn = r.syn;
      if (r.year && !p.year) p.year = r.year;
      if (r.genre && !p.genre) p.genre = r.genre;
      if (r.cast && r.cast.length) p.cast = r.cast;
      if (r.director) p.director = r.director;
      if (r.runtime) p.runtime = r.runtime;   // durée en minutes (filtre « Durée » de la recherche)
      if (r.artist && !p.artist) p.artist = r.artist;
      if (r.author && !p.author) p.author = r.author;
      if (r.publisher && !p.publisher) p.publisher = r.publisher;
      if (r.tmdb) p.tmdb = r.tmdb;
      if (r.cert && !p.cert) p.cert = r.cert;
      // bandes-annonces sur internet, rangées (françaises d'abord) ; yt : la 1re YouTube (la bande-annonce posée à côté du film
      // passe devant, côté page)
      if (r.trailers && r.trailers.length) p.trailers = r.trailers.map((x) => ({ site: x.site, id: x.id, lang: x.lang || "", titre: x.titre || "", source: x.source || "" })); else if (r.tv) delete p.trailers;
      if (r.yt && /^[\w-]{11}$/.test(r.yt)) p.yt = r.yt; else if (r.tv) delete p.yt;
      if (r.src) p.src = r.src;
      if (r.tracks && r.tracks.length && it.kind === "album") p.tracksInfo = r.tracks;
      // une affiche choisie à la main (« Corriger la fiche ») passe devant celle posée à côté du fichier
      const cf = here(r.coverFile);
      if (cf && (r.chosen || !it.coverFile || it.coverFile === r.coverFile || it.coverFile === cf)) { it.coverFile = cf; p.cover = coverUrl(it.id) + (r.chosen ? "&v=" + r.chosen : ""); }
      // la grande image de la fiche (fond) et l'écran titre d'un jeu
      if (byId) for (const [k, f0, key] of [["-fond", r.backFile, "backdrop"], ["-titre", r.titleFile, "titleShot"]]) {
        const f = here(f0); if (!f) continue;
        byId.set(it.id + k, { id: it.id + k, kind: "seasonimg", coverFile: f }); p[key] = coverUrl(it.id + k);
      }
    }
  }

  const KINDS = ["film", "serie", "game", "album", "book"];
  // quand refaire un essai : échec passager 15 min, 30 min, 1 h… (12 h au plus) ; rien trouvé : 3 jours, 7 jours, puis 30 jours
  const MIN = 60000, JOUR = 86400000;
  const due = (r) => { const n = Math.max(1, Number(r.n) || 1); return Date.now() - (r.t || 0) > (r.retry || r.imgRetry || r.partial ? Math.min(15 * MIN * Math.pow(2, n - 1), 720 * MIN) : [3, 7, 30][Math.min(n, 3) - 1] * JOUR); };
  // à chercher : jamais cherché ; trouvé avec une ancienne version, ou incomplet (site encombré) ; pas trouvé avec une
  // recherche plus ancienne (numéros d'ordre, séries…), ou nouvel essai prévu
  // (un film ou une série trouvé autrefois SANS jaquette — image refusée un moment, mauvaise fiche — est recherché une fois
  //  avec la recherche d'aujourd'hui ; un nouvel essai raté ne perd jamais la fiche déjà trouvée, voir one())
  const needs = (it) => { const r = db[it.id]; if (!r || r.q) return true;
    if (r.ok) return r.v !== 2 || ((r.partial || r.imgRetry) && due(r)) || (r.sv !== SV && !r.coverFile && !r.chosen && (it.kind === "film" || it.kind === "serie"));
    return r.sv !== SV || due(r); };
  // ce que la recherche de fond fait maintenant (une jaquette ou un résumé manque, et c'est le moment)
  const wanted = (it) => KINDS.includes(it.kind) && (!it.coverFile || !(it.pub && it.pub.syn) || (db[it.id] && (db[it.id].v !== 2 || db[it.id].imgRetry))) && needs(it);
  // l'ordre de la file : ce qui se voit d'abord sur l'accueil
  function order(todo, items) {
    const mt = (it) => Number(it.pub && it.pub.mtime) || 0;
    // « Ajoutés récemment » : les 20 derniers ajouts (comme la rangée de l'accueil)
    const recent = new Set(items.filter((it) => it.kind !== "album" && mt(it) > 0).sort((a, b) => mt(b) - mt(a)).slice(0, 20).map((it) => it.id));
    // puis films et séries en alternance, chacun dans l'ordre de sa rangée (par titre) : les séries ne passent plus après 1 000 films
    const pos = new Map(), byT = (a, b) => String(a.title).localeCompare(String(b.title), "fr");
    for (const k of ["film", "serie"]) items.filter((x) => x.kind === k).sort(byT).forEach((x, i) => pos.set(x.id, 2 * i + (k === "serie" ? 1 : 0)));
    const LATER = { game: 0, book: 1, album: 2 };   // ensuite les jeux, les livres, la musique (MusicBrainz : une demande par seconde)
    const tier = (it) => {
      if (recent.has(it.id)) return 0;
      if (!pos.has(it.id)) return 10 + (LATER[it.kind] != null ? LATER[it.kind] : 3);
      const r = db[it.id], again = !!r && !r.q && (r.ok ? r.v === 2 : r.sv === SV);   // déjà cherché par la recherche d'aujourd'hui
      return (it.coverFile ? 3 : 1) + (again ? 1 : 0);   // sans jaquette d'abord, les nouveaux essais après les jamais cherchés
    };
    const T = new Map(todo.map((it) => [it.id, tier(it)]));
    return todo.slice().sort((a, b) => T.get(a.id) - T.get(b.id) || (T.get(a.id) === 0 ? mt(b) - mt(a) : (pos.get(a.id) || 0) - (pos.get(b.id) || 0)));
  }
  // cherche les fiches manquantes, une par une, en tâche de fond ; onStep : quelques fiches arrivées (la page se rafraîchit)
  async function enrich(items, tmdbKey, onDone, onStep) {
    if (busy) { again = [items, tmdbKey, onDone, onStep]; return; }
    busy = true; cut = false;
    try {
      const todo = items.filter(wanted);
      // fiches déjà gardées sans la liste des bandes-annonces (d'avant) : complétées après tout le reste
      const inTodo = new Set(todo.map((it) => it.id));
      // (et celles dont Dailymotion n'avait pas répondu : de nouveau 6 h plus tard)
      // (pas celles qui attendent une nouvelle recherche — « partial » : elle refera aussi leurs bandes-annonces)
      const tvTodo = items.filter((it) => { const r = db[it.id]; return (it.kind === "film" || it.kind === "serie") && !inTodo.has(it.id) && r && r.ok && !r.partial && (r.wd || r.tmdb)
        && (r.tv !== TV || (r.dm === 0 && Date.now() - (r.dmT || r.t || 0) > 6 * 3600000)); });
      if (!todo.length && !tvTodo.length) return;
      if (!(await online())) { log("info", "fiches : pas d'internet, on réessaiera plus tard"); return; }
      const runs = numberedRuns(items);
      let n = 0, nt = 0, step = 0, lastStep = Date.now(), pause = 0, dead = 0;
      const flush = () => { if (onStep && step && (step >= 4 || Date.now() - lastStep > 8000)) { try { onStep(step); } catch (_) {} step = 0; lastStep = Date.now(); } };
      for (const it of order(todo, items)) {
        const h0 = stats.hits, ok0 = stats.ok, f0 = stats.fail;
        try {
          const r = db[it.id];
          if (r && r.ok && r.v === 2 && r.imgRetry && !r.partial) { if (await retryImages(it)) { n++; step++; } }
          else if ((await one(it, tmdbKey, { runs })).ok) { n++; step++; }
        } catch (e) { log("error", "fiche " + it.title + " : " + e.message); }
        flush();
        // internet coupé en route (plus aucune réponse) : on s'arrête là, on reprendra plus tard (rien n'est marqué « introuvable »)
        if (stats.fail > f0 && stats.ok === ok0) { if (++dead >= 3 && !(await online())) { cut = true; log("info", "fiches : internet coupé, on reprendra plus tard"); break; } } else dead = 0;
        // un site a répondu plusieurs fois « trop de demandes » : pause de plus en plus longue (30 s, 1 min… 10 min au plus)
        if (!test && stats.hits - h0 >= 3) { pause = Math.min(Math.max(pause * 2, 30000), 600000); log("info", `fiches : sites encombrés, pause de ${Math.round(pause / 1000)} s`); await wait(pause); }
        else if (stats.hits === h0) pause = 0;
        await wait(o.delay != null ? o.delay : 150);
      }
      // les bandes-annonces des fiches déjà gardées (une nouvelle recherche demandée passe devant : on s'arrête) ; rien ne se
      // voit sur l'accueil : les écrans ne sont prévenus que toutes les 2 minutes (pas de rechargement de la page à chaque fiche)
      flush(); if (step && onStep) { try { onStep(step); } catch (_) {} step = 0; lastStep = Date.now(); }
      if (!cut) for (const it of tvTodo) {
        if (again) break;
        try { if (await trailersFor(it, tmdbKey)) { nt++; if (nt % 25 === 0) save(); } } catch (e) { log("error", "bandes-annonces " + it.title + " : " + e.message); }
        if (onStep && nt && Date.now() - lastStep > 120000) { try { onStep(0); } catch (_) {} lastStep = Date.now(); }
        await wait(o.delay != null ? o.delay : 150);
      }
      if (tvTodo.length) save();
      log("info", `fiches : ${n} trouvée(s) sur ${todo.length}${nt ? ` ; bandes-annonces de ${nt} fiche(s) déjà gardée(s)` : ""}${stats.limited ? ` (sites encombrés : ${stats.limited} attente(s))` : ""}`);
      if (onDone) onDone(n);
    } finally {
      busy = false;
      if (again) { const a = again; again = null; setTimeout(() => enrich(...a).catch(() => {}), 50); }
    }
  }
  // fiches en attente d'un nouvel essai proche (le serveur repasse dans un quart d'heure) ; internet coupé en route : aussi
  const pending = (items) => items.filter((it) => KINDS.includes(it.kind) && db[it.id] && ((!db[it.id].ok && db[it.id].retry) || db[it.id].partial || db[it.id].imgRetry)).length + (cut ? 1 : 0);
  // corriger une fiche à la main : chercher avec un autre titre
  async function research(it, query, tmdbKey) {
    const t = it.title; if (query) it.title = query;
    const old = db[it.id];
    try { delete db[it.id]; const r = await one(it, tmdbKey); if (old && old.chosen && !r.chosen) { r.coverFile = r.coverFile || old.coverFile; } return r; } finally { it.title = t; }
  }
  // fiche d'un fichier que la page a trouvé elle-même (dossier choisi sur l'appareil) : même recherche, même cache
  async function lookup(q, tmdbKey, coverUrl) {
    const kind = KINDS.includes(q.kind) ? q.kind : ""; if (!kind) return null;
    const title = String(q.title || "").slice(0, 200).trim(); if (!title) return null;
    const year = Number(q.year) || 0, artist = String(q.artist || "").slice(0, 120), author = String(q.author || "").slice(0, 120), sys = String(q.sys || "").slice(0, 12), fname = path.basename(String(q.file || "")).slice(0, 200);
    const id = "v" + crypto.createHash("sha1").update([kind, norm(title), year, norm(artist), norm(author), sys, kind === "game" ? fname : ""].join("|")).digest("hex").slice(0, 15);
    const it = { id, kind, title, artist, author, sys, file: fname || title, pub: { id, kind, title, year, artist, author } };
    if (needs(it)) await one(it, tmdbKey);
    else if ((kind === "film" || kind === "serie") && db[id] && db[id].ok && db[id].tv !== TV && (db[id].wd || db[id].tmdb)) { if (await trailersFor(it, tmdbKey)) save(); }
    const fake = new Map(); apply([it], coverUrl, fake);
    virt.set(id, { id, coverFile: it.coverFile || "" }); for (const [k, v] of fake) virt.set(k, v);
    if (virt.size > 4000) virt.delete(virt.keys().next().value);
    return db[id] && db[id].ok ? it.pub : { id, none: true };
  }
  const virtual = (id) => virt.get(id) || (() => {   // après un redémarrage : retrouvé dans le cache
    const m = /^(v[0-9a-f]{15})(-fond|-titre)?$/.exec(id); if (!m || !db[m[1]]) return null;
    const r = db[m[1]], f = here(!m[2] ? r.coverFile : m[2] === "-fond" ? r.backFile : r.titleFile); return f ? { id, coverFile: f } : null; })();

  // --- plusieurs affiches proposées (« Corriger la fiche ») : TMDB (si clé), Wikidata/Wikipédia, RetroArch, Cover Art Archive, Open Library ---
  const pend = new Map();   // id → dernières affiches proposées (on ne télécharge que celles-là)
  async function posters(it, query, tmdbKey) {
    const title = query || it.title, year = Number(it.pub.year) || 0, out = [];
    const add = (url, lbl) => { if (url && /^https?:/.test(url) && !/\.svg(\?|$)/i.test(url) && !out.some((x) => x.url === url) && out.length < 12) out.push({ url, label: lbl }); };
    if (tmdbKey && (it.kind === "film" || it.kind === "serie")) {
      const t = it.kind === "serie" ? "tv" : "movie";
      const s = await get(`${B.tmdb}/3/search/${t}?api_key=${enc(tmdbKey)}&language=fr-FR&query=${enc(title)}`);
      const res = (s && s.results) || [];
      if (res[0]) { const im = await get(`${B.tmdb}/3/${t}/${res[0].id}/images?api_key=${enc(tmdbKey)}&include_image_language=fr,en,null`);
        ((im && im.posters) || []).slice(0, 6).forEach((x) => add(`${B.tmdbImg}/t/p/w500${x.file_path}`, `TMDB · ${res[0].title || res[0].name || title}`)); }
      res.slice(0, 6).forEach((r) => r.poster_path && add(`${B.tmdbImg}/t/p/w500${r.poster_path}`, `TMDB · ${r.title || r.name || ""}${(r.release_date || r.first_air_date) ? " (" + String(r.release_date || r.first_air_date).slice(0, 4) + ")" : ""}`));
    }
    if (it.kind === "game" && LIBRETRO[it.sys]) {
      const sys = LIBRETRO[it.sys], want = core(title);
      (await listing(sys, "Named_Boxarts")).filter((n) => core(n.replace(/\.png$/, "").replace(/\s*\(.*$/, "")) === want).slice(0, 6)
        .forEach((n) => add(`${B.libretro}/${enc(sys)}/Named_Boxarts/${enc(n)}`, "RetroArch · " + n.replace(/\.png$/, "")));
    }
    if (it.kind === "album") { const m = await music({ ...it, title }); if (m) m.posters.forEach(([u, l]) => add(u, l)); }
    if (it.kind === "book") { const b = await book({ ...it, title, author: it.pub.author || it.author }); if (b) b.posters.forEach(([u, l]) => add(u, l)); }
    if (it.kind === "film" || it.kind === "serie" || it.kind === "game") {
      const e = await wdFind(title, year, it.kind); if (e) { const w = await wdFiche(e, it.kind); w.posters.concat(w.backs).forEach(([u, l]) => add(u, l)); }
      for (const [b, lang] of [[B.wikiFr, "fr"], [B.wikiEn, "en"]]) {
        const ts = await wpSearch(b, `${title} ${year || ""} ${KIND_WORD[it.kind][lang === "fr" ? 0 : 1]}`.trim(), 3);
        for (const tt of ts.slice(0, 2)) { const s = await summary(b, tt); if (s && s.originalimage) add(s.originalimage.source, `Wikipédia (${lang}) · ${tt}`); }
      }
    }
    pend.set(it.id, out);
    return out;
  }
  const candidate = (id, i) => (pend.get(id) || [])[i] || null;
  async function choosePoster(it, i) {
    const c = candidate(it.id, i); if (!c) return { ok: false, err: "Affiche introuvable : relance la recherche." };
    const f = await saveImage(it.id + "-choisie", c.url); if (!f) return { ok: false, err: "Téléchargement impossible." };
    const t = Date.now(); db[it.id] = { ...(db[it.id] || { t, v: 2 }), coverFile: f, chosen: t, ok: true }; save();
    it.coverFile = f; return { ok: true };
  }
  // l'ordre dans lequel les fiches manquantes seront cherchées (identifiants) : pour les essais et le diagnostic
  const queue = (items) => order(items.filter(wanted), items).map((it) => it.id);
  return { apply, enrich, research, lookup, virtual, pending, db: () => db, save, online, posters, candidate, download, choosePoster, stats: () => ({ ...stats }), busy: () => busy, queue,
    // pour fiche_plus.js (« Plus d'infos » : casting, voix françaises…) : mêmes demandes polies (file d'attente, User-Agent, 429)
    outils: { get, wdFind, bases: B } };
}

module.exports = { createFiches, LIBRETRO, imageType, core, searchOf, numberedRuns };
