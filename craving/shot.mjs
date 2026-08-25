import { chromium } from "playwright";

const [url, out, w = "1440", h = "900", waitMs = "2500"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out, fullPage: false });
if (errors.length) console.log("CONSOLE ERRORS:\n" + errors.join("\n"));
else console.log("no console errors");
await browser.close();
