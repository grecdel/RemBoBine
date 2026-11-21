// Pont du « lecteur seul » (app/lecteur/seul.html) : seulement ce qu'il faut pour lire LE fichier ouvert.
// La page ne voit jamais de chemin à ouvrir elle-même : les fichiers lui sont servis par Rembobine (rbbseul://app/media/…).
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("rbbSeul", {
  info: () => ipcRenderer.invoke("seul:info"),
  // vidéo : le lecteur Rembobine (mpv) ; la promesse se résout quand il se ferme ({ ok, complet })
  video: () => ipcRenderer.invoke("seul:video"),
  // jeu d'une console récente : son vrai émulateur ; résolue à sa fermeture
  console: () => ipcRenderer.invoke("seul:console"),
  // position de lecture (lecteur intégré), pour la reprise
  pos: (pos, dur) => ipcRenderer.invoke("seul:pos", Number(pos) || 0, Number(dur) || 0),
  // fin : { ajouter: ajouter le dossier à la bibliothèque, jamais: ne plus demander }
  fin: (o) => ipcRenderer.invoke("seul:fin", { ajouter: !!(o && o.ajouter), jamais: !!(o && o.jamais) }),
  complet: () => ipcRenderer.invoke("seul:complet"),
  onFermer: (cb) => { if (typeof cb === "function") ipcRenderer.on("seul:fermer", () => cb()); }
});
