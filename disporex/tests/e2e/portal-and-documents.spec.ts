import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";

const suffix = Date.now().toString(36);
const adminEmail = `admin-p3-${suffix}@test.invalid`;
const empEmail = `emp-p3-${suffix}@test.invalid`;
const password = "E2E-Phase3-2026!";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/dashboard|\/portal/);
}

let inviteLink = "";

test("Admin: Mitarbeiter anlegen, Veranstaltung besetzen, Mitarbeiter einladen", async ({ page }) => {
  await page.goto("/registrieren");
  await page.getByLabel("Unternehmen").fill(`Portal ${suffix}`);
  await page.getByLabel("Ihr Name").fill("Admin Drei");
  await page.getByLabel("E-Mail-Adresse").fill(adminEmail);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/mitarbeiter/neu");
  await page.locator("#firstName").fill("Paul");
  await page.locator("#lastName").fill("Portal");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(/\/mitarbeiter\/[0-9a-f-]{36}/);
  // Einladung aus der Mitarbeiterseite; ohne SMTP zeigt die Oberfläche den Link an
  await page.locator("#inv-email").fill(empEmail);
  await page.getByRole("button", { name: "Portal-Einladung senden" }).click();
  const msg = await page.locator(".alert-ok").textContent();
  inviteLink = msg!.match(/https?:\/\/\S+\/einladung\/[A-Za-z0-9_-]+/)![0].replace(/^https?:\/\/[^/]+/, "");

  await page.goto("/kunden/neu");
  await page.locator("#name").fill("Portalkunde GmbH");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(/\/kunden\/[0-9a-f-]{36}/);

  await page.goto("/veranstaltungen/neu");
  await page.locator("#name").fill("Portaltest-Event");
  await page.locator("#customerId").selectOption({ label: "Portalkunde GmbH" });
  await page.locator("#startsAt").fill("2027-09-10T18:00");
  await page.locator("#endsAt").fill("2027-09-10T23:00");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(/\/veranstaltungen\/[0-9a-f-]{36}/);
  await page.locator("#p-name").fill("Service");
  await page.locator("#p-head").fill("1");
  await page.getByRole("button", { name: "Position anlegen" }).click();
  await page.getByRole("link", { name: "Besetzen" }).first().click();
  await page.getByRole("button", { name: "Zuweisen" }).first().click();
  await expect(page.getByText("Angefragt").first()).toBeVisible();
});

test("Einladung annehmen und als Mitarbeiter im Portal zusagen", async ({ page }) => {
  await page.goto(inviteLink);
  await page.locator("#name").fill("Paul Portal");
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Konto anlegen und anmelden" }).click();
  await expect(page).toHaveURL(/\/dashboard|\/portal/);
  await page.goto("/portal/mitarbeiter");
  await expect(page.getByRole("heading", { name: /Moin Paul/ })).toBeVisible();
  await expect(page.getByText("Portaltest-Event").first()).toBeVisible();
  await page.getByRole("button", { name: "Zusagen" }).first().click();
  await expect(page.getByText("Zugesagt").first()).toBeVisible();
  // Mitarbeiter darf keine Stammdaten sehen
  await page.goto("/mitarbeiter");
  await expect(page).toHaveURL(/keine-berechtigung/);
  await page.getByRole("link", { name: "Zum Dashboard" }).click();
});

test("Dokument hochladen, Download-Link erzeugen und abrufen; falscher Typ wird abgelehnt", async ({ page }) => {
  await login(page, adminEmail);
  const dir = path.join(process.cwd(), "test-results");
  const pdf = path.join(dir, `e2e-${suffix}.pdf`);
  writeFileSync(pdf, "%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
  const fake = path.join(dir, `e2e-${suffix}-fake.pdf`);
  writeFileSync(fake, "Das ist kein PDF");

  await page.goto("/dokumente");
  await page.locator("#d-file").setInputFiles(fake);
  await page.locator("#d-type").selectOption("tenant");
  await page.locator("#d-title").fill("Falsches PDF");
  await page.getByRole("button", { name: "Hochladen" }).click();
  await expect(page.locator(".alert-danger")).toContainText("passt nicht");

  await page.locator("#d-file").setInputFiles(pdf);
  await page.locator("#d-title").fill("Rahmenvertrag");
  await page.locator("#d-cat").selectOption("contract");
  await page.getByRole("button", { name: "Hochladen" }).click();
  await expect(page.locator(".alert-ok")).toContainText("hochgeladen");
  await page.getByRole("link", { name: "Rahmenvertrag" }).click();
  await page.getByRole("button", { name: "Download-Link erzeugen" }).click();
  const text = await page.locator(".alert-ok").textContent();
  const link = text!.match(/https?:\/\/\S+\/api\/documents\/[A-Za-z0-9_-]+/)![0];
  const res = await page.request.get(link.replace(/^https?:\/\/[^/]+/, ""));
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  const again = await page.request.get(link.replace(/^https?:\/\/[^/]+/, ""));
  expect(again.status()).toBe(404);
});
