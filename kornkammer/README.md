# Team Kornkammer · Website 2026

Cinematische Markenwelt für **Team Kornkammer** und **Kornkammer Haus Holte**,
Bioland Betrieb in Witten an der Ruhr. Next.js App Router, TypeScript, GSAP,
Lenis. Kein Baukasten, keine Fremdaufrufe zur Laufzeit.

Leitidee: **Ein Stück Natur aus dem Revier.**

---

## Starten

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## Demo zum Ansehen ohne Server

```bash
npm run demo
```

Ergebnis ist **`demo/kornkammer-demo.html`**, rund drei Megabyte, eine
einzige Datei. Doppelklick genügt, es braucht keinen Server und keine
Internetverbindung: Stylesheet, Schriften, das Motion-Skript, das Poster und
das Hero-Video stecken darin. Die Datei lässt sich per Mail weitergeben.

Sie kommt **auch ohne JavaScript** vollständig zur Anzeige. Das ist keine
Kür: Vorschaufenster blockieren häufig Skripte, und dann darf weder der
Ladevorhang stehen bleiben noch das Video fehlen. Deshalb steht in dieser
Datei alles fest im Markup — das Video als `src`, die Platzhalter als
Bilddatei — statt nachträglich eingehängt zu werden.

Was darin anders ist als in der echten Seite:

- Es ist **nur die Startseite**. Ein Klick auf einen Menüpunkt navigiert
  nicht, sondern blendet kurz einen Hinweis ein.
- Das Video liegt in einer sparsamen Fassung bei (`hero-demo.mp4`,
  590 × 1280, knapp ein Megabyte), damit die Datei versendbar bleibt und
  Safari die Daten-URL annimmt. Die 4K-Fassung steckt in `public/video/`.
  **H.264, nicht VP9** — Safari auf dem iPhone spielt WebM nicht
  zuverlässig. WebM liegt nur als Rückfall für Browser ohne H.264 bei.
- Für die fehlenden Fotos steht ein beschriftetes Platzhalterbild
  (`tools/platzhalter.webp`) statt des Platzhalters aus `MediaFrame` — der
  bräuchte JavaScript.
- Die Browserkonsole meldet ein paar fehlgeschlagene Abrufe. Das ist der
  Router von Next, der die Daten der Unterseiten vorholen will — die gibt es
  in der einen Datei nicht. Sichtbar ist davon nichts.

Gebaut wird sie von `tools/demo-bundle.mjs` aus dem statischen Export.

**Beim Ändern des Bündlers aufpassen:** Elemente dürfen ersetzt, aber nicht
entfernt werden. React vergleicht beim Hydrieren die Struktur; nimmt man ein
Element heraus, baut React den Teilbaum neu auf und verliert dabei genau die
Attribute, die der Bündler gesetzt hat — das Video stand dann still. Deshalb
wird die Quellenwahl des Heros nicht angetastet, sondern ein Wächter im Kopf
fängt die eine schädliche Zuweisung ab.

---

## Das Hero Video

Das Wichtigste am Projekt. Erstes sichtbares Element der Startseite ist der
Drohnenclip, fullscreen über `100svh`, kein Bild und kein Ladefries davor.

### Was mit dem Material passiert ist

Das gelieferte Original war **590 × 1280** bei 30 fps, 16,9 s, ohne Tonspur.
Das ist deutlich unter HD und fullscreen sichtbar weich. Der Clip wurde auf
**1770 × 3840** hochgerechnet, also exakt dreifach und damit auf die
UHD Langkante.

Wichtig zur Einordnung: Ein Upscale rechnet Pixel dazu, er holt keine Details
zurück, die nie aufgenommen wurden. Es ist sauber interpoliertes 4K, kein
natives. Wer echte Schärfe will, exportiert den Master neu aus dem
Originalmaterial der Drohne, idealerweise als Querformat. Die Seite ist darauf
vorbereitet: gleicher Dateiname, kein Codeeingriff.

### Die Kette

```
hqdn3d    Rauschen dämpfen, sonst verstärkt der Upscaler es mit
nnedi3    kantengeführte neuronale Verdopplung, beide Achsen
lanczos   Rest auf den Zielfaktor
cas       Contrast Adaptive Sharpen, holt Mikrokontrast zurück
unsharp   dezent obendrauf
crop      links acht Pixel weg, siehe unten
```

**Der grüne Rand.** `nnedi` lässt in Verbindung mit `transpose` links eine
unbrauchbare Spalte stehen, sechs Pixel breit, in reinem Grün. Im Standbild
fällt das kaum auf — bis `object-fit: cover` den Hochformat-Clip auf einem
Querformat-Fenster um das Sechsfache streckt. Dann steht dort ein fetter
grüner Balken. `tools/video-neu.sh` schneidet deshalb acht Pixel ab und
zieht die Breite wieder auf. Der Versatz von 0,45 Prozent ist unsichtbar.
Nachgemessen wird über die ganze Bildhöhe, nicht nur mittig.

Gegen reines Lanczos gewinnt die Kette sichtbar: definierte Kanten statt
Blockstruktur, ruhigere Flächen. Das Skript liegt unter `tools/upscale.sh`.

### Die Auslieferungsleiter

| Stufe | Auflösung   | MP4     | WebM    | wird geladen ab            |
| ----- | ----------- | ------- | ------- | -------------------------- |
| uhd   | 1770 × 3840 | 8,0 MB  | 6,3 MB  | Bildbreite über 1800 px    |
| hd    | 1180 × 2560 | 3,7 MB  | 2,8 MB  | Standard, steht im Markup  |
| sd    | 590 × 1280  | 1,7 MB  | 1,3 MB  | Sparmodus oder langsames Netz |

Die Wahl trifft `components/sections/Hero.tsx` beim ersten Rendern anhand von
`devicePixelRatio`, Fensterbreite und `navigator.connection`. Ohne JavaScript
bleibt es bei der Stufe `hd`, die im Markup steht — die Seite funktioniert also
auch dann.

Warum nicht überall 4K: Der Clip ist Hochformat. Auf einem querformatigen
Desktop deckt `object-fit: cover` über die **Breite** ab, ein Telefon braucht
dafür kaum mehr als die Stufe `hd`. Acht Megabyte an jedes Gerät auszuliefern
wäre teuer bezahlte Unschärfe.

### Wenn Autoplay ausbleibt

Autoplay kann aus Gründen scheitern, die die Seite nicht kennt — der
Stromsparmodus auf dem Telefon unterbindet es grundsätzlich. Bleibt die
Wiedergabe nach anderthalb Sekunden stehen, erscheint mittig ein Knopf
„Film abspielen". Der Aufruf steht direkt in der Tipp-Behandlung, weil iOS
die Wiedergabe nur aus einer echten Nutzergeste heraus erlaubt.

### Kein Scrub

Die Wiedergabeposition an den Scrollfortschritt zu koppeln wurde verworfen: bei
dieser Auflösung muss der Browser dauernd neu suchen, das ruckelt. Stattdessen
sanftes Autoplay im Loop plus Scale und Masken Reveal, wie in der Vorgabe als
Alternative vorgesehen.

### Reduzierte Bewegung

Ist `prefers-reduced-motion: reduce` gesetzt, wird das Video **gar nicht
geladen**. Es bleibt beim Poster, der Titel blendet sanft ein, der Hero
verliert seinen zusätzlichen Scrollweg.

---

## Aufbau

```
app/                 Routen, jede Seite mit eigenen Metadaten
components/
  layout/            Nav, FullscreenMenu, Footer, PageTransition, Loader
  motion/            SmoothScroll (Lenis), Reveal, SplitLines, Parallax,
                     PinnedStory, HorizontalScroll, MagneticButton, GrainCanvas
  sections/          Hero, Manifest, SoilToTable, FarmStory, ProductWorld,
                     CropRotation, Geschichte, Lage, FarmShop, Team, BioCerts
  shop/              Sortiment, ArtikelKarte, Artikelbild, Mengenwahl,
                     Warenkorbleiste, WarenkorbSchublade
  ui/                Eyebrow, Button, FieldLine, MediaFrame, PageHeader
lib/                 gsap.ts (eine Registrierung), motion.ts (Tokens),
                     split.ts, warenkorb.tsx (Warenkorb als Kontext)
data/                farm, products, shop, crops, geschichte, certifications,
                     team, stations
public/video/        Hero in drei Stufen, Poster
tools/upscale.sh     die Video-Kette bis zum Zwischenmaster
tools/video-neu.sh   Auslieferungsstufen aus dem Master, mit Randschnitt
tools/demo-bundle.mjs   die Einzeldatei-Demo
tools/typo-audit.mjs    Satzprüfung
tools/loader-notfall.mjs  Ausfallszenarien
```

### Motion System

Alle Dauern, Kurven und Staffelungen stehen in `lib/motion.ts`. Keine Sektion
definiert eigene Werte, sonst laufen sie auseinander.

| | |
| --- | --- |
| Reveal | 1,05 s, `expo.out` |
| Deckkraft | 0,9 s, `power2.out` |
| Zeilenstaffel | 0,09 s |
| Bild Reveal | Scale 1,08 → 1,0 plus Clip |
| Parallax | maximal zwölf Prozent Versatz |
| Seitenwechsel | 0,55 s |

### Der eine WebGL Moment

`components/motion/GrainCanvas.tsx` legt eine bewegte Kornschicht mit Vignette
über den Hero. Sie driftet dem Zeiger nach und wird beim Scrollen dichter.
Handgeschriebener Fragment Shader auf zwei Dreiecken, keine Bibliothek, läuft
nur solange der Hero sichtbar ist, und bei reduzierter Bewegung gar nicht.

### Die Furche

`components/ui/FieldLine.tsx` ist der wiederkehrende Merker: haardünn, leicht
unruhig gezeichnet. Sie erscheint im Loader, trennt Abschnitte und zeigt in der
Story den Fortschritt.

---

## Formatregeln, gegen die jede Sektion geprüft wurde

- **Keine dekorativen Ziffern.** Die Stationen der Story tragen Wortmarken
  (Boden, Saat, Wachstum …), die Fruchtfolge kommt ohne Prozentwerte aus. Das
  Gründungsjahr steht ausschließlich als Fließtext im Footer, im Impressum und
  in den strukturierten Daten.
- **Keine Trennstriche als Gestaltungselement.** Mehrteilige Utility Zeilen
  trennt `Eyebrow` über eine haardünne senkrechte Linie und Abstand.
- **Keine mitten im Wort gebrochenen Wortmarken.** `.no-break` plus ein
  Schriftgrad, der auf schmalen Geräten mitskaliert.
- **Zeilenmasken mit Polster.** Ohne das schnitt die Maske bei engem Durchschuss
  die Umlautpunkte ab, aus „STÜCK“ wurde „STUCK“.
- **Echte deutsche Anführungszeichen** im gesamten sichtbaren Text.

### Navigation

Eine Quelle für alles: `data/navigation.ts`. Kopfzeile, App-Leiste,
Umschalter, Menü und Fußzeile greifen dort zu.

| | Inhalt |
| --- | --- |
| **Kopfzeile** (ab 1024 px) | Wortmarke, die Hauptbereiche, Schalter fürs Menü |
| **App-Leiste** (unter 1024 px) | Wortmarke als Umschalter, daneben die Reiter |
| **Umschalter** | alle Hauptbereiche, der aktuelle markiert |
| **Menü** | Team, Kontakt, Referenzen, Instagram, Onlineshop, Rechtliches |

Die Wortmarke ist eine Rastergrafik mit Brot und Ähren, kein Schriftzug, den
man nachsetzen könnte. Unter etwa 130 px zerfällt sie — deshalb bekommt sie
in der App-Leiste festen Platz, statt auf Icongröße gequetscht zu werden.
Ein sauber freigestelltes Bildzeichen lässt sich daraus nicht gewinnen, weil
Brot und Schrift einander überlappen.

Im Hero steht sie groß über dem Video: das Bild läuft dahinter weiter, das
Logo trägt den Namen. Eine gesetzte Schriftzeile steht dort nicht mehr, sie
wäre eine Dopplung. Für Vorlesewerkzeuge bleibt der Name als `sr-only`-Text
in der `h1`.

Das **Bioland-Zeichen** liegt als Bildmarke bei (`public/logo/bioland.webp`)
und steht in der Siegelzeile des Heros sowie im Abschnitt „Bio verstehen".
EU Bio und GlobalGAP bleiben Text — dafür liegt keine Bilddatei vor, und ein
nachgebautes Siegel wäre falsch.

Auf dem Telefon zeigt die Kopfzeile **kein** Logo: die App-Leiste trägt es
dort dauerhaft, zweimal wäre es zu viel. Aus demselben Grund hat das Menü
keine eigene Wortmarke.

Die Reiter-Reihe schiebt den aktiven Eintrag ins Bild. Gemessen wird dafür
über `getBoundingClientRect`, nicht über `offsetLeft`: dessen Bezugspunkt
ist der nächste positionierte Vorfahr, also die fixierte Leiste samt Logo —
damit scrollte die Reihe um die Logobreite zu weit.

### Der Loader darf die Seite nie einsperren

Der Ladevorhang wird vom Server mitgeliefert, damit der Einstieg nicht
flackert. Damit hing die ganze Seite aber daran, dass JavaScript ihn auch
wieder wegnimmt — blieb das aus, sah man nur den Schriftzug auf schwarzer
Fläche und kam nicht weiter. Drei Ebenen sichern das jetzt ab:

- **CSS-Notbremse** in `globals.css`: eine Animation blendet `#loader` nach
  gut drei Sekunden aus, ganz ohne JavaScript. Übernimmt das Skript, setzt
  es `js-aktiv` und schaltet sie ab.
- **`noscript`-Regel** im Layout: sind Skripte abgeschaltet, ist der Vorhang
  von vornherein weg statt nach drei Sekunden.
- **Zeitwächter** innerhalb der Komponente, falls eine Teilanimation klemmt.

Kam die Hydration so spät, dass die Notbremse schon gegriffen hat, blendet
die Komponente nicht nachträglich wieder ein.

Geprüft wird das gegen fünf Fälle: Normalbetrieb, JavaScript abgeschaltet,
alle Skriptbündel blockiert, einzelner Baustein blockiert, Fehler während
der Hydration. In allen fünf ist die Seite lesbar.

### Satzprüfung

`tools/typo-audit.mjs` fährt jede Seite in sechs Breiten von 320 px bis
1920 px ab und misst pro Textelement die tatsächliche Glyphenausdehnung gegen
jede Maskenkante. Damit fallen abgeschnittene Umlautpunkte, gekappte
Unterlängen, seitlich beschnittene Wortmarken und Elemente auf, die nie
sichtbar werden.

```bash
npm run build && npm start
BASE=http://localhost:3000 node tools/typo-audit.mjs
```

Wichtig ist der doppelte Durchgang: Der erste löst die Reveals nur aus, der
zweite misst. Wer während der Fahrt misst, sieht die Zeile noch unter ihrer
Maske und bekommt lauter Fehlalarme.

Jede neue Maske nimmt `.mask-line` und lässt ihren Inhalt aus mindestens
140 Prozent Versatz einfahren. Bei weniger lugt er unten aus dem Polster.

---

## Was noch fehlt

### Fotos

Es liegt bisher nur das Hero Video vor. Überall sonst zeigt `MediaFrame` einen
beschrifteten Platzhalter mit dem vorgesehenen Motiv. Die Animationen sind
vollständig implementiert — sobald eine Datei unter dem erwarteten Pfad liegt,
greift sie ohne weitere Änderung. Erwartete Pfade stehen in `data/products.ts`,
`data/stations.ts` und den jeweiligen Seiten.

### Inhalte, die nicht belegt sind

`team-kornkammer.de` und `ruhrtalgold.de` waren aus der Bauumgebung nicht
erreichbar (Egress gesperrt). Übernommen wurden nur öffentlich indexierte
Angaben. Erfunden wurde nichts. Offen und im Layout sichtbar markiert:

- **Team.** Stefan Pawliczek und Dirk Liedmann sind mit Namen und Foto
  eingesetzt. Offen bleiben ihre **Funktionen** im Betrieb und die übrigen
  Mitglieder — die Seite schreibt „Funktion folgt", statt eine Rolle zu
  erfinden. Die Fotos sind aus Bildschirmfotos der Bestandsseite
  freigestellt (760 × 760); für Karten reicht das, groß gezogen sieht man
  die Herkunft. Originale einfach unter `public/images/team/` austauschen.
- **Referenzen.** `data/referenzen.ts` ist absichtlich leer. Belegt ist nur
  die allgemeine Aussage, dass Bäckereien in der Region beliefert werden —
  welche, steht nirgends öffentlich. Fremde Firmennamen zu erfinden wäre hier
  besonders heikel, deshalb sagt die Seite offen, dass die Liste fehlt. Sobald
  Einträge in der Datei stehen, schaltet sie von selbst auf die Liste um.
- **Öffnungszeiten.** Die Quellen waren uneinheitlich (Freitag 8 bis 17 Uhr
  gegen 8 bis 18 Uhr). Hinterlegt ist die erste Variante mit
  `unbestaetigt: true`, sichtbar als „Zeiten bitte bestätigen".
- **Impressum und Datenschutz.** Registernummer, Umsatzsteuer
  Identifikationsnummer, Aufsichtsbehörde, Hoster und Vertretungsberechtigte
  stehen als `bitte ergänzen`. Beide Texte gehören vor dem Start anwaltlich
  geprüft. Sie sind derzeit auf `noindex`.

Belegt und eingesetzt: Anschrift, Telefon, E-Mail, Bioland Zugehörigkeit,
Gründungsjahr, Produktbereiche, Kulturen der Fruchtfolge.

---

## Der Shop

`/shop`. Sortiment mit Filter, Warenkorb, Schublade, Bestellmail.

### Wo die Zahlen hingehören

Alles Inhaltliche steht in **`data/shop.ts`**. Eine Datei, ein Array, keine
Datenbank. Pro Artikel gibt es `varianten` — das sind die Gebindegrößen:

```ts
{
  slug: 'mehl',
  name: 'Mehl aus eigener Vermahlung',
  gruppe: 'Getreide und Mehle',
  kurz: 'Weizen und Dinkel vom eigenen Schlag.',
  bild: '/images/…',
  bildAlt: '…',
  varianten: [
    { id: 'mehl-1', gebinde: '1 kg', preisCent: 320, menge: 1, grundmenge: 'kg' },
    { id: 'mehl-5', gebinde: '5 kg', preisCent: 1450, menge: 5, grundmenge: 'kg' },
  ],
}
```

- `preisCent` ist **immer** eine ganze Zahl in Cent. Nie `3.20` — in
  JavaScript ergibt `0.1 + 0.2` nicht `0.3`, und bei einer Rechnung über
  zwanzig Posten sieht man das.
- `menge` und `grundmenge` erzeugen den **Grundpreis** („4,50 € je
  Kilogramm“). Der ist bei Lebensmitteln nach der Preisangabenverordnung
  Pflicht, sobald ein Preis dasteht.
- Ab zwei Varianten erscheint automatisch die Gebindeauswahl auf der Karte.
- Die `id` einer Variante ist der Schlüssel im gespeicherten Warenkorb. Wer
  sie umbenennt, wirft alte Körbe weg — das ist verkraftbar, aber man sollte
  es wissen.

### Warum überall „Preis auf Anfrage“ steht

Der bestehende Onlineshop war aus der Bauumgebung nicht erreichbar, der
Egress-Filter blockt `shopteamkornkammer.company.site`. Preise und
Gebindegrößen liegen deshalb nicht vor und wurden **nicht geschätzt**. Ein
erfundener Preis auf einer Verkaufsseite ist keine Kleinigkeit.

Solange `preisCent` auf `null` steht, verhält sich der Shop so:

- Der Knopf heißt „Auf die Anfrageliste“ statt „In den Warenkorb“.
- Die Karte zeigt „Preis auf Anfrage“ statt einer Zahl.
- Die Summe in der Schublade weist sich selbst als unvollständig aus.
- Über dem Sortiment steht ein Hinweis, dass die Preise nachgetragen werden.

Sobald **ein** Preis eingetragen ist, verschwindet der Hinweis über dem
Sortiment von selbst (`PREISE_GEPFLEGT` in `data/shop.ts`), und die
betroffenen Artikel schalten auf Warenkorb um. Es ist nichts zu
programmieren.

### Was der Warenkorb ist und was nicht

`lib/warenkorb.tsx` hält die Positionen als React Kontext und legt sie unter
`kornkammer.warenkorb.v1` im `localStorage` ab. Der Korb überlebt einen
Seitenwechsel und das Schließen des Browsers. Beim Einlesen werden Kennungen
verworfen, die es im Sortiment nicht mehr gibt.

Gerechnet wird in Cent. Der gespeicherte Stand kommt erst **nach** dem
Einhängen dazu, nicht schon beim ersten Rendern — sonst weicht der Client vom
Server ab, React verwirft den Teilbaum, und auf dieser Seite ist genau daran
schon einmal das Hero Video gestorben.

**Kein Bezahlvorgang.** Der Korb wird am Ende zu einer vorformulierten
Bestellmail an den Hof: Menge, Artikel, Gebinde, Summe, Abholtermin. Sie
öffnet sich im Mailprogramm des Besuchers und wird von ihm abgeschickt — es
geht nichts an uns, solange er das nicht tut. Ein echter Zahlungsweg braucht
Widerrufsbelehrung, AGB, Zahlungsdienstleister und eine Steuerentscheidung;
das kann eine Oberfläche nicht vortäuschen. Wer Versand will, geht über den
bestehenden Onlineshop, der Knopf dafür steht daneben.

### Bedienung

- Die Leiste unten erscheint erst, wenn etwas im Korb liegt, und sitzt über
  der App Leiste des Telefons (`--leiste` plus `safe-area-inset-bottom`).
- Bei jedem Hinzufügen macht sie einen kurzen Satz nach oben. Das ist die
  Rückmeldung, die sonst fehlt, wenn der Knopf weit oben auf der Seite liegt.
- Die Schublade fährt auf dem Telefon von unten ein, ab Tablet von rechts.
  Escape schließt, der Fokus wandert beim Öffnen hinein und bleibt darin.
  Geschlossen steht sie auf `visibility: hidden` und ist damit weder
  antippbar noch vorlesbar.

---

## Die Karte

`components/sections/Lage.tsx` zeigt einen **statischen** Kartenausschnitt aus
OpenStreetMap und verlinkt auf Klick die Route bei Google Maps.

Bewusst keine Einbettung: ein eingebetteter Kartendienst lädt beim
Seitenaufruf Kacheln von einem Dritten und übermittelt dabei die IP jedes
Besuchers, ohne dass jemand darum gebeten hätte. Bei einer deutschen
Firmenseite ist das die Stelle, an der es teuer wird — dieselbe Erwägung wie
bei den Schriften. So entscheidet der Besucher selbst, wann er zu Google geht.

Die Namensnennung „Kartendaten © OpenStreetMap Mitwirkende“ steht sichtbar
unter der Karte. Das verlangt die Lizenz (ODbL). Wird der Ausschnitt
ausgetauscht, muss sie bleiben.

Das Ziel des Routenknopfs kommt aus `ROUTE_URL` in `data/farm.ts` und wird
aus der Anschrift gebildet. Sobald Koordinaten belegt sind, gehören sie
dorthin — dann trifft die Route den Hofeingang statt die Straße.

---

## Technik im Detail

- **Schriften** kommen über `next/font` und werden vom eigenen Server
  ausgeliefert. Kein Aufruf an fonts.googleapis.com zur Laufzeit — bei einer
  deutschen Firmenseite ginge sonst die IP jedes Besuchers ohne Einwilligung an
  einen Dritten.
- **GSAP** wird in `lib/gsap.ts` genau einmal registriert.
- **Lenis** treibt das Scrollen, GSAP hängt daran. Die Reihenfolge in
  `SmoothScroll.tsx` ist wichtig: läuft beides getrennt, hängen gepinnte
  Abschnitte ein Frame hinterher.
- **SplitLines** misst die Zeilenumbrüche echt und baut nach einem
  Breakpoint Wechsel neu auf, statt sie zu raten.
- **Horizontaler Lauf** nur in der Produktwelt. Unterhalb von 1024 px und bei
  reduzierter Bewegung wird daraus ein normaler Streifen zum Wischen.
- **SEO.** Pro Seite Titel, Beschreibung, Canonical und OpenGraph, dazu
  `sitemap.xml`, `robots.txt` und Schema.org für Organization, LocalBusiness
  und Product. Ohne erfundene Bewertungen.

---

## Deploy

Statisch vorgerendert. Vercel oder jeder Node Host. Die Videos liegen unter
`public/video/` und werden über `Cache-Control: immutable` ausgeliefert,
siehe `next.config.mjs`.

### Netlify

```bash
npm run netlify
```

Ergebnis ist **`kornkammer-netlify.zip`** im Projektordner. Auf
[app.netlify.com/drop](https://app.netlify.com/drop) ziehen, fertig — kein
Build auf Netlify nötig, keine Funktionen, kein Next Runtime Plugin.

Wer stattdessen aus dem Repository bauen lassen will: `netlify.toml` liegt
bei und setzt Befehl (`DEMO_EXPORT=1 npm run build`), Verzeichnis (`out`) und
die Cache-Kopfzeilen für Video und Static Chunks.

Zwei Dinge zum Wissen:

- Der Export läuft mit `DEMO_EXPORT=1`. Das schaltet `output: 'export'` und
  `images.unoptimized` — auf einem reinen Statik-Host gibt es keinen
  Bildoptimierer, der zur Laufzeit skalieren könnte.
- Kopfzeilen aus `next.config.mjs` greifen im Export nicht, weil kein Node
  Server ausliefert. Deshalb stehen sie zusätzlich in `netlify.toml`.
