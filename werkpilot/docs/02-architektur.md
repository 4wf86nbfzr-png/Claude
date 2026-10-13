# Architektur

## Grundentscheidungen

| Entscheidung | Wahl | Grund |
|---|---|---|
| Form | Modularer Monolith (ein Backend-Paket, ein Worker-Prozess) | Keine Microservices ohne Not; Trennung erst bei konkretem Bedarf |
| Backend | FastAPI + SQLAlchemy 2 (async) + Alembic + PostgreSQL | Typsicher, schnell, verbreitet |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind 4 | Statische Website + Client-Dashboard, Proxy zu `/api` für Same-Origin-Cookies |
| Jobs | DB-gestützte Warteschlange (`jobs`-Tabelle) statt Celery/arq | Keine zusätzliche Infrastruktur, in Tests vollständig prüfbar, Redis optional |
| Scheduler | Intervall-Tabelle (`schedule_state`) im Worker | Robust gegen Neustarts, keine Cron-Abhängigkeit |
| KI | Eigenes Gateway mit austauschbaren Anbietern | Strukturierte Ausgaben, Budgets, Schutz gegen Prompt-Injection an einer Stelle |
| Zahlungen | Stripe Checkout + Customer Portal + Webhooks | Keine Kartendaten im System, Kündigung/Rechnungen durch Stripe |
| Auth | Argon2id, JWT-Access-Token (30 min), Refresh-Sitzung in DB (httpOnly-Cookie, rotierend) | Widerrufbar, kein Stateless-Refresh |
| Mandantentrennung | `tenant_id` an jeder Fachtabelle, Zugriff immer über geprüfte Mitgliedschaft | Kein Zugriff ohne serverseitige Prüfung |

## Datenmodell (Kurzfassung)

- **core**: `tenants`, `users`, `memberships` (owner/admin/member), `invitations`, `one_time_tokens`, `refresh_sessions`, `audit_logs`, `system_settings`
- **billing**: `plans` (Preise/Limits/Features als Daten), `subscriptions`, `invoices`, `webhook_events` (Idempotenz), `ai_usage` (jeder KI-Aufruf), `expense_entries`
- **crm**: `customers`, `inquiries`, `messages`, `drafts`, `appointments`, `quotes`, `reports`
- **ops**: `integrations` (Zugangsdaten Fernet-verschlüsselt), `jobs`, `schedule_state`, `agent_runs`, `agent_tasks`, `approvals`, `error_reports`, `support_tickets`, `support_messages`, `knowledge_articles`, `content_pieces`, `keywords`, `leads`, `outbound_emails`

## Anfrage-Pipeline

```
Eingang (Formular-Webhook | Inbound-Mail-Webhook | manuell)
  → create_inquiry(): Dublettenprüfung, Kunde anlegen, Audit, Job "process_inquiry"
  → process_inquiry():
      Abo/Testphase prüfen → ohne Abo: needs_review, keine KI
      classify (LLM, Schema Classification) → Kategorie, Priorität, Zusammenfassung, fehlende Angaben
      Spam → Status spam, Ende
      Terminvorschläge (nur Kategorien mit Vor-Ort-Bedarf, Feature "appointments")
      draft_reply (LLM, Schema ReplyDraft)
      Prüfflags: Preis/Diagnose im Entwurf, needs_human, geringe Sicherheit, Injection, Mock-Anbieter
      Draft(pending) → Status needs_review
      Auto-Versand nur wenn: Feature "automations" + Einstellung aktiv + keine Flags + Absender-E-Mail
  → approve (Nutzer) / auto → send_draft(): E-Mail, Message(out), Terminvorschläge als "proposed" blocken
```

## LLM-Gateway (`services/llm.py`)

1. Not-Aus prüfen → `KillSwitchActive`
2. Globales Tagesbudget, Mandanten-Monatsbudget, Testphasen-Kontingent → `BudgetExceeded`
3. Systemprompt mit Sicherheitsregeln + JSON-Schema; Kundentext in `<<<KUNDENTEXT_BEGINN/ENDE>>>`
4. Anbieteraufruf mit Timeout; Antwort gegen Pydantic-Schema validiert → `InvalidLLMOutput`
5. Jeder Aufruf in `ai_usage` mit Tokens, Kosten (Microcent), Latenz, Erfolg

Anbieter: `AnthropicProvider`, `OpenAIProvider`, `MockProvider` (regelbasiert, für Tests/Demo,
im Dashboard als „regelbasiert“ sichtbar). Preise je Modell in `PRICING_MICROCENTS_PER_TOKEN`
(Richtwerte; mit aktueller Preisliste abgleichen).

## Agenten (`agents/`)

Alle erben von `BaseAgent`: Laufzeitlimit (`asyncio.wait_for`), Kostenlimit je Lauf, Protokoll
in `agent_runs`, Aufgaben in `agent_tasks`, Freigaben in `approvals`. Nur `ops` läuft bei Not-Aus.

| Agent | Takt | Aufgabe | Darf allein |
|---|---|---|---|
| ops | 15 min | Systemprüfung, hängende Jobs lösen, Kosten, Backups, Mails, Tagesbericht, Alarm | Not-Aus auslösen bei Kostenanomalie |
| director | 24 h | Kennzahlen, Priorisierung, Aufgaben an andere Agenten, Lernnotizen, Wochenlage | Aufgaben erzeugen |
| product_dev | 12 h | Fehler triagieren, Testsuite ausführen, Vorschläge; sensible Bereiche → Freigabe | Analysen, Testläufe |
| support | 10 min | Tickets aus Wissensbasis beantworten, Unklares eskalieren | Antworten bei Sicherheit |
| marketing | 24 h | Keywords, max. 1 Entwurf/Tag, 4 Prüfungen, Veröffentlichungsplan | Entwürfe; Veröffentlichung nur nach Freigabe + Flag |
| sales | 6 h | Leads aus zulässigen Quellen qualifizieren, Antwort-Mail, Testphasen-Erinnerung | Antworten auf eigene Anfragen |
| finance | 24 h | MRR, Churn, Zahlungsausfälle, KI-Kosten je Anbieter, Anomalien, Prognose | Bericht, Aufgaben |

## Sicherheitskonzept

- TLS durch Reverse-Proxy; HSTS bei `COOKIE_SECURE=true`; Sicherheits-Header in API und Web.
- Passwörter Argon2id; Sperre nach 8 Fehlversuchen; Tokens nur als SHA-256-Hash gespeichert.
- Rate-Limits je IP (allgemein, Auth, öffentliche Formulare, Demo).
- Serverseitige Rollenprüfung (`require_role`), Mandant aus geprüfter Mitgliedschaft, Operator-Flag für `/admin`.
- Secrets nur über Umgebungsvariablen; OAuth-Tokens und Webhook-Secrets Fernet-verschlüsselt.
- Webhooks: Stripe-Signatur, HMAC für Inbound-Mail und Formular-Secret, HMAC für ausgehende CRM-Webhooks.
- Prompt-Injection: Kundentext als Daten markiert, Mustererkennung → menschliche Prüfung, Schema-Validierung, keine Tool-Ausführung aus Kundentext.
- Audit-Log für Nutzer-, Agenten-, System- und Webhook-Aktionen; sicherheitsrelevante Ereignisse markiert.
- Datenexport (JSON/CSV), Soft-Delete des Mandanten, konfigurierbare Aufbewahrung, täglicher Retention-Job.
- Not-Aus stoppt KI, Agenten und nichtkritische Jobs; Überwachung läuft weiter.
- Abhängigkeitsscans in CI (`pip-audit`, `npm audit`).

## Landingpage (Marketing)

Die Startseite `/` ist eine eigene, dunkle Bühne (`frontend/src/components/landing/`), die übrigen
Marketing-Seiten bleiben hell. Technik: GSAP 3.13 mit ScrollTrigger (gepinntes Scrollytelling,
horizontale Feature-Sektion, Parallaxe), three.js über React Three Fiber (Szene „Posteingang sortiert
sich", Maus- und Neigungsparallaxe, WebXR-Knopf nur wenn das Gerät `immersive-vr`/`immersive-ar`
meldet), IntersectionObserver-Fade-ins, eingebettetes Demo-Formular gegen die echte API.
`prefers-reduced-motion` schaltet Video, Pins und Scrub ab; dann bleibt das Poster stehen.

**Hintergrundvideo.** Die Startseite wählt beim Laden die Variante nach Bildschirm und Verbindung
(`Hero.tsx`, `pickVariant`): 2160p ab etwa 2200 CSS-Pixeln Breite mal Pixeldichte, sonst 1080p, auf
kleinen Bildschirmen oder bei Datensparmodus 720p. Je Variante gibt es WebM (VP9) und MP4 (H.264),
dazu ein JPEG-Poster in derselben Größe als Lade- und Bewegungsfallback. Erzeugt wird alles aus
`frontend/tools/video/footage.json` mit `node tools/video/prepare-footage.mjs` (ffmpeg mit libvpx-vp9
und libx264, Python mit Pillow): Clips schneiden und überblenden, 4K-Master, Varianten, Poster,
drei Standbilder für die Bild-Text-Abschnitte, Farbpalette (`palette.css`, aus dem Material mit
Median-Cut abgeleitet) und `public/video/SOURCES.md` mit Quellen und Lizenzen aus dem Manifest.
Die Clips selbst liegen nicht im Repository (`tools/video/footage/` ist ignoriert). Derzeit entstehen
sie aus fünf Fotos in `tools/video/photos/` (Tasche packen, Haustür, Laptop zurück, Baustelle, Mittagspause):
`node tools/video/stills-to-clips.mjs` legt je Foto einen 4K-Clip mit Kamerafahrt an (Zoom und Schwenk aus
`scenes` in `footage.json`), danach schneidet `prepare-footage.mjs` wie gewohnt. `render.mjs` erzeugt bei
Bedarf weiterhin den abstrakten Platzhalter aus `tools/video/anim.html`.

**Download-Bereich** direkt unter dem Film (`Downloads.tsx`): vier Knöpfe für Windows, macOS,
App Store und Google Play mit selbst gezeichneten Symbolen. Die Ziele kommen aus
`/api/public/config` (`DOWNLOAD_*_URL`); ohne Eintrag zeigt der Knopf „in Vorbereitung“ und
verlinkt nichts. Sobald die Store-Einträge existieren, sollten die offiziellen Badges von Apple
und Google nach deren Markenrichtlinien eingesetzt werden.

**Scroll-Effekte der Startseite** (alle nur ohne `prefers-reduced-motion`, GSAP ScrollTrigger):
Hero-Parallaxe, gepinntes Scrollytelling mit 3D-Szene, horizontale Funktionssektion, Fade-ins, dazu
seit Oktober 2026: `IsoJourney.tsx` (direkt unter dem Film und dem Download-Bereich; (isometrische Reise über die echten Bildschirme, Kamera fährt
beim Scrollen von Station zu Station, Reiter springen direkt an die Scrollposition; unter 1024 px und
bei reduzierter Bewegung die Reiteransicht aus `Screens.tsx`) und `ScrollMotion.tsx` (Fly-through:
Abschnitte mit `data-fly` kommen aus der Tiefe nach vorn, große Bilder laufen als Parallaxe). Nach dem
Mounten `ScrollTrigger.sort()` und `refresh()`, damit später angelegte Pins die Abstände kennen.

**Einblick ins System** (`Screens.tsx`): sechs echte Bildschirme des Dashboards als Reiter mit
Vergrößerung, keine Mockups. Aufnahme reproduzierbar: API und Web starten wie im Smoke-Test,
`python3 scripts/demo_seed.py <api-url> <api-log>` legt einen Beispielbetrieb mit sieben Anfragen,
Terminen, Angeboten und Wochenbericht an, `node frontend/tools/screens/capture.mjs` (Playwright aus
`.pw/`) meldet sich an und schreibt `public/screens/*.png` in 2160×1350. Nach Änderungen am Dashboard
neu aufnehmen, damit die Website den echten Stand zeigt.

**Website-Assistent** unten links (`Assistant.tsx`, `POST /api/public/assistant`): beantwortet
Fragen zur Website und zum Unternehmen kurz und in der Sie-Form. Grundlage ist ausschließlich die
Wissensliste `backend/app/services/assistant_wissen.json`; ohne KI-Anbieter antwortet eine
Stichwortregel mit dem passenden Fakt, mit Anbieter formuliert das Sprachmodell auf Basis
derselben Liste (Antwortschema `AssistantAnswer`, `unsure=true` verweist auf das Kontaktformular).
Limit 8 Fragen pro Minute und IP, Fragen werden nicht gespeichert, Injection-Muster gehen an die
Regel statt ans Modell. Dieselbe JSON-Liste speist die Einzeldatei-Vorschau.

## Bewusste Vereinfachungen

- Kein Multi-Region, kein Read-Replica: ein Postgres mit täglichem Dump reicht für die ersten hundert Kunden.
- Rate-Limit im Prozessspeicher, wenn kein Redis gesetzt ist (bei mehreren API-Instanzen Redis setzen).
- Markdown-Rendering der Ratgeber-Artikel ist minimal und escaped alles (kein HTML aus Inhalten).

## Ergänzungen Oktober 2026

- **Tarifdaten** liegen im Frontend genau einmal in `src/lib/plans.ts` (Preise, Grenzen, Feature-Schlüssel,
  Vergleichszeilen, Bedingungen) und speisen Startseite, `/preise`, JSON-LD und den Hinweis in der
  Registrierung. `scripts/check_plans.py` vergleicht sie mit `GET /api/billing/plans`; test-all bricht
  bei Abweichung ab. Preise ändern = Backend-Seed **und** `plans.ts` anpassen.
- **Öffentliche Konfiguration** (`GET /api/public/config`: `stripe_ready`, `llm_live`, `email_live`,
  `trial_days`, `downloads`) wird über `src/lib/public-config.ts` einmal je Seite geladen und steuert
  alle Zusagen auf der Website (Testtage, „monatlich kündbar", Abrechnungshinweis, Download-Links).
- **Sitzungsabfrage**: `AuthProvider` ruft `/api/auth/me` auf öffentlichen Seiten nur, wenn ein Merker
  `localStorage.wp_signed_in` (ohne Geheimnis) vom letzten Login existiert; unter `/app` und `/admin` immer.
- **Bilder**: `tools/img/make-webp.py` erzeugt WebP in zwei Breiten; die Komponenten nutzen `<picture>` mit
  `srcset`, PNG/JPG bleiben als Rückfall. Das Hero-Poster ist fest `poster-1080.webp`.
- **three.js** (Story-Szene) wird erst geladen, wenn der Abschnitt bis 120 % Viewport-Abstand heranrückt.
- **Browserprüfungen** in `scripts/browser/` (werden von test-all nach `.pw/` kopiert, weil Playwright dort
  installiert ist): `flows.mjs` (acht Kernabläufe), `linkcheck.mjs` (interne Links + Anker + Konsolenfehler),
  `axe.mjs` (WCAG 2.1 AA, bricht bei schweren Verstößen ab; mit `DASH_EMAIL`/`DASH_PASSWORD` auch Dashboard).

## Designsystem der Website (Stand Oktober 2026)

Grundlage ist eine dunkle, monochrome Referenz (Versal-Headlines, Chrom-Optik, runde Outline-Knöpfe, dunkle Karten).
Daraus abgeleitet:

- **Farben** (`frontend/src/components/landing/palette.css`, `.marketing` in `globals.css`): Fläche `#050505`,
  Panels `#0E0E10`, Kanten `#19191C`, Headlines Reinweiß `#FFFFFF`, Fließtext `#A1A1AA` (7,9:1), Linien
  `rgba(255,255,255,.14)`, Primärknöpfe Weiß auf Schwarz. Keine Buntfarbe; die 3D-Szene nutzt metallische Graustufen.
  Die aus dem Film abgeleitete Palette liegt nur zum Vergleich in `palette.generated.css`.
- **Schrift** (lokal in `public/fonts`, OFL): Anton (kondensiert, versal) für Hero, Seitentitel und Abschnittstitel,
  Inter 300 für Fließtext (klein, großzügiger Zeilenabstand), Space Mono nur für Zahlen und Labels.
  Keine Google-Fonts-Verbindung beim Seitenaufruf; die Dateien wurden einmalig heruntergeladen.
- **Hero**: Headline liegt über dem Video-Banner und überlappt dessen oberen Rand (`.hero-title`, negativer
  Unterrand); im Banner links der runde Outline-Knopf (`.btn-circle`), rechts der Subtext, oben rechts der runde
  Video-Schalter, rechts die Zeitleiste. Navigation transparent, Menüpunkte zentriert.
- **Mittelteil**: übergroße zentrierte Typografie (`.display-giant`) mit der 3D-Szene, die in die zweite Zeile
  ragt (`.story-scene`, negativer Oberrand); schmaler zentrierter Beschreibungstext (`.lead-narrow`).
- **Funktionen**: zweizeilige linksbündige Headline, runder Outline-Knopf daneben, Beschreibung rechts; darunter
  das horizontale Raster aus dunklen Karten (`.card-dark`) mit echten Dashboard-Bildschirmen (entsättigt).
- **Formen**: Pillen für Knöpfe und Etiketten, 1-px-Linien statt Kästen (Tarifvergleich, Funktionen- und
  Branchenseite, FAQ), Radien 4 bis 8 px, keine Verläufe als Dekoration, eine sehr feine Körnung (4,5 %).
- **Bewegung**: alle bestehenden Effekte unverändert (Wort-Eintritt, Parallaxe, isometrische Reise, Story-Pin,
  horizontale Funktionen, Fade-ins). Technisch wichtig: `ScrollTrigger.sort()` + `refresh()` nach dem spät
  erzeugten Pin der isometrischen Reise und nach `document.fonts.ready`, weil die kondensierte Schrift die
  Headline-Höhen gegenüber der Ersatzschrift deutlich verändert.
- **Dashboard** (`/app`, `/admin`) bleibt hell mit Blau; die Website setzt die Knopffarben über
  `--color-btn` / `--color-on-btn`.
