"""Tests der Sprachausgabe.

Der Ton selbst laesst sich hier nicht pruefen -- es gibt keine Audioausgabe.
Geprueft wird das, was ueber die Brauchbarkeit entscheidet: dass eine
Unterbrechung wirklich unterbricht, dass Dringendes sie ueberlebt und dass
ein Fehler in der Ausgabe den Faden nicht umbringt.
"""

import threading
import time

import pytest

from jarvis.config import TTSConfig
from jarvis.speech.tts import (
    NullEngine, PiperEngine, SayEngine, Speaker, TTSError, build_engine,
)


class LangsameEngine:
    """Spricht eine Weile und sieht dabei nur traege nach dem Stoppsignal --
    so wie ein echter Wiedergabeprozess."""

    name = "langsam"

    def __init__(self, dauer: float = 0.6, takt: float = 0.15) -> None:
        self.dauer = dauer
        self.takt = takt
        self.abgebrochen: list[str] = []
        self.vollstaendig: list[str] = []
        self.begonnen = threading.Event()

    def available(self):
        return True, "Testausgabe"

    def speak(self, text: str, stop: threading.Event) -> bool:
        self.begonnen.set()
        ende = time.monotonic() + self.dauer
        while time.monotonic() < ende:
            time.sleep(self.takt)
            if stop.is_set():
                self.abgebrochen.append(text)
                return False
        self.vollstaendig.append(text)
        return True


class KaputteEngine:
    name = "kaputt"

    def available(self):
        return True, "test"

    def speak(self, text, stop):
        raise TTSError("Wiedergabe nicht moeglich")


# -- Warteschlange ------------------------------------------------------
def test_abschnitte_werden_der_reihe_nach_gesprochen():
    sp = Speaker(NullEngine())
    sp.start()
    sp.say("Erstens.")
    sp.say("Zweitens.")
    assert sp.wait_until_idle(5)
    assert sp.engine.spoken == ["Erstens.", "Zweitens."]
    sp.stop()


def test_leerer_text_wird_nicht_gesprochen():
    sp = Speaker(NullEngine())
    sp.start()
    sp.say("   ")
    sp.wait_until_idle(2)
    assert sp.engine.spoken == []
    sp.stop()


# -- Unterbrechung: der wichtigste Fall ---------------------------------
def test_unterbrechung_stoppt_die_laufende_ausgabe():
    """Dazwischenreden muss sofort wirken, sonst redet JARVIS ueber den Nutzer.

    Mit einer traege abfragenden Ausgabe: wird das Stoppsignal gleich nach dem
    Setzen wieder freigegeben, verpasst sie es -- genau dieser Fehler ist hier
    festgehalten.
    """
    engine = LangsameEngine(dauer=1.0, takt=0.2)
    sp = Speaker(engine)
    sp.start()
    sp.say("ein langer alter Satz")
    assert engine.begonnen.wait(2), "Ausgabe hat nicht begonnen"
    sp.interrupt()
    assert sp.wait_until_idle(5)
    assert engine.abgebrochen == ["ein langer alter Satz"]
    assert engine.vollstaendig == []
    sp.stop()


def test_nach_der_unterbrechung_wird_wieder_gesprochen():
    """Das Stoppsignal darf nicht dauerhaft haengen bleiben."""
    engine = LangsameEngine(dauer=0.3, takt=0.05)
    sp = Speaker(engine)
    sp.start()
    sp.say("alter Satz")
    assert engine.begonnen.wait(2)
    sp.interrupt()
    sp.wait_until_idle(5)
    engine.begonnen.clear()
    sp.say("neuer Satz")
    assert sp.wait_until_idle(5)
    assert engine.vollstaendig == ["neuer Satz"]
    sp.stop()


def test_wartende_abschnitte_werden_verworfen():
    sp = Speaker(NullEngine())
    sp.say("eins")
    sp.say("zwei")
    sp.say("drei")
    verworfen = sp.interrupt()
    assert verworfen == 3
    assert sp.pending == 0


def test_dringendes_ueberlebt_die_unterbrechung():
    """Eine fehlende Berechtigung muss gesagt werden, auch nach dem Abbruch."""
    sp = Speaker(NullEngine())
    sp.say("unwichtig")
    sp.say("Berechtigung fehlt", urgent=True)
    sp.say("auch unwichtig")
    verworfen = sp.interrupt()
    assert verworfen == 2
    sp.start()
    assert sp.wait_until_idle(5)
    assert sp.engine.spoken == ["Berechtigung fehlt"]
    sp.stop()


# -- Robustheit ---------------------------------------------------------
def test_fehler_in_der_ausgabe_toetet_den_faden_nicht():
    sp = Speaker(KaputteEngine())
    sp.start()
    sp.say("etwas")
    assert sp.wait_until_idle(5)
    assert "nicht moeglich" in sp.last_error
    # Der Faden lebt noch und nimmt weiter an.
    sp.say("noch etwas")
    assert sp.wait_until_idle(5)
    sp.stop()


def test_mehrfaches_starten_erzeugt_nur_einen_faden():
    sp = Speaker(NullEngine())
    sp.start()
    erster = sp._thread
    sp.start()
    assert sp._thread is erster
    sp.stop()


# -- Auswahl der Ausgabe ------------------------------------------------
def test_ohne_verfuegbare_ausgabe_wird_es_still_statt_laut_falsch():
    """Lieber stumm als eine Ausgabe vortaeuschen, die nicht existiert."""
    engine = build_engine(TTSConfig(engine="piper",
                                    voice_path="/gibtsnicht/stimme.onnx"))
    assert engine.name in ("none", "say")   # kein Piper ohne Stimmdatei


def test_none_bleibt_none():
    assert build_engine(TTSConfig(engine="none")).name == "none"


def test_piper_meldet_fehlende_stimme_mit_pfad():
    engine = PiperEngine(TTSConfig(voice_path="/gibtsnicht/stimme.onnx"))
    ok, grund = engine.available()
    assert not ok
    assert "stimme.onnx" in grund or "nicht im Pfad" in grund


def test_say_ausserhalb_macos_meldet_das():
    import platform
    ok, grund = SayEngine(TTSConfig()).available()
    if platform.system() != "Darwin":
        assert not ok and "macOS" in grund
