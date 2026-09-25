import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Tests laufen gegen die in .env konfigurierte Datenbank. Wer eine eigene
// Testdatenbank moechte, setzt DATABASE_URL vor dem Aufruf.
config({ path: '.env', quiet: true });

export const db = new PrismaClient();

export const TEST_USER = {
  id: 'test-user',
  name: 'Testdisposition',
  email: 'test@hermserviceteam.com',
  role: 'DISPOSITION' as const,
  employeeId: null,
  partnerId: null,
  customerId: null,
  theme: 'light',
  scope: 'ALLE' as const,
  sessionId: 'test-session',
};

/** Legt den Benutzer an, unter dem die Tests protokolliert werden. */
export async function testBenutzer() {
  return db.user.upsert({
    where: { id: TEST_USER.id },
    create: {
      id: TEST_USER.id, email: TEST_USER.email, name: TEST_USER.name,
      passwordHash: 'scrypt$32768$8$1$AAAA$AAAA', role: 'DISPOSITION',
    },
    update: {},
  });
}
