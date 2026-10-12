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
`prefers-reduced-motion` schaltet Video, Pins und Scrub ab. Das Hintergrundvideo ist eine selbst
gerenderte Canvas-Animation (`werkpilot-loop.webm`, VP8, 14 s, 2 MB) mit JPEG-Poster; Safari älter als
14.1 zeigt das Poster. Neu rendern: `node tools/video/render.mjs` im Frontend-Ordner (Quelle `tools/video/anim.html`,
braucht Playwright und ffmpeg mit libvpx).

## Bewusste Vereinfachungen

- Kein Multi-Region, kein Read-Replica: ein Postgres mit täglichem Dump reicht für die ersten hundert Kunden.
- Rate-Limit im Prozessspeicher, wenn kein Redis gesetzt ist (bei mehreren API-Instanzen Redis setzen).
- Markdown-Rendering der Ratgeber-Artikel ist minimal und escaped alles (kein HTML aus Inhalten).
