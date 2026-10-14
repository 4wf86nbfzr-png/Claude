// Baut werkpilot/clairify-prototyp.html: die komplette Software als klickbarer Prototyp in einer Datei.
// Daten liegen im Browser (localStorage), Einordnung und Entwürfe regelbasiert wie der Mock-Anbieter des Backends.
// Aufruf aus frontend/: node tools/prototyp/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../..");
const b64 = (p, mime) => `data:${mime};base64,${readFileSync(p).toString("base64")}`;
let html = readFileSync(path.join(here, "template.html"), "utf8");
const parts = {
  FONT_BODY: b64(path.join(root, "public/fonts/inter-latin.woff2"), "font/woff2"),
  FONT_DISPLAY: b64(path.join(root, "public/fonts/anton-latin.woff2"), "font/woff2"),
  WISSEN: JSON.stringify(JSON.parse(readFileSync(path.join(root, "../backend/app/services/assistant_wissen.json"), "utf8")).themen),
};
for (const [k, v] of Object.entries(parts)) html = html.split(`{{${k}}}`).join(v);
const out = path.resolve(root, "../clairify-prototyp.html");
writeFileSync(out, html);
console.log("geschrieben:", out, (readFileSync(out).length / 1e6).toFixed(2), "MB");
