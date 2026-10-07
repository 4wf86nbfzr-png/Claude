#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Stylesheet und Skript der sieben Zusaetze in alle Seiten einhaengen
===================================================================

`trends.css` und `trends.js` bringen 3D, die Sprungpalette, das
Laufband, den schaltbaren Dunkelmodus, den Neumorphismus und die
Collage. Beide muessen auf jeder Seite stehen — sechzehn Dateien, und
von Hand gesetzt fehlt die eine beim naechsten neuen Abschnitt.

Mehrfach ausfuehrbar: ein zweiter Lauf meldet null Aenderungen.

    python3 tools/trends-einhaengen.py            # einhaengen
    python3 tools/trends-einhaengen.py --stand    # nur zeigen
    python3 tools/trends-einhaengen.py --aus      # wieder herausnehmen

WO DIE BEIDEN HINGEHOEREN, und warum genau dorthin:

* Das Stylesheet steht ALS LETZTES, direkt nach `ohne-striche.css`.
  Mehrere seiner Regeln gewinnen nur durch die Reihenfolge — die
  Neigung der Kacheln etwa hat dieselbe Spezifitaet wie das
  `transform:none` der Aufblende und gilt deshalb nur, solange sie
  spaeter steht. Weiter oben eingehaengt waere der halbe Zusatz
  wirkungslos, ohne dass irgendetwas kaputt aussieht.
* Das Skript steht ALS LETZTES vor `</body>`. Es baut Werkzeugleiste,
  Palette und Kapitelrail und liest dafuer Dinge, die `main.js` erst
  anlegt.
"""

import os
import re
import sys

WURZEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'redesign')
WURZEL = os.path.normpath(WURZEL)

ANKER_CSS = re.compile(r'([ \t]*)<link rel="stylesheet" href="([^"]*)assets/css/ohne-striche\.css">')
ZEILE_CSS = ('<link rel="stylesheet" href="{p}assets/css/trends.css">\n'
             '{e}<link rel="stylesheet" href="{p}assets/css/farben.css">')
ZEILE_JS = '<script src="{p}assets/js/trends.js"></script>'

KOMMENTAR = (
    '<!-- Die beiden letzten Stylesheets, und die Reihenfolge ist die ganze\n'
    '     Wirkung: `trends.css` bringt die Effekte, `farben.css` danach die\n'
    '     Palette (Beige und Weinrot), das Farbfeld und die weichen Kanten.\n'
    '     Mehrere Regeln darin gewinnen allein dadurch, dass sie spaeter\n'
    '     stehen. Herausnehmen mit\n'
    '     python3 tools/trends-einhaengen.py --aus -->'
)


def seiten():
    raus = []
    for name in sorted(os.listdir(WURZEL)):
        if name.endswith('.html'):
            raus.append(os.path.join(WURZEL, name))
    unter = os.path.join(WURZEL, 'dienstleistungen')
    if os.path.isdir(unter):
        for name in sorted(os.listdir(unter)):
            if name.endswith('.html'):
                raus.append(os.path.join(unter, name))
    return raus


def einhaengen(text):
    """Gibt (neuer Text, Zahl der Aenderungen) zurueck."""
    geaendert = 0

    treffer = ANKER_CSS.search(text)
    if not treffer:
        raise SystemExit('Anker `ohne-striche.css` fehlt — Seite nicht in der erwarteten Form.')
    einzug, praefix = treffer.group(1), treffer.group(2)

    if 'assets/css/trends.css' not in text or 'assets/css/farben.css' not in text:
        ersatz = treffer.group(0) + '\n' + einzug + KOMMENTAR.replace('\n', '\n' + einzug) \
                 + '\n' + einzug + ZEILE_CSS.format(p=praefix, e=einzug)
        text = text[:treffer.start()] + ersatz + text[treffer.end():]
        geaendert += 1

    if 'assets/js/trends.js' not in text:
        if '</body>' not in text:
            raise SystemExit('Kein </body> gefunden.')
        text = text.replace('</body>', ZEILE_JS.format(p=praefix) + '\n</body>', 1)
        geaendert += 1

    return text, geaendert


def aushaengen(text):
    geaendert = 0
    vorher = text

    # Der Kommentarblock mitsamt der Zeile darunter.
    text = re.sub(
        r'\n[ \t]*<!-- Die beiden letzten Stylesheets.*?-->'
        r'\n[ \t]*<link rel="stylesheet" href="[^"]*assets/css/trends\.css">'
        r'\n[ \t]*<link rel="stylesheet" href="[^"]*assets/css/farben\.css">',
        '', text, flags=re.S)
    # Und, falls der Kommentar einmal fehlen sollte, die Zeile allein.
    text = re.sub(r'\n[ \t]*<!-- Sieben Zusaetze.*?-->', '', text, flags=re.S)
    text = re.sub(r'\n[ \t]*<link rel="stylesheet" href="[^"]*assets/css/(trends|farben)\.css">', '', text)
    text = re.sub(r'\n?[ \t]*<script src="[^"]*assets/js/trends\.js"></script>', '', text)

    if text != vorher:
        geaendert = 1
    return text, geaendert


def main():
    nur_zeigen = '--stand' in sys.argv
    raus = '--aus' in sys.argv

    summe = 0
    for pfad in seiten():
        with open(pfad, encoding='utf-8') as f:
            text = f.read()

        hat_css = 'assets/css/trends.css' in text
        hat_js = 'assets/js/trends.js' in text
        kurz = os.path.relpath(pfad, WURZEL)

        if nur_zeigen:
            print('%-42s css %s   js %s' % (kurz, 'ja ' if hat_css else 'nein', 'ja ' if hat_js else 'nein'))
            continue

        neu, n = (aushaengen(text) if raus else einhaengen(text))
        if n:
            with open(pfad, 'w', encoding='utf-8') as f:
                f.write(neu)
            print('%-42s %s' % (kurz, 'herausgenommen' if raus else 'eingehaengt'))
            summe += 1

    if not nur_zeigen:
        print('\n%d Datei(en) geaendert.' % summe)


if __name__ == '__main__':
    main()
