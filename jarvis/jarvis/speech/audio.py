"""Audioeingabe.

Duenne Huelle um ``sounddevice``, damit der Rest von JARVIS gegen eine
Schnittstelle programmiert und ohne Mikrofon getestet werden kann.

Eine Aufnahme laeuft, nicht mehrere: ein zweiter Zugriff auf dasselbe
Mikrofon scheitert auf macOS oder liefert Stille. Deshalb gibt es genau einen
Strom, aus dem alle lesen (Aktivierungswort und Zerlegung gleichzeitig).

**Nicht getestet** -- die Entwicklungsumgebung hat kein Audiogeraet.
"""

from __future__ import annotations

import queue
import threading
from typing import Iterator, Protocol

from ..config import AudioConfig
from ..logging_setup import get_logger

log = get_logger("audio")


class AudioError(RuntimeError):
    pass


class AudioSource(Protocol):
    def blocks(self) -> Iterator[bytes]: ...
    def start(self) -> None: ...
    def stop(self) -> None: ...
    def available(self) -> tuple[bool, str]: ...


class MicrophoneSource:
    """Mikrofon ueber sounddevice."""

    def __init__(self, config: AudioConfig) -> None:
        self.config = config
        self._queue: queue.Queue[bytes] = queue.Queue(maxsize=100)
        self._stream = None
        self._running = threading.Event()
        self._overflows = 0

    @property
    def block_frames(self) -> int:
        return int(self.config.sample_rate * self.config.block_ms / 1000)

    def available(self) -> tuple[bool, str]:
        try:
            import sounddevice as sd  # noqa: PLC0415
        except Exception as exc:  # noqa: BLE001
            return False, (f"sounddevice nicht nutzbar ({exc}). "
                           "Installieren: brew install portaudio && "
                           "pip install 'jarvis[speech]'")
        try:
            geraete = sd.query_devices()
        except Exception as exc:  # noqa: BLE001
            return False, (f"Audiogeraete nicht abfragbar ({exc}). Auf macOS muss "
                           "das Mikrofonrecht erteilt sein: Systemeinstellungen > "
                           "Datenschutz & Sicherheit > Mikrofon.")
        eingaenge = [d for d in geraete if d.get("max_input_channels", 0) > 0]
        if not eingaenge:
            return False, "kein Aufnahmegeraet gefunden"
        return True, f"{len(eingaenge)} Eingang/Eingaenge"

    def start(self) -> None:
        ok, grund = self.available()
        if not ok:
            raise AudioError(grund)
        import sounddevice as sd  # noqa: PLC0415

        def rueckruf(indata, frames, zeit, status) -> None:
            if status:
                # Overflow heisst: wir lesen zu langsam. Zaehlen, nicht spammen.
                self._overflows += 1
                if self._overflows in (1, 10, 100):
                    log.warning("Audiostatus: %s (%d-mal)", status, self._overflows)
            try:
                self._queue.put_nowait(bytes(indata))
            except queue.Full:
                # Lieber den aeltesten Block verlieren als die Aufnahme bremsen.
                try:
                    self._queue.get_nowait()
                    self._queue.put_nowait(bytes(indata))
                except queue.Empty:
                    pass

        try:
            self._stream = sd.RawInputStream(
                samplerate=self.config.sample_rate,
                blocksize=self.block_frames,
                device=self.config.input_device,
                dtype="int16",
                channels=1,
                callback=rueckruf,
            )
            self._stream.start()
        except Exception as exc:  # noqa: BLE001
            raise AudioError(f"Mikrofon liess sich nicht oeffnen: {exc}") from exc
        self._running.set()
        log.info("Mikrofon offen: %d Hz, %d ms Bloecke",
                 self.config.sample_rate, self.config.block_ms)

    def stop(self) -> None:
        self._running.clear()
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception as exc:  # noqa: BLE001
                log.warning("Mikrofon liess sich nicht sauber schliessen: %s", exc)
            self._stream = None

    def blocks(self) -> Iterator[bytes]:
        """Gibt Audiobloecke, solange die Aufnahme laeuft."""
        while self._running.is_set():
            try:
                yield self._queue.get(timeout=0.5)
            except queue.Empty:
                continue

    def restart(self) -> bool:
        """Nach einem Geraetewechsel (Kopfhoerer ab) neu oeffnen."""
        log.info("Mikrofon wird neu geoeffnet.")
        self.stop()
        try:
            self.start()
            return True
        except AudioError as exc:
            log.error("Neuoeffnen gescheitert: %s", exc)
            return False


class ListSource:
    """Audioquelle aus einer Liste -- fuer Tests ohne Mikrofon."""

    def __init__(self, bloecke: list[bytes]) -> None:
        self._bloecke = list(bloecke)
        self._running = False

    def available(self) -> tuple[bool, str]:
        return True, f"{len(self._bloecke)} Bloecke aus der Liste"

    def start(self) -> None:
        self._running = True

    def stop(self) -> None:
        self._running = False

    def blocks(self) -> Iterator[bytes]:
        for block in self._bloecke:
            if not self._running:
                return
            yield block
