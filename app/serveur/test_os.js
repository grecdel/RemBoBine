// Test de Rembobine OS côté serveur : node app/serveur/test_os.js (Linux, sans internet)
//  - état de la machine (température, Wi-Fi, mémoire, disques) et alerte « disque presque plein » ;
//  - extinction / redémarrage (faux systemctl), refusés aux invités ;
//  - mises à jour avec un FAUX GitHub : vérification, téléchargement vérifié, installation à côté, bascule,
//    gardien qui confirme une version qui démarre et REVIENT à l'ancienne quand la nouvelle ne répond pas ;
//    mise à jour par fichier (clé USB) ; Windows : simple téléchargement ;
//  - sauvegarde complète (page, serveur, sauvegardes de jeux) sur le disque et sur une « clé USB », restauration.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http"), crypto = require("crypto"), zlib = require("zlib");
const { spawnSync, spawn } = require("child_process");
const { createServer } = require("./serveur");
const { createMaj } = require("./maj");
const { createSysteme, diskLow } = require("./systeme");
const { createSauvegarde } = require("./sauvegarde");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-os-"));
let ok = 0, ko = 0;
const check = (c, w) => { if (c) ok++; else { ko++; console.log("ÉCHEC :", w); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = (f, data, mode) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); if (mode) fs.chmodSync(f, mode); };
const GO = 1e9;

// ---------- une « version » de Rembobine : son lanceur démarre un faux serveur qui répond /api/info avec son numéro ----------
const FAKEAPP = path.join(T, "fakeapp.js");
mk(FAKEAPP, `const http=require("http");const [label,port,mode]=process.argv.slice(2);
if(mode==="casse")process.exit(1);
http.createServer((q,r)=>{r.writeHead(200,{"Content-Type":"application/json"});r.end(JSON.stringify({api:1,build:label}))}).listen(Number(port),"127.0.0.1");
setTimeout(()=>process.exit(0),20000);`);
function version(dir, label, port, mode = "") {
  mk(path.join(dir, "rembobine-bin"), "#!/bin/sh\nexit 0\n", 0o755);
  mk(path.join(dir, "rembobine"), `#!/bin/sh\nexec "${process.execPath}" "${FAKEAPP}" "${label}" ${port} ${mode}\n`, 0o755);
  mk(path.join(dir, "resources", "app", "main.js"), "// faux");
  mk(path.join(dir, "resources", "app", "build.json"), JSON.stringify({ version: "1.0.0", build: Number(label.split("+")[1]), label, date: "2026-11-0" + label.split("+")[1] }));
}
function archive(label, port, mode) {
  const src = path.join(T, "src-" + label, "Rembobine-Linux-x64"); version(src, label, port, mode);
  const out = path.join(T, `arch-${label}.tar.gz`); spawnSync("tar", ["czf", out, "-C", path.dirname(src), "Rembobine-Linux-x64"]);
  return out;
}

(async () => {
  // ================= 1. état de la machine =================
  const th = path.join(T, "thermal"); mk(path.join(th, "thermal_zone0", "type"), "acpitz\n"); mk(path.join(th, "thermal_zone0", "temp"), "41000\n");
  mk(path.join(th, "thermal_zone1", "type"), "cpu-thermal\n"); mk(path.join(th, "thermal_zone1", "temp"), "58312\n");
  const wl = path.join(T, "wireless"); mk(wl, "Inter-| sta-|   Quality        |   Discarded packets\n face | tus | link level noise |  nwid  crypt\n wlan0: 0000   49.  -61.  -256        0      0\n");
  const M = path.join(T, "media"); fs.mkdirSync(M);
  let fakeFree = 50 * GO;
  const statfs = () => ({ blocks: 100 * GO / 4096, bsize: 4096, bavail: fakeFree / 4096, bfree: fakeFree / 4096 });
  const alerts = [];
  const SY = createSysteme({ roots: [M], paths: { thermal: th, wireless: wl }, ssid: "Maison", statfs, emit: (e) => alerts.push(e) });
  const e = SY.etat();
  check(e.temp === 58.3, "température : la zone du processeur est choisie (" + e.temp + ")");
  check(e.wifi && e.wifi.signal === 70 && e.wifi.dbm === -61 && e.wifi.ssid === "Maison", "Wi-Fi : force du signal en % et en dBm, nom du réseau");
  check(e.mem.total > 0 && e.mem.used > 0 && e.mem.used <= e.mem.total && e.uptime > 0, "mémoire utilisée et durée depuis le démarrage");
  check(e.disks.length >= 1 && e.disks[0].name === "Rembobine" && !e.disks[0].low, "disque des médias, pas d'alerte à 50 %");
  check(diskLow({ total: 100 * GO, free: 4 * GO }) && diskLow({ total: 20 * GO, free: 1.5 * GO }) && !diskLow({ total: 1000 * GO, free: 60 * GO }), "seuils : moins de 5 % ou moins de 2 Go");
  fakeFree = 1.2 * GO; SY.checkDisks(); SY.checkDisks();
  check(alerts.filter((a) => a.type === "alert" && /presque plein.*1,2 Go/.test(a.msg)).length >= 1 && alerts.length <= 2, "alerte « disque presque plein » envoyée une fois (pas à chaque vérification)");
  check(SY.etat().low.length >= 1, "le disque plein est signalé dans l'état");
  SY.stop(); fakeFree = 50 * GO;

  // ================= 2. sauvegarde complète =================
  const H = path.join(T, "home"), D = path.join(T, "data"), USB = path.join(T, "usb");
  fs.mkdirSync(D, { recursive: true }); fs.mkdirSync(USB);
  mk(path.join(D, "serveur.json"), JSON.stringify({ name: "Salon", tokens: [{ hash: "a" }], cards: { "04AA": { title: "Horizon" } } }));
  mk(path.join(D, "progression.json"), JSON.stringify({ film1: { pos: 1234 } }));
  mk(path.join(D, "fiches", "grosse-jaquette.jpg"), Buffer.alloc(5000));
  mk(path.join(H, ".config", "retroarch", "saves", "Turbo Kart.srm"), "SAUVE-SNES");
  mk(path.join(H, ".config", "ppsspp", "PSP", "SAVEDATA", "ULES0001", "DATA.BIN"), "SAUVE-PSP");
  mk(path.join(M, "Sauvegardes", "Gamecube", "carte.raw"), "CARTE");
  let reloaded = 0;
  const SV = createSauvegarde({ data: D, roots: [M], home: H, usbDirs: [USB], version: "1.0.0+5", name: () => "Salon", reload: () => reloaded++ });
  const page = { "gamebox.v1": JSON.stringify({ cfg: { decoPays: "France", nfcCards: { "04AA": { title: "Horizon" } } } }) };
  const c1 = SV.create("local", page);
  check(c1.ok && /^local:Rembobine-sauvegarde-/.test(c1.file) && c1.page, "sauvegarde sur Rembobine, avec l'état de la page");
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(SV.resolve(c1.file))).toString());
  const rels = raw.files.map((f) => f.z + ":" + f.rel);
  check(rels.includes("serveur:serveur.json") && rels.includes("serveur:progression.json") && !rels.some((r) => /jaquette/.test(r)), "serveur : réglages et positions de lecture, pas le cache des jaquettes");
  check(rels.includes("retroarch:Turbo Kart.srm") && rels.includes("ppsspp:ULES0001/DATA.BIN") && rels.includes("rembobine:Gamecube/carte.raw"), "sauvegardes de jeux (RetroArch, PPSSPP, dossier Rembobine/Sauvegardes)");
  const c2 = SV.create("usb");
  check(c2.ok && c2.file.startsWith("usb:") && fs.readdirSync(path.join(USB, "Rembobine-sauvegardes")).length === 1, "sauvegarde sur la clé USB");
  check(SV.list().length === 2 && SV.list().some((x) => x.where === "clé USB"), "les deux sauvegardes sont listées");
  fs.writeFileSync(path.join(H, ".config", "retroarch", "saves", "Turbo Kart.srm"), "PERDU"); fs.unlinkSync(path.join(H, ".config", "ppsspp", "PSP", "SAVEDATA", "ULES0001", "DATA.BIN"));
  fs.writeFileSync(path.join(D, "progression.json"), "{}");
  const r1 = SV.restore(c1.file);
  check(r1.ok && r1.page && r1.page["gamebox.v1"].includes("nfcCards"), "restauration : l'état de la page revient (pour l'écran)");
  check(fs.readFileSync(path.join(H, ".config", "retroarch", "saves", "Turbo Kart.srm"), "utf8") === "SAUVE-SNES" && fs.existsSync(path.join(H, ".config", "ppsspp", "PSP", "SAVEDATA", "ULES0001", "DATA.BIN")), "restauration : sauvegardes de jeux remises");
  check(JSON.parse(fs.readFileSync(path.join(D, "progression.json"), "utf8")).film1.pos === 1234 && reloaded === 1, "restauration : positions de lecture remises, serveur relu");
  const evil = zlib.gzipSync(JSON.stringify({ rembobineSauvegarde: 1, files: [{ z: "retroarch", rel: "../../../evade.txt", b64: "eA==" }, { z: "serveur", rel: "autre.sh", b64: "eA==" }] }));
  const r2 = SV.restoreBuffer(evil);
  check(r2.ok && r2.files === 0 && !fs.existsSync(path.join(H, "evade.txt")), "un fichier piégé ne peut rien écrire hors des dossiers prévus");
  check(SV.restore("local:../../etc/passwd").ok === false && SV.restoreBuffer(Buffer.from("n'importe quoi")).ok === false, "noms inventés et fichiers étrangers refusés");
  SV.stop();

  // ================= 3. mises à jour (faux GitHub) =================
  const APPPORT = 19000 + Math.floor(Math.random() * 900);
  const rel = { body: "Nouveautés de test", files: {} }; let published = null;
  const gh = http.createServer((q, r) => {
    const p = new URL(q.url, "http://x").pathname, N = `http://127.0.0.1:${gh.address().port}`;
    const json = (o) => { r.writeHead(200, { "Content-Type": "application/json" }); r.end(JSON.stringify(o)); };
    if (p === "/gh/repos/grecdel/Rembobine/releases/tags/v1.0.0") return json({ tag_name: "v1.0.0", body: rel.body, assets: [{ name: "build.json", browser_download_url: N + "/dl/build.json", size: 100 },
      ...Object.keys(rel.files).map((n) => ({ name: n, size: rel.files[n].length, browser_download_url: N + "/dl/" + n }))] });
    if (p === "/dl/build.json") return json(published);
    const n = p.slice(4); if (rel.files[n]) { r.writeHead(200, { "Content-Length": rel.files[n].length }); return r.end(rel.files[n]); }
    r.writeHead(404); r.end();
  });
  await new Promise((r) => gh.listen(0, "127.0.0.1", r));
  const API = `http://127.0.0.1:${gh.address().port}/gh`;
  const publish = (label, buf, opts = {}) => { if (!Buffer.isBuffer(buf)) buf = fs.readFileSync(buf); rel.files["Rembobine-Linux-PC.tar.gz"] = buf; rel.files["Rembobine-RaspberryPi.tar.gz"] = buf; rel.files["Rembobine-Windows.zip"] = Buffer.from("ZIP");
    published = { version: "1.0.0", build: Number(label.split("+")[1]), label, date: "2026-11-02", files: Object.keys(rel.files).map((n) => ({ name: n, size: rel.files[n].length, sha256: opts.badSha && n.endsWith(".tar.gz") ? "0".repeat(64) : crypto.createHash("sha256").update(rel.files[n]).digest("hex") })) }; };

  // installation versionnée existante : 1.0.0+1
  const B = path.join(T, "opt"), V1 = path.join(B, "versions", "1.0.0+1");
  version(V1, "1.0.0+1", APPPORT); fs.symlinkSync(path.join("versions", "1.0.0+1"), path.join(B, "actuelle")); fs.symlinkSync(path.join("actuelle", "rembobine"), path.join(B, "rembobine"));
  const dummy = () => spawn(process.execPath, ["-e", "setTimeout(()=>{},300)"]).pid;   // « l'ancienne appli » qui se ferme
  const cfg = { update: { auto: false } }; const quits = [];
  const mkMaj = (cur, extra = {}) => createMaj({ data: path.join(T, "data-" + cur), build: { version: "1.0.0", build: Number(cur.split("+")[1]), label: cur }, appDir: path.join(B, "versions", cur),
    roots: [M], port: APPPORT, kiosk: false, cfg: () => cfg, api: API, quit: () => quits.push(cur), node: process.execPath, pid: dummy(), gardeTimeout: 6000, quitDelay: 0, platform: "linux", arch: "x64", usbDirs: [USB], mountsFile: "/nonexistent", ...extra });
  const link = () => fs.readlinkSync(path.join(B, "actuelle"));
  const etat = () => JSON.parse(fs.readFileSync(path.join(B, "maj-etat.json"), "utf8"));
  const until = async (f, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (f()) return true; await wait(200); } return false; };
  const essai = () => fs.existsSync(path.join(B, "maj-essai.json"));

  fs.mkdirSync(path.join(T, "data-1.0.0+1"), { recursive: true });
  let MJ = mkMaj("1.0.0+1");
  check(MJ.layout.versioned && MJ.status().canInstall, "installation versionnée reconnue (dossier versions/ + raccourci « actuelle »)");
  publish("1.0.0+1", archive("1.0.0+1x", APPPORT));
  check((await MJ.check()).available === false, "même numéro de fabrication : rien à installer");
  publish("1.0.0+2", archive("1.0.0+2", APPPORT), { badSha: true });
  const bad = await MJ.apply();
  check(!bad.ok && /abîmé/.test(bad.err) && link() === "versions/1.0.0+1", "fichier téléchargé abîmé (empreinte) : refusé, rien ne change");
  publish("1.0.0+2", archive("1.0.0+2", APPPORT));
  const c = await MJ.check();
  check(c.available && c.latest === "1.0.0+2" && c.notes === "Nouveautés de test" && c.asset.name === "Rembobine-Linux-PC.tar.gz", "nouvelle fabrication trouvée sur GitHub (bonne archive pour un PC)");
  const a1 = await MJ.apply(); if (!a1.ok) console.log(a1);
  check(a1.ok && a1.restart && link() === "versions/1.0.0+2" && fs.existsSync(path.join(B, "versions", "1.0.0+1", "rembobine-bin")), "installée À CÔTÉ de l'ancienne, puis bascule");
  await wait(50); check(quits.length === 1, "l'ancienne version se ferme pour laisser la place");
  check(await until(() => !essai()), "le gardien a fini");
  check(etat().history[0].ok && etat().history[0].version === "1.0.0+2" && link() === "versions/1.0.0+2", "la nouvelle version répond sur /api/info : mise à jour confirmée");
  await wait(300);
  spawnSync("pkill", ["-f", FAKEAPP]); await wait(300);

  // version 3 cassée : le gardien remet la 2
  fs.mkdirSync(path.join(T, "data-1.0.0+2"), { recursive: true });
  MJ.stop(); MJ = mkMaj("1.0.0+2");
  publish("1.0.0+3", archive("1.0.0+3", APPPORT, "casse"));
  const a2 = await MJ.apply();
  check(a2.ok && link() === "versions/1.0.0+3", "version 3 installée et essayée");
  check(await until(() => !essai(), 20000), "le gardien a fini (60 s en vrai, 6 s ici)");
  check(link() === "versions/1.0.0+2" && etat().bad.includes("1.0.0+3") && etat().history[0].ok === false, "la version 3 ne démarre pas : RETOUR automatique à la version 2");
  await wait(300); spawnSync("pkill", ["-f", FAKEAPP]); await wait(200);
  const c3 = await MJ.check();
  check(!c3.available && /ignorée/.test(c3.err || ""), "la version cassée n'est plus proposée");

  // la nuit seulement, et seulement si activé
  MJ.stop(); MJ = mkMaj("1.0.0+2");
  check(await MJ.nightly(new Date(2026, 10, 3, 4, 0)) === null, "mises à jour automatiques désactivées : rien la nuit");
  cfg.update.auto = true;
  check(await MJ.nightly(new Date(2026, 10, 3, 14, 0)) === null, "activées, mais pas en pleine journée");
  const n1 = await MJ.nightly(new Date(2026, 10, 3, 4, 0));
  check(n1 && n1.ok === false && /à jour|ignorée/.test(n1.err), "activées : vérification à 4 h du matin");
  check(await MJ.nightly(new Date(2026, 10, 3, 4, 30)) === null, "une seule fois par nuit");
  cfg.update.auto = false;
  check(createMaj({ data: T, build: { label: "x", build: 1 }, cfg: () => ({}), isOs: true, platform: "linux" }).status().config.auto === true
    && createMaj({ data: T, build: { label: "x", build: 1 }, cfg: () => ({}), isOs: false, platform: "linux" }).status().config.auto === false, "par défaut : automatique sur Rembobine OS, pas ailleurs");

  // mise à jour par fichier (clé USB)
  fs.copyFileSync(archive("1.0.0+4", APPPORT), path.join(USB, "Rembobine-Linux-PC.tar.gz"));
  const st = MJ.status();
  check(st.usb.length === 1 && st.usb[0].where === "clé USB", "archive trouvée sur la clé USB");
  check((await MJ.fromFile("/etc/passwd")).ok === false, "un fichier hors de la liste est refusé");
  const u = await MJ.fromFile(st.usb[0].file);
  check(u.ok && link() === "versions/1.0.0+4", "mise à jour depuis la clé USB installée");
  check(await until(() => !essai(), 20000) && etat().history[0].version === "1.0.0+4" && etat().history[0].ok, "… et confirmée par le gardien");
  await wait(300); spawnSync("pkill", ["-f", FAKEAPP]); await wait(200);
  // retour manuel
  MJ.stop(); MJ = mkMaj("1.0.0+4");
  check(MJ.status().previous === "1.0.0+2", "version précédente connue");
  const rb = await MJ.rollback();
  check(rb.ok && link() === "versions/1.0.0+2" && etat().bad.includes("1.0.0+4"), "« Revenir à la version précédente »");
  await wait(1500); spawnSync("pkill", ["-f", FAKEAPP]);

  // Windows (ou appli simplement décompressée) : on télécharge et on prévient
  MJ.stop();
  const W = createMaj({ data: path.join(T, "dw"), build: { label: "1.0.0+1", build: 1 }, appDir: path.join(T, "Rembobine-Windows"), roots: [M], cfg: () => ({}), api: API, platform: "win32", arch: "x64" });
  const w = await W.apply();
  check(w.ok && w.downloaded === path.join(M, "MisesAJour", "Rembobine-Windows.zip") && fs.readFileSync(w.downloaded, "utf8") === "ZIP" && /décompresse/.test(w.msg), "Windows : la mise à jour est téléchargée dans Rembobine/MisesAJour, avec la marche à suivre");
  W.stop();

  // ================= 4. le serveur : /api/info, /api/system, extinction, invités =================
  const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal);
  const calls = [];
  const fakeRun = (cmd, args) => { calls.push([cmd, ...args].join(" ")); return { status: 0, stdout: cmd === "systemctl" && args[0] === "is-active" ? "inactive\n" : "" }; };
  const PORT = 18000 + Math.floor(Math.random() * 900);
  mk(path.join(T, "srv-build.json"), JSON.stringify({ version: "1.0.0", build: 57, label: "1.0.0+57", date: "2026-11-02" }));
  mk(path.join(T, "licences", "PCSX2-COPYING.txt"), "GNU GENERAL PUBLIC LICENSE");
  const S = createServer({ port: PORT, dataDir: path.join(T, "srv"), mediaRoots: [M], webDir: T,
    os: { buildFile: path.join(T, "srv-build.json"), isOs: true, run: fakeRun, which: () => "", powerDelay: 0, sysPaths: { thermal: th, wireless: wl }, ssid: "Maison", licencesDir: path.join(T, "licences"), home: H, usbDirs: [USB], updateApi: API } });
  await S.start();
  const req = (p, { body, tok, host = lan ? lan.address : "127.0.0.1" } = {}) => new Promise((res) => {
    const r = http.request({ host, port: PORT, path: p, method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) } }, (x) => { let d = ""; x.on("data", (c) => d += c); x.on("end", () => { let j = null; try { j = JSON.parse(d); } catch (_) {} res({ status: x.statusCode, json: j, text: d }); }); });
    r.end(body ? JSON.stringify(body) : undefined);
  });
  const info = (await req("/api/info", { host: "127.0.0.1" })).json;
  check(info.build === "1.0.0+57" && info.os === true && info.version === "1.0.0", "/api/info donne le numéro de fabrication (1.0.0+57)");
  const sys = (await req("/api/system", { host: "127.0.0.1" })).json;
  check(sys.version === "1.0.0+57" && sys.temp === 58.3 && sys.wifi.signal === 70 && sys.mem.used > 0 && sys.uptime > 0 && sys.disks.length >= 1, "/api/system : température, Wi-Fi, mémoire, disques, durée");
  check((await req("/api/licences", { host: "127.0.0.1" })).json.files.includes("PCSX2-COPYING.txt") && /GNU/.test((await req("/licences/PCSX2-COPYING.txt")).text), "textes des licences servis");
  if (lan) {
    check((await req("/api/system")).status === 401 && (await req("/api/power", { body: { action: "shutdown" } })).status === 401, "sans appairage : ni état, ni extinction");
    // un invité (séance à distance)
    S.cfg.invites = [{ code: "ABCDEF", until: Date.now() + 1e6 }];
    const g = (await req("/api/pair", { body: { invite: "ABCDEF", name: "Léa" } })).json;
    check((await req("/api/info", { tok: g.token })).json.guest === true, "/api/info dit à l'invité qu'il est invité (boutons cachés)");
    check((await req("/api/power", { tok: g.token, body: { action: "shutdown" } })).status === 403 && (await req("/api/backup", { tok: g.token })).status === 403 && (await req("/api/update", { tok: g.token, body: { action: "apply" } })).status === 403, "l'invité ne peut ni éteindre, ni sauvegarder, ni mettre à jour");
  }
  const pw = (await req("/api/power", { host: "127.0.0.1", body: { action: "reboot" } })).json; await wait(100);
  check(pw.ok && calls.includes("sudo -n /usr/bin/systemctl reboot"), "redémarrage propre : systemctl reboot (règle sudo limitée)");
  check((await req("/api/power", { host: "127.0.0.1", body: { action: "formater" } })).json.ok === false, "action inconnue refusée");
  calls.length = 0;
  const sh = (await req("/api/share", { host: "127.0.0.1" })).json;
  check(sh.installed === false || typeof sh.on === "boolean", "état du partage réseau");
  const bk = (await req("/api/backup", { host: "127.0.0.1", body: { action: "create", target: "local", page: { "gamebox.v1": "{}" } } })).json;
  check(bk.ok && (await req("/api/backup", { host: "127.0.0.1" })).json.length >= 2, "sauvegarde par le serveur (et la clé USB déjà là)");
  const dl = await req("/api/backup/file?f=" + encodeURIComponent(bk.file), { host: "127.0.0.1" });
  check(dl.status === 200 && dl.text.length > 20, "la sauvegarde se télécharge (pour la garder sur le PC)");
  const rs = (await req("/api/backup", { host: "127.0.0.1", body: { action: "restore", file: bk.file } })).json;
  check(rs.ok && rs.page === true, "restauration par le serveur");
  const pg1 = (await req("/api/backup/page", { host: "127.0.0.1" })).json, pg2 = (await req("/api/backup/page", { host: "127.0.0.1" })).json;
  check(pg1.page && pg1.page["gamebox.v1"] === "{}" && pg2.page === null, "l'écran de la TV récupère une fois l'état de la page restauré");
  const up = (await req("/api/update", { host: "127.0.0.1" })).json;
  check(up.current === "1.0.0+57" && up.config.auto === true && up.canInstall === false, "page Mises à jour : version, automatique sur Rembobine OS");
  await req("/api/config", { host: "127.0.0.1", body: { update: { auto: false } } });
  check((await req("/api/update", { host: "127.0.0.1" })).json.config.auto === false, "l'option « Mises à jour automatiques » se coupe");
  await S.stop(); gh.close();
  spawnSync("pkill", ["-f", FAKEAPP]);
  fs.rmSync(T, { recursive: true, force: true });
  console.log(`Rembobine OS : ${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.log("ERREUR", e); process.exit(1); });
