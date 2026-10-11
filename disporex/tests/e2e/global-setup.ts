import { resetDatabase } from "../../src/server/db/reset";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

export default async function globalSetup() {
  // Ein Produktionsbuild in .next kollidiert mit `next dev` (HMR-Hash-Mismatch) – vorher entfernen.
  // Der E2E-Dev-Server nutzt ein eigenes Ausgabeverzeichnis (.next-e2e, siehe playwright.config.ts).
  // Ein versehentlich dort liegender Produktionsbuild würde HMR stören – nur dann entfernen, wenn kein Server läuft.
  const port = Number(process.env.E2E_PORT ?? 3100);
  const running = await fetch(`http://localhost:${port}/api/health`).then((r) => r.ok).catch(() => false);
  const dist = path.join(process.cwd(), ".next-e2e");
  if (!running && existsSync(path.join(dist, "BUILD_ID"))) rmSync(dist, { recursive: true, force: true });
  const url = process.env.DATABASE_TEST_URL ?? "postgres://disporex_owner:disporex@localhost:5432/disporex_test";
  await resetDatabase(url);
}
