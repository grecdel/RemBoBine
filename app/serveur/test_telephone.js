// Test du téléphone (voisins, volume, séances programmées) : node app/serveur/test_telephone.js
// Deux faux Rembobine qui s'annoncent l'un à l'autre (UDP sur 127.0.0.1), un téléphone qui demande « qui est là ? »,
// des faux outils de volume (cec-ctl, wpctl), et un vrai serveur pour les séances programmées et leur rappel.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http"), dgram = require("dgram");
const { createTelephone } = require("./telephone");
const { createServer } = require("./serveur");

let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) ok++; else { ko++; console.log("ÉCHEC :", what); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => 30000 + Math.floor(Math.random() * 20000);

(async () => {
  // ---- 1. deux Rembobine dans la maison ----
  const pA = rnd(), pB = pA + 1;
  const A = createTelephone({ S: { cfg: { name: "Salon" }, port: 8080, version: "t" }, udpPort: pA, udpTargets: [`127.0.0.1:${pB}`], announceMs: 150 });
  const B = createTelephone({ S: { cfg: { name: "Chambre" }, port: 8081, version: "t" }, udpPort: pB, udpTargets: [`127.0.0.1:${pA}`], announceMs: 150 });
  await wait(700);
  const va = A.voisins(), vb = B.voisins();
  check(va.length === 1 && va[0].name === "Chambre" && va[0].url === "http://127.0.0.1:8081", "le Salon voit la Chambre : " + JSON.stringify(va));
  check(vb.length === 1 && vb[0].name === "Salon" && vb[0].url === "http://127.0.0.1:8080", "la Chambre voit le Salon : " + JSON.stringify(vb));
  // un téléphone demande « qui est là ? »
  const phone = dgram.createSocket("udp4"), got = [];
  phone.on("message", (m) => { try { got.push(JSON.parse(m)); } catch (_) {} });
  await new Promise((r) => phone.bind(0, r));
  phone.send(Buffer.from(JSON.stringify({ rbb: 1, q: 1 })), pA, "127.0.0.1");
  phone.send(Buffer.from("n'importe quoi"), pA, "127.0.0.1");
  await wait(300);
  check(got.length === 1 && got[0].name === "Salon" && got[0].port === 8080, "le téléphone reçoit la réponse du Salon");
  phone.close(); A.stop(); B.stop();

  // ---- 2. volume ----
  const calls = [];
  const fakeSpawn = (bin, args) => { calls.push([bin, ...args].join(" ")); return { status: /cec-ctl/.test(bin) && process.env.NO_CEC ? 1 : 0 }; };
  let tools = { "cec-ctl": "/usr/bin/cec-ctl", wpctl: "/usr/bin/wpctl" };
  const S2 = { cfg: { name: "x" }, port: 1, player: null };
  const V = createTelephone({ S: S2, udp: false, spawnSync: fakeSpawn, which: (x) => tools[x] || "", exists: (d) => d === "/dev/cec0", playerCmd: async (b) => ({ ok: true, cmd: b.cmd }) });
  let r = await V.volume("up");
  check(r.ok && r.via === "tv" && calls.some((c) => /cec-ctl -d \/dev\/cec0 --to 5 --user-control-pressed ui-cmd=volume-up/.test(c)), "sans film : volume de la télé par HDMI-CEC");
  tools = { wpctl: "/usr/bin/wpctl" }; calls.length = 0;
  r = await V.volume("down");
  check(r.ok && r.via === "systeme" && /wpctl set-volume -l 1.2 @DEFAULT_AUDIO_SINK@ 5%-/.test(calls[0] || ""), "sans CEC : volume de la machine (PipeWire)");
  S2.player = { title: "Film" };
  r = await V.volume("up");
  check(r.ok && r.via === "lecteur" && r.cmd === "volup", "film en cours : volume du lecteur");
  r = await V.volume("fort");
  check(!r.ok, "sens inconnu refusé");
  V.stop();

  // ---- 3. séances programmées (vrai serveur, appelé comme la TV elle-même) ----
  const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-tel-"));
  const PORT = 19500 + Math.floor(Math.random() * 400);
  const S = createServer({ port: PORT, dataDir: path.join(T, "data"), mediaRoots: [path.join(T, "media")], version: "test", voisins: false });
  await S.start(); await wait(200);
  const req = (p, body) => new Promise((resolve, reject) => {
    const q = http.request({ host: "127.0.0.1", port: PORT, path: p, method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {} }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => { let j = null; try { j = JSON.parse(Buffer.concat(ch)); } catch (_) {} resolve({ status: res.statusCode, json: j }); });
    }); q.on("error", reject); if (body) q.write(JSON.stringify(body)); q.end();
  });
  const evs = [];
  const es = http.get({ host: "127.0.0.1", port: PORT, path: "/api/stream" }, (res) => { let b = ""; res.on("data", (d) => { b += d; let i; while ((i = b.indexOf("\n\n")) >= 0) { const l = b.slice(0, i); b = b.slice(i + 2); if (l.startsWith("data: ")) try { evs.push(JSON.parse(l.slice(6))); } catch (_) {} } }); });
  await wait(200);
  const v = await req("/api/voisins");
  check(v.status === 200 && v.json && Array.isArray(v.json.voisins) && v.json.self.name, "/api/voisins répond (sans appairage)");
  r = (await req("/api/seances", { add: { at: Date.now() + 5 * 60000, title: "Horizon Rouge", code: "ab12" } })).json;
  check(r && r.ok && r.seance.code === "AB12", "séance programmée");
  await wait(150);
  const rap = evs.find((e) => e.type === "seance-rappel");
  check(rap && /Horizon Rouge/.test(rap.msg) && /AB12/.test(rap.msg), "rappel envoyé 10 minutes avant : " + (rap && rap.msg));
  r = (await req("/api/seances", { add: { at: Date.now() + 3 * 86400000, title: "Plus tard" } })).json;
  let L = (await req("/api/seances")).json.seances;
  check(L.length === 2 && L[0].title === "Horizon Rouge" && L[1].title === "Plus tard", "liste triée par date");
  check(evs.filter((e) => e.type === "seance-rappel").length === 1, "pas de rappel pour une séance dans 3 jours");
  check(!(await req("/api/seances", { add: { at: Date.now() - 86400000, title: "Hier" } })).json.ok, "date passée refusée");
  await req("/api/seances", { del: r.seance.id });
  L = (await req("/api/seances")).json.seances;
  check(L.length === 1, "séance supprimée");
  const inv = (await req("/api/invite", { code: "SOIR", at: Date.now() + 10 * 86400000 })).json;
  check(inv.ok && inv.until > Date.now() + 10 * 86400000, "invitation valable jusqu'au lendemain de la séance programmée");
  const vol = (await req("/api/tel/volume", { dir: "up" })).json;
  check(vol && typeof vol.ok === "boolean", "/api/tel/volume répond");
  es.destroy(); await S.stop();
  fs.rmSync(T, { recursive: true, force: true });

  console.log(`Téléphone : ${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
