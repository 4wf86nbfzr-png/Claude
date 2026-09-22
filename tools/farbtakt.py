#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Setzt den Farbtakt: welcher Abschnitt blau steht und welcher beige.

Bestellt war ein Wechselspiel — ein Textfeld in Dunkelblau, das naechste in
warmem Beige, mit weichem Uebergang dazwischen, und zwar auf der ganzen
Website. Die Farben und die Blende macht das Stylesheet (`.auf-hell`); was
WO steht, ist eine Entscheidung je Seite, und die steht hier.

**Warum ein Skript und nicht Handarbeit.** Es sind sechzehn Dateien und rund
fuenfzig Abschnitte. Von Hand gesetzt faellt der Takt beim ersten neuen
Abschnitt auseinander, und zwar unbemerkt: zwei helle Bahnen nebeneinander
sehen auf einem Bildschirmfoto nur nach einem etwas breiteren Block aus.
Dieselbe Begruendung wie bei `leistungen-bauen.py` und `symbole-bauen.py`.

Das Skript ist mehrfach ausfuehrbar. Es raeumt vorher jedes `auf-hell` und
jedes `data-blende` aus den `<section>`-Tags und setzt danach genau das, was
in TAKT steht — es gibt also keinen Zustand, der sich ueber mehrere Laeufe
aufschaukelt.

    python3 tools/farbtakt.py            # setzen
    python3 tools/farbtakt.py --stand    # nur zeigen, nichts aendern
    python3 tools/farbtakt.py --aus      # den ganzen Takt zuruecknehmen

DREI REGELN, nach denen die Tabelle unten gebaut ist:

1. **Nie zwei helle Bahnen hintereinander.** Sonst ist es kein Takt mehr,
   sondern ein Block. Das Skript prueft es und bricht ab.
2. **Was auf einem Foto sitzt, bleibt blau.** Kopfbild, Bildband, Kopfband
   der Unterseiten: dort traegt die Aufnahme, und der Verlauf darunter
   laeuft ohnehin schon in den Seitengrund. Eine helle Bahn direkt daneben
   bekaeme eine zweite Blende gegen die erste.
3. **Zwei Abschnitte, die zusammengehoeren, bekommen dieselbe Farbe.** Wo
   `padding-top:0` steht, ist der Abschnitt darunter die Fortsetzung des
   vorigen (das Bildband der Leistungsseiten, der Ansprechpartner-Block
   unter dem Formular). Eine Farbkante mitten in einem Gedanken liest als
   Fehler.
"""
import os
import re
import sys

HIER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Je Seite eine Liste in der Reihenfolge der <section>-Tags im Dokument.
#   None      unveraendert lassen (weder `auf-hell` noch `auf-dunkel` setzen)
#   "dunkel"  traegt `auf-dunkel`
#   "hell"    traegt `auf-hell`
#   "hell:oben" / "hell:unten" / "hell:keine"
#             wie "hell", aber die Blende nur oben, nur unten oder gar nicht
#             (`data-blende`). Gebraucht, wo eine Bahn aus zwei Abschnitten
#             besteht: der obere blendet nur oben aus, der untere nur unten.
#
# Der Kommentar hinter jeder Zeile ist der Abschnitt, damit die Tabelle auch
# dann noch lesbar ist, wenn man die Datei nicht daneben offen hat.
TAKT = {
    "index.html": [
        None,        # hero, Kopfbild
        "dunkel",    # auftakt, der dunkle Streifen unter dem Foto
        None,        # schaubild, Bildband
        "hell",      # trust, die Vertrauensleiste
        None,        # intro
        # Der Imagefilm bleibt blau, und das ist Regel 2 und kein Geschmack:
        # die Buehne ist ein randloses Bewegtbild ueber die volle Breite.
        # Auf einer hellen Bahn deckt sie die Blende des Abschnitts zu — das
        # Video liegt ueber dem Hintergrund, nicht darunter — und es stand
        # eine harte Kante zwischen Beige und Bild. Was auf einem Foto sitzt,
        # bleibt blau; ein Film ist ein Foto, das laeuft.
        None,        # film
        "hell",      # testi, Zitat und Zeichen
        None,        # cta, Schlussblock
    ],
    "dienstleistungen.html": [
        None,        # subhero
        None,        # content, Einleitung
        "hell",      # 01 Gastro-Personal
        None,        # 02 Sicherheit
        "hell",      # 03 Promotion & Hostess
        None,        # 04 Logistik
        "hell",      # 05 Fahrservice
        None,        # 06 Reinigung
        "hell",      # expect, Was Sie erwarten koennen
        None,        # cta
    ],
    # Die sechs Leistungsseiten teilen einen Bauplan. `content--randlos` mit
    # `padding-top:0` ist die Fortsetzung des Abschnitts darueber (das
    # Bildband) und bleibt deshalb blau wie dieser.
    "_leistungsseite": [
        None,        # subhero
        None,        # content, Text
        None,        # content--randlos, Bildband
        "hell",      # section-soft 1
        None,        # section-soft 2
        "hell",      # section-soft 3
        None,        # cta
    ],
    "jobs.html": [
        None,        # subhero
        None,        # content
        "hell",      # section-soft, Freie Stellen
        None,        # section-soft, Haeufige Fragen
        "hell",      # section-soft, Bewerbung
        None,        # cta
    ],
    "kontakt.html": [
        None,        # subhero
        None,        # kundentuer (steht nur mit Datenbank, sonst hidden)
        "hell",      # ablauf, So laeuft eine Anfrage
        None,        # content, das Anfrageformular
        None,        # content, Ansprechpartner (padding-top:0, gehoert dazu)
    ],
    "team.html": [
        None,        # subhero
        "dunkel",    # team-buero, steht auf dem Ton der Portraetaufnahmen
        "hell",      # section-soft, Lust dabei zu sein
    ],
    "referenzen.html": [
        None,        # subhero
        "hell",      # testi, die Stimmen
        None,        # section-soft, Personal anfragen
    ],
    "galerie.html": [
        None,        # subhero
        "hell",      # content, die Kachelwand
    ],
    # Impressum, Datenschutz und die Fehlerseite bleiben blau: sie bestehen
    # aus EINEM Abschnitt. Eine einzelne Bahn ist kein Wechsel, und auf einer
    # Rechtsseite gehoert die wenigste Gestaltung hin.
    "impressum.html": [None],
    "datenschutz.html": [None],
    "404.html": [None],
}

LEISTUNGSSEITEN = ["gastro-personal", "sicherheit", "promotion-hostess",
                   "logistik", "fahrservice", "reinigung"]

SECTION = re.compile(r'<section\b[^>]*>')
KLASSE = re.compile(r'class="([^"]*)"')
BLENDE = re.compile(r'\s*data-blende="[^"]*"')


def tags(text):
    return list(SECTION.finditer(text))


def saeubern(tag):
    """Alles wegnehmen, was dieses Skript je gesetzt hat."""
    tag = BLENDE.sub("", tag)
    m = KLASSE.search(tag)
    if m:
        klassen = [k for k in m.group(1).split() if k != "auf-hell"]
        tag = tag[:m.start()] + f'class="{" ".join(klassen)}"' + tag[m.end():]
    return tag


def setzen(tag, wunsch):
    """`wunsch` ist None, "dunkel", "hell" oder "hell:<blende>"."""
    tag = saeubern(tag)
    if wunsch is None:
        return tag
    art, _, blende = wunsch.partition(":")
    m = KLASSE.search(tag)
    klassen = m.group(1).split() if m else []
    if art == "dunkel":
        if "auf-dunkel" not in klassen:
            klassen.append("auf-dunkel")
    else:
        klassen = [k for k in klassen if k != "auf-dunkel"]
        klassen.append("auf-hell")
    if m:
        tag = tag[:m.start()] + f'class="{" ".join(klassen)}"' + tag[m.end():]
    else:
        tag = tag[:len("<section")] + f' class="{" ".join(klassen)}"' + tag[len("<section"):]
    if blende:
        tag = tag[:-1].rstrip() + f' data-blende="{blende}"' + tag[-1]
    return tag


def pruefen(datei, plan):
    """Nie zwei helle Bahnen hintereinander — sonst ist es kein Takt."""
    letzte = None
    for i, w in enumerate(plan):
        hell = w is not None and w.startswith("hell")
        if hell and letzte:
            sys.exit(f"{datei}: Abschnitt {i} und {i + 1} sind beide hell — "
                     f"zwei Bahnen nebeneinander sind kein Wechsel.")
        letzte = hell


def bearbeiten(pfad, plan, aus=False, nur_zeigen=False):
    with open(pfad, encoding="utf-8") as f:
        text = f.read()
    stellen = tags(text)
    if len(stellen) != len(plan):
        sys.exit(f"{pfad}: {len(stellen)} <section>, aber {len(plan)} Zeilen "
                 f"in der Tabelle. Wer einen Abschnitt dazunimmt, traegt ihn "
                 f"in TAKT ein.")
    neu, ende, bahnen = [], 0, 0
    for m, wunsch in zip(stellen, plan):
        if aus:
            wunsch = None if wunsch != "dunkel" else "dunkel"
        neu.append(text[ende:m.start()])
        tag = setzen(m.group(0), wunsch)
        if wunsch and wunsch.startswith("hell") and not aus:
            bahnen += 1
        neu.append(tag)
        ende = m.end()
    neu.append(text[ende:])
    ergebnis = "".join(neu)
    geaendert = ergebnis != text
    if geaendert and not nur_zeigen:
        with open(pfad, "w", encoding="utf-8") as f:
            f.write(ergebnis)
    name = os.path.relpath(pfad, HIER)
    print(f"  {name:42s} {len(stellen):>2} Abschnitte, {bahnen} hell"
          f"{'   (geaendert)' if geaendert and not nur_zeigen else ''}")
    return geaendert


def main():
    aus = "--aus" in sys.argv
    nur_zeigen = "--stand" in sys.argv
    print("Farbtakt" + (" — nur anzeigen" if nur_zeigen else
                        " — zurueckgenommen" if aus else ""))
    plaene = {}
    for datei, plan in TAKT.items():
        if datei.startswith("_"):
            continue
        plaene[os.path.join(HIER, datei)] = plan
    for stamm in LEISTUNGSSEITEN:
        p = os.path.join(HIER, "dienstleistungen", stamm + ".html")
        plan = list(TAKT["_leistungsseite"])
        # Die Sicherheitsseite hat einen Abschnitt mehr (die Einsatzleitung).
        # Er steht zwischen der dritten und der letzten Bahn und bleibt blau.
        with open(p, encoding="utf-8") as f:
            anzahl = len(tags(f.read()))
        while len(plan) < anzahl:
            plan.insert(-1, None)
        plaene[p] = plan
    for pfad, plan in plaene.items():
        pruefen(os.path.relpath(pfad, HIER), plan)
    for pfad, plan in sorted(plaene.items()):
        bearbeiten(pfad, plan, aus=aus, nur_zeigen=nur_zeigen)


if __name__ == "__main__":
    main()
