import { resetDatabase } from "../../src/server/db/reset";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

export default async function globalSetup() {
  // Ein Produktionsbuild in .next kollidiert mit `next dev` (HMR-Hash-Mismatch) – vorher entfernen.
  // Nur wenn noch kein Dev-Server läuft – sonst würde dessen Cache entfernt und HMR in eine Reload-Schleife geraten.
  const port = Number(process.env.E2E_PORT ?? 3100);
  const running = await fetch(`http://localhost:${port}/api/health`).then((r) => r.ok).catch(() => false);
  const next = path.join(process.cwd(), ".next");
  if (!running && existsSync(path.join(next, "BUILD_ID"))) rmSync(next, { recursive: true, force: true });
  const url = process.env.DATABASE_TEST_URL ?? "postgres://disporex_owner:disporex@localhost:5432/disporex_test";
  await resetDatabase(url);
}
