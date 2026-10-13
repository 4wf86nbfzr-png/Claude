# Ist-Analyse und Aufgabenliste (Stand Oktober 2026)

Ergebnis der vollständigen Durchsicht vor der Marktreife-Runde. Was hier als „erledigt" steht,
wurde im selben Durchgang umgesetzt und mit `./test-all.sh` geprüft (Ergebnisse in
`docs/11-abschlussbericht.md`).

## 1. Vorgefunden

| Bereich | Befund |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind 4, GSAP, three.js nur auf der Startseite. Landing + 20 Marketingseiten, Dashboard (`/app/*`), Betreiberbereich (`/admin/*`). |
| Backend | FastAPI, SQLAlchemy async, Alembic (Migrationen reversibel), Postgres 16, Redis für Jobs/Rate-Limits. 70 Tests. |
| Auth | Argon2id, JWT (15 min) + Refresh-Cookie (httpOnly), E-Mail-Bestätigung, Passwort-Reset, Rollen (owner/admin/member), Betreiber-Flag; Mandantentrennung serverseitig über `tenant_id` in jeder Abfrage, getestet (`tests/test_permissions.py`, `test_security_fixes.py`). |
| KI | Gateway mit Mock/Anthropic/OpenAI, strukturierte Ausgaben (Pydantic-Schema), Zeitlimit, Retries, Budgets (global/Tag, je Betrieb/Monat, je Aufgabe), Not-Aus, Prompt-Injection-Kapselung (`wrap_untrusted`), Kosten je Aufruf in `ai_usage`. Demo und Website-Assistent laufen regelbasiert. |
| Abrechnung | Stripe Checkout/Portal/Webhooks (signiert, idempotent). Tarife in der DB (`plans`), Entitlements je Status. Ohne Stripe-Schlüssel: Testphase läuft, Buchung nicht möglich. |
| E-Mail | Resend/SMTP/Konsole; Eingang per signiertem Inbound-Webhook und Website-Formular (Geheimnis je Betrieb, Honeypot); Dubletten über `external_id`. |
| Kalender/Angebote/Berichte | Google-Kalender-OAuth, Terminvorschläge aus Geschäftszeiten, Angebotsnachverfolgung, Wochenbericht: alle real, kein Platzhalter. |
| Datenschutz | Export (JSON, Kunden-CSV), Löschung mit Bestätigung, Aufbewahrungsfrist je Betrieb (≥ 30 Tage), Audit-Log automatischer Aktionen. |
| SEO | Titel/Beschreibung je Seite, OG-Bild, robots/sitemap, App-Bereiche noindex; **Canonical fehlte**. |
| Leistung (Lighthouse, vorher) | Desktop 73 / Mobil 56 Performance; TBT 710 ms / 5,25 s; PNG-Screens 1,5 MB, three.js (226 KiB gzip) beim Start geladen, zwei Poster-Bilder geladen. |
| Barrierefreiheit (axe, vorher) | 5 schwere Kontrastverstöße (`text-muted`, inaktive Schritte), Überschriftenreihenfolge im Fußbereich. |
| Unbelegte Aussagen | „Daten in der EU", „betrieben in Deutschland", „30 Tage nach Kündigung gelöscht", „Sie werden informiert", „innerhalb eines Werktags": nicht durch Konfiguration oder Code gedeckt. |
| Tarifdaten | Vierfach gepflegt (Landing, /preise, JSON-LD, Backend-Seed) ohne Abgleich. |

## 2. Aufgabenliste (priorisiert) und Status

**A. Sicherheit und Ehrlichkeit**
- [x] Alle nicht belegbaren Zusagen entfernt oder an den tatsächlichen Zustand gebunden (Hero-Vertrauenszeile aus `/api/public/config`: Testtage, „monatlich kündbar" nur bei aktiver Abrechnung).
- [x] Registrierung und Preisseiten zeigen, wenn die Abrechnung nicht freigeschaltet ist (kein Vertrag, keine Berechnung, Wunschtarif vorgemerkt).
- [x] Demo: sichtbar „Regelbasiert, keine KI", Beispieldaten als erfunden gekennzeichnet, Antwort enthält `engine`/`stored`.
- [x] Öffentliche Seiten fragen nicht mehr bei jedem Aufruf die Sitzung ab (zwei 401 je Seite weniger).
- [ ] Vor dem Start: Hosting- und KI-Anbieter in der Datenschutzerklärung eintragen, AV-Verträge (siehe docs/06).

**B. Produktfunktion**
- [x] Tarifdaten zentral in `frontend/src/lib/plans.ts`; `scripts/check_plans.py` vergleicht mit `/api/billing/plans` (Teil von test-all).
- [x] Vergleichstabelle (Inhalte, Grenzen, Zusatzkosten, Kündigung, Testphase, USt.) auf Startseite und /preise.
- [x] Demo je Gewerk mit dringendem, Angebots- und unklarem Fall; Fehlermeldungen für 422/429/503.
- [ ] Stripe-Preise anlegen und `STRIPE_*` setzen (Betreiber).

**C. Konversion**
- [x] Hero: „Draußen arbeiten. Im Büro nichts mehr verpassen.", „Kostenlos testen" / „Produktdemo ansehen".
- [x] Canonical-URL für alle Seiten (`alternates.canonical` im Root-Layout).

**D. Leistung**
- [x] WebP mit `srcset` für Screens und Standbilder (`tools/img/make-webp.py`), ein Poster statt zwei, three.js erst in Viewport-Nähe.
- [x] Nachher: Desktop 100 / Mobil 94, TBT 0 ms / 70 ms, Gesamtgewicht 3,9 MB / 2,4 MB (Video ist der Rest).

**E. Qualität**
- [x] Browserprüfungen in `scripts/browser/`: acht Kernabläufe, Linkprüfung, axe (WCAG 2.1 AA); in test-all eingebunden.
- [x] Kontrast- und Überschriftenbefunde behoben (axe: 0 schwere Verstöße auf 13 Seiten).

**F. Später**
- [ ] Gewerke-Unterseiten mit eigenem Inhalt (derzeit Abschnitt auf /branchen).
- [ ] Imagefilm aus echtem Dreh statt Ken-Burns-Fotos.
- [ ] Desktop-/Mobil-Apps (Links erscheinen automatisch, sobald `DOWNLOAD_*_URL` gesetzt ist).
