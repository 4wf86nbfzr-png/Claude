#!/usr/bin/env python3
"""Haengt die grosse Bildstufe (…-gross.webp) in das Markup ein.

    python3 tools/bilder-einhaengen.py [--probe]

Zwei Stellen bekommen sie:

1. **Randlose Fotos** — dort wird aus dem einen `srcset` eine Kandidatenliste
   mit zwei Breiten plus `sizes`. Welche Datei geholt wird, entscheidet dann
   der Browser aus Fensterbreite und Geraetepixelverhaeltnis.

   `sizes` beginnt mit `(max-width:980px) 100vw`. Das ist kein Schoenheits-
   fehler, sondern noetig: am Telefon laeuft die Kamerafahrt nicht (siehe
   „Was am Telefon wegfaellt"), das Foto nimmt also genau die Fensterbreite
   ein und nicht das 1,42-fache. Ohne diese erste Bedingung wuerde ein
   iPhone die 3200-px-Datei holen — fuer eine Darstellung, die 1170 px
   breit ist.

2. **Die Galerie** — die Kacheln bleiben klein und bekommen nichts. Statt-
   dessen erhaelt jede Kachel `data-gross`; die Lightbox zeigt dann die
   grosse Fassung. Die Mechanik dafuer stand schon in `main.js`.

Ohne `--probe` werden die Dateien geschrieben.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets/img")

# Anteil an der Fensterbreite im groessten Zustand — gemessen, siehe
# tools/bilder-vergroessern.py
ANTEIL = {
    "gastro": 142, "sicherheit": 142, "logistik": 142, "reinigung": 142,
    # gastro-detail steht seit der Doppelungspruefung auch als randlose Szene
    # auf der Startseite — dort gilt derselbe Anteil wie fuer die uebrigen
    # fuenf Szenen. Ein etwas zu grosszuegiges `sizes` schadet nicht; ein zu
    # knappes holt die kleine Datei fuer eine grosse Flaeche.
    "promotion-messe": 142, "gastro-detail": 142, "promotion": 135,
    "sicherheit-detail": 135, "logistik-detail": 135, "reinigung-detail": 135,
    "sicherheit-einsatzleitung": 135,
    "fahrservice-door": 133, "team-herm": 125, "halle45": 113,
    "fahrservice-detail": 112, "promotion-team": 112, "reinigung-boden": 112,
}

PICTURE = re.compile(r"<picture\b.*?</picture>", re.S)
QUELLE = re.compile(r'(<source type="image/webp" srcset=")([^"]*?)([\w-]+)\.webp(")')
# Schon eingehaengte Listen: die Breitenangaben werden nachgezogen, wenn
# tools/bilder-vergroessern.py mit anderen Zielgroessen gelaufen ist.
NACHZIEHEN = re.compile(
    r'(srcset=")([^"]*?)([\w-]+)\.webp \d+w, \2\3-gross\.webp \d+w("\s+sizes=")'
    r'\(max-width:980px\) 100vw, \d+vw(")')

# Die Kopfbaender (.subhero__photo) stehen bewusst auf 200vw statt 100vw.
# ---------------------------------------------------------------------------
# `sizes` ist eine Breitenangabe, `object-fit:cover` richtet sich aber nach der
# LAENGEREN relativen Kante. Am Telefon ist das Fenster hochkant, das Foto
# meist quadratisch oder quer: gedeckt wird ueber die HOEHE. Gemessen bei
# 390 x 776 und dreifacher Pixeldichte rechnete der Browser die 1600er Datei
# auf das 1,46- bis 2,27-fache hoch — das Kopfbild war sichtbar weich, obwohl
# `sizes` rechnerisch stimmte.
#
# 200vw laesst ihn dort die grosse Stufe holen (Faktor faellt auf rund 1,36).
# Das gilt NUR fuer das eine Kopfbild je Seite, nicht fuer die sechs Buehnen —
# dort haengt genau die Rasterarbeit dran, die einmal geruckelt hat.
KOPFBAND = re.compile(
    r'(class="(?:subhero__photo|hero__photo)"[^>]*>(?:.|\n){0,700}?</picture>)')
KACHEL = re.compile(r'<a class="gal__item([^"]*)" href="([^"]*?)([\w-]+)\.jpg"(?! data-gross)')


def breiten(stamm):
    """Ausgangsbreite und Breite der grossen Stufe aus den Dateien lesen."""
    from PIL import Image
    klein = Image.open(os.path.join(IMG, stamm + ".jpg")).size[0]
    gross = Image.open(os.path.join(IMG, stamm + "-gross.webp")).size[0]
    return klein, gross


def seiten():
    for ordner, _, dateien in os.walk(ROOT):
        if any(t in ordner for t in ("node_modules", ".git", "netlify")):
            continue
        for d in sorted(dateien):
            if d.endswith(".html"):
                yield os.path.join(ordner, d)


def main():
    probe = "--probe" in sys.argv
    masse = {s: breiten(s) for s in ANTEIL}
    gesamt_quellen = gesamt_kacheln = 0

    for pfad in seiten():
        text = open(pfad, encoding="utf-8").read()
        original = text

        # --- 1) randlose Fotos: Kandidatenliste --------------------------
        # Kacheln der Galerie bleiben aussen vor; sie werden nie gross gezeigt.
        kachelbereiche = [m.span() for m in re.finditer(
            r'<a class="gal__item.*?</a>', text, re.S)]

        def in_kachel(pos):
            return any(a <= pos < b for a, b in kachelbereiche)

        neu, n = [], 0
        rest = 0
        for m in PICTURE.finditer(text):
            neu.append(text[rest:m.start()])
            block = m.group(0)
            if not in_kachel(m.start()):
                def ersetzen(q):
                    nonlocal n
                    stamm = q.group(3)
                    if stamm not in ANTEIL:
                        return q.group(0)
                    pfad_teil, klein, gross = q.group(2), *masse[stamm]
                    n += 1
                    return (f'{q.group(1)}{pfad_teil}{stamm}.webp {klein}w, '
                            f'{pfad_teil}{stamm}-gross.webp {gross}w" '
                            f'sizes="(max-width:980px) 100vw, {ANTEIL[stamm]}vw{q.group(4)}')
                def nachziehen(q):
                    nonlocal n
                    stamm = q.group(3)
                    if stamm not in ANTEIL:
                        return q.group(0)
                    klein, gross = masse[stamm]
                    neu = (f'{q.group(1)}{q.group(2)}{stamm}.webp {klein}w, '
                           f'{q.group(2)}{stamm}-gross.webp {gross}w'
                           f'{q.group(4)}(max-width:980px) 100vw, {ANTEIL[stamm]}vw{q.group(5)}')
                    if neu != q.group(0):
                        n += 1
                    return neu
                block = NACHZIEHEN.sub(nachziehen, block)
                block = QUELLE.sub(ersetzen, block)
            neu.append(block)
            rest = m.end()
        neu.append(text[rest:])
        text = "".join(neu)

        # --- 1b) Kopfbaender wieder auf 200vw setzen ---------------------
        # Der Durchgang oben schreibt ueberall 100vw. Fuer das eine Foto im
        # Kopfband ist das zu wenig (siehe Kommentar bei KOPFBAND).
        def kopfband(m):
            nonlocal n
            neu_block = re.sub(r'sizes="\(max-width:980px\) 100vw, (\d+)vw"',
                               r'sizes="(max-width:980px) 200vw, \1vw"',
                               m.group(1), count=1)
            if neu_block != m.group(1):
                n += 1
            return neu_block
        text = KOPFBAND.sub(kopfband, text)

        # --- 2) Galerie: grosse Fassung fuer die Lightbox ----------------
        def kachel(m):
            stamm = m.group(3)
            if stamm not in ANTEIL or "data-gross" in m.group(0):
                return m.group(0)
            return (f'<a class="gal__item{m.group(1)}" href="{m.group(2)}{stamm}.jpg" '
                    f'data-gross="{m.group(2)}{stamm}-gross.webp"')
        text, k = KACHEL.subn(kachel, text)

        if text != original:
            gesamt_quellen += n
            gesamt_kacheln += k
            print(f"  {os.path.relpath(pfad, ROOT):44s} {n:>2} Foto(s), {k:>2} Kachel(n)")
            if not probe:
                open(pfad, "w", encoding="utf-8").write(text)

    print(f"\n{gesamt_quellen} Kandidatenlisten, {gesamt_kacheln} Kacheln"
          + ("  (nur Probe, nichts geschrieben)" if probe else ""))


if __name__ == "__main__":
    main()
