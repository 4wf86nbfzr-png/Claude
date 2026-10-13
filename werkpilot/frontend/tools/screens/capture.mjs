// Nimmt echte Bildschirme des Dashboards auf und legt sie unter public/screens/ ab.
// Voraussetzung: API und Web laufen (wie im Smoke-Test), ein Konto aus scripts/demo_seed.py.
// Aufruf aus dem Projektordner werkpilot/ (Playwright liegt in .pw/):
//   SEED=$(python3 scripts/demo_seed.py http://127.0.0.1:18000 .smoke-api.log)
//   SEED="$SEED" WEB=http://127.0.0.1:13000 PLAYWRIGHT_CHROMIUM=/pfad/zu/chromium node frontend/tools/screens/capture.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../../..");
const require = createRequire(path.join(root, ".pw/package.json"));
const { chromium } = require("playwright");

const WEB = process.env.WEB ?? "http://127.0.0.1:13000";
const seed = JSON.parse(process.env.SEED ?? "{}");
if (!seed.email) { console.error("SEED fehlt (Ausgabe von scripts/demo_seed.py)"); process.exit(1); }
const out = path.join(root, "frontend/public/screens"); mkdirSync(out, { recursive: true });

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: "de-DE", timezoneId: "Europe/Berlin" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("Seitenfehler:", e.message));
await page.goto(`${WEB}/anmelden`);
await page.fill('input[name="email"]', seed.email); await page.fill('input[name="password"]', seed.password);
await page.getByRole("button", { name: "Anmelden" }).click(); await page.waitForURL(/\/app/, { timeout: 20000 });

const SHOTS = [
  ["uebersicht", "/app", "Übersicht"],
  ["anfragen", "/app/anfragen", "Anfragen"],
  ["anfrage-detail", `/app/anfragen/${seed.inquiry_ids[1]}`, "Anfrage"],
  ["termine", "/app/termine", "Termine"],
  ["angebote", "/app/angebote", "Angebote"],
  ["berichte", "/app/berichte", "Berichte"],
  ["kunden", "/app/kunden", "Kunden"],
];
for (const [name, url, heading] of SHOTS) {
  await page.goto(`${WEB}${url}`, { waitUntil: "networkidle" });
  await page.getByText(heading).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log("Bildschirm:", name);
}
// Ein Blick vom Handy: die Anfrage mit Entwurf
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "de-DE", timezoneId: "Europe/Berlin" });
const mp = await mobile.newPage();
await mp.goto(`${WEB}/anmelden`); await mp.fill('input[name="email"]', seed.email); await mp.fill('input[name="password"]', seed.password);
await mp.getByRole("button", { name: "Anmelden" }).click(); await mp.waitForURL(/\/app/, { timeout: 20000 });
await mp.goto(`${WEB}/app/anfragen/${seed.inquiry_ids[0]}`, { waitUntil: "networkidle" }); await mp.waitForTimeout(600);
await mp.screenshot({ path: path.join(out, "mobil-anfrage.png") });
console.log("Bildschirm: mobil-anfrage");
await browser.close();
console.log("fertig:", out);
