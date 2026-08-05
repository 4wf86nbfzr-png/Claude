# HERM Service Team — Website (Relaunch 2026)

Statische Website (HTML/CSS/JS, kein Build). Startpaket zum Weiterbauen in Claude Code.

## Schnellstart in Claude Code
1. Diesen Ordner in Claude Code öffnen (Desktop-App: „Open project", oder im Terminal
   in den Ordner wechseln und `claude` starten).
2. Claude Code liest automatisch `CLAUDE.md` — dort stehen Farben, Struktur und Aufgaben.
3. Erste sinnvolle Prompts:
   - „Setze das echte Logo aus assets/logo/ in Kopf und Footer ein."
   - „Ersetze die SVG-Szene im Bereich Fahrservice durch assets/video/fahrservice.mp4,
      behalte die Zoom-Mechanik (.scene/.detail/.door)."
   - „Binde das Kontaktformular an Formspree an."
   - „Starte einen lokalen Server und zeig mir die Vorschau."

## Lokale Vorschau
```
npx serve            # oder:  python3 -m http.server 8080
```
Dann http://localhost:3000 (bzw. :8080) öffnen. index.html lässt sich auch direkt
per Doppelklick im Browser öffnen.

## Struktur
- `index.html` – Startseite mit cinematischem Scroll-Zoom je Bereich
- `dienstleistungen/` – Detailseite je Leistung (echte Texte)
- `kontakt.html`, `galerie.html`, `jobs.html`
- `assets/css/styles.css` – ein Stylesheet (Tokens oben), `assets/js/main.js` – alle Effekte
- `assets/logo|img|video/` – hier eure echten Medien ablegen

## Inhalte
Texte, Kundenstimmen und Kontaktdaten stammen von hermserviceteam.com und sind bewusst
1:1 übernommen. Logo und Fotos sind Platzhalter und sollen durch die Originale ersetzt werden.
