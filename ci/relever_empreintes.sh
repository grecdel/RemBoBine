#!/bin/bash
# Relève (ou met à jour) les empreintes SHA-256 de tout ce que la fabrication télécharge, dans ci/empreintes.txt.
#   bash ci/relever_empreintes.sh            → tout (émulateurs et outils, image Raspberry Pi OS, Tailscale, Electron, npm)
#   bash ci/relever_empreintes.sh npm natifs → seulement ces parties (natifs, os, tailscale, electron, npm)
# Chaque fichier est VRAIMENT téléchargé, son empreinte calculée, puis il est effacé (peu de place disque demandée,
# sauf l'image du Raspberry : ~0,5 Go le temps du calcul). Une ligne qui n'a pas pu être relevée garde son ancienne valeur.
# Ensuite : relire les changements (git diff ci/empreintes.txt) et les enregistrer. La fabrication refusera tout fichier
# dont l'empreinte ne correspond plus.
set -uo pipefail
cd "$(dirname "$0")/.."
PARTIES="${*:-natifs os tailscale electron npm}"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
NOUV="$TMP/nouvelles.txt"; : > "$NOUV"
UA="Mozilla/5.0 (X11; Linux x86_64) Rembobine"
# télécharge une adresse et écrit « clé version sha256 adresse » (« - » si impossible)
relever() {  # clé, version, adresse
  if [ -n "$3" ] && curl -fsSL --retry 2 -A "$UA" -o "$TMP/f" "$3"; then echo "$1 $2 $(sha256sum "$TMP/f" | cut -c1-64) $3" >> "$NOUV"; echo "  $1 : relevé" >&2
  else echo "$1 $2 - ${3:--}" >> "$NOUV"; echo "  $1 : impossible (${3:-adresse inconnue})" >&2; fi
  rm -f "$TMP/f"
}
for p in $PARTIES; do case $p in
  natifs) echo "== Émulateurs et outils (ci/emulateurs_natifs.sh)" >&2; bash ci/emulateurs_natifs.sh --relever >> "$NOUV" ;;
  os)
    echo "== Image Raspberry Pi OS Lite 64 bits (ci/build_os.sh)" >&2
    # « _latest » renvoie vers l'image datée : c'est elle qu'on fige ; l'empreinte publiée à côté (.sha256) doit concorder
    u=$(curl -fsSIL -o /dev/null -w '%{url_effective}' https://downloads.raspberrypi.com/raspios_lite_arm64_latest 2>/dev/null)
    case "$u" in */images/*.img.xz) ;; *) u="" ;; esac
    pub=$(curl -fsSL "$u.sha256" 2>/dev/null | cut -c1-64)
    v=$(echo "$u" | sed -nE 's|.*/images/([^/]+)/.*|\1|p')
    relever os/raspios_lite_arm64 "${v:--}" "$u"
    h=$(awk '$1=="os/raspios_lite_arm64"{print $3}' "$NOUV")
    if [ -n "$pub" ] && [ "$h" != "-" ] && [ "$h" != "$pub" ]; then echo "::error::image Raspberry : empreinte calculée ≠ empreinte publiée" >&2; sed -i '/^os\/raspios_lite_arm64 /d' "$NOUV"; fi ;;
  tailscale)
    echo "== Dépôt Tailscale (clé et adresse du dépôt, ci/build_os.sh)" >&2
    for c in bookworm trixie; do
      relever "tailscale/$c.noarmor.gpg" "$c" "https://pkgs.tailscale.com/stable/debian/$c.noarmor.gpg"
      relever "tailscale/$c.tailscale-keyring.list" "$c" "https://pkgs.tailscale.com/stable/debian/$c.tailscale-keyring.list"
    done ;;
  electron)
    echo "== Electron (liste d'empreintes officielle, ci/build_desktop.sh)" >&2
    EV=$(sed -nE 's/^EV=\$\{ELECTRON_VERSION:-([0-9.]+)\}.*/\1/p' ci/build_desktop.sh)
    relever electron/SHASUMS256.txt "$EV" "https://github.com/electron/electron/releases/download/v$EV/SHASUMS256.txt" ;;
  npm)
    echo "== Registre npm (ci/emulateurs.sh)" >&2
    V=$(sed -nE 's/^V=([0-9.]+)$/\1/p' ci/emulateurs.sh)
    CORES=$(bash -c "$(sed -n '/^CORES="/,/"$/p' ci/emulateurs.sh); echo \$CORES")
    for pk in emulatorjs $(for c in $CORES; do echo "core-$c"; done); do
      (cd "$TMP" && npm pack --silent "@emulatorjs/$pk@$V" >/dev/null 2>&1) && f="$TMP/emulatorjs-$pk-$V.tgz" && [ -f "$f" ] \
        && { echo "npm/@emulatorjs/$pk $V $(sha256sum "$f" | cut -c1-64) https://registry.npmjs.org/@emulatorjs/$pk/-/$pk-$V.tgz" >> "$NOUV"; echo "  @emulatorjs/$pk : relevé" >&2; } \
        || { echo "npm/@emulatorjs/$pk $V - https://registry.npmjs.org/@emulatorjs/$pk/-/$pk-$V.tgz" >> "$NOUV"; echo "  @emulatorjs/$pk : impossible" >&2; }
      rm -f "$TMP"/*.tgz
    done ;;
  *) echo "partie inconnue : $p" >&2; exit 2 ;;
esac; done
# fusion : les nouvelles lignes remplacent les anciennes de même clé, sauf si elles n'ont pas pu être relevées
python3 -I - ci/empreintes.txt "$NOUV" <<'PY'
import sys
old, new = sys.argv[1], sys.argv[2]
lines = open(old, encoding="utf-8").read().splitlines()
nv = {}
for l in open(new, encoding="utf-8"):
    p = l.split()
    if len(p) == 4: nv[p[0]] = p
out, vus = [], set()
for l in lines:
    p = l.split()
    if len(p) == 4 and not l.startswith("#") and p[0] in nv:
        n = nv[p[0]]; vus.add(p[0])
        out.append(" ".join(n) if n[2] != "-" or p[2] == "-" else l)
    else: out.append(l)
for k, n in nv.items():
    if k not in vus: out.append(" ".join(n))
open(old, "w", encoding="utf-8").write("\n".join(out) + "\n")
PY
echo "ci/empreintes.txt mis à jour : $(grep -vc '^#' ci/empreintes.txt) lignes, dont $(awk '!/^#/ && $3=="-"' ci/empreintes.txt | wc -l) encore à relever" >&2
