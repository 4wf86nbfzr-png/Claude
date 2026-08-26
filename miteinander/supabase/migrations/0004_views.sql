-- =====================================================================
-- Sichten
--
-- Sie sind die einzige Stelle, an der Daten personenuebergreifend
-- zusammengefuehrt werden -- und zwar bewusst reduziert.
-- =====================================================================

-- Oeffentliche Sicht auf ein Anbieterprofil.
-- Fachliche Titel und Gebaerdensprach-Stufe erscheinen nur mit Nachweis.
create or replace view public_provider_profiles
with (security_invoker = true)
as
select
  p.user_id,
  u.display_name,
  p.kind,
  p.postal_prefix,
  p.city,
  p.approx_lat,
  p.approx_lon,
  p.radius_km,
  p.headline,
  p.about_me,
  p.explicitly_not_offered,
  p.languages,
  p.communication_modes,
  -- Ohne Nachweis wird keine Stufe angezeigt.
  case when p.sign_language_verified then p.sign_language_level else null end as sign_language_level,
  (not p.sign_language_verified and p.sign_language_level <> 'none') as sign_language_claim_unverified,
  p.accessibility_skills,
  p.photo_path,
  p.photo_alt_text,
  p.intro_video_path,
  p.volunteer,
  p.hourly_rate_cents,
  p.cancellation_policy,
  p.has_mobility
from provider_profiles p
join users u on u.id = p.user_id
where p.published and u.deleted_at is null and u.suspended_at is null;

-- Geprüfte Nachweise im Klartext -- ohne Dokumentpfade.
create or replace view public_provider_verifications
with (security_invoker = true)
as
select
  pv.provider_id,
  q.label as qualification_label,
  pv.status,
  pv.valid_until
from provider_verifications pv
join qualifications q on q.key = pv.qualification_key
where pv.status = 'approved'
  and (pv.valid_until is null or pv.valid_until >= current_date);

-- Oeffentliche Bewertungen. Die private Rueckmeldung ist bewusst nicht
-- Teil dieser Sicht.
create or replace view public_reviews
with (security_invoker = true)
as
select
  r.id,
  r.subject_id,
  r.rating,
  r.public_comment,
  r.created_at
from reviews r
where r.public_comment is not null;

-- Kennzahlen fuer das Admin-Dashboard.
create or replace view admin_dashboard_counters
with (security_invoker = true)
as
select
  (select count(*) from provider_verifications where status = 'pending') as offene_pruefungen,
  (select count(*) from provider_verifications
     where status = 'approved' and valid_until between current_date and current_date + 30) as ablaufende_nachweise,
  (select count(*) from incidents where status in ('new', 'triaged', 'in_progress')) as offene_vorfaelle,
  (select count(*) from incidents where status = 'new' and priority = 'critical') as kritische_vorfaelle,
  (select count(*) from bookings where status = 'confirmed' and starts_at > now()) as anstehende_termine,
  (select count(*) from support_requests where status = 'open') as offene_anfragen,
  (select count(*) from dgs_content where status = 'approved') as dgs_geprueft,
  (select count(*) from dgs_content) as dgs_gesamt,
  (select count(*) from easy_language_content where status = 'approved') as leichte_sprache_geprueft,
  (select count(*) from easy_language_content) as leichte_sprache_gesamt;
