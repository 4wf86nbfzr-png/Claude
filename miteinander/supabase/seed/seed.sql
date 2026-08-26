-- =====================================================================
-- Stammdaten und fiktive Demo-Daten
--
-- Alle Personen sind frei erfunden und mit "(Demo)" gekennzeichnet.
-- Es sind keine echten Gesundheitsangaben enthalten. Die E-Mail-Adressen
-- nutzen die reservierte Domain .invalid, damit nichts versehentlich
-- zugestellt werden kann.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Stammdaten (kein Demo-Inhalt, gehoeren zum Produkt)
-- ---------------------------------------------------------------------
insert into service_categories (key, label, easy_label, icon, requires_licensed_professional, sort_order) values
  ('begleitung_termine', 'Begleitung zu Terminen', 'Jemand geht mit Ihnen zu einem Termin. Zum Beispiel zum Amt oder zur Ärztin.', 'calendar-account', false, 10),
  ('einkaufen', 'Einkaufen', 'Jemand kauft mit Ihnen ein. Oder kauft für Sie ein.', 'cart', false, 20),
  ('freizeit_teilhabe', 'Freizeit und Teilhabe', 'Jemand geht mit Ihnen ins Kino, ins Café oder zu einem Verein.', 'ticket', false, 30),
  ('spaziergang', 'Spaziergänge', 'Jemand geht mit Ihnen an die frische Luft.', 'walk', false, 40),
  ('vorlesen', 'Vorlesen', 'Jemand liest Ihnen etwas vor. Zum Beispiel Post oder ein Buch.', 'book-open', false, 50),
  ('haushaltshilfe', 'Haushaltshilfe', 'Jemand hilft Ihnen zu Hause. Zum Beispiel beim Aufräumen.', 'home-heart', false, 60),
  ('technische_hilfe', 'Technische Hilfe', 'Jemand hilft Ihnen mit Handy, Computer oder Fernseher.', 'cellphone-cog', false, 70),
  ('kommunikation', 'Hilfe beim Verstehen und Sprechen', 'Jemand hilft Ihnen, Briefe zu verstehen oder etwas zu sagen.', 'message-text', false, 80),
  ('fahrbegleitung', 'Fahrbegleitung', 'Jemand fährt mit Ihnen im Bus, in der Bahn oder im Auto mit.', 'bus-clock', false, 90),
  ('alltagshilfe', 'Weitere Alltagshilfe', 'Jemand hilft Ihnen bei etwas anderem im Alltag.', 'hand-heart', false, 100),
  ('pflegerische_unterstuetzung', 'Pflegerische Unterstützung', 'Jemand hilft Ihnen bei der Körper-Pflege. Das darf nur eine ausgebildete Fachkraft machen.', 'medical-bag', true, 110),
  ('medizinische_unterstuetzung', 'Medizinnahe Unterstützung', 'Jemand hilft Ihnen mit Medikamenten oder Hilfsmitteln. Das darf nur eine ausgebildete Fachkraft machen.', 'pill', true, 120)
on conflict (key) do nothing;

insert into qualifications (key, label, licenses_professional_work, expires) values
  ('heilerziehungspflege', 'Heilerziehungspfleger:in', true, false),
  ('pflegefachkraft', 'Pflegefachkraft', true, false),
  ('altenpflege', 'Altenpfleger:in', true, false),
  ('alltagsbegleitung_43b', 'Qualifizierte Alltagsbegleitung', false, false),
  ('erste_hilfe', 'Erste-Hilfe-Kurs', false, true),
  ('fuehrungszeugnis_erweitert', 'Erweitertes Führungszeugnis', false, true),
  ('identitaet', 'Identitätsprüfung', false, false),
  ('dgs_kompetenz', 'Nachweis Gebärdensprach-Kompetenz', false, false),
  ('haftpflicht', 'Haftpflichtversicherung', false, true)
on conflict (key) do nothing;

-- Die DGS-Katalogeintraege stehen bewusst auf "placeholder": es gibt noch
-- keine produzierten Videos. Die App zeigt das offen an.
insert into dgs_content (key, title, status) values
  ('onboarding.welcome', 'Willkommen', 'placeholder'),
  ('onboarding.mode_choice', 'Was möchten Sie tun?', 'placeholder'),
  ('onboarding.accessibility', 'Bedienung einstellen', 'placeholder'),
  ('profile.create', 'Ihr Profil anlegen', 'placeholder'),
  ('search.overview', 'So finden Sie Unterstützung', 'placeholder'),
  ('request.step.what', 'Wobei brauchen Sie Hilfe?', 'placeholder'),
  ('request.step.when', 'Wann brauchen Sie Hilfe?', 'placeholder'),
  ('request.step.where', 'Wo ungefähr?', 'placeholder'),
  ('request.step.important', 'Was ist Ihnen wichtig?', 'placeholder'),
  ('request.summary', 'Ihre Anfrage im Überblick', 'placeholder'),
  ('provider.profile_explained', 'Das Profil verstehen', 'placeholder'),
  ('booking.summary', 'Ihre Buchung im Überblick', 'placeholder'),
  ('booking.cancellation', 'Einen Termin absagen', 'placeholder'),
  ('payment.overview', 'Bezahlen', 'placeholder'),
  ('complaint.how_to', 'Sich beschweren', 'placeholder'),
  ('safety.emergency', 'Notfall und Sicherheit', 'placeholder'),
  ('privacy.overview', 'Ihre Daten', 'placeholder'),
  ('help.overview', 'Hilfe', 'placeholder')
on conflict (key) do nothing;

insert into easy_language_content (key, text_content, status) values
  ('home.title', 'Was möchten Sie tun?', 'draft'),
  ('home.seek', E'Ich suche Unterstützung.\nJemand hilft mir im Alltag.', 'draft'),
  ('home.offer', E'Ich biete Unterstützung an.\nIch möchte anderen Menschen helfen.', 'draft'),
  ('home.assisted', E'Jemand hilft mir bei der Bedienung.\nZum Beispiel eine Person aus meiner Familie.', 'draft'),
  ('emergency.notice', E'Diese App ist kein Notruf.\nIst jemand in Gefahr?\nDann rufen Sie an: 1 1 2.', 'draft'),
  ('privacy.address', E'Ihre genaue Adresse sieht niemand.\nAndere sehen nur Ihren Ort.', 'draft'),
  ('booking.confirm', E'Möchten Sie den Termin buchen?\nDann tippen Sie auf: Ja, Termin buchen.', 'draft'),
  ('draft.saved', E'Ihre Eingaben sind gespeichert.\nSie können später weitermachen.', 'draft')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Demo-Konten
-- ---------------------------------------------------------------------
insert into users (id, display_name, email, age_confirmed_adult) values
  ('11111111-1111-4111-8111-000000000001', 'Frau Kessler (Demo)', 'demo.kessler@example.invalid', true),
  ('11111111-1111-4111-8111-000000000002', 'Jonas (Demo)', 'demo.jonas@example.invalid', true),
  ('22222222-2222-4222-8222-000000000001', 'Meike (Demo)', 'demo.meike@example.invalid', true),
  ('22222222-2222-4222-8222-000000000002', 'Tarek (Demo)', 'demo.tarek@example.invalid', true),
  ('22222222-2222-4222-8222-000000000003', 'Bettina (Demo)', 'demo.bettina@example.invalid', true),
  ('11111111-1111-4111-8111-000000000003', 'Herr Naumann (Demo)', 'demo.naumann@example.invalid', true),
  ('33333333-3333-4333-8333-000000000001', 'Herr Kessler (Demo)', 'demo.kessler.sohn@example.invalid', true),
  ('33333333-3333-4333-8333-000000000002', 'Frau Naumann (Demo)', 'demo.naumann.tochter@example.invalid', true),
  ('44444444-4444-4444-8444-000000000001', 'Prüfstelle A (Demo)', 'demo.pruefung.a@example.invalid', true),
  ('44444444-4444-4444-8444-000000000002', 'Verwaltung (Demo)', 'demo.verwaltung@example.invalid', true)
on conflict (id) do nothing;

insert into user_roles (user_id, role) values
  ('11111111-1111-4111-8111-000000000001', 'support_seeker'),
  ('11111111-1111-4111-8111-000000000002', 'support_seeker'),
  ('22222222-2222-4222-8222-000000000001', 'provider'),
  ('22222222-2222-4222-8222-000000000002', 'provider'),
  ('22222222-2222-4222-8222-000000000003', 'provider'),
  ('11111111-1111-4111-8111-000000000003', 'support_seeker'),
  ('33333333-3333-4333-8333-000000000001', 'trusted_person'),
  ('33333333-3333-4333-8333-000000000002', 'trusted_person'),
  ('44444444-4444-4444-8444-000000000001', 'reviewer'),
  ('44444444-4444-4444-8444-000000000002', 'admin')
on conflict do nothing;

insert into accessibility_preferences (user_id, ui_mode, font_scale, touch_target_size, read_aloud, easy_language, reduce_motion, extra_time_factor) values
  ('11111111-1111-4111-8111-000000000001', 'einfach', 1.40, 72, true, true, true, 2.00),
  ('11111111-1111-4111-8111-000000000002', 'individuell', 1.15, 56, false, false, false, 1.50)
on conflict (user_id) do nothing;

insert into support_seeker_profiles
  (user_id, postal_prefix, city, approx_lat, approx_lon, about_me, languages, communication_modes, shared_before_booking)
values
  ('11111111-1111-4111-8111-000000000001', '221', 'Hamburg', 53.55, 9.99,
   'Ich wohne seit vierzig Jahren in Hamburg und gehe gern spazieren.',
   array['Deutsch'], array['sprechen', 'leichte_sprache']::communication_mode[],
   array['displayName', 'region', 'communicationModes', 'languages']),
  ('11111111-1111-4111-8111-000000000002', '203', 'Hamburg', 53.57, 9.97,
   'Ich bin gehörlos und verständige mich in Gebärdensprache.',
   array['Deutsch', 'Deutsche Gebärdensprache'], array['dgs', 'schreiben']::communication_mode[],
   array['displayName', 'region', 'communicationModes'])
on conflict (user_id) do nothing;

insert into seeker_support_needs (user_id, support_needs, mobility_notes) values
  ('11111111-1111-4111-8111-000000000001',
   array['Ich brauche jemanden, der mit mir zu Terminen geht.'],
   'Ich benutze einen Rollator. Treppen gehen nicht.')
on conflict (user_id) do nothing;

insert into seeker_contact_details (user_id, phone, street, house_number, postal_code, city) values
  ('11111111-1111-4111-8111-000000000001', '+49 40 000000 (Demo)', 'Beispielweg', '12', '22111', 'Hamburg')
on conflict (user_id) do nothing;

insert into provider_profiles
  (user_id, postal_prefix, city, approx_lat, approx_lon, radius_km, headline, about_me,
   explicitly_not_offered, languages, communication_modes, sign_language_level,
   accessibility_skills, volunteer, hourly_rate_cents, cancellation_policy, has_mobility, published)
values
  ('22222222-2222-4222-8222-000000000001', '221', 'Hamburg', 53.56, 9.98, 15,
   'Heilerziehungspflegerin, begleitet zu Terminen und im Alltag',
   'Ich arbeite seit zwölf Jahren in der Eingliederungshilfe. Mir ist wichtig, dass wir vorher besprechen, wie Sie es gern hätten. Ich rede nicht über Sie, sondern mit Ihnen.',
   array['Keine Wohnungsreinigung', 'Keine Fahrten mit dem eigenen Auto'],
   array['Deutsch', 'Englisch'], array['sprechen', 'schreiben', 'leichte_sprache']::communication_mode[],
   'basic', array['Rollator', 'Rollstuhl', 'Leichte Sprache', 'Demenz'],
   false, 2800, 'Bis 24 Stunden vorher kostenlos. Danach die Hälfte.', true, true),
  ('22222222-2222-4222-8222-000000000002', '203', 'Hamburg', 53.57, 9.96, 10,
   'Alltagsbegleiter, gebärdensprachkompetent',
   'Ich bin in einer gehörlosen Familie aufgewachsen. Beim Einkaufen und bei Behördengängen bin ich in Ruhe dabei und dolmetsche nicht, sondern begleite.',
   array['Keine pflegerischen Tätigkeiten', 'Kein Dolmetschen bei Gericht'],
   array['Deutsch', 'Deutsche Gebärdensprache'], array['dgs', 'schreiben', 'sprechen']::communication_mode[],
   'native', array['Gebärdensprache', 'Gehörlosigkeit', 'Behördengänge'],
   false, 2200, 'Bis 24 Stunden vorher kostenlos.', false, true),
  ('22222222-2222-4222-8222-000000000003', '221', 'Hamburg', 53.54, 10.01, 8,
   'Nachbarschaftshilfe, ehrenamtlich',
   'Ich bin seit einem Jahr in Rente und habe zwei Vormittage in der Woche Zeit. Spazierengehen, Vorlesen, ein Schwatz bei Kaffee.',
   array['Keine pflegerischen Tätigkeiten', 'Kein Heben und Tragen'],
   array['Deutsch'], array['sprechen', 'leichte_sprache']::communication_mode[],
   'none', array['Leichte Sprache', 'Geduld bei langsamer Sprache'],
   true, null, 'Absage jederzeit möglich, kostenlos.', false, true)
on conflict (user_id) do nothing;

insert into provider_services (provider_id, category_key, experience_years) values
  ('22222222-2222-4222-8222-000000000001', 'begleitung_termine', 12),
  ('22222222-2222-4222-8222-000000000001', 'einkaufen', 8),
  ('22222222-2222-4222-8222-000000000001', 'freizeit_teilhabe', 10),
  ('22222222-2222-4222-8222-000000000001', 'pflegerische_unterstuetzung', 12),
  ('22222222-2222-4222-8222-000000000002', 'begleitung_termine', 5),
  ('22222222-2222-4222-8222-000000000002', 'einkaufen', 5),
  ('22222222-2222-4222-8222-000000000002', 'kommunikation', 6),
  ('22222222-2222-4222-8222-000000000003', 'spaziergang', 1),
  ('22222222-2222-4222-8222-000000000003', 'vorlesen', 1),
  ('22222222-2222-4222-8222-000000000003', 'begleitung_termine', 1)
on conflict do nothing;

-- Identitaet und Fachqualifikationen. Die Fachqualifikation traegt eine
-- zweite Freigabe -- ohne sie greift der Trigger aus 0002_functions.sql.
insert into provider_verifications
  (provider_id, qualification_key, status, decided_by, second_approver_id, valid_until)
values
  ('22222222-2222-4222-8222-000000000001', 'identitaet', 'approved', '44444444-4444-4444-8444-000000000001', null, null),
  ('22222222-2222-4222-8222-000000000001', 'heilerziehungspflege', 'approved', '44444444-4444-4444-8444-000000000001', '44444444-4444-4444-8444-000000000002', null),
  ('22222222-2222-4222-8222-000000000002', 'identitaet', 'approved', '44444444-4444-4444-8444-000000000001', null, null),
  ('22222222-2222-4222-8222-000000000002', 'dgs_kompetenz', 'approved', '44444444-4444-4444-8444-000000000001', null, null),
  ('22222222-2222-4222-8222-000000000002', 'alltagsbegleitung_43b', 'approved', '44444444-4444-4444-8444-000000000001', null, null),
  ('22222222-2222-4222-8222-000000000003', 'identitaet', 'approved', '44444444-4444-4444-8444-000000000001', null, null),
  -- Laeuft demnaechst ab: zeigt im Adminbereich die Erinnerung.
  ('22222222-2222-4222-8222-000000000003', 'erste_hilfe', 'approved', '44444444-4444-4444-8444-000000000001', null, current_date + 18)
on conflict do nothing;

insert into provider_verifications (provider_id, qualification_key, status) values
  ('22222222-2222-4222-8222-000000000003', 'fuehrungszeugnis_erweitert', 'pending')
on conflict do nothing;

-- Verfuegbarkeiten
insert into availability_slots (provider_id, weekday, start_minute, end_minute, recurring)
select '22222222-2222-4222-8222-000000000001', d, 480, 960, true from generate_series(1, 5) d;

insert into availability_slots (provider_id, weekday, start_minute, end_minute, recurring)
select '22222222-2222-4222-8222-000000000002', d, 540, 1080, true from unnest(array[1, 3, 5]) d;

insert into availability_slots (provider_id, weekday, start_minute, end_minute, recurring)
select '22222222-2222-4222-8222-000000000003', d, 540, 720, true from unnest(array[2, 4]) d;

insert into absence_periods (provider_id, from_date, to_date, reason) values
  ('22222222-2222-4222-8222-000000000001', current_date + 30, current_date + 44, 'Urlaub');

-- Einwilligungen
insert into consents (user_id, purpose, granted, policy_version, granted_at, channel)
select u, p, true, '2026-01-01', now(), 'tap'
from unnest(array[
  '11111111-1111-4111-8111-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000002'::uuid
]) u
cross join unnest(array['terms', 'privacy', 'sensitive_support_needs', 'location_coarse']::consent_purpose[]) p;

insert into consents (user_id, purpose, granted, policy_version, granted_at, channel) values
  ('11111111-1111-4111-8111-000000000001', 'contact_release', true, '2026-01-01', now(), 'tap');

insert into consents (user_id, purpose, granted, policy_version, granted_at, channel)
select u, p, true, '2026-01-01', now(), 'tap'
from unnest(array[
  '22222222-2222-4222-8222-000000000001'::uuid,
  '22222222-2222-4222-8222-000000000002'::uuid,
  '22222222-2222-4222-8222-000000000003'::uuid
]) u
cross join unnest(array['terms', 'privacy']::consent_purpose[]) p;

-- Begleitung: hilft beim Bedienen, entscheidet nichts.
insert into trusted_access_grants
  (seeker_id, trusted_person_id, scopes, responsibility_level, legal_basis_note)
values
  ('11111111-1111-4111-8111-000000000001', '33333333-3333-4333-8333-000000000001',
   array['view_profile', 'create_requests', 'read_messages']::trusted_scope[],
   'begleitung',
   'Auf ausdrücklichen Wunsch von Frau Kessler. Keine gesetzliche Betreuung.');

-- Verantwortung: gibt Termine und Zahlungen frei -- auf eigenen Wunsch der
-- Person. Sie kann das jederzeit allein wieder beenden.
insert into trusted_access_grants
  (seeker_id, trusted_person_id, scopes, responsibility_level, approval_required,
   approval_legal_basis, legal_basis_note)
values
  ('11111111-1111-4111-8111-000000000003', '33333333-3333-4333-8333-000000000002',
   array['view_profile', 'create_requests', 'read_messages', 'confirm_bookings']::trusted_scope[],
   'verantwortung',
   array['booking', 'payment']::approval_kind[],
   'client_wish',
   'Herr Naumann hat seine Tochter selbst darum gebeten. Keine gesetzliche Betreuung, kein Einwilligungsvorbehalt.');

insert into support_seeker_profiles
  (user_id, postal_prefix, city, approx_lat, approx_lon, about_me, languages,
   communication_modes, shared_before_booking)
values
  ('11111111-1111-4111-8111-000000000003', '221', 'Hamburg', 53.55, 10.00,
   'Ich bin 81 und war früher Tischler.',
   array['Deutsch'], array['sprechen', 'leichte_sprache']::communication_mode[],
   array['displayName', 'region', 'communicationModes'])
on conflict (user_id) do nothing;

insert into consents (user_id, purpose, granted, policy_version, granted_at, channel)
select '11111111-1111-4111-8111-000000000003'::uuid, p, true, '2026-01-01', now(), 'tap'
from unnest(array['terms', 'privacy', 'location_coarse', 'contact_release']::consent_purpose[]) p;
