/**
 * Freigabe-Engine.
 *
 * Grundsatz: Aktionen mit Außenwirkung werden nicht ausgeführt, sondern
 * beantragt. Erst eine ausdrückliche Entscheidung des Nutzers löst sie aus.
 *
 * Der Ablauf ist absichtlich so gebaut, dass ein Agent den Versand nicht
 * "aus Versehen" auslösen kann:
 *
 *   1. Ein Tool ruft `requestApproval()` und bekommt KEIN Ergebnis, sondern
 *      eine offene Anfrage zurück.
 *   2. Die Anfrage landet in der Datenbank und in der Oberfläche.
 *   3. Erst `decide(id, 'freigegeben')` führt die hinterlegte Aktion aus.
 *
 * Der Auftrag (`executor`) liegt im Arbeitsspeicher. Startet die App neu,
 * während eine Anfrage offen ist, springt der für die Aktionsart
 * registrierte Ersatz-Auftrag ein (siehe `registerFallbackExecutor`).
 */
import { decideApproval as dbDecide, getApproval, insertApproval, listApprovals } from '../db/repos/system'
import { auditInfo, auditWarn } from './audit'
import { emit, setState } from './events'
import type { ApprovalAction, ApprovalRequest, ApprovalStatus, ToolResult } from '@shared/types'

/** Diese Aktionen brauchen immer eine Freigabe. Die Liste ist bewusst fest verdrahtet. */
export const ACTIONS_REQUIRING_APPROVAL: ReadonlySet<ApprovalAction> = new Set<ApprovalAction>([
  'email_senden',
  'email_bulk_senden',
  'datei_loeschen',
  'datei_ueberschreiben',
  'programm_installieren',
  'systemeinstellung_aendern',
  'kostenpflichtige_aktion',
  'account_aendern',
  'daten_veroeffentlichen',
  'formular_absenden',
  'nachricht_extern'
])

export type ApprovalExecutor = (approval: ApprovalRequest) => Promise<ToolResult>

const executors = new Map<number, ApprovalExecutor>()
const fallbackExecutors = new Map<ApprovalAction, ApprovalExecutor>()

/**
 * Ersatz-Auftrag für eine Aktionsart. Wird genommen, wenn zu einer offenen
 * Anfrage kein Auftrag mehr im Speicher liegt (z. B. nach einem Neustart).
 */
export function registerFallbackExecutor(action: ApprovalAction, executor: ApprovalExecutor): void {
  fallbackExecutors.set(action, executor)
}

export interface ApprovalInput {
  action: ApprovalAction
  title: string
  details: Record<string, string>
  body?: string | null
  requestedBy: string
  relatedEmailId?: number | null
  relatedCompanyId?: number | null
}

/** Legt eine Freigabeanfrage an. Führt nichts aus. */
export function requestApproval(input: ApprovalInput, executor?: ApprovalExecutor): ApprovalRequest {
  const approval = insertApproval(input)
  if (executor) executors.set(approval.id, executor)

  auditInfo(
    input.requestedBy,
    'Freigabe angefragt',
    `${approval.title} — ${Object.entries(approval.details)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')}`,
    { type: 'approval', id: approval.id }
  )

  emit({ type: 'approval', request: approval })
  setState('WAITING FOR APPROVAL', approval.title)
  return approval
}

/**
 * Leitet aus einer bereits erteilten Sammelfreigabe eine Einzelfreigabe ab.
 *
 * Der Nutzer hat den Sammelversand freigegeben; jede Einzelmail braucht
 * trotzdem einen eigenen Freigabe-Datensatz, weil `performSend()` genau darauf
 * prüft. Diese Anfrage entsteht deshalb sofort im Zustand "freigegeben" — sie
 * wandert nicht durch die Oberfläche, denn sonst blitzten bei 30 Mails 30
 * Dialoge auf, die niemand mehr entscheiden muss.
 */
export function deriveGrantedApproval(
  parent: ApprovalRequest,
  input: Omit<ApprovalInput, 'requestedBy'> & { requestedBy?: string }
): ApprovalRequest | null {
  if (parent.status !== 'freigegeben') return null

  const approval = insertApproval({
    ...input,
    details: { ...input.details, Sammelfreigabe: `#${parent.id}` },
    requestedBy: input.requestedBy ?? 'ApprovalService'
  })

  const granted = dbDecide(approval.id, 'freigegeben', `abgeleitet aus Sammelfreigabe #${parent.id}`)
  if (!granted) return null

  auditInfo(
    'ApprovalService',
    'Einzelfreigabe abgeleitet',
    `${granted.title} — gedeckt durch Sammelfreigabe #${parent.id}`,
    { type: 'approval', id: granted.id }
  )
  return granted
}

export function pendingApprovals(): ApprovalRequest[] {
  return listApprovals('offen')
}

export function allApprovals(status?: string): ApprovalRequest[] {
  return listApprovals(status)
}

/**
 * Entscheidet über eine Anfrage.
 *
 * Bei "freigegeben" wird die hinterlegte Aktion ausgeführt und deren echtes
 * Ergebnis zurückgegeben — auch wenn es ein Fehler ist. Es wird nie Erfolg
 * gemeldet, den es nicht gab.
 */
export async function decide(
  id: number,
  decision: Extract<ApprovalStatus, 'freigegeben' | 'abgelehnt'>,
  utterance?: string
): Promise<ToolResult<{ approval: ApprovalRequest; result: ToolResult | null }>> {
  const before = getApproval(id)
  if (!before) return { ok: false, error: `Freigabeanfrage ${id} existiert nicht.` }
  if (before.status !== 'offen') {
    return {
      ok: false,
      error: `Freigabeanfrage ${id} wurde bereits entschieden (${before.status}).`
    }
  }

  const approval = dbDecide(id, decision, utterance)
  if (!approval) return { ok: false, error: `Freigabeanfrage ${id} ließ sich nicht aktualisieren.` }

  emit({ type: 'approval-resolved', id, status: decision })

  if (decision === 'abgelehnt') {
    auditWarn('nutzer', 'Freigabe verweigert', `${approval.title}${utterance ? ` (gesagt: "${utterance}")` : ''}`, {
      type: 'approval',
      id
    })
    executors.delete(id)
    setState('IDLE')
    return { ok: true, data: { approval, result: null } }
  }

  auditInfo('nutzer', 'Freigabe erteilt', `${approval.title}${utterance ? ` (gesagt: "${utterance}")` : ''}`, {
    type: 'approval',
    id
  })

  const executor = executors.get(id) ?? fallbackExecutors.get(approval.action)
  executors.delete(id)

  if (!executor) {
    return {
      ok: false,
      error: `Für "${approval.title}" ist kein ausführbarer Auftrag hinterlegt.`,
      hint: 'Die Anfrage gilt als freigegeben, die Aktion muss aber neu angestossen werden.'
    }
  }

  setState('EXECUTING', approval.title)
  try {
    const result = await executor(approval)
    setState('IDLE')
    return { ok: true, data: { approval, result } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setState('ERROR', message)
    return { ok: false, error: `Die freigegebene Aktion ist fehlgeschlagen: ${message}` }
  }
}

// ---------------------------------------------------------------------------
// Sprachliche Freigabe
// ---------------------------------------------------------------------------

export type UtteranceVerdict = 'freigabe' | 'ablehnung' | 'unklar'

const APPROVE_PATTERNS: RegExp[] = [
  /^\s*(ja|jawohl|jup|jep|genau)\s*[.!,]?\s*$/i,
  /\bfreigeben\b/i,
  /\bfreigabe erteilen\b/i,
  /\b(jetzt |bitte )?senden\b/i,
  /\b(ab)?schicken\b/i,
  /\bmail (raus|abschicken|senden)\b/i,
  /\braus damit\b/i,
  /\bja[, ]+(genau so |bitte |dann )?(senden|schicken|freigeben)\b/i,
  /\bpasst so[, ]+(senden|schicken)\b/i,
  /\beinverstanden\b/i
]

const REJECT_PATTERNS: RegExp[] = [
  /^\s*(nein|ne|nee|nope)\s*[.!,]?\s*$/i,
  /\bnicht senden\b/i,
  /\babbrechen\b/i,
  /\bstopp?\b/i,
  /\bverwerfen\b/i,
  /\bdoch nicht\b/i,
  /\blieber nicht\b/i,
  /\babgelehnt\b/i
]

/**
 * Wertet eine Äußerung aus.
 *
 * Bewusst streng: alles, was nicht eindeutig ist, gilt als "unklar" — dann
 * fragt JARVIS nach, statt zu senden. Ein "ja, aber ..." ist keine Freigabe.
 */
export function interpretApprovalUtterance(text: string): UtteranceVerdict {
  const value = text.trim()
  if (!value) return 'unklar'

  const rejected = REJECT_PATTERNS.some((p) => p.test(value))
  if (rejected) return 'ablehnung'

  // Ein Einschub wie "ja, aber der zweite Absatz muss noch raus" ist ein
  // Auftrag zum Aendern, keine Freigabe.
  if (/\b(aber|allerdings|nur noch|vorher|zuerst|erst)\b/i.test(value)) return 'unklar'
  if (/\?\s*$/.test(value)) return 'unklar'

  const approved = APPROVE_PATTERNS.some((p) => p.test(value))
  return approved ? 'freigabe' : 'unklar'
}

/** Nur für Tests: hängende Aufträge lösen. */
export function resetApprovalExecutors(): void {
  executors.clear()
  fallbackExecutors.clear()
}
