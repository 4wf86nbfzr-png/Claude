# Offene Punkte und Risiken

Stand nach Abschluss des Kernprodukts. Sortiert nach Dringlichkeit für den Produktivstart.

## Blockierend für den Produktivstart

| # | Punkt | Status |
|---|---|---|
| 1 | Rechtstexte anwaltlich prüfen, Platzhalter füllen, AVV bereitstellen | Entwürfe vorhanden, Checkliste in docs/06 |
| 2 | Produktionskonfiguration: echte Secrets, E-Mail-Anbieter mit verifizierter Domain, KI-Anbieter, Stripe Live | `.env.example` dokumentiert; `validate_for_production()` prüft |
| 3 | Inbound-Mail-Adapter beim gewählten Mail-Anbieter bauen (ca. 30 Zeilen) | Format und Beispiele in docs/07, Endpunkt getestet |
| 4 | Google-OAuth-App-Verifizierung (sonst max. 100 Testnutzer) | nicht begonnen |
| 5 | Offsite-Backup einrichten (rclone/Storage Box) | Dump-Skripte und Compose-Backup vorhanden |
| 6 | Externer Security-Review / Pentest | nicht begonnen |

## Funktional offen (bewusst nicht gebaut)

- **AVV-Abschluss im Registrierungsfluss** (Checkbox + Dokument). Kleine Änderung, braucht den Text.
- **WhatsApp, Telefonannahme, Microsoft-365-Kalender**: nicht verfügbar, auf der Website so benannt.
- **IMAP-Abruf** als Alternative zur Weiterleitung (für Betriebe, deren Mailanbieter keine Weiterleitung erlaubt).
- **Datenschutzfreundliches Analytics**: nicht eingebunden. Empfehlung: selbst gehostetes Plausible/Umami ohne Cookies; dann Datenschutzerklärung ergänzen. Konversionsdaten liegen bisher nur in der eigenen DB (Registrierungen, Abos, Leads je Quelle).
- **Content-Metriken**: `content_pieces.metrics.views` wird beim Aufruf gezählt; keine Suchmaschinen-Rankingdaten (Search-Console-Anbindung wäre der nächste Schritt).
- **Mehrsprachigkeit**: nur Deutsch.
- **Terminbestätigung durch den Endkunden per Link** (Token ist angelegt, Endpunkt/Seite fehlen). Aktuell bestätigt der Betrieb im Dashboard.
- **Nachfass-Entwürfe an Endkunden** werden angelegt, aber nicht automatisch versendet (Freigabe nötig) — gewollt.
- **Code-Änderungen durch den Produkt-Agenten**: Der Agent triagiert, führt Tests aus und erstellt Vorschläge/Freigaben; er schreibt keinen Code in Branches. Das wäre der nächste Ausbauschritt (mit Sandbox und PR-Workflow) und sollte erst nach stabiler Produktion kommen.
- **Keyword-Recherche** nutzt eine Seed-Liste statt echter Suchvolumendaten (dafür wäre eine kostenpflichtige API nötig).

## Technische Risiken

| Risiko | Auswirkung | Minderung |
|---|---|---|
| KI-Anbieter-Preise ändern sich | Kosten je Kunde höher als geplant | Budgets je Tarif, Modellwahl pro Aufgabe, Preistabelle im Code pflegen |
| Qualität der Mock-Entwürfe wird mit echter KI verwechselt | Kunden in Testphase unterfordert | Dashboard zeigt „regelbasiert“, Ops meldet Mock in Produktion als Konfigurationsproblem |
| Zustellbarkeit der Antwort-Mails (Absender WerkPilot, Reply-To Betrieb) | Mails im Spam | SPF/DKIM/DMARC für Versanddomain; mittelfristig „Senden im Namen des Betriebs“ mit dessen Domain |
| Stripe-Webhook verpasst | Abo-Status falsch | Idempotente Verarbeitung, Stripe-Retry, Finance-Agent meldet Abweichungen; nächster Schritt: täglicher Abgleich per Stripe-API |
| Single VPS | Ausfall = alles weg | Backups + dokumentierte Wiederherstellung; bei Wachstum Managed-DB |
| Rate-Limit im Prozessspeicher | Bei mehreren API-Instanzen wirkungslos | `REDIS_URL` setzen |
| Agenten erzeugen Aufgaben-Rauschen | Betreiber ignoriert die Liste | Dedupe-Keys vorhanden; bei Bedarf Takt senken |

## Geschäftliche Risiken

- Preise (79/149/249 €) sind unvalidiert.
- Große Handwerkersoftware-Anbieter könnten KI-Posteingang als Feature nachrüsten.
- Datenschutzbedenken bei KI-Verarbeitung von Kundenmails; EU-Hosting des KI-Anbieters kann entscheidend sein.
- Markenname „WerkPilot“ ist nicht geprüft.

## Qualitätsstand

- 59 Backend-Tests grün (Postgres), Lint sauber.
- Frontend-Build und ESLint sauber; Browser-Durchlauf (Registrierung → Entwurf → Versand → Abo-Seite → Integrationen) erfolgreich.
- Nicht getestet: echte Anthropic/OpenAI-Aufrufe (kein Schlüssel in der Entwicklungsumgebung), echter Stripe-Checkout (nur Webhook-Verarbeitung mit signierten Test-Events), echte Google-OAuth-Runde, Docker-Build (Docker-Daemon in der Entwicklungsumgebung nicht verfügbar; Dockerfiles ungetestet).
