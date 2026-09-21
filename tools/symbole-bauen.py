#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baut alle Symbole der Website aus EINER Vorlage: `logo-herm-mark.png`.

Warum es dieses Skript gibt, und nicht acht von Hand gepflegte PNG:

Beim Umbau auf Dunkelblau ist zuerst aufgefallen, dass die Symbole zwei
verschiedenen Farbschemata angehoerten, und zwar mitten in derselben
Datei-Familie:

    app-icon-192.png            dunkles Zeichen auf WEISS   (helle Fassung)
    app-icon-512.png            dunkles Zeichen auf WEISS   (helle Fassung)
    app-icon-maskable-512.png   helles Zeichen auf SCHWARZ  (dunkle Fassung)
    apple-touch-icon.png        helles Zeichen auf #0B0713
    favicon-16/32, favicon.ico  helles Zeichen auf #0B0713

Die drei ersten stehen alle im selben `site.webmanifest`. Welches davon
ein Telefon nimmt, haengt allein an seiner Aufloesung: auf dem einen
Geraet lag das Zeichen auf einer weissen Kachel, auf dem naechsten auf
einer schwarzen. Und `site.webmanifest` trug dazu noch
`background_color: #F7F6F3` — den Grund der hellen Fassung, die es seit
September nicht mehr gibt; der Startbildschirm der abgelegten Anwendung
blitzte also hell auf, bevor die dunkle Seite kam.

Das ist keine Geschmacksfrage, sondern die immer gleiche Ursache:
**abgeleitete Dateien, die von Hand gepflegt werden, laufen beim ersten
Farbwechsel auseinander.** Dasselbe Argument wie bei den Bildstufen
(`bilder-vergroessern.py`) und bei den Leistungszeilen
(`leistungen-bauen.py`).

Alles kommt deshalb aus zwei Zahlen ganz oben — Grund und Zeichenfarbe —
und aus der einen Vorlage. Mehrfach ausfuehrbar; ein Farbwechsel ist
danach ein Lauf und kein Nachmittag.

    python3 tools/symbole-bauen.py
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow fehlt — bitte 'pip install Pillow' ausfuehren.")

HIER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(HIER, "assets", "logo")
VORLAGE = os.path.join(LOGO, "logo-herm-mark.png")

# Dieselben beiden Werte wie `--grund` und `--tinte` im Stylesheet. Wer die
# Farbe der Seite wechselt, wechselt sie hier mit — es ist die einzige
# Stelle im Projekt, an der die Seitenfarbe ausserhalb von CSS und
# `theme-color` noch einmal vorkommt.
GRUND = (20, 51, 54)      # #143336
ZEICHEN = (216, 212, 209)  # #D8D4D1

# Der Rand ist Anteil der Kantenlaenge. 14 % ist der Wert, den
# apple-touch-icon und favicon-source schon hatten; die maskierbare
# Fassung braucht mehr, weil Android frei geformt ausschneidet und dabei
# bis zu 20 % der Kante wegnehmen darf.
RAND = 0.14
RAND_MASKIERBAR = 0.20

SYMBOLE = [
    # Datei, Kante, Rand
    ("app-icon-192.png",          192, RAND),
    ("app-icon-512.png",          512, RAND),
    ("app-icon-maskable-512.png", 512, RAND_MASKIERBAR),
    ("apple-touch-icon.png",      180, RAND),
    ("favicon-source.png",        540, RAND),
    ("favicon-32.png",             32, RAND),
    ("favicon-16.png",             16, RAND),
]


def zeichen(kante, rand):
    """Das Zeichen in Zeichenfarbe, auf Grund, mit Rand — ein Quadrat."""
    m = Image.open(VORLAGE).convert("RGBA")
    # Die Vorlage ist ein weisses Zeichen auf durchsichtigem Grund. Gefaerbt
    # wird ueber die Deckmaske, nicht ueber die Farbkanaele: so bleiben die
    # weichen Kanten erhalten, und die Farbe ist exakt die gewollte.
    innen = round(kante * (1 - 2 * rand))
    b, h = m.size
    f = innen / max(b, h)
    m = m.resize((max(1, round(b * f)), max(1, round(h * f))), Image.LANCZOS)

    flaeche = Image.new("RGB", (kante, kante), GRUND)
    farbe = Image.new("RGB", m.size, ZEICHEN)
    flaeche.paste(farbe, ((kante - m.size[0]) // 2, (kante - m.size[1]) // 2),
                  m.getchannel("A"))
    return flaeche


def main():
    if not os.path.exists(VORLAGE):
        sys.exit(f"Vorlage fehlt: {VORLAGE}")
    for datei, kante, rand in SYMBOLE:
        bild = zeichen(kante, rand)
        p = os.path.join(LOGO, datei)
        bild.save(p, format="PNG", optimize=True)
        print(f"{datei:30s} {kante:>3} px   Rand {rand:.0%}   "
              f"{os.path.getsize(p) // 1024} KB")

    # favicon.ico traegt beide kleinen Groessen in einer Datei — aeltere
    # Browser holen sie ueber /favicon.ico, ohne im Markup nachzusehen.
    ico = os.path.join(LOGO, "favicon.ico")
    zeichen(64, RAND).save(ico, format="ICO",
                           sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"{'favicon.ico':30s} 16/32/48 px          "
          f"{os.path.getsize(ico) // 1024} KB")


if __name__ == "__main__":
    main()
