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

Die Übersichtsseite verwendet ausschließlich vorhandene Bausteine
(`.subhero`, `.svc-grid`, `.cta`); es gibt dafür keine eigene Gestaltung.
Der Brotkrumenpfad hat dadurch drei Ebenen: `Home / Dienstleistungen /
Sicherheit`.

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
