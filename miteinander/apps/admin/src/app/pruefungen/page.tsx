import {
  describeVerification,
  getQualification,
  systemClock,
  type ProviderVerification,
} from '@miteinander/core';
import { db } from '../../lib/data';

/**
 * Screen 16 (Verwaltungssicht): Nachweisprüfung.
 *
 * Sichtbar ist immer, ob ein Nachweis zwei Augenpaare braucht und ob die
 * zweite Freigabe vorliegt. Der Inhalt eines Dokuments erscheint nie in
 * der Liste -- er wird einzeln und protokolliert geoeffnet.
 */
export const dynamic = 'force-dynamic';

function statusBadge(v: ProviderVerification) {
  switch (v.status) {
    case 'approved':
      return <span className="badge badge--ok">✓ geprüft</span>;
    case 'pending':
      return <span className="badge">⏳ offen</span>;
    case 'expired':
      return <span className="badge badge--warn">⌛ abgelaufen</span>;
    default:
      return <span className="badge badge--critical">✕ abgelehnt</span>;
  }
}

export default async function VerificationsPage() {
  const data = db();
  const verifications = await data.verifications.all();
  const users = await data.users.list();
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? id;
  const today = systemClock.today();

  const sorted = [...verifications].sort((a, b) => {
    const rank = (v: ProviderVerification) =>
      v.status === 'pending' ? 0 : v.status === 'expired' ? 1 : 2;
    return rank(a) - rank(b);
  });

  return (
    <>
      <h1>Nachweise</h1>
      <p className="muted">
        Geprüft wird immer nur das konkrete Dokument. Fachqualifikationen, die zu
        erlaubnispflichtiger Arbeit berechtigen, brauchen die Freigabe von zwei Personen.
      </p>

      <div className="table-scroll">
        <table>
          <caption>Alle eingereichten Nachweise, offene zuerst</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Nachweis</th>
              <th scope="col">Status</th>
              <th scope="col">Vier-Augen-Prinzip</th>
              <th scope="col">Gültig bis</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => {
              const qualification = getQualification(v.qualificationKey);
              const needsTwo = qualification?.licensesProfessionalWork === true;
              const expired = v.validUntil != null && v.validUntil < today;
              return (
                <tr key={v.id}>
                  <th scope="row">{nameOf(v.providerId)}</th>
                  <td>
                    {qualification?.label ?? v.qualificationKey}
                    <br />
                    <span className="muted">{describeVerification(v)}</span>
                  </td>
                  <td>{statusBadge(v)}</td>
                  <td>
                    {needsTwo ? (
                      v.secondApproverId ? (
                        <span className="badge badge--ok">
                          ✓ zwei Freigaben ({nameOf(v.decidedBy ?? '')} und {nameOf(v.secondApproverId)})
                        </span>
                      ) : (
                        <span className="badge badge--critical">⚠ zweite Freigabe fehlt</span>
                      )
                    ) : (
                      <span className="muted">nicht erforderlich</span>
                    )}
                  </td>
                  <td>
                    {v.validUntil ?? <span className="muted">unbefristet</span>}
                    {expired ? ' (abgelaufen)' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Regeln der Prüfung</h2>
      <ul>
        <li>Ohne geprüfte Identität erscheint niemand in Vorschlägen.</li>
        <li>
          Ohne gültige Fachqualifikation werden erlaubnispflichtige Anfragen gar nicht erst
          angezeigt – das ist zusätzlich in der Datenbank abgesichert.
        </li>
        <li>Eine Ablehnung braucht eine Begründung, die der anbietenden Person angezeigt wird.</li>
        <li>Ein Nachweis mit Ablaufdatum wechselt automatisch nach „abgelaufen“.</li>
      </ul>
    </>
  );
}
