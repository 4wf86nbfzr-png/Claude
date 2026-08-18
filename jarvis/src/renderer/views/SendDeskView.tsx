import { useCallback, useEffect, useState } from 'react';
import type { EmailRecord, JarvisError, SendDeskRow, VerificationStatus } from '../../shared/types.js';

interface Props {
  dataVersion: number;
  focusEmailId: number | null;
  onFocusHandled(): void;
  onSpeak(text: string): void;
  onRequestApproval(emailId: number): void;
  onError(error: JarvisError): void;
}

/**
 * The Versandzentrale (§6): one row per company with everything needed to
 * decide, and a draft editor that never contains a send button — the send is
 * requested here and granted in the approval panel on the console.
 */
export function SendDeskView({
  dataVersion,
  focusEmailId,
  onFocusHandled,
  onSpeak,
  onRequestApproval,
  onError,
}: Props): JSX.Element {
  const [rows, setRows] = useState<SendDeskRow[]>([]);
  const [search, setSearch] = useState('');
  const [onlyDrafts, setOnlyDrafts] = useState(false);
  const [editing, setEditing] = useState<EmailRecord | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setRows(
      await window.jarvis.companies.sendDesk({
        search: search || undefined,
        onlyReadyForApproval: onlyDrafts,
      }),
    );
  }, [onlyDrafts, search]);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const openDraft = useCallback(
    async (emailId: number) => {
      const email = await window.jarvis.emails.get(emailId);
      if (!email.ok) {
        onError(email.error);
        return;
      }
      setEditing(email.value);
      setSaved(false);
    },
    [onError],
  );

  useEffect(() => {
    if (focusEmailId) {
      void openDraft(focusEmailId);
      onFocusHandled();
    }
  }, [focusEmailId, onFocusHandled, openDraft]);

  const save = async (): Promise<void> => {
    if (!editing) return;
    const result = await window.jarvis.emails.update(editing.id, {
      to: editing.to,
      subject: editing.subject,
      body: editing.body,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setEditing(result.value);
    setSaved(true);
    void load();
  };

  return (
    <div className="view">
      <h1>Versandzentrale</h1>

      <div className="row" style={{ marginBottom: 20 }}>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Unternehmen suchen …"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={onlyDrafts}
            onChange={(event) => setOnlyDrafts(event.target.checked)}
          />
          <span className="muted">Nur fertige Entwürfe</span>
        </label>
        <button type="button" className="btn btn--small" onClick={() => void load()}>
          Aktualisieren
        </button>
      </div>

      {editing ? (
        <div className="editor">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Entwurf {editing.id}</strong>
            <button type="button" className="btn btn--quiet btn--small" onClick={() => setEditing(null)}>
              Schließen
            </button>
          </div>

          {editing.status === 'gesendet' ? (
            <div className="notice notice--ok">
              Am {new Date(editing.sentAt ?? '').toLocaleString('de-DE')} versendet · Message-Id{' '}
              <span className="mono">{editing.messageId || '(nicht gemeldet)'}</span>
            </div>
          ) : null}
          {editing.errorMessage ? (
            <div className="notice notice--error">
              Versand fehlgeschlagen: {editing.errorMessage}
            </div>
          ) : null}

          <div className="field">
            <span className="field__label">Empfänger</span>
            <input
              className="input"
              value={editing.to}
              disabled={editing.status === 'gesendet'}
              onChange={(event) => setEditing({ ...editing, to: event.target.value })}
            />
          </div>
          <div className="field">
            <span className="field__label">Betreff</span>
            <input
              className="input"
              value={editing.subject}
              disabled={editing.status === 'gesendet'}
              onChange={(event) => setEditing({ ...editing, subject: event.target.value })}
            />
          </div>
          <div className="field">
            <span className="field__label">Text</span>
            <textarea
              className="textarea"
              style={{ minHeight: 220 }}
              value={editing.body}
              disabled={editing.status === 'gesendet'}
              onChange={(event) => setEditing({ ...editing, body: event.target.value })}
            />
          </div>

          {saved ? (
            <div className="notice">
              Gespeichert (Revision {editing.revision}). Eine frühere Freigabe ist damit ungültig.
            </div>
          ) : null}

          <div className="row">
            <button
              type="button"
              className="btn btn--small"
              onClick={() => onSpeak(`Betreff: ${editing.subject}. ${editing.body}`)}
            >
              Vorlesen
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => void save()}
              disabled={editing.status === 'gesendet'}
            >
              Speichern
            </button>
            <button
              type="button"
              className="btn btn--small btn--primary"
              onClick={() => onRequestApproval(editing.id)}
              disabled={editing.status === 'gesendet'}
            >
              Freigabe anfordern
            </button>
          </div>
          <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 12 }}>
            Der Versand erfolgt erst nach Ihrer Freigabe in der Konsole.
          </p>
        </div>
      ) : null}

      <table className="table">
        <thead>
          <tr>
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
          {rows.length === 0 ? (
            <tr>
              <td className="table__empty" colSpan={10}>
                Noch keine Unternehmen. Beauftragen Sie JARVIS in der Konsole mit einer Recherche.
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.companyId}>
              <td>
                {row.company}
                {row.doNotContact ? (
                  <>
                    {' '}
                    <span className="tag tag--danger">gesperrt</span>
                  </>
                ) : null}
              </td>
              <td>{row.contact ?? <span className="muted">—</span>}</td>
              <td className="mono">{row.email ?? <span className="muted">keine gefunden</span>}</td>
              <td className="mono" style={{ maxWidth: 190, overflowWrap: 'anywhere' }}>
                {row.source ? (
                  <a
                    href={row.source}
                    onClick={(event) => {
                      event.preventDefault();
                      void window.jarvis.system.openPath(row.source!);
                    }}
                    style={{ color: 'var(--chrome)' }}
                  >
                    {shorten(row.source)}
                  </a>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>{verificationTag(row.emailStatus)}</td>
              <td style={{ maxWidth: 260 }}>{row.rationale ?? <span className="muted">—</span>}</td>
              <td>
                <span className="tag">{row.mailStatus.replaceAll('_', ' ')}</span>
              </td>
              <td className="mono">
                {row.lastContactAt ? new Date(row.lastContactAt).toLocaleDateString('de-DE') : '—'}
              </td>
              <td>
                <span className={`tag ${row.approvalStatus === 'offen' ? 'tag--warn' : ''}`}>
                  {row.approvalStatus}
                </span>
              </td>
              <td>
                {row.emailId ? (
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={() => void openDraft(row.emailId!)}
                  >
                    Öffnen
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function verificationTag(status: VerificationStatus | null): JSX.Element {
  if (!status) return <span className="muted">—</span>;
  const className =
    status === 'VERIFIZIERT' ? 'tag tag--ok' : status === 'WAHRSCHEINLICH' ? 'tag tag--warn' : 'tag tag--danger';
  return <span className={className}>{status}</span>;
}

function shorten(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname.length > 1 ? parsed.pathname : ''}`.slice(0, 42);
  } catch {
    return url.slice(0, 42);
  }
}
