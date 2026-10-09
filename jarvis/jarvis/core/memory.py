"""Gedaechtnis.

Vier Schichten, alle in derselben Datenbank, damit Telegram, Dashboard und
Telefon denselben Stand sehen:

* **Gespraechsgedaechtnis** -- die letzten Nachrichten je Chat plus ein
  Zustand (laufendes Thema, offene Rueckfrage, Zusammenfassung).
* **Langzeitgedaechtnis** -- ausdruecklich gemerkte Dinge, mit
  Volltextsuche. Nur das Gesuchte geht in die KI-Anfrage, nie der
  ganze Bestand.
* **Aufgabengedaechtnis** -- siehe ``core.tasks``.
* **Ereignisgedaechtnis** -- was tatsaechlich passiert ist (``remember_event``).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from ..db.database import Database, iso, utcnow

log = logging.getLogger(__name__)

MAX_VALUE_LENGTH = 4000


@dataclass(slots=True)
class MemoryEntry:
    id: int
    key: str
    value: str
    kind: str
    importance: int
    updated_at: str

    def line(self) -> str:
        return f"#{self.id} {self.key}: {self.value}"


class Memory:
    def __init__(self, database: Database) -> None:
        self.db = database

    # --- Gespraechsgedaechtnis -------------------------------------------
    def add_message(
        self, chat_id: str, role: str, content: str, *,
        tool_name: str | None = None, channel: str = "telegram",
    ) -> int:
        message_id = self.db.insert("conversation", {
            "chat_id": str(chat_id), "role": role, "content": content,
            "tool_name": tool_name, "channel": channel, "created_at": iso(utcnow()),
        })
        self.db.execute(
            "INSERT INTO conversation_state (chat_id, message_count, updated_at) VALUES (?, 1, ?) "
            "ON CONFLICT (chat_id) DO UPDATE SET "
            "message_count = message_count + 1, updated_at = excluded.updated_at",
            (str(chat_id), iso(utcnow())),
        )
        return message_id

    def recent_messages(self, chat_id: str, limit: int = 16) -> list[dict[str, Any]]:
        rows = self.db.query(
            "SELECT role, content, tool_name FROM conversation "
            "WHERE chat_id = ? ORDER BY id DESC LIMIT ?",
            (str(chat_id), limit),
        )
        return [
            {"role": r["role"], "content": r["content"], "tool_name": r["tool_name"]}
            for r in reversed(rows)
        ]

    def message_count(self, chat_id: str) -> int:
        return int(self.db.scalar(
            "SELECT COUNT(*) FROM conversation WHERE chat_id = ?", (str(chat_id),)
        ) or 0)

    def get_state(self, chat_id: str) -> dict[str, Any]:
        row = self.db.query_one(
            "SELECT summary, topic, pending_question, pending_payload, message_count "
            "FROM conversation_state WHERE chat_id = ?",
            (str(chat_id),),
        )
        if row is None:
            return {"summary": "", "topic": "", "pending_question": "", "pending_payload": {},
                    "message_count": 0}
        try:
            payload = json.loads(row["pending_payload"] or "{}")
        except json.JSONDecodeError:
            payload = {}
        return {
            "summary": row["summary"], "topic": row["topic"],
            "pending_question": row["pending_question"], "pending_payload": payload,
            "message_count": row["message_count"],
        }

    def set_state(self, chat_id: str, **fields: Any) -> None:
        allowed = {"summary", "topic", "pending_question", "pending_payload"}
        values = {k: v for k, v in fields.items() if k in allowed}
        if not values:
            return
        if "pending_payload" in values and not isinstance(values["pending_payload"], str):
            values["pending_payload"] = json.dumps(values["pending_payload"], ensure_ascii=False)
        self.db.execute(
            "INSERT INTO conversation_state (chat_id, updated_at) VALUES (?, ?) "
            "ON CONFLICT (chat_id) DO NOTHING",
            (str(chat_id), iso(utcnow())),
        )
        assignments = ", ".join(f"{key} = ?" for key in values)
        self.db.execute(
            f"UPDATE conversation_state SET {assignments}, updated_at = ? WHERE chat_id = ?",
            [*values.values(), iso(utcnow()), str(chat_id)],
        )

    def clear_pending(self, chat_id: str) -> None:
        self.set_state(chat_id, pending_question="", pending_payload={})

    def clear_conversation(self, chat_id: str) -> int:
        count = self.message_count(chat_id)
        with self.db.transaction():
            self.db.execute("DELETE FROM conversation WHERE chat_id = ?", (str(chat_id),))
            self.db.execute("DELETE FROM conversation_state WHERE chat_id = ?", (str(chat_id),))
        return count

    def prune_conversation(self, chat_id: str, keep: int = 400) -> int:
        """Haelt den Gespraechsverlauf beschnitten; die Zusammenfassung bleibt."""
        cursor = self.db.execute(
            "DELETE FROM conversation WHERE chat_id = ? AND id NOT IN "
            "(SELECT id FROM conversation WHERE chat_id = ? ORDER BY id DESC LIMIT ?)",
            (str(chat_id), str(chat_id), keep),
        )
        return cursor.rowcount or 0

    # --- Langzeitgedaechtnis ---------------------------------------------
    def remember(
        self, key: str, value: str, *, kind: str = "fakt",
        importance: int = 3, source: str = "telegram",
    ) -> MemoryEntry:
        key = key.strip()[:200]
        value = value.strip()[:MAX_VALUE_LENGTH]
        if not key or not value:
            raise ValueError("Schluessel und Wert duerfen nicht leer sein.")
        importance = max(1, min(5, int(importance)))
        now = iso(utcnow())
        self.db.execute(
            "INSERT INTO memory (key, value, kind, importance, source, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT (key) DO UPDATE SET value = excluded.value, kind = excluded.kind, "
            "importance = excluded.importance, updated_at = excluded.updated_at",
            (key, value, kind, importance, source, now, now),
        )
        entry = self.get_memory_by_key(key)
        assert entry is not None
        return entry

    def get_memory_by_key(self, key: str) -> MemoryEntry | None:
        row = self.db.query_one(
            "SELECT id, key, value, kind, importance, updated_at FROM memory WHERE key = ?",
            (key.strip(),),
        )
        return self._entry(row) if row else None

    def get_memory(self, memory_id: int) -> MemoryEntry | None:
        row = self.db.query_one(
            "SELECT id, key, value, kind, importance, updated_at FROM memory WHERE id = ?",
            (memory_id,),
        )
        return self._entry(row) if row else None

    @staticmethod
    def _stem(term: str) -> str:
        """Grobe Stammform fuer die Suche.

        Deutsch beugt kraeftig: wer nach "telefonieren" sucht, meint auch
        "Telefoniert". Ein voller Stemmer waere hier zu viel Apparat -- lange
        Woerter werden deshalb hinten gekuerzt, damit die Praefixsuche von FTS
        die Beugungsformen mitnimmt. Kurze Woerter bleiben, wie sie sind.
        """
        if len(term) >= 8:
            return term[:len(term) - 3]
        if len(term) >= 6:
            return term[:len(term) - 1]
        return term

    def search_memory(self, query: str, limit: int = 8) -> list[MemoryEntry]:
        """Volltextsuche. Faellt auf LIKE zurueck, wenn FTS die Eingabe nicht mag."""
        query = (query or "").strip()
        if not query:
            return []
        terms = [t for t in (
            "".join(c if c.isalnum() or c.isspace() else " " for c in query.lower())
        ).split() if len(t) > 2]
        stems = []
        for term in terms[:8]:
            stamm = self._stem(term)
            if stamm not in stems:
                stems.append(stamm)
        if stems:
            expression = " OR ".join(f'"{t}"*' for t in stems)
            try:
                rows = self.db.query(
                    "SELECT m.id, m.key, m.value, m.kind, m.importance, m.updated_at "
                    "FROM memory_fts f JOIN memory m ON m.id = f.rowid "
                    "WHERE memory_fts MATCH ? ORDER BY m.importance DESC, bm25(memory_fts) LIMIT ?",
                    (expression, limit),
                )
                if rows:
                    return [self._entry(r) for r in rows]
            except Exception as exc:  # pragma: no cover - FTS-Syntax
                log.debug("FTS-Suche fehlgeschlagen, nutze LIKE: %s", exc)

        # Rueckfallebene: Teilzeichenkette, ebenfalls mit gekuerzten Woertern.
        muster = [f"%{query}%"] + [f"%{t}%" for t in stems]
        bedingungen = " OR ".join("key LIKE ? OR value LIKE ?" for _ in muster)
        werte: list[object] = []
        for eintrag in muster:
            werte.extend([eintrag, eintrag])
        werte.append(limit)
        rows = self.db.query(
            "SELECT id, key, value, kind, importance, updated_at FROM memory "
            f"WHERE {bedingungen} ORDER BY importance DESC, updated_at DESC LIMIT ?",
            werte,
        )
        return [self._entry(r) for r in rows]

    def list_memory(self, kind: str | None = None, limit: int = 50) -> list[MemoryEntry]:
        if kind:
            rows = self.db.query(
                "SELECT id, key, value, kind, importance, updated_at FROM memory "
                "WHERE kind = ? ORDER BY importance DESC, updated_at DESC LIMIT ?",
                (kind, limit),
            )
        else:
            rows = self.db.query(
                "SELECT id, key, value, kind, importance, updated_at FROM memory "
                "ORDER BY importance DESC, updated_at DESC LIMIT ?",
                (limit,),
            )
        return [self._entry(r) for r in rows]

    def important_memory(self, limit: int = 12) -> list[MemoryEntry]:
        """Dauerhaft wichtige Eintraege -- die duerfen in jeden Systemtext."""
        rows = self.db.query(
            "SELECT id, key, value, kind, importance, updated_at FROM memory "
            "WHERE importance >= 4 ORDER BY importance DESC, updated_at DESC LIMIT ?",
            (limit,),
        )
        return [self._entry(r) for r in rows]

    def forget(self, memory_id: int | None = None, key: str | None = None) -> bool:
        if memory_id is not None:
            cursor = self.db.execute("DELETE FROM memory WHERE id = ?", (memory_id,))
        elif key:
            cursor = self.db.execute("DELETE FROM memory WHERE key = ?", (key.strip(),))
        else:
            return False
        return bool(cursor.rowcount)

    def forget_all(self) -> int:
        count = int(self.db.scalar("SELECT COUNT(*) FROM memory") or 0)
        self.db.execute("DELETE FROM memory")
        return count

    # --- Ereignisgedaechtnis ---------------------------------------------
    def remember_event(
        self, kind: str, subject: str = "", detail: dict[str, Any] | None = None,
        *, ok: bool = True,
    ) -> int:
        return self.db.insert("event", {
            "kind": kind, "subject": subject[:500],
            "detail": json.dumps(detail or {}, ensure_ascii=False, default=str),
            "ok": 1 if ok else 0, "created_at": iso(utcnow()),
        })

    def recent_events(self, limit: int = 20, kind: str | None = None) -> list[dict[str, Any]]:
        if kind:
            rows = self.db.query(
                "SELECT id, kind, subject, detail, ok, created_at FROM event "
                "WHERE kind = ? ORDER BY id DESC LIMIT ?",
                (kind, limit),
            )
        else:
            rows = self.db.query(
                "SELECT id, kind, subject, detail, ok, created_at FROM event "
                "ORDER BY id DESC LIMIT ?",
                (limit,),
            )
        out = []
        for row in rows:
            try:
                detail = json.loads(row["detail"] or "{}")
            except json.JSONDecodeError:
                detail = {}
            out.append({
                "id": row["id"], "kind": row["kind"], "subject": row["subject"],
                "detail": detail, "ok": bool(row["ok"]), "created_at": row["created_at"],
            })
        return out

    # --- Export / Loeschen ------------------------------------------------
    def export_all(self) -> dict[str, Any]:
        """Vollstaendiger Export der persoenlichen Daten (Auskunftsrecht)."""
        def table(name: str, order: str = "id") -> list[dict[str, Any]]:
            return [dict(r) for r in self.db.query(f"SELECT * FROM {name} ORDER BY {order}")]

        return {
            "erzeugt_am": iso(utcnow()),
            "gedaechtnis": table("memory"),
            "gespraeche": table("conversation"),
            "gespraechszustand": table("conversation_state", "chat_id"),
            "aufgaben": table("task"),
            "erinnerungen": table("reminder"),
            "ereignisse": table("event"),
            "termine": table("calendar_event"),
            "entwuerfe": table("draft"),
            "anrufe": table("call_log"),
        }

    def _entry(self, row: Any) -> MemoryEntry:
        return MemoryEntry(
            id=row["id"], key=row["key"], value=row["value"],
            kind=row["kind"], importance=row["importance"], updated_at=row["updated_at"],
        )


class SettingsStore:
    """Einstellungen, die man zur Laufzeit per Telegram aendern kann."""

    def __init__(self, database: Database) -> None:
        self.db = database

    def get(self, key: str, default: str | None = None) -> str | None:
        value = self.db.scalar("SELECT value FROM setting WHERE key = ?", (key,))
        return default if value is None else str(value)

    def get_bool(self, key: str, default: bool) -> bool:
        value = self.get(key)
        if value is None:
            return default
        return value.strip().lower() in {"1", "true", "ja", "an", "yes", "on"}

    def set(self, key: str, value: str) -> None:
        self.db.execute(
            "INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            (key, str(value), iso(utcnow())),
        )

    def all(self) -> dict[str, str]:
        return {r["key"]: r["value"] for r in self.db.query("SELECT key, value FROM setting")}
