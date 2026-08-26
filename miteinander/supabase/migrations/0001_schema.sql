-- =====================================================================
-- MITEINANDER -- Grundschema
--
-- Grundsaetze:
--  * Besonders geschuetzte Angaben (Unterstuetzungsbedarf, Kontaktdaten)
--    liegen in eigenen Tabellen, nicht im allgemeinen Profil. Eine
--    versehentlich zu weite Profilabfrage kann sie damit nicht mitnehmen.
--  * Standorte werden nur grob gespeichert (gerundete Koordinaten,
--    Postleitzahl-Praefix). Die genaue Adresse liegt getrennt.
--  * Jede Statusspalte ist ein ENUM, damit ungueltige Zustaende gar nicht
--    erst entstehen koennen.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- Aufzaehlungstypen
-- ---------------------------------------------------------------------
create type user_role as enum (
  'support_seeker', 'provider', 'trusted_person', 'reviewer', 'support_agent', 'admin'
);

create type provider_kind as enum ('professional', 'qualified_companion', 'private_helper');

create type verification_status as enum ('pending', 'approved', 'rejected', 'expired');

create type request_status as enum (
  'draft', 'open', 'matched', 'booked', 'completed', 'cancelled', 'withdrawn'
);

create type booking_status as enum (
  'proposed', 'confirmed', 'in_progress', 'completed',
  'cancelled_by_seeker', 'cancelled_by_provider', 'no_show', 'disputed'
);

create type payment_status as enum (
  'not_required', 'pending_confirmation', 'authorized', 'captured', 'refunded', 'failed'
);

create type incident_priority as enum ('critical', 'high', 'normal', 'low');
create type incident_status as enum ('new', 'triaged', 'in_progress', 'resolved', 'closed');

create type ui_mode as enum ('einfach', 'standard', 'individuell');

create type communication_mode as enum (
  'sprechen', 'schreiben', 'leichte_sprache', 'dgs', 'schriftdolmetschen', 'bildkarten', 'taktil'
);

create type content_review_status as enum ('placeholder', 'draft', 'in_review', 'approved', 'outdated');

create type consent_purpose as enum (
  'terms', 'privacy', 'sensitive_support_needs', 'profile_photo', 'location_coarse',
  'push_notifications', 'trusted_person_access', 'contact_release', 'quality_research'
);

create type consent_channel as enum ('tap', 'voice_confirmed', 'assisted_by_trusted_person', 'admin_correction');

create type trusted_scope as enum (
  'view_profile', 'edit_profile', 'create_requests', 'read_messages',
  'write_messages', 'confirm_bookings', 'manage_payments'
);

create type message_kind as enum ('text', 'voice', 'video_invite', 'system');

create type report_category as enum (
  'belaestigung', 'diskriminierung', 'betrug', 'nicht_erschienen',
  'grenzverletzung', 'falsche_angaben', 'sonstiges'
);

-- ---------------------------------------------------------------------
-- Konten
-- ---------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  -- Verknuepfung zur Authentifizierung (Supabase auth.users).
  auth_id uuid unique,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  email citext not null unique,
  -- Bestaetigte Volljaehrigkeit. Im MVP Zugangsvoraussetzung.
  age_confirmed_adult boolean not null default false,
  locale text not null default 'de-DE',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Sperrung durch das Sicherheitsteam. Braucht zwei Augenpaare (siehe audit_events).
  suspended_at timestamptz,
  suspended_reason text
);

create table user_roles (
  user_id uuid not null references users (id) on delete cascade,
  role user_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------
-- Barrierefreiheits-Einstellungen
-- ---------------------------------------------------------------------
create table accessibility_preferences (
  user_id uuid primary key references users (id) on delete cascade,
  ui_mode ui_mode not null default 'standard',
  font_scale numeric(3, 2) not null default 1.00 check (font_scale between 0.90 and 2.50),
  high_contrast boolean not null default false,
  color_scheme text not null default 'system' check (color_scheme in ('system', 'light', 'dark')),
  reduce_motion boolean not null default false,
  read_aloud boolean not null default false,
  read_aloud_rate numeric(3, 2) not null default 1.00 check (read_aloud_rate between 0.50 and 2.00),
  haptics boolean not null default true,
  -- WCAG 2.5.8: nie unter 48 dp.
  touch_target_size int not null default 48 check (touch_target_size >= 48),
  extra_time_factor numeric(3, 2) not null default 1.00 check (extra_time_factor between 1.00 and 5.00),
  easy_language boolean not null default false,
  sign_language boolean not null default false,
  captions boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------
create table support_seeker_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  -- Nur grobe Region. Die exakte Adresse liegt in seeker_contact_details.
  postal_prefix text not null check (postal_prefix ~ '^[0-9]{2,3}$'),
  city text not null,
  approx_lat numeric(6, 2) not null,
  approx_lon numeric(6, 2) not null,
  about_me text,
  photo_path text,
  photo_alt_text text,
  languages text[] not null default array['Deutsch'],
  communication_modes communication_mode[] not null default '{}',
  -- Welche Felder vor einer bestaetigten Buchung sichtbar sind.
  shared_before_booking text[] not null default array['displayName', 'region'],
  updated_at timestamptz not null default now(),
  -- Ein Bild ohne Beschreibung wird nicht angezeigt.
  constraint photo_needs_alt check (photo_path is null or photo_alt_text is not null)
);

-- Besonders geschuetzte Angaben. Eigene Tabelle, eigene Rechte, eigene
-- Loeschregel: faellt die Einwilligung weg, wird die Zeile geloescht.
create table seeker_support_needs (
  user_id uuid primary key references users (id) on delete cascade,
  support_needs text[] not null default '{}',
  mobility_notes text,
  updated_at timestamptz not null default now()
);

-- Kontaktdaten. Werden ausschliesslich ueber eine bestaetigte Buchung
-- sichtbar (siehe RLS in 0002_rls.sql).
create table seeker_contact_details (
  user_id uuid primary key references users (id) on delete cascade,
  phone text,
  street text,
  house_number text,
  postal_code text,
  city text,
  address_note text,
  updated_at timestamptz not null default now()
);

create table provider_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  -- Wird aus geprueften Nachweisen abgeleitet, nicht frei gesetzt.
  kind provider_kind not null default 'private_helper',
  postal_prefix text not null check (postal_prefix ~ '^[0-9]{2,3}$'),
  city text not null,
  approx_lat numeric(6, 2) not null,
  approx_lon numeric(6, 2) not null,
  radius_km int not null default 10 check (radius_km between 1 and 100),
  headline text not null check (length(trim(headline)) between 5 and 120),
  about_me text not null default '',
  -- Pflichtfeld: was ausdruecklich nicht geleistet wird.
  explicitly_not_offered text[] not null default '{}',
  languages text[] not null default array['Deutsch'],
  communication_modes communication_mode[] not null default '{}',
  sign_language_level text not null default 'none'
    check (sign_language_level in ('none', 'basic', 'conversational', 'fluent', 'native')),
  sign_language_verified boolean not null default false,
  accessibility_skills text[] not null default '{}',
  photo_path text,
  photo_alt_text text,
  intro_video_path text,
  volunteer boolean not null default false,
  hourly_rate_cents int check (hourly_rate_cents >= 0),
  cancellation_policy text not null default 'Bis 24 Stunden vorher kostenlos.',
  has_mobility boolean not null default false,
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint photo_needs_alt check (photo_path is null or photo_alt_text is not null),
  -- Ehrenamt und Stundensatz schliessen sich aus.
  constraint volunteer_has_no_rate check (not volunteer or hourly_rate_cents is null),
  -- Ein Nachweis-Kennzeichen darf nur gesetzt sein, wenn es geprueft wurde;
  -- durchgesetzt zusaetzlich per Trigger in 0003_functions.sql.
  constraint dgs_claim_consistent check (not sign_language_verified or sign_language_level <> 'none')
);

-- ---------------------------------------------------------------------
-- Leistungen und Qualifikationen
-- ---------------------------------------------------------------------
create table service_categories (
  key text primary key,
  label text not null,
  easy_label text not null,
  icon text not null,
  -- Erlaubnispflichtige Taetigkeit: nur fuer gepruefte Fachkraefte sichtbar.
  requires_licensed_professional boolean not null default false,
  sort_order int not null default 0
);

create table provider_services (
  provider_id uuid not null references users (id) on delete cascade,
  category_key text not null references service_categories (key),
  experience_years int not null default 0 check (experience_years between 0 and 60),
  note text,
  primary key (provider_id, category_key)
);

create table qualifications (
  key text primary key,
  label text not null,
  -- Berechtigt zu erlaubnispflichtiger Arbeit.
  licenses_professional_work boolean not null default false,
  expires boolean not null default false
);

create table provider_verifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references users (id) on delete cascade,
  qualification_key text not null references qualifications (key),
  status verification_status not null default 'pending',
  -- Nur der Speicherort im privaten Bucket, nie der Inhalt.
  document_path text,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users (id),
  -- Vier-Augen-Prinzip bei Fachqualifikationen.
  second_approver_id uuid references users (id),
  valid_until date,
  rejection_reason text,
  unique (provider_id, qualification_key),
  constraint decision_needs_actor check (status in ('pending') or decided_by is not null),
  constraint rejection_needs_reason check (status <> 'rejected' or rejection_reason is not null),
  constraint second_approver_differs check (second_approver_id is null or second_approver_id <> decided_by)
);

create table availability_slots (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references users (id) on delete cascade,
  weekday int not null check (weekday between 1 and 7),
  start_minute int not null check (start_minute between 0 and 1440),
  end_minute int not null check (end_minute between 0 and 1440),
  recurring boolean not null default true,
  slot_date date,
  constraint end_after_start check (end_minute > start_minute),
  constraint single_slot_has_date check (recurring or slot_date is not null)
);

create table absence_periods (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references users (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  reason text,
  constraint to_after_from check (to_date >= from_date)
);

-- ---------------------------------------------------------------------
-- Anfragen und Vermittlung
-- ---------------------------------------------------------------------
create table support_requests (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references users (id) on delete cascade,
  status request_status not null default 'draft',
  category_keys text[] not null default '{}',
  title text not null,
  description text not null default '',
  important_to_me text[] not null default '{}',
  postal_prefix text not null check (postal_prefix ~ '^[0-9]{2,3}$'),
  city text not null,
  approx_lat numeric(6, 2) not null,
  approx_lon numeric(6, 2) not null,
  starts_at timestamptz not null,
  duration_minutes int not null check (duration_minutes between 15 and 720),
  recurrence text not null default 'once' check (recurrence in ('once', 'weekly', 'biweekly', 'monthly')),
  recurrence_count int check (recurrence_count is null or recurrence_count >= 2),
  -- Wird per Trigger aus den Kategorien abgeleitet (0003_functions.sql).
  requires_licensed_professional boolean not null default false,
  preferred_communication_modes communication_mode[] not null default '{}',
  languages text[] not null default array['Deutsch'],
  budget_cents_per_hour int check (budget_cents_per_hour >= 0),
  accepts_volunteers boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table matches (
  request_id uuid not null references support_requests (id) on delete cascade,
  provider_id uuid not null references users (id) on delete cascade,
  score numeric(6, 2) not null,
  -- Die Gruende werden mitgespeichert, damit eine Empfehlung im Nachhinein
  -- nachvollziehbar bleibt.
  reasons jsonb not null default '[]'::jsonb,
  needs_manual_review boolean not null default false,
  manual_review_reason text,
  created_at timestamptz not null default now(),
  primary key (request_id, provider_id)
);

-- ---------------------------------------------------------------------
-- Kontakt und Buchung
-- ---------------------------------------------------------------------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references support_requests (id) on delete set null,
  seeker_id uuid not null references users (id) on delete cascade,
  provider_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (request_id, seeker_id, provider_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references users (id) on delete cascade,
  kind message_kind not null default 'text',
  body text not null default '',
  -- Sprachnachrichten brauchen ein Transkript, sonst sind sie nicht zugaenglich.
  transcript text,
  media_path text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint voice_needs_transcript check (kind <> 'voice' or (transcript is not null and length(trim(transcript)) > 0))
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references support_requests (id) on delete cascade,
  seeker_id uuid not null references users (id) on delete cascade,
  provider_id uuid not null references users (id) on delete cascade,
  status booking_status not null default 'proposed',
  starts_at timestamptz not null,
  duration_minutes int not null check (duration_minutes between 15 and 720),
  category_keys text[] not null default '{}',
  meeting_point_description text not null,
  -- Steuert die Sichtbarkeit der Kontaktdaten (siehe RLS).
  precise_address_released boolean not null default false,
  price_cents int not null default 0 check (price_cents >= 0),
  volunteer boolean not null default false,
  cancellation_policy text not null,
  notes text,
  confirmed_by_seeker_at timestamptz,
  confirmed_by_provider_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  -- Verbindlich wird eine Buchung nur mit zwei ausdruecklichen Bestaetigungen.
  constraint confirmed_needs_both check (
    status not in ('confirmed', 'in_progress', 'completed')
    or (confirmed_by_seeker_at is not null and confirmed_by_provider_at is not null)
  ),
  constraint volunteer_is_free check (not volunteer or price_cents = 0)
);

create table payment_intents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  status payment_status not null default 'not_required',
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  -- Keine Zahlung ohne zweite, ausdrueckliche Bestaetigung.
  second_confirmation_at timestamptz,
  provider_ref text,
  invoice_path text,
  created_at timestamptz not null default now(),
  constraint capture_needs_second_confirmation check (
    status not in ('authorized', 'captured') or second_confirmation_at is not null
  )
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  author_id uuid not null references users (id) on delete cascade,
  subject_id uuid not null references users (id) on delete cascade,
  rating int not null check (rating between 1 and 3),
  public_comment text,
  -- Geht ausschliesslich an das Sicherheitsteam.
  private_feedback text,
  created_at timestamptz not null default now(),
  unique (booking_id, author_id)
);

-- ---------------------------------------------------------------------
-- Schutzkonzept
-- ---------------------------------------------------------------------
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users (id) on delete cascade,
  subject_user_id uuid references users (id) on delete set null,
  booking_id uuid references bookings (id) on delete set null,
  conversation_id uuid references conversations (id) on delete set null,
  category report_category not null,
  description text not null,
  created_at timestamptz not null default now(),
  incident_id uuid
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  priority incident_priority not null default 'normal',
  status incident_status not null default 'new',
  title text not null,
  -- Bewusst ohne Freitext der Meldung, damit Listen keine sensiblen Inhalte zeigen.
  summary text not null,
  assigned_to uuid references users (id),
  requires_four_eyes boolean not null default false,
  second_approver_id uuid references users (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint in_progress_needs_assignee check (status <> 'in_progress' or assigned_to is not null)
);

alter table reports
  add constraint reports_incident_fk foreign key (incident_id) references incidents (id) on delete set null;

-- ---------------------------------------------------------------------
-- Einwilligungen, Vertrauenspersonen
-- ---------------------------------------------------------------------
create table consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  purpose consent_purpose not null,
  granted boolean not null,
  policy_version text not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  channel consent_channel not null default 'tap',
  assisted_by uuid references users (id),
  created_at timestamptz not null default now()
);

create table trusted_access_grants (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references users (id) on delete cascade,
  trusted_person_id uuid not null references users (id) on delete cascade,
  scopes trusted_scope[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  legal_basis_note text,
  constraint no_self_grant check (seeker_id <> trusted_person_id)
);

-- ---------------------------------------------------------------------
-- Inhalte (CMS)
-- ---------------------------------------------------------------------
create table dgs_content (
  key text primary key,
  title text not null,
  status content_review_status not null default 'placeholder',
  video_path text,
  captions_path text,
  transcript text,
  -- Ohne Namen der pruefenden Person gilt ein Video nicht als geprueft.
  reviewed_by text,
  reviewed_at timestamptz,
  version int not null default 0,
  updated_at timestamptz not null default now(),
  constraint approved_needs_everything check (
    status <> 'approved'
    or (video_path is not null and captions_path is not null
        and transcript is not null and reviewed_by is not null)
  )
);

create table easy_language_content (
  key text primary key,
  text_content text not null,
  status content_review_status not null default 'draft',
  reviewed_by text,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint approved_needs_reviewer check (status <> 'approved' or reviewed_by is not null)
);

-- ---------------------------------------------------------------------
-- Benachrichtigungen und Revision
-- ---------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('booking', 'message', 'verification', 'reminder', 'safety')),
  title text not null,
  -- Inhaltsarm: keine sensiblen Daten in der Push-Vorschau.
  body text not null,
  deeplink text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid not null,
  at timestamptz not null default now(),
  -- Nur was fuer die Revision noetig ist, nie sensible Inhalte.
  metadata jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------
-- Indizes
-- ---------------------------------------------------------------------
create index idx_requests_open on support_requests (status, starts_at) where status = 'open';
create index idx_requests_seeker on support_requests (seeker_id, created_at desc);
create index idx_requests_region on support_requests (postal_prefix, starts_at);
create index idx_requests_categories on support_requests using gin (category_keys);

create index idx_provider_region on provider_profiles (postal_prefix) where published;
create index idx_provider_services_category on provider_services (category_key);
create index idx_availability_provider_weekday on availability_slots (provider_id, weekday);
create index idx_absences_provider on absence_periods (provider_id, from_date, to_date);

create index idx_verifications_status on provider_verifications (status, valid_until);
create index idx_verifications_provider on provider_verifications (provider_id);

create index idx_bookings_user on bookings (seeker_id, starts_at desc);
create index idx_bookings_provider on bookings (provider_id, starts_at desc);
create index idx_bookings_status on bookings (status, starts_at);

create index idx_messages_conversation on messages (conversation_id, created_at);
create index idx_conversations_participants on conversations (seeker_id, provider_id);

create index idx_incidents_open on incidents (priority, created_at)
  where status in ('new', 'triaged', 'in_progress');

create index idx_consents_user_purpose on consents (user_id, purpose, granted, revoked_at);
create index idx_trust_seeker on trusted_access_grants (seeker_id) where revoked_at is null;
create index idx_notifications_user on notifications (user_id, created_at desc) where read_at is null;
create index idx_audit_entity on audit_events (entity, entity_id, at desc);
