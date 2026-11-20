/* ===== Fêtes du monde (2D) : Oktoberfest, Saint-Nicolas, Carnaval, Sainte-Lucie, Fête des Lumières, Saint-Jean,
   Thanksgiving (US / Canada), Día de Muertos, Carnaval de Rio, jour de la marmotte, Aïd el-Fitr, Aïd al-Adha, Hanoukka.
   Les dates viennent du calendrier (parts/web/_calendrier.js). Lumière naturelle : seules les bougies, lanternes,
   lumignons et le feu de joie ont une petite lueur locale. */
(() => {
  const R = (k) => { const x = Math.sin(k * 78.233 + 12.9898) * 43758.5453; return x - Math.floor(x); };
  const G = (s) => `<g aria-hidden="true">${s}</g>`;
  const onTable = (s) => G(`<g transform="translate(0 12)">${s}</g>`);
  // une autre fête du jour (pour se pousser un peu quand deux fêtes tombent ensemble)
  const also = (id) => { try { return fetesActives().includes(id); } catch (_) { return false; } };
  const night = (c) => c.per === "night" || c.per === "dusk";
  // petite lueur chaude autour d'une flamme (dégradé du logiciel)
  const glow = (x, y, r, op = .55) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#gStar)" opacity="${op}"/>`;
  // flamme de bougie qui vacille (base en x, y)
  const flame = (x, y, s = 1, i = 0) => `<g class="md-fl" style="transform-origin:${x}px ${y}px;animation-delay:${(-R(i + x) * 1.6).toFixed(2)}s"><path d="M${x} ${y} C${x - 3 * s} ${y - 3 * s} ${x - 1.5 * s} ${y - 8 * s} ${x} ${y - 11 * s} C${x + 1.5 * s} ${y - 8 * s} ${x + 3 * s} ${y - 3 * s} ${x} ${y} Z" fill="#ffb84a"/><path d="M${x} ${y - .6 * s} C${x - 1.2 * s} ${y - 2.5 * s} ${x - .5 * s} ${y - 5 * s} ${x} ${y - 6.5 * s} C${x + .5 * s} ${y - 5 * s} ${x + 1.2 * s} ${y - 2.5 * s} ${x} ${y - .6 * s} Z" fill="#fff4c8"/></g>`;
  // bougie posée (base x, y), hauteur h
  const candle = (x, y, h, col = "#f3ead8", w = 6, lit = true, i = 0) => `<rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" rx="1.2" fill="${col}"/><rect x="${x - w / 2}" y="${y - h}" width="${w * .35}" height="${h}" fill="#fff" opacity=".25"/><line x1="${x}" y1="${y - h}" x2="${x}" y2="${y - h - 2}" stroke="#3a2a1a" stroke-width=".8"/>${lit ? glow(x, y - h - 5, 16, .5) + flame(x, y - h - 1, .85, i) : ""}`;
  // ficelle tendue qui pend (x0 → x1), avec un objet tous les « step »
  const hang = (x0, x1, y0, sag, step, draw, col = "#c9b48a") => {
    let o = `<path d="M${x0} ${y0} Q${(x0 + x1) / 2} ${y0 + sag * 2} ${x1} ${y0}" fill="none" stroke="${col}" stroke-width="1.4"/>`;
    for (let x = x0 + step / 2, k = 0; x < x1; x += step, k++) { const t = (x - x0) / (x1 - x0); o += draw(x, y0 + 4 * sag * t * (1 - t), k); }
    return o;
  };
  // assiette vue de face (base x, y)
  const plate = (x, y, rx, col = "#f4f1ea") => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * .22}" fill="${col}"/><ellipse cx="${x}" cy="${y - 1}" rx="${rx * .72}" ry="${rx * .14}" fill="#000" opacity=".06"/>`;
  const mandarin = (x, y, r = 6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#f28a1a"/><circle cx="${x - r * .3}" cy="${y - r * .3}" r="${r * .3}" fill="#ffb45a" opacity=".7"/><path d="M${x} ${y - r} q3 -4 7 -3 q-3 4 -7 3 Z" fill="#3f8f3a"/>`;
  const choco = (x, y, r = 4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#e3b73e" stroke="#fff0a8" stroke-width=".8"/><circle cx="${x}" cy="${y}" r="${r * .6}" fill="none" stroke="#b88a22" stroke-width=".7"/>`;
  const gingerHeart = (x, y, s, txt = "") => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 14 C-22 2 -16 -16 0 -6 C16 -16 22 2 0 14 Z" fill="#9a5a2a" stroke="#6b3a18" stroke-width="1"/><path d="M0 10.5 C-17 1 -12.5 -12 0 -3 C12.5 -12 17 1 0 10.5 Z" fill="none" stroke="#fff6e8" stroke-width="1.3" stroke-dasharray="2 1.6"/>${txt ? `<text y="3" text-anchor="middle" font-size="5.6" font-weight="700" fill="#fff6e8">${txt}</text>` : ""}</g>`;

  const CSS = `
  .md-fl{animation:mdFl 1.3s ease-in-out infinite alternate}
  @keyframes mdFl{0%{transform:scale(1,1) skewX(0)}40%{transform:scale(.9,1.1) skewX(4deg)}100%{transform:scale(1.06,.94) skewX(-4deg)}}
  .md-tw{animation:mdTw 2.2s ease-in-out infinite}
  @keyframes mdTw{0%,100%{opacity:.25}50%{opacity:1}}
  .md-sw{animation:mdSw 5s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 0}
  @keyframes mdSw{0%{transform:rotate(-3deg)}100%{transform:rotate(3deg)}}
  .md-fire{animation:mdFire .5s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}
  @keyframes mdFire{0%{transform:scale(1,1)}100%{transform:scale(.88,1.14)}}
  .md-spark{animation:mdSpark 2.4s linear infinite}
  @keyframes mdSpark{0%{transform:translate(0,0);opacity:1}100%{transform:translate(var(--dx),-46px);opacity:0}}
  .md-steam{animation:mdSteam 3s ease-in-out infinite}
  @keyframes mdSteam{0%{transform:translate(0,0);opacity:0}30%{opacity:.55}100%{transform:translate(3px,-16px);opacity:0}}
  .md-glow{animation:mdGlow 3s ease-in-out infinite alternate}
  @keyframes mdGlow{0%{opacity:.75}100%{opacity:1}}
  `;

  /* ===================== OKTOBERFEST ===================== */
  const stein = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M10 -24 q11 0 11 9 q0 9 -11 9" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="3.2"/><rect x="-11" y="-30" width="22" height="30" rx="3" fill="rgba(226,160,34,.9)" stroke="rgba(255,255,255,.65)" stroke-width="1.4"/><rect x="-11" y="-30" width="22" height="30" rx="3" fill="none" stroke="rgba(120,70,10,.25)" stroke-width=".6"/>${[-6, 0, 6].map(dx => `<line x1="${dx}" y1="-25" x2="${dx}" y2="-4" stroke="rgba(255,255,255,.28)" stroke-width="2"/>`).join("")}<circle cx="-4" cy="-12" r="1" fill="#fff6c8" opacity=".8"/><circle cx="3" cy="-18" r=".8" fill="#fff6c8" opacity=".8"/><ellipse cy="-31" rx="12.5" ry="5" fill="#fbf6e8"/><circle cx="-6" cy="-34" r="4" fill="#fbf6e8"/><circle cx="4" cy="-35" r="5" fill="#fbf6e8"/><path d="M-11 -29 q-1 6 1 9" stroke="#fbf6e8" stroke-width="2.4" fill="none"/></g>`;
  const stoneStein = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M10 -22 q10 0 10 8 q0 8 -10 8" fill="none" stroke="#8d8a86" stroke-width="3.4"/><path d="M-10 0 L-11 -32 L11 -32 L10 0 Z" fill="#d9d4cb"/><rect x="-11" y="-28" width="22" height="3" fill="#2f5fa8"/><rect x="-11" y="-7" width="22" height="3" fill="#2f5fa8"/><path d="M-5 -16 l5 -5 l5 5 l-5 5 Z" fill="#2f5fa8"/><path d="M-12 -32 Q0 -40 12 -32 Z" fill="#a8a9ad"/><circle cx="9" cy="-36" r="2.4" fill="#a8a9ad"/></g>`;
  const pretzel = (x, y, s = 1, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M-3 7 C-14 12 -22 0 -14 -8 C-8 -13 0 -9 3 -2 L7 7 M3 7 C14 12 22 0 14 -8 C8 -13 0 -9 -3 -2 L-7 7" fill="none" stroke="#7a3f14" stroke-width="5.2" stroke-linecap="round"/><path d="M-3 7 C-14 12 -22 0 -14 -8 C-8 -13 0 -9 3 -2 L7 7 M3 7 C14 12 22 0 14 -8 C8 -13 0 -9 -3 -2 L-7 7" fill="none" stroke="#a65a22" stroke-width="2.6" stroke-linecap="round"/>${[[-15, -4], [-10, -10], [12, -9], [16, -2], [0, -6], [-8, 8], [9, 8]].map(([a, b]) => `<rect x="${a}" y="${b}" width="1.4" height="1.4" fill="#fff" transform="rotate(30 ${a} ${b})"/>`).join("")}</g>`;
  FETES2D["oktoberfest"] = {
    replaces: false,
    greet: () => "C'est l'Oktoberfest ! Des bretzels tout chauds sur la planche, des chopes sur la table… Prost ! (Santé !)",
    wall: (c) => {
      // fanions à losanges bleus et blancs, d'un bout à l'autre du salon
      const defs = `<defs><pattern id="okLoz" width="9" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)"><rect width="9" height="13" fill="#f6f8fb"/><path d="M4.5 0 L9 6.5 L4.5 13 L0 6.5 Z" fill="#2a7fd4"/></pattern></defs>`;
      let o = defs + hang(300, 2300, 30, 26, 46, (x, y, k) => `<path d="M${x - 15} ${y} L${x + 15} ${y} L${x} ${y + 34} Z" fill="${k % 3 === 2 ? "#2a7fd4" : "url(#okLoz)"}" stroke="#1d5a9a" stroke-width=".7"/>`);
      // cœur en pain d'épices accroché au mur, à droite de la cheminée
      o += `<g class="md-sw"><path d="M1752 140 L1736 176 M1752 140 L1768 176" stroke="#2a7fd4" stroke-width="2"/><circle cx="1752" cy="140" r="2.4" fill="#8a6a3a"/>${gingerHeart(1752, 198, 2.1, "PROST !")}</g>`;
      return G(o);
    },
    mantel: () => G(stoneStein(1500, 318, 1) + stoneStein(1622, 318, .85) + `<g transform="translate(1655 318)"><rect x="-1.5" y="-30" width="3" height="30" fill="#6b4a2b"/><path d="M1.5 -30 h22 v15 h-22 Z" fill="url(#okLoz)" stroke="#1d5a9a" stroke-width=".5"/></g>`),
    front: () => {
      // planche à bretzels, deux chopes qui moussent
      let o = `<g transform="translate(1676 614)"><ellipse cx="0" cy="1" rx="44" ry="6" fill="#000" opacity=".25"/><rect x="-42" y="-6" width="84" height="7" rx="3" fill="#a87442"/><rect x="-42" y="-6" width="84" height="2" fill="#c8945a"/><circle cx="46" cy="-2.5" r="3.5" fill="none" stroke="#a87442" stroke-width="2"/></g>`;
      o += pretzel(1652, 596, .95, -6) + pretzel(1690, 597, .9, 8) + pretzel(1672, 586, .8, 0);
      o += stein(1590, 614, .95) + stein(1622, 616, 1);
      return onTable(o);
    },
  };

  /* ===================== SAINT-NICOLAS (6 décembre) ===================== */
  const shoe = (x, y, s, col, flip, fill) => `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})"><path d="M-14 0 L-14 -13 Q-14 -17 -9 -17 L-2 -17 Q2 -9 12 -7 Q20 -5 20 0 Z" fill="${col}"/><path d="M-14 0 L20 0 L20 2 L-14 2 Z" fill="#2a1a10"/><path d="M-12 -15 Q-5 -18 0 -15" stroke="#000" stroke-opacity=".3" stroke-width="2" fill="none"/></g>${fill}`;
  const donkey = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-20" y="-6" width="40" height="5" rx="1.5" fill="#8a5a2f"/>${[-14, 14].map(cx => `<circle cx="${cx}" cy="0" r="4.2" fill="#5a3a1c"/><circle cx="${cx}" cy="0" r="1.4" fill="#c9a26b"/>`).join("")}
    <rect x="-12" y="-16" width="3.5" height="11" fill="#b07a44"/><rect x="7" y="-16" width="3.5" height="11" fill="#b07a44"/><rect x="-14" y="-27" width="27" height="13" rx="6" fill="#c08a52"/><rect x="-14" y="-24" width="27" height="3" fill="#c4122f"/>
    <path d="M10 -24 L17 -36 L25 -34 L22 -26 Z" fill="#c08a52"/><path d="M17 -36 L15 -46 L19 -37 Z M21 -35 L22 -45 L24 -35 Z" fill="#a8723e"/><circle cx="20" cy="-32" r="1.1" fill="#2a1a10"/><path d="M-14 -24 q-6 4 -5 10" stroke="#5a3a1c" stroke-width="2" fill="none"/><path d="M12 -29 L19 -38" stroke="#5a3a1c" stroke-width="2.4"/></g>`;
  const gingerMan = (x, y, s = 1, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><circle cy="-9" r="4" fill="#a8642c"/><path d="M-3 -6 L3 -6 L8 -3 L8 -1 L3 -2 L5 7 L2 7 L0 2 L-2 7 L-5 7 L-3 -2 L-8 -1 L-8 -3 Z" fill="#a8642c"/><path d="M-6 -2 L-3 -3 M6 -2 L3 -3" stroke="#fff" stroke-width=".8"/><circle cx="0" cy="0" r=".9" fill="#fff"/><circle cx="0" cy="3" r=".9" fill="#c4122f"/></g>`;
  FETES2D["stnicolas"] = {
    replaces: false,
    greet: (c) => c.day === 5 ? "Ce soir, c'est la veille de la Saint-Nicolas : les chaussures attendent devant la cheminée, et une carotte pour l'âne. On verra demain matin…" : c.h < 12 ? "6 décembre, Saint-Nicolas : les chaussures devant la cheminée se sont remplies cette nuit. Mandarines, pain d'épices, chocolats… et l'âne a mangé sa carotte." : "Saint-Nicolas ! Des mandarines et du pain d'épices dans les chaussures, devant la cheminée. L'âne en bois garde le tout.",
    mantel: (c) => {
      // l'âne en bois sur la cheminée, et des chaussures remplies devant le foyer (vides la veille)
      const eve = c.day === 5;
      let o = donkey(1488, 316, .95);
      const fill1 = mandarin(1484, 579) + mandarin(1494, 582, 5) + gingerMan(1476, 584, .9, -15) + choco(1490, 590);
      const fill2 = gingerHeart(1528, 580, .55) + choco(1520, 588) + choco(1530, 590, 3.6);
      const fill3 = mandarin(1601, 581) + gingerMan(1611, 584, .8, 12) + choco(1596, 590);
      o += `<g transform="translate(1545 600) scale(1.45) translate(-1545 -600)">` + shoe(1486, 600, 1, "#7a2a1e", false, eve ? "" : fill1) + shoe(1528, 600, .85, "#2f4f8a", true, eve ? "" : fill2) + shoe(1604, 600, 1, "#3a3a3e", true, eve ? "" : fill3);
      // la carotte de l'âne, grignotée
      o += `<g transform="translate(1636 598) rotate(-8)"><path d="M0 0 L13 -2.5 L13 2.5 Z" fill="#ff8a2a"/>${eve ? `<path d="M13 -2.5 L22 0 L13 2.5 Z" fill="#ff8a2a"/>` : `<path d="M13 -2.5 q2.5 2.5 0 5" stroke="#ffc68a" stroke-width="1.6" fill="none"/>`}<path d="M0 0 l-5 -4 M0 0 l-6 0 M0 0 l-5 4" stroke="#3f8f3a" stroke-width="1.6"/></g></g>`;
      return G(o);
    },
    front: (c) => c.day === 5 ? "" : onTable(plate(1666, 614, 30) + mandarin(1650, 606) + mandarin(1663, 605, 6.5) + mandarin(1656, 597, 5.5) + gingerHeart(1684, 604, .5) + choco(1676, 609, 3.4) + choco(1694, 610, 3.4)),
  };

  /* ===================== CARNAVAL ===================== */
  const mask = (x, y, s, col, col2, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M-24 -4 Q-24 -14 -12 -12 Q0 -9 12 -12 Q24 -14 24 -4 Q22 8 10 8 Q4 8 0 3 Q-4 8 -10 8 Q-22 8 -24 -4 Z" fill="${col}"/><path d="M-17 -3 Q-11 -9 -5 -3 Q-11 1 -17 -3 Z M17 -3 Q11 -9 5 -3 Q11 1 17 -3 Z" fill="#1a1420"/><path d="M-24 -4 Q-24 -14 -12 -12 Q0 -9 12 -12 Q24 -14 24 -4" fill="none" stroke="${col2}" stroke-width="2"/>${[-18, -9, 9, 18].map(dx => `<circle cx="${dx}" cy="5" r="1.2" fill="${col2}"/>`).join("")}<path d="M-20 -12 Q-28 -30 -16 -36 Q-18 -24 -14 -13 Z" fill="${col2}"/><path d="M-16 -12 Q-14 -32 -4 -34 Q-10 -22 -9 -12 Z" fill="${col}" opacity=".85"/><path d="M24 -4 q10 6 6 22" stroke="${col2}" stroke-width="1.6" fill="none"/></g>`;
  const curl = (x, y, len, col, k) => { let d = `M${x} ${y}`; for (let i = 1; i <= len; i++) d += ` q${(i % 2 ? 7 : -7)} 3 0 7`; return `<path d="${d}" stroke="${col}" stroke-width="2.2" fill="none" stroke-linecap="round" class="md-sw" style="animation-delay:${-k * .7}s"/>`; };
  const CONF = ["#ff3b6b", "#ffd23a", "#3ad1ff", "#7dff6a", "#c26bff", "#ff8a2a"];
  const confetti = (x0, x1, y0, y1, n, seed, skip) => { let o = ""; for (let i = 0; i < n; i++) { const x = x0 + R(seed + i) * (x1 - x0), y = y0 + R(seed + i + 500) * (y1 - y0); if (skip && skip(x, y)) continue; o += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(2.5 + R(i + seed + 9) * 2).toFixed(1)}" height="2" fill="${CONF[i % 6]}" transform="rotate(${(R(i + seed + 3) * 180) | 0} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; } return o; };
  const bugne = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-9 -4 Q0 -7 9 -4 Q11 0 9 4 Q0 7 -9 4 Q-11 0 -9 -4 Z" fill="#d79a4a"/><path d="M-3 -1 L3 1" stroke="#9a5a22" stroke-width="2.4" stroke-linecap="round"/><circle cx="-5" cy="-2" r="1.3" fill="#fff8ee"/><circle cx="4" cy="-3" r="1.1" fill="#fff8ee"/><circle cx="6" cy="2" r="1.2" fill="#fff8ee"/><circle cx="-2" cy="3" r="1" fill="#fff8ee"/></g>`;
  FETES2D["carnaval"] = {
    replaces: false,
    greet: () => "C'est Carnaval ! Des masques au mur, des serpentins partout, des confettis jusque sous le tapis… et des beignets encore tièdes sur la table.",
    wall: () => {
      let o = "";
      // serpentins qui pendent du plafond
      for (let i = 0; i < 26; i++) { const x = 330 + i * 76 + R(i) * 30; if (x > 1180 && x < 1300) continue; o += curl(x, 0, 6 + ((R(i + 7) * 9) | 0), CONF[i % 6], i); }
      // masques au mur, à droite de la cheminée
      o += `<path d="M1744 150 Q1790 190 1834 214" stroke="#ffd23a" stroke-width="2" fill="none"/>` + mask(1752, 170, 1.15, "#7a2ad8", "#ffd23a", -12) + mask(1828, 214, .95, "#e8285a", "#3ad1ff", 10);
      // quelques confettis collés au mur
      o += confetti(1010, 1060, 260, 470, 10, 40) + confetti(1715, 1880, 110, 240, 18, 80);
      return G(o);
    },
    mantel: () => {
      // un masque posé sur la cheminée, des serpentins qui tombent du rebord
      let o = mask(1600, 304, .68, "#18a878", "#ffd23a", -8);
      [1458, 1520, 1604, 1676].forEach((x, k) => { o += curl(x, 322, 3 + (k % 2), CONF[(k + 2) % 6], k + 40); });
      // confettis par terre (pas sur le canapé)
      o += confetti(560, 2150, 604, 716, 160, 7, (x, y) => x > 905 && x < 1375);
      return G(o);
    },
    front: () => {
      let o = plate(1690, 614, 30);
      [[1676, 606, 10], [1694, 607, -15], [1708, 606, 30], [1684, 598, -30], [1700, 598, 5], [1692, 590, 18]].forEach(([x, y, r]) => { o += bugne(x, y, r); });
      o += confetti(1420, 1735, 612, 618, 22, 300);
      return onTable(o);
    },
  };

  /* ===================== SAINTE-LUCIE (13 décembre) ===================== */
  const lussekatt = (x, y, s = 1, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M-8 -3 C-14 -10 -2 -12 -2 -4 C-2 3 2 3 2 -2 M2 -2 C2 -10 14 -10 8 -2 C2 6 -4 4 -8 -3" fill="none" stroke="#e8a21a" stroke-width="5.2" stroke-linecap="round"/><path d="M-8 -3 C-14 -10 -2 -12 -2 -4 C-2 3 2 3 2 -2 M2 -2 C2 -10 14 -10 8 -2" fill="none" stroke="#ffc94a" stroke-width="1.8" stroke-linecap="round"/><circle cx="-7.5" cy="-6" r="1.6" fill="#4a1a10"/><circle cx="7.5" cy="-5" r="1.6" fill="#4a1a10"/></g>`;
  const crown = (x, y, s = 1) => {
    // couronne de feuillage posée à plat (vue de devant), sept bougies blanches
    let back = "", frontc = "", leaves = "";
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, lx = Math.cos(a) * 30, ly = Math.sin(a) * 7; leaves += `<ellipse cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="6" ry="3" fill="${i % 2 ? "#1f5c34" : "#2f7a45"}" transform="rotate(${(a * 57 + 40) | 0} ${lx.toFixed(1)} ${ly.toFixed(1)})"/>`; if (i % 3 === 0) leaves += `<circle cx="${(lx * .95).toFixed(1)}" cy="${(ly + 2).toFixed(1)}" r="1.7" fill="#d4142a"/>`; }
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * .62, cx = Math.cos(a) * 24, cy = Math.sin(a) * 5.5, h = 22 - Math.abs(i - 3) * 1.5; const s1 = candle(cx, cy, h, "#fbf8f0", 4.6, true, i + 70); if (cy < 0) back += s1; else frontc += s1; }
    // les bougies de devant
    for (let i = 0; i < 2; i++) { const cx = (i ? 1 : -1) * 18, cy = 5; frontc += candle(cx, cy, 18, "#fbf8f0", 4.6, true, i + 90); }
    return `<g transform="translate(${x} ${y}) scale(${s})">${back}${leaves}${frontc}</g>`;
  };
  const strawStar = (x, y, r) => `<g transform="translate(${x} ${y})"><g class="md-sw"><line x1="0" y1="${-r - 16}" x2="0" y2="${-r}" stroke="#c4122f" stroke-width="1.2"/>${[0, 45, 90, 135].map(a => `<line x1="${-r}" y1="0" x2="${r}" y2="0" stroke="#a8803a" stroke-width="3.4" transform="rotate(${a})"/><line x1="${-r}" y1="0" x2="${r}" y2="0" stroke="#e8c87a" stroke-width="1.8" transform="rotate(${a})"/>`).join("")}${[22.5, 67.5, 112.5, 157.5].map(a => `<line x1="${-r * .6}" y1="0" x2="${r * .6}" y2="0" stroke="#b8903a" stroke-width="1.8" transform="rotate(${a})"/>`).join("")}<circle r="${r * .3}" fill="none" stroke="#c4122f" stroke-width="1.6"/></g></g>`;
  FETES2D["stelucie"] = {
    replaces: false,
    greet: () => "13 décembre, Sainte-Lucie : la nuit la plus longue de l'ancien calendrier. Une couronne de bougies brille sur la table, à côté des brioches au safran.",
    window: () => G(strawStar(962, 222, 20)),
    front: () => {
      let o = plate(1602, 614, 26) + lussekatt(1592, 608, .9, -8) + lussekatt(1612, 609, .9, 10) + lussekatt(1602, 600, .85, 0);
      o += `<g transform="translate(1676 613)"><ellipse rx="40" ry="8" fill="#000" opacity=".22"/></g>` + crown(1680, 604, 1.3);
      return onTable(o);
    },
    mantel: () => G([1458, 1478, 1500].map((x, k) => gingerHeart(x, 309, .42)).join("") + strawStar(1640, 286, 9)),
  };

  /* ===================== FÊTE DES LUMIÈRES (8 décembre, Lyon) ===================== */
  const lumignon = (x, y, i, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${glow(0, -12, 15, .55)}<path d="M-5 0 L-5.6 -12 L5.6 -12 L5 0 Z" fill="rgba(255,236,190,.35)" stroke="rgba(255,255,255,.55)" stroke-width=".8"/><rect x="-4.4" y="-5" width="8.8" height="4.4" fill="#f6efe0" opacity=".9"/><ellipse cy="-12" rx="5.6" ry="1.4" fill="none" stroke="rgba(255,255,255,.6)" stroke-width=".7"/>${flame(0, -5.6, .65, i)}</g>`;
  FETES2D["lumieres"] = {
    replaces: false,
    greet: (c) => c.day !== 8 ? "Fête des Lumières : Lyon s'illumine jusqu'au 8 décembre. Ici aussi : des lumignons sur le rebord de la fenêtre et sur la cheminée." : night(c) ? "8 décembre, Fête des Lumières : une rangée de lumignons sur le rebord de la fenêtre et sur la cheminée. Dehors, toute la ville fait pareil." : "8 décembre, Fête des Lumières : les lumignons sont prêts sur le rebord de la fenêtre et sur la cheminée. On les allume ce soir… enfin, ils sont déjà allumés.",
    wall: () => { let o = ""; const han = also("hanoukka"); for (let i = 0; i < 11; i++) { const x = 796 + i * 20.8; if (han && Math.abs(x - 904) < 22) continue; o += lumignon(x, 398, i); } return G(o); },
    mantel: () => { let o = ""; (also("stnicolas") ? [1452, 1514, 1610, 1628, 1646, 1664] : [1454, 1472, 1490, 1508, 1616, 1634, 1652, 1670]).forEach((x, i) => { o += lumignon(x, 318, i + 20, .95); }); return G(o); },
    window: (c) => {
      if (!night(c)) return "";
      // au loin, les fenêtres de la ville ont aussi leurs lumignons
      let o = "";
      for (let i = 0; i < 26; i++) { const x = 806 + R(i + 300) * 190, y = 352 + R(i + 400) * 26; o += `<circle class="md-tw" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.1" fill="#ffd27a" style="animation-delay:${(-R(i) * 2).toFixed(2)}s"/>`; }
      return G(o);
    },
  };

  /* ===================== SAINT-JEAN / SÃO JOÃO (23–24 juin) ===================== */
  const BAND = ["#ff3b3b", "#ffcf2a", "#2ab0ff", "#3ad16a", "#ff7ad9", "#ff8a2a", "#8a5cff"];
  FETES2D["stjean"] = {
    replaces: false,
    greet: (c) => night(c) || c.h >= 18 ? "Saint-Jean ! Au fond du jardin, le feu de joie crépite. Des fanions de toutes les couleurs, et le bouquet d'herbes de la Saint-Jean sur la table." : "Saint-Jean : les fanions sont accrochés, le bouquet d'herbes est cueilli. Ce soir, on allume le grand feu au fond du jardin.",
    wall: () => {
      // petits fanions carrés (bandeirinhas), deux rangées croisées
      const flag = (x, y, k) => `<path d="M${x - 9} ${y} L${x + 9} ${y} L${x + 9} ${y + 20} L${x} ${y + 14} L${x - 9} ${y + 20} Z" fill="${BAND[k % 7]}" stroke="rgba(0,0,0,.2)" stroke-width=".5"/>`;
      return G(hang(300, 2300, 24, 30, 26, (x, y, k) => flag(x, y, k)) + hang(300, 2300, 86, -18, 30, (x, y, k) => flag(x, y, k + 3)));
    },
    window: (c) => {
      const lit = night(c) || c.h >= 18;
      // le grand feu au fond du jardin
      let o = `<g transform="translate(948 356) scale(.62)">`;
      o += `<path d="M-16 0 L-2 -20 M16 0 L2 -20 M-10 0 L4 -22 M10 0 L-4 -22" stroke="#4a2e18" stroke-width="3.4" stroke-linecap="round"/><ellipse cy="1" rx="20" ry="3" fill="#2a1a10"/>`;
      if (lit) {
        o += `<circle cy="-14" r="34" fill="url(#gStar)" opacity=".75" class="md-glow"/><g class="md-fire"><path d="M-14 0 C-18 -14 -6 -20 -8 -34 C0 -26 2 -40 6 -46 C8 -32 18 -26 14 0 Z" fill="#ff6a1f"/><path d="M-8 0 C-10 -10 -2 -16 -2 -26 C4 -20 6 -30 8 -34 C10 -22 12 -14 8 0 Z" fill="#ffb43a"/><path d="M-3 0 C-4 -6 0 -10 1 -16 C4 -10 5 -6 3 0 Z" fill="#fff0b0"/></g>`;
        for (let i = 0; i < 7; i++) o += `<circle class="md-spark" cx="${(R(i) * 16 - 8).toFixed(1)}" cy="-30" r="1" fill="#ffd27a" style="--dx:${(R(i + 9) * 20 - 10).toFixed(1)}px;animation-delay:${(-i * .35).toFixed(2)}s"/>`;
      }
      return G(o + `</g>`);
    },
    front: () => {
      // bouquet d'herbes de la Saint-Jean (millepertuis, armoise, fougère) dans un bocal, noué d'un ruban
      let o = `<g transform="translate(1664 614)"><path d="M-9 0 L-10 -20 L10 -20 L9 0 Z" fill="rgba(200,230,255,.35)" stroke="rgba(255,255,255,.6)" stroke-width="1"/><rect x="-9" y="-12" width="18" height="12" fill="rgba(120,170,200,.25)"/>`;
      for (let i = 0; i < 9; i++) { const a = -1.1 + i * .27, l = 34 + R(i) * 12, tx = Math.sin(a) * l, ty = -18 - Math.cos(a) * l; o += `<path d="M0 -14 Q${(tx * .4).toFixed(1)} ${(ty * .6).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}" stroke="#4f7a2a" stroke-width="1.3" fill="none"/>`;
        if (i % 3 === 0) { for (let k = 0; k < 5; k++) o += `<ellipse cx="${(tx * (1 - k * .14)).toFixed(1)}" cy="${(ty * (1 - k * .14)).toFixed(1)}" rx="4.5" ry="1.6" fill="#3f8f3a" transform="rotate(${(a * 57 + 60) | 0} ${(tx * (1 - k * .14)).toFixed(1)} ${(ty * (1 - k * .14)).toFixed(1)})"/>`; }
        else if (i % 3 === 1) { for (let k = 0; k < 3; k++) o += `<circle cx="${(tx + (k - 1) * 3).toFixed(1)}" cy="${(ty + (k % 2) * 2).toFixed(1)}" r="2.3" fill="#ffd23a"/><circle cx="${(tx + (k - 1) * 3).toFixed(1)}" cy="${(ty + (k % 2) * 2).toFixed(1)}" r=".9" fill="#c98a1a"/>`; }
        else { o += `<ellipse cx="${tx.toFixed(1)}" cy="${(ty + 3).toFixed(1)}" rx="2" ry="6" fill="#9ab07a"/>`; } }
      o += `<path d="M-6 -18 L6 -18" stroke="#c4122f" stroke-width="3"/><path d="M0 -18 l-6 8 M0 -18 l5 8" stroke="#c4122f" stroke-width="1.6"/></g>`;
      return onTable(`<g transform="translate(1664 614) scale(1.35) translate(-1664 -614)">${o}</g>`);
    },
  };

  /* ===================== THANKSGIVING (États-Unis / Canada) ===================== */
  const LEAF = ["#d9481a", "#e8902a", "#c4122f", "#f2c23a", "#8a4a1a", "#b8361a"];
  const maple = (x, y, s, col, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 -12 L2 -7 L6 -9 L5 -3 L10 -5 L8 0 L11 1 L5 4 L6 7 L1 6 L1 12 L-1 12 L-1 6 L-6 7 L-5 4 L-11 1 L-8 0 L-10 -5 L-5 -3 L-6 -9 L-2 -7 Z" fill="${col}"/><path d="M0 10 L0 -6" stroke="#000" stroke-opacity=".2" stroke-width=".7"/></g>`;
  const oak = (x, y, s, col, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 -11 Q4 -9 3 -6 Q7 -5 5 -1 Q8 1 4 4 Q5 8 0 11 Q-5 8 -4 4 Q-8 1 -5 -1 Q-7 -5 -3 -6 Q-4 -9 0 -11 Z" fill="${col}"/></g>`;
  const corn = (x, y, s, rot, cols) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 -2 Q-12 6 -10 20 Q-4 10 0 4 Q4 10 10 20 Q12 6 0 -2 Z" fill="#d8c08a"/><ellipse cy="-16" rx="6" ry="15" fill="${cols[0]}"/>${Array.from({ length: 18 }, (_, i) => `<circle cx="${(i % 3 - 1) * 3.2}" cy="${-28 + Math.floor(i / 3) * 4.4}" r="1.6" fill="${cols[(i * 7) % cols.length]}"/>`).join("")}</g>`;
  const turkey = (x, y) => `<g transform="translate(${x} ${y})"><ellipse rx="46" ry="8" fill="#f4f1ea"/><ellipse cy="-1" rx="38" ry="5" fill="#e6dccb"/>${[[-32, -2], [-24, -4], [28, -3], [34, -1]].map(([a, b]) => `<circle cx="${a}" cy="${b}" r="3" fill="#3f8f3a"/>`).join("")}<circle cx="-28" cy="-5" r="2.6" fill="#c4122f"/><circle cx="31" cy="-5" r="2.6" fill="#f28a1a"/>
    <path d="M-28 -4 Q-30 -30 0 -32 Q30 -30 28 -4 Z" fill="#b8641e"/><path d="M-24 -8 Q-24 -26 -2 -28 Q-18 -22 -18 -8 Z" fill="#d88a3a" opacity=".7"/><path d="M14 -10 Q30 -18 34 -24 Q40 -26 38 -20 Q34 -12 20 -6 Z" fill="#a8561a"/><path d="M34 -24 l5 -4 M38 -21 l5 -2" stroke="#f4f1ea" stroke-width="2.4" stroke-linecap="round"/><path d="M-14 -10 Q-30 -18 -34 -24 Q-40 -26 -38 -20 Q-34 -12 -20 -6 Z" fill="#a8561a"/><path d="M-34 -24 l-5 -4 M-38 -21 l-5 -2" stroke="#f4f1ea" stroke-width="2.4" stroke-linecap="round"/></g>`;
  const pie = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-22 0 L-19 -8 L19 -8 L22 0 Z" fill="#c98a4a"/><ellipse cy="-8" rx="19" ry="4.2" fill="#d97a1e"/><ellipse cy="-8" rx="19" ry="4.2" fill="none" stroke="#e8b06a" stroke-width="2.4" stroke-dasharray="3 1.5"/><path d="M0 -8 L19 -8 L16 -5.5 Z" fill="#f4f1ea"/><ellipse cx="4" cy="-10" rx="4" ry="1.6" fill="#fbf6ee"/></g>`;
  const leafWreath = (x, y, r, isCa) => {
    let o = "";
    for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2, lx = x + Math.cos(a) * r, ly = y + Math.sin(a) * r, col = LEAF[i % 6], rot = (a * 57 + 90) | 0;
      o += (i % 2 && isCa) || (i % 3 === 0) ? maple(lx, ly, .95, col, rot) : oak(lx, ly, .95, col, rot); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + .3; o += `<circle cx="${x + Math.cos(a) * r * .82}" cy="${y + Math.sin(a) * r * .82}" r="3" fill="${i % 2 ? "#e8902a" : "#8a4a1a"}"/>`; }
    o += `<path d="M${x - 8} ${y + r + 2} l-6 14 M${x + 8} ${y + r + 2} l6 14" stroke="#c98a3a" stroke-width="4"/><circle cx="${x}" cy="${y + r + 2}" r="4" fill="#c98a3a"/>`;
    if (isCa) o += maple(x, y, 2.1, "#d4142a");
    return o;
  };
  const thanks = (isCa) => ({
    replaces: false,
    greet: (c) => !isCa && new Date(c.y, c.m - 1, c.day).getDay() !== 4 ? "Week-end de Thanksgiving : il reste de la dinde, et encore une part de tarte à la citrouille. On dit merci… même à la télé." : isCa ? "C'est l'Action de grâce ! Une dinde, une tarte à la citrouille, des épis de maïs et une couronne de feuilles d'érable. Merci, l'automne." : "C'est Thanksgiving ! La dinde est sur la table, la tarte à la citrouille refroidit à côté. Ici, on dit merci… même à la télé.",
    wall: () => {
      // couronne de feuilles d'automne au mur, épis de maïs décoratifs noués en dessous
      let o = leafWreath(1752, 172, 32, isCa);
      const cc = [["#c4122f", "#f2c23a", "#6b2a8a", "#e8902a", "#f4e6c0"], ["#f2c23a", "#d9481a", "#f4e6c0", "#8a1a2a"], ["#6b2a8a", "#c4122f", "#f2c23a", "#2a2a5a"]];
      o += `<g transform="translate(1752 244)">${corn(-9, 30, .9, 14, cc[0])}${corn(9, 30, .9, -14, cc[1])}${corn(0, 34, 1, 0, cc[2])}<path d="M-7 2 Q0 -4 7 2" stroke="#c98a3a" stroke-width="3" fill="none"/><line x1="0" y1="-18" x2="0" y2="0" stroke="#c98a3a" stroke-width="1.6"/></g>`;
      return G(o);
    },
    mantel: () => {
      // petites courges, feuilles et lettres MERCI sur la cheminée
      let o = `<g transform="translate(1474 318)"><ellipse cx="-8" cy="-7" rx="9" ry="7" fill="#e8902a"/><ellipse cx="-12" cy="-7" rx="3" ry="7" fill="#d9781a"/><rect x="-9" y="-16" width="2" height="4" fill="#4a6b2a"/><ellipse cx="10" cy="-6" rx="7" ry="6" fill="#f2e6c0"/><rect x="9" y="-14" width="2" height="3" fill="#4a6b2a"/></g>`;
      "MERCI".split("").forEach((ch, i) => { const x = 1588 + i * 17; o += `<g transform="rotate(${(R(i + 5) * 10 - 5).toFixed(1)} ${x} 309)"><rect x="${x - 7.5}" y="301" width="15" height="16" rx="1.2" fill="#e8d2a6" stroke="#b89a6a" stroke-width=".6"/><text x="${x}" y="313.5" text-anchor="middle" font-size="12" font-weight="700" fill="${LEAF[i]}">${ch}</text></g>`; });
      [1500, 1530, 1560].forEach((x, i) => { o += isCa ? maple(x, 314, .6, LEAF[i], i * 40 - 30) : oak(x, 314, .6, LEAF[i], i * 50 - 40); });
      return G(o);
    },
    front: () => {
      let o = turkey(1626, 614) + pie(1708, 616);
      if (isCa) o += maple(1676, 618, .7, "#d4142a", 20);
      return onTable(o);
    },
  });
  FETES2D["thanksgiving_us"] = thanks(false);
  FETES2D["thanksgiving_ca"] = thanks(true);

  /* ===================== DÍA DE MUERTOS (1er–2 novembre) ===================== */
  const PICADO = ["#ff3b8a", "#ff8a1a", "#8a4bff", "#2ac46a", "#2ab0ff", "#ffd21a"];
  const picado = (x, y, w, h, col, k) => {
    // papier découpé : rectangle à bord festonné, motifs ajourés (fleur, losanges)
    const x0 = x - w / 2; let d = `M${x0} ${y} H${x0 + w} V${y + h}`;
    for (let i = 0; i < 6; i++) d += ` l${-w / 12} 3 l${-w / 12} -3`;
    d += ` Z`;
    const cx = x, cy = y + h * .48;
    d += ` M${cx} ${cy - 5} l3 5 l-3 5 l-3 -5 Z`;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, px = cx + Math.cos(a) * 7.5, py = cy + Math.sin(a) * 7.5; d += ` M${(px + 1.6).toFixed(1)} ${py.toFixed(1)} a1.6 1.6 0 1 0 -3.2 0 a1.6 1.6 0 1 0 3.2 0 Z`; }
    d += ` M${x0 + 3} ${y + 3} h3 v3 h-3 Z M${x0 + w - 6} ${y + 3} h3 v3 h-3 Z`;
    return `<path d="${d}" fill="${col}" fill-rule="evenodd" class="md-sw" style="animation-delay:${-k * .6}s"/>`;
  };
  const marigold = (x, y, r = 4.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ff8a00"/><circle cx="${x - r * .3}" cy="${y - r * .3}" r="${r * .55}" fill="#ffb02a"/><circle cx="${x}" cy="${y}" r="${r * .25}" fill="#e05a00"/>`;
  const sugarSkull = (x, y, s, c1, c2) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-9 -6 Q-9 -18 0 -18 Q9 -18 9 -6 Q9 0 5 2 L5 6 Q0 8 -5 6 L-5 2 Q-9 0 -9 -6 Z" fill="#fbf7f0"/><circle cx="-3.6" cy="-7" r="3" fill="${c1}"/><circle cx="3.6" cy="-7" r="3" fill="${c1}"/>${[0, 1, 2, 3, 4, 5].map(i => `<circle cx="${(-3.6 + Math.cos(i * 1.05) * 3.6).toFixed(1)}" cy="${(-7 + Math.sin(i * 1.05) * 3.6).toFixed(1)}" r=".9" fill="${c2}"/><circle cx="${(3.6 + Math.cos(i * 1.05) * 3.6).toFixed(1)}" cy="${(-7 + Math.sin(i * 1.05) * 3.6).toFixed(1)}" r=".9" fill="${c2}"/>`).join("")}<circle cx="-3.6" cy="-7" r="1.1" fill="#fff"/><circle cx="3.6" cy="-7" r="1.1" fill="#fff"/><path d="M0 -3.6 l-1.3 1.6 l1.3 1 l1.3 -1 Z" fill="#ff5a9a"/><path d="M-4 1.5 Q0 4.5 4 1.5" stroke="#ff5a9a" stroke-width="1" fill="none"/><path d="M-3 2.6 v1.6 M-1 3.2 v1.6 M1 3.2 v1.6 M3 2.6 v1.6" stroke="#c9bfb0" stroke-width=".5"/><circle cy="-14" r="2" fill="${c2}"/>${[0, 1, 2, 3, 4].map(i => `<circle cx="${(Math.cos(i * 1.26) * 2.6).toFixed(1)}" cy="${(-14 + Math.sin(i * 1.26) * 2.6).toFixed(1)}" r="1.1" fill="${c1}"/>`).join("")}<path d="M-8 -3 q1 -1 2 0 M6 -3 q1 -1 2 0" stroke="${c2}" stroke-width=".9" fill="none"/></g>`;
  const panMuerto = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-13 0 Q-13 -13 0 -13 Q13 -13 13 0 Z" fill="#c9782a"/><path d="M-10 -4 Q-6 -12 0 -12 M10 -4 Q6 -12 0 -12 M-7 -1 Q0 -8 7 -1" stroke="#a85a1a" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cy="-13" r="2.6" fill="#a85a1a"/>${[-8, -3, 3, 8].map(dx => `<circle cx="${dx}" cy="-6" r=".7" fill="#fff6e0"/>`).join("")}</g>`;
  FETES2D["muertos"] = {
    replaces: false,
    greet: () => "Día de Muertos : un autel coloré sous la fenêtre, des fleurs de souci, des bougies et des têtes de mort en sucre qui sourient. On se souvient de ceux qu'on aime, en douceur.",
    wall: () => {
      // papel picado tendu en haut des murs, en deux guirlandes
      let o = hang(300, 2300, 10, 14, 34, (x, y, k) => picado(x, y, 28, 30, PICADO[k % 6], k), "#ffffff");
      o += hang(776, 1024, 104, 10, 31, (x, y, k) => picado(x, y, 26, 26, PICADO[(k + 3) % 6], k + 9), "#ffffff");
      return G(o);
    },
    mantel: () => {
      // l'autel (ofrenda) sous la fenêtre : trois marches drapées, arche de soucis
      const x0 = 840; let o = "";
      // arche de fleurs de souci
      for (let i = 0; i <= 26; i++) { const a = Math.PI - i / 26 * Math.PI, ax = x0 + Math.cos(a) * 62, ay = 540 - Math.sin(a) * 118; o += marigold(ax.toFixed(1), ay.toFixed(1), 5.2); }
      // les trois marches
      const tiers = [[134, 600, 46, "#ff3b8a"], [104, 554, 40, "#8a4bff"], [72, 514, 36, "#ff8a1a"]];
      tiers.forEach(([w, yb, h, col], k) => {
        o += `<rect x="${x0 - w / 2}" y="${yb - h}" width="${w}" height="${h}" fill="${col}"/><rect x="${x0 - w / 2}" y="${yb - h}" width="${w}" height="4" fill="#fff" opacity=".35"/>`;
        let sc = `M${x0 - w / 2} ${yb - h + 4}`; for (let i = 0; i < 10; i++) sc += ` l${w / 20} 6 l${w / 20} -6`; o += `<path d="${sc} V${yb - h} H${x0 - w / 2} Z" fill="${PICADO[(k + 4) % 6]}"/>`;
        for (let i = 0; i < 4; i++) o += `<circle cx="${x0 - w / 2 + (i + .5) * w / 4}" cy="${yb - h / 2 + 2}" r="2.2" fill="#fff" opacity=".35"/>`;
      });
      // marche du haut : un cadre (un paysage, une fleur), deux bougies
      o += `<g transform="translate(${x0} 478)"><rect x="-13" y="-24" width="26" height="24" rx="2" fill="#c9a24a"/><rect x="-10" y="-21" width="20" height="18" fill="#9ad0ff"/><path d="M-10 -3 L-4 -11 L1 -6 L5 -10 L10 -3 Z" fill="#4a8a4a"/><circle cx="5" cy="-16" r="2.4" fill="#ffd21a"/></g>`;
      o += candle(x0 - 24, 478, 18, "#fbf2e0", 5, true, 1) + candle(x0 + 24, 478, 14, "#fbf2e0", 5, true, 2);
      // marche du milieu : têtes de mort en sucre, pan de muerto
      o += sugarSkull(x0 - 32, 514, .9, "#2ab0ff", "#ff3b8a") + panMuerto(x0, 514) + sugarSkull(x0 + 32, 514, .9, "#2ac46a", "#ff8a1a");
      // marche du bas : vases de soucis, bougies, une tasse de chocolat
      [[x0 - 52, 554], [x0 + 52, 554]].forEach(([vx, vy], k) => { o += `<path d="M${vx - 6} ${vy} L${vx - 7} ${vy - 14} L${vx + 7} ${vy - 14} L${vx + 6} ${vy} Z" fill="${k ? "#2ab0ff" : "#ffd21a"}"/>`; for (let i = 0; i < 6; i++) o += marigold(vx + (i % 3 - 1) * 6, vy - 18 - Math.floor(i / 3) * 7, 4.2); });
      o += candle(x0 - 28, 554, 22, "#fbf2e0", 6, true, 3) + candle(x0 + 28, 554, 16, "#fbf2e0", 6, true, 4) + candle(x0 - 12, 554, 12, "#ffcfe0", 5, true, 5);
      o += `<g transform="translate(${x0 + 10} 554)"><rect x="-6" y="-11" width="12" height="11" rx="2" fill="#e8e0d0"/><path d="M6 -8 q5 0 5 4 q0 4 -5 4" fill="none" stroke="#e8e0d0" stroke-width="1.6"/><ellipse cy="-11" rx="6" ry="1.6" fill="#5a2e14"/><path class="md-steam" d="M-2 -14 q-2 -4 0 -7" stroke="#fff" stroke-width="1" fill="none" opacity=".5"/></g>`;
      // pétales de soucis : un petit chemin sur le plancher
      for (let i = 0; i < 46; i++) { const t = i / 46, px = x0 - 20 - t * 260 + (R(i) - .5) * 26, py = 606 + t * 100 + (R(i + 50) - .5) * 10; if (px > 905) continue; o += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="2.6" ry="1.4" fill="${i % 3 ? "#ff8a00" : "#ffb02a"}" transform="rotate(${(R(i + 7) * 180) | 0} ${px.toFixed(1)} ${py.toFixed(1)})"/>`; }
      return G(o);
    },
  };

  /* ===================== CARNAVAL DE RIO ===================== */
  const FEATH = ["#ff3b8a", "#ffd21a", "#2ac46a", "#2ab0ff", "#ff8a1a", "#b04bff"];
  const feather = (x, y, len, ang, col) => { const tx = x + Math.sin(ang) * len, ty = y - Math.cos(ang) * len, mx = x + Math.sin(ang) * len * .55, my = y - Math.cos(ang) * len * .55; const nx = Math.cos(ang) * len * .16, ny = Math.sin(ang) * len * .16;
    return `<path d="M${x} ${y} Q${(mx - nx).toFixed(1)} ${(my - ny).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)} Q${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)} ${x} ${y} Z" fill="${col}"/><path d="M${x} ${y} L${tx.toFixed(1)} ${ty.toFixed(1)}" stroke="#fff" stroke-opacity=".6" stroke-width=".8"/>`; };
  const sequins = (x0, x1, y0, y1, n, seed) => { let o = ""; for (let i = 0; i < n; i++) { const x = x0 + R(seed + i) * (x1 - x0), y = y0 + R(seed + i + 77) * (y1 - y0); o += `<circle class="md-tw" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.5" fill="${["#ffe680", "#ffffff", "#9af0ff", "#ff9ad0"][i % 4]}" style="animation-delay:${(-R(i + seed) * 2.2).toFixed(2)}s"/>`; } return o; };
  FETES2D["carnavalrio"] = {
    replaces: false,
    greet: () => "Carnaval de Rio ! Des plumes, des paillettes, des rubans vert et jaune… Le tambour attend sagement qu'on lui donne le rythme.",
    wall: () => {
      // rubans vert et jaune qui partent de l'ampoule du plafond
      let o = "";
      const cx = 1600, cy = 30;
      for (let i = 0; i < 14; i++) { const x1 = 380 + i * 140, y1 = 70 + (i % 2) * 18; if (Math.abs(x1 - cx) < 60) continue; o += `<path d="M${cx} ${cy} Q${(cx + x1) / 2} ${cy + 60} ${x1} ${y1}" stroke="${i % 2 ? "#ffd21a" : "#1fa84a"}" stroke-width="4" fill="none"/><path d="M${x1} ${y1} q-6 12 0 22 q6 10 0 20" stroke="${i % 2 ? "#ffd21a" : "#1fa84a"}" stroke-width="4" fill="none" class="md-sw"/>`; }
      // éventail de plumes au mur (à droite de la cheminée) et paillettes
      for (let i = 0; i < 11; i++) o += feather(1655, 268, 56 + (i % 2) * 10, -1.15 + i * .23, FEATH[i % 6]);
      o += `<ellipse cx="1655" cy="268" rx="20" ry="9" fill="#ffd21a"/><ellipse cx="1655" cy="268" rx="20" ry="9" fill="none" stroke="#1fa84a" stroke-width="3"/>` + sequins(1600, 1710, 190, 260, 16, 11) + sequins(1012, 1052, 220, 460, 8, 31);
      return G(o);
    },
    mantel: () => {
      // un vase de plumes sur la cheminée, rubans au rebord
      let o = "";
      for (let i = 0; i < 9; i++) o += feather(1500, 300, 54 + (i % 3) * 8, -.7 + i * .175, FEATH[(i + 2) % 6]);
      o += `<path d="M1490 318 L1488 296 L1512 296 L1510 318 Z" fill="#1fa84a"/><rect x="1488" y="302" width="24" height="4" fill="#ffd21a"/>`;
      o += `<path d="M1420 322 Q1490 338 1562 322 Q1634 338 1705 322" stroke="#1fa84a" stroke-width="4" fill="none"/><path d="M1420 326 Q1490 342 1562 326 Q1634 342 1705 326" stroke="#ffd21a" stroke-width="3" fill="none"/>` + sequins(1440, 1690, 300, 316, 12, 51);
      // le tambour (surdo), au pied de la cheminée, à droite
      o += `<g transform="translate(1789 602) scale(.9)"><ellipse cy="0" rx="26" ry="6" fill="#000" opacity=".3"/><rect x="-24" y="-40" width="48" height="40" fill="#d8dde4"/><rect x="-24" y="-40" width="48" height="40" fill="url(#gGift)"/>${[-18, -6, 6, 18].map(dx => `<path d="M${dx} -38 L${dx + 6} -2" stroke="#8a8f98" stroke-width="1.4"/>`).join("")}<rect x="-25" y="-42" width="50" height="5" rx="2" fill="#1fa84a"/><rect x="-25" y="-5" width="50" height="5" rx="2" fill="#1fa84a"/><ellipse cy="-42" rx="25" ry="6" fill="#f4efe2"/><ellipse cy="-42" rx="25" ry="6" fill="none" stroke="#ffd21a" stroke-width="2"/><path d="M-14 -46 L-4 -70" stroke="#c98a3a" stroke-width="3" stroke-linecap="round"/><circle cx="-3.5" cy="-71" r="4" fill="#f4efe2"/></g>`;
      o += sequins(1500, 1700, 604, 640, 16, 71);
      return G(o);
    },
  };

  /* ===================== JOUR DE LA MARMOTTE (2 février) ===================== */
  const calPage = (x, y, s = 1, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><rect x="-14" y="-17" width="28" height="34" rx="1.5" fill="#fbf8f0" stroke="#d8d0c0" stroke-width=".6"/><rect x="-14" y="-17" width="28" height="9" rx="1.5" fill="#c4122f"/><text y="-10.2" text-anchor="middle" font-size="5.6" font-weight="700" fill="#fff">FÉVR.</text><text y="9" text-anchor="middle" font-size="16" font-weight="700" fill="#222">2</text><text y="14.8" text-anchor="middle" font-size="3.4" fill="#666">encore</text></g>`;
  const groundhog = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="-16" rx="17" ry="18" fill="#8a5a32"/><ellipse cx="0" cy="-12" rx="10" ry="12" fill="#c8945a"/><ellipse cx="-14" cy="-2" rx="6" ry="3.4" fill="#6b4226"/><ellipse cx="14" cy="-2" rx="6" ry="3.4" fill="#6b4226"/><path d="M-9 -20 q-6 4 -3 10 M9 -20 q6 4 3 10" stroke="#6b4226" stroke-width="5" stroke-linecap="round" fill="none"/>
    <circle cx="0" cy="-42" r="13" fill="#8a5a32"/><circle cx="-10" cy="-52" r="4" fill="#8a5a32"/><circle cx="10" cy="-52" r="4" fill="#8a5a32"/><circle cx="-10" cy="-52" r="2" fill="#5a3a1c"/><circle cx="10" cy="-52" r="2" fill="#5a3a1c"/><ellipse cx="0" cy="-37" rx="8" ry="6" fill="#c8945a"/><circle cx="-5" cy="-45" r="2.2" fill="#1a120a"/><circle cx="5" cy="-45" r="2.2" fill="#1a120a"/><circle cx="-4.4" cy="-45.8" r=".7" fill="#fff"/><circle cx="5.6" cy="-45.8" r=".7" fill="#fff"/><ellipse cx="0" cy="-39.5" rx="2.4" ry="1.6" fill="#3a2414"/><rect x="-2.6" y="-37" width="5.2" height="4" rx="1" fill="#fbf8f0"/><line x1="0" y1="-37" x2="0" y2="-33" stroke="#d8d0c0" stroke-width=".5"/><path d="M-7 -28 h14" stroke="#c4122f" stroke-width="3"/><path d="M0 -28 l-4 6 M0 -28 l4 6" stroke="#c4122f" stroke-width="2"/></g>`;
  FETES2D["marmotte"] = {
    replaces: false,
    greet: () => "Bonjour ! Nous sommes le 2 février, jour de la marmotte. …Attends. On n'était pas déjà le 2 février hier ?",
    wall: () => {
      // une guirlande de pages de calendrier : toutes « 2 février »
      return G(hang(1040, 1440, 214, 16, 40, (x, y, k) => `<g class="md-sw" style="animation-delay:${-k * .5}s">${calPage(x, y + 18, .8, (R(k) - .5) * 14)}</g>`, "#8a7a6a"));
    },
    front: () => G(groundhog(1296, 642, 1.15) + calPage(1250, 655, .55, -20) + [0, 1, 2, 3, 4].map(k => calPage(1770 + k * 18 + (R(k + 3) - .5) * 14, 684 + R(k + 8) * 26, .62, (R(k) - .5) * 90)).join("")),
  };

  /* ===================== AÏD EL-FITR / AÏD AL-ADHA ===================== */
  const lantern = (x, y, s, glass, metal = "#c9a24a", i = 0) => `<g transform="translate(${x} ${y}) scale(${s})">${glow(0, -22, 34, .6)}<path d="M-12 0 L12 0 L10 -6 L-10 -6 Z" fill="${metal}"/><path d="M-10 -6 L-13 -30 L13 -30 L10 -6 Z" fill="${glass}" opacity=".55"/>${flame(0, -12, 1.1, i)}<path d="M-10 -6 L-13 -30 M10 -6 L13 -30 M0 -6 L0 -30 M-11.5 -18 L11.5 -18" stroke="${metal}" stroke-width="1.6" fill="none"/><path d="M-13 -30 L13 -30 L0 -46 Z" fill="${metal}"/><path d="M-6 -36 L6 -36" stroke="#8a6a2a" stroke-width="1"/><circle cy="-48" r="3" fill="none" stroke="${metal}" stroke-width="1.6"/></g>`;
  const crescentLights = (x, y, r, col) => {
    // croissant de lune et étoile en guirlande lumineuse
    let o = "";
    for (let i = 0; i <= 22; i++) { const a = -2.0 + i / 22 * 4.0; o += `<circle class="md-tw" cx="${(x + Math.cos(a) * r).toFixed(1)}" cy="${(y + Math.sin(a) * r).toFixed(1)}" r="1.9" fill="${col}" style="animation-delay:${(-i * .1).toFixed(2)}s"/>`; }
    for (let i = 1; i < 16; i++) { const a = -1.424 + i / 16 * 2.848; o += `<circle class="md-tw" cx="${(x - r * .55 + Math.cos(a) * r * .919).toFixed(1)}" cy="${(y + Math.sin(a) * r * .919).toFixed(1)}" r="1.9" fill="${col}" style="animation-delay:${(-i * .1 - 1).toFixed(2)}s"/>`; }
    const sx = x - r * .2, sy = y, sr = r * .34;
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? sr * .45 : sr, b = -Math.PI / 2 + (k + 1) * Math.PI / 5, r2 = (k + 1) % 2 ? sr * .45 : sr;
      for (let t = 0; t < 2; t++) { const f = t / 2; o += `<circle cx="${(sx + Math.cos(a) * rr * (1 - f) + Math.cos(b) * r2 * f).toFixed(1)}" cy="${(sy + Math.sin(a) * rr * (1 - f) + Math.sin(b) * r2 * f).toFixed(1)}" r="1.6" fill="${col}"/>`; } }
    return `<path d="M${x} ${y - r - 40} L${x} ${y - r}" stroke="#555" stroke-width=".8"/>${o}`;
  };
  const teaTray = (x, y, mint = true) => {
    let o = `<g transform="translate(${x} ${y})"><ellipse rx="52" ry="9" fill="#b8902a"/><ellipse rx="47" ry="7" fill="#d8b04a"/><ellipse rx="47" ry="7" fill="none" stroke="#a8802a" stroke-width="1" stroke-dasharray="2 2"/>`;
    // théière
    o += `<g transform="translate(-24 -2)"><path d="M-10 0 Q-12 -14 0 -16 Q12 -14 10 0 Z" fill="#d9dce2"/><path d="M10 -6 Q18 -10 20 -18" stroke="#c4c8d0" stroke-width="2.4" fill="none"/><path d="M-10 -10 Q-16 -8 -12 -2" stroke="#c4c8d0" stroke-width="2" fill="none"/><path d="M-5 -16 L0 -24 L5 -16 Z" fill="#c4c8d0"/><circle cy="-25" r="1.6" fill="#c4c8d0"/><path class="md-steam" d="M20 -20 q-2 -4 0 -8" stroke="#fff" stroke-width="1" fill="none"/></g>`;
    // verres de thé
    [[-4, 0], [6, 2]].forEach(([gx, gy], k) => { o += `<g transform="translate(${gx} ${gy})"><path d="M-3.4 0 L-4 -11 L4 -11 L3.4 0 Z" fill="rgba(255,255,255,.35)" stroke="rgba(255,255,255,.6)" stroke-width=".6"/><path d="M-3.5 -1 L-3.8 -8 L3.8 -8 L3.5 -1 Z" fill="#b8641a" opacity=".85"/>${mint ? `<ellipse cx="0" cy="-9" rx="2.4" ry="1.2" fill="#3f8f3a"/>` : ""}<path class="md-steam" style="animation-delay:${-k}s" d="M0 -13 q-2 -4 0 -7" stroke="#fff" stroke-width=".9" fill="none"/></g>`; });
    // dattes et pâtisseries
    o += `<g transform="translate(26 -2)"><ellipse rx="16" ry="4" fill="#f4f1ea"/>${[[-8, -2], [-3, -3], [2, -2], [7, -3], [-5, -6], [4, -6]].map(([a, b]) => `<ellipse cx="${a}" cy="${b}" rx="3.6" ry="2" fill="#5a2a14"/><ellipse cx="${a - 1}" cy="${b - .6}" rx="1.4" ry=".6" fill="#8a4a24"/>`).join("")}</g>`;
    o += `<g transform="translate(40 4)">${[[-4, 0], [4, 0], [0, -4]].map(([a, b]) => `<path d="M${a - 5} ${b} Q${a} ${b - 6} ${a + 5} ${b}" fill="#f2dcae" stroke="#e8c88a" stroke-width=".8"/>`).join("")}</g>`;
    o += `<g transform="translate(-44 4)">${[[-3, 0], [4, 0], [0, -3]].map(([a, b]) => `<circle cx="${a}" cy="${b}" r="3.6" fill="#f6ead2"/><circle cx="${a}" cy="${b - 1}" r="1" fill="#3a8a3a"/>`).join("")}</g>`;
    return o + `</g>`;
  };
  const aid = (adha) => ({
    replaces: false,
    greet: () => adha ? "Aïd al-Adha (l'Aïd el-Kébir) : les lanternes sont allumées, le plateau de dattes et de pâtisseries est prêt, le thé est servi. Aïd moubarak !" : "Aïd el-Fitr : la fin du ramadan. Lanternes allumées, croissant de lune en guirlande, dattes, pâtisseries et thé à la menthe. Aïd moubarak !",
    wall: (c) => {
      // croissant de lune et étoile en guirlande lumineuse, dans la fenêtre ; une guirlande de petites lanternes au mur
      let o = crescentLights(846, 318, 28, adha ? "#bff5ff" : "#ffe9a8");
      o += hang(1715, 1880, 128, 18, 33, (x, y, k) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 8}" stroke="#8a7a5a" stroke-width=".8"/>${lantern(x, y + 34, .5, ["#ff8a3a", "#3ab0ff", "#ffd21a", "#2ac46a", "#ff4b8a"][k % 5], "#c9a24a", k + 30)}`, "#8a7a5a");
      return G(o);
    },
    mantel: () => G(lantern(1462, 318, .9, adha ? "#2ac46a" : "#ff8a3a", "#c9a24a", 1) + lantern(1664, 318, .8, adha ? "#ffd21a" : "#3ab0ff", "#c9a24a", 2) + lantern(1792, 602, 1.1, adha ? "#3ab0ff" : "#2ac46a", "#b8902a", 3)),
    front: () => onTable(teaTray(1650, 612, true)),
  });
  FETES2D["aidfitr"] = aid(false);
  FETES2D["aidadha"] = aid(true);

  /* ===================== HANOUKKA ===================== */
  // premier soir (première bougie) : table vérifiée 2026–2035 (le calendrier, s'il donne la date, est prioritaire)
  const HANOUKKA = { 2026: [12, 4], 2027: [12, 24], 2028: [12, 12], 2029: [12, 1], 2030: [12, 20], 2031: [12, 9], 2032: [11, 27], 2033: [12, 16], 2034: [12, 6], 2035: [12, 25] };
  const hanFirst = (y) => {
    try { if (typeof _calData === "function") { const t = _calData().T.hanoukka[y]; if (t && t[0]) return new Date(y, t[0][0] - 1, t[0][1]); } } catch (_) {}
    const t = HANOUKKA[y]; return t ? new Date(y, t[0] - 1, t[1]) : null;
  };
  // nombre de bougies allumées ce soir (0 = la fête commence ce soir, pas encore allumée ; 1 à 8)
  const hanCandles = (c) => {
    const now = new Date(c.y, c.m - 1, c.day);
    for (const y of [c.y, c.y - 1]) { const f = hanFirst(y); if (!f) continue; const k = Math.round((now - f) / 864e5); if (k >= 0 && k <= 8) { const n = c.h >= 17 || c.h < 4 ? k + 1 : k; return Math.max(0, Math.min(8, c.h < 4 ? k : n)); } }
    return 1;
  };
  const ORD = ["", "premier", "deuxième", "troisième", "quatrième", "cinquième", "sixième", "septième", "huitième"];
  const hanukkiah = (x, y, n) => {
    // neuf branches : huit bougies au même niveau, le shamash (bougie « servante ») plus haut au centre.
    // Les bougies s'ajoutent de droite à gauche ; on allume d'abord la plus récente (à gauche).
    let o = `<g transform="translate(${x} ${y})"><rect x="-12" y="-4" width="24" height="4" rx="1" fill="#c9a24a"/><path d="M-3 -4 L-2 -18 L2 -18 L3 -4 Z" fill="#c9a24a"/>`;
    const xs = [-44, -33, -22, -11, 11, 22, 33, 44];
    xs.forEach(bx => { o += `<path d="M0 -18 Q${bx * .5} -18 ${bx} -36" stroke="#c9a24a" stroke-width="2.4" fill="none"/>`; });
    o += `<rect x="-2" y="-46" width="4" height="28" fill="#c9a24a"/>`;
    xs.forEach((bx, i) => { o += `<rect x="${bx - 3}" y="-39" width="6" height="3" fill="#b8902a"/>`; const slot = 7 - i; if (slot < n) o += candle(bx, -39, 15, ["#8ac4ff", "#fbf8f0"][i % 2], 3.6, true, i + 60); });
    o += `<rect x="-3" y="-49" width="6" height="3" fill="#b8902a"/>` + candle(0, -49, 15, "#fbf8f0", 3.6, n > 0, 69);
    return o + `</g>`;
  };
  const dreidel = (x, y, s, col, letter, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0 L-8 -8 L-8 -20 L8 -20 L8 -8 Z" fill="${col}"/><path d="M0 0 L-8 -8 L-8 -20 L-3 -20 L-3 -8 Z" fill="#000" opacity=".15"/><rect x="-1.4" y="-27" width="2.8" height="7" fill="${col}"/><text x="2" y="-10" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">${letter}</text></g>`;
  const sufgania = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="9" ry="6" fill="#d89a4a"/><ellipse cx="${x}" cy="${y - 2}" rx="7" ry="3.6" fill="#f8f2e6"/><circle cx="${x + 1}" cy="${y - 3}" r="1.6" fill="#c4122f"/>`;
  FETES2D["hanoukka"] = {
    replaces: false,
    greet: (c) => { const n = hanCandles(c); return n === 0 ? "Hanoukka commence ce soir : la hanoukkia attend sur le rebord de la fenêtre. Des toupies et des beignets sur la table. Hag Hanoukka saméah !" : `Hanoukka, ${ORD[n]} soir : ${n === 1 ? "une bougie brille" : n + " bougies brillent"} sur la hanoukkia, à la fenêtre. Des toupies et des beignets sur la table. Hag Hanoukka saméah !`; },
    wall: (c) => G(`<g transform="translate(904 400) scale(1.25) translate(-904 -400)">${hanukkiah(904, 400, hanCandles(c))}</g>`),
    front: () => {
      let o = plate(1616, 614, 26) + sufgania(1604, 608) + sufgania(1622, 609) + sufgania(1613, 600);
      o += dreidel(1668, 614, 1, "#2a6fd4", "נ", -6) + dreidel(1694, 612, .85, "#c9a24a", "ג", 14) + dreidel(1716, 616, .75, "#d43a5a", "ש", 90);
      o += choco(1652, 614, 3.6) + choco(1660, 617, 3.6) + choco(1708, 618, 3.4);
      return onTable(o);
    },
  };

  FETES2D["oktoberfest"].css = CSS;   // une seule copie des animations communes
})();
