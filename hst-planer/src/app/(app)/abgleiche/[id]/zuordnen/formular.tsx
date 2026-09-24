'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { abgleichStartenAktion, type Ergebnis } from '../../actions';
import { Hinweis, Karte, Raster } from '@/components/ui';
import type { ColumnMapping, TimesheetField } from '@/lib/import/columns';

interface FeldDefinition { field: TimesheetField; label: string; pflicht: boolean }

function Starten({ bereit }: { bereit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knopf knopf-primaer knopf-gross" disabled={pending || !bereit}>
      {pending ? 'Abgleich läuft …' : 'Abgleich starten'}
    </button>
  );
}

export function ZuordnungsFormular({
  id, headers, felder, mapping, vorlagen,
}: {
  id: string;
  headers: string[];
  felder: FeldDefinition[];
  mapping: ColumnMapping;
  vorlagen: Array<{ id: string; name: string; mapping: ColumnMapping }>;
}) {
  const [zustand, aktion] = useActionState<Ergebnis, FormData>(abgleichStartenAktion, {});
  const [auswahl, setAuswahl] = useState<ColumnMapping>(mapping);

  // Pflicht ist: Mitarbeiter (oder Vor- und Nachname), Datum, Beginn, Ende.
  const bereit = Boolean(
    (auswahl.name || (auswahl.firstName && auswahl.lastName)) && auswahl.date && auswahl.start && auswahl.end,
  );

  function vorlageAnwenden(vorlageId: string) {
    const vorlage = vorlagen.find((v) => v.id === vorlageId);
    if (!vorlage) return;
    // Nur Spalten übernehmen, die es in dieser Datei auch gibt.
    const gefiltert: ColumnMapping = {};
    for (const [feld, spalte] of Object.entries(vorlage.mapping)) {
      if (spalte && headers.includes(spalte)) gefiltert[feld as TimesheetField] = spalte;
    }
    setAuswahl(gefiltert);
  }

  return (
    <form action={aktion} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="id" value={id} />
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}

      <Karte titel="Zuordnung der Spalten">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {vorlagen.length > 0 && (
            <label className="feld-gruppe" style={{ maxWidth: 360 }}>
              <span className="feld-label">Vorlage anwenden</span>
              <select className="feld" defaultValue="" onChange={(e) => vorlageAnwenden(e.target.value)}>
                <option value="">– keine –</option>
                {vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          )}

          <Raster min={230}>
            {felder.map((feld) => (
              <label key={feld.field} className="feld-gruppe">
                <span className="feld-label">
                  {feld.label}{feld.pflicht && <span style={{ color: 'var(--rot)' }}> *</span>}
                </span>
                <select
                  name={`spalte_${feld.field}`}
                  className="feld"
                  value={auswahl[feld.field] ?? ''}
                  onChange={(e) => setAuswahl((alt) => ({ ...alt, [feld.field]: e.target.value || undefined }))}
                >
                  <option value="">– nicht vorhanden –</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </Raster>

          {!bereit && (
            <Hinweis art="warnung">
              Bitte ordnen Sie mindestens Mitarbeiter (oder Vor- und Nachname), Datum, Beginn und Ende zu.
            </Hinweis>
          )}
        </div>
      </Karte>

      <Karte titel="Regeln für diesen Abgleich">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Raster min={200}>
            <label className="feld-gruppe">
              <span className="feld-label">Zeittoleranz (Minuten)</span>
              <input name="toleranz" type="number" min={0} max={120} defaultValue={15} className="feld zahl" />
              <span className="feld-hinweis">Bis zu dieser Abweichung gilt eine Zeit als identisch.</span>
            </label>
            <label className="feld-gruppe">
              <span className="feld-label">Pausentoleranz (Minuten)</span>
              <input name="pausenToleranz" type="number" min={0} max={120} defaultValue={15} className="feld zahl" />
            </label>
            <label className="feld-gruppe">
              <span className="feld-label">Vorlage speichern als</span>
              <input name="vorlageName" className="feld" placeholder="z. B. Partner Stundenzettel" />
              <span className="feld-hinweis">Leer lassen, wenn keine Vorlage entstehen soll.</span>
            </label>
          </Raster>

          <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" name="fehlendeMelden" defaultChecked /> Geplante Kräfte ohne Ist-Zeit melden
          </label>
        </div>
      </Karte>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Starten bereit={bereit} />
      </div>
    </form>
  );
}
