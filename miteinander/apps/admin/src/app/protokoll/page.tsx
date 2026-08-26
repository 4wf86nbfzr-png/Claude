import { RETENTION_RULES } from '@miteinander/core';
import { db } from '../../lib/data';

/**
 * Revisionsprotokoll.
 *
 * Es enthaelt bewusst keine Inhalte, sondern nur, wer wann was mit welchem
 * Datensatz getan hat. Nachtraegliche Aenderungen sind ausgeschlossen --
 * ein Protokoll, das sich aendern laesst, ist keines.
 */
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const events = await db().audit.list();

  return (
    <>
      <h1>Protokoll</h1>
      <p className="muted">
        Nur lesbar. Sensible Inhalte werden vor dem Schreiben entfernt.
      </p>

      <div className="table-scroll">
        <table>
          <caption>Sicherheitsrelevante Vorgänge</caption>
          <thead>
            <tr>
              <th scope="col">Zeitpunkt</th>
              <th scope="col">Wer</th>
              <th scope="col">Was</th>
              <th scope="col">Betroffener Datensatz</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  Noch keine Einträge in dieser Sitzung.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id}>
                  <th scope="row">{event.at}</th>
                  <td>{event.actorId ?? 'System'}</td>
                  <td>{event.action}</td>
                  <td>
                    {event.entity} / {event.entityId}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2>Aufbewahrung</h2>
      <div className="table-scroll">
        <table>
          <caption>Was wie lange gespeichert wird und warum</caption>
          <thead>
            <tr>
              <th scope="col">Datenart</th>
              <th scope="col">Frist</th>
              <th scope="col">Auslöser</th>
              <th scope="col">Bei Löschwunsch</th>
              <th scope="col">Grund</th>
            </tr>
          </thead>
          <tbody>
            {RETENTION_RULES.map((rule) => (
              <tr key={rule.entity}>
                <th scope="row">{rule.entity}</th>
                <td>{rule.days === 0 ? 'sofort' : `${rule.days} Tage`}</td>
                <td>{rule.trigger}</td>
                <td>
                  {rule.onDeletionRequest === 'delete'
                    ? 'löschen'
                    : rule.onDeletionRequest === 'anonymize'
                      ? 'anonymisieren'
                      : 'sperren'}
                  {rule.statutory ? ' (gesetzliche Pflicht)' : ''}
                </td>
                <td className="muted">{rule.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
