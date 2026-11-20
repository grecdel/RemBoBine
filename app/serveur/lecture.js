// Rembobine — les extras de la lecture vidéo (serveur de la maison) :
//   - génériques repérés tout seuls : chapitres nommés (« Intro », « Opening », « Générique »…), sinon
//     empreinte audio commune aux épisodes d'une même saison (calculée avec ffmpeg), sinon la position
//     choisie à la main, retenue pour toute la saison ;
//   - vignettes de la barre de lecture (une image toutes les 10 s, fabriquée à la demande et gardée) ;
//   - versions converties préparées à l'avance (file d'attente, priorité basse) : « salon » (lisible partout)
//     et « légère » (720p, pour emporter un film sur le téléphone) ;
//   - captures d'écran du film sur la TV ;
//   - réglages de mpv sur la TV : vitesse, décalage des sous-titres et du son, mode nuit, chapitres,
//     minuteur, générique de fin et épisode suivant avec compte à rebours.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const V = require("./video");

// ---------- empreinte audio (même principe que la page : énergie de 17 bandes, 16 bits toutes les 0,2 s) ----------
const STEP = 0.2, RATE = 8000, HOP = RATE * STEP, N = 1024, BANDS = 17, MISS = 0xffff;
const PC16 = (() => { const t = new Uint8Array(65536); for (let i = 1; i < 65536; i++) t[i] = t[i >> 1] + (i & 1); return t; })();
const HANN = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
const EDGES = Array.from({ length: BANDS + 1 }, (_, i) => Math.round(250 * Math.pow(3000 / 250, i / BANDS) / (RATE / N)));
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) { const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}
// sons (16 bits, mono, 8000 Hz) → empreinte (Uint16Array, une valeur toutes les 0,2 s)
function fingerprint(pcm) {
  const frames = Math.floor((pcm.length - N) / HOP) + 1; if (frames < 2) return new Uint16Array(0);
  const E = [], en = [], re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    const o = f * HOP; for (let i = 0; i < N; i++) { re[i] = (pcm[o + i] / 32768) * HANN[i]; im[i] = 0; }
    fft(re, im); const row = new Float64Array(BANDS); let sum = 0;
    for (let b = 0; b < BANDS; b++) { let s = 0; for (let i = EDGES[b]; i < Math.max(EDGES[b] + 1, EDGES[b + 1]); i++) s += re[i] * re[i] + im[i] * im[i]; row[b] = Math.log(s + 1e-9); sum += s; }
    E.push(row); en.push(sum);
  }
  const out = new Uint16Array(frames).fill(MISS);
  for (let t = 1; t < frames; t++) { if (en[t] < 1e-4 || en[t - 1] < 1e-4) continue; const a = E[t], b = E[t - 1]; let v = 0;
    for (let k = 0; k < 16; k++) if ((a[k] - a[k + 1]) - (b[k] - b[k + 1]) > 0) v |= 1 << k; out[t] = v; }
  return out;
}
// le plus long passage commun à deux empreintes (au moins minRun pas de 0,2 s)
function match(a, b, minRun = 75) {
  let best = null; const na = a.length, nb = b.length;
  const ok = (x, y) => x !== MISS && y !== MISS && PC16[x ^ y] <= 4;
  for (let d = -(nb - minRun); d <= na - minRun; d++) {
    const i0 = Math.max(0, d), i1 = Math.min(na, nb + d); let st = -1, last = -1, miss = 0, good = 0;
    const close = () => { const len = last - st + 1; if (len >= minRun && good > len * 0.55 && (!best || len > best.len)) best = { ia: st, ib: st - d, len }; };
    for (let i = i0; i < i1; i++) {
      if (ok(a[i], b[i - d])) { if (st < 0) { st = i; good = 0; } last = i; miss = 0; good++; }
      else if (st >= 0 && ++miss > 6) { close(); st = -1; miss = 0; }
    }
    if (st >= 0) close();
  }
  return best;
}
const enc = (u) => Buffer.from(u.buffer, u.byteOffset, u.byteLength).toString("base64");
const dec = (s) => { const b = Buffer.from(s || "", "base64"); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 2))); };

// noms de chapitres : générique de début / de fin
const RX_INTRO = /^(intro(duction)?|opening( credits| titles)?|op|générique( de début)?|generique( de debut)?|ouverture|title sequence|main titles?|recap.*intro)$/i;
const RX_CREDITS = /^(credits|end credits|closing credits|crédits|générique de fin|generique de fin|générique fin|ending|ed|outro|fin)$/i;
function fromChapters(chs, dur) {
  const r = {};
  for (const c of chs || []) {
    const t = String(c.title || "").trim();
    if (!r.intro && RX_INTRO.test(t) && c.end > c.start && c.start < Math.max(600, dur * 0.3)) r.intro = [c.start, c.end];
    if (!r.credits && RX_CREDITS.test(t) && c.start > dur * 0.5) r.credits = c.start;
  }
  return r;
}

const PROFILS = {
  salon: { label: "Version salon (lisible partout)", maxh: 1080, crf: 21, ab: "192k", ab6: "384k", ch: 0 },
  leger: { label: "Version légère (téléphone)", maxh: 720, crf: 27, ab: "128k", ch: 2 }
};

function createLecture(o) {
  const S = o.S, mpv = o.mpvSend, log = o.log || (() => {}), emit = (ev) => S.emit && S.emit(ev);
  const dir = (n) => { const d = path.join(S.data, n); try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} return d; };
  const safe = (id) => String(id || "").replace(/[^\w-]/g, "_").slice(0, 64);
  const dbFile = path.join(S.data, "generiques.json");
  let db; try { db = JSON.parse(fs.readFileSync(dbFile, "utf8")); } catch (_) { db = {}; }
  db.eps = db.eps || {}; db.marks = db.marks || {};
  const saveDb = () => { try { fs.writeFileSync(dbFile + ".tmp", JSON.stringify(db)); fs.renameSync(dbFile + ".tmp", dbFile); } catch (_) {} };
  const L = { night: false, sleep: null };

  // travail de fond (empreintes, versions préparées) : rien de lourd pendant qu'un film passe sur la TV
  // ou qu'une conversion à la volée est en cours. Les nouvelles tâches attendent ; une version en cours de
  // préparation est mise en pause (SIGSTOP) puis reprend (SIGCONT) quand la TV et les conversions sont libres.
  const BG = { paused: false, procs: new Set(), tm: null };
  const busy = () => !!S.player || V.active() > 0;
  function bgCheck() {
    const b = busy();
    if (b !== BG.paused && process.platform !== "win32") { for (const p of BG.procs) { try { p.kill(b ? "SIGSTOP" : "SIGCONT"); } catch (_) {} } }
    BG.paused = b;
    if (!b) pump();
    if (!BG.procs.size && !Q.list.length && BG.tm) { clearInterval(BG.tm); BG.tm = null; }
  }
  function bgWatch() { if (!BG.tm) { BG.tm = setInterval(bgCheck, 5000); if (BG.tm.unref) BG.tm.unref(); } }
  // ffmpeg en priorité basse (la TV et les autres lectures passent avant)
  function low(args, onOut, pausable) {
    const ff = V.bins().ffmpeg; if (!ff) return null;
    const p = spawn(ff, args, { stdio: ["ignore", "pipe", "pipe"] });
    try { os.setPriority(p.pid, 19); } catch (_) {}
    if (pausable) { BG.procs.add(p); p.on("close", () => BG.procs.delete(p)); bgWatch(); if (busy() && process.platform !== "win32") { BG.paused = true; try { p.kill("SIGSTOP"); } catch (_) {} } }
    if (onOut) p.stdout.on("data", onOut);
    p.stderr.on("data", () => {});
    return p;
  }
  function pcm(file, from, dur) {
    return new Promise((resolve) => {
      const ch = []; const p = low(["-hide_banner", "-loglevel", "error", "-nostdin", ...(from > 0 ? ["-ss", String(from)] : []), "-t", String(dur), "-i", file, "-vn", "-ac", "1", "-ar", String(RATE), "-f", "s16le", "pipe:1"], (d) => ch.push(d));
      if (!p) return resolve(null);
      const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch (_) {} }, 120000);
      p.on("error", () => resolve(null));
      p.on("close", () => { clearTimeout(t); const b = Buffer.concat(ch); resolve(new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 2)))); });
    });
  }

  // ---------- épisodes : saison, voisins ----------
  function serieOf(id) { return S.lib.items.find((x) => x.kind === "serie" && (x.episodes || []).some((e) => e.id === id)) || null; }
  function seasonKey(id) { const s = serieOf(id), e = s && s.episodes.find((x) => x.id === id); return s && e ? `${s.id}|S${e.s}` : ""; }

  // empreintes du début (6 premières minutes) et de la fin (5 dernières) d'un épisode, gardées sur le disque.
  // ABSENT : le fichier ne se lit pas maintenant (disque débranché, erreur du disque) — rien n'est noté, on réessaiera.
  const ABSENT = { absent: true };
  async function prints(ep) {
    const f = path.join(dir("empreintes"), safe(ep.id) + ".json");
    let st; try { st = fs.statSync(ep.file); } catch (_) { return ABSENT; }
    try { const j = JSON.parse(fs.readFileSync(f, "utf8")); if (j.mtime === st.mtimeMs) return { head: dec(j.head), tail: dec(j.tail), tailFrom: j.tailFrom, dur: j.dur }; } catch (_) {}
    const info = await V.probe(ep.file); const dur = info ? info.dur : 0; if (!dur) return null;
    const head = await pcm(ep.file, 0, Math.min(360, dur)), tailFrom = Math.max(0, dur - 300), tail = dur > 900 ? await pcm(ep.file, tailFrom, 300) : null;
    if (!head) return null;
    const r = { head: fingerprint(head), tail: tail ? fingerprint(tail) : new Uint16Array(0), tailFrom, dur };
    try { fs.writeFileSync(f, JSON.stringify({ mtime: st.mtimeMs, head: enc(r.head), tail: enc(r.tail), tailFrom, dur })); } catch (_) {}
    return r;
  }
  // compare l'épisode avec les autres de sa saison (les plus proches d'abord)
  async function analyse(id) {
    const s = serieOf(id); if (!s) return;
    const ep = s.episodes.find((x) => x.id === id); if (!ep || !ep.file) return;
    const me = await prints(ep); if (me === ABSENT) return;   // (disque débranché : surtout pas « sans générique » pour toujours)
    if (!me) { db.eps[id] = { ...(db.eps[id] || {}), t: Date.now(), none: true }; saveDb(); return; }
    const sibs = s.episodes.filter((x) => x.s === ep.s && x.id !== id && x.file).sort((a, b) => Math.abs(a.e - ep.e) - Math.abs(b.e - ep.e)).slice(0, 3);
    const r = { t: Date.now(), dur: me.dur, ch: (db.eps[id] || {}).ch };
    for (const sb of sibs) {
      const other = await prints(sb); if (!other || other === ABSENT) continue;
      if (!r.intro) { const m = match(me.head, other.head); if (m && m.ia * STEP <= 300) r.intro = [+(m.ia * STEP).toFixed(1), +((m.ia + m.len) * STEP).toFixed(1)]; }
      if (!r.credits && me.tail.length && other.tail.length) { const m = match(me.tail, other.tail); if (m && (m.ia + m.len) * STEP > 200) r.credits = +(me.tailFrom + m.ia * STEP).toFixed(1); }
      if (r.intro && r.credits) break;
    }
    if (!sibs.length) r.alone = true;
    db.eps[id] = r; saveDb();
    log("info", `génériques repérés : ${id} ${r.intro ? "début " + r.intro.join("–") : "pas de début"}, ${r.credits ? "fin à " + r.credits : "pas de fin"}`);
    emit({ type: "generique", id, ...get(id) });
  }

  // ---------- file d'attente (une tâche à la fois, priorité basse) ----------
  const Q = { list: [], cur: null };
  function queue(job) {
    if (Q.list.some((j) => j.key === job.key) || (Q.cur && Q.cur.key === job.key)) return;
    if (job.kind === "fp") Q.list.unshift(job); else Q.list.push(job);   // les empreintes sont courtes : avant
    pump();
  }
  async function pump() {
    if (Q.cur || !Q.list.length || !V.bins().ffmpeg) return;
    if (busy()) { bgWatch(); return; }   // on reprendra quand la TV et les conversions seront libres (bgCheck)
    Q.cur = Q.list.shift();
    try { if (Q.cur.kind === "fp") await analyse(Q.cur.id); else await prepRun(Q.cur); } catch (e) { log("error", "lecture : " + e.message); }
    Q.cur = null; setImmediate(pump);
  }

  // ---------- génériques : ce qu'on sait d'un épisode ou d'un film ----------
  // priorité : position choisie à la main (pour la saison) > chapitres > empreinte audio
  function get(id, info) {
    const it = S.lib.byId.get(id); if (!it) return { ok: false };
    const sk = seasonKey(id), mk = (sk && db.marks[sk]) || db.marks[id] || {}, e = db.eps[id] || {};
    const dur = (info && info.dur) || e.dur || 0, ch = info ? fromChapters(info.chapters, dur) : (e.ch || {});
    const r = { ok: true, start: 0, end: 0, credits: 0, src: "" };
    if (mk.intro) { r.start = mk.intro[0]; r.end = mk.intro[1]; r.src = "main"; }
    else if (ch.intro) { r.start = ch.intro[0]; r.end = ch.intro[1]; r.src = "chapitres"; }
    else if (e.intro) { r.start = e.intro[0]; r.end = e.intro[1]; r.src = "empreinte"; }
    if (mk.creditsFromEnd && dur) r.credits = Math.max(0, dur - mk.creditsFromEnd);
    else if (ch.credits) r.credits = ch.credits;
    else if (e.credits) r.credits = e.credits;
    r.pending = it.kind === "episode" && !e.t && !e.none && !!V.bins().ffmpeg;
    return r;
  }
  async function lookup(id) {
    const it = S.lib.byId.get(id); if (!it || !it.file) return { ok: false };
    const info = await V.probe(it.file), e = db.eps[id] || (db.eps[id] = {});
    if (info && (!e.dur || !e.ch)) { e.dur = info.dur; e.ch = fromChapters(info.chapters, info.dur); saveDb(); }
    if (it.kind === "episode" && !e.t && !e.none) queue({ kind: "fp", id, key: "fp:" + id });
    const r = get(id, info); r.pending = it.kind === "episode" && !e.t && !e.none && !!V.bins().ffmpeg;
    return r;
  }
  // position choisie à la main : retenue pour toute la saison (ou pour le film)
  async function mark(id, b) {
    const it = S.lib.byId.get(id); if (!it) return { ok: false, err: "introuvable" };
    const k = seasonKey(id) || id, m = db.marks[k] || (db.marks[k] = {});
    if (b.clear) { delete db.marks[k]; saveDb(); return { ok: true }; }
    if (Array.isArray(b.intro) && b.intro.length === 2) { const a = Math.max(0, Number(b.intro[0]) || 0), z = Math.max(a + 1, Number(b.intro[1]) || 0); m.intro = [+a.toFixed(1), +z.toFixed(1)]; }
    if (b.credits != null) { const info = await V.probe(it.file); const dur = info ? info.dur : 0; if (dur && b.credits < dur) m.creditsFromEnd = +(dur - Number(b.credits)).toFixed(1); }
    saveDb(); return { ok: true, ...get(id) };
  }

  // ---------- vignettes de la barre de lecture ----------
  const TH = { running: 0, wait: [], tidyT: 0 };
  // les vignettes ne grossissent pas sans fin : au-delà de 300 Mo, on retire celles des films regardés il y a le plus longtemps
  // (vérifié au plus une fois toutes les 10 minutes, sans bloquer le serveur ; elles se refont à la demande)
  const THUMB_MAX = o.thumbMax || 300 * 1024 * 1024;
  function thumbTidy() {
    if (Date.now() - TH.tidyT < 600000) return; TH.tidyT = Date.now();
    (async () => {
      const root = dir("vignettes"), fsp = fs.promises, list = [];
      for (const n of await fsp.readdir(root).catch(() => [])) {
        const d = path.join(root, n); let size = 0, t = 0;
        for (const f of await fsp.readdir(d).catch(() => [])) { const st = await fsp.stat(path.join(d, f)).catch(() => null); if (st) { size += st.size; t = Math.max(t, st.mtimeMs); } }
        list.push({ d, size, t });
      }
      let total = list.reduce((a, x) => a + x.size, 0); if (total <= THUMB_MAX) return;
      list.sort((a, b) => a.t - b.t);
      for (const x of list) { if (total <= THUMB_MAX * 0.8) break; await fsp.rm(x.d, { recursive: true, force: true }).catch(() => {}); total -= x.size; }
      log("info", "vignettes : place libérée (anciennes vignettes retirées)");
    })().catch(() => {});
  }
  async function thumb(id, t) {
    const it = S.lib.byId.get(id); if (!it || !it.file || !V.bins().ffmpeg) return null;
    const at = Math.max(0, Math.round((Number(t) || 0) / 10) * 10), d = path.join(dir("vignettes"), safe(id)), f = path.join(d, at + ".jpg");
    if (fs.existsSync(f)) return f;
    try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
    if (TH.running >= 2) await new Promise((r) => TH.wait.push(r));
    TH.running++;
    try {
      if (fs.existsSync(f)) return f;
      const part = f + ".part.jpg";
      const ok = await new Promise((resolve) => {
        const p = low(["-hide_banner", "-loglevel", "error", "-nostdin", "-ss", String(at), "-i", it.file, "-frames:v", "1", "-an", "-sn", "-vf", "scale=240:-2", "-q:v", "6", "-y", part]);
        if (!p) return resolve(false);
        const k = setTimeout(() => { try { p.kill("SIGKILL"); } catch (_) {} }, 20000);
        p.on("error", () => resolve(false)); p.on("close", (c) => { clearTimeout(k); resolve(c === 0); });
      });
      if (ok && fs.existsSync(part)) { fs.renameSync(part, f); thumbTidy(); return f; }
      return null;
    } finally { TH.running--; const n = TH.wait.shift(); if (n) n(); }
  }

  // ---------- versions préparées à l'avance (salon) et légères (hors-ligne) ----------
  const P = new Map();   // "id|profil" → { id, profil, title, state: "attente"|"en cours"|"prête"|"erreur", pct }
  const prepFile = (id, profil) => path.join(dir("preparees"), `${safe(id)}.${profil}.mp4`);
  function prepared(id, profil) { const f = prepFile(id, profil); return fs.existsSync(f) ? f : null; }
  function prepare(id, profil) {
    const it = S.lib.byId.get(id); if (!it || !it.file || !["film", "episode"].includes(it.kind)) return { ok: false, err: "Seuls les films et les épisodes se préparent." };
    if (!PROFILS[profil]) return { ok: false, err: "Version inconnue." };
    if (!V.bins().ffmpeg) return { ok: false, err: "ffmpeg n'est pas installé sur le serveur." };
    const key = id + "|" + profil;
    if (prepared(id, profil)) return { ok: true, state: "prête" };
    const off = S.debranche && S.debranche(it); if (off) return off;   // disque débranché : rien à préparer
    if (!P.has(key) || P.get(key).state === "erreur") { P.set(key, { id, profil, title: it.title, state: "attente", pct: 0 }); queue({ kind: "prep", id, profil, key: "prep:" + key }); }
    return { ok: true, state: P.get(key).state };
  }
  async function prepRun(job) {
    const it = S.lib.byId.get(job.id), key = job.id + "|" + job.profil, st = P.get(key); if (!it || !st || st.cancel) { P.delete(key); return; }
    const info = await V.probe(it.file), pr = PROFILS[job.profil], a = V.pickAudio(info || { audio: [] }, null), dur = (info && info.dur) || 0;
    const out = prepFile(job.id, job.profil), part = out + ".part";
    const ch = pr.ch || (a && a.ch > 2 ? 6 : 2);
    const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-nostats", "-progress", "pipe:1", "-i", it.file, "-map", "0:v:0?", ...(a ? ["-map", `0:a:${a.i}`] : []),
      ...V.h264Args({ sdr: !!(info && info.video && info.video.hdr), maxh: pr.maxh, crf: pr.crf, preset: "veryfast" }),
      ...(a ? ["-c:a", "aac", "-b:a", ch > 2 ? pr.ab6 : pr.ab, "-ac", String(ch)] : []), "-sn", "-dn", "-movflags", "+faststart", "-f", "mp4", "-y", part];
    st.state = "en cours"; st.pct = 0; emit({ type: "prepare", id: job.id, profil: job.profil, state: st.state, pct: 0, title: it.title });
    let lastEmit = 0, buf = "";
    const ok = await new Promise((resolve) => {
      const p = low(args, (d) => {   // (dernier argument « true » : mise en pause pendant un film sur la TV)
        buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1);
          const m = /^out_time_(?:ms|us)=(\d+)/.exec(l); if (m && dur) { st.pct = Math.min(99, Math.floor(Number(m[1]) / 1e6 / dur * 100));
            if (Date.now() - lastEmit > 3000) { lastEmit = Date.now(); emit({ type: "prepare", id: job.id, profil: job.profil, state: st.state, pct: st.pct, title: it.title }); } } }
      }, true);
      if (!p) return resolve(false);
      st.proc = p; p.on("error", () => resolve(false)); p.on("close", (c) => resolve(c === 0 && !st.cancel));
    });
    st.proc = null;
    if (ok) { fs.renameSync(part, out); st.state = "prête"; st.pct = 100; log("info", `version ${job.profil} prête : ${it.title}`); }
    else { try { fs.unlinkSync(part); } catch (_) {} if (st.cancel) { P.delete(key); return; } st.state = "erreur"; log("error", `version ${job.profil} impossible : ${it.title}`); }
    emit({ type: "prepare", id: job.id, profil: job.profil, state: st.state, pct: st.pct, title: it.title, done: true, ok });
  }
  function unprepare(id, profil) {
    const key = id + "|" + profil, st = P.get(key);
    if (st) { st.cancel = true; Q.list = Q.list.filter((j) => j.key !== "prep:" + key); if (st.proc) try { st.proc.kill("SIGKILL"); } catch (_) {} P.delete(key); }
    try { fs.unlinkSync(prepFile(id, profil)); } catch (_) {}
    return { ok: true };
  }
  function prepList() {
    const out = [];
    for (const n of (() => { try { return fs.readdirSync(dir("preparees")); } catch (_) { return []; } })()) {
      const m = /^(\w+)\.(salon|leger)\.mp4$/.exec(n); if (!m) continue; const it = S.lib.byId.get(m[1]); let size = 0; try { size = fs.statSync(path.join(dir("preparees"), n)).size; } catch (_) {}
      out.push({ id: m[1], profil: m[2], title: it ? it.title : m[1], state: "prête", pct: 100, size });
    }
    for (const st of P.values()) if (st.state !== "prête") out.push({ id: st.id, profil: st.profil, title: st.title, state: st.state, pct: st.pct });
    return out;
  }

  // ---------- captures d'écran du film sur la TV ----------
  function captures(id) {
    const d = path.join(S.data, "captures", safe(id)); let l = []; try { l = fs.readdirSync(d); } catch (_) { return []; }
    return l.filter((n) => /^\d+\.jpg$/.test(n)).sort().map((n) => ({ name: n, at: Number(n.slice(0, -4)) }));
  }
  const captureFile = (id, name) => /^\d+\.jpg$/.test(name) ? path.join(S.data, "captures", safe(id), name) : "";

  // ---------- la TV (mpv) ----------
  const NIGHT = "@nuit:lavfi=[acompressor=threshold=0.06:ratio=8:attack=5:release=250:makeup=4]";
  const mpvArgs = () => (L.night ? [`--af=${NIGHT}`] : []);
  const osd = (t, ms = 2500) => mpv(["show-text", t, ms]);
  const fr = (n) => String(Math.round(n * 100) / 100).replace(".", ",");
  function started(pl) {
    bgCheck();   // film sur la TV : le travail de fond se met en pause
    pl.lx = { intro: null, credits: 0, introOn: false, cd: null, stay: false, filmCredits: false };
    lookup(pl.key).then((r) => { if (r && r.ok) { pl.lx.intro = r.end > r.start ? [r.start, r.end] : null; pl.lx.credits = r.credits || 0; } }).catch(() => {});
  }
  // quand l'empreinte d'un épisode en cours vient d'être calculée
  function refresh(pl) { if (pl && pl.lx) { const r = get(pl.key); pl.lx.intro = r.end > r.start ? [r.start, r.end] : null; pl.lx.credits = r.credits || 0; } }
  function nextOf(pl) { const s = serieOf(pl.key); if (!s) return null; const eps = s.episodes, i = eps.findIndex((e) => e.id === pl.key); return eps[i + 1] || null; }
  function tick(pl) {
    const x = pl.lx; if (!x) return;
    if (db.eps[pl.key] && db.eps[pl.key].t && !x.got) { x.got = true; refresh(pl); }
    // générique de début : la télécommande affiche « Passer l'intro »
    const inIntro = !!(x.intro && pl.pos >= x.intro[0] - 0.5 && pl.pos < x.intro[1] - 2);
    if (inIntro !== x.introOn) { x.introOn = inIntro; emit({ type: "intro", on: inIntro, pos: pl.pos, end: x.intro ? x.intro[1] : 0 }); }
    // minuteur
    if (L.sleep && L.sleep.until && Date.now() >= L.sleep.until) { L.sleep = null; emit({ type: "sleep", off: true }); osd("Bonne nuit !", 3000); mpv(["set_property", "pause", true]); setTimeout(() => o.stop(), 3500); return; }
    // générique de fin
    if (!pl.dur || x.cd || x.stay) return;
    const isEp = pl.kind === "serie" || pl.kind === "episode", at = x.credits > 0 ? x.credits : isEp ? pl.dur - 12 : 0;
    if (!at || pl.pos < at) return;
    const nx = isEp ? nextOf(pl) : null;
    if (!nx) { if (!x.filmCredits && x.credits) { x.filmCredits = true; emit({ type: "credits", id: pl.id, key: pl.key, film: true }); } return; }
    if (S.cfg.autoNext === false || (L.sleep && L.sleep.end)) { if (!x.told) { x.told = true; emit({ type: "credits", id: pl.id, key: pl.key, next: `S${nx.s}E${nx.e}`, left: 0 }); } return; }
    // compte à rebours : épisode suivant dans 10 s (sauf si on choisit de rester)
    x.cd = { left: 10 };
    const step = () => {
      if (S.player !== pl || x.stay) { clearInterval(x.cd.tm); return; }
      emit({ type: "credits", id: pl.id, key: pl.key, next: `S${nx.s}E${nx.e}`, left: x.cd.left });
      osd(`Épisode suivant (S${nx.s}E${nx.e}) dans ${x.cd.left} s`, 1200);
      if (x.cd.left-- <= 0) { clearInterval(x.cd.tm); o.next(); }
    };
    x.cd.tm = setInterval(step, 1000); step();
  }
  function stopped(pl) { const t = setTimeout(bgCheck, 2000); if (t.unref) t.unref(); if (pl.lx && pl.lx.cd) clearInterval(pl.lx.cd.tm); if (L.sleep && L.sleep.end) { L.sleep = null; emit({ type: "sleep", off: true }); } }
  // commandes en plus pour la télécommande ; null = pas pour nous
  async function cmd(c, b, pl) {
    const val = async (prop) => { const r = await mpv(["get_property", prop]); return r && typeof r.data === "number" ? r.data : 0; };
    if (c === "speed") { const v = Math.max(0.5, Math.min(2, Number(b.value) || 1)); const r = await mpv(["set_property", "speed", v]); osd(`Vitesse ×${fr(v)}`); return { ok: !!r, speed: v }; }
    if (c === "subdelay" || c === "audiodelay") {
      const prop = c === "subdelay" ? "sub-delay" : "audio-delay";
      if (b.reset) await mpv(["set_property", prop, 0]); else await mpv(["add", prop, Math.max(-5, Math.min(5, Number(b.sec) || 0))]);
      const v = await val(prop); osd(`${c === "subdelay" ? "Sous-titres" : "Son"} : ${v > 0 ? "+" : ""}${fr(v)} s`); return { ok: true, value: v };
    }
    if (c === "night") { L.night = b.on == null ? !L.night : !!b.on; await mpv(L.night ? ["af", "add", NIGHT] : ["af", "remove", "@nuit"]); osd(L.night ? "Mode nuit : sons forts adoucis" : "Mode nuit coupé"); return { ok: true, night: L.night }; }
    if (c === "chapter") { const r = await mpv(["set_property", "chapter", Math.max(0, Number(b.n) || 0)]); return { ok: !!r && r.error === "success" }; }
    if (c === "chapters") { const it = S.lib.byId.get(pl.key), info = it && it.file ? await V.probe(it.file) : null; return { ok: true, chapters: info ? info.chapters : [] }; }
    if (c === "screenshot") {
      const d = path.join(S.data, "captures", safe(pl.key)); try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
      const name = Date.now() + ".jpg", f = path.join(d, name), r = await mpv(["screenshot-to-file", f, "video"]);
      if (!r || r.error !== "success") return { ok: false, err: "Capture impossible." };
      osd("Capture enregistrée"); emit({ type: "capture", key: pl.key, id: pl.id, name }); return { ok: true, key: pl.key, name };
    }
    if (c === "sleep") {
      if (b.off) L.sleep = null; else if (b.end) L.sleep = { end: true }; else L.sleep = { until: Date.now() + Math.max(1, Math.min(600, Number(b.min) || 30)) * 60000, min: Number(b.min) || 30 };
      osd(!L.sleep ? "Minuteur coupé" : L.sleep.end ? "Arrêt à la fin de l'épisode" : `Arrêt dans ${L.sleep.min} min`);
      emit({ type: "sleep", ...(L.sleep || { off: true }) }); return { ok: true, sleep: L.sleep };
    }
    if (c === "stay") { if (pl.lx) { pl.lx.stay = true; if (pl.lx.cd) clearInterval(pl.lx.cd.tm); } osd("D'accord : on regarde le générique."); emit({ type: "credits", id: pl.id, key: pl.key, off: true }); return { ok: true }; }
    if (c === "skipcredits") {
      if (nextOf(pl)) return o.next();
      S.prog[pl.key] = { pos: 0, dur: pl.dur, t: Date.now(), seen: true }; o.saveProg(); await o.stop(); return { ok: true };
    }
    if (c === "skipintro") { const e = pl.lx && pl.lx.intro; const r = await mpv(e && pl.pos < e[1] ? ["seek", e[1], "absolute"] : ["seek", 85, "relative"]); return { ok: !!r && r.error === "success" }; }
    if (c === "state") { return { ok: true, speed: await val("speed") || 1, subDelay: await val("sub-delay"), audioDelay: await val("audio-delay"), night: L.night, sleep: L.sleep }; }
    return null;
  }
  // nouvelle bibliothèque : on calcule à l'avance les génériques des séries (priorité basse)
  // (les séries d'un disque débranché, gardées hors ligne, attendent son retour : l'analyse d'après les reprendra)
  function warm() { if (!V.bins().ffmpeg || S.cfg.introScan === false) return; for (const s of S.lib.items) if (s.kind === "serie" && !(s.pub && s.pub.unplugged)) for (const e of s.episodes || []) if (!db.eps[e.id] || !db.eps[e.id].t) { if (!e.file) continue; queue({ kind: "fp", id: e.id, key: "fp:" + e.id }); } }

  return { get, lookup, mark, thumb, prepare, prepared, unprepare, prepList, captures, captureFile, mpvArgs, started, tick, stopped, cmd, warm, PROFILS, _db: db, _queue: Q };
}

module.exports = { createLecture, fingerprint, match, fromChapters };
