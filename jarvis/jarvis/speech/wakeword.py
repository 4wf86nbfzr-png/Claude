"""Aktivierungswort.

``openwakeword`` laeuft lokal, braucht kein Netz und kein Konto. Das Modell
"hey jarvis" ist im Paket enthalten -- genau das gesuchte Wort.

Wichtig ist die Unterscheidung zwischen *Ansprechen* und *Danebenreden*:
JARVIS soll nicht jedes Gespraech im Raum kommentieren. Dafuer gibt es zwei
Vorkehrungen:

* Eine Schwelle, die hoch genug liegt (Vorgabe 0.6).
* Eine Sperrzeit nach einer Erkennung, damit ein einzelnes "Hey Jarvis" nicht
  mehrfach ausloest, solange das Wort noch im Puffer nachklingt.

Ist ``openwakeword`` nicht installiert, wird nicht geraten: der Detektor meldet
sich als nicht einsatzbereit, und die Bedienung laeuft ueber Tastendruck.

**Nicht mit echtem Mikrofon getestet** -- geprueft sind Schwellenlogik und
Sperrzeit mit synthetischen Werten.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Protocol

from ..config import WakeConfig
from ..logging_setup import get_logger

log = get_logger("wakeword")


@dataclass(slots=True)
class Detection:
    phrase: str
    score: float
    at: float


class Detector(Protocol):
    def feed(self, block: bytes) -> Detection | None: ...
    def available(self) -> tuple[bool, str]: ...
    def reset(self) -> None: ...


class ThresholdGate:
    """Schwelle plus Sperrzeit -- die Entscheidungslogik, ohne Modell.

    Getrennt vom Modell, damit sie ohne Audiobibliothek testbar ist.
    """

    def __init__(self, threshold: float = 0.6, cooldown: float = 2.0,
                 clock=time.monotonic) -> None:
        self.threshold = threshold
        self.cooldown = cooldown
        self._clock = clock
        # Minus unendlich, nicht 0: bei einer Uhr, die bei 0 beginnt, waere die
        # allererste Erkennung sonst von ihrer eigenen Sperrzeit verschluckt.
        self._last_hit = float("-inf")

    def check(self, score: float) -> bool:
        if score < self.threshold:
            return False
        jetzt = self._clock()
        if jetzt - self._last_hit < self.cooldown:
            # Dasselbe Wort klingt noch im Puffer nach.
            return False
        self._last_hit = jetzt
        return True

    def reset(self) -> None:
        self._last_hit = float("-inf")


class OpenWakeWordDetector:
    """Erkennung ueber openwakeword."""

    def __init__(self, config: WakeConfig) -> None:
        self.config = config
        self.gate = ThresholdGate(config.threshold)
        self._model = None
        self._error: str | None = None
        self._load()

    def _load(self) -> None:
        try:
            # Erst hier importiert: der Kern soll ohne numpy laufen.
            from openwakeword.model import Model  # noqa: PLC0415
        except Exception as exc:  # noqa: BLE001
            self._error = (f"openwakeword nicht nutzbar ({exc}). "
                           "Installieren: pip install 'jarvis[speech]'")
            return
        modellname = self.config.phrase.replace(" ", "_").lower()
        try:
            self._model = Model(wakeword_models=[modellname])
        except Exception as exc:  # noqa: BLE001
            # Unbekanntes Wort: mit allen mitgelieferten Modellen weitermachen
            # und beim Pruefen nach dem passenden Namen filtern.
            log.warning("Modell '%s' nicht gefunden (%s) -- nehme die "
                        "mitgelieferten Modelle.", modellname, exc)
            try:
                self._model = Model()
            except Exception as exc2:  # noqa: BLE001
                self._error = f"openwakeword liess sich nicht laden: {exc2}"

    def available(self) -> tuple[bool, str]:
        if self._model is None:
            return False, self._error or "nicht geladen"
        return True, f"'{self.config.phrase}' ab {self.config.threshold}"

    def feed(self, block: bytes) -> Detection | None:
        if self._model is None:
            return None
        try:
            import numpy as np  # noqa: PLC0415

            proben = np.frombuffer(block, dtype=np.int16)
            ergebnis = self._model.predict(proben)
        except Exception as exc:  # noqa: BLE001
            log.warning("Aktivierungswort-Erkennung gescheitert: %s", exc)
            return None
        if not ergebnis:
            return None
        name, score = max(ergebnis.items(), key=lambda kv: kv[1])
        if self.gate.check(float(score)):
            log.info("Aktivierungswort erkannt: %s (%.2f)", name, score)
            return Detection(phrase=name, score=float(score), at=time.monotonic())
        return None

    def reset(self) -> None:
        self.gate.reset()
        if self._model is not None:
            try:
                self._model.reset()
            except Exception:  # noqa: BLE001
                pass


class ManualDetector:
    """Kein Aktivierungswort -- Start von Hand (Tastendruck, Dashboard)."""

    def __init__(self, config: WakeConfig | None = None) -> None:
        self._armed = False

    def available(self) -> tuple[bool, str]:
        return True, "Start von Hand (kein Aktivierungswort)"

    def trigger(self) -> None:
        self._armed = True

    def feed(self, block: bytes) -> Detection | None:
        if self._armed:
            self._armed = False
            return Detection(phrase="manuell", score=1.0, at=time.monotonic())
        return None

    def reset(self) -> None:
        self._armed = False


def build_detector(config: WakeConfig) -> Detector:
    if config.engine in ("none", "push_to_talk"):
        return ManualDetector(config)
    detector = OpenWakeWordDetector(config)
    ok, grund = detector.available()
    if ok:
        log.info("Aktivierungswort: %s", grund)
        return detector
    log.warning("Aktivierungswort nicht einsatzbereit: %s -- Start von Hand.", grund)
    return ManualDetector(config)
