import { useEffect, useRef, useState } from 'react';
import type { ApprovalRequest, ChatMessage, JarvisError, AssistantState } from '../../shared/types.js';
import { VoiceOrb } from '../components/VoiceOrb.js';
import { ApprovalPanel } from '../components/ApprovalPanel.js';
import type { VoiceController } from '../voice/useVoice.js';

interface Props {
  state: AssistantState;
  messages: ChatMessage[];
  approvals: ApprovalRequest[];
  status: string;
  error: JarvisError | null;
  busy: boolean;
  voice: VoiceController;
  onSend(text: string): void;
  onCancel(): void;
  onApprove(id: number, evidence: string): void;
  onReject(id: number, evidence: string): void;
  onDismissError(): void;
  onOpenDraft(emailId: number): void;
}

export function ConsoleView({
  state,
  messages,
  approvals,
  status,
  error,
  busy,
  voice,
  onSend,
  onCancel,
  onApprove,
  onReject,
  onDismissError,
  onOpenDraft,
}: Props): JSX.Element {
  const [draft, setDraft] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, approvals.length, status]);

  // Space toggles the microphone when the composer does not have focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT';
      if (!typing && event.code === 'Space' && voice.supported) {
        event.preventDefault();
        voice.toggle();
      }
      if (event.key === 'Escape' && busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel, voice]);

  const submit = (): void => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onSend(text);
  };

  const displayState: AssistantState = voice.listening ? 'LISTENING' : voice.speaking ? 'SPEAKING' : state;

  return (
    <div className="console">
      <div className="stage">
        <h1 className="stage__title" style={{ letterSpacing: '0.5em' }}>
          JARVIS
        </h1>
        <VoiceOrb
          state={displayState}
          listening={voice.listening}
          level={voice.level}
          onToggle={voice.toggle}
          disabled={!voice.supported}
        />
        <div className="stage__state" data-state={displayState}>
          {displayState === 'IDLE' ? (voice.supported ? 'BEREIT · LEERTASTE ZUM SPRECHEN' : 'BEREIT') : displayState}
        </div>
        {voice.partial ? <div className="status-line">„{voice.partial}"</div> : null}
      </div>

      {error ? (
        <div className="notice notice--error">
          <strong>{error.message}</strong>
          {error.hint ? <div className="muted">{error.hint}</div> : null}
          {error.detail ? <div className="mono muted">{error.detail}</div> : null}
          <button type="button" className="btn btn--quiet btn--small" onClick={onDismissError}>
            Ausblenden
          </button>
        </div>
      ) : null}

      {voice.error ? <div className="notice">{voice.error}</div> : null}

      {approvals.map((request) => (
        <ApprovalPanel
          key={request.id}
          request={request}
          speaking={voice.speaking}
          onSpeak={(text) => void voice.speak(text)}
          onStopSpeaking={voice.stopSpeaking}
          onApprove={(evidence) => onApprove(request.id, evidence)}
          onReject={(evidence) => onReject(request.id, evidence)}
          onEdit={
            request.subject.startsWith('email:')
              ? (subject) => onOpenDraft(Number.parseInt(subject.split(':')[1] ?? '0', 10))
              : undefined
          }
        />
      ))}

      <div className="transcript">
        {messages.length === 0 ? (
          <p className="muted">
            Sagen Sie zum Beispiel: „Such mir 15 Bauunternehmen in Hamburg für unsere Baustellenbewachung."
          </p>
        ) : null}

        {messages.map((message) => (
          <article key={message.id} className={`turn turn--${message.role}`}>
            <div className="turn__who">{message.role === 'user' ? 'Sie' : 'JARVIS'}</div>
            <div className="turn__text">{message.text}</div>
            {message.toolCalls && message.toolCalls.length > 0 ? (
              <div className="turn__tools">
                {message.toolCalls.map((call) => (
                  <div key={call.id} className="tool" data-status={call.status}>
                    <span>{symbolFor(call.status)}</span>
                    <span>{call.summary}</span>
                    {call.error ? <span>— {call.error.message}</span> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {message.role === 'assistant' && message.text ? (
              <button
                type="button"
                className="btn btn--quiet btn--small"
                style={{ marginTop: 6 }}
                onClick={() => void voice.speak(message.text)}
              >
                Vorlesen
              </button>
            ) : null}
          </article>
        ))}

        <div className="status-line">{status}</div>
        <div ref={bottom} />
      </div>

      <div className="composer">
        <textarea
          className="composer__input"
          placeholder="Auftrag eingeben …"
          value={draft}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {busy ? (
          <button type="button" className="btn" onClick={onCancel}>
            Abbrechen
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!draft.trim()}>
            Senden
          </button>
        )}
      </div>
    </div>
  );
}

function symbolFor(status: string): string {
  switch (status) {
    case 'ok':
      return '✓';
    case 'error':
      return '✕';
    case 'running':
      return '…';
    case 'awaiting-approval':
      return '⏸';
    default:
      return '·';
  }
}
