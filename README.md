# HERM Service Team — Website

Statische Website (HTML/CSS/JS, kein Framework, kein Build-Schritt).
Stand: **interne Testfassung**. Sie ist technisch startklar, aber bewusst noch
gegen Suchmaschinen gesperrt und darf nicht auf die Live-Domain.

---

## Schnellstart

```bash
python3 -m http.server 8000     # oder: npx serve
# → http://localhost:8000
```

Ein Build ist nicht nötig. Was im Ordner liegt, ist die Website.

---

## Aufbau

```
index.html              Startseite: Hero, Einstieg, Film, Ablauf,
                        Referenzen, Anspruch, Anfrage
dienstleistungen.html   die sechs Bereiche als Kamerafahrt (Buehnen).
                        Erreichbar ueber den Menuepunkt „Dienstleistungen",
                        der einen Balken mit allen sechs aufklappt.
referenzen.html         Kundenstimmen (eigene Seite, kein Sprungziel)
kontakt.html            Anfrageformular
jobs.html               Stellen, FAQ, Bewerbungsformular
team.html               Büroteam
galerie.html            Bildergalerie mit Lightbox
impressum.html          Pflichtangaben
datenschutz.html        Datenschutzerklärung
404.html                Fehlerseite
dienstleistungen/*.html sechs Leistungsseiten (Detailebene)

assets/css/styles.css   einzige Design-Quelle (Tokens ganz oben)
assets/css/fonts.css    @font-face für die lokalen Schriften
assets/js/main.js       alle Interaktionen
assets/fonts/           Schriftdateien (woff2)
assets/img/             Fotos, je einmal als .jpg und .webp
                        …-gross.webp: zweite Stufe für Retina-Bildschirme
assets/video/           Imagefilm + Untertitel

tools/bilder-vergroessern.py  erzeugt die grosse Bildstufe
tools/bilder-einhaengen.py    haengt sie ins Markup ein
tools/bilder-menue.py         die sechs Miniaturen fuer den Balken
                              unter der Kopfzeile
tools/film-bauen.js           baut den Imagefilm neu (Bild fuer Bild)
tools/film-vertonen.py        spricht die Untertitel und mischt sie unter die Musik
tools/striche-ersetzen.py     Gedankenstriche im Text durch Kommas ersetzen
tools/strukturdaten.py        schreibt Breadcrumb-, FAQ- und Service-Daten
                              aus dem, was auf der Seite steht
tools/live-schalten.py        schaltet die Sperre gegen Suchmaschinen
                              an neunzehn Stellen um (--live / --test / --stand)

api/_vorgang.js         der Ablauf — Beleg, Angebot, zwei Mails
api/formular.js         Hülle für Vercel
api/_netlify.js         Hülle für Netlify (wird vorher gebündelt)
api/_beleg.js           Aussehen des PDF-Belegs
api/_angebot.js         Angebotsbogen: Datensatz, Word-Datei und PDF
api/_mails.js           Wortlaut aller vier Mails
api/_logo.js            Wortzeichen hell — für das dunkle Band im PDF
api/_logo_dunkel.js     Wortzeichen schwarz — für den weissen Angebotsbogen
package.json            die drei Pakete, die nur die Funktion braucht

tools/paket-bauen.sh    baut das ZIP zum Hochladen bei Netlify
netlify.toml            Hosting-Konfiguration Netlify
vercel.json             Hosting-Konfiguration Vercel
.vercelignore           was Vercel nicht ausliefern soll
robots.txt              sperrt derzeit alles
sitemap.xml             für später
```

Gestaltungsregeln stehen in `CLAUDE.md`.

---

## Formulare

Zwei Formulare: **Anfrage** (`kontakt.html`) und **Bewerbung** (`jobs.html`).
Beide prüfen Pflichtfelder, melden Fehler am jeweiligen Feld, bestätigen den
Versand und wehren Bots ab (unsichtbares Zusatzfeld + Zeitprüfung).

Im Anfrageformular gibt es neben den sechs Bereichen die Auswahl **„Anderer
Bereich"**. Sie blendet ein Textfeld ein, in das das Unternehmen selbst
schreiben kann, worum es geht — das steht dann auch im Betreff der Mail.
Gesteuert wird das über `data-wenn` / `data-wenn-wert` am umgebenden `.feld`;
weitere solche Felder brauchen nur diese zwei Attribute, keine Zeile
JavaScript.

Der Versandweg wird in dieser Reihenfolge gewählt (`assets/js/main.js`):

| Stufe | Bedingung | Weg |
|---|---|---|
| 0 | `/api/formular` antwortet | PDF-Beleg bauen und per Mail schicken |
| 1 | `data-endpunkt="https://…"` | POST an diese Adresse (Formspree, eigenes Backend) |
| 2 | `data-netlify="true"` | Netlify Forms — POST auf `/`, ohne Zugangsschlüssel |
| 3 | keins von beidem | Meldung mit Telefonnummer und Adresse |

Jede Stufe reicht an die nächste weiter, wenn es sie an dieser Adresse nicht
gibt. Eine Anfrage geht dadurch nie verloren — auch nicht, solange Stufe 0
noch nicht eingerichtet ist.

Aktuell ist `data-netlify="true"` gesetzt. **Auf Netlify funktionieren die
Formulare damit sofort**, ohne dass irgendwo ein Schlüssel hinterlegt werden
muss. Nach dem ersten Deploy einmalig einstellen:

> Netlify → Site → **Forms** → *Form notifications* → *Email notification*
> * `anfrage` → **info@hermserviceteam.com**
> * `bewerbung` → **info@hermserviceteam.com**

Auf einem anderen Host: `data-netlify="true"` entfernen und stattdessen
`data-endpunkt="https://formspree.io/f/xxxxxxx"` setzen. Sonst ändert sich nichts.

**Die Seite schickt niemanden in sein Mailprogramm** — weder von selbst noch
über einen Link. Wer ein Formular ausfüllt, klickt auf „Senden" und ist
fertig: es erscheint die Danke-Ansicht, und die Bestätigung kommt per Mail.

Fällt wirklich jeder Weg aus, steht dort eine Meldung mit Telefonnummer und
Adresse — mehr nicht. Alles, was den Besucher in ein anderes Programm
schickt, liest sich als Fehler, auch wenn es als Hilfe gemeint ist.

---

## Der PDF-Beleg

Jede Anfrage und jede Bewerbung kommt als **PDF im Anhang einer Mail** an.
Darin steht genau das, was ausgefüllt wurde — geordnet, mit Eingangszeitpunkt
und einer Referenz wie `AN-260807-1432`, die auch im Betreff und im Dateinamen
steht.

Zuständig sind drei Dateien:

```
api/formular.js   nimmt den POST an, prüft, baut, verschickt
api/_beleg.js     das Aussehen des PDF (Bauplan der Felder ganz oben)
api/_logo.js      das Wortzeichen, eingebettet
```

Die Website selbst bleibt, was sie war: statische Dateien ohne Aufbauschritt.
Nur diese eine Funktion läuft auf dem Server, und nur sie kennt die
Zugangsdaten. Im Browser landet davon nichts.

**Ein neues Feld im Formular** erscheint von selbst im Beleg — unter „Weitere
Angaben", wenn es im Bauplan (`BAUPLAN` in `api/_beleg.js`) nicht steht. Wer
es an eine bestimmte Stelle setzen will, trägt es dort in die passende Gruppe
ein. Die beiden Honigtopf-Felder (`firmenname`, `webseite`) tauchen nie auf.

### Einrichten

Vercel → Project → **Settings** → **Environment Variables**:

| Name | Wert | |
|---|---|---|
| `SMTP_HOST` | z. B. `smtp.ionos.de` | Postausgangsserver des Postfachs |
| `SMTP_PORT` | `465` oder `587` | 465 = SSL, 587 = STARTTLS |
| `SMTP_USER` | das Postfach, über das versendet wird | |
| `SMTP_PASS` | dessen Kennwort | |
| `MAIL_AN` | Empfänger der **Anfragen** | mehrere durch Komma getrennt |
| `MAIL_BEWERBUNG` | Empfänger der **Bewerbungen** | fehlt sie, gilt `MAIL_AN` |
| `MAIL_VON` | optional | sonst wird `SMTP_USER` genommen |

Danach einmal **Redeploy**, damit die Funktion die Werte sieht.

Solange auch nur eine der vier Pflichtangaben fehlt, antwortet die Funktion
mit `503` und die Website nimmt still den bisherigen Weg. Es muss also nichts
abgeschaltet werden, während die Zugangsdaten noch nicht da sind.

**Absenderadresse:** versendet wird über das eigene Postfach der Domain, nicht
über einen fremden Dienst. Deshalb passt der Absender zum SPF-Eintrag der
Domain und die Mail landet nicht im Spam. Ein „Antworten" auf die Mail geht
direkt an die Person, die das Formular ausgefüllt hat (`Reply-To`).

---

## Der Angebotsentwurf

Bei einer **Personalanfrage** liegen neben dem PDF-Beleg zwei weitere Dateien
in derselben Mail — derselbe Bogen zweimal:

| Datei | wofür |
|---|---|
| `Angebot_FR-Event-und-MesseCatering-GmbH_A-260808-0649-QQ6.docx` | zum Ausfüllen in Word |
| `Angebot_FR-Event-und-MesseCatering-GmbH_A-260808-0649-QQ6.pdf`  | zum Ansehen, überall gleich |

Der Bogen ist dem vorhandenen Angebotsformular nachgebaut — Kopf,
Absenderzeile, Anschriftenfeld, Kennzahlenblock, Positionstabelle, die sechs
Bedingungen und die Fußzeile mit Firmen- und Bankangaben.

**Warum zweimal?** Die Vorschau auf dem Telefon setzt ein Word-Dokument nicht
so, wie Word es setzt: sie rechnet Tabellen auf die Bildschirmbreite herunter
und lässt freistehende Absätze in Lesegröße stehen. Auf einem Blatt, das
beides mischt, steht dann die halbe Seite winzig und die andere riesig. Der
Bogen setzt deshalb **alles** in Tabellen derselben Breite — und wer ihn nur
ansehen will, öffnet ohnehin das PDF.

Was schon drinsteht:

* Anschrift und Ansprechpartner des Kunden, aus dem Formular
* Ausstellungsdatum und „Gültig bis"
* die Position als `12x Gastro-Personal`
* darunter `13.09.26 in der Zeit von 16.00-02.00 Uhr`
* die Standardzeile `+ 1 Stunde für An- und Abfahrt je Mitarbeiter`
* alle sechs Bedingungen und die vollständige Fußzeile

### Die Zusage: der Bogen fehlt nie und gehört nie zu jemand anderem

Drei Sicherungen in `api/formular.js`:

1. **Stimmigkeit.** Nach dem Bauen wird geprüft, ob im Datensatz wirklich die
   Angaben dieser Anfrage stehen — Ansprechpartner, Firma, E-Mail,
   Einsatzdatum. Ein Bogen mit fremden Daten wäre der schlimmste Fehler von
   allen, weil er richtig aussähe.
2. **Format und Umfang.** Eine Word-Datei fängt mit `PK` an, ein PDF mit
   `%PDF`, beide sind mindestens 5 KB groß. Ein abgeschnittener Puffer fällt
   hier auf und nicht erst beim Öffnen in der Disposition.
3. **Zweiter Versuch.** Schlägt eine der beiden Prüfungen fehl, wird alles
   noch einmal gebaut.

Und wenn auch das misslingt? Dann geht die Anfrage **trotzdem** raus — aber
mit `[OHNE ANGEBOT]` im Betreff und einem Hinweis ganz oben im Text, den man
nicht übersieht. Alle Angaben stehen weiterhin im PDF-Beleg, der Bogen lässt
sich von Hand anlegen. **Still fehlen darf er nie.**

### Die Dateinamen

Alle drei Anhänge tragen den Kunden im Namen — dann muss in der Disposition
niemand umbenennen, und im Postfach ist auf einen Blick zu sehen, wozu eine
Datei gehört:

```
Personalanfrage_FR-Event-und-MesseCatering-GmbH_AN-260808-0649-QQ6.pdf
Angebot_FR-Event-und-MesseCatering-GmbH_A-260808-0649-QQ6.docx
Angebot_FR-Event-und-MesseCatering-GmbH_A-260808-0649-QQ6.pdf
Bewerbung_Jonas-Petersen_BW-260808-0649-3KQ.pdf
```

Bei einer Anfrage ist die **Firma** der Anker, bei einer Bewerbung der
**Name**; fehlt die Firma, wird der Ansprechpartner genommen. Ergibt beides
nichts Brauchbares, bleibt der Name eben kurz — `Personalanfrage_AN-…pdf` ist
besser als ein kaputter Dateiname.

`dateiTeil()` in `api/_beleg.js` schreibt Umlaute um (`Größenwahn` →
`Groessenwahn`), macht aus allem Übrigen Bindestriche und kürzt lange Namen an
der Wortgrenze. Ein Dateiname wandert durch Mailprogramme, Dateisysteme und
Windows-Freigaben, und jedes davon stolpert über andere Zeichen — was hier
durchkommt, kommt überall durch. Nebenbei kann so auch nichts aus einem
Formularfeld in einen Pfad geraten.

### Zwei Anfragen in derselben Minute

Jede Referenz endet auf drei Zeichen aus `crypto.randomBytes` —
`AN-260808-0645-BYT`. Ohne sie hießen zwei Anfragen aus derselben Minute
gleich: gleiche Referenz, gleicher Dateiname, gleiche Angebotsnummer. In der
Disposition wäre das nicht auffällig, sondern still falsch.

Der Angebotsbogen trägt dieselben drei Zeichen (`A-260808-0645-BYT`). Daran
ist zu sehen, dass Beleg und Bogen zum selben Vorgang gehören.

Aus dem Alphabet fehlen I, O, 0 und 1 — am Telefon vorgelesen sind sie nicht
zu unterscheiden.

### Was bewusst leer bleibt

**Alle Preise.** Menge, Preis, Rabatt, Betrag, Nettobetrag, Umsatzsteuer und
Angebotsbetrag sind leere Felder. Ebenso Angebotsnummer und Kundennummer —
die vergibt der Betrieb aus seiner eigenen Zählung.

Damit kann der Bogen gar nicht versehentlich als fertiges Angebot rausgehen:
ohne Zahlen ist er sichtbar unfertig. Die Prüfliste dazu steht im Text der
Mail an die Disposition.

Im Datensatz heißt das `status: "DRAFT"` und `pricing[0].unitPrice === null`.
Die Schlüssel `pricing`, `subtotal`, `vat` und `total` bleiben trotzdem
erhalten — ein späterer Schritt kann sie füllen, ohne dass sich die Form
ändert.

### Den Bogen pflegen

Alles, was auf jedem Angebot gleich steht, liegt in **einer** Konstante:
`BOGEN` oben in `api/_angebot.js`.

| Feld | Was |
|---|---|
| `absenderzeile` | die Zeile über dem Anschriftenfeld |
| `einleitung` | „Wir erlauben uns Ihnen dieses Angebot zu unterbreiten:" |
| `anfahrt` | die Zeile unter der Position |
| `bedingungen` | die sechs Absätze: Schichtzeiten bis Zuschlagspflicht |
| `ust` | der Steuersatz in der Summenzeile |
| `gueltigTage` | Abstand zwischen Ausstellung und „Gültig bis" (7) |
| `fuss` | die vier Fußzeilen mit Steuer-, Register- und Bankangaben |

Es gibt **keine Preisliste** im Projekt. Das ist Absicht: Sätze, die
irgendwo im Code stehen, veralten unbemerkt.

### Der Datensatz dahinter

`generateOfferDraft()` in `api/_angebot.js` liefert das Angebot zuerst als
Datensatz — englische Schlüssel, damit später eine KI, eine Datenbank oder
ein Warenwirtschaftssystem daran andocken kann, ohne dass hier etwas
umbenannt werden muss:

```js
{
  offerNumber: 'A-260807-1432',   // interne Kennung; auf dem Bogen leer
  createdAt:   '2026-08-07T12:32:00.000Z',
  validUntil:  '2026-08-14T12:32:00.000Z',
  status:      'DRAFT',
  currency:    'EUR',
  customer:    { company, contact, email, phone, address, billingAddress,
                 vatId, orderNumber, costCenter, customerNumber },
  assignment:  { service, date, timeFrom, timeTo, hours, isSunday,
                 location, headcount, description },
  pricing:     [ { description, detail, quantity, unitPrice,
                   discount, amount } ],   // alle Geldfelder null
  subtotal: null, vat: null, total: null,
  review:      { required: true, reasons: [ … ] }
}
```

Vorbereitete Zustände: `DRAFT` · `REVIEW_REQUIRED` · `APPROVED` · `SENT` ·
`ACCEPTED` · `REJECTED`. Solange keine Preise gerechnet werden, vergibt die
Funktion nur `DRAFT`; die übrigen sind für den späteren Freigabeschritt da.

### Was noch fehlt, damit daraus ein Kreislauf wird

| Schritt | Stand |
|---|---|
| Anfrage entgegennehmen | fertig |
| Anfrage **ablegen** | Haken `speichern()` in `api/formular.js` — es gibt keine Datenbank |
| interne Benachrichtigung | fertig |
| Entwurf erzeugen, Kundendaten einsetzen | fertig |
| Preise ergänzen | **bewusst offen** — trägt die Disposition ein |
| **KI** statt fester Regeln | offen — `generateOfferDraft()` ist die Stelle |
| Word-Datei | fertig |
| PDF zusätzlich | fertig |
| Freigabe durch die Disposition | offen — bewusst; braucht Oberfläche und Ablage |
| Versand nach Freigabe | offen — setzt die Freigabe voraus |

Die beiden offenen Kernpunkte hängen am selben Fehlteil: einer **Ablage**.
Ohne einen Ort, an dem ein Angebot zwischen „erzeugt" und „freigegeben"
liegen kann, gibt es keine Freigabe. `speichern()` ist dafür vorbereitet.

---

## Die drei Mails

| An | Wann | Inhalt |
|---|---|---|
| `MAIL_AN` | jede Anfrage | strukturierter Text, PDF-Beleg, Angebot als DOCX **und** PDF |
| Kundin/Kunde | jede Anfrage | Eingangsbestätigung, kein Anhang |
| `MAIL_BEWERBUNG` | jede Bewerbung | strukturierter Text, PDF-Beleg |

### Warum Bewerbungen einen eigenen Verteiler haben

Bewerbungen sollen gleichzeitig an zwei Postfächer gehen — an das öffentliche
und an eines, das auf der Website **nicht** auftauchen soll. Deshalb steht der
Verteiler in `MAIL_BEWERBUNG` und nicht im Markup:

```
MAIL_AN         info@hermserviceteam.com
MAIL_BEWERBUNG  info@hermserviceteam.com, dispo@hermserviceteam.com
```

Eine Environment Variable liegt auf dem Server. Im Browser landet davon
nichts — weder im HTML noch im JavaScript, weder sichtbar noch im Quelltext.
Geprüft wird das mit: kein ausgeliefertes Dokument darf die Zeichenfolge
`dispo@` enthalten.

Ist `MAIL_BEWERBUNG` nicht gesetzt, gilt `MAIL_AN`. Ein vergessener Eintrag
führt so nie dazu, dass eine Bewerbung nirgends ankommt.

> **Eine Einschränkung, die dazugehört.** Wenn die Funktion einmal nicht
> erreichbar ist, öffnet die Website als Ersatzweg das Mailprogramm des
> Absenders. Dabei kann nur die Adresse verwendet werden, die im Markup
> steht — also `info@hermserviceteam.com`. Das zweite Postfach bekommt in
> diesem Fall nichts. Anders ginge es nicht, ohne die Adresse in die Seite zu
> schreiben.

Der Wortlaut steht in `api/_mails.js` — an einer Stelle, nicht verteilt.

Die Kundenbestätigung lässt sich mit `MAIL_BESTAETIGUNG=aus` abschalten. Sie
wird **nach** der Dispositionsmail verschickt und bricht nichts ab: Wenn sie
scheitert, liegt die Anfrage trotzdem schon im Haus, und der Absender bekommt
keine Fehlermeldung, die ihn ein zweites Mal schicken ließe.

---

### Was die Funktion abweist

| Fall | Antwort | Was der Absender sieht |
|---|---|---|
| Honigtopf gefüllt (Bot) | `200` | Danke-Seite, es wird nichts verschickt |
| Name, E-Mail oder Nachricht fehlt | `400` | Fehlermeldung mit Telefonnummer |
| Zugangsdaten fehlen | `503` | nichts — es geht Stufe 1–3 weiter |
| Postfach nicht erreichbar | `502` nach ~8 s | Fehlermeldung + Mail-Ersatzweg |
| mehr als 64 KB Daten | `413` | Fehlermeldung |

---

## Interne Vorschau — Link für die Kollegen

Drei Wege. Der erste ist der schnellste und der einzige, bei dem der
Passwortschutz nichts kostet.

### Weg 1 — eigener Webspace (empfohlen)

Für hermserviceteam.com besteht bereits ein Hosting-Vertrag. Dort einen
Unterordner anlegen und den Inhalt des Projekts hineinladen:

1. Per FTP oder Datei-Manager des Hosters einen Ordner `vorschau` anlegen.
2. Den **Inhalt** dieses Projekts hineinladen (nicht den Ordner selbst) —
   `index.html` muss direkt in `/vorschau/` liegen.
3. Fertig: **https://hermserviceteam.com/vorschau/**

Die bestehende Website wird dabei nicht angefasst — der Unterordner liegt
daneben.

**Passwortschutz:** die meisten deutschen Hoster (Strato, IONOS, All-Inkl,
Hetzner, Mittwald) haben im Kundenmenü einen Punkt „Verzeichnisschutz“ oder
„Passwortschutz“. Dort den Ordner `vorschau` auswählen, Benutzername und
Passwort vergeben. Alternativ die zwei auskommentierten Zeilen in `.htaccess`
aktivieren.

Die mitgelieferte `.htaccess` bringt außerdem gleich mit: Sperre gegen
Suchmaschinen, Komprimierung, Zwischenspeicher, richtige Dateitypen für
Schriften und Video, Fehlerseite und Adressen ohne `.html`.

### Weg 2 — GitHub Pages (kostenlos, ohne Passwort)

Ohne eigenen Webspace geht es auch über GitHub Pages. Ergebnis ist die Adresse

**https://4wf86nbfzr-png.github.io/Claude/**

die jeder im Büro im Browser öffnen kann — ohne Konto, ohne Installation,
auf Rechner und Handy.

### Einmalig einschalten (etwa 30 Sekunden)

1. github.com/4wf86nbfzr-png/Claude → **Settings** → links **Pages**
2. *Source*: **Deploy from a branch**
3. *Branch*: **`claude/entpacken-demo-oeffnen-29f7th`**, Ordner **`/ (root)`**
4. **Save**

Nach ein bis zwei Minuten steht die Adresse oben auf derselben Seite.
Jeder weitere Push aktualisiert sie automatisch.

`.nojekyll` liegt im Projekt, damit GitHub die Dateien unverändert ausliefert.

### Alternativ über GitHub Actions

`.github/workflows/vorschau.yml` erledigt dasselbe automatisch und schaltet
Pages selbst frei. Dafür müssen Actions im Repository erlaubt sein:
**Settings → Actions → General → *Allow all actions and reusable workflows*
→ Save**, danach **Actions → Interne Vorschau → Run workflow**. Wer Weg 1
genommen hat, braucht das nicht.

### Was diese Vorschau ist und was nicht

- **Nicht** in Suchmaschinen: jede Seite trägt `noindex`.
  (`robots.txt` greift hier nicht — GitHub Pages liefert sie unter
  `/Claude/robots.txt` aus, Suchmaschinen lesen aber nur die im Wurzelpfad
  der Domain. Die Angabe in den Seiten selbst wirkt.)
- **Kein Zugriffsschutz.** Wer die Adresse kennt, kommt hinein. Das
  Repository ist ohnehin öffentlich, ein Passwortfeld im Browser würde daran
  nichts ändern. Wer echten Schutz braucht: Netlify Pro oder Cloudflare
  Access (siehe unten) — oder das Repository vorher auf privat stellen,
  dann braucht GitHub Pages allerdings einen bezahlten Tarif.
- **Formulare nehmen dort den Mail-Weg.** GitHub Pages nimmt keine
  Formulareinträge entgegen; `main.js` erkennt das an der Adresse und öffnet
  stattdessen das Mailprogramm mit der fertigen Nachricht. Pflichtfeldprüfung,
  Fehlermeldungen und Bestätigung lassen sich trotzdem vollständig testen.

## Auf Vercel veröffentlichen

`vercel.json` liegt im Projekt und regelt alles: Kopfzeilen, Zwischenspeicher,
Adressen ohne `.html`. Ein Build-Schritt entfällt — das Projekt ist reines
HTML/CSS/JS.

### Achtung: der Produktionsbranch

Vercel veröffentlicht standardmäßig den Branch **`main`**. Auf `main` liegt
aber nur die erste Fassung mit einer README — die fertige Website steht auf
`claude/entpacken-demo-oeffnen-29f7th`. Ohne Umstellung würde Vercel eine
leere Seite bauen.

Zwei Wege:

* **Ohne Änderung am Repository:** Vercel → Project → *Settings* → *Git* →
  **Production Branch** auf `claude/entpacken-demo-oeffnen-29f7th` setzen,
  dann *Deployments* → **Redeploy**.
* **Oder** den Branch nach `main` zusammenführen. Dann bleibt die Vercel-
  Voreinstellung, und jeder weitere Stand geht wieder über einen Branch.

Solange nichts umgestellt ist, entsteht bei jedem Push auf den Arbeitsbranch
ohnehin automatisch eine **Preview-Adresse** — für den internen Test genügt
die.

### Einstellungen beim Import

| Feld | Wert |
|---|---|
| Framework Preset | **Other** |
| Build Command | leer lassen |
| Output Directory | leer lassen (Projektwurzel) |
| Install Command | leer lassen |
| Root Directory | `./` |

### Zugriffsschutz

Vercel → *Settings* → **Deployment Protection** → *Vercel Authentication*.
Damit kommt nur hinein, wer im Vercel-Team angemeldet ist. Ob das im
gebuchten Tarif enthalten ist, steht dort direkt am Schalter.

### Einstellungen beim Import — Nachtrag zur Funktion

Seit `api/formular.js` dazugekommen ist, liegt eine `package.json` im
Projekt. Vercel installiert daraus `pdfkit` und `nodemailer` für die Funktion.
An den Feldern oben ändert das nichts: es gibt weiterhin **kein Build
Command** — die Website bleibt statisch, nur die Funktion wird gebaut.

`node_modules/` gehört nicht ins Repository und steht in `.gitignore`.

### Formulare auf Vercel

Hier laufen sie über die eigene Funktion `/api/formular` — jede Anfrage kommt
als PDF im Postfach an. Was dafür einzutragen ist, steht oben unter
**Der PDF-Beleg → Einrichten**.

Solange die Zugangsdaten fehlen, antwortet die Funktion mit `503` und die
Formulare nehmen den Mail-Weg: `main.js` öffnet das Mailprogramm mit der
fertigen Nachricht. Pflichtfeldprüfung, Fehlermeldungen und Bestätigung
lassen sich also auch vorher schon vollständig testen.

`data-netlify="true"` kann dabei stehen bleiben; außerhalb von Netlify wird
es nicht ausgewertet.

---

## Auf Netlify veröffentlichen — der Testweg

Netlify hat einen kostenlosen Tarif, der alles kann, was diese Website
braucht: statische Seiten **und** eine Node-Funktion mit echtem Netzzugang.
Das ist der entscheidende Punkt — der Angebotsbogen wird auf dem Server
gebaut und per SMTP verschickt. Reine Datei-Hoster (GitHub Pages, Surge) und
Hoster mit Worker-Laufzeit (Cloudflare Pages) können das nicht: dort gibt es
kein SMTP.

Kein Konto bei GitHub nötig, kein Build, keine Kreditkarte.

### 1. Paket bauen

```bash
bash tools/paket-bauen.sh
# → herm-website-netlify.zip  (rund 16 MB)
```

Der erste Lauf dauert ein paar Minuten (er packt den Imagefilm einmal
dichter und legt das Ergebnis unter `.paket-cache/` ab); jeder weitere Lauf
ist schnell, solange sich der Film nicht ändert.

**Warum ein eigenes Skript?** Beim Ziehen-und-Ablegen führt Netlify keinen
Build aus — es veröffentlicht, was im Paket liegt. Eine Funktion, die
`require('pdfkit')` sagt, fände dort nichts vor.

Das Skript bündelt sie deshalb vorher: aus `api/_netlify.js` samt aller
Abhängigkeiten und minifiziert wird **eine einzige Datei** unter
`netlify/functions/formular.js` (rund 2,1 MB). Die braucht kein
`node_modules` und keinen Bündler auf der Gegenseite — sie läuft, wo immer
sie landet.

Außerdem verkleinert das Skript die JPEG-Rückfallebene (reine Absicherung
für sehr alte Browser, praktisch nie geholt) und packt den Imagefilm dichter
— beides nur im Paket, nie im Repository selbst. Details und die
Messwerte dazu stehen in `CLAUDE.md` unter „Das Netlify-Paket ist keine
Kopie des Repositorys".

Zwei Kontrollen laufen dabei mit: das Bündel muss für sich allein starten,
und es darf **nichts** außer eingebauten Node-Modulen nachladen. Schlägt eine
davon fehl, bricht das Skript ab, statt ein Paket zu bauen, das erst auf dem
Server auffliegt.

### 2. Hochladen

1. [app.netlify.com](https://app.netlify.com) → Konto anlegen (E-Mail genügt)
2. **Sites** → Kachel **„Deploy manually"** → das ZIP darauf ziehen
3. Nach etwa einer Minute steht die Adresse da, etwa
   `https://schillernder-name-a1b2c3.netlify.app`

### 3. Postfach hinterlegen

**Site configuration → Environment variables → Add a variable**

| Name | Wert |
|---|---|
| `SMTP_HOST` | Postausgangsserver des Absenderpostfachs |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | die Adresse, über die versendet wird |
| `SMTP_PASS` | deren Kennwort |
| `MAIL_AN` | wer die **Anfragen** bekommt |
| `MAIL_BEWERBUNG` | wer die **Bewerbungen** bekommt, mehrere durch Komma |

`SMTP_HOST` steht beim Mailanbieter unter „Postausgangsserver (SMTP)".
Danach das ZIP **noch einmal** hochladen — die Funktion liest die Werte beim
Start.

### 4. Prüfen

`https://…netlify.app/kontakt` aufrufen, ausfüllen, absenden. Es müssen zwei
Mails ankommen:

* an `MAIL_AN`: Betreff `Neue Personalanfrage – …`, drei Anhänge
* an die im Formular angegebene Adresse: die Eingangsbestätigung

Kommt nichts an: **Logs → Functions → formular**. Dort steht der Grund.

### Wenn die Formulare ins Mailprogramm führen

Dann ist die Funktion nicht erreichbar, und die Seite ist auf ihren letzten
Ersatzweg ausgewichen. Prüfen lässt sich das in einem Schritt: die Adresse
`/api/formular` im Browser aufrufen.

| Was dasteht | Was es heißt |
|---|---|
| `{"ok":false,"grund":"nur POST"}` | Die Funktion läuft. Der Fehler liegt woanders — *Logs → Functions*. |
| Die 404-Seite der Website | Die Funktion ist nicht mitgekommen. Paket neu bauen und hochladen. |

**Ins Mailprogramm führt die Seite dabei nie** — weder von selbst noch über
einen Link. Sie zeigt eine Meldung mit Telefonnummer und Adresse, und das
ausgefüllte Formular bleibt stehen.

### Was dieser Weg nicht leistet

Die Adresse ist **öffentlich erreichbar**, wenn jemand sie kennt. Ein
Passwortschutz ist bei Netlify kostenpflichtig. Gegen Suchmaschinen ist die
Seite dreifach gesperrt (`robots.txt`, `<meta name="robots">`,
`X-Robots-Tag`), sie taucht also nicht in Ergebnissen auf — aber wer den Link
hat, kommt hinein. Für eine Testfassung mit einer zufälligen Adresse, die
nirgends verlinkt ist, reicht das; ein Geheimnis ist es nicht.

### Der Unterschied zu Vercel

| | Vercel | Netlify |
|---|---|---|
| Funktion liegt in | `api/formular.js` | `api/_netlify.js`, gebündelt |
| Adresse | `/api/formular` | `/api/formular` (per Weiterleitung) |
| Zeitgrenze | 20 s (in `vercel.json`) | **10 s**, fest |
| Konfiguration | `vercel.json` | `netlify.toml` |

Beide Hüllen sind dünn und rufen dasselbe `api/_vorgang.js` auf — der Ablauf
steht genau einmal da und kann nicht auseinanderlaufen.

Wegen der zehn Sekunden verschickt die Funktion beide Mails über **eine**
Verbindung (`pool: true`). Der teure Teil ist der Verbindungsaufbau, nicht die
Nachricht; ohne Bündelung kann es knapp werden. Gemessen: 0,45 s.

Und `pdfkit` liest seine Schriftmetriken normalerweise zur Laufzeit von der
Platte. Sobald ein Host die Funktion bündelt, fehlen die Dateien. Deshalb
benutzen Beleg und Angebot die **Standalone-Fassung**, die sie eingebettet
trägt — das ist der Grund, warum es hier läuft und anderswo nicht.

---

## Vor dem Live-Gang

Diese Punkte müssen erledigt sein. Erst danach die Sperren lösen.

**Inhaltlich**

- [ ] Impressum vervollständigen: Handelsregisternummer, USt-IdNr., Behörde
      und Nummer der AÜG-Erlaubnis. Im Text als `bitte ergänzen` markiert.
- [ ] Datenschutzerklärung: Hoster mit Name und Anschrift eintragen,
      Auftragsverarbeitungsvertrag abschließen.
- [ ] Beide Rechtstexte anwaltlich prüfen lassen.
- [x] ~~Telefonische Erreichbarkeit eintragen.~~ Mo–Fr 10–17 Uhr steht auf
      `kontakt.html`, in den Kontaktkarten der Startseite, im Fuß jeder
      Seite, im Einleitungssatz der Teamseite, als
      `openingHoursSpecification` in den strukturierten Daten und in der
      Fußzeile beider Bestätigungsmails. `grep -rn "10–17"` findet alle.
- [ ] Bewertungen oder benannte Referenzkunden ergänzen, sobald eine
      Freigabe vorliegt — derzeit stehen dort nur Branchenangaben.
- [ ] Porträts von Maik Herm und Valeria Occhipinto ergänzen
      (`assets/img/team/`, Format wie die vorhandenen: 1000 × 1250).
- [ ] Bewegtes Material für den Imagefilm (Bild ist noch ein Platzhalter
      aus Fotos; die Musik liegt vor und ist freigegeben). Der Platzhalter
      läuft in 1920 × 1080. Größer bringt derzeit nichts: die Fotos, aus
      denen er besteht, haben 1129 bis 1600 px. Eine 2560er Fassung wurde
      gebaut und gemessen und war exakt gleich gut. Sobald echtes Material
      vorliegt, lohnt sie sich — `node tools/film-bauen.js --gross`.
- [ ] **Die Ansage im Film neu einsprechen.** Sie kommt derzeit aus einem
      Sprachmodell (Thorsten, deutsche Männerstimme) und klingt ruhig, aber
      hörbar synthetisch — als Platzhalter gedacht, nicht als Endfassung.
      Der Text steht in `assets/video/imagefilm-de.vtt`, die Zeiten stehen
      dort ebenfalls. Liegt eine echte Aufnahme vor, ersetzt sie in
      `tools/film-vertonen.py` den Synthese-Schritt; Mischung, Absenkung der
      Musik und Lautheit bleiben wie sie sind.

      Das Sprachmodell liegt **nicht** im Repository (110 MB). Es kommt aus
      den Modellen des sherpa-onnx-Projekts und gehört nach `tools/stimme/`:

      ```bash
      curl -L -o /tmp/stimme.tar.bz2 \
        https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-de_DE-thorsten-high.tar.bz2
      tar xjf /tmp/stimme.tar.bz2 -C /tmp
      mkdir -p tools/stimme && cp /tmp/vits-piper-de_DE-thorsten-high/de_DE-thorsten-high.onnx* tools/stimme/
      pip install piper-tts imageio-ffmpeg
      ```
- [ ] Fotos in 2400 px nachliefern (`docs/foto-briefing.md`). Vorhanden sind
      1129 bis 1600 px; auf einem Retina-Bildschirm fordert ein randloses
      Foto bis zu 4090 px an. Die zweite Bildstufe rechnet das derzeit
      hoch — das sieht besser aus als der Browser es täte, ersetzt aber
      kein echtes Material.
      Am Schreibtisch ist damit alles unter 1,3-fach; nur `promotion-messe`
      bleibt bei 1,4, weil das Original nur 1129 px hat.
      **Am Telefon** bekommt seitdem das eine Kopfbild je Seite die grosse
      Stufe (`sizes` beginnt dort mit `200vw`): der Hochrechnungsfaktor fällt
      von 2,3 auf 1,36, und gemessen kostet das nichts — je drei
      Durchfahrten mit und ohne grosse Stufe ergaben denselben Median,
      dasselbe p95 und dieselbe Zahl Ruckler. Die **sechs Bühnen** bleiben
      auf der kleinen Stufe und damit bei rund 1,6-fach; an ihnen hängt die
      Rasterarbeit, die einmal geruckelt hat. Sobald echtes Material in
      2400 px vorliegt, löst sich auch das von selbst.

**Technisch**

- [ ] SMTP-Zugangsdaten des Postfachs als Environment Variables hinterlegen,
      damit die Formulare den PDF-Beleg verschicken (siehe **Der PDF-Beleg →
      Einrichten**). `MAIL_AN` danach von der Testadresse auf die endgültige
      umstellen.
- [ ] Sperre gegen Suchmaschinen lösen. Das sind neunzehn Stellen —
      fünfzehn Seitenköpfe, `robots.txt` und drei Kopfzeilen-Dateien.
      Nicht von Hand, sondern:

      ```bash
      python3 tools/live-schalten.py --stand    # zeigt, wie es steht
      python3 tools/live-schalten.py --live     # freigeben
      python3 tools/live-schalten.py --test     # wieder sperren
      ```

      `404.html` bleibt dabei bewusst auf `noindex`.
- [ ] Domain verbinden, HTTPS-Zertifikat erzeugen lassen.
- [ ] `sitemap.xml` in der Google Search Console einreichen.
- [ ] Passwortschutz aufheben.
- [ ] **Adressen der bisherigen Website prüfen.** Der alte Auftritt liegt
      unter `/kontakt/`, `/jobs/`, `/ueber-uns/`, `/news/` und
      `/dienstleistungen/<name>/` — also mit Schrägstrich am Ende und ohne
      `.html`. Die Regeln dafür stehen in `vercel.json`, `netlify.toml` und
      `.htaccess`; `/ueber-uns` zeigt jetzt dauerhaft auf `team.html`,
      `/news` auf die Startseite. Nach dem Umschalten einmal von Hand
      nachfassen: jede alte Adresse aufrufen und sehen, dass sie mit 301
      am richtigen Ort landet. Was hier fehlt, kostet Platzierungen, die
      seit Jahren stehen.
- [ ] Mitarbeiter-Login gegenprüfen: der Knopf auf `jobs.html` führt auf
      `https://hst.secplan.net`. Ändert sich die Adresse des Dienstplans,
      steht sie an zwei Stellen (`jobs.html` und die Aufzählung in
      `datenschutz.html`).

Zur Kontrolle von Hand:

```bash
grep -rn "TESTBETRIEB\|X-Robots-Tag" . --include="*.html" --include="*.toml" \
  --include="*.txt" --include="*.json" --include=".htaccess"
```

---

## Prüfungen

Die Testskripte liegen nicht im Repository; geprüft wurde vor der Übergabe:

- alle Links, Sprungmarken und Dateipfade auf 14 Seiten (841 Links)
- jeder Link und Knopf hat einen zugänglichen Namen
- Farbkontraste nach WCAG auf allen Seiten, auch bei geöffnetem Menü
- kein waagerechter Überlauf bei 320, 390, 768, 1280 und 1440 px
- Formulare: Pflichtfeldprüfung, Fehlermeldungen, Korrekturverhalten,
  Honigtopf, Übermittlung, Bestätigung — auf Desktop und Smartphone
- keine JavaScript-Fehler, keine fehlenden Dateien
- `prefers-reduced-motion` und Betrieb ohne JavaScript
- Seitenrand und waagerechter Überlauf zusätzlich bei 1024, 1920, 2560 und
  3840 px — der Satzspiegel bleibt ab 1280 px stehen, statt mitzuwachsen
- LCP und CLS je Seite: CLS überall ≤ 0,0002
- wie stark jedes Foto wirklich hochgerechnet wird, `object-fit:cover`
  eingerechnet, am Laptop (1440 @2×) und am Telefon (390 @3×)
- Bewerbungsformular vollständig: Pflichtfelder, Spamschutz, Übermittlung,
  Beleg im Anhang und die Eingangsbestätigung an die Bewerberin
- der Wechsel Testbetrieb ↔ Live-Betrieb, hin und zurück, mit leerem
  `git diff` danach
- der Balken unter der Kopfzeile auf fünf Seiten: öffnen, sechs Bereiche,
  sechs Fotos, Escape, Tastaturbedienung, ohne JavaScript, im Vollbildmenü
  und am Telefon
- jeder Menüpunkt führt auf eine eigene Datei und beginnt dort oben —
  kein Sprungziel innerhalb der Startseite

---

## Was bewusst nicht drin ist

Keine Cookies, kein Tracking, keine Analyse-Werkzeuge, keine externen
Schriften, keine Social-Media-Plugins. Deshalb braucht die Seite auch kein
Cookie-Banner. Wer das ändert, muss die Datenschutzerklärung nachziehen.
