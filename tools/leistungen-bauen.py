#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Der Leistungsblock der Startseite — seit September ausgebaut.

**Ohne Schalter nimmt dieses Skript den Block aus `index.html` heraus**, und
zwar mehrfach ausführbar: ist er schon weg, meldet es null Änderungen. Mit
`--einsetzen` kommt er zurück.

Der Grund für die Umkehr steht in CLAUDE.md unter „Die Bereiche stehen im
Menü, nicht auf der Startseite": bestellt war, dass die sechs Bereiche nur
noch über den Menüpunkt erreichbar sind und auf der Startseite nicht mehr
auftauchen. Das Skript bleibt trotzdem stehen — ein gelöschtes Skript ist
eine Entscheidung, die niemand mehr zurücknehmen kann, und die Tabelle unten
ist weiterhin die einzige Stelle, an der Nummer, Name, Adresse und Kachel
der sechs Bereiche zusammenstehen.

Warum überhaupt ein Skript: sechs Zeilen mit je fünf Feldern sind dreißig
Angaben, und jede davon steht schon woanders im Projekt. Von Hand abgetippt
laufen sie beim ersten Namenswechsel auseinander.
"""
import re
import sys

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
        # Die vier Unterleistungen je Bereich stehen hier NICHT mehr.
        # ------------------------------------------------------------
        # Vierundzwanzig Stichworte auf der Startseite sind das vollstaendige
        # Leistungsverzeichnis — und dann hat die Uebersichtsseite nichts
        # mehr zu sagen, was man nicht schon gelesen hat. Die Zeile nennt
        # jetzt den Bereich, die Seite dahinter erklaert ihn. Die Tabelle
        # oben behaelt die Stichworte trotzdem: sie ist die einzige Stelle,
        # an der die sechs Bereiche mit ihren Adressen zusammenstehen.
        aus.append(f'''      <li class="bereich">
        <span class="bereich__nr" aria-hidden="true">{nr}</span>
        <span class="bereich__bild"><img src="{vor}assets/img/{bild}" alt="" loading="lazy" width="{b}" height="{h}" /></span>
        <span class="bereich__text">
          <a class="bereich__name" href="{vor}dienstleistungen/{datei}.html">{name}</a>
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
      einen. Was in jedem Bereich dazugehört, steht auf seiner Seite.</p>
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

FORT = '''
<!-- ============ HIER STAND DER LEISTUNGSBLOCK ============
     Sechs Zeilen mit Nummer, Kachel und Name. Sie sind auf Wunsch
     ausgebaut: die Bereiche sollen nur noch über den Menüpunkt
     „Dienstleistungen" erreichbar sein und auf der Startseite nicht mehr
     stehen.

     Verloren geht dadurch kein Weg. Der Menüpunkt öffnet beim
     Darüberfahren den Balken mit allen sechs (`.megabar`, gebaut von
     main.js), ohne JavaScript führt derselbe Punkt direkt auf
     dienstleistungen.html, am Telefon steht „Leistungen" in der Leiste
     unten, und im Fuß jeder Seite stehen die sechs Adressen ohnehin.

     Zurückholen: python3 tools/leistungen-bauen.py --einsetzen
     ======================================================== -->
'''

if __name__ == '__main__':
    einsetzen = '--einsetzen' in sys.argv
    s = alt = open('index.html', encoding='utf-8').read()
    da = 'class="angebot"' in s

    if einsetzen and da:
        s = re.sub(r'\n<!-- =+ LEISTUNGEN =+ -->.*?</section>\n',
                   BLOCK.replace('{ZEILEN}', zeilen()), s, flags=re.S)
        print('Leistungsblock ersetzt')
    elif einsetzen:
        anker = '\n<!-- ============ IMAGEFILM ============ -->'
        assert anker in s, 'Anker nicht gefunden'
        s = s.replace(FORT, '\n', 1)
        s = s.replace(anker, BLOCK.replace('{ZEILEN}', zeilen()) + anker, 1)
        print('Leistungsblock eingesetzt, vor dem Imagefilm')
    elif da:
        s = re.sub(r'\n<!-- =+ LEISTUNGEN =+ -->.*?</section>\n', FORT, s, flags=re.S)
        print('Leistungsblock ausgebaut, Begründung steht als Kommentar an seiner Stelle')
    else:
        print('Leistungsblock steht nicht in index.html — nichts zu tun')

    if s != alt:
        open('index.html', 'w', encoding='utf-8').write(s)
