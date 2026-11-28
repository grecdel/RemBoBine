# Les sons de démarrage par époque (réglage « Époque du salon ») : web/demarrage/<époque>.ogg.
# Tous gardent la charpente du jingle d'origine (note.py, époque « Aujourd'hui », qui ne change pas) :
#   un bruit d'objet de l'époque qui se met en route → LA MÊME NOTE (mi 3, 164,8 Hz), très fondue, qui enfle jusqu'à son
#   plein (2,70 s) → tenue → fin lisse ; 5,15 s ; −14 LUFS. Seul le timbre de la note change d'une époque à l'autre.
# Règles du propriétaire : UNE seule hauteur à la fois (la note = une fondamentale et ses harmoniques exactes, jamais d'accord
# ni de voix désaccordée, pas de glissando) ; les bruits d'objets sont des bruits SANS hauteur (les tintements aigus des
# enregistrements sont coupés par un filtre) ; ni trou, ni clac parasite ; entrée de la note imperceptible.
#
#   python3 outils/jingle/epoques.py <dossier des enregistrements> [époque…]
# (variantes à faire écouter : ESSAIS=<dossier> python3 … <enregistrements> troubadour_1 troubadour_2 troubadour_3)
# Le dossier contient les enregistrements CC0, sous leur nom d'origine : BigSoundBank par numéro (0359, 1093, 1715, 2545,
# 0193, 0587, 2876, 2191) et VSCO-2-CE (Oboe_Sus_F3_v3_Main, Oboe_Sus_A#3_v3_Main ; pour les variantes d'écoute seulement :
# LDFlute_susNV_E3_v3_1, LDFlute_susNV_A3_v3_1, KSHarp_E3_mf, KSHarp_G3_mf,
# KSHarp_B3_mf, rtomtom_frame2) : voir ci/licences/Jingle-CREDITS.txt. Écrit web/demarrage/<époque>.ogg et affiche les mesures
# (plein de la note = « franc » de la table DEM de web/index.html, sonie, crête, pureté : part de l'énergie tonale qui tombe
# sur les harmoniques du mi). Avec SPECTRO=<dossier>, dessine aussi le spectrogramme de chaque son.
import subprocess, sys, os, re, glob, wave
import numpy as np
from scipy import signal

SR = 48000
MI3 = 164.814
TD, GONFLE, TENUE, FIN = 0.95, 1.75, 0.9, 1.5        # la note naît à 0,95 s, plein à 2,70 s, tenue, extinction (comme l'origine)
TF, FIN_T = TD + GONFLE, TD + GONFLE + TENUE
N = int((TD + GONFLE + TENUE + FIN + 0.05) * SR)
T = np.arange(N) / SR
ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "..", "web", "demarrage"))


def lisse(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def filt(x, f, sorte="low", ordre=2):
    return signal.sosfiltfilt(signal.butter(ordre, f, sorte, fs=SR, output="sos"), x, axis=0)


def lire(dossier, num):
    f = (glob.glob(os.path.join(dossier, glob.escape(num) + ".*")) or [None])[0]
    if not f:
        sys.exit("enregistrement absent : " + num)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(float)


def seg(x, a, b, fin_in=0.005, fin_out=0.03):
    y = x[int(a * SR):int(b * SR)].copy()
    i, o = int(fin_in * SR), int(fin_out * SR)
    y[:i] *= np.sin(np.linspace(0, np.pi / 2, i)) ** 2
    y[-o:] *= np.cos(np.linspace(0, np.pi / 2, o)) ** 2
    return y


def niveau(y, crete):
    return y * (crete / (np.abs(y).max() + 1e-9))


def poser(p, y, t, pan=0.5):
    i = int(t * SR)
    y = y[:max(0, len(p) - i)]
    p[i:i + len(y), 0] += y * np.cos(pan * np.pi / 2) * 1.414
    p[i:i + len(y), 1] += y * np.sin(pan * np.pi / 2) * 1.414


def note(poids, fc0, fc1, souffle=0.0, tremolo=0.0, graine=4, forme=None, grain=0.0):
    """LA note : mi 3, hauteur fixe ; poids(k) = niveau de l'harmonique k (le timbre de l'époque) ; le filtre s'ouvre de fc0 à
    fc1 pendant qu'elle enfle. Phases fixes, la même chose à gauche et à droite (rien ne s'annule sur un haut-parleur unique)."""
    n = int((GONFLE + TENUE + FIN) * SR)
    t = np.arange(n) / SR
    x = np.clip(t / GONFLE, 0, 1)
    u = np.clip((t - GONFLE - TENUE) / FIN, 0, 1)
    ph = 2 * np.pi * MI3 * t
    fc = (fc0 * (fc1 / fc0) ** (lisse(x) ** 1.4)) * (1 - 0.55 * lisse(u))
    r = np.random.default_rng(graine)
    y = np.zeros((n, 2))
    for k in range(1, int(5200 / MI3) + 1):
        w = poids(k)
        if w <= 0:
            continue
        a = w / (1 + (k * MI3 / fc) ** 2)
        if forme:                                               # la caisse ou la bouche : des bosses dans le timbre (jamais une autre hauteur)
            a = a * forme(k * MI3, x)
        y += (a * np.sin(k * ph + r.uniform(0, 2 * np.pi)))[:, None]
    env = lisse(x) ** 2.4 * np.cos(u * np.pi / 2) ** 2          # entrée très fondue (courbe en S partie de rien), tenue, extinction
    if tremolo:                                                 # un léger battement de VOLUME (jamais de hauteur), qui vient avec le plein
        env = env * (1 + tremolo * lisse((t - GONFLE * 0.6) / GONFLE) * np.sin(2 * np.pi * 5.6 * t))
    if grain:                                                   # le grain d'une corde frottée : le VOLUME frémit, lentement et au hasard
        env = env * (1 + grain * filt(r.standard_normal(n), 9, "low") * 12)
    y = np.tanh(y / np.abs(y).max() * 1.2)
    y *= env[:, None]
    y /= np.sqrt((y[int((GONFLE + 0.2) * SR):int((GONFLE + 0.8) * SR)] ** 2).mean())
    y *= 0.14
    if souffle:                                                 # le souffle de l'instrument : du bruit, sans hauteur
        b = filt(filt(r.standard_normal(n), 500, "high"), 3800) * souffle * env
        y += b[:, None]
    return y


def sortie_douce():
    return np.cos(np.clip((T - FIN_T) / FIN, 0, 1) * np.pi / 2) ** 2


def sous_la_note(depuis=TD + 0.5, reste=0.3):
    """les bruits d'objets se retirent sous la note qui enfle"""
    return 1 - (1 - reste) * lisse((T - depuis) / (GONFLE - 0.4))


def lufs(p):
    tmp = os.path.join(SORTIE, "_tmp.wav")
    ecrire_wav(tmp, p)
    o = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", tmp, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    os.remove(tmp)
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", o)[-1])


def ecrire_wav(f, p):
    w = wave.open(f, "wb")
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(p, -1, 1) * 32767).astype(np.int16).tobytes())
    w.close()


def purete(p, depuis=0.0):
    """Pendant la tenue, entre 100 et 3000 Hz : part de l'énergie des raies (ce qui dépasse le fond de bruit) qui tombe sur une
    harmonique du mi (à la largeur de la fenêtre d'analyse près : ±26 Hz). Et, sur tout le fichier, les raies étrangères qui durent (une hauteur concurrente)."""
    m = p.mean(1)
    fr, tt, S = signal.spectrogram(m, SR, window="blackmanharris", nperseg=8192, noverlap=8192 - 512, nfft=16384)
    ok = (fr >= 100) & (fr <= 3000)
    fr, S = fr[ok], S[ok]
    fond = signal.medfilt2d(S, [41, 1]) + 1e-16
    raie = S > fond * 30                                           # une raie = 15 dB au-dessus du fond voisin
    harm = np.abs(fr / MI3 - np.round(fr / MI3)) * MI3 < 26
    k = (tt >= TF) & (tt <= FIN_T)
    e_h = (S[harm][:, k] * raie[harm][:, k]).sum()
    e_x = (S[~harm][:, k] * raie[~harm][:, k]).sum()
    # raies étrangères tenues (≥ 0,15 s d'affilée) et audibles (à moins de 40 dB du plus fort), partout dans le fichier
    fortes = raie & (S > S.max() * 1e-4) & ~harm[:, None] & (tt >= depuis)[None, :]
    duree = 512 / SR
    pires = []
    for i in np.where(fortes.sum(1) * duree >= 0.15)[0]:
        run = best = 0
        for v in fortes[i]:
            run = run + 1 if v else 0
            best = max(best, run)
        if best * duree >= 0.15:
            pires.append((round(float(fr[i])), round(best * duree, 2)))
    return e_h / (e_h + e_x + 1e-30), pires


def finir(nom, p, note_st, dossier=None, quand=TD, melodie=False):
    i0 = int(FIN_T * SR)
    p[i0:] *= sortie_douce()[i0:, None]                            # tout s'éteint avec la note, sur la même courbe
    p = 0.2 * np.tanh(p / 0.2)                                      # les chocs les plus secs sont arrondis : rien ne claque plus fort que la note
    poser_st(p, note_st, quand)
    p = filt(p, 9000)
    k = int(0.12 * SR)
    p[-k:] *= (np.cos(np.linspace(0, np.pi / 2, k)) ** 2)[:, None]
    p[-8:] = 0
    k = int(0.02 * SR)
    p[:k] *= (np.sin(np.linspace(0, np.pi / 2, k)) ** 2)[:, None]
    os.makedirs(SORTIE, exist_ok=True)
    if dossier:
        os.makedirs(dossier, exist_ok=True)
    p *= 10 ** ((-14.0 - lufs(p)) / 20)
    brut = 20 * np.log10(np.abs(p).max())
    p = np.clip(p, -0.89, 0.89)
    tmp = os.path.join(SORTIE, "_" + nom + ".wav")
    ecrire_wav(tmp, p)
    ogg = os.path.join(dossier or SORTIE, nom + ".ogg")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-c:a", "libopus", "-b:a", "56k", "-map_metadata", "-1", "-bitexact", ogg], check=True)
    os.remove(tmp)
    pu, pires = purete(p, 2.35 if melodie else 0.0)             # (un motif : on ne regarde les raies étrangères qu'une fois le mi posé)
    # l'entrée de la note : niveau de la bande du mi (140-190 Hz) juste avant et pendant le début du gonflement
    print("%-10s plein (franc) %d ms ; durée %.2f s ; %.1f LUFS ; crête %.1f dBFS (avant écrêtage %.1f) ; %d octets ; pureté pendant la tenue %.1f %% ; raies étrangères tenues : %s"
          % (nom, round(TF * 1000), len(p) / SR, lufs(p), 20 * np.log10(np.abs(p).max()), brut, os.path.getsize(ogg), pu * 100, pires or "aucune"))
    if os.environ.get("SPECTRO"):
        spectro(p, os.path.join(os.environ["SPECTRO"], "spectro_" + nom + ".png"), nom)
    return p


def poser_st(p, y, t):
    i = int(t * SR)
    y = y[:len(p) - i]
    p[i:i + len(y)] += y


def spectro(p, out, titre):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    x = signal.resample_poly(p.mean(1), 1, 3)
    fr, t, S = signal.spectrogram(x, 16000, window="blackmanharris", nperseg=2048, noverlap=2048 - 96, nfft=8192)
    m = (fr >= 40) & (fr <= 8000)
    D = 10 * np.log10(S[m] + 1e-14)
    D -= D.max()
    fig, ax = plt.subplots(figsize=(14, 7), dpi=100)
    im = ax.pcolormesh(t, fr[m], D, vmin=-80, vmax=0, cmap="magma", shading="auto")
    ax.set_yscale("log")
    ticks = [50, 100, MI3, 2 * MI3, 3 * MI3, 4 * MI3, 1000, 2000, 4000, 8000]
    ax.set_yticks(ticks)
    ax.set_yticklabels(["50", "100", "165 (mi 3)", "330 (×2)", "494 (×3)", "659 (×4)", "1000", "2000", "4000", "8000"])
    ax.axvline(TF, color="w", lw=0.6, ls=":")
    ax.set_xlabel("temps (s) — pointillé : le plein de la note")
    ax.set_ylabel("fréquence (Hz)")
    ax.set_title("Démarrage « %s » : une seule famille de traits horizontaux (le mi et ses harmoniques) ; le reste est du bruit sans hauteur" % titre)
    fig.colorbar(im, label="dB")
    fig.tight_layout()
    fig.savefig(out)
    plt.close(fig)


# ------------------------------------------------------------------ Chaumière (Moyen Âge)
# Demandes du propriétaire, dans l'ordre : de VRAIS sons, pour l'instrument comme pour les objets (rien n'est imité par
# synthèse : tout vient d'enregistrements libres CC0) ; plus de chute, l'enseigne SE BALANCE à sa potence ; et pas de note
# tenue toute droite (« trop juste ») mais un court motif de troubadour qui se pose sur le mi (voir plus bas).
# « chaumiere » (le fichier de l'appli) = le motif au HAUTBOIS (choix du propriétaire : « garde hautbois ») ; les variantes
# d'écoute (troubadour_1 = le même motif à la flûte, l'ancien son) s'écrivent dans
# ESSAIS=<dossier> (troubadour_1, troubadour_2, troubadour_3). vraie_note() (une note tenue ramenée au mi) reste pour d'autres époques.
def _f0(x, vers):
    """la hauteur exacte d'une note tenue (Hz), cherchée autour de « vers »"""
    n = 1 << 16
    s = x[:n] * np.hanning(min(n, len(x[:n])))
    S = np.abs(np.fft.rfft(s, n * 4))
    pas = SR / (n * 4)
    c = np.arange(vers * 0.94, vers * 1.06, 0.02)
    v = [sum(np.log(S[int(round(k * f / pas))] + 1e-12) for k in (1, 2, 3, 4)) for f in c]
    return float(c[int(np.argmax(v))])


def vraie_note(d, num, debut, vers, cible=MI3, sombre=420.0, stable=None):
    """Une vraie note tenue (fichier « num », à partir de « debut » s, autour de « vers » Hz) ramenée à « cible » et mise dans
    notre progression. Le timbre reste celui de l'instrument : au début on n'en entend que le grave (il s'éclaircit en enflant)."""
    x = lire(d, num)[int(debut * SR):]
    f = _f0(x[int(0.2 * SR):], vers)
    pos = np.arange(0, len(x) - 2, f and cible / f)             # lecture à la vitesse qui donne exactement le mi
    y = np.interp(pos, np.arange(len(x)), x)
    y = filt(y, cible * 0.62, "high", 4)                         # (le ronflement de la salle, sous la note, est retiré)
    n = int((GONFLE + TENUE + FIN) * SR)
    if stable:                                                  # la partie stable est trop courte (ici : avant le changement de coup
        per = SR / cible                                        # d'archet) : on la boucle, fondue, sur un nombre entier de périodes
        fondu = int(0.3 * SR)
        boucle = int(round(int((stable * SR - fondu) / per) * per))
        out = np.zeros(n + boucle + fondu)
        w = np.ones(boucle + fondu)
        w[:fondu] = np.linspace(0, 1, fondu)
        w[-fondu:] = np.linspace(1, 0, fondu)
        for k in range(0, n + boucle, boucle):
            m = min(boucle + fondu, len(out) - k)
            out[k:k + m] += (y[:boucle + fondu] * w)[:m]
        y = out[fondu:]
    if len(y) < n:
        sys.exit("note trop courte : " + num)
    y = y[:n]
    # son propre niveau est aplani (une note tenue respire toujours un peu), puis vient notre enveloppe
    e = np.sqrt(np.maximum(filt(y * y, 6, "low"), 0) + 1e-12)
    y = y / np.maximum(e, e.max() * 0.2)
    t = np.arange(n) / SR
    x_ = np.clip(t / GONFLE, 0, 1)
    u = np.clip((t - GONFLE - TENUE) / FIN, 0, 1)
    ouv = lisse(x_) ** 1.3 * (1 - 0.5 * lisse(u))               # de sombre à ouvert, puis il se referme un peu
    y = filt(y, sombre, "low", 2) * (1 - ouv) + y * ouv
    env = lisse(x_) ** 2.4 * np.cos(u * np.pi / 2) ** 2
    y *= env
    y /= np.sqrt((y[int((GONFLE + 0.2) * SR):int((GONFLE + 0.8) * SR)] ** 2).mean())
    return np.stack([y, y], 1) * 0.14, f


def _arrivee(d, rng):
    """Le fond de la Chaumière : l'enseigne ballotte légèrement à sa potence, dans le brouillard (décisions du propriétaire :
    ni chute, ni grand balancement). Elle grince à peine à chaque aller-retour (0,18 s, 0,81 s, 1,44 s, 2,07 s, de moins en
    moins), ses chaînes cliquettent à peine, un petit vent."""
    ch, ba, ve = lire(d, "0359"), lire(d, "1093"), lire(d, "1715")
    p = np.zeros((N, 2))
    for i, (a, b, quand, g, pan) in enumerate(((2.55, 3.20, 0.18, 0.055, 0.4), (5.35, 5.95, 0.81, 0.045, 0.6), (8.15, 8.72, 1.44, 0.035, 0.45), (10.95, 11.45, 2.07, 0.022, 0.55))):
        c = filt(filt(seg(ba, a, b, 0.05, 0.15), 4800, "low", 4), 220, "high")
        poser(p, niveau(c, g), quand, pan)
        # (les maillons tintent vers 5,8 et 9,4 kHz dans l'enregistrement : coupés, il reste le cliquetis)
        m = filt(filt(seg(ch, 0.95 + 0.2 * i, 1.22 + 0.2 * i, 0.03, 0.08), 4300, "low", 6), 480, "high", 4)
        poser(p, niveau(m, g * 0.5), quand + 0.3, 1 - pan)
    # un petit vent dans la ruelle, continu
    v = filt(filt(ve[int(2 * SR):int(2 * SR) + N].copy(), 2500, "low"), 120, "high")
    v = filt(v, [215, 300], "bandstop", 3)                         # (un léger sifflement du vent retiré : rien ne doit tenir une hauteur)
    v = v / (np.sqrt((v ** 2).mean()) + 1e-9) * 0.034
    eg = lisse(T / 0.25)
    p[:, 0] += v * eg
    p[:, 1] += np.roll(v, 211) * eg
    return p


# ---- Le motif de troubadour (demande du propriétaire : « les notes sont trop justes, il faut adapter au style plus troubadour »)
# Un court geste de musicien, à UNE voix, en mode ancien (dorien de mi), qui se pose sur le mi final ; celui-ci enfle un peu
# et s'éteint. Joué « à la main » : durées inégales, nuances, un ornement, la hauteur de chaque note respire de quelques
# centièmes de ton (elle arrive un peu par en dessous), rien n'est calé sur une grille. Chaque note est un vrai enregistrement
# (VSCO-2-CE, CC0) lu à la vitesse qui donne sa hauteur (deux demi-tons d'écart au plus).
def _joue(d, num, f_src, f_note, dur, force, rng, tenue=False, pince=False, lie=False):
    """une note : (échantillons, niveau) — attaque naturelle de l'enregistrement, hauteur vivante, fin relâchée"""
    x = lire(d, num)
    i0 = int(np.argmax(np.abs(x) > 0.06 * np.abs(x).max()))
    x = x[max(0, i0 + int((0.09 if lie else -0.012) * SR)):]      # (note liée à la précédente : sans son début de souffle)
    n = int(dur * SR)
    t = np.arange(n) / SR
    vit = (4.0 * np.sin(2 * np.pi * 1.3 * t + rng.uniform(0, 6.28)) + 3.0 * np.sin(2 * np.pi * 2.9 * t + rng.uniform(0, 6.28))) * (0.5 if tenue else 1)
    cents = -14 * np.exp(-t / 0.05) + vit + rng.uniform(-5, 5) * (0 if tenue else 1)   # la note arrive par en dessous, respire, n'est jamais tout à fait « au cordeau »
    if tenue:
        cents *= 1 - lisse((t - 0.25) / 0.5) * 0.85               # le mi final se pose, juste
    pos = np.cumsum(f_note / f_src * 2 ** (cents / 1200))
    y = np.interp(pos, np.arange(len(x)), x)
    y = filt(y, f_note * 0.6, "high", 4)
    ref = np.sqrt((y[int(0.08 * SR):int(min(dur, 0.5) * SR)] ** 2).mean()) + 1e-9
    y = y / ref * force
    if lie:
        k = int(0.03 * SR)
        y[:k] *= np.sin(np.linspace(0, np.pi / 2, k)) ** 2
    k = int((0.07 if pince else 0.09) * SR)                     # (la corde est étouffée du doigt, sans claquer)
    y[-k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    return y


# Demande du propriétaire : pas de musique sur un écran encore vide. L'enseigne est lisible vers 0,5 s (voir « arrive » de la
# Chaumière dans web/index.html) : le motif entier est donc décalé de DEPART, sa première note part à 0,72 s ; avant, il n'y a
# que le vent et le premier grincement. Le plein du mi final ne bouge pas (2,70 s) : il enfle simplement un peu plus vite.
DEPART = 0.20


def _troubadour(d, nom, notes, finale, dossier, tambour=False, graine=None):
    """notes : [(début s, fichier, hauteur du fichier, hauteur jouée, durée, force)] ; finale : la même chose pour le mi final
    (sa durée court jusqu'au bout). Le mi final enfle jusqu'au plein (2,70 s), tient, s'éteint."""
    rng = np.random.default_rng(graine or len(nom) * 7 + 3)
    p = _arrivee(d, rng)
    p *= (1 - 0.5 * lisse((T - 0.5 - DEPART) / 0.6))[:, None]         # le fer et le vent laissent la place à la musique
    m = np.zeros(N)
    notes = [(n_[0] + DEPART,) + tuple(n_[1:]) for n_ in notes]
    finale = (finale[0] + DEPART,) + tuple(finale[1:])
    for k_, (t0, num, fs_, fn, dur, force) in enumerate(notes):
        y = _joue(d, num, fs_, fn, dur + 0.07, force, rng, pince=finale[-1], lie=k_ > 0 and not finale[-1])
        i = int(t0 * SR)
        m[i:i + len(y)] += y[:N - i]
    t0, num, fs_, fn, force, pince = finale
    y = _joue(d, num, fs_, fn, N / SR - t0 - 0.02, 1.0, rng, tenue=True, pince=pince, lie=not pince)
    t = np.arange(len(y)) / SR + t0
    if not pince:                                                   # un souffle tenu : il enfle, tient, s'éteint
        y *= (force + (1 - force) * lisse((t - t0) / (TF - t0))) * np.cos(np.clip((t - FIN_T) / FIN, 0, 1) * np.pi / 2) ** 2
    else:                                                           # une corde pincée : elle sonne et s'éteint d'elle-même, la fin est adoucie
        y *= np.cos(np.clip((t - FIN_T - 0.3) / (FIN - 0.3), 0, 1) * np.pi / 2) ** 2
    i = int(t0 * SR)
    m[i:i + len(y)] += y[:N - i]
    k = (T >= TF + 0.1) & (T <= TF + 0.7)
    m *= 0.14 / np.sqrt((m[k] ** 2).mean())
    if pince:
        m = 0.2 * np.tanh(m / np.abs(m).max() * 2.2)                # (une corde pincée se règle sur ses attaques, un peu arrondies, pas sur sa tenue)
    if tambour:                                                     # un tout petit tambourin sur cadre, trois coups légers
        tb = lire(d, "rtomtom_frame2")
        j = int(np.argmax(np.abs(tb) > 0.1 * np.abs(tb).max()))
        coup = filt(tb[max(0, j - 200):j + int(0.5 * SR)].copy(), 5000)
        coup *= np.exp(-np.arange(len(coup)) / (0.16 * SR))
        for (q, g) in tambour:
            ii = int((q + DEPART) * SR)
            m[ii:ii + len(coup)] += niveau(coup, g)[:N - ii]
    return finir(nom, p, np.stack([m, m], 1), dossier, quand=0.0, melodie=True)


FL_E, FL_A = ("LDFlute_susNV_E3_v3_1", 329.63), ("LDFlute_susNV_A3_v3_1", 440.0)
SOL4, LA4, SI4, FAD4, MI4 = 392.0, 440.0, 493.88, 369.99, 2 * MI3
MOTIF_FLUTE = [(0.52, *FL_A, SOL4, 0.36, 0.62), (0.85, *FL_A, LA4, 0.38, 0.78), (1.20, *FL_A, SI4, 0.12, 0.6), (1.30, *FL_A, LA4, 0.25, 0.7),
               (1.52, *FL_E, FAD4, 0.17, 0.72), (1.67, *FL_A, SOL4, 0.09, 0.55), (1.745, *FL_E, FAD4, 0.30, 0.66)]   # (… fa♯ avec son mordant)


# Le hautbois (retenu par le propriétaire) : deux vraies notes tenues sans vibrato, fa 4 et si bémol 4 (VSCO-2-CE, CC0), lues à
# la vitesse qui donne chaque hauteur du motif (deux demi-tons d'écart au plus).
HB_F, HB_B = ("Oboe_Sus_F3_v3_Main", 349.6), ("Oboe_Sus_A#3_v3_Main", 466.6)
MOTIF_HAUTBOIS = [(t, *(HB_F if fn < 400 else HB_B), fn, dur, force) for (t, _a, _b, fn, dur, force) in MOTIF_FLUTE]


def chaumiere(d, dossier=None, nom="chaumiere"):                  # le son de l'appli : hautbois, sur le fer, les chaînes et le vent
    return _troubadour(d, nom, MOTIF_HAUTBOIS, (2.01, *HB_F, MI4, 0.62, False), dossier, graine=227)   # (la prise écoutée et retenue)


def troubadour_1(d, dossier=None):                                 # 1) le même motif à la flûte (l'ancien son)
    return _troubadour(d, "troubadour_1", MOTIF_FLUTE, (2.01, *FL_E, MI4, 0.62, False), dossier)


def troubadour_2(d, dossier=None):                                 # 2) corde pincée seule (harpe : la plus proche d'un luth en vrai son libre)
    h = lambda n, f: ("KSHarp_%s_mf" % n, f)
    motif = [(0.50, *h("G3", 195.3), 196.0, 0.40, 0.8), (0.86, *h("B3", 245.4), 246.94, 0.38, 1.0), (1.21, *h("B3", 245.4), 220.0, 0.36, 0.8),
             (1.50, *h("G3", 195.3), 196.0, 0.10, 0.6), (1.585, *h("G3", 195.3), 185.0, 0.50, 0.85)]
    return _troubadour(d, "troubadour_2", motif, (2.04, *h("E3", 164.2), MI3, 1.0, True), dossier)


def troubadour_3(d, dossier=None):                                 # 3) flûte et tout petit tambourin
    return _troubadour(d, "troubadour_3", MOTIF_FLUTE, (2.01, *FL_E, MI4, 0.62, False), dossier, tambour=((0.50, 0.035), (0.85, 0.02), (1.30, 0.024), (2.01, 0.04)))


# ------------------------------------------------------------------ Années 50
# Le juke-box : une pièce tombe dans la fente (0,05 s), roule, bascule le mécanisme (0,38 s) ; il tourne et cliquette, le bras
# se pose sur le disque (1,25 s), le sillon souffle et craque doucement jusqu'à la fin ; la note (un orgue électrique chaud,
# léger battement de volume) enfle dessous. Repères pour l'image (ms) : pièce 50, mécanisme 380, bras posé 1250.
def annees50(d):
    rng = np.random.default_rng(12)
    pi, th, vi, si = lire(d, "0193"), lire(d, "2191"), lire(d, "0587"), lire(d, "2876")
    p = np.zeros((N, 2))
    # la pièce : un seul petit choc de métal (tintement aigu coupé), puis elle roule dans la glissière (bruit haché)
    i0 = int(np.argmax(np.abs(pi[:SR]) > 0.2 * np.abs(pi[:SR]).max()))
    choc = filt(filt(pi[max(0, i0 - 96):i0 + int(0.07 * SR)].copy(), 5200, "low", 4), 700, "high")
    choc *= np.exp(-np.arange(len(choc)) / (0.022 * SR))
    poser(p, niveau(choc, 0.20), 0.05, 0.4)
    dd = int(0.26 * SR)
    tt = np.arange(dd) / SR
    roule = filt(filt(rng.standard_normal(dd), 1100, "high"), 3600) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * np.cumsum(38 - 60 * tt + rng.standard_normal(dd) * 6) / SR))) * np.sin(np.pi * tt / 0.26) ** 1.5
    poser(p, niveau(roule, 0.10), 0.10, 0.45)
    # le mécanisme bascule : un déclic (thermostat) lu plus grave et un choc sourd
    clic = signal.resample_poly(th, 2, 1)
    clic = filt(filt(clic, 4800, "low", 4), 150, "high")
    clic *= np.exp(-np.arange(len(clic)) / (0.02 * SR))           # (sans la petite résonance du boîtier : un déclic sec)
    poser(p, niveau(clic, 0.19), 0.375, 0.5)
    dd = int(0.10 * SR)
    sourd = filt(filt(rng.standard_normal(dd), 260, "low", 3), 60, "high") * np.sin(np.pi * np.arange(dd) / dd) ** 2
    poser(p, niveau(sourd, 0.10), 0.37)
    # il tourne : un frottement haché, irrégulier (aucune hauteur), deux petits déclics
    dd = int(0.95 * SR)
    tt = np.arange(dd) / SR
    crans = np.zeros(dd)
    jj = np.cumsum(rng.uniform(0.03, 0.07, 60))
    for q in jj[jj < 0.93]:
        j = int(q * SR)
        e = rng.standard_normal(int(0.012 * SR)) * np.exp(-np.arange(int(0.012 * SR)) / (0.003 * SR))
        crans[j:j + len(e)] += e[:dd - j] * rng.uniform(0.5, 1)
    meca = filt(filt(crans, 500, "high"), 3400) * 1.0 + filt(filt(rng.standard_normal(dd), 350, "high"), 1900) * 0.22
    meca *= lisse(tt / 0.10) * (1 - lisse((tt - 0.72) / 0.23))
    poser(p, niveau(meca, 0.15), 0.42, 0.55)
    poser(p, niveau(filt(filt(th, 5000, "low", 4), 300, "high") * np.exp(-np.arange(len(th)) / (0.012 * SR)), 0.15), 0.93, 0.6)
    # le bras se pose : le petit choc du diamant, puis le sillon (souffle et craquements) jusqu'au bout
    pose = filt(filt(seg(vi, 0.42, 1.30, 0.004, 0.5), 5600, "low", 4), 90, "high")
    poser(p, niveau(pose, 0.17), 1.245, 0.5)
    n2 = N - int(1.6 * SR)
    sillon = filt(filt(si[int(1.0 * SR):int(1.0 * SR) + n2].copy(), 6000, "low", 4), 450, "high")
    sillon = niveau(np.tanh(sillon / (np.abs(sillon).max() * 0.25)), 0.075) * lisse(np.arange(n2) / SR / 0.5) + filt(filt(rng.standard_normal(n2), 400, "high"), 5000) * 0.004
    p[N - n2:, 0] += sillon
    p[N - n2:, 1] += np.roll(sillon, 173)
    p *= np.where(T < 1.6, sous_la_note(), 1)[:, None] * (1 - 0.45 * lisse((T - 1.6) / 1.0))[:, None]
    orgue = lambda k: {1: 1.0, 2: 0.55, 3: 0.32, 4: 0.22, 6: 0.10, 8: 0.06}.get(k, 0.0)
    return finir("annees50", p, note(orgue, 170, 2400, tremolo=0.05))


# ------------------------------------------------------------------ Cyberpunk
# L'hologramme se compose : des parasites numériques (paquets de bruit haché, 0,03 → 0,6 s), un balayage (un souffle large
# qui monte, 0,5 → 1,7 s), un grésillement de données très fin en fond ; la note (un synthé froid, creux, qui s'ouvre) enfle
# dessous. Tout est fabriqué par synthèse. Repères pour l'image (ms) : parasites 30-600, balayage 500-1700.
def cyberpunk(d=None):
    rng = np.random.default_rng(13)
    p = np.zeros((N, 2))

    def hache(n, pas):                                             # bruit « numérique » : valeurs tenues sur des durées inégales
        y = np.zeros(n)
        i = 0
        while i < n:
            k = int(rng.uniform(0.4, 1.8) * pas) + 1
            y[i:i + k] = rng.uniform(-1, 1)
            i += k
        return y
    # les parasites : des paquets brefs, serrés puis espacés
    t0 = 0.03
    for k in range(11):
        dd = int(rng.uniform(0.018, 0.055) * SR)
        e = filt(filt(hache(dd, rng.uniform(3, 14)), 700, "high"), 7500) * np.sin(np.pi * np.arange(dd) / dd) ** 0.5
        poser(p, niveau(e, rng.uniform(0.08, 0.16)), t0, rng.uniform(0.2, 0.8))
        t0 += dd / SR + rng.uniform(0.004, 0.05) * (1 + k * 0.12)
    # le balayage : du bruit dans une bande LARGE dont le centre monte (un souffle, pas un sifflement)
    dd = int(1.25 * SR)
    tt = np.arange(dd) / SR
    b = rng.standard_normal(dd)
    bal = np.zeros(dd)
    blocs = 64
    L = dd // blocs
    for q in range(blocs):                                         # (filtre recalculé par petits blocs fondus)
        fcq = 260 * (5200 / 260) ** ((q + 0.5) / blocs)
        y = signal.sosfiltfilt(signal.butter(1, [fcq / 1.9, min(fcq * 1.9, 20000)], "band", fs=SR, output="sos"), b)
        w = np.zeros(dd)
        a, z = max(0, q * L - L // 2), min(dd, (q + 1) * L + L // 2)
        w[a:z] = np.hanning(z - a)
        bal += y * w
    bal *= np.sin(np.pi * tt / 1.25) ** 1.6 * (1 + 0.25 * hache(dd, 900))
    poser(p, niveau(bal, 0.10), 0.48, 0.5)
    # le grésillement de données, en fond
    c = filt(filt(hache(N, 5), 2400, "high"), 8500) * 0.010 * (0.6 + 0.4 * np.abs(hache(N, 2600)))
    eg = lisse(T / 0.4) * np.where(T < TF, 0.6 + 0.4 * np.clip(T / TF, 0, 1) ** 2, 0.5 + 0.5 * np.exp(-(T - TF) / 0.5))
    p[:, 0] += c * eg
    p[:, 1] += np.roll(c, 149) * eg
    p *= sous_la_note(reste=0.45)[:, None]
    froid = lambda k: abs(np.sin(k * np.pi * 0.30)) / k ** 0.9      # une onde rectangulaire étroite : creuse, un peu nasale
    return finir("cyberpunk", p, note(froid, 140, 4200, graine=7))


EPOQUES = {"chaumiere": chaumiere, "annees50": annees50, "cyberpunk": cyberpunk}
ESSAIS = {"troubadour_1": troubadour_1, "troubadour_2": troubadour_2, "troubadour_3": troubadour_3}
if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__ or "python3 outils/jingle/epoques.py <dossier des enregistrements> [époque…]")
    for e in (sys.argv[2:] or list(EPOQUES)):
        if e in ESSAIS:                                            # une variante à faire écouter : hors de l'appli
            ESSAIS[e](sys.argv[1], os.environ.get("ESSAIS") or sys.exit("ESSAIS=<dossier> pour les variantes"))
        else:
            EPOQUES[e](sys.argv[1])
