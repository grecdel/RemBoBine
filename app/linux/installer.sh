#!/bin/sh
# Installe Rembobine pour toi (sans mot de passe) : menu des applications + icône.
# Option : ./installer.sh --demarrage  → Rembobine se lance tout seul, en plein écran, à l'ouverture de la session (idéal Raspberry Pi branché sur la télé).
# Rangement (pour que les mises à jour s'installent à côté et puissent revenir en arrière) :
#   ~/.local/share/rembobine/versions/<numéro>/   ~/.local/share/rembobine/actuelle → versions/<numéro>
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
BASE="$HOME/.local/share/rembobine"
LABEL=$(sed -n 's/.*"label":"\([^"]*\)".*/\1/p' "$SRC/resources/app/build.json" 2>/dev/null | head -1)
[ -n "$LABEL" ] || LABEL="installee-$(date +%Y%m%d%H%M)"
# ancienne installation (d'avant le rangement par versions) : lancée depuis elle-même, on la met de côté d'abord
if [ "$SRC" = "$BASE" ]; then TMP=$(mktemp -d); cp -r "$SRC" "$TMP/app"; SRC="$TMP/app"; fi
if [ -d "$BASE" ] && [ ! -d "$BASE/versions" ]; then rm -rf "$BASE"; fi
mkdir -p "$BASE/versions" "$HOME/.local/share/applications" "$HOME/.local/bin"
case "$SRC" in
  "$BASE"/versions/*) LABEL=$(basename "$SRC") ;;
  *) rm -rf "$BASE/versions/$LABEL"; cp -r "$SRC" "$BASE/versions/$LABEL" ;;
esac
ln -sfn "versions/$LABEL" "$BASE/actuelle"
ln -sfn "actuelle/rembobine" "$BASE/rembobine"
ln -sfn "actuelle/rembobine.png" "$BASE/rembobine.png"
chmod +x "$BASE/versions/$LABEL/rembobine" "$BASE/versions/$LABEL/rembobine-bin" "$BASE/versions/$LABEL/resources/gamebox3d/"* 2>/dev/null || true
ln -sf "$BASE/rembobine" "$HOME/.local/bin/rembobine"
cat > "$HOME/.local/share/applications/rembobine.desktop" <<EOD
[Desktop Entry]
Type=Application
Name=Rembobine
Comment=Ta médiathèque : films, séries, jeux et musique
Exec=$BASE/rembobine %U
Icon=$BASE/rembobine.png
Terminal=false
Categories=AudioVideo;Video;Game;
EOD
if [ "$1" = "--demarrage" ]; then
  mkdir -p "$HOME/.config/autostart"
  sed "s#Exec=.*#Exec=$BASE/rembobine --kiosk#" "$HOME/.local/share/applications/rembobine.desktop" > "$HOME/.config/autostart/rembobine.desktop"
  echo "Rembobine démarrera tout seul, en plein écran, à la prochaine ouverture de session."
fi
echo "Rembobine $LABEL est installé : cherche « Rembobine » dans le menu des applications."
echo "Les mises à jour peuvent maintenant s'installer toutes seules (Rembobine OS → Mises à jour)."
