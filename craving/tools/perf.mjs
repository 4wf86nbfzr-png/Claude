/**
 * Kennzahlen im Produktionsbuild messen: LCP, CLS, uebertragene Bytes.
 *
 *   npm run build && npm run start -- -p 3200
 *   node tools/perf.mjs
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const BASE = process.env.PERF_BASE ?? "http://localhost:3000";
for (const path of ["/", "/bauen/pizza", "/menue"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForTimeout(3500);
  const m = await page.evaluate(() => new Promise((resolve) => {
    const out = { lcp: 0, cls: 0, transfer: 0, dcl: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) out.lcp = Math.round(e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) out.cls += e.value; } }).observe({ type: "layout-shift", buffered: true });
    const nav = performance.getEntriesByType("navigation")[0];
    out.dcl = Math.round(nav.domContentLoadedEventEnd);
    out.transfer = Math.round(performance.getEntriesByType("resource").reduce((s, r) => s + (r.transferSize || 0), nav.transferSize || 0) / 1024);
    setTimeout(() => resolve({ ...out, cls: +out.cls.toFixed(4) }), 500);
  }));
  console.log(path, JSON.stringify(m));
  await page.close();
}
await browser.close();
