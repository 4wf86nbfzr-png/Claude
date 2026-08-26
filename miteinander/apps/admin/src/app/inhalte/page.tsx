import { DGS_PRODUCTION_REQUIREMENTS, dgsStatusNotice } from '@miteinander/core';
import { dgs, easy } from '../../lib/data';

/**
 * Inhalte für Leichte Sprache und Gebärdensprache.
 *
 * Diese Seite ist bewusst unbequem ehrlich: sie zeigt genau, was noch
 * fehlt. Ein Produkt, das behauptet, in Gebaerdensprache verfuegbar zu
 * sein, ohne dass die Videos produziert und geprueft sind, schadet den
 * Menschen, die darauf angewiesen sind.
 */
export const dynamic = 'force-dynamic';

export default function ContentPage() {
  const registry = dgs();
  const easyRegistry = easy();
  const coverage = registry.coverage();
  const easyCoverage = easyRegistry.coverage();

  return (
    <>
      <h1>Inhalte</h1>

      <section aria-labelledby="dgs">
        <h2 id="dgs">Deutsche Gebärdensprache</h2>
        <p>
          Fachlich geprüft: <strong>{coverage.approved}</strong> von {coverage.total} Kernabläufen.
        </p>
        <div className="table-scroll">
          <table>
            <caption>Alle Kernabläufe, für die ein Video verpflichtend ist</caption>
            <thead>
              <tr>
                <th scope="col">Ablauf</th>
                <th scope="col">Status</th>
                <th scope="col">Geprüft von</th>
                <th scope="col">Was Nutzende sehen</th>
              </tr>
            </thead>
            <tbody>
              {registry.all().map((item) => (
                <tr key={item.key}>
                  <th scope="row">
                    {item.title}
                    <br />
                    <span className="muted">{item.key}</span>
                  </th>
                  <td>
                    <span
                      className={`badge ${item.status === 'approved' ? 'badge--ok' : 'badge--warn'}`}
                    >
                      {item.status === 'approved' ? '✓ geprüft' : `● ${item.status}`}
                    </span>
                  </td>
                  <td>{item.reviewedBy ?? <span className="muted">noch niemand</span>}</td>
                  <td className="muted">{dgsStatusNotice(item) ?? 'Video wird abgespielt.'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Anforderungen an die Produktion</h3>
        <ul>
          {DGS_PRODUCTION_REQUIREMENTS.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
        <p className="muted">
          Eine automatische Übersetzung ist nie eine gültige Quelle. Sie darf nicht Grundlage für
          Verträge, Buchungen, Sicherheit oder Einwilligungen sein.
        </p>
      </section>

      <section aria-labelledby="leicht">
        <h2 id="leicht">Leichte Sprache</h2>
        <p>
          Von einer Prüfgruppe freigegeben: <strong>{easyCoverage.approved}</strong> von{' '}
          {easyCoverage.total} Texten.
        </p>
        <p className="muted">
          Leichte Sprache muss von Menschen mit Lernschwierigkeiten geprüft werden. Bis dahin sind
          alle Texte als Entwurf gekennzeichnet – auch in der App.
        </p>
      </section>
    </>
  );
}
