# Laufende Kosten

Alle Beträge Richtwerte (Oktober 2026), netto. Vor Vertragsabschluss aktuelle Preislisten prüfen.

## Fix

| Posten | Monat | Hinweis |
|---|---|---|
| VPS 4 GB (Hetzner CX22 o. ä.) | ~5–8 € | reicht für API, Worker, Web, Postgres |
| VPS 8 GB (ab ~100 Kunden) | ~15–25 € | |
| Offsite-Backup (Storage Box 1 TB) | ~4 € | |
| Domain | ~1 € | |
| E-Mail-Versand | 0 € (Resend Free bis 3.000 Mails/Monat) → 20 € | ein aktiver Kunde erzeugt ca. 50–150 Mails/Monat |
| Uptime-Monitor | 0 € (selbst gehostet) | |
| Buchhaltung/Steuerberatung | 50–150 € | |

## Variabel

### KI je Mandant

Pro Anfrage zwei Aufrufe (Klassifizierung ≈ 700 Eingabe-/150 Ausgabetokens, Entwurf ≈ 900/350).
Mit `claude-sonnet-5-5` (Richtwert 3 $/1M Eingabe, 15 $/1M Ausgabe) ≈ 1,2 ct je Anfrage;
mit `claude-haiku-5-5` oder `gpt-5-mini` ≈ 0,1–0,3 ct. Die im Code hinterlegten Token-Preise
(`PRICING_MICROCENTS_PER_TOKEN`) sind Richtwerte und müssen mit der Anbieter-Preisliste abgeglichen werden.

| Tarif | Anfragen/Monat (Limit) | KI-Kosten bei Sonnet | Bei Haiku/Mini | Tarifpreis |
|---|---|---|---|---|
| Starter | 150 | ~1,8 € | ~0,3 € | 79 € |
| Business | 500 | ~6 € | ~1 € | 149 € |
| Pro | 2.000 | ~24 € | ~4 € | 249 € |

Die Tarif-Budgets (`ai_budget_cents_month`: 400/1000/2500 ct) sind so gesetzt, dass ein Kunde
den Tarifpreis nicht durch KI-Kosten auffressen kann. Bei Sonnet und voller Pro-Auslastung wäre das
Budget vor dem Anfragelimit erreicht; dann Budget anpassen oder günstigeres Modell für die
Klassifizierung nutzen.

Agenten (Betreiber-Ebene) kosten bei aktivem LLM ca. 5–30 ct/Tag (Director-Analyse, Marketing-Artikel).

### Stripe

1,5 % + 0,25 € je Zahlung mit EU-Karte, 2,9 % + 0,25 € bei Nicht-EU-Karten, SEPA-Lastschrift 0,35 €
(gedeckelt). Bei 149 € entspricht das ~2,50 €. Stripe Tax optional (0,5 % je Transaktion), falls
USt-Berechnung ausgelagert werden soll.

## Szenarien (Monat)

| | 0 Kunden | 10 Kunden | 50 Kunden | 200 Kunden |
|---|---|---|---|---|
| Hosting + Backup + Domain | 10 € | 10 € | 25 € | 60 € |
| E-Mail | 0 € | 0 € | 20 € | 50 € |
| KI (Betreiber-Agenten) | 3 € | 3 € | 5 € | 10 € |
| KI (Kunden, Mischung) | 0 € | 15 € | 75 € | 300 € |
| Stripe | 0 € | 25 € | 125 € | 500 € |
| Steuerberatung | 50 € | 80 € | 120 € | 200 € |
| **Summe** | **≈ 65 €** | **≈ 135 €** | **≈ 370 €** | **≈ 1.120 €** |
| MRR (Ø 130 €) | 0 € | 1.300 € | 6.500 € | 26.000 € |

Erfasste Ausgaben (manuell oder automatisch für KI) fließen in `/admin/finanzen` ein.
