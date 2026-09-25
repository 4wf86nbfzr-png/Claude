import 'server-only';
import { db } from '../db';
import { can, ROLE_LABEL, type Role } from '../auth/rbac';

/**
 * Sicherheitscheck (SecPlan 24).
 *
 * Zehn Fragen, die sich nur durch Hinsehen beantworten lassen und die
 * deshalb niemand stellt. Jede liefert eine Liste von Namen, nicht eine
 * Ampel: „3 Auffälligkeiten" hilft nicht, „Ralf Timm hat seit dem
 * Ausscheiden noch einen aktiven Zugang" schon.
 *
 * Der Check bewertet nicht, er zeigt. Ob ein Befund ein Problem ist,
 * entscheidet, wer ihn liest – ein Konto ohne Anmeldung seit einem Jahr
 * kann eine Karteileiche sein oder die Urlaubsvertretung.
 */

export interface Befund {
  /** Kurzer Text, der die Zeile erklärt. */
  text: string;
  /** Wohin man geht, um es zu ändern. */
  href?: string;
  /** Zusatzangabe rechts, z. B. ein Datum. */
  zusatz?: string;
}

export interface Pruefung {
  id: string;
  frage: string;
  /** Warum das überhaupt geprüft wird. */
  warum: string;
  befunde: Befund[];
  /** Wie ernst ein Befund hier ist. */
  gewicht: 'hoch' | 'mittel' | 'niedrig';
}

const TAG = 86_400_000;

export async function sicherheitscheck(): Promise<Pruefung[]> {
  const jetzt = new Date();
  const vor90Tagen = new Date(jetzt.getTime() - 90 * TAG);
  const vor30Tagen = new Date(jetzt.getTime() - 30 * TAG);
  const vor7Tagen = new Date(jetzt.getTime() - 7 * TAG);

  const [
    benutzer, abgelaufeneNachweise, offeneAnfragen, offeneVorfaelle,
    faelligeLoeschungen, vieleDownloads, ungewoehnlicheAnmeldungen, verweigerteZugriffe,
  ] = await Promise.all([
    db.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, email: true, role: true, active: true,
        totpEnabled: true, lastLoginAt: true, createdAt: true, failedLogins: true, lockedUntil: true,
        employee: { select: { id: true, active: true, deletedAt: true, lastName: true, firstName: true } },
        partner: { select: { active: true, deletedAt: true } },
      },
    }),
    db.employeeQualification.count({ where: { expiresAt: { lt: jetzt }, employee: { active: true, deletedAt: null } } }),
    db.dataSubjectRequest.findMany({
      where: { status: { notIn: ['BEANTWORTET', 'ABGELEHNT'] } },
      select: { id: true, number: true, subjectName: true, dueAt: true, extendedTo: true },
      orderBy: { dueAt: 'asc' },
    }),
    db.dataBreach.findMany({
      where: { status: { notIn: ['ABGESCHLOSSEN', 'KEINE_MELDUNG'] } },
      select: { id: true, number: true, title: true, noticedAt: true, reportable: true },
      orderBy: { noticedAt: 'asc' },
    }),
    db.document.count({ where: { deletedAt: null, deleteAt: { not: null, lte: jetzt } } }),
    db.documentAccessLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: vor7Tagen }, action: 'HERUNTERLADEN', result: 'GEWAEHRT' },
      _count: true,
      having: { userId: { _count: { gt: 25 } } },
    }),
    db.session.findMany({
      where: { createdAt: { gte: vor30Tagen }, revokedAt: null },
      select: { id: true, userId: true, ip: true, createdAt: true, userAgent: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    db.documentAccessLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: vor30Tagen }, result: 'VERWEIGERT' },
      _count: true,
    }),
  ]);

  const nameVon = new Map(benutzer.map((b) => [b.id, b.name]));
  const pruefungen: Pruefung[] = [];

  // 1 – Ausgeschiedene mit aktivem Zugang
  pruefungen.push({
    id: 'ausgeschieden',
    frage: 'Ausgeschiedene Mitarbeiter mit aktivem Zugang',
    warum: 'Ein Zugang, der nach dem Ausscheiden bestehen bleibt, ist der häufigste Weg zu Daten, den niemand auf dem Schirm hat.',
    gewicht: 'hoch',
    befunde: benutzer
      .filter((b) => b.active && b.employee && (!b.employee.active || b.employee.deletedAt))
      .map((b) => ({
        text: `${b.name} (${b.email}) – Mitarbeiterprofil ist ${b.employee!.deletedAt ? 'gelöscht' : 'inaktiv'}, der Zugang ist aktiv`,
        href: '/admin/benutzer',
        zusatz: b.lastLoginAt ? `zuletzt ${b.lastLoginAt.toLocaleDateString('de-DE')}` : 'nie angemeldet',
      })),
  });

  // 2 – Benutzer ohne Rolle bzw. ohne Zuordnung
  pruefungen.push({
    id: 'ohne-zuordnung',
    frage: 'Zugänge ohne Zuordnung',
    warum: 'Ein Konto ohne Mitarbeiter-, Partner- oder Kundenzuordnung fällt durch die Sichtbarkeitsfilter – es sieht entweder nichts oder zu viel.',
    gewicht: 'mittel',
    befunde: benutzer
      .filter((b) => b.active && !b.employee && b.role !== 'SUPERADMIN' && b.role !== 'GESCHAEFTSFUEHRUNG'
        && b.role !== 'DISPOSITION' && b.role !== 'PERSONAL')
      .map((b) => ({
        text: `${b.name} (${b.email}) – Rolle ${ROLE_LABEL[b.role as Role]}, keine Zuordnung hinterlegt`,
        href: '/admin/benutzer',
      })),
  });

  // 3 – Weitreichende Rechte
  pruefungen.push({
    id: 'weitreichend',
    frage: 'Zugänge mit weitreichenden Rechten',
    warum: 'Least Privilege heißt: so wenige wie möglich. Die Liste gehört regelmäßig angesehen, auch wenn sie stimmt.',
    gewicht: 'mittel',
    befunde: benutzer
      .filter((b) => b.active && (b.role === 'SUPERADMIN' || can(b.role as Role, 'admin.users')))
      .map((b) => ({
        text: `${b.name} (${b.email}) – ${ROLE_LABEL[b.role as Role]}`,
        href: '/admin/benutzer',
        zusatz: b.lastLoginAt ? `zuletzt ${b.lastLoginAt.toLocaleDateString('de-DE')}` : 'nie angemeldet',
      })),
  });

  // 4 – Fehlende Zwei-Faktor-Anmeldung bei privilegierten Konten
  pruefungen.push({
    id: 'mfa',
    frage: 'Privilegierte Zugänge ohne zweiten Faktor',
    warum: 'Ein Passwort allein trägt bei einem Zugang, der alle Personalakten öffnen kann, nicht.',
    gewicht: 'hoch',
    befunde: benutzer
      .filter((b) => b.active && !b.totpEnabled
        && (b.role === 'SUPERADMIN' || can(b.role as Role, 'employees.file') || can(b.role as Role, 'admin.users')))
      .map((b) => ({
        text: `${b.name} (${b.email}) – ${ROLE_LABEL[b.role as Role]}, kein zweiter Faktor eingerichtet`,
        href: '/konto/sicherheit',
      })),
  });

  // 5 – Konten, die lange niemand benutzt hat
  pruefungen.push({
    id: 'ungenutzt',
    frage: 'Zugänge ohne Anmeldung seit 90 Tagen',
    warum: 'Ein Konto, das niemand braucht, kann trotzdem jemand benutzen. Das ist kein Befund, sondern eine Frage: wird er noch gebraucht?',
    gewicht: 'niedrig',
    befunde: benutzer
      .filter((b) => b.active && (!b.lastLoginAt || b.lastLoginAt < vor90Tagen) && b.createdAt < vor90Tagen)
      .map((b) => ({
        text: `${b.name} (${b.email}) – ${ROLE_LABEL[b.role as Role]}`,
        href: '/admin/benutzer',
        zusatz: b.lastLoginAt ? `zuletzt ${b.lastLoginAt.toLocaleDateString('de-DE')}` : 'nie angemeldet',
      })),
  });

  // 6 – Gesperrte Konten und Fehlversuche
  pruefungen.push({
    id: 'fehlversuche',
    frage: 'Gesperrte Konten und auffällige Fehlversuche',
    warum: 'Wiederholte Fehlversuche sind entweder ein vergessenes Passwort oder ein Versuch von außen. Beides gehört gesehen.',
    gewicht: 'mittel',
    befunde: benutzer
      .filter((b) => b.failedLogins >= 3 || (b.lockedUntil && b.lockedUntil > jetzt))
      .map((b) => ({
        text: `${b.name} (${b.email}) – ${b.failedLogins} Fehlversuche${b.lockedUntil && b.lockedUntil > jetzt ? ', derzeit gesperrt' : ''}`,
        href: '/admin/benutzer',
      })),
  });

  // 7 – Abgelaufene Nachweise
  pruefungen.push({
    id: 'nachweise',
    frage: 'Abgelaufene Qualifikationen bei aktiven Kräften',
    warum: 'Im Bewachungsgewerbe ist ein abgelaufener Nachweis kein Formfehler.',
    gewicht: 'hoch',
    befunde: abgelaufeneNachweise > 0
      ? [{ text: `${abgelaufeneNachweise} abgelaufene Nachweise bei aktiven Mitarbeitern`, href: '/qualifikationen' }]
      : [],
  });

  // 8 – Offene Betroffenenanfragen
  pruefungen.push({
    id: 'anfragen',
    frage: 'Offene Betroffenenanfragen',
    warum: 'Art. 12 Abs. 3 DSGVO setzt einen Monat. Die Frist läuft, ob jemand hinsieht oder nicht.',
    gewicht: 'hoch',
    befunde: offeneAnfragen.map((a) => {
      const frist = a.extendedTo ?? a.dueAt;
      const tage = Math.ceil((frist.getTime() - jetzt.getTime()) / TAG);
      return {
        text: `${a.number} – ${a.subjectName}`,
        href: '/compliance/datenschutz',
        zusatz: tage < 0 ? `${Math.abs(tage)} Tage über der Frist` : `noch ${tage} Tage`,
      };
    }),
  });

  // 9 – Offene Datenschutzvorfälle
  pruefungen.push({
    id: 'vorfaelle',
    frage: 'Nicht abgeschlossene Datenschutzvorfälle',
    warum: 'Art. 33 nennt 72 Stunden ab Kenntnis. Ein Vorfall ohne Bewertung der Meldepflicht ist der kritischste Fall.',
    gewicht: 'hoch',
    befunde: offeneVorfaelle.map((v) => ({
      text: `${v.number} – ${v.title}`,
      href: '/compliance/vorfaelle',
      zusatz: v.reportable === null
        ? 'Meldepflicht noch nicht bewertet'
        : `bekannt seit ${v.noticedAt.toLocaleDateString('de-DE')}`,
    })),
  });

  // 10 – Fällige Löschungen
  pruefungen.push({
    id: 'loeschungen',
    frage: 'Fällige Löschungen',
    warum: 'Daten über die Frist hinaus aufzubewahren ist ein Verstoß, auch wenn niemand sie ansieht.',
    gewicht: 'mittel',
    befunde: faelligeLoeschungen > 0
      ? [{ text: `${faelligeLoeschungen} Unterlagen haben ihr Löschdatum erreicht`, href: '/compliance/loeschfristen' }]
      : [],
  });

  // 11 – Auffällige Downloads
  pruefungen.push({
    id: 'downloads',
    frage: 'Auffällig viele Downloads',
    warum: 'Mehr als 25 heruntergeladene Unterlagen in einer Woche ist ungewöhnlich – manchmal harmlos, manchmal nicht.',
    gewicht: 'mittel',
    befunde: vieleDownloads.map((d) => ({
      text: `${d.userId ? nameVon.get(d.userId) ?? 'unbekanntes Konto' : 'ohne Anmeldung'} – ${d._count} Downloads in sieben Tagen`,
      href: '/compliance/audit-log',
    })),
  });

  // 12 – Verweigerte Zugriffe
  pruefungen.push({
    id: 'verweigert',
    frage: 'Verweigerte Zugriffe auf Dokumente',
    warum: 'Die Prüfung hat gegriffen – aber jemand hat es versucht. Das ist entweder ein Missverständnis oder ein Hinweis.',
    gewicht: 'mittel',
    befunde: verweigerteZugriffe
      .filter((z) => z._count > 0)
      .map((z) => ({
        text: `${z.userId ? nameVon.get(z.userId) ?? 'unbekanntes Konto' : 'ohne Anmeldung'} – ${z._count} verweigerte Zugriffe in 30 Tagen`,
        href: '/compliance/audit-log',
      })),
  });

  // 13 – Sitzungen von auffällig vielen Adressen
  {
    const adressenJeBenutzer = new Map<string, Set<string>>();
    for (const sitzung of ungewoehnlicheAnmeldungen) {
      if (!sitzung.ip) continue;
      const menge = adressenJeBenutzer.get(sitzung.userId) ?? new Set<string>();
      menge.add(sitzung.ip);
      adressenJeBenutzer.set(sitzung.userId, menge);
    }
    pruefungen.push({
      id: 'anmeldungen',
      frage: 'Anmeldungen von ungewöhnlich vielen Adressen',
      warum: 'Vier oder mehr verschiedene IP-Adressen in 30 Tagen können mobiles Arbeiten sein – oder ein geteiltes Passwort.',
      gewicht: 'niedrig',
      befunde: [...adressenJeBenutzer.entries()]
        .filter(([, menge]) => menge.size >= 4)
        .map(([userId, menge]) => ({
          text: `${nameVon.get(userId) ?? 'unbekanntes Konto'} – ${menge.size} verschiedene Adressen`,
          href: '/admin/benutzer',
        })),
    });
  }

  return pruefungen;
}
