import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Flat Config. eslint-config-next ab Version 16 exportiert die Regelsaetze
 * bereits als Flat-Config-Array — der Umweg ueber FlatCompat entfaellt.
 */
export default [
  ...next,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "*.mjs", "public/**"] },
];
