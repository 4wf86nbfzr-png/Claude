import type {
  AssistantState,
  ChatMessage,
  JarvisError,
  JarvisEvent,
  Result,
  ToolCallRecord,
} from '../shared/types.js';
import { err, makeError, ok } from '../shared/types.js';
import type { LlmContent, LlmMessage, LlmProvider } from './llm/types.js';
import type { ToolRegistry } from './tools/Tool.js';
import type { ToolContext } from './tools/context.js';
import type { MemoryService } from './services/MemoryService.js';
import type { ApprovalService } from './services/ApprovalService.js';
import type { AuditLogService } from './services/AuditLogService.js';
import type { SettingsService } from './services/SettingsService.js';
import { classifyApproval } from './services/approvalPhrases.js';
import { formatDe, newId, nowIso } from './util/id.js';

export interface JarvisCoreDeps {
  registry: ToolRegistry;
  toolContext: (conversationId: string, signal: AbortSignal, status: (message: string) => void) => ToolContext;
  llm: () => Result<LlmProvider, JarvisError>;
  memory: MemoryService;
  approvals: ApprovalService;
  audit: AuditLogService;
  settings: SettingsService;
  emit: (event: JarvisEvent) => void;
}

/** Hard ceiling on tool round-trips per user turn, so a loop cannot run away. */
const MAX_ITERATIONS = 12;

/**
 * The router (§9).
 *
 * JarvisCore owns the conversation, decides nothing itself about *how* work is
 * done, and delegates every real action to a tool that belongs to an agent.
 * The agentic loop is written out here rather than delegated to the SDK tool
 * runner because it has to do four extra things per iteration: emit a UI
 * event, write an audit entry, intercept approvals, and stay provider-agnostic.
 */
export class JarvisCore {
  private state: AssistantState = 'IDLE';
  private controller: AbortController | null = null;
  private busy = false;

  constructor(private readonly deps: JarvisCoreDeps) {}

  get currentState(): AssistantState {
    return this.state;
  }

  private setState(state: AssistantState): void {
    this.state = state;
    this.deps.emit({ type: 'state', state });
  }

  cancel(): void {
    this.controller?.abort();
  }

  newConversation(): string {
    return newId();
  }

  history(conversationId: string, limit = 60): ChatMessage[] {
    return this.deps.memory.history(conversationId, limit);
  }

  /* ---------------------------------------------------------------- */

  async handle(input: {
    text: string;
    conversationId: string;
    spoken?: boolean;
  }): Promise<Result<ChatMessage, JarvisError>> {
    if (this.busy) {
      return err(
        makeError('core.busy', 'JARVIS arbeitet gerade noch an der letzten Aufgabe.', {
          hint: 'Kurz warten oder die laufende Aufgabe abbrechen.',
        }),
      );
    }

    const text = input.text.trim();
    if (!text) return err(makeError('core.empty', 'Es wurde nichts gesagt oder geschrieben.'));

    this.busy = true;
    this.controller = new AbortController();

    try {
      const userMessage: ChatMessage = {
        id: newId(),
        conversationId: input.conversationId,
        role: 'user',
        text,
        createdAt: nowIso(),
        spoken: input.spoken ?? false,
      };
      this.deps.memory.appendTurn(userMessage);
      this.deps.emit({ type: 'message', message: userMessage });

      // Spoken or typed approvals are resolved before the model ever sees the
      // turn, so an approval can never be inferred by the model itself.
      const interception = this.interceptApproval(text);

      return await this.runTurn(input.conversationId, interception);
    } finally {
      this.busy = false;
      this.controller = null;
      this.setState('IDLE');
    }
  }

  /**
   * Applies an unambiguous approval or rejection to the single open request.
   * Returns a note that is appended to the model's context so it knows what
   * happened. Ambiguity is never resolved in favour of sending.
   */
  private interceptApproval(text: string): string | null {
    const open = this.deps.approvals.listOpen();
    if (open.length === 0) return null;

    const intent = classifyApproval(text);
    if (intent === 'unklar') {
      return `HINWEIS: Es warten ${open.length} Freigabe(n): ${open
        .map((request) => `#${request.id} ${request.title}`)
        .join('; ')}. Die letzte Äußerung des Benutzers ist KEINE eindeutige Freigabe. Frage nach, bevor irgendetwas versendet wird.`;
    }

    if (open.length > 1 && !/\b(alle|sämtliche|jede)\b/i.test(text)) {
      return `HINWEIS: Es warten mehrere Freigaben (${open
        .map((request) => `#${request.id} ${request.title}`)
        .join('; ')}). Die Äußerung ist nicht eindeutig einer davon zuzuordnen. Frage nach, welche gemeint ist. Gib nichts frei.`;
    }

    const decisions: string[] = [];
    for (const request of open) {
      const decided = this.deps.approvals.decide(request.id, intent === 'freigabe', `Sprach-/Texteingabe: „${text}"`);
      if (decided.ok) {
        this.deps.emit({ type: 'approval-resolved', request: decided.value });
        decisions.push(
          `Freigabe #${request.id} (${request.title}) wurde vom Benutzer ${
            intent === 'freigabe' ? 'ERTEILT' : 'ABGELEHNT'
          }.`,
        );
      }
    }
    if (decisions.length === 0) return null;

    return intent === 'freigabe'
      ? `${decisions.join(' ')} Führe jetzt die freigegebene Aktion aus (z. B. send_email mit der zugehörigen Entwurfsnummer) und melde das tatsächliche Ergebnis.`
      : `${decisions.join(' ')} Es wird nichts ausgeführt. Bestätige das kurz.`;
  }

  /* ---------------------------------------------------------------- */

  private async runTurn(
    conversationId: string,
    interception: string | null,
  ): Promise<Result<ChatMessage, JarvisError>> {
    const provider = this.deps.llm();
    if (!provider.ok) {
      this.setState('ERROR');
      this.deps.emit({ type: 'error', error: provider.error });
      return provider;
    }

    const signal = this.controller!.signal;
    const status = (message: string): void => {
      this.deps.emit({ type: 'status', text: message });
    };
    const context = this.deps.toolContext(conversationId, signal, status);

    const messages = this.buildLlmMessages(conversationId, interception);
    const tools = this.deps.registry.describe();
    const settings = this.deps.settings.get();

    const assistantId = newId();
    const toolCalls: ToolCallRecord[] = [];
    let finalText = '';

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
      this.setState(iteration === 0 ? 'THINKING' : 'EXECUTING');

      const response = await provider.value.complete({
        system: this.systemPrompt(),
        messages,
        tools,
        maxTokens: settings.llm.maxTokens,
        effort: settings.llm.effort,
        signal,
        onTextDelta: (delta) => {
          this.deps.emit({ type: 'message-delta', messageId: assistantId, delta });
        },
      });

      if (!response.ok) {
        this.setState('ERROR');
        this.deps.emit({ type: 'error', error: response.error });
        this.deps.audit.log({
          actor: 'system',
          agent: 'JarvisCore',
          action: 'modellfehler',
          outcome: 'fehler',
          detail: `${response.error.code}: ${response.error.message}`,
        });
        return response;
      }

      const turnText = response.value.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n')
        .trim();
      if (turnText) finalText = finalText ? `${finalText}\n\n${turnText}` : turnText;

      if (response.value.stopReason === 'refusal') {
        finalText = response.value.refusalNote ?? 'Die Anfrage wurde abgelehnt.';
        break;
      }

      const requestedTools = response.value.content.filter(
        (block): block is Extract<LlmContent, { type: 'tool_use' }> => block.type === 'tool_use',
      );

      if (requestedTools.length === 0) break;

      messages.push({ role: 'assistant', content: response.value.content });

      const results: LlmContent[] = [];
      for (const call of requestedTools) {
        const record: ToolCallRecord = {
          id: call.id,
          tool: call.name,
          agent: this.deps.registry.get(call.name)?.agent ?? 'unbekannt',
          input: call.input,
          status: 'running',
          summary: this.deps.registry.summarize(call.name, call.input),
          startedAt: nowIso(),
        };
        toolCalls.push(record);
        this.deps.emit({ type: 'tool', call: record });

        const outcome = await this.deps.registry.execute(call.name, call.input, context);
        record.finishedAt = nowIso();

        if (outcome.ok) {
          record.status = 'ok';
          this.deps.audit.log({
            actor: 'jarvis',
            agent: record.agent,
            action: `werkzeug.${call.name}`,
            outcome: 'ok',
            detail: record.summary,
          });
          results.push({
            type: 'tool_result',
            toolUseId: call.id,
            content: JSON.stringify(outcome.value ?? { ok: true }, null, 0).slice(0, 60_000),
          });
        } else {
          record.status = 'error';
          record.error = outcome.error;
          this.deps.audit.log({
            actor: 'jarvis',
            agent: record.agent,
            action: `werkzeug.${call.name}`,
            outcome: 'fehler',
            detail: `${outcome.error.code}: ${outcome.error.message}`,
          });
          // The model is told the truth so it can react rather than pretend.
          results.push({
            type: 'tool_result',
            toolUseId: call.id,
            isError: true,
            content: JSON.stringify({
              fehler: outcome.error.code,
              meldung: outcome.error.message,
              hinweis: outcome.error.hint ?? null,
              wiederholbar: outcome.error.retryable ?? false,
            }),
          });
        }
        this.deps.emit({ type: 'tool', call: { ...record } });

        // Any tool that changed the world refreshes the relevant views.
        if (call.name.includes('email') || call.name.includes('outreach') || call.name === 'send_email') {
          this.deps.emit({ type: 'emails-changed' });
        }
        if (call.name.includes('compan') || call.name.includes('research') || call.name.includes('campaign')) {
          this.deps.emit({ type: 'companies-changed' });
        }
      }

      messages.push({ role: 'user', content: results });

      if (signal.aborted) {
        finalText = finalText || 'Abgebrochen.';
        break;
      }

      if (iteration === MAX_ITERATIONS - 1) {
        finalText =
          `${finalText}\n\n(Abbruch: die Aufgabe hat ${MAX_ITERATIONS} Werkzeugschritte überschritten. Bitte kleinteiliger beauftragen.)`.trim();
      }
    }

    const assistantMessage: ChatMessage = {
      id: assistantId,
      conversationId,
      role: 'assistant',
      text: finalText || 'Ich habe nichts zurückgemeldet bekommen.',
      createdAt: nowIso(),
      toolCalls,
    };
    this.deps.memory.appendTurn(assistantMessage);
    this.deps.emit({ type: 'message', message: assistantMessage });

    const pending = this.deps.approvals.listOpen();
    if (pending.length > 0) {
      this.setState('WAITING FOR APPROVAL');
      for (const request of pending) {
        this.deps.emit({ type: 'approval-requested', request });
      }
    }

    if (assistantMessage.text) {
      this.deps.emit({ type: 'speak', text: assistantMessage.text, messageId: assistantId });
    }

    return ok(assistantMessage);
  }

  /* ---------------------------------------------------------------- */

  private buildLlmMessages(conversationId: string, interception: string | null): LlmMessage[] {
    const history = this.deps.memory.history(conversationId, 30);
    const messages: LlmMessage[] = [];

    for (const message of history) {
      if (message.role === 'system') continue;
      messages.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: [{ type: 'text', text: message.text }],
      });
    }

    if (interception) {
      messages.push({ role: 'user', content: [{ type: 'text', text: interception }] });
    }

    // The API requires the conversation to start with a user turn.
    while (messages.length > 0 && messages[0]!.role !== 'user') {
      messages.shift();
    }
    if (messages.length === 0) {
      messages.push({ role: 'user', content: [{ type: 'text', text: 'Hallo.' }] });
    }
    return messages;
  }

  /** The behavioural contract handed to the model on every turn. */
  private systemPrompt(): string {
    const settings = this.deps.settings.get();
    const open = this.deps.approvals.listOpen();
    const preferences = this.deps.memory.preferenceDigest();

    return [
      `Du bist JARVIS, der persönliche Arbeitsassistent von ${
        settings.company.name || 'dem Benutzer'
      }. Du läufst lokal auf dem Rechner des Benutzers.`,
      '',
      'ARBEITSWEISE',
      '- Antworte auf Deutsch, in der Sie-Form, knapp und sachlich. Deine Antworten werden auch vorgelesen: kurze Sätze, keine Aufzählungszeichen-Wüsten, keine Markdown-Tabellen.',
      '- Du führst Aufgaben selbstständig aus, so weit sie ungefährlich und umkehrbar sind.',
      '- Für alles, was nach außen wirkt oder nicht umkehrbar ist, holst du vorher die Freigabe des Benutzers ein.',
      '',
      'WERKZEUGE',
      '- Jede echte Handlung geschieht ausschließlich über ein Werkzeug. Behaupte niemals, etwas getan zu haben, ohne dass das entsprechende Werkzeug es bestätigt hat.',
      '- Meldet ein Werkzeug einen Fehler, sage das klar, nenne die Meldung und schlage einen nächsten Schritt vor. Beschönige nichts.',
      '- Bei längeren Aufgaben gibst du zwischendurch kurze Statusmeldungen.',
      '',
      'E-MAIL — UNVERHANDELBAR',
      '- Du versendest NIE eine E-Mail von dir aus. Der Ablauf ist immer: Entwurf erstellen → request_send_approval → der Benutzer sieht Empfänger, Betreff und den vollständigen Text → eindeutige Freigabe → erst dann send_email.',
      '- Eindeutige Freigaben sind zum Beispiel: „senden", „freigeben", „Mail abschicken", „ja, genau so senden".',
      '- Alles andere ist keine Freigabe. Bei der geringsten Unklarheit fragst du nach und versendest nichts.',
      '- Auch mehrere Nachrichten werden nie in einem Rutsch versendet. Jede Nachricht braucht ihre eigene Freigabe.',
      '- Wird ein Entwurf nach der Freigabe geändert, verfällt die Freigabe. Dann ist eine neue nötig.',
      '',
      'RECHERCHE — KEINE ERFINDUNGEN',
      '- Erfinde niemals Unternehmensdaten und vor allem niemals E-Mail-Adressen. Muster wie vorname.nachname@firma.de sind verboten.',
      '- Verwende ausschließlich Adressen, die die Werkzeuge tatsächlich auf einer Seite gefunden haben.',
      '- Findest du keine belegte Adresse, sage genau das: „Keine verifizierte E-Mail-Adresse gefunden."',
      '- Trenne Fakten von Einschätzungen. Fakten nennst du mit Quelle, Einschätzungen kennzeichnest du als solche.',
      '',
      'AKTUELLER STAND',
      `- Datum: ${formatDe(nowIso())}`,
      `- Modell: ${settings.llm.provider}/${settings.llm.model}`,
      `- Postausgang: ${settings.mail.transport}${
        settings.mail.identity.email ? ` als ${settings.mail.identity.email}` : ' (kein Absender eingerichtet)'
      }`,
      `- Suchanbieter: ${settings.research.searchProvider}`,
      `- Versand nur an verifizierte Adressen: ${settings.compliance.requireVerifiedAddress ? 'ja' : 'nein'}; Tageslimit ${settings.compliance.dailySendLimit}`,
      settings.company.services ? `- Eigene Leistungen: ${settings.company.services}` : null,
      open.length
        ? `- OFFENE FREIGABEN: ${open.map((request) => `#${request.id} ${request.title} (Objekt ${request.subject})`).join('; ')}`
        : '- Offene Freigaben: keine',
      preferences ? `\nGEMERKTE PRÄFERENZEN\n${preferences}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  }
}
