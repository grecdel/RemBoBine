(() => {
  /* ===== Chandeleur (2 février) : le matin la pâte repose, l'après-midi la pile de crêpes, le soir les restes ===== */
  const R = (k) => { const x = Math.sin(k * 45.164 + 9.31) * 43758.5453; return x - Math.floor(x); };
  const stage = (c) => c.h < 12 ? "pate" : c.h < 20 ? "crepes" : "restes";
  const names = (c) => (c.profiles || []).filter(Boolean).slice(0, 3);
  const CR = "#e9b968", CR2 = "#d79a4a", SPOT = "#b8742e";

  const spots = (cx, cy, rx, ry, n, seed) => Array.from({ length: n }, (_, i) => { const a = R(i + seed) * 6.283, rr = Math.sqrt(R(i + seed + 5)) * .8; return `<ellipse cx="${(cx + Math.cos(a) * rx * rr).toFixed(1)}" cy="${(cy + Math.sin(a) * ry * rr).toFixed(1)}" rx="${(1.2 + R(i + seed + 2) * 1.6).toFixed(1)}" ry="${(.6 + R(i + seed + 3) * .7).toFixed(1)}" fill="${SPOT}" opacity=".55"/>`; }).join("");
  // une crêpe vue de biais
  const crepe = (x, y, rx, ry, seed = 0, fill = CR) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/><path d="M${x - rx} ${y} Q${x - rx * .6} ${y + ry * 1.3} ${x} ${y + ry} Q${x + rx * .6} ${y + ry * 1.3} ${x + rx} ${y}" stroke="${CR2}" stroke-width="1.2" fill="none"/>${spots(x, y, rx, ry, 9, seed)}`;
  const plate = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y + 2}" rx="${rx}" ry="${ry}" fill="rgba(0,0,0,.18)"/><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#f4f1ea"/><ellipse cx="${x}" cy="${y}" rx="${rx * .76}" ry="${ry * .7}" fill="#e9e3d6"/>`;
  // la pile de crêpes (n crêpes), qui déborde un peu de l'assiette
  const pile = (x, y, n) => { let o = plate(x, y, 36, 9); for (let i = 0; i < n; i++) { const yy = y - 2 - i * 2.4, dx = (R(i + 70) - .5) * 4; o += `<path d="M${x - 30 + dx} ${yy} Q${x - 33 + dx} ${yy + 4} ${x - 26 + dx} ${yy + 5} L${x + 26 + dx} ${yy + 5} Q${x + 33 + dx} ${yy + 4} ${x + 30 + dx} ${yy} Z" fill="${i % 2 ? CR2 : "#dfa458"}"/>`; }
    const top = y - 2 - n * 2.4; o += crepe(x, top, 30, 7, n) + `<path d="M${x - 30} ${top + 2} q-6 6 -4 12 q4 -2 6 -8" fill="${CR}"/>`; return o; };
  const roll = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-15" y="-4" width="30" height="8" rx="4" fill="${CR}"/><ellipse cx="15" cy="0" rx="2.4" ry="4" fill="#c0703a"/><path d="M-12 -2 h22" stroke="${SPOT}" stroke-width=".8" opacity=".6"/></g>`;
  const pan = (x, y, crepeIn, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot})"><ellipse rx="27" ry="7.5" fill="#26262c"/><ellipse cy="-1" rx="23" ry="6" fill="#3a3a42"/>${crepeIn ? crepe(0, -1.5, 20, 5, 33) : `<ellipse cx="-6" cy="-2" rx="8" ry="2" fill="rgba(255,255,255,.12)"/>`}<rect x="25" y="-3" width="34" height="5.5" rx="2.6" fill="#5a3a26" transform="rotate(-8 25 0)"/><circle cx="55" cy="-6.6" r="1.4" fill="#2a1a10"/></g>`;
  const bowl = (x, y, cloth, lvl) => `<g transform="translate(${x} ${y})"><path d="M-26 -18 Q-26 2 0 2 Q26 2 26 -18 Z" fill="#c8dce6"/><path d="M-26 -18 Q-26 2 0 2" stroke="rgba(255,255,255,.4)" stroke-width="3" fill="none"/><ellipse cy="-18" rx="26" ry="6.5" fill="#e6f0f4"/>${lvl > 0 ? `<ellipse cy="${-18 + (1 - lvl) * 4}" rx="${22 - (1 - lvl) * 4}" ry="5" fill="#f1dc9a"/><path d="M-8 ${-19 + (1 - lvl) * 4} q4 2 9 0" stroke="#e3c676" stroke-width="1" fill="none"/>` : ""}${cloth ? `<path d="M-30 -20 Q-10 -30 6 -22 Q20 -28 30 -19 Q28 -6 18 -10 Q4 -4 -10 -9 Q-22 -4 -30 -10 Z" fill="#f4f1ea"/><path d="M-26 -18 L22 -23 M-22 -12 L26 -16 M-14 -26 L-8 -6 M2 -26 L6 -6 M16 -26 L18 -10" stroke="#c43a3a" stroke-width="1.6" opacity=".75"/>` : ""}</g>`;
  const whisk = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-22" y="-2" width="16" height="4" rx="2" fill="#5a3a26"/><path d="M-6 0 Q6 -7 14 0 Q6 7 -6 0 M-6 0 Q6 -3 14 0 Q6 3 -6 0" stroke="#c9ccd6" stroke-width="1" fill="none"/></g>`;
  const eggs = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-18 0 L-20 -8 L20 -8 L18 0 Z" fill="#c9b08a"/>${[-12, -4, 4, 12].map((dx, i) => i === 3 ? `<path d="M${dx - 4} -8 q4 -4 8 0" fill="none" stroke="#f4ecdc" stroke-width="1.2"/>` : `<ellipse cx="${dx}" cy="-10" rx="3.6" ry="4.6" fill="${i % 2 ? "#f4ecdc" : "#e9d2b0"}"/>`).join("")}</g>`;
  const flour = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-11 0 L-12 -30 Q-6 -34 0 -31 Q6 -34 12 -30 L11 0 Z" fill="#f2eee4"/><path d="M-12 -30 Q-6 -34 0 -31 Q6 -34 12 -30 L12 -27 L-12 -27 Z" fill="#e2dccd"/><text y="-13" text-anchor="middle" font-size="5.4" font-weight="800" fill="#4a6a9a">FARINE</text><path d="M-7 -8 h14" stroke="#c9a46a" stroke-width="1.5"/><ellipse cx="14" cy="-1" rx="7" ry="1.6" fill="#f6f3ec"/></g>`;
  const milk = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-7 0 L-7 -28 Q-7 -33 -3.5 -36 L-3.5 -42 L3.5 -42 L3.5 -36 Q7 -33 7 -28 L7 0 Z" fill="rgba(240,244,250,.92)"/><rect x="-3.8" y="-46" width="7.6" height="5" fill="#3a7ad8"/><rect x="-7" y="-22" width="14" height="10" fill="#3a7ad8" opacity=".85"/><text y="-15" text-anchor="middle" font-size="4.6" font-weight="800" fill="#fff">LAIT</text></g>`;
  const jar = (x, y, col, open, label) => `<g transform="translate(${x} ${y})"><rect x="-8" y="-20" width="16" height="20" rx="3" fill="${col}"/><rect x="-8" y="-20" width="16" height="20" rx="3" fill="rgba(255,255,255,.15)"/><rect x="-6" y="-13" width="12" height="7" fill="#f6efdc"/><text y="-8" text-anchor="middle" font-size="4" font-weight="700" fill="#6a3a2a">${label}</text>${open ? `<path d="M8 -20 l10 -12" stroke="#c9ccd6" stroke-width="1.8"/><ellipse cx="18" cy="-33" rx="3" ry="2" fill="#c9ccd6"/>` : `<rect x="-9" y="-25" width="18" height="6" rx="2" fill="${label === "MIEL" ? "#e8c15a" : "#d9dbe6"}"/><path d="M-9 -22 h18" stroke="rgba(0,0,0,.15)"/>`}</g>`;
  const sugar = (x, y, spill) => `<g transform="translate(${x} ${y})"><path d="M-6 0 L-6 -20 Q0 -26 6 -20 L6 0 Z" fill="rgba(235,240,248,.85)" stroke="rgba(255,255,255,.8)" stroke-width=".8"/><path d="M-5 -1 L-5 -12 L5 -12 L5 -1 Z" fill="#fbfbf8"/><path d="M-6 -20 Q0 -26 6 -20 L5 -24 Q0 -29 -5 -24 Z" fill="#c9ccd6"/>${[-2, 0, 2].map(dx => `<circle cx="${dx}" cy="-25.5" r=".5" fill="#555"/>`).join("")}${spill ? Array.from({ length: 22 }, (_, i) => `<circle cx="${(12 + R(i + 90) * 26).toFixed(1)}" cy="${(-1 - R(i + 91) * 5).toFixed(1)}" r=".7" fill="#fdfdfb"/>`).join("") : ""}</g>`;
  const pitcher = (x, y, lvl) => `<g transform="translate(${x} ${y})"><path d="M-10 0 L-12 -28 L10 -28 L12 0 Z" fill="rgba(225,235,242,.55)" stroke="rgba(255,255,255,.75)" stroke-width="1"/><path d="M-10 -28 l-5 -3 l3 4" fill="rgba(225,235,242,.7)"/><path d="M10 -24 q8 0 8 9 q0 8 -9 8" stroke="rgba(255,255,255,.7)" stroke-width="2.4" fill="none"/>${lvl > 0 ? `<path d="M-10.6 -1 L${(-10.6 - lvl * 1.2).toFixed(1)} ${(-1 - 25 * lvl).toFixed(1)} L${(10.6 + lvl * 1.2).toFixed(1)} ${(-1 - 25 * lvl).toFixed(1)} L10.6 -1 Z" fill="#f1dc9a" opacity=".92"/>` : `<path d="M-10 -3 h20" stroke="#f1dc9a" stroke-width="2"/>`}<path d="M-12 -28 q2 6 0 10" stroke="#f1dc9a" stroke-width="2" fill="none" opacity="${lvl > 0 ? .9 : 0}"/></g>`;
  const ladle = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><ellipse rx="7" ry="3" fill="#c9ccd6"/><path d="M6 -1 L30 -14" stroke="#c9ccd6" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="-1" cy="-.5" rx="5" ry="1.8" fill="#f1dc9a"/></g>`;
  const coin = (x, y) => `<g transform="translate(${x} ${y})"><ellipse rx="5.5" ry="2.6" fill="#b8902c"/><ellipse cy="-.8" rx="5.5" ry="2.6" fill="#f2c64e"/><ellipse cy="-.8" rx="3.4" ry="1.5" fill="none" stroke="#c99a2a" stroke-width=".7"/><path class="cd-tw" d="M6 -6 l1 -3 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1 Z" fill="#fff6c8"/></g>`;
  const lemon = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-8 0 Q-8 -9 0 -9 Q8 -9 8 0 Z" fill="#f2d23a"/><ellipse cy="-1" rx="7" ry="2.4" fill="#f8eda0"/>${[0, 1, 2, 3, 4, 5].map(k => `<path d="M0 -1 L${(Math.cos(k * 1.047) * 6).toFixed(1)} ${(-1 + Math.sin(k * 1.047) * 2.1).toFixed(1)}" stroke="#ead77a" stroke-width=".6"/>`).join("")}</g>`;
  const candle = (x, y, h, cls = "") => `<rect x="${x - 3.5}" y="${y - h}" width="7" height="${h}" rx="1.4" fill="#f3e9d6"/><path d="M${x - 3.5} ${y - h} q1.5 4 0 7" stroke="#fffaf0" stroke-width="1.4" fill="none"/><path class="candle ${cls}" d="M${x} ${y - h - 1} C${x - 3.5} ${y - h - 7} ${x} ${y - h - 12} ${x} ${y - h - 15} C${x + 3.5} ${y - h - 10} ${x + 3.5} ${y - h - 5} ${x} ${y - h - 1} Z" fill="#ffc35a"/>`;

  FETES2D["chandeleur"] = {
    replaces: true,
    css: `
      .salon:has(.cd-on) g[transform="translate(922 628)"] { display: none; }
      .cd-steam { animation: cdSteam 3.4s ease-in-out infinite; opacity: 0; }
      @keyframes cdSteam { 0% { transform: translateY(4px) scaleX(1); opacity: 0; } 40% { opacity: .55; } 100% { transform: translateY(-22px) scaleX(1.4); opacity: 0; } }
      .cd-drip { animation: cdDrip 4s ease-in infinite; }
      @keyframes cdDrip { 0%, 60% { transform: translateY(0); opacity: 1; } 95% { transform: translateY(40px); opacity: 1; } 100% { transform: translateY(44px); opacity: 0; } }
      .cd-tw { animation: cdTw 2.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      @keyframes cdTw { 0%, 100% { opacity: 0; transform: scale(.4); } 50% { opacity: 1; transform: scale(1); } }
      .salon.still .cd-steam, .salon.still .cd-drip, .salon.still .cd-tw { animation: none; }`,
    greet: (c) => {
      const st = stage(c), n = names(c);
      if (st === "pate") return "C'est la Chandeleur ! La pâte repose sous son torchon, la poêle attend : les crêpes, ce sera pour cet après-midi.";
      if (st === "crepes") return `C'est la Chandeleur : une pile de crêpes toutes chaudes sur la table… ${n.length ? n[0] + " a voulu faire sauter la première : elle" : "la première"} est restée collée au plafond.`;
      return "Fin de Chandeleur : il reste quelques crêpes, du sucre partout… et une crêpe a atterri sur l'abat-jour. Qui l'a fait sauter si haut ?";
    },
    wall: (c) => {
      const st = stage(c);
      let o = `<g class="cd-on"></g>`;
      // une guirlande de crêpes, de citrons et de fraises en papier, le long du haut des murs
      const x0 = 1040, x1 = 1900, y0 = 50; let g = `<path d="M${x0} ${y0} Q${(x0 + x1) / 2} ${y0 + 44} ${x1} ${y0}" stroke="#c9b48a" stroke-width="1.4" fill="none"/>`;
      for (let i = 0; i < 15; i++) { const t = (i + .5) / 15, x = x0 + (x1 - x0) * t, y = y0 + 44 * 2 * t * (1 - t) + 1, k = i % 3;
        g += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 6}" stroke="#c9b48a"/>`;
        if (k === 0) g += `<circle cx="${x}" cy="${y + 18}" r="12" fill="${CR}"/><circle cx="${x}" cy="${y + 18}" r="12" fill="none" stroke="${CR2}" stroke-width="1.6"/>${spots(x, y + 18, 10, 10, 6, i * 7)}`;
        else if (k === 1) g += `<path d="M${x - 9} ${y + 8} Q${x} ${y + 4} ${x + 9} ${y + 8} Q${x + 8} ${y + 22} ${x} ${y + 28} Q${x - 8} ${y + 22} ${x - 9} ${y + 8} Z" fill="#e0384a"/><path d="M${x - 6} ${y + 7} l3 -3 l3 3 l3 -3 l3 3" stroke="#3f8f3a" stroke-width="2" fill="none"/>${[[-4, 13], [3, 14], [0, 20], [-3, 19], [4, 20]].map(([a, b]) => `<circle cx="${x + a}" cy="${y + b}" r=".8" fill="#ffe08a"/>`).join("")}`;
        else g += `<circle cx="${x}" cy="${y + 16}" r="10" fill="#f2d23a"/><circle cx="${x}" cy="${y + 16}" r="8" fill="#f8eda0"/>${[0, 1, 2, 3, 4, 5].map(j => `<path d="M${x} ${y + 16} L${(x + Math.cos(j * 1.047) * 7.5).toFixed(1)} ${(y + 16 + Math.sin(j * 1.047) * 7.5).toFixed(1)}" stroke="#ead77a" stroke-width="1"/>`).join("")}`; }
      o += `<g>${g}</g>`;
      return o;
    },
    mantel: (c) => {
      const st = stage(c), n = names(c);
      let o = "";
      // les chandelles de la Chandeleur : un chandelier à trois branches en laiton, à gauche sur la cheminée
      o += `<g><path d="M1480 318 L1484 308 L1496 308 L1500 318 Z" fill="#c9a24a"/><rect x="1488" y="290" width="4" height="18" fill="#c9a24a"/><path d="M1470 294 Q1470 302 1490 302 Q1510 302 1510 294" stroke="#c9a24a" stroke-width="3" fill="none"/><rect x="1466" y="290" width="8" height="5" rx="1" fill="#b8902c"/><rect x="1506" y="290" width="8" height="5" rx="1" fill="#b8902c"/><rect x="1486" y="286" width="8" height="5" rx="1" fill="#b8902c"/>${candle(1470, 291, 22)}${candle(1490, 287, 26, "c2")}${candle(1510, 291, 22)}</g>`;
      // la recette, sur une petite carte posée contre le mur
      o += `<g transform="translate(1594 318) rotate(-4)"><rect x="-17" y="-34" width="34" height="34" rx="1.5" fill="#fbf6e6" stroke="#d8c8a8" stroke-width=".6"/><text y="-26" text-anchor="middle" font-size="4.4" font-weight="800" fill="#8a3a2a">PÂTE À CRÊPES</text>${["250 g farine", "4 œufs", "½ l de lait", "1 pincée de sel", "repos : 1 h"].map((t, i) => `<text x="-14" y="${-19 + i * 4.4}" font-size="3.3" fill="#5a4a3a">${t}</text>`).join("")}</g>`;
      // le tableau des sauts de crêpe, épinglé sur le meuble télé (à partir de l'après-midi)
      if (st !== "pate") { const who = n.length ? n : ["Toi"]; o += `<g transform="translate(1380 499) rotate(-3)"><rect x="-36" y="-30" width="72" height="${12 + who.length * 6}" rx="1.2" fill="#fbf8f0" stroke="#d8d0c0" stroke-width=".6" transform="translate(0 0)"/><text y="-23" text-anchor="middle" font-size="4.6" font-weight="800" fill="#3a5a8a">CRÊPES SAUTÉES</text>${who.map((nm, i) => `<text x="-32" y="${-16 + i * 6}" font-size="4.4" fill="#4a3a2a">${c.esc(String(nm).slice(0, 8))}</text><text x="-4" y="${-16 + i * 6}" font-size="4.4" fill="#8a3a2a">${"|".repeat(2 + (i * 3 + c.y) % 4)}${i === 0 ? " + 1 au plafond" : ""}</text>`).join("")}</g>`; }
      return o;
    },
    front: (c) => {
      const st = stage(c);
      let o = "";
      if (st === "pate") {
        // le matin : la pâte qui repose sous son torchon, et tous les ingrédients
        o += bowl(1498, 640, true, 1) + whisk(1548, 646, -10) + eggs(1594, 640) + flour(1634, 642) + milk(1668, 642) + sugar(1694, 644, false);
        o += `<g transform="translate(1440 632)"><rect x="-14" y="-4" width="28" height="7" rx="1.5" fill="#f6efdc"/><text y="1.6" text-anchor="middle" font-size="4" fill="#8a3a2a">repos 1 h !</text></g>`;
        o += pan(1450, 652, false, 6);
      } else {
        const done = st === "restes";
        // la pile de crêpes (qui baisse le soir), la poêle, le pichet de pâte, les confitures, le sucre et la pièce d'or
        o += pile(1468, 640, done ? 3 : 13);
        if (!done) o += `<g class="cd-steam"><path d="M1460 590 q-5 -8 0 -16 q5 -8 0 -14" stroke="rgba(255,255,255,.35)" stroke-width="3" fill="none"/></g><g class="cd-steam" style="animation-delay:1.6s"><path d="M1476 592 q5 -8 0 -16 q-5 -8 0 -14" stroke="rgba(255,255,255,.3)" stroke-width="3" fill="none"/></g>`;
        o += pan(1548, 648, !done, -4) + pitcher(1622, 640, done ? 0 : .55) + ladle(1600, 652, 4);
        o += jar(1656, 642, "#c4283a", done, "FRAISE") + jar(1676, 646, "#e8902a", false, "ABRICOT") + jar(1696, 642, "#c9902a", done, "MIEL");
        o += sugar(1702, 652, done) + coin(1520, 628) + lemon(1430, 652);
        if (done) o += plate(1600, 628, 18, 4.6) + roll(1600, 625, -6) + `<path d="M1586 630 l20 -4" stroke="#c9ccd6" stroke-width="1.4"/>`;
      }
      // la crêpe collée au plafond, près de l'ampoule (à partir de l'après-midi), et celle tombée sur l'abat-jour (le soir)
      if (st !== "pate") o += `<g transform="translate(-70 26) scale(1.15)"><path d="M1500 6 Q1524 2 1548 6 Q1544 13 1526 14 Q1506 14 1500 6 Z" fill="${CR}"/><path d="M1500 6 Q1524 12 1548 6" stroke="${CR2}" stroke-width="1.2" fill="none"/>${spots(1524, 9, 18, 3, 6, 61)}<ellipse class="cd-drip" cx="1530" cy="15" rx="1.6" ry="2.4" fill="#f1dc9a"/></g>`;
      if (st === "restes") o += `<g transform="translate(1820 256)"><path d="M-26 2 Q-28 14 -24 26 Q-18 22 -16 12 Q-6 8 0 10 Q8 7 16 12 Q20 22 26 24 Q28 12 24 2 Q0 -6 -26 2 Z" fill="${CR}"/><path d="M-26 2 Q0 -6 24 2" stroke="${CR2}" stroke-width="1.4" fill="none"/>${spots(0, 6, 20, 5, 7, 81)}</g>`;
      return o;
    },
  };
})();
