# JARVIS

Persönlicher Desktop-Assistent: Sprache rein, Arbeit raus — Recherche,
Firmendatenbank, Akquise-Mails. **Versendet wird nichts ohne ausdrückliche
Freigabe.** Alle Daten liegen lokal.

```
Sie:     „Such mir 15 Bauunternehmen in Hamburg für unsere Baustellenbewachung."
JARVIS:  recherchiert, prüft Adressen, legt sie in der Datenbank ab
JARVIS:  „Ich habe 15 Unternehmen gefunden. Für 12 konnte ich eine verifizierte
          geschäftliche Kontaktadresse finden. Soll ich Entwürfe vorbereiten?"
Sie:     „Ja."       → 12 individuelle Entwürfe
Sie:     „Lies mir den ersten vor."
Sie:     „Mach ihn kürzer."
Sie:     „Senden."
JARVIS:  zeigt Empfänger, Betreff, finalen Text und fragt:
         „Versand an kontakt@firma.de freigeben?"
Sie:     „Ja."       → JETZT erst geht die Mail raus
```

---

## Inhalt

- [Schnellstart](#schnellstart)
- [Welche Zugänge Sie noch hinterlegen müssen](#welche-zugänge-sie-noch-hinterlegen-müssen)
- [Die Sicherheitsregel](#die-sicherheitsregel)
- [Wie recherchiert wird](#wie-recherchiert-wird)
- [Aufbau](#aufbau)
- [Bedienung](#bedienung)
- [Entwicklung](#entwicklung)
- [Was Version 1 noch nicht kann](#was-version-1-noch-nicht-kann)
- [Recht und Compliance](#recht-und-compliance)

---

## Schnellstart

Voraussetzung: Node.js 20.11 oder neuer.

```bash
cd jarvis
npm install
cp .env.example .env      # optional – geht auch über den Assistenten
npm run setup             # fragt ab, was noch fehlt
npm start                 # Desktop-App
```

Ohne Fenster, z. B. zum Prüfen der Einrichtung:

```bash
npm run jarvis            # JARVIS in der Konsole
```

Beides benutzt denselben Kern und dieselbe Datenbank.

> **Zum nativen Modul:** `better-sqlite3` ist in C++ geschrieben und passt
> immer nur zu *einer* Laufzeit — entweder zu Node oder zu Electron. Die
> Skripte erledigen den Wechsel selbst (`npm start` baut für Electron,
> `npm test` und `npm run jarvis` bauen für Node zurück; dauert unter einer
> Sekunde). Falls doch einmal `NODE_MODULE_VERSION`-Meckern auftaucht:
> `npm run rebuild:node` bzw. `npm run rebuild:electron`.

**Wo liegen die Daten?** Standardmäßig in `~/.jarvis`:
`jarvis.db` (SQLite), `attachments/`, `audio/`, `logs/` und die verschlüsselten
Zugangsdaten. Anderer Ort über `JARVIS_DATA_DIR`.

---

## Welche Zugänge Sie noch hinterlegen müssen

Der Code ist vollständig. Was fehlt, sind Ihre Konten. In dieser Reihenfolge:

### 1. Sprachmodell — zwingend

Ohne Sprachmodell versteht JARVIS keine Anweisungen.

| Anbieter | Was Sie brauchen | Wo |
|---|---|---|
| **Anthropic** (Standard) | `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| OpenAI | `OPENAI_API_KEY` | platform.openai.com → API Keys |
| Ollama (lokal) | nichts — nur `ollama serve` | Modell muss Werkzeugaufrufe können, z. B. `qwen2.5:14b` |

Anbieter umstellen über `JARVIS_LLM_PROVIDER`.

### 2. Websuche — sehr empfohlen

Ohne Schlüssel läuft die Recherche über die HTML-Fassung von DuckDuckGo. Das
funktioniert, findet aber deutlich weniger und bricht, sobald DuckDuckGo sein
Layout ändert. Für ernsthafte Akquise:

- **Tavily** (`TAVILY_API_KEY`, tavily.com) — auf Recherche zugeschnitten, gute Textausschnitte
- Brave Search (`BRAVE_API_KEY`)
- SerpAPI (`SERPAPI_API_KEY`) — Google-Ergebnisse

Dann `JARVIS_SEARCH_PROVIDER=tavily` setzen.

### 3. Postfach — zwingend zum Senden

Drei Wege, einer genügt:

**a) SMTP** — funktioniert mit jedem Postfach, auch beim Firmen-Hoster.
`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, ggf. `SMTP_PORT`.
Viele Hoster verlangen dafür ein eigenes App-Passwort statt des
Anmeldekennworts. Dann `JARVIS_MAIL_TRANSPORT=smtp`.

**b) Gmail über OAuth** — für Google-Konten der bessere Weg: kein
App-Passwort, gesendete Mails landen im Ordner „Gesendet".
In der Google Cloud Console eine OAuth-Client-ID vom Typ **Desktop** anlegen,
`GOOGLE_CLIENT_ID` (und ggf. `GOOGLE_CLIENT_SECRET`) eintragen, die
Redirect-URI `http://127.0.0.1:53682/oauth/google` dort hinterlegen. Dann in
der App unter *Einrichtung → Google-Konto verbinden* anmelden.
Benötigte Bereiche: `gmail.send`, `gmail.readonly`, `userinfo.email`.

**c) Microsoft 365 / Outlook** — im Entra-Portal eine App-Registrierung
anlegen (Plattform „Mobile and desktop", Redirect
`http://127.0.0.1:53683/oauth/microsoft`), `MS_CLIENT_ID` eintragen,
Berechtigungen `Mail.Send`, `Mail.Read`, `User.Read`, `offline_access`.

Zusätzlich `JARVIS_MAIL_FROM_ADDRESS` und `JARVIS_MAIL_FROM_NAME` setzen —
damit steht der Absender fest, unabhängig vom technischen Konto.

### 4. Posteingang — optional

`IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD`. Nur nötig, damit JARVIS Antworten
den angeschriebenen Firmen zuordnen kann („Antwort erhalten" in der
Versandzentrale). Wird ausschließlich lesend verwendet.

### 5. Sprache — läuft ohne Schlüssel

Standardmäßig übernimmt das Fenster Erkennung und Ausgabe über die
Web-Speech-Schnittstelle des Systems. Kostet nichts. Wer eine bessere Stimme
möchte: `JARVIS_TTS_PROVIDER=openai` (braucht `OPENAI_API_KEY`) oder
`elevenlabs` (`ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`).
Für Diktat über Whisper statt Systemerkennung: `JARVIS_STT_PROVIDER=openai`.

### 6. Kalender — optional

Fast jeder Kalender bietet eine ICS-Abonnement-Adresse. Diese in den
Einstellungen unter dem Schlüssel `calendar.ics` hinterlegen; dann beantwortet
JARVIS „Was steht heute noch an?".

### Wo landen die Schlüssel?

- In der Desktop-App im **Schlüsselbund des Betriebssystems**
  (macOS Keychain, Windows DPAPI, Linux Secret Service) über Electrons
  `safeStorage`.
- Ersatzweise **AES-256-GCM-verschlüsselt** in `~/.jarvis/secrets.enc.json`.
- Aus `.env` werden sie nur *gelesen*, nie dorthin geschrieben.

Nie in der Datenbank, nie im Klartext im Log — der Logger schwärzt Felder mit
`pass`, `token`, `key`, `secret` im Namen selbstständig.

---

## Die Sicherheitsregel

> **JARVIS versendet niemals allein eine E-Mail.**

Das ist keine Prompt-Anweisung (die kann ein Modell überschreiben), sondern im
Code verankert:

1. **Es gibt kein Versand-Werkzeug.** Die Werkzeugliste kennt
   `create_email_draft`, `update_email_draft`, `request_send_approval` —
   aber kein `send_email`. Das Modell kann den Versand also gar nicht aufrufen.
   Ein Test prüft genau das.

2. **Der Versand verlangt einen signierten Nachweis.**
   `MailService.send()` nimmt einen `ActionPermit` entgegen, der mit einem
   prozesslokalen Zufallsschlüssel signiert ist. Ausstellen kann ihn nur die
   Approval-Engine, und nur nach einer echten Freigabe. Ein selbstgebauter
   Nachweis scheitert an der Signaturprüfung.

3. **Freigaben kleben am Inhalt.** Der Nachweis trägt einen Hash über
   Empfänger, Betreff und Text. Wird der Entwurf nach der Freigabe geändert,
   passt der Hash nicht mehr und der Versand wird abgelehnt
   (`APPROVAL_STALE`). Man kann also nicht freigeben lassen und dann den Text
   austauschen.

4. **Eine Freigabe gilt einmal.** Danach steht sie auf `ausgefuehrt`.

5. **Gesprochene Zustimmung wird streng gelesen.** „Senden", „freigeben",
   „Mail abschicken", „ja, genau so senden" gelten. Ein blosses „ja" gilt nur
   unmittelbar nachdem JARVIS selbst nach der Freigabe gefragt hat — sonst
   fragt er nach. Sind mehrere Freigaben offen, fragt er, welche gemeint ist,
   statt zu raten.

6. **Auch der Serienversand.** Die Sammelfreigabe listet jede einzelne Mail
   auf und deckt genau diese Liste ab; nachträglich hinzugefügte Entwürfe
   gehen nicht mit raus.

Dieselbe Engine sichert Dateien löschen, Dateien überschreiben,
Programminstallation, Systemeinstellungen, kostenpflichtige Aktionen,
Formularversand und Nachrichten an externe Personen ab.

**Und: JARVIS täuscht keinen Erfolg vor.** Meldet SMTP einen Fehler, steht im
Protokoll „Versand fehlgeschlagen" mit der Serverantwort — nicht „Mail wurde
versendet".

---

## Wie recherchiert wird

Die Regel lautet: **Keine Information erfinden.**

- Eine E-Mail-Adresse entsteht nur, wenn sie **wörtlich auf einer abgerufenen
  Seite stand**. Es gibt im ganzen Projekt keinen Codepfad, der eine Adresse
  aus einem Namensschema ableitet. `vorname.nachname@firma.de` wird also nie
  geraten.
- Jede Adresse bekommt einen Status:

  | Status | Bedeutung |
  |---|---|
  | **VERIFIZIERT** | wörtlich auf einer Seite der Firma selbst gefunden (Website, Kontakt, Impressum) |
  | **WAHRSCHEINLICH** | auf einer fremden Seite gefunden, oder die Domain nimmt keine Mail an |
  | **NICHT VERIFIZIERT** | ohne Beleg — wird nie automatisch erzeugt |

  Standardmäßig dürfen nur **verifizierte** Adressen angeschrieben werden.
- Wird nichts gefunden, ist das Ergebnis „Keine verifizierte E-Mail-Adresse
  gefunden" — und keine Behelfsadresse.
- Zu jeder Adresse werden **Quelle, Fundstelle und Abrufzeitpunkt**
  gespeichert. In der Versandzentrale führt der Knopf „Beleg" direkt dorthin.
- Zusätzlich prüft JARVIS per DNS, ob die Domain überhaupt Mail annehmen kann
  (MX-Eintrag). Das ist eine reine Namensauflösung — es wird kein Mailserver
  kontaktiert und kein Postfach getestet.
- **Fakten und Einschätzungen sind getrennt.** Im Firmendossier stehen belegte
  Angaben mit Quelle unter „Belegte Angaben", Schlussfolgerungen der KI
  darunter als „Einschätzung". Der Akquisegrund ist immer eine Einschätzung
  und wird auch so gekennzeichnet.
- **robots.txt wird beachtet.** Wer das Abrufen verbietet, wird nicht
  abgerufen.
- **Bewusst verschleierte Adressen** („info (at) firma . de") werden erkannt,
  aber *nicht* automatisch aufgelöst. Die Verschleierung ist ein deutliches
  Zeichen, dass der Betreiber keine maschinelle Erfassung wünscht. JARVIS
  meldet den Fund und überlässt die Entscheidung Ihnen.

---

## Aufbau

```
jarvis/
├── packages/core/          Der ganze Verstand – ohne Electron, ohne React
│   ├── src/
│   │   ├── agents/         JarvisCore + Fachagenten, Schleife, Prompts
│   │   ├── tools/          44 Werkzeuge (die einzige Art, etwas zu tun)
│   │   ├── services/       Approval, Audit, Credentials, Memory, Events
│   │   ├── mail/           SMTP, Gmail, Graph, IMAP, MIME, OAuth
│   │   ├── research/       Suche, Abruf (robots), Extraktion, Verifikation
│   │   ├── outreach/       Kampagnen, Personalisierung
│   │   ├── compliance/     Sperrliste, Dubletten, Versandlimits
│   │   ├── db/             SQLite-Schema, Migrationen, Repositories
│   │   ├── llm/            Anthropic / OpenAI / Ollama
│   │   ├── system/         Dateien, Programme, Zwischenablage
│   │   ├── calendar/       ICS
│   │   ├── voice/          Transkription und Sprachausgabe
│   │   ├── ipc/            Befehlsvertrag zwischen Kern und Fenster
│   │   └── cli/            Einrichtungsassistent, Konsolen-JARVIS
│   └── test/               75 Tests, ohne Netz und ohne echte Schlüssel
├── packages/desktop/       Electron-Hauptprozess + Vorlade-Skript
└── packages/ui/            React-Oberfläche
```

### Warum Electron und nicht Tauri

Tauri wäre sparsamer im Speicher. Der Kern hängt aber an Node-Bibliotheken
(`better-sqlite3`, `nodemailer`, `imapflow`) und am Node-Netzwerkstapel. Unter
Tauri bräuchte es dafür entweder eine zweite Implementierung in Rust oder
einen mitgelieferten Node-Beiprozess — beides mehr Angriffsfläche und mehr
Pflegeaufwand, als der Speichervorteil wert ist. Dafür ist alles abgeschaltet,
was Electron unsicher macht:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- strenge Content-Security-Policy, keine externen Quellen
- die einzige Brücke ins Fenster sind zwei Funktionen (Befehl senden,
  Ereignisse empfangen)
- Mikrofon ist die einzige erteilte Browser-Berechtigung
- externe Links gehen in den Systembrowser, nicht in ein Electron-Fenster

Der Kern kennt weder Electron noch React. Deshalb laufen dieselbe Logik und
dieselben Tests auch in der Konsole.

### Das Agentensystem

`JarvisCore` beantwortet Auskünfte selbst und beauftragt sonst einen
Fachagenten über `delegate_to_agent`. Jeder Agent sieht nur seine eigenen
Werkzeuge:

| Agent | Zuständig für | Sieht *nicht* |
|---|---|---|
| `CompanyResearchAgent` | Firmen finden, Websites auswerten, Adressen belegen | Mailentwürfe, Dateien |
| `MailAgent` | Mails schreiben, ändern, vorlesen, zur Freigabe stellen | Dateien, Programme |
| `OutreachAgent` | ganze Kampagnen: recherchieren, begründen, entwerfen | Dateien, Programme |
| `SystemAgent` | Dateien, Programme, Browser, Zwischenablage, Termine | Mailentwürfe |

Ruft ein Agent trotzdem ein fremdes Werkzeug auf, wird es nicht ausgeführt,
sondern als `PERMISSION_DENIED` zurückgemeldet — auch das ist getestet.

---

## Bedienung

**Sprache:** Leertaste halten und sprechen (wie eine Sprechtaste), oder auf
den Orb klicken für Dauerbetrieb. Die Statuszeile zeigt
`LISTENING` / `THINKING` / `EXECUTING` / `WAITING FOR APPROVAL`.

**Tastatur:** `Strg`/`Cmd` + `1`–`7` wechselt die Ansicht, `Enter` sendet,
`Shift+Enter` macht einen Absatz, `Esc` schließt Dialoge.

**Ansichten**

| Ansicht | Wozu |
|---|---|
| Kommandozentrale | Der Überblick: was auf Freigabe wartet, Kennzahlen, Versandlimits, Verlauf, Bereitschaft |
| Konsole | Sprechen und tippen, Werkzeugschritte mitlesen |
| Versandzentrale | Eine Zeile je Firma: Ansprechpartner, E-Mail, Quelle, Verifizierung, Akquisegrund, Mailstatus, letzter Kontakt, Freigabestatus |
| Freigaben | Was auf Ihre Entscheidung wartet — mit vollem Mailtext |
| Unternehmen | Firmendatenbank mit Dossier (Fakten mit Quelle vs. KI-Einschätzung) |
| Protokoll | Was JARVIS wann getan hat, nach Tagen gruppiert |
| Einrichtung | Bereitschaft, Zugangsdaten, Versandregeln, Sperrliste, Gedächtnis |

**Konsolenbefehle** (`npm run jarvis`): `/status`, `/freigaben`,
`/freigabe N`, `/ablehnen N`, `/entwuerfe`, `/versand`, `/protokoll`, `/ende`.

---

## Entwicklung

```bash
npm test                  # 75 Tests, kein Netz, keine echten Schlüssel nötig
npm run typecheck         # alle drei Pakete
npm run build             # Kern, Oberfläche, Desktop
npm run dist              # Installationspakete (electron-builder)
```

Für den Entwicklungsmodus zwei Terminals:

```bash
npm run dev -w @jarvis/ui                          # Vite auf 127.0.0.1:5173
npm run rebuild:electron                           # einmalig
NODE_ENV=development npm start -w @jarvis/desktop  # lädt vom Vite-Server
```

### Datenbank-Migrationen

Die `.sql`-Dateien unter `packages/core/src/db/migrations/` sind die Quelle.
Beim Bauen werden sie in `migrations.generated.ts` eingebettet — nötig, weil
der Kern für Electron gebündelt wird und ein Bündel keine Dateien "neben dem
Modul" finden kann. Nach einer Änderung an einer `.sql`-Datei:

```bash
npm run migrations
```

Ein Test schlägt fehl, wenn beides auseinanderläuft.

### Ein neues Werkzeug hinzufügen

```ts
export const meinTool = defineTool({
  name: 'mein_tool',
  description: 'Was es tut – in der Sprache, in der das Modell denken soll.',
  category: 'recherche',
  readOnly: true,
  input: z.object({ was: z.string() }),
  handler: async (input, ctx) => ok({ ergebnis: input.was }),
});
```

In die Liste am Ende der Datei eintragen, dann in `agents/index.ts` dem
passenden Agenten geben. Die Eingabe wird vor dem Aufruf gegen das Schema
geprüft; Fehler kommen als `Result` zurück und werden nie geworfen.

Braucht das Werkzeug eine Freigabe: `ctx.approvals.request({...})` aufrufen und
den Ausführer in `registerSystemExecutors` eintragen. Ohne Ausführer kann eine
Freigabe schlicht nicht ausgeführt werden — das ist Absicht.

---

## Was Version 1 noch nicht kann

Ehrlichkeitshalber, damit niemand danach sucht:

- **Keine Antwort-Token im Fluss.** Antworten erscheinen als Ganzes, nicht Wort
  für Wort. Die Anbieter-Schnittstelle ist dafür vorbereitet, die
  Streaming-Auswertung fehlt.
- **ICS-Wiederholungsregeln** (`RRULE`) werden nicht aufgelöst. Serientermine
  erscheinen nur mit ihrem ersten Termin.
- **Kein Google-/Outlook-Kalender über API** — nur ICS. Die Schnittstelle
  `CalendarSource` ist dafür da, die Anbindung fehlt.
- **Keine Bildschirm-Automatisierung.** Absichtlich: JARVIS steuert Programme
  über die offiziellen Wege (Standardöffner, Standardbrowser, CLI), nicht über
  simulierte Maus und Tastatur.
- **Programme installieren und Systemeinstellungen ändern** kann angefragt,
  aber nicht ausgeführt werden. Die Ausführung meldet ehrlich
  `NOT_IMPLEMENTED`, statt so zu tun als ob.
- **WhatsApp Business, Telefonie, PDF- und Angebotserstellung, Cloudspeicher,
  CRM-Anbindung**: architektonisch vorgesehen (Transport- bzw.
  Werkzeug-Schnittstellen), in Version 1 nicht implementiert.
- **Die DuckDuckGo-Suche ohne Schlüssel** wertet HTML aus und ist damit
  empfindlich gegenüber Layoutänderungen. Für Produktivbetrieb einen Anbieter
  mit API eintragen.

---

## Recht und Compliance

JARVIS ist ein Werkzeug; verantwortlich für den Versand bleiben Sie. Was das
Programm dafür mitbringt:

- **Sperrliste** (Do-not-contact) für Adressen, Domains und Firmen. Wer darauf
  steht, wird nie angeschrieben — auch nicht versehentlich in einer Kampagne.
- **Dublettenprüfung**: „Diese Firma wurde am 12.08.2026 bereits
  angeschrieben." Ein zweiter Erstkontakt wird ohne ausdrückliche Ansage nicht
  vorbereitet.
- **Kontakthistorie** je Firma, ein- und ausgehend.
- **Quellennachweis** für jede gespeicherte Angabe.
- **Versandlimits** pro Stunde und Tag sowie ein Mindestabstand zwischen zwei
  Sendungen. Diese Grenzen sind konservativ voreingestellt.
- **Keine versteckte Massenversandfunktion.** Serienversand geht nur über eine
  Sammelfreigabe, in der jede Mail einzeln aufgeführt ist.
- **Keine Spamfilter-Umgehung.** Keine gefälschten Kopfzeilen, keine
  Zeichentricks, kein Verschleiern des Absenders.
- **Vollständiges Audit-Log** — jederzeit nachvollziehbar, was wann auf wessen
  Anweisung passiert ist.

Bitte trotzdem selbst prüfen: In Deutschland ist Werbung per E-Mail an
Unternehmen ohne vorherige Einwilligung nur unter engen Voraussetzungen
zulässig (§ 7 UWG); dazu kommen die Informationspflichten der DSGVO gegenüber
den Personen, deren Daten Sie verarbeiten (Art. 14 DSGVO), und eine
Widerspruchsmöglichkeit gehört in jede Mail. Im Zweifel anwaltlich prüfen
lassen — dieses README ist keine Rechtsberatung.
