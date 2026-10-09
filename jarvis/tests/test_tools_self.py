"""Tests der Werkzeuge, mit denen JARVIS sein eigenes Gedaechtnis und seine
Aufgaben fuehrt.

Der wichtigste Punkt: das Modell kann eine Aufgabe nicht ohne Pruefvermerk
abschliessen -- auch nicht ueber den Werkzeugweg.
"""

import pytest

from jarvis.agent import Agent
from jarvis.config import Config
from jarvis.llm.client import NullLLM
from jarvis.memory.db import Database
from jarvis.permissions import Policy, Scope
from jarvis.tasks.manager import Status
from jarvis.tools.builtin import build_registry, register_self_tools
from jarvis.tools.registry import ToolRegistry


@pytest.fixture()
def agent(tmp_path):
    cfg = Config()
    cfg.policy = Policy(granted=frozenset({Scope.READ}), roots=(tmp_path.resolve(),))
    db = Database()
    reg = ToolRegistry(cfg.policy)
    a = Agent(cfg, db, NullLLM(), registry=reg)
    register_self_tools(reg, a)
    yield a
    db.close()


# -- Gedaechtnis --------------------------------------------------------
def test_fakt_merken_und_abfragen(agent):
    res = agent.registry.call("fakt_merken",
                              {"thema": "Noah", "aussage": "Buero", "wert": "Hamburg"})
    assert res.ok
    abfrage = agent.registry.call("fakt_abfragen", {"thema": "Noah"})
    assert "Hamburg" in abfrage.value


def test_widerspruch_wird_dem_modell_erklaert(agent):
    """Das Modell soll nachfragen, nicht ueberschreiben."""
    agent.registry.call("fakt_merken",
                        {"thema": "Noah", "aussage": "Telefon", "wert": "040-1"})
    res = agent.registry.call("fakt_merken",
                              {"thema": "Noah", "aussage": "Telefon", "wert": "040-2"})
    assert not res.ok
    assert "widerspricht" in res.message
    assert "fakt_korrigieren" in res.message
    # Der alte Wert gilt weiter.
    assert agent.long_term.lookup("Noah", "Telefon").value == "040-1"


def test_korrigieren_ersetzt(agent):
    agent.registry.call("fakt_merken",
                        {"thema": "Noah", "aussage": "Telefon", "wert": "040-1"})
    res = agent.registry.call("fakt_korrigieren",
                              {"thema": "Noah", "aussage": "Telefon", "wert": "040-2"})
    assert res.ok and "ueberholt" in res.verification
    assert agent.long_term.lookup("Noah", "Telefon").value == "040-2"


def test_leeres_gedaechtnis_wird_ehrlich_gemeldet(agent):
    res = agent.registry.call("fakt_abfragen", {"thema": "Unbekannt"})
    assert res.ok and "nichts gespeichert" in res.value


def test_wissen_ablegen_und_finden(agent):
    agent.registry.call("wissen_ablegen",
                        {"titel": "Dienstplan", "inhalt": "Halle 45, drei Leute"})
    res = agent.registry.call("wissen_suchen", {"anfrage": "Halle"})
    assert res.ok and "Dienstplan" in res.value


# -- Aufgaben -----------------------------------------------------------
def test_aufgabe_anlegen_und_auflisten(agent):
    agent.registry.call("aufgabe_anlegen", {"titel": "Angebot schreiben"})
    res = agent.registry.call("aufgaben_offen")
    assert "Angebot schreiben" in res.value and "geplant" in res.value


def test_aufgabe_zerlegen(agent):
    angelegt = agent.registry.call("aufgabe_anlegen", {"titel": "Bewerbung"})
    kennung = int(angelegt.value.split()[0].lstrip("#"))
    res = agent.registry.call("aufgabe_zerlegen",
                              {"aufgabe_id": kennung,
                               "schritte": "Unterlagen lesen; Antwort schreiben"})
    assert res.ok and res.verification.startswith("2 Teilschritte")


def test_erledigen_ohne_pruefvermerk_wird_abgelehnt(agent):
    """Der Kern: auch ueber den Werkzeugweg geht das nicht."""
    angelegt = agent.registry.call("aufgabe_anlegen", {"titel": "Datei pruefen"})
    kennung = int(angelegt.value.split()[0].lstrip("#"))
    agent.registry.call("aufgabe_beginnen", {"aufgabe_id": kennung})
    res = agent.registry.call("aufgabe_erledigt",
                              {"aufgabe_id": kennung, "ergebnis": "Fertig!",
                               "pruefung": "   "})
    assert not res.ok
    assert "Pruefvermerk" in res.message
    assert agent.tasks.get(kennung).status is Status.RUNNING


def test_erledigen_mit_pruefvermerk(agent):
    angelegt = agent.registry.call("aufgabe_anlegen", {"titel": "Datei pruefen"})
    kennung = int(angelegt.value.split()[0].lstrip("#"))
    agent.registry.call("aufgabe_beginnen", {"aufgabe_id": kennung})
    res = agent.registry.call("aufgabe_erledigt",
                              {"aufgabe_id": kennung,
                               "ergebnis": "zwei Eintraege fehlen",
                               "pruefung": "Datei gelesen, Spalte B geprueft"})
    assert res.ok and "Pruefvermerk" in res.verification
    assert agent.tasks.get(kennung).status is Status.DONE


def test_offene_teilschritte_verhindern_abschluss(agent):
    angelegt = agent.registry.call("aufgabe_anlegen", {"titel": "Gross"})
    kennung = int(angelegt.value.split()[0].lstrip("#"))
    agent.registry.call("aufgabe_zerlegen",
                        {"aufgabe_id": kennung, "schritte": "A; B"})
    agent.registry.call("aufgabe_beginnen", {"aufgabe_id": kennung})
    res = agent.registry.call("aufgabe_erledigt",
                              {"aufgabe_id": kennung, "ergebnis": "x",
                               "pruefung": "geprueft"})
    assert not res.ok and "offene Teilschritte" in res.message


def test_blockieren_mit_grund(agent):
    angelegt = agent.registry.call("aufgabe_anlegen", {"titel": "Mail"})
    kennung = int(angelegt.value.split()[0].lstrip("#"))
    agent.registry.call("aufgabe_beginnen", {"aufgabe_id": kennung})
    res = agent.registry.call("aufgabe_blockiert",
                              {"aufgabe_id": kennung, "grund": "Adresse fehlt"})
    assert res.ok
    assert agent.tasks.get(kennung).blocked_reason == "Adresse fehlt"


def test_unerlaubter_statuswechsel_wird_gemeldet_nicht_erzwungen(agent):
    angelegt = agent.registry.call("aufgabe_anlegen", {"titel": "X"})
    kennung = int(angelegt.value.split()[0].lstrip("#"))
    agent.registry.call("aufgabe_beginnen", {"aufgabe_id": kennung})
    agent.registry.call("aufgabe_erledigt",
                        {"aufgabe_id": kennung, "ergebnis": "r", "pruefung": "v"})
    # Erledigtes wird nicht wieder geoeffnet.
    res = agent.registry.call("aufgabe_beginnen", {"aufgabe_id": kennung})
    assert not res.ok


# -- Zusammenbau --------------------------------------------------------
def test_build_registry_meldet_alles_an(tmp_path):
    cfg = Config()
    cfg.policy = Policy(granted=frozenset(Scope), roots=(tmp_path.resolve(),))
    reg = build_registry(cfg)
    namen = {t.name for t in reg.all()}
    # Datei-, macOS- und Netzwerkzeuge sind dabei.
    assert {"datei_lesen", "notiz_anlegen", "seite_lesen"} <= namen
    # Eigene Werkzeuge nur mit Agent.
    assert "aufgabe_anlegen" not in namen


def test_build_registry_ohne_rechte_bleibt_klein(tmp_path):
    cfg = Config()
    cfg.policy = Policy(granted=frozenset({Scope.READ}), roots=(tmp_path.resolve(),))
    reg = build_registry(cfg)
    namen = {t.name for t in reg.all()}
    assert "datei_lesen" in namen
    assert "datei_loeschen" not in namen
    assert "seite_lesen" not in namen
