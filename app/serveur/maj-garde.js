// Rembobine — le gardien des mises à jour (lancé tout seul par maj.js, détaché de l'appli).
// 1. attend que l'ancienne version se ferme ; 2. relance Rembobine (sur la TV, la session le relance déjà toute seule) ;
// 3. la nouvelle version doit répondre sur /api/info dans les 60 s avec son numéro de fabrication ;
// 4. sinon : on l'arrête, on remet l'ancienne version, on la note « à ignorer », et on relance.
//   ELECTRON_RUN_AS_NODE=1 rembobine-bin maj-garde.js '{"base":…,"from":…,"to":…,"port":8080,"pid":…,"relaunch":true}'
// Première mise à jour d'une appli simplement décompressée (PC Linux) : « fallback » = l'ancienne appli, là où elle
// était (on y revient si la nouvelle ne démarre pas) ; « nettoyer » = ce que cette installation a créé, enlevé dans ce
// cas (sinon le raccourci du menu des applications mènerait à une version qui ne démarre pas).
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const a = JSON.parse(process.argv[2] || "{}");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const say = (m) => console.log(`${new Date().toISOString()} ${m}`);
const stateFile = path.join(a.base, "maj-etat.json"), essaiFile = path.join(a.base, "maj-essai.json");
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (_) { return d; } };
const writeJson = (f, v) => { fs.writeFileSync(f + ".tmp", JSON.stringify(v, null, 1)); fs.renameSync(f + ".tmp", f); };
function relink(target) { const link = path.join(a.base, "actuelle"), tmp = link + ".nouveau"; try { fs.unlinkSync(tmp); } catch (_) {} fs.symlinkSync(target, tmp); fs.renameSync(tmp, link); }
const args = Array.isArray(a.args) ? a.args.filter((x) => typeof x === "string" && /^--[a-z][\w-]*$/.test(x)) : [];

async function info() {
  try { const r = await fetch(`http://127.0.0.1:${a.port}/api/info`, { signal: AbortSignal.timeout(3000) }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}
function launch(bin) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const exe = bin || path.join(a.base, "rembobine");
  try { spawn(exe, args, { detached: true, stdio: "ignore", env, cwd: path.dirname(exe) }).unref(); say(`Rembobine relancé (${exe})`); } catch (e) { say("relance impossible : " + e.message); }
}
// arrête tous les programmes lancés depuis le dossier d'une version (Linux : /proc/<pid>/exe)
async function killVersion(dir) {
  const pids = () => { const out = []; let list = []; try { list = fs.readdirSync("/proc").filter((n) => /^\d+$/.test(n)); } catch (_) {}
    for (const n of list) { if (Number(n) === process.pid) continue; try { const exe = fs.readlinkSync(`/proc/${n}/exe`); if (exe.startsWith(dir + path.sep)) out.push(Number(n)); } catch (_) {} } return out; };
  for (const p of pids()) { try { process.kill(p, "SIGTERM"); } catch (_) {} }
  await wait(3000);
  for (const p of pids()) { try { process.kill(p, "SIGKILL"); } catch (_) {} }
}

(async () => {
  say(`gardien : ${a.from || "(appli décompressée)"} → ${a.to}`);
  for (let i = 0; i < 300 && a.pid && alive(a.pid); i++) await wait(100);
  if (a.pid && alive(a.pid)) { try { process.kill(a.pid, "SIGKILL"); } catch (_) {} await wait(500); }
  if (a.relaunch) launch();
  if (a.relaunchOnly) return;
  const t0 = Date.now(); let ok = false, seen = "";
  while (Date.now() - t0 < (a.timeout || 60000)) { const j = await info(); if (j) seen = j.build || j.version || ""; if (j && j.build === a.to) { ok = true; break; } await wait(1000); }
  const s = { history: [], bad: [], ...readJson(stateFile, {}) };
  if (ok) {
    say(`la version ${a.to} répond : mise à jour réussie`);
    s.history.unshift({ t: Date.now(), from: a.from || "", version: a.to, ok: true, ...(a.note ? { note: String(a.note).slice(0, 40) } : {}) });
  } else {
    say(`la version ${a.to} ne répond pas (vu : ${seen || "rien"}) : retour à ${a.from || a.fallback || "l'ancienne version"}`);
    await killVersion(path.join(a.base, "versions", a.to));
    if (a.from) relink(path.join("versions", a.from));
    await killVersion(path.join(a.base, "versions", a.to));   // (sur la TV, la session a pu la relancer entre-temps)
    // (première installation sans version précédente : on enlève ce qu'elle a créé)
    if (!a.from && Array.isArray(a.nettoyer)) for (const f of a.nettoyer) { try { if (typeof f === "string" && path.isAbsolute(f)) fs.rmSync(f, { recursive: true, force: true }); } catch (_) {} }
    if (!s.bad.includes(a.to)) s.bad.push(a.to);
    s.history.unshift({ t: Date.now(), from: a.from || "", version: a.to, ok: false, err: "ne démarre pas : ancienne version remise", ...(a.note ? { note: String(a.note).slice(0, 40) } : {}) });
    if (a.relaunch) launch(a.fallback && typeof a.fallback === "string" && path.isAbsolute(a.fallback) ? a.fallback : "");
  }
  s.history = s.history.slice(0, 30);
  try { fs.mkdirSync(a.base, { recursive: true }); writeJson(stateFile, s); } catch (e) { say("état non écrit : " + e.message); }
  try { fs.unlinkSync(essaiFile); } catch (_) {}
})().catch((e) => { say("gardien : " + e.message); });
