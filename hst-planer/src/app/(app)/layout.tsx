import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { eigeneNavFor, navFor, ROLE_LABEL } from '@/lib/auth/rbac';
import { unreadCount } from '@/lib/notify';
import { Navigation } from '@/components/navigation';
import { Kopfzeile } from '@/components/kopfzeile';
import { abmelden } from '@/app/anmelden/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/anmelden');

  const [ungelesen] = await Promise.all([unreadCount(user.id)]);

  return (
    <div className="app">
      <Navigation
        items={navFor(user.role)}
        eigene={eigeneNavFor(user.role, Boolean(user.employeeId))}
        name={user.name}
        rolle={ROLE_LABEL[user.role]}
      />
      <div className="app-inhalt">
        <Kopfzeile ungelesen={ungelesen} theme={user.theme} abmelden={abmelden} />
        <main className="app-haupt">{children}</main>
      </div>
    </div>
  );
}
