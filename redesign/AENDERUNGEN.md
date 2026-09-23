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
