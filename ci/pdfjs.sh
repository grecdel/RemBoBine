#!/bin/bash
# Rassemble le lecteur de PDF (pdf.js de Mozilla) pour que les manuels des jeux s'ouvrent SANS internet.
#   ci/pdfjs.sh <dossier de sortie>      → <sortie>/pdfjs/ (pdf.min.js, pdf.worker.min.js, cmaps/, standard_fonts/)
# Le fichier vient du registre npm (paquet officiel « pdfjs-dist », licence Apache-2.0), version figée ci-dessous,
# et son empreinte est vérifiée. Version 3.11 « legacy » : la dernière en simple script (les versions 4 et plus
# ne sont que des « modules », qui ne se chargent pas depuis une page ouverte en fichier : appli PC et Android) ;
# « legacy » = compatible avec les WebView Android et navigateurs anciens.
# La faille CVE-2024-4367 de cette version est neutralisée par la page (isEvalSupported: false, toujours forcé).
set -euo pipefail
OUT="$(mkdir -p "$1" && cd "$1" && pwd)/pdfjs"
V=3.11.174
SHA512="TdTZPf1trZ8/UFu5Cx/GXB7GZM30LT+wWUNfsi6Bq8ePLnb+woNKtDymI2mxZYBpMbonNFqKmiz684DIfnd8dA=="
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm pack --silent "pdfjs-dist@$V" >/dev/null
got=$(openssl dgst -sha512 -binary "pdfjs-dist-$V.tgz" | base64 -w0)
[ "$got" = "$SHA512" ] || { echo "pdfjs-dist $V : empreinte inattendue ($got)"; exit 1; }
tar xzf "pdfjs-dist-$V.tgz"
rm -rf "$OUT"; mkdir -p "$OUT"
cp package/legacy/build/pdf.min.js package/legacy/build/pdf.worker.min.js "$OUT/"
# cmaps : textes en japonais, chinois, coréen ; polices standard : PDF qui n'embarquent pas leurs polices
cp -r package/cmaps "$OUT/cmaps"
cp -r package/standard_fonts "$OUT/standard_fonts"
cp package/LICENSE "$OUT/LICENCE-pdfjs.txt"
echo "$V" > "$OUT/VERSION"
du -sh "$OUT"
