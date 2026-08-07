# Gestaltungsregeln

Kurzfassung für alle, die an dieser Website weiterarbeiten. Sie ist kein
Styleguide für die Marke, sondern die Begründung hinter dem Code — damit
spätere Änderungen nicht gegen bestehende Entscheidungen laufen.

---

## Grundhaltung

Die Seite soll nach Handwerk aussehen, nicht nach Baukasten. Konkret heißt das:

- **Ein Stylesheet, eine Wahrheit.** Alle Werte kommen aus den Tokens ganz
  oben in `assets/css/styles.css`. Keine Einzelfarben, keine Einzelabstände
  irgendwo im Markup.
- **Fotos tragen die Seite.** Wo ein Bild die Aussage trägt, braucht es keine
  Grafik, keinen Farbverlauf und keinen Leuchteffekt daneben.
- **Schwarzweiß bleibt schwarzweiß.** Die Akzentvariablen der Bühnen stehen
  alle auf Weiß. Wer eine Farbe einführt, muss sie über die ganze Seite
  durchziehen — sonst wirkt sie wie ein Versehen.
- **Keine Dauerbewegung.** Nichts pulsiert, nichts wandert von allein.

---

## Bewegung

Das gesamte Bewegungssystem steht am Ende von `styles.css` unter der
Überschrift `BEWEGUNG`. Es hängt an drei Zahlen, die `main.js` beim Scrollen
schreibt:

| Variable | Wo | Bedeutung |
|---|---|---|
| `--weg` | `[data-weg]` | 0 → 1, wie weit der Abschnitt oben hinausgelaufen ist |
| `--lauf` | `[data-lauf]` | 0 → 1, wie weit das Element durchs Fenster gewandert ist |
| `--kapitel` | `.stage` | 0 → 1, Fortschritt innerhalb einer Bühne |

Was daraus wird, entscheidet allein das Stylesheet. Ein neuer Effekt braucht
deshalb in der Regel **keine** Zeile JavaScript — nur ein `data-`Attribut im
Markup und eine Regel im CSS.

**Regeln, die dabei gelten:**

1. **Bewegung wird vom Scrollen geführt, nicht von der Zeit.** Zeitgesteuerte
   Animationen gibt es nur beim Seitenaufruf (Hero, Kopfbild, Preloader).
2. **Eine Geste pro Element.** Überschriften werden aufgedeckt *oder* fahren
   ein — nicht beides. Zwei gleichzeitige Bewegungen auf derselben Zeile lesen
   als Effekt, eine liest als Schnitt.
3. **Animiert werden nur `transform` und `opacity`** (plus `clip-path` und
   `mask-size` bei den Aufblenden). Keine Layout-Eigenschaften.
4. **`prefers-reduced-motion` schaltet alles ab.** `main.js` meldet dann gar
   keine Spuren an; die Vorgabewerte in `var(--weg, 0)` ergeben genau die
   ruhige Fassung. Zusätzlich gibt es einen `@media`-Block, der Masken und
   Beschnitte auflöst.
5. **Ohne JavaScript ist alles sichtbar.** `.kein-js` hebt jede Startmaske auf.

### Die eine Falle, die man kennen muss

> **Niemals `clip-path` auf ein Element legen, das der IntersectionObserver
> beobachtet.**

Ein beschnittenes Element hat eine leere Schnittfläche. Der Beobachter meldet
sich nie, das Element bekommt nie `.in` — und bleibt dauerhaft unsichtbar.
Das ist genau einmal passiert und hat sieben Überschriften der Startseite
verschwinden lassen.

Deshalb:

- **Bilder:** Beschnitt liegt auf dem `<picture>` im Inneren, nie auf der
  beobachteten Figur (`.wide-shot`, `.gal__item`).
- **Überschriften:** dort wird mit `mask-size` gearbeitet, nicht mit
  `clip-path`. Eine Maske beschneidet nur die Darstellung, nicht die
  Schnittfläche.

Wer eine neue Aufblende baut, prüft mit einem Blick in die Konsole:

```js
[...document.querySelectorAll('.reveal-up')].filter(e => !e.classList.contains('in'))
```

Nach einmal Durchscrollen muss diese Liste leer sein.

### Die zweite Falle: `aspect-ratio` und das `height`-Attribut

Jedes `<img>` trägt `width`/`height` im Markup — richtig so, das verhindert
Springen beim Laden. Der Browser setzt diese Attribute aber als
Präsentationshinweis in echte `width`/`height`-Werte um, und **ein gesetzter
Wert schlägt `aspect-ratio`.**

Wer im Stylesheet ein Seitenverhältnis vorgibt, muss deshalb `height:auto`
dazuschreiben:

```css
.wide-shot img{ width:100%; height:auto; aspect-ratio:16/9; object-fit:cover; }
```

Ohne die eine Zeile stand das Bildband auf allen sechs Leistungsseiten in
Originalhöhe da — also genau als der bildschirmhohe Block, den die Regel
verhindern sollte. Aufgefallen ist es erst beim Nachmessen im Browser, weil
die Regel im Stylesheet völlig richtig aussah.

Prüfen lässt sich das in einer Zeile:

```js
[...document.images].filter(i => {
  const cs = getComputedStyle(i);
  if (cs.aspectRatio === 'auto') return false;
  const [a, b] = cs.aspectRatio.split('/').map(Number);
  const r = i.getBoundingClientRect();
  return Math.abs(r.width / r.height - a / b) > 0.02;
})
```

### Was wo passiert

| Ort | Bewegung |
|---|---|
| Hero, Kopf der Unterseiten | Bild läuft langsamer mit als der Text (`--weg`) |
| Sechs Bühnen | Kamerafahrt aus `--zoom`, `--detail`, `--panel`, `--door` |
| Bühnen, Rand | Kinobalken und Lichtabfall (`.kino`, über `--kino`) |
| Bühnen, oben links | Kapitelmarke mit Fortschrittslinie (`--kapitel`) |
| Bühnen, rechts | Kapitelrail als Sprungnavigation, baut `main.js` |
| Bühnenende | Abblende auf dem letzten Zehntel |
| Überschriften | Aufblende von oben nach unten (`mask-size`) |
| Bildbänder, Galerie | Aufdecken von unten plus Gegenbewegung des Motivs |
| Einsatzleitung (Sicherheit) | Aufdecken von unten, Beschriftung im selben Rahmen unter dem Foto |

Die Kinobalken überbrücken die feste Navigationsleiste — ihre Höhe misst
`main.js` und legt sie als `--nav-h` ab. Wer an der Navigation etwas ändert,
muss dort nichts nachziehen.

---

## Seitenaufbau

Die Website ist bewusst **mehrseitig**, auch wenn die Startseite lang ist:

```
Start
├── Dienstleistungen (Übersicht)
│   ├── Gastro-Personal
│   ├── Sicherheit
│   ├── Promotion & Hostess
│   ├── Logistik
│   ├── Fahrservice
│   └── Reinigung
├── Team · Galerie · Jobs · Kontakt
└── Impressum · Datenschutz
```

Jeder Punkt der Hauptnavigation führt auf eine **Seite**, nicht auf einen
Abschnitt der Startseite. Das ist der Unterschied zwischen einer
mehrseitigen Website und einer One-Page — und er entsteht in der
Navigation, nicht im Aussehen.

Der Brotkrumenpfad hat dadurch drei Ebenen: `Home / Dienstleistungen /
Sicherheit`.

### Wo welche Tiefe hingehört

Die sechs Bühnen mit der Kamerafahrt standen zuerst auf der Startseite und
machten dort allein knapp 12.500 der 21.000 Pixel aus — sechzig Prozent.
Genau daran las das Team die Seite als One-Page, und zu Recht: eine
Startseite, die den ganzen Betrieb in einem Zug erzählt, *ist* eine.

Deshalb liegen die Ebenen jetzt so:

| Seite | Aufgabe | Länge |
|---|---|---|
| Startseite | zehn abgegrenzte Blöcke, jeder mit einer Aussage | rund 10 Bildschirmhöhen |
| Dienstleistungen | die sechs Bühnen als Kamerafahrt, jede führt weiter | rund 16 |
| Sechs Detailseiten | alles im Einzelnen | je 6 bis 8 |

**Die Bühnen gehören nicht zurück auf die Startseite.** Sie sind dort nicht
zu lang gewesen, sondern am falschen Ort: eine Startseite ordnet und
verweist, die Tiefe steht dahinter. Auf der Startseite vertritt sie das
Kachelraster (`.svc-grid`) — dieselben sechs Bereiche, sechs Klicks, ein
Bildschirm.

**Achtung bei Adressen:** `dienstleistungen.html` liegt neben dem Ordner
`dienstleistungen/`. Die Adresse `/dienstleistungen` ohne Endung ist
deshalb auf jedem Host eine Sonderregel — sie steht in `vercel.json`,
`netlify.toml` und `.htaccess` jeweils **vor** der Regel für die
Unterseiten.

---

## Typografie

- Auszeichnung: Bricolage Grotesque · Fließtext: Instrument Sans ·
  Technisches: Space Mono. Alle drei liegen lokal unter `assets/fonts/`.
- **Versalien nur da, wo sie etwas leisten** (`.u-caps`, Eyebrows,
  Kapitelmarken). Ein ganzer Satz in gesperrten Versalien wird entziffert,
  nicht gelesen.
- Alle Überschriften haben `hyphens:auto` und `overflow-wrap:break-word` —
  ohne das sprengt „Datenschutzerklärung“ ein 320-px-Fenster.
- Knöpfe stehen in der Grundschrift. Schreibmaschinenschrift in Versalien auf
  einem Knopf ist das deutlichste Erkennungszeichen fertiger Dark-Templates.

---

## Der PDF-Beleg

Jede Anfrage und jede Bewerbung wird als PDF ins Postfach zugestellt
(`api/_beleg.js`). Das Blatt ist die einzige Stelle, an der die Marke außerhalb
des Browsers auftritt — es gehört deshalb hierher.

- **Ein dunkles Band mit dem Wortzeichen oben, sonst Weiß.** Das Zeichen liegt
  hell auf durchsichtigem Grund; ohne das Band verschwände es.
- **Helvetica, nicht die Hausschriften.** Die drei Schriften der Website liegen
  als `woff2` vor — ein Format, das kein PDF einbetten kann. Helvetica ist eine
  der 14 Standardschriften, die jeder Betrachter mitbringt, deckt Umlaute und ß
  ab und hält den Anhang bei rund 32 KB. Eine eingebettete Schrift wäre
  hübscher und dreimal so schwer.
- **Beschriftung links leise, Angabe rechts fett.** Wer den Beleg überfliegt,
  sucht die Angabe, nicht ihren Namen.
- **Es geht nichts verloren.** `BAUPLAN` ordnet die bekannten Felder; alles
  Übrige landet unter „Weitere Angaben". Ein neues Feld im Formular erscheint
  dadurch von selbst — auch wenn niemand daran denkt, hier nachzuziehen.
  Ausgenommen sind nur die beiden Honigtöpfe.

### Die Falle: `width` bricht schon Umgebrochenes noch einmal um

Der lange Nachrichtentext wird von Hand umgebrochen — nur so lässt sich die
graue Fläche dahinter auf jeder Seite passend hoch zeichnen. Beim Setzen der
fertigen Zeilen darf dann **kein `width` mehr mitgegeben werden**:

```js
doc.text(zeile, x, y, { lineBreak: false });   // richtig
doc.text(zeile, x, y, { width: b, lineBreak: false });   // falsch
```

pdfkit misst beim Setzen eine Spur breiter als `widthOfString` meldet, hält die
fertige Zeile deshalb für zu lang und zerlegt sie ein zweites Mal — die zweite
Hälfte landet auf der Grundlinie der nächsten Zeile, und der Beleg sieht aus,
als sei er zweimal übereinander gedruckt worden.

Aus demselben Grund wird gegen `innen - 2` umgebrochen, nicht gegen `innen`.

### Die zweite Falle: die Fußzeile legt Seiten an

Die Fußzeile steht unterhalb des Satzspiegels. `doc.text()` hält das für einen
Überlauf und hängt eine neue Seite an — auf der dann wieder eine Fußzeile
steht, und so fort. Vor der Schleife über die Seiten deshalb
`doc.page.margins.bottom = 0` setzen und die Seitenzahl **vorher** merken.

---

## Das Angebot

Der Angebotsbogen (`api/_angebot.js`) ist dem vorhandenen Angebotsformular des
Betriebs nachgebaut — nicht dem Aussehen der Website. Das ist Absicht: ein
Angebot ist ein Geschäftsdokument, kein Werbemittel. Es soll aussehen wie das,
was der Kunde vom selben Absender schon kennt.

Deshalb gelten hier andere Regeln als sonst im Projekt:

- **Weisses Blatt, schwarzes Wortzeichen oben rechts.** Kein dunkles Band wie
  im PDF-Beleg — das Vorbild hat keins. Dafür liegt das Zeichen ein zweites
  Mal in Schwarz bei (`api/_logo_dunkel.js`); die helle Fassung wäre auf
  Weiss unsichtbar.
- **Arial, nicht Helvetica.** In Word ist Arial auf jedem System vorhanden und
  metrisch dasselbe. Helvetica fiele auf Windows still auf etwas anderes
  zurück — dann sähe der Bogen bei jedem Empfänger anders aus.
- **Keine Preise.** Menge, Preis, Rabatt, Betrag und die drei Summen bleiben
  leere Felder, ebenso Angebots- und Kundennummer. Eine gerechnete Zahl sieht
  verbindlich aus, auch wenn sie nur geschätzt war — und der Bogen entsteht,
  ohne dass ein Mensch ihn gesehen hat. Was leer ist, kann nicht falsch sein.

Der stehende Text — Einleitung, die sechs Bedingungen, die Fußzeile mit
Steuer-, Register- und Bankangaben — steht wörtlich in der Konstante `BOGEN`
ganz oben. Eine Änderung dort wirkt auf jedem künftigen Bogen.

### Die Falle: Prozentbreiten in Word

Word und LibreOffice verteilen prozentuale Spaltenbreiten nach Inhalt neu,
sobald die Tabelle auf „autofit" steht. Der erste Entwurf sah im Code richtig
aus und im Dokument falsch: die Beschreibungsspalte schrumpfte auf ein
Viertel, „ANGEBOTSBETRAG" brach mitten im Wort um.

Jede Tabelle braucht deshalb **feste Breiten in Twips** plus
`layout: TableLayoutType.FIXED` und `columnWidths`. A4 ist 11906 Twips breit;
abzüglich zweimal 1000 Rand bleiben 9906 — die Summe jeder Spaltenliste.

Gilt auch für verschachtelte Tabellen: eine Tabelle in einer Tabellenzelle
bezieht Prozentangaben nicht auf die Zelle.

---

## Das Formular

Auf `kontakt.html` stehen sechzehn Felder. Sechzehn Felder in einer Spalte
lesen sich wie ein Antrag; dieselben sechzehn in fünf benannten Gruppen lesen
sich wie vier Fragen — wer sind Sie, was brauchen Sie, wohin die Rechnung, was
noch.

- **Echte `<fieldset>` mit `<legend>`**, keine Überschriften, die nur so
  aussehen. Für einen Screenreader ist das der Unterschied zwischen „Textfeld"
  und „Textfeld, Gruppe Einsatz".
- **Getrennt durch eine Linie, nicht durch Kästen.** Ein Kasten um jede Gruppe
  wäre genau die Baukasten-Anmutung, die die Seite vermeidet.
- **Zwei Spalten am Schreibtisch, eine unterwegs** — dieselbe Grenze wie beim
  übrigen Inhalt (980 px), damit die Spalte neben dem Formular und das
  Formular gleichzeitig umbrechen.
- **Die Paare stehen bewusst nebeneinander:** Dienstleistung/Datum,
  Uhrzeit von/bis, Personen/Ort. Wer die Reihenfolge im Markup ändert, bricht
  diese Paare — das Raster füllt stur von links nach rechts.

Felder, die nur manchmal gebraucht werden, hängen an `data-wenn` /
`data-wenn-wert` am umgebenden `.feld`. Das funktioniert mit Auswahlfeldern
(Wert) und mit Häkchen (Zustand). Ob so ein Feld beim Erscheinen zur
Pflichtangabe wird, entscheidet `data-wenn-pflicht` — nicht das JavaScript.

### Die Falle: `.full` gilt im Raster, nicht im Flex

Die Einwilligungszeile ist ein Flex-Kasten (`.zustimmung`). Eine
Fehlermeldung mit `class="full"` stellt sich dort **neben** das Häkchen statt
darunter und quetscht die Zeile auf drei Wörter Breite. Sie braucht
`width:100%` und der Kasten `flex-wrap:wrap`. Und weil der lange
Einwilligungstext als Ganzes nicht neben das Kästchen passt, braucht das
Label zusätzlich `flex:1 1 0; min-width:0` — sonst springt es unter das
Kästchen, sobald umbrochen werden darf.

---

## Barrierefreiheit

Das ist keine Kür, sondern Teil der Abnahme:

- Farbkontraste nach WCAG auf allen Seiten, auch bei geöffnetem Menü.
- Jeder Link und jeder Knopf hat einen zugänglichen Namen.
- Kein waagerechter Überlauf bei 320, 390, 768, 1280 und 1440 px.
- Betrieb ohne JavaScript und bei reduzierter Bewegung.

---

## Was bewusst fehlt

Keine Cookies, kein Tracking, keine externen Schriften, keine
Social-Media-Plugins, keine Analyse-Werkzeuge. Deshalb braucht die Seite kein
Cookie-Banner. Wer daran etwas ändert, muss die Datenschutzerklärung nachziehen.
