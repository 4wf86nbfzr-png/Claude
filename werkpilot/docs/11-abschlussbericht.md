# Abschlussbericht: Clairify, Marktreife-Runde Oktober 2026

Kurzfassung des Berichts, der auch als Claude-Dokument vorliegt. Zahlen stammen aus Läufen auf dem
Entwicklungssystem (Container, Chromium headless); sie sind Vergleichswerte, keine Produktionsmessung.

## Vorgefunden
Funktionsfähiges Produkt (FastAPI, Postgres, Redis, Next.js), 70 Backend-Tests, Prüflauf mit 35 Prüfungen.
Simuliert war nichts im Produkt; regelbasiert und als solche zu kennzeichnen waren Demo und Website-Assistent.
Mehrere Website-Aussagen waren nicht belegt (EU-Hosting, Löschfristen nach Kündigung, Antwortzeiten).
Details: `docs/10-ist-analyse-und-aufgaben.md`.

## Umgesetzt
Hero und Handlungsaufrufe nach Vorgabe; Zusagen an die Serverkonfiguration gebunden; Tarifvergleich und
zentrale Tarifdaten mit automatischem Abgleich; ehrlicher Abrechnungshinweis in Registrierung und Preisen;
Demo je Gewerk mit sichtbarer Kennzeichnung „regelbasiert"; WebP/srcset, Poster, verzögertes three.js,
keine vergeblichen Sitzungsabfragen; Canonical-URLs; Kontrast und Überschriften; `.env.example` vollständig;
acht Browserabläufe, Linkprüfung und axe im Prüflauf; Dokumentation (02, 03, 10, 11).

## Messwerte (Lighthouse 12.8, Startseite, lokaler Build)

| | vorher | nachher |
|---|---|---|
| Desktop Performance / A11y / Best Practices / SEO | 73 / 97 / 96 / 100 | 100 / 100 / 100 / 100 |
| Desktop LCP / TBT / Gesamtgewicht | 0,8 s / 710 ms / 4,9 MB | 0,6 s / 0 ms / 3,9 MB |
| Mobil Performance / A11y / Best Practices / SEO | 56 / 97 / 96 / 100 | 94 / 100 / 100 / 100 |
| Mobil LCP / TBT / CLS / Gesamtgewicht | 4,1 s / 5.250 ms / 0 / 3,0 MB | 3,0 s / 70 ms / 0,02 / 2,4 MB |

Das verbleibende Gewicht ist das Hintergrundvideo (WebM 1080p 3,5 MB bzw. 720p 2 MB); es lädt mit
`preload=metadata` und bei Datensparmodus oder 2G/3G in der kleinsten Fassung.

Bilder: 3.480 KiB PNG/JPG-Quellen, WebP-Fassungen 1.640 KiB (beide Breiten zusammen); je Seite werden
nur die passenden Breiten geladen.

## Barrierefreiheit (axe-core 4.10, WCAG 2.1 AA + Best Practice)
Vorher 5 schwere Verstöße (Kontrast) und Überschriftenreihenfolge auf 13 öffentlichen Seiten; nachher 0.
Tastatur: erster Tab-Stopp ist der Sprunglink; Fokus bleibt sichtbar. Reduzierte Bewegung wird auf der
Startseite respektiert (Standbild statt Video, keine Kamerafahrten).

## Tests
- `./test-all.sh` (siehe unten, Ergebnis des letzten Laufs).
- Acht Browserabläufe: Startseite/Anker/Video, Demo je Gewerk, Registrierung bis Abmelden, Passwort-Reset,
  geschützte Bereiche, Mandantentrennung per API, Export/CSV/Löschung, Mobil 390 px ohne Querscrollen + Tastatur.
- Nicht ausführbar hier: echter KI-Anbieter, echter Mailversand, Stripe-Checkout (keine Schlüssel, bewusst
  nicht erfunden), Docker-Compose-Start (kein Docker-Daemon im Container; `docker compose config` validiert).

## Ergebnis des letzten vollständigen Prüflaufs
`PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium ./test-all.sh` am 13.10.2026: **39 von 39 Prüfungen bestanden**
(ruff, 70 Backend-Tests, Alembic up/check/down, pip-audit, ESLint, Next-Build, npm audit, 21 Seiten/Endpunkte,
API-Kundenreise, Worker-Lauf, Playwright-Durchlauf, Tarifdaten-Abgleich, acht Kernabläufe, Linkprüfung, axe).
Der erste Lauf davor hatte 38/39: der neue Demo-Ablauf überschritt mit vier Gewerken das Demo-Limit von fünf
Aufrufen je Minute (ein Aufruf kommt aus dem bestehenden Durchlauf); der Ablauf prüft jetzt drei Gewerke.

## Nachtrag: Redesign nach Designreferenz (Oktober 2026)

Website (Startseite, alle Marketingseiten, Einzeldatei-Vorschau) auf die monochrome Referenz umgestellt:
tiefes Schwarz, Reinweiß und helles Grau, Anton als kondensierte Versal-Display-Schrift, Inter als feine
Grundschrift, runde Outline-Knöpfe, Headline über dem Hero-Banner, übergroße zentrierte Typografie mit der
3D-Szene im Mittelteil, zweizeilige Sektionsheadline mit Kartenraster. Inhalte, Links, Formulare, Scroll-Effekte
und Logik unverändert (Linkprüfung 15 Seiten ok, acht Browserabläufe ok, axe 0 schwere Verstöße auf 13 Seiten).
Lighthouse Startseite: Desktop 100 / 100 / 100 / 100, Mobil 90 Performance (LCP 3,6 s durch Video und Schriften).
Behobener Nebenbefund: der Story-Pin rechnete nach dem spät erzeugten Pin der isometrischen Reise mit veralteten
Positionen; jetzt wird sortiert und neu gemessen. Details in `docs/02-architektur.md`.
