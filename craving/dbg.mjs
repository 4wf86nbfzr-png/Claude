import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const svgs = [...document.querySelectorAll("section svg")];
  return svgs.slice(0, 3).map((s) => {
    const r = s.getBoundingClientRect();
    const parent = s.parentElement?.parentElement;
    const cs = parent ? getComputedStyle(parent) : null;
    return {
      rect: [r.x, r.y, r.width, r.height].map(Math.round),
      parentClass: parent?.className?.toString().slice(0, 120),
      transform: cs?.transform,
      opacity: cs?.opacity,
      zIndex: cs?.zIndex,
    };
  });
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
