'use client';

import { Icon } from '@/components/icons';

export function Drucken() {
  return (
    <div className="nicht-drucken" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
      <button type="button" className="knopf knopf-primaer" onClick={() => window.print()}>
        <Icon name="print" /> Drucken
      </button>
    </div>
  );
}
