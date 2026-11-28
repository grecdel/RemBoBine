// node shot2d.js <fichier.html> <dossier_sortie> "2026-12-31T23:00:00|nom" ... [--zoom=x,y,w,h] [--cfg='{"decoPays":"France","fete_stpatrick":true}'] [--enseigne=2,6]
// (chemins relatifs acceptés ; --cfg = réglages de départ, pour tester un pays ou des fêtes cochées ;
//  --enseigne=g,f = lettre de l'enseigne qui grésille et lettre décalée, comptées depuis 0, identiques = lettre tombée ;
//  sans cette option l'enseigne est entière, pour des captures toujours pareilles)
// Capture la scène du salon (#sstage) à la date donnée (horloge simulée), comme si on ouvrait le logiciel ce jour-là.
const { chromium } = require('playwright') ;
const path = require('path');
// éléments retirés avant chaque photo (le module facultatif peut en ajouter : web/ext/captures-masquer.txt)
let MASQUE = '.toast'; try { const x = require('fs').readFileSync(path.join(__dirname, '../../../web/ext/captures-masquer.txt'), 'utf8').trim(); if (x) MASQUE += ',' + x; } catch (_) {}
const args = process.argv.slice(2); const html = path.resolve(args[0]), out = path.resolve(args[1]); let zoom = null, cfg = {}, enseigne = '-';
const list = args.slice(2).filter(a => { if (a.startsWith('--zoom=')) { zoom = a.slice(7).split(',').map(Number); return false; }
  if (a.startsWith('--cfg=')) { cfg = JSON.parse(a.slice(6)); return false; }
  if (a.startsWith('--enseigne=')) { enseigne = a.slice(11); return false; } return true; });
const init = (d) => `{const T=new Date("${d}").getTime(), O=Date, st=O.now(); class D extends O{constructor(...a){if(a.length)super(...a);else super(T+(O.now()-st));} static now(){return T+(O.now()-st);} } window.Date=D;
 try { sessionStorage.setItem("rbbEnseigne", ${JSON.stringify(enseigne)}); } catch (_) {}
 try { if (!localStorage.getItem("gamebox.v1")) localStorage.setItem("gamebox.v1", JSON.stringify({ cfg: Object.assign({ demoMode: true }, ${JSON.stringify(cfg)}) })); } catch (_) {} }`;
(async () => { const b = await chromium.launch();
  for (const it of list) { const [d, n] = it.split('|');
    const p = await b.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: zoom ? 2 : 1 });
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.text().startsWith('fête')) errs.push(m.text()); });
    await p.addInitScript(init(d)); await p.goto('file://' + html);
    await p.waitForTimeout(3000); await p.keyboard.press('Enter'); await p.waitForTimeout(3500);
    await p.evaluate((m) => { document.querySelectorAll(m).forEach(e => e.remove()); }, MASQUE);
    const el = await p.$('#sstage'); const bb = await el.boundingBox();
    const path = out.replace(/\/$/, '') + '/' + n + '.png';
    if (zoom) await p.screenshot({ path, clip: { x: bb.x + zoom[0], y: bb.y + zoom[1], width: zoom[2], height: zoom[3] } }); else await el.screenshot({ path });
    console.log(path, errs.length ? errs : 'sans erreur'); await p.close(); }
  await b.close(); })();
