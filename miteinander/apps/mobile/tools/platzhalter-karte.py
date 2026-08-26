"""
Zeichnet die Standbilder fuer die gekennzeichneten Platzhaltervideos.

Bewusst eine Textkarte und keine gestellte Person: Wer das Video sieht,
soll auf den ersten Blick erkennen, dass hier noch keine Gebaerdensprache
steht. Eine Attrappe, die nach Gebaerdensprache aussieht, waere schlimmer
als gar nichts.

Aufruf: python3 platzhalter-karte.py < manifest.json
Braucht: Pillow
"""

import json
import sys
from PIL import Image, ImageDraw, ImageFont

BREITE, HOEHE = 1280, 720
HINTERGRUND = (14, 17, 22)
AKZENT = (255, 179, 92)
TEXT = (242, 244, 247)
GEDAEMPFT = (183, 191, 204)

SCHRIFT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SCHRIFT_FETT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def umbrechen(zeichner, text, schrift, maxbreite):
    woerter, zeilen, aktuell = text.split(), [], ""
    for wort in woerter:
        versuch = f"{aktuell} {wort}".strip()
        if zeichner.textlength(versuch, font=schrift) <= maxbreite:
            aktuell = versuch
        else:
            if aktuell:
                zeilen.append(aktuell)
            aktuell = wort
    if aktuell:
        zeilen.append(aktuell)
    return zeilen


def karte(titel, ziel):
    bild = Image.new("RGB", (BREITE, HOEHE), HINTERGRUND)
    z = ImageDraw.Draw(bild)

    # Rahmen als deutliches Signal "das ist nicht das fertige Video"
    z.rectangle([12, 12, BREITE - 12, HOEHE - 12], outline=AKZENT, width=6)

    klein = ImageFont.truetype(SCHRIFT_FETT, 34)
    gross = ImageFont.truetype(SCHRIFT_FETT, 58)
    normal = ImageFont.truetype(SCHRIFT, 34)

    z.text((BREITE / 2, 130), "PLATZHALTER", font=klein, fill=AKZENT, anchor="mm")

    y = 250
    for zeile in umbrechen(z, titel, gross, BREITE - 200):
        z.text((BREITE / 2, y), zeile, font=gross, fill=TEXT, anchor="mm")
        y += 74

    y = max(y + 40, 470)
    hinweis = "Hier entsteht ein Video in Deutscher Gebärdensprache."
    for zeile in umbrechen(z, hinweis, normal, BREITE - 200):
        z.text((BREITE / 2, y), zeile, font=normal, fill=GEDAEMPFT, anchor="mm")
        y += 46

    z.text(
        (BREITE / 2, HOEHE - 70),
        "Dies ist kein Gebärdensprach-Video.",
        font=normal,
        fill=AKZENT,
        anchor="mm",
    )

    bild.save(ziel, "JPEG", quality=88)


def main():
    auftrag = json.load(sys.stdin)
    for eintrag in auftrag:
        karte(eintrag["titel"], eintrag["ziel"])
    print(f"{len(auftrag)} Karten gezeichnet", file=sys.stderr)


if __name__ == "__main__":
    main()
