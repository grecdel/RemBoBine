(() => {
  // ===== 1er mai : le muguet (en pot sur la cheminée, en bouquet dans un vase, un brin offert sur la table) =====
  const R = (k) => { let x = Math.sin(k * 33.7 + 5.1) * 43758.5453; return x - Math.floor(x); };
  // une clochette de muguet (pendante, bord festonné)
  const bell = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -1 v2" stroke="#6aa86f" stroke-width=".7"/><path d="M-3.6 5.4 Q-4.2 .6 0 .6 Q4.2 .6 3.6 5.4 l-1 .9 l-.6 -.9 l-.7 .9 l-.6 -.9 l-.7 .9 l-.6 -.9 l-.7 .9 Z" fill="#fbfbf3" stroke="#b9cdb4" stroke-width=".6"/><path d="M-2 2 Q-2.4 4 -1.6 5" stroke="#fff" stroke-width=".9" fill="none"/></g>`;
  // un brin : la tige qui s'arque, et 5 à 9 clochettes de plus en plus petites vers le bout
  const sprig = (x, y, h, lean, n = 7, s = 1, cls = "mu-sway") => {
    n = Math.min(n, 6); s *= 1.3; lean = Math.sign(lean || 1) * Math.max(Math.abs(lean), 12);
    const tx = x + lean, ty = y - h * .82, cx = x + lean * .15, cy = y - h * 1.2;
    let o = `<path d="M${x} ${y} Q${cx} ${cy} ${tx} ${ty}" stroke="#4f8f58" stroke-width="${1.3 * s}" fill="none"/>`;
    for (let i = 0; i < n; i++) { const t = .4 + .6 * i / (n - 1), bx = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * tx, by = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ty, side = lean >= 0 ? 1 : -1;
      o += `<path d="M${bx} ${by} q${side * 1.5 * s} 0 ${side * 2.5 * s} ${4 * s}" stroke="#6aa86f" stroke-width=".7" fill="none"/>` + bell(bx + side * 2.5 * s, by + 4 * s, s * (1.05 - .4 * i / (n - 1))); }
    return `<g class="${cls}" style="animation-delay:${(-R(x + h) * 4).toFixed(2)}s">${o}</g>`;
  };
  const leafPair = (x, y, h, s = 1) => `<path d="M${x} ${y} C${x - 14 * s} ${y - h * .4} ${x - 12 * s} ${y - h * .85} ${x - 3 * s} ${y - h} C${x - 2 * s} ${y - h * .6} ${x + 2 * s} ${y - h * .3} ${x} ${y} Z" fill="#3f7d4f"/><path d="M${x} ${y} C${x - 6 * s} ${y - h * .5} ${x - 5 * s} ${y - h * .8} ${x - 3 * s} ${y - h}" stroke="#5a9c66" stroke-width=".8" fill="none"/>
      <path d="M${x} ${y} C${x + 15 * s} ${y - h * .35} ${x + 14 * s} ${y - h * .75} ${x + 6 * s} ${y - h * .92} C${x + 4 * s} ${y - h * .55} ${x + 1 * s} ${y - h * .3} ${x} ${y} Z" fill="#4d9160"/>`;
  FETES2D["muguet"] = {
    replaces: true,
    css: `.mu-sway{transform-box:fill-box;transform-origin:0% 100%;animation:muSway 5s ease-in-out infinite alternate}@keyframes muSway{from{transform:rotate(-2deg)}to{transform:rotate(2.5deg)}}
      .mu-rib{transform-box:fill-box;transform-origin:50% 0;animation:muRib 6s ease-in-out infinite alternate}@keyframes muRib{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}`,
    greet: (c) => `1er mai : du muguet partout dans le salon. Un brin t'attend sur la table basse — ça porte bonheur !`,
    wall: (c) => { let o = "";
      // un ruban vert d'eau en festons, avec de petits bouquets de muguet noués aux attaches
      for (let x0 = 300; x0 < 2300; x0 += 250) {
        o += `<path d="M${x0} 62 Q${x0 + 125} 92 ${x0 + 250} 62" stroke="#bfe0c8" stroke-width="4" fill="none" opacity=".85"/><path d="M${x0} 62 Q${x0 + 125} 92 ${x0 + 250} 62" stroke="#e8f5ec" stroke-width="1" fill="none" opacity=".7"/>`;
        o += `<g transform="translate(${x0} 62)"><path d="M0 0 l-10 -6 l0 12 Z M0 0 l10 -6 l0 12 Z" fill="#bfe0c8"/><g class="mu-rib"><path d="M0 0 l-4 16 M0 0 l5 15" stroke="#bfe0c8" stroke-width="2.4"/></g>${leafPair(0, 30, 26, .55)}${sprig(-1, 30, 22, -9, 6, .8, "")}${sprig(1, 30, 20, 10, 5, .75, "")}<circle r="3" fill="#9fcfac"/></g>`;
      }
      // un petit pot de muguet sur le rebord de la fenêtre
      o += `<g transform="translate(842 401)"><path d="M-12 0 L-14 -16 L14 -16 L12 0 Z" fill="#c97448"/><rect x="-15" y="-19" width="30" height="5" rx="2" fill="#d98a5a"/>${leafPair(-3, -18, 34, .7)}${leafPair(5, -18, 30, .6)}${sprig(-2, -18, 32, -8, 6, .85)}${sprig(3, -18, 28, 9, 6, .8)}</g>`;
      return `<g aria-hidden="true">${o}</g>`; },
    mantel: (c) => { let o = "";
      // le grand pot de muguet sur la cheminée, avec son ruban et sa petite étiquette
      o += `<g transform="translate(1490 318)"><path d="M-17 0 L-20 -24 L20 -24 L17 0 Z" fill="#c97448"/><rect x="-21" y="-28" width="42" height="6" rx="2" fill="#d98a5a"/><path d="M-19 -14 Q0 -10 19 -14" stroke="#f2f0e8" stroke-width="3" fill="none"/><path d="M8 -12 l6 9 M8 -12 l9 4" stroke="#f2f0e8" stroke-width="2"/>
        ${leafPair(-8, -27, 54, .9)}${leafPair(9, -27, 50, .85)}${leafPair(0, -27, 44, .7)}${sprig(-6, -27, 50, -11, 9, 1)}${sprig(-1, -27, 56, 4, 9, 1)}${sprig(4, -27, 46, 12, 8, .95)}${sprig(10, -27, 40, 16, 7, .9)}${sprig(-11, -27, 38, -16, 7, .9)}</g>`;
      o += `<g transform="translate(1536 316) rotate(-6)"><rect x="-13" y="-10" width="26" height="12" rx="1.5" fill="#f4f1ea" stroke="#d9d2c4" stroke-width=".6"/><text y="-1.5" text-anchor="middle" font-size="6" font-weight="700" fill="#4f8f58">1er mai</text></g>`;
      return `<g aria-hidden="true">${o}</g>`; },
    front: (c) => { let o = "";
      // le bouquet dans un petit vase en verre, sur la table basse
      o += `<g transform="translate(1440 640)"><path d="M-9 0 Q-13 -10 -8 -20 L-6 -32 L6 -32 L8 -20 Q13 -10 9 0 Z" fill="rgba(200,235,220,.45)" stroke="rgba(235,250,240,.75)"/><rect x="-8" y="-12" width="16" height="10" fill="rgba(150,200,170,.3)"/>
        ${leafPair(-3, -30, 52, .9)}${leafPair(4, -30, 48, .85)}${[[-10, 46], [-4, 54], [2, 58], [8, 50], [13, 42], [-14, 38], [5, 40]].map(([lean, h], i) => sprig(lean * .2, -30, h, lean, 8, .95)).join("")}
        <path d="M-6 -27 Q0 -24 6 -27" stroke="#f2f0e8" stroke-width="2.4" fill="none"/></g>`;
      // un brin offert, posé sur la table avec une étiquette au prénom
      const who = (c.profiles && c.profiles[0]) ? "Pour " + c.esc(String(c.profiles[0]).slice(0, 10)) : "Pour toi";
      o += `<g transform="translate(1662 646) rotate(-74)">${leafPair(0, 0, 40, .6)}${sprig(0, 0, 46, 9, 8, .9, "")}</g>
        <g transform="translate(1700 642) rotate(6)"><path d="M-16 -7 h30 l4 7 l-4 7 h-30 Z" fill="#f4f1ea" stroke="#cfc6b4" stroke-width=".6"/><circle cx="13" cy="0" r="1.4" fill="#cfc6b4"/><text x="-1" y="2.3" text-anchor="middle" font-size="6.2" fill="#4f8f58" font-style="italic">${who}</text></g>
        <path d="M1676 640 q6 -4 10 0" stroke="#4f8f58" stroke-width=".7" fill="none"/>`;
      return `<g aria-hidden="true">${o}</g>`; },
  };
})();
