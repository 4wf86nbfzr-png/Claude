import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { formatDateDE, formatHours } from '@/lib/time';
import { INCIDENT_KIND } from '@/lib/status';
import { monatsverlauf, monatsZeitraum, statistik } from '@/lib/queries/statistik';
import { Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';
import { Zeitraumfilter } from './filter';

export const metadata: Metadata = { title: 'Auswertungen' };
export const dynamic = 'force-dynamic';

export default async function Auswertungen({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await seite('reports.view');
  const params = await searchParams;

  const heute = new Date();
  const jahr = Number(params.jahr ?? heute.getUTCFullYear());
  const monat = Number(params.monat ?? heute.getUTCMonth() + 1);
  const zeitraum = monatsZeitraum(jahr, monat);

  const [daten, verlauf] = await Promise.all([statistik(zeitraum), monatsverlauf(12)]);
  const hoechstwert = Math.max(1, ...verlauf.map((m) => m.events));

  return (
    <>
      <Seitenkopf titel="Auswertungen" unter={`${formatDateDE(zeitraum.von)} – ${formatDateDE(zeitraum.bis)}`} />

      <Zeitraumfilter jahr={jahr} monat={monat} />

      <div style={{ marginTop: 14 }}>
        <Raster min={160}>
          <Kennzahl wert={daten.events.gesamt} label="Events im Zeitraum" />
          <Kennzahl wert={formatHours(daten.stunden.minuten)} label="Mitarbeiterstunden" />
          <Kennzahl wert={`${daten.besetzung.quote} %`} label="Besetzungsquote"
                    farbe={daten.besetzung.quote >= 95 ? 'gruen' : daten.besetzung.quote >= 80 ? 'gelb' : 'rot'} />
          <Kennzahl wert={daten.besetzung.offen} label="Offene Positionen" farbe={daten.besetzung.offen > 0 ? 'gelb' : 'gruen'} />
          <Kennzahl wert={`${daten.besetzung.zusagequote} %`} label="Zusagequote" />
          <Kennzahl wert={daten.ausfaelle.absagen} label="Absagen" farbe={daten.ausfaelle.absagen > 0 ? 'gelb' : 'grau'} />
          <Kennzahl wert={daten.ausfaelle.kurzfristig} label="Kurzfristige Absagen" hinweis="unter 48 Stunden"
                    farbe={daten.ausfaelle.kurzfristig > 0 ? 'rot' : 'gruen'} />
          <Kennzahl wert={daten.ausfaelle.nichtErschienen} label="Nicht erschienen"
                    farbe={daten.ausfaelle.nichtErschienen > 0 ? 'rot' : 'gruen'} />
          <Kennzahl wert={`${Math.round(daten.ausfaelle.reaktionsMinuten / 60)} h`} label="Ø Reaktionszeit auf Anfragen" />
          <Kennzahl wert={daten.partnerEinsaetze} label="Einsätze über Partner" />
        </Raster>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginTop: 16, alignItems: 'start' }} className="dashboard-raster">
        <Karte titel="Monatsvergleich (12 Monate)">
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150 }}>
              {verlauf.map((monatswert) => (
                <div key={monatswert.monat} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                     title={`${monatswert.monat}: ${monatswert.events} Events, ${monatswert.stunden} Stunden, ${monatswert.offen} offen`}>
                  <span className="zahl" style={{ fontSize: 10, color: 'var(--text-3)' }}>{monatswert.events}</span>
                  <span style={{
                    width: '100%',
                    height: `${Math.max(2, (monatswert.events / hoechstwert) * 110)}px`,
                    background: monatswert.offen > 0 ? 'var(--gelb)' : 'var(--blau)',
                    borderRadius: '3px 3px 0 0',
                  }} />
                  <span className="zahl" style={{ fontSize: 9, color: 'var(--text-3)', transform: 'rotate(-45deg)', transformOrigin: 'center', whiteSpace: 'nowrap' }}>
                    {monatswert.monat}
                  </span>
                </div>
              ))}
            </div>
            <p className="feld-hinweis" style={{ marginTop: 18 }}>
              Balken in Gelb: In diesem Monat blieben Positionen unbesetzt.
            </p>
          </div>
        </Karte>

        <Karte titel="Nach Leistungsbereich">
          {daten.nachBereich.length === 0 ? <Leer>Keine Daten im Zeitraum.</Leer> : (
            <table className="tabelle">
              <thead><tr><th>Bereich</th><th>Events</th><th>Soll</th><th>Besetzt</th><th>Quote</th></tr></thead>
              <tbody>
                {daten.nachBereich.map((bereich) => {
                  const quote = bereich.soll > 0 ? Math.round((bereich.ist / bereich.soll) * 100) : 0;
                  return (
                    <tr key={bereich.name}>
                      <td>{bereich.name}</td>
                      <td className="zahl">{bereich.events}</td>
                      <td className="zahl">{bereich.soll}</td>
                      <td className="zahl">{bereich.ist}</td>
                      <td className="zahl" style={{ color: quote >= 95 ? 'var(--gruen)' : quote >= 80 ? 'var(--gelb)' : 'var(--rot)', fontWeight: 600 }}>{quote} %</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Karte>

        <Karte titel="Kunden nach Einsätzen">
          {daten.nachKunde.length === 0 ? <Leer>Keine Daten im Zeitraum.</Leer> : (
            <table className="tabelle">
              <thead><tr><th>Kunde</th><th>Events</th></tr></thead>
              <tbody>
                {daten.nachKunde.map((kunde) => (
                  <tr key={kunde.id}><td>{kunde.name}</td><td className="zahl">{kunde.events}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Karte>

        <Karte titel="Vorfälle">
          {daten.vorfaelle.length === 0 ? <Leer>Keine Vorfälle im Zeitraum.</Leer> : (
            <table className="tabelle">
              <thead><tr><th>Art</th><th>Anzahl</th></tr></thead>
              <tbody>
                {daten.vorfaelle.map((vorfall) => (
                  <tr key={vorfall.art}>
                    <td>{INCIDENT_KIND[vorfall.art] ?? vorfall.art}</td>
                    <td className="zahl">{vorfall.anzahl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Karte>
      </div>
    </>
  );
}
