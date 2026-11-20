# Rembobine — mémo de reprise pour Claude Code

Lis ce fichier en entier avant de toucher au projet. Réponds toujours **en français**.
Le propriétaire ne programme pas : il supervise. Explique en mots simples, sans jargon, et montre des captures quand c'est visuel.

> **Module facultatif.** Si le fichier `CLAUDE.local.md` existe à la racine (module installé, voir « Module facultatif » plus bas),
> **lis-le aussi en entier : il complète ce mémo et passe avant lui.** Sinon, ne cherche pas à deviner ce que contient le module.

## Le projet en deux phrases

Rembobine (ex-« Gamebox », nom déjà déposé) est une médiathèque (films, séries, jeux rétro, musique) présentée comme un **salon 2D interactif**.
Il tourne sur PC (Linux, Windows), Raspberry Pi (Rembobine OS), téléphone et TV Android, avec un serveur de la maison qui sert la bibliothèque.

## Où est quoi

| Dossier | Contenu |
|---|---|
| `web/index.html` | Le logiciel 2D complet, en **un seul fichier** HTML/SVG/JS (~17 000 lignes, ~2 Mo). Les « parts » de fêtes y sont insérées entre `/*<FETES-PARTS>*/` et `/*</FETES-PARTS>*/`. Les repères vides `/*<EXT nom>*/…/*</EXT nom>*/` sont remplis à la fabrication par le module facultatif (`outils/ext.py`) : ne pas les déplacer ni les supprimer. Restent de l'époque : `brData()` (données `u.br` : la vie du salon dessiné), `wxSimulated`/`wxKind` (météo), la vitrine 3D (fichiers STL/OBJ). |
| `outils/fetes/web/*.js` | Les sources des parts 2D (une par fête ou groupe). **On modifie ici, puis on reconstruit.** |
| `outils/fetes/tools/` | `build_web.py` (insère les parts dans `web/index.html`), `shot2d.js` (captures 2D avec Playwright), tests du calendrier. |
| `outils/fetes/LISEZMOI.md` | Le **contrat des parts** (format, règles de lumière, ce qu'une part a le droit de toucher). |
| `docs/sources-fiches-fetes.md` | Sources des fiches de fêtes (vérifiées). |
| `app/`, `android/`, `ci/` | Emballage Electron (PC/Raspberry), Android, image Rembobine OS. Android : Godot 4.3 réécrit `src/release/AndroidManifest.xml` à chaque export ; nos ajouts (`android/release/AndroidManifest.xml` : écran Rembobine au démarrage, module dans le processus `:monde3d`, rotation libre) y sont injectés par une tâche Gradle (`rbbManifeste`, écrite par `ci/prepare_android.py`). Vérifier : `aapt dump badging` → `launchable-activity: fr.rembobine.app.RembobineActivity`. |
| `app/serveur/` | Le **serveur de la maison** (port 8080, démarré par l'appli de bureau, donc sur le Raspberry) : appairage par code, bibliothèque, streaming, lecture sur la TV (mpv), conversion vidéo à la volée (ffmpeg), sous-titres, cartouches NFC. |
| `ci/emulateurs.sh`, `outils/emulateurs/` | L'émulateur intégré (EmulatorJS 4.2.3, 21 cœurs) embarqué à la fabrication, et son banc d'essai (ROM de test faites maison). |
| `outils/ext.py`, `outils/module.sh`, `ci/module.sh` | Le module facultatif : insertion dans la page, installation dans une copie de travail, fabrication (voir plus bas). |

## Commandes utiles

```bash
# reconstruire la 2D après avoir modifié une part (toutes les parts actuelles) :
python3 outils/fetes/tools/build_web.py --only _calendrier.js,_resumes.js,nat.js,nouvelan.js,galette.js,chandeleur.js,valentin.js,poisson.js,vendredi13.js,monde.js,halloween_plus.js,stpatrick.js,paques.js,muguet.js,musique.js,quatorze.js,souvenir.js,asie.js

# captures 2D à une date donnée (sans erreur = "sans erreur" affiché) ; --cfg = réglages de départ (pays, cases cochées) :
node outils/fetes/tools/shot2d.js web/index.html /tmp/cap "2026-12-24T21:00:00|noel" "2026-10-31T22:00:00|hallo"
node outils/fetes/tools/shot2d.js web/index.html /tmp/cap --cfg='{"decoPays":"France","fete_stpatrick":true}' "2026-03-17T15:00:00|stpat"

# serveur de la maison (app/serveur/) : tests automatiques (faux mpv, fausse bibliothèque) et formats vidéo (demande ffmpeg)
node app/serveur/test_serveur.js
node app/serveur/test_codecs.js
# tous les tests du serveur d'un coup (aucun internet, faux mpv/ffprobe/GitHub) :
for t in app/serveur/test_*.js; do node "$t" | tail -1; done

# émulateur intégré, sans internet : rassembler EmulatorJS et ses consoles (registre npm), puis le banc d'essai
ci/emulateurs.sh build
python3 outils/emulateurs/roms_test.py /tmp/roms && node outils/emulateurs/test_emulateurs.js build/ejs /tmp/roms /tmp/emucap
```

## Règles décidées par le propriétaire (à respecter)

- **Le pays ne fait que pré-cocher les fêtes** : chaque fête a sa case, qu'on peut cocher ou décocher librement (une fête d'un autre pays peut s'afficher si on la coche). Changer de pays pré-coche de nouveau les fêtes liées à un pays ; les choix sur les fêtes « universelles » (Nouvel An, Vendredi 13…) sont gardés.
  - Fêtes fixes liées à des pays : `FETE_PAYS` (`index.html`) — le module a la même liste : la garder identique (voir `CLAUDE.local.md` s'il est là) ; fêtes du monde : champ `pays` du calendrier ; fêtes nationales : leur pays.
- **Une seule fête décore le salon par jour**, selon `FETE_PRIO` (`index.html`) — même liste dans le module.
  - Le 1er avril, le poisson passe devant la semaine de Pâques (pas devant dimanche/lundi de Pâques). Saint-Nicolas passe devant la fête des Lumières.
  - **Diwali et Halloween ne se superposent jamais** : Diwali décore seule ses jours, Halloween garde le 31 octobre (et gagne si le thème Halloween est choisi en permanence).
  - Les 1er et 2 novembre, Halloween s'efface devant la Toussaint / le Día de Muertos (sauf thème Halloween choisi).
- **Lumière** : reste naturelle ; seules des sources visibles (sapin, bougies, lampions, cheminée…) donnent l'ambiance. Aucune lumière sans source visible. Pas d'abus de vert à la Saint-Patrick.
- **Surprises du salon 2D (easter eggs)** : rien d'effrayant hors Halloween, sauf si l'utilisateur a choisi « Halloween » comme saison permanente, ou le « Mode sombre ». **Ne pas toucher au fantôme de la télé** (demande explicite).
- **Mode sombre** (réglage « Mode sombre (surnaturel toute l'année) », Paramètres → Interface → Surprises du salon, **désactivé par défaut**) : le surnaturel est permis toute l'année, **sans décor d'Halloween** (pas de citrouilles hors période). 2D (`eggPool()`) : chauves-souris, sorcière, araignée, silhouette, lumières qui vacillent toute l'année ; le fantôme de la télé (2D) reste à Halloween.
- **Noël** : le sapin est grand dès le début (il ne grandit pas), à côté de la cheminée ; crèche sur la cheminée ; cadeaux de tailles variées ; calendrier de l'Avent animé.
- **Thème « Gothique »** (réglage « Époque du salon » → Gothique, `salonEra`) : un style, pas une ambiance de peur. Entrée « Gothique » d'`ERAS` (couleurs, damassé, chandelier, canapé capitonné). Lumière : seulement des sources visibles. Aucun château ou manoir de film.
- **Droits d'auteur** : aucun personnage reconnaissable ni combinaison « signature » d'un film (pas de têtes de tueurs célèbres, pas de mur de lettres de série, pas de pull + chapeau ensemble). Des objets génériques isolés sont OK. Le propriétaire a accepté cette règle.
- **Pas de** guitare, pot de fleurs ou pile de linge ajoutés dans le salon.
- **Pas de spoiler** dans le README, les messages de commit, les journaux de fabrication et tout fichier public (voir « Module facultatif »), pas de clé sur l'icône.
- Sons et modèles : uniquement fournis par le propriétaire ou sous licence libre.
- **Sécurité** : ne jamais committer `release.key` ni aucune clé ; la clé de signature Android n'existe que dans le secret GitHub `RBB_SIGNING_KEY`.
  - Mises à jour signées (Ed25519) : clé publique dans `app/serveur/maj-cle.js` (vide = pas encore de clé), clé privée dans le secret `RBB_UPDATE_KEY` ; création : `node outils/maj/creer_cle.js` ; signature à la fabrication : `ci/signer_maj.js` ; vérification : `maj-signature.js`.
  - Serveur : « la TV elle-même » = demande locale SANS Origin étrangère, ou avec l'en-tête `X-Rembobine-Ecran` ajouté par `main.js` ; code d'appairage envoyé seulement à l'écran (`emitTv`) ; invités = liste fermée (`guestAllowed` dans `serveur.js`) ; fichiers servis seulement s'ils sont vraiment dans les dossiers de médias (`libFile`). Test : `node app/serveur/test_securite.js`.
  - Serveur (suite, audit du 20 nov. 2026) : ne répond qu'aux réseaux de la maison (`localNet` : réseaux privés, cette machine, Tailscale 100.64.0.0/10, réseau de chaque carte réseau) ; appairage seulement en JSON (`isJson`, sinon 415) ; trop d'erreurs de code = blocage de CETTE adresse seulement (`S.guard.ips`) ; appareils reliés oubliés après 90 jours sans nouvelles (`DEVICE_TTL`) ; mot de passe de Rembobine OS, partage réseau et SSH seulement depuis l'écran de la TV (`TV_ONLY` dans `os.js`) ; BIOS jamais servis aux invités.
  - Android : chaque appel du pont `GbxAndroid` porte une clé tirée au hasard, placée seulement dans la page de l'appli (`cle`, `ok(k)` dans `RembobineActivity.java`) : les cadres des bandes-annonces (YouTube…) ne peuvent rien en faire.
  - Contenu facultatif inséré à la fabrication (`outils/ext.py`) : commentaires enlevés, textes écrits en codes `\uXXXX`, refus si un mot de la liste du garde-fou reste lisible.
  - Fabrication : archives d'Electron vérifiées par leur empreinte (`SHASUMS256.txt`) ; jeton GitHub du job `bureau` donné seulement aux étapes qui en ont besoin.
  - Rembobine OS : pas de mot de passe commun (tiré au hasard au premier démarrage, `/etc/rembobine/mot-de-passe`), utilisateur hors du groupe sudo, SSH coupé par défaut, sudoers à commandes exactes.

## Cartouches NFC

- Code : bloc « Cartouches NFC » dans `web/index.html` (juste avant « Démarrage ») ; bouton `nfcBtn` sur les fiches (et les albums) ; cartouches gardées dans `state.cfg.nfcCards` (numéro de puce → titre, profil, support).
- Lecteur : NFC USB « clavier » (rafale de touches + Entrée, lue par `e.code` → juste en AZERTY). Sur Linux, `app/main.js` lit aussi `/dev/input` directement (`nfc:card`), même quand mpv est devant ; mpv ignore les chiffres et se pilote par `--input-ipc-server`.
- Une cartouche posée : bascule sur son profil et lance le titre (reprise). Film déjà en cours : « Changer maintenant » / « À la fin » (15 s, sinon à la fin) ; reposer la cartouche = changer tout de suite.
- Télé allumée par HDMI-CEC (`cec-ctl`/`cec-client`, paquets `v4l-utils` et `cec-utils` dans l'image) et par `/api/cec` du Raspberry.
- 24 supports au choix pour l'icône (`NFC_LOOKS`) : disquettes, cassettes, VHS, cartes SD, cartouches, bobine, vinyle… dessins génériques (aucune marque).
- Pour essayer sans lecteur : `rbbCartouche("0412345678")` dans la console.
- **Téléphone (appli Android)** : écrit les cartouches avec son NFC (`RembobineActivity.java` : `gamebox.nfc/nfcWatch/nfcWrite`, `window.rbbPhoneTag`). Il n'écoute les puces **que** pendant « Écrire une cartouche » ou dans la télécommande (`rbbNfc.remote(true)`), **jamais dans le salon** (décision du propriétaire). Numéros comparés sous toutes leurs formes (`nfcAliases` : hexa, décimal, à l'envers).
- Liste partagée par le serveur : `/api/cards` (GET, POST set/del) et `/api/cards/tap` → évènements `cards` / `card`. Cahier des charges : dans le module.

## Déploiement

- Travailler sur la branche `deploiement`, puis pousser aussi sur `main` (`git push origin deploiement:main`) : ça lance la fabrication (~25 min) et met à jour la Release `v1.0.0` (5 fichiers : Linux, Windows, Android, Raspberry Pi, image Rembobine OS).
- Les fichiers passent entre les étapes par une version provisoire `fabrication-<run>` supprimée à la fin (le quota « Artifacts » de GitHub était plein).
- Le dépôt `grecdel/Rembobine` est **public** : rien de privé, aucun secret, aucun mot sur le contenu du module (fichiers, commits, titres, journaux).

## Module facultatif (à lire avant tout envoi)

- La fabrication GitHub ajoute un **module privé**, lu avec deux secrets du dépôt : `RBB_MODULE_DEPOT` (nom du dépôt du module) et `RBB_MODULE_JETON` (jeton d'accès fin, « Contents » en lecture/écriture sur ce seul dépôt). Si l'un manque, la fabrication s'arrête dès le début avec un message clair.
- `ci/module.sh` (fabrication) : `verifier` (secrets), `masquer`, `poser` (le module est posé par-dessus le dépôt, aux mêmes chemins), `journal`. Les étapes du module n'écrivent à l'écran que des résumés neutres ; le détail part dans le dépôt du module.
- `outils/ext.py` remplit les repères `/*<EXT nom>*/` de la page à la fabrication (`ci/build_desktop.sh`, `ci/prepare_android.py`) ; le `web/index.html` du dépôt n'est jamais réécrit. Sans module, la page marche telle quelle.
- `ci/build_desktop.sh` exige le module, sauf avec `RBB_SANS_MODULE=1` (paquets de bureau sans lui, pour un essai). L'APK Android ne se fabrique qu'avec le module.
- **Copie de travail avec le module** (sessions Claude) : `outils/module.sh installer <adresse du dépôt du module>` (dépôt `.module.git/` qui partage le même dossier ; chaque dépôt ne voit que ses fichiers ; alias `gm` = `git --git-dir=.module.git`). Puis `outils/module.sh verifier` avant chaque commit public (le crochet `pre-commit` le fait aussi) et **`outils/module.sh verifier --envoi` avant chaque `git push`** (le crochet `pre-push` le fait aussi ; jamais `--no-verify`). `outils/module.sh sync` après un `gm pull` (automatique avec les crochets). Un fichier nouveau qui appartient au module : `gm add` avant tout `git add -A`.
- **Règle d'or** : rien sur le contenu du module dans les fichiers publics, les messages de commit, les titres de demande de fusion ou les journaux. Quand un changement touche les deux dépôts : **envoyer le module d'abord** (`gm push origin main`), puis le public (`git push origin deploiement:main`), car la fabrication lit la dernière version du module.
- Page complète en local (avec le module) : `python3 outils/ext.py web/index.html build/index-complet.html`, puis `shot2d.js` sur ce fichier.

## Serveur, télécommande, séances (à savoir)

- **Télécommande** (téléphone) : `rcOpen()` dans `web/index.html` (bloc « Télécommande intelligente »), bouton `#rcBtn` visible seulement sur téléphone, ouverture par `/remote` ou le raccourci Android (`pinRemote`). Maquette validée : artifact « Télécommande intelligente Rembobine ».
- **Vidéos** : le serveur choisit direct / remux / transcode selon ce que l'appareil sait lire (`app/serveur/video.js`) ; la TV lit tout avec mpv.
- **Interface de lecture** (demande du propriétaire, maquette validée dans l'artifact « Rembobine – maquettes PC et TV ») : `app/lecteur/rembobine_lecteur.lua`, un script pour mpv qui remplace sa barre d'origine (`--osc=no --script=…`, lancé par `gbx:mpv` de `app/main.js` et `playOnTv` de `serveur.js`, pas pour les diaporamas) : vrai titre (`rembobine-titre`), heure de fin, grande barre à chapitres, −10 s / +30 s, « Langue » et « Sous-titres » en clair (choix retenu dans `lecteur-prefs.json`), écran de pause, navigation au clavier / à la télécommande (Entrée, flèches, Échap). Les messages de l'appli (`show-text`) y deviennent une pastille (`script-message rembobine-message`). Le lecteur de cartouches NFC tape des chiffres puis Entrée : le script les ignore. Essai avec captures : mpv livré + Xvfb + `xdotool` (voir le script d'essai décrit dans le commit).
- **Séances entre amis** : le serveur sert de salon (`/api/room`) quand claude.ai n'est pas là (`rbbRoom()`) ; le code de la séance est aussi un code d'invitation (`/api/invite`, accès invité 2 jours : regarder et jouer, pas la télécommande ni les réglages). Les amis passent par **Tailscale** (installé dans Rembobine OS, bouton « Connecter Tailscale » dans Rembobine OS → À distance).
- **Émulateur** : embarqué (aucun appel à internet), 21 cœurs. Vérifié avec des ROM de test : NES, SNES, GB, GBA, Mega Drive, Master System, Game Gear, Atari 2600. Démarrent : PC Engine, PlayStation, Atari 7800, Virtual Boy, Neo Geo Pocket, WonderSwan, 32X, C64, Amstrad CPC. Chargés, à essayer avec un vrai jeu : N64, DS, arcade (FBNeo, MAME 2003), ZX Spectrum.
- **Consoles récentes** (`app/serveur/consoles.js`) : PSP (PPSSPP), PS2 (PCSX2), PS3 (RPCS3), GameCube et Wii (Dolphin), Xbox (xemu), Xbox 360 (Xenia, Windows) — les VRAIS émulateurs installés sur la machine du serveur (TV : seulement PSP et GameCube/Wii ; le reste sur PC). Reconnaissance par dossier, extension ou contenu du disque ; dossier `Rembobine/BIOS` (BIOS PS2 copié pour PCSX2, PS3UPDAT.PUP installé dans RPCS3, xemu.toml écrit) ; régions (Japon, USA, Europe, Monde…) reconnues et affichées, tout se lance quelle que soit la région. Test : `node app/serveur/test_consoles.js`.
- **Rembobine se suffit à lui-même** (décision du propriétaire : pas de dépendance à d'autres applis si possible) :
  - TV : RetroArch (NES, SNES, GB, GBA, Mega Drive/SMS/GG, DS) et Dolphin sont dans l'image ; toute autre console s'ouvre dans l'émulateur intégré de l'écran (évènement `emu`). PPSSPP n'existe pas pour le système du Raspberry.
  - PC : `ci/emulateurs_natifs.sh` met les vrais émulateurs DANS l'appli (resources/emulateurs) : Linux PCSX2, RPCS3, xemu, PPSSPP ; Windows PCSX2, RPCS3, xemu, Xenia, PPSSPP. Manque Dolphin pour PC (pas de version Linux officielle hors Flatpak ; le site bloque les téléchargements automatiques sous Windows) → bouton Installer.
  - Xenia Linux (Xbox 360) : livré avec SDL2, libsamplerate, libdecor, lz4 à côté du programme (`LD_LIBRARY_PATH` via `emuEnv`) ; demande glibc ≥ 2.38 (Ubuntu 24.04+, Debian 13, Fedora, Tumbleweed, Arch), sinon message clair (`glibcOk`).
  - Linux : testé sur Ubuntu 24.04/22.04, Debian 12, Fedora 41, openSUSE Tumbleweed, Arch (job `distros` de `essai-emulateurs.yml`) ; paquets par distribution dans `LISEZ-MOI.md`.
  - Essai rapide du script sans tout fabriquer : envoyer sur la branche `essai-emulateurs` (workflow `essai-emulateurs.yml`).
- **Manuels PDF** : lecteur pdf.js 3.11.174 « legacy » embarqué (`ci/pdfjs.sh build` → `app/web/pdfjs/`, `rbb_assets/pdfjs/` sur Android, route `/pdfjs/` du serveur) ; internet seulement si « Manuels PDF : lecteur par internet en secours » est coché (Paramètres → Jeux). Test : `node app/serveur/test_pdfjs.js`.
- **Installation des émulateurs** (`app/serveur/installer.js`) : bouton « Installer » de la page Consoles et émulateurs → version officielle la plus récente (AppImage GitHub sur Linux : PCSX2, RPCS3, xemu ; Flatpak : Dolphin, PPSSPP ; Windows : archive décompressée avec tar, Xenia compris) dans `Rembobine/Emulateurs`. Système PS3 téléchargé chez Sony (seul fichier système légal à télécharger). **Jamais de BIOS téléchargé** : ils viennent de la console du propriétaire. Test : `node app/serveur/test_installer.js`.
- **Fiches et jaquettes** (`app/serveur/fiches.js`, **recherche activée par défaut** — demande explicite du propriétaire ; Paramètres → Métadonnées pour la couper ; `REMBOBINE_FICHES=0` dans les tests) : quand le serveur a internet, il cherche d'après le titre (User-Agent `Rembobine/<version> (https://github.com/grecdel/Rembobine)`, 429/503 respectés, MusicBrainz ≤ 1 req/s ; bande-annonce YouTube via Wikidata P1651 ou TMDB, `/api/fiche-titre`, `/bande-annonce` ; livres Open Library/Google Books ; la jauge « Reprendre » suit aussi mpv et la TV) — films/séries/jeux sur Wikipédia (TMDB en priorité si une clé est réglée : affiches, acteurs), jaquettes de jeux RetroArch (thumbnails.libretro.com), albums sur MusicBrainz + Cover Art Archive. Gardé dans `serveur/fiches/` ; une jaquette ou un .nfo posé à côté reste prioritaire ; bouton « Corriger la fiche ». Test (faux internet) : `node app/serveur/test_fiches.js`. Vérifié avec le vrai internet le 8 nov. 2026 sur 20 titres (environnement de travail « Rembobine » avec les sites des fiches autorisés).
- **Consoles possibles plus tard** (idées en attente) : avec BIOS à fournir (Atari 5200, Lynx, ColecoVision, Mega-CD, Saturn, 3DO, PC-FX, Amiga) ; PSP (demande l'isolation « cross-origin » pour les fils) ; sur la TV Dreamcast et PSP (Pi 5 suffisant) ; PS2, GameCube/Wii, PS3 seulement sur un PC puissant (PCSX2, Dolphin, RPCS3 lancés par Rembobine).

## Modules du serveur (app/serveur/, un fichier par thème, chacun avec son test_*.js)

| Fichier | Rôle |
|---|---|
| `serveur.js` | routes, appairage, SSE, lecture TV (mpv) ; branche les autres modules |
| `bibliotheque.js`, `bibliotheque_plus.js` | scan ; doublons, collections, bonus, bandes-annonces, films en plusieurs morceaux, renommage avec annulation |
| `video.js`, `lecture.js` | conversion à la volée ; génériques (intro/fin), aperçus, chapitres, HDR, préparation à l'avance, hors ligne |
| `musique.js` | paroles .lrc, égaliseur (mpv) |
| `jeux.js`, `consoles.js`, `installer.js` | sauvegardes synchronisées, temps de jeu, tournoi, BIOS, manette téléphone ; émulateurs lourds |
| `collection.js` | collection d'un jeu : boîte (avant/dos/tranche), manuel (PDF ou images), cartouche/disque posés à côté ou ajoutés depuis la fiche (`/api/jeux/collection/<id>`) |
| `profils.js` | « Reprendre » partagé par profil |
| `telephone.js` | annonce UDP 41380 (plusieurs Rembobine), volume, widget |
| `os.js`, `maj.js`, `maj-garde.js`, `sauvegarde.js`, `systeme.js` | mises à jour avec retour arrière (Release `build.json`), sauvegarde complète, santé, extinction, Samba, alerte disque |
| `fiches.js`, `outils.js` | fiches internet ; ffmpeg/mpv livrés |
| `maison.js` | disque USB branché, lecteur CD/DVD (mpv), `/api/sante` (« Tout va bien ? ») |
| `monde3d.js` | progression partagée du module facultatif (`/api/monde3d`) |

- Fabrication : numéro `1.0.0+<run>` (`app/build.json`), job `essai` de bout en bout (`ci/essai_bout_en_bout.sh`) obligatoire avant publication ; les étapes du module ont leurs propres contrôles (résumés neutres à l'écran) ; licences rassemblées par `ci/licences.sh`.

- Licence : `LICENSE` « Tous droits réservés » ; page Paramètres → À propos → Crédits et licences. **5 cœurs non commerciaux** (Snes9x, Genesis Plus GX, PicoDrive, FBNeo, MAME 2003-Plus) : ne pas vendre Rembobine avec eux.
- Fusions de lots : commits avec auteur grecdel et committer `Claude <noreply@anthropic.com>`.

## Ce qui reste / idées en attente

- Tester la version sur de vrais appareils (jamais fait : seulement des captures automatiques).
- À vérifier sur le vrai Raspberry : mpv sur la TV, conversion vidéo (vitesse du Pi 5 en HEVC → H.264 720p), HDMI-CEC, Tailscale (connexion du compte, partage avec les amis), rembobine.local depuis le téléphone.
- Un mkv lu depuis un fichier du téléphone (pas du serveur) reste illisible sur Android si son format ne passe pas.
- Idées futures du propriétaire : salon social (amis à distance pour regarder un film ensemble, défis multijoueur), médias sur Raspberry Pi accessibles à distance, émulateur intégré à l'APK.
