# Bruno Allmann Heizungsbau — Website-Relaunch

Statische Website (HTML/CSS/JS, kein Framework, kein Build-Schritt) für
**Bruno Allmann Heizungsbau, Inh. Thomas Hassert e.K.**, Erdkampsweg 51,
22335 Hamburg-Fuhlsbüttel. Stand: **Testfassung**, gegen Suchmaschinen gesperrt.

## Vorschau

```bash
cd bruno-allmann && python3 -m http.server 8000   # → http://localhost:8000
```

## Aufbau

```
index.html              Startseite: Hero, Zahlenband, „Wer ist Allmann", „Was wir machen", Ablauf, Aufruf
leistungen.html         Was macht Allmann: sechs Leistungsbereiche im Detail (Für wen / Was Sie bekommen)
ueber-uns.html          Wer ist Allmann: Betrieb, drei Zusagen, 100 Jahre, Ablauf
kontakt.html            Kontaktdaten, Bürozeiten, Anfrageformular
impressum.html          Pflichtangaben
datenschutz.html        Datenschutzerklärung
assets/css/styles.css   einzige Design-Quelle, Tokens ganz oben
assets/css/fonts.css    @font-face für die lokalen Schriften (Outfit, Figtree, DM Mono)
assets/js/main.js       Menü, Hero-Eintritt, Reveals, gestaffelte Karten, Zähler, Parallax, Ablauf, Kopieren, Formular
assets/img/             Fotos, je einmal als .jpg und .webp
assets/fonts/           Schriftdateien (woff2, Subsets latin + latin-ext)
```

## Effekte (alle mit Anlass, nichts läuft dauerhaft)

| Effekt | Wo | Wie |
|---|---|---|
| Reveal beim Scrollen | `.reveal`, Varianten `--left`, `--right`, `--scale`, `data-delay="1…5"` | IntersectionObserver setzt `is-in` |
| Karten nacheinander | Container mit `data-stagger` (Bento, Zusagen, Jahreszahlen, Punkte) | Kinder bekommen `--i`, CSS staffelt die Verzögerung |
| Zahl zählt hoch | `data-count="1918" data-count-from="1880" data-count-dur="2200"` | zählt, sobald 30 % sichtbar sind; ausbremsende Kurve |
| Parallax | `data-parallax="-0.18"` auf Fotos, `0.1` auf Text | Verschiebung relativ zur Bildschirmmitte, nur im sichtbaren Bereich. Negativ = Hintergrund läuft nach, positiv = Text läuft voraus, dadurch bewegen sich Bild und Text zeitversetzt |
| Bild und Text zeitversetzt | Leistungsblöcke, Vorstellung | Bild `reveal--left/right` ohne Verzögerung, Text mit `data-delay="2…5"` |

Kopf, Menü und Fuß sind auf allen Seiten identisch. Wer eine Seite anlegt,
kopiert sie aus einer bestehenden.

## Quellen der Inhalte

Die bestehende Website war aus der Entwicklungsumgebung nicht erreichbar; die
Angaben stammen aus Suchmaschinen-Treffern zur Website selbst (Seitentitel
„Heizungstechnik seit über 100 Jahren", Seite „100 Jahre", Impressum) und aus
Branchenverzeichnissen (Gelbe Seiten, Das Örtliche, SHK.de, hamburg.de, EGHH).

Belegt: Firmierung, Adresse, Telefon 040 59 67 35, E-Mail
Bruno.Allmann-Heizungsbau@t-online.de, HRA 65878 Hamburg, Gründung 1918,
Jubiläum am 18.12.2018, Öffnungszeiten Mo–Do 7:30–17:00 / Fr 7:30–14:00
(SHK.de nennt für Freitag 17:00 — bitte prüfen), Leistungen Gas-/Ölheizung,
Wärmepumpe, Solar, Photovoltaik, Wartung, Reparatur, Sanierung, Neubau,
Heizungs- und Lüftungsanlagen, Meisterbetrieb.

Formuliert, nicht belegt (bitte vom Betrieb freigeben): die Beschreibungen
der Leistungen samt „Für wen / Was Sie bekommen", der Ablauf „So arbeiten
wir", die drei Zusagen auf der Über-uns-Seite, „eigene Monteure".

## Vor dem Live-Gang

1. Impressum: USt-IdNr., Innung, Bildnachweis ergänzen (`bitte ergänzen`).
2. Datenschutz: Hoster und Löschfristen ergänzen, anwaltlich prüfen lassen.
3. `<meta name="robots" content="noindex, nofollow">` aus allen drei Seiten entfernen.
4. Hero-Foto in höherer Auflösung ersetzen (Quelle liegt in 808×928 px vor,
   rechter Rand mit Bedienknöpfen der Vorlage wurde abgeschnitten, und wird auf
   Desktop hochskaliert). Alle Ausschnitte in `assets/img/` stammen aus diesem
   einen Motiv. Beim Austausch `.jpg` und `.webp` neu erzeugen.
5. Formular (`kontakt.html`): aktuell öffnet es das Mailprogramm des Besuchers (`data-empfaenger`).
   Für Netlify Forms `data-netlify="true"` und `name="anfrage"` am `<form>` setzen.
