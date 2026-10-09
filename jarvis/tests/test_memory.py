"""Tests fuer das Gedaechtnis."""

import pytest

from jarvis.memory.db import Database
from jarvis.memory.store import (
    Contradiction, KnowledgeStore, LongTermMemory, ShortTermMemory,
)


@pytest.fixture()
def db():
    with Database() as d:
        yield d


# -- Kurzzeit -----------------------------------------------------------
def test_fenster_begrenzt_den_kontext(db):
    stm = ShortTermMemory(db, "s1", window=3)
    for i in range(10):
        stm.add("user", f"Satz {i}")
    recent = stm.recent()
    assert len(recent) == 3
    # Zeitliche Reihenfolge, aelteste zuerst.
    assert [t.content for t in recent] == ["Satz 7", "Satz 8", "Satz 9"]


def test_verlauf_bleibt_trotz_fenster(db):
    stm = ShortTermMemory(db, "s1", window=2)
    for i in range(5):
        stm.add("user", f"S{i}")
    assert len(stm.recent(limit=99)) == 5


def test_sitzungen_sind_getrennt(db):
    ShortTermMemory(db, "a").add("user", "nur in a")
    assert ShortTermMemory(db, "b").recent() == []


def test_modellformat(db):
    stm = ShortTermMemory(db, "s1")
    stm.add("user", "Moin")
    stm.add("assistant", "Moin Noah")
    assert stm.as_messages() == [
        {"role": "user", "content": "Moin"},
        {"role": "assistant", "content": "Moin Noah"},
    ]


# -- Langzeit -----------------------------------------------------------
def test_fakt_merken_und_finden(db):
    ltm = LongTermMemory(db)
    ltm.remember("Noah", "Dienstwagen", "VW Caddy")
    assert ltm.lookup("Noah", "Dienstwagen").value == "VW Caddy"


def test_gleicher_wert_erzeugt_kein_duplikat(db):
    ltm = LongTermMemory(db)
    a = ltm.remember("Noah", "Buero", "Hamburg")
    b = ltm.remember("Noah", "Buero", "Hamburg")
    assert a.id == b.id
    assert len(ltm.about("Noah")) == 1


def test_widerspruch_wird_gemeldet_nicht_ueberschrieben(db):
    """JARVIS soll nachfragen, statt eine von zwei Angaben zu verlieren."""
    ltm = LongTermMemory(db)
    ltm.remember("Noah", "Telefon", "040-1")
    with pytest.raises(Contradiction) as exc:
        ltm.remember("Noah", "Telefon", "040-2")
    assert exc.value.existing.value == "040-1"
    assert exc.value.new_value == "040-2"
    # Der alte Wert gilt weiter, solange nichts entschieden ist.
    assert ltm.lookup("Noah", "Telefon").value == "040-1"


def test_force_ersetzt_und_verkettet(db):
    ltm = LongTermMemory(db)
    alt = ltm.remember("Noah", "Telefon", "040-1")
    neu = ltm.remember("Noah", "Telefon", "040-2", force=True)
    assert ltm.lookup("Noah", "Telefon").value == "040-2"
    # Der alte Wert ist nicht geloescht, nur ueberholt.
    verlauf = [f.value for f in ltm.history("Noah", "Telefon")]
    assert verlauf == ["040-1", "040-2"]
    assert alt.id != neu.id


def test_korrigieren(db):
    ltm = LongTermMemory(db)
    f = ltm.remember("Noah", "Lieblingskaffee", "Filter")
    ltm.correct(f.id, "Espresso")
    assert ltm.lookup("Noah", "Lieblingskaffee").value == "Espresso"


def test_vergessen(db):
    ltm = LongTermMemory(db)
    f = ltm.remember("Noah", "Geheimnis", "x")
    ltm.forget(f.id)
    assert ltm.lookup("Noah", "Geheimnis") is None


def test_kontextblock_statt_ganzer_historie(db):
    ltm = LongTermMemory(db)
    ltm.remember("Noah", "Buero", "Hamburg")
    ltm.remember("Noah", "Anrede", "Du")
    block = ltm.context_block()
    assert "Noah Buero: Hamburg" in block
    assert "Noah Anrede: Du" in block


def test_ueberholte_fakten_stehen_nicht_im_kontext(db):
    ltm = LongTermMemory(db)
    ltm.remember("Noah", "Telefon", "alt")
    ltm.remember("Noah", "Telefon", "neu", force=True)
    block = ltm.context_block()
    assert "neu" in block and "alt" not in block


# -- Wissen -------------------------------------------------------------
def test_suche_findet_dokument(db):
    ks = KnowledgeStore(db)
    ks.add("Dienstplan KW12", "Sicherheit: Halle 45, drei Leute, Dresscode schwarz")
    ks.add("Rezept", "Labskaus mit Rote Bete")
    treffer = ks.search("Halle")
    assert len(treffer) == 1
    assert treffer[0]["title"] == "Dienstplan KW12"
    assert "[Halle]" in treffer[0]["auszug"]


def test_suche_mit_beugungsform(db):
    """Praefixsuche: 'Dresscode' soll 'Dresscodes' finden und umgekehrt."""
    ks = KnowledgeStore(db)
    ks.add("Regeln", "Die Dresscodes werden vorher festgelegt")
    assert ks.search("Dresscode")


def test_leere_suche_wirft_nicht(db):
    ks = KnowledgeStore(db)
    ks.add("x", "y")
    assert ks.search("") == []
    assert ks.search("  ?! ") == []


def test_geloeschtes_dokument_ist_nicht_mehr_auffindbar(db):
    ks = KnowledgeStore(db)
    doc = ks.add("Notiz", "Angebot Halle 45 versendet")
    assert ks.search("Angebot")
    ks.delete(doc)
    assert ks.search("Angebot") == []


def test_aktualisiertes_dokument_wird_neu_indexiert(db):
    ks = KnowledgeStore(db)
    doc = ks.add("Notiz", "alter Inhalt")
    ks.update(doc, "neuer Inhalt mit Stichwort Promotion")
    assert ks.search("Promotion")
    assert ks.search("alter") == []
