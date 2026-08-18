#!/usr/bin/env node
/**
 * Development runner: starts the Vite dev server for the renderer, builds the
 * main process in watch mode and launches Electron pointing at the dev server.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

process.env.NODE_ENV = 'development';

const server = await createServer({ configFile: resolve(root, 'vite.config.ts') });
await server.listen();
const address = server.resolvedUrls?.local?.[0];
if (!address) {
  console.error('[dev] Vite did not report a local URL.');
  process.exit(1);
}
console.log(`[dev] renderer on ${address}`);

// Build main + preload once, then keep rebuilding on change.
await run(process.execPath, [resolve(here, 'build-main.mjs')]);
const watcher = spawn(process.execPath, [resolve(here, 'build-main.mjs'), '--watch'], {
  cwd: root,
  stdio: 'inherit',
});

const electronBin = (await import('electron')).default;
const app = spawn(electronBin, [root], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, JARVIS_DEV_SERVER_URL: address },
});

app.on('close', async (code) => {
  watcher.kill();
  await server.close();
  process.exit(code ?? 0);
});

function run(cmd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit' });
    child.on('close', (code) =>
      code === 0 ? resolvePromise(undefined) : rejectPromise(new Error(`${cmd} exited with ${code}`)),
    );
  });
}
