"""
Erzeugt die Bewegtbild-Fassung des Startbildes.

Ablauf: Das Foto fährt langsam heran, gegen Ende legt sich ein weicher
dunkler Verlauf darüber und das Logo blendet auf. Am Ende steht das
Standbild, das auch als Poster dient -- wer "Bewegung reduzieren"
eingeschaltet hat, sieht genau dieses Bild, ohne etwas zu verpassen.

Schreibt JPEG-Einzelbilder auf die Standardausgabe; das Zusammensetzen
übernimmt tools/startbild-animation.mjs mit ffmpeg.

Braucht: Pillow
"""

import sys
from PIL import Image

BREITE, HOEHE = 900, 600
BILDER_PRO_SEKUNDE = 12
DAUER = 7.0
ZOOM_START, ZOOM_ENDE = 1.14, 1.0
LOGO_START, LOGO_VOLL = 0.55, 0.86  # Anteil der Laufzeit

FOTO = "assets/bilder/gemeinsam-tanzen.jpg"
LOGO = "assets/logo/helpmate.png"


def weich(t: float) -> float:
    """Ruhige Kurve ohne Ruck am Anfang und Ende."""
    return t * t * (3 - 2 * t)


def einzelbild(foto: Image.Image, logo: Image.Image, fortschritt: float) -> Image.Image:
    zoom = ZOOM_START + (ZOOM_ENDE - ZOOM_START) * weich(fortschritt)
    breite = round(BREITE * zoom)
    hoehe = round(HOEHE * zoom)
    gezoomt = foto.resize((breite, hoehe), Image.LANCZOS)
    links = (breite - BREITE) // 2
    oben = (hoehe - HOEHE) // 2
    bild = gezoomt.crop((links, oben, links + BREITE, oben + HOEHE)).convert("RGBA")

    if fortschritt >= LOGO_START:
        anteil = min(1.0, (fortschritt - LOGO_START) / (LOGO_VOLL - LOGO_START))
        deckung = weich(anteil)

        # Heller Verlauf von unten. Die Wortmarke ist navy und türkis --
        # auf dunklem Grund würde sie verschwinden.
        schleier = Image.new("RGBA", (BREITE, HOEHE), (255, 255, 255, 0))
        pixel = schleier.load()
        for y in range(HOEHE):
            anteil_y = max(0.0, (y - HOEHE * 0.30) / (HOEHE * 0.70))
            alpha = int(242 * (anteil_y**1.5) * deckung)
            for x in range(BREITE):
                pixel[x, y] = (255, 255, 255, alpha)
        bild = Image.alpha_composite(bild, schleier)

        logo_breite = round(BREITE * 0.58)
        logo_hoehe = round(logo.height * logo_breite / logo.width)
        skaliert = logo.resize((logo_breite, logo_hoehe), Image.LANCZOS)
        # Das Logo steigt beim Auftauchen ein Stück auf.
        versatz = round(18 * (1 - deckung))
        ebene = Image.new("RGBA", (BREITE, HOEHE), (0, 0, 0, 0))
        ebene.paste(
            skaliert,
            ((BREITE - logo_breite) // 2, round(HOEHE * 0.70) + versatz),
            skaliert,
        )
        if deckung < 1:
            alpha = ebene.split()[-1].point(lambda a: int(a * deckung))
            ebene.putalpha(alpha)
        bild = Image.alpha_composite(bild, ebene)

    return bild.convert("RGB")


def main() -> None:
    foto = Image.open(FOTO).convert("RGB")
    # Foto auf die Zielgröße bringen, mit Reserve für den Zoom.
    reserve = round(BREITE * ZOOM_START), round(HOEHE * ZOOM_START)
    foto = foto.resize(reserve, Image.LANCZOS)
    foto = foto.resize((BREITE, HOEHE), Image.LANCZOS)
    logo = Image.open(LOGO).convert("RGBA")

    anzahl = round(DAUER * BILDER_PRO_SEKUNDE)
    nur_poster = "--poster" in sys.argv

    if nur_poster:
        einzelbild(foto, logo, 1.0).save(sys.argv[sys.argv.index("--poster") + 1], "JPEG", quality=86)
        print("Poster geschrieben", file=sys.stderr)
        return

    for i in range(anzahl):
        einzelbild(foto, logo, i / (anzahl - 1)).save(sys.stdout.buffer, "JPEG", quality=82)
    # Am Ende zwei Sekunden stehen lassen.
    letztes = einzelbild(foto, logo, 1.0)
    for _ in range(BILDER_PRO_SEKUNDE * 2):
        letztes.save(sys.stdout.buffer, "JPEG", quality=82)
    sys.stdout.buffer.flush()
    print(f"{anzahl + BILDER_PRO_SEKUNDE * 2} Einzelbilder", file=sys.stderr)


if __name__ == "__main__":
    main()
