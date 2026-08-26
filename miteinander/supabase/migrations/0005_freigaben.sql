-- =====================================================================
-- Freigaben durch verantwortliche Personen
--
-- Eine Freigabepflicht greift in die Selbstbestimmung eines volljaehrigen
-- Menschen ein. Sie ist deshalb hier an eine Grundlage gebunden und wird
-- nicht nur in der Anwendung geprueft, sondern auch in der Datenbank.
-- =====================================================================

create type approval_kind as enum (
  'support_request', 'booking', 'contact_release', 'payment', 'account_deletion'
);

create type approval_status as enum ('pending', 'approved', 'declined', 'withdrawn');

-- Worauf sich die Freigabepflicht stuetzt. Es gibt bewusst nur zwei Faelle.
create type approval_legal_basis as enum ('client_wish', 'court_ordered');

create type responsibility_level as enum ('begleitung', 'verantwortung');

-- Anfragen koennen jetzt auf eine Freigabe warten.
alter type request_status add value if not exists 'waiting_approval' before 'open';

-- ---------------------------------------------------------------------
-- Berechtigungen erweitern
-- ---------------------------------------------------------------------
alter table trusted_access_grants
  add column responsibility_level responsibility_level not null default 'begleitung',
  add column approval_required approval_kind[] not null default '{}',
  add column approval_legal_basis approval_legal_basis,
  add column court_reference text;

-- Eine Begleitung entscheidet nichts.
alter table trusted_access_grants
  add constraint begleitung_entscheidet_nicht check (
    responsibility_level = 'verantwortung' or cardinality(approval_required) = 0
  );

-- Keine Freigabepflicht ohne Grundlage.
alter table trusted_access_grants
  add constraint freigabe_braucht_grundlage check (
    cardinality(approval_required) = 0 or approval_legal_basis is not null
  );

-- Ein gerichtlicher Einwilligungsvorbehalt braucht das Aktenzeichen.
alter table trusted_access_grants
  add constraint vorbehalt_braucht_aktenzeichen check (
    approval_legal_basis is distinct from 'court_ordered'
    or (court_reference is not null and length(trim(court_reference)) > 0)
  );

-- ---------------------------------------------------------------------
-- Freigabeanfragen
-- ---------------------------------------------------------------------
create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references users (id) on delete cascade,
  responsible_id uuid not null references users (id) on delete cascade,
  kind approval_kind not null,
  -- Anfrage, Buchung oder Zahlung, um die es geht.
  subject_id uuid not null,
  status approval_status not null default 'pending',
  -- Kurzfassung fuer die Anzeige. Keine sensiblen Angaben.
  summary text not null,
  easy_summary text not null,
  created_at timestamptz not null default now(),
  -- Bis wann eine Antwort erwartet wird. Danach wird erinnert, sonst nichts.
  respond_by timestamptz not null,
  decided_at timestamptz,
  decided_by uuid references users (id),
  reason text,
  reminded_at timestamptz,
  -- Niemand gibt sich selbst frei.
  constraint keine_selbstfreigabe check (seeker_id <> responsible_id),
  -- Eine Ablehnung braucht eine Begruendung.
  constraint ablehnung_braucht_grund check (
    status <> 'declined' or (reason is not null and length(trim(reason)) > 0)
  ),
  -- Entschieden heisst: von wem und wann.
  constraint entscheidung_vollstaendig check (
    status = 'pending' or (decided_at is not null and decided_by is not null)
  )
);

create index idx_approvals_offen on approval_requests (responsible_id, respond_by)
  where status = 'pending';
create index idx_approvals_seeker on approval_requests (seeker_id, created_at desc);
create index idx_approvals_subject on approval_requests (subject_id);

-- ---------------------------------------------------------------------
-- Nur die benannte Person entscheidet -- und nur einmal.
-- ---------------------------------------------------------------------
create or replace function enforce_approval_decision()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'pending' and new.status <> old.status then
    raise exception 'Diese Freigabe ist bereits entschieden.';
  end if;

  if new.status in ('approved', 'declined') then
    if new.decided_by is distinct from new.responsible_id then
      raise exception 'Nur die benannte verantwortliche Person kann entscheiden.';
    end if;
  end if;

  -- Zurueckziehen kann nur die betroffene Person selbst.
  if new.status = 'withdrawn' and new.decided_by is distinct from new.seeker_id then
    raise exception 'Zurückziehen kann nur die Person, um deren Anliegen es geht.';
  end if;

  return new;
end;
$$;

create trigger trg_approvals_entscheidung
  before update on approval_requests
  for each row execute function enforce_approval_decision();

-- ---------------------------------------------------------------------
-- Row-Level-Security
-- ---------------------------------------------------------------------
alter table approval_requests enable row level security;

-- Die betroffene Person sieht IMMER alles zu sich. Es gibt keine Freigabe,
-- von der sie nichts weiss.
create policy approvals_seeker_read on approval_requests
  for select using (seeker_id = current_app_user_id());

-- Und sie kann ihr eigenes Anliegen zurueckziehen.
create policy approvals_seeker_withdraw on approval_requests
  for update using (seeker_id = current_app_user_id())
  with check (seeker_id = current_app_user_id());

create policy approvals_responsible_read on approval_requests
  for select using (responsible_id = current_app_user_id());

create policy approvals_responsible_decide on approval_requests
  for update using (responsible_id = current_app_user_id())
  with check (responsible_id = current_app_user_id());

-- Sicherheitsvorfaelle koennen eine Freigabe betreffen; das Sicherheitsteam
-- darf sie lesen, aber nie entscheiden.
create policy approvals_staff_read on approval_requests
  for select using (is_staff());

-- ---------------------------------------------------------------------
-- Anfragen, die auf eine Freigabe warten, sind fuer Anbietende unsichtbar.
-- Die bestehende Policy prueft status = 'open' -- damit ist das bereits
-- abgedeckt. Dieser Kommentar haelt fest, dass das Absicht ist.
-- ---------------------------------------------------------------------
