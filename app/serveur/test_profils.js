// Test des profils de la famille (serveur) : node app/serveur/test_profils.js
// Vérifie : « Continuer à regarder » partagé (le plus récent gagne, effacement propagé, retrait de « Reprendre » sans
// effacer l'historique, profil reconnu par son nom),
// refus pour les invités et sans appairage, et l'âge conseillé lu dans les .nfo posés à côté des films et séries.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const { createServer } = require("./serveur");
const { createProfils, nfoCert, applyNfo } = require("./profils");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-profils-"));
let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) ok++; else { ko++; console.log("ÉCHEC :", what); } };
const put = (rel, data) => { const f = path.join(T, "media", rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };

// ---- 1. la fusion seule (sans réseau) ----
{
  const evs = [], P = createProfils({ dataDir: fs.mkdtempSync(path.join(T, "d")), emit: (e) => evs.push(e) });
  let r = P.merge("Léa", { a: { pct: 40, at: 100, dev: "TV" }, b: { pct: 10, at: 50, dev: "TV" } });
  check(r.changed === 2, "deux titres enregistrés");
  r = P.merge("  LEA ", { a: { pct: 20, at: 90, dev: "Téléphone" } });
  check(r.changed === 0 && P.get("léa").a.pct === 40, "une position plus ancienne ne remplace pas la plus récente (et « LEA » = « Léa »)");
  r = P.merge("lea", { a: { pct: 70, at: 120, dev: "Téléphone", s: 1, e: 3 } });
  check(r.changed === 1 && P.get("Léa").a.pct === 70 && P.get("Léa").a.e === 3 && P.get("Léa").a.dev === "Téléphone", "la plus récente gagne");
  r = P.merge("Léa", { b: { at: 130, gone: true } });
  check(P.get("Léa").b.gone === true, "un titre effacé de l'historique est oublié partout");
  check(P.get("Léa").b.drop === undefined, "un effacement de l'historique reste un simple effacement (sans « drop »)");
  // « × » sur la jaquette de « Reprendre » : pierre tombale « drop » (les autres appareils gardent leur historique)
  P.merge("Léa", { c: { pct: 40, at: 200, dev: "TV", s: 1, e: 2 } });
  r = P.merge("Léa", { c: { at: 210, gone: true, drop: "oui" } });
  const c1 = P.get("Léa").c;
  check(r.changed === 1 && c1.gone === true && c1.drop === true && c1.pct === undefined && c1.s === undefined, "retiré de « Reprendre » : pierre tombale « drop », sans position ni épisode");
  r = P.merge("Léa", { c: { pct: 45, at: 205, dev: "TV" } });
  check(r.changed === 0 && P.get("Léa").c.gone === true, "une position plus ancienne (la TV) ne fait pas revenir un titre retiré de « Reprendre »");
  r = P.merge("Léa", { c: { pct: 40, at: 230, dev: "Ordinateur", s: 1, e: 2 } });
  check(r.changed === 1 && !P.get("Léa").c.gone && !P.get("Léa").c.drop && P.get("Léa").c.pct === 40 && P.get("Léa").c.e === 2, "relancé (ou « Annuler ») : la position plus récente remet le titre");
  check(P.merge("", { a: { at: 1 } }) === null, "profil sans nom refusé");
  P.merge("Léa", { x: { pct: "abc", at: "nan" } });
  check(!P.get("Léa").x, "donnée invalide ignorée");
  check(Object.keys(P.get("Tom")).length === 0, "chaque profil a sa propre liste");
}

// ---- 2. âge conseillé dans les .nfo ----
{
  const film = put("Films/Marée basse (2019)/maree.basse.mkv", "V"); put("Films/Marée basse (2019)/maree.basse.nfo", "<movie><title>Marée basse</title><mpaa>FR:-12</mpaa></movie>");
  const film2 = put("Films/Quai 9.mkv", "V"); put("Films/Quai 9.nfo", "<movie><certification>PG-13</certification></movie>");
  const ep = put("Series/Les Veilleurs/Saison 1/S01E01.mkv", "V"); put("Series/Les Veilleurs/tvshow.nfo", "<tvshow><mpaa>TV-14</mpaa></tvshow>");
  check(nfoCert(path.join(T, "media/Films/Quai 9.nfo")) === "PG-13", "balise <certification> lue");
  const items = [{ kind: "film", file: film, pub: {} }, { kind: "film", file: film2, pub: {} }, { kind: "serie", dir: path.join(T, "media/Series/Les Veilleurs"), episodes: [{ file: ep }], pub: {} }, { kind: "film", file: put("Films/Sans.mkv", "V"), pub: {} }];
  check(applyNfo(items) === 3, "trois fiches classées");
  check(items[0].pub.cert === "FR:-12" && items[2].pub.cert === "TV-14" && !items[3].pub.cert, "âge recopié dans la fiche publique");
}

// ---- 3. par le serveur (appairage, invité) ----
const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal);
if (!lan) { console.log("PAS D'ADRESSE RÉSEAU : partie serveur non testée"); finish(); }
const PORT = 19000 + Math.floor(Math.random() * 900);
function req(p, { body, tok, host = lan && lan.address } = {}) {
  return new Promise((resolve, reject) => {
    const h = {}; if (tok) h.Authorization = "Bearer " + tok; if (body) h["Content-Type"] = "application/json";
    const r = http.request({ host, port: PORT, path: p, method: body ? "POST" : "GET", headers: h }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => { let json = null; try { json = JSON.parse(Buffer.concat(ch)); } catch (_) {} resolve({ status: res.statusCode, json }); });
    });
    r.on("error", reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
function finish() { console.log(`${ok} vérifications réussies, ${ko} échec(s)`); try { fs.rmSync(T, { recursive: true, force: true }); } catch (_) {} process.exit(ko ? 1 : 0); }

if (lan) (async () => {
  const S = createServer({ port: PORT, webDir: path.join(__dirname, "..", "..", "web"), dataDir: path.join(T, "data"), mediaRoots: [path.join(T, "media")], version: "test" });
  await S.start();
  try {
    const r0 = await req("/api/resume?p=" + encodeURIComponent("Léa")); check(r0.status === 401, "sans appairage : refusé " + r0.status);
    // appairage d'un appareil (code demandé, lu côté serveur)
    await req("/api/pair/request", { body: { name: "Téléphone de Léa" } });
    const pair = await req("/api/pair", { body: { code: S.pairing.code, name: "Téléphone de Léa" } });
    const tok = pair.json && pair.json.token; check(!!tok, "appareil appairé");
    let r = await req("/api/resume", { tok, body: { p: "Léa", dev: "Téléphone", entries: { "d:film:Quai 9": { pct: 35, at: 1000, dev: "Téléphone" } } } });
    check(r.json && r.json.ok && r.json.changed === 1, "position envoyée");
    r = await req("/api/resume", { host: "127.0.0.1", body: { p: "lea", dev: "TV", entries: { "d:film:Quai 9": { pct: 10, at: 900, dev: "TV" } } } });
    check(r.json && r.json.ok && r.json.changed === 0 && r.json.entries["d:film:Quai 9"].pct === 35, "la TV reçoit la position plus récente du téléphone");
    r = await req("/api/resume?p=" + encodeURIComponent("LÉA"), { tok });
    check(r.json && r.json.entries["d:film:Quai 9"].dev === "Téléphone", "lecture de la liste du profil");
    // retiré de « Reprendre » sur l'ordinateur : la TV et le téléphone le reçoivent, l'ancienne position de la TV ne le remet pas
    r = await req("/api/resume", { tok, body: { p: "Léa", dev: "Ordinateur", entries: { "d:film:Quai 9": { at: 1100, gone: true, drop: true } } } });
    check(r.json && r.json.ok && r.json.changed === 1 && r.json.entries["d:film:Quai 9"].drop === true, "retrait de « Reprendre » envoyé au serveur");
    r = await req("/api/resume", { host: "127.0.0.1", body: { p: "lea", dev: "TV", entries: { "d:film:Quai 9": { pct: 35, at: 1000, dev: "TV" } } } });
    check(r.json && r.json.changed === 0 && r.json.entries["d:film:Quai 9"].gone === true && r.json.entries["d:film:Quai 9"].drop === true, "la TV ne fait pas revenir le titre avec son ancienne position");
    r = await req("/api/resume?p=" + encodeURIComponent("Léa"), { tok });
    check(r.json && r.json.entries["d:film:Quai 9"].drop === true, "le téléphone lit le retrait (pierre tombale « drop »)");
    // un ami invité (séance) ne voit ni ne change l'historique de la famille
    const inv = await req("/api/invite", { host: "127.0.0.1", body: {} });
    const code = inv.json && (inv.json.code || inv.json.invite);
    if (code) {
      const g = await req("/api/pair", { body: { invite: code, name: "Ami" } });
      check(g.json && g.json.guest, "invité relié");
      check((await req("/api/resume?p=" + encodeURIComponent("Léa"), { tok: g.json.token })).status === 403, "invité : historique de la famille refusé");
    } else console.log("(invitation non testée : réponse inattendue)", inv.json);
    check(fs.existsSync(path.join(T, "data", "reprise.json")), "positions gardées sur le disque du serveur");
  } catch (e) { ko++; console.log("ÉCHEC :", e.message); }
  await (S.stop ? S.stop() : null);
  finish();
})();
