# Einmalige Einrichtung und laufende Überwachung

## Teil A – Einmal einrichten (ca. ein Arbeitstag ohne Anwaltstermin)

### 1. Konten anlegen (siehe docs/03-deployment.md)
- [ ] Domain, Hosting (EU), Stripe, E-Mail-Versand/Eingang, KI-Anbieter, Google Cloud (optional), GitHub.
- [ ] Beim KI-Anbieter ein monatliches Ausgabenlimit setzen.

### 2. Server
- [ ] VPS, Docker, Caddy mit TLS, Firewall (nur 22/80/443).
- [ ] Repo klonen, `.env` aus `.env.example`, alle (Pflicht)-Werte setzen.
- [ ] `docker compose up -d --build`, `curl https://<domain>/health` → `{"status":"ok"}`.
- [ ] Offsite-Backup-Cron (rclone) einrichten; einmal `scripts/restore.sh` in eine Test-DB ausführen.

### 3. Betreiberkonto
- [ ] Über die Website registrieren, bestätigen, `scripts/make_operator.py <mail>`.
- [ ] `/admin` öffnen: „Vor Produktivstart lösen“ muss leer sein.

### 4. Zahlungen
- [ ] Stripe: Produkte, Preise, Webhook, Kundenportal (docs/07). Preis-IDs in `/admin/tarife`.
- [ ] Im Testmodus eine Buchung mit Testkarte durchspielen; Abo erscheint im Dashboard als aktiv.
- [ ] Live-Schlüssel eintragen.

### 5. Kanäle
- [ ] Versanddomain verifizieren (SPF, DKIM, DMARC); Testmail an sich selbst.
- [ ] Inbound-Adapter bauen und mit einer Testmail an `anfragen+<slug>@…` prüfen.
- [ ] Eigenes Testformular mit dem Formular-Snippet prüfen.

### 6. Recht
- [ ] Checkliste docs/06 abarbeiten; Rechtstexte ersetzen (Dateien unter `frontend/src/app/(marketing)/{impressum,datenschutz,agb,widerruf}`), `DraftNotice` entfernen.
- [ ] AVV als PDF bereitstellen und in der Registrierung verlinken.

### 7. Freischalten
- [ ] `NOINDEX=0`, Web neu bauen; Sitemap bei Google Search Console einreichen.
- [ ] Erste 10 Testbetriebe persönlich einladen (docs/01, Annahmen A1–A8).

## Teil B – Laufend überwachen

| Wann | Was | Dauer |
|---|---|---|
| täglich | Tagesbericht-Mail; `/admin`: Freigaben, eskalierte Tickets, tote Jobs | 5 min |
| wöchentlich | `/admin/finanzen`; Stripe-Dashboard; KI-Konsole (Ausgaben); `/admin/leads` nachfassen; Ratgeber-Freigaben | 20 min |
| monatlich | Backup-Wiederherstellung testen; `pip-audit`/`npm audit` in CI prüfen; Abhängigkeiten aktualisieren; Preise/Annahmen gegen echte Zahlen prüfen | 1 h |
| bei Alarm-Mail | docs/04 „Störungsbilder“; im Zweifel Not-Aus | – |

Alles andere (Anfragen, Entwürfe, Nachfass, Berichte, Support-Erstantwort, Lead-Qualifizierung,
Finanzbericht, Fehlertriage, Inhaltsentwürfe) läuft ohne Zutun. Was Agenten nicht dürfen, landet
unter Freigaben – und nur dort braucht es Sie.
