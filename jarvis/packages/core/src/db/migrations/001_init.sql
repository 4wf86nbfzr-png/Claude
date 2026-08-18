-- JARVIS Grundschema (Version 1)
-- Alles liegt lokal in einer SQLite-Datei. Keine Cloud, keine Fremdserver.

------------------------------------------------------------------------------
-- Einstellungen und Protokolle
------------------------------------------------------------------------------

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id          TEXT PRIMARY KEY,
  ts          TEXT NOT NULL,
  actor       TEXT NOT NULL,              -- 'benutzer' | 'jarvis' | Agentenname
  action      TEXT NOT NULL,              -- z.B. 'recherche.start', 'mail.gesendet'
  entity_type TEXT,                       -- 'company' | 'email' | 'approval' | ...
  entity_id   TEXT,
  summary     TEXT NOT NULL,              -- eine Zeile Klartext, deutsch
  detail_json TEXT,
  outcome     TEXT NOT NULL DEFAULT 'ok'  -- 'ok' | 'fehler' | 'abgebrochen'
);

CREATE INDEX idx_audit_ts ON audit_logs (ts DESC);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id);

------------------------------------------------------------------------------
-- Quellen: jede recherchierte Information braucht eine Herkunft
------------------------------------------------------------------------------

CREATE TABLE sources (
  id           TEXT PRIMARY KEY,
  url          TEXT NOT NULL,
  title        TEXT,
  kind         TEXT NOT NULL,   -- 'website' | 'impressum' | 'kontakt' | 'suchtreffer' | 'drittquelle' | 'manuell'
  http_status  INTEGER,
  fetched_at   TEXT NOT NULL,
  snippet      TEXT,            -- Textausschnitt, der die Aussage belegt
  content_hash TEXT
);

CREATE INDEX idx_sources_url ON sources (url);

------------------------------------------------------------------------------
-- Firmen, Ansprechpartner, Adressen
------------------------------------------------------------------------------

CREATE TABLE companies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,            -- normalisierter Name fuer Dublettenpruefung
  website     TEXT,
  domain      TEXT,                     -- registrierbare Domain, normalisiert
  street      TEXT,
  postal_code TEXT,
  city        TEXT,
  region      TEXT,
  country     TEXT DEFAULT 'DE',
  industry    TEXT,
  size_hint   TEXT,                     -- z.B. 'ca. 50 Mitarbeitende (laut Website)'
  description TEXT,
  phone       TEXT,
  status      TEXT NOT NULL DEFAULT 'neu',
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Dubletten werden ueber Slug bzw. Domain verhindert.
CREATE UNIQUE INDEX idx_companies_slug ON companies (slug);
CREATE UNIQUE INDEX idx_companies_domain ON companies (domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_companies_city ON companies (city);

CREATE TABLE contacts (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL,
  role       TEXT,                       -- Position, nur wenn oeffentlich angegeben
  phone      TEXT,
  salutation TEXT,
  source_id  TEXT REFERENCES sources (id),
  notes      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_contacts_company ON contacts (company_id);

CREATE TABLE email_addresses (
  id           TEXT PRIMARY KEY,
  company_id   TEXT REFERENCES companies (id) ON DELETE CASCADE,
  contact_id   TEXT REFERENCES contacts (id) ON DELETE SET NULL,
  address      TEXT NOT NULL,
  address_norm TEXT NOT NULL,            -- kleingeschrieben, getrimmt
  kind         TEXT NOT NULL DEFAULT 'funktion',  -- 'funktion' (info@) | 'person'
  verification TEXT NOT NULL,            -- 'VERIFIZIERT' | 'WAHRSCHEINLICH' | 'NICHT_VERIFIZIERT'
  verify_note  TEXT,                     -- warum dieser Status
  mx_ok        INTEGER,                  -- 1/0/NULL: Domain kann Mail empfangen
  source_id    TEXT REFERENCES sources (id),
  found_on_url TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Verhindert dieselbe Adresse doppelt in der Datenbank.
CREATE UNIQUE INDEX idx_email_addr_norm ON email_addresses (address_norm);
CREATE INDEX idx_email_addr_company ON email_addresses (company_id);

------------------------------------------------------------------------------
-- Fakten vs. KI-Einschaetzung (Trennung ist Pflicht, siehe Recherchequalitaet)
------------------------------------------------------------------------------

CREATE TABLE company_facts (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,              -- 'FAKT' | 'KI_EINSCHAETZUNG'
  label      TEXT NOT NULL,              -- z.B. 'Leistungsspektrum'
  value      TEXT NOT NULL,
  source_id  TEXT REFERENCES sources (id),  -- bei FAKT verpflichtend (Anwendungsregel)
  created_at TEXT NOT NULL
);

CREATE INDEX idx_facts_company ON company_facts (company_id, kind);

------------------------------------------------------------------------------
-- Kampagnen und Zielliste
------------------------------------------------------------------------------

CREATE TABLE outreach_campaigns (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  service       TEXT NOT NULL,           -- angebotene Dienstleistung
  region        TEXT,
  radius_km     INTEGER,
  goal_count    INTEGER NOT NULL DEFAULT 20,
  brief         TEXT,                    -- freier Kontext fuer die Personalisierung
  sender_signature TEXT,
  status        TEXT NOT NULL DEFAULT 'neu',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE campaign_targets (
  id           TEXT PRIMARY KEY,
  campaign_id  TEXT NOT NULL REFERENCES outreach_campaigns (id) ON DELETE CASCADE,
  company_id   TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  email_id     TEXT REFERENCES emails (id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'neu',
  reason       TEXT,                     -- Akquisegrund (KI-Einschaetzung, klar markiert)
  last_error   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_target_unique ON campaign_targets (campaign_id, company_id);
CREATE INDEX idx_target_status ON campaign_targets (status);

------------------------------------------------------------------------------
-- E-Mails: Entwuerfe, Freigaben, Versand, Eingang
------------------------------------------------------------------------------

CREATE TABLE emails (
  id            TEXT PRIMARY KEY,
  campaign_id   TEXT REFERENCES outreach_campaigns (id) ON DELETE SET NULL,
  company_id    TEXT REFERENCES companies (id) ON DELETE SET NULL,
  contact_id    TEXT REFERENCES contacts (id) ON DELETE SET NULL,
  direction     TEXT NOT NULL DEFAULT 'ausgehend',  -- 'ausgehend' | 'eingehend'
  to_address    TEXT NOT NULL,
  to_name       TEXT,
  cc            TEXT,
  bcc           TEXT,
  from_address  TEXT,
  reply_to      TEXT,
  subject       TEXT NOT NULL,
  body_text     TEXT NOT NULL,
  body_html     TEXT,
  status        TEXT NOT NULL DEFAULT 'entwurf',
  approval_id   TEXT REFERENCES approvals (id) ON DELETE SET NULL,
  content_hash  TEXT NOT NULL,           -- Hash ueber Empfaenger/Betreff/Text
  provider      TEXT,                    -- 'smtp' | 'gmail' | 'graph'
  message_id    TEXT,
  in_reply_to   TEXT,
  thread_key    TEXT,                    -- zur spaeteren Zuordnung von Antworten
  error         TEXT,
  sent_at       TEXT,
  received_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX idx_emails_status ON emails (status);
CREATE INDEX idx_emails_company ON emails (company_id);
CREATE INDEX idx_emails_thread ON emails (thread_key);
CREATE INDEX idx_emails_to ON emails (to_address);

CREATE TABLE email_attachments (
  id         TEXT PRIMARY KEY,
  email_id   TEXT NOT NULL REFERENCES emails (id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  path       TEXT NOT NULL,
  mime_type  TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_attachments_email ON email_attachments (email_id);

CREATE TABLE interaction_history (
  id          TEXT PRIMARY KEY,
  company_id  TEXT REFERENCES companies (id) ON DELETE CASCADE,
  contact_id  TEXT REFERENCES contacts (id) ON DELETE SET NULL,
  email_id    TEXT REFERENCES emails (id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,             -- 'mail' | 'telefon' | 'notiz'
  direction   TEXT NOT NULL,             -- 'ausgehend' | 'eingehend'
  occurred_at TEXT NOT NULL,
  summary     TEXT NOT NULL
);

CREATE INDEX idx_history_company ON interaction_history (company_id, occurred_at DESC);

------------------------------------------------------------------------------
-- Freigaben: ohne Eintrag hier passiert nichts Kritisches
------------------------------------------------------------------------------

CREATE TABLE approvals (
  id            TEXT PRIMARY KEY,
  action_type   TEXT NOT NULL,           -- 'mail.senden' | 'datei.loeschen' | ...
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL,
  payload_json  TEXT NOT NULL,           -- exakt der Aufruf, der ausgefuehrt wird
  content_hash  TEXT,                    -- Inhalt zum Zeitpunkt der Anfrage
  risk          TEXT NOT NULL DEFAULT 'mittel',   -- 'niedrig' | 'mittel' | 'hoch'
  status        TEXT NOT NULL DEFAULT 'offen',    -- 'offen' | 'freigegeben' | 'abgelehnt' | 'abgelaufen' | 'ausgefuehrt' | 'fehlgeschlagen'
  requested_by  TEXT NOT NULL,
  requested_at  TEXT NOT NULL,
  decided_at    TEXT,
  decided_by    TEXT,
  decision_note TEXT,
  executed_at   TEXT,
  result_json   TEXT,
  expires_at    TEXT
);

CREATE INDEX idx_approvals_status ON approvals (status, requested_at DESC);

------------------------------------------------------------------------------
-- Compliance: Sperrliste, Aufgaben, Gedaechtnis, Gespraeche
------------------------------------------------------------------------------

CREATE TABLE suppression_list (
  id          TEXT PRIMARY KEY,
  scope       TEXT NOT NULL,             -- 'email' | 'domain' | 'firma'
  value_norm  TEXT NOT NULL,
  reason      TEXT,
  source      TEXT,                      -- 'widerspruch' | 'manuell' | 'bounce'
  created_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_suppression_value ON suppression_list (scope, value_norm);

CREATE TABLE tasks (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'offen',   -- 'offen' | 'laeuft' | 'erledigt' | 'abgebrochen'
  due_at     TEXT,
  notes      TEXT,
  entity_type TEXT,
  entity_id   TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_tasks_status ON tasks (status, due_at);

CREATE TABLE memory_items (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,              -- 'praeferenz' | 'fakt' | 'person' | 'projekt'
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 1,
  source     TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE UNIQUE INDEX idx_memory_key ON memory_items (kind, key);

CREATE TABLE conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role            TEXT NOT NULL,          -- 'user' | 'assistant' | 'tool' | 'system'
  content         TEXT NOT NULL,
  agent           TEXT,
  tool_calls_json TEXT,
  tool_call_id    TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX idx_messages_conv ON messages (conversation_id, created_at);
