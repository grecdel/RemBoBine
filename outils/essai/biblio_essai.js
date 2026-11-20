#!/usr/bin/env node
// Une fausse bibliothèque réaliste + le vrai serveur de la maison, pour essayer la page comme chez le propriétaire
// (beaucoup de films, des séries, des jaquettes manquantes, des courts-métrages numérotés…), sans internet.
//
//   node outils/essai/biblio_essai.js <dossier> [--port=18090] [--films=140] [--series=14] [--sans=0.25] [--fiches]
//
// Fabrique <dossier>/medias (petites vidéos de 2 s, jaquettes dessinées par ImageMagick), démarre le serveur
// (app/serveur) qui sert aussi la page : ouvrir http://127.0.0.1:<port>/ (dans Playwright, par exemple). La page
// y trouve toute seule la bibliothèque (gbxFind → location.origin). Reste ouvert jusqu'à Ctrl+C ; écrit « PRÊT <url> ».
//   --fiches : recherche des fiches sur internet activée (sinon REMBOBINE_FICHES=0, aucune requête vers l'extérieur)
//   --externe : une seconde racine « disque externe » (<dossier>/externe), pour les essais de disque débranché
//               (fabriquée une fois : renommer ensuite le dossier « externe » = disque débranché, le remettre = rebranché)
// Les titres sont inventés (aucun vrai film).
"use strict";
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");

const args = process.argv.slice(2), dir = path.resolve(args.find((a) => !a.startsWith("--")) || "biblio-essai");
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PORT = Number(opt("port", 18090)), NF = Number(opt("films", 140)), NS = Number(opt("series", 14)), SANS = Number(opt("sans", 0.25));
const MED = path.join(dir, "medias"), EXT = path.join(dir, "externe"), DATA = path.join(dir, "data");
const R = path.resolve(__dirname, "..", "..");

const MOTS1 = ["Les Marées", "Minuit pile", "Orage d'été", "La Dernière Séance", "Ligne 7", "Hors saison", "Le Grand Saut", "Été 86",
  "Bleu nuit", "Cap au sud", "Aube rouge", "Avis de tempête", "Belle étoile", "Boréal", "Brume", "Bruit blanc", "Carte blanche",
  "Le Passage", "Nuit claire", "Contre-courant", "Le Phare", "Les Veilleurs", "Quai 9", "Radio fantôme", "Marée basse",
  "Le Cartographe", "Neige sur Lisbonne", "Station Orion", "Le Dernier Tramway", "Les Frères Vallon", "Atlas", "Azur",
  "Bal masqué", "Balade nocturne", "Bord de mer", "Après la pluie", "Aller simple", "Au large", "Aux quatre vents", "Avant minuit"];
const SUITE = ["", " 2", " : le retour", " : la fin", " III"];
const GENRES = ["#35506b", "#5b3a57", "#6a4a2f", "#2f5a4c", "#4a4f7a", "#7a3f3a", "#3d6170", "#6b5a2a"];
const SERIES = ["Cap au nord", "Les Voisins", "Atelier 12", "Nuit blanche", "Quai des brumes", "La Relève", "Zone rouge", "Petits Matins",
  "Le Bureau d'à côté", "Grand Large", "Les Oubliés", "Station 7", "La Brigade", "Fil rouge", "Les Saisons", "Vent d'ouest"];
const COURTS = ["02 Presto", "03 Mini Turbo", "04 Passages Nuageux", "05 Doug En Mission", "06 Jour Et Nuit", "07 Vacances Bleues", "08 Air Martin", "10 Mini Buzz"];

function sh(cmd, a) { const r = spawnSync(cmd, a, { encoding: "utf8" }); return r.status === 0; }
function cover(file, title, i) {
  const c = GENRES[i % GENRES.length];
  // une affiche simple : dégradé, bande de couleur, titre (si la police manque : sans texte)
  if (!sh("convert", ["-size", "300x450", `gradient:${c}-#0b0c10`, "-fill", "#f3f1ed", "-font", "DejaVu-Sans-Bold", "-pointsize", "30",
    "-gravity", "south", "-annotate", "+0+40", title.replace(/[%\\]/g, ""), "-quality", "82", file])) sh("convert", ["-size", "300x450", `gradient:${c}-#0b0c10`, file]);
}
function main() {
  fs.mkdirSync(MED, { recursive: true }); fs.mkdirSync(DATA, { recursive: true });
  const clip = path.join(dir, "clip.mp4");
  if (!fs.existsSync(clip) && !sh("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=12:duration=2", "-f", "lavfi", "-i",
    "sine=frequency=440:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "36", "-c:a", "aac", "-shortest", clip])) throw new Error("ffmpeg introuvable");
  if (!fs.existsSync(path.join(MED, "Films"))) {
    let n = 0;
    for (let i = 0; n < NF; i++) {
      const t = MOTS1[i % MOTS1.length] + SUITE[Math.floor(i / MOTS1.length) % SUITE.length], y = 1975 + ((i * 7) % 50), name = `${t} (${y})`;
      const d = path.join(MED, "Films", name); fs.mkdirSync(d, { recursive: true });
      fs.copyFileSync(clip, path.join(d, `${name}.mp4`));
      if ((i * 37) % 100 >= SANS * 100) cover(path.join(d, "poster.jpg"), t, i);
      const old = new Date(Date.now() - (NF - n) * 3600e3); fs.utimesSync(path.join(d, `${name}.mp4`), old, old);
      n++;
    }
    const dc = path.join(MED, "Films", "Courts-métrages"); fs.mkdirSync(dc, { recursive: true });
    for (const c of COURTS) fs.copyFileSync(clip, path.join(dc, `${c}.mp4`));
    for (let s = 0; s < NS; s++) {
      const t = SERIES[s % SERIES.length], d = path.join(MED, "Séries", s % 3 === 0 ? `${t} (${2010 + s})` : t);
      for (let sa = 1; sa <= 1 + (s % 3); sa++) {
        const ds = path.join(d, `Saison ${sa}`); fs.mkdirSync(ds, { recursive: true });
        for (let e = 1; e <= 4 + (s % 5); e++) fs.copyFileSync(clip, path.join(ds, `${t.replace(/[' ]/g, ".")}.S${String(sa).padStart(2, "0")}E${String(e).padStart(2, "0")}.mp4`));
      }
      if (s % 4 !== 1) cover(path.join(d, "folder.jpg"), t, s + 3);
    }
  }
  const roots = [MED];
  if (args.includes("--externe")) {
    // fabriqué une seule fois : ensuite, renommer le dossier « externe » simule un disque débranché (il n'est pas refait)
    const mark = path.join(dir, ".externe-fabrique");
    if (!fs.existsSync(mark)) {
      const de = path.join(EXT, "Films", "Le Disque Externe (2001)"); fs.mkdirSync(de, { recursive: true });
      if (!fs.existsSync(path.join(de, "Le Disque Externe (2001).mp4"))) { fs.copyFileSync(clip, path.join(de, "Le Disque Externe (2001).mp4")); cover(path.join(de, "poster.jpg"), "Le Disque Externe", 5); }
      fs.writeFileSync(mark, "");
    }
    roots.push(EXT);
  }
  if (!args.includes("--fiches")) process.env.REMBOBINE_FICHES = "0";
  const { createServer } = require(path.join(R, "app", "serveur", "serveur"));
  const S = createServer({ port: PORT, webDir: path.join(R, "web"), dataDir: DATA, mediaRoots: roots, version: "essai", watch: false });
  S.start().then(() => console.log(`PRÊT http://127.0.0.1:${PORT}/`));
  const stop = () => { S.stop().catch(() => {}).finally(() => process.exit(0)); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
}
main();
