import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { Hinweis, Karte, Seitenkopf } from '@/components/ui';
import { PasswortFormular } from './formular';

export const metadata: Metadata = { title: 'Passwort aendern' };
export const dynamic = 'force-dynamic';

export default async function PasswortAendern() {
  const user = await seite();
  const konto = await db.user.findUnique({ where: { id: user.id }, select: { mustChangePassword: true } });

  return (
    <>
      <Seitenkopf titel="Passwort aendern" unter={user.email} />
      <div style={{ maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {konto?.mustChangePassword && (
          <Hinweis art="warnung">
            Bitte vergeben Sie ein eigenes Passwort. Das Startpasswort ist mehreren Personen bekannt.
          </Hinweis>
        )}
        <Karte>
          <div style={{ padding: 18 }}>
            <PasswortFormular />
          </div>
        </Karte>
      </div>
    </>
  );
}
