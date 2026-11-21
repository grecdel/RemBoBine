#!/bin/bash
# Rassemble l'émulateur intégré (EmulatorJS) et ses consoles, pour qu'il marche SANS internet.
#   ci/emulateurs.sh <dossier de sortie>      → <sortie>/ejs/data/ (loader.js, src/, cores/…)
# Les fichiers viennent du registre npm (paquets officiels @emulatorjs/*), version figée ci-dessous ; chaque archive
# est comparée à son empreinte SHA-256 figée dans ci/empreintes.txt (clés npm/@emulatorjs/…) et refusée sinon.
# Seules les variantes utiles des consoles sont gardées (WebGL2 et « legacy », sans les fils d'exécution).
set -euo pipefail
OUT="$(mkdir -p "$1" && cd "$1" && pwd)/ejs"
V=4.2.3
# console → cœur : NES, Super Nintendo, Game Boy (et Color), GBA, Master System, Mega Drive et Game Gear,
# PC Engine, Atari 2600, Nintendo 64, Nintendo DS, PlayStation, arcade (FBNeo) ;
# puis, sans BIOS à fournir : Atari 7800, Virtual Boy, Neo Geo Pocket, WonderSwan, Sega 32X, Commodore 64,
# ZX Spectrum, Amstrad CPC, arcade MAME 2003
CORES="fceumm snes9x gambatte mgba smsplus genesis_plus_gx mednafen_pce stella2014 mupen64plus_next melonds pcsx_rearmed fbneo \
 prosystem beetle_vb mednafen_ngp mednafen_wswan picodrive vice_x64sc fuse cap32 mame2003_plus"
. "$(dirname "$0")/empreintes.sh"
# archive npm téléchargée → refus (arrêt) si son empreinte n'est pas celle figée pour cette version
verif() {  # paquet, fichier
  local v h; read -r v h _ <<<"$(emp_ligne "npm/@emulatorjs/$1")"
  [ "$v" = "$V" ] && emp_verifier "$2" "$h" || { echo "::error::@emulatorjs/$1 $V : empreinte absente ou différente de ci/empreintes.txt — refusé"; exit 1; }
}
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm pack --silent "@emulatorjs/emulatorjs@$V" >/dev/null
verif emulatorjs "emulatorjs-emulatorjs-$V.tgz"
tar xzf emulatorjs-emulatorjs-$V.tgz
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r package/data "$OUT/data"
cp package/LICENSE "$OUT/LICENCE-EmulatorJS.txt"
rm -rf "$OUT/data/cores"; mkdir -p "$OUT/data/cores/reports"
# pas d'appel à internet : EmulatorJS vérifie sinon s'il existe une version plus récente (simple message dans la console)
sed -i 's|^    checkForUpdates() {|    checkForUpdates() { return; // Rembobine : version embarquée, aucun appel à internet|' "$OUT/data/src/emulator.js"
grep -q "Rembobine : version embarquée" "$OUT/data/src/emulator.js" || { echo "checkForUpdates introuvable"; exit 1; }
for c in $CORES; do
  npm pack --silent "@emulatorjs/core-$c@$V" >/dev/null
  verif "core-$c" "emulatorjs-core-$c-$V.tgz"
  mkdir -p "c-$c"; tar xzf "emulatorjs-core-$c-$V.tgz" -C "c-$c"
  cp "c-$c/package/$c-wasm.data" "c-$c/package/$c-legacy-wasm.data" "$OUT/data/cores/"
  cp "c-$c/package/reports/$c.json" "$OUT/data/cores/reports/"
  # le texte de licence du cœur est rangé dans son archive (.data = 7z) : on le sort pour « Crédits et licences »
  if command -v 7z >/dev/null; then mkdir -p "$OUT/licences"; 7z e -so "c-$c/package/$c-wasm.data" license.txt > "$OUT/licences/$c.txt" 2>/dev/null || true; [ -s "$OUT/licences/$c.txt" ] || rm -f "$OUT/licences/$c.txt"; fi
done
echo "$V" > "$OUT/VERSION"
du -sh "$OUT"
