# JARVIS — persönlicher Desktop-KI-Agent

Eine lokale Desktop-Anwendung, die per Sprache und Text bedient wird. Sie
recherchiert Unternehmen aus öffentlichen Quellen, bereitet daraus individuelle
Akquise-Mails vor und versendet sie — **aber erst nach ausdrücklicher Freigabe**.

Alles liegt auf dem eigenen Rechner: die Datenbank, das Protokoll, die
Zugangsdaten. Nach außen gehen nur die Anfragen an das Sprachmodell, an die
Suchmaschine und an die abgerufenen Unternehmensseiten.

---

## Die Regel, um die es geht

> **JARVIS versendet niemals selbständig eine E-Mail.**

Der Ablauf ist fest verdrahtet und lässt sich nicht abkürzen:

```
Recherche → Empfänger prüfen → Entwurf → vollständige Vorschau
   → Empfänger und Betreff anzeigen → vorlesen lassen
   → auf eindeutige Freigabe warten → erst danach senden
```

Abgesichert ist das an drei Stellen:

1. Das Werkzeug `send_email` versendet nichts. Es legt eine Freigabeanfrage an.
2. Der Versand läuft ausschließlich über `performSend()`. Diese Funktion
   prüft selbst noch einmal, ob eine erteilte Freigabe vorliegt und ob sie zu
   genau diesem Entwurf gehört.
3. Wird ein Entwurf nach der Freigabe geändert, verfällt die Freigabe. Es kann
   nichts versendet werden, das der Nutzer nicht in dieser Fassung gesehen hat.

Als Freigabe gelten eindeutige Äußerungen: „Senden“, „Freigeben“,
„Mail abschicken“, „Ja, genau so senden“. Alles andere — auch ein
„Ja, aber der zweite Absatz muss noch raus“ — gilt als unklar; dann fragt
JARVIS nach. Sind mehrere Freigaben offen, wird nicht geraten, sondern nach
der Nummer gefragt.

Dieselbe Freigabepflicht gilt für: Dateien löschen und überschreiben,
Programme installieren, Systemeinstellungen ändern, kostenpflichtige Aktionen,
Accounts ändern, Daten veröffentlichen, Formulare absenden und jede Nachricht
an externe Personen.

---

## Schnellstart

```bash
cd jarvis
npm install
npm run dev
```

Beim ersten Start steht unter **Einstellungen** eine Prüfliste: was schon
funktioniert, was noch fehlt und was dafür zu tun ist.

Weitere Befehle:

| Befehl | Wirkung |
| --- | --- |
| `npm run dev` | Entwicklungsmodus mit Hot Reload |
| `npm test` | Testreihe (Vitest) |
| `npm run typecheck` | Typen prüfen |
| `npm run build` | Typen prüfen und bauen |
| `npm run start` | Gebaute Fassung starten |
| `npm run dist` | Installationspaket bauen (dmg / nsis / AppImage) |

---

## Was Sie noch hinterlegen müssen

Alle Schnittstellen sind fertig implementiert. Was fehlt, sind Ihre Zugänge.
Eintragen unter **Einstellungen → Zugänge**; dort landen sie verschlüsselt im
Schlüsselbund des Betriebssystems. Alternativ als Umgebungsvariablen oder in
einer `.env` (Vorlage: `.env.example`).

### Zwingend erforderlich

| Zugang | Wofür | Woher |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Das Sprachmodell. Ohne diesen Schlüssel antwortet JARVIS nicht. | <https://console.anthropic.com/settings/keys> |

### Für den Mailversand — eines von beidem

**Variante A: SMTP** (jeder Mailanbieter)

- In den Einstellungen: Server, Port, Benutzer, Absenderadresse und Signatur.
- Als Zugang: `SMTP_PASSWORD`.
- Bei Gmail oder Microsoft 365 ein anwendungsspezifisches Passwort verwenden —
  oder besser Variante B.

**Variante B: Gmail per OAuth** (empfohlen, JARVIS sieht Ihr Passwort nie)

1. In der [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   ein Projekt anlegen und die Gmail API aktivieren.
2. Unter „Anmeldedaten“ eine **OAuth-Client-ID vom Typ Desktop** erzeugen.
3. `GMAIL_CLIENT_ID` und `GMAIL_CLIENT_SECRET` in JARVIS eintragen.
4. Einstellungen → E-Mail → Versandweg auf „Gmail“ stellen → **Mit Google
   anmelden**. Das Refresh-Token setzt JARVIS danach selbst.

Ohne eingerichteten Versandweg funktioniert alles bis zum Entwurf. Nur der
Versand ist dann nicht möglich — und JARVIS sagt das auch, statt Erfolg zu melden.

### Dringend empfohlen

| Zugang | Wofür |
| --- | --- |
| `BRAVE_SEARCH_API_KEY` | Websuche für die Firmenrecherche (<https://brave.com/search/api/>). Ohne Schlüssel nutzt JARVIS eine schlüssellose DuckDuckGo-Variante — die funktioniert, wird aber häufig gedrosselt. Alternativ `TAVILY_API_KEY` oder `SERPAPI_API_KEY`. |

### Optional

| Zugang | Wofür |
| --- | --- |
| `OPENAI_API_KEY` | Spracherkennung (Whisper) und Sprachausgabe. Ohne diesen Schlüssel: in den Einstellungen auf „Systemstimme“ umstellen — die läuft lokal. |
| `DEEPGRAM_API_KEY` | Alternative Spracherkennung |
| `ELEVENLABS_API_KEY` | Alternative Sprachausgabe |
| `IMAP_PASSWORD` | Posteingang lesen, um Antworten den Firmen zuzuordnen |

Außerdem in den Einstellungen ausfüllen, weil es in jeden Mailtext einfließt:
eigener Firmenname, angebotene Leistungen, Signatur (mit den Pflichtangaben
nach § 5 TMG) und der Abmeldehinweis.

---

## Technischer Aufbau

**Electron + React + TypeScript**, nicht Tauri. Der Grund ist der Kern der
Aufgabe: E-Mail. Node.js bringt mit `nodemailer` und `imapflow` ausgereifte
Bibliotheken für SMTP und IMAP mit, dazu OAuth-Bibliotheken und ein großes
Oekosystem für alles, was später dazukommen soll (Microsoft Graph, CRM,
Kalender). In Rust wäre jede dieser Anbindungen deutlich mehr Arbeit bei
weniger Reife. Der höhere Speicherbedarf von Electron fällt bei einer
Anwendung, die ohnehin dauerhaft im Hintergrund arbeitet, kaum ins Gewicht.

Die Sicherheit wird über die Electron-Einstellungen hergestellt:
`contextIsolation` an, `nodeIntegration` aus, das Fenster erreicht den Rechner
ausschließlich über eine schmale, typisierte IPC-Brücke. Eine strenge
Content-Security-Policy verbietet dem Fenster jeden eigenen Netzzugriff.

```
src/
  shared/            Typen und IPC-Vertrag (von allen Prozessen genutzt)
  preload/           contextBridge — die einzige Verbindung ins Fenster
  main/
    index.ts         Start: Datenverzeichnis, Datenbank, Werkzeuge, Fenster
    ipc.ts           IPC-Handler (dünn: prüfen, weiterreichen, antworten)
    agents/
      core.ts             JarvisCore — Routing, Werkzeugschleife, Freigabeworte
      mail-agent.ts       Entwürfe, Versandgrenzen, Versand nach Freigabe
      research-agent.ts   Firmen suchen und Seiten auslesen
      outreach-agent.ts   Recherche + Entwürfe, Kampagnenlauf
    tools/           Werkzeuge (zod-Schema -> JSON-Schema für das Modell)
    llm/             Anthropic / OpenAI / Ollama hinter einer Schnittstelle
    mail/            SMTP, Gmail-API, IMAP, OAuth, MIME-Aufbau
    research/        Suche, höflicher Abruf, Extraktion, Einstufung
    calendar/        iCalendar lesen
    voice/           Spracherkennung und Sprachausgabe
    services/        Freigaben, Protokoll, Gedächtnis, Zugänge, Einstellungen
    db/              SQLite: Treiber, Schema, Migrationen, Repositories
  renderer/          React-Oberfläche
```

### Agenten

`JarvisCore` entscheidet, welche Werkzeuge gebraucht werden, und führt die
Schleife. Zwei Dinge macht der Kern selbst, ohne das Modell zu fragen:
Freigabeworte auswerten und „Stopp“ befolgen. Das Modell könnte beides sonst
umdeuten.

| Agent | Aufgabe |
| --- | --- |
| `MailAgent` | Entwürfe, Empfänger, Anhänge, Versand nach Freigabe, Antworten zuordnen |
| `CompanyResearchAgent` | Firmen suchen, Startseite/Impressum/Kontakt auslesen, Adressen einstufen |
| `OutreachAgent` | Recherche und Mail verbinden, Begründung erstellen, Kampagnen fahren |
| `FileAgent` | Dateien suchen, lesen, anlegen; Löschen nur nach Freigabe |
| `SystemAgent` | Programme, Ordner und Zwischenablage |
| `BrowserAgent` | Adressen im Standardbrowser öffnen |
| `CalendarAgent` | Termine aus .ics-Dateien, Aufgabenliste |
| `MemoryService` | gemerkte Angaben — einsehbar und löschbar |
| `ApprovalService` | Freigaben |
| `AuditLogService` | Protokoll |
| `CredentialService` | Zugangsdaten |

### Werkzeuge

Ein Agent behauptet nie, etwas getan zu haben. Er ruft ein Werkzeug und bekommt
ein strukturiertes Ergebnis zurück — auch im Fehlerfall. Nur dieses Ergebnis
darf er weitererzählen.

`search_web`, `open_website`, `extract_company_information`, `research_companies`,
`verify_email`, `list_company_emails`, `create_email_draft`, `read_email_draft`,
`update_email_draft`, `list_email_drafts`, `add_email_attachment`, `send_email`,
`send_emails_bulk`, `sync_email_replies`, `set_do_not_contact`, `list_companies`,
`get_company`, `note_company`, `set_company_do_not_contact`, `create_campaign`,
`run_campaign`, `prepare_outreach_draft`, `list_campaigns`, `set_campaign_status`,
`list_send_center`, `check_calendar`, `list_tasks`, `create_task`,
`set_task_status`, `remember`, `recall`, `forget`, `search_files`, `read_file`,
`create_file`, `delete_file`, `list_workspace`, `open_path`, `open_application`,
`open_website_in_browser`, `clipboard`.

### Datenbank

SQLite im Datenverzeichnis der Anwendung. Als Treiber wird das in Node
eingebaute `node:sqlite` verwendet — dadurch entfällt jede native
Kompilierung und jedes `electron-rebuild`. Ist das Modul einmal nicht
verfügbar, springt `better-sqlite3` ein, sofern installiert.

Tabellen: `companies`, `contacts`, `email_addresses`, `sources`,
`outreach_campaigns`, `emails`, `email_attachments`, `interaction_history`,
`approvals`, `tasks`, `audit_logs`, `memory_facts`, `conversations`, `messages`,
`do_not_contact`, `app_settings`, `send_log`.

Dubletten werden über die Domain erkannt, nicht über den Firmennamen — „Bau
Nord GmbH“ und „Bau Nord“ auf derselben Website sind eine Firma. Eine zweite
Recherche füllt nur Lücken; bereits geprüfte Angaben bleiben stehen.

---

## Wie die Recherche arbeitet

Es wird nichts erfunden. Zurück kommt nur, was wörtlich auf einer Seite steht.

1. Websuche zur Anfrage. Verzeichnisportale (Gelbe Seiten, LinkedIn, Yelp …)
   fallen raus — dort steht nicht die Firma selbst.
2. Je Firma: Startseite → Impressum → Kontaktseite. Jede gelesene Seite wird als
   Quelle gespeichert, mit URL, Zeitpunkt und Prüfsumme des Textes.
3. Gefundene Adressen werden eingestuft.

**E-Mail-Adressen bekommen einen von drei Zuständen:**

| Status | Bedeutung |
| --- | --- |
| `VERIFIZIERT` | Stand wörtlich auf einer Seite des Unternehmens, die Domain passt zur Website, und die Domain hat einen MX-Eintrag. |
| `WAHRSCHEINLICH` | Gefunden, aber etwas passt nicht ganz: Freemail-Postfach, abweichende Domain oder Fund in einer Fremdquelle. |
| `NICHT_VERIFIZIERT` | Syntaktisch kaputt, kein MX-Eintrag, oder ein Postfach, das nichts annimmt (`no-reply`, `postmaster`). |

Adressen werden **nie konstruiert**. `vorname.nachname@firma.de` ist eine
Vermutung, keine Angabe — solche Adressen entstehen hier gar nicht erst. Wird
nichts gefunden, steht in der Versandzentrale „Keine verifizierte
E-Mail-Adresse gefunden“.

Standardmäßig dürfen nur `VERIFIZIERT`-Adressen angeschrieben werden. Diese
Vorgabe lässt sich abschalten — dann greift der Hinweis in den Einstellungen.

**Höflich abrufen:** eigener User-Agent, robots.txt wird gelesen und beachtet,
Pause zwischen zwei Abrufen derselben Domain, harte Größen- und Zeitgrenze.

---

## Fakt und Einschätzung

Beides wird getrennt gespeichert und getrennt angezeigt:

```
FAKT
  Das Unternehmen bietet Hochbau und Projektentwicklung an.
  Quelle: https://bau-nord.de/leistungen (abgerufen am 18.08.2026)

KI-EINSCHAETZUNG
  Aufgrund laufender Baustellen könnte Baustellenbewachung relevant sein.
```

Der Akquisegrund in der Versandzentrale ist immer eine Einschätzung. Daneben
steht in `acquisition_basis`, auf welche Fakten sie sich stützt.

---

## Recht und Anstand

Das System ist so gebaut, dass sich geltende Vorgaben einhalten lassen. Die
Verantwortung für den konkreten Versand bleibt beim Nutzer — kaltakquirierende
Werbemails an Unternehmen sind in Deutschland rechtlich heikel (§ 7 UWG), und
kein Programm nimmt einem diese Abwägung ab.

Eingebaut sind:

- **Sperrliste** für einzelne Adressen und ganze Domains; gesperrte Empfänger
  bekommen nicht einmal einen Entwurf.
- **„Nicht kontaktieren“** je Firma.
- **Dublettenprüfung** und **Sperrfrist** (Vorgabe 180 Tage): Eine bereits
  angeschriebene Firma bekommt keinen zweiten Erstkontakt, außer der Nutzer
  verlangt es ausdrücklich.
- **Versandlimits**: höchstens N Mails in 24 Stunden, Mindestabstand zwischen
  zwei Sendungen.
- **Abmeldehinweis** unter jeder Akquise-Mail.
- **Quellennachweis** zu jeder Angabe.
- **Kontakthistorie** je Firma.

Was bewusst **nicht** eingebaut ist: eine versteckte Massenversandfunktion,
irgendetwas zur Umgehung von Spam-Filtern, oder ein Weg, Kontaktlisten aus
fremden Quellen einzuspielen.

---

## Sprachsteuerung

```
Aufnahme im Fenster → Spracherkennung → JarvisCore → Werkzeuge → Antwort → Stimme
```

Die Aufnahme läuft über `MediaRecorder`; der Pegel treibt den Orb. Erkannt
wird im Hauptprozess, damit kein Schlüssel ins Fenster muss. Anbieter sind
austauschbar: OpenAI Whisper oder Deepgram für die Erkennung, OpenAI oder
ElevenLabs für die Stimme — oder die Systemstimme, die ohne Dienst und ohne
Schlüssel funktioniert.

Während längerer Aufgaben meldet JARVIS Zwischenstände („Lese bau-nord.de …“).

---

## Fehler

JARVIS täuscht keinen Erfolg vor. Meldet der Server einen Fehler, heißt es
„Versand fehlgeschlagen“ mit der Meldung des Servers — der Entwurf steht dann
auf „Fehler“ und bleibt erhalten. Dasselbe gilt für Recherche und Dateizugriffe.

---

## Datenschutz

- Datenbank, Protokoll und Zugänge liegen ausschließlich lokal.
- Zugangsdaten sind verschlüsselt: in Electron über `safeStorage`, also mit
  einem Schlüssel im Schlüsselbund des Betriebssystems. Steht der nicht zur
  Verfügung, wird AES-256-GCM mit einer lokalen Schlüsseldatei (Rechte 0600)
  verwendet — die Einrichtungsprüfung sagt, welcher Fall vorliegt.
- Das Fenster kann selbst nichts nachladen (Content-Security-Policy).
- Dateizugriff nur im Arbeitsordner und in Verzeichnissen, die der Nutzer
  ausdrücklich freigibt. Geprüft wird der aufgelöste Pfad, damit `../..`
  nicht daran vorbeiführt.
- Das Gedächtnis ist einsehbar und einzeln löschbar. Es wird nicht alles
  mitgeschrieben — eine Notiz entsteht nur, wenn das Modell sie ausdrücklich
  anlegt.

---

## Vorbereitet, aber noch nicht angeschlossen

Die Architektur ist auf Erweiterung angelegt. Für diese Punkte gibt es die
Schnittstelle, aber noch keine Anbindung:

- **Microsoft Outlook / Graph** — als weiterer `MailTransport` neben SMTP und
  Gmail. Die Schnittstelle in `src/main/mail/types.ts` ist genau dafür da.
- **Google Calendar / Microsoft 365** — als weitere Quelle hinter
  `check_calendar`. Lokale `.ics`-Dateien werden bereits gelesen.
- **WhatsApp Business, Telefonie, CRM, Cloudspeicher, PDF- und
  Angebotserstellung** — als weitere Werkzeuge im Verzeichnis. Ein Werkzeug
  besteht aus Name, Beschreibung, zod-Schema und einer `run`-Funktion; mehr
  braucht es nicht, um es dem Modell verfügbar zu machen.

---

## Tests

```bash
npm test
```

73 Tests, Schwerpunkt auf dem, was schiefgehen darf und nicht schiefgehen soll:

- **Freigaben**: nichts läuft ohne Entscheidung; nichts läuft zweimal;
  Fehler werden durchgereicht statt beschönigt; Freigabeworte werden streng
  ausgewertet.
- **Versand**: kein Versand ohne Freigabe, nicht mit fremder Freigabe, nicht
  mit offener Freigabe, nicht zweimal; Sperrliste, Tageslimit und
  Dublettenprüfung greifen; eine Aenderung setzt die Freigabe zurück.
- **Recherche**: Extraktion findet nur, was dasteht; Adressen werden korrekt
  eingestuft; Verzeichnisportale fallen raus.
- **Datenbank**: Migrationen, Dubletten über die Domain, keine Herabstufung
  einer Adresse.
- **Werkzeuge**: alle Schemata übersetzen sich; Abstürze werden zu Fehlern.
- **Kalender**: Faltung, Zeitstempel, Serientermine.
