#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baut die randlosen Motive der Startseite aus ihren Vorlagen.

Warum ein eigenes Werkzeug neben `bilder-vergroessern.py`: das dort ist auf
den Bestand ausgelegt, der als fertige 1600er WebP-Datei vorliegt und nur
noch eine zweite Stufe braucht. Die Motive der Startseite kommen dagegen
als einzelne Aufnahmen herein und werden von der Vorlage bis zu allen
Ausgabestufen an einer Stelle gerechnet.

**Die Vorlagen liegen im Repository**, unter `assets/quellen/`. Das ist
nicht bequem, sondern notwendig: ohne sie laesst sich keine Stufe neu
rechnen, und eine Stufe aus einer schon hochgerechneten Datei zu rechnen
kodiert deren Artefakte mit (siehe „AVIF wird aus dem JPEG gerechnet, nie
aus dem WebP"). `paket-bauen.sh` laesst den Ordner aus — auf dem Webserver
hat er nichts zu suchen.

Wie viele Stufen ein Motiv bekommt, haengt an seiner Vorlage, und das ist
nachgemessen, nicht geschaetzt. Gemessen wird dabei nicht die Datei,
sondern die **Darstellung**: bildfuellend auf einem 1440er Schirm mit
doppelter Pixeldichte, also 2880 Geraetepixel, Kantenschaerfe der
Bildmitte.

    Vorlage 640 x 480 (0,31 MP), Kopfbild bis September:
        1600 px   4,47      <- so
        2560 px   4,40
        3840 px   4,06
    Mehr Pixel war dort MESSBAR schlechter: die 1600er wird fuer 1600
    geschaerft und hochgerechnet, die 3840er bei 3840 geschaerft und
    danach wieder heruntergerechnet — das mittelt die Schaerfung weg.

    Vorlage 1672 x 941 (1,57 MP), das jetzige Kopfbild:
        1600 px   8,18
        1672 px   8,43      (native Groesse)
        2200 px   8,88
        2560 px   9,00      <- so
    Hier rechnet der Browser in JEDEM Fall hoch (Ziel 2880), die Schaerfung
    ueberlebt also. Deshalb lohnt die zweite Stufe, und der Deckel liegt
    wie ueberall bei 2560 (siehe „Die Obergrenze kommt nicht von der
    Dateigroesse, sondern vom Rastern").

Die Nachschaerfung steht auf 85 %, und auch das ist gemessen:

        52 %   4,44        110 %   4,77
        85 %   5,02        140 %   4,50

Darueber frisst die Wiedervergroesserung mehr weg, als die staerkere
Schaerfung einbringt.
"""
import os
import sys

try:
    from PIL import Image, ImageFilter, ImageOps
except ImportError:
    sys.exit("Pillow fehlt — bitte 'pip install Pillow' ausfuehren.")

HIER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUELLEN = os.path.join(HIER, "assets", "quellen")
IMG = os.path.join(HIER, "assets", "img")

# Dieselben Werte wie in bilder-vergroessern.py.
GRUND = 1600
GROSS = 2560
JPEG_GUETE, WEBP_GUETE, AVIF_GUETE, AVIF_TEMPO = 82, 76, 55, 6
UNSCHARF = (1.6, 85, 2)

# Ab welcher Vorlagenbreite sich die zweite Stufe lohnt. Darunter waere sie
# eine Vervierfachung der Kantenlaenge ohne ein einziges zusaetzliches
# Bilddetail — und nachgemessen sogar schlechter (siehe oben).
LOHNT_GROSS = 1400

MOTIVE = [
    # Vorlage in assets/quellen/, Stamm unter assets/img/
    ("bankett.jpg",   "bankett"),
    ("bar-gruen.jpg", "bar-gruen"),
]


def stufe(im, kante):
    """Eine Ausgabestufe: auf Kantenlaenge rechnen und einmal nachschaerfen."""
    b, h = im.size
    f = kante / max(b, h)
    return im.resize((round(b * f), round(h * f)), Image.LANCZOS).filter(
        ImageFilter.UnsharpMask(radius=UNSCHARF[0], percent=UNSCHARF[1],
                                threshold=UNSCHARF[2]))


def schreiben(bild, stamm, mit_jpeg):
    """WebP und AVIF, dazu auf Wunsch die JPEG-Rueckfallebene."""
    wege = {}
    formate = [("webp", dict(format="WEBP", quality=WEBP_GUETE, method=6)),
               ("avif", dict(format="AVIF", quality=AVIF_GUETE, speed=AVIF_TEMPO))]
    if mit_jpeg:
        formate.insert(0, ("jpg", dict(format="JPEG", quality=JPEG_GUETE,
                                       optimize=True, progressive=True)))
    for endung, kwargs in formate:
        p = os.path.join(IMG, f"{stamm}.{endung}")
        bild.save(p, **kwargs)
        wege[endung] = os.path.getsize(p)

    # Eine AVIF-Datei, die groesser ist als die WebP daneben, waere das
    # Gegenteil des Zwecks — der Browser nimmt sie trotzdem, weil sie im
    # <picture> zuerst steht. Dieselbe Regel wie in bilder-vergroessern.py.
    if wege["avif"] >= wege["webp"]:
        os.remove(os.path.join(IMG, stamm + ".avif"))
        wege.pop("avif")
        print(f"{'':16s} AVIF groesser als WebP — verworfen")
    return wege


def main():
    if not os.path.isdir(QUELLEN):
        sys.exit(f"Ordner fehlt: {QUELLEN}")
    for datei, stamm in MOTIVE:
        pfad = os.path.join(QUELLEN, datei)
        if not os.path.exists(pfad):
            print(f"  fehlt: assets/quellen/{datei}")
            continue
        im = ImageOps.exif_transpose(Image.open(pfad)).convert("RGB")
        b, h = im.size

        wege = schreiben(stufe(im, GRUND), stamm, mit_jpeg=True)
        zeile = "  ".join(f"{e} {g // 1024} KB" for e, g in wege.items())
        print(f"{stamm:14s} Vorlage {b:>5} x {h:<5} ({b * h / 1e6:.2f} MP)"
              f"  ->  {GRUND} px   {zeile}")

        if max(b, h) >= LOHNT_GROSS:
            wege2 = schreiben(stufe(im, GROSS), stamm + "-gross", mit_jpeg=False)
            zeile2 = "  ".join(f"{e} {g // 1024} KB" for e, g in wege2.items())
            print(f"{'':14s} zweite Stufe  ->  {GROSS} px   {zeile2}")
        else:
            print(f"{'':14s} keine zweite Stufe: die Vorlage traegt sie nicht"
                  f" (unter {LOHNT_GROSS} px, nachgemessen schlechter)")


if __name__ == "__main__":
    main()
