#!/bin/bash
# Le module facultatif, pendant la fabrication (GitHub Actions) :
#   bash ci/module.sh verifier          les deux secrets sont-ils là et le jeton marche-t-il ? (crée aussi l'espace provisoire du module)
#   bash ci/module.sh masquer           masque le nom du dépôt du module dans les journaux
#   bash ci/module.sh poser [DOSSIER]   pose le module (récupéré dans DOSSIER, par défaut .module/) par-dessus le dépôt, aux mêmes chemins
#   bash ci/module.sh deposer FICHIER   dépose un fichier intermédiaire dans l'espace provisoire du module
#   bash ci/module.sh recevoir NOM...   reprend des fichiers intermédiaires (dans build/)
#   bash ci/module.sh controle FICHIER  remplace l'archive de contrôle du module
#   bash ci/module.sh journal QUOI [DOSSIER] [FICHIER]  envoie les journaux détaillés dans le dépôt du module
#   bash ci/module.sh livrer QUOI       dépose ce que le module a préparé (build/module-depot/, build/module-controle/)
#                                       et envoie son journal détaillé (étape séparée : la fabrication du module tourne SANS jeton)
#   bash ci/module.sh garde [AVANT]     cherche, dans les fichiers publics, ce qui ne doit pas y être (si le module le permet) ;
#                                       avec AVANT (commit d'avant l'envoi) : relit aussi chaque commit de l'envoi
#   bash ci/module.sh nettoyer          supprime l'espace provisoire du module
# Secrets (Settings → Secrets and variables → Actions) : RBB_MODULE_DEPOT (nom du dépôt) et RBB_MODULE_JETON (jeton
# d'accès fin : « Contents » en lecture et écriture sur ce seul dépôt). Rien de ce script n'affiche leur valeur ;
# GitHub les masque de toute façon (***). Jamais de « set -x » ici. Les secrets ne sont donnés qu'aux étapes qui
# appellent ce script (et au checkout du module) : jamais à une étape qui installe ou lance du code téléchargé.
set -uo pipefail
cd "$(dirname "$0")/.."
QUOI="${1:-}"; shift || true
D="${RBB_MODULE_DEPOT:-}"; T="${RBB_MODULE_JETON:-}"
PROV="fabrication-${GITHUB_RUN_ID:-local}"
gm() { GH_TOKEN="$T" gh "$@" -R "$D" >/dev/null 2>&1; }
masquer() {   # le nom du dépôt du module, tel que tapé dans le secret ET tel que GitHub l'écrit, en minuscules aussi
  [ -n "$D" ] || return 0
  local n o; o=$(GH_TOKEN="$T" gh api "repos/$D" -q .full_name 2>/dev/null || true)
  [[ "$o" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || o=""     # une réponse d'erreur n'est pas un nom
  for n in "$D" "$o"; do
    [ -n "$n" ] || continue
    for v in "$n" "${n#*/}" "${n,,}" "$(printf %s "${n#*/}" | tr '[:upper:]' '[:lower:]')"; do echo "::add-mask::$v"; done
  done
}
# essai sur une machine (hors GitHub, sans les secrets) : les fichiers intermédiaires restent dans build/
LOCAL=0; if { [ -z "$D" ] || [ -z "$T" ]; } && [ -z "${GITHUB_ACTIONS:-}" ]; then LOCAL=1; fi

case "$QUOI" in
  verifier)
    if [ -z "$D" ] || [ -z "$T" ]; then
      echo "::error title=Réglage manquant::Créez les secrets RBB_MODULE_DEPOT et RBB_MODULE_JETON (Settings → Secrets and variables → Actions)."
      exit 1
    fi
    masquer
    if ! GH_TOKEN="$T" gh api "repos/$D" --silent >/dev/null 2>&1 \
       || ! gm release create "$PROV" --prerelease --title "Fabrication en cours (provisoire)" --notes "Fichiers intermédiaires, supprimés à la fin de la fabrication."; then
      gm release view "$PROV" || {
        echo "::error title=Jeton refusé::RBB_MODULE_JETON ne peut pas lire ou écrire le dépôt du module (droits « Contents », dépôt choisi, date d'expiration)."
        exit 1; }
    fi
    echo "module : réglages vérifiés" ;;
  masquer) masquer; true ;;
  poser)
    SRC="${1:-.module}"
    [ -d "$SRC" ] || { echo "::error::module absent (étape de récupération manquée)"; exit 1; }
    # un module valable : sa fabrication est là, et il ne contient aucun fichier du dépôt public (sinon : mauvaise
    # branche du module, par exemple une archive de l'ancien dépôt en branche par défaut)
    [ -f "$SRC/ci/module/fabriquer.sh" ] && [ ! -e "$SRC/web/index.html" ] && [ ! -e "$SRC/ci/module.sh" ] \
      || { echo "::error title=Module non valable::la branche récupérée n'est pas celle du module (main) — rien n'est posé."; exit 1; }
    n=$( (cd "$SRC" && find . -path ./.git -prune -o \( -type f -o -type l \) -print) | sed 's|^\./||' | while IFS= read -r f; do [ -e "$f" ] && echo x; done | wc -l)
    [ "$n" = 0 ] || { echo "::error title=Module non valable::$n fichier(s) du module existent déjà dans le dépôt public — rien n'est posé."; exit 1; }
    tar -C "$SRC" --exclude=.git -cf - . | tar -xf -
    rm -rf "$SRC"
    echo "module : posé" ;;
  deposer)
    [ $LOCAL = 1 ] && { echo "module : $# fichier(s) gardé(s) sur la machine"; exit 0; }
    for f in "$@"; do gm release upload "$PROV" "$f" --clobber || { echo "::error::module : dépôt d'un fichier intermédiaire impossible"; exit 1; }; done
    echo "module : $# fichier(s) déposé(s)" ;;
  recevoir)
    mkdir -p build; n=0
    if [ $LOCAL = 1 ]; then for f in "$@"; do [ -f "build/module-depot/$f" ] && cp "build/module-depot/$f" "build/$f"; [ -f "build/$f" ] && n=$((n + 1)); done; echo "module : $n/$# fichier(s) trouvé(s) sur la machine"; [ $n -gt 0 ]; exit; fi
    for f in "$@"; do gm release download "$PROV" -p "$f" -D build --clobber && n=$((n + 1)); done
    echo "module : $n/$# fichier(s) repris"
    [ $n -gt 0 ] ;;
  controle)
    [ $LOCAL = 1 ] && { echo "module : contrôle gardé sur la machine"; exit 0; }
    gm release view controle || gm release create controle --prerelease --title "Contrôle (captures de la dernière fabrication)" --notes "Remplacées à chaque fabrication ; jamais dans l'appli."
    gm release upload controle "$1" --clobber && echo "module : contrôle envoyé" || echo "module : contrôle non envoyé" ;;
  journal)
    NOM="${1:-etape}"; DOS="${2:-}"; [ $LOCAL = 0 ] && [ -n "$D" ] && [ -n "$T" ] || { echo "module : journal gardé sur la machine"; exit 0; }
    J="journal-${GITHUB_RUN_NUMBER:-0}"; A="build/journal-$NOM.tar.gz"
    L=(build/module-journal); [ -n "$DOS" ] && [ -e "$DOS" ] && L+=("$DOS")
    tar czf "$A" "${L[@]}" 2>/dev/null || true
    gm release view "$J" || gm release create "$J" --prerelease --title "Journal $J" --notes "Journaux détaillés d'une fabrication du dépôt public." || true
    if gm release upload "$J" "$A" --clobber; then echo "module : journal envoyé"; else echo "module : journal non envoyé"; fi
    # on ne garde que les 30 derniers journaux
    GH_TOKEN="$T" gh release list -R "$D" --limit 200 --json tagName -q '.[].tagName' 2>/dev/null | grep '^journal-' | sort -t- -k2 -n -r | tail -n +31 \
      | while read -r t; do gm release delete "$t" --yes --cleanup-tag || true; done
    true ;;
  livrer)
    NOM="${1:-etape}"; k=0
    for f in build/module-depot/*; do [ -f "$f" ] || continue; bash "$0" deposer "$f" >/dev/null || { echo "::error::module : dépôt impossible"; exit 1; }; k=$((k + 1)); done
    for f in build/module-controle/*; do [ -f "$f" ] || continue; bash "$0" controle "$f" >/dev/null || true; done
    echo "module : $k fichier(s) livré(s)"
    bash "$0" journal "$NOM" ;;
  garde)
    [ -f ci/module/garde.sh ] || { echo "module : garde-fou absent (module non posé)"; exit 0; }
    A="${1:-}"; Z=0000000000000000000000000000000000000000
    bash ci/module/garde.sh || exit 1
    # tous les commits de l'envoi (pas seulement le dernier), si l'histoire d'avant est connue (fetch-depth: 100)
    if [ -n "$A" ] && [ "$A" != "$Z" ] && git cat-file -e "$A^{commit}" 2>/dev/null; then
      echo "module : $(git rev-list --count "$A..HEAD") commit(s) de l'envoi relus"
      bash ci/module/garde.sh . --plage "$A..HEAD" || exit 1
    fi ;;
  nettoyer)
    [ -n "$D" ] && [ -n "$T" ] && gm release delete "$PROV" --yes --cleanup-tag
    echo "module : nettoyé" ;;
  *) sed -n '2,19p' "$0" >&2; exit 2 ;;
esac
