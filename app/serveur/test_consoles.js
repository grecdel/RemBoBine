// Test des consoles « lourdes » et des régions : node app/serveur/test_consoles.js
// Faux disques (GameCube, Wii, PSP, PS2, Xbox, Xbox 360, PS3 en dossier), jeux de toutes les régions,
// faux émulateurs (PPSSPP, Dolphin, PCSX2, RPCS3, xemu) pour vérifier comment Rembobine les lance, et les BIOS manquants.
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-cons-"));
process.env.HOME = path.join(T, "home"); fs.mkdirSync(process.env.HOME);
const BIN = path.join(T, "bin"); fs.mkdirSync(BIN);
process.env.PATH = BIN + path.delimiter + process.env.PATH;
const LOG = path.join(T, "lances.txt");
for (const b of ["PPSSPPSDL", "dolphin-emu", "pcsx2-qt", "rpcs3", "xemu"]) {
  fs.writeFileSync(path.join(BIN, b), `#!/bin/sh\necho "${b} $*" >> ${JSON.stringify(LOG)}\nif [ "$1" = "--installfw" ]; then mkdir -p "$HOME/.config/rpcs3/dev_flash/vsh/module"; fi\n`);
  fs.chmodSync(path.join(BIN, b), 0o755);
}
const CS = require("./consoles");
const { scanLibrary } = require("./bibliotheque");
const M = path.join(T, "m");
const put = (rel, buf) => { const f = path.join(M, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); return f; };
const disc = (n, fill) => { const b = Buffer.alloc(n); fill(b); return b; };
// GameCube : « magic » à 0x1C ; Wii : à 0x18 ; PSP / PS2 : volume ISO 9660 ; Xbox : XISO à 0x10000
put("Jeux/Divers/Kart Double (Europe).iso", disc(0x40, (b) => b.writeUInt32BE(0xC2339F3D, 0x1C)));
put("Jeux/Divers/Sports Club (USA).iso", disc(0x40, (b) => b.writeUInt32BE(0x5D1C9EA3, 0x18)));
put("Jeux/Divers/Ninja Portable (Japan).iso", disc(0x8100, (b) => { b.write("\x01CD001", 0x8000, "latin1"); b.write("PSP GAME", 0x8008, "latin1"); }));
put("Jeux/Divers/Halo Lointain (USA).iso", disc(0x10100, (b) => b.write("MICROSOFT*XBOX*MEDIA", 0x10000, "latin1")));
const ps2 = path.join(M, "Jeux/PS2/Course Folle (Japan).iso"); fs.mkdirSync(path.dirname(ps2), { recursive: true });
{ const fd = fs.openSync(ps2, "w"); const pvd = Buffer.alloc(0x30); pvd.write("\x01CD001", 0, "latin1"); pvd.write("PLAYSTATION", 8, "latin1"); fs.writeSync(fd, pvd, 0, 0x30, 0x8000); fs.ftruncateSync(fd, 1.2e9); fs.closeSync(fd); }
put("Jeux/PS3/Aventure Celeste (Europe)/PS3_GAME/USRDIR/EBOOT.BIN", Buffer.alloc(16));
put("Jeux/PS3/Aventure Celeste (Europe)/PS3_GAME/PARAM.SFO", Buffer.alloc(16));
for (let i = 0; i < 30; i++) put(`Jeux/PS3/Aventure Celeste (Europe)/PS3_GAME/USRDIR/data/f${i}.dat`, Buffer.alloc(4));
put("Jeux/PSP/Puzzle (Japan).cso", Buffer.alloc(64));
put("Jeux/Xbox 360/Course 360 (USA).iso", Buffer.alloc(64));
put("Jeux/SNES/Super Kart (Japan).sfc", Buffer.alloc(32768));
put("Jeux/NES/Aventure (USA) [!].nes", Buffer.alloc(16));
put("Jeux/Mega Drive/Sonic Rapide (World).md", Buffer.alloc(512));

let ok = 0, ko = 0;
const check = (c, what) => { if (c) ok++; else { ko++; console.log("ÉCHEC :", what); } };
const lances = () => { try { return fs.readFileSync(LOG, "utf8"); } catch (_) { return ""; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const go = async (sys, file) => { const r = CS.launch(sys, file, [M]); await wait(400); return r; };
(async () => {
  const lib = await scanLibrary([M]);
  const g = (t) => lib.items.find((x) => x.kind === "game" && x.title === t);
  check(g("Kart Double") && g("Kart Double").sys === "gc", "disque GameCube reconnu par son contenu");
  check(g("Sports Club") && g("Sports Club").sys === "wii", "disque Wii reconnu par son contenu");
  check(g("Ninja Portable") && g("Ninja Portable").sys === "psp", "disque PSP reconnu par son contenu");
  check(g("Halo Lointain") && g("Halo Lointain").sys === "xbox", "disque Xbox reconnu par son contenu");
  check(g("Course Folle") && g("Course Folle").sys === "ps2", "disque PS2 rangé dans PS2/");
  check(g("Aventure Celeste") && g("Aventure Celeste").sys === "ps3", "jeu PS3 en dossier = un seul jeu");
  check(lib.items.filter((x) => x.kind === "game" && /^f\d+$/.test(x.title)).length === 0, "les fichiers internes du jeu PS3 ne sont pas pris pour des jeux");
  check(g("Puzzle") && g("Puzzle").sys === "psp", "jeu PSP .cso");
  check(g("Course 360") && g("Course 360").sys === "x360", "jeu Xbox 360 rangé dans Xbox 360/");
  // régions : tout se joue, la région est indiquée
  check(g("Super Kart").pub.region === "Japon" && g("Super Kart").sys === "snes", "jeu japonais reconnu (Super Nintendo, Japon)");
  check(g("Aventure").pub.region === "États-Unis", "jeu américain (USA) [!] reconnu");
  check(g("Sonic Rapide").pub.region === "Monde", "jeu « World »");
  check(g("Kart Double").pub.region === "Europe" && g("Ninja Portable").pub.region === "Japon", "région des disques");

  // lancements
  const roots = [M];
  check((await go("gc", g("Kart Double").file)).ok && /dolphin-emu -b .*-e .*Kart Double/.test(lances()), "GameCube → Dolphin en plein écran");
  check((await go("psp", g("Ninja Portable").file)).ok && /PPSSPPSDL --fullscreen .*Ninja Portable/.test(lances()), "PSP → PPSSPP en plein écran");
  const p2 = CS.launch("ps2", g("Course Folle").file, roots);
  check(!p2.ok && /BIOS de la PS2/.test(p2.err), "PS2 sans BIOS : message clair");
  put("BIOS/SCPH-70004.bin", Buffer.alloc(4 * 1024 * 1024));
  const p2b = await go("ps2", g("Course Folle").file);
  check(p2b.ok && /pcsx2-qt -batch -fullscreen -- .*Course Folle/.test(lances()), "PS2 avec BIOS → PCSX2");
  check(fs.existsSync(path.join(process.env.HOME, ".config/PCSX2/bios/SCPH-70004.bin")), "BIOS de la PS2 copié là où PCSX2 le cherche");
  const p3 = CS.launch("ps3", g("Aventure Celeste").file, roots);
  check(!p3.ok && /PS3UPDAT\.PUP/.test(p3.err), "PS3 sans système : message clair");
  put("BIOS/PS3UPDAT.PUP", Buffer.alloc(16));
  const p3b = await go("ps3", g("Aventure Celeste").file);
  check(p3b.ok && /rpcs3 --installfw/.test(lances()) && /rpcs3 --no-gui --fullscreen .*EBOOT\.BIN/.test(lances()), "PS3 : système installé une fois, puis jeu lancé (EBOOT.BIN)");
  const x1 = CS.launch("xbox", g("Halo Lointain").file, roots);
  check(!x1.ok && /mcpx/.test(x1.err), "Xbox sans BIOS : message clair");
  put("BIOS/mcpx_1.0.bin", Buffer.alloc(512)); put("BIOS/Complex_4627.bin", Buffer.alloc(1024)); put("BIOS/xbox_hdd.qcow2", Buffer.alloc(64));
  const x2 = await go("xbox", g("Halo Lointain").file);
  const toml = fs.readFileSync(path.join(process.env.HOME, ".local/share/xemu/xemu/xemu.toml"), "utf8");
  check(x2.ok && /xemu -full-screen -dvd_path .*Halo Lointain/.test(lances()) && /bootrom_path = .*mcpx_1\.0\.bin/.test(toml), "Xbox avec BIOS → xemu configuré et lancé");
  const x3 = CS.launch("x360", g("Course 360").file, roots);
  check(!x3.ok && /Xenia/.test(x3.err), "Xbox 360 sans Xenia : message clair");
  fs.writeFileSync(path.join(BIN, "xenia_canary"), `#!/bin/sh\necho "xenia_canary $*" >> ${JSON.stringify(LOG)}\n`); fs.chmodSync(path.join(BIN, "xenia_canary"), 0o755);
  const x4 = await go("x360", g("Course 360").file);
  check(x4.ok && /xenia_canary .*Course 360.*--fullscreen=true/.test(lances()), "Xbox 360 sur Linux → Xenia (version Linux) en plein écran");
  { const xd = path.join(T, "xenia-livre"); fs.mkdirSync(xd, { recursive: true }); fs.writeFileSync(path.join(xd, "libSDL2-2.0.so.0"), "");
    check(CS.emuEnv(path.join(xd, "xenia_canary")).LD_LIBRARY_PATH.startsWith(xd) && !CS.emuEnv(path.join(BIN, "xenia_canary")).LD_LIBRARY_PATH?.startsWith(BIN), "bibliothèques livrées à côté de Xenia (SDL2) utilisées au lancement"); }
  const st = CS.status(roots);
  check(st.find((c) => c.id === "ps2").pret && st.find((c) => c.id === "gc").pret && st.find((c) => c.id === "x360").pret && !st.find((c) => c.id === "wii").emus.some((e) => !e.ok), "état des consoles pour la page des émulateurs");
  // émulateur livré DANS l'application (prioritaire, rien à installer)
  const LIV = path.join(T, "livres"); fs.mkdirSync(path.join(LIV, "rpcs3"), { recursive: true });
  fs.writeFileSync(path.join(LIV, "rpcs3", "AppRun"), "#!/bin/sh\n"); fs.chmodSync(path.join(LIV, "rpcs3", "AppRun"), 0o755);
  CS.setBundled(LIV);
  const fb = CS.findEmu("rpcs3", []);
  check(fb && fb.bundled && fb.cmd.endsWith(path.join("rpcs3", "AppRun")), "émulateur livré avec l'appli : trouvé en premier");
  check(CS.status(roots).find((c) => c.id === "ps3").emus[0].livre, "la page sait qu'il est livré avec l'appli");
  fs.rmSync(T, { recursive: true, force: true });
  console.log(`Consoles : ${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})();
