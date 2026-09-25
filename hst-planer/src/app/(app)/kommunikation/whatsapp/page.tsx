import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'WhatsApp-Eingänge' };
export const dynamic = 'force-dynamic';

/**
 * WhatsApp-Eingänge (SecPlan 2, Bereich KOMMUNIKATION).
 *
 * Der Kanal ist im Datenmodell vorgesehen, eine Anbindung gibt es
 * nicht – und das steht hier auch so. Eine Seite, die eine Schnittstelle
 * vortäuscht, die niemand eingerichtet hat, ist schlimmer als keine.
 *
 * Bevor angebunden wird, gehört geklärt: Anbieter, Serverstandort,
 * Auftragsverarbeitungsvertrag, Drittlandtransfer, Rechtsgrundlage und
 * Löschfrist. Das ist nichts, was ein Schalter erledigt.
 */
export default async function WhatsappEingaenge() {
  await seite('communication.view');

  const [eingaenge, gesamt] = await Promise.all([
    db.message.findMany({
      where: { channel: 'WHATSAPP' },
      select: {
        id: true, direction: true, subject: true, body: true, toAddress: true,
        sentAt: true, error: true, createdAt: true, employeeId: true, eventId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.message.count({ where: { channel: 'WHATSAPP' } }),
  ]);

  const verarbeiter = await db.processor.findFirst({
    where: { deletedAt: null, service: { contains: 'WhatsApp', mode: 'insensitive' } },
    select: { id: true, name: true, avvStatus: true, thirdCountry: true },
  });

  return (
    <>
      <Seitenkopf titel="WhatsApp-Eingänge" unter={`${gesamt} erfasste Nachrichten über diesen Kanal`} />

      <div style={{ marginBottom: 12 }}>
        {verarbeiter ? (
          <Hinweis art={verarbeiter.avvStatus === 'UNTERZEICHNET' ? 'info' : 'warnung'}>
            Anbieter: <strong>{verarbeiter.name}</strong>.{' '}
            {verarbeiter.avvStatus === 'UNTERZEICHNET'
              ? 'Ein Auftragsverarbeitungsvertrag ist hinterlegt.'
              : 'Ein Auftragsverarbeitungsvertrag ist noch nicht unterzeichnet.'}
            {verarbeiter.thirdCountry && ' Es liegt ein Drittlandtransfer vor.'}{' '}
            <Link href="/compliance/avv">Zur AVV-Liste</Link>
          </Hinweis>
        ) : (
          <Hinweis art="warnung">
            <strong>Keine WhatsApp-Anbindung eingerichtet.</strong> Der Kanal ist im Datenmodell
            vorgesehen, aber an keinen Dienst angeschlossen. Vor einer Anbindung gehört geklärt:
            Anbieter, Serverstandort, Auftragsverarbeitungsvertrag, Unterauftragnehmer,
            Drittlandtransfer, Rechtsgrundlage und Löschfrist. Erst danach macht diese Seite
            Arbeit leichter statt Ärger.
          </Hinweis>
        )}
      </div>

      <Raster min={160}>
        <Kennzahl wert={gesamt} label="Nachrichten über WhatsApp" />
        <Kennzahl wert={eingaenge.filter((e) => e.direction === 'EIN').length} label="Eingegangen (Seite)" />
        <Kennzahl wert={eingaenge.filter((e) => e.error).length} label="Fehlgeschlagen (Seite)"
                  farbe={eingaenge.some((e) => e.error) ? 'rot' : 'grau'} />
      </Raster>

      <div style={{ marginTop: 12 }}>
        <Karte>
          {eingaenge.length === 0 ? (
            <Leer>Über diesen Kanal ist bisher nichts erfasst.</Leer>
          ) : (
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead>
                  <tr><th>Zeitpunkt</th><th>Richtung</th><th>Nummer</th><th>Inhalt</th><th>Bezug</th><th>Zustellung</th></tr>
                </thead>
                <tbody>
                  {eingaenge.map((nachricht) => (
                    <tr key={nachricht.id} className={nachricht.error ? 'zeile-rot' : undefined}>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(nachricht.createdAt)}</td>
                      <td>
                        <span className={`marke marke-${nachricht.direction === 'EIN' ? 'blau' : 'grau'}`}>
                          {nachricht.direction === 'EIN' ? 'eingegangen' : 'gesendet'}
                        </span>
                      </td>
                      <td className="zahl" style={{ fontSize: 12 }}>{nachricht.toAddress ?? '–'}</td>
                      <td style={{ fontSize: 12, maxWidth: 400 }}>
                        {nachricht.body.length > 200 ? `${nachricht.body.slice(0, 200)} …` : nachricht.body}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {nachricht.eventId
                          ? <Link href={`/events/${nachricht.eventId}`}>Einsatz</Link>
                          : nachricht.employeeId
                            ? <Link href={`/mitarbeiter/${nachricht.employeeId}/kommunikation`}>Mitarbeiter</Link>
                            : '–'}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {nachricht.error
                          ? <span className="marke marke-rot" title={nachricht.error}>fehlgeschlagen</span>
                          : nachricht.sentAt
                            ? <span className="marke marke-gruen">zugestellt</span>
                            : <span className="marke marke-gelb">offen</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Karte>
      </div>
    </>
  );
}
