# API

Basis: `/api/v1`. Alle Antworten sind JSON. Vollständige, generierte Spezifikation:
`pnpm openapi` → `docs/openapi.json` (außerdem unter `GET /api/v1/openapi.json`).

## Authentifizierung

- **API-Schlüssel** (externe Integrationen): `Authorization: Bearer drx_…`.
  Schlüssel werden unter *Einstellungen → API-Schlüssel* mit eingeschränkten Scopes erstellt.
- **Sitzung** (eigene Oberfläche): Cookie `drx_session`.

Jeder Schlüssel gehört genau einem Mandanten; Daten anderer Mandanten sind nicht erreichbar.

## Konventionen

| Thema           | Regel                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Request-ID      | Antwort-Header `x-request-id`; eigener Wert per Request-Header möglich |
| Fehler          | `{ "error": { "code", "message", "details"? }, "requestId" }`         |
| Statuscodes     | 400 validation_error · 401 unauthorized · 403 forbidden · 404 not_found · 409 conflict · 422 idempotency_mismatch · 429 rate_limited · 500 internal_error |
| Pagination      | `?page=1&pageSize=25` → `{ items, page, pageSize, total, totalPages }` |
| Sortierung      | `?sort=<feld>&dir=asc|desc` (erlaubte Felder je Endpunkt)              |
| Filter          | je Endpunkt dokumentiert (z. B. `status`, `from`, `to`, `q`)           |
| Idempotenz      | Header `Idempotency-Key` bei POST; gleiche Antwort für 24 h, anderer Body → 422 |
| Rate-Limit      | Standard 300 Anfragen/Minute je Client; `Retry-After` bei 429          |
| Zeiten          | ISO 8601 mit Zeitzone (UTC in Antworten)                               |

## Ressourcen (v1)

| Ressource               | Endpunkte                                                                 | Scope          |
| ----------------------- | ------------------------------------------------------------------------- | -------------- |
| Kundenanfragen          | `GET/POST /customer-requests`, `GET/PATCH /customer-requests/{id}`        | requests:*     |
| Kunden                  | `GET/POST /customers`, `GET/PATCH /customers/{id}`                        | customers:*    |
| Mitarbeiter             | `GET/POST /employees`, `GET/PATCH /employees/{id}`                        | employees:*    |
| Veranstaltungen         | `GET/POST /events`, `GET/PATCH /events/{id}`, `POST /events/{id}/positions` | events:*     |
| Positionen              | `GET /positions/{id}`, `PATCH /positions/{id}`                            | events:*       |
| Schichten               | `GET /shifts`, `POST /shifts`, `GET/PATCH /shifts/{id}`, `POST /shifts/{id}/assign`, `POST /shifts/{id}/respond` | shifts:* |
| Verfügbarkeiten         | `GET /availability`, `POST /availability`                                 | availability:* |
| Partner                 | `GET /partners`, `GET /partner-offers`, `POST /partner-offers/{id}/respond` | partners:*   |
| Zeitnachweise           | `POST /time-records/import` (CSV/XLSX/JSON), `GET /time-records`          | time:import    |
| Abgleich                | `GET /reconciliation-reports`, `GET /reconciliation-items`, `POST /reconciliation-items/{id}/approve` | time:* |
| Dokumente               | `GET /documents`, `POST /documents` (multipart), `GET /documents/{id}/download` | documents:* |
| Benachrichtigungen      | `GET /notifications`                                                      | —              |
| Webhooks                | `GET/POST /webhooks`, `DELETE /webhooks/{id}`, `GET /webhooks/{id}/deliveries` | webhooks:manage |
| Health                  | `GET /api/health` (öffentlich)                                            | —              |

Welche Endpunkte bereits implementiert sind, steht in PROJECT_STATUS.md.

## Webhooks (ausgehend)

Header: `X-DispoRex-Signature: t=<unix>,v1=<hmac_sha256(secret, "<t>.<body>")>`,
`X-DispoRex-Event`, `X-DispoRex-Delivery`. Empfänger sollten Signaturen mit Toleranz
(z. B. 5 Minuten) prüfen und Delivery-IDs gegen Wiederholung speichern.

Ereignistypen: `customer_request.created`, `event.created`, `event.updated`,
`shift.created`, `shift.declined`, `shift.filled`, `time_import.completed`,
`reconciliation.deviation`, `reconciliation.corrected`.

## Beispiel

```bash
curl -X POST https://<host>/api/v1/customer-requests \
  -H "Authorization: Bearer drx_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: website-form-8a71" \
  -d '{
    "title": "Firmenfeier Hafencity",
    "contactName": "M. Beispiel",
    "contactEmail": "m.beispiel@example.com",
    "startsAt": "2026-11-20T17:00:00+01:00",
    "endsAt": "2026-11-21T01:00:00+01:00",
    "locationText": "Hamburg, Am Sandtorkai 1",
    "headcount": 6,
    "description": "4x Einlass, 2x Garderobe"
  }'
```
