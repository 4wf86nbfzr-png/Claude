-- =====================================================================
-- Funktionen und Trigger
--
-- Regeln, die niemals umgangen werden duerfen, stehen hier -- nicht nur in
-- der Anwendung. Ein direkter Datenbankzugriff kann sie damit nicht
-- aushebeln.
-- =====================================================================

-- Die eigene users-Zeile zur angemeldeten Person.
create or replace function current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from users where auth_id = auth.uid() and deleted_at is null;
$$;

create or replace function has_role(wanted user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = current_app_user_id() and ur.role = wanted
  );
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_role('admin') or has_role('reviewer') or has_role('support_agent');
$$;

-- ---------------------------------------------------------------------
-- Erlaubnispflicht wird abgeleitet, nie von aussen gesetzt.
-- Sonst koennte eine pflegerische Anfrage als Alltagshilfe getarnt werden.
-- ---------------------------------------------------------------------
create or replace function set_requires_licensed_professional()
returns trigger
language plpgsql
as $$
begin
  new.requires_licensed_professional := exists (
    select 1
    from service_categories sc
    where sc.key = any (new.category_keys)
      and sc.requires_licensed_professional
  );
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_requests_licensed
  before insert or update of category_keys on support_requests
  for each row execute function set_requires_licensed_professional();

-- ---------------------------------------------------------------------
-- Darf diese anbietende Person erlaubnispflichtige Arbeit uebernehmen?
-- Nur mit geprueftem UND gueltigem Nachweis.
-- ---------------------------------------------------------------------
create or replace function can_do_licensed_work(p_provider uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from provider_verifications pv
    join qualifications q on q.key = pv.qualification_key
    where pv.provider_id = p_provider
      and pv.status = 'approved'
      and q.licenses_professional_work
      and (pv.valid_until is null or pv.valid_until >= current_date)
  );
$$;

create or replace function has_verified_identity(p_provider uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from provider_verifications pv
    where pv.provider_id = p_provider
      and pv.qualification_key = 'identitaet'
      and pv.status = 'approved'
      and (pv.valid_until is null or pv.valid_until >= current_date)
  );
$$;

-- ---------------------------------------------------------------------
-- Rolle im Profil folgt den Nachweisen. Kein Titel ohne Pruefung.
-- ---------------------------------------------------------------------
create or replace function refresh_provider_kind()
returns trigger
language plpgsql
as $$
declare
  target uuid := coalesce(new.provider_id, old.provider_id);
  next_kind provider_kind;
  dgs_ok boolean;
begin
  if can_do_licensed_work(target) then
    next_kind := 'professional';
  elsif exists (
    select 1 from provider_verifications pv
    where pv.provider_id = target
      and pv.qualification_key = 'alltagsbegleitung_43b'
      and pv.status = 'approved'
  ) then
    next_kind := 'qualified_companion';
  else
    next_kind := 'private_helper';
  end if;

  dgs_ok := exists (
    select 1 from provider_verifications pv
    where pv.provider_id = target
      and pv.qualification_key = 'dgs_kompetenz'
      and pv.status = 'approved'
  );

  update provider_profiles
     set kind = next_kind,
         sign_language_verified = dgs_ok,
         updated_at = now()
   where user_id = target;

  return null;
end;
$$;

create trigger trg_verifications_refresh_kind
  after insert or update or delete on provider_verifications
  for each row execute function refresh_provider_kind();

-- ---------------------------------------------------------------------
-- Vier-Augen-Prinzip fuer Fachqualifikationen.
-- ---------------------------------------------------------------------
create or replace function enforce_four_eyes_on_verification()
returns trigger
language plpgsql
as $$
declare
  needs_two boolean;
begin
  if new.status <> 'approved' then
    return new;
  end if;

  select q.licenses_professional_work into needs_two
    from qualifications q where q.key = new.qualification_key;

  if needs_two then
    if new.second_approver_id is null then
      raise exception 'Fachqualifikationen brauchen die Freigabe einer zweiten Person.';
    end if;
    if new.second_approver_id = new.decided_by then
      raise exception 'Die zweite Freigabe muss von einer anderen Person kommen.';
    end if;
    if not exists (
      select 1 from user_roles ur
      where ur.user_id = new.second_approver_id and ur.role in ('reviewer', 'admin')
    ) then
      raise exception 'Die zweite Person ist für die Freigabe nicht berechtigt.';
    end if;
  end if;

  -- Ablaufende Nachweise brauchen ein Gueltigkeitsdatum.
  if exists (select 1 from qualifications q where q.key = new.qualification_key and q.expires)
     and new.valid_until is null then
    raise exception 'Dieser Nachweis läuft ab und braucht ein Gültigkeitsdatum.';
  end if;

  return new;
end;
$$;

create trigger trg_verifications_four_eyes
  before insert or update on provider_verifications
  for each row execute function enforce_four_eyes_on_verification();

-- ---------------------------------------------------------------------
-- Kontaktfreigabe: nur mit bestaetigter Buchung UND aktiver Einwilligung.
-- ---------------------------------------------------------------------
create or replace function has_active_consent(p_user uuid, p_purpose consent_purpose)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from consents c
    where c.user_id = p_user
      and c.purpose = p_purpose
      and c.granted
      and c.revoked_at is null
  );
$$;

create or replace function enforce_contact_release()
returns trigger
language plpgsql
as $$
begin
  if new.precise_address_released and not old.precise_address_released then
    if new.status not in ('confirmed', 'in_progress', 'completed') then
      raise exception 'Kontaktdaten werden erst mit einer bestätigten Buchung freigegeben.';
    end if;
    if not has_active_consent(new.seeker_id, 'contact_release') then
      raise exception 'Für die Freigabe der Kontaktdaten fehlt die Einwilligung.';
    end if;
  end if;

  -- Nach Absage oder Abschluss wird die Freigabe wieder eingezogen.
  if new.status in ('cancelled_by_seeker', 'cancelled_by_provider', 'no_show') then
    new.precise_address_released := false;
  end if;

  return new;
end;
$$;

create trigger trg_bookings_contact_release
  before update on bookings
  for each row execute function enforce_contact_release();

-- ---------------------------------------------------------------------
-- Widerruf der Einwilligung zu sensiblen Angaben loescht diese sofort.
-- ---------------------------------------------------------------------
create or replace function purge_support_needs_on_revoke()
returns trigger
language plpgsql
as $$
begin
  if new.purpose = 'sensitive_support_needs' and (not new.granted or new.revoked_at is not null) then
    delete from seeker_support_needs where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger trg_consents_purge_sensitive
  after insert or update on consents
  for each row execute function purge_support_needs_on_revoke();

-- ---------------------------------------------------------------------
-- Abgelaufene Nachweise. Wird taeglich per Cron aufgerufen.
-- ---------------------------------------------------------------------
create or replace function expire_verifications()
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update provider_verifications
     set status = 'expired'
   where status = 'approved'
     and valid_until is not null
     and valid_until < current_date;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ---------------------------------------------------------------------
-- Ein neues DGS-Video setzt die fachliche Pruefung zurueck.
-- ---------------------------------------------------------------------
create or replace function reset_dgs_review_on_new_video()
returns trigger
language plpgsql
as $$
begin
  if new.video_path is distinct from old.video_path then
    new.status := 'in_review';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_dgs_reset_review
  before update on dgs_content
  for each row execute function reset_dgs_review_on_new_video();

-- ---------------------------------------------------------------------
-- Revisionsprotokoll fuer sicherheitsrelevante Vorgaenge.
-- Es speichert bewusst keine Inhalte, nur Bezuege.
-- ---------------------------------------------------------------------
create or replace function log_audit_event()
returns trigger
language plpgsql
as $$
begin
  insert into audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    current_app_user_id(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    jsonb_build_object('status', to_jsonb(new) -> 'status')
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_verifications
  after insert or update on provider_verifications
  for each row execute function log_audit_event();

create trigger trg_audit_incidents
  after insert or update on incidents
  for each row execute function log_audit_event();

create trigger trg_audit_bookings
  after update on bookings
  for each row execute function log_audit_event();
