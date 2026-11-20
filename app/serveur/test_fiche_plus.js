// Test de « Plus d'infos » (casting avec photos et résumés, voix françaises, musique, notes…) : node app/serveur/test_fiche_plus.js
// Un « faux internet » local imite Wikidata, Wikipédia (fr, en), Wikimedia Commons et TMDB (mêmes adresses, mêmes formats de
// réponse, mêmes façons d'écrire une distribution que les vrais articles), avec des films et des gens INVENTÉS.
// Aucun accès au vrai internet.
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http"), crypto = require("crypto");
const { createServer } = require("./serveur");
const FPM = require("./fiche_plus");
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rbb-ficheplus-"));
const put = (rel, d) => { const f = path.join(T, "m", rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, d); };
put("Films/Le Club des Poings (1999)/Le Club des Poings.mkv", "x");
put("Films/Jouets en Folie (1995)/Jouets en Folie.mkv", "x");
put("Series/Chimie Fatale/Chimie Fatale.S01E01.Pilote.mkv", "x");
put("Films/Le Destin de Lucie (2001)/Le Destin de Lucie.mkv", "x");
put("Films/Sans Article (2010)/Sans Article.mkv", "x");
put("Films/Film Inconnu Xyz/f.mkv", "x");
put("Jeux/NES/Jeu Test (USA).nes", Buffer.alloc(16));

let ok = 0, ko = 0;
const check = (c, w) => { if (c) ok++; else { ko++; console.log("ÉCHEC :", w); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const JPG = (n) => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(600, n & 255)]);
const HTML = Buffer.from("<!doctype html><html><body>" + "page d'erreur ".repeat(40) + "</body></html>");

// ---------------------------------------------------------------- 1. les morceaux, un par un
{
  const L = FPM.parseLigne("* [[Brad Pitre]] <small>(VF : [[Éric Hersant]] et VQ : [[Alain Zouvet]])</small> : Tyler Durand<ref group=\"N\">Une note.</ref>");
  check(L && L.acteur.nom === "Brad Pitre" && L.acteur.lien === "Brad Pitre" && L.role === "Tyler Durand" && L.vf.length === 1 && L.vf[0].nom === "Éric Hersant", "ligne « (VF : X et VQ : Y) » : la VF seulement, rôle sans la note " + JSON.stringify(L));
  const L2 = FPM.parseLigne("* [[Meat Lof]] <small>(VQ : [[Olivier Visant]])</small> : Robert « Bob » Paulson");
  check(L2 && !L2.vf.length && L2.role === "Robert « Bob » Paulson", "ligne avec seulement une version québécoise : aucune voix française");
  const L3 = FPM.parseLigne("* [[David Andrieux (acteur)|David Andrieux]] {{Doublage|VF=Guy Chapelier|VQ=|VF_lien=|VQ_lien=}} : Thomas");
  check(L3 && L3.acteur.nom === "David Andrieux" && L3.acteur.lien === "David Andrieux (acteur)" && L3.vf[0].nom === "Guy Chapelier" && L3.vf[0].lien === "Guy Chapelier", "modèle {{Doublage}} : lien par défaut vers le nom");
  const L4 = FPM.parseLigne("* [[Anna Gun]] {{Doublage|VF=Nathalie Régine|VF_lien=non}} : [[Skyler Blanc (personnage)|Skyler Blanc]]");
  check(L4 && L4.vf[0].nom === "Nathalie Régine" && L4.vf[0].lien === "" && L4.role === "Skyler Blanc", "{{Doublage|VF_lien=non}} : pas de lien ; rôle lié nettoyé");
  const L5 = FPM.parseLigne("* [[Betsy Brande]] <small>({{VF}} : Florence Dumortière (saisons 1 à 4) puis [[Brigitte Guèdj]]<ref name=\"rs\" /> (saison 5))</small> : Marie Schrader");
  check(L5 && L5.vf.map((v) => v.nom).join() === "Florence Dumortière,Brigitte Guèdj" && L5.role === "Marie Schrader", "« {{VF}} : X (saisons 1 à 4) puis [[Y]] (saison 5) » : les deux voix " + JSON.stringify(L5 && L5.vf));
  const L6 = FPM.parseLigne("* Spencer Aste, Cody Dorkin et Ryan Donohue : les amis d'Andy");
  check(L6 && L6.acteur.groupe, "plusieurs acteurs sur une ligne : reconnus comme un groupe");
  const L7 = FPM.parseLigne("* [[Bob Odenkirque]] {{Doublage|VF=Cyrille Arto|VF_lien=non}} : [[Saul Goodmann]] <small>(récurrent saison 2, principal saisons 3 à 5)</small>");
  check(L7 && L7.role === "Saul Goodmann", "rôle : la longue remarque entre parenthèses est retirée");
  const d = FPM.distribution([
    "== Synopsis ==", "* [[Pas Un Acteur]] : ne doit pas être lu",
    "== Distribution ==", "=== Voix originales ===", "{{colonnes|nombre=2|",
    "* [[Tom Hanque]] : [[Shérif Boisé|Boisé]]", "* [[Annie Pott]] : Bo Peep (La Bergère)", "* [[Laurie Metcalfe]] : Nala enfant", "* [[Laura Williamz]] : Nala enfant (chant)", "}}",
    "=== Voix françaises ===", "* [[Jean-Philippe Puymartain]] : Boisé", "* Rebecca Dreyfuss : la Bergère", "* Morgane Flaho : Nala enfant", "* Melinda Attiya : Nala enfant (chant)", "** Voix additionnelles : [[Thierry Wermut]]", "<!-- * [[Voix Cachée]] : Boisé -->",
    "=== Voix québécoises ===", "* [[Alain Zouvet]] : Boisé",
    "== Production ==", "* [[Quelqu'un]] (VF : [[Pas Ici]]) : rien"].join("\n"));
  const v = FPM.voixFrancaises(d), by = (n) => v.find((x) => x.nom === n) || {};
  check(v.length === 4 && by("Jean-Philippe Puymartain").pour === "Tom Hanque" && by("Rebecca Dreyfuss").pour === "Annie Pott", "film d'animation : voix françaises et voix originales du même personnage " + JSON.stringify(v));
  check(by("Morgane Flaho").pour === "Laurie Metcalfe" && by("Melinda Attiya").pour === "Laura Williamz", "« Nala enfant » et « Nala enfant (chant) » : chacun sa voix originale");
  check(!v.some((x) => /Zouvet|Wermut|Cachée|Pas Ici/.test(x.nom)), "voix québécoises, sous-lignes, commentaires et autres sections : ignorés");
  check(FPM.distribution("== Distribution ==\n* [[Audrey Toutou]] : Lucie Poulain\n* [[Frédéric Mitterrant]] : voix off à la télévision}}").dist[1].role === "voix off à la télévision", "dernière ligne d'un {{colonnes|…}} : « }} » retiré du rôle");
  check(FPM.voixFrancaises(FPM.distribution("== Distribution ==\n* [[Audrey Toutou]] : Lucie Poulain\n* [[Mathieu Kassovite]] : Nino")).length === 0, "film français sans doublage : aucune voix inventée");
  check(FPM.clean("[[M. Patate (jouet)|{{M.|Patate}}]]") === "M. Patate" && FPM.clean("{{Mme|Davis}}") === "Mme Davis" && FPM.clean("Walter White {{Jr.}}") === "Walter White Jr.", "modèles courants des rôles ({{M.}}, {{Mme}}, {{Jr.}})");
  const n = (x) => JSON.stringify(FPM.note(x) && { v: FPM.note(x).valeur, p: FPM.note(x).pct });
  check(n("81%") === JSON.stringify({ v: "81 %", p: 81 }) && n("8.8/10") === JSON.stringify({ v: "8,8/10", p: 88 }) && n("67/100") === JSON.stringify({ v: "67/100", p: 67 }) && FPM.note("besonders wertvoll") === null && FPM.note("120%") === null, "notes : %, /10, /100 ; un avis en mots est ignoré");
  const U = (q) => `http://www.wikidata.org/entity/${q}`;
  check(FPM.argent({ amount: "+63000000", unit: U("Q4917") }) === "63 millions de dollars" && FPM.argent({ amount: "+1500000", unit: U("Q4916") }) === "1,5 million d'euros"
    && FPM.argent({ amount: "+2500000000", unit: U("Q4917") }) === "2,5 milliards de dollars" && FPM.argent({ amount: "+35000000", unit: U("Q9999") }, () => "peso mexicain") === "35 millions (peso mexicain)"
    && FPM.argent({ amount: "+35000000", unit: U("Q9999") }, () => "") === "", "budget et recettes : montant et monnaie (rien si la monnaie est inconnue)");
  check(FPM.dateFr({ time: "+1999-11-01T00:00:00Z", precision: 11 }) === "1er novembre 1999" && FPM.dateFr({ time: "+2000-00-00T00:00:00Z", precision: 9 }) === "2000" && FPM.dateFr({ time: "+1995-03-00T00:00:00Z", precision: 10 }) === "mars 1995", "dates : jour, mois ou année selon la précision de Wikidata");
  const b = FPM.bioCourte("Brad Pitre (prononcé [bʁad pitʁ]) est un acteur américain, né le 1er janvier 1963. Il est connu pour ses rôles. Troisième phrase qui ne doit pas venir.");
  check(b === "Brad Pitre est un acteur américain, né le 1er janvier 1963. Il est connu pour ses rôles.", "résumé : 2 phrases au plus, sans la prononciation : " + b);
  check(FPM.bioCourte("x ".repeat(400)).length <= 300 && FPM.bioCourte("J. R. R. Tolkine est un écrivain. Il a écrit des livres.") === "J. R. R. Tolkine est un écrivain. Il a écrit des livres.", "résumé : 300 caractères au plus ; les initiales ne coupent pas la phrase");
  const b2 = [FPM.bioCourte("Tom Hanque [tɑm hæŋk] est un acteur américain."), FPM.bioCourte("Anna Gune /ˈænə ɡʌn/, est une actrice. Elle joue."), FPM.bioCourte("David Fincheur (/ˈdeɪvɪd fɪntʃɚ/), né à Denver, est un réalisateur."),
    FPM.bioCourte("Henri Guibet, né à Paris[réf. nécessaire], est un acteur français\nComédien de café-théâtre. Troisième."), FPM.bioCourte("Il joue dans le groupe AC/DC et 24/7 Band. Deuxième.")];
  check(b2[0] === "Tom Hanque est un acteur américain." && b2[1] === "Anna Gune, est une actrice. Elle joue." && b2[2] === "David Fincheur, né à Denver, est un réalisateur."
    && b2[3] === "Henri Guibet, né à Paris, est un acteur français. Comédien de café-théâtre." && b2[4] === "Il joue dans le groupe AC/DC et 24/7 Band. Deuxième.", "résumé : sans l'écriture phonétique ([…], /…/), sans « [réf. nécessaire] », un paragraphe finit la phrase " + JSON.stringify(b2));
}

// ---------------------------------------------------------------- 2. le faux internet
const cl = (v, q) => ({ rank: "normal", mainsnak: { datavalue: { value: v } }, ...(q ? { qualifiers: q } : {}) });
const qv = (id, q) => cl({ id }, q);
const qq = (id) => [{ datavalue: { value: { id } } }];
const tv = (y, m = 1, d = 1, p = 11) => ({ time: `+${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00Z`, precision: p });
const lab = (fr, en, mul) => ({ labels: { ...(fr ? { fr: { value: fr } } : {}), ...(en ? { en: { value: en } } : {}), ...(mul ? { mul: { value: mul } } : {}) } });
const sl = (fr, en) => ({ sitelinks: { ...(fr ? { frwiki: { title: fr } } : {}), ...(en ? { enwiki: { title: en } } : {}) } });
const money = (n, q, quals) => cl({ amount: "+" + n, unit: `http://www.wikidata.org/entity/${q}` }, quals);
const E = {
  // --- Le Club des Poings : distribution avec VF dans le texte, notes, récompenses, sortie, budget…
  Q9001: { ...lab(null, null, "Le Club des Poings"), ...sl("Le Club des Poings (film)", "Fist Club"), claims: {
    P31: [qv("Q11424")],
    P577: [cl(tv(1999, 9, 10), { P291: qq("Q9900") }), cl(tv(1999, 10, 15), { P291: qq("Q30") }), cl(tv(1999, 11, 10), { P291: qq("Q142") })],
    P161: [qv("Q9102", { P453: qq("Q9201") }), qv("Q9101", { P453: qq("Q9202") }), qv("Q9103", { P453: qq("Q9203") }), qv("Q9104", { P453: qq("Q9204") }), qv("Q9105"),
      qv("Q9106", { P4633: [{ datavalue: { value: "Bob" } }] }), qv("Q9107", { P453: qq("Q9207") }), { rank: "deprecated", mainsnak: { datavalue: { value: { id: "Q9199" } } } }, { rank: "normal", mainsnak: { snaktype: "somevalue" } }, qv("Q9101")],
    P57: [qv("Q9110")], P86: [qv("Q9111")],
    P444: [cl("7.4/10", { P447: qq("Q105584"), P459: qq("Q108403540"), P585: [{ datavalue: { value: tv(2021, 10, 5) } }] }), cl("81%", { P447: qq("Q105584"), P459: qq("Q108403393"), P585: [{ datavalue: { value: tv(2026, 1, 15) } }] }),
      cl("67/100", { P447: qq("Q150248"), P459: qq("Q106515043") }), cl("8.8/10", { P447: qq("Q37312"), P459: qq("Q107218751") }), cl("besonders wertvoll", { P447: qq("Q1202529") })],
    P166: [qv("Q9301", { P585: [{ datavalue: { value: tv(2000, 0, 0, 9) } }] }), qv("Q9302"), qv("Q9303")],
    P915: [qv("Q65")], P495: [qv("Q30"), qv("Q183")], P272: [qv("Q9401")],
    P2130: [money(63000000, "Q4917")],
    P2142: [{ ...money(100853753, "Q4917"), rank: "deprecated" }, money(101209702, "Q4917", { P3005: qq("Q13780930") }), money(37030102, "Q4917", { P3005: qq("Q30") })],
    P4947: [cl("550")] } },
  // --- Jouets en Folie : film d'animation (voix originales P725, sections « Voix originales » / « Voix françaises »)
  Q9002: { ...lab("Jouets en Folie"), ...sl("Jouets en Folie"), claims: { P31: [qv("Q11424")], P577: [cl(tv(1995, 11, 22), { P291: qq("Q30") })], P495: [qv("Q30")],
    P725: [qv("Q9601", { P453: qq("Q9611") }), qv("Q9602", { P453: qq("Q9612") })] } },
  // --- Chimie Fatale : une série
  Q9003: { ...lab("Chimie Fatale"), ...sl("Chimie Fatale"), claims: { P31: [qv("Q5398426")], P580: [cl(tv(2008, 1, 20))], P161: [qv("Q9701")], P4983: [cl("1396")] } },
  // --- Le Destin de Lucie : film français, sans doublage
  Q9004: { ...lab("Le Destin de Lucie"), ...sl("Le Destin de Lucie"), claims: { P31: [qv("Q11424")], P577: [cl(tv(2001, 4, 25), { P291: qq("Q142") })], P161: [qv("Q9801"), qv("Q9802")] } },
  // --- Sans Article : pas d'article en français ; presque rien sur Wikidata
  Q9005: { ...lab("Sans Article"), ...sl(null, "Without Article"), claims: { P31: [qv("Q11424")], P161: [qv("Q9901"), qv("Q9902")] } },
  // personnes
  Q9101: { ...lab("Brad Pitre"), ...sl("Brad Pitre") }, Q9102: { ...lab("Édouard Nortier"), ...sl("Édouard Nortier") }, Q9103: { ...lab("Héléna Bonheur"), ...sl("Héléna Bonheur") },
  Q9104: { ...lab(null, null, "Jared Lito"), ...sl("Jared Lito") }, Q9105: { ...lab(null, "Eion Baylee"), ...sl(null, "Eion Baylee") }, Q9106: { ...lab("Meat Lof"), ...sl("Meat Lof") },
  Q9107: { ...lab(null, "Zach Grenouille"), claims: { P18: [cl("Zach Grenouille portrait.jpg")] } },
  Q9110: { ...lab("David Fincheur"), ...sl("David Fincheur") }, Q9111: { ...lab("Les Frères Poussière"), ...sl("Les Frères Poussière") },
  Q9601: { ...lab("Tom Hanque"), ...sl("Tom Hanque") }, Q9602: { ...lab("Tim Allain"), ...sl("Tim Allain") }, Q9701: { ...lab("Bryan Cranstone"), ...sl("Bryan Cranstone") },
  Q9801: { ...lab("Audrey Toutou"), ...sl("Audrey Toutou") }, Q9802: { ...lab("Mathieu Kassovite"), ...sl("Mathieu Kassovite") },
  Q9901: { ...lab(null, "Anna English"), ...sl(null, "Anna English") }, Q9902: { ...lab(null, "Bob Nowiki"), claims: { P18: [cl("Bob Nowiki.jpg")] } },
  // rôles, sites de notes, récompenses, lieux, pays, studios
  Q9201: lab("Le narrateur", "The Narrator"), Q9202: lab("Tyler Durand", "Tyler Durand"), Q9203: lab(null, "Marla (en)"), Q9204: lab(null, "Angel Face"), Q9207: lab(null, "Richard Chesler"),
  Q9611: lab("Shérif Boisé", "Woody"), Q9612: lab(null, "Buzz Lightyear", "Buzz Éclair"),
  Q105584: lab("Rotten Tomatoes"), Q150248: lab(null, null, "Metacritic"), Q37312: lab("Internet Movie Database", "IMDb"), Q108403540: lab("note moyenne sur Rotten Tomatoes"), Q108403393: lab("score Tomatometer"),
  Q106515043: lab(null, null, "Metascore"), Q107218751: lab(null, "weighted average"), Q1202529: lab("Deutsche Film- und Medienbewertung"),
  Q9301: lab("Prix du meilleur montage"), Q9302: lab(null, "Golden Fist Award"), Q9303: { labels: {} },
  Q65: lab(null, null, "Los Angeles"), Q30: lab("États-Unis", "United States"), Q183: lab("Allemagne"), Q142: lab("France"), Q9900: lab("Festival du film"), Q9401: lab("Studio Régence")
};
const WT = {
  "Le Club des Poings (film)": ["Le film raconte l'histoire d'un club.", "", "== Synopsis ==", "* [[Pas Un Acteur]] (VF : [[Pas Une Voix]]) : rien", "", "== Distribution ==", "{{Source cinéma|allociné=oui}}",
    "* [[Brad Pitre]] <small>(VF : [[Éric Hersant]] et VQ : [[Alain Zouvet]])</small> : Tyler Durand<ref group=\"N\">Une note.</ref>",
    "* [[Édouard Nortier]] <small>(VF : [[Damien Boissot]] ; VQ : [[Antoine Durant]])</small> : le narrateur, Jack",
    "* [[Héléna Bonheur]] <small>(VF : [[Martine Irène]] et VQ : [[Linda Roi]])</small> : Marla Singère",
    "* [[Meat Lof]] <small>(VQ : [[Olivier Visant]])</small> : Robert « Bob » Paulson",
    "* [[Jared Lito]] <small>(VF : Stéphane Marée et VQ : [[Martin Watt]])</small> : « Gueule d'ange »",
    "* [[Eion Baylee]] : Ricky",
    "* [[David Andrieux (acteur)|David Andrieux]] {{Doublage|VF=Guy Chapelier|VQ=|VF_lien=|VQ_lien=}} : Thomas",
    "* [[Lee Smithe]] {{Doublage|VF=Patrick Mancino|VF_lien=non}} : Walter",
    "* Pierre Iacangel <small>(VF : [[Jean-Claude Sachet]])</small> : Lou",
    "* [[Holt McCalla]] <small>({{VF}} : [[Jean-Yves Chatel]])</small> : le mécanicien",
    "<!-- * [[Acteur Masqué]] (VF : [[Voix Masquée]]) : rôle caché -->",
    "{{fin de colonnes}}", ": <small>'''Sources et légende''' : ''Version française (VF)'' sur ''Allodoublage''</small>", "", "== Production ==", "* [[Quelqu'un]] (VF : [[Pas Ici]]) : ne doit pas être lu"].join("\n"),
  "Jouets en Folie": ["== Distribution ==", "{{Source cinéma}}", "=== Voix originales ===", "{{colonnes|nombre=2|taille=35|",
    "* [[Tom Hanque]] : [[Shérif Boisé|Boisé]]", "* [[Tim Allain]] : Buzz Lightyear ([[Buzz l'Éclair]])", "* [[Don Ricle]] : Mr. Potato Head ([[M. Patate (jouet)|{{M.|Patate}}]])",
    "* [[Annie Pott]] : [[Bo Peep (Jouets)|Bo Peep]] (La Bergère)", "* [[Laurie Metcalfe]] : Mrs. Davis ({{Mme|Davis}})", "* Spencer Aste, Cody Dorkin et Ryan Donohue : les amis d'Andy", "}}",
    "=== Voix françaises ===", "{{colonnes|nombre=2|taille=20|",
    "* [[Jean-Philippe Puymartain]] : Boisé", "* [[Richard Darboy]] : Buzz l'Éclair", "* [[Jacques Ferrier]] : [[M. Patate (jouet)|{{M.|Patate}}]]", "* Rebecca Dreyfuss : la Bergère",
    "* [[Isabelle Ganse]] : {{Mme|Davis}}", "* Gilles Tamise : Les Aliens", "** Voix additionnelles : [[Thierry Wermut]], [[Gilbert Lévi]]", "}}",
    "=== Voix québécoises ===", "* [[Alain Zouvet]] : Boisé", "", "== Production ==", "Texte."].join("\n"),
  "Chimie Fatale": ["== Distribution ==", "=== Personnages principaux ===", "{{colonnes|taille=|nombre=2|",
    "* [[Bryan Cranstone]] {{Doublage|VF_lien=Jean-Louis Fort (acteur)|VF=Jean-Louis Fort}} : [[Walter Blanc (personnage)|Walter « Walt » Blanc]] / « [[Heisenberg]] »",
    "* [[Aaron Paule]] {{Doublage|VF=Alexandre Gilet}} : [[Jesse Pinkmann]]",
    "* [[Betsy Brande]] <small>({{VF}} : Florence Dumortière (saisons 1 à 4) puis [[Brigitte Guèdj]]<ref name=\"rs\" /> (saison 5))</small> : Marie Schrader",
    "* [[Bob Odenkirque]] {{Doublage|VF=Cyrille Arto|VF_lien=non}} : [[Saul Goodmann]] <small>(récurrent saison 2, principal saisons 3 à 5)</small>", "}}"].join("\n"),
  "Le Destin de Lucie": ["== Distribution ==", "{{colonnes|nombre=2|taille=30|", "* [[Audrey Toutou]] : Lucie Poulain", "* [[Mathieu Kassovite]] : Nino Quincampoix",
    "<!-- * [[Acteur Retiré]] : rôle retiré -->", "* Jacques Fonlu : le tromboniste", "* [[Frédéric Mitterrant]] : voix off à la télévision}}"].join("\n")
};
// pages des personnes sur Wikipédia : image, résumé, élément Wikidata (redirection, homonymie, page absente)
const PG = {
  fr: {
    "Brad Pitre": { q: "Q9101", img: "Brad Pitre 2019.jpg", ex: "Brad Pitre (prononcé [bʁad pitʁ]) est un acteur américain, né le 1er janvier 1963. Il est connu pour ses rôles. Troisième phrase." },
    "Édouard Nortier": { q: "Q9102", img: "Edouard Nortier.jpg", ex: "Édouard Nortier est un acteur américain." },
    "Héléna Bonheur": { q: "Q9103", ex: "Héléna Bonheur est une actrice britannique." },
    "Jared Lito": { q: "Q9104", img: "Jared Lito signature.svg", ex: "Jared Lito est un acteur et chanteur." },
    "Meat Lof": { q: "Q9106", img: "Meat Lof.jpg", ex: "Meat Lof est un chanteur." },
    "David Fincheur": { q: "Q9110", img: "David Fincheur.jpg", ex: "David Fincheur est un réalisateur américain." },
    "Les Frères Poussière": { q: "Q9111", ex: "Les Frères Poussière sont un duo de musiciens." },
    "Éric Hersant": { q: "Q9501", ex: "Éric Hersant, né le 1er janvier 1964 à Paris, est un acteur français. Il est la voix française régulière de Brad Pitre." },
    "Damien Boissot": { q: "Q9502", img: "Damien Boissot.jpg", ex: "Damien Boissot est un acteur et directeur artistique français." },
    "Martine Irène": { q: "Q9503", ex: "Martine Irène est une actrice française." },
    "Jean-Claude Sachet": { q: "Q9504", homonymie: true, ex: "Jean-Claude Sachet peut désigner plusieurs personnes." },
    "Jean-Yves Chatelain": { q: "Q9506", ex: "Jean-Yves Chatelain est un acteur français." },
    "David Andrieux (acteur)": { q: "Q9120", img: "David Andrieux.jpg", ex: "David Andrieux est un acteur américain." },
    "Holt McCalla": { q: "Q9122", ex: "Holt McCalla est un acteur américain." },
    "Tom Hanque": { q: "Q9601", img: "Tom Hanque.jpg", ex: "Tom Hanque est un acteur américain." }, "Tim Allain": { q: "Q9602", ex: "Tim Allain est un acteur." },
    "Don Ricle": { q: "Q9603", ex: "Don Ricle est un humoriste." }, "Jean-Philippe Puymartain": { q: "Q9621", img: "JP Puymartain.jpg", ex: "Jean-Philippe Puymartain est un acteur français." },
    "Richard Darboy": { q: "Q9622", ex: "Richard Darboy est un acteur français." },
    "Bryan Cranstone": { q: "Q9701", img: "Bryan Cranstone.jpg", ex: "Bryan Cranstone est un acteur américain." }, "Aaron Paule": { q: "Q9702", img: "Aaron Paule Encombre.jpg", ex: "Aaron Paule est un acteur américain." },
    "Jean-Louis Fort (acteur)": { q: "Q9711", ex: "Jean-Louis Fort est un acteur français." }, "Alexandre Gilet": { q: "Q9712", ex: "Alexandre Gilet est un acteur français." },
    "Brigitte Guèdj": { q: "Q9713", ex: "Brigitte Guèdj est une actrice française." },
    "Audrey Toutou": { q: "Q9801", img: "Audrey Toutou.jpg", ex: "Audrey Toutou est une actrice française." }, "Mathieu Kassovite": { q: "Q9802", ex: "Mathieu Kassovite est un acteur et réalisateur français." },
    "Frédéric Mitterrant": { q: "Q9803", ex: "Frédéric Mitterrant est un homme de télévision français." }
  },
  en: { "Eion Baylee": { q: "Q9105", img: "Eion Baylee.jpg", ex: "Eion Baylee is an American actor. He played in many films." }, "Anna English": { q: "Q9901", ex: "Anna English is a British actress." } }
};
const REDIR = { fr: { "Jean-Yves Chatel": "Jean-Yves Chatelain" }, en: {} };
const asked = []; let enPanne = false;   // enPanne : tous les sites répondent « erreur » (internet en panne)
const net = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x"), p = decodeURIComponent(u.pathname), g = (k) => u.searchParams.get(k) || ""; asked.push(p + u.search);
  const json = (o) => { r.writeHead(200, { "Content-Type": "application/json" }); r.end(JSON.stringify(o)); };
  if (enPanne) { r.writeHead(500); return r.end(); }
  if (!/^Rembobine\/[\w.+-]+ \(https:\/\/github\.com\/grecdel\/Rembobine\)$/.test(q.headers["user-agent"] || "")) { r.writeHead(403); return r.end("User-Agent"); }
  const lang = (/^\/(fr|en)\//.exec(p) || [])[1];
  if (lang && p.endsWith("/w/api.php")) {
    if (g("meta") === "siteinfo") return json({ query: {} });
    if (g("list") === "search") { const s = g("srsearch"); const t = lang === "fr" ? (/club des poings/i.test(s) ? ["Le Club des Poings (film)"] : /jouets en folie/i.test(s) ? ["Jouets en Folie"] : /chimie fatale/i.test(s) ? ["Chimie Fatale"] : /destin de lucie/i.test(s) ? ["Le Destin de Lucie"] : []) : /sans article/i.test(s) ? ["Without Article"] : [];
      return json({ query: { search: t.map((title) => ({ title })) } }); }
    const titles = g("titles").split("|").filter(Boolean);
    if (g("prop") === "pageprops") { const Q = { "Le Club des Poings (film)": "Q9001", "Jouets en Folie": "Q9002", "Chimie Fatale": "Q9003", "Le Destin de Lucie": "Q9004", "Without Article": "Q9005" }; const pages = {};
      titles.forEach((t, i) => { if (Q[t]) pages[i] = { title: t, pageprops: { wikibase_item: Q[t] } }; }); return json({ query: { pages } }); }
    if (g("prop") === "revisions") return json({ query: { pages: titles.map((t) => WT[t] && lang === "fr" ? { title: t, revisions: [{ slots: { main: { content: WT[t] } } }] } : { title: t, missing: true }) } });
    if (g("prop").includes("pageimages")) {
      const redirects = [], pages = [];
      for (const t of titles) {
        const to = REDIR[lang][t]; if (to) redirects.push({ from: t, to });
        const k = to || t, P = PG[lang][k];
        if (!P) { pages.push({ title: k, missing: true }); continue; }
        const pg = { title: k, pageprops: { wikibase_item: P.q, ...(P.homonymie ? { disambiguation: "" } : {}) }, extract: P.ex };
        if (P.img) { pg.pageimage = P.img.replace(/ /g, "_"); pg.thumbnail = { source: `${N}/vignettes/${encodeURIComponent(P.img.replace(/ /g, "_"))}`, width: 250, height: 333 }; }
        pages.push(pg);
      }
      return json({ query: { redirects, pages } });
    }
    return json({});
  }
  if (p === "/wd/w/api.php") {
    if (g("action") === "wbsearchentities") { const s = g("search"); return json({ search: (/club des poings/i.test(s) ? ["Q9001"] : /jouets/i.test(s) ? ["Q9002"] : /chimie/i.test(s) ? ["Q9003"] : /lucie/i.test(s) ? ["Q9004"] : /sans article/i.test(s) ? ["Q9005"] : []).map((id) => ({ id })) }); }
    if (g("action") === "wbgetentities") { const entities = {}; for (const id of g("ids").split("|")) entities[id] = E[id] ? { id, ...E[id] } : { id, missing: "" }; return json({ entities }); }
    return json({});
  }
  // vignettes de Commons (250 px) : celle d'« Edouard Nortier » n'existe pas (on passe à l'adresse donnée par Wikipédia),
  // celle de « Meat Lof » est une page web (refusée), celles d'« Aaron Paule » : site encombré (429), on réessaiera plus tard
  if (/Encombre/.test(p)) { r.writeHead(429, { "Retry-After": "0" }); return r.end("too many"); }
  if (p.startsWith("/upload/wikipedia/commons/thumb/")) {
    if (/Edouard_Nortier/.test(p)) { r.writeHead(404); return r.end(); }
    if (/Meat_Lof/.test(p)) { r.writeHead(200, { "Content-Type": "image/jpeg" }); return r.end(HTML); }
    r.writeHead(200, { "Content-Type": "image/jpeg" }); return r.end(JPG(p.length));
  }
  if (p.startsWith("/vignettes/")) { if (/Meat_Lof/.test(p)) { r.writeHead(200, { "Content-Type": "image/jpeg" }); return r.end(HTML); } r.writeHead(200, { "Content-Type": "image/jpeg" }); return r.end(JPG(7)); }
  if (p === "/tmdb/3/movie/550") return json({ vote_average: 8.43, vote_count: 30000 });
  if (p === "/tmdb/3/tv/1396") return json({ vote_average: 8.94, vote_count: 15000 });
  if (p.startsWith("/tmdb/3/search/")) return json({ results: [] });
  r.writeHead(404); r.end();
});
let N = "";
const req = (port, p, { origin, tok, method, body } = {}) => new Promise((resolve, reject) => {
  const h = {}; if (origin) h.Origin = origin; if (tok) h.Authorization = "Bearer " + tok; if (body) h["Content-Type"] = "application/json";
  const rq = http.request({ host: "127.0.0.1", port, path: p, method: method || (body ? "POST" : "GET"), headers: h }, (res) => {
    const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => { const buf = Buffer.concat(ch); let j = null; try { j = JSON.parse(buf); } catch (_) {} resolve({ status: res.statusCode, headers: res.headers, buf, json: j }); });
  });
  rq.on("error", reject); if (body) rq.write(JSON.stringify(body)); rq.end();
});
const calme = async () => { for (let n = asked.length, i = 0; i < 100; i++) { await wait(150); if (asked.length === n) return; n = asked.length; } };
const mine = (from) => asked.slice(from).filter((a) => /mul|pageimages|prop=revisions|\/upload\/|\/vignettes\/|\/tmdb\/3\/(movie|tv)\//.test(a));
const PIEGE = "https://site-piege.example";

net.listen(0, async () => {
  N = `http://127.0.0.1:${net.address().port}`;
  const bases = { wikiFr: N + "/fr", wikiEn: N + "/en", wikidata: N + "/wd", commons: N + "/commons", upload: N + "/upload", tmdb: N + "/tmdb" };
  const D = path.join(T, "d");
  const S = createServer({ port: 31000 + Math.floor(Math.random() * 2000), dataDir: D, mediaRoots: [path.join(T, "m")], ficheDelay: 0, mbDelay: 0, ficheBases: bases, mpv: "/nonexistent", retroarch: "/nonexistent", voisins: false });
  await S.start();
  for (let i = 0; i < 300 && !S.log.some((l) => /fiches : \d+ trouvée/.test(l.msg)); i++) await wait(100);
  await calme();
  const by = (t) => S.lib.items.find((x) => x.title === t);
  const get = (id, o) => req(S.port, `/api/fiche-plus/${encodeURIComponent(id)}`, o);
  const club = by("Le Club des Poings"), jouets = by("Jouets en Folie"), chimie = by("Chimie Fatale"), lucie = by("Le Destin de Lucie"), sans = by("Sans Article"), inconnu = by("Film Inconnu Xyz"), jeu = S.lib.items.find((x) => x.kind === "game");
  check(club && jouets && chimie && lucie && sans && inconnu && jeu, "bibliothèque d'essai analysée " + S.lib.items.map((x) => x.title).join(", "));
  check(S.fiches.db()[club.id] && S.fiches.db()[club.id].wd === "Q9001", "les fiches (fiches.js) ont trouvé l'élément Wikidata du film");
  S.cfg.tmdbKey = "cle-essai";   // la note des spectateurs de TMDB (clé réglée)

  // ---------- Le Club des Poings ----------
  let a0 = asked.length;
  const r1 = await get(club.id), f1 = r1.json || {};
  check(r1.status === 200 && f1.ok === true && f1.id === club.id && typeof f1.maj === "number", "fiche trouvée : ok, id, maj " + JSON.stringify(f1).slice(0, 200));
  const cast = f1.casting || [], c = (n) => cast.find((x) => x.nom === n) || {};
  check(cast.slice(0, 7).map((x) => x.nom).join() === "Édouard Nortier,Brad Pitre,Héléna Bonheur,Jared Lito,Eion Baylee,Meat Lof,Zach Grenouille", "casting dans l'ordre de Wikidata (P161 ; doublon, rang « déconseillé » et valeur inconnue ignorés) " + cast.map((x) => x.nom).join());
  check(c("Édouard Nortier").role === "Le narrateur" && c("Brad Pitre").role === "Tyler Durand", "rôle : qualificatif P453 (libellé français)");
  check(c("Héléna Bonheur").role === "Marla Singère" && c("Jared Lito").role === "« Gueule d'ange »" && c("Eion Baylee").role === "Ricky" && c("Meat Lof").role === "Robert « Bob » Paulson", "rôle : section « Distribution » de Wikipédia quand P453 n'a pas de nom français");
  check(c("Zach Grenouille").role === "Richard Chesler", "rôle : nom anglais de P453 en dernier recours");
  check(cast.slice(7).map((x) => x.nom).join() === "David Andrieux,Lee Smithe,Pierre Iacangel,Holt McCalla" && c("Pierre Iacangel").role === "Lou", "plus d'acteurs : ceux de Wikipédia absents de Wikidata, à la suite " + cast.slice(7).map((x) => x.nom).join());
  check(c("Brad Pitre").bio === "Brad Pitre est un acteur américain, né le 1er janvier 1963. Il est connu pour ses rôles." && /\/fr\/wiki\/Brad_Pitre$/.test(c("Brad Pitre").wiki || ""), "acteur : résumé (2 phrases) et lien vers l'article en français");
  check(c("Eion Baylee").bio === "Eion Baylee is an American actor. He played in many films." && /\/en\/wiki\/Eion_Baylee$/.test(c("Eion Baylee").wiki || ""), "sans article en français : résumé et lien en anglais");
  check(/^\/fiche-photo\/Q9101\.jpg\?k=[0-9a-f]{20}$/.test(c("Brad Pitre").photo || "") && /^\/fiche-photo\/Q9107\.jpg\?k=/.test(c("Zach Grenouille").photo || ""), "photos : adresse signée ; sans article, l'image Wikidata (P18)");
  check(!c("Héléna Bonheur").photo && !c("Jared Lito").photo && !c("Lee Smithe").photo && !c("Lee Smithe").bio && !c("Lee Smithe").wiki && !c("Pierre Iacangel").wiki, "rien d'inventé : pas de photo sans image (ni pour un logo SVG), pas de résumé ni de lien sans article");
  check(Object.keys(c("Brad Pitre")).join() === "nom,role,photo,bio,wiki", "casting : champs du contrat, dans l'ordre (nom, role, photo, bio, wiki)");
  const vx = f1.voix || [], v = (n) => vx.find((x) => x.nom === n) || {};
  check(vx.map((x) => x.nom).join() === "Éric Hersant,Damien Boissot,Martine Irène,Stéphane Marée,Guy Chapelier,Patrick Mancino,Jean-Claude Sachet,Jean-Yves Chatel", "voix françaises de la distribution (pas les voix québécoises, ni les commentaires, ni les autres sections) " + vx.map((x) => x.nom).join());
  check(v("Éric Hersant").pour === "Brad Pitre" && v("Éric Hersant").role === "Tyler Durand" && /voix française régulière/.test(v("Éric Hersant").bio || "") && /\/fr\/wiki\/%C3%89ric_Hersant$/.test(v("Éric Hersant").wiki || ""), "voix : qui elle double, le rôle, résumé et lien");
  check(Object.keys(v("Damien Boissot")).join() === "nom,pour,role,photo,bio,wiki" && /^\/fiche-photo\/Q9502\.jpg\?k=/.test(v("Damien Boissot").photo), "voix avec photo : champs du contrat (nom, pour, role, photo, bio, wiki)");
  check(Object.keys(v("Stéphane Marée")).join() === "nom,pour,role" && Object.keys(v("Guy Chapelier")).join() === "nom,pour,role" && Object.keys(v("Patrick Mancino")).join() === "nom,pour,role", "voix sans lien, lien vers une page absente, {{Doublage|VF_lien=non}} : seulement le nom (rien d'inventé)");
  check(!v("Jean-Claude Sachet").bio && v("Jean-Claude Sachet").pour === "Pierre Iacangel", "lien vers une page d'homonymie : pas le résumé d'une autre personne");
  check(v("Jean-Yves Chatel").bio === "Jean-Yves Chatelain est un acteur français." && /Chatelain$/.test(v("Jean-Yves Chatel").wiki || ""), "lien vers une redirection : la bonne page");
  check(JSON.stringify(f1.realisation) === JSON.stringify([{ nom: "David Fincheur", photo: f1.realisation && f1.realisation[0].photo, bio: "David Fincheur est un réalisateur américain.", wiki: `${N}/fr/wiki/David_Fincheur` }]) && /^\/fiche-photo\/Q9110\.jpg/.test(f1.realisation[0].photo || ""), "réalisation (P57) : nom, photo, résumé, lien " + JSON.stringify(f1.realisation));
  check(f1.musique && f1.musique.nom === "Les Frères Poussière" && !f1.musique.photo && /duo/.test(f1.musique.bio || ""), "musique (P86) : nom et résumé, pas de photo inventée");
  check(JSON.stringify(f1.notes) === JSON.stringify([{ source: "Presse (Rotten Tomatoes)", valeur: "81 %", pct: 81 }, { source: "Presse (Metacritic)", valeur: "67/100", pct: 67 }, { source: "Spectateurs (IMDb)", valeur: "8,8/10", pct: 88 }, { source: "Spectateurs (TMDB)", valeur: "8,4/10", pct: 84 }]), "notes : une par site (Tomatometer plutôt que la moyenne), avis en mots ignoré, TMDB avec la clé " + JSON.stringify(f1.notes));
  check(f1.sortie === "10 novembre 1999", "sortie : la date en France (pas le festival ni les États-Unis) : " + f1.sortie);
  check(JSON.stringify(f1.pays) === JSON.stringify(["États-Unis", "Allemagne"]) && JSON.stringify(f1.studios) === JSON.stringify(["Studio Régence"]) && JSON.stringify(f1.lieux) === JSON.stringify(["Los Angeles"]), "pays (P495), studios (P272), lieux de tournage (P915, nom « mul »)");
  check(JSON.stringify(f1.recompenses) === JSON.stringify(["Prix du meilleur montage (2000)", "Golden Fist Award"]), "récompenses (P166) avec l'année ; sans nom : ignorée " + JSON.stringify(f1.recompenses));
  check(f1.budget === "63 millions de dollars" && f1.recettes === "101 millions de dollars", "budget et recettes (dans le monde entier, pas la valeur « déconseillée » ni les États-Unis seuls) " + f1.budget + " / " + f1.recettes);
  check(JSON.stringify(f1.sources) === JSON.stringify(["Wikidata", "Wikipédia", "TMDB"]), "sources indiquées " + JSON.stringify(f1.sources));
  check(!asked.slice(a0).some((x) => /Pas_Une_Voix|Pas%20Une%20Voix|Pas%20Ici|Voix%20Masqu/.test(x)), "rien n'est cherché pour les lignes hors de la distribution");
  check(asked.slice(a0).filter((x) => /prop=revisions/.test(x)).length === 1, "l'article n'est lu qu'une fois");

  // ---------- les photos ----------
  await calme();
  check(fs.existsSync(path.join(D, "fiches", "gens", "Q9101.jpg")) && fs.existsSync(path.join(D, "fiches", "gens", "Q9502.jpg")), "photos téléchargées en arrière-plan, gardées dans fiches/gens/<qid>.jpg");
  const ph = await req(S.port, c("Brad Pitre").photo);
  check(ph.status === 200 && ph.headers["content-type"] === "image/jpeg" && /max-age=\d{6,}/.test(ph.headers["cache-control"] || "") && ph.buf[0] === 0xFF && ph.buf.length > 500, "photo servie (image/jpeg, gardée en cache par l'appareil)");
  check((await req(S.port, c("Brad Pitre").photo, { origin: PIEGE })).status === 200, "photo : la signature suffit (affichée en <img> sans jeton)");
  check((await req(S.port, c("Brad Pitre").photo + "?tok=abc", { origin: PIEGE })).status === 200, "photo : marche aussi si la page ajoute « ?tok=… » à l'adresse");
  check((await req(S.port, "/fiche-photo/Q9101.jpg", { origin: PIEGE })).status === 401 && (await req(S.port, "/fiche-photo/Q9101.jpg?k=00000000000000000000", { origin: PIEGE })).status === 401, "photo sans signature, ou fausse signature, depuis un autre appareil : refusée");
  const sigOk = (q) => S.fichePlus.photoUrl(q);
  fs.writeFileSync(path.join(D, "fiches", "secret.jpg"), JPG(1));
  for (const bad of ["/fiche-photo/%2e%2e%2fserveur.json", "/fiche-photo/..%2Fsecret.jpg", "/fiche-photo/Q9101.png", "/fiche-photo/Q9101.jpg.png", "/fiche-photo/q9101.jpg", "/fiche-photo/Q09101.jpg", "/fiche-photo/Q9101", "/fiche-photo/Q9101.jpg/x", "/fiche-photo/secret.jpg"])
    check((await req(S.port, bad)).status === 404, "nom refusé : " + bad);
  check((await req(S.port, sigOk("Q123456"))).status === 404, "photo inconnue (bonne signature) : 404, rien n'est demandé à internet");
  const head = await req(S.port, c("Brad Pitre").photo, { method: "HEAD" });
  check(head.status === 200 && !head.buf.length, "HEAD : en-têtes seulement");
  const nortier = await req(S.port, c("Édouard Nortier").photo);
  check(nortier.status === 200 && nortier.buf.equals(JPG(7)), "vignette de Commons absente : l'adresse donnée par Wikipédia en secours");
  const meat = await req(S.port, c("Meat Lof").photo || sigOk("Q9106"));
  check(meat.status === 404 && !fs.existsSync(path.join(D, "fiches", "gens", "Q9106.jpg")), "« image » qui est une page web : refusée, rien de gardé");
  const a1 = asked.length; await req(S.port, c("Brad Pitre").photo);
  check(asked.length === a1, "photo déjà gardée : rien n'est redemandé");
  const r1b = (await get(club.id)).json;
  check(!(r1b.casting.find((x) => x.nom === "Meat Lof") || {}).photo && !!(r1b.casting.find((x) => x.nom === "Brad Pitre") || {}).photo, "photo impossible à télécharger : retirée de la fiche suivante");

  // ---------- film d'animation ----------
  const f2 = (await get(jouets.id)).json || {};
  const c2 = (n) => (f2.casting || []).find((x) => x.nom === n) || {};
  check((f2.casting || []).map((x) => x.nom).join() === "Tom Hanque,Tim Allain,Don Ricle,Annie Pott,Laurie Metcalfe", "animation : voix originales de Wikidata (P725) puis celles de Wikipédia, sans le groupe " + (f2.casting || []).map((x) => x.nom).join());
  check(c2("Tom Hanque").role === "Shérif Boisé" && c2("Tim Allain").role === "Buzz Éclair" && c2("Don Ricle").role === "Mr. Potato Head (M. Patate)", "animation : rôles (P453 en français ou « mul », sinon Wikipédia)");
  const v2 = (n) => (f2.voix || []).find((x) => x.nom === n) || {};
  check((f2.voix || []).map((x) => x.nom).join() === "Jean-Philippe Puymartain,Richard Darboy,Jacques Ferrier,Rebecca Dreyfuss,Isabelle Ganse,Gilles Tamise", "animation : section « Voix françaises » (pas les québécoises, ni « Voix additionnelles ») " + (f2.voix || []).map((x) => x.nom).join());
  check(v2("Jean-Philippe Puymartain").pour === "Tom Hanque" && v2("Richard Darboy").pour === "Tim Allain" && v2("Jacques Ferrier").pour === "Don Ricle" && v2("Rebecca Dreyfuss").pour === "Annie Pott" && v2("Isabelle Ganse").pour === "Laurie Metcalfe", "animation : chaque voix française et la voix originale du même personnage");
  check(!("pour" in v2("Gilles Tamise")) && v2("Gilles Tamise").role === "Les Aliens", "personnage introuvable en version originale : « pour » absent (pas deviné)");
  check(v2("Jacques Ferrier").role === "M. Patate" && /^\/fiche-photo\/Q9621\.jpg/.test(v2("Jean-Philippe Puymartain").photo || ""), "animation : rôle nettoyé ({{M.|Patate}}), photo de la voix française");
  check(f2.sortie === "22 novembre 1995 (États-Unis)" && !f2.notes && !f2.budget && !f2.realisation && !f2.musique, "sortie hors de France : le pays est précisé ; le reste inconnu est absent " + f2.sortie);

  // ---------- série ----------
  const f3 = (await get(chimie.id)).json || {};
  const v3 = (n) => (f3.voix || []).find((x) => x.nom === n) || {};
  check((f3.voix || []).map((x) => x.nom).join() === "Jean-Louis Fort,Alexandre Gilet,Florence Dumortière,Brigitte Guèdj,Cyrille Arto", "série : voix françaises ({{Doublage}}, « {{VF}} : X puis [[Y]] ») " + (f3.voix || []).map((x) => x.nom).join());
  check(/Jean-Louis_Fort_\(acteur\)$/.test(v3("Jean-Louis Fort").wiki || "") && v3("Jean-Louis Fort").bio === "Jean-Louis Fort est un acteur français." && v3("Alexandre Gilet").bio && !v3("Cyrille Arto").wiki && !v3("Florence Dumortière").wiki && v3("Brigitte Guèdj").wiki, "série : liens des voix (VF_lien, lien par défaut, « non », texte sans lien)");
  check(v3("Jean-Louis Fort").role === "Walter « Walt » Blanc / « Heisenberg »" && v3("Cyrille Arto").role === "Saul Goodmann", "série : rôles nettoyés");
  check((f3.casting || [])[0].nom === "Bryan Cranstone" && f3.casting[0].role === "Walter « Walt » Blanc / « Heisenberg »" && f3.casting.length === 4, "série : casting (Wikidata puis Wikipédia), rôle lu dans Wikipédia");
  check(JSON.stringify(f3.notes) === JSON.stringify([{ source: "Spectateurs (TMDB)", valeur: "8,9/10", pct: 89 }]) && f3.sources.includes("TMDB"), "série : note TMDB (identifiant de série P4983)");
  check(f3.sortie === "20 janvier 2008", "série sans date de sortie : sa première diffusion (P580) " + f3.sortie);
  await calme();
  check(S.fichePlus.etatPhoto("Q9702") === "plus tard" && S.fichePlus.etatPhoto("Q9106") === "absente" && S.fichePlus.etatPhoto("Q9701") === "gardée", "photo refusée par un site encombré (429) : réessayée plus tard ; page web au lieu d'une image : absente " + [S.fichePlus.etatPhoto("Q9702"), S.fichePlus.etatPhoto("Q9106")]);
  check(!((await get(chimie.id)).json.casting.find((x) => x.nom === "Aaron Paule") || {}).photo, "photo pas encore téléchargeable : retirée de la fiche en attendant (pas d'image cassée)");
  const ep = chimie.episodes && chimie.episodes[0];
  const f3e = ep ? (await get(ep.id)).json : null;
  check(f3e && f3e.ok && f3e.id === ep.id && (f3e.voix || []).length === 5, "un épisode : la fiche de sa série");

  // ---------- film français, sans doublage ----------
  const f4 = (await get(lucie.id)).json || {};
  check(f4.ok && !("voix" in f4), "film français sans doublage : aucune voix (champ absent)");
  check((f4.casting || []).map((x) => x.nom + ":" + x.role).join() === "Audrey Toutou:Lucie Poulain,Mathieu Kassovite:Nino Quincampoix,Jacques Fonlu:le tromboniste,Frédéric Mitterrant:voix off à la télévision", "film français : rôles de Wikipédia, acteurs en plus, ligne en commentaire ignorée " + (f4.casting || []).map((x) => x.nom + ":" + x.role).join());
  check(f4.sortie === "25 avril 2001", "film français : sortie en France");

  // ---------- presque rien de connu ----------
  const f5 = (await get(sans.id)).json || {};
  check(f5.ok && (f5.casting || []).length === 2 && f5.casting[0].bio === "Anna English is a British actress." && !f5.casting[0].photo && /^\/fiche-photo\/Q9902\.jpg/.test(f5.casting[1].photo || "") && !f5.casting[1].bio && !f5.casting[1].wiki && !f5.casting[0].role, "sans article en français : résumé anglais ; image Wikidata ; rien d'autre d'inventé " + JSON.stringify(f5.casting));
  check(["voix", "realisation", "musique", "notes", "lieux", "recompenses", "sortie", "pays", "studios", "budget", "recettes"].every((k) => !(k in f5)), "données manquantes : champs absents (jamais inventés) " + Object.keys(f5).join());
  const f6 = await get(inconnu.id);
  check(f6.status === 200 && f6.json && f6.json.ok === false && f6.json.raison === "rien trouvé", "film introuvable : { ok: false, raison: « rien trouvé » } " + JSON.stringify(f6.json));
  const a6 = asked.length; await get(inconnu.id);
  check(asked.length === a6, "film introuvable : pas de nouvelle recherche avant le lendemain");
  check((await get(jeu.id)).json.raison === "pas un film ni une série" && (await get("inexistant")).status === 404, "jeu : pas de fiche ; identifiant inconnu : 404");

  // ---------- fiches gardées ----------
  await calme();
  const a2 = asked.length, r2 = (await get(club.id)).json;
  check(r2.maj === f1.maj && mine(a2).length === 0, "deuxième ouverture : la fiche gardée, rien n'est redemandé " + JSON.stringify(mine(a2)));
  check(fs.existsSync(path.join(D, "fiches", "plus", club.id + ".json")), "fiche gardée dans fiches/plus/<id>.json");
  // deux demandes en même temps : une seule recherche
  fs.unlinkSync(path.join(D, "fiches", "plus", lucie.id + ".json"));
  const a3 = asked.length; const [x1, x2] = await Promise.all([get(lucie.id), get(lucie.id)]);
  check(x1.json.ok && x2.json.ok && asked.slice(a3).filter((x) => /prop=revisions/.test(x)).length === 1, "deux demandes en même temps : une seule recherche");
  // deux films différents demandés en même temps : l'un après l'autre (pas de demandes mêlées)
  await calme();
  for (const it of [jouets, lucie]) fs.unlinkSync(path.join(D, "fiches", "plus", it.id + ".json"));
  const a3b = asked.length; const [y1, y2] = await Promise.all([get(jouets.id), get(lucie.id)]);
  const idx = (re) => asked.map((x, i) => (i >= a3b && re.test(x) ? i : -1)).filter((i) => i >= 0);
  const iA = idx(/Jouets%20en%20Folie|Tom%20Hanque/), iB = idx(/Le%20Destin%20de%20Lucie|Audrey%20Toutou/);
  check(y1.json.ok && y2.json.ok && iA.length >= 2 && iB.length >= 2 && (Math.max(...iA) < Math.min(...iB) || Math.max(...iB) < Math.min(...iA)), "deux films en même temps : une recherche après l'autre " + JSON.stringify([iA, iB]));
  // après 30 jours : la fiche gardée tout de suite, la nouvelle en arrière-plan
  const ff = path.join(D, "fiches", "plus", club.id + ".json"), old = JSON.parse(fs.readFileSync(ff, "utf8"));
  old.t = Date.now() - 31 * 86400000; fs.writeFileSync(ff, JSON.stringify(old));
  const a4 = asked.length, r4 = (await get(club.id)).json;
  check(r4.maj === f1.maj, "fiche de plus de 30 jours : servie tout de suite");
  await calme();
  const r5 = (await get(club.id)).json;
  check(mine(a4).some((x) => /prop=revisions/.test(x)) && r5.maj > f1.maj && r5.casting.length === f1.casting.length, "puis rafraîchie en arrière-plan");
  // après 30 jours, mais internet en panne : l'ancienne fiche reste, un seul nouvel essai (pas à chaque ouverture)
  const old2 = JSON.parse(fs.readFileSync(ff, "utf8")); old2.t = Date.now() - 31 * 86400000; fs.writeFileSync(ff, JSON.stringify(old2));
  enPanne = true;
  const a5 = asked.length, pa1 = (await get(club.id)).json; await calme();
  const apres = JSON.parse(fs.readFileSync(ff, "utf8")), a5b = asked.length;
  const pa2 = (await get(club.id)).json; await calme();
  check(pa1.ok && pa2.ok && pa2.maj === r5.maj && apres.fiche && apres.retry === true && asked.length > a5 && asked.length === a5b, "internet en panne : la fiche gardée reste servie, un seul nouvel essai (puis dans 10 min) " + [a5, a5b, asked.length]);
  enPanne = false;
  // fiche corrigée à la main (fiches.js : autre élément Wikidata) : nouvelle recherche
  const wd0 = S.fiches.db()[club.id].wd; S.fiches.db()[club.id].wd = "Q9004";
  const r6 = (await get(club.id)).json;
  check(r6.ok && r6.casting[0].nom === "Audrey Toutou", "fiche corrigée (autre élément Wikidata) : cherchée de nouveau");
  S.fiches.db()[club.id].wd = wd0; await get(club.id); await calme();

  // ---------- contrôle d'accès ----------
  check((await get(club.id, { origin: PIEGE })).status === 401, "appareil non relié : refusé (appairage)");
  const tok = crypto.randomBytes(24).toString("base64url");
  S.cfg.tokens.push({ hash: crypto.createHash("sha256").update(tok).digest("hex"), name: "Téléphone", t: Date.now() });
  check((await get(club.id, { origin: PIEGE, tok })).json.ok === true, "appareil relié : fiche lue");
  const inv = (await req(S.port, "/api/invite", { body: {} })).json;
  const gp = (await req(S.port, "/api/pair", { origin: PIEGE, body: { invite: inv.code, name: "Ami" } })).json;
  check(gp && gp.guest && (await get(club.id, { origin: PIEGE, tok: gp.token })).json.ok === true, "invité d'une séance : peut lire la fiche (comme la bibliothèque)");
  check((await get(club.id, { origin: PIEGE, tok: gp.token, body: {} })).status === 403, "invité : rien d'autre que la lecture");

  // ---------- recherche coupée ----------
  await req(S.port, "/api/config", { body: { fiches: false } });
  fs.unlinkSync(path.join(D, "fiches", "plus", jouets.id + ".json"));
  const a7 = asked.length;
  const off1 = (await get(jouets.id)).json, off2 = (await get(club.id)).json;
  check(off1.ok === false && off1.raison === "fiches coupées" && off2.raison === "fiches coupées" && asked.length === a7, "réglage coupé (Paramètres → Métadonnées) : « fiches coupées », rien n'est demandé à internet");
  check((await req(S.port, sigOk("Q9602"))).status === 404 && asked.length === a7, "réglage coupé : aucune photo téléchargée");
  await req(S.port, "/api/config", { body: { fiches: true } });
  await S.stop();

  // ---------- après un redémarrage : fiches et photos sur le disque ----------
  await calme();
  const S2 = createServer({ port: 33000 + Math.floor(Math.random() * 2000), dataDir: D, mediaRoots: [path.join(T, "m")], ficheDelay: 0, mbDelay: 0, ficheBases: bases, mpv: "/nonexistent", retroarch: "/nonexistent", voisins: false });
  await S2.start(); for (let i = 0; i < 50 && !S2.lib.t; i++) await wait(100); await calme();
  const a8 = asked.length, g2 = (await req(S2.port, `/api/fiche-plus/${club.id}`)).json, p2 = await req(S2.port, g2.casting.find((x) => x.nom === "Brad Pitre").photo);
  check(g2.ok && g2.casting.length === f1.casting.length && p2.status === 200 && mine(a8).length === 0, "après un redémarrage : fiche et photo lues sur le disque, sans internet");
  await S2.stop();
  // REMBOBINE_FICHES=0 (essais sans internet) : jamais
  process.env.REMBOBINE_FICHES = "0";
  const S3 = createServer({ port: 35000 + Math.floor(Math.random() * 2000), dataDir: path.join(T, "d3"), mediaRoots: [path.join(T, "m")], ficheDelay: 0, mbDelay: 0, ficheBases: bases, mpv: "/nonexistent", retroarch: "/nonexistent", voisins: false });
  await S3.start(); for (let i = 0; i < 50 && !S3.lib.t; i++) await wait(100);
  const a9 = asked.length, z = (await req(S3.port, `/api/fiche-plus/${S3.lib.items.find((x) => x.title === "Le Club des Poings").id}`)).json;
  check(z.ok === false && z.raison === "fiches coupées" && asked.length === a9, "REMBOBINE_FICHES=0 : « fiches coupées », aucune demande");
  await S3.stop(); delete process.env.REMBOBINE_FICHES;
  net.close(); fs.rmSync(T, { recursive: true, force: true });
  console.log(`Plus d'infos : ${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
});
