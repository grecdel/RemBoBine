#!/usr/bin/env python3
"""Embarque dans web/index.html les polices des époques du salon (aucun appel à internet).

    python3 outils/polices/embarquer_polices.py <dossier des .woff2> [web/index.html]

Les fichiers .woff2 (tels que publiés, non modifiés) sont mis en base64 entre
/*<POLICES-EPOQUES>*/ et /*</POLICES-EPOQUES>*/. La page n'en déclare (@font-face) que
celles de l'époque affichée (rbsEraCss). Seuls les poids utilisés sont embarqués.
Licences : ci/licences/Polices-epoques.txt ; liste : Paramètres → À propos → Crédits et licences.
"""
import base64, json, pathlib, re, sys

# famille CSS (préfixe « Rbb » : pas de confusion avec une police installée) → fichier, poids (plage si variable)
POLICES = [
    ("Rbb Cabin", "Cabin-400.woff2", "400 700"),
    ("Rbb Marcellus", "Marcellus-400.woff2", "400"),
    ("Rbb Arimo", "Arimo-400.woff2", "400 700"),
    ("Rbb Michroma", "Michroma-400.woff2", "400"),
    ("Rbb Varela Round", "VarelaRound-400.woff2", "400"),
    ("Rbb TeX Gyre Adventor", "TeXGyreAdventor-700.woff2", "700"),
    ("Rbb Hind", "Hind-400.woff2", "400"),
    ("Rbb Go Sans", "GoSans-700.woff2", "700"),
    ("Rbb Comic Neue", "ComicNeue-700.woff2", "700"),
    ("Rbb DejaVu Sans", "DejaVuSans-700.woff2", "700"),
    ("Rbb Montserrat", "Montserrat-400.woff2", "100 900"),
    ("Rbb Figtree", "Figtree-400.woff2", "300 900"),
    ("Rbb Lato", "Lato-700.woff2", "700"),
    ("Rbb Open Sans", "OpenSans-400.woff2", "300 800"),
    ("Rbb Inter", "Inter-400.woff2", "100 900"),
    ("Rbb Manrope", "Manrope-400.woff2", "200 800"),
    ("Rbb Orbitron", "Orbitron-400.woff2", "400 900"),
    ("Rbb Rajdhani", "Rajdhani-700.woff2", "700"),
    ("Rbb Stardos Stencil", "StardosStencil-700.woff2", "700"),
    ("Rbb Special Elite", "SpecialElite-400.woff2", "400"),
    ("Rbb IM Fell English", "IMFellEnglish-400.woff2", "400"),
    ("Rbb UnifrakturMaguntia", "UnifrakturMaguntia-400.woff2", "400"),
    ("Rbb Cormorant Garamond", "CormorantGaramond-400.woff2", "300 700"),
    # enseignes peintes / suspendues (années 1930-40, chaumière)
    ("Rbb Abril Fatface", "AbrilFatface-400.woff2", "400"),
    ("Rbb Old Standard TT", "OldStandardTT-700.woff2", "700"),
    ("Rbb Grenze Gotisch", "GrenzeGotisch-700.woff2", "100 900"),
]
# (DM Sans, police des textes de « Aujourd'hui (minimaliste) », est déjà embarquée pour l'interface.)

def main():
    src = pathlib.Path(sys.argv[1]); page = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "web/index.html")
    d = {fam: [w, base64.b64encode((src / f).read_bytes()).decode()] for fam, f, w in POLICES}
    bloc = "/*<POLICES-EPOQUES>*/\n  const ERA_FONT_DATA = " + json.dumps(d, separators=(",", ":")) + ";\n  /*</POLICES-EPOQUES>*/"
    s = page.read_text(encoding="utf-8")
    s2, n = re.subn(r"/\*<POLICES-EPOQUES>\*/.*?/\*</POLICES-EPOQUES>\*/", lambda m: bloc, s, flags=re.S)
    if n != 1: sys.exit("repères /*<POLICES-EPOQUES>*/ introuvables dans " + str(page))
    page.write_text(s2, encoding="utf-8")
    print(f"{len(d)} polices embarquées, {sum(len(v[1]) for v in d.values()) // 1024} Ko en base64")

if __name__ == "__main__":
    main()
