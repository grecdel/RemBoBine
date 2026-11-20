#!/usr/bin/env python3
"""Complète une copie de la page Rembobine avec le module facultatif (s'il est installé).

    python3 outils/ext.py PAGE.html              # complète la page sur place
    python3 outils/ext.py PAGE.html SORTIE.html  # écrit une copie complétée
    python3 outils/ext.py --verifier             # dit seulement si le module est là (code 0) ou non (code 1)

Le module (dossier web/ext/, absent du dépôt public) contient des morceaux de page à placer entre les repères
/*<EXT nom>*/ … /*</EXT nom>*/. Il ne change aucun texte de la page. Chaque morceau est réduit en passant :
commentaires et retraits enlevés, lettres des textes entre guillemets écrites en codes numériques (même résultat à
l'écran, mais rien de lisible dans le fichier livré). Sans module : la page est recopiée
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


# ---------- réduction d'un morceau (sans outil extérieur) ----------
# Lecture du code caractère par caractère : textes "…", '…', `…${…}…`, expressions /…/, commentaires. Les retours
# à la ligne sont gardés (le JavaScript s'en sert pour finir certaines instructions) : rien ne change de sens.
MOTS_AVANT_REGEX = {"return", "typeof", "case", "in", "of", "new", "delete", "void", "throw", "else", "do", "instanceof", "yield", "await"}


def _code(c: str) -> str:
    o = ord(c)
    if o > 0xFFFF:
        o -= 0x10000
        return "\\u%04x\\u%04x" % (0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF))
    return "\\u%04x" % o


def _texte(t: str, i: int, fin: str, gabarit: bool):
    """lit un texte à partir de i (après le guillemet) ; renvoie (texte réécrit, position après la fin)."""
    out = []
    while i < len(t):
        c = t[i]
        if c == "\\":
            m = re.match(r"\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])", t[i:])
            out.append(m.group(0)); i += len(m.group(0)); continue
        if c == fin:
            return "".join(out), i + 1
        if gabarit and t.startswith("${", i):
            return "".join(out), i
        if c == "\n" and not gabarit:
            raise ValueError("texte non fermé")
        out.append(_code(c) if (c.isalpha() or ord(c) > 127) else c)
        i += 1
    raise ValueError("texte non fermé")


def reduire_js(t: str) -> str:
    out, i, n, prec = [], 0, len(t), ""   # prec : dernier élément significatif (pour reconnaître /…/)
    pile = []   # profondeur des accolades dans chaque ${…} ouvert
    while i < n:
        c = t[i]
        if t.startswith("//", i):
            j = t.find("\n", i); i = n if j < 0 else j; continue
        if t.startswith("/*", i):
            j = t.find("*/", i + 2)
            if j < 0: raise ValueError("commentaire non fermé")
            out.append("\n" if "\n" in t[i:j] else " "); i = j + 2; continue
        if c in "\"'":
            s, i = _texte(t, i + 1, c, False); out.append(c + s + c); prec = "x"; continue
        if c == "`" or (c == "}" and pile and pile[-1] == 0):
            if c == "}": pile.pop()
            s, i = _texte(t, i + 1, "`", True); out.append(c + s)
            if t.startswith("${", i): out.append("${"); pile.append(0); i += 2; prec = "("
            else: out.append("`"); prec = "x"
            continue
        if c == "/":
            mot = re.search(r"[\w$]+$", prec or "")
            regex = not prec or (prec[-1] in "(,=:[!&|?{};+-*%<>~^\n" ) or (mot and mot.group(0) in MOTS_AVANT_REGEX)
            if regex:
                j, classe = i + 1, False
                while j < n:
                    d = t[j]
                    if d == "\\": j += 2; continue
                    if d == "\n": raise ValueError("expression /…/ non fermée")
                    if d == "[": classe = True
                    elif d == "]": classe = False
                    elif d == "/" and not classe: break
                    j += 1
                j += 1
                while j < n and (t[j].isalnum() or t[j] == "_"): j += 1
                out.append(t[i:j]); i = j; prec = "x"; continue
        if c == "{" and pile: pile[-1] += 1
        elif c == "}" and pile: pile[-1] -= 1
        if c == "\n":
            out.append("\n"); i += 1
            while i < n and t[i] in " \t": i += 1   # retrait du début de ligne
            continue
        out.append(c)
        if not c.isspace():
            m = re.match(r"[\w$]+", t[i:])
            if m: out.append(m.group(0)[1:]); i += len(m.group(0)); prec = m.group(0); continue
            prec = c
        i += 1
    if pile: raise ValueError("${ non fermé")
    r = re.sub(r"\n\s*\n+", "\n", "".join(out))
    return re.sub(r"^[ \t]+", "", r)


def reduire_css(t: str) -> str:
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return "\n".join(l.strip() for l in t.splitlines() if l.strip()) + ("\n" if t.endswith("\n") else "")


def _dans_style(html: str, pos: int) -> bool:
    # hors d'un <script> : feuille de style (le code de la page peut contenir « <style » dans ses textes, pas « </script> »)
    a, b = html.rfind("<script", 0, pos), html.rfind("</script>", 0, pos)
    return not a > b


def _liste_garde():
    """la liste du garde-fou, quand le module est posé (ci/module/) : aucun morceau réduit ne doit la contenir"""
    f = RACINE / "ci" / "module" / "mots_interdits.txt"
    if not f.is_file():
        return []
    out = []
    for l in lire(f).splitlines():
        l = l.strip()
        if l and not l.startswith("#"):
            try:
                out.append(re.compile(l.replace("[:alnum:]", "a-zA-Z0-9"), re.I))
            except re.error:
                pass
    return out


def completer(html: str, ext: pathlib.Path) -> str:
    if not ext.is_dir():
        return html
    vus = set()
    interdits = _liste_garde()

    def remplacer(m):
        nom = m.group(1)
        f = ext / (nom + ".js")
        if not f.is_file():
            raise SystemExit(f"module : morceau n° {nom[3:] if nom.startswith('ext') else '?'} manquant")
        vus.add(nom)
        t = lire(f)
        try:
            r = reduire_css(t) if _dans_style(html, m.start()) else reduire_js(t)
        except ValueError as e:
            raise SystemExit(f"module : morceau n° {nom[3:] if nom.startswith('ext') else '?'} illisible ({e})")
        if t.endswith("\n") and not r.endswith("\n"):
            r += "\n"
        for x in interdits:
            if x.search(r):
                raise SystemExit(f"module : morceau n° {nom[3:] if nom.startswith('ext') else '?'} : texte lisible refusé par le garde-fou")
        # un morceau fait de lignes entières remplace aussi le retour à la ligne qui suit le repère
        return r if r.endswith("\n") else r + m.group(3)

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
