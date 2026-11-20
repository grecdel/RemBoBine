// Vérifications de l'essai de bout en bout (lancé par ci/essai_bout_en_bout.sh, l'appli tourne déjà) :
//   node outils/essai/bout_en_bout.js http://127.0.0.1:8080 <dossier des captures> [numéro de fabrication attendu]
// Les appels viennent de la machine elle-même (127.0.0.1 = l'écran de la TV) : pas besoin d'appairage.
// Sort en erreur (code 1) si une seule vérification échoue.
"use strict";
const fs = require("fs"), path = require("path");
const [base, cap = "/tmp", label = ""] = process.argv.slice(2);
let ok = 0, ko = 0;
const check = (c, w, extra) => { if (c) { ok++; console.log("  ✔", w); } else { ko++; console.log("  ✘ ÉCHEC :", w, extra !== undefined ? "(détail : echecs.txt, avec les captures)" : ""); if (extra !== undefined) try { fs.appendFileSync(path.join(cap, "echecs.txt"), w + " : " + JSON.stringify(extra).slice(0, 4000) + String.fromCharCode(10)); } catch (_) {} } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p, h = {}) => { const r = await fetch(base + p, { headers: h, signal: AbortSignal.timeout(15000) }); return r; };

(async () => {
  // 1. l'appli démarre : /api/info répond (60 s au plus)
  let info = null;
  for (let i = 0; i < 60 && !info; i++) { try { const r = await get("/api/info"); if (r.ok) info = await r.json(); } catch (_) {} if (!info) await wait(1000); }
  check(info && info.api === 1, "l'appli démarre et /api/info répond", info);
  if (!info) return finish();
  check(!label || info.build === label, `numéro de fabrication gravé : ${info.build}`, { attendu: label });

  // 2. la bibliothèque : la vidéo et le jeu de test sont trouvés
  let lib = null;
  for (let i = 0; i < 40; i++) { try { lib = await (await get("/api/library")).json(); } catch (_) {} if (lib && lib.items && lib.items.some((x) => x.kind === "game") && lib.items.some((x) => x.kind === "film")) break; await wait(1000); }
  const items = (lib && lib.items) || [];
  const film = items.find((x) => x.kind === "film" && /Essai de Rembobine/i.test(x.title)), jeu = items.find((x) => x.kind === "game");
  check(!!film, "la vidéo de test est dans la bibliothèque", items.map((x) => x.kind + ":" + x.title));
  check(!!jeu && /essai rembobine/i.test(jeu.title), "le jeu de test (ROM maison) est listé", jeu);

  // 3. la vidéo passe par le serveur (/media) : en entier, par morceaux, et convertie si besoin
  if (film) {
    const r = await get(`/media/${encodeURIComponent(film.id)}`, { Range: "bytes=0-4095" }), b = Buffer.from(await r.arrayBuffer());
    check(r.status === 206 && b.length === 4096 && b.slice(4, 8).toString() === "ftyp", "la vidéo se lit par morceaux (streaming)", { status: r.status, len: b.length });
    const pr = await (await get(`/api/probe/${encodeURIComponent(film.id)}`)).json();
    check(pr && pr.video && pr.video.codec === "h264" && pr.dur > 3, "la vidéo est analysée (ffprobe livré)", pr);
    const tr = await get(`/media/${encodeURIComponent(film.id)}?mode=transcode`), tb = Buffer.from(await tr.arrayBuffer());
    check(tr.ok && tb.length > 10000, "conversion à la volée (ffmpeg livré)", { status: tr.status, len: tb.length });
  }

  // 4. la page servie s'affiche sans erreur JavaScript
  let chromium; try { ({ chromium } = require("playwright")); } catch (_) { check(false, "module playwright introuvable (NODE_PATH ?)"); return finish(); }
  const b = await chromium.launch(), errs = [];
  const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.goto(base + "/", { waitUntil: "load", timeout: 60000 });
  await wait(6000); await pg.keyboard.press("Enter"); await wait(3000);
  await pg.screenshot({ path: path.join(cap, "page-servie.png") });
  check(errs.length === 0, "la page servie s'affiche sans erreur JavaScript", errs);
  check(await pg.evaluate(() => document.body && document.body.innerText.length > 50), "la page n'est pas vide");
  await b.close();

  // 5. la fenêtre de l'appli elle-même : ses erreurs JavaScript arrivent dans le journal du serveur (/api/crash)
  const logs = await (await get("/api/logs?n=400")).json();
  const pageErr = (logs.text || "").split("\n").filter((l) => / error page : /.test(l));
  check(pageErr.length === 0, "la fenêtre de l'appli n'a signalé aucune erreur JavaScript", pageErr.slice(0, 5));
  fs.writeFileSync(path.join(cap, "journal-serveur.txt"), logs.text || "");
  finish();
})().catch((e) => { check(false, "erreur inattendue", String(e && e.message)); finish(); });

function finish() { console.log(`Essai de bout en bout : ${ok} OK, ${ko} échec(s)`); process.exit(ko || !ok ? 1 : 0); }
