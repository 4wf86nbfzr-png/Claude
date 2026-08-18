import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Das Preload-Skript läuft in der Sandbox und kann dort keine weiteren
 * Dateien nachladen. Es wird deshalb zu einer einzigen CommonJS-Datei
 * gebündelt – nur `electron` bleibt außen vor, das stellt die Laufzeit.
 */
export default defineConfig({
  build: {
    outDir: resolve(import.meta.dirname, 'dist/main/preload'),
    emptyOutDir: true,
    minify: false,
    target: 'node20',
    lib: {
      entry: resolve(import.meta.dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: ['electron']
    }
  }
});
