"""Aufgabenmanager.

Der Aufgabenstatus ist die Wahrheit ueber den Bearbeitungsstand -- nicht das,
was das Sprachmodell formuliert. Deshalb ist der Uebergang nach ``DONE`` hier
hart an einen Pruefvermerk gebunden: ohne ``verification`` keine erledigte
Aufgabe. Ein Modell kann JARVIS also nicht dazu bringen, Fortschritt zu
behaupten, den es nicht gibt -- es kann den Status nur ueber diese API aendern,
und die laesst es nicht zu.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum

from ..memory.db import Database


class Status(str, Enum):
    """Lebenszyklus einer Aufgabe."""

    PLANNED = "planned"            # angelegt, noch nicht begonnen
    RUNNING = "running"            # wird gerade bearbeitet
    BLOCKED = "blocked"            # haengt an fehlender Information/Berechtigung
    WAITING_EXTERNAL = "waiting"   # wartet auf eine Antwort von aussen
    FAILED = "failed"              # abgebrochen, Grund steht im Ereignis
    DONE = "done"                  # ausgefuehrt UND geprueft
    CANCELLED = "cancelled"


#: Erlaubte Uebergaenge. Alles andere ist ein Programmfehler und wirft.
TRANSITIONS: dict[Status, set[Status]] = {
    Status.PLANNED: {Status.RUNNING, Status.BLOCKED, Status.CANCELLED, Status.FAILED},
    Status.RUNNING: {Status.DONE, Status.FAILED, Status.BLOCKED,
                     Status.WAITING_EXTERNAL, Status.CANCELLED},
    Status.BLOCKED: {Status.RUNNING, Status.CANCELLED, Status.FAILED},
    Status.WAITING_EXTERNAL: {Status.RUNNING, Status.FAILED, Status.CANCELLED, Status.BLOCKED},
    # Endzustaende. FAILED darf neu aufgenommen werden, DONE nicht --
    # eine erledigte Aufgabe wird nicht stillschweigend wieder geoeffnet.
    Status.FAILED: {Status.RUNNING, Status.CANCELLED},
    Status.DONE: set(),
    Status.CANCELLED: set(),
}

#: Zustaende, in denen noch Arbeit aussteht.
OPEN_STATES = (Status.PLANNED, Status.RUNNING, Status.BLOCKED, Status.WAITING_EXTERNAL)


class TaskError(RuntimeError):
    """Unerlaubter Statuswechsel oder fehlender Pruefvermerk."""


@dataclass(slots=True)
class Task:
    id: int
    title: str
    detail: str
    status: Status
    priority: int
    parent_id: int | None
    created_at: float
    updated_at: float
    due_at: float | None
    result: str | None
    verification: str | None
    blocked_reason: str | None
    subtasks: list["Task"] = field(default_factory=list)

    @property
    def is_open(self) -> bool:
        return self.status in OPEN_STATES

    def summary(self) -> str:
        """Eine Zeile fuer Sprachausgabe und Dashboard."""
        label = {
            Status.PLANNED: "geplant",
            Status.RUNNING: "laeuft",
            Status.BLOCKED: "blockiert",
            Status.WAITING_EXTERNAL: "wartet auf Antwort",
            Status.FAILED: "fehlgeschlagen",
            Status.DONE: "erledigt",
            Status.CANCELLED: "abgebrochen",
        }[self.status]
        if self.status is Status.BLOCKED and self.blocked_reason:
            return f"{self.title} -- {label}: {self.blocked_reason}"
        return f"{self.title} -- {label}"


def _row_to_task(row) -> Task:
    return Task(
        id=row["id"],
        title=row["title"],
        detail=row["detail"],
        status=Status(row["status"]),
        priority=row["priority"],
        parent_id=row["parent_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        due_at=row["due_at"],
        result=row["result"],
        verification=row["verification"],
        blocked_reason=row["blocked_reason"],
    )


class TaskManager:
    """Verwaltet Aufgaben und ihre Teilschritte dauerhaft in SQLite."""

    def __init__(self, db: Database, clock=time.time) -> None:
        self.db = db
        self._clock = clock

    # -- anlegen --------------------------------------------------------
    def create(
        self,
        title: str,
        detail: str = "",
        priority: int = 2,
        parent_id: int | None = None,
        due_at: float | None = None,
    ) -> Task:
        title = title.strip()
        if not title:
            raise TaskError("Eine Aufgabe braucht einen Titel.")
        now = self._clock()
        cursor = self.db.execute(
            "INSERT INTO tasks (title, detail, status, priority, parent_id,"
            " created_at, updated_at, due_at) VALUES (?,?,?,?,?,?,?,?)",
            (title, detail, Status.PLANNED.value, priority, parent_id, now, now, due_at),
        )
        task_id = int(cursor.lastrowid)
        self._log(task_id, "created", title)
        return self.get(task_id)

    def plan_steps(self, parent_id: int, steps: list[str]) -> list[Task]:
        """Zerlegt eine Aufgabe in Teilschritte."""
        parent = self.get(parent_id)
        return [self.create(step, parent_id=parent.id, priority=parent.priority)
                for step in steps]

    # -- lesen ----------------------------------------------------------
    def get(self, task_id: int, *, with_subtasks: bool = False) -> Task:
        row = self.db.query_one("SELECT * FROM tasks WHERE id = ?", (task_id,))
        if row is None:
            raise TaskError(f"Aufgabe {task_id} gibt es nicht.")
        task = _row_to_task(row)
        if with_subtasks:
            task.subtasks = [
                _row_to_task(r) for r in
                self.db.query("SELECT * FROM tasks WHERE parent_id = ? ORDER BY id", (task_id,))
            ]
        return task

    def list(self, *, status: Status | None = None, open_only: bool = False,
             limit: int = 100) -> list[Task]:
        if status is not None:
            rows = self.db.query(
                "SELECT * FROM tasks WHERE status = ? ORDER BY priority, id LIMIT ?",
                (status.value, limit),
            )
        elif open_only:
            marks = ",".join("?" * len(OPEN_STATES))
            rows = self.db.query(
                f"SELECT * FROM tasks WHERE status IN ({marks}) ORDER BY priority, id LIMIT ?",
                (*[s.value for s in OPEN_STATES], limit),
            )
        else:
            rows = self.db.query("SELECT * FROM tasks ORDER BY id DESC LIMIT ?", (limit,))
        return [_row_to_task(r) for r in rows]

    def events(self, task_id: int) -> list[dict]:
        return [dict(r) for r in self.db.query(
            "SELECT * FROM task_events WHERE task_id = ? ORDER BY id", (task_id,))]

    # -- Statuswechsel --------------------------------------------------
    def _set_status(self, task_id: int, new: Status, *, message: str = "",
                    result: str | None = None, verification: str | None = None,
                    blocked_reason: str | None = None) -> Task:
        current = self.get(task_id)
        if new is current.status:
            return current
        if new not in TRANSITIONS[current.status]:
            raise TaskError(
                f"Aufgabe {task_id}: Wechsel von {current.status.value} nach "
                f"{new.value} ist nicht vorgesehen."
            )
        self.db.execute(
            "UPDATE tasks SET status=?, updated_at=?, result=COALESCE(?, result),"
            " verification=COALESCE(?, verification), blocked_reason=? WHERE id=?",
            (new.value, self._clock(), result, verification, blocked_reason, task_id),
        )
        self._log(task_id, new.value, message)
        return self.get(task_id)

    def start(self, task_id: int, message: str = "") -> Task:
        return self._set_status(task_id, Status.RUNNING, message=message)

    def block(self, task_id: int, reason: str) -> Task:
        """Haelt an, weil etwas fehlt. Der Grund ist Pflicht -- JARVIS muss
        sagen koennen, *was* fehlt, nicht nur dass es nicht weitergeht."""
        if not reason.strip():
            raise TaskError("Blockieren ohne Grund ist nicht erlaubt.")
        return self._set_status(task_id, Status.BLOCKED, message=reason,
                                blocked_reason=reason.strip())

    def wait_external(self, task_id: int, reason: str) -> Task:
        return self._set_status(task_id, Status.WAITING_EXTERNAL, message=reason,
                                blocked_reason=reason.strip() or None)

    def fail(self, task_id: int, reason: str) -> Task:
        if not reason.strip():
            raise TaskError("Fehlschlag ohne Grund ist nicht erlaubt.")
        return self._set_status(task_id, Status.FAILED, message=reason)

    def cancel(self, task_id: int, reason: str = "") -> Task:
        return self._set_status(task_id, Status.CANCELLED, message=reason)

    def complete(self, task_id: int, result: str, verification: str) -> Task:
        """Erklaert eine Aufgabe fuer erledigt.

        ``verification`` beschreibt, *wie* das Ergebnis geprueft wurde (welche
        Datei gelesen, welcher Rueckgabewert, welche Ausgabe). Ein leerer
        Pruefvermerk wird abgelehnt: dann ist die Aufgabe nicht erledigt,
        sondern unbestaetigt, und bleibt ``running``.
        """
        if not verification or not verification.strip():
            raise TaskError(
                f"Aufgabe {task_id} kann nicht als erledigt gelten: es fehlt der "
                "Pruefvermerk. Ohne Pruefung bleibt der Status unveraendert."
            )
        # Teilschritte zuerst. Eine Aufgabe ist nicht fertig, solange ein
        # Schritt darunter noch offen ist.
        open_children = [
            t for t in self.get(task_id, with_subtasks=True).subtasks if t.is_open
        ]
        if open_children:
            raise TaskError(
                f"Aufgabe {task_id} hat noch {len(open_children)} offene Teilschritte: "
                + ", ".join(t.title for t in open_children)
            )
        return self._set_status(task_id, Status.DONE, message=result,
                                result=result, verification=verification.strip(),
                                blocked_reason=None)

    # -- Hilfen ---------------------------------------------------------
    def _log(self, task_id: int, kind: str, message: str = "") -> None:
        self.db.execute(
            "INSERT INTO task_events (task_id, kind, message, created_at) VALUES (?,?,?,?)",
            (task_id, kind, message, self._clock()),
        )

    def resume_after_restart(self) -> list[Task]:
        """Nach einem Neustart: alles, was unterbrochen wurde, zurueck in einen
        ehrlichen Zustand bringen.

        ``running`` ist nach einem Absturz eine Luege -- es laeuft nichts mehr.
        Solche Aufgaben werden blockiert mit klarem Grund, statt sie stillschweigend
        als laufend anzuzeigen.
        """
        interrupted = self.list(status=Status.RUNNING)
        for task in interrupted:
            self.block(task.id, "Durch Neustart unterbrochen, noch nicht wieder aufgenommen.")
        return self.list(open_only=True)

    def status_report(self) -> dict[str, int]:
        rows = self.db.query("SELECT status, COUNT(*) AS n FROM tasks GROUP BY status")
        return {r["status"]: r["n"] for r in rows}
