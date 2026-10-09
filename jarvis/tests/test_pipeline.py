"""Tests der Sprachpipeline mit Ersatzteilen.

Mikrofon, Whisper und Sprachausgabe sind ersetzt: Audio kommt aus einer Liste,
die Erkennung gibt vorgegebene Texte zurueck, die Ausgabe schreibt ins
Protokoll. Damit ist der Zustandsautomat -- Aktivierung, Gespraechsfortsetzung,
Dazwischenreden, Rueckfall auf untaetig -- wirklich pruefbar, ohne Hardware.
"""

import array
import math
import threading

import pytest

from jarvis.agent import Agent
from jarvis.config import Config
from jarvis.llm.client import Chunk
from jarvis.memory.db import Database
from jarvis.notify.manager import NotifyConfig, Priority
from jarvis.permissions import Policy, Scope
from jarvis.speech.audio import ListSource
from jarvis.speech.pipeline import State, VoicePipeline
from jarvis.speech.stt import NullSTT, STTError
from jarvis.speech.tts import NullEngine, Speaker
from jarvis.speech.wakeword import ManualDetector, ThresholdGate
from jarvis.tools.registry import ToolRegistry

BLOCK = 480  # 30 ms bei 16 kHz


def laut() -> bytes:
    return array.array("h", [int(9000 * math.sin(2 * math.pi * 200 * i / 16000))
                             for i in range(BLOCK)]).tobytes()


def still() -> bytes:
    return array.array("h", [0] * BLOCK).tobytes()


class ScriptedLLM:
    def __init__(self, antworten: list[str]) -> None:
        self.antworten = list(antworten)
        self.gefragt: list[str] = []

    def chat(self, messages, *, tools=None, cancel=None):
        letzte = [m for m in messages if m["role"] == "user"]
        if letzte:
            self.gefragt.append(letzte[-1]["content"])
        text = self.antworten.pop(0) if self.antworten else "Alles klar."
        # Stueckweise, wie beim echten Streamen.
        for wort in text.split(" "):
            if cancel is not None and cancel.is_set():
                from jarvis.llm.client import LLMCancelled
                raise LLMCancelled("abgebrochen")
            yield Chunk(text=wort + " ")
        yield Chunk(done=True)


@pytest.fixture()
def werkstatt():
    """Baut eine Pipeline mit Ersatzteilen. Audio wird je Test gesetzt."""
    cfg = Config()
    cfg.policy = Policy(granted=frozenset({Scope.READ}))
    cfg.notify = NotifyConfig(min_gap_seconds=0, quiet_hours=(0, 0))
    cfg.audio.block_ms = 30
    cfg.stt.silence_timeout = 0.15      # fuenf Bloecke
    cfg.stt.max_utterance_seconds = 30.0
    cfg.wake.conversation_timeout = 1.0
    db = Database()

    def bauen(audio_bloecke, texte, antworten=None, stt=None):
        llm = ScriptedLLM(antworten or ["Moin Noah."])
        agent = Agent(cfg, db, llm, registry=ToolRegistry(cfg.policy))
        speaker = Speaker(NullEngine())
        pipeline = VoicePipeline(
            cfg, agent,
            audio=ListSource(audio_bloecke),
            detector=ManualDetector(),
            stt=stt if stt is not None else NullSTT(antworten=texte),
            speaker=speaker,
        )
        # Die Zerlegung muss zur Testaufloesung passen.
        pipeline.segmenter.config.min_speech = 0.09
        return pipeline, agent, llm, speaker

    yield bauen
    db.close()


def durchlaufen(pipeline, bloecke):
    """Fuettert Bloecke direkt in die Pipeline, ohne eigenen Faden.

    So bleibt der Test deterministisch -- kein Warten auf Faeden.
    """
    for block in bloecke:
        pipeline._handle_block(block)
        pipeline._check_timeout()


# -- Aktivierung --------------------------------------------------------
def test_untaetig_ignoriert_sprache(werkstatt):
    """Ohne Aktivierungswort wird nicht zugehoert."""
    pipeline, agent, llm, _ = werkstatt([], ["sollte nicht erkannt werden"])
    durchlaufen(pipeline, [laut()] * 20)
    assert pipeline.state is State.IDLE
    assert llm.gefragt == []
    assert pipeline.status.utterances == 0


def test_aktivierung_oeffnet_das_gespraech(werkstatt):
    pipeline, _, _, _ = werkstatt([], [])
    pipeline.wake()
    assert pipeline.state is State.LISTENING


def test_aeusserung_wird_verarbeitet(werkstatt):
    pipeline, agent, llm, speaker = werkstatt([], ["Wie ist das Wetter?"])
    speaker.start()
    pipeline.wake()
    durchlaufen(pipeline, [laut()] * 4 + [still()] * 7)
    speaker.wait_until_idle(5)
    assert llm.gefragt == ["Wie ist das Wetter?"]
    assert pipeline.status.last_transcript == "Wie ist das Wetter?"
    assert pipeline.status.utterances == 1
    assert speaker.engine.spoken  # es wurde etwas gesprochen
    speaker.stop()


def test_zweite_aeusserung_ohne_aktivierungswort(werkstatt):
    """Der Kern der Gespraechsfaehigkeit: kein 'Hey Jarvis' vor jedem Satz."""
    pipeline, agent, llm, speaker = werkstatt(
        [], ["Erste Frage", "Zweite Frage"], antworten=["Antwort eins.", "Antwort zwei."])
    speaker.start()
    pipeline.wake()
    durchlaufen(pipeline, [laut()] * 4 + [still()] * 7)
    speaker.wait_until_idle(5)
    assert pipeline.state is State.LISTENING
    # Direkt weiter -- ohne neue Aktivierung.
    durchlaufen(pipeline, [laut()] * 4 + [still()] * 7)
    speaker.wait_until_idle(5)
    assert llm.gefragt == ["Erste Frage", "Zweite Frage"]
    speaker.stop()


def test_gespraech_schliesst_nach_stille(werkstatt):
    """Sonst wuerde JARVIS jedes Gespraech im Raum beantworten."""
    uhr = {"t": 0.0}
    pipeline, _, _, _ = werkstatt([], [])
    pipeline._clock = lambda: uhr["t"]
    pipeline.wake()
    assert pipeline.state is State.LISTENING
    uhr["t"] = 1.5   # mehr als conversation_timeout = 1.0
    pipeline._check_timeout()
    assert pipeline.state is State.IDLE


def test_nach_dem_schliessen_wird_wieder_ignoriert(werkstatt):
    uhr = {"t": 0.0}
    pipeline, agent, llm, _ = werkstatt([], ["nicht verarbeiten"])
    pipeline._clock = lambda: uhr["t"]
    pipeline.wake()
    uhr["t"] = 2.0
    pipeline._check_timeout()
    durchlaufen(pipeline, [laut()] * 10)
    assert llm.gefragt == []


# -- Dazwischenreden ----------------------------------------------------
def test_dazwischenreden_bricht_die_ausgabe_ab(werkstatt):
    pipeline, agent, llm, speaker = werkstatt([], [])
    speaker.start()
    pipeline._set_state(State.SPEAKING)
    speaker.say("ein langer alter Satz")
    speaker.say("und noch einer")
    # Der Nutzer faengt an zu sprechen.
    for _ in range(4):
        pipeline._handle_block(laut())
    assert pipeline.state is State.LISTENING
    assert agent.cancel.is_set()
    speaker.stop()


def test_nach_dem_abbruch_bleibt_kein_satzrest(werkstatt):
    """Ein halber Satz darf nach der Unterbrechung nicht nachkommen."""
    pipeline, agent, _, speaker = werkstatt([], [])
    speaker.start()
    pipeline.chunker.feed("Ein angefangener")
    pipeline._set_state(State.SPEAKING)
    for _ in range(4):
        pipeline._handle_block(laut())
    assert pipeline.chunker.flush() is None
    speaker.stop()


def test_dringende_ansage_ueberlebt_den_abbruch(werkstatt):
    pipeline, _, _, speaker = werkstatt([], [])
    speaker.start()
    speaker.say("unwichtig")
    speaker.say("Berechtigung fehlt", urgent=True)
    verworfen = speaker.interrupt()
    assert verworfen >= 1
    assert speaker.pending >= 1
    speaker.stop()


# -- Fehler ehrlich melden ----------------------------------------------
def test_fehler_der_spracherkennung_wird_gemeldet(werkstatt):
    class KaputteSTT:
        def available(self):
            return False, "Modell fehlt"

        def transcribe(self, audio, sample_rate=16000):
            raise STTError("Modelldatei fehlt: ggml-large-v3.bin")

    pipeline, agent, llm, speaker = werkstatt([], [], stt=KaputteSTT())
    speaker.start()
    pipeline.wake()
    durchlaufen(pipeline, [laut()] * 4 + [still()] * 7)
    # Kein erfundenes Transkript, kein Modellaufruf.
    assert llm.gefragt == []
    assert "ggml-large-v3.bin" in pipeline.status.last_error
    dringend = [n for n in agent.notifications.history()
                if n.priority is Priority.URGENT]
    assert dringend and "Spracherkennung" in dringend[0].text
    # Und das Gespraech bleibt offen, statt haengen zu bleiben.
    assert pipeline.state is State.LISTENING
    speaker.stop()


def test_leeres_transkript_loest_keine_antwort_aus(werkstatt):
    """Ein Rascheln soll keine Antwort erzeugen."""
    pipeline, agent, llm, speaker = werkstatt([], ["[BLANK_AUDIO]"])
    # NullSTT gibt den Text unveraendert; leer erkennt die echte Reinigung.
    pipeline.stt = NullSTT(antworten=[""])
    speaker.start()
    pipeline.wake()
    durchlaufen(pipeline, [laut()] * 4 + [still()] * 7)
    assert llm.gefragt == []
    assert pipeline.status.utterances == 0
    assert pipeline.state is State.LISTENING
    speaker.stop()


# -- Proaktives Sprechen ------------------------------------------------
def test_ansagen_nur_wenn_jarvis_nicht_beschaeftigt_ist(werkstatt):
    pipeline, agent, _, speaker = werkstatt([], [])
    speaker.start()
    agent.notifications.push("Aufgabe erledigt.", Priority.IMPORTANT)

    pipeline._set_state(State.LISTENING)
    assert pipeline.speak_pending_notifications() == 0   # nicht dazwischenreden

    pipeline._set_state(State.IDLE)
    assert pipeline.speak_pending_notifications() == 1
    speaker.wait_until_idle(5)
    assert "Aufgabe erledigt." in speaker.engine.spoken
    speaker.stop()


def test_ansage_wird_nur_einmal_gesprochen(werkstatt):
    pipeline, agent, _, speaker = werkstatt([], [])
    speaker.start()
    agent.notifications.push("Fertig.", Priority.IMPORTANT)
    pipeline._set_state(State.IDLE)
    assert pipeline.speak_pending_notifications() == 1
    assert pipeline.speak_pending_notifications() == 0
    speaker.stop()


# -- Zustandsmeldungen und Gesundheit -----------------------------------
def test_zustandswechsel_wird_gemeldet(werkstatt):
    pipeline, _, _, _ = werkstatt([], [])
    gesehen: list[State] = []
    pipeline.on_state_change = gesehen.append
    pipeline.wake()
    pipeline._set_state(State.PROCESSING)
    assert gesehen == [State.LISTENING, State.PROCESSING]


def test_fehler_im_dashboard_kippt_die_pipeline_nicht(werkstatt):
    pipeline, _, _, _ = werkstatt([], [])
    pipeline.on_state_change = lambda s: 1 / 0
    pipeline.wake()   # darf nicht werfen
    assert pipeline.state is State.LISTENING


def test_health_nennt_alle_bausteine(werkstatt):
    pipeline, _, _, speaker = werkstatt([], [])
    speaker.start()
    zustand = pipeline.health()
    for schluessel in ("state", "mikrofon", "aktivierungswort",
                       "spracherkennung", "sprachausgabe"):
        assert schluessel in zustand
    speaker.stop()


# -- Sperrzeit des Aktivierungsworts ------------------------------------
def test_aktivierungswort_loest_nicht_mehrfach_aus():
    """Ein 'Hey Jarvis' klingt im Puffer nach -- es darf nur einmal zaehlen."""
    uhr = {"t": 0.0}
    gate = ThresholdGate(threshold=0.6, cooldown=2.0, clock=lambda: uhr["t"])
    assert gate.check(0.9) is True
    uhr["t"] = 0.5
    assert gate.check(0.9) is False     # Sperrzeit
    uhr["t"] = 3.0
    assert gate.check(0.9) is True


def test_zu_leises_aktivierungswort_zaehlt_nicht():
    gate = ThresholdGate(threshold=0.6)
    assert gate.check(0.4) is False
