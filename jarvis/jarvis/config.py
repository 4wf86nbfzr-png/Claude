"""Konfiguration.

Eine TOML-Datei, gelesen mit ``tomllib`` aus der Standardbibliothek. Fehlende
Werte bekommen Vorgaben, unbekannte Schluessel werden gemeldet statt
stillschweigend ignoriert -- ein Tippfehler in der Konfiguration soll nicht
dazu fuehren, dass eine Einstellung wirkungslos bleibt.

Zugangsdaten stehen *nicht* hier. Sie werden ueber Umgebungsvariablen oder den
macOS-Schluesselbund geholt (siehe ``secrets.py``).
"""

from __future__ import annotations

import tomllib
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path

from .notify.manager import NotifyConfig, Priority
from .permissions import Policy

#: Vorgabeort der Konfiguration und der Laufzeitdaten.
DEFAULT_CONFIG_PATH = Path("~/.config/jarvis/config.toml").expanduser()
DEFAULT_STATE_DIR = Path("~/.local/state/jarvis").expanduser()


class ConfigError(ValueError):
    """Die Konfiguration ist unbrauchbar -- mit Hinweis, was zu tun ist."""


@dataclass(slots=True)
class LLMConfig:
    #: Laufzeit: "ollama" (lokal) oder "none" (kein Modell, nur Werkzeuge).
    runtime: str = "ollama"
    base_url: str = "http://127.0.0.1:11434"
    model: str = "qwen2.5:7b-instruct"
    #: Kontextfenster. Zu gross kostet Speicher, ohne zu helfen.
    context_tokens: int = 8192
    temperature: float = 0.4
    #: Sekunden, bis eine Modellanfrage aufgegeben wird.
    timeout_seconds: float = 90.0
    #: Beitraege, die ins Kontextfenster gehen.
    history_turns: int = 20


@dataclass(slots=True)
class STTConfig:
    #: "whisper_cpp" oder "none".
    engine: str = "whisper_cpp"
    #: Pfad zur whisper-cli bzw. zum Binary.
    binary: str = "whisper-cli"
    model_path: str = "~/.local/share/jarvis/models/ggml-large-v3-turbo-q5_0.bin"
    language: str = "de"
    #: Sekunden Stille, nach denen eine Aeusserung als beendet gilt.
    silence_timeout: float = 0.8
    #: Harte Obergrenze einer einzelnen Aeusserung.
    max_utterance_seconds: float = 30.0


@dataclass(slots=True)
class TTSConfig:
    #: "piper", "say" (macOS) oder "none".
    engine: str = "piper"
    binary: str = "piper"
    voice_path: str = "~/.local/share/jarvis/voices/de_DE-thorsten-high.onnx"
    #: macOS-Stimme fuer den Rueckfall ueber `say`.
    macos_voice: str = "Markus"
    speed: float = 1.0
    sample_rate: int = 22050


@dataclass(slots=True)
class WakeConfig:
    #: "openwakeword", "push_to_talk" oder "none".
    engine: str = "openwakeword"
    phrase: str = "hey jarvis"
    #: Erkennungsschwelle. Hoeher = weniger Fehlauslosungen, mehr Nichterkennen.
    threshold: float = 0.6
    #: Sekunden, die das Gespraech nach der letzten Aeusserung offen bleibt --
    #: damit das Aktivierungswort nicht vor jedem Satz wiederholt werden muss.
    conversation_timeout: float = 25.0


@dataclass(slots=True)
class AudioConfig:
    input_device: str | None = None
    output_device: str | None = None
    sample_rate: int = 16000
    #: Blockgroesse der Aufnahme in Millisekunden.
    block_ms: int = 30
    #: Schwelle der Sprachaktivitaetserkennung (RMS, 0..1).
    vad_threshold: float = 0.015


@dataclass(slots=True)
class Config:
    state_dir: Path = field(default_factory=lambda: DEFAULT_STATE_DIR)
    #: Wie der Nutzer angesprochen wird.
    user_name: str = "Noah"
    llm: LLMConfig = field(default_factory=LLMConfig)
    stt: STTConfig = field(default_factory=STTConfig)
    tts: TTSConfig = field(default_factory=TTSConfig)
    wake: WakeConfig = field(default_factory=WakeConfig)
    audio: AudioConfig = field(default_factory=AudioConfig)
    notify: NotifyConfig = field(default_factory=NotifyConfig)
    policy: Policy = field(default_factory=Policy)
    dashboard_host: str = "127.0.0.1"
    dashboard_port: int = 8765
    log_level: str = "INFO"

    @property
    def db_path(self) -> Path:
        return self.state_dir / "gedaechtnis.sqlite3"

    @property
    def log_path(self) -> Path:
        return self.state_dir / "jarvis.log"

    # -- Laden ----------------------------------------------------------
    @classmethod
    def load(cls, path: str | Path | None = None) -> "Config":
        """Liest die Konfiguration. Fehlt die Datei, gelten die Vorgaben."""
        ziel = Path(path).expanduser() if path else DEFAULT_CONFIG_PATH
        if not ziel.exists():
            return cls()
        try:
            data = tomllib.loads(ziel.read_text("utf-8"))
        except tomllib.TOMLDecodeError as exc:
            raise ConfigError(f"{ziel} ist kein gueltiges TOML: {exc}") from exc
        return cls.from_dict(data)

    @classmethod
    def from_dict(cls, data: dict) -> "Config":
        bekannt = {f.name for f in fields(cls)}
        # 'permissions' heisst in der Datei anders als das Feld 'policy'.
        unbekannt = set(data) - bekannt - {"permissions"}
        if unbekannt:
            raise ConfigError(
                f"Unbekannte Abschnitte in der Konfiguration: {sorted(unbekannt)}. "
                f"Erwartet werden: {sorted(bekannt - {'policy'}) + ['permissions']}"
            )
        cfg = cls()
        if "state_dir" in data:
            cfg.state_dir = Path(str(data["state_dir"])).expanduser()
        for simple in ("user_name", "dashboard_host", "dashboard_port", "log_level"):
            if simple in data:
                setattr(cfg, simple, data[simple])
        for name, typ in (("llm", LLMConfig), ("stt", STTConfig), ("tts", TTSConfig),
                          ("wake", WakeConfig), ("audio", AudioConfig)):
            if name in data:
                setattr(cfg, name, _build(typ, data[name], name))
        if "notify" in data:
            cfg.notify = _build_notify(data["notify"])
        if "permissions" in data:
            cfg.policy = Policy.from_config(data["permissions"])
        return cfg

    def to_dict(self) -> dict:
        out = {
            "state_dir": str(self.state_dir),
            "user_name": self.user_name,
            "dashboard_host": self.dashboard_host,
            "dashboard_port": self.dashboard_port,
            "log_level": self.log_level,
        }
        for name in ("llm", "stt", "tts", "wake", "audio"):
            out[name] = asdict(getattr(self, name))
        out["notify"] = {
            "speak_threshold": self.notify.speak_threshold.name,
            "min_gap_seconds": self.notify.min_gap_seconds,
            "quiet_hours": list(self.notify.quiet_hours),
            "silent": self.notify.silent,
        }
        out["permissions"] = {
            "granted": sorted(s.value for s in self.policy.granted),
            "auto_confirm": sorted(s.value for s in self.policy.auto_confirm),
            "roots": [str(p) for p in self.policy.roots],
            "allowed_apps": list(self.policy.allowed_apps),
            "allowed_scripts": [str(p) for p in self.policy.allowed_scripts],
        }
        return out


def _build(typ, data: dict, section: str):
    bekannt = {f.name for f in fields(typ)}
    unbekannt = set(data) - bekannt
    if unbekannt:
        raise ConfigError(
            f"[{section}]: unbekannte Schluessel {sorted(unbekannt)}. "
            f"Erlaubt sind {sorted(bekannt)}."
        )
    return typ(**data)


def _build_notify(data: dict) -> NotifyConfig:
    data = dict(data)
    schwelle = data.pop("speak_threshold", None)
    quiet = data.pop("quiet_hours", None)
    bekannt = {f.name for f in fields(NotifyConfig)} - {"speak_threshold", "quiet_hours"}
    unbekannt = set(data) - bekannt
    if unbekannt:
        raise ConfigError(f"[notify]: unbekannte Schluessel {sorted(unbekannt)}.")
    cfg = NotifyConfig(**data)
    if schwelle is not None:
        try:
            cfg.speak_threshold = Priority[str(schwelle).upper()]
        except KeyError as exc:
            erlaubt = ", ".join(p.name for p in Priority)
            raise ConfigError(
                f"[notify] speak_threshold '{schwelle}' kenne ich nicht. "
                f"Moeglich sind: {erlaubt}."
            ) from exc
    if quiet is not None:
        if not (isinstance(quiet, (list, tuple)) and len(quiet) == 2):
            raise ConfigError("[notify] quiet_hours muss zwei Stunden sein, z.B. [22, 8].")
        cfg.quiet_hours = (int(quiet[0]), int(quiet[1]))
    return cfg
