// Test des fiches et jaquettes cherchées sur internet : node app/serveur/test_fiches.js
// Un « faux internet » local imite Wikipédia, Wikidata, Wikimedia Commons, TMDB, MusicBrainz, Cover Art Archive,
// Open Library, Google Books, Dailymotion et les jaquettes RetroArch (mêmes adresses, mêmes formats de réponse),
// puis on vérifie ce que le serveur en tire. Aucun accès au vrai internet.
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http"), crypto = require("crypto");
const { createServer } = require("./serveur");
const { imageType, searchOf, numberedRuns, createFiches } = require("./fiches");
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-fiches-"));
const put = (rel, d) => { const f = path.join(T, "m", rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, d); };
put("Films/La.Soupe.Aux.Choux.1981.FRENCH.1080p.BluRay.x264-NOTAG.mkv", "x");   // nom « sale », titre avec article
put("Films/Horizon Rouge (2021)/h.mkv", "x"); put("Films/Horizon Rouge (2021)/poster.jpg", "JPGLOCAL");   // jaquette locale : prioritaire
put("Films/Film Inconnu Xyz/f.mkv", "x");
put("Series/Kaamelott/Kaamelott.S01E01.Heat.mkv", "x");
put("Jeux/SNES/Super Kart (Japan).sfc", Buffer.alloc(16));
put("Jeux/NES/Aventure Perdue (USA).nes", Buffer.alloc(16));
put("Musique/Daft Punk - Discovery/01 - One More Time.mp3", "x");
put("Livres/Antoine de Saint-Exupéry - Le Petit Prince.epub", "PK");
put("Livres/Frank Herbert - Dune.pdf", "%PDF");
// courts-métrages numérotés d'une collection (comme chez le propriétaire) et vrais titres qui commencent par un nombre
for (const n of ["02 Presto", "03 Burn E", "04 Passages Nuageux"]) put(`Films/Courts Pixar/${n}.mkv`, "x");
put("Films/12 Hommes en colère (1957).mkv", "x"); put("Films/1917 (2019).mkv", "x");
// séries rangées comme un utilisateur ordinaire : homonyme film / série, deux séries du même nom (pays)
put("Séries/Les Revenants/Saison 1/Les.Revenants.S01E01.mkv", "x");
put("Séries/The Office (US)/Season 1/The.Office.US.S01E01.mkv", "x");
// images trompeuses : la photo de tournage d'une série (P18), le logo très large d'un film (article français)
put("Séries/Photo Seule/S01E01.mkv", "x"); put("Films/Logo Large (2018).mkv", "x");
// un film du même nom que sa franchise (« Toy Story » : la « série de films » passait devant le film)
put("Films/Fable Jouet (1995).mkv", "x");
// échecs passagers : coupure pendant la recherche, affiche refusée un moment (« trop de demandes, reviens dans 10 min »)
put("Films/Coupure Reseau.mkv", "x"); put("Films/Affiche Encombree (2015).mkv", "x");
// une fiche gardée avant la liste des bandes-annonces (ancienne version) : seules les bandes-annonces sont recalculées
put("Films/Ancienne Fiche (2010).mkv", "x");
// des fiches trouvées autrefois SANS jaquette : recherchées une fois avec la recherche d'aujourd'hui ; si ce nouvel essai
// échoue (coupure), la fiche trouvée est gardée telle quelle
put("Films/Sans Affiche (2012).mkv", "x"); put("Films/Gardee Malgre Tout (2013).mkv", "x");
const filmId = (rel) => "f" + crypto.createHash("sha1").update("film:" + rel).digest("hex").slice(0, 14);
const oldId = filmId("Films/Ancienne Fiche (2010).mkv"), sansId = filmId("Films/Sans Affiche (2012).mkv"), gardeeId = filmId("Films/Gardee Malgre Tout (2013).mkv");
fs.mkdirSync(path.join(T, "d", "fiches"), { recursive: true });

const JPG = (n) => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(400, n || 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(400, 9)]);
const HTML = Buffer.from("<!doctype html><html><body>" + "page d'erreur ".repeat(40) + "</body></html>");
fs.writeFileSync(path.join(T, "d", "fiches", oldId + ".jpg"), JPG(5));
fs.writeFileSync(path.join(T, "d", "fiches", "fiches.json"), JSON.stringify({ [oldId]: { t: Date.now() - 86400000, v: 2, ok: true, wd: "Q60", year: 2010, syn: "Résumé gardé depuis longtemps.", src: "Wikipédia",
  yt: "OLDFULLMOV1", coverFile: path.join(T, "d", "fiches", oldId + ".jpg"), coverSrc: "Wikipédia (en)" },
  [sansId]: { t: Date.now() - 86400000, v: 2, ok: true, wd: "Q97", year: 2012, syn: "Résumé ancien, sans affiche.", src: "Wikipédia" },
  [gardeeId]: { t: Date.now() - 86400000, v: 2, ok: true, wd: "Q98", year: 2013, syn: "Résumé à garder.", src: "Wikipédia" } }));
// --- Wikidata ---
const cl = (v) => ({ rank: "normal", mainsnak: { datavalue: { value: v } } });
const qv = (id) => cl({ id });
const tv = (y) => cl({ time: `+${y}-01-01T00:00:00Z` });
const sec = (n) => ({ datavalue: { value: { amount: "+" + n, unit: "http://www.wikidata.org/entity/Q11574" } } });
// une vidéo YouTube (P1651) avec ses précisions : langue (P407), rôle (P3831 : Q622550 bande-annonce), durée (P2047)
const yt = (id, o = {}) => ({ rank: "normal", mainsnak: { datavalue: { value: id } }, qualifiers: { ...(o.lang ? { P407: [{ datavalue: { value: { id: o.lang } } }] } : {}),
  ...(o.role ? { P3831: [{ datavalue: { value: { id: o.role } } }] } : {}), ...(o.s ? { P2047: [sec(o.s)] } : {}) } });
const E = {
  Q1: { labels: { fr: { value: "La Soupe aux choux" } }, descriptions: { fr: { value: "film de Jean Girault sorti en 1981" } },
    sitelinks: { frwiki: { title: "La Soupe aux choux" }, enwiki: { title: "La Soupe aux choux" } },
    claims: { P31: [qv("Q11424")], P577: [tv(1981)], P136: [qv("Q100")], P57: [qv("Q200")], P161: [qv("Q201"), qv("Q202")], P18: [cl("Soupe aux choux scène.jpg")],
      P2047: [cl({ amount: "+98", unit: "http://www.wikidata.org/entity/Q7727" })],
      P1651: [{ rank: "normal", mainsnak: { datavalue: { value: "BBBBBBBBBBB" } } }, { rank: "normal", mainsnak: { datavalue: { value: "AAAAAAAAAAA" } }, qualifiers: { P3831: [{ datavalue: { value: { id: "Q622550" } } }] } }] } },
  Q2: { labels: { fr: { value: "La Soupe aux choux" } }, descriptions: { fr: { value: "roman de René Fallet" } }, sitelinks: { frwiki: { title: "La Soupe aux choux (roman)" } },
    claims: { P31: [qv("Q8261")], P577: [tv(1980)] } },
  Q10: { labels: { fr: { value: "Super Kart" } }, descriptions: { fr: { value: "jeu vidéo de course" } }, sitelinks: { frwiki: { title: "Super Kart" } },
    claims: { P31: [qv("Q7889")], P577: [tv(1992)], P123: [qv("Q300")], P136: [qv("Q101")] } },
  Q20: { labels: { fr: { value: "Le Petit Prince" } }, descriptions: { fr: { value: "conte d'Antoine de Saint-Exupéry" } }, sitelinks: { frwiki: { title: "Le Petit Prince" } },
    claims: { P31: [qv("Q7725634")], P577: [tv(1943)], P50: [qv("Q301")] } },
  Q30: { labels: { fr: { value: "Kaamelott" } }, descriptions: { fr: { value: "série télévisée française" } }, sitelinks: { frwiki: { title: "Kaamelott" } },
    claims: { P31: [qv("Q5398426")], P580: [tv(2005)], P170: [qv("Q302")] } },
  // courts-métrages : « 02 Presto » doit être cherché « Presto »
  Q80: { labels: { fr: { value: "Presto" } }, descriptions: { fr: { value: "court métrage d'animation sorti en 2008" } }, sitelinks: { frwiki: { title: "Presto (film)" }, enwiki: { title: "Presto (film)" } }, claims: { P31: [qv("Q24862")], P577: [tv(2008)] } },
  Q81: { labels: { fr: { value: "BURN·E" } }, descriptions: { fr: { value: "court métrage d'animation" } }, sitelinks: { enwiki: { title: "BURN-E" } }, claims: { P31: [qv("Q24862")], P577: [tv(2008)] } },
  Q82: { labels: { fr: { value: "Passages nuageux" } }, descriptions: { fr: { value: "court métrage d'animation" } }, sitelinks: { frwiki: { title: "Passages nuageux" } }, claims: { P31: [qv("Q24862")], P577: [tv(2009)] } },
  // vrais titres qui commencent par un nombre (et un film « Hommes en colère » qui ne doit jamais être pris pour « 12 Hommes en colère »)
  Q83: { labels: { fr: { value: "12 Hommes en colère" } }, descriptions: { fr: { value: "film de Sidney Lumet" } }, sitelinks: { frwiki: { title: "12 Hommes en colère" } }, claims: { P31: [qv("Q11424")], P577: [tv(1957)] } },
  Q85: { labels: { fr: { value: "Hommes en colère" } }, descriptions: { fr: { value: "film" } }, sitelinks: { frwiki: { title: "Hommes en colère (film)" } }, claims: { P31: [qv("Q11424")], P577: [tv(1990)] } },
  // bandes-annonces : anglaise et française marquées, un film entier (2 h), une vidéo sans précision ; langue originale anglaise
  Q84: { labels: { fr: { value: "1917" } }, descriptions: { fr: { value: "film de Sam Mendes sorti en 2019" } }, sitelinks: { frwiki: { title: "1917 (film)" }, enwiki: { title: "1917 (2019 film)" } },
    claims: { P31: [qv("Q11424")], P577: [tv(2019)], P364: [qv("Q1860")],
      P1651: [yt("EN1917TRL01", { lang: "Q1860", role: "Q622550" }), yt("FULL1917MOV", { lang: "Q1860", s: 7140 }), yt("FR1917TRL01", { lang: "Q150", role: "Q622550" }), yt("NOQUAL19170"), yt("CLIP1917XXX", { role: "Q1259759" }),
        yt("FR1917TEAS1", { lang: "Q150", role: "Q110996780" }), { ...yt("CHANSON1917", { lang: "Q1860", s: 200 }), qualifiers: { ...yt("CHANSON1917", { lang: "Q1860", s: 200 }).qualifiers, P1476: [{ datavalue: { value: { text: "1917 (Official Music Video)", language: "en" } } }] } }] } },
  // homonymes : le film (2004) et la série (2012) « Les Revenants » ; deux séries « The Office » (Royaume-Uni, États-Unis)
  Q40: { labels: { fr: { value: "Les Revenants" } }, descriptions: { fr: { value: "film de Robin Campillo sorti en 2004" } }, sitelinks: { frwiki: { title: "Les Revenants (film)" } }, claims: { P31: [qv("Q11424")], P577: [tv(2004)] } },
  Q41: { labels: { fr: { value: "Les Revenants" } }, descriptions: { fr: { value: "série télévisée française" } }, sitelinks: { frwiki: { title: "Les Revenants (série télévisée)" }, enwiki: { title: "The Returned (French TV series)" } },
    claims: { P31: [qv("Q5398426")], P580: [tv(2012)], P364: [qv("Q150")] } },
  Q70: { labels: { fr: { value: "The Office" } }, descriptions: { fr: { value: "série télévisée britannique" } }, sitelinks: { frwiki: { title: "The Office" } }, claims: { P31: [qv("Q5398426")], P580: [tv(2001)], P495: [qv("Q145")] } },
  Q71: { labels: { fr: { value: "The Office" } }, descriptions: { fr: { value: "série télévisée américaine" } }, sitelinks: { frwiki: { title: "The Office (série télévisée, 2005)" } }, claims: { P31: [qv("Q5398426")], P580: [tv(2005)], P495: [qv("Q30")] } },
  Q97: { labels: { fr: { value: "Sans Affiche" } }, descriptions: { fr: { value: "film sorti en 2012" } }, sitelinks: { frwiki: { title: "Sans Affiche" }, enwiki: { title: "Sans Affiche" } }, claims: { P31: [qv("Q11424")], P577: [tv(2012)] } },
  Q95: { labels: { fr: { value: "Fable Jouet" } }, descriptions: { fr: { value: "série de films d'animation" } }, sitelinks: { frwiki: { title: "Fable Jouet (franchise)" } }, claims: { P31: [qv("Q196600")], P577: [tv(1995)], P580: [tv(1995)] } },
  Q96: { labels: { en: { value: "Fable Jouet" } }, descriptions: { fr: { value: "film d'animation sorti en 1995" } }, sitelinks: { frwiki: { title: "Fable Jouet" } }, claims: { P31: [qv("Q202866")], P577: [tv(1995)] } },
  Q42: { labels: { fr: { value: "Photo Seule" } }, descriptions: { fr: { value: "série télévisée" } }, sitelinks: { frwiki: { title: "Photo Seule" } }, claims: { P31: [qv("Q5398426")], P580: [tv(2019)], P18: [cl("Photo Seule tournage.jpg")] } },
  Q91: { labels: { fr: { value: "Logo Large" } }, descriptions: { fr: { value: "film sorti en 2018" } }, sitelinks: { frwiki: { title: "Logo Large" }, enwiki: { title: "Logo Large" } }, claims: { P31: [qv("Q11424")], P577: [tv(2018)] } },
  // l'affiche est refusée un moment par le site d'images ; la fiche gardée d'avant la liste des bandes-annonces
  Q90: { labels: { fr: { value: "Affiche Encombrée" } }, descriptions: { fr: { value: "film sorti en 2015" } }, sitelinks: { enwiki: { title: "Affiche Encombree" } }, claims: { P31: [qv("Q11424")], P577: [tv(2015)] } },
  Q60: { labels: { fr: { value: "Ancienne Fiche" } }, descriptions: { fr: { value: "film sorti en 2010" } }, sitelinks: { frwiki: { title: "Ancienne Fiche" } },
    claims: { P31: [qv("Q11424")], P577: [tv(2010)], P1651: [yt("OLDFULLMOV1", { s: 6000 }), yt("Q60FRTRL001", { lang: "Q150", role: "Q622550" })] } },
  Q100: { labels: { fr: { value: "film de comédie" } } }, Q101: { labels: { fr: { value: "jeu vidéo de course" } } }, Q200: { labels: { fr: { value: "Jean Girault" } } },
  Q201: { labels: { fr: { value: "Louis de Funès" } } }, Q202: { labels: { fr: { value: "Jacques Villeret" } } }, Q300: { labels: { fr: { value: "Nintendo" } } },
  Q301: { labels: { fr: { value: "Antoine de Saint-Exupéry" } } }, Q302: { labels: { fr: { value: "Alexandre Astier" } } }
};
// articles de Wikipédia : début (extract), image principale (w × h : en hauteur = une affiche)
const SUM = {
  "fr|La Soupe aux choux": { description: "film de Jean Girault", extract: "La Soupe aux choux est un film français réalisé par Jean Girault, sorti en 1981." },
  "en|La Soupe aux choux": { description: "1981 film", extract: "La Soupe aux choux is a 1981 French comedy film.", originalimage: { source: "http://IMG/soupe-affiche.jpg" } },
  "fr|Super Kart": { description: "jeu vidéo", extract: "Super Kart est un jeu vidéo de course sorti en 1992." },
  "fr|Le Petit Prince": { description: "conte", extract: "Le Petit Prince est une œuvre de langue française d'Antoine de Saint-Exupéry.", originalimage: { source: "http://IMG/petit-prince.jpg" } },
  "fr|Kaamelott": { description: "série télévisée", extract: "Kaamelott est une série télévisée française humoristique.", originalimage: { source: "http://IMG/kaamelott-logo.svg" } },
  // (la vignette de Presto est introuvable sur le site des vignettes : l'original sert de secours)
  "fr|Presto (film)": { extract: "Presto est un court métrage d'animation sorti en 2008." },
  "en|Presto (film)": { extract: "Presto is a 2008 animated short film.", originalimage: { source: "http://IMG/presto-affiche.jpg", w: 600, h: 900, thumb: "http://IMG3/thumb/p/presto-affiche.jpg/500px-presto-affiche.jpg" } },
  "en|BURN-E": { extract: "BURN-E is a 2008 animated short film.", originalimage: { source: "http://IMG/burne-affiche.jpg" } },
  "fr|Passages nuageux": { extract: "Passages nuageux est un court métrage d'animation sorti en 2009.", originalimage: { source: "http://IMG/nuageux-affiche.jpg" } },
  "fr|12 Hommes en colère": { extract: "12 Hommes en colère est un film américain réalisé par Sidney Lumet, sorti en 1957.", originalimage: { source: "http://IMG/douze-affiche.jpg" } },
  // grandes images : l'affiche en vignette de 500 px, la photo de tournage en 1280 px (jamais l'original de 4000 px)
  "fr|1917 (film)": { extract: "1917 est un film de guerre réalisé par Sam Mendes, sorti en 2019.", originalimage: { source: "http://IMG/1917-affiche.jpg", w: 2000, h: 3000, thumb: "http://IMG/thumb/1/1917-affiche.jpg/500px-1917-affiche.jpg" } },
  "fr|Les Revenants (série télévisée)": { extract: "Les Revenants est une série télévisée française créée par Fabrice Gobert.",
    originalimage: { source: "http://IMG/revenants-tournage.jpg", w: 4000, h: 2600, lib: true, thumb: "http://IMG/thumb/r/revenants-tournage.jpg/500px-revenants-tournage.jpg" } },
  // la série : un carton-titre en largeur (grande image de fond) et l'affiche en hauteur sur l'article anglais
  "en|The Returned (French TV series)": { extract: "The Returned is a French supernatural drama television series.", originalimage: { source: "http://IMG/revenants-affiche.jpg", w: 600, h: 900 } },
  "fr|The Office (série télévisée, 2005)": { extract: "The Office est une série télévisée américaine.", originalimage: { source: "http://IMG/office-carton.jpg", w: 1280, h: 720 } },
  "fr|The Office": { extract: "The Office est une série télévisée britannique.", originalimage: { source: "http://IMG/office-uk.jpg" } },
  "en|Affiche Encombree": { extract: "Affiche Encombree is a 2015 film.", originalimage: { source: "http://IMG2/encombree.jpg" } },
  // une série dont l'article a pour image une photo libre en hauteur (le bâtiment du studio) : jamais son affiche
  "en|Sans Affiche": { extract: "Sans Affiche is a 2012 film.", originalimage: { source: "http://IMG/sans-affiche.jpg" } },
  // (l'article français : le logo du titre, une image libre en PNG sans « logo » dans son nom, comme « BDL.png »)
  "fr|Sans Affiche": { extract: "Sans Affiche est un film sorti en 2012.", originalimage: { source: "http://IMG/sa.png", w: 391, h: 254, lib: true } },
  "fr|Photo Seule": { extract: "Photo Seule est une série télévisée.", originalimage: { source: "http://IMG/photo-studio.jpg", w: 4000, h: 6000, lib: true } },
  // un film : logo très large (article français), affiche « à l'italienne » non libre (article anglais) → affiche faute de mieux
  "fr|Logo Large": { extract: "Logo Large est un film sorti en 2018.", originalimage: { source: "http://IMG/logo-large.png", w: 800, h: 310, lib: true } },
  "en|Logo Large": { extract: "Logo Large is a 2018 film.", originalimage: { source: "http://IMG/quad-large.jpg", w: 365, h: 274, lib: false } },
  "fr|Ancienne Fiche": { extract: "Ancienne Fiche est un film sorti en 2010.", originalimage: { source: "http://IMG/ancienne.jpg" } }
};
const SOUPE_TXT = "\n\n== Synopsis ==\nDans un hameau du Bourbonnais, deux vieux paysans voient atterrir une soucoupe volante, dont le passager goûte leur soupe aux choux et en redemande.\n\n== Fiche technique ==\nRéalisation : Jean Girault";
// ce que trouvent les recherches (Wikidata et Wikipédia)
const hits = (s) => /soupe/i.test(s) ? ["Q2", "Q1"] : /kart/i.test(s) ? ["Q10"] : /petit prince/i.test(s) ? ["Q20"] : /kaamelott/i.test(s) ? ["Q30"] : /presto/i.test(s) ? ["Q80"] : /burn/i.test(s) ? ["Q81"]
  : /passages nuageux/i.test(s) ? ["Q82"] : /12 hommes/i.test(s) ? ["Q83"] : /hommes en col/i.test(s) ? ["Q85"] : /1917/.test(s) ? ["Q84"] : /revenants/i.test(s) ? ["Q40", "Q41"] : /office/i.test(s) ? ["Q70", "Q71"]
  : /encombr/i.test(s) ? ["Q90"] : /ancienne fiche/i.test(s) ? ["Q60"] : /photo seule/i.test(s) ? ["Q42"] : /logo large/i.test(s) ? ["Q91"] : /fable jouet/i.test(s) ? ["Q95", "Q96"]
  : /sans affiche/i.test(s) ? ["Q97"] : [];
const titleOf = (q) => ((E[q] && E[q].sitelinks && (E[q].sitelinks.frwiki || E[q].sitelinks.enwiki)) || {}).title || "";
const asked = []; let limitedOnce = false, encombreeOk = false, dmOffice = false;
const net = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x"), p = decodeURIComponent(u.pathname), g = (k) => u.searchParams.get(k) || ""; asked.push(p + u.search);
  const json = (o) => { r.writeHead(200, { "Content-Type": "application/json" }); r.end(JSON.stringify(o)); };
  const img = (b) => { r.writeHead(200, { "Content-Type": "image/jpeg" }); r.end(b); };
  if (!/^Rembobine\/[\w.+-]+ \(https:\/\/github\.com\/grecdel\/Rembobine\)$/.test(q.headers["user-agent"] || "")) { r.writeHead(403); return r.end("User-Agent"); }
  if (/coupure|gardee malgre tout/i.test(decodeURIComponent(u.search))) return q.socket.destroy();   // coupure du réseau pendant cette recherche
  if (/^\/(fr|en)\/w\/api\.php$/.test(p)) {
    const lang = p.slice(1, 3);
    if (g("meta") === "siteinfo") return json({ query: {} });
    // recherche + éléments Wikidata en une demande (generator=search)
    if (g("generator") === "search" && /fable jouet/i.test(g("gsrsearch"))) return json({ batchcomplete: "" });   // la recherche Wikipédia ne trouve rien
    if (g("generator") === "search") { const pages = {}; hits(g("gsrsearch")).forEach((Q, i) => { const t = titleOf(Q); if (t) pages[100 + i] = { pageid: 100 + i, title: t, index: i + 1, pageprops: { wikibase_item: Q } }; }); return json({ query: { pages } }); }
    // un article (API « action ») : début ou tout le texte, image principale avec sa taille
    if (/pageimages/.test(g("prop"))) {
      const t = g("titles"), S = SUM[lang + "|" + t]; if (!S) return json({ query: { pages: [{ title: t, missing: true }] } });
      const pg = { title: t, extract: S.extract + (!g("exintro") && /soupe/i.test(t) && lang === "fr" ? SOUPE_TXT : "") };
      if (S.originalimage) pg.original = { source: S.originalimage.source, width: S.originalimage.w || 500, height: S.originalimage.h || 750 };
      if (S.originalimage && S.originalimage.thumb) pg.thumbnail = { source: S.originalimage.thumb, width: 500, height: Math.round(500 * (S.originalimage.h / S.originalimage.w)) };
      // image libre (photo, logo) ou non libre (affiche, carton-titre : seulement sur Wikipédia en anglais)
      if (S.originalimage && S.originalimage.lib != null) pg.pageprops = { [S.originalimage.lib ? "page_image_free" : "page_image"]: S.originalimage.source.split("/").pop() };
      return json({ query: { pages: [pg] } });
    }
    if (g("list") === "search") { const s = g("srsearch"); return json({ query: { search: (/soupe/i.test(s) ? ["La Soupe aux choux", "La Soupe aux choux (roman)"] : /kart/i.test(s) ? ["Super Kart"] : /petit prince/i.test(s) ? ["Le Petit Prince"] : /kaamelott/i.test(s) ? ["Kaamelott"] : []).map((title) => ({ title })) } }); }
    if (g("prop") === "pageprops") { const Q = { "La Soupe aux choux": "Q1", "La Soupe aux choux (roman)": "Q2", "Super Kart": "Q10", "Le Petit Prince": "Q20", Kaamelott: "Q30" }; const pages = {};
      g("titles").split("|").forEach((t, i) => { if (Q[t]) pages[i] = { title: t, pageprops: { wikibase_item: Q[t] } }; }); return json({ query: { pages } }); }
    if (g("prop") === "extracts") return json({ query: { pages: { 1: { title: g("titles"), extract: /soupe/i.test(g("titles")) ? "La Soupe aux choux est un film." + SOUPE_TXT : "Intro seulement." } } } });
    return json({});
  }
  if (/^\/(fr|en)\/api\/rest_v1\/page\/summary\//.test(p)) {
    const lang = p.slice(1, 3), t = p.split("/summary/")[1].replace(/_/g, " "), S = SUM[lang + "|" + t];
    if (!S) { r.writeHead(404); return r.end(); } return json({ type: "standard", title: t, ...S });
  }
  if (p === "/wd/w/api.php") {
    if (g("action") === "wbsearchentities") {
      // premier appel : « trop de demandes, réessaie dans 1 s » (le serveur doit attendre et réessayer)
      if (!limitedOnce) { limitedOnce = true; r.writeHead(429, { "Retry-After": "1" }); return r.end("too many"); }
      return json({ search: hits(g("search")).map((id) => ({ id })) });
    }
    if (g("action") === "wbgetentities") { const entities = {}; for (const id of g("ids").split("|")) entities[id] = E[id] ? { id, ...E[id] } : { id, missing: "" }; return json({ entities }); }
    if (g("action") === "wbgetclaims") { const e = E[g("entity")], P = g("property"); return json({ claims: e && e.claims && e.claims[P] ? { [P]: e.claims[P] } : {} }); }
    return json({});
  }
  // Dailymotion (API publique) : la vraie bande-annonce VF et VOST, et tout ce qui doit être écarté
  if (p === "/dm/videos") {
    if (g("fields") !== "id,title,duration,language") return json({ error: { code: 400, message: "champs" } });
    const s = g("search");
    if (s === "1917 2019 bande annonce vf") return json({ list: [
      { id: "x1917cri", title: "1917 : critique du film", duration: 200, language: "fr" },              // une critique
      { id: "x1917lng", title: "1917 - Bande-annonce VF", duration: 3600, language: "fr" },             // trop longue (pas une bande-annonce)
      { id: "xdune842", title: "Dune 1984 bande annonce VF", duration: 120, language: "fr" },           // un autre film
      { id: "x1917old", title: "1917 (1970) bande annonce", duration: 120, language: "fr" },            // une autre année
      { id: "x1917sui", title: "1917 2 - Bande-annonce VF", duration: 120, language: "fr" },            // une suite
      { id: "x1917air", title: "1917 in the Air - Bande-annonce VF", duration: 120, language: "fr" },   // un autre titre qui commence pareil
      { id: "x1917vf1", title: "1917 - Bande-annonce officielle VF", duration: 150, language: "fr" },   // LA bande-annonce française
      { id: "x1917vo1", title: "1917 Bande annonce VOST", duration: 140, language: "fr" },              // version originale sous-titrée
      { id: "bad id!", title: "1917 bande annonce VF", duration: 120 }] });
    if (/^ancienne fiche/i.test(s)) return json({ list: [{ id: "xancien01", title: "Ancienne Fiche - Bande-annonce VF", duration: 120, language: "fr" }] });
    // Dailymotion injoignable un moment pour « The Office » : la fiche est gardée, Dailymotion seul est refait plus tard
    if (/^the office/i.test(s)) { if (!dmOffice) return q.socket.destroy(); return json({ list: [{ id: "xoffice01", title: "The Office - bande-annonce VOST", duration: 95, language: "en" }] }); }
    return json({ list: [] });
  }
  if (p.startsWith("/commons/wiki/Special:FilePath/")) { r.writeHead(302, { Location: "/img/commons-" + encodeURIComponent(p.split("/").pop()) }); return r.end(); }
  // l'affiche refusée un moment : « trop de demandes, reviens dans 10 minutes »
  if (p === "/img2/encombree.jpg") { if (!encombreeOk) { r.writeHead(429, { "Retry-After": "600" }); return r.end("too many"); } return img(JPG(11)); }
  if (p.startsWith("/img/")) return img(JPG(p.length));
  if (p.startsWith("/img3/")) { r.writeHead(404); return r.end(); }   // vignette absente
  if (p.startsWith("/libretro/")) {
    if (p.endsWith("/Named_Boxarts/")) { r.writeHead(200, { "Content-Type": "text/html" }); return r.end('<a href="Aventure%20Perdue%20(USA).png">x</a><a href="Aventure%20Perdue%20(Europe).png">y</a><a href="Aventure%20Perdue%20(Beta).png">z</a>'); }
    if (/Super Nintendo Entertainment System\/Named_(Boxarts|Titles|Snaps)\/Super Kart \(Japan\)\.png$/.test(p)) { r.writeHead(200, { "Content-Type": "image/png" }); return r.end(PNG); }
    if (/Nintendo Entertainment System\/Named_Boxarts\/Aventure Perdue \(USA\)\.png$/.test(p) && asked.filter((a) => a.includes("Aventure Perdue (USA).png")).length > 1) { r.writeHead(200); return r.end(PNG); }
    r.writeHead(404); return r.end();
  }
  if (p.startsWith("/mb/ws/2/release-group/")) return json({ "release-groups": [
    { id: "tesh-1", score: 100, title: "Discovery", "first-release-date": "1996", "artist-credit": [{ name: "John Tesh" }], "primary-type": "Album" },
    { id: "abc-123", score: 100, title: "Discovery", "first-release-date": "2001-03-12", "artist-credit": [{ name: "Daft Punk" }], "primary-type": "Album", tags: [{ name: "house", count: 5 }, { name: "french touch", count: 3 }] }] });
  if (p.startsWith("/mb/ws/2/release")) return json({ releases: g("release-group") === "abc-123" ? [{ country: "XE", media: [{ tracks: [{ title: "One More Time", length: 320000 }, { title: "Aerodynamic", length: 207000 }, { title: "Digital Love", length: 301000 }] }] }] : [] });
  if (p.startsWith("/caa/release-group/abc-123/front-500")) { r.writeHead(302, { Location: "/img/discovery.jpg" }); return r.end(); }
  if (p === "/ol/search.json") {
    if (/petit prince/i.test(g("title"))) return json({ docs: [{ key: "/works/OL1W", title: "Le Petit Prince", author_name: ["Antoine de Saint-Exupéry"], first_publish_year: 1943, cover_i: 666 }] });
    if (/^dune$/i.test(g("title"))) return json({ docs: [{ key: "/works/OL2W", title: "Dune", author_name: ["Frank Herbert"], first_publish_year: 1965, cover_i: 777, edition_count: 150 }, { key: "/works/OL3W", title: "Dune Messiah", author_name: ["Frank Herbert"], cover_i: 778 }] });
    return json({ docs: [] });
  }
  if (p === "/olc/b/id/666-L.jpg") { r.writeHead(200, { "Content-Type": "image/jpeg" }); return r.end(HTML); }   // « image » qui est une page web : refusée
  if (p === "/olc/b/id/777-L.jpg") return img(JPG(3));
  if (p === "/gb/books/v1/volumes") return json({ items: /dune/i.test(g("q")) ? [{ volumeInfo: { title: "Dune", authors: ["Frank Herbert"], publishedDate: "1970", description: "Sur la planète Arrakis, le <b>désert</b> cache l'épice.", categories: ["Fiction"] } }] : [] });
  if (p.startsWith("/ol/works/")) return json({ description: "An English description." });
  // TMDB (seulement pour l'essai avec une clé, plus bas)
  if (p === "/tmdb/3/search/movie") return json({ results: /film tmdb/i.test(g("query")) ? [{ id: 7, title: "Le Film TMDB 2 : la suite", release_date: "2023-01-01" }, { id: 42, title: "Le Film TMDB", original_title: "The TMDB Movie", release_date: "2020-05-01", poster_path: "/p42.jpg" }] : [] });
  if (p === "/tmdb/3/movie/42") return json({ id: 42, title: "Le Film TMDB", overview: "Un film trouvé sur TMDB.", release_date: "2020-05-01", poster_path: "/p42.jpg", original_language: "en", genres: [{ name: "Drame" }],
    credits: { cast: [{ name: "Actrice Une" }], crew: [{ job: "Director", name: "Réalisatrice" }] }, videos: { results: [
      { site: "YouTube", key: "TMDBENTRL01", type: "Trailer", iso_639_1: "en", official: true, name: "Official Trailer" },
      { site: "YouTube", key: "TMDBFEATUR1", type: "Featurette", iso_639_1: "fr", name: "Les coulisses" },
      { site: "YouTube", key: "TMDBFRTEAS1", type: "Teaser", iso_639_1: "fr", name: "Teaser VF" },
      { site: "YouTube", key: "TMDBFRTRL01", type: "Trailer", iso_639_1: "fr", official: true, name: "Bande-annonce VF" },
      { site: "Vimeo", key: "123456789", type: "Trailer", iso_639_1: "en", name: "Trailer (Vimeo)" }] } });
  if (p.startsWith("/tmdbimg/")) return img(JPG(13));
  r.writeHead(404); r.end();
});
let ok = 0, ko = 0;
const check = (c, w) => { if (c) ok++; else { ko++; console.log("ÉCHEC :", w); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- le titre cherché : numéro d'ordre d'une collection, ou vrai titre qui commence par un nombre (sans réseau) ---
{
  const F = (title, file) => ({ id: "x" + title, kind: "film", title, file });
  const q = (it, runs) => searchOf(it, runs).map((x) => x.q + (x.strict ? " (strict)" : "")).join(" | ");
  check(q(F("02 Presto", "/m/Films/Courts/02 Presto.mkv")) === "Presto", "« 02 Presto » (numéro qui commence par 0) : cherché « Presto »");
  check(q(F("10 - Mini Buzz", "/m/Films/Courts/10 - Mini Buzz.mkv")) === "Mini Buzz", "« 10 - Mini Buzz » (numéro séparé du titre) : cherché « Mini Buzz »");
  check(q(F("07 Jour Et Nuit", "/m/Films/07.Jour.Et.Nuit.mkv")) === "Jour Et Nuit", "« 07.Jour.Et.Nuit » : cherché « Jour Et Nuit »");
  check(q(F("12 Hommes en colère", "/m/Films/12 Hommes en colère (1957).mkv")) === "12 Hommes en colère | Hommes en colère (strict)", "« 12 Hommes en colère » : le vrai titre d'abord");
  check(q(F("101 Dalmatians II Patch's London Adventure", "/m/Films/101 Dalmatians II Patch's London Adventure (2003).mkv")) === "101 Dalmatians II Patch's London Adventure", "« 101 Dalmatians II » : le titre entier, seulement");
  for (const t of ["1917", "300", "2001 L'Odyssée de l'espace"]) check(q(F(t, `/m/Films/${t}.mkv`)) === t, `« ${t} » : cherché tel quel`);
  check(q(F("28 Jours plus tard", "/m/Films/28 Jours plus tard (2002).mkv")).startsWith("28 Jours plus tard |"), "« 28 Jours plus tard » : le vrai titre d'abord");
  check(q({ id: "s1", kind: "serie", title: "24 heures chrono", file: "" }) === "24 heures chrono", "une série n'a pas de numéro d'ordre (« 24 heures chrono »)");
  // une suite dans un dossier (« 08 », « 09 », « 10 ») : « 10 Mini Buzz » aussi ; des titres numériques épars dans « Films » : non
  const suite = ["08 Vacances Hawaïennes", "09 Air Martin", "10 Mini Buzz"].map((t) => F(t, `/m/Films/Courts Pixar/${t}.mkv`));
  const epars = ["10 jours sans maman", "12 Hommes en colère", "28 Jours plus tard", "101 Dalmatiens"].map((t) => F(t, `/m/Films/${t}.mkv`));
  const runs = numberedRuns(suite.concat(epars));
  check(q(suite[2], runs) === "Mini Buzz (strict) | 10 Mini Buzz", "« 10 Mini Buzz » dans une suite numérotée : cherché « Mini Buzz » d'abord " + q(suite[2], runs));
  check(epars.every((it) => !runs.has(it.id)), "titres numériques épars du dossier Films : pas une suite");
}

net.listen(0, async () => {
  const N = `http://127.0.0.1:${net.address().port}`;
  const realFetch = fetch;
  const f = (url, o) => realFetch(String(url).replace("http://IMG/", N + "/img/").replace("http://IMG2/", N + "/img2/").replace("http://IMG3/", N + "/img3/"), o);   // les images citées pointent vers le faux internet
  const bases = { wikiFr: N + "/fr", wikiEn: N + "/en", wikidata: N + "/wd", commons: N + "/commons", mb: N + "/mb", caa: N + "/caa", libretro: N + "/libretro", ol: N + "/ol", olCovers: N + "/olc", gbooks: N + "/gb", dm: N + "/dm" };
  // un port libre (pas un port au hasard : d'autres serveurs d'essai peuvent tourner sur la même machine)
  const freePort = () => new Promise((ok) => { const s = http.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const S = createServer({ port: await freePort(), dataDir: path.join(T, "d"), mediaRoots: [path.join(T, "m")], fetch: f, ficheDelay: 0, mbDelay: 0, ficheBases: bases });
  check(S.cfg.fiches === undefined && S.fichesOn(), "fiches sur internet ACTIVÉES par défaut (sans choix explicite)");
  await S.start();
  // la page reçoit « fiches » quand des jaquettes arrivent (elle se rafraîchit toute seule)
  const evs = []; const sse = http.get(`http://127.0.0.1:${S.port}/api/stream`, (res) => { res.setEncoding("utf8"); res.on("data", (d) => { for (const m of d.matchAll(/data: (.*)\n/g)) { try { evs.push(JSON.parse(m[1])); } catch (_) {} } }); });
  const fini = (k = 1) => S.log.filter((l) => /fiches : \d+ trouvée/.test(l.msg)).length >= k;
  for (let i = 0; i < 300 && !fini(); i++) await wait(100);
  const by = (t) => S.lib.items.find((x) => x.title === t);
  const so = by("La Soupe Aux Choux");
  check(so && /Bourbonnais/.test(so.pub.syn || ""), "film au nom sale (La.Soupe.Aux.Choux.1981.FRENCH.1080p…) : résumé en français (le film, pas le roman homonyme)");
  check(so && /soucoupe volante/.test(so.pub.syn || "") && !/Fiche technique/.test(so.pub.syn), "film : le résumé est la section « Synopsis » de l'article");
  check(so && so.pub.year == 1981 && so.pub.genre === "Comédie" && so.pub.director === "Jean Girault" && (so.pub.cast || []).join() === "Louis de Funès,Jacques Villeret" && so.pub.runtime === 98, "film : année, genre, réalisation, acteurs, durée (Wikidata) " + JSON.stringify(so && { y: so.pub.year, g: so.pub.genre, d: so.pub.director, c: so.pub.cast, r: so.pub.runtime }));
  check(so && so.coverFile && /\/fiches\//.test(so.coverFile) && /^\/cover\//.test(so.pub.cover || ""), "film : affiche (article anglais, quand le français n'en a pas)");
  check(so && so.pub.yt === "AAAAAAAAAAA", "film : bande-annonce YouTube (Wikidata P1651, celle marquée « bande-annonce »)");
  check(so && /^\/cover\/.+-fond\?k=/.test(so.pub.backdrop || ""), "film : grande image de fond (Wikidata P18 sur Commons)");
  check(so && so.pub.src === "Wikipédia", "film : la source de la fiche est indiquée");
  check(S.fiches.stats().limited >= 1, "site encombré (429 + Retry-After) : attente puis nouvel essai, la fiche est quand même trouvée");
  check(by("Horizon Rouge").coverFile.endsWith("poster.jpg"), "la jaquette posée à côté du film reste prioritaire");
  check(!by("Film Inconnu Xyz").pub.syn && !by("Film Inconnu Xyz").pub.yt, "film introuvable : pas de fiche inventée");
  const ka = by("Kaamelott");
  check(ka && /série télévisée/.test(ka.pub.syn || "") && ka.pub.year == 2005 && ka.pub.director === "Alexandre Astier", "série : résumé, année de début, création");
  check(ka && !ka.coverFile, "série : un logo SVG n'est jamais pris pour une affiche");
  const sk = by("Super Kart");
  check(sk && sk.coverFile && fs.readFileSync(sk.coverFile)[0] === 0x89, "jeu : jaquette RetroArch (nom exact du fichier)");
  check(sk && sk.pub.backdrop && sk.pub.titleShot, "jeu : capture (grande image) et écran titre RetroArch");
  check(sk && /jeu vidéo de course/.test(sk.pub.syn || "") && sk.pub.year == 1992 && sk.pub.publisher === "Nintendo" && sk.pub.genre === "Course", "jeu : résumé, année, éditeur, genre (Wikidata) " + JSON.stringify(sk && { g: sk.pub.genre, p: sk.pub.publisher }));
  const av = by("Aventure Perdue");
  check(av && av.coverFile && /\/fiches\//.test(av.coverFile), "jeu au nom approchant : jaquette trouvée dans la liste RetroArch (version USA, pas la bêta)");
  check(fs.readdirSync(path.join(T, "d", "fiches")).some((n) => /^libretro-.*\.json$/.test(n)), "la liste des jaquettes RetroArch est gardée sur le disque");
  const al = by("Discovery");
  check(al && al.pub.year === 2001 && al.coverFile && al.pub.genre === "house, french touch", "album : le bon artiste parmi les homonymes, année, genre, pochette (Cover Art Archive)");
  check(al && (al.pub.tracksInfo || []).length === 3 && al.pub.tracksInfo[1].title === "Aerodynamic" && al.pub.tracksInfo[0].len === 320, "album : liste des pistes (MusicBrainz)");
  const pp = by("Le Petit Prince");
  check(pp && /Saint-Exupéry/.test(pp.pub.syn || "") && pp.pub.year == 1943, "livre : résumé en français (Wikipédia) et année");
  check(pp && pp.coverFile && imageType(fs.readFileSync(pp.coverFile)) === "jpg", "livre : la « couverture » qui est une page web est refusée, celle de Wikipédia est prise");
  const du = by("Dune");
  check(du && du.coverFile && du.pub.year == 1965 && /Arrakis, le désert/.test(du.pub.syn || ""), "livre : couverture Open Library, année de 1re édition, résumé Google Books (sans balises)");
  check(asked.every((a) => !/api_key|\/tmdb\//.test(a)), "sans clé TMDB : TMDB n'est jamais appelé");
  check(evs.some((e) => e.type === "fiches"), "évènement « fiches » envoyé aux écrans quand les jaquettes arrivent");

  // --- numéros d'ordre et vrais titres numériques ---
  const wdQ = asked.filter((a) => a.startsWith("/wd/w/api.php?action=wbsearchentities")).map((a) => new URL("http://x" + a).searchParams.get("search"));
  for (const [t, w] of [["02 Presto", "Presto"], ["03 Burn E", "BURN·E"], ["04 Passages Nuageux", "Passages nuageux"]]) {
    const x = by(t); check(x && x.coverFile && /\/fiches\//.test(x.coverFile) && x.pub.syn, `court-métrage numéroté « ${t} » : trouvé (« ${w} »), avec sa jaquette`);
  }
  check(wdQ.includes("Presto") && !wdQ.includes("02 Presto"), "« 02 Presto » : cherché « Presto » (jamais avec le numéro)");
  const hc = by("12 Hommes en colère");
  check(hc && hc.coverFile && /Sidney Lumet/.test(hc.pub.syn || ""), "« 12 Hommes en colère » : trouvé sous son vrai titre (le nombre fait partie du titre)");
  check(!wdQ.some((s) => /^hommes en col/i.test(s)) && !(hc && /1990/.test(String(hc.pub.year))), "« 12 Hommes en colère » : jamais cherché sans « 12 » (pas confondu avec « Hommes en colère »)");
  check(by("1917") && by("1917").pub.year == 2019 && by("1917").coverFile, "« 1917 » : trouvé tel quel");
  check(by("Fable Jouet") && S.fiches.db()[by("Fable Jouet").id].wd === "Q96", "film du même nom que sa franchise : le film, pas la « série de films » " + (by("Fable Jouet") && S.fiches.db()[by("Fable Jouet").id].wd));
  // --- séries ---
  const rv = by("Les Revenants");
  check(rv && rv.pub.year == 2012 && /série télévisée/.test(rv.pub.syn || ""), "série homonyme d'un film (« Les Revenants ») : la série, pas le film de 2004");
  check(rv && rv.coverFile && /\/fiches\//.test(rv.coverFile), "série : son affiche (article anglais, image en hauteur)");
  check(rv && /^\/cover\/.+-fond\?k=/.test(rv.pub.backdrop || "") && asked.includes("/img/thumb/r/revenants-tournage.jpg/1280px-revenants-tournage.jpg") && !asked.includes("/img/revenants-tournage.jpg"), "grande image : la vignette de 1280 px, jamais l'original de 4000 px");
  check(asked.includes("/img/thumb/1/1917-affiche.jpg/500px-1917-affiche.jpg") && !asked.includes("/img/1917-affiche.jpg"), "affiche : la vignette de 500 px (pas l'original de 2000 px)");
  check(asked.includes("/img3/thumb/p/presto-affiche.jpg/500px-presto-affiche.jpg") && asked.includes("/img/presto-affiche.jpg") && by("02 Presto").coverFile, "vignette introuvable : l'original en secours");
  const of = by("The Office (US)");
  check(of && of.pub.year == 2005 && /américaine/.test(of.pub.syn || ""), "« The Office (US) » : la série américaine (pays d'origine), pas la britannique");
  check(of && !of.coverFile && /^\/cover\/.+-fond\?k=/.test(of.pub.backdrop || ""), "série : un carton-titre en largeur sert de grande image (pas d'affiche : coupé en vignette, il ne ressemble à rien)");
  const ps = by("Photo Seule"), ll = by("Logo Large");
  check(ps && ps.pub.syn && !ps.coverFile && /^\/cover\/.+-fond\?k=/.test(ps.pub.backdrop || "") && !asked.includes("/img/photo-studio.jpg"), "série : la photo de tournage (Wikidata P18) sert de grande image ; une photo libre (studio) n'est jamais son affiche");
  check(ll && ll.pub.syn && ll.coverFile && /\/fiches\//.test(ll.coverFile) && /^\/cover\/.+-fond\?k=/.test(ll.pub.backdrop || "") && asked.filter((a) => a === "/img/quad-large.jpg").length === 1, "film : affiche « à l'italienne » (en largeur, non libre) prise faute de mieux, et en grande image (téléchargée une fois)");
  check(!asked.includes("/img/logo-large.png"), "film : un logo très large (800 × 310) n'est ni une affiche ni une grande image (pas même téléchargé)");
  const ofr = of && S.fiches.db()[of.id];
  check(ofr && ofr.ok && ofr.dm === 0 && !ofr.imgRetry && !ofr.retry, "Dailymotion sans réponse : fiche gardée telle quelle, Dailymotion seul sera refait " + JSON.stringify(ofr && { dm: ofr.dm, img: ofr.imgRetry }));
  // --- bandes-annonces : françaises d'abord, puis anglaises, puis les autres ; Dailymotion en plus ---
  const ft = by("1917"), lst = ((ft && ft.pub.trailers) || []).map((x) => `${x.site}:${x.id}:${x.lang}`);
  check(lst.join() === "youtube:FR1917TRL01:fr,youtube:FR1917TEAS1:fr,dailymotion:x1917vf1:fr,youtube:EN1917TRL01:en,dailymotion:x1917vo1:en,youtube:NOQUAL19170:", "bandes-annonces rangées : françaises (bande-annonce, teaser), anglaises, puis sans langue " + JSON.stringify(lst));
  check(ft && ft.pub.yt === "FR1917TRL01", "pub.yt : la première YouTube (la française)");
  check(!lst.some((x) => /FULL1917MOV|CLIP1917XXX|CHANSON1917|x1917cri|x1917lng|xdune842|x1917old|x1917sui|x1917air/.test(x)), "écartés : film entier (2 h), extrait, clip musical, critique, vidéo trop longue, autre film, autre année, suite, autre titre qui commence pareil");
  check(ft && (ft.pub.trailers || []).length && ft.pub.trailers.every((x) => x.titre !== undefined && x.source), "chaque bande-annonce a sa source et son titre " + JSON.stringify(ft && (ft.pub.trailers || [])[1]));
  check(asked.some((a) => a.startsWith("/dm/videos?") && /search=1917\+2019\+bande\+annonce\+vf|search=1917%202019%20bande%20annonce%20vf/.test(a)), "Dailymotion cherché « <titre> <année> bande annonce vf »");
  check(!asked.some((a) => a.startsWith("/dm/") && /inconnu/i.test(a)), "Dailymotion jamais cherché pour un titre pas reconnu");
  check(rv && !(rv.pub.trailers || []).length && !rv.pub.yt, "pas de bande-annonce trouvée : rien d'inventé");
  // --- échecs passagers : nouvel essai bientôt ---
  const cr = S.fiches.db()[by("Coupure Reseau").id];
  check(cr && !cr.ok && cr.retry && cr.n === 1, "coupure pendant la recherche : pas « introuvable » pour des jours, nouvel essai dans 15 min " + JSON.stringify(cr && { ok: cr.ok, retry: cr.retry, n: cr.n }));
  const enc = by("Affiche Encombree"), er = S.fiches.db()[enc.id];
  check(er && er.ok && !enc.coverFile && er.imgRetry && (er.imgs.p || []).length, "affiche refusée un moment (429, Retry-After 600) : fiche gardée, affiche à réessayer " + JSON.stringify(er && { ok: er.ok, img: er.imgRetry }));
  // --- fiche gardée d'avant la liste : seules les bandes-annonces sont recalculées ---
  const an = by("Ancienne Fiche"), ar = S.fiches.db()[oldId];
  check(an && an.id === oldId && ar && ar.tv && (an.pub.trailers || []).map((x) => x.id).join() === "Q60FRTRL001,xancien01" && an.pub.yt === "Q60FRTRL001", "fiche déjà gardée : bandes-annonces calculées (le film entier n'est plus proposé) " + JSON.stringify(an && an.pub.trailers));
  check(asked.some((a) => /wbgetclaims&entity=Q60&property=P1651/.test(a)) && !asked.some((a) => /Ancienne(%20|_| )Fiche|ancienne\.jpg/i.test(a) && !a.startsWith("/dm/")), "…sans rien retélécharger d'autre (ni article, ni image)");
  check(an && an.pub.syn === "Résumé gardé depuis longtemps." && /\/fiches\//.test(an.coverFile || ""), "…et la fiche gardée (résumé, jaquette) ne change pas");
  const sa = by("Sans Affiche"), ga = by("Gardee Malgre Tout"), gr = S.fiches.db()[gardeeId];
  check(sa && sa.coverFile && /\/fiches\//.test(sa.coverFile) && S.fiches.db()[sansId].sv === 3, "fiche trouvée autrefois sans jaquette : recherchée une fois de plus, la jaquette arrive");
  check(!asked.includes("/img/sa.png") && !sa.pub.backdrop, "le logo d'un article français (image libre en PNG) n'est jamais une grande image");
  check(ga && ga.pub.syn === "Résumé à garder." && gr && gr.ok && gr.partial && gr.n === 1, "…et si ce nouvel essai échoue (coupure), la fiche trouvée est gardée (nouvel essai plus tard) " + JSON.stringify(gr && { ok: gr.ok, partial: gr.partial, n: gr.n }));

  // la jaquette et la grande image sont servies comme les autres (signées)
  const r1 = await realFetch(`http://127.0.0.1:${S.port}${so.pub.cover}`), r2 = await realFetch(`http://127.0.0.1:${S.port}${so.pub.backdrop}`);
  check(r1.status === 200 && (await r1.arrayBuffer()).byteLength > 300 && r2.status === 200, "l'affiche et la grande image trouvées sont servies aux appareils");
  const lib = await realFetch(`http://127.0.0.1:${S.port}/api/library`).then((x) => x.json());
  const so2 = lib.items.find((x) => x.id === so.id), ft2 = lib.items.find((x) => x.id === ft.id);
  check(so2 && so2.yt && so2.backdrop && so2.cast && so2.cast.length === 2, "la bibliothèque envoyée aux écrans contient affiche, fond, bande-annonce, acteurs");
  check(ft2 && (ft2.trailers || []).length === 6 && ft2.trailers[0].site === "youtube" && ft2.trailers[0].lang === "fr" && ft2.trailers[2].site === "dailymotion" && !("rank" in ft2.trailers[0]), "la bibliothèque envoyée aux écrans contient la liste des bandes-annonces (pub.trailers)");
  // la petite page de la bande-annonce (la page de l'application est un fichier local) : le lecteur, et un petit script
  // autorisé par son empreinte qui redit à la page de Rembobine ce que fait le lecteur (démarre, erreur…)
  const ba = await realFetch(`http://127.0.0.1:${S.port}/bande-annonce?v=AAAAAAAAAAA`); const bt = await ba.text(), csp = ba.headers.get("content-security-policy") || "";
  const js = (/<script>([\s\S]*?)<\/script>/.exec(bt) || [])[1] || "", sha = `'sha256-${require("crypto").createHash("sha256").update(js, "utf8").digest("base64")}'`;
  check(ba.status === 200 && /youtube-nocookie\.com\/embed\/AAAAAAAAAAA\?[^"]*enablejsapi=1/.test(bt) && new RegExp(`origin=http%3A%2F%2F127\\.0\\.0\\.1%3A${S.port}"`).test(bt) && /frame-src https:\/\/www\.youtube-nocookie\.com;/.test(csp), "page de bande-annonce : YouTube sans cookies (qui parle à la page), seule source permise");
  check(js.length > 200 && csp.includes(`script-src ${sha};`) && !/unsafe-inline|unsafe-eval/.test(csp) && /default-src 'none'/.test(csp) && /"listening"/.test(js) && /onError/.test(js) && /e\.source === f\.contentWindow/.test(js), "page de bande-annonce : le script qui écoute le lecteur est permis par son empreinte, rien d'autre");
  const bd = await realFetch(`http://127.0.0.1:${S.port}/bande-annonce?site=dailymotion&v=x8abc12`); const bdt = await bd.text(), cspd = bd.headers.get("content-security-policy") || "";
  check(bd.status === 200 && /dailymotion\.com\/embed\/video\/x8abc12\?autoplay=1&amp;api=postMessage/.test(bdt) && /data-site="dailymotion"/.test(bdt) && /frame-src https:\/\/www\.dailymotion\.com https:\/\/geo\.dailymotion\.com;/.test(cspd) && !/youtube|vimeo/.test(cspd), "page de bande-annonce : Dailymotion (seuls ses lecteurs permis)");
  const bv = await realFetch(`http://127.0.0.1:${S.port}/bande-annonce?site=vimeo&v=76979871`); const bvt = await bv.text();
  check(bv.status === 200 && /player\.vimeo\.com\/video\/76979871/.test(bvt) && /frame-src https:\/\/player\.vimeo\.com;/.test(bv.headers.get("content-security-policy") || ""), "page de bande-annonce : Vimeo");
  const refus = ["v=<script>", "v=AAAAAAAAAA", "v=AAAAAAAAAAAA", "v=AAAAAAAAAA%22", "site=dailymotion&v=AAAAAAAAAAA", "site=dailymotion&v=x1", "site=dailymotion&v=x8abc12%3Cb", "site=vimeo&v=12ab34", "site=vimeo&v=12", "site=evil&v=AAAAAAAAAAA", "site=__proto__&v=AAAAAAAAAAA", "site=constructor&v=AAAAAAAAAAA"];
  const codes = await Promise.all(refus.map((q) => realFetch(`http://127.0.0.1:${S.port}/bande-annonce?${q}`).then((r) => r.status)));
  check(codes.every((c) => c === 400), "page de bande-annonce : identifiants mal formés et sites inconnus refusés " + JSON.stringify(codes));
  // une adresse d'hôte bizarre ne finit pas dans la page (le lecteur n'a alors pas d'« origin »)
  const odd = await new Promise((ok2) => http.get({ host: "127.0.0.1", port: S.port, path: "/bande-annonce?v=AAAAAAAAAAA", headers: { Host: 'x"><b>' } }, (r) => { let d = ""; r.setEncoding("utf8"); r.on("data", (c) => { d += c; }); r.on("end", () => ok2({ st: r.statusCode, d })); }).on("error", () => ok2({ st: 0, d: "" })));
  check(odd.st !== 200 || (!/<b>/.test(odd.d) && !/origin=/.test(odd.d)), "page de bande-annonce : hôte mal formé ignoré");
  // une seconde analyse ne redemande rien (fiches gardées ; nouvel essai des échecs passagers seulement dans 15 min)
  const before = asked.length; await S.rescan(); await wait(1500);
  check(asked.filter((a, i) => i >= before && !/siteinfo|Inconnu|inconnu/i.test(a)).length === 0, "fiches gardées : rien n'est redemandé à internet " + JSON.stringify(asked.slice(before).filter((a) => !/siteinfo|nconnu/.test(a)).slice(0, 4)));
  // un quart d'heure plus tard (horloge avancée) : l'affiche refusée est retéléchargée, sans refaire la recherche ;
  // 6 h plus tard : Dailymotion, seul, pour « The Office »
  encombreeOk = true; er.t -= 16 * 60000; dmOffice = true; ofr.dmT -= 7 * 3600000;
  const nLog = S.log.filter((l) => /fiches : \d+ trouvée/.test(l.msg)).length, b4 = asked.length;
  await wait(4600);   // la pause demandée par le site (raccourcie pour l'essai) est passée
  S.ficheSearch();
  for (let i = 0; i < 100 && !fini(nLog + 1); i++) await wait(100);
  const enc2 = S.lib.items.find((x) => x.id === enc.id), now = asked.slice(b4);
  check(enc2 && enc2.coverFile && /\/fiches\//.test(enc2.coverFile) && !S.fiches.db()[enc.id].imgRetry, "nouvel essai : l'affiche arrive " + JSON.stringify(now.slice(0, 5)));
  check(now.some((a) => a === "/img2/encombree.jpg") && !now.some((a) => /encombr/i.test(a) && a !== "/img2/encombree.jpg"), "…seule l'image est redemandée (pas toute la recherche)");
  const of2 = S.lib.items.find((x) => x.id === of.id);
  check(of2 && (of2.pub.trailers || []).some((x) => x.id === "xoffice01") && S.fiches.db()[of.id].dm === undefined && !now.some((a) => /office/i.test(a) && !a.startsWith("/dm/")), "…et Dailymotion, seul, pour la fiche où il n'avait pas répondu " + JSON.stringify(now.filter((a) => /office/i.test(a))));
  // fichier d'un dossier choisi sur l'appareil : la page demande la fiche au serveur (même recherche, même cache)
  const post = (p, b) => realFetch(`http://127.0.0.1:${S.port}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((x) => x.json());
  const lk = await post("/api/fiche-titre", { kind: "film", title: "La Soupe aux choux", year: 1981 });
  check(lk.ok && lk.item.yt === "AAAAAAAAAAA" && /^\/cover\/v[0-9a-f]+\?k=/.test(lk.item.cover || ""), "fiche demandée par la page pour son propre fichier");
  const lt = await post("/api/fiche-titre", { kind: "film", title: "1917", year: 2019 });
  check(lt.ok && (lt.item.trailers || [])[0] && lt.item.trailers[0].id === "FR1917TRL01", "…avec ses bandes-annonces (française d'abord)");
  const lc = await realFetch(`http://127.0.0.1:${S.port}${lk.item.cover}`);
  check(lc.status === 200 && imageType(Buffer.from(await lc.arrayBuffer())) === "jpg", "sa jaquette est servie");
  check(!(await post("/api/fiche-titre", { kind: "film", title: "Zzz Rien Du Tout" })).ok, "fiche demandée introuvable : rien d'inventé");
  // correction à la main
  const fx = by("Film Inconnu Xyz");
  const cx = await post(`/api/fiche/${fx.id}`, { query: "La Soupe aux choux" });
  check(cx.ok && /Bourbonnais/.test(cx.item.syn || ""), "fiche corrigée à la main avec un autre titre");
  // option coupée : plus rien ne part sur internet
  await post("/api/config", { fiches: false });
  check(S.cfg.fiches === false && !S.fichesOn(), "réglage coupé (Paramètres → Métadonnées)");
  put("Films/Nouveau Film 2020.mkv", "x");
  const b2 = asked.length; await S.rescan(); await wait(1500);
  check(asked.length === b2, "option coupée : aucune demande à internet, même pour un nouveau fichier");
  check((await post("/api/fiche-titre", { kind: "film", title: "La Soupe aux choux" })).off === true, "option coupée : la page ne peut pas faire chercher non plus");
  check((await realFetch(`http://127.0.0.1:${S.port}/bande-annonce?v=AAAAAAAAAAA`)).status === 403 && (await realFetch(`http://127.0.0.1:${S.port}/bande-annonce?site=dailymotion&v=x8abc12`)).status === 403, "option coupée : pas de bande-annonce d'internet (YouTube, Dailymotion)");
  sse.destroy(); await S.stop();

  // --- l'ordre de la file : les derniers ajouts, puis films et séries en alternance (comme les rangées de l'accueil) ---
  {
    const FQ = createFiches({ dataDir: path.join(T, "d4"), bases: { wikiFr: N + "/fr" }, fetch: f });
    const mk = (kind, title, mtime) => ({ id: kind[0] + title, kind, title, file: `/m/${title}.mkv`, pub: { mtime } });
    const films = Array.from({ length: 30 }, (_, i) => mk("film", `Film ${String.fromCharCode(65 + (i % 26))}${i}`, 1000 + i));
    const series = Array.from({ length: 4 }, (_, i) => mk("serie", `Série ${i}`, 10 + i));
    const jeux = [{ id: "gJeu", kind: "game", title: "Jeu", pub: { mtime: 5 } }];
    const L = films.concat(series, jeux), qo = FQ.queue(L);
    const recent = L.filter((x) => x.kind !== "album").sort((a, b) => b.pub.mtime - a.pub.mtime).slice(0, 20).map((x) => x.id);
    check(qo.slice(0, 20).join() === recent.join(), "file : les 20 derniers ajouts d'abord (rangée « Ajoutés récemment »)");
    // ensuite : chaque film et chaque série à sa place dans sa rangée (1er film, 1re série, 2e film, 2e série…)
    const rank = new Map(); for (const k of ["film", "serie"]) L.filter((x) => x.kind === k).sort((a, b) => a.title.localeCompare(b.title, "fr")).forEach((x, i) => rank.set(x.id, 2 * i + (k === "serie" ? 1 : 0)));
    const want = L.filter((x) => rank.has(x.id) && !recent.includes(x.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id)).map((x) => x.id);
    const rest = qo.slice(20).map((id) => id[0]).join("");
    check(qo.slice(20, -1).join() === want.join() && /^fs/.test(rest) && rest.indexOf("s") < 3 && qo[qo.length - 1] === "gJeu", "file : puis films et séries en alternance, chacun à sa place dans sa rangée (les séries ne passent plus après tous les films), les jeux ensuite " + rest);
  }
  // --- avec une clé TMDB : la bonne fiche parmi les homonymes, ses bandes-annonces françaises d'abord ---
  {
    const FT = createFiches({ dataDir: path.join(T, "d3"), bases: { ...bases, tmdb: N + "/tmdb", tmdbImg: N + "/tmdbimg" }, fetch: f, delay: 0, version: "essai" });
    const r = await FT.lookup({ kind: "film", title: "Le Film TMDB", year: 2020 }, "CLE-ESSAI", (id) => "/cover/" + id);
    const L = ((r && r.trailers) || []).map((x) => `${x.site}:${x.id}:${x.lang}`);
    check(r && r.tmdb === 42 && r.syn === "Un film trouvé sur TMDB.", "TMDB : le titre identique (pas la suite, premier résultat de la recherche)");
    check(L.join() === "youtube:TMDBFRTRL01:fr,youtube:TMDBFRTEAS1:fr,youtube:TMDBENTRL01:en,vimeo:123456789:en" && r.yt === "TMDBFRTRL01", "TMDB : bandes-annonces françaises puis anglaises (Vimeo compris), pas les coulisses " + JSON.stringify(L));
  }
  // REMBOBINE_FICHES=0 (essais) : jamais
  process.env.REMBOBINE_FICHES = "0";
  const S2 = createServer({ port: await freePort(), dataDir: path.join(T, "d2"), mediaRoots: [path.join(T, "m")], fetch: f, ficheDelay: 0, mbDelay: 0, ficheBases: bases });
  const b3 = asked.length; await S2.start(); await wait(1500);
  check(!S2.fichesOn() && asked.length === b3, "REMBOBINE_FICHES=0 : aucune demande");
  await S2.stop(); net.close(); fs.rmSync(T, { recursive: true, force: true });
  console.log(`Fiches : ${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
});
