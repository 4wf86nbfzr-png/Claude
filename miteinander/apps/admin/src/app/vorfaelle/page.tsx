import {
  RESPONSE_TARGET_HOURS,
  isOverdue,
  systemClock,
  triageOrder,
} from '@miteinander/core';
import { db } from '../../lib/data';

/**
 * Sicherheitsfälle.
 *
 * Die Liste zeigt bewusst keinen Freitext aus den Meldungen -- er steht nur
 * in der Fallakte und wird protokolliert geoeffnet. So enthaelt eine
 * Uebersicht am Bildschirm nie sensible Schilderungen.
 */
export const dynamic = 'force-dynamic';

export default async function IncidentsPage() {
  const data = db();
  const incidents = await data.safety.incidents();
  const now = systemClock.now();
  const sorted = triageOrder(incidents, now);

  return (
    <>
      <h1>Sicherheitsfälle</h1>
      <p className="muted">
        Sortiert nach Dringlichkeit. Überschrittene Zusagen stehen oben.
      </p>

      <div className="table-scroll">
        <table>
          <caption>Alle Fälle</caption>
          <thead>
            <tr>
              <th scope="col">Fall</th>
              <th scope="col">Dringlichkeit</th>
              <th scope="col">Status</th>
              <th scope="col">Zusage</th>
              <th scope="col">Zuständig</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((incident) => {
              const overdue = isOverdue(incident, now);
              return (
                <tr key={incident.id}>
                  <th scope="row">
                    {incident.title}
                    <br />
                    <span className="muted">{incident.summary}</span>
                  </th>
                  <td>
                    <span
                      className={`badge ${
                        incident.priority === 'critical'
                          ? 'badge--critical'
                          : incident.priority === 'high'
                            ? 'badge--warn'
                            : ''
                      }`}
                    >
                      {incident.priority === 'critical' ? '⚠ ' : '● '}
                      {incident.priority}
                    </span>
                  </td>
                  <td>{incident.status}</td>
                  <td>
                    {RESPONSE_TARGET_HOURS[incident.priority]} Stunden
                    {overdue ? (
                      <>
                        <br />
                        <span className="badge badge--critical">⚠ überschritten</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {incident.assignedTo ?? <span className="muted">noch niemand</span>}
                    {incident.requiresFourEyes ? (
                      <>
                        <br />
                        <span className="muted">Sperrung nur mit zweiter Freigabe</span>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Ablauf</h2>
      <ol>
        <li>Meldung geht ein und wird automatisch eingestuft.</li>
        <li>Ein Fall in Bearbeitung braucht eine namentlich zuständige Person.</li>
        <li>
          Sperrungen und kritische Nachweisentscheidungen brauchen zwei verschiedene berechtigte
          Personen. Selbstfreigabe ist ausgeschlossen.
        </li>
        <li>Jeder Schritt landet im Protokoll – ohne den Inhalt der Meldung.</li>
      </ol>
    </>
  );
}
