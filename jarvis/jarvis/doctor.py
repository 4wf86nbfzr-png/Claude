"""Diagnose: was ist da, was fehlt, was laeuft hier nicht.

Dieses Modul stellt keine Vermutungen an. Es ruft echte Systemabfragen auf und
berichtet, was sie liefern. Was nicht geprueft werden konnte, erscheint als
``unbekannt`` -- nicht als ``in Ordnung``.

Aufruf: ``python3 -m jarvis.cli doctor`` (lesbar) oder ``--json`` (zum Weitergeben).
"""

from __future__ import annotations

import json
import platform
import shutil
import socket
import subprocess
import sys
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

from .config import Config


class State(str, Enum):
    OK = "ok"
    MISSING = "fehlt"
    DEGRADED = "eingeschraenkt"
    UNKNOWN = "unbekannt"


@dataclass(slots=True)
class Check:
    name: str
    state: State
    detail: str = ""
    #: Konkreter naechster Schritt, falls etwas fehlt.
    remedy: str = ""

    def line(self) -> str:
        mark = {State.OK: "+", State.MISSING: "-", State.DEGRADED: "!",
                State.UNKNOWN: "?"}[self.state]
        text = f" [{mark}] {self.name}: {self.detail}" if self.detail else f" [{mark}] {self.name}"
        if self.remedy and self.state is not State.OK:
            text += f"\n       -> {self.remedy}"
        return text


@dataclass(slots=True)
class Report:
    checks: list[Check] = field(default_factory=list)

    def add(self, *checks: Check) -> None:
        self.checks.extend(checks)

    @property
    def problems(self) -> list[Check]:
        return [c for c in self.checks if c.state in (State.MISSING, State.DEGRADED)]

    def to_json(self) -> str:
        return json.dumps(
            {"checks": [{"name": c.name, "state": c.state.value,
                         "detail": c.detail, "remedy": c.remedy} for c in self.checks]},
            indent=2, ensure_ascii=False,
        )

    def to_text(self) -> str:
        zeilen = ["JARVIS -- Diagnose", "=" * 50]
        zeilen += [c.line() for c in self.checks]
        zeilen.append("=" * 50)
        if self.problems:
            zeilen.append(f"{len(self.problems)} Punkt(e) brauchen Aufmerksamkeit.")
        else:
            zeilen.append("Alles, was geprueft werden konnte, ist in Ordnung.")
        return "\n".join(zeilen)


def _run(cmd: list[str], timeout: float = 8.0) -> tuple[bool, str]:
    """Fuehrt einen Befehl aus und gibt (Erfolg, Ausgabe) zurueck."""
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                              check=False)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return False, str(exc)
    out = (proc.stdout or proc.stderr).strip()
    return proc.returncode == 0, out


# -- System -------------------------------------------------------------
def check_platform() -> list[Check]:
    system = platform.system()
    if system != "Darwin":
        return [Check(
            "Betriebssystem", State.DEGRADED,
            f"{system} {platform.release()} ({platform.machine()})",
            "JARVIS ist fuer macOS gebaut. Hier laufen Kern, Gedaechtnis, Aufgaben "
            "und Tests; Mikrofon, Sprachausgabe und die macOS-Werkzeuge nicht.",
        )]
    checks = [Check("Betriebssystem", State.OK,
                    f"macOS {platform.mac_ver()[0]} ({platform.machine()})")]
    ok, chip = _run(["sysctl", "-n", "machdep.cpu.brand_string"])
    checks.append(Check("Prozessor", State.OK if ok else State.UNKNOWN, chip))
    ok, mem = _run(["sysctl", "-n", "hw.memsize"])
    if ok and mem.isdigit():
        gib = int(mem) / 1024**3
        # Unter 16 GB wird es mit 7B-Modell plus Whisper plus TTS eng.
        state = State.OK if gib >= 16 else State.DEGRADED
        checks.append(Check(
            "Arbeitsspeicher", state, f"{gib:.0f} GB",
            "" if state is State.OK else
            "Unter 16 GB: kleineres Modell waehlen (z.B. qwen2.5:3b-instruct-q4_K_M) "
            "und Whisper auf 'base' oder 'small' setzen.",
        ))
    else:
        checks.append(Check("Arbeitsspeicher", State.UNKNOWN, mem))
    try:
        usage = shutil.disk_usage(Path.home())
        frei = usage.free / 1024**3
        state = State.OK if frei >= 20 else State.DEGRADED
        checks.append(Check(
            "Freier Speicherplatz", state, f"{frei:.0f} GB frei",
            "" if state is State.OK else
            "Modelle brauchen Platz: Sprachmodell 2-5 GB, Whisper 0,1-1,6 GB, Stimme ~60 MB.",
        ))
    except OSError as exc:
        checks.append(Check("Freier Speicherplatz", State.UNKNOWN, str(exc)))
    return checks


def check_python() -> Check:
    v = sys.version_info
    state = State.OK if (v.major, v.minor) >= (3, 11) else State.MISSING
    return Check("Python", state, f"{v.major}.{v.minor}.{v.micro}",
                 "" if state is State.OK else "JARVIS braucht Python 3.11 oder neuer.")


# -- Sprachmodell -------------------------------------------------------
def check_llm(cfg: Config) -> list[Check]:
    if cfg.llm.runtime == "none":
        return [Check("Sprachmodell", State.DEGRADED, "abgeschaltet (runtime = none)",
                      "Ohne Modell beantwortet JARVIS nichts frei -- nur Werkzeuge.")]
    if shutil.which("ollama") is None:
        return [Check("Ollama", State.MISSING, "nicht im Pfad",
                      "Installieren: brew install ollama && brew services start ollama")]
    host, _, port = cfg.llm.base_url.rpartition(":")
    erreichbar = _port_open(host.split("//")[-1] or "127.0.0.1", int(port or 11434))
    if not erreichbar:
        return [Check("Ollama", State.MISSING, f"{cfg.llm.base_url} antwortet nicht",
                      "Starten: ollama serve  (oder: brew services start ollama)")]
    ok, out = _run(["ollama", "list"])
    if not ok:
        return [Check("Ollama", State.DEGRADED, out, "`ollama list` pruefen.")]
    vorhanden = [z.split()[0] for z in out.splitlines()[1:] if z.strip()]
    checks = [Check("Ollama", State.OK, f"laeuft, {len(vorhanden)} Modell(e)")]
    gewuenscht = cfg.llm.model
    # Ollama haengt ':latest' an; der Vergleich muss das verkraften.
    passt = any(m == gewuenscht or m.split(":")[0] == gewuenscht.split(":")[0]
                for m in vorhanden)
    checks.append(Check(
        "Modell", State.OK if passt else State.MISSING,
        gewuenscht if passt else f"{gewuenscht} nicht geladen (da: {', '.join(vorhanden) or 'keines'})",
        "" if passt else f"Laden: ollama pull {gewuenscht}",
    ))
    return checks


def _port_open(host: str, port: int, timeout: float = 1.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


# -- Spracherkennung ----------------------------------------------------
def check_stt(cfg: Config) -> list[Check]:
    if cfg.stt.engine == "none":
        return [Check("Spracherkennung", State.DEGRADED, "abgeschaltet")]
    binary = shutil.which(cfg.stt.binary)
    checks = []
    if binary is None:
        checks.append(Check(
            "whisper.cpp", State.MISSING, f"'{cfg.stt.binary}' nicht im Pfad",
            "Installieren: brew install whisper-cpp",
        ))
    else:
        checks.append(Check("whisper.cpp", State.OK, binary))
    modell = Path(cfg.stt.model_path).expanduser()
    if modell.exists():
        checks.append(Check("Whisper-Modell", State.OK,
                            f"{modell.name} ({modell.stat().st_size / 1024**2:.0f} MB)"))
    else:
        checks.append(Check(
            "Whisper-Modell", State.MISSING, str(modell),
            "Herunterladen, z.B.: curl -L -o " + str(modell) +
            " https://huggingface.co/ggerganov/whisper.cpp/resolve/main/"
            "ggml-large-v3-turbo-q5_0.bin",
        ))
    return checks


# -- Sprachausgabe ------------------------------------------------------
def check_tts(cfg: Config) -> list[Check]:
    if cfg.tts.engine == "none":
        return [Check("Sprachausgabe", State.DEGRADED, "abgeschaltet")]
    checks = []
    if cfg.tts.engine == "piper":
        binary = shutil.which(cfg.tts.binary)
        if binary is None:
            checks.append(Check(
                "Piper", State.MISSING, f"'{cfg.tts.binary}' nicht im Pfad",
                "Installieren: pipx install piper-tts  (oder brew install piper)",
            ))
        else:
            checks.append(Check("Piper", State.OK, binary))
        stimme = Path(cfg.tts.voice_path).expanduser()
        if stimme.exists():
            checks.append(Check("Stimme", State.OK, stimme.name))
        else:
            checks.append(Check(
                "Stimme", State.MISSING, str(stimme),
                "Deutsche Stimmen: https://huggingface.co/rhasspy/piper-voices/tree/main/de/de_DE"
                " -- .onnx und .onnx.json zusammen ablegen.",
            ))
    # macOS `say` ist der Rueckfall und immer pruefenswert.
    if platform.system() == "Darwin":
        if shutil.which("say"):
            ok, out = _run(["say", "-v", "?"])
            stimmen = [z.split()[0] for z in out.splitlines()] if ok else []
            da = cfg.tts.macos_voice in stimmen
            checks.append(Check(
                "Rueckfall `say`", State.OK if da else State.DEGRADED,
                f"{cfg.tts.macos_voice} vorhanden" if da
                else f"Stimme '{cfg.tts.macos_voice}' nicht installiert",
                "" if da else "Systemeinstellungen > Bedienungshilfen > Gesprochene Inhalte "
                              "> Systemstimme > Stimme verwalten (deutsche Premiumstimme laden).",
            ))
        else:
            checks.append(Check("Rueckfall `say`", State.MISSING, "nicht gefunden"))
    else:
        checks.append(Check("Rueckfall `say`", State.MISSING,
                            "nur auf macOS vorhanden"))
    return checks


# -- Audio --------------------------------------------------------------
def check_audio(cfg: Config) -> list[Check]:
    try:
        import sounddevice  # noqa: PLC0415 -- optionale Abhaengigkeit
    except Exception as exc:  # noqa: BLE001
        return [Check("Audio", State.MISSING, f"sounddevice nicht nutzbar: {exc}",
                      "Installieren: pip install 'jarvis[speech]' "
                      "(braucht PortAudio: brew install portaudio)")]
    try:
        geraete = sounddevice.query_devices()
    except Exception as exc:  # noqa: BLE001
        return [Check("Audio", State.MISSING, f"keine Geraete abfragbar: {exc}",
                      "Auf macOS: Mikrofonrecht fuer das Terminal/die App erteilen "
                      "(Systemeinstellungen > Datenschutz & Sicherheit > Mikrofon).")]
    eingaenge = [d for d in geraete if d.get("max_input_channels", 0) > 0]
    ausgaenge = [d for d in geraete if d.get("max_output_channels", 0) > 0]
    checks = [Check(
        "Mikrofon", State.OK if eingaenge else State.MISSING,
        f"{len(eingaenge)} Eingang/Eingaenge" + (f", Vorgabe: {eingaenge[0]['name']}" if eingaenge else ""),
        "" if eingaenge else "Kein Aufnahmegeraet gefunden.",
    ), Check(
        "Audioausgabe", State.OK if ausgaenge else State.MISSING,
        f"{len(ausgaenge)} Ausgang/Ausgaenge",
    )]
    return checks


# -- Wortaktivierung ----------------------------------------------------
def check_wakeword(cfg: Config) -> Check:
    if cfg.wake.engine in ("none", "push_to_talk"):
        return Check("Aktivierungswort", State.DEGRADED, f"{cfg.wake.engine}",
                     "Ohne Aktivierungswort muss das Gespraech von Hand gestartet werden.")
    try:
        import openwakeword  # noqa: F401, PLC0415
    except Exception as exc:  # noqa: BLE001
        return Check("Aktivierungswort", State.MISSING, f"openwakeword fehlt: {exc}",
                     "Installieren: pip install 'jarvis[speech]'")
    return Check("Aktivierungswort", State.OK, f"openwakeword, '{cfg.wake.phrase}'")


# -- Laufzeitdaten ------------------------------------------------------
def check_state(cfg: Config) -> list[Check]:
    checks = []
    try:
        cfg.state_dir.mkdir(parents=True, exist_ok=True)
        probe = cfg.state_dir / ".schreibtest"
        probe.write_text("x")
        probe.unlink()
        checks.append(Check("Datenverzeichnis", State.OK, str(cfg.state_dir)))
    except OSError as exc:
        checks.append(Check("Datenverzeichnis", State.MISSING, f"{cfg.state_dir}: {exc}",
                            "Pfad in der Konfiguration unter state_dir anpassen."))
        return checks
    if cfg.db_path.exists():
        from .memory.db import Database  # noqa: PLC0415
        try:
            with Database(cfg.db_path) as db:
                version = db.query_one("PRAGMA user_version")[0]
                offen = db.query_one(
                    "SELECT COUNT(*) AS n FROM tasks WHERE status IN"
                    " ('planned','running','blocked','waiting')")["n"]
            checks.append(Check("Gedaechtnis", State.OK,
                                f"Schema {version}, {offen} offene Aufgabe(n)"))
        except Exception as exc:  # noqa: BLE001
            checks.append(Check("Gedaechtnis", State.DEGRADED, f"nicht lesbar: {exc}",
                                "Datei sichern und neu anlegen lassen."))
    else:
        checks.append(Check("Gedaechtnis", State.OK, "wird beim ersten Start angelegt"))
    return checks


def check_permissions(cfg: Config) -> Check:
    if not cfg.policy.roots:
        return Check("Berechtigungen", State.DEGRADED, "kein Verzeichnis freigegeben",
                     "In der Konfiguration unter [permissions] roots eintragen, "
                     "sonst kann JARVIS keine Dateien lesen.")
    stufen = ", ".join(sorted(s.value for s in cfg.policy.granted))
    return Check("Berechtigungen", State.OK,
                 f"{stufen}; {len(cfg.policy.roots)} Verzeichnis(se) freigegeben")


def run(cfg: Config | None = None) -> Report:
    """Fuehrt alle Pruefungen aus."""
    cfg = cfg or Config()
    report = Report()
    report.add(*check_platform())
    report.add(check_python())
    report.add(*check_llm(cfg))
    report.add(*check_stt(cfg))
    report.add(*check_tts(cfg))
    report.add(*check_audio(cfg))
    report.add(check_wakeword(cfg))
    report.add(*check_state(cfg))
    report.add(check_permissions(cfg))
    return report
