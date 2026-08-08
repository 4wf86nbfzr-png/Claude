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
index.html              Startseite, zehn abgegrenzte Bloecke
dienstleistungen.html   die sechs Bereiche als Kamerafahrt (Buehnen)
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
assets/video/           Imagefilm + Untertitel

api/formular.js         nimmt die Formulare an und führt den Vorgang aus
api/_beleg.js           Aussehen des PDF-Belegs
api/_angebot.js         Angebotsbogen: Datensatz, Word-Datei und PDF
api/_mails.js           Wortlaut aller drei Mails
api/_logo.js            Wortzeichen hell — für das dunkle Band im PDF
api/_logo_dunkel.js     Wortzeichen schwarz — für den weissen Angebotsbogen
package.json            die drei Pakete, die nur die Funktion braucht

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
| 3 | keins von beidem | öffnet das Mailprogramm mit fertiger Nachricht |

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

Ohne Netlify und ohne Endpunkt bleibt der Mail-Weg — funktionsfähig, aber
nicht schön: der Absender muss die Mail selbst abschicken.

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
| `MAIL_AN` | Empfänger der Belege | mehrere durch Komma getrennt |
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
| `Angebot-Entwurf-A-260807-1432.docx` | zum Ausfüllen in Word |
| `Angebot-Entwurf-A-260807-1432.pdf`  | zum Ansehen, überall gleich |

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
| Disposition | jede Anfrage | strukturierter Text, PDF-Beleg, Angebot als DOCX **und** PDF |
| Kundin/Kunde | jede Anfrage | Eingangsbestätigung, kein Anhang |
| Disposition | jede Bewerbung | strukturierter Text, PDF-Beleg |

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

## Auf Netlify veröffentlichen

1. netlify.com → **Add new site → Import an existing project** → GitHub →
   dieses Repository, Branch `claude/entpacken-demo-oeffnen-29f7th`.
2. Build command: **leer lassen.** Publish directory: **`.`**
   (`netlify.toml` setzt beides bereits.)
3. Deploy. Es entsteht eine Adresse wie `https://zufallsname.netlify.app`.
4. **Passwortschutz:** Site configuration → *Access & security* →
   *Visitor access* → **Password protection**. Danach ist die Vorschau nur
   mit Passwort erreichbar. Das ist eine Funktion des kostenpflichtigen
   Netlify-Tarifs (Pro).
   *Kostenlose Alternative:* Cloudflare Pages + Cloudflare Access
   (E-Mail-Freigabe für bis zu 50 Personen). Dann laufen die Formulare
   allerdings nicht mehr über Netlify Forms — dort wäre ein Endpunkt nötig.
5. Formular-Benachrichtigungen einstellen (siehe oben).

Die Sperre gegen Suchmaschinen wirkt dabei dreifach: `robots.txt`,
`<meta name="robots">` in jeder Seite und der Header `X-Robots-Tag` aus
`netlify.toml`.

---

## Vor dem Live-Gang

Diese Punkte müssen erledigt sein. Erst danach die Sperren lösen.

**Inhaltlich**

- [ ] Impressum vervollständigen: Handelsregisternummer, USt-IdNr., Behörde
      und Nummer der AÜG-Erlaubnis. Im Text als `bitte ergänzen` markiert.
- [ ] Datenschutzerklärung: Hoster mit Name und Anschrift eintragen,
      Auftragsverarbeitungsvertrag abschließen.
- [ ] Beide Rechtstexte anwaltlich prüfen lassen.
- [ ] Telefonische Erreichbarkeit eintragen (`kontakt.html`, als
      `bitte ergänzen` markiert). Danach dieselbe Angabe als
      `openingHours` in die strukturierten Daten der Startseite.
- [ ] Bewertungen oder benannte Referenzkunden ergänzen, sobald eine
      Freigabe vorliegt — derzeit stehen dort nur Branchenangaben.
- [ ] Porträts von Maik Herm und Valeria Occhipinto ergänzen
      (`assets/img/team/`, Format wie die vorhandenen: 1000 × 1250).
- [ ] Bewegtes Material für den Imagefilm (Bild ist noch ein Platzhalter
      aus Fotos; die Musik liegt vor und ist freigegeben).

**Technisch**

- [ ] SMTP-Zugangsdaten des Postfachs als Environment Variables hinterlegen,
      damit die Formulare den PDF-Beleg verschicken (siehe **Der PDF-Beleg →
      Einrichten**). `MAIL_AN` danach von der Testadresse auf die endgültige
      umstellen.
- [ ] `robots.txt`: oberen Block löschen, unteren einkommentieren.
- [ ] In allen 14 Seiten den Block `TESTBETRIEB` samt
      `<meta name="robots" content="noindex, …">` entfernen.
- [ ] In `netlify.toml` **und** `vercel.json` die Zeile `X-Robots-Tag` entfernen.
- [ ] Domain verbinden, HTTPS-Zertifikat erzeugen lassen.
- [ ] `sitemap.xml` in der Google Search Console einreichen.
- [ ] Passwortschutz aufheben.

Suchbefehl für alle drei Sperren auf einmal:

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

---

## Was bewusst nicht drin ist

Keine Cookies, kein Tracking, keine Analyse-Werkzeuge, keine externen
Schriften, keine Social-Media-Plugins. Deshalb braucht die Seite auch kein
Cookie-Banner. Wer das ändert, muss die Datenschutzerklärung nachziehen.
