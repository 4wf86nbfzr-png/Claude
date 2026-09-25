import { PrismaClient } from '@prisma/client';

/**
 * Ein einziger Prisma-Client pro Prozess. Im Entwicklungsmodus laedt Next.js
 * Module bei jeder Änderung neu – ohne diesen Cache entstuenden dabei
 * hunderte offene Datenbankverbindungen.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
