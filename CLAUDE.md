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
- **Kein Gedankenstrich im Satz.** Wo einer stand, steht jetzt ein Komma,
  ein Doppelpunkt oder nichts. Kein Wort wurde dafür geändert; das erledigt
  `tools/striche-ersetzen.py` und es ist mehrfach ausführbar. Stehen bleiben
  nur Bereichsangaben (`12–14`, `Mo–Fr`, `8–18 Uhr`), Bindestriche in
  Wörtern (`Gastro-Personal`, `Auf- und Abbau`) und die Trennung in `<title>`
  — die steht im Reiter des Browsers, nicht auf der Seite.
- **Unterstrichen heißt: hier geht es weiter.** Eine Linie unter einem
  kurzen Eintrag liest im Netz als Link. Wo nichts dahintersteckt, darf
  deshalb keine Linie stehen — die Aufzählungen der Leistungsseiten
  (`.einsaetze`, `.erwartungen`) trennen durch Abstand. Eine Linie über die
  **volle Breite** zwischen zwei Blöcken ist etwas anderes: das ist ein
  Trenner, kein Unterstrich, und der bleibt (Stellenliste, Abschnittskanten).

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

### Die teuerste Falle: `will-change` auf Vorrat

`will-change:transform` sagt dem Browser: *lege dieses Element als eigene
Ebene an und halte sie bereit.* Für die eine Fläche, die sich gerade bewegt,
ist das richtig — und es ist messbar richtig: ohne `will-change` steigt die
Rasterarbeit einer Durchfahrt durch `dienstleistungen.html` von 907 auf
2296 ms.

Für **alle sechs Bühnen gleichzeitig** ist es dagegen das Gegenteil. Jede
Bühne hält zwei bildschirmfüllende Fotos übereinander; auf einem 1440er
Bildschirm mit doppelter Pixeldichte ist eine solche Ebene rund 20 MB groß.
Zwölf davon sind über 200 MB, die dauerhaft im Grafikspeicher liegen sollen.
Der Compositor wirft dann Kacheln weg und legt sie beim Zurückscrollen neu
an — und genau das sieht man als Ruckeln.

Deshalb steht vor **jedem** `will-change` einer Bühne oder Szene die Klasse
`.live`, die `main.js` beim Scrollen setzt:

```css
.scene{ transform:scale(var(--zoom,1)); }        /* keine Ebene */
.stage.live .scene{ will-change:transform; }     /* Ebene nur, solange sichtbar */
```

Wer eine neue Fahrt baut, macht es genauso. Und wer im `@media`-Block für
das Telefon etwas davon zurücknehmen will, muss die Spezifität mitnehmen:
`.scene{…}` allein verliert gegen `.stage.live .scene{…}`.

Gemessen wird das nicht an der Bildrate — die schwankt zu stark —, sondern
an der Arbeit. `scratchpad/arbeit.js` summiert über eine Durchfahrt die
Zeiten aus dem Tracing (Stil, Layout, Malen, Rastern). Der Unterschied
zwischen zwei Fassungen ist dort stabil ablesbar, die Bildabstände sind es
nicht.

### Erst messen, dann schreiben

Der Scroll-Motor las früher pro Schleife die Rechtecke, schrieb seine Werte,
und die nächste Schleife las wieder. Jedes Schreiben macht das Layout
ungültig, jedes folgende Lesen erzwingt es neu. `messen()` sammelt deshalb
alle Rechtecke in einem Zug, erst danach schreiben `updateStages()`,
`updateMotion()` und `updateKino()`. Wer eine vierte Schleife dazunimmt,
hängt ihre Messung mit in `messen()` — nicht in die eigene Schleife.

### Der Einstieg ist eine Bewegung, nicht zwei

Vorspann und Hero liefen früher unabhängig voneinander: der Vorspann blendete
aus, und die Einfahrt des Heros war zu diesem Zeitpunkt längst vorbei — sie
startete beim Laden der Seite. Man sah zwei Schritte statt einer Fahrt.

Beides hängt jetzt an einer Klasse auf `<html>`:

| Klasse | wann | was |
|---|---|---|
| `vorspann` | erster Aufruf, keine reduzierte Bewegung | Hero wartet |
| `los` | sobald der Vorspann abgeht (oder sofort) | alle Einfahrten starten |

Die Entscheidung fällt im **Inline-Skript im Kopf** von `index.html`, nicht in
`main.js`. Stünde sie am Seitenende, liefe die Einfahrt schon, bevor die
Klasse gesetzt ist — und man sähe ein Aufblitzen.

Wer eine weitere Einfahrt dazunimmt, hängt sie an `.los` und trägt sie in den
`.kein-js`-Block ein. Ohne Skript wird `los` nie gesetzt; was daran hängt,
bliebe sonst unsichtbar.

### Die Falle: ein Vorspann, der sich nicht wegnehmen lässt

`#preloader` ist eine deckende schwarze Fläche über der ganzen Seite. Sie
verschwindet, wenn `main.js` ihr `.done` gibt. Ohne JavaScript passiert das
nie — dann steht das Wortzeichen auf Schwarz und **die Website ist nicht
erreichbar**. Genau das war monatelang der Fall.

```css
.kein-js #preloader{ display:none; }
```

Der bisherige Test hat es nicht gefunden, weil er unsichtbare Elemente zählt:
Was *darunter* liegt, hat weiterhin `opacity:1`. Deshalb gibt es jetzt
`scratchpad/verdeckt.js` — er fragt mit `elementFromPoint`, was an der Stelle
der Überschrift wirklich ganz oben liegt, und zwar in allen drei Lagen
(normal, ohne JavaScript, reduzierte Bewegung).

Die Regel dahinter gilt für jede Überlagerung: **Was eine Seite verdeckt, muss
sich ohne die Technik wegnehmen lassen, die es aufgebaut hat.**

### Die Falle: `position:sticky` braucht einen Weg

Die linke Spalte des Intros bleibt beim Scrollen stehen, während rechts Text
und Foto weiterlaufen. Beim ersten Versuch tat sie nichts — `position:sticky`
stand da, wirkte aber nicht.

Der Grund ist keine fehlende Eigenschaft, sondern fehlender Platz: die linke
Spalte war mit 615 px **höher** als die rechte mit 524 px. Die Rasterzeile ist
so hoch wie ihre höchste Zelle; das klebende Element füllte sie damit ganz aus
und hatte keinen Weg, den es zurücklegen konnte.

Zwei Bedingungen müssen deshalb zusammenkommen:

1. `align-items:start` am Raster — bei `stretch` ist jede Zelle so hoch wie
   die Zeile, und ein Kind, das die ganze Höhe füllt, kann nirgends kleben.
2. Die klebende Spalte muss **kürzer** sein als die andere. Dafür ist das Foto
   aus der linken in die rechte Spalte gewandert.

Nachmessen lässt sich das in einer Zeile: klebt es wirklich, bleibt `top`
konstant, während die andere Spalte weiterwandert.

### Wort für Wort

`[data-worte]` zerlegt `main.js` in `<span class="wort">`; jedes Wort bekommt
seinen Index als `--n`, die Zeile ihre Anzahl als `--anz`. Daraus rechnet das
Stylesheet einen eigenen Fortschritt je Wort aus `--lauf`.

- **Kein `overflow:hidden` um ein Wort.** Eine Maske schneidet genau die
  Umlautpunkte und Unterlängen ab, die in „TRÄGT." schon einmal gefehlt
  haben. Das Wort hebt sich stattdessen aus der Tiefe: von unten, aus der
  Unschärfe in die Schärfe.
- **Die Leerzeichen bleiben echte Textknoten.** Ohne sie liest ein
  Vorlesewerkzeug die Zeile ohne Pausen, und markierter Text lässt sich nicht
  mehr sinnvoll kopieren.
- **Der Vorgabewert von `--lauf` ist 1, nicht 0.** Ohne Motor (reduzierte
  Bewegung, kein JavaScript) steht die Zeile damit vollständig da.
- Die Unschärfe kostet gemessen 137 ms je Durchfahrt, rund 14 % der ganzen
  Arbeit. Sie steht deshalb nur am Schreibtisch und nur an zwei Zeilen.
  `filter` ist die teuerste der drei Eigenschaften; an einer Seite voller
  Absätze wäre sie nicht zu bezahlen.

### Warum hier kein GSAP und kein Lenis steht

Der Auftrag nannte GSAP, ScrollTrigger und Lenis — mit dem Zusatz „falls mit
dem bestehenden Tech-Stack kompatibel" und „vermeide unnötig schwere
Libraries". Beides zusammen ergibt hier ein Nein:

- Der Motor, der dafür da wäre, existiert bereits: eine `requestAnimationFrame`-
  Schleife, die drei Zahlen schreibt, und ein Stylesheet, das daraus die
  Bewegung macht. GSAP würde ihn nicht ergänzen, sondern ersetzen — und mit
  ihm die gesamte gemessene Arbeit von vorn beginnen lassen.
- Die Seite lädt **nichts** von fremden Servern. Keine Schriften, keine
  Skripte, kein Tracking. Deshalb braucht sie kein Cookie-Banner. Ein CDN-
  Skript wäre die erste Ausnahme, und sie stünde in der
  Datenschutzerklärung.
- Lenis ersetzt das Scrollen des Browsers durch eigenes. Auf einer Seite, die
  zweimal wegen Ruckelns beanstandet wurde, ist das genau das falsche Werkzeug:
  es macht jede Bildwiederholung von JavaScript abhängig, statt von der
  Bildlaufsteuerung des Systems.

Gemessen liegt die Seite bei 60 Bildern je Sekunde im Median. Was die
Bibliotheken leisten würden, leistet der vorhandene Motor bereits.

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
- **Der Zeilenabstand großer Überschriften ist nach unten begrenzt — durch
  die Umlaute.** Die Punkte auf einem Ä stehen bis rund 0,95 em über der
  Grundlinie; die Grundlinie der Zeile darüber liegt genau einen
  Zeilenabstand höher. Bei 0,9 liegt der Umlaut damit *über* der vorherigen
  Grundlinie: die Punkte in „TRÄGT." saßen im „EVENT" darüber und lasen sich
  wie ein Satzfehler. `--zeile-eng` steht deshalb auf **1.04** — enger geht
  es in dieser Schrift nicht. Wer den Wert senkt, muss eine Zeile mit Ä, Ö
  oder Ü unter einer anderen Zeile ansehen, nicht nur die Zahl.
- Knöpfe stehen in der Grundschrift. Schreibmaschinenschrift in Versalien auf
  einem Knopf ist das deutlichste Erkennungszeichen fertiger Dark-Templates.
  In der Kopfzeile ist sie dagegen richtig: dort sind es Wegmarken, keine
  Sätze.

---

## Die Bilder

Die Seite lebt von randlosen Fotos. Ein randloses Foto hat aber keine feste
Größe — es ist so groß wie das Fenster, mal Gerätepixelverhältnis, mal
Kamerafahrt. Deshalb liegt jedes großflächige Motiv in **zwei Stufen** vor:

```
gastro.webp        1600 px   Telefon, Tablet, Rückfallebene
gastro-gross.webp  3464 px   Schreibtisch und Retina
```

Welche geholt wird, entscheidet der Browser aus der Kandidatenliste:

```html
<source type="image/webp"
        srcset="assets/img/gastro.webp 1600w, assets/img/gastro-gross.webp 3464w"
        sizes="(max-width:980px) 100vw, 142vw" />
```

Die große Stufe erzeugt `tools/bilder-vergroessern.py`, eingehängt wird sie
von `tools/bilder-einhaengen.py`. Beide sind mehrfach ausführbar; das zweite
meldet dann null Änderungen.

**Was das leistet und was nicht.** Hochrechnen erzeugt keine Bilddetails. Es
verlagert nur die Arbeit: einmal hier mit Lanczos und gemessener
Nachschärfung statt bei jedem Aufruf im Browser mit dem einfachsten Filter,
den es gibt. Gemessen am mittleren Gradientenbetrag sind das rund 30 % mehr
Kantenschärfe (2,80 → 3,65). Wirklich hochauflösend wird die Seite erst mit
Material in 2400 px, so wie `docs/foto-briefing.md` es verlangt.

### Die Obergrenze kommt nicht von der Dateigröße, sondern vom Rastern

Die erste Fassung dieser zweiten Stufe ging bis 3464 px — genau so viel, wie
die Messung anforderte. Danach ruckelte `dienstleistungen.html` sichtbar.
Gemessen über eine ganze Durchfahrt (`scratchpad/arbeit.js`, Summe aus Stil,
Layout, Malen und Rastern):

| Quellen | Arbeit je Durchfahrt | davon Rastern |
|---|---|---|
| nur 1600 px | 1229 ms | 765 ms |
| bis 2560 px | 1326 ms | 869 ms |
| bis 3464 px | 1830 ms | 1361 ms |

Ein Foto, das gerade skaliert wird, muss der Browser in die Kachel des
Compositors rechnen — und das kostet mit der Quellgröße. Über 2560 px steigt
diese Arbeit steil an, während der sichtbare Gewinn klein bleibt: bei 2560
rechnet der Browser am 1440er Schirm noch 1,18-fach hoch, bei 3464 wäre es
1,00. Für ein Achtzehntel Schärfe das Doppelte an Rasterarbeit ist ein
schlechtes Geschäft. `KANTE` in `tools/bilder-vergroessern.py` steht deshalb
auf **2560**.

**Nur WebP in der großen Stufe.** Die Rückfallebene bleibt die vorhandene
JPEG-Datei in Ausgangsgröße. Dasselbe Bild als JPEG wäre 943 KB statt 405 KB
— und würde nur von Browsern geholt, die kein WebP können.

**Die Galerie bekommt keine Kandidatenliste.** Ihre Kacheln sind klein; die
große Fassung hängt stattdessen als `data-gross` am `<a>` und wird nur in
der Lightbox gezeigt. Die Mechanik dafür stand schon in `main.js`.

### Die Falle: bei `object-fit:cover` misst man die falsche Kante

Wie viel Auflösung ein Foto braucht, sieht nach einer einfachen Rechnung aus:
Kastenbreite mal Gerätepixelverhältnis. Das ist falsch, sobald `cover` im
Spiel ist — und das ist es überall. `cover` vergrößert das Bild, bis **beide**
Kanten den Kasten füllen, maßgeblich ist also die *längere relative* Kante:

```js
const s = Math.max(kasten.breite / bild.breite, kasten.hoehe / bild.hoehe);
```

Ein quadratisches Foto in einem 1440 × 900 großen Kasten wird demnach nicht
auf 1440, sondern auf 1440 px *Höhe wie Breite* gezogen — und mit der
Kamerafahrt von 1,42 fordert es 4090 Gerätepixel an, nicht 2880. Nach der
Breite gerechnet sah dieselbe Stelle nach 1,4-fach aus und war in Wahrheit
2,6-fach.

Am deutlichsten steht das am Telefon: ein querformatiges Foto in einem
390 × 844 großen Hochkant-Fenster wird über die **Höhe** gedeckt. Der
sichtbare Streifen ist dann knapp ein Drittel des Bildes — und braucht
3800 px Quelle, obwohl das Fenster 390 px breit ist.

### Die zweite Falle: `naturalWidth` ist nicht die Dateigröße

Sobald ein Bild aus einem `srcset` mit `w`-Angaben stammt, meldet
`naturalWidth` **nicht** die Pixel der Datei, sondern die durch die
Bilddichte geteilte Größe — damit das Layout in CSS-Pixeln aufgeht. Eine
3200-px-Datei, die über `sizes:142vw` in einem 1440er Fenster landet, meldet
sich als 2044 px.

Wer damit nachmisst, misst Unsinn: dieselbe Datei sah dadurch erst nach
2,0-fach aus, tatsächlich waren es 1,28. Die echten Maße kommen von der
Platte, nicht aus dem DOM.

### Warum `sizes` mit einer Handy-Bedingung anfängt

`sizes="(max-width:980px) 100vw, 142vw"` — die erste Bedingung ist keine
Kosmetik. Am Telefon läuft die Kamerafahrt nicht (siehe „Was am Telefon
wegfällt"), das Foto nimmt also genau die Fensterbreite ein und nicht das
1,42-fache. Ohne sie holt ein iPhone die 3400-px-Datei für eine Darstellung,
die 1170 px breit ist.

### Der Imagefilm

Der Film ist ein Platzhalter: neun der vorhandenen Fotos, je fünf Sekunden,
jedes mit einer langsamen Kamerafahrt. Gebaut wird er von
`tools/film-bauen.js`.

- **Bild für Bild, nicht als Bildschirmaufnahme.** Die erste Fassung wurde
  mit Playwrights `recordVideo` in Echtzeit mitgeschnitten. Das ist auf
  1280 × 720 festgelegt, lässt weder Bitrate noch Codec wählen, die Länge
  schwankt um bis zu zwei Sekunden — und **Ton nimmt es gar nicht auf**. Wer
  so neu aufnimmt, wirft die Musik weg, ohne dass es auffällt. Jetzt stehen
  die CSS-Animationen still, das Skript setzt ihre Zeit selbst, macht eine
  Aufnahme und schiebt sie direkt in ffmpeg.
- **1920 × 1080, und größer bringt nichts.** Am Laptop wird der Film auf
  2880 Gerätepixel gezogen, was nach einer größeren Fassung klingt. Sie
  wurde gebaut (`--gross`, 2560 × 1440) und gemessen: gegen dieselbe Vorlage
  gerechnet **12,48 dB gegen 12,47 dB** — kein Unterschied, bei doppelter
  Dateigröße. Der Grund ist banal: die Fotos, aus denen der Film besteht,
  haben 1129 bis 1600 px. 1920 liegt bereits über der Vorlage; alles darüber
  vergrößert nur, was ohnehin schon hochgerechnet ist.

  Dasselbe gilt für die Kodierung: CRF 27 statt 31 wurde gebaut und an fünf
  Einzelbildern nachgemessen — im Mittel **+1,7 % Kantenschärfe für +33 %
  Dateigröße** (6,6 → 8,8 MB). Auch das ist ein schlechtes Geschäft, aus
  demselben Grund. Es bleibt bei CRF 31.

  Sobald echtes Material vorliegt, lohnt sich beides — der Schalter für die
  große Fassung steht noch im Skript, und in `main.js` wartet
  `data-src-gross`.
- **Die Musik wird nie neu kodiert** — außer beim Mischen mit der Ansage,
  denn das geht nicht anders. Damit sie dabei nicht bei jedem Durchgang
  etwas verliert, liegt sie unberührt unter
  `assets/video/imagefilm-musik.webm`; gemischt wird immer aus ihr, nie aus
  einer schon gemischten Fassung.

### Die Ansage

`tools/film-vertonen.py` legt eine gesprochene Fassung der Untertitel unter
den Film. Der Sprechtext ist **die VTT-Datei selbst** — damit können Bild,
Untertitel und Stimme nie auseinanderlaufen.

- Jede Zeile wird einzeln gesprochen und an ihrer Untertitelzeit eingesetzt,
  nicht am Stück. Sonst verschiebt sich alles, sobald ein Satz einen
  Wimpernschlag länger gerät.
- Die Musik geht unter der Stimme um rund 10 dB zurück (Seitenkette) und
  kommt zwischen den Sätzen von selbst wieder hoch. Gemessen: Verhältnis 12
  ergab 17,5 dB und ließ die Musik fast verschwinden, Verhältnis 6 ergibt
  10,6 dB. Die fertige Mischung steht auf −16 LUFS bei −1,5 dBFS Spitze.
- **Die Stimme ist ein Platzhalter**, genau wie die Bilder des Films: ein
  lokales Sprachmodell (Thorsten, deutsche Männerstimme, 22 kHz). Sie klingt
  ruhig, aber sie klingt synthetisch. Vor dem Live-Gang gehört dort eine
  echte Aufnahme hin.
- **Fremdwörter werden für die Stimme anders geschrieben.** Das Modell liest
  nach deutschen Regeln; in Zusammensetzungen geht das schief. Nachprüfbar,
  bevor irgendetwas gesprochen wird: `python3 tools/film-vertonen.py
  --lautschrift` zeigt die Lautschrift jeder Zeile.

  | steht im Untertitel | wird gesprochen als | vorher |
  |---|---|---|
  | Servicekräfte | Söhrwis-Kräfte | „Ser-wie-keck-refte" |
  | Fahrservice | Fahr-Söhrwis | „Fahr-serwiess" |
  | Crowdmanagement | Kraud Männitschment | „Krowd-manaageement" |
  | Barkeeper | Bar-Kieper | „Bar-keh-per" |
  | Logistik, Messelogistik | Logistick | „Logistiek" |
  | diskret | diskreet | Schwa statt langem e |
  | Deutschlandweit | Deutschlantweit | fehlende Auslautverhärtung |
  | Moin | Meun | zweisilbig „Mo-in" statt „Moin" |

  Geprüft wurde **jedes** der 60 Wörter des Films einzeln, so wie es im Satz
  steht. Die Reihenfolge in der Tabelle ist nicht beliebig: das längere Wort
  muss vor dem kürzeren stehen, sonst greift die Ersetzung im Wortinneren
  und die Zusammensetzung geht leer aus (`Messelogistik` vor `Logistik`).

  Geändert wird **nur der Sprechtext**, nie der Untertitel. Die Tabelle steht
  in `tools/film-vertonen.py` unter `AUSSPRACHE`. Einzeln steht „Service"
  übrigens richtig da — der Fehler entsteht erst in der Zusammensetzung.
- **Die Sprachspur muss bis zum Ende reichen.** `sidechaincompress` hört
  auf, sobald *eine* seiner beiden Spuren endet — und mit ihr das Bild. Beim
  ersten Versuch war der Film dadurch 43 statt 45 Sekunden lang.
- **Die ersten 0,8 s bleiben schwarz** und die Gesamtlänge bleibt die der
  Musik. Daran hängen die Untertitelzeiten in `imagefilm-de.vtt`. Wer den
  Vorlauf ändert, muss sie nachziehen.
- Das Vorschaubild ist kein eigenes Motiv, sondern derselbe Ausschnitt mit
  demselben Lichtabfall — sonst springt das Bild beim Antippen.

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
- **Die Paare stehen bewusst nebeneinander:** Einsatz von/bis, Uhrzeit
  von/bis, Personen/Ort. Wer die Reihenfolge im Markup ändert, bricht diese
  Paare — das Raster füllt stur von links nach rechts. Aus demselben Grund
  steht die Dienstleistung über **beide** Spalten (`.full`): ein halbes Feld
  davor würde jedes folgende Paar um eine Zelle verschieben. Dasselbe gilt
  für das bedingte Feld „Welcher Bereich?", das mal da ist und mal nicht.
- **Der Einsatz hat ein Von und ein Bis.** Personal wird oft nicht für einen
  Tag gebraucht, sondern für einen Messeaufbau über eine Woche. „Bis" darf
  leer bleiben, dann ist alles wie vorher. Geprüft wird nicht mit einer
  eigenen Routine, sondern mit `min` am zweiten Feld — dann meldet der
  Browser selbst, und die Meldung läuft durch dieselbe Stelle wie jede
  andere. Der Text dazu steht als `data-fehler` im Markup.

  Der Zeitraum zieht sich durch: Beleg („Einsatz bis"), Dispositionsmail
  („11.09.2026 bis 14.09.2026") und Angebotsentwurf (`assignment.dateTo`,
  `assignment.days`). Dort prüft er auch, ob **irgendein** Tag des Zeitraums
  ein Sonntag ist — vorher wurde nur der erste Tag angesehen, und bei einem
  Einsatz von Freitag bis Montag fiel der Sonntag genau durch.
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
Bedienbild. Alles davon steht im Abschnitt `APP-ANSICHT` in `styles.css`.

### Zwei Bedingungen, nicht eine

Die Regeln zerfallen in zwei Blöcke, und die Trennung ist wichtig:

| Block | Bedingung | Was darin steht |
|---|---|---|
| 1 | `(max-width:980px)` | alles, was mit der **Breite** zu tun hat: Sicherheitsabstände, weggelassene Effekte, die vereinfachten Bühnen |
| 2 | `(max-width:980px) and (pointer:coarse)` | alles, was es **nur mit der Leiste** gibt: die Leiste selbst, der Platz, den sie unten wegnimmt, und die Menüpunkte, die sie ersetzt |

980 px ist die Grenze, an der die Navigation aus der Kopfzeile verschwindet
und der Menüknopf an ihre Stelle tritt.

`pointer:coarse` ist der Grund, warum am Schreibtisch **keine** Leiste
auftaucht, auch wenn man das Fenster schmal zieht: eine Leiste unter dem
Daumen ergibt nur Sinn, wo es einen Daumen gibt. Am Rechner — auch in der
abgelegten Anwendung — bleibt es beim Menü.

Was von der Leiste abhängt, **muss** in Block 2 stehen. Stünde eines davon
in Block 1, hätte ein schmales Fenster am Rechner unten einen leeren
Streifen — oder ein Menü, dem drei Punkte fehlen, ohne dass es einen Ersatz
dafür gäbe.

Block 2 steht außerdem **hinter** den übrigen Responsive-Blöcken. Seine
Regeln haben dieselbe Spezifität wie die dort (`.panel`, `body`), und bei
gleicher Spezifität gewinnt die spätere. Weiter oben würde der Bühnenblock
den Zuschlag für die Leiste wieder löschen.

Browser, die `pointer` nicht kennen, lassen Block 2 ganz weg: keine Leiste,
vollständiges Menü. Das ist der richtige Rückfall.

**Zum Nachsehen am Rechner** genügt deshalb kein schmales Fenster — es
braucht die Geräteansicht der Entwicklerwerkzeuge (die meldet
`pointer:coarse`) oder ein echtes Telefon.

**Die Leiste unten** (`.appleiste`) hält die vier Wege, die jemand am Telefon
wirklich geht: Start · Leistungen · Jobs · Anfrage. Sie liegt dort, wo der
Daumen ohnehin ist. Das Vollbildmenü oben bleibt für alles Übrige — Team,
Galerie, Referenzen.

- Der Reiter der aktuellen Seite trägt `aria-current="page"`. Die sechs
  Detailseiten zählen zu „Leistungen".
- **Die Marke wandert.** Über dem aktiven Reiter steht das Wortzeichen
  (`.appleiste__marke`) — und es bleibt beim Wechsel nicht stehen, sondern
  gleitet zum nächsten Reiter hinüber, über den Seitenwechsel hinweg. Drei
  Dinge müssen dafür zusammenkommen:
  1. `view-transition-name:reiter`. Daran erkennt der Browser die Marke auf
     beiden Seiten als dasselbe Ding und bewegt sie von ihrer alten an ihre
     neue Stelle, statt sie zu überblenden.
  2. **Genau eine Marke im Dokument.** Zwei Elemente mit demselben
     Übergangsnamen lassen den ganzen Übergang abbrechen. Sie steht deshalb
     einmal im Markup und wird über `:has(> a:nth-of-type(n)[aria-current])`
     an die richtige Stelle geschoben — sie weiß nichts von der Seite, auf
     der sie liegt.
  3. Sie sitzt **anstelle** des Reiter-Zeichens, nicht darüber: in einer
     57 px hohen Leiste ist darüber kein Platz, und übereinander waren
     Wortzeichen und Symbol beide unlesbar. Das Zeichen des aktiven Reiters
     tritt dafür zurück (`visibility:hidden`); die Beschriftung bleibt.
- **Ein Tipp auf den aktiven Reiter lädt nicht neu, sondern springt nach
  oben.** Genau das erwartet man in einer Anwendung, und auf einer Seite von
  dreizehn Bildschirmhöhen ist es der häufigste Wunsch.
- **Nichts steht doppelt.** Was die Leiste anbietet, wird im Menü
  ausgeblendet — nur dort, wo die Leiste auch sichtbar ist. Die Links
  bleiben im Markup; auf breiten Fenstern ist das Menü vollständig.
  Ausgewählt wird über das Ende der Adresse (`[href$="jobs.html"]`), damit
  dieselbe Regel für `jobs.html` und `../jobs.html` gilt.
- **Beim Scrollen tritt die Leiste zurück.** Im Stillstand ist sie eine
  Fläche, auf der man auswählt; während man scrollt, ist sie ein deckender
  Balken über dem unteren Fünftel des Bildes. `.faehrt` (setzt `main.js`,
  nimmt es 520 ms nach dem letzten Bild wieder weg) löst sie in einen
  Verlauf auf: die Zeichen bleiben sichtbar und antippbar, die harte
  Oberkante verschwindet. Kein Ausblenden, kein Wegfahren — die Leiste muss
  jederzeit erreichbar bleiben.
- `body` bekommt `padding-bottom` in Höhe der Leiste, sonst verdeckt sie den
  Fuß. Der Knopf „Nach oben" rückt darüber, und der Textblock der Bühnen
  bekommt denselben Zuschlag auf `padding-bottom` — ohne ihn stand „Zum
  Bereich" hinter der Leiste.

### Der Wechsel zwischen den Reitern

Ein Klick in der Leiste soll sich wie ein Reiterwechsel anfühlen, nicht wie
ein Seitenaufruf. Das leisten Ansichtsübergänge, und zwar ohne eine Zeile
JavaScript:

```css
@view-transition{ navigation:auto; }
header.nav{ view-transition-name:kopfzeile; }
.appleiste{ view-transition-name:appleiste; }
```

Die zweite Hälfte ist die wichtige: Kopfzeile und Leiste bekommen einen
eigenen Namen. Damit erkennt der Browser sie auf beiden Seiten als dasselbe
Element und blendet sie **nicht** mit über — sie bleiben stehen, während der
Inhalt dazwischen wechselt. Das Wortzeichen links oben steht dadurch während
des ganzen Wechsels ruhig an seinem Platz.

Browser, die das nicht können, wechseln wie bisher. Bei reduzierter Bewegung
wird der Übergang abgeschaltet — ein Überblenden ist auch eine Bewegung.

Nachprüfen lässt sich das über das Ereignis `pagereveal`: es trägt bei einem
echten Übergang ein `viewTransition`-Objekt.

### Was am Telefon wegfällt, damit das Scrollen glatt läuft

Nicht die Bewegung ist teuer, sondern das, was der Browser in jedem Bild neu
zeichnen muss. Vier Dinge kosten dort mehr als alles andere zusammen — und
keins davon sieht man auf einem Telefon wirklich:

| Weg | Warum |
|---|---|
| Körnung (`body::after`) | feste Fläche über der ganzen Seite, die sich per `mix-blend-mode` einmischt — der Browser verrechnet bei jeder Bewegung das ganze Fenster neu |
| `backdrop-filter` an Kopfzeile und Leiste | liest bei jedem Bild den Inhalt dahinter zurück; der teuerste Posten der Seite. Die Flächen werden stattdessen dichter |
| Lichtabfall der Kinofassung (`.kino::after`) | bildschirmfüllender Farbverlauf mit laufend wechselnder Deckkraft |
| Kamerafahrt der sechs Bühnen | zwei bildschirmfüllende Fotos übereinander, deren Maßstab und Deckkraft sich in jedem Bild ändern — sechsmal hintereinander. **Genau hier hat es gehakt.** |

Die Bühne behält am Telefon alles außer der Fahrt: das große Foto, die
Kapitelmarke mit Fortschrittslinie, das Tor bei der Logistik und den
Textblock. `main.js` schreibt `--zoom`, `--detail` und `--panel` dort gar
nicht erst (`sparsam`); die Regeln im Stylesheet sind die zweite Sicherung.

**Wer das ändert, muss zwei Dinge zusammen ändern:** ohne `--panel` hängt die
Deckkraft des Textblocks an einem Wert, den niemand mehr schreibt — er wäre
unsichtbar. Deshalb steht im selben Block `.panel{ opacity:1 }`.

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

### Die Falle: ein geparktes `position:fixed` kommt beim Gummiband zurück

Der Sprunglink („Zum Inhalt springen", WCAG 2.4.1) stand zuerst als
ausgewachsener Knopf über der Kopfzeile und war nur mit
`transform:translateY(-140%)` aus dem Bild geschoben. Auf dem iPhone
verschiebt das Überziehen am Seitenanfang aber die ganze Darstellung — und
dann steht der geparkte Knopf sichtbar in der linken oberen Ecke, gequetscht
zwischen Kante und Uhr. Im Browser am Rechner fällt das nie auf.

Ein Element, das nur bei Tastaturbedienung erscheinen soll, wird deshalb
**nicht verschoben, sondern verkleinert**: 1 × 1 px, `overflow:hidden`,
`clip-path:inset(50%)`. So belegt es keine Fläche, die irgendein Rand wieder
hervorholen könnte. Erst `:focus` gibt ihm Größe zurück — und zwar auf dem
Seitenrand (`left:clamp(20px,5vw,64px)`), nicht in der Ecke.

Der Sprunglink bleibt dabei erhalten. Er ist keine zweite Ausgabe des Logos,
sondern die einzige Möglichkeit, mit der Tastatur an Navigation und Menü
vorbei in den Inhalt zu kommen.

---

## Was bewusst fehlt

Keine Cookies, kein Tracking, keine externen Schriften, keine
Social-Media-Plugins, keine Analyse-Werkzeuge. Deshalb braucht die Seite kein
Cookie-Banner. Wer daran etwas ändert, muss die Datenschutzerklärung nachziehen.
