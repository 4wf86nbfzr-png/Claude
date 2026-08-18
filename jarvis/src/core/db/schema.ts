/**
 * Datenbankschema als Migrationsliste.
 *
 * Das Schema liegt bewusst als TypeScript-Modul vor und nicht als .sql-Datei:
 * so wandert es ohne zusätzlichen Kopierschritt in den Build und kann in Tests
 * ohne Dateisystemzugriff geladen werden.
 *
 * Neue Änderungen werden ausschließlich als weiterer Eintrag angehängt.
 * Bestehende Einträge nie nachträglich verändern – sonst laufen bestehende
 * Installationen auseinander.
 */
export const MIGRATIONS: string[] = [
  // 1 – Grundschema
  `
  CREATE TABLE sources (
    id          INTEGER PRIMARY KEY,
    url         TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'sonstige',
    title       TEXT,
    http_status INTEGER,
    content_hash TEXT,
    excerpt     TEXT,
    fetched_at  TEXT NOT NULL
  );
  CREATE INDEX idx_sources_url ON sources(url);

  CREATE TABLE companies (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    website         TEXT,
    domain          TEXT,
    city            TEXT,
    region          TEXT,
    country         TEXT DEFAULT 'DE',
    industry        TEXT,
    size_hint       TEXT,
    description     TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_companies_domain ON companies(domain) WHERE domain IS NOT NULL;
  CREATE UNIQUE INDEX idx_companies_name_city ON companies(normalized_name, IFNULL(city,''));

  CREATE TABLE contacts (
    id         INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    full_name  TEXT NOT NULL,
    role       TEXT,
    phone      TEXT,
    source_id  INTEGER REFERENCES sources(id),
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_contacts_unique ON contacts(company_id, full_name);

  CREATE TABLE email_addresses (
    id                  INTEGER PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    contact_id          INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    address             TEXT NOT NULL,
    verification_status TEXT NOT NULL,
    verification_method TEXT NOT NULL,
    evidence_url        TEXT,
    evidence_snippet    TEXT,
    source_id           INTEGER REFERENCES sources(id),
    first_seen_at       TEXT NOT NULL,
    last_checked_at     TEXT
  );
  CREATE UNIQUE INDEX idx_email_unique ON email_addresses(company_id, address);
  CREATE INDEX idx_email_address ON email_addresses(address);

  CREATE TABLE company_claims (
    id         INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    statement  TEXT NOT NULL,
    source_id  INTEGER REFERENCES sources(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_claims_company ON company_claims(company_id);

  CREATE TABLE outreach_campaigns (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    service      TEXT NOT NULL,
    region       TEXT,
    radius_km    INTEGER,
    target_count INTEGER,
    goal         TEXT,
    status       TEXT NOT NULL DEFAULT 'AKTIV',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );

  CREATE TABLE approvals (
    id           INTEGER PRIMARY KEY,
    action       TEXT NOT NULL,
    title        TEXT NOT NULL,
    summary      TEXT NOT NULL,
    payload      TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'OFFEN',
    requested_at TEXT NOT NULL,
    decided_at   TEXT,
    decided_by   TEXT,
    note         TEXT,
    expires_at   TEXT
  );
  CREATE INDEX idx_approvals_status ON approvals(status);

  CREATE TABLE emails (
    id           INTEGER PRIMARY KEY,
    campaign_id  INTEGER REFERENCES outreach_campaigns(id) ON DELETE SET NULL,
    company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    contact_id   INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    direction    TEXT NOT NULL DEFAULT 'AUSGEHEND',
    from_address TEXT,
    to_addresses TEXT NOT NULL,
    cc           TEXT NOT NULL DEFAULT '[]',
    bcc          TEXT NOT NULL DEFAULT '[]',
    subject      TEXT NOT NULL,
    body_text    TEXT NOT NULL,
    body_html    TEXT,
    attachments  TEXT NOT NULL DEFAULT '[]',
    status       TEXT NOT NULL DEFAULT 'ENTWURF',
    content_hash TEXT NOT NULL,
    approval_id  INTEGER REFERENCES approvals(id),
    message_id   TEXT,
    in_reply_to  TEXT,
    thread_key   TEXT,
    sent_at      TEXT,
    error        TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
  CREATE INDEX idx_emails_company ON emails(company_id);
  CREATE INDEX idx_emails_status ON emails(status);
  CREATE INDEX idx_emails_thread ON emails(thread_key);

  CREATE TABLE campaign_targets (
    id          INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'NEU',
    reason      TEXT,
    email_id    INTEGER REFERENCES emails(id) ON DELETE SET NULL,
    last_error  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_target_unique ON campaign_targets(campaign_id, company_id);

  CREATE TABLE interaction_history (
    id          INTEGER PRIMARY KEY,
    company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    contact_id  INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    email_id    INTEGER REFERENCES emails(id) ON DELETE SET NULL,
    kind        TEXT NOT NULL,
    summary     TEXT NOT NULL,
    occurred_at TEXT NOT NULL
  );
  CREATE INDEX idx_interaction_company ON interaction_history(company_id);

  CREATE TABLE tasks (
    id         INTEGER PRIMARY KEY,
    title      TEXT NOT NULL,
    detail     TEXT,
    status     TEXT NOT NULL DEFAULT 'OFFEN',
    due_at     TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE audit_logs (
    id     INTEGER PRIMARY KEY,
    ts     TEXT NOT NULL,
    actor  TEXT NOT NULL,
    agent  TEXT,
    action TEXT NOT NULL,
    target TEXT,
    status TEXT NOT NULL DEFAULT 'INFO',
    detail TEXT
  );
  CREATE INDEX idx_audit_ts ON audit_logs(ts);

  CREATE TABLE memory_items (
    id         INTEGER PRIMARY KEY,
    scope      TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_memory_unique ON memory_items(scope, key);

  CREATE TABLE conversation_messages (
    id         INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    agent      TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_conv_session ON conversation_messages(session_id, id);

  CREATE TABLE suppression_list (
    id           INTEGER PRIMARY KEY,
    pattern_type TEXT NOT NULL,
    value        TEXT NOT NULL,
    reason       TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_suppression_unique ON suppression_list(pattern_type, value);

  CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `
];
