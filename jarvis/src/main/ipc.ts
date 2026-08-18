import { dialog, ipcMain, shell, app } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IPC } from '../shared/ipc.js';
import type {
  ChatSendPayload,
  DraftPatch,
  OutreachRequest,
  ResearchRequest,
  SendDeskFilter,
} from '../shared/ipc.js';
import type {
  AppSettings,
  CampaignRecord,
  CredentialKey,
  EmailStatus,
  SendDeskRow,
  VerificationStatus,
} from '../shared/types.js';
import { err, makeError, ok } from '../shared/types.js';
import type { JarvisRuntime } from '../core/runtime.js';
import { createMailTransport, createMailReader } from '../core/mail/factory.js';
import { createSearchProvider } from '../core/research/search.js';
import { CREDENTIAL_KEYS } from '../core/services/CredentialService.js';
import { createLlmProvider } from '../core/llm/factory.js';

/**
 * Registers exactly the channels declared in `shared/ipc.ts`.
 *
 * Handlers are the trust boundary: everything arriving here comes from the
 * renderer and is treated as untrusted input, so every payload is narrowed
 * before it reaches the core.
 */
export function registerIpc(runtime: JarvisRuntime): void {
  const { core, repos, services, agents } = runtime;

  /* -------------------- chat -------------------- */

  ipcMain.handle(IPC.chatSend, async (_event, payload: ChatSendPayload) => {
    const conversationId = typeof payload?.conversationId === 'string' && payload.conversationId
      ? payload.conversationId
      : (services.memory.latestConversationId() ?? core.newConversation());
    return core.handle({
      text: String(payload?.text ?? ''),
      conversationId,
      spoken: Boolean(payload?.spoken),
    });
  });

  ipcMain.handle(IPC.chatHistory, (_event, conversationId: string, limit?: number) =>
    core.history(String(conversationId), clampInt(limit, 1, 500, 100)),
  );

  ipcMain.handle(IPC.chatNewConversation, () => core.newConversation());

  ipcMain.handle(IPC.chatCancel, () => {
    core.cancel();
  });

  /* -------------------- approvals -------------------- */

  ipcMain.handle(IPC.approvalsList, () => services.approvals.listOpen());

  ipcMain.handle(IPC.approvalsApprove, (_event, id: number, evidence: string) =>
    services.approvals.decide(toInt(id), true, String(evidence ?? 'Schaltfläche „Freigeben & senden"')),
  );

  ipcMain.handle(IPC.approvalsReject, (_event, id: number, evidence: string) =>
    services.approvals.decide(toInt(id), false, String(evidence ?? 'Schaltfläche „Abbrechen"')),
  );

  /* -------------------- companies -------------------- */

  ipcMain.handle(IPC.companiesSendDesk, (_event, filter: SendDeskFilter = {}): SendDeskRow[] => {
    const rows = repos.companies.sendDeskRows({
      campaignId: filter?.campaignId,
      mailStatus: filter?.mailStatus,
      onlyReadyForApproval: filter?.onlyReadyForApproval,
      search: filter?.search,
    });
    return rows.map((row) => ({
      companyId: row.company_id,
      company: row.company,
      contact: row.contact,
      email: row.email,
      emailStatus: (row.email_status as VerificationStatus | null) ?? null,
      source: row.source,
      rationale: row.rationale,
      mailStatus: (row.mail_status as EmailStatus | null) ?? 'kein_entwurf',
      lastContactAt: row.last_contact_at,
      approvalStatus: (row.approval_status as SendDeskRow['approvalStatus']) ?? 'keine',
      emailId: row.email_id,
      status: row.company_status as SendDeskRow['status'],
      doNotContact: row.do_not_contact === 1,
    }));
  });

  ipcMain.handle(IPC.companiesDossier, (_event, companyId: number) => {
    const dossier = repos.companies.dossier(toInt(companyId));
    if (!dossier) return err(makeError('company.not_found', `Unternehmen ${companyId} existiert nicht.`));
    const latest = repos.emails.list({ companyId: dossier.company.id, limit: 1 })[0] ?? null;
    return ok({ ...dossier, latestEmail: latest });
  });

  ipcMain.handle(IPC.companiesSetDnc, (_event, companyId: number, value: boolean, reason?: string) => {
    repos.companies.setDoNotContact(toInt(companyId), Boolean(value), reason ? String(reason) : undefined);
    services.audit.log({
      actor: 'benutzer',
      action: value ? 'sperre.gesetzt' : 'sperre.aufgehoben',
      subject: `company:${companyId}`,
      outcome: 'ok',
      detail: reason,
    });
    return ok(true);
  });

  ipcMain.handle(IPC.companiesRemove, (_event, companyId: number) => {
    const removed = repos.companies.remove(toInt(companyId));
    if (!removed) return err(makeError('company.not_found', `Unternehmen ${companyId} existiert nicht.`));
    services.audit.log({
      actor: 'benutzer',
      action: 'unternehmen.geloescht',
      subject: `company:${companyId}`,
      outcome: 'ok',
    });
    return ok(true);
  });

  /* -------------------- campaigns -------------------- */

  ipcMain.handle(IPC.campaignsList, () => repos.campaigns.list());

  ipcMain.handle(IPC.campaignsCreate, (_event, input: Omit<CampaignRecord, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => {
    if (!input?.name || !input?.service) {
      return err(makeError('campaign.incomplete', 'Name und Dienstleistung sind Pflichtangaben.'));
    }
    return ok(
      repos.campaigns.create({
        name: String(input.name),
        service: String(input.service),
        region: input.region ? String(input.region) : null,
        targetCount: clampInt(input.targetCount, 1, 500, 25),
        notes: input.notes ? String(input.notes) : null,
      }),
    );
  });

  ipcMain.handle(IPC.campaignsUpdate, (_event, id: number, patch: Partial<CampaignRecord>) => {
    const updated = repos.campaigns.update(toInt(id), patch ?? {});
    return updated ? ok(updated) : err(makeError('campaign.not_found', `Kampagne ${id} existiert nicht.`));
  });

  ipcMain.handle(IPC.campaignsRemove, (_event, id: number) =>
    repos.campaigns.remove(toInt(id))
      ? ok(true)
      : err(makeError('campaign.not_found', `Kampagne ${id} existiert nicht.`)),
  );

  /* -------------------- research / outreach -------------------- */

  ipcMain.handle(IPC.researchRun, async (_event, request: ResearchRequest) => {
    const outcome = await agents.research.research(
      {
        query: String(request?.query ?? ''),
        region: request?.region ? String(request.region) : undefined,
        limit: clampInt(request?.limit, 1, 50, 10),
        campaignId: request?.campaignId ?? null,
      },
      (message) => emitStatus(runtime, message),
    );
    if (!outcome.ok) return outcome;
    return ok({ found: outcome.value.found, withVerifiedEmail: outcome.value.withVerifiedEmail });
  });

  ipcMain.handle(IPC.outreachPrepare, async (_event, request: OutreachRequest) => {
    const outcome = await agents.outreach.prepareDrafts(
      toInt(request?.campaignId),
      Array.isArray(request?.companyIds) ? request.companyIds.map(toInt) : [],
      (message) => emitStatus(runtime, message),
    );
    if (!outcome.ok) return outcome;
    return ok({ drafted: outcome.value.drafted, skipped: outcome.value.skipped.length });
  });

  /* -------------------- e-mails -------------------- */

  ipcMain.handle(IPC.emailsList, (_event, filter: { companyId?: number; status?: string } = {}) =>
    repos.emails.list({
      companyId: filter?.companyId === undefined ? undefined : toInt(filter.companyId),
      status: filter?.status,
      limit: 200,
    }),
  );

  ipcMain.handle(IPC.emailsGet, (_event, id: number) => {
    const email = repos.emails.get(toInt(id));
    return email ? ok(email) : err(makeError('mail.not_found', `Entwurf ${id} existiert nicht.`));
  });

  ipcMain.handle(IPC.emailsUpdate, (_event, id: number, patch: DraftPatch) =>
    agents.mail.updateDraft(toInt(id), {
      to: patch?.to,
      subject: patch?.subject,
      body: patch?.body,
      cc: patch?.cc,
      bcc: patch?.bcc,
    }),
  );

  ipcMain.handle(IPC.emailsRequestSend, (_event, id: number) => agents.mail.requestSend(toInt(id)));

  ipcMain.handle(IPC.emailsRemove, (_event, id: number) =>
    repos.emails.remove(toInt(id))
      ? ok(true)
      : err(
          makeError('mail.delete_failed', 'Der Entwurf konnte nicht gelöscht werden.', {
            hint: 'Versendete Nachrichten bleiben als Nachweis erhalten.',
          }),
        ),
  );

  /* -------------------- audit / memory -------------------- */

  ipcMain.handle(IPC.auditList, (_event, limit?: number) => services.audit.list(clampInt(limit, 1, 1000, 200)));

  ipcMain.handle(IPC.auditExport, async () => {
    const csv = services.audit.exportCsv();
    if (!csv.ok) return csv;
    const target = join(app.getPath('downloads'), `jarvis-protokoll-${Date.now()}.csv`);
    try {
      // BOM so Excel opens the German CSV in UTF-8.
      await writeFile(target, `﻿${csv.value}`, 'utf8');
      return ok(target);
    } catch (error) {
      return err(
        makeError('audit.export_failed', 'Das Protokoll konnte nicht gespeichert werden.', {
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });

  ipcMain.handle(IPC.memoryList, (_event, kind?: string) => services.memory.list(kind));

  ipcMain.handle(IPC.memoryRemove, (_event, id: number) =>
    services.memory.forget(toInt(id))
      ? ok(true)
      : err(makeError('memory.not_found', `Eintrag ${id} existiert nicht.`)),
  );

  ipcMain.handle(IPC.memoryClear, (_event, kind?: string) => ok(services.memory.clear(kind)));

  /* -------------------- settings / credentials -------------------- */

  ipcMain.handle(IPC.settingsGet, () => services.settings.get());

  ipcMain.handle(IPC.settingsUpdate, (_event, patch: Partial<AppSettings>) => {
    const next = services.settings.update(patch ?? {});
    agents.browser.reset();
    services.audit.log({
      actor: 'benutzer',
      action: 'einstellungen.geaendert',
      outcome: 'ok',
      detail: Object.keys(patch ?? {}).join(', '),
    });
    return ok(next);
  });

  ipcMain.handle(IPC.credentialsStatus, () => services.credentials.status());

  ipcMain.handle(IPC.credentialsSet, (_event, key: CredentialKey, value: string) => {
    if (!CREDENTIAL_KEYS.includes(key)) {
      return err(makeError('credentials.unknown_key', `Unbekannter Zugang: ${String(key)}`));
    }
    const result = services.credentials.set(key, String(value ?? ''));
    if (result.ok) {
      // The secret itself is never logged — only that it changed.
      services.audit.log({ actor: 'benutzer', action: 'zugang.hinterlegt', subject: key, outcome: 'ok' });
    }
    return result;
  });

  ipcMain.handle(IPC.credentialsClear, (_event, key: CredentialKey) => {
    if (!CREDENTIAL_KEYS.includes(key)) {
      return err(makeError('credentials.unknown_key', `Unbekannter Zugang: ${String(key)}`));
    }
    services.audit.log({ actor: 'benutzer', action: 'zugang.entfernt', subject: key, outcome: 'ok' });
    return services.credentials.clear(key);
  });

  ipcMain.handle(IPC.credentialsTest, async (_event, key: CredentialKey) => {
    const settings = services.settings.get();
    switch (key) {
      case 'anthropic.apiKey':
      case 'openai.apiKey': {
        const provider = createLlmProvider(
          { ...settings.llm, provider: key === 'anthropic.apiKey' ? 'anthropic' : 'openai' },
          services.credentials,
        );
        if (!provider.ok) return provider;
        return provider.value.ping();
      }
      case 'smtp.password':
      case 'gmail.clientSecret':
      case 'gmail.refreshToken': {
        const transport = createMailTransport(settings, services.credentials);
        if (!transport.ok) return transport;
        return transport.value.verify();
      }
      case 'imap.password': {
        const reader = createMailReader(settings, services.credentials);
        if (!reader.ok) return reader;
        return reader.value.verify();
      }
      case 'brave.apiKey':
      case 'tavily.apiKey':
      case 'serpapi.apiKey': {
        const provider = createSearchProvider(
          {
            ...settings.research,
            searchProvider: key === 'brave.apiKey' ? 'brave' : key === 'tavily.apiKey' ? 'tavily' : 'serpapi',
          },
          services.credentials,
        );
        if (!provider.ok) return provider;
        const probe = await provider.value.search('Bauunternehmen Hamburg', 1);
        if (!probe.ok) return probe;
        return ok(`${provider.value.name} antwortet (${probe.value.length} Treffer im Test).`);
      }
      case 'elevenlabs.apiKey': {
        const audio = await agents.voice.synthesize('Test.');
        if (!audio.ok) return audio;
        return ok(`Sprachausgabe erzeugt (${audio.value.audio.byteLength} Bytes).`);
      }
      default:
        return err(makeError('credentials.no_test', `Für ${String(key)} gibt es keinen Selbsttest.`));
    }
  });

  /* -------------------- voice -------------------- */

  ipcMain.handle(IPC.voiceTranscribe, async (_event, audio: ArrayBuffer, mimeType: string) => {
    if (!(audio instanceof ArrayBuffer) && !ArrayBuffer.isView(audio as never)) {
      return err(makeError('voice.bad_audio', 'Es wurden keine Audiodaten übergeben.'));
    }
    return agents.voice.transcribe(audio, String(mimeType ?? 'audio/webm'));
  });

  ipcMain.handle(IPC.voiceSynthesize, async (_event, text: string) => {
    const audio = await agents.voice.synthesize(String(text ?? ''));
    if (!audio.ok) return audio;
    return ok({ audio: audio.value.audio, mimeType: audio.value.mimeType });
  });

  ipcMain.handle(IPC.voiceCapabilities, () => agents.voice.capabilities());

  /* -------------------- system -------------------- */

  ipcMain.handle(IPC.systemVersion, () => ({
    app: app.getVersion(),
    electron: process.versions.electron ?? '',
    node: process.versions.node,
    dataDir: runtime.dataDir,
  }));

  // Serves both "show me this file" and "open this source page". A web address
  // goes to the default browser; anything else to the OS file handler.
  ipcMain.handle(IPC.systemOpenPath, async (_event, target: string) => {
    const value = String(target ?? '').trim();
    if (!value) return err(makeError('system.no_target', 'Es wurde kein Ziel angegeben.'));

    if (/^https?:\/\//i.test(value)) {
      try {
        await shell.openExternal(value);
        services.audit.log({ actor: 'benutzer', action: 'browser.geoeffnet', subject: value, outcome: 'ok' });
        return ok(true);
      } catch (error) {
        return err(
          makeError('system.open_failed', `${value} konnte nicht geöffnet werden.`, {
            detail: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    const message = await shell.openPath(value);
    return message ? err(makeError('system.open_failed', message)) : ok(true);
  });

  ipcMain.handle(IPC.systemPickFile, async (_event, options?: { multi?: boolean }) => {
    const result = await dialog.showOpenDialog({
      properties: options?.multi ? ['openFile', 'multiSelections'] : ['openFile'],
    });
    return result.canceled ? [] : result.filePaths;
  });
}

function emitStatus(runtime: JarvisRuntime, message: string): void {
  runtime.emit({ type: 'status', text: message });
}

function toInt(value: unknown): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
