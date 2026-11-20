#!/usr/bin/env python3
"""Insère les décorations écrites à part (parts/web/*.js) dans le logiciel.
   build_web.py                         -> met à jour web/index.html du dépôt
   build_web.py --out X.html --only a.js,b.js  -> copie de test avec seulement ces fichiers (pour les agents)"""
import sys, glob, os, argparse
ap = argparse.ArgumentParser(); ap.add_argument("--out"); ap.add_argument("--only"); import os; _R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))); ap.add_argument("--src", default=os.path.join(_R, "web", "index.html")); ap.add_argument("--dir", default=os.path.join(_R, "outils", "fetes", "web"))
a = ap.parse_args()
s = open(a.src).read()
A, B = "/*<FETES-PARTS>*/", "/*</FETES-PARTS>*/"
i, j = s.index(A) + len(A), s.index(B)
files = sorted(glob.glob(os.path.join(a.dir, "*.js")), key=lambda f: (not os.path.basename(f).startswith("_"), f))
if a.only:
    keep = set(x.strip() for x in a.only.split(","))
    files = [f for f in files if os.path.basename(f) in keep or f in keep]
    files += [f for f in keep if os.path.isabs(f) and f not in files]
body = "\n".join(f"  /* --- {os.path.basename(f)} --- */\n" + open(f).read() for f in files)
out = s[:i] + "\n" + body + "\n  " + s[j:]
open(a.out or a.src, "w").write(out)
print("ok", a.out or a.src, [os.path.basename(f) for f in files])
