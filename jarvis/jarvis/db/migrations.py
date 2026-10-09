"""Datenbankmigrationen.

Jede Migration ist ein SQL-Block mit einer Nummer. ``migrate()`` fuehrt
alle noch nicht angewandten Nummern in einer Transaktion aus und schreibt
den Stand in ``schema_version``. Vor dem ersten Schritt einer bereits
befuellten Datenbank wird automatisch gesichert.
"""

from __future__ import annotations

import logging
from pathlib import Path

from .database import Database

log = logging.getLogger(__name__)

MIGRATIONS: list[tuple[int, str, str]] = [
    (
        1,
        "Grundschema",
        """
        CREATE TABLE IF NOT EXISTS schema_version (
            version     INTEGER PRIMARY KEY,
            name        TEXT NOT NULL,
            applied_at  TEXT NOT NULL
        );

        -- Gespraechsgedaechtnis -------------------------------------------
        CREATE TABLE conversation (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id     TEXT NOT NULL,
            role        TEXT NOT NULL,           -- user | assistant | tool | system
            content     TEXT NOT NULL,
            tool_name   TEXT,
            channel     TEXT NOT NULL DEFAULT 'telegram',
            created_at  TEXT NOT NULL
        );
        CREATE INDEX idx_conversation_chat ON conversation (chat_id, id DESC);

        CREATE TABLE conversation_state (
            chat_id          TEXT PRIMARY KEY,
            summary          TEXT NOT NULL DEFAULT '',
            topic            TEXT NOT NULL DEFAULT '',
            pending_question TEXT NOT NULL DEFAULT '',
            pending_payload  TEXT NOT NULL DEFAULT '',
            message_count    INTEGER NOT NULL DEFAULT 0,
            updated_at       TEXT NOT NULL
        );

        -- Langzeitgedaechtnis ---------------------------------------------
        CREATE TABLE memory (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            key         TEXT NOT NULL,
            value       TEXT NOT NULL,
            kind        TEXT NOT NULL DEFAULT 'fakt',   -- fakt | vorliebe | ablauf | projekt
            importance  INTEGER NOT NULL DEFAULT 3,     -- 1 (niedrig) .. 5 (hoch)
            source      TEXT NOT NULL DEFAULT 'telegram',
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            UNIQUE (key)
        );
        CREATE VIRTUAL TABLE memory_fts USING fts5 (
            key, value, content='memory', content_rowid='id'
        );
        CREATE TRIGGER memory_ai AFTER INSERT ON memory BEGIN
            INSERT INTO memory_fts (rowid, key, value) VALUES (new.id, new.key, new.value);
        END;
        CREATE TRIGGER memory_ad AFTER DELETE ON memory BEGIN
            INSERT INTO memory_fts (memory_fts, rowid, key, value)
            VALUES ('delete', old.id, old.key, old.value);
        END;
        CREATE TRIGGER memory_au AFTER UPDATE ON memory BEGIN
            INSERT INTO memory_fts (memory_fts, rowid, key, value)
            VALUES ('delete', old.id, old.key, old.value);
            INSERT INTO memory_fts (rowid, key, value) VALUES (new.id, new.key, new.value);
        END;

        -- Aufgabengedaechtnis ---------------------------------------------
        CREATE TABLE task (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            title         TEXT NOT NULL,
            notes         TEXT NOT NULL DEFAULT '',
            status        TEXT NOT NULL DEFAULT 'offen',  -- offen | laeuft | erledigt | abgebrochen
            priority      INTEGER NOT NULL DEFAULT 3,     -- 1 (hoch) .. 5 (niedrig)
            due_at        TEXT,
            project       TEXT NOT NULL DEFAULT '',
            depends_on    INTEGER REFERENCES task (id) ON DELETE SET NULL,
            result        TEXT NOT NULL DEFAULT '',
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL,
            completed_at  TEXT
        );
        CREATE INDEX idx_task_status ON task (status, priority, due_at);

        -- Erinnerungen -----------------------------------------------------
        CREATE TABLE reminder (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            text            TEXT NOT NULL,
            due_at          TEXT NOT NULL,
            recurrence      TEXT NOT NULL DEFAULT '',   -- taeglich | wochentags | woechentlich:mo | monatlich:5
            channel         TEXT NOT NULL DEFAULT 'telegram', -- telegram | telefon | beides
            status          TEXT NOT NULL DEFAULT 'geplant',  -- geplant | ausgeloest | bestaetigt | abgebrochen
            task_id         INTEGER REFERENCES task (id) ON DELETE SET NULL,
            chat_id         TEXT NOT NULL DEFAULT '',
            attempts        INTEGER NOT NULL DEFAULT 0,
            max_attempts    INTEGER NOT NULL DEFAULT 1,
            escalate_phone  INTEGER NOT NULL DEFAULT 0,
            triggered_at    TEXT,
            confirmed_at    TEXT,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );
        CREATE INDEX idx_reminder_due ON reminder (status, due_at);

        -- Auftragswarteschlange (Hintergrunddienst) -------------------------
        CREATE TABLE job (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            kind             TEXT NOT NULL,
            payload          TEXT NOT NULL DEFAULT '{}',
            run_at           TEXT NOT NULL,
            status           TEXT NOT NULL DEFAULT 'geplant', -- geplant | laeuft | fertig | fehler | abgebrochen
            attempts         INTEGER NOT NULL DEFAULT 0,
            max_attempts     INTEGER NOT NULL DEFAULT 3,
            last_error       TEXT NOT NULL DEFAULT '',
            idempotency_key  TEXT UNIQUE,
            recurrence       TEXT NOT NULL DEFAULT '',
            locked_at        TEXT,
            created_at       TEXT NOT NULL,
            updated_at       TEXT NOT NULL,
            finished_at      TEXT
        );
        CREATE INDEX idx_job_due ON job (status, run_at);

        -- Ereignisgedaechtnis ----------------------------------------------
        CREATE TABLE event (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            kind        TEXT NOT NULL,
            subject     TEXT NOT NULL DEFAULT '',
            detail      TEXT NOT NULL DEFAULT '{}',
            ok          INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL
        );
        CREATE INDEX idx_event_kind ON event (kind, id DESC);

        -- Bestaetigungen (Stufe-2-Aktionen) --------------------------------
        CREATE TABLE confirmation (
            token       TEXT PRIMARY KEY,
            action      TEXT NOT NULL,
            payload     TEXT NOT NULL DEFAULT '{}',
            tier        INTEGER NOT NULL DEFAULT 2,
            summary     TEXT NOT NULL DEFAULT '',
            chat_id     TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL,
            expires_at  TEXT NOT NULL,
            used_at     TEXT,
            outcome     TEXT NOT NULL DEFAULT ''
        );

        -- Kalender (lokal + Zwischenspeicher externer Anbieter) -------------
        CREATE TABLE calendar_event (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            uid          TEXT NOT NULL,
            provider     TEXT NOT NULL DEFAULT 'local',
            calendar_id  TEXT NOT NULL DEFAULT '',
            title        TEXT NOT NULL,
            start_at     TEXT NOT NULL,
            end_at       TEXT NOT NULL,
            all_day      INTEGER NOT NULL DEFAULT 0,
            location     TEXT NOT NULL DEFAULT '',
            description  TEXT NOT NULL DEFAULT '',
            etag         TEXT NOT NULL DEFAULT '',
            deleted      INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL,
            UNIQUE (provider, uid)
        );
        CREATE INDEX idx_calendar_start ON calendar_event (start_at);

        -- E-Mail ------------------------------------------------------------
        CREATE TABLE email_seen (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            folder       TEXT NOT NULL,
            uid          TEXT NOT NULL,
            message_id   TEXT NOT NULL DEFAULT '',
            from_addr    TEXT NOT NULL DEFAULT '',
            subject      TEXT NOT NULL DEFAULT '',
            date         TEXT NOT NULL DEFAULT '',
            important    INTEGER NOT NULL DEFAULT 0,
            notified_at  TEXT,
            created_at   TEXT NOT NULL,
            UNIQUE (folder, uid)
        );

        CREATE TABLE draft (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            kind         TEXT NOT NULL DEFAULT 'email',
            to_addr      TEXT NOT NULL DEFAULT '',
            cc_addr      TEXT NOT NULL DEFAULT '',
            subject      TEXT NOT NULL DEFAULT '',
            body         TEXT NOT NULL DEFAULT '',
            in_reply_to  TEXT NOT NULL DEFAULT '',
            status       TEXT NOT NULL DEFAULT 'entwurf', -- entwurf | gesendet | verworfen
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL,
            sent_at      TEXT
        );

        -- Telefonie ----------------------------------------------------------
        CREATE TABLE call_log (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_sid  TEXT NOT NULL DEFAULT '',
            direction     TEXT NOT NULL DEFAULT 'ausgehend',
            to_number     TEXT NOT NULL DEFAULT '',
            purpose       TEXT NOT NULL DEFAULT '',
            status        TEXT NOT NULL DEFAULT 'geplant',
            reminder_id   INTEGER REFERENCES reminder (id) ON DELETE SET NULL,
            transcript    TEXT NOT NULL DEFAULT '',
            error         TEXT NOT NULL DEFAULT '',
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL
        );

        CREATE TABLE voice_session (
            call_sid    TEXT PRIMARY KEY,
            chat_id     TEXT NOT NULL DEFAULT '',
            state       TEXT NOT NULL DEFAULT '{}',
            turns       INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        -- Benachrichtigungen (gegen Doppelmeldungen) -------------------------
        CREATE TABLE notification (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            dedupe_key  TEXT NOT NULL UNIQUE,
            kind        TEXT NOT NULL DEFAULT 'info',
            text        TEXT NOT NULL,
            priority    INTEGER NOT NULL DEFAULT 3,
            sent_at     TEXT,
            created_at  TEXT NOT NULL
        );

        -- Laufzeiteinstellungen (im Chat aenderbar) --------------------------
        CREATE TABLE setting (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        -- Protokoll -----------------------------------------------------------
        CREATE TABLE log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            level       TEXT NOT NULL,
            logger      TEXT NOT NULL,
            message     TEXT NOT NULL,
            created_at  TEXT NOT NULL
        );
        CREATE INDEX idx_log_created ON log (id DESC);
        """,
    ),
    (
        2,
        "Telegram-Versatz und Werkzeugprotokoll",
        """
        CREATE TABLE tool_call (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            arguments   TEXT NOT NULL DEFAULT '{}',
            result      TEXT NOT NULL DEFAULT '',
            ok          INTEGER NOT NULL DEFAULT 1,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            chat_id     TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL
        );
        CREATE INDEX idx_tool_call_created ON tool_call (id DESC);
        """,
    ),
]


def current_version(database: Database) -> int:
    has_table = database.query_one(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    if not has_table:
        return 0
    return int(database.scalar("SELECT COALESCE(MAX(version), 0) FROM schema_version") or 0)


def migrate(database: Database, backup_dir: Path | None = None, keep: int = 14) -> list[int]:
    """Wendet alle offenen Migrationen an und gibt deren Nummern zurueck."""
    version = current_version(database)
    pending = [m for m in MIGRATIONS if m[0] > version]
    if not pending:
        return []

    if version > 0 and backup_dir is not None:
        # Vor einer Schemaaenderung immer eine Sicherung -- Nutzerdaten sind heilig.
        database.backup(backup_dir, keep=keep)

    applied: list[int] = []
    for number, name, script in pending:
        log.info("Migration %s anwenden: %s", number, name)
        # ``executescript`` bringt seine eigene Transaktion mit, deshalb steht
        # BEGIN/COMMIT hier im Skript und nicht im Transaktions-Kontext:
        # entweder laeuft die ganze Migration durch, oder keine ihrer Zeilen.
        safe_name = name.replace("'", "''")
        database.executescript(
            "BEGIN;\n"
            + script
            + "\nINSERT INTO schema_version (version, name, applied_at) VALUES "
            + f"({number}, '{safe_name}', strftime('%Y-%m-%dT%H:%M:%SZ','now'));\n"
            + "COMMIT;\n"
        )
        applied.append(number)
    return applied
