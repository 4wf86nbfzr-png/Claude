# Ungeprüfte API-Annahmen

**Diese Liste vor dem ersten Live-Einsatz abarbeiten.**

Der Netzwerk-Proxy der Entwicklungsumgebung, in der dieser Code entstanden ist,
sperrt `learn.microsoft.com`, `graph.microsoft.com`, `login.microsoftonline.com`
und `developers.facebook.com` bzw. `graph.facebook.com` vollständig
(HTTP 403 beim CONNECT). Ein Abgleich mit der Primärdokumentation und ein
Live-Aufruf waren dort deshalb **nicht möglich**.

Was hier steht, ist gegen die Dokumentation angelegt, wie sie über die Suche
zugänglich war — nicht gegen eine laufende API bestätigt. Jeder Punkt ist
`unverified`, bis er auf einem Rechner mit freiem Netzzugang geprüft wurde.

Alle veränderlichen Werte stehen bewusst in **einem** Konstantenblock pro
Adapter, nicht über den Code verteilt. Eine Korrektur ist damit eine Zeile.

---

## Microsoft Graph

Konstanten: `packages/connectors/src/microsoft/oauth.ts` (`MS_ENDPOINTS`,
`MS_SCOPES`), `.../graph-mail.ts` (`GRAPH_PATHS`),
`.../graph-calendar.ts` (`GRAPH_CALENDAR_PATHS`).

| # | Annahme | Wie prüfen | Status |
|---|---------|------------|--------|
| M1 | Autorisierung: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` | Doku „Microsoft identity platform and OAuth 2.0 authorization code flow" | offen |
| M2 | Token: `.../oauth2/v2.0/token`, Body `application/x-www-form-urlencoded` | dieselbe Seite | offen |
| M3 | Öffentlicher Client **ohne** Client Secret, mit PKCE `S256` | Doku „Application types"; über die Suche bestätigt, aber nicht live geprüft | offen |
| M4 | Refresh Token wird rotiert und muss nach jeder Erneuerung neu gespeichert werden | Verhalten beim zweiten Refresh beobachten | offen |
| M5 | Berechtigungsnamen `Mail.Read`, `Mail.Send`, `Calendars.ReadWrite`, `offline_access`, `User.Read` | Graph-Permissions-Referenz | offen |
| M6 | Delta: `GET /me/mailFolders('inbox')/messages/delta` | Doku „message: delta" | offen |
| M7 | Seitensteuerung über `Prefer: odata.maxpagesize=N` | dieselbe Seite | über Suche bestätigt |
| M8 | Fortsetzung über `@odata.nextLink`, Endstand über `@odata.deltaLink`, beide **verbatim** weiterverwenden | dieselbe Seite | über Suche bestätigt |
| M9 | Gelöschte Einträge tragen `@removed` | Delta-Antwort im Testpostfach ansehen | offen |
| M10 | Senden: `POST /me/sendMail` mit `{ message, saveToSentItems }`, Antwort `202` **ohne** Nachrichten-ID | Doku „user: sendMail" | offen |
| M11 | `internetMessageHeaders` ist bei `sendMail` zulässig und Header mit `X-`-Präfix werden akzeptiert | Testmail senden, Kopfzeilen im Postausgang prüfen | offen |
| M12 | Kalender: `POST /me/events` mit `start/end` als `{ dateTime, timeZone }` | Doku „Create Event" | offen |
| M13 | `GET /me/calendarView?startDateTime=&endDateTime=` mit `Prefer: outlook.timezone` | Doku „calendarView" | offen |
| M14 | Graph liefert `dateTime` mit sieben Nachkommastellen (`2026-05-07T14:00:00.0000000`) | Antwort ansehen; `trimSeconds()` schneidet ab | offen |

**Bekannte Lücke:** Graph kennt für `sendMail` keinen Idempotenzschlüssel.
Ein Netzwerkabbruch nach dem Absenden lässt offen, ob die Mail raus ist.
Der Adapter meldet in dem Fall `unknown`, und Jarvis sagt Noah genau das,
statt Erfolg oder Misserfolg zu behaupten. **Nicht automatisch wiederholen.**

---

## WhatsApp Business Cloud API

Konstanten: `packages/connectors/src/whatsapp/cloud-api.ts` (`WhatsAppConfig`),
Version über `WHATSAPP_GRAPH_VERSION` in der `.env`.

| # | Annahme | Wie prüfen | Status |
|---|---------|------------|--------|
| W1 | Senden: `POST https://graph.facebook.com/{version}/{phone-number-id}/messages` | Doku „Cloud API Reference / Messages" | über Suche bestätigt |
| W2 | Nutzlast `{ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body } }` | dieselbe Seite | über Suche bestätigt |
| W3 | Antwort enthält `messages[0].id` (`wamid....`) | Testnachricht senden | offen |
| W4 | Empfängernummer ohne führendes `+`, nur Ziffern | dieselbe Seite | offen |
| W5 | Webhook-Signatur im Header `X-Hub-Signature-256` als `sha256=<hex>` über den **Roh**-Body mit dem App Secret | Doku „Webhooks / Validating Payloads" | offen |
| W6 | Handshake über `hub.mode`, `hub.verify_token`, `hub.challenge` | dieselbe Seite | offen |
| W7 | Länge des Kundendienstfensters (aktuell als 24 Stunden konfiguriert) | Doku „Pricing / Conversation types" — **Meta hat diese Regel mehrfach geändert** | offen |
| W8 | Aktuelle Graph-Version (`v23.0` als Vorgabe) | Changelog der Graph API | offen |
| W9 | Ob Noahs bestehende Nummer direkt anbindbar ist oder über Coexistence bzw. Migration laufen muss | WhatsApp Manager, Doku „Coexistence" | **offen und kaufentscheidend** |
| W10 | Eine auf der Cloud API registrierte Nummer ist für die WhatsApp-Business-App gesperrt und muss vorher von allen Geräten abgemeldet sein | über Suche bestätigt; vor der Registrierung selbst gegenlesen — **nicht ohne Weiteres rückgängig** | über Suche bestätigt |
| W11 | Eingehende Nachrichten von Noahs eigener Nummer erscheinen im selben `messages`-Feld wie Kundennachrichten und lassen sich über `from` unterscheiden | erste Testnachricht an die Jarvis-Nummer, Webhook-Nutzlast ansehen | offen |
| W12 | Ein Versand außerhalb des Antwortfensters wird von Meta mit einem Fehler quittiert und nicht still verworfen | bewusst außerhalb des Fensters senden, Antwort ansehen | offen |
| W13 | Nachrichten ohne Text (Bild, Sprachnachricht) kommen als eigener `type` und tragen keinen `text.body` | ein Bild an die Jarvis-Nummer schicken | offen |

**Ausdrücklich keine Zusage:** Nachrichten, die vor der Anbindung in der
WhatsApp-Business-App angekommen sind, lassen sich über die Cloud API **nicht**
rückwirkend abrufen. Jarvis kennt nur, was ab der Anbindung über den Webhook
hereinkommt. Das ist keine Einschränkung dieser Implementierung, sondern der
Schnittstelle.

---

## Asterisk

Konstanten: `apps/telephony/src/asterisk.ts`, `infra/asterisk/`.

| # | Annahme | Wie prüfen | Status |
|---|---------|------------|--------|
| A1 | ARI-Ereignisstrom über `ws://host:8088/ari/events?app=&api_key=user:pass` | `asterisk -rx "ari show status"`, Doku der installierten Version | offen |
| A2 | `POST /ari/channels/externalMedia` mit `encapsulation: audiosocket`, `transport: tcp`, `connection_type: client`, `format: slin` | Doku der installierten Version — die Parameter sind über Versionen gewachsen | offen |
| A3 | AudioSocket-Rahmen: 1 Byte Typ, 2 Byte Länge (big endian), Typen `0x00` Ende, `0x01` UUID, `0x10` Audio, `0xff` Fehler | Quelltext `res_audiosocket.c` der installierten Version | offen |
| A4 | Audio als SLIN 8 kHz, 20-ms-Blöcke (320 Byte) | Mitschnitt am Socket | offen |
| A5 | Ein WebSocket-Transport für `externalMedia` ist in der installierten Version **nicht** vorgesehen | Doku der Version; falls doch, ist der Adapter dafür vorbereitet | offen |
| A6 | DTMF kommt als `ChannelDtmfReceived` mit `digit` | Testanruf | offen |

---

## Anthropic

| # | Annahme | Wie prüfen | Status |
|---|---------|------------|--------|
| C1 | `@anthropic-ai/claude-agent-sdk` in Version `0.3.250` bietet `query()`, `tool()` und `createSdkMcpServer()` | im Paket selbst nachgesehen — **bestätigt** | erledigt |
| C2 | Modellkennung für den Betrieb | aktuelle Modellliste in der Anthropic-Doku | offen |

Das Gehirn liegt hinter dem Interface `Brain`. Die Werkzeugausführung und der
gesamte Freigabeablauf sind über `ScriptedBrain` getestet und hängen nicht
davon ab, welches Modell antwortet.
