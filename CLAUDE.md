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
index.html                     Startseite (Hero + cinematischer Scroll-Zoom je Bereich)
kontakt.html                   Kontakt + Anfrageformular
galerie.html                   Galerie (Platzhalter-Kacheln -> echte Fotos)
jobs.html                      Jobs/Karriere
dienstleistungen/*.html        Detailseite je Bereich (echte Texte)
assets/css/styles.css          EINZIGE Stylesheet-Quelle (Design-Tokens oben)
assets/js/main.js              Alle Interaktionen (Scroll-Zoom, Nav, Formeln)
assets/logo/                   -> echtes Logo hier ablegen
assets/img/                    -> Fotos
assets/video/                  -> Videos für die Bereichs-Szenen
```

## Design-Tokens (nicht raten — immer diese verwenden)
Definiert in `assets/css/styles.css` unter `:root`.
- Canvas: `--ink #0B0713`, Panels `--ink-2 #130A22`
- Marke (das „lila"): `--violet #7C3AED`, hell `--orchid #B57BFF`, Leucht `--glow #E4B0FF`
- Text: `--paper #F4F0FB`, sekundär `--chrome #C9C6DA`, gedämpft `--muted #8E86A6`
- Akzent je Bereich (`--accent`): Gastro `#F0B454`, Sicherheit `#6EA8FF`,
  Promotion `#FF6EC7`, Logistik `#FF9E5E`, Fahrservice `#6FE0FF`, Reinigung `#6FF0C4`
- Schriften: Display = Bricolage Grotesque, Body = Instrument Sans, Utility/Mono = Space Mono

## Der Signature-Effekt (bitte nicht kaputt machen)
Auf der Startseite ist jede Dienstleistung eine „Bühne" (`.stage`, ~230vh hoch) mit
einem `sticky` Viewport. Beim Scrollen zoomt die Szene rein, die Detail-Ebene blendet
auf, dann fährt die Info-Karte ein. Fahrservice hat zusätzlich eine sich öffnende Tür.

Gesteuert wird das in `main.js` (`updateStages()`), das pro Bühne den Fortschritt `p`
(0→1) berechnet und CSS-Variablen setzt:
- `--zoom`   Skalierung der Szene
- `--detail` Einblenden der Detail-/Innen-Ebene
- `--panel`  Einblenden der Text-Karte
- `--door`   nur Fahrservice: Türöffnung

**Echte Medien einbauen:** die SVG-Szenen (`.scene`, `.detail`) durch `<img>`/`<video>`
ersetzen, aber die Klassen `.scene` / `.detail` / `.door` und die CSS-Variablen behalten —
dann bleibt die Mechanik erhalten. Videos: `muted playsinline loop`, poster setzen.

Der „Top"-Button (`#toTop`) springt **sofort** nach oben (kein Smooth-Scroll), damit die
Effekte beim Hochscrollen nicht rückwärts abgespielt werden. Bitte so lassen.

## Konventionen
- Nur **eine** Stylesheet-Datei (`assets/css/styles.css`) und **eine** JS-Datei. Nicht pro
  Seite neues CSS inline schreiben — Tokens/Klassen wiederverwenden.
- Relative Pfade: Unterseiten in `dienstleistungen/` verlinken mit `../`.
- `prefers-reduced-motion` respektieren (ist in styles.css schon gelöst).
- Sichtbarer Fokus, Tastaturbedienung, Mobile-First bleiben Pflicht.

## Tonalität (Copy)
Hamburgerisch-warm, aber professionell. Sie-Form. „Moin" ist erlaubt. Konkret statt
werblich. Bestehende Formulierungen von hermserviceteam.com sind die Referenz.

## Offene Aufgaben (Backlog, grob priorisiert)
1. Echtes Logo aus `assets/logo/` in `.brand` (Kopf + Footer) einsetzen; Favicon erzeugen.
2. SVG-Szenen durch echte Fotos/Videos ersetzen (Mechanik behalten, s. o.).
3. Kontaktformular an einen echten Dienst anbinden (Formspree/Netlify Forms/Backend).
   Aktuell ist nur ein `mailto:`-Fallback gesetzt.
4. Galerie mit echten Bildern + Lightbox; Jobs-Seite mit echten Stellen/FAQ/Bewerbung.
5. Rechtstexte (Impressum, Datenschutz) als eigene Seiten übernehmen (verlinken aktuell
   noch auf die Bestandsseite).
6. SEO/OG: Meta-Description, Open-Graph-Bild, sitemap.xml, robots.txt.
7. Deploy (Netlify/Vercel) und Domain hermserviceteam.com per DNS verbinden.

## Preview & Deploy
- Lokale Vorschau: `npx serve` oder `python3 -m http.server` im Projektordner starten.
- Alternativ index.html direkt im Browser öffnen (Assets laden per file:// mit).
- Deploy: Netlify/Vercel — statisches Verzeichnis, kein Build-Step nötig.
