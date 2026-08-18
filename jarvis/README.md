# JARVIS

Lokaler Desktop-Assistent für die tägliche Arbeit: recherchiert Unternehmen aus
öffentlichen Quellen, bereitet individuelle Akquise-Mails vor, liest sie vor –
und versendet **nur** nach ausdrücklicher Freigabe.

Läuft vollständig auf dem eigenen Rechner. Die Datenbank ist eine lokale
SQLite-Datei, Zugangsdaten liegen im Schlüsselbund des Betriebssystems.
Nach außen geht nur, was für die beauftragte Aufgabe nötig ist: Anfragen an das
gewählte Sprachmodell, an den Suchdienst und an das eigene Postfach.

---

## Die wichtigste Regel

**JARVIS versendet niemals selbstständig eine E-Mail.**

Der Ablauf ist fest verdrahtet:

```
Recherche → Empfänger prüfen → Entwurf → vollständige Vorschau
→ Empfänger, Betreff und Text anzeigen bzw. vorlesen
→ ausdrückliche Freigabe abwarten → erst dann Versand
```

Technisch abgesichert an drei Stellen, die unabhängig voneinander greifen:

1. **Werkzeugverzeichnis** (`src/core/tools/registry.ts`) – `send_email` ist als
   freigabepflichtig markiert. Ohne gültige, eingelöste Freigabe wird die
   Funktion gar nicht erst betreten.
2. **Freigabestelle** (`src/core/services/approval.ts`) – eine Freigabe gilt für
   genau eine Aktion, genau einen Inhalt (SHA-256-Prüfsumme) und eine begrenzte
   Zeit. Nach dem Einlösen ist sie verbraucht.
3. **Versanddienst** (`src/core/services/mail/index.ts`) – nimmt das
   Freigabeobjekt als Parameter entgegen und vergleicht die Prüfsumme erneut.

Wird ein Entwurf nach der Freigabe geändert, ändert sich seine Prüfsumme und die
Freigabe verfällt. Das ist getestet (`tests/workflow.test.ts`).

---

## Schnellstart

```bash
cd jarvis
npm install
npm run setup      # fragt Anbieter, Zugangsdaten und Absenderprofil ab
npm start          # baut und öffnet die App
```

Für die Entwicklung mit automatischem Neuladen der Oberfläche:

```bash
npm run dev
```

Weitere Befehle:

| Befehl              | Zweck                                              |
| ------------------- | -------------------------------------------------- |
| `npm test`          | Alle Tests (Datenbank, Freigaben, Recherche, Ablauf) |
| `npm run typecheck` | Typprüfung für Kern und Oberfläche                  |
| `npm run dist`      | Installierbares Paket bauen (electron-builder)      |

**Empfehlung für den Anfang:** `JARVIS_DRY_RUN=true` lassen. Dann läuft der
gesamte Ablauf einschließlich Freigabe, es geht aber nachweislich nichts hinaus.
Der Testbetrieb wird in der Oberfläche deutlich angezeigt.

---

## Was Sie noch hinterlegen müssen

Alles ist vollständig implementiert; es fehlen nur Zugänge, die naturgemäß
persönlich sind. Einzutragen unter **Einstellungen → Zugangsdaten** oder in der
`.env` (siehe `.env.example`).

| Wofür                    | Was Sie brauchen                        | Woher                                                     |
| ------------------------ | --------------------------------------- | --------------------------------------------------------- |
| Sprachmodell (Pflicht)   | `ANTHROPIC_API_KEY`                     | console.anthropic.com → API Keys                           |
|                          | *oder* `OPENAI_API_KEY` + `JARVIS_LLM_BASE_URL` | OpenAI, Azure, Groq – oder lokal per Ollama/LM Studio |
| Unternehmensrecherche    | `BRAVE_API_KEY`                         | api.search.brave.com (kostenloses Kontingent)              |
|                          | *oder* `TAVILY_API_KEY` / `SERPAPI_API_KEY` | tavily.com / serpapi.com                               |
| E-Mail-Versand           | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | Ihr Mailanbieter                                        |
|                          | *oder* `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Google Cloud Console, OAuth-Client "Desktop"    |
| Antworten zuordnen (optional) | `IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD` | Ihr Mailanbieter                                    |
| Diktat statt Fenstererkennung (optional) | `JARVIS_STT_BASE_URL` + Schlüssel | OpenAI Whisper oder ein lokaler Whisper-Server    |
| Natürlichere Stimme (optional) | `ELEVENLABS_API_KEY`              | elevenlabs.io                                              |
| Kalender (optional)      | Google verbinden                        | Einstellungen → Mit Google verbinden                       |

Ohne Sprachmodell und ohne Suchdienst sagt JARVIS das im Klartext, statt etwas
zu erfinden – Sprachausgabe, Datenbank, Entwurfsverwaltung und Protokoll
funktionieren auch dann.

### Gmail statt SMTP

1. Google Cloud Console → **APIs & Dienste** → Gmail API aktivieren.
2. **Anmeldedaten** → OAuth-Client-ID → Anwendungstyp **Desktop**.
3. Client-ID und Client-Secret in JARVIS hinterlegen.
4. Einstellungen → **Mit Google verbinden**. Der Browser öffnet sich, nach der
   Anmeldung landet ein Refresh-Token im verschlüsselten Tresor.

JARVIS erhält damit nur die Rechte „Mail senden“, „Mail lesen“ und
„Kalender lesen“ – nie das Kontopasswort.

---

## Der Ablauf in der Praxis

```
Sie:     Such mir fünfzehn Bauunternehmen in Hamburg für unsere Baustellenbewachung.
JARVIS:  Ich habe 15 Unternehmen gefunden. Für 12 liegt eine verifizierte
         Kontaktadresse vor. Soll ich Akquise-Entwürfe vorbereiten?
Sie:     Ja.
JARVIS:  12 Entwürfe vorbereitet. Es wurde nichts versendet.
Sie:     Lies mir den ersten vor.
JARVIS:  (liest Empfänger, Betreff und Text vor)
Sie:     Mach ihn etwas kürzer.
JARVIS:  (überarbeitet und liest erneut vor)
Sie:     Perfekt. Senden.
JARVIS:  Versand an kontakt@firma.de freigeben? (Freigabekarte mit vollem Text)
Sie:     Ja.
JARVIS:  E-Mail an kontakt@firma.de wurde versendet.
```

Ein knappes „Ja“ zählt nur als Freigabe, wenn JARVIS unmittelbar zuvor danach
gefragt hat. „Vielleicht senden“, „Ja, aber kürzer“ oder „Später“ führen zu
einer Rückfrage – nie zum Versand. Nachzulesen in
`src/core/services/approvalPhrases.ts`.

---

## Ansichten

- **Gespräch** – Kugel, Sprachstatus, Verlauf, Freigabekarten.
- **Versand** – die Versandzentrale: Unternehmen, Ansprechpartner, Adresse,
  Quelle, Verifizierungsgrad, Akquisegrund, Mailstatus, letzter Kontakt,
  Freigabestatus.
- **Entwürfe** – lesen, bearbeiten, vorlesen, Freigabe anfordern.
- **Protokoll** – jede Handlung mit Uhrzeit, Ziel und Ergebnis.
- **Einstellungen** – Dienste, Zugangsdaten, Gedächtnis, Sperrliste.

---

## Wie Adressen bewertet werden

Es gibt keinen Weg, auf dem eine erfundene Adresse in den Versand gelangt.
Jede Adresse muss wörtlich auf einer abgerufenen Seite gestanden haben:

| Status               | Bedeutung                                                            | Versand |
| -------------------- | -------------------------------------------------------------------- | ------- |
| `VERIFIZIERT`        | Stand auf Website, Kontaktseite oder Impressum des Unternehmens       | ja      |
| `WAHRSCHEINLICH`     | Stand in einer anderen öffentlichen Quelle oder gehört zu fremder Domain | nein |
| `NICHT_VERIFIZIERT`  | Nur abgeleitet, ohne Beleg, oder Domain nimmt keine Mails an          | nein    |

Ein Muster wie `vorname.nachname@firma.de` ist ausdrücklich **keine** gefundene
Adresse und wird immer auf `NICHT_VERIFIZIERT` gesetzt
(`src/core/research/verification.ts`, getestet in `tests/verification.test.ts`).

---

## Recht und Anstand

- **Sperrliste** – Adressen und Domains, die nie angeschrieben werden. Die Prüfung
  sitzt im Versandpfad, nicht in der Oberfläche.
- **Dublettenprüfung** – bereits angeschriebene Unternehmen werden erkannt; vor
  einem zweiten Erstkontakt weist JARVIS ausdrücklich darauf hin.
- **Versandgrenzen** – Tageslimit, Mindestabstand zwischen Sendungen und eine
  Obergrenze für Empfänger je Nachricht. Rundmails werden abgelehnt.
- **Quellennachweise** – jede gespeicherte Aussage hängt an einer abgerufenen
  Seite; Einschätzungen sind als solche gekennzeichnet.
- **robots.txt** wird beim Abruf beachtet, je Host gilt eine Mindestpause.

Es gibt bewusst keine versteckte Massenversandfunktion und keine Umgehung von
Spam-Filtern. Ob eine konkrete Ansprache zulässig ist (UWG, DSGVO), entscheidet
weiterhin der Mensch vor dem Rechner – JARVIS liefert dafür die Belege und die
Bremsen.

---

## Weiterführende Dokumentation

- [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) – Aufbau, Datenmodell, Agenten,
  Werkzeuge und die Begründung für den Technikstapel.
- [`docs/SICHERHEIT.md`](docs/SICHERHEIT.md) – Freigabemodell, Zugangsdaten,
  Berechtigungen, was bewusst nicht geht.
- [`docs/ERWEITERUNG.md`](docs/ERWEITERUNG.md) – neues Werkzeug, neuer Agent,
  neuer Anbieter; vorbereitete Anschlüsse (Outlook, WhatsApp, CRM, PDF …).
