/** Barrierefreiheit (axe-core, WCAG 2.1 AA + Best Practice) über die öffentlichen Seiten und optional das Dashboard.
 *  Aufruf aus .pw:  WEB=http://127.0.0.1:13000 node axe.mjs [--json]   (Dashboard: DASH_EMAIL/DASH_PASSWORD setzen) */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const WEB = process.env.WEB ?? "http://127.0.0.1:13000";
const pages = (process.env.PAGES ?? "/,/preise,/demo,/registrieren,/anmelden,/kontakt,/funktionen,/branchen,/hilfe,/impressum,/datenschutz,/agb,/passwort-vergessen").split(",");
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const out = {}; let serious = 0;
async function scan(p) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  out[p] = res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")), help: v.help }));
  serious += res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").length;
}
for (const p of pages) { await page.goto(WEB + p, { waitUntil: "networkidle" }); await scan(p); }
if (process.env.DASH_EMAIL) {
  await page.goto(WEB + "/anmelden"); await page.fill('input[name="email"]', process.env.DASH_EMAIL); await page.fill('input[name="password"]', process.env.DASH_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click(); await page.waitForURL(/\/app/);
  for (const p of ["/app", "/app/anfragen", "/app/termine", "/app/angebote", "/app/berichte", "/app/kunden", "/app/einstellungen", "/app/abonnement"]) { await page.goto(WEB + p, { waitUntil: "networkidle" }); await scan(p); }
}
await browser.close();
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 1));
else for (const [p, v] of Object.entries(out)) console.log(p, v.length ? v.map((x) => `${x.id}(${x.impact}×${x.n})`).join(", ") : "ok");
if (serious) { console.log(`axe: ${serious} schwere Verstöße`); process.exit(1); }
console.log("axe ok (keine schweren Verstöße)");
