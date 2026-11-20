// Test de la bibliothèque, suite : node app/serveur/test_biblio.js
// Fausse bibliothèque (bandes-annonces, bonus, film en 2 morceaux, affiches de saison, titres d'épisodes, nom technique)
// et faux internet (TMDB, Wikipédia) : on vérifie ce que le serveur range, les affiches proposées et le renommage annulable.
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const { createServer } = require("./serveur");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-biblio-"));
const M = path.join(T, "m");
const put = (rel, d = "x") => { const f = path.join(M, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, d); };
put("Films/Le Grand Bleu (1988)/Le Grand Bleu (1988).mkv", Buffer.alloc(3000));
put("Films/Le Grand Bleu (1988)/Le Grand Bleu (1988)-trailer.mp4");
put("Films/Le Grand Bleu (1988)/Trailers/teaser.mp4");
put("Films/Le Grand Bleu (1988)/Extras/Plongée en apnée.mkv");
put("Films/Le Grand Bleu (1988)/Le Grand Bleu (1988)-behindthescenes.mkv");
put("Films/Le Grand Bleu (1988)/Featurettes/Le tournage.mkv");
put("Films/La Longue Route (1999)/La.Longue.Route.CD1.avi", Buffer.alloc(1000));
put("Films/La Longue Route (1999)/La.Longue.Route.CD2.avi", Buffer.alloc(1500));
put("Films/Horizon.Rouge.2021.1080p.BluRay.x264.mkv", Buffer.alloc(500)); put("Films/Horizon.Rouge.2021.1080p.BluRay.x264.fr.srt", "1");
put("Films/Horizon Rouge (2021) 2160p.mkv", Buffer.alloc(900));
put("Films/Enfants/Le Petit Nuage (2015)/nuage.mkv");
put("Series/Les Veilleurs/season01-poster.jpg", "JPG-S1");
put("Series/Les Veilleurs/Saison 2/poster.jpg", "JPG-S2");
put("Series/Les Veilleurs/Saison 1/Les.Veilleurs.S01E01.Le.Phare.1080p.mkv");
put("Series/Les Veilleurs/Saison 1/Les.Veilleurs.S01E02.mkv"); put("Series/Les Veilleurs/Saison 1/Les.Veilleurs.S01E02.nfo", "<episodedetails><title>La Tempête</title></episodedetails>");
put("Series/Les Veilleurs/Saison 2/Les.Veilleurs.S02E01.mkv");
put("Series/Les Veilleurs/Extras/Bêtisier.mkv");
put("Series/Les Revenants/S01E01.mkv"); put("Series/Les Revenants/S01E02.mkv");

// faux internet
const IMG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF]), Buffer.alloc(400, 3)]);
const net = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x"), p = decodeURIComponent(u.pathname);
  const json = (o) => { r.writeHead(200, { "Content-Type": "application/json" }); r.end(JSON.stringify(o)); };
  if (p.endsWith("/w/api.php")) { if (u.searchParams.get("meta")) return json({ query: {} }); return json({ query: { search: /grand bleu/i.test(u.searchParams.get("srsearch")) ? [{ title: "Le Grand Bleu (film)", snippet: "film 1988" }] : [] } }); }
  if (p.includes("/api/rest_v1/page/summary/")) return json({ type: "standard", description: "film de 1988", extract: "Un film.", originalimage: { source: `http://127.0.0.1:${net.address().port}/img/wiki-${p.startsWith("/en") ? "en" : "fr"}.jpg` } });
  if (p === "/tmdb/3/search/movie") return json({ results: [{ id: 11, title: "Le Grand Bleu", release_date: "1988-05-11", poster_path: "/a.jpg" }, { id: 12, title: "Le Grand Bleu 2", release_date: "2001-01-01", poster_path: "/b.jpg" }] });
  if (p === "/tmdb/3/search/tv") return json({ results: [{ id: 77, name: "Les Revenants" }] });
  if (p === "/tmdb/3/movie/11/images") return json({ posters: [{ file_path: "/c.jpg" }, { file_path: "/a.jpg" }] });
  if (p === "/tmdb/3/movie/11" || p === "/tmdb/3/tv/77") return json({ id: 77, name: "Les Revenants", overview: "Une série.", first_air_date: "2012-11-26", genres: [], credits: { cast: [], crew: [] } });
  if (p === "/tmdb/3/tv/77/season/1") return json({ poster_path: "/s1.jpg", episodes: [{ episode_number: 1, name: "Camille" }, { episode_number: 2, name: "Simon" }] });
  if (p.startsWith("/tmdbimg/") || p.startsWith("/img/")) { r.writeHead(200, { "Content-Type": "image/jpeg" }); return r.end(IMG); }
  r.writeHead(404); r.end();
});
let ok = 0, ko = 0;
const check = (c, w) => { if (c) ok++; else { ko++; console.log("ÉCHEC :", w); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
net.listen(0, async () => {
  const N = `http://127.0.0.1:${net.address().port}`;
  const PORT = 18000 + Math.floor(Math.random() * 900);
  const S = createServer({ port: PORT, dataDir: path.join(T, "d"), mediaRoots: [M], ficheDelay: 0, mbDelay: 0,
    ficheBases: { wikiFr: N + "/fr", wikiEn: N + "/en", mb: N + "/mb", caa: N + "/caa", libretro: N + "/libretro", tmdb: N + "/tmdb", tmdbImg: N + "/tmdbimg" } });
  S.cfg.tmdbKey = "cle-de-test";
  await S.start(); await wait(200);
  const get = (p, body) => new Promise((res, rej) => { const r = http.request({ host: "127.0.0.1", port: PORT, path: p, method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {} }, (x) => { const ch = []; x.on("data", (d) => ch.push(d)); x.on("end", () => { const b = Buffer.concat(ch); let j = null; try { j = JSON.parse(b); } catch (_) {} res({ status: x.statusCode, json: j, buf: b }); }); }); r.on("error", rej); if (body) r.write(JSON.stringify(body)); r.end(); });
  let lib = (await get("/api/library")).json;
  const by = (k, t) => lib.items.find((x) => x.kind === k && x.title === t);
  const films = lib.items.filter((x) => x.kind === "film");
  // bandes-annonces et bonus
  const gb = by("film", "Le Grand Bleu");
  check(gb && !films.some((x) => /teaser|trailer|Plongée|tournage|behind/i.test(x.title)), "bandes-annonces et bonus ne comptent pas comme des films");
  check(gb && gb.trailer, "bande-annonce trouvée à côté du film");
  check(gb && gb.extras && gb.extras.length === 3 && gb.extras.some((x) => x.title === "Coulisses") && gb.extras.some((x) => x.title === "Plongée en apnée") && gb.extras.some((x) => x.title === "Le tournage"), "bonus rangés sous le film (Extras, Featurettes, -behindthescenes)");
  check(gb && (await get(`/media/${gb.extras[0].id}`)).status === 200, "un bonus se lit");
  // film en deux morceaux
  const lr = by("film", "La Longue Route");
  check(lr && lr.year === 1999 && lr.parts && lr.parts.length === 2 && lr.size === 2500, "film CD1/CD2 = un seul film, taille des deux morceaux");
  check(films.filter((x) => /Longue Route/.test(x.title)).length === 1, "le deuxième morceau n'apparaît pas seul");
  // qualité, taille, date, enfants
  const hr = films.filter((x) => x.title === "Horizon Rouge");
  check(hr.length === 2 && hr.some((x) => x.quality === "1080p") && hr.some((x) => x.quality === "4K") && hr.every((x) => x.size > 0 && x.mtime > 0), "deux versions d'Horizon Rouge avec leur qualité, taille et date (doublon)");
  check(by("film", "Le Petit Nuage") && by("film", "Le Petit Nuage").kids === true, "dossier « Enfants » repéré");
  // le dossier de chaque titre, relatif à sa racine (« Un dossier » de Personnaliser l'accueil), jamais le chemin du disque
  check(by("film", "Le Petit Nuage").dir === "Films/Enfants/Le Petit Nuage (2015)" && by("film", "Le Grand Bleu").dir === "Films/Le Grand Bleu (1988)" && by("serie", "Les Veilleurs").dir === "Series/Les Veilleurs"
    && lib.items.every((x) => !x.dir || (!x.dir.startsWith("/") && !x.dir.includes("\\") && !x.dir.includes(".."))), "dossier de chaque titre (relatif à sa racine) pour « Un dossier »");
  // séries : affiches de saison, titres d'épisodes, bonus exclus
  const ve = by("serie", "Les Veilleurs");
  check(ve && ve.episodes.length === 3, "le bêtisier (Extras) n'est pas un épisode");
  check(ve && ve.seasonPosters && ve.seasonPosters[1] && ve.seasonPosters[2], "affiches des saisons 1 et 2");
  check(ve && (await get(ve.seasonPosters[2])).buf.toString() === "JPG-S2", "l'affiche de la saison 2 est servie");
  check(ve && ve.episodes[0].name === "Le Phare" && ve.episodes[1].name === "La Tempête", "titres d'épisodes : nom du fichier et .nfo");
  // titres d'épisodes et affiche de saison sur TMDB (clé réglée, option des fiches active)
  for (let i = 0; i < 40; i++) { await wait(150); lib = (await get("/api/library")).json; const rv = by("serie", "Les Revenants"); if (rv && rv.episodes[0].name) break; }
  const rv = by("serie", "Les Revenants");
  check(rv && rv.episodes[0].name === "Camille" && rv.episodes[1].name === "Simon" && rv.seasonPosters && rv.seasonPosters[1], "TMDB : titres d'épisodes et affiche de saison");
  // affiches proposées
  const ps = (await get(`/api/fiche/${gb.id}/posters`, { query: "Le Grand Bleu" })).json;
  check(ps && ps.ok && ps.list.length >= 4 && ps.list.some((x) => /Wikipédia/.test(x.label)) && ps.list.some((x) => /TMDB/.test(x.label)), "plusieurs affiches proposées (TMDB et Wikipédia)");
  check((await get(ps.list[1].url)).buf.length > 300, "aperçu d'une affiche proposée");
  const ch = (await get(`/api/fiche/${gb.id}/poster`, { i: 1 })).json;
  lib = (await get("/api/library")).json;
  check(ch && ch.ok && /&v=\d+/.test(by("film", "Le Grand Bleu").cover), "affiche choisie appliquée");
  // renommage
  const rn = (await get("/api/rename")).json;
  const sug = rn.list.find((x) => /Horizon\.Rouge\.2021/.test(x.from));
  check(sug && sug.to === "Horizon Rouge (2021).mkv", "nom propre proposé : « Horizon Rouge (2021).mkv »");
  check(!rn.list.some((x) => /Grand Bleu/.test(x.from)), "pas de proposition pour un nom déjà propre");
  check((await get("/api/rename", { id: sug.id, name: sug.to })).json.ok === false && fs.existsSync(path.join(M, "Films/Horizon.Rouge.2021.1080p.BluRay.x264.mkv")), "sans confirmation : rien n'est renommé");
  S.prog[sug.id] = { pos: 600, dur: 6000, t: 1 };
  const done = (await get("/api/rename", { id: sug.id, name: sug.to, confirm: true })).json;
  check(done && done.ok && fs.existsSync(path.join(M, "Films/Horizon Rouge (2021).mkv")) && fs.existsSync(path.join(M, "Films/Horizon Rouge (2021).fr.srt")), "renommé avec ses sous-titres, après confirmation");
  check(!S.prog[sug.id] && Object.values(S.prog).some((x) => x.pos === 600), "la reprise suit le fichier renommé");
  const j = (await get("/api/rename")).json.journal;
  check(j.length === 1 && j[0].files === 2, "journal des renommages");
  const un = (await get("/api/rename/undo", { n: j[0].n, confirm: true })).json;
  check(un && un.ok && fs.existsSync(path.join(M, "Films/Horizon.Rouge.2021.1080p.BluRay.x264.mkv")) && fs.existsSync(path.join(M, "Films/Horizon.Rouge.2021.1080p.BluRay.x264.fr.srt")) && (await get("/api/rename")).json.journal.length === 0, "annulation : les noms d'origine reviennent");
  check((await get("/api/rename", { id: sug.id, name: "../../evasion.mkv", confirm: true })).json.ok !== true || fs.existsSync(path.join(M, "Films/evasion.mkv")), "un nom avec « ../ » reste dans le même dossier");
  console.log(`Bibliothèque : ${ok} OK, ${ko} échec(s)`);
  S.stop && S.stop(); net.close(); setTimeout(() => process.exit(ko ? 1 : 0), 100);
});
