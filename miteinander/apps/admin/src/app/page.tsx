import { RESPONSE_TARGET_HOURS, getQualification, isOverdue } from '@miteinander/core';
import { clock, dashboardCounters } from '../lib/data';

/**
 * Screen 21: Admin-Dashboard.
 *
 * Die Reihenfolge folgt der Dringlichkeit: Sicherheitsfaelle zuerst, dann
 * Pruefungen, dann Betrieb. Der ehrliche Stand der Inhalte (Gebaerdensprache,
 * Leichte Sprache) steht gleichberechtigt daneben -- er ist eine
 * Barrierefreiheits-Kennzahl, kein Nebenprodukt.
 */
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const counters = await dashboardCounters();
  const now = clock().now();

  return (
    <>
      <h1>Übersicht</h1>

      <section aria-labelledby="sicherheit">
        <h2 id="sicherheit">Sicherheitsfälle</h2>
        {counters.offeneVorfaelle.length === 0 ? (
          <p className="muted">Es gibt gerade keine offenen Fälle.</p>
        ) : (
          <div className="grid">
            {counters.offeneVorfaelle.map((incident) => {
              const overdue = isOverdue(incident, now);
              return (
                <article key={incident.id} className="card">
                  <span
                    className={`badge ${incident.priority === 'critical' ? 'badge--critical' : 'badge--warn'}`}
                  >
                    {incident.priority === 'critical' ? '⚠ kritisch' : `● ${incident.priority}`}
                  </span>
                  <h3 style={{ margin: 0 }}>{incident.title}</h3>
                  <p className="muted" style={{ margin: 0 }}>
                    {incident.summary}
                  </p>
                  <p style={{ margin: 0 }}>
                    Zusage: {RESPONSE_TARGET_HOURS[incident.priority]} Stunden
                    {overdue ? ' – überschritten' : ''}
                  </p>
                  {incident.requiresFourEyes ? (
                    <p className="muted" style={{ margin: 0 }}>
                      Eine Sperrung in diesem Fall braucht zwei Augenpaare.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="pruefungen">
        <h2 id="pruefungen">Prüfungen</h2>
        <div className="grid">
          <article className="card">
            <h3 style={{ margin: 0 }}>Offene Nachweise</h3>
            <p style={{ fontSize: '2rem', margin: 0 }}>{counters.offenePruefungen}</p>
            <p className="muted" style={{ margin: 0 }}>
              warten auf eine Entscheidung
            </p>
          </article>
          <article className="card">
            <h3 style={{ margin: 0 }}>Laufen bald ab</h3>
            <p style={{ fontSize: '2rem', margin: 0 }}>{counters.ablaufendeNachweise.length}</p>
            <ul className="muted" style={{ margin: 0, paddingLeft: '1.2em' }}>
              {counters.ablaufendeNachweise.map((v) => (
                <li key={v.id}>
                  {getQualification(v.qualificationKey)?.label ?? v.qualificationKey} – gültig bis{' '}
                  {v.validUntil}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section aria-labelledby="betrieb">
        <h2 id="betrieb">Betrieb</h2>
        <div className="grid">
          <article className="card">
            <h3 style={{ margin: 0 }}>Offene Anfragen</h3>
            <p style={{ fontSize: '2rem', margin: 0 }}>{counters.offeneAnfragen}</p>
          </article>
          <article className="card">
            <h3 style={{ margin: 0 }}>Bestätigte Termine</h3>
            <p style={{ fontSize: '2rem', margin: 0 }}>{counters.anstehendeTermine}</p>
          </article>
        </div>
      </section>

      <section aria-labelledby="barrierefreiheit">
        <h2 id="barrierefreiheit">Barrierefreiheit der Inhalte</h2>
        <div className="grid">
          <article className="card">
            <h3 style={{ margin: 0 }}>Gebärdensprache</h3>
            <p style={{ fontSize: '2rem', margin: 0 }}>
              {counters.dgsAbdeckung.approved} von {counters.dgsAbdeckung.total}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Kernabläufe mit fachlich geprüftem Video. Ungeprüfte Abläufe werden in der App
              ausdrücklich als solche gekennzeichnet.
            </p>
          </article>
          <article className="card">
            <h3 style={{ margin: 0 }}>Leichte Sprache</h3>
            <p style={{ fontSize: '2rem', margin: 0 }}>
              {counters.leichteSprache.approved} von {counters.leichteSprache.total}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Texte, die von einer Prüfgruppe freigegeben sind.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
