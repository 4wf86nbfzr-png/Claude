import type { Jarvis } from '../jarvis.js';
import { err, ok, type Result } from '../util/result.js';
import { describeTools } from '../tools/index.js';
import { AuditLogService } from '../services/audit.js';
import type { Command, CommandResponse } from './contract.js';
import { EMPFOHLENE_MODELLE, OllamaAdmin } from '../llm/ollama-admin.js';
import { GmailTransport } from '../mail/gmail.js';
import { GraphTransport } from '../mail/graph.js';
import { EMAIL_STATUS, TARGET_STATUS, type EmailStatus } from '../db/schema.js';

/**
 * Setzt Befehle des Fensters in Aufrufe des Kerns um.
 *
 * Bewusst hier im Kern und nicht im Electron-Hauptprozess: so laesst sich
 * die gesamte Oberflaechenlogik ohne Electron testen, und der Hauptprozess
 * bleibt ein duenner Weiterleiter.
 */
export class CommandHandler {
  constructor(
    private readonly jarvis: Jarvis,
    private readonly hooks: {
      /** Oeffnet eine URL im Standardbrowser (im Desktop `shell.openExternal`). */
      openExternal?: (url: string) => Promise<Result<unknown>>;
      revealPath?: (path: string) => Promise<Result<unknown>>;
    } = {},
  ) {}

  async handle(command: Command): Promise<CommandResponse> {
    try {
      return await this.dispatch(command);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.jarvis.logger.error('Befehl fehlgeschlagen', { kind: command.kind, message });
      return err('INTERNAL_ERROR', `Der Befehl "${command.kind}" ist fehlgeschlagen: ${message}`);
    }
  }

  private async dispatch(c: Command): Promise<CommandResponse> {
    const j = this.jarvis;

    switch (c.kind) {
      // --- Gespraech -------------------------------------------------------
      case 'ask':
        return j.ask(c.text, {
          ...(c.conversationId ? { conversationId: c.conversationId } : {}),
          ...(c.gespraechsmodus ? { gespraechsmodus: true } : {}),
        });
      case 'conversation.openers':
        return ok({ anlaesse: await j.anlaesse() });
      case 'conversation.greeting':
        return ok({ text: await j.begruessung() });
      case 'abort':
        return ok({ abgebrochen: j.abort() });
      case 'conversations':
        return ok(j.memory.listConversations());
      case 'conversation.messages':
        return ok(
          j.memory.history(c.conversationId, 200).map((m) => ({
            id: m.id,
            rolle: m.role,
            inhalt: m.content,
            agent: m.agent,
            zeit: m.created_at,
          })),
        );
      case 'conversation.new':
        return ok({ konversationId: j.startConversation(c.title ?? 'Neues Gespräch') });
      case 'conversation.delete':
        return ok({ geloescht: j.memory.deleteConversation(c.conversationId) });

      // --- Uebersicht ------------------------------------------------------
      case 'dashboard':
        return ok(j.dashboard());

      // --- Freigaben -------------------------------------------------------
      case 'approvals.pending':
        return ok(
          j.pendingApprovals().map((a, i) => ({
            nummer: i + 1,
            id: a.id,
            art: a.action_type,
            titel: a.title,
            frage: a.summary,
            risiko: a.risk,
            angefragtVon: a.requested_by,
            angefragtAm: a.requested_at,
            laeuftAbAm: a.expires_at,
            details: a.details,
          })),
        );
      case 'approvals.all':
        return ok(
          j.approvals.list(c.limit ?? 100).map((a) => ({
            id: a.id,
            art: a.action_type,
            titel: a.title,
            status: a.status,
            entschiedenAm: a.decided_at,
            entschiedenVon: a.decided_by,
            ausgefuehrtAm: a.executed_at,
          })),
        );
      case 'approvals.approve':
        return j.approve(c.approvalId, c.note);
      case 'approvals.reject':
        return j.reject(c.approvalId, c.note);

      // --- Mail -------------------------------------------------------------
      case 'drafts.list': {
        const rows = j.repos.emails.list({
          ...(c.status ? { status: c.status as EmailStatus } : {}),
          ...(c.campaignId ? { campaignId: c.campaignId } : {}),
          limit: 200,
        });
        return ok(
          rows.map((e, i) => ({
            nummer: i + 1,
            id: e.id,
            firma: e.company_id ? (j.repos.companies.get(e.company_id)?.name ?? null) : null,
            an: e.to_address,
            betreff: e.subject,
            statusCode: e.status,
            status: EMAIL_STATUS[e.status] ?? e.status,
            richtung: e.direction,
            fehler: e.error,
            erstelltAm: e.created_at,
            gesendetAm: e.sent_at,
            freigabeId: e.approval_id,
          })),
        );
      }
      case 'drafts.get': {
        const r = j.mail.get(c.emailId);
        if (!r.ok) return r;
        const e = r.data.email;
        return ok({
          id: e.id,
          firma: e.company_id ? (j.repos.companies.get(e.company_id)?.name ?? null) : null,
          firmaId: e.company_id,
          an: e.to_address,
          anName: e.to_name,
          kopie: e.cc,
          betreff: e.subject,
          text: e.body_text,
          statusCode: e.status,
          status: EMAIL_STATUS[e.status] ?? e.status,
          warnungen: r.data.warnungen,
          anhaenge: r.data.anhaenge,
          fehler: e.error,
          gesendetAm: e.sent_at,
        });
      }
      case 'drafts.update':
        return j.mail.updateDraft(c.emailId, c.patch);
      case 'drafts.delete':
        return ok({ geloescht: j.repos.emails.delete(c.emailId) });
      case 'drafts.requestApproval':
        return j.mail.requestSendApproval(c.emailId, 'benutzer');
      case 'drafts.requestBulkApproval':
        return j.mail.requestBulkApproval(c.emailIds, 'benutzer');
      case 'drafts.spoken':
        return j.mail.spokenVersion(c.emailId);
      case 'mail.checkReplies':
        return j.registry.call('check_email_replies', { seitTagen: c.seitTagen }, j.context);
      case 'mail.verifyTransport': {
        const transport = j.mail.activeTransport;
        if (!transport) return err('NOT_CONFIGURED', 'Es ist kein Versandweg eingerichtet.');
        return transport.verify();
      }

      // --- Recherche und CRM ------------------------------------------------
      case 'companies.list': {
        const rows = j.repos.companies.list({
          ...(c.search ? { search: c.search } : {}),
          ...(c.city ? { city: c.city } : {}),
          limit: c.limit ?? 200,
        });
        return ok(
          rows.map((co) => {
            const adressen = j.repos.companies.emailsOf(co.id);
            return {
              id: co.id,
              name: co.name,
              ort: co.city,
              website: co.website,
              branche: co.industry,
              status: co.status,
              adressen: adressen.map((a) => ({ adresse: a.address, status: a.verification, quelle: a.found_on_url })),
              zuletztAngeschrieben: j.repos.emails.lastSentToCompany(co.id)?.sent_at ?? null,
            };
          }),
        );
      }
      case 'companies.dossier':
        return j.registry.call('get_company_dossier', { firmaId: c.companyId }, j.context);
      case 'companies.delete':
        return ok({ geloescht: j.repos.companies.delete(c.companyId) });
      case 'campaigns.list':
        return j.registry.call('list_campaigns', {}, j.context);
      case 'campaigns.sendingCenter':
        return ok(
          j.sendingCenter(c.campaignId).map((z, i) => ({
            nummer: i + 1,
            zeileId: z.target.id,
            unternehmen: z.companyName,
            ansprechpartner: z.contactName,
            position: z.contactRole,
            email: z.email,
            quelle: z.sourceUrl,
            verifizierung: z.verification,
            akquisegrund: z.target.reason,
            mailstatus: z.emailStatus ? (EMAIL_STATUS[z.emailStatus as EmailStatus] ?? z.emailStatus) : null,
            letzterKontakt: z.lastContactAt,
            freigabestatus: z.approvalStatus,
            status: TARGET_STATUS[z.target.status] ?? z.target.status,
            statusCode: z.target.status,
            entwurfId: z.target.email_id,
            fehler: z.target.last_error,
          })),
        );

      // --- Compliance -------------------------------------------------------
      case 'suppression.list':
        return ok(j.repos.suppression.list());
      case 'suppression.add':
        return ok(
          j.repos.suppression.add({ scope: c.scope, value: c.value, ...(c.reason ? { reason: c.reason } : {}) }),
        );
      case 'suppression.remove':
        return ok({ entfernt: j.repos.suppression.remove(c.id) });

      // --- Gedaechtnis, Aufgaben, Protokoll --------------------------------
      case 'memory.list':
        return ok(j.memory.list(c.kind_ as never));
      case 'memory.delete':
        return ok({ geloescht: j.memory.forget(c.id) });
      case 'memory.clear':
        return ok({ geloescht: j.memory.forgetAll(c.kind_ as never) });
      case 'tasks.list':
        return ok(j.repos.tasks.list({}));
      case 'audit.list':
        return ok(
          j.audit
            .list({
              limit: c.limit ?? 200,
              ...(c.entityType ? { entityType: c.entityType } : {}),
              ...(c.entityId ? { entityId: c.entityId } : {}),
            })
            .map((r) => ({
              id: r.id,
              zeit: r.ts,
              zeile: AuditLogService.toSpokenLine(r, j.env.JARVIS_LOCALE),
              wer: r.actor,
              was: r.action,
              gegenstand: r.entity_type,
              gegenstandId: r.entity_id,
              ergebnis: r.outcome,
            })),
        );

      // --- Einrichtung -------------------------------------------------------
      case 'status':
        return ok(j.status());
      case 'settings.all':
        return ok(j.repos.settings.all());
      case 'settings.set':
        j.repos.settings.set(c.key, c.value);
        j.audit.log({ actor: 'benutzer', action: 'einstellung.geaendert', summary: `Einstellung geändert: ${c.key}` });
        return ok({ gespeichert: c.key });
      case 'secrets.list':
        return ok(
          j.credentials.keys().map((k) => ({ schluessel: k, herkunft: j.credentials.origin(k), gesetzt: j.credentials.has(k) })),
        );
      case 'secrets.set':
        j.credentials.set(c.key, c.value);
        j.audit.log({ actor: 'benutzer', action: 'zugang.gespeichert', summary: `Zugangsdaten hinterlegt: ${c.key}` });
        return ok({ gespeichert: c.key });
      case 'secrets.delete':
        j.credentials.delete(c.key);
        return ok({ geloescht: c.key });
      case 'oauth.start': {
        const transport =
          c.provider === 'google'
            ? new GmailTransport(j.env, j.credentials)
            : new GraphTransport(j.env, j.credentials);
        const fehlt = transport.missingConfigHint();
        if (fehlt && !transport.oauth.hasTokens() && /CLIENT_ID/.test(fehlt)) {
          return err('NOT_CONFIGURED', fehlt);
        }
        const vorgang = transport.oauth.beginAuthorization();
        if (this.hooks.openExternal) await this.hooks.openExternal(vorgang.url);
        // Wir warten hier bewusst: die Oberflaeche zeigt so lange "Anmeldung läuft".
        const tokens = await vorgang.completion;
        if (!tokens.ok) return tokens;
        const geprueft = await transport.verify();
        return geprueft.ok
          ? ok({ verbunden: true, info: geprueft.data.info })
          : geprueft;
      }
      case 'tools.list':
        return ok(describeTools(j.registry));

      // --- Sprachmodell -------------------------------------------------------
      case 'llm.status': {
        const admin = new OllamaAdmin(j.env.OLLAMA_BASE_URL);
        const laeuft = await admin.erreichbar();
        const modelle = laeuft ? await admin.modelle() : null;
        return ok({
          aktiv: {
            anbieter: j.context.llm.id,
            modell: j.context.llm.defaultModel,
            bereit: j.context.llm.isConfigured(),
            hinweis: j.context.llm.missingConfigHint(),
          },
          // Eine gesetzte Umgebungsvariable schlaegt die Einstellung -- das
          // muss die Oberflaeche wissen, sonst wirkt ein Klick folgenlos.
          durchUmgebungFestgelegt: Boolean(process.env.JARVIS_LLM_PROVIDER),
          lokal: {
            adresse: j.env.OLLAMA_BASE_URL,
            laeuft,
            installiert: laeuft ? true : await OllamaAdmin.installiert(),
            hinweis: laeuft ? null : OllamaAdmin.installationsHinweis(),
            modelle: modelle?.ok ? modelle.data : [],
          },
          empfehlungen: EMPFOHLENE_MODELLE,
        });
      }
      case 'llm.use': {
        j.repos.settings.set('llm.provider', c.provider);
        if (c.model) j.repos.settings.set('llm.model', c.model);
        j.audit.log({
          actor: 'benutzer',
          action: 'einstellung.sprachmodell',
          summary: `Sprachmodell umgestellt auf ${c.provider}${c.model ? ` (${c.model})` : ''}`,
        });
        return ok({
          gespeichert: true,
          neustartNoetig: true,
          hinweis: process.env.JARVIS_LLM_PROVIDER
            ? 'Achtung: JARVIS_LLM_PROVIDER ist in der Umgebung gesetzt und hat Vorrang. Bitte dort entfernen.'
            : 'Bitte JARVIS neu starten, damit die Umstellung greift.',
        });
      }
      case 'llm.pull': {
        const admin = new OllamaAdmin(j.env.OLLAMA_BASE_URL);
        if (!(await admin.erreichbar())) {
          return err('NOT_CONFIGURED', 'Ollama läuft nicht.', { hint: OllamaAdmin.installationsHinweis() });
        }
        return admin.ziehe(c.model, (stand) => {
          j.bus.emit('progress', {
            task: `Modell ${c.model} wird geladen`,
            done: stand.anteil !== null ? Math.round(stand.anteil * 100) : 0,
            total: stand.anteil !== null ? 100 : null,
            note: stand.status,
          });
        });
      }
      case 'llm.test': {
        const admin = new OllamaAdmin(j.env.OLLAMA_BASE_URL);
        if (!(await admin.erreichbar())) {
          return err('NOT_CONFIGURED', 'Ollama läuft nicht.', { hint: OllamaAdmin.installationsHinweis() });
        }
        return admin.pruefeWerkzeugtauglichkeit(c.model ?? j.context.llm.defaultModel);
      }

      // --- Dateizugriff -------------------------------------------------------
      case 'system.roots':
        return ok({ pfade: j.system.roots });
      case 'system.setRoots': {
        const sauber = c.pfade.map((p) => p.trim()).filter(Boolean);
        j.system.setRoots(sauber);
        j.repos.settings.set('system.allowedRoots', sauber);
        j.audit.log({
          actor: 'benutzer',
          action: 'einstellung.verzeichnisse',
          summary: `Freigegebene Verzeichnisse geändert (${sauber.length})`,
          detail: { pfade: sauber },
        });
        return ok({ pfade: j.system.roots });
      }
      case 'system.knownApps':
        return ok({ programme: j.system.bekannteProgramme });

      // --- Sprache ------------------------------------------------------------
      case 'voice.transcribe':
        return j.voice.transcribe(Buffer.from(c.audio), c.filename ?? 'aufnahme.webm');
      case 'voice.speak':
        return j.voice.speak(c.text);

      // --- System ------------------------------------------------------------
      case 'system.openExternal':
        return this.hooks.openExternal
          ? this.hooks.openExternal(c.url)
          : j.system.openUrl(c.url);
      case 'system.revealPath':
        return this.hooks.revealPath ? this.hooks.revealPath(c.path) : j.system.openPath(c.path);

      default: {
        // Erschoepfungspruefung: ein neuer Befehl faellt hier beim Compiler auf.
        const unbekannt: never = c;
        return err('NOT_IMPLEMENTED', `Unbekannter Befehl: ${JSON.stringify(unbekannt)}`);
      }
    }
  }
}
