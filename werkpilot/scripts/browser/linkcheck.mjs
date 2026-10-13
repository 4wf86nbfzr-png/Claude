/**
 * Linkprüfung der öffentlichen Seiten: folgt allen internen Links (href) ab der Startseite,
 * prüft HTTP-Status, Anker (#id vorhanden) und sammelt Konsolenfehler.
 * Aufruf (aus .pw, dort liegt Playwright):  WEB=http://127.0.0.1:13000 node linkcheck.mjs
 */
import { chromium } from "playwright";
const WEB = process.env.WEB ?? "http://127.0.0.1:13000";
const EXE = process.env.PLAYWRIGHT_CHROMIUM;
const START = ["/", "/preise", "/demo", "/funktionen", "/branchen", "/hilfe", "/kontakt", "/registrieren", "/anmelden", "/passwort-vergessen", "/impressum", "/datenschutz", "/agb", "/widerruf", "/ratgeber"];
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const seen = new Map(); const problems = []; const queue = [...START];
const pageErrors = []; page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|net::ERR_ABORTED/.test(m.text())) pageErrors.push(m.text()); });
while (queue.length) {
  const p = queue.shift(); if (seen.has(p)) continue;
  const r = await page.goto(WEB + p, { waitUntil: "domcontentloaded" }).catch((e) => ({ status: () => "ERR " + e.message }));
  const status = r ? r.status() : 0; seen.set(p, status);
  if (status !== 200) { problems.push(`${p} → ${status}`); continue; }
  const links = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  const ids = new Set(await page.$$eval("[id]", (els) => els.map((e) => e.id)));
  for (const h of links) {
    if (!h || h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("http")) continue;
    if (h.startsWith("#")) { if (h !== "#" && !ids.has(h.slice(1))) problems.push(`${p}: Anker ${h} fehlt`); continue; }
    const [path, hash] = h.split("#");
    if (path.startsWith("/app") || path.startsWith("/admin") || path.startsWith("/api")) continue; // geschützt, separat getestet
    const clean = path.split("?")[0];
    if (!seen.has(clean) && !queue.includes(clean)) queue.push(clean);
    if (hash && clean === p && !ids.has(hash)) problems.push(`${p}: Anker #${hash} fehlt`);
  }
}
await browser.close();
console.log(`Seiten geprüft: ${seen.size}`);
for (const [p, s] of seen) if (s !== 200) console.log(`  ${p} → ${s}`);
if (pageErrors.length) problems.push(...pageErrors.map((e) => "Konsole: " + e.slice(0, 160)));
if (problems.length) { console.log("Probleme:\n  " + problems.join("\n  ")); process.exit(1); }
console.log("Linkprüfung ok");
