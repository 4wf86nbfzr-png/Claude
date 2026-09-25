import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { sicherheitscheck } from '@/lib/compliance/sicherheitscheck';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'Sicherheitscheck' };
export const dynamic = 'force-dynamic';

const GEWICHT_FARBE = { hoch: 'rot', mittel: 'gelb', niedrig: 'grau' } as const;

/**
 * Sicherheitscheck (SecPlan 24).
 *
 * Dreizehn Fragen, die man einmal im Monat stellen sollte und nie stellt.
 * Jeder Befund nennt einen Namen und ein Ziel – „3 Auffälligkeiten"
 * hätte niemandem geholfen.
 *
 * Der Check bewertet nicht. Ein Konto ohne Anmeldung seit 90 Tagen kann
 * eine Karteileiche sein oder die Urlaubsvertretung; das entscheidet,
 * wer die Zeile liest.
 */
export default async function Sicherheitscheck() {
  await seite('security.check');
  const pruefungen = await sicherheitscheck();

  const mitBefund = pruefungen.filter((p) => p.befunde.length > 0);
  const hoch = mitBefund.filter((p) => p.gewicht === 'hoch');
  const gesamtBefunde = pruefungen.reduce((s, p) => s + p.befunde.length, 0);

  return (
    <>
      <Seitenkopf
        titel="Sicherheitscheck"
        unter={`${pruefungen.length} Prüfungen · ${gesamtBefunde} Befunde`}
        brotkrumen={[{ href: '/compliance', label: 'HST Compliance' }]}
      />

      <Raster min={160}>
        <Kennzahl wert={pruefungen.length} label="Durchgeführte Prüfungen" />
        <Kennzahl wert={mitBefund.length} label="Prüfungen mit Befund"
                  farbe={mitBefund.length > 0 ? 'gelb' : 'gruen'} />
        <Kennzahl wert={hoch.length} label="Davon gewichtig"
                  farbe={hoch.length > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={gesamtBefunde} label="Einzelne Befunde" />
      </Raster>

      <div style={{ margin: '12px 0' }}>
        <Hinweis art="info">
          Der Check zeigt, er bewertet nicht. Ein Befund ist eine Frage, keine Feststellung –
          und keine Liste hier ersetzt, einmal selbst hinzusehen.
        </Hinweis>
      </div>

      {mitBefund.length === 0 ? (
        <Karte>
          <Leer>
            Keine der {pruefungen.length} Prüfungen hat etwas gefunden. Das heißt: nach diesen
            Kriterien ist gerade nichts auffällig – nicht, dass alles in Ordnung ist.
          </Leer>
        </Karte>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[...mitBefund].sort((a, b) => {
            const rang = { hoch: 0, mittel: 1, niedrig: 2 };
            return rang[a.gewicht] - rang[b.gewicht];
          }).map((pruefung) => (
            <Karte
              key={pruefung.id}
              titel={
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`marke marke-${GEWICHT_FARBE[pruefung.gewicht]}`}>{pruefung.befunde.length}</span>
                  <span style={{ fontWeight: 650 }}>{pruefung.frage}</span>
                </span>
              }
            >
              <p style={{ margin: 0, padding: '9px 12px 6px', fontSize: 12, color: 'var(--text-2)', maxWidth: '72ch' }}>
                {pruefung.warum}
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {pruefung.befunde.map((befund, i) => (
                  <li key={i}
                      style={{
                        display: 'flex', gap: 10, alignItems: 'baseline', justifyContent: 'space-between',
                        padding: '7px 12px', borderTop: '1px solid var(--linie)', fontSize: 12.5,
                      }}>
                    <span>
                      {befund.href ? <Link href={befund.href}>{befund.text}</Link> : befund.text}
                    </span>
                    {befund.zusatz && (
                      <span className="zahl" style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {befund.zusatz}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Karte>
          ))}
        </div>
      )}

      {pruefungen.length > mitBefund.length && (
        <>
          <h2 className="abschnitt" style={{ marginTop: 18 }}>Ohne Befund</h2>
          <Karte>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {pruefungen.filter((p) => p.befunde.length === 0).map((p) => (
                <li key={p.id}
                    style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid var(--linie)', fontSize: 12.5 }}>
                  <span className="marke marke-gruen">ohne Befund</span>
                  {p.frage}
                </li>
              ))}
            </ul>
          </Karte>
        </>
      )}
    </>
  );
}
