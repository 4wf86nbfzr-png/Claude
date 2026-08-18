/**
 * IPC-Handler.
 *
 * Dünne Schicht: Eingaben prüfen, den passenden Dienst rufen, Ergebnis
 * zurückgeben. Fachlogik gehört nicht hierher.
 */
import { app, ipcMain, shell } from 'electron'
import { cancelCurrentRun, currentConversationId, handleUserMessage, startNewConversation } from './agents/core'
import { editDraft, requestBulkSend, requestSend, syncReplies } from './agents/mail-agent'
import { runCampaign } from './agents/outreach-agent'
import {
  deleteCompany,
  getCompany,
  listCompanies,
  setDoNotContact,
  updateCompanyFields
} from './db/repos/companies'
import { createCampaign, getEmail, listCampaigns, listEmails } from './db/repos/outreach'
import { forgetFact, forgetScope, listMemory, listMessages, listTasks } from './db/repos/system'
import { runGoogleOAuth } from './mail/oauth'
import { getMailTransport } from './mail'
import { MailConfigError } from './mail/types'
import { allApprovals, decide } from './services/approval'
import { recentAudit } from './services/audit'
import { credentialStatus, clearSecret, getSecret, setSecret } from './services/credentials'
import { checkPath } from './services/filesafety'
import { dataChanged } from './services/events'
import { getDataDir } from './services/runtime'
import { listSendCenter } from './services/sendcenter'
import { getSettings, updateSettings } from './services/settings'
import { runSetupChecks } from './services/setup'
import { resetLlmCache } from './llm'
import { transcribe } from './voice/stt'
import { speak } from './voice/tts'
import { IPC, type SendCenterFilter } from '@shared/ipc'
import type { ToolResult } from '@shared/types'

function failure(error: string, hint?: string): ToolResult<never> {
  return hint ? { ok: false, error, hint } : { ok: false, error }
}

export function registerIpcHandlers(): void {
  // ---- Gespräch ----------------------------------------------------------
  ipcMain.handle(IPC.chatSend, async (_event, text: string, opts?: { spoken?: boolean }) => {
    if (typeof text !== 'string') return failure('Ungültige Eingabe.')
    const result = await handleUserMessage(text, opts ?? {})
    return result.ok ? { ok: true, data: { conversationId: currentConversationId() } } : result
  })
  ipcMain.handle(IPC.chatCancel, () => {
    cancelCurrentRun()
  })
  ipcMain.handle(IPC.chatHistory, (_event, limit?: number) => listMessages(currentConversationId(), limit ?? 100))
  ipcMain.handle(IPC.chatNewConversation, () => ({ conversationId: startNewConversation() }))

  // ---- Freigaben ----------------------------------------------------------
  ipcMain.handle(IPC.approvalsList, (_event, status?: string) => allApprovals(status))
  ipcMain.handle(
    IPC.approvalsDecide,
    async (_event, id: number, decision: 'freigegeben' | 'abgelehnt', utterance?: string) => {
      const outcome = await decide(id, decision, utterance ?? 'über die Oberfläche entschieden')
      if (!outcome.ok) return outcome
      const inner = outcome.data.result
      // Das Ergebnis der ausgeführten Aktion durchreichen — auch Fehler.
      if (inner && !inner.ok) return inner
      return { ok: true, data: outcome.data.approval, note: inner?.note }
    }
  )

  // ---- Versandzentrale ----------------------------------------------------
  ipcMain.handle(IPC.sendCenterList, (_event, filter?: SendCenterFilter) => listSendCenter(filter ?? {}))
  ipcMain.handle(IPC.sendCenterApprove, (_event, emailIds: number[]) => {
    if (!Array.isArray(emailIds) || emailIds.length === 0) return failure('Es wurde nichts ausgewählt.')
    if (emailIds.length === 1) {
      const result = requestSend(emailIds[0], 'Oberfläche')
      return result.ok ? { ok: true, data: { approvalIds: [result.data.approval.id] } } : result
    }
    const result = requestBulkSend(emailIds, 'Oberfläche')
    return result.ok ? { ok: true, data: { approvalIds: [result.data.approval.id] } } : result
  })
  ipcMain.handle(IPC.sendCenterSendApproved, () =>
    failure(
      'Ein direkter Versand ohne Freigabe ist nicht vorgesehen.',
      'Bitte den Entwurf zur Freigabe stellen und dort "Freigeben und senden" wählen.'
    )
  )

  // ---- Firmen -------------------------------------------------------------
  ipcMain.handle(IPC.companiesList, (_event, search?: string) => listCompanies(search))
  ipcMain.handle(IPC.companyGet, (_event, id: number) => getCompany(id))
  ipcMain.handle(IPC.companyDelete, (_event, id: number) => {
    const removed = deleteCompany(id)
    dataChanged('companies')
    return removed > 0 ? { ok: true, data: null } : failure(`Firma ${id} existiert nicht.`)
  })
  ipcMain.handle(IPC.companySetDoNotContact, (_event, id: number, value: boolean, reason?: string) => {
    if (!getCompany(id)) return failure(`Firma ${id} existiert nicht.`)
    setDoNotContact(id, value)
    if (reason) updateCompanyFields(id, { notes: reason })
    dataChanged('companies')
    return { ok: true, data: null }
  })

  // ---- E-Mails ------------------------------------------------------------
  ipcMain.handle(IPC.emailGet, (_event, id: number) => getEmail(id))
  ipcMain.handle(IPC.emailList, (_event, filter?: { status?: string; campaignId?: number }) => listEmails(filter ?? {}))
  ipcMain.handle(IPC.emailUpdate, (_event, id: number, patch: Record<string, string>) => editDraft(id, patch))
  ipcMain.handle(IPC.emailSyncReplies, () => syncReplies())

  // ---- Kampagnen ----------------------------------------------------------
  ipcMain.handle(IPC.campaignsList, () => listCampaigns())
  ipcMain.handle(IPC.campaignCreate, (_event, input: Record<string, unknown>) => {
    const name = String(input?.name ?? '').trim()
    const service = String(input?.service ?? '').trim()
    const region = String(input?.region ?? '').trim()
    if (!name || !service || !region) return failure('Name, Leistung und Region werden gebraucht.')
    const campaign = createCampaign({
      name,
      service,
      region,
      targetCount: Number(input?.targetCount ?? 20),
      radiusKm: input?.radiusKm === undefined || input?.radiusKm === null ? null : Number(input.radiusKm),
      briefing: input?.briefing ? String(input.briefing) : null
    })
    dataChanged('campaigns')
    return { ok: true, data: campaign }
  })
  ipcMain.handle(IPC.campaignRun, (_event, id: number) => {
    // Läuft im Hintergrund weiter; der Fortschritt kommt über Ereignisse.
    void runCampaign(id)
    return { ok: true, data: { started: true } }
  })

  // ---- Protokoll, Gedächtnis, Aufgaben -----------------------------------
  ipcMain.handle(IPC.auditList, (_event, limit?: number) => recentAudit(limit ?? 300))
  ipcMain.handle(IPC.memoryList, (_event, scope?: string) => listMemory(scope))
  ipcMain.handle(IPC.memoryDelete, (_event, id: number) => {
    const removed = forgetFact(id)
    dataChanged('memory')
    return removed > 0 ? { ok: true, data: null } : failure(`Notiz ${id} existiert nicht.`)
  })
  ipcMain.handle(IPC.memoryClearScope, (_event, scope: string) => {
    const deleted = forgetScope(scope)
    dataChanged('memory')
    return { ok: true, data: { deleted } }
  })
  ipcMain.handle(IPC.tasksList, () => listTasks())

  // ---- Einstellungen und Zugänge -----------------------------------------
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, (_event, patch: Record<string, unknown>) => {
    const next = updateSettings(patch)
    resetLlmCache()
    return { ok: true, data: next }
  })
  ipcMain.handle(IPC.credentialsStatus, () => credentialStatus())
  ipcMain.handle(IPC.credentialsSet, (_event, key: string, value: string) => {
    if (!key || typeof value !== 'string') return failure('Schlüssel und Wert werden gebraucht.')
    setSecret(key, value)
    resetLlmCache()
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.credentialsClear, (_event, key: string) => {
    clearSecret(key)
    resetLlmCache()
    return { ok: true, data: null }
  })
  ipcMain.handle(IPC.setupCheck, () => runSetupChecks())

  // ---- Mail-Verbindung ----------------------------------------------------
  ipcMain.handle(IPC.mailTestConnection, async () => {
    try {
      const transport = getMailTransport()
      const check = await transport.verify()
      return check.ok
        ? { ok: true, data: { transport: transport.id, detail: check.detail } }
        : failure(check.detail, 'Zugangsdaten und Server prüfen.')
    } catch (err) {
      if (err instanceof MailConfigError) return failure(err.message, err.hint)
      return failure(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle(IPC.gmailStartOAuth, async () => {
    const settings = getSettings()
    const clientId = getSecret('GMAIL_CLIENT_ID') ?? settings.mail.gmail.clientId
    const clientSecret = getSecret('GMAIL_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      return failure(
        'Es fehlen Client-ID und Client-Secret für Gmail.',
        'In der Google Cloud Console ein OAuth-Client vom Typ "Desktop" anlegen und beides unter Zugänge eintragen.'
      )
    }
    try {
      const tokens = await runGoogleOAuth({
        clientId,
        clientSecret,
        port: settings.mail.gmail.redirectPort
      })
      if (!tokens.refreshToken) {
        return failure(
          'Google hat kein Refresh-Token geliefert.',
          'In den Google-Kontoeinstellungen den Zugriff von JARVIS entfernen und die Anmeldung wiederholen.'
        )
      }
      setSecret('GMAIL_REFRESH_TOKEN', tokens.refreshToken)
      if (tokens.email) {
        updateSettings({ mail: { transport: 'gmail', fromAddress: tokens.email } })
      }
      return { ok: true, data: { email: tokens.email ?? '(unbekannt)' } }
    } catch (err) {
      return failure(err instanceof Error ? err.message : String(err))
    }
  })

  // ---- Sprache ------------------------------------------------------------
  ipcMain.handle(IPC.voiceTranscribe, (_event, audioBase64: string, mimeType: string) =>
    transcribe(audioBase64, mimeType || 'audio/webm')
  )
  ipcMain.handle(IPC.voiceSpeak, async (_event, text: string) => {
    const result = await speak(text)
    if (!result.ok) return result
    return { ok: true, data: { audioBase64: result.data.audioBase64, mimeType: result.data.mimeType } }
  })

  // ---- System -------------------------------------------------------------
  ipcMain.handle(IPC.openPath, async (_event, target: string) => {
    if (/^https?:\/\//i.test(target)) {
      await shell.openExternal(target)
      return { ok: true, data: null }
    }
    const check = checkPath(target)
    if (!check.ok) return failure(check.error as string)
    const error = await shell.openPath(check.path)
    return error ? failure(error) : { ok: true, data: null }
  })

  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    dataDir: getDataDir(),
    platform: process.platform
  }))
}
