#!/bin/bash
# Les VRAIS émulateurs des consoles récentes, mis directement dans l'application de bureau (rien à installer) :
#   ci/emulateurs_natifs.sh <dossier de sortie>   → <sortie>/linux-x64/<id>/…  et  <sortie>/win-x64/<id>/…
#   ci/emulateurs_natifs.sh --relever             → cherche les dernières versions officielles et écrit, pour chacune,
#                                                    la ligne « clé version sha256 adresse » (pour ci/empreintes.txt)
# PCSX2 (PS2), RPCS3 (PS3), xemu (Xbox), PPSSPP (PSP), Dolphin (GameCube, Wii), Xenia Canary (Xbox 360).
# Linux : AppImage décompressée (marche sans FUSE) ; Windows : archive décompressée.
# Et les outils dont Rembobine a besoin, pour ne rien avoir à installer : ffmpeg/ffprobe (conversion vidéo) et mpv (lecteur),
# y compris pour le Raspberry (linux-arm64, outils seulement).
# Sécurité : la fabrication ne prend QUE les versions figées dans ci/empreintes.txt, et refuse un fichier dont l'empreinte
# SHA-256 ne correspond pas (fichier remplacé ou abîmé). Pour passer à des versions plus récentes : ci/relever_empreintes.sh.
# Chaque émulateur est facultatif : s'il manque ou est refusé, la fabrication continue et l'appli proposera de l'installer.
set -uo pipefail
. "$(dirname "$0")/empreintes.sh"
RELEVER=0; [ "${1:-}" = "--relever" ] && RELEVER=1
if [ $RELEVER = 0 ]; then OUT="$(mkdir -p "$1" && cd "$1" && pwd)"; fi
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
API=https://api.github.com
AUTH=(); [ -n "${GH_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $GH_TOKEN")
ok=(); manque=()

# ce que la fabrication livre : « id plateforme genre » (genre : appimage ou archive)
ENTREES=(
  "pcsx2 linux-x64 appimage" "rpcs3 linux-x64 appimage" "xemu linux-x64 appimage" "ppsspp linux-x64 appimage" "xenia linux-x64 archive"
  "ffmpeg linux-x64 archive" "ffmpeg linux-arm64 archive" "ffmpeg win-x64 archive"
  "mpv linux-x64 appimage" "mpv linux-arm64 appimage" "mpv win-x64 archive"
  "pcsx2 win-x64 archive" "rpcs3 win-x64 archive" "xemu win-x64 archive" "xenia win-x64 archive" "ppsspp win-x64 archive" "dolphin win-x64 archive"
)

# ---- seulement pour --relever : où trouver la dernière version officielle de chaque fichier ----
# adresse du fichier de la dernière version publiée sur GitHub dont le nom correspond au motif
gh_asset() { curl -fsSL "${AUTH[@]}" "$API/repos/$1/releases?per_page=8" | python3 -c "
import json,re,sys
rels=json.load(sys.stdin); pat=re.compile(sys.argv[1],re.I)
# versions pour processeurs ARM écartées, sauf quand on les demande exprès (outils du Raspberry)
excl=r'debug|symbols|\.sig$|\.sha|\.zsync$' + ('' if re.search('arm|aarch',sys.argv[1],re.I) else r'|aarch64|arm64')
for d in rels:
    if d.get('draft'): continue
    for a in d.get('assets',[]):
        n=a['name']
        if pat.search(n) and not re.search(excl,n,re.I): print(a['browser_download_url']); sys.exit(0)
print('  rien pour', sys.argv[2], 'dans', [a['name'] for d in rels[:2] for a in d.get('assets',[])][:20], file=sys.stderr)
" "$2" "$1"; }
# premier lien d'une page web correspondant au motif
page_link() { curl -fsSL -A "Mozilla/5.0 (X11; Linux x86_64) Rembobine" "$1" | grep -oE "$2" | head -1; }
# ffmpeg : une version datée (le fichier « master-latest » est remplacé chaque jour, son empreinte changerait sans cesse)
ffmpeg_asset() { local u; u=$(gh_asset BtbN/FFmpeg-Builds "^ffmpeg-N-[0-9]+-g[0-9a-f]+-$1-gpl-shared\.$2\$"); [ -n "$u" ] || u=$(gh_asset BtbN/FFmpeg-Builds "master-latest-$1-gpl-shared\.$2\$"); echo "$u"; }
resoudre() {
  local u
  case "$1/$2" in
    pcsx2/linux-x64)  gh_asset PCSX2/pcsx2 'linux.*appimage.*\.AppImage$' ;;
    rpcs3/linux-x64)  gh_asset RPCS3/rpcs3-binaries-linux 'linux64.*\.AppImage$|\.AppImage$' ;;
    xemu/linux-x64)   gh_asset xemu-project/xemu 'x86_64\.AppImage$' ;;
    ppsspp/linux-x64) u=$(gh_asset hrydgard/ppsspp 'x86_64\.AppImage$|anylinux.*\.AppImage$'); [ -n "$u" ] || u=$(page_link https://www.ppsspp.org/download/ 'https?://[^"]*\.AppImage|/files/[^"]*\.AppImage' | sed 's|^/files|https://www.ppsspp.org/files|'); echo "$u" ;;
    xenia/linux-x64)  gh_asset xenia-canary/xenia-canary-releases 'linux.*\.tar\.xz$|linux.*\.tar\.gz$' ;;
    # version « partagée » : ffmpeg et ffprobe utilisent les mêmes bibliothèques (bien plus léger que deux programmes complets)
    ffmpeg/linux-x64)   ffmpeg_asset linux64 'tar\.xz' ;;
    ffmpeg/linux-arm64) ffmpeg_asset linuxarm64 'tar\.xz' ;;
    ffmpeg/win-x64)     ffmpeg_asset win64 'zip' ;;
    mpv/linux-x64)    gh_asset pkgforge-dev/mpv-AppImage '^mpv-v[0-9.]+-anylinux-x86_64\.AppImage$' ;;
    mpv/linux-arm64)  gh_asset pkgforge-dev/mpv-AppImage '^mpv-v[0-9.]+-anylinux-aarch64\.AppImage$' ;;
    mpv/win-x64)      gh_asset shinchiro/mpv-winbuild-cmake '^mpv-x86_64-[0-9]+-git-.*\.7z$' ;;
    pcsx2/win-x64)    gh_asset PCSX2/pcsx2 'windows-x64.*\.7z$' ;;
    rpcs3/win-x64)    gh_asset RPCS3/rpcs3-binaries-win 'win64.*\.7z$|\.7z$' ;;
    xemu/win-x64)     gh_asset xemu-project/xemu 'win.*x86_64.*release.*\.zip$|xemu-win-release\.zip$|win.*\.zip$' ;;
    xenia/win-x64)    gh_asset xenia-canary/xenia-canary-releases 'windows.*\.zip$|xenia_canary.*\.zip$' ;;
    ppsspp/win-x64)   u=$(gh_asset hrydgard/ppsspp 'Windows-x64\.zip$|PPSSPPWindows.*\.zip$|ppsspp_win\.zip$'); [ -n "$u" ] || u=$(page_link https://www.ppsspp.org/download/ 'https?://[^"]*ppsspp_win\.zip|/files/[^"]*ppsspp_win\.zip' | sed 's|^/files|https://www.ppsspp.org/files|'); echo "$u" ;;
    dolphin/win-x64)  page_link https://dolphin-emu.org/download/ 'https://dl\.dolphin-emu\.org/releases/[^"]*-x64\.7z' ;;
  esac
}
# version lisible tirée de l'adresse (étiquette de la publication GitHub, sinon nom du fichier)
version_de() { local t; t=$(echo "$1" | sed -nE 's|.*/releases/download/([^/]+)/.*|\1|p'); [ -n "$t" ] && echo "$t" || basename "${1%%\?*}"; }

if [ $RELEVER = 1 ]; then
  for e in "${ENTREES[@]}"; do
    read -r id plat genre <<<"$e"; k="natif/$id/$plat"
    u=$(resoudre "$id" "$plat")
    if [ -z "$u" ]; then echo "$k - - -"; echo "  $k : introuvable" >&2; continue; fi
    if curl -fsSL --retry 2 -A "Mozilla/5.0 (X11; Linux x86_64) Rembobine" -o "$TMP/f" "$u"; then
      echo "$k $(version_de "$u") $(sha256sum "$TMP/f" | cut -c1-64) $u"; echo "  $k : relevé ($(du -h "$TMP/f" | cut -f1))" >&2
    else echo "$k $(version_de "$u") - $u"; echo "  $k : téléchargement impossible ($u)" >&2; fi
    rm -f "$TMP/f"
  done
  exit 0
fi

# ---- fabrication : seulement les fichiers figés et vérifiés ----
appimage() {  # id, fichier téléchargé, plateforme
  local id=$1 f=$2 d="$OUT/$3/$1"
  chmod +x "$f"; rm -rf "$d"; mkdir -p "$d"
  (cd "$TMP" && rm -rf squashfs-root AppDir && "$f" --appimage-extract >/dev/null 2>&1)
  # (certaines AppImage récentes laissent « AppDir » comme simple raccourci vers le vrai dossier : on suit le raccourci)
  ex=""; for c in squashfs-root AppDir; do [ -x "$TMP/$c/AppRun" ] && ex="$(cd "$TMP" && readlink -f "$c")" && break; done
  if [ -n "$ex" ]; then
    rm -rf "$d"; mv "$ex" "$d"; rm -f "$f"
  else
    echo "  $id : pas décompressable ($(ls "$TMP" | tr '\n' ' '))"
    # AppImage d'un type récent (« anylinux ») : gardée telle quelle, lancée en mode « extraire et lancer » (sans FUSE)
    mv "$f" "$d/$id.AppImage"
  fi
  { [ -x "$d/AppRun" ] || [ -x "$d/$id.AppImage" ]; } && ok+=("$id ($3)") || { echo "  $id : contenu $(ls -la "$d" | tr '\n' ' ')"; manque+=("$id ($3)"); }
}
archive() {   # id, fichier téléchargé (zip, 7z, tar.xz), plateforme
  local id=$1 f=$2 d="$OUT/$3/$1"
  rm -rf "$d"; mkdir -p "$d"
  case "$f" in *.tar.xz|*.tar.gz|*.txz) tar -xf "$f" -C "$d" ;; *) 7z x -y -o"$d" "$f" >/dev/null ;; esac || { manque+=("$id ($3)"); return; }
  rm -f "$f"
  # ffmpeg : on garde bin (ffmpeg, ffprobe et leurs bibliothèques sous Windows) et lib ; pas ffplay, ni la documentation
  if [ "$id" = ffmpeg ]; then find "$d" \( -name 'ffplay*' -o -name doc -o -name include -o -name man -o -name pkgconfig -o -name '*.a' \) -prune -exec rm -rf {} + ; fi
  ok+=("$id ($3)")
}

for e in "${ENTREES[@]}"; do
  read -r id plat genre <<<"$e"; k="natif/$id/$plat"
  read -r _v _h u <<<"$(emp_ligne "$k")"; n=$(basename "${u:-x}"); n=${n%%\?*}
  case "$n" in *.tar.xz) f="$TMP/$id.tar.xz" ;; *.tar.gz) f="$TMP/$id.tar.gz" ;; *.AppImage) f="$TMP/$id.AppImage" ;; *) f="$TMP/$id.${n##*.}" ;; esac
  ua="Mozilla/5.0 (X11; Linux x86_64) Rembobine"; [ "$plat" = win-x64 ] && ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Rembobine"
  emp_telecharger "$k" "$f" "$ua" || { manque+=("$id ($plat)"); continue; }
  if [ "$genre" = appimage ]; then appimage "$id" "$f" "$plat"; else archive "$id" "$f" "$plat"; fi
done

# Xenia Linux a besoin de SDL2 (souvent absente) : on la livre à côté du programme (paquet Ubuntu officiel, signé par apt)
x=$(find "$OUT/linux-x64/xenia" -type f -name xenia_canary 2>/dev/null | head -1)
if [ -n "$x" ]; then
  # (avec ses compagnes peu répandues : libsamplerate, libdecor, lz4 ; le son PulseAudio est présent sur tous les bureaux)
  for pk in libsdl2-2.0-0 libsamplerate0 libdecor-0-0 liblz4-1; do (cd "$TMP" && apt-get download "$pk" >/dev/null 2>&1 && dpkg-deb -x "$pk"_*.deb sdl) || echo "  xenia : $pk introuvable"; done
  for so in libSDL2-2.0.so.0 libsamplerate.so.0 libdecor-0.so.0 liblz4.so.1; do cp -L "$TMP"/sdl/usr/lib/x86_64-linux-gnu/$so "$(dirname "$x")/" 2>/dev/null && echo "  xenia : $so livrée avec"; done
fi

echo "Prêts : ${ok[*]:-aucun}"
echo "Absents (l'appli proposera de les installer) : ${manque[*]:-aucun}"
du -sh "$OUT"/* 2>/dev/null
exit 0
