/**
 * The complete SQLite schema, embedded as a string so it survives bundling.
 *
 * Migrations are additive and idempotent: `migrate()` runs this script (all
 * statements use IF NOT EXISTS) and then applies the numbered steps in
 * `MIGRATIONS`. `user_version` records how far a database has come.
 */

export const SCHEMA_SQL = /* sql */ `
PRAGMA foreign_keys = ON;

-- Where a piece of information came from. Every fact links here (§15).
CREATE TABLE IF NOT EXISTS sources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  url           TEXT NOT NULL,
  kind          TEXT NOT NULL,
  title         TEXT,
  excerpt       TEXT,
  retrieved_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_url ON sources(url);

CREATE TABLE IF NOT EXISTS companies (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,
  website            TEXT,
  domain             TEXT,
  city               TEXT,
  region             TEXT,
  country            TEXT,
  industry           TEXT,
  description        TEXT,
  phone              TEXT,
  contact_page_url   TEXT,
  imprint_url        TEXT,
  status             TEXT NOT NULL DEFAULT 'Neu',
  outreach_rationale TEXT,
  do_not_contact     INTEGER NOT NULL DEFAULT 0,
  dnc_reason         TEXT,
  last_contact_at    TEXT,
  researched_at      TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
-- Duplicate prevention (§17): one row per domain, and per name when no domain.
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_domain
  ON companies(domain) WHERE domain IS NOT NULL AND domain <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_name_nodomain
  ON companies(lower(name)) WHERE domain IS NULL OR domain = '';
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

CREATE TABLE IF NOT EXISTS company_sources (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_id  INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  field      TEXT,
  PRIMARY KEY (company_id, source_id, field)
);

CREATE TABLE IF NOT EXISTS contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  role        TEXT,
  phone       TEXT,
  source_url  TEXT,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_company_name
  ON contacts(company_id, lower(full_name));

CREATE TABLE IF NOT EXISTS email_addresses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  address     TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'general',
  status      TEXT NOT NULL DEFAULT 'NICHT_VERIFIZIERT',
  reason      TEXT NOT NULL DEFAULT '',
  source_url  TEXT,
  mx_checked  INTEGER NOT NULL DEFAULT 0,
  mx_ok       INTEGER,
  found_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_company_address
  ON email_addresses(company_id, lower(address));
CREATE INDEX IF NOT EXISTS idx_email_address ON email_addresses(lower(address));

-- Global opt-out / do-not-contact list (§17). Matched by address or domain.
CREATE TABLE IF NOT EXISTS suppression_list (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern    TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'address',
  reason     TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppression_pattern
  ON suppression_list(lower(pattern), kind);

CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  service      TEXT NOT NULL,
  region       TEXT,
  target_count INTEGER NOT NULL DEFAULT 25,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'aktiv',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_name ON outreach_campaigns(lower(name));

CREATE TABLE IF NOT EXISTS emails (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  contact_id    INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  campaign_id   INTEGER REFERENCES outreach_campaigns(id) ON DELETE SET NULL,
  to_address    TEXT NOT NULL,
  cc_addresses  TEXT NOT NULL DEFAULT '[]',
  bcc_addresses TEXT NOT NULL DEFAULT '[]',
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  attachments   TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'entwurf',
  approval_id   INTEGER,
  revision      INTEGER NOT NULL DEFAULT 1,
  message_id    TEXT,
  error_code    TEXT,
  error_message TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  sent_at       TEXT,
  replied_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_emails_company ON emails(company_id);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);

CREATE TABLE IF NOT EXISTS interaction_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  email_id    INTEGER REFERENCES emails(id) ON DELETE SET NULL,
  direction   TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'email',
  summary     TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interaction_company ON interaction_history(company_id);

CREATE TABLE IF NOT EXISTS approvals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  action            TEXT NOT NULL,
  title             TEXT NOT NULL,
  facts             TEXT NOT NULL DEFAULT '[]',
  preview           TEXT,
  subject           TEXT NOT NULL,
  fingerprint       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'offen',
  requested_at      TEXT NOT NULL,
  decided_at        TEXT,
  decided_by        TEXT,
  decision_evidence TEXT,
  expires_at        TEXT NOT NULL,
  -- Set the moment the approval is spent. An approval is valid exactly once.
  consumed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_subject ON approvals(subject);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  detail       TEXT,
  status       TEXT NOT NULL DEFAULT 'offen',
  due_at       TEXT,
  company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  campaign_id  INTEGER REFERENCES outreach_campaigns(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  actor   TEXT NOT NULL,
  agent   TEXT,
  action  TEXT NOT NULL,
  subject TEXT,
  outcome TEXT NOT NULL DEFAULT 'info',
  detail  TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(at);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  text            TEXT NOT NULL,
  tool_calls      TEXT NOT NULL DEFAULT '[]',
  spoken          INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- Structured memory (§13). Conversation memory expires; preferences do not.
CREATE TABLE IF NOT EXISTS memory (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  key        TEXT,
  value      TEXT NOT NULL,
  scope      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_kind_key
  ON memory(kind, key) WHERE key IS NOT NULL;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Encrypted secrets. The value column holds ciphertext only (§3).
CREATE TABLE IF NOT EXISTS credentials (
  key        TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  hint       TEXT,
  updated_at TEXT NOT NULL
);

-- Rate limiting evidence for §17 send limits. One row per actual send attempt.
CREATE TABLE IF NOT EXISTS send_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id   INTEGER REFERENCES emails(id) ON DELETE SET NULL,
  to_address TEXT NOT NULL,
  outcome    TEXT NOT NULL,
  at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_send_log_at ON send_log(at);
`;

/**
 * Numbered migrations applied after the base schema. Each entry runs once and
 * bumps `user_version`. Never edit a released entry — append a new one.
 */
export const MIGRATIONS: Array<{ version: number; sql: string }> = [
  // v1 is the base schema above.
];

export const SCHEMA_VERSION = 1;
