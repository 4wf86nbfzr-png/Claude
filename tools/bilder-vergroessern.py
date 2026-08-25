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

Drei Stufen, nicht zwei: neben jede WebP-Datei kommt dieselbe Aufnahme als
AVIF. Der Browser nimmt, was er kann — AVIF, sonst WebP, sonst das JPEG in
Ausgangsgroesse. Die JPEG-Ebene bleibt: ein JPEG dieser Kantenlaenge waere
943 KB gegen 405 KB, wird aber nur von Browsern geholt, die kein WebP
koennen (unter 3 %).

Warum AVIF dazukommt — beides gemessen, beides gegen dieselbe Vorlage:

  * **Kleiner bei gleicher Guete.** AVIF q55 liegt beim Rauschabstand
    gleichauf oder darueber und braucht 12 bis 29 % weniger Platz.

        sicherheit   WebP q76   94 K / 40,92 dB     AVIF q55   83 K / 42,28 dB
        gastro       WebP q76  170 K / 37,56 dB     AVIF q55  136 K / 37,81 dB
        logistik-det WebP q76  166 K / 36,62 dB     AVIF q55  118 K / 36,98 dB

  * **Und schneller zu dekodieren**, was hier mehr zaehlt als die Bytes.
    Das war der Einwand, der zuerst dagegen sprach: die Buehnen auf
    dienstleistungen.html haben schon einmal geruckelt, und ein Format,
    das der Rechner muehsamer auspackt, waere genau dort falsch. Gemessen
    ueber createImageBitmap() aus einem Blob im Speicher, 2560 px, Median
    aus neun Laeufen:

        sicherheit-gross   WebP 71,3 ms    AVIF 60,1 ms     -16 %
        gastro-gross       WebP 75,7 ms    AVIF 63,4 ms     -16 %
        logistik-gross     WebP 93,1 ms    AVIF 63,2 ms     -32 %

    Chromium packt AVIF mit dav1d aus, und das ist auf breite Bilder besser
    abgestimmt als der WebP-Dekoder.

Die Falle beim Erzeugen: **AVIF wird aus dem JPEG gerechnet, nie aus dem
WebP.** Aus dem WebP heraus kodiert man dessen Artefakte mit und kommt bei
gleicher Guete nur noch auf 2 % Ersparnis statt auf 14 %. Deshalb geht
jede Stufe von derselben Vorlage aus.

Kein AVIF bekommen zwei Sorten: `og-bild` (das Vorschaubild fuer soziale
Netzwerke — dort greifen die Dienste selbst zu und koennen es teils nicht)
und die `…-mini`-Kacheln des Balkens (wenige Kilobyte, da ist nichts zu
holen).
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
    "sicherheit-einsatzleitung": 3254,
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
AVIF_QUALITAET = 55  # gemessen: gleicher oder besserer Rauschabstand als WebP 76
AVIF_TEMPO = 6      # 0 = langsamst/kleinst, 10 = schnellst. 6 kostet rund 1,2 s
UNSCHARF = (1.6, 52, 3)   # Radius, Staerke in Prozent, Schwelle

# Diese beiden bekommen bewusst kein AVIF (siehe Kopf der Datei).
OHNE_AVIF = ("og-bild",)


def kleiner(avif, webp):
    """Behaelt die AVIF-Datei nur, wenn sie sich lohnt.

    Bei drei Motiven kam AVIF groesser heraus als WebP — es sind die mit
    weichem Verlauf und wenig Kante, und dort ist WebP im Vorteil. Eine
    groessere Datei anzubieten waere das Gegenteil des Zwecks, und niemand
    wuerde es bemerken: der Browser nimmt einfach das erste Format, das er
    kann. Deshalb faellt sie hier weg, und `bilder-einhaengen.py` sucht die
    Datei ohnehin auf der Platte, bevor es sie ins Markup schreibt.
    """
    if os.path.getsize(avif) < os.path.getsize(webp):
        return True
    os.remove(avif)
    return False


def main():
    try:
        from PIL import Image, ImageFilter
    except ImportError:
        sys.exit("Pillow fehlt — bitte 'pip install Pillow' ausfuehren.")

    gesamt = 0
    gesamt_avif = [0]
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
        avif = ""
        if stamm not in OHNE_AVIF:
            # Aus derselben hochgerechneten Vorlage, nicht aus der eben
            # geschriebenen WebP-Datei — sonst kodiert man deren Artefakte mit.
            zielav = os.path.join(IMG, stamm + "-gross.avif")
            gross.save(zielav, "AVIF", quality=AVIF_QUALITAET, speed=AVIF_TEMPO)
            akb = os.path.getsize(zielav) // 1024
            if not kleiner(zielav, ziel):
                avif = "  AVIF groesser — verworfen"
            else:
                gesamt_avif[0] += akb
                avif = f"  AVIF {akb:>5} KB ({akb/kb-1:+.0%})"
        rest = BEDARF[stamm] / zb
        print(f"  {stamm:20s} {b:>5} x {h:<5} -> {zb:>5} x {zh:<5} {kb:>5} KB"
              f"   Browser rechnet noch {rest:.2f}x{avif}")

    print(f"\n{len(BEDARF)} grosse Stufen, zusammen {gesamt/1024:.1f} MB WebP"
          f" und {gesamt_avif[0]/1024:.1f} MB AVIF.")

    # --- Grundstufe: AVIF neben jedes vorhandene WebP ---------------------
    # Die Grundstufe selbst wird hier nicht erzeugt (die WebP-Dateien liegen
    # vor); es kommt nur die AVIF-Fassung dazu, und zwar wieder aus dem JPEG.
    print("\nGrundstufe:")
    n = kb_w = kb_a = 0
    for datei in sorted(os.listdir(IMG)):
        if not datei.endswith(".webp") or "-gross" in datei or "-mini" in datei:
            continue
        stamm = datei[:-5]
        if stamm in OHNE_AVIF:
            continue
        quelle = os.path.join(IMG, stamm + ".jpg")
        if not os.path.exists(quelle):
            print(f"  {stamm:20s} keine JPEG-Vorlage — uebersprungen")
            continue
        ziel = os.path.join(IMG, stamm + ".avif")
        Image.open(quelle).convert("RGB").save(
            ziel, "AVIF", quality=AVIF_QUALITAET, speed=AVIF_TEMPO)
        w = os.path.getsize(os.path.join(IMG, datei)) // 1024
        a = os.path.getsize(ziel) // 1024
        if not kleiner(ziel, os.path.join(IMG, datei)):
            print(f"  {stamm:20s} WebP {w:>5} KB   AVIF {a:>5} KB   groesser — verworfen")
            continue
        n += 1; kb_w += w; kb_a += a
        print(f"  {stamm:20s} WebP {w:>5} KB   AVIF {a:>5} KB   {a/w-1:+.0%}")

    print(f"\n{n} Grundstufen: {kb_w/1024:.1f} MB WebP -> {kb_a/1024:.1f} MB AVIF"
          f" ({kb_a/kb_w-1:+.0%})")
    print("Die Kandidatenliste im Markup setzt tools/bilder-einhaengen.py.")


if __name__ == "__main__":
    main()
