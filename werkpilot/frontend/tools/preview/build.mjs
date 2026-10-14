// Baut werkpilot/landing-preview.html: eine einzige Datei ohne Server, mit eingebettetem Video,
// GSAP, three.js-Szene und regelbasierter Demo. Aufruf aus frontend/: node tools/preview/build.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../..");
const b64 = (p, mime) => `data:${mime};base64,${readFileSync(p).toString("base64")}`;
execFileSync("npx", ["--yes", "esbuild@0.25.12", path.join(here, "scene.js"), "--bundle", "--minify", "--format=iife", "--global-name=WPScene", `--outfile=${path.join(here, "scene.bundle.js")}`], { stdio: "inherit", cwd: root });
let html = readFileSync(path.join(here, "template.html"), "utf8");
const parts = {
  GSAP: readFileSync(path.join(root, "node_modules/gsap/dist/gsap.min.js"), "utf8"),
  SCROLLTRIGGER: readFileSync(path.join(root, "node_modules/gsap/dist/ScrollTrigger.min.js"), "utf8"),
  SCENE: readFileSync(path.join(here, "scene.bundle.js"), "utf8"),
  WISSEN: JSON.stringify(JSON.parse(readFileSync(path.join(root, "../backend/app/services/assistant_wissen.json"), "utf8")).themen),
  VIDEO: b64(path.join(root, "public/video/clairify-1080.webm"), "video/webm"),
  FONT_DISPLAY: b64(path.join(root, "public/fonts/anton-latin.woff2"), "font/woff2"),
  FONT_BODY: b64(path.join(root, "public/fonts/inter-latin.woff2"), "font/woff2"),
  FONT_MONO: b64(path.join(root, "public/fonts/space-mono-400-latin.woff2"), "font/woff2"),
  POSTER: b64(path.join(root, "public/video/poster-1080.webp"), "image/webp"),
  PERSON: b64(path.join(root, "public/img/hero-person.webp"), "image/webp"),
  SCREEN_MOBIL: b64(path.join(root, "public/screens/mobil-anfrage-1080.webp"), "image/webp"),
  STILL1: b64(path.join(root, "public/video/stills/still-1-1600.webp"), "image/webp"),
  STILL2: b64(path.join(root, "public/video/stills/still-2-1600.webp"), "image/webp"),
  STILL3: b64(path.join(root, "public/video/stills/still-3-1600.webp"), "image/webp"),
  SCREEN_ANFRAGEN: b64(path.join(root, "public/screens/anfragen-1080.webp"), "image/webp"),
  SCREEN_DETAIL: b64(path.join(root, "public/screens/anfrage-detail-1080.webp"), "image/webp"),
  SCREEN_TERMINE: b64(path.join(root, "public/screens/termine-1080.webp"), "image/webp"),
  SCREEN_ANGEBOTE: b64(path.join(root, "public/screens/angebote-1080.webp"), "image/webp"),
  SCREEN_BERICHTE: b64(path.join(root, "public/screens/berichte-1080.webp"), "image/webp"),
  SCREEN_UEBERSICHT: b64(path.join(root, "public/screens/uebersicht-1080.webp"), "image/webp"),
};
for (const [k, v] of Object.entries(parts)) html = html.split(`/*__${k}__*/`).join(v).split(`{{${k}}}`).join(v);
const out = path.resolve(root, "../landing-preview.html");
writeFileSync(out, html);
console.log("geschrieben:", out, (readFileSync(out).length / 1e6).toFixed(1), "MB");
