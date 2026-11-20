// Test de la collection d'un jeu (boîte, manuel, cartouche) : node app/serveur/test_collection.js
// Fausse bibliothèque : trois versions d'un même jeu (Japon, USA, Europe), jaquettes avant/dos/tranche, manuel PDF et en images,
// cartouche, un fichier piégé (lien symbolique) ; puis ajouts depuis la fiche (types, taille, invités) et retrait.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const { createServer } = require("./serveur");
const { match } = require("./collection");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-coll-"));
const M = path.join(T, "media");
const put = (rel, data) => { const f = path.join(M, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]);
const PDF = Buffer.from("%PDF-1.4\n% faux manuel\n%%EOF\n");
const SECRET = path.join(T, "secret.png"); fs.writeFileSync(SECRET, PNG);
for (const r of ["Japan", "USA", "Europe"]) put(`Jeux/SNES/Etoile Filante (${r}).sfc`, Buffer.alloc(2048, 3));
put("Jeux/SNES/Etoile Filante 2 (Europe).sfc", Buffer.alloc(2048, 4));
put("Jeux/SNES/Etoile Filante (Japan).png", PNG);            // avant (jaquette de la bibliothèque)
put("Jeux/SNES/Etoile Filante (Japan)-dos.png", PNG);        // dos
put("Jeux/SNES/Etoile Filante (Japan)_spine.jpg", JPG);      // tranche
put("Jeux/SNES/Etoile Filante (USA) (back).png", PNG);       // dos, autre écriture
put("Jeux/SNES/Cartouches/Etoile Filante (Japan).png", PNG); // support
put("Jeux/SNES/Manuels/Etoile Filante (Japan).pdf", PDF);    // manuel de la version japonaise
put("Jeux/SNES/Manuels/Etoile Filante 1.jpg", JPG); put("Jeux/SNES/Manuels/Etoile Filante 2.jpg", JPG);   // manuel en images, toutes versions
put("Jeux/SNES/Etoile Filante 2.pdf", PDF);                  // ce n'est PAS le manuel du premier jeu
put("Jeux/SNES/Etoile Filante (Europe)-manuel.pdf", PDF);
fs.symlinkSync(SECRET, path.join(M, "Jeux", "SNES", "Etoile Filante (Europe)-cartouche.png"));   // lien piégé hors des médias

const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal);
if (!lan) { console.log("PAS D'ADRESSE RÉSEAU : test impossible ici"); process.exit(1); }
const PORT = 23000 + Math.floor(Math.random() * 900);
let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) ok++; else { ko++; console.log("ÉCHEC :", what); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function req(p, { body, raw, tok, host = lan.address, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const h = { ...headers }; if (tok) h.Authorization = "Bearer " + tok; if (body) h["Content-Type"] = "application/json";
    const r = http.request({ host, port: PORT, path: p, method: body || raw ? "POST" : "GET", headers: h }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => { const buf = Buffer.concat(ch); let json = null; try { json = JSON.parse(buf); } catch (_) {} resolve({ status: res.statusCode, headers: res.headers, buf, json }); });
    });
    r.on("error", (e) => resolve({ status: 0, err: e, json: null })); if (body) r.write(JSON.stringify(body)); if (raw) r.write(raw); r.end();
  });
}
const local = (p, o = {}) => req(p, { ...o, host: "127.0.0.1" });

(async () => {
  // noms reconnus
  const k = ["etoile filante japan", "etoile filante"];
  check(match("Etoile Filante (Japan)-dos", k, "", false).cat === "back", "« -dos » = dos de la boîte");
  check(match("etoile filante japan tranche", k, "", false).cat === "spine", "« tranche » = tranche");
  check(match("Etoile Filante 2", k, "manual", false) === null, "« Jeu 2 » posé à côté n'est pas une page du manuel (c'est peut-être un autre jeu)");
  check(match("Etoile Filante 2", k, "manual", true).page === 2, "… mais dans Manuels/, c'est la page 2");
  check(match("Etoile Filante (USA)-dos", k, "", false) === null, "le dos d'une autre version n'est pas pris");

  const S = createServer({ port: PORT, webDir: path.join(__dirname, "..", "..", "web"), dataDir: path.join(T, "data"), mediaRoots: [M], mpv: "/nonexistent", retroarch: "/nonexistent", version: "test", voisins: false });
  await S.start(); await wait(300);
  for (let i = 0; i < 50 && !S.lib.t; i++) await wait(100);
  const games = S.lib.items.filter((x) => x.kind === "game");
  const jp = games.find((x) => /Japan/.test(x.file)), us = games.find((x) => /\(USA\)/.test(x.file)), eu = games.find((x) => /Filante \(Europe\)/.test(x.file));
  check(games.length === 4 && jp && us && eu, "4 jeux trouvés (3 versions + la suite)");
  check(jp.pub.region === "Japon" && us.pub.region === "États-Unis" && eu.pub.region === "Europe", "régions reconnues");

  // sans clé : refusé
  check((await req(`/api/jeux/collection/${jp.id}`)).status === 401, "collection refusée sans appairage");
  await local("/api/pair/request", { body: { name: "Téléphone" } }); await wait(100);
  const tok = (await req("/api/pair", { body: { code: S.pairing.code, name: "Téléphone" } })).json.token;

  const cj = (await req(`/api/jeux/collection/${jp.id}`, { tok })).json;
  const cats = (c, cat) => c.files.filter((x) => x.cat === cat);
  check(cj.ok && cj.region === "Japon", "collection de la version japonaise");
  check(cats(cj, "front").length === 1 && cats(cj, "back").length === 1 && cats(cj, "spine").length === 1, "boîte : avant, dos, tranche");
  check(cats(cj, "cart").length === 1, "cartouche trouvée dans Cartouches/");
  const man = cats(cj, "manual");
  check(man.length === 3 && man.some((x) => x.kind === "pdf") && man.filter((x) => x.kind === "image").length === 2, "manuel : le PDF de la version et les pages en images communes");
  check(!man.some((x) => /Filante 2\.pdf$/.test(x.name)), "le PDF de « Etoile Filante 2 » n'est pas pris pour ce jeu");
  const cu = (await req(`/api/jeux/collection/${us.id}`, { tok })).json;
  check(cats(cu, "back").length === 1 && cats(cu, "front").length === 0 && cats(cu, "manual").length === 2, "version USA : son dos, pas d'avant, les pages communes du manuel");
  const ce = (await req(`/api/jeux/collection/${eu.id}`, { tok })).json;
  check(cats(ce, "manual").some((x) => x.kind === "pdf"), "version Europe : « -manuel.pdf »");

  // fichiers servis
  const pdf = man.find((x) => x.kind === "pdf"), fr = await req(pdf.url, { tok });
  check(fr.status === 200 && fr.headers["content-type"] === "application/pdf" && fr.headers["x-content-type-options"] === "nosniff", "le PDF est servi comme un PDF (jamais lu comme une page web)");
  check((await req(cats(cj, "back")[0].url, { tok })).headers["content-type"] === "image/png", "le dos est servi");
  const trap = cats(ce, "cart")[0];
  check(!trap || (await req(trap.url, { tok })).status === 404, "lien symbolique vers un fichier hors des médias : jamais servi");
  check((await req(`/api/jeux/collection/${jp.id}/f/99`, { tok })).status === 404, "numéro inconnu : 404");
  { const w = await req(`/api/jeux/collection/..%2F..%2Fetc/f/0`, { tok }); check(w.status !== 200 || !(w.json && w.json.files), "identifiant bizarre : refusé (" + w.status + " " + String(w.buf).slice(0, 80) + ")"); }

  // ajouts depuis la fiche
  const add = (id, cat, raw, t = tok, type = "image/png") => req(`/api/jeux/collection/${id}/add?cat=${cat}`, { tok: t, raw, headers: { "Content-Type": type } });
  const a1 = await add(us.id, "front", PNG);
  check(a1.json && a1.json.ok && cats(a1.json, "front").length === 1 && cats(a1.json, "front")[0].mine, "ajout d'un avant de boîte (PNG)");
  const a2 = await add(us.id, "manual", PDF, tok, "application/pdf");
  check(a2.json && a2.json.ok && cats(a2.json, "manual").some((x) => x.mine && x.kind === "pdf"), "ajout d'un manuel PDF");
  check((await add(us.id, "cart", PDF, tok, "application/pdf")).status === 415, "un PDF n'est pas une image de cartouche");
  check((await add(us.id, "back", Buffer.from("<html><script>alert(1)</script></html>"), tok, "image/png")).status === 415, "faux PNG (page web) : refusé, même avec le bon type annoncé");
  check((await add(us.id, "piege", PNG)).status === 400, "catégorie inconnue : refusée");
  const big = await add(us.id, "back", Buffer.concat([PNG, Buffer.alloc(26 * 1024 * 1024)]));
  check(big.status === 413 || big.status === 0, "fichier de plus de 25 Mo : refusé");
  check(fs.readdirSync(path.join(T, "data", "fiches", "collection", us.id)).length === 2, "seuls les 2 bons fichiers sont enregistrés, dans le dossier des fiches");

  // invité : regarde, n'ajoute pas
  S.cfg.invites = [{ code: "AMI123", until: Date.now() + 3600000 }];
  const g = (await req("/api/pair", { body: { invite: "AMI123", name: "Ami" } })).json;
  check((await req(`/api/jeux/collection/${us.id}`, { tok: g.token })).status === 200, "un invité voit la collection");
  check((await add(us.id, "back", PNG, g.token)).status === 403, "un invité ne peut rien ajouter");
  check((await req(`/api/jeux/collection/${us.id}/del`, { tok: g.token, body: { n: 0 } })).status === 403, "un invité ne peut rien retirer");

  // retrait : seulement les ajouts
  const now = (await req(`/api/jeux/collection/${jp.id}`, { tok })).json;
  check((await req(`/api/jeux/collection/${jp.id}/del`, { tok, body: { n: cats(now, "back")[0].n } })).json.ok === false && fs.existsSync(path.join(M, "Jeux/SNES/Etoile Filante (Japan)-dos.png")), "un fichier de la bibliothèque n'est jamais effacé");
  const cu2 = (await req(`/api/jeux/collection/${us.id}`, { tok })).json, mine = cu2.files.find((x) => x.mine && x.cat === "front");
  const d = (await req(`/api/jeux/collection/${us.id}/del`, { tok, body: { n: mine.n } })).json;
  check(d.ok && !d.files.some((x) => x.mine && x.cat === "front"), "un ajout se retire");

  await S.stop();
  console.log(`Collection : ${ok} OK, ${ko} échec(s)`);
  try { fs.rmSync(T, { recursive: true, force: true }); } catch (_) {}
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.log("ERREUR", e); process.exit(1); });
