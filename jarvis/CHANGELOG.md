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
* **Tests** — 155 Tests ohne Netzzugriff, ohne Anrufe, ohne Mailversand.
