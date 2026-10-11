# Sicherheit und Datenschutz

Stand: siehe PROJECT_STATUS.md. Dieses Dokument beschreibt implementierte Maßnahmen und
offene Punkte. Es ist **keine** Bestätigung einer Rechtskonformität oder Zertifizierung.

## Implementiert

**Authentifizierung**
- Passwörter: scrypt (N=2^15, r=8, p=1), Salt je Passwort, NFKC-Normalisierung.
- Sitzungen serverseitig; Cookie enthält nur ein 256-Bit-Zufallstoken, in der DB der SHA-256-Hash.
  Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in Produktion. Ablauf konfigurierbar.
- Sperre nach 8 Fehlversuchen für 15 Minuten; identische Fehlermeldung für unbekannte
  Adresse und falsches Passwort; konstante Laufzeit auch ohne hinterlegtes Passwort.
- Rate-Limit auf Login und Passwort-Reset (je IP und je Adresse).
- Passwort-Reset: einmaliger Token (Hash gespeichert), 60 Minuten, invalidiert alle Sitzungen.
- Passwortwechsel beendet alle anderen Sitzungen (`sessions_invalid_before`).
- Sensible Admin-Aktionen (Rollen ändern, Sperren, Rechte) verlangen eine
  Passwortbestätigung innerhalb der letzten 15 Minuten.
- Einladungen: Token-Hash, 7 Tage, einmalig.

**Autorisierung**
- Rollen mit Berechtigungskatalog (`src/server/auth/permissions.ts`), mandantenspezifische
  Overrides. Prüfung ausschließlich serverseitig in den Services.
- Portalrollen (Mitarbeiter, Kunde, Partner) sind an einen Fachdatensatz gebunden und sehen
  nur freigegebene Daten.
- API-Schlüssel mit eingeschränkten Scopes (nie mehr als der Ersteller), nur Hash gespeichert,
  Widerruf und Rotation mit Übergangsfrist.

**Mandantentrennung**
- `tenant_id` auf allen Geschäftstabellen, Row-Level Security mit `FORCE`, Anwendungsrolle
  ohne `BYPASSRLS`. Automatisierte Tests versuchen mandantenübergreifende Lese-, Schreib-,
  Update- und Löschzugriffe (`tests/integration/tenant-isolation.test.ts`).

**Eingaben und Ausgaben**
- Validierung aller Eingaben mit zod (Formulare und API).
- SQL ausschließlich parametrisiert (Drizzle).
- React escaped Ausgaben; keine `dangerouslySetInnerHTML`.
- Sicherheits-Header (nosniff, frame-deny, Referrer-Policy, Permissions-Policy).
- Server Actions sind durch Next.js gegen CSRF geschützt (Origin-Prüfung); die REST-API
  nutzt Bearer-Schlüssel statt Cookies für externe Clients.

**Geheimnisse und Protokolle**
- Gespeicherte Geheimnisse (Webhook-Secrets) mit AES-256-GCM, Schlüssel aus `APP_ENCRYPTION_KEY`.
- Logger maskiert Passwörter, Token, Authorization-Header, Cookies.
- Audit-Log entfernt Hash-/Secret-Felder vor dem Speichern.
- `.env` ist git-ignoriert; `.env.example` enthält nur Platzhalter.

## Geplant / offen

- Uploads: Prüfung von MIME-Typ, Größe, Magic Bytes; Virenscan-Hook (Phase 3).
- Webhooks: SSRF-Schutz gegen private Netze, Signatur und Replay-Schutz (Phase 4).
- KI: Prompt-Injection-Schutz durch strikte Trennung von Daten und Anweisungen,
  Schema-Validierung, Kostenbudget (Phase 5).
- Content-Security-Policy mit Nonces (derzeit nicht gesetzt, da Next-Dev-Tooling inline
  Skripte nutzt; für Produktion vorgesehen).
- Verteiltes Rate-Limiting bei mehreren Instanzen.
- Backup/Restore-Prozess ist dokumentiert, aber nicht automatisiert.
- Externe Sicherheitsprüfung (Penetrationstest) vor einem SaaS-Start.

## Datenschutz (Privacy by Design)

- Datensparsamkeit: Mitarbeiterprofil enthält nur dispositionsrelevante Felder.
- Aufbewahrung: Mandanten konfigurieren Fristen (deaktivierte Mitarbeiter, Protokolle);
  ein Worker-Job markiert fällige Datensätze (Löschliste), Löschung erfolgt bestätigt.
- Audit-Logs speichern keine Passwörter/Token; personenbezogene Vorher/Nachher-Werte
  unterliegen derselben Aufbewahrungsfrist.
- Synthetische Testdaten; keine echten Personendaten in Fixtures.

Offene Fragen für die rechtliche Prüfung: Auftragsverarbeitungsvertrag je Mandant,
Hosting-Standort, Einwilligungen für Messaging-Kanäle, Löschkonzept für Backups.

## Meldung von Sicherheitslücken

Bitte an die im Impressum des Betreibers genannte Adresse; nicht als öffentliches Issue.
