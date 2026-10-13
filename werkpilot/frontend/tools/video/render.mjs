// Rendert den Platzhalter-Clip aus anim.html (Canvas-Animation, 4K, 14 s Loop) und legt ihn als
// tools/video/footage/placeholder-4k.webm ab. Danach erzeugt prepare-footage.mjs alle Varianten.
// Aufruf aus frontend/:  node tools/video/render.mjs && node tools/video/prepare-footage.mjs
// Braucht: npm i -D playwright (einmalig); PLAYWRIGHT_CHROMIUM zeigt optional auf ein installiertes Chromium.
// Sobald echtes Baustellenmaterial vorliegt, entfällt dieser Schritt: Clips in footage/ legen und footage.json pflegen.
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const raw = path.join(here, "raw"); mkdirSync(raw, { recursive: true });
const footage = path.join(here, "footage"); mkdirSync(footage, { recursive: true });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1, recordVideo: { dir: raw, size: { width: 3840, height: 2160 } } });
const page = await ctx.newPage();
await page.goto(`file://${path.join(here, "anim.html")}`); await page.waitForTimeout(16500); await ctx.close();
await browser.close();
const src = readdirSync(raw).filter((f) => f.endsWith(".webm")).map((f) => path.join(raw, f)).sort((a, b) => b.localeCompare(a))[0];
const dest = path.join(footage, "placeholder-4k.webm");
renameSync(src, dest); rmSync(raw, { recursive: true, force: true });
console.log("fertig:", dest, "→ jetzt: node tools/video/prepare-footage.mjs");
