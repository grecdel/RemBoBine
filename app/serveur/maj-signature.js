// Rembobine — signature des mises à jour (Ed25519, sans dépendance : seulement le module crypto de Node).
// À la fabrication (ci/signer_maj.js), on fait la liste de TOUS les fichiers de la version (chemin, taille, empreinte
// SHA-256 ; liens symboliques : leur cible), et on signe cette liste avec la clé privée (secret GitHub RBB_UPDATE_KEY).
// La liste signée est rangée dans la version elle-même : resources/app/signature-maj.json.
// À l'installation (maj.js), après décompression À CÔTÉ de la version actuelle, on vérifie la signature avec la clé
// publique embarquée (maj-cle.js), puis que les fichiers décompressés sont exactement ceux de la liste
// (rien en plus, rien en moins, rien de modifié). Une archive modifiée, même avec une empreinte « build.json »
// cohérente, est refusée : l'empreinte publiée à côté du fichier ne suffit pas (elle vient du même endroit).
"use strict";
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const SIG_FILE = path.join("resources", "app", "signature-maj.json");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");   // en-tête d'une clé publique Ed25519 brute (32 octets)

function publicKeyOf(b64) {
  const raw = Buffer.from(String(b64 || "").trim(), "base64");
  if (raw.length !== 32) throw new Error("clé publique Ed25519 invalide (32 octets en base64 attendus)");
  return crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, raw]), format: "der", type: "spki" });
}
// clé publique brute (base64) d'une clé privée PEM
function rawPublic(privPem) {
  const der = crypto.createPublicKey(crypto.createPrivateKey(privPem)).export({ format: "der", type: "spki" });
  return der.subarray(der.length - 32).toString("base64");
}
function sha256File(f) {
  return new Promise((res, rej) => { const h = crypto.createHash("sha256"); fs.createReadStream(f).on("data", (d) => h.update(d)).on("end", () => res(h.digest("hex"))).on("error", rej); });
}
// la liste de tous les fichiers d'un dossier (chemins avec « / », triés) ; le fichier de signature lui-même est exclu
async function manifest(dir) {
  const out = [];
  async function walk(rel) {
    const list = await fsp.readdir(path.join(dir, rel), { withFileTypes: true });
    for (const e of list) {
      const r = rel ? rel + "/" + e.name : e.name, full = path.join(dir, r);
      if (r === SIG_FILE.split(path.sep).join("/")) continue;
      const st = await fsp.lstat(full);
      if (st.isSymbolicLink()) out.push([r, "l:" + (await fsp.readlink(full))]);
      else if (st.isDirectory()) await walk(r);
      else if (st.isFile()) out.push([r, `f:${st.size}:${await sha256File(full)}`]);
      else out.push([r, "x:autre"]);   // (périphérique, tube… : jamais dans une vraie version, donc refusé)
    }
  }
  await walk("");
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
function labelOf(dir) { try { return String(JSON.parse(fs.readFileSync(path.join(dir, "resources", "app", "build.json"), "utf8")).label || ""); } catch (_) { return ""; } }

// fabrication : signe le dossier d'une version (clé privée PEM)
async function signDir(dir, privPem) {
  const files = await manifest(dir);
  const texte = JSON.stringify({ v: 1, label: labelOf(dir), t: new Date().toISOString(), files });
  const sig = crypto.sign(null, Buffer.from(texte, "utf8"), crypto.createPrivateKey(privPem)).toString("base64");
  fs.writeFileSync(path.join(dir, SIG_FILE), JSON.stringify({ texte, sig }) + "\n");
  return { files: files.length };
}
// installation : { ok } ou { ok: false, err } ; sans clé publique configurée : { ok: true, unsigned: true }
async function verifyDir(dir, pubB64) {
  if (!pubB64) return { ok: true, unsigned: true };
  let s; try { s = JSON.parse(fs.readFileSync(path.join(dir, SIG_FILE), "utf8")); } catch (_) { return { ok: false, err: "Cette version n'est pas signée par Rembobine : elle n'est pas installée." }; }
  let good = false; try { good = typeof s.texte === "string" && typeof s.sig === "string" && crypto.verify(null, Buffer.from(s.texte, "utf8"), publicKeyOf(pubB64), Buffer.from(s.sig, "base64")); } catch (_) { good = false; }
  if (!good) return { ok: false, err: "La signature de cette version est fausse : elle n'est pas installée." };
  let m; try { m = JSON.parse(s.texte); } catch (_) { return { ok: false, err: "Signature illisible." }; }
  const want = new Map((m.files || []).map((x) => [x[0], x[1]])), got = await manifest(dir);
  if (got.length !== want.size || got.some(([r, v]) => want.get(r) !== v)) return { ok: false, err: "Des fichiers de cette version ont été modifiés après la signature : elle n'est pas installée." };
  if (m.label && labelOf(dir) !== m.label) return { ok: false, err: "Numéro de version incohérent avec la signature." };
  return { ok: true, label: m.label || "" };
}

module.exports = { signDir, verifyDir, manifest, rawPublic, publicKeyOf, SIG_FILE };
