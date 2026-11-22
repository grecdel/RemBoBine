// Pont minimal pour la version intégrée du module (app/module_web.js) : il peut seulement envoyer ses
// messages (« pret », « visible », « retour », « quitter »…) à l'appli. Rien d'autre.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("rbbHote", {
  ev: (s) => { if (typeof s === "string" && s.length < 2500000) ipcRenderer.send("gbx:module-web", s); }
});
