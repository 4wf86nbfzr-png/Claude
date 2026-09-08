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
index.html              Startseite
kontakt.html            Anfrageformular
jobs.html               Stellen, FAQ, Bewerbungsformular
team.html               Büroteam
galerie.html            Bildergalerie mit Lightbox
impressum.html          Pflichtangaben
datenschutz.html        Datenschutzerklärung
404.html                Fehlerseite
dienstleistungen/*.html sechs Leistungsseiten

assets/css/styles.css   einzige Design-Quelle (Tokens ganz oben)
assets/css/fonts.css    @font-face für die lokalen Schriften
assets/js/main.js       alle Interaktionen
assets/fonts/           Schriftdateien (woff2)
assets/img/             Fotos, je einmal als .jpg und .webp
assets/video/           Imagefilm + Untertitel

netlify.toml            Hosting-Konfiguration (Header, Adressen, Zwischenspeicher)
robots.txt              sperrt derzeit alles
sitemap.xml             für später

intern/                 internes Werkzeug: Schichtabgleich (nicht öffentlich)
bruecke/                der Dienst dahinter (Node) — eigene Anleitung im Ordner
```

Gestaltungsregeln stehen in `CLAUDE.md`.

`intern/` und `bruecke/` gehören nicht zur Website. Sie liegen im selben
Repository, weil sie dieselben Schriften, Farben und Bausteine benutzen —
ausgeliefert werden sie aber vom Dienst im Büronetz. `netlify.toml` und
`.htaccess` beantworten `/intern/` auf dem öffentlichen Host mit 404.

---

## Formulare

Zwei Formulare: **Anfrage** (`kontakt.html`) und **Bewerbung** (`jobs.html`).
Beide prüfen Pflichtfelder, melden Fehler am jeweiligen Feld, bestätigen den
Versand und wehren Bots ab (unsichtbares Zusatzfeld + Zeitprüfung).

Der Versandweg wird in dieser Reihenfolge gewählt (`assets/js/main.js`):

| Bedingung am `<form>` | Weg |
|---|---|
| `data-endpunkt="https://…"` | POST an diese Adresse (Formspree, eigenes Backend) |
| `data-netlify="true"` | Netlify Forms — POST auf `/`, ohne Zugangsschlüssel |
| keins von beidem | öffnet das Mailprogramm mit fertiger Nachricht |

Aktuell ist `data-netlify="true"` gesetzt. **Auf Netlify funktionieren die
Formulare damit sofort**, ohne dass irgendwo ein Schlüssel hinterlegt werden
muss. Nach dem ersten Deploy einmalig einstellen:

> Netlify → Site → **Forms** → *Form notifications* → *Email notification*
> * `anfrage` → **dispo@hermserviceteam.com**
> * `bewerbung` → **info@hermserviceteam.com**

Auf einem anderen Host: `data-netlify="true"` entfernen und stattdessen
`data-endpunkt="https://formspree.io/f/xxxxxxx"` setzen. Sonst ändert sich nichts.

Ohne Netlify und ohne Endpunkt bleibt der Mail-Weg — funktionsfähig, aber
nicht schön: der Absender muss die Mail selbst abschicken.

---

## Schichtabgleich (intern)

Werkzeug für den Morgenlauf des Büros. Zwei Dateien rein, eine raus:

1. **Abgleichliste aus secplan** (das PDF der offenen Abgleiche) ablegen.
2. **Stundenzettel** vom Einsatz ablegen — Foto, PDF oder Tabelle.
3. Abweichungen bestätigen, freigeben. Die Brücke meldet sich mit Ihrem Zugang
   bei secplan an und trägt die Zeiten selbst ein — mit Nachlesen, ob es
   angekommen ist. Wer das (noch) nicht will, lädt stattdessen die
   **Ergebnisdatei** herunter und trägt von Hand nach.

Dazu: automatische Namenszuordnung, Konfliktprüfung nach Arbeitszeitgesetz,
Massenbestätigung, Diktat statt Tippen und ein Protokoll, das jede Änderung
festhält.

Zwei Seiten und ein kleiner Dienst:

```
intern/abgleich.html    fürs Büro — Abweichungen sichten und freigeben
intern/erfassung.html   fürs Handy des Schichtleiters, wenn keine Liste geführt wurde
bruecke/                Node-Dienst: Plan holen, Fotos lesen, zurückschreiben, morgens melden
```

Starten:

```bash
cd bruecke
cp konfig.beispiel.json konfig.json
npm install          # optional — ohne Pakete läuft der Datei-Modus
npm start            # → Link mit Schlüssel erscheint im Fenster

npm run einrichten   # einmalig, wenn die Zeiten selbst nach secplan sollen
```

**Zum Ausprobieren:** `npm run vorfuehrung` startet ein nachgebautes secplan
samt Beispieldateien — die ganze Kette einmal durchspielen, ohne dass etwas
Echtes angefasst wird. `npm run pruefen` sagt, ob auf diesem Rechner alles da
ist. `npm run bauen` erzeugt **`Schichtabgleich.html`**: eine einzige Datei zum
Weitergeben, die man doppelklickt — ohne Installation.

Ohne den Dienst funktioniert der Abgleich weiterhin: Dateien von Hand ablegen,
am Ende fällt die Ergebnisdatei heraus. Das PDF liest die Oberfläche selbst,
dafür muss nichts installiert sein und nichts laufen.

Alles Weitere — Mail am Morgen, was mit handschriftlichen Zetteln passiert,
der direkte Draht zu secplan.net und seine einmalige Einrichtung — steht in
**`bruecke/README.md`**.

Prüfen, ob die Rechenlogik stimmt: `cd bruecke && npm test`.

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

## Auf Netlify veröffentlichen (empfohlen)

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
- [ ] Porträts von Maik Herm und Alexander Krapp ergänzen
      (`assets/img/team/`, Format wie die vorhandenen: 1000 × 1250).
- [ ] Echten Imagefilm einsetzen (siehe `CLAUDE.md`), Musik lizenzieren.

**Technisch**

- [ ] `robots.txt`: oberen Block löschen, unteren einkommentieren.
- [ ] In allen 14 Seiten den Block `TESTBETRIEB` samt
      `<meta name="robots" content="noindex, …">` entfernen.
- [ ] In `netlify.toml` die Zeile `X-Robots-Tag` entfernen.
- [ ] Domain verbinden, HTTPS-Zertifikat erzeugen lassen.
- [ ] `sitemap.xml` in der Google Search Console einreichen.
- [ ] Passwortschutz aufheben.

Suchbefehl für alle drei Sperren auf einmal:

```bash
grep -rn "TESTBETRIEB" . --include="*.html" --include="*.toml" --include="*.txt"
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
