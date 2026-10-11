# Sicherheit und Datenschutz

Stand: 2026-10-11 (Phase 7). Dieses Dokument beschreibt implementierte Maßnahmen, die
Prüfung in Phase 7 und offene Punkte. Es ist **keine** Bestätigung einer Rechtskonformität,
Zertifizierung oder abschließenden DSGVO-Konformität. Warnhinweise der Software (z. B.
Ruhezeit, Schichtdauer, ablaufende Nachweise) sind fachliche Hinweise, keine Rechtsprüfung.

## Implementiert

**Authentifizierung**
- Passwörter: scrypt (N=2^15, r=8, p=1), Salt je Passwort, NFKC-Normalisierung.
- Sitzungen serverseitig; Cookie enthält nur ein 256-Bit-Zufallstoken, in der DB der SHA-256-Hash.
  Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in Produktion (`SESSION_COOKIE_SECURE`). Ablauf konfigurierbar.
- Sperre nach 8 Fehlversuchen für 15 Minuten; identische Fehlermeldung für unbekannte
  Adresse und falsches Passwort; konstante Laufzeit auch ohne hinterlegtes Passwort.
- Rate-Limit auf Login und Passwort-Reset (je IP und je Adresse) sowie auf die REST-API.
- Passwort-Reset: einmaliger Token (Hash gespeichert), 60 Minuten, invalidiert alle Sitzungen.
- Passwortwechsel beendet alle anderen Sitzungen (`sessions_invalid_before`).
- Sensible Admin-Aktionen (Rollen ändern, Sperren, Rechte, API-Schlüssel) verlangen eine
  Passwortbestätigung innerhalb der letzten 15 Minuten.
- Einladungen: Token-Hash, 7 Tage, einmalig; Portalrollen nur mit Fachbindung.

**Autorisierung**
- Rollen mit Berechtigungskatalog (`src/server/auth/permissions.ts`), mandantenspezifische
  Overrides. Prüfung ausschließlich serverseitig in den Services (`requirePermission`), nie nur
  in der UI. Portalrollen (Mitarbeiter, Kunde, Partner) sind an einen Fachdatensatz gebunden
  und sehen nur freigegebene Daten (`*_own`-Rechte).
- API-Schlüssel mit Scopes (nie mehr als der Ersteller), nur Hash gespeichert, Ablaufdatum,
  Widerruf und Rotation mit Übergangsfrist; zuletzt-benutzt wird protokolliert.

**Mandantentrennung**
- `tenant_id` auf allen Geschäftstabellen, Row-Level Security mit `FORCE` auf 44 Tabellen,
  Anwendungsrolle `disporex_app` ohne `BYPASSRLS`. Jede Transaktion setzt `app.tenant_id`
  (`withTenant`) oder – nur für Login/Worker – `app.bypass_rls` (`withSystem`).
- Tests versuchen mandantenübergreifende Lese-, Schreib-, Update- und Löschzugriffe über
  Services, API und direkt per SQL (`tests/integration/tenant-isolation.test.ts`,
  `api.test.ts` Szenario 11).

**Eingaben, Ausgaben, Transport**
- Validierung aller Eingaben mit zod (Formulare und API); typisierte Fehler ohne Stacktraces
  nach außen; jede Antwort trägt eine `X-Request-Id`.
- SQL ausschließlich parametrisiert (Drizzle); dynamische Listen über `inArray`/`sql.join`.
- React escaped Ausgaben; kein `dangerouslySetInnerHTML`; eingehende HTML-Mails werden zu Text.
- Header: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`; im Produktionsbuild zusätzlich `Content-Security-Policy`
  (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`)
  und `Strict-Transport-Security`.
- Server Actions sind durch Next.js gegen CSRF geschützt (Origin-Prüfung); die REST-API nutzt
  Bearer-Schlüssel statt Cookies für externe Clients.

**Uploads und Dokumente**
- Zulässige Typen über Allowlist, Größenlimit 20 MB, Magic-Bytes-Prüfung gegen den
  deklarierten Typ, Dateinamen werden neutralisiert (UUID-Speichername).
- Vertraulichkeitsstufen mit rollenabhängigem Zugriff; Download nur über einmalige, zeitlich
  begrenzte Token (`/api/documents/[token]`), jeder Abruf protokolliert.
- Speicher lokal (außerhalb des Web-Roots) oder S3 (SigV4, Secrets nur aus der Umgebung).

**Webhooks und Integrationen**
- Ausgehende Webhooks: HMAC-SHA256-Signatur mit Zeitstempel (`t=…,v1=…`), Replay-Fenster
  5 Minuten, Wiederholung mit Backoff, Deaktivierung nach 50 Folgefehlern, 10 s Timeout.
- SSRF-Schutz: nur `https` (http nur `localhost` in Entwicklung), DNS-Auflösung vor dem
  Versand, private/Link-local/Loopback/Metadaten-Adressbereiche (IPv4 und IPv6) abgewiesen.
- Eingehende E-Mail (Webhook/IMAP): Deduplizierung über Message-ID, Anhänge laufen durch die
  Upload-Prüfung, Inhalte werden nie als Anweisung interpretiert.
- KI: Eingaben werden als gekennzeichnete Daten übergeben (Prompt-Injection-Regeln im
  Systemprompt), Ausgaben schema-validiert und fachlich plausibilisiert; KI schreibt nie
  direkt in Fachdaten, versendet nie E-Mails; Token-Budget je Mandant; jeder Aufruf
  protokolliert (Tokens, Kosten, Dauer, Ergebnisstatus).

**Geheimnisse und Protokolle**
- Gespeicherte Geheimnisse (Webhook-Secrets) mit AES-256-GCM, Schlüssel aus `APP_ENCRYPTION_KEY`
  (in Produktion Pflicht, ≥ 32 Zeichen).
- Logger maskiert Passwörter, Token, Authorization-Header, Cookies, API-Schlüssel.
- Audit-Log entfernt Hash-/Secret-Felder vor dem Speichern (`scrubForAudit`).
- `.env` ist git-ignoriert und per `.dockerignore` vom Image ausgeschlossen; `.env.example`
  enthält nur Platzhalter. CI verwendet einen offensichtlichen Nicht-Produktionsschlüssel.
- Fehlerüberwachung sendet Fehlerklasse, Stack und IDs, keine Personendaten.

**Abhängigkeiten**
- `pnpm audit --prod` (2026-10-11): keine bekannten Schwachstellen. Eine transitive `uuid`-
  Version unter `exceljs` wurde per `pnpm.overrides` auf 11.1.1 angehoben (GHSA-w5hq-g745-h8pq);
  der XLSX-Parser-Test deckt die Kompatibilität ab. Versionen sind exakt gepinnt (Lockfile).

## Sicherheitsprüfung Phase 7 (Eigenprüfung, kein externer Test)

Geprüft anhand von Code-Durchsicht und den automatisierten Tests:

| Bereich | Ergebnis |
| ------- | -------- |
| Mandantentrennung über Services, API und SQL | bestätigt durch Tests; RLS-Policies auf allen 44 Geschäftstabellen |
| Berechtigungen in jedem Service-Einstieg | stichprobenartig alle Module geprüft; Portalrollen auf `_own`-Pfade beschränkt |
| API ohne/mit falschem/abgelaufenem Schlüssel | 401/403 getestet (Szenario 12) |
| Idempotenz und Rate-Limit der API | getestet (422 bei abweichendem Body, 429 mit `Retry-After`) |
| Upload-Typprüfung | Magic Bytes vs. MIME getestet (E2E) |
| Webhook-Signatur, Replay, SSRF | getestet (Worker-Tests) |
| Reset/Seed in Produktion | gesperrt; Seed überschreibt nie bestehende Daten |
| Secrets im Repository | keine (`.env` fehlt im Repo, Docker-Image ohne `.env`) |

## Offen / bewusst noch nicht umgesetzt

- **CSP ohne `'unsafe-inline'`** für Skripte: erfordert Nonce-Weitergabe über einen Proxy;
  derzeit nicht eingerichtet. Inline-Skripte stammen von Next selbst.
- **Verteiltes Rate-Limiting**: Zähler sind prozesslokal; bei mehreren Web-Instanzen greift
  das Limit je Instanz (Schnittstelle in `core/rate-limit.ts` austauschbar).
- **Virenscan** für Uploads: Hook-Punkt vorhanden (`documents/service.ts`), kein Scanner angebunden.
- **PDF-Textextraktion** für die KI-Zusammenfassung: nur Textformate; PDFs werden nicht gelesen.
- **Backups** sind dokumentiert (`docs/BACKUP_RESTORE.md`), aber nicht automatisiert.
- **Externe Sicherheitsprüfung** (Penetrationstest) und Datenschutz-Folgenabschätzung vor
  einem SaaS-Start.
- **2-Faktor-Authentifizierung**: nicht umgesetzt (Passwort-Login mit Sperre/Rate-Limit).
- Abhängigkeiten regelmäßig aktualisieren (`pnpm outdated`, `pnpm audit`), z. B. per Dependabot.

## Datenschutz (Privacy by Design)

- Datensparsamkeit: Mitarbeiterprofil enthält nur dispositionsrelevante Felder; Notizen sind
  getrennt und zugriffsbeschränkt; Buchhaltung sieht keine vertraulichen Personalunterlagen.
- Aufbewahrung: Mandanten konfigurieren Fristen (deaktivierte Mitarbeiter, Protokolle);
  ein Worker-Job markiert fällige Datensätze, Löschung erfolgt bestätigt durch eine Person.
  Audit-Einträge unterliegen derselben Frist, damit die Historie keine Löschung aushebelt.
- Audit-Logs speichern keine Passwörter/Token; KI-Protokolle speichern Metadaten, nicht den
  vollständigen Eingabetext.
- Synthetische Testdaten (`pnpm db:seed`, Tests); keine echten Personendaten in Fixtures.
- Dokumente nur über Token-Links; keine öffentlichen Dateipfade.

Offene Fragen für die rechtliche Prüfung: Auftragsverarbeitungsvertrag je Mandant,
Hosting-Standort, Rechtsgrundlage und Einwilligungen für Messaging-Kanäle, Löschkonzept für
Backups, Umgang mit Zeitnachweisen (Arbeitszeitgesetz) und Aufbewahrungsfristen der Abrechnung.

## Meldung von Sicherheitslücken

Bitte an die im Impressum des Betreibers genannte Adresse; nicht als öffentliches Issue.
