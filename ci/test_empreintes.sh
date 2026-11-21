#!/bin/bash
# Essai du refus par empreinte (sans internet) : bash ci/test_empreintes.sh
# Faux fichiers servis en file:// : un bon, un remplacé (refusé), et des lignes sans empreinte relevée (« - ») :
# acceptées comme avant (dernière version) avec l'avertissement « empreinte non figée », sauf si l'empreinte publiée
# par le projet (<fichier>.sha256) ne correspond pas.
set -uo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
ok=0; ko=0; check() { if eval "$1"; then ok=$((ok+1)); else ko=$((ko+1)); echo "ÉCHEC : $2"; fi; }
mkdir -p "$T/src/ffmpeg/bin" "$T/src/mpv"
echo "#!/bin/sh" > "$T/src/ffmpeg/bin/ffmpeg"; tar -cJf "$T/ffmpeg.tar.xz" -C "$T/src" ffmpeg
# fausse AppImage : sait seulement se « décompresser » (comme une vraie, avec --appimage-extract)
printf '#!/bin/sh\n[ "$1" = --appimage-extract ] && mkdir -p squashfs-root && printf "#!/bin/sh\\n" > squashfs-root/AppRun && chmod +x squashfs-root/AppRun\n' > "$T/mpv.AppImage"
cp "$T/mpv.AppImage" "$T/pcsx2.AppImage"; echo "# remplacée" >> "$T/pcsx2.AppImage"
h() { sha256sum "$1" | cut -c1-64; }
cat > "$T/emp.txt" <<EOT
# faux
natif/ffmpeg/linux-x64 essai $(h "$T/ffmpeg.tar.xz") file://$T/ffmpeg.tar.xz
natif/mpv/linux-x64 essai $(h "$T/mpv.AppImage") file://$T/mpv.AppImage
natif/pcsx2/linux-x64 essai $(h "$T/mpv.AppImage") file://$T/pcsx2.AppImage
natif/xemu/linux-x64 essai - file://$T/mpv.AppImage
natif/ppsspp/linux-x64 - - -
natif/rpcs3/linux-x64 - - -
EOT
# « dernière version » imposée pour l'essai (sans internet) : xemu sans empreinte publiée, PPSSPP avec la bonne,
# RPCS3 avec une empreinte publiée qui ne correspond pas
cp "$T/mpv.AppImage" "$T/ppsspp.AppImage"; h "$T/ppsspp.AppImage" > "$T/ppsspp.AppImage.sha256"
cp "$T/mpv.AppImage" "$T/rpcs3.AppImage"; echo "$(printf '0%.0s' {1..64})  rpcs3.AppImage" > "$T/rpcs3.AppImage.sha256"
out=$(EMP_FICHIER="$T/emp.txt" EMP_ESSAI_SEUL="ffmpeg/linux-x64 mpv/linux-x64 pcsx2/linux-x64 xemu/linux-x64 ppsspp/linux-x64 rpcs3/linux-x64" EMP_ADRESSE_xemu_linux_x64="file://$T/mpv.AppImage" EMP_ADRESSE_ppsspp_linux_x64="file://$T/ppsspp.AppImage" EMP_ADRESSE_rpcs3_linux_x64="file://$T/rpcs3.AppImage" bash ci/emulateurs_natifs.sh "$T/out" 2>&1)
check '[ -f "$T/out/linux-x64/ffmpeg/ffmpeg/bin/ffmpeg" ]' "archive à la bonne empreinte : décompressée"
check '[ -x "$T/out/linux-x64/mpv/AppRun" ]' "AppImage à la bonne empreinte : décompressée"
check '[ ! -e "$T/out/linux-x64/pcsx2" ] && grep -q "pcsx2.*empreinte différente" <<<"$out"' "fichier remplacé : refusé"
check '[ -x "$T/out/linux-x64/xemu/AppRun" ] && grep -q "xemu/linux-x64 : empreinte non figée" <<<"$out"' "empreinte « - » : accepté comme avant, avec l'avertissement « empreinte non figée »"
check '[ -x "$T/out/linux-x64/ppsspp/AppRun" ] && grep -q "ppsspp/linux-x64 : empreinte publiée vérifiée" <<<"$out"' "empreinte « - » : comparée à l'empreinte publiée par le projet"
check '[ ! -e "$T/out/linux-x64/rpcs3/AppRun" ] && grep -q "rpcs3/linux-x64 : empreinte différente de celle publiée" <<<"$out"' "empreinte « - » mais empreinte publiée différente : refusé"
check 'grep -q "Absents.*pcsx2 (linux-x64)" <<<"$out" && ! grep -q "Absents.*xemu" <<<"$out"' "seuls les refus sont listés dans « Absents »"
# fonctions communes
. ci/empreintes.sh
check 'emp_verifier "$T/ffmpeg.tar.xz" "$(h "$T/ffmpeg.tar.xz")"' "emp_verifier : bonne empreinte acceptée"
check '! emp_verifier "$T/ffmpeg.tar.xz" "-" && ! emp_verifier "$T/ffmpeg.tar.xz" "$(h "$T/mpv.AppImage")"' "emp_verifier : « - » et mauvaise empreinte refusées"
check 'EMP_FICHIER="$T/emp.txt" emp_fige natif/mpv/linux-x64 && ! EMP_FICHIER="$T/emp.txt" emp_fige natif/xemu/linux-x64 && ! EMP_FICHIER="$T/emp.txt" emp_fige natif/rien/x' "emp_fige : vraie empreinte oui, « - » ou absente non"
# le fichier du dépôt : chaque ligne a 4 champs, des empreintes bien formées, des adresses https
check '! awk '"'"'!/^#/ && (NF!=4 || ($3!="-" && $3 !~ /^[0-9a-f]{64}$/) || ($4!="-" && $4 !~ /^https:\/\//))'"'"' ci/empreintes.txt | grep -q .' "ci/empreintes.txt bien formé"
check '[ "$(awk '"'"'!/^#/{print $1}'"'"' ci/empreintes.txt | sort | uniq -d)" = "" ]' "ci/empreintes.txt : aucune clé en double"
echo "Empreintes : $ok OK, $ko échec(s)"
[ $ko = 0 ]
