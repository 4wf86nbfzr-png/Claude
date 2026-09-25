import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can, personenfelder } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import { formatDateDE, formatHours, toDateOnly } from '@/lib/time';
import { Gesperrt, Karte, Kennzahl, Paar, Raster } from '@/components/ui';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import { mitarbeiterDeaktivierenAktion, zugangAnlegenAktion } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mitarbeiterakte' };

/**
 * Reiter „Übersicht" der Mitarbeiterakte (SecPlan 5).
 *
 * Welche Felder überhaupt geladen werden, entscheidet `personenfelder`.
 * Was nicht freigegeben ist, kommt nicht aus der Datenbank und steht
 * hier als benanntes Schloss – nicht als leeres Feld.
 */
export default async function MitarbeiterUebersicht({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('employees.view');
  const { id } = await params;
  const felder = personenfelder(user.role);
  const heute = toDateOnly(new Date());

  const employee = await db.employee.findFirst({
    where: { id, ...employeeFilter(user) },
    select: {
      id: true, firstName: true, lastName: true, active: true,
      phone: felder.kontakt, mobile: felder.kontakt, email: felder.kontakt,
      street: felder.anschrift, zip: felder.anschrift, city: felder.anschrift,
      birthDate: felder.anschrift, drivingLicence: felder.anschrift,
      hourlyRate: felder.vertrag, employmentType: true,
      notesInternal: felder.notizen, infoForEmployee: true,
      preferredAreas: true,
      user: { select: { email: true, active: true, lastLoginAt: true, totpEnabled: true } },
    },
  });
  if (!employee) notFound();

  const [stunden, kommende, abgesagt, gesamtEinsaetze] = await Promise.all([
    can(user.role, 'timesheets.view')
      ? db.timeEntry.aggregate({
          where: { employeeId: id, deletedAt: null, date: { gte: new Date(heute.getFullYear(), 0, 1) } },
          _sum: { minutes: true },
        })
      : Promise.resolve(null),
    db.assignment.count({ where: { employeeId: id, deletedAt: null, status: { notIn: ['ABGESAGT', 'STORNIERT'] }, event: { date: { gte: heute } } } }),
    db.assignment.count({ where: { employeeId: id, deletedAt: null, status: 'ABGESAGT' } }),
    db.assignment.count({ where: { employeeId: id, deletedAt: null } }),
  ]);

  const darfBearbeiten = can(user.role, 'employees.edit');

  return (
    <>
      <Raster min={160}>
        <Kennzahl wert={kommende} label="Kommende Einsätze" href={`/mitarbeiter/${id}/einsaetze`} />
        <Kennzahl wert={gesamtEinsaetze} label="Einsätze insgesamt" />
        {stunden && <Kennzahl wert={formatHours(stunden._sum.minutes ?? 0)} label={`Stunden ${heute.getFullYear()}`} href={`/mitarbeiter/${id}/arbeitszeiten`} />}
        <Kennzahl wert={abgesagt} label="Absagen" farbe={abgesagt > 2 ? 'gelb' : 'grau'} />
      </Raster>

      <div className="zweispaltig" style={{ ['--zweite' as string]: '260px', marginTop: 14 }}>
        <Karte titel="Kontakt und Person">
          <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Paar label="Mobil">
              {!felder.kontakt ? <Gesperrt />
                : employee.mobile ? <a href={`tel:${employee.mobile.replace(/\s/g, '')}`}>{employee.mobile}</a> : '–'}
            </Paar>
            <Paar label="Telefon">{!felder.kontakt ? <Gesperrt /> : employee.phone ?? '–'}</Paar>
            <Paar label="E-Mail">
              {!felder.kontakt ? <Gesperrt />
                : employee.email ? <a href={`mailto:${employee.email}`}>{employee.email}</a> : '–'}
            </Paar>
            <Paar label="Private Anschrift">
              {!felder.anschrift ? <Gesperrt grund="Private Anschrift – nur Personal und Geschäftsführung" />
                : [employee.street, [employee.zip, employee.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–'}
            </Paar>
            <Paar label="Geburtsdatum">
              {!felder.anschrift ? <Gesperrt /> : employee.birthDate ? formatDateDE(employee.birthDate) : '–'}
            </Paar>
            <Paar label="Führerschein">{!felder.anschrift ? <Gesperrt /> : employee.drivingLicence ?? '–'}</Paar>
            <Paar label="Stundensatz">
              {!felder.vertrag
                ? <Gesperrt grund="Vergütung – nur Personal und Geschäftsführung" />
                : employee.hourlyRate ? `${Number(employee.hourlyRate).toFixed(2).replace('.', ',')} €` : '–'}
            </Paar>
            <Paar label="Bevorzugte Bereiche">
              {employee.preferredAreas.length > 0 ? employee.preferredAreas.join(', ') : '–'}
            </Paar>
          </div>
        </Karte>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Karte titel="Notizen">
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Paar label="Info für den Mitarbeiter">
                <span style={{ whiteSpace: 'pre-wrap' }}>{employee.infoForEmployee || '–'}</span>
              </Paar>
              {felder.notizen ? (
                <div className="hinweis-warnung">
                  <strong style={{ display: 'block', fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase' }}>
                    Intern – nicht für den Mitarbeiter
                  </strong>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{employee.notesInternal || '–'}</span>
                </div>
              ) : (
                <Paar label="Interne Personalnotizen">
                  <Gesperrt grund="Interne Personalnotizen – nur Personal und Geschäftsführung" />
                </Paar>
              )}
            </div>
          </Karte>

          <Karte titel="Zugang zur Mitarbeiter-App">
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {employee.user ? (
                <>
                  <Paar label="Anmeldung">{employee.user.email}</Paar>
                  <Paar label="Zuletzt angemeldet">
                    {employee.user.lastLoginAt ? formatDateDE(employee.user.lastLoginAt) : 'noch nie'}
                  </Paar>
                  <Paar label="Status">{employee.user.active ? 'aktiv' : 'gesperrt'}</Paar>
                  <Paar label="Zweiter Faktor">
                    {employee.user.totpEnabled
                      ? <span className="marke marke-gruen">eingerichtet</span>
                      : <span className="marke marke-grau">nicht eingerichtet</span>}
                  </Paar>
                </>
              ) : can(user.role, 'admin.users') ? (
                <Ausklapp titel="Zugang anlegen" knopfKlasse="knopf knopf-klein">
                  <AktionsFormular aktion={zugangAnlegenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input type="hidden" name="id" value={id} />
                    <input name="email" type="email" className="feld" required defaultValue={employee.email ?? ''} placeholder="E-Mail für die Anmeldung" />
                    <input name="passwort" type="text" className="feld" required minLength={12} placeholder="Startpasswort (mind. 12 Zeichen)" />
                    <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Zugang anlegen</AktionsKnopf>
                  </AktionsFormular>
                </Ausklapp>
              ) : (
                <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0 }}>Kein Zugang eingerichtet.</p>
              )}
            </div>
          </Karte>

          {darfBearbeiten && employee.active && (
            <Karte titel="Aktionen">
              <div style={{ padding: 12 }}>
                <Ausklapp titel="Mitarbeiter deaktivieren" knopfKlasse="knopf knopf-klein knopf-gefahr">
                  <AktionsFormular aktion={mitarbeiterDeaktivierenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input type="hidden" name="id" value={id} />
                    <p className="feld-hinweis" style={{ margin: 0 }}>
                      Der Datensatz bleibt für Auswertungen und Nachweise erhalten, der Mitarbeiter
                      erscheint aber nicht mehr in der Personalsuche. Gelöscht wird nichts – wann
                      gelöscht wird, steht im Löschkonzept.
                    </p>
                    <textarea name="grund" className="feld" rows={2} required placeholder="Grund" />
                    <AktionsKnopf klasse="knopf knopf-gefahr knopf-klein">Deaktivieren</AktionsKnopf>
                  </AktionsFormular>
                </Ausklapp>
              </div>
            </Karte>
          )}
        </div>
      </div>

      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-3)' }}>
        <Link href="/compliance/datenschutz">Was hier wer sehen darf</Link>, steht im Rollen- und
        Rechtekonzept. Felder, die für Ihre Rolle gesperrt sind, werden nicht aus der Datenbank
        geladen.
      </p>
    </>
  );
}
