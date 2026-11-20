// Rembobine — clé PUBLIQUE qui vérifie les mises à jour (signature Ed25519).
// Une mise à jour (internet, clé USB ou fichier envoyé) n'est installée que si elle est signée par la clé privée
// correspondante, gardée dans le secret GitHub « RBB_UPDATE_KEY » (jamais dans le dépôt).
//
// Vide = pas encore de clé : les mises à jour sont vérifiées comme avant (taille et empreinte seulement).
// Pour créer la paire de clés : node outils/maj/creer_cle.js  (il remplit ce fichier et affiche la clé privée à mettre
// dans le secret GitHub ; mode d'emploi en tête de ce script).
"use strict";
module.exports = { PUBLIC_KEY: "" };
