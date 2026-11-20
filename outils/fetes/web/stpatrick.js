(() => {
  // ===== Saint-Patrick (17 mars, et fête nationale de l'Irlande) =====
  // Trèfles en papier, pièces d'or, un arc-en-ciel dessiné sur la vitre avec le pot d'or à son pied,
  // des chopes sur la table basse et le chapeau du lutin posé sur le canapé. Du vert, mais pas partout.
  const R = (k) => { let x = Math.sin(k * 57.9 + 3.7) * 43758.5453; return x - Math.floor(x); };
  const G1 = "#2f8f4a", G2 = "#4fb366", GOLD = "#e8b73a";
  const leaf = (s) => `M0 0 C${-s * .62} ${-s * .18} ${-s * .72} ${-s * .9} ${-s * .26} ${-s * .96} C${-s * .1} ${-s * .98} 0 ${-s * .86} 0 ${-s * .74} C0 ${-s * .86} ${s * .1} ${-s * .98} ${s * .26} ${-s * .96} C${s * .72} ${-s * .9} ${s * .62} ${-s * .18} 0 0 Z`;
  const clover = (x, y, s, c = G1, rot = 0, stem = true) => `<g transform="translate(${x} ${y}) rotate(${rot})">${stem ? `<path d="M0 0 Q${s * .35} ${s * .8} ${s * .15} ${s * 1.3}" stroke="${c}" stroke-width="${Math.max(1, s * .16)}" fill="none" stroke-linecap="round"/>` : ""}${[0, 120, 240].map(a => `<path d="${leaf(s * .62)}" fill="${c}" transform="rotate(${a})"/><path d="M0 0 L0 ${-s * .4}" stroke="rgba(255,255,255,.22)" stroke-width="${s * .07}" transform="rotate(${a})"/>`).join("")}</g>`;
  const coin = (x, y, r = 5, cls = "") => `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${GOLD}" stroke="#a87a1a" stroke-width=".8"/><circle r="${r * .66}" fill="none" stroke="#fff0a8" stroke-width=".7" opacity=".8"/><path class="${cls}" d="M${-r * .5} ${-r * .3} l${r * .3} ${-r * .3}" stroke="#fff" stroke-width="1" opacity=".8"/></g>`;
  const coinFlat = (x, y, r = 5) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * .4}" fill="${GOLD}" stroke="#a87a1a" stroke-width=".7"/>`;
  // une pinte de stout (noire, mousse crème) ou une chope de bière ambrée
  const pint = (x, y, stout) => `<g transform="translate(${x} ${y})"><ellipse cy="1" rx="13" ry="3.5" fill="#6b452d" stroke="#8a5d3d"/>
      ${stout ? `<path d="M-9 0 L-11 -36 Q-11 -39 -9 -40 L9 -40 Q11 -39 11 -36 L9 0 Z" fill="#1c1210"/><path d="M-10.8 -34 L-11 -40 L11 -40 L10.8 -34 Z" fill="#efe2c4"/><ellipse cy="-40" rx="11" ry="2.4" fill="#f7edd6"/><path d="M-8 -30 L-7 -4" stroke="rgba(255,255,255,.18)" stroke-width="2"/>`
      : `<rect x="-10" y="-34" width="20" height="34" rx="3" fill="rgba(226,160,40,.88)" stroke="rgba(255,255,255,.55)" stroke-width="1.4"/><path d="M10 -27 q10 0 10 9 q0 9 -10 9" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="3"/><ellipse cy="-35" rx="11" ry="4" fill="#fbf6e8"/><circle cx="-5" cy="-37" r="3.5" fill="#fbf6e8"/><circle cx="4" cy="-38" r="4" fill="#fbf6e8"/><path d="M-5 -28 L-5 -4" stroke="rgba(255,255,255,.35)" stroke-width="2"/>${[0, 1, 2].map(i => `<circle class="spk-bub" style="animation-delay:${i * .6}s" cx="${-2 + i * 3}" cy="-6" r=".9" fill="#fff6d0"/>`).join("")}`}</g>`;
  // le chapeau du lutin (haut-de-forme, ruban noir, boucle dorée, un trèfle glissé dans le ruban)
  const hat = (x, y, s = 1, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><ellipse cy="-3" rx="34" ry="8" fill="#1f6b38"/><ellipse cy="-5" rx="30" ry="5.5" fill="#2a7d45"/>
      <path d="M-21 -6 L-18 -50 Q0 -55 18 -50 L21 -6 Q0 -1 -21 -6 Z" fill="#2a7d45"/><path d="M-18 -50 Q0 -45 18 -50 Q0 -55 -18 -50 Z" fill="#1f6b38"/><path d="M-21 -6 L-18 -50" stroke="#3a9a58" stroke-width="3" opacity=".6"/>
      <path d="M-20.4 -12 L-19.6 -22 Q0 -18 19.6 -22 L20.4 -12 Q0 -8 -20.4 -12 Z" fill="#161414"/><rect x="-7" y="-23" width="14" height="13" rx="1.5" fill="none" stroke="${GOLD}" stroke-width="3"/>${clover(14, -26, 6, G2, 20)}</g>`;
  // le pot d'or (petit chaudron noir rempli de pièces qui débordent)
  const potOfGold = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="0" rx="20" ry="4" fill="rgba(0,0,0,.35)"/><path d="M-12 0 l-3 5 M12 0 l3 5" stroke="#111" stroke-width="3"/>
      ${[[-12, -26], [-6, -30], [0, -32], [6, -30], [12, -27], [-9, -33], [3, -35], [8, -33], [-3, -37]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="5" fill="${GOLD}" stroke="#a87a1a" stroke-width=".8"/>`).join("")}
      <path d="M-20 -22 Q-22 2 0 2 Q22 2 20 -22 Z" fill="#1b1a1d"/><ellipse cy="-22" rx="20" ry="5" fill="none" stroke="#2c2a2f" stroke-width="4"/><path d="M-14 -16 Q-14 -6 -6 -3" stroke="#3a383e" stroke-width="2" fill="none"/>
      <circle class="spk-glint" cx="-4" cy="-36" r="2" fill="#fff"/></g>`;
  const ga = (stpat) => stpat;
  const P = {
    replaces: true,
    css: `.spk-sway{transform-box:fill-box;transform-origin:50% 0;animation:spkSway 5s ease-in-out infinite alternate}@keyframes spkSway{from{transform:rotate(-5deg)}to{transform:rotate(5deg)}}
      .spk-glint{animation:spkGlint 3s ease-in-out infinite}@keyframes spkGlint{0%,70%,100%{opacity:0}80%{opacity:1}}
      .spk-bub{animation:spkBub 1.8s linear infinite}@keyframes spkBub{from{transform:translateY(0);opacity:1}to{transform:translateY(-24px);opacity:0}}`,
    greet: (c) => c.id === "nat:IE" ? "Fête nationale de l'Irlande, joyeuse Saint-Patrick ! Un arc-en-ciel sur la vitre… et à son pied, le pot d'or d'un lutin."
      : "Joyeuse Saint-Patrick ! Un arc-en-ciel est dessiné sur la vitre… et à son pied, un lutin a oublié son pot d'or.",
    wall: (c) => { let o = "";
      // guirlande de trèfles en papier et de pièces d'or, en festons sous le plafond
      for (let x0 = 300; x0 < 2300; x0 += 200) {
        o += `<path d="M${x0} 60 Q${x0 + 100} 94 ${x0 + 200} 60" stroke="#d8cfa8" stroke-width="1.5" fill="none"/>`;
        for (let k = 1; k < 6; k++) { const t = k / 6, x = x0 + 200 * t, y = 60 + 4 * 34 * t * (1 - t) / 2 + 1;
          o += `<g class="spk-sway" style="animation-delay:${(-R(x) * 5).toFixed(2)}s"><line x1="${x}" y1="${y}" x2="${x}" y2="${y + (k % 2 ? 10 : 6)}" stroke="#d8cfa8"/>${k % 2 ? clover(x, y + 20, 9, k === 3 ? G1 : G2, 0, false) : coin(x, y + 12, 5.5, "spk-glint")}</g>`; }
        o += `<g transform="translate(${x0} 60)"><path d="M0 0 l-9 -5 l0 10 Z M0 0 l9 -5 l0 10 Z" fill="#f2f0e8"/><path d="M0 0 l-4 11 M0 0 l4 11" stroke="#f08a3a" stroke-width="2.4"/><circle r="2.6" fill="#f08a3a"/></g>`;
      }
      // le pot d'or, posé sur le rebord de la fenêtre, au pied de l'arc-en-ciel dessiné sur la vitre
      o += potOfGold(978, 402, 1) + coinFlat(956, 402, 4) + coinFlat(948, 401, 3.5);
      return `<g aria-hidden="true">${o}</g>`; },
    window: (c) => {
      // l'arc-en-ciel peint au feutre à vitre (un peu baveux), avec deux nuages
      const cols = ["#e8453c", "#f28c28", "#f6d33c", "#4cb050", "#3a8fd8", "#8a5cc0"], cx = 906, cy = 394, op = c.per === "night" ? .55 : .82;
      let o = cols.map((col, i) => { const r = 72 - i * 6.2; return `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="${col}" stroke-width="6.6" fill="none" stroke-linecap="round" opacity="${op}"/>`; }).join("");
      o += Array.from({ length: 14 }, (_, i) => { const a = Math.PI * (.08 + i * .062), r = 72 - (i % 6) * 6.2; return `<path d="M${cx - Math.cos(a) * (r - 2)} ${cy - Math.sin(a) * (r - 2)} l${Math.sin(a) * 3} ${-Math.cos(a) * 3}" stroke="#fff" stroke-width="1" opacity=".35"/>`; }).join("");
      o += `<g opacity="${op}"><circle cx="832" cy="384" r="12" fill="#fbfbf7"/><circle cx="846" cy="378" r="14" fill="#fbfbf7"/><circle cx="860" cy="386" r="10" fill="#fbfbf7"/><path d="M820 392 h52" stroke="#fbfbf7" stroke-width="8" stroke-linecap="round"/></g>`;
      return `<g aria-hidden="true">${o}</g>`; },
    mantel: (c) => { let o = "";
      // guirlande de petits trèfles le long du bord de la cheminée
      o += `<path d="M1424 334 Q1490 352 1562 338 T1702 334" stroke="#2a5a36" stroke-width="2" fill="none"/>` + Array.from({ length: 12 }, (_, i) => { const x = 1434 + i * 23.5, t = (x - 1424) / 278, y = 334 + (t < .5 ? 18 * 4 * t * (.5 - t) : 6 * Math.sin((t - .5) * Math.PI * 2)) + 4; return i % 3 === 1 ? coin(x, y + 4, 4) : clover(x, y + 6, 6.5, i % 2 ? G1 : G2, (i % 2 ? 1 : -1) * 12, false); }).join("");
      // un pot de vrais trèfles, avec un petit drapeau irlandais piqué dedans
      o += `<g transform="translate(1478 318)"><path d="M-14 0 L-16 -20 L16 -20 L14 0 Z" fill="#b8643a"/><rect x="-17" y="-24" width="34" height="6" rx="2" fill="#c97448"/>
        <line x1="10" y1="-24" x2="10" y2="-64" stroke="#6b4a2b" stroke-width="1.6"/>${c.flagSvg("IE", 10.5, -64, 24, 15)}
        ${[[-12, -30, 6], [-4, -36, 7], [5, -31, 6], [-9, -40, 5.5], [2, -44, 6], [11, -37, 5], [-14, -24, 5], [13, -26, 5]].map(([x, y, s], i) => `<path d="M${x * .4} -22 L${x} ${y}" stroke="#3f7d4f" stroke-width="1.2"/>${clover(x, y, s, i % 2 ? G1 : "#3a9a55", i * 30, false)}`).join("")}</g>`;
      // une petite harpe dorée (le symbole de l'Irlande) et une pile de pièces
      o += `<g transform="translate(1528 318)"><rect x="-10" y="-3" width="20" height="3" rx="1" fill="#6b452d"/><path d="M-8 -3 L-8 -36 Q2 -40 8 -26 Q10 -14 8 -3 Z" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linejoin="round"/>${[-5, -2, 1, 4].map((x, i) => `<line x1="${x}" y1="-3" x2="${x}" y2="${-34 + i * 3}" stroke="#f6e7b0" stroke-width=".7"/>`).join("")}<circle cx="-8" cy="-37" r="2" fill="${GOLD}"/></g>`;
      o += `<g transform="translate(1594 318)">${[0, 1, 2, 3, 4].map(i => coinFlat(0, -2 - i * 2.6, 6)).join("")}${coin(14, -5, 5)}</g>`;
      return `<g aria-hidden="true">${o}</g>`; },
    front: (c) => { let o = "";
      // sur la table basse : une pinte de stout et une chope de bière sur leurs sous-verres, un bol de pièces en chocolat, un sifflet en fer-blanc
      o += pint(1424, 640, true) + pint(1458, 646, false);
      o += `<g transform="translate(1690 640)"><path d="M-20 -10 Q0 8 20 -10 Z" fill="#f4f1ea"/><path d="M-20 -10 h40" stroke="#d9d2c4" stroke-width="2"/>${[[-12, -12], [-4, -14], [4, -13], [12, -11], [-8, -17], [2, -18], [9, -16]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.6" fill="${GOLD}" stroke="#a87a1a" stroke-width=".7"/><circle cx="${x}" cy="${y}" r="2.8" fill="none" stroke="#fff0a8" stroke-width=".6"/>`).join("")}</g>`;
      o += `<g transform="translate(1640 648) rotate(-8)"><rect x="-26" y="-2.4" width="40" height="4.8" rx="2" fill="#c9ccd2"/><rect x="-26" y="-2.4" width="10" height="4.8" rx="2" fill="#2f8f4a"/>${[0, 1, 2, 3, 4].map(i => `<circle cx="${-6 + i * 4}" r="1" fill="#55585e"/>`).join("")}</g>`;
      // le chapeau du lutin, posé sur le dossier du canapé
      o += hat(1016, 584, .95, -8);
      // le petit drapeau piqué dans la plante, à côté de la cheminée
      o += `<g transform="translate(1762 566)"><line x1="0" y1="0" x2="0" y2="-58" stroke="#6b4a2b" stroke-width="1.8"/>${c.flagSvg("IE", .8, -58, 30, 19)}</g>`;
      // le lutin est passé : des pièces sous la fenêtre, et quelques trèfles en confettis sur le tapis
      o += [[812, 612], [836, 607], [860, 614], [884, 609], [906, 618]].map(([x, y], i) => coinFlat(x, y, 4.2 - i * .3)).join("");
      o += Array.from({ length: 7 }, (_, i) => clover(1440 + R(i) * 360, 676 + R(i + 9) * 30, 5, i % 2 ? G1 : G2, R(i + 3) * 360, false)).join("");
      return `<g aria-hidden="true">${o}</g>`; },
  };
  FETES2D["stpatrick"] = P;
  FETES2D["nat:IE"] = P;
})();
