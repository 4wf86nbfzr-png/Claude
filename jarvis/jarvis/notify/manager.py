"""Benachrichtigungen.

JARVIS soll sich melden, wenn es etwas zu sagen gibt -- und sonst schweigen.
Dieses Modul entscheidet, *ob* gesprochen wird; was gesprochen wird, steht
schon im Text.

Vier Regeln:

* **Prioritaet.** Nur was die Schwelle erreicht, wird gesprochen. Alles
  andere landet lautlos in der Warteschlange und bleibt im Dashboard sichtbar.
* **Ruhezeiten.** Ausserhalb der Sprechzeiten wird nur ``URGENT`` laut.
* **Entdopplung.** Gleiche Meldung zur gleichen Sache kommt nur einmal --
  bei langen Aufgaben sonst der haeufigste Grund, warum ein Assistent nervt.
* **Mindestabstand.** Zwischen zwei gesprochenen Meldungen liegt eine
  Sperrzeit, damit nicht drei Teilschritte hintereinander ansagen.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import IntEnum


class Priority(IntEnum):
    """Hoeher ist dringender -- IntEnum, damit sich Schwellen vergleichen lassen."""

    DEBUG = 0      # nur Protokoll
    INFO = 1       # Dashboard, nicht sprechen
    NOTABLE = 2    # erwaehnenswert: abgeschlossener Arbeitsschritt
    IMPORTANT = 3  # Aufgabe fertig, Schritt fehlgeschlagen
    URGENT = 4     # Entscheidung noetig, Berechtigung fehlt -- durchbricht Ruhezeit


@dataclass(slots=True)
class Notification:
    text: str
    priority: Priority
    task_id: int | None = None
    dedupe_key: str | None = None
    created_at: float = 0.0
    #: Gesetzt, wenn die Meldung tatsaechlich gesprochen wurde.
    spoken_at: float | None = None
    #: Gesetzt, wenn sie bewusst stumm blieb -- mit Grund, fuers Protokoll.
    silenced_reason: str | None = None


@dataclass(slots=True)
class NotifyConfig:
    #: Ab dieser Prioritaet wird gesprochen.
    speak_threshold: Priority = Priority.IMPORTANT
    #: Sekunden Sperrzeit zwischen zwei gesprochenen Meldungen.
    min_gap_seconds: float = 20.0
    #: Sprechzeiten als Stunden (von, bis). Ausserhalb nur URGENT.
    quiet_hours: tuple[int, int] = (22, 8)
    #: Komplett stumm -- alles nur ins Dashboard.
    silent: bool = False


class NotificationManager:
    """Warteschlange mit Prioritaet; entscheidet ueber Sprechen oder Schweigen."""

    def __init__(self, config: NotifyConfig | None = None, clock=time.time,
                 localtime=time.localtime) -> None:
        self.config = config or NotifyConfig()
        self._clock = clock
        self._localtime = localtime
        self._queue: list[Notification] = []
        self._seen: dict[str, float] = {}
        self._last_spoken_at: float = 0.0
        #: Was gesprochen werden soll, in der Reihenfolge der Dringlichkeit.
        self._to_speak: list[Notification] = []

    # -- Eingang --------------------------------------------------------
    def push(self, text: str, priority: Priority = Priority.INFO, *,
             task_id: int | None = None, dedupe_key: str | None = None,
             dedupe_window: float = 600.0) -> Notification | None:
        """Nimmt eine Meldung auf.

        Gibt ``None`` zurueck, wenn sie als Dopplung verworfen wurde.
        """
        now = self._clock()
        if dedupe_key:
            zuletzt = self._seen.get(dedupe_key)
            if zuletzt is not None and now - zuletzt < dedupe_window:
                return None
            self._seen[dedupe_key] = now

        note = Notification(text=text, priority=priority, task_id=task_id,
                            dedupe_key=dedupe_key, created_at=now)
        self._queue.append(note)

        grund = self._why_silent(note, now)
        if grund:
            note.silenced_reason = grund
        else:
            self._to_speak.append(note)
            # Dringendes zuerst, bei gleicher Prioritaet das Aeltere.
            self._to_speak.sort(key=lambda n: (-int(n.priority), n.created_at))
        return note

    def _why_silent(self, note: Notification, now: float) -> str | None:
        if self.config.silent:
            return "lautlos geschaltet"
        if note.priority < self.config.speak_threshold:
            return f"unter der Schwelle ({note.priority.name})"
        if self._in_quiet_hours(now) and note.priority < Priority.URGENT:
            return "Ruhezeit"
        if now - self._last_spoken_at < self.config.min_gap_seconds \
                and note.priority < Priority.URGENT:
            return "Sperrzeit nach der letzten Meldung"
        return None

    def _in_quiet_hours(self, now: float) -> bool:
        von, bis = self.config.quiet_hours
        if von == bis:
            return False
        stunde = self._localtime(now).tm_hour
        if von < bis:
            return von <= stunde < bis
        return stunde >= von or stunde < bis  # ueber Mitternacht

    # -- Ausgang --------------------------------------------------------
    def next_to_speak(self) -> Notification | None:
        """Die naechste Meldung fuer die Sprachausgabe, oder ``None``.

        Die Sperrzeit wird hier erneut geprueft: zwischen Einreihen und
        Abholen kann Zeit vergangen sein, und eine zurueckgehaltene Meldung
        soll nachruecken, sobald sie darf.
        """
        now = self._clock()
        for index, note in enumerate(self._to_speak):
            if note.priority < Priority.URGENT:
                if now - self._last_spoken_at < self.config.min_gap_seconds:
                    return None
                if self._in_quiet_hours(now):
                    continue
            return self._to_speak.pop(index)
        return None

    def mark_spoken(self, note: Notification) -> None:
        note.spoken_at = self._clock()
        self._last_spoken_at = note.spoken_at

    def retry_silenced(self) -> int:
        """Holt Meldungen zurueck in die Sprechliste, die nur an Sperr- oder
        Ruhezeit gescheitert sind. Unter der Schwelle Liegendes bleibt stumm."""
        zurueck = [n for n in self._queue
                   if n.spoken_at is None and n not in self._to_speak
                   and n.silenced_reason in ("Ruhezeit", "Sperrzeit nach der letzten Meldung")]
        now = self._clock()
        for note in zurueck:
            if not self._why_silent(note, now):
                note.silenced_reason = None
                self._to_speak.append(note)
        self._to_speak.sort(key=lambda n: (-int(n.priority), n.created_at))
        return len(zurueck)

    def interrupt(self) -> int:
        """Verwirft wartende Sprachmeldungen -- wenn der Nutzer zu sprechen
        beginnt, sind veraltete Ansagen stoerend. URGENT bleibt erhalten."""
        behalten = [n for n in self._to_speak if n.priority >= Priority.URGENT]
        verworfen = len(self._to_speak) - len(behalten)
        self._to_speak = behalten
        return verworfen

    # -- Einblick -------------------------------------------------------
    def pending(self) -> list[Notification]:
        return list(self._to_speak)

    def history(self, limit: int = 50) -> list[Notification]:
        return self._queue[-limit:]
