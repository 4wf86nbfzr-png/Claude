/**
 * Layout-Pruefung ueber mehrere Breiten.
 *
 * Ruft die wichtigsten Seiten auf und meldet horizontalen Ueberlauf
 * (samt verursachendem Element) sowie Konsolenfehler.
 *
 *   npm run dev
 *   node tools/qa.mjs
 */
import { chromium } from "playwright";
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const PAGES = ["/", "/menue", "/bauen/doener", "/bauen/pizza", "/bauen/croque", "/warenkorb", "/kasse", "/bestellungen", "/konto", "/konto/favoriten", "/rechtliches/allergene", "/rechtliches/impressum", "/nichts-da"];
const WIDTHS = [375, 768, 1440, 2560];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const report = [];
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));
  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(700);
    const res = await page.evaluate(() => {
      const de = document.documentElement;
      const overflow = de.scrollWidth - de.clientWidth;
      let offenders = [];
      if (overflow > 1) {
        offenders = [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > de.clientWidth + 2 || r.left < -2);
          })
          .slice(0, 4)
          .map((el) => `${el.tagName}.${el.className.toString().slice(0, 60)}`);
      }
      return { overflow, offenders };
    });
    if (res.overflow > 1 || errors.length) {
      report.push({ width, path, overflow: res.overflow, offenders: res.offenders, errors: [...errors] });
    }
    errors.length = 0;
  }
  await page.close();
}
console.log(report.length ? JSON.stringify(report, null, 1) : "alles sauber: kein horizontaler Ueberlauf, keine Konsolenfehler");
await browser.close();
