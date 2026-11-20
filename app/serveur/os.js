// Rembobine — les routes « Rembobine OS » du serveur : état de la machine, alerte disque, extinction,
// partage réseau, mises à jour, sauvegarde complète, crédits et licences.
// Branché par serveur.js (une ligne dans route()). Les invités (séance à distance) n'ont accès à rien ici.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { createSysteme } = require("./systeme");
const { createMaj, readBuild } = require("./maj");
const { createSauvegarde } = require("./sauvegarde");

// corps de requête brut (fichier envoyé), écrit sur le disque au fil de l'eau
function saveBody(req, dest, limit) {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const out = fs.createWriteStream(dest + ".part"); let n = 0, bad = false;
    req.on("data", (d) => { n += d.length; if (n > limit && !bad) { bad = true; req.unpipe(out); out.destroy(); req.destroy(); resolve({ ok: false, err: "Fichier trop gros." }); } });
    req.pipe(out);
    out.on("finish", () => { if (bad) return; fs.renameSync(dest + ".part", dest); resolve({ ok: true, size: n }); });
    out.on("error", (e) => { if (!bad) resolve({ ok: false, err: e.message }); });
  });
}
function readJsonBody(req, limit) {
  return new Promise((resolve) => { const ch = []; let n = 0; req.on("data", (d) => { n += d.length; if (n > limit) { req.destroy(); resolve(null); } else ch.push(d); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(ch).toString("utf8") || "{}")); } catch (_) { resolve(null); } }); });
}

function createOs(S, H, opt = {}) {
  const build = opt.build || readBuild(opt.buildFile || "");
  S.build = build;
  const isOs = opt.isOs !== undefined ? !!opt.isOs : fs.existsSync("/etc/rembobine-os");
  S.isOs = isOs;
  const SY = createSysteme({ roots: () => S.roots, emit: (e) => S.emit(e), run: opt.run, which: opt.which, passFile: opt.passFile, paths: opt.sysPaths, ssid: opt.ssid, statfs: opt.statfs });
  // les nouvelles des mises à jour (progression, résultat) : seulement aux appareils de la maison, jamais aux invités
  const emitHome = (e) => { const line = `data: ${JSON.stringify(e)}\n\n`; for (const c of S.clients) if (!c.rbbGuest) { try { c.write(line); } catch (_) {} } };
  const MJ = createMaj({ data: S.data, build, appDir: opt.appDir, roots: S.roots, port: S.port, kiosk: !!opt.kiosk, isOs, cfg: () => S.cfg, emit: emitHome, log: H.log,
    // (REMBOBINE_MAJ_API : un faux GitHub, pour les essais sans internet)
    fetch: opt.fetch, api: opt.updateApi || process.env.REMBOBINE_MAJ_API || undefined, quit: opt.quit, busy: () => !!S.player, node: opt.node, gardeTimeout: opt.gardeTimeout, quitDelay: opt.quitDelay,
    platform: opt.platform, arch: opt.arch, usbDirs: opt.usbDirs, mountsFile: opt.mountsFile, pid: opt.pid, publicKey: opt.updateKey,
    home: opt.home, args: opt.args, depot: opt.depot, spawnWin: opt.spawnWin });
  const SV = createSauvegarde({ data: S.data, roots: S.roots, home: opt.home, version: build.label, name: () => S.cfg.name, log: H.log, emit: (e) => S.emit(e), usbDirs: opt.usbDirs, reload: H.reload });
  Object.assign(S, { systeme: SY, maj: MJ, sauvegarde: SV });
  const licDir = opt.licencesDir || "";
  const refuse = (res) => H.send(res, 403, { ok: false, err: "Réservé à la maison (accès invité)." });

  const TV_ONLY = { ok: false, tv: true, err: "Par sécurité, ce réglage se change seulement sur l'écran de la TV (Rembobine OS → Avancé), pas depuis un téléphone." };
  async function route(req, res, p, url, W) {
    const { send } = H, post = req.method === "POST";
    if (p === "/api/system") {
      const e = SY.etat();
      // (un invité ne voit pas les adresses de la maison)
      return send(res, 200, { name: S.cfg.name, version: build.label, build: build.build, date: build.date, os: isOs, net: W.guest ? {} : { ip: H.ip(), host: os.hostname() + ".local", tailscale: H.tailscaleIp() },
        ...e, temp: e.temp == null ? 0 : e.temp, hasTemp: e.temp != null, throttled: throttled() });
    }
    if (p === "/api/storage") { const d = SY.disks(); return send(res, 200, { disks: d, low: d.filter((x) => x.low) }); }
    if (p === "/api/smart") return send(res, 200, []);
    if (!/^\/api\/(power|share|update|backup|dev)(\/|$)/.test(p)) return false;
    if (W.guest) return refuse(res);

    // --- extinction, redémarrage (avec confirmation côté écran), veille de la TV ---
    if (p === "/api/power" && post) {
      const b = await H.body(req), a = String(b.action || "");
      if (a === "sleep") { H.cec && H.cec(false); S.emit({ type: "sleep" }); return send(res, 200, { ok: true }); }
      if (!["reboot", "shutdown"].includes(a)) return send(res, 200, { ok: false, err: "Action inconnue." });
      if (!isOs && !opt.allowPower) return send(res, 200, { ok: false, err: "L'extinction depuis Rembobine est réservée à Rembobine OS. Sur un PC, éteins-le normalement." });
      H.log("info", `${a === "reboot" ? "redémarrage" : "extinction"} demandé par ${W.local ? "l'écran" : W.name || "un appareil"}`);
      S.emit({ type: "alert", msg: a === "reboot" ? "Rembobine redémarre…" : "Rembobine s'éteint… À bientôt !" });
      if (H.beforePower) await H.beforePower();
      // la réponse part d'abord, l'ordre ensuite
      setTimeout(() => { const r = SY.power(a); if (!r.ok) { H.log("error", r.err); S.emit({ type: "alert", msg: r.err }); } }, opt.powerDelay ?? 1200);
      return send(res, 200, { ok: true });
    }
    // --- partage du dossier Rembobine sur le réseau ---
    // (le mot de passe de Rembobine OS n'est montré, et le partage changé, QUE sur l'écran de la TV elle-même :
    //  un téléphone relié, perdu ou volé, ne doit pas pouvoir ouvrir la maison)
    if (p === "/api/share") {
      if (post) { if (!W.local) return send(res, 200, TV_ONLY); const b = await H.body(req); return send(res, 200, SY.setShare(!!b.on)); }
      const sh = SY.share();
      return send(res, 200, W.local || !sh.installed ? sh : { ...sh, pass: "", passTv: true });
    }
    // --- Avancé : SSH (seulement depuis l'écran de la TV), journal ---
    if (p === "/api/dev") {
      if (post) { const b = await H.body(req); if (b.action === "ssh") return send(res, 200, W.local ? SY.setSsh(!!b.on) : TV_ONLY); return send(res, 200, { ok: false }); }
      return send(res, 200, { ssh: SY.ssh(), plugins: [], crashes: S.log.filter((l) => /^page :/.test(l.msg)), logs: S.log.slice(-40) });
    }
    // --- mises à jour ---
    if (p === "/api/update") {
      if (!post) return send(res, 200, MJ.status());
      const b = await H.body(req), a = String(b.action || "");
      // check : « Vérifier maintenant » ; auto : vérification discrète de la page (une réponse récente suffit)
      if (a === "check") { const r = await MJ.check({ auto: !!b.auto }); return send(res, 200, r && r.ok === false ? r : { ok: true, ...r }); }
      // start : « Mettre à jour maintenant » ; la page suit la progression (évènements « maj » et /api/update)
      if (a === "start") return send(res, 200, MJ.start());
      if (a === "apply") return send(res, 200, await MJ.apply());
      if (a === "rollback") return send(res, 200, await MJ.rollback());
      // appli décompressée relancée alors que Rembobine est déjà installé (~/.local/share/rembobine) : on passe à celui-là
      if (a === "installee") return send(res, 200, MJ.ouvrirInstallee ? MJ.ouvrirInstallee() : { ok: false, err: "Action inconnue." });
      if (a === "file") return send(res, 200, await MJ.fromFile(String(b.file || "")));
      if (a === "os") return send(res, 200, { ok: false, err: "Le système (Debian) se met à jour en réinstallant l'image Rembobine OS : tes réglages se gardent avec une sauvegarde sur clé USB." });
      return send(res, 200, { ok: false, err: "Action inconnue." });
    }
    if (p === "/api/update/upload" && post) {
      const r = await saveBody(req, MJ.uploaded(), 2e9); if (!r.ok) return send(res, 200, r);
      return send(res, 200, await MJ.fromFile(MJ.uploaded()));
    }
    // --- sauvegarde complète ---
    if (p === "/api/backup") {
      if (!post) return send(res, 200, SV.list());
      const b = await readJsonBody(req, 64 * 1048576); if (!b) return send(res, 200, { ok: false, err: "Données trop grosses ou illisibles." });
      if (b.action === "page") return send(res, 200, SV.setPage(b.page));
      if (b.action === "create") { if (b.page) SV.setPage(b.page); return send(res, 200, SV.create(b.target === "usb" ? "usb" : "local", b.page || null)); }
      if (b.action === "restore") return send(res, 200, restored(SV.restore(b.file)));
      return send(res, 200, { ok: false, err: "Action inconnue." });
    }
    // l'écran de la TV vient chercher l'état de la page restauré (une seule fois), puis se recharge
    if (p === "/api/backup/page") {
      const f = path.join(S.data, "page-a-remettre.json"); let page = null;
      if (W.local) { try { page = JSON.parse(fs.readFileSync(f, "utf8")); fs.unlinkSync(f); } catch (_) {} }
      return send(res, 200, { page });
    }
    if (p === "/api/backup/file") {
      const f = SV.resolve(url.searchParams.get("f")); if (!f) return send(res, 404, { ok: false, err: "introuvable" });
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(f)}"`);
      return H.sendFile(req, res, f, "application/gzip");
    }
    if (p === "/api/backup/upload" && post) {
      const tmp = path.join(S.data, "sauvegardes", "envoi.tmp"), r = await saveBody(req, tmp, 600 * 1048576); if (!r.ok) return send(res, 200, r);
      const out = SV.restoreBuffer(fs.readFileSync(tmp)); try { fs.unlinkSync(tmp); } catch (_) {}
      return send(res, 200, restored(out));
    }
    return send(res, 404, { ok: false, err: "introuvable" });
  }
  // après une restauration : l'état de la page (réglages, profils, cartouches…) attend l'écran de la TV
  function restored(out) {
    if (out.ok && out.page) { fs.writeFileSync(path.join(S.data, "page-a-remettre.json"), JSON.stringify(out.page)); S.emit({ type: "restorePage" }); }
    return { ...out, page: !!(out && out.page) };
  }
  // textes des licences livrés avec l'appli (dossier « licences »), lisibles depuis la page « Crédits et licences »
  function licences(req, res, p) {
    if (p === "/api/licences") { let l = []; try { l = fs.readdirSync(licDir).filter((n) => !n.startsWith(".")).sort(); } catch (_) {} return H.send(res, 200, { files: l }); }
    const m = /^\/licences\/([^/]+)$/.exec(p); if (!m || !licDir) return false;
    const f = path.join(licDir, path.basename(m[1])); if (!fs.existsSync(f)) return H.send(res, 404, { ok: false });
    return H.sendFile(req, res, f, /\.html?$/i.test(f) ? "text/html; charset=utf-8" : "text/plain; charset=utf-8");
  }
  // Raspberry Pi : sous-tension ou surchauffe signalée par le processeur
  let thr = { t: 0, v: "0x0" };
  function throttled() { if (Date.now() - thr.t < 60000) return thr.v; thr.t = Date.now(); try { const r = (opt.run || require("child_process").spawnSync)("vcgencmd", ["get_throttled"], { encoding: "utf8", timeout: 3000 }); const m = /0x[0-9a-f]+/i.exec(r.stdout || ""); return (thr.v = m ? m[0] : "0x0"); } catch (_) { return "0x0"; } }
  return { route, licences, info: () => ({ build: build.label, buildNo: build.build, date: build.date, os: isOs }), stop: () => { SY.stop(); MJ.stop(); SV.stop(); } };
}

module.exports = { createOs };
