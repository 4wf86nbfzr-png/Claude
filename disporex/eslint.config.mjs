import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "node_modules/**", "storage/**", "playwright-report/**", "test-results/**", "drizzle/**"]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Server Components laufen einmal pro Request; Date.now() ist dort legitim (aktuelle Uhrzeit, Fristen).
    files: ["src/app/**/page.tsx", "src/app/**/layout.tsx", "src/components/layout/**/*.tsx"],
    rules: { "react-hooks/purity": "off" },
  },
]);
