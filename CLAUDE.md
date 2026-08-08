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
- **Der Grund ist echtes Schwarz** (`--ink: #000000`). Nicht #08080A, nicht
  „fast schwarz". Auf einem OLED-Bildschirm schaltet #000 die Pixel ab: ein
  angeschnittenes Foto hat dann keinen Rand mehr, an dem es aufhört. Genau
  davon lebt der Auftritt.
- **Fotos tragen die Seite.** Wo ein Bild die Aussage trägt, braucht es keine
  Grafik, keinen Farbverlauf und keinen Leuchteffekt daneben. Bilder laufen
  im Zweifel bis an die Fensterkante, nicht bis zum Satzspiegel.
- **95 % schwarzweiß, 5 % Marke.** Lila (`--violet`, `--orchid`) markiert und
  trägt nicht: aktiver Menüpunkt, Hover auf einer Kontaktangabe, ein Punkt
  von vier Pixeln. Wer daraus eine Fläche macht, kippt den ganzen Auftritt
  ins Templatehafte.
- **Keine Karten.** Kein Rahmen, kein eigener Grund, keine runde Ecke um
  einen Inhalt herum. Getrennt wird durch Haarlinien und Abstand. `--r-m`
  steht deshalb auf 0.
- **Keine Pillen.** Eine Aktion ist ein Textlink mit einer Linie darunter,
  die beim Ansteuern durchläuft (`.btn`). Die einzige Ausnahme ist der
  Absendeknopf eines Formulars — er ist groß und hat Linien oben und unten,
  aber auch er hat keine Fläche im Ruhezustand.
- **Keine Dauerbewegung.** Nichts pulsiert, nichts wandert von allein.
- **Nicht alles auf die Mittelachse.** Überschriften stehen links, Text sitzt
  unten links im Bild, die sechs Szenen der Startseite wechseln die Seite.
  Zentrierter Satz stellt nichts in ein Verhältnis.
- **Keine Zeichen vor dem Text.** Kein Strich vor der Auszeichnungszeile, kein
  Punkt vor dem Merkmal, keine Nummer vor dem Menüpunkt, kein Gedankenstrich
  zwischen Nummer und Name. Was trennt, ist der Abstand. Ein Zeichen davor ist
  eine zweite Aussage über etwas, das für sich stehen kann — und in der Menge
  liest es als Zierrat.
- **Keine Silbentrennung.** `hyphens:auto` setzt am Zeilenende einen
  Trennstrich; in Display-Größe ist der so breit wie ein Gestaltungselement.
  `overflow-wrap:break-word` bleibt als Notnagel — es bricht ohne Strich und
  greift nur, wenn ein Wort wirklich nicht in die Zeile passt.

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

### Die Kehrseite: eine Maske ist so groß wie ihr Kasten

Die Maske löst die Beobachter-Falle — dafür hat sie eine eigene. Sie deckt
genau den **Rahmenkasten** ab, und der ist bei einem Durchschuss unter etwa
1,25 kleiner als die Schrift darin. Alles, was oben oder unten heraussteht,
fällt weg: Umlautpunkte und Unterlängen. Auf Deutsch heißt das, dass
ausgerechnet Ä, Ö und Ü ihre Punkte verlieren — im Hero fehlten sie bei
„TRÄGT.", in einer Zwischenüberschrift bei „SO LÄUFT".

**Was nicht hilft:** die Maske über den Kasten hinausschieben.
`mask-position` und `mask-size` wirken zwar, aber `mask-clip` begrenzt die
bemalte Fläche weiter auf den Rahmenkasten. Der dafür vorgesehene Wert
`no-clip` wird von Chromium als gültig gemeldet und ändert nichts —
nachgemessen mit drei Varianten (mit, ohne, und mit `padding`).

**Was hilft, ist nur ein größerer Kasten.** Je nachdem, womit beschnitten
wird:

- **Maske** (`h1/h2/h3.reveal-up`): `padding-block:.14em`. Bewusst ohne
  Ausgleich durch einen negativen Außenabstand — diese Regel steht weit
  unten im Stylesheet und würde bei gleicher Spezifität die
  Abstandsangaben der einzelnen Abschnitte überschreiben.
- **`overflow:hidden`** (die Zeilen im Hero, auf den Unterseiten und im
  Fuß): dort bekommt die maskierte Zeile einen Durchschuss, in den die
  Schrift wirklich hineinpasst (`--zeile-weit:1.26`), und die optische Enge
  kommt über einen negativen Abstand **zwischen** den Zeilen zurück
  (`--zeile-eng:.96`). Die Maske schneidet dann nur noch Luft.

Nachmessen lässt sich das nur im Bild, nicht im DOM: dieselbe Stelle einmal
mit und einmal ohne Maske aufnehmen und die beiden Aufnahmen vergleichen.
Wichtig dabei, sonst misst man Unsinn:

- Erst **nach** der Aufblende die Maske abschalten, sonst vergleicht man
  einen fertigen mit einem nie gestarteten Zustand.
- **Nur das geprüfte Element** entmasken. Ein globales `overflow:visible`
  nimmt auch `body{overflow-x:hidden}` weg; dann erscheint ein Rollbalken,
  die Zeile bricht anders um, und man vergleicht zwei Layouts.
- Bei `overflow` statt Maske gibt es keinen layoutneutralen Weg — dort hilft
  nur Hinsehen.

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
| Hero, Titelzeilen | Jede Zeile fährt aus ihrer eigenen Maske nach oben (`.line`) |
| Sechs Szenen der Startseite | Ken Burns: Foto von 1,12 auf 1,0 über die ganze Vorbeifahrt (`--lauf`) |
| Sechs Bühnen (`dienstleistungen.html`) | Kamerafahrt aus `--zoom`, `--detail`, `--panel`, `--door` |
| Bühnen, Rand | Kinobalken und Lichtabfall (`.kino`, über `--kino`) |
| Bühnen, oben links | Kapitelmarke mit Fortschrittslinie (`--kapitel`) |
| Bühnen, rechts | Kapitelrail als Sprungnavigation, baut `main.js` |
| Bühnenende | Abblende auf dem letzten Zehntel |
| Überschriften | Aufblende von oben nach unten (`mask-size`) |
| Bildbänder, Galerie | Aufdecken von unten plus Gegenbewegung des Motivs |
| Fußzeile | Schlusszeile fährt zeilenweise auf (`.foot__claim`, gleiche Technik wie der Hero) |
| Einsatzleitung (Sicherheit) | Aufdecken von unten, Beschriftung im selben Rahmen unter dem Foto |
| Zeiger (nur Maus) | Ring läuft nach, wird über Links größer, zeigt über Bildern „Ansehen" |

Die Kinobalken überbrücken die feste Navigationsleiste — ihre Höhe misst
`main.js` und legt sie als `--nav-h` ab. Wer an der Navigation etwas ändert,
muss dort nichts nachziehen.

### Der Zeiger ersetzt den Systemzeiger nicht

Der Ring (`.zeiger`) begleitet die Maus, er tritt nicht an ihre Stelle. Viele
Auftritte dieser Machart blenden den Systemzeiger aus — das nimmt allen die
Einstellung weg, die ihn vergrößert, invertiert oder auf hohen Kontrast
gestellt haben. Auf einer Seite, deren Ziel eine Anfrage ist, ist das ein
schlechtes Geschäft. Er wird außerdem nur angelegt, wenn
`(hover:hover) and (pointer:fine)` zutrifft und keine reduzierte Bewegung
gewünscht ist.

### Die dritte Falle: `animation:none` holt keinen Startwert zurück

Der `prefers-reduced-motion`-Block setzt `*{ animation:none !important }`.
Was seine Sichtbarkeit einer Einblendung verdankt — `opacity:0` plus
`animation:fadeIn … forwards` —, bleibt dadurch **unsichtbar**: die Animation
ist weg, der Startwert bleibt.

Das ist genau einmal passiert und hat den Vorspann im Hero verschwinden
lassen. Jede solche Stelle muss im Block einzeln zurückgeholt werden:

```css
@media (prefers-reduced-motion:reduce){
  .hero__sub, .hero__actions, .scrollcue > *, .pre-logo__img{ opacity:1; transform:none; }
}
```

Dasselbe gilt für scroll-geführte Werte: ohne Motor bleibt `--lauf` auf 0
stehen, und `scale(calc(1.12 - var(--lauf,0) * .12))` ergibt dann dauerhaft
1,12 — den Anfangszustand einer Fahrt, die gar nicht stattfindet. Auch das
wird im selben Block auf `transform:none` gesetzt.

Nachprüfen lässt sich beides mit einem zweiten Kontext im Browser
(`reducedMotion: 'reduce'`) und der Frage, ob irgendein Textelement auf
`opacity < 0.05` steht.

### Die vierte Falle: `animation … forwards` schlägt jede normale Regel

Der Scrollhinweis im Hero sollte beim Laden einblenden *und* beim Scrollen
wieder verschwinden — beides über `opacity`. Das geht nicht: eine Animation
mit `forwards` hält ihren Endwert fest und gewinnt gegen jede gewöhnliche
Deklaration. Der Hinweis blieb stehen.

Die Lösung ist banal, muss einem aber einfallen: **die beiden Bewegungen auf
zwei Elemente legen.** Die Einblendung liegt auf den Kindern
(`.scrollcue > *`), die Ausblendung beim Scrollen auf der Hülle
(`.hero[data-weg] .scrollcue`).

---

## Der Seitenrand

Alles, was den Seitenrand hält, trägt `.wrap`. Die Klasse setzt genau zwei
Dinge: eine Höchstbreite und `padding-inline:clamp(20px,5vw,64px)`. Dass jeder
Block auf jeder Seite denselben Abstand zur Kante hat, hängt allein daran.

### Die Falle: die Kurzschreibweise `padding` löscht `.wrap`

Ein Element trägt oft beide Klassen gleichzeitig — `class="wrap trust__grid"`.
Schreibt die zweite Regel dann

```css
.trust__grid{ padding:clamp(24px,3.2vw,40px) 0; }   /* falsch */
```

setzt die Kurzschreibweise **alle vier** Kanten, also auch links und rechts —
und macht damit den Seitenrand zunichte, den `.wrap` gerade gesetzt hat. Der
Block klebt an beiden Kanten, während der Rest der Seite Luft hat. Richtig ist:

```css
.trust__grid{ padding-block:clamp(24px,3.2vw,40px); }   /* richtig */
```

Genau das ist zweimal passiert: bei der Vertrauensleiste der Startseite und
bei der Blätternavigation am Fuß der sechs Leistungsseiten. Aufgefallen ist es
erst an einem Handy-Bildschirmfoto — auf breiten Fenstern sieht ein fehlender
Rand nach Absicht aus.

Nachmessen lässt sich das über alle Seiten in einer Schleife:

```js
const soll = Math.min(Math.max(20, innerWidth * 0.05), 64);
[...document.querySelectorAll('.wrap')].filter(e => {
  const cs = getComputedStyle(e);
  return Math.abs(parseFloat(cs.paddingLeft)  - soll) > 1
      || Math.abs(parseFloat(cs.paddingRight) - soll) > 1;
});
```

Nach dem Laden muss diese Liste auf jeder Seite und in jeder Fensterbreite
leer sein.

### Die zweite Falle: `footer` ist nicht nur der Seitenfuß

`<footer>` ist ein ganz gewöhnliches Element und darf überall stehen. Auf der
Startseite steht eines davon **im `<blockquote>`** des großen Zitats — dort
gehört die Quellenangabe hin. Eine Regel

```css
footer{ border-top:1px solid var(--line); padding:110px 0 48px; }   /* falsch */
```

traf deshalb auch sie: unter dem Zitat von Tim Mälzer stand eine Trennlinie
und 110 px Luft, bevor sein Name kam. Richtig ist `body > footer`. Dasselbe
gilt für `footer h2`, `footer ul` und `footer .brand__logo`.

Das ist der allgemeinere Punkt hinter beiden Fallen dieses Abschnitts: ein
Selektor, der nur einen Ort meint, muss auch nur diesen Ort treffen.

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
| Startseite | abgegrenzte Blöcke, jeder mit einer Aussage, plus sechs Szenen als Verweis | rund 14 Bildschirmhöhen |
| Dienstleistungen | die sechs Bühnen als Kamerafahrt, jede führt weiter | rund 15 |
| Sechs Detailseiten | alles im Einzelnen | je 7 bis 8 |

**Die Bühnen gehören nicht zurück auf die Startseite.** Sie sind dort nicht
zu lang gewesen, sondern am falschen Ort: eine Startseite ordnet und
verweist, die Tiefe steht dahinter.

### Szene ≠ Bühne

Auf der Startseite steht seit dem Redesign an dieser Stelle **kein
Kachelraster mehr**, sondern sechs **Szenen** (`.svc`) — jede eine randlose
Fläche von rund 76 svh mit Foto, Nummer und einer sehr großen Zeile. Der
Unterschied zu den Bühnen auf `dienstleistungen.html` ist der Punkt:

|  | Szene (Startseite) | Bühne (Dienstleistungen) |
|---|---|---|
| Höhe | ~0,8 Bildschirmhöhen | 2,3 Bildschirmhöhen, sticky |
| Bewegung | eine Kamerafahrt beim Vorbeiscrollen (`--lauf`) | Zoom, Detailwechsel, Tor, Panel (`--kapitel`) |
| Inhalt | Name, ein Satz, ein Link | ganze Leistungsbeschreibung |
| Aufgabe | verweisen | erzählen |

Eine Szene kostet also gut ein Achtel dessen, was eine Bühne kostet, und
verweist trotzdem mit vollem Gewicht. Genau deshalb ist die Startseite
weiterhin keine One-Page: **jede Szene ist ein Link auf ihre eigene
Unterseite**, dieselben sechs Adressen wie vorher. Wer die Szenen zu Bühnen
ausbaut, macht aus der Startseite wieder das, was das Team schon einmal
zu Recht bemängelt hat.

**Achtung bei Adressen:** `dienstleistungen.html` liegt neben dem Ordner
`dienstleistungen/`. Die Adresse `/dienstleistungen` ohne Endung ist
deshalb auf jedem Host eine Sonderregel — sie steht in `vercel.json`,
`netlify.toml` und `.htaccess` jeweils **vor** der Regel für die
Unterseiten.

---

## Typografie

- Auszeichnung: Bricolage Grotesque · Fließtext: Instrument Sans ·
  Technisches: Space Mono. Alle drei liegen lokal unter `assets/fonts/`.
- **Fünf Stufen, sonst nichts:** `--fs-mega` (Hero, Szenentitel, Schluss,
  Fußzeile), `--fs-display` (Titel der Unterseiten), `--fs-h2`, `--fs-h3`,
  `--fs-h4`. Wer eine sechste clamp-Formel schreibt, hat eine Stufe zu viel.
- **`--fs-mega` ist keine Schriftgröße, sondern eine Fläche.** Eine Zeile
  über die halbe Fensterbreite wird nicht gelesen, sie wird gesehen. Sie
  steht deshalb nur dort, wo eine Aussage den ganzen Bildschirm tragen darf,
  und immer mit `line-height` um 0,9 — die Zeilen müssen einander berühren.
- **Versalien nur da, wo sie etwas leisten** (`.u-caps`, Eyebrows,
  Kapitelmarken, Szenentitel). Ein ganzer Satz in gesperrten Versalien wird
  entziffert, nicht gelesen.
- Alle Überschriften haben `hyphens:auto` und `overflow-wrap:break-word` —
  ohne das sprengt „Datenschutzerklärung“ ein 320-px-Fenster.
- **`max-width` in `ch` bricht Versalien mitten im Wort.** `ch` ist die
  Breite der Null; Versalien der Display-Schrift sind deutlich breiter. Mit
  `max-width:15ch` stand auf der Sicherheitsseite
  „VERANSTALTUNGSSC / HUTZ“. Große Überschriften bekommen deshalb keine
  Höchstbreite — der Satzspiegel begrenzt, `text-wrap:balance` verteilt.
- Knöpfe stehen in der Grundschrift. Schreibmaschinenschrift in Versalien auf
  einem Knopf ist das deutlichste Erkennungszeichen fertiger Dark-Templates.
  In der Kopfzeile ist sie dagegen richtig: dort sind es Wegmarken, keine
  Sätze.

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

### Die zweite Falle: der Zellenrand schlägt den Tabellenrand

Ein Rahmen, der der **Tabelle** gegeben wird, ist nur eine Vorgabe. Setzt die
**Zelle** an derselben Kante `BorderStyle.NONE`, gewinnt die Zelle. Die Kästen
um Positionstabelle und Summen hatten deshalb nur die waagerechten Linien —
oben, links und rechts fehlten sie, obwohl sie an der Tabelle standen.

Deshalb setzt `rand({oben, unten, links, rechts})` die Kanten an jeder Zelle
einzeln: Außenkante nur bei der ersten und letzten Spalte, Oberkante nur in
der ersten Zeile.

### Die dritte Falle: die Zeile ist so hoch wie ihre höchste Zelle

Der senkrechte Abstand unter dem Kopf wurde zunächst vom Wort „ANGEBOT"
gemessen. Die Kopfzeile ist aber so hoch wie das Wortzeichen daneben — und
das reicht deutlich tiefer. Aus einem Millimeter Luft wurden dadurch zwölf,
und alles darunter rutschte mit.

Wer Abstände am Vorbild abmisst, misst deshalb ab der **Unterkante der
Zeile**, nicht ab der Unterkante des Textes darin.

### Die vierte Falle: einfache Betrachter rechnen Tabellen klein

Word und LibreOffice setzen einen freistehenden Absatz und denselben Absatz
in einer Tabelle gleich. Die Vorschau auf dem iPhone tut das nicht: sie
rechnet Tabellen auf die Bildschirmbreite herunter und lässt freistehende
Absätze in Lesegröße stehen. Auf einem Blatt, das beides mischt, steht die
halbe Seite winzig und die andere riesig — und genau so kam der erste Bogen
beim Betrieb an.

Deshalb steht auf dem Angebotsbogen **alles** in Tabellen derselben Breite,
auch das, was wie ein einfacher Absatz aussieht (`alsZeile()`). Und deshalb
liegt derselbe Bogen zusätzlich als PDF bei: ein PDF sieht überall gleich
aus.

### Wie nachgemessen wird

Die Maße im Kopf von `_angebot.js` sind keine Schätzung. Der vorhandene Bogen
ist 1273 px breit bei 210 mm, also 9,35 Twips je Pixel. Zum Vergleichen:

```bash
# Bogen bauen, nach PDF wandeln, auf Vorbildbreite rendern
soffice --headless --convert-to pdf Angebot.docx
# dann beide Bilder nebeneinanderlegen und die Zeilenkanten messen
```

Die Kontrolle ist ein Streifenbild aus beiden Blättern: was gleich hoch und
gleich breit steht, stimmt.

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
- **Ein Feld ist eine Schreiblinie, kein Kasten.** Kein Grund, kein Rahmen
  ringsum, nur `border-bottom`. Sechzehn Kästen untereinander sind das Bild
  eines Antrags; sechzehn Linien sind ein gesetzter Bogen. Der Fokuszustand
  liegt auf `box-shadow:0 1px 0 0 #FFF` und nicht auf einer dickeren Linie —
  ein Pixel mehr Rahmen würde die ganze Spalte beim Hineinklicken um einen
  Pixel verschieben.
- **Die Beschriftung ist wichtiger als das Feld.** Sie steht über der Linie
  und wird beim Hineinklicken hell (`.feld:focus-within > label`).

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

### Die zweite Falle: die `<legend>` schneidet ein Loch in den Rahmen

Die fünf Gruppen werden durch eine Linie getrennt. Steht diese Linie als
`border-top` am `<fieldset>`, passiert Folgendes: der Browser setzt die
`<legend>` **in** den Rahmen und schneidet dafür eine Lücke hinein. Die
Gruppenüberschrift stand dadurch mitten auf der Trennlinie, und rechts von
ihr lief die Linie weiter — es sah aus wie ein Fehler, und es war einer.

Die Linie gehört deshalb an ein Pseudoelement, nicht an den Rahmen:

```css
.fgruppe + .fgruppe{ position:relative; padding-top:…; }        /* richtig */
.fgruppe + .fgruppe::before{ content:""; position:absolute; top:0; left:0; right:0; height:1px; background:var(--line); }
```

---

## Die App-Ansicht

Am Schreibtisch liest man eine Website, am Telefon bedient man sie. Die kleine
Ansicht ist deshalb keine verkleinerte Fassung der großen, sondern ein eigenes
Bedienbild. Alles davon steht im Abschnitt `APP-ANSICHT` in `styles.css` und
greift nur unterhalb von 900 px.

**Die Leiste unten** (`.appleiste`) hält die vier Wege, die jemand am Telefon
wirklich geht: Start · Leistungen · Jobs · Anfrage. Sie liegt dort, wo der
Daumen ohnehin ist. Das Vollbildmenü oben bleibt für alles Übrige — Team,
Galerie, Referenzen, Impressum.

- Der Reiter der aktuellen Seite trägt `aria-current="page"`; daran hängt der
  Strich in der Markenfarbe. Die sechs Detailseiten zählen zu „Leistungen".
- **Ein Tipp auf den aktiven Reiter lädt nicht neu, sondern springt nach
  oben.** Genau das erwartet man in einer Anwendung, und auf einer Seite von
  dreizehn Bildschirmhöhen ist es der häufigste Wunsch.
- `body` bekommt `padding-bottom` in Höhe der Leiste, sonst verdeckt sie den
  Fuß. Der Knopf „Nach oben" rückt darüber.

**Ablegen auf dem Startbildschirm.** `site.webmanifest` im Wurzelverzeichnis
macht die Seite installierbar: schwarzer Grund, das Wortzeichen als Symbol,
`display:standalone`. Die Symbole liegen unter `assets/logo/app-icon-*.png`
und sind aus dem vorhandenen Logo gerechnet — die maskierbare Fassung hat
20 % Luft ringsum, weil Android frei geformt ausschneidet.

Abgelegt fällt zweierlei weg, was nur im Browser Sinn ergibt: das Gummiband
am Seitenende (`overscroll-behavior-y:none`) und der Vorspann — eine
Anwendung, die man mehrmals täglich öffnet, darf keine Einblendung haben.

### Die Falle: die Systemleisten nehmen sich den Platz

Auf dem iPhone liegt oben die Uhr und unten der Balken für die Heimgeste.
Mit `apple-mobile-web-app-status-bar-style: black-translucent` läuft die Seite
unter beide — was für das Foto im Hero richtig ist und für die Kopfzeile
falsch. Beide Ränder holen sich den Platz deshalb selbst zurück:

```css
header.nav{ padding-top:calc(… + env(safe-area-inset-top, 0px)); }
.appleiste{ padding-bottom:env(safe-area-inset-bottom, 0px); }
```

Ohne die zweite Zeile stehen die Beschriftungen der Leiste unter dem Balken.
Im Browser sind beide Werte 0, die Regel kostet dort also nichts.

---

## Barrierefreiheit

Das ist keine Kür, sondern Teil der Abnahme:

- Farbkontraste nach WCAG auf allen Seiten, auch bei geöffnetem Menü.
  `--muted` steht auf `rgba(255,255,255,.52)`; bei `.46` lag der Kontrast
  gegen Schwarz bei 4,56:1 und damit nur um sechs Hundertstel über der
  Grenze — ein Wert, der gerade eben besteht, besteht beim nächsten Eingriff
  nicht mehr.
- Jeder Link und jeder Knopf hat einen zugänglichen Namen.
- **Trefferflächen ab 44 px, auch wo die Schrift klein ist.** Vergrößert wird
  die Fläche, nicht die Schrift: ein unsichtbares `::after` über dem Link
  (siehe den Block ganz unten in `styles.css`). Im Vollbildmenü und im Fuß
  gilt das für Telefonnummer und Netzwerk-Zeichen.
- Kein waagerechter Überlauf bei 320, 390, 768, 1280 und 1440 px.
- Betrieb ohne JavaScript und bei reduzierter Bewegung.
- Der Systemzeiger wird nie ausgeblendet (siehe „Der Zeiger ersetzt den
  Systemzeiger nicht").

---

## Was bewusst fehlt

Keine Cookies, kein Tracking, keine externen Schriften, keine
Social-Media-Plugins, keine Analyse-Werkzeuge. Deshalb braucht die Seite kein
Cookie-Banner. Wer daran etwas ändert, muss die Datenschutzerklärung nachziehen.
