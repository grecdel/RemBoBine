/* Fêtes nationales (sauf France et Irlande) : une base commune "nat" + une petite touche par pays ("nat:XX").
   Base : fanions aux couleurs du drapeau, drapeaux croisés au-dessus de l'horloge, guirlande de petits drapeaux
   le long de la cheminée, cocardes, drapeau planté dehors à la fenêtre, petits drapeaux et serpentins sur la table.
   La lumière reste naturelle : seules les sources visibles (lampions, lanternes, feux dehors) ont une petite lueur. */
(() => {
  const NT = {};
  // nom du pays, « à la Belgique » (pour le message d'accueil)
  NT.N = {
    BE: ["Belgique", "à la Belgique"], CH: ["Suisse", "à la Suisse"], LU: ["Luxembourg", "au Luxembourg"], MC: ["Monaco", "à Monaco"],
    QC: ["Québec", "au Québec"], CA: ["Canada", "au Canada"], US: ["États-Unis", "aux États-Unis"], DE: ["Allemagne", "à l'Allemagne"],
    IT: ["Italie", "à l'Italie"], ES: ["Espagne", "à l'Espagne"], PT: ["Portugal", "au Portugal"], NL: ["Pays-Bas", "aux Pays-Bas"],
    PL: ["Pologne", "à la Pologne"], GR: ["Grèce", "à la Grèce"], MA: ["Maroc", "au Maroc"], DZ: ["Algérie", "à l'Algérie"],
    TN: ["Tunisie", "à la Tunisie"], SN: ["Sénégal", "au Sénégal"], CI: ["Côte d'Ivoire", "à la Côte d'Ivoire"], CM: ["Cameroun", "au Cameroun"],
    HT: ["Haïti", "à Haïti"], MX: ["Mexique", "au Mexique"], BR: ["Brésil", "au Brésil"], JP: ["Japon", "au Japon"],
    CN: ["Chine", "à la Chine"], IN: ["Inde", "à l'Inde"], KR: ["Corée du Sud", "à la Corée du Sud"], VN: ["Vietnam", "au Vietnam"], TH: ["Thaïlande", "à la Thaïlande"],
  };
  // drapeaux qui ne sont pas (encore) dans FLAGS : couleurs des fanions + dessin
  NT.XC = { CN: ["#EE1C25", "#FFDE00"], IN: ["#FF9933", "#FFFFFF", "#138808"], KR: ["#FFFFFF", "#CD2E3A", "#0047A0"], VN: ["#DA251D", "#FFDE00"], TH: ["#A51931", "#F4F5F8", "#2D2A4A"] };
  const f1 = (v) => Math.round(v * 10) / 10;
  NT.star = (cx, cy, r, col, rot = 0) => `<path d="${Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + rot + k * Math.PI / 5, rr = k % 2 ? r * .4 : r; return (k ? "L" : "M") + f1(cx + Math.cos(a) * rr) + " " + f1(cy + Math.sin(a) * rr); }).join(" ")} Z" fill="${col}"/>`;
  NT.xflag = (code, x, y, w, h) => {
    let o = "";
    if (code === "CN") {
      o += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#EE1C25"/>` + NT.star(x + w * 5 / 30, y + h * 5 / 20, h * 3 / 20, "#FFDE00");
      [[10, 2], [12, 4], [12, 7], [10, 9]].forEach(([a, b], i) => { o += NT.star(x + w * a / 30, y + h * b / 20, h / 20, "#FFDE00", .4 - i * .3); });
    } else if (code === "IN") {
      ["#FF9933", "#FFFFFF", "#138808"].forEach((k, i) => { o += `<rect x="${x}" y="${y + i * h / 3}" width="${w}" height="${h / 3 + .4}" fill="${k}"/>`; });
      const cx = x + w / 2, cy = y + h / 2, r = h * .14;
      o += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#000080" stroke-width="${f1(Math.max(.6, h * .025))}"/>` + Array.from({ length: 12 }, (_, k) => `<line x1="${cx}" y1="${cy}" x2="${f1(cx + Math.cos(k * Math.PI / 6) * r)}" y2="${f1(cy + Math.sin(k * Math.PI / 6) * r)}" stroke="#000080" stroke-width="${f1(Math.max(.3, h * .012))}"/>`).join("");
    } else if (code === "KR") {
      const cx = x + w / 2, cy = y + h / 2, r = h * .25;
      o += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFFFFF"/><g transform="rotate(33.7 ${f1(cx)} ${f1(cy)})"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#0047A0"/><path d="M${f1(cx - r)} ${cy} A${r} ${r} 0 0 1 ${f1(cx + r)} ${cy} A${f1(r / 2)} ${f1(r / 2)} 0 0 1 ${cx} ${cy} A${f1(r / 2)} ${f1(r / 2)} 0 0 0 ${f1(cx - r)} ${cy} Z" fill="#CD2E3A"/></g>`;
      // les quatre trigrammes (trois barres), perpendiculaires aux diagonales
      const tri = (dx, dy, pat) => { const px = cx + dx * w * .3, py = cy + dy * h * .3, ang = Math.atan2(dy * h, dx * w) * 180 / Math.PI + 90, bw = h * .2, bh = h * .035;
        return `<g transform="translate(${f1(px)} ${f1(py)}) rotate(${f1(ang)})">${pat.map((br, i) => br ? `<rect x="${f1(-bw / 2)}" y="${f1(-bh * 2.6 + i * bh * 1.8)}" width="${f1(bw)}" height="${f1(bh)}" fill="#000"/>` : `<rect x="${f1(-bw / 2)}" y="${f1(-bh * 2.6 + i * bh * 1.8)}" width="${f1(bw * .44)}" height="${f1(bh)}" fill="#000"/><rect x="${f1(bw * .06)}" y="${f1(-bh * 2.6 + i * bh * 1.8)}" width="${f1(bw * .44)}" height="${f1(bh)}" fill="#000"/>`).join("")}</g>`; };
      o += tri(-1, -1, [1, 1, 1]) + tri(1, 1, [0, 0, 0]) + tri(1, -1, [0, 1, 0]) + tri(-1, 1, [1, 0, 1]);
    } else if (code === "VN") {
      o += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#DA251D"/>` + NT.star(x + w / 2, y + h / 2, h * .3, "#FFDE00");
    } else if (code === "TH") {
      [["#A51931", 0, 1], ["#F4F5F8", 1, 1], ["#2D2A4A", 2, 2], ["#F4F5F8", 4, 1], ["#A51931", 5, 1]].forEach(([k, a, n]) => { o += `<rect x="${x}" y="${f1(y + a * h / 6)}" width="${w}" height="${f1(n * h / 6 + .4)}" fill="${k}"/>`; });
    } else return "";
    return `<g>${o}<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="rgba(0,0,0,.25)"/></g>`;
  };
  // pour ces cinq pays, notre dessin (plus fidèle : roue de l'Inde, trigrammes de la Corée, étoiles de la Chine) passe avant FLAGS
  NT.flag = (c, code, x, y, w, h) => NT.XC[code] || !c.FLAGS[code] ? NT.xflag(code, x, y, w, h) : c.flagSvg(code, x, y, w, h);
  NT.cols = (c, code) => NT.XC[code] || (c.FLAGS[code] ? [...new Set(c.FLAGS[code][4])] : ["#c0392b", "#ffffff", "#2c5aa0"]);
  NT.R = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  // un drapeau planté (mât en bois, pommeau doré) : base du mât en (x, y)
  NT.pole = (c, code, x, y, ph, fw, fh, d = 0) => `<rect x="${x - 1.5}" y="${y - ph}" width="3" height="${ph}" fill="#6b4a2b"/><circle cx="${x}" cy="${y - ph - 2}" r="3" fill="#d8b46a"/><g class="nt-wave" style="animation-delay:${-d}s">${NT.flag(c, code, x + 1.5, y - ph + 1, fw, fh)}</g>`;
  // cocarde plissée aux couleurs (anneaux) avec deux rubans
  NT.rosette = (x, y, r, cols, tails = true) => {
    let o = "";
    if (tails) o += `<path d="M${x - r * .3} ${y} L${x - r * .75} ${y + r * 2.1} L${x - r * .35} ${y + r * 1.8} L${x - r * .05} ${y + r * 2.2} Z" fill="${cols[0]}" stroke="rgba(0,0,0,.2)" stroke-width=".6"/><path d="M${x + r * .3} ${y} L${x + r * .75} ${y + r * 2.1} L${x + r * .35} ${y + r * 1.8} L${x + r * .05} ${y + r * 2.2} Z" fill="${cols[cols.length - 1]}" stroke="rgba(0,0,0,.2)" stroke-width=".6"/>`;
    const ring = cols.length >= 3 ? [cols[cols.length - 1], cols[1], cols[0]] : [cols[0], cols[1] || "#fff", cols[0]];
    ring.forEach((k, i) => { const rr = r * (1 - i * .3); o += `<circle cx="${x}" cy="${y}" r="${f1(rr)}" fill="${k}" stroke="rgba(0,0,0,.18)" stroke-width=".6" stroke-dasharray="${f1(rr * .45)} ${f1(rr * .12)}"/>`; });
    return o + `<circle cx="${x}" cy="${y}" r="${f1(r * .14)}" fill="rgba(255,255,255,.5)"/>`;
  };
  // guirlande de fanions triangulaires entre x0 et x1
  NT.pennants = (cols, x0, x1, y0, sag = 46, step = 44, sz = 30) => {
    let o = `<path d="M${x0} ${y0} Q${(x0 + x1) / 2} ${y0 + sag * 2} ${x1} ${y0}" fill="none" stroke="#c9b48a" stroke-width="1.5"/>`;
    for (let x = x0 + step / 2, k = 0; x < x1 - step / 3; x += step, k++) { const t = (x - x0) / (x1 - x0), y = y0 + 4 * sag * t * (1 - t);
      o += `<path class="nt-flap" style="animation-delay:${-k * .37}s" d="M${f1(x - sz / 2)} ${f1(y)} L${f1(x + sz / 2)} ${f1(y)} L${f1(x)} ${f1(y + sz)} Z" fill="${cols[k % cols.length]}" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>`; }
    return o;
  };
  // guirlande de petits drapeaux rectangulaires
  NT.miniFlags = (c, code, x0, x1, y0, sag, n, w, h) => {
    let o = `<path d="M${x0} ${y0} Q${(x0 + x1) / 2} ${y0 + sag * 2} ${x1} ${y0}" fill="none" stroke="#e8dcc0" stroke-width="1"/>`;
    for (let k = 0; k < n; k++) { const t = (k + .5) / n, x = x0 + (x1 - x0) * t, y = y0 + 4 * sag * t * (1 - t); o += `<g class="nt-flap" style="animation-delay:${-k * .41}s">${NT.flag(c, code, f1(x - w / 2), f1(y), w, h)}</g>`; }
    return `<circle cx="${x0}" cy="${y0}" r="2" fill="#8a6a45"/><circle cx="${x1}" cy="${y0}" r="2" fill="#8a6a45"/>` + o;
  };
  // pot de fleurs (terre cuite) : base en (x, y)
  NT.pot = (x, y, w = 30, h = 26, col = "#b5653a") => `<path d="M${x - w / 2} ${y - h} L${x + w / 2} ${y - h} L${x + w * .36} ${y} L${x - w * .36} ${y} Z" fill="${col}"/><rect x="${x - w / 2 - 2}" y="${y - h - 4}" width="${w + 4}" height="6" rx="1.5" fill="${col}"/><rect x="${x - w / 2 - 2}" y="${y - h - 4}" width="${w + 4}" height="6" rx="1.5" fill="rgba(0,0,0,.15)"/><ellipse cx="${x}" cy="${y - h - 3}" rx="${w / 2 - 1}" ry="2.2" fill="#3a2a1e"/>`;
  // vase en verre : base en (x, y)
  NT.vase = (x, y, w = 16, h = 30, col = "rgba(190,225,235,.55)") => `<path d="M${x - w / 2} ${y - h} L${x + w / 2} ${y - h} L${x + w * .4} ${y} L${x - w * .4} ${y} Z" fill="${col}" stroke="rgba(255,255,255,.45)" stroke-width="1"/><rect x="${x - w * .35}" y="${y - h * .55}" width="${w * .7}" height="${h * .5}" fill="rgba(120,170,140,.35)"/>`;
  NT.stem = (x1, y1, x2, y2, col = "#3f7d4f", sw = 2) => `<path d="M${x1} ${y1} Q${f1((x1 + x2) / 2 + (x2 - x1) * .2)} ${f1((y1 + y2) / 2)} ${x2} ${y2}" stroke="${col}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
  NT.flower = (x, y, r, col, mid = "#f2c94c", n = 5, rot = 0) => Array.from({ length: n }, (_, k) => { const a = rot + k * 2 * Math.PI / n; return `<ellipse cx="${f1(x + Math.cos(a) * r * .55)}" cy="${f1(y + Math.sin(a) * r * .55)}" rx="${f1(r * .55)}" ry="${f1(r * .36)}" fill="${col}" transform="rotate(${f1(a * 180 / Math.PI)} ${f1(x + Math.cos(a) * r * .55)} ${f1(y + Math.sin(a) * r * .55)})"/>`; }).join("") + `<circle cx="${x}" cy="${y}" r="${f1(r * .25)}" fill="${mid}"/>`;
  NT.leaf = (x, y, len, ang, col = "#4f8a4a") => `<ellipse cx="${x}" cy="${y}" rx="${len / 2}" ry="${f1(len * .2)}" fill="${col}" transform="rotate(${ang} ${x} ${y}) translate(${len / 2} 0)"/>`;
  NT.plate = (x, y, r = 30) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${f1(r * .26)}" fill="#e9e4da"/><ellipse cx="${x}" cy="${y - 1}" rx="${f1(r * .72)}" ry="${f1(r * .17)}" fill="#f6f2ea"/>`;
  // carte postale posée contre le mur : base en (x, y)
  NT.postcard = (x, y, w, h, inner, rot = -6) => `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - w / 2 - 3}" y="${y - h - 3}" width="${w + 6}" height="${h + 6}" fill="#f3ecdc"/><g transform="translate(${x - w / 2} ${y - h}) scale(${f1(w / 100 * 1000) / 1000} ${f1(h / 70 * 1000) / 1000})">${inner}</g><rect x="${x - w / 2 - 3}" y="${y - h - 3}" width="${w + 6}" height="${h + 6}" fill="none" stroke="rgba(0,0,0,.18)"/></g>`;
  NT.glow = (x, y, r, col, a = .35) => `<circle class="nt-glow" cx="${x}" cy="${y}" r="${r}" fill="${col}" opacity="${a}" filter="url(#ntBlur)" style="mix-blend-mode:screen"/>`;
  // lampion / lanterne en papier suspendu, avec sa bougie : centre en (x, y)
  NT.lantern = (x, y, r, col, band = "#f1d38a", glowCol = "#ffbf5a") => `${NT.glow(x, y, r * 2.2, glowCol, .28)}<line x1="${x}" y1="${y - r - 6}" x2="${x}" y2="${y - r}" stroke="#555" stroke-width="1"/><rect x="${x - r * .45}" y="${y - r - 2}" width="${r * .9}" height="4" fill="#3a3030"/><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${f1(r * .9)}" fill="${col}"/>${[-.55, 0, .55].map(k => `<ellipse cx="${x}" cy="${y}" rx="${f1(r * Math.abs(k) + .5)}" ry="${f1(r * .9)}" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".8"/>`).join("")}<ellipse cx="${x}" cy="${y}" rx="${f1(r * .45)}" ry="${f1(r * .5)}" fill="#ffe7a8" opacity=".55"/><rect x="${x - r * .45}" y="${y + r * .85}" width="${r * .9}" height="4" fill="${band}"/>`;
  NT.firework = (x, y, r, col, d) => `<g class="nt-burst" style="animation-delay:${-d}s;transform-origin:${x}px ${y}px">${Array.from({ length: 12 }, (_, k) => { const a = k * Math.PI / 6; return `<line x1="${f1(x + Math.cos(a) * r * .3)}" y1="${f1(y + Math.sin(a) * r * .3)}" x2="${f1(x + Math.cos(a) * r)}" y2="${f1(y + Math.sin(a) * r)}" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/>`; }).join("")}<circle cx="${x}" cy="${y}" r="2" fill="#fff"/></g>`;
  // feu de joie sur la colline (dehors) : base en (x, y)
  NT.bonfire = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${NT.glow(0, -8, 26, "#ff9a3a", .45)}<path d="M-12 0 L12 -4 M-12 -4 L12 0" stroke="#4a2e1a" stroke-width="3"/><path class="nt-fire" d="M-9 -2 C-11 -12 -4 -16 -3 -26 C1 -18 4 -20 3 -30 C10 -20 11 -10 9 -2 Z" fill="#ff7a1a"/><path class="nt-fire" style="animation-delay:-.3s" d="M-4 -2 C-5 -9 0 -12 1 -18 C4 -12 6 -8 4 -2 Z" fill="#ffd36a"/></g>`;

  // ------------------------------------------------------------------ la base
  const base = {
    wall: (c) => {
      const code = c.nat, cols = NT.cols(c, code);
      let o = NT.pennants(cols, 260, 2340, 40, 24);
      // cocardes au bout des fanions et au-dessus des étagères
      o += NT.rosette(764, 57, 12, cols) + NT.rosette(1866, 58, 12, cols);
      // deux drapeaux croisés au-dessus de l'horloge, noués par une cocarde
      // (les mâts se croisent derrière l'horloge, les drapeaux flottent vers l'extérieur)
      o += `<g transform="rotate(40 1562 236)">${NT.pole(c, code, 1562, 236, 150, 54, 36, 0)}</g>`;
      o += `<g transform="rotate(-40 1562 236) translate(3124 0) scale(-1 1)">${NT.pole(c, code, 1562, 236, 150, 54, 36, 1.2)}</g>`;
      o += NT.rosette(1562, 184, 11, cols, true);
      // un drapeau sur l'étagère de droite
      o += NT.pole(c, code, 1990, 470, 96, 50, 33, .6);
      return o;
    },
    mantel: (c) => {
      const code = c.nat, cols = NT.cols(c, code);
      // guirlande de petits drapeaux le long de la cheminée + cocarde sur le manteau
      return NT.miniFlags(c, code, 1428, 1698, 330, 10, 11, 16, 11) + NT.rosette(1562, 380, 13, cols);
    },
    front: (c) => {
      const code = c.nat, cols = NT.cols(c, code);
      // petits drapeaux sur la table, plantés dans un bouchon de liège
      let o = `<g><ellipse cx="1452" cy="630" rx="9" ry="3" fill="rgba(0,0,0,.25)"/><rect x="1446" y="620" width="12" height="9" rx="2" fill="#b98a55"/>`
        + NT.pole(c, code, 1449, 622, 52, 30, 20, .2) + NT.pole(c, code, 1456, 622, 40, 24, 16, .9) + `</g>`;
      // serpentins aux couleurs sur la table, confettis sur le tapis (pas de noir : on dirait des insectes)
      const lite = cols.filter(k => !/^#(000|000000|111|222)$/i.test(k)).map(k => /^#fff(fff)?$/i.test(k) ? "#f3f3f3" : k);
      const curl = (x, y, col, k) => `<path d="M${x} ${y} q5 -7 10 0 t10 0 t10 0" stroke="${col}" stroke-width="2.6" fill="none" transform="rotate(${f1(NT.R(k) * 30 - 15)} ${x} ${y})" stroke-linecap="round"/>`;
      o += [[1478, 641], [1700, 645]].map(([x, y], i) => curl(x, y, lite[i % lite.length], i)).join("");
      o += Array.from({ length: 22 }, (_, i) => { const x = f1(1150 + NT.R(i + 11) * 700), y = f1(682 + NT.R(i + 21) * 30); return `<rect x="${x}" y="${y}" width="6" height="3.5" fill="${lite[i % lite.length]}" transform="rotate(${f1(NT.R(i + 5) * 180)} ${x} ${y})"/>`; }).join("");
      return o;
    },
    window: (c) => {
      const code = c.nat;
      // le drapeau planté dehors, au bord de la fenêtre (il sort de derrière le rideau)
      let o = `<g transform="rotate(-28 1006 396)"><rect x="1004.5" y="246" width="3" height="150" fill="#ddd"/><circle cx="1006" cy="244" r="3" fill="#d8b46a"/><g class="nt-wave" style="animation-delay:-.4s">${NT.flag(c, code, 946, 249, 58, 39)}</g></g>`;
      // la nuit : feux d'artifice au loin
      if (c.per === "night" || c.per === "dusk") { const cols = NT.cols(c, code).concat(["#ffd36a"]); o += [[850, 175, 24], [930, 205, 18], [880, 240, 14]].map(([x, y, r], i) => NT.firework(x, y, r, cols[i % cols.length] === "#000000" ? "#ffd36a" : cols[i % cols.length], i * 1.1)).join(""); }
      return o;
    },
  };
  const css = `.nt-wave{transform-box:fill-box;transform-origin:0 50%;animation:ntwave 2.8s ease-in-out infinite alternate}
@keyframes ntwave{from{transform:skewY(-4deg) scaleX(.96)}to{transform:skewY(3deg) scaleX(1)}}
.nt-flap{transform-box:fill-box;transform-origin:50% 0;animation:ntflap 3.4s ease-in-out infinite alternate}
@keyframes ntflap{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}
.nt-burst{opacity:0;animation:ntburst 3.3s ease-out infinite}
@keyframes ntburst{0%{opacity:0;transform:scale(.2)}8%{opacity:1}55%{opacity:.8;transform:scale(1)}80%,100%{opacity:0;transform:scale(1.1)}}
.nt-fire{transform-box:fill-box;transform-origin:50% 100%;animation:flick .6s ease-in-out infinite alternate}
.nt-glow{animation:ntglow 2.2s ease-in-out infinite alternate}
@keyframes ntglow{from{opacity:.22}to{opacity:.34}}
.nt-swing{transform-box:fill-box;transform-origin:50% 0;animation:ntflap 4.5s ease-in-out infinite alternate}
.nt-jet{animation:ntjet 9s linear infinite}
@keyframes ntjet{from{transform:translateX(-260px)}to{transform:translateX(260px)}}
.salon.still .nt-wave,.salon.still .nt-flap,.salon.still .nt-burst,.salon.still .nt-fire,.salon.still .nt-glow,.salon.still .nt-swing,.salon.still .nt-jet{animation:none}
.salon.still .nt-burst{opacity:.8}`;
  const defs = `<defs><filter id="ntBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>`;
  const greet = (code, say) => {
    const n = NT.N[code] || [code, ""];
    const head = code === "MA" ? "Bonne fête du Trône au Maroc !" : code === "HT" ? "Bonne fête du Drapeau à Haïti !" : code === "QC" ? "Bonne Fête nationale du Québec !" : `Bonne fête nationale ${n[1]} !`;
    return head + " " + (say || "Le salon a sorti les drapeaux.");
  };
  FETES2D["nat"] = { replaces: true, css, greet: (c) => greet(c.nat, ""),
    wall: (c) => defs + base.wall(c), mantel: base.mantel, front: base.front, window: base.window };

  // ------------------------------------------------------------------ la touche de chaque pays
  const T = {};
  // Belgique : des gaufres saupoudrées de sucre et un ballotin de pralines
  T.BE = { say: "Des gaufres et des pralines attendent sur la table.",
    front: () => NT.plate(1675, 632, 30) + [[-12, -5], [10, -6], [-1, -12]].map(([dx, dy]) => `<g transform="translate(${1675 + dx} ${628 + dy}) skewX(-12)"><rect x="-13" y="-6" width="26" height="11" rx="2" fill="#d9a24e"/>${[-8, -2.5, 3, 8.5].map(x => `<rect x="${x - 1.6}" y="-5" width="3.2" height="9" fill="#b97a2e" opacity=".5"/>`).join("")}<rect x="-13" y="-6" width="26" height="3" fill="#fbf6ea" opacity=".85"/></g>`).join(""),
    mantel: () => `<g transform="translate(1512 318)"><path d="M-14 0 L14 0 L11 -18 L-11 -18 Z" fill="#f2e6d0"/><path d="M-11 -18 L0 -24 L11 -18" fill="#e6d6b8"/><rect x="-14" y="-10" width="28" height="3" fill="#b8862b"/><circle cx="0" cy="-20" r="3" fill="#b8862b"/></g>` };
  // Suisse : feux du 1er août sur la colline, lampions, edelweiss et petit pain du 1er août
  T.CH = { say: "Les feux du 1er août brûlent sur la colline, et les lampions sont accrochés.",
    window: () => NT.bonfire(905, 352, 1) + NT.bonfire(965, 336, .6),
    wall: () => `<path d="M1708 150 Q1746 176 1790 150" stroke="#555" stroke-width="1" fill="none"/><circle cx="1708" cy="150" r="2" fill="#8a6a45"/><circle cx="1790" cy="150" r="2" fill="#8a6a45"/>` + NT.lantern(1726, 182, 13, "#DA291C", "#fff") + `<rect x="1723" y="174" width="6" height="16" fill="#fff"/><rect x="1718" y="179" width="16" height="6" fill="#fff"/>` + NT.lantern(1768, 178, 11, "#f4f1ea", "#DA291C"),
    mantel: () => `<g transform="translate(860 400)">${NT.pot(0, 0, 26, 20, "#9a5a34")}${[[-6, -34], [5, -38], [0, -28]].map(([x, y], i) => NT.stem(0, -20, x, y, "#7a8f6a", 1.6) + NT.flower(x, y, 7, "#f2f2ea", "#e8c94a", 8, i)).join("")}</g>`,
    front: () => `<g transform="translate(1678 630)"><ellipse cx="0" cy="0" rx="22" ry="6" fill="rgba(0,0,0,.2)"/><ellipse cx="0" cy="-8" rx="21" ry="12" fill="#c7863f"/><path d="M-10 -14 L10 -2 M10 -14 L-10 -2" stroke="#e9c58a" stroke-width="3"/><rect x="-1" y="-44" width="2" height="34" fill="#6b4a2b"/><g>${'<rect x="1" y="-44" width="18" height="13" fill="#DA291C"/><rect x="8.4" y="-41.5" width="3.2" height="8" fill="#fff"/><rect x="6" y="-39.1" width="8" height="3.2" fill="#fff"/>'}</g></g>` };
  // Luxembourg : un bouquet de roses et du crémant
  T.LU = { say: "Des roses sur le rebord de la fenêtre et du crémant sur la table.",
    mantel: () => `<g>${NT.vase(870, 400, 18, 30)}${[[-10, -52], [0, -60], [10, -50], [-4, -44]].map(([x, y], i) => NT.stem(870, 372, 870 + x, 400 + y, "#3f7d4f", 1.6) + `<circle cx="${870 + x}" cy="${400 + y}" r="6" fill="${i % 2 ? "#d8335a" : "#f08aa5"}"/><path d="M${866 + x} ${400 + y} q4 -4 8 0" stroke="rgba(0,0,0,.25)" fill="none"/>`).join("")}</g>`,
    front: () => `<g transform="translate(1680 632)"><rect x="-7" y="-50" width="14" height="40" rx="5" fill="#25402a"/><rect x="-4" y="-64" width="8" height="16" fill="#25402a"/><rect x="-5" y="-68" width="10" height="7" fill="#d9c27a"/><rect x="-7" y="-36" width="14" height="12" fill="#efe6cf"/><rect x="-7" y="-10" width="14" height="10" fill="#25402a"/></g>` + [1650, 1712].map(x => `<g transform="translate(${x} 634)"><path d="M-6 -36 L6 -36 L3 -16 L-3 -16 Z" fill="rgba(250,228,150,.75)" stroke="rgba(255,255,255,.6)"/><line x1="0" y1="-16" x2="0" y2="-2" stroke="rgba(255,255,255,.7)" stroke-width="2"/><line x1="-6" y1="-1" x2="6" y2="-1" stroke="rgba(255,255,255,.7)" stroke-width="2"/></g>`).join("") };
  // Monaco : la fougasse monégasque (fleur d'oranger, anis rouge et blanc) et des œillets
  T.MC = { say: "Une fougasse monégasque à la fleur d'oranger attend sur la table.",
    front: () => NT.plate(1676, 634, 32) + `<g transform="translate(1676 628)"><ellipse rx="24" ry="7" fill="#d9a65a"/><path d="M-16 -1 Q0 -8 16 -1 M-12 3 Q0 -2 12 3" stroke="#b9823a" stroke-width="1.6" fill="none"/>${Array.from({ length: 22 }, (_, i) => `<circle cx="${f1((NT.R(i) - .5) * 40)}" cy="${f1((NT.R(i + 40) - .5) * 9)}" r="1.4" fill="${i % 2 ? "#CE1126" : "#fff"}"/>`).join("")}</g>`,
    mantel: () => `<g>${NT.vase(868, 400, 16, 28)}${[[-9, -50], [0, -56], [9, -48], [4, -42]].map(([x, y], i) => NT.stem(868, 374, 868 + x, 400 + y, "#5b8f6a", 1.5) + `<circle cx="${868 + x}" cy="${400 + y}" r="5.5" fill="${i % 2 ? "#fff" : "#CE1126"}" stroke="${i % 2 ? "#CE1126" : "#fff"}" stroke-width="1" stroke-dasharray="2 1.5"/>`).join("")}</g>` };
  // Québec : feu de la Saint-Jean dehors, iris versicolore, fanions fleurdelisés
  const lys = (x, y, s, col) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -10 C3 -6 3 -2 0 2 C-3 -2 -3 -6 0 -10 Z M-1 2 C-6 0 -9 -4 -7 -7 C-4 -6 -2 -3 -1 1 Z M1 2 C6 0 9 -4 7 -7 C4 -6 2 -3 1 1 Z M-5 3 L5 3 L5 5 L-5 5 Z M-1 5 L-3 9 L0 8 L3 9 L1 5 Z" fill="${col}"/>`;
  T.QC = { say: "Le feu de la Saint-Jean brûle dehors, et un iris versicolore fleurit au salon.",
    window: () => NT.bonfire(915, 350, 1.1),
    // une fleur de lys blanche sur chaque fanion bleu de la guirlande
    wall: () => { let o = ""; for (let x = 282, k = 0; x < 2327; x += 44, k++) { if (k % 2) continue; const t = (x - 260) / 2080, y = 40 + 96 * t * (1 - t); o += `<g class="nt-flap" style="animation-delay:${-k * .37}s">${lys(x, f1(y + 10), .75, "#fff")}</g>`; } return o; },
    front: () => `<g transform="translate(872 652)">${NT.pot(0, 0, 34, 28, "#8a5a3a")}${[[-14, -86], [-2, -96], [12, -82]].map(([x, y]) => NT.stem(0, -28, x, y, "#4f8a4a", 2) + `<g transform="translate(${x} ${y})"><ellipse cx="-5" cy="4" rx="5" ry="8" fill="#5a4ab8" transform="rotate(-35 -5 4)"/><ellipse cx="5" cy="4" rx="5" ry="8" fill="#5a4ab8" transform="rotate(35 5 4)"/><ellipse cx="0" cy="-3" rx="3.5" ry="7" fill="#7d6ad6"/><path d="M-3 6 l3 -4 l3 4" stroke="#f2d04a" stroke-width="1.2" fill="none"/></g>`).join("")}${NT.leaf(-4, -30, 46, -100, "#4f8a4a")}${NT.leaf(4, -30, 40, -75, "#5b9a55")}</g>` };
  // Canada : feuilles d'érable sur la cheminée, sirop d'érable et crêpes
  const maple = (x, y, s, col, r = 0) => `<path transform="translate(${x} ${y}) rotate(${r}) scale(${s})" d="M0 -10 L2 -5 L5 -6 L4 -1 L8 -3 L7 0 L9 1 L4 4 L5 6 L1 5 L1 10 L-1 10 L-1 5 L-5 6 L-4 4 L-9 1 L-7 0 L-8 -3 L-4 -1 L-5 -6 L-2 -5 Z" fill="${col}"/>`;
  T.CA = { say: "Des feuilles d'érable sur la cheminée, et du sirop d'érable avec les crêpes.",
    mantel: () => [1440, 1470, 1500, 1625, 1655, 1688].map((x, i) => maple(x, 309, 1.15, i % 2 ? "#c8102e" : "#e0592a", (i - 2.5) * 9)).join(""),
    front: () => NT.plate(1676, 636, 28) + Array.from({ length: 5 }, (_, i) => `<ellipse cx="1676" cy="${632 - i * 3.5}" rx="${21 - (i % 2)}" ry="5.5" fill="${i % 2 ? "#e2b36a" : "#d49a52"}"/>`).join("") + `<path d="M1664 615 q12 -4 24 0 q-3 8 -12 9 q-9 -1 -12 -9 Z" fill="#a8521a" opacity=".85"/>`
      + `<g transform="translate(1716 636)"><path d="M-9 0 L9 0 L9 -26 Q9 -32 3 -34 L3 -42 L-3 -42 L-3 -34 Q-9 -32 -9 -26 Z" fill="rgba(170,90,30,.85)" stroke="rgba(255,255,255,.45)"/><rect x="-4" y="-47" width="8" height="6" fill="#c8102e"/>${maple(0, -16, .7, "#fff")}</g>` };
  // États-Unis : guirlande étoilée et pique-nique (tarte aux pommes, pastèque, panier)
  T.US = { say: "Guirlande étoilée et pique-nique : tarte aux pommes et pastèque sur la table.",
    wall: () => `<path d="M1040 216 Q1240 248 1430 216" stroke="#c9b48a" stroke-width="1" fill="none"/>` + Array.from({ length: 9 }, (_, i) => { const t = (i + .5) / 9, x = 1040 + 390 * t, y = 216 + 64 * t * (1 - t); return `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x)}" y2="${f1(y + 6)}" stroke="#c9b48a"/>` + NT.star(x, y + 13, 8, ["#B22234", "#f4f4f4", "#3C3B6E"][i % 3]); }).join(""),
    mantel: () => `<g transform="translate(1562 322)">${[0, 1, 2, 3, 4, 5, 6, 7].map(k => { const a0 = Math.PI * k / 8, a1 = Math.PI * (k + 1) / 8; return `<path d="M0 0 L${f1(-Math.cos(a0) * 32)} ${f1(Math.sin(a0) * 22)} L${f1(-Math.cos(a1) * 32)} ${f1(Math.sin(a1) * 22)} Z" fill="${k % 2 ? "#f4f4f4" : "#B22234"}"/>`; }).join("")}<path d="M-14 0 A14 10 0 0 0 14 0 Z" fill="#3C3B6E"/>${NT.star(0, 4, 4, "#fff")}</g>`,
    front: () => NT.plate(1672, 636, 30) + `<g transform="translate(1672 628)"><ellipse rx="22" ry="7" fill="#c98a3c"/>${[-12, -4, 4, 12].map(x => `<line x1="${x}" y1="-6" x2="${x + 3}" y2="6" stroke="#e6b86a" stroke-width="2.4"/>`).join("")}<line x1="-20" y1="0" x2="20" y2="0" stroke="#e6b86a" stroke-width="2.4"/></g>`
      + `<g transform="translate(1715 638)"><path d="M-16 0 A16 16 0 0 1 16 0 Z" fill="#2f8a3a"/><path d="M-13 0 A13 13 0 0 1 13 0 Z" fill="#e8394b"/>${[-6, 0, 6].map(x => `<ellipse cx="${x}" cy="-6" rx="1" ry="1.8" fill="#222"/>`).join("")}</g>`
      + `<g transform="translate(868 654)"><path d="M-30 -30 L30 -30 L26 0 L-26 0 Z" fill="#b8874f"/>${[-22, -11, 0, 11, 22].map(x => `<line x1="${x}" y1="-30" x2="${x * .87}" y2="0" stroke="#946535" stroke-width="2"/>`).join("")}<path d="M-24 -30 Q0 -64 24 -30" stroke="#946535" stroke-width="4" fill="none"/><path d="M-32 -33 L32 -33 L28 -24 L-28 -24 Z" fill="#c62f3c"/>${[-24, -12, 0, 12, 24].map(x => `<rect x="${x - 3}" y="-33" width="6" height="9" fill="#f4f4f4" opacity=".85"/>`).join("")}</g>` };
  // Allemagne : bretzels et carte postale de la porte de Brandebourg
  T.DE = { say: "Des bretzels sur la table et une carte postale de Berlin sur la cheminée.",
    front: () => NT.plate(1676, 636, 30) + [[-10, -2, -8], [10, -4, 10]].map(([dx, dy, r]) => `<g transform="translate(${1676 + dx} ${628 + dy}) rotate(${r}) scale(.9)"><path d="M0 8 C-14 8 -16 -10 -6 -10 C2 -10 4 0 0 4 C-4 0 -2 -10 6 -10 C16 -10 14 8 0 8" stroke="#8a4a1f" stroke-width="4.5" fill="none" stroke-linecap="round"/>${[[-8, -6], [6, -7], [0, 6], [-10, 2]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="#fff"/>`).join("")}</g>`).join(""),
    mantel: () => NT.postcard(1512, 318, 40, 28, `<rect width="100" height="70" fill="#8fc0e6"/><rect y="56" width="100" height="14" fill="#9c9c8e"/><rect x="14" y="22" width="72" height="9" fill="#e7dcc2"/><rect x="18" y="16" width="64" height="7" fill="#d9ccb0"/>${[18, 30, 42, 54, 66, 78].map(x => `<rect x="${x}" y="31" width="4.5" height="25" fill="#e7dcc2"/>`).join("")}<rect x="44" y="6" width="12" height="10" fill="#4f7a6a"/>`, 5) };
  // Italie : les Frecce Tricolori dans le ciel, une assiette caprese et un pot de basilic
  T.IT = { say: "Regarde le ciel : la patrouille trace le tricolore. Et une caprese sur la table.",
    window: (c) => c.per === "night" ? "" : `<g class="nt-jet">${["#009246", "#f4f4f4", "#CE2B37"].map((k, i) => `<path d="M${700 + i * 0} ${190 + i * 8} Q860 ${170 + i * 8} 960 ${150 + i * 8}" stroke="${k}" stroke-width="6" fill="none" opacity=".85" stroke-linecap="round"/><path d="M960 ${147 + i * 8} l10 3 l-10 3 l2 -3 Z" fill="#cfd6de"/>`).join("")}</g>`,
    front: () => NT.plate(1676, 636, 32) + `<g transform="translate(1676 630)">${[-15, -5, 5, 15].map((x, i) => `<ellipse cx="${x}" cy="${i % 2 ? -2 : 0}" rx="7" ry="3.6" fill="${i % 2 ? "#f6f3ea" : "#d93a2e"}"/>`).join("")}${[-10, 0, 10].map(x => NT.leaf(x, -4, 9, -30, "#2f8a3a")).join("")}</g>`,
    mantel: () => `<g transform="translate(866 400)">${NT.pot(0, 0, 26, 20, "#b5653a")}${Array.from({ length: 9 }, (_, i) => NT.leaf(f1((NT.R(i) - .5) * 18), f1(-24 - NT.R(i + 9) * 18), 11, f1(-160 + NT.R(i + 3) * 140), i % 2 ? "#3f9a45" : "#2f8a3a")).join("")}</g>` };
  // Espagne : des œillets rouges et une coupe d'oranges
  T.ES = { say: "Des œillets rouges à la fenêtre et des oranges sur la table.",
    mantel: () => `<g>${NT.vase(870, 400, 18, 30)}${[[-11, -52], [-2, -60], [8, -56], [12, -46], [-6, -44]].map(([x, y]) => NT.stem(870, 372, 870 + x, 400 + y, "#5b8f6a", 1.5) + `<circle cx="${870 + x}" cy="${400 + y}" r="6" fill="#c8102e" stroke="#e8394b" stroke-width="1.4" stroke-dasharray="2 1.4"/>`).join("")}</g>`,
    front: () => `<g transform="translate(1678 634)"><path d="M-26 -10 Q0 10 26 -10 Z" fill="#c9a26b"/><ellipse cy="-10" rx="26" ry="5" fill="#b38b55"/>${[[-14, -16], [0, -18], [14, -16], [-7, -26], [7, -26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#f28a1a"/><circle cx="${x - 2}" cy="${y - 2}" r="2.5" fill="rgba(255,255,255,.3)"/>`).join("")}${NT.leaf(5, -32, 12, -40, "#3f7d4f")}</g>` };
  // Portugal : azulejos au mur, manjerico (basilic et œillet en papier), pastéis de nata
  const azulejo = (x, y, s) => `<g transform="translate(${x} ${y})">${[0, 1].map(i => [0, 1, 2].map(j => `<g transform="translate(${i * s} ${j * s})"><rect width="${s}" height="${s}" fill="#f4f6f8" stroke="#c9d2dc" stroke-width=".8"/><circle cx="${s / 2}" cy="${s / 2}" r="${s * .2}" fill="none" stroke="#1d4f9c" stroke-width="2"/>${[0, 1, 2, 3].map(k => `<path d="M${s / 2} ${s / 2} m0 ${-s * .22} q${s * .14} ${-s * .14} 0 ${-s * .26} q${-s * .14} ${s * .12} 0 ${s * .26}" fill="#2d63b5" transform="rotate(${k * 90} ${s / 2} ${s / 2})"/>`).join("")}${[[0, 0], [s, 0], [0, s], [s, s]].map(([a, b]) => `<circle cx="${a}" cy="${b}" r="${s * .12}" fill="#1d4f9c"/>`).join("")}</g>`).join("")).join("")}<rect width="${2 * s}" height="${3 * s}" fill="none" stroke="#8a6a45" stroke-width="3"/></g>`;
  T.PT = { say: "Un manjerico sur le rebord de la fenêtre et des pastéis de nata sur la table.",
    wall: () => azulejo(1722, 180, 26),
    mantel: () => `<g transform="translate(868 400)">${NT.pot(0, 0, 24, 18, "#c46a3a")}<circle cx="0" cy="-30" r="13" fill="#3f8a3a"/>${Array.from({ length: 14 }, (_, i) => `<circle cx="${f1(Math.cos(i * 2.4) * 10)}" cy="${f1(-30 + Math.sin(i * 2.4) * 10)}" r="3.4" fill="${i % 2 ? "#5aa34a" : "#2f7a32"}"/>`).join("")}<line x1="4" y1="-28" x2="10" y2="-52" stroke="#6b4a2b" stroke-width="1.3"/><circle cx="10" cy="-55" r="5.5" fill="#d8233a" stroke="#ff6a7a" stroke-width="1.4" stroke-dasharray="2 1.3"/><rect x="11" y="-50" width="11" height="8" fill="#f3ecdc" transform="rotate(10 11 -50)"/></g>`,
    front: () => NT.plate(1676, 636, 30) + [[-13, -3], [0, -6], [13, -3], [-6, 3], [7, 3]].map(([dx, dy]) => `<g transform="translate(${1676 + dx} ${630 + dy})"><path d="M-7 -3 L7 -3 L5 3 L-5 3 Z" fill="#c98a3c"/><ellipse cy="-3" rx="7" ry="2.6" fill="#f2c45a"/><circle cx="-2" cy="-3.4" r="1.4" fill="#8a4a1f" opacity=".8"/><circle cx="2.5" cy="-2.6" r="1" fill="#8a4a1f" opacity=".7"/></g>`).join("") };
  // Pays-Bas : tulipes, tompouce à glaçage orange, guirlande orange
  T.NL = { say: "Tout est orange : tulipes à la fenêtre et tompouce sur la table.",
    wall: () => NT.pennants(["#ff7a00", "#ff9a2e"], 760, 1880, 92, 18, 40, 22),
    mantel: () => `<g>${NT.vase(870, 400, 18, 30, "rgba(190,215,240,.6)")}${[[-12, -54, "#ff7a00"], [-4, -62, "#e8233a"], [5, -58, "#ffcf33"], [13, -50, "#ff7a00"], [0, -46, "#e8233a"]].map(([x, y, k]) => NT.stem(870, 372, 870 + x, 400 + y + 6, "#4f8a4a", 1.8) + `<path d="M${864 + x} ${400 + y} q6 4 12 0 l-1 8 q-5 4 -10 0 Z" fill="${k}"/><path d="M${870 + x} ${400 + y + 1} l0 7" stroke="rgba(0,0,0,.15)"/>`).join("")}${NT.leaf(866, 380, 26, -110, "#4f8a4a")}${NT.leaf(874, 380, 24, -70, "#5b9a55")}</g>`,
    front: () => NT.plate(1676, 636, 30) + [[-10, -3], [10, -2]].map(([dx, dy]) => `<g transform="translate(${1676 + dx} ${630 + dy})"><rect x="-10" y="-11" width="20" height="4" fill="#ff7a00"/><rect x="-10" y="-7" width="20" height="3" fill="#e8c88a"/><rect x="-10" y="-4" width="20" height="5" fill="#fff3c8"/><rect x="-10" y="1" width="20" height="3" fill="#e8c88a"/></g>`).join("") };
  // Pologne : longue bannière blanc-rouge et un bouquet rouge et blanc
  T.PL = { say: "Une grande bannière blanc et rouge, comme aux fenêtres de tout le pays.",
    wall: () => `<path d="M1722 98 L1751 84 L1780 98" stroke="#c9b48a" fill="none"/><circle cx="1751" cy="83" r="2.2" fill="#8a6a45"/><rect x="1720" y="96" width="62" height="4" rx="2" fill="#6b4a2b"/><circle cx="1720" cy="98" r="3.5" fill="#d8b46a"/><circle cx="1782" cy="98" r="3.5" fill="#d8b46a"/><g class="nt-swing"><path d="M1726 100 L1776 100 L1776 196 L1726 196 Z" fill="#f6f6f6"/><path d="M1726 196 L1776 196 L1776 300 L1751 286 L1726 300 Z" fill="#DC143C"/></g>`,
    mantel: () => `<g>${NT.vase(870, 400, 18, 30)}${[[-10, -52], [0, -60], [10, -52], [-4, -44], [6, -44]].map(([x, y], i) => NT.stem(870, 372, 870 + x, 400 + y, "#3f7d4f", 1.5) + NT.flower(870 + x, 400 + y, 8, i % 2 ? "#f6f6f6" : "#DC143C", i % 2 ? "#DC143C" : "#f2d04a", 6, i)).join("")}</g>` };
  // Grèce : un olivier en pot, un bol d'olives, frise grecque bleue et blanche
  T.GR = { say: "Un olivier au salon, des olives sur la table, et du bleu et blanc partout.",
    mantel: () => `<g transform="translate(1428 342)">${Array.from({ length: 27 }, (_, i) => `<path d="M${i * 10} 0 v-6 h7 v4 h-4" stroke="#0D5EAF" stroke-width="1.8" fill="none"/>`).join("")}</g>`,
    front: () => `<g transform="translate(872 654)">${NT.pot(0, 0, 36, 30, "#c8b8a0")}<path d="M0 -30 C-2 -50 4 -60 -2 -80 M0 -56 C8 -64 14 -66 18 -80" stroke="#6b5a45" stroke-width="4" fill="none"/>${Array.from({ length: 34 }, (_, i) => NT.leaf(f1(-24 + NT.R(i) * 48), f1(-118 + NT.R(i + 50) * 46), 13, f1(NT.R(i + 7) * 360), i % 3 ? "#7d9a6a" : "#a9bd98")).join("")}${[[-10, -92], [8, -104], [14, -86]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="3.4" fill="#3d3a2a"/>`).join("")}</g>`
      + `<g transform="translate(1676 634)"><path d="M-18 -10 Q0 8 18 -10 Z" fill="#f4f4f4"/><path d="M-18 -10 Q0 8 18 -10" stroke="#0D5EAF" stroke-width="2" fill="none"/>${[[-9, -12], [-2, -14], [6, -12], [12, -13], [2, -17], [-6, -17]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="3.6" ry="2.7" fill="${i % 2 ? "#556b2f" : "#3d3a2a"}"/>`).join("")}</g>` };
  // Maroc : service à thé (théière et verres de thé à la menthe), roses et zellige
  const zellige = (x, y, s) => `<g transform="translate(${x} ${y})"><rect width="${s * 2}" height="${s * 3}" fill="#f2ead8"/>${[0, 1].map(i => [0, 1, 2].map(j => { const cx = i * s + s / 2, cy = j * s + s / 2; return `<rect x="${cx - s * .3}" y="${cy - s * .3}" width="${s * .6}" height="${s * .6}" fill="${(i + j) % 2 ? "#1f6f5a" : "#2a5a9c"}"/><rect x="${cx - s * .3}" y="${cy - s * .3}" width="${s * .6}" height="${s * .6}" fill="${(i + j) % 2 ? "#1f6f5a" : "#2a5a9c"}" transform="rotate(45 ${cx} ${cy})"/><circle cx="${cx}" cy="${cy}" r="${s * .14}" fill="#e3b23c"/>`; }).join("")).join("")}<rect width="${s * 2}" height="${s * 3}" fill="none" stroke="#8a6a45" stroke-width="3"/></g>`;
  T.MA = { say: "Le thé à la menthe est servi, et un bouquet de roses est à la fenêtre.",
    wall: () => zellige(1722, 180, 26),
    front: () => `<g transform="translate(1672 634)"><ellipse rx="30" ry="7" fill="#c9c9c9"/><ellipse cy="-1" rx="27" ry="5.5" fill="#e2e2e2"/><path d="M-10 -2 Q-14 -18 -6 -24 L6 -24 Q14 -18 10 -2 Z" fill="#cfd3d8"/><path d="M-5 -24 L5 -24 L3 -32 L-3 -32 Z" fill="#b9bec4"/><circle cy="-34" r="2.6" fill="#b9bec4"/><path d="M10 -12 Q20 -14 24 -24" stroke="#b9bec4" stroke-width="3" fill="none"/><path d="M-10 -18 Q-20 -14 -12 -6" stroke="#b9bec4" stroke-width="2" fill="none"/>${[-22, 16, 24].map((x, i) => `<g transform="translate(${x} ${i ? -1 : 0})"><path d="M-4 -14 L4 -14 L3 0 L-3 0 Z" fill="rgba(200,120,40,.7)" stroke="rgba(255,255,255,.5)"/><rect x="-3" y="-11" width="6" height="2" fill="#d8b04a"/><circle cx="0" cy="-15" r="2.4" fill="#3f9a45"/></g>`).join("")}</g>`,
    mantel: () => `<g>${NT.vase(870, 400, 18, 30)}${[[-10, -52], [0, -60], [10, -52], [-4, -44], [6, -46]].map(([x, y], i) => NT.stem(870, 372, 870 + x, 400 + y, "#3f7d4f", 1.5) + `<circle cx="${870 + x}" cy="${400 + y}" r="6" fill="${i % 2 ? "#e98aa8" : "#d4567e"}"/><path d="M${866 + x} ${400 + y} q4 -4 8 0" stroke="rgba(0,0,0,.2)" fill="none"/>`).join("")}</g>` };
  // Algérie : makrout au miel et jasmin
  const jasmine = (x, y, n = 12) => `<g transform="translate(${x} ${y})">${NT.pot(0, 0, 26, 20, "#b5653a")}${Array.from({ length: 10 }, (_, i) => NT.leaf(f1(-14 + NT.R(i + 3) * 28), f1(-24 - NT.R(i + 13) * 26), 12, f1(NT.R(i + 23) * 360), "#2f6a36")).join("")}${Array.from({ length: n }, (_, i) => NT.flower(f1(-14 + NT.R(i + 31) * 28), f1(-28 - NT.R(i + 41) * 28), 5, "#fbfbf3", "#f2e6a0", 5, i)).join("")}</g>`;
  T.DZ = { say: "Un jasmin fleurit à la fenêtre, et des makrouts au miel attendent sur la table.",
    mantel: () => jasmine(868, 400),
    front: () => NT.plate(1676, 636, 30) + [[-13, -3], [0, -5], [13, -3], [-6, 2], [7, 2], [0, -11]].map(([dx, dy]) => `<g transform="translate(${1676 + dx} ${630 + dy})"><path d="M-7 0 L0 -4 L7 0 L0 4 Z" fill="#c9862e"/><path d="M-3 -1 L3 1" stroke="#7a4a1a" stroke-width="1"/><path d="M-6 0 L0 -3.4 L6 0" stroke="rgba(255,220,140,.7)" fill="none"/></g>`).join("") };
  // Tunisie : jasmin (machmoum), carte postale d'une porte bleue, dattes
  T.TN = { say: "Du jasmin à la fenêtre, des dattes sur la table, et une carte postale d'une porte bleue.",
    mantel: () => jasmine(868, 400, 14) + NT.postcard(1508, 318, 26, 36, `<rect width="100" height="70" fill="#f4f1ea"/><path d="M28 70 L28 26 Q50 2 72 26 L72 70 Z" fill="#1f5fae"/><path d="M28 70 L28 26 Q50 2 72 26 L72 70" stroke="#e8c84a" stroke-width="3" fill="none"/>${Array.from({ length: 12 }, (_, i) => `<circle cx="${36 + (i % 4) * 9}" cy="${34 + Math.floor(i / 4) * 11}" r="1.8" fill="#111"/>`).join("")}`, 4),
    front: () => NT.plate(1676, 636, 28) + Array.from({ length: 8 }, (_, i) => `<ellipse cx="${f1(1676 + (NT.R(i) - .5) * 30)}" cy="${f1(630 - NT.R(i + 8) * 7)}" rx="6" ry="3" fill="${i % 2 ? "#6a2e16" : "#81401e"}" transform="rotate(${f1(NT.R(i + 4) * 60 - 30)} ${f1(1676 + (NT.R(i) - .5) * 30)} ${f1(630 - NT.R(i + 8) * 7)})"/>`).join("") };
  // Sénégal : un petit baobab et une carafe de bissap
  T.SN = { say: "Un petit baobab au salon, et une carafe de bissap bien frais sur la table.",
    front: () => `<g transform="translate(872 654)">${NT.pot(0, 0, 40, 18, "#8a5a3a")}<path d="M-9 -18 Q-11 -44 -6 -56 L6 -56 Q11 -44 9 -18 Z" fill="#9c8470"/><path d="M-6 -56 L-22 -72 M-3 -56 L-8 -78 M3 -56 L10 -80 M6 -56 L24 -70" stroke="#9c8470" stroke-width="3.5" stroke-linecap="round"/>${[[-22, -76], [-8, -84], [10, -86], [24, -74], [0, -80]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="10" ry="5" fill="${i % 2 ? "#6f9a4a" : "#5a8a3a"}"/>`).join("")}</g>`
      + `<g transform="translate(1680 636)"><path d="M-10 0 L10 0 Q12 -16 5 -24 L5 -34 L-5 -34 L-5 -24 Q-12 -16 -10 0 Z" fill="rgba(150,10,40,.85)" stroke="rgba(255,255,255,.5)"/>${[22, 34].map(x => `<path d="M${x - 5} -18 L${x + 5} -18 L${x + 4} 0 L${x - 4} 0 Z" fill="rgba(150,10,40,.8)" stroke="rgba(255,255,255,.5)"/>`).join("")}</g>` };
  // Côte d'Ivoire : éléphant sculpté et corbeille de fruits (ananas, mangues)
  const elephant = (x, y, s, col = "#6b4a2b") => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="-16" rx="16" ry="11" fill="${col}"/><rect x="-12" y="-10" width="5" height="10" fill="${col}"/><rect x="-3" y="-10" width="5" height="10" fill="${col}"/><rect x="5" y="-10" width="5" height="10" fill="${col}"/><circle cx="16" cy="-20" r="8" fill="${col}"/><ellipse cx="13" cy="-20" rx="5" ry="7" fill="rgba(0,0,0,.18)"/><path d="M22 -18 Q27 -8 23 0" stroke="${col}" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M20 -15 l5 2" stroke="#f3ecdc" stroke-width="1.6"/><circle cx="18" cy="-23" r="1" fill="#111"/><path d="M-16 -16 q-4 4 -3 8" stroke="${col}" stroke-width="1.5" fill="none"/></g>`;
  T.CI = { say: "Un éléphant sculpté veille sur la cheminée, et une corbeille de fruits est servie.",
    mantel: () => elephant(1506, 318, .95),
    front: () => `<g transform="translate(1678 634)"><path d="M-28 -10 Q0 10 28 -10 Z" fill="#b38b55"/><ellipse cy="-10" rx="28" ry="5" fill="#9c7444"/><ellipse cx="-8" cy="-26" rx="9" ry="14" fill="#d9a22a"/>${Array.from({ length: 8 }, (_, i) => `<path d="M${-14 + (i % 4) * 4} ${-34 + Math.floor(i / 4) * 9} l4 4 l4 -4" stroke="#8a6014" fill="none"/>`).join("")}${[-14, -10, -6, -2].map((x, i) => `<path d="M-8 -40 Q${x} -54 ${x - 4 + i * 2} -58" stroke="#3f8a3a" stroke-width="3" fill="none"/>`).join("")}<ellipse cx="10" cy="-17" rx="9" ry="6.5" fill="#f2a02a"/><ellipse cx="20" cy="-14" rx="8" ry="6" fill="#e87a2a"/><ellipse cx="12" cy="-19" rx="3" ry="1.6" fill="#7fae3a"/></g>` };
  // Cameroun : un pagne imprimé aux couleurs du pays sur le canapé et des plantains frits
  T.CM = { say: "Le pagne de la fête est posé sur le canapé, et des plantains frits attendent sur la table.",
    front: () => `<g transform="translate(940 598)"><path d="M-14 0 Q20 -6 56 2 L52 70 Q20 62 -10 72 Z" fill="#CE1126"/>${[[0, 10], [26, 8], [12, 30], [38, 30], [0, 50], [26, 50]].map(([x, y], i) => `<circle cx="${x + 6}" cy="${y + 8}" r="7" fill="${i % 2 ? "#FCD116" : "#007A5E"}"/><circle cx="${x + 6}" cy="${y + 8}" r="3" fill="${i % 2 ? "#007A5E" : "#FCD116"}"/>`).join("")}<path d="M-14 0 Q20 -6 56 2" stroke="#FCD116" stroke-width="3" fill="none"/><path d="M-10 72 Q20 62 52 70" stroke="#FCD116" stroke-width="3" fill="none"/></g>`
      + NT.plate(1676, 636, 30) + Array.from({ length: 9 }, (_, i) => `<ellipse cx="${f1(1676 + (NT.R(i + 2) - .5) * 34)}" cy="${f1(631 - NT.R(i + 12) * 6)}" rx="5" ry="3" fill="${i % 2 ? "#e0a030" : "#c9801e"}" stroke="#8a4a14" stroke-width=".6"/>`).join("") };
  // Haïti : un hibiscus (choublak) et une guirlande de petits drapeaux, comme au défilé
  T.HT = { say: "Des petits drapeaux partout, comme au défilé, et un hibiscus à la fenêtre.",
    wall: (c) => NT.miniFlags(c, "HT", 1030, 1430, 222, 14, 10, 22, 14),
    mantel: () => `<g transform="translate(868 400)">${NT.pot(0, 0, 26, 20, "#b5653a")}${Array.from({ length: 8 }, (_, i) => NT.leaf(f1(-14 + NT.R(i + 5) * 28), f1(-24 - NT.R(i + 15) * 22), 13, f1(NT.R(i + 25) * 360), "#2f6a36")).join("")}${[[-8, -42], [9, -36]].map(([x, y]) => NT.flower(x, y, 11, "#e0263a", "#f7d24a", 5, .3)).join("")}</g>` };
  // Mexique : papel picado vert-blanc-rouge et une piñata étoilée
  const picado = (x0, x1, y0, cols) => { let o = `<path d="M${x0} ${y0} Q${(x0 + x1) / 2} ${y0 + 30} ${x1} ${y0}" stroke="#ddd" stroke-width="1" fill="none"/>`; const n = Math.floor((x1 - x0) / 34);
    for (let k = 0; k < n; k++) { const t = (k + .5) / n, x = x0 + (x1 - x0) * t, y = y0 + 60 * t * (1 - t); o += `<g class="nt-flap" style="animation-delay:${-k * .3}s"><path d="M${f1(x - 14)} ${f1(y)} h28 v30 l-4 4 l-4 -4 l-4 4 l-4 -4 l-4 4 l-4 -4 l-4 4 l-4 -4 Z" fill="${cols[k % cols.length]}" opacity=".95"/><circle cx="${f1(x)}" cy="${f1(y + 12)}" r="5" fill="#2a2228" opacity=".55"/>${[[-8, 6], [8, 6], [-8, 20], [8, 20], [0, 24]].map(([a, b]) => `<path d="M${f1(x + a - 2)} ${f1(y + b)} l2 -2 l2 2 l-2 2 Z" fill="#2a2228" opacity=".55"/>`).join("")}</g>`; } return o; };
  T.MX = { say: "¡Viva México ! Papel picado aux couleurs du drapeau et piñata étoilée.",
    wall: () => picado(1030, 1440, 210, ["#006847", "#f4f4f4", "#CE1126", "#f28ab0", "#ffcf33"]) + `<line x1="1748" y1="0" x2="1748" y2="138" stroke="#ccc" stroke-width="1"/><g class="nt-swing"><g transform="translate(1748 184)"><circle r="20" fill="#ff5fa2"/>${[0, 72, 144, 216, 288].map((a, i) => `<path d="M${f1(Math.cos((a - 90 - 14) * Math.PI / 180) * 18)} ${f1(Math.sin((a - 90 - 14) * Math.PI / 180) * 18)} L${f1(Math.cos((a - 90) * Math.PI / 180) * 46)} ${f1(Math.sin((a - 90) * Math.PI / 180) * 46)} L${f1(Math.cos((a - 90 + 14) * Math.PI / 180) * 18)} ${f1(Math.sin((a - 90 + 14) * Math.PI / 180) * 18)} Z" fill="${["#ffcf33", "#2fb5a8", "#ff7a1a", "#9a5fd6", "#3fa84a"][i]}"/><path d="M${f1(Math.cos((a - 90) * Math.PI / 180) * 46)} ${f1(Math.sin((a - 90) * Math.PI / 180) * 46)} l-3 14 m3 -14 l3 13" stroke="${["#ff5fa2", "#ffcf33", "#2fb5a8", "#ff7a1a", "#9a5fd6"][i]}" stroke-width="2"/>`).join("")}<circle r="9" fill="#ffcf33"/></g></g>` };
  // Brésil : rubans vert-jaune, brigadeiros, branche d'ipê jaune
  T.BR = { say: "Rubans vert et jaune, brigadeiros sur la table et une branche d'ipê en fleur.",
    wall: () => [700, 1030, 1722, 2070].map((x, i) => { const t = (x - 260) / 2080, y = 40 + 96 * t * (1 - t); return `<g class="nt-swing" style="animation-delay:${-i}s"><path d="M${x} ${f1(y)} q10 30 -4 60 q-12 30 4 64" stroke="#009C3B" stroke-width="4" fill="none"/><path d="M${x + 5} ${f1(y)} q10 30 -4 60 q-12 30 4 58" stroke="#FFDF00" stroke-width="4" fill="none"/></g>`; }).join(""),
    front: () => NT.plate(1676, 636, 30) + [[-14, -3], [-4, -4], [6, -4], [15, -3], [-9, 2], [1, 2], [11, 2]].map(([dx, dy]) => `<g transform="translate(${1676 + dx} ${631 + dy})"><path d="M-5 0 L5 0 L4 3 L-4 3 Z" fill="#c8a26a"/><circle cy="-3" r="4.6" fill="#4a2a1a"/>${[[-2, -5], [1.5, -3], [-1, -1.5], [2, -6]].map(([a, b]) => `<rect x="${a}" y="${b}" width="1.2" height=".7" fill="#e8c88a"/>`).join("")}</g>`).join(""),
    mantel: () => `<g>${NT.vase(870, 400, 18, 30)}<path d="M870 372 Q866 340 856 322 M868 352 Q880 336 890 330" stroke="#6b4a2b" stroke-width="2.4" fill="none"/>${Array.from({ length: 16 }, (_, i) => `<circle cx="${f1(848 + NT.R(i + 60) * 46)}" cy="${f1(316 + NT.R(i + 70) * 32)}" r="4.5" fill="${i % 3 ? "#ffd21f" : "#f2b80f"}"/>`).join("")}</g>` };
  // Japon : un prunier (ume) en pot — en février, ce sont les pruniers qui fleurissent — et un service à thé
  T.JP = { say: "En février, c'est le prunier qui fleurit : un ume en pot à la fenêtre, et du thé sur la table.",
    mantel: () => `<g transform="translate(870 400)"><rect x="-26" y="-12" width="52" height="12" rx="2" fill="#3a4a6a"/><rect x="-28" y="-14" width="56" height="4" rx="1" fill="#2a3858"/><path d="M-2 -14 C-8 -30 6 -36 -4 -52 C-10 -60 -4 -66 -14 -74 M-4 -46 C6 -52 14 -50 22 -62 M-6 -32 C-16 -36 -22 -40 -26 -50" stroke="#4a3426" stroke-width="3.2" fill="none" stroke-linecap="round"/>${[[-14, -76], [-8, -64], [2, -56], [12, -54], [22, -64], [18, -58], [-26, -52], [-20, -42], [-4, -70], [6, -60]].map(([x, y], i) => NT.flower(x, y, 6, i % 3 ? "#f6c6d4" : "#fdf0f3", "#e84a6a", 5, i)).join("")}</g>`,
    front: () => `<g transform="translate(1676 636)"><ellipse rx="34" ry="7" fill="#5a3a2a"/><ellipse cy="-1" rx="31" ry="5.5" fill="#6e4a34"/><g transform="translate(-6 -2)"><ellipse cy="-10" rx="12" ry="10" fill="#2f3a3a"/><rect x="-4" y="-22" width="8" height="4" rx="1" fill="#2f3a3a"/><circle cy="-23" r="2.2" fill="#2f3a3a"/><path d="M11 -12 l8 -4" stroke="#2f3a3a" stroke-width="3"/><path d="M-10 -20 Q0 -30 10 -20" stroke="#8a6a45" stroke-width="1.6" fill="none"/></g>${[14, 25].map(x => `<path d="M${x - 5} -9 L${x + 5} -9 L${x + 4} -1 L${x - 4} -1 Z" fill="#e9e4d4"/><ellipse cx="${x}" cy="-9" rx="5" ry="1.4" fill="#9ab24a"/>`).join("")}</g>` };
  // Chine (1er octobre) : lanternes rouges et pivoines
  T.CN = { say: "Des lanternes rouges sont accrochées, et des pivoines fleurissent à la fenêtre.",
    wall: () => `<path d="M1708 140 Q1746 160 1790 140" stroke="#555" stroke-width="1" fill="none"/><circle cx="1708" cy="140" r="2" fill="#8a6a45"/><circle cx="1790" cy="140" r="2" fill="#8a6a45"/>` + [[1726, 178, 15], [1770, 176, 13]].map(([x, y, r]) => NT.lantern(x, y, r, "#d4232a", "#e3b23c", "#ff8a3a") + `<path d="M${x} ${y + r * .85 + 4} v10 M${x - 2} ${y + r * .85 + 4} v9 M${x + 2} ${y + r * .85 + 4} v9" stroke="#e3b23c" stroke-width="1"/>`).join(""),
    mantel: () => `<g>${NT.vase(870, 400, 18, 30)}${[[-10, -52], [2, -60], [11, -48]].map(([x, y], i) => NT.stem(870, 372, 870 + x, 400 + y, "#3f7d4f", 1.8) + `<circle cx="${870 + x}" cy="${400 + y}" r="9" fill="${i % 2 ? "#f4a6c0" : "#d6336c"}"/><circle cx="${870 + x}" cy="${400 + y}" r="5.5" fill="${i % 2 ? "#f8c6d6" : "#e8578a"}"/><circle cx="${870 + x}" cy="${400 + y}" r="2" fill="#f2d04a"/>`).join("")}${NT.leaf(864, 378, 18, -140, "#4f8a4a")}${NT.leaf(876, 378, 18, -40, "#4f8a4a")}</g>` };
  // Inde (15 août) : cerfs-volants dans le ciel, guirlande d'œillets d'Inde, laddous
  T.IN = { say: "Des cerfs-volants dans le ciel, une guirlande d'œillets d'Inde et des laddous sur la table.",
    window: () => `<path d="M800 392 Q870 320 935 228" stroke="rgba(255,255,255,.6)" stroke-width=".8" fill="none"/><g class="nt-swing"><g transform="translate(935 210) rotate(8)"><path d="M0 -20 L16 0 L0 20 L-16 0 Z" fill="#FF9933"/><path d="M0 -20 L16 0 L0 0 Z" fill="#fff"/><path d="M-16 0 L0 20 L0 0 Z" fill="#138808"/><line x1="0" y1="-20" x2="0" y2="20" stroke="rgba(0,0,0,.3)"/><path d="M0 20 l-4 8 l4 -2 l4 2 Z" fill="#000080"/></g></g><g transform="translate(860 160) rotate(-12) scale(.6)"><path d="M0 -20 L16 0 L0 20 L-16 0 Z" fill="#138808"/><path d="M0 -20 L-16 0 L0 0 Z" fill="#FF9933"/></g>`,
    mantel: () => `<path d="M1428 324 Q1562 360 1698 324" stroke="#5a8a3a" stroke-width="1" fill="none"/>` + Array.from({ length: 22 }, (_, i) => { const t = (i + .5) / 22, x = 1428 + 270 * t, y = 324 + 72 * t * (1 - t) + 4; return `<circle cx="${f1(x)}" cy="${f1(y)}" r="5.5" fill="${i % 2 ? "#ff9a1a" : "#ffc21a"}"/>`; }).join("") + [1432, 1694].map(x => `<line x1="${x}" y1="326" x2="${x}" y2="${360}" stroke="#5a8a3a"/>${[0, 1, 2, 3].map(k => `<circle cx="${x}" cy="${334 + k * 8}" r="4.5" fill="${k % 2 ? "#ff9a1a" : "#ffc21a"}"/>`).join("")}`).join(""),
    front: () => NT.plate(1676, 636, 30) + [[-12, -3], [0, -4], [12, -3], [-6, -10], [6, -10], [0, 2]].map(([dx, dy]) => `<circle cx="${1676 + dx}" cy="${630 + dy}" r="6" fill="#f2a12a"/><circle cx="${1674 + dx}" cy="${628 + dy}" r="1.6" fill="rgba(255,255,255,.35)"/>`).join("") };
  // Corée du Sud (3 octobre, Gaecheonjeol, fête de la Fondation nationale) : un mugunghwa (hibiscus de Syrie, fleur nationale,
  // encore en fleur début octobre) — et les drapeaux, qu'on accroche aux fenêtres ce jour-là
  T.KR = { say: "C'est Gaecheonjeol, la fête de la Fondation : les drapeaux sont sortis, et un mugunghwa fleurit à la fenêtre.",
    mantel: () => `<g transform="translate(868 400)">${NT.pot(0, 0, 26, 20, "#7a6a5a")}<path d="M0 -20 L-6 -64 M0 -30 L10 -60" stroke="#5a4636" stroke-width="2.4"/>${Array.from({ length: 9 }, (_, i) => NT.leaf(f1(-14 + NT.R(i + 9) * 28), f1(-28 - NT.R(i + 19) * 34), 12, f1(NT.R(i + 29) * 360), "#3f7d4f")).join("")}${[[-6, -66], [10, -60], [-2, -46]].map(([x, y]) => NT.flower(x, y, 11, "#e7a2c8", "#c2185b", 5, .5) + `<circle cx="${x}" cy="${y}" r="4" fill="#c2185b" opacity=".8"/>`).join("")}</g>` };
  // Vietnam (2 septembre) : des lotus dans une coupe et des banderoles rouges
  T.VN = { say: "Des fleurs de lotus dans une coupe et des banderoles rouges étoilées.",
    wall: () => [1050, 1410].map((x, i) => `<path d="M${x - 2} 211 L${x + 20} 198 L${x + 42} 211" stroke="#c9b48a" fill="none"/><circle cx="${x + 20}" cy="197" r="2" fill="#8a6a45"/><g class="nt-swing" style="animation-delay:${-i * 1.3}s"><rect x="${x - 2}" y="210" width="44" height="3" fill="#6b4a2b"/><path d="M${x} 213 h40 v34 l-20 8 l-20 -8 Z" fill="#DA251D"/>${NT.star(x + 20, 232, 9, "#FFDE00")}</g>`).join(""),
    front: () => `<g transform="translate(1676 636)"><path d="M-26 -8 Q0 10 26 -8 Z" fill="#3a6aa0"/><ellipse cy="-8" rx="26" ry="5" fill="#5a8ac0"/>${NT.leaf(-26, -12, 18, -10, "#3f8a4a")}${[[-9, -14], [8, -18]].map(([x, y]) => `<g transform="translate(${x} ${y})">${[-40, -15, 15, 40].map(a => `<ellipse cy="-6" rx="4" ry="9" fill="${Math.abs(a) > 20 ? "#f4b6c8" : "#e8789a"}" transform="rotate(${a} 0 2)"/>`).join("")}<circle cy="-4" r="3" fill="#f2d04a"/></g>`).join("")}</g>` };
  // Thaïlande (5 décembre) : guirlande de fleurs (phuang malai), fleurs jaunes de ratchaphruek, éléphant sculpté
  T.TH = { say: "Une guirlande de fleurs à la fenêtre, des fleurs jaunes de ratchaphruek et un éléphant sculpté.",
    wall: () => `<g transform="translate(990 186)"><path d="M0 0 v8" stroke="#c9a26b"/>${Array.from({ length: 9 }, (_, i) => `<circle cx="0" cy="${12 + i * 7}" r="4.2" fill="${i % 3 === 1 ? "#ffb21a" : "#fbfbf3"}"/>`).join("")}<circle cx="0" cy="80" r="6" fill="#d4234a"/><path d="M-2 86 l-3 14 M2 86 l3 14 M0 86 v15" stroke="#f2d04a" stroke-width="1.4"/></g>`,
    mantel: () => elephant(1506, 318, .9, "#5a3c26") + `<g>${NT.vase(870, 400, 18, 30)}<path d="M870 372 Q862 344 850 330 M870 360 Q882 340 892 336" stroke="#6b4a2b" stroke-width="2" fill="none"/>${[[850, 330], [892, 336], [870, 326]].map(([x, y]) => Array.from({ length: 7 }, (_, k) => `<circle cx="${x + (k % 2 ? 2 : -2)}" cy="${y + 4 + k * 5}" r="3.4" fill="${k % 2 ? "#ffd21f" : "#f6c20f"}"/>`).join("")).join("")}</g>` };

  for (const code of Object.keys(T)) {
    const t = T[code];
    FETES2D["nat:" + code] = { replaces: true, greet: (c) => greet(c.nat, t.say),
      wall: (c) => defs + base.wall(c) + (t.wall ? t.wall(c) : ""),
      mantel: (c) => base.mantel(c) + (t.mantel ? t.mantel(c) : ""),
      front: (c) => base.front(c) + (t.front ? t.front(c) : ""),
      window: (c) => base.window(c) + (t.window ? t.window(c) : "") };
  }
})();
