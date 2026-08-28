# Jarvis Pro

Persönlicher Telefonassistent für Noah Benkhofer, HERM Service Team, Hamburg.

Bedient wird er über **einen** von zwei Wegen — kein Dashboard, keine eigene
App, nichts im Browser:

- **Telefon.** Noah ruft die Jarvis-Nummer an, oder Jarvis ruft ihn an, wenn
  etwas hereinkommt. Braucht einen SIP-Anschluss und Asterisk.
- **WhatsApp.** Jarvis schreibt und liest über die WhatsApp Business Cloud
  API. Braucht keine Hardware, keine Telefonanlage und keine Sprachschicht.

`JARVIS_KANAL` entscheidet, welcher Weg läuft (`telefon`, `chat`, `beide`).
Die Freigaberegeln sind in allen Fällen dieselben — nur der Kanal ist ein
anderer.

---

## Stand

| | |
|---|---|
| Tests | **286 grün** (Unit + End-to-End) |
| Typecheck | sauber, TypeScript strict |
| Lint | sauber |
| Betriebsmodus | `simulation` — es wird nichts gesendet und niemand angerufen |

**Vollständig gebaut und geprüft:** Domainmodelle, Eventstore, persistente
Jobqueue, Approval Engine, Telefonie-Simulator, Chat-Simulator, Sprachschicht,
Gesprächsablauf am Telefon und im Chat, Anruf-Scheduler, Werkzeugschicht,
Provider-Adapter, Betriebsskripte.

**Gebaut, aber nicht an echter Hardware bzw. echten Konten geprüft**
(`unverified`): der Asterisk-Adapter, die Microsoft- und Meta-Endpunkte, das
Claude-Gehirn. Was genau zu prüfen ist, steht einzeln in
[`docs/api-annahmen.md`](docs/api-annahmen.md).

**Noch nicht gemessen:** welches whisper.cpp-Modell auf Noahs Mac taugt. Das
Messskript liegt bereit (`pnpm bench:speech`); eine Empfehlung ohne Messung
wäre geraten und steht deshalb nirgends im Projekt.

---

## Der wichtigste Satz

**Jarvis kann nichts senden, was Noah nicht Wort für Wort freigegeben hat.**

Das ist keine Einstellung, sondern die Bauweise. Das Sprachmodell hat keine
Sendefunktion — nicht „darf nicht", sondern *hat nicht*. Der einzige Weg zu
einer echten Provider-Sendefunktion führt durch die Approval Engine, und die
verlangt gleichzeitig:

1. den vollständigen Read-back (Kanal, Empfänger, Betreff, Text, Anhänge) —
   am Telefon vorgelesen, im Chat geschrieben,
2. das ausdrückliche „Ja, senden" — ein bloßes „ja" reicht nicht,
3. den zweiten Faktor: die DTMF-Freigabe-PIN am Telefon, im Chat wahlweise
   eine PIN oder ein Einmalcode nach RFC 6238,
4. einen unveränderten Inhalt (SHA-256-Bindung),
5. eine Freigabe, die noch nicht abgelaufen und noch nicht benutzt ist.

Fehlt einer der fünf Punkte, wird **nichts** gesendet. 60 Tests belegen das —
46 für die Engine, darunter property-based Nachweise über alle Teilmengen der
Freigabeschritte, und 14 End-to-End-Tests für den Chatweg.

---

## Schnellstart

```bash
cd JARVIS-PRO
pnpm startplan       # wo stehe ich, was ist als Nächstes dran?
pnpm doctor          # was ist da, was fehlt? Ändert nichts.
pnpm simulate:chat   # ein vollständiger WhatsApp-Dialog im Terminal
pnpm simulate:call   # ein vollständiges Telefongespräch im Terminal
pnpm dry-run         # die Sicherheitsszenarien durchspielen
```

Nichts davon telefoniert, schreibt, sendet oder verbindet ein Konto.
`pnpm startplan` liest `JARVIS_KANAL` und zeigt nur die Schritte, die auf
dem gewählten Weg überhaupt anfallen.

---

## Aufbau

```
apps/
  orchestrator/     Gesprächsablauf, Gehirn, Werkzeuge, Anruf-Scheduler, Verdrahtung
  telephony/        Asterisk-Adapter, Simulator, Sprachsitzung mit Barge-in
  connector-worker/ WhatsApp-Webhook, Postfach-Abgleich
packages/
  domain/           reine Modelle und Zustandsautomaten, kein I/O
  approval-engine/  die Einmalfreigabe
  connectors/       Microsoft Graph, WhatsApp Cloud API, nachgebaute Provider
  speech/           G.711, Resampling, VAD, whisper.cpp, Piper
  security/         Hashing, Redaction, Injection-Isolation, Webhooks, Audit-Kette
  observability/    Logger mit erzwungener Redaction, Metriken, Healthchecks
  storage/          SQLite mit WAL, Eventstore, Jobqueue, Repositories
  testkit/          Fake Clock, Fixtures, verdrahteter Test-Jarvis
infra/              Asterisk, systemd, launchd, Docker, Firewall
docs/               Handbücher, Bedrohungsmodell, offene API-Annahmen
scripts/            doctor, setup, simulate, dry-run, backup, restore, …
```

`packages/storage` ist eine Ergänzung zur vorgegebenen Struktur: Persistenz
gehört weder in `domain` (das bleibt frei von I/O) noch in eine App, weil
mehrere Apps sie brauchen.

## Befehle

| Befehl | Wofür |
|---|---|
| `pnpm startplan` | wo stehe ich, was ist als Naechstes dran |
| `pnpm doctor` | Bestandsaufnahme, rein lesend, nur maskierte Werte |
| `pnpm setup` | Einrichtung, idempotent, nicht destruktiv |
| `pnpm simulate:call` | vollständiges Telefongespräch im Terminal |
| `pnpm simulate:chat` | vollständiger WhatsApp-Dialog im Terminal |
| `pnpm dry-run` | vier Sicherheitsszenarien mit erwarteten Sendungszahlen |
| `pnpm test` / `pnpm test:e2e` | Tests |
| `pnpm bench:speech` | misst Erkennung und Ausgabe auf diesem Rechner |
| `pnpm hash:pin` | PIN-Hash erzeugen, Eingabe unsichtbar |
| `pnpm connect:microsoft` | E-Mail und Kalender verbinden |
| `pnpm connect:whatsapp` | WhatsApp verbinden |
| `pnpm configure:gateway` | Asterisk-Vorlagen erzeugen |
| `pnpm status` | Betriebszustand, maskiert |
| `pnpm logs:safe` | Logs ohne Vertrauliches |
| `pnpm backup` / `pnpm restore` | sichern und zurückspielen |

## Handbücher

- [Betriebshandbuch](docs/betriebshandbuch.md) — Einrichtung und Alltag
- [Jarvis über WhatsApp](docs/whatsapp-weg.md) — der Weg ohne Telefonanlage
- [Gateway-Kaufberatung](docs/gateway-kaufberatung.md) — Kriterien für die Hardware
- [VoIP-Nummer](docs/voip-nummer.md) — der Weg ohne eigene Hardware
- [Fehlerhandbuch](docs/fehlerhandbuch.md) — nach Symptom sortiert
- [Bedrohungsmodell](docs/bedrohungsmodell.md) — 14 Bedrohungen mit Gegenmaßnahme und Nachweis
- [Offene API-Annahmen](docs/api-annahmen.md) — was vor dem Live-Gang zu prüfen ist
- [Fortschritt](docs/fortschritt.md) — Stand je Phase
- [Abnahmebericht](docs/abnahmebericht.md) — Punkt für Punkt gegen die Anforderung

---

## Drei Dinge, die man von Anfang an wissen sollte

**0. Beim WhatsApp-Weg entscheidet die Nummer über den Funktionsumfang.**
Eine Nummer, die auf der Cloud API registriert ist, lässt sich **nicht mehr
in der WhatsApp-Business-App verwenden**. Wandert die Geschäftsnummer dorthin,
sieht Jarvis die Kundennachrichten — dafür ist die App für diese Nummer weg.
Mit einer neuen, separaten Nummer bleibt die App unangetastet, dann sieht
Jarvis aber nur E-Mails. Details in [`docs/whatsapp-weg.md`](docs/whatsapp-weg.md).

**1. Ein zweites Handy funktioniert nicht als Jarvis-Leitung.**
Ein Handy ist kein SIP-Trunk. Gebraucht wird entweder ein GSM/VoLTE-Gateway
mit SIP, in das die SIM aus dem Handy wandert (reine 2G-Geräte sind nutzlos,
seit die 2G-Netze abgeschaltet sind) — oder eine Rufnummer bei einem
VoIP-Anbieter, die denselben SIP-Trunk liefert. `pnpm configure:gateway`
fragt, welchen Weg du gehst; am Code ändert sich nichts.

**2. Ein schlafender Mac ist nicht erreichbar.**
Anrufe gehen dann ins Leere — ohne Hinweis, ohne Voicemail. Für 24/7 gehört
Jarvis auf einen kleinen Linux-Rechner (`infra/systemd/`).

**3. Alte WhatsApp-Nachrichten lassen sich nicht nachholen.**
Was vor der Anbindung in der WhatsApp-Business-App ankam, ist über die Cloud
API nicht rückwirkend abrufbar. Das ist eine Eigenschaft der Schnittstelle,
keine Einschränkung dieser Software.

---

## Datenschutz

Spracherkennung und Sprachausgabe laufen vollständig lokal. Roh-Audio
verlässt das System nie und wird nie gespeichert (`STORE_RAW_AUDIO=false`, in
Produktion unveränderlich). Es gibt keine Gesprächsaufzeichnung. Im
WhatsApp-Betrieb entsteht gar kein Audio.

Nach außen geht nur: erkannter Text, minimaler Gesprächskontext, isolierter
Nachrichteninhalt — und der freigegebene Text an den jeweiligen Provider.

Geheimnisse liegen im Schlüsselbund des Betriebssystems, nie in einer Datei.
Der Logger redigiert jede Zeile; Nachrichtentexte erscheinen in Produktion
nur als `[inhalt N zeichen]`.

## Technische Grundlage

Node 22 LTS, TypeScript strict, pnpm-Monorepo, SQLite mit WAL (SQLCipher für
echte Daten), Zod für alles von außen, Vitest samt property-based Tests,
Asterisk über ARI und AudioSocket, whisper.cpp und Piper lokal.

Bewusst wenige Abhängigkeiten, alle exakt gepinnt: `zod`, `ws`,
`@anthropic-ai/claude-agent-sdk`. Logger, HTTP-Schicht, Metriken und
`.env`-Parser sind selbst geschrieben, weil dort Redaction und kontrolliertes
Verhalten wichtiger sind als eingesparte Zeilen.
