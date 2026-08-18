/**
 * MailAgent — die Regel, um die es in diesem Projekt vor allem geht:
 * ohne Freigabe geht keine E-Mail raus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureForSending, setupTestEnvironment, teardownTestEnvironment } from './helpers'
import type { MailTransport, OutgoingMail, SendResult } from '../src/main/mail/types'

// Der Versandweg wird ersetzt: die Tests prüfen das Verhalten von JARVIS,
// nicht das eines fremden SMTP-Servers.
const sent: OutgoingMail[] = []
let sendBehaviour: 'ok' | 'fehler' = 'ok'

vi.mock('../src/main/mail', async () => {
  const transport: MailTransport = {
    id: 'smtp',
    fromAddress: 'dispo@example-absender.de',
    async verify() {
      return { ok: true, detail: 'Testversand' }
    },
    async send(mail: OutgoingMail): Promise<SendResult> {
      if (sendBehaviour === 'fehler') throw new Error('550 Mailbox unavailable')
      sent.push(mail)
      return {
        messageId: `<test-${sent.length}@example-absender.de>`,
        accepted: [mail.to],
        rejected: [],
        transport: 'smtp',
        detail: '250 OK'
      }
    }
  }
  return {
    getMailTransport: () => transport,
    getMailReader: () => null
  }
})

import { createDraft, editDraft, performSend, requestBulkSend, requestSend } from '../src/main/agents/mail-agent'
import { upsertCompany, upsertEmailAddress } from '../src/main/db/repos/companies'
import { addToDoNotContact, getEmail } from '../src/main/db/repos/outreach'
import { decide, requestApproval } from '../src/main/services/approval'
import { updateSettings } from '../src/main/services/settings'

function seedCompany(name = 'Bau Nord GmbH', address = 'info@bau-nord.de'): { companyId: number; address: string } {
  const { company } = upsertCompany({ name, website: `https://${address.split('@')[1]}/` })
  upsertEmailAddress({
    companyId: company.id,
    address,
    status: 'VERIFIZIERT',
    statusReason: 'Impressum, Domain passt, MX vorhanden.',
    isPrimary: true
  })
  return { companyId: company.id, address }
}

beforeEach(() => {
  setupTestEnvironment()
  configureForSending()
  sent.length = 0
  sendBehaviour = 'ok'
})
afterEach(() => teardownTestEnvironment())

describe('Versand ohne Freigabe', () => {
  it('sendet beim Beantragen nichts', () => {
    const { companyId, address } = seedCompany()
    const draft = createDraft({
      companyId,
      toAddress: address,
      subject: 'Baustellenbewachung',
      bodyText: 'Guten Tag ...',
      recipientVerification: 'VERIFIZIERT'
    })
    expect(draft.ok).toBe(true)
    if (!draft.ok) return

    const request = requestSend(draft.data.email.id)
    expect(request.ok).toBe(true)
    expect(sent).toHaveLength(0)
    expect(getEmail(draft.data.email.id)?.status).toBe('wartet_auf_freigabe')
  })

  it('weist performSend ohne vorhandene Freigabe ab', async () => {
    const { companyId, address } = seedCompany()
    const draft = createDraft({
      companyId,
      toAddress: address,
      subject: 'Test',
      bodyText: 'Text',
      recipientVerification: 'VERIFIZIERT'
    })
    if (!draft.ok) throw new Error('Entwurf fehlgeschlagen')

    const result = await performSend(draft.data.email.id, 999999)

    expect(result.ok).toBe(false)
    expect(sent).toHaveLength(0)
    if (!result.ok) expect(result.error).toMatch(/keine Freigabe/i)
  })

  it('weist performSend ab, solange die Freigabe noch offen ist', async () => {
    const { companyId, address } = seedCompany()
    const draft = createDraft({
      companyId,
      toAddress: address,
      subject: 'Test',
      bodyText: 'Text',
      recipientVerification: 'VERIFIZIERT'
    })
    if (!draft.ok) throw new Error('Entwurf fehlgeschlagen')

    const approval = requestApproval({
      action: 'email_senden',
      title: 'Test',
      details: {},
      requestedBy: 'Test',
      relatedEmailId: draft.data.email.id
    })

    const result = await performSend(draft.data.email.id, approval.id)

    expect(result.ok).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('weist eine Freigabe ab, die zu einem anderen Entwurf gehört', async () => {
    const first = seedCompany('Firma A', 'info@firma-a.de')
    const second = seedCompany('Firma B', 'info@firma-b.de')

    const draftA = createDraft({
      companyId: first.companyId,
      toAddress: first.address,
      subject: 'A',
      bodyText: 'A',
      recipientVerification: 'VERIFIZIERT'
    })
    const draftB = createDraft({
      companyId: second.companyId,
      toAddress: second.address,
      subject: 'B',
      bodyText: 'B',
      recipientVerification: 'VERIFIZIERT'
    })
    if (!draftA.ok || !draftB.ok) throw new Error('Entwürfe fehlgeschlagen')

    const requestA = requestSend(draftA.data.email.id)
    if (!requestA.ok) throw new Error('Anfrage fehlgeschlagen')

    // Freigabe erteilen, dann versuchen, damit den anderen Entwurf zu senden.
    await decide(requestA.data.approval.id, 'freigegeben', 'senden')
    sent.length = 0

    const result = await performSend(draftB.data.email.id, requestA.data.approval.id)
    expect(result.ok).toBe(false)
    expect(sent).toHaveLength(0)
  })
})

describe('Versand nach Freigabe', () => {
  it('sendet genau einmal und protokolliert das Ergebnis', async () => {
    const { companyId, address } = seedCompany()
    const draft = createDraft({
      companyId,
      toAddress: address,
      subject: 'Baustellenbewachung',
      bodyText: 'Guten Tag ...',
      recipientVerification: 'VERIFIZIERT'
    })
    if (!draft.ok) throw new Error('Entwurf fehlgeschlagen')

    const request = requestSend(draft.data.email.id)
    if (!request.ok) throw new Error('Anfrage fehlgeschlagen')

    const outcome = await decide(request.data.approval.id, 'freigegeben', 'ja, senden')

    expect(outcome.ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe(address)

    const after = getEmail(draft.data.email.id)
    expect(after?.status).toBe('gesendet')
    expect(after?.sentAt).toBeTruthy()
    expect(after?.messageId).toBeTruthy()
  })

  it('hängt Signatur und Abmeldehinweis an, nicht in den Entwurfstext', async () => {
    updateSettings({
      mail: { signature: 'Testfirma GmbH\nHamburg' },
      outreach: { optOutLine: 'Keine weiteren Nachrichten? Kurze Antwort genügt.' }
    })

    const { companyId, address } = seedCompany()
    const draft = createDraft({
      companyId,
      toAddress: address,
      subject: 'Test',
      bodyText: 'Nur der Fließtext.',
      recipientVerification: 'VERIFIZIERT'
    })
    if (!draft.ok) throw new Error('Entwurf fehlgeschlagen')

    const request = requestSend(draft.data.email.id)
    if (!request.ok) throw new Error('Anfrage fehlgeschlagen')
    await decide(request.data.approval.id, 'freigegeben')

    expect(getEmail(draft.data.email.id)?.bodyText).toBe('Nur der Fließtext.')
    expect(sent[0].text).toContain('Testfirma GmbH')
    expect(sent[0].text).toContain('Keine weiteren Nachrichten')
  })

  it('meldet einen Fehler des Servers als Fehler — nicht als Erfolg', async () => {
    sendBehaviour = 'fehler'
    const { companyId, address } = seedCompany()
    const draft = createDraft({
      companyId,
      toAddress: address,
      subject: 'Test',
      bodyText: 'Text',
      recipientVerification: 'VERIFIZIERT'
    })
    if (!draft.ok) throw new Error('Entwurf fehlgeschlagen')

    const request = requestSend(draft.data.email.id)
    if (!request.ok) throw new Error('Anfrage fehlgeschlagen')

    const outcome = await decide(request.data.approval.id, 'freigegeben')

    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.data.result?.ok).toBe(false)

    const after = getEmail(draft.data.email.id)
    expect(after?.status).toBe('fehler')
    expect(after?.errorMessage).toContain('550')
    expect(after?.sentAt).toBeNull()
  })

  it('sendet einen bereits versendeten Entwurf nicht erneut', async () => {
    const { companyId, address } = seedCompany()
    const draft = createDraft({
      companyId,
      toAddress: address,
      subject: 'Test',
      bodyText: 'Text',
      recipientVerification: 'VERIFIZIERT'
    })
    if (!draft.ok) throw new Error('Entwurf fehlgeschlagen')

    const request = requestSend(draft.data.email.id)
    if (!request.ok) throw new Error('Anfrage fehlgeschlagen')
    await decide(request.data.approval.id, 'freigegeben')
    expect(sent).toHaveLength(1)

    const again = await performSend(draft.data.email.id, request.data.approval.id)
    expect(again.ok).toBe(false)
    expect(sent).toHaveLength(1)
  })
})

describe('Sammelversand', () => {
  function seedDrafts(count: number): number[] {
    const ids: number[] = []
    for (let index = 0; index < count; index++) {
      const { companyId, address } = seedCompany(`Firma ${index}`, `info@firma-${index}.de`)
      const draft = createDraft({
        companyId,
        toAddress: address,
        subject: `Angebot ${index}`,
        bodyText: `Text ${index}`,
        recipientVerification: 'VERIFIZIERT'
      })
      if (!draft.ok) throw new Error('Entwurf fehlgeschlagen')
      ids.push(draft.data.email.id)
    }
    return ids
  }

  it('legt eine einzige Anfrage an und versendet vorher nichts', () => {
    const ids = seedDrafts(3)
    const result = requestBulkSend(ids)

    expect(result.ok).toBe(true)
    expect(sent).toHaveLength(0)
    if (result.ok) expect(result.data.approval.details.Anzahl).toBe('3')
    for (const id of ids) expect(getEmail(id)?.status).toBe('wartet_auf_freigabe')
  })

  it('versendet nach einer Freigabe alle Mails, ohne weitere Dialoge zu öffnen', async () => {
    const ids = seedDrafts(3)
    const request = requestBulkSend(ids)
    if (!request.ok) throw new Error('Sammelanfrage fehlgeschlagen')

    const outcome = await decide(request.data.approval.id, 'freigegeben', 'alle senden')

    expect(outcome.ok).toBe(true)
    expect(sent).toHaveLength(3)
    for (const id of ids) expect(getEmail(id)?.status).toBe('gesendet')

    // Es darf nichts offen zurückbleiben, was der Nutzer noch entscheiden müsste.
    const { pendingApprovals } = await import('../src/main/services/approval')
    expect(pendingApprovals()).toHaveLength(0)
  })

  it('stellt Entwürfe zurück, die eine Regel verletzen, und sendet den Rest', async () => {
    const ids = seedDrafts(2)

    const blocked = upsertCompany({ name: 'Unverifiziert', website: 'https://unverifiziert.de/' })
    const weakDraft = createDraft({
      companyId: blocked.company.id,
      toAddress: 'info@unverifiziert.de',
      subject: 'Test',
      bodyText: 'Text',
      recipientVerification: 'WAHRSCHEINLICH'
    })
    if (!weakDraft.ok) throw new Error('Entwurf fehlgeschlagen')

    const request = requestBulkSend([...ids, weakDraft.data.email.id])
    expect(request.ok).toBe(true)
    if (request.ok) expect(request.note).toMatch(/zurückgestellt/)

    if (!request.ok) return
    await decide(request.data.approval.id, 'freigegeben')

    expect(sent).toHaveLength(2)
    expect(getEmail(weakDraft.data.email.id)?.status).not.toBe('gesendet')
  })
})

describe('Schutzregeln', () => {
  it('lässt nicht verifizierte Adressen nicht zur Freigabe zu', () => {
    const { company } = upsertCompany({ name: 'Unklar GmbH', website: 'https://unklar.de/' })
    const draft = createDraft({
      companyId: company.id,
      toAddress: 'kontakt@unklar.de',
      subject: 'Test',
      bodyText: 'Text',
      recipientVerification: 'WAHRSCHEINLICH'
    })
    if (!draft.ok) throw new Error('Entwurf fehlgeschlagen')

    const request = requestSend(draft.data.email.id)
    expect(request.ok).toBe(false)
    if (!request.ok) expect(request.error).toMatch(/WAHRSCHEINLICH/)
  })

  it('legt zu gesperrten Empfängern gar keinen Entwurf an', () => {
    addToDoNotContact('bau-nord.de', 'domain', 'Hat Werbung abbestellt.')
    const { companyId, address } = seedCompany()

    const draft = createDraft({
      companyId,
      toAddress: address,
      subject: 'Test',
      bodyText: 'Text',
      recipientVerification: 'VERIFIZIERT'
    })

    expect(draft.ok).toBe(false)
    if (!draft.ok) expect(draft.error).toMatch(/Sperrliste/)
  })

  it('erkennt eine bereits angeschriebene Firma und verhindert den zweiten Erstkontakt', async () => {
    const { companyId, address } = seedCompany()
    const first = createDraft({
      companyId,
      toAddress: address,
      subject: 'Erstkontakt',
      bodyText: 'Text',
      recipientVerification: 'VERIFIZIERT'
    })
    if (!first.ok) throw new Error('Entwurf fehlgeschlagen')

    const request = requestSend(first.data.email.id)
    if (!request.ok) throw new Error('Anfrage fehlgeschlagen')
    await decide(request.data.approval.id, 'freigegeben')

    const second = createDraft({
      companyId,
      toAddress: address,
      subject: 'Nochmal',
      bodyText: 'Text',
      recipientVerification: 'VERIFIZIERT'
    })

    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error).toMatch(/bereits angeschrieben/)

    // Auf ausdrücklichen Wunsch geht es trotzdem.
    const forced = createDraft({
      companyId,
      toAddress: address,
      subject: 'Nachfassen',
      bodyText: 'Text',
      recipientVerification: 'VERIFIZIERT',
      forceSecondContact: true
    })
    expect(forced.ok).toBe(true)
  })

  it('hält das Tageslimit ein', () => {
    updateSettings({ outreach: { dailySendLimit: 0 } })
    const { companyId, address } = seedCompany()
    const draft = createDraft({
      companyId,
      toAddress: address,
      subject: 'Test',
      bodyText: 'Text',
      recipientVerification: 'VERIFIZIERT'
    })
    if (!draft.ok) throw new Error('Entwurf fehlgeschlagen')

    const request = requestSend(draft.data.email.id)
    expect(request.ok).toBe(false)
    if (!request.ok) expect(request.error).toMatch(/Tageslimit/)
  })

  it('setzt eine erteilte Freigabe zurück, wenn der Text danach geändert wird', () => {
    const { companyId, address } = seedCompany()
    const draft = createDraft({
      companyId,
      toAddress: address,
      subject: 'Test',
      bodyText: 'Ursprungstext',
      recipientVerification: 'VERIFIZIERT'
    })
    if (!draft.ok) throw new Error('Entwurf fehlgeschlagen')

    requestSend(draft.data.email.id)
    expect(getEmail(draft.data.email.id)?.status).toBe('wartet_auf_freigabe')

    editDraft(draft.data.email.id, { bodyText: 'Geänderter Text' })

    expect(getEmail(draft.data.email.id)?.status).toBe('entwurf')
  })
})
