/**
 * Gedächtnis.
 *
 * Alles, was JARVIS sich gemerkt hat — sichtbar und einzeln löschbar.
 * Das ist keine Nebensache: Wer nicht sehen kann, was gespeichert ist, kann
 * es auch nicht verantworten.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { MemoryFact } from '@shared/types'

interface MemoryViewProps {
  dataVersion: number
  onError(message: string, hint?: string): void
}

const SCOPE_LABEL: Record<string, string> = {
  user_preference: 'Vorgaben des Nutzers',
  company_note: 'Firmennotizen',
  task: 'Aufgaben',
  system: 'System',
  conversation: 'Gespräch'
}

export function MemoryView({ dataVersion, onError }: MemoryViewProps): ReactElement {
  const [facts, setFacts] = useState<MemoryFact[]>([])

  const load = useCallback(async () => {
    setFacts(await window.jarvis.memory.list())
  }, [])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  const remove = async (id: number): Promise<void> => {
    const result = await window.jarvis.memory.remove(id)
    if (!result.ok) onError(result.error, result.hint)
    await load()
  }

  const clearScope = async (scope: string): Promise<void> => {
    const result = await window.jarvis.memory.clearScope(scope)
    if (!result.ok) onError(result.error, result.hint)
    await load()
  }

  const scopes = [...new Set(facts.map((fact) => fact.scope))]

  return (
    <div className="view enter">
      <h2 className="view__title">Gedächtnis</h2>

      <p className="inline-note">
        JARVIS speichert nicht jedes Wort. Hier steht nur, was ausdrücklich gemerkt wurde — Sie können jeden Eintrag
        löschen. Der Gesprächsverlauf liegt getrennt davon in der Datenbank.
      </p>

      {facts.length === 0 ? (
        <p className="empty">Es ist nichts gespeichert.</p>
      ) : (
        scopes.map((scope) => (
          <div className="section" key={scope}>
            <h3>
              {SCOPE_LABEL[scope] ?? scope}
              <button
                type="button"
                className="btn btn--quiet"
                style={{ marginLeft: 12 }}
                onClick={() => void clearScope(scope)}
              >
                Bereich leeren
              </button>
            </h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Schlüssel</th>
                    <th>Inhalt</th>
                    <th>Herkunft</th>
                    <th>Geändert</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {facts
                    .filter((fact) => fact.scope === scope)
                    .map((fact) => (
                      <tr key={fact.id}>
                        <td>{fact.key}</td>
                        <td>{fact.value}</td>
                        <td className="cell-sub">{fact.origin}</td>
                        <td className="cell-sub">{new Date(fact.updatedAt).toLocaleDateString('de-DE')}</td>
                        <td>
                          <button type="button" className="btn btn--quiet" onClick={() => void remove(fact.id)}>
                            Löschen
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
