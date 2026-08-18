import { useState } from 'react';
import type { ApprovalRequest } from '../../shared/types.js';

interface Props {
  request: ApprovalRequest;
  onApprove(evidence: string): void;
  onReject(evidence: string): void;
  onSpeak(text: string): void;
  onEdit?(subject: string): void;
  speaking: boolean;
  onStopSpeaking(): void;
}

/**
 * The approval gate as the user sees it (§11).
 *
 * It always shows what will happen, to whom, and the complete text — the same
 * string that `MailAgent.preview()` fingerprints. There is no "approve all"
 * and no way to approve without the preview being on screen.
 */
export function ApprovalPanel({
  request,
  onApprove,
  onReject,
  onSpeak,
  onEdit,
  speaking,
  onStopSpeaking,
}: Props): JSX.Element {
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="approval" aria-label="Freigabe erforderlich">
      <div className="approval__kicker">Aktion benötigt Freigabe</div>
      <h2 className="approval__title">{request.title}</h2>

      <dl className="approval__facts">
        {request.facts.map((fact) => (
          <div key={fact.label} style={{ display: 'contents' }}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      {request.preview ? (
        <div className="approval__preview">{request.preview}</div>
      ) : null}

      <div className="approval__actions">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => (speaking ? onStopSpeaking() : onSpeak(request.preview ?? request.title))}
        >
          {speaking ? 'Vorlesen stoppen' : 'Vorlesen'}
        </button>

        {onEdit ? (
          <button type="button" className="btn btn--small" onClick={() => onEdit(request.subject)}>
            Bearbeiten
          </button>
        ) : null}

        <button
          type="button"
          className="btn btn--small btn--danger"
          onClick={() => onReject('Schaltfläche „Abbrechen"')}
        >
          Abbrechen
        </button>

        {confirming ? (
          <button
            type="button"
            className="btn btn--small btn--primary"
            onClick={() => onApprove('Schaltfläche „Freigeben & senden" — zweifach bestätigt')}
            autoFocus
          >
            Wirklich senden an {shortRecipient(request)}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--small btn--primary"
            onClick={() => setConfirming(true)}
          >
            Freigeben &amp; senden
          </button>
        )}
      </div>

      <p className="mono muted" style={{ marginTop: 12, marginBottom: 0 }}>
        Läuft ab am {new Date(request.expiresAt).toLocaleString('de-DE')} · Freigabe gilt genau für diese
        Fassung.
      </p>
    </section>
  );
}

function shortRecipient(request: ApprovalRequest): string {
  const recipient = request.facts.find((fact) => fact.label === 'Empfänger')?.value;
  return recipient ?? 'den Empfänger';
}
