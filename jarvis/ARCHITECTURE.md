# Architektur

Dieses Dokument beschreibt, wie JARVIS aufgebaut ist und warum an den
entscheidenden Stellen so entschieden wurde. Die Bedienung steht in `README.md`.

---

## 1. Grundriss

```
┌──────────────────────────── Electron ────────────────────────────┐
│                                                                  │
│  Renderer (React)                Hauptprozess (Node)             │
│  ────────────────                ───────────────────             │
│  Konsole, Versandzentrale        JarvisCore                      │
│  Kampagnen, Protokoll     IPC    ├─ Agenten                      │
│  Einrichtung             ◄────►  ├─ Werkzeugverzeichnis          │
│                        (fester   ├─ Dienste                      │
│  kein Node,             Kanal-   ├─ SQLite                       │
│  kein Netz              vertrag) └─ Anbieter (LLM, Mail, Suche)  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Der Renderer ist reine Darstellung. Er hat kein Node, keinen `require`, keinen
`ipcRenderer` und darf laut CSP nicht ins Netz. Jede Fähigkeit, die die
Oberfläche hat, steht als benannter Kanal in `src/shared/ipc.ts` — die Liste
ist die Angriffsfläche und damit bewusst kurz gehalten und lesbar.

`src/core` kennt Electron nicht. Alles, was von außen kommt — Betriebssystem,
Schlüsselspeicher, Ereignissenke — wird als Parameter übergeben
(`createRuntime`). Deshalb kann die Testsuite eine vollständige Laufzeit gegen
eine Datenbank im Arbeitsspeicher bauen, ohne Electron zu starten.

---

## 2. Ein Durchlauf, von der Äußerung bis zum Versand

```
Sprache/Text
   │
   ▼
JarvisCore.handle()
   │  1. Turn ins Gedächtnis schreiben
   │  2. Freigabe-Abfang: ist das eine eindeutige Freigabe?  ──► ApprovalService.decide()
   │  3. Werkzeugschleife
   ▼
LlmProvider.complete()   ◄──────────────────────────────┐
   │  stop_reason = tool_use                            │
   ▼                                                    │
ToolRegistry.execute()                                  │
   │  Zod-Prüfung der Parameter                         │
   ▼                                                    │
Agent (MailAgent, CompanyResearchAgent, …)              │
   │  echte Wirkung + Protokolleintrag                  │
   ▼                                                    │
Ergebnis oder Fehler als tool_result ────────────────────┘
   │  (Fehler unverändert, nie geschönt)
   ▼
Antworttext + Ereignisse an die Oberfläche
```

Die Schleife ist von Hand geschrieben und nicht dem SDK-Tool-Runner überlassen,
weil sie pro Durchgang vier Dinge zusätzlich tun muss: ein UI-Ereignis senden,
einen Protokolleintrag schreiben, Freigaben abfangen und anbieterneutral
bleiben. Sie ist bei `MAX_ITERATIONS = 12` gedeckelt.

---

## 3. Die Versandsperre

Der Kern der Anforderung ist eine einzige Zusicherung:

> Es gibt keinen Codepfad, der eine E-Mail versendet, ohne vorher eine gültige,
> unverbrauchte, inhaltsgebundene Freigabe eingelöst zu haben.

Umgesetzt an vier Stellen, die zusammenwirken:

**a) Ein einziger Ausgang.** Nur `MailAgent.sendApproved()` spricht einen
`MailTransport` an. Der `OutreachAgent` hat keinen Transport, der `JarvisCore`
auch nicht, und kein Werkzeug außer `send_email` ruft `sendApproved()` auf.

**b) Die Sperre selbst.** Erste Anweisung von `sendApproved()`:

```ts
const claim = this.deps.approvals.claim(`email:${id}`, this.fingerprintOf(email));
if (!claim.ok) return claim;
```

`claim()` scheitert bei fehlender, abgelehnter, abgelaufener oder bereits
verbrauchter Freigabe — und bei abweichendem Fingerabdruck.

**c) Inhaltsbindung.** Der Fingerabdruck ist ein SHA-256 über Empfänger, Kopie,
Blindkopie, Betreff, Text und Anhänge. Wird der Entwurf geändert, erhöht das
Repository die Revision, setzt den Status zurück auf `entwurf` und löst die
Verknüpfung zur Freigabe. Der nächste `claim()` liefert `approval.stale`.

**d) Einmaligkeit.** `approvals.consumed_at` wird beim Einlösen gesetzt, mit
einem `UPDATE … WHERE consumed_at IS NULL`. Zwei parallele Versuche können nicht
beide gewinnen.

Dazu kommt die sprachliche Seite: `classifyApproval()` wertet nur
unmissverständliche Äußerungen als Freigabe. Verneinung, Fragezeichen oder ein
Konditional („wenn", „falls", „vorher", „später", „noch") machen jede Äußerung
zu `unklar` — unabhängig davon, wie viele Freigabewörter darin vorkommen. Bei
mehreren offenen Freigaben wird gar nichts entschieden.

Die Prüfungen aus `ComplianceService` laufen **zweimal**: beim Anfordern der
Freigabe, damit niemand etwas freigeben muss, das ohnehin scheitern würde, und
unmittelbar vor dem Transportaufruf, weil sich der Zustand dazwischen geändert
haben kann.

---

## 4. Wie Halluzinationen verhindert werden

Die Aufgabenteilung ist der ganze Trick:

| Schritt | Wer | Darf erfinden? |
|---|---|---|
| Seite abrufen | `HttpFetcher` | — |
| Adressen und Links herauslesen | `PageExtractor` | nein, rein mechanisch |
| Adressen bewerten | `EmailVerifier` | nein, Regeln + DNS |
| Seitentext verstehen, Ansprechpartner benennen | Sprachmodell | nur beschreiben, nicht ergänzen |
| Auswahl der besten Adresse | Sprachmodell | nur aus der übergebenen Liste |

Nach der Modellantwort wird gegengeprüft: Adressen, die nicht in der
übergebenen Liste stehen, werden verworfen; Ansprechpartner, deren Name nicht
im abgerufenen Seitentext vorkommt, ebenfalls. Steht das Modell nicht zur
Verfügung, läuft die Recherche mit rein mechanischen Daten weiter — dünner,
aber nicht erfunden.

`VERIFIZIERT` verlangt kumulativ: gültige Syntax, keine Systemadresse,
Fundstelle auf einer offiziellen Seite des Unternehmens (Website, Kontakt,
Impressum), passende Domain und ein MX-Eintrag. Alles andere ist höchstens
`WAHRSCHEINLICH`.

---

## 5. Datenmodell

```
companies ──┬── contacts ──── email_addresses
            ├── company_sources ──── sources
            ├── emails ──── approvals (subject = 'email:<id>')
            │      └── send_log
            └── interaction_history

outreach_campaigns ──── emails
suppression_list        (global, Adresse oder Domain)
tasks · memory · conversations · messages · settings · credentials · audit_logs
```

Bemerkenswert:

* **Dubletten sind auf Datenbankebene ausgeschlossen.** `companies` hat einen
  eindeutigen Index auf `domain` und, wo keine Domain bekannt ist, auf
  `lower(name)`. `email_addresses` ist eindeutig je `(company_id, lower(address))`.
* **Freigaben sind über `subject` lose gekoppelt** (`email:17`,
  `file.delete:/pfad`), damit dieselbe Engine für alle gefährlichen Aktionen
  dient, ohne dass jede Tabelle eine Fremdschlüsselspalte braucht.
* **`send_log` ist die Grundlage für Limits.** Tageslimit und Mindestabstand
  werden aus tatsächlichen Sendeversuchen berechnet, nicht aus dem Mailstatus.
* **`credentials.ciphertext`** enthält nur Chiffrat. Klartext existiert
  ausschließlich im Speicher des Hauptprozesses.
* **Gedächtnis ist getrennt:** Gesprächsverläufe verfallen nach 30 Tagen,
  `memory` hält Präferenzen und Fakten dauerhaft — beides einsehbar und
  löschbar.

---

## 6. Getroffene Entscheidungen

**Electron statt Tauri.** Ausschlaggebend war der Funktionsumfang von Version 1:
IMAP, SMTP, MIME und OAuth sind im Node-Ökosystem ausgereift, und der gesamte
Kern bleibt damit in einer Sprache und ohne Prozessgrenze testbar. Tauris
Vorteile — kleineres Paket, weniger Speicher — hätten hier eine Rust-Brücke für
genau die Teile bedeutet, die am meisten Sorgfalt brauchen. Der
Sicherheitsabstand wurde durch Härtung geschlossen (Sandbox, Kontextisolierung,
CSP, Kanal-Allowlist).

**`node:sqlite` statt `better-sqlite3`.** Eingebaut in Node 22.5+ und in
Electron, also keine native Abhängigkeit, die bei jedem Electron-Update neu
gebaut werden muss. `better-sqlite3` wird bevorzugt, sobald es installiert ist —
der Treiberadapter ist zwanzig Zeilen groß.

**Manuelle Werkzeugschleife statt SDK-Tool-Runner.** Siehe Abschnitt 2.

**`Result<T, E>` statt Ausnahmen.** Jede fehlbare Operation liefert einen Wert.
Damit kann ein Fehler nicht versehentlich verschluckt werden, und er reist mit
Code, deutscher Meldung und Handlungshinweis bis in die Oberfläche.

**Zod als einzige Wahrheit für Werkzeugparameter.** Aus demselben Schema
entsteht das JSON-Schema für das Modell und die Laufzeitprüfung. Ein
fehlerhafter Aufruf wird abgewiesen, bevor er eine Implementierung erreicht.

**Deutsch im gesamten Produkt.** Fehlermeldungen, Protokoll und Statusnamen
sind das, was der Nutzer liest und hört. Bezeichner im Code bleiben englisch,
Domänenwerte in der Datenbank deutsch (`entwurf`, `gesendet`, `freigegeben`),
weil sie unverändert in der Oberfläche erscheinen.

---

## 7. Erweiterung

**Neues Werkzeug:** in `src/core/tools/` mit `defineTool` anlegen, in
`buildToolRegistry()` eintragen. Braucht es eine Freigabe, `approvalAction`
setzen, im Werkzeug nur `approvals.request()` aufrufen und die Ausführung an
eine zweite, `claim()`-geschützte Methode hängen.

**Neuer Versandweg:** `MailTransport` implementieren und in
`createMailTransport()` verdrahten. `sendApproved()` bleibt unberührt — deshalb
kann ein neuer Transport die Sperre nicht umgehen.

**Neuer Modellanbieter:** `LlmProvider` implementieren, in
`createLlmProvider()` ergänzen.

**Neue Integration** (Kalenderschreibzugriff, WhatsApp, CRM, Angebots-PDF):
als eigener Agent mit eigenen Werkzeugen. Alles, was nach außen wirkt, geht
über dieselbe Freigabe-Engine — das ist die Bedingung, unter der der Rest des
Systems weiter stimmt.

---

## 8. Tests

`npm test` — ohne Netzzugriff, deterministisch.

| Datei | Deckt ab |
|---|---|
| `approvalPhrases` | Freigabeerkennung, besonders die Fälle, die *keine* Freigabe sind |
| `mailGate` | Die Sperre: ohne Freigabe, nur angefragt, abgelehnt, abgelaufen, verbraucht, nach Änderung, Fehlschlag ehrlich gemeldet, Protokollkette |
| `compliance` | Sperrliste, „nicht kontaktieren", Sperrfrist, unverifizierte und unbekannte Adressen, Tageslimit |
| `research` | Seitenauswertung, verschleierte Adressen, Statusvergabe, Trefferaufbereitung, robots.txt |
| `storage` | Dubletten, Adressrangfolge, Quellen, Versandzentrale, Verschlüsselung, Protokollexport, ICS |
| `fileAgent` | Sandkasten, Überschreiben und Löschen nur mit Freigabe |
| `outreach` | Individuelle Entwürfe, Überspringen mit Begründung, kein zweiter Erstkontakt, unbrauchbare Modellantwort |
| `jarvisCore` | Der vollständige Ablauf mit einem skriptgesteuerten Modell, inklusive der Fälle, in denen das Modell selbst zu senden versucht |

Zusätzlich ein Rauchtest, der die echte Anwendung startet:

```bash
JARVIS_SMOKE_TEST=1 xvfb-run -a npx electron .
```
