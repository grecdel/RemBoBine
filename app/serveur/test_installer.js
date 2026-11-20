// Test de l'installation automatique des émulateurs : node app/serveur/test_installer.js (Linux)
// Faux GitHub (dernières versions publiées), faux Flathub (commande flatpak), faux site de Sony (système PS3).
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-inst-"));
process.env.HOME = path.join(T, "home"); fs.mkdirSync(process.env.HOME);
const BIN = path.join(T, "bin"); fs.mkdirSync(BIN); process.env.PATH = BIN + path.delimiter + process.env.PATH;
// faux flatpak : « install » crée l'appli, « info » dit si elle est là
fs.writeFileSync(path.join(BIN, "flatpak"), `#!/bin/sh\nD="${T}/flatpaks"; mkdir -p "$D"\ncase "$1" in\n remote-add) exit 0;;\n install) for a in "$@"; do case "$a" in org.*) touch "$D/$a";; esac; done; exit 0;;\n info) [ -f "$D/$2" ] && exit 0 || exit 1;;\nesac\nexit 0\n`);
fs.chmodSync(path.join(BIN, "flatpak"), 0o755);
const M = path.join(T, "m"); fs.mkdirSync(M);
const { createInstaller } = require("./installer");
const CS = require("./consoles");
const BIG = Buffer.alloc(3 * 1024 * 1024, 1);
const net = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  const json = (o) => { r.writeHead(200, { "Content-Type": "application/json" }); r.end(JSON.stringify(o)); };
  const N = `http://127.0.0.1:${net.address().port}`;
  if (p === "/gh/repos/PCSX2/pcsx2/releases/latest") return json({ tag_name: "v2.2.0", assets: [{ name: "pcsx2-v2.2.0-windows-x64-Qt.7z", browser_download_url: N + "/dl/w.7z" }, { name: "pcsx2-v2.2.0-linux-appimage-x64-Qt.AppImage", browser_download_url: N + "/dl/pcsx2.AppImage" }] });
  if (p === "/gh/repos/RPCS3/rpcs3-binaries-linux/releases/latest") return json({ tag_name: "build-123", assets: [{ name: "rpcs3-v0.0.33-linux64_aarch64.AppImage", browser_download_url: N + "/dl/arm" }, { name: "rpcs3-v0.0.33-linux64.AppImage", browser_download_url: N + "/dl/rpcs3.AppImage" }] });
  if (p === "/gh/repos/xemu-project/xemu/releases/latest") return json({ tag_name: "v0.8.5", assets: [{ name: "xemu-v0.8.5-x86_64.AppImage.sha256", browser_download_url: N + "/dl/sha" }] });
  if (p.startsWith("/dl/")) { r.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": BIG.length }); return r.end(BIG); }
  if (p === "/sony/update/ps3/list/eu/ps3-updatelist.txt") { r.writeHead(200); return r.end(`# EU\r\nDest=84;CompatibleSystemSoftwareVersion=4.9100-;\r\nDest=84;ImageVersion=0001b1e4;SystemSoftwareVersion=4.9200;CDN=${N}/sony/PS3UPDAT.PUP;CDN_Timeout=30;\r\n`); }
  if (p === "/sony/PS3UPDAT.PUP") { r.writeHead(200, { "Content-Length": BIG.length }); return r.end(BIG); }
  r.writeHead(404); r.end();
});
let ok = 0, ko = 0;
const check = (c, w) => { if (c) ok++; else { ko++; console.log("ÉCHEC :", w); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
net.listen(0, async () => {
  const N = `http://127.0.0.1:${net.address().port}`, ev = [];
  const IN = createInstaller({ roots: [M], emit: (e) => ev.push(e), bases: { github: N + "/gh", sony: N + "/sony" } });
  const until = async (id) => { for (let i = 0; i < 150; i++) { const j = IN.jobs()[id]; if (j && j.done) return j; await wait(100); } return IN.jobs()[id]; };
  check(IN.can("pcsx2") && IN.can("dolphin") && !IN.can("xenia"), "ce qui s'installe tout seul sur un PC Linux (Xenia : Windows seulement)");
  IN.start("pcsx2"); const j1 = await until("pcsx2");
  const ai = path.join(M, "Emulateurs", "pcsx2.AppImage");
  check(j1.ok && fs.existsSync(ai) && (fs.statSync(ai).mode & 0o111), "PCSX2 : AppImage officielle téléchargée et rendue exécutable");
  check(ev.some((e) => e.type === "install" && e.id === "pcsx2" && e.pct > 0 && e.pct < 100), "progression annoncée pendant le téléchargement");
  IN.start("rpcs3"); const j2 = await until("rpcs3");
  check(j2.ok && fs.statSync(path.join(M, "Emulateurs", "rpcs3.AppImage")).size === BIG.length, "RPCS3 : la version PC est choisie (pas celle pour ARM)");
  IN.start("xemu"); const j3 = await until("xemu");
  check(!j3.ok && /Pas de version de xemu/.test(j3.err), "xemu : publication sans fichier pour cette machine → message clair");
  IN.start("dolphin"); const j4 = await until("dolphin");
  check(j4.ok, "Dolphin : installé par Flatpak (Flathub)");
  const st = CS.status([M]);
  check(st.find((c) => c.id === "ps2").emus[0].ok && st.find((c) => c.id === "gc").emus[0].ok, "les émulateurs installés sont trouvés (PS2, GameCube)");
  IN.start("ps3sys"); const j5 = await until("ps3sys");
  check(j5.ok && /4\.9200/.test(j5.msg) && fs.statSync(path.join(M, "BIOS", "PS3UPDAT.PUP")).size === BIG.length, "système PS3 téléchargé chez Sony, dans le dossier BIOS");
  check(!fs.existsSync(path.join(M, "BIOS", "PS3UPDAT.PUP.part")), "aucun fichier à moitié téléchargé ne traîne");
  net.close(); fs.rmSync(T, { recursive: true, force: true });
  console.log(`Installation : ${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
});
