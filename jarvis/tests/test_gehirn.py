"""Gehirn-Datei: einlesen, uebernehmen, ueber Telegram schicken.

Das ist der Weg, auf dem Jarvis erfaehrt, wer der Nutzer ist. Er muss
nachsichtig sein (Vorlagenzeilen duerfen nicht als Tatsachen landen) und
wiederholbar (dieselbe Datei zweimal eingelesen heisst nicht doppelt
gemerkt).
"""

from __future__ import annotations

import asyncio
from pathlib import Path


from jarvis.core.brain import (
    BrainEntry, format_preview, import_entries, kind_for_heading, parse_brain_file,
)

BEISPIEL = """\
> Kommentar, wird nicht gelernt
# Wer ich bin
!! Name: Maik Herm
Firma: HERM Service Team e.K.
Rolle: <ausfüllen>
Handy: <+49...>

# Vorlieben
!! Ansprache: Du-Form, kurz und direkt
! Telefonate: lieber vormittags
- Zahlen: als Liste

# Abläufe
Wochenplanung: montags 9 Uhr

# Projekte
Website-Relaunch: liegt im Testbetrieb
"""


def run(coroutine):
    return asyncio.run(coroutine)


# --- Einlesen -----------------------------------------------------------------
def test_datei_wird_vollstaendig_zerlegt():
    gelesen = parse_brain_file(BEISPIEL)
    assert gelesen.count == 7
    schluessel = {e.key: e for e in gelesen.entries}

    assert schluessel["Name"].value == "Maik Herm"
    assert schluessel["Name"].importance == 5
    assert schluessel["Name"].kind == "fakt"
    assert schluessel["Telefonate"].importance == 4
    assert schluessel["Telefonate"].kind == "vorliebe"
    assert schluessel["Zahlen"].value == "als Liste"          # Strich abgetrennt
    assert schluessel["Wochenplanung"].kind == "ablauf"
    assert schluessel["Website-Relaunch"].kind == "projekt"
    assert schluessel["Firma"].importance == 3                 # ohne Marke


def test_vorlagenzeilen_werden_nicht_gelernt():
    """Das Wichtigste: unausgefuellte Platzhalter duerfen keine Tatsache werden."""
    gelesen = parse_brain_file(BEISPIEL)
    gelernt = {e.key for e in gelesen.entries}
    assert "Rolle" not in gelernt and "Handy" not in gelernt
    assert len(gelesen.skipped) == 2
    assert any("Rolle" in hinweis for hinweis in gelesen.skipped)


def test_kommentare_und_trennlinien_werden_uebergangen():
    gelesen = parse_brain_file(
        "> nur ein Hinweis\n------\n# Wer ich bin\nName: Test\n======\n"
    )
    assert [e.key for e in gelesen.entries] == ["Name"]


def test_zeile_ohne_doppelpunkt_bekommt_einen_schluessel():
    gelesen = parse_brain_file("# Vorlieben\nIch arbeite am liebsten frueh morgens\n")
    eintrag = gelesen.entries[0]
    assert eintrag.value == "Ich arbeite am liebsten frueh morgens"
    assert eintrag.key.startswith("Ich arbeite")
    assert eintrag.kind == "vorliebe"


def test_doppelter_schluessel_wird_gemeldet_und_der_letzte_gilt():
    gelesen = parse_brain_file("# Wer ich bin\nName: Alt\nName: Neu\n")
    assert gelesen.count == 1
    assert gelesen.entries[0].value == "Neu"
    assert gelesen.warnings and "mehrfach" in gelesen.warnings[0]


def test_teilweise_ausgefuellte_zeile_wird_angemerkt():
    gelesen = parse_brain_file("# Abläufe\nMorgens: Tagesüberblick um <Uhrzeit>\n")
    assert gelesen.count == 1
    assert gelesen.warnings and "Klammer" in gelesen.warnings[0]


def test_leere_datei_erklaert_das_format():
    gelesen = parse_brain_file("\n\n> nur Kommentare\n")
    assert gelesen.count == 0
    assert gelesen.warnings and "Schluessel: Wert" in gelesen.warnings[0]


def test_ueberschriften_werden_zugeordnet():
    assert kind_for_heading("Wer ich bin") == "fakt"
    assert kind_for_heading("Vorlieben") == "vorliebe"
    assert kind_for_heading("Abläufe") == "ablauf"
    assert kind_for_heading("Ablaeufe") == "ablauf"          # ohne Umlaut
    assert kind_for_heading("Projekte und Baustellen") == "projekt"
    assert kind_for_heading("Irgendwas") == "fakt"


def test_umlaute_bleiben_erhalten():
    gelesen = parse_brain_file("# Vorlieben\nAntwortlänge: höchstens drei Sätze\n")
    assert gelesen.entries[0].value == "höchstens drei Sätze"


def test_vorschau_nennt_zahlen_und_uebersprungenes():
    vorschau = format_preview(parse_brain_file(BEISPIEL))
    assert "7 Punkte" in vorschau
    assert "übersprungen" in vorschau
    assert "Maik Herm" in vorschau


# --- Uebernehmen --------------------------------------------------------------
def test_uebernahme_ins_gedaechtnis(services):
    gelesen = parse_brain_file(BEISPIEL)
    ergebnis = import_entries(services.memory, gelesen.entries, source="test.md")

    assert ergebnis.neu == 7 and ergebnis.geaendert == 0
    assert "7 neu" in ergebnis.summary()
    gespeichert = services.memory.get_memory_by_key("Name")
    assert gespeichert is not None and gespeichert.value == "Maik Herm"
    assert gespeichert.importance == 5
    # Wichtiges landet im Kontext jeder Antwort.
    wichtig = {e.key for e in services.memory.important_memory()}
    assert {"Name", "Ansprache", "Telefonate"} <= wichtig


def test_erneutes_einlesen_merkt_nichts_doppelt(services):
    gelesen = parse_brain_file(BEISPIEL)
    import_entries(services.memory, gelesen.entries)
    zweites = import_entries(services.memory, gelesen.entries)

    assert zweites.neu == 0
    assert zweites.unveraendert == 7
    assert len(services.memory.list_memory(limit=100)) == 7


def test_geaenderte_datei_aktualisiert_nur_das_geaenderte(services):
    import_entries(services.memory, parse_brain_file(BEISPIEL).entries)
    geaendert = BEISPIEL.replace("lieber vormittags", "lieber nachmittags")
    ergebnis = import_entries(services.memory, parse_brain_file(geaendert).entries)

    assert ergebnis.geaendert == 1 and ergebnis.unveraendert == 6
    assert services.memory.get_memory_by_key("Telefonate").value == "lieber nachmittags"


def test_uebernahme_wird_als_ereignis_vermerkt(services):
    import_entries(services.memory, parse_brain_file(BEISPIEL).entries, source="mein-gehirn.md")
    ereignisse = services.memory.recent_events(kind="gehirn_gelernt")
    assert ereignisse and ereignisse[0]["detail"]["neu"] == 7


def test_leere_eintraege_werden_gemeldet_nicht_verschluckt(services):
    ergebnis = import_entries(services.memory, [BrainEntry(key="", value="ohne Schluessel")])
    assert ergebnis.total == 0
    assert ergebnis.fehler


def test_gelerntes_steht_dem_modell_zur_verfuegung(services):
    """Der eigentliche Zweck: Jarvis soll es beim Antworten mitdenken."""
    from jarvis.ai.cloud import EchoProvider
    from jarvis.ai.provider import ModelReply

    import_entries(services.memory, parse_brain_file(BEISPIEL).entries)
    anbieter = EchoProvider(scripted=[ModelReply(text="Klar.")])
    services.models.primary = anbieter
    services.models.active = anbieter
    services.models.fallback = None

    run(services.build_agent().handle("42", "Moin"))
    systemtext = anbieter.calls[0][0].content
    assert "Maik Herm" in systemtext
    assert "Du-Form" in systemtext
    # Unwichtiges bleibt draussen -- der Kontext soll klein bleiben.
    assert "als Liste" not in systemtext


# --- Die mitgelieferte Vorlage ------------------------------------------------
def test_vorlage_ist_einlesbar_und_lernt_keine_platzhalter():
    vorlage = Path(__file__).resolve().parent.parent / "mein-gehirn.vorlage.md"
    assert vorlage.exists(), "mein-gehirn.vorlage.md fehlt im Projekt"
    gelesen = parse_brain_file(vorlage.read_text(encoding="utf-8"))

    assert gelesen.count >= 10, "Die Vorlage sollte schon brauchbare Punkte enthalten"
    assert gelesen.skipped, "Die Vorlage sollte Platzhalter zum Ausfuellen haben"
    assert gelesen.warnings == [], gelesen.warnings
    for eintrag in gelesen.entries:
        assert "<" not in eintrag.value, f"Platzhalter gelernt: {eintrag.key}"
        assert "ausfüllen" not in eintrag.value.lower()
    # Die Tonvorgaben sind als wichtig markiert, sonst wirken sie nicht.
    wichtig = {e.key for e in gelesen.entries if e.importance >= 4}
    assert "Ansprache" in wichtig and "Firma" in wichtig


def test_persoenliche_fassung_liegt_ausserhalb_der_versionsverwaltung():
    """Eigene Eintraege duerfen bei einer Aktualisierung nicht im Weg stehen."""
    wurzel = Path(__file__).resolve().parent.parent
    assert (wurzel / "mein-gehirn.vorlage.md").exists()
    ignoriert = (wurzel / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert "mein-gehirn.md" in ignoriert
