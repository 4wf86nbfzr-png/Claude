# Sicherheit und Schutzkonzept

Diese App vermittelt Menschen in persönliche Nähe zueinander – oft Menschen, die
auf Unterstützung angewiesen sind. Die größten Risiken sind deshalb nicht
technischer Natur: Grenzverletzung, finanzielle Ausnutzung, Diskriminierung,
Grooming, falsche Qualifikationsangaben. Technik kann hier absichern, aber kein
Schutzkonzept ersetzen, das Menschen tragen.

## Rollen und Rechte

Die Rechte liegen als Matrix in `packages/core/src/security/permissions.ts` –
nicht verstreut über if-Abfragen. So ist im Audit auf einen Blick sichtbar, wer
was darf.

| Rolle | Darf |
| --- | --- |
| `support_seeker` | eigenes Profil, Anfragen, Buchungen bestätigen, Nachrichten |
| `provider` | eigenes Profil, passende Anfragen, Buchungen bestätigen, Nachweise einreichen |
| `trusted_person` | **nichts allein** – Rechte kommen ausschließlich aus einer aktiven Berechtigung |
| `reviewer` | Nachweise entscheiden, Vorfälle lesen |
| `support_agent` | Vorfälle lesen und zuweisen, Supportzugriff (protokolliert) |
| `admin` | Nachweise, Sperrungen, Inhalte, Protokoll |

Eine Vertrauensperson erhält Rechte **nur** über einen `TrustedAccessGrant` mit
ausdrücklich gewählten Bereichen. Der Zugang ist jederzeit widerrufbar; nach dem
Widerruf sind alle Rechte sofort weg. Ein Ablaufdatum ist möglich.

## Vier-Augen-Prinzip

Zwei Handlungen brauchen zwei verschiedene berechtigte Personen:

- **Anerkennung einer Fachqualifikation**, die zu erlaubnispflichtiger Arbeit
  berechtigt. Eine falsch anerkannte Pflegequalifikation kann Menschen
  gefährden.
- **Sperrung eines Kontos.**

Selbstfreigabe ist ausgeschlossen. Durchgesetzt in `isFourEyesSatisfied` **und**
im Datenbank-Trigger `trg_verifications_four_eyes`.

## Nachweise

| Status | Bedeutung |
| --- | --- |
| `pending` | eingereicht, wird geprüft |
| `approved` | geprüft; bei ablaufenden Nachweisen mit Gültigkeitsdatum |
| `rejected` | nicht anerkannt – Begründung ist Pflicht und wird angezeigt |
| `expired` | abgelaufen, muss erneuert werden |

Regeln:

- Ohne geprüfte Identität erscheint niemand in Vorschlägen.
- Ohne gültige Fachqualifikation werden erlaubnispflichtige Anfragen gar nicht
  erst angezeigt.
- `approved` ist kein Endzustand. `expire_verifications()` läuft täglich und
  setzt abgelaufene Nachweise zurück; damit fallen die betroffenen Anfragen
  automatisch aus dem Matching.
- Die öffentliche Rolle folgt den Nachweisen (`deriveProviderKind`). Wer eine
  Fachqualifikation angibt, sie aber nicht belegt, erscheint als private
  Unterstützungsperson.
- **Ein geprüfter Nachweis bedeutet genau das geprüfte Merkmal.** Am Profil
  steht: „Geprüft wurde genau das, was hier aufgeführt ist. Eine Prüfung ist
  kein allgemeines Versprechen über einen Menschen."

## Meldungen und Vorfälle

Meldewege sind von jedem Bildschirm über „Hilfe" erreichbar und in verständlicher
Sprache benannt („Jemand hat etwas gemacht, das ich nicht wollte").

| Kategorie | Dringlichkeit | Zusage |
| --- | --- | --- |
| Grenzverletzung, Belästigung | kritisch | 1 Stunde |
| Betrug, Diskriminierung | hoch | 8 Stunden |
| Falsche Angaben, Nichterscheinen | normal | 48 Stunden |
| Sonstiges | niedrig | 120 Stunden |

- Der **Freitext einer Meldung landet nie in einer Übersicht.** Die Fallliste
  zeigt nur Kategorie und Bezug; die Schilderung steht in der Fallakte.
- Ein Fall in Bearbeitung braucht eine namentlich zuständige Person.
- Überschrittene Zusagen stehen im Dashboard ganz oben.
- Die private Rückmeldung nach einem Termin geht getrennt an das
  Sicherheitsteam und erscheint nie öffentlich.

## Supportzugriff

Es gibt **kein stilles Anmelden im Namen einer Person.** Jeder Supportzugriff
auf Nutzerdaten braucht:

1. die Berechtigung `support.access.user_data`,
2. eine nachvollziehbare Begründung,
3. eine Freigabe der betroffenen Person **oder** einen dokumentierten
   Sicherheitsvorfall.

Jeder Zugriff wird protokolliert – auch der abgelehnte.

## Technische Maßnahmen

| Bereich | Maßnahme | Stand |
| --- | --- | --- |
| Zugriffsschutz | Row-Level-Security auf allen Tabellen, Standard ist gesperrt | umgesetzt |
| Sensible Daten | eigene Tabellen für Unterstützungsbedarf und Kontaktdaten | umgesetzt |
| Kontaktfreigabe | nur mit bestätigter Buchung und aktiver Einwilligung; wird bei Absage eingezogen | umgesetzt |
| Protokoll | `audit_events`, nur lesbar, ohne sensible Inhalte | umgesetzt |
| Push-Vorschauen | Texte aus einer Whitelist, nie Inhalte | umgesetzt |
| Biometrie | ausschließlich über die sicheren Betriebssystemfunktionen; keine Rohdaten in der App | vorgesehen |
| Mehrfaktor für Verwaltungskonten | `ADMIN_MFA_REQUIRED` | zu konfigurieren |
| Transportverschlüsselung | TLS erzwungen | Betrieb |
| Verschlüsselung im Ruhezustand | Supabase-seitig | Betrieb |
| Rate Limits | pro Konto und IP für Anmeldung, Nachrichten, Meldungen | **offen** |
| Upload-Scanning | Virenprüfung für Nachweise und Medien | **offen** |
| Signierte URLs | kurze Gültigkeit für Dokumente (`STORAGE_SIGNED_URL_TTL_SECONDS`) | zu konfigurieren |
| Secrets | ausschließlich über Umgebungsvariablen, `.env.example` ohne Werte | umgesetzt |

## Schutz vor bestimmten Angriffen

- **Getarnte Pflegeanfragen:** `requiresLicensedProfessional` wird aus den
  Kategorien abgeleitet und kann nicht von außen gesetzt werden – in der
  Anwendung und per Trigger.
- **Adressrekonstruktion:** Koordinaten werden auf zwei Nachkommastellen
  gerundet (etwa 1 km). Entfernungen werden nur grob beschriftet („etwa 10 km
  entfernt"), nie metergenau.
- **Diskriminierung im Matching:** kein Bewertungssignal darf ein geschütztes
  Merkmal enthalten; ein Test prüft das. Präferenzen nach geschützten Merkmalen
  sind grundsätzlich unzulässig. Die einzige Ausnahme – Geschlecht bei
  Körpernähe und persönlicher Assistenz (§ 8 AGG) – verlangt eine Begründung und
  wird zur manuellen Prüfung markiert.
- **Falsch verstandene Sprachbefehle:** folgenreiche Handlungen brauchen immer
  eine Bestätigung am Bildschirm.
- **Nicht zugängliche Sprachnachrichten:** eine Sprachnachricht ohne Transkript
  wird abgelehnt – in der Anwendung und als Prüfbedingung in der Datenbank.

## Minderjährige

Der MVP ist ausschließlich für Volljährige. Das Mindestalter wird bei der
Registrierung bestätigt und liegt als Feld am Konto. Ein Angebot für
Minderjährige ist eine eigene Phase mit eigenem Schutzkonzept, eigener
rechtlicher Prüfung und eigenem Einwilligungsmodell – nicht ein Schalter.

## Offene Punkte vor dem Start

Siehe [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md). Sicherheitsseitig sind
insbesondere offen: Rate Limits, Upload-Scanning, ein Penetrationstest,
das Verfahren bei Datenschutzverletzungen (Art. 33/34 DSGVO) und ein
schriftliches Schutzkonzept, das von einer Fachperson für Gewaltschutz in der
Eingliederungshilfe geprüft wurde.
