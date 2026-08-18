/**
 * Datenmodell. Migrationen laufen der Reihe nach; `user_version` merkt sich,
 * wo die Datei steht. Neue Aenderungen werden hinten angehängt, nie in einer
 * bereits ausgelieferten Migration nachgebessert.
 */
export const MIGRATIONS: string[] = [
  // ---------------------------------------------------------------- 1 --------
  `
  CREATE TABLE sources (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    url           TEXT NOT NULL,
    kind          TEXT NOT NULL,
    title         TEXT,
    fetched_at    TEXT NOT NULL,
    content_hash  TEXT,
    excerpt       TEXT
  );
  CREATE INDEX idx_sources_url ON sources(url);

  CREATE TABLE companies (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL,
    website             TEXT,
    domain              TEXT,
    street              TEXT,
    postal_code         TEXT,
    city                TEXT,
    country             TEXT,
    industry            TEXT,
    description         TEXT,
    acquisition_reason  TEXT,
    acquisition_basis   TEXT,
    size_hint           TEXT,
    phone               TEXT,
    contact_page_url    TEXT,
    imprint_url         TEXT,
    status              TEXT NOT NULL DEFAULT 'neu',
    do_not_contact      INTEGER NOT NULL DEFAULT 0,
    notes               TEXT,
    researched_at       TEXT,
    last_contacted_at   TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_companies_domain ON companies(domain) WHERE domain IS NOT NULL;
  CREATE INDEX idx_companies_name ON companies(name);
  CREATE INDEX idx_companies_status ON companies(status);

  CREATE TABLE contacts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    first_name  TEXT,
    last_name   TEXT,
    full_name   TEXT NOT NULL,
    position    TEXT,
    phone       TEXT,
    source_id   INTEGER REFERENCES sources(id),
    created_at  TEXT NOT NULL
  );
  CREATE INDEX idx_contacts_company ON contacts(company_id);

  CREATE TABLE email_addresses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    contact_id    INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    address       TEXT NOT NULL,
    status        TEXT NOT NULL,
    status_reason TEXT NOT NULL,
    source_id     INTEGER REFERENCES sources(id),
    is_primary    INTEGER NOT NULL DEFAULT 0,
    mx_checked    INTEGER NOT NULL DEFAULT 0,
    mx_ok         INTEGER,
    created_at    TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_email_addresses_unique ON email_addresses(company_id, address);
  CREATE INDEX idx_email_addresses_addr ON email_addresses(address);

  CREATE TABLE outreach_campaigns (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    service     TEXT NOT NULL,
    region      TEXT NOT NULL,
    radius_km   INTEGER,
    target_count INTEGER NOT NULL DEFAULT 20,
    briefing    TEXT,
    status      TEXT NOT NULL DEFAULT 'entwurf',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE emails (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id           INTEGER REFERENCES outreach_campaigns(id) ON DELETE SET NULL,
    company_id            INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    contact_id            INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    to_address            TEXT NOT NULL,
    to_name               TEXT,
    cc                    TEXT,
    bcc                   TEXT,
    subject               TEXT NOT NULL,
    body_text             TEXT NOT NULL,
    body_html             TEXT,
    status                TEXT NOT NULL DEFAULT 'entwurf',
    recipient_verification TEXT NOT NULL DEFAULT 'NICHT_VERIFIZIERT',
    approval_id           INTEGER,
    message_id            TEXT,
    thread_key            TEXT,
    error_message         TEXT,
    personalization_basis TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    sent_at               TEXT
  );
  CREATE INDEX idx_emails_status ON emails(status);
  CREATE INDEX idx_emails_company ON emails(company_id);
  CREATE INDEX idx_emails_campaign ON emails(campaign_id);
  CREATE INDEX idx_emails_thread ON emails(thread_key);

  CREATE TABLE email_attachments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id     INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    filename     TEXT NOT NULL,
    path         TEXT NOT NULL,
    size_bytes   INTEGER NOT NULL,
    content_type TEXT
  );
  CREATE INDEX idx_attachments_email ON email_attachments(email_id);

  CREATE TABLE interaction_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    contact_id  INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    email_id    INTEGER REFERENCES emails(id) ON DELETE SET NULL,
    kind        TEXT NOT NULL,
    channel     TEXT NOT NULL,
    summary     TEXT NOT NULL,
    occurred_at TEXT NOT NULL
  );
  CREATE INDEX idx_history_company ON interaction_history(company_id);

  CREATE TABLE approvals (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    action             TEXT NOT NULL,
    title              TEXT NOT NULL,
    details_json       TEXT NOT NULL,
    body               TEXT,
    status             TEXT NOT NULL DEFAULT 'offen',
    requested_by       TEXT NOT NULL,
    requested_at       TEXT NOT NULL,
    decided_at         TEXT,
    decision_utterance TEXT,
    related_email_id   INTEGER REFERENCES emails(id) ON DELETE SET NULL,
    related_company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL
  );
  CREATE INDEX idx_approvals_status ON approvals(status);

  CREATE TABLE tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    detail     TEXT,
    status     TEXT NOT NULL DEFAULT 'offen',
    due_at     TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE audit_logs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    at       TEXT NOT NULL,
    actor    TEXT NOT NULL,
    action   TEXT NOT NULL,
    detail   TEXT NOT NULL,
    level    TEXT NOT NULL DEFAULT 'info',
    ref_type TEXT,
    ref_id   INTEGER
  );
  CREATE INDEX idx_audit_at ON audit_logs(at);

  CREATE TABLE memory_facts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    scope      TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    origin     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT
  );
  CREATE UNIQUE INDEX idx_memory_scope_key ON memory_facts(scope, key);

  CREATE TABLE conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    tool_name       TEXT,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX idx_messages_conversation ON messages(conversation_id);

  CREATE TABLE do_not_contact (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern    TEXT NOT NULL UNIQUE,
    kind       TEXT NOT NULL,
    reason     TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE send_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id   INTEGER REFERENCES emails(id) ON DELETE SET NULL,
    address    TEXT NOT NULL,
    sent_at    TEXT NOT NULL,
    transport  TEXT NOT NULL,
    ok         INTEGER NOT NULL,
    detail     TEXT
  );
  CREATE INDEX idx_send_log_sent_at ON send_log(sent_at);
  `
]
