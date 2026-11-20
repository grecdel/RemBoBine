#!/usr/bin/env node
// Signe une version de Rembobine (dossier Rembobine-Linux-x64 ou -arm64) pour les mises à jour automatiques.
//   RBB_UPDATE_KEY="<clé privée PEM>" node ci/signer_maj.js <dossier>
// - clé publique vide dans app/serveur/maj-cle.js et pas de secret : rien à faire (avertissement) ;
// - clé publique présente mais secret absent, ou secret qui ne correspond pas : la fabrication S'ARRÊTE
//   (sinon tous les Rembobine refuseraient la mise à jour, ou pire : on publierait une version non vérifiable).
"use strict";
const path = require("path");
const SIG = require("../app/serveur/maj-signature");
const { PUBLIC_KEY } = require("../app/serveur/maj-cle");

(async () => {
  const dir = process.argv[2], key = (process.env.RBB_UPDATE_KEY || "").trim();
  if (!dir) { console.error("usage : node ci/signer_maj.js <dossier de la version>"); process.exit(2); }
  if (!key) {
    if (PUBLIC_KEY) { console.error("::error::Secret RBB_UPDATE_KEY absent alors que app/serveur/maj-cle.js contient une clé publique : impossible de signer la mise à jour."); process.exit(1); }
    console.log("::warning::Pas de clé de signature des mises à jour (RBB_UPDATE_KEY) : version non signée. Voir outils/maj/creer_cle.js.");
    return;
  }
  let pub; try { pub = SIG.rawPublic(key); } catch (e) { console.error("::error::RBB_UPDATE_KEY n'est pas une clé privée Ed25519 (PEM) lisible."); process.exit(1); }
  if (PUBLIC_KEY && pub !== PUBLIC_KEY) { console.error("::error::RBB_UPDATE_KEY ne correspond pas à la clé publique de app/serveur/maj-cle.js."); process.exit(1); }
  if (!PUBLIC_KEY) console.log("::warning::Version signée, mais app/serveur/maj-cle.js n'a pas encore la clé publique : les appareils ne vérifieront pas encore la signature.");
  const r = await SIG.signDir(path.resolve(dir), key);
  // relecture immédiate : ce qui est signé se vérifie
  const v = await SIG.verifyDir(path.resolve(dir), pub);
  if (!v.ok) { console.error("::error::La signature ne se vérifie pas : " + v.err); process.exit(1); }
  console.log(`Version signée : ${r.files} fichiers (${dir}).`);
})().catch((e) => { console.error("::error::" + e.message); process.exit(1); });
