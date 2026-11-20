(() => {
  // ===== Les jours de souvenir : Toussaint (1er novembre), 8 mai, 11 novembre =====
  // Sobre et respectueux : une bougie, des fleurs, un bleuet. Rien de festif.
  const BLUE = "#3a64d8";
  // bougie dans un verre (lumignon) ; sa petite lueur locale
  const lumignon = (x, y, s = 1, glass = "rgba(200,40,40,.55)") => `<g transform="translate(${x} ${y}) scale(${s})"><circle cy="-24" r="26" fill="url(#svGlow)" class="sv-breathe"/>
      <path d="M-8 0 L-9 -20 L9 -20 L8 0 Z" fill="${glass}" stroke="rgba(255,255,255,.4)" stroke-width=".8"/><rect x="-7" y="-12" width="14" height="10" fill="#f3e9df" opacity=".8"/><path d="M-9 -20 L9 -20" stroke="rgba(255,255,255,.6)" stroke-width="1"/>
      <line x1="0" y1="-12" x2="0" y2="-15" stroke="#2a2020" stroke-width="1"/><path class="candle" d="M0 -15 C-3 -19 0 -24 0 -27 C3 -23 3 -19 0 -15 Z" fill="#ffc35a"/><ellipse cy="-19" rx="1.4" ry="2.4" fill="#fff6d8"/></g>`;
  const defs = `<defs><radialGradient id="svGlow"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".5"/><stop offset=".45" stop-color="#ffbf6a" stop-opacity=".14"/><stop offset="1" stop-color="#ffbf6a" stop-opacity="0"/></radialGradient></defs>`;
  // un bleuet (fleur de centaurée) ; s = taille
  const bleuet = (x, y, s = 1, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${Array.from({ length: 9 }, (_, i) => { const a = i * Math.PI * 2 / 9; return `<path d="M0 0 L${Math.cos(a - .22) * 6} ${Math.sin(a - .22) * 6} L${Math.cos(a - .12) * 8} ${Math.sin(a - .12) * 8} L${Math.cos(a) * 7} ${Math.sin(a) * 7} L${Math.cos(a + .12) * 8} ${Math.sin(a + .12) * 8} L${Math.cos(a + .22) * 6} ${Math.sin(a + .22) * 6} Z" fill="${i % 2 ? BLUE : "#4a78ea"}"/>`; }).join("")}<circle r="2.4" fill="#2a3a8a"/><circle r="1" fill="#6a5acd"/></g>`;
  const bleuetStem = (x0, y0, x, y, s, rot = 0) => `<path d="M${x0} ${y0} Q${(x0 + x) / 2 + 3} ${(y0 + y) / 2} ${x} ${y}" stroke="#6a8f6a" stroke-width="1.2" fill="none"/><path d="M${(x0 + x) / 2} ${(y0 + y) / 2} q-6 -2 -8 -8 M${(x0 + x) / 2 + 1} ${(y0 + y) / 2 + 6} q6 -2 8 -9" stroke="#6a8f6a" stroke-width="1" fill="none"/><ellipse cx="${x}" cy="${y + 3 * s}" rx="${2.6 * s}" ry="${3 * s}" fill="#7a9a7a"/>${bleuet(x, y, s, rot)}`;
  // le Bleuet de France en tissu (l'insigne), posé à plat
  const insigne = (x, y) => `<g transform="translate(${x} ${y}) scale(1.5)"><path d="M-2 0 L-7 12 L-3 10 L-2 14 Z M2 0 L7 12 L3 10 L2 14 Z" fill="#1f4fa8"/><path d="M0 0 L-1 12 L1 12 Z" fill="#f4f1ea"/><path d="M1 0 L3 12" stroke="#d8323c" stroke-width="2"/>${bleuet(0, -2, 1.05)}</g>`;
  // un cadre photo ancien (des silhouettes sépia, sans visage)
  const frame = (x, y, w, h, rot = 0, ribbon = false) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-3 0 L${-w / 2 + 2} ${h * .15}" stroke="#4a3220" stroke-width="2"/><rect x="${-w / 2}" y="${-h}" width="${w}" height="${h}" rx="1.5" fill="#6b4a2b"/><rect x="${-w / 2 + 3}" y="${-h + 3}" width="${w - 6}" height="${h - 6}" fill="#e9dcc0"/>
      <rect x="${-w / 2 + 5}" y="${-h + 5}" width="${w - 10}" height="${h - 10}" fill="#c9b08a"/><rect x="${-w / 2 + 5}" y="${-h * .45}" width="${w - 10}" height="${h * .45 - 5}" fill="#b39672"/>
      <ellipse cx="${-w * .12}" cy="${-h * .62}" rx="${w * .07}" ry="${h * .1}" fill="#7a5f42"/><path d="M${-w * .22} ${-5} Q${-w * .22} ${-h * .5} ${-w * .12} ${-h * .5} Q${-w * .02} ${-h * .5} ${-w * .02} ${-5} Z" fill="#7a5f42"/>
      <ellipse cx="${w * .14}" cy="${-h * .58}" rx="${w * .07}" ry="${h * .1}" fill="#86694a"/><path d="M${w * .04} ${-5} Q${w * .04} ${-h * .46} ${w * .14} ${-h * .46} Q${w * .24} ${-h * .46} ${w * .24} ${-5} Z" fill="#86694a"/>
      ${ribbon ? `<path d="M${w / 2 - 9} ${-h} L${w / 2} ${-h + 9} L${w / 2} ${-h + 4} L${w / 2 - 4} ${-h} Z" fill="#1a1a1e"/>` : ""}</g>`;
  // pot de chrysanthèmes (bouquet en dôme de petites fleurs pompons)
  const mums = (x, y, s, cols, wrap = false) => { let o = `<g transform="translate(${x} ${y}) scale(${s})">`;
    o += `<path d="M-22 0 L-26 -30 L26 -30 L22 0 Z" fill="#a85a32"/><rect x="-27" y="-34" width="54" height="7" rx="2" fill="#b8683c"/>`;
    o += Array.from({ length: 7 }, (_, i) => `<ellipse cx="${-26 + i * 9}" cy="${-36 - (i % 2) * 3}" rx="6" ry="3" fill="#3f6b44" transform="rotate(${-30 + i * 10} ${-26 + i * 9} -36)"/>`).join("");
    const pts = []; for (let r = 0; r < 4; r++) { const n = 6 - r, yy = -42 - r * 9, half = 28 - r * 6; for (let i = 0; i < n; i++) pts.push([-half + (2 * half) * (n === 1 ? .5 : i / (n - 1)) + (r % 2) * 3, yy + ((i * 7) % 5) - 2, cols[(i + r) % cols.length]]); }
    o += pts.map(([px, py, col]) => `<circle cx="${px}" cy="${py}" r="7.5" fill="${col}"/>${Array.from({ length: 8 }, (_, k) => `<path d="M${px} ${py} l${Math.cos(k * .785) * 7.5} ${Math.sin(k * .785) * 7.5}" stroke="rgba(0,0,0,.14)" stroke-width=".8"/>`).join("")}<circle cx="${px}" cy="${py}" r="2.4" fill="rgba(0,0,0,.12)"/>`).join("");
    if (wrap) o += `<path d="M-30 4 L-36 -44 Q-20 -30 -8 -40 L-2 4 Z" fill="#c9a77a" opacity=".95"/><path d="M30 4 L36 -44 Q20 -30 8 -40 L2 4 Z" fill="#b8956a" opacity=".95"/><path d="M-30 -12 Q0 -4 30 -12" stroke="#5a1f24" stroke-width="3" fill="none"/><path d="M0 -8 l-8 10 M0 -8 l8 9" stroke="#5a1f24" stroke-width="2"/>`;
    return o + `</g>`; };
  const leaf = (x, y, col, rot) => `<path transform="translate(${x} ${y}) rotate(${rot})" d="M0 0 Q-6 -6 -2 -12 L0 -9 L2 -12 Q6 -6 0 0 Z" fill="${col}"/>`;
  const windowFlag = (c) => `<rect x="984" y="300" width="3" height="98" fill="#6b4a2b"/><circle cx="985.5" cy="298" r="3" fill="#c9a26b"/><g>${c.flagSvg("FR", 987, 302, 50, 33)}</g>`;
  const css = `.sv-breathe{animation:svBreathe 3.4s ease-in-out infinite alternate}@keyframes svBreathe{from{opacity:.75}to{opacity:1}}`;

  FETES2D["toussaint"] = {
    replaces: true, css,
    greet: () => "Toussaint : des chrysanthèmes et une bougie. Une pensée pour celles et ceux qu'on aime et qui ne sont plus là.",
    wall: (c) => `<g aria-hidden="true">${defs}${mums(858, 402, .62, ["#f4f1ea", "#f2d36a", "#ece4d0"])}${lumignon(936, 401, .9)}</g>`,
    front: (c) => { let o = "";
      // sur la table : une photo d'autrefois, une bougie, quelques feuilles d'automne
      o += frame(1430, 644, 30, 38, -4) + lumignon(1472, 646, 1.2, "rgba(200,40,40,.55)");
      o += [[1500, 648, "#b8562a", 30], [1676, 646, "#d99a26", -40], [1700, 650, "#8a3a1a", 70]].map(([x, y, col, r]) => leaf(x, y, col, r)).join("");
      // le grand pot de chrysanthèmes cuivrés, emballé de papier kraft, prêt à partir au cimetière
      o += mums(1792, 704, .86, ["#c8682a", "#d9822e", "#b4501f", "#e0a040"], true);
      return `<g aria-hidden="true">${defs}${o}</g>`; },
  };
  FETES2D["victoire"] = {
    replaces: true, css,
    greet: () => "8 mai : un drapeau à la fenêtre, des bleuets et une bougie sur la cheminée. On se souvient de la paix revenue.",
    wall: (c) => `<g aria-hidden="true">${windowFlag(c)}</g>`,
    mantel: (c) => { let o = defs;
      // un petit vase de bleuets, une bougie, une photo d'autrefois
      o += `<g transform="translate(1494 318)">${[[-14, -58, 1.05, 0], [-3, -66, 1.15, 20], [9, -56, 1, 40], [16, -46, .9, 10], [-18, -44, .9, 30]].map(([x, y, s, r]) => bleuetStem(0, -24, x, y, s, r)).join("")}<path d="M-9 0 Q-13 -12 -7 -24 L7 -24 Q13 -12 9 0 Z" fill="#e8e2d4"/><path d="M-11 -10 Q0 -7 11 -10" stroke="#c9c0ae" stroke-width="1" fill="none"/></g>`;
      o += lumignon(1540, 318, 1.15, "rgba(240,235,225,.5)") + frame(1596, 318, 28, 36, 3, false);
      return `<g aria-hidden="true">${o}</g>`; },
    front: (c) => `<g aria-hidden="true">${insigne(1440, 638)}</g>`,
  };
  FETES2D["armistice"] = {
    replaces: true, css,
    greet: (c) => c.h < 11 ? "11 novembre : un bleuet et une bougie sur la cheminée. À 11 heures, on se tait une minute." : "11 novembre : un bleuet et une bougie sur la cheminée. On se souvient.",
    wall: (c) => `<g aria-hidden="true">${windowFlag(c)}</g>`,
    mantel: (c) => { let o = defs;
      o += `<g transform="translate(1508 318)">${[[-12, -56, 1, 0], [-2, -64, 1.1, 20], [10, -54, 1, 40], [-17, -42, .85, 30]].map(([x, y, s, r]) => bleuetStem(0, -22, x, y, s, r)).join("")}<path d="M-8 0 Q-12 -11 -6 -22 L6 -22 Q12 -11 8 0 Z" fill="#e8e2d4"/></g>`;
      o += lumignon(1552, 318, 1.15, "rgba(240,235,225,.5)") + frame(1604, 318, 28, 36, 3, false);
      return `<g aria-hidden="true">${o}</g>`; },
    front: (c) => { let o = "";
      // une vieille lettre et son enveloppe, et le Bleuet de France en tissu
      o += `<g transform="translate(1448 640) rotate(-6)"><rect x="-22" y="-12" width="40" height="24" fill="#e9dcc0" stroke="#c9b48a" stroke-width=".6"/>${[0, 1, 2, 3, 4].map(i => `<path d="M-18 ${-7 + i * 4} q8 -1 16 0 t14 0" stroke="#6a5a48" stroke-width=".6" fill="none" opacity=".7"/>`).join("")}</g>
        <g transform="translate(1474 646) rotate(8)"><rect x="-14" y="-8" width="28" height="16" fill="#d9c9a4"/><path d="M-14 -8 L0 2 L14 -8" stroke="#b8a27a" stroke-width=".8" fill="none"/><rect x="7" y="-6" width="5" height="6" fill="#a83a35" opacity=".8"/></g>`;
      o += insigne(1504, 640);
      return `<g aria-hidden="true">${o}</g>`; },
  };
})();
