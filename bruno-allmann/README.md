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
index.html              Startseite (Hero, Zahlenband, Leistungen, Betrieb, 100 Jahre, Kontakt)
impressum.html          Pflichtangaben
datenschutz.html        Datenschutzerklärung
assets/css/styles.css   einzige Design-Quelle, Tokens ganz oben
assets/css/fonts.css    @font-face für die lokalen Schriften (Outfit, Figtree, DM Mono)
assets/js/main.js       Menü, Hero-Eintritt, Scroll-Eintritte, Ablauf-Schalter, Kopieren, Formular
assets/img/             Fotos, je einmal als .jpg und .webp
assets/fonts/           Schriftdateien (woff2, Subsets latin + latin-ext)
```

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
der Leistungen, der Ablauf „So arbeiten wir", die Beispielstadtteile im
Leistungs-Vorspann, „Drei Generationen".

## Vor dem Live-Gang

1. Impressum: USt-IdNr., Innung, Bildnachweis ergänzen (`bitte ergänzen`).
2. Datenschutz: Hoster und Löschfristen ergänzen, anwaltlich prüfen lassen.
3. `<meta name="robots" content="noindex, nofollow">` aus allen drei Seiten entfernen.
4. Hero-Foto in höherer Auflösung ersetzen (Quelle liegt in 928×928 px vor und
   wird auf Desktop hochskaliert). Alle Ausschnitte in `assets/img/` stammen aus
   diesem einen Motiv. Beim Austausch `.jpg` und `.webp` neu erzeugen.
5. Formular: aktuell öffnet es das Mailprogramm des Besuchers (`data-empfaenger`).
   Für Netlify Forms `data-netlify="true"` und `name="anfrage"` am `<form>` setzen.
