// Banc d'essai de l'émulateur intégré, SANS internet :
//   node outils/emulateurs/test_emulateurs.js <dossier ejs (sortie de ci/emulateurs.sh)> <dossier des ROM de test> <dossier des captures>
// Pour chaque console : ouvre EmulatorJS comme le fait l'application, attend le démarrage du jeu,
// photographie l'écran et compare la couleur au centre avec celle attendue (voir roms_test.py).
// Consoles sans ROM de test (N64, DS, PlayStation, PC Engine, Game Gear, arcade) : on vérifie que le cœur se charge et démarre.
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright");
const [EJS, ROMS, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const attendu = JSON.parse(fs.readFileSync(path.join(ROMS, "attendu.json"), "utf8"));
const CAS = [
  ["NES", "nes", "test.nes"], ["Super Nintendo", "snes", "test.sfc"], ["Game Boy", "gb", "test.gb"], ["Game Boy Advance", "gba", "test.gba"],
  ["Mega Drive", "segaMD", "test.md"], ["Master System", "segaMS", "test.sms"], ["Atari 2600", "atari2600", "test.a26"],
  ["Game Gear", "segaGG", "test.sms"], ["PC Engine", "pce", "vide.pce"], ["Nintendo 64", "n64", "vide.z64"], ["Nintendo DS", "nds", "vide.nds"],
  ["PlayStation", "psx", "vide.bin"], ["Arcade", "arcade", "vide.zip"],
  ["Atari 7800", "atari7800", "vide.a78"], ["Virtual Boy", "vb", "vide.vb"], ["Neo Geo Pocket", "ngp", "vide.ngp"], ["WonderSwan", "ws", "vide.ws"],
  ["Sega 32X", "sega32x", "vide.32x"], ["Commodore 64", "c64", "vide.prg"], ["ZX Spectrum", "fuse", "vide.tap"], ["Amstrad CPC", "cap32", "vide.dsk"], ["MAME 2003", "mame", "vide.zip"]
];
for (const [n, sz] of [["vide.a78", 32896], ["vide.vb", 1 << 20], ["vide.ngp", 1 << 20], ["vide.ws", 1 << 20], ["vide.32x", 1 << 20], ["vide.prg", 64], ["vide.tap", 64], ["vide.dsk", 194816]])
  fs.writeFileSync(path.join(ROMS, n), Buffer.alloc(sz));
fs.writeFileSync(path.join(ROMS, "vide.pce"), Buffer.alloc(8192)); fs.writeFileSync(path.join(ROMS, "vide.z64"), Buffer.alloc(1 << 20));
fs.writeFileSync(path.join(ROMS, "vide.nds"), Buffer.alloc(1 << 17)); fs.writeFileSync(path.join(ROMS, "vide.bin"), Buffer.alloc(2352 * 32));
fs.writeFileSync(path.join(ROMS, "vide.zip"), Buffer.from("504b0506000000000000000000000000000000000000", "hex"));
const TYPES = { js: "text/javascript", css: "text/css", json: "application/json", wasm: "application/wasm", html: "text/html" };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  if (u.startsWith("/page/")) {
    const [, , system, rom] = u.split("/");
    r.writeHead(200, { "Content-Type": "text/html" });
    return r.end(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000}#w{width:100vw;height:100vh}</style></head><body><div id="w"><div id="game"></div></div>
<script>window.EJS_player="#game";window.EJS_core=${JSON.stringify(system)};window.EJS_gameUrl="/rom/${rom}";window.EJS_gameName="test";window.EJS_pathtodata="/ejs/data/";
window.EJS_startOnLoaded=true;window.EJS_DEBUG_XX=true;window.EJS_backgroundColor="#000";window.EJS_onGameStart=function(){window.__start=Date.now()};</script>
<script src="/ejs/data/loader.js"></script></body></html>`);
  }
  const f = u.startsWith("/rom/") ? path.join(ROMS, u.slice(5)) : u.startsWith("/ejs/") ? path.join(EJS, u.slice(5)) : null;
  if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": TYPES[path.extname(f).slice(1)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(r);
}).listen(0, async () => {
  const port = srv.address().port;
  const res = [];
  const seul = process.env.CONSOLES ? process.env.CONSOLES.split(",") : null;
  for (const [nom, system, rom] of CAS) {
   if (seul && !seul.includes(system)) continue;
   const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--js-flags=--max-old-space-size=2048"] });
   let init = false;
   // une console qui fige la page (faux jeu) ne bloque pas tout le banc : 90 s au plus par console
   const garde = setTimeout(() => { try { b.close(); } catch (_) {} }, 90000);
   try {
    const p = await b.newPage({ viewport: { width: 640, height: 480 } });
    p.on("console", (m) => { if (/Available core options/.test(m.text())) init = true; });
    if (process.env.BAVARD) { p.on("console", (m) => console.log("   [console]", m.text().slice(0, 160))); p.on("crash", () => console.log("   [plantage de la page]")); }
    const net = []; p.on("requestfailed", (q) => net.push(q.url())); p.on("request", (q) => { if (!q.url().startsWith(`http://127.0.0.1:${port}`) && !q.url().startsWith("data:") && !q.url().startsWith("blob:")) net.push("INTERNET " + q.url()); });
    await p.goto(`http://127.0.0.1:${port}/page/${system}/${rom}`);
    let started = false; for (let i = 0; i < 60 && !started; i++) { await p.waitForTimeout(500); started = await p.evaluate(() => !!window.__start); if (!attendu[rom] && init && i > 20) break; }
    if (started) await p.waitForTimeout(2500);
    const shot = path.join(OUT, `${system}.png`); await p.screenshot({ path: shot });
    // couleur au centre de l'écran : relue sur la photo, comme un œil la verrait
    const px = await p.evaluate(async (png) => { const im = new Image(); im.src = "data:image/png;base64," + png; await im.decode(); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const x = c.getContext("2d"); x.drawImage(im, 0, 0); const d = x.getImageData(im.width >> 1, im.height >> 1, 1, 1).data; return [d[0], d[1], d[2]]; }, fs.readFileSync(shot).toString("base64"));
    const want = attendu[rom] || null;
    // rouge dominant (la Mega Drive le rend plus sombre)
    const isRed = (c) => c && c[0] > 25 && c[0] > 2 * c[1] + 10 && c[0] > 2 * c[2] + 10, isBlack = (c) => c && c[0] < 60 && c[1] < 60 && c[2] < 60;
    const verdict = !started ? (init && !want ? "cœur chargé et initialisé (à essayer avec un vrai jeu)" : "NE DÉMARRE PAS") : !want ? "cœur chargé et démarré (pas de jeu de test)" : (want === "rouge" ? isRed(px) : isBlack(px)) ? `OK : écran ${want} comme prévu` : `démarré, mais écran ${JSON.stringify(px)} au lieu de ${want}`;
    res.push([nom, verdict, net.filter((u) => u.startsWith("INTERNET")).length ? "a voulu aller sur internet !" : ""]);
    console.log(`${nom.padEnd(18)} ${verdict} ${res[res.length - 1][2]}`);
    for (const u of new Set(net.filter((u) => u.startsWith("INTERNET")))) console.log("     ", u);
    await p.close(); await b.close(); clearTimeout(garde);
   } catch (e) { clearTimeout(garde); res.push([nom, init && !attendu[rom] ? "cœur chargé et initialisé (le faux jeu vide le fait planter : à essayer avec un vrai jeu)" : "NE DÉMARRE PAS (" + e.message.split("\n")[0] + ")", ""]); console.log(`${nom.padEnd(18)} ${res[res.length - 1][1]}`); try { await b.close(); } catch (_) {} }
  }
  srv.close();
  const ko = res.filter((r) => /NE DÉMARRE|au lieu|internet/.test(r[1] + r[2])).length;
  console.log(`Émulateurs : ${res.length - ko} OK, ${ko} problème(s)`);
  process.exit(ko ? 1 : 0);
});
