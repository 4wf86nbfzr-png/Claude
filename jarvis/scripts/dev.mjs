#!/usr/bin/env node
/**
 * Entwicklungsstart: Vite für die Oberfläche, tsc für den Kern, dann Electron.
 * Beendet sich sauber, wenn eines der Teile stirbt.
 */
import { spawn } from 'node:child_process';
import { setTimeout as warte } from 'node:timers/promises';

const PORT = 5273;
const URL_DEV = `http://localhost:${PORT}`;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const kinder = [];

function starte(befehl, argumente, optionen = {}) {
  const kind = spawn(befehl, argumente, { stdio: 'inherit', ...optionen });
  kinder.push(kind);
  return kind;
}

function beende(code = 0) {
  for (const kind of kinder) {
    if (!kind.killed) kind.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => beende(0));
process.on('SIGTERM', () => beende(0));

async function warteAufServer() {
  for (let versuch = 0; versuch < 60; versuch++) {
    try {
      const antwort = await fetch(URL_DEV);
      if (antwort.ok) return true;
    } catch {
      // Server startet noch.
    }
    await warte(500);
  }
  return false;
}

console.log('› Oberfläche wird gestartet …');
starte(npx, ['vite', '--port', String(PORT), '--strictPort']);

console.log('› Kern und Preload werden übersetzt …');
await new Promise((resolve, reject) => {
  const kind = spawn(npx, ['tsc', '-p', 'tsconfig.node.json'], { stdio: 'inherit' });
  kind.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tsc endete mit ${code}`))));
});
await new Promise((resolve, reject) => {
  const kind = spawn(npx, ['vite', 'build', '--config', 'vite.preload.config.mts'], { stdio: 'inherit' });
  kind.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Preload-Bau endete mit ${code}`))));
});

if (!(await warteAufServer())) {
  console.error('Die Oberfläche ist nicht erreichbar geworden.');
  beende(1);
}

console.log('› JARVIS wird geöffnet …');
const electron = starte(npx, ['electron', '.'], {
  env: { ...process.env, JARVIS_DEV_SERVER: URL_DEV }
});
electron.on('exit', (code) => beende(code ?? 0));
