// Rembobine — la progression du module facultatif, partagée entre les appareils de la maison (PC, Raspberry…).
//   GET  /api/module           → la dernière progression connue ({ ok, at, data }) ; at = 0 s'il n'y en a pas encore.
//   POST /api/module           → { at, ... } : gardée seulement si elle est PLUS RÉCENTE que celle du serveur
//                                 (la plus récente gagne ; sinon on répond avec celle du serveur, que l'appareil reprend).
// L'ancienne progression est gardée de côté (3 au plus). Pas d'accès invité. Rien ici n'appelle internet.
"use strict";
const fs = require("fs");
const path = require("path");

// dossier gardé avant le changement de nom (novembre 2026) : repris tel quel au premier démarrage
const ANCIEN = Buffer.from("bW9uZGUzZA==", "base64").toString();

function createModuleProgres(o) {
  const dir = path.join(o.dataDir, "module");
  try { const a = path.join(o.dataDir, ANCIEN); if (!fs.existsSync(dir) && fs.existsSync(a)) fs.renameSync(a, dir); } catch (_) {}
  const file = path.join(dir, "progression.json");
  const read = () => { try { const j = JSON.parse(fs.readFileSync(file, "utf8")); return j && typeof j === "object" ? j : null; } catch (_) { return null; } };

  // corps JSON de la demande (le serveur en lit 1 Mo au plus : au-delà, il donne un objet vide)
  const readBody = (req, h) => h.body ? h.body(req) : new Promise((resolve) => {
    const ch = []; req.on("data", (d) => ch.push(d)); req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(ch).toString("utf8"))); } catch (_) { resolve(null); } });
  });

  async function route(req, res, p, url, W, h) {
    if (p !== "/api/module") return false;
    if (W && W.guest) return h.send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." });
    const cur = read();
    if (req.method === "GET" || req.method === "HEAD") return h.send(res, 200, { ok: true, at: cur ? Number(cur.at) || 0 : 0, data: cur });
    if (req.method !== "POST" && req.method !== "PUT") return h.send(res, 405, { ok: false });
    const b = await readBody(req, h);
    if (!b || typeof b !== "object" || Array.isArray(b) || !Number.isFinite(Number(b.at)) || Number(b.at) <= 0) return h.send(res, 400, { ok: false, err: "Progression illisible." });
    const at = Number(b.at);
    // la plus récente gagne : une copie plus ancienne (ou égale) que celle du serveur est refusée
    if (cur && (Number(cur.at) || 0) >= at) return h.send(res, 200, { ok: false, newer: true, at: Number(cur.at) || 0, data: cur });
    fs.mkdirSync(dir, { recursive: true });
    if (cur) {
      try { fs.copyFileSync(file, path.join(dir, `ancienne-${Number(cur.at) || 0}.json`)); } catch (_) {}
      const olds = fs.readdirSync(dir).filter((n) => /^ancienne-\d+\.json$/.test(n)).sort((a, c) => Number(a.slice(9, -5)) - Number(c.slice(9, -5)));
      while (olds.length > 3) { try { fs.unlinkSync(path.join(dir, olds.shift())); } catch (_) {} }
    }
    fs.writeFileSync(file + ".tmp", JSON.stringify(b)); fs.renameSync(file + ".tmp", file);
    if (o.emit) o.emit({ type: "module", at });
    return h.send(res, 200, { ok: true, at });
  }

  return { route, read };
}

module.exports = { createModuleProgres };
