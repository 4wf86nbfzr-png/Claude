# Sicherheit

## Freigabemodell

Freigabepflichtig sind (`src/core/services/approval.ts`):

`send_email`, `send_email_batch`, `delete_file`, `overwrite_file`,
`install_application`, `change_system_setting`, `paid_action`, `modify_account`,
`publish_content`, `submit_form`, `message_external_person`.

Eine Freigabe hält drei Dinge gleichzeitig fest:

1. **Welche Aktion** – eine Freigabe für „Datei löschen“ taugt nicht zum Senden.
2. **Welchen Inhalt** – SHA-256 über Empfänger, Kopie, Blindkopie, Betreff,
   Text und Anhänge (`src/core/util/hash.ts`).
3. **Wie lange** – Standard 30 Minuten, danach verfällt sie.

Nach dem Einlösen steht sie auf `VERBRAUCHT`. Eine zweite Nachricht mit
derselben Freigabe ist damit ausgeschlossen.

Wer einen Entwurf ändert, ändert seine Prüfsumme. `updateDraft` setzt den Status
zurück auf `ENTWURF` und löst die Verbindung zur Freigabe. Der Weg
„freigeben lassen → Text austauschen → senden“ existiert nicht.

### Gesprochene Freigaben

`interpretApprovalUtterance` kennt drei Ausgänge: `FREIGEBEN`, `ABLEHNEN`,
`UNKLAR` – und im Zweifel immer `UNKLAR`, was zu einer Rückfrage führt.

- Eindeutig: „Senden“, „Freigeben“, „Mail abschicken“, „Ja, genau so senden“.
- Ein bloßes „Ja“ zählt nur, wenn JARVIS unmittelbar zuvor die Freigabe erfragt hat.
- Vorbehalte („aber“, „vorher“, „vielleicht“, „kürzer“) führen nie zum Versand.
- Verneinungen vor einem Sendewort schlagen alles andere.

Stehen mehrere Freigaben offen, wird nicht geraten, sondern nachgefragt.

---

## Zugangsdaten

- Nichts steht im Quelltext.
- Reihenfolge beim Lesen: Umgebungsvariable, dann verschlüsselter Tresor.
- In der Desktop-App verschlüsselt Electrons `safeStorage`, also der
  Schlüsselbund des Betriebssystems. Außerhalb (Setup, Skripte) AES-256-GCM mit
  einem aus `JARVIS_MASTER_KEY` abgeleiteten Schlüssel.
- Ist kein Tresor verfügbar, wird das Speichern **verweigert** statt still im
  Klartext abzulegen.
- Die Tresordatei bekommt Rechte `0600`.
- Nach außen – Oberfläche, Protokoll, Datenbank – geht nur, **ob** ein Wert
  vorliegt und woher, nie der Wert selbst (`CredentialService.describe()`).
- Für Gmail und Kalender wird OAuth bevorzugt. JARVIS bekommt „Mail senden“,
  „Mail lesen“ und „Kalender lesen“ – nie das Kontopasswort.

---

## Fenster und Prozesse

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Der Renderer erreicht ausschließlich die im Preload aufgeführten Kanäle.
  Was dort nicht steht, existiert für die Oberfläche nicht.
- Content-Security-Policy: nur eigene Quellen; kein Nachladen aus dem Netz.
- Berechtigungen: alles abgelehnt außer Mikrofon.
- Links nach außen öffnet der Standardbrowser; die App navigiert nicht weg.
- `webview` wird unterbunden.

---

## Zugriff auf den Rechner

- Datei-Werkzeuge arbeiten nur in freigegebenen Verzeichnissen: dem
  Datenverzeichnis von JARVIS sowie Dokumente, Downloads und Schreibtisch.
  Jeder Pfad wird vorher aufgelöst und geprüft; `..` führt aus nichts heraus.
- Programme werden ohne Shell gestartet und der Name gegen ein enges Muster
  geprüft – in einem Programmnamen lässt sich kein zweiter Befehl verstecken.
- Es gibt **keine** Maus- oder Tastatursimulation und keine Bildschirmauswertung.
  Was sich nicht über eine Schnittstelle erledigen lässt, sagt JARVIS.
- Anhänge sind auf Dokumente, Bilder und ZIP beschränkt; ausführbare Dateien
  werden abgelehnt.

---

## Recherche

- `robots.txt` wird ausgewertet und beachtet (abschaltbar, standardmäßig an).
- Je Host gilt eine Mindestpause, Antworten werden bei 2 MB abgeschnitten,
  Zeitüberschreitungen brechen sauber ab.
- Es werden nur `http`/`https` abgerufen und nur HTML oder Text ausgewertet.
- Verschleierte Adressen („info(at)firma.de“) werden gelesen – das ist eine
  bewusst veröffentlichte Angabe, kein umgangener Schutz.

---

## Versandgrenzen

| Grenze                            | Standard | Einstellung                        |
| --------------------------------- | -------- | ---------------------------------- |
| Nachrichten pro Tag               | 30       | `JARVIS_DAILY_SEND_LIMIT`          |
| Empfänger je Nachricht            | 3        | `JARVIS_MAX_RECIPIENTS_PER_MAIL`   |
| Mindestabstand zwischen Sendungen | 20 s     | `JARVIS_SEND_COOLDOWN_SECONDS`     |
| Gültigkeit einer Freigabe         | 30 min   | `JARVIS_APPROVAL_TTL_MINUTES`      |
| Testbetrieb                       | –        | `JARVIS_DRY_RUN`                   |

Zusätzlich hart im Versandpfad: Sperrliste, Pflicht zur verifizierten Adresse,
Hinweis auf frühere Kontakte, Prüfung auf eingerichteten Versandweg.

---

## Ehrlichkeit bei Fehlern

Meldet SMTP oder die API einen Fehler, wird die Nachricht als
`FEHLGESCHLAGEN` geführt, der Fehlertext gezeigt und im Protokoll abgelegt.
Es gibt keinen Pfad, auf dem daraus „Mail wurde versendet“ wird. Dasselbe gilt
für Recherche, Dateizugriffe und Sprachdienste. Im Testbetrieb sagt JARVIS
ausdrücklich, dass nichts hinausgegangen ist.

---

## Was bewusst nicht geht

- Versand ohne Freigabe – auf keinem Weg.
- Erfundene oder aus Namensschemata abgeleitete Empfängeradressen.
- Versteckter Massenversand, Rundmails an viele Empfänger.
- Umgehen von Spam-Filtern.
- Anschreiben von Adressen auf der Sperrliste.
- Stille Dauerspeicherung aller Gesprächsinhalte.
- Fernsteuerung durch Dritte: es gibt keine offenen Netzdienste; die einzige
  lauschende Stelle ist der kurzlebige Empfänger auf `127.0.0.1` während der
  Google-Anmeldung.
