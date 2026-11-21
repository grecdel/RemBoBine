// Rembobine — « lecteur seul », côté application de bureau (Electron) : la fenêtre minimale (ou, si Rembobine est
// déjà ouvert, une vue par-dessus sa fenêtre), l'adresse rbbseul:// qui sert la page et SEULEMENT les fichiers ouverts,
// et les réponses à la page (vidéo dans mpv, jeu dans son émulateur, reprise, « Ajouter ce dossier ? »).
// La logique sans Electron (genre, émulateur, reprise…) est dans seul.js.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const SEUL = require("./seul");

const TYPES = { mp4: "video/mp4", m4v: "video/mp4", mkv: "video/x-matroska", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg", avi: "video/x-msvideo", ts: "video/mp2t",
  mp3: "audio/mpeg", flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", mka: "audio/x-matroska",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json", wasm: "application/wasm",
  srt: "text/plain; charset=utf-8", vtt: "text/vtt; charset=utf-8", ass: "text/plain; charset=utf-8" };
const typeDe = (f) => TYPES[path.extname(f).slice(1).toLowerCase()] || "application/octet-stream";

// un fichier, en entier ou par morceaux (en-tête Range : avancer dans un morceau, un film)
function servir(file, req) {
  let st; try { st = fs.statSync(file); if (!st.isFile()) throw new Error(); } catch (_) { return new Response("absent", { status: 404 }); }
  const size = st.size, h = { "Content-Type": typeDe(file), "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(String((req && req.headers.get("range")) || "").trim());
  if (m && size > 0 && (m[1] || m[2])) {
    let a = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2])), z = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
    if (a >= size || a > z) return new Response("", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start: a, end: z })), { status: 206, headers: { ...h, "Content-Range": `bytes ${a}-${z}/${size}`, "Content-Length": String(z - a + 1) } });
  }
  return new Response(size ? Readable.toWeb(fs.createReadStream(file)) : "", { status: 200, headers: { ...h, "Content-Length": String(size) } });
}

module.exports = function createSeul(o) {
  const { app, electron } = o;
  const mem = SEUL.createMemoire(path.join(app.getPath("userData"), "lecteur-seul.json"));
  const S = { win: null, view: null, wc: null, file: "", info: null, media: new Map(), mpv: null, emu: null, ferme: false, demande: false, dessus: false };
  const log = (...a) => { try { console.log("[lecteur seul]", ...a); } catch (_) {} };

  // ---------- rbbseul:// : la page, l'émulateur intégré, et les seuls fichiers ouverts ----------
  function protocole() {
    electron.protocol.handle("rbbseul", (req) => {
      let u; try { u = new URL(req.url); } catch (_) { return new Response("", { status: 400 }); }
      if (u.host !== "app") return new Response("", { status: 404 });
      const p = decodeURIComponent(u.pathname);
      if (p === "/seul.html") return servir(path.join(__dirname, "lecteur", "seul.html"), req);
      if (p.startsWith("/media/")) { const f = S.media.get(p.slice(7)); return f ? servir(f, req) : new Response("", { status: 404 }); }
      if (p.startsWith("/ejs/")) {
        const base = o.ejsDir(); if (!base) return new Response("", { status: 404 });
        const f = path.resolve(base, "." + p.slice(4));
        if (!f.startsWith(path.resolve(base) + path.sep)) return new Response("", { status: 403 });
        return servir(f, req);
      }
      return new Response("", { status: 404 });
    });
  }
  const media = (f) => { for (const [k, v] of S.media) if (v === f) return `rbbseul://app/media/${k}`; const k = crypto.randomBytes(9).toString("hex"); S.media.set(k, f); return `rbbseul://app/media/${k}`; };

  // ---------- ce que la page doit savoir du fichier ----------
  function preparer(file) {
    S.media = new Map(); S.demande = false; S.ferme = false;
    const g = SEUL.genre(file), roots = o.roots();
    const I = { genre: g, titre: SEUL.titre(file), dossier: path.dirname(file), demander: SEUL.demanderAjout(file, roots, mem) };
    if (g === "video") {
      I.mpv = !!o.mpvBin(); I.media = media(file); I.reprise = mem.reprise(file);
      I.sous = SEUL.sousTitres(file).map((s) => ({ url: media(s.file), nom: path.basename(s.file), langue: s.langue }));
    } else if (g === "musique") {
      const m = SEUL.morceauxDuDossier(file);
      Object.assign(I, { album: m.album, artiste: m.artiste, index: m.index, pistes: m.pistes.map((t) => ({ titre: t.titre, url: media(t.file) })) });
      const c = SEUL.pochette(file); if (c) I.pochette = media(c);
    } else if (g === "jeu") {
      const e = SEUL.choisirEmulateur(file, roots); I.emu = { ...e };
      if (e.bios && e.bios.fichier) { I.emu.bios = { ...e.bios, url: media(e.bios.fichier) }; delete I.emu.bios.fichier; }
      if (e.type === "integre") {
        I.media = media(file);
        const local = o.ejsDir(); I.ejsLocal = !!local; I.ejs = local ? "rbbseul://app/ejs/data/" : "https://cdn.emulatorjs.org/stable/data/";
      }
      if (e.type === "console") { try { const CS = require("./serveur/consoles"); const id = CS.CONSOLES[e.sys].emus.find((x) => CS.findEmu(x, [])); if (id) I.emu.emuNom = CS.EMU[id].nom; } catch (_) {} }
    }
    S.file = file; S.info = I;
    return I;
  }

  const pageOk = (e) => !!(S.wc && e.sender === S.wc);
  const ipc = electron.ipcMain;
  ipc.handle("seul:info", (e) => (pageOk(e) ? S.info : null));
  ipc.handle("seul:pos", (e, pos, dur) => { if (pageOk(e) && S.info && S.info.genre === "video") mem.retenir(S.file, pos, dur); return true; });
  ipc.handle("seul:video", async (e) => {
    if (!pageOk(e) || !S.info || S.info.genre !== "video") return { ok: false };
    const file = S.file, rep = mem.reprise(file);
    const j = o.mpvJouer(file, { titre: S.info.titre, genre: "film", seul: true, start: rep ? rep.pos : 0 });
    S.mpv = j;
    if (rep) setTimeout(() => o.mpvSend(["show-text", `Reprise à ${Math.floor(rep.pos / 60)} min ${String(Math.floor(rep.pos % 60)).padStart(2, "0")}`, 3500]), 1800);
    const r = await j.fin;
    if (S.mpv === j) S.mpv = null;
    if (r && r.ok && r.dur) mem.retenir(file, r.eof ? 0 : r.pos, r.dur);
    return { ok: !!(r && r.ok), complet: !!(r && r.code === 42), err: r && r.err };
  });
  ipc.handle("seul:console", (e) => new Promise((resolve) => {
    if (!pageOk(e) || !S.info || !S.info.emu || S.info.emu.type !== "console") return resolve({ ok: false });
    let r; try { const CS = require("./serveur/consoles"); CS.setBundled(o.emusDir()); r = CS.launch(S.info.emu.sys, S.file, o.roots(), (l, m) => log(l, m)); } catch (er) { r = { ok: false, err: String(er) }; }
    if (!r.ok || !r.proc) return resolve({ ok: !!r.ok, err: r.err });
    S.emu = r.proc;
    r.proc.on("exit", () => { if (S.emu === r.proc) S.emu = null; resolve({ ok: true }); });
    r.proc.on("error", (er) => resolve({ ok: false, err: String(er) }));
  }));
  ipc.handle("seul:fin", (e, a) => {
    if (!pageOk(e)) return false;
    if (a && a.jamais) mem.nePlusDemander(true);
    if (a && a.ajouter && S.file) { const d = path.dirname(S.file); mem.ajouterDossier(d); try { o.ajouterRacine(d); } catch (_) {} log("dossier ajouté à la bibliothèque :", d); }
    fermer();
    return true;
  });
  ipc.handle("seul:complet", (e) => { if (!pageOk(e)) return false; arreter(); if (S.dessus) fermer(); else { const w = S.win; S.ferme = true; S.win = null; S.wc = null; o.ouvrirComplet(); setTimeout(() => { try { w && w.destroy(); } catch (_) {} }, 400); } return true; });

  function arreter() {
    if (S.mpv) { try { S.mpv.kill(); } catch (_) {} S.mpv = null; }
    if (S.emu) { try { S.emu.kill(); } catch (_) {} S.emu = null; }
  }
  // fermer le lecteur : seul, il ferme l'appli ; par-dessus Rembobine, il laisse la médiathèque
  function fermer() {
    arreter();
    if (S.dessus) { const w = o.mainWin(); try { if (w && S.view) w.contentView.removeChildView(S.view); } catch (_) {} try { S.view && S.view.webContents.close(); } catch (_) {} S.view = null; S.wc = null; S.dessus = false; try { w && w.webContents.focus(); } catch (_) {} return; }
    S.ferme = true; const w = S.win; S.win = null; S.wc = null;
    try { w && w.destroy(); } catch (_) {}
    app.quit();
  }

  const webPrefs = () => ({ preload: path.join(__dirname, "preload_seul.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, autoplayPolicy: "no-user-gesture-required" });
  // la page ne quitte jamais rbbseul://app/seul.html, n'ouvre aucune fenêtre
  function garder(wc) {
    const stay = (e, url) => { if (!/^rbbseul:\/\/app\/seul\.html/.test(url)) e.preventDefault(); };
    wc.on("will-navigate", stay); wc.on("will-redirect", stay);
    wc.on("will-attach-webview", (e) => e.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "F11" && S.win) { S.win.setFullScreen(!S.win.isFullScreen()); e.preventDefault(); } });
  }

  // ---------- ouvrir un fichier : fenêtre minimale, ou par-dessus Rembobine déjà ouvert ----------
  function ouvrir(file, cible) {
    arreter();
    preparer(file);
    log("ouverture", S.info.genre, path.basename(file));
    if (cible === "dessus") {
      const w = o.mainWin(); if (!w) return ouvrir(file, "fenetre");
      if (!S.view) {
        S.view = new electron.WebContentsView({ webPreferences: webPrefs() });
        S.view.setBackgroundColor("#08090c");
        w.contentView.addChildView(S.view);
        const cale = () => { try { const b = w.getContentBounds(); S.view && S.view.setBounds({ x: 0, y: 0, width: b.width, height: b.height }); } catch (_) {} };
        cale(); w.on("resize", cale);
        garder(S.view.webContents);
      }
      S.dessus = true; S.wc = S.view.webContents;
      S.wc.loadURL("rbbseul://app/seul.html");
      if (w.isMinimized()) w.restore(); w.show(); w.focus(); S.wc.focus();
      return;
    }
    if (S.win) { S.wc.loadURL("rbbseul://app/seul.html"); if (S.win.isMinimized()) S.win.restore(); S.win.show(); S.win.focus(); return; }
    const win = new electron.BrowserWindow({ width: 1280, height: 760, minWidth: 480, minHeight: 320, backgroundColor: "#08090c", title: S.info.titre || "Rembobine", show: false,
      autoHideMenuBar: true, icon: path.join(__dirname, "icon.png"), webPreferences: webPrefs() });
    win.removeMenu();
    S.win = win; S.wc = win.webContents; garder(S.wc);
    win.once("ready-to-show", () => { win.show(); win.maximize(); });
    // la croix : d'abord la petite question (une fois), puis on ferme vraiment
    win.on("close", (e) => {
      if (S.ferme || S.win !== win) return;
      if (S.info && S.info.demander && !S.demande) { e.preventDefault(); S.demande = true; try { win.webContents.send("seul:fermer"); } catch (_) {} return; }
      S.ferme = true; arreter();
    });
    win.on("closed", () => { if (S.win === win) { S.win = null; S.wc = null; } });
    S.wc.loadURL("rbbseul://app/seul.html");
  }

  return {
    protocole, ouvrir, mem,
    ouvert: () => !!S.win,
    dessus: () => S.dessus,
    stop: arreter,
    dossiers: () => mem.dossiers()
  };
};
module.exports.servir = servir;
