import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { formatDateDE } from '@/lib/time';
import { versandKonfiguriert } from '@/lib/email/versand';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';

export const metadata: Metadata = { title: 'E-Mail' };
export const dynamic = 'force-dynamic';

const EMAIL_STATUS: Record<string, { label: string; farbe: string }> = {
  NEU: { label: 'Neu', farbe: 'blau' },
  VERARBEITET: { label: 'Verarbeitet', farbe: 'gruen' },
  IGNORIERT: { label: 'Ignoriert', farbe: 'grau' },
  FEHLER: { label: 'Fehler', farbe: 'rot' },
};

/**
 * E-Mail-Eingang (SecPlan 2, Bereich KOMMUNIKATION).
 *
 * Was im Postfach ankommt, bevor jemand entscheidet, ob es eine Anfrage
 * ist. Erkannte Anfragen wandern nach /anfragen; alles andere bleibt
 * hier stehen, statt stillschweigend zu verschwinden.
 */
export default async function EmailEingang({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await seite('communication.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params, 30);

  const where: Prisma.EmailMessageWhereInput = {};
  if (params.status) where.status = params.status as Prisma.EmailMessageWhereInput['status'];
  if (params.q) {
    where.OR = [
      { subject: { contains: params.q, mode: 'insensitive' } },
      { fromEmail: { contains: params.q, mode: 'insensitive' } },
      { fromName: { contains: params.q, mode: 'insensitive' } },
      { textBody: { contains: params.q, mode: 'insensitive' } },
    ];
  }

  const [mails, gesamt, neu, fehler] = await Promise.all([
    db.emailMessage.findMany({
      where,
      select: {
        id: true, fromName: true, fromEmail: true, subject: true, receivedAt: true,
        status: true, isRequest: true, error: true, textBody: true,
        request: { select: { id: true, reference: true } },
      },
      orderBy: { receivedAt: 'desc' },
      skip, take: perPage,
    }),
    db.emailMessage.count({ where }),
    db.emailMessage.count({ where: { status: 'NEU' } }),
    db.emailMessage.count({ where: { status: 'FEHLER' } }),
  ]);

  return (
    <>
      <Seitenkopf
        titel="E-Mail-Eingänge"
        unter="Eingehende Nachrichten aus dem abgerufenen Postfach"
        aktionen={<Link href="/anfragen" className="knopf knopf-klein">Zu den Anfragen</Link>}
      />

      <Raster min={160}>
        <Kennzahl wert={gesamt} label="Nachrichten im Filter" />
        <Kennzahl wert={neu} label="Noch nicht gesichtet" farbe={neu > 0 ? 'gelb' : 'gruen'} />
        <Kennzahl wert={fehler} label="Fehlerhaft verarbeitet" farbe={fehler > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={mails.filter((m) => m.isRequest).length} label="Als Anfrage erkannt (Seite)" />
      </Raster>

      <div style={{ margin: '12px 0' }}>
        {versandKonfiguriert() ? (
          <Hinweis art="info">
            Der Abruf läuft über das in der Umgebung hinterlegte Postfach. Inhalte werden nur
            gespeichert und im Haus ausgewertet – an externe Dienste geht nichts.
          </Hinweis>
        ) : (
          <Hinweis art="warnung">
            Es ist kein Postfach eingerichtet. Solange IMAP-Zugangsdaten fehlen, bleibt diese
            Liste leer; Anfragen lassen sich weiterhin von Hand anlegen.
          </Hinweis>
        )}
      </div>

      <Karte>
        <Filterleiste
          platzhalter="Betreff, Absender oder Text …"
          felder={[{
            name: 'status', label: 'Status',
            optionen: Object.entries(EMAIL_STATUS).map(([wert, s]) => ({ wert, label: s.label })),
          }]}
        />

        {mails.length === 0 ? (
          <Leer>Keine Nachricht gefunden.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr><th>Eingang</th><th>Absender</th><th>Betreff</th><th>Auszug</th><th>Status</th><th>Anfrage</th></tr>
              </thead>
              <tbody>
                {mails.map((mail) => {
                  const status = EMAIL_STATUS[mail.status] ?? { label: mail.status, farbe: 'grau' };
                  return (
                    <tr key={mail.id} className={mail.status === 'FEHLER' ? 'zeile-rot' : mail.status === 'NEU' ? 'zeile-blau' : undefined}>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(mail.receivedAt)}</td>
                      <td style={{ fontSize: 12 }}>
                        {mail.fromName ?? mail.fromEmail}
                        {mail.fromName && <span style={{ display: 'block', color: 'var(--text-3)' }}>{mail.fromEmail}</span>}
                      </td>
                      <td>{mail.subject ?? <span style={{ color: 'var(--text-3)' }}>ohne Betreff</span>}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 340 }}>
                        {mail.textBody ? `${mail.textBody.replace(/\s+/g, ' ').slice(0, 140)} …` : '–'}
                      </td>
                      <td>
                        <span className={`marke marke-${status.farbe}`} title={mail.error ?? undefined}>{status.label}</span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {mail.request
                          ? <Link href={`/anfragen/${mail.request.id}`}>{mail.request.reference}</Link>
                          : mail.isRequest
                            ? <span className="marke marke-gelb">erkannt, nicht übernommen</span>
                            : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Blaettern seite={page} proSeite={perPage} gesamt={gesamt} />
      </Karte>
    </>
  );
}
