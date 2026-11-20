-- Rembobine — l'interface du lecteur de films (mpv), à la place de celle d'origine de mpv.
--
-- Demande du propriétaire : « l'interface lors de la lecture, je ne trouve pas ça super clair » (petite barre
-- technique : nom de fichier brut, « 1/3 », « 4/6 », « Cache »). Ici, tout est dessiné par ce script :
--   • en haut : retour à Rembobine, le vrai titre, l'heure et l'heure de fin du film ;
--   • en bas : temps écoulé, grande barre d'avancement (chapitres), temps restant ; gros boutons (chapitre
--     précédent, −10 s, lecture/pause, +30 s, chapitre suivant), volume, « Langue », « Sous-titres », plein écran ;
--   • « Langue » et « Sous-titres » ouvrent une liste en clair (« Français · son 5.1 », « Aucun »…) ; le choix est
--     retenu pour les films suivants ;
--   • en pause : le titre en grand, ce qu'il reste, Reprendre / Revoir depuis le début / Quitter le film.
-- La barre apparaît quand on bouge la souris ou qu'on appuie sur une touche, et s'efface toute seule.
-- Clavier et télécommande : Espace = pause ; ← → = 10 s ; ↑ ↓ = volume ; Entrée = pause et commandes au clavier
-- (← → pour choisir un bouton, Entrée pour l'activer) ; Échap = fermer la liste, puis quitter le film.
--
-- Lancé par l'appli (app/main.js et app/serveur/serveur.js) avec :
--   --osc=no --osd-bar=no --script=<ce fichier>
--   --script-opts=rembobine-titre=…,rembobine-sous=…,rembobine-prefs=<fichier où retenir langue et sous-titres>
-- Aucune dépendance : seulement ce que mpv fournit aux scripts Lua (mp, mp.options, mp.utils).

local mp = require "mp"
local utils = require "mp.utils"
local options = require "mp.options"

local o = {
    titre = "",          -- le titre propre (sinon : tiré du nom du fichier)
    sous = "",           -- « Film », « Série · saison 1, épisode 3 »…
    genre = "film",      -- film | serie | album : change quelques mots (« Fin du film à », « Quitter le film »)
    prefs = "",          -- fichier où retenir la langue, les sous-titres et leur taille
    police = "DM Sans",  -- (si elle manque, la police sans empattement du système)
    essai = "",          -- essais automatiques : « fixe » = barre toujours affichée
}
options.read_options(o, "rembobine")

-- couleurs de Rembobine (RRGGBB)
local C = { fond = "0D0E12", surface = "171920", bouton = "171920", trait = "3A3D46", texte = "F3F1ED", doux = "D3D5DB",
    gris = "B4B7C0", accent = "FF4A3D", encre = "10100F", choisi = "262933", blanc = "FFFFFF" }

local MOTS = ({
    film = { fin = "Fin du film à ", quitter = "Quitter le film", langue = "Langue du film", suite = "pour les prochains films" },
    serie = { fin = "Fin de l'épisode à ", quitter = "Quitter la série", langue = "Langue de la série", suite = "pour les prochains épisodes" },
    album = { fin = "Fin à ", quitter = "Arrêter la musique", langue = "Langue", suite = "pour la suite" },
})[o.genre] or nil
if not MOTS then MOTS = { fin = "Fin à ", quitter = "Quitter", langue = "Langue", suite = "pour la suite" } end

local H = 720                 -- hauteur du plan de dessin ; la largeur suit la forme de l'écran
local W = 1280
local ech = 1                 -- pixels de l'écran par unité du plan
local ov = mp.create_osd_overlay("ass-events")

local S = {
    visible = false, jusqua = 0,     -- barre affichée jusqu'à cet instant (mp.get_time)
    souris = { x = -1, y = -1, dedans = false },
    survol = nil,                    -- identifiant de la zone sous la souris
    zones = {},                      -- zones cliquables de la dernière image
    menu = nil,                      -- "audio" | "sub" | nil
    menu_sel = 1, menu_haut = 1,     -- ligne choisie au clavier, première ligne affichée
    glisse = nil,                    -- "temps" | "volume" pendant un glisser
    glisse_pct = nil,
    focus = nil,                     -- { rang = "pause"|"barre"|"haut", i = n } : commandes au clavier
    sub_pos = nil,
    dernier_seek = 0,
}
local prefs = {}

-- =====================================================================
--  Petits outils
-- =====================================================================
local function ass_txt(s)
    s = tostring(s or "")
    s = s:gsub("\\", "\\\239\187\191"):gsub("{", "\\{"):gsub("}", "\\}"):gsub("\n", " ")
    return s
end
local function coul(hex) return "&H" .. hex:sub(5, 6) .. hex:sub(3, 4) .. hex:sub(1, 2) .. "&" end
local function alpha(a) return string.format("&H%02X&", math.max(0, math.min(255, math.floor(a + 0.5)))) end

-- une forme pleine (chemin ASS), posée en (x, y) ; a : 0 = opaque, 255 = invisible ; bord facultatif
local function forme(out, x, y, chemin, hex, a, bord, hexb, ab)
    out[#out + 1] = string.format("{\\an7\\pos(%.1f,%.1f)\\bord%.1f\\shad0\\blur0\\1c%s\\1a%s\\3c%s\\3a%s\\p1}%s{\\p0}",
        x, y, bord or 0, coul(hex), alpha(a or 0), coul(hexb or hex), alpha(ab or a or 0), chemin)
end
local function rect(w, h) return string.format("m 0 0 l %.1f 0 %.1f %.1f 0 %.1f", w, w, h, h) end
local function rrect(w, h, r)
    r = math.min(r, w / 2, h / 2)
    local k = r * 0.5523
    return string.format("m %.1f 0 l %.1f 0 b %.1f 0 %.1f %.1f %.1f %.1f l %.1f %.1f b %.1f %.1f %.1f %.1f %.1f %.1f l %.1f %.1f b %.1f %.1f 0 %.1f 0 %.1f l 0 %.1f b 0 %.1f %.1f 0 %.1f 0",
        r, w - r, w - r + k, w, r - k, w, r, w, h - r, w, h - r + k, w - r + k, h, w - r, h, r, h, r - k, h, h - r + k, h - r, r, r - k, r - k, r)
end
local function cercle(r) return rrect(2 * r, 2 * r, r) end
-- un texte ; an : ancrage ASS (7 haut-gauche, 4 milieu-gauche, 5 centre, 6 milieu-droite, 9 haut-droite…)
local function texte(out, x, y, an, taille, hex, gras, s, a, plus)
    out[#out + 1] = string.format("{\\an%d\\pos(%.1f,%.1f)\\fn%s\\fs%.1f\\b%d\\bord0\\shad0\\blur0\\1c%s\\1a%s%s}%s",
        an, x, y, o.police, taille, gras and 1 or 0, coul(hex), alpha(a or 0), plus or "", ass_txt(s))
end
-- largeur approximative d'un texte (pas de mesure exacte dans mpv : moyenne par caractère)
local function large(s, taille, gras)
    local n = 0
    for _ in tostring(s):gmatch("[%z\1-\127\194-\244][\128-\191]*") do n = n + 1 end
    return n * taille * (gras and 0.5 or 0.47)
end

local function duree(t, signe)
    t = math.max(0, math.floor((t or 0) + 0.5))
    local h, m, s = math.floor(t / 3600), math.floor(t % 3600 / 60), t % 60
    local r = h > 0 and string.format("%d:%02d:%02d", h, m, s) or string.format("%d:%02d", m, s)
    return (signe or "") .. r
end
local function duree_mots(t)
    t = math.max(0, math.floor((t or 0) / 60 + 0.5))
    local h, m = math.floor(t / 60), t % 60
    if h > 0 then return string.format("%d h %02d", h, m) end
    return string.format("%d min", math.max(1, m))
end

-- le titre tiré d'un nom de fichier : « Le.Film.2026.MULTi.2160p.BluRay.x265-XXX.mkv » → « Le Film »
local function titre_propre(nom)
    local t = tostring(nom or ""):gsub("%.[%w]+$", ""):gsub("[%._]+", " ")
    local coupe = { "%f[%d][12][90]%d%d%f[%D]", "%f[%a][Mm][Uu][Ll][Tt][Ii]", "%f[%d]%d%d%d%d?[pP]%f[%A]", "%f[%a][Bb]lu[Rr]ay", "%f[%a]WEB", "%f[%a]HDR",
        "%f[%a][xXhH]26[45]", "%f[%a]VF[FQIi]?%f[%A]", "%f[%a]VOSTFR", "%f[%a]TRUEFRENCH", "%f[%a]FRENCH", "%f[%a]UHD", "%f[%a]REMUX", "%f[%a]4[Kk]%f[%A]" }
    local fin = #t + 1
    for _, p in ipairs(coupe) do
        local i = t:find(p)
        if i and i > 3 and i < fin then fin = i end
    end
    t = t:sub(1, fin - 1):gsub("[%s%-%(%[]+$", ""):gsub("^%s+", "")
    return t ~= "" and t or tostring(nom or "")
end

local LANGUES = { fr = "Français", en = "Anglais", es = "Espagnol", de = "Allemand", it = "Italien", pt = "Portugais", ja = "Japonais",
    ko = "Coréen", zh = "Chinois", ru = "Russe", ar = "Arabe", nl = "Néerlandais", sv = "Suédois", da = "Danois", no = "Norvégien",
    fi = "Finnois", pl = "Polonais", tr = "Turc", el = "Grec", he = "Hébreu", hi = "Hindi", th = "Thaï", cs = "Tchèque", hu = "Hongrois",
    ro = "Roumain", uk = "Ukrainien", ca = "Catalan", vi = "Vietnamien", id = "Indonésien" }
local TROIS = { fre = "fr", fra = "fr", eng = "en", spa = "es", ger = "de", deu = "de", ita = "it", por = "pt", jpn = "ja", kor = "ko",
    chi = "zh", zho = "zh", rus = "ru", ara = "ar", dut = "nl", nld = "nl", swe = "sv", dan = "da", nor = "no", nob = "no", fin = "fi",
    pol = "pl", tur = "tr", gre = "el", ell = "el", heb = "he", hin = "hi", tha = "th", cze = "cs", ces = "cs", hun = "hu", rum = "ro",
    ron = "ro", ukr = "uk", cat = "ca", vie = "vi", ind = "id" }
local function code_langue(l)
    l = tostring(l or ""):lower():gsub("[-_].*$", "")
    return TROIS[l] or (LANGUES[l] and l) or ""
end

-- une piste en clair : ce qu'on lit à gauche, la précision à droite
local function piste_texte(p)
    local c = code_langue(p.lang)
    local t = tostring(p.title or "")
    local nom = LANGUES[c] or (t ~= "" and t) or "Langue inconnue"
    local detail = ""
    if p.type == "audio" then
        local n = p["demux-channel-count"] or p["audio-channels"] or 0
        detail = n >= 8 and "son 7.1" or n >= 6 and "son 5.1" or n == 2 and "stéréo" or n == 1 and "mono" or ""
        if p["visual-impaired"] or t:lower():find("audiodesc") or t:lower():find("malvoyant") then
            nom = nom .. " pour malvoyants"; detail = "audiodescription"
        elseif t:lower():find("comment") then nom = nom .. ", commentaires"
        elseif t:find("VFQ") then nom = nom .. " (Québec)"
        elseif t:find("VFF") then nom = nom .. " (France)"
        elseif t:find("%f[%a]VO%f[%A]") then nom = nom .. " (version originale)" end
    else
        if p.forced or t:lower():find("forc") then detail = "seulement les passages étrangers"
        elseif p["hearing-impaired"] or t:find("SDH") or t:lower():find("malentendant") then detail = "pour sourds et malentendants"
        elseif t ~= "" and LANGUES[c] and not t:lower():find(LANGUES[c]:lower():sub(1, 4), 1, true) and #t <= 28 then detail = t end
    end
    return nom, detail
end
local function pistes(genre)
    local l = {}
    for _, p in ipairs(mp.get_property_native("track-list") or {}) do
        if p.type == genre then l[#l + 1] = p end
    end
    return l
end
local function piste_courte(genre)
    for _, p in ipairs(pistes(genre)) do
        if p.selected then local n = piste_texte(p); return n end
    end
    return genre == "sub" and "Aucun" or "—"
end

-- =====================================================================
--  Ce que l'utilisateur a choisi, retenu d'un film à l'autre
-- =====================================================================
local function lire_prefs()
    if o.prefs == "" then return end
    local f = io.open(o.prefs, "r")
    if not f then return end
    local j = utils.parse_json(f:read("*a") or "")
    f:close()
    if type(j) == "table" then prefs = j end
end
local function garder_prefs()
    if o.prefs == "" then return end
    local f = io.open(o.prefs, "w")
    if not f then return end
    f:write(utils.format_json(prefs) or "{}")
    f:close()
end
-- au chargement d'un film : la langue et les sous-titres retenus, s'ils existent dans ce fichier
mp.add_hook("on_preloaded", 50, function()
    if prefs.langue and prefs.langue ~= "" then
        for _, p in ipairs(pistes("audio")) do
            if code_langue(p.lang) == prefs.langue and not p["visual-impaired"] and not tostring(p.title or ""):lower():find("comment") then
                mp.set_property_native("aid", p.id); break
            end
        end
    end
    if prefs.sous == "aucun" then
        mp.set_property("sid", "no")
    elseif prefs.sous and prefs.sous ~= "" then
        for _, p in ipairs(pistes("sub")) do
            if code_langue(p.lang) == prefs.sous and not p.forced then mp.set_property_native("sid", p.id); break end
        end
    end
    if tonumber(prefs.taille) then mp.set_property_number("sub-scale", math.max(0.6, math.min(2.2, tonumber(prefs.taille)))) end
end)

-- =====================================================================
--  Afficher / cacher
-- =====================================================================
local dessiner   -- (défini plus bas)
local function montrer(secondes)
    S.visible = true
    S.jusqua = math.max(S.jusqua, mp.get_time() + (secondes or 3.5))
    dessiner()
end
local function cacher()
    S.visible = false; S.menu = nil; S.focus = nil; S.survol = nil
    dessiner()
end
local function pause() return mp.get_property_bool("pause") == true end

-- =====================================================================
--  Les actions
-- =====================================================================
local function quitter() mp.commandv("quit") end   -- (lancé avec --save-position-on-quit : la reprise est retenue)
local function bascule_pause() mp.set_property_bool("pause", not pause()); montrer() end
local function saut(s) mp.commandv("seek", s, "relative+exact"); montrer(2.5) end
local function chapitre(d)
    local n = mp.get_property_number("chapters", 0)
    if n > 0 then mp.commandv("add", "chapter", d)
    elseif mp.get_property_number("playlist-count", 1) > 1 then mp.commandv(d > 0 and "playlist-next" or "playlist-prev", "weak") end
    montrer(2.5)
end
local function ouvrir_menu(m)
    if S.menu == m then S.menu = nil else
        S.menu = m; S.menu_haut = 1; S.menu_sel = 1
        local l = pistes(m == "audio" and "audio" or "sub")
        for i, p in ipairs(l) do if p.selected then S.menu_sel = i + (m == "sub" and 1 or 0) end end
    end
    montrer(8)
end
local function choisir_piste(m, p)   -- p : une piste, ou nil pour « Aucun »
    if m == "audio" then
        mp.set_property_native("aid", p.id)
        local c = code_langue(p.lang)
        if c ~= "" then prefs.langue = c end
    else
        if p then mp.set_property_native("sid", p.id); local c = code_langue(p.lang); if c ~= "" and not p.forced then prefs.sous = c end
        else mp.set_property("sid", "no"); prefs.sous = "aucun" end
    end
    garder_prefs()
    S.menu = nil
    montrer(2.5)
end
local function taille_sous(d)
    local v = math.max(0.6, math.min(2.2, (mp.get_property_number("sub-scale", 1) or 1) + d))
    mp.set_property_number("sub-scale", v); prefs.taille = v; garder_prefs(); montrer(8)
end

-- =====================================================================
--  Dessin
-- =====================================================================
local function zone(x0, y0, x1, y1, id, act, glisse)
    S.zones[#S.zones + 1] = { x0 = x0, y0 = y0, x1 = x1, y1 = y1, id = id, act = act, glisse = glisse }
end
local function actif(id, rang, i) return S.survol == id or (S.focus and S.focus.rang == rang and S.focus.i == i) end

-- les petits dessins des boutons (formes pleines, dans un carré de 24, à poser en (x, y))
local ICONES = {
    lecture = "m 7 4.5 l 19 12 7 19.5",
    pause = "m 5.5 4 l 9.5 4 9.5 20 5.5 20 m 14.5 4 l 18.5 4 18.5 20 14.5 20",
    prec = "m 4 5 l 6.6 5 6.6 19 4 19 m 20 5.5 l 20 18.5 9 12",
    suiv = "m 17.4 5 l 20 5 20 19 17.4 19 m 4 5.5 l 15 12 4 18.5",
    recul = "m 12 5 l 13.8 6.8 8.6 12 13.8 17.2 12 19 5 12 m 19 5 l 20.8 6.8 15.6 12 20.8 17.2 19 19 12 12",
    avance = "m 12 5 l 19 12 12 19 10.2 17.2 15.4 12 10.2 6.8 m 5 5 l 12 12 5 19 3.2 17.2 8.4 12 3.2 6.8",
    retour = "m 14.5 4 l 16.6 6.1 10.7 12 16.6 17.9 14.5 20 6.5 12",
    coche = "m 4 12.5 l 6.1 10.4 9.5 13.8 17.9 5.4 20 7.5 9.5 18",
    son = "m 3.5 9.5 l 7.5 9.5 12 6 12 18 7.5 14.5 3.5 14.5 m 14.6 8.6 b 16.6 10.6 16.6 13.4 14.6 15.4 l 15.8 16.6 b 18.4 14 18.4 10 15.8 7.4 m 17.6 5.6 l 16.4 6.8 b 19.3 9.7 19.3 14.3 16.4 17.2 l 17.6 18.4 b 21.2 14.8 21.2 9.2 17.6 5.6",
    muet = "m 3.5 9.5 l 7.5 9.5 12 6 12 18 7.5 14.5 3.5 14.5 m 15 9.4 l 16.2 8.2 18 10 19.8 8.2 21 9.4 19.2 11.2 21 13 19.8 14.2 18 12.4 16.2 14.2 15 13 16.8 11.2",
    langue = "m 4 15 l 4 11 b 4 6.6 7.6 3 12 3 b 16.4 3 20 6.6 20 11 l 20 15 18 15 18 11 b 18 7.7 15.3 5 12 5 b 8.7 5 6 7.7 6 11 l 6 15 m 3 14 l 7 14 7 20 4.5 20 b 3.7 20 3 19.3 3 18.5 m 17 14 l 21 14 21 18.5 b 21 19.3 20.3 20 19.5 20 l 17 20",
    sous = "m 5.5 5 l 18.5 5 b 19.9 5 21 6.1 21 7.5 l 21 16.5 b 21 17.9 19.9 19 18.5 19 l 5.5 19 b 4.1 19 3 17.9 3 16.5 l 3 7.5 b 3 6.1 4.1 5 5.5 5 m 5 7.5 l 5 16.5 b 5 16.8 5.2 17 5.5 17 l 18.5 17 b 18.8 17 19 16.8 19 16.5 l 19 7.5 b 19 7.2 18.8 7 18.5 7 l 5.5 7 b 5.2 7 5 7.2 5 7.5 m 7 13 l 11 13 11 15 7 15 m 13 13 l 17 13 17 15 13 15 m 7 9.5 l 9 9.5 9 11.5 7 11.5 m 11 9.5 l 17 9.5 17 11.5 11 11.5",
    plein = "m 4 4 l 9.5 4 9.5 6.2 6.2 6.2 6.2 9.5 4 9.5 m 14.5 4 l 20 4 20 9.5 17.8 9.5 17.8 6.2 14.5 6.2 m 4 14.5 l 6.2 14.5 6.2 17.8 9.5 17.8 9.5 20 4 20 m 17.8 14.5 l 20 14.5 20 20 14.5 20 14.5 17.8 17.8 17.8",
    debut = "m 12 4 b 7.6 4 4 7.6 4 12 b 4 16.4 7.6 20 12 20 b 16.4 20 20 16.4 20 12 l 17.8 12 b 17.8 15.2 15.2 17.8 12 17.8 b 8.8 17.8 6.2 15.2 6.2 12 b 6.2 8.8 8.8 6.2 12 6.2 b 13.5 6.2 14.9 6.8 16 7.8 l 13.5 10 20 10 20 3.6 17.6 5.9 b 16.1 4.7 14.1 4 12 4",
}
local function icone(out, nom, x, y, taille, hex, a)
    local e = taille / 24 * 100
    out[#out + 1] = string.format("{\\an7\\pos(%.1f,%.1f)\\bord0\\shad0\\blur0\\fscx%.1f\\fscy%.1f\\1c%s\\1a%s\\p1}%s{\\p0}",
        x, y, e, e, coul(hex), alpha(a or 0), ICONES[nom])
end

-- un bouton rond (icône) ; rend sa largeur
local function bouton_rond(out, cx, cy, r, nom, id, act, rang, i, plein)
    local on = actif(id, rang, i)
    forme(out, cx - r, cy - r, cercle(r), plein and C.accent or (on and "2B2E38" or C.bouton), plein and 0 or 36, on and 2.5 or 1, on and C.blanc or C.trait, 0)
    local t = plein and r * 0.84 or 24
    icone(out, nom, cx - t / 2, cy - t / 2, t, plein and C.encre or C.texte)
    zone(cx - r, cy - r, cx + r, cy + r, id, act)
end
-- un bouton allongé : icône (à gauche ou à droite) et texte, ou petit libellé + valeur
local function bouton_long(out, x, cy, w, h, id, act, rang, i, opt)
    local on = actif(id, rang, i)
    local clair = opt.ouvert
    forme(out, x, cy - h / 2, rrect(w, h, h / 2), clair and C.texte or (on and "2B2E38" or C.bouton), clair and 0 or 36, on and 2.5 or 1, on and C.blanc or (clair and C.texte or C.trait), 0)
    local enc = clair and C.encre or C.texte
    if opt.libelle then
        icone(out, opt.icone, x + 18, cy - 12, 24, enc)
        texte(out, x + 54, cy - 11, 4, 14.5, clair and "3C3D42" or "C3C6CE", false, opt.libelle)
        texte(out, x + 54, cy + 9, 4, 20, enc, true, opt.valeur)
    elseif opt.droite then
        texte(out, x + 18, cy, 4, 20, enc, true, opt.texte)
        icone(out, opt.icone, x + w - 18 - 24, cy - 12, 24, enc)
    else
        icone(out, opt.icone, x + 16, cy - 12, 24, enc)
        texte(out, x + 16 + 24 + 8, cy, 4, 20, enc, true, opt.texte)
    end
    zone(x, cy - h / 2, x + w, cy + h / 2, id, act)
end

-- un voile en dégradé (bandes de plus en plus sombres)
local function voile(out, y0, y1, a0, a1)
    local n = 30
    local hb = (y1 - y0) / n
    for k = 0, n - 1 do
        local a = a0 + (a1 - a0) * (k + 0.5) / n
        forme(out, 0, y0 + k * hb, rect(W, hb + 0.6), "06070A", a)
    end
end

local function chapitres() return mp.get_property_native("chapter-list") or {} end

local function dessiner_menu(out, m, ancre_droite)
    local l = pistes(m == "audio" and "audio" or "sub")
    local lignes = {}
    if m == "sub" then lignes[#lignes + 1] = { nom = "Aucun", detail = "", choisi = mp.get_property("sid") == "no", act = function() choisir_piste("sub", nil) end } end
    for _, p in ipairs(l) do
        local nom, detail = piste_texte(p)
        lignes[#lignes + 1] = { nom = nom, detail = detail, choisi = p.selected == true, act = function() choisir_piste(m, p) end }
    end
    local maxi = 6
    S.menu_n = #lignes
    S.menu_sel = math.max(1, math.min(#lignes, S.menu_sel))
    if S.menu_sel < S.menu_haut then S.menu_haut = S.menu_sel end
    if S.menu_sel > S.menu_haut + maxi - 1 then S.menu_haut = S.menu_sel - maxi + 1 end
    S.menu_haut = math.max(1, math.min(math.max(1, #lignes - maxi + 1), S.menu_haut))
    local vues = math.min(maxi, #lignes)
    local lh, pw = 58, 460
    local bas = m == "sub" and 66 or 0          -- taille du texte
    local ph = 18 + 34 + vues * lh + bas + 40
    local px = math.max(24, math.min(W - pw - 24, ancre_droite - pw))
    local py = 556 - ph
    forme(out, px, py, rrect(pw, ph, 20), C.surface, 0, 1, C.trait, 0)
    zone(px, py, px + pw, py + ph, "menu-fond", function() end)
    texte(out, px + 24, py + 16, 7, 24, C.texte, true, m == "audio" and MOTS.langue or "Sous-titres")
    if #lignes > maxi then texte(out, px + pw - 24, py + 20, 9, 15, C.gris, false, string.format("%d à %d sur %d", S.menu_haut, S.menu_haut + vues - 1, #lignes)) end
    local y = py + 18 + 34
    for k = S.menu_haut, S.menu_haut + vues - 1 do
        local it = lignes[k]
        local id = "menu-" .. k
        local on = S.survol == id or S.menu_sel == k
        if it.choisi then forme(out, px + 12, y + 2, rrect(pw - 24, lh - 6, 14), C.choisi, 0, 1.5, C.accent, 0)
        elseif on then forme(out, px + 12, y + 2, rrect(pw - 24, lh - 6, 14), "20232C", 0, 1.5, on and C.blanc or C.trait, 0) end
        if it.choisi then icone(out, "coche", px + 26, y + lh / 2 - 12, 22, "FF6A5E") end
        texte(out, px + 62, y + lh / 2 - 1, 4, 21, C.texte, it.choisi, it.nom)
        if it.detail ~= "" then texte(out, px + pw - 28, y + lh / 2 - 1, 6, 16, "C3C6CE", false, it.detail) end
        zone(px + 12, y, px + pw - 12, y + lh, id, it.act)
        y = y + lh
    end
    if m == "sub" then
        forme(out, px + 18, y + 6, rect(pw - 36, 1), "2F323C", 0)
        texte(out, px + 24, y + 38, 4, 19, C.texte, false, "Taille du texte")
        for k, d in ipairs({ -0.1, 0.1 }) do
            local bx = px + pw - 24 - (3 - k) * 60 + 8
            local id = "taille" .. k
            forme(out, bx, y + 14, rrect(52, 48, 12), S.survol == id and "2B2E38" or "20232C", 0, 1, S.survol == id and C.blanc or C.trait, 0)
            texte(out, bx + 26, y + 38, 5, k == 1 and 18 or 24, C.texte, true, k == 1 and "A−" or "A+")
            zone(bx, y + 14, bx + 52, y + 62, id, function() taille_sous(d) end)
        end
        y = y + bas
    end
    texte(out, px + 24, y + 20, 4, 15.5, C.gris, false, "Ton choix est retenu " .. MOTS.suite .. ".")
end

-- Un message de l'appli (cartouche posée, générique à passer…) : une pastille en haut, au milieu.
local function dessiner_message(out, y)
    local m = S.message
    if not m or mp.get_time() > m.jusqua then S.message = nil; return end
    local lignes, cur = {}, ""
    for mot in tostring(m.texte):gmatch("%S+") do
        if #cur > 0 and #cur + #mot + 1 > 58 then lignes[#lignes + 1] = cur; cur = mot else cur = (#cur > 0 and cur .. " " or "") .. mot end
    end
    if #cur > 0 then lignes[#lignes + 1] = cur end
    local lw = 0
    for _, l in ipairs(lignes) do lw = math.max(lw, large(l, 24, true)) end
    local pw, ph = math.min(W - 96, lw + 64), #lignes * 32 + 26
    forme(out, (W - pw) / 2, y, rrect(pw, ph, math.min(28, ph / 2)), C.surface, 12, 1.5, C.trait, 0)
    for k, l in ipairs(lignes) do texte(out, W / 2, y + 13 + (k - 0.5) * 32, 5, 24, C.texte, true, l) end
end

dessiner = function()
    local ow, oh = mp.get_osd_size()
    if not ow or ow <= 0 or oh <= 0 then return end
    ech = oh / H
    W = ow / ech
    S.zones = {}
    local en_pause = pause()
    local voir = S.visible or en_pause or o.essai == "fixe"
    if not voir then
        local seul = {}
        dessiner_message(seul, 40)
        ov.data = table.concat(seul, "\n"); ov.res_x = W; ov.res_y = H; ov:update()
        if S.sub_pos then mp.set_property_number("sub-pos", S.sub_pos); S.sub_pos = nil end
        return
    end
    -- les sous-titres passent au-dessus de la barre tant qu'elle est là
    if not S.sub_pos then S.sub_pos = mp.get_property_number("sub-pos", 100); mp.set_property_number("sub-pos", 66) end

    local out = {}
    local dur = mp.get_property_number("duration", 0) or 0
    local pos = mp.get_property_number("time-pos", 0) or 0
    if S.glisse == "temps" and S.glisse_pct then pos = dur * S.glisse_pct end
    local reste = math.max(0, dur - pos)
    local vit = mp.get_property_number("speed", 1) or 1
    local chaps = chapitres()
    local nchap = #chaps
    local ichap = (mp.get_property_number("chapter", -1) or -1) + 1
    local titre = o.titre ~= "" and o.titre or titre_propre(mp.get_property("filename", ""))
    local M = 48

    -- voiles
    if en_pause and not S.menu then forme(out, 0, 0, rect(W, H), "06070A", 72) end
    voile(out, 0, 190, 40, 255)
    voile(out, 390, 720, 255, 12)

    -- en haut : retour, titre, heure
    bouton_rond(out, M + 28, 62, 28, "retour", "retour", quitter, "haut", 1)
    if not (en_pause and not S.menu) then
        texte(out, M + 76, 38, 7, 40, C.texte, true, titre)
        local sous = o.sous
        local nb = mp.get_property_number("playlist-count", 1) or 1
        if o.genre == "album" and nb > 1 then sous = string.format("Piste %d sur %d", (mp.get_property_number("playlist-pos", 0) or 0) + 1, nb) end
        local morceaux = {}
        if sous ~= "" then morceaux[#morceaux + 1] = sous end
        if dur > 0 then morceaux[#morceaux + 1] = duree_mots(dur) end
        if nchap > 1 and ichap >= 1 then morceaux[#morceaux + 1] = string.format("Chapitre %d sur %d", ichap, nchap) end
        texte(out, M + 76, 84, 7, 21, C.doux, false, table.concat(morceaux, " · "))
    end
    texte(out, W - M, 36, 9, 30, C.texte, true, os.date("%H:%M"))
    if dur > 0 then texte(out, W - M, 72, 9, 19, C.doux, false, MOTS.fin .. os.date("%H:%M", os.time() + math.floor(reste / math.max(0.1, vit)))) end

    -- en pause : le titre en grand et trois gros boutons
    if en_pause and not S.menu then
        local x, y = 96, 178
        icone(out, "pause", x, y, 18, "FF6A5E")
        texte(out, x + 28, y + 9, 4, 18, "FF6A5E", true, "EN PAUSE", 0, "\\fsp3")
        texte(out, x, y + 34, 7, 72, C.texte, true, titre)
        local l2 = "Il reste " .. duree_mots(reste)
        if nchap > 1 and ichap >= 1 then l2 = l2 .. string.format(" · chapitre %d sur %d", ichap, nchap) end
        texte(out, x, y + 122, 7, 28, "E2E3E8", false, l2)
        local by = y + 216
        local b = {
            { "p-reprendre", "Reprendre", "lecture", 232, bascule_pause },
            { "p-debut", "Revoir depuis le début", "debut", 338, function() mp.commandv("seek", 0, "absolute"); mp.set_property_bool("pause", false); montrer() end },
            { "p-quitter", MOTS.quitter, "retour", math.max(210, 96 + large(MOTS.quitter, 23, false)), quitter },
        }
        local bx = x
        for i, d in ipairs(b) do
            local on = actif(d[1], "pause", i)
            local plein = i == 1
            forme(out, bx, by - 34, rrect(d[4], 68, 34), plein and C.accent or (on and "2B2E38" or C.bouton), plein and 0 or 24, on and 3 or 1, on and C.blanc or (plein and C.accent or "4A4D57"), 0)
            icone(out, d[3], bx + 28, by - 12, 24, plein and C.encre or C.texte)
            texte(out, bx + 64, by, 4, plein and 25 or 23, plein and C.encre or C.texte, plein, d[2])
            zone(bx, by - 34, bx + d[4], by + 34, d[1], d[5])
            bx = bx + d[4] + 14
        end
        texte(out, x, by + 58, 7, 19, "C3C6CE", false, "En quittant, Rembobine retient où tu en es : tu pourras reprendre plus tard.")
    end

    -- la barre d'avancement
    local ty = 549
    local x0, x1 = M + 96, W - M - 122
    local pct = dur > 0 and math.max(0, math.min(1, pos / dur)) or 0
    texte(out, M, ty, 4, 26, C.texte, true, duree(pos))
    texte(out, W - M, ty, 6, 26, C.texte, true, dur > 0 and duree(reste, "−") or "")
    local gros = (S.survol == "temps" or S.glisse == "temps") and 12 or 8
    forme(out, x0, ty - gros / 2, rrect(x1 - x0, gros, gros / 2), C.blanc, 194)
    local cache = mp.get_property_number("demuxer-cache-time", 0) or 0
    if dur > 0 and cache > pos then forme(out, x0, ty - gros / 2, rrect((x1 - x0) * math.min(1, cache / dur), gros, gros / 2), C.blanc, 150) end
    if pct > 0 then forme(out, x0, ty - gros / 2, rrect(math.max(gros, (x1 - x0) * pct), gros, gros / 2), C.accent, 0) end
    if dur > 0 then
        for _, c in ipairs(chaps) do
            if c.time and c.time > 1 and c.time < dur - 1 then forme(out, x0 + (x1 - x0) * c.time / dur - 1.5, ty - gros / 2, rect(3, gros), "07080B", 0) end
        end
    end
    forme(out, x0 + (x1 - x0) * pct - 15, ty - 15, cercle(15), C.accent, 165)
    forme(out, x0 + (x1 - x0) * pct - 11, ty - 11, cercle(11), C.blanc, 0)
    zone(x0 - 8, ty - 18, x1 + 8, ty + 18, "temps", nil, "temps")
    -- sous la souris : l'heure visée et son chapitre
    if (S.survol == "temps" or S.glisse == "temps") and dur > 0 then
        local p = S.glisse_pct or math.max(0, math.min(1, (S.souris.x - x0) / (x1 - x0)))
        local tt = dur * p
        local nomc = nil
        for k, c in ipairs(chaps) do if c.time and c.time <= tt then nomc = (c.title and c.title ~= "" and c.title) or ("Chapitre " .. k) end end
        local lw = math.max(96, large(duree(tt), 22, true) + 28, nomc and (large(nomc, 16, false) + 28) or 0)
        local lx = math.max(M, math.min(W - M - lw, x0 + (x1 - x0) * p - lw / 2))
        local lh = nomc and 58 or 38
        forme(out, x0 + (x1 - x0) * p - 1, ty - 34, rect(2, 20), C.texte, 0)
        forme(out, lx, ty - 34 - lh, rrect(lw, lh, 10), C.texte, 0)
        texte(out, lx + lw / 2, ty - 34 - lh + 19, 5, 22, C.encre, true, duree(tt))
        if nomc then texte(out, lx + lw / 2, ty - 34 - 16, 5, 16, C.encre, false, nomc) end
    end

    -- les commandes
    local cy = 616
    local x = M
    local i = 0
    local function suivant() i = i + 1; return i end
    local a_chap = nchap > 1 or (mp.get_property_number("playlist-count", 1) or 1) > 1
    if a_chap then bouton_rond(out, x + 28, cy, 28, "prec", "prec", function() chapitre(-1) end, "barre", suivant()); x = x + 56 + 14 end
    bouton_long(out, x, cy, 112, 56, "recul", function() saut(-10) end, "barre", suivant(), { icone = "recul", texte = "10 s" }); x = x + 112 + 14
    bouton_rond(out, x + 36, cy, 36, en_pause and "lecture" or "pause", "lecture", bascule_pause, "barre", suivant(), true); x = x + 72 + 14
    S.i_lecture = i
    bouton_long(out, x, cy, 112, 56, "avance", function() saut(30) end, "barre", suivant(), { icone = "avance", texte = "30 s", droite = true }); x = x + 112 + 14
    if a_chap then bouton_rond(out, x + 28, cy, 28, "suiv", "suiv", function() chapitre(1) end, "barre", suivant()) end

    -- à droite : plein écran, sous-titres, langue, volume (posés de droite à gauche, numérotés de gauche à droite)
    local nsub, naud = #pistes("sub"), #pistes("audio")
    local n_droite = 1 + (nsub > 0 and 1 or 0) + (naud > 1 and 1 or 0)
    local base = i
    local xr = W - M
    bouton_rond(out, xr - 28, cy, 28, "plein", "plein", function() mp.commandv("cycle", "fullscreen"); montrer() end, "barre", base + n_droite); xr = xr - 56 - 14
    local k = n_droite - 1
    if nsub > 0 then
        local v = piste_courte("sub")
        local w = math.max(172, 54 + large(v, 20, true) + 30)
        bouton_long(out, xr - w, cy, w, 56, "b-sub", function() ouvrir_menu("sub") end, "barre", base + k, { icone = "sous", libelle = "Sous-titres", valeur = v, ouvert = S.menu == "sub" })
        if S.menu == "sub" then S.ancre = xr end
        xr = xr - w - 14; k = k - 1
    end
    if naud > 1 then
        local v = piste_courte("audio")
        local w = math.max(150, 54 + large(v, 20, true) + 30)
        bouton_long(out, xr - w, cy, w, 56, "b-audio", function() ouvrir_menu("audio") end, "barre", base + k, { icone = "langue", libelle = "Langue", valeur = v, ouvert = S.menu == "audio" })
        if S.menu == "audio" then S.ancre = xr end
        xr = xr - w - 14
    end
    S.n_barre = base + n_droite
    -- volume
    local vol = mp.get_property_number("volume", 100) or 100
    local muet = mp.get_property_bool("mute") == true
    local vw = 196
    forme(out, xr - vw, cy - 28, rrect(vw, 56, 28), C.bouton, 36, 1, C.trait, 0)
    icone(out, (muet or vol <= 0) and "muet" or "son", xr - vw + 16, cy - 12, 24, C.texte)
    zone(xr - vw, cy - 28, xr - vw + 50, cy + 28, "muet", function() mp.commandv("cycle", "mute"); montrer() end)
    local vx0, vx1 = xr - vw + 56, xr - 22
    local vp = math.max(0, math.min(1, (muet and 0 or vol) / 100))
    forme(out, vx0, cy - 3, rrect(vx1 - vx0, 6, 3), C.blanc, 194)
    if vp > 0 then forme(out, vx0, cy - 3, rrect(math.max(6, (vx1 - vx0) * vp), 6, 3), C.texte, 0) end
    forme(out, vx0 + (vx1 - vx0) * vp - 8, cy - 8, cercle(8), C.blanc, 0)
    zone(vx0 - 6, cy - 16, vx1 + 6, cy + 16, "volume", nil, "volume")
    S.vol_x = { vx0, vx1 }
    S.temps_x = { x0, x1 }

    -- les touches
    texte(out, W / 2, 684, 5, 17, C.gris, false, en_pause and "Espace : reprendre · Échap : quitter"
        or "Espace : pause · flèches gauche et droite : 10 s · flèches haut et bas : volume · Échap : quitter")

    -- la liste ouverte, par-dessus
    if S.menu then dessiner_menu(out, S.menu, S.ancre or (W - M)) end
    dessiner_message(out, 126)

    ov.res_x = W; ov.res_y = H
    ov.data = table.concat(out, "\n")
    ov:update()
end

-- =====================================================================
--  Souris
-- =====================================================================
local function zone_sous(x, y)
    for k = #S.zones, 1, -1 do
        local z = S.zones[k]
        if x >= z.x0 and x <= z.x1 and y >= z.y0 and y <= z.y1 then return z end
    end
    return nil
end
local function glisser(x)
    if S.glisse == "temps" and S.temps_x then
        local p = math.max(0, math.min(1, (x - S.temps_x[1]) / (S.temps_x[2] - S.temps_x[1])))
        S.glisse_pct = p
        local t = mp.get_time()
        if t - S.dernier_seek > 0.12 then S.dernier_seek = t; mp.commandv("seek", p * 100, "absolute-percent+keyframes") end
    elseif S.glisse == "volume" and S.vol_x then
        local p = math.max(0, math.min(1, (x - S.vol_x[1]) / (S.vol_x[2] - S.vol_x[1])))
        mp.set_property_bool("mute", false)
        mp.set_property_number("volume", math.floor(p * 100 + 0.5))
    end
end
mp.observe_property("mouse-pos", "native", function(_, m)
    if not m then return end
    local x, y = m.x / ech, m.y / ech
    local bouge = math.abs(x - S.souris.x) > 0.5 or math.abs(y - S.souris.y) > 0.5
    S.souris.x, S.souris.y, S.souris.dedans = x, y, m.hover ~= false
    if not bouge then return end
    if S.glisse then glisser(x) end
    local z = S.souris.dedans and zone_sous(x, y) or nil
    S.survol = z and z.id or nil
    if S.focus then S.focus = nil end
    montrer(S.menu and 8 or 3.5)
end)
mp.add_forced_key_binding("MBTN_LEFT", "rb-clic", function(e)
    if e.event == "down" then
        local z = zone_sous(S.souris.x, S.souris.y)
        if z and z.glisse then S.glisse = z.glisse; S.glisse_pct = nil; glisser(S.souris.x); montrer(8)
        elseif z and z.act then S.appui = z.id
        else S.appui = "vide" end
    elseif e.event == "up" then
        if S.glisse == "temps" and S.glisse_pct then mp.commandv("seek", S.glisse_pct * 100, "absolute-percent+exact") end
        if S.glisse then S.glisse = nil; S.glisse_pct = nil; montrer(); return end
        local z = zone_sous(S.souris.x, S.souris.y)
        local id = z and z.id or "vide"
        if S.appui == id then
            if z and z.act then z.act()
            elseif S.menu then S.menu = nil; montrer()
            else bascule_pause() end
        end
        S.appui = nil
    end
end, { complex = true })
mp.add_forced_key_binding("WHEEL_UP", "rb-roue-h", function()
    if S.menu then S.menu_sel = math.max(1, S.menu_sel - 1); montrer(8) else mp.commandv("add", "volume", 4); montrer(2.5) end
end)
mp.add_forced_key_binding("WHEEL_DOWN", "rb-roue-b", function()
    if S.menu then S.menu_sel = math.min(S.menu_n or 1, S.menu_sel + 1); montrer(8) else mp.commandv("add", "volume", -4); montrer(2.5) end
end)

-- =====================================================================
--  Clavier et télécommande
-- =====================================================================
local function rangs()   -- les rangées de boutons qu'on peut parcourir au clavier, de haut en bas
    local r = { { "haut", 1 } }
    if pause() and not S.menu then r[#r + 1] = { "pause", 3 } end
    r[#r + 1] = { "barre", S.n_barre or 5 }
    return r
end
local function activer_focus()
    local noms = { haut = { "retour" }, pause = { "p-reprendre", "p-debut", "p-quitter" } }
    local f = S.focus
    if not f then return end
    if f.rang ~= "barre" then
        local id = noms[f.rang][f.i]
        for _, z in ipairs(S.zones) do if z.id == id and z.act then z.act(); return end end
        return
    end
    local ordre = {}
    for _, id in ipairs({ "prec", "recul", "lecture", "avance", "suiv", "b-audio", "b-sub", "plein" }) do
        for _, z in ipairs(S.zones) do if z.id == id then ordre[#ordre + 1] = z; break end end
    end
    if ordre[f.i] and ordre[f.i].act then ordre[f.i].act() end
end
-- Le lecteur de cartouches NFC tape le numéro de la puce (des chiffres) puis Entrée, comme un clavier : les chiffres
-- ne font rien ici, et une Entrée qui suit de près des chiffres n'est pas une Entrée de l'utilisateur.
local dernier_chiffre = -10
for d = 0, 9 do
    mp.add_forced_key_binding(tostring(d), "rb-c" .. d, function() dernier_chiffre = mp.get_time() end)
    mp.add_forced_key_binding("KP" .. d, "rb-k" .. d, function() dernier_chiffre = mp.get_time() end)
end

local function touche(nom)
    return function()
        local en_menu = S.menu ~= nil
        if nom == "ENTER" and mp.get_time() - dernier_chiffre < 0.7 then return end
        if nom == "ESC" then
            if en_menu then S.menu = nil; montrer()
            elseif S.focus and not pause() then S.focus = nil; cacher()
            else quitter() end
        elseif nom == "ENTER" then
            if en_menu then
                local z = nil
                for _, zz in ipairs(S.zones) do if zz.id == "menu-" .. S.menu_sel then z = zz end end
                if z and z.act then z.act() end
            elseif S.focus then activer_focus(); montrer(6)
            else
                bascule_pause()
                S.focus = pause() and { rang = "pause", i = 1 } or { rang = "barre", i = S.i_lecture or 2 }
                montrer(6)
            end
        elseif nom == "UP" or nom == "DOWN" then
            local d = nom == "UP" and -1 or 1
            if en_menu then S.menu_sel = math.max(1, math.min(S.menu_n or 1, S.menu_sel + d)); montrer(8)
            elseif S.focus then
                local r = rangs()
                local k = 1
                for j, v in ipairs(r) do if v[1] == S.focus.rang then k = j end end
                k = math.max(1, math.min(#r, k + d))
                S.focus = { rang = r[k][1], i = math.min(r[k][2], r[k][1] == "barre" and (S.i_lecture or 2) or 1) }
                montrer(6)
            else mp.commandv("add", "volume", -5 * d); montrer(2.5) end
        elseif nom == "LEFT" or nom == "RIGHT" then
            local d = nom == "LEFT" and -1 or 1
            if en_menu then return
            elseif S.focus then
                local n = 1
                for _, v in ipairs(rangs()) do if v[1] == S.focus.rang then n = v[2] end end
                S.focus.i = math.max(1, math.min(n, S.focus.i + d)); montrer(6)
            else saut(10 * d) end
        elseif nom == "TAB" then
            if S.focus then S.focus = nil else S.focus = pause() and { rang = "pause", i = 1 } or { rang = "barre", i = S.i_lecture or 2 } end
            montrer(6)
        end
    end
end
for _, t in ipairs({ { "ESC", "ESC" }, { "BS", "ESC" }, { "ENTER", "ENTER" }, { "KP_ENTER", "ENTER" }, { "UP", "UP" }, { "DOWN", "DOWN" },
        { "LEFT", "LEFT" }, { "RIGHT", "RIGHT" }, { "TAB", "TAB" } }) do
    mp.add_forced_key_binding(t[1], "rb-" .. t[1], touche(t[2]), { repeatable = t[2] ~= "ENTER" and t[2] ~= "ESC" and t[2] ~= "TAB" })
end
mp.add_forced_key_binding("a", "rb-a", function() if #pistes("audio") > 1 then ouvrir_menu("audio") end end)
mp.add_forced_key_binding("s", "rb-s", function() if #pistes("sub") > 0 then ouvrir_menu("sub") end end)

-- =====================================================================
--  La barre suit ce qui se passe
-- =====================================================================
mp.register_script_message("rembobine-message", function(t, ms)
    S.message = { texte = tostring(t or ""), jusqua = mp.get_time() + math.max(1, math.min(30, (tonumber(ms) or 2500) / 1000)) }
    dessiner()
end)
mp.add_periodic_timer(0.25, function()
    if S.message and mp.get_time() > S.message.jusqua then S.message = nil; dessiner() end
    if S.visible and not pause() and o.essai ~= "fixe" and not S.glisse and mp.get_time() > S.jusqua then
        -- (elle reste tant que la souris est sur un bouton ou qu'une liste est ouverte)
        if S.survol and S.souris.dedans then S.jusqua = mp.get_time() + 1 else cacher(); return end
    end
    if S.visible or pause() or o.essai == "fixe" then dessiner() end
end)
mp.observe_property("pause", "bool", function(_, p)
    -- (au clavier : le bouton choisi suit — « Reprendre » en pause, lecture/pause sinon)
    if S.focus then S.focus = p and { rang = "pause", i = 1 } or { rang = "barre", i = S.i_lecture or 2 } end
    S.jusqua = mp.get_time() + 3.5; S.visible = true; dessiner()
end)
for _, p in ipairs({ "volume", "mute", "aid", "sid", "fullscreen" }) do
    mp.observe_property(p, "native", function() if S.visible or pause() then dessiner() end end)
end
mp.observe_property("osd-dimensions", "native", function() dessiner() end)
mp.register_event("file-loaded", function() montrer(4) end)

lire_prefs()
mp.set_property("osd-bar", "no")
