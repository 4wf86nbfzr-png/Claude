import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { formatDateDE, formatDiff, formatHours } from '@/lib/time';
import { ISSUE_LABEL, type Issue } from '@/lib/reconcile/engine';
import { RECONCILIATION_STATUS, ROW_STATUS, label } from '@/lib/status';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import { Icon } from '@/components/icons';
import { abgleichAbschliessenAktion, unkritischeBestaetigenAktion, zeileIgnorierenAktion, zeileKorrigierenAktion } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AbgleichDetail({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('reconciliation.view');
  const { id } = await params;
  const filter = (await searchParams).status;
  const darfBearbeiten = can(user.role, 'reconciliation.edit');

  const abgleich = await db.reconciliation.findUnique({ where: { id } });
  if (!abgleich) notFound();

  const zeilen = await db.reconciliationRow.findMany({
    where: { reconciliationId: id, ...(filter ? { status: filter as never } : {}) },
    orderBy: [{ status: 'asc' }, { rowNumber: 'asc' }],
    include: {
      event: { select: { id: true, name: true } },
      position: { select: { title: true } },
    },
    take: 500,
  });

  // Fuer die Korrektur brauchen wir Auswahllisten – aber nur, wenn wirklich
  // etwas zu korrigieren ist.
  const korrekturNoetig = zeilen.some((z) => ['UNBEKANNT', 'MEHRDEUTIG', 'ZUSAETZLICH', 'ABWEICHUNG', 'FEHLEND'].includes(z.status));
  const mitarbeiter = darfBearbeiten && korrekturNoetig
    ? await db.employee.findMany({ where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true, personnelNo: true }, orderBy: { lastName: 'asc' } })
    : [];

  const ungeklaert = abgleich.unknownRows + abgleich.duplicateRows;
  const abgeschlossen = abgleich.status === 'ABGESCHLOSSEN';
  const gesamtIst = zeilen.reduce((s, z) => s + (z.actualMinutes ?? 0), 0);

  return (
    <>
      <Seitenkopf
        titel={abgleich.name}
        brotkrumen={[{ href: '/abgleiche', label: 'Abgleiche' }]}
        unter={
          <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="zahl">{abgleich.reference}</span>
            <StatusMarke status={label(RECONCILIATION_STATUS, abgleich.status)} />
            {abgleich.fileName && <span>{abgleich.fileName}</span>}
            {abgleich.periodFrom && <span className="zahl">{formatDateDE(abgleich.periodFrom)} – {formatDateDE(abgleich.periodTo ?? abgleich.periodFrom)}</span>}
            {abgleich.closedAt && <span>abgeschlossen am {formatDateDE(abgleich.closedAt)}</span>}
          </span>
        }
        aktionen={
          <>
            <Link href={`/api/export/abgleich/${id}`} className="knopf"><Icon name="download" /> Excel-Export</Link>
            {darfBearbeiten && !abgeschlossen && (
              <Link href={`/abgleiche/${id}/zuordnen`} className="knopf"><Icon name="refresh" /> Neu berechnen</Link>
            )}
          </>
        }
      />

      <Raster min={150}>
        <Kennzahl wert={abgleich.totalRows} label="Datensaetze verarbeitet" />
        <Kennzahl wert={abgleich.matchedRows} label="Automatisch zugeordnet" farbe="gruen" href={`/abgleiche/${id}?status=OK`} />
        <Kennzahl wert={abgleich.deviationRows} label="Abweichungen" farbe={abgleich.deviationRows > 0 ? 'gelb' : 'grau'} href={`/abgleiche/${id}?status=ABWEICHUNG`} />
        <Kennzahl wert={abgleich.unknownRows} label="Unbekannte Mitarbeiter" farbe={abgleich.unknownRows > 0 ? 'rot' : 'grau'} href={`/abgleiche/${id}?status=UNBEKANNT`} />
        <Kennzahl wert={abgleich.duplicateRows} label="Doppelte Eintraege" farbe={abgleich.duplicateRows > 0 ? 'rot' : 'grau'} href={`/abgleiche/${id}?status=DUPLIKAT`} />
        <Kennzahl wert={abgleich.missingRows} label="Ohne Ist-Zeit" farbe={abgleich.missingRows > 0 ? 'gelb' : 'grau'} href={`/abgleiche/${id}?status=FEHLEND`} />
        <Kennzahl wert={formatHours(gesamtIst)} label="Erfasste Stunden" />
      </Raster>

      {abgeschlossen && (
        <div style={{ marginTop: 14 }}>
          <Hinweis art="info">
            Dieser Abgleich ist abgeschlossen und die Zeiten sind in die Zeiterfassung uebernommen.
            Spaetere Aenderungen sind weiterhin moeglich, werden aber im Protokoll als nachtraegliche
            Korrektur festgehalten.
          </Hinweis>
        </div>
      )}

      {darfBearbeiten && !abgeschlossen && (
        <Karte klasse="nicht-drucken" titel="Freigabe">
          <div style={{ padding: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <AktionsFormular aktion={unkritischeBestaetigenAktion} stil={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="hidden" name="id" value={id} />
              <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                bis
                <input name="grenze" type="number" min={1} max={240} defaultValue={30} className="feld zahl" style={{ width: 72 }} />
                Minuten
              </label>
              <AktionsKnopf klasse="knopf">Alle unkritischen Abweichungen bestaetigen</AktionsKnopf>
            </AktionsFormular>

            {can(user.role, 'reconciliation.close') && (
              <AktionsFormular aktion={abgleichAbschliessenAktion}>
                <input type="hidden" name="id" value={id} />
                <AktionsKnopf klasse="knopf knopf-primaer" laufend="Wird abgeschlossen …" disabled={ungeklaert > 0}>
                  Abgleich abschliessen &amp; Zeiten uebernehmen
                </AktionsKnopf>
              </AktionsFormular>
            )}

            {ungeklaert > 0 && (
              <p style={{ fontSize: 12, color: 'var(--gelb)', margin: 0, flex: '1 1 240px' }}>
                {ungeklaert} Zeile(n) sind noch ungeklaert. Ordnen Sie sie zu oder setzen Sie sie auf „nicht uebernehmen“,
                bevor der Abgleich abgeschlossen werden kann.
              </p>
            )}
          </div>
        </Karte>
      )}

      <div style={{ marginTop: 16 }}>
        <Karte titel={
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Zeilen</span>
            <Link href={`/abgleiche/${id}`} className={`marke ${filter ? 'marke-grau' : 'marke-blau'}`}>alle</Link>
            {Object.entries(ROW_STATUS).map(([wert, s]) => (
              <Link key={wert} href={`/abgleiche/${id}?status=${wert}`} className={`marke marke-${filter === wert ? s.farbe : 'grau'}`}>{s.label}</Link>
            ))}
          </span>
        }>
          {zeilen.length === 0 ? <Leer>Keine Zeilen in dieser Auswahl.</Leer> : (
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead>
                  <tr>
                    <th>#</th><th>Mitarbeiter</th><th>Event</th><th>Datum</th>
                    <th>Soll</th><th>Ist</th><th>Differenz</th><th>Befund</th><th>Status</th>
                    {darfBearbeiten && <th style={{ width: 1 }}>Korrektur</th>}
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((zeile) => {
                    const farbe = ROW_STATUS[zeile.status]?.farbe ?? 'grau';
                    const kandidaten = (zeile.candidates ?? []) as Array<{ employeeId: string; name: string; score: number }>;
                    return (
                      <tr key={zeile.id} className={`zeile-${farbe === 'grau' ? 'blau' : farbe}`}>
                        <td className="zahl" style={{ color: 'var(--text-gedaempft)', fontSize: 12 }}>{zeile.rowNumber}</td>
                        <td>
                          {zeile.employeeId
                            ? <Link href={`/mitarbeiter/${zeile.employeeId}`} style={{ fontWeight: 500 }}>{zeile.rawName ?? 'Mitarbeiter'}</Link>
                            : <span style={{ fontWeight: 500 }}>{zeile.rawName ?? '–'}</span>}
                          {zeile.matchScore > 0 && zeile.matchScore < 1 && (
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>
                              Trefferguete {Math.round(zeile.matchScore * 100)} %
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {zeile.event ? <Link href={`/events/${zeile.event.id}`}>{zeile.event.name}</Link> : <span style={{ color: 'var(--text-gedaempft)' }}>{zeile.rawEvent ?? '–'}</span>}
                          {zeile.position && <span style={{ display: 'block', color: 'var(--text-gedaempft)', fontSize: 11 }}>{zeile.position.title}</span>}
                        </td>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{zeile.date ? formatDateDE(zeile.date) : (zeile.rawDate ?? '–')}</td>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                          {zeile.plannedStart ? `${zeile.plannedStart}–${zeile.plannedEnd ?? '?'}` : '–'}
                          {zeile.plannedMinutes != null && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>{formatHours(zeile.plannedMinutes)}</span>}
                        </td>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                          {zeile.actualStart ? `${zeile.actualStart}–${zeile.actualEnd ?? '?'}` : '–'}
                          {zeile.actualMinutes != null && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>{formatHours(zeile.actualMinutes)}</span>}
                        </td>
                        <td className="zahl" style={{ fontWeight: zeile.diffMinutes ? 600 : 400, color: zeile.diffMinutes ? 'var(--gelb)' : undefined }}>
                          {formatDiff(zeile.diffMinutes)}
                        </td>
                        <td style={{ fontSize: 11 }}>
                          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {zeile.issues.map((befund) => (
                              <span key={befund} className="marke marke-grau">{ISSUE_LABEL[befund as Issue] ?? befund}</span>
                            ))}
                          </span>
                          {zeile.comment && <span style={{ display: 'block', color: 'var(--text-gedaempft)', marginTop: 3 }}>{zeile.comment}</span>}
                        </td>
                        <td><StatusMarke status={label(ROW_STATUS, zeile.status)} /></td>
                        {darfBearbeiten && (
                          <td>
                            <Ausklapp titel="Bearbeiten" knopfKlasse="knopf knopf-klein">
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260 }}>
                                <AktionsFormular aktion={zeileKorrigierenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                  <input type="hidden" name="reconciliationId" value={id} />
                                  <input type="hidden" name="rowId" value={zeile.id} />

                                  {kandidaten.length > 0 && (
                                    <p style={{ fontSize: 12, color: 'var(--gelb)', margin: 0 }}>
                                      Aehnliche Treffer gefunden – bitte auswaehlen:
                                      {' '}{kandidaten.map((k) => `${k.name} (${Math.round(k.score * 100)} %)`).join(', ')}
                                    </p>
                                  )}

                                  <label className="feld-gruppe">
                                    <span className="feld-label">Mitarbeiter</span>
                                    <select name="employeeId" className="feld" defaultValue={zeile.employeeId ?? ''}>
                                      <option value="">– nicht zugeordnet –</option>
                                      {mitarbeiter.map((m) => (
                                        <option key={m.id} value={m.id}>{m.lastName}, {m.firstName} ({m.personnelNo})</option>
                                      ))}
                                    </select>
                                  </label>

                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <label className="feld-gruppe">
                                      <span className="feld-label">Ist-Beginn</span>
                                      <input name="actualStart" type="time" className="feld" defaultValue={zeile.actualStart ?? ''} />
                                    </label>
                                    <label className="feld-gruppe">
                                      <span className="feld-label">Ist-Ende</span>
                                      <input name="actualEnd" type="time" className="feld" defaultValue={zeile.actualEnd ?? ''} />
                                    </label>
                                    <label className="feld-gruppe">
                                      <span className="feld-label">Pause</span>
                                      <input name="actualBreak" type="number" min={0} max={600} className="feld zahl" style={{ width: 70 }} defaultValue={zeile.actualBreak ?? 0} />
                                    </label>
                                  </div>

                                  <label className="feld-gruppe">
                                    <span className="feld-label">Kommentar</span>
                                    <input name="comment" className="feld" defaultValue={zeile.comment ?? ''} />
                                  </label>

                                  <input type="hidden" name="status" value="GEPRUEFT" />
                                  <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Speichern &amp; als geprueft markieren</AktionsKnopf>
                                </AktionsFormular>

                                {zeile.status !== 'IGNORIERT' && (
                                  <AktionsFormular aktion={zeileIgnorierenAktion} stil={{ display: 'flex', gap: 6 }} meldungOben={false}>
                                    <input type="hidden" name="reconciliationId" value={id} />
                                    <input type="hidden" name="rowId" value={zeile.id} />
                                    <input name="grund" className="feld" placeholder="Grund" style={{ flex: 1 }} />
                                    <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr">Nicht uebernehmen</AktionsKnopf>
                                  </AktionsFormular>
                                )}
                              </div>
                            </Ausklapp>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Karte>
      </div>
    </>
  );
}
