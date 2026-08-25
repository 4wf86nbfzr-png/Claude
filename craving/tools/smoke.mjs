/**
 * Rauchtest der Bestellstrecke.
 *
 * Faehrt einmal durch: Builder, Zutaten aendern, Warenkorb, Gutschein,
 * Kasse (vier Schritte), Bestellung, Statusseite. Meldet jeden
 * Konsolenfehler und legt Bildschirmfotos ab.
 *
 *   npm run dev
 *   node tools/smoke.mjs /pfad/fuer/screenshots
 */
import { chromium } from "playwright";
const SP = process.argv[2] ?? "/tmp";
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

// 1. Builder: Zutaten auswaehlen und in den Warenkorb
await page.goto(`${BASE}/bauen/doener?produkt=classic-doener`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /Jalapenos/ }).first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Knoblauchsosse/ }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "In den Warenkorb" }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${SP}/flow1_add.png` });

// 2. Pizza dazu
await page.goto(`${BASE}/bauen/pizza?produkt=salami`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.getByRole("button", { name: "In den Warenkorb" }).click();
await page.waitForTimeout(700);

// 3. Warenkorb
await page.goto(`${BASE}/warenkorb`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.fill("#cart-plz", "20095");
await page.waitForTimeout(400);
await page.fill("input[aria-label='Gutscheincode']", "CRAVING10");
await page.getByRole("button", { name: "Einloesen" }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${SP}/flow2_cart.png`, fullPage: true });

// 4. Kasse
await page.getByRole("link", { name: /Zur Kasse/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SP}/flow3_checkout1.png` });
await page.getByRole("button", { name: "Weiter" }).click();
await page.waitForTimeout(700);
await page.getByLabel("Vorname").fill("Martin");
await page.getByLabel("Nachname").fill("Kruse");
await page.getByLabel("E-Mail").fill("martin@example.com");
await page.getByLabel("Telefon").fill("040 123456");
await page.getByLabel("Strasse").fill("Hafenstrasse");
await page.getByLabel("Hausnummer").fill("12a");
await page.getByRole("textbox", { name: /^Ort/ }).fill("Hamburg");
await page.waitForTimeout(300);
await page.screenshot({ path: `${SP}/flow4_contact.png` });
await page.getByRole("button", { name: "Weiter" }).click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /Bar bei Lieferung/ }).click();
await page.getByRole("button", { name: "Weiter" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${SP}/flow5_review.png`, fullPage: true });
await page.getByRole("button", { name: /Kostenpflichtig bestellen/ }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SP}/flow6_success.png`, fullPage: true });

console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
await browser.close();
