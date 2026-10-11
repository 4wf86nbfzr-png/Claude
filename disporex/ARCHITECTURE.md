# Architektur

## Leitentscheidungen

1. **Ein modulares Backend statt Microservices.** Eine Next.js-Anwendung liefert UI und
   REST-API; die Geschäftslogik liegt in `src/server/modules/*` und ist unabhängig von
   HTTP (Server Actions und Route Handler rufen dieselben Services). Ein separater
   Worker-Prozess (`src/worker.ts`) verarbeitet Hintergrundjobs. Beide Prozesse teilen
   Code und Datenbank.
2. **Eine zentrale relationale Datenbank (PostgreSQL)** mit Fremdschlüsseln, Constraints,
   Enums und Indizes. Zusammengehörige Änderungen laufen in Transaktionen.
3. **Mandantentrennung auf zwei Ebenen.** Jede Geschäftstabelle trägt `tenant_id`.
   Die Anwendung filtert serverseitig über den `AuthContext`; zusätzlich erzwingt die
   Datenbank Row-Level Security: jede Transaktion setzt `app.tenant_id`, und die
   Anwendungsrolle `disporex_app` (NOBYPASSRLS) kann physisch keine fremden Zeilen
   lesen oder schreiben. Systemprozesse (Login, Worker) setzen `app.bypass_rls`.
4. **Keine fremden Auth-Frameworks.** Sitzungen liegen in der Datenbank (nur Hash im
   Cookie), Passwörter mit scrypt. Das hält die Angriffsfläche klein und ist vollständig
   testbar.
5. **Ereignisgetrieben über eine Outbox.** Fachliche Ereignisse werden als `domain_events`
   in derselben Transaktion geschrieben; der Worker leitet sie an Webhooks,
   Automatisierungen und Benachrichtigungen weiter. Externe Systeme können die
   Disposition damit nie blockieren.
6. **Austauschbare Integrationen.** Mail, Speicher, KI und Messaging sind Schnittstellen mit
   mehreren Implementierungen (z. B. `log`-Mailer ohne SMTP, `none`-KI-Anbieter).

## Schichten

```
Request ─▶ Route Handler (src/app/api/v1/…)  ─┐
           Server Action (src/app/**/actions) ─┼─▶ Service (src/server/modules/<modul>/service.ts)
           Worker-Handler (src/server/jobs)   ─┘        │  prüft Berechtigungen (AuthContext)
                                                        │  validiert (zod)
                                                        ▼
                                              withTenant(tenantId, tx => …)   Drizzle + RLS
                                                        │
                                                        ├─ audit(tx, …)        Protokoll
                                                        └─ emitEvent(tx, …)    Outbox
```

Regeln:
- Services erhalten immer einen `AuthContext` und rufen `requirePermission`.
- Datenzugriff nur innerhalb `withTenant`/`withSystem`; außerhalb liefert die DB nichts.
- Fehler sind typisierte `AppError`s; die API bildet sie auf `{ error: { code, message } , requestId }` ab.

## Datenmodell (Kern)

```
tenants ─┬─ memberships ─ users          (global: users, sessions, password_resets)
         ├─ employees ─ employee_qualifications ─ qualifications
         │            └─ availabilities, employee_notes
         ├─ customers ─ customer_contacts, locations
         ├─ customer_requests  (unverbindlich)
         ├─ orders             (verbindlich)        ─┐
         ├─ events ─ positions ─ shifts ─ shift_status_history
         ├─ partners ─ partner_contacts, partner_offers (→ positions)
         ├─ time_imports ─ time_records ─ reconciliation_items ─ time_corrections
         ├─ documents ─ document_access_tokens
         ├─ notifications, notification_preferences
         ├─ domain_events, jobs, webhook_endpoints, webhook_deliveries
         ├─ automation_rules, automation_runs, ai_requests, inbound_emails
         ├─ rate_cards, surcharge_rules, billing_items
         └─ api_keys, audit_logs, idempotency_keys, role_permission_overrides
```

Fachliche Trennung: **Anfrage** (customer_requests) → **Auftrag** (orders) →
**Veranstaltung** (events) mit **Positionen** (Bedarf) → **Schichten** (konkrete
Einsätze einzelner Personen). Statusübergänge sind in den Services definiert und
werden historisiert.

## Hintergrundjobs

Tabelle `jobs` mit `FOR UPDATE SKIP LOCKED`, Backoff (15 s · 2^n, max. 1 h),
`max_attempts`, Status `dead` als Dead-Letter, `dedupe_key` gegen doppelte Einplanung
kritischer Aktionen. Der Worker (`pnpm worker`) pollt in konfigurierbarem Intervall und
führt zusätzlich periodische Aufgaben aus (Fristen, Erinnerungen, Aufbewahrung).

## Ordnerkonvention je Modul

```
src/server/modules/<modul>/
  schema.ts     zod-Schemas (Eingaben, API)
  service.ts    Geschäftslogik, Berechtigungen, Transaktionen
  (queries.ts)  komplexe Leseabfragen
```

## Entscheidungen, die bewusst verschoben wurden

- Horizontale Skalierung: Rate-Limiter ist prozesslokal; für mehrere Instanzen durch
  einen gemeinsamen Speicher ersetzen (Schnittstelle in `core/rate-limit.ts`).
- Volltextsuche: ILIKE + Indizes reichen für die Zielgröße; `pg_trgm` wäre der nächste Schritt.
