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
- **Nachfass-Entwürfe an Endkunden** werden angelegt, aber nicht automatisch versendet (Freigabe nötig) — gewollt.
- **Code-Änderungen durch den Produkt-Agenten**: Der Agent triagiert, führt Tests aus und erstellt Vorschläge/Freigaben; er schreibt keinen Code in Branches. Das wäre der nächste Ausbauschritt (mit Sandbox und PR-Workflow) und sollte erst nach stabiler Produktion kommen.
- **Keyword-Recherche** nutzt eine Seed-Liste statt echter Suchvolumendaten (dafür wäre eine kostenpflichtige API nötig).

## Landingpage

- **Hintergrundfilm aus Fotos, nicht aus Bewegtbild.** Der Film besteht aus fünf vom Auftraggeber bereitgestellten Fotos (1408×768) mit langsamen Kamerafahrten (`tools/video/stills-to-clips.mjs`), auf 4K hochgerechnet. Echtes 4K-Bewegtbild wäre schärfer und lebendiger. Die Herkunft und Rechte der Fotos sind nicht geprüft; vor dem Livegang bestätigen (Quelle, Lizenz, Personen im Bild). Echte Clips: nach `frontend/tools/video/footage/` legen, `footage.json` pflegen, `node tools/video/prepare-footage.mjs`.
- Die 3D-Szene braucht WebGL; ohne WebGL bleibt der Rahmen leer (kein Absturz). Ein statisches Ersatzbild wäre der nächste Schritt.
- Lighthouse/Performance auf schwachen Mobilgeräten noch nicht gemessen; GSAP und three.js laden nur auf der Startseite.

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

## Sicherheitsreview (durchgeführt, behoben)

Ein Review des gesamten Codes fand sechs Kandidaten; fünf wurden als real bestätigt und behoben, einer war ein Fehlalarm:

| Befund | Behebung |
|---|---|
| Google-OAuth-Callback nicht an den startenden Browser gebunden (fremde Kalender-Tokens könnten im eigenen Mandanten landen) | Browser-Nonce als httpOnly-Cookie, State läuft nach 10 Minuten ab und ist einmalig, Ablehnung wird im Audit-Log als Sicherheitsereignis protokolliert |
| Blinder SSRF über die CRM-Webhook-URL (interne Hosts, Status-Oracle) | `core/netsafety.py`: nur https/443, kein IP-Literal, DNS-Auflösung gegen private/lokale Netze beim Speichern und bei jedem Versand; nur generische Fehlermeldung für den Mandanten |
| Tarif aus Stripe-Metadaten statt Preis-ID (Portal-Downgrade behielt Pro-Funktionen) | Preis-ID auf den Abo-Positionen ist die Wahrheit, Metadaten nur Rückfall |
| CSV-Formel-Injection im Kundenexport | Zellen mit führendem `= + - @ Tab CR` werden neutralisiert |
| Bestätigungslink erzeugte eine Sitzung (Pre-Hijacking-Muster) | Bestätigung ohne Login; Nutzer meldet sich danach mit Passwort an |
| Checkout akzeptiert nicht-öffentliche Tarifcodes | Fehlalarm: Stripe berechnet den hinterlegten Preis, keine Vorteile; Standardtarife sind alle öffentlich |

Regressionstests dazu in `backend/tests/test_security_fixes.py`.

## Qualitätsstand

- Abhängigkeitsscan: Backend ohne bekannte Schwachstellen (`pip-audit`). Frontend: Produktionsabhängigkeiten sauber; `npm audit` meldet 5 „high“ ausschließlich in Entwicklungswerkzeugen (ESLint-Plugin → `braces`, Stack-Erschöpfung bei bösartigen Glob-Mustern), nicht im ausgelieferten Code. Wird mit dem nächsten `eslint-config-next`-Release behoben.

- 69 Backend-Tests grün (Postgres), Lint sauber. `./test-all.sh` (35 Prüfungen inkl. Smoke- und Browser-Test) bestanden.
- Behoben beim Smoke-Test: Die Weiterleitung `/api/*` → Backend war in `next.config.ts` beim Build eingefroren (hätte im Docker-Image auf `localhost:8000` gezeigt). Jetzt liest ein Route-Handler `BACKEND_URL` zur Laufzeit.
- Frontend-Build und ESLint sauber; Browser-Durchlauf (Registrierung → Entwurf → Versand → Abo-Seite → Integrationen) erfolgreich. Terminbestätigung per Kundenlink (`/termin?token=…`) ist umgesetzt und getestet.
- Nicht getestet: echte Anthropic/OpenAI-Aufrufe (kein Schlüssel in der Entwicklungsumgebung), echter Stripe-Checkout (nur Webhook-Verarbeitung mit signierten Test-Events), echte Google-OAuth-Runde, Docker-Build (Docker-Daemon in der Entwicklungsumgebung nicht verfügbar; Dockerfiles ungetestet).
