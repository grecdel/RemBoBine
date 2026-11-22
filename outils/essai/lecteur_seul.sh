#!/bin/bash
# Essai du « lecteur seul » (Rembobine ouvert avec un fichier), sous un faux écran, avec captures :
#   outils/essai/lecteur_seul.sh <programme electron> <dossier des captures>
# L'appli est rangée comme dans la fabrication (ci/build_desktop.sh : resources/app/…), puis lancée :
#   1. sans fichier (démarrage normal : serveur de la maison, médiathèque) ;
#   2. avec une musique (dossier à la suite) : AUCUN serveur ne démarre ;
#   3. une vidéo ouverte pendant ce temps (instance unique : le même lecteur passe à la vidéo, dans mpv) ;
#      pause (bouton « Ouvrir Rembobine »), fermeture → question « Ajouter ce dossier ? » → Ajouter ;
#   4. la même vidéo rouverte : elle reprend où elle s'était arrêtée ;
#   5. une ROM de test (outils/emulateurs/roms_test.py) dans l'émulateur intégré ;
#   6. Rembobine déjà ouvert : la musique s'ouvre par-dessus, dans sa fenêtre ;
#   7. Paramètres → Système → Lecteur par défaut (outils/essai/lecteur_seul_reglage.js, Playwright).
# Demande : Xvfb, xdotool, ImageMagick (import, montage), ffmpeg, mpv, python3, node (+ playwright pour l'étape 7).
set -uo pipefail
EL="$(readlink -f "$1")"; CAP="$(mkdir -p "$2" && cd "$2" && pwd)"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T=$(mktemp -d); H="$T/home"; mkdir -p "$H"
APP="$T/resources/app"
D=:${RBB_ECRAN:-87}; PORT=${REMBOBINE_PORT:-18431}
ECHECS=0; ok() { echo "  ok : $1"; }; ko() { echo "  ÉCHEC : $1"; ECHECS=$((ECHECS + 1)); }
XV=""; fin() { pkill -f "$T/resources/app" 2>/dev/null; pkill -f "input-ipc-server=.*rembobine-mpv" 2>/dev/null; [ -n "$XV" ] && kill "$XV" 2>/dev/null; sleep 1; rm -rf "$T"; }
trap fin EXIT

echo "== L'appli, rangée comme dans la fabrication"
mkdir -p "$APP/lecteur" "$APP/serveur" "$APP/web"
cp "$ROOT"/app/{main.js,module_natif.js,module_web.js,preload.js,preload_module.js,seul.js,seul_main.js,preload_seul.js,package.json,icon.png} "$APP/"
cp "$ROOT"/app/lecteur/*.lua "$ROOT/app/lecteur/seul.html" "$APP/lecteur/"
for f in "$ROOT"/app/serveur/*.js; do case "$f" in */test_*) ;; *) cp "$f" "$APP/serveur/" ;; esac; done
cp "$ROOT/web/index.html" "$APP/web/index.html"
[ -d "$ROOT/build/ejs" ] && cp -r "$ROOT/build/ejs" "$APP/web/ejs"

echo "== Médias de test (faits ici)"
V="$T/Téléchargements"; A="$T/Musique/Les Ondes - Nuit Claire (2024)"; J="$T/Jeux"; mkdir -p "$V" "$A" "$J" "$H/Rembobine"
ffmpeg -loglevel error -f lavfi -i "testsrc2=duration=90:size=1280x720:rate=25" -f lavfi -i "sine=frequency=330:duration=90" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "$V/Voyage.En.Mer.2026.1080p.WEB.x264.mkv"
printf '1\n00:00:01,000 --> 00:00:40,000\nSous-titre posé à côté du film\n' > "$V/Voyage.En.Mer.2026.1080p.WEB.x264.fr.srt"
n=0; for t in "Lever du jour:mp3:392" "Marée haute:ogg:440" "Le phare:flac:494" "Retour au port:opus:523"; do
  n=$((n + 1)); IFS=: read -r nom ext f <<<"$t"
  ffmpeg -loglevel error -f lavfi -i "sine=frequency=$f:duration=40" -ac 2 "$A/0$n - $nom.$ext"
done
convert -size 600x600 gradient:'#3b1d4a'-'#e0653a' -fill '#ffffff22' -draw "circle 300,300 300,120" "$A/cover.jpg"
python3 "$ROOT/outils/emulateurs/roms_test.py" "$T/roms" >/dev/null && cp "$T/roms/test.nes" "$J/Essai Rembobine.nes"

Xvfb "$D" -screen 0 1280x720x24 +bs -nolisten tcp >/dev/null 2>&1 & XV=$!; sleep 1
export DISPLAY=$D
lance() { HOME="$H" REMBOBINE_PORT=$PORT REMBOBINE_FICHES=0 REMBOBINE_OUVRIR_AVEC=0 "$EL" --no-sandbox --disable-gpu "$APP" "$@" >>"$T/appli.log" 2>&1 & }
photo() { import -display "$D" -window root "$CAP/$1.png"; echo "  capture : $1.png"; }
serveur() { curl -s -m 2 "http://127.0.0.1:$PORT/api/info" >/dev/null; }
attend() { for _ in $(seq 1 "$2"); do grep -q "$1" "$T/appli.log" && return 0; sleep 0.5; done; return 1; }
quitte() { pkill -f "$T/resources/app" 2>/dev/null; pkill -f "input-ipc-server=.*rembobine-mpv" 2>/dev/null; for _ in $(seq 1 20); do pgrep -f "$T/resources/app" >/dev/null || return 0; sleep 0.5; done; pkill -9 -f "$T/resources/app"; }
MEM="$H/.config/Rembobine/lecteur-seul.json"; for c in Rembobine rembobine; do [ -d "$H/.config/$c" ] && MEM="$H/.config/$c/lecteur-seul.json"; done

echo "== 1. Démarrage normal (sans fichier)"
lance
for _ in $(seq 1 40); do serveur && break; sleep 0.5; done
if serveur; then ok "le serveur de la maison répond"; else ko "le serveur ne répond pas"; fi
sleep 6; photo 0-demarrage-normal
grep -q "\[lecteur seul\]" "$T/appli.log" && ko "le lecteur seul s'est mêlé du démarrage normal" || ok "démarrage normal sans lecteur seul"
quitte; sleep 1

echo "== 2. Musique (mode minimal)"
: > "$T/appli.log"; t0=$(date +%s%N)
lance "$A/02 - Marée haute.ogg"
attend "ouverture musique" 40 && ok "musique ouverte en $(( ($(date +%s%N) - t0) / 1000000 )) ms (fenêtre prête)" || ko "la musique ne s'ouvre pas"
sleep 4; photo 1-musique
serveur && ko "le serveur a démarré en mode minimal" || ok "aucun serveur en mode minimal (démarrage léger)"

echo "== 3. Vidéo ouverte pendant la musique (instance unique) → mpv"
HOME="$H" "$EL" --no-sandbox --disable-gpu "$APP" "$V/Voyage.En.Mer.2026.1080p.WEB.x264.mkv" >>"$T/appli.log" 2>&1
attend "ouverture video" 20 && ok "la vidéo arrive dans le lecteur déjà ouvert" || ko "la vidéo n'arrive pas dans le lecteur ouvert"
for _ in $(seq 1 30); do pgrep -f "input-ipc-server=.*rembobine-mpv" >/dev/null && break; sleep 0.5; done
pgrep -af "input-ipc-server=.*rembobine-mpv" | grep -q -- "--script-opts=.*rembobine-seul=1" && ok "mpv lancé avec l'interface Rembobine (lecteur seul)" || ko "mpv absent ou sans l'interface"
pgrep -af "input-ipc-server=.*rembobine-mpv" | grep -q -- "--sub-auto=fuzzy" && ok "sous-titres posés à côté cherchés" || ko "sous-titres non cherchés"
sleep 6; photo 2-video-mpv
W=$(xdotool search --class mpv | tail -1); [ -n "$W" ] && xdotool windowactivate --sync "$W" 2>/dev/null; xdotool key --window "$W" space; sleep 1.5; photo 3-video-pause
xdotool key --window "$W" space; sleep 22
pkill -TERM -f "input-ipc-server=.*rembobine-mpv"; sleep 2.5; photo 4-video-question
grep -q '"reprises"' "$MEM" 2>/dev/null && python3 - "$MEM" "$V/Voyage.En.Mer.2026.1080p.WEB.x264.mkv" <<'EOF' && ok "position retenue pour la reprise" || ko "position non retenue"
import json, sys
r = json.load(open(sys.argv[1]))["reprises"][sys.argv[2]]
print("    position retenue :", r["pos"], "s sur", r["dur"]); assert r["pos"] >= 15
EOF
W=$(xdotool search --name "Voyage En Mer" | head -1); echo "  fenêtre de la question : ${W:-introuvable}"; [ -n "$W" ] && xdotool windowfocus --sync "$W" 2>/dev/null; sleep 0.5
xdotool key Return; sleep 2.5
pgrep -f "$T/resources/app" >/dev/null && ko "l'appli ne s'est pas fermée après la question" || ok "fermer le lecteur seul ferme l'appli"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert sys.argv[2] in d["dossiers"]' "$MEM" "$V" && ok "« Ajouter » : dossier retenu pour la bibliothèque" || ko "dossier non retenu"

echo "== 4. La même vidéo rouverte : reprise"
: > "$T/appli.log"; lance "$V/Voyage.En.Mer.2026.1080p.WEB.x264.mkv"
for _ in $(seq 1 30); do pgrep -f "input-ipc-server=.*rembobine-mpv" >/dev/null && break; sleep 0.5; done
pgrep -af "input-ipc-server=.*rembobine-mpv" | grep -q -- "--start=[1-9]" && ok "mpv reprend à la position retenue ($(pgrep -af "input-ipc-server=.*rembobine-mpv" | grep -o -- '--start=[0-9.]*'))" || ko "pas de reprise"
sleep 3.5; photo 5-video-reprise
quitte; sleep 1

echo "== 5. Jeu (ROM de test, émulateur intégré)"
: > "$T/appli.log"; lance "$J/Essai Rembobine.nes"
attend "ouverture jeu" 40 && ok "jeu ouvert" || ko "le jeu ne s'ouvre pas"
sleep 14; photo 6-jeu
quitte; sleep 1

echo "== 6. Rembobine déjà ouvert : la musique s'ouvre par-dessus, dans sa fenêtre"
: > "$T/appli.log"; lance
for _ in $(seq 1 40); do serveur && break; sleep 0.5; done; sleep 5
HOME="$H" "$EL" --no-sandbox --disable-gpu "$APP" "$A/01 - Lever du jour.mp3" >>"$T/appli.log" 2>&1
attend "ouverture musique" 20 && ok "musique ouverte dans la fenêtre de Rembobine" || ko "rien par-dessus la médiathèque"
sleep 4; photo 7-par-dessus
quitte; sleep 1

echo "== 7. « Ouvrir Rembobine » depuis le lecteur seul, puis Paramètres → Lecteur par défaut"
mkdir -p "$H/.local/share/applications"; { printf '[Desktop Entry]\nType=Application\nName=Rembobine\nExec=rembobine %%U\n'; node -e 'console.log(require(process.argv[1]).ligneMime())' "$ROOT/app/seul.js"; } > "$H/.local/share/applications/rembobine.desktop"
HOME="$H" REMBOBINE_PORT=$PORT REMBOBINE_FICHES=0 node "$ROOT/outils/essai/lecteur_seul_reglage.js" "$EL" "$APP" "$CAP" "$A/03 - Le phare.flac" && ok "réglage « Lecteur par défaut »" || ko "réglage « Lecteur par défaut »"

cp "$T/appli.log" "$CAP/appli.log" 2>/dev/null
echo "== Planche"
montage -font DejaVu-Sans -pointsize 18 -label '%t' "$CAP"/[0-9]-*.png -tile 3x -geometry 640x360+8+8 -background '#111' -fill '#eee' "$CAP/planche.png" 2>/dev/null && echo "  $CAP/planche.png"
[ "$ECHECS" = 0 ] && echo "Lecteur seul (essai) : tout est bon" || echo "Lecteur seul (essai) : $ECHECS échec(s)"
exit $((ECHECS > 0))
