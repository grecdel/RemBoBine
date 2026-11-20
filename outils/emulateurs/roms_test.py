#!/usr/bin/env python3
"""Fabrique de minuscules « jeux » de test, un par console, écrits à la main (aucun jeu du commerce).
Chacun peint l'écran d'une couleur connue : si l'émulateur affiche cette couleur, il a bien démarré et exécuté le programme.
   python3 outils/emulateurs/roms_test.py <dossier>   → nes, snes, gb, gba, md, sms, a26 (+ couleur attendue dans attendu.json)"""
import json, os, struct, sys

out = sys.argv[1] if len(sys.argv) > 1 else "roms_test"
os.makedirs(out, exist_ok=True)
attendu = {}

def save(name, data, couleur):
    with open(os.path.join(out, name), "wb") as f:
        f.write(bytes(data))
    attendu[name] = couleur

# --- NES (iNES, mapper 0) : palette de fond = rouge ($16), rendu du fond activé ---
prg = bytearray(16384)
code = bytes([0x78, 0xD8, 0xA2, 0xFF, 0x9A,                      # SEI, CLD, pile
              0x2C, 0x02, 0x20, 0x10, 0xFB, 0x2C, 0x02, 0x20, 0x10, 0xFB,   # attendre 2 retours de balayage
              0xA9, 0x3F, 0x8D, 0x06, 0x20, 0xA9, 0x00, 0x8D, 0x06, 0x20,   # adresse $3F00 (palette)
              0xA9, 0x16, 0x8D, 0x07, 0x20,                              # couleur rouge
              0xA9, 0x00, 0x8D, 0x05, 0x20, 0x8D, 0x05, 0x20,            # défilement 0
              0xA9, 0x08, 0x8D, 0x01, 0x20,                              # afficher le fond
              0x4C, 0x2B, 0xC0])                                          # boucle infinie
prg[0:len(code)] = code
prg[0x3FFA:0x4000] = struct.pack("<HHH", 0xC000, 0xC000, 0xC000)
save("test.nes", b"NES\x1a" + bytes([1, 1, 0, 0]) + bytes(8) + prg + bytes(8192), "rouge")

# --- Game Boy : palette de fond tout en noir (BGP = $FF), l'écran est allumé par défaut ---
gb = bytearray(32768)
gb[0x100:0x104] = bytes([0x00, 0xC3, 0x50, 0x01])                       # NOP ; JP $0150
gb[0x134:0x13F] = b"REMBOBINE  "
gb[0x150:0x156] = bytes([0x3E, 0xFF, 0xE0, 0x47, 0x18, 0xFE])           # LD A,$FF ; LDH ($47),A ; JR -2
gb[0x14D] = (-sum(gb[0x134:0x14D]) - 25) & 0xFF                         # somme de contrôle de l'en-tête
save("test.gb", gb, "noir")

# --- Game Boy Advance : couleur de fond = rouge, affichage normal ---
gba = bytearray(1024)
gba[0:4] = struct.pack("<I", 0xEA00002E)                                 # B 0xC0
gba[0xA0:0xAC] = b"REMBOBINE   "; gba[0xB2] = 0x96
gba[0xBD] = (-(sum(gba[0xA0:0xBD]) + 0x19)) & 0xFF
for i, w in enumerate([0xE3A00405, 0xE3A0101F, 0xE1C010B0,             # palette[0] = rouge
                       0xE3A00301, 0xE3A01000, 0xE1C010B0,             # DISPCNT = 0
                       0xEAFFFFFE]):                                    # boucle
    gba[0xC0 + 4 * i:0xC4 + 4 * i] = struct.pack("<I", w)
save("test.gba", gba, "rouge")

# --- Super Nintendo (LoROM) : couleur 0 = rouge, écran allumé ---
sn = bytearray(32768)
code = bytes([0x78, 0x18, 0xFB,                                          # SEI, mode natif
              0x9C, 0x21, 0x21, 0xA9, 0x1F, 0x8D, 0x22, 0x21, 0x9C, 0x22, 0x21,   # CGRAM[0] = rouge
              0xA9, 0x0F, 0x8D, 0x00, 0x21,                              # luminosité max, écran allumé
              0x80, 0xFE])                                                # boucle
sn[0:len(code)] = code
sn[0x7FC0:0x7FD5] = b"REMBOBINE TEST       "
sn[0x7FD5] = 0x20; sn[0x7FD7] = 0x08
for v in (0x7FEA, 0x7FEC, 0x7FEE, 0x7FFC, 0x7FFE):
    sn[v:v + 2] = struct.pack("<H", 0x8000)
chk = sum(sn) & 0xFFFF
sn[0x7FDC:0x7FE0] = struct.pack("<HH", chk ^ 0xFFFF, chk)
save("test.sfc", sn, "rouge")

# --- Mega Drive : couleur de fond (CRAM 0) = rouge, affichage allumé ---
md = bytearray(0x400)
md[0:8] = struct.pack(">II", 0x00FFFE00, 0x200)
md[0x100:0x110] = b"SEGA MEGA DRIVE "
md[0x150:0x160] = b"REMBOBINE TEST  "
md[0x1F0:0x1F3] = b"JUE"
code = bytes.fromhex("33FC814400C00004" "33FC870000C00004" "23FCC000000000C00004" "33FC000E00C00000" "60FE")
md[0x200:0x200 + len(code)] = code
save("test.md", md, "rouge")

# --- Master System : couleur de bordure/fond = rouge, affichage allumé ---
sms = bytearray(32768)
code = bytes([0xF3, 0x31, 0xF0, 0xDF,
              0x3E, 0x10, 0xD3, 0xBF, 0x3E, 0xC0, 0xD3, 0xBF,              # CRAM, couleur 16
              0x3E, 0x03, 0xD3, 0xBE,                                    # rouge
              0x3E, 0x00, 0xD3, 0xBF, 0x3E, 0xC0, 0xD3, 0xBF, 0x3E, 0x03, 0xD3, 0xBE,   # couleur 0 aussi
              0x3E, 0x40, 0xD3, 0xBF, 0x3E, 0x81, 0xD3, 0xBF,              # registre 1 : écran allumé
              0x18, 0xFE])
sms[0:len(code)] = code
sms[0x7FF0:0x7FF8] = b"TMR SEGA"
save("test.sms", sms, "rouge")

# --- Atari 2600 : couleur de fond = rouge ---
a26 = bytearray(4096)
code = bytes([0x78, 0xD8, 0xA9, 0x44, 0x85, 0x09,                       # fond rouge
              0xA9, 0x02, 0x85, 0x00, 0x85, 0x02, 0x85, 0x02, 0x85, 0x02, 0xA9, 0x00, 0x85, 0x00,   # synchro verticale (3 lignes)
              0xA2, 0x00, 0x85, 0x02, 0xCA, 0xD0, 0xFB,                  # 256 lignes
              0x85, 0x02, 0x85, 0x02, 0x85, 0x02, 0x4C, 0x06, 0xF0])     # 3 lignes de plus, image suivante
a26[0:len(code)] = code
a26[0xFFC:0x1000] = struct.pack("<HH", 0xF000, 0xF000)
save("test.a26", a26, "rouge")

with open(os.path.join(out, "attendu.json"), "w") as f:
    json.dump(attendu, f, indent=1, ensure_ascii=False)
print("ROM de test :", ", ".join(attendu))
