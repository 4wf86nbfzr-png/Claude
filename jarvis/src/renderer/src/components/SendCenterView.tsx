/**
 * Versandzentrale.
 *
 * Eine Zeile je Vorgang mit den geforderten Spalten. Mehrfachauswahl möglich;
 * "Zur Freigabe stellen" legt die Freigabeanfrage an — versendet wird auch von
 * hier aus nichts ohne den Freigabedialog.
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { EmailDraft, SendCenterRow, VerificationStatus } from '@shared/types'
import { OUTREACH_STATUS_LABEL } from '@shared/types'

interface SendCenterViewProps {
  dataVersion: number
  onError(message: string, hint?: string): void
  onRead(text: string): void
  editEmailId: number | null
  onEditHandled(): void
}

const VERIFICATION_CLASS: Record<VerificationStatus, string> = {
  VERIFIZIERT: 'pill pill--good',
  WAHRSCHEINLICH: 'pill pill--warn',
  NICHT_VERIFIZIERT: 'pill pill--bad'
}

const MAIL_STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf erstellt',
  wartet_auf_freigabe: 'Wartet auf Freigabe',
  freigegeben: 'Freigegeben',
  gesendet: 'Gesendet',
  fehler: 'Fehler'
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('de-DE')
}

export function SendCenterView({
  dataVersion,
  onError,
  onRead,
  editEmailId,
  onEditHandled
}: SendCenterViewProps): ReactElement {
  const [rows, setRows] = useState<SendCenterRow[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editing, setEditing] = useState<EmailDraft | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const list = await window.jarvis.sendCenter.list({
      search: search || undefined,
      status: statusFilter || undefined,
      limit: 300
    })
    setRows(list)
  }, [search, statusFilter])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  const openEditor = useCallback(
    async (emailId: number) => {
      const email = await window.jarvis.emails.get(emailId)
      if (!email) {
        onError(`Entwurf #${emailId} existiert nicht mehr.`)
        return
      }
      setEditing(email)
    },
    [onError]
  )

  useEffect(() => {
    if (editEmailId !== null) {
      void openEditor(editEmailId)
      onEditHandled()
    }
  }, [editEmailId, openEditor, onEditHandled])

  const selectableIds = useMemo(
    () => rows.filter((row) => row.emailId !== null && row.mailStatus === 'entwurf').map((row) => row.emailId as number),
    [rows]
  )

  const toggle = (emailId: number): void => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(emailId)) next.delete(emailId)
      else next.add(emailId)
      return next
    })
  }

  const requestApproval = async (): Promise<void> => {
    if (selected.size === 0) return
    setBusy(true)
    const result = await window.jarvis.sendCenter.approve([...selected])
    setBusy(false)
    if (!result.ok) onError(result.error, result.hint)
    else setSelected(new Set())
    await load()
  }

  const saveDraft = async (): Promise<void> => {
    if (!editing) return
    setBusy(true)
    const result = await window.jarvis.emails.update(editing.id, {
      subject: editing.subject,
      bodyText: editing.bodyText,
      toAddress: editing.toAddress
    })
    setBusy(false)
    if (!result.ok) onError(result.error, result.hint)
    else setEditing(null)
    await load()
  }

  return (
    <div className="view enter">
      <h2 className="view__title">Versandzentrale</h2>

      <div className="toolbar">
        <input
          type="search"
          value={search}
          placeholder="Firma, Adresse, Betreff ..."
          onChange={(event) => setSearch(event.target.value)}
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">Alle Status</option>
          <option value="entwurf">Entwurf erstellt</option>
          <option value="wartet_auf_freigabe">Wartet auf Freigabe</option>
          <option value="gesendet">Gesendet</option>
          <option value="fehler">Fehler</option>
          <option value="neu">Neu (ohne Entwurf)</option>
          <option value="kontakt_gefunden">Kontakt gefunden</option>
          <option value="antwort_erhalten">Antwort erhalten</option>
        </select>

        <button
          type="button"
          className="btn"
          onClick={() => setSelected(new Set(selectableIds))}
          disabled={selectableIds.length === 0}
        >
          Alle Entwürfe wählen
        </button>

        <button
          type="button"
          className="btn btn--primary"
          onClick={requestApproval}
          disabled={selected.size === 0 || busy}
        >
          {selected.size > 1 ? `${selected.size} zur Freigabe stellen` : 'Zur Freigabe stellen'}
        </button>

        <button
          type="button"
          className="btn btn--quiet"
          onClick={async () => {
            setBusy(true)
            const result = await window.jarvis.emails.syncReplies()
            setBusy(false)
            if (!result.ok) onError(result.error, result.hint)
            await load()
          }}
          disabled={busy}
        >
          Antworten abgleichen
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="empty">Noch nichts vorhanden. Starten Sie eine Recherche im Gespräch.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th />
                <th>Unternehmen</th>
                <th>Ansprechpartner</th>
                <th>E-Mail</th>
                <th>Quelle</th>
                <th>Verifizierung</th>
                <th>Akquisegrund</th>
                <th>Mailstatus</th>
                <th>Letzter Kontakt</th>
                <th>Freigabe</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.companyId}-${row.emailId ?? 'ohne'}`}>
                  <td>
                    {row.emailId !== null && row.mailStatus === 'entwurf' ? (
                      <input
                        type="checkbox"
                        checked={selected.has(row.emailId)}
                        onChange={() => toggle(row.emailId as number)}
                        aria-label={`${row.company} auswählen`}
                      />
                    ) : null}
                  </td>
                  <td>
                    {row.company}
                    {row.doNotContact ? (
                      <>
                        <br />
                        <span className="pill pill--bad">nicht kontaktieren</span>
                      </>
                    ) : null}
                    <br />
                    <span className="cell-sub">{OUTREACH_STATUS_LABEL[row.outreachStatus]}</span>
                  </td>
                  <td>{row.contact ?? '—'}</td>
                  <td>{row.address ?? <span className="pill pill--bad">keine verifizierte Adresse</span>}</td>
                  <td>
                    {row.sourceUrl ? (
                      <button
                        type="button"
                        className="btn btn--quiet"
                        style={{ padding: 0 }}
                        onClick={() => void window.jarvis.system.openPath(row.sourceUrl as string)}
                        title={row.sourceUrl}
                      >
                        Quelle
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {row.verification ? (
                      <span className={VERIFICATION_CLASS[row.verification]}>{row.verification}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    <span className="cell-sub">{row.acquisitionReason ?? '—'}</span>
                  </td>
                  <td>
                    {row.mailStatus ? MAIL_STATUS_LABEL[row.mailStatus] ?? row.mailStatus : '—'}
                    {row.subject ? (
                      <>
                        <br />
                        <span className="cell-sub">{row.subject}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{formatDate(row.lastContactAt)}</td>
                  <td>{row.approvalStatus === 'keine' ? '—' : row.approvalStatus}</td>
                  <td>
                    {row.emailId !== null ? (
                      <button type="button" className="btn btn--quiet" onClick={() => void openEditor(row.emailId as number)}>
                        Oeffnen
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Entwurf bearbeiten">
          <div className="approval">
            <p className="approval__kicker">Entwurf #{editing.id}</p>
            <h2 className="approval__title">{editing.toAddress}</h2>

            {editing.status === 'gesendet' ? (
              <p className="inline-note">
                Diese Mail wurde am {formatDate(editing.sentAt)} versendet und kann nicht mehr geändert werden.
              </p>
            ) : null}
            {editing.errorMessage ? <p className="inline-note">Letzter Fehler: {editing.errorMessage}</p> : null}

            <div className="field">
              <label htmlFor="draft-to">Empfänger</label>
              <input
                id="draft-to"
                value={editing.toAddress}
                disabled={editing.status === 'gesendet'}
                onChange={(event) => setEditing({ ...editing, toAddress: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="draft-subject">Betreff</label>
              <input
                id="draft-subject"
                value={editing.subject}
                disabled={editing.status === 'gesendet'}
                onChange={(event) => setEditing({ ...editing, subject: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="draft-body">Text</label>
              <textarea
                id="draft-body"
                rows={14}
                value={editing.bodyText}
                disabled={editing.status === 'gesendet'}
                onChange={(event) => setEditing({ ...editing, bodyText: event.target.value })}
              />
              <p className="hint">
                Signatur und Abmeldehinweis setzt JARVIS beim Versand selbst darunter — sie stehen hier nicht drin.
              </p>
            </div>

            <div className="approval__actions">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  onRead(`Empfänger: ${editing.toAddress}. Betreff: ${editing.subject}. ${editing.bodyText}`)
                }
              >
                Vorlesen
              </button>
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Schließen
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={saveDraft}
                disabled={busy || editing.status === 'gesendet'}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
