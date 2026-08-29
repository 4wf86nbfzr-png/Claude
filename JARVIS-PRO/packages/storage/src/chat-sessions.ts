import type { CallId, Clock } from '@jarvis/domain';
import type { Db } from './db.js';

/**
 * Der Gespraechszustand im Chat.
 *
 * Eine "Sitzung" ist hier kein technischer Kanal, sondern ein
 * Gespraechsabschnitt: Noah schreibt, Jarvis antwortet, irgendwann ist Ruhe.
 * Meldet er sich nach laengerer Pause wieder, faengt ein neuer Abschnitt an -
 * und dann kommt der Pflichtsatz wieder, genau wie am Telefon zu Beginn
 * jedes Anrufs.
 *
 * `sessionRef` ist die Klammer um alles, was in diesem Abschnitt passiert.
 * Die Approval Engine kennt nur `CallId`; im Chat steht dort `chat:<Nummer>`.
 * Das ist bewusst dieselbe Spalte: eine Freigabe gehoert zu einem Vorgang,
 * und ob dieser Vorgang ein Anruf oder ein Chatabschnitt war, aendert an den
 * Regeln nichts.
 */
export interface ChatSession {
  readonly waId: string;
  readonly sessionRef: CallId;
  readonly openedAt: string | null;
  readonly authenticatedAt: string | null;
  readonly lastInboundAt: string | null;
  readonly lastOutboundAt: string | null;
  readonly failedLogins: number;
}

interface ChatSessionRow {
  wa_id: string;
  session_ref: string;
  opened_at: string | null;
  authenticated_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  failed_logins: number;
}

export class ChatSessionRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  get(waId: string): ChatSession | null {
    const r = this.db.get<ChatSessionRow>('SELECT * FROM chat_sessions WHERE wa_id = ?', [waId]);
    return r === undefined ? null : rowTo(r);
  }

  /**
   * Holt die Sitzung oder legt sie an. `idleMinutes` entscheidet, ob der
   * bisherige Abschnitt weiterlaeuft oder ein neuer beginnt; beim Neubeginn
   * wird die Anmeldung zurueckgesetzt, damit sie nicht unbegrenzt gilt.
   */
  openOrContinue(waId: string, idleMinutes: number): { session: ChatSession; isNew: boolean } {
    const now = this.clock.nowIso();
    const existing = this.get(waId);

    if (existing === null) {
      this.db.run(
        `INSERT INTO chat_sessions (wa_id, session_ref, opened_at, last_inbound_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?)`,
        [waId, `chat:${waId}:${now}`, now, now, now, now],
      );
      const created = this.get(waId);
      if (created === null) throw new Error('Chatsitzung konnte nicht angelegt werden');
      return { session: created, isNew: true };
    }

    const letzte = existing.lastInboundAt ?? existing.openedAt;
    const pauseMinuten =
      letzte === null ? Number.POSITIVE_INFINITY : (this.clock.now().getTime() - Date.parse(letzte)) / 60_000;

    if (pauseMinuten <= idleMinutes) {
      this.db.run('UPDATE chat_sessions SET last_inbound_at = ?, updated_at = ? WHERE wa_id = ?', [
        now,
        now,
        waId,
      ]);
      const fortgesetzt = this.get(waId);
      if (fortgesetzt === null) throw new Error('Chatsitzung verschwunden');
      return { session: fortgesetzt, isNew: false };
    }

    // Neuer Abschnitt: neue Klammer, Anmeldung verfaellt.
    this.db.run(
      `UPDATE chat_sessions
          SET session_ref = ?, opened_at = ?, authenticated_at = NULL,
              last_inbound_at = ?, failed_logins = 0, updated_at = ?
        WHERE wa_id = ?`,
      [`chat:${waId}:${now}`, now, now, now, waId],
    );
    const neu = this.get(waId);
    if (neu === null) throw new Error('Chatsitzung verschwunden');
    return { session: neu, isNew: true };
  }

  markAuthenticated(waId: string): void {
    const now = this.clock.nowIso();
    this.db.run(
      'UPDATE chat_sessions SET authenticated_at = ?, failed_logins = 0, updated_at = ? WHERE wa_id = ?',
      [now, now, waId],
    );
  }

  /** Zaehlt einen Fehlversuch und gibt den neuen Stand zurueck. */
  countFailedLogin(waId: string): number {
    const now = this.clock.nowIso();
    this.db.run(
      'UPDATE chat_sessions SET failed_logins = failed_logins + 1, updated_at = ? WHERE wa_id = ?',
      [now, waId],
    );
    return this.get(waId)?.failedLogins ?? 0;
  }

  markOutbound(waId: string): void {
    const now = this.clock.nowIso();
    this.db.run('UPDATE chat_sessions SET last_outbound_at = ?, updated_at = ? WHERE wa_id = ?', [
      now,
      now,
      waId,
    ]);
  }

  /**
   * Zeitpunkt der letzten eingehenden Nachricht - genau das, was der
   * WhatsApp-Connector fuer die Fensterpruefung braucht.
   */
  lastInboundAt(waId: string): string | null {
    return this.get(waId)?.lastInboundAt ?? null;
  }
}

function rowTo(r: ChatSessionRow): ChatSession {
  return {
    waId: r.wa_id,
    sessionRef: r.session_ref as CallId,
    openedAt: r.opened_at,
    authenticatedAt: r.authenticated_at,
    lastInboundAt: r.last_inbound_at,
    lastOutboundAt: r.last_outbound_at,
    failedLogins: r.failed_logins,
  };
}
