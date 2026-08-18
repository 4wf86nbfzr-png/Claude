# JARVIS

Ein lokaler Desktop-Assistent für Recherche, Akquise und Bürokram. Er wird per
Sprache oder Text bedient, recherchiert selbstständig Unternehmen und bereitet
Anschreiben vor — **versendet aber niemals eine E-Mail ohne ausdrückliche
Freigabe**.

```
Sie:    „Such mir 15 Bauunternehmen in Hamburg für unsere Baustellenbewachung."
JARVIS: „15 Unternehmen gefunden, für 12 eine verifizierte Kontaktadresse.
         Soll ich Akquise-Entwürfe vorbereiten?"
Sie:    „Ja."
JARVIS: „12 Entwürfe stehen. Soll ich den ersten vorlesen?"
Sie:    „Ja. … Mach ihn kürzer. … Perfekt, senden."
JARVIS: „Versand an kontakt@firma.de freigeben?"   ← erst hier wird versendet
```

---

## Schnellstart

```bash
npm install
npm run setup      # Firmenprofil, Absender, Versandweg, Suchanbieter
npm start          # baut und startet die App
```

Danach in der App unter **Einrichtung → Zugänge** mindestens den
Anthropic-API-Schlüssel eintragen. Die Checkliste dort zeigt, was noch fehlt.

Prüfen, ob die Umgebung stimmt:

```bash
npm run doctor
```

## Entwicklung

```bash
npm run dev        # Vite-Dev-Server + Electron mit Hot Reload
npm test           # 80 Tests, ohne Netzugriff
npm run typecheck  # Haupt- und Renderer-Prozess
npm run package    # Installationspaket via electron-builder
```

---

## Die Regel, um die herum alles gebaut ist

JARVIS darf eine E-Mail **niemals allein versenden.** Der Weg ist immer:

```
Recherche → Empfänger prüfen → Entwurf → vollständige Vorschau
          → Empfänger, Betreff und Text anzeigen bzw. vorlesen
          → eindeutige Freigabe abwarten → erst danach Versand
```

Technisch ist das keine Bitte an das Sprachmodell, sondern eine Sperre im Code:

* `MailAgent.sendApproved()` ist die **einzige** Stelle im gesamten Projekt, die
  einen Versandweg anspricht. Ihre erste Anweisung ist
  `ApprovalService.claim()`.
* `claim()` scheitert, wenn keine Freigabe vorliegt, wenn sie abgelehnt oder
  abgelaufen ist, wenn sie bereits verbraucht wurde — oder wenn der
  Fingerabdruck des Inhalts nicht mehr zu dem passt, was der Mensch gesehen hat.
* Jede Änderung am Entwurf erhöht die Revision und macht eine bestehende
  Freigabe damit ungültig.
* Eine Freigabe gilt genau einmal. Ein zweiter Versandversuch scheitert.
* Sammelversand gibt es nicht: `request_bulk_send_approval` erzeugt eine
  Freigabe **pro Nachricht**.

Gesprochene Freigaben werden bewusst streng ausgewertet
(`src/core/services/approvalPhrases.ts`): „senden", „freigeben",
„Mail abschicken", „ja, genau so senden" gelten. Alles mit Verneinung, Frage
oder Bedingung — „soll ich das senden?", „später senden", „noch nicht" — gilt
als **unklar**, und dann wird nachgefragt statt versendet.

Liegen mehrere Freigaben offen, gibt ein einfaches „senden" gar nichts frei;
JARVIS fragt, welche gemeint ist.

---

## Keine erfundenen Daten

Die zweite Regel: JARVIS erfindet keine Unternehmensdaten und vor allem keine
E-Mail-Adressen. Das ist ebenfalls in der Architektur verankert:

* Adressen werden **mechanisch** aus dem Seitenquelltext gelesen
  (`PageExtractor`) — aus `mailto:`-Links und aus dem Fließtext, inklusive der
  üblichen Verschleierungen wie `info (at) firma (punkt) de`.
* Das Sprachmodell bekommt die gefundenen Adressen als Liste und darf nur unter
  diesen auswählen. Nennt es eine andere, wird sie verworfen.
* Jede Adresse bekommt einen Status mit Begründung:

  | Status | Bedeutung |
  |---|---|
  | `VERIFIZIERT` | wörtlich auf Website, Kontaktseite oder im Impressum des Unternehmens veröffentlicht, Domain passt, MX-Eintrag vorhanden |
  | `WAHRSCHEINLICH` | gefunden, aber auf fremder Quelle oder mit abweichender Domain (z. B. Freemail) |
  | `NICHT_VERIFIZIERT` | ungültig, Systemadresse (`no-reply@`) oder ohne Mailserver |

* Standardmäßig darf **nur** an `VERIFIZIERT` versendet werden.
* Wird nichts Belegbares gefunden, sagt JARVIS genau das:
  „Keine verifizierte E-Mail-Adresse gefunden."
* Fakten und KI-Einschätzungen sind getrennt: Die Beschreibung eines
  Unternehmens stammt aus der Quelle, der Akquisegrund ist als
  `KI-EINSCHÄTZUNG:` gekennzeichnet.

Jede gespeicherte Angabe trägt Quelle und Abrufzeitpunkt.

---

## Was die App kann

**Konsole** — Chat und Sprache. Ein Orb zeigt den Zustand: `BEREIT`,
`LISTENING`, `THINKING`, `EXECUTING`, `WAITING FOR APPROVAL`. Leertaste startet
die Aufnahme, Escape bricht eine laufende Aufgabe ab. Freigaben erscheinen hier
als Panel mit vollständiger Vorschau, „Vorlesen", „Bearbeiten", „Abbrechen" und
einer zweistufigen Bestätigung für „Freigeben & senden".

**Versandzentrale** — eine Zeile pro Unternehmen mit Ansprechpartner, Adresse,
Quelle, Verifizierungsstatus, Akquisegrund, Mailstatus, letztem Kontakt und
Freigabestatus. Entwürfe lassen sich hier direkt bearbeiten; ein Sendeknopf
existiert bewusst nicht, nur „Freigabe anfordern".

**Kampagnen** — Zielgruppe, angebotene Leistung, Region, Zielanzahl. JARVIS
recherchiert dazu Unternehmen und schreibt je Unternehmen einen eigenen
Entwurf. Keine identische Massenmail.

**Protokoll** — jede Aktion mit Zeit, Akteur, Agent, Objekt und Ergebnis,
exportierbar als CSV. Darunter das Gedächtnis: was dauerhaft gespeichert ist,
mit Löschen-Knopf je Eintrag.

**Einrichtung** — Checkliste, Firmenprofil, Modell, Postfach, Recherche,
Versandregeln, Sprache, Integrationen und Zugänge mit Selbsttest je Zugang.

---

## Tech-Stack und warum

**Electron + React + TypeScript + Vite**, SQLite über `node:sqlite`.

Tauri wäre schlanker im Speicherverbrauch, kostet hier aber genau das, worauf
dieses Projekt steht: IMAP, SMTP, MIME-Erzeugung und OAuth liegen ausgereift im
Node-Ökosystem (`imapflow`, `nodemailer`), und der gesamte Agentenkern ist
Node-Code, der sich ohne Rust-Brücke testen lässt. Der Sicherheitsvorsprung von
Tauri lässt sich in Electron weitgehend nachbauen — was hier auch geschieht:

* `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
* strikte CSP, `connect-src 'self'` — der Renderer spricht **nie** selbst mit
  dem Netz, alles läuft über IPC in den Hauptprozess
* IPC nur über eine feste Kanalliste (`src/shared/ipc.ts`); der Renderer sieht
  `ipcRenderer` nicht
* Navigation nach außen wird unterbunden und im echten Browser geöffnet
* die einzige Geräteberechtigung ist das Mikrofon, und nur bei aktiver
  Spracheingabe
* Geheimnisse im Schlüsselbund des Betriebssystems (`safeStorage`); wo der
  fehlt, AES-256-GCM mit lokaler Schlüsseldatei (0600) — die App sagt, welcher
  Speicher aktiv ist

`node:sqlite` ist eingebaut, also gibt es keine native Abhängigkeit, die bei
jedem Electron-Update neu kompiliert werden müsste. Ist `better-sqlite3`
installiert, wird es bevorzugt.

---

## Aufbau

```
src/
  shared/        Typen und IPC-Vertrag, von beiden Seiten benutzt
  main/          Electron: Fenster, Härtung, IPC, Schlüsselbund, OS-Brücke
  core/          Der gesamte Agentenkern — läuft auch ohne Electron
    JarvisCore   Router: Gespräch, Werkzeugschleife, Freigabe-Abfang
    agents/      MailAgent, CompanyResearchAgent, OutreachAgent,
                 BrowserAgent, FileAgent, CalendarAgent, SystemAgent, VoiceAgent
    tools/       Werkzeugverzeichnis; jede echte Handlung läuft hierüber
    services/    Approval, Audit, Credentials, Memory, Compliance, Settings
    llm/         Anbieterabstraktion: Anthropic, OpenAI-kompatibel, Ollama
    mail/        SMTP, Gmail (OAuth), IMAP; Graph ist vorbereitet
    research/    Suche, höflicher Abruf, Seitenauswertung, Adressprüfung
    db/          Schema, Migration, Repositories
  renderer/      React-Oberfläche
tests/           Vitest — Sperre, Regeln, Recherche, Ablauf
scripts/         Bau, Einrichtung, Diagnose, Gmail-OAuth
```

`src/core` kennt Electron nicht. Die Tests bauen eine vollständige Laufzeit
gegen eine Datenbank im Arbeitsspeicher.

### Agenten

| Agent | Zuständig für |
|---|---|
| `JarvisCore` | Gesprächsführung, Auswahl der Werkzeuge, Statusmeldungen |
| `MailAgent` | Entwürfe, Betreff, Empfänger, Anhänge, Versand nach Freigabe, Antwortzuordnung |
| `CompanyResearchAgent` | Unternehmen finden, Seiten lesen, Kontaktdaten belegen und bewerten |
| `OutreachAgent` | Recherche und Mail verbinden, individuelle Entwürfe, Dublettenschutz |
| `BrowserAgent` | Öffentliche Seiten lesen, Seiten im Browser des Benutzers öffnen |
| `FileAgent` | Dateien in freigegebenen Ordnern suchen, lesen, schreiben, löschen |
| `CalendarAgent` | ICS-Kalender lesen, offene Aufgaben |
| `SystemAgent` | Programme starten, Pfade öffnen, Zwischenablage |
| `VoiceAgent` | Spracherkennung und Sprachausgabe |

Dazu die Dienste `ApprovalService`, `AuditLogService`, `CredentialService`,
`MemoryService`, `ComplianceService`.

### Werkzeuge

Ein Agent kann nichts behaupten, was nicht über ein Werkzeug lief. Jedes
Werkzeug beschreibt seine Parameter als Zod-Schema; daraus entsteht das
JSON-Schema für das Modell **und** die Prüfung der tatsächlichen Aufrufe.

`search_web`, `open_website`, `research_companies`,
`extract_company_information`, `verify_email`, `list_companies`,
`mark_do_not_contact`, `add_to_suppression_list`, `create_email_draft`,
`read_email_draft`, `list_email_drafts`, `update_email_draft`,
`request_send_approval`, `request_bulk_send_approval`, `send_email`,
`check_replies`, `list_pending_approvals`, `create_campaign`, `list_campaigns`,
`prepare_outreach`, `run_campaign`, `show_send_desk`, `open_application`,
`open_file`, `search_files`, `read_file`, `create_file`,
`request_file_overwrite`, `request_file_delete`, `delete_file`,
`use_clipboard`, `check_calendar`, `create_task`, `remember`, `list_memory`,
`read_audit_log`, `system_status`.

### Freigabepflichtige Aktionen

E-Mail versenden · Sammelversand · Dateien löschen · Dateien überschreiben ·
Programme installieren · Systemeinstellungen ändern · kostenpflichtige
Aktionen · Accounts verändern · Daten veröffentlichen · Formulare absenden ·
Nachrichten an externe Personen.

Die Liste ist eine Konstante im Code (`ALWAYS_APPROVAL_REQUIRED`) und lässt
sich zur Laufzeit nicht aufweichen.

---

## Recht und Anstand

Version 1 enthält:

* Sperrliste für einzelne Adressen und ganze Domains (Opt-out)
* „Nicht kontaktieren"-Kennzeichnung je Unternehmen
* vollständige Kontakthistorie
* Sperrfrist für einen zweiten Erstkontakt (Voreinstellung 90 Tage)
* Dublettenprüfung bei Unternehmen, Adressen und Entwürfen
* Tageslimit und Mindestabstand zwischen zwei Sendungen
* Quellennachweis für jede Angabe
* robots.txt-Beachtung und Wartezeit zwischen Abrufen bei der Recherche
* keine versteckte Massenversandfunktion, keine Spamfilter-Umgehung

**Das ersetzt keine Rechtsberatung.** Kaltakquise per E-Mail ist in
Deutschland an enge Voraussetzungen geknüpft (§ 7 UWG, DSGVO). Die Werkzeuge
sind da, damit Sie sich daran halten *können* — die Verantwortung dafür, ob ein
konkretes Anschreiben zulässig ist, bleibt bei Ihnen.

---

## Fehler bleiben Fehler

Es gibt keinen Pfad, auf dem ein Fehlschlag als Erfolg gemeldet wird. Lehnt der
SMTP-Server den Empfänger ab, wird die Nachricht als `fehlgeschlagen`
gespeichert, das Protokoll bekommt `versand.fehlgeschlagen`, und die Oberfläche
zeigt die Serverantwort. Auch ein Werkzeugfehler geht unverändert an das Modell
zurück, damit es reagieren statt raten kann.

---

## Was noch nicht drin ist

* **Microsoft Graph / Outlook**: Die Schnittstelle `MailTransport` ist
  vorbereitet, die Implementierung fehlt. Der Versandweg „graph" meldet das
  ausdrücklich, statt so zu tun, als hätte er gesendet.
* **Bildschirmautomatisierung**: bewusst nicht enthalten. Gesteuert wird über
  offizielle Schnittstellen (`shell.open*`, Plattform-Starter), nicht über
  simulierte Maus- und Tastatureingaben.
* **Weckwort im Hintergrund**: Das Weckwort wird nur ausgewertet, während die
  Aufnahme läuft. Dauerhaftes Mithören ist nicht eingebaut.
* **Angebots- und PDF-Erstellung, WhatsApp, Telefonie, CRM-Anbindung**: als
  weitere Agenten hinter derselben Freigabe-Engine vorgesehen.

---

## Zugänge, die Sie noch hinterlegen müssen

| Zugang | Wofür | Pflicht? |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sprachmodell (`claude-opus-5`) | ja, außer bei OpenAI oder Ollama |
| `OPENAI_API_KEY` | OpenAI als Modell, Whisper, OpenAI-Stimme | nur bei diesen Optionen |
| `SMTP_PASSWORD` | Postausgang über SMTP | bei Versandweg SMTP |
| `GMAIL_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN` | Postausgang über Gmail | bei Versandweg Gmail |
| `IMAP_PASSWORD` | Antworten zuordnen | optional |
| `BRAVE_SEARCH_API_KEY` / `TAVILY_API_KEY` / `SERPAPI_API_KEY` | bessere Rechercheergebnisse | optional |
| `ELEVENLABS_API_KEY` | natürlichere Sprachausgabe | optional |

Gmail-Token erzeugen:

```bash
node scripts/gmail-auth.mjs
```

Alles Weitere steht in `.env.example`.
