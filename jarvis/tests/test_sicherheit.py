"""Sicherheitstests.

Jeder Test hier haelt eine Luecke fest, die in einer Pruefung dieses Codes
gefunden wurde. Sie sind absichtlich an einer Stelle gebuendelt: wer eine
davon brechen laesst, soll sehen, worum es ging.
"""

import threading

import pytest

from jarvis.agent import FUELLWORTE, NO, YES, Agent, PendingAction
from jarvis.config import Config
from jarvis.llm.client import Chunk, ToolCall
from jarvis.llm.conversation import ConversationBuilder
from jarvis.memory.db import Database
from jarvis.memory.store import LongTermMemory, ShortTermMemory
from jarvis.permissions import Policy, Scope
from jarvis.tasks.manager import TaskManager
from jarvis.tools.registry import ArgumentError, Param, ToolRegistry, ToolResult


# ======================================================================
# Bestaetigung: eine Hoeflichkeitsfloskel ist keine Zustimmung
# ======================================================================
class ScriptedLLM:
    def __init__(self, antworten):
        self.antworten = list(antworten)

    def chat(self, messages, *, tools=None, cancel=None):
        schritt = self.antworten.pop(0) if self.antworten else "ok"
        if isinstance(schritt, tuple):
            yield Chunk(tool_calls=[ToolCall(name=schritt[0], arguments=schritt[1])],
                        done=True)
        else:
            yield Chunk(text=schritt, done=True)


@pytest.fixture()
def agent_mit_loeschwerkzeug(tmp_path):
    cfg = Config()
    cfg.policy = Policy(granted=frozenset({Scope.DELETE}), roots=(tmp_path.resolve(),))
    db = Database()
    geloescht: list[str] = []

    def bauen(antworten):
        reg = ToolRegistry(cfg.policy)

        @reg.register("datei_loeschen", "Loescht", Scope.DELETE, {"pfad": Param(str)})
        def _del(pfad: str) -> ToolResult:
            geloescht.append(pfad)
            return ToolResult(ok=True, value=pfad, verification="geloescht")

        return Agent(cfg, db, ScriptedLLM(antworten), registry=reg), geloescht

    yield bauen
    db.close()


@pytest.mark.parametrize("satz", [
    "Lies mir bitte die Nachrichten vor",
    "Ok, wie ist das Wetter?",
    "Klar, aber erst morgen",
    "Mach mir gerne eine Notiz dazu",
    "Ja, und wie spaet ist es?",
])
def test_hoeflichkeitsfloskel_bestaetigt_keine_loeschung(agent_mit_loeschwerkzeug, satz):
    """Der gefaehrlichste Fall: ein ganz normaler Satz loest die wartende
    Loeschung aus, weil irgendwo 'bitte' oder 'ok' darin steht."""
    agent, geloescht = agent_mit_loeschwerkzeug(
        [("datei_loeschen", {"pfad": "/tmp/wichtig.txt"}), "Wie meinst du das?"])
    antwort = agent.respond("Loesch die Datei")
    assert antwort.needs_confirmation

    agent.respond(satz)
    assert geloescht == [], f"{satz!r} hat die Loeschung ausgeloest"
    assert agent.pending is None   # die Aktion verfaellt


@pytest.mark.parametrize("satz", ["Ja", "Ja, mach das", "Ja bitte", "Genau",
                                  "Mach das", "Einverstanden", "Ja gerne"])
def test_echte_zustimmung_wird_erkannt(agent_mit_loeschwerkzeug, satz):
    """Die Verschaerfung darf die normale Zustimmung nicht kaputt machen."""
    agent, geloescht = agent_mit_loeschwerkzeug(
        [("datei_loeschen", {"pfad": "/tmp/alt.txt"})])
    agent.respond("Loesch die alte Datei")
    antwort = agent.respond(satz)
    assert geloescht == ["/tmp/alt.txt"], f"{satz!r} wurde nicht als Zustimmung erkannt"
    # Und die Antwort nennt, was getan wurde -- nicht nur "Erledigt".
    assert "datei_loeschen" in antwort.text


@pytest.mark.parametrize("satz", ["Nein", "Nein danke", "Lass mal", "Stopp",
                                  "Nicht noetig"])
def test_ablehnung_wird_erkannt(agent_mit_loeschwerkzeug, satz):
    agent, geloescht = agent_mit_loeschwerkzeug(
        [("datei_loeschen", {"pfad": "/tmp/alt.txt"})])
    agent.respond("Loesch das")
    agent.respond(satz)
    assert geloescht == []


def test_abgelaufene_rueckfrage_verfaellt(agent_mit_loeschwerkzeug):
    """Ein 'ja' lange nach der Frage meint vermutlich etwas anderes."""
    from jarvis.agent import CONFIRMATION_TIMEOUT
    agent, geloescht = agent_mit_loeschwerkzeug(
        [("datei_loeschen", {"pfad": "/tmp/alt.txt"}), "Wie bitte?"])
    agent.respond("Loesch das")
    agent.pending.created_at -= CONFIRMATION_TIMEOUT + 1
    agent.respond("Ja")
    assert geloescht == []


def test_floskeln_stehen_nicht_in_der_ja_liste():
    """Festhalten, warum: 'bitte' kommt in jedem zweiten Satz vor."""
    for floskel in ("bitte", "gerne", "klar", "ok", "okay"):
        assert floskel not in YES, f"{floskel!r} darf keine Zustimmung sein"
        assert floskel in FUELLWORTE


# ======================================================================
# Systemanweisung: gespeicherte Daten sind keine Vorlage
# ======================================================================
@pytest.fixture()
def builder():
    db = Database()
    ltm = LongTermMemory(db)
    tm = TaskManager(db)
    yield ConversationBuilder("Noah", ShortTermMemory(db, "s"), ltm, tm), ltm, tm
    db.close()


def test_geschweifte_klammern_im_fakt_legen_jarvis_nicht_lahm(builder):
    """Ein Fakt mit {platzhalter} liess jede weitere Antwort mit KeyError
    scheitern -- und zwar dauerhaft, weil er in der Datenbank steht."""
    cb, ltm, _ = builder
    ltm.remember("Noah", "Notiz", "Aufgabe {geheim} erledigen")
    text = cb.system_message()["content"]        # darf nicht werfen
    assert "{geheim}" in text                     # bleibt woertlich stehen


def test_klammern_im_aufgabentitel_ebenso(builder):
    cb, _, tm = builder
    tm.create("Angebot {kunde} schreiben")
    assert "{kunde}" in cb.system_message()["content"]


def test_platzhalter_wird_nicht_ausgewertet(builder):
    """Sonst liesse sich ueber einen Fakt im Python-Objektbaum stoebern."""
    cb, ltm, _ = builder
    ltm.remember("Noah", "X", "{user.__class__.__mro__}")
    text = cb.system_message()["content"]
    assert "<class" not in text
    assert "{user.__class__.__mro__}" in text


def test_name_wird_trotzdem_eingesetzt(builder):
    cb, ltm, _ = builder
    ltm.remember("Noah", "Buero", "Hamburg")
    text = cb.system_message()["content"]
    assert "Noah" in text and "{user}" not in text


def test_fakten_sind_als_daten_gekennzeichnet(builder):
    """Sie koennen aus einer gelesenen Seite stammen."""
    cb, ltm, _ = builder
    ltm.remember("Noah", "Buero", "Hamburg")
    assert "keine Anweisungen" in cb.system_message()["content"]


# ======================================================================
# Netz: nicht ins eigene Netz greifen
# ======================================================================
@pytest.mark.parametrize("url", [
    "http://127.0.0.1:8765/api/memory",
    "http://localhost:8765/api/log",
    "http://[::1]:8765/",
    "http://192.168.1.1/",
    "http://10.0.0.5/",
    "http://169.254.169.254/latest/meta-data/",
])
def test_eigenes_netz_wird_nicht_abgerufen(url):
    """Das Dashboard liegt bewusst nur auf 127.0.0.1. Koennte JARVIS es selbst
    abrufen, waere diese Grenze wertlos: unter /api/memory steht das ganze
    Langzeitgedaechtnis."""
    from jarvis.tools.web import ZielAbgelehnt, pruefe_ziel
    with pytest.raises(ZielAbgelehnt):
        pruefe_ziel(url)


@pytest.mark.parametrize("url", ["http://93.184.216.34/", "https://1.1.1.1/"])
def test_oeffentliche_adressen_bleiben_erlaubt(url):
    from jarvis.tools.web import pruefe_ziel
    assert pruefe_ziel(url) == url


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://beispiel.de/",
                                 "gopher://beispiel.de/"])
def test_nur_http_und_https(url):
    from jarvis.tools.web import ZielAbgelehnt, pruefe_ziel
    with pytest.raises(ZielAbgelehnt):
        pruefe_ziel(url)


# ======================================================================
# Sprachausgabe: Text ist kein Befehlsargument
# ======================================================================
@pytest.mark.parametrize("text,erwartet", [
    ("-o/Users/noah/wichtig.plist", "o/Users/noah/wichtig.plist"),
    ("- Stichpunkt eins", "Stichpunkt eins"),
    ("--", ""),
    ("Normaler Satz", "Normaler Satz"),
])
def test_fuehrender_bindestrich_wird_entschaerft(text, erwartet):
    """`say -o/pfad` schreibt die Sprachausgabe in eine Datei. Ein Modell, das
    eine Aufzaehlung mit '- ' beginnt, reicht dafuer schon."""
    from jarvis.speech.tts import _ohne_fuehrenden_bindestrich
    assert _ohne_fuehrenden_bindestrich(text) == erwartet


def test_say_setzt_optionsende():
    """Zusaetzlich zum Entschaerfen: '--' beendet die Optionen."""
    import inspect

    from jarvis.speech.tts import SayEngine
    quelle = inspect.getsource(SayEngine.speak)
    assert '"--"' in quelle


# ======================================================================
# Werkzeugargumente
# ======================================================================
def test_wahrheitswert_gilt_nicht_als_zahl():
    """bool ist in Python eine Unterklasse von int -- True waere sonst als 1
    durchgegangen."""
    reg = ToolRegistry(Policy(granted=frozenset({Scope.READ})))

    @reg.register("zaehle", "Test", Scope.READ, {"anzahl": Param(int)})
    def _z(anzahl: int) -> ToolResult:
        return ToolResult(ok=True, value=anzahl)

    assert reg.call("zaehle", {"anzahl": 3}).value == 3
    with pytest.raises(ArgumentError, match="Wahrheitswert"):
        reg.call("zaehle", {"anzahl": True})


# ======================================================================
# Protokoll
# ======================================================================
def test_spaeter_gelesene_zugangsdaten_werden_geschwaerzt():
    """Die Zugangsdaten werden erst beim Bauen der Werkzeuge gelesen -- eine
    beim Start kopierte Liste haette sie nie enthalten."""
    from jarvis import secrets
    from jarvis.logging_setup import get_logger, setup

    ring = setup(level="INFO", known_secrets=secrets.known)
    secrets._remember("erst-spaeter-gelesener-schluessel")
    get_logger("test").info("Schluessel erst-spaeter-gelesener-schluessel benutzt")
    assert "erst-spaeter" not in ring.tail()[-1]["message"]
