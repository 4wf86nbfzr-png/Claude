/**
 * Protokoll.
 *
 * Zeile für Zeile, was JARVIS getan hat — mit Uhrzeit und Verursacher.
 * Fehler stehen rot da und werden nicht weggeräumt.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { AuditEntry } from '@shared/types'

interface AuditViewProps {
  dataVersion: number
}

export function AuditView({ dataVersion }: AuditViewProps): ReactElement {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [onlyProblems, setOnlyProblems] = useState(false)

  const load = useCallback(async () => {
    setEntries(await window.jarvis.audit.list(400))
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [load, dataVersion])

  const visible = onlyProblems ? entries.filter((entry) => entry.level !== 'info') : entries

  return (
    <div className="view enter">
      <h2 className="view__title">Protokoll</h2>

      <div className="toolbar">
        <label className="checkbox-row" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={onlyProblems} onChange={(event) => setOnlyProblems(event.target.checked)} />
          Nur Warnungen und Fehler
        </label>
        <button type="button" className="btn btn--quiet" onClick={() => void load()}>
          Aktualisieren
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="empty">Nichts protokolliert.</p>
      ) : (
        visible.map((entry) => (
          <div className="log-line" key={entry.id} data-level={entry.level}>
            <span className="log-line__time">
              {new Date(entry.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="log-line__actor">{entry.actor}</span>
            <span className="log-line__text">
              <strong style={{ fontWeight: 500 }}>{entry.action}</strong>
              {entry.detail ? ` — ${entry.detail}` : ''}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
