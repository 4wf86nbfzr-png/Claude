/**
 * Fehler der Approval Engine. Jeder Fehler traegt einen maschinenlesbaren
 * Code UND einen deutschen Satz, den Jarvis unveraendert vorlesen kann -
 * damit am Telefon nie ein englischer Stacktrace landet.
 */
export type ApprovalErrorCode =
  | 'DRAFT_NOT_FOUND'
  | 'APPROVAL_NOT_FOUND'
  | 'WRONG_STATE'
  | 'NO_READ_BACK'
  | 'READ_BACK_STALE'
  | 'VOICE_CONFIRMATION_INVALID'
  | 'PIN_INVALID'
  | 'PIN_MISSING'
  | 'EXPIRED'
  | 'CONTENT_CHANGED'
  | 'ALREADY_CONSUMED'
  | 'CANCELLED'
  | 'CONCURRENT_MODIFICATION'
  | 'SENDER_NOT_REGISTERED'
  | 'CALL_MISMATCH';

const MESSAGES_DE: Record<ApprovalErrorCode, string> = {
  DRAFT_NOT_FOUND: 'Den Entwurf finde ich nicht mehr. Es wurde nichts gesendet.',
  APPROVAL_NOT_FOUND: 'Zu dieser Freigabe habe ich keinen Vorgang. Es wurde nichts gesendet.',
  WRONG_STATE: 'Der Freigabevorgang ist nicht an der Stelle, an der er sein muesste. Es wurde nichts gesendet.',
  NO_READ_BACK: 'Ich habe dir die Nachricht noch nicht vollstaendig vorgelesen. Es wurde nichts gesendet.',
  READ_BACK_STALE: 'Der Text hat sich geaendert, seit ich ihn vorgelesen habe. Ich lese alles noch einmal vor.',
  VOICE_CONFIRMATION_INVALID:
    'Das war keine gueltige Bestaetigung. Ich brauche ausdruecklich "Ja, senden". Es wurde nichts gesendet.',
  PIN_INVALID: 'Die Freigabe-PIN war falsch. Es wurde nichts gesendet.',
  PIN_MISSING: 'Es fehlt die Freigabe-PIN. Es wurde nichts gesendet.',
  EXPIRED: 'Die Freigabe ist abgelaufen. Ich lese dir alles noch einmal vor. Es wurde nichts gesendet.',
  CONTENT_CHANGED:
    'Am Inhalt hat sich etwas geaendert, deshalb ist die Freigabe ungueltig. Ich lese alles noch einmal vor.',
  ALREADY_CONSUMED: 'Diese Freigabe wurde bereits verwendet. Ich sende nichts ein zweites Mal.',
  CANCELLED: 'Der Vorgang wurde abgebrochen. Es wurde nichts gesendet.',
  CONCURRENT_MODIFICATION: 'Am Vorgang wurde gleichzeitig etwas veraendert. Ich fange sicherheitshalber neu an.',
  SENDER_NOT_REGISTERED: 'Fuer diesen Kanal ist kein Versandweg eingerichtet. Es wurde nichts gesendet.',
  CALL_MISMATCH: 'Die Freigabe gehoert zu einem anderen Gespraech. Es wurde nichts gesendet.',
};

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode;
  /** Satz zum Vorlesen. Enthaelt nie technische Details. */
  readonly spokenDe: string;

  constructor(code: ApprovalErrorCode, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = 'ApprovalError';
    this.code = code;
    this.spokenDe = MESSAGES_DE[code];
  }
}
