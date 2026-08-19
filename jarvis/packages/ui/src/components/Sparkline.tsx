import { useMemo, useState } from 'react';

export interface Punkt {
  tag: string;
  anzahl: number;
}

/**
 * Verlaufskurve für eine einzelne Reihe.
 *
 * Eine Reihe heißt: keine Legende — die Überschrift sagt, was geplottet ist.
 * Die Kurve liegt in der zurückgenommenen Farbe, nur der aktuelle Punkt trägt
 * die Akzentfarbe. Ein Ring in Flächenfarbe hält den Endpunkt lesbar, wo er
 * die Linie kreuzt.
 *
 * Der Hover ist keine Zugabe: ohne ihn müsste jeder Punkt beschriftet werden,
 * und beschriftete Punkte überall liest niemand. Wer keine Maus benutzt,
 * bekommt dieselben Werte über „Werte anzeigen" als Tabelle.
 */
export function Sparkline({
  daten,
  einheit = 'Mails',
  hoehe = 120,
}: {
  daten: Punkt[];
  einheit?: string;
  hoehe?: number;
}): JSX.Element {
  const [aktiv, setAktiv] = useState<number | null>(null);
  const [tabelle, setTabelle] = useState(false);

  const breite = 600;
  const rand = { oben: 12, unten: 12, links: 4, rechts: 4 };

  const { punkte, max, pfad, flaeche } = useMemo(() => {
    const hoechst = Math.max(1, ...daten.map((d) => d.anzahl));
    const nutzbareBreite = breite - rand.links - rand.rechts;
    const nutzbareHoehe = hoehe - rand.oben - rand.unten;

    const koordinaten = daten.map((d, i) => ({
      x: rand.links + (daten.length === 1 ? nutzbareBreite / 2 : (i / (daten.length - 1)) * nutzbareBreite),
      y: rand.oben + nutzbareHoehe - (d.anzahl / hoechst) * nutzbareHoehe,
      ...d,
    }));

    const linie = koordinaten.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const unten = hoehe - rand.unten;
    const wash =
      koordinaten.length > 0
        ? `${linie} L${koordinaten[koordinaten.length - 1]!.x.toFixed(1)},${unten} L${koordinaten[0]!.x.toFixed(1)},${unten} Z`
        : '';

    return { punkte: koordinaten, max: hoechst, pfad: linie, flaeche: wash };
  }, [daten, hoehe]);

  if (daten.length === 0) {
    return <p className="leise">Noch keine Sendungen erfasst.</p>;
  }

  const letzter = punkte[punkte.length - 1]!;
  const gezeigt = aktiv !== null ? punkte[aktiv] : null;

  const beiBewegung = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const anteil = (e.clientX - box.left) / box.width;
    const index = Math.round(anteil * (daten.length - 1));
    setAktiv(Math.max(0, Math.min(daten.length - 1, index)));
  };

  const datum = (tag: string) =>
    new Date(`${tag}T12:00:00Z`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

  return (
    <div className="spark">
      <svg
        className="spark__flaeche"
        viewBox={`0 0 ${breite} ${hoehe}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Verlauf der letzten ${daten.length} Tage, Höchstwert ${max} ${einheit} pro Tag`}
      >
        {/* Grundlinie – hauchdünn und durchgezogen, nie gestrichelt. */}
        <line
          className="spark__gitter"
          x1={0}
          y1={hoehe - rand.unten}
          x2={breite}
          y2={hoehe - rand.unten}
          vectorEffect="non-scaling-stroke"
        />

        {/* Wash statt Blockfläche: 10 % Deckkraft, damit die Linie führt. */}
        <path className="spark__wash" d={flaeche} />
        <path className="spark__linie" d={pfad} vectorEffect="non-scaling-stroke" />

        {gezeigt && (
          <>
            <line
              className="spark__faden"
              x1={gezeigt.x}
              y1={rand.oben - 6}
              x2={gezeigt.x}
              y2={hoehe - rand.unten}
              vectorEffect="non-scaling-stroke"
            />
            <circle className="spark__punkt" cx={gezeigt.x} cy={gezeigt.y} r={4.5} vectorEffect="non-scaling-stroke" />
          </>
        )}

        {/* Endpunkt: der aktuelle Wert ist der, auf den es ankommt. */}
        <circle className="spark__ende" cx={letzter.x} cy={letzter.y} r={4.5} vectorEffect="non-scaling-stroke" />

        {/* Trefferfläche großzügiger als die Marke selbst. */}
        <rect
          className="spark__treffer"
          x={0}
          y={0}
          width={breite}
          height={hoehe}
          onMouseMove={beiBewegung}
          onMouseLeave={() => setAktiv(null)}
        />
      </svg>

      {gezeigt && (
        <div
          className="spark__tooltip"
          style={{ left: `${(gezeigt.x / breite) * 100}%`, top: `${(gezeigt.y / hoehe) * 100}%` }}
        >
          {datum(gezeigt.tag)} · <b>{gezeigt.anzahl}</b> {einheit}
        </div>
      )}

      <div className="spark__achse">
        <span>{datum(daten[0]!.tag)}</span>
        <button
          type="button"
          className="knopf knopf--klein"
          onClick={() => setTabelle((a) => !a)}
          aria-expanded={tabelle}
        >
          {tabelle ? 'Werte ausblenden' : 'Werte anzeigen'}
        </button>
        <span>heute</span>
      </div>

      {tabelle && (
        <table className="tabelle" style={{ marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th>Tag</th>
              <th>{einheit}</th>
            </tr>
          </thead>
          <tbody>
            {[...daten].reverse().map((d) => (
              <tr key={d.tag}>
                <td>{new Date(`${d.tag}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{d.anzahl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
