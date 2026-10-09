"""Sprachsynthese und Spracherkennung.

Zwei Wege, je nach dem, was auf dem Rechner vorhanden ist:

* **Twilio** erledigt beides selbst (``<Say>`` und ``<Gather input="speech">``).
  Das ist der Standard, weil es ohne weitere Installation laeuft und die
  Verzoegerung am kleinsten ist -- entscheidend fuer ein Telefongespraech.
* **Lokal** mit Piper (Sprachausgabe) und Whisper (Erkennung), falls
  installiert. Dann verlaesst kein Audio den Rechner. Piper-Ausgaben
  werden als Datei gespeichert und ueber den HTTP-Dienst ausgeliefert
  (``/audio/<name>.wav``), damit Twilio sie abspielen kann.

Fehlt beides, bleibt die Telefonie auf Twilio-Stimmen; Jarvis sagt das
beim Start, statt stillschweigend nichts zu koennen.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


class SpeechSynthesis:
    """Text zu Sprache. ``engine`` ist 'twilio', 'piper', 'say' oder 'none'."""

    def __init__(
        self, engine: str = "twilio", *, piper_binary: str = "piper", piper_voice: str = "",
        audio_dir: Path | None = None,
    ) -> None:
        self.engine = (engine or "twilio").lower()
        self.piper_binary = piper_binary
        self.piper_voice = piper_voice
        self.audio_dir = audio_dir
        if self.audio_dir:
            self.audio_dir.mkdir(parents=True, exist_ok=True)

    @property
    def available(self) -> bool:
        if self.engine == "twilio":
            return True
        if self.engine == "piper":
            return bool(shutil.which(self.piper_binary)) and bool(self.piper_voice)
        if self.engine == "say":
            return bool(shutil.which("say"))
        return False

    def describe(self) -> str:
        if self.engine == "twilio":
            return "Sprachausgabe ueber Twilio (keine lokale Installation noetig)"
        if self.engine == "piper":
            if not shutil.which(self.piper_binary):
                return f"Piper nicht gefunden ({self.piper_binary}) -- Twilio-Stimme wird benutzt"
            if not self.piper_voice:
                return "Piper gefunden, aber PIPER_VOICE fehlt -- Twilio-Stimme wird benutzt"
            return f"Piper mit Stimme {Path(self.piper_voice).name}"
        if self.engine == "say":
            return "macOS-Sprachausgabe ('say')" if shutil.which("say") else "'say' nicht vorhanden"
        return "Sprachausgabe abgeschaltet"

    async def to_file(self, text: str) -> Path | None:
        """Erzeugt eine WAV-Datei. ``None``, wenn lokal nichts verfuegbar ist."""
        if not self.available or self.engine == "twilio" or not self.audio_dir:
            return None
        name = hashlib.sha256(f"{self.engine}:{self.piper_voice}:{text}".encode()).hexdigest()[:24]
        target = self.audio_dir / f"{name}.wav"
        if target.exists():
            return target

        if self.engine == "piper":
            command = [self.piper_binary, "--model", self.piper_voice,
                       "--output_file", str(target)]
            stdin_data = text.encode("utf-8")
        elif self.engine == "say":
            # 'say' kann AIFF; fuer Telefonie reicht es, wenn afconvert vorhanden ist.
            aiff = target.with_suffix(".aiff")
            command = ["say", "-o", str(aiff), text]
            stdin_data = None
        else:
            return None

        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                stdin=asyncio.subprocess.PIPE if stdin_data else None,
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
            )
            _, error = await asyncio.wait_for(process.communicate(stdin_data), timeout=60)
        except (OSError, asyncio.TimeoutError, TimeoutError) as exc:
            log.error("Sprachausgabe fehlgeschlagen: %s", exc)
            return None
        if process.returncode != 0:
            log.error("Sprachausgabe (%s) fehlgeschlagen: %s", self.engine,
                      (error or b"").decode("utf-8", "replace")[:300])
            return None

        if self.engine == "say" and shutil.which("afconvert"):
            aiff = target.with_suffix(".aiff")
            subprocess.run(
                ["afconvert", "-f", "WAVE", "-d", "LEI16@8000", str(aiff), str(target)],
                check=False, capture_output=True,
            )
            aiff.unlink(missing_ok=True)
        return target if target.exists() else None


class SpeechRecognition:
    """Sprache zu Text. ``engine`` ist 'twilio', 'whisper' oder 'none'."""

    def __init__(
        self, engine: str = "twilio", *, whisper_binary: str = "whisper", model: str = "base",
    ) -> None:
        self.engine = (engine or "twilio").lower()
        self.whisper_binary = whisper_binary
        self.model = model

    @property
    def available(self) -> bool:
        if self.engine == "twilio":
            return True
        if self.engine == "whisper":
            return bool(shutil.which(self.whisper_binary)) or self._python_whisper()
        return False

    @staticmethod
    def _python_whisper() -> bool:
        try:
            import importlib.util
            return (
                importlib.util.find_spec("faster_whisper") is not None
                or importlib.util.find_spec("whisper") is not None
            )
        except Exception:  # pragma: no cover
            return False

    def describe(self) -> str:
        if self.engine == "twilio":
            return "Spracherkennung ueber Twilio (de-DE, im Gespraech ohne Zusatzlatenz)"
        if self.engine == "whisper":
            if shutil.which(self.whisper_binary):
                return f"Whisper ({self.whisper_binary}, Modell {self.model})"
            if self._python_whisper():
                return f"Whisper als Python-Modul, Modell {self.model}"
            return "Whisper nicht gefunden -- Twilio-Erkennung wird benutzt"
        return "Spracherkennung abgeschaltet"

    async def transcribe(self, audio: Path) -> str:
        """Erkennt eine Audiodatei (z. B. eine Twilio-Aufnahme)."""
        if self.engine != "whisper" or not audio.exists():
            return ""
        if shutil.which(self.whisper_binary):
            command = [
                self.whisper_binary, str(audio), "--model", self.model,
                "--language", "de", "--output_format", "txt",
                "--output_dir", str(audio.parent), "--fp16", "False",
            ]
            try:
                process = await asyncio.create_subprocess_exec(
                    *command, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE
                )
                _, error = await asyncio.wait_for(process.communicate(), timeout=300)
            except (OSError, asyncio.TimeoutError, TimeoutError) as exc:
                log.error("Whisper fehlgeschlagen: %s", exc)
                return ""
            if process.returncode != 0:
                log.error("Whisper: %s", (error or b"").decode("utf-8", "replace")[:300])
                return ""
            transcript = audio.with_suffix(".txt")
            return transcript.read_text(encoding="utf-8").strip() if transcript.exists() else ""

        def work() -> str:
            try:
                from faster_whisper import WhisperModel  # type: ignore
            except ImportError:
                try:
                    import whisper  # type: ignore
                except ImportError:
                    return ""
                model = whisper.load_model(self.model)
                return str(model.transcribe(str(audio), language="de").get("text", "")).strip()
            model = WhisperModel(self.model, device="auto", compute_type="int8")
            segments, _ = model.transcribe(str(audio), language="de")
            return " ".join(segment.text for segment in segments).strip()

        return await asyncio.to_thread(work)
