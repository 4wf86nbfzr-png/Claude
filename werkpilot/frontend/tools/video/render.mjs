// Rendert das Hintergrundvideo der Startseite aus anim.html (Canvas-Animation, 14 s Loop).
// Aufruf aus frontend/:  node tools/video/render.mjs
// Braucht: npm i -D playwright (einmalig) und ffmpeg mit libvpx (Playwrights ffmpeg reicht).
// Ergebnis: public/video/werkpilot-loop.webm und public/video/poster.jpg
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const raw = path.join(here, "raw"); mkdirSync(raw, { recursive: true });
const out = path.resolve(here, "../../public/video"); mkdirSync(out, { recursive: true });
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: raw, size: { width: 1920, height: 1080 } } });
const page = await ctx.newPage();
await page.goto(`file://${path.join(here, "anim.html")}`); await page.waitForTimeout(16500); await ctx.close();
const still = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await still.goto(`file://${path.join(here, "anim.html")}#still`); await still.waitForTimeout(500);
await still.screenshot({ path: path.join(out, "poster.jpg"), type: "jpeg", quality: 80 });
await browser.close();
const src = readdirSync(raw).filter((f) => f.endsWith(".webm")).map((f) => path.join(raw, f)).sort((a, b) => b.localeCompare(a))[0];
execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", "1.5", "-t", "14", "-i", src, "-c:v", "libvpx", "-b:v", "1800k", "-crf", "18", "-an", "-r", "30", path.join(out, "werkpilot-loop.webm")]);
console.log("fertig:", path.join(out, "werkpilot-loop.webm"), existsSync(path.join(out, "poster.jpg")) ? "+ poster.jpg" : "");
