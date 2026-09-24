import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { formatDateDE, isoDate } from '@/lib/time';
import { REQUEST_STATUS, label } from '@/lib/status';
import { Hinweis, Karte, Paar, Raster, Seitenkopf, StatusMarke } from '@/components/ui';
import { AktionsFormular, AktionsKnopf } from '@/components/aktion';
import { anfrageStatusAktion, anfrageUebernehmenAktion } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AnfrageDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('requests.view');
  const { id } = await params;

  const anfrage = await db.request.findFirst({
    where: { id, deletedAt: null, ...(user.scope === 'KUNDE' ? { customerId: user.customerId ?? '__kein_kunde__' } : {}) },
    include: {
      customer: { select: { id: true, name: true } },
      event: { select: { id: true, reference: true, name: true } },
      emailMessage: true,
    },
  });
  if (!anfrage) notFound();

  const darfBearbeiten = can(user.role, 'requests.edit');
  const [kunden, bereiche] = darfBearbeiten
    ? await Promise.all([
        db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        db.serviceType.findMany({ where: { active: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      ])
    : [[], []];

  const vorgeschlagenerBereich = bereiche.find((b) => b.code === anfrage.serviceType)?.id ?? '';

  return (
    <>
      <Seitenkopf
        titel={anfrage.company ?? anfrage.contactPerson ?? anfrage.email ?? anfrage.reference}
        brotkrumen={[{ href: '/anfragen', label: 'Anfragen' }]}
        unter={
          <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="zahl">{anfrage.reference}</span>
            <StatusMarke status={label(REQUEST_STATUS, anfrage.status)} />
            <span>Eingang {formatDateDE(anfrage.createdAt)} ueber {anfrage.channel.toLowerCase()}</span>
            {anfrage.confidence > 0 && anfrage.channel === 'EMAIL' && (
              <span className={`marke marke-${anfrage.confidence >= 0.7 ? 'gruen' : anfrage.confidence >= 0.4 ? 'gelb' : 'rot'}`}>
                Auswertung {Math.round(anfrage.confidence * 100)} %
              </span>
            )}
          </span>
        }
      />

      {anfrage.status === 'NEU' && (
        <div style={{ marginBottom: 16 }}>
          <Hinweis art="warnung">
            <strong>Neue Anfrage – Prüfung erforderlich.</strong>{' '}
            {anfrage.missingFields.length > 0
              ? `Folgende Angaben fehlen und müssen beim Kunden erfragt werden: ${anfrage.missingFields.join(', ')}.`
              : 'Bitte prüfen Sie die Angaben, bevor Sie ein Event daraus erzeugen.'}
          </Hinweis>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }} className="dashboard-raster">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Karte titel="Angaben aus der Anfrage">
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Raster min={180}>
                <Paar label="Firma">{anfrage.company ?? fehlt(anfrage.missingFields, 'Firma')}</Paar>
                <Paar label="Ansprechpartner">{anfrage.contactPerson ?? fehlt(anfrage.missingFields, 'Ansprechpartner')}</Paar>
                <Paar label="E-Mail">{anfrage.email ? <a href={`mailto:${anfrage.email}`}>{anfrage.email}</a> : '–'}</Paar>
                <Paar label="Telefon">{anfrage.phone ? <a href={`tel:${anfrage.phone.replace(/\s/g, '')}`}>{anfrage.phone}</a> : '–'}</Paar>
              </Raster>
              <Raster min={180}>
                <Paar label="Anlass">{anfrage.eventName ?? '–'}</Paar>
                <Paar label="Datum">{anfrage.eventDate ? formatDateDE(anfrage.eventDate) : fehlt(anfrage.missingFields, 'Datum')}</Paar>
                <Paar label="Zeit">{anfrage.startTime || anfrage.endTime ? `${anfrage.startTime ?? '?'}–${anfrage.endTime ?? '?'}` : fehlt(anfrage.missingFields, 'Startzeit')}</Paar>
                <Paar label="Treffzeit">{anfrage.meetingTime ?? '–'}</Paar>
                <Paar label="Ort">{anfrage.location ?? fehlt(anfrage.missingFields, 'Ort')}</Paar>
                <Paar label="Benötigtes Personal">{anfrage.employeesNeeded ?? fehlt(anfrage.missingFields, 'Anzahl Mitarbeiter')}</Paar>
                <Paar label="Leistungsart">{anfrage.serviceType ?? fehlt(anfrage.missingFields, 'Leistungsart')}</Paar>
                <Paar label="Zugeordneter Kunde">
                  {anfrage.customer ? <Link href={`/kunden/${anfrage.customer.id}`}>{anfrage.customer.name}</Link> : 'noch keiner'}
                </Paar>
              </Raster>
              {anfrage.message && (
                <Paar label="Nachricht"><span style={{ whiteSpace: 'pre-wrap' }}>{anfrage.message}</span></Paar>
              )}
            </div>
          </Karte>

          {anfrage.emailMessage && (
            <Karte titel="Ursprüngliche E-Mail">
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Raster min={180}>
                  <Paar label="Von">{anfrage.emailMessage.fromName ? `${anfrage.emailMessage.fromName} <${anfrage.emailMessage.fromEmail}>` : anfrage.emailMessage.fromEmail}</Paar>
                  <Paar label="Betreff">{anfrage.emailMessage.subject ?? '–'}</Paar>
                  <Paar label="Eingegangen">{formatDateDE(anfrage.emailMessage.receivedAt)}</Paar>
                </Raster>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: 'var(--flaeche-tief)', padding: 12, borderRadius: 'var(--radius-s)', maxHeight: 320, overflow: 'auto' }}>
                  {anfrage.emailMessage.textBody ?? '(kein Textteil)'}
                </pre>
              </div>
            </Karte>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {anfrage.event ? (
            <Karte titel="Bereits übernommen">
              <div style={{ padding: 14 }}>
                <p style={{ margin: '0 0 10px', fontSize: 13 }}>Aus dieser Anfrage wurde ein Event erzeugt.</p>
                <Link href={`/events/${anfrage.event.id}`} className="knopf knopf-primaer knopf-klein">{anfrage.event.reference} oeffnen</Link>
              </div>
            </Karte>
          ) : darfBearbeiten && (
            <Karte titel="In ein Event überführen">
              <div style={{ padding: 14 }}>
                <AktionsFormular aktion={anfrageUebernehmenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input type="hidden" name="id" value={id} />
                  <label className="feld-gruppe">
                    <span className="feld-label">Eventname</span>
                    <input name="eventName" className="feld" required defaultValue={anfrage.eventName ?? (anfrage.company ? `${anfrage.company} – Einsatz` : '')} />
                  </label>
                  <label className="feld-gruppe">
                    <span className="feld-label">Datum</span>
                    <input name="date" type="date" className="feld" required defaultValue={anfrage.eventDate ? isoDate(anfrage.eventDate) : ''} />
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label className="feld-gruppe" style={{ flex: 1 }}>
                      <span className="feld-label">Beginn</span>
                      <input name="startTime" type="time" className="feld" defaultValue={anfrage.startTime ?? ''} />
                    </label>
                    <label className="feld-gruppe" style={{ flex: 1 }}>
                      <span className="feld-label">Ende</span>
                      <input name="endTime" type="time" className="feld" defaultValue={anfrage.endTime ?? ''} />
                    </label>
                  </div>
                  <label className="feld-gruppe">
                    <span className="feld-label">Kunde</span>
                    <select name="customerId" className="feld" defaultValue={anfrage.customerId ?? ''}>
                      <option value="">– noch keiner –</option>
                      {kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                  </label>
                  <label className="feld-gruppe">
                    <span className="feld-label">Leistungsbereich</span>
                    <select name="serviceTypeId" className="feld" defaultValue={vorgeschlagenerBereich}>
                      <option value="">– bitte wählen –</option>
                      {bereiche.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label className="feld-gruppe" style={{ flex: 2 }}>
                      <span className="feld-label">Position</span>
                      <input name="positionTitle" className="feld" defaultValue="Personal" />
                    </label>
                    <label className="feld-gruppe" style={{ flex: 1 }}>
                      <span className="feld-label">Anzahl</span>
                      <input name="requiredCount" type="number" min={0} max={999} className="feld zahl" defaultValue={anfrage.employeesNeeded ?? 0} />
                    </label>
                  </div>
                  <AktionsKnopf klasse="knopf knopf-primaer">Event anlegen</AktionsKnopf>
                </AktionsFormular>
              </div>
            </Karte>
          )}

          {darfBearbeiten && (
            <Karte titel="Status ändern">
              <div style={{ padding: 14 }}>
                <AktionsFormular aktion={anfrageStatusAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="hidden" name="id" value={id} />
                  <select name="status" className="feld" defaultValue={anfrage.status}>
                    {Object.entries(REQUEST_STATUS).map(([wert, s]) => <option key={wert} value={wert}>{s.label}</option>)}
                  </select>
                  <textarea name="notiz" className="feld" rows={2} placeholder="Notiz (wird an die Anfrage angehängt)" />
                  <AktionsKnopf klasse="knopf knopf-klein">Speichern</AktionsKnopf>
                </AktionsFormular>
              </div>
            </Karte>
          )}
        </div>
      </div>
    </>
  );
}

function fehlt(fehlende: string[], feld: string) {
  return fehlende.includes(feld) ? <span className="marke marke-gelb">fehlt – bitte erfragen</span> : '–';
}
