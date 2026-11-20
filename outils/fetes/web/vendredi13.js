(() => {
  /* ===== Vendredi 13 : les superstitions, sans rien d'effrayant. Le matin l'échelle et le fer à cheval, à midi le miroir fendu et le sel renversé,
     le soir le parapluie ouvert et la grille de loto. Et le chat noir, bien sûr. ===== */
  const R = (k) => { const x = Math.sin(k * 17.17 + 3.3) * 43758.5453; return x - Math.floor(x); };
  const stage = (c) => c.h < 12 ? "matin" : c.h < 19 ? "jour" : "soir";
  const catAt = () => { try { const L = lifeDay(); return L.cat === "sofa" ? [1140, 566] : L.cat === "rug" ? [1790, 704] : null; } catch (_) { return null; } };
  const names = (c) => (c.profiles || []).filter(Boolean).map(String);

  const ladder = (x0, y0, x1, y1) => { // échelle appuyée contre le mur (du pied x0,y0 au sommet x1,y1)
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len * 15, ny = dx / len * 15; let o = "";
    o += `<path d="M${x0 - nx} ${y0 - ny} L${x1 - nx} ${y1 - ny}" stroke="#a8743a" stroke-width="6" stroke-linecap="round"/><path d="M${x0 + nx} ${y0 + ny} L${x1 + nx} ${y1 + ny}" stroke="#b8844a" stroke-width="6" stroke-linecap="round"/>`;
    for (let k = 1; k < 11; k++) { const t = k / 11, x = x0 + dx * t, y = y0 + dy * t; o += `<path d="M${(x - nx).toFixed(1)} ${(y - ny).toFixed(1)} L${(x + nx).toFixed(1)} ${(y + ny).toFixed(1)}" stroke="#946a32" stroke-width="3.6"/>`; }
    return o; };
  const horseshoe = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-14 8 L-14 -2 A14 14 0 0 1 14 -2 L14 8" stroke="#8a8f9a" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M-14 8 L-14 -2 A14 14 0 0 1 14 -2 L14 8" stroke="#b9bdc8" stroke-width="2.4" fill="none" stroke-dasharray="3 5"/>${[[-14, 4], [-12, -8], [-4, -14], [4, -14], [12, -8], [14, 4]].map(([a, b]) => `<circle cx="${a}" cy="${b}" r="1.2" fill="#4a4e58"/>`).join("")}<path d="M0 -20 v6" stroke="#6a5a4a" stroke-width="2"/></g>`;
  const clover = (x, y, s, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${[0, 90, 180, 270].map(a => `<path d="M0 0 C-6 -4 -7 -12 -2 -12 C0 -12 0 -9 0 -9 C0 -9 0 -12 2 -12 C7 -12 6 -4 0 0 Z" fill="#2fa84f" transform="rotate(${a})"/>`).join("")}<path d="M0 0 q3 8 1 14" stroke="#2a8a42" stroke-width="1.6" fill="none"/><circle r="1.4" fill="#1f7a38"/></g>`;
  const mirror = (x, y, cracked) => { // miroir ovale encadré ; fendu à partir de midi
    let o = `<g transform="translate(${x} ${y})"><ellipse rx="30" ry="40" fill="#b8902c"/><ellipse rx="26" ry="36" fill="#cfd8e2"/><ellipse rx="26" ry="36" fill="url(#v13Glass)"/><path d="M-16 -22 L-6 -30 M-18 -12 L-2 -26" stroke="rgba(255,255,255,.6)" stroke-width="2"/>`;
    if (cracked) { const cx = 7, cy = 6; for (let k = 0; k < 9; k++) { const a = k * .7 + .3, r1 = 18 + R(k) * 18; o += `<path d="M${cx} ${cy} L${(cx + Math.cos(a) * r1 * .45 + R(k + 3) * 4).toFixed(1)} ${(cy + Math.sin(a) * r1 * .45).toFixed(1)} L${(cx + Math.cos(a + .08) * r1).toFixed(1)} ${(cy + Math.sin(a + .08) * r1).toFixed(1)}" stroke="#5a6470" stroke-width=".9" fill="none"/>`; }
      o += `<path d="M${cx - 5} ${cy + 9} L${cx + 6} ${cy + 16} L${cx - 3} ${cy + 22} Z" fill="#7a8490"/><circle cx="${cx}" cy="${cy}" r="2" fill="#e8eef4"/>`; }
    o += `<circle cy="-42" r="2.4" fill="#8a6a2a"/><path d="M0 -42 L-14 -36 M0 -42 L14 -36" stroke="#8a7a5a" stroke-width=".8"/></g>`;
    return o; };
  const blackCat = (x, y) => `<g transform="translate(${x} ${y})"><path d="M10 0 Q34 2 30 -16 Q28 -24 22 -20" stroke="#121214" stroke-width="5" fill="none" stroke-linecap="round" class="v13-tail"/><path d="M-12 0 Q-15 -20 -8 -30 Q0 -36 8 -30 Q15 -20 12 0 Z" fill="#121214"/><circle cy="-38" r="10" fill="#121214"/><path d="M-9 -43 l2 -11 l6 6 Z M9 -43 l-2 -11 l-6 6 Z" fill="#121214"/><path d="M-7.5 -45 l1.4 -5 l2.6 3 Z M7.5 -45 l-1.4 -5 l-2.6 3 Z" fill="#3a2a30"/><g class="v13-blink"><ellipse cx="-4" cy="-39" rx="2.6" ry="2.2" fill="#ffd84a"/><ellipse cx="4" cy="-39" rx="2.6" ry="2.2" fill="#ffd84a"/><ellipse cx="-4" cy="-39" rx=".8" ry="1.9" fill="#1a1a10"/><ellipse cx="4" cy="-39" rx=".8" ry="1.9" fill="#1a1a10"/></g><path d="M-1.4 -35 h2.8 l-1.4 1.6 Z" fill="#3a2a30"/><path d="M-3 -33 l-10 -1 M-3 -32 l-10 2 M3 -33 l10 -1 M3 -32 l10 2" stroke="#4a4a52" stroke-width=".5"/><path d="M-8 -1 q2 -4 5 0 M3 -1 q2 -4 5 0" stroke="#2a2a30" stroke-width="1.2" fill="none"/></g>`;
  const umbrella = (x, y) => `<g transform="translate(${x} ${y}) rotate(-24)"><path d="M-40 -6 Q-38 -40 0 -44 Q38 -40 40 -6 Q30 -12 20 -6 Q10 -12 0 -6 Q-10 -12 -20 -6 Q-30 -12 -40 -6 Z" fill="#3a6ac8"/><path d="M-20 -6 Q-14 -36 0 -44 Q14 -36 20 -6" stroke="#2a4a98" stroke-width="1.2" fill="none"/><path d="M0 -44 L0 -50" stroke="#3a3a42" stroke-width="2"/><path d="M0 -6 L0 26 q0 8 -7 8 q-6 0 -6 -6" stroke="#3a3a42" stroke-width="2.6" fill="none"/></g>`;

  FETES2D["vendredi13"] = {
    replaces: true,
    css: `
      .salon:has(.v13-on) g[transform="translate(922 628)"] { display: none; }
      .v13-blink { animation: v13Blink 6s infinite; transform-box: fill-box; transform-origin: center; }
      @keyframes v13Blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
      .v13-tail { animation: v13Tail 3s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: 0% 100%; }
      @keyframes v13Tail { from { transform: rotate(-6deg); } to { transform: rotate(8deg); } }
      .v13-swing { transform-box: fill-box; transform-origin: 50% 0; animation: v13Swing 4s ease-in-out infinite alternate; }
      @keyframes v13Swing { from { transform: rotate(-3deg); } to { transform: rotate(3deg); } }
      .salon.still .v13-blink, .salon.still .v13-tail, .salon.still .v13-swing { animation: none; }`,
    greet: (c) => {
      const st = stage(c);
      if (st === "matin") return "Vendredi 13 ! Une échelle contre le mur, un fer à cheval au-dessus de l'horloge… et le chat noir te regarde. Touche du bois.";
      if (st === "jour") return "Vendredi 13 : le miroir s'est fendu et la salière s'est renversée… Pas de panique : le fer à cheval veille, et il y a un trèfle à quatre feuilles sur la cheminée.";
      return "Vendredi 13, le soir : quelqu'un a ouvert un parapluie dans le salon, et la grille de loto attend le tirage. Et si c'était ton jour de chance ?";
    },
    wall: (c) => {
      const st = stage(c);
      let o = `<g class="v13-on"></g><defs><linearGradient id="v13Glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef3f8" stop-opacity=".9"/><stop offset=".5" stop-color="#a9b8c8" stop-opacity=".5"/><stop offset="1" stop-color="#6a7a8a" stop-opacity=".7"/></linearGradient></defs>`;
      // le miroir ovale, au mur entre la cheminée et la bibliothèque (fendu à partir de midi), et son pense-bête
      if (c.season !== "Noël") o += mirror(1760, 176, st !== "matin") + (st !== "matin" ? `<g transform="translate(1800 214) rotate(8)"><rect x="-15" y="-13" width="30" height="26" fill="#ffe873"/><text y="-4" text-anchor="middle" font-size="5.2" fill="#5a4a1a">7 ans de</text><text y="3" text-anchor="middle" font-size="5.2" fill="#5a4a1a">malheur ?!</text><text y="10" text-anchor="middle" font-size="4.4" fill="#8a3a2a">(non.)</text></g>` : "");
      return o;
    },
    mantel: (c) => {
      const st = stage(c), cat = catAt();
      let o = "";
      // le fer à cheval, pointes en haut pour garder la chance, accroché au-dessus de l'horloge
      o += `<g class="v13-swing">${horseshoe(1562, 176, .95)}</g>`;
      // le trèfle à quatre feuilles sous une petite cloche en verre, sur la cheminée
      o += `<g transform="translate(1500 318)"><rect x="-12" y="-4" width="24" height="4" rx="1.2" fill="#6b452d"/>${clover(0, -14, .7)}<path d="M-10 -4 L-10 -22 Q-10 -32 0 -32 Q10 -32 10 -22 L10 -4" fill="rgba(210,235,250,.25)" stroke="rgba(230,245,255,.75)" stroke-width="1"/><circle cy="-34" r="1.6" fill="rgba(230,245,255,.9)"/></g>`;
      // le « 13 » entouré au feutre rouge sur l'éphéméride
      if (c.season !== "Noël") o += `<ellipse cx="1762" cy="404" rx="20" ry="16" fill="none" stroke="#d8262e" stroke-width="2.2" stroke-dasharray="70 6" transform="rotate(-8 1762 404)"/>`;
      // le chat noir, assis sur le meuble télé, qui fixe le salon (s'il ne dort pas déjà ailleurs)
      if (!cat) o += blackCat(1396, 499);
      return o;
    },
    front: (c) => {
      const st = stage(c), cat = catAt(), n = names(c);
      let o = "";
      // l'échelle appuyée au mur près de la fenêtre, avec sa pancarte
      o += `<g>${ladder(880, 716, 812, 300)}<g transform="translate(846 474) rotate(-6)"><path d="M-4 -26 L0 -34 L4 -26" stroke="#6a5a4a" stroke-width="1" fill="none"/><rect x="-26" y="-26" width="52" height="22" rx="2" fill="#fbf2c8" stroke="#c9a24a"/><text y="-17" text-anchor="middle" font-size="6.4" font-weight="800" fill="#8a3a2a">NE PASSE PAS</text><text y="-9" text-anchor="middle" font-size="6.4" font-weight="800" fill="#8a3a2a">DESSOUS !</text></g></g>`;
      // sur la table basse : la salière renversée (à partir de midi), la grille de loto et un dé
      if (st !== "matin") o += `<g transform="translate(1500 640)"><g transform="rotate(84)"><path d="M-6 0 L-6 -18 Q0 -24 6 -18 L6 0 Z" fill="rgba(235,240,248,.9)" stroke="#fff" stroke-width=".7"/><path d="M-6 -18 Q0 -24 6 -18 L5 -22 Q0 -27 -5 -22 Z" fill="#c9ccd6"/><text y="-8" text-anchor="middle" font-size="5" font-weight="800" fill="#4a5a7a">S</text></g>${Array.from({ length: 40 }, (_, i) => `<circle cx="${(18 + R(i) * 34).toFixed(1)}" cy="${(-1 - R(i + 9) * 7).toFixed(1)}" r=".75" fill="#fbfbf8"/>`).join("")}</g>`;
      o += `<g transform="translate(1612 636) rotate(-5)"><rect x="-24" y="-13" width="48" height="26" rx="1.2" fill="#fbfbf3" stroke="#d84a3a" stroke-width=".8"/><rect x="-24" y="-13" width="48" height="6" fill="#d84a3a"/><text y="-8.6" text-anchor="middle" font-size="4.6" font-weight="800" fill="#fff">LOTO · VENDREDI 13</text>${Array.from({ length: 21 }, (_, i) => { const cx = -20 + (i % 7) * 6.6, cy = -2 + Math.floor(i / 7) * 5.4, num = i + 7, on = [13, 7, 21, 4 + c.day % 10, 26].includes(num); return `<text x="${cx}" y="${cy + 1.6}" text-anchor="middle" font-size="3.6" fill="#8a4a3a">${num}</text>${on ? `<path d="M${cx - 2.4} ${cy - 1.6} L${cx + 2.4} ${cy + 2.4} M${cx + 2.4} ${cy - 1.6} L${cx - 2.4} ${cy + 2.4}" stroke="#2a4ac8" stroke-width=".9"/>` : ""}`; }).join("")}</g>`;
      o += `<g transform="translate(1676 640) rotate(12)"><rect x="-6" y="-6" width="12" height="12" rx="2" fill="#f4f1ea" stroke="#c9c3b8" stroke-width=".6"/>${[[-3, -3], [3, -3], [0, 0], [-3, 3], [3, 3]].map(([a, b]) => `<circle cx="${a}" cy="${b}" r="1.1" fill="#2a2a2a"/>`).join("")}</g>`;
      // le soir : un petit mot « on croise les doigts »
      if (st === "soir") o += `<g transform="translate(1448 640) rotate(-8)"><rect x="-22" y="-9" width="44" height="18" rx="1.2" fill="#fbf8f0" stroke="#d8d0c0" stroke-width=".5"/><text y="-1" text-anchor="middle" font-size="4.6" font-style="italic" fill="#3a5a8a">On croise</text><text y="5" text-anchor="middle" font-size="4.6" font-style="italic" fill="#3a5a8a">les doigts ${n.length ? "— " + c.esc(n[0].slice(0, 6)) : "!"}</text></g>`;
      // le soir : un parapluie ouvert posé au sol, au pied de la bibliothèque des vidéos
      if (st === "soir") o += umbrella(600, 684);
      // le chat de la maison est bien réveillé aujourd'hui : il ouvre ses yeux jaunes
      if (cat) o += `<g class="v13-blink"><ellipse cx="${cat[0] + 21}" cy="${cat[1] - 6}" rx="2.2" ry="1.9" fill="#ffd84a"/><ellipse cx="${cat[0] + 28}" cy="${cat[1] - 6}" rx="2.2" ry="1.9" fill="#ffd84a"/><ellipse cx="${cat[0] + 21}" cy="${cat[1] - 6}" rx=".6" ry="1.6" fill="#111"/><ellipse cx="${cat[0] + 28}" cy="${cat[1] - 6}" rx=".6" ry="1.6" fill="#111"/></g>`;
      return o;
    },
  };
})();
