import { test, expect } from "@playwright/test";

const suffix = Date.now().toString(36);
const email = `e2e-${suffix}@test.invalid`;
const password = "E2E-Passwort-2026!";

test.describe.configure({ mode: "serial" });

test("Registrierung legt Mandant an und zeigt Dashboard", async ({ page }) => {
  await page.goto("/registrieren");
  await page.getByLabel("Unternehmen").fill(`E2E Sicherheit ${suffix}`);
  await page.getByLabel("Ihr Name").fill("Erika E2E");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Offene Positionen")).toBeVisible();
});

test("Abmelden, falsches Passwort, Anmelden", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill("falsch-falsch-falsch");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.locator(".alert-danger")).toContainText("falsch");
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("Einladung und API-Schlüssel", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/einstellungen/benutzer");
  await page.locator("#inv-email").fill(`dispo-${suffix}@test.invalid`);
  await page.locator("#inv-role").selectOption("dispatcher");
  await page.getByRole("button", { name: "Einladung senden" }).click();
  await expect(page.locator(".alert-ok")).toContainText("Einladung");
  await expect(page.getByText(`dispo-${suffix}@test.invalid`).first()).toBeVisible();

  await page.goto("/einstellungen/api-schluessel");
  await page.locator("#k-name").fill("Integrationstest");
  await page.getByLabel("events:read").check();
  await page.getByRole("button", { name: "Erstellen" }).click();
  const status = page.locator(".alert-ok");
  await expect(status).toContainText("drx_");
  const secret = (await status.textContent())!.match(/drx_[A-Za-z0-9_-]+/)![0];
  // API-Aufruf mit dem Schlüssel
  const res = await page.request.get("/api/v1/events", { headers: { authorization: `Bearer ${secret}` } });
  expect(res.status()).toBe(200);
  const unauth = await page.request.get("/api/v1/events", { headers: { authorization: "Bearer drx_ungueltig_000000000000000000" } });
  expect(unauth.status()).toBe(401);
});
