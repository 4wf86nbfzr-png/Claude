# Änderungen

## 1.2.0 — Jarvis zum Sprechen (Orb)

Die Sprachoberfläche aus dem Video, auf denselben Kern gesetzt statt daneben
gestellt: ein Gedächtnis, eine Aufgabenliste, dieselben Werkzeuge wie Telegram.

* **Orb** (`core/orb.py`, `server/orb/index.html`, `GET /orb`) — Oberfläche im
  Browser: Spracheingabe über die Web Speech API, animierter Orb, Verlauf,
  Tippfeld als Rückfallweg. `./start.sh orb` startet alles und öffnet Chrome.
* **Begrüßung** auf das Weckwort: Tageszeit, Uhrzeit, Wetter (Open-Meteo, ohne
  Schlüssel) und offene Aufgaben — und offene dringende Nachrichten.
* **Doppelklatschen** fährt das Setup hoch (`ORB_PROGRAMME`, `ORB_WEBSEITE`).
  Erkannt wird im Browser über zwei scharfe Pegelspitzen mit Ruhe davor; es
  verlässt kein Audio den Rechner und es braucht keine Audiobibliothek.
* **Stimme** (`adapters/voice/elevenlabs.py`) — ElevenLabs mit Zwischenspeicher
  je Satz. Ohne Schlüssel spricht der Browser; der Orb bleibt benutzbar.
* **Bildschirm ansehen** (`adapters/vision.py`) — `screencapture` plus Claude
  Vision. Das Bild wird beschrieben und sofort verworfen.
* **Rechner-Werkzeuge** (`core/tools_system.py`) — Programm starten (nur aus
  der freigegebenen Liste), Webseite öffnen (nur http/https), Bildschirm
  ansehen, Wetter. Zusammen abschaltbar mit `ORB_AKTIONEN=false`.
* **Aktionsmarken** — schreibt ein kleines Modell `[AKTION:OEFFNE] …` als Text,
  statt das Werkzeug aufzurufen, wird es trotzdem ausgeführt und nicht
  vorgelesen.
* **Antworten für die Stimme**: eigener Kanal im Systemtext (kurz, keine
  Listen, keine Sternchen) und eine Aufbereitung, die Nummern ausschreibt und
  Links ersetzt.
* `START-ORB.md` — Einrichtung in zehn Minuten, mit Fehlertabelle.

## 1.1.0 — Nachrichten mitlesen, einstufen, melden

* **Eingehende Nachrichten** (`core/triage.py`, `core/messages.py`,
  `adapters/messenger/`) — Jarvis liest mit, was auf WhatsApp hereinkommt,
  stuft jede Nachricht ein (ignorieren / melden / dringend) und meldet nur,
  was dich angeht. Zwei Quellen: die Mitteilungen von WhatsApp Desktop auf
  dem Mac (rein lokal) oder eine HTTP-Brücke (`POST /api/nachricht/eingang`).
* **Anruf bei Ausfall** — Absage, Krankmeldung, „schaffe es nicht",
  deutliche Verspätung: das löst einen Anruf aus, sobald Telefonie
  eingerichtet ist, und zusätzlich eine Meldung in Telegram.
  Die Regeln entscheiden ohne KI; ein Modell darf nur zweitmeinen und eine
  erkannte Absage nie herabstufen.
* **Zwischenstand** — alle paar Stunden eine kurze Nachricht, was im
  Hintergrund lief (Mails durchgesehen, Nachrichten gelesen und gefiltert,
  Erinnerungen, Anrufe). Wenn nichts war, bleibt es still.
  Auf Zuruf mit `/bericht`.
* **Bedienung** — `/nachrichten`, `/erledigt <Nr>`, `/bericht`, ein eigenes
  Menü, Knöpfe „Erledigt" und „Antwort entwerfen"; die Werkzeuge
  `nachrichten_liste`, `nachricht_lesen`, `nachricht_erledigt`,
  `nachrichten_suchen`, `hintergrundbericht` stehen auch dem Modell,
  dem Telefon und dem Dashboard zur Verfügung.
* **Ohne Modell** — „Hat mir jemand geschrieben?" und „Was hast du gemacht?"
  werden auch im Ersatzbetrieb erkannt und beantwortet.
* **Gehirn** — `mein-gehirn.start.md`, eine ausgefüllte Startfassung;
  `./start.sh lernen` legt die persönliche Fassung daraus an.

## 1.0.0 — erste betriebsfähige Fassung

Neu aufgebaut, weil im Projekt kein Jarvis-Bestand vorhanden war (das
Repository enthielt die HERM-Website). Entstanden ist ein eigenständiges
System unter `jarvis/`, das die Website nicht berührt.

* **Kern** — SQLite mit versionierten Migrationen, Gedächtnis in vier Schichten,
  Aufgaben und Erinnerungen, persistente Auftragswarteschlange mit
  Hintergrunddienst, drei Berechtigungsstufen mit Einmal-Bestätigungen,
  proaktive Meldungen mit Ruhezeiten und Dedupe.
* **Telegram** — vollständige Bedienung: freies Gespräch, 19 Befehle, Menüs mit
  Inline-Tastaturen, Bestätigungsknöpfe, Nachrichtenteilung, Zugang nur für
  hinterlegte IDs.
* **KI** — Ollama (Standard, lokal), OpenAI, Anthropic, Ersatzmodell;
  Werkzeugaufrufe nativ oder über JSON im Text, Wiederholungen, kontrollierter
  Modellwechsel, Notbetrieb statt Totalausfall.
* **Werkzeuge** — 41 Stück für Aufgaben, Erinnerungen, Kalender, E-Mail,
  Telefonie, Gedächtnis, Recherche und Status; dieselben für Modell, Knöpfe,
  Dashboard und Telefon.
* **Kalender** — lokal, CalDAV und Google (vollständiger OAuth-Ablauf); jede
  Änderung wird beim Anbieter nachgelesen.
* **E-Mail** — IMAP/SMTP, Einstufung, Zusammenfassung, Entwürfe; Versand nur
  nach Bestätigung und nur einmal.
* **Telefonie** — Twilio Voice: Erinnerungsanrufe mit Tastenbestätigung,
  Eskalation bei fehlender Bestätigung, echte Gespräche über die
  Telefonie-Rückrufe; Tageslimit, Versuchsgrenze, harter Ausschalter.
* **HTTP-Dienst** — Dashboard und API auf demselben Kern, Token-Zugang,
  Prüfung der Twilio-Signatur.
* **Betrieb** — `jarvis run|doctor|setup|ask|tools|backup|restore|migrate|export|google-login`,
  LaunchAgent für macOS, systemd-Unit für den Serverbetrieb, tägliche Sicherung.
* **Sprachnachrichten** — Telegram-Sprachnachrichten werden heruntergeladen,
  lokal erkannt (Whisper), offengelegt ("Verstanden: ...") und wie Text
  behandelt; ohne lokale Erkennung sagt Jarvis das, statt sie zu verschlucken.
* **Selbsttest** — `jarvis selftest` laesst die ganze Kette in einer eigenen,
  danach geloeschten Datenbank echt durchlaufen: Aufgabe, Gedaechtnis, Termin,
  faellige Erinnerung samt Zustellung, Doppelausfuehrungsschutz, Bestaetigung,
  Agentendurchlauf, Sicherung, Neustart.
* **Tests** — 297 Tests ohne Zugriffe nach draussen, darunter eine
  Gesamtprobe mit allen vier Schnittstellen gleichzeitig und Stellvertreter
  fuer Ollama, OpenAI und Anthropic. Telegram, IMAP/SMTP,
  CalDAV und Twilio laufen gegen Stellvertreter-Server, die das jeweilige
  Protokoll wirklich sprechen; die Telefonie-Rueckrufe gehen signiert durch den
  echten HTTP-Dienst.

### Inbetriebnahme

* **`mein-gehirn.md`** — eine Datei, in die der Nutzer eintraegt, wer er ist,
  wie er arbeitet und was dauerhaft gelten soll. Einlesen per
  `jarvis lernen` oder indem die Datei in Telegram an den Bot geschickt
  wird; Vorschau, Bestaetigung, dann uebernommen. Unausgefuellte
  Platzhalter werden uebersprungen, gleicher Schluessel ueberschreibt --
  die Datei bleibt die Quelle der Wahrheit und ist beliebig oft einlesbar.
* **`START-HEUTE.md`** — Schritt fuer Schritt vom leeren Rechner bis zum
  laufenden Dienst, mit Pruefpunkt je Schritt.
* **`TESTPLAN.md`** — 68 konkrete Nachrichten samt erwartetem Ergebnis.
* **`/gehirn`** und **`/vergiss`** in Telegram, `jarvis gehirn` im Terminal.
* Python-Version wird in `start.sh` und beim Start geprueft (macOS liefert
  ab Werk ein zu altes Python; der Fehler waere sonst unverstaendlich).

### Dabei gefundene und behobene Fehler

* Die Twilio-Signatur wurde ohne Query-Teil berechnet -- telefonische
  Bestaetigungen ("Taste 1 = erledigt") haetten nie funktioniert.
* `calls_today()` enthielt Python-Tupelschreibweise statt SQL; jeder Anruf
  waere an der Tageszaehlung gescheitert.
* Ein Anruf scheiterte, wenn die zugehoerige Erinnerung inzwischen geloescht
  war -- das Protokoll darf einen Anruf nie verhindern.
* Die Gedaechtnissuche fand gebeugte Formen nicht ("telefonieren" fand
  "Telefoniert" nicht); Suchbegriffe werden jetzt gekuerzt.
* Ein Netzaussetzer beim Start beendete den ganzen Dienst; jetzt wird mit
  wachsendem Abstand wiederholt, und ein Ausfall von Telegram laesst
  Erinnerungen, Telefonie und Dashboard weiterlaufen.
* Ein zweites Loeschen desselben Termins meldete faelschlich Erfolg.
* `/merken` und `/erinnere` hingen am Sprachmodell: war Ollama aus,
  antwortete Jarvis "Gemerkt." und merkte nichts. Beide legen jetzt selbst
  ab -- die Zeitangabe wird mit `split_text_and_time` aus dem Satz
  herausgetrennt, das Modell ist nur noch Rueckfallebene fuer Faelle ohne
  erkennbare Zeit.
* "jeden Montag um 9" an einem Montagnachmittag wurde als Termin in der
  Vergangenheit abgelehnt statt auf den naechsten Montag gelegt.
* Ein leerer Wert in der `.env` fiel still auf den Standard zurueck:
  `MORNING_BRIEFING=` haette trotzdem um 07:30 gefeuert, und die Ruhezeit liess
  sich nicht abschalten.
