"""Tests der Laufzeit: Einzelinstanz, Wiederaufnahme, sauberes Beenden."""

import os
import time

import pytest

from jarvis.config import Config
from jarvis.llm.client import Chunk
from jarvis.permissions import Policy, Scope
from jarvis.runtime import AlreadyRunning, InstanceLock, JarvisRuntime
from jarvis.tasks.manager import Status


class StummesLLM:
    def chat(self, messages, *, tools=None, cancel=None):
        yield Chunk(text="ok", done=True)

    def health(self):
        return True, "Testmodell"

    def models(self):
        return []


def konfig(tmp_path) -> Config:
    cfg = Config()
    cfg.state_dir = tmp_path / "state"
    cfg.llm.runtime = "none"
    cfg.policy = Policy(granted=frozenset({Scope.READ}), roots=(tmp_path.resolve(),))
    return cfg


# -- Sperre -------------------------------------------------------------
def test_zweite_instanz_wird_abgewiesen(tmp_path):
    """Zwei JARVIS auf demselben Mikrofon und derselben Datenbank gehen nicht."""
    pfad = tmp_path / "jarvis.pid"
    erste = InstanceLock(pfad)
    erste.acquire()
    with pytest.raises(AlreadyRunning, match="laeuft bereits"):
        InstanceLock(pfad).acquire()
    erste.release()


def test_fehlermeldung_nennt_den_prozess(tmp_path):
    pfad = tmp_path / "jarvis.pid"
    InstanceLock(pfad).acquire()
    with pytest.raises(AlreadyRunning) as exc:
        InstanceLock(pfad).acquire()
    assert str(os.getpid()) in str(exc.value)
    assert "kill" in str(exc.value)


def test_verwaiste_sperre_wird_uebernommen(tmp_path):
    """Nach einem Absturz soll man nicht von Hand aufraeumen muessen."""
    pfad = tmp_path / "jarvis.pid"
    pfad.write_text("4000000")      # es gibt keinen Prozess mit dieser Kennung
    sperre = InstanceLock(pfad)
    sperre.acquire()
    assert pfad.read_text() == str(os.getpid())
    sperre.release()


def test_unleserliche_sperre_wird_uebernommen(tmp_path):
    pfad = tmp_path / "jarvis.pid"
    pfad.write_text("kaputt")
    sperre = InstanceLock(pfad)
    sperre.acquire()
    assert pfad.read_text() == str(os.getpid())
    sperre.release()


def test_freigeben_loescht_nur_die_eigene_sperre(tmp_path):
    """Sonst raeumt ein beendeter Prozess dem Nachfolger die Sperre weg."""
    pfad = tmp_path / "jarvis.pid"
    sperre = InstanceLock(pfad)
    sperre.acquire()
    pfad.write_text("4000000")      # ein Nachfolger hat uebernommen
    sperre.release()
    assert pfad.exists()


def test_sperre_als_kontextmanager(tmp_path):
    pfad = tmp_path / "jarvis.pid"
    with InstanceLock(pfad):
        assert pfad.exists()
    assert not pfad.exists()


# -- Aufbau und Abbau ---------------------------------------------------
def test_aufbau_und_sauberes_beenden(tmp_path):
    runtime = JarvisRuntime(konfig(tmp_path), with_voice=False)
    runtime.setup()
    assert runtime.db is not None
    assert runtime.agent is not None
    assert runtime.lock.path.exists()
    assert runtime.config.db_path.exists()
    runtime.shutdown()
    assert runtime.db is None
    assert not runtime.lock.path.exists()


def test_mehrfaches_beenden_ist_unschaedlich(tmp_path):
    runtime = JarvisRuntime(konfig(tmp_path), with_voice=False)
    runtime.setup()
    runtime.shutdown()
    runtime.shutdown()   # darf nicht werfen


def test_werkzeuge_werden_angemeldet(tmp_path):
    runtime = JarvisRuntime(konfig(tmp_path), with_voice=False)
    runtime.setup()
    try:
        namen = {t.name for t in runtime.agent.registry.available()}
        # Eigene Werkzeuge (Gedaechtnis, Aufgaben) und Dateilesen.
        assert "aufgabe_anlegen" in namen
        assert "datei_lesen" in namen
    finally:
        runtime.shutdown()


# -- Wiederaufnahme nach Neustart ---------------------------------------
def test_laufende_aufgaben_werden_beim_start_ehrlich_gemacht(tmp_path):
    """Nach einem Absturz laeuft nichts mehr -- der Status darf das nicht sagen."""
    cfg = konfig(tmp_path)
    erster = JarvisRuntime(cfg, with_voice=False)
    erster.setup()
    aufgabe = erster.agent.tasks.create("Lange Auswertung")
    erster.agent.tasks.start(aufgabe.id)
    # Absturz: kein shutdown, nur Datenbank und Sperre loslassen.
    erster.db.close()
    erster.lock.release()

    zweiter = JarvisRuntime(cfg, with_voice=False)
    zweiter.setup()
    try:
        wieder = zweiter.agent.tasks.get(aufgabe.id)
        assert wieder.status is Status.BLOCKED
        assert "Neustart" in wieder.blocked_reason
        # Und es gibt eine Meldung darueber -- der Nutzer erfaehrt davon.
        texte = [n.text for n in zweiter.agent.notifications.history()]
        assert any("Neustart" in t for t in texte)
    finally:
        zweiter.shutdown()


def test_gedaechtnis_ueberlebt_den_neustart(tmp_path):
    cfg = konfig(tmp_path)
    erster = JarvisRuntime(cfg, with_voice=False)
    erster.setup()
    erster.agent.long_term.remember("Noah", "Buero", "Hamburg")
    erster.shutdown()

    zweiter = JarvisRuntime(cfg, with_voice=False)
    zweiter.setup()
    try:
        assert zweiter.agent.long_term.lookup("Noah", "Buero").value == "Hamburg"
    finally:
        zweiter.shutdown()


# -- Zustand fuer das Dashboard -----------------------------------------
def test_snapshot_kommt_aus_echten_quellen(tmp_path):
    runtime = JarvisRuntime(konfig(tmp_path), with_voice=False)
    runtime.setup()
    try:
        aufgabe = runtime.agent.tasks.create("Etwas")
        runtime.agent.tasks.start(aufgabe.id)
        runtime.agent.tasks.block(aufgabe.id, "Information fehlt")
        daten = runtime.snapshot()
        assert daten["aufgaben_offen"] == 1
        assert daten["aufgaben"][0]["grund"] == "Information fehlt"
        assert daten["zustand"] == "ohne sprache"
    finally:
        runtime.shutdown()


def test_health_meldet_fehlendes_modell_ehrlich(tmp_path):
    runtime = JarvisRuntime(konfig(tmp_path), with_voice=False)
    runtime.setup()
    try:
        zustand = runtime.health()
        assert zustand["sprachmodell"]["ok"] is False
        assert zustand["sprache"]["ok"] is False
        assert "nicht_bereit" in zustand["werkzeuge"]
    finally:
        runtime.shutdown()


def test_ohne_mikrofon_laeuft_jarvis_trotzdem(tmp_path):
    """Kein Mikrofon ist kein Grund abzustuerzen -- nur kein Grund zu schweigen."""
    cfg = konfig(tmp_path)
    runtime = JarvisRuntime(cfg, with_voice=True)
    runtime.setup()
    try:
        # In dieser Umgebung gibt es kein Audiogeraet.
        assert runtime.pipeline is None
        texte = [n.text for n in runtime.agent.notifications.history()]
        assert any("Sprachsteuerung ist aus" in t for t in texte)
        # Aber der Agent ist benutzbar.
        assert runtime.agent.respond("Moin").text
    finally:
        runtime.shutdown()
