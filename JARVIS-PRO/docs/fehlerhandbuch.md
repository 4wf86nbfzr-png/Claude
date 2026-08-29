# Fehlerhandbuch

Nach Symptom sortiert — so, wie es auftritt, nicht wie es im Code heißt.

Zuerst immer:

```bash
pnpm doctor    # was fehlt?
pnpm status    # was macht Jarvis gerade?
```

---

## Start

### „Die Konfiguration ist unvollständig oder falsch"

Der Start bricht ab, bevor irgendetwas passiert. Das ist Absicht — eine
halbe Konfiguration im laufenden Betrieb ist schlimmer als ein Abbruch.

Die Meldung nennt das Feld. Häufig:

| Meldung | Was zu tun ist |
|---|---|
| `ownerPhone: Rufnummer muss im E.164-Format vorliegen` | `+49…` statt `0…`, keine Leerzeichen: `+491771459965` |
| `Jarvis würde sich selbst anrufen` | Owner- und Jarvis-Nummer sind gleich |
| `Im Live-Betrieb muss JARVIS_DB_CIPHER=true gesetzt sein` | in der Datenbank stehen personenbezogene Daten |
| `Im Live-Betrieb müssen WHISPER_BIN und PIPER_BIN gesetzt sein` | `pnpm setup`, dann `pnpm bench:speech` |

### „Es ist keine Freigabe-PIN hinterlegt"

Ohne sie kann nichts gesendet werden — bewusst.

```bash
pnpm hash:pin
# den ausgegebenen Hash in den Schlüsselbund legen (Befehl steht dabei)
```

### „Datenbankverschlüsselung angefordert, aber der Treiber unterstützt SQLCipher nicht"

Jarvis bricht ab, statt unverschlüsselt weiterzulaufen. Das ist die richtige
Reaktion.

Entweder ein SQLCipher-fähiges SQLite bereitstellen, oder — nur für Tests
ohne echte Daten — `JARVIS_DB_CIPHER=false` und `JARVIS_MODE=dry-run`.
**Nicht** im Live-Betrieb.

### „Node … ist zu alt"

`node:sqlite` gibt es erst ab Node 22.13.

```bash
# macOS
brew upgrade node
# Linux
sudo apt-get install -y nodejs   # ggf. NodeSource-Quelle einbinden
```

---

## Telefonie

### Jarvis nimmt keine Anrufe an

Von oben nach unten prüfen:

```bash
# 1. Läuft Jarvis überhaupt?
pnpm status            # oder: systemctl status jarvis

# 2. Ist Asterisk da und beim Gateway registriert?
asterisk -rx "pjsip show registrations"   # erwartet: Registered
asterisk -rx "pjsip show endpoints"       # erwartet: Avail

# 3. Ist die ARI-Anwendung verbunden?
asterisk -rx "ari show apps"              # erwartet: jarvis

# 4. Kommt der Anruf überhaupt an?
asterisk -rvvv
# Anrufen und zusehen. Kommt nichts, endet der Anruf vor Asterisk -
# dann liegt es am Gateway oder am Mobilfunknetz.
```

**Häufigste Ursachen:**

| Symptom | Ursache | Abhilfe |
|---|---|---|
| Registrierung schlägt fehl | falsches Passwort im Gateway | in `pjsip.conf` prüfen |
| „Avail" fehlt | Gateway nicht erreichbar | `ping <gateway-ip>` |
| Anruf kommt nicht bis Asterisk | Gateway leitet nicht weiter | Weiterleitung im Gateway prüfen |
| Es klingelt, aber niemand hebt ab | Jarvis läuft nicht | Dienst starten |
| „ari show apps" ist leer | ARI-Passwort falsch | Schlüsselbundeintrag `ari-password` |

### Es klingelt, aber Jarvis hört nichts (oder ist stumm)

Fast immer der Audiopfad.

```bash
# Nimmt Jarvis Audio-Verbindungen an?
ss -tlnp | grep 41000       # erwartet: 127.0.0.1:41000

# Wurde die Bridge gebaut?
asterisk -rx "bridge show all"
asterisk -rx "channel show channels"      # erwartet: der Anruf UND ein UnicastRTP/externalMedia
```

| Symptom | Ursache | Abhilfe |
|---|---|---|
| kein Port 41000 | Jarvis läuft nicht oder ist abgestürzt | Log ansehen |
| kein externalMedia-Kanal | `res_audiosocket` fehlt | `asterisk -rx "module show like audiosocket"` |
| Kanal da, aber kein Ton | Codec passt nicht | im Endpoint `allow = alaw` prüfen |
| Ton nur in eine Richtung | RTP-Ports gesperrt | Firewall: 10000–10100/udp vom Gateway |

**Wichtig:** Dieser Teil ist noch nie gegen eine laufende Asterisk-Instanz
gelaufen. Die Parameter des `externalMedia`-Aufrufs haben sich zwischen den
Versionen verändert. Zuerst `docs/api-annahmen.md`, Abschnitt Asterisk,
gegen die **installierte** Version prüfen.

### Die PIN wird nicht erkannt

DTMF ist die häufigste Fehlerquelle in der ganzen Telefonie.

```bash
asterisk -rvvv
# Anrufen, Tasten drücken. Erwartet: "ChannelDtmfReceived"
```

Kommt nichts: in `pjsip.conf` `dtmf_mode = rfc4733` prüfen. Inband-Töne
überstehen die Codec-Wandlung nicht zuverlässig. Manche Gateways können nur
`inband` oder `info` — dann muss der Wert dorthin passen.

Nicht vergessen: **die Rautetaste schließt die Eingabe ab.**

### Jarvis ruft nicht an

```bash
pnpm status    # Abschnitt "Anruf-Jobs"
```

| Was du siehst | Bedeutung | Abhilfe |
|---|---|---|
| `PENDING 0` und keine offenen Ereignisse | nichts zu melden | in Ordnung |
| `PENDING` steigt, nichts passiert | Stundenlimit erreicht | `CALL_MAX_PER_HOUR` prüfen |
| `PAUSED > 0` | genau das | Ursache im Log, dann Neustart |
| `DEAD_LETTER > 0` | Anrufe scheitern dauerhaft | `last_error` in der Ausgabe |
| `RUNNING` seit langem | Prozess ist abgestürzt | Neustart gibt den Job frei |

**Nichts geht dabei verloren.** Auch ein pausierter oder gescheiterter Job
lässt das Ereignis offen; es wird beim nächsten Gespräch zuerst genannt.

---

## Sprache

### Die Erkennung ist schlecht

```bash
pnpm bench:speech
```

| Ursache | Abhilfe |
|---|---|
| Modell zu klein | `medium` statt `small` |
| Eigennamen falsch | Korrekturliste in `packages/speech/src/hints.ts` erweitern |
| Erstes Wort fehlt | `preRollMs` erhöhen (Voreinstellung 400 ms) |
| Letztes Wort fehlt | `postRollMs` erhöhen (Voreinstellung 300 ms) |
| Sätze werden zerschnitten | `silenceMs` im VAD erhöhen |
| Es wird nicht angehalten | `silenceMs` senken |

Die Korrekturliste ist Konfiguration, kein Code: Kunden- und
Mitarbeiternamen gehören dort hinein.

### Jarvis reagiert zu langsam

```bash
pnpm status    # nach dem Gespräch
```

Die Latenz setzt sich aus drei Teilen zusammen:

| Teil | Gemessen als | Stellschraube |
|---|---|---|
| Erkennung | `jarvis_stt_latency_ms` | kleineres Modell, mehr Threads |
| Modellantwort | `jarvis_model_ttft_ms` | kürzerer Kontext, anderes Modell |
| Sprachausgabe | `jarvis_tts_ttfa_ms` | kürzere erste Sätze |

Zielwert: Antwortbeginn im Median höchstens 2,5 Sekunden. Der größte Hebel
ist fast immer die Erkennung.

### Jarvis lässt sich nicht unterbrechen

`bargeInMs` in der `VoiceSession` (Voreinstellung 160 ms) — kleiner heißt
empfindlicher. Zu klein, und Nebengeräusche brechen die Ausgabe ab.

Bricht er umgekehrt **zu leicht** ab: Wert erhöhen, oder in einer lauten
Umgebung die VAD-Schwelle anheben.

### „Piper lieferte kein Audio"

```bash
echo "Test." | $PIPER_BIN --model $PIPER_VOICE --output_raw | wc -c
```

Kommt 0: Pfad zur Stimme falsch, oder die Datei passt nicht zur
Piper-Version. Zu jeder `.onnx` gehört eine `.onnx.json` im selben Ordner.

---

## E-Mail und Kalender

### „Kein Refresh Token hinterlegt"

```bash
pnpm connect:microsoft
```

### Die Anmeldung läuft ständig ab

Microsoft rotiert Refresh Tokens. Der neue muss nach jeder Erneuerung sofort
gespeichert werden — das passiert automatisch, kann aber fehlschlagen, wenn
der Schlüsselbund nicht schreibbar ist.

```bash
pnpm logs:safe | grep oauth
```

Steht dort `oauth_erneuerung_fehlgeschlagen`, ist meist der Schlüsselbund
gesperrt (macOS: Anmeldung nicht erfolgt) oder `secret-tool` fehlt (Linux).

### Keine neuen E-Mails, obwohl welche da sind

**Beim ersten Lauf ist das richtig so.** Der erste Delta-Abgleich setzt nur
den Ausgangsstand — sonst würde ein voller Posteingang eine Anrufwelle
auslösen. Ab der zweiten Runde kommen neue Nachrichten.

Danach:

```bash
pnpm logs:safe | grep postfach
```

| Meldung | Bedeutung |
|---|---|
| `delta_ausgangsstand_gesetzt` | erster Lauf, alles normal |
| `postfach_anmeldung_abgelaufen` | neu verbinden |
| `postfach_abgleich_fehlgeschlagen` | Netz oder Provider; wird automatisch wiederholt |

### „Der Kalender hat den Termin NICHT bestätigt"

Genau das heißt es: **es wurde nichts eingetragen.** Kein halber Termin, kein
Termin ohne Teilnehmer. Einfach noch einmal versuchen. Bleibt es dabei,
Berechtigungen prüfen (`Calendars.ReadWrite`).

---

## WhatsApp

### Es kommen keine Nachrichten an

```bash
ss -tlnp | grep 8787                # erwartet: 127.0.0.1:8787
pnpm logs:safe | grep webhook
```

| Meldung | Bedeutung | Abhilfe |
|---|---|---|
| `webhook_signatur_ungueltig` | App Secret falsch oder Proxy verändert den Body | Secret prüfen; Proxy darf den Rohkörper nicht anfassen |
| `webhook_verifikation_abgelehnt` | Verify Token stimmt nicht | bei Meta und im Schlüsselbund abgleichen |
| `webhook_schema_ungueltig` | unbekanntes Format | Graph-Version prüfen |
| gar nichts im Log | Meta erreicht den Endpunkt nicht | Reverse Proxy, Zertifikat, DNS |

**Der häufigste Fehler:** ein Reverse Proxy, der den Body umschreibt. Dann
stimmt die Signatur nicht mehr, und Jarvis lehnt zu Recht ab. Der Body muss
unverändert durchkommen.

### „Das Antwortfenster ist zu"

Kein Fehler, sondern die Regel von Meta. Frei formulierter Text ist nur
innerhalb eines begrenzten Zeitraums nach der letzten Kundennachricht
zulässig. Danach ginge nur eine genehmigte Vorlage — Jarvis sendet keine, weil
er sie nicht sinnvoll ausfüllen könnte.

Jarvis sagt das am Telefon, statt es beim Provider auflaufen zu lassen.

### „Von dieser Nummer liegt keine eingehende Nachricht vor"

Dasselbe in anders: an eine Nummer, die noch nie geschrieben hat, darf ein
Unternehmen nicht frei formuliert schreiben.

---

## Versand

### „Es wurde nichts gesendet"

Immer wörtlich zu nehmen. Die Meldung nennt den Grund:

| Meldung | Was fehlte |
|---|---|
| „Das war keine gültige Bestätigung" | „ja" reicht nicht, es braucht „Ja, senden" |
| „Die PIN war nicht richtig" | Freigabe-PIN, nicht Anmelde-PIN |
| „Die Freigabe ist abgelaufen" | länger als `APPROVAL_EXPIRES_SECONDS` gebraucht |
| „Am Inhalt hat sich etwas geändert" | nach dem Vorlesen wurde korrigiert — alles wird neu vorgelesen |
| „Ich habe dich unterbrochen gehört" | während des Vorlesens gesprochen; der Read-back gilt dann nicht |

Alles davon ist beabsichtigt. Einfach neu anfangen.

### „Ich weiß nicht sicher, ob sie angekommen ist"

Der Provider hat keine belastbare Antwort geliefert. Das wird **nicht** als
Erfolg dargestellt und **nicht** automatisch wiederholt — ein Retry könnte
eine zweite Mail erzeugen.

```bash
pnpm status    # Zeile "Status unklar"
```

Im Postfach nachsehen. Ist nichts angekommen, neu freigeben.

### Eine Nachricht kam doppelt an

Sollte nicht passieren: `sends.idempotency_key` ist UNIQUE, und schreibende
Aufrufe werden nie automatisch wiederholt.

```bash
pnpm status    # "Tatsächlich gesendet"
```

Steht dort 1 und trotzdem kamen zwei an, liegt es beim Provider (etwa eine
Weiterleitungsregel im Postfach). Bitte melden — dann stimmt eine Annahme
nicht.

---

## Datenbank und Neustart

### „database is locked"

Zwei Prozesse greifen zu.

```bash
ps aux | grep -c "[j]arvis"   # erwartet: 1
```

Läuft nur einer: WAL-Reste aufräumen.

```bash
systemctl stop jarvis
sqlite3 var/jarvis.db "PRAGMA wal_checkpoint(TRUNCATE);"
systemctl start jarvis
```

### Nach einem Absturz: sind Ereignisse verloren?

Nein. Beim Start werden hängengebliebene Jobs freigegeben
(`recoverAfterRestart`), unbesprochene Ereignisse bleiben offen, und
abgelaufene Freigaben verfallen sauber.

```bash
pnpm status
```

### „Audit-Kette GEBROCHEN"

Ernst zu nehmen. Möglich sind:

1. Ein Fehler beim Schreiben (etwa Speicher voll).
2. Jemand hat die Datenbank von Hand verändert.

```bash
pnpm status                  # nennt die Sequenznummer
sqlite3 var/jarvis.db "SELECT seq, at, action, subject FROM audit_log WHERE seq BETWEEN <n>-3 AND <n>+3;"
```

Ist der Grund nicht erklärbar, aus einer Sicherung wiederherstellen und die
Zugriffe auf den Rechner prüfen.

---

## Sicherheit

### Verdacht auf Kompromittierung

In dieser Reihenfolge:

```bash
# 1. Sofort anhalten
sudo systemctl stop jarvis

# 2. Alle Verbindungen trennen
pnpm tsx scripts/connect-microsoft.ts --trennen
# WhatsApp-Token bei Meta zurückziehen
# ARI-Passwort im Gateway und im Schlüsselbund ändern

# 3. PINs neu setzen
pnpm hash:pin    # zweimal

# 4. Nachsehen, was passiert ist
pnpm status      # Audit-Log, Abschnitt "Tatsächlich gesendet"
```

Das Audit-Log ist dabei die verlässlichste Quelle: es zeigt jeden
Freigabevorgang und jeden Versand mit Zeitstempel.

Zusätzlich: unter https://myaccount.microsoft.com die Berechtigung entziehen,
im Meta-Portal das System-User-Token zurückziehen.

### Ein Geheimnis ist versehentlich im Git gelandet

**Das Geheimnis ist verbrannt.** Es aus der Historie zu entfernen reicht
nicht — es war da, und es könnte kopiert worden sein.

1. Das Geheimnis beim Anbieter **zurückziehen und neu ausstellen.**
2. Erst danach die Historie bereinigen (`git filter-repo`).
3. Prüfen, warum die CI es nicht gefunden hat, und die Regel ergänzen.

---

## Wenn nichts hilft

Diese Angaben zusammentragen — sie enthalten keine Geheimnisse:

```bash
pnpm doctor > diagnose.txt
pnpm status >> diagnose.txt
pnpm logs:safe | tail -200 >> diagnose.txt
```

Dazu: was zuletzt geändert wurde, und ob `pnpm dry-run` noch durchläuft.
