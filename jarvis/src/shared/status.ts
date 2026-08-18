/**
 * Zentrale Statuswerte. Werden von Datenbank, Agenten und Oberfläche
 * gemeinsam benutzt, damit es keine zwei Wahrheiten über den Zustand
 * eines Vorgangs gibt.
 */

/** Status einer Zeile in der Versandzentrale. */
export const OutreachStatus = {
  NEU: 'NEU',
  RECHERCHE_LAEUFT: 'RECHERCHE_LAEUFT',
  KONTAKT_GEFUNDEN: 'KONTAKT_GEFUNDEN',
  ENTWURF_ERSTELLT: 'ENTWURF_ERSTELLT',
  WARTET_AUF_FREIGABE: 'WARTET_AUF_FREIGABE',
  FREIGEGEBEN: 'FREIGEGEBEN',
  GESENDET: 'GESENDET',
  FEHLER: 'FEHLER',
  ANTWORT_ERHALTEN: 'ANTWORT_ERHALTEN'
} as const;
export type OutreachStatus = (typeof OutreachStatus)[keyof typeof OutreachStatus];

export const OUTREACH_STATUS_LABEL: Record<OutreachStatus, string> = {
  NEU: 'Neu',
  RECHERCHE_LAEUFT: 'Recherche läuft',
  KONTAKT_GEFUNDEN: 'Kontakt gefunden',
  ENTWURF_ERSTELLT: 'Entwurf erstellt',
  WARTET_AUF_FREIGABE: 'Wartet auf Freigabe',
  FREIGEGEBEN: 'Freigegeben',
  GESENDET: 'Gesendet',
  FEHLER: 'Fehler',
  ANTWORT_ERHALTEN: 'Antwort erhalten'
};

/**
 * Verifizierungsgrad einer E-Mail-Adresse.
 *
 * VERIFIZIERT      – Adresse stand wörtlich auf einer offiziellen Seite des
 *                    Unternehmens (Website, Kontakt, Impressum) und die Domain
 *                    passt zum Unternehmen.
 * WAHRSCHEINLICH   – Adresse stand wörtlich auf einer öffentlichen Quelle,
 *                    aber nicht auf der Unternehmensdomain (Verzeichnis, PDF …).
 * NICHT_VERIFIZIERT– Alles andere. Wird nie für den Versand freigeschaltet.
 *
 * Es gibt bewusst keinen Weg, eine Adresse zu "raten": siehe verification.ts.
 */
export const VerificationStatus = {
  VERIFIZIERT: 'VERIFIZIERT',
  WAHRSCHEINLICH: 'WAHRSCHEINLICH',
  NICHT_VERIFIZIERT: 'NICHT_VERIFIZIERT'
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

/** Zustand einer E-Mail im System. */
export const EmailStatus = {
  ENTWURF: 'ENTWURF',
  WARTET_AUF_FREIGABE: 'WARTET_AUF_FREIGABE',
  FREIGEGEBEN: 'FREIGEGEBEN',
  GESENDET: 'GESENDET',
  FEHLGESCHLAGEN: 'FEHLGESCHLAGEN',
  EMPFANGEN: 'EMPFANGEN'
} as const;
export type EmailStatus = (typeof EmailStatus)[keyof typeof EmailStatus];

/** Zustand einer Freigabeanfrage. */
export const ApprovalStatus = {
  OFFEN: 'OFFEN',
  FREIGEGEBEN: 'FREIGEGEBEN',
  ABGELEHNT: 'ABGELEHNT',
  ABGELAUFEN: 'ABGELAUFEN',
  VERBRAUCHT: 'VERBRAUCHT'
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

/** Anzeigezustand von JARVIS (Kopfzeile der Oberfläche). */
export const VoiceState = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  THINKING: 'THINKING',
  EXECUTING: 'EXECUTING',
  WAITING_FOR_APPROVAL: 'WAITING_FOR_APPROVAL',
  SPEAKING: 'SPEAKING',
  ERROR: 'ERROR'
} as const;
export type VoiceState = (typeof VoiceState)[keyof typeof VoiceState];

/** Herkunft einer Aussage: belegt oder geschlussfolgert (§15). */
export const ClaimKind = {
  FAKT: 'FAKT',
  KI_EINSCHAETZUNG: 'KI_EINSCHAETZUNG'
} as const;
export type ClaimKind = (typeof ClaimKind)[keyof typeof ClaimKind];
