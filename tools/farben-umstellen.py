#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Jede fest eingetragene Farbe auf die beiden Tokens umstellen
=============================================================

Die gelieferte Fassung ist in Schwarz und Weiss gebaut, und zwar
woertlich: 165 Stellen schreiben `#fff`, `#000000`, `rgba(0,0,0,.84)`
oder `rgba(255,255,255,.12)` direkt in eine Regel. Solange der Grund
schwarz und die Tinte weiss ist, faellt das nicht auf.

Auf Weinrot und Beige ist **jede einzelne davon falsch**: ein schwarzer
Schleier ueber Weinrot liest als Graubraun, eine weisse Haarlinie auf
Beige als kalter Strich. Und es sieht nicht kaputt aus, es sieht nur
billig aus — also genau die Sorte Fehler, die drei Farbwechsel
ueberlebt.

Dieses Skript ersetzt sie durch zwei Tokens:

    rgba(0, 0, 0, .84)        ->  rgb(var(--grund-rgb) / .84)
    rgba(255, 255, 255, .12)  ->  rgb(var(--tinte-rgb) / .12)
    #000000                   ->  var(--ink)
    #fff                      ->  var(--paper)

Danach traegt der naechste Farbwechsel sich selbst — das ist derselbe
Ertrag, den die Rollennamen im Hauptprojekt seit 2026 bringen.

    python3 tools/farben-umstellen.py --stand    # nur zaehlen
    python3 tools/farben-umstellen.py            # umstellen
    python3 tools/farben-umstellen.py --aus      # zurueck auf Literale

ZWEI AUSNAHMEN, und beide sind nachgerechnet:

* `box-shadow` und `text-shadow` behalten ihr Schwarz. Ein Schatten soll
  abdunkeln, nicht einfaerben — ueber einem Grund mit L 0,009 ist
  getoentes Schwarz schlicht heller als der Grund und damit kein
  Schatten mehr. Dieselbe Begruendung steht im Hauptprojekt unter
  „Drei Dinge, die das Stylesheet nicht von selbst erreicht".
* Die Token-Bloecke selbst (`:root`, `.auf-dunkel` …) bleiben stehen:
  dort IST das Literal die Definition. Sie werden von Hand gesetzt.

UND EINE DRITTE, die leicht zu uebersehen ist: `transparent` innerhalb
eines Verlaufs. `transparent` ist rgba(0,0,0,0); der Browser
interpoliert im sRGB-Raum, und der Weg von Weinrot nach durchsichtigem
SCHWARZ fuehrt durch einen schmutzigen Streifen. In einem Verlauf wird
daraus deshalb `rgb(var(--grund-rgb) / 0)`.
"""

import os
import re
import sys

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'redesign'))
DATEIEN = ['assets/css/styles.css', 'assets/css/redesign.css',
           'assets/css/hintergrundfilm.css', 'assets/css/trends.css']

# Zeilen, in denen ein Token DEFINIERT wird, bleiben unberuehrt.
IST_DEFINITION = re.compile(r'^\s*--[a-z0-9-]+\s*:')
# Schatten behalten ihr Schwarz.
IST_SCHATTEN = re.compile(r'\b(box-shadow|text-shadow|filter|drop-shadow)\b')

SCHWARZ = re.compile(r'rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(?:,\s*([0-9.]+)\s*)?\)')
WEISS = re.compile(r'rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,\s*([0-9.]+)\s*)?\)')
HEX_SCHWARZ = re.compile(r'#(?:000000|000)\b')
HEX_WEISS = re.compile(r'#(?:ffffff|fff)\b', re.I)
IN_VERLAUF = re.compile(r'\b(linear-gradient|radial-gradient|conic-gradient)\s*\(')

ZURUECK = [
    (re.compile(r'rgb\(var\(--grund-rgb\)\s*/\s*([0-9.]+)\)'), lambda m: 'rgba(0, 0, 0, %s)' % m.group(1)),
    (re.compile(r'rgb\(var\(--tinte-rgb\)\s*/\s*([0-9.]+)\)'), lambda m: 'rgba(255, 255, 255, %s)' % m.group(1)),
]


def zeile_umstellen(zeile, im_verlauf):
    """Eine Zeile umschreiben. `im_verlauf` sagt, ob die laufende
    Deklaration ein Verlauf ist — nur dort wird `transparent` angefasst."""
    if IST_DEFINITION.match(zeile) or IST_SCHATTEN.search(zeile):
        return zeile, 0

    n = [0]

    def grund(m):
        n[0] += 1
        a = m.group(1)
        return 'var(--ink)' if a is None else 'rgb(var(--grund-rgb) / %s)' % a

    def tinte(m):
        n[0] += 1
        a = m.group(1)
        return 'var(--paper)' if a is None else 'rgb(var(--tinte-rgb) / %s)' % a

    neu = SCHWARZ.sub(grund, zeile)
    neu = WEISS.sub(tinte, neu)
    neu = HEX_SCHWARZ.sub(lambda m: (n.__setitem__(0, n[0] + 1), 'var(--ink)')[1], neu)
    neu = HEX_WEISS.sub(lambda m: (n.__setitem__(0, n[0] + 1), 'var(--paper)')[1], neu)

    if im_verlauf or IN_VERLAUF.search(zeile):
        vorher = neu
        neu = re.sub(r'\btransparent\b', 'rgb(var(--grund-rgb) / 0)', neu)
        if neu != vorher:
            n[0] += 1

    return neu, n[0]


def datei_umstellen(pfad):
    with open(pfad, encoding='utf-8') as f:
        text = f.read()

    raus = []
    summe = 0
    im_verlauf = False
    for zeile in text.split('\n'):
        neu, n = zeile_umstellen(zeile, im_verlauf)
        summe += n
        raus.append(neu)
        # Eine Deklaration laeuft bis zum Semikolon; Verlaeufe stehen hier
        # regelmaessig ueber mehrere Zeilen.
        if IN_VERLAUF.search(zeile):
            im_verlauf = True
        if ';' in zeile:
            im_verlauf = False
    return '\n'.join(raus), summe


def datei_zurueck(pfad):
    with open(pfad, encoding='utf-8') as f:
        text = f.read()
    n = 0
    for muster, ersatz in ZURUECK:
        text, k = muster.subn(ersatz, text)
        n += k
    return text, n


def zaehlen(pfad):
    with open(pfad, encoding='utf-8') as f:
        text = f.read()
    literale = 0
    tokens = len(re.findall(r'rgb\(var\(--(?:grund|tinte)-rgb\)', text))
    im_verlauf = False
    for zeile in text.split('\n'):
        if IST_DEFINITION.match(zeile) or IST_SCHATTEN.search(zeile):
            continue
        literale += len(SCHWARZ.findall(zeile)) + len(WEISS.findall(zeile))
        literale += len(HEX_SCHWARZ.findall(zeile)) + len(HEX_WEISS.findall(zeile))
        if im_verlauf or IN_VERLAUF.search(zeile):
            literale += len(re.findall(r'\btransparent\b', zeile))
        if IN_VERLAUF.search(zeile):
            im_verlauf = True
        if ';' in zeile:
            im_verlauf = False
    return literale, tokens


def main():
    nur_zeigen = '--stand' in sys.argv
    zurueck = '--aus' in sys.argv
    summe = 0

    for rel in DATEIEN:
        pfad = os.path.join(WURZEL, rel)
        if not os.path.exists(pfad):
            print('fehlt: %s' % rel)
            continue

        if nur_zeigen:
            lit, tok = zaehlen(pfad)
            print('%-34s %3d Literale   %3d ueber Tokens' % (rel, lit, tok))
            continue

        neu, n = (datei_zurueck(pfad) if zurueck else datei_umstellen(pfad))
        if n:
            with open(pfad, 'w', encoding='utf-8') as f:
                f.write(neu)
        print('%-34s %3d %s' % (rel, n, 'zurueckgestellt' if zurueck else 'umgestellt'))
        summe += n

    if not nur_zeigen:
        print('\n%d Stelle(n) %s.' % (summe, 'zurueckgestellt' if zurueck else 'umgestellt'))


if __name__ == '__main__':
    main()
