// Pont entre le logiciel Rembobine (page) et l'ordinateur : seulement ces quelques fonctions.
const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("gamebox", {
  app: true,
  info: () => ipcRenderer.invoke("gbx:info"),
  // maison : la progression du module gardée par le serveur de la maison (la 3D prend la plus récente)
  launch3D: (args, maison) => ipcRenderer.invoke("gbx:launch3d", args, maison),
  // préparer la 3D à l'avance (cachée, en pause) pour qu'elle s'ouvre par un simple fondu
  prepare3D: (args) => ipcRenderer.invoke("gbx:prepare3d", args),
  // la 3D est à l'écran (« visible ») : la page retire sa petite cassette d'attente
  on3D: (cb) => { if (typeof cb === "function") ipcRenderer.on("m3d:etat", (e, s) => cb(String(s))); },
  // après un plantage de la 3D : la relancer en mode simplifié (rendu compatible, qualité économie)
  simple3D: (on) => ipcRenderer.invoke("gbx:simple3d", !!on),
  // « Quitter Rembobine »
  quit: () => ipcRenderer.invoke("gbx:quit"),
  tvOn: () => ipcRenderer.invoke("gbx:tvOn"),
  mpvCmd: (a) => ipcRenderer.invoke("gbx:mpvCmd", a),
  onCard: (cb) => { if (typeof cb === "function") ipcRenderer.on("nfc:card", (e, uid) => cb(String(uid))); },
  // lecture directe du lecteur de cartouches (Linux) : seulement quand la page en a besoin
  nfcLecture: (on) => ipcRenderer.invoke("gbx:nfcLecture", on === true),
  // o.startPct : où reprendre (en %) ; o.titre, o.sous, o.genre : ce qu'affiche l'interface de lecture ; le résultat
  // donne la position et la durée à la fermeture de mpv
  playExternal: (file, o) => { let p = ""; try { p = webUtils.getPathForFile(file); } catch (_) {} const t = (v) => (typeof v === "string" ? v.slice(0, 200) : ""); return ipcRenderer.invoke("gbx:mpv", p, o && typeof o === "object" ? { startPct: Number(o.startPct) || 0, titre: t(o.titre), sous: t(o.sous), genre: t(o.genre) } : undefined); },
  onMpvPos: (cb) => { if (typeof cb === "function") ipcRenderer.on("mpv:pos", (e, s) => cb({ pos: Number(s && s.pos) || 0, dur: Number(s && s.dur) || 0 })); }
});
