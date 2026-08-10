#!/usr/bin/env python3
"""Rechnet die grossflaechigen Fotos auf die Groesse hoch, die ein Retina-
Bildschirm wirklich anfordert, und legt sie als zweite Stufe daneben.

    python3 tools/bilder-vergroessern.py

Hintergrund: Die Fotos liegen mit 1129 bis 1600 px vor. Gemessen wird auf
einem 1440er MacBook (Geraetepixelverhaeltnis 2) und auf einem 2560er
Monitor; dort fordert ein randloses Foto samt Kamerafahrt zwischen 3226 und
4090 Geraetepixel an. Der Browser rechnet die Differenz selbst hoch — und
zwar bilinear. Das ist der Grund, warum die Bilder am grossen Schirm weich
wirken.

Was dieses Skript macht, ist deshalb keine Zauberei, sondern eine
Arbeitsteilung: das Hochrechnen passiert einmal hier mit Lanczos und einer
gemessenen Nachschaerfung statt bei jedem Aufruf im Browser mit dem
einfachsten Filter, den es gibt. Gemessen am mittleren Gradientenbetrag
bringt das rund 30 % mehr Kantenschaerfe (2,80 -> 3,65).

  Browser (bilinear)         2,80
  Lanczos                    3,29
  Lanczos + Unsharp mild     3,65   <- so wird es gemacht
  Lanczos + Unsharp kraeftig 4,52   <- Halos an harten Kanten, verworfen

Echte Bilddetails entstehen dabei nicht. Wirklich hochaufloesend wird die
Seite erst mit Material in 2400 px, so wie es docs/foto-briefing.md
verlangt. Bis dahin ist das hier die bestmoegliche Darstellung des
vorhandenen Materials.

Nur WebP: Die Rueckfallebene bleibt die vorhandene JPEG-Datei in
Ausgangsgroesse. Ein JPEG dieser Kantenlaenge waere 943 KB gegen 405 KB —
und wuerde nur von Browsern geholt, die kein WebP koennen (unter 3 %).
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets/img")

# Gemessen mit scratchpad/deckung.js: Datei -> Geraetepixel, die ein Schreib-
# tisch-Bildschirm in der Breite anfordert. Entscheidend ist dabei nicht die
# Kastenbreite, sondern `object-fit:cover`: ein quadratisches Foto in einem
# hohen Kasten wird ueber die *laengere* relative Kante gedeckt und dabei
# seitlich beschnitten. Deshalb fordert ein 1440er Fenster bis zu 4090 px.
# Nur Bilder ueber 1,3-fach stehen hier — alles andere ist scharf genug.
BEDARF = {
    "gastro":             4090,
    "sicherheit":         4090,
    "logistik":           4090,
    "reinigung":          4090,
    "promotion-messe":    4090,
    "gastro-detail":      3875,
    "promotion":          3875,
    "sicherheit-detail":  3875,
    "logistik-detail":    3875,
    "reinigung-detail":   3875,
    "fahrservice-door":   3834,
    "team-herm":          3593,
    "reinigung-boden":    3325,
    "promotion-team":     3328,
    "halle45":            3254,
    "fahrservice-detail": 3226,
}

HOECHST = 3         # mehr als das Dreifache bringt nichts — es ist kein Detail da
# Deckel fuer die Kantenlaenge. Nicht die Dateigroesse ist der Grund, sondern
# das Rastern: die Buehnen auf dienstleistungen.html halten zwei bildschirm-
# fuellende Fotos gleichzeitig als eigene Ebene. Gemessen ueber eine ganze
# Durchfahrt (Tracing, Summe aus Stil, Layout, Malen, Rastern):
#     Quellen mit 1600 px      1175 ms
#     Quellen bis 3464 px      1830 ms   <- ruckelt sichtbar
#     Quellen bis MAXKANTE     siehe unten
KANTE = int(os.environ.get("MAXKANTE", "2560"))
MEGAPIXEL = 7       # Deckel fuer hochkantige Motive
QUALITAET = 76      # gemessen: 405 KB bei 40,2 dB gegen die Vorlage
UNSCHARF = (1.6, 52, 3)   # Radius, Staerke in Prozent, Schwelle


def main():
    try:
        from PIL import Image, ImageFilter
    except ImportError:
        sys.exit("Pillow fehlt — bitte 'pip install Pillow' ausfuehren.")

    gesamt = 0
    for stamm in sorted(BEDARF):
        quelle = os.path.join(IMG, stamm + ".jpg")
        if not os.path.exists(quelle):
            print("  fehlt:", stamm + ".jpg")
            continue
        ziel = os.path.join(IMG, stamm + "-gross.webp")

        im = Image.open(quelle).convert("RGB")
        b, h = im.size
        faktor = min(BEDARF[stamm] / b, HOECHST, KANTE / max(b, h))
        # Deckel ueber die Gesamtflaeche, damit einzelne Dateien nicht ausufern
        if b * h * faktor * faktor > MEGAPIXEL * 1e6:
            faktor = (MEGAPIXEL * 1e6 / (b * h)) ** 0.5
        zb, zh = round(b * faktor), round(h * faktor)

        gross = im.resize((zb, zh), Image.LANCZOS)
        gross = gross.filter(ImageFilter.UnsharpMask(
            radius=UNSCHARF[0], percent=UNSCHARF[1], threshold=UNSCHARF[2]))
        gross.save(ziel, "WEBP", quality=QUALITAET, method=6)

        kb = os.path.getsize(ziel) // 1024
        gesamt += kb
        rest = BEDARF[stamm] / zb
        print(f"  {stamm:20s} {b:>5} x {h:<5} -> {zb:>5} x {zh:<5} {kb:>5} KB"
              f"   Browser rechnet noch {rest:.2f}x")

    print(f"\n{len(BEDARF)} Dateien, zusammen {gesamt/1024:.1f} MB.")
    print("Die Kandidatenliste im Markup setzt tools/bilder-einhaengen.py.")


if __name__ == "__main__":
    main()
