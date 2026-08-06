# HERM Service Team — Website Relaunch 2026

Projektregeln für Claude Code. Bitte vor jeder Änderung lesen.

## Was das ist
Neuer, moderner Webauftritt für die **HERM Service Team e.K.** — Personaldienstleistung
aus Hamburg (Sicherheit, Gastro-Personal, Promotion/Hostess, Logistik, Fahrservice,
Reinigung). Inhalte & Tonalität stammen von der Bestandsseite hermserviceteam.com,
sollen aber deutlich moderner umgesetzt werden. Kein Framework, reines HTML/CSS/JS,
damit es überall läuft und einfach zu hosten ist.

## Projektstruktur
```
index.html                     Startseite (Hero, Vertrauensleiste, Bühnen, Ablauf, Referenzen)
kontakt.html                   Kontakt + Anfrageformular
galerie.html                   Galerie aus echten Fotos, mit Lightbox
jobs.html                      Jobs/Karriere mit Stellen und FAQ
team.html                      Büroteam
dienstleistungen/*.html        Detailseite je Bereich (eigener Inhalt je Seite)
assets/css/styles.css          EINZIGE Stylesheet-Quelle für das Design (Tokens oben)
assets/css/fonts.css           @font-face für die lokal ausgelieferten Schriften
assets/fonts/                  Schriftdateien (woff2)
assets/js/main.js              Alle Interaktionen (Bühnen, Nav, Film, Lightbox, Formular)
assets/logo/                   Logo und Favicons
assets/img/                    Fotos
assets/video/                  Imagefilm und Bereichs-Clips
```

## Design-Grundsätze
Die Seite soll wie von einer Agentur gebaut aussehen, nicht wie aus einem Baukasten.
Konkret heißt das:

- **Farbe kommt aus den Fotos, nicht aus dem Layout.** Die Fläche ist schwarzweiß.
  Keine Farbverläufe als Dekoration, keine farbigen Leuchtkreise, keine Glaseffekte.
  Die früheren Akzentfarben je Bereich sind bewusst entfallen — sie waren auf den
  Unterseiten gesetzt und auf der Startseite nicht, was die Seiten auseinanderlaufen ließ.
- **Bewegung hat einen Anlass.** Eintritte beim Scrollen, die Bühnen-Kamerafahrt, ein
  Hover. Keine dauerhaft laufenden Animationen (kein Laufband, keine Endlos-Karussells,
  nichts, was ohne Zutun pulsiert).
- **Weißraum statt Rahmen.** Abschnitte trennt Abstand oder eine 1-px-Linie, nicht ein
  weiterer Kasten mit Radius.

## Design-Tokens (nicht raten — immer diese verwenden)
Definiert in `assets/css/styles.css` unter `:root`.
- Fläche: `--ink #08080A`, abgesetzt `--ink-2 #121216`, Kante `--ink-3 #1A1A20`
- Text: `--paper #F6F6F8`, sekundär `--chrome #C7C7CD`, gedämpft `--muted #8B8B93`
- Linien: `--line rgba(255,255,255,.13)`
- `--violet`/`--orchid`/`--glow` stehen noch als Markenwerte im `:root`, werden im
  Layout aber **nicht** eingesetzt. Das Lila trägt nur noch Logo und Neon-H im Foto.
- Abstände: `--sec` / `--sec-end` zwischen Abschnitten, `--gap-xs/-s/-m/-l` innerhalb
- Lesebreiten: `--measure` (Fließtext), `--measure-lead` (Vorspann)
- Schriftgrade: `--fs-display`, `--fs-h2`, `--fs-h3`, `--fs-h4`, `--fs-lead`
- Radien: `--r-s 10px`, `--r-m 16px`, `--r-pill`
- Kurven: `--ease-out` (Eintritt), `--ease-swift` (Bedienelemente), `--ease-soft` (Raum)

### Typografie
- Display = Bricolage Grotesque, Body = Instrument Sans, Utility = Space Mono.
- **Versal ist eine Auszeichnung, kein Grundzustand.** Uppercase gibt es über die
  Klasse `.u-caps` — für Seitentitel und kurze Abschnittsüberschriften. Ganze Sätze
  bleiben gemischt gesetzt, sonst werden sie zu Etiketten.
- **Space Mono nur für Zahlen und kurze Labels**: `.eyebrow`, `.stage__index`,
  Brotkrumen, Bildunterschriften, Formularlabels, Fußzeilen-Überschriften.
  Knöpfe, Chips, Navigation und Fließtext stehen in der Grundschrift — versale
  Schreibmaschinenschrift auf Knöpfen ist das deutlichste Merkmal fertiger Templates.

### Schriften liegen lokal
`assets/fonts/` + `assets/css/fonts.css`. **Nicht** wieder auf fonts.googleapis.com
umstellen: bei einer deutschen Firmenseite geht damit die IP jedes Besuchers ohne
Einwilligung an einen Dritten (LG München I, Az. 3 O 17493/20). Aktualisieren:
CSS von Google holen, die woff2 der Subsets `latin` und `latin-ext` herunterladen,
Pfade in `fonts.css` eintragen. Bricolage und Instrument Sans sind variable Schriften —
eine Datei trägt alle Schnitte, deshalb sind die Dateien entdoppelt.

## Der Signature-Effekt (bitte nicht kaputt machen)
Auf der Startseite ist jede Dienstleistung eine „Bühne" (`.stage`, ~190vh hoch) mit
einem `sticky` Viewport. Beim Scrollen zoomt die Szene rein, die Detail-Ebene blendet
auf, dann fährt der Text ein. Logistik hat zusätzlich ein sich öffnendes Tor.

Gesteuert wird das in `main.js` (`updateStages()`), das pro Bühne den Fortschritt `p`
(0→1) berechnet und CSS-Variablen setzt:
- `--zoom`   Skalierung der Szene
- `--detail` Einblenden der Detail-/Nah-Ebene
- `--panel`  Einblenden des Textblocks
- `--door`   Torflügel (Logistik) bzw. Laufzeit eines gescrubbten Clips

**Bewegtes Material einbauen:** je Ebene liegt ein `<video class="stagevid">` bereit.
`poster` und `data-src` setzen — dann übernimmt der Clip die Ebene, sobald er geladen
ist. Klassen `.scene` / `.detail` / `.gate` / `.stagevid` und die Variablen behalten.
Videos immer `muted playsinline loop`. Die früheren gezeichneten SVG-Szenen sind
entfallen; jede Ebene zeigt jetzt ein echtes Foto (`.scene__photo`).

Der „Top"-Button (`#toTop`) springt **sofort** nach oben (kein Smooth-Scroll), damit die
Effekte beim Hochscrollen nicht rückwärts abgespielt werden. Bitte so lassen.

## Konventionen
- Nur **eine** Design-Stylesheet-Datei (`assets/css/styles.css`) und **eine** JS-Datei.
  Nicht pro Seite neues CSS inline schreiben — Tokens/Klassen wiederverwenden.
- Relative Pfade: Unterseiten in `dienstleistungen/` verlinken mit `../`.
- `prefers-reduced-motion` respektieren (ist in styles.css gelöst).
- Sichtbarer Fokus, Tastaturbedienung, Mobile-First bleiben Pflicht.
- Kopfzeile, mobiles Menü und Fußzeile sind auf allen Seiten identisch. Wer eine
  Seite anlegt, kopiert sie aus einer bestehenden — sonst laufen sie auseinander
  (die Fußzeile hatte einmal Buchstaben statt Icons für die sozialen Netzwerke).

## Tonalität (Copy)
Hamburgerisch-warm, aber professionell. Sie-Form (auf der Jobs-Seite Du-Form, weil
dort Bewerber angesprochen werden). „Moin" ist erlaubt. Konkret statt werblich:
lieber „Der Dresscode wird vorher festgelegt und eingehalten" als „höchste Qualität".
Keine Zahlen ohne Aussage — „100 % Fokus auf Ihr Event" stand mal im Hero und ist
genau deshalb weg. Bestehende Formulierungen von hermserviceteam.com sind die Referenz.

## Was noch nicht stimmt / offene Aufgaben
1. **Fotos fehlen** für Maik Herm und Alexander Krapp — die Team-Seite zeigt dort
   Initialen-Platzhalter. Alle sechs Leistungsbereiche haben inzwischen eigene
   Aufnahmen. Reinigung kommt aus einem Motiv (Eingangsbereich, Arbeitsjacke mit
   Logo): `reinigung.jpg` (unbeschnitten, Ausschnitt kommt aus `object-position`),
   `reinigung-detail.jpg` (Jacke, Zoomziel der Bühne), `reinigung-boden.jpg`
   (Mopp, Bildband der Detailseite).
2. **Kontaktformular** an einen echten Dienst anbinden: `data-endpunkt="…"` am
   `<form data-anfrage>` in `kontakt.html` setzen (Formspree, Netlify Forms, eigenes
   Backend). Ohne Endpunkt baut `main.js` eine fertige Mail und öffnet das
   Mailprogramm — als Übergang, nicht als Dauerlösung.
3. **Imagefilm** ist ein Platzhalter aus vorhandenen Fotos und hat keine Tonspur.
   Sobald der echte Film vorliegt: Datei unter `assets/video/` ersetzen, `data-ohne-ton`
   am `<video>` entfernen (dann erscheint der Tonschalter), Zeiten in
   `imagefilm-de.vtt` nachziehen. Musik braucht eine Lizenz.
4. **Rechtstexte** (Impressum, Datenschutz) als eigene Seiten übernehmen — verlinken
   aktuell noch auf die Bestandsseite.
5. **Ansprechpartner prüfen:** Startseite und Kontaktseite nennen Shayan Wahedi als
   Ansprechpartner für Anfragen. Falls das jemand anderes sein soll, an beiden Stellen
   ändern (`.ansprech`).
6. **SEO/OG:** Open-Graph-Bild, sitemap.xml, robots.txt fehlen noch.
7. **Deploy** (Netlify/Vercel) und Domain hermserviceteam.com per DNS verbinden.

## Preview & Deploy
- Lokale Vorschau: `npx serve` oder `python3 -m http.server` im Projektordner starten.
- Alternativ index.html direkt im Browser öffnen (Assets laden per file:// mit).
- Deploy: Netlify/Vercel — statisches Verzeichnis, kein Build-Step nötig.
