#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ersetzt die sechs Kamerafahrt-Bühnen auf dienstleistungen.html durch sechs
helle Blöcke.

Warum überhaupt: die Bühnen waren sechs bildschirmfüllende Szenen mit
Zoomfahrt, zusammen rund fünfzehn Bildschirmhöhen fast durchgehend schwarz.
Wer wissen will, was es gibt, muss dafür vier Bildschirme weit scrollen, und
gesagt wird dabei nicht mehr als in vier Zeilen. Die Fahrt war außerdem der
Grund für die aufwendigste Stelle im ganzen Stylesheet (`will-change` nur
unter `.live`, siehe „Die teuerste Falle").

Der Inhalt wird dabei NICHT neu geschrieben, sondern aus den vorhandenen
Bühnen ausgelesen: Nummer, Bereichsname, Überschrift, Merksatz, Absatz,
Schlagworte, Verweis und beide Fotos. Was hier herauskommt, steht vorher
schon da — nur in einem anderen Kasten.
"""
import re
import sys

QUELLE = 'dienstleistungen.html'
BUEHNE = re.compile(r'  <section class="stage"[^>]*>.*?\n  </section>\n', re.S)


def feld(name, blob, standard=''):
    m = re.search(name, blob, re.S)
    return m.group(1).strip() if m else standard


def lesen(html):
    bereiche = []
    for roh in BUEHNE.findall(html):
        kennung = feld(r'id="([^"]+)"', roh)
        nr = feld(r'<span class="stage__nr">([^<]+)</span>', roh)
        gebiet = feld(r'<span class="stage__titel">([^<]+)</span>', roh)
        h2 = feld(r'<h2 class="u-caps">(.*?)</h2>', roh)
        tag = feld(r'<span class="tag">(.*?)</span>', roh)
        absatz = feld(r'<p>(.*?)</p>', roh)
        chips = feld(r'(<div class="chips">.*?</div>)', roh)
        weg = feld(r'<a class="btn go" href="([^"]+)"', roh)
        # Das erste <picture> der Bühne ist die Weitwinkelaufnahme.
        bild = feld(r'(<picture>.*?</picture>)', roh)
        bereiche.append(dict(kennung=kennung, nr=nr, gebiet=gebiet, h2=h2, tag=tag,
                             absatz=absatz, chips=chips, weg=weg, bild=bild))
    return bereiche


PFEIL = ('<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
         '<path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" '
         'stroke-linecap="round" stroke-linejoin="round"/></svg>')


def block(b, i):
    # Das Foto trägt in der Bühne kein alt — dort war es Grundfläche. Hier ist
    # es ein Bild im Text und bekommt eine Beschreibung aus dem Bereichsnamen.
    bild = b['bild'].replace('class="scene__photo" ', '')
    bild = re.sub(r'alt=""', f'alt="{b["gebiet"]}, Einsatz des HERM Service Team"', bild, count=1)
    bild = re.sub(r'sizes="[^"]*"', 'sizes="(max-width:900px) 100vw, 46vw"', bild)
    # Die Seite, auf der das Bild steht, wechselt von Block zu Block. Das
    # steht als Attribut im Markup und nicht als `:nth-child()` im
    # Stylesheet: die Bloecke sind Geschwister anderer Abschnitte, und
    # `nth-child` zaehlt die mit — eine Zaehlung, die von Nachbarn abhaengt,
    # kippt beim naechsten eingefuegten Abschnitt still um.
    seite = 'links' if i % 2 == 0 else 'rechts'
    return f'''  <section class="bereichsblock" id="{b['kennung']}" data-bild="{seite}">
    <div class="wrap bereichsblock__reihe">
      <figure class="bereichsblock__bild reveal-up">{bild}</figure>
      <div class="bereichsblock__text">
        <span class="eyebrow reveal-up">{b['nr']} &middot; {b['gebiet']}</span>
        <h2 class="reveal-up u-caps">{b['h2']}</h2>
        <p class="bereichsblock__merksatz reveal-up" data-d="1">{b['tag']}</p>
        <p class="reveal-up" data-d="1">{b['absatz']}</p>
        {b['chips'].replace('<div class="chips">', '<div class="chips reveal-up" data-d="2">')}
        <a class="btn" href="{b['weg']}" data-d="2">Zum Bereich {PFEIL}</a>
      </div>
    </div>
  </section>
'''


def main():
    s = open(QUELLE, encoding='utf-8').read()
    bereiche = lesen(s)
    if not bereiche:
        sys.exit('Keine Bühnen gefunden — vermutlich schon umgebaut.')
    print(f'{len(bereiche)} Bühnen gelesen:',
          ', '.join(b['gebiet'] for b in bereiche))
    fehlend = [b['gebiet'] for b in bereiche
               if not (b['h2'] and b['absatz'] and b['weg'] and b['bild'])]
    if fehlend:
        sys.exit('Unvollständig gelesen: ' + ', '.join(fehlend))

    neu = '\n'.join(block(b, i) for i, b in enumerate(bereiche))
    # Alle Bühnen durch den neuen Satz ersetzen, die erste trägt ihn.
    erste = True
    def tausch(_m):
        nonlocal erste
        if erste:
            erste = False
            return neu
        return ''
    s = BUEHNE.sub(tausch, s)

    # Die Kinofassung und die Kapitelrail gehörten zur Fahrt und haben ohne
    # sie keinen Gegenstand mehr.
    s = re.sub(r'\s*<div class="kino"[^>]*>.*?</div>\n', '\n', s, flags=re.S)
    open(QUELLE, 'w', encoding='utf-8').write(s)
    print('Sechs helle Blöcke eingesetzt.')


if __name__ == '__main__':
    main()
