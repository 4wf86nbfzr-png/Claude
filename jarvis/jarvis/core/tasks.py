"""Aufgaben- und Erinnerungsverwaltung.

Beides liegt in derselben Datenbank wie das Gedaechtnis, damit Telegram,
Dashboard und Telefon nicht auseinanderlaufen. Erinnerungen koennen an
eine Aufgabe haengen (``task_id``) und ueber Telegram, Telefon oder beides
zugestellt werden.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ..db.database import Database, iso, parse_iso, utcnow
from .timeutil import describe_recurrence, format_local, next_occurrence

log = logging.getLogger(__name__)

STATUS_OPEN = "offen"
STATUS_RUNNING = "laeuft"
STATUS_DONE = "erledigt"
STATUS_CANCELLED = "abgebrochen"
OPEN_STATES = (STATUS_OPEN, STATUS_RUNNING)

PRIORITY_WORDS = {
    "hoch": 1, "wichtig": 1, "dringend": 1, "sehr hoch": 1, "1": 1,
    "mittel": 3, "normal": 3, "3": 3,
    "niedrig": 5, "unwichtig": 5, "irgendwann": 5, "5": 5,
    "2": 2, "4": 4,
}


def parse_priority(raw: str | int | None, default: int = 3) -> int:
    if raw is None or raw == "":
        return default
    if isinstance(raw, int):
        return max(1, min(5, raw))
    text = str(raw).strip().lower()
    if text in PRIORITY_WORDS:
        return PRIORITY_WORDS[text]
    try:
        return max(1, min(5, int(text)))
    except ValueError:
        return default


def priority_label(priority: int) -> str:
    return {1: "hoch", 2: "erhoeht", 3: "normal", 4: "niedrig", 5: "irgendwann"}.get(priority, "normal")


@dataclass(slots=True)
class Task:
    id: int
    title: str
    notes: str
    status: str
    priority: int
    due_at: datetime | None
    project: str
    depends_on: int | None
    result: str
    created_at: datetime | None
    completed_at: datetime | None

    def line(self, tz: ZoneInfo) -> str:
        marks = {STATUS_OPEN: "•", STATUS_RUNNING: "▸", STATUS_DONE: "✓", STATUS_CANCELLED: "✗"}
        parts = [f"{marks.get(self.status, '•')} #{self.id} {self.title}"]
        extras = []
        if self.priority <= 2:
            extras.append(f"Prio {priority_label(self.priority)}")
        if self.due_at:
            extras.append(format_local(self.due_at, tz))
        if self.project:
            extras.append(self.project)
        if self.depends_on:
            extras.append(f"wartet auf #{self.depends_on}")
        if extras:
            parts.append("(" + ", ".join(extras) + ")")
        return " ".join(parts)


@dataclass(slots=True)
class Reminder:
    id: int
    text: str
    due_at: datetime
    recurrence: str
    channel: str
    status: str
    task_id: int | None
    chat_id: str
    attempts: int
    max_attempts: int
    escalate_phone: bool
    triggered_at: datetime | None
    confirmed_at: datetime | None

    def line(self, tz: ZoneInfo) -> str:
        bits = [f"#{self.id} {self.text} — {format_local(self.due_at, tz)}"]
        extras = []
        if self.recurrence:
            extras.append(describe_recurrence(self.recurrence))
        if self.channel != "telegram":
            extras.append({"telefon": "per Anruf", "beides": "Telegram + Anruf"}.get(self.channel, self.channel))
        elif self.escalate_phone:
            extras.append("Anruf bei fehlender Bestaetigung")
        if self.status != "geplant":
            extras.append(self.status)
        if extras:
            bits.append("(" + ", ".join(extras) + ")")
        return " ".join(bits)


def _task(row) -> Task:
    return Task(
        id=row["id"], title=row["title"], notes=row["notes"], status=row["status"],
        priority=row["priority"], due_at=parse_iso(row["due_at"]), project=row["project"],
        depends_on=row["depends_on"], result=row["result"],
        created_at=parse_iso(row["created_at"]), completed_at=parse_iso(row["completed_at"]),
    )


def _reminder(row) -> Reminder:
    return Reminder(
        id=row["id"], text=row["text"], due_at=parse_iso(row["due_at"]) or utcnow(),
        recurrence=row["recurrence"], channel=row["channel"], status=row["status"],
        task_id=row["task_id"], chat_id=row["chat_id"], attempts=row["attempts"],
        max_attempts=row["max_attempts"], escalate_phone=bool(row["escalate_phone"]),
        triggered_at=parse_iso(row["triggered_at"]), confirmed_at=parse_iso(row["confirmed_at"]),
    )


class TaskStore:
    def __init__(self, database: Database) -> None:
        self.db = database

    # --- Aufgaben ---------------------------------------------------------
    def create(
        self, title: str, *, notes: str = "", priority: int | str = 3,
        due_at: datetime | None = None, project: str = "", depends_on: int | None = None,
    ) -> Task:
        title = (title or "").strip()
        if not title:
            raise ValueError("Eine Aufgabe braucht einen Titel.")
        now = iso(utcnow())
        task_id = self.db.insert("task", {
            "title": title[:400], "notes": notes.strip(), "status": STATUS_OPEN,
            "priority": parse_priority(priority), "due_at": iso(due_at) if due_at else None,
            "project": project.strip()[:120], "depends_on": depends_on,
            "created_at": now, "updated_at": now,
        })
        task = self.get(task_id)
        assert task is not None
        return task

    def get(self, task_id: int) -> Task | None:
        row = self.db.query_one("SELECT * FROM task WHERE id = ?", (task_id,))
        return _task(row) if row else None

    def update(
        self, task_id: int, *, title: str | None = None, notes: str | None = None,
        status: str | None = None, priority: int | str | None = None,
        due_at: datetime | None = None, clear_due: bool = False,
        project: str | None = None, depends_on: int | None = None, result: str | None = None,
    ) -> Task | None:
        values: dict[str, object] = {}
        if title is not None:
            values["title"] = title.strip()[:400]
        if notes is not None:
            values["notes"] = notes.strip()
        if status is not None:
            values["status"] = status
            if status == STATUS_DONE:
                values["completed_at"] = iso(utcnow())
            elif status in OPEN_STATES:
                values["completed_at"] = None
        if priority is not None:
            values["priority"] = parse_priority(priority)
        if clear_due:
            values["due_at"] = None
        elif due_at is not None:
            values["due_at"] = iso(due_at)
        if project is not None:
            values["project"] = project.strip()[:120]
        if depends_on is not None:
            values["depends_on"] = depends_on or None
        if result is not None:
            values["result"] = result.strip()
        if not values:
            return self.get(task_id)
        values["updated_at"] = iso(utcnow())
        self.db.update("task", task_id, values)
        return self.get(task_id)

    def complete(self, task_id: int, result: str = "") -> Task | None:
        return self.update(task_id, status=STATUS_DONE, result=result)

    def list(
        self, *, status: str | tuple[str, ...] | None = OPEN_STATES, limit: int = 50,
        project: str | None = None, due_before: datetime | None = None,
        search: str | None = None,
    ) -> list[Task]:
        clauses: list[str] = []
        params: list[object] = []
        if status:
            states = (status,) if isinstance(status, str) else tuple(status)
            clauses.append("status IN (" + ", ".join("?" for _ in states) + ")")
            params.extend(states)
        if project:
            clauses.append("project = ?")
            params.append(project)
        if due_before:
            clauses.append("due_at IS NOT NULL AND due_at <= ?")
            params.append(iso(due_before))
        if search:
            clauses.append("(title LIKE ? OR notes LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%"])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        rows = self.db.query(
            f"SELECT * FROM task {where} ORDER BY "
            "CASE WHEN status = 'laeuft' THEN 0 ELSE 1 END, priority, "
            "CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at, id "
            "LIMIT ?",
            params,
        )
        return [_task(r) for r in rows]

    def overdue(self, reference: datetime | None = None) -> list[Task]:
        rows = self.db.query(
            "SELECT * FROM task WHERE status IN ('offen','laeuft') AND due_at IS NOT NULL "
            "AND due_at <= ? ORDER BY due_at",
            (iso(reference or utcnow()),),
        )
        return [_task(r) for r in rows]

    def find(self, query: str, limit: int = 5) -> list[Task]:
        """Aufgabe anhand eines Stichworts oder einer ``#id`` finden."""
        query = (query or "").strip()
        if not query:
            return []
        if query.startswith("#") and query[1:].isdigit():
            task = self.get(int(query[1:]))
            return [task] if task else []
        if query.isdigit():
            task = self.get(int(query))
            if task:
                return [task]
        return self.list(status=None, search=query, limit=limit)

    def counts(self) -> dict[str, int]:
        rows = self.db.query("SELECT status, COUNT(*) AS n FROM task GROUP BY status")
        return {r["status"]: r["n"] for r in rows}

    def delete(self, task_id: int) -> bool:
        return bool(self.db.execute("DELETE FROM task WHERE id = ?", (task_id,)).rowcount)


class ReminderStore:
    def __init__(self, database: Database) -> None:
        self.db = database

    def create(
        self, text: str, due_at: datetime, *, recurrence: str = "", channel: str = "telegram",
        task_id: int | None = None, chat_id: str = "", escalate_phone: bool = False,
        max_attempts: int = 1,
    ) -> Reminder:
        text = (text or "").strip()
        if not text:
            raise ValueError("Eine Erinnerung braucht einen Text.")
        now = iso(utcnow())
        reminder_id = self.db.insert("reminder", {
            "text": text[:500], "due_at": iso(due_at), "recurrence": recurrence,
            "channel": channel, "status": "geplant", "task_id": task_id,
            "chat_id": str(chat_id), "attempts": 0,
            "max_attempts": max(1, int(max_attempts)),
            "escalate_phone": 1 if escalate_phone else 0,
            "created_at": now, "updated_at": now,
        })
        reminder = self.get(reminder_id)
        assert reminder is not None
        return reminder

    def get(self, reminder_id: int) -> Reminder | None:
        row = self.db.query_one("SELECT * FROM reminder WHERE id = ?", (reminder_id,))
        return _reminder(row) if row else None

    def due(self, reference: datetime | None = None, limit: int = 20) -> list[Reminder]:
        rows = self.db.query(
            "SELECT * FROM reminder WHERE status = 'geplant' AND due_at <= ? "
            "ORDER BY due_at LIMIT ?",
            (iso(reference or utcnow()), limit),
        )
        return [_reminder(r) for r in rows]

    def upcoming(self, limit: int = 20, include_done: bool = False) -> list[Reminder]:
        states = ("geplant", "ausgeloest") if not include_done else (
            "geplant", "ausgeloest", "bestaetigt", "abgebrochen")
        rows = self.db.query(
            "SELECT * FROM reminder WHERE status IN (" + ",".join("?" for _ in states) + ") "
            "ORDER BY due_at LIMIT ?",
            (*states, limit),
        )
        return [_reminder(r) for r in rows]

    def mark_triggered(self, reminder_id: int) -> None:
        self.db.execute(
            "UPDATE reminder SET status = 'ausgeloest', triggered_at = ?, "
            "attempts = attempts + 1, updated_at = ? WHERE id = ?",
            (iso(utcnow()), iso(utcnow()), reminder_id),
        )

    def confirm(self, reminder_id: int) -> Reminder | None:
        self.db.execute(
            "UPDATE reminder SET status = 'bestaetigt', confirmed_at = ?, updated_at = ? WHERE id = ?",
            (iso(utcnow()), iso(utcnow()), reminder_id),
        )
        return self.get(reminder_id)

    def cancel(self, reminder_id: int) -> Reminder | None:
        self.db.execute(
            "UPDATE reminder SET status = 'abgebrochen', updated_at = ? WHERE id = ?",
            (iso(utcnow()), reminder_id),
        )
        return self.get(reminder_id)

    def snooze(self, reminder_id: int, until: datetime) -> Reminder | None:
        self.db.execute(
            "UPDATE reminder SET status = 'geplant', due_at = ?, updated_at = ? WHERE id = ?",
            (iso(until), iso(utcnow()), reminder_id),
        )
        return self.get(reminder_id)

    def reschedule_recurring(self, reminder: Reminder, tz: ZoneInfo) -> datetime | None:
        """Legt den naechsten Termin einer wiederkehrenden Erinnerung an."""
        if not reminder.recurrence:
            return None
        following = next_occurrence(reminder.recurrence, reminder.due_at, tz)
        # Wenn der Dienst stillstand, so lange weiterspringen, bis der Termin in der Zukunft liegt.
        guard = 0
        while following is not None and following <= utcnow() and guard < 500:
            following = next_occurrence(reminder.recurrence, following, tz)
            guard += 1
        if following is None:
            return None
        self.db.execute(
            "UPDATE reminder SET status = 'geplant', due_at = ?, attempts = 0, "
            "triggered_at = NULL, confirmed_at = NULL, updated_at = ? WHERE id = ?",
            (iso(following), iso(utcnow()), reminder.id),
        )
        return following

    def unconfirmed(self, older_than_minutes: int) -> list[Reminder]:
        """Ausgeloest, aber nicht bestaetigt -- Grundlage fuer die Eskalation."""
        cutoff = iso(utcnow() - timedelta(minutes=older_than_minutes))
        rows = self.db.query(
            "SELECT * FROM reminder WHERE status = 'ausgeloest' AND triggered_at IS NOT NULL "
            "AND triggered_at <= ? AND attempts < max_attempts ORDER BY triggered_at",
            (cutoff,),
        )
        return [_reminder(r) for r in rows]

    def find(self, query: str, limit: int = 5) -> list[Reminder]:
        query = (query or "").strip()
        if not query:
            return []
        if query.lstrip("#").isdigit():
            reminder = self.get(int(query.lstrip("#")))
            return [reminder] if reminder else []
        rows = self.db.query(
            "SELECT * FROM reminder WHERE text LIKE ? ORDER BY "
            "CASE WHEN status = 'geplant' THEN 0 ELSE 1 END, due_at LIMIT ?",
            (f"%{query}%", limit),
        )
        return [_reminder(r) for r in rows]

    def delete(self, reminder_id: int) -> bool:
        return bool(self.db.execute("DELETE FROM reminder WHERE id = ?", (reminder_id,)).rowcount)
