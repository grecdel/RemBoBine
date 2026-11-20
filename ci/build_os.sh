#!/bin/bash
# Fabrique « Rembobine OS » : une image Raspberry Pi (Pi 4 / Pi 5, 64 bits) qui démarre directement
# sur Rembobine, en plein écran, sans bureau. À lancer sur Linux x86_64 avec sudo (GitHub Actions).
#   ci/build_os.sh <dossier Rembobine-Linux-arm64> <image de sortie .img>
set -euo pipefail
APP="$(readlink -f "$1")"
OUT="$(readlink -f "$2")"
WORK="$(pwd)/build/os"
BASE_URL="https://downloads.raspberrypi.com/raspios_lite_arm64_latest"
mkdir -p "$WORK"

echo "== 1. Image de base : Raspberry Pi OS Lite 64 bits"
[ -f "$WORK/base.img.xz" ] || curl -sSL -o "$WORK/base.img.xz" "$BASE_URL"
rm -f "$OUT"; xz -dc "$WORK/base.img.xz" > "$OUT"

echo "== 2. Agrandir l'image (+2,5 Go pour Rembobine et l'affichage)"
truncate -s +2560M "$OUT"
sudo parted -s "$OUT" resizepart 2 100%
LOOP=$(sudo losetup -fP --show "$OUT")
sudo e2fsck -pf "${LOOP}p2" || true
sudo resize2fs "${LOOP}p2"

R="$WORK/root"
mkdir -p "$R"
sudo mount "${LOOP}p2" "$R"
sudo mount "${LOOP}p1" "$R/boot/firmware"
for d in dev dev/pts proc sys; do sudo mount --bind "/$d" "$R/$d"; done
# accès à Internet pendant la fabrication (le réglage d'origine est remis à la fin)
sudo mv "$R/etc/resolv.conf" "$R/etc/resolv.conf.orig" 2>/dev/null || true
sudo cp -L /etc/resolv.conf "$R/etc/resolv.conf"
cleanup() {
  set +e
  for d in sys proc dev/pts dev; do sudo umount -l "$R/$d" 2>/dev/null; done
  sudo umount "$R/boot/firmware" 2>/dev/null; sudo umount "$R" 2>/dev/null
  sudo losetup -d "$LOOP" 2>/dev/null
}
trap cleanup EXIT
CH() { sudo chroot "$R" /usr/bin/env DEBIAN_FRONTEND=noninteractive LC_ALL=C bash -c "$1"; }

echo "== 3. Affichage, son, vidéo (installés dans l'image, en émulation ARM)"
CH "apt-get update -q"
PKGS="xserver-xorg xinit x11-xserver-utils xserver-xorg-input-libinput unclutter \
 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libxss1 libxshmfence1 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libxtst6 libxcursor1 libxinerama1 libxi6 libsecret-1-0 libnotify4 \
 libasound2 libasound2t64 libgl1-mesa-dri libegl1 libgles2 libgl1 mesa-vulkan-drivers \
 pipewire pipewire-pulse wireplumber mpv ffmpeg avahi-daemon libnss-mdns samba wsdd retroarch libretro-nestopia libretro-snes9x libretro-mgba libretro-gambatte libretro-genesisplusgx libretro-beetle-pce-fast libretro-desmume ppsspp ppsspp-sdl dolphin-emu v4l-utils cec-utils fonts-dejavu-core fonts-noto-color-emoji ca-certificates"
# seulement les paquets vraiment installables (un nom seulement « cité » par un autre paquet n'a pas de « Candidate »)
AVAIL=$(CH "for p in $PKGS; do apt-cache policy \$p 2>/dev/null | grep -q 'Candidate: [^(]' && echo \$p; done" | tr '\n' ' ')
echo "  absents de cette version du système (ignorés) : $(for p in $PKGS; do case " $AVAIL " in *" $p "*) ;; *) printf '%s ' "$p" ;; esac; done)"
CH "apt-get install -y -q --no-install-recommends $AVAIL"
# Tailscale (réseau privé pour les amis à distance), depuis le dépôt officiel ; facultatif si le dépôt ne répond pas
CH "set -e; . /etc/os-release; curl -fsSL https://pkgs.tailscale.com/stable/debian/\$VERSION_CODENAME.noarmor.gpg -o /usr/share/keyrings/tailscale-archive-keyring.gpg && curl -fsSL https://pkgs.tailscale.com/stable/debian/\$VERSION_CODENAME.tailscale-keyring.list -o /etc/apt/sources.list.d/tailscale.list && apt-get update -q && apt-get install -y -q tailscale && systemctl enable tailscaled" || echo "Tailscale non installé (dépôt injoignable)"
# le serveur de Rembobine (utilisateur rembobine) peut connecter / couper Tailscale, et rien d'autre
# (commande exacte, sans « * » : pas d'autres options comme --ssh, --advertise-routes ou --exit-node)
#  (dans sudoers, le « = » des arguments s'écrit « \= »)
echo 'rembobine ALL=(root) NOPASSWD: /usr/bin/tailscale up --timeout\=25s --hostname\=rembobine, /usr/bin/tailscale down' | sudo tee "$R/etc/sudoers.d/rembobine-tailscale" >/dev/null
sudo chmod 440 "$R/etc/sudoers.d/rembobine-tailscale"
CH "visudo -cf /etc/sudoers.d/rembobine-tailscale"
# … éteindre / redémarrer proprement (télécommande, réglages), allumer / couper le partage réseau et SSH : seulement ces commandes exactes
sudo tee "$R/etc/sudoers.d/rembobine-systeme" >/dev/null <<'EOF'
rembobine ALL=(root) NOPASSWD: /usr/bin/systemctl poweroff, /usr/bin/systemctl reboot
rembobine ALL=(root) NOPASSWD: /usr/bin/systemctl enable --now smbd, /usr/bin/systemctl disable --now smbd, /usr/bin/systemctl enable --now nmbd, /usr/bin/systemctl disable --now nmbd
rembobine ALL=(root) NOPASSWD: /usr/bin/systemctl enable --now ssh, /usr/bin/systemctl disable --now ssh
EOF
sudo chmod 440 "$R/etc/sudoers.d/rembobine-systeme"
CH "visudo -cf /etc/sudoers.d/rembobine-systeme"
CH "apt-get clean"

echo "== 4. Rembobine dans /opt/rembobine (une version par dossier : les mises à jour s'installent à côté)"
# /opt/rembobine/versions/1.0.0+57/…   /opt/rembobine/actuelle → versions/1.0.0+57   /opt/rembobine/rembobine → actuelle/rembobine
LABEL=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["label"])' "$APP/resources/app/build.json" 2>/dev/null || echo "$(cat VERSION 2>/dev/null || echo 1.0.0)+0")
B="$R/opt/rembobine"
sudo rm -rf "$B"; sudo mkdir -p "$B/versions"
sudo cp -a "$APP" "$B/versions/$LABEL"
sudo ln -sfn "versions/$LABEL" "$B/actuelle"
sudo ln -sfn "actuelle/rembobine" "$B/rembobine"
sudo chmod +x "$B/versions/$LABEL/rembobine" "$B/versions/$LABEL/rembobine-bin" "$B/versions/$LABEL"/resources/gamebox3d/* || true
# c'est Rembobine OS (le serveur active alors les mises à jour automatiques la nuit, l'extinction depuis la télécommande…)
echo "Rembobine OS $LABEL" | sudo tee "$R/etc/rembobine-os" >/dev/null

echo "== 5. Utilisateur, connexion automatique et démarrage sur Rembobine"
# Sécurité : pas de mot de passe connu de tous (« rembobine ») et pas d'administrateur (groupe sudo) :
# le serveur n'a droit qu'aux commandes exactes listées dans /etc/sudoers.d (extinction, partage, SSH, Tailscale).
# Le mot de passe est verrouillé dans l'image, puis tiré au hasard au premier démarrage (rembobine-premier-demarrage,
# plus bas) et affiché dans Rembobine OS → Avancé → Partage sur le réseau. La connexion automatique à l'écran n'en a pas besoin.
CH "id rembobine >/dev/null 2>&1 || useradd -m -s /bin/bash -G video,audio,input,render,plugdev,netdev rembobine"
CH "gpasswd -d rembobine sudo >/dev/null 2>&1 || true; usermod -p '!' rembobine"
# pas d'assistant de premier démarrage : l'utilisateur existe déjà
CH "systemctl disable userconfig.service 2>/dev/null || true; rm -f /etc/systemd/system/getty@tty1.service.d/autologin.conf"
CH "rm -f /etc/ssh/sshd_config.d/rename_user.conf 2>/dev/null || true"
sudo mkdir -p "$R/etc/systemd/system/getty@tty1.service.d"
sudo tee "$R/etc/systemd/system/getty@tty1.service.d/rembobine.conf" >/dev/null <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin rembobine --noclear %I $TERM
EOF
# la session : un écran X sans bureau, Rembobine en plein écran (relancé s'il se ferme)
sudo tee "$R/opt/rembobine/session.sh" >/dev/null <<'EOF'
#!/bin/sh
xset s off; xset -dpms; xset s noblank
unclutter -idle 3 &
while true; do
  REMBOBINE_KIOSK=1 /opt/rembobine/rembobine --kiosk
  sleep 1
done
EOF
sudo chmod +x "$R/opt/rembobine/session.sh"
# le serveur (utilisateur rembobine) installe lui-même les nouvelles versions à côté
CH "chown -R rembobine:rembobine /opt/rembobine"
sudo tee "$R/home/rembobine/.bash_profile" >/dev/null <<'EOF'
# Rembobine OS : sur l'écran principal, on démarre directement Rembobine
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  # +bs : le serveur X garde l'image des fenêtres cachées (passage d'une fenêtre à l'autre sans éclair blanc, voir app/monde3d.js)
  exec startx /opt/rembobine/session.sh -- -nocursor +bs vt1 >/tmp/rembobine-x.log 2>&1
fi
EOF
CH "chown rembobine:rembobine /home/rembobine/.bash_profile"
# l'écran du Raspberry Pi 5 (et 4) : utiliser la bonne carte graphique pour l'affichage
sudo mkdir -p "$R/etc/X11/xorg.conf.d"
sudo tee "$R/etc/X11/xorg.conf.d/99-vc4.conf" >/dev/null <<'EOF'
Section "OutputClass"
  Identifier "vc4"
  MatchDriver "vc4"
  Driver "modesetting"
  Option "PrimaryGPU" "true"
EndSection
EOF
# le dossier des médias, prêt à remplir
CH "mkdir -p /home/rembobine/Rembobine/Films /home/rembobine/Rembobine/Series /home/rembobine/Rembobine/Jeux /home/rembobine/Rembobine/Musique /home/rembobine/Rembobine/Photos /home/rembobine/Rembobine/Livres /home/rembobine/Rembobine/BIOS /home/rembobine/Rembobine/Emulateurs && chown -R rembobine:rembobine /home/rembobine/Rembobine"
# le dossier Rembobine partagé sur le réseau de la maison (déposer des films depuis le PC), en lecture/écriture pour « rembobine »
# (désactivable dans Rembobine OS → Avancé ; utilisateur rembobine, mot de passe tiré au hasard au premier démarrage)
# Le dossier Emulateurs n'est pas partagé : les programmes qui s'y trouvent sont lancés par Rembobine.
if [ -f "$R/etc/samba/smb.conf" ]; then
  sudo sed -i 's/^\(\s*workgroup\s*=\).*/\1 WORKGROUP/' "$R/etc/samba/smb.conf"
  grep -q '^\[Rembobine\]' "$R/etc/samba/smb.conf" || sudo tee -a "$R/etc/samba/smb.conf" >/dev/null <<'EOF'

[Rembobine]
   comment = Films, séries, jeux et musique de Rembobine
   path = /home/rembobine/Rembobine
   valid users = rembobine
   force user = rembobine
   read only = no
   browseable = yes
   create mask = 0664
   directory mask = 0775
   veto files = /Emulateurs/
   wide links = no
   follow symlinks = no
EOF
  # (le compte Samba est créé au premier démarrage, avec le mot de passe tiré au hasard)
  CH "systemctl enable smbd nmbd 2>/dev/null; systemctl enable wsdd 2>/dev/null || true"
  sudo mkdir -p "$R/etc/avahi/services"
  sudo tee "$R/etc/avahi/services/rembobine-partage.service" >/dev/null <<'EOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group><name replace-wildcards="yes">Rembobine (%h)</name><service><type>_smb._tcp</type><port>445</port></service></service-group>
EOF
else echo "Samba non installé (paquet indisponible)"; fi
# le nom « rembobine.local » sur le réseau de la maison (le téléphone trouve la TV tout seul)
CH "systemctl enable avahi-daemon 2>/dev/null || true"
# les services de son de l'utilisateur démarrent avec sa session
CH "mkdir -p /var/lib/systemd/linger && touch /var/lib/systemd/linger/rembobine"
# premier démarrage : un mot de passe propre à CE Raspberry (partage réseau, et SSH si on l'active), jamais le même pour tous.
# Gardé dans /etc/rembobine/mot-de-passe (lisible par root et par le serveur Rembobine seulement), affiché dans Rembobine OS.
# Si un mot de passe a été choisi dans Raspberry Pi Imager, celui de la session est gardé (seul le partage prend le nouveau).
# (le script est hors de /opt/rembobine, qui appartient à l'utilisateur rembobine : lui ne peut pas le modifier)
sudo tee "$R/usr/local/sbin/rembobine-premier-demarrage" >/dev/null <<'EOF'
#!/bin/sh
set -e
umask 077
mkdir -p /etc/rembobine
P=$(tr -dc 'abcdefghjkmnpqrstuvwxyz23456789' </dev/urandom | head -c 12 | sed 's/\(....\)\(....\)\(....\)/\1-\2-\3/')
[ ${#P} -eq 14 ] || exit 1
if [ "$(passwd -S rembobine 2>/dev/null | awk '{print $2}')" = "L" ]; then echo "rembobine:$P" | chpasswd; fi
if command -v smbpasswd >/dev/null 2>&1; then (echo "$P"; echo "$P") | smbpasswd -s -a rembobine >/dev/null; fi
printf '%s\n' "$P" > /etc/rembobine/mot-de-passe.tmp
chown root:rembobine /etc/rembobine/mot-de-passe.tmp
chmod 640 /etc/rembobine/mot-de-passe.tmp
chmod 755 /etc/rembobine
mv /etc/rembobine/mot-de-passe.tmp /etc/rembobine/mot-de-passe
EOF
sudo chmod 755 "$R/usr/local/sbin/rembobine-premier-demarrage"; sudo chown root:root "$R/usr/local/sbin/rembobine-premier-demarrage"
sudo tee "$R/etc/systemd/system/rembobine-premier-demarrage.service" >/dev/null <<'EOF'
[Unit]
Description=Rembobine : mot de passe propre à cet appareil (premier démarrage)
ConditionPathExists=!/etc/rembobine/mot-de-passe
After=local-fs.target
Before=smbd.service nmbd.service ssh.service getty@tty1.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/rembobine-premier-demarrage
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
CH "systemctl enable rembobine-premier-demarrage.service"
# SSH coupé par défaut (à allumer dans Rembobine OS → Avancé, si besoin)
CH "systemctl disable ssh 2>/dev/null || true; rm -f /boot/firmware/ssh /boot/firmware/ssh.txt"

echo "== 6. Réglages : nom, langue, heure, démarrage silencieux"
echo "rembobine" | sudo tee "$R/etc/hostname" >/dev/null
sudo sed -i 's/127.0.1.1.*/127.0.1.1\trembobine/' "$R/etc/hosts"
CH "sed -i 's/^# *fr_FR.UTF-8/fr_FR.UTF-8/' /etc/locale.gen && locale-gen >/dev/null && update-locale LANG=fr_FR.UTF-8"
CH "ln -sf /usr/share/zoneinfo/Europe/Paris /etc/localtime && echo Europe/Paris > /etc/timezone"
sudo sed -i 's/XKBLAYOUT=.*/XKBLAYOUT="fr"/' "$R/etc/default/keyboard" 2>/dev/null || true
# pas de texte qui défile au démarrage, et assez de mémoire vidéo
sudo sed -i 's/$/ quiet loglevel=3 logo.nologo vt.global_cursor_default=0/' "$R/boot/firmware/cmdline.txt"
grep -q "^disable_splash" "$R/boot/firmware/config.txt" || echo "disable_splash=1" | sudo tee -a "$R/boot/firmware/config.txt" >/dev/null
# pas de premier démarrage interactif qui renommerait l'utilisateur
sudo rm -f "$R/boot/firmware/userconf.txt"

echo "== 7. Fermer l'image"
sudo rm -f "$R/etc/resolv.conf"; sudo mv "$R/etc/resolv.conf.orig" "$R/etc/resolv.conf" 2>/dev/null || true
sync
cleanup
trap - EXIT
ls -la "$OUT"
