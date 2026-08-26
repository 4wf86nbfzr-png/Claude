# Design-System

## Haltung

Die App soll hochwertig und ernstzunehmend wirken – nicht wie ein
Krankenhausformular und nicht wie eine Kinder-App. Menschen mit
Unterstützungsbedarf bekommen sonst überall die vereinfachte, freundlich
gemeinte Variante. Hier nicht.

Konkret heißt das: tiefes Anthrazit-Blau als Träger, ein warmes Bernstein als
einziger Akzent, großzügige Weißräume, klare Typografie. Tiefe entsteht durch
Fläche und Abstand, nicht durch Schlagschatten.

## Tokens

Alle Werte liegen in `packages/ui/src/tokens/`. Direkte Zahlen in Komponenten
sind nicht zulässig – sonst lässt sich der Einfach-Modus nicht durchgängig
größer stellen.

### Farbe (`color.ts`)

Drei vollständige Paletten mit identischen Schlüsseln: `lightColors`,
`darkColors`, `highContrastColors`. Eine Farbe, die es nur in einer Palette
gibt, kann es nicht geben – ein Test prüft die Schlüsselgleichheit.

| Token | Rolle |
| --- | --- |
| `background`, `surface`, `surfaceRaised` | Flächen in drei Ebenen |
| `text`, `textMuted`, `textOnAccent` | Schrift |
| `accent`, `accentPressed` | wichtigste Handlung |
| `border`, `inputBorder` | Linien; `inputBorder` erfüllt 3:1 als Bedienelement |
| `focus` | Fokusring, immer sichtbar |
| `success`, `danger`, `warning` | Zustände – nie allein, immer mit Zeichen und Wort |
| `emergency`, `textOnEmergency` | Notfallhinweis |

`CONTRAST_PAIRS` beschreibt 17 Paare mit ihrer Rolle (Text 4,5:1,
Bedienelement 3:1). Der Test prüft sie in allen drei Paletten – 51 Prüfungen.

### Typografie (`typography.ts`)

*Atkinson Hyperlegible*, für Menschen mit Sehbeeinträchtigung entworfen: I, l
und 1 sind deutlich unterscheidbar, ebenso O und 0.

| Token | Größe / Zeilenhöhe |
| --- | --- |
| `display` | 34 / 42 |
| `title` | 26 / 34 |
| `heading` | 21 / 29 |
| `body` | 18 / 28 |
| `bodyStrong` | 18 / 28, halbfett |
| `label` | 16 / 24 |
| `caption` | 15 / 22 |

`scaleType(token, fontScale)` skaliert Größe **und** Zeilenhöhe gemeinsam –
sonst überlappen Zeilen bei großer Schrift.

### Maße (`layout.ts`)

- `spacing`: 0, 4, 8, 16, 24, 32, 48, 64
- `radius`: 8, 14, 22, Pille
- `elevation`: bewusst zurückhaltend
- `focusRing`: 3 dp Breite, 2 dp Abstand
- `motion`: 140 / 220 / 320 ms – bei reduzierter Bewegung durchgehend 0
- `touchTargets`: 48 (Standard), 56 (komfortabel), 72 (Einfach-Modus)
- `measure`: 66 Zeichen im Fließtext, 40 in Leichter Sprache

### Theme (`theme.ts`)

`buildTheme(prefs)` erzeugt aus den aufgelösten Nutzereinstellungen ein Theme.
Deshalb wirken Schriftgröße, Kontrast, Bewegung und Tippflächengröße
durchgängig, ohne dass eine Komponente sie einzeln berücksichtigen muss.

## Komponenten

| Komponente | Was sie leistet |
| --- | --- |
| `ThemeProvider` | stellt Theme und Einstellungen bereit |
| `Text`, `Heading` | Schriftrollen; Skalierung immer aktiv, Deckel bei 250 % |
| `Button` | Tippfläche aus dem Theme, sichtbarer Fokusring, Zustände „deaktiviert" und „beschäftigt" für den Screenreader |
| `ButtonStack` | Abstand zwischen gestapelten Schaltflächen – verhindert Fehlgriffe |
| `SpeakButton` | Vorlesen an jeder wichtigen Stelle |
| `ChoiceCard` | große Auswahlkarte; Auswahl über Rahmen, Haken **und** Zustand, nie nur Farbe |
| `TextField` | Beschriftung über dem Feld, Fehler am Feld mit Korrekturvorschlag, `autoComplete` |
| `Callout` | Hinweis mit Zeichen und Wort; Fehler werden aktiv angesagt |
| `WhatHappensNext` | „Was passiert jetzt?" an Entscheidungsstellen |
| `EmergencyBar` | Notrufhinweis; 112 und 110 mit einem Tipp erreichbar |
| `VerificationBadge` | drei Rollenstufen mit Zeichen und Wort |
| `VerifiedClaim` | ein einzelner geprüfter Nachweis im Klartext |
| `ProgressSteps` | „Schritt x von y" als Text, Balken nur ergänzend |
| `DgsVideo` | Hülle für Gebärdensprache: ehrlicher Stand, Abspieler, Transkript |
| `Screen` mit `hero` | randloses Bild über der Überschrift, Beschreibung ist Pflicht, Höhe gedeckelt |
| `Screen` mit `dgs` | fester Platz für Begleitung und Gebärdensprache direkt unter der Überschrift |
| `Avatar` | Foto nur mit Beschreibung; sonst neutraler Platzhalter mit Initialen |
| `Screen` | Grundgerüst: eine Hauptüberschrift, scrollender Inhalt, fester Fußbereich |

## Zwei Ansprüche, dieselben Bausteine

Der Bereich für verantwortliche Personen darf dichter sein – mehr Inhalt pro
Ansicht, Listen statt einzelner Karten. Er nutzt dieselben Komponenten und
dasselbe Theme wie der Rest. Tippflächen, Kontrast, Fokus und Schriftskalierung
sind identisch: „umfangreicher" heißt mehr Inhalt, nicht weniger
Barrierefreiheit.

## Regeln für neue Komponenten

1. Keine Zahlen im Stil – nur Tokens.
2. Jedes Bedienelement bekommt Rolle, Label und Zustand.
3. Zustand nie allein über Farbe. Immer zusätzlich Zeichen oder Wort.
4. Tippflächen aus `theme.touchTarget`, nie fest verdrahtet.
5. Fokus sichtbar lassen. Kein `outline: none`.
6. Animationsdauern aus `theme.motion` – dann greift „Bewegung reduzieren".
7. Fehler stehen am Feld und nennen den Weg zur Korrektur.
8. Neue Farbwerte in `CONTRAST_PAIRS` eintragen, sonst prüft sie niemand.
9. Kein Text in Bildern. Er skaliert nicht mit und lässt sich im
   Hochkontrastmodus nicht anpassen.
10. Untertitel und Videobeschriftungen kommen aus dem Theme, damit sie der
    eingestellten Schriftgröße folgen.

## Adminbereich

Der Adminbereich ist Web und kann keine React-Native-Tokens laden. Die Farbwerte
liegen dort als CSS-Variablen in `apps/admin/src/app/globals.css` gespiegelt.
**Ändert sich ein Wert, muss er an beiden Stellen gepflegt werden** – ein
Kommentar in beiden Dateien weist darauf hin. Ein gemeinsames Token-Paket, das
zu CSS-Variablen erzeugt wird, wäre der sauberere Weg und ist für später
vorgemerkt.
