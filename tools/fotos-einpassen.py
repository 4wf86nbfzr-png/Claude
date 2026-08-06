#!/usr/bin/env python3
"""Passt gelieferte Fotos für die Zoom-Bühnen der Startseite ein.

    python3 tools/fotos-einpassen.py <ordner-mit-fotos>

Zuordnung über den Dateinamen: eine Datei, die "fahrservice" enthält, wird zu
assets/img/fahrservice.jpg; enthält sie zusätzlich "detail", "nah" oder "innen",
wird sie zur Nahaufnahme fahrservice-detail.jpg.

Was das Skript macht:
  * quadratisch zuschneiden — die Bühne zeigt einen 1:1-Rahmen
  * dabei auf den Zoom-Punkt ausrichten (50 % / 46 %), nicht auf die Bildmitte
  * auf 2400 px bringen (die Bühne vergrößert bis 2,7-fach)
  * als JPEG q85 in sRGB nach assets/img/ schreiben

Bildausschnitt korrigieren, wenn das Motiv nicht mittig sitzt:

    python3 tools/fotos-einpassen.py fotos/ --fokus fahrservice=0.62,0.40

Der erste Wert ist waagerecht, der zweite senkrecht, jeweils 0..1.
Benötigt Pillow:  pip install Pillow
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets/img")

BEREICHE = ["gastro", "sicherheit", "promotion", "logistik", "fahrservice", "reinigung"]
NAH = ("detail", "nah", "innen", "close")
KANTE = 2400
QUALITAET = 85

# Zoom-Zentrum der Bühne (transform-origin 50% 46%) — dorthin fährt die Kamera,
# also muss dieser Punkt beim Zuschnitt erhalten bleiben.
FOKUS_STANDARD = (0.50, 0.46)


def ziel_fuer(dateiname):
    stamm = os.path.splitext(os.path.basename(dateiname))[0].lower()
    for b in BEREICHE:
        if b in stamm:
            return b + ("-detail" if any(k in stamm for k in NAH) else "")
    return None


def quadrat(img, fokus):
    """Auf 1:1 beschneiden, den Fokuspunkt so weit wie möglich halten."""
    b, h = img.size
    kante = min(b, h)
    fx, fy = fokus
    links = int(round(b * fx - kante / 2))
    oben = int(round(h * fy - kante / 2))
    links = max(0, min(links, b - kante))      # nicht über den Rand hinaus
    oben = max(0, min(oben, h - kante))
    return img.crop((links, oben, links + kante, oben + kante))


def main():
    args = [a for a in sys.argv[1:]]
    fokus_map = {}
    quelle = None
    for a in args:
        if a.startswith("--fokus"):
            for teil in a.split("=", 1)[1].split(";"):
                name, _, werte = teil.partition("=")
                if werte:
                    x, y = werte.split(",")
                    fokus_map[name.strip()] = (float(x), float(y))
        elif not a.startswith("-"):
            quelle = a
    if not quelle:
        sys.exit(__doc__)
    if not os.path.isdir(quelle):
        sys.exit("Ordner nicht gefunden: " + quelle)

    try:
        from PIL import Image, ImageOps
    except ImportError:
        sys.exit("Pillow fehlt — bitte 'pip install Pillow' ausführen.")

    os.makedirs(OUT, exist_ok=True)
    getroffen, offen = [], []

    for name in sorted(os.listdir(quelle)):
        pfad = os.path.join(quelle, name)
        if not os.path.isfile(pfad):
            continue
        ziel = ziel_fuer(name)
        if not ziel:
            offen.append(name)
            continue

        img = Image.open(pfad)
        img = ImageOps.exif_transpose(img)        # Drehung aus den EXIF-Daten
        img = img.convert("RGB")
        vorher = img.size

        fokus = fokus_map.get(ziel, fokus_map.get(ziel.split("-")[0], FOKUS_STANDARD))
        img = quadrat(img, fokus)
        # Nur warnen, wo es wirklich sichtbar wird: unter 1600 px wird der
        # 2,7-fache Zoom weich, dazwischen wird lediglich hochgerechnet.
        if img.width < 1600:
            warnung = "  ACHTUNG: nur %d px — im Zoom sichtbar weich" % img.width
        elif img.width < KANTE:
            warnung = "  (%d px, wird auf %d hochgerechnet)" % (img.width, KANTE)
        else:
            warnung = ""
        img = img.resize((KANTE, KANTE), Image.LANCZOS)
        ziel_pfad = os.path.join(OUT, ziel + ".jpg")
        img.save(ziel_pfad, "JPEG", quality=QUALITAET, optimize=True, subsampling=1)
        getroffen.append(ziel)
        print("%-24s <- %s  (%dx%d)%s" % (ziel + ".jpg", name, *vorher, warnung))

    print()
    if offen:
        print("Nicht zugeordnet (Dateiname muss den Bereich enthalten):")
        for n in offen:
            print("   ", n)
    fehlend = [b + s for b in BEREICHE for s in ("", "-detail")
               if b + s not in getroffen and
               not os.path.exists(os.path.join(OUT, b + s + ".jpg"))]
    print("Fehlt noch:", ", ".join(fehlend) if fehlend else "nichts — alle zwölf sind da")


main()
