# HST PLANER

**Disposition & Einsatzsteuerung für das HERM Service Team**

Der HST Planer bildet die operative Arbeit einer Sicherheits-, Ordnungsdienst-, Event-,
Service-, Logistik- und Personaldienstleistungs-Disposition ab: von der eingehenden
Anfrage über die Personalplanung bis zum Abgleich der tatsächlich geleisteten Zeiten.

Er ist eine eigenständige Anwendung und liegt bewusst neben der Website
(`../index.html` usw.) im Unterordner `hst-planer/` – die Website bleibt eine statische
Seite ohne Build-Schritt, der Planer bringt Datenbank, Anmeldung und API mit.

---

## Inhalt

1. [Was der Planer kann](#was-der-planer-kann)
2. [Voraussetzungen](#voraussetzungen)
3. [Installation](#installation)
4. [Umgebungsvariablen](#umgebungsvariablen)
5. [Datenbank & Migrationen](#datenbank--migrationen)
6. [Testdaten](#testdaten)
7. [Entwicklung](#entwicklung)
8. [Tests](#tests)
9. [Produktivbetrieb](#produktivbetrieb)
10. [Deployment mit Docker](#deployment-mit-docker)
11. [Wiederkehrende Aufgaben (Cron)](#wiederkehrende-aufgaben-cron)
12. [Website anbinden](#website-anbinden)
13. [E-Mail-Anbindung](#e-mail-anbindung)
14. [REST-API](#rest-api)
15. [Webhooks](#webhooks)
16. [Rollen und Rechte](#rollen-und-rechte)
17. [Der Abgleich im Detail](#der-abgleich-im-detail)
18. [Architektur](#architektur)
19. [Datenschutz & Sicherheit](#datenschutz--sicherheit)
20. [Backups](#backups)
21. [Compliance-Zentrale](#compliance-zentrale)
22. [Was noch offen ist](#was-noch-offen-ist)

---

## Was der Planer kann

| Bereich | Funktion |
|---|---|
| **Dashboard** | Die Lage des Tages in sechs Zahlen, dazu die Tagesdisposition als Zeitstreifen |
| **Disposition** | Leitstelle: Tagesplanung als Zeitachse mit Ziehen und Ablegen, Wochenplanung, offene Positionen, unbesetzte Schichten, Mitarbeiterzuordnung |
| **Kalender** | Tag, Woche, Monat; Filter nach Kunde, Bereich, Status, Mitarbeiter |
| **Personal** | Mitarbeiter, Bewerber, Mitarbeiterakten mit sieben Reitern, Qualifikationen, Dokumente, Verfügbarkeiten, Schulungen |
| **Einsätze** | Veranstaltungen, Objekte, Kunden, Einsatzorte, Teamleiter, Einsatzhistorie |
| **Zeiterfassung** | Stundenzettel, Arbeitszeiten je Monat, Korrekturen aus dem Protokoll, Freigaben |
| **Partner** | Subunternehmer, Partnerunternehmen, Partner-Mitarbeiter, Partner-Einsätze |
| **Kommunikation** | Nachrichten, E-Mail-Eingänge, WhatsApp, interne Kommunikation |
| **Compliance** | Verarbeitungsverzeichnis, TOM, Auftragsverarbeiter, Löschfristen, Audit-Log, Datenschutzvorfälle, DSFA, Dokumentation, Sicherheitscheck |
| **Administration** | Benutzer, Rollen, Rechtematrix, Systemeinstellungen, Schnittstellen, Protokolle |
| **Anfragen** | Website-Formular, E-Mail-Parser, telefonische Erfassung; Übernahme in ein Event |
| **Abgleiche** | Excel-/CSV-Import, automatische Zuordnung, manuelle Korrektur, Abschluss |
| **Auswertungen** | Besetzungsquote, Ausfälle, Monatsvergleich, Bereiche, Kunden |
| **Finanzen** | Erlös-, Kosten- und Margenschätzung aus hinterlegten Stundensätzen |
| **Mitarbeiter-App** | Mobile Ansicht: heutige Einsätze, annehmen/ablehnen, Verfügbarkeit melden, eigene Stunden ansehen, Nachweise hochladen |

---

## Voraussetzungen

* **Node.js 20 oder neuer** (entwickelt und getestet mit Node 22)
* **PostgreSQL 14 oder neuer** (entwickelt mit PostgreSQL 16)
* Optional: Docker und Docker Compose für den Betrieb
* Optional: ein IMAP-Postfach für die automatische Anfrageerkennung
* Optional: ein SMTP-Zugang für ausgehende Nachrichten

Der Planer braucht **keinen** Redis, keine Suchmaschine und keinen Objektspeicher.

---

## Installation

```bash
cd hst-planer
npm install
cp .env.example .env
```

Danach in der `.env` mindestens `DATABASE_URL` und `AUTH_SECRET` setzen:

```bash
# Ein sicheres Geheimnis erzeugen:
openssl rand -base64 48
```

Datenbank anlegen und Schema einspielen:

```bash
npx prisma migrate deploy   # im Produktivbetrieb
# oder für die Entwicklung:
npx prisma migrate dev
```

Testumgebung befüllen (siehe [Testdaten](#testdaten)):

```bash
npm run seed
```

Starten:

```bash
npm run dev          # Entwicklung, http://localhost:3000
# oder
npm run build && npm start
```

---

## Umgebungsvariablen

Alle Geheimnisse stehen ausschließlich in der `.env`. **Niemals** Zugangsdaten in den
Quellcode schreiben – die `.env` ist über `.gitignore` ausgenommen.

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `DATABASE_URL` | ja | PostgreSQL-Verbindung, z. B. `postgresql://hst:…@localhost:5432/hstplaner` |
| `AUTH_SECRET` | ja | Mindestens 32 Zeichen. Signiert die Sitzungs-Cookies. |
| `APP_URL` | empfohlen | Basis-URL. Beginnt sie mit `https://`, wird das Cookie als `secure` gesetzt. |
| `PUBLIC_API_ORIGINS` | empfohlen | Kommagetrennte Liste erlaubter Origins für `/api/public/request` |
| `PUBLIC_REQUEST_LIMIT` | nein | Anfragen je IP und Stunde über die öffentliche API (Vorgabe 5) |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD` | nein | IMAP-Postfach für eingehende Anfragen |
| `EMAIL_MAILBOX`, `EMAIL_PROCESSED_MAILBOX` | nein | Zu prüfender Ordner und Ablageordner nach der Verarbeitung |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | nein | Ausgehende E-Mails |
| `DISPO_NOTIFY_EMAIL` | nein | Sammeladresse der Disposition |
| `STORAGE_PATH` | nein | Ablage für hochgeladene Dateien (Vorgabe `./storage`) |
| `MAX_UPLOAD_MB` | nein | Größtmögliche Uploadgröße (Vorgabe 20) |
| `API_SECRET` | nein | Reserviert für zusätzliche Signaturen |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | nein | Optionale KI-Unterstützung beim E-Mail-Parsen |
| `SEED_PASSWORD` | nein | Startpasswort der Testbenutzer (Vorgabe `Hafencity!2026`) |

Ohne `ANTHROPIC_API_KEY` arbeitet der E-Mail-Parser rein regelbasiert weiter – die KI ist
eine Zugabe, keine Voraussetzung.

---

## Datenbank & Migrationen

Das Schema liegt in `prisma/schema.prisma`, die Migrationen in `prisma/migrations/`.

```bash
npx prisma migrate dev --name beschreibung   # Schema ändern (Entwicklung)
npx prisma migrate deploy                    # Migrationen im Betrieb anwenden
npx prisma studio                            # Daten ansehen
npm run prisma:generate                      # Client nach Schemaänderung neu erzeugen
```

Grundsätze im Datenmodell:

* **Soft Delete:** Wichtige Datensätze bekommen `deletedAt` statt gelöscht zu werden.
* **Change History:** `createdAt` / `updatedAt` / `createdById` / `updatedById` überall dort,
  wo nachvollziehbar sein muss, wer etwas geändert hat.
* **Zeiten:** Datumsangaben in UTC ohne Zeitanteil, Uhrzeiten als `"HH:MM"`. Das ist der
  Grund, warum Nachtschichten (18:00 → 02:00) sauber als 8 Stunden gerechnet werden.

---

## Testdaten

```bash
npm run seed
```

Erzeugt eine vollständige Testumgebung: 9 Benutzer (einer je Rolle), 10 Mitarbeiter,
3 Kunden, 1 Partner, 5 Events mit Positionen und Zuweisungen, 2 offene Anfragen,
Importvorlagen sowie unter `beispiele/` einen Beispiel-Stundenzettel
(`.xlsx` und `.csv`), mit dem sich der Abgleich sofort ausprobieren lässt.

Startpasswort für alle Testbenutzer: `Hafencity!2026` (bzw. `SEED_PASSWORD`).
Alle Konten sind auf „Passwort bei erster Anmeldung ändern“ gesetzt.

| Rolle | Anmeldung |
|---|---|
| Administration | `admin@hermserviceteam.com` |
| Geschäftsführung | `gf@hermserviceteam.com` |
| Disposition | `dispo@hermserviceteam.com` |
| Einsatzleitung | `einsatzleitung@hermserviceteam.com` |
| Teamleitung | `teamleitung@hermserviceteam.com` |
| Mitarbeiter | `max.mustermann@example.org` |
| Partner | `partner@elbwacht-demo.de` |
| Kunde | `kunde@hafenlicht-demo.de` |

> **Der Seed leert die Datenbank.** Niemals gegen eine Produktivdatenbank laufen lassen.

---

## Entwicklung

```bash
npm run dev          # Entwicklungsserver
npm run typecheck    # TypeScript prüfen
npm run lint         # Linter
npm test             # Testsuite
```

Aufbau des Quellcodes:

```
src/
  app/
    (app)/            Angemeldeter Bereich, gemeinsames Gerüst mit Navigation
    anmelden/         Anmeldeseite
    api/              REST-API, Exporte, Dateiausgabe, Jobs
  components/         Wiederverwendbare Bausteine (UI, Formulare, Navigation)
  lib/
    auth/             Passwörter, Sitzungen, Rollen, API-Schlüssel
    domain/           Fachlogik: Events, Zuweisungen, Mitarbeiter, Abgleich …
    email/            Parser, Postfachabruf, Versand, optionale KI
    import/           Spaltenerkennung, XLSX-/CSV-Leser
    queries/          Datenbankabfragen für Dashboard, Statistik, Sichtbarkeit
    reconcile/        Abgleich-Algorithmus (ohne Datenbankzugriff, daher gut testbar)
    export/           Excel- und CSV-Ausgabe
prisma/               Schema, Migrationen, Seed
scripts/              Postfachabruf, tägliche Aufgaben, Rauchtest
tests/                Testsuite
```

**Fachlogik steht nie in einer Seite.** Seiten laden Daten und stellen sie dar;
was etwas verändert, liegt in `src/lib/domain/` und wird von Server-Aktionen
und der API gleichermaßen benutzt.

---

## Tests

```bash
npm test                          # alles
npx vitest run tests/time.test.ts  # einzelne Datei
```

Die Suite deckt ab:

* **Zeitberechnung** – Nachtschichten, Pausen, Tageswechsel, deutsche Datumsformate
* **Namensabgleich** – gedrehte Namen, Tippfehler, Umlaute, Mehrdeutigkeit
* **Spaltenerkennung und Dateileser** – XLSX, CSV, Sonderfälle
* **E-Mail-Parser** – Freitext, Formularmails, unvollständige Angaben
* **Abgleich-Algorithmus** – alle 17 Fälle aus der Anforderung
* **Abgleich-Durchlauf** – Datei hochladen bis Zeiten schreiben, gegen die echte Datenbank
* **Disposition** – Eventanlage, Positionen, Zuweisung, Konflikte, Duplizieren, Serien
* **Rechte** – Rollen, Navigation, Sichtbarkeitsgrenzen
* **Sicherheit** – Passwort-Hashing, API-Schlüssel, Webhook-Signaturen
* **API** – Anmeldung, Rechte, öffentliche Anfrage-Schnittstelle, Exporte

Die Datenbanktests laufen gegen die in `.env` konfigurierte Datenbank und räumen
hinter sich auf. Für eine eigene Testdatenbank `DATABASE_URL` vor dem Aufruf setzen.

Die API-Tests brauchen einen laufenden Server:

```bash
npm run build
bash scripts/server-start.sh 3100
npm test
```

Ohne erreichbaren Server werden sie übersprungen statt fehlzuschlagen.

Zusätzlich gibt es einen Rauchtest, der sich anmeldet und alle Hauptseiten abruft:

```bash
npx tsx scripts/pruefe-seiten.ts http://localhost:3100 dispo@hermserviceteam.com
```

---

## Produktivbetrieb

```bash
npm ci --omit=dev
npx prisma migrate deploy
npm run build
npm start                 # oder: node .next/standalone/server.js
```

Checkliste vor dem ersten Start:

- [ ] `AUTH_SECRET` gesetzt und mindestens 32 Zeichen lang
- [ ] `APP_URL` auf die `https://`-Adresse gesetzt (sonst ist das Cookie nicht `secure`)
- [ ] `PUBLIC_API_ORIGINS` auf die echte Website eingeschränkt
- [ ] `STORAGE_PATH` zeigt auf ein Verzeichnis **außerhalb** des Web-Roots
- [ ] Reverse Proxy terminiert TLS und reicht `X-Forwarded-For` durch
- [ ] Startpasswörter der Seed-Benutzer geändert oder die Konten entfernt
- [ ] Cron-Einträge für Postfach und tägliche Aufgaben eingerichtet
- [ ] Datenbank-Backup eingerichtet

---

## Deployment mit Docker

```bash
docker compose up -d --build
docker compose run --rm werkzeuge npx prisma migrate deploy
docker compose run --rm werkzeuge npm run seed      # nur für eine Testumgebung
```

`docker-compose.yml` startet PostgreSQL und den Planer. Die Dateiablage liegt im
Volume `hst-storage`, die Datenbank in `hst-db`. Beide gehören ins Backup.

Der Dienst **`planer`** enthält bewusst nur die Laufzeit – kein Prisma-CLI, kein `tsx`.
Migrationen, Seed, Postfachabruf und die täglichen Aufgaben laufen über den Dienst
**`werkzeuge`**, der nur auf Zuruf startet:

```bash
docker compose run --rm werkzeuge npm run mail:poll
docker compose run --rm werkzeuge npm run jobs:daily
```

Das Abbild enthält keine `.env` (siehe `.dockerignore`); alle Werte kommen zur Laufzeit
aus der Umgebung. Wer ohne Docker baut, sollte darauf achten: Next.js kopiert eine
vorhandene `.env` in die Standalone-Ausgabe.

Die Datenbank ist nicht nach außen veröffentlicht. Für einen Zugriff von außen (etwa
mit `psql` oder für Tests) in `docker-compose.yml` beim Dienst `datenbank` vorübergehend
`ports: ["5432:5432"]` ergänzen.

Für einen eigenen Server ohne Compose:

```bash
docker build -t hst-planer .
docker run -d --name hst-planer -p 3000:3000 \
  --env-file .env \
  -v /srv/hst-planer/storage:/app/storage \
  hst-planer
```

---

## Wiederkehrende Aufgaben (Cron)

```cron
# Postfach alle fünf Minuten abrufen
*/5 * * * * cd /srv/hst-planer && npm run mail:poll >> /var/log/hst-mail.log 2>&1

# Tägliche Aufgaben: Nachweise, Erinnerungen, Aufräumen
0 6 * * * cd /srv/hst-planer && npm run jobs:daily >> /var/log/hst-jobs.log 2>&1
```

Die täglichen Aufgaben melden ablaufende Nachweise, erinnern Mitarbeiter an Einsätze
am Folgetag, weisen auf unterbesetzte Events hin, ziehen Eventstatus nach und räumen
abgelaufene Sitzungen sowie den Dateipapierkorb auf. Mehrfache Läufe am selben Tag
erzeugen keine doppelten Benachrichtigungen.

Wer lieber einen externen Scheduler nutzt, kann stattdessen die Routen aufrufen –
beide brauchen einen API-Schlüssel mit dem Bereich `jobs`:

```bash
curl -X POST -H "x-api-key: hst_…" https://planer.example/api/jobs/postfach
curl -X POST -H "x-api-key: hst_…" https://planer.example/api/jobs/taeglich
```

---

## Website anbinden

Das Anfrageformular auf `hermserviceteam.com` kann direkt in den Planer schreiben.

**1. Origin freigeben** (`.env` des Planers):

```
PUBLIC_API_ORIGINS="https://hermserviceteam.com,https://www.hermserviceteam.com"
```

**2. Formular abschicken:**

```js
await fetch('https://planer.hermserviceteam.com/api/public/request', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    company: 'Beispiel GmbH',
    contactPerson: 'Marie Ahrens',
    email: 'm.ahrens@beispiel.de',
    phone: '040 123456',
    eventName: 'Firmenjubiläum',
    eventDate: '2026-10-15',      // YYYY-MM-DD
    startTime: '17:00',
    endTime: '01:00',
    location: 'Hamburg, Fischauktionshalle',
    employeesNeeded: 12,
    serviceType: 'SICHERHEIT',    // oder GASTRO, PROMOTION, LOGISTIK, FAHRSERVICE, REINIGUNG
    message: 'Freitext aus dem Formular',
    website: '',                  // Honigtopf: muss leer bleiben
  }),
});
```

**Antwort:**

```json
{
  "status": "ok",
  "anfrageNummer": "AN-2026-0007",
  "hinweis": "Ihre Anfrage ist eingegangen und wird von unserer Disposition geprüft…",
  "fehlendeAngaben": ["Endzeit"]
}
```

**3. Oder fertiges Widget einbinden** – falls kein eigenes Formular gebaut werden soll:

```html
<div data-hst-anfrage data-hst-url="https://planer.hermserviceteam.com"></div>
<script src="https://planer.hermserviceteam.com/anfrage-widget.js" defer></script>
```

Das Widget erzeugt schlichtes, semantisches HTML mit den Klassen `feld` und `knopf` –
es übernimmt damit das Aussehen der Website, statt eigenes Design mitzubringen. Mit
`data-hst-klassen="meinFeld|meinKnopf"` lassen sich andere Klassen setzen. Es lädt
nichts nach, setzt keine Cookies und protokolliert nichts.

Schutzmaßnahmen: Herkunftsprüfung, Begrenzung je IP, unsichtbares Honigtopf-Feld
(`website`) – dieselbe Technik, die die Website bereits verwendet.

**Wichtig:** Eine eingehende Anfrage ist nie eine Buchung. Sie erscheint als
*„Neue Anfrage – Prüfung erforderlich“* und muss von der Disposition bestätigt werden.

---

## E-Mail-Anbindung

Geht eine Personalanfrage an `info@hermserviceteam.com`, holt der Planer sie per IMAP ab:

```
E-Mail kommt an
  → Rohnachricht wird gespeichert (auch wenn danach etwas schiefgeht)
  → regelbasierter Parser liest Kunde, Datum, Zeiten, Ort, Anzahl, Leistungsart
  → optionale KI ergänzt nur Felder, die leer geblieben sind
  → Anfrage mit Konfidenz und Liste fehlender Angaben wird angelegt
  → Disposition bekommt „Neue Personalanfrage – Prüfung erforderlich“
```

Der Parser versteht auch unstrukturierten Text:

> „für den 15.10. benötigen wir für eine Veranstaltung in Hamburg 12 Sicherheitskräfte
> von 17 bis 01 Uhr. Treffpunkt ist 16:30 Uhr.“

→ Datum 15.10., 12 Kräfte, Bereich Sicherheit, 17:00–01:00, Treffzeit 16:30, Ort Hamburg.

Was er nicht sicher erkennt, bleibt leer und wird als fehlende Angabe gemeldet –
geraten wird nicht. Die KI darf vorhandene Werte niemals überschreiben und ihre
Ergänzungen sind in der Anfrage als solche erkennbar.

Manuell abrufen: `npm run mail:poll`

---

## REST-API

Alle Routen liefern JSON. Es gibt zwei Wege der Anmeldung:

* **Sitzung** – `POST /api/auth/login` setzt ein Cookie (auch für Skripte)
* **API-Schlüssel** – Header `Authorization: Bearer hst_…` oder `x-api-key: hst_…`

Schlüssel werden unter *Admin → API-Schlüssel* erzeugt und genau einmal angezeigt.

| Route | Methode | Beschreibung |
|---|---|---|
| `/api/auth/login` | POST | Anmelden, setzt das Sitzungs-Cookie |
| `/api/auth/logout` | POST | Abmelden |
| `/api/auth/session` | GET | Eigene Rolle, Sichtbarkeit und erlaubte Navigation |
| `/api/events` | GET | Events mit Besetzungsgrad (`von`, `bis`, `status`, `kunde`) |
| `/api/employees` | GET | Mitarbeiter mit Qualifikationen (`q`, `aktiv`) |
| `/api/shifts` | GET | Einteilungen (`mitarbeiter`, `event`, `von`, `bis`, `status`) |
| `/api/customers` | GET | Kunden mit Ansprechpartnern |
| `/api/partners` | GET | Partner mit Anzahl der Kräfte |
| `/api/requests` | GET | Anfragen (`status`) |
| `/api/timesheets` | GET | Zeiteinträge mit Summe (`von`, `bis`, `status`, `event`) |
| `/api/reconciliation` | GET | Abgleiche mit Kennzahlen |
| `/api/notifications` | GET / POST | Eigene Benachrichtigungen lesen bzw. als gelesen markieren |
| `/api/public/request` | POST | **Öffentlich** – Anfrage von der Website |
| `/api/dokumente/:id` | GET | Datei nach Rechteprüfung, mit Protokolleintrag |
| `/api/export/events` | GET | Events als XLSX (`?format=csv` für CSV) |
| `/api/export/mitarbeiter` | GET | Mitarbeiterliste |
| `/api/export/zeiten` | GET | Stundennachweis (`von`, `bis`, `status`, `event`) |
| `/api/export/einsatzplanung` | GET | Einsatzplanung je Mitarbeiter (`von`, `bis`) |
| `/api/export/abgleich/:id` | GET | Abgleich mit Soll/Ist und Befunden |
| `/api/jobs/postfach` | POST | Postfach abrufen (Schlüsselbereich `jobs`) |
| `/api/jobs/taeglich` | POST | Aufräumarbeiten (Schlüsselbereich `jobs`) |

Listen sind seitenweise (`?seite=2&proSeite=50`) und geben `seite`, `proSeite` und
`gesamt` zurück. Rollengrenzen gelten auch in der API: Ein Mitarbeiter bekommt auf
`/api/events` eine 403.

---

## Webhooks

Unter *Admin → Webhooks* lassen sich Ziele für folgende Ereignisse eintragen:

`request.created`, `event.created`, `event.updated`, `assignment.created`,
`assignment.confirmed`, `assignment.declined`, `reconciliation.closed`

Jede Zustellung ist signiert:

```
x-hst-event:     assignment.confirmed
x-hst-timestamp: 1760000000
x-hst-signature: <HMAC-SHA256 über "<timestamp>.<rumpf>">
```

Prüfung beim Empfänger:

```js
const erwartet = crypto.createHmac('sha256', GEHEIMNIS)
  .update(`${req.headers['x-hst-timestamp']}.${rohRumpf}`)
  .digest('hex');
```

Zustellungen werden protokolliert und sind im Admin-Bereich einsehbar. Ein nicht
erreichbarer Empfänger bremst die Disposition nicht aus.

---

## Rollen und Rechte

Standard ist **DENY ALL**: eine Rolle kann nur das, was in `src/lib/auth/rbac.ts`
ausdrücklich aufgezählt ist. Es gibt keine Vererbung und keinen Platzhalter – die einzige
Ausnahme ist SUPERADMIN, und die steht als eigener Zweig in `can()`, damit sie beim Lesen
nicht zu übersehen ist.

| Rolle | Sieht | Aufgabe |
|---|---|---|
| **Superadmin** | alles | Technischer Vollzugriff einschließlich Benutzerverwaltung und Protokollen. Nur für wenige benannte Personen. |
| **Geschäftsführung** | alles | Betrieb, Auswertungen, Finanzen, Compliance-Zentrale. Keine Benutzerverwaltung. |
| **Personal** | alles | Personalakten, Bewerber, Qualifikationen, Schulungen, Dokumente. Kein Zugriff auf die Disposition. |
| **Disposition** | alles | Einsätze, Objekte, Zuordnung, Zeiterfassung, Kunden, Partner. Sieht keine Personalakten. |
| **Einsatzleitung** | eigene Einsätze | Führt Einsätze vor Ort, pflegt Zeiten nach. |
| **Teamleitung** | eigene Einsätze | Sieht zum eigenen Einsatz Name, Funktion, Zeit, Ort, nötige Qualifikation. |
| **Mitarbeiter** | nur eigene Einsätze | Annehmen/ablehnen, Verfügbarkeit melden, eigene Stunden und Dokumente. |
| **Kunde** | eigene Aufträge | Eigene Anfragen und freigegebene Unterlagen. |
| **Subunternehmer** | Einsätze mit eigenen Kräften | Zeiten nachpflegen, gemeldete Kräfte einsehen. |

Die vollständige Matrix – jedes Recht über jede Rolle – steht unter
`/admin/berechtigungen` und wird aus derselben Quelle erzeugt, die auch die Prüfung macht.
Sie kann deshalb nicht davon abweichen.

**Was eine Teamleitung ausdrücklich nicht sieht:** Bankdaten, vollständige Personalakte,
private Anschrift, Arbeitsvertrag, Gesundheitsdaten, interne Personalnotizen. Diese Felder
werden für die Rolle nicht aus der Datenbank geladen (`personenAuswahl` in
`src/lib/queries/scope.ts`) – sie sind nicht nur ausgeblendet. In der Oberfläche steht an
ihrer Stelle ein benanntes Schloss, damit ein leeres Feld nicht mit einem fehlenden
Eintrag verwechselt wird.

Die Navigation wird je Rolle gefiltert, und jede Datenbankabfrage mischt den
Sichtbarkeitsfilter mit ein. Einsatz- und Teamleitung sehen dabei nicht den gesamten
Mitarbeiterstamm, sondern nur die Kräfte ihrer eigenen Einsätze.

---

## Der Abgleich im Detail

Der Abgleich vergleicht die Planung mit einem Stundenzettel und ist die Funktion, an
der in der Praxis die meiste Zeit hängt.

**Ablauf**

1. **Datei hochladen** – `.xlsx`, `.xlsm` oder `.csv`. Die Datei wird gespeichert, die
   Spalten werden erkannt.
2. **Spalten zuordnen** – Vorschlag prüfen, anpassen, optional als Vorlage speichern.
   Toleranzen für Zeit und Pause lassen sich je Abgleich setzen.
3. **Abgleich starten** – der Planer meldet z. B.:
   *„482 Datensätze verarbeitet · 461 automatisch zugeordnet · 17 Abweichungen ·
   4 unbekannte Mitarbeiter · 0 doppelte Einträge“*
4. **Korrigieren** – je Zeile Mitarbeiter wählen, Zeiten ändern, kommentieren,
   ignorieren. Bei Unsicherheit schlägt der Planer Kandidaten vor, statt zu raten.
5. **Abschließen** – aus jeder geklärten Zeile wird ein Zeiteintrag. Der Abschluss ist
   erst möglich, wenn keine Zeile mehr ungeklärt ist.

**Zuordnung der Namen**

Erkannt werden: exakte Schreibweise, „Nachname Vorname“, „Mustermann, Max“,
Groß-/Kleinschreibung, überflüssige Leerzeichen, Umlaut-Varianten („Möller“/„Moeller“),
Tippfehler und Buchstabendreher sowie die Personalnummer. Ab einer Trefferguete von
0,92 wird automatisch zugeordnet – aber nur, wenn kein zweiter Kandidat fast gleich gut
passt. Sonst erscheint *„Ähnliche Treffer gefunden – bitte auswählen.“*

**Erkannte Fälle**

Fehlende Mitarbeiter, zusätzliche Mitarbeiter, unbekannte Namen, doppelte Datensätze,
falsches Datum, falsches Event, abweichende Start- und Endzeiten, fehlende Zeiten,
abweichende Pausen, geplante Kräfte ohne Ist-Zeit und Ist-Zeiten ohne Planung.

**Farben**

Grün = identisch · Gelb = Abweichung · Rot = fehlend oder unbekannt · Blau = manuell geprüft

**Nach dem Abschluss** sind Änderungen weiterhin möglich, werden aber im Protokoll
gesondert als nachträgliche Korrektur festgehalten.

---

## Architektur

* **Next.js (App Router) mit React und TypeScript.** Seiten laufen serverseitig, nur
  dort, wo eine Oberfläche wirklich reagieren muss, gibt es eine Client-Komponente.
* **Prisma auf PostgreSQL.** Indizes auf allen Feldern, nach denen die Disposition
  filtert (Datum, Status, Mitarbeiter, Event).
* **Fachlogik in `src/lib/domain/`.** Server-Aktionen und API nutzen dieselben
  Funktionen; die Regeln stehen genau einmal im Code.
* **Abgleich ohne Datenbankzugriff.** `src/lib/reconcile/engine.ts` bekommt Planung und
  Ist-Zeilen und gibt das Ergebnis zurück – deshalb ist er vollständig testbar.
* **Sitzungen in der Datenbank.** Das Cookie trägt ein signiertes JWT, die Sitzung steht
  zusätzlich in der Tabelle `Session`. Nur so lassen sich einzelne Sitzungen beenden.
* **Kein Build-Schritt für Design.** Das Aussehen steckt in CSS-Variablen in
  `src/app/globals.css`; Statusfarben tragen ausschließlich Bedeutung.

**Vorbereitet, aber bewusst noch nicht gebaut:** WhatsApp Business, SMS, Push,
native Apps, Kunden- und Mitarbeiterportal, digitale Verträge und Unterschriften,
Lohnabrechnung, Rechnungsstellung, GPS- und QR-Check-in, KI-Disposition. Die dafür
nötigen Strukturen (`MessageChannel`, `Assignment.checkInAt/checkOutAt`, Stundensätze
auf Mitarbeiter, Kunde, Partner und Position) stehen bereits im Datenmodell.

---

## Datenschutz & Sicherheit

Der Planer verarbeitet personenbezogene Mitarbeiterdaten. **Er behauptet nicht, DSGVO-konform
zu sein.** Er unterscheidet durchgehend zwischen

* **technisch umgesetzt** – im System vorhanden, im Quelltext nachlesbar, und
* **rechtlich geprüft** – von einer benannten Person bewertet.

Das erste lässt sich hier feststellen, das zweite nie. Die Compliance-Zentrale unter
`/compliance` hält Nachweise vor und zeigt, was offen ist; sie ersetzt keine rechtliche
Prüfung. Eine Erfüllungsquote gibt es bewusst nicht: „98 % DSGVO-konform" wäre eine Zahl
ohne Gegenstand und würde genau das verdecken, worauf es ankommt.

### Technisch umgesetzt

**Anmeldung und Sitzungen**

* Passwörter mit scrypt gehasht, je Passwort ein eigener Zufallswert. Mindestens 12 Zeichen,
  Sperre nach 8 Fehlversuchen für 15 Minuten. Klartextpasswörter werden nirgends gespeichert
  und nirgends protokolliert.
* Zweiter Faktor (TOTP nach RFC 6238) für alle Rollen; privilegierte Zugänge ohne Faktor
  bekommen einen sichtbaren Hinweis in der Kopfzeile und stehen im Sicherheitscheck.
  Abschalten geht nur mit Passwort **und** gültigem Code.
* Sitzungen in der Datenbank, einzeln beendbar; Passwortwechsel beendet alle anderen.
* Aufrufbegrenzung je Adresse und je Konto bei Anmeldung, Token-Abruf und öffentlicher
  Anfrage-Schnittstelle.

**Zugriff**

* Rollenkonzept mit Standard DENY ALL, geprüft in jeder Abfrage – nicht nur in der Oberfläche.
* Feldweise Einschränkung in der Personalakte: was eine Rolle nicht sehen darf, wird nicht
  geladen.
* Besondere Kategorien nach Art. 9 DSGVO in einer eigenen Tabelle, mit eigenem Recht,
  eigenem Protokoll und AES-256-GCM-Verschlüsselung (`src/lib/krypto.ts`). Sie erscheinen
  nie in normalen Listen.

**Dokumente**

* Dateien liegen außerhalb des ausgelieferten Verzeichnisses unter zufälliger ID. Es gibt
  keine Adresse, unter der eine Datei ohne Prüfung liegt.
* Der Abruf läuft über `/api/dokumente/:id` und prüft Anmeldung, Recht, Zugriffsebene und
  den Bezug zur eigenen Zuständigkeit.
* Jeder Versuch wird protokolliert – auch der abgewiesene, mit dem Grund.
* Für die Weitergabe gibt es kurzlebige Token: eine Datei, eine Person, eine Stunde, ein
  Abruf. Wer den Link weitergibt, verbraucht ihn.
* Uploads werden auf Größe, MIME-Typ, Endung und Dateiinhalt geprüft.

**Protokoll und Export**

* Audit-Log über alle wichtigen Aktionen mit Benutzer, Zeit, Objekt sowie altem und neuem
  Wert. Geheimnisse werden ausgefiltert. Es gibt in der Oberfläche keine Möglichkeit, einen
  Eintrag zu ändern oder zu löschen, und keine Server-Aktion dafür.
* Exporte brauchen ein eigenes Recht (`export.run`) – sehen und mitnehmen ist nicht dasselbe –
  und werden mit Umfang, Format und Filter festgehalten.
* Keine öffentlichen Downloadlinks.

**Übrige Technik**

* Eingaben durchgängig mit Zod validiert; Prisma verhindert SQL-Injection, React maskiert
  Ausgaben.
* Sicherheits-Header (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`), Cookies `httpOnly`, `sameSite=lax` und bei HTTPS `secure`.
* Soft Delete und Archivierung statt Löschen; Dateien wandern erst nach 30 Tagen endgültig
  aus dem Papierkorb.

### Künstliche Intelligenz

**An externe KI-Systeme gehen keine personenbezogenen Mitarbeiterdaten.** Die optionale
Textauswertung eingehender Anfragen (standardmäßig aus) bekommt den Text einer Anfrage –
nicht die Personalakte. Eine automatisierte Bewertung von Beschäftigten findet nicht statt
und wäre ohne eigene rechtliche Prüfung auch nicht zulässig.

Vor jeder Nutzung eines KI-Dienstes gehört geklärt: Anbieter, Serverstandort, Speicherung,
Nutzung zum Training, Unterauftragnehmer, Auftragsverarbeitungsvertrag, Drittlandtransfer,
Rechtsgrundlage, Löschfrist. Die AVV-Liste unter `/compliance/avv` markiert solche Einträge
gesondert.

### Was das System nicht tut

* Es trägt **keine Rechtsgrundlage** von sich aus ein. Wo keine geprüft wurde, steht
  „noch nicht geprüft".
* Es bewertet **nicht**, ob ein Datenschutzvorfall meldepflichtig ist. Art. 33 Abs. 1 DSGVO
  knüpft das an eine Abwägung; das Feld bleibt leer, bis ein Mensch es ausfüllt. Die 72
  Stunden seit Kenntnis werden gezeigt, nicht bewertet.
* Es **löscht nichts automatisch**. Die Löschfristen-Seite zeigt, was fällig wäre; ob eine
  Aufbewahrungspflicht entgegensteht, entscheidet ein Mensch.
* Es nennt **keine Erfüllungsquote** und behauptet an keiner Stelle, konform zu sein.

### Von der Organisation zu leisten

Das Verzeichnis von Verarbeitungstätigkeiten, das Löschkonzept, die TOM-Liste und die
Compliance-Dokumentation sind im System **angelegt und im Entwurfsstand**. Sie brauchen:

* die anwaltliche Prüfung der eingetragenen Rechtsgrundlagen,
* unterzeichnete Auftragsverarbeitungsverträge mit Hoster und Mailanbieter,
* eine Betriebsvereinbarung zur Zeiterfassung,
* die schriftliche Verpflichtung aller Beschäftigten auf das Datengeheimnis,
* eine Entscheidung, ob eine Datenschutz-Folgenabschätzung nach Art. 35 nötig ist,
* und die Benennung einer verantwortlichen Person je Bereich.

Bei mehr als 20 Personen, die ständig mit personenbezogenen Daten arbeiten, ist zusätzlich
ein Datenschutzbeauftragter zu benennen (§ 38 BDSG).

---

## Backups

Ein Backup umfasst **zwei** Dinge – die Datenbank allein reicht nicht:

```bash
# 1. Datenbank
pg_dump "$DATABASE_URL" --format=custom --file=/backup/hst-$(date +%F).dump

# 2. Dateiablage (Dokumente, hochgeladene Stundenzettel)
tar czf /backup/hst-storage-$(date +%F).tar.gz -C /srv/hst-planer storage
```

Wiederherstellen:

```bash
pg_restore --clean --if-exists --dbname="$DATABASE_URL" /backup/hst-2026-09-24.dump
tar xzf /backup/hst-storage-2026-09-24.tar.gz -C /srv/hst-planer
```

Empfehlung: täglich, mindestens 30 Tage vorhalten, Wiederherstellung einmal im Quartal
üben. Keine kritischen Daten ausschließlich im Browser speichern – der Planer tut das
auch nicht: im Browser liegt nur die Wahl zwischen heller und dunkler Ansicht.

---

## Compliance-Zentrale

Unter `/compliance` liegen neun Bereiche. Jeder führt Einträge und sagt, was daran offen
ist – ohne Quote und ohne Bewertung.

| Bereich | Inhalt |
|---|---|
| **Datenschutz** | Verzeichnis von Verarbeitungstätigkeiten (Art. 30) und Betroffenenanfragen (Art. 12–22) mit Fristen |
| **TOM** | Technische und organisatorische Maßnahmen (Art. 32), jede mit Fundstelle im Quelltext |
| **AVV** | Auftragsverarbeiter (Art. 28), Unterauftragnehmer, Drittlandtransfers, KI-Systeme |
| **Löschfristen** | Löschkonzept je Datenkategorie: Zweck, Grundlage, Aufbewahrungsgrund, Frist, Fristbeginn |
| **Audit-Log** | Fachliche Änderungen, Dokumentzugriffe (auch abgewiesene) und Exporte |
| **Datenschutzvorfälle** | Art. 33/34 – ohne automatische Aussage zur Meldepflicht |
| **DSFA** | Folgenabschätzung (Art. 35), beginnend bei der Frage, ob eine nötig ist |
| **Dokumentation** | Richtlinien, Einwilligungen, Informationspflichten, Nachweise – je mit Version, Stand, Ersteller, Freigabe und nächster Prüfung |
| **Sicherheitscheck** | Dreizehn Prüfungen auf ausgeschiedene Zugänge, fehlenden zweiten Faktor, offene Anfragen, fällige Löschungen und auffällige Zugriffe |

Der Sicherheitscheck nennt zu jedem Befund einen Namen und ein Ziel. „3 Auffälligkeiten"
hilft niemandem; „Ralf Timm hat seit dem Ausscheiden noch einen aktiven Zugang" schon.

Der mitgelieferte Grundbestand (`prisma/seed-compliance.ts`) ist ein **Arbeitsstand**: alle
Einträge tragen den Status Entwurf, Rechtsgrundlagen sind teils offen. Die TOM sind die
Ausnahme – dass ein Passwort mit scrypt gehasht wird, lässt sich im Quelltext nachsehen.
Das ist eine Tatsachenbehauptung über den Code, keine über die Angemessenheit im Sinne des
Art. 32 Abs. 1.

---

## Was noch offen ist

* **Ziehen und Ablegen** funktioniert in der Leitstelle (`/disposition`). In der
  Wochenplanung und im Kalender läuft die Einteilung weiterhin über „Personal suchen“.
* **Spaltenauswahl und Sortierung per Klick** fehlen in den Tabellen. Suche, Filter,
  Pagination und Export sind vorhanden; die Sortierung folgt einer festen, fachlich
  sinnvollen Reihenfolge (Einsätze nach Datum, Mitarbeiter nach Nachname).
* **PDF-Ausgabe** erfolgt über die Druckansicht des Browsers (`Einsatzplan`, `Auswertungen`).
  Eine serverseitige PDF-Erzeugung ist bewusst nicht eingebaut, solange die Druckansicht
  reicht.
* **QR-Code für den zweiten Faktor** fehlt: das Geheimnis wird zum Abtippen angezeigt, die
  otpauth-Adresse steht daneben und funktioniert auf dem Telefon per Antippen. Ein eigener
  QR-Encoder wären mehrere hundert Zeilen Reed-Solomon-Arithmetik, die niemand nachprüft;
  eine Bibliothek dafür wäre eine Abhängigkeit an einer heiklen Stelle.
* **Wiederherstellungscodes** für den zweiten Faktor gibt es nicht. Wer sein Telefon
  verliert, wendet sich an die Systemadministration – die kann den Faktor am Konto
  zurücksetzen. Für ein Haus dieser Größe ist das der ehrlichere Weg als ein zweiter
  Satz Geheimnisse, der im Schreibtisch liegt.
* **WhatsApp** ist im Datenmodell vorgesehen, aber an keinen Dienst angebunden. Die Seite
  sagt das und nennt, was vorher zu klären wäre.
* **Objekte** (`/objekte`) sind angelegt, aber noch nicht mit einem eigenen Planungsweg
  verbunden – Einsätze an einem Objekt laufen weiterhin als Veranstaltung.
* **Mehrere Instanzen:** Die Aufrufbegrenzung liegt im Prozessspeicher. Beim Betrieb
  hinter mehreren Instanzen gehört dort ein gemeinsamer Speicher hin
  (`src/lib/rate-limit.ts`, die Schnittstelle bleibt gleich).
* **Rechtstexte und Datenschutzerklärung** für den Planer selbst sind noch zu erstellen;
  die der Website gelten dafür nicht.
* **Datensicherung ist nicht eingerichtet.** Die TOM-Liste führt sie ausdrücklich als
  *nicht umgesetzt*, damit sie nicht in Vergessenheit gerät. Befehle stehen unter
  [Backups](#backups).
* **Das Docker-Abbild wurde in der Entwicklungsumgebung nicht gebaut** – dort stand kein
  Docker-Daemon zur Verfügung. Geprüft ist stattdessen der Teil, der im Container läuft:
  die Standalone-Ausgabe startet, beantwortet Anfragen und spricht mit der Datenbank.
  Der erste `docker compose up --build` gehört trotzdem einmal bewusst beobachtet.

---

## Demo-Datei zum Ansehen

Im Ordner `demo/` liegt eine eigenständige HTML-Datei, die sich per Doppelklick öffnen lässt —
ohne Server, ohne Datenbank, ohne Internet:

```
demo/index.html        im Browser öffnen
demo/bilder/           62 Bildschirmfotos aus der laufenden Anwendung
demo/hst-logik.js      gebündelte Fachlogik aus src/lib
```

Sie zeigt die Anwendung in Bildern und lässt sechs Rechenkerne im Browser mitlaufen:
Zeitberechnung, Namensabgleich, E-Mail-Parser, den vollständigen Abgleich mit
bearbeitbarem Stundenzettel, die Zuordnungsprüfung aus der Leitstelle und die
Rechtematrix. Das ist **kein Nachbau**: `demo/hst-logik.js` wird aus denselben Modulen
gebaut, die auch der Server benutzt.

Nicht dabei ist der zweite Faktor – er rechnet mit `node:crypto` und liesse sich im
Browser nur nachbauen. Ein Nachbau ist genau das, was diese Datei nicht sein soll; er
steht unter `tests/totp.test.ts`, geprüft gegen die Werte aus Anhang B des RFC 6238.

Neu erzeugen, nachdem sich Oberfläche oder Fachlogik geändert haben:

```bash
npm run build
bash scripts/server-start.sh 3100
npm run seed                                  # gleiche Daten wie auf den Bildern
npm run demo:bilder                           # 62 Aufnahmen über neun Rollen
npm run demo:verkleinern                      # spart rund zwei Drittel Speicher
npm run demo:logik                            # bündelt die Fachlogik neu
npm run demo:seite                            # setzt demo/index.html zusammen

# Danach einmal in einem echten Browser nachsehen:
npx tsx --tsconfig scripts/tsconfig.json scripts/demo-pruefen.ts
```

Anmeldung, Datenbank, Uploads, E-Mail-Versand und die Rollentrennung lassen sich in einer
einzelnen Datei nicht ehrlich zeigen — dafür braucht es den Server. Die Demo sagt das an
der entsprechenden Stelle auch selbst.
