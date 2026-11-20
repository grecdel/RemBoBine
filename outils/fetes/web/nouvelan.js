(() => {
  /* ===== Nouvel An : le 31 (préparatifs, puis réveillon et compte à rebours), minuit, et le lendemain matin ===== */
  const R = (k) => { const x = Math.sin(k * 78.233 + 12.9898) * 43758.5453; return x - Math.floor(x); };
  const phase = (c) => c.m === 12 ? (c.h < 18 ? "prep" : "soir") : (c.h < 5 ? "minuit" : "lendemain");
  const year = (c) => c.m === 12 ? c.y + 1 : c.y;
  const GOLD = "#e8c15a", SILVER = "#d9dbe6", NIGHT = "#23233a";
  const CONF = ["#e8c15a", "#d9dbe6", "#ff6fa8", "#5ac8fa", "#7be07b", "#ffd36a", "#c77dff"];
  const catAt = () => { try { const L = lifeDay(); return L.cat === "sofa" ? [1140, 566] : L.cat === "rug" ? [1790, 704] : null; } catch (_) { return null; } };
  const names = (c) => (c.profiles || []).slice(0, 4);
  const list = (n) => n.length <= 1 ? (n[0] || "") : n.slice(0, -1).join(", ") + " et " + n[n.length - 1];

  // chapeau pointu à pois et pompon (x, y = milieu de la base)
  const hat = (x, y, s, rot, c1, c2, nm = "") => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M-11 0 L0 -32 L11 0 Q0 4 -11 0 Z" fill="${c1}"/><path d="M0 -32 L11 0 Q6 2 2 2.6 Z" fill="rgba(0,0,0,.18)"/>${[[-5, -5], [3, -9], [-2, -16], [4, -2], [-6, -1], [1, -23]].map(([a, b]) => `<circle cx="${a}" cy="${b}" r="1.7" fill="${c2}"/>`).join("")}<path d="M-11 0 Q0 4 11 0" stroke="${c2}" stroke-width="2.2" fill="none"/><g transform="translate(0 -33)">${[0, 1, 2, 3, 4, 5, 6, 7].map(k => `<path d="M0 0 L${(Math.cos(k * .785) * 5).toFixed(1)} ${(Math.sin(k * .785) * 5).toFixed(1)}" stroke="${c2}" stroke-width="1.6"/>`).join("")}<circle r="2.6" fill="${c2}"/></g>${nm ? `<text y="-5" text-anchor="middle" font-size="4.6" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width=".4">${nm}</text>` : ""}</g>`;
  // langue de belle-mère (sifflet qui se déroule)
  const horn = (x, y, rot, c, open) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-12" y="-2.2" width="10" height="4.4" rx="1.5" fill="#f4f1ea"/><rect x="-12" y="-2.2" width="3" height="4.4" fill="${GOLD}"/>${open ? `<path d="M-2 0 L18 0 Q26 0 26 -6 Q26 -11 21 -11 Q17 -11 17 -7" stroke="${c}" stroke-width="4.2" fill="none" stroke-linecap="round"/>` : `<circle cx="2" cy="0" r="5.5" fill="none" stroke="${c}" stroke-width="3.5"/><circle cx="2" cy="0" r="2" fill="none" stroke="${c}" stroke-width="2"/>`}</g>`;
  // coupe de champagne (pleine, à moitié, vide ; couchée si rot)
  const flute = (x, y, lvl, rot = 0, bubbles = false) => {
    const top = -40, liq = lvl > 0 ? -16.5 - 17 * lvl : 0;
    const b = bubbles && lvl > 0 ? [0, 1, 2, 3].map(k => `<circle class="ny-bub" cx="${(-1.5 + (k % 2) * 3).toFixed(1)}" cy="-18" r=".9" fill="#fff8d8" style="animation-delay:${(k * .45).toFixed(2)}s"/>`).join("") : "";
    return `<g transform="translate(${x} ${y}) rotate(${rot})"><ellipse cy="-1" rx="7" ry="1.8" fill="rgba(255,255,255,.55)"/><path d="M-0.8 -1 V-15 M0.8 -1 V-15" stroke="rgba(255,255,255,.7)" stroke-width="1.1"/>${lvl > 0 ? `<path d="M${(-5 * (-liq - 15) / 25 - .6).toFixed(1)} ${liq.toFixed(1)} L${(5 * (-liq - 15) / 25 + .6).toFixed(1)} ${liq.toFixed(1)} L2.6 -17 Q0 -14.6 -2.6 -17 Z" fill="#f2cf6e" opacity=".9"/>` : ""}${b}<path d="M-6 ${top} L6 ${top} L3 -16 Q0 -13 -3 -16 Z" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.7)" stroke-width="1"/><path d="M-3.8 -37 L-2 -19" stroke="rgba(255,255,255,.5)" stroke-width="1"/></g>`;
  };
  // bouteille de champagne (debout ou couchée), bouchée ou ouverte
  const bottle = (x, y, rot, open, label = "") => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-9 0 L-9 -38 Q-9 -48 -4 -52 L-4 -64 L4 -64 L4 -52 Q9 -48 9 -38 L9 0 Q0 2.5 -9 0 Z" fill="#17402a"/><path d="M-6 -6 L-6 -38 Q-6 -45 -2.5 -49" stroke="rgba(255,255,255,.22)" stroke-width="2" fill="none"/>${open ? `<path d="M-4.6 -56 L4.6 -56 L4.6 -64 L-4.6 -64 Z" fill="${GOLD}" opacity=".85"/><path d="M-4.6 -64 l2 -3 l2 2 l2 -3 l2 3 l1 1 Z" fill="${GOLD}"/>` : `<path d="M-5 -50 L5 -50 L5 -66 Q0 -70 -5 -66 Z" fill="${GOLD}"/><path d="M-5 -58 L5 -58" stroke="#b8902c" stroke-width="1.2"/>`}<rect x="-8" y="-30" width="16" height="16" rx="1.5" fill="#f3ead2"/><rect x="-8" y="-30" width="16" height="3" fill="${GOLD}"/><text y="-18.5" text-anchor="middle" font-size="5.4" font-weight="800" fill="#7a5a1a">${label}</text><path d="M-5 -46 L5 -46 L4 -41 L-4 -41 Z" fill="#f3ead2"/></g>`;
  // seau à champagne en métal, avec glaçons (ou de l'eau le lendemain)
  const bucket = (x, y, melted) => `<g transform="translate(${x} ${y})"><path d="M-17 0 L-20 -30 L20 -30 L17 0 Z" fill="#b9bcc8"/><path d="M-17 0 L-20 -30 L-12 -30 L-10 0 Z" fill="rgba(255,255,255,.35)"/><rect x="-21" y="-33" width="42" height="5" rx="2.5" fill="#d9dbe6"/><path d="M-21 -26 q-7 0 -7 6 q0 6 7 5 M21 -26 q7 0 7 6 q0 6 -7 5" stroke="#9a9eab" stroke-width="2.2" fill="none"/>${melted ? `<ellipse cy="-31" rx="18" ry="2.6" fill="rgba(170,210,240,.7)"/>` : [[-14, -36], [-7, -38], [9, -37], [14, -35], [-2, -35]].map(([a, b], i) => `<rect x="${a - 3.5}" y="${b - 3.5}" width="7" height="7" rx="1.6" fill="rgba(220,240,255,.85)" stroke="rgba(255,255,255,.9)" stroke-width=".6" transform="rotate(${i * 23} ${a} ${b})"/>`).join("")}</g>`;
  // ballon de baudruche avec un chiffre (x, y = centre)
  const balloon = (x, y, ch, col, s = 1, sad = 0) => `<g transform="translate(${x} ${y}) scale(${s}) rotate(${sad * 14})"><path d="M0 ${26 - sad * 4} q-5 12 2 22 q6 10 -2 22 q-6 12 2 26 q6 14 -1 40" stroke="#c9c3b8" stroke-width="1" fill="none"/><ellipse rx="${20 - sad * 4}" ry="${25 - sad * 6}" fill="${col}"/>${sad ? `<path d="M-12 -4 q6 4 12 -2 q6 5 10 0" stroke="rgba(0,0,0,.2)" stroke-width="1.4" fill="none"/>` : ""}<ellipse cx="-7" cy="-10" rx="4" ry="7" fill="rgba(255,255,255,.45)" transform="rotate(25 -7 -10)"/><path d="M-3 ${25 - sad * 6} L3 ${25 - sad * 6} L0 ${21 - sad * 6} Z" fill="${col}"/><text y="${9 - sad * 2}" text-anchor="middle" font-size="${26 - sad * 5}" font-weight="800" fill="${col === NIGHT ? GOLD : "#3a2a12"}" opacity=".9">${ch}</text></g>`;
  const confetti = (n, x0, x1, y0, y1, seed, avoid) => { let o = "";
    for (let i = 0; i < n; i++) { const x = x0 + R(i + seed) * (x1 - x0), y = y0 + R(i * 3.1 + seed + 7) * (y1 - y0); if (avoid && avoid(x, y)) continue;
      const c = CONF[i % CONF.length], r = (R(i + seed + 2) * 180).toFixed(0);
      o += i % 4 === 0 ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.1" fill="${c}"/>` : `<rect x="${(x - 3).toFixed(1)}" y="${(y - 1.6).toFixed(1)}" width="6" height="3.2" fill="${c}" transform="rotate(${r} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; }
    return o; };
  // serpentin qui ondule (de a vers b)
  const streamer = (x0, y0, x1, y1, c, waves = 4, amp = 6) => { let d = `M${x0} ${y0}`; for (let k = 1; k <= waves * 2; k++) { const t = k / (waves * 2), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, px = (k % 2 ? 1 : -1) * amp; d += ` Q${(x0 + (x1 - x0) * (t - .5 / (waves * 2)) + px).toFixed(1)} ${(y0 + (y1 - y0) * (t - .5 / (waves * 2)) - px * .4).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`; } return `<path d="${d}" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`; };
  const sleepingCat = (x, y) => `<g transform="translate(${x} ${y})"><ellipse rx="30" ry="13" fill="#29272b"/><circle cx="24" cy="-4" r="10" fill="#29272b"/><path d="M18 -12 l3 -8 l4 7 Z M27 -12 l4 -7 l2 8 Z" fill="#29272b"/><path d="M-28 4 q-14 2 -10 -10" stroke="#29272b" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M20 -4 q2 1.5 4 0 M27 -4 q2 1.5 4 0" stroke="#6a6670" stroke-width="1" fill="none"/></g>`;

  /* ---- le compte à rebours sur la télé (la dalle est un élément HTML : on l'habille quand elle est éteinte) ---- */
  const tvTick = () => {
    const on = document.querySelector("#salon .ny-on"), tv = document.querySelector("#tvScreen .tv-off");
    if (!tv) return;
    let box = tv.querySelector(".ny-tv");
    const d = new Date(), m = d.getMonth() + 1, h = d.getHours();
    const show = on && ((m === 12 && d.getDate() === 31 && h >= 18) || (m === 1 && d.getDate() === 1 && h < 5));
    if (!show) { if (box) box.remove(); return; }
    let html;
    if (m === 12) {
      const left = Math.max(0, Math.floor((new Date(d.getFullYear() + 1, 0, 1).getTime() - d.getTime()) / 1000)), yr = d.getFullYear() + 1;
      const hh = Math.floor(left / 3600), mm = Math.floor(left / 60) % 60, ss = left % 60, p2 = (n) => String(n).padStart(2, "0");
      html = left <= 10 ? `<div class="ny-big">${left || "0"}</div><div class="ny-sub">BONNE ANNÉE ${yr} DANS…</div>`
        : `<div class="ny-sub">COMPTE À REBOURS · ${yr}</div><div class="ny-clock">${p2(hh)}<span>:</span>${p2(mm)}<span>:</span>${p2(ss)}</div><div class="ny-sub2">Réveillon en direct de ton salon</div>`;
    } else html = `<div class="ny-fw"><i></i><i></i><i></i><i></i></div><div class="ny-hny">BONNE ANNÉE</div><div class="ny-yr">${d.getFullYear()}</div>`;
    if (!box) { box = document.createElement("div"); box.className = "ny-tv"; tv.appendChild(box); }
    if (box.innerHTML !== html) box.innerHTML = html;
  };
  const startTv = () => { if (!window.__nyTv) window.__nyTv = setInterval(tvTick, 500); setTimeout(tvTick, 60); };

  FETES2D["nouvelan"] = {
    replaces: true,
    css: `
      .salon:has(.ny-on) g[transform="translate(922 628)"], .salon:has(.ny-on) g[transform="translate(1690 614)"] { display: none; }
      .ny-bub { animation: nyBub 1.8s linear infinite; }
      @keyframes nyBub { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-17px); opacity: 0; } }
      .ny-fwk { transform-box: fill-box; transform-origin: center; animation: nyFw 3.2s ease-out infinite; opacity: 0; }
      @keyframes nyFw { 0% { transform: scale(.1); opacity: 0; } 8% { opacity: 1; } 55% { transform: scale(1); opacity: .9; } 100% { transform: scale(1.12) translateY(6px); opacity: 0; } }
      .ny-fall { animation: nyFall 9s linear infinite; }
      @keyframes nyFall { 0% { transform: translate(0, -80px) rotate(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translate(14px, 560px) rotate(540deg); opacity: 0; } }
      .ny-sway { transform-box: fill-box; transform-origin: 50% 0; animation: nySway 5s ease-in-out infinite alternate; }
      @keyframes nySway { from { transform: rotate(-3deg); } to { transform: rotate(3deg); } }
      .ny-bob { animation: nyBob 6s ease-in-out infinite alternate; }
      @keyframes nyBob { from { transform: translateY(0); } to { transform: translateY(-5px); } }
      .ny-tv { position: absolute; inset: 0; container-type: size; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2cqh;
        background: radial-gradient(ellipse at 50% 40%, #1d2346 0%, #0b0d1c 70%); color: #fff; font-family: inherit; text-align: center; overflow: hidden; }
      .ny-tv .ny-sub { font-size: 5.2cqw; letter-spacing: .14em; color: #e8c15a; font-weight: 700; }
      .ny-tv .ny-sub2 { font-size: 3.6cqw; color: #aeb6e0; letter-spacing: .06em; }
      .ny-tv .ny-clock { font-size: 15cqw; font-weight: 800; font-variant-numeric: tabular-nums; text-shadow: 0 0 2cqw rgba(232,193,90,.65); }
      .ny-tv .ny-clock span { animation: nyBlink 1s steps(2) infinite; color: #e8c15a; }
      @keyframes nyBlink { 50% { opacity: .25; } }
      .ny-tv .ny-big { font-size: 40cqh; font-weight: 900; color: #ffe08a; animation: nyPulse 1s ease-out infinite; text-shadow: 0 0 3cqw rgba(255,224,138,.8); line-height: 1; }
      @keyframes nyPulse { 0% { transform: scale(1.25); } 100% { transform: scale(.9); opacity: .7; } }
      .ny-tv .ny-hny { font-size: 11cqw; font-weight: 900; letter-spacing: .08em; color: #ffe08a; text-shadow: 0 0 2.5cqw rgba(255,200,90,.8); z-index: 1; }
      .ny-tv .ny-yr { font-size: 16cqw; font-weight: 900; color: #fff; z-index: 1; line-height: 1; }
      .ny-tv .ny-fw i { position: absolute; width: 22cqw; height: 22cqw; border-radius: 50%; background: radial-gradient(circle, transparent 30%, #ff6fa8 32%, transparent 36%, transparent 52%, #ffe08a 54%, transparent 58%); animation: nyTvFw 2.4s ease-out infinite; opacity: 0; }
      .ny-tv .ny-fw i:nth-child(1) { left: 6%; top: 8%; } .ny-tv .ny-fw i:nth-child(2) { left: 70%; top: 4%; animation-delay: .6s; filter: hue-rotate(140deg); }
      .ny-tv .ny-fw i:nth-child(3) { left: 14%; top: 56%; animation-delay: 1.2s; filter: hue-rotate(60deg); } .ny-tv .ny-fw i:nth-child(4) { left: 74%; top: 58%; animation-delay: 1.8s; filter: hue-rotate(220deg); }
      @keyframes nyTvFw { 0% { transform: scale(.1); opacity: 0; } 15% { opacity: 1; } 100% { transform: scale(1.3); opacity: 0; } }
      .salon.still .ny-bub, .salon.still .ny-fwk, .salon.still .ny-fall, .salon.still .ny-sway, .salon.still .ny-bob { animation: none; }
      .salon.still .ny-fwk { opacity: .8; }`,
    greet: (c) => {
      const ph = phase(c), yr = year(c), n = names(c), who = n.length ? ", " + list(n) : "";
      if (ph === "prep") return `Dernier jour de l'année${who} ! Le champagne est au frais, les coupes attendent : ce soir, on réveillonne.`;
      if (ph === "soir") { const left = Math.max(0, Math.ceil((new Date(c.y + 1, 0, 1).getTime() - Date.now()) / 60000)); const hh = Math.floor(left / 60), mm = left % 60;
        return `Réveillon ! Plus que ${hh ? hh + " h " + String(mm).padStart(2, "0") : mm + " min"} avant ${yr} : le compte à rebours tourne sur la télé.`; }
      if (ph === "minuit") return `Bonne année ${yr}${who} ! Le bouchon a sauté, les coupes sont pleines et il pleut des confettis.`;
      return `Bonne année ${yr}${who} ! Le salon a fait la fête toute la nuit : confettis partout, bouteille vide… et le chat dort encore sous les serpentins.`;
    },
    wall: (c) => {
      const ph = phase(c), yr = String(year(c)), late = ph === "lendemain";
      startTv();
      let o = `<g class="ny-on" data-ph="${ph}"></g>`;
      // les chiffres de l'année en ballons, collés au plafond au-dessus de la télé (le lendemain, ils commencent à se dégonfler)
      o += [...yr].map((ch, i) => { const x = 1150 + i * 58, sad = late ? (i === 1 ? 2 : i === 3 ? 1 : 0) : 0, y = late ? [62, 112, 66, 84][i] : 58 + (i % 2) * 8;
        return `<g class="${late ? "" : "ny-bob"}" style="animation-delay:${-i * 1.3}s">${balloon(x, y, ch, i % 2 ? SILVER : GOLD, 1, sad)}</g>`; }).join("");
      // grappe de ballons noirs, or et argent dans l'angle, au-dessus de la bibliothèque des vidéos
      const cl = [[712, 44, GOLD], [742, 30, NIGHT], [770, 50, SILVER], [736, 64, "#c77dff"], [762, 78, GOLD]];
      o += `<g>${cl.map(([x, y, col], i) => `<path d="M${x} ${y + 22} Q${x + 6} ${y + 50} 750 108" stroke="#c9c3b8" stroke-width="1" fill="none"/><ellipse cx="${x}" cy="${y}" rx="17" ry="21" fill="${col}"/><ellipse cx="${x - 6}" cy="${y - 8}" rx="3.4" ry="6" fill="rgba(255,255,255,.4)" transform="rotate(25 ${x - 6} ${y - 8})"/>`).join("")}<path d="M744 104 l6 4 l6 -4 l-2 8 l-8 0 Z" fill="${GOLD}"/>${streamer(750, 110, 742, 190, GOLD, 4, 4)}${streamer(752, 110, 764, 176, SILVER, 3, 4)}</g>`;
      return o;
    },
    mantel: (c) => {
      const ph = phase(c), yr = String(year(c)), late = ph === "lendemain";
      let o = "";
      // « 2027 » en lettres dorées pailletées, posé à gauche sur la cheminée (le lendemain, un chiffre est tombé)
      o += `<g transform="translate(1486 318)">${[...yr].map((ch, i) => { const fell = late && i === 2; return `<text x="${-27 + i * 18}" y="0" text-anchor="middle" font-size="26" font-weight="900" fill="${GOLD}" stroke="#a57d22" stroke-width="1" ${fell ? `transform="rotate(16 ${-20 + i * 18} 0)"` : ""}>${ch}</text>`; }).join("")}${[0, 1, 2, 3, 4, 5].map(k => `<circle cx="${-30 + k * 12}" cy="${-8 - (k % 3) * 5}" r=".9" fill="#fff8d8"/>`).join("")}</g>`;
      // à droite : avant la fête, la pile de chapeaux et le sachet de cotillons ; ensuite, une coupe oubliée et un serpentin
      if (ph === "prep") o += `<g>${hat(1612, 318, .7, 0, "#c77dff", GOLD)}${hat(1612, 311, .7, 0, "#5ac8fa", "#fff")}${hat(1612, 304, .7, 0, "#ff6fa8", GOLD)}</g><g transform="translate(1646 318)"><path d="M-10 0 L-12 -24 L12 -24 L10 0 Z" fill="rgba(255,255,255,.35)" stroke="rgba(255,255,255,.7)"/><path d="M-12 -24 l4 -5 l4 4 l4 -5 l4 4 l4 -5 l4 7" stroke="#ff6fa8" stroke-width="2" fill="none"/>${confetti(14, -9, 9, -20, -3, 3)}<text y="-31" text-anchor="middle" font-size="5" fill="#f4f1ea">COTILLONS</text></g>`;
      else o += `${flute(1614, 318, late ? .15 : .7)}${horn(1648, 314, -8, "#5ac8fa", late)}`;
      // un chapeau pointu posé de travers sur l'horloge (à partir du soir)
      if (ph !== "prep") o += hat(1572, 202, .9, 18, GOLD, NIGHT);
      return o;
    },
    front: (c) => {
      const ph = phase(c), yr = year(c), n = names(c), late = ph === "lendemain", cat = catAt();
      const hatCols = [["#ff6fa8", GOLD], ["#5ac8fa", "#fff"], ["#c77dff", GOLD], [GOLD, NIGHT]];
      let o = "";
      // des serpentins accrochés au fil de l'ampoule du plafond
      o += `<g class="${late ? "" : "ny-sway"}">${streamer(1598, 70, 1586, 162, "#ff6fa8", 5, 4)}${streamer(1600, 72, 1612, 150, GOLD, 4, 4)}${streamer(1602, 70, 1624, 138, "#5ac8fa", 4, 4)}</g>`;
      // sur la table basse
      if (ph === "prep") o += `${bucket(1560, 640, false)}<g transform="translate(1560 628) rotate(-6)">${bottle(0, 0, 0, false, String(yr))}</g>${[1494, 1512, 1610, 1628].map(x => flute(x, 640, 0)).join("")}`;
      else if (ph === "soir") o += `${bucket(1560, 640, false)}<g transform="translate(1560 628) rotate(-6)">${bottle(0, 0, 0, false, String(yr))}</g>${flute(1494, 640, 0)}${flute(1512, 640, 0)}${flute(1610, 640, 0)}${flute(1628, 640, 0)}<g transform="translate(1480 628)"><ellipse rx="17" ry="4" fill="#f4f1ea"/>${[-10, -3, 4, 11].map((x, i) => `<rect x="${x - 3}" y="-6" width="6" height="5" rx="1" fill="${["#c98a4a", "#f0d27a", "#7a4a2a", "#e8a0b0"][i]}"/>`).join("")}</g>${horn(1586, 646, 10, "#ff6fa8", false)}`;
      else if (ph === "minuit") o += `${bucket(1560, 640, false)}<g transform="translate(1560 628) rotate(-14)">${bottle(0, 0, 0, true, String(yr))}</g><g class="ny-bub" style="animation-duration:2.4s"><circle cx="1574" cy="560" r="1.6" fill="#fff8d8"/><circle cx="1570" cy="566" r="1.1" fill="#fff8d8"/></g>${flute(1494, 640, .85, 0, true)}${flute(1512, 640, .7, 0, true)}${flute(1610, 640, .8, 0, true)}${flute(1628, 640, .9, 0, true)}${horn(1586, 646, 10, "#ff6fa8", true)}<g transform="translate(1600 676)"><path d="M-4 0 L4 0 L3 -9 L-3 -9 Z" fill="#d9b483"/><ellipse cy="-9" rx="4.5" ry="2" fill="#c49a62"/></g>`;
      else o += `${bucket(1478, 640, true)}<g transform="translate(1574 636)">${bottle(0, 0, -96, true, String(yr))}</g>${flute(1622, 640, .25)}<g transform="translate(1508 642) rotate(-90)">${flute(0, 0, 0)}</g><path d="M1524 640 q10 4 22 0 q6 -2 10 1" stroke="#f2cf6e" stroke-width="2.6" fill="none" opacity=".7"/>${horn(1600, 648, 8, "#5ac8fa", true)}${confetti(18, 1470, 1640, 622, 646, 5)}<path d="M1700 652 q4 14 -4 24 q-6 10 4 22" stroke="#ff6fa8" stroke-width="2.4" fill="none"/>`;
      // les chapeaux pointus au prénom des profils, posés sur le canapé (abandonnés le lendemain)
      const hn = n.length ? n : ["", ""];
      const spots = late ? [[984, 598, -70], [1092, 612, 160], [880, 712, -100], [1150, 598, -20]] : [[984, 598, 0], [1040, 598, 0], [1096, 598, 0], [1152, 598, 0]];
      o += hn.slice(0, 4).map((nm, i) => hat(spots[i][0], spots[i][1], .95, spots[i][2], hatCols[i][0], hatCols[i][1], c.esc(String(nm).slice(0, 6)))).join("");
      // les confettis au sol : quelques-uns le soir, une pluie à minuit, partout le lendemain
      const avoid = (x, y) => (x > 918 && x < 1362) || (x > 1395 && x < 1735 && y < 666) || (x > 1855 && x < 1945 && y < 640);
      const nb = ph === "prep" ? 0 : ph === "soir" ? 40 : ph === "minuit" ? 110 : 260;
      if (nb) o += `<g>${confetti(nb, 450, 2190, 642, 718, 11, avoid)}</g>`;
      if (ph === "minuit") o += `<g>${Array.from({ length: 26 }, (_, i) => { const x = 960 + R(i + 300) * 1000, y = 20 + R(i + 400) * 80, col = CONF[i % CONF.length]; return `<rect class="ny-fall" x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="6" height="3" fill="${col}" style="animation-delay:${(-R(i + 500) * 9).toFixed(2)}s;animation-duration:${(7 + R(i + 600) * 5).toFixed(1)}s"/>`; }).join("")}</g>`;
      if (late) {
        // le lendemain : serpentins par terre, un ballon dégonflé, le bouchon, un chapeau écrasé
        o += `${streamer(1380, 700, 1470, 712, "#ff6fa8", 4, 5)}${streamer(1760, 690, 1850, 676, GOLD, 4, 5)}${streamer(560, 700, 680, 690, "#5ac8fa", 5, 5)}`;
        o += `<g transform="translate(1388 694) rotate(-20)"><path d="M-16 4 Q-18 -10 -2 -12 Q14 -12 14 0 Q14 8 0 8 Q-12 9 -16 4 Z" fill="${SILVER}"/><path d="M-10 -4 q8 4 16 -2" stroke="rgba(0,0,0,.18)" stroke-width="1.2" fill="none"/><path d="M14 0 l6 -2 l0 4 Z" fill="${SILVER}"/><path d="M20 0 q10 6 22 2" stroke="#c9c3b8" stroke-width="1" fill="none"/></g>`;
        o += `<g transform="translate(1912 700)"><path d="M-4 0 L4 0 L3 -9 L-3 -9 Z" fill="#d9b483"/><ellipse cy="-9" rx="4.5" ry="2" fill="#c49a62"/></g>${horn(620, 708, -12, GOLD, true)}`;
        // le chat dort, un chapeau pointu sur la tête
        // (à Noël, le chat du logiciel porte déjà son bonnet : on lui drape plutôt des serpentins sur le dos)
        const at = cat || [1790, 704];
        if (!cat) o += sleepingCat(at[0], at[1]);
        if (!cat || c.season !== "Noël") o += hat(at[0] + 26, at[1] - 11, .62, 22, GOLD, NIGHT);
        else o += `${streamer(at[0] - 26, at[1] - 4, at[0] + 10, at[1] - 12, "#ff6fa8", 3, 3)}${streamer(at[0] - 18, at[1] + 4, at[0] + 4, at[1] - 10, GOLD, 2, 3)}${confetti(8, at[0] - 22, at[0] + 14, at[1] - 10, at[1] + 2, 41)}`;
      } else if (ph !== "prep" && cat && c.season !== "Noël") o += hat(cat[0] + 26, cat[1] - 11, .62, 22, "#ff6fa8", GOLD);
      return o;
    },
    window: (c) => {
      const ph = phase(c);
      if (!((ph === "soir" && c.h >= 21) || ph === "minuit")) return "";
      // feux d'artifice au loin, dans le ciel de la fenêtre (ils éclairent seulement le ciel)
      const burst = (x, y, r, col, delay) => `<g class="ny-fwk" style="animation-delay:${delay}s">${Array.from({ length: 14 }, (_, k) => { const a = k * Math.PI / 7; return `<line x1="${(x + Math.cos(a) * r * .25).toFixed(1)}" y1="${(y + Math.sin(a) * r * .25).toFixed(1)}" x2="${(x + Math.cos(a) * r).toFixed(1)}" y2="${(y + Math.sin(a) * r).toFixed(1)}" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/><circle cx="${(x + Math.cos(a) * r * 1.08).toFixed(1)}" cy="${(y + Math.sin(a) * r * 1.08).toFixed(1)}" r="1.3" fill="#fff"/>`; }).join("")}</g>`;
      return `<g>${burst(850, 180, 26, "#ff6fa8", 0)}${burst(948, 158, 32, "#ffe08a", 1.1)}${burst(902, 222, 20, "#5ac8fa", 2.1)}${ph === "minuit" ? burst(968, 236, 22, "#7be07b", .6) + burst(826, 240, 18, "#c77dff", 1.7) : ""}</g>`;
    },
  };
})();
