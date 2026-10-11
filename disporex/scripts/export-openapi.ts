import { writeFileSync, mkdirSync } from "node:fs";
import { buildOpenApi } from "../src/server/api/openapi";

mkdirSync("docs", { recursive: true });
const doc = buildOpenApi(process.env.APP_URL ?? "https://disporex.example");
writeFileSync("docs/openapi.json", JSON.stringify(doc, null, 2));
console.log(`docs/openapi.json geschrieben (${Object.keys(doc.paths ?? {}).length} Pfade).`);
