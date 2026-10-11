import { test, expect, type Page } from "@playwright/test";

const suffix = Date.now().toString(36);
const email = `dispo-e2e-${suffix}@test.invalid`;
const password = "E2E-Dispo-2026!";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("Stammdaten: Qualifikation, Mitarbeiter, Kunde", async ({ page }) => {
  await page.goto("/registrieren");
  await page.getByLabel("Unternehmen").fill(`Planung ${suffix}`);
  await page.getByLabel("Ihr Name").fill("Dana Dispo");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/qualifikationen");
  await page.locator("#q-key").fill("34a");
  await page.locator("#q-name").fill("Sachkunde §34a");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.locator("table").first()).toContainText("Sachkunde §34a");

  await page.goto("/mitarbeiter/neu");
  await page.locator("#firstName").fill("Anna");
  await page.locator("#lastName").fill("Muster");
  await page.getByLabel("Sicherheit").check();
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(/\/mitarbeiter\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Muster, Anna" })).toBeVisible();
  await page.locator("#q-id").selectOption({ label: "Sachkunde §34a" });
  await page.locator("#q-until").fill("2030-12-31");
  await page.getByRole("button", { name: "Hinzufügen / aktualisieren" }).click();
  await expect(page.locator("table").first()).toContainText("Sachkunde §34a");

  await page.goto("/kunden/neu");
  await page.locator("#name").fill("Hafen Events GmbH");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(/\/kunden\/[0-9a-f-]{36}/);
});

test("Veranstaltung, Position, Besetzung mit Konfliktanzeige", async ({ page }) => {
  await login(page);
  await page.goto("/veranstaltungen/neu");
  await page.locator("#name").fill("Hafenfest");
  await page.locator("#customerId").selectOption({ label: "Hafen Events GmbH" });
  await page.locator("#startsAt").fill("2027-06-10T18:00");
  await page.locator("#endsAt").fill("2027-06-11T02:00");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(/\/veranstaltungen\/[0-9a-f-]{36}/);
  const eventUrl = page.url();

  await page.locator("#p-name").fill("Einlass");
  await page.locator("#p-head").fill("2");
  await page.getByLabel("Sachkunde §34a").check();
  await page.getByRole("button", { name: "Position anlegen" }).click();
  await expect(page.getByText("Einlass", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Besetzen" })).toHaveCount(2);

  await page.getByRole("link", { name: "Besetzen" }).first().click();
  await expect(page.getByRole("heading", { name: /Besetzen: Einlass/ })).toBeVisible();
  await expect(page.getByText("keine Konflikte")).toBeVisible();
  await page.getByRole("button", { name: "Zuweisen" }).first().click();
  await expect(page).toHaveURL(eventUrl);
  await expect(page.getByText("Angefragt").first()).toBeVisible();
  await expect(page.getByText("Muster, Anna").first()).toBeVisible();

  // Zweiter Slot: dieselbe Person -> Doppelbuchung (hart), kein Zuweisen-Knopf
  await page.getByRole("link", { name: "Besetzen" }).first().click();
  await expect(page.getByText("Doppelbuchung", { exact: true })).toBeVisible();
  await expect(page.getByText("Nicht möglich.")).toBeVisible();

  // Zusage erfassen und bestätigen
  await page.goto(eventUrl);
  await page.getByRole("button", { name: "Zusage erfassen" }).click();
  await expect(page.getByText("Zugesagt").first()).toBeVisible();
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page.getByText("Bestätigt").first()).toBeVisible();

  // Dashboard zeigt die offene Position
  await page.goto("/dashboard");
  await expect(page.getByText("Offene Positionen").first()).toBeVisible();
  // Kalender zeigt die Veranstaltung
  await page.goto("/kalender?ansicht=monat&tag=2027-06-10");
  await expect(page.getByRole("link", { name: /Hafenfest/ }).first()).toBeVisible();
});
