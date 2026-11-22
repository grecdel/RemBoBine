// Test des jeux côté serveur : node app/serveur/test_jeux.js
// Fausse bibliothèque (aucun vrai jeu) : fiche tirée du nom de fichier et d'une base locale .dat, hacks et traductions,
// jeux à plusieurs disques (Disc 1/2 et .m3u), BIOS manquant ou présent, codes .cht, vidéo d'aperçu,
// sauvegardes synchronisées (la plus récente gagne, l'ancienne est gardée), manette du téléphone relayée à la TV, tournoi.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const { createServer } = require("./serveur");
const J = require("./jeux");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-jeux-"));
const M = path.join(T, "media");
const put = (rel, data) => { const f = path.join(M, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const blob = (n, v = 7) => Buffer.alloc(n, v);
put("Jeux/PlayStation/Grande Aventure (France) (Disc 1).chd", blob(3000, 1)); put("Jeux/PlayStation/Grande Aventure (France) (Disc 2).chd", blob(3000, 2));
put("Jeux/PlayStation/Grande Aventure (France) (Disc 1).png", "PNG");
put("Jeux/PlayStation/Quete/Quete (Disc 1).cue", "FILE"); put("Jeux/PlayStation/Quete/Quete (Disc 2).cue", "FILE"); put("Jeux/PlayStation/Quete/Quete.m3u", "Quete (Disc 1).cue\nQuete (Disc 2).cue\n");
put("Jeux/SNES/Turbo Kart (1994) [T-Fr].sfc", blob(2000)); put("Jeux/SNES/Turbo Kart (1994) [T-Fr].cht", 'cheats = 2\ncheat0_desc = "Vies infinies"\ncheat0_code = "7E0DBE:63"\ncheat0_enable = false\ncheat1_desc = "Temps"\ncheat1_code = "7E0F31:09"\ncheat1_enable = true\n');
put("Jeux/SNES/snaps/Turbo Kart (1994) [T-Fr].mp4", blob(500));
put("Jeux/Hacks/Super Plombier Deluxe [h1].sfc", blob(2000));
put("Jeux/PC Engine CD/Disque Mystere.chd", blob(1000));
put("Jeux/NES/Duel des Pixels.nes", blob(2000)); put("Jeux/NES/Duel des Pixels-preview.mp4", blob(400));
put("Bases/maxusers.dat", 'clrmamepro (\n\tname "Nintendo - NES - Maxusers"\n)\n\ngame (\n\tname "Duel des Pixels (Europe)"\n\tusers 2\n)\n\ngame (\n\tname "Turbo Kart (France)"\n\tusers 4\n\treleaseyear "1993"\n)\n');
put("BIOS/scph5501.bin", blob(512));

const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal);
if (!lan) { console.log("PAS D'ADRESSE RÉSEAU : test impossible ici"); process.exit(1); }
const PORT = 19000 + Math.floor(Math.random() * 900);
let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) ok++; else { ko++; console.log("ÉCHEC :", what); } };
function req(p, { body, raw, tok, host = lan.address, method } = {}) {
  return new Promise((resolve, reject) => {
    const h = {}; if (tok) h.Authorization = "Bearer " + tok; if (body) h["Content-Type"] = "application/json";
    const r = http.request({ host, port: PORT, path: p, method: method || (body || raw ? "POST" : "GET"), headers: h }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => { const buf = Buffer.concat(ch); let json = null; try { json = JSON.parse(buf); } catch (_) {} resolve({ status: res.statusCode, headers: res.headers, buf, json }); });
    });
    r.on("error", reject); if (body) r.write(JSON.stringify(body)); if (raw) r.write(raw); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- petites fonctions, sans serveur ---
const n1 = J.infoNom("Super Plombier (1991) [T-Fr v1.2] (Disc 2 of 3).sfc", "SNES");
check(n1.year === 1991 && n1.trad && n1.tradLang === "français" && n1.disc === 2 && !n1.hack, "nom de fichier : année, traduction, disque");
check(J.infoNom("Jeu (Hack).nes", "").hack && J.infoNom("Jeu.nes", "Rom Hacks/NES").hack && J.infoNom("Jeu.nes", "Traductions").trad, "hack et traduction par étiquette ou par dossier");
const ch = J.parseCht('cheats = 1\ncheat0_desc = "Argent"\ncheat0_code = "8001+FFFF"\ncheat0_enable = true\n');
check(ch.length === 1 && ch[0].desc === "Argent" && ch[0].code === "8001+FFFF" && ch[0].on, "lecture d'un fichier .cht");

(async () => {
  const S = createServer({ port: PORT, webDir: path.join(__dirname, "..", "..", "web"), dataDir: path.join(T, "data"), mediaRoots: [M], retroarch: "/nonexistent", version: "test" });
  await S.start(); await wait(400);
  // appairage d'un téléphone
  await req("/api/pair/request", { body: { name: "Téléphone de Léa" } });
  const tok = (await req("/api/pair", { body: { code: S.pairing.code, name: "Téléphone de Léa" } })).json.token;
  check(!!tok, "appairage");
  const L = (await req("/api/library", { tok })).json; const games = L.items.filter((x) => x.kind === "game");
  const by = (t) => games.find((x) => x.title.startsWith(t));
  const ga = by("Grande Aventure"), qu = by("Quete"), tk = by("Turbo Kart"), sp = by("Super Plombier"), pce = by("Disque Mystere"), dp = by("Duel des Pixels");
  check(games.filter((x) => /Grande Aventure/.test(x.title)).length === 1 && ga && ga.discs && ga.discs.length === 2, "deux disques → un seul jeu avec 2 disques");
  check(ga && ga.cover, "la jaquette du disque 1 sert au jeu");
  check(qu && qu.ext === "m3u" && qu.discs.length === 2 && !games.some((x) => x.ext === "cue"), "liste .m3u : les disques cités sont cachés");
  check(tk && tk.trad && tk.tradLang === "français" && tk.year === 1994 && tk.cht && tk.preview, "traduction, année, triche et aperçu reconnus");
  check(tk && tk.players === 4, "joueurs lus dans la base locale .dat");
  check(dp && dp.players === 2 && dp.preview, "base .dat (nom avec région) et aperçu « -preview »");
  check(sp && sp.hack, "dossier Hacks → hack");
  check(ga && ga.bios && ga.bios.key === "psx" && ga.bios.ok, "PlayStation : BIOS présent dans le dossier BIOS");
  check(pce && pce.bios && pce.bios.key === "pcecd" && !pce.bios.ok && pce.bios.requis, "PC Engine CD : BIOS manquant signalé");
  check(!games.some((x) => x.ext === "mp4"), "les vidéos d'aperçu ne deviennent pas des jeux");
  // disque 2 téléchargeable à part, BIOS servi, triche, aperçu
  const d2 = await req(`/media/${encodeURIComponent(ga.id + "~2")}?tok=${tok}`);
  check(d2.status === 200 && d2.buf.length === 3000 && d2.buf[0] === 2, "disque 2 servi à part");
  check(ga.bios.fichier === "scph5501.bin" && (await req(`/api/jeux/bios/${ga.id}/scph5501.bin`, { tok })).buf.length === 512, "BIOS PlayStation servi à l'émulateur intégré (avec son nom)");
  check((await req(`/api/jeux/bios/${pce.id}`, { tok })).status === 404, "BIOS absent → 404");
  const c = (await req(`/api/jeux/cht/${tk.id}`, { tok })).json;
  check(c && c.cheats.length === 2 && c.cheats[1].on && c.cheats[0].code === "7E0DBE:63", "codes .cht du jeu");
  check((await req(`/api/jeux/apercu/${tk.id}?tok=${tok}`)).buf.length === 500, "vidéo d'aperçu (dossier snaps) servie");
  check((await req(`/api/jeux/apercu/${tk.id}`)).status === 401, "aperçu refusé sans clé");

  // --- sauvegardes synchronisées ---
  const base = `/api/saves/${tk.id}`;
  const pl = (await req("/api/game", { body: { id: pce.id }, tok })).json;
  check(pl && pl.ok === false && /dossier BIOS/.test(pl.err), "lancement refusé avec un message clair quand le BIOS manque");
  put("BIOS/syscard3.pce", blob(256));
  check(/émulateur intégré|écran/.test(JSON.stringify((await req("/api/game", { body: { id: pce.id }, tok })).json)), "BIOS ajouté : le lancement passe (sans rescanner)");

  let r = await req(`${base}/state/1?profil=L%C3%A9a&at=1000&dev=tel`, { raw: Buffer.from("ETAT-A"), tok });
  check(r.json && r.json.ok, "envoi d'une sauvegarde rapide");
  r = await req(`${base}/state/1?profil=L%C3%A9a&at=900`, { raw: Buffer.from("ETAT-VIEUX"), tok });
  check(r.json && r.json.ok === false && r.json.newer && r.json.at === 1000, "une copie plus ancienne est refusée (la plus récente gagne)");
  r = await req(`${base}/state/1?profil=L%C3%A9a&at=2000`, { raw: Buffer.from("ETAT-B"), tok });
  check(r.json && r.json.ok, "une copie plus récente remplace");
  const got = await req(`${base}/state/1?profil=L%C3%A9a`, { tok });
  check(got.buf.toString() === "ETAT-B" && got.headers["x-rbb-at"] === "2000", "on relit la plus récente");
  const kd = path.join(T, "data", "sauvegardes", "Lea", tk.id, "anciennes");
  check(fs.existsSync(kd) && fs.readdirSync(kd).some((n) => n === "state-1-1000.bin"), "l'ancienne est gardée de côté");
  await req(`${base}/srm/0?profil=Tom&at=5`, { raw: Buffer.from("SRAM"), tok });
  const ls = (await req(`${base}?profil=L%C3%A9a`, { tok })).json.list;
  check(ls.length === 1 && ls[0].kind === "state" && ls[0].at === 2000, "liste par profil (Léa ne voit pas la pile de Tom)");
  check((await req(`/api/saves/${tk.id}/srm/0?profil=Tom`, { tok })).buf.toString() === "SRAM", "pile de sauvegarde (.srm) de Tom");
  check((await req(`${base}/state/1?profil=Lea&at=3000`, { raw: Buffer.alloc(65 * 1024 * 1024), tok })).status === 413, "fichier trop gros refusé");

  // --- manette du téléphone : la TV reçoit les touches ---
  const tvEv = [];
  const sse = http.get({ host: "127.0.0.1", port: PORT, path: "/api/stream" }, (res) => { res.on("data", (d) => String(d).split("\n").forEach((l) => { if (l.startsWith("data: ")) try { tvEv.push(JSON.parse(l.slice(6))); } catch (_) {} })); });
  await wait(300);
  const j1 = (await req("/api/pad", { body: { dev: "tel-lea", name: "Léa" }, tok })).json;
  check(j1.ok && j1.seat === 1 && j1.tv, "le téléphone prend la manette 1 (TV allumée)");
  const j2 = (await req("/api/pad", { body: { dev: "tel-tom", name: "Tom", seat: 1 }, tok })).json;
  check(!j2.ok && /déjà prise/.test(j2.err), "manette 1 déjà prise");
  const j3 = (await req("/api/pad", { body: { dev: "tel-tom", name: "Tom", seat: 2 }, tok })).json;
  check(j3.ok && j3.seat === 2, "un ami prend la manette 2");
  const taps = []; const tap = (ev) => taps.push(ev); S.tvTaps.add(tap);   // le relais vers le module (app/main.js)
  await req("/api/pad/in", { body: { s: 2, e: [[8, 1], [8, 0], [99, 1]] }, tok });
  await wait(200);
  S.tvTaps.delete(tap);
  check(taps.some((e) => e.type === "padin" && e.s === 2 && e.e.length === 3), "le module peut recevoir les touches du téléphone (relais local)");
  const pin = tvEv.find((e) => e.type === "padin");
  check(pin && pin.s === 2 && pin.e.length === 3 && pin.e[0][0] === 8 && pin.e[0][1] === 1 && pin.e[2][0] === 29, "la TV reçoit les touches du joueur 2 (bornées)");
  check(tvEv.some((e) => e.type === "pads" && e.seats.length === 2), "la TV sait qui tient quelle manette");
  check((await req("/api/pad", { tok })).json.seats.map((s) => s.name).join() === "Léa,Tom", "liste des manettes");
  await req("/api/pad", { body: { dev: "tel-tom", leave: true }, tok });
  check((await req("/api/pad", { tok })).json.seats.length === 1, "rendre sa manette");
  sse.destroy();

  // --- tournoi ---
  await req(`/api/jeux/scores/${tk.id}`, { body: { who: "Léa", v: 12500, mode: "score", at: 10 }, tok });
  await req(`/api/jeux/scores/${tk.id}`, { body: { who: "Tom", v: 83.4, mode: "temps", at: 11, auto: true }, tok });
  const sc = (await req(`/api/jeux/scores/${tk.id}`, { tok })).json.list;
  check(sc.length === 2 && sc.some((x) => x.who === "Tom" && x.mode === "temps" && x.auto), "scores et temps enregistrés");
  check(JSON.parse(fs.readFileSync(path.join(T, "data", "tournoi.json"), "utf8"))[tk.id].length === 2, "tournoi gardé sur le disque");

  await S.stop();
  fs.rmSync(T, { recursive: true, force: true });
  console.log(`${ok} vérifications réussies, ${ko} échec${ko > 1 ? "s" : ""}`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
