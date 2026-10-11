# Roadmap

Reihenfolge entspricht dem Umsetzungsplan; Status in PROJECT_STATUS.md.

| Phase | Inhalt | Status |
| ----- | ------ | ------ |
| 1 | Grundlage: Architektur, Schema, RLS, Auth, Rollen, Designsystem, Dashboard-Gerüst | abgeschlossen |
| 2 | Personal, Kunden, Veranstaltungen, Positionen, Schichten, Kalender, Qualifikationen, Konflikterkennung | abgeschlossen |
| 3 | Verfügbarkeiten, Rückmeldeprozess mit Fristen, Partnerportal, Dokumente, Benachrichtigungskanäle | abgeschlossen |
| 4 | REST-API v1 + OpenAPI, Webhooks, CSV/XLSX-Import, Soll-Ist-Abgleich, Prüfberichte, Automatisierungsengine | abgeschlossen |
| 5 | KI-Schnittstelle (Anbieter austauschbar), E-Mail-Eingang, Anfrageentwürfe, Freigabeprozess | abgeschlossen |
| 6 | Auswertungen, Abrechnungsvorbereitung, globale Suche, Fehlerüberwachung, Performance | abgeschlossen |
| 7 | Vollständige Tests (13 Szenarien), Sicherheitsprüfung, Deployment-Paket, Fertigstellungsgrad | abgeschlossen (Pilotvorbereitung; offene Punkte in PROJECT_STATUS.md) |

## Vor dem Pilotbetrieb (manuell, braucht Konten/Entscheidungen)

- Hosting, Domain/TLS, SMTP, Backup-Zeitplan einrichten (docs/DEPLOYMENT.md, docs/BACKUP_RESTORE.md).
- Produktnamen rechtlich prüfen (Marke/Domain), siehe PROJECT_STATUS.md.
- Container-Image einmal in einer Docker-Umgebung bauen und starten.

## Nach dem Pilotbetrieb (nicht Teil des ersten Lieferumfangs)

- Nonce-basierte CSP ohne `'unsafe-inline'`, 2-Faktor-Authentifizierung, Virenscan für Uploads.
- PDF-Textextraktion für KI-Zusammenfassungen.
- WhatsApp Business / SMS als echte Kanäle (Schnittstelle vorhanden, Anbieter fehlt).
- Mobile Progressive Web App für Mitarbeiter (Rückmeldung, Einsatzinfos).
- Mandanten-Self-Service für Abrechnungs-/Vertragsdaten (SaaS-Abrechnung).
- Mehrsprachigkeit (derzeit Deutsch).
- Verteiltes Rate-Limiting, Read-Replicas, Objektspeicher-Lebenszyklus.
