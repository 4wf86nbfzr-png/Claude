import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(here, 'src/renderer'),
  // Electron loads the built renderer over file://, so assets must be relative.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(here, 'src/shared'),
    },
  },
  build: {
    outDir: resolve(here, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome130',
    sourcemap: true,
  },
  server: {
    port: 5273,
    strictPort: true,
  },
});
