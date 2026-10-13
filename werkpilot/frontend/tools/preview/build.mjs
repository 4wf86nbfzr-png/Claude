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
  POSTER: b64(path.join(root, "public/video/poster-1080.jpg"), "image/jpeg"),
  SCRUB: b64(path.join(root, "public/video/clairify-scrub-720.webm"), "video/webm"),
  STILL1: b64(path.join(root, "public/video/stills/still-1.jpg"), "image/jpeg"),
  STILL2: b64(path.join(root, "public/video/stills/still-2.jpg"), "image/jpeg"),
  STILL3: b64(path.join(root, "public/video/stills/still-3.jpg"), "image/jpeg"),
  SCREEN_ANFRAGEN: b64(path.join(root, "public/screens/anfragen.png"), "image/png"),
  SCREEN_DETAIL: b64(path.join(root, "public/screens/anfrage-detail.png"), "image/png"),
  SCREEN_TERMINE: b64(path.join(root, "public/screens/termine.png"), "image/png"),
  SCREEN_ANGEBOTE: b64(path.join(root, "public/screens/angebote.png"), "image/png"),
  SCREEN_BERICHTE: b64(path.join(root, "public/screens/berichte.png"), "image/png"),
  SCREEN_UEBERSICHT: b64(path.join(root, "public/screens/uebersicht.png"), "image/png"),
};
for (const [k, v] of Object.entries(parts)) html = html.split(`/*__${k}__*/`).join(v).split(`{{${k}}}`).join(v);
const out = path.resolve(root, "../landing-preview.html");
writeFileSync(out, html);
console.log("geschrieben:", out, (readFileSync(out).length / 1e6).toFixed(1), "MB");
