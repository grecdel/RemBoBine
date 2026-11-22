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
chmod +x "$BASE/versions/$LABEL/rembobine" "$BASE/versions/$LABEL/rembobine-bin" "$BASE/versions/$LABEL/resources/module/"* 2>/dev/null || true
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
MimeType=video/x-matroska;video/mp4;video/x-m4v;video/x-msvideo;video/avi;video/quicktime;video/webm;video/mp2t;video/vnd.dlna.mpeg-tts;video/mpeg;video/x-ms-wmv;video/x-flv;video/ogg;video/3gpp;video/dvd;video/x-ogm+ogg;audio/mpeg;audio/flac;audio/x-flac;audio/ogg;audio/x-vorbis+ogg;audio/x-opus+ogg;audio/mp4;audio/x-m4a;audio/aac;audio/x-aac;audio/wav;audio/x-wav;audio/x-ms-wma;audio/x-aiff;audio/x-ape;audio/x-matroska;application/x-nes-rom;application/x-fds-disk;application/x-snes-rom;application/x-gameboy-rom;application/x-gameboy-color-rom;application/x-gba-rom;application/x-genesis-rom;application/x-sms-rom;application/x-gamegear-rom;application/x-n64-rom;application/x-nintendo-ds-rom;application/x-pc-engine-rom;application/x-atari-2600-rom;application/x-atari-7800-rom;application/x-virtual-boy-rom;application/x-neo-geo-pocket-rom;application/x-neo-geo-pocket-color-rom;application/x-wonderswan-rom;application/x-wonderswan-color-rom;application/x-genesis-32x-rom;application/x-gamecube-rom;application/x-wii-rom;application/x-wii-wad;application/x-wbfs;application/x-rembobine-jeu;
EOD
# « Ouvrir avec Rembobine » (clic droit sur une vidéo, une musique, un jeu) : Rembobine est proposé, sans devenir le
# lecteur par défaut (ça se choisit dans Paramètres → Système → Lecteur par défaut). Les formats de jeu sans type
# commun (chd, rvz, cso…) sont décrits par rembobine-mime.xml.
if [ -f "$SRC/rembobine-mime.xml" ]; then
  mkdir -p "$HOME/.local/share/mime/packages"
  cp "$SRC/rembobine-mime.xml" "$HOME/.local/share/mime/packages/rembobine.xml"
  command -v update-mime-database >/dev/null 2>&1 && update-mime-database "$HOME/.local/share/mime" >/dev/null 2>&1 || true
fi
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
if [ "$1" = "--demarrage" ]; then
  mkdir -p "$HOME/.config/autostart"
  sed -e "s#Exec=.*#Exec=$BASE/rembobine --kiosk#" -e "/^MimeType=/d" "$HOME/.local/share/applications/rembobine.desktop" > "$HOME/.config/autostart/rembobine.desktop"
  echo "Rembobine démarrera tout seul, en plein écran, à la prochaine ouverture de session."
fi
echo "Rembobine $LABEL est installé : cherche « Rembobine » dans le menu des applications."
echo "Les mises à jour peuvent maintenant s'installer toutes seules (Rembobine OS → Mises à jour)."
