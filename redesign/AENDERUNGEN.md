# Was an der gelieferten Fassung geändert wurde

Grundlage ist `herm-website-redesign.zip`, unverändert. Hinzugekommen sind
genau zwei Dinge, beide nur auf der Startseite:

1. **Die gedeckte Tafel als Titelbild.**
2. **Der Imagefilm als Hintergrund, ab dem Intro.**

Alles andere ist Zeile für Zeile die gelieferte Fassung. Angefasst wurde
eine einzige bestehende Datei: `index.html`. Weder `styles.css` noch
`redesign.css`, weder `main.js`, `lenis.min.js` noch `motion.js` haben eine
geänderte Zeile.

---

## 1. Das Titelbild

Im Hero steht statt `hero-hostessen` jetzt `bankett` — die gedeckte Tafel.

```
assets/img/bankett.avif         1600 px
assets/img/bankett.webp         1600 px
assets/img/bankett.jpg          1600 px   Rückfallebene
assets/img/bankett-gross.avif   2560 px
assets/img/bankett-gross.webp   2560 px
```

Zwei Stufen, und `sizes` fängt mit einer Telefonbedingung an:

```html
sizes="(max-width:980px) 200vw, 100vw"
```

**Warum am Telefon 200vw steht.** `object-fit:cover` deckt über die
*längere relative* Kante. Am Schreibtisch ist das die Breite, am Telefon
steht das Fenster hochkant und ein 16:9-Foto wird über die **Höhe**
gedeckt. Mit `100vw` holte ein iPhone die 1600er Datei für eine
Darstellung, die 2532 Gerätepixel hoch ist — also eine anderthalbfache
Hochrechnung im ersten Bild, das jemand von der Seite sieht. Nachgemessen
greift der Browser mit dieser Zeile zur 2560er Stufe.

Das Bild trägt weiter die beiden Verläufe aus `redesign.css`; an der
Lesbarkeit der Überschrift ändert sich nichts.

## 2. Der Hintergrundfilm

Neu sind **zwei Dateien** und vier Videoschnitte:

```
assets/css/hintergrundfilm.css     liegt NACH redesign.css
assets/js/hintergrundfilm.js       läuft NACH motion.js
assets/video/hintergrund.mp4       1600 × 900, H.264
assets/video/hintergrund.webm      1600 × 900, VP9
assets/video/hintergrund-hoch.mp4   810 × 1440, H.264
assets/video/hintergrund-hoch.webm  810 × 1440, VP9
```

In `index.html` kommen dazu: der `<link>` auf das Stylesheet, der
`<script>` am Seitenende und die feste Lage

```html
<div class="filmgrund" aria-hidden="true"><video …></video></div>
```

### Was daran entschieden ist

**Der Film ist der Grund der Seite, keine Bühne darin.** Er liegt fest
hinter allem (`position:fixed; z-index:-1`) und läuft endlos, stumm,
ohne Bedienteile.

**`z-index:-1`, und nichts anderes.** Ein `position:fixed` mit `z-index:0`
malt nach den Hintergründen der Abschnitte — der Film läge dann über dem
Text. Bei −1 malt er nach dem Grund des `body` und vor jedem
Abschnittshintergrund. Genau dazwischen gehört er hin.

**„Etwas weiter unten" entsteht durch die Abschnitte, nicht durch den
Film.** Eine feste Lage kennt keine Abschnittsgrenzen. Hero und
Vertrauensband tragen deshalb ihren eigenen, deckenden Grund; ab dem
Intro liegt ein Schwarz mit 88 % Deckung darüber, durch das der Film
sichtbar wird. Am oberen Rand des Intros blendet ein Verlauf von deckend
nach durchsichtig — der Film taucht auf, statt an einer Linie anzufangen.

**Die 88 % sind gerechnet und dann im Bild nachgemessen.** Der hellste
Bildpunkt des Films kommt damit bei 31 von 255 an. Volle weiße Schrift
trägt darauf 15,7:1, die gedämpfte Stufe (`--muted`, 52 %) noch 6,0:1 —
beides deutlich über den nötigen 4,5. Weniger Deckung wäre ein schönerer
Film und eine knappere Typografie, mehr wäre ein Film, den niemand sieht.

**Zwei Zuschnitte, nicht zwei Größen.** In einem Fenster von 390 × 844 bei
dreifacher Dichte deckt `cover` über die Höhe: die Querfassung müsste
3,5-fach hochgerechnet werden, die Hochkantfassung nur 1,76-fach. Der
Hochkantschnitt nimmt 608 von 1600 Spalten aus der Bildmitte — ein
anderer Ausschnitt, nicht dieselbe Aufnahme kleiner.

**Die Quellen stehen nicht im Markup.** `<source media="…">` steht zwar in
der Norm, wird in einem `<video>` aber weder von Chromium noch von Safari
ausgewertet — nur das `<picture>` kennt es. Der Browser nähme schlicht die
erste abspielbare Quelle, und das Telefon bekäme die Querfassung. Die vier
Adressen hängen deshalb als `data-`Attribute am `<video>`, und
`hintergrundfilm.js` hängt die passende ein.

**H.264 steht vor VP9.** Sonst gilt „das modernste Format zuerst"; beim
Film ist es umgekehrt, weil er dauernd läuft: H.264 wird auf jedem Telefon
von eigener Hardware dekodiert. VP9 steht daneben für die
Chromium-Baureihen ohne H.264 — ohne diese Zeile sähen die eine schwarze
Fläche.

**Ohne Ton, und zwar wirklich.** Die vier Dateien haben keine Tonspur,
nicht nur ein `muted` am Element.

**Bei reduzierter Bewegung und im Datensparmodus** wird die ganze Lage
ausgebaut und nie eine Quelle eingehängt; die Abschnitte bekommen ihren
deckenden Grund zurück. Ohne JavaScript ist die Lage `display:none`.

**Lädt der Film langsam oder gar nicht**, steht dahinter der Seitengrund,
und er blendet darauf auf. Die Seite sieht dann aus wie vorher, statt eine
halbe Sekunde lang ein leeres Rechteck zu zeigen.

---

## Nachgemessen

| | |
|---|---|
| Kontrast über dem Film, Schreibtisch | 0 Textflächen unter der Grenze (9 Scrollstände, Film im Lauf abgetastet) |
| Kontrast über dem Film, Telefon | dieselben 5 Meldungen wie in der **unveränderten** gelieferten Fassung, Wert für Wert — es sind Messartefakte (freie Textknoten und das große Wortzeichen im Fuß), keine Folge des Films |
| waagerechter Überlauf | 0 bei 320, 390, 768, 1024, 1440 und 1920 px |
| ohne JavaScript | Lage ausgeblendet, Überschrift sichtbar, nichts verdeckt |
| reduzierte Bewegung | Lage ausgebaut, Abschnitte wieder deckend |
| Telefon | Hochkantschnitt und die 2560er Bildstufe werden geholt |

## Zum Durchklicken ohne Server

```bash
python3 tools/testdatei-bauen.py --wurzel redesign
```

Das baut `herm-website-redesign-testdatei.html` — alle sechzehn Seiten in
einer Datei, mit echten Schriften, echten Bildern und dem Hintergrundfilm,
13,5 MB. Dasselbe Werkzeug baut mit `--wurzel` jetzt auch aus einem
anderen Ordner als dem Repository; welche Stylesheets und Skripte eine
Fassung hat, liest es aus deren `index.html` statt es zu raten.

**Der Film liegt darin als H.264**, nicht als VP9: die Datei wird auf
einem gewöhnlichen Gerät geöffnet, und dort ist H.264 das Format, das
jedes davon in Hardware dekodiert. Das Chromium dieser Werkstatt kann
kein H.264 — dass die Verdrahtung stimmt, ist mit `--vp9` nachgeprüft
(`readyState 4`, Film läuft). Beide Fassungen einzubetten wären 5,2 MB
für eine Datei, die niemand anfordert.

## Nachgemessen (Fortsetzung)

Gemessen wird der Kontrast über bewegtem Bild **im Bild**, nicht im DOM:
`rgba(0,0,0,.88)` ist kein deckender Vorfahr, eine DOM-Prüfung fände
davon nichts. Abgetastet wird im Lauf — der Testserver beantwortet keine
Range-Anfragen, jede Zuweisung an `currentTime` fiele still auf 0 zurück
und man fotografierte zwölfmal dasselbe Bild.


---

# Zweiter Durchgang, 23. September 2026

Zehn Punkte auf einmal. Was gemacht wurde und warum:

## 1. Der Satz stand dreimal auf der Startseite

„Personal, das Ihr Event trägt" stand im Titel, im Schlussblock
(„Lassen Sie uns Ihr Event tragen.") und in der Fußzeile noch einmal
wörtlich. Er steht jetzt **einmal**, oben im Titel.

| wo | vorher | jetzt |
|---|---|---|
| Hero | Personal, das Ihr Event trägt. | unverändert |
| Schlussblock | Lassen Sie uns Ihr Event tragen. | Reden wir über Ihre Veranstaltung. |
| Fußzeile (alle 16 Seiten) | Personal, das / Ihr Event trägt. | Jetzt / anfragen. |

Die Fußzeile trägt damit die Aktion statt einer Wiederholung; die kleine
Zeile darunter heißt „Zum Anfrageformular" und nicht mehr „Anfrage
starten", weil das schon in der Kopfzeile steht.

## 2. Der Film ist heller

Von 88 % auf **84 %** Schwarz. Der hellste Bildpunkt des Films kommt
damit bei 41 von 255 an statt bei 31 — ein Drittel mehr Licht. Volle
Schrift trägt darauf 13,6:1, die gedämpfte Stufe 5,6:1.

Nach unten ist bei rund 80 % Schluss: dort fällt die gedämpfte Stufe auf
4,7:1, also auf einen Wert, der gerade eben besteht. Ein Wert, der gerade
eben besteht, besteht beim nächsten Eingriff nicht mehr.

## 3. Keine Gesichter mehr beim Team

- **Die vier Studioporträts sind raus**, alle sechs Kacheln stehen auf
  dem vorhandenen Platzhalter (Initialen plus „Foto folgt").
- **Das Kopfband der Teamseite** ist derselbe Zuschnitt, **unterhalb der
  Kinnlinie geschnitten** (1600 × 528 statt 1600 × 880). Übrig bleibt das
  Schild, das die drei halten. Der Schnitt liegt in der **Datei**, nicht
  in `object-position`: ein Ausschnitt, der von der Kastenhöhe abhängt,
  holte die Gesichter bei irgendeiner Fensterbreite zurück.
- **Die drei runden Köpfe** im Ansprechpartner-Block von Startseite und
  `kontakt.html` sind Initialen geworden.
- **Die Galeriekachel mit dem Teamfoto** ist raus — dieselben drei
  Gesichter.
- Die Dateien unter `assets/img/team/` und `team-herm.*` sind gelöscht,
  nicht nur ausgehängt: sonst wären die Porträts unter ihrer Adresse
  weiter abrufbar.

**Was NICHT angefasst ist:** die Einsatzfotos der Galerie und der
Bereichsseiten zeigen weiter Menschen bei der Arbeit (Barkeeper,
Ordnungsdienst, Messestand). Sagen Sie Bescheid, wenn auch die weg
sollen — das wäre ein anderer Auftrag.

### Die Falle dabei

`aspect-ratio: 1600 / 880` stand fest in `redesign.css` und war das Maß
des alten Fotos. Mit dem flachen Zuschnitt musste `object-fit:cover` das
Bild auf einen fast doppelt so hohen Kasten ziehen — das Schild stand
dann bildschirmfüllend da, aus dem Kopfband wurde eine Logowand. Der
Rahmen passt sich jetzt dem Zuschnitt an (`team.css`), und zwar über eine
**eigene Klasse**: dieselbe Bandform trägt auch die Galerie.

## 4. Halle 45 stand zweimal in der Galerie

`logistik.jpg` („Tor auf, Saal fertig, Halle 45") und
`logistik-detail.jpg` („Nach dem Aufbau") sind dieselbe Halle, dieselbe
Beleuchtung, dieselben Bäume, dasselbe Schild — zwei Aufnahmen, die man
für eine hält. Die zweite ist raus. Dieselbe Doppelung stand auf
`dienstleistungen.html`: das Kopfband zeigt `halle45`, der Logistikblock
zeigte `logistik` — derselbe Blick durch dasselbe Tor. Der Block zeigt
jetzt das geschlossene Tor.

Die Galerie hat damit **11 Kacheln** statt 13.

## 5. Der Bereich Dienstleistungen läuft smoother

Vorher: sechs Bühnen mit Kamerafahrt, je zwei bildschirmfüllende Fotos
übereinander, deren Maßstab und Deckkraft der Browser in **jedem
Scrollbild** neu rechnet — sechsmal hintereinander über rund fünfzehn
Bildschirmhöhen. Das ist der Posten, der das Scrollen zäh macht: nicht
die Bewegung kostet, sondern das, was in jedem Bild neu gezeichnet
werden muss.

Es war außerdem nicht übersichtlich: wer wissen wollte, **was** es gibt,
musste vier Bildschirme je Bereich scrollen, um sechs Namen zu lesen.

Jetzt:

- **Eine Übersicht aus sechs Zeilen** ganz oben — alle sechs auf einen
  Blick, jede Zeile springt zu ihrem Block.
- **Sechs ruhige Blöcke**, bei denen das Bild die Seite wechselt.
  Nummer, Name, Merksatz, Beschreibung, die Stichworte und der Weg auf
  die Bereichsseite — Wort für Wort derselbe Inhalt wie vorher, nichts
  ist dazugekommen und nichts weggefallen.
- Bewegt wird nur noch, was ohnehin bewegt wird: die Aufblenden beim
  Hereinscrollen, dieselben wie auf jeder anderen Seite.

Die Seite ist dadurch **8 110 px** hoch statt rund 13 500. Die Anker
(`#gastro-personal`, `#sicherheit` …) sind unverändert, Verweise von
außen laufen weiter.

## 6. Zwei Funktionen aus der vorigen Fassung nachgeholt

`assets/js/nachtrag.js`, additiv — `main.js`, `lenis.min.js` und
`motion.js` sind unverändert, und **kein Pixel der Gestaltung ändert
sich**.

### `--nav-h` wackelte mit

An dieser Zahl hängen dreizehn Stellen, und jede reserviert Platz unter
der festen Kopfzeile. Geschrieben wurde sie im selben Bild, in dem die
Klasse `.scrolled` fällt — also mitten in der Überblendung:

| Scrollstand | Leiste wirklich | `--nav-h` vorher | jetzt |
|---|---|---|---|
| oben | 105 px | 105 | 105 |
| gescrollt | 73 px | 105 | 105 |
| wieder oben | 105 px | **73** | 105 |

Sichtbar war das am Hero: er wuchs beim Zurückscrollen von 900 auf
914 px. Jetzt steht er konstant.

**Der erste Versuch hat Unsinn gemessen:** Klasse kurz abnehmen, messen,
wieder setzen — `getBoundingClientRect()` liefert in dem Augenblick den
laufenden Zwischenwert der Überblendung, nicht das Ziel. Gemessen wird
deshalb nur im Ruhezustand, und der wird abgewartet statt hergestellt.

### Die Zahlen zählen hoch

„Über **20** Jahre" und „**6** Bereiche" zählen beim Sichtbarwerden hoch.
Der fertige Wert steht im Markup — ohne Skript und bei reduzierter
Bewegung steht die Zahl einfach da. Die Breite wird vorher auf die
breiteste **Zwischen**stellung reserviert (zwischen 0 und 20 steht auch
die 18, und die ist breiter als die 20), gezählt wird einmal, und kein
`aria-live` — sonst liest ein Vorlesewerkzeug sechzig Ansagen für eine
Zahl.

## 7. Der Mailversand läuft

Nachgeprüft, nicht behauptet: die gebündelte Funktion wurde mit einer
echten Anfrage gegen einen echten SMTP-Server (TLS, Anmeldung) laufen
gelassen.

```
Status 200
{"ok":true,"referenz":"AN-260923-1400-SGQ","angebot":"A-260923-1400-SGQ",
 "status":"DRAFT","bestaetigt":true}

MAIL FROM: <noreply@hermserviceteam.com>
RCPT TO:   <info@hermserviceteam.com>     (Disposition, mit PDF-Beleg)
RCPT TO:   <erika@example.org>            (Bestätigung an den Kunden)
Subject:   Neue Personalanfrage – Musterfirma GmbH – 10.10.2026
```

Der Beleg wird gebaut, der Angebotsentwurf auch, beide gehen als Anhang
mit. Die Pflichtfeldprüfung greift (ohne Pflichtangaben kommt 400
zurück), und ohne eingerichteten Versand kommt 503 statt einer
vorgetäuschten Erfolgsmeldung.

**Was dafür noch fehlt, und das kann nur der Betrieb setzen:** die
Umgebungsvariablen bei Netlify —

```
SMTP_HOST   SMTP_PORT   SMTP_USER   SMTP_PASS
MAIL_AN     MAIL_VON    (optional MAIL_BEWERBUNG, MAIL_BESTAETIGUNG)
```

Ohne sie antwortet `/api/formular` mit 503 und die Anfrage landet im
Formularspeicher von Netlify, den niemand ansieht. **Das ist der eine
Punkt, an dem die Seite am Tag des Live-Gangs stillschweigend nicht
tut, was sie soll.**

## 8. Suchmaschinen freigeschaltet

`noindex` ist raus — aus allen fünfzehn Seitenköpfen, aus `robots.txt`
und aus dem Header in `netlify.toml`. **`404.html` bleibt auf `noindex`:**
eine Fehlerseite gehört in keinen Index, auch im Live-Betrieb nicht.

Zurück geht es mit `python3 tools/live-schalten.py --wurzel redesign --test`.

Noch von Hand: die Sitemap in der Google Search Console einreichen.

## 9. Was weggefallen ist, weil es niemand mehr anfordert

`imagefilm.webm` (4,9 MB), seine Untertitelspur und das Poster in vier
Fassungen. Der Abspieler ist in der Neugestaltung nicht mehr da; die
Vorlage, aus der die vier Hintergrundschnitte kommen, liegt im
Repository.

## 10. Abnahme

| | |
|---|---|
| tote Verweise / 404 | **0** |
| doppelte IDs | **0** |
| doppelte Titel / Descriptions | **0** |
| Seiten ohne genau eine `<h1>` | **0** |
| waagerechter Überlauf | **0** bei 320, 390, 768, 1024, 1440, 1920 px × 16 Seiten |
| Konsolen- und Netzfehler | **0** (bis auf `POST /api/konto` → 501 vom Testserver) |
| ohne JavaScript / reduzierte Bewegung | nichts verdeckt, nichts unsichtbar |
| wiederholte Sätze innerhalb einer Seite | **0** |
| dasselbe Motiv zweimal auf einer Seite | **0** |
| Kontrast über dem Film, Schreibtisch | **0** von 120 Textflächen unter der Grenze |
| Kontrast über dem Film, Telefon | dieselben 5 Meldungen wie in der **unveränderten** gelieferten Fassung, Wert für Wert — Messartefakte, keine Folge der Änderungen |


---

# Fünf Aufnahmen mehr in der Galerie

Dazugekommen sind fünf Bilder aus dem Einsatz:

| Datei | was darauf ist | Bildunterschrift |
|---|---|---|
| `event-modehaus` | zwei Servicekräfte reichen Getränke bei einem Store-Event | Getränkeservice bei einem Store-Event |
| `event-doormen` | fünf Doormen in Uniform mit weißen Handschuhen | Doormen am Eingang |
| `event-empfang` | Servicekraft mit Tablett zwischen den Gästen | Zwischen den Gästen |
| `event-aufstellung` | Serviceteam mit Tabletts vor dem Einlass | Aufstellung vor dem Einlass |
| `event-kaufhaus` | Abendveranstaltung auf der Treppe eines Kaufhauses | Abendveranstaltung im Kaufhaus |

Jede in AVIF, WebP und JPEG, lange Kante 1600 px — dieselbe Behandlung wie
jedes andere Motiv der Fassung. Vier der fünf Vorlagen liegen unter oder
genau auf 1600 px, es wird also nichts hochgerechnet.

**Die Bildunterschriften nennen keinen Auftraggeber.** Auf den Aufnahmen
sind Namen zu lesen, aber ein Name unter einem Foto ist eine Aussage über
eine Geschäftsbeziehung — und die wird hier nicht behauptet. Beschrieben
wird, was zu sehen ist.

Eingesetzt sind sie **verteilt**, nicht als Block am Ende: neben das
passende vorhandene Motiv. Sonst stünden die fünf neuen Bilder
ausgerechnet dort, wo am wenigsten hingesehen wird.

Das Teamfoto mit dem hochgehaltenen Schild ist aus der Galerie raus — das
war schon im vorigen Durchgang erledigt (die drei Gesichter).

Stand: **16 Kacheln**, alle laden, kein waagerechter Überlauf, keine
Konsolen- oder Netzfehler, alle Aufblenden gehen auf.


---

# Keine Striche zwischen Texten

Auf dem Telefon standen beim Durchscrollen mehr als ein Dutzend
waagerechter Trennlinien zwischen Textblöcken. Sie sind weg — auf jeder
Seite, am Telefon wie am Schreibtisch.

Gemessen wurde nicht im Stylesheet, sondern **im gerenderten Baum**: ein
Skript geht über zehn Seiten jedes sichtbare Element durch und meldet
jede Kante mit einer Farbe, dazu jedes absolut gesetzte Pseudoelement
von einem Pixel Höhe.

| | vorher | nachher |
|---|---|---|
| Selektoren mit sichtbarer Linie | 84 | 39 |
| davon Striche zwischen Texten | 45 | **0** |

Weg sind: die Abschnittskanten (`.cta`, `.ablauf`, `.expect`, `.trust`,
`.section-soft`, die sechs Bereichsblöcke, der Fuß), die Trennlinien
zwischen den Einträgen einer Liste (Stellen, FAQ, die sechs Zeilen der
Bereichsübersicht, die vier Schritte, die Versprechen, die
Referenzkarten), und die vier Linien, die als Pseudoelement gezeichnet
wurden (die Verbindungslinie der Schritte, die der Referenzkarten, das
Einsatzband und die Trenner zwischen den Formulargruppen).

**Was getrennt wird, trennt jetzt der Abstand.** Wo er allein zu knapp
wäre, wächst er mit: die sechs Zeilen der Bereichsübersicht standen mit
18 px Luft aneinander, die Stellenanzeigen mit 26 — beides liest ohne
Linie als ein Block statt als Folge.

`border-*-color: transparent` und nicht `border: 0`: an der Linie hängt
ein Pixel Höhe. Eine Farbe wegzunehmen verschiebt nichts, eine Kante
wegzunehmen verschöbe jeden Abschnitt darunter um ein Pixel.

## Was stehen geblieben ist, und warum

- **Knöpfe, Chips und Badges.** Das ist die Kontur eines Bedienteils,
  kein Strich zwischen zwei Texten — ohne sie wäre der Knopf weg.
- **Die Schreiblinie unter einem Formularfeld.** Dasselbe Argument, und
  ohne sie sieht man nicht mehr, wo man schreibt.
- **Die Unterlinie eines Links** und die Oberkante der App-Leiste am
  Telefon: die trennt die Leiste vom Inhalt, nicht zwei Texte.
- **Bindestriche in Wörtern** — „Gastro-Personal", „Menü-Service",
  „TV-Show", „Auf- und Abbau". Das sind keine Trennzeichen, sondern Teil
  der Schreibweise; ohne sie stünde dort falsches Deutsch.

**Silbentrennung gibt es auf dieser Seite gar nicht:** `hyphens` steht in
keinem Stylesheet, der Browser trennt also kein Wort und setzt auch
keinen Trennstrich am Zeilenende. Halbgeviert- und Geviertstriche (–, —)
sowie Mittelpunkte (·) kommen im sichtbaren Text an keiner einzigen
Stelle vor; nachgezählt über alle sechzehn Seiten.

Abnahme danach unverändert: 0 waagerechter Überlauf bei sechs Breiten
über 16 Seiten, 0 Konsolen- und Netzfehler (bis auf `POST /api/konto`
→ 501 vom Testserver), ohne JavaScript und bei reduzierter Bewegung
nichts verdeckt.


---

# Das Kopfbild der Jobseite ist nachgeschärft

Bestellt war „auf 4K schärfen". Was möglich war, ist gemacht; was nicht
möglich war, steht hier, denn es ist die wichtigere Hälfte der Antwort.

## Was die Vorlage trägt

`assets/img/gastro-detail.jpg` ist 1600 × 1600 groß. Das sagt aber nur,
wie viele Pixel in der Datei stehen, nicht wie viel Bild darin steckt.
Nachgemessen, indem dieselbe Datei verkleinert und wieder hochgerechnet
und dann mit dem Original verglichen wird (PSNR):

| verkleinert auf | PSNR gegen das Original |
|---|---|
| 1200 px | 44,0 dB |
| 800 px | 42,3 dB |
| **500 px** | **41,3 dB** |

Ab etwa 40 dB sieht man keinen Unterschied mehr. **Die Datei trägt also
rund 500 bis 600 px echtes Detail** — der Rest ist bereits hochgerechnet.
Eine 3840er Datei daraus zu bauen erzeugt keine Bilddetails, sie erzeugt
nur Gewicht. Genau dieselbe Rechnung steht in CLAUDE.md unter „Das Bild
mit den Pflanzen in 4K".

## Was trotzdem hilft: schärfen, und zwar in der richtigen Reihenfolge

Gemessen wurde nicht die Datei, sondern die **Darstellung**: 1440er
Schirm, doppelte Pixeldichte, der Kasten des Kopfbilds (1690 × 742),
Kantenschärfe als mittlerer Gradientenbetrag.

| Fassung | Kantenschärfe |
|---|---|
| vorher, 1600 px | 0,80 |
| vorher, zweite Stufe 2560 px | 0,84 |
| 140 % Nachschärfung bei 1600 px | 1,05 |
| **140 % bei 1600, danach auf 2560 hochgerechnet** | **1,14** |
| 200 % | 1,17, aber mit sichtbaren Halos |

**Erst schärfen, dann hochrechnen** — nicht umgekehrt. Dieselbe Datei in
der anderen Reihenfolge misst 0,96: die Hochrechnung mittelt eine
nachträgliche Schärfung weg, eine vorher eingebaute wächst mit. Das ist
die Begründung, die in CLAUDE.md unter „Wie viele Stufen eine Vorlage
trägt" schon für die Motive steht.

Geliefert ist `UnsharpMask(1.6, 140 %, 2)` auf der 1600er Datei und die
zweite Stufe daraus hochgerechnet. Im Markup steht die 2560er Stufe jetzt
auch als WebP, nicht nur als AVIF. Nachgeprüft im Browser: geholt wird
`gastro-detail-gross.avif`, die gerenderte Kantenschärfe liegt bei
**1,14 statt 0,80**, also **+43 %**.

## Was der Betrieb liefern müsste

Echte Schärfe kann nur eine echte Aufnahme liefern. Gebraucht wird die
Originaldatei mit mindestens 2400 px an der langen Kante, für wirkliches
4K über die volle Breite 3840 px (`docs/foto-briefing.md`). **In ein
Gespräch eingefügte Bilder werden auf dem Weg verkleinert** — als Datei
angehängt kommen sie in voller Größe an.


---

# Der Menüpunkt Catering

Der Schwesterbetrieb bekommt einen eigenen Reiter in der Hauptnavigation:

```html
<a href="https://stullenwerk.com" target="_blank" rel="noopener noreferrer"
   aria-label="Catering, Stullenwerk, oeffnet in einem neuen Tab">Catering</a>
```

Er steht auf allen sechzehn Seiten an derselben Stelle, hinter „Kontakt".

**Nur oben in der Menüleiste**, wie bestellt: nicht in der Sitemap im
Fuß, nicht in der App-Leiste am unteren Bildrand, nicht im Balken unter
der Kopfzeile. Im Vollbildmenü steht er dagegen — das *ist* die
Menüleiste am Telefon, dort wird sie über den Menüknopf aufgeklappt.
Ohne ihn wäre der Punkt auf dem Telefon überhaupt nicht erreichbar.

Drei Dinge daran sind nicht beliebig:

- **`target="_blank"` samt `rel="noopener noreferrer"`.** Es ist der
  einzige Punkt der Hauptnavigation, der die Website verlässt. `noopener`
  nimmt der geöffneten Seite den Zugriff auf `window.opener`.
- **Ein `aria-label`, das den neuen Tab ansagt.** Ein Vorlesewerkzeug
  meldet sonst nur „Catering, Link" und der Wechsel kommt unangekündigt.
- **Keine eigene Klasse.** `.nav__extern` stand zuerst am Link und hatte
  keine Regel — eine Klasse ohne Regel ist eine Behauptung über das
  Layout, die niemand einlöst. Der Eintrag sieht aus wie die anderen
  sechs; was ihn unterscheidet, sagt das `aria-label`.

**Die Datenschutzerklärung ist nachgezogen.** Abschnitt 2 („Was diese
Website nicht tut") nennt ihn jetzt neben dem Mitarbeiter-Login: ein
einfacher Link, keine Einbettung, keine Verbindung dorthin, solange
niemand darauf klickt, und danach gilt die Erklärung des dortigen
Anbieters. Dieselbe Bauform und dieselbe Begründung wie bei
`hst.secplan.net`.

Abnahme danach: 0 waagerechter Überlauf bei sechs Breiten über 16
Seiten, 0 tote Verweise, 0 doppelte IDs, 0 Konsolen- und Netzfehler
(bis auf `POST /api/konto` → 501 vom Testserver).


---

# Das Impressum, und wer die Erlaubnis wirklich hat

Die Pflichtangaben liegen vor, der Kasten „Vor dem Live-Gang zu
vervollständigen" ist damit weg. Eingetragen sind:

| | HERM Service Team e.K. |
|---|---|
| Inhaber | Maik Herm |
| Registergericht | Amtsgericht Hamburg |
| Registernummer | HRA 122237 |
| USt-IdNr. | DE314900117 |
| Steuernummer | 41/093/1642 |

Dazu ein neuer Abschnitt **Verbundene Unternehmen** mit der
HST Überlassung GmbH (Alexander Krapp, HRB 191317, DE455147576,
43/732/02369) und der HST Hospitality UG (haftungsbeschränkt)
(Maik Herm und Alexander Krapp, HRB 194432, DE457080753, 43/732/02393).

## Der Fehler, der auf sechzehn Seiten stand

**Die Erlaubnis zur Arbeitnehmerüberlassung läuft über die HST Überlassung
GmbH, nicht über die HERM Service Team e.K.** Die Website hat bis jetzt das
Gegenteil behauptet, und zwar an vier verschiedenen Stellen:

| Wo | stand da | steht da |
|---|---|---|
| Fußzeile, **alle 16 Seiten** | „HERM Service Team e.K., Erlaubnis zur Arbeitnehmerüberlassung (AÜG)" | „…, Arbeitnehmerüberlassung über die HST Überlassung GmbH (Erlaubnis nach AÜG)" |
| Startseite, Vertrauensband | „Arbeitnehmerüberlassung mit gültiger Erlaubnis" | „Arbeitnehmerüberlassung über die HST Überlassung GmbH" |
| Jobseite, FAQ | „wir haben die Erlaubnis zur Arbeitnehmerüberlassung" | „Die Arbeitnehmerüberlassung läuft über die HST Überlassung GmbH, die die Erlaubnis dafür besitzt" |
| Jobseite, strukturierte Daten | dieselbe Antwort ein zweites Mal | mitgezogen |

**Die vierte Zeile ist die, die man vergisst.** Die FAQ-Antwort steht zweimal
in der Datei: sichtbar im `<details>` und noch einmal als `FAQPage` im
JSON-LD-Block für Google. Wer nur die sichtbare ändert, hat eine Website, die
etwas anderes sagt als ihre eigenen strukturierten Daten, und das sieht kein
Auge. Beide Fassungen sind nachgezogen.

Stehen geblieben ist die Auszeichnung „Arbeitnehmerüberlassung (AÜG)" in der
Merkmalsreihe des Intros. Sie sagt, **was** das Haus anbietet, nicht **wer**
die Erlaubnis hält, und das stimmt weiterhin.

## Die Urkunde liegt als Bild bei

`assets/img/erlaubnis-aug.{avif,webp,jpg}`, aus dem gelieferten PDF gerechnet:
die eingebettete Aufnahme hat 2473 × 3497 px, im Paket stehen 990 × 1400.
**Hier wird nach dem Verkleinern geschärft**, nicht davor — die Regel „erst
schärfen, dann rechnen" aus dem Jobsbild gilt für das Hoch­rechnen, wo die
Hochrechnung eine nachträgliche Schärfung wegmittelt. Beim Herunterrechnen ist
es umgekehrt.

| | |
|---|---|
| AVIF | 52 KB (wird geholt) |
| WebP | 84 KB |
| JPEG | 132 KB (Rückfallebene und Ziel des Verweises) |

Im Satzspiegel steht das Blatt 520 px breit, am Telefon 350. Der Verweis
öffnet die volle Auflösung in einem neuen Tab: lesbar ist es im Text, prüfbar
erst dort.

**Warum es einen Kasten bekommt**, obwohl die Website keine Karten kennt: das
hier **ist** ein Blatt Papier. Eine amtliche Urkunde auf Schwarz ohne Kante
sähe aus wie ein Leuchtfeld, nicht wie ein Dokument. Die Haarlinie ist die
Kante des Gegenstands, nicht Zierrat um einen Inhalt — und deshalb ist sie in
`ohne-striche.css` auch nicht mitgemeint: dort fällt weg, was zwischen zwei
Texten steht.

Die Daten der Urkunde stehen zusätzlich als Text darüber, damit sie auch ohne
Bild lesbar sind: erteilt durch die Agentur für Arbeit Kiel am 22. Juli 2026,
gültig vom 13. August 2026 bis zum 12. August 2027, bestehend seit dem
13. August 2025. Der `alt`-Text gibt den ganzen Satz der Urkunde wieder.

**Die Erlaubnis ist befristet.** Am 12. August 2027 läuft sie aus; die
Nachfolgeurkunde gehört dann an dieselbe Stelle.

## Abnahme

Funktionen, Verweise und Scroll-Effekte über alle 16 Seiten, einmal ganz
durchgescrollt (200 px je 45 ms, Seitenhöhe bei jedem Schritt neu gemessen):

| | |
|---|---|
| Aufblenden, die offen bleiben | **0** |
| `--weg` / `--lauf` nicht geschrieben | 0 / 0 |
| Bilder, deren `aspect-ratio` nicht zur Darstellung passt | 0 |
| Bilder, die nicht geladen haben | 0 |
| `.wrap` mit falschem Seitenrand | 0 |
| Textelemente unter 5 % Deckkraft | 0 |
| Skriptfehler | 0 |
| tote Verweise · doppelte IDs · doppelte Titel | 0 · 0 · 0 |
| waagerechter Überlauf, 6 Breiten × 16 Seiten | 0 |

Bedienteile einzeln nachgefasst:

| | |
|---|---|
| Lightbox der Galerie | öffnet, blättert weiter, Escape schließt |
| Anfrageformular | leer ungültig, Honigtopf da, bedingtes Feld schaltet von `none` auf `block` |
| Sprungziel `#bewerbung` | landet bei 93 px, nicht hinter der Kopfzeile |
| Nach-oben-Knopf | sichtbar ab Scrollstand, springt auf 3 px |
| Tonschalter | `aria-pressed` false → true |
| Externe Links | 10 gefunden, alle mit `_blank` und `noopener` |
| Hintergrundfilm | `hintergrund.webm` läuft, **0 Byte Tonspur** |
| Zähler im Vertrauensband | 20/20 und 6/6 |
| Vollbildmenü am Telefon | öffnet, Escape schließt |
| App-Leiste am Telefon | 63 px, Start · Leistungen · Jobs · Anfrage, aktiver Reiter markiert |

Einziger verbliebener Konsoleneintrag ist `POST /api/konto` → 501: das ist der
lokale Testserver, der keine POST-Anfragen kennt. Auf Netlify beantwortet die
Funktion sie.


---

# Musik am Tonschalter

Der Schalter oben rechts gab es schon: `motion.js` baut ihn und hängt
daran die synthetischen Bedienklänge (ein Tick auf Links, ein weicher
Schlag auf Knöpfen). Er trägt jetzt zusätzlich die gelieferte Musik.
**Beides bleibt** — Ton an heißt Musik und Klänge, Ton aus heißt Stille.

## Die Datei

| | |
|---|---|
| Vorlage | MP3, 256 kbit/s, 126,7 s, **−9,1 LUFS** bei +0,1 dBTP |
| geliefert | Opus/WebM 64 kbit/s (**999 KB**) und AAC/MP4 96 kbit/s (1379 KB) |
| Länge | 115,5 s als nahtlose Schleife |
| Pegel | −18,0 LUFS bei −8,9 dBFS Spitze, gespielt bei 0,45 |

**Die Vorlage ist eine gemasterte Produktionsspur und läuft bis an die
Klippe** (+0,1 dBTP, −9,1 LUFS). Als Bett unter einer Website ist das
unbrauchbar laut. Heruntergesetzt wird mit einer **reinen Verstärkung**
von −8,9 dB, nicht mit `loudnorm`: das hätte die Dynamik zusätzlich auf
LRA 3,0 gedrückt. Gespielt wird bei 0,45, also −6,9 dB, macht rund
**−25 LUFS am Ohr**: hörbar, aber unter jeder Stimme und jedem Systemton.
Wer sie lauter will, dreht an `PEGEL` in `assets/js/musik.js` und an
nichts sonst.

## Die Schleife hat keine Naht

Die Vorlage blendet ab Sekunde 119,7 aus und endet in Stille. Als
Schleife hieße das: ein Loch von sieben Sekunden, dann ein harter
Wiedereinstieg. Geschnitten ist deshalb

- die Ausblende weg (Schnitt bei 119,5 s),
- die letzten zwei Sekunden über die **ersten** zwei geblendet,
- Ergebnis 115,5 s, deren Ende in ihren eigenen Anfang läuft.

Nachgemessen am Pegel in 100-ms-Fenstern über die Naht hinweg: **1,8 dB
Sprung an der Naht selbst**, während die Musik von sich aus um bis zu
7,7 dB schwankt. Die Naht liegt also unter dem, was das Stück ohnehin tut.

## Es lädt nichts, bevor jemand den Schalter drückt

Das ist der Punkt, an dem 2,4 MB sonst auf dem kritischen Pfad stünden —
mehr, als die ganze Startseite an Bildern lädt. Das `<audio>` entsteht
deshalb **im Skript**, nicht im Markup: ein Element mit `src` im Markup
holt auf manchen Browsern trotz `preload="none"` die ersten Blöcke.

Nachgemessen: Seite geladen, 3,5 s gewartet, 2000 px gescrollt →
**null Anfragen** an die Musikdateien. Erst der Klick holt sie.

| | |
|---|---|
| ohne Klick | nichts geladen |
| Klick | `200 hintergrundmusik.webm`, `volume` 0,2 nach 0,4 s → 0,45 nach 3 s |
| zweiter Klick | blendet auf 0, dann `pause` |
| zweiter Besuch (Schalter gespeichert auf an) | nichts, bis zur ersten Geste; danach läuft sie |
| Bereichsseite | `/assets/audio/…` löst korrekt auf |
| reduzierte Bewegung | keine Musik, Schalter bleibt für die Klänge |

## Drei Entscheidungen, die nicht beliebig sind

- **Ein eigenes Skript statt einer Änderung an `motion.js`.** Die Datei
  liegt minifiziert in der gelieferten Fassung. `musik.js` daneben ist
  nachlesbar und fällt sauber aus: lässt man sie weg, ist der Schalter
  wieder genau der, der er vorher war.
- **Die beiden Adressen hängen als `data-`Attribute am Schalter**, nicht
  als Zeichenkette im Skript. Auf den sechs Bereichsseiten steht
  `../assets/…`; eine Adresse im Skript wäre dort falsch. Dasselbe
  Verfahren wie beim Hintergrundfilm.
- **Hier steht Opus zuerst, beim Film steht H.264 zuerst.** Das ist kein
  Widerspruch: beim Film war die Hardware-Dekodierung das Argument, weil
  er dauernd läuft und auf dem Akku sonst heiß wird. Eine Tonspur kostet
  davon nichts, also zählt nur die Dateigröße. Die AAC-Fassung steht
  daneben für Safari, das Opus in WebM nicht zuverlässig abspielt — ein
  iPhone, auf dem der Schalter nichts tut, wäre ein Knopf ohne Funktion.

## Die Messung, die nichts gemessen hat

Um die Bitrate zu wählen, wurde jede Fassung zurückdecodiert und
frameweise gegen die Vorlage gehalten (log-spektrale Distanz). Ergebnis:
13,19 dB bei 48k, 13,42 bei 56k, **13,94 bei 64k** — die Zahl stieg mit
der Bitrate. Das ist kein Codec-Verhalten, sondern ein Messfehler: Opus
verschiebt die Phase, und ein frameweiser Vergleich misst dann die
Ausrichtung.

Mit dem **Langzeitspektrum** (über die ganze Datei gemittelt, damit die
Ausrichtung keine Rolle spielt) liegen 48k bis 80k alle zwischen 2,7 und
3,8 dB — also innerhalb des Rauschens des Verfahrens. **Die Messung kann
die Stufen nicht auseinanderhalten, und das ist selbst das Ergebnis.**
Gewählt ist deshalb 64k, der anerkannte Transparenzpunkt für Stereomusik,
und nicht eine Zahl, die eine Messreihe angeblich ausgesucht hat.

Zum vierten Mal in dieser Datei dieselbe Lehre: **wer eine Auffälligkeit
gleichmäßig über die ganze Messreihe vorfindet, hat seinen Test gemessen
und nicht die Sache.**

## Im Paket und in der Testdatei

Das Paket trägt beide Fassungen (25,1 → **27,6 MB**). Die Testdatei trägt
nur die Opus-Fassung, und `data-musik-m4a` fällt dort aus dem Markup —
dieselbe Rechnung und derselbe Handgriff wie beim nicht eingebetteten
Filmformat. `tools/testdatei-bauen.py` meldet ein WebM unter
`assets/audio/` außerdem als `audio/webm` an und nicht als `video/webm`:
eine `data:`-URI wird nach ihrem MIME entschlüsselt, nicht nach ihrem
Inhalt.


---

# Die Anfragen gehen an info@hermserviceteam.com

Personalanfragen und Bewerbungen landen im Postfach
**info@hermserviceteam.com**, und zwar **ohne dass dafür eine Variable
gesetzt sein muss**. Die Adresse steht als Boden in der Funktion.

## Das Bündel im Paket war älter als der Quellcode

Das ist der eigentliche Befund. `api/_vorgang.js` trägt den Boden seit dem
Live-Gang-Durchgang:

```js
const REGELEMPFAENGER = 'info@hermserviceteam.com';
const an = art === 'bewerbung'
  ? (process.env.MAIL_BEWERBUNG || process.env.MAIL_AN || REGELEMPFAENGER)
  : (process.env.MAIL_AN || REGELEMPFAENGER);
```

Im gelieferten Paket lag aber noch das Bündel von vorher:

```js
i = r === "bewerbung" && process.env.MAIL_BEWERBUNG || process.env.MAIL_AN;
if (!o || !s || !a || !i) return t(503, …);
```

**Ohne `MAIL_AN` wäre also nichts angekommen** — nicht einmal mit
eingerichtetem SMTP. Beide Funktionen sind aus dem aktuellen Quellcode neu
gebündelt (`esbuild`, dieselben Schalter wie in `tools/paket-bauen.sh`).

Die allgemeine Form davon: **ein vorgebündelter Serverteil altert still.**
Er sieht im Paket genauso aus wie vorher, er lädt sich, er wirft keinen
Fehler — er verhält sich nur anders als der Quellcode, aus dem er einmal
entstanden ist. Wer am Quellcode etwas ändert, das die Auslieferung
betrifft, muss das Bündel mitbauen.

## Nachgemessen gegen ein echtes Postfach

Geprüft wurde nicht der Quellcode, sondern **das Bündel, das im Paket
liegt**, aufgerufen wie Netlify es aufruft, gegen ein SMTP-Postfach auf
127.0.0.1 mit echtem TLS.

**Ohne `MAIL_AN`, ohne `MAIL_BEWERBUNG`:**

| | Status | RCPT TO | Anhänge |
|---|---|---|---|
| Anfrage | 200 | `info@hermserviceteam.com` | Beleg-PDF, Angebot als DOCX, Angebot als PDF |
| Bestätigung an den Absender | | `erika@example.org` | keine |
| Bewerbung | 200 | `info@hermserviceteam.com` | Beleg-PDF |
| Bestätigung an den Bewerber | | `max@example.org` | keine |

**Mit `MAIL_AN=disposition@example.org`:** `RCPT TO:<disposition@example.org>`
— die Variable schlägt den Boden weiterhin.

Beide Bündel laden sich und fordern **kein einziges fremdes Modul** nach.

## Was jetzt noch fehlt, und es ist nicht wenig

**Das Postfach, über das versendet wird.** Diese vier Angaben kann kein
Skript aus sich heraus erzeugen; sie gehören in Netlify unter
*Site configuration → Environment variables*:

```
SMTP_HOST   z. B. smtp.ionos.de
SMTP_PORT   465 (SSL) oder 587 (STARTTLS)
SMTP_USER   das Postfach, über das versendet wird
SMTP_PASS   dessen Kennwort
```

Fehlt eine davon, antwortet die Funktion mit 503. **Das ist kein Fehler,
sondern ein Signal:** die Website nimmt dann ihren Auffangweg über Netlify
Forms, und kein Eingang geht verloren. Damit die dort gesammelten Eingänge
als Mail ankommen, braucht es einen Handgriff in der Oberfläche, den keine
Datei im Projekt vornehmen kann:

> Netlify → Forms → Formular wählen → Settings → Form notifications →
> Add notification → Email notification → `info@hermserviceteam.com`

Für beide Formulare einzeln, „anfrage" und „bewerbung". Der Unterschied
zum Weg über SMTP: Netlify Forms schickt den reinen Feldinhalt. Beleg,
Angebotsentwurf und Eingangsbestätigung entstehen nur in der Funktion.

Die ganze Liste steht jetzt als Kommentar in `netlify.toml` — also dort,
wo jemand nachsieht, der die Seite aufsetzt.

## Die Adresse steht auf allen drei Ebenen

| Weg | woher die Adresse kommt |
|---|---|
| `/api/formular` | Boden in der Funktion (neu im Paket) |
| Netlify Forms | Einstellung in der Netlify-Oberfläche |
| `mailto:` als letzter Ausweg | `data-empfaenger` am `<form>`, war schon richtig |
