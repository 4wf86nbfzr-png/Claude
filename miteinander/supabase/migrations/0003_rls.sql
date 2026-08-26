-- =====================================================================
-- Row-Level-Security
--
-- Grundhaltung: alles ist gesperrt, bis eine Regel es ausdruecklich
-- erlaubt. Besonders geschuetzte Angaben haben eigene Tabellen und damit
-- eigene, engere Regeln -- eine zu weit gefasste Profilabfrage kann sie
-- nicht mitnehmen.
-- =====================================================================

alter table users                      enable row level security;
alter table user_roles                 enable row level security;
alter table accessibility_preferences  enable row level security;
alter table support_seeker_profiles    enable row level security;
alter table seeker_support_needs       enable row level security;
alter table seeker_contact_details     enable row level security;
alter table provider_profiles          enable row level security;
alter table provider_services          enable row level security;
alter table provider_verifications     enable row level security;
alter table availability_slots         enable row level security;
alter table absence_periods            enable row level security;
alter table support_requests           enable row level security;
alter table matches                    enable row level security;
alter table conversations              enable row level security;
alter table messages                   enable row level security;
alter table bookings                   enable row level security;
alter table payment_intents            enable row level security;
alter table reviews                    enable row level security;
alter table reports                    enable row level security;
alter table incidents                  enable row level security;
alter table consents                   enable row level security;
alter table trusted_access_grants      enable row level security;
alter table notifications              enable row level security;
alter table audit_events               enable row level security;
alter table dgs_content                enable row level security;
alter table easy_language_content      enable row level security;
alter table service_categories         enable row level security;
alter table qualifications             enable row level security;

-- Hilfsfunktion: besteht zwischen zwei Personen eine bestaetigte Buchung
-- mit freigegebenen Kontaktdaten?
create or replace function has_released_booking(p_seeker uuid, p_provider uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from bookings b
    where b.seeker_id = p_seeker
      and b.provider_id = p_provider
      and b.status in ('confirmed', 'in_progress', 'completed')
      and b.precise_address_released
  );
$$;

create or replace function trusted_has_scope(p_seeker uuid, p_scope trusted_scope)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from trusted_access_grants g
    where g.seeker_id = p_seeker
      and g.trusted_person_id = current_app_user_id()
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and p_scope = any (g.scopes)
  );
$$;

-- ---------------------------------------------------------------------
-- Konten
-- ---------------------------------------------------------------------
create policy users_self_read on users
  for select using (id = current_app_user_id());

-- Anbietende und Suchende sehen voneinander nur den Anzeigenamen; das
-- wird ueber Sichten geloest (siehe 0004_views.sql), nicht ueber eine
-- weite Tabellenregel.
create policy users_staff_read on users
  for select using (is_staff());

create policy users_self_update on users
  for update using (id = current_app_user_id())
  with check (id = current_app_user_id());

create policy user_roles_self_read on user_roles
  for select using (user_id = current_app_user_id() or is_staff());

-- ---------------------------------------------------------------------
-- Barrierefreiheits-Einstellungen: streng persoenlich.
-- Auch die Verwaltung hat hier nichts zu suchen.
-- ---------------------------------------------------------------------
create policy prefs_own on accessibility_preferences
  for all using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());

-- ---------------------------------------------------------------------
-- Profil der suchenden Person
-- ---------------------------------------------------------------------
create policy seeker_profile_own on support_seeker_profiles
  for all using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());

create policy seeker_profile_trusted on support_seeker_profiles
  for select using (trusted_has_scope(user_id, 'view_profile'));

-- Anbietende sehen ein Profil nur, wenn eine Anfrage oder Buchung besteht.
create policy seeker_profile_for_provider on support_seeker_profiles
  for select using (
    exists (
      select 1 from conversations c
      where c.seeker_id = support_seeker_profiles.user_id
        and c.provider_id = current_app_user_id()
    )
  );

-- Sensible Bedarfsangaben: nur die Person selbst und eine ausdruecklich
-- berechtigte Vertrauensperson. Keine Ausnahme fuer die Verwaltung.
create policy support_needs_own on seeker_support_needs
  for all using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());

create policy support_needs_trusted on seeker_support_needs
  for select using (trusted_has_scope(user_id, 'view_profile'));

-- Kontaktdaten: eigene Person, berechtigte Vertrauensperson, und die
-- gebuchte anbietende Person -- Letztere nur bei freigegebener Buchung.
create policy contact_own on seeker_contact_details
  for all using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());

create policy contact_trusted on seeker_contact_details
  for select using (trusted_has_scope(user_id, 'view_profile'));

create policy contact_booked_provider on seeker_contact_details
  for select using (has_released_booking(user_id, current_app_user_id()));

-- ---------------------------------------------------------------------
-- Anbieterprofile
-- ---------------------------------------------------------------------
create policy provider_profile_own on provider_profiles
  for all using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());

-- Veroeffentlichte Profile sind fuer angemeldete Personen sichtbar --
-- ohne Kontaktdaten, die stehen ohnehin nicht in dieser Tabelle.
create policy provider_profile_public on provider_profiles
  for select using (published and current_app_user_id() is not null);

create policy provider_profile_staff on provider_profiles
  for select using (is_staff());

create policy provider_services_read on provider_services
  for select using (current_app_user_id() is not null);

create policy provider_services_own on provider_services
  for all using (provider_id = current_app_user_id())
  with check (provider_id = current_app_user_id());

create policy availability_own on availability_slots
  for all using (provider_id = current_app_user_id())
  with check (provider_id = current_app_user_id());

create policy availability_read on availability_slots
  for select using (current_app_user_id() is not null);

create policy absences_own on absence_periods
  for all using (provider_id = current_app_user_id())
  with check (provider_id = current_app_user_id());

-- ---------------------------------------------------------------------
-- Nachweise: die anbietende Person sieht die eigenen, entscheiden duerfen
-- nur Pruefstelle und Verwaltung. Dokumente liegen im privaten Bucket.
-- ---------------------------------------------------------------------
create policy verifications_own_read on provider_verifications
  for select using (provider_id = current_app_user_id());

create policy verifications_own_submit on provider_verifications
  for insert with check (provider_id = current_app_user_id() and status = 'pending');

create policy verifications_reviewer_read on provider_verifications
  for select using (has_role('reviewer') or has_role('admin'));

create policy verifications_reviewer_decide on provider_verifications
  for update using (has_role('reviewer') or has_role('admin'))
  with check (has_role('reviewer') or has_role('admin'));

-- ---------------------------------------------------------------------
-- Anfragen
-- ---------------------------------------------------------------------
create policy requests_own on support_requests
  for all using (seeker_id = current_app_user_id())
  with check (seeker_id = current_app_user_id());

create policy requests_trusted_create on support_requests
  for insert with check (trusted_has_scope(seeker_id, 'create_requests'));

create policy requests_trusted_read on support_requests
  for select using (trusted_has_scope(seeker_id, 'view_profile'));

-- Kernregel: erlaubnispflichtige Anfragen sehen ausschliesslich
-- Personen mit gueltiger Fachqualifikation.
create policy requests_visible_to_matching_providers on support_requests
  for select using (
    status = 'open'
    and has_role('provider')
    and has_verified_identity(current_app_user_id())
    and (
      not requires_licensed_professional
      or can_do_licensed_work(current_app_user_id())
    )
    and exists (
      select 1 from provider_services ps
      where ps.provider_id = current_app_user_id()
        and ps.category_key = any (support_requests.category_keys)
    )
  );

create policy matches_read on matches
  for select using (
    provider_id = current_app_user_id()
    or exists (
      select 1 from support_requests r
      where r.id = matches.request_id and r.seeker_id = current_app_user_id()
    )
  );

-- ---------------------------------------------------------------------
-- Unterhaltungen und Nachrichten
-- ---------------------------------------------------------------------
create policy conversations_participants on conversations
  for all using (
    seeker_id = current_app_user_id() or provider_id = current_app_user_id()
  )
  with check (
    seeker_id = current_app_user_id() or provider_id = current_app_user_id()
  );

create policy conversations_trusted on conversations
  for select using (trusted_has_scope(seeker_id, 'read_messages'));

create policy messages_participants_read on messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.seeker_id = current_app_user_id() or c.provider_id = current_app_user_id())
    )
  );

create policy messages_trusted_read on messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and trusted_has_scope(c.seeker_id, 'read_messages')
    )
  );

create policy messages_send on messages
  for insert with check (
    sender_id = current_app_user_id()
    and exists (
      select 1 from conversations c
      where c.id = conversation_id
        and (c.seeker_id = current_app_user_id() or c.provider_id = current_app_user_id())
        and c.closed_at is null
    )
  );

-- ---------------------------------------------------------------------
-- Buchungen und Zahlungen
-- ---------------------------------------------------------------------
create policy bookings_participants on bookings
  for all using (
    seeker_id = current_app_user_id() or provider_id = current_app_user_id()
  )
  with check (
    seeker_id = current_app_user_id() or provider_id = current_app_user_id()
  );

create policy bookings_trusted_confirm on bookings
  for update using (trusted_has_scope(seeker_id, 'confirm_bookings'))
  with check (trusted_has_scope(seeker_id, 'confirm_bookings'));

create policy payments_participants on payment_intents
  for select using (
    exists (
      select 1 from bookings b
      where b.id = payment_intents.booking_id
        and (b.seeker_id = current_app_user_id() or b.provider_id = current_app_user_id())
    )
  );

-- ---------------------------------------------------------------------
-- Bewertungen: der oeffentliche Teil ist lesbar, die private
-- Rueckmeldung nur fuer die schreibende Person und das Sicherheitsteam.
-- Getrennt wird das ueber die Sicht public_reviews (0004_views.sql).
-- ---------------------------------------------------------------------
create policy reviews_author on reviews
  for all using (author_id = current_app_user_id())
  with check (author_id = current_app_user_id());

create policy reviews_staff on reviews
  for select using (is_staff());

-- ---------------------------------------------------------------------
-- Meldungen und Vorfaelle
-- ---------------------------------------------------------------------
create policy reports_own_insert on reports
  for insert with check (reporter_id = current_app_user_id());

create policy reports_own_read on reports
  for select using (reporter_id = current_app_user_id());

create policy reports_staff on reports
  for select using (is_staff());

create policy incidents_staff on incidents
  for all using (is_staff())
  with check (is_staff());

-- ---------------------------------------------------------------------
-- Einwilligungen und Vertrauenspersonen
-- ---------------------------------------------------------------------
create policy consents_own on consents
  for all using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());

-- Die Verwaltung darf Einwilligungen nur lesen, nie erteilen.
create policy consents_staff_read on consents
  for select using (is_staff());

create policy trust_seeker on trusted_access_grants
  for all using (seeker_id = current_app_user_id())
  with check (seeker_id = current_app_user_id());

create policy trust_person_read on trusted_access_grants
  for select using (trusted_person_id = current_app_user_id());

-- ---------------------------------------------------------------------
-- Benachrichtigungen, Protokoll, Inhalte
-- ---------------------------------------------------------------------
create policy notifications_own on notifications
  for all using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());

-- Das Protokoll ist auch fuer die Verwaltung nur lesbar. Nachtraegliche
-- Aenderungen wuerden die Revisionsfaehigkeit zerstoeren.
create policy audit_read_staff on audit_events
  for select using (has_role('admin'));

create policy content_read_all on dgs_content
  for select using (true);

create policy content_edit_admin on dgs_content
  for all using (has_role('admin'))
  with check (has_role('admin'));

create policy easy_read_all on easy_language_content
  for select using (true);

create policy easy_edit_admin on easy_language_content
  for all using (has_role('admin'))
  with check (has_role('admin'));

create policy categories_read_all on service_categories for select using (true);
create policy qualifications_read_all on qualifications for select using (true);
