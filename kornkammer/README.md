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

Was darin anders ist als in der echten Seite:

- Es ist **nur die Startseite**. Ein Klick auf einen Menüpunkt navigiert
  nicht, sondern blendet kurz einen Hinweis ein.
- Das Video liegt in der kleinsten Stufe bei (590 × 1280, WebM), damit die
  Datei versendbar bleibt. Die 4K-Fassung steckt in `public/video/`.
- Wo noch kein Foto vorliegt, greift derselbe beschriftete Platzhalter wie
  im Projekt.
- Die Browserkonsole meldet ein paar fehlgeschlagene Abrufe. Das ist der
  Router von Next, der die Daten der Unterseiten vorholen will — die gibt es
  in der einen Datei nicht. Sichtbar ist davon nichts.

Gebaut wird sie von `tools/demo-bundle.mjs` aus dem statischen Export.

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
```

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
                     CropRotation, FarmShop, Team, BioCerts
  ui/                Eyebrow, Button, FieldLine, MediaFrame, PageHeader
lib/                 gsap.ts (eine Registrierung), motion.ts (Tokens), split.ts
data/                farm, products, crops, certifications, team, stations
public/video/        Hero in drei Stufen, Poster
tools/upscale.sh     die Video-Kette
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

- **Team.** Namen, Funktionen und Fotos fehlen. `data/team.ts` enthält Rollen
  ohne Namen, jeder Eintrag trägt `platzhalter: true`. Die Seite weist das aus.
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

Statisch vorgerendert, alle einundzwanzig Routen. Vercel oder jeder Node Host.
Die Videos liegen unter `public/video/` und werden über
`Cache-Control: immutable` ausgeliefert, siehe `next.config.mjs`.
