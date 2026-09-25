import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { AVV_STATUS, label } from '@/lib/status';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';

export const metadata: Metadata = { title: 'AVV' };
export const dynamic = 'force-dynamic';

/**
 * Auftragsverarbeiter (SecPlan 19 und 20, Art. 28 DSGVO).
 *
 * Wer verarbeitet in unserem Auftrag personenbezogene Daten, und liegt
 * dafür ein Vertrag vor? Drittlandtransfers stehen mit ihrer Grundlage
 * dabei, weil ein Transfer ohne Grundlage kein Randproblem ist.
 *
 * KI-Systeme sind eigens markiert (SecPlan 20): an sie gehen von diesem
 * System aus keine personenbezogenen Mitarbeiterdaten. Wer daran etwas
 * ändern will, muss vorher Anbieter, Serverstandort, Speicherung,
 * Trainingsnutzung, Unterauftragnehmer, AVV, Drittlandtransfer,
 * Rechtsgrundlage und Löschfrist klären.
 */
export default async function Avv() {
  await seite('compliance.view');
  const heute = new Date();

  const verarbeiter = await db.processor.findMany({
    where: { deletedAt: null },
    orderBy: [{ avvStatus: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, service: true, country: true, thirdCountry: true, transferBasis: true,
      avvStatus: true, avvSignedAt: true, avvUntil: true, contactEmail: true, subProcessors: true,
      personalData: true, aiSystem: true, aiTrainingUse: true, note: true,
      activities: { select: { activity: { select: { id: true, number: true, name: true } } } },
    },
  });

  const ohneVertrag = verarbeiter.filter((v) => v.personalData && ['NICHT_VORHANDEN', 'ENTWURF'].includes(v.avvStatus));
  const drittlandOhneGrundlage = verarbeiter.filter((v) => v.thirdCountry && !v.transferBasis);
  const kiMitDaten = verarbeiter.filter((v) => v.aiSystem && v.personalData);
  const abgelaufen = verarbeiter.filter((v) => v.avvUntil && v.avvUntil < heute);

  return (
    <>
      <Seitenkopf
        titel="Auftragsverarbeiter"
        unter="Art. 28 DSGVO – Verträge, Unterauftragnehmer und Drittlandtransfers"
        brotkrumen={[{ href: '/compliance', label: 'HST Compliance' }]}
      />

      <Raster min={160}>
        <Kennzahl wert={verarbeiter.length} label="Erfasste Verarbeiter" />
        <Kennzahl wert={ohneVertrag.length} label="Ohne unterzeichneten AVV"
                  hinweis="mit Personenbezug"
                  farbe={ohneVertrag.length > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={drittlandOhneGrundlage.length} label="Drittland ohne Grundlage"
                  farbe={drittlandOhneGrundlage.length > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={abgelaufen.length} label="Vertrag abgelaufen"
                  farbe={abgelaufen.length > 0 ? 'gelb' : 'gruen'} />
      </Raster>

      <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Hinweis art="info">
          <strong>Keine personenbezogenen Mitarbeiterdaten an externe KI-Systeme.</strong> Dieses
          System übermittelt von sich aus keine. Wo eine KI-Unterstützung eingerichtet ist,
          bekommt sie den Text einer Anfrage – nicht die Personalakte. Eine automatisierte
          Bewertung von Mitarbeitern findet nicht statt und wäre ohne eigene rechtliche Prüfung
          auch nicht zulässig.
        </Hinweis>

        {kiMitDaten.length > 0 && (
          <Hinweis art="warnung">
            {kiMitDaten.length} {kiMitDaten.length === 1 ? 'Eintrag ist' : 'Einträge sind'} als
            KI-System mit möglichem Personenbezug markiert. Vor einer Nutzung gehört geklärt:
            Anbieter, Serverstandort, Speicherung, Nutzung zum Training, Unterauftragnehmer, AVV,
            Drittlandtransfer, Rechtsgrundlage, Löschfrist.
          </Hinweis>
        )}
      </div>

      <Karte>
        {verarbeiter.length === 0 ? (
          <Leer>Es ist kein Auftragsverarbeiter erfasst.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Anbieter</th><th>Leistung</th><th>Personenbezug</th><th>Sitz</th>
                  <th>Drittland</th><th>Grundlage des Transfers</th><th>AVV</th>
                  <th>Unterzeichnet</th><th>Gültig bis</th><th>Unterauftragnehmer</th><th>Verarbeitungen</th>
                </tr>
              </thead>
              <tbody>
                {verarbeiter.map((v) => {
                  const kritisch = (v.personalData && ['NICHT_VORHANDEN', 'ENTWURF'].includes(v.avvStatus))
                    || (v.thirdCountry && !v.transferBasis);
                  return (
                    <tr key={v.id} className={kritisch ? 'zeile-rot' : v.aiSystem ? 'zeile-beige' : undefined}>
                      <td style={{ fontWeight: 500 }}>
                        {v.name}
                        {v.aiSystem && <span className="marke marke-beige" style={{ marginLeft: 5 }}>KI-System</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{v.service}</td>
                      <td>
                        {v.personalData
                          ? <span className="marke marke-gelb">ja</span>
                          : <span className="marke marke-gruen">nein</span>}
                      </td>
                      <td className="zahl">{v.country}</td>
                      <td>
                        {v.thirdCountry
                          ? <span className="marke marke-gelb">ja</span>
                          : <span style={{ color: 'var(--text-3)' }}>nein</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {v.thirdCountry
                          ? v.transferBasis ?? <span className="marke marke-rot">fehlt</span>
                          : '–'}
                      </td>
                      <td><StatusMarke status={label(AVV_STATUS, v.avvStatus)} /></td>
                      <td className="zahl">{v.avvSignedAt ? formatDateDE(v.avvSignedAt) : '–'}</td>
                      <td className="zahl">
                        {v.avvUntil
                          ? <span className={v.avvUntil < heute ? 'marke marke-gelb' : undefined}>{formatDateDE(v.avvUntil)}</span>
                          : '–'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 200 }}>{v.subProcessors ?? '–'}</td>
                      <td style={{ fontSize: 11 }}>
                        {v.activities.length === 0
                          ? <span style={{ color: 'var(--text-3)' }}>–</span>
                          : v.activities.map((a) => (
                              <Link key={a.activity.id} href="/compliance/datenschutz" className="marke marke-grau" style={{ marginRight: 3 }}>
                                {a.activity.number}
                              </Link>
                            ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      {kiMitDaten.some((v) => v.aiTrainingUse) && (
        <div style={{ marginTop: 14 }}>
          <Karte titel="Angaben der Anbieter zur Nutzung für Training">
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead><tr><th>Anbieter</th><th>Angabe</th></tr></thead>
                <tbody>
                  {kiMitDaten.filter((v) => v.aiTrainingUse).map((v) => (
                    <tr key={v.id}>
                      <td>{v.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{v.aiTrainingUse}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Karte>
        </div>
      )}
    </>
  );
}
