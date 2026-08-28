import type { Db } from './db.js';

/**
 * Migrationen. Vorwaerts-only, jede Migration laeuft genau einmal und wird in
 * `schema_migrations` festgehalten. Keine automatischen Rueckwaertsschritte -
 * ein Downgrade laeuft ueber `pnpm restore` aus einem Backup.
 */
export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'initial',
    sql: `
CREATE TABLE events (
  id                TEXT PRIMARY KEY,
  dedup_key         TEXT NOT NULL UNIQUE,
  channel           TEXT NOT NULL,
  provider_id       TEXT NOT NULL,
  provider_account  TEXT NOT NULL,
  thread_id         TEXT,
  sender_display    TEXT NOT NULL,
  sender_address    TEXT NOT NULL,
  subject           TEXT,
  preview           TEXT NOT NULL,
  body              TEXT,
  received_at       TEXT NOT NULL,
  urgency           TEXT NOT NULL DEFAULT 'normal',
  attachments_json  TEXT NOT NULL DEFAULT '[]',
  self_originated   INTEGER NOT NULL DEFAULT 0,
  handled           INTEGER NOT NULL DEFAULT 0,
  announced_at      TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_events_open ON events(handled, received_at);
CREATE INDEX idx_events_thread ON events(channel, thread_id);

CREATE TABLE jobs (
  id                TEXT PRIMARY KEY,
  kind              TEXT NOT NULL,
  deduplication_key TEXT NOT NULL UNIQUE,
  payload_json      TEXT NOT NULL,
  state             TEXT NOT NULL,
  attempts          INTEGER NOT NULL DEFAULT 0,
  max_attempts      INTEGER NOT NULL DEFAULT 5,
  next_attempt_at   TEXT NOT NULL,
  locked_until      TEXT,
  last_error        TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_jobs_ready ON jobs(state, next_attempt_at);
CREATE INDEX idx_jobs_kind ON jobs(kind, state);

CREATE TABLE drafts (
  id                   TEXT PRIMARY KEY,
  channel              TEXT NOT NULL,
  provider_account     TEXT NOT NULL,
  recipient            TEXT NOT NULL,
  subject              TEXT,
  body                 TEXT NOT NULL,
  attachments_json     TEXT NOT NULL DEFAULT '[]',
  thread_id            TEXT,
  in_reply_to_event_id TEXT,
  revision             INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE approvals (
  id                  TEXT PRIMARY KEY,
  draft_id            TEXT NOT NULL REFERENCES drafts(id),
  call_id             TEXT NOT NULL,
  state               TEXT NOT NULL,
  payload_hash        TEXT NOT NULL,
  read_back_at        TEXT,
  read_back_hash      TEXT,
  voice_confirmed_at  TEXT,
  pin_verified_at     TEXT,
  approved_at         TEXT,
  expires_at          TEXT NOT NULL,
  consumed            INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  failure_reason      TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX idx_approvals_state ON approvals(state, expires_at);
-- Genau eine verwendbare Freigabe pro Entwurf: verhindert, dass parallele
-- Anfragen zwei gueltige Freigaben fuer denselben Inhalt erzeugen.
CREATE UNIQUE INDEX idx_approvals_live
  ON approvals(draft_id)
  WHERE state IN ('DRAFT','READ_BACK','AWAITING_APPROVAL','APPROVED','SENDING');

CREATE TABLE sends (
  id                  TEXT PRIMARY KEY,
  approval_id         TEXT NOT NULL UNIQUE REFERENCES approvals(id),
  idempotency_key     TEXT NOT NULL UNIQUE,
  channel             TEXT NOT NULL,
  state               TEXT NOT NULL,
  provider_message_id TEXT,
  error               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE tasks (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  state            TEXT NOT NULL,
  due_at           TEXT,
  origin_ref       TEXT NOT NULL,
  origin_event_id  TEXT,
  next_step        TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_tasks_open ON tasks(state, due_at);

CREATE TABLE memories (
  id                     TEXT PRIMARY KEY,
  subject                TEXT NOT NULL,
  fact                   TEXT NOT NULL,
  sensitivity            TEXT NOT NULL DEFAULT 'normal',
  confirmed_at           TEXT NOT NULL,
  confirmation_utterance TEXT NOT NULL,
  source_ref             TEXT NOT NULL,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX idx_memories_subject ON memories(subject);

CREATE TABLE calls (
  id                  TEXT PRIMARY KEY,
  direction           TEXT NOT NULL,
  peer                TEXT NOT NULL,
  state               TEXT NOT NULL,
  started_at          TEXT NOT NULL,
  answered_at         TEXT,
  ended_at            TEXT,
  end_reason          TEXT,
  announced_event_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_calls_active ON calls(state, started_at);

CREATE TABLE calendar_idempotency (
  key                 TEXT PRIMARY KEY,
  provider_event_id   TEXT NOT NULL,
  provider_account    TEXT NOT NULL,
  created_at          TEXT NOT NULL
);

CREATE TABLE sync_state (
  connector    TEXT PRIMARY KEY,
  delta_link   TEXT,
  history_id   TEXT,
  cursor       TEXT,
  updated_at   TEXT NOT NULL
);

CREATE TABLE audit_log (
  seq        INTEGER PRIMARY KEY,
  at         TEXT NOT NULL,
  action     TEXT NOT NULL,
  subject    TEXT NOT NULL,
  details    TEXT NOT NULL,
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL
);
`,
  },
  {
    id: 2,
    name: 'chat_sessions',
    sql: `
-- Gespraechszustand im Chat.
--
-- Am Telefon haelt der laufende Prozess den Zustand, solange der Anruf
-- dauert. Im Chat gibt es keinen laufenden Prozess: jede Nachricht ist eine
-- eigene HTTP-Anfrage, und zwischen zwei Nachrichten koennen Stunden oder ein
-- Neustart liegen. Was ueber eine Nachricht hinaus gilt, muss deshalb hier
-- stehen.
--
-- Was hier bewusst NICHT steht: Nachrichtentexte. Der Inhalt liegt in
-- der Tabelle events, und der Rueckstau ergibt sich aus den dort offenen
-- Ereignissen - eine zweite Kopie waere eine zweite Stelle, an der
-- Inhalte liegen.
CREATE TABLE chat_sessions (
  wa_id             TEXT PRIMARY KEY,
  session_ref       TEXT NOT NULL,
  opened_at         TEXT,
  authenticated_at  TEXT,
  last_inbound_at   TEXT,
  last_outbound_at  TEXT,
  failed_logins     INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
`,
  },
];

export function migrate(db: Db): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  let applied = 0;
  for (const m of MIGRATIONS) {
    const existing = db.get<{ id: number }>('SELECT id FROM schema_migrations WHERE id = ?', [m.id]);
    if (existing !== undefined) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.run('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)', [
        m.id,
        m.name,
        new Date().toISOString(),
      ]);
    });
    applied += 1;
  }
  return applied;
}

export function schemaVersion(db: Db): number {
  try {
    const row = db.get<{ v: number | null }>('SELECT MAX(id) AS v FROM schema_migrations');
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}
