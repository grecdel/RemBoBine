(() => {
  // ===== 14 juillet : fanions bleu-blanc-rouge, cocardes, lampions en papier (allumés le soir), bouquet tricolore,
  //       la Patrouille de France le matin et le feu d'artifice par la fenêtre le soir =====
  const R = (k) => { let x = Math.sin(k * 63.1 + 2.9) * 43758.5453; return x - Math.floor(x); };
  const B = "#1f4fa8", W = "#f4f1ea", Rd = "#d8323c";
  const cocarde = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-5 8 L-9 26 L-3 22 L0 28 L2 8 Z" fill="${B}"/><path d="M5 8 L9 26 L3 22 L0 28 L-2 8 Z" fill="${Rd}"/>
      ${Array.from({ length: 16 }, (_, i) => { const a = i * Math.PI / 8; return `<path d="M0 0 L${Math.cos(a - .2) * 15} ${Math.sin(a - .2) * 15} Q${Math.cos(a) * 17} ${Math.sin(a) * 17} ${Math.cos(a + .2) * 15} ${Math.sin(a + .2) * 15} Z" fill="${Rd}"/>`; }).join("")}
      <circle r="10.5" fill="${W}"/>${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<line x1="${Math.cos(a) * 6}" y1="${Math.sin(a) * 6}" x2="${Math.cos(a) * 10}" y2="${Math.sin(a) * 10}" stroke="#d9d2c4" stroke-width=".7"/>`; }).join("")}<circle r="6" fill="${B}"/><circle cx="-1.6" cy="-1.6" r="2" fill="rgba(255,255,255,.3)"/></g>`;
  // lampion en papier plissé (accordéon) ; le soir, une bougie l'allume de l'intérieur
  const lampion = (x, y, col, lit, k) => {
    const gl = lit ? `<circle cx="${x}" cy="${y + 20}" r="34" fill="url(#qtGlow${col === W ? "W" : col === B ? "B" : "R"})" class="qt-flick" style="animation-delay:${(k * .37).toFixed(2)}s"/>` : "";
    const body = lit ? (col === W ? "#fff2cf" : col === B ? "#6f8fe0" : "#ff7a6a") : col;
    return `${gl}<line x1="${x}" y1="${y - 8}" x2="${x}" y2="${y}" stroke="#2a2326" stroke-width="1"/><rect x="${x - 8}" y="${y}" width="16" height="4" rx="1" fill="#2a2326"/>
      <path d="M${x - 9} ${y + 4} Q${x - 17} ${y + 20} ${x - 9} ${y + 36} L${x + 9} ${y + 36} Q${x + 17} ${y + 20} ${x + 9} ${y + 4} Z" fill="${body}"/>
      ${[8, 13, 18, 23, 28, 33].map(d => `<path d="M${x - 13 + Math.abs(d - 20) * .25} ${y + d} Q${x} ${y + d + 2} ${x + 13 - Math.abs(d - 20) * .25} ${y + d}" stroke="rgba(0,0,0,${lit ? .12 : .2})" stroke-width="1" fill="none"/>`).join("")}
      ${lit ? `<ellipse cx="${x}" cy="${y + 22}" rx="5" ry="8" fill="rgba(255,240,190,.55)"/>` : `<path d="M${x - 6} ${y + 8} Q${x - 10} ${y + 20} ${x - 6} ${y + 32}" stroke="rgba(255,255,255,.3)" stroke-width="2" fill="none"/>`}
      <rect x="${x - 8}" y="${y + 36}" width="16" height="3" rx="1" fill="#2a2326"/><path d="M${x} ${y + 39} v6" stroke="${col === W ? Rd : W}" stroke-width="1.5"/>`;
  };
  FETES2D["14juillet"] = {
    replaces: true,
    css: `.qt-flag{transform-box:fill-box;transform-origin:0 50%;animation:qtFlag 3s ease-in-out infinite alternate}@keyframes qtFlag{from{transform:skewY(-3deg) scaleX(.96)}to{transform:skewY(3deg) scaleX(1)}}
      .qt-sway{transform-box:fill-box;transform-origin:50% 0;animation:qtSway 5s ease-in-out infinite alternate}@keyframes qtSway{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}
      .qt-flick{animation:qtFlick 2.4s ease-in-out infinite alternate}@keyframes qtFlick{from{opacity:.75}to{opacity:1}}
      .qt-fw{transform-box:fill-box;transform-origin:50% 50%;animation:qtFw 3.2s ease-out infinite;opacity:0}@keyframes qtFw{0%{opacity:0;transform:scale(.1)}6%{opacity:1}55%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.12) translateY(6px)}}
      .qt-rise{animation:qtRise 3.2s ease-in infinite;opacity:0}@keyframes qtRise{0%{opacity:0;transform:translateY(90px)}2%{opacity:1}6%{opacity:0;transform:translateY(0)}100%{opacity:0}}
      .qt-jet{animation:qtJet 26s linear infinite}@keyframes qtJet{0%{transform:translateX(-260px)}40%{transform:translateX(300px)}100%{transform:translateX(300px)}}`,
    greet: (c) => (c.per === "night" || c.per === "dusk") ? "Bon 14 juillet ! Les lampions sont allumés… et le feu d'artifice a commencé : regarde par la fenêtre !"
      : "C'est le 14 juillet ! Fanions, cocardes et lampions : ce soir, on les allume — et le feu d'artifice sera à la fenêtre.",
    wall: (c) => { const lit = c.per === "night" || c.per === "dusk"; let o = "";
      o += `<defs>${[["W", "#ffe2a0"], ["B", "#9fb6ff"], ["R", "#ff9a7a"]].map(([k, col]) => `<radialGradient id="qtGlow${k}"><stop offset="0" stop-color="${col}" stop-opacity=".55"/><stop offset=".5" stop-color="${col}" stop-opacity=".15"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`).join("")}</defs>`;
      // les fanions en tissu, en deux festons
      for (let x0 = 280; x0 < 2320; x0 += 340) {
        o += `<path d="M${x0} 50 Q${x0 + 170} 96 ${x0 + 340} 50" stroke="#cfc6b4" stroke-width="1.5" fill="none"/>`;
        for (let k = 0; k < 8; k++) { const t = (k + .5) / 8, x = x0 + 340 * t, y = 50 + 4 * 46 * t * (1 - t) / 2 + 1, col = [B, W, Rd][k % 3];
          o += `<g class="qt-sway" style="animation-delay:${(-R(x) * 5).toFixed(2)}s"><path d="M${x - 14} ${y} L${x + 14} ${y} L${x} ${y + 30} Z" fill="${col}"/><path d="M${x - 14} ${y} L${x + 14} ${y} L${x + 12} ${y + 3} L${x - 12} ${y + 3} Z" fill="rgba(0,0,0,.15)"/><path d="M${x - 4} ${y + 4} L${x} ${y + 24}" stroke="rgba(255,255,255,.18)" stroke-width="2"/></g>`; }
      }
      // les lampions, sur une ficelle tendue entre les deux bibliothèques
      o += `<path d="M770 84 Q1330 112 1880 84" stroke="#2a2326" stroke-width="1.2" fill="none"/>`;
      // (pas devant le néon : les lampions s'écartent de part et d'autre)
      o += [818, 900, 982, 1064, 1440, 1520, 1682, 1764, 1846].map((x, k) => { const t = (x - 770) / 1110, y = 84 + 4 * 28 * t * (1 - t) + 6; return `<g class="qt-sway" style="animation-delay:${(-k * .6).toFixed(2)}s">${lampion(x, y, [B, W, Rd][k % 3], lit, k)}</g>`; }).join("");
      // les cocardes, épinglées aux embrasses des rideaux et sur l'abat-jour
      o += cocarde(782, 296, .8) + cocarde(1018, 296, .8) + cocarde(1820, 280, .62);
      // le drapeau à la fenêtre, sur sa hampe
      o += `<rect x="984" y="300" width="3" height="98" fill="#6b4a2b"/><circle cx="985.5" cy="298" r="3" fill="#c9a26b"/><g class="qt-flag">${c.flagSvg("FR", 987, 302, 52, 35)}</g>`;
      return `<g aria-hidden="true">${o}</g>`; },
    mantel: (c) => {
      // un bouquet des champs, bleu-blanc-rouge : bleuets, marguerites, coquelicots
      const fl = (x, y, col, r) => col === Rd ? `<circle cx="${x}" cy="${y}" r="${r}" fill="#d8323c"/><circle cx="${x - r * .3}" cy="${y - r * .2}" r="${r * .55}" fill="#e8504a"/><circle cx="${x}" cy="${y}" r="${r * .28}" fill="#1a1414"/>`
        : col === W ? `${Array.from({ length: 10 }, (_, i) => `<ellipse cx="${x + Math.cos(i * .628) * r * .62}" cy="${y + Math.sin(i * .628) * r * .62}" rx="${r * .5}" ry="${r * .2}" fill="#fbfbf7" transform="rotate(${i * 36} ${x + Math.cos(i * .628) * r * .62} ${y + Math.sin(i * .628) * r * .62})"/>`).join("")}<circle cx="${x}" cy="${y}" r="${r * .32}" fill="#f2c23a"/>`
        : `${Array.from({ length: 8 }, (_, i) => `<path d="M${x} ${y} l${Math.cos(i * .785 - .15) * r} ${Math.sin(i * .785 - .15) * r} l${Math.cos(i * .785 + .15) * r * .3} ${Math.sin(i * .785 + .15) * r * .3} Z" fill="#3a6fe0"/>`).join("")}<circle cx="${x}" cy="${y}" r="${r * .3}" fill="#2a3f9a"/>`;
      const fls = [[-14, -44, B, 6], [-4, -52, W, 7], [8, -48, Rd, 7], [16, -40, B, 5.5], [-18, -34, Rd, 6], [2, -38, W, 6], [12, -30, B, 5], [-8, -30, W, 5.5]];
      let o = `<g transform="translate(1524 318)">${fls.map(([x, y]) => `<path d="M0 -20 Q${x * .4} ${(y - 20) / 2} ${x} ${y}" stroke="#4f8f58" stroke-width="1.2" fill="none"/>`).join("")}${fls.map(([x, y, col, r]) => fl(x, y, col, r)).join("")}
        <path d="M-9 0 Q-12 -10 -8 -20 L8 -20 Q12 -10 9 0 Z" fill="#e8e2d4"/><path d="M-10 -9 Q0 -6 10 -9" stroke="${B}" stroke-width="2" fill="none"/><path d="M-10 -5 Q0 -2 10 -5" stroke="${Rd}" stroke-width="2" fill="none"/></g>`;
      return `<g aria-hidden="true">${o}</g>`; },
    front: (c) => { let o = "";
      // un bol de cerises, trois petits drapeaux dans un verre, le programme du bal
      o += `<g transform="translate(1436 642)"><path d="M-20 -12 Q0 8 20 -12 Z" fill="#f4f1ea"/><path d="M-20 -12 h40" stroke="#d9d2c4" stroke-width="2"/>${[[-12, -14], [-5, -16], [3, -15], [11, -13], [-8, -20], [1, -21], [8, -19]].map(([x, y], i) => `<path d="M${x} ${y} q${3 + i % 2} -8 ${6 - i} -12" stroke="#4f7a3a" stroke-width=".8" fill="none"/><circle cx="${x}" cy="${y}" r="4.2" fill="#a3121e"/><circle cx="${x - 1.4}" cy="${y - 1.4}" r="1.2" fill="#ff8a8a"/>`).join("")}</g>`;
      o += `<g transform="translate(1478 646)"><path d="M-7 0 L-8 -22 L8 -22 L7 0 Z" fill="rgba(235,240,245,.5)" stroke="rgba(255,255,255,.7)"/>${[[-6, -48, -10], [0, -54, 0], [6, -46, 12]].map(([dx, top, r]) => `<g transform="rotate(${r} 0 -18)"><line x1="0" y1="-2" x2="${dx}" y2="${top}" stroke="#8a6a45" stroke-width="1.2"/>${c.flagSvg("FR", dx + .5, top, 18, 12)}</g>`).join("")}</g>`;
      o += `<g transform="translate(1688 642) rotate(-8)"><rect x="-22" y="-12" width="44" height="22" fill="#f4ecd8" stroke="#d9cdb4" stroke-width=".6"/><rect x="-22" y="-12" width="44" height="4" fill="${B}"/><rect x="-22" y="6" width="44" height="4" fill="${Rd}"/><text y="-1" text-anchor="middle" font-size="5.6" font-weight="800" fill="#2a2333">GRAND BAL</text><text y="5" text-anchor="middle" font-size="4" fill="#2a2333">14 juillet · 21 h</text></g>`;
      return `<g aria-hidden="true">${o}</g>`; },
    window: (c) => { let o = "";
      if (c.per === "night" || c.per === "dusk") {
        // le feu d'artifice : fusées qui montent, pivoines de couleurs, étincelles qui retombent
        const bursts = [[850, 196, "#ff5a5a", 0], [948, 172, "#7ab8ff", .8], [900, 226, "#ffe07a", 1.6], [820, 160, "#f4f1ea", 2.3], [970, 214, "#ff7ad9", 2.9], [880, 150, "#6aff9a", 3.7]];
        o += bursts.map(([x, y, col, d], i) => `<g style="animation-delay:${d}s"><line class="qt-rise" style="animation-delay:${d}s;animation-duration:${3.2 + i * .4}s" x1="${x}" y1="${y}" x2="${x}" y2="${y + 10}" stroke="#ffe9b0" stroke-width="1.5"/>
          <g class="qt-fw" style="animation-delay:${d}s;animation-duration:${3.2 + i * .4}s">${Array.from({ length: 16 }, (_, k) => { const a = k * Math.PI / 8, r1 = 6, r2 = 22 + (k % 2) * 6; return `<line x1="${x + Math.cos(a) * r1}" y1="${y + Math.sin(a) * r1}" x2="${x + Math.cos(a) * r2}" y2="${y + Math.sin(a) * r2}" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/><circle cx="${x + Math.cos(a) * (r2 + 3)}" cy="${y + Math.sin(a) * (r2 + 3)}" r="1.2" fill="#fff"/>`; }).join("")}<circle cx="${x}" cy="${y}" r="4" fill="#fff" opacity=".8"/></g></g>`).join("");
      } else if (c.h >= 10 && c.h < 14) {
        // la Patrouille de France passe et trace le drapeau dans le ciel
        o += `<g class="qt-jet">${[[0, 0, B], [-12, 8, W], [-24, 16, Rd]].map(([dx, dy, col]) => `<path d="M${780 + dx} ${170 + dy} L${640 + dx} ${172 + dy}" stroke="${col}" stroke-width="7" stroke-linecap="round" opacity=".75"/><path d="M${780 + dx} ${168 + dy} l10 2 l-10 2 l-3 4 l-1 -4 l-4 0 l0 -4 l4 0 l1 -4 Z" fill="#5a6070"/>`).join("")}</g>`;
      }
      return `<g aria-hidden="true">${o}</g>`; },
  };
})();
