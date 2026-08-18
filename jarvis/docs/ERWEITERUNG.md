# Erweitern

Die drei häufigsten Handgriffe, jeweils an einem echten Beispiel.

## Ein neues Werkzeug

Werkzeuge liegen in `src/core/tools/impl/`. Eingaben werden mit zod beschrieben;
daraus entsteht automatisch das Schema für das Sprachmodell.

```ts
const angebotSchema = z.object({
  companyId: z.number().int(),
  leistung: z.string().min(3).describe('Welche Leistung angeboten wird')
});

const erstelleAngebot: ToolDefinition = {
  name: 'create_offer_pdf',
  agent: 'FileAgent',
  description: 'Erzeugt ein Angebots-PDF für ein Unternehmen und legt es ab.',
  schema: angebotSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof angebotSchema>;
    const firma = context.repos.companies.byId(daten.companyId);
    if (!firma) return fail(`Unternehmen ${daten.companyId} existiert nicht.`);
    // … erzeugen …
    return ok(`Angebot für ${firma.name} abgelegt.`, { pfad });
  }
};
```

Anmelden in `src/core/tools/index.ts` und dem zuständigen Agenten in
`AGENT_WERKZEUGE` zuordnen. Fertig – Protokollierung, Schemaprüfung und
Fehlerbehandlung kommen aus dem Verzeichnis.

**Freigabepflichtig?** Dann `criticalAction` setzen, `approvalId: z.number()`
ins Schema aufnehmen und die Aktion in `KRITISCHE_AKTIONEN`
(`src/core/services/approval.ts`) eintragen. Die Registry löst die Freigabe
dann selbst ein; das Werkzeug wird ohne gültige Freigabe nie betreten.

Wenn die Freigabe an einen Inhalt gebunden sein soll – wie beim Mailversand –,
zusätzlich `contentHash` implementieren:

```ts
contentHash: (input, context) =>
  context.repos.emails.byId(Number(input.emailId))?.contentHash ?? 'nicht-vorhanden',
```

## Ein neuer Agent

In `src/core/agents/definitions.ts` einen Eintrag ergänzen: Name, ein Satz
Zuständigkeit (den liest der Router), Stichwörter für die schnelle Zuordnung,
Systemanweisung und die erlaubten Werkzeuge. Die Grundregeln (§ „nie ungefragt
senden“, „nichts erfinden“) stehen in `GRUNDREGELN` und gelten automatisch mit.

## Ein neuer Anbieter

Alle Anbieter sind Schnittstellen mit vier Methoden: `configured()`,
`missingHint()`, der eigentlichen Arbeit – und einer ehrlichen Fehlermeldung,
wenn etwas fehlt.

| Bereich         | Schnittstelle   | Vorhanden                                   |
| --------------- | --------------- | ------------------------------------------- |
| Sprachmodell    | `LlmProvider`   | Anthropic, OpenAI-kompatibel (auch lokal)   |
| Websuche        | `SearchProvider`| Brave, Tavily, SerpAPI                      |
| Versand         | `MailTransport` | SMTP, Gmail (OAuth)                         |
| Posteingang     | `MailReader`    | IMAP                                        |
| Spracherkennung | `SttProvider`   | Fenster, OpenAI-kompatibel                  |
| Sprachausgabe   | `TtsProvider`   | Fenster, OpenAI-kompatibel, ElevenLabs      |
| Kalender        | `CalendarService`| Google (nur lesend)                        |

Beispiel Microsoft Graph als Versandweg: `MailTransport` umsetzen, in
`MailService.create` einhängen, `JARVIS_MAIL_PROVIDER=graph` erlauben. Weder
Agenten noch Werkzeuge noch Oberfläche ändern sich – sie kennen nur die
Schnittstelle.

---

## Vorbereitete Anschlüsse

Diese Erweiterungen sind noch nicht umgesetzt, aber im Aufbau bereits
berücksichtigt:

| Vorhaben                  | Wo es andockt                                                        |
| ------------------------- | -------------------------------------------------------------------- |
| Microsoft Outlook / Graph | `MailTransport` + `MailReader`; OAuth analog zu `GoogleOAuthClient`   |
| Microsoft 365, Kontakte   | eigener Dienst wie `CalendarService`, Werkzeuge im `CalendarAgent`    |
| Google Calendar schreibend| `CalendarService` erweitern; Termine anlegen wird freigabepflichtig   |
| WhatsApp Business API     | neuer Kanal; fällt unter `message_external_person`, also Freigabepflicht |
| CRM-Anbindung             | Repositories als Ausgangspunkt; Abgleich als eigener Dienst           |
| Telefonie                 | eigener Agent mit Werkzeugen; Anrufe sind Aktionen nach außen         |
| Angebote und PDF          | Werkzeug im `FileAgent`; Vorlagen im Datenverzeichnis                 |
| Cloudspeicher             | zusätzliche erlaubte Wurzeln in `SystemService` oder eigener Dienst   |
| Weitere Firmenverzeichnisse| `SearchProvider` oder eigene Quelle in `ResearchService`             |

Zwei Regeln gelten für jede Erweiterung:

1. Alles, was nach außen wirkt oder Daten verändert, gehört in
   `KRITISCHE_AKTIONEN` und damit hinter die Freigabestelle.
2. Alles, was recherchiert wird, braucht eine Quelle. Ohne Quelle ist es eine
   Einschätzung und wird als solche gekennzeichnet.

---

## Tests

```bash
npm test
```

| Datei                     | Prüft                                                        |
| ------------------------- | ------------------------------------------------------------ |
| `tests/db.test.ts`        | Schema, Dubletten, Adressrangfolge, Versandzentrale           |
| `tests/approval.test.ts`  | Freigaben: einmalig, inhaltsgebunden, befristet; Sprachdeutung |
| `tests/verification.test.ts` | Bewertung von Adressen, MX-Prüfung                        |
| `tests/extractor.test.ts` | HTML-Auswertung, Firmenname, Ansprechpartner, robots.txt      |
| `tests/system.test.ts`    | Pfadgrenzen, Programmstart, Anhänge                           |
| `tests/credentials.test.ts` | Tresor, Vorrang der Umgebung, keine Werte nach außen        |
| `tests/workflow.test.ts`  | Der ganze Ablauf: Recherche → Entwurf → Freigabe → Versand     |

`tests/helpers/fakes.ts` ersetzt Netz, Sprachmodell und Versandweg. Der Kern
selbst läuft in den Tests unverändert – geprüft wird also der echte Weg, nicht
eine Nachbildung.
