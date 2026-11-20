#!/usr/bin/env python3
"""Complète une copie de la page Rembobine avec le module facultatif (s'il est installé).

    python3 outils/ext.py PAGE.html              # complète la page sur place
    python3 outils/ext.py PAGE.html SORTIE.html  # écrit une copie complétée
    python3 outils/ext.py --verifier             # dit seulement si le module est là (code 0) ou non (code 1)

Le module (dossier web/ext/, absent du dépôt public) contient des morceaux de page à placer entre les repères
/*<EXT nom>*/ … /*</EXT nom>*/. Il ne change aucun texte de la page. Sans module : la page est recopiée
telle quelle, sans message. Appelé à la fabrication par ci/build_desktop.sh et ci/prepare_android.py, juste après
outils/aide/embarquer_aide.py ; le web/index.html du dépôt n'est jamais réécrit.
"""
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parents[1]
def lire(p):
    with open(p, encoding="utf-8", newline="") as f:
        return f.read()


REPERE = re.compile(r"/\*<EXT ([\w-]+)>\*/(.*?)/\*</EXT \1>\*/(\n?)", re.S)


def completer(html: str, ext: pathlib.Path) -> str:
    if not ext.is_dir():
        return html
    vus = set()

    def remplacer(m):
        nom = m.group(1)
        f = ext / (nom + ".js")
        if not f.is_file():
            raise SystemExit(f"module : morceau n° {nom[3:] if nom.startswith('ext') else '?'} manquant")
        vus.add(nom)
        t = lire(f)
        # un morceau fait de lignes entières remplace aussi le retour à la ligne qui suit le repère
        return t if t.endswith("\n") else t + m.group(3)

    html = REPERE.sub(remplacer, html)
    reste = sorted(p.stem for p in ext.glob("*.js") if p.stem not in vus)
    if reste:
        raise SystemExit(f"module : {len(reste)} morceau(x) sans repère dans la page")
    # les textes de la page ne sont jamais changés par le module (un ancien module qui en apporterait est refusé)
    if (ext / "textes.tsv").exists():
        raise SystemExit("module : textes.tsv n'est plus accepté (les textes de la page restent ceux du dépôt)")
    return html


def main(argv):
    ext = RACINE / "web" / "ext"
    if argv[:1] == ["--verifier"]:
        return 0 if ext.is_dir() else 1
    if not argv:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    entree = pathlib.Path(argv[0])
    sortie = pathlib.Path(argv[1]) if len(argv) > 1 else entree
    html = lire(entree)
    nouveau = completer(html, ext)
    if sortie != entree or nouveau != html:
        with open(sortie, "w", encoding="utf-8", newline="") as f:
            f.write(nouveau)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
