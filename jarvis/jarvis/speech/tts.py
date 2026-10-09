"""Sprachausgabe.

Zwei Wege, einer als Rueckfall:

* **Piper** -- lokales neuronales TTS. Deutsche Stimmen (z.B. ``thorsten``)
  klingen deutlich natuerlicher als die Systemstimmen und laufen auf Apple
  Silicon in Echtzeit. Piper schreibt WAV auf die Standardausgabe; das wird
  direkt an die Wiedergabe durchgereicht.
* **macOS `say`** -- immer vorhanden, kein Download, aber erkennbar
  synthetisch. Rueckfall, wenn Piper fehlt oder abstuerzt.

Zur Stimme: eine erkennbare Nachbildung der Filmstimme aus den Iron-Man-Filmen
ist hier bewusst nicht vorgesehen. Dafuer braeuchte es Aufnahmen des
Schauspielers als Trainingsmaterial, und die liegen rechtlich nicht vor.
Angestrebt ist eine eigene ruhige, tiefe, praezise deutsche Stimme.

**Nicht mit Ton getestet** -- die Entwicklungsumgebung hat keine Audioausgabe.
Geprueft sind Befehlsaufbau, Warteschlange und Unterbrechung.
"""

from __future__ import annotations

import platform
import queue
import shutil
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from ..config import TTSConfig
from ..logging_setup import get_logger

log = get_logger("tts")


class TTSError(RuntimeError):
    pass


class Engine(Protocol):
    """Eine Sprachausgabe."""

    name: str

    def speak(self, text: str, stop: threading.Event) -> bool:
        """Spricht einen Abschnitt. Gibt ``False`` zurueck, wenn unterbrochen."""
        ...

    def available(self) -> tuple[bool, str]: ...


def _terminate(proc: subprocess.Popen) -> None:
    """Beendet einen Wiedergabeprozess zuegig.

    Erst freundlich, dann hart: eine Unterbrechung muss sofort hoerbar sein,
    sonst redet JARVIS ueber den Nutzer hinweg.
    """
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=0.3)
    except subprocess.TimeoutExpired:
        proc.kill()
        try:
            proc.wait(timeout=0.5)
        except subprocess.TimeoutExpired:
            log.warning("Wiedergabeprozess liess sich nicht beenden.")


class PiperEngine:
    """Piper, Ausgabe ueber ein Wiedergabeprogramm."""

    name = "piper"

    def __init__(self, config: TTSConfig) -> None:
        self.config = config
        self.voice = Path(config.voice_path).expanduser()
        self._player = self._find_player()

    @staticmethod
    def _find_player() -> list[str] | None:
        """Sucht ein Programm, das WAV von der Standardeingabe abspielt."""
        # afplay kann nicht von stdin lesen -- deshalb auf macOS 'sox'/'play'
        # oder ffplay. Reihenfolge nach Verbreitung.
        for befehl, argumente in (
            ("ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", "-"]),
            ("play", ["-q", "-"]),
            ("aplay", ["-q", "-"]),
        ):
            if shutil.which(befehl):
                return [befehl, *argumente]
        return None

    def available(self) -> tuple[bool, str]:
        if shutil.which(self.config.binary) is None:
            return False, f"'{self.config.binary}' nicht im Pfad"
        if not self.voice.exists():
            return False, f"Stimmdatei fehlt: {self.voice}"
        if not self.voice.with_suffix(".onnx.json").exists() \
                and not Path(str(self.voice) + ".json").exists():
            return False, (f"Zu {self.voice.name} fehlt die .json-Datei "
                           "(Piper braucht beide).")
        if self._player is None:
            return False, ("Kein Wiedergabeprogramm gefunden. "
                           "Installieren: brew install ffmpeg  (oder sox)")
        return True, f"{self.voice.name} ueber {self._player[0]}"

    def speak(self, text: str, stop: threading.Event) -> bool:
        ok, grund = self.available()
        if not ok:
            raise TTSError(grund)
        befehl = [self.config.binary, "--model", str(self.voice), "--output_file", "-"]
        if self.config.speed and self.config.speed != 1.0:
            # Piper rechnet umgekehrt: kleinerer Wert = schneller.
            befehl += ["--length_scale", f"{1.0 / self.config.speed:.3f}"]
        try:
            piper = subprocess.Popen(befehl, stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            spieler = subprocess.Popen(self._player, stdin=piper.stdout,
                                       stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL)
        except OSError as exc:
            raise TTSError(f"Piper liess sich nicht starten: {exc}") from exc
        # Der Elternprozess braucht das Leseende nicht -- sonst bekommt der
        # Spieler kein Dateiende, wenn Piper fertig ist.
        if piper.stdout is not None:
            piper.stdout.close()
        try:
            piper.stdin.write(text.encode("utf-8"))
            piper.stdin.close()
        except (BrokenPipeError, OSError) as exc:
            _terminate(piper)
            _terminate(spieler)
            raise TTSError(f"Piper hat die Eingabe abgewiesen: {exc}") from exc

        while spieler.poll() is None:
            if stop.wait(0.05):
                _terminate(spieler)
                _terminate(piper)
                return False
        _terminate(piper)
        return True


class SayEngine:
    """macOS `say`. Immer da, klingt aber synthetisch."""

    name = "say"

    def __init__(self, config: TTSConfig) -> None:
        self.config = config

    def available(self) -> tuple[bool, str]:
        if platform.system() != "Darwin":
            return False, "`say` gibt es nur auf macOS"
        if shutil.which("say") is None:
            return False, "`say` nicht gefunden"
        return True, f"Stimme {self.config.macos_voice}"

    def speak(self, text: str, stop: threading.Event) -> bool:
        ok, grund = self.available()
        if not ok:
            raise TTSError(grund)
        befehl = ["say", "-v", self.config.macos_voice]
        if self.config.speed and self.config.speed != 1.0:
            # `say` erwartet Woerter pro Minute; 180 ist etwa normal.
            befehl += ["-r", str(int(180 * self.config.speed))]
        befehl.append(text)
        try:
            proc = subprocess.Popen(befehl, stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL)
        except OSError as exc:
            raise TTSError(f"`say` liess sich nicht starten: {exc}") from exc
        while proc.poll() is None:
            if stop.wait(0.05):
                _terminate(proc)
                return False
        return True


class NullEngine:
    """Spricht nicht, protokolliert nur. Fuer Tests und stummen Betrieb."""

    name = "none"

    def __init__(self, config: TTSConfig | None = None) -> None:
        self.spoken: list[str] = []

    def available(self) -> tuple[bool, str]:
        return True, "stumm (nur Protokoll)"

    def speak(self, text: str, stop: threading.Event) -> bool:
        if stop.is_set():
            return False
        self.spoken.append(text)
        log.info("[stumm] %s", text)
        return True


def build_engine(config: TTSConfig) -> Engine:
    """Waehlt die Sprachausgabe und faellt begruendet zurueck."""
    if config.engine == "none":
        return NullEngine(config)
    kandidaten: list[Engine] = []
    if config.engine == "piper":
        kandidaten = [PiperEngine(config), SayEngine(config)]
    elif config.engine == "say":
        kandidaten = [SayEngine(config), PiperEngine(config)]
    else:
        log.warning("Unbekannte Sprachausgabe '%s' -- nehme Piper.", config.engine)
        kandidaten = [PiperEngine(config), SayEngine(config)]

    for engine in kandidaten:
        ok, grund = engine.available()
        if ok:
            log.info("Sprachausgabe: %s (%s)", engine.name, grund)
            return engine
        log.info("Sprachausgabe %s nicht nutzbar: %s", engine.name, grund)
    log.error("Keine Sprachausgabe verfuegbar -- JARVIS bleibt stumm.")
    return NullEngine(config)


@dataclass(slots=True)
class SpeechItem:
    text: str
    #: Dringendes wird auch gesprochen, wenn die Warteschlange geleert wird.
    urgent: bool = False


class Speaker:
    """Warteschlange mit eigenem Faden.

    Die Sprachausgabe laeuft nebenher, damit das Gespraech nicht darauf wartet.
    ``interrupt()`` bricht sofort ab und verwirft, was noch wartet -- ein
    Assistent, der nach dem Unterbrechen seinen alten Satz zu Ende redet, ist
    unbrauchbar.
    """

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self._queue: queue.Queue[SpeechItem | None] = queue.Queue()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._speaking = threading.Event()
        self._fehler: str | None = None
        self._lock = threading.Lock()

    # -- Betrieb --------------------------------------------------------
    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="jarvis-tts",
                                        daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._queue.put(None)
        if self._thread is not None:
            self._thread.join(timeout=3)
            self._thread = None

    def say(self, text: str, *, urgent: bool = False) -> None:
        text = text.strip()
        if not text:
            return
        self._queue.put(SpeechItem(text=text, urgent=urgent))

    def interrupt(self) -> int:
        """Bricht ab und verwirft Wartendes. Gibt zurueck, wie viel verfiel.

        Das Stoppsignal wird hier **nicht** wieder freigegeben. Das macht der
        Ausgabefaden, wenn er den naechsten Abschnitt aus der Warteschlange
        nimmt.

        Grund: Wuerde ``interrupt`` selbst freigeben, laege zwischen Setzen und
        Freigeben nur die Zeit zum Leeren der Warteschlange -- Mikrosekunden.
        Eine Ausgabe, die ihr Stoppsignal traeger abfragt (der echte
        Wiedergabeprozess sieht alle 50 ms nach), verpasst das Signal dann und
        redet ueber den Nutzer hinweg. Genau das soll Dazwischenreden
        verhindern.
        """
        self._stop.set()
        verworfen = 0
        behalten: list[SpeechItem] = []
        while True:
            try:
                eintrag = self._queue.get_nowait()
            except queue.Empty:
                break
            if eintrag is None:
                continue
            if eintrag.urgent:
                behalten.append(eintrag)
            else:
                verworfen += 1
        for eintrag in behalten:
            self._queue.put(eintrag)
        return verworfen

    @property
    def is_speaking(self) -> bool:
        return self._speaking.is_set()

    @property
    def pending(self) -> int:
        return self._queue.qsize()

    @property
    def last_error(self) -> str | None:
        with self._lock:
            return self._fehler

    def wait_until_idle(self, timeout: float = 30.0) -> bool:
        """Wartet, bis nichts mehr aussteht -- fuer Tests und sauberes Beenden."""
        import time
        ende = time.monotonic() + timeout
        while time.monotonic() < ende:
            if self._queue.empty() and not self.is_speaking:
                return True
            time.sleep(0.01)
        return False

    # -- intern ---------------------------------------------------------
    def _run(self) -> None:
        while True:
            eintrag = self._queue.get()
            if eintrag is None:
                return
            # Ein neuer Abschnitt heisst: die Unterbrechung ist abgearbeitet.
            # Erst hier freigeben -- siehe interrupt().
            self._stop.clear()
            self._speaking.set()
            try:
                self.engine.speak(eintrag.text, self._stop)
            except TTSError as exc:
                with self._lock:
                    self._fehler = str(exc)
                log.error("Sprachausgabe gescheitert: %s", exc)
            except Exception as exc:  # noqa: BLE001 -- der Faden darf nicht sterben
                with self._lock:
                    self._fehler = str(exc)
                log.exception("Unerwarteter Fehler in der Sprachausgabe")
            finally:
                self._speaking.clear()
