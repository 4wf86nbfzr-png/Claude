# Architektur

Diese Datei beschreibt, wie JARVIS gebaut ist und warum. Sie richtet sich an
jemanden, der etwas ändern will.

---

## Leitgedanke

Ein Assistent, der E-Mails verschickt und Dateien anfasst, ist nur so
vertrauenswürdig wie die Stelle, an der er *nicht* selbst entscheiden darf.
Deshalb ist die Architektur um zwei Fragen herum gebaut:

1. **Kann das Modell etwas tun, ohne dass ein Werkzeug es tut?** — Nein.
2. **Kann ein Werkzeug etwas nach außen geben, ohne Freigabe?** — Nein.

Alles andere ist Handwerk.

---

## Schichten

```
  ┌─────────────────────────────────────────────────────────┐
  │  packages/ui        React – Fenster, Sprache im Browser  │
  └───────────────────────────┬─────────────────────────────┘
                              │ window.jarvis.invoke(Befehl)
  ┌───────────────────────────┴─────────────────────────────┐
  │  packages/desktop   Electron – Fenster, IPC, Keychain    │
  └───────────────────────────┬─────────────────────────────┘
                              │ CommandHandler
  ┌───────────────────────────┴─────────────────────────────┐
  │  packages/core                                           │
  │                                                          │
  │   Jarvis ─── JarvisCore ──► Fachagenten                  │
  │      │            │              │                       │
  │      │            └──────────────┴──► ToolRegistry       │
  │      │                                    │              │
  │      │                                    ▼              │
  │      │        ApprovalService ◄──── Dienste              │
  │      │              │            (Mail, Research,        │
  │      │              │             Outreach, System,      │
  │      │              ▼             Voice, Calendar)       │
  │      └────────► SQLite + AuditLog + Credentials          │
  └─────────────────────────────────────────────────────────┘
```

Der Kern kennt weder Electron noch React. Das ist keine Stilfrage: dieselbe
Logik läuft dadurch in der Desktop-App, in der Konsole (`npm run jarvis`) und
in den Tests — und die 75 Tests brauchen weder Browser noch Netz.

---

## Der Weg einer Anweisung

„Such mir 15 Bauunternehmen in Hamburg."

1. **Fenster** → `befehl({ kind: 'ask', text })` über die Vorlade-Brücke.
2. **Hauptprozess** reicht an `CommandHandler.handle()` durch.
3. **`Jarvis.ask()`** prüft zuerst, ob das eine Antwort auf eine offene
   Freigabefrage ist (`interpretApprovalUtterance`). Wenn ja, wird das Modell
   gar nicht erst befragt — die Entscheidung wird ausgeführt.
4. Sonst läuft **`JarvisCore`**: System-Prompt + Gesprächsverlauf + seine
   Werkzeuge ans Modell.
5. Das Modell ruft `delegate_to_agent('CompanyResearchAgent', …)`.
6. Der **Fachagent** läuft in derselben Schleife, aber mit eigenem Prompt und
   eigener, kleinerer Werkzeugliste. Er kennt das Gespräch nicht.
7. Jeder Werkzeugaufruf geht durch die **Registry**: Schema-Prüfung mit zod,
   Ausführung, Ergebnis als `Result`, Eintrag ins **Audit-Log**, Ereignis auf
   dem **EventBus**.
8. Das Fenster hört auf dem Bus mit und zeigt die Schritte live.
9. Der Fachagent gibt sein Ergebnis an `JarvisCore` zurück, der es für den
   Benutzer zusammenfasst — kurz, weil er unter Umständen vorgelesen wird.

---

## Datenmodell (SQLite)

Eine Datei, WAL-Modus, Fremdschlüssel an. Migrationen als nummerierte
`.sql`-Dateien in `src/db/migrations/`, eingespielt beim Öffnen.

Die `.sql`-Dateien werden beim Bauen in `migrations.generated.ts` eingebettet
(`npm run migrations`). Grund: der Kern wird für den Electron-Hauptprozess
gebündelt, und in einem Bündel gibt es keinen verlässlichen Weg, eine Datei
neben dem Modul zu finden — weder im Entwicklungsmodus noch in der gepackten
App. Eingebettet funktioniert es überall gleich. `JARVIS_MIGRATIONS_DIR` hat
Vorrang, falls jemand Migrationen ohne Neubau nachreichen will.

| Tabelle | Enthält |
|---|---|
| `companies` | Firmen, eindeutig über Namensslug und Domain |
| `contacts` | Ansprechpartner, nur wenn öffentlich genannt |
| `email_addresses` | Adressen mit Verifizierungsstatus, Quelle, MX-Ergebnis |
| `sources` | Jede abgerufene Seite mit Zeitpunkt und Beleg-Ausschnitt |
| `company_facts` | Getrennt nach `FAKT` (mit Quelle) und `KI_EINSCHAETZUNG` |
| `outreach_campaigns`, `campaign_targets` | Kampagnen und Zielliste |
| `emails`, `email_attachments` | Entwürfe, gesendete und eingegangene Mails |
| `interaction_history` | Kontaktverlauf je Firma |
| `approvals` | Freigabeanfragen mit Nutzlast und Inhaltshash |
| `suppression_list` | Sperrliste (E-Mail, Domain, Firma) |
| `audit_logs` | Was wann von wem, in ganzen deutschen Sätzen |
| `memory_items` | Was JARVIS sich merken darf |
| `conversations`, `messages` | Gesprächsverlauf |
| `tasks`, `settings` | Aufgaben, Einstellungen |

**Dublettenschutz** sitzt in der Datenbank, nicht im Agenten:
`companies.slug` und `companies.domain` sind eindeutig,
`email_addresses.address_norm` ebenfalls. Ein zweiter Recherchelauf kann
dieselbe Firma also nicht doppelt anlegen.

---

## Die Approval-Engine

Der wichtigste Teil. Ablauf:

```
Werkzeug ──► approvals.request({ actionType, payload, contentHash, details })
                 │
                 ├─► Zeile in `approvals` (Status: offen), überlebt Neustart
                 ├─► Ereignis an die Oberfläche
                 └─► Werkzeug meldet „wartet auf Freigabe" und ist fertig
                             ⋮
Benutzer ──► approvals.approve(id)
                 │
                 ├─► Validator: passt der Inhalt noch? (Hash-Vergleich)
                 ├─► Status auf „freigegeben"
                 ├─► ActionPermit ausstellen (HMAC, prozesslokaler Schlüssel)
                 └─► Executor ausführen ──► MailService.send(id, permit)
                                                 │
                                                 └─► verifyPermit(...)
```

Drei Eigenschaften machen das belastbar:

- **Nicht blockierend.** Der Agent wartet nicht auf die Entscheidung. Die
  Anfrage steht in der Datenbank und überlebt einen Neustart.
- **Fälschungssicher.** Der Permit ist mit einem Zufallsschlüssel signiert, den
  nur die `ApprovalService`-Instanz kennt. Ein zusammengebautes Objekt
  scheitert an `timingSafeEqual`.
- **Inhaltsgebunden.** Der Hash über Empfänger, Betreff und Text ist Teil der
  Signatur. Nachträgliche Änderungen entwerten die Freigabe automatisch —
  `EmailRepo.updateDraft` setzt den Status ohnehin auf „Entwurf" zurück.

Freigabepflichtige Aktionen stehen abschließend in `APPROVAL_ACTIONS`. Ohne
registrierten Executor ist eine Aktion schlicht nicht ausführbar.

---

## Werkzeuge

Ein Werkzeug ist ein Objekt mit Name, Beschreibung, zod-Schema und Handler.
Die Registry macht daraus die Modell-Spezifikation (JSON-Schema) und führt
Aufrufe aus. Sie wirft nie — Fehler kommen als `Result` zurück, damit das
Modell sie sieht und darauf reagieren kann.

Die 44 Werkzeuge nach Bereich: Recherche (6), Mail (10), CRM und Kampagnen (9),
Dateien und System (9), Freigaben, Gedächtnis, Aufgaben, Protokoll (9),
Delegation (1).

**Was es bewusst nicht gibt:** ein Werkzeug zum Versenden. Der einzige Weg
führt über `request_send_approval` und die Entscheidung des Benutzers.

---

## Fehlerbehandlung

Alles, was schiefgehen kann, gibt `Result<T>` zurück:

```ts
{ ok: true,  data: T }
{ ok: false, error: { code, message, hint?, detail? } }
```

`message` ist immer deutscher Klartext, `hint` nennt den nächsten Schritt.
Dieses Objekt geht unverändert ans Modell — deshalb kann es einen Fehlschlag
nicht als Erfolg ausgeben. Ein Fehler beim Versand landet zusätzlich als
`fehler` im Audit-Log und setzt die Mail auf `fehlgeschlagen`.

---

## Erweiterungspunkte

| Was | Wo ansetzen |
|---|---|
| Anderes Sprachmodell | `LlmProvider` in `llm/types.ts` implementieren, in `createLlmProvider` eintragen |
| Anderer Mailweg | `MailTransport` implementieren (`mail/types.ts`) |
| Anderer Posteingang | `MailReader` implementieren |
| Andere Suche | `SearchProvider` implementieren (`research/search/types.ts`) |
| Kalender per API | `CalendarSource` implementieren (`calendar/index.ts`) |
| Neues Werkzeug | `defineTool` in `tools/`, Agenten zuordnen |
| Neuer Agent | `AgentDefinition` in `agents/index.ts` — Werkzeugliste knapp halten |
| Neue Ansicht | `views/` + Eintrag in `App.tsx` |
| Neuer Befehl ans Fenster | `Command`-Union in `ipc/contract.ts`; der Compiler zeigt, wo er fehlt |

Die Anbindungen aus dem Pflichtenheft (WhatsApp Business, Telefonie, CRM,
Cloudspeicher, PDF-Erstellung) passen alle in eines dieser Muster — meist als
weiterer Transport oder als Werkzeuggruppe.

---

## Testaufbau

`packages/core/test/` — 75 Tests, ohne Netz, ohne echte Schlüssel.

| Datei | Prüft |
|---|---|
| `approval.test.ts` | Die Sicherheitsregel: kein Versand ohne gültige, inhaltsgebundene Freigabe |
| `compliance.test.ts` | Sperrliste, Verifizierungspflicht, Dubletten, Versandlimits |
| `voice-approval.test.ts` | Gesprochene Zustimmung: was zählt, was nachfragt |
| `workflow.test.ts` | Der ganze Ablauf von der Recherche bis zum Versand |
| `agents.test.ts` | Werkzeugzuschnitt, Schrittgrenze, Delegation, Modellausfall |
| `research.test.ts` | Extraktion, Verifizierungsregeln, robots.txt, Suchauswertung |
| `db.test.ts` | Schema, Normalisierung, Dublettenschutz |
| `migrations.test.ts` | Eingebettete Fassung stimmt mit den .sql-Dateien überein |
| `dashboard.test.ts` | Die Kennzahlen der Kommandozentrale zählen echte Vorgänge, auch die Null |

Die Attrappen in `test/fakes.ts` (`FakeLlm`, `FakeTransport`, `fakeFetch`)
verdrahten eine vollständige JARVIS-Instanz — es wird also der echte Code
getestet, nur ohne Außenwelt.
