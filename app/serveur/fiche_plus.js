// Rembobine — « Plus d'infos » d'un film ou d'une série : de VRAIES informations, cherchées à la demande (première ouverture)
// sur Wikidata et Wikipédia, gardées sur le disque du serveur (fiches/plus/<id>.json, rafraîchies après 30 jours).
//   casting      : Wikidata P161 (P725 pour les voix d'un film d'animation), dans l'ordre de Wikidata, 20 au plus ;
//                  rôle : qualificatif P453 (ou P4633), sinon la section « Distribution » de l'article Wikipédia en français ;
//   voix         : les comédiens de la VERSION FRANÇAISE, lus dans la section « Distribution » de l'article Wikipédia en
//                  français (« * [[Brad Pitt]] (VF : [[X]] ; VQ : …) : Tyler Durden », modèle {{Doublage|VF=…}}) et, pour un
//                  film d'animation, dans la section « Voix françaises » (« pour » : la voix originale du même personnage) ;
//   realisation (P57), musique (P86), notes (P444 avec P447 ; TMDB si une clé est réglée), lieux de tournage (P915),
//   recompenses (P166, avec l'année), sortie (P577, en France si possible), pays (P495), studios (P272),
//   budget et recettes (P2130, P2142, avec la monnaie).
//   Chaque personne : photo (vignette de 250 px de Wikimedia Commons, P18 ou image de l'article, téléchargée une fois :
//   fiches/gens/<qid>.jpg), résumé (1 à 2 phrases de Wikipédia en français, sinon en anglais), lien vers l'article.
// Rien n'est inventé : un champ inconnu est absent. Mêmes règles que fiches.js (ses demandes à internet sont réutilisées :
// User-Agent, file d'attente par site, 429/Retry-After respectés), une demande à la fois ; rien n'est demandé si la
// recherche sur internet est coupée (Paramètres → Métadonnées, REMBOBINE_FICHES=0).
//
// Contrat (lu par la fiche du film de la page) — GET /api/fiche-plus/<id> :
//   { ok: true, id, maj, casting: [{ nom, role, photo, bio, wiki }], voix: [{ nom, pour, role, photo, bio, wiki }],
//     realisation: [{ nom, photo, bio, wiki }], musique: { nom, photo, bio, wiki }, notes: [{ source, valeur, pct }],
//     lieux: [texte], recompenses: [texte], sortie: texte, pays: [texte], studios: [texte], budget: texte, recettes: texte,
//     sources: ["Wikidata", "Wikipédia", "TMDB"] }
//   maj : date de la recherche (millisecondes). sortie, budget, recettes : textes prêts à afficher (« 15 octobre 1999
//   (États-Unis) », « 63 millions de dollars »). notes : source « Presse (Rotten Tomatoes) », valeur « 81 % », pct 81.
//   photo : adresse à ajouter devant celle du serveur, comme les jaquettes (/fiche-photo/<qid>.jpg?k=<signature>) :
//   la page l'affiche en <img> sans jeton. La vignette est téléchargée en arrière-plan juste après la recherche
//   (et tout de suite si la page la demande avant).
//   Échec : { ok: false, raison: "fiches coupées" | "introuvable" | "pas un film ni une série" | "rien trouvé" | "pas d'internet" }.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { imageType, core } = require("./fiches");
const { coverSig } = require("./bibliotheque");

const JOUR = 86400000;
const FRAIS = 30 * JOUR;                  // une fiche trouvée est rafraîchie après 30 jours
const RIEN = JOUR;                        // rien trouvé : nouvel essai le lendemain
const PANNE = 10 * 60000;                 // site injoignable ou encombré pendant la recherche : nouvel essai 10 min après
const MAX_CAST = 20, MAX_VOIX = 20, MAX_PRIX = 8, MAX_LIEUX = 8, MAX_STUDIOS = 6;
const QID = /^Q[1-9]\d{0,11}$/;
const PHOTO = /^\/fiche-photo\/(Q[1-9]\d{0,11})\.jpg$/;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const FRANCE = "Q142", MONDE = "Q13780930";
// monnaies courantes, au pluriel (les autres : leur nom sur Wikidata)
const MONNAIES = { Q4917: "dollars", Q4916: "euros", Q25224: "livres sterling", Q8146: "yens", Q181429: "francs", Q1104069: "dollars canadiens",
  Q259502: "dollars australiens", Q25344: "francs suisses", Q80524: "roupies indiennes", Q39099: "yuans", Q202040: "wons", Q41044: "roubles", Q122922: "couronnes suédoises" };
// notes : sites connus → nom court, et s'il s'agit de la presse ou des spectateurs
const SITES = { Q105584: ["Rotten Tomatoes", "Presse"], Q150248: ["Metacritic", "Presse"], Q37312: ["IMDb", "Spectateurs"] };
const enc = encodeURIComponent;
const isQ = (x) => QID.test(String(x || ""));

// ===================================================================================================================
// Lecture de la section « Distribution » d'un article de Wikipédia (texte wiki)
// ===================================================================================================================
// modèles courants dans une distribution : {{M.|Patate}} → « M. Patate », {{Jr.}} → « Jr. », {{lang|en|texte}} → « texte »
const TITRES = { "m.": "M.", mme: "Mme", mlle: "Mlle", mmes: "Mmes", mgr: "Mgr", dr: "Dr", me: "Me", pr: "Pr", st: "St", ste: "Ste" };
const MOTS = { "jr.": "Jr.", jr: "Jr.", "sr.": "Sr.", sr: "Sr.", "1er": "1er", "1re": "1re", er: "er", re: "re", e: "e", ",": ",", "!": "|", vf: "VF", vq: "VQ", vo: "VO", vfb: "VFB" };
function params(body) {
  // découpe « a|b=c|[[x|y]] » aux barres qui ne sont ni dans un lien, ni dans un modèle
  const out = [], named = {}; let cur = "", d = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i], two = body.slice(i, i + 2);
    if (two === "[[" || two === "{{") { d++; cur += two; i++; continue; }
    if ((two === "]]" || two === "}}") && d > 0) { d--; cur += two; i++; continue; }
    if (c === "|" && d === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  const pos = [];
  for (const x of out) { const m = /^\s*([\w .-]+?)\s*=([\s\S]*)$/.exec(x); if (m && !/\[\[/.test(m[1])) named[m[1].trim()] = m[2].trim(); else pos.push(x.trim()); }
  return { pos, named };
}
function modele(body) {
  const { pos, named } = params(body), nom = String(pos.shift() || "").trim(), k = nom.toLowerCase();
  if (TITRES[k]) return TITRES[k] + (pos[0] ? " " + pos[0] : "");
  if (k in MOTS) return MOTS[k] + (pos[0] ? " " + pos[0] : "");
  if (/^\d+(e|er|re)$/.test(k)) return nom + (pos[0] ? " " + pos[0] : "");
  if (k === "lang" || k === "langue") return pos[pos.length - 1] || named.texte || "";
  if (k === "nobr" || k === "nowrap" || k === "petit" || k === "small" || k === "souligner" || k === "italique" || k === "date" || k === "date-") return pos.join(" ");
  if (k === "lien") return named.texte || named.fr || pos[0] || "";
  if (k === "citation" || k === "citation bloc") return "« " + (pos[0] || "") + " »";
  if (k === "s-" || k === "s") return (pos[0] || "") + "e siècle";
  return "";   // les autres (notes, références, mise en forme) : retirés
}
// le texte simple d'un bout de texte wiki
function clean(s) {
  let t = String(s || "").replace(/<!--[\s\S]*?-->/g, "").replace(/<ref\b[^>]*\/>/gi, "").replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "");
  t = t.replace(/\[\[(?:Fichier|File|Image|Catégorie|Category):[^\]]*\]\]/gi, "");
  for (let i = 0; i < 40 && /\{\{[^{}]*\}\}/.test(t); i++) t = t.replace(/\{\{([^{}]*)\}\}/g, (a, b) => modele(b));
  t = t.replace(/\{\{|\}\}/g, "");
  t = t.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, (a, b) => b.replace(/^:/, "").replace(/#.*$/, ""));
  t = t.replace(/\[(?:https?:)?\/\/\S+\s+([^\]]+)\]/g, "$1").replace(/\[(?:https?:)?\/\/[^\]]*\]/g, "");
  t = t.replace(/'''?/g, "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "");
  t = t.replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return t.replace(/[  \s]+/g, " ").replace(/\(\s*\)/g, "").replace(/\s+([,.;])/g, "$1").trim();
}
// rôle affiché : sans les longues remarques entre parenthèses (« (récurrent saison 2, principal saisons 3 à 5) »)
function cleanRole(s) {
  const t = clean(s).replace(/\s*\(([^()]*)\)/g, (a, b) => (b.length > 30 ? "" : a));
  return t.replace(/\s+/g, " ").replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "").slice(0, 120).trim();
}
// la première « : » (ou un tiret long) qui n'est ni dans un lien, ni dans un modèle, ni dans une parenthèse
function coupe(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i], two = s.slice(i, i + 2);
    if (two === "[[" || two === "{{") { d++; i++; continue; }
    if ((two === "]]" || two === "}}") && d > 0) { d--; i++; continue; }
    if (c === "(" || c === "[") d++;
    else if ((c === ")" || c === "]") && d > 0) d--;
    else if (d === 0 && (c === ":" || c === "—" || c === "–") && /\s/.test(s[i - 1] || " ") && /\s|$/.test(s[i + 1] || "")) return [s.slice(0, i), s.slice(i + 1)];
  }
  return [s, ""];
}
// enlève les parenthèses (et ce qu'elles contiennent) qui ne sont ni dans un lien ni dans un modèle
function sansParentheses(s) {
  let out = "", d = 0, b = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i], two = s.slice(i, i + 2);
    if (two === "[[" || two === "{{") { b++; if (!d) out += two; i++; continue; }
    if ((two === "]]" || two === "}}") && b > 0) { b--; if (!d) out += two; i++; continue; }
    if (!b && c === "(") { d++; continue; }
    if (!b && c === ")" && d > 0) { d--; continue; }
    if (!d) out += c;
  }
  return out;
}
// une personne citée : le premier lien vers un article (cible, texte), sinon le texte
function personne(s) {
  const raw = String(s || "").replace(/<\/?small>/gi, " ").replace(/<[^>]+>/g, " ").trim();
  if (!raw) return null;
  const nom = clean(raw).replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "").trim();
  if (!nom || nom.length > 80 || !/\p{L}/u.test(nom)) return null;
  const groupe = /,|\s(et|&)\s/.test(nom);
  const m = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/.exec(raw);
  let lien = "";
  if (m && !/^\s*:|^\s*(Fichier|File|Image|Catégorie|Category|Wikt|Wiktionnaire)\s*:/i.test(m[1])) lien = m[1].replace(/#.*$/, "").replace(/_/g, " ").trim();
  return { nom, lien, groupe };
}
// les comédiens de la version française dans un bout de texte « VF : [[X]] puis Y (saison 5) »
function nomsVF(seg) {
  const s = sansParentheses(String(seg || "").replace(/<\/?small>/gi, " "));
  const parts = []; let cur = "", d = 0;
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "[[" || two === "{{") { d++; cur += two; i++; continue; }
    if ((two === "]]" || two === "}}") && d > 0) { d--; cur += two; i++; continue; }
    if (d === 0) {
      const m = /^(\s+(puis|et|ou|ainsi que)\s+|\s*[\/,;]\s*)/i.exec(s.slice(i));
      if (m) { parts.push(cur); cur = ""; i += m[0].length - 1; continue; }
    }
    cur += s[i];
  }
  parts.push(cur);
  const out = [];
  for (const x of parts) {
    const p = personne(x); if (!p || p.groupe) continue;
    // un nom, pas une remarque (« non crédité », « en alternance », « 2e voix ») : il commence par une majuscule
    if (!p.lien && (!/^\p{Lu}/u.test(p.nom) || /\d|crédit|alternance|voix|version|saison|épisode/i.test(p.nom) || p.nom.split(" ").length > 5)) continue;
    out.push({ nom: p.nom, lien: p.lien });
    if (out.length >= 2) break;
  }
  return out;
}
const MARQUE_VF = /(\{\{\s*VF[BFC]?\s*\}\}|\bVF[BFC]?\b|\bV\.\s?F\.|voix fran[çc]aises?|version fran[çc]aise)\s*:\s*/gi;
const MARQUE_AUTRE = /^(\{\{\s*V[QO]\s*\}\}|\bV[QO]\b|\bVFQ\b|version qu[ée]b[ée]coise|voix qu[ée]b[ée]coises?|version originale)/i;
// les passages « VF : … » d'une ligne, jusqu'au « ; », à « VQ : » ou à la parenthèse qui se ferme
function segmentsVF(s) {
  const out = []; let m; MARQUE_VF.lastIndex = 0;
  while ((m = MARQUE_VF.exec(s))) {
    let i = m.index + m[0].length, d = 0, b = 0; const start = i;
    for (; i < s.length; i++) {
      const c = s[i], two = s.slice(i, i + 2);
      if (two === "[[" || two === "{{") { b++; i++; continue; }
      if ((two === "]]" || two === "}}") && b > 0) { b--; i++; continue; }
      if (b) continue;
      if (c === "(") d++;
      else if (c === ")") { if (d === 0) break; d--; }
      else if (d === 0 && c === ";") break;
      else if (d === 0 && /\s/.test(s[i - 1] || " ") && MARQUE_AUTRE.test(s.slice(i))) break;
    }
    out.push(s.slice(start, i).replace(/\s+(et|,)\s*$/i, ""));
    MARQUE_VF.lastIndex = Math.max(i, MARQUE_VF.lastIndex);
  }
  return out;
}
// une ligne « * [[Acteur]] (VF : [[Voix]]) : Rôle »
function parseLigne(line) {
  let s = String(line || "").replace(/^\*\s*/, "");
  // « … : dernier rôle}} » (fin d'un modèle {{colonnes|…}} sur la même ligne)
  for (let k = 0; k < 3 && /\}\}\s*$/.test(s) && (s.match(/\}\}/g) || []).length > (s.match(/\{\{/g) || []).length; k++) s = s.replace(/\}\}\s*$/, "");
  s = s.replace(/<ref\b[^>]*\/>/gi, "").replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "");
  const vf = [];
  // modèle {{Doublage|VF=…|VF_lien=…|VF2=…}} (lien par défaut : le nom ; « non » : pas de lien)
  s = s.replace(/\{\{\s*[Dd]oublage\s*\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}/g, (a, body) => {
    const { named } = params(body);
    for (const k of ["VF", "VF2"]) {
      const nom = clean(named[k] || ""); if (!nom) continue;
      const l = String(named[k + "_lien"] || "").trim();
      vf.push({ nom, lien: /^non$/i.test(l) ? "" : clean(l) || nom });
    }
    return " ";
  });
  const [gauche, droite] = coupe(s);
  for (const seg of segmentsVF(gauche)) vf.push(...nomsVF(seg));
  const acteur = personne(sansParentheses(gauche));
  if (!acteur) return null;
  const seen = new Set();
  return { acteur, role: cleanRole(droite), vf: vf.filter((v) => { const k = core(v.nom); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 2) };
}
// sous-partie de la distribution d'après son titre : vf (voix françaises), vo (voix originales), autre (québécoises…), ou rien
function genreTitre(t) {
  if (/qu[ée]b[ée]c|belg|suisse|canad|\bVQ\b|\bVFQ\b|allemand|espagnol|italien/i.test(t)) return "autre";
  if (/fran[cç]ais|\bVF\b|\bVFF\b|\bVFB\b/i.test(t)) return "vf";
  if (/originale|\bVO\b|anglais|am[ée]ricain|japonais/i.test(t)) return "vo";
  return "";
}
// toute la distribution d'un article : lignes « dist » (acteurs, avec leur VF), « vo » et « vf » (films d'animation)
function distribution(wikitext) {
  const t = String(wikitext || "").replace(/<!--[\s\S]*?-->/g, "");
  const out = { dist: [], vo: [], vf: [] };
  let stack = null;   // [[niveau, genre], …] dans la section « Distribution » ; null : ailleurs
  for (const ln of t.split("\n")) {
    const h = /^(={2,6})\s*(.*?)\s*\1\s*$/.exec(ln);
    if (h) {
      const lvl = h[1].length, title = clean(h[2]);
      if (lvl === 2) stack = /distribution|^voix\b|doublage|interpr[eè]tes/i.test(title) && !/technique/i.test(title) ? [[2, genreTitre(title) || "dist"]] : null;
      else if (stack) { while (stack.length > 1 && stack[stack.length - 1][0] >= lvl) stack.pop(); stack.push([lvl, genreTitre(title) || stack[stack.length - 1][1]]); }
      continue;
    }
    if (!stack || !/^\*(?!\*)/.test(ln)) continue;
    const g = stack[stack.length - 1][1]; if (g === "autre") continue;
    const L = parseLigne(ln); if (L) out[g].push(L);
  }
  return out;
}
// un personnage, pour comparer : sans accents, ni ponctuation, ni article (mais « (chant) » compte : « Nala enfant (chant) »)
const cle = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/^(le|la|les|l|un|une|des|the|a|an)\s+/, "");
// différentes façons d'écrire un personnage (« Buzz Lightyear ([[Buzz l'Éclair]]) » → « buzz lightyear buzz l eclair », « buzz lightyear », « buzz l eclair »)
function variantes(role) {
  const r = String(role || ""), out = [];
  const add = (x) => { const k = cle(x); if (k && !out.includes(k)) out.push(k); };
  add(r); add(r.replace(/\s*\([^()]*\)/g, ""));
  for (const m of r.matchAll(/\(([^()]*)\)/g)) add(m[1]);
  for (const x of r.split(/\s+\/\s+/)) { add(x); add(x.replace(/\s*\([^()]*\)/g, "")); }
  return out;
}
// les voix françaises d'un article (et qui elles doublent)
function voixFrancaises(d) {
  const exact = new Map(), large = new Map();
  for (const L of d.vo) {
    if (!L.acteur || L.acteur.groupe || !L.role) continue;
    const v = variantes(L.role);
    if (v[0] && !exact.has(v[0])) exact.set(v[0], L.acteur.nom);
    for (const k of v.slice(1)) if (!large.has(k)) large.set(k, L.acteur.nom);
  }
  const pour = (role) => { const v = variantes(role); if (!v.length) return ""; return exact.get(v[0]) || large.get(v[0]) || v.slice(1).map((k) => exact.get(k) || large.get(k)).find(Boolean) || ""; };
  const out = [], seen = new Set();
  const add = (x) => { const k = core(x.nom) + "|" + cle(x.role || ""); if (!core(x.nom) || seen.has(k) || out.length >= MAX_VOIX) return; seen.add(k); out.push(x); };
  for (const L of d.dist) for (const v of L.vf) add({ nom: v.nom, lien: v.lien, pour: L.acteur && !L.acteur.groupe ? L.acteur.nom : "", role: L.role });
  for (const L of d.vf) if (L.acteur && !L.acteur.groupe) add({ nom: L.acteur.nom, lien: L.acteur.lien, pour: pour(L.role), role: L.role });
  return out;
}

// ===================================================================================================================
// Petits outils : dates, sommes d'argent, notes, résumés
// ===================================================================================================================
function dateFr(v) {
  const m = /^[+]?(\d{4,})-(\d\d)-(\d\d)/.exec((v && v.time) || ""); if (!m) return "";
  const p = Number(v.precision) || 11, y = String(Number(m[1])), mo = Number(m[2]), d = Number(m[3]);
  if (p >= 11 && mo && d) return `${d === 1 ? "1er" : d} ${MOIS[mo - 1]} ${y}`;
  if (p >= 10 && mo) return `${MOIS[mo - 1]} ${y}`;
  return y;
}
const tri = (v) => Date.parse(String((v && v.time) || "").replace(/^\+/, "").replace(/-00/g, "-01")) || 0;
const arrondi = (x) => { const d = x < 10 ? 2 : x < 100 ? 1 : 0; return Math.round(x * 10 ** d) / 10 ** d; };
// « 63 millions de dollars », « 1,2 milliard d'euros », « 850 000 francs » ; monnaie peu courante : « 35 millions (peso mexicain) »
function argent(v, nomMonnaie) {
  const n = Math.abs(Number(v && v.amount)); if (!n || !Number.isFinite(n)) return "";
  const q = (/\/(Q\d+)$/.exec((v && v.unit) || "") || [])[1];
  const connue = MONNAIES[q] || "", autre = connue ? "" : (nomMonnaie && nomMonnaie(q)) || ""; if (!connue && !autre) return "";
  const suite = connue ? (/^[aeiouyéèêh]/i.test(connue) ? " d'" : " de ") + connue : ` (${autre})`;
  for (const [s, mot] of [[1e9, "milliard"], [1e6, "million"]]) if (n >= s) { const x = arrondi(n / s); return `${String(x).replace(".", ",")} ${mot}${x >= 2 ? "s" : ""}${suite}`; }
  return `${Math.round(n).toLocaleString("fr-FR")}${connue ? " " + connue : suite}`;
}
// « 81% » → 81 ; « 8.8/10 » → 88 ; « 67/100 » → 67 ; un avis en mots (« besonders wertvoll ») : rien
function note(s) {
  const t = String(s || "").trim().replace(",", ".");
  let m = /^(\d{1,3}(?:\.\d+)?)\s*%$/.exec(t);
  if (m) { const x = Number(m[1]); return x <= 100 ? { valeur: `${String(x).replace(".", ",")} %`, pct: Math.round(x), rang: 3 } : null; }
  m = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(t);
  if (m) { const a = Number(m[1]), b = Number(m[2]); if (!b || a > b) return null; return { valeur: `${String(a).replace(".", ",")}/${String(b).replace(".", ",")}`, pct: Math.round(a / b * 100), rang: b === 100 ? 2 : 1 }; }
  return null;
}
// résumé d'une personne : 1 ou 2 phrases, 300 caractères au plus (sans la prononciation ni « [réf. nécessaire] »)
const PHON = /[ˈˌːəɐɑɒæɔɛɜɪʊʌɡŋɲʃʒθðɹɾʁχɣʔɚɝ̃]/;
function bioCourte(txt) {
  let t = String(txt || "").replace(/\s*\[[^\]\n]*\]/g, "")   // [tɑm hæŋks], [réf. nécessaire]
    .replace(/\s*\(([^()]*)\)/g, (a, b) => (/prononc|écouter|API\b/i.test(b) || PHON.test(b) ? "" : a))   // (prononcé …), (/ˈdeɪvɪd/)
    .replace(/\s*\/[^/\n]{1,80}\/(?=[\s,.;:)]|$)/g, (a) => (PHON.test(a) ? "" : a))   // /ˈænə ɡʌn/
    .replace(/\(\s*[,;]?\s*\)/g, "");
  // un paragraphe est aussi une fin de phrase (« … acteur français » puis, à la ligne, « Comédien de… »)
  t = t.split(/\n+/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean).map((x) => (/[.!?…»]$/.test(x) ? x : x + ".")).join("\n");
  if (!t) return "";
  const phrases = []; let cur = "";
  const ABR = /(?:^|\s)(?:[A-Z]|M|Mme|Mlle|Dr|St|Ste|Mgr|Jr|Sr|J\.-C|av|apr|cf|etc|vol|no|n°|env|ca)\.$/;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "\n") { if (cur.trim()) phrases.push(cur.trim()); cur = ""; continue; }
    cur += t[i];
    if (/[.!?…]/.test(t[i]) && /\s/.test(t[i + 1] || "") && /[\p{Lu}«"(]/u.test(t[i + 2] || "") && !ABR.test(cur)) { phrases.push(cur.trim()); cur = ""; }
  }
  if (cur.trim()) phrases.push(cur.trim());
  for (let k = 0; k < phrases.length; k++) phrases[k] = phrases[k].replace(/\s+([,.;])/g, "$1");
  let out = phrases[0] || "";
  if (out.length > 300) { const c = out.slice(0, 297); out = c.slice(0, Math.max(c.lastIndexOf(" "), 200)).replace(/[\s,;:]+$/, "") + "…"; }
  else if (phrases[1] && (out + " " + phrases[1]).length <= 300) out += " " + phrases[1];
  return out;
}
function safeEq(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
const titreNorm = (t) => { const s = String(t || "").replace(/_/g, " ").replace(/#.*$/, "").replace(/\s+/g, " ").trim(); return s ? s[0].toUpperCase() + s.slice(1) : ""; };
const sansHomonymie = (t) => String(t || "").replace(/\s*\([^()]*\)\s*$/, "").trim();

// ===================================================================================================================
// Le module
// ===================================================================================================================
function createFichePlus(o) {
  const dir = path.join(o.dataDir, "fiches", "plus"), gens = path.join(o.dataDir, "fiches", "gens");
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(gens, { recursive: true });
  const log = o.log || (() => {}), on = o.on || (() => true), lib = o.lib || (() => ({ byId: new Map(), items: [] }));
  const FI = o.fiches, net = () => (FI && FI.outils) || null;
  const sig = (q) => coverSig("gens:" + q);
  const encours = new Map();   // id → recherche en cours (deux demandes en même temps : une seule recherche)
  let file = Promise.resolve();   // les recherches, l'une après l'autre
  // vignettes : adresses connues, téléchargements (un à la fois), échecs (qid → prochain essai : dans 10 min si le site
  // était encombré ou injoignable, demain si l'image manquait ou n'en était pas une — ou si le site a eu une erreur passagère)
  const sources = new Map(), jobs = new Map(), echecs = new Map();
  const bloque = (q) => { const e = echecs.get(q); return !!e && e.jusqua > Date.now(); };
  let chaine = Promise.resolve();

  const fichierFiche = (id) => path.join(dir, (/^[\w-]{1,80}$/.test(id) ? id : crypto.createHash("sha1").update(String(id)).digest("hex")) + ".json");
  const fichierPhoto = (q) => path.join(gens, q + ".jpg");
  const lire = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (_) { return null; } };
  const ecrire = (f, v) => { try { fs.writeFileSync(f + ".tmp", JSON.stringify(v)); fs.renameSync(f + ".tmp", f); } catch (_) {} };
  const existe = (f) => { try { return fs.statSync(f).size > 0; } catch (_) { return false; } };

  // ---------- vignettes des personnes ----------
  function photoUrls(B, name, thumb) {
    const n = String(name || "").replace(/ /g, "_").trim(); if (!n || /\.svg$/i.test(n)) return [];
    const h = crypto.createHash("md5").update(n).digest("hex"), ext = /\.(tiff?|pdf|djvu)$/i.test(n) ? ".jpg" : "";
    // taille standard de Wikimedia (250 px : les tailles inventées sont refusées), l'adresse donnée par Wikipédia, puis Commons
    return [...new Set([`${B.upload}/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${enc(n)}/250px-${enc(n)}${ext}`, thumb, `${B.commons}/wiki/Special:FilePath/${enc(n)}?width=250`].filter(Boolean))];
  }
  // → true (gardée), false (pas d'image), "plus tard" (site encombré ou injoignable)
  async function telecharge(q) {
    if (existe(fichierPhoto(q))) return true;
    const N = net(); if (!N || !on()) return "plus tard";
    const st0 = FI.stats ? FI.stats() : null;
    for (const u of sources.get(q) || []) {
      const buf = await FI.download(u).catch(() => null);
      if (!buf || !imageType(buf) || buf.length > 3e6) continue;
      const f = fichierPhoto(q);
      try { fs.writeFileSync(f + ".tmp", buf); fs.renameSync(f + ".tmp", f); return true; } catch (_) { return "plus tard"; }
    }
    const st = st0 && FI.stats();
    return st && (st.limited > st0.limited || st.fail > st0.fail) ? "plus tard" : false;
  }
  // la vignette d'une personne : déjà là, ou téléchargée (une à la fois, dans l'ordre de la fiche)
  function assure(q) {
    if (existe(fichierPhoto(q))) return Promise.resolve(true);
    if (!on() || bloque(q) || !sources.has(q)) return Promise.resolve(false);
    if (jobs.has(q)) return jobs.get(q);
    const r = chaine.then(() => telecharge(q)).catch(() => "plus tard");
    chaine = r.then(() => {}, () => {});
    const p = r.then((x) => {
      jobs.delete(q);
      if (x === true) echecs.delete(q); else if (on()) echecs.set(q, { jusqua: Date.now() + (x === false ? JOUR : PANNE), absente: x === false });
      return x === true;
    });
    jobs.set(q, p);
    return p;
  }
  const photoDispo = (q) => isQ(q) && (existe(fichierPhoto(q)) || (on() && sources.has(q) && !bloque(q)));

  // ---------- la recherche ----------
  async function construire(it) {
    const N = net(); if (!N) return { panne: true };
    const B = N.bases, kind = it.kind, rec = ((FI.db && FI.db()) || {})[it.id] || {};
    const year = Number((it.pub || {}).year) || 0, st0 = FI.stats ? FI.stats() : { fail: 0, limited: 0 };
    let panne = false;
    const get = async (u, opt) => { const r = await N.get(u, opt); if (r == null) panne = true; return r; };
    const entites = async (ids, props) => {
      const out = {}; ids = [...new Set(ids)].filter(isQ);
      for (let i = 0; i < ids.length; i += 50) {
        const s = await get(`${B.wikidata}/w/api.php?action=wbgetentities&ids=${ids.slice(i, i + 50).join("%7C")}&props=${enc(props)}&languages=fr%7Cmul%7Cen&sitefilter=frwiki%7Cenwiki&format=json`);
        Object.assign(out, (s && s.entities) || {});
      }
      return out;
    };
    // 1. l'élément Wikidata du film : celui trouvé par les fiches (fiches.js), sinon une recherche d'après le titre
    let e = null;
    if (isQ(rec.wd)) { e = (await entites([rec.wd], "claims|sitelinks|labels"))[rec.wd]; if (e && (e.missing !== undefined || !e.claims)) e = null; }
    if (!e && !panne) e = await N.wdFind(it.title, year, kind);
    if (!e) { const st = FI.stats ? FI.stats() : st0; return { panne: panne || st.fail > st0.fail || st.limited > st0.limited }; }
    const cl = (P) => (((e.claims || {})[P]) || []).filter((s) => s.rank !== "deprecated" && s.mainsnak && s.mainsnak.datavalue);
    const prefer = (L) => { const p = L.filter((s) => s.rank === "preferred"); return p.length ? p : L; };
    const val = (s) => s.mainsnak.datavalue.value;
    const qv = (s) => { const v = val(s); return v && v.id; };
    const qual = (s, P) => ((((s.qualifiers || {})[P]) || []).filter((x) => x.datavalue)).map((x) => x.datavalue.value);
    const qualQ = (s, P) => qual(s, P).map((v) => v && v.id).filter(isQ);

    // 2. ce que dit Wikidata (acteurs : P161, puis les voix originales P725 d'un film d'animation)
    const cast = [], vus = new Map();
    for (const s of cl("P161").concat(cl("P725"))) {
      const q = qv(s); if (!isQ(q)) continue;
      const rq = qualQ(s, "P453"), rs = qual(s, "P4633").filter((x) => typeof x === "string");
      if (vus.has(q)) { const c = vus.get(q); c.rq.push(...rq); c.rs.push(...rs); continue; }
      if (cast.length >= MAX_CAST) continue;
      const c = { q, rq, rs }; vus.set(q, c); cast.push(c);
    }
    const realQ = [...new Set(cl("P57").map(qv).filter(isQ))].slice(0, 4), musQ = cl("P86").map(qv).filter(isQ)[0] || "";
    const prixS = cl("P166").filter((s) => isQ(qv(s))).slice(0, MAX_PRIX * 2);
    const lieuxQ = [...new Set(cl("P915").map(qv).filter(isQ))].slice(0, MAX_LIEUX * 2);
    const paysQ = [...new Set(cl("P495").map(qv).filter(isQ))].slice(0, 6);
    const studQ = [...new Set(cl("P272").map(qv).filter(isQ))].slice(0, MAX_STUDIOS * 2);
    // (une série sans date de sortie : sa première diffusion, P580)
    const dateOk = (s) => val(s) && val(s).time;
    const sortieS = cl("P577").filter(dateOk).length || kind !== "serie" ? cl("P577").filter(dateOk) : cl("P580").filter(dateOk);
    const notesS = cl("P444").filter((s) => typeof val(s) === "string");
    const budgetS = prefer(cl("P2130")), recettesS = prefer(cl("P2142"));
    const unite = (s) => (/\/(Q\d+)$/.exec((val(s) && val(s).unit) || "") || [])[1];
    const autres = [...cast.flatMap((c) => c.rq), ...prixS.map(qv), ...lieuxQ, ...paysQ, ...studQ, ...sortieS.flatMap((s) => qualQ(s, "P291")),
      ...notesS.flatMap((s) => qualQ(s, "P447").concat(qualQ(s, "P459"))), ...budgetS.concat(recettesS).map(unite).filter((q) => isQ(q) && !MONNAIES[q])];
    const gensQ = [...new Set([...cast.map((c) => c.q), ...realQ, ...(musQ ? [musQ] : [])])];
    const L = await entites([...gensQ, ...autres], "labels|sitelinks");
    if (panne) return { panne: true };   // sans les noms, la fiche ne vaudrait rien : on réessaiera
    const lab = (q, langs = ["fr", "mul", "en"]) => { const l = ((L[q] || {}).labels) || {}; for (const k of langs) if (l[k] && l[k].value) return l[k].value; return ""; };
    const site = (q, w) => titreNorm((((L[q] || {}).sitelinks || {})[w] || {}).title || "");

    // 3. l'article de Wikipédia en français : la distribution (rôles, voix françaises, acteurs absents de Wikidata)
    const frT = ((e.sitelinks || {}).frwiki || {}).title || "";
    let d = { dist: [], vo: [], vf: [] }, wp = false;
    if (frT) {
      const w = await get(`${B.wikiFr}/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=${enc(frT)}&format=json&formatversion=2`, { max: 6e6 });
      const pg = w && w.query && (w.query.pages || [])[0], rv = pg && pg.revisions && pg.revisions[0];
      const txt = rv && ((rv.slots && rv.slots.main && rv.slots.main.content) || rv.content);
      if (txt) { d = distribution(txt); wp = true; }
    }
    const roleWp = new Map();
    for (const Lg of d.dist.concat(d.vo)) {
      const a = Lg.acteur; if (!a || a.groupe || !Lg.role) continue;
      for (const k of [a.lien && "t:" + titreNorm(a.lien), core(a.nom) && "n:" + core(a.nom)]) if (k && !roleWp.has(k)) roleWp.set(k, Lg.role);
    }
    const voix = voixFrancaises(d);
    // plus d'acteurs : ceux de la distribution de Wikipédia qui manquent dans Wikidata (après ceux de Wikidata, 20 en tout)
    const connus = new Set();
    for (const q of cast.map((c) => c.q)) { const t = site(q, "frwiki"), n = core(lab(q)); if (t) connus.add("t:" + t); if (n) connus.add("n:" + n); }
    const extra = [];
    for (const Lg of d.dist.concat(d.vo)) {
      const a = Lg.acteur; if (!a || a.groupe || cast.length + extra.length >= MAX_CAST + 5) continue;
      const kt = a.lien ? "t:" + titreNorm(a.lien) : "", kn = core(a.nom) ? "n:" + core(a.nom) : "";
      if (!kn || (kt && connus.has(kt)) || connus.has(kn)) continue;
      if (kt) connus.add(kt); connus.add(kn);
      extra.push({ nom: a.nom, fr: a.lien ? titreNorm(a.lien) : "", role: Lg.role });
    }

    // 4. les personnes : résumé, image et lien de Wikipédia (en français, sinon en anglais), 20 par demande
    const P = new Map();   // clé → { q, nom, fr, en, img, thumb, bio, wiki }
    for (const q of gensQ) P.set("q:" + q, { q, nom: lab(q) || sansHomonymie(site(q, "frwiki")) || sansHomonymie(site(q, "enwiki")), fr: site(q, "frwiki"), en: site(q, "enwiki") });
    for (const x of extra) if (x.fr && !P.has("t:" + x.fr)) P.set("t:" + x.fr, { nom: x.nom, fr: x.fr, wpSeul: true });
    for (const v of voix) if (v.lien && !P.has("t:" + titreNorm(v.lien))) P.set("t:" + titreNorm(v.lien), { nom: v.nom, fr: titreNorm(v.lien), wpSeul: true });
    const tous = [...P.values()];
    async function wiki(base, lang, list) {
      const titles = [...new Set(list.map((p) => p[lang]).filter(Boolean))];
      for (let i = 0; i < titles.length; i += 20) {
        const part = titles.slice(i, i + 20);
        const s = await get(`${base}/w/api.php?action=query&prop=pageprops%7Cpageimages%7Cextracts&ppprop=wikibase_item%7Cdisambiguation&piprop=thumbnail%7Cname&pithumbsize=250&pilimit=20&exintro=1&explaintext=1&exsentences=3&exlimit=20&redirects=1&titles=${enc(part.join("|"))}&format=json&formatversion=2`);
        const Q = (s && s.query) || {}, alias = {};
        for (const r of (Q.normalized || []).concat(Q.redirects || [])) alias[r.from] = r.to;
        const pages = {}; for (const pg of Q.pages || []) pages[pg.title] = pg;
        for (const t of part) {
          let k = t; for (let j = 0; j < 3 && alias[k]; j++) k = alias[k];
          const pg = pages[k]; if (!pg || pg.missing !== undefined || pg.invalid !== undefined) continue;
          const pp = pg.pageprops || {}; if (pp.disambiguation !== undefined) continue;   // page d'homonymie : pas cette personne
          for (const p of list) if (p[lang] === t && !p.vu) {
            p.vu = lang;
            if (isQ(pp.wikibase_item) && !p.q) p.q = pp.wikibase_item;
            if (pg.pageimage && !/\.svg$/i.test(pg.pageimage)) { p.img = pg.pageimage; p.thumb = (pg.thumbnail || {}).source || ""; }
            const b = bioCourte(pg.extract); if (b) p.bio = b;
            p.wiki = `${base}/wiki/${enc(String(pg.title).replace(/ /g, "_"))}`;
          }
        }
      }
    }
    await wiki(B.wikiFr, "fr", tous);
    await wiki(B.wikiEn, "en", tous.filter((p) => !p.vu));
    // ni article ni image : l'image de l'élément Wikidata (P18) — personnes de Wikidata seulement (petits éléments)
    const sansImg = tous.filter((p) => p.q && !p.img && !p.vu && !p.wpSeul).map((p) => p.q).slice(0, 20);
    if (sansImg.length) {
      const C = await entites(sansImg, "claims");
      for (const p of tous) { const c = p.q && C[p.q]; const s = c && (((c.claims || {}).P18) || []).find((x) => x.rank !== "deprecated" && x.mainsnak && x.mainsnak.datavalue); if (s && typeof s.mainsnak.datavalue.value === "string") p.img = s.mainsnak.datavalue.value; }
    }
    const photos = {};
    for (const p of tous) if (p.q && p.img && !photos[p.q]) { const u = photoUrls(B, p.img, p.thumb); if (u.length) photos[p.q] = u; }
    const perso = (p, base) => { const x = { ...base }; if (p.q && photos[p.q]) x.q = p.q; if (p.bio) x.bio = p.bio; if (p.wiki) x.wiki = p.wiki; return x; };

    // 5. la fiche
    const f = { ok: true, id: it.id, maj: Date.now() };
    const casting = [], dejaQ = new Set();
    for (const c of cast) {
      const p = P.get("q:" + c.q); if (!p || !p.nom) continue;
      const fr = [...new Set(c.rq.map((q) => lab(q, ["fr", "mul"])).filter(Boolean))].join(" / ");
      const wpR = (p.fr && roleWp.get("t:" + p.fr)) || roleWp.get("n:" + core(p.nom)) || "";
      const en = [...new Set(c.rq.map((q) => lab(q, ["en"])).filter(Boolean))].join(" / ");
      const role = (fr || wpR || en || [...new Set(c.rs)].join(" / ")).slice(0, 120);
      casting.push(perso(p, role ? { nom: p.nom, role } : { nom: p.nom })); dejaQ.add(c.q);
    }
    for (const x of extra) {
      if (casting.length >= MAX_CAST) break;
      const p = (x.fr && P.get("t:" + x.fr)) || { nom: x.nom };
      if (p.q && dejaQ.has(p.q)) continue;   // le même acteur, cité sous un autre nom (redirection)
      if (p.q) dejaQ.add(p.q);
      casting.push(perso(p, x.role ? { nom: x.nom, role: x.role } : { nom: x.nom }));
    }
    if (casting.length) f.casting = casting;
    const vx = voix.map((v) => {
      const p = (v.lien && P.get("t:" + titreNorm(v.lien))) || {};
      const x = { nom: v.nom }; if (v.pour) x.pour = v.pour; if (v.role) x.role = v.role;
      return perso(p, x);
    });
    if (vx.length) f.voix = vx;
    const real = realQ.map((q) => P.get("q:" + q)).filter((p) => p && p.nom).map((p) => perso(p, { nom: p.nom })); if (real.length) f.realisation = real;
    const pm = musQ && P.get("q:" + musQ); if (pm && pm.nom) f.musique = perso(pm, { nom: pm.nom });
    // notes : une par site (le score en % ou sur 100 d'abord, puis la plus récente) ; un avis en mots est ignoré
    const notes = new Map();
    for (const s of notesS) {
      const n = note(val(s)); if (!n) continue;
      const siteQ = qualQ(s, "P447")[0]; if (!siteQ) continue;
      const meth = qualQ(s, "P459").map((q) => lab(q, ["fr", "mul", "en"])).join(" ");
      const [nom, genre0] = SITES[siteQ] || [lab(siteQ), ""]; if (!nom) continue;
      const genre = /\b(user|utilisateurs?|audience|spectateurs?|public)\b/i.test(meth) ? "Spectateurs" : genre0 || (/critic|critique|presse|metascore|tomatometer/i.test(meth) ? "Presse" : "");
      const source = genre ? `${genre} (${nom})` : nom, quand = Math.max(0, ...qual(s, "P585").map(tri));
      const rang = n.rang * 1e13 + quand, prev = notes.get(source);
      if (!prev || rang > prev.rang) notes.set(source, { source, valeur: n.valeur, pct: n.pct, rang, ordre: genre === "Spectateurs" ? 1 : 0 });
    }
    let tm = null;
    const key = String((o.tmdbKey && o.tmdbKey()) || "");
    const tid = Number(rec.tmdb) || Number(cl(kind === "serie" ? "P4983" : "P4947").map(val)[0]) || 0;
    if (key && tid > 0 && B.tmdb) {
      const r = await N.get(`${B.tmdb}/3/${kind === "serie" ? "tv" : "movie"}/${tid}?api_key=${enc(key)}&language=fr-FR`);
      const va = r && Number(r.vote_average), vc = r && Number(r.vote_count);
      if (va > 0 && va <= 10 && vc >= 10) { const x = Math.round(va * 10) / 10; tm = { source: "Spectateurs (TMDB)", valeur: `${String(x).replace(".", ",")}/10`, pct: Math.round(x * 10) }; }
    }
    const nl = [...notes.values()].sort((a, b) => a.ordre - b.ordre).map(({ source, valeur, pct }) => ({ source, valeur, pct }));
    if (tm) nl.push(tm);
    if (nl.length) f.notes = nl;
    const lieux = [...new Set(lieuxQ.map((q) => lab(q)).filter(Boolean))].slice(0, MAX_LIEUX); if (lieux.length) f.lieux = lieux;
    const prix = [];
    for (const s of prixS) {
      const n = lab(qv(s)); if (!n) continue;
      const an = qual(s, "P585").map((v) => (/^[+]?(\d{4})/.exec((v && v.time) || "") || [])[1]).find(Boolean);
      const t = an ? `${n} (${Number(an)})` : n; if (!prix.includes(t)) prix.push(t);
      if (prix.length >= MAX_PRIX) break;
    }
    if (prix.length) f.recompenses = prix;
    // la sortie : en France si Wikidata la connaît, sinon dans le pays d'origine, sinon sans lieu précisé, sinon la première
    if (sortieS.length) {
      const lieu = (s) => qualQ(s, "P291"), date = (s) => tri(val(s));
      const premiere = (L) => L.slice().sort((a, b) => date(a) - date(b))[0];
      const s = premiere(sortieS.filter((x) => lieu(x).includes(FRANCE))) || premiere(sortieS.filter((x) => lieu(x).some((q) => paysQ.includes(q))))
        || premiere(sortieS.filter((x) => !lieu(x).length)) || premiere(sortieS);
      const txt = dateFr(val(s)), ou = lieu(s).includes(FRANCE) ? "" : lieu(s).map((q) => lab(q)).filter(Boolean)[0];
      if (txt) f.sortie = ou ? `${txt} (${ou})` : txt;
    }
    const pays = [...new Set(paysQ.map((q) => lab(q)).filter(Boolean))]; if (pays.length) f.pays = pays;
    const studios = [...new Set(studQ.map((q) => lab(q)).filter(Boolean))].slice(0, MAX_STUDIOS); if (studios.length) f.studios = studios;
    const nomMonnaie = (q) => (isQ(q) ? lab(q) : "");
    const b0 = budgetS[0] && argent(val(budgetS[0]), nomMonnaie); if (b0) f.budget = b0;
    // recettes : dans le monde entier si Wikidata le précise, sinon le chiffre sans lieu précisé, sinon le premier
    const rs = recettesS.find((s) => qualQ(s, "P3005").includes(MONDE)) || recettesS.find((s) => !qualQ(s, "P3005").length) || recettesS[0];
    const r0 = rs && argent(val(rs), nomMonnaie); if (r0) f.recettes = r0;
    f.sources = ["Wikidata"]; if (wp || tous.some((p) => p.vu)) f.sources.push("Wikipédia"); if (tm) f.sources.push("TMDB");
    return { fiche: f, wd: e.id, photos, panne };
  }

  // ---------- ce qui part vers la page ----------
  function vue(c, id) {
    const f = JSON.parse(JSON.stringify(c.fiche)); f.id = id;
    const fix = (x) => { if (!x) return; const q = x.q; delete x.q; if (q && photoDispo(q)) x.photo = `/fiche-photo/${q}.jpg?k=${sig(q)}`; };
    // ordre des champs du contrat : nom, (pour), role, photo, bio, wiki
    const ordre = (x) => { if (!x) return x; fix(x); const y = {}; for (const k of ["nom", "pour", "role", "photo", "bio", "wiki"]) if (x[k] != null && x[k] !== "") y[k] = x[k]; return y; };
    for (const k of ["casting", "voix", "realisation"]) if (Array.isArray(f[k])) f[k] = f[k].map(ordre);
    if (f.musique) f.musique = ordre(f.musique);
    return f;
  }
  function enregistrePhotos(c) { for (const [q, u] of Object.entries((c && c.photos) || {})) if (isQ(q) && Array.isArray(u) && !sources.has(q)) sources.set(q, u.filter((x) => typeof x === "string" && /^https?:\/\//.test(x)).slice(0, 4)); }
  // les vignettes, en arrière-plan, dans l'ordre de la fiche (celles que la page demande passent par le même chemin)
  function prepare(c) {
    const f = c && c.fiche; if (!f) return;
    for (const x of [...(f.casting || []), ...(f.voix || []), ...(f.realisation || []), f.musique]) if (x && x.q) assure(x.q).catch(() => {});
  }
  async function cherche(it, f, ancien) {
    if (encours.has(it.id)) return encours.get(it.id);
    const tour = file.then(() => construire(it));   // une recherche à la fois (plusieurs fiches demandées : chacune son tour)
    file = tour.then(() => {}, () => {});
    const p = (async () => {
      const wd0 = (((FI.db && FI.db()) || {})[it.id] || {}).wd;
      let r; try { r = await tour; } catch (err) { log("error", "plus d'infos " + it.title + " : " + err.message); r = { panne: true }; }
      const t = Date.now();
      if (r.fiche) {
        const c = { v: 1, t, wd: r.wd, fiche: r.fiche, photos: r.photos };
        if (r.panne) c.retry = true;   // une partie n'a pas répondu : on complétera bientôt
        ecrire(f, c); enregistrePhotos(c); prepare(c);
        log("info", `plus d'infos : ${it.title} (${(r.fiche.casting || []).length} acteurs, ${(r.fiche.voix || []).length} voix françaises)`);
        return c;
      }
      // rien de neuf : l'ancienne fiche reste ; site injoignable → nouvel essai dans 10 min, élément disparu → demain
      if (ancien && ancien.fiche && (!isQ(wd0) || ancien.wd === wd0)) {
        const c = { ...ancien };
        if (r.panne) { c.t = t; c.retry = true; } else { c.t = t - FRAIS + RIEN; delete c.retry; }
        ecrire(f, c); return c;
      }
      const c = { v: 1, t, none: true, panne: !!r.panne, wd: wd0 };
      ecrire(f, c); return c;
    })();
    encours.set(it.id, p);
    try { return await p; } finally { encours.delete(it.id); }
  }
  // un film ou une série de la bibliothèque (un épisode : sa série)
  function element(id) {
    const L = lib(), it = L.byId && L.byId.get(id);
    if (it && it.kind === "episode") { const s = (L.items || []).find((x) => x.kind === "serie" && (x.episodes || []).some((e) => e.id === id)); if (s) return s; }
    return it || null;
  }
  async function fiche(id) {
    const it = element(String(id || ""));
    if (!it) return { code: 404, body: { ok: false, raison: "introuvable" } };
    if (it.kind !== "film" && it.kind !== "serie") return { code: 200, body: { ok: false, raison: "pas un film ni une série" } };
    if (!on() || !net()) return { code: 200, body: { ok: false, raison: "fiches coupées" } };
    const f = fichierFiche(it.id);
    let c = lire(f);
    const wd = (((FI.db && FI.db()) || {})[it.id] || {}).wd;
    const age = c ? Date.now() - (Number(c.t) || 0) : Infinity;
    // fiche corrigée à la main (« Corriger la fiche » : un autre élément Wikidata) : on cherche de nouveau
    const autre = !!c && isQ(wd) && c.wd !== wd;
    if (c && c.fiche && !autre) {
      enregistrePhotos(c);
      if (age > FRAIS || (c.retry && age > PANNE)) cherche(it, f, c).catch(() => {});   // la fiche gardée tout de suite, la nouvelle pour la prochaine fois
      return { code: 200, body: vue(c, id) };
    }
    if (c && c.none && !autre && age < (c.panne ? PANNE : RIEN)) return { code: 200, body: { ok: false, raison: c.panne ? "pas d'internet" : "rien trouvé" } };
    c = await cherche(it, f, null);
    if (c.fiche) return { code: 200, body: vue(c, id) };
    return { code: 200, body: { ok: false, raison: c.panne ? "pas d'internet" : "rien trouvé" } };
  }

  // ---------- les deux adresses ----------
  // GET /api/fiche-plus/<id> (appareil relié ; invité : en lecture, comme la bibliothèque)
  async function route(req, res, p, url, W, h) {
    const m = /^\/api\/fiche-plus\/([^/]+)$/.exec(p); if (!m) return false;
    if (req.method !== "GET" && req.method !== "HEAD") { h.send(res, 405, { ok: false, raison: "méthode" }); return true; }
    const r = await fiche(m[1]); h.send(res, r.code, r.body); return true;
  }
  // GET /fiche-photo/<qid>.jpg?k=<signature> : ouverte comme les jaquettes (signature, ou appareil relié) ; seulement ce dossier
  async function photo(req, res, p, url, h) {
    if (!p.startsWith("/fiche-photo/")) return false;
    const m = PHOTO.exec(p); if (!m || (req.method !== "GET" && req.method !== "HEAD")) { h.send(res, 404, { ok: false }); return true; }
    const q = m[1], k = String(url.searchParams.get("k") || "").split("?")[0];   // (« ?k=…?tok=… » si la page ajoute sa clé)
    if (!safeEq(k, sig(q)) && !(h.authed && h.authed(req, url))) { h.send(res, 401, { ok: false, err: "appairage" }); return true; }
    const f = fichierPhoto(q);
    if (!existe(f)) { const ok = await Promise.race([assure(q), new Promise((r) => { const t = setTimeout(() => r(false), 25000); if (t.unref) t.unref(); })]); if (!ok || !existe(f)) { h.send(res, 404, { ok: false }); return true; } }
    let head = Buffer.alloc(0); try { const fd = fs.openSync(f, "r"); head = Buffer.alloc(512); const n = fs.readSync(fd, head, 0, 512, 0); fs.closeSync(fd); head = head.slice(0, n); } catch (_) {}
    const mime = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[imageType(head)];
    if (!mime) { h.send(res, 404, { ok: false }); return true; }
    res.setHeader("Cache-Control", "private, max-age=2592000"); res.setHeader("X-Content-Type-Options", "nosniff");
    await h.sendFile(req, res, f, mime); return true;
  }
  // (essais) où en est la vignette d'une personne : gardée, à télécharger, plus tard (site encombré), absente, inconnue
  const etatPhoto = (q) => (existe(fichierPhoto(q)) ? "gardée" : bloque(q) ? (echecs.get(q).absente ? "absente" : "plus tard") : sources.has(q) ? "à télécharger" : "inconnue");
  return { route, photo, fiche, assure, etatPhoto, photoUrl: (q) => `/fiche-photo/${q}.jpg?k=${sig(q)}` };
}

module.exports = { createFichePlus, distribution, parseLigne, voixFrancaises, bioCourte, note, argent, dateFr, clean };
