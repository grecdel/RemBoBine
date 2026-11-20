#!/usr/bin/env python3
"""Petit fichier « build.json » publié dans la Release à côté des archives : numéro de fabrication, date,
et pour chaque fichier son nom, sa taille et son empreinte (sha256). Les mises à jour automatiques de Rembobine
s'en servent pour savoir s'il y a du nouveau, et vérifier que le fichier téléchargé est intact.
   python3 ci/build_json.py <dossier des fichiers> <sortie build.json>
   (lit VERSION, BUILD_NUMBER, BUILD_DATE, GITHUB_SHA et RBB_DEPOT dans l'environnement)
   « depot » : où les applis cherchent leurs mises à jour (dépôt PUBLIC des versions s'il est réglé, sinon celui de
   la fabrication) ; c'est aussi ce qu'écrit ci/build_desktop.sh dans le build.json livré avec l'appli."""
import hashlib, json, os, re, sys, datetime

src, out = sys.argv[1], sys.argv[2]
version = open(os.path.join(os.path.dirname(__file__), "..", "VERSION")).read().strip()
build = int(os.environ.get("BUILD_NUMBER", "0") or 0)
date = os.environ.get("BUILD_DATE") or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
files = []
for name in sorted(os.listdir(src)):
    p = os.path.join(src, name)
    if not os.path.isfile(p) or not name.startswith("Rembobine"):
        continue
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    files.append({"name": name, "size": os.path.getsize(p), "sha256": h.hexdigest()})
depot = os.environ.get("RBB_DEPOT") or os.environ.get("GITHUB_REPOSITORY") or "grecdel/Rembobine"
if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", depot):
    depot = "grecdel/Rembobine"
info = {"version": version, "build": build, "label": f"{version}+{build}", "date": date, "commit": os.environ.get("GITHUB_SHA", ""), "depot": depot, "files": files}
with open(out, "w") as f:
    json.dump(info, f, indent=1, ensure_ascii=False)
print(json.dumps({k: v for k, v in info.items() if k != "files"}, ensure_ascii=False), f"{len(files)} fichiers")
