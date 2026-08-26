# MITEINANDER

Eine barrierefreie App, die volljährige Menschen mit Behinderung, ältere Menschen
und andere Menschen mit Unterstützungsbedarf mit passenden Unterstützenden
zusammenbringt.

> **Der Name ist ein Arbeitstitel.** Er steht an genau einer Stelle im Code
> (`packages/core/src/config/app-config.ts`) und wird über `EXPO_PUBLIC_APP_NAME`
> überschrieben. Ein Rebrand berührt keine andere Datei.

> **Diese App ersetzt keinen Notruf.** Bei akuter Gefahr gelten 112 und 110.
> Der Hinweis steht auf jedem Bildschirm, auf dem Menschen Hilfe suchen.

---

## Was funktioniert

Der vertikale Kern läuft durchgehend – von der Anfrage bis zur bestätigten Buchung:

| Ablauf | Zustand |
| --- | --- |
| Moduswahl, Bedienhilfen, Einfach-Modus | funktionsfähig |
| Profil mit feldgenauer Freigabe | funktionsfähig |
| Anfrage-Assistent mit Entwurfssicherung | funktionsfähig |
| Matching mit nachvollziehbaren Gründen | funktionsfähig, getestet |
| Vorschläge, Profilansicht, Vergleich | funktionsfähig |
| Chat mit Transkriptpflicht | funktionsfähig |
| Buchung mit doppelter Bestätigung | funktionsfähig, getestet |
| Bewertung und Problemmeldung | funktionsfähig |
| Anbieter-Onboarding, Leistungsprofil, Nachweise | funktionsfähig |
| Adminbereich: Prüfungen, Vorfälle, Inhalte, Protokoll | funktionsfähig |
| Datenbankschema mit Row-Level-Security | vollständig, geprüft gegen die PostgreSQL-Grammatik |

**Ehrlich benannt, was noch nicht fertig ist:**

- **Gebärdensprache:** 0 von 18 Kernabläufen haben ein produziertes, fachlich
  geprüftes Video. Das Content-System steht, die Oberfläche sagt an jeder Stelle
  offen, dass das Video fehlt. Es wird nirgends behauptet, die Übersetzung sei
  vollständig.
- **Leichte Sprache:** alle Texte sind Entwürfe des Produktteams und noch nicht
  von einer Prüfgruppe freigegeben. Auch das steht in der Oberfläche.
- **Zahlungen:** als austauschbares Modul angelegt und im MVP abgeschaltet. Es
  gibt bewusst keine Schein-Integration.
- **Backend:** die App läuft im Demo-Modus gegen eine In-Memory-Datenschicht.
  Das Supabase-Schema ist vollständig, der Adapter dagegen noch nicht
  implementiert – die Schnittstelle dafür ist definiert
  (`packages/core/src/data/repositories.ts`).
- **Spracherkennung:** die Auswertung von Sprachbefehlen ist implementiert und
  getestet; die Anbindung an eine Erkennungs-Engine fehlt noch.

Die vollständige Liste steht in [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md).

---

## Schnellstart

```bash
npm install

npm run verify        # Typecheck + alle Tests
npm run mobile:web    # App im Browser (Expo Web)
npm run mobile        # App auf iOS/Android (Expo Go)
npm run admin         # Adminbereich auf http://localhost:3001
```

Node 20 oder neuer wird vorausgesetzt.

### Datenbank

```bash
supabase start                       # lokale Instanz
supabase db reset                    # Migrationen + Seed einspielen
```

Die Migrationen liegen in `supabase/migrations/` und werden in dieser
Reihenfolge angewendet:

| Datei | Inhalt |
| --- | --- |
| `0001_schema.sql` | Tabellen, Typen, Prüfbedingungen, Indizes |
| `0002_functions.sql` | Trigger, die die Kernregeln erzwingen |
| `0003_rls.sql` | Row-Level-Security |
| `0004_views.sql` | reduzierte, öffentliche Sichten |
| `../seed/seed.sql` | Stammdaten und eindeutig fiktive Demo-Daten |

### Die App zum Ausprobieren weitergeben

```bash
npm run testdatei
```

Erzeugt `apps/mobile/miteinander-testfassung.html` – eine einzige Datei, die
per Doppelklick im Browser läuft. Kein Server, keine Installation, keine
Internetverbindung: das Bundle und alle Bilder sind eingebettet, es wird
nichts nachgeladen.

Was in dieser Fassung anders ist:

- Alle Daten sind erfunden, mit „(Demo)" gekennzeichnet und liegen nur im
  Arbeitsspeicher. Ein Neuladen setzt alles zurück.
- Der Zurück-Knopf des **Browsers** wirkt nicht – eine Seite aus dem
  Dateisystem darf die Adresszeile nicht ändern. Der Zurück-Knopf **in der
  App** funktioniert normal.
- Es ist die Web-Fassung. Für Screenreader-Tests auf dem Gerät gilt
  `npm run mobile` mit Expo Go.

### Tests

```bash
npm test                             # 202 Unit- und Integrationstests
npm run typecheck                    # alle vier Pakete

cd apps/mobile
npm run web:export                   # Web-Fassung nach dist/
CHROMIUM_PATH=/pfad/zu/chromium npm run e2e
```

Automatisierte Tests ersetzen keine manuellen Tests mit Screenreader,
Tastatur und Switch Control. Der manuelle Testplan steht in
[`TESTPLAN.md`](TESTPLAN.md).

---

## Aufbau

```
miteinander/
├── packages/
│   ├── core/            Anwendungskern: Domäne, Matching, Buchung,
│   │                    Datenschutz, Sicherheit, Sprache, Inhalte
│   └── ui/              Design-System: Tokens und barrierefreie Komponenten
├── apps/
│   ├── mobile/          React Native (Expo Router), iOS/Android/Web
│   └── admin/           Next.js, Prüfungen und Sicherheitsfälle
└── supabase/            Schema, Trigger, Row-Level-Security, Seed
```

Der Kern kennt weder React noch eine Datenbank. Beide Oberflächen rufen
dieselbe Service-Schicht auf und treffen selbst keine fachlichen
Entscheidungen. Mehr dazu in [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Weiterführende Unterlagen

| Datei | Inhalt |
| --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Aufbau, Datenfluss, Risiken |
| [`ACCESSIBILITY.md`](ACCESSIBILITY.md) | Zielstandard, Umsetzung, bekannte Lücken |
| [`SECURITY.md`](SECURITY.md) | Schutzkonzept, Rollen, Incident-Workflow |
| [`PRIVACY.md`](PRIVACY.md) | Datenarten, Rechtsgrundlagen, Löschkonzept |
| [`DECISIONS.md`](DECISIONS.md) | getroffene Entscheidungen mit Begründung |
| [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) | was vor dem Start passieren muss |
| [`TESTPLAN.md`](TESTPLAN.md) | manueller Testplan |
| [`MENSCHLICHE_PRUEFUNGEN.md`](MENSCHLICHE_PRUEFUNGEN.md) | was zwingend ein Mensch prüfen muss |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Komponentenübersicht |
| [`docs/RESEARCH.md`](docs/RESEARCH.md) | Research- und Usability-Testkonzept |

---

## Grundregeln, die nicht verhandelbar sind

1. Erlaubnispflichtige Anfragen (Pflege, Medizinnahes) sehen ausschließlich
   Personen mit geprüfter, gültiger Fachqualifikation. Durchgesetzt in der
   Anwendung **und** in der Row-Level-Security.
2. Eine Buchung wird nur durch zwei ausdrückliche Bestätigungen verbindlich.
   Schweigen ist nie Zustimmung.
3. Telefonnummer und genaue Adresse sind vor einer bestätigten Buchung nie
   sichtbar und werden nach einer Absage sofort wieder eingezogen.
4. Geld, Buchungen, Datenfreigaben und Löschungen werden nie allein durch einen
   Sprachbefehl ausgelöst.
5. Ein geprüfter Nachweis bedeutet genau das geprüfte Merkmal – nie eine
   allgemeine Aussage über einen Menschen.
6. Kein Inhalt wird als „in Gebärdensprache verfügbar" ausgewiesen, bevor er
   produziert und fachlich geprüft ist.
