// Rembobine — le confort de la maison, côté serveur :
//  - disque USB branché : repéré (/media, /run/media, lettres de lecteur sous Windows) → évènement « usb », on propose de le scanner ;
//  - CD audio ou DVD dans le lecteur (/dev/sr0) : repéré → évènement « disque », lu sur la TV avec mpv (cdda://, dvd://, bd://) ;
//  - « Tout va bien ? » : dossiers, BIOS, émulateurs, lecteur vidéo, espace disque (et internet SEULEMENT si on le demande).
// Rien ici n'appelle internet, sauf la vérification d'internet quand l'utilisateur l'a cochée (?internet=1).
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const dns = require("dns");
const { spawnSync } = require("child_process");
const CS = require("./consoles");
const OUT = require("./outils");

const WIN = process.platform === "win32";
function which(p) { try { const r = spawnSync(WIN ? "where" : "which", [p], { encoding: "utf8" }); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : ""; } catch (_) { return ""; } }

// --- disques USB : les dossiers où le système les monte ---
function usbBases() {
  if (WIN) return [];
  const u = (() => { try { return os.userInfo().username; } catch (_) { return ""; } })();
  return ["/media", u && `/media/${u}`, u && `/run/media/${u}`].filter(Boolean);
}
// un vrai point de montage : le dossier n'est pas sur le même disque que son parent
function isMount(d) { try { return fs.statSync(d).dev !== fs.statSync(path.dirname(d)).dev; } catch (_) { return false; } }
function listUsb(o = {}) {
  const out = [];
  if (WIN && !o.bases) {
    const sys = (process.env.SystemDrive || "C:").toUpperCase()[0];
    for (const L of "DEFGHIJKLMNOPQRSTUVWXYZ") { if (L === sys) continue; const d = `${L}:\\`; try { fs.readdirSync(d); out.push({ path: d, name: `Lecteur ${L}:` }); } catch (_) {} }
    return out;
  }
  const user = (() => { try { return os.userInfo().username; } catch (_) { return ""; } })();
  for (const b of o.bases || usbBases()) {
    let l = []; try { l = fs.readdirSync(b, { withFileTypes: true }); } catch (_) { continue; }
    for (const x of l) {
      if (!x.isDirectory()) continue;
      const d = path.join(b, x.name);
      if (b === "/media" && x.name === user) continue;   // /media/<moi> : ses disques sont listés à part
      if (o.checkMount !== false && !isMount(d)) continue;
      if (!out.some((y) => y.path === d)) out.push({ path: d, name: x.name });
    }
  }
  return out;
}

// --- lecteur de CD/DVD : que contient-il ? (udevadm le dit sans rien lire du disque) ---
function probeDisc(dev) {
  if (WIN) return { drive: false, present: false };
  if (!fs.existsSync(dev)) return { drive: false, present: false };
  let props = {};
  try {
    const r = spawnSync("udevadm", ["info", "--query=property", `--name=${dev}`], { encoding: "utf8", timeout: 4000 });
    for (const l of String(r.stdout || "").split("\n")) { const i = l.indexOf("="); if (i > 0) props[l.slice(0, i)] = l.slice(i + 1); }
  } catch (_) {}
  return discFromProps(props);
}
// même chose sans bloquer le serveur (relevé toutes les 5 s : un film envoyé au téléphone ne doit pas hoqueter)
function probeDiscAsync(dev) {
  return new Promise((resolve) => {
    if (WIN || !fs.existsSync(dev)) return resolve({ drive: false, present: false });
    try {
      require("child_process").execFile("udevadm", ["info", "--query=property", `--name=${dev}`], { encoding: "utf8", timeout: 4000 }, (e, out) => {
        const props = {}; for (const l of String(out || "").split("\n")) { const i = l.indexOf("="); if (i > 0) props[l.slice(0, i)] = l.slice(i + 1); }
        resolve(discFromProps(props));
      });
    } catch (_) { resolve(discFromProps({})); }
  });
}
function discFromProps(p) {
  if (p.ID_CDROM_MEDIA !== "1") return { drive: true, present: false };
  const label = p.ID_FS_LABEL || "";
  if (Number(p.ID_CDROM_MEDIA_TRACK_COUNT_AUDIO || 0) > 0) return { drive: true, present: true, kind: "cd", label: label || "CD audio", tracks: Number(p.ID_CDROM_MEDIA_TRACK_COUNT_AUDIO) };
  if (Object.keys(p).some((k) => /^ID_CDROM_MEDIA_BD/.test(k))) return { drive: true, present: true, kind: "bd", label: label || "Blu-ray" };
  if (Object.keys(p).some((k) => /^ID_CDROM_MEDIA_DVD/.test(k))) return { drive: true, present: true, kind: "dvd", label: label || "DVD" };
  return { drive: true, present: true, kind: "data", label: label || "Disque de données" };
}
const DISC_NAME = { cd: "CD audio", dvd: "DVD", bd: "Blu-ray", data: "disque de données" };

function createMaison(o) {
  const { S, emit, log, playOnTv, rescan, saveCfg } = o;
  const opt = o.opt || {};
  const dev = opt.discDevice || "/dev/sr0";
  const M = { usb: [], disc: { drive: false, present: false }, timers: [] };
  const usbOpt = { bases: opt.usbBases, checkMount: opt.usbBases ? false : true };

  // les disques USB déjà ajoutés à la bibliothèque (gardés d'un démarrage à l'autre) ; même débranché, un disque reste
  // dans la liste : ses titres restent dans la bibliothèque, hors ligne, jusqu'à son retour (voir memoire.js)
  S.cfg.usbRoots = (S.cfg.usbRoots || []).filter((r) => typeof r === "string");
  for (const r of S.cfg.usbRoots) if (!S.roots.includes(r)) S.roots.push(r);

  function pollUsb(first) {
    const now = listUsb(usbOpt), old = M.usb;
    M.usb = now;
    if (first) return;
    for (const d of now) if (!old.some((x) => x.path === d.path)) {
      const inLib = S.roots.includes(d.path);
      log("info", `disque branché : ${d.path}`);
      emit({ type: "usb", path: d.path, name: d.name, inLib, msg: inLib ? `Disque « ${d.name} » rebranché : la bibliothèque se met à jour.` : "" });
      if (inLib) rescan();
    }
    for (const d of old) if (!now.some((x) => x.path === d.path)) {
      log("info", `disque débranché : ${d.path}`);
      emit({ type: "usb", gone: true, path: d.path, name: d.name, msg: `Disque « ${d.name} » débranché.` });
      if (S.roots.includes(d.path)) rescan({ quiet: true });   // ses titres passent hors ligne (ils restent dans la bibliothèque)
    }
  }
  function pollDisc(first) {
    if (first || opt.discProbe) return discSeen((opt.discProbe || probeDisc)(dev), first);
    if (M.discBusy) return; M.discBusy = true;
    probeDiscAsync(dev).then((d) => { M.discBusy = false; discSeen(d, false); }, () => { M.discBusy = false; });
  }
  function discSeen(d, first) {
    const old = M.disc;
    M.disc = d;
    if (first) return;
    if (d.present !== old.present || d.kind !== old.kind) {
      emit({ type: "disque", ...d, msg: d.present ? `${DISC_NAME[d.kind] || "Disque"} inséré${d.kind === "data" ? "" : " : prêt à être lu sur la télé"}.` : "" });
    }
  }
  pollUsb(true); pollDisc(true);
  const t1 = setInterval(() => { try { pollUsb(false); } catch (_) {} }, opt.usbPoll || 4000), t2 = setInterval(() => { try { pollDisc(false); } catch (_) {} }, opt.discPoll || 5000);
  for (const t of [t1, t2]) { if (t.unref) t.unref(); M.timers.push(t); }

  async function playDisc() {
    const d = M.disc;
    if (!d.drive) return { ok: false, err: "Aucun lecteur de CD ou de DVD sur cet appareil." };
    if (!d.present) return { ok: false, err: "Le lecteur est vide : insère un CD ou un DVD." };
    if (d.kind === "data") return { ok: false, err: "Ce disque contient des fichiers, pas un film ni de la musique : copie-les dans ton dossier Rembobine." };
    const url = d.kind === "cd" ? "cdda://" : d.kind === "bd" ? "bd://" : "dvd://";
    const flag = d.kind === "cd" ? "--cdrom-device" : d.kind === "bd" ? "--bluray-device" : "--dvd-device";
    const r = await playOnTv([url], "disque:" + d.kind, d.label || DISC_NAME[d.kind], { kind: d.kind === "cd" ? "album" : "film", args: [`${flag}=${dev}`] });
    if (r.ok && d.kind !== "cd") {
      // un DVD protégé contre la copie s'arrête tout de suite : on le dit clairement
      const pl = S.player;
      const t = setTimeout(() => { if (pl && S.player !== pl && !(pl.pos > 5)) emit({ type: "alert", msg: `Le ${DISC_NAME[d.kind]} n'a pas pu être lu. Il est sans doute protégé contre la copie : certains disques du commerce ne se lisent pas sur un ordinateur.` }); }, opt.discCheckMs || 8000);
      if (t.unref) t.unref();
    }
    return r;
  }

  // --- « Tout va bien ? » ---
  function freeOf(p) { try { const s = fs.statfsSync(p); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch (_) { return null; } }
  const gb = (n) => (n / 1e9).toFixed(n < 1e10 ? 1 : 0).replace(".", ",") + " Go";
  async function sante(internet) {
    const L = [];
    const add = (id, label, state, detail, fix) => L.push({ id, label, state, detail, fix: fix || "" });
    // dossiers et bibliothèque
    const ok = S.roots.filter((r) => fs.existsSync(r));
    const n = S.lib.items.length;
    if (!ok.length) add("dossiers", "Dossiers", "bad", "Aucun dossier de médias trouvé.", `Crée le dossier ${S.roots[0] || "Rembobine"} et range-y tes films, séries, jeux et musique.`);
    else if (!n) add("dossiers", "Dossiers", "warn", `${ok.length} dossier${ok.length > 1 ? "s" : ""}, mais aucun média dedans.`, "Range tes fichiers dans Films, Series, Jeux ou Musique, puis relance l'analyse.");
    else add("dossiers", "Dossiers", "ok", `${n} élément${n > 1 ? "s" : ""} dans ${ok.length} dossier${ok.length > 1 ? "s" : ""}.`);
    // BIOS (ils viennent des consoles du propriétaire : jamais téléchargés)
    const bios = CS.biosFiles(S.roots);
    const cst = CS.status(S.roots);
    const needs = cst.filter((c) => c.bios && c.bios.some((b) => b.requis && !b.ok) && S.lib.items.some((x) => x.kind === "game" && x.sys === c.id));
    const hasGames = S.lib.items.some((x) => x.kind === "game");
    const retro = S.lib.items.filter((x) => x.kind === "game" && x.pub && x.pub.bios && x.pub.bios.requis && !require("./jeux").biosFind(x.pub.bios.key, S.roots, x.file));
    retro.forEach((x) => { if (!needs.some((c) => c.nom === x.pub.bios.txt)) needs.push({ nom: x.pub.bios.txt }); });
    if (needs.length && hasGames) add("bios", "BIOS", "warn", `${bios.length} BIOS ; il en manque pour : ${needs.slice(0, 4).map((c) => c.nom || c.id).join(", ")}.`, "Copie le BIOS de ta console dans le dossier Rembobine/BIOS (il n'est jamais téléchargé).");
    else add("bios", "BIOS", "ok", bios.length ? `${bios.length} BIOS trouvé${bios.length > 1 ? "s" : ""}.` : "Pas de BIOS, et aucun jeu qui en demande.");
    // lecteur vidéo et émulateurs
    const mpv = opt.mpv || OUT.tool("mpv"), ff = OUT.tool("ffmpeg");
    if (!mpv) add("lecteur", "Lecteur vidéo", "bad", "mpv est introuvable.", "Réinstalle Rembobine : le lecteur est livré avec l'application.");
    else if (!ff) add("lecteur", "Lecteur vidéo", "warn", "mpv est là, mais pas le convertisseur (ffmpeg).", "Les vidéos lisibles directement marchent ; réinstalle Rembobine pour les autres formats.");
    else add("lecteur", "Lecteur vidéo", "ok", "mpv et le convertisseur vidéo sont prêts.");
    const ra = opt.retroarch || which("retroarch");
    const heavy = cst.reduce((a, c) => a + c.emus.filter((e) => e.ok).length, 0);
    add("emulateurs", "Émulateurs", ra || heavy ? "ok" : "warn", `${ra ? "RetroArch installé" : "Émulateur intégré (sans RetroArch)"}${heavy ? ` · ${heavy} émulateur${heavy > 1 ? "s" : ""} de consoles récentes` : ""}.`, ra || heavy ? "" : "Les consoles rétro marchent dans l'émulateur intégré ; pour PS2, PS3, GameCube… : Paramètres › Jeux › Installer.");
    // espace disque
    const sp = (ok.length ? ok : [os.homedir()]).map((r) => [r, freeOf(r)]).filter((x) => x[1]);
    if (sp.length) {
      const [r, f] = sp.sort((a, b) => a[1].free / a[1].total - b[1].free / b[1].total)[0], pct = f.total ? f.free / f.total : 1;
      add("espace", "Espace disque", pct < 0.02 || f.free < 5e8 ? "bad" : pct < 0.1 ? "warn" : "ok", `${gb(f.free)} libres sur ${gb(f.total)} (${path.basename(r) || r}).`, pct < 0.1 ? "Fais de la place ou branche un disque USB : les sauvegardes et les jaquettes en ont besoin." : "");
    }
    // internet : seulement si demandé
    if (internet) {
      const net = await new Promise((res) => { const t = setTimeout(() => res(false), 4000); (opt.lookup || dns.lookup)("wikipedia.org", (e) => { clearTimeout(t); res(!e); }); });
      add("internet", "Internet (serveur)", net ? "ok" : "warn", net ? "Le serveur est connecté à internet." : "Le serveur n'a pas internet.", net ? "" : "Rien de grave : tout marche sans. Seules les fiches et les jaquettes en ligne attendent.");
    }
    // lecteur de disques et disques USB (informations)
    if (M.disc.drive) add("disque", "Lecteur CD/DVD", "ok", M.disc.present ? `${DISC_NAME[M.disc.kind]} dans le lecteur.` : "Lecteur vide.");
    return L;
  }

  async function route(req, res, p, url, W, h) {
    const { send, body } = h;
    const home = !W.guest;
    if (p === "/api/usb" && req.method !== "POST") return send(res, 200, { disks: M.usb.map((d) => ({ ...d, inLib: S.roots.includes(d.path) })) }), true;
    if (p === "/api/usb/scan" && req.method === "POST") {
      if (!home) return send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." }), true;
      const b = await body(req), d = M.usb.find((x) => x.path === String(b.path || ""));
      if (!d) return send(res, 200, { ok: false, err: "Ce disque n'est plus branché." }), true;
      if (!S.roots.includes(d.path)) { S.roots.push(d.path); S.cfg.usbRoots = [...new Set([...(S.cfg.usbRoots || []), d.path])]; saveCfg(); }
      log("info", `disque ajouté à la bibliothèque : ${d.path}`);
      rescan();
      return send(res, 200, { ok: true }), true;
    }
    if (p === "/api/usb/forget" && req.method === "POST") {
      if (!home) return send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." }), true;
      const b = await body(req), r = String(b.path || "");
      S.cfg.usbRoots = (S.cfg.usbRoots || []).filter((x) => x !== r); saveCfg();
      const i = S.roots.indexOf(r); if (i > 0) S.roots.splice(i, 1);
      rescan();
      return send(res, 200, { ok: true }), true;
    }
    if (p === "/api/disque" && req.method !== "POST") return send(res, 200, M.disc), true;
    if (p === "/api/disque/play" && req.method === "POST") {
      if (!home) return send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." }), true;
      return send(res, 200, await playDisc()), true;
    }
    if (p === "/api/sante") return send(res, 200, { checks: await sante(url.searchParams.get("internet") === "1") }), true;
    return false;
  }
  M.route = route;
  M.stop = () => M.timers.forEach((t) => clearInterval(t));
  M.pollUsb = pollUsb; M.pollDisc = pollDisc; M.sante = sante;
  return M;
}

module.exports = { createMaison, listUsb, discFromProps, probeDisc };
