import { useEffect, useState } from 'react';
import type { Freigabe } from '../lib/store.js';
import { schweig, sprich } from '../lib/voice.js';

/**
 * Der Freigabedialog.
 *
 * Hier entscheidet der Mensch. Deshalb steht alles vollständig da:
 * Empfänger, Betreff und der ganze Mailtext -- nicht gekürzt, nicht
 * zusammengefasst. Der freigebende Knopf ist der einzige hervorgehobene.
 */
export function ApprovalDialog({
  freigabe,
  beschaeftigt,
  onFreigeben,
  onAblehnen,
  onBearbeiten,
  onSchliessen,
}: {
  freigabe: Freigabe;
  beschaeftigt: boolean;
  onFreigeben: () => void;
  onAblehnen: () => void;
  onBearbeiten?: () => void;
  onSchliessen: () => void;
}): JSX.Element {
  const [liest, setLiest] = useState(false);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        schweig();
        onSchliessen();
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [onSchliessen]);

  const vorlesen = () => {
    if (liest) {
      schweig();
      setLiest(false);
      return;
    }
    const text = [freigabe.frage, ...freigabe.details.map((d) => `${d.label}: ${d.value}`)].join('. ');
    sprich(text, { unterbrechen: true });
    setLiest(true);
  };

  return (
    <div className="schleier" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onSchliessen()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="freigabe-titel">
        <p className="dialog__marke">Aktion benötigt Freigabe</p>
        <h2 id="freigabe-titel">{freigabe.titel}</h2>
        <p className="leise" style={{ marginTop: '0.35rem' }}>
          {freigabe.frage}
        </p>

        <div style={{ marginTop: '1.5rem' }}>
          {freigabe.details.map((detail, i) =>
            detail.kind === 'long' ? (
              <div key={`${detail.label}-${i}`} style={{ padding: '0.75rem 0' }}>
                <p className="dialog__label" style={{ marginBottom: '0.4rem' }}>
                  {detail.label}
                </p>
                <div className="dialog__block">{detail.value}</div>
              </div>
            ) : (
              <div className="dialog__zeile" key={`${detail.label}-${i}`}>
                <span className="dialog__label">{detail.label}</span>
                <span className="dialog__wert">{detail.value}</span>
              </div>
            ),
          )}
        </div>

        {freigabe.laeuftAbAm && (
          <p className="leise" style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
            Gültig bis {new Date(freigabe.laeuftAbAm).toLocaleString('de-DE')}.
          </p>
        )}

        <div className="dialog__aktionen">
          <button type="button" className="knopf" onClick={vorlesen}>
            {liest ? 'Vorlesen stoppen' : 'Vorlesen'}
          </button>
          {onBearbeiten && (
            <button type="button" className="knopf" onClick={onBearbeiten}>
              Bearbeiten
            </button>
          )}
          <button type="button" className="knopf knopf--gefahr" onClick={onAblehnen} disabled={beschaeftigt}>
            Abbrechen
          </button>
          <button type="button" className="knopf knopf--stark" onClick={onFreigeben} disabled={beschaeftigt}>
            {beschaeftigt ? 'Wird ausgeführt …' : 'Freigeben & senden'}
          </button>
        </div>
      </div>
    </div>
  );
}
