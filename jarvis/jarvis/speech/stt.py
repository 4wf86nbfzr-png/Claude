"""Spracherkennung mit whisper.cpp.

whisper.cpp statt des Python-Pakets ``openai-whisper``: es nutzt Metal auf
Apple Silicon, startet schneller und braucht kein PyTorch (mehrere Gigabyte).
Aufgerufen wird das Binary pro Aeusserung -- bei 1 bis 3 Sekunden Audio ist der
Prozessstart gegenueber der Erkennung nicht der Engpass, und ein abgestuerzter
Erkenner reisst JARVIS nicht mit.

Die Audiodatei wird mit dem ``wave``-Modul geschrieben, damit kein ffmpeg
dazwischen haengt.

**Nicht mit echtem Mikrofon getestet** -- die Entwicklungsumgebung hat keine
Audioeingabe. Geprueft sind Befehlsaufbau, WAV-Erzeugung und die Aufbereitung
der Ausgabe.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from ..config import STTConfig
from ..logging_setup import get_logger

log = get_logger("stt")

#: Zeilen, die whisper.cpp bei Stille oder Musik ausgibt. Die sind keine
#: Aeusserung und duerfen nicht ins Gespraech gelangen -- sonst antwortet
#: JARVIS auf ein Rascheln.
RAUSCHEN = {
    "", "[blank_audio]", "(blank audio)", "[musik]", "(musik)", "[music]",
    "(music)", "[stille]", "(stille)", "[silence]", "(silence)", "...",
    "[geraeusche]", "(geraeusche)", "[applaus]", "(applaus)", "untertitel",
    "untertitelung des zdf", "vielen dank.", "danke.",
}

#: Klammerzusaetze wie [Musik] am Rand entfernen.
_KLAMMER = re.compile(r"^\s*[\[\(][^\]\)]{0,40}[\]\)]\s*|\s*[\[\(][^\]\)]{0,40}[\]\)]\s*$")
_ZEITSTEMPEL = re.compile(r"^\s*\[\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->.*?\]\s*", re.M)


class STTError(RuntimeError):
    pass


@dataclass(slots=True)
class Transcript:
    text: str
    duration: float = 0.0
    #: Wahr, wenn nur Rauschen erkannt wurde -- dann ist nichts gesagt worden.
    empty: bool = False


class STT(Protocol):
    def transcribe(self, audio: bytes, sample_rate: int = 16000) -> Transcript: ...
    def available(self) -> tuple[bool, str]: ...


def write_wav(path: Path, audio: bytes, sample_rate: int = 16000) -> None:
    """Schreibt Int16-Mono-PCM als WAV."""
    with wave.open(str(path), "wb") as datei:
        datei.setnchannels(1)
        datei.setsampwidth(2)
        datei.setframerate(sample_rate)
        datei.writeframes(audio)


def clean(rohtext: str) -> tuple[str, bool]:
    """Bereitet die Whisper-Ausgabe auf. Gibt (Text, ist_leer) zurueck."""
    text = _ZEITSTEMPEL.sub("", rohtext)
    zeilen = [z.strip() for z in text.splitlines()]
    zeilen = [z for z in zeilen if z and not z.startswith("whisper_")]
    text = " ".join(zeilen).strip()
    # Klammerzusaetze an den Raendern weg.
    vorher = None
    while vorher != text:
        vorher = text
        text = _KLAMMER.sub("", text).strip()
    if text.lower().strip(" .!?") in {r.strip(" .!?") for r in RAUSCHEN}:
        return "", True
    return re.sub(r"\s{2,}", " ", text), not text


class WhisperCppSTT:
    """Erkennung ueber das whisper.cpp-Binary."""

    def __init__(self, config: STTConfig) -> None:
        self.config = config
        self.model = Path(config.model_path).expanduser()

    def available(self) -> tuple[bool, str]:
        binary = shutil.which(self.config.binary)
        if binary is None:
            return False, (f"'{self.config.binary}' nicht im Pfad. "
                           "Installieren: brew install whisper-cpp")
        if not self.model.exists():
            return False, f"Modelldatei fehlt: {self.model}"
        return True, f"{self.model.name}"

    def transcribe(self, audio: bytes, sample_rate: int = 16000) -> Transcript:
        ok, grund = self.available()
        if not ok:
            raise STTError(grund)
        if not audio:
            return Transcript(text="", empty=True)
        dauer = len(audio) / 2 / sample_rate
        # Zeitlimit mit der Audiolaenge mitwachsen lassen, aber nie unter 15 s:
        # ein Modell, das beim ersten Aufruf laedt, braucht laenger.
        grenze = max(15.0, dauer * 3 + 10.0)

        with tempfile.TemporaryDirectory(prefix="jarvis-stt-") as ordner:
            pfad = Path(ordner) / "aeusserung.wav"
            write_wav(pfad, audio, sample_rate)
            befehl = [
                self.config.binary,
                "-m", str(self.model),
                "-f", str(pfad),
                "-l", self.config.language,
                "-nt",            # keine Zeitstempel
                "-np",            # keine Fortschrittsausgabe
                "-t", "4",        # Faeden -- mehr bringt bei kurzem Audio nichts
            ]
            try:
                proc = subprocess.run(befehl, capture_output=True, text=True,
                                      timeout=grenze, check=False)
            except subprocess.TimeoutExpired as exc:
                raise STTError(
                    f"whisper.cpp hat nach {grenze:.0f}s nicht geantwortet. "
                    "Vielleicht ist das Modell fuer diesen Rechner zu gross."
                ) from exc
            except OSError as exc:
                raise STTError(f"whisper.cpp liess sich nicht starten: {exc}") from exc

        if proc.returncode != 0:
            raise STTError(
                f"whisper.cpp endete mit {proc.returncode}: "
                f"{(proc.stderr or '').strip()[:300]}")
        text, leer = clean(proc.stdout)
        if leer:
            log.debug("Nur Rauschen erkannt (%.1fs Audio).", dauer)
        return Transcript(text=text, duration=dauer, empty=leer)


class NullSTT:
    """Erkennt nichts und sagt das auch. Fuer Tests und Betrieb ohne Whisper."""

    def __init__(self, config: STTConfig | None = None,
                 antworten: list[str] | None = None) -> None:
        self.antworten = list(antworten or [])
        self.aufrufe = 0

    def available(self) -> tuple[bool, str]:
        if self.antworten:
            return True, "Ersatzerkennung (gibt vorgegebene Texte zurueck)"
        return False, "keine Spracherkennung konfiguriert"

    def transcribe(self, audio: bytes, sample_rate: int = 16000) -> Transcript:
        self.aufrufe += 1
        if not self.antworten:
            return Transcript(text="", empty=True)
        text = self.antworten.pop(0)
        return Transcript(text=text, duration=len(audio) / 2 / sample_rate,
                          empty=not text)


def build_stt(config: STTConfig) -> STT:
    if config.engine == "none":
        return NullSTT(config)
    engine = WhisperCppSTT(config)
    ok, grund = engine.available()
    if ok:
        log.info("Spracherkennung: whisper.cpp (%s)", grund)
    else:
        log.warning("Spracherkennung nicht einsatzbereit: %s", grund)
    return engine
