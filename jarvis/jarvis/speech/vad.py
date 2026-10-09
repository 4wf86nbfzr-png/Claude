"""Sprachaktivitaet und Zerlegung in Aeusserungen.

Reine Logik, ohne Audiobibliothek: hereingegeben werden Bloecke als Int16-Bytes
oder fertige Lautstaerkewerte. Deshalb laesst sich das Zeitverhalten -- der
heikelste Teil der Sprachbedienung -- ohne Mikrofon vollstaendig testen.

Der Zustandsautomat loest drei Probleme, die in der Praxis wehtun:

* **Ein Huesteln ist keine Aeusserung.** Erst ab ``min_speech`` Dauer gilt es
  als Sprache. Sonst loest jedes Tastenklicken eine Transkription aus.
* **Eine Pause im Satz ist kein Satzende.** Nach Sprache wird ``silence_timeout``
  abgewartet, bevor die Aeusserung geschlossen wird. Deutsche Saetze mit
  Nebensatz haben Pausen; wer zu knapp abschneidet, bekommt Halbsaetze.
* **Nichts laeuft unbegrenzt.** Nach ``max_utterance`` wird abgeschlossen, auch
  wenn weiter gesprochen wird -- sonst waechst der Puffer ins Unendliche.

RMS wird selbst gerechnet: ``audioop`` ist in Python 3.13 entfallen, und fuer
einen Mittelwert ueber Int16-Werte braucht es kein numpy.
"""

from __future__ import annotations

import array
import math
from dataclasses import dataclass, field
from enum import Enum


def rms(block: bytes) -> float:
    """Lautstaerke eines Int16-Blocks als Wert zwischen 0 und 1."""
    if not block:
        return 0.0
    # Ungerade Byteanzahl waere ein halber Abtastwert -- abschneiden.
    if len(block) % 2:
        block = block[:-1]
    if not block:
        return 0.0
    werte = array.array("h")
    werte.frombytes(block)
    summe = 0
    for wert in werte:
        summe += wert * wert
    return math.sqrt(summe / len(werte)) / 32768.0


class VoiceState(str, Enum):
    SILENCE = "stille"
    MAYBE_SPEECH = "vielleicht"   # laut, aber noch nicht lang genug
    SPEECH = "sprache"
    TRAILING = "nachlauf"         # war Sprache, jetzt still -- Satzende abwarten


class Event(str, Enum):
    NOTHING = "nichts"
    SPEECH_STARTED = "sprache_begonnen"
    UTTERANCE_READY = "aeusserung_fertig"
    TOO_LONG = "zu_lang"


@dataclass(slots=True)
class SegmenterConfig:
    #: Lautstaerke, ab der ein Block als Sprache gilt.
    threshold: float = 0.015
    #: So lange muss es laut sein, damit es als Sprache zaehlt.
    min_speech: float = 0.15
    #: So lange Stille beendet eine Aeusserung.
    silence_timeout: float = 0.8
    #: Harte Obergrenze einer Aeusserung.
    max_utterance: float = 30.0
    #: Dauer eines Blocks in Sekunden.
    block_duration: float = 0.03
    #: So viel Audio vor dem erkannten Beginn wird mitgenommen. Ohne diesen
    #: Vorlauf fehlt der erste Laut ("...oin" statt "Moin").
    preroll: float = 0.3


@dataclass(slots=True)
class Utterance:
    audio: bytes
    duration: float
    truncated: bool = False


class UtteranceSegmenter:
    """Zerlegt einen Audiostrom in Aeusserungen."""

    def __init__(self, config: SegmenterConfig | None = None) -> None:
        self.config = config or SegmenterConfig()
        self.state = VoiceState.SILENCE
        self._buffer: list[bytes] = []
        self._preroll: list[bytes] = []
        self._speech_duration = 0.0
        self._silence_duration = 0.0
        self._utterance_duration = 0.0
        self._max_preroll_blocks = max(
            1, int(self.config.preroll / self.config.block_duration))

    # -- Eingang --------------------------------------------------------
    def feed(self, block: bytes, *, level: float | None = None) -> Event:
        """Nimmt einen Audioblock und gibt zurueck, was passiert ist."""
        pegel = rms(block) if level is None else level
        laut = pegel >= self.config.threshold
        dauer = self.config.block_duration

        if self.state is VoiceState.SILENCE:
            # Vorlauf immer mitschneiden, damit der Satzanfang nicht fehlt.
            self._preroll.append(block)
            if len(self._preroll) > self._max_preroll_blocks:
                self._preroll.pop(0)
            if laut:
                self.state = VoiceState.MAYBE_SPEECH
                self._speech_duration = dauer
            return Event.NOTHING

        if self.state is VoiceState.MAYBE_SPEECH:
            self._preroll.append(block)
            if len(self._preroll) > self._max_preroll_blocks + 1:
                self._preroll.pop(0)
            if not laut:
                # War nur ein Geraeusch.
                self.state = VoiceState.SILENCE
                self._speech_duration = 0.0
                return Event.NOTHING
            self._speech_duration += dauer
            if self._speech_duration >= self.config.min_speech:
                self.state = VoiceState.SPEECH
                self._buffer = list(self._preroll)
                self._preroll = []
                self._utterance_duration = self._speech_duration
                self._silence_duration = 0.0
                return Event.SPEECH_STARTED
            return Event.NOTHING

        # SPEECH oder TRAILING: alles aufzeichnen.
        self._buffer.append(block)
        self._utterance_duration += dauer

        if self._utterance_duration >= self.config.max_utterance:
            return Event.TOO_LONG

        if laut:
            self.state = VoiceState.SPEECH
            self._silence_duration = 0.0
            return Event.NOTHING

        self.state = VoiceState.TRAILING
        self._silence_duration += dauer
        if self._silence_duration >= self.config.silence_timeout:
            return Event.UTTERANCE_READY
        return Event.NOTHING

    # -- Ausgang --------------------------------------------------------
    def take(self) -> Utterance:
        """Holt die fertige Aeusserung und setzt den Automaten zurueck."""
        audio = b"".join(self._buffer)
        dauer = self._utterance_duration
        gekuerzt = dauer >= self.config.max_utterance
        self.reset()
        return Utterance(audio=audio, duration=dauer, truncated=gekuerzt)

    def reset(self) -> None:
        self.state = VoiceState.SILENCE
        self._buffer = []
        self._preroll = []
        self._speech_duration = 0.0
        self._silence_duration = 0.0
        self._utterance_duration = 0.0

    @property
    def is_speaking(self) -> bool:
        """Ob gerade gesprochen wird -- fuer die Unterbrechung der Ausgabe."""
        return self.state in (VoiceState.SPEECH, VoiceState.TRAILING)

    @property
    def buffered_seconds(self) -> float:
        return self._utterance_duration
