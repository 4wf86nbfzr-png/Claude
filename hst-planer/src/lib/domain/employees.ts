import 'server-only';
import { z } from 'zod';
import { db } from '../db';
import { audit, diff } from '../audit';
import { nextPersonnelNo } from '../refs';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { hashPassword, checkPasswordStrength } from '../auth/password';
import { toDateOnly } from '../time';
import type { SessionUser } from '../auth/session';

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const MITARBEITER_SCHEMA = z.object({
  firstName: z.string().trim().min(2, 'Bitte geben Sie den Vornamen an.').max(80),
  lastName: z.string().trim().min(2, 'Bitte geben Sie den Nachnamen an.').max(80),
  personnelNo: optional(30),
  phone: optional(40),
  mobile: optional(40),
  email: z.union([z.string().trim().toLowerCase().email('Bitte eine gültige E-Mail-Adresse angeben.'), z.literal('')]).optional().transform((v) => (v ? v : null)),
  street: optional(160),
  zip: optional(10),
  city: optional(100),
  birthDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().transform((v) => (v ? v : null)),
  employmentType: z.enum(['FESTANSTELLUNG', 'TEILZEIT', 'MINIJOB', 'AUSHILFE', 'WERKSTUDENT', 'SUBUNTERNEHMER']).default('AUSHILFE'),
  hourlyRate: z.union([z.string().trim(), z.literal('')]).optional().transform((v) => (v ? v.replace(',', '.') : null)),
  drivingLicence: optional(30),
  partnerId: z.string().trim().optional().transform((v) => (v ? v : null)),
  active: z.coerce.boolean().default(true),
  blocked: z.coerce.boolean().default(false),
  blockReason: optional(300),
  notesInternal: optional(2000),
  infoForEmployee: optional(2000),
});

export type MitarbeiterEingabe = z.infer<typeof MITARBEITER_SCHEMA>;

export function lies(formData: FormData): MitarbeiterEingabe {
  const roh = Object.fromEntries(formData.entries()) as Record<string, unknown>;
  roh.active = formData.get('active') === 'on';
  roh.blocked = formData.get('blocked') === 'on';
  const ergebnis = MITARBEITER_SCHEMA.safeParse(roh);
  if (!ergebnis.success) throw new ValidationError(ergebnis.error.issues[0]?.message ?? 'Bitte prüfen Sie Ihre Eingaben.');
  if (ergebnis.data.blocked && !ergebnis.data.blockReason) {
    throw new ValidationError('Bitte hinterlegen Sie einen Grund für den Sperrvermerk.');
  }
  return ergebnis.data;
}

function zuDaten(eingabe: MitarbeiterEingabe) {
  const { birthDate, ...rest } = eingabe;
  return { ...rest, birthDate: birthDate ? toDateOnly(`${birthDate}T00:00:00Z`) : null };
}

export async function mitarbeiterAnlegen(user: SessionUser, formData: FormData) {
  const eingabe = lies(formData);
  const personnelNo = eingabe.personnelNo ?? (await nextPersonnelNo());

  if (await db.employee.findUnique({ where: { personnelNo } })) {
    throw new ConflictError(`Die Personalnummer ${personnelNo} ist bereits vergeben.`);
  }

  const employee = await db.employee.create({
    data: {
      ...zuDaten(eingabe),
      personnelNo,
      preferredAreas: formData.getAll('bereiche').map(String).filter(Boolean),
      createdById: user.id, updatedById: user.id,
      qualifications: { create: qualifikationenAus(formData) },
    },
  });

  await audit(user, {
    action: 'employee.create', entity: 'Employee', entityId: employee.id,
    summary: `Mitarbeiter ${employee.firstName} ${employee.lastName} (${employee.personnelNo}) angelegt`,
    after: { name: `${employee.firstName} ${employee.lastName}`, personalnummer: employee.personnelNo },
  });
  return employee;
}

export async function mitarbeiterAendern(user: SessionUser, id: string, formData: FormData) {
  const vorher = await db.employee.findFirst({ where: { id, deletedAt: null } });
  if (!vorher) throw new NotFoundError('Der Mitarbeiter wurde nicht gefunden.');

  const eingabe = lies(formData);
  const personnelNo = eingabe.personnelNo ?? vorher.personnelNo;
  if (personnelNo !== vorher.personnelNo && (await db.employee.findUnique({ where: { personnelNo } }))) {
    throw new ConflictError(`Die Personalnummer ${personnelNo} ist bereits vergeben.`);
  }

  const bereiche = formData.getAll('bereiche').map(String).filter(Boolean);
  const gewuenscht = qualifikationenAus(formData);

  await db.$transaction([
    db.employee.update({
      where: { id },
      data: { ...zuDaten(eingabe), personnelNo, preferredAreas: bereiche, updatedById: user.id },
    }),
    db.employeeQualification.deleteMany({
      where: { employeeId: id, qualificationId: { notIn: gewuenscht.map((q) => q.qualificationId) } },
    }),
    ...gewuenscht.map((q) =>
      db.employeeQualification.upsert({
        where: { employeeId_qualificationId: { employeeId: id, qualificationId: q.qualificationId } },
        create: { employeeId: id, ...q },
        update: { expiresAt: q.expiresAt, acquiredAt: q.acquiredAt },
      }),
    ),
  ]);

  const unterschied = diff(vorher as unknown as Record<string, unknown>, zuDaten(eingabe) as Record<string, unknown>);
  await audit(user, {
    action: 'employee.update', entity: 'Employee', entityId: id,
    summary: `Mitarbeiter ${vorher.firstName} ${vorher.lastName} geändert (${unterschied.changed.join(', ') || 'Qualifikationen'})`,
    before: unterschied.before, after: unterschied.after,
  });
}

/**
 * Qualifikationen aus dem Formular: je Haken eine Zeile, das zugehörige
 * Ablaufdatum steht im Feld `ablauf_<id>`.
 */
function qualifikationenAus(formData: FormData): Array<{ qualificationId: string; acquiredAt: Date | null; expiresAt: Date | null }> {
  return formData.getAll('qualifikationen').map(String).filter(Boolean).map((qualificationId) => {
    const ablauf = String(formData.get(`ablauf_${qualificationId}`) ?? '');
    const erworben = String(formData.get(`erworben_${qualificationId}`) ?? '');
    return {
      qualificationId,
      acquiredAt: /^\d{4}-\d{2}-\d{2}$/.test(erworben) ? toDateOnly(`${erworben}T00:00:00Z`) : null,
      expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(ablauf) ? toDateOnly(`${ablauf}T00:00:00Z`) : null,
    };
  });
}

/** Mitarbeiter werden deaktiviert, nicht gelöscht (Spec 73). */
export async function mitarbeiterDeaktivieren(user: SessionUser, id: string, grund: string) {
  const employee = await db.employee.findFirst({ where: { id, deletedAt: null } });
  if (!employee) throw new NotFoundError('Der Mitarbeiter wurde nicht gefunden.');

  const kommende = await db.assignment.count({
    where: { employeeId: id, deletedAt: null, status: { notIn: ['ABGESAGT', 'STORNIERT'] }, event: { date: { gte: new Date() } } },
  });
  if (kommende > 0) {
    throw new ConflictError(`Der Mitarbeiter ist noch für ${kommende} kommende Einsätze eingeteilt. Bitte klaeren Sie diese zuerst.`);
  }

  await db.$transaction([
    db.employee.update({ where: { id }, data: { active: false, blockReason: grund, updatedById: user.id } }),
    db.user.updateMany({ where: { employeeId: id }, data: { active: false } }),
  ]);
  await audit(user, {
    action: 'employee.deactivate', entity: 'Employee', entityId: id,
    summary: `Mitarbeiter ${employee.firstName} ${employee.lastName} deaktiviert: ${grund}`,
  });
}

/** Zugang zur Mitarbeiter-App einrichten (Spec 12). */
export async function zugangAnlegen(user: SessionUser, employeeId: string, email: string, passwort: string) {
  const staerke = checkPasswordStrength(passwort);
  if (!staerke.ok) throw new ValidationError(staerke.message!);

  const employee = await db.employee.findFirst({ where: { id: employeeId, deletedAt: null }, include: { user: true } });
  if (!employee) throw new NotFoundError('Der Mitarbeiter wurde nicht gefunden.');
  if (employee.user) throw new ConflictError('Für diesen Mitarbeiter besteht bereits ein Zugang.');

  const adresse = email.trim().toLowerCase();
  if (await db.user.findUnique({ where: { email: adresse } })) {
    throw new ConflictError('Diese E-Mail-Adresse wird bereits von einem anderen Zugang verwendet.');
  }

  const neu = await db.user.create({
    data: {
      email: adresse,
      name: `${employee.firstName} ${employee.lastName}`,
      passwordHash: await hashPassword(passwort),
      role: 'MITARBEITER',
      employeeId,
      mustChangePassword: true,
    },
  });
  await audit(user, {
    action: 'user.create', entity: 'User', entityId: neu.id,
    summary: `Zugang für ${employee.firstName} ${employee.lastName} angelegt (${adresse})`,
  });
  return neu;
}
