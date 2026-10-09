"""SQLite-Zugriff.

Ein einziges Verbindungsobjekt, das von allen Komponenten geteilt wird
(Telegram-Adapter, Hintergrunddienst, HTTP-Server laufen in verschiedenen
Threads). SQLite selbst ist dafuer geeignet, solange die Verbindung
serialisiert wird -- genau das macht ``_lock``.

WAL ist eingeschaltet, damit Lesen und Schreiben sich nicht blockieren.
"""

from __future__ import annotations

import logging
import shutil
import sqlite3
import threading
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(moment: datetime) -> str:
    """Einheitliches Speicherformat: UTC, Sekundengenau, mit ``Z``."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


class Database:
    """Duenne, thread-sichere Huelle um ``sqlite3``."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(
            self.path, check_same_thread=False, isolation_level=None, timeout=30.0
        )
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
            self._conn.execute("PRAGMA busy_timeout=30000")

    # --- Grundoperationen -------------------------------------------------
    def execute(self, sql: str, params: Sequence[Any] = ()) -> sqlite3.Cursor:
        with self._lock:
            return self._conn.execute(sql, params)

    def executemany(self, sql: str, rows: Sequence[Sequence[Any]]) -> sqlite3.Cursor:
        with self._lock:
            return self._conn.executemany(sql, rows)

    def executescript(self, script: str) -> None:
        with self._lock:
            self._conn.executescript(script)

    def query(self, sql: str, params: Sequence[Any] = ()) -> list[sqlite3.Row]:
        with self._lock:
            return list(self._conn.execute(sql, params).fetchall())

    def query_one(self, sql: str, params: Sequence[Any] = ()) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute(sql, params).fetchone()

    def scalar(self, sql: str, params: Sequence[Any] = ()) -> Any:
        row = self.query_one(sql, params)
        return None if row is None else row[0]

    def insert(self, table: str, values: dict[str, Any]) -> int:
        columns = ", ".join(values)
        marks = ", ".join("?" for _ in values)
        cursor = self.execute(
            f"INSERT INTO {table} ({columns}) VALUES ({marks})", list(values.values())
        )
        return int(cursor.lastrowid or 0)

    def update(self, table: str, row_id: int, values: dict[str, Any]) -> None:
        if not values:
            return
        assignments = ", ".join(f"{key} = ?" for key in values)
        self.execute(
            f"UPDATE {table} SET {assignments} WHERE id = ?", [*values.values(), row_id]
        )

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """Alles-oder-nichts. Verschachtelte Aufrufe nutzen die aeussere Transaktion."""
        with self._lock:
            if self._conn.in_transaction:
                yield self._conn
                return
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield self._conn
            except Exception:
                self._conn.execute("ROLLBACK")
                raise
            else:
                self._conn.execute("COMMIT")

    # --- Pflege -----------------------------------------------------------
    def backup(self, target_dir: Path, keep: int = 14) -> Path:
        """Konsistente Sicherung (nutzt die SQLite-Backup-API, kein Dateikopieren)."""
        target_dir.mkdir(parents=True, exist_ok=True)
        stamp = utcnow().strftime("%Y%m%d-%H%M%S")
        target = target_dir / f"jarvis-{stamp}.sqlite3"
        with self._lock:
            dest = sqlite3.connect(target)
            try:
                self._conn.backup(dest)
            finally:
                dest.close()
        backups = sorted(target_dir.glob("jarvis-*.sqlite3"))
        for old in backups[:-keep] if keep > 0 else []:
            old.unlink(missing_ok=True)
        log.info("Sicherung geschrieben: %s", target.name)
        return target

    def restore(self, source: Path) -> None:
        """Stellt eine Sicherung wieder her. Die Verbindung wird danach neu geoeffnet."""
        with self._lock:
            self._conn.close()
            shutil.copy2(source, self.path)
            self._conn = sqlite3.connect(
                self.path, check_same_thread=False, isolation_level=None, timeout=30.0
            )
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")

    def close(self) -> None:
        with self._lock:
            try:
                self._conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            except sqlite3.Error:
                pass
            self._conn.close()
