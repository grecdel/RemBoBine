#!/bin/bash
# Le module facultatif dans une copie de travail (sessions de travail) :
#   bash outils/module.sh installer ADRESSE   récupère le module dans .module.git/, qui partage CE dossier :
#                                             ses fichiers arrivent à leur place (mêmes chemins qu'à la fabrication)
#   bash outils/module.sh sync                refait les listes d'exclusion (chaque dépôt ne voit que ses fichiers)
#   bash outils/module.sh verifier            garde-fou du module sur les fichiers publics (avant chaque commit public)
#   bash outils/module.sh verifier --envoi    idem, plus chaque commit pas encore envoyé (messages, lignes ajoutées) :
#                                             À LANCER AVANT CHAQUE « git push » (le crochet pre-push le fait aussi)
#   bash outils/module.sh crochets            (ré)installe les crochets des deux dépôts
#   bash outils/module.sh etat                état des deux dépôts
# Ensuite : alias gm='git --git-dir=.module.git'  (gm status, gm add …, gm commit, gm push origin main).
# Envoyer le module AVANT le dépôt public quand un changement touche les deux.
# Les listes d'exclusion (.git/info/exclude, .module.git/info/exclude) restent sur cette machine, jamais publiées.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
M=.module.git
gm() { git --git-dir="$M" --work-tree=. "$@"; }

sync() {
  [ -d "$M" ] || { echo "module non installé"; exit 1; }
  # côté public : on ignore tout ce que suit le module
  { echo "# écrit par outils/module.sh sync"; echo "/.module.git/"
    gm show HEAD:ci/module/chemins-prives.txt 2>/dev/null | grep -v '^#' | grep . | sed 's|\*$||; s|^|/|'
    gm ls-files | sed 's|^|/|'; } | awk '!v[$0]++' > .git/info/exclude
  # côté module : on ne voit que ses dossiers (tout le reste est ignoré)
  python3 - "$M" <<'PY'
import subprocess, sys
m = sys.argv[1]
pats = subprocess.run(["git", "--git-dir", m, "show", "HEAD:ci/module/chemins-prives.txt"], capture_output=True, text=True).stdout
pats = [p.strip().rstrip("*") for p in pats.splitlines() if p.strip() and not p.startswith("#")]
lignes, vus = ["# écrit par outils/module.sh sync", "/*"], set()
for p in pats:
    parts = p.strip("/").split("/")
    for i in range(1, len(parts)):
        d = "/".join(parts[:i])
        if d not in vus:
            vus.add(d); lignes += [f"!/{d}/", f"/{d}/*"]
    lignes.append(f"!/{p}")
open(f"{m}/info/exclude", "w").write("\n".join(lignes) + "\n")
PY
  gm config status.showUntrackedFiles normal
  echo "listes d'exclusion à jour"
}

crochets() {
  [ -d ci/module/hooks ] || { echo "module non installé : pas de crochets"; return 0; }
  # dépôt public : garde-fou sur chaque commit, chaque message et chaque envoi
  for h in pre-commit commit-msg pre-push; do [ -f "ci/module/hooks/$h" ] && cp "ci/module/hooks/$h" ".git/hooks/$h" && chmod +x ".git/hooks/$h"; done
  # dépôt du module : listes d'exclusion remises à jour après chaque gm pull / gm checkout
  if [ -d "$M" ] && [ -f ci/module/hooks/module-sync ]; then
    mkdir -p "$M/hooks"; for h in post-merge post-checkout; do cp ci/module/hooks/module-sync "$M/hooks/$h"; chmod +x "$M/hooks/$h"; done
  fi
  echo "crochets installés"
}

case "${1:-}" in
  installer)
    URL="${2:?adresse du dépôt du module}"
    [ -e "$M" ] && { echo "$M existe déjà (outils/module.sh sync pour mettre à jour les listes)"; exit 1; }
    git clone -q --bare "$URL" "$M"
    git --git-dir="$M" config core.bare false
    git --git-dir="$M" config core.worktree ..
    git --git-dir="$M" config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
    git --git-dir="$M" fetch -q origin
    gm checkout -q -f main 2>/dev/null || gm checkout -q -f -B main origin/main
    gm branch -q -u origin/main main 2>/dev/null || true
    sync
    crochets
    echo "module installé. Ajoute : alias gm='git --git-dir=$PWD/$M --work-tree=$PWD'" ;;
  sync) sync ;;
  crochets) crochets ;;
  verifier)
    [ -f ci/module/garde.sh ] || { echo "module non installé : rien à vérifier"; exit 0; }
    shift; A=()
    for a in "$@"; do
      if [ "$a" = --envoi ]; then
        if git rev-parse -q --verify '@{u}' >/dev/null; then A+=(--plage "@{u}..HEAD"); else A+=(--plage "HEAD --not --remotes"); fi
      else A+=("$a"); fi
    done
    bash ci/module/garde.sh . "${A[@]}" ;;
  etat)
    echo "== public"; git status -sb | head -20
    [ -d "$M" ] && { echo "== module"; gm status -sb | head -20; } ;;
  *) sed -n '2,13p' "$0"; exit 2 ;;
esac
