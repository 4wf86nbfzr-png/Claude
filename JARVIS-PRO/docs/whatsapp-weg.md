# Jarvis über WhatsApp

Der Weg ohne Telefonanlage: Jarvis wird per WhatsApp bedient. Kein SIP,
kein Asterisk, keine Spracherkennung, keine Sprachausgabe — und trotzdem
dieselben Freigaberegeln wie am Telefon.

---

## Was sich ändert und was nicht

**Es ändert sich nur der Kanal.** Die fünf Bedingungen für einen Versand
gelten unverändert:

1. der vollständige Read-back — im Chat geschrieben statt vorgelesen,
2. das ausdrückliche „Ja, senden" — ein blosses „ja" reicht weiterhin nicht,
3. der zweite Faktor,
4. unveränderter Inhalt (SHA-256-Bindung),
5. eine Freigabe, die weder abgelaufen noch schon benutzt ist.

Fehlt einer der fünf Punkte, wird nichts gesendet. Dafür gibt es 14 eigene
End-to-End-Tests für den Chatweg, zusätzlich zu den 46 der Freigabe-Engine.

**Was wegfällt:** das Gateway, die SIM, Asterisk, whisper.cpp, Piper, die
Messung des Sprachmodells und der erste Testanruf. Das sind fünf der
fünfzehn Startschritte — und die fünf langwierigsten.

**Was dazukommt:** ein Meta-Business-Konto und eine Nummer, die auf der
Cloud API registriert ist.

---

## Die Entscheidung, die vorher fällt

> **Eine Nummer, die auf der WhatsApp Cloud API registriert ist, lässt sich
> nicht mehr in der WhatsApp-Business-App verwenden.** Sie muss vor der
> Registrierung von allen Geräten abgemeldet sein.

Das ist keine Einstellung, sondern eine Eigenschaft der Plattform. Daraus
folgen zwei Wege, und sie führen zu unterschiedlichen Jarvis-Versionen:

### Weg 1 — die HERM-Geschäftsnummer wandert auf die Cloud API

| | |
|---|---|
| Jarvis sieht | Kundennachrichten **und** E-Mails |
| Ihr verliert | die WhatsApp-Business-App auf dem Handy |
| Kundenchats laufen dann | über die Cloud API, also über Jarvis bzw. ein eigenes Fenster |
| Geeignet, wenn | die Pflichtfrage „Hast du alle WhatsApp-Business-Nachrichten beantwortet?" wörtlich gemeint ist |

Das ist der Vollausbau — und der einzige Weg, auf dem Jarvis das kann, was
im ursprünglichen Auftrag steht. Der Preis ist echt: die gewohnte App auf
dem Handy ist danach für diese Nummer weg. Wer heute Kundenanfragen dort
beantwortet, muss das vorher durchdenken.

### Weg 2 — eine neue, separate Nummer nur für Jarvis

| | |
|---|---|
| Jarvis sieht | nur E-Mails |
| Ihr behaltet | die WhatsApp-Business-App unverändert |
| Die Jarvis-Nummer dient | ausschliesslich als Bedienkanal |
| Geeignet, wenn | erst einmal ausprobiert werden soll, ob das im Alltag trägt |

**Empfehlung: mit Weg 2 anfangen.** Er ist rückgängig zu machen, kostet
nichts an bestehendem Betrieb, und wenn Jarvis sich bewährt, lässt sich die
Geschäftsnummer später nachziehen. Am Code ändert sich dabei nichts — nur
`WHATSAPP_PHONE_NUMBER_ID` in der `.env`.

---

## Einrichtung

Ich kann von hier aus die Meta-Oberfläche nicht aufrufen; die
Menüführung ändert sich dort regelmässig. Was unten steht, sind die
**Schritte der Sache nach** — die genauen Knopfnamen stehen in Metas
eigener Dokumentation.

1. **Meta-Business-Konto** anlegen bzw. das vorhandene benutzen
   (business.facebook.com).
2. **App vom Typ Business** anlegen und das Produkt *WhatsApp* hinzufügen
   (developers.facebook.com).
3. **Rufnummer hinzufügen und verifizieren.** Für Weg 2 eine neue Nummer,
   die nirgends in WhatsApp aktiv ist. Eine Festnetznummer geht auch — die
   Verifizierung läuft dann per Anruf.
4. **Permanenten Zugriffsschlüssel erzeugen** (System User Token). Der
   temporäre Testschlüssel läuft nach 24 Stunden ab und taugt nicht für den
   Betrieb.
5. **Webhook eintragen.** Adresse ist dein Rechner von aussen erreichbar,
   Feld `messages` abonnieren. Der Verifizierungs-Token ist frei wählbar und
   muss auf beiden Seiten gleich sein.

Danach:

```bash
pnpm connect:whatsapp    # legt Schlüssel und Token in den Schlüsselbund
pnpm doctor              # prüft, was da ist. Ändert nichts.
```

### Was in die `.env` gehört

```ini
JARVIS_KANAL=chat                    # telefon | chat | beide
JARVIS_OWNER_WA_ID=491771459965      # deine Nummer, ohne Plus
WHATSAPP_PHONE_NUMBER_ID=...         # aus der Meta-Oberfläche
WHATSAPP_WABA_ID=...                 # aus der Meta-Oberfläche
JARVIS_CHAT_SECOND_FACTOR=pin        # pin | totp - siehe unten
```

Bei `JARVIS_KANAL=chat` sind die Rufnummern nicht mehr Pflicht. Die
Konfiguration weist es ab, wenn `JARVIS_OWNER_WA_ID` fehlt — sonst wüsste
Jarvis nicht, von wem er überhaupt Anweisungen annehmen darf.

---

## Der zweite Faktor: PIN oder Einmalcode

Am Telefon wird die Freigabe-PIN gewählt und ist danach weg. Im Chat nicht:
**eine getippte PIN bleibt im Nachrichtenverlauf stehen.** Wer später Zugriff
auf das Handy oder das WhatsApp-Konto hat, liest sie dort ab — und damit ist
sie kein zweiter Faktor mehr, sondern ein Ritual.

| | `pin` (Standard) | `totp` |
|---|---|---|
| Einrichtung | keine — du hast sie schon | Authenticator-App, einmalig |
| Im Verlauf sichtbar | ja, dauerhaft gültig | ja, aber nach 30 Sekunden wertlos |
| Schützt gegen | wenig, wenn das Konto übernommen ist | auch dann noch |

Die Einmalcodes sind nach RFC 6238 implementiert und gegen die offiziellen
Testvektoren des RFC geprüft. Ein einmal benutzter Code wird für sein
Zeitfenster gesperrt.

Umstellen: `JARVIS_CHAT_SECOND_FACTOR=totp`. Ausprobieren, ohne etwas zu
ändern:

```bash
pnpm simulate:chat email totp
```

Der Simulator zeigt das Geheimnis und die `otpauth://`-Adresse an; mit
`code` als Eingabe setzt er den gerade gültigen Code selbst ein.

---

## Das Antwortfenster

WhatsApp erlaubt einem Unternehmen frei formulierten Text nur innerhalb
eines begrenzten Zeitraums nach der letzten Nachricht des Gegenübers.
Danach wären nur noch von Meta genehmigte Vorlagen zulässig.

**Jarvis braucht dafür keine Vorlage.** Kommt eine Mail herein, während das
Fenster zu ist, passiert Folgendes:

1. Das Ereignis wird gespeichert und bleibt **ungenannt**.
2. Jarvis versucht zu schreiben, der Versand scheitert, nichts geht verloren.
3. Sobald du das nächste Mal irgendetwas schreibst, ist das Fenster offen —
   und der Rückstau kommt sofort nach.

Der Preis: solange du nicht schreibst, erfährst du nichts. Wer eine
Sofortmeldung rund um die Uhr will, braucht eine genehmigte Vorlage; der
Versandweg dafür ist vorbereitet, die Vorlage selbst muss bei Meta
beantragt werden.

---

## Drei Dinge, die man von Anfang an wissen sollte

**1. Alte Nachrichten lassen sich nicht nachholen.**
Was vor der Anbindung in der WhatsApp-Business-App ankam, ist über die Cloud
API nicht rückwirkend abrufbar. Eigenschaft der Schnittstelle, nicht dieser
Software.

**2. Ein schlafender Mac ist nicht erreichbar.**
Der Webhook läuft ins Leere; Meta wiederholt die Zustellung eine Weile, aber
nicht ewig. Für den Dauerbetrieb gehört Jarvis auf einen kleinen
Linux-Rechner (`infra/systemd/`).

**3. Der Webhook muss von aussen erreichbar sein.**
Meta ruft dich an, nicht umgekehrt. Ohne erreichbare Adresse kommt nichts an.
Das ist der eine Punkt, an dem der Chatweg *mehr* Netzwerkarbeit macht als
der Telefonweg.

---

## Ausprobieren, bevor irgendetwas verbunden ist

```bash
pnpm simulate:chat              # vollständiger Dialog im Terminal
pnpm simulate:chat email totp   # dasselbe mit Einmalcodes
pnpm simulate:chat whatsapp     # Anlass ist eine WhatsApp-Nachricht
```

Es geht dabei nichts an WhatsApp, an Meta oder an einen Empfänger. Wer
prüfen will, dass wirklich nichts durchrutscht: einfach „ja" statt
„Ja, senden" antworten, oder eine falsche PIN eingeben. Am Ende steht immer
`Tatsaechlich versendet: 0`.
