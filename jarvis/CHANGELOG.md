# Änderungen

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
* **Tests** — 237 Tests ohne Zugriffe nach draussen, darunter eine
  Gesamtprobe mit allen vier Schnittstellen gleichzeitig. Telegram, IMAP/SMTP,
  CalDAV und Twilio laufen gegen Stellvertreter-Server, die das jeweilige
  Protokoll wirklich sprechen; die Telefonie-Rueckrufe gehen signiert durch den
  echten HTTP-Dienst.

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
* Ein leerer Wert in der `.env` fiel still auf den Standard zurueck:
  `MORNING_BRIEFING=` haette trotzdem um 07:30 gefeuert, und die Ruhezeit liess
  sich nicht abschalten.
