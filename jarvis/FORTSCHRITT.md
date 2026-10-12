# JARVIS — Stand der Arbeit

Diese Datei ist der ehrliche Kassensturz: was läuft, was nur gebaut, aber
nicht live geprüft ist, und was fehlt. Sie wird mit jeder Änderung nachgezogen.

**Stand:** 12.10.2026 · 506 automatisierte Tests grün · pyflakes sauber · Oberfläche im echten Chromium durchgespielt

---

## Legende

| Zeichen | Bedeutung |
|---|---|
| ✅ | gebaut **und** geprüft (Test oder echter Durchlauf) |
| 🟡 | gebaut, aber **nicht live verifiziert** — es fehlt ein Zugang, eine Berechtigung oder echte Hardware |
| ⛔ | noch nicht gebaut |

Was hier 🟡 steht, behaupte ich nicht als funktionierend. Der Grund steht
jeweils dabei.

---

## Abschlusskriterien aus deiner Liste

| Kriterium | Stand | Anmerkung |
|---|---|---|
| Aktivierung durch zweimaliges Schnipsen | 🟡 | Erkennung im Browser: Impuls + Helligkeit + Abfall + Ruhe davor, einstellbare Schwelle mit Live-Rückmeldung. Der **Aktivierungsweg** ist im echten Chromium durchgespielt; die **akustische** Erkennung konnte ich ohne Mikrofon nicht prüfen — das musst du einmal selbst einstellen. |
| Dashboard öffnet mit Animation | ✅ | HUD im Browser geprüft: Ringe fahren hoch, Zustände, Wellenform, Panels. |
| „Moin, Master" | ✅ | Im Browser durchgelaufen: *„Moin, Master. Es ist 13:41 Uhr. Eine offene Aufgabe: HUD testen. Womit fangen wir an?"* |
| Sprachausgabe über ElevenLabs | 🟡 | Vollständig gebaut: Streaming-Endpunkt, Stimmenauswahl, Regler, Zwischenspeicher je Satz. **Nicht live geprüft** — es fehlt dein `ELEVENLABS_API_KEY`, und meine Entwicklungsumgebung lässt den Dienst nicht heraus. |
| Gespräch auf Deutsch | ✅ | Derselbe Agent wie in Telegram; im Browser durchgelaufen. |
| Unterbrechen während der Antwort | 🟡 | Eingebaut: Zwischenruf stoppt Ton und Warteschlange sofort, Esc ebenfalls. Mit echtem Mikrofon nicht geprüft. |
| Aktuelle Nachrichten recherchieren | 🟡 | Quellen: tagesschau, Deutschlandfunk, heise, Golem, NDR Hamburg. Parsen, Entdoppeln und Altersfilter sind getestet; der **echte Abruf** ist hier durch die Netzsperre meiner Umgebung blockiert (403). Auf deinem Mac läuft er. Kommt keine Quelle, sagt Jarvis das — er erfindet nichts. |
| Browser-Tabs und Webseiten öffnen | 🟡 | `webseite_oeffnen` über `open`. Von hier aus nicht prüfbar (kein macOS). |
| Apps auf dem Mac steuern | 🟡 | `programm_starten`, nur aus `ORB_PROGRAMME`. Auswahl-Logik getestet, `open -a` nicht prüfbar. |
| Texte professionell formulieren | ✅ | Über das Modell; E-Mail-Entwürfe nur mit Freigabe vor dem Versand. |
| Mehrstufige Aufgaben | ✅ | Agent mit Werkzeugschleife, Zerlegung in Aufgaben, Auftragswarteschlange. |
| Dateien erstellen und bearbeiten | ✅ | `datei_schreiben` (neu sofort, überschreiben nach Bestätigung), `datei_lesen`, `datei_suchen` — nur in `JARVIS_FILE_ROOTS`. |
| Dauerhaftes Gedächtnis | ✅ | SQLite, vier Schichten, Import über `mein-gehirn.md`, Export, Löschen. |
| Laufende Aufgaben verwalten | ✅ | Warteschlange mit Prioritäten, Wiederholung, Idempotenz, Protokoll im HUD. |
| Fehler erkennen und erklären | ✅ | Durchgehend; im HUD ein eigener Zustand mit Klartext. |
| Nach Neustart verfügbar | 🟡 | LaunchAgent liegt bei (`launchagent/`), auf deinem Mac einzurichten. |
| Kritische Aktionen abgesichert | ✅ | Drei Stufen, Einmal-Token mit Fingerabdruck und Ablauf. |
| Dokumentiert und getestet | ✅ | 506 Tests; `README.md`, `START-HEUTE.md`, `START-ORB.md`, `TESTPLAN.md`. |

### Zusätzlich geprüft (Browser, echter Durchlauf)

| Was | Stand | Nachweis |
|---|---|---|
| Zwei Ansichten, Umschalten | ✅ | HUD und Gehirn, im Chromium durchgeklickt |
| Gehirn: anzeigen, suchen, filtern | ✅ | 40 Einträge, Suche „quelle" → 4 Treffer |
| Gehirn: merken und vergessen | ✅ | Eintrag angelegt, gelistet, gelöscht |
| Diktat in zwei Schritten | ✅ | „merk dir Folgendes" → „Ich höre." → gemerkt |
| Mitte reagiert auf Klang | ✅ | Frequenzbalken und Teilchen gezeichnet (175 000 Bildpunkte) |
| Grundausstattung einlesen | ✅ | 39 Arbeitsregeln aus `gehirn-grundlagen.md` |

---

## Was du noch hinterlegen musst

| Was | Wofür | Wo |
|---|---|---|
| `ELEVENLABS_API_KEY` | die Stimme | `.env`; Stimme danach im Dashboard aussuchen |
| `ANTHROPIC_API_KEY` | Bildschirm ansehen, stärkeres Modell | `.env` |
| `TWILIO_*` | Anruf bei Absagen | `.env` |
| Mikrofon | Schnipsen, Sprache | Chrome fragt beim ersten Mal |
| Bildschirmaufnahme | „Was siehst du?" | Systemeinstellungen → Datenschutz & Sicherheit → Bildschirmaufnahme → Terminal |
| Festplattenvollzugriff | WhatsApp-Mitteilungen mitlesen | Systemeinstellungen → Datenschutz & Sicherheit → Festplattenvollzugriff → Terminal |

Ohne diese Angaben läuft der Rest trotzdem — jede Lücke wird im Dashboard
und in `./start.sh doctor` benannt.

---

## Bekannte Grenzen

* **Spracherkennung** läuft über die Web Speech API in Chrome, also über
  Google. Lokal mit whisper.cpp ist vorbereitet (`STT_ENGINE=whisper`), für
  den Browser-Weg aber nicht eingebunden. Am Schreibtisch ist Chrome
  schneller und braucht kein Modell auf der Platte.
* **Ein globaler Tastaturkurzbefehl** geht aus einer Webseite heraus nicht.
  Im Fenster: Leertaste hört zu, Esc stoppt. Systemweit ließe sich das über
  *Kurzbefehle.app* lösen (ein Kurzbefehl, der `./start.sh orb` aufruft) —
  noch nicht eingerichtet.
* **Schnipsen bei geschlossenem Fenster** geht nicht: die Erkennung lebt im
  Browser-Tab. Das Fenster darf im Hintergrund liegen, muss aber offen sein.
  Ein echter Hintergrunddienst bräuchte eine native App.
* **Browser-Agent** öffnet Seiten, liest sie aber nicht aus dem geöffneten
  Fenster zurück; `web_abrufen` holt Inhalte eigenständig. Tabs wechseln und
  schließen fehlt.
* **Kein Audio wird gespeichert.** Es wird nichts mitgeschnitten.

## Als Nächstes sinnvoll

1. Schnipserkennung mit deinem Mikrofon einstellen (Dialog **Stimme** zeigt live, was erkannt wird).
2. ElevenLabs-Stimme aussuchen, Regler einstellen.
3. Tab-Steuerung für Safari und Chrome über AppleScript.
4. Kurzbefehl in *Kurzbefehle.app* für den systemweiten Aufruf.
5. whisper.cpp als Alternative zur Browser-Erkennung.

---

## Starten und stoppen

```bash
./start.sh orb        # Dienst + Dashboard in Chrome
./start.sh run        # nur Dienst (Telegram, Hintergrund, API)
./start.sh doctor     # Zustand aller Bausteine
./start.sh selftest   # ganze Kette, eigene Datenbank, keine echten Anrufe
```

Beenden mit `Strg+C`. Das Dashboard zu schließen beendet den Dienst **nicht**.

## Wenn etwas klemmt

Erst `./start.sh doctor` — die Zeilen sagen, welcher Baustein hängt.
Fehlerlisten stehen in `START-ORB.md` (Dashboard, Stimme, Schnipsen) und in
`README.md` (Telegram, Kalender, Mail, Telefonie).
