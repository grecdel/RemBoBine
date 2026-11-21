#!/bin/sh
# Enlève Rembobine (tes réglages et ta médiathèque ne sont pas touchés).
rm -rf "$HOME/.local/share/rembobine" "$HOME/.local/share/applications/rembobine.desktop" "$HOME/.config/autostart/rembobine.desktop" "$HOME/.local/bin/rembobine" "$HOME/.local/share/mime/packages/rembobine.xml"
command -v update-mime-database >/dev/null 2>&1 && update-mime-database "$HOME/.local/share/mime" >/dev/null 2>&1 || true
# les choix « lecteur par défaut » qui pointaient vers Rembobine
[ -f "$HOME/.config/mimeapps.list" ] && sed -i "/=rembobine\.desktop;\?$/d; s/rembobine\.desktop;//g" "$HOME/.config/mimeapps.list" 2>/dev/null || true
echo "Rembobine est désinstallé."
