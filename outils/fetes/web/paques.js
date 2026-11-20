(() => {
  // ===== Pâques : la semaine sainte (œufs à peindre), le dimanche (chasse aux œufs), le lundi (le panier est plein) =====
  const R = (k) => { let x = Math.sin(k * 71.3 + 9.1) * 43758.5453; return x - Math.floor(x); };
  const easter = (Y) => { const a = Y % 19, b = Math.floor(Y / 100), c = Y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(Y, mo - 1, da); };
  const phase = (c) => Math.round((new Date(c.y, c.m - 1, c.day) - easter(c.y)) / 864e5);   // -6 … -1 : avant ; 0 : dimanche ; 1 : lundi
  const COLS = [["#f28aa8", "#ffe08a"], ["#7ac0e6", "#ffffff"], ["#ffd36a", "#d9534f"], ["#a8d98a", "#f7b6cf"], ["#c7a6e8", "#ffe08a"], ["#ff9f6a", "#7ac0e6"], ["#f7b6cf", "#7a5cc0"], ["#9be0d6", "#f28aa8"]];
  // un œuf peint : forme d'œuf, motif (zigzag, pois, bandes, deux tons, fleurs), reflet
  let uid = 0;
  const egg = (x, y, s, k, rot = 0, pat) => {
    const [a, b] = COLS[k % COLS.length], w = 7 * s, H = 19 * s, id = "pqE" + (uid++), p = pat ?? k % 5;
    const d = `M0 ${-H} C${w * .78} ${-H} ${w} ${-H * .5} ${w} ${-H * .33} C${w} ${-H * .1} ${w * .6} 0 0 0 C${-w * .6} 0 ${-w} ${-H * .1} ${-w} ${-H * .33} C${-w} ${-H * .5} ${-w * .78} ${-H} 0 ${-H} Z`;
    let m = "";
    if (p === 0) m = `<path d="M${-w} ${-H * .5} l${w * .4} ${-H * .14} l${w * .4} ${H * .14} l${w * .4} ${-H * .14} l${w * .4} ${H * .14} l${w * .4} ${-H * .14}" stroke="${b}" stroke-width="${1.6 * s}" fill="none"/><rect x="${-w}" y="${-H * .26}" width="${2 * w}" height="${1.4 * s}" fill="${b}"/>`;
    else if (p === 1) m = [[-.4, -.6], [.35, -.68], [0, -.42], [-.5, -.25], [.45, -.22], [-.1, -.85], [.05, -.12]].map(([u, v]) => `<circle cx="${u * w}" cy="${v * H}" r="${1.3 * s}" fill="${b}"/>`).join("");
    else if (p === 2) m = `<rect x="${-w}" y="${-H * .62}" width="${2 * w}" height="${2.2 * s}" fill="${b}"/><rect x="${-w}" y="${-H * .4}" width="${2 * w}" height="${1.2 * s}" fill="${b}" opacity=".7"/><rect x="${-w}" y="${-H * .22}" width="${2 * w}" height="${2.2 * s}" fill="${b}"/>`;
    else if (p === 3) m = `<path d="M${-w} ${-H * .42} q${w / 2} ${-3 * s} ${w} 0 t${w} 0 V0 H${-w} Z" fill="${b}"/>`;
    else m = [[-.3, -.6], [.3, -.35]].map(([u, v]) => `<g transform="translate(${u * w} ${v * H})">${[0, 72, 144, 216, 288].map(t => `<circle cx="${Math.cos(t * Math.PI / 180) * 1.5 * s}" cy="${Math.sin(t * Math.PI / 180) * 1.5 * s}" r="${1.1 * s}" fill="${b}"/>`).join("")}<circle r="${.8 * s}" fill="#ffd36a"/></g>`).join("");
    return `<g transform="translate(${x} ${y}) rotate(${rot})"><clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${a}"/><g clip-path="url(#${id})">${m}<path d="${d}" fill="none" stroke="rgba(0,0,0,.08)" stroke-width="${3 * s}"/></g><ellipse cx="${-w * .38}" cy="${-H * .66}" rx="${w * .2}" ry="${H * .14}" fill="rgba(255,255,255,.45)"/><path d="${d}" fill="none" stroke="rgba(40,20,20,.25)" stroke-width=".7"/></g>`;
  };
  const whiteEgg = (x, y, s) => { const w = 7 * s, H = 19 * s; return `<path transform="translate(${x} ${y})" d="M0 ${-H} C${w * .78} ${-H} ${w} ${-H * .5} ${w} ${-H * .33} C${w} ${-H * .1} ${w * .6} 0 0 0 C${-w * .6} 0 ${-w} ${-H * .1} ${-w} ${-H * .33} C${-w} ${-H * .5} ${-w * .78} ${-H} 0 ${-H} Z" fill="#f6efe2" stroke="rgba(60,40,20,.25)" stroke-width=".7"/>`; };
  // une cloche dorée avec son nœud (et des petites ailes si elle vole)
  const bell = (x, y, s, wings = false, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
      ${wings ? `<path class="pq-wing" d="M-10 -16 q-18 -14 -26 -4 q8 0 10 4 q-8 0 -8 6 q10 -2 24 -2 Z" fill="#fbf7ee" stroke="#d9cdb4" stroke-width=".8"/><path class="pq-wing r" d="M10 -16 q18 -14 26 -4 q-8 0 -10 4 q8 0 8 6 q-10 -2 -24 -2 Z" fill="#fbf7ee" stroke="#d9cdb4" stroke-width=".8"/>` : ""}
      <path d="M-14 0 Q-14 -7 -10 -11 Q-10 -28 0 -30 Q10 -28 10 -11 Q14 -7 14 0 Z" fill="#e8b73a"/><path d="M-14 0 Q-14 -7 -10 -11 Q-10 -28 0 -30" fill="none" stroke="#fff1b0" stroke-width="2" opacity=".7"/>
      <path d="M-14 0 h28" stroke="#b8862a" stroke-width="3" stroke-linecap="round"/><rect x="-10" y="-14" width="20" height="2.4" fill="#b8862a" opacity=".7"/><circle cy="3" r="3.4" fill="#9a6e1e"/>
      <path d="M0 -30 l-9 -6 l0 10 Z M0 -30 l9 -6 l0 10 Z" fill="#d9534f"/><path d="M0 -30 l-5 12 M0 -30 l5 12" stroke="#d9534f" stroke-width="2.4"/><circle cy="-30" r="2.6" fill="#b33a36"/></g>`;
  // le panier en osier avec de la paille et les œufs trouvés
  const basket = (x, y, n, s = 1) => {
    let o = `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-30 -30 Q0 -74 30 -30" stroke="#8a5a2b" stroke-width="4" fill="none"/><path d="M-30 -30 Q0 -74 30 -30" stroke="#c08a4a" stroke-width="1.6" fill="none" stroke-dasharray="4 3"/>`;
    o += [[-20, -34, 0], [-6, -38, 1], [8, -36, 2], [20, -33, 3], [-13, -40, 4], [2, -43, 5], [14, -41, 6], [-1, -36, 7]].slice(0, n).map(([ex, ey, k], i) => egg(ex, ey + 8, .9, k + 3, (i % 2 ? 1 : -1) * (8 + i * 3))).join("");
    o += `<path d="M-30 -28 Q-34 -26 -30 -22 L-24 -2 Q0 4 24 -2 L30 -22 Q34 -26 30 -28 Z" fill="#b07a3e"/><path d="M-29 -22 Q0 -16 29 -22 M-27 -14 Q0 -8 27 -14 M-25 -6 Q0 0 25 -6" stroke="#8a5a2b" stroke-width="1.6" fill="none"/>${Array.from({ length: 9 }, (_, i) => `<path d="M${-24 + i * 6} -26 L${-22 + i * 5.5} -2" stroke="#8a5a2b" stroke-width="1" opacity=".55"/>`).join("")}
      ${Array.from({ length: 10 }, (_, i) => `<path d="M${-28 + i * 6} -27 q2 -5 6 -3" stroke="#e9cf6a" stroke-width="1.4" fill="none"/>`).join("")}<path d="M-30 -28 Q0 -22 30 -28" stroke="#d9a35a" stroke-width="3" fill="none"/>
      <path d="M22 -26 l8 -6 l2 8 Z M22 -26 l10 2 l-6 6 Z" fill="#7ac0e6"/></g>`;
    return o;
  };
  // le lapin en peluche (assis sur le canapé)
  const plush = (x, y) => `<g transform="translate(${x} ${y})"><ellipse cy="-2" rx="22" ry="5" fill="rgba(0,0,0,.18)"/>
      <ellipse cx="-12" cy="-4" rx="8" ry="5" fill="#e9e2d8"/><ellipse cx="12" cy="-4" rx="8" ry="5" fill="#e9e2d8"/>
      <ellipse cy="-20" rx="17" ry="19" fill="#d8d0c6"/><ellipse cy="-17" rx="10" ry="12" fill="#f4efe8"/>
      <g class="pq-ear"><ellipse cx="-8" cy="-66" rx="5.5" ry="16" fill="#d8d0c6" transform="rotate(-12 -8 -66)"/><ellipse cx="-8" cy="-64" rx="2.6" ry="11" fill="#f2b6c4" transform="rotate(-12 -8 -64)"/></g>
      <ellipse cx="9" cy="-64" rx="5.5" ry="16" fill="#d8d0c6" transform="rotate(18 9 -64)"/><ellipse cx="9" cy="-62" rx="2.6" ry="11" fill="#f2b6c4" transform="rotate(18 9 -62)"/>
      <circle cy="-46" r="14" fill="#ddd5cb"/><ellipse cx="-6" cy="-41" rx="5" ry="4" fill="#f4efe8"/><ellipse cx="6" cy="-41" rx="5" ry="4" fill="#f4efe8"/>
      <circle cx="-5" cy="-49" r="1.8" fill="#2a2024"/><circle cx="5" cy="-49" r="1.8" fill="#2a2024"/><ellipse cy="-43.5" rx="2" ry="1.4" fill="#e58aa0"/>
      <path d="M-8 -32 l8 3 l8 -3 l-1 6 l-7 -2 l-7 2 Z" fill="#7ac0e6"/><circle cy="-30" r="2" fill="#5a9cc6"/></g>`;
  // le lapin en chocolat dans son papier doré (grignoté le lundi)
  const chocBunny = (x, y, bitten) => `<g transform="translate(${x} ${y})"><ellipse cy="-1" rx="15" ry="3" fill="rgba(0,0,0,.25)"/>
      <path d="M-13 0 Q-16 -22 -6 -30 Q-12 -38 -6 -46 L-9 -64 Q-8 -70 -4 -66 L-1 -50 Q2 -52 4 -50 L${bitten ? "6 -60 L8 -58 L7 -62" : "9 -68 Q13 -70 12 -64"} L8 -46 Q14 -38 8 -30 Q16 -22 13 0 Z" fill="#d9ad3a"/>
      <path d="M-13 0 Q-16 -22 -6 -30 Q-12 -38 -6 -46 L-9 -64" fill="none" stroke="#fff3b0" stroke-width="1.6" opacity=".8"/><path d="M-6 -30 Q0 -24 8 -30" stroke="#b8862a" stroke-width="1.2" fill="none"/>
      <rect x="-9" y="-31" width="18" height="4" fill="#c4122f"/><circle cy="-26" r="3" fill="#e8c15a" stroke="#9a6e1e" stroke-width=".8"/><circle cx="-3" cy="-40" r="1.3" fill="#7a5a1a"/>${bitten ? `<path d="M6 -60 l2 -1 l1 2" stroke="#5a3418" stroke-width="1.4" fill="none"/>` : ""}</g>`;
  const chocHen = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-14 0 Q-16 -14 -6 -18 Q-8 -28 0 -28 Q6 -28 6 -22 L11 -22 L6 -19 Q16 -16 18 -24 Q20 -10 12 0 Z" fill="#6b3d1e"/><path d="M-2 -28 q2 -5 5 -1" stroke="#c4122f" stroke-width="3" fill="none"/><circle cx="2" cy="-24" r="1" fill="#2a1a10"/><path d="M-8 -10 Q2 -4 10 -12" stroke="#4e2a12" stroke-width="1.4" fill="none"/></g>`;
  const nest = (x, y) => `<g transform="translate(${x} ${y})"><ellipse cy="-4" rx="20" ry="7" fill="#8a6a3a"/>${egg(-8, -6, .5, 0, -10, 1)}${egg(0, -7, .55, 1, 4, 2)}${egg(8, -6, .5, 2, 12, 0)}<path d="M-20 -4 Q0 6 20 -4" stroke="#b08a4a" stroke-width="3" fill="none"/>${Array.from({ length: 8 }, (_, i) => `<path d="M${-18 + i * 5} -2 q3 -4 6 0" stroke="#c9a35a" stroke-width="1" fill="none"/>`).join("")}</g>`;
  // les cachettes du dimanche (dans l'ordre où on les trouve)
  const SPOTS = [
    [1562, 193, .85, 0, "mantel"],   // sur l'horloge
    [905, 405, .8, 18, "wall"],      // sur le rebord de fenêtre, contre le rideau
    [1066, 500, .85, -8, "mantel"],  // sur le meuble télé
    [1952, 449, .85, 0, "wall"],     // sur l'étagère des jeux
    [690, 334, .8, 0, "wall"],       // sur l'étagère des films
    [1838, 598, .8, 12, "mantel"],   // au pied du lampadaire
    [1418, 600, .8, 0, "mantel"],    // au coin de la cheminée
    [1150, 249, .75, 0, "mantel"],   // sur la télé
    [1596, 700, .9, 70, "front"],    // sur le tapis, sous la table
    [900, 712, .9, -60, "front"],    // à côté du canapé
    [1975, 626, .8, -10, "front"],   // à côté de la boîte de quiz
    [800, 600, .8, 0, "mantel"],     // sous le radiateur
  ];
  FETES2D["paques"] = {
    replaces: true,
    css: `.pq-fly{animation:pqFly 22s linear infinite}@keyframes pqFly{0%{transform:translate(-120px,40px)}45%{transform:translate(260px,-20px)}100%{transform:translate(260px,-20px)}}
      .pq-wing{transform-box:fill-box;transform-origin:100% 100%;animation:pqFlap .5s ease-in-out infinite alternate}.pq-wing.r{transform-origin:0% 100%}@keyframes pqFlap{to{transform:rotate(-18deg)}}
      .pq-ear{transform-box:fill-box;transform-origin:50% 100%;animation:pqEar 6s ease-in-out infinite}@keyframes pqEar{0%,90%,100%{transform:rotate(0)}94%{transform:rotate(-14deg)}}
      .pq-sway{transform-box:fill-box;transform-origin:50% 0;animation:pqSway 4s ease-in-out infinite alternate}@keyframes pqSway{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}
      .pq-dip{animation:pqDip 3.2s ease-in-out infinite}@keyframes pqDip{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}`,
    greet: (c) => { const n = phase(c);
      if (n < 0) return n === -1 ? "Demain, c'est Pâques ! Les œufs sèchent sur la table basse… les cloches arrivent cette nuit." : `Pâques approche (encore ${-n} jours) : des œufs à peindre attendent sur la table basse.`;
      if (n === 0) { const h = c.h, k = h < 12 ? 12 : h < 17 ? 8 : 4; return `Joyeuses Pâques ! Les cloches sont passées : ${k === 12 ? "douze" : k === 8 ? "huit" : "quatre"} œufs sont encore cachés dans le salon. Ouvre l'œil !`; }
      return "Lundi de Pâques : le panier est plein, et le lapin en chocolat a perdu une oreille…"; },
    wall: (c) => { const n = phase(c); let o = "";
      // guirlande d'œufs en papier, en festons, le long du haut des murs
      for (let x0 = 300; x0 < 2300; x0 += 200) {
        o += `<path d="M${x0} 58 Q${x0 + 100} 92 ${x0 + 200} 58" stroke="#d8c9a8" stroke-width="1.5" fill="none"/>`;
        for (let k = 1; k < 5; k++) { const t = k / 5, x = x0 + 200 * t, y = 58 + 4 * 34 * t * (1 - t); o += `<g class="pq-sway" style="animation-delay:${(-R(x) * 4).toFixed(2)}s"><line x1="${x}" y1="${y}" x2="${x}" y2="${y + 6}" stroke="#d8c9a8"/>${egg(x, y + 28, .95, (k + x0 / 200) | 0, 0)}</g>`; }
        o += `<g transform="translate(${x0} 58)"><path d="M0 0 l-8 -5 l0 10 Z M0 0 l8 -5 l0 10 Z" fill="#a8d98a"/><circle r="2.5" fill="#7ab35a"/></g>`;
      }
      // deux cloches enrubannées, accrochées sous la guirlande (le dimanche et le lundi)
      if (n >= 0) o += [[1030, 118, -8], [1462, 128, 8]].map(([x, y, r]) => `<g class="pq-sway" style="animation-delay:${r / 4}s"><line x1="${x}" y1="74" x2="${x}" y2="${y - 34}" stroke="#d9534f" stroke-width="1.5"/>${bell(x, y, 1.05, false, r)}</g>`).join("");
      // les œufs cachés en hauteur (étagères, rebord de fenêtre)
      if (n === 0) { const hid = c.h < 12 ? 12 : c.h < 17 ? 8 : 4; o += SPOTS.slice(12 - hid).map(([x, y, s, r, l], i) => l === "wall" ? egg(x, y, s, i + 2, r) : "").join(""); }
      return `<g aria-hidden="true">${o}</g>`; },
    mantel: (c) => { const n = phase(c); let o = "";
      if (n < 0) {
        // la semaine sainte : un bouquet de branches dans un vase, avec les premiers œufs peints accrochés (un peu plus chaque jour)
        const k = Math.min(9, (7 + n) * 2 - 1);
        o += `<g transform="translate(1476 318)"><path d="M-10 0 L-12 -30 Q-12 -34 -8 -34 L8 -34 Q12 -34 12 -30 L10 0 Z" fill="rgba(190,225,235,.55)" stroke="rgba(230,245,250,.7)"/><rect x="-10" y="-14" width="20" height="13" fill="rgba(120,170,190,.35)"/>
          ${[[-26, -96], [-6, -112], [14, -100], [30, -84], [-34, -70]].map(([x, y]) => `<path d="M0 -30 Q${x * .3} ${y * .5} ${x} ${y}" stroke="#6b4a2b" stroke-width="1.6" fill="none"/>${[.45, .7, .9].map(t => `<circle cx="${x * t}" cy="${-30 + (y + 30) * t}" r="2.4" fill="#f2cf3a"/>`).join("")}`).join("")}
          ${[[-20, -80], [-4, -96], [12, -84], [24, -70], [-28, -58], [6, -64], [-12, -66], [20, -94], [-24, -94]].slice(0, k).map(([x, y], i) => `<g class="pq-sway" style="animation-delay:${-i * .7}s"><line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y}" stroke="#ddd"/>${egg(x, y + 12, .6, i, 0)}</g>`).join("")}</g>`;
        // des coquetiers où sèchent deux œufs
        o += `<g transform="translate(1594 318)">${[0, 20].map((dx, i) => `<path d="M${dx - 6} 0 h12 l-2 -4 q4 -2 4 -6 h-16 q0 4 4 6 Z" fill="#f4f1ea"/>${egg(dx, -8, .62, 4 + i, 0, i + 1)}`).join("")}</g>`;
      } else {
        // le dimanche : le lapin en chocolat doré, la poule en chocolat et un petit nid
        o += chocBunny(1478, 318, n >= 1) + chocHen(1530, 318) + nest(1600, 318);
      }
      if (n === 0) { const hid = c.h < 12 ? 12 : c.h < 17 ? 8 : 4; o += SPOTS.slice(12 - hid).map(([x, y, s, r, l], i) => l === "mantel" ? egg(x, y, s, i + 2, r) : "").join(""); }
      return `<g aria-hidden="true">${o}</g>`; },
    front: (c) => { const n = phase(c); let o = "";
      if (n < 0) {
        // l'atelier de peinture sur la table basse : papier journal, boîte d'œufs, bols de teinture, pinceau, œufs qui sèchent
        const done = Math.min(6, 7 + n);
        o += `<g transform="translate(1452 648) scale(1.22) translate(-1452 -648)">`;
        o += `<path d="M1404 648 L1512 646 L1506 622 L1424 624 Z" fill="#e4e0d6"/><path d="M1414 640 h44 M1414 634 h40 M1416 628 h36 M1466 640 h38 M1468 634 h34" stroke="#a9a49a" stroke-width="1.2"/><text x="1484" y="630" font-size="5" fill="#77726a" text-anchor="middle">LE JOURNAL</text>`;
        // boîte de six œufs (les blancs attendent, les peints sont retournés dans la boîte)
        o += `<g><path d="M1418 642 L1470 642 L1474 628 L1414 628 Z" fill="#c9bfa8"/>${[0, 1, 2].map(i => (i < done - 3 ? egg(1426 + i * 17, 632, .5, i, 0) : whiteEgg(1426 + i * 17, 632, .5))).join("")}${[0, 1, 2].map(i => (i < done ? egg(1424 + i * 18, 640, .55, i + 3, 0) : whiteEgg(1424 + i * 18, 640, .55))).join("")}<path d="M1416 640 L1472 640" stroke="#b3a88f" stroke-width="2"/></g>`;
        // trois bols de teinture, une cuillère et un œuf qui trempe
        o += [[1486, "#e8457a"], [1504, "#3a8fd8"], [1520, "#f2b81a"]].map(([x, col], i) => `<g transform="translate(${x} 646)"><path d="M-8 0 L-9 -14 L9 -14 L8 0 Z" fill="rgba(235,240,245,.55)" stroke="rgba(255,255,255,.7)"/><path d="M-8.5 -2 L-8.8 -10 L8.8 -10 L8.5 -2 Z" fill="${col}" opacity=".85"/><ellipse cy="-10" rx="8.8" ry="2" fill="${col}"/>${i === 1 ? `<g class="pq-dip"><path d="M4 -12 L16 -34" stroke="#c9c9cf" stroke-width="2"/>${egg(1, -6, .45, 1, 0, 3)}</g>` : ""}</g>`).join("");
        o += `</g>`;
        // le pinceau, la palette et le présentoir où sèchent les œufs peints
        o += `<g transform="translate(1648 642) scale(1.2)"><path d="M-6 0 L48 0 L52 -6 L-2 -6 Z" fill="#a0764a"/><path d="M-6 0 L48 0 L48 3 L-6 3 Z" fill="#7a5532"/>${[0, 1, 2, 3].map(i => `<rect x="${2 + i * 13}" y="-12" width="2" height="6" fill="#6b4a2b"/>${i < done - 2 ? egg(3 + i * 13, -8, .62, i + 5, 0, (i + 2) % 5) : ""}`).join("")}</g>
          <g transform="translate(1688 650) rotate(-12)"><rect x="-22" y="-2" width="30" height="3" rx="1.5" fill="#c4122f"/><rect x="8" y="-2.5" width="6" height="4" fill="#c9c9cf"/><path d="M14 -2.5 l7 2 l-7 2 Z" fill="#3a8fd8"/></g>`;
        // le panier vide, prêt pour dimanche
        if (n >= -2) o += basket(1720, 646, 0, .7);
      } else {
        const found = n === 0 ? (c.h < 12 ? 0 : c.h < 17 ? 4 : 8) : 8;
        o += basket(1452, 648, found);
        // le lapin en peluche, assis sur le canapé
        o += plush(1268, 590);
        // le lundi : des papiers de chocolat froissés sur la table
        if (n >= 1) o += [[1650, 640, "#e8c15a"], [1672, 646, "#c4122f"], [1690, 638, "#3a8fd8"], [1520, 646, "#e8c15a"]].map(([x, y, col], i) => `<path d="M${x - 6} ${y} l3 -5 l5 2 l4 -4 l2 6 l-4 4 l-6 -1 Z" fill="${col}" transform="rotate(${i * 40} ${x} ${y})"/><path d="M${x - 3} ${y - 2} l4 -1" stroke="#fff" stroke-width=".8" opacity=".7"/>`).join("");
        if (n === 0) { const hid = c.h < 12 ? 12 : c.h < 17 ? 8 : 4; o += SPOTS.slice(12 - hid).map(([x, y, s, r, l], i) => l === "front" ? egg(x, y, s, i + 2, r) : "").join(""); }
      }
      return `<g aria-hidden="true">${o}</g>`; },
    window: (c) => { const n = phase(c);
      // le matin de Pâques, une cloche ailée passe dans le ciel
      if (n !== 0 || c.per === "night") return "";
      return `<g class="pq-fly" aria-hidden="true">${bell(860, 200, .8, true, -10)}<path d="M846 206 q-20 6 -36 0 q-14 -5 -28 2" stroke="#d9534f" stroke-width="2" fill="none"/><path d="M846 210 q-18 10 -34 6" stroke="#7ac0e6" stroke-width="2" fill="none"/></g>`; },
  };
})();
