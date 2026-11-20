#!/usr/bin/env node
// Crée la paire de clés qui signe les mises à jour de Rembobine (Ed25519). À faire UNE seule fois, par le propriétaire.
//   node outils/maj/creer_cle.js
// 1. La clé PUBLIQUE est écrite dans app/serveur/maj-cle.js (elle va dans le dépôt : c'est normal, elle ne permet que de vérifier).
// 2. La clé PRIVÉE est écrite HORS du dépôt, dans ~/rembobine-cle-maj.pem (lisible par toi seul), et n'est jamais committée.
// 3. Sur GitHub : dépôt grecdel/Rembobine → Settings → Secrets and variables → Actions → New repository secret
//    nom « RBB_UPDATE_KEY », valeur : tout le contenu du fichier ~/rembobine-cle-maj.pem (lignes BEGIN/END comprises).
// 4. Committer app/serveur/maj-cle.js et envoyer : la fabrication signe alors chaque version (ci/signer_maj.js),
//    et les Rembobine qui ont reçu cette version refusent ensuite toute mise à jour non signée.
// Garde une copie de la clé privée en lieu sûr (clé USB rangée, gestionnaire de mots de passe) : si elle est perdue,
// il faudra une nouvelle clé, et les appareils déjà installés devront être mis à jour à la main une fois.
// Si elle est volée : en créer une nouvelle tout de suite (--remplacer) et remplacer le secret.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const SIG = require("../../app/serveur/maj-signature");

const CLE = path.join(__dirname, "..", "..", "app", "serveur", "maj-cle.js");
const PRIV = path.join(os.homedir(), "rembobine-cle-maj.pem");
const { PUBLIC_KEY } = require(CLE);
if (PUBLIC_KEY && !process.argv.includes("--remplacer")) {
  console.log("Une clé publique existe déjà dans app/serveur/maj-cle.js. Pour la remplacer (clé perdue ou volée) : --remplacer");
  process.exit(1);
}
if (fs.existsSync(PRIV) && !process.argv.includes("--remplacer")) { console.log(`${PRIV} existe déjà : rien n'est écrasé.`); process.exit(1); }
const { privateKey } = crypto.generateKeyPairSync("ed25519");
const pem = privateKey.export({ format: "pem", type: "pkcs8" });
fs.writeFileSync(PRIV, pem, { mode: 0o600 });
const pub = SIG.rawPublic(pem);
const src = fs.readFileSync(CLE, "utf8").replace(/PUBLIC_KEY: "[^"]*"/, `PUBLIC_KEY: "${pub}"`);
fs.writeFileSync(CLE, src);
console.log(`Clé publique écrite dans ${CLE} :\n  ${pub}\n`);
console.log(`Clé PRIVÉE écrite dans ${PRIV} (hors du dépôt, ne JAMAIS la committer).`);
console.log("À faire maintenant : créer le secret GitHub RBB_UPDATE_KEY avec le contenu de ce fichier, puis committer maj-cle.js.");
