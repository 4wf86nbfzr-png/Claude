#!/usr/bin/env python3
"""Erzeugt die sechs Miniaturen fuer den Balken unter der Kopfzeile.

    python3 tools/bilder-menue.py

Der Balken (`.megabar`, gebaut von main.js) zeigt je Bereich ein Foto in
einem Kasten von rund 200 x 150 CSS-Pixeln. Ohne eigene Stufe griffe er zur
kleinsten vorhandenen Datei — und die hat 1600 px. Gemessen kostete das
**300 KB auf jeder der fuenfzehn Seiten**, fuer sechs Bilder, die zusammen
kaum groesser als eine Visitenkarte sind.

480 px Kantenlaenge deckt den Kasten auch auf einem Schirm mit doppelter
Pixeldichte ab (200 x 2 = 400). Mehr braucht es hier nicht: der Balken ist
Navigation, keine Galerie, und die Fotos stehen darin ohnehin zurueckgenommen.

Mehrfach ausfuehrbar; beim zweiten Lauf meldet es dieselben Dateien noch
einmal, schreibt aber denselben Inhalt.
"""
import os
import sys

from PIL import Image, ImageFilter

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(WURZEL, "assets/img")

# Dieselben sechs Motive wie in main.js unter BEREICHE. Wer dort eines
# austauscht, muss es hier nachziehen — sonst faellt der Balken auf die
# grosse Datei zurueck, und das faellt niemandem auf ausser der Waage.
MOTIVE = ["gastro-detail", "sicherheit", "promotion-messe",
          "logistik", "fahrservice-door", "reinigung"]

KANTE = 480
QUALITAET = 72
# Verkleinern macht weich; ein wenig nachschaerfen holt die Kanten zurueck.
UNSCHARF = (0.8, 60, 3)   # Radius, Staerke in Prozent, Schwelle


def main():
    gesamt = 0
    for stamm in MOTIVE:
        quelle = os.path.join(IMG, stamm + ".jpg")
        if not os.path.exists(quelle):
            print("  fehlt:", stamm + ".jpg")
            continue
        ziel = os.path.join(IMG, stamm + "-mini.webp")

        im = Image.open(quelle).convert("RGB")
        b, h = im.size
        faktor = KANTE / max(b, h)
        if faktor >= 1:
            klein = im
        else:
            klein = im.resize((max(1, round(b * faktor)), max(1, round(h * faktor))),
                              Image.LANCZOS)
            klein = klein.filter(ImageFilter.UnsharpMask(*UNSCHARF))
        klein.save(ziel, "WEBP", quality=QUALITAET, method=6)

        kb = os.path.getsize(ziel) / 1024
        gesamt += kb
        print(f"  {stamm:22s} {b} x {h}  ->  {klein.size[0]} x {klein.size[1]}   {kb:5.1f} KB")

    print(f"\nSechs Miniaturen, zusammen {gesamt:.0f} KB.")
    print("Eingehaengt werden sie von main.js (BEREICHE), nicht vom Markup.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
