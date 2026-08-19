import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Das Ergebnis landet direkt im Desktop-Paket, damit electron-builder es
 * mitnimmt. `base: './'` ist noetig, weil Electron die Datei ueber file://
 * laedt -- mit absoluten Pfaden faende der Browser nichts.
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: resolve(__dirname, '../desktop/renderer'),
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@jarvis/core/ipc': resolve(__dirname, '../core/src/ipc/contract.ts'),
      '@jarvis/core/schnips': resolve(__dirname, '../core/src/voice/schnips.ts'),
      '@jarvis/core/segmente': resolve(__dirname, '../core/src/voice/segmente.ts'),
      '@jarvis/core/nachhall': resolve(__dirname, '../core/src/voice/nachhall.ts'),
      '@jarvis/core/stimmwahl': resolve(__dirname, '../core/src/voice/stimmwahl.ts'),
    },
  },
});
