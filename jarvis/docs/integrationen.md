# Integrationen

Was angebunden ist, was fehlt, und was jede fehlende Anbindung konkret braucht.

Eine Integration gilt hier erst dann als vorhanden, wenn sie eingerichtet,
authentifiziert **und** getestet ist. Alles andere steht unter „fehlt" --
auch wenn der Code schon da ist. JARVIS behauptet nie, Zugriff auf ein Konto
zu haben, das nicht verbunden ist: Werkzeuge ohne Zugangsdaten melden sich als
nicht einsatzbereit und werden dem Sprachmodell gar nicht erst angeboten.

## Vorhanden

| Dienst | Werkzeug | Stand |
| --- | --- | --- |
| Lokale Dateien | `datei_lesen`, `ordner_auflisten`, `datei_suchen`, `text_suchen`, `datei_schreiben`, `datei_anhaengen`, `datei_aendern`, `datei_loeschen`, `datei_info` | getestet |
| Aufgaben (eigene) | `aufgabe_anlegen`, `aufgabe_zerlegen`, `aufgaben_offen`, `aufgabe_beginnen`, `aufgabe_erledigt`, `aufgabe_blockiert`, `aufgabe_gescheitert` | getestet |
| Gedaechtnis | `fakt_merken`, `fakt_korrigieren`, `fakt_abfragen`, `wissen_ablegen`, `wissen_suchen` | getestet |
| Notizen (macOS) | `notiz_anlegen`, `notiz_suchen`, `notiz_lesen` | **ungetestet** (AppleScript, nie auf macOS gelaufen) |
| Erinnerungen (macOS) | `erinnerung_anlegen`, `erinnerungen_offen` | **ungetestet** |
| Kalender (macOS, nur lesen) | `kalender_heute` | **ungetestet** |
| E-Mail (macOS, nur Entwurf) | `mail_entwurf` | **ungetestet** |
| Browser | `adresse_oeffnen` | **ungetestet** |
| Programme (macOS) | `programm_oeffnen`, `programm_beenden`, `programme_auflisten` | **ungetestet** |
| Finder, Dateien oeffnen | `im_finder_zeigen`, `datei_oeffnen` | **ungetestet** |
| Systemzustand | `akku`, `mitteilung_zeigen` | **ungetestet** |
| Freigegebene Skripte | `skript_ausfuehren` | **ungetestet** |
| Seiten abrufen | `seite_lesen` | Aufbereitung getestet, echter Abruf nicht |
| Websuche | `web_suchen` | **fehlt: Schluessel** |

### Websuche aktivieren

Vorgesehen ist Brave Search (eigene Suchindex-API, kein Scraping, Freikontingent):

```bash
# Schluessel holen: https://brave.com/search/api/
security add-generic-password -s jarvis -a brave_api_key -w
```

Danach meldet `jarvis doctor` die Suche als einsatzbereit. Ohne Schluessel sagt
JARVIS, dass er nicht suchen kann -- er tut nicht so, als haette er gesucht.

### macOS-Automationsfreigabe

Beim ersten AppleScript-Aufruf fragt macOS, ob das Terminal (oder die App, die
JARVIS startet) die jeweilige App steuern darf. Wird das abgelehnt, meldet das
Werkzeug den Fehler `-1743` mit dem Hinweis auf
**Systemeinstellungen > Datenschutz & Sicherheit > Automation**.

## Fehlt

### E-Mail-Versand

Es gibt nur `mail_entwurf`: der Entwurf wird angelegt und geoeffnet, der letzte
Klick gehoert dem Menschen. Das ist Absicht und kein unfertiger Zustand --
eine verschickte Mail laesst sich nicht zurueckholen.

Soll JARVIS wirklich senden duerfen, braucht es:

* ein Werkzeug unter `Scope.EXTERNAL` (fragt dann bei **jedem** Versand nach),
* SMTP-Zugangsdaten im Schluesselbund (`security add-generic-password -s jarvis
  -a smtp_password -w`) oder ein weiteres AppleScript `send`,
* eine Entscheidung, ob Anhaenge erlaubt sind.

Empfehlung: beim Entwurf bleiben. Der Gewinn ist ein Klick, das Risiko eine
Mail an den falschen Empfaenger.

### WhatsApp Business

Technisch ueber die **WhatsApp Business Cloud API** (Meta) moeglich. Was dafuer
vorliegen muss -- nichts davon kann JARVIS sich selbst beschaffen:

1. Ein Meta-Business-Konto mit verifiziertem Unternehmen (Handelsregister­auszug,
   Adressnachweis -- bei der HERM Service Team e.K. vorhanden, aber die
   Verifizierung dauert).
2. Eine WhatsApp-Business-Telefonnummer, die **nicht** in der normalen
   WhatsApp-App registriert ist.
3. Eine App in der Meta-Entwicklerkonsole mit dauerhaftem Zugriffstoken.
4. Vorlagen (Message Templates), von Meta genehmigt: ausserhalb des
   24-Stunden-Fensters nach einer Kundennachricht darf **nur** eine genehmigte
   Vorlage verschickt werden. Freitext geht nicht.
5. Einen oeffentlich erreichbaren Webhook-Endpunkt fuer eingehende Nachrichten.
   Ein MacBook hinter einem Heimanschluss reicht dafuer nicht ohne Weiteres.

Zu beachten: Nachrichten ausserhalb des Fensters kosten pro Konversation, und
die Nutzungsbedingungen verbieten automatisiertes Massenversenden. Eine
Anbindung ist deshalb sinnvoll fuer **eingehende** Anfragen (lesen,
zusammenfassen, Antwort vorschlagen) -- nicht fuer automatisches Antworten.

Wenn die Punkte 1 bis 5 vorliegen: Werkzeug unter `Scope.EXTERNAL`, Token im
Schluesselbund unter `whatsapp_token`, und der Versand bleibt
bestaetigungspflichtig.

### Kalender schreiben

`kalender_heute` liest nur. Termine anlegen ginge ueber dasselbe AppleScript
(`make new event`), braucht aber eine Entscheidung: welcher Kalender, und was
passiert bei Ueberschneidungen. Ohne diese Festlegung legt JARVIS Termine am
falschen Ort an.

### Dokumentenverwaltung

Ueber die Dateiwerkzeuge bereits moeglich, solange die Ordner unter
`[permissions] roots` stehen. Eine eigene Anbindung (Nextcloud, iCloud Drive,
Dropbox) lohnt erst, wenn Dateien ausserhalb des lokalen Dateisystems liegen.

### Weitere KI-Modelle

Die Schnittstelle `LLM` in `jarvis/llm/client.py` beschreibt alles, was JARVIS
vom Modell braucht: `chat()` mit Streaming und Abbruch, `health()`. Eine
Anbindung an eine Cloud-API waere eine weitere Klasse mit diesen zwei Methoden.

Bewusst nicht gebaut: der Auftrag ist ein lokal orientierter Assistent. Eine
Cloud-Anbindung wuerde jede Aeusserung und jeden Dateiinhalt an einen Dritten
schicken -- das sollte eine ausdrueckliche Entscheidung sein, keine Vorgabe.

## Wie eine neue Integration angebunden wird

1. Werkzeugfunktion schreiben, die ein `ToolResult` zurueckgibt. Der
   `verification`-Text muss beschreiben, **wie** das Ergebnis geprueft wurde --
   ohne ihn kann keine Aufgabe damit abgeschlossen werden.
2. Richtige Stufe waehlen: `read`/`create`/`edit` fuer Lokales, `web` fuer
   Abrufe aus dem Netz, `external` fuer alles, was hinausgeht (fragt nach).
3. Zugangsdaten ueber `secrets.get("name")` holen, nie aus der Konfiguration.
4. Fehlt der Schluessel: das Werkzeug mit `unavailable_reason` anmelden. Dann
   wird es dem Modell nicht angeboten, und ein direkter Aufruf nennt den Grund.
5. In `tools/builtin.py` registrieren und in `doctor.py` eine Pruefung ergaenzen.
6. Test schreiben, der ohne Zugangsdaten durchlaeuft (siehe
   `tests/test_tools_web.py`).
