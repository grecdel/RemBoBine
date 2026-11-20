/* ==== Rembobine : calendrier des nouveaux événements (2D) ====
   Inséré tel quel dans le <script> du logiciel (pas d'export).
   CAL_INFO[id] = { nom, type ("culturelle" | "religieuse"), pays: [codes ISO], jours (durée affichée), note? }
   CAL_EVENTS(date, pays) -> ids actifs ce jour-là (date = Date locale ; pays = "TOUS" ou un code pays).
   Dates lunaires / religieuses : tables vérifiées pour 2026 -> 2035 (hors de ces années, ces fêtes ne s'affichent pas).
   Même logique, mêmes données que le calendrier du module : modifier les deux ensemble. */
const CAL_INFO = _calInfo();
const NEW_FLAGS = {
  CN: ["de la Chine", 10, 1, "etoile", ["#DE2910", "#FFDE00"], ""],
  IN: ["de l'Inde", 8, 15, "h", ["#FF9933", "#FFFFFF", "#138808"], ""],
  KR: ["de la Corée du Sud", 10, 3, "disque", ["#FFFFFF", "#CD2E3A"], ""],
  VN: ["du Viêt Nam", 9, 2, "etoile", ["#DA251D", "#FFFF00"], ""],
  TH: ["de la Thaïlande", 12, 5, "h", ["#A51931", "#F4F5F8", "#2D2A4A", "#2D2A4A", "#F4F5F8", "#A51931"], ""]
};
// Pour la liste « Pays » des réglages (même format que PAYS du logiciel).
const NEW_PAYS = { "Chine": "CN", "Corée du Sud": "KR", "Inde": "IN", "Thaïlande": "TH", "Viêt Nam": "VN" };

function _calInfo() {
  if (_calInfo._v) return _calInfo._v;
  const AID = ["FR", "BE", "MA", "DZ", "TN", "SN", "CI", "CM", "IN"];
  const NOTE_AID = "Date prévue (calendrier Umm al-Qura) : peut varier d'un jour selon l'observation de la lune et le pays.";
  return (_calInfo._v = {
    nouvelanlunaire: { nom: "Nouvel An lunaire (Nouvel An chinois, Têt, Seollal)", type: "culturelle", pays: ["CN", "VN", "KR"], jours: 4 },
    lanternes: { nom: "Fête des Lanternes", type: "culturelle", pays: ["CN", "VN"], jours: 1 },
    lune: { nom: "Fête de la mi-automne (Chuseok, Trung Thu)", type: "culturelle", pays: ["CN", "VN", "KR"], jours: 3 },
    hanami: { nom: "Hanami (floraison des cerisiers)", type: "culturelle", pays: ["JP"], jours: 17 },
    tanabata: { nom: "Tanabata (fête des étoiles)", type: "culturelle", pays: ["JP"], jours: 1 },
    diwali: { nom: "Diwali (fête des lumières)", type: "religieuse", pays: ["IN"], jours: 5 },
    holi: { nom: "Holi (fête des couleurs)", type: "religieuse", pays: ["IN"], jours: 2 },
    songkran: { nom: "Songkran (Nouvel An thaï)", type: "culturelle", pays: ["TH"], jours: 3 },
    oktoberfest: { nom: "Oktoberfest", type: "culturelle", pays: ["DE"], jours: 16 },
    stnicolas: { nom: "Saint-Nicolas", type: "culturelle", pays: ["FR", "BE", "LU", "CH", "DE", "NL", "PL"], jours: 2 },
    carnaval: { nom: "Carnaval (Mardi gras)", type: "culturelle", pays: ["FR", "BE", "CH", "LU", "MC", "DE", "IT", "ES", "PT", "NL", "HT", "MX", "US"], jours: 6 },
    stelucie: { nom: "Sainte-Lucie", type: "culturelle", pays: ["IT"], jours: 1 },
    lumieres: { nom: "Fête des Lumières (Lyon)", type: "culturelle", pays: ["FR"], jours: 4 },
    stjean: { nom: "Saint-Jean (feux de la Saint-Jean, São João)", type: "culturelle", pays: ["FR", "QC", "ES", "PT", "BR"], jours: 2 },
    thanksgiving_us: { nom: "Thanksgiving (États-Unis)", type: "culturelle", pays: ["US"], jours: 4 },
    thanksgiving_ca: { nom: "Action de grâce (Canada)", type: "culturelle", pays: ["CA", "QC"], jours: 3 },
    muertos: { nom: "Jour des Morts (Día de Muertos)", type: "culturelle", pays: ["MX"], jours: 2 },
    carnavalrio: { nom: "Carnaval de Rio", type: "culturelle", pays: ["BR"], jours: 5 },
    marmotte: { nom: "Jour de la marmotte", type: "culturelle", pays: ["US", "CA", "QC"], jours: 1 },
    aidfitr: { nom: "Aïd el-Fitr (fin du ramadan)", type: "religieuse", pays: AID, jours: 3, note: NOTE_AID },
    aidadha: { nom: "Aïd el-Kébir (Aïd al-Adha)", type: "religieuse", pays: AID, jours: 4, note: NOTE_AID },
    hanoukka: { nom: "Hanoucca", type: "religieuse", pays: ["FR", "BE", "US", "CA", "QC"], jours: 8, note: "Commence au coucher du soleil du premier jour (allumage de la première bougie)." }
  });
}

function _calData() {
  if (_calData._v) return _calData._v;
  // [mois, jour] ; une liste par année (l'Aïd el-Fitr tombe deux fois en 2033).
  const T = {
    // Nouvel An lunaire (Chine) — Wikipédia « Chinese New Year », calcul des nouvelles lunes (UTC+8)
    nouvelanlunaire: { 2026: [[2, 17]], 2027: [[2, 6]], 2028: [[1, 26]], 2029: [[2, 13]], 2030: [[2, 3]], 2031: [[1, 23]], 2032: [[2, 11]], 2033: [[1, 31]], 2034: [[2, 19]], 2035: [[2, 8]] },
    // 15e jour du 8e mois (Chine) — Wikipédia, calendarific (2033)
    lune: { 2026: [[9, 25]], 2027: [[9, 15]], 2028: [[10, 3]], 2029: [[9, 22]], 2030: [[9, 12]], 2031: [[10, 1]], 2032: [[9, 19]], 2033: [[9, 8]], 2034: [[9, 27]], 2035: [[9, 16]] },
    // Lakshmi Puja (jour principal de Diwali) — timeanddate (Inde), drikpanchang, dekhopanchang
    diwali: { 2026: [[11, 8]], 2027: [[10, 29]], 2028: [[10, 17]], 2029: [[11, 5]], 2030: [[10, 26]], 2031: [[11, 14]], 2032: [[11, 2]], 2033: [[10, 22]], 2034: [[11, 10]], 2035: [[10, 30]] },
    // Holi des couleurs (Dhulandi), lendemain de Holika Dahan
    holi: { 2026: [[3, 4]], 2027: [[3, 22]], 2028: [[3, 11]], 2029: [[3, 1]], 2030: [[3, 20]], 2031: [[3, 9]], 2032: [[3, 27]], 2033: [[3, 16]], 2034: [[3, 5]], 2035: [[3, 24]] },
    // Calendrier Umm al-Qura (Arabie saoudite) — qppstudio, hijri-calendars ; ±1 jour selon les pays
    aidfitr: { 2026: [[3, 20]], 2027: [[3, 9]], 2028: [[2, 26]], 2029: [[2, 14]], 2030: [[2, 4]], 2031: [[1, 24]], 2032: [[1, 14]], 2033: [[1, 2], [12, 23]], 2034: [[12, 12]], 2035: [[12, 1]] },
    aidadha: { 2026: [[5, 27]], 2027: [[5, 16]], 2028: [[5, 5]], 2029: [[4, 24]], 2030: [[4, 13]], 2031: [[4, 2]], 2032: [[3, 22]], 2033: [[3, 11]], 2034: [[3, 1]], 2035: [[2, 18]] },
    // Soir de la première bougie (veille du 25 kislev) — calendrier hébraïque calculé, Wikipédia « Hanukkah »
    hanoukka: { 2026: [[12, 4]], 2027: [[12, 24]], 2028: [[12, 12]], 2029: [[12, 1]], 2030: [[12, 20]], 2031: [[12, 9]], 2032: [[11, 27]], 2033: [[12, 16]], 2034: [[12, 6]], 2035: [[12, 25]] }
  };
  // Dates propres à un pays (fuseau horaire différent : la nouvelle lune tombe un autre jour).
  const P = {
    VN: { nouvelanlunaire: { 2030: [[2, 2]] }, lune: { 2034: [[9, 26]] } },
    KR: { nouvelanlunaire: { 2027: [[2, 7]], 2028: [[1, 27]] } }
  };
  // id -> [source de date, décalage début, décalage fin] (jours, bornes incluses)
  const W = {
    nouvelanlunaire: ["nouvelanlunaire", 0, 3], lanternes: ["nouvelanlunaire", 14, 14], lune: ["lune", -1, 1],
    hanami: [[3, 25], 0, 16], tanabata: [[7, 7], 0, 0], diwali: ["diwali", -2, 2], holi: ["holi", -1, 0],
    songkran: [[4, 13], 0, 2], oktoberfest: ["oktoberfest", 0, 0], stnicolas: [[12, 6], -1, 0],
    carnaval: ["mardigras", -5, 0], stelucie: [[12, 13], 0, 0], lumieres: [[12, 8], -3, 0], stjean: [[6, 24], -1, 0],
    thanksgiving_us: ["thanksgiving_us", 0, 3], thanksgiving_ca: ["thanksgiving_ca", -2, 0], muertos: [[11, 1], 0, 1],
    carnavalrio: ["mardigras", -3, 1], marmotte: [[2, 2], 0, 0], aidfitr: ["aidfitr", 0, 2], aidadha: ["aidadha", 0, 3],
    hanoukka: ["hanoukka", 0, 7]
  };
  const ORDER = ["nouvelanlunaire", "lanternes", "marmotte", "carnaval", "carnavalrio", "holi", "hanami", "songkran", "stjean",
    "tanabata", "lune", "oktoberfest", "thanksgiving_ca", "diwali", "muertos", "thanksgiving_us", "stnicolas", "lumieres",
    "stelucie", "hanoukka", "aidfitr", "aidadha"];
  return (_calData._v = { T, P, W, ORDER });
}

// Numéro de jour (jours depuis le 1er janvier 1970), sans fuseau ni heure d'été.
function _calDn(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
const _calWd = (n) => (((n + 4) % 7) + 7) % 7; // 0 = dimanche

// Périodes [début, fin] (numéros de jour) de l'événement id dont la date de référence est en année y.
function _calWindows(id, y, pays) {
  const D = _calData(), w = D.W[id], src = w[0], out = [];
  let anchors = [];
  if (Array.isArray(src)) anchors = [_calDn(y, src[0], src[1])];
  else if (src === "mardigras") {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451),
      em = Math.floor((h + l - 7 * mm + 114) / 31), ed = ((h + l - 7 * mm + 114) % 31) + 1;
    anchors = [_calDn(y, em, ed) - 47];
  } else if (src === "thanksgiving_us") { const n1 = _calDn(y, 11, 1); anchors = [n1 + ((4 - _calWd(n1) + 7) % 7) + 21]; }
  else if (src === "thanksgiving_ca") { const o1 = _calDn(y, 10, 1); anchors = [o1 + ((1 - _calWd(o1) + 7) % 7) + 7]; }
  else if (src === "oktoberfest") {
    // Munich : finit le 1er dimanche d'octobre, ou le 3 octobre si c'est plus tard ; commence le samedi 15 jours avant ce dimanche.
    const o1 = _calDn(y, 10, 1), sun = o1 + ((7 - _calWd(o1)) % 7);
    return [[sun - 15, Math.max(sun, _calDn(y, 10, 3))]];
  } else {
    const tab = (D.P[pays] && D.P[pays][src] && D.P[pays][src][y]) || D.T[src][y] || [];
    anchors = tab.map(md => _calDn(y, md[0], md[1]));
  }
  anchors.forEach(a => out.push([a + w[1], a + w[2]]));
  return out;
}

// tous = true : toutes les fêtes du jour, même celles d'autres pays (le pays ne sert alors qu'aux dates propres à un pays ;
// c'est ce que fait le logiciel, où le pays ne fait que pré-cocher les fêtes).
function CAL_EVENTS(date, pays, tous) {
  pays = pays || "TOUS";
  const y = date.getFullYear(), n = _calDn(y, date.getMonth() + 1, date.getDate()), D = _calData(), info = _calInfo(), res = [];
  for (const id of D.ORDER) {
    if (!tous && pays !== "TOUS" && info[id].pays.indexOf(pays) < 0) continue;
    let on = false;
    for (let yy = y - 1; yy <= y + 1 && !on; yy++)
      for (const p of _calWindows(id, yy, pays)) if (n >= p[0] && n <= p[1]) { on = true; break; }
    if (on) res.push(id);
  }
  return res;
}
