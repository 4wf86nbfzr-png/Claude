#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Beige Bahnen auf den Unterseiten
=================================

Bestellt war eine Website „in Beige und Weinrot". Als Tinte und als
Licht steht das Beige ueberall — als FLAECHE bisher nirgends.

Dieses Skript setzt `auf-beige` auf jede zweite ruhige Textbahn der
fuenfzehn Unterseiten. Die Klasse selbst dreht in `farben.css` die
ganze Tonleiter um; moeglich ist das nur, weil seit
`tools/farben-umstellen.py` jede Regel im Stylesheet ueber die beiden
Tokens laeuft und nicht mehr ueber ein festes Weiss.

    python3 tools/beige-bahnen.py --stand
    python3 tools/beige-bahnen.py
    python3 tools/beige-bahnen.py --aus

DREI REGELN STEHEN DAHINTER, und sie sind alle einmal teuer bezahlt
worden:

1. **Nie zwei helle Bahnen hintereinander.** Zwei nebeneinander sehen
   auf einem Bildschirmfoto nur nach einem etwas breiteren Block aus —
   man merkt den Fehler also nicht, man sieht nur, dass der Takt weg
   ist. Deshalb zaehlt das Skript und nimmt jede zweite.
2. **Was auf einem Foto sitzt, bleibt Wein.** Kopfbilder und randlose
   Bildbaender laufen ohnehin in den Grund aus; eine beige Bahn darauf
   waere eine Kante, wo gerade keine mehr ist.
3. **Die Startseite bekommt keine.** Dort laeuft der Film hinter allem.
   Eine deckende beige Bahn wuerde ihn auf ihrer ganzen Hoehe zudecken,
   und durchscheinend waere sie dunkle Tinte ueber einem Bild, dessen
   Helligkeit sich 44 Sekunden lang aendert.
"""

import os
import re
import sys

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'redesign'))

# Nur ruhige Textbahnen. `content` steht oft direkt unter dem Kopfbild
# und ist dessen Fortsetzung — eine Farbkante mitten in einem Gedanken
# liest als Fehler.
#
# `bblock` ist seit „mehr Beige" dabei: die sechs Bereichsbloecke auf
# `dienstleistungen.html`. Sie fielen beim ersten Durchgang durch das
# Raster, weil dort nur drei Klassennamen standen — die laengste Seite
# der Website hatte damit keinen einzigen beigen Abschnitt. Ihr Foto
# sitzt im Satzspiegel und nicht an der Fensterkante, Regel 2 greift
# also nicht: abwechselnd Wein und Beige ist dort genau der Farbtakt,
# den das Hauptprojekt unter „Der Farbtakt" beschreibt.
#
# `content` bleibt bewusst draussen. Auf `kontakt.html` waeren das das
# Anfrageformular und der Ansprechpartner — der Weg, ueber den Geld
# hereinkommt. Er wird nicht wegen einer Farbe angefasst.
BAHNEN = ('section-soft', 'testi', 'expect', 'bblock')

SECTION = re.compile(r'<section class="([^"]*)"')


def seiten():
    raus = []
    for name in sorted(os.listdir(WURZEL)):
        if name.endswith('.html') and name not in ('index.html',):
            raus.append(os.path.join(WURZEL, name))
    unter = os.path.join(WURZEL, 'dienstleistungen')
    if os.path.isdir(unter):
        for name in sorted(os.listdir(unter)):
            if name.endswith('.html'):
                raus.append(os.path.join(unter, name))
    return raus


def umbauen(text, raus=False):
    zaehler = [0]
    geaendert = [0]

    def ersetzen(m):
        klassen = m.group(1).split()
        hat = 'auf-beige' in klassen
        if raus:
            if hat:
                klassen.remove('auf-beige')
                geaendert[0] += 1
            return '<section class="%s"' % ' '.join(klassen)

        if not any(k in BAHNEN for k in klassen):
            return m.group(0)
        zaehler[0] += 1
        soll = (zaehler[0] % 2 == 1)          # die erste, dritte, fuenfte
        if soll and not hat:
            klassen.append('auf-beige')
            geaendert[0] += 1
        elif not soll and hat:
            klassen.remove('auf-beige')
            geaendert[0] += 1
        return '<section class="%s"' % ' '.join(klassen)

    neu = SECTION.sub(ersetzen, text)
    return neu, geaendert[0]


def main():
    nur_zeigen = '--stand' in sys.argv
    raus = '--aus' in sys.argv
    summe = 0

    for pfad in seiten():
        with open(pfad, encoding='utf-8') as f:
            text = f.read()
        kurz = os.path.relpath(pfad, WURZEL)

        if nur_zeigen:
            bahnen = [m.group(1) for m in SECTION.finditer(text)
                      if any(k in BAHNEN for k in m.group(1).split())]
            beige = sum(1 for b in bahnen if 'auf-beige' in b)
            if bahnen:
                print('%-42s %d Bahn(en), davon %d beige' % (kurz, len(bahnen), beige))
            continue

        neu, n = umbauen(text, raus)
        if n:
            with open(pfad, 'w', encoding='utf-8') as f:
                f.write(neu)
            print('%-42s %d Bahn(en) %s' % (kurz, n, 'zurueck' if raus else 'gesetzt'))
            summe += n

    if not nur_zeigen:
        print('\n%d Bahn(en) geaendert.' % summe)


if __name__ == '__main__':
    main()
