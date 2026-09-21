#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baut den neuen Leistungsblock und setzt ihn in die Startseite.

Warum ein Skript und nicht von Hand: sechs Zeilen mit je fünf Feldern sind
dreißig Angaben, und jede davon steht schon woanders im Projekt. Von Hand
abgetippt laufen sie beim ersten Namenswechsel auseinander. Die Tabelle hier
ist die einzige Stelle, an der sie zusammenstehen — gelesen sind sie aus den
sechs Leistungsseiten selbst (h3 der `.leistung`-Blöcke).
"""
import re

# Reihenfolge wie im Balken unter der Kopfzeile (main.js, BEREICHE) — zwei
# verschiedene Reihenfolgen für dieselben sechs Bereiche wären genau die Art
# Unstimmigkeit, die man erst bemerkt, wenn jemand sie sucht.
BEREICHE = [
    ('01', 'Gastro-Personal', 'gastro-personal', 'gastro-detail-mini.webp', 480, 480,
     'Menü-Service &amp; Bankett · Bar &amp; Kaffee-Theke · Küchenhilfe &amp; Runner · Partyhilfe'),
    ('02', 'Sicherheit', 'sicherheit', 'sicherheit-mini.webp', 480, 480,
     'Einlass &amp; Akkreditierung · Crowdmanagement · Veranstaltungsschutz · Personenschutz'),
    ('03', 'Promotion &amp; Hostess', 'promotion-hostess', 'promotion-messe-mini.webp', 341, 480,
     'Messehostessen · Empfang &amp; Akkreditierung · VIP- &amp; Gästebetreuung · Promotion &amp; Sampling'),
    ('04', 'Logistik', 'logistik', 'logistik-mini.webp', 480, 480,
     'Auf- &amp; Abbau · Transport · Bühnen- &amp; Messelogistik · Saalumbau'),
    ('05', 'Fahrservice', 'fahrservice', 'fahrservice-door-mini.webp', 480, 320,
     'Flughafentransfer · Shuttle-Service · Chauffeur · Fahrer mit Personenschutz'),
    ('06', 'Reinigung', 'reinigung', 'reinigung-mini.webp', 480, 320,
     'Gebäudereinigung · Büroreinigung · Praxis &amp; Kanzlei · Nach der Veranstaltung'),
]

PFEIL = ('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
         '<path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.6" '
         'stroke-linecap="round" stroke-linejoin="round"/></svg>')


def zeilen(vor=''):
    aus = []
    for nr, name, datei, bild, b, h, teile in BEREICHE:
        # Kein `reveal-up` je Zeile: die Liste deckt als Gruppe auf
        # (`data-stagger` an <ul>), damit die sechs Zeilen einen Takt
        # bekommen statt jede fuer sich einzublenden. Der Index --i, den
        # main.js dabei setzt, fuehrt auch die Linie unter der Zeile.
        aus.append(f'''      <li class="bereich">
        <span class="bereich__nr" aria-hidden="true">{nr}</span>
        <span class="bereich__bild"><img src="{vor}assets/img/{bild}" alt="" loading="lazy" width="{b}" height="{h}" /></span>
        <span class="bereich__text">
          <a class="bereich__name" href="{vor}dienstleistungen/{datei}.html">{name}</a>
          <span class="bereich__teile">{teile}</span>
        </span>
        <span class="bereich__pfeil" aria-hidden="true">{PFEIL}</span>
      </li>''')
    return '\n'.join(aus)


BLOCK = '''
<!-- ============ LEISTUNGEN ============ -->
<!-- Sechs Zeilen, keine Kachelwand. Jede trägt die vier Leistungen, die auf
     der Bereichsseite wirklich stehen — nichts ist hier neu formuliert, und
     nichts wird zweimal erzählt: die Zeile nennt, die Seite dahinter
     erklärt. Erzeugt von tools/leistungen-bauen.py. -->
<section class="angebot" id="leistungen">
  <div class="wrap angebot__kopf">
    <span class="eyebrow reveal-up">Was wir stellen</span>
    <h2 class="u-caps" data-kino>Sechs Bereiche, ein Ansprechpartner.</h2>
    <p class="lead reveal-up" data-d="1">Sie buchen nicht sechs Dienstleister, sondern
      einen. Wer bei uns anfragt, bekommt für jeden Bereich dieselbe Disposition,
      dieselbe Abrechnung und denselben Ansprechpartner vor Ort.</p>
  </div>
  <div class="wrap">
    <ul class="bereiche" data-stagger>
{ZEILEN}
    </ul>
    <div class="angebot__fuss">
      <a class="btn" href="dienstleistungen.html">Alle Dienstleistungen im Einzelnen
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
      <a class="btn btn--ghost" href="kontakt.html">Personal anfragen
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
    </div>
  </div>
</section>
'''

if __name__ == '__main__':
    s = open('index.html', encoding='utf-8').read()
    if 'class="angebot"' in s:
        # Schon da: austauschen statt ein zweites Mal einsetzen.
        s = re.sub(r'\n<!-- =+ LEISTUNGEN =+ -->.*?</section>\n',
                   BLOCK.replace('{ZEILEN}', zeilen()), s, flags=re.S)
        print('Leistungsblock ersetzt')
    else:
        anker = '\n<!-- ============ IMAGEFILM ============ -->'
        assert anker in s, 'Anker nicht gefunden'
        s = s.replace(anker, BLOCK.replace('{ZEILEN}', zeilen()) + anker, 1)
        print('Leistungsblock eingesetzt, vor dem Imagefilm')
    open('index.html', 'w', encoding='utf-8').write(s)
