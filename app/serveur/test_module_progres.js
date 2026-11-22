// Test de la progression partagée du module : node app/serveur/test_module_progres.js
// Deux appareils (le PC et le Raspberry) envoient leur progression : la plus récente gagne, l'ancienne est gardée,
// un appareil non appairé ou un invité n'y a pas accès.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const { createServer } = require("./serveur");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-module-"));
fs.mkdirSync(path.join(T, "media"), { recursive: true });
const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal);
if (!lan) { console.log("PAS D'ADRESSE RÉSEAU : test impossible ici"); process.exit(1); }
const PORT = 19000 + Math.floor(Math.random() * 900);
let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) ok++; else { ko++; console.log("ÉCHEC :", what); } };
function req(p, { body, tok, method } = {}) {
  return new Promise((resolve, reject) => {
    const h = {}; if (tok) h.Authorization = "Bearer " + tok; if (body !== undefined) h["Content-Type"] = "application/json";
    const r = http.request({ host: lan.address, port: PORT, path: p, method: method || (body !== undefined ? "POST" : "GET"), headers: h }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => { let json = null; try { json = JSON.parse(Buffer.concat(ch)); } catch (_) {} resolve({ status: res.statusCode, json }); });
    });
    r.on("error", reject); if (body !== undefined) r.write(typeof body === "string" ? body : JSON.stringify(body)); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// une progression gardée sous l'ancien nom du dossier (avant novembre 2026) : reprise au démarrage
const ANCIEN = path.join(T, "data", Buffer.from("bW9uZGUzZA==", "base64").toString());
fs.mkdirSync(ANCIEN, { recursive: true });
fs.writeFileSync(path.join(ANCIEN, "progression.json"), JSON.stringify({ v: 1, at: 500, appareil: "PC", data: { a: 1 } }));

(async () => {
  const S = createServer({ port: PORT, webDir: path.join(__dirname, "..", "..", "web"), dataDir: path.join(T, "data"), mediaRoots: [path.join(T, "media")], retroarch: "/nonexistent", version: "test" });
  await S.start(); await wait(300);
  const pair = async (name) => { await req("/api/pair/request", { body: { name } }); return (await req("/api/pair", { body: { code: S.pairing.code, name } })).json.token; };
  const pc = await pair("PC du salon"), pi = await pair("Raspberry");
  check(pc && pi, "appairage de deux appareils");

  check((await req("/api/module")).status === 401, "sans appairage : refusé");
  const g0 = (await req("/api/module", { tok: pc })).json;
  check(g0 && g0.ok && g0.at === 500 && g0.data.data.a === 1, "au début : la progression d'avant le changement de nom est reprise");
  check(!fs.existsSync(ANCIEN) && fs.existsSync(path.join(T, "data", "module", "progression.json")), "ancien dossier renommé (rien n'est perdu)");

  const prog = (at, n, ou) => ({ v: 1, at, appareil: ou, data: { a: n } });
  const p1 = (await req("/api/module", { tok: pc, body: prog(1000, 3, "PC") })).json;
  check(p1 && p1.ok && p1.at === 1000, "le PC envoie sa progression");
  const g1 = (await req("/api/module", { tok: pi })).json;
  check(g1.at === 1000 && g1.data.data.a === 3 && g1.data.appareil === "PC", "le Raspberry la retrouve");

  // le Raspberry joue ensuite : sa progression, plus récente, gagne
  const p2 = (await req("/api/module", { tok: pi, body: prog(2000, 5, "Raspberry") })).json;
  check(p2.ok && p2.at === 2000, "progression plus récente : gardée");
  // le PC, resté hors ligne, renvoie une vieille progression : refusée, et le serveur lui rend la plus récente
  const p3 = (await req("/api/module", { tok: pc, body: prog(1500, 4, "PC") })).json;
  check(p3.ok === false && p3.newer && p3.at === 2000 && p3.data.data.a === 5, "progression plus ancienne : refusée, la plus récente est rendue");
  const p4 = (await req("/api/module", { tok: pc, body: prog(2000, 9, "PC") })).json;
  check(p4.ok === false && p4.newer, "même date : la copie du serveur reste");
  check((await req("/api/module", { tok: pc })).json.data.data.a === 5, "la plus récente est toujours là");

  // l'ancienne est gardée de côté (3 au plus)
  for (const at of [3000, 4000, 5000, 6000]) await req("/api/module", { tok: pc, body: prog(at, at / 1000, "PC") });
  const olds = fs.readdirSync(path.join(T, "data", "module")).filter((n) => n.startsWith("ancienne-"));
  check(olds.length === 3 && olds.includes("ancienne-5000.json") && !olds.includes("ancienne-1000.json"), "anciennes progressions gardées (3 au plus)");

  // demandes mal formées
  check((await req("/api/module", { tok: pc, body: "pas du json" })).status === 400, "corps illisible : refusé");
  check((await req("/api/module", { tok: pc, body: { at: -5 } })).status === 400, "date absente ou fausse : refusée");
  check((await req("/api/module", { tok: pc, body: [1, 2] })).status === 400, "tableau : refusé");
  const big = JSON.stringify({ at: 9e12, x: "a".repeat(1100000) });
  const rb = await req("/api/module", { tok: pc, body: big }).catch(() => ({ status: "coupée" }));
  check(rb.status === 400 || rb.status === "coupée", "plus de 1 Mo : refusé (ou demande coupée)");
  check((await req("/api/module", { tok: pc })).json.at === 6000, "rien n'a été abîmé");

  // un invité (ami d'une séance) n'y a pas accès
  S.cfg.invites = [{ code: "AB12CD", until: Date.now() + 3600000 }];
  const g = (await req("/api/pair", { body: { invite: "AB12CD", name: "Ami" } })).json;
  check(g && g.token, "invité appairé");
  check((await req("/api/module", { tok: g.token })).status === 403 && (await req("/api/module", { tok: g.token, body: prog(9000, 1, "Ami") })).status === 403, "invité : ni lecture ni écriture");
  check((await req("/api/module", { tok: pi })).json.at === 6000, "l'invité n'a rien changé");

  await S.stop();
  fs.rmSync(T, { recursive: true, force: true });
  console.log(`${ok} vérifications réussies, ${ko} échec${ko > 1 ? "s" : ""}`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
