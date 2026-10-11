# Roadmap

Reihenfolge entspricht dem Umsetzungsplan; Status in PROJECT_STATUS.md.

| Phase | Inhalt | Status |
| ----- | ------ | ------ |
| 1 | Grundlage: Architektur, Schema, RLS, Auth, Rollen, Designsystem, Dashboard-Gerüst | abgeschlossen |
| 2 | Personal, Kunden, Veranstaltungen, Positionen, Schichten, Kalender, Qualifikationen, Konflikterkennung | abgeschlossen |
| 3 | Verfügbarkeiten, Rückmeldeprozess mit Fristen, Partnerportal, Dokumente, Benachrichtigungskanäle | abgeschlossen |
| 4 | REST-API v1 + OpenAPI, Webhooks, CSV/XLSX-Import, Soll-Ist-Abgleich, Prüfberichte, Automatisierungsengine | abgeschlossen |
| 5 | KI-Schnittstelle (Anbieter austauschbar), E-Mail-Eingang, Anfrageentwürfe, Freigabeprozess | in Arbeit |
| 6 | Auswertungen, Abrechnungsvorbereitung, globale Suche, Fehlerüberwachung, Performance | offen |
| 7 | Vollständige Tests (13 Szenarien), Sicherheitsprüfung, Deployment-Paket, Fertigstellungsgrad | offen |

## Nach dem Pilotbetrieb (nicht Teil des ersten Lieferumfangs)

- WhatsApp Business / SMS als echte Kanäle (Schnittstelle vorhanden, Anbieter fehlt).
- Mobile Progressive Web App für Mitarbeiter (Rückmeldung, Einsatzinfos).
- Mandanten-Self-Service für Abrechnungs-/Vertragsdaten (SaaS-Abrechnung).
- Mehrsprachigkeit (derzeit Deutsch).
- Verteiltes Rate-Limiting, Read-Replicas, Objektspeicher-Lebenszyklus.
