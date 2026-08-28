# Jarvis Pro - Fortschritt

Stand: Phase 1 bis 7 der verbindlichen Reihenfolge.

## Erledigt und durch Tests belegt

| # | Phase | Stand | Nachweis |
|---|-------|-------|----------|
| 1 | Rein lesende Bestandsaufnahme | fertig | siehe unten |
| 2 | Sichere neue Projektstruktur | fertig | `JARVIS-PRO/`, Website unberuehrt |
| 3 | Domainmodelle | fertig | `packages/domain` |
| 4 | Eventstore | fertig | `packages/storage/src/event-store.ts` |
| 5 | Persistente Jobqueue | fertig | `packages/storage/src/job-queue.ts` |
| 6 | Approval Engine mit vollstaendigen Tests | fertig | 46 Tests |
| 7 | Call- und Audio-Simulator | fertig | 49 Tests |

## Bestandsaufnahme (rein lesend, nichts geloescht)

- Kein `Jarvis`-Ordner, keine Reste von whisper.cpp, Piper oder Python-Umgebungen gefunden.
  Es gab daher nichts zu sichern.
- Das vorhandene Repository ist die HERM-Website. Sie wurde nicht angefasst;
  Jarvis liegt vollstaendig in `JARVIS-PRO/`.

## Wichtig: die Entwicklungsumgebung ist nicht der MacBook Pro

Diese Arbeit lief in einem Linux-Container (x86_64, Node 22.22, pnpm 10.33,
Docker, gcc, cmake). **Nicht** vorhanden: ffmpeg, sqlite3-CLI, Asterisk,
Audiogeraete, Apple Silicon, Metal.

Daraus folgt:

- Alle Latenz- und Genauigkeitsbenchmarks fuer whisper.cpp und Piper sind
  **noch nicht gemessen**. Das Skript dafuer liegt bereit, die Messung muss auf
  Noahs Mac laufen. Bis dahin steht keine Modellempfehlung im Projekt.
- Der Asterisk-Adapter ist **`unverified`**: gegen die Protokollbeschreibung
  geschrieben, nie gegen eine laufende Asterisk-Instanz getestet.
- Alles, was ohne Hardware pruefbar ist, ist geprueft.

## Beim Testen gefundene und behobene Fehler

1. **Audit-Log vergab doppelte Sequenznummern.** Nebenlaeufige, nicht
   abgewartete Eintraege lasen denselben Vorgaengerhash. Lesen und Schreiben
   laufen jetzt in einer Transaktion, die Aufrufe im Prozess sind serialisiert.
2. **A-law-Encoder war falsch.** Schob um vier statt drei Bit und behandelte
   das Vorzeichen als eigenes Bit statt als XOR-Maske. Relativer Fehler lag
   bei 51 Prozent. Jetzt nach der G.711-Referenz, Fehler unter 8 Prozent.
3. **Jitter Buffer gab bei gefuelltem Puffer nichts aus.** Der Fuellzustand ist
   jetzt explizit.
4. **VAD erkannte keinen Sprachbeginn.** Der Zaehler fuer zusammenhaengende
   Sprache wurde bei jedem leisen Frame auf null gesetzt; deutsche
   Verschlusslaute reichen dafuer aus. Jetzt Abbau statt Reset.
5. **Testharness schloss die Datenbank waehrend laufender Audit-Schreibvorgaenge.**

## Naechste Schritte

8. Vollstaendiger End-to-End-Dry-Run
9. Claude-Gehirn mit Mock-Tools
10. Prompt-Injection-Schutz im Gespraechsablauf
11-14. Lokales STT/TTS verdrahten, Benchmarks auf dem Mac, Barge-in im Live-Betrieb
16. Reale Asterisk-Integration
17-21. Microsoft Graph, Kalender, WhatsApp
22-25. SIM, Gateway, echte Testanrufe
