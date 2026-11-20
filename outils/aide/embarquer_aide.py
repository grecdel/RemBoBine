#!/usr/bin/env python3
"""Recopie LISEZ-MOI.md dans la page Rembobine, pour l'aide intégrée lisible sans internet.

    python3 outils/aide/embarquer_aide.py                 # met à jour web/index.html
    python3 outils/aide/embarquer_aide.py chemin/page.html  # met à jour une copie (fabrication)

Le texte est placé entre /*<AIDE-LISEZMOI>*/ et /*</AIDE-LISEZMOI>*/ (bloc « Premier lancement, aide… »).
Appelé aussi par ci/build_desktop.sh et ci/prepare_android.py : l'aide suit toujours le LISEZ-MOI.
"""
import json
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parents[2]
DEBUT, FIN = "/*<AIDE-LISEZMOI>*/", "/*</AIDE-LISEZMOI>*/"


def embarquer(page: pathlib.Path, lisez_moi: pathlib.Path = RACINE / "LISEZ-MOI.md") -> bool:
    texte = lisez_moi.read_text(encoding="utf-8")
    # la partie « Pour le développeur » (dossiers du projet) ne concerne pas l'utilisateur : on ne la montre pas dans l'appli
    texte = re.split(r"\n## Pour le développeur", texte)[0].rstrip() + "\n"
    # une chaîne JavaScript sûre dans une balise <script> : pas de « </ » littéral
    js = json.dumps(texte, ensure_ascii=False).replace("</", "<\\/")
    html = page.read_text(encoding="utf-8")
    motif = re.compile(re.escape(DEBUT) + r".*?" + re.escape(FIN), re.S)
    if not motif.search(html):
        print(f"repère {DEBUT} introuvable dans {page}", file=sys.stderr)
        return False
    nouveau = motif.sub(lambda _m: DEBUT + js + FIN, html, count=1)
    if nouveau != html:
        page.write_text(nouveau, encoding="utf-8")
    return True


if __name__ == "__main__":
    cible = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else RACINE / "web" / "index.html"
    sys.exit(0 if embarquer(cible) else 1)
