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
| Drei Zugänge auf der Startseite: Hilfesuchende, Dienstleister, Verantwortliche | funktionsfähig, getestet |
| Begleitung „Mika": führt durch jeden Bildschirm, beantwortet Rückfragen | funktionsfähig, getestet |
| Planer für Anbietende mit Wochenansicht | funktionsfähig, getestet |
| Kalenderanbindung: einzelner Eintrag und Abo-Link (iCalendar) | funktionsfähig, getestet |
| Benachrichtigung bei einer passenden Anfrage | funktionsfähig, getestet |
| Freigaben durch verantwortliche Personen | funktionsfähig, getestet |
| Übersicht für Verantwortliche, Transparenz für die betroffene Person | funktionsfähig, getestet |
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
| Gebärdensprach-Abspieler mit Untertiteln, Tempo, Vollbild | funktionsfähig, getestet |
| Bedieneinstellungen überleben den Neustart | funktionsfähig, getestet |
| Datenbankschema mit Row-Level-Security | vollständig, geprüft gegen die PostgreSQL-Grammatik |

**Ehrlich benannt, was noch nicht fertig ist:**

- **Gebärdensprache:** Der Ablauf funktioniert vollständig – Abspieler,
  Untertitel, Geschwindigkeit, Vollbild, Transkript, auf jedem Bildschirm
  erreichbar. Was fehlt, sind die Aufnahmen selbst: **0 von 18 Kernabläufen
  haben ein von DGS-Muttersprachler:innen produziertes und geprüftes Video.**
  Ausgeliefert werden gekennzeichnete Platzhalter, die im Bild und in der
  Oberfläche als solche benannt sind. Transkript und Untertitel sind dagegen
  echte, vollständige Inhalte für alle 18 Abläufe.
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

### Gebärdensprach-Platzhalter neu bauen

```bash
cd apps/mobile
node --experimental-strip-types tools/dgs-platzhalter.mjs
```

Erzeugt für alle 18 Kernabläufe ein gekennzeichnetes Platzhaltervideo, die
zugehörigen Untertitel als WebVTT und die Zuordnung für Metro. Braucht ffmpeg
und Python mit Pillow.

**Für echte Aufnahmen wird das Skript nicht gebraucht:** Dateien in
`apps/mobile/assets/dgs/` austauschen und im Adminbereich freigeben.

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

## Die Begleitung durch die App

„Mika" führt durch jeden Bildschirm und beantwortet vier Fragen: **Wo bin ich?
Was kann ich hier tun? Was passiert danach? Was ist der nächste Schritt?**
Dazu kommt eine feste Liste von Rückfragen – in normaler Sprache, in Leichter
Sprache, vorgelesen und in Gebärdensprache.

Was Mika **nicht** ist, und das steht auf jedem Bildschirm mit dabei:

- **Kein Mensch.** Mika sagt das selbst, direkt unter dem Namen.
- **Keine gebärdende Person.** Mika erzeugt keine Gebärden, sondern zeigt
  Videos, die von gehörlosen Menschen aufgenommen und geprüft wurden. Fehlt
  ein Video, sagt Mika das – statt eine Übersetzung vorzutäuschen.
- **Kein Sprachmodell.** Alle Antworten stehen im Klartext in
  `packages/core/src/content/begleiter.ts`. Nichts wird zur Laufzeit erzeugt,
  nichts verlässt das Gerät. Eine Begleitung, die frei formuliert, könnte
  einer Person etwas Falsches über eine Buchung sagen – und die hätte es
  geglaubt.

Gebärdensprache bleibt daneben **direkt** erreichbar: neben „Mika fragen"
steht auf jedem Bildschirm ein eigener Knopf „In Gebärdensprache ansehen".
Wer sie braucht, soll das Wort lesen und nicht erraten müssen, dass es hinter
der Begleitung liegt.

## Der Planer für Anbietende

Wochenansicht der Einsätze, blätterbar. Zwei Wege in den privaten Kalender:

| Weg | Wofür |
| --- | --- |
| **Einzelner Eintrag** (.ics-Datei) | Einen Termin übernehmen. Jeder Kalender versteht das Format. |
| **Kalender verbinden** (Abo-Link) | Dauerhaft. Der Kalender holt sich Änderungen selbst, auch Absagen. |

**Was im Kalender landet, ist bewusst wenig:** Tätigkeit, Zeit, Treffpunkt.
Kein Name, keine Wohnadresse, nichts zur Gesundheit. Ein Handy-Kalender ist
kein geschützter Ort – Einträge stehen auf dem Sperrbildschirm und werden oft
mit einem Firmenkonto abgeglichen. Der Browser-Test lädt die erzeugte Datei
herunter und prüft, dass wirklich kein Name darin steht.

Der Abo-Link ist ein Ausweis: wer ihn hat, sieht die Einsatzzeiten. Deshalb
steht die Warnung daneben, und ein neuer Link macht den alten sofort ungültig.

Neue Anfragen, die zu den angebotenen Leistungen passen, erscheinen als
Benachrichtigung. Die Vorschau nennt nie den Inhalt – und eine
erlaubnispflichtige Anfrage erreicht nur, wer die Qualifikation nachgewiesen
hat.

## Drei Zugänge, zwei Ansprüche

Die Startseite führt in drei Richtungen. Ganz oben und am größten steht der
Zugang für Menschen, die Unterstützung suchen.

| Zugang | Anspruch |
| --- | --- |
| **Ich suche Unterstützung** | So leicht wie möglich. Ein Schritt pro Ansicht, große Schaltflächen, Vorlesen, Leichte Sprache, Gebärdensprache. |
| **Ich biete Unterstützung an** | Vollständig, aber sachlich: Leistungsprofil, Nachweise, Auftragsübersicht. |
| **Ich bin verantwortlich für eine Person** | Darf umfangreicher sein: Überblick über offene Freigaben, Termine und Anfragen der Menschen, für die man da ist. |

Der Bereich für Verantwortliche ist **kein heimlicher Einblick**. Die
betroffene Person sieht unter „Wer entscheidet mit" jederzeit, wer was sehen
darf und welche Freigabe gerade bei wem liegt.

### Wann eine Freigabe überhaupt zulässig ist

Ein volljähriger Mensch mit Geschäftsfähigkeit braucht niemandes Zustimmung.
Eine Freigabepflicht ist deshalb an eine von genau zwei Grundlagen gebunden:

| Grundlage | Wer kann sie beenden |
| --- | --- |
| **Eigener Wunsch der Person** | Sie selbst, jederzeit und ohne Begründung. |
| **Gerichtlicher Einwilligungsvorbehalt** (§ 1825 BGB, mit Aktenzeichen) | Nur das Betreuungsgericht. |

Ohne eines von beidem entscheidet die Person allein. Das ist in der Anwendung
**und** als Prüfbedingung in der Datenbank abgesichert.

Weitere Regeln, die im Zustandsautomaten durchgesetzt werden:

- **Keine stille Zustimmung durch Zeitablauf.** Wer nicht antwortet, stimmt
  nicht zu – der Vorgang bleibt offen und sichtbar, und es wird erinnert.
- **Keine stille Ablehnung.** Eine Ablehnung braucht eine Begründung, die die
  Person zu lesen bekommt.
- **Eine Freigabe ersetzt keine Entscheidung.** Nach der Zustimmung bestätigt
  die Person weiterhin selbst.
- **Niemand gibt sich selbst frei.**
- Die Einrichtung findet gemeinsam statt. Es gibt keinen Weg, jemanden ohne
  sein Wissen zu verwalten.

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
7. Eine Freigabepflicht gibt es nur mit Grundlage, nie stillschweigend, und
   die betroffene Person sieht jede Freigabe, die sie betrifft.
