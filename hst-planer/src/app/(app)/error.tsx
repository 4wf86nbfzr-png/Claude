'use client';

import { Hinweis, Karte } from '@/components/ui';

export default function BereichsFehler({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Karte>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
        <h1 style={{ fontSize: 17, fontWeight: 650, margin: 0 }}>Dieser Bereich konnte nicht geladen werden</h1>
        <Hinweis art="fehler">
          Der Vorgang wurde abgebrochen. Die technischen Einzelheiten stehen im Serverprotokoll.
        </Hinweis>
        <div>
          <button className="knopf knopf-primaer" onClick={reset}>Erneut versuchen</button>
        </div>
      </div>
    </Karte>
  );
}
