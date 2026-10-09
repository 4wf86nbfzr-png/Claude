"""Durchgaengiger Ablauf.

Geprueft wird die Kette, die im Auftrag unter Phase 5 steht:

  sprechen -> verstehen -> Kontext -> Werkzeug -> Ergebnis pruefen
  -> Aufgabenstatus -> antworten -> bereit fuer die naechste Runde

Mikrofon, Whisper und Lautsprecher sind ersetzt (Audio aus einer Liste,
vorgegebene Transkripte, stumme Ausgabe). Alles dazwischen -- Agent, Werkzeuge,
Berechtigungen, Gedaechtnis, Aufgaben, Meldungen -- ist echt.
"""

import array
import math

import pytest

from jarvis.agent import Agent
from jarvis.config import Config
from jarvis.llm.client import Chunk, ToolCall
from jarvis.memory.db import Database
from jarvis.notify.manager import NotifyConfig, Priority
from jarvis.permissions import Policy, Scope
from jarvis.speech.audio import ListSource
from jarvis.speech.pipeline import State, VoicePipeline
from jarvis.speech.stt import NullSTT
from jarvis.speech.tts import NullEngine, Speaker
from jarvis.speech.wakeword import ManualDetector
from jarvis.tools.builtin import build_registry

BLOCK = 480


def laut():
    return array.array("h", [int(9000 * math.sin(2 * math.pi * 200 * i / 16000))
                             for i in range(BLOCK)]).tobytes()


def still():
    return array.array("h", [0] * BLOCK).tobytes()


class PlanLLM:
    """Modell mit vorgegebenem Ablauf: erst Werkzeuge, dann Antwort."""

    def __init__(self, plan: list) -> None:
        self.plan = list(plan)
        self.runden = 0
        self.gesehene_werkzeuge: list[str] = []

    def chat(self, messages, *, tools=None, cancel=None):
        self.runden += 1
        if tools:
            self.gesehene_werkzeuge = [t["name"] for t in tools]
        schritt = self.plan.pop(0) if self.plan else "Fertig."
        if isinstance(schritt, tuple):
            name, args = schritt
            yield Chunk(tool_calls=[ToolCall(name=name, arguments=args)], done=True)
        else:
            for wort in schritt.split(" "):
                yield Chunk(text=wort + " ")
            yield Chunk(done=True)

    def health(self):
        return True, "Plan-Modell"


class Werkstatt:
    """Haelt den Arbeitsordner und baut daraus einen vollstaendigen JARVIS.

    Der Ordner muss vor dem Bauen bekannt sein, weil die Testplaene echte
    Dateipfade enthalten.
    """

    def __init__(self, cfg, db, arbeit) -> None:
        self.cfg = cfg
        self.db = db
        self.dir = arbeit

    def pfad(self, name: str) -> str:
        return str(self.dir / name)

    def bauen(self, plan, transkripte):
        agent = Agent(self.cfg, self.db, PlanLLM(plan))
        agent.registry = build_registry(self.cfg, agent=agent)
        speaker = Speaker(NullEngine())
        speaker.start()
        pipeline = VoicePipeline(
            self.cfg, agent, audio=ListSource([]), detector=ManualDetector(),
            stt=NullSTT(antworten=transkripte), speaker=speaker)
        pipeline.segmenter.config.min_speech = 0.09
        return pipeline, agent, speaker


@pytest.fixture()
def werkstatt(tmp_path):
    arbeit = tmp_path / "unterlagen"
    arbeit.mkdir()
    (arbeit / "dienstplan.txt").write_text(
        "Halle 45, Freitag\nSicherheit: 3 Leute\nGastro: 8 Leute\n", "utf-8")

    cfg = Config()
    cfg.state_dir = tmp_path / "state"
    cfg.policy = Policy(granted=frozenset({Scope.READ, Scope.CREATE, Scope.EDIT}),
                        roots=(arbeit.resolve(),))
    cfg.notify = NotifyConfig(min_gap_seconds=0, quiet_hours=(0, 0),
                              speak_threshold=Priority.NOTABLE)
    cfg.audio.block_ms = 30
    cfg.stt.silence_timeout = 0.15
    cfg.wake.conversation_timeout = 100.0

    db = Database()
    yield Werkstatt(cfg, db, arbeit)
    db.close()


def sprechen(pipeline):
    """Eine Aeusserung: laut, dann Stille bis zum Satzende."""
    for _ in range(4):
        pipeline._handle_block(laut())
    for _ in range(7):
        pipeline._handle_block(still())


# -- Der vollstaendige Ablauf -------------------------------------------
def test_vollstaendiger_ablauf_mit_werkzeug_und_aufgabe(werkstatt):
    """Aeusserung -> Werkzeug -> Pruefung -> Aufgabenstatus -> Antwort."""
    pipeline, agent, speaker = werkstatt.bauen(
        plan=[
            ("aufgabe_anlegen", {"titel": "Dienstplan pruefen"}),
            ("datei_lesen", {"pfad": werkstatt.pfad("dienstplan.txt")}),
            ("aufgabe_erledigt", {"aufgabe_id": 1, "ergebnis": "3 Sicherheit, 8 Gastro",
                                  "pruefung": "Dienstplan gelesen"}),
            "Im Dienstplan stehen drei Leute fuer die Sicherheit und acht fuer die Gastro.",
        ],
        transkripte=["Schau mal in den Dienstplan fuer Halle 45."])

    pipeline.wake()
    sprechen(pipeline)
    speaker.wait_until_idle(5)

    from jarvis.tasks.manager import Status

    # 1. Verstanden.
    assert pipeline.status.last_transcript == "Schau mal in den Dienstplan fuer Halle 45."
    # 2. Die Aufgabe steht auf erledigt -- und zwar mit Pruefvermerk.
    aufgabe = agent.tasks.get(1)
    assert aufgabe.status is Status.DONE
    assert aufgabe.verification == "Dienstplan gelesen"
    # 3. Geantwortet und gesprochen.
    assert "Sicherheit" in pipeline.status.last_reply
    assert speaker.engine.spoken
    # 4. Bereit fuer die naechste Runde.
    assert pipeline.state is State.LISTENING
    speaker.stop()


def test_werkzeugergebnis_fliesst_in_die_antwort(werkstatt):
    pipeline, agent, speaker = werkstatt.bauen(
        plan=[("datei_lesen", {"pfad": werkstatt.pfad("dienstplan.txt")}),
              "Es sind drei Leute fuer die Sicherheit eingeteilt."],
        transkripte=["Wie viele Leute sind eingeteilt?"])
    pipeline.wake()
    sprechen(pipeline)
    speaker.wait_until_idle(5)
    assert "drei Leute" in pipeline.status.last_reply
    speaker.stop()


def test_aufgabe_wird_mit_pruefvermerk_abgeschlossen(werkstatt):
    """Der Bearbeitungsstand kommt aus dem Aufgabenmanager, nicht aus dem Text."""
    pipeline, agent, speaker = werkstatt.bauen(
        plan=[("aufgabe_anlegen", {"titel": "Notiz schreiben"}),
              ("datei_schreiben", {"pfad": werkstatt.pfad("notiz.txt"),
                                   "inhalt": "Dresscode schwarz\n"}),
              ("aufgabe_erledigt", {"aufgabe_id": 1, "ergebnis": "Notiz liegt vor",
                                    "pruefung": "Datei geschrieben und nachgelesen"}),
              "Die Notiz ist geschrieben."],
        transkripte=["Schreib mir bitte eine Notiz."])
    pipeline.wake()
    sprechen(pipeline)
    speaker.wait_until_idle(5)

    from jarvis.tasks.manager import Status
    aufgabe = agent.tasks.get(1)
    assert aufgabe.status is Status.DONE
    assert aufgabe.verification == "Datei geschrieben und nachgelesen"
    # Die Datei gibt es wirklich.
    assert (werkstatt.dir / "notiz.txt").read_text("utf-8") == "Dresscode schwarz\n"
    speaker.stop()


def test_modell_kann_keine_aufgabe_ohne_pruefung_abschliessen(werkstatt):
    """Auch im vollstaendigen Ablauf greift die Regel."""
    pipeline, agent, speaker = werkstatt.bauen(
        plan=[("aufgabe_anlegen", {"titel": "Etwas"}),
              ("aufgabe_erledigt", {"aufgabe_id": 1, "ergebnis": "Fertig!",
                                    "pruefung": ""}),
              "Das habe ich nicht abschliessen koennen."],
        transkripte=["Mach das fertig."])
    pipeline.wake()
    sprechen(pipeline)
    speaker.wait_until_idle(5)

    from jarvis.tasks.manager import Status
    assert agent.tasks.get(1).status is Status.PLANNED   # nicht erledigt
    speaker.stop()


def test_kontext_bleibt_ueber_mehrere_runden(werkstatt):
    """Die zweite Aeusserung kennt die erste -- ohne neues Aktivierungswort."""
    pipeline, agent, speaker = werkstatt.bauen(
        plan=["Moin Noah.", "Du hattest nach dem Dienstplan gefragt."],
        transkripte=["Moin Jarvis.", "Worum ging es gerade?"])
    pipeline.wake()
    sprechen(pipeline)
    speaker.wait_until_idle(5)
    sprechen(pipeline)
    speaker.wait_until_idle(5)

    verlauf = [t.content for t in agent.short_term.recent()]
    assert "Moin Jarvis." in verlauf
    assert "Worum ging es gerade?" in verlauf
    assert agent.llm.runden == 2
    speaker.stop()


def test_fehlendes_recht_bricht_den_ablauf_nicht(werkstatt):
    """Ohne Loeschrecht wird nicht geloescht -- und JARVIS sagt es."""
    pipeline, agent, speaker = werkstatt.bauen(
        plan=[("datei_loeschen", {"pfad": werkstatt.pfad("dienstplan.txt")}),
              "Dafuer fehlt mir die Berechtigung."],
        transkripte=["Loesch den Dienstplan."])
    pipeline.wake()
    sprechen(pipeline)
    speaker.wait_until_idle(5)

    # Die Datei ist noch da.
    assert (werkstatt.dir / "dienstplan.txt").exists()
    assert "Berechtigung" in pipeline.status.last_reply
    assert pipeline.state is State.LISTENING
    speaker.stop()


def test_gedaechtnis_ueberdauert_das_gespraech(werkstatt):
    pipeline, agent, speaker = werkstatt.bauen(
        plan=[("fakt_merken", {"thema": "Noah", "aussage": "Dienstwagen",
                               "wert": "VW Caddy"}),
              "Gemerkt."],
        transkripte=["Merk dir, ich fahre einen VW Caddy."])
    pipeline.wake()
    sprechen(pipeline)
    speaker.wait_until_idle(5)
    assert agent.long_term.lookup("Noah", "Dienstwagen").value == "VW Caddy"
    # Und es steht im Systemtext der naechsten Runde.
    assert "VW Caddy" in agent.conversation.system_message()["content"]
    speaker.stop()


def test_proaktive_meldung_entsteht_aus_echtem_status(werkstatt):
    pipeline, agent, speaker = werkstatt.bauen(plan=["ok"], transkripte=["x"])
    aufgabe = agent.tasks.create("Angebot schicken")
    vorher = agent.task_snapshot()
    agent.tasks.start(aufgabe.id)
    agent.tasks.block(aufgabe.id, "Die Adresse fehlt mir noch")

    meldungen = agent.announce_task_changes(vorher)
    assert meldungen and "Adresse fehlt" in meldungen[0]

    pipeline._set_state(State.IDLE)
    assert pipeline.speak_pending_notifications() >= 1
    speaker.wait_until_idle(5)
    assert any("Adresse fehlt" in t for t in speaker.engine.spoken)
    speaker.stop()
