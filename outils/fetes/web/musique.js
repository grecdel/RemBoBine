(() => {
  // ===== Fête de la musique (21 juin) : instruments posés, partitions, tourne-disque qui tourne, guirlande de notes =====
  const R = (k) => { let x = Math.sin(k * 41.3 + 7.7) * 43758.5453; return x - Math.floor(x); };
  // une note en papier découpé (croche ou double croche)
  const note = (x, y, s, col, dbl) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="-4" cy="10" rx="5" ry="3.6" transform="rotate(-22 -4 10)" fill="${col}"/>${dbl ? `<ellipse cx="10" cy="7" rx="5" ry="3.6" transform="rotate(-22 10 7)" fill="${col}"/><path d="M0.4 9 V-8 M14.4 6 V-11" stroke="${col}" stroke-width="2"/><path d="M0 -8 L15 -11 L15 -7 L0 -4 Z" fill="${col}"/>` : `<path d="M0.4 9 V-10" stroke="${col}" stroke-width="2"/><path d="M0.4 -10 Q8 -6 7 2 Q5 -3 0.4 -4 Z" fill="${col}"/>`}</g>`;
  // le ukulélé (petit, quatre cordes)
  const ukulele = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><ellipse cx="0" cy="3" rx="30" ry="5" fill="rgba(0,0,0,.2)"/>
      <path d="M-30 0 C-30 -12 -20 -15 -13 -11 C-9 -9 -7 -9 -3 -11 C4 -15 14 -12 14 0 C14 12 4 15 -3 11 C-7 9 -9 9 -13 11 C-20 15 -30 12 -30 0 Z" fill="#c98a4a" stroke="#8a5a2b" stroke-width="1.4"/>
      <path d="M-27 -2 C-26 -9 -20 -11 -15 -8" stroke="#e8b878" stroke-width="2" fill="none" opacity=".7"/><circle cx="-4" cy="0" r="4.2" fill="#3a2414"/><rect x="-22" y="-4" width="3" height="8" rx="1" fill="#5a3418"/>
      <rect x="12" y="-2.6" width="34" height="5.2" fill="#6b452d"/>${[18, 24, 30, 36, 41].map(fx => `<line x1="${fx}" y1="-2.6" x2="${fx}" y2="2.6" stroke="#d9c9a8" stroke-width=".6"/>`).join("")}
      <path d="M46 -4 L58 -5 L58 5 L46 4 Z" fill="#5a3418"/>${[-3, -1, 1, 3].map((dy, i) => `<line x1="-21" y1="${dy * .9}" x2="47" y2="${dy * .9}" stroke="#f4f1ea" stroke-width=".45"/><circle cx="${50 + (i % 2) * 5}" cy="${i < 2 ? -6 : 6}" r="1.4" fill="#c9ccd2"/>`).join("")}</g>`;
  const tambourine = (x, y) => `<g transform="translate(${x} ${y})"><ellipse cy="2" rx="22" ry="8" fill="rgba(0,0,0,.2)"/><ellipse rx="21" ry="8" fill="#b07a3e"/><ellipse cy="-3" rx="21" ry="8" fill="#c98a4a"/><ellipse cy="-4" rx="18.5" ry="6.6" fill="#efe4c8"/>
      ${[0, 1, 2, 3, 4, 5].map(i => { const a = i / 6 * Math.PI * 2 + .3, jx = Math.cos(a) * 21, jy = -2 + Math.sin(a) * 8; return `<g class="mz-jing" style="animation-delay:${i * .12}s"><ellipse cx="${jx}" cy="${jy}" rx="3.4" ry="1.8" fill="#d9dce2" stroke="#8a8d94" stroke-width=".5"/></g>`; }).join("")}
      <path d="M-10 -6 q10 -4 20 0" stroke="#d9c9a8" stroke-width="1" fill="none"/></g>`;
  const maraca = (x, y, rot, col) => `<g transform="translate(${x} ${y}) rotate(${rot})"><ellipse cx="0" cy="-12" rx="9" ry="11" fill="${col}"/><path d="M-8 -14 q8 4 16 0" stroke="#fff3c4" stroke-width="2" fill="none"/><path d="M-6 -6 q6 3 12 0" stroke="#2fa86a" stroke-width="2" fill="none"/><ellipse cx="-3" cy="-17" rx="2.4" ry="3.4" fill="rgba(255,255,255,.4)"/><rect x="-2" y="-2" width="4" height="16" rx="2" fill="#7a5532"/></g>`;
  const harmonica = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-17" y="-5" width="34" height="9" rx="2" fill="#c9ccd2" stroke="#8a8d94" stroke-width=".6"/><rect x="-17" y="-1.5" width="34" height="3" fill="#3a3a40"/>${Array.from({ length: 10 }, (_, i) => `<rect x="${-15.5 + i * 3.2}" y="-1" width="1.8" height="2" fill="#111"/>`).join("")}<path d="M-15 -4 h30" stroke="#fff" stroke-width=".8" opacity=".7"/></g>`;
  FETES2D["musique"] = {
    replaces: true,
    css: `.mz-spin{transform-box:fill-box;transform-origin:50% 50%;animation:mzSpin 1.8s linear infinite}@keyframes mzSpin{to{transform:rotate(360deg)}}
      .mz-up{animation:mzUp 4.5s ease-out infinite;opacity:0}@keyframes mzUp{0%{opacity:0;transform:translate(0,0)}15%{opacity:.9}100%{opacity:0;transform:translate(var(--dx),-90px) rotate(var(--r))}}
      .mz-sway{transform-box:fill-box;transform-origin:50% 0;animation:mzSway 4s ease-in-out infinite alternate}@keyframes mzSway{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}
      .mz-tick{transform-box:fill-box;transform-origin:50% 100%;animation:mzTick 1.2s ease-in-out infinite alternate}@keyframes mzTick{from{transform:rotate(-22deg)}to{transform:rotate(22deg)}}
      .mz-jing{animation:mzJing 5s ease-in-out infinite}@keyframes mzJing{0%,90%,100%{transform:translateY(0)}93%{transform:translateY(-1.5px)}96%{transform:translateY(1px)}}`,
    greet: (c) => "C'est la fête de la musique ! Le tourne-disque tourne déjà, et les instruments attendent sur la table : à toi de jouer.",
    wall: (c) => { let o = "";
      // guirlande de notes en papier, en festons
      const cols = ["#ffd36a", "#f4f1ea", "#f28aa8", "#7ac0e6"];
      for (let x0 = 300; x0 < 2300; x0 += 200) {
        o += `<path d="M${x0} 60 Q${x0 + 100} 94 ${x0 + 200} 60" stroke="#cfc6b4" stroke-width="1.5" fill="none"/>`;
        for (let k = 1; k < 5; k++) { const t = k / 5, x = x0 + 200 * t, y = 60 + 2 * 34 * t * (1 - t) * 2; o += `<g class="mz-sway" style="animation-delay:${(-R(x) * 4).toFixed(2)}s"><line x1="${x}" y1="${y}" x2="${x}" y2="${y + 6}" stroke="#cfc6b4"/>${note(x, y + 18, 1.05, cols[(k + x0 / 200) % 4 | 0], k % 2 === 0)}</g>`; }
        o += `<g transform="translate(${x0} 60)"><circle r="4" fill="#2a2333"/><circle r="1.6" fill="#ffd36a"/></g>`;
      }
      // l'affiche de la fête, punaisée au mur entre la cheminée et la lampe
      o += `<g transform="translate(1744 186) rotate(3)"><rect x="-32" y="-44" width="64" height="88" fill="#f4ecd8"/><rect x="-32" y="-44" width="64" height="88" fill="none" stroke="#d9cdb4"/><circle cy="-44" r="2.4" fill="#c4122f"/>
        <text y="-18" text-anchor="middle" font-size="26" font-weight="900" fill="#e8453c">21</text><text y="-6" text-anchor="middle" font-size="9" font-weight="800" fill="#2a2333" letter-spacing="2">JUIN</text>
        <path d="M-24 8 q6 -8 12 0 t12 0 t12 0 t12 0" stroke="#3a8fd8" stroke-width="2.2" fill="none"/><path d="M-24 14 q6 -6 12 0 t12 0 t12 0 t12 0" stroke="#ffb02e" stroke-width="1.6" fill="none"/>
        <text y="28" text-anchor="middle" font-size="6.4" font-weight="800" fill="#2a2333">FÊTE DE LA</text><text y="36" text-anchor="middle" font-size="6.4" font-weight="800" fill="#2a2333">MUSIQUE</text>${note(20, -30, .55, "#2a2333", true)}</g>`;
      return `<g aria-hidden="true">${o}</g>`; },
    mantel: (c) => { let o = "";
      // le métronome qui bat la mesure sur la cheminée
      o += `<g transform="translate(1512 318)"><path d="M-12 0 L-6 -40 L6 -40 L12 0 Z" fill="#6b3d1e"/><path d="M-12 0 L-6 -40" stroke="#8a5a2b" stroke-width="2"/><path d="M-7 -4 L-4 -34 L4 -34 L7 -4 Z" fill="#e9dcc0"/>${[-30, -25, -20, -15, -10].map(y => `<line x1="-2" y1="${y}" x2="2" y2="${y}" stroke="#8a5a2b" stroke-width=".8"/>`).join("")}<g class="mz-tick"><line x1="0" y1="-6" x2="0" y2="-38" stroke="#c9ccd2" stroke-width="1.6"/><rect x="-3" y="-28" width="6" height="5" fill="#c9a26b"/></g><rect x="-13" y="-2" width="26" height="3" fill="#4e2a12"/></g>`;
      // le tourne-disque, sur le meuble télé : le disque tourne, des notes s'en échappent
      o += `<g transform="translate(1390 500)"><rect x="-44" y="-16" width="88" height="16" rx="3" fill="#8f2d2a"/><rect x="-44" y="-16" width="88" height="4" rx="2" fill="#a83a35"/><rect x="-40" y="-4" width="80" height="3" fill="#6e1f1d"/>
        <circle cx="34" cy="-8" r="2.4" fill="#e8c15a"/><circle cx="28" cy="-8" r="1.6" fill="#d9dce2"/>
        <g transform="translate(-8 -17) scale(1 .34)"><circle r="30" fill="#2a2a2e"/><g class="mz-spin"><circle r="28" fill="#111114"/>${[24, 20, 16, 13].map(r => `<circle r="${r}" fill="none" stroke="#2a2a30" stroke-width="1"/>`).join("")}<circle r="9" fill="#e8b73a"/><rect x="-1.5" y="-8" width="3" height="5" fill="#8a5a2b"/><path d="M-26 -6 A27 27 0 0 1 -6 -26" stroke="rgba(255,255,255,.25)" stroke-width="3" fill="none"/><circle r="1.4" fill="#ddd"/></g></g>
        <path d="M30 -20 L24 -36 L4 -24" stroke="#c9ccd2" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="30" cy="-20" r="3" fill="#8a8d94"/><rect x="0" y="-27" width="6" height="4" rx="1" fill="#55585e" transform="rotate(-30 3 -25)"/></g>`;
      o += [0, 1, 2, 3].map(i => `<g class="mz-up" style="--dx:${(i % 2 ? 1 : -1) * (10 + i * 6)}px;--r:${i % 2 ? 20 : -20}deg;animation-delay:${i * 1.1}s">${note(1378 + i * 6, 470, .8, ["#ffd36a", "#f28aa8", "#7ac0e6", "#f4f1ea"][i], i % 2 === 1)}</g>`).join("");
      // une caisse de vinyles au pied du meuble télé
      o += `<g transform="translate(1048 600)">${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${-26 + i * 7}" y="-34" width="6" height="30" rx="1" fill="hsl(${i * 57} 45% 45%)" transform="rotate(${-8 + i * 2} ${-23 + i * 7} -4)"/>`).join("")}<rect x="-30" y="-20" width="60" height="20" rx="2" fill="#9a6a3a"/><rect x="-26" y="-14" width="52" height="3" fill="#7a5028"/></g>`;
      return `<g aria-hidden="true">${o}</g>`; },
    front: (c) => { let o = "";
      // sur la table basse : les maracas, l'harmonica, le tambourin
      o += maraca(1426, 640, -24, "#e8453c") + maraca(1448, 646, 18, "#ffb02e") + harmonica(1500, 646, -6) + tambourine(1690, 638);
      // le ukulélé, posé sur le dossier du canapé
      o += ukulele(1150, 580, -14);
      // le pupitre et sa partition, devant la bibliothèque
      o += `<g transform="translate(1790 716)"><path d="M0 0 L-16 6 M0 0 L16 6 M0 0 L0 6" stroke="#2a2a2e" stroke-width="2"/><rect x="-1.5" y="-96" width="3" height="96" fill="#2a2a2e"/>
        <path d="M-30 -132 L30 -132 L32 -94 L-32 -94 Z" fill="#2a2a2e"/><rect x="-32" y="-96" width="64" height="4" fill="#3a3a40"/>
        <path d="M-27 -128 L-1 -130 L-1 -97 L-28 -97 Z" fill="#f4f1ea"/><path d="M1 -130 L27 -128 L28 -97 L1 -97 Z" fill="#ece6d8"/>
        ${[0, 1, 2, 3].map(r => `${[-1, 1].map(sd => [0, 1, 2, 3, 4].map(l => `<line x1="${sd < 0 ? -25 : 3}" y1="${-124 + r * 7 + l * 1.1}" x2="${sd < 0 ? -3 : 25}" y2="${-124 + r * 7 + l * 1.1}" stroke="#9a948a" stroke-width=".35"/>`).join("")).join("")}${[0, 1, 2, 3, 4, 5].map(k => `<circle cx="${-22 + k * 8 + (k > 2 ? 4 : 0)}" cy="${-121 + r * 7 + (R(k + r * 7) * 4 - 2)}" r=".9" fill="#2a2333"/>`).join("")}`).join("")}</g>`;
      // un petit xylophone d'enfant sur le tapis, sous la table
      o += `<g transform="translate(1600 704) rotate(-4)"><path d="M-40 -6 L40 -10 L40 4 L-40 6 Z" fill="#6b452d"/>${["#e8453c", "#f28c28", "#f6d33c", "#4cb050", "#3a8fd8", "#8a5cc0", "#e85aa0"].map((col, i) => `<rect x="${-36 + i * 10.5}" y="${-12 + i * .4}" width="8" height="${18 - i * 1.2}" rx="1.5" fill="${col}"/><circle cx="${-32 + i * 10.5}" cy="${-9 + i * .4}" r=".9" fill="#ddd"/>`).join("")}
        <g transform="translate(46 -2) rotate(30)"><rect x="-1" y="-20" width="2" height="20" fill="#d9c9a8"/><circle cy="-21" r="3" fill="#e8453c"/></g></g>`;
      return `<g aria-hidden="true">${o}</g>`; },
  };
})();
