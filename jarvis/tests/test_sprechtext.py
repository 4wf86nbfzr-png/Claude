# -*- coding: utf-8 -*-
"""Geschriebenes zu Gesprochenem.

Eine Stimme klingt vor allem deshalb nach Maschine, weil sie vorliest, was
fuers Auge geschrieben wurde. Hier wird geprueft, dass genau das nicht mehr
passiert.
"""

from __future__ import annotations

import pytest

from jarvis.core.sprechtext import fuer_stimme, in_stuecke, zahlwort


@pytest.mark.parametrize("zahl,wort", [
    (0, "null"), (1, "eins"), (7, "sieben"), (12, "zwölf"), (21, "einundzwanzig"),
    (30, "dreißig"), (45, "fünfundvierzig"), (99, "neunundneunzig"),
    (100, "einhundert"), (365, "dreihundertfünfundsechzig"),
])
def test_zahlwoerter(zahl, wort):
    assert zahlwort(zahl) == wort


@pytest.mark.parametrize("roh,erwartet", [
    ("Es ist 13:13 Uhr.", "Es ist dreizehn Uhr dreizehn."),
    ("um 9:00 Uhr", "um neun Uhr"),
    ("um 8:30", "um halb neun"),
    ("um 9:15 Uhr", "um viertel nach neun"),
    ("um 11:45", "um viertel vor zwölf"),
    # Nachmittags sagt niemand "viertel vor achtzehn".
    ("um 17:45 Uhr", "um siebzehn Uhr fünfundvierzig"),
])
def test_uhrzeiten_werden_gesprochen(roh, erwartet):
    assert fuer_stimme(roh) == erwartet


@pytest.mark.parametrize("roh,erwartet", [
    ("am 5.11.", "am fünften November"),
    ("am 1.3.2026", "am ersten März 2026"),
    ("am 31.12.", "am einunddreißigsten Dezember"),
    # Unsinnige Angaben bleiben, wie sie sind.
    ("Version 4.99.", "Version 4.99."),
])
def test_datumsangaben(roh, erwartet):
    assert fuer_stimme(roh) == erwartet


@pytest.mark.parametrize("roh,erwartet", [
    ("z. B. heute", "zum Beispiel heute"),
    ("ca. 20 Leute", "ungefähr 20 Leute"),
    ("d.h. morgen", "das heißt morgen"),
    ("Nr. 7", "Nummer sieben"),
    ("Mo. um 9:00", "Montag um neun Uhr"),
    ("2 Std. Arbeit", "zwei Stunden Arbeit"),
])
def test_abkuerzungen(roh, erwartet):
    assert fuer_stimme(roh) == erwartet


@pytest.mark.parametrize("roh,erwartet", [
    ("20 °C", "20 Grad"),
    ("50 %", "50 Prozent"),
    ("150 €", "150 Euro"),
    ("Tim & Alex", "Tim und Alex"),
])
def test_einheiten(roh, erwartet):
    assert fuer_stimme(roh) == erwartet


def test_formatierung_und_links_fliegen_raus():
    roh = "*Wichtig:* schau auf https://example.com/x und schreib an a.b@c.de 👍"
    gesprochen = fuer_stimme(roh)
    assert gesprochen == "Wichtig: schau auf die verlinkte Seite und schreib an die Adresse"


def test_aktionsmarke_wird_nicht_vorgelesen():
    assert fuer_stimme("Mach ich. [AKTION:OEFFNE] tagesschau.de") == "Mach ich."


def test_grosse_zahlen_bleiben_ziffern():
    # Jahreszahlen und Betraege liest die Stimme von sich aus richtig;
    # ausgeschrieben waeren sie schwerer zu hoeren.
    assert "2026" in fuer_stimme("Im Jahr 2026")
    assert "150" in fuer_stimme("150 Euro")


def test_leerer_text():
    assert fuer_stimme("") == ""
    assert in_stuecke("") == []


def test_stuecke_erstes_ist_kurz():
    lang = ("Guten Morgen. Es ist sieben Uhr. In Hamburg sind es sechs Grad, bedeckt. "
            "Auf deiner Liste stehen vier offene Aufgaben: Dienstplan schreiben, "
            "Rechnung Meyer, Objektbegehung und Schichtplan prüfen.")
    stuecke = in_stuecke(lang)
    assert len(stuecke) >= 2
    assert len(stuecke[0]) <= 120
    # Nichts geht verloren.
    assert "Schichtplan prüfen" in " ".join(stuecke)


def test_ueberlanger_satz_wird_am_komma_geteilt():
    satz = "Wir brauchen " + ", ".join(f"Position {i}" for i in range(1, 30)) + "."
    stuecke = in_stuecke(satz)
    assert len(stuecke) > 1
    assert all(len(s) <= 240 for s in stuecke)


def test_kurzer_text_bleibt_ein_stueck():
    assert in_stuecke("Erledigt.") == ["Erledigt."]
