import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { COMPLIANCE_DOC_KIND, PRUEF_STATUS, label } from '@/lib/status';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';

export const metadata: Metadata = { title: 'Dokumentation' };
export const dynamic = 'force-dynamic';

/**
 * Dokumentation und Nachweise (SecPlan 23).
 *
 * Jede Unterlage trägt Version, Status, Ersteller, Freigabedatum, letzte
 * Änderung und nächste Prüfung. Ohne diese sechs Angaben ist eine
 * Richtlinie im Zweifel wertlos: niemand weiß, ob sie gilt.
 */
export default async function Dokumentation() {
  await seite('compliance.view');
  const heute = new Date();
  const in60Tagen = new Date(heute.getTime() + 60 * 86400000);

  const unterlagen = await db.complianceDocument.findMany({
    where: { deletedAt: null },
    orderBy: [{ kind: 'asc' }, { title: 'asc' }],
  });

  const nachArt = new Map<string, typeof unterlagen>();
  for (const u of unterlagen) {
    const liste = nachArt.get(u.kind);
    if (liste) liste.push(u);
    else nachArt.set(u.kind, [u]);
  }

  const freigegeben = unterlagen.filter((u) => u.status === 'RECHTLICH_GEPRUEFT');
  const entwuerfe = unterlagen.filter((u) => u.status === 'ENTWURF' || u.status === 'IN_PRUEFUNG');
  const faellig = unterlagen.filter((u) => u.nextReviewAt && u.nextReviewAt <= in60Tagen);
  const ohneWiedervorlage = unterlagen.filter((u) => !u.nextReviewAt);

  return (
    <>
      <Seitenkopf
        titel="Dokumentation"
        unter="Richtlinien, Einwilligungen, Informationspflichten und Nachweise"
        brotkrumen={[{ href: '/compliance', label: 'HST Compliance' }]}
      />

      <Raster min={160}>
        <Kennzahl wert={unterlagen.length} label="Unterlagen" />
        <Kennzahl wert={freigegeben.length} label="Rechtlich geprüft"
                  farbe={freigegeben.length === unterlagen.length && unterlagen.length > 0 ? 'gruen' : 'gelb'} />
        <Kennzahl wert={entwuerfe.length} label="Im Entwurf oder in Prüfung"
                  farbe={entwuerfe.length > 0 ? 'gelb' : 'gruen'} />
        <Kennzahl wert={faellig.length} label="Wiedervorlage in 60 Tagen"
                  farbe={faellig.length > 0 ? 'gelb' : 'gruen'} />
      </Raster>

      <div style={{ margin: '12px 0' }}>
        <Hinweis art="info">
          Ein Eintrag mit dem Stand <em>rechtlich geprüft</em> sagt, dass eine benannte Person
          hingesehen und freigegeben hat – wer und wann, steht daneben. Er sagt nicht, dass das
          Ergebnis richtig ist; dafür gibt es keinen Knopf.
        </Hinweis>
      </div>

      {ohneWiedervorlage.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Hinweis art="warnung">
            {ohneWiedervorlage.length} {ohneWiedervorlage.length === 1 ? 'Unterlage hat' : 'Unterlagen haben'} keine
            nächste Prüfung eingetragen. Eine Richtlinie ohne Wiedervorlage veraltet unbemerkt.
          </Hinweis>
        </div>
      )}

      {unterlagen.length === 0 ? (
        <Karte><Leer>Es ist noch keine Unterlage hinterlegt.</Leer></Karte>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[...nachArt.entries()].map(([art, liste]) => (
            <Karte key={art} titel={COMPLIANCE_DOC_KIND[art] ?? art}>
              <div className="tabelle-scroll">
                <table className="tabelle">
                  <thead>
                    <tr><th>Titel</th><th>Kurzfassung</th><th>Version</th><th>Stand</th><th>Ersteller</th><th>Freigegeben von</th><th>Freigabedatum</th><th>Letzte Änderung</th><th>Nächste Prüfung</th></tr>
                  </thead>
                  <tbody>
                    {liste.map((u) => {
                      const bald = u.nextReviewAt !== null && u.nextReviewAt <= in60Tagen;
                      return (
                        <tr key={u.id} className={bald ? 'zeile-gelb' : u.status === 'UEBERHOLT' ? 'zeile-rot' : undefined}>
                          <td style={{ fontWeight: 500 }}>{u.title}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 320 }}>{u.summary ?? '–'}</td>
                          <td className="zahl">{u.version}</td>
                          <td><StatusMarke status={label(PRUEF_STATUS, u.status)} /></td>
                          <td style={{ fontSize: 12 }}>{u.author ?? '–'}</td>
                          <td style={{ fontSize: 12 }}>{u.approvedBy ?? '–'}</td>
                          <td className="zahl">{u.approvedAt ? formatDateDE(u.approvedAt) : '–'}</td>
                          <td className="zahl">{formatDateDE(u.updatedAt)}</td>
                          <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                            {u.nextReviewAt
                              ? <span className={bald ? 'marke marke-gelb' : undefined}>{formatDateDE(u.nextReviewAt)}</span>
                              : <span className="marke marke-gelb">nicht gesetzt</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Karte>
          ))}
        </div>
      )}
    </>
  );
}
