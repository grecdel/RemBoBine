#!/bin/bash
# Clé du coffre chiffré (AES-256, 64 caractères hexadécimaux), calculée de la MÊME façon dans chaque job qui en a besoin :
#   - le secret RBB_PCK_KEY s'il existe ;
#   - sinon, dérivée du secret RBB_UPDATE_KEY (clé privée des mises à jour), avec séparation de domaine :
#       sha256("rembobine-coffre-v1:" + RBB_UPDATE_KEY)   → deux usages, deux clés différentes ;
#   - aucun des deux : la fabrication s'arrête (rien n'est publié).
# La clé est masquée (::add-mask::) dès qu'elle est calculée, puis remise aux étapes suivantes du MÊME job par la
# sortie « cle » de l'étape (jamais affichée, jamais écrite dans un fichier gardé ni dans une version).
# Ce script ne lance rien de téléchargé : il passe avant npm, pip, Godot…
set -euo pipefail
cle=""
if [ -n "${RBB_PCK_KEY:-}" ]; then
  [[ "$RBB_PCK_KEY" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "::error title=Secret RBB_PCK_KEY illisible::Il faut 64 caractères hexadécimaux (openssl rand -hex 32)."; exit 1; }
  cle="${RBB_PCK_KEY,,}"; source="RBB_PCK_KEY"
elif [ -n "${RBB_UPDATE_KEY:-}" ]; then
  cle=$(printf '%s' "rembobine-coffre-v1:$RBB_UPDATE_KEY" | sha256sum | cut -c1-64); source="dérivée de RBB_UPDATE_KEY"
else
  echo "::error title=Clé du coffre manquante::Ni RBB_PCK_KEY ni RBB_UPDATE_KEY : créez l'un des deux secrets (Settings → Secrets and variables → Actions). Rien n'est publié."
  exit 1
fi
echo "::add-mask::$cle"
[ -n "${GITHUB_OUTPUT:-}" ] || { echo "(hors GitHub : rien à transmettre)"; exit 0; }
echo "cle=$cle" >> "$GITHUB_OUTPUT"
echo "clé du coffre : $source"
