/**
 * Baut Hauptprozess und Vorlade-Skript mit esbuild.
 *
 * Beide werden nach CommonJS gebaendelt: Electron laedt den Hauptprozess so
 * ohne ESM-Sonderregeln, und ein Vorlade-Skript muss im Sandkasten ohnehin
 * CJS sein. `better-sqlite3` bleibt aussen vor -- das ist ein natives Modul
 * und wird zur Laufzeit aus node_modules geladen.
 */
import { build, context } from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(here, 'dist');
const watch = process.argv.includes('--watch');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

/** @type {import('esbuild').BuildOptions} */
const gemeinsam = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
  external: ['electron', 'better-sqlite3', 'imapflow', 'mailparser', 'nodemailer'],
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
};

const ziele = [
  { entryPoints: [resolve(here, 'src/main.ts')], outfile: resolve(outdir, 'main.cjs') },
  { entryPoints: [resolve(here, 'src/preload.ts')], outfile: resolve(outdir, 'preload.cjs') },
];

if (watch) {
  for (const ziel of ziele) {
    const ctx = await context({ ...gemeinsam, ...ziel });
    await ctx.watch();
  }
  console.log('[desktop] Beobachte Änderungen …');
} else {
  await Promise.all(ziele.map((ziel) => build({ ...gemeinsam, ...ziel })));
  console.log('[desktop] Hauptprozess und Vorlade-Skript gebaut.');
}
