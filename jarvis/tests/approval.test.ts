/**
 * Freigabe-Engine.
 *
 * Der Kern der Sicherheitszusage: ohne Entscheidung passiert nichts, und was
 * passiert, passiert genau einmal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decide,
  interpretApprovalUtterance,
  pendingApprovals,
  registerFallbackExecutor,
  requestApproval
} from '../src/main/services/approval'
import { setupTestEnvironment, teardownTestEnvironment } from './helpers'
import type { ToolResult } from '../src/shared/types'

beforeEach(() => setupTestEnvironment())
afterEach(() => teardownTestEnvironment())

describe('Freigabeanfragen', () => {
  it('legt eine offene Anfrage an, ohne die Aktion auszuführen', async () => {
    const executor = vi.fn(async (): Promise<ToolResult> => ({ ok: true, data: null }))

    const approval = requestApproval(
      { action: 'email_senden', title: 'Test', details: { Empfänger: 'a@b.de' }, requestedBy: 'Test' },
      executor
    )

    expect(approval.status).toBe('offen')
    expect(executor).not.toHaveBeenCalled()
    expect(pendingApprovals().map((a) => a.id)).toContain(approval.id)
  })

  it('führt die Aktion erst nach der Freigabe aus', async () => {
    const executor = vi.fn(async (): Promise<ToolResult> => ({ ok: true, data: { done: true } }))
    const approval = requestApproval(
      { action: 'email_senden', title: 'Test', details: {}, requestedBy: 'Test' },
      executor
    )

    const outcome = await decide(approval.id, 'freigegeben', 'senden')

    expect(outcome.ok).toBe(true)
    expect(executor).toHaveBeenCalledTimes(1)
    expect(pendingApprovals()).toHaveLength(0)
  })

  it('führt bei Ablehnung nichts aus', async () => {
    const executor = vi.fn(async (): Promise<ToolResult> => ({ ok: true, data: null }))
    const approval = requestApproval(
      { action: 'datei_loeschen', title: 'Test', details: {}, requestedBy: 'Test' },
      executor
    )

    const outcome = await decide(approval.id, 'abgelehnt', 'nein')

    expect(outcome.ok).toBe(true)
    expect(executor).not.toHaveBeenCalled()
  })

  it('lässt sich nicht zweimal entscheiden', async () => {
    const executor = vi.fn(async (): Promise<ToolResult> => ({ ok: true, data: null }))
    const approval = requestApproval(
      { action: 'email_senden', title: 'Test', details: {}, requestedBy: 'Test' },
      executor
    )

    await decide(approval.id, 'freigegeben')
    const second = await decide(approval.id, 'freigegeben')

    expect(second.ok).toBe(false)
    expect(executor).toHaveBeenCalledTimes(1)
  })

  it('reicht einen Fehler der Aktion unverändert durch — kein vorgetäuschter Erfolg', async () => {
    const approval = requestApproval(
      { action: 'email_senden', title: 'Test', details: {}, requestedBy: 'Test' },
      async () => ({ ok: false, error: 'SMTP hat abgelehnt' })
    )

    const outcome = await decide(approval.id, 'freigegeben')

    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.data.result?.ok).toBe(false)
      if (outcome.data.result && !outcome.data.result.ok) {
        expect(outcome.data.result.error).toContain('SMTP')
      }
    }
  })

  it('nutzt den Ersatz-Auftrag, wenn nach einem Neustart keiner mehr im Speicher liegt', async () => {
    const fallback = vi.fn(async (): Promise<ToolResult> => ({ ok: true, data: 'ersatz' }))
    registerFallbackExecutor('email_senden', fallback)

    // Ohne Auftrag angelegt — wie nach einem Neustart.
    const approval = requestApproval({
      action: 'email_senden',
      title: 'Test',
      details: {},
      requestedBy: 'Test'
    })

    await decide(approval.id, 'freigegeben')
    expect(fallback).toHaveBeenCalledTimes(1)
  })
})

describe('Sprachliche Freigabe', () => {
  it('erkennt eindeutige Zustimmung', () => {
    for (const phrase of ['Ja', 'senden', 'Freigeben', 'Mail abschicken', 'Ja, genau so senden', 'einverstanden']) {
      expect(interpretApprovalUtterance(phrase)).toBe('freigabe')
    }
  })

  it('erkennt Ablehnung', () => {
    for (const phrase of ['Nein', 'nicht senden', 'abbrechen', 'lieber nicht', 'stopp']) {
      expect(interpretApprovalUtterance(phrase)).toBe('ablehnung')
    }
  })

  it('hält Halbsätze für unklar statt sie als Freigabe zu werten', () => {
    for (const phrase of [
      'Ja, aber der zweite Absatz muss noch raus',
      'Soll ich das senden?',
      'Erst noch kürzer machen, dann senden',
      'Vielleicht',
      'Der Text ist gut'
    ]) {
      expect(interpretApprovalUtterance(phrase)).toBe('unklar')
    }
  })
})
