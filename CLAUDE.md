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
- **Der Grund ist tiefes Petrol** (`--grund: #143336`), und er wechselt
  sich ab: jede zweite Bahn steht in hellem Warmgrau (`--hell: #D8D4D1`),
  dazwischen eine weiche Blende. Alle Werte stammen aus einer gelieferten
  Palette und sind aus ihr gemessen (siehe „Die Palette aus der Vorlage"). Die Seite hat alle Richtungen einmal ganz durchlaufen —
  schwarz, dann Off-White, dann abwechselnd, dann Anthrazit, jetzt Blau und
  Beige — und aus jedem Durchgang bleibt eine Regel stehen: **nicht #000**
  (auf OLED schaltet ein Kanal auf 0 die Pixel ab, und ein angeschnittenes
  Foto hat dann keinen Rand mehr, an dem es aufhört), und **nicht
  durchgehend eine Fläche**. Die Begründung und die gemessenen Werte stehen
  unter „Dunkelblau und Beige" und „Der Farbtakt".
- **Die Tokennamen sagen die Rolle, nicht die Farbe.** `--grund`,
  `--flaeche`, `--tinte`, `--tinte-2`, `--tinte-3`, `--linie`. Vorher hießen
  sie `--ink` (die Grundfläche) und `--paper` (der Text) — die Metapher
  stand von Anfang an auf dem Kopf, und beim Hellerdrehen wäre daraus eine
  Falle geworden.
- **Die Tonleiter hängt am Abschnitt, nicht an der Seite.** `.auf-dunkel`
  und `.auf-hell` schalten die Textstufen um; alles, was auf einem Foto
  liegt, trägt die dunkle (Fuß, Vollbildmenü, Kopfband, Filmbühne,
  Galeriekacheln). Eine Regel, die `var(--tinte)` schreibt, stimmt dadurch
  überall, ohne zweite Fassung und ohne Medienabfrage.
- **Fotos tragen die Seite.** Wo ein Bild die Aussage trägt, braucht es keine
  Grafik, keinen Farbverlauf und keinen Leuchteffekt daneben. Bilder laufen
  im Zweifel bis an die Fensterkante, nicht bis zum Satzspiegel.
- **Zwei Farben, sonst nichts.** Dunkelblau und Beige tragen die Seite;
  der Markenton (`--marke`, `--marke-2`) markiert und trägt nicht: aktiver
  Menüpunkt, Hover auf einer Kontaktangabe, ein Punkt von vier Pixeln. Wer
  daraus eine Fläche macht, kippt den ganzen Auftritt ins Templatehafte.
- **Drei Tonleitern, dieselben Namen.** `:root` ist blau, `.auf-dunkel`
  auch, `.auf-hell` ist beige. Eine Regel, die `var(--tinte)` schreibt,
  stimmt in allen drei Lagen.
- **Keine Karten, aber Flächen.** Kein Rahmen um einen Inhalt, keine runde
  Ecke, kein Schlagschatten als Schmuck. Getrennt wird weiter durch
  Haarlinien und Abstand; `--r-m` steht auf 0. Was hinzugekommen ist, ist
  die abgesetzte **Fläche** (`--flaeche`): ein Abschnitt darf heller stehen
  als der Grund, damit die Folge einen Takt bekommt. Das ist ein Wechsel
  des Grundes, kein Kasten um einen Inhalt — der Unterschied ist, dass die
  Fläche bis an die Fensterkante läuft und keine Kante hat, die man sieht.
- **Keine Pillen.** Eine Aktion ist ein Textlink mit einer Linie darunter,
  die beim Ansteuern durchläuft (`.btn`). Die einzige Ausnahme ist der
  Absendeknopf eines Formulars — er ist groß und hat Linien oben und unten,
  aber auch er hat keine Fläche im Ruhezustand.
- **Keine Dauerbewegung.** Nichts pulsiert, nichts wandert von allein.
  **Eine Ausnahme, und sie ist bestellt:** das Kopfbild der Startseite geht
  in sehr langsamer Fahrt ins Bild hinein und wieder heraus (siehe „Die
  stehende Kamerafahrt im Kopfbild"). Sie läuft nur, solange der Hero zu
  sehen ist, und bei reduzierter Bewegung gar nicht. Für jede weitere
  Ausnahme gilt derselbe Maßstab: sie muss bestellt sein, sie muss
  aufhören, wenn niemand hinsieht, und sie muss sich abschalten lassen.
- **Nicht alles auf die Mittelachse.** Überschriften stehen links, Text sitzt
  unten links im Bild, die sechs Bühnen wechseln die Seite.
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
  **Auch `main.js` zählt.** Der Ersetzer lässt `<script>` in Ruhe, weil dort
  Programm steht und kein Satz. Drei Meldungen des Formulars stehen aber als
  Zeichenkette in `assets/js/main.js` — und die liest der Benutzer sehr wohl
  („Das ging schnell — bitte noch einmal auf Senden klicken"). Sie sind
  ersetzt; `striche-ersetzen.py` meldet solche Stellen jetzt am Ende jedes
  Laufs, umgeschrieben werden sie von Hand.
- **Unterstrichen heißt: hier geht es weiter.** Eine Linie unter einem
  kurzen Eintrag liest im Netz als Link. Wo nichts dahintersteckt, darf
  deshalb keine Linie stehen — die Aufzählungen der Leistungsseiten
  (`.einsaetze`, `.erwartungen`) trennen durch Abstand. Eine Linie über die
  **volle Breite** zwischen zwei Blöcken ist etwas anderes: das ist ein
  Trenner, kein Unterstrich, und der bleibt (Stellenliste, Abschnittskanten).

---

## Der Umbau auf Hell, 2026

Der Auftrag war nicht „etwas heller", sondern: zu viel Schwarz, an Stellen
zu leer, der Leistungsbereich soll neu gedacht werden. Was daraufhin
passiert ist, und was davon gemessen wurde:

| | vorher | nachher |
|---|---|---|
| Grundton | #000000 | #F7F6F3 |
| Startseite, Höhe bei 1280 px | 10 013 px | 8 800 px |
| davon reines Abschnittspolster | rund 2 750 px | rund 1 600 px |
| dienstleistungen.html | rund 15 Bildschirmhöhen, sechs Kamerafahrten | 6 400 px, sechs helle Blöcke |
| Kontrastfehler nach WCAG | — | 0 von 16 Seiten, Schreibtisch und Telefon |

**Der Abschnittsrhythmus war das größte Einzelstück.** `--sec` stand auf
`clamp(96px, 12vw, 184px)`. Das war richtig, solange Leerraum das Material
war, das die Bilder freistellt — auf hellem Grund ist derselbe Abstand
einfach eine Lücke. Neun Abschnitte kamen so auf ein gutes Viertel der
ganzen Seite.

**Die Falle dabei: eine Tonleiter ist nicht symmetrisch.** `--tinte-3` trug
auf dunklem Grund `.52` Deckkraft — Weiß bei `.52` ergibt dort rund 4,5:1.
Dieselbe Deckkraft in Anthrazit auf #F7F6F3 sind aber nur **3,58:1**. Wer
die Werte beim Umdrehen mitnimmt, nimmt einen Mangel mit, und zwar einen,
den man nicht sieht: die Prüfung hat ihn an sechzig Stellen über alle
sechzehn Seiten gefunden. Jetzt `.62` und damit 4,92:1.

    .52  3,58:1        .60  4,60:1
    .56  4,05:1        .62  4,92:1   <- so
    .58  4,31:1        .64  5,25:1

Derselbe Fehler steckte im Warnton für offene Angaben (#F0A19D, auf hellem
Grund 1,89:1) und im Fokusring, der auf `outline:2px solid #FFF` stand —
ein weißer Fokusring auf hellem Grund ist kein Fokusring.

**Die Körnung ist ersatzlos weg.** `mix-blend-mode:screen` hellt auf; auf
Off-White zeigt sie nichts mehr. Sie war gleichzeitig der teuerste Posten
beim Scrollen am Telefon. Eine Dekoration, die nichts zeigt und etwas
kostet, ist kein Gestaltungsmittel, sondern ein Rest.

**Die Kopfzeile ist deckend statt durchsichtig.** Damit fällt der
`backdrop-filter` weg (der zweite teure Posten), die Frage nach hellem oder
dunklem Bild dahinter, und der Farbwechsel beim Scrollen. Was sich noch
ändert, ist Höhe und Schatten. Das Wortzeichen steht dafür in Anthrazit —
dieselbe Deckmaske, andere Farbe, erzeugt aus der vorhandenen Datei.

### Der Hero ist geteilt, nicht überblendet

Vorher lag die Schrift auf dem Foto und wurde von drei schwarzen Verläufen
lesbar gehalten. Das kostete dreierlei: das Foto war unter dem Verlauf halb
weg, die Schrift stand grau auf grau, und die erste Bildschirmhöhe war eine
dunkle Fläche. Jetzt steht links die Aussage auf hellem Grund und rechts
das Foto in voller Helligkeit. **Kein Verlauf, kein Overlay, kein
Textschatten** — die Trennung macht die Arbeit, die vorher der Abdunkler
machen musste.

`.hero__inner` trägt dabei bewusst **kein** `.wrap`: im geteilten Hero ist
der rechte Rand die Spaltenkante und darf größer sein als der linke. Eine
Klasse, deren Zusage man bricht, gehört weg.

### Der Leistungsbereich, dritter Anlauf

Zweimal verworfen, und beide Male aus einem nachvollziehbaren Grund:

1. **Ein Kachelraster aus sechs gleichen Feldern.** Sagte nichts — sechs
   identische Kacheln haben keine Reihenfolge und kein Gewicht.
2. **Sechs bildschirmfüllende Szenen mit Kamerafahrt.** Sagten zu viel: vier
   Bildschirme scrollen für vier Zeilen Text.

Jetzt eine **Liste aus sechs Zeilen** über die volle Breite: Nummer, Foto,
Name und die vier Leistungen, die auf der Bereichsseite wirklich stehen.
Eine Zeile ist in einem Blick erfasst, sechs in einem Scrollweg, und der
Unterschied zwischen ihnen liegt im Inhalt statt im Kasten. Keine Zeile hat
einen eigenen Rahmen.

Der Block steht auf der **Startseite** (`.angebot`) und ersetzt auf
`dienstleistungen.html` die Bühnen durch sechs größere Blöcke, bei denen
das Bild die Seite wechselt. Erzeugt werden beide von Skripten
(`tools/leistungen-bauen.py`, `tools/bereiche-bauen.py`), die den Inhalt aus
den sechs Bereichsseiten lesen — abgetippt liefen dreißig Angaben beim
ersten Namenswechsel auseinander.

**Damit ist eine frühere Entscheidung aufgehoben:** „Die Bereiche stehen im
Menü, nicht auf der Startseite". Der Grund dafür war ihre Länge (6 × 76 svh
= 4700 px). Die Liste braucht 1 540 px und löst das Problem nicht wieder
aus, das sie damals verursacht hat.

**Und seit September 2026 gilt wieder das Gegenteil:** der Block ist auf
Wunsch ausgebaut, die Bereiche sind nur noch über den Menüpunkt
erreichbar. Die Begründung und der Weg zurück stehen unter „Die Startseite
zeigt die Dienstleistungen nicht mehr". Die sechs Blöcke auf
`dienstleistungen.html`, die dasselbe Skript erzeugt, sind unberührt.

### Die Falle: `.leistungen` war schon vergeben

Der neue Abschnitt hieß zuerst `.leistungen` — und genau so heißt auf den
sechs Bereichsseiten das Raster für die `.leistung`-Blöcke. Die spätere
Regel gewann, der Abschnitt wurde zu einem vierspaltigen Raster, und im
Browser stand alles in schmalen Säulen übereinander. Das Stylesheet meldet
so etwas nicht: zwei Dinge mit demselben Namen sind für CSS kein Fehler.
Der Abschnitt heißt jetzt `.angebot`.

### Die Falle: `1fr` ist `minmax(auto,1fr)`

Im einspaltigen Raster der Bereichsblöcke stand `grid-template-columns:1fr`.
Das Minimum einer Spalte ist dann ihre min-content-Breite — bei einer
Überschrift also das längste Wort. „VERANSTALTUNGSSCHUTZ" machte die Spalte
dadurch 412 px breit in einem 320-px-Fenster und schob die ganze Seite
hinaus. `overflow-wrap:break-word` hilft dabei **nicht**: es erlaubt den
Umbruch, verkleinert aber die min-content-Breite nicht. Richtig ist
`minmax(0,1fr)`.

### Die Falle: eine Kamerafahrt trägt zur Scrollbreite bei

`heroFahrt` skaliert das Kopfbild auf 1,10. Der überstehende Teil wird zwar
nicht gezeichnet, zählt aber zur Scrollbreite der Seite — gemessen 44 px bei
1440. `overflow:hidden` hätte dort zusätzlich einen Scrollbereich angelegt;
richtig ist `overflow:clip`, das nur abschneidet.

---

## Die Kamerafahrt, 2026

Der zweite Auftrag nach dem Umbau auf Hell: das Bewegungsdesign soll auf
Kinoniveau, und die Startseite soll sich beim Öffnen anfühlen wie ein
Imagefilm. Ausdrücklich bestellt war dabei eine Umkehrung des geteilten
Heros:

> „Beim Öffnen soll zuerst das Hintergrundbild vollständig und bildfüllend
> erscheinen, ohne dass der Text direkt sichtbar ist. Anschließend zoomt der
> Text wie eine Kamerafahrt langsam aus der Tiefe nach vorne."

### Der Hero ist wieder bildfüllend

Der geteilte Hero hat das Kontrastproblem gelöst und dafür dem Foto die
halbe Fläche genommen. Jetzt füllt das Bild wieder den ganzen ersten
Bildschirm, und der Text steht darauf.

„Den gesamten Viewport" heisst dabei: alles unterhalb der Kopfzeile
(`min-height:calc(100svh - var(--nav-h))`). Die Kopfzeile durchsichtig zu
machen, brächte `backdrop-filter` und die Frage „helles oder dunkles Motiv
dahinter" zurück — also genau die beiden Posten, die den Umbau auf Hell
getragen haben. `svh` und nicht `vh`: sonst steht der Hero am Telefon beim
Laden 60 px zu hoch.

Die Hauptzeile steht wieder auf `--fs-mega`. Die eigene Formel für die
schmale Spalte ist damit entfallen: eine Stufe weniger.

### Der Schleier ist gerechnet, nicht gewählt

Weisse Schrift auf einem Foto ist nur so lesbar, wie der hellste Pixel
darunter dunkel ist. Aus der WCAG-Formel folgt direkt, wie weit ein weisser
Pixel abgedunkelt werden muss:

| | nötiges Verhältnis | L des Grundes | Deckkraft |
|---|---|---|---|
| kleiner Text | 4,5:1 | ≤ 0,183 | **54 %** |
| grosse Zeile | 3,0:1 | ≤ 0,300 | **42 %** |

Und genau weiss ist hier der Regelfall: das Motiv zeigt ein Team in weissen
Hemden unter einem hellen Zelt. Gemessen über sechs Zuschnitte
(`object-position` von 20 % bis 100 %) liegt das 98. Perzentil des Grundes
in den beiden unteren Textbändern in **jedem** Zuschnitt bei 1,000. Es gibt
keine Lage, in der die Schrift auf etwas Dunklem stünde.

**Ein schwacher Schleier ist hier also nicht die zurückhaltendere Variante,
sondern die unlesbare.** Der erste Versuch mit einem dezenten Verlauf in der
Ecke ergab 1,35:1 an der Auszeichnungszeile — weiss auf weiss.

Was bleibt, ist die Verteilung: das obere Drittel mit Decke, Leuchten und
Farbe bleibt unangetastet, abgedunkelt wird nur, wo Schrift steht. Am
Telefon muss der Verlauf viel weiter nach oben tragen, weil der Text dort
drei Viertel der Höhe einnimmt statt der Hälfte — deshalb zwei getrennte
Sätze Werte.

**Und der Schleier gehört zur Kamerafahrt, nicht zum Bild.** Er liegt bei
`opacity:0` und kommt bei 0,30 s mit dem Text. Damit steht das Foto den
ersten Moment ungradiert in voller Helligkeit da: das ist die bestellte
Eröffnung, und zugleich der einzige Weg, ein Foto bildfüllend zu zeigen und
Text darauf lesbar zu halten.

### Die Falle: Kontrast auf einem Foto lässt sich nicht aus dem DOM rechnen

`scratchpad/kontrast.js` sucht den ersten deckenden Vorfahr und nimmt dessen
Farbe. Über einem Bild gibt es den nicht — der Grund ist an jeder Stelle ein
anderer. Der Prüfer meldete den Hero deshalb als „bestanden": er rechnete
gegen `.hero{ background:var(--dunkel) }` und sah das Foto gar nicht.

Gemessen wird dort seitdem **am gerenderten Bild**
(`scratchpad/heroKontrast.js` plus `heroKontrast.py`): einmal mit Text, um
die Rechtecke zu bekommen, einmal ohne, um den Grund zu fotografieren. Für
helle Schrift ist der hellste Grundpixel der schlechteste Fall. Berichtet
werden zwei Zahlen, das 98. Perzentil und der schlechteste Pixel — ein
einzelner heller Punkt an einer Buchstabenkante ist kein
Lesbarkeitsproblem, zwei Prozent der Fläche sind eins.

Stand: alle acht Textflächen am Schreibtisch und alle sieben am Telefon
bestehen, auch am schlechtesten Pixel (5,2:1 bis 13,1:1).

### Die Sequenz, und warum `sofort` nur noch das Foto meint

| ab | was |
|---|---|
| 0,00 s | das Foto steht, die stehende Fahrt darauf läuft bereits |
| 0,30 s | der Schleier kommt |
| 0,34 s | die Auszeichnungszeile |
| 0,50 / 0,62 / 0,74 s | die drei Zeilen der Hauptzeile |
| 1,16 s | der Vorspanntext |
| 1,30 s | die Aktionen |
| 1,62 s | der Scrollhinweis |

Bestellt war ausdrücklich „schnell und hochwertig, nicht langsam". 2,4
Sekunden bis zum letzten Bild, davon die erste halbe Sekunde allein das
Foto.

`sofort` stand bisher für „der ganze Hero steht von der ersten Zeichnung an
fertig da", und der gemessene Grund dafür war der LCP (2996 ms gegen
356 ms). Das größte sichtbare Element ist aber das **Foto**, nicht die
Schrift darauf. Das Foto steht deshalb weiter sofort; der Text wartet auf
den Schnitt, und `los` fällt jetzt in `main.js` beim Abgang des Vorspanns.
Liefe die Kamerafahrt unter dem deckenden Vorspann ab, wäre sie vorbei,
bevor irgendjemand sie sehen kann.

Beide Klassen stehen danach gleichzeitig. Damit die Einfahrt des Fotos
nicht doch noch nachträglich startet, trägt die `los`-Regel ein
`:not(.sofort)` — ohne das gibt es beim Schnitt einen sichtbaren Ruck.

### Fünf Gesten, mehr nicht

Bestellt war Bewegung „gezielt, nicht überall". Das ganze Vokabular:

| | wo | was |
|---|---|---|
| `kameraVor` | Hero-Hauptzeile, `[data-kino]` | aus der Tiefe nach vorn: Maßstab, Deckkraft und Unschärfe zusammen |
| `kameraSanft` | Auszeichnungszeile, Vorspann, Aktionen | von unten herein, ohne Unschärfe |
| `[data-stagger]` | Gruppen und Listen | Kinder nacheinander, Index aus `--i` |
| `--weg` / `--lauf` | Fotos | Gegenbewegung, scrollgeführt |
| Linie zeichnen (`scaleX`) | Leistungszeilen | eine Haarlinie, die schon da war, bekommt eine Richtung |

**Maßstab, Deckkraft und Unschärfe sind zusammen EINE Geste** — „Annäherung".
Wer sie trennt, bekommt drei Effekte. Deshalb trägt ein Element mit
`data-kino` bewusst **kein** `reveal-up`: das wären die Aufblende und die
Fahrt gleichzeitig auf derselben Zeile.

`data-kino` steht nur auf der Startseite und nur an den fünf
Abschnittsüberschriften. Eine Bewegung, die überall steht, ist keine
Auszeichnung mehr, sondern ein Grundzustand.

**Im Hero fährt die Zeile nicht mehr aus einer Maske nach oben.** Das
vertrüge sich auch technisch nicht: `overflow:hidden` schneidet genau die
Unschärfe ab, die über den Kasten hinausquillt. Auf den Unterseiten und im
Fuß bleibt die Maske.

### Was die Unschärfe kostet

`filter` ist die teuerste der drei animierbaren Eigenschaften — gemessen
137 ms je Durchfahrt im Abschnitt „Wort für Wort". Der Unterschied ist, dass
es dort bei **jedem** Scrollbild neu gerechnet wird; bei `data-kino` läuft
es einmal und endet. Gemessen über eine volle Durchfahrt der Startseite
(`scratchpad/arbeit.js`, Summe aus Stil, Layout, Malen und Rastern, Median
aus je neun Läufen):

| | Arbeit je Durchfahrt |
|---|---|
| mit Unschärfe | 56 ms |
| ohne Unschärfe | 55 ms |
| ganz ohne die Kamerafahrten | 57 ms |

Der Unterschied liegt im Rauschen. Am Telefon fällt die Unschärfe trotzdem
weg (`filter:none` im 980-px-Block, und die Hero-Zeilen laufen dort auf
`kameraSanft`): auf sechs Zoll sieht man sie ohnehin nicht, und Messwerte
von einem Rechner sind kein Beleg für ein Telefon.

### Die Falle: ein `@keyframes`, das noch jemand braucht

Der Hero fährt nicht mehr aus der Maske, also fiel mit seiner Regel auch
`@keyframes heroRise` weg. Gebraucht wird es aber weiter — von
`.subhero h1 .line span`, also von **fünfzehn Unterseiten**. Eine
Animation, deren Name nirgends definiert ist, wirft keinen Fehler: die
Regel gilt einfach nicht, der Startwert bleibt stehen, und die Zeile stand
dauerhaft auf `translateY(112%)`, also unsichtbar.

Gefunden hat es ein `grep` nach dem Namen, nicht der Browser und nicht
esbuild. **Wer eine Animation löscht, sucht vorher nach ihrem Namen** —
dasselbe gilt für Klassen, Variablen und `@keyframes`.

### Die Falle: ein Flex-Kind bekommt nicht die volle Breite

`.hero__fuss` ist ein Flex-Kasten aus Vorspann und Aktionen. Hochkant nimmt
der Vorspann die volle Breite, die Aktionen rutschen in die zweite Zeile —
und bekommen dort **nicht** die volle Breite, sondern ihre Inhaltsbreite von
152 px. In die passt genau ein Knopf, also stapelten sich beide
untereinander. Gemessen kostete das 46 px Höhe, und die fehlten unten genau
dort, wo die App-Leiste liegt: „Was wir stellen" lag mit seiner unteren
Hälfte dahinter, antippbar war die Leiste.

Zwei Zeilen: `flex-direction:column` am Kasten, `width:100%` am Kind. Und
der Hero bekommt denselben Zuschlag für die Leiste wie `.panel` und
`#mobileMenu` — es ist die dritte Stelle mit derselben Rechnung.

### Die Leistungen: sechs Linien, die gezeichnet werden

Der Leistungsbereich sollte „lebendig und miteinander verbunden" wirken.
Die Antwort darauf ist nicht ein Effekt, der hinzukommt, sondern das
Zeichen, das die Seite ohnehin führt: ein Punkt ist eine Position, eine
Linie ist die Verbindung.

Die sechs Trennlinien waren schon da. Sie werden jetzt **gezeichnet** statt
gesetzt, von links nach rechts, eine nach der anderen, im selben 55-ms-Takt
wie die Zeilen darüber. Sechs Linien, die nacheinander entstehen, sind die
Verbindung — und es kommt kein einziges Element hinzu (dieselbe Begründung
wie bei der Einsatzlinie).

Der violette Punkt am linken Ende markiert die Zeile, auf der man steht.
Einer, nie zwei.

**Was die Zeile NICHT bekommt**, und beides aus einem nachgerechneten Grund:

- **Kein Zurücktreten der übrigen fünf.** Das Verfahren aus dem
  Vollbildmenü sieht gut aus und kostet hier Kontrast: der
  Beschreibungstext liegt bei 4,9:1, auf 52 % Deckkraft sind es 2,4:1. Dann
  ist die halbe Liste unlesbar, sobald die Maus irgendwo in ihr steht.
- **Keine Verschiebung des Namens.** `.bereich__name::after` ist die
  Trefferfläche über der ganzen Zeile. Sobald der Name selbst eine
  `transform` bekommt, wird **er** der Bezugsrahmen dafür, und die Fläche
  schrumpft beim Ansteuern auf das Wort zusammen. Die Zeile als Ganzes darf
  sich bewegen, ihr Inhalt nicht.

### Der Übergang zwischen zwei Fotos

Kopfbild und Bildband stehen direkt übereinander. Beide Kanten des Bandes
liefen in helles Off-White aus — richtig, solange der Hero hell war. Seit
dort ein dunkel gradiertes Foto steht, lag zwischen den beiden Aufnahmen
ein heller Nebelstreifen: eine Kante, die gerade dadurch auffiel, dass sie
keine sein wollte.

Die obere Kante läuft jetzt in denselben Ton aus, mit dem der Hero endet.
Die untere bleibt hell, darunter steht die Vertrauensleiste auf
Seitengrund. Aus zwei Bildern mit einem Strich dazwischen wird eine Fahrt,
die von einem Motiv ins nächste geht.

### Wie viele Stufen eine Vorlage trägt

Das Kopfbild ist inzwischen ein anderes (`bankett`, 1672 × 941). Der
Abschnitt bleibt trotzdem stehen, denn er enthält die Messung, aus der die
Regel kommt — **wie viele Stufen ein Motiv bekommt, entscheidet seine
Vorlage, und das ist nachgemessen, nicht geschätzt.**

Gemessen wird nicht die Datei, sondern die Darstellung: bildfüllend auf
einem 1440er Schirm mit doppelter Pixeldichte, also 2880 Gerätepixel,
Kantenschärfe der Bildmitte.

| Vorlage | Stufe | Kantenschärfe | Datei (AVIF) |
|---|---|---|---|
| 640 × 480 | 1600 px | **4,47** | 92 KB |
| | 2560 px | 4,40 | 124 KB |
| | 3840 px | 4,06 | 202 KB |
| 1672 × 941 | 1600 px | 8,18 | 117 KB |
| | 1672 px (nativ) | 8,43 | 124 KB |
| | 2200 px | 8,88 | 168 KB |
| | 2560 px | **9,00** | 198 KB |

**Bei der kleinen Vorlage war mehr messbar schlechter, bei der großen
messbar besser** — und der Grund ist derselbe. Der Browser rechnet auf
2880 hoch. Die 1600er Datei wird für 1600 geschärft und dann
hochgerechnet: die Schärfung wächst mit. Die 3840er wird bei 3840
geschärft und danach **herunter**gerechnet: das mittelt die Schärfung weg.
Bei einer 1672er Vorlage liegt jede Stufe unter 2880, wird also in jedem
Fall hochgerechnet, und dann lohnt die größere.

Die Entscheidung steht als `LOHNT_GROSS = 1400` in
`tools/motive-bauen.py`. Der Deckel bleibt bei 2560 — nicht der Dateigröße
wegen, sondern des Rasterns (siehe „Die Obergrenze kommt nicht von der
Dateigröße").

**Die ganze Messung rechnet allerdings gegen ein Ziel: bildfüllend.** Ein
Motiv, das im Satzspiegel steht, wird nie auf 2880 Gerätepixel gezogen —
das Foto in der linken Intro-Spalte misst höchstens 440 CSS-Pixel, am
Telefon 350 bei dreifacher Dichte, also rund 1050. Für so eines ist die
zweite Stufe kein Gewinn, sondern Gewicht, das kein Gerät je anfordert, und
auch die Grundstufe darf kleiner sein. `MOTIVE` trägt deshalb zwei weitere
Felder, `randlos` und die Kantenlänge. Nachgemessen als AVIF: 1100 px →
104 KB, 1200 → 115, 1400 → 137, 1600 → 161. Bei 1200 wird nichts
hochgerechnet, was jemand sieht.

**Die Vorlagen liegen seit dem Wechsel im Repository**, unter
`assets/quellen/`. Vorher lagen sie ausschließlich außerhalb des Projekts,
und damit war jede Neuberechnung eine Frage des Glücks. `paket-bauen.sh`
lässt den Ordner aus.

#### Der Fall, aus dem die Messung stammt

Bestellt war „komplett 4K, gestochen scharf". Die damalige Vorlage hatte
**0,31 Megapixel** (640 × 480) — das Sechsundzwanzigfache der Fläche wurde
angefordert.

**Was wirklich hilft, kostet 5 KB.** Wenn die Schärfung ohnehin die
Hochrechnung überleben muss, darf sie stärker sein. Nachgemessen am
gerenderten Bild:

| Nachschärfung bei 1600 px | Kantenschärfe |
|---|---|
| 52 % (bisher) | 4,44 |
| **85 %** | **5,02** |
| 110 % | 4,77 |
| 140 % | 4,50 |

85 % ist das Maximum; darüber frisst die Wiedervergrößerung mehr weg, als
die stärkere Schärfung einbringt. Im direkten Vergleich sind Gesichter und
Hemdkanten sichtbar definierter, ohne Halos. `UNSCHARF` in
`neue-motive.py` steht deshalb auf `(1.6, 85, 2)`.

**Echte Schärfe kann nur eine echte Aufnahme liefern.** Gebraucht werden
mindestens 2400 px an der langen Kante (`docs/foto-briefing.md`). Und der
Hinweis, der in diesem Fall der wichtigste ist: in ein Gespräch
**eingefügte** Bilder werden auf dem Weg verkleinert. Zwei Aufnahmen
desselben Betriebs kamen in dieser Sitzung mit 24,5 und 16,8 Megapixel an,
weil sie als Datei angehängt waren. Das Kopfbild kam mit 0,31 — das Original
existiert also mit hoher Wahrscheinlichkeit, es ist nur nie hier angekommen.

### Der Schleier misst sich am Motiv, nicht an einer Zahl

Das Kopfbild ist ein drittes Mal gewechselt: von `gastro` über
`team-einsatz` auf **`bankett`**, eine dunkle Restauranttafel mit warmen
Leuchten. Der Schleier wurde dabei nicht neu gewählt, sondern neu
**gemessen** — und das ist der Punkt.

Man erwartet, dass ein dunkles Motiv kaum Schleier braucht. Ohne ihn
gemessen ergibt genau dieses Bild aber **1,00:1 am schlechtesten Pixel**:
Kerzenflammen und Glaskanten sind reines Weiss, und sie stehen ausgerechnet
dort, wo die Hauptzeile liegt. Ein dunkles Foto ist nicht dasselbe wie ein
Foto ohne helle Stellen.

**Und der Grund steht nicht still.** Die stehende Kamerafahrt zieht das
Motiv in 30 s von 1,00 auf 1,10 und zurück; was hinter einem Buchstaben
liegt, wandert mit. Eine einzelne Aufnahme misst deshalb einen Moment, nicht
den schlechtesten Fall. `scratchpad/heroPhasen.js` hält die Animation an
und tastet fünf Stellen ab, `phasen.py` nimmt je Textfläche die
schlechteste. Zwischen bester und schlechtester Phase liegen gemessen bis
zu 1,4 Stufen Kontrast — genug, um eine Fassung durchzuwinken, die in
Wahrheit nicht besteht.

| | vorher (`team-einsatz`) | jetzt (`bankett`) |
|---|---|---|
| Deckkraft unten, Schreibtisch | 58 % | **56 %** |
| Deckkraft unten, Telefon | 66 % | **62 %** |
| schlechtester Pixel über alle fünf Phasen | — | 4,38:1 bis 4,80:1 |

Viel weniger geht nicht: bei 50 % fällt die Auszeichnungszeile am
schlechtesten Pixel auf 3,74:1. Sie ist kleine Schrift und braucht 4,5 —
sie allein bestimmt den ganzen Verlauf.

### Der Schleier, zweiter Durchgang: weniger Text auf dem Foto

Die erste Fassung deckte bis auf 66 % Höhe ab und lag unten bei 86 %
Deckkraft. Beanstandet, zu Recht: das Foto war zu dunkel.

Der Hebel ist nicht der Verlauf, sondern **was auf dem Foto steht**. Kleine
Schrift braucht 54 % Abdunklung, eine grosse Zeile nur 42 %. Auf dem Foto
standen Auszeichnungszeile, Hauptzeile, Vorspanntext und zwei Aktionen —
also viermal kleine Schrift, und die Auszeichnungszeile ganz oben im
Textblock, im hellsten Teil des Motivs. Um DIESE eine Zeile lesbar zu
halten, musste der Verlauf zwei Drittel der Bildhöhe tragen.

Vorspanntext und Aktionen stehen jetzt im **Auftaktband** darunter, einem
dunklen Streifen. Auf dem Foto bleiben Auszeichnungszeile und Hauptzeile.

| | vorher | nachher |
|---|---|---|
| Deckkraft unten | 86 % | **58 %** |
| Verlauf reicht bis | 100 % der Höhe | **92 %**, ab 66 % unter 32 % |
| oberes Drittel | abgedunkelt | **unberührt** |
| schlechtester Pixel | 4,59:1 | 4,55:1 |

Der Kontrast bleibt also derselbe, die Abdunklung fällt um 28 Punkte. Das
ist der allgemeine Punkt daran: **ein Verlauf über einem Foto ist kein
Regler, sondern eine Folge davon, wie viel Text darauf steht.**

Der Preis ist, dass „Personal anfragen" nicht mehr im ersten Bildschirm
steht. In der Kopfzeile steht es dauerhaft, am Telefon in der Leiste unten.

---

## Schwarz und Off-White, 2026

Nach dem Umbau auf Hell kam die Gegenbewegung: **zu weiss.** Bestellt war
ein Verhältnis, in dem Schwarz die tragende Farbe ist und Off-White die
Ruhefläche, und zwar abwechselnd statt durchgehend.

Die Startseite las sich danach so:

| | Grund |
|---|---|
| Kopfbild | Foto |
| Auftaktband | dunkel |
| Bildband | Foto |
| Vertrauensleiste, Intro | Off-White |
| Leistungen | Weiss |
| Imagefilm | **dunkel** |
| Referenzen | Off-White |
| Schlussblock, Fuss | **dunkel** |

Gemessen waren das 3 945 von 8 135 Pixeln auf dunklem Grund, also **48 %** —
und nicht eine durchgehende schwarze Strecke, sondern vier Wechsel.

**Dieser Abschnitt beschreibt einen Zwischenstand.** Seit September 2026
ist der Grund durchgehend dunkel (siehe „Der Umbau auf Dunkel"); aus dem
Wechsel Weiss/Off-White ist der Wechsel #15161B/#21232B geworden. Was
bleibt, ist die Mechanik darunter, und die steht hier: umgeschaltet wird
über `.auf-dunkel` im Markup, nicht über neue Regeln.

Umgeschaltet wird über `.auf-dunkel` im Markup, nicht über neue Regeln:
die Klasse dreht die Tonleiter um, alles Übrige bleibt.

**Die Falle dabei:** `.cta` hatte `background:var(--flaeche)` fest
eingetragen. Das gewinnt gegen `.auf-dunkel` (gleiche Spezifität, spätere
Regel) — der Schlussblock wäre weiss geblieben, während seine Schrift auf
die helle Tonleiter umschaltet, also weiss auf weiss. Ein fest
eingetragener Grund und eine umschaltbare Tonleiter schliessen einander
aus; der Grund muss aus demselben Token kommen.

### Das Büroteam steht auf dem Hintergrund seiner eigenen Aufnahme

Bestellt war: jede Person vor einer anderen Büroszene. Die vorhandenen
Porträts sind Studioaufnahmen vor anthrazitfarbenem Hintergrund (gemessen
#2C2B30 oben links, #171719 unten rechts — ein Vignettenverlauf).

Unterschiedliche Bürohintergründe lassen sich daraus nicht herstellen: man
müsste die Personen freistellen und in erfundene Räume setzen. Das sind
reale, mit Namen genannte Mitarbeiter, und ein erfundenes Büro hinter ihnen
ist eine Aussage über den Betrieb, die nicht stimmt. Was gebraucht wird —
sechs Szenen, eine Lichtführung, dieselbe Brennweite — steht in
`docs/foto-briefing.md`.

Was ohne neue Aufnahme möglich war: der Abschnitt steht auf **#2E2D33**,
also auf dem Ton des Studiohintergrunds. Damit hat das Porträt keine
sichtbare Kante mehr, die Aufnahme läuft in die Seite hinein, und übrig
bleiben die Menschen statt vier grauer Rechtecke auf hellem Papier.

**Versucht und wieder verworfen:** wechselnde Kachelformate (hochkant,
quadratisch, hochkant), damit die vier nicht wie Kopien wirken. Im Bild sah
das nicht abwechslungsreich aus, sondern unsortiert — die Namen standen
nicht mehr auf einer Linie, und genau dafür gibt es `align-content:start`.
**Eine Unregelmässigkeit, die niemand als Absicht liest, ist ein Fehler.**

### Die Startseite nimmt nicht mehr alles vorweg

Bestellt war, dass die Startseite neugierig macht statt die ganze Website
aufzuzählen — bei weiterhin mehreren eigenständigen Unterseiten. Verschoben
wurde deshalb, nicht gelöscht:

| Was | von | nach | warum |
|---|---|---|---|
| „So läuft eine Anfrage" | Startseite | `kontakt.html` | der Ablauf gehört neben das Formular, mit dem man ihn auslöst |
| „Was Sie erwarten können" | Startseite | `dienstleistungen.html` | derselbe Standard in allen sechs Bereichen, also einmal auf der Übersicht |
| die 24 Unterleistungen | Leistungszeilen | die sechs Bereichsseiten | sie standen dort ohnehin; auf der Startseite waren sie das vollständige Verzeichnis |

Die sechs Zeilen selbst bleiben. Ohne sie sagt die Startseite nicht, was
das Haus tut — und „weniger aufzählen" heisst nicht „nichts nennen".

**Was dabei nachzuziehen war:** ohne die vier Stichworte je Zeile stand
links ein kleiner Name und 1 100 px weiter rechts ein Pfeil, dazwischen
nichts. Nummer, Foto und Name sind deshalb mitgewachsen (Name auf
`clamp(1.5rem, 2.9vw, 2.6rem)`, Versalien). Eine Zeile, die die volle
Breite tragen soll, muss auch in ihr stehen.

Gesamthöhe der Startseite bei 1280 px: **8 926 → 8 135** Pixel.

---

## Der Umbau auf Dunkel, September 2026

Nach „Schwarz und Off-White" kam die nächste Stufe derselben Bewegung:
**nicht mehr überwiegend weiß.** Bestellt war Schwarz beziehungsweise sehr
dunkle Grautöne als Grund, Weiß als Akzent für Text, Linien und
Bedienelemente — und ausdrücklich: „Alle anderen funktionalen Elemente,
Layouts, Abstände und Inhalte sollen ansonsten exakt unverändert bleiben."

**Genau das hat null neue Regeln gekostet.** Umgestellt sind sechs
Farbwerte in `:root`, und zwar auf die Werte, die im Stylesheet ohnehin
schon standen: die dunkle Tonleiter von `.auf-dunkel` trug bereits Fuß,
Vollbildmenü, Kopfband der Unterseiten und die vier Kontrastbahnen der
Startseite. Jede Regel, die `var(--grund)` oder `var(--tinte)` schreibt,
stimmt seitdem von selbst.

Das ist der Ertrag aus einer Entscheidung von 2026, die damals nur nach
Ordnungsliebe aussah: **die Tokennamen tragen die Rolle, nicht die Farbe.**
Hießen sie `--weiss` und `--schwarz`, wäre dieselbe Umstellung eine
Suchen-und-Ersetzen-Aktion über 250 Stellen — mit der Gewissheit, ein
Dutzend davon zu übersehen.

| | vorher | nachher |
|---|---|---|
| `--grund` | #F7F6F3 | **#15161B** |
| `--flaeche` | #FFFFFF | #21232B |
| `--tinte` | #15161B | #FFFFFF |
| `--tinte-3` | rgba(21,22,27,.62) | rgba(255,255,255,.58) |
| `--violet` | #5B21B6 | #A78BFA |
| `--offen-ton` | #B0350B | #F0A19D |
| Kontrastfehler nach WCAG | 0 | **0** von 16 Seiten, Schreibtisch und Telefon |

**Nicht #000**, und das ist dieselbe Begründung wie 2026: auf einem
OLED-Bildschirm schaltet reines Schwarz die Pixel ab, ein angeschnittenes
Foto hat dann keinen Rand mehr, an dem es aufhört. #15161B ist der Ton,
der im Fuß ohnehin stand, und seine Textstufen sind gemessen.

**Der Takt bleibt.** Ein Abschnitt darf mit `--flaeche` eine Spur heller
stehen als der Grund; aus dem Wechsel Weiß/Off-White wird der Wechsel
#15161B/#21232B. Dieselben Klassen, dieselben Stellen.

### Drei Dinge, die das Stylesheet nicht von selbst erreicht

1. **Die Wortzeichen.** Es gibt jede Fassung zweimal: `logo-herm.png` ist
   die helle für dunklen Grund, `logo-herm-dunkel.png` die dunkle für
   hellen. Kopfzeile, Vorspann und App-Leiste trugen die dunkle — auf
   Anthrazit wäre das ein unsichtbares Logo, und zwar an der auffälligsten
   Stelle der Seite. Getauscht in allen sechzehn Dateien, zusammen mit
   `<meta name="theme-color">`.
2. **`color-scheme:dark` an `html`.** Das Kalendersymbol in einem
   `<input type=date>`, die Uhr in `type=time`, der Pfeil eines `<select>`
   und der Rollbalken zeichnet der **Browser**, nicht das Stylesheet. Ohne
   diese eine Zeile stehen sie schwarz auf schwarz — im Anfrageformular
   sind das sechs Felder.
3. **Die Schatten.** `--schatten` war aus `rgba(21,22,27,…)` gemischt. Was
   den Grund abdunkeln soll, ist auf Anthrazit schon so dunkel wie der
   Grund; die Werte kommen jetzt aus `rgba(0,0,0,…)` und stehen tiefer.

### Die Tonleiter ist auch in dieser Richtung nicht symmetrisch

2026 stand hier die Warnung, `--tinte-3` beim Hellerdrehen nicht einfach
mitzunehmen (.52 auf dunkel ergab 4,5:1, dieselbe Deckkraft auf hell nur
3,58:1). Zurück gilt dasselbe, nur mit umgekehrtem Vorzeichen: Weiß trägt
auf Anthrazit **mehr**. Die .62, die auf hellem Grund nötig waren, ergeben
auf #15161B 7,29:1 — kein Mangel, aber die Stufe sähe nicht mehr gedämpft
aus, und der Unterschied zwischen `--tinte-2` und `--tinte-3` verschwände.
Sie steht deshalb auf .58 (6,67:1).

### Die Startseite zeigt die Dienstleistungen nicht mehr

Bestellt war, dass die sechs Bereiche **nur** über den Menüpunkt
erreichbar sind. Der Leistungsblock ist deshalb ausgebaut; die Startseite
ist damit von 8 787 auf **7 109** Pixel gefallen (1440 px Fenster).

Damit ist die Entscheidung von „Der Umbau auf Hell" wieder aufgehoben, und
zwar ausdrücklich: dort stand „Die sechs Zeilen selbst bleiben. Ohne sie
sagt die Startseite nicht, was das Haus tut." Das Gegenargument des
Auftraggebers wiegt schwerer — es gibt vier Wege zu den Bereichen, und
keiner davon ist die Startseite: der Balken unter der Kopfzeile, der
Menüpunkt selbst (auch ohne JavaScript), „Leistungen" in der App-Leiste
und die sechs Adressen im Fuß jeder Seite.

**Das Skript bleibt stehen.** `tools/leistungen-bauen.py` baut den Block
ohne Schalter **aus** (mehrfach ausführbar) und mit `--einsetzen` wieder
ein. Ein gelöschtes Skript wäre eine Entscheidung, die niemand mehr
zurücknehmen kann — und seine Tabelle ist weiterhin die einzige Stelle, an
der Nummer, Name, Adresse und Kachel der sechs Bereiche zusammenstehen.

### Echte Fotos aus dem Betrieb schlagen jede Gestaltung

Der wiederkehrende Einwand war „sieht langweilig aus und nach KI". Der
Grund dafür stand nicht im Stylesheet: die Startseite zeigte einen leeren
Restauranttisch, eine leere Bar, einen geschmückten Scheuneneingang und ein
Neonschild — **vier Motive, auf denen niemand arbeitet.** Ein
Personaldienstleister, dessen Seite keine Menschen zeigt, sieht aus wie ein
Vorlagenkauf, und zwar völlig unabhängig von Farbe, Raster und Bewegung.

Zwei Aufnahmen aus dem Betrieb haben das erledigt, und beide sind 0,31 MP
klein:

| | wo | was darauf ist |
|---|---|---|
| `crew-weiss` | linke Intro-Spalte | das Serviceteam in Weiss unter dem Zelt, vor dem Einlass |
| `zapfen` | Schlussblock, zweite Spalte | jemand zapft an der Theke |

**Die Auflösung ist hier nicht das Kriterium.** Beide Bilder stehen im
Satzspiegel und werden nie über 440 CSS-Pixel breit; gebaut sind sie auf
1100 px lange Kante, das reicht auch für dreifache Pixeldichte. Ein
gestochen scharfes Bild ohne Menschen hilft dieser Seite nichts, ein
körniges mit Menschen sehr wohl.

**Der Schlussblock hat dafür eine zweite Spalte bekommen.** Er war reiner
Text — Zeile, Absatz, zwei Knöpfe, vier Karten — und der Absatz ist auf
`46ch` begrenzt: auf 1440 px stand rechts daneben gemessen eine halbe
Bildschirmbreite nichts. Genau diese Leere liest sich als Beliebigkeit.
`align-items:end` setzt die Unterkante des Fotos auf die Unterkante der
Dispositionszeile; unter 981 px steht es unter dem Text.

### Das Kopfbild: ein Zuschnitt schlägt einen Zoom

**Dieser Abschnitt beschreibt einen Zwischenstand.** Das Kopfbild der
Startseite ist die Restauranttafel (`bankett`) und bleibt es; das Teamfoto
mit dem Schild steht auf `team.html`, wo es hingehört. Die Messung darunter
gilt weiter, denn sie gilt dem Zuschnitt, nicht der Seite.

Zwischenzeitlich stand das Teamfoto im Hero der Startseite — bestellt mit
der Bedingung, dass oben keine Gesichter zu erkennen sind.

Der erste Versuch war ein eigener Ausschnitt aus `assets/img/team-herm.jpg`
(1600 × 880) ab der Schulterlinie: 1600 × 520, also **3,08:1**. In einem
Hero von 1,77:1 muss der Browser so einen Streifen um das 1,74-fache
vergrößern und schneidet zwei Fünftel der Breite weg — das Schild füllte
das Bild, die Überschrift lag auf dem Logo, und gemessen waren es 3,1
Hochrechnung von echten Pixeln.

Der gelieferte Zuschnitt (1290 × 745) liegt mit **1,73:1** fast genau auf
dem Seitenverhältnis des Heros: kein Zoom, kein Beschnitt, das Schild ganz
im Bild. **Ein Zuschnitt, der zum Rahmen passt, ist jeder
`object-position` überlegen** — und er kostet keine einzige Zeile CSS.

**Der Schleier wurde dabei neu gemessen**, wie bei jedem Motivwechsel, und
das ist der Teil, der hier stehen bleibt: für das Schild-Motiv ergaben sich
.52 am Schreibtisch und .58 am Telefon (am schlechtesten Pixel 4,88:1 an
der Auszeichnungszeile bei .52, 3,17:1 bei .38). Mit der Rückkehr zur
Restauranttafel gelten wieder deren Werte, gemessen mit denselben fünf
Phasen. **Der Schleier gehört zum Motiv, nicht zum Hero: wer das Kopfbild
tauscht, misst ihn neu, in beide Richtungen.** Mit dem Wechsel auf
Dunkelblau sind aus .56/.62 dann .59/.65 geworden, und auch das ist
gemessen, nicht gedreht: die Tinte ist von Weiß auf Beige gegangen, und
#F6F1E8 trägt gegen einen hellen Bildpunkt rund sechs Prozent weniger als
#FFFFFF. Die Auszeichnungszeile fiel dadurch auf 4,17:1 und brauchte 4,5.
**Wer die Tinte ändert, ändert jeden Schleier mit** — auch wenn er das
Foto gar nicht angefasst hat.

---

## Dunkelblau und Beige, September 2026

Dritter Durchgang derselben Bewegung, und der billigste. Bestellt war
Dunkelblau als Grund mit Beige und Weiß darauf: „Dunkelblau erzeugt
sofort ein Gefühl von Vertrauen, Stabilität und Professionalität. In
Kombination mit warmem Beige wirkt es nahbar und exklusiv statt steif."
Sonst nichts verändern.

| | Anthrazit | Dunkelblau |
|---|---|---|
| `--grund` | #15161B | **#0F1C2E** |
| `--flaeche` | #21232B | #1B2C44 |
| `--tinte` | #FFFFFF | **#F6F1E8** |
| `--tinte-3` | rgba(255,255,255,.58) | rgba(246,241,232,.58) |
| Marke | #A78BFA (Violett) | #D9C2A0 (Beige) |
| Kontrastfehler nach WCAG | 0 | **0** von 16 Seiten, Schreibtisch und Telefon |

**Nicht Weiß auf dem Blau.** Weiß auf Dunkelblau ist das Bild jeder
Bank-App; das Warme, das bestellt war, kommt allein aus der Tinte.
#F6F1E8 liegt mit 15,2:1 praktisch so hoch wie Weiß (16,4:1) und sieht
über eine ganze Seite Fließtext deutlich weicher aus.

### Was drei Umbauten bewiesen haben, und was sie kosten

Die Tokennamen tragen seit 2026 die Rolle und nicht die Farbe. Der
Ertrag daraus lässt sich inzwischen beziffern: Schwarz → Off-White →
Anthrazit → Dunkelblau sind vier Grundtöne, und der letzte Wechsel hat
**null neue Regeln** gekostet. Umgestellt sind die Werte in `:root` und
dieselben Werte in `.auf-dunkel`.

Kostenlos ist er trotzdem nicht, und die Rechnung steht unten: **was ein
Farbwechsel nicht erreicht, sind die Stellen, die eine Farbe fest
eingetragen haben.** Es waren sieben, und drei davon waren Fehler, die
seit dem Umbau auf Dunkel in der Auslieferung standen.

### `--violet` hieß `--violet`, und das war der letzte Name mit einer Farbe

Der Markenton ist jetzt Beige. Eine Regel mit `var(--violet)`, die Beige
malt, liest niemand mehr richtig — dieselbe Falle wie `--ink`/`--paper`
2026, nur kleiner. Er heißt deshalb `--marke`, und `--orchid` heißt
`--marke-2`. 22 Stellen, maschinell, kein Pixel Unterschied.

`--glow` ist dabei ersatzlos entfallen: definiert, nirgends benutzt.
Gefunden mit einem `grep` nach dem Namen — derselbe Handgriff wie bei
`@keyframes heroRise`, nur ging er diesmal gut aus.

**Und die zweite Stufe geht jetzt nach UNTEN.** `--orchid` war das
*hellere* Violett. In Beige wäre das hellere fast die Tinte: der
Markenpunkt im aktiven Menüpunkt stünde in #EADCC4 neben Schrift in
#F6F1E8 und wäre kein Punkt mehr, sondern ein Tippfehler. `--marke-2`
ist deshalb #C8A87A — eine Stufe tiefer, deutlich gesättigter, 7,6:1.

**Das ist der allgemeine Unterschied zwischen einem bunten und einem
warmen Akzent:** Violett trägt neben weißer Schrift durch den Farbton,
Beige nur durch den Abstand zur Tinte. Wer von bunt auf warm wechselt,
muss jede Stelle ansehen, an der Marke und Tinte nebeneinanderstehen.

Genau dort steckte auch ein Fehler, der zwei Farbschemata überlebt hat:
im Einsatzband standen alle fünf Punkte auf voller Tinte, weil
`.einsatzband i{ opacity:.55 }` wirkungslos ist —
`[data-stagger].in > *{ opacity:1 }` gewinnt mit 0,2,1 gegen 0,1,1. Mit
Violett fiel das nicht auf, weil eine andere Farbe auch neben voller
Tinte noch trug. Die gedämpfte Stufe steht jetzt als **Farbe**
(`var(--tinte-3)`), und keine Deckkraftregel kann sie mehr überholen.

### Drei helle Flächen, die seit dem Umbau auf Dunkel ausgeliefert wurden

Alle drei am Telefon, alle drei unlesbar, alle drei von keiner Prüfung
gemeldet:

| Wo | stand auf | sichtbar ab |
|---|---|---|
| `.appleiste` | rgba(255,255,255,.94) | sofort — weiße Leiste, weiße Beschriftung, weißes Wortzeichen |
| `.appleiste.faehrt` | Verlauf in rgba(247,246,243,…) | beim Scrollen |
| `header.nav.scrolled` (≤980 px) | rgba(247,246,243,.94) | nach dem ersten Scrollen |

Die Leiste unten ist der Hauptweg am Telefon — Start, Leistungen, Jobs,
Anfrage. Sie war seit dem Umbau eine weiße Fläche mit weißer Schrift
darauf, gemessen 1,05:1.

**Warum die Kontrastprüfung sie nicht gefunden hat**, und das ist der
Teil, der hier stehen bleibt: `rgba(…,.94)` ist **nicht deckend**. Der
Prüfer sucht den ersten deckenden Vorfahren und findet den dunklen
`body`; gegen den besteht weiße Schrift natürlich. Das ist exakt
dieselbe Lücke wie beim Foto im Hero („Kontrast auf einem Foto lässt
sich nicht aus dem DOM rechnen") — nur dass hier kein Foto im Spiel war
und deshalb niemand daran gedacht hat.

Die anderen beiden waren zusätzlich **an einen Zustand gebunden**
(`.scrolled`, `.faehrt`). Eine Prüfung, die eine frisch geladene Seite
ansieht, sieht keinen davon.

Zwei Regeln daraus:

- **Eine durchscheinende Fläche ist für eine DOM-Prüfung kein Grund.**
  Wer eine baut, prüft sie im Bild.
- **Ein Verlauf, der eine Fläche auflösen soll, nimmt die Farbe der
  Fläche** — keine eigene. Beide Verläufe hier hatten eine eigene, und
  beide sind deshalb beim Farbwechsel hängengeblieben.

### Die Symbole gehörten zwei verschiedenen Schemata an

`site.webmanifest` nennt drei Symbole. Zwei davon (`app-icon-192`,
`app-icon-512`) waren ein **dunkles** Zeichen auf **Weiß**, das dritte
(`app-icon-maskable-512`) ein helles auf Schwarz. Welches ein Telefon
nimmt, hängt allein an seiner Auflösung — auf dem einen Gerät lag das
Zeichen also auf einer weißen Kachel, auf dem nächsten auf einer
schwarzen. Dazu trug das Manifest `background_color: #F7F6F3`, den Grund
der hellen Fassung: der Startbildschirm der abgelegten Anwendung blitzte
hell auf, bevor die dunkle Seite kam.

Abgeleitete Dateien, die von Hand gepflegt werden, laufen beim ersten
Farbwechsel auseinander — dasselbe Argument wie bei den Bildstufen.
`tools/symbole-bauen.py` rechnet deshalb alle acht (drei App-Symbole,
Apple-Touch-Icon, drei Favicons, `favicon.ico`) aus **einer** Vorlage
und **zwei** Zahlen, die `--grund` und `--tinte` entsprechen. Ein
Farbwechsel ist danach ein Lauf.

## Die Palette aus der Vorlage

Nach Dunkelblau/Beige kam eine konkrete Vorlage: eine Luftaufnahme von
Strand und Wasser, daneben fünf Kacheln. „Genau diese Farben, überall."

**Gemessen, nicht geschätzt.** Median eines Fensters in jeder Kachelmitte,
damit die JPEG-Artefakte nicht mitreden:

| | Kachel | Rolle |
|---|---|---|
| `#D8D4D1` | helles Warmgrau | Tinte auf dunklem Grund · **die helle Bahn** |
| `#BCB3AA` | Taupe | die abgesetzte Fläche auf der hellen Bahn |
| `#6F928E` | Salbei | Markenton auf dunklem Grund |
| `#285E60` | Petrol | Markenton auf der hellen Bahn |
| `#143336` | tiefes Petrol | **Seitengrund** |

Jede der fünf steht in einer Rolle. Abgeleitet sind nur die Zwischenstufen
(`--flaeche-2`, `--flaeche-3`) und eine hellere Fassung des Salbeis, die
Schrift tragen muss — dazu unten.

### Was diese Palette teurer macht als jede vorige

Ihre hellste Farbe ist **#D8D4D1 und nicht #F6F1E8**. Gegen den Grund sind
das 9,2:1 statt 15,2:1 — genug für jeden Text, aber ein Viertel weniger
Luft. **Keiner der alten Werte liess sich mitnehmen.** Nachgezogen werden
mussten:

| | vorher | jetzt | warum |
|---|---|---|---|
| `--tinte-3` dunkel | .58 | **.70** | .58 ergab gegen #143336 nur 4,12:1 |
| `--tinte-3` hell | .66 | **.74** | .70 meldete die Prüfung an drei Stellen mit 4,3:1 |
| `--offen-ton` hell | #B0350B | **#97290A** | #B0350B lag mit 4,24:1 knapp darunter |
| Schleier im Hero | .56 | **.59** | siehe unten — und das ist WENIGER, nicht mehr |

Der Abstand zwischen `--tinte-2` (.82) und `--tinte-3` (.70) ist damit
knapper als früher. Das ist der Preis der Vorlage, kein Versehen.

### Die helle Bahn ist das Warmgrau, nicht das Taupe

Der naheliegende Griff wäre das Taupe gewesen — es ist die „schönere" der
beiden hellen Kacheln. Gemessen geht es nicht: auf #BCB3AA trägt die Tinte
6,5:1, und die gedämpfte Stufe bräuchte dort **.86**. Dann sieht sie nicht
mehr gedämpft aus, und die Staffelung zwischen Überschrift, Fliesstext und
Bildunterschrift fällt auf der hellen Bahn in sich zusammen.

Auf #D8D4D1 sind es 9,2:1 und .74 — eine echte Stufe. Das Taupe steht
deshalb dort, wo es hingehört: als abgesetzte Fläche **darauf**
(`--flaeche`, `--hell-2`) — Karte, Feld, Panel, Kachelgrund. Beide Farben
bleiben in Gebrauch, nur in der Reihenfolge, die die Messung vorgibt.

**Die allgemeine Form davon:** eine Palette gibt Farben, keine Rollen. Wer
die Rollen nach Geschmack verteilt statt nach Messung, verliert als erstes
die Textstaffelung — und zwar an der Stelle, an der sie niemand sucht.

### Der Markenton lag diesmal schon in der Vorlage

Zum ersten Mal musste der Akzent nicht erfunden werden: **#6F928E (Salbei)
auf dunklem Grund, #285E60 (Petrol) auf heller.** Das ist der angenehme
Teil einer gelieferten Palette.

Eine Ausnahme gibt es. `--marke-2` ist die Stufe, an der **Schrift** hängt
— der aktive Menüpunkt, eine Kontaktangabe im Hover. #6F928E allein sind
gegen #143336 nur 3,97:1: für einen Punkt von vier Pixeln genug (dort
gelten 3:1), für Text nicht. Deshalb eine Stufe heller, **#8FB0AC** mit
5,8:1. Das ist die einzige Farbe im Stylesheet, die nicht aus der Vorlage
kommt, und sie ist genau deren Salbei, nur aufgehellt.

### Der Schleier wurde kleiner, obwohl die Tinte dunkler ist

Das ist die lehrreichste Messung dieses Durchgangs. Mit der dunkleren
Tinte hätte der Schleier über dem Kopfbild **stärker** werden müssen: bei
unverändertem Text auf dem Foto waren es gemessen **.69 statt .56**, und
das Motiv war sichtbar zu.

Der Hebel war wieder nicht der Verlauf, sondern der Text darauf. Die
Auszeichnungszeile war als einzige **kleine** Schrift auf dem Foto die
bindende Bedingung — sie braucht 4,5:1, die Hauptzeile nur 3,0:1. Sie steht
jetzt im Auftaktband darunter, auf dunklem Grund, wo sie nichts kostet.

| | mit der Zeile auf dem Foto | ohne sie |
|---|---|---|
| Deckkraft, Schreibtisch | .69 | **.59** |
| Deckkraft, Telefon | .78 | **.61** |
| Hauptzeile, schlechtester Pixel über fünf Phasen | 4,46:1 | 3,23:1 (nötig 3,0) |

**Zum zweiten Mal dieselbe Lehre: ein Verlauf über einem Foto ist kein
Regler, sondern eine Folge davon, wie viel Text darauf steht.** Das Foto
ist dadurch heller als vor dem Palettenwechsel, nicht dunkler.

Nachzuziehen war dabei eine Kleinigkeit, die exemplarisch ist: die
Auszeichnungszeile brach im Auftaktband mitten in „JAHREN" um. Die
Hoechstbreite stand als `52ch` an der Spalte — aber `ch` ist die Breite der
Null **der jeweiligen Schrift**, und in der Spalte stehen zwei verschieden
laufende Schriften. Die Begrenzung gehört an den Absatz, nicht an die
Spalte.

---

## Der Farbtakt: dunkel, hell, dunkel

**Dieser Abschnitt beschreibt die Mechanik; die Farben darin sind der
Stand von damals** (Dunkelblau/Beige). Die Tabelle mit den heutigen Werten
steht oben unter „Die Palette aus der Vorlage" — die Mechanik ist
unverändert, und genau das ist ihr Ertrag: ein Palettenwechsel fasst sie
nicht an.

Auf den Farbwechsel folgte der Auftrag, aus den beiden Farben ein Spiel zu
machen: „ein Textfeld zum Beispiel blau und dann mit sanftem Farbübergang
modernes Beige im nächsten, so auch abwechselnd bei den Leistungen,
komplett auf der Website umsetzen."

**Es ist dieselbe Mechanik wie `.auf-dunkel`, nur andersherum.** `.auf-hell`
dreht die Tonleiter, und jede Regel im Stylesheet, die `var(--tinte)` oder
`var(--linie)` schreibt, stimmt dann von selbst. Hinzugekommen sind rund
zwanzig Zeilen CSS und eine Tabelle; angefasst wurde keine einzige Regel
eines Abschnitts.

| | blau | beige |
|---|---|---|
| Grund | `--dunkel` #0F1C2E | `--hell` #E9E0D1 |
| Fläche | #1B2C44 | #F2EBDE |
| Tinte | #F6F1E8 | #0F1C2E |
| gedämpft | rgba(…,.58) | rgba(…,**.66**) |
| Marke | #D9C2A0 | **#7A5A2C** |
| Warnton | #F0A19D | **#B0350B** |

Die drei fetten Werte sind die Stelle, an der ein Farbwechsel immer
schiefgeht: **eine Tonleiter ist nicht symmetrisch.** Das steht seit 2026
dreimal in dieser Datei, und es gilt hier zum vierten Mal. Die gedämpfte
Stufe mit .58 mitzunehmen ergäbe gegen #E9E0D1 nur 4,04:1; .62 sind 4,41:1,
also immer noch unter der Grenze; .66 sind 4,94:1. Und der Markenton kippt
ganz: #D9C2A0 auf Beige sind **1,2:1** — dasselbe Beige auf sich selbst.

### Der Übergang ist ein Hintergrund, kein Element

Die Blende zwischen zwei Bahnen ist ein Verlauf im `background-image` der
hellen Bahn selbst: oben von Dunkelblau nach Beige, unten zurück. Das ist
die billigste aller Lösungen und die einzige ohne Nebenwirkung — **es kommt
kein Element hinzu**, es gibt kein Pseudoelement, das mit dem Inhalt um die
Stapelreihenfolge streitet, und keine Regel, die an der Nachbarschaft
hängt.

Vier Dinge daran sind nicht beliebig:

1. **Grund und Blende sind zwei verschiedene Eigenschaften.**
   `background-color` für die Farbe, `background-image` für den Verlauf.
   `.cta` und `.bereichsblock` tragen einen eigenen Grund; stünde die
   Blende in der Kurzschreibweise `background`, löschten die beiden sie
   wieder — dieselbe Falle wie `padding` gegen `.wrap`. Beide Regeln sind
   deshalb auf `background-color` umgestellt.
2. **Der Endpunkt heisst `rgba(15,28,46,0)`, nicht `transparent`.**
   `transparent` ist rgba(0,0,0,0); der Browser interpoliert im
   sRGB-Raum, und der Weg von Dunkelblau nach durchsichtigem SCHWARZ führt
   durch einen grauen Streifen. Der sähe an jeder Kante aus wie Schmutz.
3. **Die Blende ist gedeckelt: `min(var(--blende), 22%)`.** Sie steht in
   Pixeln, die Bahnen sind aber verschieden hoch. Die Vertrauensleiste der
   Startseite misst 243 px; mit 78 px an jeder Kante waren 156 davon
   Verlauf, und übrig blieb ein Streifen von 87 px — im Bild sah der
   Abschnitt schlicht blau aus. Die Grenze in Prozent bezieht sich auf die
   Höhe des Verlaufskastens und hält in jeder Bahn mindestens 56 % volle
   Farbe. **Ein Effekt, der in absoluten Werten an beiden Kanten eines
   Kastens sitzt, muss wissen, wie hoch der Kasten ist.**
4. **Wo die Bahn an ein Foto stösst, fällt die Blende weg**
   (`data-blende="oben"` / `"unten"` / `"keine"`). Ein Foto läuft ohnehin
   schon in den Seitengrund aus; zwei Verläufe hintereinander sind ein
   doppelter Nebel.

### Was WO steht, entscheidet eine Tabelle

`tools/farbtakt.py` setzt `auf-hell` und `data-blende` auf die
`<section>`-Tags. Es sind sechzehn Dateien und rund fünfzig Abschnitte; von
Hand gesetzt fällt der Takt beim ersten neuen Abschnitt auseinander, und
zwar unbemerkt — zwei helle Bahnen nebeneinander sehen auf einem
Bildschirmfoto nur nach einem etwas breiteren Block aus. Das Skript prüft
genau das und bricht ab. Es ist mehrfach ausführbar, `--stand` zeigt nur,
`--aus` nimmt den Takt zurück.

Drei Regeln stehen hinter der Tabelle:

- **Nie zwei helle Bahnen hintereinander.**
- **Was auf einem Foto sitzt, bleibt blau.** Kopfbild, Bildband, Kopfband
  der Unterseiten.
- **Zwei Abschnitte, die zusammengehören, bekommen dieselbe Farbe.** Wo
  `padding-top:0` steht, ist der Abschnitt die Fortsetzung des vorigen (das
  Bildband der Leistungsseiten, der Ansprechpartner unter dem Formular).
  Eine Farbkante mitten in einem Gedanken liest als Fehler.

Das Anfrageformular auf `kontakt.html` bleibt bewusst blau. Technisch
spräche nichts dagegen — `color-scheme:light` in `.auf-hell` erledigt die
Bedienteile, die der Browser zeichnet, und das Bewerbungsformular auf
`jobs.html` steht auf einer hellen Bahn. Es ist eine Frage des Zeitpunkts:
das ist der Weg, über den Geld hereinkommt, und er wird am Tag vor dem
Live-Gang nicht als letztes umgestellt.

### Vier Stellen, die eine Farbe fest eingetragen hatten

Die Tonleiter dreht alles, was über Tokens läuft. Was sie nicht erreicht,
ist eine Farbe, die in einer Regel steht — und genau das waren die vier
Fehler, die der Takt sichtbar gemacht hat:

| Wo | stand auf | auf der hellen Bahn |
|---|---|---|
| `.form ::placeholder` | rgba(246,241,232,.3) | unsichtbar (Bewerbungsformular) |
| `.schritt::before` | rgba(246,241,232,.16) | unsichtbar (die vier Schritte auf kontakt.html) |
| `.pullquote` | rgba(246,241,232,.35) | unsichtbar (das Zitat auf referenzen.html) |
| `.member__initialen` | rgba(246,241,232,.20) | (noch blau, aber dieselbe Bauart) |

Die Lösung ist in allen vier Fällen dieselbe und braucht **kein neues
Token**: die Farbe kommt aus `var(--tinte)`, das Gedämpfte aus `opacity`
am Element. Eine Deckkraft ist tonleiterneutral, eine Farbe ist es nicht.

### Fremde Zeichen kann eine Tonleiter nicht drehen

Die fünf Referenzlogos sind **weiss auf durchsichtigem Grund** — gemessen
an jedem deckenden Pixel: 255,255,255. Auf der Startseite steht die Reihe
auf Blau und alles ist gut; auf `referenzen.html` steht sie seit dem Takt
auf Beige, und dort waren die Zeichen nicht gedämpft, sondern weg.

`filter:invert(1)` dreht eine einfarbig weisse Zeichnung exakt um und macht
sie schwarz — verlustfrei, weil es nur einen Farbwert gibt, und es ist die
Fassung, die diese Häuser selbst auf hellem Papier benutzen. In unser Blau
eingefärbt wäre es eine grössere Freiheit mit einem fremden Zeichen als die
Umkehr. **Die Regel gilt nur für diese Dateien:** ein `filter:invert` auf
alles, was in einer hellen Bahn liegt, drehte jedes Foto ins Negativ.

### Gemessen wird die Lage, nicht die Regel

Die Frage, die eine Blende aufwirft, ist nicht „stimmt der Verlauf", sondern
**„steht Text darin".** Dunkle Tinte im dunklen Teil der Blende ist dunkel
auf dunkel, und im DOM sieht man das nicht: der Abschnitt hat ja die
richtige Grundfarbe.

`scratchpad/imnebel.js` rechnet deshalb für jede Bahn die Zone aus (mit
demselben Deckel von 22 %) und hält jedes Textelement dagegen. Stand über
dreizehn Seiten: **25 helle Bahnen, 0 Textstellen in der Blende**, am
Schreibtisch wie am Telefon.

---

### Der eine Wert, der dem Farbschema NICHT folgen darf

`.team-buero` steht nicht auf `--grund`, sondern auf dem gemessenen
Hintergrundton der Porträtaufnahmen. Nachgemessen läuft deren
Studiohintergrund als Vignette von (48,46,51) oben links auf (20,20,22)
unten rechts; der Wert stand auf #2E2D33, also auf der hellsten Ecke.

Er ist auf **#272C38** gerückt: dieselbe Helligkeit, eine Spur ins
Blaue. Gegen die Ecke sind das sieben Stufen im Blaukanal — die Vignette
selbst überstreicht neunundzwanzig, eine Kante entsteht dadurch nicht.
Wer ihn dagegen auf `--grund` setzt, bekommt vier graue Rechtecke mit
sichtbarem Rand auf blauem Papier zurück. **Er folgt der Aufnahme, nicht
der Seite, und er ändert sich erst mit ihr.**

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

### Der Vorspann: auftauchen, polieren, schneiden

Beim ersten Öffnen läuft ein Einstieg in drei Schritten, alles in
Schwarzweiss und alles in CSS — kein Video, keine Bibliothek:

| ab | was | wie |
|---|---|---|
| 0,10 s | eine Lichtbahn zieht quer durch das dunkle Bild | `#preloader::before`, `preLicht` |
| 0,30 s | das Wortzeichen taucht auf: Unschärfe → Schärfe, bis auf **66 %** Helligkeit | `.pre-logo__img`, `preAuftauchen` |
| 1,85 s | ein Glanz läuft **durch die Buchstaben** | `.pre-glanz`, `preGlanz` |
| 2,10 s | das Zeichen geht auf volles Weiss | `preVoll` |
| 2,75 s | **Schnitt** auf die Startseite | `main.js` |

**Warum das Zeichen zwischendurch nur bei 66 % steht.** Das Wortzeichen ist
selbst weiss. Ein weisser Glanz auf Weiss ist nichts — der erste Versuch sah
aus, als wäre der Glanz gar nicht da. Er wird erst sichtbar, wenn das Zeichen
dunkler ist als er: dann ist er die hellste Stelle im Bild, und hinter ihm
bleibt volles Weiss zurück. Das liest man als „das Zeichen wird poliert",
nicht als „da wandert ein Balken".

**Der Glanz liegt in einer Maske, nicht über einem Kasten.** `.pre-glanz`
trägt das Logo als `mask` über einem hellen Verlauf; sichtbar wird der
Verlauf nur dort, wo das Zeichen deckt. Ein Balken über dem Bildkasten wäre
das offensichtliche, aber deutlich billigere Bild.

**Der Abgang ist ein Schnitt, kein Übergang.** Die 0,16 s in `#preloader.done`
sind kein Ausblenden, sondern nehmen nur das Flackern eines harten
Einzelbild-Wechsels weg; unterhalb von etwa 0,2 s liest das Auge einen
Schnitt. Vorher fuhr das Zeichen der Kamera entgegen und überblendete in den
Hero — das ist auf Wunsch dem direkten Sprung gewichen.

**Danach steht die Seite einfach da: `.sofort`.** Liefe nach dem Schnitt noch
die Einfahrt des Heros, wären es zwei Vorspänne hintereinander — erst das
Zeichen, dann eine Seite, die sich auch noch aufbaut. `main.js` setzt deshalb
`sofort` auf `<html>`, und der Block dazu in `styles.css` schaltet die
Einfahrt ab.

Die Einfahrt bleibt aber im Markup, denn sie wird noch gebraucht:

| Klasse | wann | was |
|---|---|---|
| `sofort` | erster Aufruf, keine reduzierte Bewegung — also: es kommt ein Vorspann | Hero steht von der ersten Zeichnung an fertig da |
| `los` | zweiter Aufruf oder reduzierte Bewegung — also: es kommt keiner | alle Einfahrten starten |

Beide werden im selben Moment gesetzt, im Kopf der Seite, und schließen
einander aus. Eine dritte Klasse `vorspann` gab es einmal; sie ließ den
Hero warten, bis der Vorspann abging — genau die Wartezeit, die den LCP auf
2996 ms hob.

Beim **zweiten Aufruf im selben Besuch** gibt es keinen Vorspann
(`sessionStorage`) — dort ist die Einfahrt der Einstieg, und `sofort` wird
nicht gesetzt. Dasselbe bei reduzierter Bewegung.

Die Entscheidung `vorspann`/`los` fällt im **Inline-Skript im Kopf** von
`index.html`, nicht in `main.js`. Stünde sie am Seitenende, liefe die
Einfahrt schon, bevor die Klasse gesetzt ist — und man sähe ein Aufblitzen.

Wer eine weitere Einfahrt dazunimmt, hängt sie an `.los`, trägt sie in den
`.kein-js`-Block ein und prüft, ob sie auch in den `.sofort`-Block gehört.

**`sofort` wird beim ersten Aufruf sofort gesetzt, nicht erst beim Abgang
des Vorspanns — und daran hing die Ladezeit.** Zuerst bekam der Hero seine
Einfahrt, und `sofort` kam erst, wenn der Vorspann fertig war. Der Hero
stand damit die ganzen 2,75 Sekunden auf `opacity:0`, und das größte
sichtbare Element der Seite galt dem Browser erst danach als gezeichnet:
**LCP 2996 ms.** Da der Vorspann ohnehin deckend darüber liegt, sieht
niemand, ob der Hero darunter einfährt oder schon steht. Also steht er von
der ersten Zeichnung an fertig da — **LCP 356 ms**, bei unverändertem Bild.

Die Lehre ist allgemeiner als der Fall: **eine Einfahrt unter einer
deckenden Fläche ist keine Gestaltung, sondern nur eine späte Messung.**

**Wer an den Zeiten dreht, muss zwei Stellen anfassen:** die Animationen in
`styles.css` und die beiden `setTimeout` in `main.js`. Der Schnitt muss nach
dem letzten Bild der letzten Animation kommen — ein Vorspann, der mitten in
seiner eigenen Bewegung abgeschnitten wird, liest als Fehler und nicht als
Tempo.

### Die stehende Kamerafahrt im Kopfbild

Bestellt war „das Foto als bewegtes Hintergrundvideo". Gebaut ist eine
Kamerafahrt auf dem Standbild, und das ist nicht dasselbe in schlechter,
sondern dasselbe in besser. Der Film wurde gebaut und gewogen, dieselbe
Fahrt, dasselbe Motiv:

| Fassung | Größe |
|---|---|
| 1280 px, 25 B/s, VP9 crf 40 | 2255 KB |
| 1152 px, 20 B/s, Rauschfilter, VP9 crf 42 | 1794 KB |
| 1152 px, 20 B/s, Rauschfilter, VP9 crf 46 | 1213 KB, sichtbar weich |

Ein langsam wanderndes Foto hat in keinem Bild eine ruhende Fläche —
deshalb kostet jedes Bild voll, und der Encoder kann nichts einsparen. Die
Startseite lädt heute 760 KB an Bildern; der Film hätte sie verdreifacht,
und zwar auf dem kritischen Pfad. Dieselbe Bewegung kostet als
`@keyframes` null Byte, bleibt in jeder Auflösung scharf und läuft auf der
Grafikkarte. **Ein Standbild, das sich bewegt, ist eine Animation und kein
Video — wer daraus eine Datei macht, kauft Unschärfe für Geld.**

Drei Dinge daran sind nicht beliebig:

1. **`alternate` mit `ease-in-out` ist die ganze Mechanik der Schleife.** An
   beiden Enden ist die Geschwindigkeit null, die Umkehr ist deshalb nicht
   zu sehen. Eine gleichförmige Fahrt müsste am Ende zurückspringen.
2. **Sie läuft nur, solange der Hero zu sehen ist.** `.live` setzt der
   vorhandene Motor ohnehin an jedes `[data-weg]` — es kommt keine Zeile
   JavaScript dazu. Eine dauerhaft laufende Animation hielte die
   bildschirmfüllende Ebene für immer im Grafikspeicher, und genau davor
   warnt „Die teuerste Falle".
3. **Kein `will-change`.** Die laufende Animation legt die Ebene selbst an
   und gibt sie beim Anhalten wieder frei. `will-change` nähme ihr genau
   das.

**Dieselbe Fahrt trägt das Bildband darunter** (`.schaubild`, zweites Motiv,
randlos, direkt unter dem Kopfbild). Es ist bewusst kein `.wide-shot` — das
sitzt im Satzspiegel und hat ein festes Seitenverhältnis; hier geht das Bild
bis an die Fensterkante und bekommt oben und unten einen Verlauf in den
Seitengrund, sonst stünde es als Kasten zwischen zwei schwarzen Flächen.

### Was eine Vorlage tragen kann, und was nicht

Die beiden Motive der Startseite kommen aus Dateien mit **0,31 Megapixel**
(640 × 480 und 679 × 452). Zum Vergleich: 4K sind 8,29 MP, das vorige
Kopfbild hatte 16,8 MP. Das ist ein Siebenundzwanzigstel von 4K und ein
Vierundfünfzigstel der vorigen Vorlage.

Was daraus folgt, und warum es so und nicht anders im Code steht:

- **Keine zweite Stufe.** `team-einsatz` und `bar-gruen` stehen deshalb
  **nicht** in `BEDARF` von `bilder-vergroessern.py`. Eine `…-gross`-Datei
  mit 2560 px wäre aus 640 px eine Vervierfachung der Kantenlänge: Gewicht
  ohne ein einziges zusätzliches Bilddetail, und damit genau das, was „Die
  Obergrenze kommt nicht von der Dateigröße" verbietet.
- **Hochgerechnet wird trotzdem**, auf 1600 px, mit Lanczos und der
  gemessenen Nachschärfung. Das ist kein Detailgewinn, sondern eine
  Arbeitsteilung: einmal hier statt bei jedem Aufruf im Browser mit dem
  einfachsten Filter, den es gibt. Aus einer schlechten Vorlage wird dadurch
  keine gute, nur die bestmögliche Darstellung der vorhandenen.
- **Ein Video wäre hier doppelt falsch.** Ein Bild ohne Detail in 4K zu
  kodieren erzeugt eine große Datei, die genau so wenig zeigt wie die
  Vorlage. Die Rechnung dazu steht oben.

Sobald die Aufnahmen in voller Größe vorliegen, ist es ein Handgriff:
dieselben Dateinamen unter `assets/img/`, beide Stämme zurück in `BEDARF`,
einmal `bilder-vergroessern.py`. Gebraucht werden mindestens 2400 px an der
langen Kante (`docs/foto-briefing.md`).

**Der Zuschnitt des Kopfbilds ist Teil der Typografie, nicht der Fotografie.**
Die Überschrift ist drei Zeilen hoch und nimmt die linke Hälfte der unteren
Bildhälfte ein. Ein Motiv in der Mitte liegt dann zwangsläufig darunter,
und zwar in *jeder* senkrechten Lage: schiebt man den Ausschnitt hoch,
steht es hinter der ersten Zeile, schiebt man ihn runter, hinter der
dritten. Waagerecht verschieben hilft nicht — die Vorlage ist quadratisch,
das Fenster quer, `object-fit:cover` deckt also über die Breite, und
`object-position` waagerecht ist wirkungslos. Am Telefon ist es genau
umgekehrt: dort deckt es über die Höhe, und der senkrechte Wert ist
wirkungslos. Beide Werte lassen sich deshalb getrennt einstellen, ohne
Medienabfrage.

Bleibt der Zuschnitt: aus dem Quadrat wird ein kleineres Quadrat
geschnitten, das weiter links ansetzt — dadurch wandert das Motiv nach
rechts, aus der Schriftfläche heraus. Bei Fenstern zwischen 981 und 1279 px
reicht das nicht, weil `cover` dort kaum noch etwas wegschneidet und das
Motiv nach oben in die erste Zeile rutscht; dort steht der Anschnitt
deshalb ganz oben (`object-position:50% 0%`). Nachgemessen bei 1024 × 768:
Unterkante der ersten Zeile 357 px, die Köpfe wandern dabei um 82 px nach
unten.

### Die Falle: Tests, die blind warten

Der Vorspann ist zweimal länger geworden, und zweimal fielen dadurch Tests
um, die eine feste Zahl abwarteten: einmal meldete `treffer.js` jede
Trefferfläche als zu klein, einmal `verdeckt.js` die Startseite als verdeckt.
Beide Male war die Website in Ordnung — gemessen wurde die schwarze Fläche
des Vorspanns.

Wer auf den **Inhalt** einer Seite schaut, wartet deshalb nicht auf eine
Zahl, sondern auf den Zustand (`scratchpad/_warten.js`):

```js
await p.waitForFunction(() => {
  const v = document.getElementById('preloader');
  if(!v) return true;
  const cs = getComputedStyle(v);
  return cs.display === 'none' || cs.visibility === 'hidden';
});
```

**Drei Geschwister derselben Falle**, alle bei der Abnahme aufgetreten und
alle zuerst als Fehler der Website gemeldet:

- **Die Seite wächst beim Durchscrollen.** Faul geladene Bilder kommen
  dazu und schieben alles nach unten. Ein Test, der `scrollHeight` einmal
  am Anfang misst, hört zu früh auf und meldet dann die letzten Aufblenden
  als offen — auf der Startseite waren das 25 Elemente, die in Wahrheit
  alle ihr `.in` hatten. Die Höhe gehört bei **jedem** Schritt neu gemessen.
- **`offsetParent !== null` heißt nicht sichtbar.** Ein Element mit
  `visibility:hidden` behält seinen Platz im Layout. Die geschlossenen
  Unterleisten und das geschlossene Vollbildmenü sind genau so gebaut
  (und müssen es sein, siehe „Die Unterleisten unter der Kopfzeile"), und
  der Test meldete sie als unsichtbaren Text. Gefragt werden muss die
  ganze Elternkette nach `display`, `visibility` und `hidden`.
- **Ein Test, der zu schnell scrollt, hängt den Beobachter ab.** Mit 500 px
  je 60 ms sind das 8000 px je Sekunde — schneller, als ein Mensch je
  scrollt, und schneller, als der IntersectionObserver meldet. Der Test sah
  dann zwei Aufblenden als offen, die bei normalem Tempo längst ihr `.in`
  hatten; beim nächsten Lauf waren es andere, und einmal keine. **Ein
  Befund, der zwischen zwei Läufen wandert, ist keiner.** Nachgemessen bei
  900 px/s, je drei Läufe im Repository und im Paket: null. Der Test läuft
  seitdem mit 200 px je 45 ms.

Alle drei sind Messfehler, keine Befunde. Die Regel dahinter ist dieselbe wie
bei den drei Messungen zu totem Code: **wer eine Auffälligkeit auf allen
sechzehn Seiten gleichzeitig findet, hat meistens seinen Test gemessen und
nicht die Website.**

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
konstant, während die andere Spalte weiterwandert. **Mit ausgeschaltetem
`scroll-behavior:smooth`** — sonst misst man mitten in einer laufenden
Fahrt und sieht beide Spalten gleich stehen, was wie „klebt gar nicht"
aussieht und nur heißt, dass das Intro noch unter dem Fenster liegt.

**Was dort unter der Überschrift steht, ist deshalb gedeckelt.** In der
linken Spalte sitzt seit September ein Foto (`.intro__ort`, ein
geschmückter Scheuneneingang). Es füllt genau die Fläche, die das Kleben
zwangsläufig frei lässt — auf dem Schreibtisch kostet es dadurch **null
Pixel Seitenhöhe**. Der Preis steht in der anderen Richtung: der Klebeweg
ist die Differenz beider Spalten, und die schrumpft mit jedem Pixel, den
das Foto hoch ist.

| | linke Spalte | rechte Spalte | Klebeweg |
|---|---|---|---|
| ohne Foto | 230 px | 945 px | 715 px |
| mit Foto (440 px) | 714 px | 945 px | **231 px** |

Deshalb `max-width:clamp(300px,31vw,440px)` — und zwar in **derselben**
Medienabfrage wie das Kleben, denn unter 981 px steht die Spalte ohnehin
über dem Text und das Foto nimmt die volle Breite. Wer den Deckel hebt,
nimmt der Überschrift das Kleben weg, ohne dass eine einzige Zeile CSS
dabei falsch aussieht.

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
| Balken unter der Kopfzeile | fährt heraus, die sechs Einträge kommen versetzt nach (`.megabar`) |
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
| Abschnittskanten | Einsatzlinie: ein violetter Punkt wandert mit `--lauf` nach rechts |
| Leistungsseiten, unter dem Kopfbild | Einsatzband: die Linie zieht sich auf, die Punkte kommen versetzt nach |

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

## Das Zeichen: Punkt und Linie

Die Website hat ein eigenes Zeichen, und es besteht aus genau zwei Formen:
**ein Punkt ist eine Position, eine Linie ist die Verbindung dazwischen.**
Das ist das Geschäft dieses Betriebs, auf das Knappste gebracht: Menschen
stehen an Stellen, und jemand hält sie zusammen.

Es tritt in zwei Zuständen auf, und beide benutzen dieselben Maße: eine
Haarlinie, Punkte von vier bis fünf Pixeln, genau ein Violett.

| | wo | was es zeigt |
|---|---|---|
| **Einsatzlinie** (`[data-spur]`) | Kante über größeren Abschnitten | eine Position, die sich bewegt |
| **Einsatzband** (`.einsatzband`) | einmal je Leistungsseite, zwischen Kopfbild und Text | eine Aufstellung, die steht |

### Die Einsatzlinie

Auf der Kante eines Abschnitts läuft ein kurzes helles Stück mit einem
violetten Punkt an der Spitze von links nach rechts. Wie weit, sagt
`--lauf` — es ist also scrollgeführt und steht still, wenn das Scrollen
still steht.

Vier Regeln, damit es Zeichen bleibt und nicht Effekt wird:

1. **Es kommt nichts hinzu.** Die Linie war schon da. Sie bekommt nur eine
   Richtung. Kein zweites Element, kein Kasten, kein Muster.
2. **Bewegt wird nur `transform`.** Der Punkt fährt auf einer eigenen Ebene,
   und die Ebene gibt es nur, solange der Abschnitt `.live` trägt.
3. **Violett nur als Punkt.** Vier Pixel, mehr nicht.
4. **Bei reduzierter Bewegung gar nicht.** Ohne Motor bliebe `--lauf` auf 0,
   der Punkt stünde dauerhaft links am Rand und sähe aus wie ein Fehler.

Angemeldet wird sie in `main.js`, und zwar nur an Abschnitten, die
**ohnehin schon eine Oberkante haben** (`borderTopWidth ≥ 0.5`). Wer eine
Linie zeichnet, wo vorher keine war, hat das erste Prinzip gebrochen.

### Das Einsatzband

Die sechs Leistungsseiten teilen einen Bauplan: dieselben Überschriften,
dieselbe Reihenfolge, dieselben Bausteine. Das ist richtig — sechs
Geschwisterseiten sollen ein System sein. Falsch war nur, dass sie sich
**vollständig** glichen und dadurch austauschbar wirkten.

Das Band ist die Antwort darauf. Es sitzt an der Kante zwischen Kopfbild
und Text — also dort, wo ohnehin ein Trenner hingehört — und trägt je Seite
eine andere Figur:

| Seite | Figur | Bild dahinter |
|---|---|---|
| Gastro-Personal | `reihe` | Servicelinie am Pass |
| Sicherheit | `posten` | über ein Gelände verteilt |
| Promotion & Hostess | `paare` | paarweise am Stand |
| Logistik | `kette` | verdichtet sich zum Tor hin |
| Fahrservice | `fahrt` | zwei Punkte, eine Fahrt dazwischen |
| Reinigung | `bahn` | Bahn für Bahn über die Fläche |

Drei Regeln:

- **Es zählt nichts.** Fünf Punkte heißen nicht fünf Leute. Eine Zahl wäre
  eine Behauptung über den Betrieb, und die darf hier nicht erfunden werden
  (siehe „Erfinde keine Informationen über das Unternehmen"). Die Figur
  zeigt eine Form. Wer sie als Zahl liest, hat zu viele Punkte gesetzt —
  **mehr als sechs gehören nicht hinein.**
- **Violett steht dort, wo die Leitung steht.** Ein Punkt je Seite, nie
  zwei.
- **Die Positionen stehen im Stylesheet, nicht im Markup.** Das Markup
  trägt nur den Namen der Figur und die Zahl der Punkte
  (`data-figur="posten"`); wo sie sitzen, sagt `:nth-child()`. Sonst
  stünden Einzelmaße im Markup, und das ist genau das, was „Ein Stylesheet,
  eine Wahrheit" verbietet.

Aufgedeckt wird über das vorhandene `data-stagger`: der Beobachter setzt
`.in` und gibt jedem Kind sein `--i`. **Keine Zeile JavaScript kommt dafür
hinzu.**

**Die Falle dabei:** `.kein-js [data-stagger] > *{ transform:none !important }`
trifft auch die Punkte des Bandes — und schöbe jeden um seinen halben
Durchmesser nach rechts. Die Linie selbst ist ein Pseudoelement und wird von
`> *` gar nicht erst erreicht, stünde also ohne Skript dauerhaft auf Breite
null. Beides braucht im `.kein-js`-Block eine eigene Zeile.

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
├── Referenzen · Team · Galerie · Jobs · Kontakt
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
| Startseite | Hero, Einstiegstext, Film, Ablauf, Referenzen, Anspruch, Anfrage | rund 10 Bildschirmhöhen |
| Dienstleistungen | die sechs Bühnen als Kamerafahrt, jede führt weiter | rund 15 |
| Sechs Detailseiten | alles im Einzelnen | je 7 bis 8 |

**Die Bühnen gehören nicht zurück auf die Startseite.** Sie sind dort nicht
zu lang gewesen, sondern am falschen Ort: eine Startseite ordnet und
verweist, die Tiefe steht dahinter.

### Die Bereiche stehen im Menü, nicht auf der Startseite

Zwischenzeitlich standen die sechs Bereiche als **Szenen** (`.svc`) auf der
Startseite: sechs randlose Flächen von je rund 76 svh, zusammen etwa 4700
Pixel. Das war die Zwischenstufe zwischen dem alten Kachelraster und dem, was
jetzt da steht — und es war immer noch ein Drittel der Startseite für etwas,
das nur verweist.

Seitdem hängen sie am Menüpunkt **Dienstleistungen**: ein Klick, und ein
Balken fährt unter der Kopfzeile heraus, in dem alle sechs mit Foto, Nummer
und Namen stehen, dazu ein Weg auf die Übersicht (siehe „Der Balken unter der
Kopfzeile"). Die Startseite zeigt jetzt, was nur sie zeigen kann: den
Einstieg, den Film und die Referenzen.

Was dabei **nicht** passiert ist: die sechs Adressen sind unverändert, sie
stehen weiter im Fuß jeder Seite, und `dienstleistungen.html` mit den sechs
Bühnen ist unangetastet. Es ist ein Weg weniger auf der Startseite, kein
Inhalt weniger auf der Website.

**Die Szenen gehören nicht zurück.** Wer sie wiederhaben will, hat einen
Grund zu nennen, der über „da war mehr los" hinausgeht: die Startseite hatte
mit ihnen vierzehn Bildschirmhöhen und ohne sie zehn, und der Weg zu den
Bereichen ist mit dem Balken kürzer als mit vier Bildschirmen Scrollen.

**Achtung bei Adressen:** `dienstleistungen.html` liegt neben dem Ordner
`dienstleistungen/`. Die Adresse `/dienstleistungen` ohne Endung ist
deshalb auf jedem Host eine Sonderregel — sie steht in `vercel.json`,
`netlify.toml` und `.htaccess` jeweils **vor** der Regel für die
Unterseiten.

---

## Typografie

- Auszeichnung: Bricolage Grotesque · Fließtext: Instrument Sans ·
  Technisches: Space Mono. Alle drei liegen lokal unter `assets/fonts/`.
- **Fünf Stufen, sonst nichts:** `--fs-mega` (Hero, Schluss,
  Fußzeile), `--fs-display` (Titel der Unterseiten), `--fs-h2`, `--fs-h3`,
  `--fs-h4`. Wer eine sechste clamp-Formel schreibt, hat eine Stufe zu viel.
- **`--fs-mega` ist eine Fläche, aber eine kleinere als früher.** Eine Zeile
  über die halbe Fensterbreite wird nicht gelesen, sie wird gesehen. Der
  Wert stand auf `clamp(3rem, 10.5vw, 9.5rem)` und war auf schwarzen Grund
  gerechnet: dort wirkt dieselbe Schrift kleiner. Auf hellem Grund mit
  dichterem Abschnittsrhythmus ist 9,5 rem eine Wand. Jetzt
  `clamp(2.4rem, 6.4vw, 5.4rem)`, und sie steht nur noch an zwei Stellen,
  im Schlussblock und in der Fußzeile.
- **Versalien nur da, wo sie etwas leisten** (`.u-caps`, Eyebrows,
  Kapitelmarken, Bühnentitel). Ein ganzer Satz in gesperrten Versalien wird
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

### Die Falle: der vierte Preload verdrängt die drei, die zuerst gebraucht werden

Im Kopf jeder Seite stehen zwei `rel="preload"` für Schriften: Bricolage
und Instrument Sans. Space Mono steht dort **nicht**, und das ist kein
Versehen.

Der naheliegende Gedanke war das Gegenteil. Der letzte verbliebene
Layoutsprung der Startseite kam vom Nachladen einer Schrift, und Space Mono
war die einzige der drei ohne Preload — Kopfnavigation und
Auszeichnungszeilen stehen in ihr. Also eingetragen, in alle sechzehn
Seiten. Gemessen wurde danach ein *schlechterer* Wert, und die erste
Messung über fünf Läufe legte sogar nahe, der Sprung sei dadurch von selten
auf ständig gewechselt.

Über je zwölf Ladevorgänge sieht es so aus:

| | Läufe mit Sprung | Mittel | Quellen |
|---|---|---|---|
| **mit** Space-Mono-Preload | 5 von 12 (0,00949) | 0,00395 | eyebrow, h1, hero__fuss, scrollcue |
| **ohne** | 2 von 12 (0,00985) | 0,00171 | nav__links, nav__cta |

Der Preload hat getan, was er sollte — der Sprung der Kopfnavigation ist in
der unteren Zeile die einzige verbliebene Quelle und in der oberen ganz
verschwunden. Dafür ist der Hero häufiger umgesprungen: eine vierte Datei
in derselben Warteschlange verzögert die drei, die für das erste Bild
wirklich gebraucht werden. Eingetauscht wurde ein Sprung von 0,00008 gegen
einen von 0,00949.

Zwei Dinge sind daran allgemein:

- **Preload ist keine Verbesserung, sondern eine Umverteilung.** Er nimmt
  einer Datei Wartezeit weg und gibt sie allen anderen. Wer eine dritte,
  vierte, fünfte Datei einträgt, muss nachmessen, wem er sie wegnimmt.
- **Fünf Läufe reichen für so etwas nicht.** Bei 5 von 12 gegen 2 von 12
  liefert eine Stichprobe von fünf mit ansehnlicher Wahrscheinlichkeit
  „immer" oder „nie". Die erste Messung sagte „5 von 5" und war schlicht
  eine schlechte Stichprobe.

Beide Werte liegen weit unter der Schwelle von 0,1 — es geht hier um den
Faktor zwischen zwei sehr guten Zuständen, nicht um einen Mangel. Die
eigentliche Ursache ist der Schriftwechsel selbst (`font-display:swap`).
Sauber beheben ließe er sich nur mit metrisch angepassten Ersatzschriften
(`size-adjust`, `ascent-override`) — und dafür müssten die Maße der
Ersatzschrift bekannt sein, die der Browser des Besuchers tatsächlich
wählt. Geratene Werte machen es schlimmer, nicht besser.

---

## Die Bilder

Die Seite lebt von randlosen Fotos. Ein randloses Foto hat aber keine feste
Größe — es ist so groß wie das Fenster, mal Gerätepixelverhältnis, mal
Kamerafahrt. Deshalb liegt jedes großflächige Motiv in **zwei Stufen** vor,
und jede Stufe in **zwei Formaten**:

```
gastro.avif        1600 px   AVIF, das leichteste
gastro.webp        1600 px   WebP, wenn AVIF nicht geht
gastro-gross.avif  2560 px   dasselbe für Retina
gastro-gross.webp  2560 px
gastro.jpg         1600 px   Rückfallebene im <img>
```

Welche geholt wird, entscheidet der Browser: er nimmt die erste Zeile, die
er versteht.

```html
<picture>
  <source type="image/avif" srcset="…gastro.avif 1600w, …gastro-gross.avif 2560w"
          sizes="(max-width:980px) 100vw, 142vw" />
  <source type="image/webp" srcset="…gastro.webp 1600w, …gastro-gross.webp 2560w"
          sizes="(max-width:980px) 100vw, 142vw" />
  <img src="assets/img/gastro.jpg" … />
</picture>
```

Gemessen an der Seite, nicht an der einzelnen Datei, holt der Browser damit
zwischen 6 und 34 % weniger Bild-Bytes:

| Seite | mit AVIF | ohne |
|---|---|---|
| Startseite | 760 K | 1157 K |
| Dienstleistungen | 1245 K | 1682 K |
| Galerie | 677 K | 791 K |
| Sicherheit | 158 K | 168 K |

Alle vier Dateien erzeugt `tools/bilder-vergroessern.py`, eingehängt werden
sie von `tools/bilder-einhaengen.py`. Beide sind mehrfach ausführbar; das
zweite meldet dann null Änderungen.

### Warum AVIF dazukam — und warum es nicht der Bytes wegen war

Der Einwand kam zuerst: `dienstleistungen.html` hat schon einmal geruckelt,
und ein Format, das der Rechner mühsamer auspackt, wäre genau dort falsch.
Gemessen über `createImageBitmap()` aus einem Blob im Speicher — also reines
Dekodieren, ohne Netz und ohne Cache —, 2560 px, Median aus neun Läufen:

| | WebP | AVIF | |
|---|---|---|---|
| sicherheit-gross | 71,3 ms | 60,1 ms | −16 % |
| gastro-gross | 75,7 ms | 63,4 ms | −16 % |
| logistik-gross | 93,1 ms | 63,2 ms | −32 % |

AVIF ist hier **schneller**, nicht langsamer. Chromium packt es mit dav1d
aus, und das ist auf breite Bilder besser abgestimmt als der WebP-Dekoder.
Damit fiel der einzige Grund weg, der dagegen sprach.

**Zwei Fallen beim Erzeugen:**

- **AVIF wird aus dem JPEG gerechnet, nie aus dem WebP.** Aus dem WebP
  heraus kodiert man dessen Artefakte mit: bei gleicher Güte bleiben dann
  2 % Ersparnis statt 14 %.
- **Nicht jedes Motiv wird kleiner.** Bei weichen Verläufen mit wenig Kante
  ist WebP im Vorteil; zwei von 39 Dateien kamen als AVIF größer heraus. Sie
  werden deshalb wieder gelöscht, und `bilder-einhaengen.py` schreibt eine
  Kandidatenliste nur, wenn **jede** Datei darin auch auf der Platte liegt.
  Eine größere Datei anzubieten wäre das Gegenteil des Zwecks — und niemand
  würde es bemerken, denn der Browser nimmt einfach das erste Format, das er
  kann.

Kein AVIF bekommen `og-bild` (dort greifen soziale Netzwerke selbst zu, und
nicht alle können es) und die `…-mini`-Kacheln des Balkens (wenige Kilobyte,
da ist nichts zu holen).

**Auf Apache muss der Dateityp angemeldet werden.** `.htaccess` setzt
`X-Content-Type-Options: nosniff`; ohne `AddType image/avif .avif` käme die
Datei als `application/octet-stream` an, und der Browser dürfte sie dann
nicht als Bild verwenden. Netlify und Vercel bringen den Typ mit.

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

### …und warum beim Kopfbild trotzdem 200vw steht

Die Rechnung oben stimmt für die Breite. `object-fit:cover` richtet sich aber
nach der **längeren relativen Kante**, und am Telefon steht das Fenster
hochkant, während die Fotos quadratisch oder quer sind: gedeckt wird über die
**Höhe**. Gemessen bei 390 × 844 und dreifacher Pixeldichte:

| Kopfbild | Datei | Faktor mit `100vw` | mit `200vw` |
|---|---|---|---|
| `halle45` | 1536 × 1024 | 2,27× | 1,36× |
| `fahrservice-door` | 1536 × 1024 | 2,27× | 1,36× |
| `sicherheit` | 1600 × 1600 | 1,46× | unter 1,25× |
| Hero `gastro` | 1600 × 1600 | 1,62× | unter 1,25× |

Ein Kopfbild, das um mehr als das Doppelte hochgerechnet wird, sieht auf einem
guten Telefon weich aus — und es ist das erste, was jemand von der Seite sieht.

**200vw gilt nur für das eine Kopfbild je Seite** (`.hero__photo`,
`.subhero__photo`), nicht für die sechs Bühnen. Dort hängt genau die
Rasterarbeit dran, die einmal geruckelt hat. Nachgemessen kostet der Schritt
am Telefon nichts: je drei Durchfahrten mit und ohne große Stufe ergaben
denselben Median (16,7 ms), dasselbe p95 (33,4 ms) und dieselbe Zahl Ruckler.

`tools/bilder-einhaengen.py` setzt beides von selbst — der Regelfall auf
`100vw`, die Kopfbilder danach auf `200vw` (`KOPFBAND`). Wer eine Zeile von
Hand ändert, verliert sie beim nächsten Lauf.

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
  echte Aufnahme hin — und dafür gibt es jetzt beides: den Weg im Skript
  (`assets/audio/ansage/01.wav` bis `09.wav`, was dort liegt, schlägt das
  Modell) und das Briefing in `docs/sprecher-briefing.md`.

### An den Reglern zu drehen hilft nicht

Bestellt war „nicht so gelangweilt, wie eine echte Stimme". Der
naheliegende Griff sind die beiden Streuungsregler des Modells:
`noise_scale` (Klangfarbe) und `noise_w_scale` (Dauer der Phoneme, also
Rhythmus). Nachgemessen an der Grundfrequenz, Standardabweichung in
Halbtönen, je vier Läufe über vier Sätze:

| | Median | Spanne |
|---|---|---|
| Vorgabe (.667 / .80) | 3,91 | 3,58 – 4,04 |
| mehr Rhythmus (.667 / 1.00) | 4,00 | 3,85 – 4,20 |
| mehr Klangfarbe (.85 / .80) | 4,02 | 3,68 – 4,23 |
| beides (.85 / 1.00) | 3,90 | 3,64 – 4,23 |

**Die Spannen decken einander vollständig — der Unterschied liegt im
Rauschen.** Vier Halbtöne sind außerdem bereits der Bereich normal
lebendiger Sprache; monoton wäre unter 1,5. Woran man die Maschine hört,
ist nicht die fehlende Tonhöhenbewegung, sondern die fehlende
**Betonungslogik**, und die steuert keiner dieser Regler.

Dasselbe beim Satzzeichen. Die Vermutung war, der Doppelpunkt in
„Gastronomie: Servicekräfte, …" werde verschluckt. Gemessen an der
längsten Pause im Satzinneren ist das Gegenteil der Fall: `:` trägt 0,32 s,
ein Punkt 0,26 s, ein Gedankenstrich 0,24 s. Also bleibt es beim
Doppelpunkt.

**Was messbar falsch war, ist die Aussprache.** `--woerter` zerlegt den
Film in seine 56 verschiedenen Wörter und zeigt jedes einzeln in
Lautschrift — in der ganzen Zeile überliest man genau das eine. Gefunden
wurde so „Promotion": deutsch gelesen ist das `p r oː m oː ts j ˈoː n`,
und das ist der **Doktortitel**. Gemeint ist das englische Wort. Es steht
jetzt als `Promohschn` in der Tabelle, und alle 56 Wörter stehen richtig.

Geändert wird dabei nie der Untertitel, immer nur der Sprechtext.

Der Film ist damit neu abgemischt: gleiche Länge (44,92 s), gleiche
Musikspur (unberührt, wie immer aus `imagefilm-musik.webm`), gemessen
−16,1 LUFS bei −1,4 dBTP. Jeder der neun Sätze passt in sein Fenster,
der längste mit 3,98 s in 4,2 s.

**Das Sprachmodell kommt nicht von HuggingFace**, auch wenn es dort
zuhause ist: aus dieser Werkstatt ist der Host gesperrt. Es liegt als
Spiegel in den `tts-models`-Releases von `k2-fsa/sherpa-onnx`, und genau
der Befehl steht schon in README.md. Wer die Ansage neu bauen will und
einen 403 bekommt, sucht nicht nach einem Fehler im Skript.
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

## Das Netlify-Paket ist keine Kopie des Repositorys

`tools/paket-bauen.sh` liefert nicht einfach den Ordner als ZIP aus. Fünf
Dateiarten liegen im Repository absichtlich in einer Größe, die für die
Auslieferung zu groß ist:

| Was | Im Repository | Im Paket | Warum die Lücke |
|---|---|---|---|
| JPEG-Rückfallebene | Originalgröße (bis 1600 px) | auf 900 px verkleinert | seit AVIF die vierte Ebene, nicht mehr die zweite — geholt nur von Browsern ohne WebP, also von vor 2020 |
| `…-gross.webp` | vollständig, 3,04 MB | fehlt ganz, Markup wird mitgezogen | siehe unten |
| `netlify/functions/formular.js` | ungekürzt gebündelt | `--minify` | Maschinenteil, kein Lesestoff |
| `imagefilm.webm` | CRF 31, ein Durchgang | CRF 36, zwei Durchgänge | beim Bauen aus Einzelbildern ist CRF 31 richtig (siehe „Der Imagefilm"); für die Auslieferung packt CRF 36 dichter, ohne dass ein Auge den Unterschied sieht |
| `logo-herm-original.png` | 157 KB | fehlt ganz | Quelldatei, keine Seite lädt sie |
| `db/001_kundenbereich.sql` | 12,7 KB | fehlt ganz | läuft einmal von Hand gegen die Datenbank; auf dem Webserver lag der Bauplan der Tabellen sonst öffentlich aus |
| `herm-website-testdatei.html` | 12 MB | fehlt ganz | die Website als eine Datei zum Durchklicken, ein Werkzeug für uns |

Das Repository bleibt dabei die Wahrheit: `bilder-vergroessern.py` und
`bilder-menue.py` rechnen ihre WebP-Stufen aus den großen JPEGs. Läge dort
schon die kleine Fassung, würde beim nächsten Lauf aus einer kleineren
Vorlage hochgerechnet, und niemand sähe es — genau die Falle, die
`KANTE = 2560` in „Die Obergrenze kommt nicht von der Dateigröße" vermeidet.
Verkleinert wird deshalb erst auf dem Weg ins Paket, nie in der Quelle.

**Der Film wird zwischengespeichert.** Zwei Durchgänge mit `-cpu-used 1`
kosten rund vier Minuten — bei jedem Lauf von `paket-bauen.sh` neu zu
rechnen wäre eine schlechte Iterationsgeschwindigkeit für eine Datei, die
sich selten ändert. `.paket-cache/imagefilm.webm` hält das Ergebnis; ein
Stempel aus Änderungszeit und Dateigröße der Vorlage entscheidet, ob neu
gerechnet wird. Der Ordner ist in `.gitignore` — jede Maschine baut ihn sich
selbst, einmal.

**Nachgemessen (SSIM/PSNR gegen die Vorlage, `ffmpeg -lavfi ssim/psnr`):**
CRF 36 bei zwei Durchgängen ergibt SSIM 0,9917 und PSNR 46,8 dB — beides
jenseits dessen, was ein Auge unterscheidet — bei 4,7 statt 6,6 MB. Tonspur
und Länge bleiben unangetastet (`-c:a copy`, weiterhin 44,92 s).

Ergebnis: **21 MB → 16,6 MiB** (17.420.726 Bytes, 185 Dateien) — und das mit AVIF, das für sich genommen 4,1 MB hinzugefügt hätte. Wer nachsehen will, dass dabei nichts fehlt:
das Skript prüft am Ende selbst, ob jede Datei aus `assets/` im ZIP steht
(bis auf die eine ausgenommene Quelldatei), und ein `unzip` in einen leeren
Ordner mit anschließendem `git diff --stat` gegen das Original zeigt nur die
JPEGs und den Film als geändert — nichts sonst.

### Die zweite WebP-Stufe fehlt im Paket — und das Markup weiß davon

Seit AVIF dazugekommen ist, liegt jedes randlose Foto vierfach vor. Wer holt
dann noch `…-gross.webp`? Nur ein Browser, der WebP kann, AVIF aber nicht,
und der zugleich an einem Bildschirm mit hoher Pixeldichte sitzt — Safari 15
bis 16.3, Firefox 88 bis 92. Für diese Gruppe fällt die Darstellung auf die
1600er Stufe zurück: genau der Zustand, in dem die Website vor der zweiten
Stufe ausgeliefert wurde.

Dafür 3,04 MB im Paket — und die Paketgröße ist genau das, woran der erste
Netlify-Versuch gescheitert ist. **Auf Vercel und im Repository bleibt die
Stufe vollständig**; dort gibt es keine Grenze.

**Das Markup muss dabei mit.** Bliebe die Kandidatin im `srcset` stehen,
forderte ein Browser ohne AVIF eine Datei an, die es nicht gibt, und bekäme
ein leeres Bild. `paket-bauen.sh` schreibt deshalb die HTML-Dateien in die
Bühne um: die Kandidatin fällt aus dem `srcset`, und `data-gross` der
Galerie zeigt auf die Grundstufe.

**Und weil eine Regex-Ersetzung genau hier still danebengehen kann**, prüft
das Skript hinterher nicht mehr nur, ob jede Datei im Paket ist, sondern
zusätzlich die Gegenrichtung: **jede Bildadresse, die im Markup des Pakets
steht, muss im Paket auch liegen.** Das ist eine Prüfung ohne Browser und
ohne Zufall — sie findet die eine durchgeschlüpfte Zeile, die im Test nie
auffiele, weil Chromium ohnehin AVIF nimmt.

### Der Bau bricht bei jeder Warnung ab

`paket-bauen.sh` minifiziert Stylesheet und Skript mit esbuild, und **jede
Warnung von esbuild lässt den Lauf scheitern.** Das ist keine Strenge um
ihrer selbst willen, sondern kommt aus einem Fehler: eine Ersetzung per
regulärem Ausdruck hatte beim Aufräumen einer toten Klasse das `*/` eines
Kommentars mitgenommen. Das Stylesheet sah danach richtig aus, deutscher
Fließtext stand aber als CSS in Zeile 243, und der Browser überging ihn
stillschweigend. Gefunden hat es erst esbuild — beim Paketbau, lange nach
der Änderung.

Eine Warnung, die beim Bauen durchgeht, geht auch in die Auslieferung
durch. Deshalb steht dort `--log-level=warning` und ein Abbruch, sobald die
Ausgabe nicht leer ist.

### Die Falle: eine Ausnahme in der eigenen Prüfung gilt nur dort

`pg` bringt neben dem Treiber in JavaScript einen zweiten in Maschinensprache
mit (`pg-native`). Geladen wird der nur, wenn jemand `pg.native` anfasst —
das tut hier niemand, und mitbündeln ließe er sich ohnehin nicht. Also stand
im Bau `--external:pg-native`, und weil meine eigene Prüfung „nichts
Externes im Bündel" daran gescheitert wäre, stand dort eine Ausnahme:
*steht in einem `try`/`catch` von `pg`, wird nie ausgeführt.*

Das Argument stimmt — und hat trotzdem den Deploy zerlegt:

```
A Netlify Function failed to require one of its dependencies.
In file "/opt/build/repo/netlify/functions/konto.js"
Cannot find module 'pg-native'
```

Netlify liest die fertige Funktionsdatei selbst noch einmal und sucht nach
Abhängigkeiten. Diese Prüfung liest den **Text**, nicht den Ablauf; von einem
`try`/`catch` weiß sie nichts. **Eine Ausnahme, die man in die eigene Prüfung
schreibt, gilt eben nur in der eigenen Prüfung.**

Deshalb wird das Modul jetzt nicht extern gestellt, sondern **ersetzt**:
`api/_pg_native_fehlt.js` wirft beim Laden einen Fehler mit
`code = 'MODULE_NOT_FOUND'` — genau den einen Code, den `pg/lib/index.js`
abfängt. Im Bündel steht danach kein `require` auf ein fremdes Modul mehr,
und die Prüfung im Bau hat **keine Ausnahmen**.

**Die zweite Hälfte des Fehlers war die Prüfung selbst.** Sie hat bestätigt,
dass sich das Bündel *laden* lässt — und das ließ es sich, denn ein
Datenbanktreiber wird erst beim ersten Verbinden gebraucht. Steht
`DATABASE_URL` in der Umgebung, verbindet der Bau deshalb jetzt einmal
wirklich:

```
→ Prüfen, dass das Bündel wirklich an die Datenbank kommt
   Verbindung steht: 200 bereit
```

Ohne die Variable wird der Schritt übersprungen und sagt es auch — eine
Prüfung, die stillschweigend ausfällt, ist schlimmer als keine.

### Die Falle: `zip -x` läuft über Ordnergrenzen

`zip -x "assets/img/*.jpg"` schließt nicht nur die Bilder aus, sondern
alles, was auf das Muster passt — der Stern überspringt auch Schrägstriche.
Die vier Porträts der Teamseite fielen dadurch aus dem Paket, ohne dass eine
Meldung kam. Gefunden hat es die Vollständigkeitsprüfung am Ende des
Skripts, nicht das Auge.

Seitdem wird nicht mehr ausgeschlossen, sondern **der ganze Baum in einen
Zwischenordner gespiegelt** und dort verändert. Was im Paket landen soll,
liegt dann vorher vollständig da; ausgelassen wird nur, was ausdrücklich in
der Ausnahmeliste steht.

### Die Kehrseite: `zip -r .` nimmt auch, was gerade herumliegt

Die Vollständigkeitsprüfung sucht nach **Fehlendem**. Nach Überzähligem hat
sie nie gesucht — und `zip -qr "$ZIEL" .` packt den ganzen Arbeitsordner.

Aufgefallen ist das beim Farbwechsel, und zwar an der Paketgröße: 35 MB
statt 17. Ein Prüfskript hatte seine Bildschirmaufnahmen mangels gesetzter
Umgebungsvariablen nach `undefined/` geschrieben, und neunzehn PNG davon
lagen anschließend im Paket. Sie wären unter `https://…/undefined/`
öffentlich abrufbar gewesen.

Seitdem prüft das Skript auch die Gegenrichtung: **jede oberste Ebene im
Paket muss auf der Liste stehen** (`assets`, `netlify`, `dienstleistungen`,
die sechs Einzeldateien, dazu die HTML-Seiten). `tools/`, `docs/`, `api/`
und `db/` stehen ohnehin in der Ausnahmeliste; durchrutschen kann nur, was
es vorher nicht gab — und genau das ist der Fall, den niemand erwartet.

**Die allgemeine Form davon:** eine Prüfung, die nur „ist alles da?" fragt,
beantwortet nicht „ist nur das da?". Auf einem Webserver ist die zweite
Frage die mit dem Schadenspotenzial.

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

## Suchmaschinen: Testbetrieb und Live-Gang

Die Sperre gegen Suchmaschinen steht an **neunzehn** Stellen: fünfzehn
`<meta name="robots">` in den Seitenköpfen, `robots.txt`, und je eine
Kopfzeile in `vercel.json`, `netlify.toml` und `.htaccess`. Drei Sperren sind
Absicht — wer eine übersieht, hat die Vorschau trotzdem noch zugedeckt.

Neunzehn Handgriffe am Tag des Live-Gangs sind dagegen keine Absicht, sondern
eine Fehlerquelle. Deshalb:

```bash
python3 tools/live-schalten.py --stand    # wie steht es gerade?
python3 tools/live-schalten.py --live     # freigeben
python3 tools/live-schalten.py --test     # wieder sperren
```

Zwei Dinge, die das Skript bewusst anders macht als „alles ersetzen":

- **`404.html` bleibt immer auf `noindex`.** Eine Fehlerseite gehört in keinen
  Index, auch im Live-Betrieb nicht.
- **In `netlify.toml` und `.htaccess` wird die Zeile auskommentiert, nicht
  gelöscht.** Beim Zurückschalten muss sie niemand aus dem Gedächtnis
  wiederherstellen. In `vercel.json` geht das nicht — JSON kennt keine
  Kommentare —, dort wird der Eintrag wirklich entfernt und beim
  Zurückschalten wieder eingesetzt.

**Die Falle dabei:** `s.replace("", block)` schiebt den Block zwischen *jedes
Zeichen* der Datei. Genau das ist beim ersten Entwurf passiert und hat aus
`vercel.json` 10 000 Zeilen gemacht. Für JSON steht deshalb je eine eigene
Regel für Entfernen und Einsetzen da, und der Anker beim Einsetzen ist
`X-Content-Type-Options` — nicht das äußere `"headers": [`, denn dort stehen
Quellen, keine Kopfzeilen.

Nachprüfen lässt sich der ganze Vorgang in einem Zug: einmal `--live`, einmal
`--test`, danach muss `git diff` bis auf `robots.txt` leer sein.

## Strukturierte Daten kommen aus der Seite, nicht daneben

Strukturierte Daten sind eine zweite Fassung dessen, was ohnehin im Markup
steht. Von Hand gepflegt laufen die beiden Fassungen auseinander, sobald
jemand einen Brotkrumen umbenennt — und Google meldet dann einen Fehler, den
auf der Seite selbst niemand sieht.

`tools/strukturdaten.py` liest deshalb die Quelle und schreibt das Ergebnis
zwischen zwei Marken (`strukturdaten:anfang` / `:ende`):

| Was | woraus |
|---|---|
| `BreadcrumbList` | dem sichtbaren `.breadcrumb` |
| `FAQPage` | den `<details>`/`<summary>` der Jobseite |
| `Service` | Name und `<meta name="description">` der sechs Leistungsseiten |

Die Startseite bleibt außen vor: sie hat keinen Brotkrumenpfad (sie ist das
Ziel), und ihr `EmploymentAgency`-Block steht von Hand im Kopf — dort stehen
Angaben, die auf keiner Seite sichtbar sind (Fax, Netzwerke, Öffnungszeiten).

Der Pfad steht seitdem als `<nav class="breadcrumb" aria-label="Brotkrumenpfad">`
da, nicht als `<div>`. Die CSS-Regeln hängen an der Klasse, es ändert sich
also nichts am Aussehen — aber Vorlesewerkzeuge bekommen einen Bereich, den
sie ansteuern können.

## Doppelt ist nicht gleich doppelt

Beim Aufräumen der Wiederholungen ist der Unterschied wichtig:

- **Ein System ist keine Doppelung.** Jeder Eintrag im Balken unter der
  Kopfzeile zeigt dasselbe Foto wie das Kopfband der Seite, auf die er führt.
  Das ist Absicht: man landet dort, wo man hingeklickt hat. Wer das
  „vereinheitlicht", macht es kaputt.
- **Zweimal dasselbe Foto auf *einer* Seite ist eine.** Der Hero der
  Startseite zeigte `gastro.jpg`, und vier Bildschirme später stand dasselbe
  Bild noch einmal als Szene 01 (die Szenen stehen inzwischen nicht mehr
  dort, der Tausch bleibt). Ebenso auf der Galerie: `logistik-detail.jpg`
  als Kopfband und weiter unten als Kachel. Beide Stellen sind getauscht.
- **Dreimal dieselbe Telefonnummer auf einem Bildschirm hilft niemandem beim
  Anrufen.** Im Schlussblock der Startseite stand sie im Knopf, im
  Ansprechpartner-Block und in der Kontaktkarte. Der mittlere Block sagt
  seitdem nur noch, **wer** die Anfrage bekommt; **wie** man ihn erreicht,
  steht darunter.

## Öffnungszeiten stehen an vier Stellen — und das ist richtig

Mo–Fr 10–17 Uhr steht auf `kontakt.html`, in den Kontaktkarten der Startseite,
im Fuß jeder Seite und im Einleitungssatz der Teamseite. Das widerspricht dem
Absatz darüber nur scheinbar: eine Handlungsaufforderung dreimal zu
wiederholen ist Lärm, eine Tatsache dort hinzuschreiben, wo jemand sie sucht,
ist Service. Wer wissen will, ob jetzt jemand rangeht, schaut in den Fuß.

Dieselbe Angabe steht als `openingHoursSpecification` in den strukturierten
Daten der Startseite und in der Fußzeile beider Bestätigungsmails. Wer sie
ändert, muss alle sechs Stellen anfassen — `grep -rn "10–17"` findet sie.

## Ein Reiter ist eine Seite, kein Sprungziel

„Referenzen" war der letzte Menüpunkt, der auf einen **Abschnitt der
Startseite** zeigte (`index.html#referenzen`). Das fällt nicht beim Klicken
auf, sondern eine Bewegung später: man scrollt ein Stück zurück und steht
mitten in der Startseite. Genau daran liest sich eine Website als One-Page,
auch wenn sie technisch aus fünfzehn Dateien besteht.

Seitdem gilt ohne Ausnahme: **jeder Punkt der Hauptnavigation ist eine
eigene Datei.** Sprungmarken bleiben, wo sie hingehören — innerhalb einer
Seite (`#inhalt`, `#bewerbung`), nie als Menüpunkt.

Die Aufteilung folgt dabei demselben Muster wie bei den Dienstleistungen:

| | Startseite | eigene Seite |
|---|---|---|
| Referenzen | das grosse Zitat und die fünf Zeichen (`.reflogos`) | alle Stimmen einzeln (`referenzen.html`) |
| Dienstleistungen | nichts, der Weg führt über den Balken | die sechs Bühnen |

Beides zu zeigen wäre die Doppelung, die an anderer Stelle schon
aufgeräumt wurde. Die Startseite zeigt, **dass** mit uns gearbeitet wird;
**wer** das sagt, steht auf der Seite dahinter.

**Wer einen Menüpunkt dazunimmt**, legt eine Datei an und trägt sie an fünf
Stellen ein: Kopfnavigation und Vollbildmenü (auf allen Seiten),
`sitemap.xml`, die Liste in `tools/strukturdaten.py`, die Sitemap-Spalte im
Fuss und die Adressregel ohne `.html` in `vercel.json` und `netlify.toml`.

## Die Unterleisten unter der Kopfzeile

Zwei Menüpunkte haben mehr als ein Ziel. Fährt man mit der Maus darüber,
kommt unter der Kopfzeile eine Leiste heraus, in der die Ziele stehen:

| Reiter | was darin steht | Klasse |
|---|---|---|
| Dienstleistungen | sechs Fotos, sechs Nummern, sechs Namen, dazu „Alle Dienstleistungen ansehen" | `.megabar` |
| Jobs | Direkt bewerben · Freie Stellen · Häufige Fragen | `.megabar .megabar--text` |

Die anderen vier Reiter haben keine. Das ist kein Rest, sondern eine
Entscheidung — siehe „Wer nichts zu zeigen hat, zeigt nichts".

Sechs Entscheidungen, die man kennen muss, bevor man daran etwas ändert:

**1. Der Menüpunkt ist in jeder Lage ein Link.** Mit Maus, mit Finger, mit
Tastatur, mit und ohne JavaScript führt er auf seine Seite. Bis zur
Hover-Fassung fing das Skript den Klick ab und klappte statt dessen auf; das
ging, solange nur ein Klick öffnete. Sobald aber das Zeigen öffnet, nähme ein
Klick dem Benutzer weg, was er gerade vor sich hat. Damit entfallen
`ev.preventDefault()`, der Meta/Ctrl/Shift-Sonderfall und die
`ev.detail === 0`-Tastaturerkennung — drei Sonderfälle weniger.

**2. Geöffnet wird beim Darüberfahren — aber der Zustand liegt in `.auf`,
niemals in CSS `:hover`.** Mit `:hover` hätten Escape, das Schließen beim
Scrollen, `aria-expanded` und der ganze Tastaturweg keinen Angriffspunkt
mehr, und auf einem Tablet im Querformat klebte die Leiste, bis man woanders
hin tippt.

**3. Kopfzeile und Leiste sind eine Zone.** Die Leiste beginnt bei `top:0`
und wird nur von der Kopfzeile überdeckt (z-index 880 gegen 900). Zwischen
Reiter und Leiste gibt es deshalb **keine tote Strecke**, die man mit einem
langen Nachlauf überbrücken müsste. Die Zeiten:

| | ms | warum |
|---|---|---|
| Öffnen | 120 | verschluckt jede Durchfahrt: wer die Navigation nur überquert, löst nichts aus |
| Wechseln | 0 | die Absicht ist geklärt, sobald eine Leiste offen ist |
| Schließen | 180 | reicht, weil keine Lücke zu überbrücken ist |

Nach Escape und nach dem Scrollen ist der Reiter **gesperrt**, bis der Zeiger
die Zone einmal verlassen hat. Ohne das spränge die Leiste unter dem
stehenden Zeiger sofort wieder auf, und Escape hätte keine sichtbare Wirkung.

**4. Pfeil ab öffnet, Enter navigiert.** Der Tabulator allein öffnet nichts:
wer zum Anfrage-Knopf tabbt, streift sechs Reiter. Innerhalb der Leiste gibt
es keine Pfeiltastensteuerung — es ist kein `role="menu"`, sondern eine Liste
von Links. Die Leiste selbst trägt `role="group"`; ein `aria-label` an einem
nackten `<div>` gibt kein Vorlesewerkzeug aus.

**5. Wer nichts zu zeigen hat, zeigt nichts.** Referenzen, Team, Galerie und
Kontakt tragen weder `aria-expanded` noch `aria-controls`: ein Attribut,
hinter dem nie etwas kommt, ist eine Falschaussage. Beim Darüberfahren
schließen sie eine offene Leiste, statt eine leere zu öffnen. Die Begründung
je Reiter:

- **Team** hat genau eine Gruppe („Büroteam"). Ein Eintrag ist kein Menü, und
  sechs Einträge, die alle auf dieselbe Adresse zeigen, sind auch keins.
- **Galerie** ist eine flache Wand aus dreizehn Kacheln ohne Kategorien. Jede
  Gliederung müsste erfunden werden. Wer eine will, versieht zuerst die
  Kacheln mit `data-bereich` — das ist eine Inhaltsänderung, keine
  Navigationsfrage.
- **Kontakt** hätte „Anrufen" und „Anfrage stellen" anzubieten. Beides steht
  zwei Zentimeter weiter rechts in derselben Kopfzeile: die dritte Kopie auf
  einem Bildschirm, genau die Doppelung aus „Dreimal dieselbe Telefonnummer".
- **Referenzen** hätte ein Inhaltsverzeichnis über zwei Blöcke, das länger
  dauert als das Scrollen.

**6. Gebaut wird in `main.js`, nicht im Markup.** Die Leisten stehen auf
allen sechzehn Seiten gleich; als Markup wären das sechzehn Kopien, die beim
nächsten Namenswechsel auseinanderlaufen. Die Adressen stehen ohnehin im Fuß
jeder Seite — Suchmaschinen und Leser ohne Skript finden sie dort. Die
Leisten tragen deshalb bewusst **keinen Beschreibungssatz**: was dort steht,
ist Navigation. Sobald ein Satz hineinkäme, wäre es Inhalt, und Inhalt gehört
ins Markup, wo ihn `striche-ersetzen.py` und das Korrekturlesen erreichen.

**Sie liegen über der Seite, nicht darin.** Eine Leiste, die Platz wegnimmt,
schöbe beim Öffnen alles darunter nach unten. Deshalb `position:fixed`, und
bewegt werden nur `transform` und `opacity`.

**Eine Leiste ohne Fotos bekommt auch keine Nummern.** Bei Jobs zeigen alle
drei Einträge auf dieselbe Seite; ein Bild wäre dreimal dasselbe Motiv, und
„01 02 03" vor drei Wegmarken ist genau der Zierrat aus „Keine Zeichen vor
dem Text". `.megabar--text` erbt alles Übrige von `.megabar` — das Abschalten
unter 981 px, die reduzierte Bewegung, die visibility-Falle —, ohne dass eine
Media-Query verdoppelt wird.

**Der Versatz beim Aufbauen kommt aus `--n`, nicht aus `:nth-child()`.**
Vorher standen dort sechs Zeilen, und die galten für genau sechs Einträge.
`main.js` schreibt den Index beim Bauen, das Stylesheet rechnet daraus die
Zeit — dasselbe Muster wie `--i` im Vollbildmenü.

**`visibility` bekommt keine Dauer, sondern eine Verzögerung.** Das ist die
Falle dabei:

```css
/* falsch */ transition:opacity .24s, transform .24s, visibility .24s;
/* richtig */ transition:opacity .24s, transform .24s, visibility 0s linear .24s;
.megabar.auf{ transition:opacity .24s, transform .24s, visibility 0s; }
```

Steht `visibility` mit einer Dauer in der Übergangsliste, meldet Chromium noch
**zwei Bilder lang** `hidden` — und ein Element, das `hidden` ist, nimmt keinen
Fokus an. Wer den Menüpunkt mit Enter öffnete, blieb deshalb auf dem Menüpunkt
stehen, statt im Balken zu landen. Nachgemessen mit vier aufeinanderfolgenden
`requestAnimationFrame`:

| Bild | `visibility` | Fokus angenommen |
|---|---|---|
| 0 | hidden | nein |
| 1 | hidden | nein |
| 2 | visible | ja |

`visibility` ganz wegzulassen ist keine Lösung: dann stünden neun unsichtbare
Links im Tabulatorlauf jeder Seite.

Die Dauer selbst hat sich mit dem Zeigen geändert: **0,42 s waren die Antwort
auf einen Klick, den man abwartet.** Beim Darüberfahren ist die Leiste die
Fortsetzung einer Zeigerbewegung, die schon läuft; dort liest dieselbe Dauer
als Zögern. Sie steht deshalb auf **0,24 s**.

**Am Telefon gibt es den Balken nicht.** Dort bietet die Leiste unten mit
„Leistungen" denselben Weg schon an; ein zweiter wäre die Doppelung, die
einmal zu Recht beanstandet wurde. Der Menüpunkt und alles, was daran hängt,
wird deshalb im selben Block ausgeblendet — `#mobileMenu .menu__unter` muss
dort **mitgenannt** werden, sonst steht die Liste als herrenloser Block unter
einer Überschrift, die es nicht mehr gibt.

Im Vollbildmenü auf Tablets und in schmalen Fenstern am Rechner klappen die
sechs stattdessen unter dem Menüpunkt auf (`.menu__unter`). Das ist die eine
Stelle im ganzen Projekt, an der eine **Layout-Eigenschaft** bewegt wird
(`grid-template-rows` von `0fr` auf `1fr`): es geht um wenige Zeilen Text ohne
Bild, und ein Aufklappen ohne Höhe gibt es nicht.

**Die Falle im Vollbildmenü:** dort schließt jeder Klick auf einen Link das
Menü. Der Menüpunkt, der nur aufklappt, darf das nicht auslösen.
`stopPropagation()` hilft dabei **nicht** — der schließende Zuhörer hängt am
selben Element und wurde früher angemeldet. Erkennbar ist der Punkt stattdessen
an `aria-controls`; nur wer etwas aufklappt, setzt das.

Jobs bekommt im Vollbildmenü bewusst **keinen** Aufklapper: am Telefon ist der
Punkt ohnehin ausgeblendet, weil die Leiste unten „Jobs" schon anbietet, und
auf dem Tablet sind drei Sprungmarken weniger wert als ein Tipp auf die Seite.
Damit muss `#mobileMenu .menu__unter` im Telefon-Block auch nicht aufgeteilt
werden.

### Die Falle: `--nav-h` stand nicht immer

An der Höhe der Kopfzeile hängen die Unterleisten, die Kinobalken und seit
neuestem jedes Sprungziel. Geschrieben wurde sie von `navHoehe()` — aber nur
aus `alles()` heraus, und das lief nur `if(!reduce)`. **Bei reduzierter
Bewegung galt deshalb überall der Rückfallwert 78 px**, während die Kopfzeile
bei 1440 px 101 px hoch ist.

Und sie lief nur bei `resize`, nicht beim Scrollen — obwohl `.scrolled` die
Leiste flacher macht. Solange die Unterleiste bei jedem Scrollen zuging, fiel
das nicht auf; seit das Zeigen öffnet, öffnet man viel häufiger im gescrollten
Zustand.

Die Höhe ist keine Frage der Bewegung, sondern eine Tatsache über das Layout.
Sie wird jetzt in jeder Lage geschrieben. Nachgezogen wird sie beim Scrollen
aber **nur, wenn `.scrolled` wirklich umschlägt** — ein
`getBoundingClientRect()` in jedem Scrollbild wäre ein erzwungenes Layout je
Bild, und genau davor warnt „Erst messen, dann schreiben".

### Die zweite Falle: eine Zahl für zwei verschiedene Dinge

Die Kopfzeile ist oben 85 px hoch und gescrollt 63. Beides stand in
**einer** Variablen, und daran hingen zwei Sachen, die sich widersprechen:

| | Bedeutung | darf sich ändern? |
|---|---|---|
| `--nav-h` | wie hoch die Leiste **gerade** ist | ja, die Unterleiste und die Kinobalken folgen ihr |
| `--nav-h0` | wieviel Platz für sie **reserviert** ist | nein |

Am reservierten Platz hängen `body{padding-top}`, `scroll-padding-top` und
seit der Kamerafahrt die Höhe des Heros. Gemessen wuchs der Hero beim
Zurückscrollen von 815 auf 839 px, weil `100svh - var(--nav-h)` mitwanderte.

**Und der Wert selbst war falsch.** Die Umschaltung blendet über: die
Polsterung in 0,4 s, die Logohöhe in 0,6 s. Gemessen wurde im selben Bild,
in dem die Klasse fällt — also mittendrin. `--nav-h` stand auf 61 px,
während die Leiste 68 hoch war, und auf 85, während sie 63 war.

Nachgemessen, vorher und nachher:

| Scrollstand | Leiste wirklich | `--nav-h` vorher | nachher |
|---|---|---|---|
| oben | 85 px | 85 | 85 |
| gescrollt | 61 px | 85 | 61 |
| wieder oben | 85 px | 61 | 85 |

Zwei Zeilen lösen beides: der reservierte Platz wird nur aus dem
Ruhezustand geschrieben, und nach dem Ende der Überblendung wird noch
einmal nachgemessen (`transitionend` blubbert, die Logohöhe zählt also
mit). **Wer eine Höhe misst, während sie sich gerade ändert, misst eine
Zwischenstellung.**

### Die Falle: `scroll-padding-top` gehört zu jeder festen Kopfzeile

Ohne diese eine Zeile an `html` landet jedes Sprungziel **hinter** der festen
Leiste: man sieht mitten in einen Absatz und hält es für die falsche Stelle.

```css
html{ scroll-padding-top:calc(var(--nav-h, 78px) + clamp(12px,2vh,28px)); }
```

Das fehlte im Stylesheet vollständig, und es war schon vorher falsch — die
Knöpfe auf `jobs.html`, die auf `#bewerbung` zeigen, sind genauso gelandet.
Aufgefallen ist es erst mit den Untereinträgen der Unterleiste, weil dort drei
Sprungziele nebeneinander stehen und man den Fehler dreimal hintereinander
sieht.

Nachmessen lässt es sich ohne Auge: nach dem Sprung darf `elementFromPoint` an
der Mitte der Zielüberschrift nicht die Kopfzeile liefern.

## Der Mitarbeiter-Login gehört nicht zur Bewerbung

`hst.secplan.net` ist der Dienstplan für Leute, die schon im Team sind. Er
steht deshalb **abgesetzt unter** dem Bewerbungsknopf, nicht daneben: wer sich
gerade bewirbt, soll ihn nicht für den nächsten Schritt halten. Getrennt wird
wie überall, durch eine Haarlinie und Abstand.

Es ist der einzige Link auf einen fremden Dienst außerhalb der Fußzeile.
Deshalb `target="_blank" rel="noopener"`, ein Hinweis darauf im
`aria-label` — und ein Satz in der Datenschutzerklärung, dass es ein
einfacher Link ist und dort die Erklärung des anderen Anbieters gilt.

---

## Toter Code: drei Messungen, zwei davon falsch

Beim Aufräumen sollte beantwortet werden, welche CSS-Klassen im Stylesheet
stehen und nirgends benutzt werden. Zwei naheliegende Wege haben Unsinn
geliefert, und beide sahen dabei überzeugend aus:

1. **Selektoren mit einem regulären Ausdruck zählen.** Ergebnis: 1373 von
   1373 Regeln ungenutzt. Der Ausdruck traf auch Kommentare, und das
   Stylesheet besteht zu 49 % aus Kommentaren.
2. **`CSS.startRuleUsageTracking` über das Chrome-Protokoll.** Das meldet,
   was der Browser *tatsächlich* angewandt hat — und damit alles als tot,
   was an einem Zustand hängt: `:hover`, `:focus-visible`, `.in`, `.auf`,
   `.live`, jede `@media`-Regel, die gerade nicht greift.

Was funktioniert hat, ist der langweilige Weg: **die Klassennamen aus dem
Stylesheet gegen die Vereinigung aller HTML-Dateien und `main.js` halten.**
`main.js` gehört zwingend dazu — der Balken unter der Kopfzeile, die
Kapitelrail und die App-Leiste werden dort gebaut, ihre Klassen stehen in
keiner HTML-Datei. Ergebnis: **23 wirklich tote Klassen**, rund 230 Zeilen.

Die Regel dahinter: **eine Messung, die alles oder nichts meldet, misst
nicht das, wonach gefragt war.** Beide Fehlversuche hätten bei einem Blick
auf ihr eigenes Ergebnis auffallen müssen.

---

## Der Bestandskundenbereich

Er sitzt auf `kontakt.html` zwischen Kopfbild und Anfrageformular, und er ist
die erste Stelle im Projekt, an der die Website etwas **speichert**. Bis
dahin war sie vollständig zustandslos: Dateien plus eine Funktion, die eine
Mail verschickt.

Sieben Entscheidungen, die man kennen muss, bevor man daran etwas ändert:

**1. Kein Menüpunkt, keine eigene Seite.** Der Bereich ist eine Zeile über
dem vorhandenen Formular. Ein sichtbares Kundenportal wäre ein zweiter
Auftritt neben der Website; hier ist es eine Abkürzung innerhalb der Seite,
die es ohnehin gibt. Das Formular darunter ist unverändert und bleibt der
Regelweg.

**2. Die Klassen sind die des bestehenden Formulars.** `form`, `fgruppe`,
`feld`, `form__fuss`, `form__status` — der Bereich sieht nicht *ähnlich* aus
wie das Formular darunter, er ist dasselbe. Eigene Klassen (`kb-…`) gibt es
nur für das, was es vorher nicht gab: die Tür, den Kundenkopf, die
Mengensteuerung, die Übersicht.

**3. Der sichtbare Text steht im Markup, nicht in `main.js`.** Sonst käme er
weder durch das Korrekturlesen noch durch `striche-ersetzen.py`. Das Skript
baut nur, was sich wiederholt: die Personalzeilen und die Tage.

**4. Ohne Datenbank bleibt die Tür zu.** Beim Laden fragt die Seite einmal
bei `/api/konto` nach (`aktion:stand`). Fehlt `DATABASE_URL`, antwortet der
Endpunkt mit 503, und der ganze Abschnitt bleibt auf `hidden`. Es gibt nie
einen Knopf, hinter dem nichts ist — und ohne JavaScript ebenso wenig.

**5. Wer der Kunde ist, sagt allein die Sitzung.** Keine Abfrage im
Kundenbereich nimmt eine Kundennummer aus dem Rumpf entgegen. Jede Abfrage,
die etwas Kundeneigenes anfasst, trägt `AND kunde_id = $n` — auch dort, wo es
überflüssig aussieht. Das ist der Punkt, an dem Kundenportale reihenweise
scheitern.

**6. Zwei Riegel gegen fremde Seiten.** Der Sitzungskeks ist
`SameSite=Strict`, und jeder POST muss den Kopf `X-HST-Bereich` tragen. Einer
allein reicht nicht: `SameSite` kennt nicht jeder alte Browser, und der Kopf
allein hülfe nichts gegen ein abgeschicktes Formular.

**7. Speichern hat Vorrang vor dem Mailversand.** Eine Anfrage, die in der
Datenbank steht, ist angekommen — auch wenn der Mailserver gerade nicht
erreichbar ist. Der Versand kommt danach und wird nur vermerkt
(`mail_disposition`, `mail_kunde`). Andersherum wäre die Anfrage weg.

### Warum scrypt und nicht Argon2id

Argon2id wäre die erste Wahl, braucht aber ein Modul mit eigener
Maschinensprache. Das Netlify-Paket wird zu **einer** Datei gebündelt (siehe
„Das Netlify-Paket ist keine Kopie des Repositorys"), und eine `.node`-Datei
lässt sich nicht mitbündeln. `scrypt` steht in Node selbst und ist als
speicherhartes Verfahren gegen Grafikkarten gebaut.

Die Wahl ist also eine Folge der Auslieferung, nicht der Bequemlichkeit — und
sie ist umkehrbar: **das Verfahren steht im Hash mit drin**
(`scrypt$N$r$p$salz$hash`). Wer den Betrieb später auf einen eigenen Server
hebt, kann ein zweites Verfahren daneben stellen, ohne einen einzigen
bestehenden Hash anzufassen.

### Die Falle: WebAuthn nimmt keine IP-Adresse

Die Kennung der Gegenstelle (`rpID`) muss ein registrierbarer Name sein.
Gegen `127.0.0.1` antwortet Chromium mit „This is an invalid domain", und man
sucht den Fehler zuerst im eigenen Code. `localhost` ist ausdrücklich
erlaubt — zum Ausprobieren also `http://localhost:…`, nicht die Zahlen.

Im Betrieb darf die Kennung **nicht** aus dem Host-Kopf kommen: wer den
fälschen kann, bekäme eine Signatur, die auf seiner eigenen Adresse gilt. Sie
steht deshalb in `WEBAUTHN_RP_ID`; nur auf dem eigenen Rechner wird sie
abgeleitet.

### Die Falle: `button.btn` ist der Absendeknopf

Die Regel hängt am Element: `a.btn` ist die leise Aktion, `button.btn` die
große mit voller Breite, Linien oben und unten und weißer Füllung beim
Ansteuern. Das ging auf, solange jeder `<button class="btn">` auch wirklich
etwas abschickte.

Der Bestandskundenbereich hat Knöpfe, die ein `<button>` sein **müssen**,
weil sie auf- und zuklappen (`aria-expanded`), aber nicht das Ziel der Seite
sind. Sie riefen sonst lauter als der Absendeknopf des Formulars darunter.
Dafür gibt es jetzt `.btn--zeile`.

### Die Falle: `.form label` trifft auch ein Häkchen

Ein `<label>`, das ein `<input type="checkbox">` umschließt, bekommt von
`.form label` das Aussehen einer Feldbeschriftung — Versalien,
Schreibmaschinenschrift, `display:block`. Das Kästchen stand dadurch mitten
in der Zeile und der Text darunter. Die Lösung steht schon im Projekt:
`.zustimmung` setzt Kästchen und Beschriftung als **Geschwister**, nicht
ineinander. Wer ein weiteres Häkchen braucht, nimmt dieselbe Bauform.

### Was der Betrieb dafür braucht

Eine PostgreSQL-Datenbank (`DATABASE_URL`) und zwei Angaben für WebAuthn.
Ohne die Datenbank ist der Bereich unsichtbar, ohne die WebAuthn-Angaben gibt
es keine Passkeys und die Anmeldung läuft über Passwort. Angelegt werden
Kunden mit `tools/kunden.js`; eine Selbstregistrierung gibt es bewusst nicht.

---

## Was bewusst fehlt

Keine Cookies, kein Tracking, keine externen Schriften, keine
Social-Media-Plugins, keine Analyse-Werkzeuge. Deshalb braucht die Seite kein
Cookie-Banner. Wer daran etwas ändert, muss die Datenschutzerklärung nachziehen.
