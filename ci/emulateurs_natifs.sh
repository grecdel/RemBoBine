#!/bin/bash
# Les VRAIS émulateurs des consoles récentes, mis directement dans l'application de bureau (rien à installer) :
#   ci/emulateurs_natifs.sh <dossier de sortie>   → <sortie>/linux-x64/<id>/…  et  <sortie>/win-x64/<id>/…
# Versions officielles les plus récentes : PCSX2 (PS2), RPCS3 (PS3), xemu (Xbox), PPSSPP (PSP), Dolphin (GameCube, Wii),
# Xenia Canary (Xbox 360). Linux : AppImage décompressée (marche sans FUSE) ; Windows : archive décompressée.
# Et les outils dont Rembobine a besoin, pour ne rien avoir à installer : ffmpeg/ffprobe (conversion vidéo) et mpv (lecteur),
# y compris pour le Raspberry (linux-arm64, outils seulement).
# Chaque émulateur est facultatif : s'il ne se télécharge pas, la fabrication continue et l'appli proposera de l'installer.
set -uo pipefail
OUT="$(mkdir -p "$1" && cd "$1" && pwd)"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
API=https://api.github.com
AUTH=(); [ -n "${GH_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $GH_TOKEN")
ok=(); manque=()

# adresse du fichier de la dernière version publiée sur GitHub dont le nom correspond au motif
# (si rien ne correspond, la liste des fichiers publiés est affichée pour comprendre)
gh_asset() { curl -fsSL "${AUTH[@]}" "$API/repos/$1/releases?per_page=5" | python3 -c "
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

appimage() {  # id, url [, plateforme]
  local id=$1 url=$2 d="$OUT/${3:-linux-x64}/$1"
  [ -n "$url" ] || { manque+=("$id (Linux)"); return; }
  curl -fsSL -o "$TMP/$id.AppImage" "$url" && chmod +x "$TMP/$id.AppImage" || { manque+=("$id (Linux)"); return; }
  rm -rf "$d"; mkdir -p "$d"
  (cd "$TMP" && rm -rf squashfs-root AppDir && "./$id.AppImage" --appimage-extract >/dev/null 2>&1)
  # (certaines AppImage récentes laissent « AppDir » comme simple raccourci vers le vrai dossier : on suit le raccourci)
  ex=""; for c in squashfs-root AppDir; do [ -x "$TMP/$c/AppRun" ] && ex="$(cd "$TMP" && readlink -f "$c")" && break; done
  if [ -n "$ex" ]; then
    rm -rf "$d"; mv "$ex" "$d"; rm -f "$TMP/$id.AppImage"
  else
    echo "  $id : pas décompressable ($(ls "$TMP" | tr '\n' ' '))"
    # AppImage d'un type récent (« anylinux ») : gardée telle quelle, lancée en mode « extraire et lancer » (sans FUSE)
    mv "$TMP/$id.AppImage" "$d/$id.AppImage"
  fi
  { [ -x "$d/AppRun" ] || [ -x "$d/$id.AppImage" ]; } && ok+=("$id (Linux)") || { echo "  $id : contenu $(ls -la "$d" | tr '\n' ' ')"; manque+=("$id (Linux)"); }
}
archive() {   # id, url (zip, 7z, tar.xz), [plateforme]
  local id=$1 url=$2 d="$OUT/${3:-win-x64}/$1" f
  [ -n "$url" ] || { manque+=("$id (Windows)"); return; }
  case "${url%%\?*}" in *.tar.xz) f="$TMP/$id.tar.xz" ;; *.tar.gz) f="$TMP/$id.tar.gz" ;; *) f="$TMP/$id.${url##*.}"; f="${f%%\?*}" ;; esac
  curl -fsSL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Rembobine" -o "$f" "$url" || { echo "  téléchargement refusé : $url"; manque+=("$id (Windows)"); return; }
  rm -rf "$d"; mkdir -p "$d"
  case "$f" in *.tar.xz|*.tar.gz|*.txz) tar -xf "$f" -C "$d" ;; *) 7z x -y -o"$d" "$f" >/dev/null ;; esac || { manque+=("$id (${3:-win-x64})"); return; }
  rm -f "$f"
  # ffmpeg : on garde bin (ffmpeg, ffprobe et leurs bibliothèques sous Windows) et lib ; pas ffplay, ni la documentation
  if [ "$id" = ffmpeg ]; then find "$d" \( -name 'ffplay*' -o -name doc -o -name include -o -name man -o -name pkgconfig -o -name '*.a' \) -prune -exec rm -rf {} + ; fi
  ok+=("$id (${3:-win-x64})")
}

echo "== Linux (PC)"
appimage pcsx2  "$(gh_asset PCSX2/pcsx2 'linux.*appimage.*\.AppImage$')"
appimage rpcs3  "$(gh_asset RPCS3/rpcs3-binaries-linux 'linux64.*\.AppImage$|\.AppImage$')"
appimage xemu   "$(gh_asset xemu-project/xemu 'x86_64\.AppImage$')"
u=$(gh_asset hrydgard/ppsspp 'x86_64\.AppImage$|anylinux.*\.AppImage$'); [ -n "$u" ] || u=$(page_link https://www.ppsspp.org/download/ 'https?://[^"]*\.AppImage|/files/[^"]*\.AppImage' | sed 's|^/files|https://www.ppsspp.org/files|')
appimage ppsspp "$u"
archive xenia  "$(gh_asset xenia-canary/xenia-canary-releases 'linux.*\.tar\.xz$|linux.*\.tar\.gz$')" linux-x64
# Xenia Linux a besoin de SDL2 (souvent absente) : on la livre à côté du programme (paquet Ubuntu officiel)
x=$(find "$OUT/linux-x64/xenia" -type f -name xenia_canary 2>/dev/null | head -1)
if [ -n "$x" ]; then
  # (avec ses compagnes peu répandues : libsamplerate, libdecor, lz4 ; le son PulseAudio est présent sur tous les bureaux)
  for pk in libsdl2-2.0-0 libsamplerate0 libdecor-0-0 liblz4-1; do (cd "$TMP" && apt-get download "$pk" >/dev/null 2>&1 && dpkg-deb -x "$pk"_*.deb sdl) || echo "  xenia : $pk introuvable"; done
  for so in libSDL2-2.0.so.0 libsamplerate.so.0 libdecor-0.so.0 liblz4.so.1; do cp -L "$TMP"/sdl/usr/lib/x86_64-linux-gnu/$so "$(dirname "$x")/" 2>/dev/null && echo "  xenia : $so livrée avec"; done
fi
echo "== Outils (ffmpeg, mpv)"
# version « partagée » : ffmpeg et ffprobe utilisent les mêmes bibliothèques (bien plus léger que deux programmes complets)
archive ffmpeg "$(gh_asset BtbN/FFmpeg-Builds 'master-latest-linux64-gpl-shared\.tar\.xz$')" linux-x64
archive ffmpeg "$(gh_asset BtbN/FFmpeg-Builds 'master-latest-linuxarm64-gpl-shared\.tar\.xz$')" linux-arm64
archive ffmpeg "$(gh_asset BtbN/FFmpeg-Builds 'master-latest-win64-gpl-shared\.zip$')" win-x64
appimage mpv "$(gh_asset pkgforge-dev/mpv-AppImage '^mpv-v[0-9.]+-anylinux-x86_64\.AppImage$')" linux-x64
appimage mpv "$(gh_asset pkgforge-dev/mpv-AppImage '^mpv-v[0-9.]+-anylinux-aarch64\.AppImage$')" linux-arm64
archive mpv "$(gh_asset shinchiro/mpv-winbuild-cmake '^mpv-x86_64-[0-9]+-git-.*\.7z$')" win-x64
echo "== Windows"
archive pcsx2  "$(gh_asset PCSX2/pcsx2 'windows-x64.*\.7z$')"
archive rpcs3  "$(gh_asset RPCS3/rpcs3-binaries-win 'win64.*\.7z$|\.7z$')"
archive xemu   "$(gh_asset xemu-project/xemu 'win.*x86_64.*release.*\.zip$|xemu-win-release\.zip$|win.*\.zip$')"
archive xenia  "$(gh_asset xenia-canary/xenia-canary-releases 'windows.*\.zip$|xenia_canary.*\.zip$')"
u=$(gh_asset hrydgard/ppsspp 'Windows-x64\.zip$|PPSSPPWindows.*\.zip$|ppsspp_win\.zip$'); [ -n "$u" ] || u=$(page_link https://www.ppsspp.org/download/ 'https?://[^"]*ppsspp_win\.zip|/files/[^"]*ppsspp_win\.zip' | sed 's|^/files|https://www.ppsspp.org/files|')
archive ppsspp "$u"
u=$(page_link https://dolphin-emu.org/download/ 'https://dl\.dolphin-emu\.org/releases/[^"]*-x64\.7z')
if [ -z "$u" ]; then for p in https://dolphin-emu.org/download/ https://dolphin-emu.org/download/list/releases/1/ https://dolphin-emu.org/update/latest/release; do
  echo "  dolphin : $p → $(curl -s -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' "$p")"; done; fi
archive dolphin "$u"

echo "Prêts : ${ok[*]:-aucun}"
echo "Absents (l'appli proposera de les installer) : ${manque[*]:-aucun}"
du -sh "$OUT"/* 2>/dev/null
exit 0
