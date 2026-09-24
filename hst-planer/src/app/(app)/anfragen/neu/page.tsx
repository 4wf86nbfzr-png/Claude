import { seite } from '@/lib/auth/guard';
import { Karte, Seitenkopf } from '@/components/ui';
import { AnfrageFormular } from './formular';

export const metadata = { title: 'Anfrage erfassen' };

export default async function AnfrageErfassen() {
  await seite('requests.edit');
  return (
    <>
      <Seitenkopf titel="Anfrage erfassen" brotkrumen={[{ href: '/anfragen', label: 'Anfragen' }]}
                  unter="Fuer telefonische Anfragen – die Angaben landen im selben Eingang wie Website- und E-Mail-Anfragen." />
      <Karte>
        <div style={{ padding: 16, maxWidth: 720 }}>
          <AnfrageFormular />
        </div>
      </Karte>
    </>
  );
}
