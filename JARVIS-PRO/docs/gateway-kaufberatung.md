# Das Gateway aussuchen

Das GSM/VoLTE-Gateway ist der einzige Punkt, an dem ohne Kauf nichts
weitergeht. Alles andere lässt sich vorher erledigen.

**Was hier steht, sind Kriterien, keine Produktempfehlungen.** Ich kann von
hier aus keine aktuellen Angebote prüfen; ein Gerätename, den ich nicht
verifizieren kann, wäre geraten. Die Liste unten ist so gebaut, dass du sie
gegen eine Produktseite halten kannst.

---

## Was das Gerät können muss

### Zwingend — ohne das funktioniert es nicht

| Kriterium | Warum | Woran du es erkennst |
|---|---|---|
| **VoLTE / LTE** | 2G ist in Deutschland abgeschaltet. Ein reines 2G-Gateway ist Elektroschrott. | „VoLTE", „4G", „LTE" ausdrücklich in den technischen Daten. „GSM" allein reicht **nicht**. |
| **SIP-Registrierung** | Asterisk muss sich als SIP-Endpunkt anmelden können. | „SIP", „VoIP-Gateway", „FXS/SIP". Geräte, die nur per Hersteller-App laufen, sind unbrauchbar. |
| **Ein SIM-Slot genügt** | Jarvis braucht genau eine Nummer. | 1 Kanal reicht. Mehr kostet nur. |
| **G.711 A-law** | Der Codec der Telefonstrecke in Deutschland. | „G.711a", „PCMA". Fast immer dabei. |
| **DTMF nach RFC 2833 / RFC 4733** | **Der kritischste Punkt.** Ohne zuverlässiges DTMF gibt es keine Freigabe-PIN und damit keinen Versand. | „RFC2833", „RFC4733" oder „out-of-band DTMF" in den Daten. Wenn dort nur „Inband" steht: Finger weg. |

### Wichtig — sonst wird der Betrieb mühsam

| Kriterium | Warum |
|---|---|
| Web-Oberfläche im lokalen Netz | Du musst SIP-Benutzer, Passwort und Weiterleitung einstellen können. |
| Feste IP oder DHCP-Reservierung möglich | Asterisk identifiziert das Gateway über seine Adresse. |
| Firmware-Updates vom Hersteller | Ein Gerät ohne Updates hängt jahrelang am Netz. |
| Handbuch auf Deutsch oder Englisch | Du wirst hineinsehen müssen. |

### Nicht nötig — spar dir das Geld

Mehrere SIM-Slots, SMS-Gateway-Funktionen, Fax, Cloud-Anbindung des
Herstellers, eingebaute Voicemail. Jarvis macht die Gesprächsführung selbst;
alles, was das Gerät zusätzlich „intelligent" macht, steht nur im Weg.

---

## Die Frage, die du dem Verkäufer stellen solltest

> Kann sich das Gerät als SIP-Client bei einer eigenen Asterisk-Anlage im
> selben Netz registrieren, und gibt es DTMF nach RFC 2833 weiter?

Kommt darauf keine klare Antwort, ist es das falsche Gerät.

---

## Was du beim Anbieter klären musst

1. **Ist der Tarif für ein Gateway zugelassen?** Manche Prepaid- und
   Datentarife untersagen den Betrieb in „GSM-Gateways" oder
   „Rufumleitungsanlagen" in den AGB. Vor dem Einlegen der SIM prüfen — sonst
   droht eine Sperrung.
2. **Portierungssperre einrichten.** Wer die Jarvis-Nummer übernimmt, kann
   Jarvis' Anrufe entgegennehmen und hört, welche Nachrichten hereingekommen
   sind. Senden kann er nichts (dafür fehlt die Freigabe-PIN), aber
   mitzuhören reicht schon.
3. **VoLTE im Tarif freigeschaltet?** Bei manchen Prepaid-Tarifen ist es das
   nicht.

---

## Wenn das Gerät da ist

```bash
# 1. Gateway ins Netz, feste IP vergeben, Weboberfläche öffnen
# 2. SIP-Benutzer anlegen (Name und Passwort merken)
# 3. Eingehende Anrufe an diesen SIP-Benutzer weiterleiten
# 4. Dann:
pnpm configure:gateway
```

Das Skript fragt die Werte ab und erzeugt die Asterisk-Konfiguration unter
`infra/asterisk/erzeugt/`. Es kopiert nichts nach `/etc` und trägt kein
Passwort ein — das machst du selbst, nachdem du die Dateien gelesen hast.

**Die Gegenprobe nach der Einrichtung:**

```bash
asterisk -rx "pjsip show registrations"   # erwartet: Registered
asterisk -rx "pjsip show endpoints"       # erwartet: Avail
asterisk -rvvv                            # dann anrufen und zusehen
```

Kommt beim Anruf nichts in Asterisk an, liegt es am Gateway oder an der
Weiterleitung — nicht an Jarvis. Der Weg dorthin steht im Fehlerhandbuch
unter „Telefonie".

---

## Der ehrliche Hinweis zum Schluss

Der Asterisk-Adapter in diesem Projekt ist gegen die Protokollbeschreibung
geschrieben, aber **noch nie gegen eine laufende Asterisk-Instanz gelaufen** —
in der Umgebung, in der er entstanden ist, war keine installiert. Beim ersten
echten Testanruf ist deshalb mit Nacharbeit zu rechnen, besonders beim
Audiopfad (`externalMedia` / AudioSocket). Was zu prüfen ist, steht einzeln in
[`api-annahmen.md`](api-annahmen.md), Abschnitt Asterisk.

Das ist kein Grund zu warten — es ist ein Grund, den ersten Testanruf
einzuplanen, statt ihn als Formsache zu betrachten.
