# Betriebshandbuch

## Was läuft automatisch

| Takt | Was | Wo prüfen |
|---|---|---|
| alle 2 s | Worker holt fällige Jobs (Verarbeitung, E-Mails, Webhooks) | `/admin/fehler` (tote Jobs) |
| 10 min | Support-Agent beantwortet offene Tickets | `/admin/support` |
| 15 min | Ops-Agent: Systemprüfung, Alarm bei kritischen Punkten | `/admin` (Tagesbericht), Alarm-Mail |
| 1 h | Angebots-Nachfass, abgelaufene Terminvorschläge | Kunden-Dashboard |
| 6 h | Vertriebs-Agent: Leads qualifizieren, Testphasen-Erinnerung | `/admin/leads` |
| 12 h | Produkt-Agent: Fehler triagieren, Tests ausführen | `/admin/fehler`, `/admin/freigaben` |
| 24 h | Director, Marketing, Finanzen, Retention-Löschung | `/admin/agenten`, `/admin/finanzen`, `/admin/inhalte` |
| 7 Tage | Wochenberichte an Kunden | Kunden-Dashboard → Berichte |
| 03:15 UTC | Datenbank-Backup (Compose-Dienst `backup`) | Volume `backups`, Ops-Befund „Letztes Backup“ |

## Tägliche Routine des Betreibers (5 Minuten)

1. Tagesbericht-Mail lesen (oder `/admin`): kritische Punkte? Not-Aus aktiv?
2. `/admin/freigaben`: Freigaben entscheiden (Inhalte, Code-Vorschläge).
3. `/admin/support`: eskalierte Tickets beantworten.
4. `/admin/fehler`: tote Jobs ansehen, nach Behebung „Erneut“.

Wöchentlich: `/admin/finanzen` (MRR, Churn, Anomalien), `/admin/leads`, Stripe-Dashboard,
KI-Anbieter-Konsole (Ausgaben gegen Budget), Backup-Wiederherstellung stichprobenartig testen.

## Not-Aus

- Auslösen: `/admin` → NOT-AUS (Grund angeben) oder `POST /api/admin/kill-switch {"active": true}`.
- Automatisch: Ops-Agent bei KI-Kosten ≥ 150 % des Tagesbudgets.
- Wirkung: keine KI-Aufrufe (`KillSwitchActive`), keine Agentenläufe außer `ops`, nur Jobs mit
  `critical=true` (Ops-Prüfung, Retention). Anfragen werden weiter gespeichert und als
  „needs_review“ markiert; nichts geht verloren.
- Aufheben: gleicher Schalter. Danach `/admin/fehler` prüfen und tote Jobs erneut einplanen.

## Budgets

- Global: `AI_GLOBAL_DAILY_BUDGET_CENTS` (oder `/admin` → Tagesbudget). Überschreitung → `BudgetExceeded`,
  Anfragen bleiben zur manuellen Bearbeitung.
- Je Tarif: `limits.ai_budget_cents_month` in `/admin/tarife`. Testphase: `TRIAL_AI_CALLS_MAX`, `AI_TRIAL_TOTAL_BUDGET_CENTS`.
- Zusätzlich beim KI-Anbieter ein hartes Ausgabenlimit setzen (zweite Sicherung).

## Backup und Wiederherstellung

```bash
# manuell
docker compose exec api scripts/backup.sh /srv/backups
# wiederherstellen in neue DB (Test), dann umschalten
docker compose exec db psql -U werkpilot -c "CREATE DATABASE werkpilot_restore"
docker compose exec api scripts/restore.sh /srv/backups/werkpilot-<stamp>.sql.gz postgresql://werkpilot:<pw>@db:5432/werkpilot_restore
```

Backups liegen im Docker-Volume `backups`. **Zusätzlich offsite kopieren** (z. B. täglich per
`rclone` auf Hetzner Storage Box oder S3 in der EU, verschlüsselt). Der Test
`tests/test_recovery.py` prüft Dump und Restore mit den echten Skripten; monatlich einmal
manuell wiederholen.

## Störungsbilder

| Symptom | Ursache | Maßnahme |
|---|---|---|
| Viele Anfragen in „needs_review“ ohne Kategorie | KI-Anbieter down, Budget erschöpft, Not-Aus | `/admin` → Anbieterstatus/Budget; Jobs „Erneut“ |
| E-Mails „simulated“ in Produktion | `EMAIL_PROVIDER=console` | Anbieter konfigurieren; Ops meldet das als kritisch |
| Stripe-Webhook 400 | falsches `STRIPE_WEBHOOK_SECRET` | Secret aus Stripe-Webhook-Detail übernehmen |
| Abo nicht aktiv nach Zahlung | Webhook nicht angekommen | Stripe → Webhook-Log → erneut senden (idempotent) |
| Jobs stapeln sich (`queued` > 15 min) | Worker läuft nicht | `docker compose ps`, `logs worker`, Neustart |
| Google-Kalender „error“ | Token abgelaufen/widerrufen | Kunde verbindet neu (Integrationen) |
| 429 für Kunden | Rate-Limit zu niedrig oder Angriff | `RATE_LIMIT_PER_MINUTE` prüfen, Proxy-IP-Weitergabe (`TRUST_PROXY_HEADERS`) |

## Sicherheitsvorfall

1. Not-Aus aktivieren.
2. Betroffene Sitzungen widerrufen: `UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=...`.
3. `SECRET_KEY` rotieren (alle Nutzer müssen sich neu anmelden); bei Verdacht auf Token-Leak auch `ENCRYPTION_KEY` rotieren (Integrationen müssen neu verbunden werden).
4. Audit-Log (`audit_logs`, severity=security) sichern und auswerten.
5. Meldepflichten prüfen (Art. 33 DSGVO: 72 Stunden an Aufsichtsbehörde, ggf. Betroffene).
