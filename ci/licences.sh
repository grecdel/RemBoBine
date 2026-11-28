#!/bin/bash
# Remplit le dossier « licences » d'une application fabriquée, à partir des textes de licence présents
# dans les paquets téléchargés (COPYING, LICENSE…) ; sinon, on va chercher le texte officiel publié avec le code source ;
# en dernier recours, un petit fichier donne l'adresse du texte. La page « Crédits et licences » liste tout.
#   ci/licences.sh <dossier de l'application> <linux-x64|linux-arm64|win-x64>
set -uo pipefail
APP="$1"; PLAT="${2:-linux-x64}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
L="$APP/licences"; rm -rf "$L"; mkdir -p "$L"
RES="$APP/resources"
note() { echo "  licences : $*"; }

# 1. Rembobine lui-même (tous droits réservés)
cp "$ROOT/LICENSE" "$L/Rembobine-LICENSE.txt"

# 1 bis. polices embarquées dans la page (SIL Open Font License 1.1)
[ -f "$ROOT/ci/licences/Polices-OFL.txt" ] && cp "$ROOT/ci/licences/Polices-OFL.txt" "$L/Polices-OFL.txt"
# polices des époques du salon (OFL, et Go Sans, TeX Gyre Adventor, DejaVu Sans, Special Elite : leurs textes)
[ -f "$ROOT/ci/licences/Polices-epoques.txt" ] && cp "$ROOT/ci/licences/Polices-epoques.txt" "$L/Polices-epoques.txt"

# jingle de démarrage : les deux enregistrements de lecteur de cassettes (CC0)
[ -f "$ROOT/ci/licences/Jingle-CREDITS.txt" ] && cp "$ROOT/ci/licences/Jingle-CREDITS.txt" "$L/Jingle-CREDITS.txt"

# 1 ter. sons d'ambiance enregistrés libres (feu, eau, vent : CC0, liste et adresses de chaque fichier), s'ils sont livrés
[ -f "$ROOT/godot/son/CREDITS-sons.md" ] && cp "$ROOT/godot/son/CREDITS-sons.md" "$L/Sons-libres-CREDITS.txt"

# 2. Electron et Chromium (fournis dans l'archive officielle d'Electron)
[ -f "$APP/LICENSE" ] && cp "$APP/LICENSE" "$L/Electron-LICENSE.txt"
[ -f "$APP/LICENSES.chromium.html" ] && cp "$APP/LICENSES.chromium.html" "$L/Chromium-LICENSES.html"

# 3. EmulatorJS et ses cœurs (textes extraits par ci/emulateurs.sh)
E="$RES/app/web/ejs"
[ -f "$E/LICENCE-EmulatorJS.txt" ] && cp "$E/LICENCE-EmulatorJS.txt" "$L/EmulatorJS-LICENSE.txt"
if [ -d "$E/licences" ]; then for f in "$E"/licences/*.txt; do [ -s "$f" ] && cp "$f" "$L/coeur-$(basename "$f")"; done; fi

# 3 bis. le lecteur de manuels PDF (pdf.js, Apache-2.0 ; ses tables de caractères et polices standard ont leur texte)
P="$RES/app/web/pdfjs"
[ -f "$P/LICENCE-pdfjs.txt" ] && cp "$P/LICENCE-pdfjs.txt" "$L/pdfjs-LICENSE.txt"
[ -f "$P/cmaps/LICENSE" ] && cp "$P/cmaps/LICENSE" "$L/pdfjs-cmaps-LICENSE.txt"
[ -f "$P/standard_fonts/LICENSE_FOXIT" ] && cp "$P/standard_fonts/LICENSE_FOXIT" "$L/pdfjs-polices-Foxit-LICENSE.txt"
[ -f "$P/standard_fonts/LICENSE_LIBERATION" ] && cp "$P/standard_fonts/LICENSE_LIBERATION" "$L/pdfjs-polices-Liberation-LICENSE.txt"

# 4. émulateurs et outils livrés (resources/emulateurs/<id>) : on prend les textes qu'ils contiennent
if [ -d "$RES/emulateurs" ]; then
  for d in "$RES"/emulateurs/*/; do
    id=$(basename "$d"); n=0
    while IFS= read -r f; do
      [ -s "$f" ] || continue
      rel="${f#"$d"}"; dest="$id-$(echo "$rel" | tr '/ ' '__')"
      case "$dest" in *.txt|*.md|*.html) ;; *) dest="$dest.txt" ;; esac
      cp "$f" "$L/$dest"; n=$((n+1))
    done < <(find "$d" -maxdepth 6 -type f -size -3M \( -iname 'COPYING*' -o -iname 'LICENSE*' -o -iname 'LICENCE*' -o -iname 'copyright' -o -iname 'AUTHORS*' -o -iname 'NOTICE*' \) \
               ! -path '*/locale/*' ! -path '*/translations/*' 2>/dev/null | sort | head -40)
    [ $n -gt 0 ] && note "$id : $n texte(s) trouvé(s) dans le paquet" || echo "$id" >> "$L/.sans-texte"
  done
fi

# 5. ce qui n'a pas apporté son texte : le texte officiel, publié avec le code source (sinon un lien)
#    id → adresse du texte de licence
declare -A URL=(
  [godot]="https://raw.githubusercontent.com/godotengine/godot/4.7-stable/LICENSE.txt"
  [godot-copyright]="https://raw.githubusercontent.com/godotengine/godot/4.7-stable/COPYRIGHT.txt"
  [pcsx2]="https://raw.githubusercontent.com/PCSX2/pcsx2/master/COPYING.GPLv3"
  [rpcs3]="https://raw.githubusercontent.com/RPCS3/rpcs3/master/LICENSE"
  [xemu]="https://raw.githubusercontent.com/xemu-project/xemu/master/COPYING"
  [xenia]="https://raw.githubusercontent.com/xenia-canary/xenia-canary/canary_experimental/LICENSE"
  [ppsspp]="https://raw.githubusercontent.com/hrydgard/ppsspp/master/LICENSE.TXT"
  [dolphin]="https://raw.githubusercontent.com/dolphin-emu/dolphin/master/COPYING"
  [ffmpeg]="https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/COPYING.GPLv3"
  [mpv]="https://raw.githubusercontent.com/mpv-player/mpv/master/Copyright"
  [sdl2]="https://raw.githubusercontent.com/libsdl-org/SDL/SDL2/LICENSE.txt"
)
want=(godot godot-copyright)
if [ -f "$L/.sans-texte" ]; then while read -r id; do want+=("$id"); done < "$L/.sans-texte"; fi
# Xenia Linux : bibliothèques livrées à côté (SDL2…)
ls "$RES"/emulateurs/xenia/*/libSDL2* "$RES"/emulateurs/xenia/libSDL2* >/dev/null 2>&1 && want+=(sdl2)
for id in "${want[@]}"; do
  u="${URL[$id]:-}"; [ -n "$u" ] || continue
  out="$L/$id-LICENSE.txt"
  if curl -fsSL --max-time 30 -o "$out" "$u" && [ -s "$out" ]; then note "$id : texte officiel téléchargé"
  else rm -f "$out"; printf 'Le texte de la licence de %s se trouve ici :\n%s\n' "$id" "$u" > "$L/$id-LICENSE-adresse.txt"; note "$id : adresse seulement"; fi
done
rm -f "$L/.sans-texte"

# 6. index lisible
{ echo "Textes des licences des logiciels livrés avec Rembobine ($PLAT)."
  echo "La liste complète, avec l'adresse du code source de chacun : Paramètres → À propos → Crédits et licences."
  echo; ls -1 "$L" | grep -v '^LISEZ-MOI' ; } > "$L/LISEZ-MOI.txt"
echo "  licences : $(ls -1 "$L" | wc -l) fichiers dans $L"
