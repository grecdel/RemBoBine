# Rembobine — installer et lancer

Rembobine est ta médiathèque : films, séries, jeux, musique, rangés dans un salon interactif.

| Fichier | Pour quoi faire |
|---|---|
| `Rembobine-OS-RaspberryPi.img.xz` | **Rembobine OS** : carte SD prête pour Raspberry Pi 4 / 5 |
| `Rembobine-RaspberryPi.tar.gz` | Raspberry Pi 4 / 5 qui a déjà Raspberry Pi OS 64 bits |
| `Rembobine-Linux-PC.tar.gz` | PC sous Linux (Ubuntu, Mint, Debian, Fedora, openSUSE, Arch, Manjaro…) |
| `Rembobine.apk` | Téléphone, tablette ou box Android |
| `Rembobine-Windows.zip` | PC sous Windows 10 / 11 |

---

## 1. Raspberry Pi : Rembobine OS (le plus simple)

Une carte SD qui démarre directement sur Rembobine, en plein écran, comme une box télé.

1. Installe **Raspberry Pi Imager** sur ton PC (Fedora : `sudo dnf install rpi-imager`).
2. Dans Imager : **Appareil** → ton Raspberry Pi, **Système d'exploitation** → tout en bas **Utiliser une image personnalisée** → choisis `Rembobine-OS-RaspberryPi.img.xz`, **Stockage** → ta carte SD.
3. Imager propose de **modifier les réglages** : tu peux y mettre ton **Wi-Fi** (sinon branche un câble réseau). Ne change pas le nom d'utilisateur.
4. Mets la carte dans le Pi, branche-le sur la télé : au premier démarrage il s'agrandit et redémarre tout seul, puis Rembobine s'ouvre.

- Tes médias : branche un disque USB, ou copie-les dans le dossier `Rembobine` (Films, Series, Jeux, Musique).
- Utilisateur : `rembobine`. Son mot de passe est tiré au hasard au premier démarrage (propre à ton Raspberry) : il s'affiche dans **Rembobine OS → Avancé → Partage sur le réseau**. L'accès à distance SSH est coupé ; tu peux l'allumer dans Avancé (même mot de passe).
- Une manette, une souris ou un clavier sans fil marchent directement.

## 1 bis. Raspberry Pi qui a déjà Raspberry Pi OS

Il faut **Raspberry Pi OS 64 bits** (avec bureau), sur un Pi 4 ou un Pi 5.

1. Copie `Rembobine-RaspberryPi.tar.gz` sur le Pi (clé USB…), double-clique dessus et choisis **Extraire**.
2. Ouvre le dossier `Rembobine-Linux-arm64`, clic droit dans le dossier > **Ouvrir un terminal ici**, puis tape :

```
./installer.sh --demarrage
```

3. Redémarre le Pi : Rembobine s'ouvre tout seul, en plein écran, prêt pour la télé.

Sans `--demarrage`, Rembobine s'installe simplement dans le menu des applications (rubrique Son et vidéo).
Pour le lancer à la main en plein écran : `rembobine --kiosk`. Pour l'enlever : `./desinstaller.sh`.

Tous les formats de vidéo (mkv, avi…) se lisent sans rien installer : le lecteur et le convertisseur sont livrés avec Rembobine.

## 2. PC Linux (toutes les grandes distributions)

Rembobine marche sur les distributions Linux courantes, pour PC 64 bits. Il a été essayé automatiquement sur :
**Ubuntu 24.04 et 22.04** (et donc Linux Mint, Pop!_OS, Zorin), **Debian 12**, **Fedora 41**, **openSUSE Tumbleweed**, **Arch Linux** (et donc Manjaro, EndeavourOS).

Tout est livré dedans : le lecteur vidéo, le convertisseur vidéo, et les émulateurs des consoles (PS2, PS3, Xbox, Xbox 360, PSP).
Rien à installer en plus sur un ordinateur avec un bureau normal.

### Installation (pareil partout)

1. Double-clique sur `Rembobine-Linux-PC.tar.gz`, puis **Extraire**.
2. Ouvre le dossier `Rembobine-Linux-x64`, clic droit > **Ouvrir dans un terminal**, puis tape :

```
./installer.sh
```

3. Rembobine apparaît dans le menu des applications. Touche **F11** : plein écran.

Pas de mot de passe demandé : Rembobine s'installe seulement pour toi (dans ton dossier personnel). Pour l'enlever : `./desinstaller.sh`.

### Si Rembobine ne s'ouvre pas : les paquets de base

Sur un bureau normal ils sont déjà là. Sur une installation « minimale », tape la ligne de ta distribution (mot de passe demandé) :

| Distribution | Commande |
|---|---|
| Ubuntu 24.04 et plus, Mint 22 | `sudo apt install libnss3 libgtk-3-0t64 libgbm1 libasound2t64 libxss1 libsecret-1-0 libnotify4` |
| Ubuntu 22.04, Mint 21, Debian 12 | `sudo apt install libnss3 libgtk-3-0 libgbm1 libasound2 libxss1 libsecret-1-0 libnotify4` |
| Fedora | `sudo dnf install nss gtk3 mesa-libgbm alsa-lib libXScrnSaver libsecret libnotify` |
| openSUSE | `sudo zypper install mozilla-nss libgtk-3-0 libgbm1 libasound2 libXss1 libsecret-1-0 libnotify4` |
| Arch, Manjaro, EndeavourOS | `sudo pacman -S --needed nss gtk3 mesa alsa-lib libxss libsecret libnotify` |

### Pour les consoles récentes (PS2, PS3, Xbox, Xbox 360)

- Les émulateurs sont livrés avec Rembobine. Il faut une carte graphique qui gère **Vulkan** (presque toutes depuis 2016).
  Le pilote est en général déjà installé ; sinon :
  Ubuntu/Mint/Debian `sudo apt install mesa-vulkan-drivers` · Fedora `sudo dnf install mesa-vulkan-drivers` ·
  openSUSE `sudo zypper install libvulkan_radeon libvulkan_intel` · Arch/Manjaro `sudo pacman -S vulkan-radeon vulkan-intel`
  (carte NVIDIA : le pilote NVIDIA de ta distribution suffit).
- Les **BIOS** viennent de tes consoles : mets-les dans le dossier `Rembobine/BIOS` de ton dossier personnel.
  Le système de la PS3 se télécharge chez Sony avec le bouton de la page **Consoles et émulateurs**.
- La **Xbox 360** (Xenia) est la plus exigeante. Sur Linux, elle demande un système récent :
  **Ubuntu 24.04 ou plus, Linux Mint 22, Debian 13, Fedora, openSUSE Tumbleweed, Arch/Manjaro** (essayé : tout y est).
  Sur Ubuntu 22.04, Mint 21 ou Debian 12, le système est trop ancien pour Xenia : Rembobine le dit clairement ; joue à la Xbox 360 depuis Windows, ou mets ta distribution à jour.
  Sur Linux, beaucoup de jeux Xbox 360 marchent, certains moins bien que sous Windows.
- **Dolphin** (GameCube, Wii) : bouton **Installer** de la page Consoles et émulateurs (il passe par Flatpak, déjà présent sur Fedora, Mint, openSUSE, Manjaro ;
  ailleurs : `sudo apt install flatpak` ou `sudo pacman -S flatpak`).

## 3. Android

1. Copie `Rembobine.apk` sur le téléphone et ouvre-le depuis l'application **Fichiers**.
2. Autorise **l'installation d'applis inconnues** quand Android le demande, puis **Installer**.
3. Tiens le téléphone à l'horizontale.

Pour ajouter tes médias : bouton **Scanner un dossier**, puis choisis tes fichiers.
Mise à jour : depuis l'appli, avec le bouton **« Nouvelle version détectée »** (voir « Mises à jour » plus bas), ou en installant le nouvel APK par-dessus l'ancien. Tes réglages sont gardés.

## 4. Windows

1. Clic droit sur `Rembobine-Windows.zip` > **Extraire tout**.
2. Double-clique sur `Rembobine.exe`.
3. Si Windows affiche « Windows a protégé votre ordinateur » : **Informations complémentaires** > **Exécuter quand même** (l'application n'est pas signée par un éditeur payant).

---

## Les réglages

Tout se règle dans **Paramètres** (en bas du menu de gauche ; sur téléphone ou dans une fenêtre étroite, dans le menu du haut) :
- **Bibliothèque** : où sont tes films, séries, jeux.
- **Interface** : décorations de saison, fêtes à afficher (toutes / fêtes nationales seulement / aucune, et le pays), « Jingle au démarrage » (le petit air de la cassette qui rembobine, à couper ici).
- **Métadonnées** : « Chercher fiches et jaquettes sur internet » (activé au départ). Quand Rembobine est connecté, il cherche tout seul, d'après le titre du fichier, l'affiche, une grande image, le résumé, l'année, le genre, les acteurs et la bande-annonce (Wikipédia, Wikidata, Open Library, MusicBrainz, jaquettes RetroArch ; TMDB d'abord si tu mets une clé gratuite). Tout est gardé sur le disque ; une jaquette, un `.nfo` ou une bande-annonce `Titre-trailer.mp4` posés à côté du fichier passent devant. Décoché : rien ne part sur internet.

## Ouvrir un fichier avec Rembobine (lecteur seul)

Rembobine peut aussi servir de simple **lecteur** : clic droit sur une vidéo, une musique ou un jeu → **Ouvrir avec** → **Rembobine**.
Il s'ouvre tout de suite, sans la médiathèque ni le salon : juste le « R » en néon rouge dans un coin, puis le fichier.

- **Vidéo** (mkv, mp4, avi, mov, webm…) : le lecteur de Rembobine, avec le vrai titre, l'heure de fin, la langue, et les sous-titres posés à côté du film (`Film.srt`, `Film.fr.srt`). Rouvre la même vidéo : elle **reprend où tu t'étais arrêté**.
- **Musique** (mp3, flac, ogg, opus, m4a, wav…) : le lecteur de musique, avec les **autres morceaux du même dossier** à la suite.
- **Jeu** : la bonne console est choisie toute seule (ROM des anciennes consoles dans l'émulateur intégré ; disques PS2, GameCube, Wii, Xbox… dans leur émulateur). Les BIOS ne sont jamais téléchargés : ils restent à poser dans `Rembobine/BIOS`.
- À la fin, une petite question : **« Ajouter ce dossier à ta bibliothèque ? »** (jamais obligatoire, case « Ne plus demander »).
- Fermer le lecteur ferme Rembobine. Le petit bouton **Ouvrir Rembobine** (en haut à droite, ou dans l'écran de pause d'un film) ouvre la médiathèque complète.
- Si Rembobine est déjà ouvert, le fichier s'ouvre dans sa fenêtre, par-dessus la médiathèque.

**En faire le lecteur par défaut** (celui qui s'ouvre d'un double-clic) : **Paramètres → Système → Lecteur par défaut**, séparément pour les vidéos, la musique et les jeux. Rien ne change tant que tu ne le demandes pas.
- **Linux** : un clic suffit (installe d'abord Rembobine avec `./installer.sh`). « Ne plus l'utiliser par défaut » remet l'ancien lecteur.
- **Windows** : Windows ne laisse aucune appli se mettre par défaut toute seule. Le bouton ouvre **Paramètres de Windows → Applications → Applications par défaut** sur Rembobine : choisis Rembobine pour chaque type de fichier (.mkv, .mp4, .mp3…). Rembobine apparaît dans « Ouvrir avec » dès son premier lancement.
- **Android** : ouvre un fichier depuis l'appli **Fichiers**, choisis **Rembobine**, puis **Toujours**. Pour revenir en arrière : Réglages d'Android → Applications → Rembobine → Ouvrir par défaut.
- Raspberry Pi et télé : rien à régler, Rembobine y est déjà tout l'écran.

## Mises à jour

Quand une nouvelle version de Rembobine est publiée, un bouton **« Nouvelle version détectée »** apparaît en bas à gauche de l'écran.
Rembobine regarde tout seul, 30 secondes après l'ouverture puis toutes les 6 heures (réglage **Paramètres → Système → Vérifier les mises à jour**) ; **Paramètres → À propos → Vérifier maintenant** pour le faire tout de suite.
Clique dessus (à la télécommande ou à la manette : descends tout en bas, puis OK) : la nouvelle version, sa date, sa taille et ses nouveautés s'affichent, avec **Mettre à jour maintenant** ou **Plus tard**.
On suit ensuite le téléchargement, la vérification et l'installation, puis Rembobine redémarre tout seul et dit « Rembobine est à jour ».

- **PC Linux, Raspberry Pi OS, Rembobine OS** : la nouvelle version s'installe **à côté** de l'ancienne. Si elle ne démarre pas dans la minute, **l'ancienne revient toute seule**. Bouton « Revenir à la version précédente » aussi (Rembobine OS → Mises à jour).
- **PC Linux, appli simplement décompressée** (sans `./installer.sh`) : la première mise à jour installe Rembobine proprement dans ton dossier personnel (`~/.local/share/rembobine`, avec le raccourci du menu des applications) et le relance depuis là. Le dossier décompressé n'est pas modifié (tu pourras le supprimer) ; tes réglages et ta bibliothèque sont gardés.
- **Windows** : Rembobine se ferme, remplace son dossier par la nouvelle version et se rouvre tout seul ; si elle ne démarre pas, l'ancienne revient. Si Rembobine est rangé dans un dossier protégé (comme « Program Files »), la mise à jour est seulement téléchargée dans `Rembobine/MisesAJour`.
- **Android** : l'appli télécharge et vérifie la nouvelle version, puis Android demande de confirmer l'installation (la première fois, autorise **Installer des applis inconnues** pour Rembobine, l'installation continue toute seule). Tes réglages sont gardés.
- **Rembobine OS** peut aussi se mettre à jour tout seul la nuit (entre 3 h et 5 h, si rien ne passe à la télé) : option dans **Rembobine OS → Mises à jour**. Pareil pour un PC Linux installé avec `./installer.sh` (option désactivée au départ).
- **Sans internet** : copie `Rembobine-RaspberryPi.tar.gz` (ou `Rembobine-Linux-PC.tar.gz`) sur une clé USB et branche-la : elle apparaît dans Rembobine OS → Mises à jour. Depuis un PC, on peut aussi envoyer le fichier.
- **Sécurité** : rien n'est installé avant d'avoir vérifié la taille et l'empreinte du fichier (et la signature de Rembobine quand elle est réglée) ; les fichiers ne viennent que de la page des versions de Rembobine sur GitHub ; un ami invité à une séance ne voit pas les mises à jour.
- Le numéro de fabrication (ex. `1.0.0+57`) est dans **Paramètres → À propos**.

### Ouvrir les mises à jour automatiques (à faire une fois)

Les applis vont chercher les nouvelles versions sur GitHub **sans identifiant** : aucun mot de passe ni jeton n'est mis dans l'appli.
Tant que le dépôt de Rembobine est **privé**, GitHub leur répond « introuvable », et Rembobine affiche « Les mises à jour automatiques ne sont pas encore ouvertes ». Deux façons de les ouvrir :

**Façon 1 : rendre le dépôt public** (le plus simple). Sur GitHub, dépôt `grecdel/Rembobine` → **Settings** → tout en bas, **Change repository visibility** → **Public**. Les applis déjà installées trouvent les versions tout de suite.

**Façon 2 : un petit dépôt public qui ne contient que les versions** (le code reste privé).

1. Sur GitHub, **New repository** : nom `Rembobine-versions` (par exemple), **Public**, coche **Add a README file**, puis **Create repository**.
2. Crée un jeton qui n'a le droit d'écrire **que** dans ce dépôt : ta photo de profil → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**. **Repository access** : *Only select repositories* → `Rembobine-versions`. **Permissions** : **Contents** → *Read and write*. Durée : un an (à renouveler). Copie le jeton.
3. Dans le dépôt `grecdel/Rembobine` → **Settings** → **Secrets and variables** → **Actions** → onglet **Secrets** → **New repository secret** : nom `RBB_VERSIONS_TOKEN`, valeur : le jeton.
4. Même endroit, onglet **Variables** → **New repository variable** : nom `RBB_DEPOT_VERSIONS`, valeur : `grecdel/Rembobine-versions`.
5. Envoie une nouvelle version (fabrication) : ses fichiers sont recopiés dans `Rembobine-versions` (version `v1.0.0`), et les applis fabriquées à partir de là y cherchent leurs mises à jour.

Les applis installées **avant** ce réglage cherchent encore dans `grecdel/Rembobine` : installe-leur cette nouvelle version une fois à la main.
Sans la variable **et** le secret, rien ne change : tout reste dans `grecdel/Rembobine`.

## Sauvegarde complète

**Rembobine OS → Sauvegardes** : réglages, profils, cartouches NFC, positions de lecture, progression et sauvegardes de jeux, dans un seul fichier.
« Sauvegarder maintenant » (sur Rembobine), « Sur la clé USB » (dossier `Rembobine-sauvegardes` de la clé), « Télécharger » pour la garder sur un PC, « Restaurer » pour tout remettre.
Une copie est faite toute seule chaque semaine.

## Déposer des films depuis un PC (Rembobine OS)

Le dossier **Rembobine** du Raspberry est partagé sur le réseau de la maison :
- Windows : dans l'Explorateur, tape `\\rembobine\Rembobine` dans la barre d'adresse ;
- Mac : Finder → Aller → Se connecter au serveur → `smb://rembobine.local/Rembobine` ;
- Linux : dans le gestionnaire de fichiers, `smb://rembobine.local/Rembobine`.

Utilisateur `rembobine` ; le mot de passe (propre à ton Raspberry) s'affiche dans Rembobine OS → Avancé → Partage sur le réseau. Glisse tes films dans `Films`, tes séries dans `Series`, tes jeux dans `Jeux`.
La musique : un dossier `Musique` (mp3, flac, ogg…), rangé par dossier d'album ; on l'ajoute dans Paramètres › Bibliothèque › Mes dossiers.

Les photos : un dossier d'images (sans vidéos, jeux ni musique dedans) devient un album. Les livres : EPUB, PDF ou bandes dessinées CBZ. Les livres audio : un dossier « Livres audio », avec un sous-dossier par livre (ou un fichier `.m4b`).
Le partage est allumé au départ. Pour le couper (ou le rallumer) : Rembobine OS → Avancé → Partage sur le réseau, **sur l'écran de la TV** (pas depuis un téléphone, par sécurité). Le choix est gardé après un redémarrage.

## Éteindre proprement

Rembobine OS → Avancé → **Éteindre** (ou **Redémarrer**), ou depuis la télécommande du téléphone (onglet Télécommande, en bas). Une confirmation est demandée ; les amis invités ne peuvent pas le faire.
Attends que la petite lumière verte du Raspberry s'arrête avant de débrancher.

## Licence

Rembobine : © 2026 grecdel, tous droits réservés (voir le fichier `LICENSE`). Les logiciels livrés avec Rembobine (émulateurs, FFmpeg, mpv, Electron, Godot…) gardent leur propre licence :
liste complète dans **Paramètres → À propos → Crédits et licences**, textes dans le dossier `licences` de l'application.

## Si quelque chose ne marche pas

- **Un écran reste noir** : la carte graphique est peut-être trop ancienne. Sur Linux, lance `REMBOBINE_GL=compat rembobine`.
- **Une vidéo ne se lit pas** : le lecteur et le convertisseur sont livrés avec Rembobine, rien à installer ; si un seul fichier refuse de se lire, il est peut-être abîmé.
- **Sur Linux, rien ne s'ouvre** : vérifie que le fichier `rembobine` est autorisé à s'exécuter (clic droit > Propriétés > Exécutable).

## Pour le développeur

Le dépôt `rembobine` contient tout :

| Dossier | Contenu |
|---|---|
| `web/index.html` | le logiciel Rembobine (la page) |
| `app/` | l'application de bureau (Linux, Raspberry, Windows) |
| `android/` | l'écran de démarrage Android |
| `.github/workflows/build.yml` | fabrique toutes les versions automatiquement |

Chaque envoi sur GitHub fabrique les quatre versions (onglet **Actions**).
Chaque envoi sur main met à jour la version du fichier `VERSION` dans **Releases** (pour une nouvelle version : changer `VERSION`).
La clé de signature Android reste dans le secret GitHub `RBB_SIGNING_KEY`, et la clé de chiffrement du module dans le secret `RBB_PCK_KEY` — jamais dans le dépôt.
