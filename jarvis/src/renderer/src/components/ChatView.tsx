/**
 * Gespräch.
 *
 * Verlauf, Statuszeile und Eingabe. Enter sendet, Umschalt+Enter macht einen
 * Absatz. Der Mikrofonknopf nimmt auf und schickt das Erkannte gleich ab.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ChatTurn } from '@shared/types'

interface ChatViewProps {
  turns: ChatTurn[]
  streaming: string
  statusMessage: string
  busy: boolean
  recording: boolean
  onSend(text: string): void
  onToggleRecording(): void
  onCancel(): void
}

export function ChatView({
  turns,
  streaming,
  statusMessage,
  busy,
  recording,
  onSend,
  onToggleRecording,
  onCancel
}: ChatViewProps): ReactElement {
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length, streaming])

  const submit = (): void => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    onSend(text)
    textarea.current?.focus()
  }

  return (
    <>
      <div className="chat" ref={scroller}>
        {turns.length === 0 && !streaming ? (
          <p className="empty">
            Sagen Sie etwas — zum Beispiel: „Such mir fünfzehn Bauunternehmen in Hamburg für unsere
            Baustellenbewachung.“
          </p>
        ) : null}

        {turns.map((turn) => (
          <article key={turn.id} className={`turn turn--${turn.role} enter`}>
            <p className="turn__role">{turn.role === 'user' ? 'Sie' : 'Jarvis'}</p>
            <div className="turn__text">{turn.text}</div>
            {turn.toolCalls && turn.toolCalls.length > 0 ? (
              <div className="turn__tools">
                {turn.toolCalls.map((call, index) => (
                  <span key={`${turn.id}-${index}`} className={`tool-chip${call.ok ? '' : ' tool-chip--bad'}`}>
                    {call.name}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}

        {streaming ? (
          <article className="turn turn--assistant">
            <p className="turn__role">Jarvis</p>
            <div className="turn__text">{streaming}</div>
          </article>
        ) : null}
      </div>

      <p className="status-line" aria-live="polite">
        {busy ? statusMessage || 'Arbeite ...' : statusMessage}
      </p>

      <div className="composer">
        <button
          type="button"
          className="btn btn--rec"
          data-active={recording}
          onClick={onToggleRecording}
          title={recording ? 'Aufnahme beenden' : 'Sprechen'}
          aria-label={recording ? 'Aufnahme beenden' : 'Sprechen'}
        >
          {recording ? '■' : '●'}
        </button>

        <textarea
          ref={textarea}
          value={draft}
          rows={1}
          placeholder="Auftrag eingeben oder sprechen ..."
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />

        {busy ? (
          <button type="button" className="btn" onClick={onCancel}>
            Stopp
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!draft.trim()}>
            Senden
          </button>
        )}
      </div>
    </>
  )
}
