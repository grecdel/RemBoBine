#!/bin/bash
# Essai « de bout en bout » de l'application Linux FABRIQUÉE (lancé à chaque fabrication, la fait échouer s'il échoue) :
#   l'appli démarre sous un faux écran (xvfb), /api/info répond avec le numéro de fabrication, la page servie s'ouvre
#   sans erreur JavaScript (Playwright), une vidéo de test (faite par ffmpeg) passe par /media, un jeu de test
#   (ROM maison de outils/emulateurs/roms_test.py) est listé dans la bibliothèque.
#   ci/essai_bout_en_bout.sh <dossier Rembobine-Linux-x64> [dossier des captures]
# Demande : xvfb-run, ffmpeg, python3, node et le module playwright (avec Chromium) — voir build.yml.
set -euo pipefail
APP="$(cd "$1" && pwd)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CAP="${2:-$ROOT/build/essai}"; mkdir -p "$CAP"
T=$(mktemp -d); H="$T/home"; M="$H/Rembobine"
mkdir -p "$M/Films/Essai de Rembobine (2026)" "$M/Jeux/NES"
PID=""
fin() { [ -n "$PID" ] && kill "$PID" 2>/dev/null; sleep 1; pkill -f "$APP/rembobine-bin" 2>/dev/null || true; cp -f "$T/appli.log" "$CAP/appli.log" 2>/dev/null || true; rm -rf "$T"; }
trap fin EXIT

echo "== Médias de test"
ffmpeg -loglevel error -f lavfi -i testsrc=duration=4:size=640x360:rate=25 -f lavfi -i sine=frequency=440:duration=4 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$M/Films/Essai de Rembobine (2026)/essai.mp4"
python3 "$ROOT/outils/emulateurs/roms_test.py" "$T/roms" >/dev/null
cp "$T/roms/test.nes" "$M/Jeux/NES/Essai Rembobine.nes"
ls -la "$M/Films/Essai de Rembobine (2026)" "$M/Jeux/NES"

echo "== Démarrage de l'appli (écran virtuel)"
PORT=${REMBOBINE_PORT:-8080}
HOME="$H" REMBOBINE_PORT=$PORT xvfb-run -a -s "-screen 0 1280x800x24" "$APP/rembobine" --disable-gpu >"$T/appli.log" 2>&1 &
PID=$!

echo "== Vérifications"
node "$ROOT/outils/essai/bout_en_bout.js" "http://127.0.0.1:$PORT" "$CAP" "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("label",""))' "$APP/resources/app/build.json" 2>/dev/null || echo "")"
