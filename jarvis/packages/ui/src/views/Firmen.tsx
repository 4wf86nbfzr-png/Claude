import { useState } from 'react';
import { useDaten, useJarvis } from '../lib/store.js';

interface Firma {
  id: string;
  name: string;
  ort: string | null;
  website: string | null;
  branche: string | null;
  status: string;
  adressen: Array<{ adresse: string; status: string; quelle: string | null }>;
  zuletztAngeschrieben: string | null;
}

interface Dossier {
  name: string;
  website: string | null;
  anschrift: string | null;
  branche: string | null;
  telefon: string | null;
  FAKTEN: Array<{ angabe: string; wert: string; quelle: string | null }>;
  KI_EINSCHAETZUNGEN: Array<{ angabe: string; wert: string; hinweis: string }>;
  ansprechpartner: Array<{ name: string; position: string | null; quelle: string | null }>;
  adressen: Array<{ adresse: string; status: string; begruendung: string | null; gefundenAuf: string | null; mxErreichbar: boolean | null }>;
  historie: Array<{ wann: string; richtung: string; was: string }>;
}

/**
 * Firmendatenbank mit Dossier.
 *
 * Das Dossier trennt sichtbar zwischen belegten Angaben (mit Quelle) und
 * Einschätzungen der KI. Diese Trennung ist keine Kosmetik: sie entscheidet,
 * worauf man sich in einer Akquise-Mail berufen darf.
 */
export function Firmen(): JSX.Element {
  const jarvis = useJarvis();
  const [suche, setSuche] = useState('');
  const [offen, setOffen] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);

  const { daten: firmen, laedt } = useDaten<Firma[]>(
    { kind: 'companies.list', ...(suche ? { search: suche } : {}), limit: 200 },
    [],
  );

  const oeffnen = async (id: string) => {
    setOffen(id);
    setDossier(null);
    const r = await jarvis.senden({ kind: 'companies.dossier', companyId: id });
    if (r.ok) setDossier(r.data as Dossier);
  };

  return (
    <>
      <div className="buehne__kopf">
        <div>
          <p className="eyebrow">Datenbestand</p>
          <h1>Unternehmen</h1>
        </div>
        <input
          type="text"
          placeholder="Suchen …"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          aria-label="Unternehmen suchen"
          style={{
            background: 'var(--ink-2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-pill)',
            padding: '0.4rem 1rem',
            minWidth: '14rem',
          }}
        />
      </div>

      {firmen.length === 0 ? (
        <div className="leer">
          <p>{laedt ? 'Wird geladen …' : 'Noch keine Unternehmen recherchiert.'}</p>
        </div>
      ) : (
        <div className="tabelle__umbruch">
          <table className="tabelle">
            <thead>
              <tr>
                <th>Unternehmen</th>
                <th>Ort</th>
                <th>Branche</th>
                <th>Adressen</th>
                <th>Zuletzt angeschrieben</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {firmen.map((f) => (
                <tr key={f.id}>
                  <td>
                    <strong style={{ fontWeight: 500 }}>{f.name}</strong>
                    {f.website && (
                      <div className="leise" style={{ fontSize: '0.78rem' }}>
                        {f.website.replace(/^https?:\/\//, '')}
                      </div>
                    )}
                  </td>
                  <td className="leise">{f.ort ?? '—'}</td>
                  <td className="leise">{f.branche ?? '—'}</td>
                  <td>
                    {f.adressen.length === 0 ? (
                      <span className="leise">keine</span>
                    ) : (
                      f.adressen.slice(0, 2).map((a) => (
                        <div key={a.adresse} style={{ marginBottom: '0.2rem' }}>
                          {a.adresse}{' '}
                          <span className={a.status === 'VERIFIZIERT' ? 'merkmal merkmal--ok' : 'merkmal merkmal--warn'}>
                            {a.status === 'VERIFIZIERT' ? 'verifiziert' : 'wahrscheinlich'}
                          </span>
                        </div>
                      ))
                    )}
                  </td>
                  <td className="leise">
                    {f.zuletztAngeschrieben ? new Date(f.zuletztAngeschrieben).toLocaleDateString('de-DE') : '—'}
                  </td>
                  <td>
                    <button type="button" className="knopf knopf--klein" onClick={() => void oeffnen(f.id)}>
                      Dossier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {offen && (
        <div
          className="schleier"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setOffen(null)}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Firmendossier">
            {!dossier ? (
              <p className="leise">Wird geladen …</p>
            ) : (
              <>
                <p className="eyebrow">Dossier</p>
                <h2>{dossier.name}</h2>
                <p className="leise" style={{ marginTop: '0.25rem' }}>
                  {[dossier.anschrift, dossier.branche, dossier.telefon].filter(Boolean).join(' · ') || '—'}
                </p>

                <Abschnitt titel="Belegte Angaben">
                  {dossier.FAKTEN.length === 0 ? (
                    <p className="leise">Keine belegten Angaben gespeichert.</p>
                  ) : (
                    dossier.FAKTEN.map((f, i) => (
                      <div key={i} style={{ marginBottom: '0.75rem' }}>
                        <p className="dialog__label">{f.angabe}</p>
                        <p style={{ margin: '0.2rem 0' }}>{f.wert}</p>
                        {f.quelle && (
                          <button
                            type="button"
                            className="knopf knopf--klein"
                            onClick={() => void jarvis.senden({ kind: 'system.openExternal', url: f.quelle! })}
                          >
                            Quelle öffnen
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </Abschnitt>

                <Abschnitt titel="Einschätzungen der KI">
                  {dossier.KI_EINSCHAETZUNGEN.length === 0 ? (
                    <p className="leise">Keine.</p>
                  ) : (
                    dossier.KI_EINSCHAETZUNGEN.map((e, i) => (
                      <p key={i} className="hinweis hinweis--warn" style={{ marginBottom: '0.5rem' }}>
                        <strong style={{ fontWeight: 500 }}>{e.angabe}:</strong> {e.wert}
                      </p>
                    ))
                  )}
                </Abschnitt>

                <Abschnitt titel="E-Mail-Adressen">
                  {dossier.adressen.length === 0 ? (
                    <p className="leise">Keine verifizierte E-Mail-Adresse gefunden.</p>
                  ) : (
                    dossier.adressen.map((a) => (
                      <div key={a.adresse} className="dialog__zeile">
                        <span className="dialog__label">{a.status === 'VERIFIZIERT' ? 'Verifiziert' : a.status}</span>
                        <span className="dialog__wert">
                          {a.adresse}
                          {a.begruendung && (
                            <div className="leise" style={{ fontSize: '0.8rem' }}>{a.begruendung}</div>
                          )}
                          {a.mxErreichbar === false && (
                            <div className="leise" style={{ fontSize: '0.8rem', color: 'var(--warn)' }}>
                              Für diese Domain ist kein Mailserver erreichbar.
                            </div>
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </Abschnitt>

                {dossier.ansprechpartner.length > 0 && (
                  <Abschnitt titel="Ansprechpartner">
                    {dossier.ansprechpartner.map((p, i) => (
                      <div key={i} className="dialog__zeile">
                        <span className="dialog__label">{p.position ?? 'Person'}</span>
                        <span className="dialog__wert">{p.name}</span>
                      </div>
                    ))}
                  </Abschnitt>
                )}

                {dossier.historie.length > 0 && (
                  <Abschnitt titel="Kontakthistorie">
                    <div className="protokoll">
                      {dossier.historie.map((h, i) => (
                        <div key={i} className="protokoll__zeile">
                          <span className="protokoll__zeit">
                            {new Date(h.wann).toLocaleDateString('de-DE')}
                          </span>
                          <span>{h.was}</span>
                        </div>
                      ))}
                    </div>
                  </Abschnitt>
                )}

                <div className="dialog__aktionen">
                  <button type="button" className="knopf" onClick={() => setOffen(null)}>
                    Schließen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="abschnitt">
      <div className="abschnitt__kopf">
        <h3>{titel}</h3>
      </div>
      {children}
    </div>
  );
}
