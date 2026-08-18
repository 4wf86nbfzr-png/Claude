import { randomUUID } from 'node:crypto';
import { ApprovalStatus, EmailStatus, OutreachStatus, VoiceState } from '../../shared/status';
import type { ChatMessage, SystemStatus } from '../../shared/types';
import type { Repositories } from '../db/repositories';
import { ApprovalService } from '../services/approval';
import { interpretApprovalUtterance } from '../services/approvalPhrases';
import type { AuditLogService } from '../services/audit';
import type { JarvisConfig } from '../services/config';
import type { CredentialService } from '../services/credentials';
import type { EventBus } from '../services/events';
import type { LlmMessage, LlmProvider } from '../services/llm';
import type { MailService } from '../services/mail';
import type { SystemService } from '../services/system';
import type { VoiceService } from '../services/voice';
import type { ResearchService } from '../research';
import type { ToolContext, ToolRegistry } from '../tools';
import { GRUNDREGELN, agentByName, type AgentDefinition } from './definitions';
import { bestimmeAgent } from './router';

export interface JarvisCoreOptions {
  repos: Repositories;
  config: JarvisConfig;
  credentials: CredentialService;
  registry: ToolRegistry;
  llm: LlmProvider;
  mail: MailService;
  research: ResearchService;
  system: SystemService;
  voice: VoiceService;
  approvals: ApprovalService;
  audit: AuditLogService;
  bus: EventBus;
  sessionId?: string;
}

export interface AntwortErgebnis {
  nachricht: ChatMessage;
  agent: string;
  /** true, wenn in diesem Zug eine Freigabe angefragt wurde. */
  wartetAufFreigabe: boolean;
}

const MAX_SCHRITTE = 8;

/**
 * Der Kern (§9).
 *
 * Aufgaben: den zuständigen Agenten bestimmen, dessen Werkzeugschleife
 * fahren, Freigaben abfangen und den Zustand nach außen melden. Fachlogik
 * steckt bewusst in den Werkzeugen, nicht hier.
 */
export class JarvisCore {
  readonly sessionId: string;
  /** Merkt sich, ob JARVIS zuletzt eine Freigabe erfragt hat – wichtig für ein knappes "ja". */
  private freigabeErfragt = false;

  constructor(private readonly o: JarvisCoreOptions) {
    this.sessionId = o.sessionId ?? randomUUID();
  }

  private get context(): ToolContext {
    return {
      repos: this.o.repos,
      config: this.o.config,
      credentials: this.o.credentials,
      audit: this.o.audit,
      approvals: this.o.approvals,
      bus: this.o.bus,
      llm: this.o.llm,
      mail: this.o.mail,
      research: this.o.research,
      system: this.o.system,
      sessionId: this.sessionId
    };
  }

  /** Ein Benutzerbeitrag – Text oder erkannte Sprache. */
  async verarbeite(text: string): Promise<AntwortErgebnis> {
    const eingabe = text.trim();
    if (!eingabe) {
      return this.antwort('Ich habe nichts verstanden. Bitte noch einmal.', 'JarvisCore', false);
    }

    this.o.repos.conversation.append(this.sessionId, 'user', eingabe);
    this.o.audit.log('Benutzereingabe', { actor: 'BENUTZER', target: eingabe.slice(0, 120), status: 'INFO' });

    const abgefangen = await this.freigabeAbfangen(eingabe);
    if (abgefangen) return abgefangen;

    this.o.bus.emit({ kind: 'state', state: VoiceState.THINKING });
    if (!this.o.llm.configured()) {
      return this.antwort(
        `Es ist kein Sprachmodell eingerichtet, deshalb kann ich den Auftrag nicht bearbeiten. ${this.o.llm.missingHint()}`,
        'JarvisCore',
        false,
        'ERROR'
      );
    }

    const routing = await bestimmeAgent(eingabe, this.o.llm);
    this.o.audit.log('Auftrag zugeordnet', {
      agent: routing.agent.name,
      target: eingabe.slice(0, 120),
      detail: { quelle: routing.quelle }
    });

    const offeneVorher = this.o.approvals.pending().length;
    let ergebnis: string;
    try {
      ergebnis = await this.werkzeugschleife(routing.agent, eingabe);
    } catch (error) {
      const meldung = (error as Error).message;
      this.o.audit.log('Bearbeitung abgebrochen', {
        agent: routing.agent.name,
        status: 'FEHLER',
        detail: { fehler: meldung }
      });
      return this.antwort(`Das hat nicht geklappt: ${meldung}`, routing.agent.name, false, 'ERROR');
    }

    const offeneNachher = this.o.approvals.pending().length;
    const wartet = offeneNachher > offeneVorher;
    return this.antwort(ergebnis, routing.agent.name, wartet);
  }

  /**
   * Fängt Freigabe- und Absageäußerungen ab, bevor ein Agent sie als neuen
   * Auftrag missversteht. Nur bei genau einer offenen Freigabe wird ohne
   * Rückfrage gehandelt.
   */
  private async freigabeAbfangen(eingabe: string): Promise<AntwortErgebnis | null> {
    const offene = this.o.approvals.pending();
    if (offene.length === 0) return null;

    const deutung = interpretApprovalUtterance(eingabe, { frageGestellt: this.freigabeErfragt });
    if (deutung === 'UNKLAR') return null;

    if (offene.length > 1) {
      const liste = offene.map((a) => `${a.id}: ${a.title}`).join('; ');
      return this.antwort(
        `Es warten ${offene.length} Vorgänge auf Ihre Entscheidung: ${liste}. Welche Nummer meinen Sie?`,
        'ApprovalService',
        true
      );
    }

    const approval = offene[0]!;
    if (deutung === 'ABLEHNEN') {
      await this.genehmige(approval.id, false, 'Vom Benutzer abgelehnt');
      return this.antwort(`In Ordnung, ${approval.title} wird nicht ausgeführt. Der Entwurf bleibt gespeichert.`, 'ApprovalService', false);
    }

    const ergebnis = await this.genehmige(approval.id, true, 'Freigabe im Gespräch erteilt');
    return this.antwort(ergebnis.meldung, 'ApprovalService', false, ergebnis.ok ? undefined : 'ERROR');
  }

  /**
   * Entscheidung über eine Freigabe – aus dem Gespräch oder über die
   * Schaltflächen der Oberfläche. Bei Freigabe wird die zugehörige Aktion
   * unmittelbar über das dafür vorgesehene Werkzeug ausgeführt.
   */
  async genehmige(approvalId: number, freigegeben: boolean, notiz?: string): Promise<{ ok: boolean; meldung: string }> {
    const approval = this.o.approvals.byId(approvalId);
    if (!approval) return { ok: false, meldung: `Freigabe ${approvalId} existiert nicht.` };
    if (approval.status !== ApprovalStatus.OFFEN) {
      return { ok: false, meldung: `Diese Freigabe wurde bereits entschieden (${approval.status}).` };
    }

    this.o.approvals.decide(approvalId, freigegeben, notiz);

    const emailId = Number(approval.payload.emailId);
    if (!freigegeben) {
      if (approval.action === 'send_email' && Number.isInteger(emailId)) {
        // Entwurf zurück in den bearbeitbaren Zustand.
        const email = this.o.repos.emails.byId(emailId);
        this.o.repos.emails.updateDraft(emailId, {});
        if (email?.campaignId && email.companyId) {
          this.o.repos.campaigns.setTargetStatus(
            email.campaignId,
            email.companyId,
            OutreachStatus.ENTWURF_ERSTELLT,
            { emailId }
          );
        }
      }
      this.o.bus.emit({ kind: 'state', state: VoiceState.IDLE });
      return { ok: true, meldung: `${approval.title} wurde nicht ausgeführt.` };
    }

    if (approval.action !== 'send_email') {
      return {
        ok: true,
        meldung: `Freigabe erteilt. Die Aktion „${approval.title}“ kann jetzt ausgeführt werden (Freigabe-Nummer ${approvalId}).`
      };
    }

    if (!Number.isInteger(emailId)) {
      return { ok: false, meldung: 'Zu dieser Freigabe ist kein Entwurf hinterlegt.' };
    }

    this.o.bus.emit({ kind: 'state', state: VoiceState.EXECUTING });
    const ergebnis = await this.o.registry.run('send_email', { emailId, approvalId }, this.context);
    this.o.bus.emit({ kind: 'state', state: VoiceState.IDLE });
    return { ok: ergebnis.ok, meldung: ergebnis.summary };
  }

  /** Werkzeugschleife eines Agenten. */
  private async werkzeugschleife(agent: AgentDefinition, eingabe: string): Promise<string> {
    const werkzeuge = this.o.registry.definitions(agent.werkzeuge);
    const verlauf: LlmMessage[] = [
      ...this.o.repos.conversation
        .history(this.sessionId, 20)
        .filter((eintrag) => eintrag.role === 'user' || eintrag.role === 'assistant')
        .slice(0, -1)
        .map((eintrag) => ({ role: eintrag.role as 'user' | 'assistant', content: eintrag.content })),
      { role: 'user', content: eingabe }
    ];

    let letzterText = '';
    for (let schritt = 0; schritt < MAX_SCHRITTE; schritt++) {
      this.o.bus.emit({ kind: 'state', state: VoiceState.THINKING });
      const antwort = await this.o.llm.complete({
        system: this.systemPrompt(agent),
        messages: verlauf,
        tools: werkzeuge,
        maxTokens: this.o.config.llm.maxTokens
      });
      letzterText = antwort.text || letzterText;

      if (antwort.toolCalls.length === 0) {
        return antwort.text || 'Erledigt.';
      }

      verlauf.push({ role: 'assistant', content: antwort.text, toolCalls: antwort.toolCalls });
      this.o.bus.emit({ kind: 'state', state: VoiceState.EXECUTING });

      for (const aufruf of antwort.toolCalls) {
        const ergebnis = await this.o.registry.run(aufruf.name, aufruf.arguments, this.context);
        verlauf.push({
          role: 'tool',
          toolCallId: aufruf.id,
          toolName: aufruf.name,
          content: JSON.stringify({
            ok: ergebnis.ok,
            zusammenfassung: ergebnis.summary,
            ...(ergebnis.data !== undefined ? { daten: ergebnis.data } : {}),
            ...(ergebnis.error ? { fehler: ergebnis.error } : {})
          })
        });
      }
    }

    return (
      letzterText ||
      'Ich habe die maximale Anzahl an Arbeitsschritten erreicht und höre hier auf, damit nichts unkontrolliert weiterläuft.'
    );
  }

  private systemPrompt(agent: AgentDefinition): string {
    const offene = this.o.approvals.pending();
    const grund = GRUNDREGELN.replace('{{BENUTZER}}', this.o.config.sender.person || 'dem Benutzer')
      .replace('{{FIRMA}}', this.o.config.sender.company)
      .replace('{{DATUM}}', new Date().toLocaleDateString('de-DE', { dateStyle: 'full' }));

    const kontext = [
      `Absenderprofil: ${this.o.config.sender.company}` +
        (this.o.config.sender.person ? `, ${this.o.config.sender.person}` : '') +
        (this.o.config.mail.fromAddress ? `, Absenderadresse ${this.o.config.mail.fromAddress}` : ', noch keine Absenderadresse eingerichtet'),
      `Angebot: ${this.o.config.sender.offering}`,
      `Versandweg: ${this.o.mail.transport.label}${this.o.mail.transport.configured() ? '' : ' (nicht eingerichtet)'}`,
      this.o.config.limits.dryRun
        ? 'ACHTUNG: Testbetrieb ist aktiv – Nachrichten werden nur protokolliert, nicht wirklich versendet. Sage das dem Benutzer.'
        : `Heute bereits versendet: ${this.o.mail.heuteVersendet()} von höchstens ${this.o.config.limits.dailySendLimit}.`,
      offene.length > 0
        ? `Offene Freigaben: ${offene.map((a) => `#${a.id} ${a.title}`).join(', ')}.`
        : 'Zurzeit warten keine Freigaben.'
    ].join('\n');

    return `${grund}\n\nDeine Rolle als ${agent.name}:\n${agent.systemPrompt}\n\nAktueller Stand:\n${kontext}`;
  }

  private antwort(
    text: string,
    agent: string,
    wartetAufFreigabe: boolean,
    zustand: keyof typeof VoiceState = 'IDLE'
  ): AntwortErgebnis {
    this.freigabeErfragt = wartetAufFreigabe;
    this.o.repos.conversation.append(this.sessionId, 'assistant', text, agent);
    const nachricht: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: text,
      agent,
      createdAt: new Date().toISOString()
    };
    this.o.bus.emit({ kind: 'message', message: nachricht });
    this.o.bus.emit({ kind: 'speak', text });
    this.o.bus.emit({
      kind: 'state',
      state: wartetAufFreigabe ? VoiceState.WAITING_FOR_APPROVAL : VoiceState[zustand]
    });
    return { nachricht, agent, wartetAufFreigabe };
  }

  verlauf(limit = 40): ChatMessage[] {
    return this.o.repos.conversation.history(this.sessionId, limit).map((eintrag) => ({
      id: String(eintrag.id),
      role: eintrag.role,
      content: eintrag.content,
      ...(eintrag.agent ? { agent: eintrag.agent } : {}),
      createdAt: eintrag.createdAt
    }));
  }

  status(): SystemStatus {
    const stimme = this.o.voice.status();
    return {
      llm: [
        {
          id: this.o.llm.id,
          label: this.o.llm.label,
          configured: this.o.llm.configured(),
          hint: this.o.llm.missingHint()
        }
      ],
      stt: stimme.stt,
      tts: stimme.tts,
      search: [
        {
          id: this.o.research.search.id,
          label: this.o.research.search.label,
          configured: this.o.research.search.configured(),
          hint: this.o.research.search.missingHint()
        }
      ],
      mail: this.o.mail.status(),
      dbPath: this.o.repos.db.path,
      dryRun: this.o.config.limits.dryRun,
      dailySendLimit: this.o.config.limits.dailySendLimit,
      sentToday: this.o.mail.heuteVersendet()
    };
  }

  /** Entwürfe, die auf eine Entscheidung warten – für die Oberfläche. */
  offeneFreigaben() {
    return this.o.approvals.pending().map((approval) => ({
      approval,
      email:
        approval.action === 'send_email' && Number.isInteger(Number(approval.payload.emailId))
          ? this.o.repos.emails.byId(Number(approval.payload.emailId))
          : null
    }));
  }

  /** Text zum Vorlesen eines Entwurfs (§23). */
  vorlesetext(emailId: number): { ok: boolean; text: string } {
    const email = this.o.repos.emails.byId(emailId);
    if (!email) return { ok: false, text: `Entwurf ${emailId} existiert nicht.` };
    const status = email.status === EmailStatus.GESENDET ? 'bereits versendet' : 'noch nicht versendet';
    return {
      ok: true,
      text: `Entwurf ${email.id}, ${status}. Empfänger: ${email.toAddresses.join(', ')}. Betreff: ${email.subject}. ${email.bodyText}`
    };
  }
}
