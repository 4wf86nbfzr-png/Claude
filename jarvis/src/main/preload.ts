import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc.js';
import type { JarvisApi } from '../shared/ipc.js';
import type { JarvisEvent } from '../shared/types.js';

/**
 * The entire bridge between the renderer and the outside world.
 *
 * The renderer has no Node integration, no `require`, and no access to
 * `ipcRenderer` — it can only call the functions below, each of which maps to
 * one allow-listed channel. Adding a capability to the UI means adding it here
 * and in `shared/ipc.ts`, which keeps the surface reviewable.
 */
const api: JarvisApi = {
  chat: {
    send: (payload) => ipcRenderer.invoke(IPC.chatSend, payload),
    history: (conversationId, limit) => ipcRenderer.invoke(IPC.chatHistory, conversationId, limit),
    newConversation: () => ipcRenderer.invoke(IPC.chatNewConversation),
    cancel: () => ipcRenderer.invoke(IPC.chatCancel),
  },
  approvals: {
    list: () => ipcRenderer.invoke(IPC.approvalsList),
    approve: (id, evidence) => ipcRenderer.invoke(IPC.approvalsApprove, id, evidence),
    reject: (id, evidence) => ipcRenderer.invoke(IPC.approvalsReject, id, evidence),
  },
  companies: {
    sendDesk: (filter) => ipcRenderer.invoke(IPC.companiesSendDesk, filter ?? {}),
    dossier: (companyId) => ipcRenderer.invoke(IPC.companiesDossier, companyId),
    setDoNotContact: (companyId, value, reason) =>
      ipcRenderer.invoke(IPC.companiesSetDnc, companyId, value, reason),
    remove: (companyId) => ipcRenderer.invoke(IPC.companiesRemove, companyId),
  },
  campaigns: {
    list: () => ipcRenderer.invoke(IPC.campaignsList),
    create: (input) => ipcRenderer.invoke(IPC.campaignsCreate, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.campaignsUpdate, id, patch),
    remove: (id) => ipcRenderer.invoke(IPC.campaignsRemove, id),
  },
  research: {
    run: (request) => ipcRenderer.invoke(IPC.researchRun, request),
  },
  outreach: {
    prepare: (request) => ipcRenderer.invoke(IPC.outreachPrepare, request),
  },
  emails: {
    list: (filter) => ipcRenderer.invoke(IPC.emailsList, filter ?? {}),
    get: (id) => ipcRenderer.invoke(IPC.emailsGet, id),
    update: (id, patch) => ipcRenderer.invoke(IPC.emailsUpdate, id, patch),
    requestSend: (id) => ipcRenderer.invoke(IPC.emailsRequestSend, id),
    remove: (id) => ipcRenderer.invoke(IPC.emailsRemove, id),
  },
  audit: {
    list: (limit) => ipcRenderer.invoke(IPC.auditList, limit),
    exportCsv: () => ipcRenderer.invoke(IPC.auditExport),
  },
  memory: {
    list: (kind) => ipcRenderer.invoke(IPC.memoryList, kind),
    remove: (id) => ipcRenderer.invoke(IPC.memoryRemove, id),
    clear: (kind) => ipcRenderer.invoke(IPC.memoryClear, kind),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  },
  credentials: {
    status: () => ipcRenderer.invoke(IPC.credentialsStatus),
    set: (key, value) => ipcRenderer.invoke(IPC.credentialsSet, key, value),
    clear: (key) => ipcRenderer.invoke(IPC.credentialsClear, key),
    test: (key) => ipcRenderer.invoke(IPC.credentialsTest, key),
  },
  voice: {
    transcribe: (audio, mimeType) => ipcRenderer.invoke(IPC.voiceTranscribe, audio, mimeType),
    synthesize: (text) => ipcRenderer.invoke(IPC.voiceSynthesize, text),
    capabilities: () => ipcRenderer.invoke(IPC.voiceCapabilities),
  },
  system: {
    version: () => ipcRenderer.invoke(IPC.systemVersion),
    openPath: (target) => ipcRenderer.invoke(IPC.systemOpenPath, target),
    pickFile: (options) => ipcRenderer.invoke(IPC.systemPickFile, options),
  },
  onEvent(listener: (event: JarvisEvent) => void) {
    const handler = (_event: unknown, payload: JarvisEvent): void => listener(payload);
    ipcRenderer.on(IPC.event, handler);
    return () => {
      ipcRenderer.removeListener(IPC.event, handler);
    };
  },
};

contextBridge.exposeInMainWorld('jarvis', api);
