import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApprovalRequest,
  AssistantState,
  ChatMessage,
  JarvisError,
  JarvisEvent,
} from '../../shared/types.js';

export interface JarvisUiState {
  state: AssistantState;
  messages: ChatMessage[];
  approvals: ApprovalRequest[];
  status: string;
  error: JarvisError | null;
  conversationId: string;
  /** Bumped whenever companies/e-mails changed, so views can refetch. */
  dataVersion: number;
  busy: boolean;
}

export interface JarvisActions {
  send(text: string, spoken?: boolean): Promise<void>;
  cancel(): void;
  approve(id: number, evidence: string): Promise<void>;
  reject(id: number, evidence: string): Promise<void>;
  dismissError(): void;
  newConversation(): Promise<void>;
  refreshApprovals(): Promise<void>;
}

/** Text the assistant produced that has not been spoken yet. */
export interface SpeechRequest {
  id: string;
  text: string;
}

/**
 * Single source of truth for the UI. It subscribes to the main process event
 * stream once and folds every event into local state; nothing in the UI polls.
 */
export function useJarvis(): {
  ui: JarvisUiState;
  actions: JarvisActions;
  speech: SpeechRequest | null;
  consumeSpeech(): void;
} {
  const [state, setState] = useState<AssistantState>('IDLE');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<JarvisError | null>(null);
  const [conversationId, setConversationId] = useState('');
  const [dataVersion, setDataVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [speech, setSpeech] = useState<SpeechRequest | null>(null);
  const streaming = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const id = await window.jarvis.chat.newConversation();
      if (cancelled) return;
      setConversationId(id);
      const [history, open] = await Promise.all([
        window.jarvis.chat.history(id, 100),
        window.jarvis.approvals.list(),
      ]);
      if (cancelled) return;
      setMessages(history);
      setApprovals(open);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.jarvis.onEvent((event: JarvisEvent) => {
      switch (event.type) {
        case 'state':
          setState(event.state);
          if (event.state === 'IDLE' || event.state === 'ERROR') setStatus('');
          break;
        case 'status':
          setStatus(event.text);
          break;
        case 'message-delta': {
          const previous = streaming.current.get(event.messageId) ?? '';
          const next = previous + event.delta;
          streaming.current.set(event.messageId, next);
          setMessages((current) => {
            const index = current.findIndex((message) => message.id === event.messageId);
            if (index === -1) {
              return [
                ...current,
                {
                  id: event.messageId,
                  conversationId: '',
                  role: 'assistant',
                  text: next,
                  createdAt: new Date().toISOString(),
                },
              ];
            }
            const copy = current.slice();
            copy[index] = { ...copy[index]!, text: next };
            return copy;
          });
          break;
        }
        case 'message':
          streaming.current.delete(event.message.id);
          setMessages((current) => {
            const index = current.findIndex((message) => message.id === event.message.id);
            if (index === -1) return [...current, event.message];
            const copy = current.slice();
            copy[index] = event.message;
            return copy;
          });
          break;
        case 'tool':
          setMessages((current) => {
            const copy = current.slice();
            for (let index = copy.length - 1; index >= 0; index -= 1) {
              const message = copy[index]!;
              if (message.role !== 'assistant') continue;
              const calls = message.toolCalls ?? [];
              const existing = calls.findIndex((call) => call.id === event.call.id);
              const nextCalls =
                existing === -1
                  ? [...calls, event.call]
                  : calls.map((call) => (call.id === event.call.id ? event.call : call));
              copy[index] = { ...message, toolCalls: nextCalls };
              return copy;
            }
            return current;
          });
          break;
        case 'approval-requested':
          setApprovals((current) =>
            current.some((request) => request.id === event.request.id)
              ? current
              : [...current, event.request],
          );
          break;
        case 'approval-resolved':
          setApprovals((current) => current.filter((request) => request.id !== event.request.id));
          break;
        case 'companies-changed':
        case 'emails-changed':
          setDataVersion((value) => value + 1);
          break;
        case 'speak':
          setSpeech({ id: event.messageId ?? String(Date.now()), text: event.text });
          break;
        case 'error':
          setError(event.error);
          break;
        default:
          break;
      }
    });
    return unsubscribe;
  }, []);

  const send = useCallback(
    async (text: string, spoken = false) => {
      const trimmed = text.trim();
      if (!trimmed || !conversationId) return;
      setBusy(true);
      setError(null);
      try {
        const result = await window.jarvis.chat.send({ text: trimmed, conversationId, spoken });
        if (!result.ok) setError(result.error);
      } finally {
        setBusy(false);
      }
    },
    [conversationId],
  );

  const refreshApprovals = useCallback(async () => {
    setApprovals(await window.jarvis.approvals.list());
  }, []);

  const decide = useCallback(
    async (id: number, granted: boolean, evidence: string) => {
      const result = granted
        ? await window.jarvis.approvals.approve(id, evidence)
        : await window.jarvis.approvals.reject(id, evidence);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setApprovals((current) => current.filter((request) => request.id !== id));

      // The decision is fed back into the conversation so the assistant carries
      // it out (or confirms the stop). It names the exact subject, because a
      // second approval may still be open and must not be caught by this.
      const subject = result.value.subject;
      await send(
        granted
          ? `Freigabe #${id} für ${subject} wurde erteilt. Führe genau diese Aktion jetzt aus und melde das tatsächliche Ergebnis.`
          : `Freigabe #${id} für ${subject} wurde abgelehnt. Führe sie nicht aus.`,
      );
    },
    [send],
  );

  const actions = useMemo<JarvisActions>(
    () => ({
      send,
      cancel: () => {
        void window.jarvis.chat.cancel();
      },
      approve: (id, evidence) => decide(id, true, evidence),
      reject: (id, evidence) => decide(id, false, evidence),
      dismissError: () => setError(null),
      newConversation: async () => {
        const id = await window.jarvis.chat.newConversation();
        setConversationId(id);
        setMessages([]);
        setStatus('');
      },
      refreshApprovals,
    }),
    [send, decide, refreshApprovals],
  );

  return {
    ui: { state, messages, approvals, status, error, conversationId, dataVersion, busy },
    actions,
    speech,
    consumeSpeech: () => setSpeech(null),
  };
}
