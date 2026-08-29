# Eine VoIP-Nummer für Jarvis

Der zweite Weg zu einer Rufnummer — statt eigener SIM in eigener Hardware
eine Nummer beim VoIP-Anbieter. Für die Software ist das derselbe SIP-Trunk;
`pnpm configure:gateway` fragt beim Start, welchen Weg du gehst.

**Warum das hier steht:** der Gateway-Weg blockiert alles Telefonische, bis
ein Gerät gekauft, geliefert und eingerichtet ist. Eine VoIP-Nummer gibt es
am selben Tag. Der Preis dafür steht weiter unten und wird nicht schöngeredet.

---

## Was der Tarif können muss

Die meisten VoIP-Angebote richten sich an Leute mit einem Tischtelefon oder
einer App. Davon ist keins brauchbar. Jarvis braucht einen Anschluss, den
**eine eigene Telefonanlage** benutzen darf.

| Kriterium | Warum | Woran du es erkennst |
|---|---|---|
| **SIP-Zugangsdaten für eigene Geräte** | Asterisk muss sich anmelden können. | „SIP-Zugangsdaten", „freie Gerätewahl", „eigene Telefonanlage", „SIP-Trunk". Wenn nur die App des Anbieters genannt wird: unbrauchbar. |
| **DTMF nach RFC 2833 / 4733** | **Der kritischste Punkt.** Ohne zuverlässiges DTMF gibt es keine Freigabe-PIN und damit keinen Versand. | Steht selten auf der Verkaufsseite. Im Zweifel den Support fragen — die Frage steht unten. |
| **Eingehend UND ausgehend** | Jarvis muss dich zurückrufen können. Ein Anschluss, der nur eingehend kann, meldet dir nichts. | Ausgehend ist bei kostenlosen Tarifen meist Guthaben-basiert: aufladen, dann geht es. |
| **G.711 A-law** | Der Codec der deutschen Telefonstrecke. | Praktisch immer dabei. |
| **Eine deutsche Rufnummer** | Von deinem Handy aus normal anrufbar. | Orts- oder Mobilfunknummer, beides geht. |

Nicht nötig: Flatrates, Anrufbeantworter, Fax, Konferenzen, mehrere
Nebenstellen. Die Gesprächsführung macht Jarvis selbst.

---

## Anbieter

**Was ich hier nicht tue: Preise und Konditionen als sicher hinstellen.**
Ich habe von hier aus nur eingeschränkten Netzzugang und kann die Seiten
nicht vollständig gegenprüfen. Was unten steht, ist der Stand aus der
Anbieterdarstellung im August 2026 — vor der Anmeldung selbst nachlesen.

### sipgate basic — der übliche Einstieg

- Anmeldung: **https://www.sipgatebasic.de**
- Übersicht der Tarife: https://www.sipgate.de/preise
- Was die Anbieterseite angibt: keine Grundgebühr, keine Vertragslaufzeit,
  eine deutsche Ortsrufnummer inklusive, SIP-Zugangsdaten für eigene Geräte
  und Anlagen.
- Ausgehende Gespräche laufen über Guthaben und kosten pro Minute.
  „Kostenlos" heißt also: kein Monatsbeitrag, nicht kostenloses Telefonieren.
- Die SIP-Zugangsdaten stehen nach der Anmeldung in der Kontoverwaltung
  unter *VoIP-Zusatzanschlüsse* → *SIP-Zugangsdaten*. Genau diese vier
  Angaben braucht `pnpm configure:gateway`: SIP-Server, SIP-Benutzername,
  SIP-Passwort und die Rufnummer.

### Zum Vergleichen

easybell, dus.net und Placetel bieten ebenfalls SIP-Anschlüsse für eigene
Anlagen an. Ob dort aktuell etwas ohne Grundgebühr dabei ist, habe ich
**nicht geprüft** — dieser Absatz ist eine Suchhilfe, keine Empfehlung.

---

## Was du bei der Anmeldung erwarten kannst

- **Identitätsprüfung.** Für eine deutsche Rufnummer ist eine
  Adress- bzw. Ausweisprüfung üblich. Das kann einen Tag dauern.
- **Ortsnetz.** Eine geografische Nummer wird an deine Adresse gebunden —
  für Hamburg also eine 040er-Nummer.
- **AGB lesen, ein Punkt konkret:** ob der automatisierte Betrieb an einer
  eigenen Anlage erlaubt ist. Bei den meisten Anbietern ist das der
  Normalfall; ausschließen sollte man es trotzdem nicht ungelesen.

## Die Frage an den Support

> Ich betreibe eine eigene Asterisk-Anlage. Bekomme ich SIP-Zugangsdaten,
> mit denen sich die Anlage direkt registrieren kann, und wird DTMF
> out-of-band nach RFC 2833 / RFC 4733 übertragen?

Kommt darauf keine klare Antwort, ist es der falsche Tarif. Ohne DTMF gibt
es keine Freigabe-PIN, und ohne Freigabe-PIN sendet Jarvis nichts —
das ist keine Einstellung, die man wegdrehen könnte.

---

## Wenn die Zugangsdaten da sind

```bash
pnpm configure:gateway      # bei der Frage nach dem Weg: B
```

Danach liegen die Asterisk-Dateien unter `infra/asterisk/erzeugt/`. Das
Skript kopiert nichts nach `/etc` und trägt kein Passwort ein — das machst
du selbst, nachdem du die Dateien gelesen hast.

Gegenprobe:

```bash
asterisk -rx "pjsip show registrations"   # erwartet: Registered
asterisk -rx "pjsip show endpoints"       # erwartet: Avail
```

**Der häufigste Fehler beim VoIP-Weg:** der Anruf kommt zustande, aber
niemand hört etwas („Einwegaudio"). Dann fehlen die NAT-Angaben in
`[transport-udp]` — sie stehen als Kommentar in der erzeugten `pjsip.conf`.
Der Rest steht im [Fehlerhandbuch](fehlerhandbuch.md) unter „Telefonie".

---

## Der ehrliche Vergleich

| | Eigene SIM im Gateway | VoIP-Nummer |
|---|---|---|
| Anschaffung | Gerät kaufen | nichts |
| Laufend | dein Mobilfunktarif | Grundgebühr je nach Tarif, Gespräche nach Minute |
| Bis es läuft | Tage bis Wochen | Stunden |
| Nummer | deine bestehende SIM-Nummer | neue Nummer vom Anbieter |
| Wer sieht die Verbindungsdaten | dein Mobilfunkanbieter | dein VoIP-Anbieter |
| Einrichtungsrisiko | Gerät muss SIP und RFC 2833 können | NAT/Audio muss sitzen |

**Der Haken beim VoIP-Weg:** die ursprüngliche Anforderung war die eigene SIM
im eigenen Gateway — genau um keinen zusätzlichen Dritten in der Leitung zu
haben. Mit einer VoIP-Nummer sieht der Anbieter, wann und wie lange du mit
Jarvis sprichst. Den Inhalt sieht er nicht: Spracherkennung und Sprachausgabe
laufen lokal, aufgezeichnet wird nichts.

Beide Wege lassen sich später tauschen. Am Code ändert sich dabei nichts —
nur an `pjsip.conf`.
