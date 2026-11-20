// Pont minimal pour la version intégrée du module 3D (app/monde3d_web.js) : le jeu peut seulement envoyer ses
// messages (« pret », « visible », « retour », « quitter »…) à l'appli. Rien d'autre.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("rbbHote", {
  ev: (s) => { if (typeof s === "string" && s.length < 2500000) ipcRenderer.send("m3d:web", s); }
});
