import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const out = await page.evaluate(() => {
  const section = document.querySelector("section");
  const kids = [...(section?.children ?? [])].map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      cls: el.className.toString().slice(0, 90),
      z: cs.zIndex,
      bg: cs.backgroundImage.slice(0, 80),
      rect: [r.x, r.y, r.width, r.height].map(Math.round),
    };
  });
  return kids;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
