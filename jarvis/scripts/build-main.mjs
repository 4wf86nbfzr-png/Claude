#!/usr/bin/env node
/**
 * Bundles the Electron main process and the preload script.
 *
 * Both are emitted as CommonJS (.cjs) because that is the format Electron
 * loads most predictably across versions, and because the preload script runs
 * in a sandboxed context that does not support ESM.
 *
 * Runtime dependencies stay external: they are resolved from node_modules at
 * runtime, which keeps native/dynamic requires (imapflow, nodemailer) intact
 * and lets electron-builder do its usual dependency pruning.
 */
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const external = ['electron', ...Object.keys(pkg.dependencies ?? {})];

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  external,
  logOverride: {
    // src/core/db/database.ts falls back to `import.meta.url` only when
    // `__filename` is absent (the ESM test run). In this CJS bundle the
    // `__filename` branch always wins, so the empty import.meta is unreachable.
    'empty-import-meta': 'silent',
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  alias: {
    '@shared': resolve(root, 'src/shared'),
    '@core': resolve(root, 'src/core'),
  },
};

const targets = [
  { entryPoints: [resolve(root, 'src/main/index.ts')], outfile: resolve(root, 'dist/main/index.cjs') },
  { entryPoints: [resolve(root, 'src/main/preload.ts')], outfile: resolve(root, 'dist/main/preload.cjs') },
];

if (watch) {
  const { context } = await import('esbuild');
  for (const target of targets) {
    const ctx = await context({ ...common, ...target });
    await ctx.watch();
  }
  console.log('[build:main] watching…');
} else {
  await Promise.all(targets.map((target) => build({ ...common, ...target })));
  console.log('[build:main] done');
}
