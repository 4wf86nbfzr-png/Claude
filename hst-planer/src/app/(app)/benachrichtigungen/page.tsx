import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { Karte, Leer, Seitenkopf } from '@/components/ui';
import { AktionsFormular, AktionsKnopf } from '@/components/aktion';
import { alleGelesenAktion, gelesenAktion } from './actions';

export const metadata: Metadata = { title: 'Benachrichtigungen' };
export const dynamic = 'force-dynamic';

const FARBE: Record<string, string> = {
  NEUE_ANFRAGE: 'gelb', EINSATZ_ZUGESAGT: 'gruen', EINSATZ_ABGESAGT: 'rot',
  POSITION_UNBESETZT: 'rot', DOKUMENT_LAEUFT_AB: 'gelb', ABGLEICH_ABGESCHLOSSEN: 'gruen',
  ABWEICHUNG_ERKANNT: 'gelb', EVENT_MORGEN: 'blau', EVENT_UNTERBESETZT: 'rot',
  NACHRICHT: 'blau', SYSTEM: 'grau',
};

export default async function Benachrichtigungen() {
  const user = await seite();
  const eintraege = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
    take: 100,
  });
  const ungelesen = eintraege.filter((e) => !e.readAt).length;

  return (
    <>
      <Seitenkopf
        titel="Benachrichtigungen"
        unter={ungelesen > 0 ? `${ungelesen} ungelesen` : 'Alles gelesen'}
        aktionen={ungelesen > 0 && (
          <AktionsFormular aktion={alleGelesenAktion} meldungOben={false}>
            <AktionsKnopf klasse="knopf">Alle als gelesen markieren</AktionsKnopf>
          </AktionsFormular>
        )}
      />

      <Karte>
        {eintraege.length === 0 ? <Leer>Keine Benachrichtigungen.</Leer> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {eintraege.map((eintrag) => (
              <li key={eintrag.id}
                  style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between',
                    padding: '12px 14px', borderBottom: '1px solid var(--linie)',
                    background: eintrag.readAt ? undefined : 'var(--flaeche-hover)',
                  }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`marke marke-${FARBE[eintrag.kind] ?? 'grau'}`}>{eintrag.kind.replaceAll('_', ' ').toLowerCase()}</span>
                    <strong style={{ fontSize: 13, fontWeight: eintrag.readAt ? 500 : 650 }}>{eintrag.title}</strong>
                    <span className="zahl" style={{ fontSize: 11, color: 'var(--text-gedaempft)' }}>{formatDateDE(eintrag.createdAt)}</span>
                  </div>
                  {eintrag.body && <p style={{ fontSize: 12, color: 'var(--text-sekundaer)', margin: '4px 0 0' }}>{eintrag.body}</p>}
                  {eintrag.link && <Link href={eintrag.link} style={{ fontSize: 12 }}>Oeffnen</Link>}
                </div>
                {!eintrag.readAt && (
                  <AktionsFormular aktion={gelesenAktion} meldungOben={false}>
                    <input type="hidden" name="id" value={eintrag.id} />
                    <AktionsKnopf klasse="knopf knopf-klein" laufend="…">Gelesen</AktionsKnopf>
                  </AktionsFormular>
                )}
              </li>
            ))}
          </ul>
        )}
      </Karte>
    </>
  );
}
