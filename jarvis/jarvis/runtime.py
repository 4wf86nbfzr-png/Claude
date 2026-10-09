"""Laufzeit: setzt JARVIS zusammen und haelt ihn am Leben.

Hier laufen Gedaechtnis, Agent, Werkzeuge, Sprachpipeline, Benachrichtigungen
und Dashboard zusammen. Ausserdem das, was bei einem Dauerlaeufer nicht fehlen
darf:

* **Nur eine Instanz.** Eine Sperrdatei mit Prozesskennung verhindert, dass
  zwei JARVIS gleichzeitig auf dasselbe Mikrofon und dieselbe Datenbank gehen.
  Eine Sperre von einem toten Prozess wird uebernommen, nicht respektiert --
  sonst muss man nach einem Absturz von Hand aufraeumen.
* **Offene Aufgaben ehrlich wiederfinden.** Beim Start werden
  ``laeuft``-Aufgaben blockiert: nach einem Absturz laeuft nichts mehr.
* **Sauberes Beenden.** SIGTERM und SIGINT fahren Pipeline, Audio und
  Datenbank geordnet herunter.
* **Gesundheitspruefung.** Ein Faden sieht regelmaessig nach, ob Modell und
  Audio noch da sind, und meldet den Ausfall statt ihn zu verschweigen.
"""

from __future__ import annotations

import os
import signal
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from .agent import Agent
from .config import Config
from .llm.client import NullLLM, OllamaClient
from .logging_setup import get_logger, setup
from .memory.db import Database
from .notify.manager import NotificationManager, Priority
from .tools.builtin import build_registry

log = get_logger("runtime")


class AlreadyRunning(RuntimeError):
    """Es laeuft schon ein JARVIS."""


class InstanceLock:
    """Sperrdatei mit Prozesskennung."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._held = False

    def acquire(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            alt = self._read_pid()
            if alt is not None and self._alive(alt):
                raise AlreadyRunning(
                    f"JARVIS laeuft bereits (Prozess {alt}). "
                    f"Beenden mit: kill {alt}")
            log.info("Verwaiste Sperrdatei von Prozess %s wird uebernommen.", alt)
            self.path.unlink(missing_ok=True)
        self.path.write_text(str(os.getpid()), encoding="utf-8")
        self._held = True

    def release(self) -> None:
        if not self._held:
            return
        # Nur die eigene Sperre loeschen -- nicht die eines Nachfolgers.
        if self._read_pid() == os.getpid():
            self.path.unlink(missing_ok=True)
        self._held = False

    def _read_pid(self) -> int | None:
        try:
            return int(self.path.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            return None

    @staticmethod
    def _alive(pid: int) -> bool:
        if pid <= 0:
            return False
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            # Fremder Prozess mit dieser Kennung -- er lebt, gehoert aber
            # vielleicht nicht uns. Sicherer ist: als laufend behandeln.
            return True
        except OSError:
            return False
        return True

    def __enter__(self) -> "InstanceLock":
        self.acquire()
        return self

    def __exit__(self, *_exc) -> None:
        self.release()


@dataclass(slots=True)
class HealthState:
    llm: tuple[bool, str] = (False, "nicht geprueft")
    audio: tuple[bool, str] = (False, "nicht geprueft")
    checked_at: float = 0.0


class JarvisRuntime:
    """Der laufende JARVIS."""

    def __init__(self, config: Config, *, with_voice: bool = True) -> None:
        self.config = config
        self.with_voice = with_voice
        self.started_at = time.time()
        self.lock = InstanceLock(config.state_dir / "jarvis.pid")
        self.db: Database | None = None
        self.agent: Agent | None = None
        self.pipeline = None
        self.dashboard = None
        self.health_state = HealthState()
        self._stop = threading.Event()
        self._health_thread: threading.Thread | None = None
        self._notify_thread: threading.Thread | None = None

    # -- Aufbau ---------------------------------------------------------
    def setup(self) -> None:
        from . import secrets

        setup(self.config.log_path, self.config.log_level, secrets.known())
        log.info("JARVIS startet (Konfiguration: %s)", self.config.state_dir)
        self.lock.acquire()

        self.db = Database(self.config.db_path)
        llm = (OllamaClient(self.config.llm) if self.config.llm.runtime != "none"
               else NullLLM())
        notifications = NotificationManager(self.config.notify)
        self.agent = Agent(self.config, self.db, llm, notifications=notifications)
        # Werkzeuge brauchen den Agenten (fuer Gedaechtnis- und
        # Aufgabenwerkzeuge), der Agent das Verzeichnis -- deshalb nachtraeglich.
        self.agent.registry = build_registry(self.config, agent=self.agent)

        wieder = self.agent.tasks.resume_after_restart()
        if wieder:
            log.info("%d offene Aufgabe(n) nach dem Start gefunden.", len(wieder))
            unterbrochen = [t for t in wieder
                            if t.blocked_reason and "Neustart" in t.blocked_reason]
            if unterbrochen:
                notifications.push(
                    f"{len(unterbrochen)} Aufgabe(n) wurden durch den Neustart "
                    "unterbrochen und warten auf Fortsetzung.",
                    Priority.IMPORTANT, dedupe_key="neustart-unterbrochen")

        if self.with_voice:
            self._setup_voice()

        self._install_signals()
        log.info("JARVIS ist bereit.")

    def _setup_voice(self) -> None:
        from .speech.audio import MicrophoneSource
        from .speech.pipeline import VoicePipeline
        from .speech.stt import build_stt
        from .speech.tts import Speaker, build_engine
        from .speech.wakeword import build_detector

        mikrofon = MicrophoneSource(self.config.audio)
        ok, grund = mikrofon.available()
        if not ok:
            log.warning("Kein Mikrofon: %s -- JARVIS laeuft ohne Sprache.", grund)
            self.agent.notifications.push(
                f"Die Sprachsteuerung ist aus: {grund}", Priority.IMPORTANT,
                dedupe_key="kein-mikrofon")
            return

        self.pipeline = VoicePipeline(
            self.config, self.agent,
            audio=mikrofon,
            detector=build_detector(self.config.wake),
            stt=build_stt(self.config.stt),
            speaker=Speaker(build_engine(self.config.tts)),
        )

    # -- Betrieb --------------------------------------------------------
    def start(self) -> None:
        if self.pipeline is not None:
            try:
                self.pipeline.start()
            except Exception as exc:  # noqa: BLE001
                log.error("Sprachpipeline nicht gestartet: %s", exc)
        self._health_thread = threading.Thread(target=self._health_loop,
                                               name="jarvis-health", daemon=True)
        self._health_thread.start()
        self._notify_thread = threading.Thread(target=self._notify_loop,
                                               name="jarvis-notify", daemon=True)
        self._notify_thread.start()

    def run_forever(self) -> None:
        """Laeuft, bis ein Signal kommt."""
        self.start()
        try:
            while not self._stop.wait(0.5):
                pass
        except KeyboardInterrupt:
            log.info("Abbruch per Tastatur.")
        finally:
            self.shutdown()

    def shutdown(self) -> None:
        """Faehrt geordnet herunter. Mehrfacher Aufruf ist unschaedlich."""
        if self._stop.is_set() and self.db is None:
            return
        log.info("JARVIS wird beendet.")
        self._stop.set()
        if self.pipeline is not None:
            try:
                self.pipeline.stop()
            except Exception:  # noqa: BLE001
                log.exception("Sprachpipeline liess sich nicht sauber beenden")
            self.pipeline = None
        for faden in (self._health_thread, self._notify_thread):
            if faden is not None:
                faden.join(timeout=3)
        if self.db is not None:
            self.db.close()
            self.db = None
        self.lock.release()
        log.info("JARVIS ist beendet.")

    def _install_signals(self) -> None:
        def behandeln(signum, _frame) -> None:
            log.info("Signal %s empfangen.", signal.Signals(signum).name)
            self._stop.set()

        for sig in (signal.SIGTERM, signal.SIGINT):
            try:
                signal.signal(sig, behandeln)
            except ValueError:
                # Nicht im Hauptfaden (Tests, eingebetteter Betrieb) -- dann
                # uebernimmt der Aufrufer das Beenden.
                log.debug("Signal %s nicht setzbar (kein Hauptfaden).", sig)

    # -- Hintergrundfaeden ----------------------------------------------
    def _health_loop(self) -> None:
        """Sieht regelmaessig nach, ob die Bausteine noch da sind."""
        while not self._stop.wait(30.0):
            try:
                self._check_health()
            except Exception:  # noqa: BLE001
                log.exception("Gesundheitspruefung gescheitert")

    def _check_health(self) -> None:
        vorher = self.health_state.llm[0]
        self.health_state.llm = self.agent.llm.health()
        self.health_state.checked_at = time.time()
        if self.pipeline is not None:
            self.health_state.audio = self.pipeline.audio.available()
        jetzt, grund = self.health_state.llm
        if vorher and not jetzt:
            log.error("Sprachmodell ist weg: %s", grund)
            self.agent.notifications.push(
                f"Das Sprachmodell antwortet nicht mehr: {grund}",
                Priority.URGENT, dedupe_key="llm-weg")
        elif jetzt and not vorher:
            log.info("Sprachmodell ist wieder da.")

    def _notify_loop(self) -> None:
        """Spricht freigegebene Meldungen, wenn JARVIS gerade nichts tut."""
        while not self._stop.wait(2.0):
            try:
                if self.pipeline is not None:
                    self.pipeline.speak_pending_notifications()
                else:
                    # Ohne Sprache: nur als gesprochen vermerken waere falsch.
                    # Die Meldungen bleiben im Dashboard sichtbar.
                    pass
                self.agent.notifications.retry_silenced()
            except Exception:  # noqa: BLE001
                log.exception("Meldungsschleife gescheitert")

    # -- Fuer das Dashboard ---------------------------------------------
    def attach_dashboard(self, dashboard) -> None:
        self.dashboard = dashboard
        if self.pipeline is not None:
            def melden(zustand) -> None:
                dashboard.broadcast_threadsafe(
                    {"typ": "zustand", "zustand": zustand.value})

            self.pipeline.on_state_change = melden

    def snapshot(self) -> dict:
        """Der aktuelle Zustand -- alles aus echten Quellen."""
        offen = self.agent.tasks.list(open_only=True, limit=50)
        bericht = self.agent.tasks.status_report()
        pipeline_zustand = (self.pipeline.state.value if self.pipeline is not None
                            else "ohne sprache")
        return {
            "zustand": pipeline_zustand,
            "pegel": round(self.pipeline.status.level, 4) if self.pipeline else 0.0,
            "laufzeit": round(time.time() - self.started_at, 1),
            "modell": self.config.llm.model,
            "modell_bereit": self.health_state.llm[0],
            "modell_grund": self.health_state.llm[1],
            "letztes_verstanden": (self.pipeline.status.last_transcript
                                   if self.pipeline else ""),
            "letzte_antwort": (self.pipeline.status.last_reply
                               if self.pipeline else ""),
            "letzte_latenz": (round(self.pipeline.status.last_latency, 2)
                              if self.pipeline else 0.0),
            "aeusserungen": self.pipeline.status.utterances if self.pipeline else 0,
            "letzter_fehler": (self.pipeline.status.last_error
                               if self.pipeline else None),
            "spricht": (self.pipeline.speaker.is_speaking
                        if self.pipeline else False),
            "aufgaben_offen": len(offen),
            "aufgaben": [{"id": t.id, "titel": t.title, "status": t.status.value,
                          "grund": t.blocked_reason} for t in offen[:10]],
            "aufgaben_bericht": bericht,
            "rueckfrage": (self.agent.pending.question()
                           if self.agent.pending else None),
            "meldungen_offen": len(self.agent.notifications.pending()),
            "werkzeuge": len(self.agent.registry.available()),
        }

    def health(self) -> dict:
        self._check_health()
        zustand = {
            "sprachmodell": {"ok": self.health_state.llm[0],
                             "grund": self.health_state.llm[1]},
            "gedaechtnis": {"ok": self.db is not None,
                            "pfad": str(self.config.db_path)},
            "werkzeuge": {
                "einsatzbereit": sorted(t.name for t in self.agent.registry.available()),
                "nicht_bereit": {t.name: t.unavailable_reason
                                 for t in self.agent.registry.all()
                                 if not t.available},
            },
            "berechtigungen": sorted(s.value for s in self.config.policy.granted),
            "laufzeit": round(time.time() - self.started_at, 1),
        }
        if self.pipeline is not None:
            zustand["sprache"] = self.pipeline.health()
        else:
            zustand["sprache"] = {"ok": False, "grund": "Sprachpipeline laeuft nicht"}
        return zustand
