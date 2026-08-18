/**
 * Freigaben, Protokoll, Gedächtnis, Gespräche, Aufgaben und Einstellungen.
 */
import { getDb } from '../index'
import type {
  ApprovalAction,
  ApprovalRequest,
  ApprovalStatus,
  AuditEntry,
  AuditLevel,
  ConversationMessage,
  MemoryFact,
  MemoryScope,
  TaskItem
} from '@shared/types'

const now = (): string => new Date().toISOString()

// ---------------------------------------------------------------------------
// Freigaben
// ---------------------------------------------------------------------------

type ApprovalRow = {
  id: number
  action: string
  title: string
  details_json: string
  body: string | null
  status: string
  requested_by: string
  requested_at: string
  decided_at: string | null
  decision_utterance: string | null
  related_email_id: number | null
  related_company_id: number | null
}

function mapApproval(row: ApprovalRow): ApprovalRequest {
  let details: Record<string, string> = {}
  try {
    details = JSON.parse(row.details_json) as Record<string, string>
  } catch {
    details = { Hinweis: 'Details konnten nicht gelesen werden.' }
  }
  return {
    id: row.id,
    action: row.action as ApprovalAction,
    title: row.title,
    details,
    body: row.body,
    status: row.status as ApprovalStatus,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decisionUtterance: row.decision_utterance,
    relatedEmailId: row.related_email_id,
    relatedCompanyId: row.related_company_id
  }
}

export function insertApproval(input: {
  action: ApprovalAction
  title: string
  details: Record<string, string>
  body?: string | null
  requestedBy: string
  relatedEmailId?: number | null
  relatedCompanyId?: number | null
}): ApprovalRequest {
  const res = getDb()
    .prepare(
      `INSERT INTO approvals (action, title, details_json, body, status, requested_by, requested_at, related_email_id, related_company_id)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      input.action,
      input.title,
      JSON.stringify(input.details),
      input.body ?? null,
      'offen',
      input.requestedBy,
      now(),
      input.relatedEmailId ?? null,
      input.relatedCompanyId ?? null
    )
  const approval = getApproval(res.lastInsertRowid)
  if (!approval) throw new Error('Freigabeanfrage konnte nicht gespeichert werden.')
  return approval
}

export function getApproval(id: number): ApprovalRequest | null {
  const row = getDb().prepare('SELECT * FROM approvals WHERE id = ?').get<ApprovalRow>(id)
  return row ? mapApproval(row) : null
}

export function listApprovals(status?: string, limit = 200): ApprovalRequest[] {
  const db = getDb()
  const rows = status
    ? db.prepare('SELECT * FROM approvals WHERE status = ? ORDER BY id DESC LIMIT ?').all<ApprovalRow>(status, limit)
    : db.prepare('SELECT * FROM approvals ORDER BY id DESC LIMIT ?').all<ApprovalRow>(limit)
  return rows.map(mapApproval)
}

export function decideApproval(id: number, status: ApprovalStatus, utterance?: string): ApprovalRequest | null {
  getDb()
    .prepare('UPDATE approvals SET status = ?, decided_at = ?, decision_utterance = ? WHERE id = ? AND status = ?')
    .run(status, now(), utterance ?? null, id, 'offen')
  return getApproval(id)
}

// ---------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------

type AuditRow = {
  id: number
  at: string
  actor: string
  action: string
  detail: string
  level: string
  ref_type: string | null
  ref_id: number | null
}

export function insertAudit(entry: {
  actor: string
  action: string
  detail: string
  level?: AuditLevel
  refType?: string | null
  refId?: number | null
}): AuditEntry {
  const at = now()
  const res = getDb()
    .prepare('INSERT INTO audit_logs (at, actor, action, detail, level, ref_type, ref_id) VALUES (?,?,?,?,?,?,?)')
    .run(at, entry.actor, entry.action, entry.detail, entry.level ?? 'info', entry.refType ?? null, entry.refId ?? null)
  return {
    id: res.lastInsertRowid,
    at,
    actor: entry.actor,
    action: entry.action,
    detail: entry.detail,
    level: entry.level ?? 'info',
    refType: entry.refType ?? null,
    refId: entry.refId ?? null
  }
}

export function listAudit(limit = 300): AuditEntry[] {
  return getDb()
    .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?')
    .all<AuditRow>(limit)
    .map((r) => ({
      id: r.id,
      at: r.at,
      actor: r.actor,
      action: r.action,
      detail: r.detail,
      level: r.level as AuditLevel,
      refType: r.ref_type,
      refId: r.ref_id
    }))
}

// ---------------------------------------------------------------------------
// Gedächtnis
// ---------------------------------------------------------------------------

type MemoryRow = {
  id: number
  scope: string
  key: string
  value: string
  origin: string
  created_at: string
  updated_at: string
  expires_at: string | null
}

function mapMemory(row: MemoryRow): MemoryFact {
  return {
    id: row.id,
    scope: row.scope as MemoryScope,
    key: row.key,
    value: row.value,
    origin: row.origin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at
  }
}

export function rememberFact(input: {
  scope: MemoryScope
  key: string
  value: string
  origin: string
  expiresAt?: string | null
}): MemoryFact {
  const at = now()
  getDb()
    .prepare(
      `INSERT INTO memory_facts (scope, key, value, origin, created_at, updated_at, expires_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, origin = excluded.origin, updated_at = excluded.updated_at, expires_at = excluded.expires_at`
    )
    .run(input.scope, input.key, input.value, input.origin, at, at, input.expiresAt ?? null)
  const row = getDb()
    .prepare('SELECT * FROM memory_facts WHERE scope = ? AND key = ?')
    .get<MemoryRow>(input.scope, input.key)
  if (!row) throw new Error('Notiz konnte nicht gespeichert werden.')
  return mapMemory(row)
}

export function listMemory(scope?: string): MemoryFact[] {
  const db = getDb()
  // Abgelaufene Notizen fallen beim Lesen raus und werden dabei entfernt.
  db.prepare('DELETE FROM memory_facts WHERE expires_at IS NOT NULL AND expires_at < ?').run(now())
  const rows = scope
    ? db.prepare('SELECT * FROM memory_facts WHERE scope = ? ORDER BY updated_at DESC').all<MemoryRow>(scope)
    : db.prepare('SELECT * FROM memory_facts ORDER BY scope, updated_at DESC').all<MemoryRow>()
  return rows.map(mapMemory)
}

export function forgetFact(id: number): number {
  return getDb().prepare('DELETE FROM memory_facts WHERE id = ?').run(id).changes
}

export function forgetScope(scope: string): number {
  return getDb().prepare('DELETE FROM memory_facts WHERE scope = ?').run(scope).changes
}

// ---------------------------------------------------------------------------
// Gespräche
// ---------------------------------------------------------------------------

export function createConversation(title?: string): number {
  const at = now()
  return getDb()
    .prepare('INSERT INTO conversations (title, created_at, updated_at) VALUES (?,?,?)')
    .run(title ?? null, at, at).lastInsertRowid
}

export function latestConversationId(): number | null {
  const row = getDb().prepare('SELECT id FROM conversations ORDER BY id DESC LIMIT 1').get<{ id: number }>()
  return row?.id ?? null
}

export function appendMessage(input: {
  conversationId: number
  role: ConversationMessage['role']
  content: string
  toolName?: string | null
}): ConversationMessage {
  const at = now()
  const res = getDb()
    .prepare('INSERT INTO messages (conversation_id, role, content, tool_name, created_at) VALUES (?,?,?,?,?)')
    .run(input.conversationId, input.role, input.content, input.toolName ?? null, at)
  getDb().prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(at, input.conversationId)
  return {
    id: res.lastInsertRowid,
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    toolName: input.toolName ?? null,
    createdAt: at
  }
}

export function listMessages(conversationId: number, limit = 200): ConversationMessage[] {
  return getDb()
    .prepare(
      `SELECT * FROM (
         SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?
       ) ORDER BY id ASC`
    )
    .all<{
      id: number
      conversation_id: number
      role: string
      content: string
      tool_name: string | null
      created_at: string
    }>(conversationId, limit)
    .map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role as ConversationMessage['role'],
      content: r.content,
      toolName: r.tool_name,
      createdAt: r.created_at
    }))
}

// ---------------------------------------------------------------------------
// Aufgaben
// ---------------------------------------------------------------------------

type TaskRow = {
  id: number
  title: string
  detail: string | null
  status: string
  due_at: string | null
  created_at: string
  updated_at: string
}

export function createTask(input: { title: string; detail?: string | null; dueAt?: string | null }): TaskItem {
  const at = now()
  const res = getDb()
    .prepare('INSERT INTO tasks (title, detail, status, due_at, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run(input.title, input.detail ?? null, 'offen', input.dueAt ?? null, at, at)
  return {
    id: res.lastInsertRowid,
    title: input.title,
    detail: input.detail ?? null,
    status: 'offen',
    dueAt: input.dueAt ?? null,
    createdAt: at,
    updatedAt: at
  }
}

export function listTasks(): TaskItem[] {
  return getDb()
    .prepare(`SELECT * FROM tasks ORDER BY CASE status WHEN 'läuft' THEN 0 WHEN 'offen' THEN 1 ELSE 2 END, id DESC`)
    .all<TaskRow>()
    .map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.detail,
      status: r.status as TaskItem['status'],
      dueAt: r.due_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }))
}

export function setTaskStatus(id: number, status: TaskItem['status']): void {
  getDb().prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id)
}

// ---------------------------------------------------------------------------
// Einstellungen (Schlüssel/Wert, JSON)
// ---------------------------------------------------------------------------

export function readSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get<{ value: string }>(key)
  return row?.value ?? null
}

export function writeSetting(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO app_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value)
}
