(() => {
  /* ===== Saint-Valentin (14 février) : le matin le bouquet et le mot doux, l'après-midi les pétales et les chocolats, le soir les bougies ===== */
  const R = (k) => { const x = Math.sin(k * 33.71 + 2.77) * 43758.5453; return x - Math.floor(x); };
  const stage = (c) => c.h < 12 ? "matin" : c.h < 18 ? "jour" : "soir";
  const RED = "#c4122f", RED2 = "#e8334f", PINK = "#ff8fb1", PINK2 = "#ffc1d3";
  const catAt = () => { try { const L = lifeDay(); return L.cat === "sofa" ? [1140, 566] : L.cat === "rug" ? [1790, 704] : null; } catch (_) { return null; } };
  const pair = (c) => { const n = (c.profiles || []).filter(Boolean).map(String); return n.length >= 2 ? [n[1], n[0]] : n.length === 1 ? ["", n[0]] : ["", ""]; };

  const heart = (x, y, s, col, extra = "") => `<path d="M${x} ${y + s * .9} C${x - s * 1.4} ${y - s * .1} ${x - s * .8} ${y - s * 1.1} ${x} ${y - s * .35} C${x + s * .8} ${y - s * 1.1} ${x + s * 1.4} ${y - s * .1} ${x} ${y + s * .9} Z" fill="${col}" ${extra}/>`;
  // une rose vue de côté (tête en spirale)
  const rose = (x, y, r, col = RED) => `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${col}"/><path d="M${-r * .7} ${-r * .1} Q0 ${-r * 1.1} ${r * .7} ${-r * .1}" stroke="#8a0a1e" stroke-width="${(r * .18).toFixed(1)}" fill="none"/><path d="M${-r * .4} ${r * .1} Q0 ${-r * .5} ${r * .45} ${r * .15}" stroke="#8a0a1e" stroke-width="${(r * .15).toFixed(1)}" fill="none"/><circle cx="${-r * .3}" cy="${-r * .35}" r="${r * .25}" fill="rgba(255,255,255,.18)"/><path d="M${-r * .9} ${r * .5} Q0 ${r * 1.3} ${r * .9} ${r * .5}" fill="${col}" stroke="#8a0a1e" stroke-width=".6"/></g>`;
  const petal = (x, y, rot, col) => `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4.6" ry="2.8" fill="${col}" transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  const candle = (x, y, h, lit, cls = "") => `<rect x="${x - 4}" y="${y - h}" width="8" height="${h}" rx="1.5" fill="#f3e3e6"/><path d="M${x - 4} ${y - h} q2 5 0 9 M${x + 2} ${y - h} q1 3 0 5" stroke="#fff6f8" stroke-width="1.6" fill="none"/>${lit ? `<path class="candle ${cls}" d="M${x} ${y - h - 1} C${x - 4} ${y - h - 8} ${x} ${y - h - 14} ${x} ${y - h - 18} C${x + 4} ${y - h - 12} ${x + 4} ${y - h - 6} ${x} ${y - h - 1} Z" fill="#ffc35a"/>` : `<path d="M${x} ${y - h} v-4" stroke="#3a2a20" stroke-width="1.2"/>`}`;
  // la boîte de chocolats en forme de cœur ; eaten = nombre de cases vides
  const chocoBox = (x, y, open, eaten) => {
    if (!open) return `<g transform="translate(${x} ${y})"><path d="M0 4 C-30 -6 -24 -26 0 -16 C24 -26 30 -6 0 4 Z" fill="#a50f28"/><path d="M0 0 C-27 -9 -22 -27 0 -19 C22 -27 27 -9 0 0 Z" fill="${RED2}"/><path d="M-20 -14 L20 -6 M-2 -22 L2 2" stroke="#ffd36a" stroke-width="2"/><path d="M4 -12 q-8 -8 -12 -2 q4 4 12 2 Z M4 -12 q8 -8 12 -2 q-4 4 -12 2 Z" fill="#ffd36a"/></g>`;
    const cells = [[-12, -10], [-4, -12], [4, -12], [12, -10], [-8, -5], [0, -6], [8, -5], [-3, 0], [3, 0]];
    return `<g transform="translate(${x} ${y})"><path d="M-30 -4 C-46 -30 -10 -40 -6 -24 Z" fill="#a50f28" transform="rotate(-24 -18 -20)"/><path d="M0 4 C-30 -6 -24 -26 0 -16 C24 -26 30 -6 0 4 Z" fill="#7a0a1e"/><path d="M0 1 C-25 -8 -20 -23 0 -15 C20 -23 25 -8 0 1 Z" fill="#f4d8a8"/>${cells.map(([a, b], i) => `<ellipse cx="${a}" cy="${b}" rx="3.6" ry="2.4" fill="#e9c58c"/>${i < cells.length - eaten ? `<ellipse cx="${a}" cy="${b - .8}" rx="3" ry="2.2" fill="${["#4a2412", "#6b3a1e", "#f2e6d0", "#3a1a0c"][i % 4]}"/><path d="M${a - 1.6} ${b - 1.4} q1.6 -1 3.2 0" stroke="${i % 3 ? "#8a5a3a" : "#fff"}" stroke-width=".6" fill="none"/>` : ""}`).join("")}</g>`;
  };
  const glass = (x, y, lvl) => `<g transform="translate(${x} ${y})"><ellipse cy="-1" rx="6.5" ry="1.8" fill="rgba(255,255,255,.5)"/><path d="M-.7 -1 V-14 M.7 -1 V-14" stroke="rgba(255,255,255,.65)" stroke-width="1"/>${lvl ? `<path d="M-6.4 -24 Q-6.5 -15 0 -14.2 Q6.5 -15 6.4 -24 Z" fill="#e8708a" opacity=".85"/>` : ""}<path d="M-7.5 -32 Q-8 -14 0 -13.5 Q8 -14 7.5 -32 Z" fill="rgba(255,255,255,.13)" stroke="rgba(255,255,255,.7)" stroke-width="1"/></g>`;

  FETES2D["valentin"] = {
    replaces: true,
    css: `
      .salon:has(.vl-on) g[transform="translate(922 628)"] { display: none; }
      .vl-beat { transform-box: fill-box; transform-origin: center; animation: vlBeat 1.6s ease-in-out infinite; }
      @keyframes vlBeat { 0%, 100% { transform: scale(1); } 12% { transform: scale(1.12); } 24% { transform: scale(1); } 36% { transform: scale(1.08); } }
      .vl-sway { transform-box: fill-box; transform-origin: 50% 100%; animation: vlSway 5s ease-in-out infinite alternate; }
      @keyframes vlSway { from { transform: rotate(-4deg); } to { transform: rotate(4deg); } }
      .vl-fog { animation: vlFog 6s ease-in-out infinite alternate; }
      @keyframes vlFog { from { opacity: .45; } to { opacity: .8; } }
      .salon.still .vl-beat, .salon.still .vl-sway, .salon.still .vl-fog { animation: none; }`,
    greet: (c) => {
      const st = stage(c), [from, to] = pair(c);
      const note = to ? (from ? `« Pour ${to}, de la part de ${from} »` : `« Pour ${to} »`) : "« Pour toi »";
      if (st === "matin") return `Joyeuse Saint-Valentin ! Un bouquet de roses est arrivé ce matin… et un mot doux attend sur la table basse : ${note}.`;
      if (st === "jour") return `Joyeuse Saint-Valentin ! Un chemin de pétales mène au canapé, la boîte de chocolats est ouverte, et le mot doux dit : ${note}.`;
      return "Soirée Saint-Valentin : les bougies sont allumées, deux verres attendent… et il ne reste presque plus de chocolats.";
    },
    wall: (c) => {
      const st = stage(c);
      let o = `<g class="vl-on"></g>`;
      // guirlande de cœurs en papier dentelle le long du haut des murs
      const x0 = 770, x1 = 1890, y0 = 50; let g = `<path d="M${x0} ${y0} Q${(x0 + x1) / 2} ${y0 + 40} ${x1} ${y0}" fill="none" stroke="#e8c6cf" stroke-width="1.2"/>`;
      for (let x = 800, k = 0; x < 1870; x += 56, k++) { const t = (x - x0) / (x1 - x0), y = y0 + 80 * t * (1 - t);
        g += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 12}" stroke="#e8c6cf"/>${k % 2 ? heart(x, y + 24, 12, "#fff6f8") + heart(x, y + 24, 9, [RED2, PINK, RED][k % 3]) : heart(x, y + 24, 11, [PINK, RED2, PINK2][k % 3])}`; }
      o += `<g>${g}</g>`;
      // un grand cœur en papier découpé, accroché au-dessus de la cheminée, sous l'horloge
      return o;
    },
    mantel: (c) => {
      const st = stage(c), lit = st === "soir", [from, to] = pair(c);
      let o = "";
      // bougies roses de hauteurs différentes (allumées le soir)
      o += candle(1452, 318, 30, lit) + candle(1468, 318, 20, lit, "c2") + candle(1660, 318, 26, lit, "c2") + candle(1696, 318, 16, lit);
      // le cadre-photo avec un cœur et les initiales des profils
      const ini = (s) => s ? c.esc(s[0].toUpperCase()) : "";
      o += `<g transform="translate(1508 318)"><path d="M-17 0 L-15 -36 L15 -36 L17 0 Z" fill="#c9a26b"/><rect x="-12" y="-32" width="24" height="28" fill="#fbeef2"/>${heart(0, -20, 8, RED2)}<text y="-7" text-anchor="middle" font-size="6" font-weight="700" fill="#8a1a2e">${from && to ? `${ini(from)} + ${ini(to)}` : to ? ini(to) + " ♥" : "♥"}</text></g>`;
      // quelques pétales tombés sur la cheminée
      o += [1530, 1588, 1606, 1640].map((x, i) => petal(x, 316, i * 40, i % 2 ? RED : PINK)).join("");
      // deux ballons en cœur, attachés derrière le canapé, qui flottent devant le mur
      o += [[1018, 420, RED2], [1006, 470, PINK]].map(([x, y, col], i) => `<g class="vl-sway" style="animation-delay:${-i * 2}s"><path d="M${x} ${y + 22} Q${x + 12} ${y + 70} ${x - 2} ${y + 140}" stroke="#ddd" stroke-width="1" fill="none"/>${heart(x, y, 20, col, 'opacity=".96"')}<ellipse cx="${x - 7}" cy="${y - 7}" rx="4.5" ry="7" fill="rgba(255,255,255,.35)"/></g>`).join("");
      return o;
    },
    front: (c) => {
      const st = stage(c), lit = st === "soir", [from, to] = pair(c), cat = catAt();
      let o = "";
      // le bouquet de douze roses dans son vase, avec un ruban
      const heads = [[-16, -86], [-6, -96], [6, -94], [17, -84], [-22, -72], [-10, -78], [2, -82], [12, -74], [22, -68], [-4, -68], [9, -64], [-15, -62]];
      o += `<g transform="translate(1486 642)"><path d="M-12 0 L-15 -38 L15 -38 L12 0 Z" fill="rgba(235,215,225,.55)" stroke="rgba(255,255,255,.7)"/><path d="M-13 -24 L13 -24" stroke="${RED}" stroke-width="3.4"/><path d="M0 -24 q-8 6 -10 14 M0 -24 q8 6 10 14" stroke="${RED}" stroke-width="2.4" fill="none"/>${heads.map(([x, y]) => `<path d="M0 -34 Q${x * .4} ${(y - 34) / 2} ${x} ${y + 6}" stroke="#3f7d4f" stroke-width="1.6" fill="none"/>`).join("")}${[[-14, -58, -40], [14, -54, 40], [-20, -44, -60], [18, -42, 60]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.2" fill="#3f8a4f" transform="rotate(${r} ${x} ${y})"/>`).join("")}${heads.map(([x, y], i) => rose(x, y, 6.2 + (i % 3) * .6, i % 4 === 3 ? "#d81b3e" : RED)).join("")}</g>`;
      // la boîte de chocolats : fermée le matin, entamée l'après-midi, presque vide le soir
      o += chocoBox(1572, 640, st !== "matin", st === "matin" ? 0 : st === "jour" ? 3 : 7);
      if (st !== "matin") o += `<g>${[[1604, 648], [1612, 644]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="4" ry="1.6" fill="${i ? "#f4d8a8" : "#e9c58c"}"/>`).join("")}</g>`;
      // le mot doux : une enveloppe avec un cachet en cœur, et la carte dépliée
      const msg = to ? `Pour ${c.esc(to.slice(0, 10))}` : "Pour toi";
      o += `<g transform="translate(1640 644) rotate(-6)"><rect x="-17" y="-11" width="34" height="22" rx="1.5" fill="#fbf2f4" stroke="#e8c6cf" stroke-width=".7"/><path d="M-17 -11 L0 2 L17 -11" stroke="#e8c6cf" stroke-width=".8" fill="none"/>${heart(0, 0, 4, RED)}</g>`;
      o += `<g transform="translate(1678 632) rotate(5)"><rect x="-20" y="-16" width="40" height="28" rx="1.2" fill="#fffaf6" stroke="#e8c6cf" stroke-width=".6"/><text y="-7" text-anchor="middle" font-size="5.4" font-style="italic" fill="#8a1a2e">${msg},</text><text y="0" text-anchor="middle" font-size="4.4" font-style="italic" fill="#5a3a3a">je t'aime gros</text><text y="5.4" text-anchor="middle" font-size="4.4" font-style="italic" fill="#5a3a3a">comme la maison.</text>${from ? `<text x="17" y="10.5" text-anchor="end" font-size="4" font-style="italic" fill="#8a1a2e">${c.esc(from.slice(0, 10))} ♥</text>` : heart(14, 8, 2.4, RED)}</g>`;
      // deux bougies et deux verres pour le soir (bougies éteintes dans la journée)
      o += `<g>${candle(1432, 650, 18, lit)}${candle(1704, 654, 14, lit, "c2")}</g>`;
      if (st !== "matin") o += glass(1528, 648, lit) + glass(1610, 628, lit);
      // le chemin de pétales : de la porte (à droite) jusqu'à la table et au canapé, avec un cœur de pétales sur le parquet
      if (st !== "matin") {
        let p = "";
        for (let i = 0; i < 34; i++) { const t = i / 33, x = 2180 - t * 790 + Math.sin(t * 9) * 18, y = 712 - t * 40 + Math.cos(t * 7) * 6; if (x > 1395 && x < 1735 && y < 666) continue; p += petal(x + (R(i) - .5) * 14, y + (R(i + 50) - .5) * 8, R(i + 9) * 180, i % 3 ? RED : PINK); }
        for (let i = 0; i < 28; i++) { const a = i / 28 * 6.283, hx = 16 * Math.pow(Math.sin(a), 3), hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); p += petal(2040 + hx * 2.4, 690 + hy * 1.1, a * 57, i % 2 ? RED : RED2); }
        p += Array.from({ length: 16 }, (_, i) => petal(470 + R(i + 120) * 420, 660 + R(i + 140) * 54, R(i + 160) * 180, i % 3 ? RED : PINK)).join("");
        o += `<g>${p}</g>`;
      }
      // le coussin en cœur sur le canapé
      o += `<g transform="translate(1000 592) rotate(-10)">${heart(0, 0, 18, RED2)}<path d="M-14 -2 Q0 14 14 -2" stroke="#fff6f8" stroke-width="1.2" stroke-dasharray="2 2" fill="none"/>${heart(0, -1, 5, "#fff6f8")}</g>`;
      // le chat porte un petit nœud rose
      if (cat) o += `<g transform="translate(${cat[0] + 16} ${cat[1] - 2})"><path d="M0 0 l-6 -4 l0 8 Z M0 0 l6 -4 l0 8 Z" fill="${PINK}"/><circle r="1.8" fill="${RED2}"/></g>`;
      return o;
    },
    window: (c) => {
      // un cœur dessiné du bout du doigt sur la buée de la vitre, avec les initiales
      const [from, to] = pair(c), ini = (s) => s ? c.esc(s[0].toUpperCase()) : "";
      return `<g class="vl-fog"><rect x="904" y="268" width="96" height="120" fill="rgba(235,240,245,.28)"/>${heart(950, 318, 22, "none", 'stroke="rgba(255,255,255,.85)" stroke-width="2.6" stroke-linecap="round"')}<text x="950" y="322" text-anchor="middle" font-size="12" font-weight="700" fill="rgba(255,255,255,.85)">${from && to ? ini(from) + "+" + ini(to) : "♥"}</text><path d="M934 342 v12 M962 344 v8" stroke="rgba(255,255,255,.55)" stroke-width="1.4"/></g>`;
    },
  };
})();
