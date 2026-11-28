// Rembobine — mises à jour.
// La Release GitHub de Rembobine (la plus récente, sinon « v1.0.0 ») est remplacée à chaque fabrication ; un petit
// fichier build.json y donne le numéro de fabrication, la date, et le nom, la taille et l'empreinte de chaque fichier.
// Le dépôt où chercher est écrit par la fabrication dans le build.json livré avec l'appli (champ « depot » : le dépôt
// de la fabrication, ou un dépôt PUBLIC de versions — un dépôt privé répond 404 sans identifiant, et l'appli ne
// contient jamais de jeton).
// Le serveur compare ce numéro au sien, télécharge la bonne archive (seulement depuis GitHub, en https), vérifie sa
// taille et son empreinte (sha256 de build.json), décompresse À CÔTÉ, vérifie la signature de Rembobine
// (maj-signature.js, si une clé publique est réglée), et seulement ensuite installe et redémarre :
//  - « versionne » (Rembobine OS : /opt/rembobine ; PC Linux installé par installer.sh : ~/.local/share/rembobine) :
//      <base>/versions/1.0.0+57/…    une version complète (rembobine, rembobine-bin, resources…)
//      <base>/actuelle → versions/1.0.0+57      (raccourci vers la version utilisée)
//      <base>/rembobine → actuelle/rembobine    (ce qu'on lance)
//    puis un « gardien » (maj-garde.js) relance Rembobine et vérifie que la nouvelle version répond sur /api/info
//    dans les 60 s ; sinon il remet l'ancienne ;
//  - « installation » (PC Linux, appli simplement décompressée) : la première mise à jour installe la nouvelle version
//    dans la disposition de installer.sh (~/.local/share/rembobine, raccourci du menu des applications) et relance
//    depuis là ; le dossier décompressé n'est pas touché (le gardien y revient si la nouvelle ne démarre pas) ;
//  - « windows » : la nouvelle version est décompressée à côté du dossier de Rembobine ; un petit script PowerShell
//    attend que Rembobine soit fermé, échange les dossiers, relance, et revient en arrière si elle ne démarre pas ;
//  - « manuel » (autres cas) : la mise à jour est seulement téléchargée dans Rembobine/MisesAJour, et on prévient.
// L'appli Android se met à jour elle-même (android/src/fr/rembobine/app/MiseAJour.java) : même build.json, fichier
// Rembobine.apk (voir archiveName).
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const SIG = require("./maj-signature");

const REPO = "grecdel/Rembobine", TAG = "v1.0.0";
const UA = "Rembobine (mises a jour)";
// d'où les versions peuvent venir : GitHub et ses serveurs de fichiers, en https seulement
const HOTES = ["api.github.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"];
const FERME = "Les mises à jour automatiques ne sont pas encore ouvertes : il faut rendre publiques les versions de Rembobine — voir l'aide (Mises à jour).";
const HORS_LIGNE = "Pas de connexion à internet (ou GitHub ne répond pas) : on réessaiera plus tard.";

// le fichier de la version publiée qui correspond à cet appareil (le même nom que dans build.json)
function archiveName(platform = process.platform, arch = process.arch) {
  if (platform === "android") return "Rembobine.apk";
  if (platform === "win32") return "Rembobine-Windows.zip";
  if (platform === "linux") return arch === "arm64" ? "Rembobine-RaspberryPi.tar.gz" : arch === "x64" ? "Rembobine-Linux-PC.tar.gz" : "";
  return "";
}
const depotOk = (d) => typeof d === "string" && /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(d) && !d.split("/").some((x) => x === "." || x === "..");
function readBuild(file) {
  const def = { version: "1.0.0", build: 0, label: "1.0.0", date: "", depot: REPO };
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...def, ...j, build: Number(j.build) || 0, label: String(j.label || `${j.version || def.version}+${j.build || 0}`), depot: depotOk(j.depot) ? j.depot : REPO };
  } catch (_) { return def; }
}
// la version tourne-t-elle depuis <base>/versions/<n> ?
function layout(appDir) {
  if (!appDir) return { versioned: false };
  const parent = path.dirname(appDir);
  if (path.basename(parent) !== "versions") return { versioned: false, appDir };
  const base = path.dirname(parent);
  return { versioned: true, base, versions: parent, appDir, current: path.basename(appDir), link: path.join(base, "actuelle") };
}
const safeName = (s) => String(s).replace(/[^\w.+-]/g, "_").slice(0, 60);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "")); } catch (_) { return d; } };
const writeJson = (f, v) => { try { fs.writeFileSync(f + ".tmp", JSON.stringify(v, null, 1)); fs.renameSync(f + ".tmp", f); } catch (_) {} };
function sha256File(f) { return new Promise((res, rej) => { const h = crypto.createHash("sha256"); fs.createReadStream(f).on("data", (d) => h.update(d)).on("end", () => res(h.digest("hex"))).on("error", rej); }); }
// raccourci remplacé d'un coup (jamais de moment sans version)
function relink(link, target) { const tmp = link + ".nouveau"; try { fs.unlinkSync(tmp); } catch (_) {} fs.symlinkSync(target, tmp); fs.renameSync(tmp, link); }
function run(cmd, args, opt = {}) {
  return new Promise((res) => { let err = ""; let p; try { p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true, ...opt }); } catch (e) { return res({ ok: false, err: e.message }); }
    p.stderr.on("data", (d) => { if (err.length < 4000) err += d; }); p.on("close", (c) => res({ ok: c === 0, err })); p.on("error", (e) => res({ ok: false, err: e.message })); });
}
// place libre sur le disque d'un dossier (octets ; Infinity si on ne sait pas)
function libre(dir) { try { const s = fs.statfsSync(dir); return Number(s.bavail) * Number(s.bsize); } catch (_) { return Infinity; } }
const fmtMo = (b) => `${Math.max(1, Math.round(b / 1048576))} Mo`;

// ---------- le script PowerShell de la mise à jour sur Windows ----------
// (Windows PowerShell 5.1, présent sur tout Windows 10 / 11 ; écrit en UTF-8 avec BOM, sinon les accents des chemins
//  — « Téléchargements » — seraient mal lus). Paramètres : pid de Rembobine, dossier de l'appli, dossier de la nouvelle
// version (déjà vérifiée), port du serveur, numéro attendu, fichiers journal et résultat (relu par maj.js au démarrage).
function scriptWindows(a) {
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  return "\uFEFF" + [
    "# Rembobine — mise à jour sur Windows (écrit par app/serveur/maj.js, lancé juste avant que Rembobine se ferme).",
    "# 1. attend que Rembobine soit fermé ; 2. met l'ancien dossier de côté et met la nouvelle version (déjà vérifiée) à sa place ;",
    "# 3. relance Rembobine ; 4. si la nouvelle version ne répond pas dans la minute : remet l'ancienne et la relance.",
    "$ErrorActionPreference = 'Continue'",
    `$pidRbb = ${Math.max(0, Number(a.pid) | 0)}`,
    `$app = ${q(a.app)}`,
    `$neuf = ${q(a.neuf)}`,
    `$port = ${Math.max(1, Number(a.port) | 0)}`,
    `$version = ${q(a.version)}`,
    `$ancienne = ${q(a.de)}`,
    `$journal = ${q(a.journal)}`,
    `$resultat = ${q(a.resultat)}`,
    `$exe = ${q(a.exe || "Rembobine.exe")}`,
    `$attente = ${Math.max(5, Number(a.attente) | 0 || 60)}`,
    ...(a.demarre ? [`$demarre = ${q(a.demarre)}`] : []),
    "$cote = $app + '.ancienne'",
    "$echec = $app + '.echec'",
    "function Dire($m) { try { Add-Content -LiteralPath $journal -Value ((Get-Date -Format 's') + ' ' + $m) -Encoding UTF8 } catch {} }",
    "function Resultat($ok, $err) {",
    "  try { $o = [ordered]@{ from = $ancienne; to = $version; ok = $ok; err = $err; t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }",
    "    ($o | ConvertTo-Json -Compress) | Set-Content -LiteralPath $resultat -Encoding UTF8 } catch { Dire ('résultat non écrit : ' + $_) }",
    "}",
    "# tous les programmes lancés depuis un dossier (Rembobine, ses modules, ses émulateurs) : arrêtés",
    "function Arreter($d) {",
    "  $pre = $d.TrimEnd('\\', '/') + [IO.Path]::DirectorySeparatorChar",
    "  Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($pre, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue",
    "}",
    "# déplacer un dossier (Windows peut le garder occupé un instant : antivirus, indexation) : 10 essais",
    "function Deplacer($de, $vers) {",
    "  for ($i = 0; $i -lt 10; $i++) { try { Move-Item -LiteralPath $de -Destination $vers -ErrorAction Stop; return $true } catch { Start-Sleep -Milliseconds 700 } }",
    "  Dire ('déplacement impossible : ' + $de + ' -> ' + $vers); return $false",
    "}",
    "function Lancer($d) { try { Start-Process -FilePath (Join-Path $d $exe) -WorkingDirectory $d | Out-Null; Dire 'Rembobine relancé' } catch { Dire ('relance impossible : ' + $_) } }",
    "function Repond() { try { $r = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $port + '/api/info') -TimeoutSec 3; return ($r.build -eq $version) } catch { return $false } }",
    "Dire ('mise à jour : ' + $ancienne + ' -> ' + $version)",
    // (le script tourne : Rembobine peut se fermer — maj.js attend ce fichier avant de quitter)
    ...(a.demarre ? ["try { Set-Content -LiteralPath $demarre -Value 'ok' -Encoding UTF8 } catch { Dire ('fichier « démarré » non écrit : ' + $_) }"] : []),
    "for ($i = 0; $i -lt 300; $i++) { if (-not (Get-Process -Id $pidRbb -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 100 }",
    "if (Get-Process -Id $pidRbb -ErrorAction SilentlyContinue) { Stop-Process -Id $pidRbb -Force -ErrorAction SilentlyContinue }",
    "Arreter $app",
    "Start-Sleep -Seconds 1",
    "if (Test-Path -LiteralPath $cote) { Remove-Item -LiteralPath $cote -Recurse -Force -ErrorAction SilentlyContinue }",
    "if (-not (Deplacer $app $cote)) {",
    "  Resultat $false 'le dossier de Rembobine est occupé : rien n''a changé'",
    "  Remove-Item -LiteralPath $neuf -Recurse -Force -ErrorAction SilentlyContinue; Lancer $app; exit 1",
    "}",
    "if (-not (Deplacer $neuf $app)) {",
    "  if (-not (Test-Path -LiteralPath $app)) { Deplacer $cote $app | Out-Null }",
    "  Resultat $false 'la nouvelle version n''a pas pu prendre la place de l''ancienne : rien n''a changé'",
    "  Lancer $app; exit 1",
    "}",
    "Lancer $app",
    "$ok = $false",
    "for ($i = 0; $i -lt $attente; $i++) { Start-Sleep -Seconds 1; if (Repond) { $ok = $true; break } }",
    "if ($ok) {",
    "  Dire ('la version ' + $version + ' répond : mise à jour réussie')",
    "  Remove-Item -LiteralPath $cote -Recurse -Force -ErrorAction SilentlyContinue",
    "  Resultat $true ''; exit 0",
    "}",
    "Dire ('la version ' + $version + ' ne répond pas : retour à ' + $ancienne)",
    "Arreter $app",
    "Start-Sleep -Seconds 2",
    "if (Test-Path -LiteralPath $echec) { Remove-Item -LiteralPath $echec -Recurse -Force -ErrorAction SilentlyContinue }",
    "if (Deplacer $app $echec) { if (Deplacer $cote $app) { Remove-Item -LiteralPath $echec -Recurse -Force -ErrorAction SilentlyContinue } else { Deplacer $echec $app | Out-Null } }",
    "Resultat $false 'ne démarre pas : ancienne version remise'",
    "Lancer $app",
    "exit 1",
  ].join("\r\n") + "\r\n";
}

function createMaj(o) {
  const F = o.fetch || fetch, emit = o.emit || (() => {}), log = o.log || (() => {});
  const api = String(o.api || "https://api.github.com").replace(/\/+$/, "");
  // essais sans internet (faux GitHub, REMBOBINE_MAJ_API) : cette adresse-là est permise elle aussi
  const apiOrigin = o.api ? (() => { try { return new URL(api).origin; } catch (_) { return ""; } })() : "";
  const plat = o.platform || process.platform, arch = o.arch || process.arch;
  const build = o.build || readBuild(""), L = layout(o.appDir);
  const depot = depotOk(o.depot) ? o.depot : depotOk(build.depot) ? build.depot : REPO;
  const home = o.home || os.homedir();
  const canInstall = plat === "linux" && L.versioned;
  // PC Linux, appli simplement décompressée : la disposition de installer.sh (mêmes chemins que lui)
  const IB = path.join(home, ".local", "share", "rembobine");
  const stateFile = L.versioned ? path.join(L.base, "maj-etat.json") : path.join(o.data, "maj-etat.json");
  const essaiFile = L.versioned ? path.join(L.base, "maj-essai.json") : path.join(o.data, "maj-essai.json");
  const winResult = path.join(o.data, "maj", "maj-windows-resultat.json");
  const st = () => ({ history: [], bad: [], ...readJson(stateFile, {}) });
  const save = (s) => writeJson(stateFile, s);
  // versions à ne plus proposer : celles qui n'ont pas démarré ici (et, appli décompressée : dans ~/.local/share/rembobine)
  const badList = () => { const b = [...(st().bad || [])]; if (!L.versioned && plat === "linux") for (const x of (readJson(path.join(IB, "maj-etat.json"), {}).bad || [])) if (!b.includes(x)) b.push(x); return b; };
  const cfg = () => { const c = o.cfg(); return { auto: c.update && typeof c.update.auto === "boolean" ? c.update.auto : !!o.isOs }; };
  let busy = "", last = readJson(path.join(o.data, "maj-derniere.json"), null);
  if (last && last.depot && last.depot !== depot) last = null;   // (dépôt changé : l'ancienne réponse ne compte plus)
  // La réponse gardée (maj-derniere.json) a pu être écrite par la version d'AVANT la mise à jour : « 1.0.0+62 disponible ».
  // Relue par la 62 elle-même, elle ne doit rien proposer : « disponible » est toujours recalculé pour CETTE version
  // (au démarrage, dans status() et pour la vérification discrète), avec les versions à ignorer et, pour une appli
  // décompressée, la version déjà installée dans ~/.local/share/rembobine.
  function juste(l) {
    if (!l || typeof l !== "object" || !l.latest) return l;
    const r = { ...l }, neuve = Number(r.build) > build.build;
    r.available = !!(r.asset && r.asset.sha256) && neuve && !badList().includes(r.latest);
    if (!neuve) delete r.err;   // (une erreur qui parlait de cette version, plus récente que l'ancienne)
    delete r.installed;
    const inst = r.available ? installee() : null;
    if (inst && inst.build >= Number(r.build)) { r.available = false; r.installed = inst.label; }
    return r;
  }

  // ---------- comment cet appareil se met à jour ----------
  const ecrivable = (d) => { try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return true; } catch (_) { return false; } };
  function mode() {
    if (plat === "linux" && L.versioned) return "versionne";
    const realApp = !!o.appDir && fs.existsSync(path.join(o.appDir, "resources", "app", "main.js"));
    if (plat === "linux" && (arch === "x64" || arch === "arm64") && realApp && fs.existsSync(path.join(o.appDir, "rembobine-bin")) && ecrivable(path.join(home, ".local", "share"))) return "installation";
    if (plat === "win32" && realApp) {
      const par = path.dirname(o.appDir), t = path.join(par, `.rembobine-essai-${process.pid}`);
      try { fs.mkdirSync(t); fs.rmdirSync(t); return "windows"; } catch (_) { return "manuel"; }   // (dossier protégé, Program Files…)
    }
    return "manuel";
  }
  let M = mode();
  // PC Linux, appli décompressée relancée après sa première mise à jour (raccourci perso, terminal) : la version installée
  // dans ~/.local/share/rembobine est peut-être déjà celle que GitHub propose (ou plus récente) ; on ne la retélécharge pas
  function installee() {
    if (M !== "installation") return null;
    let lab = ""; try { lab = path.basename(fs.readlinkSync(path.join(IB, "actuelle"))); } catch (_) { return null; }
    const d = path.join(IB, "versions", lab), b = readBuild(path.join(d, "resources", "app", "build.json"));
    return lab && b.build && fs.existsSync(path.join(d, "rembobine-bin")) ? { label: safeName(b.label), build: b.build } : null;
  }
  last = juste(last);
  const dlDir = () => M === "manuel" ? path.join((o.roots && o.roots[0]) || o.data, "MisesAJour") : path.join(o.data, "maj");

  // ---------- progression (montrée par la page : pastille et panneau) ----------
  let P = { etape: "", pct: 0, version: "", t: 0, err: "" }, lastEmit = 0;
  function etape(e, pct = 0, extra = {}) {
    const now = Date.now(), same = P.etape === e;
    P = { ...P, etape: e, pct: Math.max(0, Math.min(100, Math.round(pct))), t: now, err: e === "echec" ? (extra.err || P.err) : "", ...extra };
    if (same && e === "telechargement" && now - lastEmit < 400 && P.pct < 100) return;
    lastEmit = now; emit({ type: "maj", ...P });
  }

  // ---------- adresses permises (GitHub, en https ; serveurs de fichiers seulement après une redirection de GitHub) ----------
  function permis(u, redirige) {
    let x; try { x = new URL(u); } catch (_) { return false; }
    if (apiOrigin && x.origin === apiOrigin) return true;
    if (x.protocol !== "https:" || x.username || x.password || (x.port && x.port !== "443")) return false;
    const h = x.hostname.toLowerCase(), p = x.pathname.toLowerCase(), d = depot.toLowerCase();
    if (h === "api.github.com") return p.startsWith(`/repos/${d}/releases`);
    if (h === "github.com") return p.startsWith(`/${d}/releases/download/`);
    return redirige && HOTES.includes(h);
  }
  async function fetchSur(url, opts = {}) {
    let u = String(url || "");
    for (let hop = 0; hop < 6; hop++) {
      if (!permis(u, hop > 0)) throw Object.assign(new Error("Adresse de téléchargement refusée (ce n'est pas la page des versions de Rembobine) : rien n'est installé."), { refus: true });
      const r = await F(u, { ...opts, redirect: "manual" });
      const loc = r.status >= 300 && r.status < 400 && r.headers && r.headers.get("location");
      if (loc) { try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (_) {} u = new URL(loc, u).href; continue; }
      return r;
    }
    throw new Error("Trop de redirections : rien n'est installé.");
  }
  async function getJson(url, fichier) {
    let r;
    try { r = await fetchSur(url, { headers: { "User-Agent": UA, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30000) }); }
    catch (e) { if (e.refus) throw e; throw Object.assign(new Error(HORS_LIGNE), { net: true }); }
    if (!r.ok) {
      // (404 sur la liste des versions : dépôt privé ou rien de publié ; sur un fichier : la version est en train d'être remplacée)
      const ferme = r.status === 404 && !fichier;
      const e = new Error(ferme ? FERME : r.status === 404 ? "La version publiée est en train d'être remplacée : on réessaiera plus tard." : r.status === 403 || r.status === 429 ? "GitHub limite les vérifications pour l'instant : on réessaiera plus tard." : `GitHub répond ${r.status} : on réessaiera plus tard.`);
      e.status = r.status; if (ferme) e.closed = true; else e.net = true; throw e;
    }
    return r.json();
  }
  // la version publiée : la plus récente du dépôt, sinon l'étiquette v1.0.0 (404 aux deux : dépôt privé ou rien de publié)
  async function release() {
    let rel = null;
    try { rel = await getJson(`${api}/repos/${depot}/releases/latest`); } catch (e) { if (e.status !== 404) throw e; }
    if (rel && Array.isArray(rel.assets) && rel.assets.some((a) => a && a.name === "build.json")) return rel;
    try { return await getJson(`${api}/repos/${depot}/releases/tags/${TAG}`); } catch (e) { if (e.status === 404 && rel) return rel; throw e; }
  }

  // ---------- vérifier ----------
  // auto : vérification discrète (au démarrage, toutes les 6 h) — une réponse de moins de 25 min suffit
  async function check(opts = {}) {
    if (opts.auto && last && last.t && Date.now() - last.t < 25 * 60000 && !last.err && !last.errNet) return (last = juste(last));
    const t = Date.now();
    try {
      const rel = await release(), assets = Array.isArray(rel.assets) ? rel.assets : [];
      // (build.json absent de la liste : la version est en train d'être remplacée ou recopiée — build.yml le retire
      //  d'abord et le remet en dernier, dans le dépôt principal comme dans le dépôt public — : passager, on garde la
      //  réponse précédente et on réessaiera)
      const bj = assets.find((a) => a && a.name === "build.json"); if (!bj) throw Object.assign(new Error("La version publiée est en train d'être remplacée : on réessaiera plus tard."), { net: true });
      const info = await getJson(bj.browser_download_url, true), name = archiveName(plat, arch);
      const a = assets.find((x) => x && x.name === name), f = (Array.isArray(info.files) ? info.files : []).find((x) => x && x.name === name) || {};
      const bad = badList(), label = String(info.label || `${info.version || "1.0.0"}+${info.build || 0}`).slice(0, 40);
      last = { t, depot, latest: label, build: Number(info.build) || 0, date: String(info.date || "").slice(0, 40), notes: String(rel.body || "").slice(0, 4000),
        asset: a && typeof a.browser_download_url === "string" ? { name, size: Number(a.size) || 0, url: a.browser_download_url, sha256: /^[0-9a-f]{64}$/.test(String(f.sha256 || "")) ? f.sha256 : "", fsize: Number(f.size) || 0 } : null };
      last.available = !!(last.asset && last.asset.sha256) && last.build > build.build && !bad.includes(label);
      last = juste(last);
      if (last.build > build.build && !last.installed) {
        if (bad.includes(label)) last.err = `La version ${label} n'a pas démarré ici : elle est ignorée jusqu'à la suivante.`;
        else if (!last.asset) last.err = `La version ${label} n'a pas encore de fichier pour cet appareil.`;
        else if (!last.asset.sha256) last.err = `La version ${label} n'a pas d'empreinte (sha256) pour ce fichier : par sécurité, elle n'est pas proposée.`;
      }
    } catch (e) {
      // pas de réseau : on garde ce qu'on savait déjà (la pastille reste) ; dépôt fermé : on le dit, calmement
      if (e.net && last && last.latest) last = { ...last, errNet: e.message, tErr: t };
      else last = { t, depot, err: e.message, closed: !!e.closed, available: false };
    }
    writeJson(path.join(o.data, "maj-derniere.json"), last);
    return last;
  }

  // ---------- télécharger (fichier écrit à côté puis renommé ; taille et empreinte vérifiées AVANT tout le reste) ----------
  async function download(info) {
    const A = info.asset; if (!A) throw new Error("Pas de fichier pour cet appareil dans la version publiée.");
    if (!/^[0-9a-f]{64}$/.test(A.sha256 || "")) throw new Error("La version publiée n'a pas d'empreinte (sha256) pour ce fichier : par sécurité, rien n'est installé.");
    const want = A.fsize || A.size, dir = dlDir(), dest = path.join(dir, A.name); fs.mkdirSync(dir, { recursive: true });
    if (want && libre(dir) < want * 1.1) throw new Error(`Pas assez de place sur le disque pour télécharger la mise à jour (il faut ${fmtMo(want)}).`);
    const good = async (f) => { try { const s = fs.statSync(f); if (want && s.size !== want) return false; return (await sha256File(f)) === A.sha256; } catch (_) { return false; } };
    etape("telechargement", 0, { version: info.latest });
    if (fs.existsSync(dest + ".version") && fs.readFileSync(dest + ".version", "utf8") === info.latest && await good(dest)) { etape("telechargement", 100); return dest; }
    let r;
    try { r = await fetchSur(A.url, { headers: { "User-Agent": UA } }); } catch (e) { if (e.refus) throw e; throw new Error(HORS_LIGNE); }
    if (!r.ok || !r.body) throw new Error(`Téléchargement refusé (${r.status}) : on réessaiera plus tard.`);
    const tmp = dest + ".part", out = fs.createWriteStream(tmp), reader = r.body.getReader(); let got = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        got += value.length;
        if (want && got > want) throw new Error("Le fichier téléchargé est abîmé (plus gros que prévu) : rien n'est installé, on réessaiera.");
        if (!out.write(Buffer.from(value))) await new Promise((res) => out.once("drain", res));
        if (want) etape("telechargement", got / want * 100);
      }
    } catch (e) { out.destroy(); try { fs.unlinkSync(tmp); } catch (_) {} try { reader.cancel(); } catch (_) {} throw /abîmé/.test(e.message) ? e : new Error("Le téléchargement s'est arrêté (connexion coupée ?) : rien n'est installé, on réessaiera."); }
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
    etape("verification", 0);
    if (!(await good(tmp))) { try { fs.unlinkSync(tmp); } catch (_) {} throw new Error("Le fichier téléchargé est abîmé (taille ou empreinte incorrecte) : rien n'est installé, on réessaiera."); }
    fs.renameSync(tmp, dest); fs.writeFileSync(dest + ".version", info.latest);
    log("info", `mise à jour ${info.latest} téléchargée (${Math.round(got / 1048576)} Mo)`);
    return dest;
  }

  // ---------- décompresser à côté et vérifier (Linux : .tar.gz) ----------
  const pubKey = () => (o.publicKey !== undefined ? o.publicKey : require("./maj-cle").PUBLIC_KEY);
  const signee = () => !!pubKey();   // les mises à jour sont-elles vérifiées par signature ?
  // contrôles communs à une version décompressée (dossier « dir ») : signature, numéro
  async function controler(dir, why, exe) {
    if (!fs.existsSync(path.join(dir, exe)) || !fs.existsSync(path.join(dir, "resources", "app", "main.js"))) throw new Error(`Ce fichier n'est pas une version de Rembobine pour cette machine (il faut ${archiveName(plat, arch)}).`);
    // signature de Rembobine (maj-signature.js) : vérifiée AVANT de toucher à la version actuelle
    const pub = pubKey(), sv = await SIG.verifyDir(dir, pub);
    if (!sv.ok) throw new Error(sv.err);
    if (sv.unsigned) log("warn", "mise à jour sans vérification de signature (pas encore de clé publique dans maj-cle.js)");
    const nb = readBuild(path.join(dir, "resources", "app", "build.json")), label = safeName(nb.label);
    // par internet : jamais une version plus ancienne (une vieille version signée ne peut pas être reservie)
    if (why === "internet" && (pub || nb.build) && nb.build <= build.build) throw new Error(`La version proposée (${nb.label}) n'est pas plus récente que celle-ci.`);
    if (label === build.label || label === L.current) throw new Error(`La version ${label} est déjà celle utilisée.`);
    return { label, build: nb.build };
  }
  async function unpack(archive, versionsDir, why) {
    fs.mkdirSync(versionsDir, { recursive: true });
    const tmp = path.join(versionsDir, `.nouvelle-${Date.now()}`); fs.mkdirSync(tmp, { recursive: true });
    const clean = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} };
    try {
      let sz = 0; try { sz = fs.statSync(archive).size; } catch (_) {}
      if (sz && libre(versionsDir) < sz * 3) throw new Error(`Pas assez de place sur le disque pour installer la mise à jour (il faut environ ${fmtMo(sz * 3)}).`);
      const r = await run("tar", ["-xzf", archive, "-C", tmp, "--strip-components=1", "--no-same-owner"]);
      if (!r.ok) throw new Error("Archive illisible : " + r.err.trim().slice(0, 200));
      const nv = await controler(tmp, why, "rembobine-bin");
      const dest = path.join(versionsDir, nv.label);
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(tmp, dest);
      for (const f of ["rembobine", "rembobine-bin", "chrome-sandbox"]) { try { fs.chmodSync(path.join(dest, f), 0o755); } catch (_) {} }
      try { for (const g of fs.readdirSync(path.join(dest, "resources", "module"))) fs.chmodSync(path.join(dest, "resources", "module", g), 0o755); } catch (_) {}
      return { ...nv, dir: dest };
    } catch (e) { clean(); throw e; }
  }
  // le gardien survit à l'arrêt de cette version (processus détaché, lancé par le Node d'Electron)
  // Rembobine OS (télé, plein écran) : sa session relance déjà Rembobine toute seule ; ailleurs, le gardien le relance
  function garde(base, a) {
    const args = { base, port: o.port || 8080, pid: o.pid || process.pid, relaunch: !(o.isOs && o.kiosk), args: o.args || [], timeout: o.gardeTimeout || 60000, ...a };
    const logf = fs.openSync(path.join(base, "maj-garde.log"), "a");
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
    const p = spawn(o.node || process.execPath, [path.join(__dirname, "maj-garde.js"), JSON.stringify(args)], { detached: true, stdio: ["ignore", logf, logf], env });
    p.unref(); fs.closeSync(logf);
  }
  const fermer = () => setTimeout(() => { if (o.quit) o.quit(); }, o.quitDelay ?? 1500);

  // versionne : à côté de l'ancienne, bascule du raccourci « actuelle », gardien
  async function installVersionne(archive, why) {
    etape("installation", 10);
    const nv = await unpack(archive, L.versions, why), from = L.current;
    etape("installation", 90);
    writeJson(essaiFile, { from, to: nv.label, t: Date.now(), why });
    relink(L.link, path.join("versions", nv.label));
    try { fs.lstatSync(path.join(L.base, "rembobine")); } catch (_) { try { fs.symlinkSync(path.join("actuelle", "rembobine"), path.join(L.base, "rembobine")); } catch (_) {} }
    lanceur();
    try { garde(L.base, { from, to: nv.label }); }
    catch (e) {   // (sans gardien, pas de bascule : rien ne change)
      try { relink(L.link, path.join("versions", from)); } catch (_) {} try { fs.unlinkSync(essaiFile); } catch (_) {}
      throw new Error(`L'outil qui surveille le redémarrage n'a pas pu démarrer : rien n'a changé (${e.message}).`);
    }
    return nv;
  }
  // installation : première mise à jour d'une appli simplement décompressée (PC Linux) → disposition de installer.sh
  // Le raccourci du menu des applications, son icône et la commande « rembobine » (les mêmes que installer.sh). Tout
  // passe par <base>/actuelle : une fois en place, ils suivent tout seuls la version utilisée. « assurer » : ne refait que
  // ce qui manque ou pointe ailleurs, sans toucher au reste du raccourci (types de fichiers, réglages de l'utilisateur).
  function raccourcis(base, assurer) {
    let change = false;
    const r = (link, target) => {
      if (assurer) { try { if (fs.readlinkSync(link) === target) return; } catch (_) {} try { if (!fs.lstatSync(link).isSymbolicLink()) return; } catch (_) {} }
      try { fs.unlinkSync(link); } catch (_) {} fs.symlinkSync(target, link); change = true; };
    try { r(path.join(base, "rembobine"), path.join("actuelle", "rembobine")); } catch (e) { if (!assurer) throw e; }
    try { r(path.join(base, "rembobine.png"), path.join("actuelle", "rembobine.png")); } catch (e) { if (!assurer) throw e; }
    const bin = path.join(home, ".local", "bin"), apps = path.join(home, ".local", "share", "applications");
    try { fs.mkdirSync(bin, { recursive: true }); r(path.join(bin, "rembobine"), path.join(base, "rembobine")); } catch (_) {}
    try {
      fs.mkdirSync(apps, { recursive: true });
      const f = path.join(apps, "rembobine.desktop"), exec = `Exec=${path.join(base, "rembobine")} %U`, icon = `Icon=${path.join(base, "rembobine.png")}`;
      let t = null; if (assurer) { try { t = fs.readFileSync(f, "utf8"); } catch (_) {} }
      if (t !== null && /^\[Desktop Entry\]/m.test(t) && /^Exec=/m.test(t)) {
        let n = t.replace(/^Exec=.*$/m, exec); n = /^Icon=/m.test(n) ? n.replace(/^Icon=.*$/m, icon) : n.replace(/\n*$/, "\n") + icon + "\n";
        if (n !== t) { fs.writeFileSync(f, n); change = true; }
      } else {
        fs.writeFileSync(f, ["[Desktop Entry]", "Type=Application", "Name=Rembobine", "Comment=Ta médiathèque : films, séries, jeux et musique",
          exec, icon, "Terminal=false", "Categories=AudioVideo;Video;Game;",
          // « Ouvrir avec Rembobine » (sans devenir le lecteur par défaut), comme installer.sh
          ...(() => { try { return [require("../seul").ligneMime()]; } catch (_) { return []; } })(), ""].join("\n"));
        change = true;
      }
      // le menu relit ses raccourcis (si l'outil est là)
      if (change) { try { (o.spawn || spawn)("update-desktop-database", [apps], { stdio: "ignore" }).on("error", () => {}); } catch (_) {} }
    } catch (_) {}
    return change;
  }
  // PC Linux installé dans ~/.local/share/rembobine (installer.sh, ou une mise à jour) : au démarrage de chaque version et
  // après chaque mise à jour, le raccourci du menu et l'icône existent et mènent à la version utilisée. Jamais ailleurs
  // (Rembobine OS dans /opt, plein écran sans bureau, Windows) ni pour une appli simplement décompressée.
  function lanceur() {
    if (plat !== "linux" || !L.versioned || L.base !== IB || o.isOs || o.kiosk) return false;
    try { return raccourcis(L.base, true); } catch (_) { return false; }
  }
  async function installInstallation(archive, why) {
    etape("installation", 5);
    // une installation d'avant le rangement par versions (sans dossier versions/) : mise de côté, jamais effacée
    if (fs.existsSync(IB) && !fs.existsSync(path.join(IB, "versions"))) fs.renameSync(IB, `${IB}.ancienne-${Date.now()}`);
    const versions = path.join(IB, "versions");
    const nv = await unpack(archive, versions, why);
    etape("installation", 90);
    let from = ""; try { from = path.basename(fs.readlinkSync(path.join(IB, "actuelle"))); } catch (_) {}
    if (from && !fs.existsSync(path.join(versions, from))) from = "";
    writeJson(path.join(IB, "maj-essai.json"), { from, to: nv.label, t: Date.now(), why, note: "installation" });
    relink(path.join(IB, "actuelle"), path.join("versions", nv.label));
    raccourcis(IB);
    // si la nouvelle ne démarre pas : retour à l'appli décompressée, là où elle était (rien n'y a été touché) ; sans
    // version précédente dans ~/.local/share/rembobine, ce que cette installation a créé est enlevé
    const fallback = fs.existsSync(path.join(o.appDir, "rembobine")) ? path.join(o.appDir, "rembobine") : path.join(o.appDir, "rembobine-bin");
    const nettoyer = from ? [] : [path.join(IB, "actuelle"), path.join(IB, "rembobine"), path.join(IB, "rembobine.png"), path.join(home, ".local", "bin", "rembobine"),
      path.join(home, ".local", "share", "applications", "rembobine.desktop"), path.join(versions, nv.label)];
    try { garde(IB, { from, to: nv.label, fallback, note: "installation", nettoyer }); }
    catch (e) {   // (sans gardien, on n'installe pas : tout est remis comme avant)
      if (from) { try { relink(path.join(IB, "actuelle"), path.join("versions", from)); } catch (_) {} }
      else for (const f of nettoyer) { try { fs.rmSync(f, { recursive: true, force: true }); } catch (_) {} }
      try { fs.unlinkSync(path.join(IB, "maj-essai.json")); } catch (_) {}
      throw new Error(`L'outil qui surveille le redémarrage n'a pas pu démarrer : rien n'a changé (${e.message}).`);
    }
    return nv;
  }
  // windows : décompressée à côté du dossier de Rembobine, échange des dossiers par un script PowerShell
  async function installWindows(archive, why) {
    etape("installation", 5);
    const app = o.appDir, par = path.dirname(app), tmp = path.join(par, `.rembobine-nouvelle-${Date.now()}`);
    let sz = 0; try { sz = fs.statSync(archive).size; } catch (_) {}
    if (sz && libre(par) < sz * 3) throw new Error(`Pas assez de place sur le disque pour installer la mise à jour (il faut environ ${fmtMo(sz * 3)}).`);
    fs.mkdirSync(tmp, { recursive: true });
    const clean = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} };
    try {
      // tar.exe de Windows (10 et 11) lit les .zip ; on prend celui du système, pas un autre « tar » trouvé dans le PATH
      const r = process.platform === "win32" ? await run(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"), ["-xf", archive, "-C", tmp])
        : await run("unzip", ["-q", "-o", archive, "-d", tmp]);
      if (!r.ok) throw new Error("Archive illisible : " + r.err.trim().slice(0, 200));
      // l'archive contient un dossier « Rembobine-Windows »
      let neuf = path.join(tmp, "Rembobine-Windows");
      if (!fs.existsSync(path.join(neuf, "Rembobine.exe"))) { const d = fs.readdirSync(tmp).map((n) => path.join(tmp, n)).find((d) => fs.existsSync(path.join(d, "Rembobine.exe"))); neuf = d || tmp; }
      etape("installation", 60);
      const nv = await controler(neuf, why, "Rembobine.exe");
      fs.mkdirSync(path.dirname(winResult), { recursive: true });
      try { fs.unlinkSync(winResult); } catch (_) {}
      const script = path.join(path.dirname(winResult), "maj-windows.ps1"), demarre = path.join(path.dirname(winResult), "maj-windows-demarre.txt");
      try { fs.unlinkSync(demarre); } catch (_) {}
      fs.writeFileSync(script, scriptWindows({ pid: o.pid || process.pid, app, neuf, port: o.port || 8080, version: nv.label, de: build.label, journal: path.join(path.dirname(winResult), "maj-windows.log"), resultat: winResult, demarre, attente: Math.round((o.gardeTimeout || 60000) / 1000) }));
      writeJson(path.join(o.data, "maj-essai.json"), { from: build.label, to: nv.label, t: Date.now(), why, tmp });
      etape("installation", 95);
      // le script part maintenant ; s'il ne peut pas démarrer (PowerShell bloqué) ou s'arrête aussitôt (stratégie
      // « AllSigned » imposée, antivirus), on ne ferme pas Rembobine. Un script sain écrit d'abord « démarré » puis attend
      // que Rembobine se ferme : on attend ce fichier (15 s au plus) ; un PowerShell déjà arrêté sans l'écrire = échec.
      const lance = o.spawnWin || ((sc) => new Promise((res) => {
        const ps = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        let p, fin = false; const t0 = Date.now(), done = (e) => { if (fin) return; fin = true; try { p.unref(); } catch (_) {} res(e); };
        try { p = spawn(ps, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", sc], { detached: true, stdio: "ignore", windowsHide: true, cwd: path.dirname(sc) }); } catch (e) { return res(e.message); }
        p.on("error", (e) => done(e.message));
        p.on("exit", (c) => { if (!fs.existsSync(demarre)) done(`PowerShell s'est arrêté tout de suite (code ${c}).`); });
        const guette = () => { if (fin) return; if (fs.existsSync(demarre)) return done(""); if (Date.now() - t0 > 15000) return done(""); setTimeout(guette, 100); };
        setTimeout(guette, 100);
      }));
      const err = await lance(script);
      if (err) { try { fs.unlinkSync(path.join(o.data, "maj-essai.json")); } catch (_) {} throw new Error("Windows n'a pas laissé démarrer l'outil de mise à jour (PowerShell) : rien n'a changé. " + String(err).slice(0, 120)); }
      return { ...nv, script };
    } catch (e) { clean(); throw e; }
  }
  async function installer(archive, why) {
    M = mode();
    const nv = M === "versionne" ? await installVersionne(archive, why) : M === "installation" ? await installInstallation(archive, why) : M === "windows" ? await installWindows(archive, why) : null;
    if (!nv) throw new Error(plat === "linux" ? "Installe d'abord Rembobine avec installer.sh (ou utilise Rembobine OS) pour qu'il se mette à jour tout seul." : "Sur cet appareil, la mise à jour s'installe à la main.");
    log("info", `mise à jour : ${build.label} → ${nv.label} (${why}, ${M}), redémarrage`);
    etape("redemarrage", 100, { version: nv.label });
    emit({ type: "update", msg: `Mise à jour ${nv.label} installée : Rembobine redémarre.` });
    fermer();
    return { ok: true, version: nv.label, restart: true, mode: M };
  }
  const guard = async (what, fn) => {
    if (busy) return { ok: false, err: `Patiente : ${busy} en cours.` };
    busy = what;
    try { return await fn(); }
    catch (e) { log("error", `mise à jour : ${e.message}`); if (what !== "vérification") etape("echec", 0, { err: e.message }); return { ok: false, err: e.message }; }
    finally { busy = ""; }
  };

  // vérifier, télécharger, installer (bouton « Mettre à jour maintenant », « Installer », ou la nuit)
  const apply = () => guard("mise à jour", async () => {
    const info = await check(); if (!info.available) return { ok: false, err: info.err || info.errNet || "Rembobine est déjà à jour.", upToDate: !info.err && !info.errNet };
    const file = await download(info);
    M = mode();
    if (M === "manuel") {
      const msg = plat === "win32" ? `Rembobine ${info.latest} est téléchargé dans ${file}. Ferme Rembobine, puis décompresse ce fichier à la place de l'ancien dossier.`
        : `Rembobine ${info.latest} est téléchargé dans ${file}. Décompresse-le puis lance installer.sh pour qu'ensuite les mises à jour se fassent toutes seules.`;
      etape("fini", 100, { version: info.latest, msg });
      emit({ type: "update", msg }); return { ok: true, downloaded: file, msg };
    }
    return installer(file, "internet");
  });
  // la même chose sans attendre la fin (la page suit la progression : /api/update et évènements « maj »)
  // (une vérification discrète en cours — 30 s après l'ouverture, toutes les 6 h — n'est pas une raison de refuser : la
  //  mise à jour part dès qu'elle est finie ; jusqu'à 45 s d'attente, le temps d'une réponse lente de GitHub)
  let enAttente = false;
  function start() {
    if ((busy && busy !== "vérification") || enAttente) return { ok: false, err: `Patiente : ${busy || "mise à jour"} en cours.`, prog: P };
    P = { etape: "", pct: 0, version: "", t: Date.now(), err: "" };
    const fini = (r) => { if (r && r.ok === false && P.etape !== "echec") etape(r.upToDate ? "fini" : "echec", 0, r.upToDate ? { msg: r.err } : { err: r.err }); };
    if (busy) {
      enAttente = true; etape("telechargement", 0, { version: (last && last.latest) || "" });
      const t0 = Date.now();
      const attendre = () => { if (busy === "vérification" && Date.now() - t0 < 45000) return void setTimeout(attendre, 200); enAttente = false; apply().then(fini).catch(() => {}); };
      setTimeout(attendre, 200);
      return { ok: true, started: true, prog: P };
    }
    apply().then(fini).catch(() => {});
    return { ok: true, started: true, prog: P };
  }
  // « Ouvrir la version installée » : cette copie décompressée se ferme et le gardien lance Rembobine depuis
  // ~/.local/share/rembobine (celle du menu des applications)
  function ouvrirInstallee() {
    const inst = installee();
    if (busy || enAttente) return { ok: false, err: `Patiente : ${busy || "mise à jour"} en cours.` };
    if (!inst) return { ok: false, err: "Pas de version installée sur ce PC." };
    try { garde(IB, { from: build.label, to: inst.label, relaunch: true, relaunchOnly: true }); }
    catch (e) { return { ok: false, err: `Rembobine installé n'a pas pu être lancé (${e.message}).` }; }
    log("info", `copie décompressée ${build.label} fermée : Rembobine ${inst.label} (installé) prend la suite`);
    fermer();
    return { ok: true, version: inst.label, restart: true };
  }
  // mise à jour par fichier : clé USB, ou envoyé depuis le PC
  function usbArchives() {
    const name = archiveName(plat, arch), out = [], dirs = [];
    let mounts = ""; try { mounts = fs.readFileSync(o.mountsFile || "/proc/mounts", "utf8"); } catch (_) {}
    for (const l of mounts.split("\n")) { const m = l.split(" ")[1]; if (m && /^\/(media|run\/media|mnt)\//.test(m)) dirs.push(m.replace(/\\040/g, " ")); }
    // le dossier Rembobine (et son MisesAJour) est partagé en écriture sur le réseau (Samba) : tant que les mises à jour
    // ne sont pas signées (pas de clé publique dans maj-cle.js), on n'y cherche rien — seulement les vraies clés USB
    dirs.push(...(o.usbDirs || []));
    if (signee()) dirs.push(...(o.roots || []).slice(0, 1), ...(o.roots || []).slice(0, 1).map((r) => path.join(r, "MisesAJour")));
    for (const d of [...new Set(dirs)]) { const f = path.join(d, name); try { const s = fs.statSync(f); if (s.isFile()) out.push({ file: f, size: s.size, t: s.mtimeMs, where: (o.roots || []).some((r) => f.startsWith(r)) ? "dossier Rembobine" : "clé USB" }); } catch (_) {} }
    return out;
  }
  const fromFile = (file) => guard("installation", async () => {
    if (!canInstall) return { ok: false, err: "Installe d'abord Rembobine avec installer.sh (ou utilise Rembobine OS) pour installer une mise à jour par fichier." };
    if (!usbArchives().some((x) => x.file === file) && file !== path.join(o.data, "maj", "envoi.tar.gz")) return { ok: false, err: "Fichier introuvable." };
    return installer(file, "fichier");
  });
  const uploaded = () => path.join(o.data, "maj", "envoi.tar.gz");
  function previous() {
    if (!L.versioned) return "";
    const h = st().history.find((x) => x.ok && x.version === L.current && x.from && x.from !== L.current);
    if (h && fs.existsSync(path.join(L.versions, h.from))) return h.from;
    let best = "", t = 0;
    for (const n of fs.readdirSync(L.versions)) { if (n === L.current || n.startsWith(".")) continue; try { const s = fs.statSync(path.join(L.versions, n, "rembobine-bin")); if (s.mtimeMs > t) { t = s.mtimeMs; best = n; } } catch (_) {} }
    return best;
  }
  const rollback = () => guard("retour", async () => {
    if (!canInstall) return { ok: false, err: "Pas de version précédente gardée sur cet appareil." };
    const prev = previous(); if (!prev) return { ok: false, err: "Pas de version précédente gardée sur cet appareil." };
    const s = st(); if (!s.bad.includes(L.current)) s.bad.push(L.current);
    s.history.unshift({ t: Date.now(), from: L.current, version: prev, ok: true, rollback: true }); save(s);
    relink(L.link, path.join("versions", prev));
    garde(L.base, { from: L.current, to: prev, relaunchOnly: true });
    emit({ type: "update", msg: `Retour à la version ${prev} : Rembobine redémarre.` });
    fermer();
    return { ok: true, version: prev, restart: true };
  });
  // au démarrage : essai confirmé (si le gardien n'a pas pu le faire), résultat du script Windows, ménage
  function startup() {
    // Windows : le script a laissé son résultat (réussi, ou ancienne version remise)
    const wr = readJson(winResult, null);
    if (wr && wr.to) {
      const s = st(); s.history.unshift({ t: Number(wr.t) || Date.now(), from: String(wr.from || ""), version: String(wr.to), ok: !!wr.ok, ...(wr.ok ? {} : { err: String(wr.err || "ne démarre pas : ancienne version remise").slice(0, 200) }) });
      if (!wr.ok && !s.bad.includes(String(wr.to))) s.bad.push(String(wr.to));
      s.history = s.history.slice(0, 30); save(s);
      try { fs.unlinkSync(winResult); } catch (_) {} try { fs.unlinkSync(path.join(o.data, "maj-essai.json")); } catch (_) {}
    }
    // archives déjà installées (celle de cette version) : la place est rendue
    try { for (const n of fs.readdirSync(path.join(o.data, "maj"))) if (n.endsWith(".version") && fs.readFileSync(path.join(o.data, "maj", n), "utf8") === build.label) { for (const f of [n, n.slice(0, -8)]) { try { fs.unlinkSync(path.join(o.data, "maj", f)); } catch (_) {} } } } catch (_) {}
    // restes d'une décompression interrompue (Windows : à côté du dossier de l'appli)
    if (plat === "win32" && o.appDir) { const par = path.dirname(o.appDir); try { for (const n of fs.readdirSync(par)) if (/^\.rembobine-nouvelle-\d+$/.test(n) && Date.now() - Number(n.split("-").pop()) > 3600e3) fs.rmSync(path.join(par, n), { recursive: true, force: true }); } catch (_) {} }
    if (!L.versioned) { const e = readJson(essaiFile, null); if (e && Date.now() - (Number(e.t) || 0) > 600000) { try { fs.unlinkSync(essaiFile); } catch (_) {} } return; }
    lanceur();
    try { for (const n of fs.readdirSync(L.versions)) if (/^\.nouvelle-\d+$/.test(n) && Date.now() - Number(n.split("-").pop()) > 3600e3) fs.rmSync(path.join(L.versions, n), { recursive: true, force: true }); } catch (_) {}
    const e = readJson(essaiFile, null);
    if (e && e.to === L.current && Date.now() - e.t > 120000) { const s = st(); s.history.unshift({ t: Date.now(), from: e.from, version: e.to, ok: true, ...(e.note ? { note: e.note } : {}) }); save(s); try { fs.unlinkSync(essaiFile); } catch (_) {} }
    if (fs.existsSync(essaiFile)) return;
    const keep = new Set([L.current, previous()]);
    for (const n of fs.readdirSync(L.versions)) if (!keep.has(n) && !n.startsWith(".")) { try { fs.rmSync(path.join(L.versions, n), { recursive: true, force: true }); } catch (_) {} }
  }
  // la nuit (entre 3 h et 5 h), au plus une fois par jour, si rien ne passe sur la TV
  async function nightly(now = new Date()) {
    if (!cfg().auto || busy) return null;
    const h = now.getHours(); if (h < 3 || h >= 5) return null;
    const s = st(); if (now.getTime() - (s.lastAuto || 0) < 20 * 3600 * 1000) return null;
    if (o.busy && o.busy()) return null;
    s.lastAuto = now.getTime(); save(s);
    return apply();
  }
  const timer = setInterval(() => { nightly().catch(() => {}); }, 20 * 60 * 1000); if (timer.unref) timer.unref();
  try { startup(); } catch (_) {}

  // la dernière mise à jour de moins de 15 min (la page dit « Rembobine est à jour » ou « l'ancienne version a été remise »)
  function recent() {
    const h = [...st().history]; if (!L.versioned && plat === "linux") h.push(...(readJson(path.join(IB, "maj-etat.json"), {}).history || []));
    const r = h.filter((x) => x && x.t && Date.now() - x.t < 15 * 60000).sort((a, b) => b.t - a.t)[0];
    return r ? { t: r.t, from: r.from || "", version: r.version, ok: !!r.ok, err: r.err || "", note: r.note || "", rollback: !!r.rollback } : null;
  }
  function status() {
    const s = st(), dl = last && last.asset ? path.join(dlDir(), last.asset.name) : "";
    return { current: build.label, build: build.build, date: build.date, depot, versioned: !!L.versioned, canInstall, mode: M, platform: plat, archive: archiveName(plat, arch),
      config: { ...cfg(), channel: "stable" }, last: juste(last), busy: busy || (enAttente ? "mise à jour" : ""), prog: P, pending: readJson(essaiFile, null), history: s.history.slice(0, 20), bad: s.bad, recent: recent(),
      installDir: M === "installation" ? (IB.startsWith(home + path.sep) ? "~/" + path.relative(home, IB) : IB) : "", previous: canInstall ? previous() : "", usb: usbArchives(), downloaded: dl && fs.existsSync(dl) && M === "manuel" ? dl : "" };
  }
  return { status, check: (opts) => guard("vérification", () => check(opts || {})), apply, start, rollback, fromFile, uploaded, nightly, usbArchives, signee, ouvrirInstallee, lanceur, layout: L, mode: () => M, stop: () => clearInterval(timer) };
}

module.exports = { createMaj, archiveName, readBuild, layout, scriptWindows, depotOk, REPO, TAG, HOTES, FERME };
