# Deployment

## Variante A (empfohlen für den Start): ein VPS mit Docker Compose

Geeignet bis einige hundert Kunden. Kosten ca. 10–25 €/Monat.

1. VPS mit Ubuntu 24.04 (z. B. Hetzner CX22, 4 GB RAM, Standort Nürnberg/Falkenstein = EU).
2. Docker + Compose installieren, Repo klonen, `.env` aus `.env.example` erzeugen.
3. Reverse-Proxy mit TLS. Beispiel Caddyfile:

   ```
   werkpilot.de, www.werkpilot.de {
     reverse_proxy 127.0.0.1:3000
   }
   api.werkpilot.de {
     reverse_proxy 127.0.0.1:8000
   }
   ```

   Alternativ nur eine Domain: Das Frontend proxyt `/api/*` zum Backend (`BACKEND_URL`),
   dann reicht `werkpilot.de → 127.0.0.1:3000`. Stripe- und Inbound-Webhooks zeigen in dem Fall
   ebenfalls auf `https://werkpilot.de/api/...`. Für OAuth-Redirects `BASE_URL` entsprechend setzen.

4. `.env` setzen (siehe unten), `docker compose up -d --build`.
5. Betreiberkonto: über die Website registrieren, E-Mail bestätigen, dann
   `docker compose exec api python scripts/make_operator.py chef@werkpilot.de`.
6. Stripe-Webhook und Inbound-Mail-Webhook anlegen (docs/07-integrationen.md).
7. `NOINDEX=0` setzen, sobald die Rechtstexte freigegeben sind.

## Variante B: Managed (Vercel + Render/Fly + Neon/Supabase)

- Frontend auf Vercel (Env: `BACKEND_URL`, `NEXT_PUBLIC_SITE_URL`).
- API und Worker als zwei Dienste aus `backend/Dockerfile` (Worker-Command `python -m app.workers.runner`).
- Postgres bei Neon/Supabase in EU-Region; Backups über deren Snapshots **und** `scripts/backup.sh` per Cron.
- Nachteil: mehr Anbieter, mehr AV-Verträge, höhere Fixkosten (~40–80 €).

## Benötigte externe Konten

| Konto | Zweck | Pflicht | Kosten |
|---|---|---|---|
| Domain-Registrar (z. B. INWX, Hetzner DNS) | Domain, DNS | ja | ~1 €/Monat |
| Hosting (Hetzner/Netcup/…) | VPS | ja | 10–25 €/Monat |
| Stripe | Abrechnung, Kundenportal, Rechnungen | ja (vor erstem zahlenden Kunden) | Gebühren je Zahlung |
| E-Mail-Versand (Resend, Postmark, Mailgun oder SMTP des Hosters) | Transaktionsmails, Antworten, Berichte | ja | 0–20 €/Monat |
| E-Mail-Eingang (Resend Inbound / Postmark Inbound / Mailgun Routes) | Weiterleitung von Kundenanfragen | ja für Mail-Kanal | im Versand enthalten oder ~10 € |
| KI-Anbieter (Anthropic oder OpenAI) | Klassifizierung, Entwürfe, Agenten | ja | variabel, gedeckelt |
| Google Cloud Console (OAuth-Client) | Google-Kalender-Anbindung | optional | kostenlos |
| Uptime-Monitor (Uptime-Kuma selbst gehostet, Better Stack, …) | Erreichbarkeit | empfohlen | 0–10 € |
| Fehler-Tracking (optional Sentry/GlitchTip) | Stacktraces | optional | 0–26 € |
| GitHub | Code, CI | ja | kostenlos |
| Steuerberatung | Umsatzsteuer, Buchhaltung | ja | 50–150 €/Monat |

## Benötigte Zugangsdaten (vom Betreiber zu beschaffen)

| Variable | Woher |
|---|---|
| `SECRET_KEY` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"` |
| `POSTGRES_PASSWORD` | selbst wählen, lang und zufällig |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe-Dashboard → Entwickler → API-Schlüssel / Webhooks |
| Stripe `price_...` je Tarif | Stripe → Produktkatalog; in `/admin/tarife` eintragen |
| `RESEND_API_KEY` (oder SMTP-Daten) | Resend-Dashboard, Domain verifizieren (SPF/DKIM) |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | `openssl rand -hex 24`; im Mail-Anbieter als Signatur-Secret hinterlegen (docs/07) |
| `ANTHROPIC_API_KEY` oder `OPENAI_API_KEY` | Anbieter-Konsole, Ausgabenlimit dort setzen |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth-Client „Webanwendung“, Redirect-URI `{BASE_URL}/api/integrations/google-calendar/callback`, Scopes calendar.events + calendar.readonly; App-Verifizierung beantragen |
| `OPS_ALERT_EMAIL` | eigene Adresse für Alarme und Tagesbericht |

Keiner dieser Werte darf ins Repository. `.env` ist in `.gitignore`.

## Produktionswerte

```
ENV=production
COOKIE_SECURE=true
TRUST_PROXY_HEADERS=true
BASE_URL=https://werkpilot.de        (oder https://api.werkpilot.de)
FRONTEND_URL=https://werkpilot.de
CORS_ORIGINS=https://werkpilot.de
EMAIL_PROVIDER=resend
LLM_PROVIDER=anthropic
NOINDEX=0
```

Beim Start prüft `validate_for_production()` diese Werte und loggt Probleme; `/admin` zeigt sie
unter „Vor Produktivstart lösen“.

## Updates

```bash
git pull
docker compose build
docker compose up -d        # api führt `alembic upgrade head` beim Start aus
docker compose logs -f api worker
```

Rollback: vorheriges Image starten, bei Schemaänderung `alembic downgrade -1` (Migrationen sind
reversibel geschrieben). Vor jedem Update Backup ziehen (`scripts/backup.sh`).
