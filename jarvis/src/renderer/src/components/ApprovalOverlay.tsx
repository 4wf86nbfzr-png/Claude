/**
 * Freigabedialog.
 *
 * Zeigt vor jeder Aktion mit Außenwirkung genau das, worum es geht:
 * Empfänger, Betreff und den vollständigen Text. Der Knopf heißt nicht
 * "OK", sondern sagt, was passiert.
 */
import { useEffect, useRef, type ReactElement } from 'react'
import { APPROVAL_ACTION_LABEL, type ApprovalRequest } from '@shared/types'

interface ApprovalOverlayProps {
  request: ApprovalRequest
  onDecide(decision: 'freigegeben' | 'abgelehnt'): void
  onRead(text: string): void
  onEdit(emailId: number): void
  speaking: boolean
  onStopReading(): void
}

export function ApprovalOverlay({
  request,
  onDecide,
  onRead,
  onEdit,
  speaking,
  onStopReading
}: ApprovalOverlayProps): ReactElement {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Der Fokus landet bewusst auf "Abbrechen": ein versehentliches Enter darf
  // nicht senden.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [request.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDecide('abgelehnt')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDecide])

  const readable = [
    request.details.Empfänger ? `Empfänger: ${request.details.Empfänger}.` : '',
    request.details.Betreff ? `Betreff: ${request.details.Betreff}.` : '',
    request.body ?? ''
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="approval-title">
      <div className="approval">
        <p className="approval__kicker">Action requires approval</p>
        <h2 className="approval__title" id="approval-title">
          {APPROVAL_ACTION_LABEL[request.action] ?? request.action}
        </h2>

        <dl className="approval__facts">
          {Object.entries(request.details).map(([key, value]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt>{key.replace(/_/g, ' ')}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {request.body ? <div className="approval__body">{request.body}</div> : null}

        <div className="approval__actions">
          <button
            type="button"
            className="btn"
            onClick={() => (speaking ? onStopReading() : onRead(readable))}
            disabled={!readable}
          >
            {speaking ? 'Vorlesen stoppen' : 'Vorlesen'}
          </button>

          {request.relatedEmailId ? (
            <button type="button" className="btn" onClick={() => onEdit(request.relatedEmailId as number)}>
              Bearbeiten
            </button>
          ) : null}

          <button type="button" className="btn" ref={cancelRef} onClick={() => onDecide('abgelehnt')}>
            Abbrechen
          </button>

          <button type="button" className="btn btn--primary" onClick={() => onDecide('freigegeben')}>
            {request.action === 'email_senden' || request.action === 'email_bulk_senden'
              ? 'Freigeben und senden'
              : 'Freigeben'}
          </button>
        </div>
      </div>
    </div>
  )
}
