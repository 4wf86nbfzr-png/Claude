# Betriebshandbuch

Für Noah. Alles auf Deutsch, jeder Schritt mit Begründung, Erwartung und
Rückweg.

---

## 0. Das Wichtigste vorweg

**Jarvis ist nur erreichbar, solange der Rechner läuft.**
Ein zugeklappter, ausgeschalteter oder schlafender Mac nimmt keine Anrufe an
und meldet keine neuen Nachrichten. Anrufe gehen dann ins Leere — ohne
Hinweis, ohne Voicemail. Für echten Dauerbetrieb gehört Jarvis auf einen
kleinen Linux-Rechner, der immer läuft (Abschnitt 8).

**Der Betriebsmodus steht auf `simulation`, bis du ihn änderst.**
In diesem Zustand telefoniert Jarvis nicht, sendet nichts und redet mit
keinem Provider. Alles lässt sich trotzdem ausprobieren.

**Jarvis kann nichts senden, was du nicht Wort für Wort freigegeben hast.**
Das ist keine Einstellung, sondern die Bauweise. Es gibt keinen Schalter, der
das ändert.

---

## 1. Was du brauchst

| Was | Wofür | Anmerkung |
|---|---|---|
| Mac oder Linux-Rechner | Jarvis läuft dort | Node 22.13 oder neuer |
| GSM/VoLTE-zu-SIP-Gateway | die Telefonleitung | **kein zweites Handy** — siehe unten |
| SIM-Karte für Jarvis | die eigene Nummer | eigener Vertrag oder Prepaid |
| Microsoft-365-Konto | E-Mail und Kalender | dein bestehendes Postfach |
| WhatsApp Business Account | WhatsApp | Coexistence-Frage klären, Abschnitt 6 |
| Anthropic-Zugang | das Sprachmodell | für den Gesprächspartner |

### Warum kein zweites Handy

Ein Handy ist kein SIP-Trunk. Es kann einen Anruf nicht an Asterisk
weiterreichen und keinen von dort annehmen. Was gebraucht wird, ist ein
Gerät, das auf der einen Seite eine SIM hat und auf der anderen Seite SIP
spricht — ein GSM- bzw. VoLTE-Gateway. Die SIM muss also aus dem Handy in
das Gateway.

Beim Kauf zu beachten: **VoLTE ist Pflicht.** Reine 2G-Geräte sind in
Deutschland nicht mehr brauchbar, weil die 2G-Netze abgeschaltet wurden.
Ein günstiges 2G-Gateway ist rausgeworfenes Geld.

---

## 2. Einrichtung

### 2.1 Erst nachsehen, was da ist

```bash
cd JARVIS-PRO
pnpm doctor
```

**Was das tut.** Liest den Rechner aus: Betriebssystem, Prozessor, Speicher,
Werkzeuge, vorhandene Modelle, Konfiguration. Ändert nichts, löscht nichts.

**Was du siehst.** Eine Liste mit `ok`, `warn` und `FEHLT`. Alle Werte sind
maskiert — den Bericht kannst du gefahrlos weitergeben.

**Rückgängig.** Nicht nötig, es wurde nichts verändert.

### 2.2 Einrichten

```bash
pnpm setup
```

**Was das tut.** Installiert die Projektabhängigkeiten, klont und baut
whisper.cpp (auf Apple Silicon mit Metal), lädt die Sprachmodelle `small` und
`medium`, legt Verzeichnisse an und erzeugt eine `.env` aus der Vorlage.

**Was es nicht tut.** Es fragt nach keinem Passwort, verbindet kein Konto und
sendet nichts. Piper wird bewusst nicht automatisch geladen — die
Veröffentlichungen unterscheiden sich je nach Plattform, und ein falsch
geratener Download wäre schlimmer als ein Hinweis.

**Was du erwartest.** Am Ende „Einrichtung abgeschlossen" und eine Liste der
nächsten Schritte. Dauer: 10 bis 30 Minuten, meist wegen der Modelle.

**Wichtig.** Das Skript überschreibt nichts. Findet es einen vorhandenen
Ordner, sichert es ihn datiert weg. Mehrfaches Ausführen ist unbedenklich.

**Rückgängig.** `rm -rf vendor models node_modules` — die `.env` bleibt.

### 2.3 PINs festlegen

```bash
pnpm hash:pin    # einmal für die Anmelde-PIN
pnpm hash:pin    # einmal für die Freigabe-PIN
```

**Warum zwei.** Die **Anmelde-PIN** beweist am Anfang eines eingehenden
Anrufs, dass du es bist. Die **Freigabe-PIN** gibt einen einzelnen Versand
frei. Wären sie gleich, würde eine mitgehörte Anmeldung gleichzeitig die
Versandfreigabe verraten.

**Was du erwartest.** Die Eingabe bleibt unsichtbar. Herauskommt ein
scrypt-Hash. Die PIN selbst wird nirgends gespeichert und steht nicht in der
Shell-Historie.

**Danach.** Die beiden Hashes in den Schlüsselbund legen — die Befehle gibt
das Skript aus.

**Rückgängig.** Neue PIN erzeugen und den Eintrag im Schlüsselbund
überschreiben.

### 2.4 Messen, welches Sprachmodell taugt

```bash
pnpm bench:speech
```

**Warum messen statt raten.** Ob `small` oder `medium` besser ist, hängt an
der Maschine. Auf einem Apple-Silicon-Mac mit Metal sieht das anders aus als
auf einem kleinen Linux-Rechner. Im Projekt steht deshalb **keine**
Modellempfehlung — sie wäre geraten.

**Was du erwartest.** Pro Modell den Real-Time-Factor (unter 1 heißt:
schneller als das Gespräch) und die Latenz.

**Für die Erkennungsgenauigkeit** brauchst du echte Aufnahmen: WAV-Dateien
unter `var/bench/`, dazu je eine `.txt` mit dem korrekten Text. Dann wird die
Wortfehlerrate mitgemessen. Ohne diese Dateien steht ausdrücklich „nicht
gemessen" im Bericht — eine erfundene Trefferquote wäre schlimmer als keine.

**Faustregel für die Auswahl:** das größte Modell, dessen Real-Time-Factor
noch klar unter 1 liegt. Bei einem RTF von 0,9 wartet Noah bei einem
5-Sekunden-Satz schon 4,5 Sekunden auf die Erkennung allein.

---

## 3. Ausprobieren, ohne dass etwas passiert

### 3.1 Ein Gespräch führen

```bash
pnpm simulate:call
```

Ein vollständiges Telefongespräch im Terminal. Was Jarvis sagt, steht da; was
du sagst, tippst du. Der Ablauf darunter ist echt: Eventstore, Jobqueue,
Approval Engine, Read-back, Freigabe.

Eingaben:
- normaler Text für das, was du sagst
- `#4711` für eine Tastatureingabe (die Raute gehört dazu)
- `tschuess` zum Auflegen

Am Ende ein Bericht: wie viele Gesprächszüge, wie viele Freigabevorgänge,
wie viele Nachrichten **tatsächlich** gesendet wurden, und ob die Audit-Kette
lückenlos ist.

### 3.2 Die Sicherheitsszenarien durchspielen

```bash
pnpm dry-run
```

Vier Szenarien: der Regelfall, ein schwaches „ja" statt „Ja, senden", eine
falsche PIN, und eine E-Mail mit einem Injection-Versuch. Erwartet wird genau
eine Sendung im ersten Fall und null in allen anderen. Weicht etwas ab,
bricht das Skript mit Fehlercode ab.

**Diesen Befehl vor jeder Scharfschaltung laufen lassen.**

---

## 4. E-Mail und Kalender verbinden

```bash
pnpm connect:microsoft
```

**Vorher.** Einmal eine App-Registrierung in deinem Microsoft-Konto anlegen.
Das Skript führt durch die Schritte. Wichtig: **öffentlicher Client, kein
Client Secret.** Ein Secret ließe sich auf deinem Rechner nicht geheim halten.

**Erwartete Berechtigungen** — mehr wird nicht verlangt:
`openid`, `profile`, `offline_access`, `User.Read`, `Mail.Read`, `Mail.Send`,
`Calendars.ReadWrite`.

Bewusst **kein** `Mail.ReadWrite`: damit könnte Jarvis E-Mails ändern oder
löschen. Soll er nicht, auch nicht versehentlich, auch nicht wenn eine Mail
ihn dazu auffordert.

**Was du prüfen solltest, bevor du zustimmst:**
- Steht `login.microsoftonline.com` in der Adresszeile?
- Wird der Name deiner eigenen Registrierung angezeigt?
- Werden genau die Berechtigungen oben verlangt?

**Was danach passiert.** Ein Refresh Token landet im Schlüsselbund. Jarvis
sieht dein Passwort nie.

**Prüfen.** `pnpm status` zeigt `microsoftConfigured: true`. Danach in der
`.env` `JARVIS_MODE=dry-run` setzen und `pnpm start` — es wird gelesen und
nichts gesendet.

**Rückgängig.**
```bash
pnpm tsx scripts/connect-microsoft.ts --trennen
```
Zusätzlich unter https://myaccount.microsoft.com die Berechtigung entziehen.

---

## 5. Telefonie einrichten

```bash
pnpm configure:gateway
```

**Was das tut.** Fragt die Werte vom Gateway ab und erzeugt vier
Asterisk-Konfigurationsdateien unter `infra/asterisk/erzeugt/`.

**Was es nicht tut.** Es kopiert nichts nach `/etc` und trägt kein Passwort
ein. Überall, wo `BITTE-EINTRAGEN` steht, gehört ein Wert vom Gerät hin.

**Was in den Dateien steht — und warum:**

- `pjsip.conf`: Trunk zum Gateway, A-law bevorzugt (Standard in Deutschland),
  DTMF als RFC-2833-Ereignisse. Inband-Töne überstehen die Codec-Wandlung
  nicht zuverlässig — und ohne zuverlässiges DTMF gibt es keine Freigabe.
- `extensions.conf`: eingehend geht alles nach Stasis, also in die Anwendung.
  Ausgehend ist **nur Noahs Nummer** wählbar; jede andere wird abgewiesen.
  Das ist die zweite Sicherung hinter der Allowlist im Code.
- `ari.conf`, `http.conf`: Zugang der Anwendung, ausschließlich auf
  `127.0.0.1`. Wer ARI von außen erreichbar macht, gibt die Telefonanlage her.

**Danach:**
```bash
sudo cp infra/asterisk/erzeugt/*.conf /etc/asterisk/
sudo chown asterisk:asterisk /etc/asterisk/*.conf
sudo chmod 640 /etc/asterisk/*.conf
sudo asterisk -rx "core reload"

asterisk -rx "pjsip show registrations"   # erwartet: Registered
asterisk -rx "pjsip show endpoints"       # erwartet: Avail
```

**Erster Testanruf.** Ruf die Jarvis-Nummer von deinem Handy an. Erwartet:
Jarvis fragt nach der PIN, danach kommt „Moin, mein Achi …".

**Wenn nichts passiert**, siehe Fehlerhandbuch, Abschnitt „Telefonie".

**Achtung: dieser Teil ist noch nie an echter Hardware gelaufen.** Der
Adapter ist gegen die Protokollbeschreibung geschrieben. Was zu prüfen ist,
steht in `docs/api-annahmen.md`, Abschnitt Asterisk.

---

## 6. WhatsApp verbinden

```bash
pnpm connect:whatsapp
```

**Die entscheidende Frage vorab.** Eine Nummer, die heute in der
WhatsApp-Business-**App** läuft, kann nicht einfach parallel über die Cloud
API bedient werden. Meta bietet dafür ein Coexistence- bzw.
Migrationsverfahren an. Welche Variante für deine Nummer gilt, steht im
WhatsApp Manager. **Vor dem Umstellen klären** — eine falsch migrierte Nummer
ist in der App weg.

**Und noch etwas, das keine Software ändern kann:** Nachrichten, die vor der
Anbindung angekommen sind, lassen sich über die Cloud API **nicht**
rückwirkend abrufen. Jarvis kennt nur, was ab der Anbindung hereinkommt.

**Das Antwortfenster.** Frei formulierten Text darf ein Unternehmen nur
innerhalb eines begrenzten Zeitraums nach der letzten Kundennachricht senden
(aktuell als 24 Stunden konfiguriert). Danach sind nur genehmigte Vorlagen
zulässig. Jarvis prüft das **vor** dem Senden und sagt dir, wenn das Fenster
zu ist, statt es beim Provider auflaufen zu lassen.

**Webhook.** Meta braucht eine öffentlich erreichbare HTTPS-Adresse. Der
Endpunkt selbst lauscht nur lokal; davor gehört ein Reverse Proxy — siehe
`infra/systemd/firewall.md`. Ohne Webhook funktioniert alles andere weiter,
nur WhatsApp-Nachrichten erreichen Jarvis dann nicht.

---

## 7. Scharfschalten

**Reihenfolge einhalten.** Jeder Schritt ist einzeln umkehrbar.

1. `pnpm dry-run` — alle vier Szenarien müssen `ok` sein.
2. `pnpm start` mit `JARVIS_MODE=dry-run`, ein paar Stunden laufen lassen.
   `pnpm status` sollte gefundene Ereignisse zeigen und **null** Sendungen.
3. `pnpm logs:safe` durchsehen. Es darf keine Adresse, keine Rufnummer und
   kein Token im Klartext auftauchen.
4. Erst dann in der `.env`:
   ```
   JARVIS_MODE=live
   JARVIS_DB_CIPHER=true
   NODE_ENV=production
   ```
   Ohne `JARVIS_DB_CIPHER=true` **startet Jarvis im Live-Betrieb nicht** —
   in der Datenbank stehen personenbezogene Daten.
5. **Erster echter Versand: an dich selbst.** Ruf Jarvis an, lass ihn eine
   Mail an deine eigene Adresse entwerfen, gib sie vollständig frei. Prüfe,
   dass genau **eine** Mail ankommt.

**Zurück in den sicheren Zustand:** `JARVIS_MODE=dry-run`, Neustart. Es wird
sofort nichts mehr gesendet.

---

## 8. Dauerbetrieb auf dem Linux-Rechner

Der Mac reicht zum Entwickeln und Ausprobieren. Für 24/7 gehört Jarvis auf
einen kleinen Rechner, der immer läuft.

```bash
sudo useradd -r -m -d /opt/jarvis-pro jarvis
sudo -u jarvis git clone <repo> /opt/jarvis-pro
cd /opt/jarvis-pro/JARVIS-PRO
sudo -u jarvis pnpm setup

# Geheimnisse neu hinterlegen - sie sind NICHT Teil einer Sicherung.
sudo -u jarvis pnpm connect:microsoft
sudo -u jarvis pnpm connect:whatsapp
sudo -u jarvis pnpm hash:pin

sudo cp infra/systemd/jarvis.service /etc/systemd/system/
sudo cp infra/systemd/jarvis-backup.* /etc/systemd/system/
sudo cp infra/systemd/logrotate-jarvis /etc/logrotate.d/jarvis
sudo systemctl daemon-reload
sudo systemctl enable --now jarvis jarvis-backup.timer

systemctl status jarvis
journalctl -u jarvis -f
```

Firewall nicht vergessen: `infra/systemd/firewall.md`. Die Gegenprobe dort
(`nmap` von einem anderen Rechner) gehört dazu — sie dauert eine Minute und
verhindert den peinlichsten aller Fehler.

---

## 9. Sichern und Wiederherstellen

```bash
pnpm backup                          # sichert nach backups/
pnpm restore backups/jarvis-<stand>  # spielt zurück
```

**Was gesichert wird.** Die Datenbank (konsistent, auch im laufenden Betrieb
— `VACUUM INTO`, nicht eine bloße Dateikopie; bei aktivem WAL wäre die
unvollständig) und die `.env`.

**Was ausdrücklich nicht gesichert wird.** Geheimnisse. Die liegen im
Schlüsselbund. Auf einem neuen Rechner müssen die Konten neu verbunden und
die PINs neu hinterlegt werden.

**`restore` überschreibt nichts blind:** der aktuelle Stand wird vorher
weggesichert, und die Sicherung wird auf Unversehrtheit geprüft.

Auf dem Linux-Host läuft die Sicherung nachts um 3 über den systemd-Timer.

---

## 10. Alltag

| Befehl | Wofür |
|---|---|
| `pnpm status` | Betriebszustand, offene Ereignisse, Jobs, Freigaben, Audit-Kette |
| `pnpm doctor` | wenn etwas nicht startet |
| `pnpm logs:safe` | Logs ansehen, ohne dass Vertrauliches sichtbar wird |
| `journalctl -u jarvis -f` | Logs auf dem Linux-Host |
| `pnpm simulate:call` | nach jeder Änderung: verhält es sich noch richtig? |
| `pnpm test` | nach jeder Änderung am Code |

### Wenn du Jarvis sofort stoppen willst

```bash
# Linux
sudo systemctl stop jarvis

# Mac
launchctl unload ~/Library/LaunchAgents/de.hermservice.jarvis.plist
```

Laufende Anrufe werden beendet, Ereignisse bleiben in der Datenbank stehen
und gehen nicht verloren.

### Wenn Jarvis nur aufhören soll anzurufen

In der `.env`:
```
CALL_ON_EVERY_NEW_EMAIL=false
CALL_ON_EVERY_NEW_WHATSAPP=false
```
Neu starten. Neue Nachrichten werden weiter gesammelt und beim nächsten
Gespräch genannt — sie gehen nicht verloren.

---

## 11. Was Jarvis kann und was nicht

**Kann er:**
Nachrichten melden und vorlesen, zusammenfassen, Antworten entwerfen und nach
vollständiger Freigabe senden, Termine anlegen, suchen, verschieben und
absagen, Aufgaben führen, sich Bestätigtes merken, unterbrochen werden, sich
korrigieren lassen.

**Kann er nicht — und soll er nicht:**
Ohne Freigabe senden. Jemand anderen als dich anrufen. E-Mails oder Termine
löschen. Zugangsdaten nennen. Anweisungen aus fremden Nachrichten befolgen.
Mehrere Nachrichten auf einmal freigeben lassen. Sich dauerhaft eine
Sendeerlaubnis erteilen lassen.

**Kann er nicht — technisch:**
Erreichbar sein, wenn der Rechner aus ist. Alte WhatsApp-Nachrichten aus der
App nachholen. Außerhalb des Antwortfensters frei formulierten Text an
WhatsApp senden.
