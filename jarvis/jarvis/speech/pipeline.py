"""Die Sprachpipeline.

Mikrofon -> Aktivierungswort -> Zerlegung -> Whisper -> Agent -> Sprachausgabe.

Der ganze Ablauf haengt an einem Zustand:

* ``IDLE`` -- es wird nur auf das Aktivierungswort gehorcht.
* ``LISTENING`` -- das Gespraech ist offen, jede Aeusserung wird verarbeitet,
  *ohne* dass das Aktivierungswort wiederholt werden muss.
* ``PROCESSING`` -- Whisper und Modell arbeiten.
* ``SPEAKING`` -- JARVIS redet. Beginnt der Nutzer hier zu sprechen, wird die
  Ausgabe abgebrochen (Barge-in) und die neue Aeusserung aufgenommen.
* ``ERROR`` -- eine Komponente ist ausgefallen; der Grund steht in ``last_error``.

Nach ``conversation_timeout`` ohne Aeusserung fallt der Zustand auf ``IDLE``
zurueck -- dann braucht es wieder das Aktivierungswort. Ohne diesen Rueckfall
wuerde JARVIS jedes Gespraech im Raum mithoeren und beantworten.

Die Pipeline laeuft in einem eigenen Faden und blockiert das Dashboard nicht.

**Als Ganzes nicht getestet** -- dafuer braucht es Mikrofon, Whisper-Modell und
Sprachausgabe. Der Zustandsautomat ist mit Ersatzteilen (Listen-Audioquelle,
Ersatzerkennung, stumme Ausgabe) getestet; siehe tests/test_pipeline.py.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from enum import Enum

from ..agent import Agent
from ..config import Config
from ..logging_setup import get_logger
from ..notify.manager import Priority
from .audio import AudioError, AudioSource
from .chunking import ChunkConfig, SentenceBuffer
from .stt import STTError
from .vad import Event, SegmenterConfig, UtteranceSegmenter
from .tts import Speaker

log = get_logger("pipeline")


class State(str, Enum):
    IDLE = "untaetig"
    LISTENING = "zuhoeren"
    PROCESSING = "verarbeiten"
    SPEAKING = "sprechen"
    ERROR = "fehler"


@dataclass(slots=True)
class PipelineStatus:
    """Was das Dashboard anzeigt."""

    state: State = State.IDLE
    level: float = 0.0
    last_transcript: str = ""
    last_reply: str = ""
    last_error: str | None = None
    utterances: int = 0
    #: Sekunden von Aeusserungsende bis zum ersten gesprochenen Wort.
    last_latency: float = 0.0


class VoicePipeline:
    """Verbindet alle Sprachbausteine zu einem laufenden Gespraech."""

    def __init__(self, config: Config, agent: Agent, *, audio: AudioSource,
                 detector, stt, speaker: Speaker, clock=time.monotonic) -> None:
        self.config = config
        self.agent = agent
        self.audio = audio
        self.detector = detector
        self.stt = stt
        self.speaker = speaker
        self._clock = clock

        self.segmenter = UtteranceSegmenter(SegmenterConfig(
            threshold=config.audio.vad_threshold,
            silence_timeout=config.stt.silence_timeout,
            max_utterance=config.stt.max_utterance_seconds,
            block_duration=config.audio.block_ms / 1000,
        ))
        self.chunker = SentenceBuffer(ChunkConfig())
        self.status = PipelineStatus()
        self._state = State.IDLE
        self._last_activity = 0.0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.RLock()
        #: Wird bei jedem Zustandswechsel gerufen -- fuers Dashboard.
        self.on_state_change = None

    # -- Zustand --------------------------------------------------------
    @property
    def state(self) -> State:
        with self._lock:
            return self._state

    def _set_state(self, neu: State, *, error: str | None = None) -> None:
        with self._lock:
            if self._state is neu and error is None:
                return
            self._state = neu
            self.status.state = neu
            if error is not None:
                self.status.last_error = error
        log.debug("Zustand: %s%s", neu.value, f" ({error})" if error else "")
        if self.on_state_change is not None:
            try:
                self.on_state_change(neu)
            except Exception:  # noqa: BLE001 -- das Dashboard darf nichts kippen
                log.exception("Zustandsmeldung an das Dashboard gescheitert")

    # -- Betrieb --------------------------------------------------------
    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        self.speaker.start()
        try:
            self.audio.start()
        except AudioError as exc:
            self._set_state(State.ERROR, error=str(exc))
            self.agent.notifications.push(
                f"Das Mikrofon ist nicht verfuegbar: {exc}", Priority.URGENT,
                dedupe_key="mikrofon")
            raise
        self._thread = threading.Thread(target=self._run, name="jarvis-voice",
                                        daemon=True)
        self._thread.start()
        log.info("Sprachpipeline laeuft.")

    def stop(self) -> None:
        self._stop.set()
        self.speaker.interrupt()
        self.audio.stop()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None
        self.speaker.stop()
        self._set_state(State.IDLE)
        log.info("Sprachpipeline beendet.")

    def wake(self) -> None:
        """Startet ein Gespraech von Hand -- Dashboard oder Tastendruck."""
        if hasattr(self.detector, "trigger"):
            self.detector.trigger()
        self._open_conversation()

    def _open_conversation(self) -> None:
        self._last_activity = self._clock()
        self.segmenter.reset()
        self._set_state(State.LISTENING)

    # -- Hauptschleife --------------------------------------------------
    def _run(self) -> None:
        try:
            for block in self.audio.blocks():
                if self._stop.is_set():
                    return
                self._handle_block(block)
                self._check_timeout()
        except Exception as exc:  # noqa: BLE001
            log.exception("Sprachpipeline abgestuerzt")
            self._set_state(State.ERROR, error=str(exc))
            self.agent.notifications.push(
                f"Die Sprachsteuerung ist ausgefallen: {exc}", Priority.URGENT,
                dedupe_key="pipeline-absturz")

    def _handle_block(self, block: bytes) -> None:
        from .vad import rms
        pegel = rms(block)
        self.status.level = pegel

        if self.state is State.IDLE:
            if self.detector.feed(block) is not None:
                log.info("Aktivierungswort erkannt -- Gespraech offen.")
                self._open_conversation()
            return

        if self.state is State.PROCESSING:
            # Waehrend das Modell arbeitet, wird weiter aufgezeichnet: der
            # Nutzer soll nicht warten muessen, bis JARVIS fertig gedacht hat.
            self.segmenter.feed(block)
            return

        ereignis = self.segmenter.feed(block)

        # Barge-in: JARVIS redet und der Nutzer faengt an.
        if self.state is State.SPEAKING and ereignis is Event.SPEECH_STARTED:
            log.info("Nutzer spricht dazwischen -- Ausgabe wird abgebrochen.")
            self.agent.interrupt()
            verworfen = self.speaker.interrupt()
            self.chunker.reset()
            log.debug("%d wartende Abschnitte verworfen.", verworfen)
            self._set_state(State.LISTENING)
            return

        if ereignis in (Event.UTTERANCE_READY, Event.TOO_LONG):
            aeusserung = self.segmenter.take()
            self._last_activity = self._clock()
            if ereignis is Event.TOO_LONG:
                log.info("Aeusserung bei %.0fs abgeschnitten.", aeusserung.duration)
            self._process(aeusserung.audio, aeusserung.duration)

    def _check_timeout(self) -> None:
        """Faellt nach Stille auf IDLE zurueck.

        Ohne diesen Rueckfall wuerde JARVIS jedes Gespraech im Raum
        beantworten -- das Aktivierungswort waere wirkungslos.
        """
        if self.state not in (State.LISTENING,):
            return
        if self._clock() - self._last_activity < self.config.wake.conversation_timeout:
            return
        log.info("Gespraech nach %.0fs Stille geschlossen.",
                 self.config.wake.conversation_timeout)
        self.detector.reset()
        self.segmenter.reset()
        self._set_state(State.IDLE)

    # -- Verarbeitung ---------------------------------------------------
    def _process(self, audio: bytes, dauer: float) -> None:
        begin = self._clock()
        self._set_state(State.PROCESSING)
        try:
            transkript = self.stt.transcribe(audio, self.config.audio.sample_rate)
        except STTError as exc:
            log.error("Spracherkennung gescheitert: %s", exc)
            self._set_state(State.ERROR, error=str(exc))
            self.agent.notifications.push(
                f"Ich habe dich nicht verstanden -- die Spracherkennung meldet: {exc}",
                Priority.URGENT, dedupe_key="stt-fehler")
            self._set_state(State.LISTENING)
            return

        if transkript.empty or not transkript.text.strip():
            log.debug("Nichts Verstaendliches in %.1fs Audio.", dauer)
            self._set_state(State.LISTENING)
            return

        self.status.last_transcript = transkript.text
        self.status.utterances += 1
        log.info("Verstanden: %s", transkript.text)

        self.chunker.reset()
        self._set_state(State.SPEAKING)
        erster_ton: float | None = None

        def auf_text(stueck: str) -> None:
            """Gibt fertige Abschnitte sofort an die Sprachausgabe."""
            nonlocal erster_ton
            for abschnitt in self.chunker.feed(stueck):
                if erster_ton is None:
                    erster_ton = self._clock()
                self.speaker.say(abschnitt)

        antwort = self.agent.respond(transkript.text, on_text=auf_text)

        if antwort.cancelled:
            self.chunker.reset()
            self._set_state(State.LISTENING)
            return

        if rest := self.chunker.flush():
            if erster_ton is None:
                erster_ton = self._clock()
            self.speaker.say(rest)

        self.status.last_reply = antwort.text
        if erster_ton is not None:
            self.status.last_latency = erster_ton - begin

        # Warten, bis ausgesprochen -- sonst ueberlagern sich Antworten.
        self.speaker.wait_until_idle(timeout=120)
        self._last_activity = self._clock()
        self._set_state(State.LISTENING)

    # -- Proaktives Sprechen --------------------------------------------
    def speak_pending_notifications(self) -> int:
        """Spricht, was der Benachrichtigungsmanager freigibt.

        Wird von der Hauptschleife regelmaessig gerufen. Waehrend JARVIS
        zuhoert oder verarbeitet, wird nichts angesagt -- das waere ein
        Dazwischenreden in der falschen Richtung.
        """
        if self.state in (State.LISTENING, State.PROCESSING, State.SPEAKING):
            return 0
        gesprochen = 0
        while (note := self.agent.notifications.next_to_speak()) is not None:
            self.speaker.say(note.text, urgent=note.priority >= Priority.URGENT)
            self.agent.notifications.mark_spoken(note)
            gesprochen += 1
        return gesprochen

    def health(self) -> dict:
        """Zustand aller Bausteine -- fuer Dashboard und Diagnose."""
        return {
            "state": self.state.value,
            "mikrofon": self.audio.available(),
            "aktivierungswort": self.detector.available(),
            "spracherkennung": self.stt.available(),
            "sprachausgabe": self.speaker.engine.available(),
            "sprachausgabe_fehler": self.speaker.last_error,
            "aeusserungen": self.status.utterances,
            "letzter_fehler": self.status.last_error,
            "letzte_latenz": round(self.status.last_latency, 2),
        }
