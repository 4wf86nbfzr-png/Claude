# Phase 1 – Marktvalidierung

Stand Oktober 2026. Diese Analyse beruht auf allgemein bekannten Strukturdaten des deutschen
Handwerks und auf Produktrecherche; **keine der Zahlen ersetzt Gespräche mit echten Betrieben.**
Der Abschnitt „Zu validierende Annahmen“ ist der wichtigste Teil.

## Zielgruppe

Rund 1 Million Handwerksbetriebe in Deutschland, der Großteil mit weniger als 10 Beschäftigten.
Typisch: Inhaber/in arbeitet selbst mit, Büro ist eine halbe Stelle oder die Partnerin/der
Partner abends. Anfragen kommen per Telefon, E-Mail, Website-Formular und zunehmend WhatsApp.

Beobachtete Schmerzpunkte (aus Branchenberichten, Foren, Erfahrungsberichten, nicht aus eigenen
Interviews):

- Anfragen bleiben tagelang unbeantwortet, Kunden rufen anderswo an → verlorener Umsatz.
- Angebote werden geschrieben und nie nachgefasst.
- Terminabsprachen brauchen drei E-Mails oder zwei Telefonate.
- Abends 45–90 Minuten Büro, das niemand bezahlt.

## Wettbewerb (Auswahl)

| Kategorie | Beispiele | Was sie gut machen | Lücke, die WerkPilot schließt |
|---|---|---|---|
| Handwerker-Software (Angebot/Rechnung/Zeiterfassung) | Craftnote, openHandwerk, HERO, Plancraft, TopKontor | Auftrag bis Rechnung, Baustellendoku | Kein KI-Posteingang; Anfragebearbeitung bleibt manuell |
| Allgemeine CRM/Helpdesk | HubSpot, Zoho, Pipedrive | Mächtig, Automationen | Zu komplex, englischsprachig gedacht, keine Handwerkslogik (Notfall, Vor-Ort-Termin) |
| KI-Telefonassistenten | fonio.ai, Vitas, Parloa (Enterprise) | Anrufannahme | Nur Telefon, kein Workflow danach; Preisgestaltung meist pro Minute |
| Terminbuchung | Calendly, Timify | Self-Service-Buchung | Kunden im Handwerk beschreiben erst das Problem, dann kommt der Termin |
| Agenturen/Freelancer mit „KI-Automatisierung“ | Make/n8n/Zapier-Setups | Individuell | Teuer in Einrichtung und Wartung, keine Produktgarantie |

Keine der verbreiteten Handwerker-Softwares bietet aktuell einen KI-Posteingang mit
Antwortentwürfen, Rückfragelogik und Angebotsnachfass als eigenständiges, günstiges Produkt.
Das ist eine Chance, aber auch ein Risiko: Die großen Anbieter könnten es als Feature nachrüsten.

## Gewählte Untergruppe (Beachhead)

**SHK- und Elektrobetriebe mit 2–15 Mitarbeitenden**, die bereits Anfragen per E-Mail oder
Website bekommen (also eine Website und eine Büroadresse haben).

Begründung:
- Hoher Anteil dringender Anfragen (Heizung aus, Stromausfall) → Priorisierung hat sichtbaren Wert.
- Angebotsvolumen pro Auftrag hoch (Badsanierung, Wärmepumpe, Zählerschrank) → ein nachgefasstes
  Angebot zahlt ein Jahr WerkPilot.
- Betriebe dieser Größe haben Budget (79–249 €/Monat sind unter einer Monteurstunde pro Woche).
- Einzelbetriebe ohne Website und Großbetriebe mit Büroteam sind bewusst zweite Welle.

## Differenziertes Kernangebot

„Der KI-Posteingang für Ihren Betrieb: Jede Anfrage sortiert, beantwortet und nachgefasst,
ohne dass Sie abends ins Büro müssen.“

1. Ein Posteingang für alle Kanäle (E-Mail-Weiterleitung, Website-Formular, Telefon-Notiz).
2. Notfälle oben, Spam weg, Zusammenfassung in zwei Sätzen.
3. Antwortentwurf mit Rückfragen und Terminvorschlägen, Freigabe mit einem Klick.
4. Offene Angebote werden nachgefasst.
5. Wochenbericht: Reaktionszeit, offene Vorgänge, Termine.

Nicht im Angebot (bewusst): Rechnungsstellung, Zeiterfassung, Baustellendoku. Dafür gibt es
etablierte Werkzeuge; WerkPilot integriert sich per Webhook/Export statt zu konkurrieren.

## Kosten- und Umsatzplan (Hypothese)

### Fixkosten pro Monat (Betrieb mit < 50 Kunden)

| Posten | Betrag | Anmerkung |
|---|---|---|
| Hosting (1 VPS 4 GB, Postgres, Backups) | 10–25 € | z. B. Hetzner CX22/CX32 |
| Domain, DNS, TLS | 1–2 € | Let's Encrypt kostenlos |
| E-Mail-Versand (Resend o. ä.) | 0–20 € | Free-Tier reicht anfangs |
| Monitoring/Uptime | 0–10 € | Uptime-Kuma selbst gehostet oder Free-Tier |
| KI (variabel, gedeckelt) | 0,5–3 € je Kunde | siehe docs/05-kosten.md |
| Stripe | 1,5 % + 0,25 € je Zahlung (EU-Karten) / 2,9 % + 0,25 € (Nicht-EU) | nur bei Umsatz |
| Buchhaltung/Steuerberatung | 50–150 € | nicht automatisierbar |
| **Summe fix** | **≈ 70–200 €** | ohne eigene Arbeitszeit |

### Umsatzszenarien (MRR)

| Szenario | Kunden | Ø Preis | MRR | Deckung |
|---|---|---|---|---|
| Break-even Fixkosten | 2–3 | 120 € | 240–360 € | Fixkosten gedeckt |
| Nebenerwerb | 15 | 120 € | 1.800 € | ca. 1.500 € Marge |
| Haupterwerb | 60 | 130 € | 7.800 € | ca. 7.000 € Marge, Support wird spürbar |
| Skaliert | 250 | 140 € | 35.000 € | zweite Person für Support/Vertrieb nötig |

Annahme Konversion: 100 Website-Besucher → 5 Registrierungen → 1–2 zahlende Kunden.
Annahme Churn: 3–5 % pro Monat in den ersten 12 Monaten.

## Zu validierende Annahmen (mit echten Kunden)

| # | Annahme | Wie prüfen | Entscheidung |
|---|---|---|---|
| A1 | Betriebe wollen Entwürfe prüfen, nicht vollautomatisch senden | 10 Gespräche, Beobachtung in der Testphase (Freigabequote) | Wenn > 80 % ungeändert freigegeben: Auto-Antwort prominenter |
| A2 | 79/149/249 € werden als fair empfunden | Preisseite A/B, Abbruchquote im Checkout, direkte Frage | Preise sind Platzhalter, nicht Verpflichtung |
| A3 | E-Mail-Weiterleitung ist eine akzeptable Einrichtungsschwelle | Anteil der Testkonten, die eine Integration aktivieren | Sonst: IMAP-Abruf oder Mail-Alias anbieten |
| A4 | Terminvorschläge aus Geschäftszeiten reichen ohne Kalenderanbindung | Quote bestätigter Vorschläge | Sonst Google-Kalender als Pflicht in Onboarding |
| A5 | Angebotsnachfass bringt messbar Aufträge | Gewonnen-Quote nach Nachfass vs. ohne | Wichtigstes Verkaufsargument, braucht Zahlen |
| A6 | KI-Kosten bleiben unter 3 € je Kunde und Monat | ai_usage je Mandant | Sonst Tarifgrenzen anpassen |
| A7 | Inbound (SEO, Empfehlungen, Innungen, Partner) reicht als Kanal | Registrierungen je Quelle | Sonst Partnerprogramm mit Steuerberatern/Softwarehäusern |
| A8 | Betriebe akzeptieren KI-Verarbeitung ihrer Kundenmails datenschutzrechtlich | Fragen im Gespräch, AVV-Akzeptanzquote | EU-Hosting des KI-Anbieters ggf. Pflicht |

Erste konkrete Schritte: 10 Betriebe aus dem eigenen Umfeld (Innung, Bekannte, lokale
Elektro-/SHK-Betriebe) in die kostenlose Testphase holen, wöchentlich 20 Minuten Feedback,
Preise erst nach dem fünften zahlenden Kunden festschreiben.
