(() => {
  /* ===== Galette des rois (2 → 15 janvier) : entière, puis partagée le 6, la fève trouvée, la couronne sur le chat, la dernière part ===== */
  const R = (k) => { const x = Math.sin(k * 61.37 + 4.123) * 43758.5453; return x - Math.floor(x); };
  const stage = (c) => c.day <= 5 ? "entiere" : c.day === 6 ? "partage" : c.day <= 10 ? "entamee" : "fin";
  const GOLD = "#f2c64e", GOLD2 = "#c99a2a";
  const catAt = () => { try { const L = lifeDay(); return L.cat === "sofa" ? [1140, 566] : L.cat === "rug" ? [1790, 704] : null; } catch (_) { return null; } };
  const king = (c) => { const n = (c.profiles || []).filter(Boolean); return n.length ? String(n[(c.y + 7) % n.length]) : ""; };

  // couronne en carton doré (x, y = milieu de la base)
  const crown = (x, y, s = 1, rot = 0, crumpled = false) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M-17 0 L-18 -17 L-11 -9 L-5.5 -20 L0 -10 L5.5 -20 L11 -9 L18 -17 L17 0 Q0 4 -17 0 Z" fill="${GOLD}" stroke="${GOLD2}" stroke-width="1"/><path d="M-16 -4 Q0 0 16 -4" stroke="${GOLD2}" stroke-width="1.2" fill="none"/>${[[-18, -17, "#d83a4a"], [-5.5, -20, "#3a7ad8"], [5.5, -20, "#d83a4a"], [18, -17, "#3a7ad8"]].map(([a, b, col]) => `<circle cx="${a}" cy="${b}" r="1.9" fill="${col}"/>`).join("")}<circle cx="0" cy="-5" r="2.4" fill="#e04a5a"/><path d="M-12 -6 l3 -3 M8 -7 l3 -3" stroke="#fff6c8" stroke-width="1" opacity=".8"/>${crumpled ? `<path d="M-6 -12 l3 6 M7 -13 l-2 7" stroke="${GOLD2}" stroke-width="1"/>` : ""}</g>`;
  // la galette vue de biais : 6 parts, certaines déjà mangées
  const galette = (cx, cy, r, gone) => {
    const k = .3, th = 8, P = (a, rr = r, dy = 0) => [(cx + Math.cos(a) * rr).toFixed(1), (cy + Math.sin(a) * rr * k + dy).toFixed(1)];
    const present = [0, 1, 2, 3, 4, 5].filter(i => !gone.includes(i)), A = (i) => i * Math.PI / 3;
    let sides = "", faces = "", tops = "", lines = "";
    for (const i of present) {
      const a0 = A(i), a1 = A(i + 1);
      // tranche dorée sur le devant
      const s0 = Math.max(a0, 0), s1 = Math.min(a1, Math.PI);
      if (s1 > s0) { let d = `M${P(s0).join(" ")}`; for (let t = 0; t <= 8; t++) d += ` L${P(s0 + (s1 - s0) * t / 8).join(" ")}`; for (let t = 8; t >= 0; t--) d += ` L${P(s0 + (s1 - s0) * t / 8, r, th).join(" ")}`; sides += `<path d="${d} Z" fill="#b8742a"/>`; }
      // faces coupées (frangipane) quand la part voisine n'est plus là
      for (const [a, nb] of [[a0, (i + 5) % 6], [a1, (i + 1) % 6]]) if (gone.includes(nb) && Math.sin(a) > -0.2 || (gone.includes(nb) && present.length < 6)) {
        faces += `<path d="M${cx} ${cy} L${P(a).join(" ")} L${P(a, r, th).join(" ")} L${cx} ${cy + th} Z" fill="#f0d08a"/><path d="M${cx} ${cy + 2.5} L${P(a, r, 2.5).join(" ")} M${cx} ${cy + 5.2} L${P(a, r, 5.2).join(" ")}" stroke="#d9a54e" stroke-width=".9"/>`;
      }
      let d = `M${cx} ${cy}`; for (let t = 0; t <= 10; t++) d += ` L${P(a0 + (a1 - a0) * t / 10).join(" ")}`;
      tops += `<path d="${d} Z" fill="#dc9a3c"/>`;
      // rosace dessinée au couteau
      for (let j = 0; j < 3; j++) { const a = a0 + (j + .5) * (a1 - a0) / 3; lines += `<path d="M${P(a, r * .12).join(" ")} Q${P(a + .35, r * .55).join(" ")} ${P(a + .25, r * .92).join(" ")}" stroke="#b9772a" stroke-width="1.3" fill="none"/>`; }
      tops += `<path d="M${P(a0 + .15, r * .7).join(" ")} Q${P((a0 + a1) / 2, r * .78).join(" ")} ${P(a1 - .15, r * .7).join(" ")}" stroke="#f3c26a" stroke-width="2" fill="none" opacity=".6"/>`;
      if (gone.length) tops += `<path d="M${cx} ${cy} L${P(a0).join(" ")}" stroke="#a8682a" stroke-width=".8"/>`;
    }
    return sides + faces + tops + lines + (present.length ? `<circle cx="${cx}" cy="${cy}" r="1.6" fill="#b9772a"/>` : "");
  };
  const plate = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y + 2}" rx="${rx}" ry="${ry}" fill="rgba(0,0,0,.18)"/><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#f4f1ea"/><ellipse cx="${x}" cy="${y}" rx="${rx * .78}" ry="${ry * .72}" fill="#e9e3d6"/>`;
  const slice = (x, y, rot = 0, bitten = false) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-12 2 L10 -3 L10 3 L-12 6 Z" fill="#f0d08a"/><path d="M-12 2 L10 -3 Q14 -1 10 3 Z" fill="#dc9a3c"/><path d="M-12 2 L10 -3 L-6 -5 Z" fill="#dc9a3c"/>${bitten ? `<circle cx="10" cy="0" r="3.4" fill="#e9e3d6"/>` : ""}<path d="M-6 -3 q6 -1 12 -1.5" stroke="#b9772a" stroke-width=".8" fill="none"/></g>`;
  const crumbs = (x, y, n, w, seed) => Array.from({ length: n }, (_, i) => `<circle cx="${(x + (R(i + seed) - .5) * w).toFixed(1)}" cy="${(y + (R(i + seed + 9) - .5) * 6).toFixed(1)}" r="${(.7 + R(i + seed + 3)).toFixed(1)}" fill="${i % 3 ? "#d9a54e" : "#f0d08a"}"/>`).join("");
  const cider = (x, y, lvl) => `<g transform="translate(${x} ${y})"><path d="M-7 0 L-7 -34 Q-7 -42 -3 -45 L-3 -56 L3 -56 L3 -45 Q7 -42 7 -34 L7 0 Z" fill="${lvl > 0 ? "#6a8a2a" : "#4a6420"}" opacity=".9"/>${lvl > 0 ? `<path d="M-6 -1 L-6 ${-1 - 30 * lvl} L6 ${-1 - 30 * lvl} L6 -1 Z" fill="#e0a93a" opacity=".55"/>` : ""}<rect x="-7" y="-26" width="14" height="13" fill="#f3ead2"/><text y="-17" text-anchor="middle" font-size="4.6" font-weight="800" fill="#7a3a1a">CIDRE</text><rect x="-3.4" y="-58" width="6.8" height="5" fill="#c43a2a"/></g>`;
  const bowl = (x, y, lvl) => `<g transform="translate(${x} ${y})"><path d="M-8 -12 Q-8 0 0 0 Q8 0 8 -12 Z" fill="#e8dcc4"/><ellipse cy="-12" rx="8" ry="2.4" fill="${lvl ? "#e0a93a" : "#cfc2a6"}"/><path d="M-8 -9 Q0 -6 8 -9" stroke="#3a6ac8" stroke-width="1.2" fill="none"/></g>`;
  const feve = (x, y) => `<g transform="translate(${x} ${y})"><ellipse rx="9" ry="2.6" fill="#f4f1ea" stroke="#d8d0c0" stroke-width=".6"/><g transform="translate(0 -3.5)"><circle r="3.4" fill="#fbfaf6" stroke="#c9b48a" stroke-width=".5"/>${[0, 1, 2, 3, 4, 5, 6, 7].map(k => `<path d="M${(Math.cos(k * .785) * 3.6).toFixed(1)} ${(Math.sin(k * .785) * 3.6).toFixed(1)} L${(Math.cos(k * .785) * 5.4).toFixed(1)} ${(Math.sin(k * .785) * 5.4).toFixed(1)}" stroke="${GOLD}" stroke-width="1.3"/>`).join("")}<circle cx="-1" cy="-.6" r=".55" fill="#3a6ac8"/><circle cx="1.2" cy="-.6" r=".55" fill="#3a6ac8"/><path d="M-1.3 1 q1.3 1 2.6 0" stroke="#c43a2a" stroke-width=".5" fill="none"/></g></g>`;
  const sleepingCat = (x, y) => `<g transform="translate(${x} ${y})"><ellipse rx="30" ry="13" fill="#29272b"/><circle cx="24" cy="-4" r="10" fill="#29272b"/><path d="M18 -12 l3 -8 l4 7 Z M27 -12 l4 -7 l2 8 Z" fill="#29272b"/><path d="M-28 4 q-14 2 -10 -10" stroke="#29272b" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M20 -4 q2 1.5 4 0 M27 -4 q2 1.5 4 0" stroke="#6a6670" stroke-width="1" fill="none"/></g>`;
  // les trois Rois mages, qui avancent vers la crèche jusqu'au 6 janvier
  const mage = (x, y, robe, skin, gift) => `<g transform="translate(${x} ${y})"><path d="M-4.5 0 L-3 -15 L3 -15 L4.5 0 Z" fill="${robe}"/><path d="M-3 -15 L-4 -9 M3 -15 L4 -9" stroke="rgba(0,0,0,.25)" stroke-width="1"/><circle cy="-18" r="3" fill="${skin}"/><path d="M-3 -20.5 L-3 -24 L-1.5 -22 L0 -24.5 L1.5 -22 L3 -24 L3 -20.5 Z" fill="${GOLD}"/><rect x="2.5" y="-11" width="4" height="3.4" rx=".6" fill="${gift}"/></g>`;

  FETES2D["galette"] = {
    replaces: true,
    css: `
      .salon:has(.gl-on) g[transform="translate(922 628)"], .salon:has(.gl-on) g[transform="translate(1690 614)"] { display: none; }
      .gl-shine { animation: glShine 3s ease-in-out infinite; }
      @keyframes glShine { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }
      .gl-steam { animation: glSteam 4s ease-in-out infinite; opacity: 0; }
      @keyframes glSteam { 0% { transform: translateY(4px); opacity: 0; } 40% { opacity: .5; } 100% { transform: translateY(-14px); opacity: 0; } }
      .salon.still .gl-shine, .salon.still .gl-steam { animation: none; }`,
    greet: (c) => {
      const st = stage(c), k = king(c);
      if (st === "entiere") return "Une galette des rois attend sur la table, entière et toute dorée. On la partage le 6… et le plus jeune ira sous la table.";
      if (st === "partage") return "C'est l'Épiphanie ! La galette est entamée, les Rois mages sont arrivés à la crèche… qui aura la fève ?";
      if (st === "entamee") return k ? `${k} a eu la fève ! La couronne, elle, a fini sur la tête du chat.` : "La fève est trouvée ! La couronne, elle, a fini sur la tête du chat.";
      return "Il reste une dernière part de galette… et le chat refuse toujours de rendre la couronne.";
    },
    wall: (c) => {
      const st = stage(c);
      let o = `<g class="gl-on"></g>`;
      // après Noël, une frise de couronnes dorées en papier le long du haut des murs
      if (c.season !== "Noël") {
        const x0 = 1060, x1 = 1880, y0 = 54; let g = `<path d="M${x0} ${y0} Q${(x0 + x1) / 2} ${y0 + 40} ${x1} ${y0}" stroke="#c9b48a" stroke-width="1.4" fill="none"/>`;
        for (let i = 0; i < 12; i++) { const t = (i + .5) / 12, x = x0 + (x1 - x0) * t, y = y0 + 40 * 2 * t * (1 - t) + 2; g += crown(x, y + 18, .9, Math.sin(i * 1.7) * 4); }
        o += `<g>${g}</g>`;
      }
      return o;
    },
    mantel: (c) => {
      const st = stage(c);
      let o = "";
      // la boîte de la boulangerie, ouverte, sur le meuble télé
      o += `<g transform="translate(1384 499)"><path d="M-24 0 L-24 -14 L24 -14 L24 0 Z" fill="#f4ecdc"/><path d="M-24 -14 L-18 -30 L30 -30 L24 -14 Z" fill="#efe4cf"/><path d="M-24 -14 L-18 -30" stroke="#d8c8a8"/><path d="M-24 -7 L24 -7" stroke="#c43a4a" stroke-width="2"/><text y="-2.4" text-anchor="middle" font-size="5" font-weight="700" fill="#8a5a2a" letter-spacing=".5">BOULANGERIE</text><text x="6" y="-20" text-anchor="middle" font-size="4.4" fill="#b8902c" transform="skewX(-20)">♛ Galette</text></g>`;
      // pendant Noël : les Rois mages s'approchent un peu plus chaque jour de la crèche
      if (c.season === "Noël" && c.day <= 6) {
        const x = 1452 + Math.min(4, c.day - 2) * 12;
        o += mage(x, 318, "#6a3a8a", "#f2d2b6", GOLD) + mage(x + 10, 318, "#2a6a5a", "#a87a52", "#c9c9d6") + mage(x + 20, 318, "#a8323a", "#6b4a32", "#c98a3a");
      } else {
        // après Noël : deux couronnes de rechange posées sur la cheminée (une seule à la fin)
        o += crown(1482, 318, .8, -4) + (st === "entiere" || st === "partage" ? crown(1510, 318, .8, 6) : "");
      }
      return o;
    },
    front: (c) => {
      const st = stage(c), k = king(c), cat = catAt();
      let o = "";
      // la galette sur sa planche, avec le couteau et la pelle à tarte
      const gone = st === "entiere" ? [] : st === "partage" ? [1] : st === "entamee" ? [5, 0, 1] : [0, 1, 2, 4, 5];
      o += `<g>${plate(1486, 632, 50, 13)}${galette(1486, 628, 38, gone)}`;
      if (st === "entiere") o += `<path class="gl-shine" d="M1468 621 l2 -4 l2 4 l-2 4 Z M1500 624 l1.5 -3 l1.5 3 l-1.5 3 Z" fill="#fff6c8"/>`;
      o += `<g transform="translate(1530 638) rotate(-12)"><rect x="-2" y="-1.6" width="26" height="3.2" rx="1.4" fill="#d9dbe6"/><rect x="-14" y="-2" width="13" height="4" rx="1.8" fill="#5a3a26"/></g>`;
      if (st !== "entiere") o += `<g transform="translate(1440 642) rotate(14)"><path d="M0 -5 L16 -6 Q20 0 16 6 L0 5 Z" fill="#d9dbe6"/><rect x="-16" y="-1.6" width="16" height="3.2" rx="1.4" fill="#5a3a26"/></g>`;
      if (st === "fin") o += crumbs(1486, 640, 16, 60, 3);
      o += `</g>`;
      // les petites assiettes : empilées au début, puis avec une part, des miettes, une part croquée
      if (st === "entiere") o += `<g>${[0, 1, 2, 3].map(i => `<ellipse cx="1574" cy="${632 - i * 2.6}" rx="17" ry="4.4" fill="${i % 2 ? "#ece6da" : "#f4f1ea"}" stroke="#d8d0c0" stroke-width=".6"/>`).join("")}</g>`;
      else o += `<g>${plate(1572, 634, 17, 4.6)}${st === "fin" ? crumbs(1572, 633, 8, 18, 21) : slice(1572, 631, -6, st === "entamee")}${plate(1424, 626, 14, 3.8)}${crumbs(1424, 625, 7, 14, 31)}</g>`;
      // le cidre et les bolées
      o += `<g>${cider(1668, 640, st === "entiere" ? .9 : st === "fin" ? 0 : .45)}${bowl(1640, 642, st !== "entiere")}${st !== "entiere" ? bowl(1696, 644, st !== "fin") : ""}</g>`;
      // la couronne : debout sur la table, puis sur la tête du chat ; la fève et le petit carton
      if (st === "entiere" || st === "partage") o += crown(1610, 630, .95, 0);
      if (st === "partage") o += `<g transform="translate(1612 646) rotate(-4)"><rect x="-28" y="-5" width="56" height="10" rx="1.5" fill="#fbf8f0" stroke="#d8d0c0" stroke-width=".5"/><text y="2.4" text-anchor="middle" font-size="6.2" fill="#8a3a2a" font-style="italic">Qui aura la fève ?</text></g>`;
      if (st === "entamee" || st === "fin") {
        o += feve(1612, 636) + `<g transform="translate(1610 650) rotate(-3)"><rect x="-26" y="-5" width="52" height="10" rx="1.5" fill="#fbf8f0" stroke="#d8d0c0" stroke-width=".5"/><text y="2.4" text-anchor="middle" font-size="6.2" fill="#8a3a2a" font-style="italic">${k ? "Fève : " + c.esc(k.slice(0, 10)) + " ♛" : "La fève ! ♛"}</text></g>`;
        const at = cat || [1790, 704];
        if (!cat) o += sleepingCat(at[0], at[1]);
        o += crown(at[0] + 25, at[1] - 12, .62, 14, st === "fin");
      }
      return o;
    },
  };
})();
