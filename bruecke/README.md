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

**Ohne alles loslegen:** In secplan die Liste der offenen Abgleiche als
**PDF** ausgeben und im Abgleich unter *01* ablegen — mehr braucht es nicht.
Das PDF wird direkt gelesen, mit Personalnummer, Planung, Funktion und Datum.
Enthält es mehrere Wochen (der Normalfall), erscheint darunter eine Leiste mit
allen Tagen; verglichen wird der gewählte.

Alternativ ein CSV-Export in `daten/eingang/` (Dateiname am besten
`plan-2026-09-07.csv`). Die Schreibweise ist großzügig, `Objekt`/`Einsatz`/
`Veranstaltung` gelten gleichermaßen:

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

   Freigabe    ein Knopf → die Brücke meldet sich bei secplan an, trägt die
               Zeiten ein, liest nach und drückt „Abgleichen". Protokoll läuft mit.
```

Welcher Tag morgens abgeglichen wird, steht in `konfig.json` unter
`tagesversatz` (`-1` = gestern).

---

## Die beiden Oberflächen

### `intern/abgleich.html` — fürs Büro

* **01 Geplante Schichten** — die **Abgleichliste aus secplan als PDF**, ein
  CSV-Export, oder von der Brücke. Umfasst die Liste mehrere Tage, steht
  darunter eine Tagesleiste.
* **02 Gelaufene Zeiten** — vier Wege:
  * **Foto des Stundenzettels** ablegen → liegt groß daneben als Vorlage,
    automatisch gedreht (siehe *Der Stundenzettel*)
  * **CSV/Text/PDF** ablegen oder einfügen (aus einer Mail kopiert, abgetippt)
  * **Schnellerfassung** des Schichtleiters — kommt von allein rein
  * **„Alles wie geplant"** — der häufigste Fall, ein Klick: danach stehen alle
    geplanten Zeiten fertig da und nur die Abweichungen werden getippt
* **03 Abgleich** — je Zeile ein Stand:

  | Stand | heißt | was zu tun ist |
  |---|---|---|
  | passt | innerhalb der Toleranz | nichts, ist bereits freigegeben |
  | Abweichung | Zeit weicht ab | ansehen, übernehmen oder korrigieren |
  | fehlt | geplant, keine Zeit gemeldet | „war da, wie geplant" oder „Ausfall" |
  | zusätzlich | Zeit ohne geplante Schicht | prüfen — Nachbesetzung? |
  | Ausfall | jemand war nicht da | nichts, Grund steht im Protokoll |
  | Name unklar | Name nicht zuzuordnen | Person auswählen (wird gemerkt) |
  | prüfen | Abweichung über vier Stunden | fast immer ein Lesefehler |

  Tastatur: `↑` `↓` wählen, `Enter` übernehmen, `P` wie geplant, `A` Ausfall,
  `Z` zurücknehmen. Mit sechzig Zeilen ist man so in zwei Minuten durch.
* **Konflikte** — stehen über der Tabelle und beantworten eine andere Frage
  als der Abgleich: nicht „passen Plan und Zettel zusammen", sondern „ist das
  Ergebnis in Ordnung". Geprüft werden Überschneidungen, Höchstarbeitszeit
  (§ 3 ArbZG), Ruhezeit über Tagesgrenzen hinweg (§ 5), Pausen (§ 4), doppelt
  eingelesene Zettel und schlicht Unplausibles. Ein Klick springt zur Zeile.
  Steht in den Daten gar keine Pause — die Abgleichliste führt keine
  Pausenspalte —, sagt das Werkzeug das einmal, statt jede Schicht anzumahnen.
* **Massenbestätigung** — „Alle sichtbaren übernehmen" für die aktuelle Ansicht,
  und „Abweichungen bis ± n min übernehmen" für den Alltag: fünf Minuten
  Überzug will niemand einzeln bestätigen. Zeilen mit einem dringenden Konflikt
  bleiben dabei außen vor.
* **Diktat** — siehe *Zeiten sagen statt tippen*.
* **Protokoll** — unten aufklappbar: wer wann was freigegeben hat, und jede
  einzelne Änderung in secplan mit alter und neuer Zeit.
* **Ergebnisdatei** — das, was am Ende zählt: eine CSV, die man neben secplan
  legt und abarbeitet. Erste Spalte **Änderung**, sortiert nach dem, was zu tun
  ist; dann Name (in der secplan-Schreibweise `Nachname, Vorname`),
  Personalnummer, Planung, geplante Zeit, **neue Zeit**, Pause, Stunden,
  Differenz und ein Hinweis. Wer nur nachträgt, braucht nichts weiter.
* **Freigabe** — überträgt die bestätigten Zeiten und schreibt ins Protokoll,
  wer freigegeben hat. Ohne Browser-Modus ist die Ergebnisdatei der Weg.

Namen, die einmal von Hand zugeordnet wurden („Mueller M." → Marek Musielak),
merkt sich die Oberfläche. Beim nächsten Mal sitzt die Zuordnung von allein.
secplan schreibt `Nachname, Vorname (Nummer)`, der Zettel `Vorname Nachname` —
das gleicht die Zuordnung selbst aus, ebenso Kürzel und Tippfehler.

**Eine Schicht in zwei Zeilen.** Auf dem Stundenzettel steht eine Schicht oft
getrennt nach Format (`10:30–19:00 KS`, dann `19:00–21:30 ML`), in secplan ist
das eine Schicht von 10:30 bis 21:30. Solche Zeilen werden wieder zusammengelegt
— aber nur so weit, wie der Dienstplan es hergibt: sind für den Tag zwei
Schichten geplant, bleiben es zwei. Eine Lücke dazwischen (bis 2 h, einstellbar)
zählt als Pause. In der Ergebnisdatei steht im Hinweis, wie der Zettel es
aufgeteilt hatte.

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

## Erst einmal ausprobieren

```bash
npm run vorfuehrung
```

Startet ein **secplan-Doppel** (eine nachgebaute Planungsanwendung), die Brücke
darauf gerichtet, und legt die Beispieldateien bereit. Damit lässt sich die
ganze Kette durchspielen — Abgleichliste laden, Zeiten einlesen, freigeben —
und die Zeiten landen wirklich im Tagesplan. Nur eben nicht im echten secplan.
Im Terminal steht Schritt für Schritt, was zu klicken ist.

Zum Üben, zum Vorführen, und als Probe nach jeder Änderung. Alles Erzeugte
liegt in `daten-vorfuehrung/` und kann gelöscht werden; die echte Konfiguration
wird nicht angefasst, die echte Brücke darf nebenher weiterlaufen.

Die Beispieldateien liegen in `beispiel/` und enthalten erfundene Namen:

| Datei | was sie zeigt |
|---|---|
| `abgleichliste-beispiel.pdf` | wie der Export aus secplan: 8 Schichten, zwei Tage, Namen über mehrere Zeilen umgebrochen |
| `stundenzettel-beispiel.csv` | wie ein Zettel vom Einsatz: eine Schicht in zwei Zeilen (KS/ML), ein Kürzel statt des vollen Namens, eine Verlängerung, jemand ohne Meldung, jemand ohne Plan |

Neu erzeugen: `npm run beispiele`.

## Läuft hier alles?

```bash
npm run pruefen
```

Geht der Reihe nach durch, was für den täglichen Betrieb gebraucht wird —
Konfiguration, Schlüssel, Brücke, Playwright samt Browser, Texterkennung,
Morgenmail, Beispieldateien — und prüft im Browser-Modus die Anmeldung bei
secplan und ob der Tagesplan lesbar ist. Bei jedem Punkt steht, was zu tun ist,
wenn er fehlt. Geändert wird nichts.

## Weitergeben an Kolleginnen und Kollegen

Zwei Wege, je nachdem wie viel jemand braucht.

### Weg 1 — die eine Datei (am einfachsten)

```bash
npm run bauen
```

Baut **`Schichtabgleich.html`** im Projektordner: eine einzige Datei, rund
440 KB, alles darin — Schriften, Gestaltung, Programm. Die lässt sich per Mail
verschicken, auf einen Stick legen oder ins Laufwerk stellen. Wer sie
doppelklickt, hat das Werkzeug. Ohne Installation, ohne Server, ohne Internet.

Vollständig darin: Abgleichliste (PDF) lesen, Stundenzettel einlesen, Namen
zuordnen, abgleichen, Konflikte, Diktat (getippt), Ergebnisdatei.
Eine laufende Brücke brauchen nur: das Eintragen in secplan, Fotos scannen,
Morgenmail, Protokoll und die Schnellerfassung.

Findet die Datei eine Brücke im Netz, benutzt sie sie automatisch. Sonst steht
oben ein Knopf **Brücke im Büronetz suchen** — dort Adresse und Schlüssel des
Bürorechners eintragen, danach merkt sich der Browser beides.

Nach jeder Änderung am Werkzeug neu bauen und die Datei erneut verteilen —
sonst arbeitet jemand mit einem alten Stand.

### Weg 2 — alle auf derselben Brücke

Auf einem Bürorechner läuft `npm start`, in `konfig.json` steht
`"host": "0.0.0.0"`. Dann bekommt jeder den Link aus dem Terminal (mit `?t=…`)
und arbeitet auf demselben Stand: dasselbe Protokoll, dieselben gemerkten
Namenszuordnungen, und die Freigabe trägt direkt in secplan ein.

Nur im Büronetz oder über VPN — hier stehen Namen und Arbeitszeiten.

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

## Die Zeiten selbst in secplan eintragen

Das ist der Teil, der die Arbeit wirklich abnimmt: Sie geben frei, die Brücke
meldet sich mit Ihrem Zugang bei secplan an, sucht jede Schicht im Tagesplan,
trägt die endgültige Zeit ein, speichert, **liest nach, ob es angekommen ist**,
und drückt anschließend „Abgleichen".

secplan.net hat keine offene Schnittstelle. Die Brücke bedient deshalb dieselbe
Oberfläche wie ein Mensch — aber sie sucht über den **Inhalt**, nicht über den
Aufbau der Seite: die Zeile an Name und Personalnummer, die Zeitfelder an den
geplanten Zeiten, die dort stehen. Deshalb ist keine Liste von CSS-Selektoren zu
pflegen, und ein Update von secplan legt sie nicht sofort lahm.

### Einrichten (einmalig, ein paar Minuten)

```bash
cd bruecke
cp .env.beispiel .env && chmod 600 .env     # SECPLAN_BENUTZER / SECPLAN_PASSWORT eintragen
npm install playwright && npx playwright install chromium
npm run einrichten
```

Es öffnet sich ein Browserfenster. Dort anmelden — auch mit Zwei-Faktor,
Cookie-Hinweis und Mandantenwahl —, **den Tagesplan eines Tages öffnen, an dem
Schichten stehen**, und im Terminal Enter drücken. Den Rest macht die
Einrichtung:

* Sie merkt sich die Adresse des Tagesplans und setzt das Datum als Platzhalter
  (`…/plan?tag={datum}`).
* Sie prüft nach, ob unter dieser Adresse Schichtzeilen zu erkennen sind, und
  zeigt die ersten davon an.
* Sie speichert die Sitzung — die ersetzt ab dann die tägliche Anmeldung.
* Sie schreibt `konfig.json`: `modus: browser`, `probelauf: true`.

Zugangsdaten stehen in `.env`, nie im Browser und nie in der Oberfläche. Legen
Sie dafür am besten ein **eigenes secplan-Konto „Brücke"** an — dann steht im
secplan-Protokoll, was automatisch passiert ist.

### Erst Probelauf, dann scharf

`probelauf: true` heißt: alles läuft durch, aber in secplan wird nichts
geändert. Was passiert wäre, steht im Bericht und in `daten/ausgang/`. Ein, zwei
Tage so mitlaufen lassen; stimmt es, in `konfig.json` `"probelauf": false`
setzen. Ab dann trägt die Freigabe direkt ein.

### Was dabei geschützt ist

| | |
|---|---|
| **Nur Änderungen** | Planmäßige Schichten werden nicht angefasst (`nurAenderungen`) |
| **Eindeutigkeit** | Wird die Zeile im Tagesplan nicht eindeutig gefunden, wird sie übersprungen und gemeldet — nie geraten |
| **Nachlesen** | Nach dem Speichern werden die Felder zurückgelesen; stimmen sie nicht, zählt die Schicht als nicht übertragen |
| **Notbremse** | Nach drei Fehlern hintereinander bricht der Lauf ab (`abbruchNachFehlern`) |
| **Beweis** | Von jedem Fehler liegt ein Bildschirmfoto in `daten/bilder/` |
| **Obergrenze** | `hoechstensProLauf` (Standard 250) |
| **Protokoll** | Wer, wann, was — in `daten/protokoll-JJJJ-MM.jsonl` |

Nach der Übertragung zeigt die Oberfläche **Zeile für Zeile**, was passiert ist:
eingetragen und nachgeprüft, oder nicht — mit Grund und Pfad zum Bildschirmfoto.

### Wenn es klemmt

Meist ist es eines von dreien: die Sitzung ist abgelaufen (`npm run anmeldung`),
die Adresse des Tagesplans stimmt nicht mehr (`npm run einrichten`), oder Name
bzw. geplante Zeit weichen zwischen Abgleichliste und Tagesplan ab — dann sagt
der Bericht genau das.

Für den Fall, dass secplan ungewöhnlich gebaut ist, lassen sich einzelne Felder
in `konfig.json` unter `secplan.selektoren` doch vorgeben (`feldBeginn`,
`feldEnde`, `feldPause`, `benutzerfeld`, `passwortfeld`, `anmeldeknopf`). Was
dort steht, gewinnt; alles Übrige findet die Brücke weiter selbst.

**Selbst geprüft:** Der ganze Ablauf — Anmeldung, Tagesplan, Zeile finden,
Zeiten setzen, speichern, nachlesen, „Abgleichen" — ist gegen eine nachgebaute
Planungsanwendung getestet (`test/scheinplan.mjs`, absichtlich mit
nichtssagenden Klassennamen und anderen Feldnamen, als man raten würde). Gegen
das echte secplan.net konnte hier niemand testen; dafür braucht es Ihren Zugang.
Genau dafür ist der Probelauf da.

## Zeiten sagen statt tippen

Der Zettel liegt links, die Maus rechts, dazwischen sitzt jemand, der vorlesen
könnte. Der Knopf **Diktat** (oder Taste `D`) öffnet eine Befehlszeile:

```
Kanopka von acht Uhr dreißig bis siebzehn Uhr fünfzehn
Fett Ende achtzehn Uhr fünfundvierzig
Botis Ausfall
Schmedding wie geplant
Pause dreißig Minuten für Mustermann
```

Verstanden werden Zahlwörter („fünfundvierzig"), „halb acht", Ziffern und
gemischte Formen. Der Name wird gegen den Plan geprüft — wer nicht eindeutig
erkannt wird, führt zu einer Rückfrage statt zu einer Buchung.

**Dieselbe Zeile lässt sich tippen.** Das ist kein Notbehelf, sondern der
Normalfall: das Mikrofon füllt nur dasselbe Feld. Wer schneller tippt als
spricht, tippt.

**Zum Mikrofon:** Der Browser schickt die Aufnahme zur Erkennung an seinen
Anbieter — bei Chrome an Google. Gesprochen werden dabei Namen von Mitarbeitern
und ihre Arbeitszeiten. Deshalb fragt das Werkzeug einmal ausdrücklich, bevor es
das Mikrofon einschaltet, und lässt es sonst aus. Wer das nicht will, tippt die
Zeile — es geht alles genauso. (Eine Erkennung, die auf dem eigenen Rechner
läuft, wäre der sauberere Weg; sie ist hier nicht eingebaut.)

## Der Stundenzettel

Ein Foto des handschriftlichen Zettels wird **nicht** in Zeiten übersetzt, und
das ist Absicht. Nachgemessen an einem echten Zettel: Tesseract bringt aus der
Handschrift Bruchstücke, mehr nicht — mal eine Uhrzeit, meist gar nichts. So zu
tun, als ginge das, wäre schlimmer als es zu lassen: falsch erkannte Zeiten
wandern sonst ungeprüft in die Abrechnung, und niemand merkt es.

Der Weg, der wirklich Zeit spart, ist ein anderer:

1. Foto ablegen. Es erscheint **groß über der Tabelle**, hochformatige Bilder
   werden automatisch gedreht (das Blatt liegt quer, das Handy fotografiert
   hochkant), drehbar und zoombar, wegklappbar.
2. **„Alles wie geplant"** drücken. Jetzt steht jede geplante Person mit ihren
   Zeiten fertig in der Tabelle.
3. Nur die Abweichungen vom Zettel tippen — Tab ins Feld, Zeit eintragen, weiter.
   Wer nicht da war, bekommt **Ausfall**.

Aus fünfzehn Minuten Abtippen werden so ein bis zwei Minuten, ohne dass irgendwo
geraten wird.

**Gelesen wird trotzdem**, und zwar da, wo es zuverlässig klappt:

* **PDF mit Textebene** → direkt, ohne Zusatzsoftware. Das gilt für die
  Abgleichliste aus secplan ebenso wie für Zeitlisten aus Excel oder einem
  Kassensystem.
* **Getippte oder gedruckte Listen als Foto** → Texterkennung
  (`npm install tesseract.js`); nachgemessen an einer gedruckten Liste: alle
  Zeilen mit Name, Zeiten und Pause korrekt.
* **Handschrift** → siehe oben.

Erkannte Zeilen sind immer nur ein Vorschlag: das Original liegt daneben, jede
Zeile will bestätigt werden, und Zeilen ohne zwei erkennbare Uhrzeiten werden
gar nicht erst übernommen.

Die Sprachdaten holt tesseract beim ersten Mal aus dem Netz und legt sie in
`daten/tessdata/` ab. Rechner ohne Netzzugang: `deu.traineddata` einmal von
Hand herunterladen, dorthin legen und eintragen:

```json
"ocr": { "datenPfad": "daten/tessdata", "gepackt": false }
```

Für PDF mit Textebene wird nichts installiert — das kann die Brücke selbst
(und die Oberfläche im Browser auch, dafür muss nicht einmal die Brücke laufen).
Für gescannte PDF hilft zusätzlich `pdftotext` (Paket `poppler-utils`).

## Wie gerechnet wird

Einstellbar oben rechts im Abgleich unter *Regeln* (gilt dauerhaft):

* **Toleranz** (Standard 10 min) — bis hierhin gilt die Schicht als planmäßig
  und der Plan bleibt stehen. Ohne das würde jeder Tag hunderte
  Drei-Minuten-Korrekturen erzeugen.
* **Rundungsraster** (Standard 15 min) und **Richtung**: kaufmännisch, zugunsten
  Mitarbeiter (Beginn ab, Ende auf) oder zugunsten Firma. Was gilt, steht im
  Rahmenvertrag — deshalb eine Einstellung und keine feste Regel.
* **Pause** — fehlende Pausen nach § 4 ArbZG ergänzen (>6 h: 30 min, >9 h: 45 min).
  Standard aus: was Pause war, steht auf der Liste. Weicht die Pause um mehr als
  die Toleranz vom Plan ab, ist das eine Abweichung — auch wenn Kommen und Gehen
  stimmen, sind es sonst am Ende Stunden zu viel.

Verglichen wird immer mit der **echten** gemeldeten Zeit, gerundet wird erst
beim Übernehmen — sonst würden aus fünf Minuten Überzug fünfzehn.
Schichten über Mitternacht sind durchgehend berücksichtigt: 00:15 gegen 23:55
sind zwanzig Minuten, nicht dreiundzwanzig Stunden.

---

## Die Ergebnisdatei an secplan anpassen

secplan kann CSV importieren. Welche Spalten die eigene Installation dabei
erwartet, weiß nur sie — deshalb ist die Spaltenfolge eine Einstellung. In
`konfig.json`:

```json
"export": {
  "trenner": ";",
  "nurAenderungen": false,
  "spalten": [
    ["Personalnummer", "personalnummer"],
    ["Datum",          "datum"],
    ["Von",            "neu_von"],
    ["Bis",            "neu_bis"],
    ["Pause",          "pause"],
    ["Stunden",        "stunden_punkt"]
  ]
}
```

Links steht die Überschrift, wie secplan sie erwartet, rechts das Feld. Zur
Auswahl stehen: `aenderung`, `datum`, `datum_iso`, `mitarbeiter` (Nachname,
Vorname), `vorname_nachname`, `personalnummer`, `planung`, `funktion`,
`soll_von`, `soll_bis`, `soll_pause`, `neu_von`, `neu_bis`, `pause`, `stunden`
(mit Komma), `stunden_punkt`, `minuten`, `differenz`, `format`, `status`,
`notiz`, `hinweis`. Leer gelassen, kommt die Standardfolge — die ist für
Menschen gemacht, nicht für einen Import.

## Gibt es eine richtige Schnittstelle?

Kurz: keine öffentlich dokumentierte. Recherchiert wurde in den Produkt- und
Partnerinformationen zu SecPlan NET; genannt werden **CSV-Import** für Stamm-
und Einsatzdaten sowie **Export der Lohnabrechnung in gängige Buchhaltungs-
programme**, aber keine REST- oder Webservice-Schnittstelle. Deshalb setzt
dieses Werkzeug auf genau die zwei Wege, die es tatsächlich gibt: die
Weboberfläche (automatisiert bedient) und CSV.

Erfunden wird hier nichts. Damit es dabei nicht bleiben muss, schreibt
`npm run einrichten` nebenbei mit, welche **JSON-Aufrufe secplan intern selbst
macht** — fast jede Weboberfläche spricht so mit ihrem Server. Das Ergebnis
landet in `daten/schnittstellen.json`, und zwar nur Methode, Adresse (ohne die
Werte) und die *Namen* der Felder; keine Inhalte, keine Personendaten. Steht
dort etwas Brauchbares, ist das der Ansatzpunkt für einen direkten Draht —
damit lässt sich beim secplan-Support konkret nachfragen, statt allgemein nach
„einer API".

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
* Für das automatische Eintragen ein **eigenes secplan-Konto „Brücke"** anlegen,
  nicht das persönliche eines Kollegen — dann steht im secplan-Protokoll, was
  automatisch passiert ist.
* Das Passwort steht ausschließlich in `bruecke/.env` auf dem Bürorechner. Es
  geht nie an den Browser, nie in die Oberfläche und nie über das Netz.

---

## Was das Ganze nicht kann

* **Neue Schichten in secplan anlegen.** Zeiten ohne geplante Schicht
  („zusätzlich") werden gemeldet und in die Ergebnisdatei geschrieben, aber
  nicht selbst eingetragen — eine Nachbesetzung ist eine Entscheidung, keine
  Rechenoperation.
* **Handschrift lesen.** Siehe *Der Stundenzettel*.
* **Ausfälle in secplan austragen.** Ein Ausfall steht im Bericht, im Protokoll
  und in der Ergebnisdatei — eingetragen wird er nicht. Eine Schicht zu löschen
  oder umzubuchen ist eine Entscheidung mit Folgen für Abrechnung und Kunde;
  das gehört in die Hand eines Menschen.
* **Gescannte Abgleichlisten lesen.** Die Liste muss aus secplan als PDF
  gespeichert sein, nicht ausgedruckt und wieder eingescannt.
* **Raten, wenn etwas nicht zusammenpasst.** Findet die Brücke eine Schicht im
  Tagesplan nicht eindeutig, lässt sie die Finger davon und sagt es.
* **Entscheiden, ob jemand da war.** Fehlt eine Meldung, fragt das Werkzeug —
  es rät nicht.

---

## Fehlersuche

| Symptom | meistens |
|---|---|
| „ohne Brücke" im Kopf der Seite | Dienst läuft nicht (`npm start`) oder falscher Schlüssel im Link |
| „Auf Port 8770 läuft bereits eine Brücke" | zweites Fenster offen — das erste benutzen |
| Für den Tag liegt kein Tagespaket vor | keine Datei in `daten/eingang/`, oder im Browser-Modus stimmt `planAdresse` nicht |
| Texterkennung „nicht hochgekommen" | `npm install tesseract.js`, oder Sprachdaten fehlen (siehe *Der Stundenzettel*) |
| „In diesem PDF steht kein Text" | die Abgleichliste wurde eingescannt statt aus secplan als PDF gespeichert |
| Zettel steht auf dem Kopf | zweimal auf ↷ im Zettelbalken |
| Übertragung scheitert | Sitzung abgelaufen → `npm run anmeldung`. Die Freigabe ist nicht verloren: **Ergebnisdatei** sichern und `node uebertragen.mjs <datei>` |
| „im Tagesplan nicht gefunden" | Name oder geplante Zeit weichen zwischen Abgleichliste und Tagesplan ab — Bildschirmfoto in `daten/bilder/` ansehen |
| „Zeitfelder nicht gefunden" | die Schichtmaske sieht anders aus als erwartet; `feldBeginn`/`feldEnde` in `konfig.json` setzen |
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
| — | Abgleichliste als PDF lesen | läuft ohne alles, auch im Browser |
| `tesseract.js` | getippte Listen als Foto lesen | Foto dient als Vorlage zum Abtippen |
| `playwright` | Zeiten selbst in secplan eintragen | Ergebnisdatei zum Nacharbeiten von Hand |
| `pdftotext` (System) | PDF mit Textebene | fällt auf Texterkennung zurück |

`npm install` holt alle drei; einzeln geht auch.
