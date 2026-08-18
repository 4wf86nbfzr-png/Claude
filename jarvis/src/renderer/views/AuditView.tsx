import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry, JarvisError, MemoryEntry } from '../../shared/types.js';

interface Props {
  dataVersion: number;
  onError(error: JarvisError): void;
}

/** Audit log (§18) and the memory inspector (§13) — both read and delete. */
export function AuditView({ dataVersion, onError }: Props): JSX.Element {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [exported, setExported] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [log, remembered] = await Promise.all([
      window.jarvis.audit.list(300),
      window.jarvis.memory.list(),
    ]);
    setEntries(log);
    setMemory(remembered);
  }, []);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  return (
    <div className="view">
      <h1>Protokoll</h1>

      <div className="row" style={{ marginBottom: 18 }}>
        <button type="button" className="btn btn--small" onClick={() => void load()}>
          Aktualisieren
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={async () => {
            const result = await window.jarvis.audit.exportCsv();
            if (!result.ok) onError(result.error);
            else setExported(result.value);
          }}
        >
          Als CSV exportieren
        </button>
        {exported ? <span className="mono muted">Gespeichert: {exported}</span> : null}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Zeit</th>
            <th>Akteur</th>
            <th>Agent</th>
            <th>Aktion</th>
            <th>Objekt</th>
            <th>Ergebnis</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td className="table__empty" colSpan={7}>
                Noch keine Einträge.
              </td>
            </tr>
          ) : null}
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="mono">{new Date(entry.at).toLocaleString('de-DE')}</td>
              <td>{entry.actor}</td>
              <td className="muted">{entry.agent ?? '—'}</td>
              <td className="mono">{entry.action}</td>
              <td className="mono muted">{entry.subject ?? '—'}</td>
              <td>
                <span
                  className={`tag ${
                    entry.outcome === 'ok'
                      ? 'tag--ok'
                      : entry.outcome === 'fehler'
                        ? 'tag--danger'
                        : entry.outcome === 'abgelehnt'
                          ? 'tag--warn'
                          : ''
                  }`}
                >
                  {entry.outcome}
                </span>
              </td>
              <td style={{ maxWidth: 340, overflowWrap: 'anywhere' }}>{entry.detail ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr className="divider" />

      <h2>Gedächtnis</h2>
      <p>
        Was JARVIS dauerhaft gespeichert hat. Gesprächsverläufe werden nach 30 Tagen automatisch
        gelöscht; die Einträge hier bleiben, bis Sie sie entfernen.
      </p>

      <table className="table">
        <thead>
          <tr>
            <th>Art</th>
            <th>Schlüssel</th>
            <th>Wert</th>
            <th>Gespeichert</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {memory.length === 0 ? (
            <tr>
              <td className="table__empty" colSpan={5}>
                Nichts gespeichert.
              </td>
            </tr>
          ) : null}
          {memory.map((entry) => (
            <tr key={entry.id}>
              <td>
                <span className="tag">{entry.kind}</span>
              </td>
              <td className="mono">{entry.key ?? '—'}</td>
              <td>{entry.value}</td>
              <td className="mono">{new Date(entry.createdAt).toLocaleDateString('de-DE')}</td>
              <td>
                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  onClick={async () => {
                    const result = await window.jarvis.memory.remove(entry.id);
                    if (!result.ok) onError(result.error);
                    else await load();
                  }}
                >
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn btn--small btn--danger"
          onClick={async () => {
            const result = await window.jarvis.memory.clear('conversation');
            if (!result.ok) onError(result.error);
            else await load();
          }}
        >
          Gesprächsverläufe löschen
        </button>
      </div>
    </div>
  );
}
