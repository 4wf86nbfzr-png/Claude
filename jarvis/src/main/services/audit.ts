/**
 * Protokoll.
 *
 * Jede Aktion mit Außenwirkung landet hier — nicht nur der Versand, sondern
 * auch der Weg dorthin. Der Nutzer soll später Zeile für Zeile nachlesen
 * können, was passiert ist.
 */
import { insertAudit, listAudit } from '../db/repos/system'
import { emit } from './events'
import type { AuditEntry, AuditLevel } from '@shared/types'

export interface AuditInput {
  actor: string
  action: string
  detail: string
  level?: AuditLevel
  refType?: string | null
  refId?: number | null
}

export function audit(input: AuditInput): AuditEntry {
  const entry = insertAudit(input)
  emit({ type: 'audit', entry })
  if (input.level === 'error') console.error(`[audit] ${input.actor}: ${input.action} — ${input.detail}`)
  return entry
}

export function auditInfo(actor: string, action: string, detail: string, ref?: { type: string; id: number }): AuditEntry {
  return audit({ actor, action, detail, level: 'info', refType: ref?.type ?? null, refId: ref?.id ?? null })
}

export function auditWarn(actor: string, action: string, detail: string, ref?: { type: string; id: number }): AuditEntry {
  return audit({ actor, action, detail, level: 'warn', refType: ref?.type ?? null, refId: ref?.id ?? null })
}

export function auditError(actor: string, action: string, detail: string, ref?: { type: string; id: number }): AuditEntry {
  return audit({ actor, action, detail, level: 'error', refType: ref?.type ?? null, refId: ref?.id ?? null })
}

export function recentAudit(limit = 300): AuditEntry[] {
  return listAudit(limit)
}
