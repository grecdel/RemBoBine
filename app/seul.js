// Rembobine — « lecteur seul » : ouvrir UN fichier (vidéo, musique, jeu) depuis « Ouvrir avec » ou en double-cliquant,
// sans la médiathèque. Ce fichier ne contient que la logique (sans Electron), pour être essayée par
// app/serveur/test_lecteur_seul.js : quel fichier est demandé, quel lecteur l'ouvre, la reprise, les morceaux du même
// dossier, et le réglage « lecteur par défaut » (Linux : xdg-mime ; Windows : inscription « Ouvrir avec » + page des
// applications par défaut de Windows).
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const lazy = (f) => { let v; return () => (v === undefined ? (v = f()) : v); };
const BIB = lazy(() => require("./serveur/bibliotheque"));
const CS = lazy(() => require("./serveur/consoles"));
const JX = lazy(() => require("./serveur/jeux"));

// ---------- les extensions ----------
const VIDEO = ["mkv", "mp4", "m4v", "avi", "mov", "webm", "ts", "m2ts", "mts", "mpg", "mpeg", "wmv", "flv", "ogv", "3gp", "vob", "divx"];
const MUSIQUE = ["mp3", "flac", "ogg", "oga", "opus", "m4a", "aac", "wav", "wma", "aiff", "aif", "alac", "ape", "mka"];
// l'émulateur intégré (EmulatorJS) : extension → cœur (même table que la page Rembobine, bloc « l'émulateur intégré »)
const EJS = { nes: "nes", fds: "nes", sfc: "snes", smc: "snes", gba: "gba", gb: "gb", gbc: "gb", md: "segaMD", gen: "segaMD", smd: "segaMD", sms: "segaMS", gg: "segaGG",
  n64: "n64", z64: "n64", v64: "n64", nds: "nds", pce: "pce", a26: "atari2600", a78: "atari7800", vb: "vb", vboy: "vb", ngp: "ngp", ngc: "ngp", ws: "ws", wsc: "ws",
  "32x": "sega32x", chd: "psx", pbp: "psx", d64: "c64", t64: "c64", prg: "c64", crt: "c64", tzx: "fuse", z80: "fuse", tap: "fuse", cdt: "cap32", dsk: "cap32" };
const EJS_NOM = { nes: "NES", snes: "Super Nintendo", gba: "Game Boy Advance", gb: "Game Boy", segaMD: "Mega Drive", segaMS: "Master System", segaGG: "Game Gear", n64: "Nintendo 64",
  nds: "Nintendo DS", pce: "PC Engine", atari2600: "Atari 2600", atari7800: "Atari 7800", vb: "Virtual Boy", ngp: "Neo Geo Pocket", ws: "WonderSwan", sega32x: "Sega 32X",
  psx: "PlayStation", c64: "Commodore 64", fuse: "ZX Spectrum", cap32: "Amstrad CPC", arcade: "Arcade" };
// les images de disque des consoles récentes (consoles.js) et celles qu'il faut regarder de près (.iso)
const DISQUES = ["iso", "cso", "rvz", "wbfs", "gcm", "gcz", "ciso", "wad", "xiso", "xex", "img", "cue"];
const JEUX = [...Object.keys(EJS), ...DISQUES, "zip", "7z"];
// pour « Ouvrir avec » : pas les extensions trop communes à d'autres usages (archives, certificats, disques d'installation)
const PAS_ASSOCIEES = new Set(["zip", "7z", "crt", "img", "tap", "dsk", "prg"]);
const ASSOCIEES = { video: VIDEO, musique: MUSIQUE, jeu: JEUX.filter((e) => !PAS_ASSOCIEES.has(e)) };

const ext = (f) => path.extname(String(f || "")).slice(1).toLowerCase();
function genre(file) {
  const e = ext(file);
  if (VIDEO.includes(e)) return "video";
  if (MUSIQUE.includes(e)) return "musique";
  if (JEUX.includes(e)) return "jeu";
  return null;
}

// ---------- le fichier demandé au lancement ----------
// Linux (.desktop « %U ») : file:///chemin%20avec%20espaces ; Windows : "C:\…\film.mkv" ; macOS : évènement open-file.
// On ne garde que les vrais fichiers d'un genre connu (jamais un dossier, une option « --kiosk », ni le dossier de l'appli).
function versChemin(a, cwd) {
  let s = String(a || "").trim();
  if (!s || s.startsWith("-")) return "";
  if (/^file:/i.test(s)) { try { s = require("url").fileURLToPath(s); } catch (_) { return ""; } }
  else if (/^[a-z][a-z0-9+.-]+:\/\//i.test(s)) return "";   // une adresse d'internet : jamais
  return path.resolve(cwd || process.cwd(), s);
}
function fichierDesArgs(argv, cwd) {
  const args = Array.isArray(argv) ? argv.slice(1) : [];
  let trouve = "";
  for (const a of args) {
    const p = versChemin(a, cwd); if (!p || !genre(p)) continue;
    try { if (fs.statSync(p).isFile()) trouve = p; } catch (_) {}
  }
  return trouve;
}

// ---------- titres ----------
function titre(file) {
  const base = path.basename(file);
  try { const t = BIB().cleanTitle(base); if (t && t.title) return t.year ? `${t.title} (${t.year})` : t.title; } catch (_) {}
  return base.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").trim();
}
// un morceau : « 03 - Artiste - Titre.flac » → « Titre » (le numéro de piste et l'artiste répété partent)
function titreMorceau(file, artiste) {
  let t = path.basename(file).replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  t = t.replace(/^(\d{1,3}|[a-d]\d{1,2})(\s*[-.)]\s*|\s+)/i, "");
  if (artiste) { const a = artiste.toLowerCase(); if (t.toLowerCase().startsWith(a + " - ")) t = t.slice(a.length + 3); }
  return t.trim() || path.basename(file);
}
// l'album et l'artiste d'après les dossiers : « Artiste - Album/ » ou « Artiste/Album/ »
function infoAlbum(file) {
  const d = path.basename(path.dirname(file)), p = path.basename(path.dirname(path.dirname(file)));
  const m = /^(.+?)\s+-\s+(.+)$/.exec(d);
  const clean = (s) => s.replace(/^\s*\(?((19|20)\d\d)\)?\s*[-.]\s*/, "").replace(/\s*[([]((19|20)\d\d)[)\]]\s*$/, "").trim();
  if (m) return { artiste: m[1].trim(), album: clean(m[2]) };
  const generique = /^(musiques?|music|t[ée]l[ée]chargements?|downloads?|bureau|desktop|home|users?|[a-z]:)$/i;
  return { artiste: p && !generique.test(p) && p !== path.parse(file).root ? p : "", album: generique.test(d) ? "" : clean(d) };
}

// ---------- musique : les autres morceaux du même dossier, à la suite ----------
const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
function morceauxDuDossier(file) {
  const dir = path.dirname(file);
  let noms = []; try { noms = fs.readdirSync(dir); } catch (_) {}
  const liste = noms.filter((n) => MUSIQUE.includes(ext(n)) && !n.startsWith(".")).sort(collator.compare).map((n) => path.join(dir, n));
  if (!liste.includes(file)) liste.unshift(file);
  const { artiste, album } = infoAlbum(file);
  return { album, artiste, index: liste.indexOf(file), pistes: liste.slice(0, 400).map((f) => ({ file: f, titre: titreMorceau(f, artiste) })) };
}
// une pochette posée dans le dossier
function pochette(file) {
  const dir = path.dirname(file);
  let noms = []; try { noms = fs.readdirSync(dir); } catch (_) { return ""; }
  const img = noms.filter((n) => /\.(jpe?g|png|webp)$/i.test(n));
  const pref = ["cover", "folder", "front", "album", "pochette", "jaquette"];
  for (const p of pref) { const f = img.find((n) => n.toLowerCase().replace(/\.[^.]+$/, "") === p); if (f) return path.join(dir, f); }
  return img.length === 1 ? path.join(dir, img[0]) : "";
}

// ---------- vidéo : sous-titres posés à côté (« Film.srt », « Film.fr.srt », « Film.forced.ass ») ----------
function sousTitres(file) {
  const dir = path.dirname(file), base = path.basename(file).replace(/\.[^.]+$/, "").toLowerCase();
  let noms = []; try { noms = fs.readdirSync(dir); } catch (_) {}
  return noms.filter((n) => /\.(srt|vtt|ass|ssa|sub)$/i.test(n) && n.toLowerCase().startsWith(base)).sort(collator.compare).map((n) => {
    const tags = n.slice(base.length).replace(/\.[^.]+$/, "").split(/[._ -]+/).filter(Boolean).map((s) => s.toLowerCase());
    const langue = tags.find((t) => /^[a-z]{2,3}$/.test(t) && !["sdh", "cc", "hi"].includes(t)) || "";
    return { file: path.join(dir, n), langue, force: tags.includes("forced") || tags.includes("force") };
  });
}

// ---------- jeu : le bon émulateur ----------
// 1) une ROM connue de l'émulateur intégré ; 2) un disque d'une console récente (dossier « PS2/ », extension, ou
// contenu du disque, voir consoles.js) ; 3) une archive .zip : arcade, ou la console de son dossier.
// Les BIOS ne sont JAMAIS téléchargés : cherchés dans Rembobine/BIOS ou à côté du jeu, sinon un message clair.
function choisirEmulateur(file, roots) {
  const e = ext(file);
  roots = roots || [path.join(os.homedir(), "Rembobine")];
  const avecBios = (r, sys) => {
    try { const b = JX().biosEtat(sys, file, path.parse(file).root, roots); if (b) { r.bios = { requis: b.requis, ok: b.ok, txt: b.txt, sans: b.sans }; if (b.ok) r.bios.fichier = JX().biosFind(b.key, roots, file); } } catch (_) {}
    return r;
  };
  if (e === "zip" || e === "7z") {
    let core = "arcade";
    try { for (const part of path.dirname(file).split(path.sep).reverse()) { const sd = dossierConsole(part); if (sd) { core = sd; break; } } } catch (_) {}
    return avecBios({ type: "integre", core, nom: EJS_NOM[core] || "Arcade" }, core === "arcade" ? "arcade" : core);
  }
  if (EJS[e]) { const core = EJS[e]; return avecBios({ type: "integre", core, nom: EJS_NOM[core] }, core === "psx" ? "psx" : core === "pce" ? "pce" : core); }
  if (e === "cue") return { type: "aucun", err: "Les jeux en .cue/.bin ne se lancent pas ici : convertis-les en .chd (un seul fichier, avec chdman)." };
  if (DISQUES.includes(e)) {
    let sys = ""; try { sys = CS().consoleOf(file, path.parse(file).root); } catch (_) {}
    if (sys === "psx") return avecBios({ type: "integre", core: "psx", nom: "PlayStation" }, "psx");
    const c = sys && CS().CONSOLES[sys];
    if (c) return { type: "console", sys, nom: c.nom };
    return { type: "aucun", err: "Rembobine ne reconnaît pas la console de ce disque. Range-le dans un dossier au nom de sa console (PS2, GameCube, Wii, Xbox…) puis rouvre-le." };
  }
  return { type: "aucun", err: "Ce format de jeu n'est pas reconnu." };
}
// nom de dossier → cœur de l'émulateur intégré (pour les .zip rangés par console)
function dossierConsole(nom) {
  const T = [[/mega.?cd|sega.?cd/i, ""], [/neo ?geo ?pocket|ngpc?/i, "ngp"], [/virtual ?boy/i, "vb"], [/wonder ?swan/i, "ws"], [/32x/i, "sega32x"], [/atari ?7800/i, "atari7800"],
    [/commodore|c64/i, "c64"], [/spectrum|zx/i, "fuse"], [/amstrad|cpc/i, "cap32"], [/snes|super ?nintendo|super ?famicom/i, "snes"], [/game ?boy ?advance|gba/i, "gba"],
    [/game ?boy|^gbc?$/i, "gb"], [/nintendo ?64|n64/i, "n64"], [/nintendo ?ds|nds/i, "nds"], [/^nes$|famicom/i, "nes"], [/mega ?drive|genesis/i, "segaMD"],
    [/master ?system/i, "segaMS"], [/game ?gear/i, "segaGG"], [/pc ?engine|turbografx/i, "pce"], [/atari ?2600/i, "atari2600"], [/arcade|fbneo|mame|neo ?geo|cps/i, "arcade"]];
  for (const [re, c] of T) if (re.test(nom)) return c;
  return "";
}

// ---------- la reprise (position retenue par fichier) ----------
// Gardée dans userData/lecteur-seul.json, avec le reste des choix du lecteur seul ; un fichier remplacé (taille
// différente) repart du début. Au plus 400 fichiers retenus (les plus anciens s'en vont).
function createMemoire(fichier) {
  let M = null;
  const lire = () => { if (M) return M; try { M = JSON.parse(fs.readFileSync(fichier, "utf8")); } catch (_) { M = {}; } M.reprises = M.reprises && typeof M.reprises === "object" ? M.reprises : {}; M.dossiers = Array.isArray(M.dossiers) ? M.dossiers.filter((d) => typeof d === "string") : []; M.defauts = M.defauts && typeof M.defauts === "object" ? M.defauts : {}; return M; };
  const garder = () => { try { fs.mkdirSync(path.dirname(fichier), { recursive: true }); const t = fichier + ".tmp"; fs.writeFileSync(t, JSON.stringify(M)); fs.renameSync(t, fichier); } catch (_) {} };
  const taille = (f) => { try { return fs.statSync(f).size; } catch (_) { return -1; } };
  return {
    data: lire,
    reprise(file) {
      const r = lire().reprises[file]; if (!r || r.taille !== taille(file)) return null;
      return positionDepart(r.pos, r.dur) ? { pos: r.pos, dur: r.dur } : null;
    },
    retenir(file, pos, dur) {
      pos = Number(pos) || 0; dur = Number(dur) || 0;
      const R = lire().reprises;
      if (!positionDepart(pos, dur)) delete R[file];
      else R[file] = { pos: Math.round(pos * 10) / 10, dur: Math.round(dur), taille: taille(file), t: Date.now() };
      const cles = Object.keys(R); if (cles.length > 400) cles.sort((a, b) => R[a].t - R[b].t).slice(0, cles.length - 400).forEach((k) => delete R[k]);
      garder();
    },
    dossiers: () => lire().dossiers.slice(),
    ajouterDossier(d) { const L = lire().dossiers; if (!L.includes(d)) L.push(d); garder(); },
    nePlusDemander(v) { if (v === undefined) return !!lire().nePlusDemander; lire().nePlusDemander = !!v; garder(); return !!v; },
    regler(k, v) { lire()[k] = v; garder(); },
    defauts: () => lire().defauts,
    garderDefauts(d) { lire().defauts = d; garder(); }
  };
}
// on reprend seulement après 15 s, et pas dans les 30 dernières secondes (ni après 95 %) : sinon on repart du début
function positionDepart(pos, dur) {
  pos = Number(pos) || 0; dur = Number(dur) || 0;
  if (pos < 15) return 0;
  if (dur > 0 && (pos > dur - 30 || pos / dur > 0.95)) return 0;
  return pos;
}
// le dossier est-il déjà dans la bibliothèque ? (dans un dossier de médias, ou déjà ajouté)
function dansBibliotheque(dir, roots) {
  const norm = (p) => { let r = path.resolve(p); if (process.platform === "win32") r = r.toLowerCase(); return r.replace(/[\\/]+$/, ""); };
  const d = norm(dir);
  return (roots || []).some((r) => { const x = norm(r); return d === x || d.startsWith(x + path.sep); });
}
// faut-il poser la question « Ajouter ce dossier à ta bibliothèque ? »
function demanderAjout(file, roots, mem) {
  if (!file || (mem && mem.nePlusDemander())) return false;
  return !dansBibliotheque(path.dirname(file), [...(roots || []), ...(mem ? mem.dossiers() : [])]);
}

// ---------- instance unique : que faire d'un fichier arrivé alors que Rembobine est déjà ouvert ----------
// etat : { complet: la fenêtre de la médiathèque est ouverte, seul: une fenêtre de lecteur seul est ouverte }
function routeOuverture(etat, file) {
  if (!file) return etat.seul && !etat.complet ? "ouvrir-complet" : "montrer";
  if (etat.complet) return "par-dessus";        // dans la fenêtre de Rembobine, par-dessus la médiathèque
  if (etat.seul) return "remplacer";             // le lecteur seul passe au nouveau fichier
  return "nouveau";
}

// ---------- « Ouvrir avec » et lecteur par défaut ----------
// Linux : les types MIME (freedesktop shared-mime-info) ; quelques formats de jeu n'en ont pas : Rembobine les décrit
// lui-même (paquet MIME « rembobine.xml », installé avec le raccourci).
const MIME = {
  video: ["video/x-matroska", "video/mp4", "video/x-m4v", "video/x-msvideo", "video/avi", "video/quicktime", "video/webm", "video/mp2t", "video/vnd.dlna.mpeg-tts",
    "video/mpeg", "video/x-ms-wmv", "video/x-flv", "video/ogg", "video/3gpp", "video/dvd", "video/x-ogm+ogg"],
  musique: ["audio/mpeg", "audio/flac", "audio/x-flac", "audio/ogg", "audio/x-vorbis+ogg", "audio/x-opus+ogg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/x-aac",
    "audio/wav", "audio/x-wav", "audio/x-ms-wma", "audio/x-aiff", "audio/x-ape", "audio/x-matroska"],
  jeu: ["application/x-nes-rom", "application/x-fds-disk", "application/x-snes-rom", "application/x-gameboy-rom", "application/x-gameboy-color-rom", "application/x-gba-rom",
    "application/x-genesis-rom", "application/x-sms-rom", "application/x-gamegear-rom", "application/x-n64-rom", "application/x-nintendo-ds-rom", "application/x-pc-engine-rom",
    "application/x-atari-2600-rom", "application/x-atari-7800-rom", "application/x-virtual-boy-rom", "application/x-neo-geo-pocket-rom", "application/x-neo-geo-pocket-color-rom",
    "application/x-wonderswan-rom", "application/x-wonderswan-color-rom", "application/x-genesis-32x-rom", "application/x-gamecube-rom", "application/x-wii-rom",
    "application/x-wii-wad", "application/x-wbfs", "application/x-rembobine-jeu"]
};
// formats de jeu sans type MIME commun : décrits par Rembobine (application/x-rembobine-jeu)
const SANS_MIME = ["chd", "pbp", "rvz", "cso", "gcz", "ciso", "gcm", "xiso", "xex", "vboy", "v64", "smd", "32x", "a78", "d64", "t64", "tzx", "z80", "cdt"];
function mimeXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Rembobine : formats de jeu sans type commun (pour « Ouvrir avec ») -->\n<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">\n  <mime-type type="application/x-rembobine-jeu">\n    <comment>Jeu (Rembobine)</comment>\n    <comment xml:lang="fr">Jeu (Rembobine)</comment>\n${SANS_MIME.map((e) => `    <glob pattern="*.${e}"/>`).join("\n")}\n  </mime-type>\n</mime-info>\n`;
}
// la ligne MimeType= du raccourci : Rembobine apparaît dans « Ouvrir avec » sans devenir le lecteur par défaut
const ligneMime = () => "MimeType=" + [...MIME.video, ...MIME.musique, ...MIME.jeu].join(";") + ";";

// Linux : faire / défaire « Rembobine par défaut » pour un genre. run(cmd, args) → { status, stdout } (synchrone).
// Avant de prendre la place, on retient le lecteur d'avant pour chaque type (retour arrière possible).
const DESKTOP = "rembobine.desktop";
function defautLinux(genreDemande, actif, { run, memoire, mimeapps }) {
  const types = MIME[genreDemande]; if (!types) return { ok: false, err: "genre inconnu" };
  const D = { ...(memoire.defauts() || {}) };
  if (actif) {
    const avant = D[genreDemande] && D[genreDemande].avant ? D[genreDemande].avant : {};
    for (const t of types) {
      const q = run("xdg-mime", ["query", "default", t]); const app = String((q && q.stdout) || "").trim();
      if (app && app !== DESKTOP && avant[t] === undefined) avant[t] = app;
    }
    const r = run("xdg-mime", ["default", DESKTOP, ...types]);
    if (!r || r.status !== 0) return { ok: false, err: "xdg-mime n'a pas pu changer le lecteur par défaut." };
    D[genreDemande] = { actif: true, avant, t: Date.now() };
  } else {
    const avant = (D[genreDemande] && D[genreDemande].avant) || {};
    const parApp = {};
    for (const t of types) { const a = avant[t]; if (a) (parApp[a] ||= []).push(t); }
    for (const [a, ts] of Object.entries(parApp)) run("xdg-mime", ["default", a, ...ts]);
    // les types qui n'avaient pas de lecteur choisi : on retire simplement Rembobine du fichier des choix
    const restants = types.filter((t) => !avant[t]);
    if (restants.length && mimeapps) retirerDeMimeapps(mimeapps, restants);
    delete D[genreDemande];
  }
  memoire.garderDefauts(D);
  return { ok: true };
}
// ~/.config/mimeapps.list : retirer « type=rembobine.desktop » des choix par défaut (sans toucher au reste)
function retirerDeMimeapps(fichier, types) {
  let s; try { s = fs.readFileSync(fichier, "utf8"); } catch (_) { return false; }
  let section = "";
  const out = s.split(/\r?\n/).map((l) => {
    const m = /^\[(.+)\]\s*$/.exec(l); if (m) { section = m[1]; return l; }
    if (section !== "Default Applications") return l;
    const k = /^([^=]+)=(.*)$/.exec(l); if (!k || !types.includes(k[1].trim())) return l;
    const reste = k[2].split(";").filter((a) => a && a !== DESKTOP);
    return reste.length ? `${k[1]}=${reste.join(";")};` : null;
  }).filter((l) => l !== null);
  try { fs.writeFileSync(fichier, out.join("\n")); return true; } catch (_) { return false; }
}
// état vu par la page : pour chaque genre, Rembobine a-t-il été choisi ici ET est-il encore le lecteur par défaut (de la
// plupart de ses types) ? (xdg-mime répond « rembobine.desktop » quand aucun autre lecteur ne connaît un type : ça ne
// suffit pas ; et si l'utilisateur a choisi un autre lecteur ailleurs depuis, la page le montre)
function etatLinux(run, memoire) {
  const r = {}, D = (memoire && memoire.defauts()) || {};
  for (const [g, types] of Object.entries(MIME)) {
    if (memoire && !(D[g] && D[g].actif)) { r[g] = false; continue; }
    const vus = types.slice(0, 6).map((t) => String(((run("xdg-mime", ["query", "default", t]) || {}).stdout) || "").trim());
    r[g] = vus.filter((a) => a === DESKTOP).length >= Math.ceil(vus.length / 2);
  }
  return r;
}

// Windows : l'inscription « Ouvrir avec » (sans devenir le lecteur par défaut), dans HKEY_CURRENT_USER (sans droits
// d'administrateur). Rembobine apparaît alors aussi dans Paramètres → Applications → Applications par défaut, où
// l'utilisateur choisit lui-même (depuis Windows 10, une appli ne peut plus se mettre par défaut toute seule).
const PROGID = { video: "Rembobine.Video", musique: "Rembobine.Musique", jeu: "Rembobine.Jeu" };
const NOM_GENRE = { video: "Vidéo", musique: "Musique", jeu: "Jeu" };
function regWindows(exe) {
  const q = (s) => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  const cmd = q(`"${exe}" "%1"`), ico = q(`${exe},0`);
  const L = ["Windows Registry Editor Version 5.00", ""];
  const cle = (k, vals) => { L.push(`[HKEY_CURRENT_USER\\${k}]`); for (const [n, v] of vals) L.push(`${n === "@" ? "@" : q(n)}=${v}`); L.push(""); };
  for (const [g, id] of Object.entries(PROGID)) {
    cle(`Software\\Classes\\${id}`, [["@", q(`${NOM_GENRE[g]} (Rembobine)`)], ["FriendlyTypeName", q(`${NOM_GENRE[g]} (Rembobine)`)]]);
    cle(`Software\\Classes\\${id}\\DefaultIcon`, [["@", ico]]);
    cle(`Software\\Classes\\${id}\\shell\\open\\command`, [["@", cmd]]);
  }
  cle("Software\\Classes\\Applications\\Rembobine.exe", [["FriendlyAppName", q("Rembobine")]]);
  cle("Software\\Classes\\Applications\\Rembobine.exe\\shell\\open\\command", [["@", cmd]]);
  cle("Software\\Classes\\Applications\\Rembobine.exe\\SupportedTypes", Object.values(ASSOCIEES).flat().map((e) => [`.${e}`, q("")]));
  for (const [g, exts] of Object.entries(ASSOCIEES)) for (const e of exts) cle(`Software\\Classes\\.${e}\\OpenWithProgids`, [[PROGID[g], q("")]]);
  cle("Software\\Rembobine\\Capabilities", [["ApplicationName", q("Rembobine")], ["ApplicationDescription", q("Ta médiathèque : films, séries, jeux et musique")], ["ApplicationIcon", ico]]);
  cle("Software\\Rembobine\\Capabilities\\FileAssociations", Object.entries(ASSOCIEES).flatMap(([g, exts]) => exts.map((e) => [`.${e}`, q(PROGID[g])])));
  cle("Software\\RegisteredApplications", [["Rembobine", q("Software\\Rembobine\\Capabilities")]]);
  return L.join("\r\n");
}
// la page « Applications par défaut » de Windows, ouverte directement sur Rembobine (Windows 11 ; Windows 10 : la page générale)
const PAGE_DEFAUT_WINDOWS = "ms-settings:defaultapps?registeredAppUser=Rembobine";

module.exports = { VIDEO, MUSIQUE, JEUX, EJS, ASSOCIEES, MIME, SANS_MIME, DESKTOP, PROGID, PAGE_DEFAUT_WINDOWS,
  genre, fichierDesArgs, versChemin, titre, titreMorceau, infoAlbum, morceauxDuDossier, pochette, sousTitres, choisirEmulateur, dossierConsole,
  createMemoire, positionDepart, dansBibliotheque, demanderAjout, routeOuverture, mimeXml, ligneMime, defautLinux, retirerDeMimeapps, etatLinux, regWindows };
