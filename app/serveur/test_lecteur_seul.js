// Test du « lecteur seul » (Rembobine ouvert avec un fichier) : node app/serveur/test_lecteur_seul.js
// Analyse des arguments (chemins, file://, options), choix du lecteur selon le fichier (vidéo, musique, ROM, disque),
// les morceaux du même dossier, les sous-titres posés à côté, la reprise, la question « Ajouter ce dossier ? »,
// l'instance unique, et le réglage « lecteur par défaut » (Linux : faux xdg-mime ; Windows : fichier .reg).
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-seul-"));
process.env.HOME = path.join(T, "home"); fs.mkdirSync(process.env.HOME);
const S = require("../seul");
let ok = 0, ko = 0;
const check = (c, m) => { if (c) ok++; else { ko++; console.log("ÉCHEC :", m); } };
const put = (rel, buf) => { const f = path.join(T, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf || Buffer.alloc(16)); return f; };

// ---------- arguments ----------
const film = put("Videos/Le.Grand.Voyage.2019.1080p.BluRay.x264-GRP.mkv", Buffer.alloc(4096));
put("Videos/Le.Grand.Voyage.2019.1080p.BluRay.x264-GRP.fr.srt", "1\n00:00:01,000 --> 00:00:02,000\nBonjour\n");
put("Videos/Le.Grand.Voyage.2019.1080p.BluRay.x264-GRP.en.forced.srt", "1\n00:00:01,000 --> 00:00:02,000\nHi\n");
put("Videos/Autre film.srt", "x");
const espace = put("Mes vidéos/été 2026.mp4");
check(S.fichierDesArgs(["/opt/rembobine/rembobine-bin", "--no-sandbox", film]) === film, "chemin simple après les options");
check(S.fichierDesArgs(["rembobine", require("url").pathToFileURL(espace).href]) === espace, "adresse file:// (raccourci Linux %U) avec espaces et accents");
check(S.fichierDesArgs(["electron", ".", path.relative(T, film)], T) === film, "chemin relatif (lancé depuis un terminal)");
check(S.fichierDesArgs(["rembobine"]) === "", "sans fichier : démarrage normal");
check(S.fichierDesArgs(["rembobine", "--kiosk"]) === "", "option seule : démarrage normal");
check(S.fichierDesArgs(["rembobine", path.join(T, "Videos")]) === "", "un dossier n'ouvre pas le lecteur seul");
check(S.fichierDesArgs(["rembobine", path.join(T, "absent.mkv")]) === "", "fichier absent : ignoré");
check(S.fichierDesArgs(["rembobine", put("notes.txt", "x")]) === "", "fichier d'un autre genre : ignoré");
check(S.fichierDesArgs(["rembobine", "https://exemple.org/film.mkv"]) === "", "jamais une adresse d'internet");

// ---------- genre et titre ----------
check(S.genre("a.MKV") === "video" && S.genre("b.flac") === "musique" && S.genre("c.sfc") === "jeu" && S.genre("d.iso") === "jeu" && S.genre("e.txt") === null, "genre d'après l'extension");
check(S.titre(film) === "Le Grand Voyage (2019)", "titre propre : " + S.titre(film));
const st = S.sousTitres(film);
check(st.length === 2 && st.some((s) => s.langue === "fr") && st.some((s) => s.langue === "en" && s.force), "sous-titres posés à côté, langue reconnue");

// ---------- musique : le dossier à la suite ----------
const alb = "Musique/Les Ondes - Nuit Claire (2024)";
const m3 = put(`${alb}/03 - Les Ondes - Troisième.flac`), m1 = put(`${alb}/01 - Premier.mp3`), m10 = put(`${alb}/10 - Dixième.ogg`), m2 = put(`${alb}/02 Deuxième.opus`);
put(`${alb}/cover.jpg`); put(`${alb}/livret.pdf`); put(`${alb}/.cache.mp3`);
const md = S.morceauxDuDossier(m3);
check(md.pistes.length === 4 && md.pistes.map((p) => p.file).join() === [m1, m2, m3, m10].join(), "morceaux du même dossier, dans l'ordre des numéros");
check(md.index === 2, "on commence au morceau ouvert");
check(md.artiste === "Les Ondes" && md.album === "Nuit Claire", "artiste et album d'après le dossier : " + md.artiste + " / " + md.album);
check(md.pistes[2].titre === "Troisième" && md.pistes[1].titre === "Deuxième", "titres des morceaux sans numéro ni artiste");
check(S.pochette(m3).endsWith("cover.jpg"), "pochette posée dans le dossier");

// ---------- jeu : le bon émulateur ----------
const roots = [path.join(T, "home", "Rembobine")];
check(S.choisirEmulateur(put("Jeux/Plateformes.sfc"), roots).core === "snes", "ROM Super Nintendo → émulateur intégré");
check(S.choisirEmulateur(put("Jeux/Course.gba"), roots).type === "integre", "ROM GBA → émulateur intégré");
check(S.choisirEmulateur(put("Jeux/Arcade/Combat.zip"), roots).core === "arcade", ".zip → arcade");
check(S.choisirEmulateur(put("Jeux/Mega Drive/Herisson.zip"), roots).core === "segaMD", ".zip rangé dans « Mega Drive » → Mega Drive");
const gc = put("Jeux/Divers/Kart (Europe).iso", (() => { const b = Buffer.alloc(0x40); b.writeUInt32BE(0xC2339F3D, 0x1C); return b; })());
const egc = S.choisirEmulateur(gc, roots);
check(egc.type === "console" && egc.sys === "gc", "disque GameCube reconnu à son contenu → consoles.js (Dolphin)");
check(S.choisirEmulateur(put("Jeux/PS2/Course.iso"), roots).sys === "ps2", "disque rangé dans « PS2 » → PCSX2");
check(S.choisirEmulateur(put("Jeux/Wii/Sport.wbfs"), roots).sys === "wii", ".wbfs → Wii");
check(S.choisirEmulateur(put("Jeux/x.cue"), roots).type === "aucun", ".cue : message clair (convertir en .chd)");
check(S.choisirEmulateur(put("Jeux/Divers/inconnu.iso"), roots).type === "aucun", "disque inconnu : message, pas de lancement au hasard");
const psx = S.choisirEmulateur(put("Jeux/PlayStation/Aventure.chd"), roots);
check(psx.core === "psx" && psx.bios && psx.bios.ok === false && psx.bios.requis === false, "PlayStation : BIOS facultatif, absent, signalé");
fs.mkdirSync(path.join(roots[0], "BIOS"), { recursive: true }); fs.writeFileSync(path.join(roots[0], "BIOS", "scph5501.bin"), Buffer.alloc(8));
const psx2 = S.choisirEmulateur(path.join(T, "Jeux/PlayStation/Aventure.chd"), roots);
check(psx2.bios.ok && psx2.bios.fichier.endsWith("scph5501.bin"), "BIOS trouvé dans Rembobine/BIOS (jamais téléchargé)");
const fds = S.choisirEmulateur(put("Jeux/Disque.fds"), roots);
check(fds.bios && fds.bios.requis && !fds.bios.ok, "Famicom Disk System sans BIOS : refusé avec explication");
// le code ne télécharge jamais de BIOS : aucune adresse d'internet dans la logique du lecteur seul
check(!/https?:\/\/(?!github\.com\/|www\.freedesktop)/.test(fs.readFileSync(path.join(__dirname, "..", "seul.js"), "utf8")), "aucun téléchargement dans seul.js");

// ---------- reprise ----------
const mem = S.createMemoire(path.join(T, "data", "lecteur-seul.json"));
check(mem.reprise(film) === null, "rien de retenu au départ");
mem.retenir(film, 8, 5400); check(mem.reprise(film) === null, "moins de 15 s : on repart du début");
mem.retenir(film, 1234.56, 5400); check(mem.reprise(film) && Math.abs(mem.reprise(film).pos - 1234.6) < 0.01, "position retenue");
const mem2 = S.createMemoire(path.join(T, "data", "lecteur-seul.json"));
check(mem2.reprise(film) && mem2.reprise(film).dur === 5400, "retenue d'un lancement à l'autre (fichier lecteur-seul.json)");
mem.retenir(film, 5390, 5400); check(mem.reprise(film) === null, "fin du film : on oublie la position");
mem.retenir(film, 600, 5400); fs.appendFileSync(film, Buffer.alloc(10)); check(mem.reprise(film) === null, "fichier remplacé (taille différente) : du début");
check(S.positionDepart(100, 0) === 100 && S.positionDepart(96, 100) === 0, "position de départ : bornes");

// ---------- « Ajouter ce dossier à ta bibliothèque ? » ----------
check(S.demanderAjout(film, roots, mem) === true, "dossier hors bibliothèque : on propose");
check(S.demanderAjout(path.join(roots[0], "Films", "x.mkv"), roots, mem) === false, "déjà dans ~/Rembobine : on ne demande pas");
mem.ajouterDossier(path.dirname(film)); check(S.demanderAjout(film, roots, mem) === false, "dossier ajouté : on ne redemande pas");
check(S.createMemoire(path.join(T, "data", "lecteur-seul.json")).dossiers().includes(path.dirname(film)), "dossier ajouté retenu pour le prochain démarrage");
mem.nePlusDemander(true); check(S.demanderAjout(m3, roots, mem) === false, "« Ne plus demander » respecté");

// ---------- instance unique ----------
check(S.routeOuverture({ complet: true, seul: false }, film) === "par-dessus", "Rembobine ouvert : le fichier s'ouvre dans sa fenêtre");
check(S.routeOuverture({ complet: false, seul: true }, film) === "remplacer", "lecteur seul ouvert : il passe au nouveau fichier");
check(S.routeOuverture({ complet: false, seul: false }, film) === "nouveau", "rien d'ouvert : nouveau lecteur seul");
check(S.routeOuverture({ complet: false, seul: true }, "") === "ouvrir-complet", "Rembobine relancé sans fichier pendant le lecteur seul : la médiathèque");
check(S.routeOuverture({ complet: true, seul: false }, "") === "montrer", "relancé sans fichier : la fenêtre revient devant");

// ---------- lecteur par défaut : Linux (faux xdg-mime) ----------
const BASE = { "video/x-matroska": "vlc.desktop", "video/mp4": "vlc.desktop", "audio/mpeg": "lecteur-audio.desktop" };
const db = { ...BASE };
const run = (cmd, args) => {
  if (cmd !== "xdg-mime") return { status: 1, stdout: "" };
  if (args[0] === "query") return { status: 0, stdout: (db[args[2]] || "") + "\n" };
  if (args[0] === "default") { for (const t of args.slice(2)) db[t] = args[1]; return { status: 0, stdout: "" }; }
  return { status: 1, stdout: "" };
};
const memD = S.createMemoire(path.join(T, "data", "defauts.json"));
const mimeapps = path.join(T, "mimeapps.list");
check(S.etatLinux(run, memD).video === false, "au départ, Rembobine n'est pas le lecteur par défaut");
check(S.defautLinux("video", true, { run, memoire: memD, mimeapps }).ok, "faire de Rembobine le lecteur vidéo par défaut");
check(db["video/x-matroska"] === "rembobine.desktop" && db["video/webm"] === "rembobine.desktop", "xdg-mime default rembobine.desktop pour les types vidéo");
check(db["audio/mpeg"] === "lecteur-audio.desktop", "la musique n'est pas touchée (genres séparés)");
check(S.etatLinux(run, memD).video === true && S.etatLinux(run, memD).musique === false, "état vu par la page");
check(memD.defauts().video.avant["video/x-matroska"] === "vlc.desktop", "l'ancien lecteur est retenu");
S.defautLinux("video", true, { run, memoire: memD, mimeapps });
check(memD.defauts().video.avant["video/mp4"] === "vlc.desktop", "refaire ne perd pas l'ancien lecteur");
fs.writeFileSync(mimeapps, "[Default Applications]\nvideo/webm=rembobine.desktop;\nvideo/x-flv=autre.desktop;rembobine.desktop;\ntext/plain=editeur.desktop;\n\n[Added Associations]\nvideo/webm=rembobine.desktop;\n");
check(S.defautLinux("video", false, { run, memoire: memD, mimeapps }).ok, "ne plus l'utiliser par défaut");
check(db["video/x-matroska"] === "vlc.desktop" && db["video/mp4"] === "vlc.desktop", "l'ancien lecteur revient");
const ma = fs.readFileSync(mimeapps, "utf8");
check(!/^video\/webm=rembobine/m.test(ma.split("[Added Associations]")[0]) && /video\/x-flv=autre\.desktop;/.test(ma) && /text\/plain=editeur/.test(ma) && /\[Added Associations\]\nvideo\/webm=rembobine/.test(ma), "mimeapps.list : seul le choix par défaut de Rembobine est retiré (« Ouvrir avec » reste)");
check(!memD.defauts().video, "plus rien de retenu pour la vidéo");
db["audio/flac"] = "rembobine.desktop"; db["audio/mpeg"] = "rembobine.desktop"; db["audio/x-flac"] = "rembobine.desktop"; db["audio/ogg"] = "rembobine.desktop";
check(S.etatLinux(run, memD).musique === false, "xdg-mime qui répond Rembobine faute d'autre lecteur : pas « par défaut » tant qu'on ne l'a pas choisi");

// ---------- « Ouvrir avec » : raccourci Linux, paquet MIME, Windows ----------
const lm = S.ligneMime();
check(/^MimeType=video\/x-matroska;.*audio\/mpeg;.*application\/x-snes-rom;.*application\/x-rembobine-jeu;$/.test(lm), "ligne MimeType= du raccourci (vidéo, musique, jeux)");
const inst = fs.readFileSync(path.join(__dirname, "..", "linux", "installer.sh"), "utf8");
check(inst.includes(lm), "installer.sh écrit la même ligne MimeType=");
check(fs.readFileSync(path.join(__dirname, "..", "linux", "rembobine-mime.xml"), "utf8") === S.mimeXml(), "rembobine-mime.xml à jour (node -e \"…mimeXml()\")");
check(!/x-scheme-handler|inode\/directory/.test(lm), "pas de types qui feraient de Rembobine autre chose qu'un lecteur");
const reg = S.regWindows("C:\\Users\\Léa\\Rembobine\\Rembobine.exe");
check(/^Windows Registry Editor Version 5\.00/.test(reg) && reg.includes("[HKEY_CURRENT_USER\\Software\\Classes\\.mkv\\OpenWithProgids]") && reg.includes('"Rembobine.Video"=""'), "Windows : Rembobine dans « Ouvrir avec » des .mkv");
check(reg.includes('@="\\"C:\\\\Users\\\\Léa\\\\Rembobine\\\\Rembobine.exe\\" \\"%1\\""'), "Windows : commande d'ouverture correctement échappée");
check(reg.includes("[HKEY_CURRENT_USER\\Software\\RegisteredApplications]") && reg.includes("FileAssociations"), "Windows : Rembobine proposé dans « Applications par défaut »");
check(!/HKEY_LOCAL_MACHINE|\\UserChoice/.test(reg) && !/^\[HKEY_CURRENT_USER\\Software\\Classes\\\.mkv\]$/m.test(reg), "Windows : ne touche jamais au choix par défaut (UserChoice, valeur par défaut de .mkv)");
check(!S.ASSOCIEES.jeu.includes("zip") && !S.ASSOCIEES.jeu.includes("crt"), "pas proposé pour les .zip ni les certificats .crt");
check(S.PAGE_DEFAUT_WINDOWS === "ms-settings:defaultapps?registeredAppUser=Rembobine", "page Windows des applications par défaut");

// ---------- manifeste Android ----------
const man = fs.readFileSync(path.join(__dirname, "..", "..", "android", "release", "AndroidManifest.xml"), "utf8");
const lect = man.slice(man.indexOf('android:name="fr.rembobine.app.LecteurActivity"'), man.indexOf("</activity>", man.indexOf("LecteurActivity")));
check(lect && /android.intent.action.VIEW/.test(lect) && /mimeType="video\/\*"/.test(lect) && /mimeType="audio\/\*"/.test(lect) && /pathPattern=".*\\\\.sfc"/.test(lect), "Android : LecteurActivity reçoit vidéos, musique et ROM");
check(!/LAUNCHER/.test(lect), "Android : le lecteur seul n'est pas un écran de démarrage");
const launcher = man.slice(man.indexOf('android:name="fr.rembobine.app.RembobineActivity"'));
check(/category.LAUNCHER/.test(launcher.slice(0, launcher.indexOf("</activity>"))), "Android : RembobineActivity reste l'écran de démarrage");
check(fs.readFileSync(path.join(__dirname, "..", "..", "ci", "prepare_android.py"), "utf8").includes("rembobine_seul.html"), "Android : la page du lecteur seul est embarquée");
check(fs.readFileSync(path.join(__dirname, "..", "..", "ci", "build_desktop.sh"), "utf8").includes("app/seul_main.js app/preload_seul.js") && fs.readFileSync(path.join(__dirname, "..", "..", "ci", "build_desktop.sh"), "utf8").includes("app/lecteur/seul.html"), "PC : les fichiers du lecteur seul sont livrés");

// ---------- servir un fichier par morceaux (Range) ----------
(async () => {
  const { servir } = (() => { try { return require("../seul_main"); } catch (e) { return {}; } })();
  if (servir && typeof Response !== "undefined") {
    const f = put("range.bin", Buffer.from("0123456789"));
    const req = (r) => ({ headers: { get: (k) => (k === "range" ? r : null) } });
    const a = servir(f, req("bytes=2-5")); check(a.status === 206 && (await a.text()) === "2345" && a.headers.get("content-range") === "bytes 2-5/10", "morceau 2-5");
    const b = servir(f, req("bytes=-3")); check((await b.text()) === "789", "derniers octets");
    const c = servir(f, req("")); check(c.status === 200 && (await c.text()) === "0123456789", "fichier entier");
    check(servir(path.join(T, "absent"), req("")).status === 404, "absent : 404");
  }
  fs.rmSync(T, { recursive: true, force: true });
  console.log(`Lecteur seul : ${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})();
