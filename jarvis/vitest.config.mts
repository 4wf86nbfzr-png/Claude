import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@core': resolve(import.meta.dirname, 'src/core')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    // node:sqlite ist in Node 22 noch als experimentell markiert und
    // schreibt sonst bei jedem Test eine Warnung ins Protokoll.
    silent: false
  }
});
