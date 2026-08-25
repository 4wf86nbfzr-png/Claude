import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/icons/mark.svg", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

for (const [size, out, pad] of [[192, "public/icons/icon-192.png", 0], [512, "public/icons/icon-512.png", 0], [512, "public/icons/maskable-512.png", 0.16], [180, "public/icons/apple-touch-icon.png", 0]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<body style="margin:0;background:#0A090B;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg", '<svg width="100%" height="100%"')}</div></body>`);
  await page.screenshot({ path: out, omitBackground: false });
  await page.close();
}
// Open-Graph-Bild
const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await og.setContent(`<body style="margin:0;width:1200px;height:630px;background:#0A090B;color:#F7F3EC;font-family:'DejaVu Sans',sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 88px;box-sizing:border-box">
  <div style="position:absolute;inset:0;background:radial-gradient(60% 70% at 20% 0%, rgba(255,90,31,.28), transparent 65%)"></div>
  <div style="position:relative">
    <div style="font-size:22px;letter-spacing:.32em;text-transform:uppercase;color:#8B857C">Doener · Pizza · Croque</div>
    <div style="font-size:112px;font-weight:800;letter-spacing:-.02em;line-height:1.02;margin-top:26px">BUILD YOUR<br/>CRAVING.</div>
    <div style="font-size:28px;color:#C4BEB4;margin-top:30px">Zutat fuer Zutat sichtbar zusammenstellen.</div>
    <div style="position:absolute;right:0;bottom:-6px;font-size:34px;font-weight:800;color:#FF5A1F">CRAVING</div>
  </div>
</body>`);
await og.screenshot({ path: "public/og.png" });
await browser.close();
console.log("icons done");
