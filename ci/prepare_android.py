#!/usr/bin/env python3
"""Prépare le projet Godot pour l'APK Android complet (logiciel + module).
À lancer depuis la racine du dépôt, après « godot --(modèle Android installé) »."""
import datetime, json, os, pathlib, re, shutil, subprocess, sys

root = pathlib.Path(__file__).resolve().parent.parent
g = root / "godot"
build = g / "android" / "build"
if not build.exists():
    sys.exit("android/build absent : lance d'abord godot --headless --(modèle Android installé)")

# 1) notre écran de démarrage (Java) et l'ajout au manifeste
shutil.copytree(root / "android" / "src", build / "src", dirs_exist_ok=True)
# Le manifeste : Godot (4.3 comme 4.7) RÉÉCRIT src/release/AndroidManifest.xml à chaque export (le nôtre, copié là, était
# écrasé : l'appli démarrait alors directement sur le module, avec son écran « cassette », bloquée à
# l'horizontale). On garde donc nos ajouts à part (rbb_manifest/) et Gradle les ajoute au manifeste de Godot
# juste avant la compilation (tâche preBuild, plus bas).
src_m = (root / "android" / "release" / "AndroidManifest.xml").read_text()
app_open = re.search(r"<application[^>]*>", src_m)
app_in = src_m[app_open.end():src_m.index("</application>")]
# l'élément GodotApp de notre fichier est appliqué autrement (processus à part, sorti du lanceur) : on le retire
app_in = re.sub(r"\s*<activity\s+android:name=\"com\.godot\.game\.GodotApp\".*?</activity>", "", app_in, count=1, flags=re.S)
perms = "\n".join(re.findall(r"<uses-(?:permission|feature)[^>]*/>", src_m[:app_open.start()]))
md = build / "rbb_manifest"
md.mkdir(parents=True, exist_ok=True)
(md / "application.xml").write_text(app_in)
(md / "permissions.xml").write_text(perms + "\n")
gradle = (build / "build.gradle").read_text()
gradle = gradle.replace("\n        release.manifest.srcFile 'src/release/AndroidManifest.xml'", "")
if "rbbManifeste" not in gradle:
    gradle += r"""
// Rembobine : nos ajouts au manifeste écrit par Godot (ci/prepare_android.py) : l'écran Rembobine devient
// l'écran de démarrage, le module (GodotApp) passe dans son propre processus et sort du lanceur.
def rbbManifeste = {
    ['release', 'debug'].each { v ->
        def f = file("src/${v}/AndroidManifest.xml")
        if (!f.exists()) return
        def t = f.getText('UTF-8')
        if (t.contains('fr.rembobine.app.RembobineActivity')) return
        def app = file('rbb_manifest/application.xml').getText('UTF-8')
        def perms = file('rbb_manifest/permissions.xml').getText('UTF-8').readLines().findAll { l ->
            def m = (l =~ /android:name="([^"]+)"/)
            l.trim() && !(m.find() && t.contains('"' + m.group(1) + '"'))
        }.join('\n')
        // GodotApp : plus de MAIN/LAUNCHER, processus à part, non exporté
        // (Godot 4.3 écrit « com.godot.game.GodotApp » ; depuis 4.4, « .GodotApp », et son entrée dans les applications
        // est un alias à part, « .GodotAppLauncher », retiré plus bas)
        def a = t.indexOf('android:name="com.godot.game.GodotApp"')
        if (a < 0) a = t.indexOf('android:name=".GodotApp"')
        if (a >= 0) {
            def s0 = t.lastIndexOf('<activity', a), e0 = t.indexOf('</activity>', a)
            def el = t.substring(s0, e0 + '</activity>'.length())
            def tete = el.substring(0, el.indexOf('>') + 1)
            tete = tete.replace('tools:replace="', 'tools:replace="android:exported,')
            tete = tete.replaceFirst(/>$/, ' android:process=":monde3d" android:exported="false">')
            if (tete.endsWith('/>')) tete = tete
            t = t.substring(0, s0) + tete + '\n        </activity>' + t.substring(e0 + '</activity>'.length())
        }
        // Godot 4.4+ : l'alias « .GodotAppLauncher » (MAIN/LAUNCHER) ouvrirait le module directement depuis les applications
        // (deuxième icône) : on le retire, y compris celui du manifeste principal du modèle (tools:node="remove")
        def al = t.indexOf('android:name=".GodotAppLauncher"')
        if (al >= 0) {
            def s1 = t.lastIndexOf('<activity-alias', al), e1 = t.indexOf('</activity-alias>', al)
            t = t.substring(0, s1) + '<activity-alias android:name=".GodotAppLauncher" android:targetActivity=".GodotApp" tools:node="remove" />' + t.substring(e1 + '</activity-alias>'.length())
        }
        t = t.replaceFirst('<application ', '<application android:usesCleartextTraffic="true" ')
        t = t.replace('</application>', app + '\n    </application>')
        if (perms) t = t.replaceFirst('<application ', perms + '\n    <application ')
        f.write(t, 'UTF-8')
        println "Rembobine : manifeste ${v} complété"
    }
}
preBuild.doFirst { rbbManifeste() }
"""
(build / "build.gradle").write_text(gradle)
# ressources du widget de l'écran d'accueil (mise en page, description) : noms préfixés « rbb_ »
shutil.copytree(root / "android" / "res", build / "res", dirs_exist_ok=True)
# le manifeste de la variante « release » est fusionné avec le principal

# 2) le logiciel Rembobine (page HTML) en ressource brute
raw = build / "res" / "raw"
raw.mkdir(parents=True, exist_ok=True)
shutil.copy(root / "web" / "index.html", raw / "rembobine.html")
# l'aide intégrée suit le LISEZ-MOI (lisible sans internet)
subprocess.run([sys.executable, str(root / "outils" / "aide" / "embarquer_aide.py"), str(raw / "rembobine.html")], check=True)
# le module facultatif (s'il est posé) complète la page
subprocess.run([sys.executable, str(root / "outils" / "ext.py"), str(raw / "rembobine.html")], check=True)
# la page commence par « <meta … » : Android devinait parfois « texte » d'après ce début et montrait son code.
# Un commentaire en tête suffit (« <! » = page web) sans changer la façon dont elle s'affiche.
_h = (raw / "rembobine.html").read_text(encoding="utf-8")
if not _h.lstrip().startswith("<!"):
    (raw / "rembobine.html").write_text("<!-- Rembobine -->\n" + _h, encoding="utf-8")
# numéro de fabrication et dépôt des versions, lus par l'appli pour ses mises à jour (MiseAJour.java) : le même
# « depot » que le build.json de l'application de bureau (dépôt PUBLIC des versions s'il est réglé, voir build.yml)
version = (root / "VERSION").read_text().strip()
bn = int(os.environ.get("BUILD_NUMBER", "0") or 0)
depot = os.environ.get("RBB_DEPOT") or os.environ.get("GITHUB_REPOSITORY") or "grecdel/Rembobine"
if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", depot):
    depot = "grecdel/Rembobine"
bdate = os.environ.get("BUILD_DATE") or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
(raw / "rbb_build.json").write_text(json.dumps({"version": version, "build": bn, "label": f"{version}+{bn}", "date": bdate, "depot": depot}, ensure_ascii=False))
# l'émulateur intégré (préparé par ci/emulateurs.sh build), servi par l'appli sans internet
ejs = root / "build" / "ejs"
if ejs.exists():
    # pas dans « assets » : Godot vide ce dossier au moment de l'export. Un dossier à part, ajouté aux assets de l'APK.
    shutil.copytree(ejs, build / "rbb_assets" / "ejs", dirs_exist_ok=True)
    gradle = (build / "build.gradle").read_text()
    if "rbb_assets" not in gradle:
        gradle += "\n// Rembobine : l'émulateur intégré (ci/emulateurs.sh), servi par l'appli sans internet\nandroid.sourceSets.main.assets.srcDirs += ['rbb_assets']\n"
        (build / "build.gradle").write_text(gradle)
else:
    print("Attention : build/ejs absent, l'émulateur passera par internet")
# le lecteur de manuels PDF (préparé par ci/pdfjs.sh build), servi lui aussi par l'appli sans internet
pdfjs = root / "build" / "pdfjs"
if pdfjs.exists():
    shutil.copytree(pdfjs, build / "rbb_assets" / "pdfjs", dirs_exist_ok=True)
    gradle = (build / "build.gradle").read_text()
    if "rbb_assets" not in gradle:
        gradle += "\n// Rembobine : fichiers servis par l'appli sans internet (émulateur, lecteur de PDF)\nandroid.sourceSets.main.assets.srcDirs += ['rbb_assets']\n"
        (build / "build.gradle").write_text(gradle)
else:
    print("Attention : build/pdfjs absent, les manuels PDF ne s'ouvriront pas sans internet")

# 3) réglages d'export : compilation Gradle, nom et version
# Numéro de version Android : il doit grandir à chaque fabrication pour qu'Android accepte la mise à jour faite depuis
# l'appli (MiseAJour.java). Calculé à partir des trois nombres de la version (et pas en collant les chiffres : 1.0.10 donnait
# 101000000, puis 1.1.0 seulement 11000000) : 1.0.0 + fabrication 62 → 1000000062, 1.1.0 → 1010000000… toujours plus grand
# que l'ancien calcul (10000062). Android accepte au plus 2 100 000 000 : jusqu’à la version 2.9.99 (au-delà, la fabrication s’arrête avec un message).
try:
    maj, mi, pa = (list(map(int, version.split("."))) + [0, 0, 0])[:3]
except ValueError:
    maj, mi, pa = 1, 0, 0
code = ((maj * 100 + min(mi, 99)) * 100 + min(pa, 99)) * 100000 + min(bn, 99999)
if code > 2100000000:
    raise SystemExit(f"Numéro de version Android trop grand ({code}) pour la version {version} : revoir le calcul dans ci/prepare_android.py")
p = g / "export_presets.cfg"
s = p.read_text()
part = s[s.index('[preset.2.options]'):]
end = part.find("\n[preset.", 1)
opts = part if end < 0 else part[:end]
new = opts
def setopt(txt, key, val):
    if re.search(rf"^{re.escape(key)}=.*$", txt, re.M):
        return re.sub(rf"^{re.escape(key)}=.*$", f"{key}={val}", txt, flags=re.M)
    return txt.rstrip("\n") + f"\n{key}={val}\n"
new = setopt(new, "gradle_build/use_gradle_build", "true")
new = setopt(new, "gradle_build/export_format", "0")
new = setopt(new, "package/unique_name", '"fr.rembobine.app"')
new = setopt(new, "package/name", '"Rembobine"')
new = setopt(new, "version/code", str(code))
new = setopt(new, "version/name", f'"{version}+{bn}"')
new = setopt(new, "permissions/internet", "true")
s = s.replace(opts, new)
p.write_text(s)
print("Projet Android prêt :", f"{version}+{bn}", code, "— mises à jour cherchées dans", depot)
