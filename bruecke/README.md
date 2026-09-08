# Brücke — Schichtabgleich zwischen Einsatz und secplan.net

Der Abgleich der Vortagesschichten dauert im Büro jeden Morgen so lange, wie
Zeile für Zeile eben dauert. Diese Brücke nimmt den mechanischen Teil ab:
Sie holt nachts den Dienstplan, nimmt die Zeiten vom Einsatz entgegen, legt
beides nebeneinander und zeigt morgens **nur noch, was nicht zusammenpasst**.
Was passt, ist bereits abgehakt.

Es besteht aus zwei Teilen:

| Teil | Wo | Was |
|---|---|---|
| **Oberfläche** (`../intern/`) | im Browser | Abgleich fürs Büro, Schnellerfassung fürs Handy |
| **Brücke** (dieser Ordner) | Node auf einem Bürorechner | Dienstplan holen, Fotos lesen, Freigabe zurückschreiben, morgens Bescheid sagen |

Die Oberfläche funktioniert **auch ohne die Brücke** — dann werden Dateien von
Hand abgelegt und am Ende fällt eine CSV heraus. Die Brücke macht daraus einen
Ablauf ohne Handgriffe.

---

## In fünf Minuten starten

```bash
cd bruecke
cp konfig.beispiel.json konfig.json
npm install                 # optional, siehe „Was wofür gebraucht wird"
npm start
```

Im Fenster steht danach ein Link mit Schlüssel:

```
Abgleich:  http://127.0.0.1:8770/intern/abgleich.html?t=…
```

Diesen Link öffnen. Fertig. Der Schlüssel steht in `daten/token.txt` und wird
beim ersten Start erzeugt.

**Erster Test ohne secplan:** einen Dienstplan-Export als CSV in
`daten/eingang/` legen (Dateiname am besten `plan-2026-09-07.csv`).
Erwartet werden Spalten in dieser Art — die Schreibweise ist großzügig,
`Objekt`/`Einsatz`/`Veranstaltung` gelten gleichermaßen:

```
Datum;Mitarbeiter;Personalnummer;Objekt;von;bis;Pause;SchichtID
07.09.2026;Max Mustermann;1042;Halle 45 – Gala;18:00;02:00;30;S1
```

---

## Der Tag

```
   abends      Schichtleiter meldet die Zeiten
               ├─ Zeitliste geführt  → Foto/PDF/CSV ans Büro
               └─ keine Liste        → Link „Zeiten melden" am Handy
                                        (wie geplant / andere Zeit / nicht da)

   nachts      Morgenlauf: Dienstplan des Tages holen, Tagespaket ablegen

   07:00       Mail ans Büro: „34 Schichten stehen bereit" + Link

   morgens     Abgleich öffnen. Grün ist erledigt. Übrig bleiben:
               Abweichungen, fehlende Zeiten, unklare Namen.

   Freigabe    ein Knopf → zurück nach secplan, Protokoll geschrieben
```

Welcher Tag morgens abgeglichen wird, steht in `konfig.json` unter
`tagesversatz` (`-1` = gestern).

---

## Die beiden Oberflächen

### `intern/abgleich.html` — fürs Büro

* **01 Geplante Schichten** — kommen von der Brücke oder werden als CSV abgelegt.
* **02 Gelaufene Zeiten** — vier Wege:
  * Zeitliste als **Foto oder PDF** ablegen → wird gelesen (siehe *Zeitlisten scannen*)
  * **CSV/Text** ablegen oder einfügen (aus einer Mail kopiert, abgetippt)
  * **Schnellerfassung** des Schichtleiters — kommt von allein rein
  * **„Alles wie geplant"** — der häufigste Fall bei kleinen Einsätzen, ein Klick
* **03 Abgleich** — je Zeile ein Stand:

  | Stand | heißt | was zu tun ist |
  |---|---|---|
  | passt | innerhalb der Toleranz | nichts, ist bereits freigegeben |
  | Abweichung | Zeit weicht ab | ansehen, übernehmen oder korrigieren |
  | fehlt | geplant, keine Zeit gemeldet | „war da, wie geplant" oder „Ausfall" |
  | zusätzlich | Zeit ohne geplante Schicht | prüfen — Nachbesetzung? |
  | Name unklar | Name nicht zuzuordnen | Person auswählen (wird gemerkt) |
  | prüfen | Abweichung über vier Stunden | fast immer ein Lesefehler |

  Tastatur: `↑` `↓` wählen, `Enter` übernehmen, `P` wie geplant, `A` Ausfall,
  `Z` zurücknehmen. Mit sechzig Zeilen ist man so in zwei Minuten durch.
* **Freigabe** — überträgt die bestätigten Zeiten und schreibt ins Protokoll,
  wer freigegeben hat.

Namen, die einmal von Hand zugeordnet wurden („Mueller M." → Marek Musielak),
merkt sich die Oberfläche. Beim nächsten Mal sitzt die Zuordnung von allein.

### `intern/erfassung.html` — für den Einsatz

Für Veranstaltungen, bei denen keine Liste geführt wurde. Der Schichtleiter
bekommt den Link (Knopf **Link zur Schnellerfassung** im Abgleich), sieht die
geplante Crew und tippt pro Person: *war wie geplant da* / *andere Zeit* /
*nicht da*. Andere Zeiten werden in Viertelstunden gestellt, damit das am Handy
mit einem Daumen geht. Ohne Verbindung ins Büronetz fällt die Meldung als
fertige E-Mail heraus, statt verloren zu gehen.

---

## Morgens benachrichtigt werden

Der Morgenlauf steckt in der Brücke: läuft `npm start`, läuft er täglich zur
Uhrzeit aus `konfig.json` (`morgenlauf`, Standard `07:00`) von selbst — es
braucht keine zusätzliche Zeitsteuerung.

Mail einschalten in `konfig.json`:

```json
"mail": {
  "aktiv": true,
  "an": ["dispo@hermserviceteam.com"],
  "von": "bruecke@hermserviceteam.com",
  "smtp": { "host": "smtp.ihr-hoster.de", "port": 587, "secure": false,
            "auth": { "user": "bruecke@hermserviceteam.com", "pass": "…" } }
}
```

Dafür einmal `npm install nodemailer`. Alternativ oder zusätzlich `webhook` auf
eine Adresse setzen, die eine JSON-Nachricht entgegennimmt (Chat-Dienst).
Die Mail nennt **Zahlen und den Link**, keine Namensliste — wer die Namen sehen
will, öffnet den Abgleich im Büronetz.

Wer die Brücke lieber nicht dauerhaft laufen lässt, ruft den Lauf aus der
Zeitsteuerung des Betriebssystems auf:

```
0 7 * * 1-6   cd /pfad/zu/bruecke && /usr/bin/node morgenlauf.mjs
```

Zusätzlich kann die geöffnete Abgleich-Seite eine Browser-Meldung zeigen,
sobald ein neues Tagespaket bereitliegt (einmalig erlauben).

---

## Für alle im Team erreichbar machen

Standardmäßig hört die Brücke nur auf dem eigenen Rechner (`127.0.0.1`).
Sollen Kollegen von ihren Arbeitsplätzen zugreifen, in `konfig.json`:

```json
"host": "0.0.0.0"
```

Danach ist sie unter `http://<IP des Bürorechners>:8770/intern/abgleich.html?t=…`
erreichbar. Der Schlüssel aus `daten/token.txt` ist dabei Zugangsbedingung.

**Nur im Büronetz oder über VPN.** Nicht ins offene Internet stellen und nicht
per Portfreigabe im Router veröffentlichen: hier stehen Namen und Arbeitszeiten
von Mitarbeitern.

---

## Browser-Modus einrichten (der eigentliche Draht zu secplan)

secplan.net veröffentlicht keine Programmierschnittstelle. Die Brücke bedient
deshalb im Modus `"browser"` dieselbe Oberfläche, die auch ein Mensch bedient —
angemeldet mit einem eigenen Konto, damit im secplan-Protokoll erkennbar bleibt,
was automatisch passiert ist.

Weil niemand von außen weiß, wie die Seiten aufgebaut sind, stehen die
Zugriffspunkte als CSS-Selektoren in `konfig.json`. Das ist eine einmalige
Einrichtung von etwa zwanzig Minuten:

**1. Zugangsdaten hinterlegen**

```bash
cp .env.beispiel .env
chmod 600 .env
# SECPLAN_BENUTZER und SECPLAN_PASSWORT eintragen
```

**2. Playwright installieren und einmal anmelden**

```bash
npm install playwright && npx playwright install chromium
npm run anmeldung
```

Es öffnet sich ein Browserfenster. Dort die Anmeldung abschließen —
inklusive Zwei-Faktor-Abfrage, Cookie-Hinweis und Mandantenwahl — und im
Terminal Enter drücken. Die Sitzung landet in `daten/sitzung.json` und
ersetzt ab dann die tägliche Anmeldung.

**3. Selektoren ermitteln**

In secplan den Dienstplan eines Tages öffnen. Rechtsklick auf eine
Schichtzeile → *Untersuchen*. In den Entwicklerwerkzeugen mit Rechtsklick auf
das Element → *Copy* → *Copy selector*. Das ergibt einen Ausdruck wie
`tr.dienst-zeile` oder `td:nth-child(3)`. Diese Werte in `konfig.json`
eintragen:

| Eintrag | zeigt auf |
|---|---|
| `planAdresse` | Adresse des Tagesplans, `{datum}` als Platzhalter (`…/plan?tag={datum}`) |
| `planZeile` | eine Schichtzeile im Plan (der wiederkehrende Container) |
| `spalteName`, `spalteBeginn`, `spalteEnde`, `spaltePause`, `spalteEinsatz` | Zellen **innerhalb** einer Zeile |
| `spalteId`, `spalteNummer` | Schichtnummer und Personalnummer, falls vorhanden |
| `schichtAdresse` | Adresse einer einzelnen Schicht, `{id}` als Platzhalter |
| `feldBeginn`, `feldEnde`, `feldPause` | die Eingabefelder in der Schichtmaske |
| `speichern` | der Speichern-Knopf |
| `gespeichertErkennenAn` | etwas, das nach dem Speichern erscheint (Meldung, Haken) |
| `benutzerfeld`, `passwortfeld`, `anmeldeknopf`, `angemeldetErkennenAn` | die Anmeldemaske |

Für Lesen genügen `planZeile`, `spalteName`, `spalteBeginn`, `spalteEnde` —
Schreiben braucht zusätzlich `feldBeginn`, `feldEnde`, `speichern`.
Fehlt etwas, sagt die Brücke beim Versuch, welcher Eintrag es ist, und der
Datei-Modus läuft unverändert weiter.

**4. Erst im Probelauf**

```json
"modus": "browser",
"probelauf": true
```

Der Probelauf liest den Plan, rechnet alles durch und schreibt das Ergebnis
nach `daten/ausgang/` — ohne in secplan etwas zu ändern. Ein, zwei Tage so
mitlaufen lassen und die Datei gegen die Wirklichkeit halten. Stimmt sie,
`"probelauf": false` setzen. Ab dann trägt die Freigabe direkt ein.

> **Ehrlich gesagt:** Diesen Teil konnte niemand gegen das echte secplan-Konto
> prüfen — dafür braucht es Zugang. Der Weg funktioniert (Anmeldung, Sitzung,
> Lesen, Schreiben, Protokoll), aber die Selektoren muss beim ersten Mal jemand
> mit Zugang eintragen. Bis dahin ist der Datei-Modus kein Notbehelf, sondern
> der normale Betrieb: Export rein, fertige Datei raus.

---

## Zeitlisten scannen

* **PDF mit Textebene** → wird direkt gelesen, wenn `pdftotext` vorhanden ist
  (Paket `poppler-utils`; unter Windows Teil der Poppler-Binaries).
* **Foto oder eingescanntes PDF** → Texterkennung mit `tesseract.js`
  (`npm install tesseract.js`).

Die Sprachdaten holt tesseract beim ersten Mal aus dem Netz und legt sie in
`daten/tessdata/` ab. Rechner ohne Netzzugang: `deu.traineddata` einmal von
Hand herunterladen, dorthin legen und eintragen:

```json
"ocr": { "datenPfad": "daten/tessdata", "gepackt": false }
```

**Fototipps, die den Unterschied machen:** Blatt ganz im Bild, von oben, gutes
Licht, keine Schatten der eigenen Hand. Ein 2000 Pixel breites Foto einer
gedruckten Liste wird zuverlässig gelesen; ein schräges Handyfoto im Halbdunkel
nicht.

**Handschrift bleibt unsicher.** Deshalb ist das Ergebnis ausdrücklich ein
Vorschlag: die Oberfläche zeigt das Originalfoto neben der Tabelle, jede Zeile
will bestätigt werden, und Zeilen ohne zwei erkennbare Uhrzeiten werden gar
nicht erst übernommen, sondern als übergangen gemeldet.

---

## Wie gerechnet wird

Einstellbar oben rechts im Abgleich unter *Regeln* (gilt dauerhaft):

* **Toleranz** (Standard 10 min) — bis hierhin gilt die Schicht als planmäßig
  und der Plan bleibt stehen. Ohne das würde jeder Tag hunderte
  Drei-Minuten-Korrekturen erzeugen.
* **Rundungsraster** (Standard 15 min) und **Richtung**: kaufmännisch, zugunsten
  Mitarbeiter (Beginn ab, Ende auf) oder zugunsten Firma. Was gilt, steht im
  Rahmenvertrag — deshalb eine Einstellung und keine feste Regel.
* **Pause** — fehlende Pausen nach § 4 ArbZG ergänzen (>6 h: 30 min, >9 h: 45 min).
  Standard aus: was Pause war, steht auf der Liste.

Verglichen wird immer mit der **echten** gemeldeten Zeit, gerundet wird erst
beim Übernehmen — sonst würden aus fünf Minuten Überzug fünfzehn.
Schichten über Mitternacht sind durchgehend berücksichtigt: 00:15 gegen 23:55
sind zwanzig Minuten, nicht dreiundzwanzig Stunden.

---

## Sicherheit und Datenschutz

* Alles läuft auf dem Bürorechner. Es gehen keine Namen, Zeiten oder Fotos an
  Dritte — kein Cloud-Dienst, keine fremde Erkennungs-API.
* `.env` (Zugangsdaten), `konfig.json`, `daten/` und `node_modules/` sind in
  `.gitignore` und gehören nicht ins Repository.
* Zugriff auf die Brücke nur mit dem Schlüssel aus `daten/token.txt`.
  Der Dienst liefert `bruecke/`, `.git/` und jede `.env` grundsätzlich nicht aus.
* Tagespakete werden nach `aufbewahrungTage` (Standard 400) gelöscht — lang
  genug für Rückfragen zur Lohnabrechnung, nicht länger.
* Das Protokoll (`daten/protokoll-JJJJ-MM.jsonl`) hält fest, wer wann was
  freigegeben hat. Bei Streit über eine Stunde ist das die Antwort.
* Für den Browser-Modus ein **eigenes secplan-Konto** anlegen, nicht das
  persönliche eines Kollegen.

---

## Was das Ganze nicht kann

* **Neue Schichten in secplan anlegen.** Zeiten ohne geplante Schicht
  („zusätzlich") werden gemeldet und in die Ausgabedatei geschrieben, aber
  nicht selbst eingetragen — eine Nachbesetzung ist eine Entscheidung, keine
  Rechenoperation.
* **Handschrift sicher lesen.** Siehe oben.
* **Entscheiden, ob jemand da war.** Fehlt eine Meldung, fragt das Werkzeug —
  es rät nicht.

---

## Fehlersuche

| Symptom | meistens |
|---|---|
| „ohne Brücke" im Kopf der Seite | Dienst läuft nicht (`npm start`) oder falscher Schlüssel im Link |
| „Auf Port 8770 läuft bereits eine Brücke" | zweites Fenster offen — das erste benutzen |
| Für den Tag liegt kein Tagespaket vor | keine Datei in `daten/eingang/`, oder im Browser-Modus stimmt `planAdresse` nicht |
| Texterkennung „nicht hochgekommen" | `npm install tesseract.js`, oder Sprachdaten fehlen (siehe *Zeitlisten scannen*) |
| Übertragung scheitert | Sitzung abgelaufen → `npm run anmeldung`. Die Freigabe ist nicht verloren: **Als CSV sichern** und `node uebertragen.mjs <datei>` |
| Namen werden falsch zugeordnet | einmal von Hand richtig zuordnen — die Zuordnung wird gemerkt |

Prüfen, ob die Rechenlogik stimmt:

```bash
npm test
```

## Was wofür gebraucht wird

| Paket | wofür | ohne das |
|---|---|---|
| — | Abgleich, Datei-Modus, Morgenlauf, Schnellerfassung | läuft alles |
| `nodemailer` | Mail am Morgen | Meldung erscheint nur im Fenster |
| `tesseract.js` | Fotos und gescannte PDF lesen | Foto dient als Vorlage zum Abtippen |
| `playwright` | Browser-Modus zu secplan | Datei-Modus über `daten/eingang` und `daten/ausgang` |
| `pdftotext` (System) | PDF mit Textebene | fällt auf Texterkennung zurück |

`npm install` holt alle drei; einzeln geht auch.
