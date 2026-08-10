#!/usr/bin/env python3
"""Ersetzt Gedankenstriche im sichtbaren Text durch Kommas.

    python3 tools/striche-ersetzen.py [--probe]

Der Auftrag lautete, die Striche von der Website zu nehmen. Der Weg dahin
ist ausdruecklich **nicht**, Saetze umzuschreiben: es aendert sich kein
einziges Wort, nur das Zeichen dazwischen.

    vorher   Sagen Sie uns Datum und Ort — den Rest klaeren wir im Gespraech.
    nachher  Sagen Sie uns Datum und Ort, den Rest klaeren wir im Gespraech.

Was **nicht** angefasst wird, weil es Rechtschreibung ist und keine Zierde:

  * Bereichsangaben:      Gertigstrasse 12–14, Mo–Fr, 8–18 Uhr
  * Bindestriche in Woertern: Gastro-Personal, Auf- und Abbau
  * `<title>` und `<meta>`: stehen im Reiter des Browsers, nicht auf der
    Seite. Dort ist „Seite – Website" die uebliche Schreibweise.

Sonderfaelle stehen unten in AUSNAHMEN — dort, wo ein Komma falsch waere.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Stellen, an denen ein Komma nicht passt.
AUSNAHMEN = {
    # Vor einem Link stand ein Strich ins Leere.
    "Über neue Bilder freuen wir uns &mdash;": "Über neue Bilder freuen wir uns:",
    # Ein Absatz, der mit einem Strich beginnt.
    "&mdash; dort liest die ganze Disposition mit.":
        "Dort liest die ganze Disposition mit.",
    # Auswahlfeld: „Egal – sag mir, wo Bedarf ist"
    "Egal &ndash; sag mir, wo Bedarf ist": "Egal, sag mir wo Bedarf ist",
    # Der Name der Marke im Vorlesewerkzeug.
    'aria-label="HERM Service Team &ndash; Startseite"':
        'aria-label="HERM Service Team, Startseite"',
    'aria-label="HERM Service Team – Startseite"':
        'aria-label="HERM Service Team, Startseite"',
    # Einschub mitten im Satz: beide Striche weg, sonst haengt ein Komma.
    "Wo Erfahrung nötig ist &mdash; etwa hinter der Bar oder im Sicherheitsbereich &mdash;":
        "Wo Erfahrung nötig ist, etwa hinter der Bar oder im Sicherheitsbereich,",
    # Aufzaehlungen: hier fuehrt der Strich etwas ein, das ist ein Doppelpunkt.
    "Aufnahmen von Einsätzen &mdash; Service, Sicherheit, Messe, Aufbau.":
        "Aufnahmen von Einsätzen: Service, Sicherheit, Messe, Aufbau.",
    "Tor auf, Saal fertig &mdash; Halle 45":
        "Tor auf, Saal fertig. Halle 45",
    "Jeder Einsatz, jeder Bereich &mdash; derselbe Standard.":
        "Jeder Einsatz, jeder Bereich: derselbe Standard.",
    "Datum, Ort, wie viele Leute und welcher Bereich &mdash; mehr brauchen wir":
        "Datum, Ort, wie viele Leute und welcher Bereich: mehr brauchen wir",
}

# Ein Strich mit Leerzeichen davor und dahinter, in beiden Schreibweisen.
STRICH = re.compile(r"(?:&nbsp;|\s)(?:&mdash;|&ndash;|—|–)(?:&nbsp;|\s)")
# Bereichsangaben: Ziffer/Wochentag direkt am Strich, ohne Leerzeichen
BEREICH = re.compile(r"[\w](?:&mdash;|&ndash;|—|–)[\w]")

# Bereiche, die nicht angefasst werden
SCHUTZ = re.compile(
    r"<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->|"
    r"<title>.*?</title>|<meta\b[^>]*>|<link\b[^>]*>",
    re.S)


def bearbeiten(text):
    treffer = []
    # Schutzbereiche herausnehmen und durch Platzhalter ersetzen
    stuecke, marken = [], []
    rest = 0
    for m in SCHUTZ.finditer(text):
        stuecke.append(text[rest:m.start()])
        marken.append(m.group(0))
        stuecke.append(f"\x00{len(marken)-1}\x00")
        rest = m.end()
    stuecke.append(text[rest:])
    arbeit = "".join(stuecke)

    for alt, neu in AUSNAHMEN.items():
        if alt in arbeit:
            arbeit = arbeit.replace(alt, neu)
            treffer.append((alt, neu))

    def ersetzen(m):
        # Steht hinter dem Strich „und" oder „oder", faellt er ersatzlos weg —
        # ein Komma davor waere falsch („Hamburg, und deutschlandweit").
        rest = arbeit[m.end():m.end() + 6].lower()
        if rest.startswith(("und ", "oder ")):
            treffer.append((m.group(0).strip(), ""))
            return " "
        treffer.append((m.group(0).strip(), ","))
        return ", "

    # Attribute (alt=, aria-label=, placeholder=, content=) mitnehmen: sie
    # werden vorgelesen. Nur Bereichsangaben bleiben verschont.
    arbeit = STRICH.sub(ersetzen, arbeit)
    # doppelte Satzzeichen glaetten, die dabei entstehen koennen
    arbeit = re.sub(r",\s*,", ",", arbeit)
    arbeit = re.sub(r"([,:;])\s*,", r"\1", arbeit)
    arbeit = re.sub(r"\s+,", ",", arbeit)

    for i, m in enumerate(marken):
        arbeit = arbeit.replace(f"\x00{i}\x00", m)
    return arbeit, treffer


def main():
    probe = "--probe" in sys.argv
    dateien = sorted(glob.glob(os.path.join(ROOT, "*.html")) +
                     glob.glob(os.path.join(ROOT, "dienstleistungen/*.html")))
    gesamt = 0
    for pfad in dateien:
        text = open(pfad, encoding="utf-8").read()
        neu, treffer = bearbeiten(text)
        if not treffer:
            continue
        gesamt += len(treffer)
        print(f"  {os.path.relpath(pfad, ROOT):42s} {len(treffer):>3} Stelle(n)")
        if not probe:
            open(pfad, "w", encoding="utf-8").write(neu)
    print(f"\n{gesamt} Striche ersetzt" + ("  (nur Probe)" if probe else ""))


if __name__ == "__main__":
    main()
