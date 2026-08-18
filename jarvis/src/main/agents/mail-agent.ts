/**
 * MailAgent.
 *
 * Zuständig für Entwürfe, Empfänger, Anhänge, Versand nach Freigabe und
 * die Zuordnung eingehender Antworten.
 *
 * Die wichtigste Regel des ganzen Projekts steht hier drin und ist an drei
 * Stellen abgesichert:
 *   1. `requestSend()` versendet nichts, sondern legt eine Freigabeanfrage an.
 *   2. Der eigentliche Versand läuft nur über `performSend()`, und das prüft
 *      selbst noch einmal, ob eine erteilte Freigabe vorliegt.
 *   3. Ohne Freigabe-Datensatz bricht `performSend()` ab, egal wer es ruft.
 */
import { getApproval } from '../db/repos/system'
import {
  addHistory,
  blockedReason,
  countSendsSince,
  createEmailDraft,
  findEmailByMessageId,
  findEmailByThreadKey,
  getEmail,
  lastSendAt,
  lastSentEmailForCompany,
  logSend,
  openDraftForCompany,
  setEmailStatus,
  setEmailThreadKey,
  updateEmailDraft,
  type EmailDraftInput
} from '../db/repos/outreach'
import { findCompanyIdByEmail, getCompany, markContacted, updateCompanyStatus } from '../db/repos/companies'
import { getMailReader, getMailTransport } from '../mail'
import { MailConfigError } from '../mail/types'
import { deriveGrantedApproval, requestApproval } from '../services/approval'
import { auditError, auditInfo, auditWarn } from '../services/audit'
import { dataChanged, status } from '../services/events'
import { getSettings } from '../services/settings'
import type { ApprovalRequest, EmailDraft, ToolResult, VerificationStatus } from '@shared/types'

const AGENT = 'MailAgent'

// ---------------------------------------------------------------------------
// Entwürfe
// ---------------------------------------------------------------------------

export interface CreateDraftInput extends EmailDraftInput {
  /** Wenn true, wird eine bereits kontaktierte Firma trotzdem erneut angeschrieben. */
  forceSecondContact?: boolean
}

export function createDraft(input: CreateDraftInput): ToolResult<{ email: EmailDraft; warnings: string[] }> {
  const settings = getSettings()
  const warnings: string[] = []

  const blocked = blockedReason(input.toAddress)
  if (blocked) {
    return {
      ok: false,
      error: `${input.toAddress} steht auf der Sperrliste und darf nicht angeschrieben werden.`,
      hint: blocked
    }
  }

  const companyId = input.companyId ?? findCompanyIdByEmail(input.toAddress)
  if (companyId) {
    const company = getCompany(companyId)
    if (company?.doNotContact) {
      return {
        ok: false,
        error: `${company.name} ist als "nicht kontaktieren" markiert.`,
        hint: 'Die Markierung kann in der Firmenansicht aufgehoben werden.'
      }
    }

    const sent = lastSentEmailForCompany(companyId)
    if (sent && !input.forceSecondContact) {
      const days = Math.floor((Date.now() - new Date(sent.sentAt ?? sent.createdAt).getTime()) / 86_400_000)
      if (days < settings.outreach.reContactBlockDays) {
        return {
          ok: false,
          error: `${company?.name ?? 'Diese Firma'} wurde am ${new Date(sent.sentAt ?? sent.createdAt).toLocaleDateString('de-DE')} bereits angeschrieben (vor ${days} Tagen).`,
          hint: 'Für einen zweiten Kontakt bitte ausdrücklich bestätigen (forceSecondContact).'
        }
      }
    }

    const open = openDraftForCompany(companyId)
    if (open) {
      warnings.push(
        `Zu dieser Firma liegt bereits Entwurf #${open.id} ("${open.subject}") im Status ${open.status}.`
      )
    }
  }

  const verification: VerificationStatus = input.recipientVerification ?? 'NICHT_VERIFIZIERT'
  if (verification === 'NICHT_VERIFIZIERT') {
    warnings.push(
      'Die Empfängeradresse ist nicht verifiziert. Der Versand wird später abgelehnt, solange die Vorgabe "nur verifizierte Adressen" aktiv ist.'
    )
  }

  const email = createEmailDraft({ ...input, companyId, recipientVerification: verification })
  if (companyId) updateCompanyStatus(companyId, 'entwurf_erstellt')

  auditInfo(AGENT, 'Entwurf erstellt', `#${email.id} an ${email.toAddress} — "${email.subject}"`, {
    type: 'email',
    id: email.id
  })
  dataChanged('emails')

  return { ok: true, data: { email, warnings } }
}

export function editDraft(
  id: number,
  patch: Partial<Pick<EmailDraft, 'subject' | 'bodyText' | 'bodyHtml' | 'toAddress' | 'cc' | 'bcc'>>
): ToolResult<EmailDraft> {
  const before = getEmail(id)
  if (!before) return { ok: false, error: `Entwurf #${id} existiert nicht.` }
  if (before.status === 'gesendet') {
    return { ok: false, error: `Entwurf #${id} wurde bereits versendet und kann nicht mehr geändert werden.` }
  }

  const after = updateEmailDraft(id, patch)
  if (!after) return { ok: false, error: `Entwurf #${id} ließ sich nicht aktualisieren.` }

  // Eine Aenderung nach der Freigabe setzt die Freigabe zurück. Sonst könnte
  // ein anderer Text versendet werden als der, den der Nutzer gesehen hat.
  if (before.status === 'freigegeben' || before.status === 'wartet_auf_freigabe') {
    setEmailStatus(id, 'entwurf', { approvalId: null })
    auditWarn(AGENT, 'Freigabe verfallen', `Entwurf #${id} wurde nach der Freigabe geändert — Freigabe zurückgesetzt.`, {
      type: 'email',
      id
    })
  }

  auditInfo(AGENT, 'Entwurf geändert', `#${id}: ${Object.keys(patch).join(', ')}`, { type: 'email', id })
  dataChanged('emails')
  return { ok: true, data: getEmail(id) as EmailDraft }
}

/** Der Text, den JARVIS vorliest. Bewusst mit Empfänger und Betreff davor. */
export function readAloudText(email: EmailDraft): string {
  return [
    `Empfänger: ${email.toName ? `${email.toName}, ` : ''}${email.toAddress}.`,
    `Betreff: ${email.subject}.`,
    'Text:',
    email.bodyText
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Versandgrenzen
// ---------------------------------------------------------------------------

export interface SendGuardResult {
  allowed: boolean
  reason: string
}

/** Prüft alles, was unabhängig von der Freigabe gegen einen Versand spricht. */
export function checkSendGuards(email: EmailDraft): SendGuardResult {
  const settings = getSettings()

  const blocked = blockedReason(email.toAddress)
  if (blocked) return { allowed: false, reason: `Empfänger steht auf der Sperrliste: ${blocked}` }

  if (settings.outreach.requireVerifiedAddress && email.recipientVerification !== 'VERIFIZIERT') {
    return {
      allowed: false,
      reason:
        `Die Adresse ${email.toAddress} ist als ${email.recipientVerification} eingestuft. ` +
        'Es dürfen nur verifizierte Adressen angeschrieben werden (Einstellung "nur verifizierte Adressen").'
    }
  }

  const dayStart = new Date(Date.now() - 86_400_000).toISOString()
  const sentToday = countSendsSince(dayStart)
  if (sentToday >= settings.outreach.dailySendLimit) {
    return {
      allowed: false,
      reason: `Das Tageslimit von ${settings.outreach.dailySendLimit} Sendungen ist erreicht (${sentToday} in den letzten 24 Stunden).`
    }
  }

  return { allowed: true, reason: 'ok' }
}

/** Wartet, bis der Mindestabstand zwischen zwei Sendungen eingehalten ist. */
async function respectSendSpacing(): Promise<void> {
  const minSeconds = getSettings().outreach.minSecondsBetweenSends
  if (minSeconds <= 0) return
  const last = lastSendAt()
  if (!last) return
  const wait = new Date(last).getTime() + minSeconds * 1000 - Date.now()
  if (wait > 0) {
    status(`Warte ${Math.ceil(wait / 1000)} Sekunden, damit der Versandabstand eingehalten wird.`)
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}

// ---------------------------------------------------------------------------
// Freigabe und Versand
// ---------------------------------------------------------------------------

/**
 * Beantragt den Versand. Versendet NICHTS.
 *
 * Rückgabe enthält die Freigabe-ID; die Oberfläche zeigt daraufhin den
 * vollständigen Entwurf mit Empfänger, Betreff und Text an.
 */
export function requestSend(emailId: number, requestedBy = AGENT): ToolResult<{ approval: ApprovalRequest }> {
  const email = getEmail(emailId)
  if (!email) return { ok: false, error: `Entwurf #${emailId} existiert nicht.` }
  if (email.status === 'gesendet') {
    return { ok: false, error: `Entwurf #${emailId} wurde bereits am ${email.sentAt} versendet.` }
  }

  const guard = checkSendGuards(email)
  if (!guard.allowed) {
    return {
      ok: false,
      error: guard.reason,
      hint: 'Der Entwurf bleibt erhalten. Bitte Adresse prüfen oder die Vorgaben in den Einstellungen anpassen.'
    }
  }

  const company = email.companyId ? getCompany(email.companyId) : null

  const approval = requestApproval(
    {
      action: 'email_senden',
      title: `E-Mail an ${email.toAddress} senden`,
      details: {
        Empfänger: email.toName ? `${email.toName} <${email.toAddress}>` : email.toAddress,
        Betreff: email.subject,
        Firma: company?.name ?? '(keine Firma zugeordnet)',
        Verifizierung: email.recipientVerification,
        Entwurf: `#${email.id}`
      },
      body: email.bodyText,
      requestedBy,
      relatedEmailId: email.id,
      relatedCompanyId: email.companyId
    },
    async (granted) => performSend(emailId, granted.id)
  )

  setEmailStatus(emailId, 'wartet_auf_freigabe', { approvalId: approval.id })
  if (email.companyId) updateCompanyStatus(email.companyId, 'wartet_auf_freigabe')
  dataChanged('emails')

  return { ok: true, data: { approval } }
}

/**
 * Führt den Versand aus.
 *
 * Wird ausschließlich aus der Freigabe-Engine heraus aufgerufen. Die Prüfung
 * der Freigabe steht trotzdem hier drin — ein zweites Schloss an derselben Tür.
 */
export async function performSend(emailId: number, approvalId: number): Promise<ToolResult<{ messageId: string }>> {
  const email = getEmail(emailId)
  if (!email) return { ok: false, error: `Entwurf #${emailId} existiert nicht mehr.` }
  if (email.status === 'gesendet') {
    return { ok: false, error: `Entwurf #${emailId} wurde bereits versendet — kein zweiter Versand.` }
  }

  const approval = getApproval(approvalId)
  if (!approval) {
    auditError(AGENT, 'Versand ohne Freigabe verhindert', `Entwurf #${emailId}: Freigabe ${approvalId} nicht gefunden.`, {
      type: 'email',
      id: emailId
    })
    return { ok: false, error: 'Zu diesem Versand gibt es keine Freigabe. Es wurde nichts gesendet.' }
  }
  if (approval.status !== 'freigegeben') {
    auditError(
      AGENT,
      'Versand ohne Freigabe verhindert',
      `Entwurf #${emailId}: Freigabe ${approvalId} steht auf "${approval.status}".`,
      { type: 'email', id: emailId }
    )
    return { ok: false, error: `Die Freigabe steht auf "${approval.status}". Es wurde nichts gesendet.` }
  }
  if (approval.relatedEmailId !== emailId) {
    auditError(AGENT, 'Versand ohne Freigabe verhindert', `Freigabe ${approvalId} gehört zu einem anderen Entwurf.`, {
      type: 'email',
      id: emailId
    })
    return { ok: false, error: 'Die Freigabe gehört zu einem anderen Entwurf. Es wurde nichts gesendet.' }
  }

  const guard = checkSendGuards(email)
  if (!guard.allowed) {
    setEmailStatus(emailId, 'fehler', { errorMessage: guard.reason })
    auditError(AGENT, 'Versand abgebrochen', guard.reason, { type: 'email', id: emailId })
    return { ok: false, error: guard.reason }
  }

  let transport
  try {
    transport = getMailTransport()
  } catch (err) {
    const message = err instanceof MailConfigError ? `${err.message} ${err.hint}` : String(err)
    setEmailStatus(emailId, 'fehler', { errorMessage: message })
    auditError(AGENT, 'Versand nicht möglich', message, { type: 'email', id: emailId })
    return { ok: false, error: 'Versand fehlgeschlagen.', hint: message }
  }

  await respectSendSpacing()

  const settings = getSettings()
  const signature = settings.mail.signature ? `\n\n${settings.mail.signature}` : ''
  const optOut = settings.outreach.optOutLine ? `\n\n${settings.outreach.optOutLine}` : ''

  try {
    status(`Sende an ${email.toAddress} ...`)
    const result = await transport.send({
      to: email.toAddress,
      toName: email.toName,
      cc: email.cc,
      bcc: email.bcc,
      subject: email.subject,
      text: `${email.bodyText}${signature}${optOut}`,
      html: email.bodyHtml,
      replyTo: settings.mail.replyTo,
      attachments: email.attachments.map((a) => ({
        filename: a.filename,
        path: a.path,
        contentType: a.contentType
      }))
    })

    const sentAt = new Date().toISOString()
    setEmailStatus(emailId, 'gesendet', { messageId: result.messageId, sentAt, errorMessage: null })
    setEmailThreadKey(emailId, result.messageId)
    logSend({ emailId, address: email.toAddress, transport: result.transport, ok: true, detail: result.detail })

    if (email.companyId) {
      markContacted(email.companyId, sentAt)
      updateCompanyStatus(email.companyId, 'gesendet')
      addHistory({
        companyId: email.companyId,
        emailId,
        contactId: email.contactId,
        kind: 'ausgehend',
        channel: 'email',
        summary: `E-Mail "${email.subject}" an ${email.toAddress} versendet.`,
        occurredAt: sentAt
      })
    }

    auditInfo(AGENT, 'E-Mail versendet', `#${emailId} an ${email.toAddress} (${result.detail})`, {
      type: 'email',
      id: emailId
    })
    dataChanged('emails')

    return { ok: true, data: { messageId: result.messageId }, note: `Gesendet an ${email.toAddress}.` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setEmailStatus(emailId, 'fehler', { errorMessage: message })
    logSend({ emailId, address: email.toAddress, transport: 'smtp', ok: false, detail: message })
    if (email.companyId) updateCompanyStatus(email.companyId, 'fehler')
    auditError(AGENT, 'Versand fehlgeschlagen', `#${emailId} an ${email.toAddress}: ${message}`, {
      type: 'email',
      id: emailId
    })
    dataChanged('emails')
    return {
      ok: false,
      error: `Versand fehlgeschlagen: ${message}`,
      hint: 'Der Entwurf ist erhalten geblieben und steht auf "Fehler". Nach dem Beheben der Ursache kann er erneut freigegeben werden.'
    }
  }
}

/**
 * Sammelfreigabe für mehrere Entwürfe.
 *
 * Auch hier gilt: Es wird nichts versendet. Es entsteht eine einzige
 * Freigabeanfrage, die alle betroffenen Empfänger auflistet.
 */
export function requestBulkSend(emailIds: number[], requestedBy = AGENT): ToolResult<{ approval: ApprovalRequest }> {
  if (emailIds.length === 0) return { ok: false, error: 'Es wurden keine Entwürfe ausgewählt.' }

  const emails = emailIds.map((id) => getEmail(id)).filter((e): e is EmailDraft => e !== null)
  if (emails.length === 0) return { ok: false, error: 'Keiner der angegebenen Entwürfe existiert.' }

  const blockedList: string[] = []
  const sendable: EmailDraft[] = []
  for (const email of emails) {
    const guard = checkSendGuards(email)
    if (guard.allowed) sendable.push(email)
    else blockedList.push(`#${email.id} ${email.toAddress}: ${guard.reason}`)
  }

  if (sendable.length === 0) {
    return {
      ok: false,
      error: 'Keiner der Entwürfe darf versendet werden.',
      hint: blockedList.join(' | ')
    }
  }

  const approval = requestApproval(
    {
      action: 'email_bulk_senden',
      title: `${sendable.length} E-Mails versenden`,
      details: {
        Anzahl: String(sendable.length),
        Empfänger: sendable.map((e) => e.toAddress).join(', ').slice(0, 800),
        Zurückgestellt: blockedList.length > 0 ? String(blockedList.length) : '0'
      },
      body: sendable
        .map((e) => `--- #${e.id} an ${e.toAddress}\nBetreff: ${e.subject}\n\n${e.bodyText}`)
        .join('\n\n'),
      requestedBy
    },
    async (granted) => {
      let sent = 0
      const errors: string[] = []
      for (const email of sendable) {
        // Jede Einzelmail bekommt einen eigenen Freigabe-Datensatz, damit
        // performSend seine Prüfung behält. Er entsteht bereits freigegeben —
        // entschieden hat der Nutzer ja schon, und zwar über alle zusammen.
        const single = deriveGrantedApproval(granted, {
          action: 'email_senden',
          title: `E-Mail an ${email.toAddress} senden`,
          details: { Empfänger: email.toAddress, Betreff: email.subject },
          body: email.bodyText,
          requestedBy: AGENT,
          relatedEmailId: email.id,
          relatedCompanyId: email.companyId
        })

        if (!single) {
          errors.push(`#${email.id}: Einzelfreigabe ließ sich nicht aus der Sammelfreigabe ableiten.`)
          continue
        }

        const result = await performSend(email.id, single.id)
        if (result.ok) sent++
        else errors.push(`#${email.id}: ${result.error}`)
      }

      if (errors.length === 0) {
        return { ok: true, data: { sent }, note: `${sent} E-Mails versendet.` }
      }
      return {
        ok: false,
        error: `${sent} von ${sendable.length} versendet, ${errors.length} fehlgeschlagen.`,
        hint: errors.join(' | ')
      }
    }
  )

  for (const email of sendable) {
    setEmailStatus(email.id, 'wartet_auf_freigabe', { approvalId: approval.id })
  }
  dataChanged('emails')

  return {
    ok: true,
    data: { approval },
    note:
      blockedList.length > 0
        ? `${sendable.length} freigabebereit, ${blockedList.length} zurückgestellt: ${blockedList.join(' | ')}`
        : undefined
  }
}

// ---------------------------------------------------------------------------
// Antworten zuordnen
// ---------------------------------------------------------------------------

export async function syncReplies(sinceDays = 30): Promise<ToolResult<{ scanned: number; matched: number }>> {
  const reader = getMailReader()
  if (!reader) {
    return {
      ok: false,
      error: 'Es ist kein Posteingang eingerichtet.',
      hint: 'Einstellungen -> E-Mail -> Posteingang (IMAP) ausfüllen, oder Gmail verbinden.'
    }
  }

  let messages
  try {
    messages = await reader.fetchRecent({ sinceDays, limit: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Der Posteingang ließ sich nicht lesen: ${message}` }
  }

  let matched = 0
  for (const message of messages) {
    // Zuordnung erstens über In-Reply-To/References, zweitens über die
    // Absenderadresse der Firma.
    const candidates = [message.inReplyTo, ...message.references].filter((r): r is string => Boolean(r))
    let email: EmailDraft | null = null
    for (const key of candidates) {
      email = findEmailByThreadKey(key) ?? findEmailByMessageId(key)
      if (email) break
    }

    const companyId = email?.companyId ?? findCompanyIdByEmail(message.fromAddress)
    if (!companyId) continue

    addHistory({
      companyId,
      emailId: email?.id ?? null,
      kind: 'eingehend',
      channel: 'email',
      summary: `Antwort von ${message.fromAddress}: "${message.subject}"`,
      occurredAt: message.date
    })
    updateCompanyStatus(companyId, 'antwort_erhalten')
    matched++
  }

  auditInfo(AGENT, 'Antworten abgeglichen', `${messages.length} Nachrichten gelesen, ${matched} zugeordnet.`)
  dataChanged('companies')

  return { ok: true, data: { scanned: messages.length, matched } }
}
