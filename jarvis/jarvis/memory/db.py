"""SQLite-Anbindung und Schema fuer das Gedaechtnis.

Eine Datei, ein Schema, versioniert ueber ``schema_version``. Migrationen sind
eine Liste von SQL-Schritten; angewandt wird, was noch fehlt. Damit laesst sich
eine bestehende Gedaechtnisdatei weiterverwenden, ohne sie zu loeschen.
"""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

#: Jeder Eintrag ist ein Migrationsschritt. Nur anhaengen, nie umschreiben --
#: sonst laufen bestehende Datenbanken auseinander.
MIGRATIONS: list[str] = [
    # 1 -- Grundschema
    """
    CREATE TABLE IF NOT EXISTS conversation_turns (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  TEXT    NOT NULL,
        role        TEXT    NOT NULL CHECK (role IN ('user','assistant','tool','system')),
        content     TEXT    NOT NULL,
        created_at  REAL    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_turns_session ON conversation_turns(session_id, id);

    -- Langzeitgedaechtnis: bestaetigte Fakten und Praeferenzen.
    -- Widersprueche werden nicht ueberschrieben, sondern ueber superseded_by
    -- verkettet, damit nachvollziehbar bleibt, was einmal galt.
    CREATE TABLE IF NOT EXISTS facts (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        subject       TEXT    NOT NULL,
        predicate     TEXT    NOT NULL,
        value         TEXT    NOT NULL,
        kind          TEXT    NOT NULL DEFAULT 'fact',
        confidence    REAL    NOT NULL DEFAULT 1.0,
        source        TEXT,
        created_at    REAL    NOT NULL,
        superseded_by INTEGER REFERENCES facts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_facts_lookup ON facts(subject, predicate, superseded_by);

    CREATE TABLE IF NOT EXISTS tasks (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        title          TEXT    NOT NULL,
        detail         TEXT    NOT NULL DEFAULT '',
        status         TEXT    NOT NULL,
        priority       INTEGER NOT NULL DEFAULT 2,
        parent_id      INTEGER REFERENCES tasks(id),
        created_at     REAL    NOT NULL,
        updated_at     REAL    NOT NULL,
        due_at         REAL,
        -- Ergebnis und Pruefvermerk. done setzt beides voraus.
        result         TEXT,
        verification   TEXT,
        blocked_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, priority);

    CREATE TABLE IF NOT EXISTS task_events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        kind       TEXT    NOT NULL,
        message    TEXT    NOT NULL DEFAULT '',
        created_at REAL    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_task ON task_events(task_id, id);

    CREATE TABLE IF NOT EXISTS knowledge (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT    NOT NULL,
        source     TEXT,
        kind       TEXT    NOT NULL DEFAULT 'note',
        content    TEXT    NOT NULL,
        created_at REAL    NOT NULL,
        updated_at REAL    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id    INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        priority   INTEGER NOT NULL,
        text       TEXT    NOT NULL,
        dedupe_key TEXT,
        state      TEXT    NOT NULL DEFAULT 'pending',
        created_at REAL    NOT NULL,
        spoken_at  REAL
    );
    CREATE INDEX IF NOT EXISTS idx_notif_state ON notifications(state, priority, id);
    """,
    # 2 -- Volltextsuche ueber den Wissensspeicher.
    # Kein externes Vektormodell: FTS5 liegt in SQLite bei und reicht fuer
    # Notizen und Dokumente. Eine Vektorsuche kommt erst, wenn sich zeigt,
    # dass die Stichwortsuche nicht ausreicht.
    """
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
        title, content, content='knowledge', content_rowid='id', tokenize='unicode61'
    );
    CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
        INSERT INTO knowledge_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
        INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge BEGIN
        INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
        INSERT INTO knowledge_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;
    """,
]


class Database:
    """Duenne Huelle um sqlite3 mit Sperre fuer den Zugriff aus mehreren Threads.

    Audioaufnahme, Modellanfragen und Dashboard laufen in verschiedenen Threads.
    ``check_same_thread=False`` plus eine Sperre ist hier einfacher und
    verlaesslicher als eine Verbindung pro Thread, weil das Gedaechtnis klein
    ist und Schreibzugriffe selten sind.
    """

    def __init__(self, path: str | Path = ":memory:") -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        # WAL haelt Lesen und Schreiben auseinander; bei :memory: nicht moeglich.
        if self.path != ":memory:":
            self._conn.execute("PRAGMA journal_mode = WAL")
        self.migrate()

    # -- Schema ---------------------------------------------------------
    def migrate(self) -> int:
        """Wendet fehlende Migrationen an und gibt die neue Version zurueck."""
        with self._lock:
            version = self._conn.execute("PRAGMA user_version").fetchone()[0]
            for index, script in enumerate(MIGRATIONS[version:], start=version + 1):
                self._conn.executescript(script)
                self._conn.execute(f"PRAGMA user_version = {index}")
            self._conn.commit()
            return self._conn.execute("PRAGMA user_version").fetchone()[0]

    # -- Zugriff --------------------------------------------------------
    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        with self._lock:
            cursor = self._conn.execute(sql, params)
            self._conn.commit()
            return cursor

    def query(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(sql, params).fetchall()

    def query_one(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute(sql, params).fetchone()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
