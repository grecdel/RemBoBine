(() => {
  /* ===== Poisson d'avril (1er avril) : l'atelier de découpage le matin, des poissons en papier collés partout (même sur le chat), quelques-uns tombés le soir ===== */
  const R = (k) => { const x = Math.sin(k * 21.93 + 7.13) * 43758.5453; return x - Math.floor(x); };
  const stage = (c) => c.h < 10 ? "atelier" : c.h < 20 ? "partout" : "soir";
  const COLS = ["#ff9a3c", "#4da3ff", "#ffd36a", "#57d38c", "#ff7ad9", "#a98bff"];
  const catAt = () => { try { const L = lifeDay(); return L.cat === "sofa" ? [1140, 566] : L.cat === "rug" ? [1790, 704] : null; } catch (_) { return null; } };
  const prank = (c) => { const n = (c.profiles || []).filter(Boolean).map(String); return n.length ? n[(c.y + 3) % n.length] : ""; };

  // un poisson en papier découpé (bords en zigzag), avec un morceau de scotch
  const fish = (x, y, s, rot, col, tape = true, txt = "") => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M-16 0 Q-6 -11 8 -7 L10 -9 L12 -5 L14 -3 L16 0 L14 3 L12 5 L10 9 L8 7 Q-6 11 -16 0 Z" fill="${col}"/><path d="M-16 0 L-26 -9 L-23 -3 L-27 0 L-23 3 L-26 9 Z" fill="${col}"/><path d="M-16 0 Q-6 -11 8 -7 Q2 -3 -4 -3" fill="rgba(255,255,255,.22)"/><path d="M-3 -6 Q-1 0 -3 6 M2 -6 Q4 0 2 6" stroke="rgba(0,0,0,.25)" stroke-width="1" fill="none"/><circle cx="8" cy="-1.5" r="2.2" fill="#fff"/><circle cx="8.6" cy="-1.5" r="1.1" fill="#1a1a1a"/><path d="M13 2 q-2 1.5 -4 1" stroke="#1a1a1a" stroke-width=".8" fill="none"/>${txt ? `<text x="-4" y="4.6" text-anchor="middle" font-size="5" font-weight="700" fill="#2a2a2a">${txt}</text>` : ""}${tape ? `<rect x="-5" y="-13" width="9" height="6" fill="rgba(255,255,240,.55)" stroke="rgba(255,255,255,.6)" stroke-width=".4" transform="rotate(-18 0 -10)"/>` : ""}</g>`;
  const sleepingCat = (x, y) => `<g transform="translate(${x} ${y})"><ellipse rx="30" ry="13" fill="#29272b"/><circle cx="24" cy="-4" r="10" fill="#29272b"/><path d="M18 -12 l3 -8 l4 7 Z M27 -12 l4 -7 l2 8 Z" fill="#29272b"/><path d="M-28 4 q-14 2 -10 -10" stroke="#29272b" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M20 -4 q2 1.5 4 0 M27 -4 q2 1.5 4 0" stroke="#6a6670" stroke-width="1" fill="none"/></g>`;
  const scissors = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M0 0 L22 -4 M0 0 L22 4" stroke="#c9ccd6" stroke-width="2.6" stroke-linecap="round"/><circle cx="-6" cy="-4" r="4" fill="none" stroke="#e04a3a" stroke-width="2.4"/><circle cx="-6" cy="4" r="4" fill="none" stroke="#e04a3a" stroke-width="2.4"/></g>`;
  const tape = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-12 0 L-10 -10 L12 -10 L14 0 Z" fill="#4a4a52"/><circle cx="0" cy="-10" r="7" fill="#e8e2d0"/><circle cx="0" cy="-10" r="3" fill="#4a4a52"/><path d="M7 -10 L14 -5" stroke="rgba(255,255,240,.7)" stroke-width="2"/></g>`;
  const sheet = (x, y, w, h, rot, col, cut) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M${-w / 2} ${-h / 2} h${w} v${h} h${-w} Z" fill="${col}"/>${cut ? `<path d="M${-w / 2 + 6} ${-h / 2 + 4} q8 -4 14 0 l4 -3 l0 6 l-4 -3 q-6 4 -14 0" fill="rgba(0,0,0,.25)"/>` : ""}</g>`;
  const scrap = (x, y, rot, col) => `<path d="M${x} ${y} l5 -2 l2 4 l-4 3 Z" fill="${col}" transform="rotate(${rot} ${x} ${y})"/>`;

  /* ---- la télé (éteinte) diffuse un « flash spécial » ---- */
  const HEAD = ["Les poissons rouges réclament un aquarium avec vue sur mer", "Le néon du salon a changé d'orthographe pendant la nuit", "Record : un chat a dormi 26 heures dans une journée", "Les spaghettis poussent enfin dans les jardins français", "La tour Eiffel sera repeinte en rose dès demain matin"];
  const tvTick = () => {
    const on = document.querySelector("#salon .pf-on"), tv = document.querySelector("#tvScreen .tv-off");
    if (!tv) return;
    let box = tv.querySelector(".pf-tv");
    if (!on) { if (box) box.remove(); return; }
    const k = Math.floor(Date.now() / 6000) % HEAD.length;
    const html = `<div class="pf-top"><b>FLASH SPÉCIAL</b><span>EN DIRECT</span></div><div class="pf-head">${HEAD[k]}</div><div class="pf-fish"></div><div class="pf-bar"><span>· POISSON D'AVRIL · POISSON D'AVRIL · POISSON D'AVRIL · POISSON D'AVRIL ·</span></div>`;
    if (!box) { box = document.createElement("div"); box.className = "pf-tv"; tv.appendChild(box); }
    if (box.dataset.k !== String(k)) { box.innerHTML = html; box.dataset.k = String(k); }
  };
  const startTv = () => { if (!window.__pfTv) window.__pfTv = setInterval(tvTick, 700); setTimeout(tvTick, 60); };

  // où sont collés les poissons : [x, y, échelle, angle, couleur, à partir de l'atelier ?, tombe le soir ?]
  const SPOTS = [
    [1590, 262, .9, 18, 0, 1, 0],     // sur le cadran de l'horloge
    [1112, 532, 1.1, -12, 1, 1, 0],   // sur la porte du meuble télé
    [1368, 214, .9, 24, 2, 0, 0],     // pendu au néon
    [1826, 286, 1.0, -8, 3, 1, 0],    // sur l'abat-jour du lampadaire
    [1772, 392, .8, 10, 4, 0, 1],     // sur le calendrier
    [862, 330, 1.0, -20, 5, 1, 0],    // sur la vitre de la fenêtre
    [1236, 590, 1.1, 6, 0, 0, 0],     // sur le dossier du canapé
    [1916, 604, .9, -14, 2, 0, 1],    // sur la boîte du quiz
    [706, 214, 1.0, 12, 1, 0, 0],     // sur le côté de la bibliothèque des vidéos
    [1446, 420, 1.0, -6, 3, 0, 1],    // sur les briques de la cheminée
    [904, 506, 1.0, 8, 4, 1, 0],      // sur le radiateur
    [2004, 300, .9, -10, 5, 0, 0],    // sur la bibliothèque des jeux
    [1696, 470, .9, 14, 0, 0, 0],     // sur les briques, à droite du foyer
  ];

  FETES2D["poisson"] = {
    replaces: true,
    css: `
      .salon:has(.pf-on) g[transform="translate(922 628)"] { display: none; }
      .pf-wig { transform-box: fill-box; transform-origin: 30% 50%; animation: pfWig 2.6s ease-in-out infinite; }
      @keyframes pfWig { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
      .pf-bubble { animation: pfBub 3s ease-in infinite; opacity: 0; }
      @keyframes pfBub { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: .8; } 100% { transform: translateY(-26px); opacity: 0; } }
      .pf-tv { position: absolute; inset: 0; container-type: size; background: linear-gradient(180deg, #123a6a 0%, #0b2140 100%); color: #fff; overflow: hidden; font-family: inherit; }
      .pf-tv .pf-top { position: absolute; left: 0; right: 0; top: 0; height: 22cqh; display: flex; align-items: center; gap: 3cqw; padding: 0 4cqw; background: #d8262e; }
      .pf-tv .pf-top b { white-space: nowrap; font-size: 6.4cqw; letter-spacing: .08em; font-weight: 900; }
      .pf-tv .pf-top span { white-space: nowrap; font-size: 3.4cqw; padding: .6cqh 1.6cqw; border: .4cqw solid #fff; border-radius: 1cqw; animation: nyBlink 1s steps(2) infinite; }
      .pf-tv .pf-head { position: absolute; left: 5cqw; right: 30cqw; top: 30cqh; font-size: 5.6cqw; font-weight: 800; line-height: 1.2; }
      .pf-tv .pf-fish { position: absolute; right: 5cqw; top: 30cqh; width: 22cqw; height: 22cqw; background: radial-gradient(circle at 70% 45%, #fff 0 5%, #111 5% 8%, transparent 8%), radial-gradient(ellipse 50% 32% at 50% 50%, #ff9a3c 0 98%, transparent 100%); animation: pfSwim 2s ease-in-out infinite alternate; }
      .pf-tv .pf-fish::before { content: ""; position: absolute; left: -2cqw; top: 6cqw; border: 5cqw solid transparent; border-right: 6cqw solid #ff9a3c; }
      @keyframes pfSwim { from { transform: translateY(-2cqh) rotate(-6deg); } to { transform: translateY(3cqh) rotate(6deg); } }
      .pf-tv .pf-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 18cqh; background: #ffd36a; color: #3a2a12; display: flex; align-items: center; overflow: hidden; white-space: nowrap; }
      .pf-tv .pf-bar span { font-size: 6cqw; font-weight: 900; letter-spacing: .06em; animation: pfScroll 9s linear infinite; padding-left: 100%; }
      @keyframes pfScroll { from { transform: translateX(0); } to { transform: translateX(-100%); } }
      @keyframes nyBlink { 50% { opacity: .25; } }
      .salon.still .pf-wig, .salon.still .pf-bubble, .salon.still .pf-tv * { animation: none; }`,
    greet: (c) => {
      const st = stage(c), p = prank(c);
      if (st === "atelier") return `Poisson d'avril ! Quelqu'un a passé la nuit à découper des poissons en papier : les ciseaux sont encore sur la table${p ? ", et c'est signé " + p : ""}…`;
      if (st === "partout") return `Poisson d'avril ! Des poissons en papier sont collés partout : l'horloge, la lampe, la télé, la fenêtre… et même sur le dos du chat.`;
      return `Fin du poisson d'avril : quelques poissons sont tombés par terre… mais le chat n'a toujours pas remarqué le sien.`;
    },
    wall: (c) => { startTv(); return `<g class="pf-on"></g>`; },
    mantel: (c) => {
      // le bocal à poisson rouge… avec un poisson en papier dedans
      return `<g transform="translate(1500 318)"><ellipse cy="-2" rx="16" ry="3" fill="rgba(0,0,0,.2)"/><path d="M-10 -36 Q-22 -26 -20 -14 Q-18 0 0 0 Q18 0 20 -14 Q22 -26 10 -36 Z" fill="rgba(170,215,240,.35)" stroke="rgba(230,245,255,.75)" stroke-width="1.2"/><path d="M-19 -24 Q-21 -12 -16 -6 Q-6 2 0 1 Q12 1 18 -8 Q21 -14 19 -24 Z" fill="rgba(90,170,220,.45)"/><ellipse cy="-36" rx="10" ry="2.4" fill="none" stroke="rgba(230,245,255,.8)" stroke-width="1.2"/>${[-8, -2, 4, 9].map((x, i) => `<ellipse cx="${x}" cy="-3" rx="3" ry="1.8" fill="${["#c9b48a", "#8a9aa8", "#e8d8b8", "#7a8a6a"][i]}"/>`).join("")}<g class="pf-wig">${fish(2, -15, .55, 0, "#ff9a3c", false)}</g>${[0, 1, 2].map(i => `<circle class="pf-bubble" cx="${10 + i}" cy="-20" r="${1.2 + i * .3}" fill="none" stroke="rgba(255,255,255,.8)" stroke-width=".6" style="animation-delay:${i * .9}s"/>`).join("")}<rect x="-12" y="-46" width="24" height="7" rx="1" fill="#fbf8f0" transform="rotate(-6)"/><text x="0" y="-41" text-anchor="middle" font-size="4.8" fill="#3a5a8a" transform="rotate(-6)">Bulle</text></g>`;
    },
    front: (c) => {
      const st = stage(c), p = prank(c), cat = catAt();
      let o = "";
      // les poissons collés un peu partout (le matin, seulement les premiers)
      SPOTS.forEach(([x, y, s, rot, ci, early, falls], i) => {
        if (st === "atelier" && !early) return;
        if (st === "soir" && falls) return;
        const sig = i === 6 && p ? c.esc(p.slice(0, 6)) : "";
        o += fish(x, y, s, rot, COLS[ci], true, sig);
      });
      // un poisson qui pend au fil de l'ampoule du plafond
      if (st !== "atelier") o += `<g class="pf-wig" style="transform-origin:50% 0"><path d="M1600 96 V128" stroke="#ddd" stroke-width=".8"/>${fish(1600, 136, .8, 90, COLS[1], false)}</g>`;
      // le soir : ceux qui se sont décollés, par terre
      if (st === "soir") o += [[1768, 712, 160, 4], [1900, 700, -30, 2], [1452, 702, 200, 3], [700, 706, 40, 1]].map(([x, y, rot, ci]) => fish(x, y, .9, rot, COLS[ci], true)).join("");
      // l'atelier de découpage sur la table basse
      if (st === "atelier") {
        o += sheet(1470, 636, 46, 18, -6, "#4da3ff", true) + sheet(1500, 640, 40, 16, 8, "#ffd36a", false) + sheet(1660, 638, 42, 16, -4, "#57d38c", true);
        o += `<g>${[0, 1, 2, 3, 4].map(i => fish(1576 + (i % 2) * 2, 640 - i * 2.4, .9, 4 - i * 3, COLS[i], false)).join("")}</g>`;
        o += scissors(1530, 648, -16) + tape(1626, 648) + `<path d="M1696 646 l18 -6" stroke="#e8c15a" stroke-width="2.4" stroke-linecap="round"/><path d="M1712 640.6 l3 -1 l-1.5 2.6 Z" fill="#3a2a1a"/>`;
        o += Array.from({ length: 12 }, (_, i) => scrap(1440 + R(i) * 260, 628 + R(i + 20) * 20, R(i + 40) * 360, COLS[i % COLS.length])).join("");
      } else {
        o += sheet(1480, 640, 34, 14, 10, "#ff7ad9", true) + scissors(1520, 648, 20) + tape(1676, 650);
        o += Array.from({ length: 8 }, (_, i) => scrap(1450 + R(i + 60) * 240, 630 + R(i + 80) * 18, R(i + 90) * 360, COLS[i % COLS.length])).join("");
        o += `<g transform="translate(1592 640) rotate(-5)"><rect x="-24" y="-8" width="48" height="16" rx="1.2" fill="#fbf8f0" stroke="#d8d0c0" stroke-width=".5"/><text y="-1" text-anchor="middle" font-size="5" font-style="italic" fill="#3a5a8a">Regarde dans</text><text y="5" text-anchor="middle" font-size="5" font-style="italic" fill="#3a5a8a">ton dos ! ><(((°></text></g>`;
      }
      // et sur le dos du chat (il ne s'est rendu compte de rien)
      if (st !== "atelier") { const at = cat || [1790, 704]; if (!cat) o += sleepingCat(at[0], at[1]); o += fish(at[0] - 4, at[1] - 12, .85, -8, COLS[0], true); }
      return o;
    },
  };
})();
