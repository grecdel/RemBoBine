// Test du lecteur de PDF embarqué (pdf.js, ci/pdfjs.sh), servi par le serveur de la maison : node app/serveur/test_pdfjs.js
//  - /pdfjs/… est servi à tous (code public, comme /ejs/), même sans appairage ;
//  - pas de sortie du dossier pdfjs (« .. » codé, octet nul) ; un fichier absent répond 404 ;
//  - le reste demande toujours l'appairage.
"use strict";
process.env.REMBOBINE_FICHES = "0";   // aucun internet pendant les essais (fiches cherchées sur internet : activées par défaut)
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const { createServer } = require("./serveur");

const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-pdfjs-"));
const WEB = path.join(T, "web"), M = path.join(T, "media");
fs.mkdirSync(path.join(WEB, "pdfjs", "cmaps"), { recursive: true }); fs.mkdirSync(M, { recursive: true });
fs.writeFileSync(path.join(WEB, "index.html"), "<!doctype html><title>Rembobine</title>");
fs.writeFileSync(path.join(WEB, "pdfjs", "pdf.min.js"), "window.pdfjsLib={getDocument(){}};");
fs.writeFileSync(path.join(WEB, "pdfjs", "cmaps", "UniJIS-UTF16-H.bcmap"), Buffer.from([1, 2, 3, 4]));
fs.writeFileSync(path.join(T, "secret.txt"), "MOT-DE-PASSE-SECRET");
// (les sons de démarrage par époque sont servis de la même façon : web/demarrage/<époque>.ogg)
fs.mkdirSync(path.join(WEB, "demarrage")); fs.writeFileSync(path.join(WEB, "demarrage", "chaumiere.ogg"), Buffer.from("OggS-essai"));

const PORT = 22000 + Math.floor(Math.random() * 900);
let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) ok++; else { ko++; console.log("ÉCHEC :", what); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// une page d'un autre site : ne passe pas pour l'écran de la TV (donc pas appairée)
function get(p, headers = { Origin: "https://ailleurs.example" }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PORT, path: p, method: "GET", headers }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(ch) }));
    });
    r.on("error", reject); r.end();
  });
}

(async () => {
  const S = createServer({ port: PORT, webDir: WEB, dataDir: path.join(T, "data"), mediaRoots: [M], mpv: "/nonexistent", retroarch: "/nonexistent", version: "test", voisins: false });
  await S.start(); await wait(300);
  try {
    const js = await get("/pdfjs/pdf.min.js");
    check(js.status === 200 && String(js.buf).includes("pdfjsLib"), "pdf.min.js servi sans appairage");
    check(/javascript/.test(js.headers["content-type"] || ""), "pdf.min.js en text/javascript");
    check(/max-age=604800/.test(js.headers["cache-control"] || ""), "pdf.js gardé une semaine en cache");
    const gz = await get("/pdfjs/pdf.min.js", { Origin: "https://ailleurs.example", "Accept-Encoding": "gzip" });
    check(gz.status === 200 && gz.headers["content-encoding"] === "gzip", "pdf.js compressé pour les téléphones");
    const cm = await get("/pdfjs/cmaps/UniJIS-UTF16-H.bcmap");
    check(cm.status === 200 && cm.buf.length === 4, "tables de caractères (manuels japonais) servies");
    check((await get("/pdfjs/absent.js")).status === 404, "fichier absent : 404");
    for (const bad of ["/pdfjs/%2e%2e/%2e%2e/secret.txt", "/pdfjs/..%2f..%2fsecret.txt", "/pdfjs/x%00.js"]) {
      const r = await get(bad); check([401, 403, 404].includes(r.status), `pas de sortie du dossier pdfjs (${bad} → ${r.status})`);
      check(!String(r.buf).includes("MOT-DE-PASSE-SECRET"), `aucun fichier hors du dossier (${bad})`);
    }
    const dem = await get("/demarrage/chaumiere.ogg");
    check(dem.status === 200 && String(dem.buf) === "OggS-essai" && /audio\/ogg/.test(dem.headers["content-type"] || ""), "son de démarrage d'une époque servi sans appairage, en audio/ogg");
    check((await get("/demarrage/absent.ogg")).status === 404, "son de démarrage absent : 404");
    for (const bad of ["/demarrage/%2e%2e/%2e%2e/secret.txt", "/demarrage/..%2fsecret.ogg", "/demarrage/index.html"]) { const r = await get(bad); check(r.status !== 200 && !String(r.buf).includes("MOT-DE-PASSE-SECRET"), `rien d'autre que les sons sous /demarrage/ (${bad} → ${r.status})`); }
    check((await get("/api/library")).status === 401, "le reste demande toujours l'appairage");
  } finally {
    await S.stop?.(); fs.rmSync(T, { recursive: true, force: true });
  }
  console.log(ko ? `${ko} échec(s), ${ok} réussite(s)` : `OK : ${ok} vérifications du lecteur de PDF embarqué`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
