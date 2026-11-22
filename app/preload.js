// Pont entre le logiciel Rembobine (page) et l'ordinateur : seulement ces quelques fonctions.
const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("gamebox", {
  app: true,
  info: () => ipcRenderer.invoke("gbx:info"),
  // maison : la progression du module gardée par le serveur de la maison (le module prend la plus récente)
  ouvrirModule: (args, maison) => ipcRenderer.invoke("gbx:module-lancer", args, maison),
  // préparer le module à l'avance (caché, en pause) pour qu'il s'ouvre par un simple fondu
  preparerModule: (args) => ipcRenderer.invoke("gbx:module-preparer", args),
  // le module est à l'écran (« visible ») : la page retire sa petite cassette d'attente
  surModule: (cb) => { if (typeof cb === "function") ipcRenderer.on("gbx:module-etat", (e, s) => cb(String(s))); },
  // après un plantage du module : le relancer en mode simplifié (rendu compatible, qualité économie)
  moduleSimple: (on) => ipcRenderer.invoke("gbx:module-simple", !!on),
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
  // « Lecteur par défaut » (Paramètres) : etat() → { possible, plat, etat: { video, musique, jeu } } ; faire(genre, oui/non)
  lecteurDefaut: { etat: () => ipcRenderer.invoke("gbx:defaut"), faire: (g, on) => ipcRenderer.invoke("gbx:defautFaire", String(g), !!on) },
  onMpvPos: (cb) => { if (typeof cb === "function") ipcRenderer.on("mpv:pos", (e, s) => cb({ pos: Number(s && s.pos) || 0, dur: Number(s && s.dur) || 0 })); }
});
