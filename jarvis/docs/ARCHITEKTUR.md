# Architektur

## Warum Electron und nicht Tauri

Beide Wege wurden geprüft. Entscheidend war, wo die eigentliche Arbeit anfällt.

JARVIS ist zu großen Teilen ein Mail- und Recherchewerkzeug. Alles, was dabei
zählt – SMTP, IMAP mit MIME-Auswertung, OAuth, HTML-Auswertung, SQLite,
Anbieter-SDKs – existiert ausgereift im Node-Ökosystem. Mit Tauri läge die
Oberfläche in einer schlankeren Hülle, aber der gesamte Kern müsste entweder in
Rust neu entstehen oder als Node-Beiprozess mitgeliefert werden. Damit wäre der
Größenvorteil dahin und die Fehlerquellen verdoppelt.

Dazu kommt: `node:sqlite` ist seit Node 22 eingebaut. Electron 43 bringt eine
passende Node-Version mit, also kommt die Anwendung **ganz ohne native Module**
aus. Kein `node-gyp`, kein Neuübersetzen bei jedem Electron-Update.

Die Sicherheitsnachteile von Electron sind bekannt und werden hier bewusst
abgeräumt: `contextIsolation`, `sandbox`, kein Node im Fenster, eine enge
IPC-Brücke, Content-Security-Policy und eine Berechtigungsprüfung, die außer dem
Mikrofon alles ablehnt (`src/main/index.ts`).

Bewertung im Überblick:

| Kriterium          | Electron                                    | Tauri                                |
| ------------------ | ------------------------------------------- | ------------------------------------ |
| Mail-/IMAP-Stapel  | ausgereift, direkt verfügbar                | Rust-Neubau oder Node-Beiprozess     |
| Datenbank          | `node:sqlite`, eingebaut                    | Rust-Anbindung, zusätzlicher Aufwand |
| Paketgröße         | ~150 MB                                     | ~10 MB                               |
| Speicherbedarf     | höher                                       | niedriger                            |
| Sicherheitsgrundstellung | muss gehärtet werden (hier geschehen) | von Haus aus enger                   |
| Erweiterbarkeit    | eine Sprache im ganzen Projekt              | zwei Sprachen                        |

Der Kern ist so geschnitten, dass ein späterer Wechsel möglich bleibt: `src/core`
kennt Electron nicht. Was Electron liefert (Schlüsselbund, Zwischenablage), wird
über Schnittstellen hereingereicht.

---

## Schichten

```
┌──────────────────────────────────────────────────────────────┐
│  Renderer  (React, kein Node-Zugriff)                        │
│  Gespräch · Versandzentrale · Entwürfe · Protokoll · Setup   │
└───────────────────────────┬──────────────────────────────────┘
                            │  contextBridge, feste Kanalliste
┌───────────────────────────┴──────────────────────────────────┐
│  Main  (Electron)                                            │
│  Fenster, Härtung, IPC, Schlüsselbund, Zwischenablage        │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────┴──────────────────────────────────┐
│  Kern  (src/core – ohne Electron, vollständig testbar)       │
│                                                              │
│  JarvisCore ── Router ── Agenten                             │
│       │                                                      │
│       └── Werkzeugverzeichnis ──┬── Freigabestelle           │
│                                 ├── Recherche                │
│                                 ├── Mail (SMTP/Gmail/IMAP)   │
│                                 ├── System (Dateien, Apps)   │
│                                 └── Gedächtnis, Protokoll    │
│                                                              │
│  Datenbank: SQLite über node:sqlite                          │
└──────────────────────────────────────────────────────────────┘
```

### Verzeichnisse

```
src/
  shared/      Typen, Statuswerte, IPC-Vertrag (von beiden Seiten benutzt)
  core/
    db/        Schema, Migrationen, Repositories
    services/  Konfiguration, Zugangsdaten, Protokoll, Freigaben, Ereignisse,
               LLM-Anbieter, Mail (SMTP/Gmail/IMAP/OAuth), Sprache, Kalender, System
    research/  HTTP mit robots.txt, Suchdienste, HTML-Auswertung, Adressbewertung
    tools/     Werkzeugverzeichnis und die Werkzeuge selbst
    agents/    Grundregeln, Agentendefinitionen, Router, Mailerzeugung, JarvisCore
    kernel.ts  Zusammenbau aller Abhängigkeiten
  main/        Electron-Hauptprozess und IPC-Empfänger
  preload/     Die einzige Brücke ins Fenster
  renderer/    React-Oberfläche
  setup/       Einrichtungsassistent für die Kommandozeile
tests/         Datenbank, Freigaben, Verifizierung, Auswertung, System, Ablauf
```

---

## Datenmodell

SQLite, Migrationen über `PRAGMA user_version` (`src/core/db/schema.ts`).

| Tabelle                | Zweck                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| `companies`            | Unternehmen; eindeutig über Domain sowie über Name + Ort               |
| `contacts`             | Ansprechpartner mit Funktion                                          |
| `email_addresses`      | Adressen mit Verifizierungsgrad, Verfahren und Beleg                  |
| `company_claims`       | Aussagen, getrennt nach `FAKT` (mit Quelle) und `KI_EINSCHAETZUNG`    |
| `sources`              | Jede abgerufene Seite mit Zeitpunkt, Status und Textausschnitt         |
| `outreach_campaigns`   | Kampagnen (Leistung, Region, Zielanzahl)                              |
| `campaign_targets`     | Zuordnung Kampagne ↔ Unternehmen mit Status und Akquisegrund           |
| `emails`               | Ein- und ausgehende Nachrichten samt Inhaltsprüfsumme                  |
| `approvals`            | Freigaben: Aktion, Prüfsumme, Status, Gültigkeit, Entscheidung         |
| `interaction_history`  | Kontakthistorie je Unternehmen                                        |
| `tasks`                | Aufgabenliste                                                         |
| `memory_items`         | Benannte Merkposten (Präferenzen, Firmenwissen, Notizen)              |
| `conversation_messages`| Gesprächsverlauf je Sitzung, löschbar                                 |
| `suppression_list`     | Sperrliste für Adressen und Domains                                   |
| `audit_logs`           | Protokoll aller Handlungen                                            |
| `settings`             | Kleinigkeiten, die nicht in die Konfiguration gehören                  |

Das Gedächtnis ist bewusst zweigeteilt: `memory_items` hält einzelne, benannte
Merkposten, die JARVIS ausdrücklich anlegt; `conversation_messages` hält den
Verlauf und lässt sich jederzeit vollständig löschen. Es gibt keine stille
Dauerspeicherung ganzer Gespräche.

---

## Agenten und Werkzeuge

`JarvisCore` entscheidet, wer zuständig ist – erst über Stichwörter, sonst über
eine kurze Rückfrage an das Sprachmodell (`src/core/agents/router.ts`). Der
gewählte Agent bekommt nur seine eigenen Werkzeuge zu sehen; das hält die
Auswahl klein und die Zuständigkeit sauber.

| Agent                  | Zuständig für                                                    |
| ---------------------- | ---------------------------------------------------------------- |
| `JarvisCore`           | Überblick, Aufgaben, Kalender, Protokoll, Wegweiser               |
| `CompanyResearchAgent` | Unternehmen suchen, Websites auslesen, Adressen bewerten          |
| `MailAgent`            | Entwürfe, Anhänge, Vorlesen, Freigabe anfordern, Versand, Antworten |
| `OutreachAgent`        | Kampagnen, Vorbereitung, Versandzentrale                          |
| `BrowserAgent`         | Einzelne Seiten öffnen und auslesen                               |
| `FileAgent`            | Dateien suchen, lesen, anlegen (Löschen/Überschreiben mit Freigabe) |
| `SystemAgent`          | Programme starten, Adressen öffnen, Zwischenablage                |
| `CalendarAgent`        | Termine lesen, Aufgaben verwalten                                 |

Ein Agent kann nichts „einfach behaupten“. Jede Wirkung nach außen läuft über
ein Werkzeug, jedes Werkzeug prüft seine Eingaben gegen ein Schema (zod) und
jedes Ergebnis landet im Protokoll. Fehlgeschlagene Werkzeuge liefern
`ok: false` samt Grund – daraus wird nie eine Erfolgsmeldung.

Vorhandene Werkzeuge: `search_web`, `open_website`,
`extract_company_information`, `verify_email`, `research_companies`,
`save_company`, `list_companies`, `get_company`, `add_company_note`,
`check_previous_contact`, `add_to_do_not_contact`, `list_do_not_contact`,
`remember`, `recall`, `create_email_draft`, `read_email_draft`,
`update_email_draft`, `list_email_drafts`, `add_attachment`,
`check_send_readiness`, `request_send_approval`, `send_email`, `fetch_replies`,
`create_campaign`, `prepare_outreach`, `compose_outreach_email`,
`list_outreach`, `list_campaigns`, `open_application`, `open_url`, `open_file`,
`search_files`, `read_file`, `create_file`, `overwrite_file`, `delete_file`,
`clipboard_write`, `request_approval`, `check_calendar`, `create_task`,
`list_tasks`, `complete_task`, `read_audit_log`.

---

## Sprache

```
Mikrofon → Aufnahme im Fenster → Erkennung → JarvisCore → Werkzeuge → Antwort
                                                                   ↓
                                                        Sprachausgabe
```

Erkennung und Ausgabe sind austauschbar: eingebaut im Fenster (ohne Schlüssel,
sofort nutzbar) oder über einen Dienst mit OpenAI-kompatibler Schnittstelle –
auch ein lokaler Whisper-Server. Steht keiner von beiden bereit, sagt JARVIS
das, statt eine Erkennung vorzutäuschen.

Während längerer Aufgaben meldet der Ereignisstrom Zwischenstände
(„Recherchiere beispiel-bau.de …“), die Kugel zeigt den Zustand:
`LISTENING`, `THINKING`, `EXECUTING`, `WAITING FOR APPROVAL`, `SPEAKING`.
