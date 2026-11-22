#!/bin/bash
# Fabrique les paquets de bureau : Linux (PC), Raspberry Pi (arm64) et Windows.
# Utilise : ELECTRON_VERSION, BUILD_NUMBER (numéro de fabrication, GitHub : run_number), et les exports du module dans build/godot/.
# RBB_SANS_MODULE=1 : fabrique sans le module (dépôt public seul) ; sinon il est exigé, comme avant.
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd); OUT=$ROOT/build/dist; G=$ROOT/build/godot; DL=$ROOT/build/dl
EV=${ELECTRON_VERSION:-33.2.1}
# numéro de fabrication gravé dans l'appli (lu par le serveur : /api/info, « À propos », mises à jour automatiques)
V=$(cat VERSION); BN=${BUILD_NUMBER:-0}; BDATE=${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
# dépôt où l'appli cherche ses mises à jour (champ « depot » de build.json) : RBB_DEPOT (fabrication : le dépôt PUBLIC
# des versions s'il est réglé, sinon le dépôt de la fabrication) ; un nom mal formé retombe sur grecdel/Rembobine
DEPOT=${RBB_DEPOT:-${GITHUB_REPOSITORY:-grecdel/Rembobine}}
echo "$DEPOT" | grep -Eq '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' || DEPOT=grecdel/Rembobine
mkdir -p "$OUT" "$DL"
# Electron : chaque archive est comparée à la liste d'empreintes publiée avec la version (SHASUMS256.txt) ;
# une archive abîmée ou remplacée arrête la fabrication
EU="https://github.com/electron/electron/releases/download/v$EV"
curl -fsSL -o "$DL/electron-$EV-SHASUMS256.txt" "$EU/SHASUMS256.txt"
# … et cette liste elle-même doit être celle figée dans ci/empreintes.txt (clé electron/SHASUMS256.txt, même version)
. ci/empreintes.sh
read -r ev_fige h_liste _ <<<"$(emp_ligne electron/SHASUMS256.txt)"
if [ "$ev_fige" = "$EV" ] && [ "${h_liste:--}" != "-" ]; then
  emp_verifier "$DL/electron-$EV-SHASUMS256.txt" "$h_liste" || { echo "::error::Electron $EV : liste d'empreintes différente de celle figée dans ci/empreintes.txt"; exit 1; }
else echo "::warning::Electron $EV : liste d'empreintes pas figée dans ci/empreintes.txt (bash ci/relever_empreintes.sh electron)"; fi
for p in linux-x64 linux-arm64 win32-x64; do
  [ -f "$DL/electron-$p.zip" ] || curl -fsSL -o "$DL/electron-$p.zip" "$EU/electron-v$EV-$p.zip"
  h=$(grep -E "^[0-9a-f]{64} [ *]electron-v$EV-$p\.zip\s*$" "$DL/electron-$EV-SHASUMS256.txt" | cut -c1-64)
  if [ -z "$h" ] || ! echo "$h  $DL/electron-$p.zip" | sha256sum -c --quiet -; then
    echo "::error::Electron $EV ($p) : empreinte absente ou différente — archive refusée"; rm -f "$DL/electron-$p.zip"; exit 1
  fi
done
# copie d'un fichier du module : obligatoire, sauf avec RBB_SANS_MODULE=1
cpm() { if [ "${RBB_SANS_MODULE:-0}" = 1 ] && [ ! -e "$1" ]; then return 0; fi; cp "$1" "$2"; }
mkapp() {
  mkdir -p "$1/app" "$1/module"
  cp app/main.js app/module_natif.js app/module_web.js app/preload.js app/preload_module.js app/seul.js app/seul_main.js app/preload_seul.js app/package.json app/icon.png "$1/app/"
  # l'interface de lecture des films (script pour mpv) et le lecteur seul (« Ouvrir avec Rembobine »)
  mkdir -p "$1/app/lecteur"; cp app/lecteur/*.lua app/lecteur/seul.html "$1/app/lecteur/"
  # le serveur de la maison : tous ses fichiers, sauf les tests
  mkdir -p "$1/app/serveur"; for f in app/serveur/*.js; do case "$f" in */test_*) ;; *) cp "$f" "$1/app/serveur/" ;; esac; done
  printf '{"version":"%s","build":%s,"label":"%s+%s","date":"%s","commit":"%s","depot":"%s"}\n' "$V" "$BN" "$V" "$BN" "$BDATE" "${GITHUB_SHA:-local}" "$DEPOT" > "$1/app/build.json"
  mkdir -p "$1/app/web"; cp web/index.html "$1/app/web/index.html"
  # l'aide intégrée suit le LISEZ-MOI (lisible sans internet)
  python3 outils/aide/embarquer_aide.py "$1/app/web/index.html"
  # le module facultatif (s'il est posé) complète la page
  python3 outils/ext.py "$1/app/web/index.html"
  # l'émulateur intégré, sans internet (préparé par ci/emulateurs.sh build)
  if [ -d build/ejs ]; then cp -r build/ejs "$1/app/web/ejs"; fi
  # le lecteur de manuels PDF (pdf.js), sans internet (préparé par ci/pdfjs.sh build)
  if [ -d build/pdfjs ]; then cp -r build/pdfjs "$1/app/web/pdfjs"; fi
  # images du module (facultatives)
  if [ -d "$G/apercus3d" ]; then cp -r "$G/apercus3d" "$1/app/web/apercus3d"; fi
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$(cat VERSION)\"/" "$1/app/package.json"
  rm -f "$1/default_app.asar"
}
# allègement d'Electron (sans perte de fonction) : les traductions des menus internes de Chromium ne servent qu'en
# français et en anglais (les autres langues retombent sur l'anglais) → 3 fichiers gardés sur 55 (-38 Mo) ;
# et le dossier d'outils de fabrication « clang_x64_v8_arm64 » (programme pour PC, inutile sur le Raspberry, -11 Mo)
slim() {
  if [ -d "$1/locales" ]; then find "$1/locales" -name '*.pak' ! -name 'fr.pak' ! -name 'en-US.pak' ! -name 'en-GB.pak' -delete; fi
  rm -rf "$1/clang_x64_v8_arm64"
}
for arch in x64 arm64; do
  d="$OUT/Rembobine-Linux-$arch"; rm -rf "$d"; mkdir -p "$d"; unzip -q "$DL/electron-linux-$arch.zip" -d "$d"
  mv "$d/electron" "$d/rembobine-bin"
  slim "$d"
  mkapp "$d/resources"
  # PC : le module DANS la fenêtre du logiciel (sa version Web, app/module_web.js) ; le Raspberry garde le programme séparé
  if [ $arch = x64 ] && [ -d "$G/web" ]; then mkdir -p "$d/resources/module-web"; cp "$G"/web/rembobine-module.* "$d/resources/module-web/"; fi
  if [ $arch = x64 ]; then cpm "$G/rembobine-module.x86_64" "$d/resources/module/"; else cpm "$G/rembobine-module.arm64" "$d/resources/module/"; fi
  # les vrais émulateurs des consoles récentes (PC seulement : le Raspberry n'est pas assez puissant)
  if [ $arch = x64 ] && [ -d build/natifs/linux-x64 ]; then mkdir -p "$d/resources/emulateurs"; cp -a build/natifs/linux-x64/. "$d/resources/emulateurs/"; fi
  # Raspberry : seulement les outils (ffmpeg, mpv), les consoles lourdes n'y tournent pas
  if [ $arch = arm64 ] && [ -d build/natifs/linux-arm64 ]; then mkdir -p "$d/resources/emulateurs"; cp -a build/natifs/linux-arm64/. "$d/resources/emulateurs/"; fi
  if [ "${RBB_SANS_MODULE:-0}" = 1 ]; then chmod +x "$d/resources/module/"* 2>/dev/null || true; else chmod +x "$d/resources/module/"*; fi
  cp app/icon.png "$d/rembobine.png"; cp app/linux/* "$d/"; cp LISEZ-MOI.md LICENSE "$d/"
  chmod +x "$d/rembobine" "$d/installer.sh" "$d/desinstaller.sh"
  bash ci/licences.sh "$d" "linux-$arch"
  # signature des mises à jour (secret RBB_UPDATE_KEY) : en tout dernier, quand plus aucun fichier ne change
  node ci/signer_maj.js "$d"
done
(cd "$OUT" && tar czf Rembobine-Linux-PC.tar.gz -C . Rembobine-Linux-x64 && tar czf Rembobine-RaspberryPi.tar.gz Rembobine-Linux-arm64)
d="$OUT/Rembobine-Windows"; rm -rf "$d"; mkdir -p "$d"; unzip -q "$DL/electron-win32-x64.zip" -d "$d"
mv "$d/electron.exe" "$d/Rembobine.exe"
slim "$d"
mkapp "$d/resources"
if [ -d "$G/web" ]; then mkdir -p "$d/resources/module-web"; cp "$G"/web/rembobine-module.* "$d/resources/module-web/"; fi
cpm "$G/rembobine-module.exe" "$d/resources/module/"; cp LISEZ-MOI.md LICENSE "$d/"
if [ -d build/natifs/win-x64 ]; then mkdir -p "$d/resources/emulateurs"; cp -a build/natifs/win-x64/. "$d/resources/emulateurs/"; fi
bash ci/licences.sh "$d" win-x64
# signature des mises à jour, comme pour Linux (vérifiée par l'appli avant d'échanger les dossiers)
node ci/signer_maj.js "$d"
(cd "$OUT" && zip -qr Rembobine-Windows.zip Rembobine-Windows)
ls -la "$OUT"
