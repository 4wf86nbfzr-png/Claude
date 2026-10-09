"""Tests der Aeusserungszerlegung.

Audio wird synthetisch erzeugt: laute und stille Bloecke in Int16. Damit laesst
sich das Zeitverhalten genau pruefen -- ohne Mikrofon, ohne Wartezeit.
"""

import array
import math

import pytest

from jarvis.speech.vad import (
    Event, SegmenterConfig, UtteranceSegmenter, VoiceState, rms,
)

BLOCK_SAMPLES = 480  # 30 ms bei 16 kHz


def laut(amplitude: int = 8000) -> bytes:
    """Ein Block mit einem Sinus -- wie Sprache ein Wechselsignal."""
    werte = array.array(
        "h", [int(amplitude * math.sin(2 * math.pi * 200 * i / 16000))
              for i in range(BLOCK_SAMPLES)])
    return werte.tobytes()


def still() -> bytes:
    return array.array("h", [0] * BLOCK_SAMPLES).tobytes()


def config(**kw) -> SegmenterConfig:
    kw.setdefault("block_duration", 0.03)
    kw.setdefault("min_speech", 0.09)      # drei Bloecke
    kw.setdefault("silence_timeout", 0.15)  # fuenf Bloecke
    return SegmenterConfig(**kw)


# -- Lautstaerkeberechnung ----------------------------------------------
def test_rms_von_stille_ist_null():
    assert rms(still()) == 0.0


def test_rms_von_lautem_signal():
    pegel = rms(laut(16000))
    assert 0.2 < pegel < 0.6


def test_rms_vertraegt_leere_und_ungerade_eingaben():
    """Ein halber Abtastwert darf nicht werfen -- Audiogeraete liefern das."""
    assert rms(b"") == 0.0
    assert rms(b"\x01") == 0.0
    assert rms(laut()[:-1]) > 0


# -- Zustandsautomat ----------------------------------------------------
def test_stille_loest_nichts_aus():
    s = UtteranceSegmenter(config())
    for _ in range(50):
        assert s.feed(still()) is Event.NOTHING
    assert s.state is VoiceState.SILENCE


def test_kurzes_geraeusch_ist_keine_aeusserung():
    """Ein Tastenklick soll keine Transkription ausloesen."""
    s = UtteranceSegmenter(config(min_speech=0.09))
    assert s.feed(laut()) is Event.NOTHING          # 30 ms
    assert s.state is VoiceState.MAYBE_SPEECH
    assert s.feed(still()) is Event.NOTHING          # wieder still
    assert s.state is VoiceState.SILENCE


def test_sprachbeginn_wird_erkannt():
    s = UtteranceSegmenter(config(min_speech=0.09))
    assert s.feed(laut()) is Event.NOTHING
    assert s.feed(laut()) is Event.NOTHING
    assert s.feed(laut()) is Event.SPEECH_STARTED
    assert s.state is VoiceState.SPEECH
    assert s.is_speaking


def test_aeusserung_endet_nach_stille():
    s = UtteranceSegmenter(config(min_speech=0.09, silence_timeout=0.15))
    for _ in range(3):
        s.feed(laut())
    for _ in range(4):
        assert s.feed(still()) is Event.NOTHING
    assert s.feed(still()) is Event.UTTERANCE_READY
    aeusserung = s.take()
    assert len(aeusserung.audio) > 0
    assert not aeusserung.truncated
    assert s.state is VoiceState.SILENCE


def test_pause_im_satz_beendet_die_aeusserung_nicht():
    """Deutsche Saetze mit Nebensatz haben Pausen -- die duerfen nicht trennen."""
    s = UtteranceSegmenter(config(min_speech=0.09, silence_timeout=0.15))
    for _ in range(3):
        s.feed(laut())
    # Kurze Pause, kuerzer als silence_timeout.
    for _ in range(3):
        assert s.feed(still()) is Event.NOTHING
    # Es geht weiter -- die Aeusserung laeuft.
    assert s.feed(laut()) is Event.NOTHING
    assert s.state is VoiceState.SPEECH
    # Erst die lange Pause schliesst sie.
    for _ in range(4):
        s.feed(still())
    assert s.feed(still()) is Event.UTTERANCE_READY


def test_vorlauf_ist_im_ergebnis_enthalten():
    """Ohne Vorlauf fehlt der erste Laut: '...oin' statt 'Moin'."""
    s = UtteranceSegmenter(config(min_speech=0.09, preroll=0.3))
    for _ in range(5):
        s.feed(still())       # wird als Vorlauf gemerkt
    for _ in range(3):
        s.feed(laut())
    for _ in range(6):
        s.feed(still())
    aeusserung = s.take()
    # Mehr Audio als nur die drei lauten Bloecke plus Nachlauf.
    bloecke = len(aeusserung.audio) / (BLOCK_SAMPLES * 2)
    assert bloecke > 9


def test_zu_lange_aeusserung_wird_abgeschnitten():
    s = UtteranceSegmenter(config(min_speech=0.03, max_utterance=0.3))
    ereignis = None
    for _ in range(40):
        ereignis = s.feed(laut())
        if ereignis is Event.TOO_LONG:
            break
    assert ereignis is Event.TOO_LONG
    aeusserung = s.take()
    assert aeusserung.truncated
    assert aeusserung.duration >= 0.3


def test_zuruecksetzen_leert_den_puffer():
    s = UtteranceSegmenter(config(min_speech=0.03))
    s.feed(laut())
    s.feed(laut())
    s.reset()
    assert s.state is VoiceState.SILENCE
    assert s.buffered_seconds == 0.0
    assert not s.is_speaking


def test_mehrere_aeusserungen_hintereinander():
    """Nach dem Abholen muss die naechste Aeusserung sauber beginnen."""
    s = UtteranceSegmenter(config(min_speech=0.09, silence_timeout=0.15))
    for runde in range(2):
        for _ in range(3):
            s.feed(laut())
        ereignis = None
        for _ in range(6):
            ereignis = s.feed(still())
            if ereignis is Event.UTTERANCE_READY:
                break
        assert ereignis is Event.UTTERANCE_READY, f"Runde {runde}"
        assert s.take().audio


def test_pegel_kann_uebergeben_werden():
    """Fuer Geraete, die den Pegel schon liefern -- dann wird nicht gerechnet."""
    s = UtteranceSegmenter(config(min_speech=0.03))
    assert s.feed(b"", level=0.5) is Event.NOTHING
    assert s.feed(b"", level=0.5) is Event.SPEECH_STARTED


def test_schwelle_wird_beachtet():
    s = UtteranceSegmenter(config(threshold=0.5, min_speech=0.03))
    # Mittellautes Signal bleibt unter der hohen Schwelle.
    for _ in range(10):
        assert s.feed(laut(4000)) is Event.NOTHING
    assert s.state is VoiceState.SILENCE
