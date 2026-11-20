#!/bin/sh
# Enlève Rembobine (tes réglages et ta médiathèque ne sont pas touchés).
rm -rf "$HOME/.local/share/rembobine" "$HOME/.local/share/applications/rembobine.desktop" "$HOME/.config/autostart/rembobine.desktop" "$HOME/.local/bin/rembobine"
echo "Rembobine est désinstallé."
