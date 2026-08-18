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

**Ohne Terminal (macOS):** das Projekt als
[ZIP herunterladen](https://github.com/4wf86nbfzr-png/Claude/archive/refs/heads/claude/jarvis-desktop-ai-agent-urvrta.zip),
doppelklicken zum Entpacken, in den Ordner `jarvis` gehen und
**„JARVIS starten.command"** doppelklicken. Beim allerersten Mal wehrt macOS
die Datei ab, weil sie aus dem Netz kommt — dann einmal mit rechts anklicken
→ *Öffnen* → *Öffnen*. Node muss installiert sein
([nodejs.org](https://nodejs.org) → **LTS** → macOS → *Prebuilt Installer*);
das Skript sagt es, falls nicht.

**Mit Terminal genügt ein Befehl.** Er prüft der Reihe nach, was fehlt,
sagt jeweils wie groß der Download ist und was er tut, fragt nach — und
startet dann:

```bash
cd jarvis
npm run testversion
```

Von Hand geht es genauso:

```bash
npm install
cp .env.example .env      # optional – geht auch über den Assistenten
npm run setup             # fragt ab, was noch fehlt
npm run modell            # lokales Sprachmodell (Denken), ohne Schlüssel
npm run stimme            # lokale Spracherkennung (Zuhören), ohne Schlüssel
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
| **Lokal (Ollama)** | **keinen Schlüssel** | `npm run modell` richtet alles ein |

**Ganz ohne Schlüssel:** ein lokales Modell läuft auf Ihrem Rechner, kostet
nichts, und kein Text verlässt das Gerät.

```bash
npm run modell            # installiert prüfen, Modell laden, Werkzeugtest
```

Der Assistent probiert am Ende tatsächlich aus, ob das Modell Werkzeuge
aufrufen kann. Das ist der Knackpunkt: viele lokale Modelle schreiben
stattdessen nur „Ich rufe jetzt search_web auf" als Fließtext — damit
passiert in JARVIS nichts, und man sucht den Fehler bei sich. Modelle, die
durchfallen, werden gar nicht erst eingetragen.

Erwartungsmanagement: ein lokales 8-B-Modell ist spürbar langsamer und
ungenauer als ein Cloud-Modell. Für „öffne mir X", Terminfragen und einfache
Entwürfe reicht es; für mehrstufige Recherchen ist ein Cloud-Modell klar
besser. Umstellen geht jederzeit unter *Einrichtung → Sprachmodell*.

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

```bash
npm run stimme            # einmalig: Modell laden und prüfen
```

**Zuhören** übernimmt ein Whisper-Modell auf Ihrem Rechner. Kein Schlüssel,
kein Ton verlässt das Gerät; einmalig rund 490 MB Download.

Warum nicht die Erkennung des Browsers, die nichts kostet und nichts lädt?
Weil sie in Electron nicht funktioniert. Chrome bekommt sie von einem Dienst
bei Google, und den hat Google auf Chrome selbst beschränkt — in einer
Electron-Anwendung antwortet er nur mit `network` bzw. `service-not-allowed`
([electron#7749](https://github.com/electron/electron/issues/7749)). Das ist
kein Fehler in JARVIS und lässt sich von außen auch nicht abstellen. Wer die
Oberfläche ausnahmsweise in einem echten Browser betreibt
(`npm run dev -w @jarvis/ui`), kann mit `JARVIS_STT_PROVIDER=browser` deren
Erkennung nehmen.

Der Assistent behauptet am Ende nicht, dass es geht, sondern sieht nach: das
Betriebssystem spricht einen Probesatz, der läuft durch die Erkennung, und es
steht da, was zurückkam, wie gut es passte und wie schnell es ging.

| Modell | Größe | Wofür |
|---|---|---|
| Whisper base | 145 MB | Kurze Anweisungen. Bei Namen und Fachbegriffen ungenau. |
| **Whisper small** | **490 MB** | **Empfohlen.** Versteht deutsche Sätze zuverlässig. |
| Whisper large v3 turbo | 1,6 GB | Beste Erkennung, braucht reichlich Arbeitsspeicher. |

**Sprechen** läuft über die Stimmen des Betriebssystems — die haben mit
Googles Dienst nichts zu tun und funktionieren in Electron einwandfrei. Wer
eine bessere Stimme möchte: `JARVIS_TTS_PROVIDER=openai` (braucht
`OPENAI_API_KEY`) oder `elevenlabs` (`ELEVENLABS_API_KEY` +
`ELEVENLABS_VOICE_ID`). Diktat über die Schnittstelle von OpenAI statt lokal:
`JARVIS_STT_PROVIDER=openai`.

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
│   │   ├── voice/          Whisper lokal, Segmentierung, Schnips-Erkennung
│   │   ├── ipc/            Befehlsvertrag zwischen Kern und Fenster
│   │   └── cli/            Einrichtungsassistent, Konsolen-JARVIS
│   └── test/               186 Tests, ohne Netz und ohne echte Schlüssel
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

### Immer erreichbar, nicht nur im Fenster

JARVIS hört, solange er läuft — in jeder Ansicht und auch, wenn das Fenster zu
ist. Das Fenster zu schließen beendet ihn nicht, es versteckt ihn nur; in der
Menüleiste bleibt ein Symbol, über das er zurückkommt oder wirklich beendet
wird. (Technisch nötig dafür: `backgroundThrottling: false`. Electron drosselt
Zeitgeber in versteckten Fenstern sonst auf einen Takt pro Sekunde, und die
Schnips-Erkennung misst alle 16 ms.)

Drei Wege, ihn anzusprechen:

| Weg | Wann |
|---|---|
| **Schnipsen** | Wenn die Hände voll sind. Akustisch, also mit Fehlauslösern. |
| **Cmd + Alt + J** | Systemweit, aus jedem Programm heraus, ohne Fehlauslöser. |
| **Menüleiste → JARVIS ansprechen** | Wenn man ohnehin die Maus in der Hand hat. |

Bei Tastenkürzel und Menüleiste drängt sich das Fenster nicht in den
Vordergrund — wer aus einem anderen Programm ruft, wollte genau das vermeiden.
JARVIS antwortet gesprochen, das Fenster bleibt, wo es war.

### Wie er klingt

Anrede, Tonfall und Stimme stehen unter *Einrichtung → Stimme und Anrede*.
Standard ist „Master" und ein trockener Ton; beides lässt sich ändern oder
ganz abstellen.

Er sagt nicht jedes Mal dasselbe. Beim ersten Ruf am Morgen klingt er anders
als beim vierten in zehn Minuten — dann darf er es auch ansprechen
(„Master, Sie schnipsen schon wieder. Was kann ich für Sie tun?").

**Zur Stimmqualität:** macOS liefert ab Werk die kompakte Fassung aus, und die
klingt nach 2005. Das ist kein Fehler im Programm, sondern eine fehlende
Datei. Deutlich besser: *Systemeinstellungen → Bedienungshilfen → Gesprochene
Inhalte → Systemstimme → Anpassen*, dort eine deutsche Stimme mit dem Zusatz
„Premium" oder „Erweitert" laden. JARVIS sucht danach von selbst die beste
verfügbare aus und weist auf den Download hin, solange nur die einfache da ist.

### Schnipsen und freies Gespräch

Unter dem Verlauf steht *Auf Schnipsen hören*. Ist das an, öffnet ein Schnipsen
das Gespräch: JARVIS meldet sich sofort von selbst — und zwar nicht mit einer
Floskel, sondern mit dem, was gerade ansteht („Eine Sache wartet noch auf Ihre
Freigabe: E-Mail an die Eimsbüttel Bauträger GmbH. Soll ich sie Ihnen
vorlesen?"). Danach läuft es wie ein Gespräch: reden, antworten, weiterreden.
Ins Wort fallen ist erlaubt — wer anfängt zu sprechen, während JARVIS spricht,
bringt ihn zum Schweigen. Bleibt es zwölf Sekunden still, verabschiedet er sich
von selbst. Ein zweites Schnipsen beendet ebenfalls.

Im Gespräch antwortet JARVIS **kurz und gesprochen**: ein bis drei Sätze, keine
Aufzählungen, keine Kennungen und keine Adressen zum Mitschreiben. Was er
vorschlägt, fragt er auch — und zwar von sich aus, wenn eine Freigabe wartet,
etwas fehlgeschlagen ist, eine Antwort eingegangen ist oder ein Termin ansteht.
Der Text steht parallel im Verlauf; wer lieber liest, tippt einfach weiter.

Drei Dinge, die man dazu wissen sollte:

- **Das Mikrofon ist offen, solange „Auf Schnipsen hören" an ist.** Der Ton wird
  ausschließlich im Fenster ausgewertet — nichts wird aufgezeichnet, nichts
  gespeichert, nichts verschickt. Erst wenn Sie nach dem Schnipsen wirklich
  sprechen, geht der erkannte Satz an das Sprachmodell.
- **Der Schalter bleibt nicht über den Programmstart hinweg an.** Empfindlichkeit
  und Doppelschnipsen werden gemerkt, das Anschalten bewusst nicht: ein Mikrofon,
  das beim Start von allein aufgeht, ist nichts, was man erben sollte.
- **Akustische Erkennung ist nicht perfekt.** Klatschen, ein zufallender Deckel
  oder ein harter Tastenanschlag klingen ähnlich. Gegen Fehlauslöser helfen die
  Stufe *streng* und die Option *zweimal schnipsen*.

Die Freigaberegel gilt im Gespräch unverändert: „Senden" per Zuruf reicht nur,
wenn genau eine Sache wartet und JARVIS unmittelbar davor danach gefragt hat.
Ein bloßes „ja" ohne vorherige Rückfrage ist keine Freigabe.

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

### Sachen auf dem Rechner öffnen

„Öffne den Browser", „mach Excel auf", „zeig mir den Kalender" — JARVIS löst
allgemeine Bezeichnungen selbst auf und probiert die installierten Programme
der Reihe nach durch. Unterstützt sind unter anderem Browser, Mail, Kalender,
Kontakte, Dateien, Terminal, Notizen, Excel, Word, PowerPoint, Rechner,
Vorschau, Spotify, Slack, Teams, Zoom, VS Code und die Systemeinstellungen.
Andere Programme lassen sich mit ihrem installierten Namen starten.

Für Dateien gilt die Grenze aus *Einrichtung → Zugriff auf den Rechner*:
JARVIS liest und schreibt ausschließlich in den dort freigegebenen
Verzeichnissen, standardmäßig Schreibtisch, Dokumente und Downloads.
Löschen und Überschreiben brauchen zusätzlich eine Freigabe.

---

## Entwicklung

```bash
npm run testversion       # Startklar machen und starten (fragt, was fehlt)
npm run stimme            # Spracherkennung einrichten und wirklich prüfen
npm test                  # 186 Tests, kein Netz, keine echten Schlüssel nötig
npm run typecheck         # alle drei Pakete
npm run build             # Kern, Oberfläche, Desktop
npm run dist              # Installationspakete (electron-builder)
```

> **Zu den Abhängigkeiten:** `npm audit` meldet drei Funde, alle unterhalb der
> lokalen Spracherkennung: `adm-zip` (entpackt beim Installieren die
> onnxruntime-Binärdateien) und `sharp` bzw. dessen `libvips`. Beide erreicht
> JARVIS im Betrieb nicht — `sharp` gehört zum Bildteil von transformers.js,
> und der wird für Spracherkennung nicht angefasst. Wer das nicht in Kauf
> nehmen will, entfernt `@huggingface/transformers` und stellt
> `JARVIS_STT_PROVIDER=openai` oder `none` ein; alles außer der lokalen
> Erkennung läuft dann weiter.
> Behoben wird das dort, wo es hingehört — sobald transformers.js nachzieht.

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
- **Kein gesprochenes Weckwort.** Geweckt wird per Schnipsen — das ist eine
  Heuristik auf der Lautstärkekurve, kein trainiertes Modell. „Hey JARVIS"
  bräuchte eine Weckwort-Erkennung; die Schleife hängt aber nur an einem
  Auslöser und ließe sich austauschen.
- **Keine mitlaufende Erkennung beim Sprechen.** Die lokale Erkennung
  versteht eine fertige Äußerung, nicht Silbe für Silbe. Zwischen dem Ende
  eines Satzes und der Antwort liegt deshalb die Rechenzeit für die
  Erkennung — auf einem Apple-Silicon-Mac mit `small` unter einer Sekunde,
  auf älteren Maschinen spürbar mehr.
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
