import { defineConfig } from "@playwright/test";

/**
 * End-to-End-Tests gegen einen laufenden Dev-Server mit der Testdatenbank.
 *   pnpm test:e2e
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const TEST_DB = process.env.DATABASE_TEST_URL ?? "postgres://disporex_owner:disporex@localhost:5432/disporex_test";
const TEST_APP_DB = process.env.DATABASE_TEST_APP_URL ?? "postgres://disporex_app:disporex_app@localhost:5432/disporex_test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `APP_ENV=test DATABASE_URL=${TEST_DB} DATABASE_APP_URL=${TEST_APP_DB} LOG_LEVEL=warn LOG_PRETTY=false pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
