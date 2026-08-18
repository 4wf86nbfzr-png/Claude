import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Der Renderer wird als reine Web-App gebaut (kein Node-Zugriff).
// Alles, was Node braucht, läuft im Main-Prozess und ist nur über
// die schmale, im Preload definierte IPC-Brücke erreichbar.
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, 'src/shared') }
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome130'
  },
  server: { port: 5273, strictPort: true }
});
