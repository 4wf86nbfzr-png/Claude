/**
 * Brücke zwischen Fenster und Main-Prozess.
 *
 * Das Fenster bekommt genau diese Methoden und sonst nichts: kein `require`,
 * kein Dateisystem, kein Node. contextIsolation bleibt eingeschaltet.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { JarvisApi, SendCenterFilter } from '@shared/ipc'
import type { JarvisEvent } from '@shared/types'

const api: JarvisApi = {
  chat: {
    send: (text, opts) => ipcRenderer.invoke(IPC.chatSend, text, opts),
    cancel: () => ipcRenderer.invoke(IPC.chatCancel),
    history: (limit) => ipcRenderer.invoke(IPC.chatHistory, limit),
    newConversation: () => ipcRenderer.invoke(IPC.chatNewConversation)
  },

  onEvent(handler: (event: JarvisEvent) => void) {
    const listener = (_event: IpcRendererEvent, payload: JarvisEvent): void => handler(payload)
    ipcRenderer.on(IPC.event, listener)
    return () => {
      ipcRenderer.removeListener(IPC.event, listener)
    }
  },

  approvals: {
    list: (status) => ipcRenderer.invoke(IPC.approvalsList, status),
    decide: (id, decision, utterance) => ipcRenderer.invoke(IPC.approvalsDecide, id, decision, utterance)
  },

  sendCenter: {
    list: (filter?: SendCenterFilter) => ipcRenderer.invoke(IPC.sendCenterList, filter),
    approve: (emailIds) => ipcRenderer.invoke(IPC.sendCenterApprove, emailIds),
    sendApproved: (emailIds) => ipcRenderer.invoke(IPC.sendCenterSendApproved, emailIds)
  },

  companies: {
    list: (search) => ipcRenderer.invoke(IPC.companiesList, search),
    get: (id) => ipcRenderer.invoke(IPC.companyGet, id),
    remove: (id) => ipcRenderer.invoke(IPC.companyDelete, id),
    setDoNotContact: (id, value, reason) => ipcRenderer.invoke(IPC.companySetDoNotContact, id, value, reason)
  },

  emails: {
    get: (id) => ipcRenderer.invoke(IPC.emailGet, id),
    list: (filter) => ipcRenderer.invoke(IPC.emailList, filter),
    update: (id, patch) => ipcRenderer.invoke(IPC.emailUpdate, id, patch),
    syncReplies: () => ipcRenderer.invoke(IPC.emailSyncReplies)
  },

  campaigns: {
    list: () => ipcRenderer.invoke(IPC.campaignsList),
    create: (input) => ipcRenderer.invoke(IPC.campaignCreate, input),
    run: (id) => ipcRenderer.invoke(IPC.campaignRun, id)
  },

  audit: { list: (limit) => ipcRenderer.invoke(IPC.auditList, limit) },

  memory: {
    list: (scope) => ipcRenderer.invoke(IPC.memoryList, scope),
    remove: (id) => ipcRenderer.invoke(IPC.memoryDelete, id),
    clearScope: (scope) => ipcRenderer.invoke(IPC.memoryClearScope, scope)
  },

  tasks: { list: () => ipcRenderer.invoke(IPC.tasksList) },

  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch)
  },

  credentials: {
    status: () => ipcRenderer.invoke(IPC.credentialsStatus),
    set: (key, value) => ipcRenderer.invoke(IPC.credentialsSet, key, value),
    clear: (key) => ipcRenderer.invoke(IPC.credentialsClear, key)
  },

  setup: { check: () => ipcRenderer.invoke(IPC.setupCheck) },

  mail: {
    testConnection: () => ipcRenderer.invoke(IPC.mailTestConnection),
    startGmailOAuth: () => ipcRenderer.invoke(IPC.gmailStartOAuth)
  },

  voice: {
    transcribe: (audioBase64, mimeType) => ipcRenderer.invoke(IPC.voiceTranscribe, audioBase64, mimeType),
    speak: (text) => ipcRenderer.invoke(IPC.voiceSpeak, text)
  },

  system: {
    openPath: (target) => ipcRenderer.invoke(IPC.openPath, target),
    appInfo: () => ipcRenderer.invoke(IPC.appInfo)
  }
}

contextBridge.exposeInMainWorld('jarvis', api)
