#!/bin/bash
# Fonctions communes : télécharger un fichier de la fabrication SEULEMENT s'il correspond à son empreinte figée.
# Les empreintes sont dans ci/empreintes.txt (une ligne par fichier : clé, version, sha256, adresse).
# À lire avec « . ci/empreintes.sh » ; puis :
#   emp_ligne <clé>                  → « version sha256 adresse » (rien si la clé est absente)
#   emp_telecharger <clé> <fichier> [agent]  → télécharge l'adresse figée, vérifie l'empreinte ; code 1 et fichier effacé sinon
#   emp_verifier <fichier> <sha256>  → code 0 si le fichier a bien cette empreinte
#   emp_fige <clé>                   → code 0 si la ligne existe et porte une vraie empreinte
# Une empreinte « - » veut dire « pas encore relevée » : emp_telecharger refuse ; les scripts de fabrication gardent
# alors l'ancien comportement (dernière version, empreinte publiée par le projet si elle existe) avec un avertissement
# « empreinte non figée ». Seules les lignes AVEC empreinte sont strictes. ci/relever_empreintes.sh les remplit.
EMP_FICHIER="${EMP_FICHIER:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/empreintes.txt}"

emp_ligne() { awk -v k="$1" '$1 == k { print $2, $3, $4; exit }' "$EMP_FICHIER"; }

emp_fige() { local v h u; read -r v h u <<<"$(emp_ligne "$1")"; [[ "${h:-}" =~ ^[0-9a-f]{64}$ ]]; }

emp_verifier() {
  local f=$1 h=$2
  [[ "$h" =~ ^[0-9a-f]{64}$ ]] || return 1
  [ -f "$f" ] && echo "$h  $f" | sha256sum -c --quiet - >/dev/null 2>&1
}

emp_telecharger() {
  local k=$1 f=$2 ua=${3:-"Mozilla/5.0 (X11; Linux x86_64) Rembobine"} v h u
  read -r v h u <<<"$(emp_ligne "$k")"
  if [ -z "${u:-}" ]; then echo "::warning::$k : absent de ci/empreintes.txt — fichier refusé"; return 1; fi
  if [ "$h" = "-" ]; then echo "::warning::$k : empreinte pas encore relevée (ci/relever_empreintes.sh) — fichier refusé"; return 1; fi
  mkdir -p "$(dirname "$f")"
  if ! curl -fsSL --retry 2 -A "$ua" -o "$f" "$u"; then
    echo "::warning::$k : téléchargement impossible ($u)"; rm -f "$f"; return 1
  fi
  if ! emp_verifier "$f" "$h"; then
    echo "::error::$k $v : empreinte différente de celle figée dans ci/empreintes.txt — fichier refusé"
    echo "  attendue $h, reçue $(sha256sum "$f" | cut -c1-64)"; rm -f "$f"; return 1
  fi
  echo "  $k $v : empreinte vérifiée"
}
