import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { eigeneNavFor, navFor, ROLE_LABEL } from '@/lib/auth/rbac';
import { unreadCount } from '@/lib/notify';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { Navigation } from '@/components/navigation';
import { Kopfzeile } from '@/components/kopfzeile';
import { abmelden } from '@/app/anmelden/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/anmelden');

  const [ungelesen, konto] = await Promise.all([
    unreadCount(user.id),
    db.user.findUnique({ where: { id: user.id }, select: { totpEnabled: true } }),
  ]);

  /*
    SecPlan 14: Wer Personalakten öffnen oder Benutzer verwalten kann und
    keinen zweiten Faktor hat, bekommt einen Punkt am Schloss in der
    Kopfzeile. Kein Zwang, aber auch kein Wegsehen.
  */
  const faktorFehlt = !konto?.totpEnabled
    && (can(user.role, 'employees.file') || can(user.role, 'admin.users') || user.role === 'SUPERADMIN');

  /*
    Aufbau: oben die Kopfzeile mit Marke, Suche und Konto, darunter die
    Menüleiste mit den neun Bereichen, darunter der Inhalt. Die
    Navigation liefert beides – die Leiste und, auf dem Smartphone, die
    Schublade dahinter.
  */
  return (
    <div className="app">
      <Kopfzeile
        ungelesen={ungelesen}
        theme={user.theme}
        abmelden={abmelden}
        faktorFehlt={faktorFehlt}
        name={user.name}
        rolle={ROLE_LABEL[user.role]}
      />
      <Navigation
        gruppen={navFor(user.role)}
        eigene={eigeneNavFor(user.role, Boolean(user.employeeId))}
        name={user.name}
        rolle={ROLE_LABEL[user.role]}
      />
      <div className="app-inhalt">
        <main className="app-haupt">{children}</main>
      </div>
    </div>
  );
}
