// Paramètres → Système → « Lecteur par défaut », dans la vraie application (Electron, Playwright) :
//   node outils/essai/lecteur_seul_reglage.js <programme electron> <dossier de l'appli> <dossier des captures> [musique]
// Avec une musique : d'abord le bouton « Ouvrir Rembobine » du lecteur seul (la médiathèque s'ouvre, le lecteur se ferme).
// Vérifie aussi que la page s'ouvre sans erreur JavaScript (démarrage normal inchangé). HOME doit être un dossier d'essai.
const { _electron } = require("playwright");
const path = require("path");
const [EL, APP, CAP, MUS] = process.argv.slice(2);
(async () => {
  if (MUS) {
    const a = await _electron.launch({ executablePath: EL, args: ["--no-sandbox", "--disable-gpu", APP, MUS], env: { ...process.env, REMBOBINE_OUVRIR_AVEC: "0" }, timeout: 60000 });
    const w = await a.firstWindow(); await w.waitForTimeout(2500);
    const seul = /^rbbseul:/.test(w.url());
    await w.click("#bComplet");
    let complet = false;
    for (let i = 0; i < 40 && !complet; i++) { await new Promise((r) => setTimeout(r, 500)); complet = a.windows().some((x) => /index\.html/.test(x.url())); }
    await new Promise((r) => setTimeout(r, 1500));
    const reste = a.windows().filter((x) => /^rbbseul:/.test(x.url())).length;
    await a.close();
    console.log("  « Ouvrir Rembobine » : lecteur seul", seul ? "oui" : "non", "· médiathèque ouverte", complet ? "oui" : "non", "· lecteur fermé", reste ? "non" : "oui");
    if (!seul || !complet || reste) process.exit(1);
  }
  const app = await _electron.launch({ executablePath: EL, args: ["--no-sandbox", "--disable-gpu", APP], env: { ...process.env, REMBOBINE_OUVRIR_AVEC: "0" }, timeout: 60000 });
  const p = await app.firstWindow();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.waitForLoadState("domcontentloaded");
  await p.evaluate(() => { try { localStorage.setItem("gamebox.v1", JSON.stringify({ cfg: { demoMode: true, jingle: false } })); } catch (_) {} });
  await p.reload(); await p.waitForTimeout(3500);
  await p.keyboard.press("Enter"); await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById("settingsBtn").click());
  await p.waitForTimeout(800);
  await p.click('[data-stab="system"]'); await p.waitForTimeout(1500);
  await p.evaluate(() => { const b = document.getElementById("ldBox"); if (b) b.scrollIntoView({ block: "center" }); });
  await p.waitForTimeout(600);
  const txt = await p.evaluate(() => (document.getElementById("ldBox") || {}).innerText || "");
  await p.screenshot({ path: path.join(CAP, "8-reglage-lecteur-defaut.png") });
  // un clic : Rembobine devient le lecteur vidéo par défaut (vrai xdg-mime, dans le dossier d'essai), puis retour arrière
  const b = await p.$('[data-ld="video"][data-on="1"]');
  let fait = false, defait = false;
  if (b) {
    await b.click(); await p.waitForTimeout(1500);
    fait = await p.evaluate(() => !!document.querySelector('[data-ld="video"][data-on="0"]'));
    await p.evaluate(() => { const b = document.getElementById("ldBox"); if (b) b.scrollIntoView({ block: "center" }); });
    await p.screenshot({ path: path.join(CAP, "8-reglage-video-par-defaut.png") });
    await p.click('[data-ld="video"][data-on="0"]'); await p.waitForTimeout(1500);
    defait = await p.evaluate(() => !!document.querySelector('[data-ld="video"][data-on="1"]'));
  }
  await app.close();
  console.log("  texte :", txt.replace(/\s+/g, " ").slice(0, 160) + "…");
  console.log("  par défaut :", fait ? "oui" : "non", "· retour arrière :", defait ? "oui" : "non", "· erreurs de la page :", errs.length ? errs : "aucune");
  process.exit(/Faire de Rembobine le lecteur par défaut/.test(txt) && fait && defait && !errs.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
