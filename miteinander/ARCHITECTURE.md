# Architektur

## Leitgedanke

Fachliche Entscheidungen werden an genau einer Stelle getroffen: im
Anwendungskern. Die Oberflächen stellen dar und nehmen entgegen – sie
entscheiden nicht. Regeln, die Menschen schützen, stehen zusätzlich in der
Datenbank, damit ein direkter Zugriff sie nicht umgehen kann.

```
┌──────────────────┐   ┌──────────────────┐
│  apps/mobile     │   │  apps/admin      │
│  React Native    │   │  Next.js         │
└────────┬─────────┘   └────────┬─────────┘
         │                      │
         └──────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │  packages/ui          │  Tokens, barrierefreie Komponenten
        └───────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │  packages/core        │  Domäne, Matching, Buchung, Datenschutz,
        │  (kennt kein React,   │  Sicherheit, Sprache, Inhalte,
        │   keine Datenbank)    │  Service-Schicht
        └───────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │  DataContext          │  Schnittstelle, zwei Implementierungen:
        │  (Repository-Muster)  │  In-Memory (Demo/Test) und Supabase
        └───────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │  PostgreSQL           │  Trigger + Row-Level-Security als
        │  (Supabase)           │  zweite, unabhängige Absicherung
        └───────────────────────┘
```

## Warum der Kern nichts über die Oberfläche weiß

Zwei Gründe, beide praktisch:

1. **Testbarkeit.** Matching, Zustandsautomaten, Sichtbarkeitsregeln und
   Einwilligungslogik laufen ohne Emulator und ohne Datenbank. 202 Tests
   brauchen 2,4 Sekunden. Was schnell testbar ist, wird auch getestet.
2. **Austauschbarkeit.** Der Kern spricht ausschließlich die Interfaces in
   `data/repositories.ts` an. Ein Wechsel von Supabase auf ein anderes Backend
   berührt keine Domänenlogik.

## Die Schichten im Einzelnen

### `packages/core`

| Ordner | Verantwortung |
| --- | --- |
| `config/` | Produktname, Betreiber, Notrufnummern, Feature-Schalter |
| `domain/` | Typen, Aufzählungen, Leistungskategorien, Qualifikationen |
| `a11y/` | Bedienmodi, Auflösung gegen Systemeinstellungen, WCAG-Kontrastrechner |
| `matching/` | Entfernung, harte Ausschlusskriterien, Bewertung, Diskriminierungsschutz |
| `requests/` | Anfrage-Assistent: Schritte, Feldprüfung, Entwurf, Wiederholung |
| `booking/` | Zustandsautomat, Absageregeln, Bestätigungs-Zusammenfassungen |
| `privacy/` | feldgenaue Sichtbarkeit, Einwilligungen, Aufbewahrung |
| `security/` | Rechte, Vier-Augen-Prinzip, Nachweise, Vorfälle, Freigaben |
| `voice/` | Sprachbefehle, Bestätigungspflicht, Ersatzwege; Absichtserkennung der Sprachführung (`wunsch.ts`, feste Wortliste, kein Sprachmodell) |
| `content/` | Gebärdensprache (Skripte, Katalog, Untertitel als WebVTT), Leichte Sprache, Begleitung, Karten für unterstützte Kommunikation (`kommunikation.ts`) |
| `kalender/` | iCalendar-Erzeugung und Abo-Adressen |
| `data/` | Repository-Schnittstellen, In-Memory-Implementierung |
| `services/` | Anwendungsschicht: verbindet Daten, Rechte, Einwilligungen, Domäne |
| `seed/` | eindeutig fiktive Demo-Daten |

### `packages/ui`

Tokens für Farbe, Typografie, Abstand, Fokus, Bewegung und Tippfläche sowie
darauf aufbauende Komponenten. Das `Theme` wird aus den aufgelösten
Nutzereinstellungen gebaut – deshalb wirken Schriftgröße, Kontrast, reduzierte
Bewegung und Tippflächengröße durchgängig, ohne dass eine Komponente sie
einzeln berücksichtigen muss.

Die Farbtokens werden im Test gegen WCAG 2.2 AA geprüft: 17 Farbpaare in drei
Paletten, 51 Prüfungen. Ein neuer Farbwert, der eine Schwelle reißt, lässt die
Testsuite fehlschlagen.

Plattformwissen liegt bewusst an einer einzigen Stelle:
`apps/mobile/src/kalender/geraetekalender.ts` übergibt die fertige Datei an
Browser oder Teilen-Menü. Der Inhalt kommt aus dem Kern und ist dort getestet.

### `apps/mobile`

Expo Router, dateibasierte Navigation. Der Anwendungszustand
(`src/state/app-state.tsx`) hält die Service-Instanz, die aufgelösten
Barrierefreiheits-Einstellungen und die Inhalte-Register. Die Einstellungen
werden gespeichert und beim Start wieder eingelesen (`src/state/speicher.ts`);
ist keine Ablage verfügbar, läuft die App ohne Gedächtnis weiter. Systemzustände
(Screenreader aktiv, Bewegung reduzieren, Farbschema) werden abgefragt und
haben Vorrang vor den App-Einstellungen.

### `apps/admin`

Next.js App Router, Server Components. Keine eigene Fachlogik – die Seiten
rufen dieselben Funktionen des Kerns auf wie die App.

## Datenfluss am Beispiel einer Anfrage

1. Der Assistent baut einen `RequestDraft`. Jede Änderung ist sofort ein
   gespeicherter Entwurf; der Screenreader bekommt eine Ansage.
2. `validateStep` prüft je Schritt und liefert Fehler **pro Feld** mit
   Korrekturvorschlag – keine Sammelmeldung.
3. `finalizeDraft` leitet `requiresLicensedProfessional` aus den Kategorien ab.
   Der Wert kann nicht von außen gesetzt werden.
4. `SupportService.submitRequest` prüft Rechte und, bei sensiblen Angaben, die
   Einwilligung nach Art. 9 DSGVO. Fehlt sie, wird die Anfrage abgelehnt – sie
   wird nicht still beschnitten.
5. `findMatches` filtert hart (Kategorie, Qualifikation, Identität, Radius,
   Verfügbarkeit, Abwesenheit, Sprache, Budget) und bewertet erst danach.
6. Jede Bewertungskomponente erzeugt einen Grund in normaler und in Leichter
   Sprache. Die Gewichtung ist offengelegt.
7. Die Anzeige läuft über `redactSeekerProfile` – Kontaktdaten sind vor einer
   bestätigten Buchung nicht Teil des Ergebnisses.

## Doppelte Absicherung

Sechs Regeln stehen bewusst zweimal: in der Anwendung, damit die Oberfläche
verständlich reagieren kann, und in der Datenbank, damit sie nicht umgangen
werden können.

| Regel | Anwendung | Datenbank |
| --- | --- | --- |
| Erlaubnispflicht wird abgeleitet | `finalizeDraft` | Trigger `trg_requests_licensed` |
| Erlaubnispflichtige Anfragen nur für Fachkräfte | `checkEligibility` | Policy `requests_visible_to_matching_providers` |
| Rolle folgt den Nachweisen | `deriveProviderKind` | Trigger `trg_verifications_refresh_kind` |
| Vier-Augen-Prinzip bei Fachqualifikation | `decideVerification` | Trigger `trg_verifications_four_eyes` |
| Kontaktfreigabe nur mit Buchung und Einwilligung | `confirmBooking` | Trigger `trg_bookings_contact_release` |
| Sprachnachricht braucht Transkript | `sendMessage` | Prüfbedingung `voice_needs_transcript` |
| Freigabepflicht nur mit Grundlage | `validateGrant` | Prüfbedingungen an `trusted_access_grants` |
| Nur die benannte Person entscheidet | `decideApproval` | Trigger `trg_approvals_entscheidung` |
| Ablehnung braucht eine Begründung | `decideApproval` | Prüfbedingung `ablehnung_braucht_grund` |
| Niemand gibt sich selbst frei | `validateGrant`, `decideApproval` | Prüfbedingung `keine_selbstfreigabe` |

## Bekannte Risiken

| Risiko | Einschätzung | Umgang |
| --- | --- | --- |
| Gebärdensprach-Aufnahmen fehlen | hoch – betrifft die Zugänglichkeit für gehörlose Menschen unmittelbar | Abspieler, Untertitel und Transkripte sind fertig; Produktion beauftragen. Bis dahin gekennzeichnete Platzhalter, die Oberfläche sagt es offen |
| Platzhalter sind VP8/WebM | mittel | Für iOS und Safari wird H.264/MP4 gebraucht – vor dem Start festlegen |
| Leichte Sprache ungeprüft | hoch | Prüfgruppe beauftragen; Texte sind als Entwurf gekennzeichnet |
| Rechtliche Einordnung der Anbietenden (Gewerbe, Steuer, Sozialversicherung, Führungszeugnis) | hoch | Prüfprozess ist konfigurierbar angelegt; anwaltliche Klärung ist Startvoraussetzung |
| Missbrauch der Vermittlung (Grooming, finanzielle Ausnutzung) | hoch | Identitätsprüfung, Meldewege, Incident-Workflow, Vier-Augen-Prinzip; ersetzt kein menschliches Schutzkonzept |
| Missbrauch der Verantwortlichen-Rolle (Bevormundung, Blockade durch Schweigen) | hoch | Grundlage ist Pflicht, Ablehnung braucht Begründung, kein Zeitablauf-Automatismus, volle Transparenz für die betroffene Person. Der Beschwerdeweg bei dauerhaftem Schweigen ist offen (O-10) |
| Standortdaten | mittel | nur gerundete Koordinaten, Entfernungen nur grob beschriftet |
| Falsche Spracherkennung | mittel | folgenreiche Handlungen brauchen immer eine Bestätigung am Bildschirm |
| Supabase-Abhängigkeit | mittel | Repository-Muster; ein Wechsel berührt keine Domänenlogik |
| Zwei Farbdefinitionen (App und Adminbereich) | niedrig | Wert und Kommentar in `tokens/color.ts`; bei Änderung beide pflegen |
